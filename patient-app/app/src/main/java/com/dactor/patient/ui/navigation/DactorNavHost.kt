package com.dactor.patient.ui.navigation

import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import com.dactor.patient.data.repository.*
import com.dactor.patient.ui.auth.LoginScreen
import com.dactor.patient.ui.auth.RegisterScreen
import com.dactor.patient.ui.booking.AppointmentConfirmedScreen
import com.dactor.patient.ui.booking.BookingFormScreen
import com.dactor.patient.ui.booking.BookingScreen
import com.dactor.patient.ui.booking.PaymentScreen
import com.dactor.patient.ui.discovery.ClinicDetailScreen
import com.dactor.patient.ui.discovery.DiscoveryScreen
import com.dactor.patient.ui.labreport.LabReportScreen
import com.dactor.patient.ui.notifications.NotificationsScreen
import com.dactor.patient.ui.profile.ProfileScreen
import com.dactor.patient.ui.tracker.QueueStatusScreen
import com.dactor.patient.ui.tracker.TrackingLookupScreen

import com.dactor.patient.ui.main.PatientMainScreen
import com.dactor.patient.ui.onboarding.OnboardingScreen

@Composable
fun DactorNavHost(
    authRepository: AuthRepository? = null,
    clinicRepository: ClinicRepository? = null,
    doctorRepository: DoctorRepository? = null,
    appointmentRepository: AppointmentRepository? = null,
    queueRepository: QueueRepository? = null,
    slotRepository: SlotRepository? = null,
    labReportRepository: LabReportRepository? = null,
    notificationRepository: NotificationRepository? = null,
    draftManager: com.dactor.patient.data.local.RegistrationDraftManager? = null,
    sessionManager: com.dactor.patient.data.local.UserSessionManager? = null,
    confirmedPaymentTrackingFlow: kotlinx.coroutines.flow.StateFlow<String?>? = null,
    onConsumeConfirmedPayment: (() -> Unit)? = null
) {
    val navController = rememberNavController()
    val observedConfirmedCode = confirmedPaymentTrackingFlow?.collectAsState()?.value

    androidx.compose.runtime.LaunchedEffect(observedConfirmedCode) {
        if (!observedConfirmedCode.isNullOrBlank()) {
            onConsumeConfirmedPayment?.invoke()
            navController.navigate(NavRoutes.AppointmentConfirmed.createRoute(observedConfirmedCode)) {
                popUpTo(NavRoutes.PatientMain.route) { inclusive = false }
                launchSingleTop = true
            }
        }
    }

    val activePaymentSession = sessionManager?.getActivePaymentSession()
    val isUserLoggedIn = sessionManager?.isLoggedIn() == true || (authRepository?.isLoggedIn() == true)
    val hasSeenOnboarding = sessionManager?.hasSeenOnboarding() == true
    val startDest = if (activePaymentSession != null) {
        NavRoutes.Payment.createRoute(activePaymentSession.appointmentId)
    } else if (isUserLoggedIn || hasSeenOnboarding) {
        NavRoutes.PatientMain.route
    } else {
        NavRoutes.Onboarding.route
    }

    NavHost(navController = navController, startDestination = startDest) {
        composable(NavRoutes.Onboarding.route) {
            OnboardingScreen(
                navController = navController,
                authRepository = authRepository,
                sessionManager = sessionManager,
                appointmentRepository = appointmentRepository
            )
        }
        composable(NavRoutes.Landing.route) {
            // Block old landing page completely: immediately redirect to PatientMain or Onboarding
            androidx.compose.runtime.LaunchedEffect(Unit) {
                val target = if (sessionManager?.hasSeenOnboarding() == true || isUserLoggedIn) {
                    NavRoutes.PatientMain.route
                } else {
                    NavRoutes.Onboarding.route
                }
                navController.navigate(target) {
                    popUpTo(0) { inclusive = true }
                    launchSingleTop = true
                }
            }
        }
        composable(NavRoutes.Login.route) { LoginScreen(navController, authRepository, draftManager, sessionManager, appointmentRepository) }
        composable(NavRoutes.Register.route) { RegisterScreen(navController, authRepository, draftManager, sessionManager) }
        composable(NavRoutes.Discovery.route) {
            PatientMainScreen(
                navController = navController,
                clinicRepository = clinicRepository,
                doctorRepository = doctorRepository,
                slotRepository = slotRepository,
                appointmentRepository = appointmentRepository,
                queueRepository = queueRepository,
                labReportRepository = labReportRepository,
                notificationRepository = notificationRepository,
                authRepository = authRepository,
                sessionManager = sessionManager,
                initialTab = 0
            )
        }
        composable(NavRoutes.PatientMain.route) {
            PatientMainScreen(
                navController = navController,
                clinicRepository = clinicRepository,
                doctorRepository = doctorRepository,
                slotRepository = slotRepository,
                appointmentRepository = appointmentRepository,
                queueRepository = queueRepository,
                labReportRepository = labReportRepository,
                notificationRepository = notificationRepository,
                authRepository = authRepository,
                sessionManager = sessionManager,
                initialTab = 0
            )
        }
        composable("patient_main?tab={tab}") { backStackEntry ->
            val tab = backStackEntry.arguments?.getString("tab")?.toIntOrNull() ?: 0
            PatientMainScreen(
                navController = navController,
                clinicRepository = clinicRepository,
                doctorRepository = doctorRepository,
                slotRepository = slotRepository,
                appointmentRepository = appointmentRepository,
                queueRepository = queueRepository,
                labReportRepository = labReportRepository,
                notificationRepository = notificationRepository,
                authRepository = authRepository,
                sessionManager = sessionManager,
                initialTab = tab
            )
        }
        composable(
            route = "search?date={date}&query={query}",
            arguments = listOf(
                androidx.navigation.navArgument("date") { defaultValue = ""; nullable = true },
                androidx.navigation.navArgument("query") { defaultValue = ""; nullable = true }
            ),
            enterTransition = {
                androidx.compose.animation.fadeIn(androidx.compose.animation.core.tween(220)) +
                    androidx.compose.animation.slideInVertically(
                        animationSpec = androidx.compose.animation.core.tween(240),
                        initialOffsetY = { it / 8 }
                    )
            },
            exitTransition = {
                androidx.compose.animation.fadeOut(androidx.compose.animation.core.tween(180))
            },
            popEnterTransition = {
                androidx.compose.animation.fadeIn(androidx.compose.animation.core.tween(180))
            },
            popExitTransition = {
                androidx.compose.animation.fadeOut(androidx.compose.animation.core.tween(200)) +
                    androidx.compose.animation.slideOutVertically(
                        animationSpec = androidx.compose.animation.core.tween(220),
                        targetOffsetY = { it / 8 }
                    )
            }
        ) { backStackEntry ->
            val dateParam = backStackEntry.arguments?.getString("date") ?: ""
            val queryParam = backStackEntry.arguments?.getString("query") ?: ""
            com.dactor.patient.ui.search.PatientSearchScreen(
                navController = navController,
                initialDate = dateParam,
                initialQuery = queryParam,
                clinicRepository = clinicRepository,
                doctorRepository = doctorRepository,
                slotRepository = slotRepository,
                sessionManager = sessionManager
            )
        }
        composable(
            route = "search?date={date}",
            enterTransition = {
                androidx.compose.animation.fadeIn(androidx.compose.animation.core.tween(220)) +
                    androidx.compose.animation.slideInVertically(
                        animationSpec = androidx.compose.animation.core.tween(240),
                        initialOffsetY = { it / 8 }
                    )
            },
            exitTransition = {
                androidx.compose.animation.fadeOut(androidx.compose.animation.core.tween(180))
            },
            popEnterTransition = {
                androidx.compose.animation.fadeIn(androidx.compose.animation.core.tween(180))
            },
            popExitTransition = {
                androidx.compose.animation.fadeOut(androidx.compose.animation.core.tween(200)) +
                    androidx.compose.animation.slideOutVertically(
                        animationSpec = androidx.compose.animation.core.tween(220),
                        targetOffsetY = { it / 8 }
                    )
            }
        ) { backStackEntry ->
            val dateParam = backStackEntry.arguments?.getString("date") ?: ""
            com.dactor.patient.ui.search.PatientSearchScreen(
                navController = navController,
                initialDate = dateParam,
                initialQuery = "",
                clinicRepository = clinicRepository,
                doctorRepository = doctorRepository,
                slotRepository = slotRepository,
                sessionManager = sessionManager
            )
        }
        composable(
            route = NavRoutes.Search.route,
            enterTransition = {
                androidx.compose.animation.fadeIn(androidx.compose.animation.core.tween(220)) +
                    androidx.compose.animation.slideInVertically(
                        animationSpec = androidx.compose.animation.core.tween(240),
                        initialOffsetY = { it / 8 }
                    )
            },
            popExitTransition = {
                androidx.compose.animation.fadeOut(androidx.compose.animation.core.tween(200)) +
                    androidx.compose.animation.slideOutVertically(
                        animationSpec = androidx.compose.animation.core.tween(220),
                        targetOffsetY = { it / 8 }
                    )
            }
        ) {
            com.dactor.patient.ui.search.PatientSearchScreen(
                navController = navController,
                initialDate = "",
                initialQuery = "",
                clinicRepository = clinicRepository,
                doctorRepository = doctorRepository,
                slotRepository = slotRepository,
                sessionManager = sessionManager
            )
        }
        composable(NavRoutes.ClinicDetail.route) { backStackEntry ->
            val clinicId = backStackEntry.arguments?.getString("clinicId") ?: ""
            ClinicDetailScreen(
                navController = navController,
                clinicId = clinicId,
                clinicRepository = clinicRepository,
                doctorRepository = doctorRepository,
                slotRepository = slotRepository,
                sessionManager = sessionManager
            )
        }
        composable(NavRoutes.Booking.route) { backStackEntry ->
            val clinicId = backStackEntry.arguments?.getString("clinicId") ?: ""
            BookingScreen(
                navController = navController,
                clinicId = clinicId,
                initialDoctorId = null,
                slotRepository = slotRepository,
                doctorRepository = doctorRepository,
                clinicRepository = clinicRepository,
                authRepository = authRepository,
                appointmentRepository = appointmentRepository,
                queueRepository = queueRepository,
                sessionManager = sessionManager
            )
        }
        composable("booking/{clinicId}?doctorId={doctorId}") { backStackEntry ->
            val clinicId = backStackEntry.arguments?.getString("clinicId") ?: ""
            val doctorId = backStackEntry.arguments?.getString("doctorId")
            BookingScreen(
                navController = navController,
                clinicId = clinicId,
                initialDoctorId = doctorId,
                slotRepository = slotRepository,
                doctorRepository = doctorRepository,
                clinicRepository = clinicRepository,
                authRepository = authRepository,
                appointmentRepository = appointmentRepository,
                queueRepository = queueRepository,
                sessionManager = sessionManager
            )
        }
        composable("booking/{clinicId}?doctorId={doctorId}&rescheduleApptId={rescheduleApptId}") { backStackEntry ->
            val clinicId = backStackEntry.arguments?.getString("clinicId") ?: ""
            val doctorId = backStackEntry.arguments?.getString("doctorId")
            val rescheduleApptId = backStackEntry.arguments?.getString("rescheduleApptId")
            BookingScreen(
                navController = navController,
                clinicId = clinicId,
                initialDoctorId = doctorId,
                rescheduleApptId = rescheduleApptId,
                slotRepository = slotRepository,
                doctorRepository = doctorRepository,
                clinicRepository = clinicRepository,
                authRepository = authRepository,
                appointmentRepository = appointmentRepository,
                queueRepository = queueRepository,
                sessionManager = sessionManager
            )
        }
        composable("booking/{clinicId}?rescheduleApptId={rescheduleApptId}") { backStackEntry ->
            val clinicId = backStackEntry.arguments?.getString("clinicId") ?: ""
            val rescheduleApptId = backStackEntry.arguments?.getString("rescheduleApptId")
            BookingScreen(
                navController = navController,
                clinicId = clinicId,
                initialDoctorId = null,
                rescheduleApptId = rescheduleApptId,
                slotRepository = slotRepository,
                doctorRepository = doctorRepository,
                clinicRepository = clinicRepository,
                authRepository = authRepository,
                appointmentRepository = appointmentRepository,
                queueRepository = queueRepository,
                sessionManager = sessionManager
            )
        }
        composable("booking/{clinicId}?date={date}") { backStackEntry ->
            val clinicId = backStackEntry.arguments?.getString("clinicId") ?: ""
            val date = backStackEntry.arguments?.getString("date")
            BookingScreen(
                navController = navController,
                clinicId = clinicId,
                initialDoctorId = null,
                initialDate = date,
                slotRepository = slotRepository,
                doctorRepository = doctorRepository,
                clinicRepository = clinicRepository,
                authRepository = authRepository,
                appointmentRepository = appointmentRepository,
                queueRepository = queueRepository,
                sessionManager = sessionManager
            )
        }
        composable("booking/{clinicId}?doctorId={doctorId}&date={date}") { backStackEntry ->
            val clinicId = backStackEntry.arguments?.getString("clinicId") ?: ""
            val doctorId = backStackEntry.arguments?.getString("doctorId")
            val date = backStackEntry.arguments?.getString("date")
            BookingScreen(
                navController = navController,
                clinicId = clinicId,
                initialDoctorId = doctorId,
                initialDate = date,
                slotRepository = slotRepository,
                doctorRepository = doctorRepository,
                clinicRepository = clinicRepository,
                authRepository = authRepository,
                appointmentRepository = appointmentRepository,
                queueRepository = queueRepository,
                sessionManager = sessionManager
            )
        }
        composable(NavRoutes.BookingForm.route) { backStackEntry ->
            val slotId = backStackEntry.arguments?.getString("slotId") ?: ""
            BookingFormScreen(
                navController = navController,
                slotId = slotId,
                appointmentRepository = appointmentRepository,
                slotRepository = slotRepository,
                clinicRepository = clinicRepository,
                authRepository = authRepository,
                sessionManager = sessionManager,
                doctorRepository = doctorRepository
            )
        }
        composable("booking_form/{slotId}/{clinicId}") { backStackEntry ->
            val slotId = backStackEntry.arguments?.getString("slotId") ?: ""
            val clinicId = backStackEntry.arguments?.getString("clinicId") ?: ""
            BookingFormScreen(
                navController = navController,
                slotId = slotId,
                clinicId = clinicId,
                appointmentRepository = appointmentRepository,
                slotRepository = slotRepository,
                clinicRepository = clinicRepository,
                authRepository = authRepository,
                sessionManager = sessionManager,
                doctorRepository = doctorRepository
            )
        }
        composable(NavRoutes.Payment.route) { backStackEntry ->
            val appointmentId = backStackEntry.arguments?.getString("appointmentId") ?: ""
            PaymentScreen(
                navController = navController,
                appointmentId = appointmentId,
                slotRepository = slotRepository,
                appointmentRepository = appointmentRepository,
                clinicRepository = clinicRepository,
                sessionManager = sessionManager
            )
        }
        composable(NavRoutes.AppointmentConfirmed.route) { backStackEntry ->
            val appointmentId = backStackEntry.arguments?.getString("appointmentId") ?: ""
            AppointmentConfirmedScreen(
                navController = navController,
                appointmentId = appointmentId,
                clinicRepository = clinicRepository,
                doctorRepository = doctorRepository,
                slotRepository = slotRepository,
                appointmentRepository = appointmentRepository,
                sessionManager = sessionManager
            )
        }
        composable(NavRoutes.TrackingLookup.route) {
            TrackingLookupScreen(
                navController = navController,
                appointmentRepository = appointmentRepository,
                authRepository = authRepository,
                sessionManager = sessionManager
            )
        }
        composable(NavRoutes.QueueStatus.route) { backStackEntry ->
            val appointmentId = backStackEntry.arguments?.getString("appointmentId") ?: ""
            QueueStatusScreen(
                navController = navController,
                appointmentIdOrCode = appointmentId,
                appointmentRepository = appointmentRepository,
                queueRepository = queueRepository,
                clinicRepository = clinicRepository,
                doctorRepository = doctorRepository,
                slotRepository = slotRepository,
                labReportRepository = labReportRepository,
                sessionManager = sessionManager
            )
        }
        composable(NavRoutes.Profile.route) { ProfileScreen(navController, authRepository, appointmentRepository, sessionManager) }
        composable(NavRoutes.LabReport.route) { backStackEntry ->
            val reportId = backStackEntry.arguments?.getString("reportId") ?: ""
            LabReportScreen(
                navController = navController,
                reportId = reportId,
                labReportRepository = labReportRepository,
                appointmentRepository = appointmentRepository,
                sessionManager = sessionManager
            )
        }
        composable("lab_report") {
            LabReportScreen(
                navController = navController,
                reportId = "",
                labReportRepository = labReportRepository,
                appointmentRepository = appointmentRepository,
                sessionManager = sessionManager
            )
        }
        composable(NavRoutes.Notifications.route) {
            NotificationsScreen(
                navController = navController,
                notificationRepository = notificationRepository,
                sessionManager = sessionManager,
                authRepository = authRepository,
                appointmentRepository = appointmentRepository
            )
        }
    }
}
