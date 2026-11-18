package com.dactor.clinic.domain.usecase.queue

import com.dactor.clinic.data.model.NotificationTemplate
import com.dactor.clinic.data.repository.QueueRepository
import com.dactor.clinic.ui.queue.QueueItemUi
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
            return Result.failure(IllegalStateException("Cannot send push notification to walk-in patient without an app account"))
        }

        val normalizedType = alertType.lowercase().trim()
        val canonicalType = when (normalizedType) {
            "call_in", "turn_call", "call_inside" -> "call_inside"
            else -> normalizedType
        }
        val cooldownKey = "${appointmentId}_$canonicalType"
        val now = System.currentTimeMillis()

        val lastSent = synchronized(alertCooldowns) {
            val prior = alertCooldowns[cooldownKey]
            if (prior != null && (now - prior) < (cooldownSeconds * 1000L)) {
                val remainingSec = ((cooldownSeconds * 1000L - (now - prior)) / 1000L).coerceAtLeast(1)
                return Result.failure(IllegalStateException("Alert recently sent. Please wait $remainingSec seconds before sending again."))
            }
            alertCooldowns[cooldownKey] = now
            prior
        }

        return try {
            val ok = if (canonicalType == "call_inside") {
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
                synchronized(alertCooldowns) {
                    alertCooldowns[cooldownKey] = System.currentTimeMillis()
                }
                Result.success(true)
            } else {
                synchronized(alertCooldowns) {
                    if (lastSent != null) {
                        alertCooldowns[cooldownKey] = lastSent
                    } else {
                        alertCooldowns.remove(cooldownKey)
                    }
                }
                Result.failure(IllegalStateException("Failed to dispatch alert notification"))
            }
        } catch (e: Exception) {
            synchronized(alertCooldowns) {
                if (lastSent != null) {
                    alertCooldowns[cooldownKey] = lastSent
                } else {
                    alertCooldowns.remove(cooldownKey)
                }
            }
            Result.failure(e)
        }
    }

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
        isWalkin: Boolean = false,
        userId: String? = null,
        cooldownSeconds: Long = 60L
    ): Result<Boolean> {
        val isWalkinWithoutAccount = isWalkin && userId.isNullOrBlank()
        return invoke(
            appointmentId = appointmentId,
            alertType = alertType,
            doctorId = doctorId,
            patientName = patientName,
            doctorName = doctorName,
            trackingCode = trackingCode,
            queuePosition = queuePosition,
            estTimeText = estTimeText,
            roomNumber = roomNumber,
            isWalkinWithoutAccount = isWalkinWithoutAccount,
            cooldownSeconds = cooldownSeconds
        )
    }

    suspend operator fun invoke(
        item: QueueItemUi,
        alertType: String,
        doctorId: String? = null,
        doctorName: String? = null,
        estTimeText: String? = null,
        roomNumber: String? = null,
        cooldownSeconds: Long = 60L
    ): Result<Boolean> {
        return invoke(
            appointmentId = item.appointmentId,
            alertType = alertType,
            doctorId = doctorId ?: item.doctorId,
            patientName = item.patientName,
            doctorName = doctorName ?: item.doctorName,
            trackingCode = item.trackingCode,
            queuePosition = item.queuePosition,
            estTimeText = estTimeText,
            roomNumber = roomNumber,
            isWalkin = item.isWalkin,
            userId = item.userId,
            cooldownSeconds = cooldownSeconds
        )
    }

    fun clearCooldowns() {
        alertCooldowns.clear()
    }
}
