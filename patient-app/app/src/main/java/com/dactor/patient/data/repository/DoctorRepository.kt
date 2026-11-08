package com.dactor.patient.data.repository

import com.dactor.patient.data.model.Clinic
import com.dactor.patient.data.model.ClinicInvitation
import com.dactor.patient.data.model.Doctor
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.postgrest.postgrest
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import java.util.concurrent.ConcurrentHashMap
import javax.inject.Inject
import javax.inject.Singleton

@Serializable
private data class DoctorExtendedMeta(
    val gender: String? = null,
    val age: Int? = null,
    val starting_practicing_year: Int? = null,
    val profile_picture_url: String? = null,
    val education: String? = null,
    val personal_mobile_number: String? = null,
    val public_mobile_number: String? = null,
    val description: String? = null
)

@Singleton
class DoctorRepository @Inject constructor(
    private val supabaseClient: SupabaseClient
) {
    private val json = Json { ignoreUnknownKeys = true; isLenient = true; coerceInputValues = true }

    @Volatile
    private var cachedAllDoctors: List<Doctor>? = null
    private val cachedDoctorsById = ConcurrentHashMap<String, Doctor>()
    private val cachedDoctorsByClinic = ConcurrentHashMap<String, List<Doctor>>()
    @Volatile
    private var cachedAcceptedInvitations: List<ClinicInvitation>? = null

    fun getCachedAllDoctors(): List<Doctor>? = cachedAllDoctors

    fun getCachedDoctorsForClinic(clinicId: String): List<Doctor>? = cachedDoctorsByClinic[clinicId]

    fun getCachedDoctorsByClinicMap(): Map<String, List<Doctor>> = cachedDoctorsByClinic

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
                    description = doctor.description ?: meta.description
                )
            } catch (ignored: Exception) {}
        }
        return doctor
    }

    /**
     * Fetches ALL doctors and ALL accepted clinic_invitations in 1 single parallel round-trip
     * (2 concurrent queries total instead of 3*N queries per clinic), and builds the per-clinic
     * roster map in O(N + M) in memory.
     */
    suspend fun getAllDoctorsAndClinicRoster(
        clinicIds: List<String>,
        forceRefresh: Boolean = false
    ): Pair<List<Doctor>, Map<String, List<Doctor>>> = coroutineScope {
        if (!forceRefresh && cachedAllDoctors != null && clinicIds.all { cachedDoctorsByClinic.containsKey(it) }) {
            return@coroutineScope Pair(cachedAllDoctors!!, cachedDoctorsByClinic.toMap())
        }

        val docsDeferred = async {
            try {
                supabaseClient.postgrest["doctors"]
                    .select()
                    .decodeList<Doctor>()
                    .map { enrichDoctor(it) }
            } catch (e: Exception) {
                cachedAllDoctors ?: emptyList()
            }
        }

        val invitesDeferred = async {
            try {
                supabaseClient.postgrest["clinic_invitations"]
                    .select {
                        filter {
                            eq("status", "accepted")
                        }
                    }.decodeList<ClinicInvitation>()
            } catch (e: Exception) {
                cachedAcceptedInvitations ?: emptyList()
            }
        }

        val allDocs = docsDeferred.await()
        val allAcceptedInvites = invitesDeferred.await()

        cachedAllDoctors = allDocs
        cachedAcceptedInvitations = allAcceptedInvites
        allDocs.forEach { cachedDoctorsById[it.id] = it }

        val docsByEmail = allDocs
            .filter { !it.email.isNullOrBlank() }
            .groupBy { it.email!!.trim().lowercase() }

        val invitesByClinic = allAcceptedInvites.groupBy { it.clinicId }

        val resultMap = mutableMapOf<String, List<Doctor>>()
        val targetClinicIds = (clinicIds + allDocs.mapNotNull { it.clinicId } + allDocs.mapNotNull { it.primaryClinicId } + invitesByClinic.keys).distinct()

        for (cid in targetClinicIds) {
            if (cid.isBlank()) continue
            val directDocs = allDocs.filter { it.clinicId == cid || it.primaryClinicId == cid }
            val invitedDocs = invitesByClinic[cid]
                ?.flatMap { inv -> docsByEmail[inv.email.trim().lowercase()] ?: emptyList() }
                ?: emptyList()

            val roster = (directDocs + invitedDocs).distinctBy { it.id }.map { doc ->
                val effectiveActive = doc.activeClinicId ?: doc.clinicId
                val isPresentHere = (doc.isInClinic == true) && (effectiveActive == null || effectiveActive == cid)
                doc.copy(isInClinic = isPresentHere)
            }
            cachedDoctorsByClinic[cid] = roster
            resultMap[cid] = roster
        }

        Pair(allDocs, resultMap)
    }

    suspend fun getDoctors(clinicId: String?): List<Doctor> {
        return if (!clinicId.isNullOrBlank()) {
            cachedDoctorsByClinic[clinicId]?.let { return it }
            try {
                val (_, rosterMap) = getAllDoctorsAndClinicRoster(listOf(clinicId), forceRefresh = cachedAllDoctors == null)
                rosterMap[clinicId] ?: emptyList()
            } catch (e: Exception) {
                e.printStackTrace()
                cachedDoctorsByClinic[clinicId] ?: emptyList()
            }
        } else {
            cachedAllDoctors?.let { return it }
            try {
                val list = supabaseClient.postgrest["doctors"].select().decodeList<Doctor>().map { enrichDoctor(it) }
                cachedAllDoctors = list
                list.forEach { cachedDoctorsById[it.id] = it }
                list
            } catch (e: Exception) {
                cachedAllDoctors ?: emptyList()
            }
        }
    }

    suspend fun searchDoctors(query: String): List<Doctor> {
        val current = cachedAllDoctors
        if (current != null && query.isNotBlank()) {
            val q = query.trim().lowercase()
            return current.filter {
                it.fullName.lowercase().contains(q) || (it.specialty ?: "").lowercase().contains(q)
            }
        }
        return supabaseClient.postgrest["doctors"]
            .select { filter { ilike("full_name", "%$query%") } }
            .decodeList<Doctor>()
            .map { enrichDoctor(it) }
    }

    suspend fun getDoctorById(id: String, forceRefresh: Boolean = false): Doctor? {
        if (id.isBlank()) return null
        if (!forceRefresh) {
            cachedDoctorsById[id]?.let { return it }
        }
        return try {
            val doc = supabaseClient.postgrest["doctors"]
                .select { filter { eq("id", id) } }
                .decodeSingleOrNull<Doctor>()
            val enriched = doc?.let { enrichDoctor(it) }
            if (enriched != null) {
                cachedDoctorsById[id] = enriched
            }
            enriched
        } catch (e: Exception) {
            e.printStackTrace()
            cachedDoctorsById[id]
        }
    }

    suspend fun getClinicsForDoctor(doctor: Doctor): List<Clinic> {
        val clinicIds = mutableSetOf<String>()
        if (!doctor.clinicId.isNullOrBlank()) {
            clinicIds.add(doctor.clinicId)
        }
        if (!doctor.primaryClinicId.isNullOrBlank()) {
            clinicIds.add(doctor.primaryClinicId)
        }
        if (!doctor.email.isNullOrBlank()) {
            val emailLower = doctor.email.trim().lowercase()
            val cachedInvs = cachedAcceptedInvitations
            if (cachedInvs != null) {
                clinicIds.addAll(cachedInvs.filter { it.email.trim().lowercase() == emailLower }.map { it.clinicId })
            } else {
                try {
                    val invitations = supabaseClient.postgrest["clinic_invitations"]
                        .select {
                            filter {
                                eq("email", emailLower)
                                eq("status", "accepted")
                            }
                        }.decodeList<ClinicInvitation>()
                    clinicIds.addAll(invitations.map { it.clinicId })
                } catch (e: Exception) {
                    e.printStackTrace()
                }
            }
        }

        if (clinicIds.isEmpty()) return emptyList()

        return try {
            val allClinics = supabaseClient.postgrest["clinics"]
                .select()
                .decodeList<Clinic>()
            allClinics.filter { it.id in clinicIds && it.isArchived != true && it.isActivated != false }
        } catch (e: Exception) {
            e.printStackTrace()
            emptyList()
        }
    }
}
