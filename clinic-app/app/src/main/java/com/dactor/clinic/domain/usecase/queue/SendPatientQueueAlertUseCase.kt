package com.dactor.clinic.domain.usecase.queue

import com.dactor.clinic.data.model.NotificationTemplate
import com.dactor.clinic.data.repository.QueueRepository
import java.util.concurrent.ConcurrentHashMap
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class SendPatientQueueAlertUseCase @Inject constructor(
    private val queueRepository: QueueRepository
) {
    private val alertCooldowns = ConcurrentHashMap<String, Long>()

    suspend operator fun invoke(
        appointmentId: String,
        alertType: String,
        doctorId: String? = null,
        patientName: String,
        doctorName: String? = null,
        trackingCode: String,
        queuePosition: Int = 1,
        estTimeText: String? = null,
        roomNumber: String? = null,
        isWalkinWithoutAccount: Boolean = false,
        cooldownSeconds: Long = 60L
    ): Result<Boolean> {
        if (isWalkinWithoutAccount) {
            return Result.failure(IllegalStateException("Cannot send alert: Walk-in patient has no app account"))
        }

        val normalizedType = alertType.lowercase().trim()
        val cooldownKey = "${appointmentId}_$normalizedType"
        val now = System.currentTimeMillis()
        val lastSent = alertCooldowns[cooldownKey]

        if (lastSent != null && (now - lastSent) < (cooldownSeconds * 1000L)) {
            val remainingSec = ((cooldownSeconds * 1000L - (now - lastSent)) / 1000L).coerceAtLeast(1)
            return Result.failure(IllegalStateException("Alert recently sent. Please wait $remainingSec seconds before sending again."))
        }

        return try {
            val ok = if (normalizedType == "call_in" || normalizedType == "turn_call" || normalizedType == "call_inside") {
                queueRepository.notifyCallInside(
                    appointmentId = appointmentId,
                    patientName = patientName,
                    doctorName = doctorName?.takeIf { it.isNotBlank() } ?: "Attending Physician",
                    trackingCode = trackingCode,
                    roomNumber = roomNumber
                )
            } else {
                val title = NotificationTemplate.ArriveSoon.buildTitle(queuePosition)
                val body = NotificationTemplate.ArriveSoon.buildMessage(
                    patientName = patientName,
                    code = trackingCode,
                    queuePosition = queuePosition,
                    estTime = estTimeText ?: "~ 10-15 mins"
                )
                queueRepository.sendManualNotification(
                    appointmentId = appointmentId,
                    title = title,
                    message = body,
                    type = "arrive_soon",
                    expectedTime = estTimeText,
                    trackingCode = trackingCode
                )
            }

            if (ok) {
                alertCooldowns[cooldownKey] = now
                Result.success(true)
            } else {
                Result.failure(IllegalStateException("Failed to dispatch alert notification"))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    fun clearCooldowns() {
        alertCooldowns.clear()
    }
}
