package com.dactor.clinic.data.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class DactorNotification(
    @SerialName("id") val id: String = "",
    @SerialName("user_id") val userId: String? = null,
    @SerialName("appointment_id") val appointmentId: String? = null,
    @SerialName("title") val title: String = "",
    @SerialName("message") val message: String = "",
    @SerialName("type") val type: String? = null,
    @SerialName("target_audience") val targetAudience: String? = null,
    @SerialName("is_read") val isRead: Boolean = false,
    @SerialName("created_at") val createdAt: String? = null
) {
    fun toTemplateData(): NotificationTemplateData = NotificationTemplateData.fromNotification(title, message, type ?: "queue_alert")
}

data class NotificationTemplateData(
    val title: String,
    val cleanMessage: String,
    val leftLabel: String,
    val leftValue: String,
    val rightLabel: String,
    val rightValue: String,
    val trackingCode: String? = null
) {
    companion object {
        private val META_REGEX = Regex("""\[\[META:(.*?)]]""", RegexOption.DOT_MATCHES_ALL)

        fun buildMessageWithMeta(
            cleanMessage: String,
            leftLabel: String = "Estimated Time Left",
            leftValue: String,
            rightLabel: String = "Your Appointment Time",
            rightValue: String,
            trackingCode: String? = null
        ): String {
            val safeLeftLabel = leftLabel.replace("|", "/").replace("]", "")
            val safeLeftVal = leftValue.replace("|", "/").replace("]", "")
            val safeRightLabel = rightLabel.replace("|", "/").replace("]", "")
            val safeRightVal = rightValue.replace("|", "/").replace("]", "")
            val codePart = if (!trackingCode.isNullOrBlank()) "|code=${trackingCode.trim()}" else ""
            return "${cleanMessage.trim()}\n[[META:leftLabel=$safeLeftLabel|leftVal=$safeLeftVal|rightLabel=$safeRightLabel|rightVal=$safeRightVal$codePart]]"
        }

        fun fromNotification(title: String, rawMessage: String, type: String = "queue_alert"): NotificationTemplateData {
            val match = META_REGEX.find(rawMessage)
            val cleanMsg = rawMessage.replace(META_REGEX, "").trim()

            val isFirstPosition = cleanMsg.contains("position 1", ignoreCase = true) ||
                cleanMsg.contains("next in line", ignoreCase = true) ||
                cleanMsg.contains("called inside", ignoreCase = true) ||
                cleanMsg.contains("arrive fast", ignoreCase = true) ||
                cleanMsg.contains("arrive soon", ignoreCase = true) ||
                title.contains("You're Next", ignoreCase = true)

            val notifType = NotificationType.from(type)
            val isArriveSoon = notifType == NotificationType.ARRIVE_SOON ||
                title.contains("Arrive Soon", ignoreCase = true) ||
                cleanMsg.contains("arrive soon", ignoreCase = true)

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

                val effectiveRightVal = if (isArriveSoon) {
                    map["rightVal"]?.takeIf { it.isNotBlank() } ?: if (isFirstPosition) "Your turn, arrive soon" else "Active Queue"
                } else if (isFirstPosition) {
                    "Your turn, arrive soon"
                } else {
                    rawRightVal
                }

                val effectiveLeftVal = if (isArriveSoon) {
                    "Arrive Soon"
                } else if (isFirstPosition) {
                    "Arrive Soon"
                } else {
                    rawLeftVal
                }

                return NotificationTemplateData(
                    title = title.ifBlank { if (isArriveSoon) "Arrive Soon \u2022 Turn Approaching" else "Your Turn is Coming Soon!" },
                    cleanMessage = cleanMsg,
                    leftLabel = if (isArriveSoon) "Turn Status" else (map["leftLabel"]?.takeIf { it.isNotBlank() }?.let { if (it.length > 15) "Estimated Time" else it } ?: "Estimated Time"),
                    leftValue = effectiveLeftVal,
                    rightLabel = if (isArriveSoon) "Queue Position" else if (effectiveRightVal.contains("arrive fast", ignoreCase = true) || effectiveRightVal.contains("arrive soon", ignoreCase = true)) "Turn Status" else (map["rightLabel"]?.takeIf { it.isNotBlank() }?.let { if (it.length > 15) "Your Appointment" else it } ?: "Your Appointment"),
                    rightValue = effectiveRightVal,
                    trackingCode = map["code"]
                )
            }

            val waitMatch = Regex("""(~?\s*\d+\s*(?:min|mins|minute|minutes)|Soon,?\s*be\s*ready!?|Now\s*Inside|Arrive\s*Fast|Arrive\s*Soon)""", RegexOption.IGNORE_CASE).find(cleanMsg)
            val timeMatch = Regex("""(\d{1,2}:\d{2}\s*(?:AM|PM))""", RegexOption.IGNORE_CASE).find(cleanMsg)

            return when {
                notifType in listOf(NotificationType.LAB_REPORT, NotificationType.LAB_PROCESSING) || title.contains("Report", ignoreCase = true) -> NotificationTemplateData(
                    title = title.ifBlank { "Lab Report Prepared" },
                    cleanMessage = cleanMsg,
                    leftLabel = "Report Status",
                    leftValue = "Prepared",
                    rightLabel = "Availability",
                    rightValue = "Ready to View"
                )
                notifType == NotificationType.CLINIC_BREAK || title.contains("Break", ignoreCase = true) -> NotificationTemplateData(
                    title = title.ifBlank { "Clinic is on Break" },
                    cleanMessage = cleanMsg,
                    leftLabel = "Estimated Time",
                    leftValue = "Clinic on Break",
                    rightLabel = "Your Appointment",
                    rightValue = timeMatch?.groupValues?.get(1) ?: "Paused Briefly"
                )
                notifType == NotificationType.ARRIVE_SOON ||
                    title.contains("Arrive Soon", ignoreCase = true) ||
                    cleanMsg.contains("arrive soon", ignoreCase = true) -> NotificationTemplateData(
                    title = title.ifBlank { "Arrive Soon \u2022 Turn Approaching" },
                    cleanMessage = cleanMsg,
                    leftLabel = "Turn Status",
                    leftValue = "Arrive Soon",
                    rightLabel = "Queue Position",
                    rightValue = if (isFirstPosition) "Your turn, arrive soon" else (waitMatch?.groupValues?.get(1) ?: "Be Ready"),
                    trackingCode = null
                )
                notifType in listOf(NotificationType.BROADCAST, NotificationType.ANNOUNCEMENT) -> NotificationTemplateData(
                    title = title.ifBlank { "Dactor Announcement" },
                    cleanMessage = cleanMsg,
                    leftLabel = "",
                    leftValue = "",
                    rightLabel = "",
                    rightValue = ""
                )
                else -> {
                    val fallbackRightVal = if (isFirstPosition) "Your turn, arrive soon" else (timeMatch?.groupValues?.get(1)?.trim() ?: "Soon, be ready")
                    val fallbackLeftVal = if (isFirstPosition) "Arrive Soon" else (waitMatch?.groupValues?.get(1)?.trim() ?: "Soon, be ready")
                    NotificationTemplateData(
                        title = title.ifBlank { "Your Turn is Coming Soon!" },
                        cleanMessage = cleanMsg,
                        leftLabel = "Estimated Time",
                        leftValue = fallbackLeftVal,
                        rightLabel = if (fallbackRightVal.contains("arrive fast", ignoreCase = true) || fallbackRightVal.contains("arrive soon", ignoreCase = true)) "Turn Status" else "Your Appointment",
                        rightValue = fallbackRightVal
                    )
                }
            }
        }
    }
}
