package com.dactor.clinic.ui.navigation

import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import com.dactor.clinic.data.local.RegistrationDraftManager
import com.dactor.clinic.data.repository.*
import com.dactor.clinic.ui.appointments.FutureAppointmentsScreen
import com.dactor.clinic.ui.appointments.PayAtDeskRequestsScreen
import com.dactor.clinic.ui.auth.*
import com.dactor.clinic.ui.billing.BillingScreen
import com.dactor.clinic.ui.billing.PaymentLogsScreen
import com.dactor.clinic.ui.billing.CatalogManagerScreen
import com.dactor.clinic.ui.dashboard.DashboardScreen
import com.dactor.clinic.ui.dashboard.DoctorDashboardScreen
import com.dactor.clinic.ui.invitations.InvitationManagerScreen
import com.dactor.clinic.ui.lab.LabWorkflowScreen
import com.dactor.clinic.ui.patients.PatientDetailScreen
import com.dactor.clinic.ui.patients.PatientDirectoryScreen
import com.dactor.clinic.ui.queue.QueueBoardScreen
import com.dactor.clinic.ui.notifications.ClinicNotificationsScreen
import com.dactor.clinic.ui.services.ServicesScreen
import com.dactor.clinic.ui.settings.ClinicSettingsScreen
import com.dactor.clinic.ui.slots.SlotManagerScreen
import com.dactor.clinic.ui.walkin.WalkinBookingScreen

@Composable
fun DactorClinicNavHost(
    authRepository: AuthRepository? = null,
    clinicRepository: ClinicRepository? = null,
    doctorRepository: DoctorRepository? = null,
    appointmentRepository: AppointmentRepository? = null,
    queueRepository: QueueRepository? = null,
    billingRepository: BillingRepository? = null,
    labReportRepository: LabReportRepository? = null,
    slotRepository: SlotRepository? = null,
    invitationRepository: InvitationRepository? = null,
    draftManager: RegistrationDraftManager? = null,
    sessionManager: com.dactor.clinic.data.local.UserSessionManager? = null
) {
    val navController = rememberNavController()

    val startRoute = remember {
        if (sessionManager != null && sessionManager.isLoggedIn()) {
            val role = sessionManager.getUserRole()
            val docId = sessionManager.getSavedDoctorId()
            val clinicId = sessionManager.getSavedClinicId()
            if (role == "doctor" && !docId.isNullOrBlank()) {
                "${NavRoutes.DoctorDashboard}/$docId"
            } else if (!clinicId.isNullOrBlank()) {
                "${NavRoutes.Dashboard}/$clinicId"
            } else {
                NavRoutes.ClinicLogin
            }
        } else {
            NavRoutes.ClinicLogin
        }
    }

    NavHost(navController = navController, startDestination = startRoute) {
        composable(NavRoutes.ClinicLogin) {
            ClinicLoginScreen(
                navController = navController,
                authRepository = authRepository,
                doctorRepository = doctorRepository,
                clinicRepository = clinicRepository,
                draftManager = draftManager,
                sessionManager = sessionManager
            )
        }
        composable(NavRoutes.ClinicRegister) {
            ClinicRegisterScreen(
                navController = navController,
                clinicRepository = clinicRepository,
                authRepository = authRepository,
                draftManager = draftManager
            )
        }
        composable(NavRoutes.DoctorLogin) {
            DoctorLoginScreen(
                navController = navController,
                authRepository = authRepository,
                doctorRepository = doctorRepository
            )
        }
        composable(NavRoutes.DoctorRegister) {
            DoctorRegisterScreen(
                navController = navController,
                doctorRepository = doctorRepository,
                authRepository = authRepository,
                draftManager = draftManager
            )
        }
        composable(NavRoutes.DoctorKYC) {
            DoctorKYCScreen(navController = navController, doctorRepository = doctorRepository)
        }
        composable("${NavRoutes.DoctorKYC}/{doctorId}") { backStackEntry ->
            val docId = backStackEntry.arguments?.getString("doctorId")
            DoctorKYCScreen(navController = navController, doctorId = docId, doctorRepository = doctorRepository)
        }
        composable(NavRoutes.Dashboard) {
            DashboardScreen(navController = navController, doctorRepository = doctorRepository, clinicRepository = clinicRepository, authRepository = authRepository, appointmentRepository = appointmentRepository)
        }
        composable("${NavRoutes.Dashboard}/{clinicId}") { backStackEntry ->
            val clinicId = backStackEntry.arguments?.getString("clinicId")
            DashboardScreen(navController = navController, clinicId = clinicId, doctorRepository = doctorRepository, clinicRepository = clinicRepository, authRepository = authRepository, appointmentRepository = appointmentRepository)
        }
        composable(NavRoutes.DoctorDashboard) {
            DoctorDashboardScreen(
                navController = navController,
                doctorRepository = doctorRepository,
                queueRepository = queueRepository,
                appointmentRepository = appointmentRepository,
                invitationRepository = invitationRepository,
                clinicRepository = clinicRepository
            )
        }
        composable("${NavRoutes.DoctorDashboard}/{doctorId}") { backStackEntry ->
            val docId = backStackEntry.arguments?.getString("doctorId")
            DoctorDashboardScreen(
                navController = navController,
                doctorId = docId,
                doctorRepository = doctorRepository,
                queueRepository = queueRepository,
                appointmentRepository = appointmentRepository,
                invitationRepository = invitationRepository,
                clinicRepository = clinicRepository
            )
        }
        fun currentClinicId(argCid: String? = null): String {
            return if (!argCid.isNullOrBlank() && argCid != "c1") {
                argCid
            } else {
                val clinicPref = sessionManager?.getSavedClinicId().orEmpty()
                if (clinicPref.isNotBlank() && clinicPref != "c1") {
                    clinicPref
                } else {
                    sessionManager?.getSavedActiveClinicIdForDoctor().orEmpty()
                }
            }
        }

        composable(NavRoutes.SlotManager) {
            SlotManagerScreen(
                navController = navController,
                clinicId = currentClinicId(),
                slotRepository = slotRepository,
                doctorRepository = doctorRepository,
                clinicRepository = clinicRepository
            )
        }
        composable("${NavRoutes.SlotManager}/{clinicId}") { backStackEntry ->
            val cid = currentClinicId(backStackEntry.arguments?.getString("clinicId"))
            SlotManagerScreen(
                navController = navController,
                clinicId = cid,
                slotRepository = slotRepository,
                doctorRepository = doctorRepository,
                clinicRepository = clinicRepository
            )
        }
        composable(NavRoutes.QueueBoard) {
            QueueBoardScreen(
                navController = navController,
                clinicId = currentClinicId(),
                queueRepository = queueRepository,
                doctorRepository = doctorRepository,
                appointmentRepository = appointmentRepository,
                billingRepository = billingRepository,
                clinicRepository = clinicRepository,
                labReportRepository = labReportRepository
            )
        }
        composable(
            route = "${NavRoutes.QueueBoard}/{clinicId}?doctorId={doctorId}&date={date}",
            arguments = listOf(
                androidx.navigation.navArgument("clinicId") { type = androidx.navigation.NavType.StringType },
                androidx.navigation.navArgument("doctorId") { type = androidx.navigation.NavType.StringType; nullable = true; defaultValue = null },
                androidx.navigation.navArgument("date") { type = androidx.navigation.NavType.StringType; nullable = true; defaultValue = null }
            )
        ) { backStackEntry ->
            val cid = currentClinicId(backStackEntry.arguments?.getString("clinicId"))
            val initDocId = backStackEntry.arguments?.getString("doctorId")
            val initDate = backStackEntry.arguments?.getString("date")
            QueueBoardScreen(
                navController = navController,
                clinicId = cid,
                initialDoctorId = initDocId,
                initialDate = initDate,
                queueRepository = queueRepository,
                doctorRepository = doctorRepository,
                appointmentRepository = appointmentRepository,
                billingRepository = billingRepository,
                clinicRepository = clinicRepository,
                labReportRepository = labReportRepository
            )
        }
        composable("${NavRoutes.QueueBoard}/{clinicId}") { backStackEntry ->
            val cid = currentClinicId(backStackEntry.arguments?.getString("clinicId"))
            QueueBoardScreen(
                navController = navController,
                clinicId = cid,
                queueRepository = queueRepository,
                doctorRepository = doctorRepository,
                appointmentRepository = appointmentRepository,
                billingRepository = billingRepository,
                clinicRepository = clinicRepository,
                labReportRepository = labReportRepository
            )
        }
        composable(NavRoutes.PatientDirectory) {
            PatientDirectoryScreen(
                navController = navController,
                clinicId = currentClinicId(),
                authRepository = authRepository,
                appointmentRepository = appointmentRepository,
                doctorRepository = doctorRepository,
                billingRepository = billingRepository,
                clinicRepository = clinicRepository,
                slotRepository = slotRepository,
                sessionManager = sessionManager,
                queueRepository = queueRepository
            )
        }
        composable("${NavRoutes.PatientDirectory}/{clinicId}") { backStackEntry ->
            val cid = currentClinicId(backStackEntry.arguments?.getString("clinicId"))
            PatientDirectoryScreen(
                navController = navController,
                clinicId = cid,
                authRepository = authRepository,
                appointmentRepository = appointmentRepository,
                doctorRepository = doctorRepository,
                billingRepository = billingRepository,
                clinicRepository = clinicRepository,
                slotRepository = slotRepository,
                sessionManager = sessionManager,
                queueRepository = queueRepository
            )
        }
        composable(NavRoutes.PatientDetail) {
            PatientDetailScreen(
                navController = navController,
                appointmentRepository = appointmentRepository,
                queueRepository = queueRepository,
                billingRepository = billingRepository,
                clinicRepository = clinicRepository,
                doctorRepository = doctorRepository,
                slotRepository = slotRepository,
                labReportRepository = labReportRepository
            )
        }
        composable("${NavRoutes.PatientDetail}/{appointmentId}") { backStackEntry ->
            val apptId = backStackEntry.arguments?.getString("appointmentId") ?: ""
            PatientDetailScreen(
                navController = navController,
                appointmentId = apptId,
                appointmentRepository = appointmentRepository,
                queueRepository = queueRepository,
                billingRepository = billingRepository,
                clinicRepository = clinicRepository,
                doctorRepository = doctorRepository,
                slotRepository = slotRepository,
                labReportRepository = labReportRepository
            )
        }
        composable(NavRoutes.BillingScreen) {
            BillingScreen(
                navController = navController,
                clinicId = currentClinicId(),
                billingRepository = billingRepository,
                appointmentRepository = appointmentRepository,
                clinicRepository = clinicRepository,
                doctorRepository = doctorRepository
            )
        }
        composable("${NavRoutes.BillingScreen}/{appointmentId}") { backStackEntry ->
            val apptId = backStackEntry.arguments?.getString("appointmentId") ?: ""
            BillingScreen(
                navController = navController,
                clinicId = currentClinicId(),
                appointmentId = apptId,
                billingRepository = billingRepository,
                appointmentRepository = appointmentRepository,
                clinicRepository = clinicRepository,
                doctorRepository = doctorRepository
            )
        }
        composable(NavRoutes.PaymentLogs) {
            PaymentLogsScreen(
                navController = navController,
                clinicId = currentClinicId(),
                billingRepository = billingRepository,
                appointmentRepository = appointmentRepository,
                doctorRepository = doctorRepository,
                clinicRepository = clinicRepository
            )
        }
        composable("${NavRoutes.PaymentLogs}/{clinicId}") { backStackEntry ->
            val cid = currentClinicId(backStackEntry.arguments?.getString("clinicId"))
            PaymentLogsScreen(
                navController = navController,
                clinicId = cid,
                billingRepository = billingRepository,
                appointmentRepository = appointmentRepository,
                doctorRepository = doctorRepository,
                clinicRepository = clinicRepository
            )
        }
        composable(NavRoutes.CatalogManager) {
            CatalogManagerScreen(
                navController = navController,
                clinicId = currentClinicId(),
                billingRepository = billingRepository
            )
        }
        composable("${NavRoutes.CatalogManager}/{clinicId}") { backStackEntry ->
            val cid = currentClinicId(backStackEntry.arguments?.getString("clinicId"))
            CatalogManagerScreen(
                navController = navController,
                clinicId = cid,
                billingRepository = billingRepository
            )
        }
        composable(NavRoutes.ConsultationFeeManager) {
            com.dactor.clinic.ui.billing.ConsultationFeeManagerScreen(
                navController = navController,
                clinicId = currentClinicId(),
                doctorRepository = doctorRepository
            )
        }
        composable("${NavRoutes.ConsultationFeeManager}/{clinicId}") { backStackEntry ->
            val cid = currentClinicId(backStackEntry.arguments?.getString("clinicId"))
            com.dactor.clinic.ui.billing.ConsultationFeeManagerScreen(
                navController = navController,
                clinicId = cid,
                doctorRepository = doctorRepository
            )
        }
        composable(NavRoutes.NoShowManager) {
            com.dactor.clinic.ui.appointments.NoShowManagerScreen(
                navController = navController,
                clinicId = currentClinicId(),
                appointmentRepository = appointmentRepository,
                doctorRepository = doctorRepository,
                queueRepository = queueRepository,
                slotRepository = slotRepository
            )
        }
        composable("${NavRoutes.NoShowManager}/{clinicId}") { backStackEntry ->
            val cid = currentClinicId(backStackEntry.arguments?.getString("clinicId"))
            com.dactor.clinic.ui.appointments.NoShowManagerScreen(
                navController = navController,
                clinicId = cid,
                appointmentRepository = appointmentRepository,
                doctorRepository = doctorRepository,
                queueRepository = queueRepository,
                slotRepository = slotRepository
            )
        }
        composable(NavRoutes.AverageTime) {
            com.dactor.clinic.ui.queue.AverageTimeScreen(
                navController = navController,
                clinicId = currentClinicId(),
                queueRepository = queueRepository
            )
        }
        composable("${NavRoutes.AverageTime}/{clinicId}") { backStackEntry ->
            val cid = currentClinicId(backStackEntry.arguments?.getString("clinicId"))
            com.dactor.clinic.ui.queue.AverageTimeScreen(
                navController = navController,
                clinicId = cid,
                queueRepository = queueRepository
            )
        }
        composable(NavRoutes.WorkingHoursBreak) {
            com.dactor.clinic.ui.operations.WorkingHoursBreakScreen(
                navController = navController,
                clinicId = currentClinicId(),
                clinicRepository = clinicRepository,
                queueRepository = queueRepository
            )
        }
        composable("${NavRoutes.WorkingHoursBreak}/{clinicId}") { backStackEntry ->
            val cid = currentClinicId(backStackEntry.arguments?.getString("clinicId"))
            com.dactor.clinic.ui.operations.WorkingHoursBreakScreen(
                navController = navController,
                clinicId = cid,
                clinicRepository = clinicRepository,
                queueRepository = queueRepository
            )
        }
        composable(NavRoutes.FutureAppointments) {
            FutureAppointmentsScreen(
                navController = navController,
                clinicId = currentClinicId(),
                appointmentRepository = appointmentRepository,
                slotRepository = slotRepository,
                doctorRepository = doctorRepository,
                queueRepository = queueRepository,
                billingRepository = billingRepository,
                clinicRepository = clinicRepository
            )
        }
        composable("${NavRoutes.FutureAppointments}/{clinicId}") { backStackEntry ->
            val cid = currentClinicId(backStackEntry.arguments?.getString("clinicId"))
            FutureAppointmentsScreen(
                navController = navController,
                clinicId = cid,
                appointmentRepository = appointmentRepository,
                slotRepository = slotRepository,
                doctorRepository = doctorRepository,
                queueRepository = queueRepository,
                billingRepository = billingRepository,
                clinicRepository = clinicRepository
            )
        }
        composable(NavRoutes.PayAtDeskRequests) {
            PayAtDeskRequestsScreen(
                navController = navController,
                clinicId = currentClinicId(),
                appointmentRepository = appointmentRepository,
                doctorRepository = doctorRepository
            )
        }
        composable("${NavRoutes.PayAtDeskRequests}/{clinicId}") { backStackEntry ->
            val cid = currentClinicId(backStackEntry.arguments?.getString("clinicId"))
            PayAtDeskRequestsScreen(
                navController = navController,
                clinicId = cid,
                appointmentRepository = appointmentRepository,
                doctorRepository = doctorRepository
            )
        }
        composable(NavRoutes.WalkinBooking) {
            WalkinBookingScreen(
                navController = navController,
                clinicId = currentClinicId(),
                appointmentRepository = appointmentRepository,
                doctorRepository = doctorRepository,
                slotRepository = slotRepository,
                clinicRepository = clinicRepository
            )
        }
        composable("${NavRoutes.WalkinBooking}/{clinicId}") { backStackEntry ->
            val cid = currentClinicId(backStackEntry.arguments?.getString("clinicId"))
            WalkinBookingScreen(
                navController = navController,
                clinicId = cid,
                appointmentRepository = appointmentRepository,
                doctorRepository = doctorRepository,
                slotRepository = slotRepository,
                clinicRepository = clinicRepository
            )
        }
        composable(NavRoutes.LabWorkflow) {
            LabWorkflowScreen(
                navController = navController,
                clinicId = currentClinicId(),
                labReportRepository = labReportRepository,
                appointmentRepository = appointmentRepository,
                queueRepository = queueRepository,
                clinicRepository = clinicRepository
            )
        }
        composable("${NavRoutes.LabWorkflow}/{clinicId}") { backStackEntry ->
            val cid = currentClinicId(backStackEntry.arguments?.getString("clinicId"))
            LabWorkflowScreen(
                navController = navController,
                clinicId = cid,
                labReportRepository = labReportRepository,
                appointmentRepository = appointmentRepository,
                queueRepository = queueRepository,
                clinicRepository = clinicRepository
            )
        }
        composable(NavRoutes.InvitationManager) {
            InvitationManagerScreen(
                navController = navController,
                clinicId = currentClinicId(),
                invitationRepository = invitationRepository,
                doctorRepository = doctorRepository,
                authRepository = authRepository
            )
        }
        composable("${NavRoutes.InvitationManager}/{clinicId}") { backStackEntry ->
            val cid = currentClinicId(backStackEntry.arguments?.getString("clinicId"))
            InvitationManagerScreen(
                navController = navController,
                clinicId = cid,
                invitationRepository = invitationRepository,
                doctorRepository = doctorRepository,
                authRepository = authRepository
            )
        }
        composable(NavRoutes.ClinicSettings) {
            ClinicSettingsScreen(
                navController = navController,
                clinicId = currentClinicId(),
                clinicRepository = clinicRepository
            )
        }
        composable("${NavRoutes.ClinicSettings}/{clinicId}") { backStackEntry ->
            val cid = currentClinicId(backStackEntry.arguments?.getString("clinicId"))
            ClinicSettingsScreen(
                navController = navController,
                clinicId = cid,
                clinicRepository = clinicRepository
            )
        }
        composable(NavRoutes.ServicesScreen) {
            ServicesScreen(
                navController = navController,
                clinicId = currentClinicId(),
                clinicRepository = clinicRepository
            )
        }
        composable("${NavRoutes.ServicesScreen}/{clinicId}") { backStackEntry ->
            val cid = currentClinicId(backStackEntry.arguments?.getString("clinicId"))
            ServicesScreen(
                navController = navController,
                clinicId = cid,
                clinicRepository = clinicRepository
            )
        }
        composable(NavRoutes.Notifications) {
            ClinicNotificationsScreen(
                navController = navController,
                queueRepository = queueRepository,
                sessionManager = null
            )
        }
    }
}
