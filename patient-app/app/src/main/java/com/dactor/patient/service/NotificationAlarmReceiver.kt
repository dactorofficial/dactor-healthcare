package com.dactor.patient.service

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.PowerManager
import com.dactor.patient.data.local.UserSessionManager
import com.dactor.patient.data.model.Appointment
import com.dactor.patient.data.model.DactorNotification
import com.dactor.patient.data.model.NotificationTemplate
import com.dactor.patient.data.model.NotificationType
import com.dactor.patient.data.model.QueueEntry
import com.dactor.patient.di.AppModule
import io.github.jan.supabase.postgrest.postgrest
import io.github.jan.supabase.postgrest.rpc
import io.github.jan.supabase.postgrest.query.Order
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import java.time.LocalDate

class NotificationAlarmReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent?) {
        if (intent?.action == ACTION_REMINDER) {
            val apptId = intent.getStringExtra(EXTRA_APPOINTMENT_ID)
            NotificationHelper.showSystemNotification(
                context = context,
                id = ((apptId + intent.data).hashCode() and 0x7FFFFFFF) % 100000,
                title = intent.getStringExtra(EXTRA_TITLE) ?: "Appointment reminder",
                message = intent.getStringExtra(EXTRA_MESSAGE) ?: "",
                appointmentId = apptId,
                type = NotificationType.ARRIVE_SOON.key
            )
            return
        }

        val powerManager = context.getSystemService(Context.POWER_SERVICE) as? PowerManager
        val wakeLock = powerManager?.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "dactor:AlarmSyncWakeLock")
        wakeLock?.acquire(60_000L) // 1 minute max lock

        // Most loop ticks: one small query per tracked appointment. The full check below
        // (all lookups + new notifications) runs at most every 10 minutes, on boot and on update.
        val tracked = if (intent?.action == ACTION_CHECK_ALERTS) AppointmentAlarmPlanner.loadTracked(context) else null
        if (!tracked.isNullOrEmpty() && !AppointmentAlarmPlanner.isFullCheckDue(context)) {
            val pendingLight = goAsync()
            CoroutineScope(Dispatchers.IO).launch {
                try {
                    runLightCheck(context, tracked)
                } catch (e: Exception) {
                    e.printStackTrace()
                    scheduleNextAlarm(context, RETRY_MS)
                } finally {
                    try { if (wakeLock?.isHeld == true) wakeLock.release() } catch (_: Exception) {}
                    pendingLight.finish()
                }
            }
            return
        }

        val pendingResult = goAsync()
        CoroutineScope(Dispatchers.IO).launch {
            try {
                val sessionManager = UserSessionManager(context)
                val client = AppModule.provideSupabaseClient()
                val userId = sessionManager.getSavedPatientId()
                val savedEmail = sessionManager.getSavedEmail()?.trim()?.lowercase()
                val savedPhone = sessionManager.getSavedPhone()?.filter { it.isDigit() }?.takeLast(10)
                val savedCodes = sessionManager.getSavedTrackingCodes().map { it.first.trim() }.filter { it.isNotBlank() }
                val resolvedIds = savedCodes.toMutableSet()
                val myAppointments = mutableListOf<Appointment>()
                val queueStatusById = mutableMapOf<String, String?>()
                var appointmentsLoaded = false

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
                    appointmentsLoaded = true
                } catch (_: Exception) {}

                // Evaluate background live queue for active appointments today (≤2 ahead alert guarantee)
                try {
                    // Cancel any notifications for already completed appointments
                    for (appt in myAppointments) {
                        if (appt.checkinStatus.lowercase() in listOf("completed", "done", "cancelled")) {
                            NotificationHelper.cancelAppointmentNotifications(context, appt.id)
                            if (appt.trackingCode10Digit.isNotBlank()) {
                                NotificationHelper.cancelAppointmentNotifications(context, appt.trackingCode10Digit)
                            }
                        }
                    }

                    val todayStr = LocalDate.now().toString()
                    val todayActiveAppts = myAppointments.filter {
                        it.appointmentDate.trim().take(10) == todayStr && it.checkinStatus.lowercase() !in listOf("completed", "done", "cancelled")
                    }
                    // Today's appointments plus recent ones whose lab report may still be pending
                    val recentIds = recentUnfinishedIds(myAppointments)
                    if (recentIds.isNotEmpty()) {
                        val apptIds = recentIds
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
                        queueEntries.forEach { queueStatusById[it.appointmentId] = it.status }

                        for (appt in todayActiveAppts) {
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

                            val liveAhead = if (qPos > 0) qPos - 1 else 0

                            val alreadySentTwoAhead = sessionManager.isTwoAheadAlertTriggered(appt.id)
                            if (liveAhead in 0..2 && !alreadySentTwoAhead) {
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
                } catch (_: Exception) {}

                // Only notifications created since the last check (usually none)
                val list = try {
                    val since = AppointmentAlarmPlanner.notificationsSince(context)
                    client.postgrest["notifications"]
                        .select {
                            filter { gt("created_at", since) }
                            order("created_at", Order.DESCENDING)
                            limit(50)
                        }
                        .decodeList<DactorNotification>()
                        .also { fetched -> AppointmentAlarmPlanner.rememberNotificationsSeenUpTo(context, fetched.map { it.createdAt }) }
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
                    val isActivationAlert = notif.type == "activation_alert" && (
                        isUserSpecific ||
                        (!savedEmail.isNullOrBlank() && (notif.message.contains(savedEmail, ignoreCase = true) || notif.title.contains(savedEmail, ignoreCase = true)))
                    )

                    isBroadcast || isUserSpecific || isAppointmentSpecific || isTargetedAlert || isActivationAlert
                }

                for (notif in relevant) {
                    if (!sessionManager.isNotificationSeen(notif.id)) {
                        val isActivationAlert = notif.type == "activation_alert"

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

                        // Lab reports, invoices/bills, and administrative activation alerts can still be delivered even if appointment is completed
                        val isReportOrBill = notif.type in listOf("lab_report", "report_prepared", "billing_invoice", "payment_receipt") ||
                            notif.title.contains("report", ignoreCase = true) ||
                            notif.title.contains("bill", ignoreCase = true) ||
                            notif.title.contains("receipt", ignoreCase = true)

                        // If the appointment is already finished and this is not a report/bill/activation/broadcast, suppress and mark seen
                        if (isMatchedFinished && !isReportOrBill && !isActivationAlert && !isGeneralBroadcast) {
                            sessionManager.markNotificationSeen(notif.id)
                            continue
                        }

                        // Queue alerts, arrival calls, doctor presence, clinic breaks, and "come to clinic" calls require an active queue appointment.
                        // IMPORTANT: General admin broadcasts (all_users / patients) MUST bypass this gate \u2014 they should reach
                        // every patient regardless of appointment status. Previously, broadcasts containing words like
                        // "wait", "arrive", "clinic" were silently dropped when the app was closed with no active appointment.
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
                              || notif.title.contains("wait", ignoreCase = true)
                              || notif.message.contains("come to", ignoreCase = true)
                              || notif.message.contains("arrive", ignoreCase = true)
                              || notif.message.contains("wait", ignoreCase = true)
                              || notif.message.contains("turn", ignoreCase = true)
                        )

                        if (isQueueOrArrivalAlert && !isReportOrBill && !isActivationAlert) {
                            val todayStr = LocalDate.now().toString()

                            // If this alert matches an appointment that is NOT today, strictly suppress
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
                            title = notif.title.ifBlank { "Dactor Health Alert" },
                            message = notif.message,
                            appointmentId = notif.appointmentId ?: notif.toTemplateData().trackingCode,
                            type = notif.type
                        )

                        // Fix premature seen-marking bug: mark seen ONLY AFTER successful match and display
                        sessionManager.markNotificationSeen(notif.id)
                    }
                }

                // Decide when to check next (or stop) based on the appointment window
                if (appointmentsLoaded) {
                    AppointmentAlarmPlanner.markFullCheckDone(context)
                    AppointmentAlarmPlanner.plan(context, myAppointments, queueStatusById)
                } else {
                    scheduleNextAlarm(context, RETRY_MS)
                }
            } catch (e: Exception) {
                e.printStackTrace()
                scheduleNextAlarm(context, RETRY_MS)
            } finally {
                try {
                    if (wakeLock?.isHeld == true) {
                        wakeLock.release()
                    }
                } catch (_: Exception) {}
                pendingResult.finish()
            }
        }
    }

    @kotlinx.serialization.Serializable
    private data class QueueStatusParams(val p_tracking_code: String)

    @kotlinx.serialization.Serializable
    private data class QueueStatusRow(
        val checkin_status: String? = null,
        val queue_status: String? = null,
        val queue_position: Int = 0,
        val patients_ahead: Int = 0,
        val current_queue_position: Int = 0
    )

    /**
     * One get_public_queue_status call per tracked appointment: updates the loop schedule and
     * shows the backup "almost your turn" / "late" alerts if the server push did not arrive.
     */
    private suspend fun runLightCheck(context: Context, tracked: List<Appointment>) {
        val client = AppModule.provideSupabaseClient()
        val sessionManager = UserSessionManager(context)
        val today = LocalDate.now().toString()
        val earliest = LocalDate.now().minusDays(3).toString()
        val queueStatusById = mutableMapOf<String, String?>()
        val updated = tracked.map { appt ->
            val date = appt.appointmentDate.trim().take(10)
            val code = appt.trackingCode10Digit
            if (date < earliest || date > today || code.isBlank() ||
                appt.checkinStatus.lowercase() in listOf("completed", "done", "cancelled", "no_show")) {
                return@map appt
            }
            val row = client.postgrest.rpc("get_public_queue_status", QueueStatusParams(code))
                .decodeList<QueueStatusRow>().firstOrNull() ?: return@map appt
            queueStatusById[appt.id] = row.queue_status

            if (date == today && row.queue_status == "waiting" && row.queue_position > 0) {
                val notifId = (appt.id.hashCode() and 0x7FFFFFFF) % 100000
                val isLate = row.current_queue_position > row.queue_position
                if (isLate) {
                    if (!sessionManager.isLateAlertTriggered(appt.id)) {
                        sessionManager.markLateAlertTriggered(appt.id)
                        NotificationHelper.showSystemNotification(
                            context = context,
                            id = notifId,
                            title = "⚠️ Arrive Soon, You Are Late!",
                            message = "Dear ${appt.patientName}, your turn was reached, but you haven't arrived. Another patient has been called inside. Please proceed to the clinic immediately.",
                            appointmentId = appt.id,
                            type = NotificationType.ARRIVE_SOON.key
                        )
                    }
                } else if (row.patients_ahead in 0..2 && !sessionManager.isTwoAheadAlertTriggered(appt.id)) {
                    sessionManager.markTwoAheadAlertTriggered(appt.id)
                    val ahead = row.patients_ahead
                    NotificationHelper.showSystemNotification(
                        context = context,
                        id = notifId,
                        title = if (ahead == 0) "You're Next!" else "Almost Your Turn!",
                        message = if (ahead == 0) {
                            "Dear ${appt.patientName}, you are next in line. Please proceed to the consultation area."
                        } else {
                            "Dear ${appt.patientName}, only $ahead patient${if (ahead > 1) "s" else ""} ahead of you. Please be ready."
                        },
                        appointmentId = appt.id,
                        type = NotificationType.ARRIVE_SOON.key
                    )
                }
            }
            if (row.queue_status in listOf("done", "completed", "cancelled")) {
                NotificationHelper.cancelAppointmentNotifications(context, appt.id)
                NotificationHelper.cancelAppointmentNotifications(context, code)
            }
            row.checkin_status?.let { appt.copy(checkinStatus = it) } ?: appt
        }
        AppointmentAlarmPlanner.plan(context, updated, queueStatusById)
    }

    companion object {
        const val ACTION_CHECK_ALERTS = "com.dactor.patient.ACTION_CHECK_ALERTS"
        const val ACTION_REMINDER = "com.dactor.patient.ACTION_REMINDER"
        const val EXTRA_TITLE = "title"
        const val EXTRA_MESSAGE = "message"
        const val EXTRA_APPOINTMENT_ID = "appointment_id"
        const val ALARM_REQUEST_CODE = 10091
        private const val RETRY_MS = 5 * 60_000L

        /** Appointments from the last 3 days (or today) that are not finished or cancelled. */
        fun recentUnfinishedIds(appointments: List<Appointment>): List<String> {
            val earliest = LocalDate.now().minusDays(3).toString()
            val today = LocalDate.now().toString()
            return appointments.filter {
                val d = it.appointmentDate.trim().take(10)
                d in earliest..today && it.checkinStatus.lowercase() !in listOf("completed", "done", "cancelled", "no_show")
            }.map { it.id }
        }

        /** One-off check after [delayMillis] (used to retry when offline). */
        fun scheduleNextAlarm(context: Context, delayMillis: Long) {
            val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as? AlarmManager ?: return
            val intent = Intent(context, NotificationAlarmReceiver::class.java).apply {
                action = ACTION_CHECK_ALERTS
            }
            val pendingIntent = PendingIntent.getBroadcast(
                context,
                ALARM_REQUEST_CODE,
                intent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
            val triggerAtMillis = System.currentTimeMillis() + delayMillis
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && !alarmManager.canScheduleExactAlarms()) {
                        alarmManager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAtMillis, pendingIntent)
                    } else {
                        alarmManager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAtMillis, pendingIntent)
                    }
                } else {
                    alarmManager.setExact(AlarmManager.RTC_WAKEUP, triggerAtMillis, pendingIntent)
                }
            } catch (_: Exception) {
                try {
                    alarmManager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAtMillis, pendingIntent)
                } catch (_: Exception) {}
            }
        }
    }
}
