package com.dactor.patient.service

import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.dactor.patient.data.local.UserSessionManager
import com.dactor.patient.data.model.Appointment
import com.dactor.patient.data.model.DactorNotification
import com.dactor.patient.data.model.NotificationTemplate
import com.dactor.patient.data.model.NotificationTemplateData
import com.dactor.patient.data.model.NotificationType
import com.dactor.patient.data.model.QueueEntry
import com.dactor.patient.di.AppModule
import io.github.jan.supabase.postgrest.postgrest
import io.github.jan.supabase.postgrest.query.Order
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.time.LocalDate

class NotificationSyncWorker(
    private val context: Context,
    params: WorkerParameters
) : CoroutineWorker(context, params) {

    override suspend fun doWork(): Result = withContext(Dispatchers.IO) {
        try {
            // Clean up any lingering watchdog notification
            try {
                val nm = context.getSystemService(android.content.Context.NOTIFICATION_SERVICE) as? android.app.NotificationManager
                nm?.cancel(99101)
            } catch (_: Exception) {}

            val sessionManager = UserSessionManager(context)
            val client = AppModule.provideSupabaseClient()
            val userId = sessionManager.getSavedPatientId()
            val savedEmail = sessionManager.getSavedEmail()?.trim()?.lowercase()
            val savedPhone = sessionManager.getSavedPhone()?.filter { it.isDigit() }?.takeLast(10)
            val savedCodes = sessionManager.getSavedTrackingCodes().map { it.first.trim() }.filter { it.isNotBlank() }
            val resolvedIds = savedCodes.toMutableSet()
            val myAppointments = mutableListOf<Appointment>()

            try {
                if (!userId.isNullOrBlank()) {
                    val byUid = client.postgrest["appointments"]
                        .select { filter { eq("user_id", userId) } }
                        .decodeList<Appointment>()
                    myAppointments.addAll(byUid)
                }
                if (savedCodes.isNotEmpty()) {
                    val byCodes = client.postgrest["appointments"]
                        .select { filter { isIn("tracking_code_10_digit", savedCodes) } }
                        .decodeList<Appointment>()
                    for (appt in byCodes) {
                        if (myAppointments.none { it.id == appt.id }) myAppointments.add(appt)
                    }
                }
                if (!savedPhone.isNullOrBlank()) {
                    val byPhone = client.postgrest["appointments"]
                        .select { filter { eq("patient_mobile", savedPhone) } }
                        .decodeList<Appointment>()
                    for (appt in byPhone) {
                        if (myAppointments.none { it.id == appt.id }) myAppointments.add(appt)
                    }
                }
                for (appt in myAppointments) {
                    if (appt.id.isNotBlank()) resolvedIds.add(appt.id)
                    if (appt.trackingCode10Digit.isNotBlank()) resolvedIds.add(appt.trackingCode10Digit)
                }
            } catch (_: Exception) {}

            // Cancel any notifications for already completed appointments
            for (appt in myAppointments) {
                if (appt.checkinStatus.lowercase() in listOf("completed", "done", "cancelled")) {
                    NotificationHelper.cancelAppointmentNotifications(context, appt.id)
                    if (appt.trackingCode10Digit.isNotBlank()) {
                        NotificationHelper.cancelAppointmentNotifications(context, appt.trackingCode10Digit)
                    }
                }
            }

            // Automatic today appointment & queue alerts
            val todayStr = LocalDate.now().toString()
            val todayCandidateAppts = myAppointments.filter {
                it.appointmentDate.trim().take(10) == todayStr &&
                it.checkinStatus.lowercase() !in listOf("completed", "done", "cancelled")
            }
            if (todayCandidateAppts.isNotEmpty()) {
                val apptIds = todayCandidateAppts.map { it.id }
                val queueEntries = try {
                    client.postgrest["queue_entries"]
                        .select { filter { isIn("appointment_id", apptIds) } }
                        .decodeList<QueueEntry>()
                } catch (_: Exception) {
                    try {
                        client.postgrest["live_queue"]
                            .select()
                            .decodeList<QueueEntry>()
                    } catch (_: Exception) { emptyList() }
                }

                for (appt in todayCandidateAppts) {
                    val code = appt.trackingCode10Digit.ifBlank { appt.id.take(10) }
                    val qEntry = queueEntries.firstOrNull { it.appointmentId == appt.id }
                    val isDone = qEntry?.status?.lowercase() in listOf("done", "completed", "cancelled")
                    if (isDone) {
                        NotificationHelper.cancelAppointmentNotifications(context, appt.id)
                        NotificationHelper.cancelAppointmentNotifications(context, code)
                        continue
                    }
                    if (qEntry == null || qEntry.status != "waiting") {
                        continue
                    }
                    val slotTime = appt.appointmentTime.take(5).ifBlank { "Today" }
                    val qPos = qEntry.queuePosition

                    // Late patient check: if doctor has called another patient with higher position inside
                    val isPatientLate = queueEntries.any { it.status == "inside" && it.queuePosition > qPos }
                    if (isPatientLate) {
                        val alreadySentLate = sessionManager.isLateAlertTriggered(appt.id)
                        if (!alreadySentLate) {
                            sessionManager.markLateAlertTriggered(appt.id)
                            val notifId = (appt.id.hashCode() and 0x7FFFFFFF) % 100000
                            NotificationHelper.showSystemNotification(
                                context = context,
                                id = notifId,
                                title = "⚠️ Arrive Soon, You Are Late!",
                                message = "Dear ${appt.patientName}, your turn was reached, but you haven't arrived. Another patient has been called inside. Please proceed to the clinic immediately.",
                                appointmentId = appt.id,
                                type = NotificationType.ARRIVE_SOON.key
                            )
                        }
                        continue
                    }

                    val estWait = if (qPos <= 1) "Next in Line" else "~${(qPos - 1) * 10} mins"

                    val autoApptKey = "auto_appt_today_${appt.id}"
                    if (appt.checkinStatus in listOf("waiting", "checked_in") && !sessionManager.isNotificationSeen(autoApptKey)) {
                        sessionManager.markNotificationSeen(autoApptKey)
                        val msg = NotificationTemplate.AppointmentReminder.buildMessage(
                            patientName = appt.patientName,
                            code = code,
                            slotTime = slotTime,
                            estWait = estWait
                        )
                        NotificationHelper.showSystemNotification(
                            context = context,
                            id = (autoApptKey.hashCode() and 0x7FFFFFFF) % 100000,
                            title = NotificationTemplate.AppointmentReminder.buildTitle(code),
                            message = msg,
                            appointmentId = code,
                            type = NotificationType.QUEUE_ALERT.key
                        )
                    }

                    // Background two-ahead queue alert guarantee
                    val liveAhead = if (qPos > 0) qPos - 1 else 0
                    val alreadySentTwoAhead = sessionManager.isTwoAheadAlertTriggered(appt.id)
                    if (appt.checkinStatus in listOf("waiting", "checked_in") && liveAhead in 0..2 && !alreadySentTwoAhead) {
                        sessionManager.markTwoAheadAlertTriggered(appt.id)
                        val alertTitle = if (liveAhead == 0) "You're Next!" else "Almost Your Turn!"
                        val alertMsg = if (liveAhead == 0) {
                            "Dear ${appt.patientName}, you are next in line. Please proceed to the consultation area."
                        } else {
                            "Dear ${appt.patientName}, only $liveAhead patient${if (liveAhead > 1) "s" else ""} ahead of you. Please be ready."
                        }
                        val notifId = (appt.id.hashCode() and 0x7FFFFFFF) % 100000
                        NotificationHelper.showSystemNotification(
                            context = context,
                            id = notifId,
                            title = alertTitle,
                            message = alertMsg,
                            appointmentId = appt.id,
                            type = NotificationType.ARRIVE_SOON.key
                        )
                    }
                }
            }

                val list = try {
                    client.postgrest["notifications"]
                        .select {
                            order("created_at", Order.DESCENDING)
                            limit(50)
                        }
                        .decodeList<DactorNotification>()
                } catch (_: Exception) {
                    emptyList()
                }

                val patientClinicIds = myAppointments.mapNotNull { it.clinicId.takeIf { c -> c.isNotBlank() } }.toSet()
                val relevant = list.filter { notif ->
                    val audience = notif.targetAudience?.lowercase()
                    val notifType = notif.type.lowercase()
                    val isTargetedType = notifType in listOf(
                        "manual_alert", "queue_alert", "lab_report", "clinic_break", "early_arrival",
                        "doctor_not_arrived", "doctor_delayed", "wait_few_minutes", "arrive_soon",
                        "doctor_arrival", "doctor_status", "doctor_presence", "turn_call"
                    )
                    val matchesClinicBroadcast = (notifType == "clinic_broadcast" || audience?.startsWith("clinic_") == true) &&
                        (patientClinicIds.isEmpty() || patientClinicIds.any { cid -> audience == "clinic_$cid" || notif.message.contains(cid) })
                    val isGeneralBroadcast = (audience in listOf("all_users", "patients", null) || notifType in listOf("broadcast", "announcement", "clinic_broadcast")) &&
                        !isTargetedType
                    val isBroadcast = isGeneralBroadcast || matchesClinicBroadcast
                    val isUserSpecific = (!userId.isNullOrBlank() && notif.userId == userId)
                    val metaCode = notif.toTemplateData().trackingCode
                    val matchesSavedCode = resolvedIds.isNotEmpty() && (
                        (notif.appointmentId != null && (resolvedIds.contains(notif.appointmentId) || resolvedIds.any { code -> notif.appointmentId.contains(code) })) ||
                        (!metaCode.isNullOrBlank() && resolvedIds.contains(metaCode)) ||
                        resolvedIds.any { code -> code.length >= 8 && (notif.message.contains(code) || notif.title.contains(code)) }
                    )
                    val isAppointmentSpecific = matchesSavedCode
                    val isTargetedAlert = isTargetedType && (isUserSpecific || isAppointmentSpecific)

                    isBroadcast || isUserSpecific || isAppointmentSpecific || isTargetedAlert
                }

                for (notif in relevant) {
                    if (!sessionManager.isNotificationSeen(notif.id)) {
                        // General broadcasts (all_users / patients / broadcast type) must ALWAYS reach every patient
                        // regardless of whether they have an active appointment today.
                        val notifAudience = notif.targetAudience?.lowercase()
                        val notifTypeLower = notif.type.lowercase()
                        val isGeneralBroadcast = notifAudience in listOf("all_users", "patients", null) ||
                            notifTypeLower in listOf("broadcast", "announcement")

                        // Check whether the notification targets a completed/finished appointment
                        val matchedAppt = myAppointments.find { appt ->
                            (notif.appointmentId != null && (appt.id == notif.appointmentId || appt.trackingCode10Digit == notif.appointmentId)) ||
                            (notif.toTemplateData().trackingCode?.isNotBlank() == true && (appt.id == notif.toTemplateData().trackingCode || appt.trackingCode10Digit == notif.toTemplateData().trackingCode))
                        }
                        val isMatchedFinished = matchedAppt != null && matchedAppt.checkinStatus.lowercase() in listOf("done", "completed", "cancelled", "finished")

                        // Lab reports and invoices/bills can still be delivered even if appointment is completed
                        val isReportOrBill = notif.type in listOf("lab_report", "report_prepared", "billing_invoice", "payment_receipt") ||
                            notif.title.contains("report", ignoreCase = true) ||
                            notif.title.contains("bill", ignoreCase = true) ||
                            notif.title.contains("receipt", ignoreCase = true)

                        // If the appointment is already finished and this is not a report/bill/broadcast, suppress and mark seen
                        if (isMatchedFinished && !isReportOrBill && !isGeneralBroadcast) {
                            sessionManager.markNotificationSeen(notif.id)
                            continue
                        }

                        // Queue alerts, arrival calls, doctor presence, clinic breaks, and "come to clinic" calls require an active queue appointment.
                        // IMPORTANT: General admin broadcasts (all_users / patients) MUST bypass this gate \u2014 they should reach
                        // every patient regardless of appointment status.
                        val isQueueOrArrivalAlert = !isGeneralBroadcast && (
                            notif.type in listOf(
                                "doctor_arrival", "doctor_presence", "clinic_break", "doctor_status",
                                "manual_alert", "queue_alert", "early_arrival", "turn_call", "urgent_call",
                                "doctor_not_arrived", "doctor_delayed", "wait_few_minutes", "arrive_soon"
                            ) || notif.title.contains("doctor", ignoreCase = true)
                              || notif.title.contains("clinic", ignoreCase = true)
                              || notif.title.contains("queue", ignoreCase = true)
                              || notif.title.contains("turn", ignoreCase = true)
                              || notif.title.contains("come", ignoreCase = true)
                              || notif.title.contains("arrive", ignoreCase = true)
                              || notif.message.contains("come to", ignoreCase = true)
                              || notif.message.contains("arrive", ignoreCase = true)
                              || notif.message.contains("turn", ignoreCase = true)
                        )

                        if (isQueueOrArrivalAlert && !isReportOrBill) {
                            val effectiveMatched = matchedAppt ?: myAppointments.find { appt ->
                                savedCodes.contains(appt.id) || savedCodes.contains(appt.trackingCode10Digit)
                            }
                            if (effectiveMatched != null && effectiveMatched.appointmentDate.trim().take(10) != todayStr) {
                                sessionManager.markNotificationSeen(notif.id)
                                continue
                            }
                            val hasActiveLiveQueueAppt = myAppointments.any {
                                it.appointmentDate.trim().take(10) == todayStr &&
                                it.checkinStatus.lowercase() in listOf("waiting", "checked_in", "inside", "in_queue", "confirmed", "booked", "approved", "in_consultation")
                            }
                            val isSavedTrackingMatch = (resolvedIds.isNotEmpty() && notif.appointmentId != null && resolvedIds.contains(notif.appointmentId)) ||
                                (savedCodes.isNotEmpty() && (
                                    (notif.toTemplateData().trackingCode?.isNotBlank() == true && (savedCodes.contains(notif.toTemplateData().trackingCode) || resolvedIds.contains(notif.toTemplateData().trackingCode))) ||
                                    savedCodes.any { c -> c.length == 10 && (notif.message.contains(c) || notif.title.contains(c)) }
                                ))

                            if (!hasActiveLiveQueueAppt && !isSavedTrackingMatch) {
                                if (resolvedIds.isEmpty()) {
                                    sessionManager.markNotificationSeen(notif.id)
                                }
                                continue
                            }
                        }

                        val notifId = (notif.id.hashCode() and 0x7FFFFFFF) % 100000
                        NotificationHelper.showSystemNotification(
                            context = context,
                            id = notifId,
                            title = notif.title,
                            message = notif.message,
                            appointmentId = notif.appointmentId ?: notif.toTemplateData().trackingCode,
                            type = notif.type
                        )

                        // Fix premature seen-marking bug: mark seen ONLY AFTER successful match and display
                        sessionManager.markNotificationSeen(notif.id)
                    }
                }

            Result.success()
        } catch (e: Exception) {
            e.printStackTrace()
            Result.retry()
        }
    }
}

