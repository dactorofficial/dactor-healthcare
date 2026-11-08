package com.dactor.patient.ui.navigation

sealed class NavRoutes(val route: String) {
    object Onboarding : NavRoutes("onboarding")
    object Landing : NavRoutes("landing")
    object Login : NavRoutes("login")
    object Register : NavRoutes("register")
    object Discovery : NavRoutes("discovery")
    object PatientMain : NavRoutes("patient_main") {
        fun createRoute(tab: Int = 0) = "patient_main?tab=$tab"
    }
    object ClinicDetail : NavRoutes("clinic_detail/{clinicId}") {
        fun createRoute(clinicId: String) = "clinic_detail/$clinicId"
    }
    object DoctorDetail : NavRoutes("doctor_detail/{doctorId}") {
        fun createRoute(doctorId: String) = "doctor_detail/$doctorId"
    }
    object Booking : NavRoutes("booking/{clinicId}") {
        fun createRoute(clinicId: String) = "booking/$clinicId"
        fun createRoute(clinicId: String, doctorId: String?, date: String? = null, rescheduleApptId: String? = null): String {
            val params = mutableListOf<String>()
            if (!doctorId.isNullOrBlank()) params.add("doctorId=$doctorId")
            if (!date.isNullOrBlank()) params.add("date=$date")
            if (!rescheduleApptId.isNullOrBlank()) params.add("rescheduleApptId=$rescheduleApptId")
            return if (params.isNotEmpty()) "booking/$clinicId?${params.joinToString("&")}" else "booking/$clinicId"
        }
    }
    object Search : NavRoutes("search") {
        fun createRoute(date: String = "", query: String = ""): String {
            val params = mutableListOf<String>()
            if (date.isNotBlank()) params.add("date=$date")
            if (query.isNotBlank()) params.add("query=${android.net.Uri.encode(query)}")
            return if (params.isNotEmpty()) "search?${params.joinToString("&")}" else "search"
        }
    }
    object BookingForm : NavRoutes("booking_form/{slotId}") {
        fun createRoute(slotId: String) = "booking_form/$slotId"
        fun createRoute(slotId: String, clinicId: String) = if (clinicId.isNotBlank()) "booking_form/$slotId/$clinicId" else "booking_form/$slotId"
    }
    object Payment : NavRoutes("payment/{appointmentId}") {
        fun createRoute(appointmentId: String) = "payment/$appointmentId"
    }
    object AppointmentConfirmed : NavRoutes("appointment_confirmed/{appointmentId}") {
        fun createRoute(appointmentId: String) = "appointment_confirmed/$appointmentId"
    }
    object TrackingLookup : NavRoutes("tracking_lookup")
    object QueueStatus : NavRoutes("queue_status/{appointmentId}") {
        fun createRoute(appointmentId: String) = "queue_status/$appointmentId"
    }
    object Profile : NavRoutes("profile")
    object LabReport : NavRoutes("lab_report/{reportId}") {
        fun createRoute(reportId: String = "") = if (reportId.isNotBlank()) "lab_report/$reportId" else "lab_report/all"
    }
    object Notifications : NavRoutes("notifications")
}
