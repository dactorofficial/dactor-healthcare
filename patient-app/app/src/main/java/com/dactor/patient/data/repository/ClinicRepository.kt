package com.dactor.patient.data.repository

import com.dactor.patient.data.model.Clinic
import com.dactor.patient.data.model.ClinicService
import com.dactor.patient.data.model.MedicalSpecialty
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.postgrest.postgrest
import io.github.jan.supabase.postgrest.rpc
import com.dactor.patient.util.OpenRouteSpatialEngine
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import java.time.Instant
import java.time.LocalDate
import java.util.concurrent.ConcurrentHashMap
import javax.inject.Inject
import javax.inject.Singleton

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
    val declared_holidays: List<String> = emptyList(),
    val verification_status: String? = null
)

@Singleton
class ClinicRepository @Inject constructor(
    private val supabaseClient: SupabaseClient
) {
    private val json = Json { ignoreUnknownKeys = true; isLenient = true; encodeDefaults = true; coerceInputValues = true }

    @Volatile
    private var cachedClinics: List<Clinic>? = null
    private val cachedClinicsById = ConcurrentHashMap<String, Clinic>()

    @Volatile
    private var cachedAllServicesByClinic: Map<String, List<ClinicService>>? = null

    @Volatile
    private var cachedSpecialties: List<MedicalSpecialty>? = null

    fun getCachedClinics(): List<Clinic>? = cachedClinics

    fun getCachedClinicById(id: String): Clinic? = cachedClinicsById[id]

    fun getCachedAllServicesByClinic(): Map<String, List<ClinicService>>? = cachedAllServicesByClinic

    fun getCachedServices(clinicId: String): List<ClinicService> = cachedAllServicesByClinic?.get(clinicId) ?: emptyList()

    fun getCachedSpecialties(): List<MedicalSpecialty>? = cachedSpecialties

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
                    verificationStatus = clinic.verificationStatus ?: meta.verification_status,
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

    fun isClinicActivated(clinic: Clinic): Boolean {
        if (clinic.isArchived == true) return false
        if (clinic.isActivated == false) return false

        // ── Admin Verification Check ──
        // Clinic must be approved/verified by admin before it can appear for booking to patient
        val vStatus = clinic.verificationStatus?.trim()?.lowercase()
        if (vStatus != "approved" && vStatus != "verified") {
            return false
        }

        val exp = clinic.activationExpiresAt
        if (!exp.isNullOrBlank()) {
            try {
                val expInstant = Instant.parse(exp)
                if (expInstant.isBefore(Instant.now())) return false
            } catch (e: Exception) {
                try {
                    val expDate = LocalDate.parse(exp.take(10))
                    if (expDate.isBefore(LocalDate.now())) return false
                } catch (ignored: Exception) {}
            }
        }
        return true
    }

    suspend fun getClinics(forceRefresh: Boolean = false): List<Clinic> {
        if (!forceRefresh && cachedClinics != null) {
            return cachedClinics!!
        }
        return try {
            val list = supabaseClient.postgrest["clinics"]
                .select()
                .decodeList<Clinic>()
                .map { enrichClinic(it) }
            val active = list.filter { isClinicActivated(it) }
            cachedClinics = active
            active.forEach { cachedClinicsById[it.id] = it }
            active
        } catch (e: Exception) {
            cachedClinics ?: emptyList()
        }
    }

    suspend fun getClinicById(id: String, forceRefresh: Boolean = false): Clinic? {
        if (!forceRefresh) {
            cachedClinicsById[id]?.let { return it }
        }
        return try {
            val rawClinic = supabaseClient.postgrest["clinics"]
                .select { filter { eq("id", id) } }
                .decodeSingleOrNull<Clinic>()
            val clinic = rawClinic?.let { enrichClinic(it) }
            if (clinic != null && isClinicActivated(clinic)) {
                cachedClinicsById[id] = clinic
                clinic
            } else null
        } catch (e: Exception) {
            cachedClinicsById[id]
        }
    }

    suspend fun searchClinics(query: String): List<Clinic> {
        val current = cachedClinics
        if (current != null && query.isNotBlank()) {
            val q = query.trim().lowercase()
            return current.filter { it.name.lowercase().contains(q) || (it.addressText ?: "").lowercase().contains(q) }
        }
        return try {
            val list = supabaseClient.postgrest["clinics"]
                .select { filter { ilike("name", "%$query%") } }
                .decodeList<Clinic>()
                .map { enrichClinic(it) }
            list.filter { isClinicActivated(it) }
        } catch (e: Exception) {
            emptyList()
        }
    }

    suspend fun getNearbyClinics(
        userLat: Double,
        userLng: Double,
        radiusKm: Double = 30.0,
        limit: Int = 50,
        offset: Int = 0,
        searchQuery: String? = null
    ): List<Clinic> {
        return try {
            val params = buildJsonObject {
                put("p_lat", userLat)
                put("p_lng", userLng)
                put("p_radius_km", radiusKm)
                put("p_limit", limit)
                put("p_offset", offset)
                if (!searchQuery.isNullOrBlank()) {
                    put("p_search_query", searchQuery.trim())
                }
            }
            val list = supabaseClient.postgrest.rpc(
                function = "get_nearby_clinics",
                parameters = params
            ).decodeList<Clinic>().map { enrichClinic(it) }

            val active = list.filter { isClinicActivated(it) }
            active.forEach { cachedClinicsById[it.id] = it }
            active
        } catch (e: Exception) {
            // Graceful fallback to cached or standard getClinics() with local spatial filtering
            val fallback = getClinics(forceRefresh = false)
            fallback.filter { c ->
                val cLat = c.latitude
                val cLng = c.longitude
                if (cLat != null && cLng != null) {
                    OpenRouteSpatialEngine.isWithinBoundingBox(userLat, userLng, cLat, cLng, radiusKm)
                } else true
            }.sortedBy { c ->
                if (c.latitude != null && c.longitude != null) {
                    OpenRouteSpatialEngine.haversineKm(userLat, userLng, c.latitude!!, c.longitude!!)
                } else Double.MAX_VALUE
            }
        }
    }

    /**
     * Fetches ALL clinic services across all clinics in a single round-trip query and groups by clinicId.
     * Eliminates N sequential HTTP calls when loading the clinic list.
     */
    suspend fun getAllClinicServicesGrouped(forceRefresh: Boolean = false): Map<String, List<ClinicService>> {
        if (!forceRefresh && cachedAllServicesByClinic != null) {
            return cachedAllServicesByClinic!!
        }
        return try {
            val allServices = supabaseClient.postgrest["clinic_services"]
                .select()
                .decodeList<ClinicService>()
            val grouped = allServices.groupBy { it.clinicId }
            cachedAllServicesByClinic = grouped
            grouped
        } catch (e: Exception) {
            cachedAllServicesByClinic ?: emptyMap()
        }
    }

    suspend fun getClinicServices(clinicId: String): List<ClinicService> {
        cachedAllServicesByClinic?.get(clinicId)?.let { return it }
        return try {
            supabaseClient.postgrest["clinic_services"]
                .select { filter { eq("clinic_id", clinicId) } }
                .decodeList<ClinicService>()
        } catch (e: Exception) {
            emptyList()
        }
    }

    suspend fun getSpecialties(): List<MedicalSpecialty> {
        cachedSpecialties?.let { return it }
        return try {
            val list = supabaseClient.postgrest["medical_specialties"]
                .select {
                    filter {
                        eq("is_active", true)
                    }
                }
                .decodeList<MedicalSpecialty>()
            cachedSpecialties = list
            list
        } catch (e: Exception) {
            cachedSpecialties ?: emptyList()
        }
    }

    suspend fun getServiceLocations(forceRefresh: Boolean = false): List<com.dactor.patient.data.model.MedicalQualification> {
        return try {
            supabaseClient.postgrest["medical_qualifications"]
                .select {
                    filter {
                        eq("level", "LOCATION_OPTION")
                        eq("is_active", true)
                    }
                }
                .decodeList<com.dactor.patient.data.model.MedicalQualification>()
        } catch (e: Exception) {
            emptyList()
        }
    }
}
