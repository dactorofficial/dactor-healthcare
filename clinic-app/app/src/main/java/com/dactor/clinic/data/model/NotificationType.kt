package com.dactor.clinic.data.model

enum class NotificationType(val key: String) {
    QUEUE_ALERT("queue_alert"),
    CLINIC_BREAK("clinic_break"),
    CLINIC_BROADCAST("clinic_broadcast"),
    LAB_REPORT("lab_report"),
    LAB_PROCESSING("lab_processing"),
    MANUAL_ALERT("manual_alert"),
    DOCTOR_ARRIVAL("doctor_arrival"),
    DOCTOR_STATUS("doctor_status"),
    BROADCAST("broadcast"),
    ANNOUNCEMENT("announcement"),
    PAYMENT_CONFIRMED("payment_confirmed"),
    APPOINTMENT_RESCHEDULED("appointment_rescheduled"),
    EARLY_ARRIVAL("early_arrival");

    companion object {
        fun from(key: String?): NotificationType {
            if (key.isNullOrBlank()) return MANUAL_ALERT
            val normalized = key.trim().lowercase()
            return when (normalized) {
                "doctor_arrived", "doctor_arrival", "doctor_in" -> DOCTOR_ARRIVAL
                "doctor_status", "doctor_presence", "doctor_left", "doctor_away", "doctor_stepped_out" -> DOCTOR_STATUS
                else -> values().firstOrNull { it.key.equals(normalized, ignoreCase = true) } ?: MANUAL_ALERT
            }
        }
    }
}
