package com.dactor.clinic.data.repository

import com.dactor.clinic.data.model.Appointment
import com.dactor.clinic.data.model.Clinic
import com.dactor.clinic.data.model.ClinicService
import com.dactor.clinic.data.model.MedicalSpecialty
import com.dactor.clinic.data.model.MedicalQualification
import com.dactor.clinic.data.model.NotificationTemplate
import com.dactor.clinic.data.model.NotificationType
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.postgrest.postgrest
import io.github.jan.supabase.functions.functions
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import io.ktor.client.call.body
import io.github.jan.supabase.storage.storage
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import java.time.Instant
import java.time.LocalDate
import java.time.temporal.ChronoUnit
import java.util.UUID
import javax.inject.Inject
import javax.inject.Singleton
import android.content.Context
import dagger.hilt.android.qualifiers.ApplicationContext

@Serializable
data class ClinicBaseDto(
    @SerialName("id") val id: String,
    @SerialName("name") val name: String,
    @SerialName("type") val type: String? = null,
    @SerialName("verification_status") val verificationStatus: String? = null,
    @SerialName("contact_phone") val contactPhone: String? = null,
    @SerialName("contact_email") val contactEmail: String? = null,
    @SerialName("address_text") val addressText: String? = null,
    @SerialName("latitude") val latitude: Double? = null,
    @SerialName("longitude") val longitude: Double? = null,
    @SerialName("auto_notify_threshold") val autoNotifyThreshold: Int? = null,
    @SerialName("description") val description: String? = null,
    @SerialName("logo_url") val logoUrl: String? = null
)

@Serializable
data class ClinicExtendedMeta(
    val desc: String? = null,
    val pan_number: String? = null,
    val manager_phone: String? = null,
    val pictures: List<String> = emptyList(),
    val specialties: List<String> = emptyList(),
    val registration_doc_url: String? = null,
    val is_archived: Boolean? = false,
    val archived_at: String? = null,
    val deletion_scheduled_at: String? = null,
    val payment_gateway_provider: String? = "esewa",
    val payment_api_key: String? = null,
    val payment_secret_key: String? = null,
    val merchant_id: String? = null,
    val is_direct_payment_enabled: Boolean? = false,
    val payment_gateways_json: String? = null,
    val is_activated: Boolean? = true,
    val activation_expires_at: String? = null,
    val activation_plan: String? = "1_month",
    val activation_paid_amount: Double? = 0.0,
    val activation_notes: String? = null,
    val activation_payment_proof_url: String? = null,
    val avg_consultation_time_minutes: Int? = 10,
    val manual_avg_consultation_time_minutes: Int? = 10,
    val calculated_avg_consultation_time_minutes: Int? = null,
    val avg_time_mode: String? = "auto",
    val is_on_break: Boolean? = false,
    val break_updated_at: String? = null,
    val weekly_schedule_json: String? = null,
    val declared_holidays: List<String> = emptyList()
)

@Serializable
data class ClinicUpdateDto(
    @SerialName("name") val name: String,
    @SerialName("type") val type: String? = null,
    @SerialName("verification_status") val verificationStatus: String? = null,
    @SerialName("contact_phone") val contactPhone: String? = null,
    @SerialName("contact_email") val contactEmail: String? = null,
    @SerialName("address_text") val addressText: String? = null,
    @SerialName("latitude") val latitude: Double? = null,
    @SerialName("longitude") val longitude: Double? = null,
    @SerialName("auto_notify_threshold") val autoNotifyThreshold: Int? = null,
    @SerialName("description") val description: String? = null,
    @SerialName("logo_url") val logoUrl: String? = null,
    @SerialName("registration_doc_url") val registrationDocUrl: String? = null,
    @SerialName("pan_number") val panNumber: String? = null,
    @SerialName("manager_phone") val managerPhone: String? = null,
    @SerialName("pictures") val pictures: List<String> = emptyList(),
    @SerialName("is_archived") val isArchived: Boolean? = false,
    @SerialName("archived_at") val archivedAt: String? = null,
    @SerialName("deletion_scheduled_at") val deletionScheduledAt: String? = null,
    @SerialName("payment_gateway_provider") val paymentGatewayProvider: String? = "esewa",
    @SerialName("payment_api_key") val paymentApiKey: String? = null,
    @SerialName("payment_secret_key") val paymentSecretKey: String? = null,
    @SerialName("merchant_id") val merchantId: String? = null,
    @SerialName("is_direct_payment_enabled") val isDirectPaymentEnabled: Boolean? = false,
    @SerialName("is_activated") val isActivated: Boolean? = true,
    @SerialName("activation_expires_at") val activationExpiresAt: String? = null,
    @SerialName("activation_plan") val activationPlan: String? = "1_month",
    @SerialName("activation_paid_amount") val activationPaidAmount: Double? = 0.0,
    @SerialName("activation_notes") val activationNotes: String? = null,
    @SerialName("activation_payment_proof_url") val activationPaymentProofUrl: String? = null
)

@Serializable
data class ClinicBaseUpdateDto(
    @SerialName("name") val name: String,
    @SerialName("type") val type: String? = null,
    @SerialName("verification_status") val verificationStatus: String? = null,
    @SerialName("contact_phone") val contactPhone: String? = null,
    @SerialName("contact_email") val contactEmail: String? = null,
    @SerialName("address_text") val addressText: String? = null,
    @SerialName("latitude") val latitude: Double? = null,
    @SerialName("longitude") val longitude: Double? = null,
    @SerialName("auto_notify_threshold") val autoNotifyThreshold: Int? = null,
    @SerialName("description") val description: String? = null
)

@Singleton
class ClinicRepository @Inject constructor(
    private val supabaseClient: SupabaseClient,
    @ApplicationContext private val context: Context? = null
) {
    private val json = Json { ignoreUnknownKeys = true; isLenient = true; encodeDefaults = true; coerceInputValues = true }
    private val cachedClinicsById = java.util.concurrent.ConcurrentHashMap<String, Clinic>()

    private val prefs by lazy {
        try {
            context?.getSharedPreferences("dactor_clinic_persistent_cache", Context.MODE_PRIVATE)
        } catch (_: Exception) {
            null
        }
    }

    fun saveClinicToPersistentCache(clinic: Clinic) {
        try {
            cachedClinicsById[clinic.id] = clinic
            val serialized = json.encodeToString(Clinic.serializer(), clinic)
            prefs?.edit()
                ?.putString("clinic_${clinic.id}", serialized)
                ?.putString("last_active_clinic", serialized)
                ?.apply {
                    val email = clinic.contactEmail?.trim()?.lowercase()
                    if (!email.isNullOrBlank()) {
                        putString("clinic_by_email_$email", serialized)
                    }
                }
                ?.apply()
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    fun getCachedClinicById(id: String): Clinic? {
        if (id.isBlank()) return null
        val inMem = cachedClinicsById[id]
        if (inMem != null) return inMem
        return try {
            val serialized = prefs?.getString("clinic_$id", null)
                ?: prefs?.getString("last_active_clinic", null)
            if (!serialized.isNullOrBlank()) {
                val decoded = json.decodeFromString(Clinic.serializer(), serialized)
                cachedClinicsById[decoded.id] = decoded
                decoded
            } else null
        } catch (e: Exception) {
            null
        }
    }

    fun getLastCachedClinic(): Clinic? {
        val inMem = cachedClinicsById.values.firstOrNull()
        if (inMem != null) return inMem
        return try {
            val serialized = prefs?.getString("last_active_clinic", null)
            if (!serialized.isNullOrBlank()) {
                val decoded = json.decodeFromString(Clinic.serializer(), serialized)
                cachedClinicsById[decoded.id] = decoded
                decoded
            } else null
        } catch (e: Exception) {
            null
        }
    }

    fun getCachedClinicByEmail(email: String): Clinic? {
        val target = email.trim().lowercase()
        val inMem = cachedClinicsById.values.firstOrNull { it.contactEmail?.trim()?.lowercase() == target }
        if (inMem != null) return inMem
        return try {
            val serialized = prefs?.getString("clinic_by_email_$target", null)
            if (!serialized.isNullOrBlank()) {
                val decoded = json.decodeFromString(Clinic.serializer(), serialized)
                cachedClinicsById[decoded.id] = decoded
                decoded
            } else null
        } catch (e: Exception) {
            null
        }
    }

    fun clearCache() {
        cachedClinicsById.clear()
    }

    fun clearAllPersistentCache() {
        cachedClinicsById.clear()
        try {
            prefs?.edit()?.clear()?.apply()
        } catch (_: Exception) {}
    }

    private fun enrichClinic(clinic: Clinic): Clinic {
        val descStr = clinic.description
        if (!descStr.isNullOrBlank() && descStr.trim().startsWith("{")) {
            try {
                val meta = json.decodeFromString<ClinicExtendedMeta>(descStr)
                val cleanDesc = if (!meta.desc.isNullOrBlank() && meta.desc.trim().startsWith("{")) {
                    try { json.decodeFromString<ClinicExtendedMeta>(meta.desc).desc ?: "" } catch (_: Exception) { meta.desc }
                } else {
                    meta.desc ?: ""
                }
                return clinic.copy(
                    description = cleanDesc,
                    panNumber = clinic.panNumber ?: meta.pan_number,
                    managerPhone = clinic.managerPhone ?: meta.manager_phone,
                    pictures = if (clinic.pictures.isNotEmpty()) clinic.pictures else meta.pictures,
                    specialties = if (clinic.specialties.isNotEmpty()) clinic.specialties else meta.specialties,
                    registrationDocUrl = clinic.registrationDocUrl ?: meta.registration_doc_url,
                    isArchived = meta.is_archived ?: clinic.isArchived,
                    archivedAt = clinic.archivedAt ?: meta.archived_at,
                    deletionScheduledAt = clinic.deletionScheduledAt ?: meta.deletion_scheduled_at,
                    paymentGatewayProvider = meta.payment_gateway_provider ?: clinic.paymentGatewayProvider,
                    paymentApiKey = meta.payment_api_key ?: clinic.paymentApiKey,
                    paymentSecretKey = meta.payment_secret_key ?: clinic.paymentSecretKey,
                    merchantId = meta.merchant_id ?: clinic.merchantId,
                    isDirectPaymentEnabled = meta.is_direct_payment_enabled ?: clinic.isDirectPaymentEnabled,
                    paymentGatewaysJson = clinic.paymentGatewaysJson ?: meta.payment_gateways_json,
                    isActivated = meta.is_activated ?: clinic.isActivated,
                    activationExpiresAt = clinic.activationExpiresAt ?: meta.activation_expires_at,
                    activationPlan = clinic.activationPlan ?: meta.activation_plan,
                    activationPaidAmount = clinic.activationPaidAmount ?: meta.activation_paid_amount,
                    activationNotes = clinic.activationNotes ?: meta.activation_notes,
                    activationPaymentProofUrl = clinic.activationPaymentProofUrl ?: meta.activation_payment_proof_url,
                    avgConsultationTimeMinutes = meta.avg_consultation_time_minutes ?: clinic.avgConsultationTimeMinutes ?: 10,
                    manualAvgConsultationTimeMinutes = meta.manual_avg_consultation_time_minutes ?: clinic.manualAvgConsultationTimeMinutes ?: 10,
                    calculatedAvgConsultationTimeMinutes = meta.calculated_avg_consultation_time_minutes ?: clinic.calculatedAvgConsultationTimeMinutes,
                    avgTimeMode = meta.avg_time_mode ?: clinic.avgTimeMode ?: "auto",
                    isOnBreak = meta.is_on_break ?: clinic.isOnBreak ?: false,
                    breakUpdatedAt = meta.break_updated_at ?: clinic.breakUpdatedAt,
                    weeklyScheduleJson = meta.weekly_schedule_json ?: clinic.weeklyScheduleJson,
                    declaredHolidays = meta.declared_holidays
                )
            } catch (ignored: Exception) {}
        }
        return clinic
    }

    private fun packClinicMetadata(clinic: Clinic): String {
        val rawDesc = clinic.description
        val cleanDesc = if (!rawDesc.isNullOrBlank() && rawDesc.trim().startsWith("{")) {
            try { json.decodeFromString<ClinicExtendedMeta>(rawDesc).desc } catch (_: Exception) { rawDesc }
        } else {
            rawDesc
        }
        val meta = ClinicExtendedMeta(
            desc = cleanDesc,
            pan_number = clinic.panNumber,
            manager_phone = clinic.managerPhone,
            pictures = clinic.pictures,
            specialties = clinic.specialties,
            registration_doc_url = clinic.registrationDocUrl,
            is_archived = clinic.isArchived,
            archived_at = clinic.archivedAt,
            deletion_scheduled_at = clinic.deletionScheduledAt,
            payment_gateway_provider = clinic.paymentGatewayProvider,
            payment_api_key = clinic.paymentApiKey,
            payment_secret_key = null,
            merchant_id = clinic.merchantId,
            is_direct_payment_enabled = clinic.isDirectPaymentEnabled,
            payment_gateways_json = clinic.paymentGatewaysJson?.let { com.dactor.clinic.data.model.PaymentGatewaysConfig.parse(it).toJson() },
            is_activated = clinic.isActivated,
            activation_expires_at = clinic.activationExpiresAt,
            activation_plan = clinic.activationPlan,
            activation_paid_amount = clinic.activationPaidAmount,
            activation_notes = clinic.activationNotes,
            activation_payment_proof_url = clinic.activationPaymentProofUrl,
            avg_consultation_time_minutes = clinic.avgConsultationTimeMinutes ?: 10,
            manual_avg_consultation_time_minutes = clinic.manualAvgConsultationTimeMinutes ?: 10,
            calculated_avg_consultation_time_minutes = clinic.calculatedAvgConsultationTimeMinutes,
            avg_time_mode = clinic.avgTimeMode ?: "auto",
            is_on_break = clinic.isOnBreak ?: false,
            break_updated_at = clinic.breakUpdatedAt,
            weekly_schedule_json = clinic.weeklyScheduleJson,
            declared_holidays = clinic.declaredHolidays
        )
        return json.encodeToString(ClinicExtendedMeta.serializer(), meta)
    }

    suspend fun getClinicById(id: String): Clinic? = withContext(Dispatchers.IO) {
        try {
            val clinic = supabaseClient.postgrest["clinics"]
                .select {
                    filter {
                        eq("id", id)
                    }
                }.decodeSingleOrNull<Clinic>()
            val enriched = clinic?.let { enrichClinic(it) }
            if (enriched != null) {
                saveClinicToPersistentCache(enriched)
            }
            enriched
        } catch (e: Exception) {
            e.printStackTrace()
            getCachedClinicById(id) ?: getLastCachedClinic()
        }
    }

    suspend fun getClinicByEmail(email: String): Clinic? = withContext(Dispatchers.IO) {
        val targetEmail = email.trim().lowercase()
        try {
            val clinic = supabaseClient.postgrest["clinics"]
                .select {
                    filter {
                        ilike("contact_email", targetEmail)
                    }
                }.decodeSingleOrNull<Clinic>()
            val enriched = clinic?.let { enrichClinic(it) }
            if (enriched != null) {
                saveClinicToPersistentCache(enriched)
            }
            enriched ?: getCachedClinicByEmail(targetEmail) ?: getLastCachedClinic()
        } catch (e: Exception) {
            e.printStackTrace()
            getCachedClinicByEmail(targetEmail) ?: getLastCachedClinic()
        }
    }

    suspend fun getClinics(): List<Clinic> = withContext(Dispatchers.IO) {
        try {
            val list = supabaseClient.postgrest["clinics"]
                .select()
                .decodeList<Clinic>()
            val enrichedList = list.map { enrichClinic(it) }
            enrichedList.forEach { cachedClinicsById[it.id] = it }
            enrichedList
        } catch (e: Exception) {
            e.printStackTrace()
            emptyList()
        }
    }

    private fun sanitizeVerificationStatus(status: String?): String {
        return when (status?.trim()?.lowercase()) {
            "approved" -> "approved"
            "rejected" -> "rejected"
            "pending", "pending_verification", null, "" -> "pending"
            else -> "pending"
        }
    }

    suspend fun createClinic(clinic: Clinic): Clinic? = withContext(Dispatchers.IO) {
        try {
            val metaJson = packClinicMetadata(clinic)
            val baseDto = ClinicBaseDto(
                id = clinic.id,
                name = clinic.name,
                type = clinic.type,
                verificationStatus = sanitizeVerificationStatus(clinic.verificationStatus),
                contactPhone = clinic.contactPhone,
                contactEmail = clinic.contactEmail?.trim()?.lowercase(),
                addressText = clinic.addressText,
                latitude = clinic.latitude,
                longitude = clinic.longitude,
                autoNotifyThreshold = clinic.autoNotifyThreshold ?: 2,
                description = metaJson,
                logoUrl = clinic.logoUrl
            )
            val insertedBase = supabaseClient.postgrest["clinics"]
                .insert(baseDto) {
                    select()
                }.decodeSingleOrNull<ClinicBaseDto>()

            if (insertedBase != null) {
                cachedClinicsById[clinic.id] = clinic
                return@withContext clinic
            }
        } catch (e2: Exception) {
            e2.printStackTrace()
        }
        null
    }

    suspend fun updateClinic(id: String, clinic: Clinic): Boolean = withContext(Dispatchers.IO) {
        val metaJson = packClinicMetadata(clinic)
        cachedClinicsById[id] = clinic
        val dto = ClinicUpdateDto(
            name = clinic.name,
            type = clinic.type ?: "multi_visit",
            verificationStatus = sanitizeVerificationStatus(clinic.verificationStatus),
            contactPhone = clinic.contactPhone,
            contactEmail = clinic.contactEmail?.trim()?.lowercase(),
            addressText = clinic.addressText,
            latitude = clinic.latitude ?: 27.7052,
            longitude = clinic.longitude ?: 85.3193,
            autoNotifyThreshold = clinic.autoNotifyThreshold ?: 2,
            description = metaJson,
            logoUrl = clinic.logoUrl,
            registrationDocUrl = clinic.registrationDocUrl,
            panNumber = clinic.panNumber,
            managerPhone = clinic.managerPhone,
            pictures = clinic.pictures,
            isArchived = clinic.isArchived ?: false,
            archivedAt = clinic.archivedAt,
            deletionScheduledAt = clinic.deletionScheduledAt,
            paymentGatewayProvider = clinic.paymentGatewayProvider ?: "esewa",
            paymentApiKey = clinic.paymentApiKey,
            paymentSecretKey = null,
            merchantId = clinic.merchantId,
            isDirectPaymentEnabled = clinic.isDirectPaymentEnabled ?: false,
            isActivated = clinic.isActivated ?: true,
            activationExpiresAt = clinic.activationExpiresAt,
            activationPlan = clinic.activationPlan,
            activationPaidAmount = clinic.activationPaidAmount,
            activationNotes = clinic.activationNotes,
            activationPaymentProofUrl = clinic.activationPaymentProofUrl
        )

        try {
            supabaseClient.postgrest["clinics"].update(dto) {
                filter { eq("id", id) }
            }
            return@withContext true
        } catch (e: Exception) {
            e.printStackTrace()
            try {
                val baseDto = ClinicBaseUpdateDto(
                    name = clinic.name,
                    type = clinic.type ?: "multi_visit",
                    verificationStatus = sanitizeVerificationStatus(clinic.verificationStatus),
                    contactPhone = clinic.contactPhone,
                    contactEmail = clinic.contactEmail?.trim()?.lowercase(),
                    addressText = clinic.addressText,
                    latitude = clinic.latitude ?: 27.7052,
                    longitude = clinic.longitude ?: 85.3193,
                    autoNotifyThreshold = clinic.autoNotifyThreshold ?: 2,
                    description = metaJson
                )
                supabaseClient.postgrest["clinics"].update(baseDto) {
                    filter { eq("id", id) }
                }
                return@withContext true
            } catch (e2: Exception) {
                e2.printStackTrace()
                return@withContext false
            }
        }
    }

    suspend fun sendClinicBreakNotificationsToLiveQueue(
        clinicId: String,
        clinicName: String,
        breakWindowText: String? = null
    ): Int = withContext(Dispatchers.IO) {
        try {
            val todayStr = LocalDate.now().toString()
            val allAppts = try {
                supabaseClient.postgrest["appointments"]
                    .select {
                        filter {
                            eq("clinic_id", clinicId)
                            eq("appointment_date", todayStr)
                        }
                    }.decodeList<Appointment>()
            } catch (e: Exception) {
                emptyList()
            }

            val liveAppts = allAppts.filter {
                val status = it.checkinStatus?.lowercase() ?: ""
                status !in listOf("completed", "done", "finished", "cancelled", "no_show", "report_prepared") &&
                    status in listOf("waiting", "checked_in", "inside")
            }

            if (liveAppts.isEmpty()) return@withContext 0

            var sentCount = 0
            val title = NotificationTemplate.ClinicBreak.buildTitle(clinicName)

            for (appt in liveAppts) {
                val tagged = NotificationTemplate.ClinicBreak.buildMessage(
                    clinicName = clinicName,
                    breakWindowText = breakWindowText,
                    appointmentTime = appt.appointmentTime,
                    trackingCode = appt.trackingCode10Digit
                )
                val dto = mapOf(
                    "id" to UUID.randomUUID().toString(),
                    "user_id" to appt.userId?.takeIf { it.isNotBlank() },
                    "appointment_id" to appt.id.takeIf { it.length == 36 },
                    "title" to title,
                    "message" to tagged,
                    "type" to NotificationType.CLINIC_BREAK.key,
                    "target_audience" to "specific",
                    "is_read" to false
                )
                try {
                    supabaseClient.postgrest["notifications"].insert(dto)
                    sentCount++
                } catch (_: Exception) {}
            }
            sentCount
        } catch (e: Exception) {
            e.printStackTrace()
            0
        }
    }

    suspend fun toggleClinicBreak(clinicId: String, isOnBreak: Boolean): Clinic? = withContext(Dispatchers.IO) {
        val current = getCachedClinicById(clinicId) ?: getClinicById(clinicId) ?: return@withContext null
        val updated = current.copy(
            isOnBreak = isOnBreak,
            breakUpdatedAt = Instant.now().toString()
        )
        cachedClinicsById[clinicId] = updated
        val ok = updateClinic(clinicId, updated)
        if (ok) {
            if (isOnBreak) {
                CoroutineScope(Dispatchers.IO).launch {
                    try {
                        sendClinicBreakNotificationsToLiveQueue(clinicId, current.name)
                    } catch (_: Exception) {}
                }
            }
            updated
        } else null
    }

    suspend fun saveWeeklySchedule(
        clinicId: String,
        days: List<com.dactor.clinic.data.model.DayScheduleInfo>,
        isOnBreak: Boolean? = null
    ): Clinic? = withContext(Dispatchers.IO) {
        val current = getCachedClinicById(clinicId) ?: getClinicById(clinicId) ?: return@withContext null
        val scheduleJson = com.dactor.clinic.data.model.ClinicScheduleHelper.encodeWeeklySchedule(days)
        val updated = current.copy(
            weeklyScheduleJson = scheduleJson,
            isOnBreak = isOnBreak ?: current.isOnBreak,
            breakUpdatedAt = if (isOnBreak != null) Instant.now().toString() else current.breakUpdatedAt
        )
        cachedClinicsById[clinicId] = updated
        val ok = updateClinic(clinicId, updated)
        if (ok) {
            if (isOnBreak == true) {
                CoroutineScope(Dispatchers.IO).launch {
                    try {
                        sendClinicBreakNotificationsToLiveQueue(clinicId, current.name)
                    } catch (_: Exception) {}
                }
            }
            updated
        } else null
    }

    suspend fun toggleClinicHoliday(clinicId: String, dateStr: String, isHoliday: Boolean): Clinic? = withContext(Dispatchers.IO) {
        val current = getCachedClinicById(clinicId) ?: getClinicById(clinicId) ?: return@withContext null
        val cleanDate = dateStr.trim()
        val updatedSet = current.declaredHolidays.map { it.trim() }.toMutableSet()
        if (isHoliday) {
            updatedSet.add(cleanDate)
        } else {
            updatedSet.remove(cleanDate)
        }
        val updated = current.copy(declaredHolidays = updatedSet.sorted())
        cachedClinicsById[clinicId] = updated
        val ok = updateClinic(clinicId, updated)
        if (ok) updated else null
    }

    suspend fun updateClinicType(id: String, newType: String): Boolean = withContext(Dispatchers.IO) {
        try {
            supabaseClient.postgrest["clinics"]
                .update({
                    set("type", newType)
                }) {
                    filter {
                        eq("id", id)
                    }
                }
            true
        } catch (e: Exception) {
            e.printStackTrace()
            false
        }
    }

    suspend fun getClinicServices(clinicId: String): List<ClinicService> = withContext(Dispatchers.IO) {
        try {
            supabaseClient.postgrest["clinic_services"]
                .select {
                    filter {
                        eq("clinic_id", clinicId)
                    }
                }.decodeList<ClinicService>()
        } catch (e: Exception) {
            e.printStackTrace()
            emptyList()
        }
    }

    suspend fun addService(service: ClinicService): ClinicService? = withContext(Dispatchers.IO) {
        try {
            supabaseClient.postgrest["clinic_services"]
                .insert(service) {
                    select()
                }.decodeSingleOrNull<ClinicService>()
        } catch (e: Exception) {
            e.printStackTrace()
            null
        }
    }

    suspend fun deleteService(id: String): Boolean = withContext(Dispatchers.IO) {
        try {
            supabaseClient.postgrest["clinic_services"]
                .delete {
                    filter {
                        eq("id", id)
                    }
                }
            true
        } catch (e: Exception) {
            e.printStackTrace()
            false
        }
    }

    suspend fun scheduleClinicDeletion(clinicId: String): Result<String> = withContext(Dispatchers.IO) {
        try {
            val nowInstant = Instant.now()
            val scheduledInstant = nowInstant.plus(30, ChronoUnit.DAYS)
            val deletionScheduledAt = scheduledInstant.toString()
            val archivedAt = nowInstant.toString()

            val current = getClinicById(clinicId)
            if (current != null) {
                val updated = current.copy(
                    isArchived = true,
                    archivedAt = archivedAt,
                    deletionScheduledAt = deletionScheduledAt
                )
                updateClinic(clinicId, updated)
            } else {
                supabaseClient.postgrest["clinics"].update({
                    set("is_archived", true)
                    set("archived_at", archivedAt)
                    set("deletion_scheduled_at", deletionScheduledAt)
                    set("updated_at", archivedAt)
                }) {
                    filter { eq("id", clinicId) }
                }
            }
            Result.success(deletionScheduledAt)
        } catch (e: Exception) {
            e.printStackTrace()
            Result.failure(e)
        }
    }

    suspend fun cancelClinicDeletion(clinicId: String): Result<Boolean> = withContext(Dispatchers.IO) {
        try {
            val current = getClinicById(clinicId)
            if (current != null) {
                val updated = current.copy(
                    isArchived = false,
                    archivedAt = null,
                    deletionScheduledAt = null
                )
                updateClinic(clinicId, updated)
            } else {
                supabaseClient.postgrest["clinics"].update({
                    set("is_archived", false)
                    set<String?>("archived_at", null)
                    set<String?>("deletion_scheduled_at", null)
                    set("updated_at", Instant.now().toString())
                }) {
                    filter { eq("id", clinicId) }
                }
            }
            Result.success(true)
        } catch (e: Exception) {
            e.printStackTrace()
            Result.failure(e)
        }
    }

    suspend fun purgeExceededArchivedClinicData(clinicId: String): Result<Boolean> = withContext(Dispatchers.IO) {
        try {
            try {
                supabaseClient.postgrest["queue_entries"].delete { filter { eq("clinic_id", clinicId) } }
            } catch (ignored: Exception) {}

            try {
                supabaseClient.postgrest["lab_reports"].delete { filter { eq("clinic_id", clinicId) } }
            } catch (ignored: Exception) {}

            try {
                supabaseClient.postgrest["billing_invoices"].delete { filter { eq("clinic_id", clinicId) } }
            } catch (ignored: Exception) {}

            try {
                supabaseClient.postgrest["appointments"].delete { filter { eq("clinic_id", clinicId) } }
            } catch (ignored: Exception) {}

            try {
                supabaseClient.postgrest["slots"].delete { filter { eq("clinic_id", clinicId) } }
            } catch (ignored: Exception) {}

            try {
                supabaseClient.postgrest["clinic_services"].delete { filter { eq("clinic_id", clinicId) } }
            } catch (ignored: Exception) {}

            Result.success(true)
        } catch (e: Exception) {
            e.printStackTrace()
            Result.failure(e)
        }
    }

    suspend fun getGatewaySetupStatus(clinicId: String): com.dactor.clinic.data.model.GatewaySetupEnvelope? = withContext(Dispatchers.IO) {
        try {
            val response = supabaseClient.functions.invoke("appointment-payment", body = buildJsonObject {
                put("action", "get_gateway_setup_status")
                put("clinicId", clinicId)
            })
            val raw = response.body<String>()
            json.decodeFromString(com.dactor.clinic.data.model.GatewaySetupEnvelope.serializer(), raw)
        } catch (e: Exception) {
            e.printStackTrace()
            null
        }
    }

    suspend fun reconcilePendingPayments(clinicId: String): Int = withContext(Dispatchers.IO) {
        try {
            val response = supabaseClient.functions.invoke("appointment-payment", body = buildJsonObject {
                put("action", "reconcile_pending")
                put("clinicId", clinicId)
            })
            val obj = json.decodeFromString<kotlinx.serialization.json.JsonObject>(response.body<String>())
            obj["finalizedCount"]?.toString()?.trim('"')?.toIntOrNull() ?: 0
        } catch (_: Exception) {
            0
        }
    }

    suspend fun toggleGateway(
        clinicId: String,
        gateway: String,
        enabled: Boolean
    ): Result<Boolean> = withContext(Dispatchers.IO) {
        try {
            val response = supabaseClient.functions.invoke("appointment-payment", body = buildJsonObject {
                put("action", "toggle_gateway")
                put("clinicId", clinicId)
                put("gateway", gateway.lowercase())
                put("enabled", enabled)
            })
            val raw = response.body<String>()
            val obj = try { json.decodeFromString<kotlinx.serialization.json.JsonObject>(raw) } catch (_: Exception) { null }
            val errMsg = obj?.get("error")?.toString()?.trim('"')
            if (!errMsg.isNullOrBlank() && errMsg != "null") {
                return@withContext Result.failure(Exception(errMsg))
            }
            Result.success(true)
        } catch (e: Exception) {
            e.printStackTrace()
            Result.failure(e)
        }
    }

    suspend fun saveGatewayCredentials(
        clinicId: String,
        gatewayProvider: String,
        environment: String = "test",
        enabled: Boolean = true,
        isDirectPaymentEnabled: Boolean = true,
        merchantId: String? = null,
        apiKey: String? = null,
        secretKey: String? = null,
        username: String? = null,
        password: String? = null,
        appId: String? = null,
        appName: String? = null,
        appPassword: String? = null,
        privateKeyPem: String? = null,
        pfxBase64: String? = null,
        pfxPassword: String? = null
    ): Result<String> = withContext(Dispatchers.IO) {
        try {
            val gw = gatewayProvider.lowercase().trim()
            val response = supabaseClient.functions.invoke("appointment-payment", body = buildJsonObject {
                put("action", "save_credentials")
                put("clinicId", clinicId)
                put("gateway", gw)
                put("environment", environment.lowercase())
                put("enabled", enabled)
                put("isDirectPaymentEnabled", isDirectPaymentEnabled)
                when (gw) {
                    "esewa" -> {
                        put("productCode", merchantId?.takeIf { it.isNotBlank() } ?: apiKey.orEmpty())
                        if (!secretKey.isNullOrBlank()) put("secretKey", secretKey.trim())
                    }
                    "khalti" -> {
                        if (!apiKey.isNullOrBlank()) put("publicKey", apiKey.trim())
                        else if (!merchantId.isNullOrBlank()) put("publicKey", merchantId.trim())
                        if (!secretKey.isNullOrBlank()) put("secretKey", secretKey.trim())
                    }
                    "fonepay" -> {
                        put("merchantCode", merchantId?.takeIf { it.isNotBlank() } ?: apiKey.orEmpty())
                        if (!secretKey.isNullOrBlank()) put("secretKey", secretKey.trim())
                        if (!username.isNullOrBlank()) put("username", username.trim())
                        if (!password.isNullOrBlank()) put("password", password.trim())
                    }
                    "connectips" -> {
                        put("merchantId", merchantId.orEmpty().trim())
                        put("appId", appId?.takeIf { it.isNotBlank() } ?: apiKey.orEmpty().trim())
                        put("appName", appName?.takeIf { it.isNotBlank() } ?: "DactorClinic")
                        if (!appPassword.isNullOrBlank()) put("appPassword", appPassword.trim())
                        if (!privateKeyPem.isNullOrBlank()) put("privateKeyPem", privateKeyPem.trim())
                        else if (!secretKey.isNullOrBlank()) put("privateKeyPem", secretKey.trim())
                        if (!pfxBase64.isNullOrBlank()) put("pfxBase64", pfxBase64.trim())
                        if (!pfxPassword.isNullOrBlank()) put("pfxPassword", pfxPassword)
                    }
                }
            })
            val raw = response.body<String>()
            val obj = try { json.decodeFromString<kotlinx.serialization.json.JsonObject>(raw) } catch (_: Exception) { null }
            val errMsg = obj?.get("error")?.toString()?.trim('"')
            if (!errMsg.isNullOrBlank() && errMsg != "null") {
                return@withContext Result.failure(Exception(errMsg))
            }
            val msg = obj?.get("message")?.toString()?.trim('"') ?: "${gw.uppercase()} credentials verified and saved securely."
            clearCache()
            Result.success(msg)
        } catch (e: Exception) {
            e.printStackTrace()
            Result.failure(e)
        }
    }

    suspend fun updatePaymentGatewayKeys(
        clinicId: String,
        gatewayProvider: String,
        apiKey: String,
        secretKey: String?,
        merchantId: String?,
        isDirectPaymentEnabled: Boolean,
        environment: String = "test"
    ): Result<Boolean> = updatePaymentApiKeys(clinicId, gatewayProvider, apiKey, secretKey, merchantId, isDirectPaymentEnabled, environment)

    suspend fun updatePaymentApiKeys(
        clinicId: String,
        gatewayProvider: String,
        apiKey: String,
        secretKey: String?,
        merchantId: String?,
        isDirectPaymentEnabled: Boolean,
        environment: String = "test"
    ): Result<Boolean> = withContext(Dispatchers.IO) {
        val res = saveGatewayCredentials(
            clinicId = clinicId,
            gatewayProvider = gatewayProvider,
            environment = environment,
            enabled = true,
            isDirectPaymentEnabled = isDirectPaymentEnabled,
            merchantId = merchantId,
            apiKey = apiKey,
            secretKey = secretKey
        )
        res.map { true }
    }

    suspend fun requestActivationRenewal(
        clinicId: String,
        plan: String,
        amount: Double,
        notes: String
    ): Result<Boolean> = withContext(Dispatchers.IO) {
        try {
            val current = getClinicById(clinicId)
            if (current != null) {
                val updated = current.copy(
                    activationPlan = plan,
                    activationPaidAmount = amount,
                    activationNotes = notes.trim()
                )
                updateClinic(clinicId, updated)
            } else {
                supabaseClient.postgrest["clinics"].update({
                    set("activation_plan", plan)
                    set("activation_paid_amount", amount)
                    set("activation_notes", notes.trim())
                    set("updated_at", Instant.now().toString())
                }) {
                    filter { eq("id", clinicId) }
                }
            }
            Result.success(true)
        } catch (e: Exception) {
            e.printStackTrace()
            Result.failure(e)
        }
    }

    suspend fun uploadClinicFile(fileName: String, fileBytes: ByteArray, bucketName: String = "clinic_photos"): String? = withContext(Dispatchers.IO) {
        try {
            val compressed = com.dactor.clinic.domain.util.FileCompressor.compressBytes(fileBytes, fileName)
            val finalName = compressed.fileName
            val bucket = supabaseClient.storage[bucketName]
            bucket.upload(finalName, compressed.bytes, upsert = true)
            bucket.publicUrl(finalName)
        } catch (e: Exception) {
            e.printStackTrace()
            null
        }
    }

    suspend fun getSpecialties(): List<MedicalSpecialty> = withContext(Dispatchers.IO) {
        try {
            supabaseClient.postgrest["medical_specialties"]
                .select {
                    filter {
                        eq("is_active", true)
                    }
                }
                .decodeList<MedicalSpecialty>()
                .filter { it.category != "system_config" && !it.name.startsWith("system_config") }
        } catch (e: Exception) {
            e.printStackTrace()
            emptyList()
        }
    }

    suspend fun getQualifications(): List<MedicalQualification> = withContext(Dispatchers.IO) {
        try {
            supabaseClient.postgrest["medical_qualifications"]
                .select {
                    filter {
                        eq("is_active", true)
                    }
                }
                .decodeList<MedicalQualification>()
                .filter { it.level != "LOCATION_OPTION" && it.level != "PLATFORM_PAYMENT_CONFIG" }
        } catch (e: Exception) {
            e.printStackTrace()
            emptyList()
        }
    }

    /**
     * Fetches the Admin's platform payment gateway APIs/keys from Supabase (`medical_qualifications` where level = 'PLATFORM_PAYMENT_CONFIG')
     * so clinics can pay the admin directly for clinic activation & subscription renewals.
     */
    suspend fun getPlatformPaymentConfig(): com.dactor.clinic.data.model.PaymentGatewaysConfig = withContext(Dispatchers.IO) {
        try {
            val rows = supabaseClient.postgrest["medical_qualifications"]
                .select {
                    filter {
                        eq("level", "PLATFORM_PAYMENT_CONFIG")
                    }
                }
                .decodeList<MedicalQualification>()
            val configRow = rows.firstOrNull { it.degreeName == "ADMIN_PAYMENT_GATEWAYS" } ?: rows.firstOrNull()
            if (configRow != null && !configRow.description.isNullOrBlank()) {
                return@withContext com.dactor.clinic.data.model.PaymentGatewaysConfig.parse(configRow.description)
            }
        } catch (e: Exception) {
            e.printStackTrace()
        }
        com.dactor.clinic.data.model.PaymentGatewaysConfig()
    }

    /**
     * Completes a clinic-to-admin subscription payment (via real gateway or testing bypass)
     * and immediately activates / extends the clinic's subscription in Supabase.
     */
    suspend fun completeClinicSubscriptionPayment(
        clinicId: String,
        daysToAdd: Int,
        planName: String,
        paidAmount: Double,
        transactionId: String,
        gateway: String
    ): Result<Clinic> = withContext(Dispatchers.IO) {
        try {
            val current = getClinicById(clinicId) ?: return@withContext Result.failure(Exception("Clinic not found"))
            val baseInstant = try {
                val existingExp = current.activationExpiresAt
                if (!existingExp.isNullOrBlank()) {
                    val parsed = Instant.parse(existingExp)
                    if (parsed.isAfter(Instant.now())) parsed else Instant.now()
                } else {
                    Instant.now()
                }
            } catch (_: Exception) {
                Instant.now()
            }
            val newExpiryIso = baseInstant.plus(daysToAdd.toLong(), ChronoUnit.DAYS).toString()
            val noteSummary = "Paid NPR ${paidAmount.toInt()} via ${gateway.uppercase()} • Txn #$transactionId • ${Instant.now()}"
            val updated = current.copy(
                isActivated = true,
                activationExpiresAt = newExpiryIso,
                activationPlan = planName,
                activationPaidAmount = paidAmount,
                activationNotes = noteSummary
            )
            val saved = updateClinic(clinicId, updated)
            if (saved) {
                cachedClinicsById[clinicId] = updated
                Result.success(updated)
            } else {
                Result.failure(Exception("Failed to save clinic subscription activation to Supabase"))
            }
        } catch (e: Exception) {
            e.printStackTrace()
            Result.failure(e)
        }
    }
}
