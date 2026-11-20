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
        assertEquals(
            "Cannot send push notification to walk-in patient without an app account",
            ex?.message
        )
        assertFalse("No notification dispatched", fakeQueueRepo.notifyCallInsideCalls.contains("appt-walkin-no-acct"))
    }

    @Test
    fun testWalkinWithUserIdOverload() = runTest {
        // 1. Unlinked walk-in (isWalkin = true, userId = null) must fail with exact message
        val unlinkedResult = useCase(
            appointmentId = "appt-walkin-overload-1",
            alertType = "call_in",
            patientName = "Unlinked Walkin",
            trackingCode = "TRK1111111",
            isWalkin = true,
            userId = null
        )
        assertTrue("Unlinked walkin must fail", unlinkedResult.isFailure)
        assertEquals(
            "Cannot send push notification to walk-in patient without an app account",
            unlinkedResult.exceptionOrNull()?.message
        )
        assertFalse(fakeQueueRepo.notifyCallInsideCalls.contains("appt-walkin-overload-1"))

        // 2. Linked walk-in with valid userId must succeed
        val linkedResult = useCase(
            appointmentId = "appt-walkin-overload-2",
            alertType = "call_in",
            patientName = "Linked Walkin",
            doctorName = "Dr. Banner",
            trackingCode = "TRK2222222",
            isWalkin = true,
            userId = "user-patient-1234"
        )
        assertTrue("Linked walkin must succeed", linkedResult.isSuccess)
        assertTrue(fakeQueueRepo.notifyCallInsideCalls.contains("appt-walkin-overload-2"))

        // 3. Regular appointment (isWalkin = false, userId = null) must succeed
        val regularResult = useCase(
            appointmentId = "appt-walkin-overload-3",
            alertType = "call_in",
            patientName = "Regular Appt",
            doctorName = "Dr. Banner",
            trackingCode = "TRK3333333",
            isWalkin = false,
            userId = null
        )
        assertTrue("Regular appointment must succeed", regularResult.isSuccess)
        assertTrue(fakeQueueRepo.notifyCallInsideCalls.contains("appt-walkin-overload-3"))
    }

    @Test
    fun testQueueItemUiOverload() = runTest {
        // 1. QueueItemUi with unlinked walk-in (isWalkin = true, userId = null) must fail
        val unlinkedItem = com.dactor.clinic.ui.queue.QueueItemUi(
            id = "q-item-1",
            appointmentId = "appt-item-unlinked",
            patientName = "Item Unlinked",
            patientAge = 30,
            patientGender = "Male",
            patientMobile = "9800000001",
            trackingCode = "TRKITEM01",
            queuePosition = 3,
            status = "waiting",
            isWalkin = true,
            userId = null
        )

        val unlinkedResult = useCase(
            item = unlinkedItem,
            alertType = "call_in"
        )
        assertTrue("Unlinked QueueItemUi must fail", unlinkedResult.isFailure)
        assertEquals(
            "Cannot send push notification to walk-in patient without an app account",
            unlinkedResult.exceptionOrNull()?.message
        )
        assertFalse(fakeQueueRepo.notifyCallInsideCalls.contains("appt-item-unlinked"))

        // 2. QueueItemUi with linked walk-in (isWalkin = true, userId = "...") must succeed
        val linkedItem = com.dactor.clinic.ui.queue.QueueItemUi(
            id = "q-item-2",
            appointmentId = "appt-item-linked",
            patientName = "Item Linked",
            patientAge = 25,
            patientGender = "Female",
            patientMobile = "9800000002",
            trackingCode = "TRKITEM02",
            queuePosition = 1,
            status = "waiting",
            doctorName = "Dr. House",
            doctorId = "doc-999",
            isWalkin = true,
            userId = "user-patient-5678"
        )

        val linkedResult = useCase(
            item = linkedItem,
            alertType = "call_in"
        )
        assertTrue("Linked QueueItemUi must succeed", linkedResult.isSuccess)
        assertTrue(fakeQueueRepo.notifyCallInsideCalls.contains("appt-item-linked"))
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

    @Test
    fun testAntiSpamCooldownBlocksAliasCallInsideAfterCallIn() = runTest {
        // Send 1st alert using alias "call_in"
        val firstResult = useCase(
            appointmentId = "appt-alias-cooldown-1",
            alertType = "call_in",
            patientName = "Daniel Craig",
            doctorName = "Dr. No",
            trackingCode = "TRK0070070",
            cooldownSeconds = 60L
        )
        assertTrue("First call_in alert succeeds", firstResult.isSuccess)
        assertEquals(1, fakeQueueRepo.notifyCallInsideCalls.count { it == "appt-alias-cooldown-1" })

        // Attempt immediate 2nd alert using alias "call_inside" for the same appointment within 60s cooldown
        val aliasResult = useCase(
            appointmentId = "appt-alias-cooldown-1",
            alertType = "call_inside",
            patientName = "Daniel Craig",
            doctorName = "Dr. No",
            trackingCode = "TRK0070070",
            cooldownSeconds = 60L
        )
        assertTrue("Immediate alias alert 'call_inside' must fail", aliasResult.isFailure)
        val ex = aliasResult.exceptionOrNull()
        assertTrue("Error indicates cooldown active", ex?.message?.contains("Alert recently sent") == true)
        // Ensure notifyCallInside was NOT invoked a second time
        assertEquals("notifyCallInside must only have been called once", 1, fakeQueueRepo.notifyCallInsideCalls.count { it == "appt-alias-cooldown-1" })

        // Also verify alias "turn_call" is also blocked by the canonical cooldown key
        val turnCallResult = useCase(
            appointmentId = "appt-alias-cooldown-1",
            alertType = "turn_call",
            patientName = "Daniel Craig",
            doctorName = "Dr. No",
            trackingCode = "TRK0070070",
            cooldownSeconds = 60L
        )
        assertTrue("Immediate alias alert 'turn_call' must fail", turnCallResult.isFailure)
        assertEquals("notifyCallInside must still only have been called once", 1, fakeQueueRepo.notifyCallInsideCalls.count { it == "appt-alias-cooldown-1" })
    }
}
