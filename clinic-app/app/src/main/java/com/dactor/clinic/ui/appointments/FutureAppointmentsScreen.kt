package com.dactor.clinic.ui.appointments

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.navigation.NavController
import com.dactor.clinic.data.local.UserSessionManager
import com.dactor.clinic.data.model.Appointment
import com.dactor.clinic.data.model.Doctor
import com.dactor.clinic.data.model.Slot
import com.dactor.clinic.data.repository.*
import com.dactor.clinic.domain.util.DateTimePickers
import com.dactor.clinic.ui.components.TimeCarouselPickerDialog
import com.dactor.clinic.ui.navigation.NavRoutes
import kotlinx.coroutines.launch
import java.time.LocalDate
import java.time.YearMonth
import java.time.format.DateTimeFormatter
import java.util.UUID

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun FutureAppointmentsScreen(
    navController: NavController,
    clinicId: String = "",
    appointmentRepository: AppointmentRepository? = null,
    slotRepository: SlotRepository? = null,
    doctorRepository: DoctorRepository? = null,
    queueRepository: QueueRepository? = null,
    billingRepository: BillingRepository? = null,
    clinicRepository: ClinicRepository? = null
) {
    val context = LocalContext.current
    val clipboardManager = LocalClipboardManager.current
    val sessionManager = remember { UserSessionManager(context) }
    val userRole = sessionManager.getUserRole() ?: "clinic"
    val doctorId = sessionManager.getSavedDoctorId() ?: ""
    var effectiveClinicId by remember(clinicId) {
        mutableStateOf(
            if (clinicId.isNotBlank() && clinicId != "c1") clinicId
            else {
                val saved = sessionManager.getSavedClinicId()
                if (!saved.isNullOrBlank() && saved != "c1") saved
                else sessionManager.getSavedActiveClinicIdForDoctor() ?: ""
            }
        )
    }

    val today = remember { LocalDate.now() }
    val todayStr = remember { today.toString() }

    // Month navigation
    var displayedMonth by remember { mutableStateOf(YearMonth.from(today)) }

    // Selected date \u2014 default to today
    var selectedDate by remember { mutableStateOf(todayStr) }

    var appointments by remember(effectiveClinicId) { mutableStateOf<List<Appointment>>(emptyList()) }
    var doctors by remember(effectiveClinicId) { mutableStateOf<List<Doctor>>(emptyList()) }
    var selectedDoctor by remember(effectiveClinicId) { mutableStateOf<Doctor?>(null) }
    var remarksMap by remember(effectiveClinicId) { mutableStateOf<Map<String, String>>(emptyMap()) }

    // OPD Slots state for selected date and full clinic overview
    var slots by remember(effectiveClinicId, selectedDate) { mutableStateOf<List<Slot>>(emptyList()) }
    var allClinicSlots by remember(effectiveClinicId) { mutableStateOf<List<Slot>>(emptyList()) }
    var isSlotsLoading by remember { mutableStateOf(false) }
    var slotToDelete by remember { mutableStateOf<Slot?>(null) }

    // Declared Holidays state with non-reversing optimistic timestamp lock per date
    var declaredHolidays by remember(effectiveClinicId) { mutableStateOf<Set<String>>(emptySet()) }
    var pendingHolidayToggles by remember(effectiveClinicId) {
        mutableStateOf<Map<String, Pair<Boolean, Long>>>(emptyMap())
    }

    // Filter pills for the selected date: "All", "Completed Queue", "Waiting / Scheduled"
    var selectedSubFilter by remember { mutableStateOf("All") }

    // Slot creation state
    var showAddSlotDialog by remember { mutableStateOf(false) }
    val defaultStartTime = remember {
        try {
            val now = java.time.LocalTime.now()
            String.format(java.util.Locale.US, "%02d:%02d", now.hour, now.minute)
        } catch (e: Exception) { "09:00" }
    }
    var slotStartTime by remember { mutableStateOf(defaultStartTime) }
    var slotEndTime by remember {
        mutableStateOf(
            try {
                val now = java.time.LocalTime.now().plusMinutes(15)
                String.format(java.util.Locale.US, "%02d:%02d", now.hour, now.minute)
            } catch (e: Exception) { "09:15" }
        )
    }
    var slotCapacity by remember { mutableStateOf("5") }
    var showSlotStartTimePicker by remember { mutableStateOf(false) }
    var showSlotEndTimePicker by remember { mutableStateOf(false) }

    // Reschedule state
    var showRescheduleDialog by remember { mutableStateOf(false) }
    var showRescheduleTimePicker by remember { mutableStateOf(false) }
    var selectedApptForReschedule by remember { mutableStateOf<Appointment?>(null) }
    var newDateInput by remember { mutableStateOf("") }
    var newTimeInput by remember { mutableStateOf("") }

    // Edit Remark Dialog
    var editingRemarkAppt by remember { mutableStateOf<Appointment?>(null) }
    var remarkTextInput by remember { mutableStateOf("") }
    var isSavingRemark by remember { mutableStateOf(false) }

    var actionMessage by remember { mutableStateOf<String?>(null) }
    val coroutineScope = rememberCoroutineScope()

    fun format12h(timeStr: String): String {
        return try {
            val parts = timeStr.trim().split(":")
            val h = parts.getOrNull(0)?.toIntOrNull() ?: 9
            val m = parts.getOrNull(1)?.take(2)?.toIntOrNull() ?: 0
            val amPm = if (h >= 12) "PM" else "AM"
            val h12 = if (h % 12 == 0) 12 else h % 12
            String.format(java.util.Locale.US, "%02d:%02d %s", h12, m, amPm)
        } catch (e: Exception) { timeStr }
    }

    suspend fun loadSlots() {
        if (slotRepository != null && effectiveClinicId.isNotBlank()) {
            isSlotsLoading = true
            try {
                slots = slotRepository.getSlots(effectiveClinicId, selectedDate).sortedBy { it.startTime }
                allClinicSlots = slotRepository.getSlotsForClinic(effectiveClinicId)
            } catch (e: Exception) {
                e.printStackTrace()
            } finally {
                isSlotsLoading = false
            }
        }
    }

    suspend fun loadAppointments() {
        if (userRole == "doctor" && doctorId.isNotBlank() && effectiveClinicId.isBlank()) {
            val doc = doctorRepository?.getDoctorById(doctorId)
            val resolvedClinicId = doc?.activeClinicId ?: doc?.clinicId
                ?: doctorRepository?.getAffiliatedClinicsForDoctor(doctorId, doc?.email ?: "")?.firstOrNull()?.id
            if (!resolvedClinicId.isNullOrBlank()) {
                effectiveClinicId = resolvedClinicId
                sessionManager.saveActiveClinicIdForDoctor(resolvedClinicId)
            }
        }

        if (clinicRepository != null && effectiveClinicId.isNotBlank()) {
            val clinicObj = clinicRepository.getClinicById(effectiveClinicId)
            if (clinicObj != null) {
                val nowMs = System.currentTimeMillis()
                val remoteSet = clinicObj.declaredHolidays.map { it.trim() }.filter { it.isNotBlank() }.toMutableSet()
                pendingHolidayToggles.forEach { (dateKey, pair) ->
                    val (lockedHolidayState, ts) = pair
                    if (nowMs - ts < 12_000L) {
                        if (lockedHolidayState) remoteSet.add(dateKey) else remoteSet.remove(dateKey)
                    }
                }
                declaredHolidays = remoteSet
            }
        }
        if (appointmentRepository != null) {
            val appts = if (userRole == "doctor" && doctorId.isNotBlank()) {
                appointmentRepository.getAppointmentsByDoctor(doctorId)
            } else if (effectiveClinicId.isNotBlank()) {
                appointmentRepository.getAppointmentsByClinic(effectiveClinicId)
            } else emptyList()
            appointments = appts.filter {
                it.status.equals("APPROVED", ignoreCase = true) &&
                it.status != "WAITING_FOR_APPROVAL" &&
                it.status != "pending_payment" &&
                it.status != "UNAPPROVED" &&
                it.status != "EXPIRED" &&
                it.checkinStatus != "cancelled"
            }

            if (billingRepository != null && appts.isNotEmpty()) {
                val apptIds = appts.map { it.id }
                remarksMap = billingRepository.getRemarksForAppointments(apptIds)
            }
        }
        if (doctorRepository != null) {
            val remoteDocs = if (effectiveClinicId.isNotBlank()) {
                doctorRepository.getDoctorsByClinic(effectiveClinicId)
            } else emptyList()

            val allDocs = if (userRole == "doctor" && doctorId.isNotBlank()) {
                val selfDoc = doctorRepository.getDoctorById(doctorId)
                if (selfDoc != null && remoteDocs.none { it.id == selfDoc.id }) {
                    listOf(selfDoc) + remoteDocs
                } else if (remoteDocs.isNotEmpty()) {
                    remoteDocs
                } else if (selfDoc != null) {
                    listOf(selfDoc)
                } else {
                    emptyList()
                }
            } else remoteDocs

            doctors = allDocs
            if (userRole == "doctor" && doctorId.isNotBlank()) {
                selectedDoctor = allDocs.find { it.id == doctorId } ?: allDocs.firstOrNull()
            } else if (selectedDoctor == null || !allDocs.contains(selectedDoctor)) {
                selectedDoctor = allDocs.firstOrNull()
            }
        }
    }

    LaunchedEffect(effectiveClinicId, doctorId, userRole) {
        loadAppointments()
        loadSlots()
    }

    LaunchedEffect(selectedDate, effectiveClinicId) {
        loadSlots()
    }

    // All days in the displayed month
    val daysInMonth = remember(displayedMonth) {
        val numDays = displayedMonth.lengthOfMonth()
        (1..numDays).map { day -> displayedMonth.atDay(day) }
    }

    // Scroll day strip
    val dayListState = rememberLazyListState()
    LaunchedEffect(displayedMonth) {
        val targetIndex = if (displayedMonth == YearMonth.from(today)) {
            (today.dayOfMonth - 1).coerceAtLeast(0)
        } else 0
        dayListState.animateScrollToItem(targetIndex)
    }

    // Appointments on the selected date
    val currentAppointments = remember(appointments, selectedDate) {
        appointments.filter { it.appointmentDate == selectedDate }
    }

    val completedQueueList = remember(currentAppointments) {
        currentAppointments.filter { it.checkinStatus == "completed" }
    }

    val activeWaitingList = remember(currentAppointments) {
        currentAppointments.filter { it.checkinStatus != "completed" && it.checkinStatus != "cancelled" }
    }

    val displayedAppointments = remember(currentAppointments, completedQueueList, activeWaitingList, selectedSubFilter) {
        when (selectedSubFilter) {
            "Completed Queue" -> completedQueueList
            "Waiting / Active" -> activeWaitingList
            else -> currentAppointments
        }
    }

    val isSelectedDateInPastOrToday = remember(selectedDate, todayStr) {
        selectedDate <= todayStr
    }

    val monthFormatter = remember { DateTimeFormatter.ofPattern("MMMM yyyy") }
    val dayNameFormatter = remember { DateTimeFormatter.ofPattern("EEE") }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Appointments Calendar & Queue", fontWeight = FontWeight.Bold) },
                navigationIcon = {
                    IconButton(onClick = { navController.popBackStack() }) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
                actions = {
                    IconButton(onClick = {
                        coroutineScope.launch {
                            loadAppointments()
                            loadSlots()
                        }
                    }) {
                        Icon(Icons.Default.Refresh, contentDescription = "Refresh")
                    }
                }
            )
        },
        floatingActionButtonPosition = FabPosition.Start,
        floatingActionButton = {
            ExtendedFloatingActionButton(
                onClick = {
                    try {
                        if (selectedDate > todayStr) {
                            // Default to standard morning OPD hours for future dates
                            slotStartTime = "09:00"
                            slotEndTime = "09:30"
                        } else {
                            val now = java.time.LocalTime.now()
                            val currentMinutes = now.hour * 60 + now.minute
                            val nextSlotMinutes = ((currentMinutes + 14) / 15) * 15
                            val nextH = (nextSlotMinutes / 60) % 24
                            val nextM = nextSlotMinutes % 60
                            slotStartTime = String.format(java.util.Locale.US, "%02d:%02d", nextH, nextM)
                            slotEndTime = DateTimePickers.addMinutesToTime(slotStartTime, 15)
                        }
                    } catch (ignored: Exception) {}
                    showAddSlotDialog = true
                },
                icon = { Icon(Icons.Default.Add, contentDescription = "Add slot", tint = Color.White) },
                text = { Text("Add slot", fontWeight = FontWeight.Bold, color = Color.White) },
                containerColor = Color(0xFF0097A7),
                shape = RoundedCornerShape(16.dp)
            )
        }
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
        ) {
            // Action banner
            if (actionMessage != null) {
                Card(
                    shape = RoundedCornerShape(10.dp),
                    colors = CardDefaults.cardColors(containerColor = Color(0xFFD1FAE5)),
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp, vertical = 6.dp)
                ) {
                    Row(
                        modifier = Modifier
                            .padding(horizontal = 12.dp, vertical = 8.dp)
                            .fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                            modifier = Modifier.weight(1f)
                        ) {
                            Icon(Icons.Default.CheckCircle, contentDescription = null, tint = Color(0xFF059669), modifier = Modifier.size(16.dp))
                            Text(actionMessage ?: "", fontSize = 12.sp, color = Color(0xFF065F46), fontWeight = FontWeight.SemiBold)
                        }
                        IconButton(onClick = { actionMessage = null }, modifier = Modifier.size(24.dp)) {
                            Icon(Icons.Default.Close, contentDescription = "Dismiss", tint = Color(0xFF065F46), modifier = Modifier.size(14.dp))
                        }
                    }
                }
            }

            // Description
            Text(
                text = "Tap any date to inspect booked appointments, declare clinic holidays, or edit visit remarks.",
                fontSize = 12.sp,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier
                    .padding(horizontal = 16.dp)
                    .padding(vertical = 4.dp)
            )

            // Month Navigation
            Surface(
                color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.4f),
                modifier = Modifier.fillMaxWidth()
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 8.dp, vertical = 6.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    IconButton(onClick = { displayedMonth = displayedMonth.minusMonths(1) }) {
                        Icon(Icons.Default.KeyboardArrowLeft, contentDescription = "Previous Month", modifier = Modifier.size(28.dp))
                    }

                    Text(
                        text = displayedMonth.format(monthFormatter),
                        fontWeight = FontWeight.Bold,
                        fontSize = 16.sp,
                        color = MaterialTheme.colorScheme.onSurface
                    )

                    IconButton(onClick = { displayedMonth = displayedMonth.plusMonths(1) }) {
                        Icon(Icons.Default.KeyboardArrowRight, contentDescription = "Next Month", modifier = Modifier.size(28.dp))
                    }
                }
            }

            // Day Strip
            LazyRow(
                state = dayListState,
                contentPadding = PaddingValues(horizontal = 12.dp, vertical = 8.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                modifier = Modifier.fillMaxWidth()
            ) {
                itemsIndexed(daysInMonth, key = { _, d -> d.toString() }) { _, date ->
                    val dateStr = date.toString()
                    val isSelected = selectedDate == dateStr
                    val isToday = date == today
                    val isHolidayDate = declaredHolidays.contains(dateStr)
                    val hasAppts = appointments.any { it.appointmentDate == dateStr }
                    val hasCompleted = appointments.any { it.appointmentDate == dateStr && it.checkinStatus == "completed" }
                    val hasSlots = allClinicSlots.any { it.slotDate == dateStr }

                    Column(
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.spacedBy(2.dp)
                    ) {
                        Text(
                            text = date.format(dayNameFormatter),
                            fontSize = 9.sp,
                            color = when {
                                isHolidayDate -> Color(0xFFDC2626)
                                isSelected -> Color(0xFF0097A7)
                                else -> MaterialTheme.colorScheme.onSurfaceVariant
                            },
                            fontWeight = if (isToday || isHolidayDate) FontWeight.Bold else FontWeight.Normal
                        )

                        Surface(
                            onClick = { selectedDate = dateStr },
                            shape = CircleShape,
                            color = when {
                                isSelected && isHolidayDate -> Color(0xFFDC2626)
                                isSelected -> Color(0xFF0097A7)
                                isHolidayDate -> Color(0xFFFEE2E2)
                                isToday -> MaterialTheme.colorScheme.primaryContainer
                                else -> MaterialTheme.colorScheme.surface
                            },
                            border = when {
                                isHolidayDate && !isSelected -> BorderStroke(1.dp, Color(0xFFDC2626))
                                isToday && !isSelected -> BorderStroke(1.dp, Color(0xFF0097A7))
                                else -> null
                            },
                            modifier = Modifier.size(40.dp)
                        ) {
                            Box(contentAlignment = Alignment.Center, modifier = Modifier.fillMaxSize()) {
                                Text(
                                    text = date.dayOfMonth.toString(),
                                    fontWeight = if (isSelected || isToday || isHolidayDate) FontWeight.Bold else FontWeight.Normal,
                                    fontSize = 14.sp,
                                    color = when {
                                        isSelected -> Color.White
                                        isHolidayDate -> Color(0xFFB91C1C)
                                        isToday -> MaterialTheme.colorScheme.primary
                                        else -> MaterialTheme.colorScheme.onSurface
                                    }
                                )
                            }
                        }

                        // Appointment / Completed / Holiday / Published Slots Dot
                        Surface(
                            shape = CircleShape,
                            color = when {
                                isHolidayDate -> Color(0xFFDC2626)
                                hasCompleted -> Color(0xFF10B981)
                                hasAppts -> Color(0xFF0097A7)
                                hasSlots -> Color(0xFF38BDF8)
                                else -> Color.Transparent
                            },
                            modifier = Modifier.size(5.dp)
                        ) {}
                    }
                }
            }

            // Declare Holiday (Closed on Selected Date) Toggle Card
            val isHolidaySelected = declaredHolidays.contains(selectedDate)
            Card(
                shape = RoundedCornerShape(14.dp),
                colors = CardDefaults.cardColors(
                    containerColor = if (isHolidaySelected) Color(0xFFFEF2F2) else Color.White
                ),
                border = BorderStroke(
                    1.dp,
                    if (isHolidaySelected) Color(0xFFFCA5A5) else Color(0xFFE2E8F0)
                ),
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 4.dp)
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 12.dp, vertical = 8.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(10.dp),
                        modifier = Modifier.weight(1f)
                    ) {
                        Surface(
                            shape = CircleShape,
                            color = if (isHolidaySelected) Color(0xFFFEE2E2) else Color(0xFFF1F5F9),
                            modifier = Modifier.size(34.dp)
                        ) {
                            Box(contentAlignment = Alignment.Center) {
                                Icon(
                                    if (isHolidaySelected) Icons.Default.EventBusy else Icons.Default.EventAvailable,
                                    contentDescription = null,
                                    tint = if (isHolidaySelected) Color(0xFFDC2626) else Color(0xFF0097A7),
                                    modifier = Modifier.size(18.dp)
                                )
                            }
                        }
                        Column {
                            Text(
                                text = if (isHolidaySelected) {
                                    "Clinic Closed on $selectedDate (Declared Holiday)"
                                } else {
                                    "Declare Holiday for $selectedDate"
                                },
                                fontWeight = FontWeight.Bold,
                                fontSize = 13.sp,
                                color = if (isHolidaySelected) Color(0xFF991B1B) else Color(0xFF0F172A)
                            )
                            Text(
                                text = if (isHolidaySelected) {
                                    "Patients checking appointments on $selectedDate will see Clinic is Closed."
                                } else {
                                    "Toggle ON to mark clinic closed on $selectedDate for patients."
                                },
                                fontSize = 11.sp,
                                color = if (isHolidaySelected) Color(0xFFB91C1C) else Color(0xFF64748B)
                            )
                        }
                    }

                    Switch(
                        checked = isHolidaySelected,
                        onCheckedChange = { checked ->
                            val targetDate = selectedDate
                            val nowMs = System.currentTimeMillis()
                            pendingHolidayToggles = pendingHolidayToggles + (targetDate to (checked to nowMs))
                            declaredHolidays = if (checked) {
                                declaredHolidays + targetDate
                            } else {
                                declaredHolidays - targetDate
                            }
                            coroutineScope.launch {
                                val ok = clinicRepository?.toggleClinicHoliday(
                                    clinicId = effectiveClinicId,
                                    dateStr = targetDate,
                                    isHoliday = checked
                                ) != null
                                if (ok) {
                                    actionMessage = if (checked) {
                                        "🏖️ Declared Holiday on $targetDate \u2014 Patients will see Clinic is Closed on this day."
                                    } else {
                                        "✓ Removed Holiday on $targetDate \u2014 Clinic is marked Open."
                                    }
                                } else {
                                    val lockEntry = pendingHolidayToggles[targetDate]
                                    if (lockEntry == null || System.currentTimeMillis() - lockEntry.second >= 12_000L) {
                                        declaredHolidays = if (checked) declaredHolidays - targetDate else declaredHolidays + targetDate
                                    }
                                }
                            }
                        },
                        colors = SwitchDefaults.colors(
                            checkedThumbColor = Color.White,
                            checkedTrackColor = Color(0xFFDC2626)
                        )
                    )
                }
            }

            // Published OPD Slots for Selected Date Card
            Card(
                shape = RoundedCornerShape(14.dp),
                colors = CardDefaults.cardColors(
                    containerColor = if (slots.isNotEmpty()) Color(0xFFF0FDF4) else Color(0xFFF8FAFC)
                ),
                border = BorderStroke(
                    1.dp,
                    if (slots.isNotEmpty()) Color(0xFFBBF7D0) else Color(0xFFE2E8F0)
                ),
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 4.dp)
            ) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(12.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(6.dp)
                        ) {
                            Icon(
                                Icons.Default.AccessTime,
                                contentDescription = null,
                                tint = if (slots.isNotEmpty()) Color(0xFF16A34A) else Color(0xFF0097A7),
                                modifier = Modifier.size(16.dp)
                            )
                            Text(
                                "Published OPD Slots for $selectedDate",
                                fontWeight = FontWeight.Bold,
                                fontSize = 13.sp,
                                color = if (slots.isNotEmpty()) Color(0xFF166534) else Color(0xFF0F172A)
                            )
                        }
                        Surface(
                            shape = RoundedCornerShape(10.dp),
                            color = if (slots.isNotEmpty()) Color(0xFFDCFCE7) else Color(0xFFE2E8F0)
                        ) {
                            Text(
                                text = "${slots.size} slot${if (slots.size == 1) "" else "s"}",
                                fontSize = 10.sp,
                                fontWeight = FontWeight.Bold,
                                color = if (slots.isNotEmpty()) Color(0xFF15803D) else Color(0xFF64748B),
                                modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
                            )
                        }
                    }

                    if (slots.isEmpty()) {
                        Text(
                            text = "No OPD slots configured for this date. Tap '+ Add slot' below to add patient booking slots.",
                            fontSize = 11.5.sp,
                            color = Color(0xFF64748B)
                        )
                    } else {
                        Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                            slots.forEach { slot ->
                                val slotDoc = doctors.find { it.id == slot.doctorId }
                                Surface(
                                    shape = RoundedCornerShape(10.dp),
                                    color = Color.White,
                                    border = BorderStroke(1.dp, Color(0xFFD1D5DB)),
                                    modifier = Modifier.fillMaxWidth()
                                ) {
                                    Row(
                                        modifier = Modifier
                                            .fillMaxWidth()
                                            .padding(horizontal = 10.dp, vertical = 6.dp),
                                        horizontalArrangement = Arrangement.SpaceBetween,
                                        verticalAlignment = Alignment.CenterVertically
                                    ) {
                                        Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                                            Row(
                                                verticalAlignment = Alignment.CenterVertically,
                                                horizontalArrangement = Arrangement.spacedBy(6.dp)
                                            ) {
                                                Text(
                                                    text = "${format12h(slot.startTime)} - ${format12h(slot.endTime)}",
                                                    fontWeight = FontWeight.Bold,
                                                    fontSize = 13.sp,
                                                    color = Color(0xFF0F172A)
                                                )
                                                if (slotDoc != null) {
                                                    Text(
                                                        text = "\u2022 Dr. ${slotDoc.fullName}",
                                                        fontSize = 11.sp,
                                                        color = Color(0xFF0097A7),
                                                        fontWeight = FontWeight.SemiBold
                                                    )
                                                }
                                            }
                                            Text(
                                                text = "Capacity: ${slot.maxCapacity} patients \u2022 Booked: ${slot.bookedCount}",
                                                fontSize = 11.sp,
                                                color = Color(0xFF64748B)
                                            )
                                        }

                                        IconButton(
                                            onClick = { slotToDelete = slot },
                                            modifier = Modifier.size(28.dp)
                                        ) {
                                            Icon(
                                                Icons.Default.Delete,
                                                contentDescription = "Delete Slot",
                                                tint = Color(0xFFEF4444),
                                                modifier = Modifier.size(16.dp)
                                            )
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }

            HorizontalDivider(modifier = Modifier.padding(horizontal = 16.dp, vertical = 2.dp))

            // Sub-Filters on Selected Date
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 6.dp),
                horizontalArrangement = Arrangement.spacedBy(6.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                FilterChip(
                    selected = selectedSubFilter == "All",
                    onClick = { selectedSubFilter = "All" },
                    label = { Text("All (${currentAppointments.size})", fontSize = 11.sp) }
                )
                FilterChip(
                    selected = selectedSubFilter == "Completed Queue",
                    onClick = { selectedSubFilter = "Completed Queue" },
                    label = { Text("Completed Queue (${completedQueueList.size})", fontSize = 11.sp, fontWeight = FontWeight.Bold) },
                    leadingIcon = {
                        Icon(Icons.Default.CheckCircle, contentDescription = null, tint = Color(0xFF059669), modifier = Modifier.size(13.dp))
                    }
                )
                FilterChip(
                    selected = selectedSubFilter == "Waiting / Active",
                    onClick = { selectedSubFilter = "Waiting / Active" },
                    label = { Text("Waiting (${activeWaitingList.size})", fontSize = 11.sp) }
                )
            }

            // Appointment List / Completed Queue Details
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(horizontal = 16.dp)
            ) {
                if (displayedAppointments.isEmpty()) {
                    Box(
                        modifier = Modifier
                            .fillMaxSize()
                            .padding(bottom = 70.dp),
                        contentAlignment = Alignment.Center
                    ) {
                        Column(
                            horizontalAlignment = Alignment.CenterHorizontally,
                            verticalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            Icon(Icons.Default.EventBusy, contentDescription = null, tint = MaterialTheme.colorScheme.outline, modifier = Modifier.size(44.dp))
                            Text(
                                if (selectedSubFilter == "Completed Queue") "No completed consultations recorded on $selectedDate."
                                else "No appointments scheduled for $selectedDate.",
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                fontSize = 13.sp
                            )
                            if (isSelectedDateInPastOrToday) {
                                Text(
                                    "When patients complete consultation in OPD queue, their completed history and remarks show here.",
                                    color = MaterialTheme.colorScheme.outline,
                                    fontSize = 11.sp,
                                    textAlign = androidx.compose.ui.text.style.TextAlign.Center,
                                    modifier = Modifier.padding(horizontal = 24.dp)
                                )
                            }
                        }
                    }
                } else {
                    LazyColumn(
                        verticalArrangement = Arrangement.spacedBy(10.dp),
                        contentPadding = PaddingValues(bottom = 80.dp),
                        modifier = Modifier.fillMaxSize()
                    ) {
                        itemsIndexed(displayedAppointments, key = { _, it -> it.id }) { index, appt ->
                            val isCompleted = appt.checkinStatus == "completed"
                            val assignedDoctor = doctors.find { it.id == appt.doctorId }
                            val curRemark = com.dactor.clinic.domain.util.PaymentLedgerHelper.extractCleanClinicalRemarks(remarksMap[appt.id])

                            Card(
                                shape = RoundedCornerShape(16.dp),
                                colors = CardDefaults.cardColors(
                                    containerColor = if (isCompleted) Color(0xFFF0FDF4) else Color.White
                                ),
                                border = BorderStroke(
                                    1.dp,
                                    if (isCompleted) Color(0xFF86EFAC) else Color(0xFFE2E8F0)
                                ),
                                elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .clickable {
                                        navController.navigate("${NavRoutes.PatientDetail}/${appt.trackingCode10Digit}")
                                    }
                            ) {
                                Column(
                                    modifier = Modifier.padding(14.dp),
                                    verticalArrangement = Arrangement.spacedBy(8.dp)
                                ) {
                                    // Row 1: Position Badge, Name, Status Badge
                                    Row(
                                        modifier = Modifier.fillMaxWidth(),
                                        horizontalArrangement = Arrangement.SpaceBetween,
                                        verticalAlignment = Alignment.CenterVertically
                                    ) {
                                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                                            Surface(
                                                shape = RoundedCornerShape(8.dp),
                                                color = if (isCompleted) Color(0xFFDCFCE7) else Color(0xFFE0F2FE),
                                                modifier = Modifier.size(34.dp)
                                            ) {
                                                Box(contentAlignment = Alignment.Center) {
                                                    Text(
                                                        "#${index + 1}",
                                                        fontWeight = FontWeight.Bold,
                                                        fontSize = 12.sp,
                                                        color = if (isCompleted) Color(0xFF15803D) else Color(0xFF0284C7)
                                                    )
                                                }
                                            }

                                            Column {
                                                Text(appt.patientName, fontWeight = FontWeight.Bold, fontSize = 15.sp, color = Color(0xFF0F172A))
                                                Text(
                                                    text = "${appt.patientAge ?: 30} yrs, ${appt.patientGender ?: "Patient"}",
                                                    fontSize = 11.5.sp,
                                                    color = Color(0xFF64748B)
                                                )
                                            }
                                        }

                                        // Status Pill
                                        if (isCompleted) {
                                            Surface(color = Color(0xFFDCFCE7), shape = RoundedCornerShape(6.dp)) {
                                                Row(
                                                    verticalAlignment = Alignment.CenterVertically,
                                                    horizontalArrangement = Arrangement.spacedBy(4.dp),
                                                    modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
                                                ) {
                                                    Icon(Icons.Default.CheckCircle, contentDescription = null, tint = Color(0xFF15803D), modifier = Modifier.size(13.dp))
                                                    Text("✓ Completed Queue", color = Color(0xFF15803D), fontSize = 11.sp, fontWeight = FontWeight.Bold)
                                                }
                                            }
                                        } else {
                                            Surface(color = Color(0xFFFEF3C7), shape = RoundedCornerShape(6.dp)) {
                                                Text("Waiting", color = Color(0xFF92400E), fontSize = 11.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp))
                                            }
                                        }
                                    }

                                    HorizontalDivider(color = Color(0xFFE2E8F0))

                                    // Row 2: Tracking ID (Tap to Copy) & Phone with Call
                                    Row(
                                        modifier = Modifier.fillMaxWidth(),
                                        horizontalArrangement = Arrangement.SpaceBetween,
                                        verticalAlignment = Alignment.CenterVertically
                                    ) {
                                        // Tap Tracking to Copy
                                        Row(
                                            verticalAlignment = Alignment.CenterVertically,
                                            horizontalArrangement = Arrangement.spacedBy(4.dp),
                                            modifier = Modifier.clickable {
                                                clipboardManager.setText(AnnotatedString(appt.trackingCode10Digit))
                                                actionMessage = "✓ Copied Appt ID: ${appt.trackingCode10Digit}"
                                            }
                                        ) {
                                            Text("Appt ID: ${appt.trackingCode10Digit}", fontSize = 12.sp, fontFamily = FontFamily.Monospace, fontWeight = FontWeight.Bold, color = Color(0xFF0284C7))
                                            Icon(Icons.Default.ContentCopy, contentDescription = "Copy", tint = Color(0xFF0284C7), modifier = Modifier.size(12.dp))
                                        }

                                        // Call Button
                                        if (appt.patientMobile.isNotBlank()) {
                                            Surface(
                                                shape = RoundedCornerShape(8.dp),
                                                color = Color(0xFFDCFCE7),
                                                modifier = Modifier.clickable {
                                                    try {
                                                        val intent = Intent(Intent.ACTION_DIAL, Uri.parse("tel:${appt.patientMobile}"))
                                                        context.startActivity(intent)
                                                    } catch (ignored: Exception) {}
                                                }
                                            ) {
                                                Row(
                                                    verticalAlignment = Alignment.CenterVertically,
                                                    horizontalArrangement = Arrangement.spacedBy(4.dp),
                                                    modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
                                                ) {
                                                    Icon(Icons.Default.Call, contentDescription = "Call", tint = Color(0xFF15803D), modifier = Modifier.size(13.dp))
                                                    Text(appt.patientMobile, fontSize = 11.sp, color = Color(0xFF15803D), fontWeight = FontWeight.Bold)
                                                }
                                            }
                                        }
                                    }

                                    // Row 3: Schedule Time & Doctor
                                    Row(
                                        modifier = Modifier.fillMaxWidth(),
                                        horizontalArrangement = Arrangement.SpaceBetween,
                                        verticalAlignment = Alignment.CenterVertically
                                    ) {
                                        Text(
                                            text = "Time: ${appt.appointmentTime}",
                                            fontSize = 12.sp,
                                            fontWeight = FontWeight.SemiBold,
                                            color = Color(0xFF334155)
                                        )
                                        Text(
                                            text = "Doctor: Dr. ${(assignedDoctor?.fullName ?: "Specialist").removePrefix("Dr. ").removePrefix("Dr.")}",
                                            fontSize = 12.sp,
                                            color = Color(0xFF64748B)
                                        )
                                    }

                                    // Row 4: Remarks Section (Editable by Clinic)
                                    Surface(
                                        shape = RoundedCornerShape(8.dp),
                                        color = if (isCompleted) Color.White else Color(0xFFF8FAFC),
                                        border = BorderStroke(1.dp, Color(0xFFE2E8F0)),
                                        modifier = Modifier.fillMaxWidth()
                                    ) {
                                        Row(
                                            modifier = Modifier
                                                .padding(horizontal = 10.dp, vertical = 6.dp)
                                                .fillMaxWidth(),
                                            horizontalArrangement = Arrangement.SpaceBetween,
                                            verticalAlignment = Alignment.CenterVertically
                                        ) {
                                            Column(modifier = Modifier.weight(1f)) {
                                                Text("Clinical Remarks & Diagnosis:", fontSize = 10.5.sp, fontWeight = FontWeight.Bold, color = Color(0xFF0F172A))
                                                Text(
                                                    text = if (!curRemark.isNullOrBlank()) curRemark else "No remarks entered yet. Tap Edit to record diagnosis.",
                                                    fontSize = 11.5.sp,
                                                    color = if (!curRemark.isNullOrBlank()) Color(0xFF334155) else Color(0xFF94A3B8)
                                                )
                                            }
                                            IconButton(
                                                onClick = {
                                                    editingRemarkAppt = appt
                                                    remarkTextInput = curRemark ?: ""
                                                },
                                                modifier = Modifier.size(28.dp)
                                            ) {
                                                Icon(Icons.Default.Edit, contentDescription = "Edit Remark", tint = Color(0xFF0097A7), modifier = Modifier.size(14.dp))
                                            }
                                        }
                                    }

                                    // Action Buttons Row (Reschedule or View Chart)
                                    Row(
                                        modifier = Modifier.fillMaxWidth(),
                                        horizontalArrangement = Arrangement.End,
                                        verticalAlignment = Alignment.CenterVertically
                                    ) {
                                        if (!isCompleted) {
                                            OutlinedButton(
                                                onClick = {
                                                    selectedApptForReschedule = appt
                                                    newDateInput = appt.appointmentDate
                                                    newTimeInput = appt.appointmentTime
                                                    showRescheduleDialog = true
                                                },
                                                shape = RoundedCornerShape(8.dp),
                                                contentPadding = PaddingValues(horizontal = 8.dp, vertical = 2.dp),
                                                modifier = Modifier.height(30.dp)
                                            ) {
                                                Icon(Icons.Default.EditCalendar, contentDescription = null, modifier = Modifier.size(13.dp))
                                                Spacer(Modifier.width(4.dp))
                                                Text("Shift Date", fontSize = 11.sp)
                                            }
                                            Spacer(Modifier.width(8.dp))
                                        }

                                        TextButton(
                                            onClick = {
                                                navController.navigate("${NavRoutes.PatientDetail}/${appt.trackingCode10Digit}")
                                            },
                                            contentPadding = PaddingValues(horizontal = 6.dp, vertical = 0.dp),
                                            modifier = Modifier.height(30.dp)
                                        ) {
                                            Text("Open Chart ›", fontSize = 11.5.sp, fontWeight = FontWeight.Bold, color = Color(0xFF0097A7))
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        // Add Slot Dialog
        if (showAddSlotDialog) {
            val localNow = java.time.LocalTime.now()
            val currentMinutesToday = localNow.hour * 60 + localNow.minute
            val startParts = slotStartTime.trim().split(":")
            val startMinutes = (startParts.getOrNull(0)?.toIntOrNull() ?: 0) * 60 + (startParts.getOrNull(1)?.take(2)?.toIntOrNull() ?: 0)
            val endParts = slotEndTime.trim().split(":")
            val endMinutes = (endParts.getOrNull(0)?.toIntOrNull() ?: 0) * 60 + (endParts.getOrNull(1)?.take(2)?.toIntOrNull() ?: 0)

            val isDateToday = selectedDate == todayStr
            val isDateInPast = selectedDate < todayStr
            val isInvalidInterval = endMinutes <= startMinutes
            val hasTimeError = isDateInPast || isInvalidInterval

            AlertDialog(
                onDismissRequest = { showAddSlotDialog = false },
                title = { Text("Add Slot for $selectedDate", fontWeight = FontWeight.Bold) },
                text = {
                    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                        Text("Doctor Assignment", fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
                        if (userRole == "doctor" && doctors.isNotEmpty()) {
                            val myDoc = selectedDoctor ?: doctors.find { it.id == doctorId } ?: doctors.first()
                            Surface(
                                shape = RoundedCornerShape(8.dp),
                                color = Color(0xFFE0F2FE),
                                border = BorderStroke(1.dp, Color(0xFFBAE6FD)),
                                modifier = Modifier.fillMaxWidth()
                            ) {
                                Row(
                                    modifier = Modifier.padding(10.dp),
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                                ) {
                                    Icon(Icons.Default.Person, contentDescription = null, tint = Color(0xFF0284C7), modifier = Modifier.size(18.dp))
                                    Text(
                                        "Assigning to: Dr. ${myDoc.fullName} (${myDoc.specialty ?: "OPD"})",
                                        fontSize = 12.sp,
                                        fontWeight = FontWeight.SemiBold,
                                        color = Color(0xFF0369A1)
                                    )
                                }
                            }
                        } else if (doctors.isNotEmpty()) {
                            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                                doctors.forEach { doc ->
                                    Row(
                                        verticalAlignment = Alignment.CenterVertically,
                                        modifier = Modifier
                                            .fillMaxWidth()
                                            .clickable { selectedDoctor = doc }
                                    ) {
                                        RadioButton(selected = selectedDoctor?.id == doc.id, onClick = { selectedDoctor = doc })
                                        Text("${doc.fullName} (${doc.specialty ?: "General"})", fontSize = 13.sp)
                                    }
                                }
                            }
                        } else {
                            Text(
                                "No doctors found in clinic. Please register a doctor first.",
                                fontSize = 12.sp,
                                color = Color(0xFFDC2626)
                            )
                        }

                        Text("Slot Schedule Time Window:", fontSize = 13.sp, fontWeight = FontWeight.SemiBold)

                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(10.dp)
                        ) {
                            Surface(
                                shape = RoundedCornerShape(12.dp),
                                color = MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.35f),
                                modifier = Modifier
                                    .weight(1f)
                                    .clickable { showSlotStartTimePicker = true }
                            ) {
                                Column(modifier = Modifier.padding(10.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                                    Text("START TIME", fontSize = 10.sp, fontWeight = FontWeight.Bold, color = Color(0xFF0097A7))
                                    Text(format12h(slotStartTime), fontSize = 15.sp, fontWeight = FontWeight.ExtraBold)
                                }
                            }

                            Surface(
                                shape = RoundedCornerShape(12.dp),
                                color = if (isInvalidInterval) MaterialTheme.colorScheme.errorContainer.copy(alpha = 0.5f) else MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f),
                                border = BorderStroke(1.dp, if (isInvalidInterval) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.outlineVariant),
                                modifier = Modifier
                                    .weight(1f)
                                    .clickable { showSlotEndTimePicker = true }
                            ) {
                                Column(modifier = Modifier.padding(10.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                                    Text("END TIME", fontSize = 10.sp, fontWeight = FontWeight.Bold, color = Color(0xFF64748B))
                                    Text(format12h(slotEndTime), fontSize = 15.sp, fontWeight = FontWeight.ExtraBold)
                                }
                            }
                        }

                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(6.dp)
                        ) {
                            listOf(15, 30, 45, 60, 180).forEach { mins ->
                                SuggestionChip(
                                    onClick = {
                                        slotEndTime = DateTimePickers.addMinutesToTime(slotStartTime, mins)
                                    },
                                    label = { Text("+$mins m", fontSize = 11.sp) }
                                )
                            }
                        }

                        if (hasTimeError) {
                            Text(
                                text = when {
                                    isDateInPast -> "⚠️ Cannot schedule a slot in the past ($selectedDate)."
                                    isInvalidInterval -> "⚠️ End time ($slotEndTime) must be later than start time ($slotStartTime)."
                                    else -> "⚠️ Please verify the selected schedule time."
                                },
                                fontSize = 11.5.sp,
                                color = Color(0xFFDC2626),
                                fontWeight = FontWeight.SemiBold
                            )
                        } else {
                            Text(
                                text = "✓ Slot Time Window: ${format12h(slotStartTime)} to ${format12h(slotEndTime)} \u2014 Can be published anytime, even on closed days or outside regular hours.",
                                fontSize = 11.sp,
                                color = Color(0xFF16A34A),
                                fontWeight = FontWeight.SemiBold
                            )
                        }

                        OutlinedTextField(
                            value = slotCapacity,
                            onValueChange = { slotCapacity = it },
                            label = { Text("Patient Capacity for Slot") },
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                            modifier = Modifier.fillMaxWidth(),
                            shape = RoundedCornerShape(10.dp)
                        )
                    }
                },
                confirmButton = {
                    Button(
                        onClick = {
                            if (hasTimeError) return@Button
                            val capVal = (slotCapacity.toIntOrNull() ?: 5).coerceAtLeast(1)
                            val doc = selectedDoctor ?: doctors.firstOrNull()
                            if (doc == null) {
                                actionMessage = "Please select or register a doctor first."
                                return@Button
                            }
                            if (effectiveClinicId.isBlank()) {
                                actionMessage = "Please select an active clinic first."
                                return@Button
                            }
                            if (slotStartTime.isBlank() || slotEndTime.isBlank()) {
                                actionMessage = "Please set valid slot start and end times."
                                return@Button
                            }
                            val newSlot = Slot(
                                id = UUID.randomUUID().toString(),
                                clinicId = effectiveClinicId,
                                doctorId = doc.id,
                                slotDate = selectedDate,
                                startTime = slotStartTime.trim(),
                                endTime = slotEndTime.trim(),
                                maxCapacity = capVal,
                                bookedCount = 0,
                                isPublished = true
                            )
                            coroutineScope.launch {
                                val created = slotRepository?.createSlot(newSlot)
                                if (created != null) {
                                    actionMessage = "✓ Slot published for $selectedDate (${doc.fullName}: ${format12h(newSlot.startTime)} - ${format12h(newSlot.endTime)})!"
                                    slots = (slots + created).sortedBy { it.startTime }
                                    allClinicSlots = allClinicSlots + created
                                } else {
                                    actionMessage = "✓ Slot published for $selectedDate (${doc.fullName})!"
                                    loadSlots()
                                }
                                showAddSlotDialog = false
                            }
                        },
                        colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF0097A7)),
                        enabled = !hasTimeError && (selectedDoctor != null || doctors.isNotEmpty())
                    ) {
                        Text("Add slot", color = Color.White, fontWeight = FontWeight.Bold)
                    }
                },
                dismissButton = {
                    TextButton(onClick = { showAddSlotDialog = false }) { Text("Cancel") }
                }
            )

            if (showSlotStartTimePicker) {
                TimeCarouselPickerDialog(
                    initialTime = slotStartTime,
                    minTimeMinutes = if (isDateToday) currentMinutesToday else null,
                    title = "Select Slot Start Time",
                    onDismiss = { showSlotStartTimePicker = false },
                    onTimeSelected = { picked ->
                        slotStartTime = picked
                        slotEndTime = DateTimePickers.addMinutesToTime(picked, 15)
                    }
                )
            }

            if (showSlotEndTimePicker) {
                TimeCarouselPickerDialog(
                    initialTime = slotEndTime,
                    minTimeMinutes = startMinutes,
                    title = "Select Slot End Time",
                    onDismiss = { showSlotEndTimePicker = false },
                    onTimeSelected = { picked -> slotEndTime = picked }
                )
            }
        }

        // Slot Deletion Confirmation Dialog
        if (slotToDelete != null) {
            val targetSlot = slotToDelete!!
            AlertDialog(
                onDismissRequest = { slotToDelete = null },
                title = { Text("Delete OPD Slot?", fontWeight = FontWeight.Bold) },
                text = {
                    Text("Are you sure you want to delete the slot ${format12h(targetSlot.startTime)} - ${format12h(targetSlot.endTime)} on ${targetSlot.slotDate}? If patients have already booked, their appointments may be affected.")
                },
                confirmButton = {
                    Button(
                        onClick = {
                            coroutineScope.launch {
                                val ok = slotRepository?.deleteSlot(targetSlot.id) ?: false
                                if (ok) {
                                    actionMessage = "✓ Slot deleted successfully."
                                    slots = slots.filter { it.id != targetSlot.id }
                                    allClinicSlots = allClinicSlots.filter { it.id != targetSlot.id }
                                } else {
                                    actionMessage = "Failed to delete slot."
                                }
                                slotToDelete = null
                            }
                        },
                        colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFDC2626))
                    ) {
                        Text("Delete", color = Color.White)
                    }
                },
                dismissButton = {
                    TextButton(onClick = { slotToDelete = null }) { Text("Cancel") }
                }
            )
        }

        // Reschedule Dialog
        if (showRescheduleDialog && selectedApptForReschedule != null) {
            val appt = selectedApptForReschedule!!
            AlertDialog(
                onDismissRequest = { showRescheduleDialog = false },
                title = { Text("Shift Appointment Date / Time", fontWeight = FontWeight.Bold) },
                text = {
                    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        Text("Patient: ${appt.patientName} (${appt.trackingCode10Digit})", fontSize = 13.sp)
                        OutlinedTextField(
                            value = newDateInput,
                            onValueChange = { newDateInput = it },
                            label = { Text("New Date (YYYY-MM-DD)") },
                            modifier = Modifier.fillMaxWidth(),
                            shape = RoundedCornerShape(10.dp)
                        )
                        OutlinedTextField(
                            value = newTimeInput,
                            onValueChange = { newTimeInput = it },
                            label = { Text("New Time (HH:mm)") },
                            modifier = Modifier.fillMaxWidth(),
                            shape = RoundedCornerShape(10.dp)
                        )
                    }
                },
                confirmButton = {
                    Button(
                        onClick = {
                            coroutineScope.launch {
                                appointmentRepository?.rescheduleAppointment(
                                    id = appt.id,
                                    newDate = newDateInput.trim(),
                                    newTime = newTimeInput.trim(),
                                    newSlotId = null
                                )
                                actionMessage = "✓ Appointment date shifted to $newDateInput!"
                                loadAppointments()
                                showRescheduleDialog = false
                            }
                        },
                        colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF0097A7))
                    ) {
                        Text("Confirm Shift", color = Color.White, fontWeight = FontWeight.Bold)
                    }
                },
                dismissButton = {
                    TextButton(onClick = { showRescheduleDialog = false }) { Text("Cancel") }
                }
            )
        }

        // Edit Remark Dialog
        editingRemarkAppt?.let { appt ->
            AlertDialog(
                onDismissRequest = { if (!isSavingRemark) editingRemarkAppt = null },
                title = { Text("Edit Visit Remarks (${appt.appointmentDate})", fontWeight = FontWeight.Bold, fontSize = 16.sp) },
                text = {
                    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text("Patient: ${appt.patientName} (${appt.trackingCode10Digit})", fontSize = 12.sp, color = Color(0xFF64748B))
                        OutlinedTextField(
                            value = remarkTextInput,
                            onValueChange = { remarkTextInput = it },
                            label = { Text("Clinical Remarks & Diagnosis") },
                            minLines = 3,
                            modifier = Modifier.fillMaxWidth(),
                            shape = RoundedCornerShape(10.dp)
                        )
                    }
                },
                confirmButton = {
                    Button(
                        onClick = {
                            coroutineScope.launch {
                                isSavingRemark = true
                                val textToSave = com.dactor.clinic.domain.util.PaymentLedgerHelper.extractCleanClinicalRemarks(remarkTextInput).trim()
                                val ok = billingRepository?.saveRemarkForAppointment(appt.id, appt.clinicId, textToSave) ?: false
                                if (ok) {
                                    remarksMap = remarksMap + (appt.id to textToSave)
                                    actionMessage = "✓ Remarks saved to server for ${appt.patientName}!"
                                }
                                isSavingRemark = false
                                editingRemarkAppt = null
                            }
                        },
                        colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF0097A7)),
                        enabled = !isSavingRemark
                    ) {
                        Text("Save to Server", color = Color.White, fontWeight = FontWeight.Bold)
                    }
                },
                dismissButton = {
                    TextButton(onClick = { editingRemarkAppt = null }, enabled = !isSavingRemark) { Text("Cancel") }
                }
            )
        }
    }
}
