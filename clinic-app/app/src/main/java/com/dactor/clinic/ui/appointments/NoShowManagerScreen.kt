package com.dactor.clinic.ui.appointments

import android.app.DatePickerDialog
import android.content.Intent
import android.net.Uri
import android.widget.Toast
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
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
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.navigation.NavController
import com.dactor.clinic.data.local.UserSessionManager
import com.dactor.clinic.data.model.Appointment
import com.dactor.clinic.data.model.Doctor
import com.dactor.clinic.data.model.Slot
import com.dactor.clinic.data.repository.AppointmentRepository
import com.dactor.clinic.data.repository.DoctorRepository
import com.dactor.clinic.data.repository.QueueRepository
import com.dactor.clinic.data.repository.SlotRepository
import kotlinx.coroutines.launch
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.time.temporal.ChronoUnit
import java.util.Locale

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NoShowManagerScreen(
    navController: NavController,
    clinicId: String = "",
    appointmentRepository: AppointmentRepository? = null,
    doctorRepository: DoctorRepository? = null,
    queueRepository: QueueRepository? = null,
    slotRepository: SlotRepository? = null
) {
    val context = LocalContext.current
    val clipboardManager = LocalClipboardManager.current
    val effectiveClinicId = remember(clinicId) {
        if (clinicId.isNotBlank() && clinicId != "c1") clinicId
        else UserSessionManager(context).getSavedClinicId() ?: ""
    }

    val coroutineScope = rememberCoroutineScope()
    val today = remember { LocalDate.now() }
    val todayStr = remember(today) { today.toString() }

    var allAppointments by remember(effectiveClinicId) { mutableStateOf<List<Appointment>>(emptyList()) }
    var doctors by remember(effectiveClinicId) { mutableStateOf<List<Doctor>>(emptyList()) }
    var isLoading by remember { mutableStateOf(true) }
    var searchQuery by remember { mutableStateOf("") }
    var actionBanner by remember { mutableStateOf<String?>(null) }

    // Filter controls: "ALL", "YESTERDAY", "LAST_7_DAYS", "THIS_MONTH", or explicit date
    var selectedDateFilter by remember { mutableStateOf("ALL") }
    var selectedDoctorFilterId by remember { mutableStateOf<String?>(null) }
    var showCustomDatePicker by remember { mutableStateOf(false) }

    // Reschedule dialog state
    var selectedApptForReschedule by remember { mutableStateOf<Appointment?>(null) }
    var rescheduleTargetDoctorId by remember { mutableStateOf("") }
    var newDateInput by remember { mutableStateOf(today.plusDays(1).toString()) }
    var newTimeInput by remember { mutableStateOf("10:00") }
    var selectedSlotId by remember { mutableStateOf<String?>(null) }
    var availableSlotsForReschedule by remember { mutableStateOf<List<Slot>>(emptyList()) }
    var isLoadingSlots by remember { mutableStateOf(false) }
    var isRescheduling by remember { mutableStateOf(false) }
    var showRescheduleDatePicker by remember { mutableStateOf(false) }

    suspend fun loadData() {
        if (effectiveClinicId.isNotBlank()) {
            isLoading = true
            // 1. Automatically check and sweep any past-day uncompleted appointments to 'no_show'
            try {
                queueRepository?.autoTransferUncompletedQueueToNoShow(effectiveClinicId, includeTodayExpired = false)
            } catch (ignored: Exception) {}

            // 2. Fetch fresh appointment records
            val freshAppts = appointmentRepository?.getAppointmentsByClinic(effectiveClinicId) ?: emptyList()
            allAppointments = freshAppts

            if (doctorRepository != null) {
                doctors = doctorRepository.getDoctorsByClinic(effectiveClinicId)
            }
            isLoading = false
        }
    }

    LaunchedEffect(effectiveClinicId) {
        loadData()
    }

    // Load available slots when reschedule date or doctor changes
    LaunchedEffect(newDateInput, rescheduleTargetDoctorId, selectedApptForReschedule) {
        if (selectedApptForReschedule != null && slotRepository != null && effectiveClinicId.isNotBlank() && newDateInput.isNotBlank()) {
            isLoadingSlots = true
            try {
                val slots = slotRepository.getSlots(effectiveClinicId, newDateInput)
                availableSlotsForReschedule = if (rescheduleTargetDoctorId.isNotBlank()) {
                    val matching = slots.filter { it.doctorId == rescheduleTargetDoctorId }
                    if (matching.isNotEmpty()) matching else slots.filter { it.doctorId.isNullOrBlank() }
                } else slots
            } catch (e: Exception) {
                availableSlotsForReschedule = emptyList()
            } finally {
                isLoadingSlots = false
            }
        }
    }

    // Date formatters
    val fullDateFormatter = remember { DateTimeFormatter.ofPattern("EEEE, d MMMM yyyy", Locale.US) }
    val shortDateFormatter = remember { DateTimeFormatter.ofPattern("d MMM yyyy", Locale.US) }

    // All missed appointments (Status is explicitly 'no_show', 'cancelled' after scheduled, or past-day uncompleted)
    val allNoShows = remember(allAppointments, todayStr) {
        allAppointments.filter { appt ->
            appt.checkinStatus == "no_show" ||
                    appt.checkinStatus == "cancelled" ||
                    (appt.appointmentDate.isNotBlank() && appt.appointmentDate < todayStr &&
                            appt.checkinStatus != "completed" && appt.checkinStatus != "done")
        }
    }

    // Filtered by Search, Doctor, and Date Range
    val filteredNoShows = remember(allNoShows, searchQuery, selectedDoctorFilterId, selectedDateFilter, today) {
        allNoShows.filter { appt ->
            val matchesSearch = searchQuery.isBlank() ||
                    appt.patientName.contains(searchQuery, ignoreCase = true) ||
                    appt.patientMobile.contains(searchQuery) ||
                    appt.trackingCode10Digit.contains(searchQuery) ||
                    (doctors.find { it.id == appt.doctorId }?.fullName?.contains(searchQuery, ignoreCase = true) == true)

            val matchesDoctor = selectedDoctorFilterId == null || appt.doctorId == selectedDoctorFilterId

            val matchesDate = when (selectedDateFilter) {
                "ALL" -> true
                "YESTERDAY" -> appt.appointmentDate == today.minusDays(1).toString()
                "LAST_7_DAYS" -> {
                    try {
                        val parsed = LocalDate.parse(appt.appointmentDate)
                        !parsed.isBefore(today.minusDays(7)) && parsed.isBefore(today)
                    } catch (_: Exception) { false }
                }
                "THIS_MONTH" -> appt.appointmentDate.startsWith(today.toString().substring(0, 7))
                else -> appt.appointmentDate == selectedDateFilter
            }

            matchesSearch && matchesDoctor && matchesDate
        }
    }

    // Group arranged DATE-WISE in descending order (most recent missed day first)
    val datewiseGroupedNoShows = remember(filteredNoShows) {
        filteredNoShows
            .groupBy { it.appointmentDate }
            .toList()
            .sortedByDescending { it.first } // Newest missed date first
    }

    // Custom Date Picker Dialog
    if (showCustomDatePicker) {
        val initialDate = try {
            if (selectedDateFilter.length == 10) LocalDate.parse(selectedDateFilter) else today.minusDays(1)
        } catch (_: Exception) { today.minusDays(1) }

        DatePickerDialog(
            context,
            { _, year, month, dayOfMonth ->
                val chosen = LocalDate.of(year, month + 1, dayOfMonth)
                selectedDateFilter = chosen.toString()
                showCustomDatePicker = false
            },
            initialDate.year,
            initialDate.monthValue - 1,
            initialDate.dayOfMonth
        ).apply {
            datePicker.maxDate = System.currentTimeMillis() - 86400000L // Up to yesterday
        }.show()
        showCustomDatePicker = false
    }

    // Reschedule Date Picker Dialog
    if (showRescheduleDatePicker) {
        val initialDate = try {
            if (newDateInput.length == 10) LocalDate.parse(newDateInput) else today.plusDays(1)
        } catch (_: Exception) { today.plusDays(1) }

        DatePickerDialog(
            context,
            { _, year, month, dayOfMonth ->
                val chosen = LocalDate.of(year, month + 1, dayOfMonth)
                newDateInput = chosen.toString()
                selectedSlotId = null
                showRescheduleDatePicker = false
            },
            initialDate.year,
            initialDate.monthValue - 1,
            initialDate.dayOfMonth
        ).apply {
            datePicker.minDate = System.currentTimeMillis() // Today or future
        }.show()
        showRescheduleDatePicker = false
    }

    Scaffold(
        containerColor = Color(0xFFF8FAFC),
        topBar = {
            Surface(
                color = Color.White,
                shadowElevation = 0.5.dp
            ) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .statusBarsPadding()
                ) {
                    TopAppBar(
                        title = {
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(8.dp)
                            ) {
                                Surface(
                                    shape = RoundedCornerShape(8.dp),
                                    color = Color(0xFFDC2626),
                                    modifier = Modifier.size(28.dp)
                                ) {
                                    Box(contentAlignment = Alignment.Center) {
                                        Icon(
                                            Icons.Default.EventBusy,
                                            contentDescription = null,
                                            tint = Color.White,
                                            modifier = Modifier.size(16.dp)
                                        )
                                    }
                                }
                                Text(
                                    "No-Show Patients Directory",
                                    fontWeight = FontWeight.Bold,
                                    fontSize = 16.5.sp,
                                    color = Color(0xFF0F172A),
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis
                                )
                            }
                        },
                        navigationIcon = {
                            IconButton(onClick = { navController.popBackStack() }) {
                                Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back", tint = Color(0xFF0F172A))
                            }
                        },
                        actions = {
                            IconButton(onClick = { coroutineScope.launch { loadData() } }) {
                                Icon(Icons.Default.Refresh, contentDescription = "Refresh", tint = Color(0xFF0F172A))
                            }
                        },
                        colors = TopAppBarDefaults.topAppBarColors(containerColor = Color.White),
                        windowInsets = WindowInsets(0, 0, 0, 0)
                    )
                    Text(
                        "Audit missed visits date-wise, call patients & arrange new appointment dates",
                        fontSize = 11.5.sp,
                        color = Color(0xFF64748B),
                        modifier = Modifier.padding(start = 16.dp, end = 16.dp, bottom = 10.dp)
                    )
                }
            }
        }
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(horizontal = 16.dp)
        ) {
            Spacer(modifier = Modifier.height(10.dp))

            // Action / Success Banner
            if (actionBanner != null) {
                Surface(
                    shape = RoundedCornerShape(12.dp),
                    color = Color(0xFFDCFCE7),
                    border = BorderStroke(1.dp, Color(0xFF86EFAC)),
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(bottom = 10.dp)
                ) {
                    Row(
                        modifier = Modifier.padding(horizontal = 14.dp, vertical = 10.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                            modifier = Modifier.weight(1f)
                        ) {
                            Icon(Icons.Default.CheckCircle, contentDescription = null, tint = Color(0xFF16A34A), modifier = Modifier.size(18.dp))
                            Text(actionBanner ?: "", fontSize = 12.sp, fontWeight = FontWeight.SemiBold, color = Color(0xFF166534))
                        }
                        IconButton(onClick = { actionBanner = null }, modifier = Modifier.size(24.dp)) {
                            Icon(Icons.Default.Close, contentDescription = "Close", tint = Color(0xFF166534), modifier = Modifier.size(14.dp))
                        }
                    }
                }
            }

            // Metric Summary Cards
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                // Card 1: Total Missed Patients
                Surface(
                    color = Color(0xFFFEF2F2),
                    shape = RoundedCornerShape(16.dp),
                    border = BorderStroke(1.dp, Color(0xFFFECACA)),
                    modifier = Modifier.weight(1f)
                ) {
                    Row(
                        modifier = Modifier.padding(14.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(10.dp)
                    ) {
                        Surface(shape = CircleShape, color = Color(0xFFFCA5A5), modifier = Modifier.size(36.dp)) {
                            Box(contentAlignment = Alignment.Center) {
                                Icon(Icons.Default.PersonOff, contentDescription = null, tint = Color(0xFF991B1B), modifier = Modifier.size(20.dp))
                            }
                        }
                        Column {
                            Text(
                                text = "${allNoShows.size}",
                                fontWeight = FontWeight.ExtraBold,
                                fontSize = 22.sp,
                                color = Color(0xFFDC2626)
                            )
                            Text(
                                text = "Total Missed Visits",
                                fontSize = 11.sp,
                                fontWeight = FontWeight.SemiBold,
                                color = Color(0xFF991B1B)
                            )
                        }
                    }
                }

                // Card 2: Distinct Missed Dates
                Surface(
                    color = Color(0xFFFFFBEB),
                    shape = RoundedCornerShape(16.dp),
                    border = BorderStroke(1.dp, Color(0xFFFDE68A)),
                    modifier = Modifier.weight(1f)
                ) {
                    Row(
                        modifier = Modifier.padding(14.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(10.dp)
                    ) {
                        Surface(shape = CircleShape, color = Color(0xFFFDE68A), modifier = Modifier.size(36.dp)) {
                            Box(contentAlignment = Alignment.Center) {
                                Icon(Icons.Default.CalendarToday, contentDescription = null, tint = Color(0xFF92400E), modifier = Modifier.size(18.dp))
                            }
                        }
                        Column {
                            val distinctDatesCount = allNoShows.map { it.appointmentDate }.distinct().size
                            Text(
                                text = "$distinctDatesCount",
                                fontWeight = FontWeight.ExtraBold,
                                fontSize = 22.sp,
                                color = Color(0xFFD97706)
                            )
                            Text(
                                text = "Affected Dates",
                                fontSize = 11.sp,
                                fontWeight = FontWeight.SemiBold,
                                color = Color(0xFF92400E)
                            )
                        }
                    }
                }
            }

            Spacer(modifier = Modifier.height(10.dp))

            // Search Bar
            OutlinedTextField(
                value = searchQuery,
                onValueChange = { searchQuery = it },
                placeholder = { Text("Search") },
                leadingIcon = { Icon(Icons.Default.Search, contentDescription = null, tint = Color(0xFF64748B)) },
                trailingIcon = {
                    if (searchQuery.isNotEmpty()) {
                        IconButton(onClick = { searchQuery = "" }) {
                            Icon(Icons.Default.Clear, contentDescription = "Clear", tint = Color(0xFF64748B))
                        }
                    }
                },
                singleLine = true,
                shape = RoundedCornerShape(12.dp),
                colors = OutlinedTextFieldDefaults.colors(
                    focusedContainerColor = Color.White,
                    unfocusedContainerColor = Color.White
                ),
                modifier = Modifier.fillMaxWidth()
            )

            Spacer(modifier = Modifier.height(10.dp))

            // Date Range Quick Filter Pills
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .horizontalScroll(rememberScrollState()),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text("Date Filter:", fontSize = 11.sp, fontWeight = FontWeight.Bold, color = Color(0xFF64748B))

                FilterChip(
                    selected = selectedDateFilter == "ALL",
                    onClick = { selectedDateFilter = "ALL" },
                    label = { Text("All Dates (${allNoShows.size})", fontSize = 11.5.sp) },
                    colors = FilterChipDefaults.filterChipColors(
                        selectedContainerColor = Color(0xFFDC2626),
                        selectedLabelColor = Color.White
                    )
                )

                FilterChip(
                    selected = selectedDateFilter == "YESTERDAY",
                    onClick = { selectedDateFilter = "YESTERDAY" },
                    label = { Text("Yesterday", fontSize = 11.5.sp) },
                    colors = FilterChipDefaults.filterChipColors(
                        selectedContainerColor = Color(0xFFDC2626),
                        selectedLabelColor = Color.White
                    )
                )

                FilterChip(
                    selected = selectedDateFilter == "LAST_7_DAYS",
                    onClick = { selectedDateFilter = "LAST_7_DAYS" },
                    label = { Text("Past 7 Days", fontSize = 11.5.sp) },
                    colors = FilterChipDefaults.filterChipColors(
                        selectedContainerColor = Color(0xFFDC2626),
                        selectedLabelColor = Color.White
                    )
                )

                FilterChip(
                    selected = selectedDateFilter == "THIS_MONTH",
                    onClick = { selectedDateFilter = "THIS_MONTH" },
                    label = { Text("This Month", fontSize = 11.5.sp) },
                    colors = FilterChipDefaults.filterChipColors(
                        selectedContainerColor = Color(0xFFDC2626),
                        selectedLabelColor = Color.White
                    )
                )

                val isCustomDate = selectedDateFilter.length == 10 && selectedDateFilter != "YESTERDAY"
                FilterChip(
                    selected = isCustomDate,
                    onClick = { showCustomDatePicker = true },
                    label = {
                        Text(
                            text = if (isCustomDate) "Date: $selectedDateFilter" else "Pick Date...",
                            fontSize = 11.5.sp
                        )
                    },
                    leadingIcon = {
                        Icon(Icons.Default.DateRange, contentDescription = null, modifier = Modifier.size(14.dp))
                    },
                    colors = FilterChipDefaults.filterChipColors(
                        selectedContainerColor = Color(0xFFDC2626),
                        selectedLabelColor = Color.White
                    )
                )
            }

            // Doctor Filter Chips (if multiple doctors exist)
            if (doctors.size > 1) {
                Spacer(modifier = Modifier.height(6.dp))
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .horizontalScroll(rememberScrollState()),
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text("Doctor:", fontSize = 11.sp, fontWeight = FontWeight.Bold, color = Color(0xFF64748B))

                    SuggestionChip(
                        onClick = { selectedDoctorFilterId = null },
                        label = { Text("All Doctors", fontSize = 11.sp, fontWeight = if (selectedDoctorFilterId == null) FontWeight.Bold else FontWeight.Normal) },
                        colors = SuggestionChipDefaults.suggestionChipColors(
                            containerColor = if (selectedDoctorFilterId == null) Color(0xFFE2E8F0) else Color.White
                        )
                    )

                    doctors.forEach { doc ->
                        val isSelected = selectedDoctorFilterId == doc.id
                        val cleanName = doc.fullName.removePrefix("Dr. ").removePrefix("Dr.")
                        SuggestionChip(
                            onClick = { selectedDoctorFilterId = if (isSelected) null else doc.id },
                            label = { Text("Dr. $cleanName", fontSize = 11.sp, fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Normal) },
                            colors = SuggestionChipDefaults.suggestionChipColors(
                                containerColor = if (isSelected) Color(0xFF0097A7).copy(alpha = 0.15f) else Color.White
                            ),
                            border = SuggestionChipDefaults.suggestionChipBorder(
                                enabled = true,
                                borderColor = if (isSelected) Color(0xFF0097A7) else Color(0xFFCBD5E1)
                            )
                        )
                    }
                }
            }

            Spacer(modifier = Modifier.height(10.dp))

            // Content Area
            if (isLoading) {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(color = Color(0xFFDC2626))
                }
            } else if (datewiseGroupedNoShows.isEmpty()) {
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(top = 40.dp),
                    contentAlignment = Alignment.Center
                ) {
                    Column(
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Surface(shape = CircleShape, color = Color(0xFFDCFCE7), modifier = Modifier.size(64.dp)) {
                            Box(contentAlignment = Alignment.Center) {
                                Icon(
                                    Icons.Default.CheckCircle,
                                    contentDescription = null,
                                    tint = Color(0xFF16A34A),
                                    modifier = Modifier.size(36.dp)
                                )
                            }
                        }
                        Text(
                            text = "Zero No-Show Patients",
                            fontWeight = FontWeight.Bold,
                            fontSize = 16.sp,
                            color = Color(0xFF0F172A)
                        )
                        Text(
                            text = if (searchQuery.isNotBlank() || selectedDateFilter != "ALL" || selectedDoctorFilterId != null) {
                                "No missed appointments match your current search/filter criteria."
                            } else {
                                "All scheduled patients have attended their visits or no past missed visits exist."
                            },
                            fontSize = 12.sp,
                            color = Color(0xFF64748B),
                            textAlign = TextAlign.Center,
                            modifier = Modifier.padding(horizontal = 32.dp)
                        )
                    }
                }
            } else {
                // LazyColumn arranged DATE-WISE with sticky/prominent Date Headers
                LazyColumn(
                    verticalArrangement = Arrangement.spacedBy(16.dp),
                    contentPadding = PaddingValues(bottom = 36.dp),
                    modifier = Modifier.fillMaxSize()
                ) {
                    datewiseGroupedNoShows.forEach { (dateStr, apptsInDate) ->
                        // 1. Date Header
                        item(key = "header_$dateStr") {
                            val relativeLabel = try {
                                val parsed = LocalDate.parse(dateStr)
                                val daysDiff = ChronoUnit.DAYS.between(parsed, today)
                                when (daysDiff) {
                                    1L -> "Yesterday"
                                    2L -> "2 days ago"
                                    in 3L..7L -> "$daysDiff days ago"
                                    else -> parsed.format(shortDateFormatter)
                                }
                            } catch (_: Exception) { dateStr }

                            val formattedFullDate = try {
                                LocalDate.parse(dateStr).format(fullDateFormatter)
                            } catch (_: Exception) { dateStr }

                            Surface(
                                shape = RoundedCornerShape(12.dp),
                                color = Color(0xFFF1F5F9),
                                border = BorderStroke(1.dp, Color(0xFFE2E8F0)),
                                modifier = Modifier.fillMaxWidth()
                            ) {
                                Row(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .padding(horizontal = 14.dp, vertical = 8.dp),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Row(
                                        verticalAlignment = Alignment.CenterVertically,
                                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                                    ) {
                                        Icon(
                                            Icons.Default.CalendarToday,
                                            contentDescription = null,
                                            tint = Color(0xFFDC2626),
                                            modifier = Modifier.size(16.dp)
                                        )
                                        Column {
                                            Text(
                                                text = formattedFullDate,
                                                fontWeight = FontWeight.Bold,
                                                fontSize = 13.5.sp,
                                                color = Color(0xFF0F172A)
                                            )
                                            Text(
                                                text = relativeLabel,
                                                fontSize = 11.sp,
                                                fontWeight = FontWeight.SemiBold,
                                                color = Color(0xFF64748B)
                                            )
                                        }
                                    }

                                    Surface(
                                        shape = RoundedCornerShape(8.dp),
                                        color = Color(0xFFFEF2F2),
                                        border = BorderStroke(1.dp, Color(0xFFFECACA))
                                    ) {
                                        Text(
                                            text = "${apptsInDate.size} Missed",
                                            fontWeight = FontWeight.Bold,
                                            fontSize = 11.sp,
                                            color = Color(0xFFDC2626),
                                            modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
                                        )
                                    }
                                }
                            }
                        }

                        // 2. Patient Cards for this Date
                        items(apptsInDate, key = { it.id }) { appt ->
                            val assignedDoctor = doctors.find { it.id == appt.doctorId }
                            NoShowPatientCard(
                                appointment = appt,
                                doctor = assignedDoctor,
                                onCallPatient = { phone ->
                                    if (phone.isNotBlank()) {
                                        val intent = Intent(Intent.ACTION_DIAL).apply {
                                            data = Uri.parse("tel:${phone.trim()}")
                                        }
                                        context.startActivity(intent)
                                    } else {
                                        Toast.makeText(context, "No phone number recorded for this patient", Toast.LENGTH_SHORT).show()
                                    }
                                },
                                onCopyTrackingCode = { code ->
                                    clipboardManager.setText(AnnotatedString(code))
                                    Toast.makeText(context, "Copied tracking code #$code", Toast.LENGTH_SHORT).show()
                                },
                                onOpenReschedule = {
                                    selectedApptForReschedule = appt
                                    rescheduleTargetDoctorId = appt.doctorId ?: ""
                                    newDateInput = today.toString()
                                    newTimeInput = appt.appointmentTime.ifBlank { "10:00" }
                                    selectedSlotId = null
                                }
                            )
                        }
                    }
                }
            }
        }
    }

    // =========================================================================
    // RESCHEDULE APPOINTMENT MODAL DIALOG (SLOT-AWARE WITH DOCTOR & DATE PICKER)
    // =========================================================================
    if (selectedApptForReschedule != null) {
        val appt = selectedApptForReschedule!!
        Dialog(onDismissRequest = { if (!isRescheduling) selectedApptForReschedule = null }) {
            Surface(
                shape = RoundedCornerShape(20.dp),
                color = Color.White,
                border = BorderStroke(1.dp, Color(0xFFE2E8F0)),
                shadowElevation = 8.dp,
                modifier = Modifier
                    .fillMaxWidth(0.96f)
                    .wrapContentHeight()
            ) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(20.dp),
                    verticalArrangement = Arrangement.spacedBy(14.dp)
                ) {
                    // Header
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            Surface(
                                shape = RoundedCornerShape(8.dp),
                                color = Color(0xFF0097A7),
                                modifier = Modifier.size(32.dp)
                            ) {
                                Box(contentAlignment = Alignment.Center) {
                                    Icon(Icons.Default.EventRepeat, contentDescription = null, tint = Color.White, modifier = Modifier.size(18.dp))
                                }
                            }
                            Column {
                                Text("Reschedule Missed Visit", fontWeight = FontWeight.Bold, fontSize = 16.sp, color = Color(0xFF0F172A))
                                Text("Arrange new date & slot for patient", fontSize = 11.sp, color = Color(0xFF64748B))
                            }
                        }
                        IconButton(onClick = { selectedApptForReschedule = null }, enabled = !isRescheduling, modifier = Modifier.size(28.dp)) {
                            Icon(Icons.Default.Close, contentDescription = "Close", tint = Color(0xFF64748B))
                        }
                    }

                    // Patient Summary Banner
                    Surface(
                        shape = RoundedCornerShape(12.dp),
                        color = Color(0xFFF8FAFC),
                        border = BorderStroke(1.dp, Color(0xFFE2E8F0)),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Row(
                            modifier = Modifier.padding(12.dp),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Column {
                                Text(appt.patientName, fontWeight = FontWeight.Bold, fontSize = 14.sp, color = Color(0xFF0F172A))
                                Text("Code: #${appt.trackingCode10Digit} • ${appt.patientMobile}", fontSize = 11.sp, color = Color(0xFF0284C7), fontFamily = FontFamily.Monospace)
                            }
                            Surface(shape = RoundedCornerShape(6.dp), color = Color(0xFFFEE2E2)) {
                                Text(
                                    "Missed: ${appt.appointmentDate}",
                                    fontSize = 10.sp,
                                    fontWeight = FontWeight.Bold,
                                    color = Color(0xFFDC2626),
                                    modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
                                )
                            }
                        }
                    }

                    // Doctor Selector (if multiple doctors exist)
                    if (doctors.isNotEmpty()) {
                        Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                            Text("Consulting Doctor", fontSize = 12.sp, fontWeight = FontWeight.Bold, color = Color(0xFF334155))
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .horizontalScroll(rememberScrollState()),
                                horizontalArrangement = Arrangement.spacedBy(6.dp)
                            ) {
                                FilterChip(
                                    selected = rescheduleTargetDoctorId.isBlank(),
                                    onClick = {
                                        rescheduleTargetDoctorId = ""
                                        selectedSlotId = null
                                    },
                                    label = { Text("All / General Slots", fontSize = 11.sp) },
                                    colors = FilterChipDefaults.filterChipColors(
                                        selectedContainerColor = Color(0xFF0097A7),
                                        selectedLabelColor = Color.White
                                    )
                                )
                                doctors.forEach { doc ->
                                    val isSelected = rescheduleTargetDoctorId == doc.id
                                    FilterChip(
                                        selected = isSelected,
                                        onClick = {
                                            rescheduleTargetDoctorId = doc.id
                                            selectedSlotId = null
                                        },
                                        label = { Text("Dr. ${doc.fullName.removePrefix("Dr. ").removePrefix("Dr.")}", fontSize = 11.sp) },
                                        colors = FilterChipDefaults.filterChipColors(
                                            selectedContainerColor = Color(0xFF0097A7),
                                            selectedLabelColor = Color.White
                                        )
                                    )
                                }
                            }
                        }
                    }

                    // Date Selection Row & Quick Date Chips
                    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        Text("New Appointment Date", fontSize = 12.sp, fontWeight = FontWeight.Bold, color = Color(0xFF334155))

                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            OutlinedTextField(
                                value = newDateInput,
                                onValueChange = {
                                    newDateInput = it
                                    selectedSlotId = null
                                },
                                label = { Text("Date (YYYY-MM-DD)") },
                                singleLine = true,
                                shape = RoundedCornerShape(10.dp),
                                modifier = Modifier.weight(1f)
                            )
                            IconButton(
                                onClick = { showRescheduleDatePicker = true },
                                modifier = Modifier
                                    .size(48.dp)
                                    .clip(RoundedCornerShape(10.dp))
                                    .background(Color(0xFFE0F2FE))
                            ) {
                                Icon(Icons.Default.CalendarMonth, contentDescription = "Pick Date", tint = Color(0xFF0284C7))
                            }
                        }

                        // Quick Chips: Today, Tomorrow, +2 Days, +1 Week
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .horizontalScroll(rememberScrollState()),
                            horizontalArrangement = Arrangement.spacedBy(6.dp)
                        ) {
                            SuggestionChip(
                                onClick = {
                                    newDateInput = today.toString()
                                    selectedSlotId = null
                                },
                                label = { Text("Today", fontSize = 11.sp) },
                                colors = SuggestionChipDefaults.suggestionChipColors(
                                    containerColor = if (newDateInput == today.toString()) Color(0xFFE0F2FE) else Color.White
                                )
                            )
                            SuggestionChip(
                                onClick = {
                                    newDateInput = today.plusDays(1).toString()
                                    selectedSlotId = null
                                },
                                label = { Text("Tomorrow", fontSize = 11.sp) },
                                colors = SuggestionChipDefaults.suggestionChipColors(
                                    containerColor = if (newDateInput == today.plusDays(1).toString()) Color(0xFFE0F2FE) else Color.White
                                )
                            )
                            SuggestionChip(
                                onClick = {
                                    newDateInput = today.plusDays(2).toString()
                                    selectedSlotId = null
                                },
                                label = { Text("+2 Days", fontSize = 11.sp) },
                                colors = SuggestionChipDefaults.suggestionChipColors(
                                    containerColor = if (newDateInput == today.plusDays(2).toString()) Color(0xFFE0F2FE) else Color.White
                                )
                            )
                            SuggestionChip(
                                onClick = {
                                    newDateInput = today.plusDays(7).toString()
                                    selectedSlotId = null
                                },
                                label = { Text("+1 Week", fontSize = 11.sp) },
                                colors = SuggestionChipDefaults.suggestionChipColors(
                                    containerColor = if (newDateInput == today.plusDays(7).toString()) Color(0xFFE0F2FE) else Color.White
                                )
                            )
                        }
                    }

                    // Available Published OPD Slots (Dynamic from SlotRepository)
                    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text("Available OPD Slots", fontSize = 12.sp, fontWeight = FontWeight.Bold, color = Color(0xFF334155))
                            if (isLoadingSlots) {
                                CircularProgressIndicator(modifier = Modifier.size(12.dp), strokeWidth = 1.5.dp, color = Color(0xFF0097A7))
                            }
                        }

                        if (availableSlotsForReschedule.isNotEmpty()) {
                            LazyRow(
                                horizontalArrangement = Arrangement.spacedBy(6.dp),
                                modifier = Modifier.fillMaxWidth()
                            ) {
                                items(availableSlotsForReschedule) { slot ->
                                    val isSelected = selectedSlotId == slot.id
                                    val availableCapacity = (slot.maxCapacity - slot.bookedCount).coerceAtLeast(0)
                                    val timeLabel = "${slot.startTime} – ${slot.endTime}"

                                    Surface(
                                        shape = RoundedCornerShape(8.dp),
                                        color = if (isSelected) Color(0xFF0097A7) else Color(0xFFF1F5F9),
                                        border = BorderStroke(1.dp, if (isSelected) Color(0xFF0097A7) else Color(0xFFCBD5E1)),
                                        modifier = Modifier.clickable {
                                            selectedSlotId = slot.id
                                            newTimeInput = slot.startTime
                                        }
                                    ) {
                                        Column(
                                            modifier = Modifier.padding(horizontal = 8.dp, vertical = 6.dp),
                                            horizontalAlignment = Alignment.CenterHorizontally
                                        ) {
                                            Text(
                                                text = timeLabel,
                                                fontSize = 11.sp,
                                                fontWeight = FontWeight.Bold,
                                                color = if (isSelected) Color.White else Color(0xFF0F172A)
                                            )
                                            Text(
                                                text = "$availableCapacity spots left",
                                                fontSize = 9.5.sp,
                                                color = if (isSelected) Color.White.copy(alpha = 0.85f) else Color(0xFF64748B)
                                            )
                                        }
                                    }
                                }
                            }
                        } else {
                            Text(
                                "No published slots for this date/doctor. You can specify custom appointment time below:",
                                fontSize = 11.sp,
                                color = Color(0xFF64748B)
                            )
                        }
                    }

                    // Appointment Time Input
                    OutlinedTextField(
                        value = newTimeInput,
                        onValueChange = { newTimeInput = it },
                        label = { Text("Appointment Time (HH:mm)") },
                        placeholder = { Text("e.g. 10:30") },
                        leadingIcon = { Icon(Icons.Default.AccessTime, contentDescription = null) },
                        singleLine = true,
                        shape = RoundedCornerShape(10.dp),
                        modifier = Modifier.fillMaxWidth()
                    )

                    // Confirm Action Button
                    Button(
                        onClick = {
                            val cleanDate = newDateInput.trim()
                            val cleanTime = newTimeInput.trim()
                            if (cleanDate.length == 10 && cleanTime.isNotBlank()) {
                                isRescheduling = true
                                coroutineScope.launch {
                                    val success = appointmentRepository?.rescheduleAppointment(
                                        id = appt.id,
                                        newDate = cleanDate,
                                        newTime = cleanTime,
                                        newSlotId = selectedSlotId,
                                        newDoctorId = rescheduleTargetDoctorId.ifBlank { null }
                                    ) ?: false

                                    isRescheduling = false
                                    if (success) {
                                        if (cleanDate == today.toString()) {
                                            queueRepository?.getQueueForClinic(effectiveClinicId)
                                            actionBanner = "✓ Rescheduled ${appt.patientName} for Today ($cleanTime) & re-added to live queue!"
                                        } else {
                                            actionBanner = "✓ Rescheduled ${appt.patientName} for $cleanDate at $cleanTime!"
                                        }
                                        selectedApptForReschedule = null
                                        loadData()
                                    } else {
                                        Toast.makeText(context, "Reschedule failed. Please try again.", Toast.LENGTH_SHORT).show()
                                    }
                                }
                            }
                        },
                        shape = RoundedCornerShape(10.dp),
                        colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF0097A7)),
                        enabled = !isRescheduling && newDateInput.isNotBlank() && newTimeInput.isNotBlank(),
                        modifier = Modifier.fillMaxWidth().height(44.dp)
                    ) {
                        if (isRescheduling) {
                            CircularProgressIndicator(color = Color.White, modifier = Modifier.size(16.dp), strokeWidth = 2.dp)
                        } else {
                            Icon(Icons.Default.Check, contentDescription = null, modifier = Modifier.size(16.dp))
                            Spacer(Modifier.width(6.dp))
                            Text("Confirm & Reschedule Appointment", fontWeight = FontWeight.Bold, fontSize = 13.sp)
                        }
                    }
                }
            }
        }
    }
}

/**
 * Dedicated Card presenting ALL patient information with 1-Tap Calling and Rescheduling
 */
@Composable
private fun NoShowPatientCard(
    appointment: Appointment,
    doctor: Doctor?,
    onCallPatient: (String) -> Unit,
    onCopyTrackingCode: (String) -> Unit,
    onOpenReschedule: () -> Unit
) {
    Card(
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = Color.White),
        border = BorderStroke(1.dp, Color(0xFFE2E8F0)),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
        modifier = Modifier.fillMaxWidth()
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            // Row 1: Patient Header (Avatar, Name, Age/Gender, Status Pill)
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.Top
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                    modifier = Modifier.weight(1f)
                ) {
                    Surface(
                        shape = CircleShape,
                        color = Color(0xFFFEE2E2),
                        modifier = Modifier.size(44.dp)
                    ) {
                        Box(contentAlignment = Alignment.Center) {
                            Icon(
                                Icons.Default.PersonOff,
                                contentDescription = null,
                                tint = Color(0xFFDC2626),
                                modifier = Modifier.size(24.dp)
                            )
                        }
                    }

                    Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                        Text(
                            text = appointment.patientName,
                            fontWeight = FontWeight.ExtraBold,
                            fontSize = 15.sp,
                            color = Color(0xFF0F172A)
                        )

                        // Demographic Pill: Age & Gender
                        val demographics = buildList {
                            if ((appointment.patientAge ?: 0) > 0) add("${appointment.patientAge} yrs")
                            if (!appointment.patientGender.isNullOrBlank()) add(appointment.patientGender)
                        }
                        if (demographics.isNotEmpty()) {
                            Text(
                                text = demographics.joinToString(" • "),
                                fontSize = 11.5.sp,
                                fontWeight = FontWeight.SemiBold,
                                color = Color(0xFF0284C7)
                            )
                        }
                    }
                }

                // Red No-Show Badge
                Surface(
                    shape = RoundedCornerShape(8.dp),
                    color = Color(0xFFFEF2F2),
                    border = BorderStroke(1.dp, Color(0xFFFECACA))
                ) {
                    Text(
                        text = "No Show",
                        fontWeight = FontWeight.ExtraBold,
                        fontSize = 11.sp,
                        color = Color(0xFFDC2626),
                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp)
                    )
                }
            }

            // Row 2: Patient Metadata Details (10-Digit Code, Phone, Doctor, Original Slot)
            Surface(
                shape = RoundedCornerShape(12.dp),
                color = Color(0xFFF8FAFC),
                border = BorderStroke(1.dp, Color(0xFFE2E8F0)),
                modifier = Modifier.fillMaxWidth()
            ) {
                Column(
                    modifier = Modifier.padding(12.dp),
                    verticalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    // Tracking Code & Phone Row
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        // 10-Digit Tracking Code with 1-Tap Copy
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(4.dp),
                            modifier = Modifier.clickable { onCopyTrackingCode(appointment.trackingCode10Digit) }
                        ) {
                            Text("Code:", fontSize = 11.sp, color = Color(0xFF64748B))
                            Text(
                                text = "#${appointment.trackingCode10Digit}",
                                fontFamily = FontFamily.Monospace,
                                fontWeight = FontWeight.Bold,
                                fontSize = 12.sp,
                                color = Color(0xFF0284C7)
                            )
                            Icon(Icons.Default.ContentCopy, contentDescription = "Copy", tint = Color(0xFF0284C7), modifier = Modifier.size(12.dp))
                        }

                        // Phone Number
                        if (appointment.patientMobile.isNotBlank()) {
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(4.dp)
                            ) {
                                Icon(Icons.Default.Phone, contentDescription = null, tint = Color(0xFF10B981), modifier = Modifier.size(12.dp))
                                Text(
                                    text = appointment.patientMobile,
                                    fontSize = 11.5.sp,
                                    fontWeight = FontWeight.SemiBold,
                                    color = Color(0xFF0F172A)
                                )
                            }
                        }
                    }

                    HorizontalDivider(color = Color(0xFFE2E8F0), thickness = 0.5.dp)

                    // Doctor & Scheduled Time Row
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        // Assigned Doctor / Service
                        val docName = doctor?.let { "Dr. ${it.fullName.removePrefix("Dr. ").removePrefix("Dr.")}" }
                            ?: appointment.selectedLabTests?.takeIf { it.isNotBlank() }
                            ?: "Diagnostic Sample Collection"
                        val docSpec = doctor?.specialty ?: "Diagnostic Lab"
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(4.dp),
                            modifier = Modifier.weight(1f, fill = false)
                        ) {
                            Icon(Icons.Default.MedicalServices, contentDescription = null, tint = Color(0xFF475569), modifier = Modifier.size(12.dp))
                            Text(
                                text = "$docName • $docSpec",
                                fontSize = 11.sp,
                                color = Color(0xFF334155),
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis
                            )
                        }

                        // Original Slot / Time
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(4.dp)
                        ) {
                            Icon(Icons.Default.AccessTime, contentDescription = null, tint = Color(0xFF475569), modifier = Modifier.size(12.dp))
                            Text(
                                text = appointment.appointmentTime.ifBlank { "OPD Window" },
                                fontSize = 11.sp,
                                fontWeight = FontWeight.Bold,
                                color = Color(0xFF0F172A)
                            )
                        }
                    }
                }
            }

            // Row 3: Action Buttons (Call Patient & Reschedule Appointment)
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                // Button 1: Call Patient (Emerald)
                Button(
                    onClick = { onCallPatient(appointment.patientMobile) },
                    enabled = appointment.patientMobile.isNotBlank(),
                    shape = RoundedCornerShape(10.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF059669)),
                    contentPadding = PaddingValues(horizontal = 12.dp, vertical = 8.dp),
                    modifier = Modifier.weight(1f).height(40.dp)
                ) {
                    Icon(Icons.Default.Phone, contentDescription = null, tint = Color.White, modifier = Modifier.size(15.dp))
                    Spacer(Modifier.width(6.dp))
                    Text("Call Patient", fontWeight = FontWeight.Bold, fontSize = 12.sp, color = Color.White)
                }

                // Button 2: Reschedule Appointment (Pine Teal)
                Button(
                    onClick = onOpenReschedule,
                    shape = RoundedCornerShape(10.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF0097A7)),
                    contentPadding = PaddingValues(horizontal = 12.dp, vertical = 8.dp),
                    modifier = Modifier.weight(1.2f).height(40.dp)
                ) {
                    Icon(Icons.Default.EditCalendar, contentDescription = null, tint = Color.White, modifier = Modifier.size(15.dp))
                    Spacer(Modifier.width(6.dp))
                    Text("Reschedule", fontWeight = FontWeight.Bold, fontSize = 12.sp, color = Color.White)
                }
            }
        }
    }
}
