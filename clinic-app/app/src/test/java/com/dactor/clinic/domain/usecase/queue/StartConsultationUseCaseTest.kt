package com.dactor.clinic.domain.usecase.queue

import com.dactor.clinic.domain.model.QueueConflictException
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

class StartConsultationUseCaseTest {

    private lateinit var fakeClinicRepo: FakeClinicRepository
    private lateinit var fakeQueueRepo: FakeQueueRepository
    private lateinit var fakeApptRepo: FakeAppointmentRepository
    private lateinit var useCase: StartConsultationUseCase

    @Before
    fun setUp() {
        fakeClinicRepo = FakeClinicRepository()
        fakeQueueRepo = FakeQueueRepository(fakeClinicRepo)
        fakeApptRepo = FakeAppointmentRepository()
        useCase = StartConsultationUseCase(fakeQueueRepo, fakeApptRepo)
    }

    @Test
    fun testStartConsultationSuccess() = runTest {
        val result = useCase(
            entryId = "entry-101",
            appointmentId = "appt-202",
            expectedStatus = "waiting",
            actorType = "doctor",
            actorId = "3fa85f64-5717-4562-b3fc-2c963f66afa6",
            patientName = "Jane Doe",
            doctorName = "Dr. Smith",
            trackingCode = "TRK1234567"
        )

        assertTrue("Use case should return success", result.isSuccess)
        val data = result.getOrNull()
        assertEquals("entry-101", data?.entryId)
        assertEquals("inside", data?.status)
        assertEquals("doctor", data?.updatedByActorType)

        // Verify repository interactions
        assertEquals("entry-101", fakeQueueRepo.lastTransitionEntryId)
        assertEquals("waiting", fakeQueueRepo.lastExpectedStatus)
        assertEquals("inside", fakeQueueRepo.lastNewStatus)
        assertEquals("3fa85f64-5717-4562-b3fc-2c963f66afa6", fakeQueueRepo.lastActorId)
        assertEquals("inside", fakeApptRepo.checkinStatusUpdates["appt-202"])
        assertTrue("Patient push notification dispatched", fakeQueueRepo.notifyCallInsideCalls.contains("appt-202"))
    }

    @Test
    fun testStartConsultationConflictRollback() = runTest {
        fakeQueueRepo.shouldFailConflict = true
        fakeQueueRepo.conflictMessage = "This entry was just updated"
        fakeQueueRepo.conflictCurrentStatus = "no_show"

        val result = useCase(
            entryId = "entry-101",
            appointmentId = "appt-202",
            expectedStatus = "waiting",
            actorType = "doctor",
            actorId = "3fa85f64-5717-4562-b3fc-2c963f66afa6"
        )

        assertTrue("Use case should return failure on conflict", result.isFailure)
        val exception = result.exceptionOrNull()
        assertTrue("Exception must be QueueConflictException", exception is QueueConflictException)
        val conflict = exception as QueueConflictException
        assertEquals("This entry was just updated", conflict.message)
        assertEquals("no_show", conflict.currentStatus)
        assertFalse("Appointment status must NOT be updated on conflict", fakeApptRepo.checkinStatusUpdates.containsKey("appt-202"))
    }
}
