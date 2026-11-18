package com.dactor.clinic.ui.queue.model

import com.dactor.clinic.ui.queue.QueueItemUi
import java.time.LocalDate

data class DoctorQueueUiState(
    val isLoading: Boolean = true,
    val isRefreshing: Boolean = false,
    val doctorId: String = "",
    val clinicId: String = "",
    val doctorName: String = "",
    val currentDate: LocalDate = LocalDate.now(),
    val selectedDate: String = LocalDate.now().toString(),
    val selectedTab: Int = 0, // 0: Live, 1: Completed
    val isClinicOnBreak: Boolean = false,
    val liveQueue: List<QueueItemUi> = emptyList(),
    val completedQueue: List<QueueItemUi> = emptyList(),
    val insideCount: Int = 0,
    val waitingCount: Int = 0,
    val completedTodayCount: Int = 0,
    val overloadedSlots: Map<String, Pair<Int, Int>> = emptyMap(), // slotTime -> Pair(bookedCount, maxCapacity)
    val isOnline: Boolean = true,
    val errorMessage: String? = null,
    val rolloverMessage: String? = null,
    val alertCooldownUntilEpoch: Map<String, Long> = emptyMap(), // itemId -> epochMillis
    val inFlightAlerts: Set<String> = emptySet(), // itemIds currently dispatching notification
    val alertSentBadges: Map<String, String> = emptyMap() // itemId -> badge label e.g. "Alert Sent"
)

sealed interface DoctorQueueEvent {
    data class ShowToast(val message: String) : DoctorQueueEvent
    data class ShowError(val message: String) : DoctorQueueEvent
    object ScrollToTop : DoctorQueueEvent
}
