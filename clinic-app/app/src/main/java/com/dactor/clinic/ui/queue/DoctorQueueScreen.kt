package com.dactor.clinic.ui.queue

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.navigation.NavController
import com.dactor.clinic.ui.queue.components.DoctorQueueItemCard
import com.dactor.clinic.ui.queue.components.DoctorQueueTabsRow
import com.dactor.clinic.ui.queue.components.QueueDateScroller
import com.dactor.clinic.ui.queue.components.QueueStatCards
import com.dactor.clinic.ui.queue.model.DoctorQueueEvent
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.isActive
import java.time.LocalDate

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DoctorQueueScreen(
    navController: NavController,
    doctorId: String,
    clinicId: String,
    viewModel: DoctorQueueViewModel = hiltViewModel()
) {
    val snackbarHostState = remember { SnackbarHostState() }

    Scaffold(
        snackbarHost = { SnackbarHost(snackbarHostState) },
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text(
                            text = "Live Queue Board",
                            fontWeight = FontWeight.Bold,
                            fontSize = 18.sp
                        )
                        val uiState by viewModel.uiState.collectAsState()
                        if (uiState.doctorName.isNotBlank()) {
                            Text(
                                text = "Dr. ${uiState.doctorName}",
                                fontSize = 12.sp,
                                color = Color(0xFF64748B)
                            )
                        }
                    }
                },
                navigationIcon = {
                    IconButton(onClick = { navController.popBackStack() }) {
                        Icon(Icons.Default.ArrowBack, contentDescription = "Back")
                    }
                },
                actions = {
                    IconButton(onClick = { viewModel.loadDoctorQueue(forceRefresh = true) }) {
                        Icon(Icons.Default.Refresh, contentDescription = "Refresh")
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.surface)
            )
        }
    ) { padding ->
        DoctorLiveQueueContent(
            navController = navController,
            doctorId = doctorId,
            clinicId = clinicId,
            viewModel = viewModel,
            snackbarHostState = snackbarHostState,
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
        )
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
fun DoctorLiveQueueContent(
    navController: NavController,
    doctorId: String,
    clinicId: String,
    viewModel: DoctorQueueViewModel,
    snackbarHostState: SnackbarHostState? = null,
    modifier: Modifier = Modifier
) {
    val uiState by viewModel.uiState.collectAsState()
    val lifecycleOwner = LocalLifecycleOwner.current
    var expandedItemId by remember { mutableStateOf<String?>(null) }
    var currentEpochSecond by remember { mutableLongStateOf(System.currentTimeMillis() / 1000L) }
    var pendingAlertConfirmation by remember { mutableStateOf<Pair<QueueItemUi, String>?>(null) }

    // Initialize ViewModel when doctorId or clinicId changes
    LaunchedEffect(doctorId, clinicId) {
        viewModel.initialize(doctorId, clinicId)
    }

    // Unsubscribe and stop realtime on disposal
    DisposableEffect(doctorId, clinicId) {
        onDispose {
            viewModel.stopRealtimeSubscription()
        }
    }

    // Lifecycle observer for ON_RESUME refresh and midnight rollover
    DisposableEffect(lifecycleOwner) {
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_RESUME) {
                viewModel.onAppResumed()
            }
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose {
            lifecycleOwner.lifecycle.removeObserver(observer)
        }
    }

    // 1-second ticking timer for elapsed times, midnight rollover, and targeted 2s upcoming queue refresh
    LaunchedEffect(Unit) {
        var tickCount = 0
        while (isActive) {
            try {
                delay(1000L)
                currentEpochSecond = System.currentTimeMillis() / 1000L
                viewModel.onTickSecond()
                tickCount++
                if (tickCount % 2 == 0) {
                    viewModel.refreshUpcomingPatientsAndCheckNew()
                }
            } catch (e: Exception) {
                android.util.Log.e("DoctorQueueScreen", "Tick timer exception", e)
            }
        }
    }

    // Collect events (toasts, error snackbars)
    LaunchedEffect(viewModel) {
        viewModel.eventFlow.collectLatest { event ->
            when (event) {
                is DoctorQueueEvent.ShowToast -> {
                    snackbarHostState?.showSnackbar(event.message, withDismissAction = true)
                }
                is DoctorQueueEvent.ShowError -> {
                    snackbarHostState?.showSnackbar(event.message, withDismissAction = true)
                }
                DoctorQueueEvent.ScrollToTop -> {}
            }
        }
    }

    if (clinicId.isBlank()) {
        Box(
            modifier = modifier.fillMaxSize().padding(24.dp),
            contentAlignment = Alignment.Center
        ) {
            Surface(
                shape = RoundedCornerShape(16.dp),
                color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f),
                modifier = Modifier.fillMaxWidth()
            ) {
                Column(
                    modifier = Modifier.padding(20.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    Icon(
                        Icons.Default.LocalHospital,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.primary,
                        modifier = Modifier.size(36.dp)
                    )
                    Text(
                        "No Active Clinic Selected",
                        fontWeight = FontWeight.Bold,
                        fontSize = 16.sp
                    )
                    Text(
                        "Please select or affiliate with a clinic to monitor live patient queues.",
                        fontSize = 12.sp,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        textAlign = androidx.compose.ui.text.style.TextAlign.Center
                    )
                }
            }
        }
        return
    }

    Box(modifier = modifier.fillMaxSize()) {
        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(start = 14.dp, end = 14.dp, top = 8.dp, bottom = 24.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            // 1. Compact Stat Boxes
            item(key = "stat_cards") {
                QueueStatCards(
                    insideCount = uiState.insideCount,
                    waitingCount = uiState.waitingCount,
                    completedCount = uiState.completedTodayCount
                )
            }

            // 2. Date Strip
            item(key = "date_scroller") {
                QueueDateScroller(
                    selectedDate = uiState.selectedDate,
                    onDateSelected = { selectedLocalDate ->
                        viewModel.setSelectedDate(selectedLocalDate)
                    }
                )
            }

            // 3. Overloaded Slots Warning Banner (if any slot exceeds capacity)
            if (uiState.overloadedSlots.isNotEmpty()) {
                item(key = "overloaded_banner") {
                    val overloadedDescriptions = uiState.overloadedSlots.entries
                        .filter { it.key.contains("-") } // Only full time ranges
                        .joinToString(", ") { "${it.key} (${it.value.first}/${it.value.second})" }

                    if (overloadedDescriptions.isNotBlank()) {
                        Surface(
                            shape = RoundedCornerShape(12.dp),
                            color = Color(0xFFFEF3C7),
                            border = BorderStroke(1.dp, Color(0xFFF59E0B)),
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Row(
                                modifier = Modifier.padding(10.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(8.dp)
                            ) {
                                Icon(
                                    Icons.Default.Warning,
                                    contentDescription = null,
                                    tint = Color(0xFFB45309),
                                    modifier = Modifier.size(18.dp)
                                )
                                Column {
                                    Text(
                                        text = "Overloaded Slot Capacity Detected",
                                        fontWeight = FontWeight.Bold,
                                        fontSize = 12.sp,
                                        color = Color(0xFF92400E)
                                    )
                                    Text(
                                        text = overloadedDescriptions,
                                        fontSize = 11.sp,
                                        color = Color(0xFFB45309)
                                    )
                                }
                            }
                        }
                    }
                }
            }

            // 4. Sticky Header: Live vs Completed Subtabs + Break Toggle (Beside tab, NO info box!)
            stickyHeader(key = "queue_tabs_row") {
                DoctorQueueTabsRow(
                    selectedTab = uiState.selectedTab,
                    liveCount = uiState.liveQueue.size,
                    completedCount = uiState.completedQueue.size,
                    isOnBreak = uiState.isClinicOnBreak,
                    onTabSelected = { tab -> viewModel.setSelectedTab(tab) },
                    onToggleBreak = { isBreak -> viewModel.toggleBreak(isBreak) }
                )
            }

            // 5. Patient Queue Items
            if (uiState.selectedTab == 0) {
                // Live Queue
                if (uiState.liveQueue.isEmpty() && !uiState.isLoading) {
                    item(key = "empty_live") {
                        EmptyQueueView(message = "No waiting patients in queue for this date.")
                    }
                } else {
                    itemsIndexed(
                        items = uiState.liveQueue,
                        key = { _, item -> item.id }
                    ) { index, item ->
                        val slotRatio = uiState.overloadedSlots[item.appointmentTime]?.let { "${it.first}/${it.second}" }
                        val isOverloaded = slotRatio != null

                        DoctorQueueItemCard(
                            item = item,
                            index = index,
                            isExpanded = expandedItemId == item.id,
                            onCardClick = {
                                expandedItemId = if (expandedItemId == item.id) null else item.id
                            },
                            currentEpochSecond = currentEpochSecond,
                            slotCapacityRatio = slotRatio,
                            isSlotOverloaded = isOverloaded,
                            onCallInside = { targetItem ->
                                viewModel.startConsultation(targetItem)
                            },
                            onCompleteConsultation = { targetItem ->
                                viewModel.completeConsultation(targetItem)
                            },
                            onNoShowClick = { targetItem ->
                                viewModel.holdOrSkip(targetItem, newStatus = "no_show")
                            },
                            onMovePosition = { targetItem, step ->
                                val curIndex = uiState.liveQueue.indexOfFirst { it.id == targetItem.id }
                                val newIndex = (curIndex + step).coerceIn(0, uiState.liveQueue.size - 1)
                                if (curIndex != newIndex && curIndex >= 0) {
                                    val reordered = uiState.liveQueue.toMutableList()
                                    val removed = reordered.removeAt(curIndex)
                                    reordered.add(newIndex, removed)
                                    viewModel.reorderQueue(reordered)
                                }
                            },
                            cooldownUntilEpoch = uiState.alertCooldownUntilEpoch[item.id],
                            isSendingAlert = uiState.inFlightAlerts.contains(item.id),
                            alertSentBadge = uiState.alertSentBadges[item.id],
                            onWalkInAlertClick = { targetItem ->
                                pendingAlertConfirmation = targetItem to "arrive_soon"
                            },
                            onCallInAlertClick = { targetItem ->
                                pendingAlertConfirmation = targetItem to "call_inside"
                            },
                            onSendAlertClick = { targetItem ->
                                pendingAlertConfirmation = targetItem to "arrive_soon"
                            }
                        )
                    }
                }
            } else {
                // Completed Queue
                if (uiState.completedQueue.isEmpty() && !uiState.isLoading) {
                    item(key = "empty_completed") {
                        EmptyQueueView(message = "No completed consultations for this date.")
                    }
                } else {
                    itemsIndexed(
                        items = uiState.completedQueue,
                        key = { _, item -> item.id }
                    ) { index, item ->
                        DoctorQueueItemCard(
                            item = item,
                            index = index,
                            isExpanded = expandedItemId == item.id,
                            onCardClick = {
                                expandedItemId = if (expandedItemId == item.id) null else item.id
                            },
                            currentEpochSecond = currentEpochSecond,
                            onCallInside = {},
                            onCompleteConsultation = {},
                            onNoShowClick = {}
                        )
                    }
                }
            }
        }

        // Confirmation Dialog for Patient Notifications (Walk In / Call In)
        pendingAlertConfirmation?.let { (targetItem, alertType) ->
            val alertLabel = if (alertType.lowercase().contains("call")) "Call In (Call Inside)" else "Walk In (Arrive Soon)"
            AlertDialog(
                onDismissRequest = { pendingAlertConfirmation = null },
                title = {
                    Text(
                        text = "Confirm Notification",
                        fontWeight = FontWeight.Bold,
                        fontSize = 17.sp
                    )
                },
                text = {
                    Text(
                        text = "Send $alertLabel alert to ${targetItem.patientName}?",
                        fontSize = 14.sp
                    )
                },
                confirmButton = {
                    Button(
                        onClick = {
                            val alertToDispatch = alertType
                            val itemToDispatch = targetItem
                            pendingAlertConfirmation = null
                            viewModel.sendPatientNotification(itemToDispatch, alertToDispatch)
                        },
                        colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF0284C7))
                    ) {
                        Text("Confirm")
                    }
                },
                dismissButton = {
                    OutlinedButton(
                        onClick = { pendingAlertConfirmation = null }
                    ) {
                        Text("Cancel")
                    }
                }
            )
        }

        // Loading Indicator
        if (uiState.isLoading && uiState.liveQueue.isEmpty() && uiState.completedQueue.isEmpty()) {
            Box(
                modifier = Modifier.fillMaxSize(),
                contentAlignment = Alignment.Center
            ) {
                CircularProgressIndicator(color = Color(0xFF0284C7))
            }
        }
    }
}

@Composable
private fun EmptyQueueView(message: String) {
    Surface(
        shape = RoundedCornerShape(16.dp),
        color = Color(0xFFF8FAFC),
        border = BorderStroke(1.dp, Color(0xFFE2E8F0)),
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 24.dp)
    ) {
        Column(
            modifier = Modifier.padding(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Icon(
                Icons.Default.EventAvailable,
                contentDescription = null,
                tint = Color(0xFF94A3B8),
                modifier = Modifier.size(36.dp)
            )
            Text(
                text = message,
                fontSize = 13.5.sp,
                fontWeight = FontWeight.Medium,
                color = Color(0xFF64748B),
                textAlign = TextAlign.Center
            )
        }
    }
}
