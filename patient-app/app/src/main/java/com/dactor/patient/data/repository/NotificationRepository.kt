package com.dactor.patient.data.repository

import android.os.Build
import com.dactor.patient.data.model.Appointment
import com.dactor.patient.data.model.DactorNotification
import com.dactor.patient.data.model.LabReport
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.postgrest.postgrest
import io.github.jan.supabase.postgrest.query.Order
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class NotificationRepository @Inject constructor(
    private val supabaseClient: SupabaseClient
) {
    @Serializable
    data class FcmDeviceTokenDto(
        @SerialName("token") val token: String,
        @SerialName("user_id") val userId: String? = null,
        @SerialName("tracking_code") val trackingCode: String? = null,
        @SerialName("patient_mobile") val patientMobile: String? = null,
        @SerialName("device_info") val deviceInfo: String? = null,
        @SerialName("updated_at") val updatedAt: String? = null
    )

    suspend fun uploadFcmToken(
        token: String,
        userId: String? = null,
        trackingCodes: List<String> = emptyList(),
        patientMobile: String? = null
    ): Boolean = withContext(Dispatchers.IO) {
        try {
            val cleanToken = token.trim()
            if (cleanToken.isBlank()) return@withContext false

            val deviceInfo = "Android ${Build.VERSION.RELEASE} (${Build.MANUFACTURER} ${Build.MODEL})"
            val now = java.time.Instant.now().toString()
            val cleanMobile = patientMobile?.trim()?.takeIf { it.isNotBlank() }
            val cleanUid = userId?.trim()?.takeIf { it.isNotBlank() }

            val validCodes = trackingCodes.map { it.trim() }.filter { it.isNotBlank() }
            if (validCodes.isEmpty()) {
                val dto = FcmDeviceTokenDto(
                    token = cleanToken,
                    userId = cleanUid,
                    trackingCode = null,
                    patientMobile = cleanMobile,
                    deviceInfo = deviceInfo,
                    updatedAt = now
                )
                supabaseClient.postgrest["fcm_tokens"].upsert(dto)
            } else {
                for (code in validCodes) {
                    val dto = FcmDeviceTokenDto(
                        token = cleanToken,
                        userId = cleanUid,
                        trackingCode = code,
                        patientMobile = cleanMobile,
                        deviceInfo = deviceInfo,
                        updatedAt = now
                    )
                    supabaseClient.postgrest["fcm_tokens"].upsert(dto)
                }
            }
            true
        } catch (e: Exception) {
            e.printStackTrace()
            false
        }
    }

    suspend fun getNotifications(userId: String? = null, appointmentIds: List<String> = emptyList()): List<DactorNotification> = withContext(Dispatchers.IO) {
        try {
            val resolvedIds = appointmentIds.map { it.trim() }.filter { it.isNotBlank() }.toMutableSet()
            val patientAppts = mutableListOf<Appointment>()

            // 1. Targeted Server-Side Query: Fetch only relevant appointments (replaces full-table scan)
            try {
                if (!userId.isNullOrBlank()) {
                    val byUser = supabaseClient.postgrest["appointments"]
                        .select {
                            filter {
                                eq("user_id", userId)
                            }
                        }
                        .decodeList<Appointment>()
                    patientAppts.addAll(byUser)
                    for (appt in byUser) {
                        if (appt.id.isNotBlank()) resolvedIds.add(appt.id)
                        if (appt.trackingCode10Digit.isNotBlank()) resolvedIds.add(appt.trackingCode10Digit)
                    }
                }

                val codesToFetch = resolvedIds.filter { it.length == 10 && patientAppts.none { a -> a.trackingCode10Digit == it } }
                if (codesToFetch.isNotEmpty()) {
                    val byCodes = supabaseClient.postgrest["appointments"]
                        .select {
                            filter {
                                isIn("tracking_code_10_digit", codesToFetch)
                            }
                        }
                        .decodeList<Appointment>()
                    for (appt in byCodes) {
                        if (patientAppts.none { it.id == appt.id }) patientAppts.add(appt)
                        if (appt.id.isNotBlank()) resolvedIds.add(appt.id)
                        if (appt.trackingCode10Digit.isNotBlank()) resolvedIds.add(appt.trackingCode10Digit)
                    }
                }

                val uuidIdsToFetch = resolvedIds.filter { it.length == 36 && patientAppts.none { a -> a.id == it } }
                if (uuidIdsToFetch.isNotEmpty()) {
                    val byIds = supabaseClient.postgrest["appointments"]
                        .select {
                            filter {
                                isIn("id", uuidIdsToFetch)
                            }
                        }
                        .decodeList<Appointment>()
                    for (appt in byIds) {
                        if (patientAppts.none { it.id == appt.id }) patientAppts.add(appt)
                        if (appt.id.isNotBlank()) resolvedIds.add(appt.id)
                        if (appt.trackingCode10Digit.isNotBlank()) resolvedIds.add(appt.trackingCode10Digit)
                    }
                }
            } catch (ignored: Exception) {}

            // 2. Targeted Server-Side Queries: Fetch only relevant notifications with limits (replaces full-table scan)
            val fetchedNotifs = mutableListOf<DactorNotification>()

            // 2a. User-specific notifications
            if (!userId.isNullOrBlank()) {
                try {
                    val userNotifs = supabaseClient.postgrest["notifications"]
                        .select {
                            filter {
                                eq("user_id", userId)
                            }
                            order("created_at", Order.DESCENDING)
                            limit(50)
                        }
                        .decodeList<DactorNotification>()
                    fetchedNotifs.addAll(userNotifs)
                } catch (ignored: Exception) {}
            }

            // 2b. Appointment-specific notifications for tracked IDs
            val apptUuids = resolvedIds.filter { it.length == 36 }
            if (apptUuids.isNotEmpty()) {
                try {
                    for (chunk in apptUuids.chunked(25)) {
                        val apptNotifs = supabaseClient.postgrest["notifications"]
                            .select {
                                filter {
                                    isIn("appointment_id", chunk)
                                }
                                order("created_at", Order.DESCENDING)
                                limit(50)
                            }
                            .decodeList<DactorNotification>()
                        fetchedNotifs.addAll(apptNotifs)
                    }
                } catch (ignored: Exception) {}
            }

            // 2c. Broadcast notifications for all patients and patient's associated clinics
            try {
                val clinicAudiences = patientAppts.mapNotNull { it.clinicId.takeIf { c -> c.isNotBlank() } }.map { "clinic_$it" }
                val targetAudiences = listOf("all_users", "patients") + clinicAudiences
                val broadcastNotifs = supabaseClient.postgrest["notifications"]
                    .select {
                        filter {
                            or {
                                isIn("target_audience", targetAudiences)
                                isIn("type", listOf("broadcast", "announcement", "clinic_broadcast"))
                            }
                        }
                        order("created_at", Order.DESCENDING)
                        limit(35)
                    }
                    .decodeList<DactorNotification>()
                fetchedNotifs.addAll(broadcastNotifs)
            } catch (ignored: Exception) {}

            // 2d. Recent queue / doctor alerts (allows matching metadata tags for guest tracking codes)
            try {
                val recentAlerts = supabaseClient.postgrest["notifications"]
                    .select {
                        filter {
                            isIn("type", listOf("queue_alert", "manual_alert", "doctor_arrival", "doctor_presence", "clinic_break", "early_arrival", "turn_call"))
                        }
                        order("created_at", Order.DESCENDING)
                        limit(50)
                    }
                    .decodeList<DactorNotification>()
                fetchedNotifs.addAll(recentAlerts)
            } catch (ignored: Exception) {}

            val distinctNotifs = fetchedNotifs.distinctBy { it.id }.sortedByDescending { it.createdAt }

            val patientClinicIds = patientAppts.mapNotNull { it.clinicId.takeIf { c -> c.isNotBlank() } }.toSet()
            val filtered = distinctNotifs.filter { notif ->
                val audience = notif.targetAudience?.lowercase()
                val notifType = notif.type.lowercase()
                val isTargetedType = notifType in listOf(
                    "manual_alert", "queue_alert", "lab_report", "clinic_break",
                    "doctor_arrival", "doctor_presence", "doctor_status", "early_arrival",
                    "turn_call", "urgent_call"
                )
                val matchesClinicBroadcast = (notifType == "clinic_broadcast" || audience?.startsWith("clinic_") == true) &&
                    (patientClinicIds.isEmpty() || patientClinicIds.any { cid -> audience == "clinic_$cid" || notif.message.contains(cid) })
                val isGeneralBroadcast = (audience in listOf("all_users", "patients", null) || notifType in listOf("broadcast", "announcement", "clinic_broadcast")) &&
                    !isTargetedType
                val isBroadcastForPatients = isGeneralBroadcast || matchesClinicBroadcast
                val isUserSpecific = (!userId.isNullOrBlank() && notif.userId == userId)
                val metaCode = notif.toTemplateData().trackingCode
                val isAppointmentSpecific = (notif.appointmentId != null && resolvedIds.contains(notif.appointmentId)) ||
                    (!metaCode.isNullOrBlank() && resolvedIds.contains(metaCode)) ||
                    resolvedIds.any { code -> code.length == 10 && (notif.message.contains(code) || notif.title.contains(code)) }
                val isTargetedAlert = isTargetedType && (isUserSpecific || isAppointmentSpecific)

                if (!isBroadcastForPatients && !isUserSpecific && !isAppointmentSpecific && !isTargetedAlert) {
                    return@filter false
                }

                // Doctor notifications: do not surface to completed appointments or patients with no active queue appointment
                val isDoctorNotif = notif.type in listOf("doctor_arrival", "doctor_presence", "clinic_break", "doctor_status") ||
                    notif.title.contains("doctor", ignoreCase = true) ||
                    notif.title.contains("break", ignoreCase = true) ||
                    notif.message.contains("doctor is", ignoreCase = true) ||
                    notif.message.contains("doctor has", ignoreCase = true) ||
                    notif.message.contains("clinic is currently on break", ignoreCase = true)

                if (isDoctorNotif && patientAppts.isNotEmpty()) {
                    val matchedAppt = patientAppts.find { appt ->
                        (notif.appointmentId != null && (appt.id == notif.appointmentId || appt.trackingCode10Digit == notif.appointmentId)) ||
                        (!metaCode.isNullOrBlank() && (appt.id == metaCode || appt.trackingCode10Digit == metaCode))
                    }
                    val isMatchedCompleted = matchedAppt != null && matchedAppt.checkinStatus.lowercase() in listOf("done", "completed", "cancelled")
                    val hasActiveQueueAppt = patientAppts.any {
                        it.checkinStatus.lowercase() in listOf("waiting", "checked_in", "booked", "inside", "pending")
                    }
                    if (isMatchedCompleted || !hasActiveQueueAppt) {
                        return@filter false
                    }
                }

                true
            }.toMutableList()

            // 3. Targeted Server-Side Query: Fetch only prepared lab reports for this patient's appointments (replaces full-table scan)
            if (apptUuids.isNotEmpty()) {
                try {
                    val labReports = supabaseClient.postgrest["lab_reports"]
                        .select {
                            filter {
                                isIn("appointment_id", apptUuids)
                                eq("stage", "prepared")
                            }
                        }
                        .decodeList<LabReport>()

                    for (rep in labReports) {
                        val alreadyNotified = filtered.any {
                            it.type == "lab_report" && (it.appointmentId == rep.appointmentId || it.id.contains(rep.id))
                        }
                        if (!alreadyNotified) {
                            filtered.add(
                                0,
                                DactorNotification(
                                    id = "lab_notif_${rep.id}",
                                    userId = userId,
                                    appointmentId = rep.appointmentId,
                                    title = "Lab Report Prepared: ${rep.testName}",
                                    message = "Your diagnostic lab report for '${rep.testName}' is now Prepared. Verify your Name or Mobile Number to view in-app or download the file directly.",
                                    type = "lab_report",
                                    targetAudience = "patients",
                                    isRead = false,
                                    createdAt = rep.preparedAt ?: rep.sampleCollectedAt ?: ""
                                )
                            )
                        }
                    }
                } catch (ignored: Exception) {}
            }

            filtered.sortedByDescending { it.createdAt }
        } catch (e: Exception) {
            e.printStackTrace()
            emptyList()
        }
    }

    suspend fun markAsRead(id: String): Boolean = withContext(Dispatchers.IO) {
        try {
            val cleanId = id.trim()
            if (cleanId.isBlank() || cleanId.startsWith("lab_notif_")) return@withContext true
            supabaseClient.postgrest["notifications"]
                .update({
                    set("is_read", true)
                }) {
                    filter {
                        eq("id", cleanId)
                    }
                }
            true
        } catch (e: Exception) {
            // Silently swallow RLS/network errors for broadcasts/guest sessions
            false
        }
    }

    suspend fun markAllAsRead(ids: List<String>): Boolean = withContext(Dispatchers.IO) {
        try {
            val validIds = ids.map { it.trim() }.filter { it.isNotBlank() && !it.startsWith("lab_notif_") }
            if (validIds.isEmpty()) return@withContext true
            for (chunk in validIds.chunked(30)) {
                try {
                    supabaseClient.postgrest["notifications"]
                        .update({
                            set("is_read", true)
                        }) {
                            filter {
                                isIn("id", chunk)
                            }
                        }
                } catch (_: Exception) {
                    // Ignore broadcast RLS rejections
                }
            }
            true
        } catch (e: Exception) {
            false
        }
    }
}
