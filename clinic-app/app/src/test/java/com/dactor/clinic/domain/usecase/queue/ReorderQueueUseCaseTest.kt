package com.dactor.clinic.domain.usecase.queue

import com.dactor.clinic.data.model.QueueEntry
import com.dactor.clinic.ui.queue.QueueItemUi
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

class ReorderQueueUseCaseTest {

    private lateinit var fakeClinicRepo: FakeClinicRepository
    private lateinit var fakeQueueRepo: FakeQueueRepository
    private lateinit var useCase: ReorderQueueUseCase

    @Before
    fun setUp() {
        fakeClinicRepo = FakeClinicRepository()
        fakeQueueRepo = FakeQueueRepository(fakeClinicRepo)
        useCase = ReorderQueueUseCase(fakeQueueRepo)
    }

    @Test
    fun testReorderEntriesNormalizesIndices() = runTest {
        val entries = listOf(
            QueueEntry(id = "e1", appointmentId = "a1", clinicId = "c1", queuePosition = 10, status = "waiting"),
            QueueEntry(id = "e2", appointmentId = "a2", clinicId = "c1", queuePosition = 25, status = "waiting"),
            QueueEntry(id = "e3", appointmentId = "a3", clinicId = "c1", queuePosition = 99, status = "waiting")
        )

        val result = useCase(entries)
        assertTrue(result.isSuccess)

        val reordered = fakeQueueRepo.reorderedEntriesList
        assertEquals(3, reordered?.size)
        assertEquals(1, reordered?.get(0)?.queuePosition)
        assertEquals(2, reordered?.get(1)?.queuePosition)
        assertEquals(3, reordered?.get(2)?.queuePosition)
    }

    @Test
    fun testReorderQueueItemUiList() = runTest {
        val items = listOf(
            QueueItemUi(
                id = "item-1",
                appointmentId = "appt-1",
                patientName = "Patient 1",
                patientAge = 30,
                patientGender = "Male",
                patientMobile = "9876543210",
                trackingCode = "TRK111",
                queuePosition = 5,
                status = "waiting",
                userId = "user-1",
                isWalkin = false
            ),
            QueueItemUi(
                id = "item-2",
                appointmentId = "appt-2",
                patientName = "Patient 2",
                patientAge = 25,
                patientGender = "Female",
                patientMobile = "9876543211",
                trackingCode = "TRK222",
                queuePosition = 8,
                status = "waiting",
                userId = null,
                isWalkin = true
            )
        )

        val result = useCase(clinicId = "c1", items = items, doctorId = "doc-1")
        assertTrue(result.isSuccess)

        val reordered = fakeQueueRepo.reorderedEntriesList
        assertEquals(2, reordered?.size)
        assertEquals(1, reordered?.get(0)?.queuePosition)
        assertEquals(2, reordered?.get(1)?.queuePosition)
        assertEquals("doc-1", reordered?.get(0)?.doctorId)
    }

    @Test
    fun testReorderEmptyListSucceeds() = runTest {
        val result = useCase(emptyList<QueueEntry>())
        assertTrue(result.isSuccess)
    }
}
