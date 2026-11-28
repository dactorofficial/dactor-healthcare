package com.dactor.patient.util

import com.dactor.patient.data.model.Appointment
import com.dactor.patient.data.model.Clinic
import com.dactor.patient.data.model.ClinicService
import com.dactor.patient.data.model.LabReport

/**
 * Shared diagnostic lab lifecycle & rescheduling policy helper.
 * Ensures consistent rules across Live Queue Tracker, Active Appointments,
 * Records, Profile, Booking, and Repository layers.
 */
object DiagnosticLabPolicy {

    /**
     * Statuses indicating that a diagnostic lab appointment has had its sample collected
     * or has moved to any subsequent laboratory or completion stage.
     */
    val SAMPLE_COLLECTED_OR_FURTHER_STATUSES = setOf(
        "sample_collected",
        "processing",
        "in_lab",
        "prepared",
        "report_prepared",
        "delivered",
        "done",
        "completed",
        "finished"
    )

    /**
     * Statuses indicating a diagnostic lab report is ready or the visit is completely finished.
     */
    val REPORT_READY_OR_COMPLETED_STATUSES = setOf(
        "prepared",
        "report_prepared",
        "delivered",
        "done",
        "completed",
        "finished"
    )

    /**
     * Statuses exclusive to diagnostic lab workflows.
     */
    val LAB_WORKFLOW_ONLY_STATUSES = setOf(
        "sample_collected",
        "processing",
        "in_lab",
        "prepared",
        "report_prepared",
        "delivered"
    )

    private val EXPLICIT_OPD_CLINIC_TYPES = setOf(
        "multi_visit",
        "single_visit",
        "single_doctor",
        "polyclinic",
        "opd",
        "opd_clinic",
        "general_clinic"
    )

    private fun isExplicitLabClinicType(rawType: String?): Boolean {
        val cType = rawType?.trim()?.lowercase(java.util.Locale.ROOT) ?: ""
        if (cType.isBlank()) return false
        if (cType in EXPLICIT_OPD_CLINIC_TYPES) return false
        return cType == "diagnostic_lab" ||
            cType.contains("lab") ||
            cType.contains("patholog") ||
            cType.contains("diagnostic") ||
            cType.contains("imaging")
    }

    private fun isExplicitOpdClinicType(rawType: String?): Boolean {
        val cType = rawType?.trim()?.lowercase(java.util.Locale.ROOT) ?: ""
        return cType in EXPLICIT_OPD_CLINIC_TYPES
    }

    /**
     * Determines whether an appointment belongs to a Diagnostic Lab facility or lab order.
     * Explicit appointment-level lab signals take precedence; otherwise an explicit OPD
     * facility type (multi_visit / single_visit) is never overridden by polyclinic specialties.
     */
    fun isDiagnosticLabAppointment(
        appointment: Appointment?,
        clinic: Clinic? = null,
        clinicType: String? = null,
        queueStatus: String? = null,
        labReports: List<LabReport> = emptyList()
    ): Boolean {
        // 1. Appointment-specific explicit lab workflow signals (applies even inside multi_visit polyclinics)
        if (!appointment?.selectedLabTests.isNullOrBlank()) return true
        if (labReports.isNotEmpty()) return true
        val qLower = queueStatus?.trim()?.lowercase(java.util.Locale.ROOT) ?: ""
        val cLower = appointment?.checkinStatus?.trim()?.lowercase(java.util.Locale.ROOT) ?: ""
        if (qLower in LAB_WORKFLOW_ONLY_STATUSES || cLower in LAB_WORKFLOW_ONLY_STATUSES) return true

        // 2. Explicit clinic type (diagnostic_lab vs multi_visit / single_visit)
        if (isExplicitLabClinicType(clinicType) || isExplicitLabClinicType(clinic?.type)) return true
        if (isExplicitOpdClinicType(clinicType) || isExplicitOpdClinicType(clinic?.type)) return false

        // 3. Fallback when clinic type is missing/unknown
        return isDiagnosticOrPathologyLab(clinic)
    }

    /**
     * Determines whether a facility is a standalone Diagnostic Lab, Pathology Lab, or Imaging Center.
     * Explicit multi_visit / single_visit OPD clinics are NOT standalone diagnostic labs even if they
     * list Pathology or Radiology among their polyclinic departments.
     */
    fun isDiagnosticOrPathologyLab(
        clinic: Clinic?,
        services: List<ClinicService> = emptyList()
    ): Boolean {
        if (clinic == null) return false
        if (isExplicitLabClinicType(clinic.type)) return true
        if (isExplicitOpdClinicType(clinic.type)) return false
        val name = clinic.name.lowercase(java.util.Locale.ROOT)
        if (name.contains("lab") || name.contains("patholog") || name.contains("diagnostic")) return true
        if (clinic.specialties.any { s ->
            val l = s.lowercase(java.util.Locale.ROOT)
            l.contains("lab") || l.contains("patholog") || l.contains("diagnostic") || l.contains("scan") || l.contains("radiolog")
        }) return true
        if (services.any { s ->
            val n = s.serviceName.lowercase(java.util.Locale.ROOT)
            n.contains("scan") || n.contains("test") || n.contains("lab") || n.contains("ray") || n.contains("mri") || n.contains("usg") || n.contains("patholog") || n.contains("blood")
        }) return true
        return false
    }

    /**
     * Returns true once a diagnostic lab appointment's sample is collected or any further
     * step (processing, in_lab, prepared, report_prepared, delivered, done, completed) is done.
     */
    fun isSampleCollectedOrFurther(
        appointment: Appointment?,
        queueStatus: String? = null,
        labReports: List<LabReport> = emptyList()
    ): Boolean {
        if (labReports.isNotEmpty()) return true
        val qLower = queueStatus?.trim()?.lowercase() ?: ""
        val cLower = appointment?.checkinStatus?.trim()?.lowercase() ?: ""
        val sLower = appointment?.status?.trim()?.lowercase() ?: ""
        return qLower in SAMPLE_COLLECTED_OR_FURTHER_STATUSES ||
            cLower in SAMPLE_COLLECTED_OR_FURTHER_STATUSES ||
            sLower == "completed"
    }

    /**
     * Returns true when a diagnostic lab report is prepared/ready or the appointment is completed.
     */
    fun isLabReportReadyOrCompleted(
        appointment: Appointment?,
        queueStatus: String? = null,
        labReports: List<LabReport> = emptyList()
    ): Boolean {
        if (labReports.any { it.stage.trim().lowercase() in REPORT_READY_OR_COMPLETED_STATUSES }) {
            return true
        }
        val qLower = queueStatus?.trim()?.lowercase() ?: ""
        val cLower = appointment?.checkinStatus?.trim()?.lowercase() ?: ""
        val sLower = appointment?.status?.trim()?.lowercase() ?: ""
        return qLower in REPORT_READY_OR_COMPLETED_STATUSES ||
            cLower in REPORT_READY_OR_COMPLETED_STATUSES ||
            sLower == "completed"
    }

    /**
     * Centralized eligibility check for rescheduling a diagnostic lab appointment.
     * Diagnostic lab appointments are strictly non-reschedulable once sample collection
     * or any subsequent step has occurred.
     */
    fun canRescheduleDiagnosticLab(
        appointment: Appointment?,
        queueStatus: String? = null,
        labReports: List<LabReport> = emptyList(),
        requireNoShow: Boolean = true
    ): Boolean {
        // Strictly non-reschedulable once sample collection or subsequent laboratory processing has occurred
        if (isSampleCollectedOrFurther(appointment, queueStatus, labReports)) {
            return false
        }
        val qLower = queueStatus?.trim()?.lowercase() ?: ""
        val cLower = appointment?.checkinStatus?.trim()?.lowercase() ?: ""
        val sLower = appointment?.status?.trim()?.lowercase() ?: ""

        if (sLower == "rejected") {
            return false
        }

        // Diagnostic lab visit was NEVER completed (sample was never collected).
        // Cancellation in live queue allows the patient to reschedule/book a new slot later.
        if (cLower == "cancelled" || sLower == "cancelled" || qLower == "cancelled") {
            return true
        }

        if (requireNoShow) {
            return qLower in setOf("no_show", "missed") ||
                cLower in setOf("no_show", "missed") ||
                sLower in setOf("no_show", "missed")
        }
        return true
    }
}
