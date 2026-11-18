package com.dactor.clinic.ui.queue

import android.content.Context
import com.dactor.clinic.data.model.Appointment
import com.dactor.clinic.data.model.Clinic
import com.dactor.clinic.data.model.Doctor
import com.dactor.clinic.data.model.QueueEntry
import com.dactor.clinic.data.model.Slot
import com.dactor.clinic.data.model.TransitionQueueEntryStatusResult
import com.dactor.clinic.data.repository.AppointmentRepository
import com.dactor.clinic.data.repository.ClinicRepository
import com.dactor.clinic.data.repository.DoctorRepository
import com.dactor.clinic.data.repository.LabReportRepository
import com.dactor.clinic.data.repository.QueueRepository
import com.dactor.clinic.data.repository.SlotRepository
import com.dactor.clinic.data.util.NetworkMonitor
import com.dactor.clinic.domain.model.QueueConflictException
import com.dactor.clinic.domain.usecase.queue.*
import com.dactor.clinic.ui.queue.model.DoctorQueueEvent
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.createSupabaseClient
import io.github.jan.supabase.postgrest.Postgrest
import io.github.jan.supabase.serializer.KotlinXSerializer
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.*
import kotlinx.serialization.json.Json
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import java.time.LocalDate

@OptIn(ExperimentalCoroutinesApi::class)
class DoctorQueueViewModelTest {

    private val testDispatcher = StandardTestDispatcher()

    private val dummySupabaseClient: SupabaseClient by lazy {
        createSupabaseClient(
            supabaseUrl = "https://dummy.supabase.co",
            supabaseKey = "dummy-anon-key"
        ) {
            defaultSerializer = KotlinXSerializer(
                Json {
                    ignoreUnknownKeys = true
                    isLenient = true
                    coerceInputValues = true
                }
            )
            install(Postgrest)
        }
    }

    private lateinit var fakeQueueRepo: TestQueueRepository
    private lateinit var fakeApptRepo: TestAppointmentRepository
    private lateinit var fakeDoctorRepo: TestDoctorRepository
    private lateinit var fakeClinicRepo: TestClinicRepository
    private lateinit var fakeSlotRepo: TestSlotRepository
    private lateinit var fakeNetworkMonitor: TestNetworkMonitor

    private lateinit var startConsultationUseCase: StartConsultationUseCase
    private lateinit var completeConsultationUseCase: CompleteConsultationUseCase
    private lateinit var holdOrSkipQueueEntryUseCase: HoldOrSkipQueueEntryUseCase
    private lateinit var reorderQueueUseCase: ReorderQueueUseCase
    private lateinit var addWalkinQueueEntryUseCase: AddWalkinQueueEntryUseCase
    private lateinit var toggleBreakUseCase: ToggleBreakUseCase
    private lateinit var sendPatientQueueAlertUseCase: SendPatientQueueAlertUseCase

    private lateinit var viewModel: DoctorQueueViewModel

    private val testDoctorId = "doc-uuid-101"
    private val testClinicId = "clinic-uuid-202"
    private val testDate = LocalDate.of(2026, 11, 18)

    @Before
    fun setUp() {
        Dispatchers.setMain(testDispatcher)

        fakeClinicRepo = TestClinicRepository(dummySupabaseClient)
        fakeQueueRepo = TestQueueRepository(dummySupabaseClient, fakeClinicRepo)
        fakeApptRepo = TestAppointmentRepository(dummySupabaseClient)
        fakeDoctorRepo = TestDoctorRepository(dummySupabaseClient)
        fakeSlotRepo = TestSlotRepository(dummySupabaseClient)
        fakeNetworkMonitor = TestNetworkMonitor()

        val fakeLabRepo = object : LabReportRepository(dummySupabaseClient) {}

        startConsultationUseCase = StartConsultationUseCase(fakeQueueRepo, fakeApptRepo)
        completeConsultationUseCase = CompleteConsultationUseCase(fakeQueueRepo, fakeApptRepo, fakeLabRepo)
        holdOrSkipQueueEntryUseCase = HoldOrSkipQueueEntryUseCase(fakeQueueRepo, fakeApptRepo)
        reorderQueueUseCase = ReorderQueueUseCase(fakeQueueRepo)
        addWalkinQueueEntryUseCase = AddWalkinQueueEntryUseCase(fakeApptRepo, fakeQueueRepo)
        toggleBreakUseCase = ToggleBreakUseCase(fakeClinicRepo, fakeQueueRepo)
        sendPatientQueueAlertUseCase = SendPatientQueueAlertUseCase(fakeQueueRepo)

        viewModel = DoctorQueueViewModel(
            queueRepository = fakeQueueRepo,
            doctorRepository = fakeDoctorRepo,
            appointmentRepository = fakeApptRepo,
            clinicRepository = fakeClinicRepo,
            slotRepository = fakeSlotRepo,
            networkMonitor = fakeNetworkMonitor,
            startConsultationUseCase = startConsultationUseCase,
            completeConsultationUseCase = completeConsultationUseCase,
            holdOrSkipQueueEntryUseCase = holdOrSkipQueueEntryUseCase,
            reorderQueueUseCase = reorderQueueUseCase,
            addWalkinQueueEntryUseCase = addWalkinQueueEntryUseCase,
            toggleBreakUseCase = toggleBreakUseCase,
            sendPatientQueueAlertUseCase = sendPatientQueueAlertUseCase
        )
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    @Test
    fun testDoctorAndClinicFiltering() = runTest(testDispatcher) {
        // Prepare entries and appointments:
        // Appt 1: Matches doctor and clinic and date -> should pass
        val appt1 = Appointment(
            id = "appt-1",
            doctorId = testDoctorId,
            clinicId = testClinicId,
            appointmentDate = testDate.toString(),
            patientName = "Alice Brown",
            status = "APPROVED",
            checkinStatus = "waiting"
        )
        val entry1 = QueueEntry(
            id = "entry-1",
            clinicId = testClinicId,
            appointmentId = "appt-1",
            doctorId = testDoctorId,
            queuePosition = 1,
            status = "waiting"
        )

        // Appt 2: Different doctor -> should be excluded
        val appt2 = Appointment(
            id = "appt-2",
            doctorId = "other-doctor-id",
            clinicId = testClinicId,
            appointmentDate = testDate.toString(),
            patientName = "Bob Green",
            status = "APPROVED",
            checkinStatus = "waiting"
        )
        val entry2 = QueueEntry(
            id = "entry-2",
            clinicId = testClinicId,
            appointmentId = "appt-2",
            doctorId = "other-doctor-id",
            queuePosition = 2,
            status = "waiting"
        )

        // Appt 3: Different clinic -> should be excluded
        val appt3 = Appointment(
            id = "appt-3",
            doctorId = testDoctorId,
            clinicId = "other-clinic-id",
            appointmentDate = testDate.toString(),
            patientName = "Charlie White",
            status = "APPROVED",
            checkinStatus = "waiting"
        )
        val entry3 = QueueEntry(
            id = "entry-3",
            clinicId = "other-clinic-id",
            appointmentId = "appt-3",
            doctorId = testDoctorId,
            queuePosition = 3,
            status = "waiting"
        )

        // Appt 4: Cancelled checkinStatus -> should be excluded
        val appt4 = Appointment(
            id = "appt-4",
            doctorId = testDoctorId,
            clinicId = testClinicId,
            appointmentDate = testDate.toString(),
            patientName = "David Black",
            status = "APPROVED",
            checkinStatus = "cancelled"
        )
        val entry4 = QueueEntry(
            id = "entry-4",
            clinicId = testClinicId,
            appointmentId = "appt-4",
            doctorId = testDoctorId,
            queuePosition = 4,
            status = "waiting"
        )

        fakeQueueRepo.entriesToReturn = listOf(entry1, entry2, entry3, entry4)
        fakeApptRepo.appointmentsToReturn = listOf(appt1, appt2, appt3, appt4)

        viewModel.initialize(testDoctorId, testClinicId, testDate)
        testScheduler.advanceUntilIdle()

        val state = viewModel.uiState.value
        assertEquals("Live queue must only have 1 entry matching doctor and clinic", 1, state.liveQueue.size)
        assertEquals("entry-1", state.liveQueue[0].id)
        assertEquals("Alice Brown", state.liveQueue[0].patientName)
    }

    @Test
    fun testPayAtDeskPendingExclusionAndApprovedInclusion() = runTest(testDispatcher) {
        // Appt 1: Pay at Desk pending approval -> MUST BE EXCLUDED
        val apptPending = Appointment(
            id = "appt-pad-pending",
            doctorId = testDoctorId,
            clinicId = testClinicId,
            appointmentDate = testDate.toString(),
            patientName = "Pending Desk Patient",
            status = "WAITING_FOR_APPROVAL",
            paymentMode = "PAY_AT_DESK",
            paymentStatus = "pending",
            checkinStatus = "waiting"
        )
        val entryPending = QueueEntry(
            id = "entry-pad-pending",
            clinicId = testClinicId,
            appointmentId = "appt-pad-pending",
            doctorId = testDoctorId,
            queuePosition = 1,
            status = "waiting"
        )

        // Appt 2: Pay at Desk approved and paid -> MUST BE INCLUDED
        val apptApprovedPaid = Appointment(
            id = "appt-pad-paid",
            doctorId = testDoctorId,
            clinicId = testClinicId,
            appointmentDate = testDate.toString(),
            patientName = "Approved Paid Patient",
            status = "APPROVED",
            paymentMode = "PAY_AT_DESK",
            paymentStatus = "paid",
            totalAmount = 500.0,
            checkinStatus = "waiting"
        )
        val entryApprovedPaid = QueueEntry(
            id = "entry-pad-paid",
            clinicId = testClinicId,
            appointmentId = "appt-pad-paid",
            doctorId = testDoctorId,
            queuePosition = 2,
            status = "waiting"
        )

        // Appt 3: Pay at Desk approved but payment pending at desk -> MUST BE INCLUDED
        val apptApprovedDue = Appointment(
            id = "appt-pad-due",
            doctorId = testDoctorId,
            clinicId = testClinicId,
            appointmentDate = testDate.toString(),
            patientName = "Approved Due Patient",
            status = "APPROVED",
            paymentMode = "PAY_AT_DESK",
            paymentStatus = "pending",
            totalAmount = 750.0,
            checkinStatus = "waiting"
        )
        val entryApprovedDue = QueueEntry(
            id = "entry-pad-due",
            clinicId = testClinicId,
            appointmentId = "appt-pad-due",
            doctorId = testDoctorId,
            queuePosition = 3,
            status = "waiting"
        )

        fakeQueueRepo.entriesToReturn = listOf(entryPending, entryApprovedPaid, entryApprovedDue)
        fakeApptRepo.appointmentsToReturn = listOf(apptPending, apptApprovedPaid, apptApprovedDue)

        viewModel.initialize(testDoctorId, testClinicId, testDate)
        testScheduler.advanceUntilIdle()

        val state = viewModel.uiState.value
        assertEquals("Must only contain approved Pay at Desk entries (2 items)", 2, state.liveQueue.size)
        assertTrue("Pending Pay at Desk entry must NOT exist in queue", state.liveQueue.none { it.id == "entry-pad-pending" })

        val paidItem = state.liveQueue.first { it.id == "entry-pad-paid" }
        assertEquals("PAY_AT_DESK", paidItem.paymentMode)
        assertEquals("paid", paidItem.paymentStatus)

        val dueItem = state.liveQueue.first { it.id == "entry-pad-due" }
        assertEquals("PAY_AT_DESK", dueItem.paymentMode)
        assertEquals("pending", dueItem.paymentStatus)
        assertEquals(750.0, dueItem.totalAmount, 0.001)
    }

    @Test
    fun testConcurrencyConflictRollbackToCurrentStatus() = runTest(testDispatcher) {
        val appt = Appointment(
            id = "appt-conflict-1",
            doctorId = testDoctorId,
            clinicId = testClinicId,
            appointmentDate = testDate.toString(),
            patientName = "Emma Watson",
            status = "APPROVED",
            checkinStatus = "waiting"
        )
        val entry = QueueEntry(
            id = "entry-conflict-1",
            clinicId = testClinicId,
            appointmentId = "appt-conflict-1",
            doctorId = testDoctorId,
            queuePosition = 1,
            status = "waiting"
        )

        fakeQueueRepo.entriesToReturn = listOf(entry)
        fakeApptRepo.appointmentsToReturn = listOf(appt)

        viewModel.initialize(testDoctorId, testClinicId, testDate)
        testScheduler.advanceUntilIdle()

        val initialLive = viewModel.uiState.value.liveQueue
        assertEquals(1, initialLive.size)
        assertEquals("waiting", initialLive[0].status)

        // Set conflict failure in repository
        fakeQueueRepo.shouldFailConflict = true
        fakeQueueRepo.conflictCurrentStatus = "no_show"
        fakeQueueRepo.conflictMessage = "This entry was just updated"

        // Listen for events
        val receivedEvents = mutableListOf<DoctorQueueEvent>()
        val job = launch {
            viewModel.eventFlow.collect { receivedEvents.add(it) }
        }

        // Call start consultation
        viewModel.startConsultation(initialLive[0])
        testScheduler.advanceUntilIdle()

        // Assert: Rollback occurred
        val state = viewModel.uiState.value
        assertEquals("Live queue must be empty as item is now no_show", 0, state.liveQueue.size)
        assertEquals("Completed queue must contain the rolled-back item", 1, state.completedQueue.size)
        assertEquals("no_show", state.completedQueue[0].status)

        // Assert: Event emitted "This entry was just updated"
        val toastEvent = receivedEvents.filterIsInstance<DoctorQueueEvent.ShowToast>().firstOrNull()
        assertNotNull("ShowToast event must be emitted", toastEvent)
        assertEquals("This entry was just updated", toastEvent?.message)

        job.cancel()
    }

    @Test
    fun testStatBoxComputations() = runTest(testDispatcher) {
        val apptInside = Appointment(
            id = "appt-in",
            doctorId = testDoctorId,
            clinicId = testClinicId,
            appointmentDate = testDate.toString(),
            patientName = "Patient Inside",
            status = "APPROVED",
            checkinStatus = "inside"
        )
        val entryInside = QueueEntry(
            id = "entry-in",
            clinicId = testClinicId,
            appointmentId = "appt-in",
            doctorId = testDoctorId,
            queuePosition = 1,
            status = "inside"
        )

        val apptWait1 = Appointment(
            id = "appt-w1",
            doctorId = testDoctorId,
            clinicId = testClinicId,
            appointmentDate = testDate.toString(),
            patientName = "Patient Wait 1",
            status = "APPROVED",
            checkinStatus = "waiting"
        )
        val entryWait1 = QueueEntry(
            id = "entry-w1",
            clinicId = testClinicId,
            appointmentId = "appt-w1",
            doctorId = testDoctorId,
            queuePosition = 2,
            status = "waiting"
        )

        val apptWait2 = Appointment(
            id = "appt-w2",
            doctorId = testDoctorId,
            clinicId = testClinicId,
            appointmentDate = testDate.toString(),
            patientName = "Patient Wait 2",
            status = "APPROVED",
            checkinStatus = "waiting"
        )
        val entryWait2 = QueueEntry(
            id = "entry-w2",
            clinicId = testClinicId,
            appointmentId = "appt-w2",
            doctorId = testDoctorId,
            queuePosition = 3,
            status = "waiting"
        )

        val apptDone = Appointment(
            id = "appt-dn",
            doctorId = testDoctorId,
            clinicId = testClinicId,
            appointmentDate = testDate.toString(),
            patientName = "Patient Done",
            status = "APPROVED",
            checkinStatus = "completed"
        )
        val entryDone = QueueEntry(
            id = "entry-dn",
            clinicId = testClinicId,
            appointmentId = "appt-dn",
            doctorId = testDoctorId,
            queuePosition = 4,
            status = "done"
        )

        fakeQueueRepo.entriesToReturn = listOf(entryInside, entryWait1, entryWait2, entryDone)
        fakeApptRepo.appointmentsToReturn = listOf(apptInside, apptWait1, apptWait2, apptDone)

        viewModel.initialize(testDoctorId, testClinicId, testDate)
        testScheduler.advanceUntilIdle()

        val state = viewModel.uiState.value
        assertEquals("insideCount must be 1", 1, state.insideCount)
        assertEquals("waitingCount must be 2", 2, state.waitingCount)
        assertEquals("completedTodayCount must be 1", 1, state.completedTodayCount)
    }

    @Test
    fun testBreakToggleOptimisticAndUpdate() = runTest(testDispatcher) {
        viewModel.initialize(testDoctorId, testClinicId, testDate)
        testScheduler.advanceUntilIdle()

        assertFalse("Initial break status should be false", viewModel.uiState.value.isClinicOnBreak)

        // Toggle break ON
        viewModel.toggleBreak(true)
        testScheduler.advanceUntilIdle()

        assertTrue("Break status should be toggled to true", viewModel.uiState.value.isClinicOnBreak)

        // Toggle break OFF
        viewModel.toggleBreak(false)
        testScheduler.advanceUntilIdle()

        assertFalse("Break status should be toggled to false", viewModel.uiState.value.isClinicOnBreak)
    }

    @Test
    fun testOverloadedSlotsDetection() = runTest(testDispatcher) {
        val slot1 = Slot(
            id = "slot-1",
            clinicId = testClinicId,
            doctorId = testDoctorId,
            slotDate = testDate.toString(),
            startTime = "09:00 AM",
            endTime = "10:00 AM",
            maxCapacity = 12,
            bookedCount = 13 // OVERLOADED (13/12)
        )
        val slot2 = Slot(
            id = "slot-2",
            clinicId = testClinicId,
            doctorId = testDoctorId,
            slotDate = testDate.toString(),
            startTime = "10:00 AM",
            endTime = "11:00 AM",
            maxCapacity = 10,
            bookedCount = 5 // Normal (5/10)
        )

        fakeSlotRepo.slotsToReturn = listOf(slot1, slot2)

        viewModel.initialize(testDoctorId, testClinicId, testDate)
        testScheduler.advanceUntilIdle()

        val state = viewModel.uiState.value
        val overloaded = state.overloadedSlots
        assertTrue("Overloaded slot '09:00 AM - 10:00 AM' must be detected", overloaded.containsKey("09:00 AM - 10:00 AM"))
        assertEquals(Pair(13, 12), overloaded["09:00 AM - 10:00 AM"])
        assertFalse("Slot 2 (5/10) must not be flagged as overloaded", overloaded.containsKey("10:00 AM - 11:00 AM"))
    }

    @Test
    fun testHoldOrSkipMovesItemToCompleted() = runTest(testDispatcher) {
        val appt = Appointment(
            id = "appt-skip",
            doctorId = testDoctorId,
            clinicId = testClinicId,
            appointmentDate = testDate.toString(),
            patientName = "Skip Patient",
            status = "APPROVED",
            checkinStatus = "waiting"
        )
        val entry = QueueEntry(
            id = "entry-skip",
            clinicId = testClinicId,
            appointmentId = "appt-skip",
            doctorId = testDoctorId,
            queuePosition = 1,
            status = "waiting"
        )

        fakeQueueRepo.entriesToReturn = listOf(entry)
        fakeApptRepo.appointmentsToReturn = listOf(appt)

        viewModel.initialize(testDoctorId, testClinicId, testDate)
        testScheduler.advanceUntilIdle()

        assertEquals(1, viewModel.uiState.value.liveQueue.size)

        val itemToSkip = viewModel.uiState.value.liveQueue[0]
        viewModel.holdOrSkip(itemToSkip, newStatus = "no_show")
        testScheduler.advanceUntilIdle()

        val state = viewModel.uiState.value
        assertEquals("Live queue must be 0 after skipping", 0, state.liveQueue.size)
        assertEquals("Completed queue must contain the skipped patient", 1, state.completedQueue.size)
        assertEquals("no_show", state.completedQueue[0].status)
    }

    // ── Test Doubles ──────────────────────────────────────────────────

    class TestQueueRepository(
        client: SupabaseClient,
        clinicRepo: ClinicRepository
    ) : QueueRepository(client, clinicRepo) {
        var entriesToReturn: List<QueueEntry> = emptyList()
        var deltaEntriesToReturn: List<QueueEntry> = emptyList()

        var shouldFailConflict: Boolean = false
        var conflictCurrentStatus: String = "no_show"
        var conflictMessage: String = "This entry was just updated"

        override suspend fun getQueueForDoctor(
            doctorId: String,
            clinicId: String?,
            forceRefresh: Boolean
        ): List<QueueEntry> {
            return entriesToReturn
        }

        override suspend fun syncQueueDeltaForDoctor(
            doctorId: String,
            clinicId: String?
        ): List<QueueEntry> {
            return deltaEntriesToReturn.ifEmpty { entriesToReturn }
        }

        override suspend fun transitionQueueEntryStatus(
            entryId: String,
            expectedStatus: String,
            newStatus: String,
            actorType: String,
            actorId: String
        ): TransitionQueueEntryStatusResult {
            if (shouldFailConflict) {
                entriesToReturn = entriesToReturn.map {
                    if (it.id == entryId) it.copy(status = conflictCurrentStatus) else it
                }
                throw QueueConflictException(
                    message = conflictMessage,
                    currentStatus = conflictCurrentStatus
                )
            }
            return TransitionQueueEntryStatusResult(
                success = true,
                entryId = entryId,
                status = newStatus,
                updatedByActorType = actorType,
                updatedByActorId = actorId
            )
        }

        override fun observeDoctorQueueRealtime(doctorId: String, clinicId: String): Flow<Unit> {
            return flowOf(Unit)
        }

        override suspend fun autoTransferUncompletedQueueToNoShow(
            clinicId: String,
            includeTodayExpired: Boolean,
            todayCutoffMinutes: Int
        ): Int {
            return 0
        }

        override suspend fun notifyCallInside(
            appointmentId: String,
            patientName: String,
            doctorName: String,
            trackingCode: String?,
            roomNumber: String?
        ): Boolean = true

        override suspend fun sendManualNotification(
            appointmentId: String,
            title: String,
            message: String,
            trackingCode: String?,
            estimatedTimeLeft: String?,
            expectedTime: String?,
            leftLabel: String,
            rightLabel: String,
            type: String
        ): Boolean = true

        override suspend fun reorderQueue(orderedEntries: List<QueueEntry>): Boolean = true

        override suspend fun sendClinicBreakNotificationsToActiveAppointments(
            clinicId: String,
            clinicName: String,
            breakWindowText: String?
        ): Int = 0
    }

    class TestAppointmentRepository(
        client: SupabaseClient
    ) : AppointmentRepository(client) {
        var appointmentsToReturn: List<Appointment> = emptyList()

        override suspend fun getAppointmentsByDoctor(
            doctorId: String,
            date: String?,
            forceRefresh: Boolean
        ): List<Appointment> {
            return appointmentsToReturn
        }

        override suspend fun updateCheckinStatus(id: String, status: String): Boolean = true
    }

    class TestDoctorRepository(
        client: SupabaseClient
    ) : DoctorRepository(client) {
        var doctorToReturn: Doctor = Doctor(
            id = "doc-uuid-101",
            fullName = "Dr. Alice Smith",
            email = "alice@example.com",
            specialty = "Cardiology"
        )

        override fun getCachedDoctorById(id: String): Doctor? = doctorToReturn

        override suspend fun getDoctorById(id: String): Doctor? = doctorToReturn
    }

    class TestClinicRepository(
        client: SupabaseClient
    ) : ClinicRepository(client) {
        var clinicToReturn: Clinic = Clinic(
            id = "clinic-uuid-202",
            name = "City Health Clinic",
            isOnBreak = false
        )

        override suspend fun getClinicById(clinicId: String): Clinic? = clinicToReturn

        override suspend fun toggleClinicBreak(clinicId: String, isOnBreak: Boolean): Clinic? {
            clinicToReturn = clinicToReturn.copy(isOnBreak = isOnBreak)
            return clinicToReturn
        }
    }

    class TestSlotRepository(
        client: SupabaseClient
    ) : SlotRepository(client) {
        var slotsToReturn: List<Slot> = emptyList()

        override suspend fun getSlots(clinicId: String, date: String): List<Slot> {
            return slotsToReturn
        }
    }

    class TestNetworkMonitor : NetworkMonitor() {
        var isOnlineVal = true

        override fun isOnline(): Boolean = isOnlineVal

        override fun isOnlineFlow(): Flow<Boolean> = flowOf(isOnlineVal)
    }
}
