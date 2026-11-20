package com.dactor.clinic.domain.usecase.queue

import com.dactor.clinic.data.model.TransitionQueueEntryStatusResult
import com.dactor.clinic.data.repository.AppointmentRepository
import com.dactor.clinic.data.repository.QueueRepository
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class HoldOrSkipQueueEntryUseCase @Inject constructor(
    private val queueRepository: QueueRepository,
    private val appointmentRepository: AppointmentRepository
) {
    suspend operator fun invoke(
        entryId: String,
        appointmentId: String? = null,
        expectedStatus: String = "waiting",
        newStatus: String = "no_show",
        actorType: String = "doctor",
        actorId: String,
        clinicId: String? = null
    ): Result<TransitionQueueEntryStatusResult> {
        return try {
            val normalizedNewStatus = when (newStatus.lowercase().trim()) {
                "skipped", "skip", "no_show", "noshow" -> "no_show"
                else -> newStatus.lowercase().trim()
            }

            val result = queueRepository.transitionQueueEntryStatus(
                entryId = entryId,
                expectedStatus = expectedStatus,
                newStatus = normalizedNewStatus,
                actorType = actorType,
                actorId = actorId
            )

            if (!appointmentId.isNullOrBlank()) {
                try {
                    appointmentRepository.updateCheckinStatus(appointmentId, normalizedNewStatus)
                } catch (_: Exception) {}
            }

            Result.success(result)
        } catch (e: Exception) {
            Result.failure(e)
        }
    }
}
