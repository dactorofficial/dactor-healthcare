package com.dactor.patient

import android.content.Intent
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.lifecycle.lifecycleScope
import com.dactor.patient.data.local.RegistrationDraftManager
import com.dactor.patient.data.local.UserSessionManager
import com.dactor.patient.data.repository.*
import com.dactor.patient.service.NotificationHelper
import com.dactor.patient.ui.navigation.DactorNavHost
import com.google.firebase.messaging.FirebaseMessaging
import dagger.hilt.android.AndroidEntryPoint
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.realtime.PostgresAction
import io.github.jan.supabase.realtime.channel
import io.github.jan.supabase.realtime.postgresChangeFlow
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import javax.inject.Inject

@AndroidEntryPoint
class MainActivity : ComponentActivity() {

    @Inject lateinit var authRepository: AuthRepository
    @Inject lateinit var clinicRepository: ClinicRepository
    @Inject lateinit var doctorRepository: DoctorRepository
    @Inject lateinit var appointmentRepository: AppointmentRepository
    @Inject lateinit var queueRepository: QueueRepository
    @Inject lateinit var slotRepository: SlotRepository
    @Inject lateinit var labReportRepository: LabReportRepository
    @Inject lateinit var notificationRepository: NotificationRepository
    @Inject lateinit var draftManager: RegistrationDraftManager
    @Inject lateinit var sessionManager: UserSessionManager
    @Inject lateinit var supabaseClient: SupabaseClient
    @Inject lateinit var appUpdateRepository: AppUpdateRepository

    private val confirmedPaymentTrackingFlow = kotlinx.coroutines.flow.MutableStateFlow<String?>(null)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        handleDeepLink(intent)

        // 0. Closed-App Payment Recovery: If patient closed app while paying in Khalti/Fonepay/ConnectIPS/eSewa,
        // immediately reconcile active payment session on cold start!
        lifecycleScope.launch(Dispatchers.IO) {
            reconcileBackgroundPaymentSession()
        }

        // 1. Initialize Notification Channel for urgent doctor alerts
        NotificationHelper.createNotificationChannel(this)

        // 2. Request Android 13+ Notification Permission if required
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) != android.content.pm.PackageManager.PERMISSION_GRANTED) {
                requestPermissions(arrayOf(android.Manifest.permission.POST_NOTIFICATIONS), 101)
            }
        }

        // 3. Register Firebase Cloud Messaging, subscribe to topics, and upload token to Supabase fcm_tokens
        try {
            FirebaseMessaging.getInstance().token.addOnCompleteListener { task ->
                if (task.isSuccessful) {
                    val token = task.result
                    if (!token.isNullOrBlank()) {
                        sessionManager.saveFcmToken(token)
                        lifecycleScope.launch(Dispatchers.IO) {
                            try {
                                val userId = authRepository.getCurrentUser() ?: sessionManager.getSavedPatientId()
                                val phone = sessionManager.getSavedPhone()
                                val trackingCodes = sessionManager.getSavedTrackingCodes().map { it.first }
                                notificationRepository.uploadFcmToken(
                                    token = token,
                                    userId = userId,
                                    trackingCodes = trackingCodes,
                                    patientMobile = phone
                                )
                            } catch (e: Exception) {
                                e.printStackTrace()
                            }
                        }
                    }
                }
            }
            FirebaseMessaging.getInstance().subscribeToTopic("all_users")
            FirebaseMessaging.getInstance().subscribeToTopic("patients")
            FirebaseMessaging.getInstance().subscribeToTopic("patient_alerts")
            lifecycleScope.launch(Dispatchers.IO) {
                try {
                    val uid = authRepository.getCurrentUser() ?: sessionManager.getSavedPatientId()
                    val trackingCodes = sessionManager.getSavedTrackingCodes().map { it.first }
                    val phone = sessionManager.getSavedPhone()
                    val email = sessionManager.getSavedEmail()
                    val appts = appointmentRepository.getAllPatientAppointments(uid, email, phone, trackingCodes)
                    for (a in appts) {
                        val cId = a.clinicId.takeIf { it.isNotBlank() }
                        if (cId != null) {
                            FirebaseMessaging.getInstance().subscribeToTopic("clinic_$cId")
                        }
                    }
                } catch (_: Exception) {}
            }
        } catch (e: Exception) {
            e.printStackTrace()
        }

        // 4. Dismiss any lingering watchdog notifications
        try {
            val nm = getSystemService(android.content.Context.NOTIFICATION_SERVICE) as? android.app.NotificationManager
            nm?.cancel(99101)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                nm?.deleteNotificationChannel("dactor_background_sync")
            }
        } catch (ignored: Exception) {}

        // 5. Initial Cold-Start Check & Live Supabase Realtime WebSocket Subscription (<300ms)
        lifecycleScope.launch(Dispatchers.IO) {
            try {
                // Immediate check for cold start
                checkAndDispatchNotifications(isColdStart = true)
            } catch (e: Exception) {
                e.printStackTrace()
            }

            while (isActive) {
                var channel: io.github.jan.supabase.realtime.RealtimeChannel? = null
                try {
                    // WebSocket subscription to postgres changes on public.notifications
                    channel = supabaseClient.channel("patient_realtime_notifications")
                    val changeFlow = channel.postgresChangeFlow<PostgresAction>(schema = "public") {
                        table = "notifications"
                    }
                    channel.subscribe()

                    changeFlow.collect { action ->
                        if (action is PostgresAction.Insert || action is PostgresAction.Update) {
                            checkAndDispatchNotifications(isColdStart = false)
                        }
                    }
                } catch (e: Exception) {
                    if (!isActive) break
                    delay(5000L)
                } finally {
                    try {
                        channel?.unsubscribe()
                    } catch (_: Exception) {}
                }
            }
        }

        // 6. Lightweight Fallback Polling (Every 12s to ensure reliability even if WebSocket disconnects)
        lifecycleScope.launch(Dispatchers.IO) {
            // Give cold-start a brief head start before fallback polling begins
            delay(5000L)
            while (isActive) {
                try {
                    checkAndDispatchNotifications(isColdStart = false)
                } catch (e: Exception) {
                    e.printStackTrace()
                }
                delay(12000L)
            }
        }

        setContent {
            com.dactor.patient.ui.theme.DactorPatientTheme {
                androidx.compose.material3.Surface(
                    modifier = androidx.compose.ui.Modifier
                        .fillMaxSize()
                        .navigationBarsPadding(),
                    color = androidx.compose.material3.MaterialTheme.colorScheme.background
                ) {
                    com.dactor.patient.ui.components.NetworkConnectivityGate {
                        com.dactor.patient.ui.components.AppUpdateEnforcer(appUpdateRepository = appUpdateRepository)
                        com.dactor.patient.ui.components.NotificationPermissionEnforcer()
                        DactorNavHost(
                            authRepository = authRepository,
                            clinicRepository = clinicRepository,
                            doctorRepository = doctorRepository,
                            appointmentRepository = appointmentRepository,
                            queueRepository = queueRepository,
                            slotRepository = slotRepository,
                            labReportRepository = labReportRepository,
                            notificationRepository = notificationRepository,
                            draftManager = draftManager,
                            sessionManager = sessionManager,
                            confirmedPaymentTrackingFlow = confirmedPaymentTrackingFlow,
                            onConsumeConfirmedPayment = { confirmedPaymentTrackingFlow.value = null }
                        )
                    }
                }
            }
        }
    }

    private suspend fun checkAndDispatchNotifications(isColdStart: Boolean = false) {
        val userId = authRepository.getCurrentUser() ?: sessionManager.getSavedPatientId()
        val email = sessionManager.getSavedEmail()?.takeIf { it.isNotBlank() }
            ?: authRepository.getCurrentUserEmail()?.takeIf { it.isNotBlank() }
        val phone = sessionManager.getSavedPhone()?.takeIf { it.isNotBlank() }
        val savedCodes = sessionManager.getSavedTrackingCodes().map { it.first }
        val allIds = savedCodes.toMutableSet()

        var patientAppointments = emptyList<com.dactor.patient.data.model.Appointment>()
        try {
            patientAppointments = appointmentRepository.getAllPatientAppointments(
                userId = userId,
                email = email,
                phone = phone,
                trackingCodes = savedCodes
            )
            for (appt in patientAppointments) {
                if (appt.id.isNotBlank()) allIds.add(appt.id)
                if (appt.trackingCode10Digit.isNotBlank()) allIds.add(appt.trackingCode10Digit)
            }
        } catch (_: Exception) {}

        val notifs = notificationRepository.getNotifications(
            userId = userId,
            appointmentIds = allIds.toList()
        )

        val fifteenMinutesAgoMs = System.currentTimeMillis() - (15 * 60 * 1000L)

        for (notif in notifs) {
            val isSeen = sessionManager.isNotificationSeen(notif.id)
            if (isSeen) continue

            // Parse created timestamp to check if recent (< 15 mins)
            val createdEpochMs = try {
                if (notif.createdAt.isNotBlank()) {
                    java.time.Instant.parse(notif.createdAt).toEpochMilli()
                } else 0L
            } catch (_: Exception) {
                0L
            }
            val isCreatedRecently = createdEpochMs >= fifteenMinutesAgoMs

            // Cold-start handling: if unseen notification is older than 15 mins, silently mark seen
            if (isColdStart && !isCreatedRecently) {
                sessionManager.markNotificationSeen(notif.id)
                continue
            }

            // Check whether the notification targets a completed/finished appointment
            val templateData = notif.toTemplateData()
            val matchedAppt = patientAppointments.find { appt ->
                (notif.appointmentId != null && (appt.id == notif.appointmentId || appt.trackingCode10Digit == notif.appointmentId)) ||
                (templateData.trackingCode?.isNotBlank() == true && (appt.id == templateData.trackingCode || appt.trackingCode10Digit == templateData.trackingCode))
            }
            val isMatchedFinished = matchedAppt != null && matchedAppt.checkinStatus.lowercase() in listOf("done", "completed", "cancelled", "finished")

            // Lab reports and invoices/bills can still be delivered even if appointment is completed
            val isReportOrBill = notif.type in listOf("lab_report", "report_prepared", "billing_invoice", "payment_receipt") ||
                notif.title.contains("report", ignoreCase = true) ||
                notif.title.contains("bill", ignoreCase = true) ||
                notif.title.contains("receipt", ignoreCase = true)

            // If the appointment is already finished and this is not a report/bill, suppress it
            if (isMatchedFinished && !isReportOrBill) {
                sessionManager.markNotificationSeen(notif.id)
                continue
            }

            // Queue alerts, arrival calls, doctor presence, clinic breaks, and "come to clinic" calls require an active queue appointment
            val isQueueOrArrivalAlert = notif.type in listOf(
                "doctor_arrival", "doctor_presence", "clinic_break", "doctor_status",
                "manual_alert", "queue_alert", "early_arrival", "turn_call", "urgent_call"
            ) || notif.title.contains("doctor", ignoreCase = true)
              || notif.title.contains("clinic", ignoreCase = true)
              || notif.title.contains("queue", ignoreCase = true)
              || notif.title.contains("turn", ignoreCase = true)
              || notif.title.contains("come", ignoreCase = true)
              || notif.title.contains("arrive", ignoreCase = true)
              || notif.message.contains("come to", ignoreCase = true)
              || notif.message.contains("arrive", ignoreCase = true)
              || notif.message.contains("turn", ignoreCase = true)

            if (isQueueOrArrivalAlert && !isReportOrBill) {
                val isSavedTrackingMatch = savedCodes.isNotEmpty() && (
                    (notif.appointmentId != null && savedCodes.contains(notif.appointmentId)) ||
                    (templateData.trackingCode?.isNotBlank() == true && savedCodes.contains(templateData.trackingCode)) ||
                    savedCodes.any { c -> c.length == 10 && (notif.message.contains(c) || notif.title.contains(c)) }
                )

                val hasActiveQueueAppt = patientAppointments.any {
                    it.checkinStatus.lowercase() in listOf("waiting", "checked_in", "booked", "inside", "pending")
                }

                if (!hasActiveQueueAppt && !isSavedTrackingMatch) {
                    if (allIds.isEmpty()) {
                        sessionManager.markNotificationSeen(notif.id)
                    }
                    continue
                }
            }

            // All patient verification checks passed! Display heads-up system alert
            val notifId = (notif.id.hashCode() and 0x7FFFFFFF) % 100000
            NotificationHelper.showSystemNotification(
                context = this@MainActivity,
                id = notifId,
                title = notif.title.ifBlank { "Dactor Health Alert" },
                message = notif.message,
                appointmentId = notif.appointmentId ?: templateData.trackingCode,
                type = notif.type
            )

            // Fix premature "seen" marking bug: mark seen ONLY AFTER successful match and display
            sessionManager.markNotificationSeen(notif.id)
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        handleDeepLink(intent)
    }

    private suspend fun reconcileBackgroundPaymentSession(explicitAppointmentId: String? = null) {
        try {
            val activeSession = sessionManager.getActivePaymentSession()
            val targetApptId = explicitAppointmentId?.takeIf { it.isNotBlank() }
                ?: activeSession?.appointmentId?.takeIf { it.isNotBlank() }
                ?: return

            val status = try {
                appointmentRepository.refreshOnlinePayment(targetApptId)
            } catch (_: Exception) {
                null
            }
            val latest = try {
                appointmentRepository.getAppointmentById(targetApptId)
            } catch (_: Exception) {
                null
            }

            if (latest?.paymentStatus?.equals("paid", ignoreCase = true) == true ||
                status?.status?.equals("complete", ignoreCase = true) == true
            ) {
                val confirmed = latest ?: appointmentRepository.getAppointmentById(targetApptId)
                if (confirmed != null && confirmed.trackingCode10Digit.isNotBlank()) {
                    sessionManager.clearActivePaymentSession()
                    sessionManager.saveTrackingCode(
                        confirmed.trackingCode10Digit,
                        "${confirmed.patientName} \u2022 ${confirmed.appointmentDate}"
                    )
                    val clinicName = try {
                        clinicRepository.getClinicById(confirmed.clinicId)?.name
                    } catch (_: Exception) { null } ?: "Medical Clinic"
                    sessionManager.saveLastConfirmedAppointment(
                        appointmentId = confirmed.id,
                        trackingCode = confirmed.trackingCode10Digit,
                        clinicName = clinicName,
                        doctorName = "Consulting Specialist",
                        doctorSpecialty = "Consultation",
                        patientName = confirmed.patientName,
                        appointmentDate = confirmed.appointmentDate,
                        timeWindow = confirmed.appointmentTime
                    )
                    confirmedPaymentTrackingFlow.value = confirmed.trackingCode10Digit
                    checkAndDispatchNotifications(isColdStart = false)
                }
            } else if (
                latest?.checkinStatus?.equals("cancelled", ignoreCase = true) == true ||
                latest?.paymentStatus?.equals("failed", ignoreCase = true) == true ||
                status?.status?.equals("expired", ignoreCase = true) == true
            ) {
                sessionManager.clearActivePaymentSession()
            }
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    private fun handleDeepLink(intent: Intent?) {
        val uri = intent?.data ?: return
        lifecycleScope.launch(Dispatchers.IO) {
            try {
                // Handle online payment return deep link (eSewa / Khalti / Fonepay / ConnectIPS)
                if (uri.scheme.equals("dactor", ignoreCase = true) && uri.host.equals("payment-result", ignoreCase = true)) {
                    val apptIdParam = uri.getQueryParameter("appointmentId")
                    reconcileBackgroundPaymentSession(apptIdParam)
                    return@launch
                }

                val handled = authRepository.handleAuthCallback(uri)
                if (handled || uri.scheme.equals("dactor", ignoreCase = true) || uri.scheme.equals("dactorpatient", ignoreCase = true)) {
                    val draft = draftManager.getPatientDraft()
                    val userId = authRepository.getCurrentUser()
                    if (draft != null && !userId.isNullOrBlank()) {
                        authRepository.createPatientProfile(
                            userId = userId,
                            email = draft.email,
                            fullName = draft.fullName,
                            phone = draft.phone
                        )
                        draftManager.clearPatientDraft()
                    }
                }
            } catch (e: Exception) {
                e.printStackTrace()
            }
        }
    }
}
