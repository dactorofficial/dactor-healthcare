package com.dactor.patient.data.model

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
    EARLY_ARRIVAL("early_arrival"),
    DOCTOR_NOT_ARRIVED("doctor_not_arrived"),
    DOCTOR_DELAYED("doctor_delayed"),
    WAIT_FEW_MINUTES("wait_few_minutes"),
    WAIT_FEW_MINS("wait_few_mins"),
    ARRIVE_SOON("arrive_soon");

    companion object {
        fun from(key: String?): NotificationType {
            if (key.isNullOrBlank()) return MANUAL_ALERT
            val normalized = key.trim().lowercase()
            return when (normalized) {
                "doctor_delayed", "doctor_delay" -> DOCTOR_DELAYED
                "doctor_not_arrived", "no_doctor" -> DOCTOR_NOT_ARRIVED
                "wait_few_mins" -> WAIT_FEW_MINS
                "wait_few_minutes", "brief_pause", "pause" -> WAIT_FEW_MINUTES
                "arrive_soon", "turn_approaching" -> ARRIVE_SOON
                "doctor_arrived", "doctor_arrival", "doctor_in" -> DOCTOR_ARRIVAL
                "doctor_status", "doctor_presence", "doctor_left", "doctor_away", "doctor_stepped_out" -> DOCTOR_STATUS
                else -> values().firstOrNull { it.key.equals(normalized, ignoreCase = true) } ?: MANUAL_ALERT
            }
        }
    }
}
