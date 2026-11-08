package com.dactor.patient.service

import android.app.AlarmManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.os.SystemClock
import androidx.core.app.NotificationCompat
import com.dactor.patient.R
import com.dactor.patient.data.local.UserSessionManager
import com.dactor.patient.data.model.Appointment
import com.dactor.patient.data.model.DactorNotification
import com.dactor.patient.data.model.NotificationTemplate
import com.dactor.patient.data.model.NotificationTemplateData
import com.dactor.patient.data.model.NotificationType
import com.dactor.patient.data.model.QueueEntry
import com.dactor.patient.di.AppModule
import io.github.jan.supabase.postgrest.postgrest
import kotlinx.coroutines.*
import java.time.LocalDate

class NotificationWatchdogService : Service() {

    private val serviceJob = SupervisorJob()
    private val serviceScope = CoroutineScope(Dispatchers.IO + serviceJob)
    private var isPollingStarted = false

    companion object {
        private const val WATCHDOG_CHANNEL_ID = "dactor_background_sync"
        private const val WATCHDOG_NOTIF_ID = 99101
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        dismissAndStop()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        dismissAndStop()
        return START_NOT_STICKY
    }

    private fun dismissAndStop() {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                stopForeground(STOP_FOREGROUND_REMOVE)
            } else {
                @Suppress("DEPRECATION")
                stopForeground(true)
            }
            val nm = getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager
            nm?.cancel(WATCHDOG_NOTIF_ID)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                nm?.deleteNotificationChannel(WATCHDOG_CHANNEL_ID)
            }
        } catch (_: Exception) {}
        stopSelf()
    }

    override fun onTaskRemoved(rootIntent: Intent?) {
        super.onTaskRemoved(rootIntent)
        dismissAndStop()
    }

    private fun startPolling() {
        serviceScope.launch {
            val sessionManager = UserSessionManager(applicationContext)
            val client = AppModule.provideSupabaseClient()

            while (isActive) {
                try {
                    val userId = sessionManager.getSavedPatientId()
                    val savedEmail = sessionManager.getSavedEmail()?.trim()?.lowercase()
                    val savedPhone = sessionManager.getSavedPhone()?.filter { it.isDigit() }?.takeLast(10)
                    val savedCodes = sessionManager.getSavedTrackingCodes().map { it.first.trim() }.filter { it.isNotBlank() }
                    val resolvedIds = savedCodes.toMutableSet()
                    val myAppointments = mutableListOf<Appointment>()

                    try {
                        val allAppts = client.postgrest["appointments"]
                            .select()
                            .decodeList<Appointment>()
                        for (appt in allAppts) {
                            val matchesUser = !userId.isNullOrBlank() && appt.userId == userId
                            val matchesEmail = !savedEmail.isNullOrBlank() && appt.patientEmail?.trim()?.lowercase() == savedEmail
                            val apptPhone = appt.patientMobile.filter { it.isDigit() }.takeLast(10)
                            val matchesPhone = !savedPhone.isNullOrBlank() && savedPhone.length == 10 && apptPhone == savedPhone
                            val matchesCode = appt.id in resolvedIds || appt.trackingCode10Digit in resolvedIds
                            if (matchesUser || matchesEmail || matchesPhone || matchesCode) {
                                myAppointments.add(appt)
                                if (appt.id.isNotBlank()) resolvedIds.add(appt.id)
                                if (appt.trackingCode10Digit.isNotBlank()) resolvedIds.add(appt.trackingCode10Digit)
                            }
                        }
                    } catch (_: Exception) {}

                    // Cancel any notifications for already completed appointments
                    for (appt in myAppointments) {
                        if (appt.checkinStatus.lowercase() in listOf("completed", "done", "cancelled")) {
                            NotificationHelper.cancelAppointmentNotifications(applicationContext, appt.id)
                            if (appt.trackingCode10Digit.isNotBlank()) {
                                NotificationHelper.cancelAppointmentNotifications(applicationContext, appt.trackingCode10Digit)
                            }
                        }
                    }

                    // 1. Check Automatic Appointment, Live Queue & Lab Status Alerts (Works when app is closed)
                    val todayStr = LocalDate.now().toString()
                    val todayActiveAppts = myAppointments.filter {
                        it.appointmentDate.trim().take(10) == todayStr &&
                        it.checkinStatus.lowercase() !in listOf("completed", "done", "cancelled")
                    }
                    if (todayActiveAppts.isNotEmpty()) {
                        val apptIds = todayActiveAppts.map { it.id }
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

                        for (appt in todayActiveAppts) {
                            val code = appt.trackingCode10Digit.ifBlank { appt.id.take(10) }
                            val slotTime = appt.appointmentTime.take(5).ifBlank { "Today" }
                            val qEntry = queueEntries.firstOrNull { it.appointmentId == appt.id }
                            val isDone = qEntry?.status?.lowercase() in listOf("done", "completed", "cancelled")
                            if (isDone) {
                                NotificationHelper.cancelAppointmentNotifications(applicationContext, appt.id)
                                NotificationHelper.cancelAppointmentNotifications(applicationContext, code)
                                continue
                            }
                            val qPos = qEntry?.queuePosition ?: 1

                            // (a0) Automatic Late Patient Alert: if doctor has called another patient with higher position inside
                            val isPatientLate = queueEntries.any { it.status == "inside" && it.queuePosition > qPos }
                            if (isPatientLate && qEntry?.status == "waiting") {
                                val autoLateKey = "auto_late_${appt.id}"
                                if (!sessionManager.isNotificationSeen(autoLateKey)) {
                                    sessionManager.markNotificationSeen(autoLateKey)
                                    sessionManager.markLateAlertTriggered(appt.id)
                                    NotificationHelper.showSystemNotification(
                                        context = applicationContext,
                                        id = (autoLateKey.hashCode() and 0x7FFFFFFF) % 100000,
                                        title = "⚠️ Arrive Soon, You Are Late!",
                                        message = "Dear ${appt.patientName}, your turn was reached, but you haven't arrived. Another patient has been called inside. Please proceed to the clinic immediately.",
                                        appointmentId = code,
                                        type = NotificationType.ARRIVE_SOON.key
                                    )
                                }
                                continue
                            }

                            val estWait = if (qPos <= 1) "Next in Line" else "~${(qPos - 1) * 10} mins"

                            // (a) Automatic Appointment Confirmed / Today Reminder Alert
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
                                    context = applicationContext,
                                    id = (autoApptKey.hashCode() and 0x7FFFFFFF) % 100000,
                                    title = NotificationTemplate.AppointmentReminder.buildTitle(code),
                                    message = msg,
                                    appointmentId = code,
                                    type = NotificationType.QUEUE_ALERT.key
                                )
                            }

                            // (b) Automatic Live Queue Turn Approaching (Position 1 or 2)
                            if (qEntry != null && qEntry.status == "waiting" && qEntry.queuePosition in 1..2) {
                                val autoPosKey = "auto_qpos_${appt.id}_${qEntry.queuePosition}"
                                if (!sessionManager.isNotificationSeen(autoPosKey)) {
                                    sessionManager.markNotificationSeen(autoPosKey)
                                    val waitLabel = if (qEntry.queuePosition == 1) "Up Next (~5 mins)" else "~10-15 mins"
                                    val msg = NotificationTemplate.QueueApproaching.buildMessage(
                                        patientName = appt.patientName,
                                        code = code,
                                        queuePosition = qEntry.queuePosition,
                                        waitLabel = waitLabel
                                    )
                                    NotificationHelper.showSystemNotification(
                                        context = applicationContext,
                                        id = (autoPosKey.hashCode() and 0x7FFFFFFF) % 100000,
                                        title = NotificationTemplate.QueueApproaching.buildTitle(qEntry.queuePosition),
                                        message = msg,
                                        appointmentId = code,
                                        type = NotificationType.QUEUE_ALERT.key
                                    )
                                }
                            }

                            // (c) Automatic Doctor Calling Inside Alert
                            if (qEntry?.status == "inside" || appt.checkinStatus == "inside") {
                                val autoInsideKey = "auto_inside_${appt.id}"
                                if (!sessionManager.isNotificationSeen(autoInsideKey)) {
                                    sessionManager.markNotificationSeen(autoInsideKey)
                                    val msg = NotificationTemplate.DoctorCallingInside.buildMessage(
                                        patientName = appt.patientName,
                                        code = code,
                                        queuePosition = qEntry?.queuePosition ?: 1
                                    )
                                    NotificationHelper.showSystemNotification(
                                        context = applicationContext,
                                        id = (autoInsideKey.hashCode() and 0x7FFFFFFF) % 100000,
                                        title = NotificationTemplate.DoctorCallingInside.buildTitle(),
                                        message = msg,
                                        appointmentId = code,
                                        type = NotificationType.QUEUE_ALERT.key
                                    )
                                }
                            }

                            // (d) Automatic Lab Sample Collected / Report Prepared Alerts
                            if (appt.checkinStatus == "processing") {
                                val autoProcKey = "auto_lab_proc_${appt.id}"
                                if (!sessionManager.isNotificationSeen(autoProcKey)) {
                                    sessionManager.markNotificationSeen(autoProcKey)
                                    val msg = NotificationTemplate.LabProcessing.buildMessage(
                                        patientName = appt.patientName,
                                        code = code
                                    )
                                    NotificationHelper.showSystemNotification(
                                        context = applicationContext,
                                        id = (autoProcKey.hashCode() and 0x7FFFFFFF) % 100000,
                                        title = NotificationTemplate.LabProcessing.buildTitle(),
                                        message = msg,
                                        appointmentId = code,
                                        type = NotificationType.LAB_PROCESSING.key
                                    )
                                }
                            } else if (appt.checkinStatus == "prepared") {
                                val autoPrepKey = "auto_lab_prep_${appt.id}"
                                if (!sessionManager.isNotificationSeen(autoPrepKey)) {
                                    sessionManager.markNotificationSeen(autoPrepKey)
                                    val msg = NotificationTemplate.LabReportReady.buildMessage(
                                        patientName = appt.patientName,
                                        code = code
                                    )
                                    NotificationHelper.showSystemNotification(
                                        context = applicationContext,
                                        id = (autoPrepKey.hashCode() and 0x7FFFFFFF) % 100000,
                                        title = NotificationTemplate.LabReportReady.buildTitle(code),
                                        message = msg,
                                        appointmentId = code,
                                        type = NotificationType.LAB_REPORT.key
                                    )
                                }
                            }
                        }
                    }

                    // 2. Check Clinic-Side Notifications & Broadcasts in `notifications` table
                    val list = client.postgrest["notifications"]
                        .select()
                        .decodeList<DactorNotification>()
                        .sortedByDescending { it.createdAt }

                    val relevant = list.filter { notif ->
                        val audience = notif.targetAudience?.lowercase()
                        val isTargetedType = notif.type in listOf("manual_alert", "queue_alert", "lab_report", "clinic_break")
                        val isBroadcast = (audience == "all_users" || audience == "patients" || audience == null || notif.type == "broadcast") &&
                            !isTargetedType
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
                            sessionManager.markNotificationSeen(notif.id)

                            // Doctor notifications should only be given to patients in live queue / yet to get inside
                            val isDoctorNotif = notif.type in listOf("doctor_arrival", "doctor_presence", "clinic_break", "doctor_status") ||
                                notif.title.contains("doctor", ignoreCase = true) ||
                                notif.title.contains("break", ignoreCase = true) ||
                                notif.message.contains("doctor is", ignoreCase = true) ||
                                notif.message.contains("doctor has", ignoreCase = true) ||
                                notif.message.contains("clinic is currently on break", ignoreCase = true)

                            if (isDoctorNotif) {
                                val matchedAppt = myAppointments.find { appt ->
                                    (notif.appointmentId != null && (appt.id == notif.appointmentId || appt.trackingCode10Digit == notif.appointmentId)) ||
                                    (notif.toTemplateData().trackingCode?.isNotBlank() == true && (appt.id == notif.toTemplateData().trackingCode || appt.trackingCode10Digit == notif.toTemplateData().trackingCode))
                                }
                                val todayStr = LocalDate.now().toString()
                                if (matchedAppt != null && matchedAppt.appointmentDate.trim().take(10) != todayStr) {
                                    continue
                                }
                                val isMatchedCompleted = matchedAppt != null && matchedAppt.checkinStatus.lowercase() in listOf("done", "completed", "cancelled")
                                val hasActiveQueueAppt = myAppointments.any {
                                    it.appointmentDate.trim().take(10) == todayStr &&
                                    it.checkinStatus.lowercase() in listOf("waiting", "checked_in", "booked", "inside", "pending")
                                }

                                if (isMatchedCompleted || !hasActiveQueueAppt) {
                                    continue
                                }
                            }

                            val notifId = (notif.id.hashCode() and 0x7FFFFFFF) % 100000
                            NotificationHelper.showSystemNotification(
                                context = applicationContext,
                                id = notifId,
                                title = notif.title,
                                message = notif.message,
                                appointmentId = notif.appointmentId,
                                type = notif.type
                            )
                        }
                    }
                } catch (e: Exception) {
                    e.printStackTrace()
                }
                delay(5000L) // Poll every 5 seconds for real-time delivery even when app is closed
            }
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        serviceJob.cancel()
    }
}

