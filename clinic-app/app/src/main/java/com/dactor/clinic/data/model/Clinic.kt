package com.dactor.clinic.data.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class Clinic(
    @SerialName("id") val id: String,
    @SerialName("name") val name: String,
    @SerialName("type") val type: String? = null,
    @SerialName("verification_status") val verificationStatus: String? = null,
    @SerialName("contact_phone") val contactPhone: String? = null,
    @SerialName("contact_email") val contactEmail: String? = null,
    @SerialName("address_text") val addressText: String? = null,
    @SerialName("latitude") val latitude: Double? = null,
    @SerialName("longitude") val longitude: Double? = null,
    @SerialName("geohash") val geohash: String? = null,
    @SerialName("auto_notify_threshold") val autoNotifyThreshold: Int? = null,
    @SerialName("description") val description: String? = null,
    @SerialName("logo_url") val logoUrl: String? = null,
    @SerialName("registration_doc_url") val registrationDocUrl: String? = null,
    @SerialName("pan_number") val panNumber: String? = null,
    @SerialName("manager_phone") val managerPhone: String? = null,
    @SerialName("pictures") val pictures: List<String> = emptyList(),
    @SerialName("specialties") val specialties: List<String> = emptyList(),
    @SerialName("is_archived") val isArchived: Boolean? = false,
    @SerialName("archived_at") val archivedAt: String? = null,
    @SerialName("deletion_scheduled_at") val deletionScheduledAt: String? = null,
    @SerialName("payment_gateway_provider") val paymentGatewayProvider: String? = "esewa",
    @SerialName("payment_api_key") val paymentApiKey: String? = null,
    @SerialName("payment_secret_key") val paymentSecretKey: String? = null,
    @SerialName("merchant_id") val merchantId: String? = null,
    @SerialName("is_direct_payment_enabled") val isDirectPaymentEnabled: Boolean? = false,
    @SerialName("payment_gateways_json") val paymentGatewaysJson: String? = null,
    @SerialName("is_activated") val isActivated: Boolean? = true,
    @SerialName("activation_expires_at") val activationExpiresAt: String? = null,
    @SerialName("activation_plan") val activationPlan: String? = "1_month",
    @SerialName("activation_paid_amount") val activationPaidAmount: Double? = 0.0,
    @SerialName("activation_notes") val activationNotes: String? = null,
    @SerialName("activation_payment_proof_url") val activationPaymentProofUrl: String? = null,
    @SerialName("avg_consultation_time_minutes") val avgConsultationTimeMinutes: Int? = 10,
    @SerialName("manual_avg_consultation_time_minutes") val manualAvgConsultationTimeMinutes: Int? = 10,
    @SerialName("calculated_avg_consultation_time_minutes") val calculatedAvgConsultationTimeMinutes: Int? = null,
    @SerialName("avg_time_mode") val avgTimeMode: String? = "auto",
    @SerialName("is_on_break") val isOnBreak: Boolean? = false,
    @SerialName("break_updated_at") val breakUpdatedAt: String? = null,
    @SerialName("weekly_schedule_json") val weeklyScheduleJson: String? = null,
    @SerialName("declared_holidays") val declaredHolidays: List<String> = emptyList()
) {
    fun getPaymentGatewaysConfig(): PaymentGatewaysConfig {
        return PaymentGatewaysConfig.parse(
            rawJson = paymentGatewaysJson,
            fallbackProvider = paymentGatewayProvider,
            fallbackMerchantId = merchantId,
            fallbackApiKey = paymentApiKey,
            fallbackSecretKey = paymentSecretKey
        )
    }

    fun getWeeklySchedule(): List<DayScheduleInfo> {
        return ClinicScheduleHelper.parseWeeklySchedule(weeklyScheduleJson)
    }

    fun getScheduleForDate(dateStr: String): DayScheduleInfo {
        return ClinicScheduleHelper.getScheduleForDate(weeklyScheduleJson, dateStr)
    }

    fun getTodaySchedule(): DayScheduleInfo {
        return ClinicScheduleHelper.getTodaySchedule(weeklyScheduleJson)
    }

    fun isHolidayOnDate(dateStr: String): Boolean {
        return declaredHolidays.any { it.trim() == dateStr.trim() }
    }

    fun getEffectiveAvgMinutes(): Int {
        val manual = (manualAvgConsultationTimeMinutes ?: avgConsultationTimeMinutes ?: 10).coerceAtLeast(1)
        val calc = calculatedAvgConsultationTimeMinutes
        return when (avgTimeMode) {
            "manual" -> manual
            "calculated" -> if (calc != null && calc > 0) calc else manual
            else -> {
                if (calc != null && calc > 0 && kotlin.math.abs(calc - manual) <= 5) calc else manual
            }
        }
    }
}

@Serializable
data class DayScheduleInfo(
    val dayOfWeek: String,
    val displayName: String,
    val isOpen: Boolean = true,
    val openTime: String = "08:00 AM",
    val closeTime: String = "05:00 PM",
    val hasBreak: Boolean = true,
    val breakStart: String = "01:00 PM",
    val breakEnd: String = "02:00 PM"
) {
    val dayName: String get() = displayName
}

object ClinicScheduleHelper {
    private val json = kotlinx.serialization.json.Json {
        ignoreUnknownKeys = true
        isLenient = true
        encodeDefaults = true
    }

    val defaultDays = listOf(
        DayScheduleInfo("SUNDAY", "Sunday", isOpen = true, openTime = "08:00 AM", closeTime = "05:00 PM", hasBreak = true, breakStart = "01:00 PM", breakEnd = "02:00 PM"),
        DayScheduleInfo("MONDAY", "Monday", isOpen = true, openTime = "08:00 AM", closeTime = "05:00 PM", hasBreak = true, breakStart = "01:00 PM", breakEnd = "02:00 PM"),
        DayScheduleInfo("TUESDAY", "Tuesday", isOpen = true, openTime = "08:00 AM", closeTime = "05:00 PM", hasBreak = true, breakStart = "01:00 PM", breakEnd = "02:00 PM"),
        DayScheduleInfo("WEDNESDAY", "Wednesday", isOpen = true, openTime = "08:00 AM", closeTime = "05:00 PM", hasBreak = true, breakStart = "01:00 PM", breakEnd = "02:00 PM"),
        DayScheduleInfo("THURSDAY", "Thursday", isOpen = true, openTime = "08:00 AM", closeTime = "05:00 PM", hasBreak = true, breakStart = "01:00 PM", breakEnd = "02:00 PM"),
        DayScheduleInfo("FRIDAY", "Friday", isOpen = true, openTime = "08:00 AM", closeTime = "05:00 PM", hasBreak = true, breakStart = "01:00 PM", breakEnd = "02:00 PM"),
        DayScheduleInfo("SATURDAY", "Saturday", isOpen = false, openTime = "08:00 AM", closeTime = "02:00 PM", hasBreak = false, breakStart = "12:00 PM", breakEnd = "12:30 PM")
    )

    fun defaultWeeklySchedule(): List<DayScheduleInfo> = defaultDays

    fun parseWeeklySchedule(rawJson: String?): List<DayScheduleInfo> {
        if (rawJson.isNullOrBlank()) return defaultDays
        return try {
            val parsed = json.decodeFromString<List<DayScheduleInfo>>(rawJson)
            if (parsed.size == 7) parsed else {
                defaultDays.map { def ->
                    parsed.find { it.dayOfWeek.equals(def.dayOfWeek, ignoreCase = true) } ?: def
                }
            }
        } catch (e: Exception) {
            defaultDays
        }
    }

    fun encodeWeeklySchedule(days: List<DayScheduleInfo>): String {
        return json.encodeToString(kotlinx.serialization.builtins.ListSerializer(DayScheduleInfo.serializer()), days)
    }

    fun getScheduleForDate(rawJson: String?, dateStr: String): DayScheduleInfo {
        val schedule = parseWeeklySchedule(rawJson)
        val dayName = try {
            java.time.LocalDate.parse(dateStr.take(10)).dayOfWeek.name
        } catch (e: Exception) {
            java.time.LocalDate.now().dayOfWeek.name
        }
        return schedule.find { it.dayOfWeek.equals(dayName, ignoreCase = true) }
            ?: defaultDays.first()
    }

    fun getTodaySchedule(rawJson: String?): DayScheduleInfo {
        return getScheduleForDate(rawJson, java.time.LocalDate.now().toString())
    }

    fun parseTimeToLocalTime(timeStr: String?): java.time.LocalTime {
        if (timeStr.isNullOrBlank()) return java.time.LocalTime.of(8, 0)
        val clean = timeStr.trim().uppercase()
        val regex = Regex("""^(\d{1,2}):(\d{2})(?::\d{2})?(?:\s*([AP]M))?""")
        val match = regex.find(clean)
        if (match != null) {
            var hours = match.groupValues[1].toInt()
            val minutes = match.groupValues[2].toInt()
            val ampm = match.groupValues[3]
            if (ampm == "PM" && hours < 12) hours += 12
            else if (ampm == "AM" && hours == 12) hours = 0
            try {
                return java.time.LocalTime.of(hours, minutes)
            } catch (_: Exception) {}
        }
        val formatters = listOf(
            java.time.format.DateTimeFormatter.ofPattern("HH:mm:ss", java.util.Locale.US),
            java.time.format.DateTimeFormatter.ofPattern("H:mm:ss", java.util.Locale.US),
            java.time.format.DateTimeFormatter.ofPattern("hh:mm:ss a", java.util.Locale.US),
            java.time.format.DateTimeFormatter.ofPattern("h:mm:ss a", java.util.Locale.US),
            java.time.format.DateTimeFormatter.ofPattern("hh:mm a", java.util.Locale.US),
            java.time.format.DateTimeFormatter.ofPattern("h:mm a", java.util.Locale.US),
            java.time.format.DateTimeFormatter.ofPattern("HH:mm", java.util.Locale.US),
            java.time.format.DateTimeFormatter.ofPattern("H:mm", java.util.Locale.US),
            java.time.format.DateTimeFormatter.ofPattern("h:mma", java.util.Locale.US),
            java.time.format.DateTimeFormatter.ofPattern("hh:mma", java.util.Locale.US)
        )
        for (fmt in formatters) {
            try {
                return java.time.LocalTime.parse(clean, fmt)
            } catch (ignored: Exception) {}
        }
        return java.time.LocalTime.of(8, 0)
    }

    fun parseTimeMinutes(timeStr: String?): Int? {
        if (timeStr.isNullOrBlank()) return null
        return try {
            val localTime = parseTimeToLocalTime(timeStr)
            localTime.hour * 60 + localTime.minute
        } catch (_: Exception) {
            null
        }
    }

    fun formatMinutesTo12Hour(minutes: Int): String {
        val hour24 = (minutes / 60) % 24
        val minute = minutes % 60
        val amPm = if (hour24 >= 12) "PM" else "AM"
        val hour12 = if (hour24 == 0) 12 else if (hour24 > 12) hour24 - 12 else hour24
        return String.format(java.util.Locale.US, "%02d:%02d %s", hour12, minute, amPm)
    }
}


