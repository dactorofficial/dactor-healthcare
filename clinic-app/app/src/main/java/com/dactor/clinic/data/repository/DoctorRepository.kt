package com.dactor.clinic.data.repository

import com.dactor.clinic.data.model.Appointment
import com.dactor.clinic.data.model.Clinic
import com.dactor.clinic.data.model.ClinicInvitation
import com.dactor.clinic.data.model.Doctor
import com.dactor.clinic.data.model.MedicalSpecialty
import com.dactor.clinic.data.model.MedicalQualification
import com.dactor.clinic.data.model.NotificationTemplate
import com.dactor.clinic.data.model.NotificationType
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.postgrest.postgrest
import io.github.jan.supabase.storage.storage
import io.github.jan.supabase.functions.functions
import android.util.Log
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import java.time.LocalDate
import java.util.UUID
import javax.inject.Inject
import javax.inject.Singleton
import android.content.Context
import dagger.hilt.android.qualifiers.ApplicationContext

@Serializable
data class DoctorBaseDto(
    @SerialName("id") val id: String,
    @SerialName("user_id") val userId: String? = null,
    @SerialName("clinic_id") val clinicId: String? = null,
    @SerialName("full_name") val fullName: String,
    @SerialName("email") val email: String,
    @SerialName("specialty") val specialty: String? = null,
    @SerialName("nmc_license_number") val nmcLicenseNumber: String? = null,
    @SerialName("license_doc_url") val licenseDocUrl: String? = null,
    @SerialName("certificates_doc_url") val certificatesDocUrl: String? = null,
    @SerialName("kyc_status") val kycStatus: String? = null,
    @SerialName("is_in_clinic") val isInClinic: Boolean = false,
    @SerialName("active_clinic_id") val activeClinicId: String? = null,
    @SerialName("primary_clinic_id") val primaryClinicId: String? = null,
    @SerialName("consultation_fee") val consultationFee: Double? = null
)

@Serializable
data class DoctorExtendedMeta(
    val gender: String? = null,
    val age: Int? = null,
    val starting_practicing_year: Int? = null,
    val profile_picture_url: String? = null,
    val education: String? = null,
    val personal_mobile_number: String? = null,
    val public_mobile_number: String? = null,
    val description: String? = null,
    val original_certificates_doc_url: String? = null,
    val practitioner_role: String? = null
)

@Serializable
data class DoctorUpdateDto(
    @SerialName("full_name") val fullName: String,
    @SerialName("email") val email: String,
    @SerialName("specialty") val specialty: String? = null,
    @SerialName("nmc_license_number") val nmcLicenseNumber: String? = null,
    @SerialName("license_doc_url") val licenseDocUrl: String? = null,
    @SerialName("certificates_doc_url") val certificatesDocUrl: String? = null,
    @SerialName("kyc_status") val kycStatus: String? = null,
    @SerialName("is_in_clinic") val isInClinic: Boolean = true,
    @SerialName("active_clinic_id") val activeClinicId: String? = null,
    @SerialName("primary_clinic_id") val primaryClinicId: String? = null,
    @SerialName("consultation_fee") val consultationFee: Double? = null,
    @SerialName("gender") val gender: String? = null,
    @SerialName("age") val age: Int? = null,
    @SerialName("starting_practicing_year") val startingPracticingYear: Int? = null,
    @SerialName("profile_picture_url") val profilePictureUrl: String? = null,
    @SerialName("education") val education: String? = null,
    @SerialName("personal_mobile_number") val personalMobileNumber: String? = null,
    @SerialName("public_mobile_number") val publicMobileNumber: String? = null,
    @SerialName("description") val description: String? = null
)

@Singleton
class DoctorRepository @Inject constructor(
    private val supabaseClient: SupabaseClient,
    @ApplicationContext private val context: Context? = null
) {
    private val json = Json { ignoreUnknownKeys = true; isLenient = true; encodeDefaults = true; coerceInputValues = true }
    private val cachedDoctorsByClinic = java.util.concurrent.ConcurrentHashMap<String, List<Doctor>>()
    private val prefs by lazy {
        try {
            context?.getSharedPreferences("dactor_doctor_persistent_cache", Context.MODE_PRIVATE)
        } catch (_: Exception) {
            null
        }
    }

    fun saveDoctorsToPersistentCache(clinicId: String, doctors: List<Doctor>) {
        if (clinicId.isBlank()) return
        try {
            cachedDoctorsByClinic[clinicId] = doctors
            val serialized = json.encodeToString(kotlinx.serialization.builtins.ListSerializer(Doctor.serializer()), doctors)
            prefs?.edit()?.putString("doctors_clinic_$clinicId", serialized)?.apply()
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    fun saveDoctorToPersistentCache(doctor: Doctor) {
        try {
            val serialized = json.encodeToString(Doctor.serializer(), doctor)
            prefs?.edit()
                ?.putString("doctor_${doctor.id}", serialized)
                ?.putString("last_active_doctor", serialized)
                ?.apply {
                    val email = doctor.email.trim().lowercase()
                    if (email.isNotBlank()) {
                        putString("doctor_by_email_$email", serialized)
                    }
                }
                ?.apply()
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    fun getCachedDoctorById(id: String): Doctor? {
        if (id.isBlank()) return null
        val inMem = getCachedDoctorById(id) ?: cachedAllDoctors.find { it.id == id } ?: cachedDoctorsByClinic.values.flatten().find { it.id == id }
        if (inMem != null) return inMem
        return try {
            val serialized = prefs?.getString("doctor_$id", null) ?: prefs?.getString("last_active_doctor", null)
            if (!serialized.isNullOrBlank()) {
                json.decodeFromString(Doctor.serializer(), serialized)
            } else null
        } catch (e: Exception) {
            null
        }
    }

    fun getLastCachedDoctor(): Doctor? {
        return try {
            val serialized = prefs?.getString("last_active_doctor", null)
            if (!serialized.isNullOrBlank()) {
                json.decodeFromString(Doctor.serializer(), serialized)
            } else null
        } catch (e: Exception) {
            null
        }
    }

    @Volatile
    private var cachedAllDoctors: List<Doctor> = emptyList()

    fun getCachedAllDoctors(): List<Doctor> = cachedAllDoctors

    fun getLastCachedDoctors(): List<Doctor> {
        val firstInMem = cachedDoctorsByClinic.values.firstOrNull { it.isNotEmpty() }
        if (!firstInMem.isNullOrEmpty()) return firstInMem
        return try {
            val allKeys = prefs?.all?.keys ?: emptySet()
            val clinicKey = allKeys.firstOrNull { it.startsWith("doctors_clinic_") }
            if (clinicKey != null) {
                val serialized = prefs?.getString(clinicKey, null)
                if (!serialized.isNullOrBlank()) {
                    json.decodeFromString(kotlinx.serialization.builtins.ListSerializer(Doctor.serializer()), serialized)
                } else emptyList()
            } else emptyList()
        } catch (_: Exception) {
            emptyList()
        }
    }

    fun getCachedDoctorsByClinic(clinicId: String): List<Doctor> {
        val inMem = cachedDoctorsByClinic[clinicId]
        if (!inMem.isNullOrEmpty()) return inMem
        return try {
            val serialized = prefs?.getString("doctors_clinic_$clinicId", null)
            if (!serialized.isNullOrBlank()) {
                val decoded = json.decodeFromString(kotlinx.serialization.builtins.ListSerializer(Doctor.serializer()), serialized)
                cachedDoctorsByClinic[clinicId] = decoded
                decoded
            } else emptyList()
        } catch (_: Exception) {
            emptyList()
        }
    }

    fun updateCachedDoctorsByClinic(clinicId: String, doctors: List<Doctor>) {
        if (clinicId.isNotBlank()) {
            cachedDoctorsByClinic[clinicId] = doctors
        }
    }

    fun clearCache() {
        cachedDoctorsByClinic.clear()
        cachedAllDoctors = emptyList()
    }

    private fun enrichDoctor(doctor: Doctor): Doctor {
        val certs = doctor.certificatesDocUrl
        if (!certs.isNullOrBlank() && certs.trim().startsWith("{")) {
            try {
                val meta = json.decodeFromString<DoctorExtendedMeta>(certs)
                return doctor.copy(
                    gender = doctor.gender ?: meta.gender,
                    age = doctor.age ?: meta.age,
                    startingPracticingYear = doctor.startingPracticingYear ?: meta.starting_practicing_year,
                    profilePictureUrl = doctor.profilePictureUrl ?: meta.profile_picture_url,
                    education = doctor.education ?: meta.education,
                    personalMobileNumber = doctor.personalMobileNumber ?: meta.personal_mobile_number,
                    publicMobileNumber = doctor.publicMobileNumber ?: meta.public_mobile_number,
                    description = doctor.description ?: meta.description,
                    certificatesDocUrl = meta.original_certificates_doc_url,
                    practitionerRole = doctor.practitionerRole ?: meta.practitioner_role
                )
            } catch (ignored: Exception) {}
        }
        return doctor
    }

    private fun packDoctorMetadata(doctor: Doctor): String {
        val meta = DoctorExtendedMeta(
            gender = doctor.gender,
            age = doctor.age,
            starting_practicing_year = doctor.startingPracticingYear,
            profile_picture_url = doctor.profilePictureUrl,
            education = doctor.education,
            personal_mobile_number = doctor.personalMobileNumber,
            public_mobile_number = doctor.publicMobileNumber,
            description = doctor.description,
            original_certificates_doc_url = doctor.certificatesDocUrl,
            practitioner_role = doctor.practitionerRole
        )
        return json.encodeToString(DoctorExtendedMeta.serializer(), meta)
    }

    suspend fun getDoctorsByClinic(clinicId: String): List<Doctor> = withContext(Dispatchers.IO) {
        try {
            coroutineScope {
                val directDeferred = async {
                    try {
                        supabaseClient.postgrest["doctors"]
                            .select {
                                filter {
                                    or {
                                        eq("clinic_id", clinicId)
                                        eq("primary_clinic_id", clinicId)
                                    }
                                }
                            }.decodeList<Doctor>().map { enrichDoctor(it) }
                    } catch (e: Exception) {
                        try {
                            supabaseClient.postgrest["doctors"]
                                .select {
                                    filter {
                                        eq("clinic_id", clinicId)
                                    }
                                }.decodeList<Doctor>().map { enrichDoctor(it) }
                        } catch (e2: Exception) {
                            emptyList()
                        }
                    }
                }

                val invitesDeferred = async {
                    try {
                        supabaseClient.postgrest["clinic_invitations"]
                            .select {
                                filter {
                                    eq("clinic_id", clinicId)
                                    eq("status", "accepted")
                                }
                            }.decodeList<ClinicInvitation>()
                    } catch (e: Exception) {
                        emptyList()
                    }
                }

                val directDocs = directDeferred.await()
                val acceptedInvites = invitesDeferred.await()

                val invitedEmails = acceptedInvites.map { it.email.trim().lowercase() }.toSet()
                val invitedDocs = if (invitedEmails.isNotEmpty()) {
                    try {
                        supabaseClient.postgrest["doctors"]
                            .select {
                                filter {
                                    isIn("email", invitedEmails.toList())
                                }
                            }.decodeList<Doctor>().map { enrichDoctor(it) }
                    } catch (e: Exception) {
                        try {
                            // Targeted fallback query per email instead of full table scan
                            coroutineScope {
                                invitedEmails.map { email ->
                                    async {
                                        try {
                                            supabaseClient.postgrest["doctors"]
                                                .select { filter { ilike("email", email) } }
                                                .decodeList<Doctor>().map { enrichDoctor(it) }
                                        } catch (_: Exception) {
                                            emptyList()
                                        }
                                    }
                                }.flatMap { it.await() }
                            }
                        } catch (_: Exception) {
                            emptyList()
                        }
                    }
                } else emptyList()

                val allRoster = (directDocs + invitedDocs).distinctBy { it.id }

                val computed = allRoster.map { doc ->
                    val effectiveActiveClinicId = doc.activeClinicId ?: doc.clinicId
                    val isPresentHere = (doc.isInClinic == true) && (effectiveActiveClinicId == clinicId)
                    doc.copy(isInClinic = isPresentHere)
                }
                if (clinicId.isNotBlank()) {
                    saveDoctorsToPersistentCache(clinicId, computed)
                }
                computed
            }
        } catch (e: Exception) {
            e.printStackTrace()
            cachedDoctorsByClinic[clinicId] ?: emptyList()
        }
    }

    suspend fun getDoctorById(id: String): Doctor? = withContext(Dispatchers.IO) {
        try {
            val doc = supabaseClient.postgrest["doctors"]
                .select {
                    filter {
                        eq("id", id)
                    }
                }.decodeSingleOrNull<Doctor>()
            doc?.let { enrichDoctor(it) }
        } catch (e: Exception) {
            e.printStackTrace()
            null
        }
    }

    suspend fun createDoctor(doctor: Doctor): Doctor? = withContext(Dispatchers.IO) {
        // Attempt 1: Full insert (if all columns exist in database)
        try {
            val inserted = supabaseClient.postgrest["doctors"]
                .insert(doctor) {
                    select()
                }.decodeSingleOrNull<Doctor>()
            if (inserted != null) return@withContext enrichDoctor(inserted)
        } catch (e: Exception) {
            println("Full doctor insert failed, attempting fallback with metadata packing: ${e.message}")
        }

        // Attempt 2: Base schema insert packing extended fields in certificates_doc_url JSON
        try {
            val metaJson = packDoctorMetadata(doctor)
            val baseDto = DoctorBaseDto(
                id = doctor.id,
                userId = doctor.userId,
                clinicId = doctor.clinicId,
                fullName = doctor.fullName,
                email = doctor.email.trim().lowercase(),
                specialty = doctor.specialty,
                nmcLicenseNumber = doctor.nmcLicenseNumber,
                licenseDocUrl = doctor.licenseDocUrl,
                certificatesDocUrl = metaJson,
                kycStatus = doctor.kycStatus ?: "pending",
                isInClinic = doctor.isInClinic,
                activeClinicId = if (doctor.isInClinic) (doctor.activeClinicId ?: doctor.clinicId) else null,
                primaryClinicId = doctor.primaryClinicId ?: doctor.clinicId,
                consultationFee = doctor.consultationFee ?: 500.0
            )
            val insertedBase = supabaseClient.postgrest["doctors"]
                .insert(baseDto) {
                    select()
                }.decodeSingleOrNull<DoctorBaseDto>()

            if (insertedBase != null) {
                return@withContext doctor
            }
        } catch (e2: Exception) {
            e2.printStackTrace()
        }
        null
    }

    private val lastPresenceBroadcastMap = java.util.concurrent.ConcurrentHashMap<String, Pair<Boolean, Long>>()

    suspend fun notifyWaitingPatientsDoctorPresence(
        doctorId: String,
        isInClinic: Boolean,
        clinicId: String? = null
    ): Int = withContext(Dispatchers.IO) {
        try {
            // Anti-spam cooldown: suppress repeated toggles for the same doctor with the same state within 60 seconds
            val now = System.currentTimeMillis()
            val lastState = lastPresenceBroadcastMap[doctorId]
            if (lastState != null && lastState.first == isInClinic && (now - lastState.second) < 60_000L) {
                return@withContext 0
            }
            lastPresenceBroadcastMap[doctorId] = Pair(isInClinic, now)

            val doctor = getDoctorById(doctorId)
            val doctorName = doctor?.fullName?.trim() ?: "Doctor"
            val cid = clinicId?.takeIf { it.isNotBlank() } ?: doctor?.activeClinicId ?: doctor?.clinicId ?: doctor?.primaryClinicId
            val clinicName = if (!cid.isNullOrBlank()) {
                try {
                    supabaseClient.postgrest["clinics"]
                        .select { filter { eq("id", cid) } }
                        .decodeSingleOrNull<Clinic>()?.name?.trim() ?: "the clinic"
                } catch (_: Exception) { "the clinic" }
            } else "the clinic"

            val todayStr = LocalDate.now().toString()
            val allAppts = try {
                supabaseClient.postgrest["appointments"]
                    .select {
                        filter {
                            eq("doctor_id", doctorId)
                            eq("appointment_date", todayStr)
                            if (!cid.isNullOrBlank()) {
                                eq("clinic_id", cid)
                            }
                        }
                    }
                    .decodeList<Appointment>()
            } catch (e: Exception) {
                Log.w("DoctorRepository", "Error fetching appointments for doctor presence notification", e)
                emptyList()
            }

            val waitingAppts = allAppts.filter { appt ->
                // Must be for the exact doctor
                val isTargetDoctor = appt.doctorId == doctorId
                // Must match the clinic if cid is known
                val isTargetClinic = cid.isNullOrBlank() || appt.clinicId == cid
                // Must be today's date
                val isToday = appt.appointmentDate == todayStr
                // Check checkin status and overall status
                val cStatus = appt.checkinStatus?.lowercase()?.trim() ?: ""
                val mainStatus = appt.status.lowercase().trim()

                // Exclude cancelled / rejected / expired appointments
                val isCancelledOrRejected = mainStatus in listOf("cancelled", "rejected", "expired") ||
                        cStatus in listOf("cancelled", "no_show", "completed", "done", "finished", "inside", "rejected")

                // Eligible waiting queue statuses only
                val isWaiting = cStatus in listOf("waiting", "checked_in", "booked", "pending")

                isTargetDoctor && isTargetClinic && isToday && !isCancelledOrRejected && isWaiting
            }

            if (waitingAppts.isEmpty()) return@withContext 0

            val title = if (isInClinic) {
                NotificationTemplate.DoctorArrived.buildTitle(doctorName)
            } else {
                NotificationTemplate.DoctorSteppedOut.buildTitle(doctorName)
            }

            val notifType = if (isInClinic) NotificationType.DOCTOR_ARRIVAL.key else NotificationType.DOCTOR_STATUS.key

            var sentCount = 0
            val seenApptIds = mutableSetOf<String>()

            for (appt in waitingAppts) {
                if (appt.id.isBlank() || !seenApptIds.add(appt.id)) continue

                val patientDisplayName = appt.patientName.ifBlank { "Patient" }
                val cleanBody = if (isInClinic) {
                    val clinicPart = if (clinicName.isNotBlank() && clinicName != "the clinic") " at $clinicName" else ""
                    "Hi $patientDisplayName, $doctorName has arrived$clinicPart! OPD consultations are starting now. Please check your live queue position and be near the clinic."
                } else {
                    val clinicPart = if (clinicName.isNotBlank() && clinicName != "the clinic") " from $clinicName" else ""
                    "Hi $patientDisplayName, $doctorName has temporarily stepped out$clinicPart. Consultations are briefly paused and will resume shortly."
                }

                val tagged = if (isInClinic) {
                    NotificationTemplate.DoctorArrived.buildMessage(
                        patientName = patientDisplayName,
                        doctorName = doctorName,
                        clinicName = clinicName,
                        code = appt.trackingCode10Digit
                    )
                } else {
                    NotificationTemplate.DoctorSteppedOut.buildMessage(
                        patientName = patientDisplayName,
                        doctorName = doctorName,
                        clinicName = clinicName,
                        code = appt.trackingCode10Digit
                    )
                }

                val dto = mutableMapOf<String, Any?>(
                    "id" to UUID.randomUUID().toString(),
                    "title" to title,
                    "message" to tagged,
                    "type" to notifType,
                    "target_audience" to "specific",
                    "is_read" to false
                )
                if (appt.id.length == 36) {
                    dto["appointment_id"] = appt.id
                }
                if (!appt.userId.isNullOrBlank() && appt.userId.length == 36) {
                    dto["user_id"] = appt.userId
                }

                try {
                    supabaseClient.postgrest["notifications"].insert(dto)
                    sentCount++
                } catch (eInsert: Exception) {
                    Log.w("DoctorRepository", "Failed inserting notification row for appt ${appt.id}", eInsert)
                    // Explicitly DO NOT fall back to 'all_users' or broadcast
                }

                // Send FCM push notification directly to the patient device registered with this appointment
                if (appt.id.length == 36) {
                    try {
                        supabaseClient.functions.invoke(
                            function = "send-fcm-alert",
                            body = buildJsonObject {
                                put("appointmentId", appt.id)
                                put("title", title.trim())
                                put("message", cleanBody.trim())
                                put("type", notifType)
                            }
                        )
                    } catch (eFcm: Exception) {
                        Log.w("DoctorRepository", "send-fcm-alert failed for appointment ${appt.id}", eFcm)
                    }
                }
            }
            sentCount
        } catch (e: Exception) {
            Log.e("DoctorRepository", "notifyWaitingPatientsDoctorPresence failed", e)
            0
        }
    }

    suspend fun toggleDoctorPresence(
        doctorId: String,
        isInClinic: Boolean,
        clinicId: String? = null
    ): Boolean = withContext(Dispatchers.IO) {
        val cid = clinicId?.takeIf { it.isNotBlank() }
        val ok = try {
            // Update native is_in_clinic and active_clinic_id columns directly in PostgreSQL
            supabaseClient.postgrest["doctors"]
                .update({
                    set("is_in_clinic", isInClinic)
                    if (isInClinic) {
                        if (cid != null) {
                            set("active_clinic_id", cid)
                            set("clinic_id", cid)
                        }
                    } else {
                        set<String?>("active_clinic_id", null)
                    }
                }) {
                    filter {
                        eq("id", doctorId)
                    }
                }
            
            // Immediately update in-memory caches to prevent race conditions during background sync
            cid?.let { currentCid ->
                cachedDoctorsByClinic[currentCid]?.let { cachedList ->
                    cachedDoctorsByClinic[currentCid] = cachedList.map { doc ->
                        if (doc.id == doctorId) doc.copy(isInClinic = isInClinic, activeClinicId = if (isInClinic) currentCid else null) else doc
                    }
                }
            }
            cachedAllDoctors = cachedAllDoctors.map { doc ->
                if (doc.id == doctorId) doc.copy(isInClinic = isInClinic, activeClinicId = if (isInClinic) cid else null) else doc
            }

            true
        } catch (e: Exception) {
            try {
                // Fallback without active_clinic_id in case column is missing or schema difference
                supabaseClient.postgrest["doctors"]
                    .update({
                        set("is_in_clinic", isInClinic)
                        if (isInClinic && cid != null) {
                            set("clinic_id", cid)
                        }
                    }) {
                        filter {
                            eq("id", doctorId)
                        }
                    }

                cid?.let { currentCid ->
                    cachedDoctorsByClinic[currentCid]?.let { cachedList ->
                        cachedDoctorsByClinic[currentCid] = cachedList.map { doc ->
                            if (doc.id == doctorId) doc.copy(isInClinic = isInClinic) else doc
                        }
                    }
                }
                cachedAllDoctors = cachedAllDoctors.map { doc ->
                    if (doc.id == doctorId) doc.copy(isInClinic = isInClinic) else doc
                }

                true
            } catch (e2: Exception) {
                e2.printStackTrace()
                false
            }
        }

        if (ok) {
            CoroutineScope(Dispatchers.IO).launch {
                try {
                    notifyWaitingPatientsDoctorPresence(doctorId, isInClinic, cid)
                } catch (_: Exception) {}
            }
        }

        ok
    }

    suspend fun submitDoctorKyc(
        doctorId: String,
        nmcLicense: String,
        licenseDocUrl: String?,
        certificatesDocUrl: String?
    ): Boolean = withContext(Dispatchers.IO) {
        try {
            supabaseClient.postgrest["doctors"]
                .update({
                    set("nmc_license_number", nmcLicense)
                    set("kyc_status", "pending")
                    if (licenseDocUrl != null) set("license_doc_url", licenseDocUrl)
                    if (certificatesDocUrl != null) set("certificates_doc_url", certificatesDocUrl)
                }) {
                    filter {
                        eq("id", doctorId)
                    }
                }
            true
        } catch (e: Exception) {
            e.printStackTrace()
            false
        }
    }

    suspend fun uploadKycFile(fileName: String, fileBytes: ByteArray): String? = withContext(Dispatchers.IO) {
        try {
            val compressed = com.dactor.clinic.domain.util.FileCompressor.compressBytes(fileBytes, fileName)
            val finalName = compressed.fileName
            val bucket = supabaseClient.storage["doctor-kyc"]
            bucket.upload(finalName, compressed.bytes, upsert = true)
            bucket.publicUrl(finalName)
        } catch (e: Exception) {
            e.printStackTrace()
            null
        }
    }

    suspend fun uploadProfilePicture(fileName: String, fileBytes: ByteArray): String? = withContext(Dispatchers.IO) {
        try {
            val compressed = com.dactor.clinic.domain.util.FileCompressor.compressBytes(fileBytes, fileName)
            val finalName = compressed.fileName
            val bucket = supabaseClient.storage["doctor_photos"]
            bucket.upload(finalName, compressed.bytes, upsert = true)
            bucket.publicUrl(finalName)
        } catch (e: Exception) {
            e.printStackTrace()
            null
        }
    }

    suspend fun getDoctorByEmail(email: String): Doctor? = withContext(Dispatchers.IO) {
        try {
            val targetEmail = email.trim().lowercase()
            val doc = supabaseClient.postgrest["doctors"]
                .select {
                    filter {
                        ilike("email", targetEmail)
                    }
                }.decodeSingleOrNull<Doctor>()
            doc?.let { enrichDoctor(it) }
        } catch (e: Exception) {
            e.printStackTrace()
            null
        }
    }

    suspend fun getAllDoctors(forceRefresh: Boolean = false): List<Doctor> = withContext(Dispatchers.IO) {
        if (!forceRefresh && cachedAllDoctors.isNotEmpty()) {
            return@withContext cachedAllDoctors
        }
        try {
            val list = supabaseClient.postgrest["doctors"]
                .select()
                .decodeList<Doctor>()
                .map { enrichDoctor(it) }
            cachedAllDoctors = list
            list
        } catch (e: Exception) {
            e.printStackTrace()
            cachedAllDoctors
        }
    }

    suspend fun updateDoctor(doctor: Doctor): Boolean = withContext(Dispatchers.IO) {
        val metaJson = packDoctorMetadata(doctor)
        val dto = DoctorUpdateDto(
            fullName = doctor.fullName.trim(),
            email = doctor.email.trim().lowercase(),
            specialty = doctor.specialty?.trim(),
            nmcLicenseNumber = doctor.nmcLicenseNumber?.trim(),
            licenseDocUrl = doctor.licenseDocUrl,
            certificatesDocUrl = doctor.certificatesDocUrl ?: metaJson,
            kycStatus = doctor.kycStatus ?: "pending",
            isInClinic = doctor.isInClinic,
            activeClinicId = doctor.activeClinicId,
            primaryClinicId = doctor.primaryClinicId,
            consultationFee = doctor.consultationFee ?: 500.0,
            gender = doctor.gender,
            age = doctor.age,
            startingPracticingYear = doctor.startingPracticingYear,
            profilePictureUrl = doctor.profilePictureUrl,
            education = doctor.education?.trim(),
            personalMobileNumber = doctor.personalMobileNumber?.trim(),
            publicMobileNumber = doctor.publicMobileNumber?.trim(),
            description = doctor.description?.trim()
        )
        try {
            supabaseClient.postgrest["doctors"]
                .update(dto) {
                    filter {
                        eq("id", doctor.id)
                    }
                }
            true
        } catch (e: Exception) {
            e.printStackTrace()
            try {
                val baseDto = DoctorBaseDto(
                    id = doctor.id,
                    fullName = doctor.fullName.trim(),
                    email = doctor.email.trim().lowercase(),
                    specialty = doctor.specialty ?: "",
                    nmcLicenseNumber = doctor.nmcLicenseNumber ?: "",
                    licenseDocUrl = doctor.licenseDocUrl ?: "",
                    certificatesDocUrl = metaJson,
                    kycStatus = doctor.kycStatus ?: "pending",
                    isInClinic = doctor.isInClinic,
                    consultationFee = doctor.consultationFee ?: 500.0
                )
                supabaseClient.postgrest["doctors"].update(baseDto) {
                    filter { eq("id", doctor.id) }
                }
                true
            } catch (e2: Exception) {
                e2.printStackTrace()
                false
            }
        }
    }

    suspend fun updateDoctorConsultationFee(
        doctorId: String,
        consultationFee: Double,
        clinicId: String? = null
    ): Boolean = withContext(Dispatchers.IO) {
        try {
            val current = getDoctorById(doctorId)
            val ok = if (current != null) {
                updateDoctor(current.copy(consultationFee = consultationFee))
            } else {
                supabaseClient.postgrest["doctors"]
                    .update({
                        set("consultation_fee", consultationFee)
                    }) {
                        filter { eq("id", doctorId) }
                    }
                true
            }
            if (ok && !clinicId.isNullOrBlank()) {
                val cachedList = cachedDoctorsByClinic[clinicId]
                if (cachedList != null) {
                    cachedDoctorsByClinic[clinicId] = cachedList.map {
                        if (it.id == doctorId) it.copy(consultationFee = consultationFee) else it
                    }
                }
            }
            cachedAllDoctors = cachedAllDoctors.map {
                if (it.id == doctorId) it.copy(consultationFee = consultationFee) else it
            }
            ok
        } catch (e: Exception) {
            e.printStackTrace()
            false
        }
    }

    suspend fun updateDoctorProfile(id: String, specialty: String, consultationFee: Double): Boolean = withContext(Dispatchers.IO) {
        try {
            supabaseClient.postgrest["doctors"]
                .update({
                    set("specialty", specialty.trim())
                    set("consultation_fee", consultationFee)
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

    suspend fun updateDoctorFullProfile(
        id: String,
        fullName: String,
        gender: String?,
        age: Int?,
        startingYear: Int?,
        pictureUrl: String?,
        specialty: String,
        education: String?,
        nmcLicenseNumber: String?,
        personalMobile: String?,
        publicMobile: String?,
        description: String?,
        consultationFee: Double,
        practitionerRole: String? = null
    ): Boolean = withContext(Dispatchers.IO) {
        try {
            val current = getDoctorById(id)
            if (current != null) {
                val updated = current.copy(
                    fullName = fullName.trim(),
                    gender = gender,
                    age = age,
                    startingPracticingYear = startingYear,
                    profilePictureUrl = pictureUrl,
                    specialty = specialty.trim(),
                    education = education,
                    nmcLicenseNumber = nmcLicenseNumber,
                    personalMobileNumber = personalMobile,
                    publicMobileNumber = publicMobile,
                    description = description,
                    specialties = listOf(specialty.trim()),
                    consultationFee = consultationFee,
                    practitionerRole = practitionerRole ?: current.practitionerRole
                )
                updateDoctor(updated)
            } else {
                false
            }
        } catch (e: Exception) {
            e.printStackTrace()
            false
        }
    }

    suspend fun linkClinicToDoctor(doctorId: String, clinicId: String): Boolean = withContext(Dispatchers.IO) {
        try {
            supabaseClient.postgrest["doctors"]
                .update({
                    set("clinic_id", clinicId)
                    set("primary_clinic_id", clinicId)
                }) {
                    filter {
                        eq("id", doctorId)
                    }
                }
            true
        } catch (e: Exception) {
            try {
                supabaseClient.postgrest["doctors"]
                    .update({
                        set("clinic_id", clinicId)
                    }) {
                        filter {
                            eq("id", doctorId)
                        }
                    }
                true
            } catch (e2: Exception) {
                e2.printStackTrace()
                false
            }
        }
    }

    suspend fun getAffiliatedClinicsForDoctor(doctorId: String, doctorEmail: String): List<Clinic> = withContext(Dispatchers.IO) {
        try {
            val clinicIds = mutableSetOf<String>()

            val doc = getDoctorById(doctorId)
            if (!doc?.clinicId.isNullOrBlank()) {
                clinicIds.add(doc!!.clinicId!!)
            }
            if (!doc?.primaryClinicId.isNullOrBlank()) {
                clinicIds.add(doc!!.primaryClinicId!!)
            }
            if (!doc?.activeClinicId.isNullOrBlank()) {
                clinicIds.add(doc!!.activeClinicId!!)
            }

            if (doctorEmail.isNotBlank()) {
                val acceptedInvites = supabaseClient.postgrest["clinic_invitations"]
                    .select {
                        filter {
                            eq("email", doctorEmail.trim().lowercase())
                            eq("status", "accepted")
                        }
                    }.decodeList<ClinicInvitation>()
                for (inv in acceptedInvites) {
                    if (inv.clinicId.isNotBlank()) {
                        clinicIds.add(inv.clinicId)
                    }
                }
            }

            if (clinicIds.isEmpty()) return@withContext emptyList()

            val allClinics = supabaseClient.postgrest["clinics"]
                .select()
                .decodeList<Clinic>()
            allClinics.filter { it.id in clinicIds }
        } catch (e: Exception) {
            e.printStackTrace()
            emptyList()
        }
    }

    suspend fun switchActiveClinic(doctorId: String, clinicId: String, setInClinic: Boolean): Boolean = withContext(Dispatchers.IO) {
        val ok = try {
            // First attempt updating clinic_id, is_in_clinic, and active_clinic_id
            try {
                supabaseClient.postgrest["doctors"]
                    .update({
                        set("clinic_id", clinicId)
                        set("is_in_clinic", setInClinic)
                        set("active_clinic_id", clinicId)
                    }) {
                        filter { eq("id", doctorId) }
                    }
                true
            } catch (eActive: Exception) {
                // Column active_clinic_id may not exist, fallback to clinic_id + is_in_clinic
                supabaseClient.postgrest["doctors"]
                    .update({
                        set("clinic_id", clinicId)
                        set("is_in_clinic", setInClinic)
                    }) {
                        filter { eq("id", doctorId) }
                    }
                true
            }
        } catch (e: Exception) {
            e.printStackTrace()
            false
        }

        if (ok) {
            CoroutineScope(Dispatchers.IO).launch {
                try {
                    notifyWaitingPatientsDoctorPresence(doctorId, setInClinic, clinicId)
                } catch (_: Exception) {}
            }
        }

        ok
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
                .filter { it.level != "LOCATION_OPTION" }
        } catch (e: Exception) {
            e.printStackTrace()
            emptyList()
        }
    }
}
