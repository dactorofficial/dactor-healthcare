package com.dactor.patient

import android.content.Intent
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.setValue
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
import io.github.jan.supabase.postgrest.query.filter.FilterOperator
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
    private val pendingTrackerAppointmentFlow = kotlinx.coroutines.flow.MutableStateFlow<String?>(null)
    private val pendingClinicIdFlow = kotlinx.coroutines.flow.MutableStateFlow<String?>(null)
    private var navHostControllerRef: androidx.navigation.NavHostController? = null

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
                                // Upload only when the token or what it is linked to changed
                                val uploadPrefs = getSharedPreferences("dactor_alert_planner", MODE_PRIVATE)
                                val signature = listOf(token, userId, phone, trackingCodes.sorted().joinToString(",")).joinToString("|")
                                if (uploadPrefs.getString("fcm_upload_signature", null) == signature) return@launch
                                notificationRepository.uploadFcmToken(
                                    token = token,
                                    userId = userId,
                                    trackingCodes = trackingCodes,
                                    patientMobile = phone
                                )
                                uploadPrefs.edit().putString("fcm_upload_signature", signature).apply()
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
                    // Set reminders, the appointment-window loop and the background check
                    com.dactor.patient.service.AppointmentAlarmPlanner.plan(this@MainActivity, appts)
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
                    // Only this user's rows; broadcasts arrive via FCM topics. Guests rely on FCM.
                    val realtimeUserId = authRepository.getCurrentUser() ?: sessionManager.getSavedPatientId()
                    if (realtimeUserId.isNullOrBlank()) break
                    channel = supabaseClient.channel("patient_realtime_notifications")
                    val changeFlow = channel.postgresChangeFlow<PostgresAction>(schema = "public") {
                        table = "notifications"
                        filter("user_id", FilterOperator.EQ, realtimeUserId)
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

        // 6. Optimized Dual Query Loop (10s on active appointment days, 2h on idle days)
        lifecycleScope.launch(Dispatchers.IO) {
            delay(5000L)
            while (isActive) {
                val nextDelayMs: Long = try {
                    checkAndDispatchNotifications(isColdStart = false)
                } catch (e: Exception) {
                    e.printStackTrace()
                    10_000L
                }
                delay(nextDelayMs)
            }
        }
        setContent {
            val navController = androidx.navigation.compose.rememberNavController()
            navHostControllerRef = navController

            val pendingTrackerApptId = pendingTrackerAppointmentFlow.collectAsState().value
            androidx.compose.runtime.LaunchedEffect(pendingTrackerApptId) {
                if (!pendingTrackerApptId.isNullOrBlank()) {
                    val targetRoute = com.dactor.patient.ui.navigation.NavRoutes.QueueStatus.createRoute(pendingTrackerApptId)
                    try {
                        navController.navigate(targetRoute) {
                            launchSingleTop = true
                        }
                    } catch (e: Exception) {
                        e.printStackTrace()
                    }
                    pendingTrackerAppointmentFlow.value = null
                }
            }

            var currentLanguage by androidx.compose.runtime.remember {
                androidx.compose.runtime.mutableStateOf(
                    com.dactor.patient.ui.i18n.AppLanguage.fromCode(sessionManager.getAppLanguage())
                )
            }
            var showFirstLaunchLanguagePrompt by androidx.compose.runtime.remember {
                androidx.compose.runtime.mutableStateOf(!sessionManager.hasChosenInitialLanguage())
            }

            val appStrings = if (currentLanguage == com.dactor.patient.ui.i18n.AppLanguage.NEPALI) {
                com.dactor.patient.ui.i18n.NepaliStrings
            } else {
                com.dactor.patient.ui.i18n.EnglishStrings
            }

            androidx.compose.runtime.CompositionLocalProvider(
                com.dactor.patient.ui.i18n.LocalAppStrings provides appStrings,
                com.dactor.patient.ui.i18n.LocalAppLanguage provides currentLanguage,
                com.dactor.patient.ui.i18n.LocalUpdateAppLanguage provides { newLang ->
                    sessionManager.setAppLanguage(newLang.code)
                    currentLanguage = newLang
                }
            ) {
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
                                navController = navController,
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
                                onConsumeConfirmedPayment = { confirmedPaymentTrackingFlow.value = null },
                                pendingClinicIdFlow = pendingClinicIdFlow,
                                onConsumePendingClinic = { pendingClinicIdFlow.value = null },
                                isOverlayBlockingHome = showFirstLaunchLanguagePrompt
                            )

                            if (showFirstLaunchLanguagePrompt) {
                                com.dactor.patient.ui.components.LanguageSelectionDialog(
                                    currentLanguage = currentLanguage,
                                    isFirstLaunch = true,
                                    onDismissRequest = { showFirstLaunchLanguagePrompt = false },
                                    onLanguageSelected = { chosenLang ->
                                        sessionManager.setAppLanguage(chosenLang.code)
                                        currentLanguage = chosenLang
                                        showFirstLaunchLanguagePrompt = false
                                    }
                                )
                            }
                        }
                    }
                }
            }
        }
    }

    private suspend fun checkAndDispatchNotifications(isColdStart: Boolean = false): Long {
        val userId = authRepository.getCurrentUser() ?: sessionManager.getSavedPatientId()
        val savedCodes = sessionManager.getSavedTrackingCodes().map { it.first }

        // If no patient ID is present in the mobile and no saved tracking codes, skip query and throttle to 2 hours
        if (userId.isNullOrBlank() && savedCodes.isEmpty()) {
            return 2 * 60 * 60 * 1000L // 2 hours
        }

        val email = sessionManager.getSavedEmail()?.takeIf { it.isNotBlank() }
            ?: authRepository.getCurrentUserEmail()?.takeIf { it.isNotBlank() }
        val phone = sessionManager.getSavedPhone()?.takeIf { it.isNotBlank() }
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

        // Check if patient has any appointment ongoing on the day of appointment
        val todayStr = try {
            java.time.LocalDate.now().toString()
        } catch (_: Exception) { "" }

        val hasOngoingAppointmentToday = patientAppointments.any { appt ->
            val apptDate = appt.appointmentDate.trim().take(10)
            val isToday = apptDate.isNotBlank() && apptDate == todayStr
            val isOngoing = appt.checkinStatus.lowercase() !in listOf("completed", "done", "cancelled", "rejected", "noshow", "no_show")
            isToday && isOngoing
        }

        val notifs = try {
            notificationRepository.getNotifications(
                userId = userId,
                appointmentIds = allIds.toList()
            )
        } catch (_: Exception) {
            emptyList()
        }

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

        return if (hasOngoingAppointmentToday) {
            10_000L // 10-second interval when patient has ongoing appointment on appointment day
        } else {
            2 * 60 * 60 * 1000L // 2-hour interval when no appointment is scheduled on that day
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
        // 1. Process trusted internal notification deep links with navigate_to == "tracker"
        if (intent != null) {
            val callerToken = intent.getStringExtra("internal_nav_token")
            val isTrustedInternalCaller =
                (!callerToken.isNullOrBlank() && callerToken == NotificationHelper.getInternalNavToken(this)) ||
                    callingActivity?.packageName == packageName
            val navigateTo = intent.getStringExtra("navigate_to")
            if (isTrustedInternalCaller && navigateTo.equals("tracker", ignoreCase = true)) {
                val rawAppointmentId = intent.getStringExtra("appointment_id")
                    ?: intent.getStringExtra("tracking_code")
                val appointmentId = rawAppointmentId?.trim()?.takeIf {
                    it.matches(Regex("^[A-Za-z0-9_-]{6,64}$"))
                }
                if (!appointmentId.isNullOrBlank()) {
                    val targetRoute = com.dactor.patient.ui.navigation.NavRoutes.QueueStatus.createRoute(appointmentId)
                    val activeNav = navHostControllerRef
                    if (activeNav != null) {
                        lifecycleScope.launch(Dispatchers.Main) {
                            try {
                                activeNav.navigate(targetRoute) {
                                    launchSingleTop = true
                                }
                            } catch (e: Exception) {
                                e.printStackTrace()
                            }
                        }
                    } else {
                        pendingTrackerAppointmentFlow.value = appointmentId
                    }
                }
            }
        }

        // 2. Process URI deep links
        val uri = intent?.data ?: return
        lifecycleScope.launch(Dispatchers.IO) {
            try {
                // Handle Clinic Share App Link (https://dactorofficial.github.io/?clinic=... or dactor://clinic?clinic=...)
                val isDactorWebHost = uri.scheme.equals("https", ignoreCase = true) &&
                    uri.host.equals("dactorofficial.github.io", ignoreCase = true)
                val isClinicCustomScheme = uri.scheme.equals("dactor", ignoreCase = true) &&
                    uri.host.equals("clinic", ignoreCase = true)
                if (isDactorWebHost || isClinicCustomScheme) {
                    val sharedClinicId = (uri.getQueryParameter("clinic") ?: uri.getQueryParameter("id"))
                        ?.trim()
                        ?.takeIf { it.matches(Regex("^[A-Za-z0-9_-]{4,64}$")) }
                    if (!sharedClinicId.isNullOrBlank()) {
                        pendingClinicIdFlow.value = sharedClinicId
                        return@launch
                    }
                }

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
