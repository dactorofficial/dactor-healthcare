package com.dactor.patient.data.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class DactorNotification(
    val id: String = "",
    @SerialName("user_id") val userId: String? = null,
    @SerialName("appointment_id") val appointmentId: String? = null,
    val title: String = "",
    val message: String = "",
    val type: String = "broadcast",
    @SerialName("target_audience") val targetAudience: String? = null,
    @SerialName("is_read") val isRead: Boolean = false,
    @SerialName("created_at") val createdAt: String = ""
) {
    fun toTemplateData(): NotificationTemplateData = NotificationTemplateData.fromNotification(title, message, type)
}

data class NotificationTemplateData(
    val title: String,
    val cleanMessage: String,
    val leftLabel: String,
    val leftValue: String,
    val rightLabel: String,
    val rightValue: String,
    val trackingCode: String? = null,
    val isQueueReminder: Boolean = false,
    val statusBadge: String? = null
) {
    companion object {
        private val META_REGEX = Regex("""\[\[META:(.*?)]]""", RegexOption.DOT_MATCHES_ALL)

        fun parseSlotTime(raw: String): java.time.LocalTime? {
            val clean = raw.trim()
            val match = Regex("""(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?""", RegexOption.IGNORE_CASE).find(clean)
            if (match != null) {
                var hours = match.groupValues[1].toInt()
                val minutes = match.groupValues[2].toInt()
                val ampm = match.groupValues[3].uppercase()
                if (ampm == "PM" && hours < 12) hours += 12
                else if (ampm == "AM" && hours == 12) hours = 0
                return try {
                    java.time.LocalTime.of(hours, minutes)
                } catch (_: Exception) {
                    null
                }
            }
            return null
        }

        fun formatSlotWindow(slotTimeStr: String?, avgConsultationMinutes: Int = 10): String {
            if (slotTimeStr.isNullOrBlank()) return ""
            val clean = slotTimeStr.trim()
            if (clean.contains(" - ") || clean.contains(" – ") || clean.contains(" — ") || clean.contains(" to ", ignoreCase = true)) {
                return clean
            }
            val time = parseSlotTime(clean) ?: return clean
            val spread = avgConsultationMinutes.coerceAtLeast(1)
            val startTime = time.minusMinutes(spread.toLong())
            val endTime = time.plusMinutes(spread.toLong())

            val startAmPm = if (startTime.hour < 12) "AM" else "PM"
            val endAmPm = if (endTime.hour < 12) "AM" else "PM"

            val startHour = when (val h = startTime.hour % 12) {
                0 -> 12
                else -> h
            }
            val endHour = when (val h = endTime.hour % 12) {
                0 -> 12
                else -> h
            }

            val startMin = startTime.minute.toString().padStart(2, '0')
            val endMin = endTime.minute.toString().padStart(2, '0')

            return if (startAmPm == endAmPm) {
                "$startHour:$startMin - $endHour:$endMin $endAmPm"
            } else {
                "$startHour:$startMin $startAmPm - $endHour:$endMin $endAmPm"
            }
        }

        fun calculateApproximateSlotWindow(
            slotTimeStr: String?,
            avgConsultationMinutes: Int = 10,
            includeTolerance: Boolean = true
        ): String {
            if (slotTimeStr.isNullOrBlank()) return ""
            val clean = slotTimeStr.trim()
            if (clean.contains("±")) return clean

            val toleranceSuffix = if (includeTolerance && avgConsultationMinutes > 0) " (±${avgConsultationMinutes}m)" else ""

            if (clean.contains(" - ") || clean.contains(" – ") || clean.contains(" — ") || clean.contains(" to ", ignoreCase = true)) {
                return if (includeTolerance && !clean.contains("±")) "$clean$toleranceSuffix" else clean
            }

            val time = parseSlotTime(clean) ?: return clean
            val spread = avgConsultationMinutes.coerceAtLeast(1)
            val startTime = time.minusMinutes(spread.toLong())
            val endTime = time.plusMinutes(spread.toLong())

            val startAmPm = if (startTime.hour < 12) "AM" else "PM"
            val endAmPm = if (endTime.hour < 12) "AM" else "PM"

            val startHour = when (val h = startTime.hour % 12) {
                0 -> 12
                else -> h
            }
            val endHour = when (val h = endTime.hour % 12) {
                0 -> 12
                else -> h
            }

            val startMin = startTime.minute.toString().padStart(2, '0')
            val endMin = endTime.minute.toString().padStart(2, '0')

            return "$startHour:$startMin $startAmPm - $endHour:$endMin $endAmPm$toleranceSuffix"
        }

        fun buildMessageWithMeta(
            cleanMessage: String,
            leftLabel: String = "Estimated Time Left",
            leftValue: String,
            rightLabel: String = "Your Appointment Time",
            rightValue: String,
            trackingCode: String? = null,
            statusBadge: String? = null
        ): String {
            val safeLeftLabel = leftLabel.replace("|", "/").replace("]", "")
            val safeLeftVal = leftValue.replace("|", "/").replace("]", "")
            val safeRightLabel = rightLabel.replace("|", "/").replace("]", "")
            val safeRightVal = rightValue.replace("|", "/").replace("]", "")
            val codePart = if (!trackingCode.isNullOrBlank()) "|code=${trackingCode.trim()}" else ""
            val badgePart = if (!statusBadge.isNullOrBlank()) "|statusBadge=${statusBadge.trim()}" else ""
            return "${cleanMessage.trim()}\n[[META:leftLabel=$safeLeftLabel|leftVal=$safeLeftVal|rightLabel=$safeRightLabel|rightVal=$safeRightVal$codePart$badgePart]]"
        }

        fun fromNotification(title: String, rawMessage: String, type: String = "queue_alert"): NotificationTemplateData {
            val match = META_REGEX.find(rawMessage)
            val cleanMsg = rawMessage.replace(META_REGEX, "").trim()

            val notifType = NotificationType.from(type)
            val isQueueReminderType = notifType in listOf(
                NotificationType.QUEUE_ALERT,
                NotificationType.DOCTOR_ARRIVAL,
                NotificationType.MANUAL_ALERT,
                NotificationType.DOCTOR_NOT_ARRIVED,
                NotificationType.DOCTOR_DELAYED,
                NotificationType.WAIT_FEW_MINUTES,
                NotificationType.WAIT_FEW_MINS,
                NotificationType.ARRIVE_SOON,
                NotificationType.DOCTOR_STATUS
            ) ||
                title.contains("Queue", ignoreCase = true) ||
                title.contains("Turn", ignoreCase = true) ||
                title.contains("Doctor", ignoreCase = true) ||
                title.contains("Wait", ignoreCase = true) ||
                title.contains("Arrive", ignoreCase = true) ||
                cleanMsg.contains("queue", ignoreCase = true) ||
                cleanMsg.contains("your turn", ignoreCase = true) ||
                cleanMsg.contains("token #", ignoreCase = true) ||
                cleanMsg.contains("not arrived", ignoreCase = true) ||
                cleanMsg.contains("wait few", ignoreCase = true) ||
                cleanMsg.contains("arrive soon", ignoreCase = true)

            val isFirstPosition = cleanMsg.contains("position 1", ignoreCase = true) ||
                cleanMsg.contains("next in line", ignoreCase = true) ||
                cleanMsg.contains("called inside", ignoreCase = true) ||
                cleanMsg.contains("arrive fast", ignoreCase = true) ||
                title.contains("You're Next", ignoreCase = true)

            val derivedBadge = when {
                notifType in listOf(NotificationType.DOCTOR_NOT_ARRIVED, NotificationType.DOCTOR_DELAYED) || title.contains("Doctor Delayed", ignoreCase = true) -> "DOCTOR DELAYED"
                notifType in listOf(NotificationType.WAIT_FEW_MINUTES, NotificationType.WAIT_FEW_MINS) || title.contains("Wait", ignoreCase = true) -> "WAIT A FEW MINS"
                notifType == NotificationType.ARRIVE_SOON || title.contains("Arrive Soon", ignoreCase = true) -> {
                    val posMatch = Regex("""(?:#|position\s*|queue\s*#?)(\d+)""", RegexOption.IGNORE_CASE).find(title + " " + cleanMsg)
                    val pos = posMatch?.groupValues?.get(1) ?: "2"
                    "ARRIVE SOON • #$pos"
                }
                notifType == NotificationType.EARLY_ARRIVAL -> "DOCTOR FREE NOW"
                notifType == NotificationType.CLINIC_BREAK -> "CLINIC BREAK"
                notifType in listOf(NotificationType.LAB_REPORT, NotificationType.LAB_PROCESSING) -> "LAB STATUS"
                isFirstPosition -> "CALLING INSIDE"
                else -> "ACTIVE QUEUE"
            }

            if (match != null) {
                val content = match.groupValues[1]
                val map = mutableMapOf<String, String>()
                content.split("|").forEach { pair ->
                    val idx = pair.indexOf('=')
                    if (idx > 0) {
                        val k = pair.substring(0, idx).trim()
                        val v = pair.substring(idx + 1).trim()
                        map[k] = v
                    }
                }
                val rawRightVal = map["rightVal"]?.takeIf { it.isNotBlank() } ?: "Active Queue"
                val rawLeftVal = map["leftVal"]?.takeIf { it.isNotBlank() } ?: "Soon, be ready"

                val effectiveRightVal = if (isFirstPosition) {
                    "Your turn, arrive fast"
                } else {
                    rawRightVal
                }

                val effectiveLeftVal = if (isFirstPosition) {
                    "Arrive Fast"
                } else {
                    rawLeftVal
                }

                return NotificationTemplateData(
                    title = title.ifBlank { "Your Turn is Coming Soon!" },
                    cleanMessage = cleanMsg,
                    leftLabel = map["leftLabel"]?.takeIf { it.isNotBlank() }?.let { if (it.length > 25) "Estimated Time" else it } ?: "Estimated Time",
                    leftValue = effectiveLeftVal,
                    rightLabel = if (effectiveRightVal.contains("arrive fast", ignoreCase = true)) "Turn Status" else (map["rightLabel"]?.takeIf { it.isNotBlank() }?.let { if (it.length > 25) "Your Appointment" else it } ?: "Your Appointment"),
                    rightValue = effectiveRightVal,
                    trackingCode = map["code"] ?: map["trackingCode"],
                    isQueueReminder = isQueueReminderType || notifType == NotificationType.MANUAL_ALERT,
                    statusBadge = map["statusBadge"]?.takeIf { it.isNotBlank() } ?: derivedBadge
                )
            }

            // Fallback extraction if no explicit [[META:...]] tag is present
            val waitMatch = Regex("""(~?\s*\d+\s*(?:min|mins|minute|minutes)|Soon,?\s*be\s*ready!?|Now\s*Inside|Arrive\s*Fast)""", RegexOption.IGNORE_CASE).find(cleanMsg)
            val timeMatch = Regex("""(\d{1,2}:\d{2}\s*(?:AM|PM))""", RegexOption.IGNORE_CASE).find(cleanMsg)

            return when {
                notifType in listOf(NotificationType.LAB_REPORT, NotificationType.LAB_PROCESSING) || title.contains("Report", ignoreCase = true) -> NotificationTemplateData(
                    title = title.ifBlank { "Lab Report Prepared" },
                    cleanMessage = cleanMsg,
                    leftLabel = "Report Status",
                    leftValue = "Prepared",
                    rightLabel = "Availability",
                    rightValue = "Ready to View",
                    isQueueReminder = false,
                    statusBadge = derivedBadge
                )
                notifType == NotificationType.CLINIC_BREAK || title.contains("Break", ignoreCase = true) -> NotificationTemplateData(
                    title = title.ifBlank { "Clinic is on Break" },
                    cleanMessage = cleanMsg,
                    leftLabel = "Estimated Time",
                    leftValue = "Clinic on Break",
                    rightLabel = "Your Appointment",
                    rightValue = timeMatch?.groupValues?.get(1) ?: "Paused Briefly",
                    isQueueReminder = false,
                    statusBadge = derivedBadge
                )
                notifType in listOf(NotificationType.DOCTOR_NOT_ARRIVED, NotificationType.DOCTOR_DELAYED) ||
                    title.contains("Not Arrived", ignoreCase = true) ||
                    title.contains("Doctor Delayed", ignoreCase = true) ||
                    cleanMsg.contains("has not arrived", ignoreCase = true) ||
                    cleanMsg.contains("not arrived yet", ignoreCase = true) -> NotificationTemplateData(
                    title = title.ifBlank { "Doctor Has Not Arrived Yet" },
                    cleanMessage = cleanMsg,
                    leftLabel = "Doctor Status",
                    leftValue = "Not Arrived / Delayed",
                    rightLabel = "Est. Arrival",
                    rightValue = timeMatch?.groupValues?.get(1) ?: waitMatch?.groupValues?.get(1) ?: "Expected shortly",
                    isQueueReminder = true,
                    statusBadge = derivedBadge
                )
                notifType in listOf(NotificationType.WAIT_FEW_MINUTES, NotificationType.WAIT_FEW_MINS) ||
                    title.contains("Wait", ignoreCase = true) ||
                    cleanMsg.contains("wait for few", ignoreCase = true) ||
                    cleanMsg.contains("brief pause", ignoreCase = true) ||
                    cleanMsg.contains("wait few minutes", ignoreCase = true) -> NotificationTemplateData(
                    title = title.ifBlank { "Please Wait a Few Minutes" },
                    cleanMessage = cleanMsg,
                    leftLabel = "Queue Status",
                    leftValue = "Brief Pause",
                    rightLabel = "Estimated Wait",
                    rightValue = waitMatch?.groupValues?.get(1) ?: "~ 5-10 mins",
                    isQueueReminder = true,
                    statusBadge = derivedBadge
                )
                notifType == NotificationType.ARRIVE_SOON ||
                    title.contains("Arrive Soon", ignoreCase = true) ||
                    cleanMsg.contains("arrive soon", ignoreCase = true) -> NotificationTemplateData(
                    title = title.ifBlank { "Arrive Soon • Turn Approaching" },
                    cleanMessage = cleanMsg,
                    leftLabel = "Turn Status",
                    leftValue = "Arrive Soon",
                    rightLabel = "Queue Position",
                    rightValue = if (isFirstPosition) "Your turn, arrive fast" else (waitMatch?.groupValues?.get(1) ?: "Be Ready"),
                    isQueueReminder = true,
                    statusBadge = derivedBadge
                )
                notifType in listOf(NotificationType.BROADCAST, NotificationType.ANNOUNCEMENT) -> NotificationTemplateData(
                    title = title.ifBlank { "Dactor Announcement" },
                    cleanMessage = cleanMsg,
                    leftLabel = "",
                    leftValue = "",
                    rightLabel = "",
                    rightValue = "",
                    isQueueReminder = false,
                    statusBadge = derivedBadge
                )
                else -> {
                    val fallbackRightVal = if (isFirstPosition) "Your turn, arrive fast" else (timeMatch?.groupValues?.get(1)?.trim() ?: "Soon, be ready")
                    val fallbackLeftVal = if (isFirstPosition) "Arrive Fast" else (waitMatch?.groupValues?.get(1)?.trim() ?: "Soon, be ready")
                    NotificationTemplateData(
                        title = title.ifBlank { "Your Turn is Coming Soon!" },
                        cleanMessage = cleanMsg,
                        leftLabel = "Estimated Time",
                        leftValue = fallbackLeftVal,
                        rightLabel = if (fallbackRightVal.contains("arrive fast", ignoreCase = true)) "Turn Status" else "Your Appointment",
                        rightValue = fallbackRightVal,
                        isQueueReminder = isQueueReminderType,
                        statusBadge = derivedBadge
                    )
                }
            }
        }
    }
}
