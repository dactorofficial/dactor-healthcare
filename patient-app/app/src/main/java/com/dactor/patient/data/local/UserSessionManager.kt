package com.dactor.patient.data.local

import android.content.Context
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.serialization.builtins.serializer
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class UserSessionManager @Inject constructor(
    @ApplicationContext private val context: Context
) {
    private val prefs = context.getSharedPreferences("dactor_patient_session", Context.MODE_PRIVATE)

    fun savePatientSession(
        patientId: String,
        email: String,
        name: String,
        phone: String,
        gender: String? = null,
        age: Int? = null,
        isArchived: Boolean = false,
        deletionScheduledAt: String? = null
    ) {
        prefs.edit()
            .putString("patient_id", patientId)
            .putString("user_email", email.trim().lowercase())
            .putString("user_name", name.trim())
            .putString("user_phone", phone.trim())
            .putString("user_gender", gender)
            .putInt("user_age", age ?: 0)
            .putBoolean("is_archived", isArchived)
            .putString("deletion_scheduled_at", deletionScheduledAt)
            .putBoolean("is_logged_in", true)
            .putBoolean("is_guest_mode", false)
            .putBoolean("has_seen_onboarding", true)
            .apply()
    }

    fun updateProfileInfo(name: String, phone: String, gender: String?, age: Int?) {
        val editor = prefs.edit()
            .putString("user_name", name.trim())
            .putString("user_phone", phone.trim())
        if (gender != null) editor.putString("user_gender", gender)
        if (age != null) editor.putInt("user_age", age)
        editor.apply()
    }

    fun setArchivedStatus(isArchived: Boolean, deletionScheduledAt: String?) {
        prefs.edit()
            .putBoolean("is_archived", isArchived)
            .putString("deletion_scheduled_at", deletionScheduledAt)
            .apply()
    }

    fun isAccountArchived(): Boolean = prefs.getBoolean("is_archived", false)
    fun getDeletionScheduledAt(): String? = prefs.getString("deletion_scheduled_at", null)
    fun getSavedGender(): String? = prefs.getString("user_gender", null)
    fun getSavedAge(): Int? = prefs.getInt("user_age", 0).let { if (it > 0) it else null }

    fun getSavedPatientId(): String? = prefs.getString("patient_id", null)
    fun getSavedEmail(): String? = prefs.getString("user_email", null)
    fun getSavedName(): String? = prefs.getString("user_name", null)
    fun getSavedPatientName(): String? = getSavedName()
    fun getSavedPhone(): String? = prefs.getString("user_phone", null)
    fun isLoggedIn(): Boolean {
        val prefLoggedIn = prefs.getBoolean("is_logged_in", false)
        val hasEmail = !prefs.getString("user_email", null).isNullOrBlank()
        if (!prefLoggedIn || !hasEmail) return false
        val fbUser = try { com.google.firebase.auth.FirebaseAuth.getInstance().currentUser } catch (_: Exception) { null }
        val hasPatientId = !getSavedPatientId().isNullOrBlank()
        return (fbUser != null && !fbUser.email.isNullOrBlank()) || hasPatientId
    }

    fun hasSeenOnboarding(): Boolean = prefs.getBoolean("has_seen_onboarding", false)
    fun setHasSeenOnboarding(seen: Boolean) {
        prefs.edit().putBoolean("has_seen_onboarding", seen).apply()
    }

    fun isGuestMode(): Boolean {
        if (isLoggedIn()) return false
        return prefs.getBoolean("is_guest_mode", false)
    }
    fun setGuestMode(isGuest: Boolean) {
        prefs.edit().putBoolean("is_guest_mode", isGuest).apply()
    }

    fun setPendingVerifiedEmail(email: String?) {
        if (email.isNullOrBlank()) {
            prefs.edit().remove("pending_verified_google_email").apply()
        } else {
            prefs.edit().putString("pending_verified_google_email", email.trim().lowercase()).apply()
        }
    }

    fun consumePendingVerifiedEmail(): String? {
        val email = prefs.getString("pending_verified_google_email", null)
        if (!email.isNullOrBlank()) {
            prefs.edit().remove("pending_verified_google_email").apply()
            return email
        }
        return null
    }

    fun saveTrackingCode(code: String, label: String = "Patient Appointment", explicitUnhide: Boolean = false) {
        val trimmedCode = code.trim()
        if (trimmedCode.length != 10) return
        if (explicitUnhide) {
            unhideRecord(trimmedCode)
        } else if (isRecordHidden(trimmedCode)) {
            return
        }
        val current = getRawSavedTrackingCodes().toMutableList()
        current.removeAll { it.first == trimmedCode }
        current.add(0, Pair(trimmedCode, label.trim().ifBlank { "Appointment $trimmedCode" }))
        val serialized = current.take(20).joinToString(";;") { "${it.first}|${it.second}" }
        prefs.edit().putString("saved_tracking_codes", serialized).apply()

        // Sync FCM device token with this tracking code in Supabase
        try {
            com.dactor.patient.service.FcmService.syncDeviceToken(context, trimmedCode)
        } catch (_: Exception) {}
    }

    fun getRawSavedTrackingCodes(): List<Pair<String, String>> {
        val raw = prefs.getString("saved_tracking_codes", null) ?: return emptyList()
        if (raw.isBlank()) return emptyList()
        return raw.split(";;").mapNotNull { entry ->
            val parts = entry.split("|")
            if (parts.size >= 2 && parts[0].isNotBlank()) {
                Pair(parts[0].trim(), parts[1])
            } else null
        }
    }

    fun getSavedTrackingCodes(): List<Pair<String, String>> {
        val hidden = getHiddenRecordCodes()
        return getRawSavedTrackingCodes().filter { !hidden.contains(it.first) }
    }

    fun removeTrackingCode(code: String) {
        val trimmed = code.trim()
        val current = getRawSavedTrackingCodes().toMutableList()
        current.removeAll { it.first == trimmed }
        val serialized = current.joinToString(";;") { "${it.first}|${it.second}" }
        prefs.edit().putString("saved_tracking_codes", serialized).apply()
        hideRecord(trimmed)
    }

    fun hideRecord(codeOrId: String) {
        val trimmed = codeOrId.trim()
        if (trimmed.isBlank()) return
        val current = getHiddenRecordCodes().toMutableSet()
        current.add(trimmed)
        prefs.edit().putStringSet("hidden_record_codes", current).apply()
    }

    fun unhideRecord(codeOrId: String) {
        val trimmed = codeOrId.trim()
        if (trimmed.isBlank()) return
        val current = getHiddenRecordCodes().toMutableSet()
        current.remove(trimmed)
        prefs.edit().putStringSet("hidden_record_codes", current).apply()
    }

    fun isRecordHidden(codeOrId: String?): Boolean {
        if (codeOrId.isNullOrBlank()) return false
        val hidden = getHiddenRecordCodes()
        return hidden.contains(codeOrId.trim())
    }

    fun getHiddenRecordCodes(): Set<String> {
        return prefs.getStringSet("hidden_record_codes", emptySet()) ?: emptySet()
    }

    fun clearHiddenRecords() {
        prefs.edit().remove("hidden_record_codes").apply()
    }

    fun clearSavedTrackingCodes() {
        prefs.edit().remove("saved_tracking_codes").apply()
    }

    fun isNotificationSeen(id: String): Boolean = prefs.getBoolean("notif_seen_$id", false)
    fun markNotificationSeen(id: String) {
        prefs.edit().putBoolean("notif_seen_$id", true).apply()
    }

    fun getReadNotificationIds(): Set<String> {
        return prefs.getStringSet("read_notification_ids", emptySet()) ?: emptySet()
    }

    fun isNotificationRead(id: String): Boolean {
        if (id.isBlank()) return false
        val set = prefs.getStringSet("read_notification_ids", null)
        return set?.contains(id) == true
    }

    fun markNotificationRead(id: String) {
        if (id.isBlank()) return
        val current = prefs.getStringSet("read_notification_ids", emptySet())?.toMutableSet() ?: mutableSetOf()
        current.add(id)
        prefs.edit().putStringSet("read_notification_ids", current).apply()
    }

    fun markNotificationsRead(ids: Collection<String>) {
        val validIds = ids.filter { it.isNotBlank() }
        if (validIds.isEmpty()) return
        val current = prefs.getStringSet("read_notification_ids", emptySet())?.toMutableSet() ?: mutableSetOf()
        current.addAll(validIds)
        prefs.edit().putStringSet("read_notification_ids", current).apply()
    }

    fun clearReadNotifications() {
        prefs.edit().remove("read_notification_ids").apply()
    }

    fun isOneHourReminderTriggered(appointmentId: String): Boolean =
        prefs.getBoolean("one_hour_reminder_triggered_$appointmentId", false)

    fun markOneHourReminderTriggered(appointmentId: String) {
        prefs.edit().putBoolean("one_hour_reminder_triggered_$appointmentId", true).apply()
    }

    fun isTwoAheadAlertTriggered(appointmentId: String): Boolean =
        prefs.getBoolean("two_ahead_alert_triggered_$appointmentId", false)

    fun markTwoAheadAlertTriggered(appointmentId: String) {
        prefs.edit().putBoolean("two_ahead_alert_triggered_$appointmentId", true).apply()
    }

    fun isLateAlertTriggered(appointmentId: String): Boolean =
        prefs.getBoolean("late_alert_triggered_$appointmentId", false)

    fun markLateAlertTriggered(appointmentId: String) {
        prefs.edit().putBoolean("late_alert_triggered_$appointmentId", true).apply()
    }

    fun isDoctorPresenceAlertSeen(doctorId: String, date: String, isInClinic: Boolean): Boolean =
        prefs.getBoolean("doc_presence_seen_${doctorId}_${date}_$isInClinic", false)

    fun markDoctorPresenceAlertSeen(doctorId: String, date: String, isInClinic: Boolean) {
        prefs.edit().putBoolean("doc_presence_seen_${doctorId}_${date}_$isInClinic", true).apply()
    }

    fun saveFcmToken(token: String) {
        prefs.edit().putString("fcm_token", token).apply()
        try {
            com.dactor.patient.service.FcmService.syncDeviceToken(context)
        } catch (_: Exception) {}
    }
    fun getFcmToken(): String? = prefs.getString("fcm_token", null)

    data class PendingBookingRedirect(
        val route: String,
        val clinicId: String,
        val doctorId: String?,
        val selectedDate: String?,
        val selectedSlotId: String?,
        val scrollIndex: Int = 0,
        val scrollOffset: Int = 0
    )

    fun savePendingBookingRedirect(
        route: String,
        clinicId: String,
        doctorId: String? = null,
        selectedDate: String? = null,
        selectedSlotId: String? = null,
        scrollIndex: Int = 0,
        scrollOffset: Int = 0
    ) {
        prefs.edit()
            .putBoolean("has_pending_booking_redirect", true)
            .putString("pending_booking_route", route)
            .putString("pending_booking_clinic_id", clinicId)
            .putString("pending_booking_doctor_id", doctorId)
            .putString("pending_booking_date", selectedDate)
            .putString("pending_booking_slot_id", selectedSlotId)
            .putInt("pending_booking_scroll_index", scrollIndex)
            .putInt("pending_booking_scroll_offset", scrollOffset)
            .apply()
    }

    fun getPendingBookingRedirect(): PendingBookingRedirect? {
        if (!prefs.getBoolean("has_pending_booking_redirect", false)) return null
        val route = prefs.getString("pending_booking_route", null) ?: return null
        val clinicId = prefs.getString("pending_booking_clinic_id", "") ?: ""
        return PendingBookingRedirect(
            route = route,
            clinicId = clinicId,
            doctorId = prefs.getString("pending_booking_doctor_id", null),
            selectedDate = prefs.getString("pending_booking_date", null),
            selectedSlotId = prefs.getString("pending_booking_slot_id", null),
            scrollIndex = prefs.getInt("pending_booking_scroll_index", 0),
            scrollOffset = prefs.getInt("pending_booking_scroll_offset", 0)
        )
    }

    fun clearPendingBookingRedirect() {
        prefs.edit()
            .remove("has_pending_booking_redirect")
            .remove("pending_booking_route")
            .remove("pending_booking_clinic_id")
            .remove("pending_booking_doctor_id")
            .remove("pending_booking_date")
            .remove("pending_booking_slot_id")
            .remove("pending_booking_scroll_index")
            .remove("pending_booking_scroll_offset")
            .apply()
    }

    data class PendingRescheduleData(
        val appointmentId: String,
        val trackingCode: String,
        val clinicId: String,
        val doctorId: String?,
        val patientName: String,
        val patientMobile: String,
        val patientAge: String,
        val patientGender: String,
        val patientEmail: String? = null,
        val originalDate: String = "",
        val originalTime: String? = null,
        val status: String? = null
    )

    fun savePendingReschedule(data: PendingRescheduleData) {
        prefs.edit()
            .putBoolean("has_pending_reschedule", true)
            .putString("reschedule_appt_id", data.appointmentId)
            .putString("reschedule_tracking_code", data.trackingCode)
            .putString("reschedule_clinic_id", data.clinicId)
            .putString("reschedule_doctor_id", data.doctorId)
            .putString("reschedule_patient_name", data.patientName)
            .putString("reschedule_patient_mobile", data.patientMobile)
            .putString("reschedule_patient_age", data.patientAge)
            .putString("reschedule_patient_gender", data.patientGender)
            .putString("reschedule_patient_email", data.patientEmail)
            .putString("reschedule_original_date", data.originalDate)
            .putString("reschedule_original_time", data.originalTime)
            .putString("reschedule_status", data.status)
            .apply()
    }

    fun getPendingReschedule(): PendingRescheduleData? {
        if (!prefs.getBoolean("has_pending_reschedule", false)) return null
        val apptId = prefs.getString("reschedule_appt_id", null) ?: return null
        val clinicId = prefs.getString("reschedule_clinic_id", "") ?: ""
        return PendingRescheduleData(
            appointmentId = apptId,
            trackingCode = prefs.getString("reschedule_tracking_code", "") ?: "",
            clinicId = clinicId,
            doctorId = prefs.getString("reschedule_doctor_id", null),
            patientName = prefs.getString("reschedule_patient_name", "") ?: "",
            patientMobile = prefs.getString("reschedule_patient_mobile", "") ?: "",
            patientAge = prefs.getString("reschedule_patient_age", "") ?: "",
            patientGender = prefs.getString("reschedule_patient_gender", "") ?: "",
            patientEmail = prefs.getString("reschedule_patient_email", null),
            originalDate = prefs.getString("reschedule_original_date", "") ?: "",
            originalTime = prefs.getString("reschedule_original_time", null),
            status = prefs.getString("reschedule_status", null)
        )
    }

    fun clearPendingReschedule() {
        prefs.edit()
            .remove("has_pending_reschedule")
            .remove("reschedule_appt_id")
            .remove("reschedule_tracking_code")
            .remove("reschedule_clinic_id")
            .remove("reschedule_doctor_id")
            .remove("reschedule_patient_name")
            .remove("reschedule_patient_mobile")
            .remove("reschedule_patient_age")
            .remove("reschedule_patient_gender")
            .remove("reschedule_patient_email")
            .remove("reschedule_original_date")
            .remove("reschedule_original_time")
            .apply()
    }

    data class ActivePaymentSession(
        val appointmentId: String,
        val clinicId: String,
        val doctorId: String? = null,
        val slotId: String? = null,
        val appointmentDate: String? = null,
        val amount: Double = 0.0,
        val transactionId: String = "",
        val expiresAtEpochMs: Long = 0L,
        val patientName: String = "",
        val trackingCode: String = "",
        val gateway: String = "esewa"
    ) {
        fun isExpired(): Boolean = System.currentTimeMillis() >= expiresAtEpochMs
        fun remainingSeconds(): Int {
            val rem = (expiresAtEpochMs - System.currentTimeMillis()) / 1000L
            return if (rem > 0) rem.toInt() else 0
        }
    }

    fun saveActivePaymentSession(
        appointmentId: String,
        clinicId: String,
        doctorId: String? = null,
        slotId: String? = null,
        appointmentDate: String? = null,
        amount: Double,
        transactionId: String,
        expiresAtEpochMs: Long,
        patientName: String = "",
        trackingCode: String = "",
        gateway: String = "esewa"
    ) {
        prefs.edit()
            .putBoolean("has_active_payment_session", true)
            .putString("payment_session_appointment_id", appointmentId)
            .putString("payment_session_clinic_id", clinicId)
            .putString("payment_session_doctor_id", doctorId)
            .putString("payment_session_slot_id", slotId)
            .putString("payment_session_date", appointmentDate)
            .putFloat("payment_session_amount", amount.toFloat())
            .putString("payment_session_tx_id", transactionId)
            .putLong("payment_session_expires_at", expiresAtEpochMs)
            .putString("payment_session_patient_name", patientName)
            .putString("payment_session_tracking_code", trackingCode)
            .putString("payment_session_gateway", gateway.lowercase())
            .apply()
    }

    fun updateActivePaymentSessionGateway(gateway: String, transactionId: String? = null) {
        val editor = prefs.edit().putString("payment_session_gateway", gateway.lowercase())
        if (!transactionId.isNullOrBlank()) {
            editor.putString("payment_session_tx_id", transactionId)
        }
        editor.apply()
    }

    fun getActivePaymentSession(): ActivePaymentSession? {
        if (!prefs.getBoolean("has_active_payment_session", false)) return null
        val apptId = prefs.getString("payment_session_appointment_id", null) ?: return null
        val expiresAt = prefs.getLong("payment_session_expires_at", 0L)
        // Keep the appointment identity after the checkout countdown ends. The local
        // clock is not authoritative for payment completion or reservation release.
        return ActivePaymentSession(
            appointmentId = apptId,
            clinicId = prefs.getString("payment_session_clinic_id", "") ?: "",
            doctorId = prefs.getString("payment_session_doctor_id", null),
            slotId = prefs.getString("payment_session_slot_id", null),
            appointmentDate = prefs.getString("payment_session_date", null),
            amount = prefs.getFloat("payment_session_amount", 0f).toDouble(),
            transactionId = prefs.getString("payment_session_tx_id", "") ?: "",
            expiresAtEpochMs = expiresAt,
            patientName = prefs.getString("payment_session_patient_name", "") ?: "",
            trackingCode = prefs.getString("payment_session_tracking_code", "") ?: "",
            gateway = prefs.getString("payment_session_gateway", "esewa") ?: "esewa"
        )
    }

    fun clearActivePaymentSession() {
        prefs.edit()
            .remove("has_active_payment_session")
            .remove("payment_session_appointment_id")
            .remove("payment_session_clinic_id")
            .remove("payment_session_doctor_id")
            .remove("payment_session_slot_id")
            .remove("payment_session_date")
            .remove("payment_session_amount")
            .remove("payment_session_tx_id")
            .remove("payment_session_expires_at")
            .remove("payment_session_patient_name")
            .remove("payment_session_tracking_code")
            .remove("payment_session_gateway")
            .apply()
    }

    fun setShowTransactionFailedBanner(show: Boolean) {
        prefs.edit().putBoolean("show_transaction_failed_banner", show).apply()
    }

    fun consumeTransactionFailedBanner(): Boolean {
        val show = prefs.getBoolean("show_transaction_failed_banner", false)
        if (show) {
            prefs.edit().putBoolean("show_transaction_failed_banner", false).apply()
        }
        return show
    }

    data class ConfirmedAppointmentSummary(
        val appointmentId: String,
        val trackingCode: String,
        val clinicName: String,
        val doctorName: String,
        val doctorSpecialty: String = "",
        val patientName: String,
        val appointmentDate: String,
        val timeWindow: String
    )

    fun saveLastConfirmedAppointment(
        appointmentId: String,
        trackingCode: String,
        clinicName: String,
        doctorName: String,
        doctorSpecialty: String = "",
        patientName: String,
        appointmentDate: String,
        timeWindow: String
    ) {
        prefs.edit()
            .putString("last_confirmed_appointment_id", appointmentId)
            .putString("last_confirmed_tracking_code", trackingCode)
            .putString("last_confirmed_clinic_name", clinicName)
            .putString("last_confirmed_doctor_name", doctorName)
            .putString("last_confirmed_doctor_specialty", doctorSpecialty)
            .putString("last_confirmed_patient_name", patientName)
            .putString("last_confirmed_appointment_date", appointmentDate)
            .putString("last_confirmed_time_window", timeWindow)
            .apply()
    }

    fun getLastConfirmedAppointment(): ConfirmedAppointmentSummary? {
        val apptId = prefs.getString("last_confirmed_appointment_id", null) ?: return null
        return ConfirmedAppointmentSummary(
            appointmentId = apptId,
            trackingCode = prefs.getString("last_confirmed_tracking_code", "") ?: "",
            clinicName = prefs.getString("last_confirmed_clinic_name", "") ?: "",
            doctorName = prefs.getString("last_confirmed_doctor_name", "") ?: "",
            doctorSpecialty = prefs.getString("last_confirmed_doctor_specialty", "") ?: "",
            patientName = prefs.getString("last_confirmed_patient_name", "") ?: "",
            appointmentDate = prefs.getString("last_confirmed_appointment_date", "") ?: "",
            timeWindow = prefs.getString("last_confirmed_time_window", "") ?: ""
        )
    }

    fun saveLocalTransactionRecord(record: com.dactor.patient.data.model.PatientTransactionRecord) {
        try {
            val list = getLocalTransactionRecords().toMutableList()
            list.removeAll { it.id == record.id || it.appointmentId == record.appointmentId }
            list.add(0, record)
            val json = kotlinx.serialization.json.Json { ignoreUnknownKeys = true; encodeDefaults = true }
            val serialized = json.encodeToString(kotlinx.serialization.builtins.ListSerializer(com.dactor.patient.data.model.PatientTransactionRecord.serializer()), list.take(30))
            prefs.edit().putString("local_cached_transactions", serialized).apply()
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    fun getLocalTransactionRecords(): List<com.dactor.patient.data.model.PatientTransactionRecord> {
        val raw = prefs.getString("local_cached_transactions", null) ?: return emptyList()
        if (raw.isBlank()) return emptyList()
        return try {
            val json = kotlinx.serialization.json.Json { ignoreUnknownKeys = true }
            json.decodeFromString(kotlinx.serialization.builtins.ListSerializer(com.dactor.patient.data.model.PatientTransactionRecord.serializer()), raw)
        } catch (e: Exception) {
            emptyList()
        }
    }

    fun saveCachedActiveAppointments(appointments: List<com.dactor.patient.data.model.Appointment>) {
        try {
            val json = kotlinx.serialization.json.Json { ignoreUnknownKeys = true; encodeDefaults = true }
            val serialized = json.encodeToString(
                kotlinx.serialization.builtins.ListSerializer(com.dactor.patient.data.model.Appointment.serializer()),
                appointments.take(50)
            )
            prefs.edit().putString("local_cached_active_appointments", serialized).apply()
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    fun getCachedActiveAppointments(): List<com.dactor.patient.data.model.Appointment> {
        val raw = prefs.getString("local_cached_active_appointments", null) ?: return emptyList()
        if (raw.isBlank()) return emptyList()
        return try {
            val json = kotlinx.serialization.json.Json { ignoreUnknownKeys = true }
            json.decodeFromString(
                kotlinx.serialization.builtins.ListSerializer(com.dactor.patient.data.model.Appointment.serializer()),
                raw
            )
        } catch (e: Exception) {
            emptyList()
        }
    }

    fun saveCachedRecords(records: List<com.dactor.patient.data.model.Appointment>) {
        try {
            val json = kotlinx.serialization.json.Json { ignoreUnknownKeys = true; encodeDefaults = true }
            val serialized = json.encodeToString(
                kotlinx.serialization.builtins.ListSerializer(com.dactor.patient.data.model.Appointment.serializer()),
                records.take(100)
            )
            prefs.edit().putString("local_cached_records_appointments", serialized).apply()
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    fun getCachedRecords(): List<com.dactor.patient.data.model.Appointment> {
        val raw = prefs.getString("local_cached_records_appointments", null) ?: return emptyList()
        if (raw.isBlank()) return emptyList()
        return try {
            val json = kotlinx.serialization.json.Json { ignoreUnknownKeys = true }
            json.decodeFromString(
                kotlinx.serialization.builtins.ListSerializer(com.dactor.patient.data.model.Appointment.serializer()),
                raw
            )
        } catch (e: Exception) {
            emptyList()
        }
    }

    fun saveCachedInvoices(invoices: Map<String, com.dactor.patient.data.model.BillingInvoice>) {
        try {
            val json = kotlinx.serialization.json.Json { ignoreUnknownKeys = true; encodeDefaults = true }
            val serialized = json.encodeToString(
                kotlinx.serialization.builtins.MapSerializer(
                    String.Companion.serializer(),
                    com.dactor.patient.data.model.BillingInvoice.serializer()
                ),
                invoices
            )
            prefs.edit().putString("local_cached_record_invoices", serialized).apply()
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    fun getCachedInvoices(): Map<String, com.dactor.patient.data.model.BillingInvoice> {
        val raw = prefs.getString("local_cached_record_invoices", null) ?: return emptyMap()
        if (raw.isBlank()) return emptyMap()
        return try {
            val json = kotlinx.serialization.json.Json { ignoreUnknownKeys = true }
            json.decodeFromString(
                kotlinx.serialization.builtins.MapSerializer(
                    String.Companion.serializer(),
                    com.dactor.patient.data.model.BillingInvoice.serializer()
                ),
                raw
            )
        } catch (e: Exception) {
            emptyMap()
        }
    }

    fun saveCachedQueueStatus(code: String, entry: com.dactor.patient.data.model.QueueEntry) {
        if (code.isBlank()) return
        try {
            val json = kotlinx.serialization.json.Json { ignoreUnknownKeys = true; encodeDefaults = true }
            val serialized = json.encodeToString(com.dactor.patient.data.model.QueueEntry.serializer(), entry)
            prefs.edit().putString("local_cached_q_${code.trim()}", serialized).apply()
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    fun getCachedQueueStatus(code: String): com.dactor.patient.data.model.QueueEntry? {
        if (code.isBlank()) return null
        val raw = prefs.getString("local_cached_q_${code.trim()}", null) ?: return null
        if (raw.isBlank()) return null
        return try {
            val json = kotlinx.serialization.json.Json { ignoreUnknownKeys = true }
            json.decodeFromString(com.dactor.patient.data.model.QueueEntry.serializer(), raw)
        } catch (e: Exception) {
            null
        }
    }

    fun clearSession() {
        val fcm = prefs.getString("fcm_token", null)
        val hasSeen = prefs.getBoolean("has_seen_onboarding", false)
        val hasAcceptedTerms = prefs.getBoolean("has_accepted_terms_v1", false)
        prefs.edit().clear().apply()
        prefs.edit()
            .putBoolean("has_seen_onboarding", hasSeen)
            .putBoolean("has_accepted_terms_v1", hasAcceptedTerms)
            .putBoolean("is_logged_in", false)
            .putBoolean("is_guest_mode", true)
            .apply()
        if (!fcm.isNullOrBlank()) {
            prefs.edit().putString("fcm_token", fcm).apply()
        }
    }

    suspend fun awaitIdentityResolved(timeoutMs: Long = 3000): Boolean {
        val deadline = System.currentTimeMillis() + timeoutMs
        while (System.currentTimeMillis() < deadline) {
            if (!getSavedPatientId().isNullOrBlank() || !getSavedEmail().isNullOrBlank()) {
                return true
            }
            kotlinx.coroutines.delay(100)
        }
        return !getSavedPatientId().isNullOrBlank() || !getSavedEmail().isNullOrBlank()
    }

    fun hasAcceptedTerms(): Boolean = prefs.getBoolean("has_accepted_terms_v1", false)

    fun setTermsAccepted(accepted: Boolean) {
        prefs.edit().putBoolean("has_accepted_terms_v1", accepted).apply()
    }
}
