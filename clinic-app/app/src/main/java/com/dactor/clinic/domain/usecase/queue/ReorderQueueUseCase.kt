package com.dactor.clinic.domain.usecase.queue

import com.dactor.clinic.data.model.QueueEntry
import com.dactor.clinic.data.repository.QueueRepository
import com.dactor.clinic.ui.queue.QueueItemUi
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class ReorderQueueUseCase @Inject constructor(
    private val queueRepository: QueueRepository
) {
    suspend operator fun invoke(orderedEntries: List<QueueEntry>): Result<Boolean> {
        return try {
            if (orderedEntries.isEmpty()) {
                return Result.success(true)
            }
            val normalized = orderedEntries.mapIndexed { index, entry ->
                if (entry.queuePosition != index + 1) entry.copy(queuePosition = index + 1) else entry
            }
            val ok = queueRepository.reorderQueue(normalized)
            if (ok) {
                Result.success(true)
            } else {
                Result.failure(IllegalStateException("Failed to reorder queue entries"))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend operator fun invoke(
        clinicId: String,
        items: List<QueueItemUi>,
        doctorId: String? = null
    ): Result<Boolean> {
        val entries = items.mapIndexed { index, item ->
            QueueEntry(
                id = item.id,
                appointmentId = item.appointmentId,
                clinicId = clinicId,
                doctorId = item.doctorId ?: doctorId,
                queuePosition = index + 1,
                status = item.status,
                insideAt = item.insideAt,
                calledAt = item.calledAt,
                completedAt = item.completedAt,
                consultationDurationSeconds = item.consultationDurationSeconds
            )
        }
        return invoke(entries)
    }
}
