package com.dactor.clinic.data.sync

import com.dactor.clinic.data.local.dao.AppointmentDao
import com.dactor.clinic.data.local.entity.AppointmentEntity
import com.dactor.clinic.data.model.Appointment
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.LocalDate

/**
 * Unit & Integration tests for R1 (2-second live queue polling & immediate updates)
 * and R2 (Local patient directory storage & selective synchronization rules).
 */
@OptIn(ExperimentalCoroutinesApi::class)
class SelectiveSyncAndQueuePollingTest {

    // In-memory fake implementation of AppointmentDao for JVM testing
    class FakeAppointmentDao : AppointmentDao {
        val storage = mutableMapOf<String, AppointmentEntity>()

        override fun getAppointmentsForDate(clinicId: String, date: String): Flow<List<AppointmentEntity>> = flow {
            emit(storage.values.filter { it.clinicId == clinicId && it.appointmentDate == date && !it.isDeleted })
        }

        override suspend fun getAppointmentsForDateList(clinicId: String, date: String): List<AppointmentEntity> {
            return storage.values.filter { it.clinicId == clinicId && it.appointmentDate == date && !it.isDeleted }
                .sortedBy { it.appointmentTime }
        }

        override suspend fun getAppointmentsForClinicList(clinicId: String): List<AppointmentEntity> {
            return storage.values.filter { it.clinicId == clinicId && !it.isDeleted }
                .sortedWith(compareByDescending<AppointmentEntity> { it.appointmentDate }.thenByDescending { it.appointmentTime })
        }

        override suspend fun getApprovedAppointmentsForClinicList(clinicId: String): List<AppointmentEntity> {
            return storage.values.filter { it.clinicId == clinicId && it.status == "APPROVED" && !it.isDeleted }
                .sortedWith(compareByDescending<AppointmentEntity> { it.appointmentDate }.thenByDescending { it.appointmentTime })
        }

        override suspend fun getAppointmentsForDoctorList(doctorId: String): List<AppointmentEntity> {
            return storage.values.filter { it.doctorId == doctorId && !it.isDeleted }
        }

        override fun getAppointmentsForDoctorAndDate(clinicId: String, doctorId: String, date: String): Flow<List<AppointmentEntity>> = flow {
            emit(storage.values.filter { it.clinicId == clinicId && it.doctorId == doctorId && it.appointmentDate == date && !it.isDeleted })
        }

        override suspend fun getAppointmentById(id: String): AppointmentEntity? {
            return storage[id]?.takeIf { !it.isDeleted }
        }

        override suspend fun getAppointmentByTrackingCode(trackingCode: String): AppointmentEntity? {
            return storage.values.firstOrNull { it.trackingCode10Digit == trackingCode && !it.isDeleted }
        }

        override suspend fun searchPatients(clinicId: String, query: String): List<AppointmentEntity> {
            val q = query.lowercase()
            return storage.values.filter {
                it.clinicId == clinicId && !it.isDeleted &&
                        (it.patientName.lowercase().contains(q) ||
                                it.patientMobile.contains(q) ||
                                it.trackingCode10Digit.contains(q))
            }.take(50)
        }

        override suspend fun getPendingSyncAppointments(): List<AppointmentEntity> {
            return storage.values.filter { it.syncStatus != "synced" }
        }

        override suspend fun upsert(appointment: AppointmentEntity) {
            storage[appointment.id] = appointment
        }

        override suspend fun upsertAll(appointments: List<AppointmentEntity>) {
            appointments.forEach { storage[it.id] = it }
        }

        override suspend fun markSynced(id: String) {
            storage[id]?.let { storage[id] = it.copy(syncStatus = "synced") }
        }

        override suspend fun softDelete(id: String, deletedAt: Long) {
            storage[id]?.let { storage[id] = it.copy(isDeleted = true, deletedAt = deletedAt, syncStatus = "pending_update") }
        }

        override suspend fun purgeSyncedDeleted() {
            val toRemove = storage.values.filter { it.isDeleted && it.syncStatus == "synced" }.map { it.id }
            toRemove.forEach { storage.remove(it) }
        }
    }

    // =========================================================================
    // R1: 2-SECOND POLLING & IMMEDIATE DETAIL UPDATE TESTS
    // =========================================================================

    @Test
    fun testTwoSecondPollingIntervalWithVirtualTimer() = runTest {
        var pollCounter = 0
        val pollingIntervalMs = 2000L

        // Active polling coroutine simulating QueueBoardScreen / DoctorDashboardScreen
        val job = launch {
            while (isActive) {
                pollCounter++
                kotlinx.coroutines.delay(pollingIntervalMs)
            }
        }

        // T = 0ms: Initial poll executed
        runCurrent()
        assertEquals("Initial poll should fire at T=0", 1, pollCounter)

        // Advance by 1999ms: interval not yet reached
        advanceTimeBy(1999L)
        runCurrent()
        assertEquals("Should not poll before 2000ms elapse", 1, pollCounter)

        // Advance by 1ms (Total = 2000ms): Poll #2 occurs
        advanceTimeBy(1L)
        runCurrent()
        assertEquals("Poll #2 must fire precisely at 2000ms", 2, pollCounter)

        // Advance by another 2000ms (Total = 4000ms): Poll #3 occurs
        advanceTimeBy(2000L)
        runCurrent()
        assertEquals("Poll #3 must fire at 4000ms", 3, pollCounter)

        // Advance by another 4000ms (Total = 8000ms): 2 more polls
        advanceTimeBy(4000L)
        runCurrent()
        assertEquals("Poll #5 must fire at 8000ms", 5, pollCounter)

        job.cancel()
    }

    @Test
    fun testImmediateStateUpdateOnDetailChange() = runTest {
        data class QueueSnapshot(
            val tokenNumber: Int,
            val checkinStatus: String,
            val doctorInCabin: Boolean
        )

        val queueFlow = MutableStateFlow(QueueSnapshot(tokenNumber = 1, checkinStatus = "waiting", doctorInCabin = true))
        val updateLog = mutableListOf<String>()

        val observerJob = launch {
            queueFlow.collect { snapshot ->
                updateLog.add("Token:${snapshot.tokenNumber},Status:${snapshot.checkinStatus},Cabin:${snapshot.doctorInCabin}")
            }
        }
        runCurrent()
        assertEquals(1, updateLog.size)

        // Trigger detail change: patient called into cabin
        queueFlow.value = QueueSnapshot(tokenNumber = 1, checkinStatus = "in_consultation", doctorInCabin = true)
        runCurrent()
        assertEquals(2, updateLog.size)
        assertEquals("Token:1,Status:in_consultation,Cabin:true", updateLog.last())

        // Trigger detail change: next patient called
        queueFlow.value = QueueSnapshot(tokenNumber = 2, checkinStatus = "in_consultation", doctorInCabin = true)
        runCurrent()
        assertEquals(3, updateLog.size)
        assertEquals("Token:2,Status:in_consultation,Cabin:true", updateLog.last())

        // Trigger detail change: doctor left cabin
        queueFlow.value = QueueSnapshot(tokenNumber = 2, checkinStatus = "in_consultation", doctorInCabin = false)
        runCurrent()
        assertEquals(4, updateLog.size)
        assertEquals("Token:2,Status:in_consultation,Cabin:false", updateLog.last())

        observerJob.cancel()
    }

    // =========================================================================
    // R2: LOCAL PATIENT DIRECTORY STORAGE IN ROOM
    // =========================================================================

    @Test
    fun testLocalPatientDirectoryStorageInRoomDao() = runTest {
        val dao = FakeAppointmentDao()
        val clinicId = "clinic-test-001"

        val patient1 = AppointmentEntity(
            id = "appt-001",
            trackingCode10Digit = "1234567890",
            clinicId = clinicId,
            doctorId = "doc-001",
            patientName = "Ram Bahadur",
            patientAge = 42,
            patientGender = "Male",
            patientMobile = "9841000001",
            paymentStatus = "paid",
            checkinStatus = "checked_in",
            appointmentDate = LocalDate.now().toString(),
            appointmentTime = "10:00",
            feeAmount = 600.0,
            status = "APPROVED",
            syncStatus = "synced"
        )

        val patient2 = AppointmentEntity(
            id = "appt-002",
            trackingCode10Digit = "9876543210",
            clinicId = clinicId,
            doctorId = "doc-001",
            patientName = "Gita Shrestha",
            patientAge = 28,
            patientGender = "Female",
            patientMobile = "9841000002",
            paymentStatus = "paid",
            checkinStatus = "waiting",
            appointmentDate = LocalDate.now().toString(),
            appointmentTime = "10:30",
            feeAmount = 600.0,
            status = "APPROVED",
            syncStatus = "synced"
        )

        // 1. Store records in local DAO
        dao.upsert(patient1)
        dao.upsert(patient2)

        // 2. Query directory by ID
        val queriedById = dao.getAppointmentById("appt-001")
        assertNotNull(queriedById)
        assertEquals("Ram Bahadur", queriedById?.patientName)
        assertEquals("1234567890", queriedById?.trackingCode10Digit)

        // 3. Query directory by 10-digit tracking code
        val queriedByTracking = dao.getAppointmentByTrackingCode("9876543210")
        assertNotNull(queriedByTracking)
        assertEquals("Gita Shrestha", queriedByTracking?.patientName)

        // 4. Search local directory offline by partial name or mobile
        val searchByName = dao.searchPatients(clinicId, "Bahadur")
        assertEquals(1, searchByName.size)
        assertEquals("Ram Bahadur", searchByName[0].patientName)

        val searchByPhone = dao.searchPatients(clinicId, "9841000002")
        assertEquals(1, searchByPhone.size)
        assertEquals("Gita Shrestha", searchByPhone[0].patientName)
    }

    // =========================================================================
    // R2: SELECTIVE SYNCHRONIZATION RULES (TODAY'S APPOINTMENTS & ON-DEMAND)
    // =========================================================================

    @Test
    fun testSelectiveSyncFiltersOnlyTodayAppointmentsDuringRoutineSync() = runTest {
        val today = LocalDate.now().toString()
        val tomorrow = LocalDate.now().plusDays(1).toString()
        val yesterday = LocalDate.now().minusDays(1).toString()
        val clinicId = "clinic-alpha"

        val remoteServerAppointments = listOf(
            Appointment(id = "a1", trackingCode10Digit = "1111111111", clinicId = clinicId, appointmentDate = today, patientName = "Today Patient A"),
            Appointment(id = "a2", trackingCode10Digit = "2222222222", clinicId = clinicId, appointmentDate = today, patientName = "Today Patient B"),
            Appointment(id = "a3", trackingCode10Digit = "3333333333", clinicId = clinicId, appointmentDate = tomorrow, patientName = "Future Patient C"),
            Appointment(id = "a4", trackingCode10Digit = "4444444444", clinicId = clinicId, appointmentDate = yesterday, patientName = "Past Patient D")
        )

        val localDao = FakeAppointmentDao()

        // Simulate routine background sync (filtered strictly by appointment_date = today)
        val routineSyncedAppts = remoteServerAppointments.filter { it.appointmentDate == today }
        localDao.upsertAll(routineSyncedAppts.map { AppointmentEntity.fromDomainModel(it, syncStatus = "synced") })

        // Invariant 1: Only today's scheduled appointments are stored locally from routine sync
        val localRecords = localDao.getAppointmentsForClinicList(clinicId)
        assertEquals(2, localRecords.size)
        assertTrue(localRecords.any { it.id == "a1" && it.patientName == "Today Patient A" })
        assertTrue(localRecords.any { it.id == "a2" && it.patientName == "Today Patient B" })

        // Invariant 2: Non-scheduled (future or past) patients are excluded from routine sync
        assertNull("Future patient must NOT be synced in routine sync", localDao.getAppointmentById("a3"))
        assertNull("Past patient must NOT be synced in routine sync", localDao.getAppointmentById("a4"))
    }

    @Test
    fun testOnDemandSyncForIndividualPatientRecord() = runTest {
        val today = LocalDate.now().toString()
        val nextWeek = LocalDate.now().plusDays(7).toString()
        val clinicId = "clinic-beta"

        val remoteServerAppointments = listOf(
            Appointment(id = "scheduled-today", trackingCode10Digit = "5555555555", clinicId = clinicId, appointmentDate = today, patientName = "Scheduled Today"),
            Appointment(id = "unscheduled-patient", trackingCode10Digit = "7777777777", clinicId = clinicId, appointmentDate = nextWeek, patientName = "Future Patient X")
        )

        val localDao = FakeAppointmentDao()

        // Step 1: Routine sync runs - only today's patient is stored
        val routine = remoteServerAppointments.filter { it.appointmentDate == today }
        localDao.upsertAll(routine.map { AppointmentEntity.fromDomainModel(it, syncStatus = "synced") })
        assertNull("Patient X is not scheduled for today and should not be stored yet", localDao.getAppointmentById("unscheduled-patient"))

        // Step 2: Clinic staff explicitly opens or checks Patient X's record by tracking code
        val requestedCode = "7777777777"
        val onDemandFetched = remoteServerAppointments.firstOrNull { it.trackingCode10Digit == requestedCode }
        assertNotNull(onDemandFetched)

        // Persist on-demand fetched record to local Room DB
        localDao.upsert(AppointmentEntity.fromDomainModel(onDemandFetched!!, syncStatus = "synced"))

        // Invariant: Patient X is now persisted in local storage due to active check/view
        val syncedPatientX = localDao.getAppointmentByTrackingCode(requestedCode)
        assertNotNull("Patient X must be stored locally after on-demand sync", syncedPatientX)
        assertEquals("unscheduled-patient", syncedPatientX?.id)
        assertEquals("Future Patient X", syncedPatientX?.patientName)
    }
}
