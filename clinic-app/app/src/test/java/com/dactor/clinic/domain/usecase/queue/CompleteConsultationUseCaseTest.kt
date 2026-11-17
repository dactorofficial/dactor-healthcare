package com.dactor.clinic.domain.usecase.queue

import com.dactor.clinic.domain.model.QueueConflictException
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

class CompleteConsultationUseCaseTest {

    private lateinit var fakeClinicRepo: FakeClinicRepository
    private lateinit var fakeQueueRepo: FakeQueueRepository
    private lateinit var fakeApptRepo: FakeAppointmentRepository
    private lateinit var fakeLabRepo: FakeLabReportRepository
    private lateinit var useCase: CompleteConsultationUseCase

    @Before
    fun setUp() {
        fakeClinicRepo = FakeClinicRepository()
        fakeQueueRepo = FakeQueueRepository(fakeClinicRepo)
        fakeApptRepo = FakeAppointmentRepository()
        fakeLabRepo = FakeLabReportRepository()
        useCase = CompleteConsultationUseCase(fakeQueueRepo, fakeApptRepo, fakeLabRepo)
    }

    @Test
    fun testCompleteOpdConsultationSuccess() = runTest {
        val result = useCase(
            entryId = "entry-opd-1",
            appointmentId = "appt-opd-1",
            expectedStatus = "inside",
            actorType = "doctor",
            actorId = "3fa85f64-5717-4562-b3fc-2c963f66afa6",
            isDiagnosticLab = false
        )

        assertTrue("OPD complete must succeed", result.isSuccess)
        assertEquals("entry-opd-1", fakeQueueRepo.lastTransitionEntryId)
        assertEquals("inside", fakeQueueRepo.lastExpectedStatus)
        assertEquals("done", fakeQueueRepo.lastNewStatus)
        assertEquals("completed", fakeApptRepo.checkinStatusUpdates["appt-opd-1"])
        assertTrue("No lab report upsert for OPD", fakeLabRepo.upsertedLabReports.isEmpty())
    }

    @Test
    fun testCompleteDiagnosticLabConsultationSuccess() = runTest {
        val result = useCase(
            entryId = "entry-lab-1",
            appointmentId = "appt-lab-1",
            expectedStatus = "inside",
            actorType = "doctor",
            actorId = "3fa85f64-5717-4562-b3fc-2c963f66afa6",
            clinicId = "clinic-diagnostic-99",
            isDiagnosticLab = true,
            patientName = "Bob Builder",
            selectedLabTests = "Complete Blood Count (CBC)"
        )

        assertTrue("Diagnostic lab complete must succeed", result.isSuccess)
        assertEquals("entry-lab-1", fakeQueueRepo.lastTransitionEntryId)
        assertEquals("processing", fakeQueueRepo.lastNewStatus)
        assertEquals("processing", fakeApptRepo.checkinStatusUpdates["appt-lab-1"])
        assertTrue("Lab report must be upserted", fakeLabRepo.upsertedLabReports.contains("appt-lab-1"))
    }

    @Test
    fun testCompleteConsultationConflictRollback() = runTest {
        fakeQueueRepo.shouldFailConflict = true
        fakeQueueRepo.conflictMessage = "This entry was just updated"
        fakeQueueRepo.conflictCurrentStatus = "done"

        val result = useCase(
            entryId = "entry-conflict-1",
            appointmentId = "appt-conflict-1",
            expectedStatus = "inside",
            actorType = "doctor",
            actorId = "3fa85f64-5717-4562-b3fc-2c963f66afa6"
        )

        assertTrue("Use case should return failure on conflict", result.isFailure)
        assertTrue(result.exceptionOrNull() is QueueConflictException)
        assertFalse("Appointment must not be updated on conflict", fakeApptRepo.checkinStatusUpdates.containsKey("appt-conflict-1"))
    }
}
