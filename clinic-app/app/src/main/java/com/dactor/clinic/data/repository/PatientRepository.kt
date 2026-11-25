package com.dactor.clinic.data.repository

import com.dactor.clinic.data.local.dao.AppointmentDao
import com.dactor.clinic.data.local.dao.PatientDao
import com.dactor.clinic.data.local.entity.AppointmentEntity
import com.dactor.clinic.data.local.entity.PatientEntity
import com.dactor.clinic.data.model.Appointment
import com.dactor.clinic.data.model.Profile
import com.dactor.clinic.domain.util.PatientIdentitySync
import io.github.jan.supabase.SupabaseClient
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import javax.inject.Inject
import javax.inject.Singleton

data class PatientChangeableData(
    val appointments: List<Appointment>,
    val remarks: Map<String, String>
)

@Singleton
class PatientRepository @Inject constructor(
    private val patientDao: PatientDao,
    private val appointmentDao: AppointmentDao,
    private val appointmentRepository: AppointmentRepository,
    private val billingRepository: BillingRepository,
    private val supabaseClient: SupabaseClient
) {

    suspend fun getLocalPatients(clinicId: String): List<PatientEntity> = withContext(Dispatchers.IO) {
        if (clinicId.isBlank()) return@withContext emptyList()
        try {
            patientDao.getPatientsForClinicList(clinicId)
        } catch (_: Exception) {
            emptyList()
        }
    }

    suspend fun searchLocalPatients(clinicId: String, query: String): List<PatientEntity> = withContext(Dispatchers.IO) {
        if (clinicId.isBlank()) return@withContext emptyList()
        val q = query.trim()
        if (q.isBlank()) return@withContext getLocalPatients(clinicId)
        try {
            patientDao.searchPatients(clinicId, q)
        } catch (_: Exception) {
            emptyList()
        }
    }

    suspend fun upsertPatient(patient: PatientEntity) = withContext(Dispatchers.IO) {
        try {
            patientDao.upsert(patient)
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    /**
     * Incrementally updates/upserts patients from a list of appointments (e.g. today's appointments)
     * without requiring a full clinic database scan.
     */
    suspend fun upsertFromAppointments(clinicId: String, appointments: List<Appointment>) = withContext(Dispatchers.IO) {
        if (clinicId.isBlank() || appointments.isEmpty()) return@withContext
        val effectiveClinicId = clinicId.trim()

        try {
            val validAppts = appointments.filter { it.patientName.isNotBlank() }
            val groupedByPatient = validAppts.groupBy { appt ->
                PatientIdentitySync.getDeterministicPatientId(
                    name = appt.patientName,
                    phone = appt.patientMobile,
                    fallbackId = appt.trackingCode10Digit.ifBlank { appt.id }
                )
            }

            val entities = groupedByPatient.map { (pId, appts) ->
                val existing = patientDao.getPatientById(pId)
                val sortedAppts = appts.sortedByDescending { it.appointmentDate }
                val latestAppt = sortedAppts.first()

                val completedAppts = appts.filter { it.checkinStatus?.lowercase() in listOf("completed", "done", "visited") }
                val latestCompletedDate = when {
                    completedAppts.isNotEmpty() && existing?.lastVisitDate != null -> {
                        val maxNew = completedAppts.maxOf { it.appointmentDate }
                        if (maxNew > existing.lastVisitDate) maxNew else existing.lastVisitDate
                    }
                    completedAppts.isNotEmpty() -> completedAppts.maxOf { it.appointmentDate }
                    else -> existing?.lastVisitDate
                }

                val totalVisitsCount = when {
                    completedAppts.isNotEmpty() && existing != null -> {
                        val newDates = completedAppts.map { it.appointmentDate }.distinct().filter { it != existing.lastVisitDate }
                        maxOf(existing.totalVisits + newDates.size, completedAppts.size)
                    }
                    completedAppts.isNotEmpty() -> completedAppts.map { it.appointmentDate }.distinct().size
                    existing != null -> existing.totalVisits
                    else -> 0
                }

                val bestTrackingCode = appts.firstOrNull { it.trackingCode10Digit.isNotBlank() }?.trackingCode10Digit
                    ?: existing?.trackingCode10Digit
                    ?: PatientIdentitySync.getDeterministicAppointmentId(pId)

                PatientEntity(
                    id = pId,
                    clinicId = effectiveClinicId,
                    fullName = latestAppt.patientName.trim(),
                    phone = latestAppt.patientMobile.ifBlank { existing?.phone },
                    gender = latestAppt.patientGender ?: existing?.gender ?: "Male",
                    age = latestAppt.patientAge ?: existing?.age,
                    email = latestAppt.patientEmail ?: existing?.email,
                    trackingCode10Digit = bestTrackingCode,
                    lastVisitDate = latestCompletedDate,
                    lastDoctorId = latestAppt.doctorId ?: existing?.lastDoctorId,
                    lastDoctorName = existing?.lastDoctorName,
                    totalVisits = totalVisitsCount,
                    latestBillStatus = latestAppt.paymentStatus ?: existing?.latestBillStatus,
                    latestClinicalRemarks = existing?.latestClinicalRemarks,
                    syncStatus = "synced",
                    updatedAt = System.currentTimeMillis()
                )
            }

            if (entities.isNotEmpty()) {
                patientDao.upsertAll(entities)
            }
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    /**
     * Safely migrates legacy desk registration profiles stored in SharedPreferences to local Room table.
     */
    suspend fun migrateLegacyProfiles(clinicId: String, profiles: List<Profile>) = withContext(Dispatchers.IO) {
        if (clinicId.isBlank() || profiles.isEmpty()) return@withContext
        try {
            val entities = profiles.mapNotNull { prof ->
                if (prof.fullName.isNullOrBlank()) return@mapNotNull null
                val pId = prof.id.ifBlank {
                    PatientIdentitySync.getDeterministicPatientId(prof.fullName, prof.phone)
                }
                val existing = patientDao.getPatientById(pId)
                if (existing == null) {
                    PatientEntity(
                        id = pId,
                        clinicId = clinicId,
                        fullName = prof.fullName!!.trim(),
                        phone = prof.phone?.trim(),
                        gender = prof.gender ?: "Male",
                        age = prof.age,
                        email = prof.email.ifBlank { null },
                        trackingCode10Digit = PatientIdentitySync.getDeterministicAppointmentId(pId),
                        lastVisitDate = null,
                        lastDoctorId = null,
                        lastDoctorName = null,
                        totalVisits = 1,
                        latestBillStatus = null,
                        latestClinicalRemarks = null,
                        syncStatus = "synced",
                        updatedAt = System.currentTimeMillis()
                    )
                } else null
            }
            if (entities.isNotEmpty()) {
                patientDao.upsertAll(entities)
            }
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    /**
     * On-Demand / Lazy Sync: Retrieves changeable info (new appointments, latest billing status,
     * and clinical remarks) for a specific patient when inspected/checked.
     */
    suspend fun fetchPatientChangeableData(
        trackingCode: String,
        patientId: String? = null,
        patientPhone: String? = null,
        patientName: String? = null,
        clinicId: String = ""
    ): PatientChangeableData = withContext(Dispatchers.IO) {
        val cleanTracking = trackingCode.trim()
        val allAppts = mutableListOf<Appointment>()

        try {
            if (cleanTracking.isNotBlank()) {
                val byCode = appointmentRepository.getAllAppointmentsByTrackingCode(cleanTracking)
                allAppts.addAll(byCode)
            }

            // Also search by patient phone if available to retrieve full consultation history
            val cleanPhone = patientPhone?.filter { it.isDigit() }?.takeLast(10)?.takeIf { it.length >= 7 }
            if (cleanPhone != null && clinicId.isNotBlank()) {
                val byPhone = try {
                    appointmentRepository.getAppointmentsByClinic(clinicId)
                        .filter { it.patientMobile.filter { c -> c.isDigit() }.takeLast(10) == cleanPhone }
                } catch (_: Exception) { emptyList() }
                byPhone.forEach { a ->
                    if (allAppts.none { it.id == a.id }) allAppts.add(a)
                }
            }

            if (allAppts.isEmpty() && !patientId.isNullOrBlank()) {
                val byId = appointmentRepository.getAppointmentById(patientId)
                if (byId != null) allAppts.add(byId)
            }

            val validAppts = allAppts.filter {
                it.status.equals("APPROVED", ignoreCase = true) &&
                it.status != "WAITING_FOR_APPROVAL" &&
                it.status != "pending_payment" &&
                it.status != "UNAPPROVED" &&
                it.status != "EXPIRED" &&
                it.checkinStatus != "cancelled"
            }

            // Upsert into local Room database for offline cache
            try {
                if (validAppts.isNotEmpty()) {
                    appointmentDao.upsertAll(validAppts.map { AppointmentEntity.fromDomainModel(it, syncStatus = "synced") })
                }
            } catch (_: Exception) {}

            // Fetch remarks for these appointments on-demand
            val remarks = if (validAppts.isNotEmpty()) {
                val apptIds = validAppts.map { it.id }
                billingRepository.getRemarksForAppointments(apptIds)
            } else emptyMap()

            // Update patient local record with latest information
            if (validAppts.isNotEmpty()) {
                val sorted = validAppts.sortedByDescending { it.appointmentDate }
                val latestAppt = sorted.first()
                val targetId = patientId ?: PatientIdentitySync.getDeterministicPatientId(
                    name = latestAppt.patientName,
                    phone = latestAppt.patientMobile,
                    fallbackId = cleanTracking.ifBlank { latestAppt.id }
                )

                val existing = targetId?.let { patientDao.getPatientById(it) }
                val completedAppts = validAppts.filter { it.checkinStatus?.lowercase() in listOf("completed", "done", "visited") }
                val latestCompletedDate = completedAppts.sortedByDescending { it.appointmentDate }.firstOrNull()?.appointmentDate ?: existing?.lastVisitDate
                val latestRemark = remarks[latestAppt.id] ?: existing?.latestClinicalRemarks

                val updatedPatient = PatientEntity(
                    id = targetId ?: latestAppt.id,
                    clinicId = clinicId.ifBlank { latestAppt.clinicId },
                    fullName = latestAppt.patientName.trim(),
                    phone = latestAppt.patientMobile.ifBlank { existing?.phone },
                    gender = latestAppt.patientGender ?: existing?.gender ?: "Male",
                    age = latestAppt.patientAge ?: existing?.age,
                    email = latestAppt.patientEmail ?: existing?.email,
                    trackingCode10Digit = cleanTracking.ifBlank { latestAppt.trackingCode10Digit },
                    lastVisitDate = latestCompletedDate,
                    lastDoctorId = latestAppt.doctorId ?: existing?.lastDoctorId,
                    lastDoctorName = existing?.lastDoctorName,
                    totalVisits = maxOf(completedAppts.size, existing?.totalVisits ?: 1),
                    latestBillStatus = latestAppt.paymentStatus ?: existing?.latestBillStatus,
                    latestClinicalRemarks = latestRemark,
                    syncStatus = "synced",
                    updatedAt = System.currentTimeMillis()
                )
                patientDao.upsert(updatedPatient)
            }

            PatientChangeableData(
                appointments = validAppts,
                remarks = remarks
            )
        } catch (e: Exception) {
            e.printStackTrace()
            PatientChangeableData(emptyList(), emptyMap())
        }
    }
}
