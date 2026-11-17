package com.dactor.clinic.domain.usecase.queue

import com.dactor.clinic.data.model.TransitionQueueEntryStatusResult
import com.dactor.clinic.data.repository.AppointmentRepository
import com.dactor.clinic.data.repository.QueueRepository
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class StartConsultationUseCase @Inject constructor(
    private val queueRepository: QueueRepository,
    private val appointmentRepository: AppointmentRepository
) {
    suspend operator fun invoke(
        entryId: String,
        appointmentId: String,
        expectedStatus: String = "waiting",
        actorType: String = "doctor",
        actorId: String,
        clinicId: String? = null,
        patientName: String? = null,
        doctorName: String? = null,
        trackingCode: String? = null
    ): Result<TransitionQueueEntryStatusResult> {
        return try {
            val result = queueRepository.transitionQueueEntryStatus(
                entryId = entryId,
                expectedStatus = expectedStatus,
                newStatus = "inside",
                actorType = actorType,
                actorId = actorId
            )

            if (appointmentId.isNotBlank()) {
                try {
                    appointmentRepository.updateCheckinStatus(appointmentId, "inside")
                } catch (_: Exception) {}
            }

            if (!patientName.isNullOrBlank() && !doctorName.isNullOrBlank()) {
                try {
                    queueRepository.notifyCallInside(
                        appointmentId = appointmentId,
                        patientName = patientName,
                        doctorName = doctorName,
                        trackingCode = trackingCode
                    )
                } catch (_: Exception) {}
            }

            Result.success(result)
        } catch (e: Exception) {
            Result.failure(e)
        }
    }
}
