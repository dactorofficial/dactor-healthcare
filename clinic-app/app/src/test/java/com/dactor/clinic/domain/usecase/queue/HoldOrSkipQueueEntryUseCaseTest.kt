package com.dactor.clinic.domain.usecase.queue

import com.dactor.clinic.domain.model.QueueConflictException
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

class HoldOrSkipQueueEntryUseCaseTest {

    private lateinit var fakeClinicRepo: FakeClinicRepository
    private lateinit var fakeQueueRepo: FakeQueueRepository
    private lateinit var fakeApptRepo: FakeAppointmentRepository
    private lateinit var useCase: HoldOrSkipQueueEntryUseCase

    @Before
    fun setUp() {
        fakeClinicRepo = FakeClinicRepository()
        fakeQueueRepo = FakeQueueRepository(fakeClinicRepo)
        fakeApptRepo = FakeAppointmentRepository()
        useCase = HoldOrSkipQueueEntryUseCase(fakeQueueRepo, fakeApptRepo)
    }

    @Test
    fun testSkipNormalizesToNoShow() = runTest {
        val result = useCase(
            entryId = "entry-skip-1",
            appointmentId = "appt-skip-1",
            expectedStatus = "waiting",
            newStatus = "skipped",
            actorType = "doctor",
            actorId = "3fa85f64-5717-4562-b3fc-2c963f66afa6"
        )

        assertTrue(result.isSuccess)
        assertEquals("no_show", fakeQueueRepo.lastNewStatus)
        assertEquals("no_show", fakeApptRepo.checkinStatusUpdates["appt-skip-1"])
    }

    @Test
    fun testHoldOrSkipConflictRollback() = runTest {
        fakeQueueRepo.shouldFailConflict = true
        fakeQueueRepo.conflictMessage = "This entry was just updated"
        fakeQueueRepo.conflictCurrentStatus = "inside"

        val result = useCase(
            entryId = "entry-skip-2",
            appointmentId = "appt-skip-2",
            expectedStatus = "waiting",
            newStatus = "no_show",
            actorType = "doctor",
            actorId = "3fa85f64-5717-4562-b3fc-2c963f66afa6"
        )

        assertTrue(result.isFailure)
        val ex = result.exceptionOrNull() as QueueConflictException
        assertEquals("inside", ex.currentStatus)
    }
}
