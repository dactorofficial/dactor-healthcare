package com.dactor.clinic.domain.usecase.queue

import com.dactor.clinic.data.model.Appointment
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

class AddWalkinQueueEntryUseCaseTest {

    private lateinit var fakeClinicRepo: FakeClinicRepository
    private lateinit var fakeQueueRepo: FakeQueueRepository
    private lateinit var fakeApptRepo: FakeAppointmentRepository
    private lateinit var useCase: AddWalkinQueueEntryUseCase

    @Before
    fun setUp() {
        fakeClinicRepo = FakeClinicRepository()
        fakeQueueRepo = FakeQueueRepository(fakeClinicRepo)
        fakeApptRepo = FakeAppointmentRepository()
        useCase = AddWalkinQueueEntryUseCase(fakeApptRepo, fakeQueueRepo)
    }

    @Test
    fun testAddWalkinSuccess() = runTest {
        val walkin = Appointment(
            id = "walkin-1",
            clinicId = "clinic-1",
            doctorId = "doc-1",
            patientName = "Walkin Patient",
            patientMobile = "9800000000",
            patientGender = "Male",
            patientAge = 40,
            appointmentDate = "2026-11-18",
            appointmentTime = "10:00 AM",
            trackingCode10Digit = "TRK9999999"
        )

        val result = useCase(walkin, allowOverbooking = true)
        assertTrue(result.isSuccess)
        val created = result.getOrNull()
        assertEquals("walkin-1", created?.id)
        assertTrue("isWalkin must be true", created?.isWalkin == true)
        assertTrue("Queue cache must be cleared", fakeQueueRepo.cacheCleared)
    }

    @Test
    fun testAddWalkinMissingRequiredFieldsFails() = runTest {
        // Missing clinicId
        val noClinic = Appointment(patientName = "Test", patientMobile = "1234567890")
        val res1 = useCase(noClinic)
        assertTrue(res1.isFailure)
        assertTrue(res1.exceptionOrNull() is IllegalArgumentException)

        // Missing patientName
        val noName = Appointment(clinicId = "c1", patientMobile = "1234567890")
        val res2 = useCase(noName)
        assertTrue(res2.isFailure)

        // Missing patientMobile
        val noMobile = Appointment(clinicId = "c1", patientName = "Test")
        val res3 = useCase(noMobile)
        assertTrue(res3.isFailure)
    }

    @Test
    fun testAddWalkinCreationFailureHandled() = runTest {
        fakeApptRepo.shouldFailWalkinCreation = true
        val walkin = Appointment(
            clinicId = "clinic-1",
            patientName = "Walkin Fail",
            patientMobile = "9800000000"
        )

        val result = useCase(walkin)
        assertTrue(result.isFailure)
        assertFalse("Cache should not be cleared on failure", fakeQueueRepo.cacheCleared)
    }
}
