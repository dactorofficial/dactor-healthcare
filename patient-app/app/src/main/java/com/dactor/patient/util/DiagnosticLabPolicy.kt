package com.dactor.patient.util

import com.dactor.patient.data.model.Appointment
import com.dactor.patient.data.model.Clinic
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

    /**
     * Determines whether an appointment belongs to a Diagnostic Lab facility or lab order.
     */
    fun isDiagnosticLabAppointment(
        appointment: Appointment?,
        clinic: Clinic? = null,
        clinicType: String? = null,
        queueStatus: String? = null,
        labReports: List<LabReport> = emptyList()
    ): Boolean {
        if (clinicType.equals("diagnostic_lab", ignoreCase = true)) return true
        val cType = clinic?.type?.trim()?.lowercase() ?: ""
        if (cType == "diagnostic_lab" || cType.contains("lab")) return true
        if (clinic?.name?.contains("lab", ignoreCase = true) == true) return true
        if (!appointment?.selectedLabTests.isNullOrBlank()) return true
        if (labReports.isNotEmpty()) return true
        val qLower = queueStatus?.trim()?.lowercase() ?: ""
        val cLower = appointment?.checkinStatus?.trim()?.lowercase() ?: ""
        return qLower in LAB_WORKFLOW_ONLY_STATUSES || cLower in LAB_WORKFLOW_ONLY_STATUSES
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
        if (isSampleCollectedOrFurther(appointment, queueStatus, labReports)) {
            return false
        }
        val qLower = queueStatus?.trim()?.lowercase() ?: ""
        val cLower = appointment?.checkinStatus?.trim()?.lowercase() ?: ""
        val sLower = appointment?.status?.trim()?.lowercase() ?: ""
        if (cLower == "cancelled" || sLower == "cancelled" || sLower == "rejected" || qLower == "cancelled") {
            return false
        }
        if (requireNoShow) {
            return qLower in setOf("no_show", "missed") ||
                cLower in setOf("no_show", "missed") ||
                sLower in setOf("no_show", "missed")
        }
        return true
    }
}
