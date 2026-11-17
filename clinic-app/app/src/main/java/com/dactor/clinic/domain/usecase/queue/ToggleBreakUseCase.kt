package com.dactor.clinic.domain.usecase.queue

import com.dactor.clinic.data.repository.ClinicRepository
import com.dactor.clinic.data.repository.QueueRepository
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class ToggleBreakUseCase @Inject constructor(
    private val clinicRepository: ClinicRepository,
    private val queueRepository: QueueRepository
) {
    suspend operator fun invoke(
        clinicId: String,
        isOnBreak: Boolean,
        doctorId: String? = null,
        clinicName: String? = null,
        breakWindowText: String? = null
    ): Result<Boolean> {
        return try {
            if (clinicId.isBlank()) {
                return Result.failure(IllegalArgumentException("Clinic ID cannot be blank"))
            }

            val updatedClinic = clinicRepository.toggleClinicBreak(clinicId, isOnBreak)
            if (updatedClinic != null) {
                if (isOnBreak) {
                    try {
                        val effectiveName = clinicName?.takeIf { it.isNotBlank() } ?: updatedClinic.name
                        queueRepository.sendClinicBreakNotificationsToActiveAppointments(
                            clinicId = clinicId,
                            clinicName = effectiveName,
                            breakWindowText = breakWindowText
                        )
                    } catch (_: Exception) {}
                }
                Result.success(true)
            } else {
                Result.failure(IllegalStateException("Failed to update clinic break status"))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }
}
