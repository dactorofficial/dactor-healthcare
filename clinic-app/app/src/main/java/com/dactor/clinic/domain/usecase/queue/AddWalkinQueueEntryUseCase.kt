package com.dactor.clinic.domain.usecase.queue

import com.dactor.clinic.data.model.Appointment
import com.dactor.clinic.data.repository.AppointmentRepository
import com.dactor.clinic.data.repository.QueueRepository
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class AddWalkinQueueEntryUseCase @Inject constructor(
    private val appointmentRepository: AppointmentRepository,
    private val queueRepository: QueueRepository
) {
    suspend operator fun invoke(
        appointment: Appointment,
        allowOverbooking: Boolean = true
    ): Result<Appointment> {
        return try {
            if (appointment.clinicId.isBlank()) {
                return Result.failure(IllegalArgumentException("Clinic ID cannot be blank"))
            }
            if (appointment.patientName.isBlank()) {
                return Result.failure(IllegalArgumentException("Patient name cannot be blank"))
            }
            if (appointment.patientMobile.isBlank()) {
                return Result.failure(IllegalArgumentException("Patient mobile cannot be blank"))
            }

            val created = appointmentRepository.createWalkinAppointment(
                appointment = appointment,
                allowOverbooking = allowOverbooking
            )

            if (created != null) {
                queueRepository.clearCache()
                Result.success(created)
            } else {
                Result.failure(IllegalStateException("Failed to create walk-in appointment"))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }
}
