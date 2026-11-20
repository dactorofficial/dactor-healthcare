package com.dactor.patient.util

import com.dactor.patient.data.model.Appointment
import com.dactor.patient.data.model.Clinic
import com.dactor.patient.data.model.LabReport
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class DiagnosticLabPolicyTest {

    @Test
    fun sampleCollectedStatus_isRecognizedAsSampleCollectedOrFurther() {
        val appt = Appointment(
            id = "appt-1",
            checkinStatus = "sample_collected"
        )
        assertTrue(DiagnosticLabPolicy.isSampleCollectedOrFurther(appointment = appt))
        assertTrue(DiagnosticLabPolicy.isDiagnosticLabAppointment(appointment = appt))
    }

    @Test
    fun processingStatus_isRecognizedAsSampleCollectedOrFurther() {
        val appt = Appointment(
            id = "appt-2",
            checkinStatus = "processing"
        )
        assertTrue(DiagnosticLabPolicy.isSampleCollectedOrFurther(appointment = appt))
    }

    @Test
    fun labReportPresent_isRecognizedAsSampleCollectedOrFurtherEvenIfQueueStatusIsNoShow() {
        val appt = Appointment(
            id = "appt-3",
            checkinStatus = "no_show"
        )
        val reports = listOf(
            LabReport(
                id = "rep-1",
                appointmentId = "appt-3",
                stage = "sample_collected"
            )
        )
        assertTrue(DiagnosticLabPolicy.isSampleCollectedOrFurther(appointment = appt, queueStatus = "no_show", labReports = reports))
    }

    @Test
    fun sampleCollectedAppointment_cannotBeRescheduledAsNoShow() {
        val appt = Appointment(
            id = "appt-4",
            checkinStatus = "sample_collected"
        )
        val canReschedule = DiagnosticLabPolicy.canRescheduleDiagnosticLab(
            appointment = appt,
            queueStatus = "sample_collected",
            requireNoShow = true
        )
        assertFalse("Sample collected appointments must never be eligible for no-show rescheduling", canReschedule)
    }

    @Test
    fun uncollectedNoShowAppointment_canBeRescheduled() {
        val appt = Appointment(
            id = "appt-5",
            checkinStatus = "no_show"
        )
        val clinic = Clinic(
            id = "clinic-1",
            name = "Pathology Lab",
            type = "diagnostic_lab"
        )
        val canReschedule = DiagnosticLabPolicy.canRescheduleDiagnosticLab(
            appointment = appt,
            queueStatus = "no_show",
            requireNoShow = true
        )
        assertTrue("No-show diagnostic appointment before sample collection must allow rescheduling", canReschedule)
    }

    @Test
    fun liveTrackerNoShowEvaluation_excludesSampleCollectedAppointments() {
        val appt = Appointment(
            id = "appt-6",
            checkinStatus = "sample_collected"
        )
        val queueStatus = "no_show" // Even if stale queue entry says no_show
        val labReports = listOf(LabReport(id = "r1", appointmentId = "appt-6", stage = "sample_collected"))

        val isConsultancyCompleted = queueStatus in listOf("done", "completed") ||
            appt.checkinStatus.lowercase() in listOf("done", "completed")

        val isSampleProcessing = queueStatus.lowercase() in listOf("processing", "sample_collected", "in_lab") ||
            appt.checkinStatus.lowercase() in listOf("processing", "sample_collected", "in_lab") ||
            labReports.any { it.stage.lowercase() in listOf("processing", "in_lab", "sample_collected") }

        val isReportReady = DiagnosticLabPolicy.isLabReportReadyOrCompleted(appt, queueStatus, labReports)

        val isSampleCollectedOrFurther = isSampleProcessing ||
            isReportReady ||
            labReports.isNotEmpty() ||
            DiagnosticLabPolicy.isSampleCollectedOrFurther(appt, queueStatus, labReports)

        val isNoShow = !isConsultancyCompleted && !isSampleCollectedOrFurther && (
            queueStatus in listOf("no_show", "missed", "noshow") ||
            appt.checkinStatus.lowercase() in listOf("no_show", "missed", "noshow") ||
            appt.status.lowercase() in listOf("no_show", "missed", "noshow")
        )

        assertFalse("Live tracker must NEVER show an appointment as no-show once sample is collected!", isNoShow)
        assertTrue("Live tracker must recognize that sample was collected", isSampleCollectedOrFurther)
    }
}
