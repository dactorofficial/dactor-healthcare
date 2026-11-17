package com.dactor.clinic.domain.usecase.queue

import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

class SendPatientQueueAlertUseCaseTest {

    private lateinit var fakeClinicRepo: FakeClinicRepository
    private lateinit var fakeQueueRepo: FakeQueueRepository
    private lateinit var useCase: SendPatientQueueAlertUseCase

    @Before
    fun setUp() {
        fakeClinicRepo = FakeClinicRepository()
        fakeQueueRepo = FakeQueueRepository(fakeClinicRepo)
        useCase = SendPatientQueueAlertUseCase(fakeQueueRepo)
    }

    @Test
    fun testCallInNotificationSuccess() = runTest {
        val result = useCase(
            appointmentId = "appt-call-1",
            alertType = "call_in",
            patientName = "Alice Wonderland",
            doctorName = "Dr. Banner",
            trackingCode = "TRK5555555"
        )

        assertTrue("Call-in alert must succeed", result.isSuccess)
        assertTrue("notifyCallInside must be called", fakeQueueRepo.notifyCallInsideCalls.contains("appt-call-1"))
    }

    @Test
    fun testArriveSoonNotificationSuccess() = runTest {
        val result = useCase(
            appointmentId = "appt-arrive-1",
            alertType = "arrive_soon",
            patientName = "Bob Builder",
            doctorName = "Dr. Banner",
            trackingCode = "TRK6666666",
            queuePosition = 2,
            estTimeText = "~ 10-15 mins"
        )

        assertTrue("Arrive soon alert must succeed", result.isSuccess)
        assertTrue("sendManualNotification must be called", fakeQueueRepo.manualNotificationCalls.contains("appt-arrive-1"))
    }

    @Test
    fun testWalkinWithoutAccountBlocked() = runTest {
        val result = useCase(
            appointmentId = "appt-walkin-no-acct",
            alertType = "call_in",
            patientName = "Walkin Guy",
            trackingCode = "TRK7777777",
            isWalkinWithoutAccount = true
        )

        assertTrue("Must fail for unlinked walk-in", result.isFailure)
        val ex = result.exceptionOrNull()
        assertTrue("Error message indicates no app account", ex?.message?.contains("Walk-in patient has no app account") == true)
        assertFalse("No notification dispatched", fakeQueueRepo.notifyCallInsideCalls.contains("appt-walkin-no-acct"))
    }

    @Test
    fun testAntiSpamCooldownBlocksDuplicateSend() = runTest {
        // Send 1st alert
        val firstResult = useCase(
            appointmentId = "appt-cooldown-1",
            alertType = "call_in",
            patientName = "Charlie Chaplin",
            trackingCode = "TRK8888888",
            cooldownSeconds = 60L
        )
        assertTrue("First alert succeeds", firstResult.isSuccess)

        // Attempt immediate 2nd alert within 60s cooldown
        val duplicateResult = useCase(
            appointmentId = "appt-cooldown-1",
            alertType = "call_in",
            patientName = "Charlie Chaplin",
            trackingCode = "TRK8888888",
            cooldownSeconds = 60L
        )
        assertTrue("Immediate duplicate alert must fail", duplicateResult.isFailure)
        val ex = duplicateResult.exceptionOrNull()
        assertTrue("Error indicates cooldown active", ex?.message?.contains("Alert recently sent") == true)
    }
}
