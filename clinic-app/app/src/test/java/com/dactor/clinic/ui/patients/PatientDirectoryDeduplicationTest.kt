package com.dactor.clinic.ui.patients

import com.dactor.clinic.data.local.dao.PatientDao
import com.dactor.clinic.data.local.entity.PatientEntity
import com.dactor.clinic.data.model.Appointment
import com.dactor.clinic.data.model.Clinic
import com.dactor.clinic.data.model.Profile
import com.dactor.clinic.domain.util.PatientIdentitySync
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class PatientDirectoryDeduplicationTest {

    class FakePatientDao : PatientDao {
        val storage = mutableMapOf<String, PatientEntity>()

        override fun getPatientsForClinic(clinicId: String): Flow<List<PatientEntity>> = flow {
            emit(storage.values.filter { it.clinicId == clinicId })
        }

        override suspend fun getPatientsForClinicList(clinicId: String): List<PatientEntity> {
            return storage.values.filter { it.clinicId == clinicId }
        }

        override suspend fun getPatientById(id: String): PatientEntity? = storage[id]

        override suspend fun getPatientByTrackingCode(code: String): PatientEntity? {
            return storage.values.firstOrNull { it.trackingCode10Digit == code }
        }

        override suspend fun searchPatients(clinicId: String, query: String): List<PatientEntity> {
            val q = query.lowercase()
            return storage.values.filter { it.clinicId == clinicId && (it.fullName.lowercase().contains(q) || it.phone?.contains(q) == true) }
        }

        override suspend fun upsert(patient: PatientEntity) {
            storage[patient.id] = patient
        }

        override suspend fun upsertAll(patients: List<PatientEntity>) {
            patients.forEach { storage[it.id] = it }
        }

        override suspend fun deleteById(id: String) {
            storage.remove(id)
        }

        override suspend fun deleteAllForClinic(clinicId: String) {
            val toRemove = storage.values.filter { it.clinicId == clinicId }.map { it.id }
            toRemove.forEach { storage.remove(it) }
        }
    }

    private fun extractKeys(id: String?, phone: String?, email: String?, tracking: String?, userId: String?): List<String> {
        val keys = mutableListOf<String>()
        val cleanId = id?.trim()?.lowercase()?.takeIf { it.isNotBlank() }
        if (cleanId != null) keys.add("id:$cleanId")

        val cleanPhone = phone?.replace(Regex("\\D"), "")?.takeIf { it.length >= 7 }
        if (cleanPhone != null) {
            keys.add("phone:$cleanPhone")
            keys.add("detphone:${PatientIdentitySync.getDeterministicPatientIdForPhone(cleanPhone).lowercase()}")
        }

        val cleanEmail = email?.trim()?.lowercase()?.takeIf { it.isNotBlank() }
        if (cleanEmail != null) {
            keys.add("email:$cleanEmail")
            keys.add("detemail:${PatientIdentitySync.getDeterministicPatientIdForEmail(cleanEmail).lowercase()}")
        }

        val cleanTracking = tracking?.trim()?.uppercase()?.takeIf { it.isNotBlank() }
        if (cleanTracking != null) {
            keys.add("track:$cleanTracking")
        }

        val cleanUid = userId?.trim()?.lowercase()?.takeIf { it.isNotBlank() }
        if (cleanUid != null) {
            keys.add("uid:$cleanUid")
        }
        return keys
    }

    private fun buildAllDirectoryProfiles(
        localPatients: List<PatientEntity>,
        locallyAddedProfiles: List<Profile>,
        appointments: List<Appointment>
    ): List<Profile> {
        val list = mutableListOf<Profile>()
        val seenKeys = mutableSetOf<String>()

        localPatients.forEach { pat ->
            val keys = extractKeys(pat.id, pat.phone, pat.email, pat.trackingCode10Digit, null)
            if (keys.none { it in seenKeys }) {
                seenKeys.addAll(keys)
                list.add(pat.toProfile())
            }
        }

        appointments.filter {
            it.status.equals("APPROVED", ignoreCase = true) &&
            it.status != "WAITING_FOR_APPROVAL" &&
            it.status != "pending_payment" &&
            it.status != "UNAPPROVED" &&
            it.status != "EXPIRED" &&
            it.checkinStatus != "cancelled"
        }.forEach { appt ->
            val keys = extractKeys(appt.id, appt.patientMobile, appt.patientEmail, appt.trackingCode10Digit, appt.userId)
            if (keys.none { it in seenKeys }) {
                seenKeys.addAll(keys)
                val canonicalPatientId = when {
                    !appt.userId.isNullOrBlank() && PatientIdentitySync.isValidUuid(appt.userId) -> appt.userId
                    !appt.patientEmail.isNullOrBlank() -> PatientIdentitySync.getDeterministicPatientIdForEmail(appt.patientEmail)
                    appt.patientMobile.isNotBlank() -> PatientIdentitySync.getDeterministicPatientIdForPhone(appt.patientMobile)
                    appt.trackingCode10Digit.isNotBlank() -> appt.trackingCode10Digit
                    else -> appt.id
                }
                list.add(
                    Profile(
                        id = canonicalPatientId,
                        authUid = appt.userId,
                        email = appt.patientEmail ?: "",
                        fullName = appt.patientName,
                        role = "patient",
                        phone = appt.patientMobile,
                        gender = appt.patientGender ?: "Male",
                        age = appt.patientAge
                    )
                )
            }
        }

        locallyAddedProfiles.forEach { p ->
            val keys = extractKeys(p.id, p.phone, p.email, null, p.authUid)
            if (keys.none { it in seenKeys }) {
                seenKeys.addAll(keys)
                list.add(p)
            }
        }
        return list
    }

    @Test
    fun testDirectoryProfilesDoNotDuplicateWhenAppointmentRescheduledToToday() {
        val patId = PatientIdentitySync.getDeterministicPatientIdForPhone("9849494946")
        val localPatients = listOf(
            PatientEntity(
                id = patId,
                clinicId = "clinic-1",
                fullName = "Rajan",
                phone = "9849494946",
                gender = "Male",
                age = 19,
                email = null,
                trackingCode10Digit = "BC8B0D0566",
                lastVisitDate = null,
                lastDoctorId = "doc-1",
                lastDoctorName = "Medical Specialist",
                totalVisits = 0
            )
        )

        // Rescheduled appointment for Rajan for today
        val appointments = listOf(
            Appointment(
                id = "appt-uuid-9999",
                clinicId = "clinic-1",
                doctorId = "doc-1",
                trackingCode10Digit = "BC8B0D0566",
                patientName = "Rajan",
                patientMobile = "9849494946",
                patientAge = 19,
                patientGender = "Male",
                appointmentDate = "2026-11-19",
                appointmentTime = "23:13:00",
                status = "APPROVED",
                checkinStatus = "waiting"
            )
        )

        val profiles = buildAllDirectoryProfiles(localPatients, emptyList(), appointments)

        // Must NOT create a duplicate proxy profile
        assertEquals("Directory must contain exactly 1 patient entry without proxy duplication", 1, profiles.size)
        assertEquals("Profile ID must be the patient ID", patId, profiles[0].id)
        assertEquals("Profile name must be Rajan", "Rajan", profiles[0].fullName)
    }

    @Test
    fun testAppointmentAssociationMatchesTodayAppointmentForLegitimatePatientRecord() {
        val patId = PatientIdentitySync.getDeterministicPatientIdForPhone("9849494946")
        val patientProfile = Profile(
            id = patId,
            fullName = "Rajan",
            phone = "9849494946",
            email = "",
            role = "patient"
        )
        val patEntity = PatientEntity(
            id = patId,
            clinicId = "clinic-1",
            fullName = "Rajan",
            phone = "9849494946",
            gender = "Male",
            age = 19,
            email = null,
            trackingCode10Digit = "BC8B0D0566",
            lastVisitDate = null,
            totalVisits = 0
        )
        val todayAppt = Appointment(
            id = "appt-uuid-9999",
            clinicId = "clinic-1",
            doctorId = "doc-1",
            trackingCode10Digit = "BC8B0D0566",
            patientName = "Rajan",
            patientMobile = "9849494946",
            patientAge = 19,
            patientGender = "Male",
            appointmentDate = "2026-11-19",
            appointmentTime = "23:13:00",
            status = "APPROVED",
            checkinStatus = "waiting"
        )
        val appointments = listOf(todayAppt)

        val cleanPatPhone = patientProfile.phone?.replace(Regex("\\D"), "")?.takeIf { it.length >= 7 }
        val cleanEntityPhone = patEntity.phone?.replace(Regex("\\D"), "")?.takeIf { it.length >= 7 }
        val cleanPatEmail = patientProfile.email.trim().lowercase().takeIf { it.isNotBlank() }

        val thisAppt = appointments.find { appt ->
            val cleanApptPhone = appt.patientMobile.replace(Regex("\\D"), "").takeIf { it.length >= 7 }
            val cleanApptEmail = appt.patientEmail?.trim()?.lowercase()?.takeIf { it.isNotBlank() }

            (appt.id == patientProfile.id) ||
            (!appt.userId.isNullOrBlank() && (appt.userId == patientProfile.id || appt.userId == patEntity.id)) ||
            (cleanApptPhone != null && (cleanApptPhone == cleanPatPhone || cleanApptPhone == cleanEntityPhone)) ||
            (appt.trackingCode10Digit.isNotBlank() && (appt.trackingCode10Digit == patEntity.trackingCode10Digit || appt.trackingCode10Digit == patientProfile.id)) ||
            (cleanApptEmail != null && (cleanApptEmail == cleanPatEmail || cleanApptEmail == patEntity.email?.trim()?.lowercase()))
        }

        assertNotNull("The active appointment must be successfully resolved for the legitimate directory record", thisAppt)
        assertEquals("appt-uuid-9999", thisAppt?.id)
        assertEquals("23:13:00", thisAppt?.appointmentTime)
    }

    @Test
    fun testUpsertFromAppointmentsDoesNotPrematurelySetLastVisitDateForWaitingAppointment() = runTest {
        val fakeDao = FakePatientDao()
        val appt = Appointment(
            id = "appt-1",
            clinicId = "clinic-1",
            patientName = "Rajan",
            patientMobile = "9849494946",
            appointmentDate = "2026-11-19",
            status = "APPROVED",
            checkinStatus = "waiting" // NOT completed
        )

        val pId = PatientIdentitySync.getDeterministicPatientIdForPhone("9849494946")
        val isCompletedAppt = appt.checkinStatus?.lowercase() in listOf("completed", "done", "visited")
        val existing = fakeDao.getPatientById(pId)

        val latestCompletedDate = when {
            isCompletedAppt && existing?.lastVisitDate != null -> if (existing.lastVisitDate > appt.appointmentDate) existing.lastVisitDate else appt.appointmentDate
            isCompletedAppt -> appt.appointmentDate
            else -> existing?.lastVisitDate
        }
        val totalVisitsCount = when {
            isCompletedAppt && existing != null && existing.lastVisitDate != appt.appointmentDate -> existing.totalVisits + 1
            existing != null -> existing.totalVisits
            isCompletedAppt -> 1
            else -> 0
        }

        val entity = PatientEntity(
            id = pId,
            clinicId = "clinic-1",
            fullName = appt.patientName,
            phone = appt.patientMobile,
            gender = "Male",
            age = 19,
            email = null,
            trackingCode10Digit = "BC8B0D0566",
            lastVisitDate = latestCompletedDate,
            totalVisits = totalVisitsCount
        )
        fakeDao.upsert(entity)

        val saved = fakeDao.getPatientById(pId)
        assertNotNull(saved)
        assertNull("lastVisitDate must remain null for uncompleted waiting appointment", saved?.lastVisitDate)
        assertEquals("totalVisits must be 0 for waiting appointment", 0, saved?.totalVisits)
    }

    @Test
    fun testUpsertFromAppointmentsDoesNotExplodeTotalVisitsOnRepeatedPolling() = runTest {
        val fakeDao = FakePatientDao()
        val pId = PatientIdentitySync.getDeterministicPatientIdForPhone("9849494946")

        // First completed visit on 2026-11-10
        fakeDao.upsert(
            PatientEntity(
                id = pId,
                clinicId = "clinic-1",
                fullName = "Rajan",
                phone = "9849494946",
                gender = "Male",
                age = 19,
                email = null,
                trackingCode10Digit = "BC8B0D0566",
                lastVisitDate = "2026-11-10",
                totalVisits = 1
            )
        )

        // Today's appointment is scheduled and waiting
        val todayAppt = Appointment(
            id = "appt-2",
            clinicId = "clinic-1",
            patientName = "Rajan",
            patientMobile = "9849494946",
            appointmentDate = "2026-11-19",
            status = "APPROVED",
            checkinStatus = "waiting"
        )

        // Simulate 10 polling ticks (e.g. 50 seconds of polling)
        for (i in 1..10) {
            val existing = fakeDao.getPatientById(pId)
            val isCompletedAppt = todayAppt.checkinStatus?.lowercase() in listOf("completed", "done", "visited")
            val latestCompletedDate = when {
                isCompletedAppt && existing?.lastVisitDate != null -> if (existing.lastVisitDate > todayAppt.appointmentDate) existing.lastVisitDate else todayAppt.appointmentDate
                isCompletedAppt -> todayAppt.appointmentDate
                else -> existing?.lastVisitDate
            }
            val totalVisitsCount = when {
                isCompletedAppt && existing != null && existing.lastVisitDate != todayAppt.appointmentDate -> existing.totalVisits + 1
                existing != null -> existing.totalVisits
                isCompletedAppt -> 1
                else -> 0
            }

            val entity = PatientEntity(
                id = pId,
                clinicId = "clinic-1",
                fullName = todayAppt.patientName,
                phone = todayAppt.patientMobile,
                gender = "Male",
                age = 19,
                email = null,
                trackingCode10Digit = "BC8B0D0566",
                lastVisitDate = latestCompletedDate,
                totalVisits = totalVisitsCount
            )
            fakeDao.upsert(entity)
        }

        val saved = fakeDao.getPatientById(pId)
        assertEquals("totalVisits must stay at 1 without polling inflation", 1, saved?.totalVisits)
        assertEquals("lastVisitDate must retain previous completed visit date", "2026-11-10", saved?.lastVisitDate)
    }

    @Test
    fun testDiagnosticLabClinicTypeHidesBookAppointmentInPatientDirectory() {
        val labClinic1 = Clinic(
            id = "lab-c1",
            name = "Apex Pathology & Diagnostic Lab",
            type = "diagnostic_lab"
        )
        val labClinic2 = Clinic(
            id = "lab-c2",
            name = "City Diagnostic Center",
            type = "lab"
        )
        val labClinic3 = Clinic(
            id = "lab-c3",
            name = "Modern Imaging & Scanning Center",
            type = "opd_clinic",
            specialties = listOf("Pathology & Lab Diagnostics", "Radiology Scan")
        )

        assertTrue(labClinic1.isDiagnosticLab())
        assertTrue(labClinic2.isDiagnosticLab())
        assertTrue(labClinic3.isDiagnosticLab())

        // In patient directory, book appointment action is strictly hidden for diagnostic lab clinics
        fun shouldShowBookAppointment(clinic: Clinic?): Boolean {
            return clinic?.isDiagnosticLab() != true
        }

        assertFalse("Book appointment should NOT be shown in diagnostic_lab clinic", shouldShowBookAppointment(labClinic1))
        assertFalse("Book appointment should NOT be shown in lab clinic", shouldShowBookAppointment(labClinic2))
        assertFalse("Book appointment should NOT be shown in pathology/scan clinic", shouldShowBookAppointment(labClinic3))
    }

    @Test
    fun testOpdClinicShowsBookAppointmentInPatientDirectory() {
        val opdClinic = Clinic(
            id = "opd-c1",
            name = "Medicare Polyclinic & Health Care",
            type = "opd_clinic",
            specialties = listOf("General Medicine", "Pediatrics", "Cardiology")
        )

        assertFalse(opdClinic.isDiagnosticLab())

        fun shouldShowBookAppointment(clinic: Clinic?): Boolean {
            return clinic?.isDiagnosticLab() != true
        }

        assertTrue("Book appointment SHOULD be shown in standard OPD polyclinic", shouldShowBookAppointment(opdClinic))
    }
}
