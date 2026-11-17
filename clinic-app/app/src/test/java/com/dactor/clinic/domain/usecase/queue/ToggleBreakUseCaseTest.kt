package com.dactor.clinic.domain.usecase.queue

import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

class ToggleBreakUseCaseTest {

    private lateinit var fakeClinicRepo: FakeClinicRepository
    private lateinit var fakeQueueRepo: FakeQueueRepository
    private lateinit var useCase: ToggleBreakUseCase

    @Before
    fun setUp() {
        fakeClinicRepo = FakeClinicRepository()
        fakeQueueRepo = FakeQueueRepository(fakeClinicRepo)
        useCase = ToggleBreakUseCase(fakeClinicRepo, fakeQueueRepo)
    }

    @Test
    fun testToggleBreakOnDispatchesNotifications() = runTest {
        val result = useCase(
            clinicId = "clinic-break-1",
            isOnBreak = true,
            clinicName = "Downtown Medical Care",
            breakWindowText = "1:00 PM - 2:00 PM"
        )

        assertTrue(result.isSuccess)
        assertEquals(true, fakeClinicRepo.breakStatusMap["clinic-break-1"])
        assertEquals(1, fakeQueueRepo.breakNotificationCalls.size)
        assertEquals("clinic-break-1", fakeQueueRepo.breakNotificationCalls[0].first)
        assertEquals("Downtown Medical Care", fakeQueueRepo.breakNotificationCalls[0].second)
    }

    @Test
    fun testToggleBreakOffDoesNotDispatchNotifications() = runTest {
        val result = useCase(
            clinicId = "clinic-break-2",
            isOnBreak = false
        )

        assertTrue(result.isSuccess)
        assertEquals(false, fakeClinicRepo.breakStatusMap["clinic-break-2"])
        assertTrue(fakeQueueRepo.breakNotificationCalls.isEmpty())
    }

    @Test
    fun testToggleBreakBlankClinicFails() = runTest {
        val result = useCase(
            clinicId = "",
            isOnBreak = true
        )

        assertTrue(result.isFailure)
        assertTrue(result.exceptionOrNull() is IllegalArgumentException)
    }
}
