package com.dactor.clinic.ui.operations

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.navigation.NavController
import com.dactor.clinic.data.local.UserSessionManager
import com.dactor.clinic.data.model.Clinic
import com.dactor.clinic.data.model.ClinicScheduleHelper
import com.dactor.clinic.data.model.DayScheduleInfo
import com.dactor.clinic.data.repository.ClinicRepository
import com.dactor.clinic.data.repository.QueueRepository
import com.dactor.clinic.ui.components.TimeCarouselPickerDialog
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import java.util.Locale

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun WorkingHoursBreakScreen(
    navController: NavController,
    clinicId: String = "",
    clinicRepository: ClinicRepository? = null,
    queueRepository: QueueRepository? = null
) {
    val context = LocalContext.current
    val sessionManager = remember { UserSessionManager(context) }
    var effectiveClinicId by remember(clinicId) {
        mutableStateOf(
            if (clinicId.isNotBlank() && clinicId != "c1") clinicId
            else sessionManager.getSavedClinicId() ?: ""
        )
    }

    val coroutineScope = rememberCoroutineScope()

    var clinic by remember(effectiveClinicId) { mutableStateOf<Clinic?>(null) }
    var weeklyDays by remember(effectiveClinicId) {
        mutableStateOf<List<DayScheduleInfo>>(ClinicScheduleHelper.defaultWeeklySchedule())
    }
    var hasLoadedSchedule by remember(effectiveClinicId) { mutableStateOf(false) }

    // Non-reversing toggle state for Live Clinic Break
    var isClinicOnBreak by remember(effectiveClinicId) { mutableStateOf(false) }
    var lastBreakToggleMs by remember(effectiveClinicId) { mutableStateOf(0L) }
    var isSavingSchedule by remember { mutableStateOf(false) }
    var statusBannerMessage by remember { mutableStateOf<String?>(null) }

    // Time picker state: Pair(dayIndex, fieldType: "open" | "close" | "breakStart" | "breakEnd")
    var activeTimePickerTarget by remember { mutableStateOf<Pair<Int, String>?>(null) }

    fun to24HourForPicker(displayTime: String): String {
        val mins = ClinicScheduleHelper.parseTimeMinutes(displayTime) ?: (9 * 60)
        return String.format(Locale.US, "%02d:%02d", (mins / 60) % 24, mins % 60)
    }

    fun to12HourDisplay(time24: String): String {
        val mins = ClinicScheduleHelper.parseTimeMinutes(time24) ?: (9 * 60)
        return ClinicScheduleHelper.formatMinutesTo12Hour(mins)
    }

    suspend fun loadClinicData(isInitial: Boolean = false) {
        if (clinicRepository == null) return
        if (effectiveClinicId.isBlank()) {
            val savedEmail = sessionManager.getSavedEmail()
            val fallbackClinic = if (!savedEmail.isNullOrBlank()) {
                clinicRepository.getClinicByEmail(savedEmail)
            } else {
                clinicRepository.getClinics().firstOrNull()
            }
            if (fallbackClinic != null) {
                effectiveClinicId = fallbackClinic.id
                sessionManager.saveClinicSession(
                    fallbackClinic.id,
                    fallbackClinic.contactEmail ?: savedEmail ?: "",
                    fallbackClinic.name
                )
            }
        }
        if (effectiveClinicId.isBlank()) return
        val fetched = clinicRepository.getClinicById(effectiveClinicId) ?: return
        clinic = fetched
        if (System.currentTimeMillis() - lastBreakToggleMs > 12_000L) {
            isClinicOnBreak = fetched.isOnBreak ?: false
        }
        if (isInitial || !hasLoadedSchedule) {
            weeklyDays = fetched.getWeeklySchedule()
            hasLoadedSchedule = true
        }
    }

    LaunchedEffect(effectiveClinicId) {
        loadClinicData(isInitial = true)
        while (isActive) {
            delay(6000L)
            loadClinicData(isInitial = false)
        }
    }

    Scaffold(
        containerColor = Color(0xFFF8FAFC),
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text("Working Hours & Break", fontWeight = FontWeight.Bold, fontSize = 18.sp)
                        Text(
                            "Weekly informational schedule & live break toggle",
                            fontSize = 11.sp,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                },
                navigationIcon = {
                    IconButton(onClick = { navController.popBackStack() }) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
                actions = {
                    Button(
                        onClick = {
                            if (clinicRepository == null || isSavingSchedule) return@Button
                            isSavingSchedule = true
                            coroutineScope.launch {
                                if (effectiveClinicId.isBlank()) {
                                    loadClinicData(isInitial = true)
                                }
                                val targetId = effectiveClinicId
                                val ok = if (targetId.isNotBlank()) {
                                    clinicRepository.saveWeeklySchedule(
                                        clinicId = targetId,
                                        days = weeklyDays,
                                        isOnBreak = isClinicOnBreak
                                    )
                                } else null
                                isSavingSchedule = false
                                statusBannerMessage = if (ok != null) {
                                    "✓ Default weekly working hours & break times saved!"
                                } else {
                                    "Failed to save weekly schedule. Please try again."
                                }
                            }
                        },
                        enabled = !isSavingSchedule,
                        shape = RoundedCornerShape(10.dp),
                        colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF2563EB)),
                        contentPadding = PaddingValues(horizontal = 12.dp, vertical = 6.dp),
                        modifier = Modifier.padding(end = 8.dp)
                    ) {
                        Icon(Icons.Default.Save, contentDescription = null, modifier = Modifier.size(16.dp))
                        Spacer(Modifier.width(4.dp))
                        Text(if (isSavingSchedule) "Saving..." else "Save", fontSize = 12.sp, fontWeight = FontWeight.Bold)
                    }
                }
            )
        }
    ) { padding ->
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding),
            contentPadding = PaddingValues(horizontal = 16.dp, vertical = 12.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            if (statusBannerMessage != null) {
                item {
                    Card(
                        shape = RoundedCornerShape(12.dp),
                        colors = CardDefaults.cardColors(containerColor = Color(0xFFD1FAE5)),
                        border = BorderStroke(1.dp, Color(0xFF6EE7B7)),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(horizontal = 14.dp, vertical = 10.dp),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(8.dp),
                                modifier = Modifier.weight(1f)
                            ) {
                                Icon(Icons.Default.CheckCircle, contentDescription = null, tint = Color(0xFF059669), modifier = Modifier.size(18.dp))
                                Text(
                                    text = statusBannerMessage ?: "",
                                    fontSize = 12.5.sp,
                                    fontWeight = FontWeight.SemiBold,
                                    color = Color(0xFF065F46)
                                )
                            }
                            IconButton(onClick = { statusBannerMessage = null }, modifier = Modifier.size(24.dp)) {
                                Icon(Icons.Default.Close, contentDescription = "Dismiss", tint = Color(0xFF065F46), modifier = Modifier.size(15.dp))
                            }
                        }
                    }
                }
            }

            // 1. LIVE CLINIC BREAK TOGGLE CARD
            item {
                Card(
                    shape = RoundedCornerShape(16.dp),
                    colors = CardDefaults.cardColors(
                        containerColor = if (isClinicOnBreak) Color(0xFFFFFBEB) else Color.White
                    ),
                    border = BorderStroke(
                        1.5.dp,
                        if (isClinicOnBreak) Color(0xFFF59E0B) else Color(0xFFE2E8F0)
                    ),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Column(
                        modifier = Modifier.padding(16.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(12.dp),
                                modifier = Modifier.weight(1f)
                            ) {
                                Surface(
                                    shape = CircleShape,
                                    color = if (isClinicOnBreak) Color(0xFFFEF3C7) else Color(0xFFEFF6FF),
                                    modifier = Modifier.size(44.dp)
                                ) {
                                    Box(contentAlignment = Alignment.Center) {
                                        Icon(
                                            Icons.Default.FreeBreakfast,
                                            contentDescription = null,
                                            tint = if (isClinicOnBreak) Color(0xFFD97706) else Color(0xFF2563EB),
                                            modifier = Modifier.size(22.dp)
                                        )
                                    }
                                }
                                Column {
                                    Text(
                                        text = if (isClinicOnBreak) "Clinic is Currently ON BREAK" else "Live Clinic Break Mode",
                                        fontWeight = FontWeight.ExtraBold,
                                        fontSize = 15.sp,
                                        color = if (isClinicOnBreak) Color(0xFF92400E) else Color(0xFF0F172A)
                                    )
                                    Text(
                                        text = if (isClinicOnBreak) {
                                            "All active appointments have been notified. Break badge is active on Live Queue & Appointment Status."
                                        } else {
                                            "Toggle ON when taking a break to immediately notify all active appointments."
                                        },
                                        fontSize = 11.5.sp,
                                        color = if (isClinicOnBreak) Color(0xFFB45309) else Color(0xFF64748B),
                                        lineHeight = 15.sp
                                    )
                                }
                            }
                            Switch(
                                checked = isClinicOnBreak,
                                onCheckedChange = { checked ->
                                    isClinicOnBreak = checked
                                    lastBreakToggleMs = System.currentTimeMillis()
                                    coroutineScope.launch {
                                        if (effectiveClinicId.isBlank()) {
                                            loadClinicData(isInitial = true)
                                        }
                                        val updatedClinic = clinicRepository?.toggleClinicBreak(effectiveClinicId, checked)
                                        if (updatedClinic != null) {
                                            clinic = updatedClinic
                                            if (checked) {
                                                val notifiedCount = queueRepository?.sendClinicBreakNotificationsToActiveAppointments(
                                                    clinicId = effectiveClinicId,
                                                    clinicName = clinic?.name ?: "Clinic"
                                                ) ?: 0
                                                statusBannerMessage = "☕ Clinic Break ON — Notified $notifiedCount active appointment(s)."
                                            } else {
                                                statusBannerMessage = "✓ Clinic Break OFF — Normal operations resumed."
                                            }
                                        } else {
                                            if (System.currentTimeMillis() - lastBreakToggleMs >= 12_000L) {
                                                isClinicOnBreak = !checked
                                            }
                                        }
                                    }
                                },
                                colors = SwitchDefaults.colors(
                                    checkedThumbColor = Color.White,
                                    checkedTrackColor = Color(0xFFD97706)
                                )
                            )
                        }
                    }
                }
            }

            // 2. INFORMATION BANNER
            item {
                Card(
                    shape = RoundedCornerShape(14.dp),
                    colors = CardDefaults.cardColors(containerColor = Color(0xFFEFF6FF)),
                    border = BorderStroke(1.dp, Color(0xFFBFDBFE)),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Row(
                        modifier = Modifier.padding(14.dp),
                        horizontalArrangement = Arrangement.spacedBy(10.dp),
                        verticalAlignment = Alignment.Top
                    ) {
                        Icon(
                            Icons.Default.Info,
                            contentDescription = null,
                            tint = Color(0xFF2563EB),
                            modifier = Modifier.size(20.dp)
                        )
                        Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                            Text(
                                text = "How Weekly Working Hours & Break Time Work",
                                fontWeight = FontWeight.Bold,
                                fontSize = 13.sp,
                                color = Color(0xFF1E3A8A)
                            )
                            Text(
                                text = "• Gives patients a rough estimation of when your clinic is open on each day of the week (default for every week).\n" +
                                    "• Before your clinic opens for the day, patient expected times are calculated from your Opening Time + (Patients Ahead × Average Time).\n" +
                                    "• Working hours are strictly informational and do NOT automatically publish booking slots.\n" +
                                    "• Break hours are only shown to patients when checking their Appointment Status or Live Queue Status.",
                                fontSize = 11.5.sp,
                                color = Color(0xFF1E40AF),
                                lineHeight = 16.sp
                            )
                        }
                    }
                }
            }

            // 3. SECTION HEADER FOR 7 DAYS (SUNDAY - SATURDAY)
            item {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(top = 4.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Column {
                        Text(
                            text = "Weekly Schedule (Sunday – Saturday)",
                            fontWeight = FontWeight.ExtraBold,
                            fontSize = 16.sp,
                            color = Color(0xFF0F172A)
                        )
                        Text(
                            text = "Set normal working hours and break time for each day",
                            fontSize = 12.sp,
                            color = Color(0xFF64748B)
                        )
                    }
                }
            }

            // 4. ALL 7 DAYS CARDS
            itemsIndexed(weeklyDays, key = { _, item -> item.dayName }) { index, dayInfo ->
                Card(
                    shape = RoundedCornerShape(16.dp),
                    colors = CardDefaults.cardColors(
                        containerColor = if (dayInfo.isOpen) Color.White else Color(0xFFF1F5F9)
                    ),
                    border = BorderStroke(
                        1.dp,
                        if (dayInfo.isOpen) Color(0xFFCBD5E1) else Color(0xFFE2E8F0)
                    ),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Column(
                        modifier = Modifier.padding(14.dp),
                        verticalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        // Day Header + Open/Closed Toggle
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(10.dp)
                            ) {
                                Surface(
                                    shape = RoundedCornerShape(10.dp),
                                    color = if (dayInfo.isOpen) Color(0xFFEFF6FF) else Color(0xFFE2E8F0),
                                    modifier = Modifier.size(38.dp)
                                ) {
                                    Box(contentAlignment = Alignment.Center) {
                                        Text(
                                            text = dayInfo.dayName.take(3).uppercase(Locale.US),
                                            fontWeight = FontWeight.ExtraBold,
                                            fontSize = 11.sp,
                                            color = if (dayInfo.isOpen) Color(0xFF2563EB) else Color(0xFF64748B)
                                        )
                                    }
                                }
                                Column {
                                    Text(
                                        text = dayInfo.dayName,
                                        fontWeight = FontWeight.Bold,
                                        fontSize = 15.sp,
                                        color = Color(0xFF0F172A)
                                    )
                                    Text(
                                        text = if (dayInfo.isOpen) {
                                            "Open: ${dayInfo.openTime} – ${dayInfo.closeTime}" +
                                                if (dayInfo.hasBreak) " • Break: ${dayInfo.breakStart} – ${dayInfo.breakEnd}" else ""
                                        } else {
                                            "Closed (Weekly Off)"
                                        },
                                        fontSize = 11.5.sp,
                                        color = if (dayInfo.isOpen) Color(0xFF2563EB) else Color(0xFF64748B),
                                        fontWeight = FontWeight.Medium
                                    )
                                }
                            }

                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(6.dp)
                            ) {
                                Text(
                                    text = if (dayInfo.isOpen) "Open" else "Closed",
                                    fontSize = 12.sp,
                                    fontWeight = FontWeight.Bold,
                                    color = if (dayInfo.isOpen) Color(0xFF2563EB) else Color(0xFF64748B)
                                )
                                Switch(
                                    checked = dayInfo.isOpen,
                                    onCheckedChange = { openChecked ->
                                        weeklyDays = weeklyDays.mapIndexed { idx, d ->
                                            if (idx == index) d.copy(isOpen = openChecked) else d
                                        }
                                    }
                                )
                            }
                        }

                        if (dayInfo.isOpen) {
                            HorizontalDivider(color = Color(0xFFE2E8F0))

                            // Working Hours Row
                            Text(
                                text = "Working Hours (Informational)",
                                fontSize = 12.sp,
                                fontWeight = FontWeight.Bold,
                                color = Color(0xFF334155)
                            )

                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.spacedBy(10.dp)
                            ) {
                                Surface(
                                    shape = RoundedCornerShape(12.dp),
                                    color = Color(0xFFEFF6FF),
                                    border = BorderStroke(1.dp, Color(0xFF93C5FD)),
                                    modifier = Modifier
                                        .weight(1f)
                                        .clickable { activeTimePickerTarget = index to "open" }
                                ) {
                                    Column(
                                        modifier = Modifier.padding(vertical = 10.dp, horizontal = 12.dp),
                                        horizontalAlignment = Alignment.CenterHorizontally
                                    ) {
                                        Text(
                                            text = "OPENING TIME",
                                            fontSize = 10.sp,
                                            fontWeight = FontWeight.Bold,
                                            color = Color(0xFF1D4ED8)
                                        )
                                        Spacer(Modifier.height(2.dp))
                                        Text(
                                            text = dayInfo.openTime,
                                            fontSize = 15.sp,
                                            fontWeight = FontWeight.ExtraBold,
                                            color = Color(0xFF0F172A)
                                        )
                                    }
                                }

                                Surface(
                                    shape = RoundedCornerShape(12.dp),
                                    color = Color(0xFFF8FAFC),
                                    border = BorderStroke(1.dp, Color(0xFFCBD5E1)),
                                    modifier = Modifier
                                        .weight(1f)
                                        .clickable { activeTimePickerTarget = index to "close" }
                                ) {
                                    Column(
                                        modifier = Modifier.padding(vertical = 10.dp, horizontal = 12.dp),
                                        horizontalAlignment = Alignment.CenterHorizontally
                                    ) {
                                        Text(
                                            text = "CLOSING TIME",
                                            fontSize = 10.sp,
                                            fontWeight = FontWeight.Bold,
                                            color = Color(0xFF475569)
                                        )
                                        Spacer(Modifier.height(2.dp))
                                        Text(
                                            text = dayInfo.closeTime,
                                            fontSize = 15.sp,
                                            fontWeight = FontWeight.ExtraBold,
                                            color = Color(0xFF0F172A)
                                        )
                                    }
                                }
                            }

                            // Break Time Section
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Column {
                                    Text(
                                        text = "Break Time (Shown in Queue / Appt Status)",
                                        fontSize = 12.sp,
                                        fontWeight = FontWeight.Bold,
                                        color = Color(0xFF334155)
                                    )
                                    Text(
                                        text = if (dayInfo.hasBreak) "${dayInfo.breakStart} – ${dayInfo.breakEnd}" else "No scheduled break",
                                        fontSize = 11.sp,
                                        color = Color(0xFF64748B)
                                    )
                                }
                                Switch(
                                    checked = dayInfo.hasBreak,
                                    onCheckedChange = { breakChecked ->
                                        weeklyDays = weeklyDays.mapIndexed { idx, d ->
                                            if (idx == index) d.copy(hasBreak = breakChecked) else d
                                        }
                                    }
                                )
                            }

                            if (dayInfo.hasBreak) {
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.spacedBy(10.dp)
                                ) {
                                    Surface(
                                        shape = RoundedCornerShape(12.dp),
                                        color = Color(0xFFFFFBEB),
                                        border = BorderStroke(1.dp, Color(0xFFFDE68A)),
                                        modifier = Modifier
                                            .weight(1f)
                                            .clickable { activeTimePickerTarget = index to "breakStart" }
                                    ) {
                                        Column(
                                            modifier = Modifier.padding(vertical = 10.dp, horizontal = 12.dp),
                                            horizontalAlignment = Alignment.CenterHorizontally
                                        ) {
                                            Text(
                                                text = "BREAK START",
                                                fontSize = 10.sp,
                                                fontWeight = FontWeight.Bold,
                                                color = Color(0xFFB45309)
                                            )
                                            Spacer(Modifier.height(2.dp))
                                            Text(
                                                text = dayInfo.breakStart,
                                                fontSize = 14.sp,
                                                fontWeight = FontWeight.ExtraBold,
                                                color = Color(0xFF92400E)
                                            )
                                        }
                                    }

                                    Surface(
                                        shape = RoundedCornerShape(12.dp),
                                        color = Color(0xFFFFFBEB),
                                        border = BorderStroke(1.dp, Color(0xFFFDE68A)),
                                        modifier = Modifier
                                            .weight(1f)
                                            .clickable { activeTimePickerTarget = index to "breakEnd" }
                                    ) {
                                        Column(
                                            modifier = Modifier.padding(vertical = 10.dp, horizontal = 12.dp),
                                            horizontalAlignment = Alignment.CenterHorizontally
                                        ) {
                                            Text(
                                                text = "BREAK END",
                                                fontSize = 10.sp,
                                                fontWeight = FontWeight.Bold,
                                                color = Color(0xFFB45309)
                                            )
                                            Spacer(Modifier.height(2.dp))
                                            Text(
                                                text = dayInfo.breakEnd,
                                                fontSize = 14.sp,
                                                fontWeight = FontWeight.ExtraBold,
                                                color = Color(0xFF92400E)
                                            )
                                        }
                                    }
                                }
                            }

                            // Copy to all open days helper button
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.End
                            ) {
                                TextButton(
                                    onClick = {
                                        weeklyDays = weeklyDays.map { d ->
                                            if (d.isOpen) {
                                                d.copy(
                                                    openTime = dayInfo.openTime,
                                                    closeTime = dayInfo.closeTime,
                                                    hasBreak = dayInfo.hasBreak,
                                                    breakStart = dayInfo.breakStart,
                                                    breakEnd = dayInfo.breakEnd
                                                )
                                            } else d
                                        }
                                        statusBannerMessage = "✓ Copied ${dayInfo.dayName}'s hours & break to all open days. Tap Save to persist!"
                                    },
                                    contentPadding = PaddingValues(horizontal = 8.dp, vertical = 2.dp)
                                ) {
                                    Icon(Icons.Default.CopyAll, contentDescription = null, modifier = Modifier.size(15.dp), tint = Color(0xFF2563EB))
                                    Spacer(Modifier.width(4.dp))
                                    Text(
                                        text = "Apply ${dayInfo.dayName}'s hours to all open days",
                                        fontSize = 11.5.sp,
                                        fontWeight = FontWeight.SemiBold,
                                        color = Color(0xFF2563EB)
                                    )
                                }
                            }
                        }
                    }
                }
            }

            // 5. BOTTOM SAVE BUTTON
            item {
                Button(
                    onClick = {
                        if (clinicRepository == null || isSavingSchedule) return@Button
                        isSavingSchedule = true
                        coroutineScope.launch {
                            if (effectiveClinicId.isBlank()) {
                                loadClinicData(isInitial = true)
                            }
                            val targetId = effectiveClinicId
                            val ok = if (targetId.isNotBlank()) {
                                clinicRepository.saveWeeklySchedule(
                                    clinicId = targetId,
                                    days = weeklyDays,
                                    isOnBreak = isClinicOnBreak
                                )
                            } else null
                            isSavingSchedule = false
                            statusBannerMessage = if (ok != null) {
                                "✓ Weekly working hours & break times saved as default for every week!"
                            } else {
                                "Failed to save schedule. Please check your connection."
                            }
                        }
                    },
                    enabled = !isSavingSchedule,
                    shape = RoundedCornerShape(14.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF2563EB)),
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(52.dp)
                ) {
                    Icon(Icons.Default.Save, contentDescription = null, modifier = Modifier.size(20.dp))
                    Spacer(Modifier.width(8.dp))
                    Text(
                        text = if (isSavingSchedule) "Saving Weekly Schedule..." else "Save Default Weekly Working Hours & Break",
                        fontWeight = FontWeight.Bold,
                        fontSize = 14.sp
                    )
                }
                Spacer(Modifier.height(24.dp))
            }
        }
    }

    // Time Carousel Picker Modal
    if (activeTimePickerTarget != null) {
        val (dayIdx, fieldType) = activeTimePickerTarget!!
        val targetDay = weeklyDays.getOrNull(dayIdx)
        if (targetDay != null) {
            val currentDisplayVal = when (fieldType) {
                "open" -> targetDay.openTime
                "close" -> targetDay.closeTime
                "breakStart" -> targetDay.breakStart
                else -> targetDay.breakEnd
            }
            val dialogTitle = when (fieldType) {
                "open" -> "${targetDay.dayName} Opening Time"
                "close" -> "${targetDay.dayName} Closing Time"
                "breakStart" -> "${targetDay.dayName} Break Start Time"
                else -> "${targetDay.dayName} Break End Time"
            }

            TimeCarouselPickerDialog(
                initialTime = to24HourForPicker(currentDisplayVal),
                minTimeMinutes = null,
                title = dialogTitle,
                onDismiss = { activeTimePickerTarget = null },
                onTimeSelected = { picked24 ->
                    val formatted12 = to12HourDisplay(picked24)
                    weeklyDays = weeklyDays.mapIndexed { idx, d ->
                        if (idx == dayIdx) {
                            when (fieldType) {
                                "open" -> d.copy(openTime = formatted12)
                                "close" -> d.copy(closeTime = formatted12)
                                "breakStart" -> d.copy(breakStart = formatted12)
                                else -> d.copy(breakEnd = formatted12)
                            }
                        } else d
                    }
                    activeTimePickerTarget = null
                }
            )
        }
    }
}
