package com.dactor.clinic.ui.queue

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.dactor.clinic.data.model.Appointment
import com.dactor.clinic.data.model.QueueEntry
import com.dactor.clinic.data.repository.AppointmentRepository
import com.dactor.clinic.data.repository.ClinicRepository
import com.dactor.clinic.data.repository.DoctorRepository
import com.dactor.clinic.data.repository.QueueRepository
import com.dactor.clinic.data.repository.SlotRepository
import com.dactor.clinic.data.util.NetworkMonitor
import com.dactor.clinic.domain.model.QueueConflictException
import com.dactor.clinic.domain.usecase.queue.*
import com.dactor.clinic.ui.queue.model.DoctorQueueEvent
import com.dactor.clinic.ui.queue.model.DoctorQueueUiState
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import java.time.Instant
import java.time.LocalDate
import java.util.concurrent.ConcurrentHashMap
import javax.inject.Inject

@HiltViewModel
class DoctorQueueViewModel @Inject constructor(
    private val queueRepository: QueueRepository,
    private val doctorRepository: DoctorRepository,
    private val appointmentRepository: AppointmentRepository,
    private val clinicRepository: ClinicRepository,
    private val slotRepository: SlotRepository,
    private val networkMonitor: NetworkMonitor,
    private val startConsultationUseCase: StartConsultationUseCase,
    private val completeConsultationUseCase: CompleteConsultationUseCase,
    private val holdOrSkipQueueEntryUseCase: HoldOrSkipQueueEntryUseCase,
    private val reorderQueueUseCase: ReorderQueueUseCase,
    private val addWalkinQueueEntryUseCase: AddWalkinQueueEntryUseCase,
    private val toggleBreakUseCase: ToggleBreakUseCase,
    private val sendPatientQueueAlertUseCase: SendPatientQueueAlertUseCase
) : ViewModel() {

    private val _uiState = MutableStateFlow(DoctorQueueUiState())
    val uiState: StateFlow<DoctorQueueUiState> = _uiState.asStateFlow()

    private val _eventFlow = MutableSharedFlow<DoctorQueueEvent>(extraBufferCapacity = 64)
    val eventFlow: SharedFlow<DoctorQueueEvent> = _eventFlow.asSharedFlow()
    val events: SharedFlow<DoctorQueueEvent> get() = eventFlow

    private var realtimeJob: Job? = null
    private var networkMonitorJob: Job? = null
    private val pendingOverrides = ConcurrentHashMap<String, Pair<String, Long>>()
    private var cachedToday: LocalDate = LocalDate.now()

    init {
        monitorNetworkRestoration()
    }

    fun initialize(doctorId: String, clinicId: String, initialDate: LocalDate = LocalDate.now()) {
        if (doctorId.isBlank() && clinicId.isBlank()) return
        val current = _uiState.value
        if (current.doctorId == doctorId && current.clinicId == clinicId && current.selectedDate == initialDate.toString()) {
            return
        }

        cachedToday = LocalDate.now()
        val docName = doctorRepository.getCachedDoctorById(doctorId)?.fullName.orEmpty()
        _uiState.update {
            it.copy(
                doctorId = doctorId,
                clinicId = clinicId,
                doctorName = docName,
                selectedDate = initialDate.toString(),
                currentDate = cachedToday,
                isLoading = true
            )
        }

        viewModelScope.launch {
            if (docName.isBlank()) {
                val fetchedDoc = doctorRepository.getDoctorById(doctorId)
                if (fetchedDoc != null) {
                    _uiState.update { it.copy(doctorName = fetchedDoc.fullName) }
                }
            }
        }

        loadDoctorQueue(forceRefresh = true)
        startRealtimeSubscription()
    }

    fun setSelectedDate(date: LocalDate) {
        if (_uiState.value.selectedDate == date.toString()) return
        _uiState.update { it.copy(selectedDate = date.toString(), isLoading = true) }
        loadDoctorQueue(forceRefresh = true)
    }

    fun onDateSelected(date: LocalDate) = setSelectedDate(date)

    fun setSelectedTab(tabIndex: Int) {
        _uiState.update { it.copy(selectedTab = tabIndex) }
    }

    fun onTabSelected(tabIndex: Int) = setSelectedTab(tabIndex)

    fun loadDoctorQueue(forceRefresh: Boolean = false, isDeltaOnly: Boolean = false) {
        val s = _uiState.value
        if (s.doctorId.isBlank() || s.clinicId.isBlank()) return

        viewModelScope.launch {
            if (!isDeltaOnly && (s.liveQueue.isEmpty() && s.completedQueue.isEmpty())) {
                _uiState.update { it.copy(isLoading = true) }
            } else if (!isDeltaOnly) {
                _uiState.update { it.copy(isRefreshing = true) }
            }

            try {
                // 1. Fetch clinic break status
                val clinic = clinicRepository.getClinicById(s.clinicId)
                val isBreak = clinic?.isOnBreak == true

                // 2. Fetch doctor queue entries & appointments for doctor and clinic
                val entries = if (isDeltaOnly) {
                    queueRepository.syncQueueDeltaForDoctor(s.doctorId, s.clinicId)
                } else {
                    queueRepository.getQueueForDoctor(s.doctorId, s.clinicId, forceRefresh = forceRefresh)
                }

                val appts = appointmentRepository.getAppointmentsByDoctor(s.doctorId, s.selectedDate)

                // 3. Strict filter: Only approved appointments for current doctor and clinic on selectedDate
                // Pay at Desk: Filter out WAITING_FOR_APPROVAL
                val approvedApptMap = appts.filter { appt ->
                    appt.doctorId == s.doctorId &&
                    appt.clinicId == s.clinicId &&
                    appt.appointmentDate == s.selectedDate &&
                    appt.status.equals("APPROVED", ignoreCase = true) &&
                    !appt.status.equals("WAITING_FOR_APPROVAL", ignoreCase = true) &&
                    !appt.status.equals("pending_payment", ignoreCase = true) &&
                    !appt.status.equals("UNAPPROVED", ignoreCase = true) &&
                    !appt.status.equals("EXPIRED", ignoreCase = true) &&
                    appt.checkinStatus != "cancelled"
                }.associateBy { it.id }

                // 4. Overloaded slots detection
                val slots = try {
                    slotRepository.getSlots(s.clinicId, s.selectedDate)
                } catch (_: Exception) {
                    emptyList()
                }
                val doctorSlots = slots.filter { it.doctorId == null || it.doctorId == s.doctorId }
                val overloadedMap = mutableMapOf<String, Pair<Int, Int>>()
                for (slot in doctorSlots) {
                    if (slot.bookedCount > slot.maxCapacity) {
                        val pair = Pair(slot.bookedCount, slot.maxCapacity)
                        overloadedMap["${slot.startTime} - ${slot.endTime}"] = pair
                        overloadedMap[slot.startTime] = pair
                    }
                }

                // 5. Map entries
                val nowMs = System.currentTimeMillis()
                val activeOverrides = pendingOverrides.filterValues { it.second > nowMs }

                val mapped = entries.mapNotNull { entry ->
                    val appt = approvedApptMap[entry.appointmentId] ?: return@mapNotNull null
                    val apptCheckinLower = appt.checkinStatus?.lowercase().orEmpty()
                    val serverStatus = when {
                        entry.status in listOf("waiting", "inside") && apptCheckinLower in listOf("completed", "done") -> "done"
                        entry.status in listOf("waiting", "inside") && apptCheckinLower == "processing" -> "processing"
                        entry.status in listOf("waiting", "inside") && apptCheckinLower == "sample_collected" -> "sample_collected"
                        entry.status in listOf("waiting", "inside", "processing") && apptCheckinLower == "report_prepared" -> "report_prepared"
                        else -> entry.status
                    }
                    val override = activeOverrides[entry.id]
                    val effectiveStatus = override?.first ?: serverStatus

                    QueueItemUi(
                        id = entry.id,
                        appointmentId = entry.appointmentId,
                        patientName = appt.patientName,
                        patientAge = appt.patientAge ?: 0,
                        patientGender = appt.patientGender.orEmpty(),
                        patientMobile = appt.patientMobile.orEmpty(),
                        trackingCode = appt.trackingCode10Digit ?: entry.appointmentId.take(8),
                        queuePosition = entry.queuePosition,
                        status = effectiveStatus,
                        appointmentDate = appt.appointmentDate.orEmpty(),
                        appointmentTime = appt.appointmentTime.orEmpty(),
                        insideAt = entry.insideAt,
                        calledAt = entry.calledAt,
                        completedAt = entry.completedAt,
                        consultationDurationSeconds = entry.consultationDurationSeconds,
                        selectedLabTests = appt.selectedLabTests,
                        optInEarlyCall = appt.optInEarlyCall,
                        doctorId = entry.doctorId ?: appt.doctorId,
                        doctorName = s.doctorName,
                        paymentMode = appt.paymentMode,
                        paymentStatus = appt.paymentStatus,
                        totalAmount = if (appt.totalAmount > 0.0) appt.totalAmount else appt.feeAmount,
                        userId = appt.userId,
                        isWalkin = appt.isWalkin
                    )
                }

                // Clean overrides that are now reflected
                activeOverrides.forEach { (id, pair) ->
                    if (mapped.any { it.id == id && it.status == pair.first }) {
                        pendingOverrides.remove(id)
                    }
                }

                val live = mapped.filter { it.status == "waiting" || it.status == "inside" }
                    .sortedWith(compareBy<QueueItemUi> { if (it.status == "inside") 0 else 1 }.thenBy { it.queuePosition })
                    .mapIndexed { idx, item -> item.copy(queuePosition = idx + 1) }

                val completed = mapped.filter { it.status in setOf("done", "report_prepared", "no_show", "processing") }
                    .sortedByDescending { it.completedAt ?: "" }

                _uiState.update { current ->
                    current.copy(
                        isLoading = false,
                        isRefreshing = false,
                        isClinicOnBreak = isBreak,
                        liveQueue = live,
                        completedQueue = completed,
                        insideCount = live.count { it.status == "inside" },
                        waitingCount = live.count { it.status == "waiting" },
                        completedTodayCount = completed.count { it.status == "done" || it.status == "report_prepared" },
                        overloadedSlots = overloadedMap,
                        errorMessage = null
                    )
                }
            } catch (e: Exception) {
                _uiState.update {
                    it.copy(isLoading = false, isRefreshing = false, errorMessage = e.message)
                }
            }
        }
    }

    // ── Concurrency & Optimistic Actions ──────────────────────────────

    fun startConsultation(item: QueueItemUi) {
        val s = _uiState.value
        val expectedStatus = item.status
        val nowIso = Instant.now().toString()

        // 1. Optimistic UI update
        pendingOverrides[item.id] = "inside" to (System.currentTimeMillis() + 15_000L)
        val updatedLive = s.liveQueue.map {
            if (it.id == item.id) it.copy(status = "inside", insideAt = nowIso) else it
        }.sortedWith(compareBy<QueueItemUi> { if (it.status == "inside") 0 else 1 }.thenBy { it.queuePosition })

        _uiState.update {
            it.copy(
                liveQueue = updatedLive,
                insideCount = updatedLive.count { it.status == "inside" },
                waitingCount = updatedLive.count { it.status == "waiting" }
            )
        }

        // 2. Invoke Use Case
        viewModelScope.launch {
            val result = startConsultationUseCase(
                entryId = item.id,
                appointmentId = item.appointmentId,
                expectedStatus = expectedStatus,
                actorType = "doctor",
                actorId = s.doctorId,
                clinicId = s.clinicId,
                patientName = item.patientName,
                doctorName = s.doctorName,
                trackingCode = item.trackingCode
            )

            if (result.isFailure) {
                val ex = result.exceptionOrNull()
                if (ex is QueueConflictException) {
                    // 3. Rollback to conflict.currentStatus
                    handleRollback(item.id, ex.currentStatus)
                    _eventFlow.emit(DoctorQueueEvent.ShowToast("This entry was just updated"))
                    loadDoctorQueue(isDeltaOnly = true)
                } else {
                    handleRollback(item.id, expectedStatus)
                    _eventFlow.emit(DoctorQueueEvent.ShowError(ex?.message ?: "Failed to start consultation"))
                }
            }
        }
    }

    fun completeConsultation(item: QueueItemUi, isDiagnosticLab: Boolean = false) {
        val s = _uiState.value
        val expectedStatus = item.status
        val targetStatus = if (isDiagnosticLab) "processing" else "done"
        val nowIso = Instant.now().toString()

        // 1. Optimistic UI update
        pendingOverrides[item.id] = targetStatus to (System.currentTimeMillis() + 15_000L)
        val completedItem = item.copy(status = targetStatus, completedAt = nowIso)
        val updatedLive = s.liveQueue.filter { it.id != item.id }
        val updatedCompleted = listOf(completedItem) + s.completedQueue.filter { it.id != item.id }

        _uiState.update {
            it.copy(
                liveQueue = updatedLive,
                completedQueue = updatedCompleted,
                insideCount = updatedLive.count { it.status == "inside" },
                waitingCount = updatedLive.count { it.status == "waiting" },
                completedTodayCount = updatedCompleted.count { it.status == "done" || it.status == "report_prepared" }
            )
        }

        // 2. Invoke Use Case
        viewModelScope.launch {
            val result = completeConsultationUseCase(
                entryId = item.id,
                appointmentId = item.appointmentId,
                expectedStatus = expectedStatus,
                actorType = "doctor",
                actorId = s.doctorId,
                clinicId = s.clinicId,
                isDiagnosticLab = isDiagnosticLab,
                patientName = item.patientName,
                selectedLabTests = item.selectedLabTests
            )

            if (result.isFailure) {
                val ex = result.exceptionOrNull()
                if (ex is QueueConflictException) {
                    handleRollback(item.id, ex.currentStatus)
                    _eventFlow.emit(DoctorQueueEvent.ShowToast("This entry was just updated"))
                    loadDoctorQueue(isDeltaOnly = true)
                } else {
                    handleRollback(item.id, expectedStatus)
                    _eventFlow.emit(DoctorQueueEvent.ShowError(ex?.message ?: "Failed to complete consultation"))
                }
            } else {
                _eventFlow.emit(DoctorQueueEvent.ShowToast("Consultation completed for ${item.patientName}"))
            }
        }
    }

    fun holdOrSkip(item: QueueItemUi, newStatus: String = "no_show") {
        val s = _uiState.value
        val expectedStatus = item.status

        // 1. Optimistic update
        pendingOverrides[item.id] = newStatus to (System.currentTimeMillis() + 15_000L)
        val updatedItem = item.copy(status = newStatus)
        val updatedLive = s.liveQueue.filter { it.id != item.id }
        val updatedCompleted = listOf(updatedItem) + s.completedQueue.filter { it.id != item.id }

        _uiState.update {
            it.copy(
                liveQueue = updatedLive,
                completedQueue = updatedCompleted,
                insideCount = updatedLive.count { it.status == "inside" },
                waitingCount = updatedLive.count { it.status == "waiting" }
            )
        }

        // 2. Invoke Use Case
        viewModelScope.launch {
            val result = holdOrSkipQueueEntryUseCase(
                entryId = item.id,
                appointmentId = item.appointmentId,
                expectedStatus = expectedStatus,
                newStatus = newStatus,
                actorType = "doctor",
                actorId = s.doctorId,
                clinicId = s.clinicId
            )

            if (result.isFailure) {
                val ex = result.exceptionOrNull()
                if (ex is QueueConflictException) {
                    handleRollback(item.id, ex.currentStatus)
                    _eventFlow.emit(DoctorQueueEvent.ShowToast("This entry was just updated"))
                    loadDoctorQueue(isDeltaOnly = true)
                } else {
                    handleRollback(item.id, expectedStatus)
                    _eventFlow.emit(DoctorQueueEvent.ShowError(ex?.message ?: "Failed to skip queue entry"))
                }
            }
        }
    }

    private fun handleRollback(itemId: String, rollbackStatus: String) {
        pendingOverrides.remove(itemId)
        val s = _uiState.value
        val allItems = s.liveQueue + s.completedQueue
        val target = allItems.firstOrNull { it.id == itemId } ?: return
        val restoredItem = target.copy(status = rollbackStatus)

        val updatedLive = (allItems.filter { it.id != itemId } + if (rollbackStatus in listOf("waiting", "inside")) listOf(restoredItem) else emptyList())
            .filter { it.status in listOf("waiting", "inside") }
            .sortedWith(compareBy<QueueItemUi> { if (it.status == "inside") 0 else 1 }.thenBy { it.queuePosition })
        val updatedCompleted = (allItems.filter { it.id != itemId } + if (rollbackStatus !in listOf("waiting", "inside")) listOf(restoredItem) else emptyList())
            .filter { it.status in setOf("done", "report_prepared", "no_show", "processing") }

        _uiState.update {
            it.copy(
                liveQueue = updatedLive,
                completedQueue = updatedCompleted,
                insideCount = updatedLive.count { it.status == "inside" },
                waitingCount = updatedLive.count { it.status == "waiting" },
                completedTodayCount = updatedCompleted.count { it.status == "done" || it.status == "report_prepared" }
            )
        }
    }

    fun toggleBreak(isOnBreak: Boolean? = null) {
        val s = _uiState.value
        val targetBreak = isOnBreak ?: !s.isClinicOnBreak
        val previousBreak = s.isClinicOnBreak

        // Optimistic toggle
        _uiState.update { it.copy(isClinicOnBreak = targetBreak) }

        viewModelScope.launch {
            val result = toggleBreakUseCase(
                clinicId = s.clinicId,
                isOnBreak = targetBreak,
                doctorId = s.doctorId
            )
            if (result.isFailure) {
                _uiState.update { it.copy(isClinicOnBreak = previousBreak) }
                _eventFlow.emit(DoctorQueueEvent.ShowError("Failed to update break status"))
            } else {
                val msg = if (targetBreak) "Doctor is now on break" else "Break ended. Queue resumed."
                _eventFlow.emit(DoctorQueueEvent.ShowToast(msg))
            }
        }
    }

    fun onToggleBreak() = toggleBreak()

    fun reorderQueue(reorderedLive: List<QueueItemUi>) {
        val s = _uiState.value
        val previousOrder = s.liveQueue

        val normalized = reorderedLive.mapIndexed { idx, itm -> itm.copy(queuePosition = idx + 1) }
        _uiState.update { it.copy(liveQueue = normalized) }

        viewModelScope.launch {
            val result = reorderQueueUseCase(
                clinicId = s.clinicId,
                items = normalized,
                doctorId = s.doctorId
            )
            if (result.isFailure) {
                _uiState.update { it.copy(liveQueue = previousOrder) }
                _eventFlow.emit(DoctorQueueEvent.ShowError("Failed to persist queue reorder"))
            }
        }
    }

    fun sendWalkInAlert(item: QueueItemUi) {
        sendPatientNotification(item, alertType = "arrive_soon")
    }

    fun sendCallInAlert(item: QueueItemUi, roomNumber: String? = null) {
        sendPatientNotification(item, alertType = "call_inside", roomNumber = roomNumber)
    }

    fun sendPatientNotification(
        item: QueueItemUi,
        alertType: String,
        roomNumber: String? = null
    ) {
        val s = _uiState.value

        // Guard 1: Must be an active live queue status
        if (item.status !in listOf("waiting", "inside")) {
            return
        }

        // Guard 2: Walk-in without account check
        if (item.isWalkin && item.userId.isNullOrBlank()) {
            viewModelScope.launch {
                _eventFlow.emit(DoctorQueueEvent.ShowError("Walk-in patient has no app account"))
            }
            return
        }

        // Guard 3: Prevent duplicate concurrent in-flight dispatches
        if (s.inFlightAlerts.contains(item.id)) {
            return
        }

        // Guard 4: 60-second cooldown verification
        val now = System.currentTimeMillis()
        val cooldownUntil = s.alertCooldownUntilEpoch[item.id] ?: 0L
        if (now < cooldownUntil) {
            val remainingSec = ((cooldownUntil - now) / 1000L).coerceAtLeast(1)
            viewModelScope.launch {
                _eventFlow.emit(DoctorQueueEvent.ShowError("Alert recently sent. Please wait $remainingSec seconds before sending again."))
            }
            return
        }

        // Track in-flight sending state
        _uiState.update { current ->
            current.copy(inFlightAlerts = current.inFlightAlerts + item.id)
        }

        viewModelScope.launch {
            val result = sendPatientQueueAlertUseCase(
                item = item,
                alertType = alertType,
                doctorId = s.doctorId,
                doctorName = s.doctorName,
                roomNumber = roomNumber,
                cooldownSeconds = 60L
            )

            if (result.isSuccess) {
                val newCooldownExpiry = System.currentTimeMillis() + 60_000L
                val badgeText = if (alertType.lowercase().contains("call")) "Call In Sent" else "Alert Sent"
                _uiState.update { current ->
                    current.copy(
                        inFlightAlerts = current.inFlightAlerts - item.id,
                        alertCooldownUntilEpoch = current.alertCooldownUntilEpoch + (item.id to newCooldownExpiry),
                        alertSentBadges = current.alertSentBadges + (item.id to badgeText)
                    )
                }
                val actionName = if (alertType.lowercase().contains("call")) "Call In alert" else "Walk In alert"
                _eventFlow.emit(DoctorQueueEvent.ShowToast("$actionName sent to ${item.patientName}"))
            } else {
                _uiState.update { current ->
                    current.copy(inFlightAlerts = current.inFlightAlerts - item.id)
                }
                val err = result.exceptionOrNull()?.message ?: "Failed to send notification"
                _eventFlow.emit(DoctorQueueEvent.ShowError(err))
            }
        }
    }

    // ── Realtime & Lifecycle Management ──────────────────────────────

    fun startRealtimeSubscription() {
        realtimeJob?.cancel()
        val s = _uiState.value
        if (s.doctorId.isBlank() || s.clinicId.isBlank()) return

        realtimeJob = viewModelScope.launch {
            queueRepository.observeDoctorQueueRealtime(s.doctorId, s.clinicId)
                .collect {
                    loadDoctorQueue(isDeltaOnly = true)
                }
        }
    }

    fun stopRealtimeSubscription() {
        realtimeJob?.cancel()
        realtimeJob = null
    }

    private fun monitorNetworkRestoration() {
        networkMonitorJob = viewModelScope.launch {
            var wasOffline = !networkMonitor.isOnline()
            networkMonitor.isOnlineFlow().collect { isOnline ->
                _uiState.update { it.copy(isOnline = isOnline) }
                if (isOnline && wasOffline) {
                    loadDoctorQueue(forceRefresh = true)
                    startRealtimeSubscription()
                }
                wasOffline = !isOnline
            }
        }
    }

    fun onAppResumed() {
        checkMidnightRollover()
        if (realtimeJob == null || realtimeJob?.isActive == false) {
            startRealtimeSubscription()
        }
        loadDoctorQueue(forceRefresh = true)
    }

    fun onTickSecond() {
        checkMidnightRollover()
    }

    private fun checkMidnightRollover() {
        val now = LocalDate.now()
        if (now != cachedToday) {
            val previousToday = cachedToday
            cachedToday = now
            val wasOnToday = (_uiState.value.selectedDate == previousToday.toString())

            _uiState.update { state ->
                state.copy(
                    currentDate = now,
                    selectedDate = if (wasOnToday) now.toString() else state.selectedDate,
                    rolloverMessage = if (wasOnToday) "Date advanced to Today ($now)" else null
                )
            }

            viewModelScope.launch {
                try {
                    queueRepository.autoTransferUncompletedQueueToNoShow(
                        _uiState.value.clinicId,
                        includeTodayExpired = true
                    )
                } catch (_: Exception) {}
                loadDoctorQueue(forceRefresh = true)
            }
        }
    }

    override fun onCleared() {
        super.onCleared()
        stopRealtimeSubscription()
        networkMonitorJob?.cancel()
    }
}
