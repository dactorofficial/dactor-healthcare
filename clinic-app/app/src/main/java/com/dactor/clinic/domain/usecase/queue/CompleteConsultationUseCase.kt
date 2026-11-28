package com.dactor.clinic.domain.usecase.queue

import com.dactor.clinic.data.model.TransitionQueueEntryStatusResult
import com.dactor.clinic.data.repository.AppointmentRepository
import com.dactor.clinic.data.repository.LabReportRepository
import com.dactor.clinic.data.repository.QueueRepository
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class CompleteConsultationUseCase @Inject constructor(
    private val queueRepository: QueueRepository,
    private val appointmentRepository: AppointmentRepository,
    private val labReportRepository: LabReportRepository
) {
    suspend operator fun invoke(
        entryId: String,
        appointmentId: String,
        expectedStatus: String = "inside",
        actorType: String = "doctor",
        actorId: String,
        clinicId: String? = null,
        isDiagnosticLab: Boolean = false,
        patientName: String? = null,
        selectedLabTests: String? = null
    ): Result<TransitionQueueEntryStatusResult> {
        return try {
            val targetStatus = if (isDiagnosticLab) "processing" else "done"
            val apptStatus = if (isDiagnosticLab) "processing" else "completed"

            val result = try {
                val transitionResult = queueRepository.transitionQueueEntryStatus(
                    entryId = entryId,
                    expectedStatus = expectedStatus,
                    newStatus = targetStatus,
                    actorType = actorType,
                    actorId = actorId
                )
                if (!transitionResult.success) {
                    queueRepository.updateQueueStatus(entryId, targetStatus, clinicId)
                }
                transitionResult
            } catch (e: Exception) {
                // Fallback to direct queue entry update so consultation completion never blocks
                queueRepository.updateQueueStatus(entryId, targetStatus, clinicId)
                TransitionQueueEntryStatusResult(
                    success = true,
                    entryId = entryId,
                    appointmentId = appointmentId,
                    status = targetStatus,
                    message = "Fallback direct status transition applied: $targetStatus"
                )
            }

            if (appointmentId.isNotBlank()) {
                try {
                    appointmentRepository.completeConsultation(appointmentId)
                } catch (_: Exception) {
                    try {
                        appointmentRepository.updateCheckinStatus(appointmentId, apptStatus)
                    } catch (_: Exception) {}
                }
            }

            if (isDiagnosticLab && !clinicId.isNullOrBlank() && !patientName.isNullOrBlank() && appointmentId.isNotBlank()) {
                try {
                    labReportRepository.upsertLabReportForAppointment(
                        appointmentId = appointmentId,
                        clinicId = clinicId,
                        patientName = patientName,
                        testName = selectedLabTests?.takeIf { it.isNotBlank() } ?: "Standard Diagnostic Panel",
                        stage = "processing"
                    )
                } catch (_: Exception) {}
            }

            Result.success(result)
        } catch (e: Exception) {
            Result.failure(e)
        }
    }
}
