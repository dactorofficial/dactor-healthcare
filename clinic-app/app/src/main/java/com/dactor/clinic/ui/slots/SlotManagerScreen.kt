package com.dactor.clinic.ui.slots

import android.content.Context
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import com.dactor.clinic.domain.util.DateTimePickers
import com.dactor.clinic.ui.components.TimeCarouselPickerDialog
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.navigation.NavController
import com.dactor.clinic.ui.navigation.NavRoutes
import com.dactor.clinic.data.model.Clinic
import com.dactor.clinic.data.model.Doctor
import com.dactor.clinic.data.model.Slot
import com.dactor.clinic.data.repository.ClinicRepository
import com.dactor.clinic.data.repository.DoctorRepository
import com.dactor.clinic.data.repository.SlotRepository
import kotlinx.coroutines.launch
import org.json.JSONArray
import org.json.JSONObject
import java.time.DayOfWeek
import java.time.LocalDate
import java.time.YearMonth
import java.time.format.DateTimeFormatter
import java.time.format.TextStyle
import java.util.Locale
import java.util.UUID

data class WorkingHourRange(
    val startTime: String,
    val endTime: String,
    val capacity: Int = 10
)

data class DayWorkingSchedule(
    val dayOfWeek: DayOfWeek,
    val isWorking: Boolean,
    val ranges: List<WorkingHourRange>
)

private object ClinicScheduleStorage {
    private const val PREF_NAME = "dactor_clinic_working_schedule"

    fun loadWeeklySchedule(context: Context, clinicId: String): Map<DayOfWeek, DayWorkingSchedule> {
        val prefs = context.getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE)
        val raw = prefs.getString("weekly_$clinicId", null)
        if (raw.isNullOrBlank()) {
            return DayOfWeek.values().associateWith { dow ->
                DayWorkingSchedule(
                    dayOfWeek = dow,
                    isWorking = dow != DayOfWeek.SATURDAY,
                    ranges = if (dow != DayOfWeek.SATURDAY) {
                        listOf(
                            WorkingHourRange("06:00", "08:00", 10),
                            WorkingHourRange("10:00", "14:00", 15)
                        )
                    } else emptyList()
                )
            }
        }
        return try {
            val obj = JSONObject(raw)
            DayOfWeek.values().associateWith { dow ->
                val dayObj = obj.optJSONObject(dow.name)
                if (dayObj == null) {
                    DayWorkingSchedule(dow, dow != DayOfWeek.SATURDAY, listOf(WorkingHourRange("06:00", "08:00", 10)))
                } else {
                    val isWorking = dayObj.optBoolean("isWorking", true)
                    val arr = dayObj.optJSONArray("ranges") ?: JSONArray()
                    val list = mutableListOf<WorkingHourRange>()
                    for (i in 0 until arr.length()) {
                        val r = arr.getJSONObject(i)
                        list.add(
                            WorkingHourRange(
                                startTime = r.optString("startTime", "06:00"),
                                endTime = r.optString("endTime", "08:00"),
                                capacity = r.optInt("capacity", 10)
                            )
                        )
                    }
                    DayWorkingSchedule(dow, isWorking, list)
                }
            }
        } catch (e: Exception) {
            DayOfWeek.values().associateWith { dow ->
                DayWorkingSchedule(dow, dow != DayOfWeek.SATURDAY, listOf(WorkingHourRange("06:00", "08:00", 10)))
            }
        }
    }

    fun saveWeeklySchedule(context: Context, clinicId: String, schedule: Map<DayOfWeek, DayWorkingSchedule>) {
        val prefs = context.getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE)
        val root = JSONObject()
        schedule.forEach { (dow, daySched) ->
            val dObj = JSONObject()
            dObj.put("isWorking", daySched.isWorking)
            val arr = JSONArray()
            daySched.ranges.forEach { r ->
                val rObj = JSONObject()
                rObj.put("startTime", r.startTime)
                rObj.put("endTime", r.endTime)
                rObj.put("capacity", r.capacity)
                arr.put(rObj)
            }
            dObj.put("ranges", arr)
            root.put(dow.name, dObj)
        }
        prefs.edit().putString("weekly_$clinicId", root.toString()).putBoolean("has_saved_weekly_$clinicId", true).apply()
    }

    fun hasSavedWeeklySchedule(context: Context, clinicId: String): Boolean {
        val prefs = context.getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE)
        return prefs.getBoolean("has_saved_weekly_$clinicId", false)
    }

    fun saveDateOverrideNote(context: Context, clinicId: String, dateStr: String, note: String) {
        val prefs = context.getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE)
        prefs.edit().putString("override_${clinicId}_$dateStr", note).apply()
    }

    fun getDateOverrideNote(context: Context, clinicId: String, dateStr: String): String? {
        val prefs = context.getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE)
        return prefs.getString("override_${clinicId}_$dateStr", null)
    }
}

private fun parseTimeMins(t: String): Int {
    val p = t.trim().split(":")
    val h = p.getOrNull(0)?.toIntOrNull() ?: 0
    val m = p.getOrNull(1)?.take(2)?.toIntOrNull() ?: 0
    return h * 60 + m
}

private fun formatMinsToTime(mins: Int): String {
    val clamped = mins.coerceIn(0, 23 * 60 + 59)
    return String.format(Locale.US, "%02d:%02d", clamped / 60, clamped % 60)
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SlotManagerScreen(
    navController: NavController,
    clinicId: String = "",
    slotRepository: SlotRepository? = null,
    doctorRepository: DoctorRepository? = null,
    clinicRepository: ClinicRepository? = null
) {
    val context = androidx.compose.ui.platform.LocalContext.current
    val effectiveClinicId = remember(clinicId) {
        if (clinicId.isNotBlank() && clinicId != "c1") clinicId
        else com.dactor.clinic.data.local.UserSessionManager(context).getSavedClinicId() ?: ""
    }

    var clinic by remember { mutableStateOf<Clinic?>(null) }
    val isLabMode = remember(clinic) {
        val t = clinic?.type?.lowercase() ?: ""
        val n = clinic?.name?.lowercase() ?: ""
        t == "diagnostic_lab" || t.contains("lab") || n.contains("lab") ||
            (clinic?.specialties?.any { it.lowercase().contains("lab") || it.lowercase().contains("patholog") } == true)
    }

    val todayDate = remember { LocalDate.now() }
    val today = remember { todayDate.toString() }
    var displayedMonth by remember { mutableStateOf(YearMonth.from(todayDate)) }
    var selectedDate by remember { mutableStateOf(today) }

    var doctors by remember { mutableStateOf<List<Doctor>>(emptyList()) }
    var selectedDoctor by remember { mutableStateOf<Doctor?>(null) }
    val defaultStartTime = remember {
        try {
            val now = java.time.LocalTime.now()
            String.format(java.util.Locale.US, "%02d:%02d", now.hour, now.minute)
        } catch (e: Exception) { "06:00" }
    }
    var startTime by remember { mutableStateOf(defaultStartTime) }
    var endTime by remember {
        mutableStateOf(
            try {
                val now = java.time.LocalTime.now().plusHours(2)
                String.format(java.util.Locale.US, "%02d:%02d", now.hour, now.minute)
            } catch (e: Exception) { "08:00" }
        )
    }
    var capacity by remember(isLabMode) { mutableStateOf(if (isLabMode) "25" else "10") }

    var slots by remember { mutableStateOf<List<Slot>>(emptyList()) }
    var allClinicSlots by remember { mutableStateOf<List<Slot>>(emptyList()) }
    var showAddDialog by remember { mutableStateOf(false) }
    var showStartTimePicker by remember { mutableStateOf(false) }
    var showEndTimePicker by remember { mutableStateOf(false) }
    var slotToDelete by remember { mutableStateOf<Slot?>(null) }
    var slotToEditCapacity by remember { mutableStateOf<Slot?>(null) }
    var showSlotPatientsModal by remember { mutableStateOf<Slot?>(null) }
    var newCapacityInput by remember { mutableStateOf("") }
    var actionMessage by remember { mutableStateOf<String?>(null) }
    val coroutineScope = rememberCoroutineScope()

    // ── Weekly Schedule & Date-Specific Override State ────────────────────
    var weeklySchedule by remember(effectiveClinicId) {
        mutableStateOf(ClinicScheduleStorage.loadWeeklySchedule(context, effectiveClinicId))
    }
    var hasSavedWeekly by remember(effectiveClinicId) {
        mutableStateOf(ClinicScheduleStorage.hasSavedWeeklySchedule(context, effectiveClinicId))
    }
    var showWeeklyScheduleModal by remember { mutableStateOf(false) }
    var showDateOverrideModal by remember { mutableStateOf(false) }
    var isSyncingSchedule by remember { mutableStateOf(false) }
    var dateOverrideNote by remember(effectiveClinicId, selectedDate) {
        mutableStateOf(ClinicScheduleStorage.getDateOverrideNote(context, effectiveClinicId, selectedDate))
    }

    // Helper to sync generalized weekly schedule to Supabase slots for a target date if needed
    suspend fun ensureGeneralizedSlotsForDate(targetDateStr: String, currentRemoteSlots: List<Slot>): List<Slot> {
        if (!hasSavedWeekly || slotRepository == null || effectiveClinicId.isBlank()) return currentRemoteSlots
        val docId = if (isLabMode) null else (selectedDoctor?.id ?: doctors.firstOrNull()?.id)
        val overrideStatus = ClinicScheduleStorage.getDateOverrideNote(context, effectiveClinicId, targetDateStr)
        if (overrideStatus == "DAY_OFF") return currentRemoteSlots
        if (currentRemoteSlots.isNotEmpty()) return currentRemoteSlots

        val parsedDate = try { LocalDate.parse(targetDateStr) } catch (e: Exception) { return currentRemoteSlots }
        val dayConfig = weeklySchedule[parsedDate.dayOfWeek] ?: return currentRemoteSlots
        if (!dayConfig.isWorking || dayConfig.ranges.isEmpty()) return currentRemoteSlots

        val createdList = mutableListOf<Slot>()
        for (range in dayConfig.ranges) {
            val newSlot = Slot(
                id = UUID.randomUUID().toString(),
                clinicId = effectiveClinicId,
                doctorId = docId,
                slotDate = targetDateStr,
                startTime = range.startTime,
                endTime = range.endTime,
                maxCapacity = if (isLabMode) 25 else range.capacity,
                bookedCount = 0,
                isPublished = true
            )
            val created = slotRepository.createSlot(newSlot)
            if (created != null) createdList.add(created)
        }
        return if (createdList.isNotEmpty()) createdList else currentRemoteSlots
    }

    LaunchedEffect(effectiveClinicId, selectedDate) {
        if (clinicRepository != null && effectiveClinicId.isNotBlank()) {
            try {
                clinic = clinicRepository.getClinicById(effectiveClinicId)
            } catch (e: Exception) {
                e.printStackTrace()
            }
        }
        if (doctorRepository != null) {
            val remoteDocs = doctorRepository.getDoctorsByClinic(effectiveClinicId)
            doctors = remoteDocs
            if (selectedDoctor == null || !remoteDocs.contains(selectedDoctor)) {
                selectedDoctor = remoteDocs.firstOrNull()
            }
        }
        if (slotRepository != null && effectiveClinicId.isNotBlank()) {
            val remoteSlots = slotRepository.getSlots(effectiveClinicId, selectedDate)
            slots = remoteSlots
            try {
                allClinicSlots = slotRepository.getSlotsForClinic(effectiveClinicId)
            } catch (e: Exception) {
                e.printStackTrace()
            }
        }
    }

    // Days in the displayed month (strictly removes past dates for current month)
    val daysInMonth = remember(displayedMonth, todayDate) {
        val startDay = if (displayedMonth == YearMonth.from(todayDate)) todayDate.dayOfMonth else 1
        val numDays = displayedMonth.lengthOfMonth()
        (startDay..numDays).map { day ->
            displayedMonth.atDay(day)
        }
    }

    val dayListState = rememberLazyListState()
    LaunchedEffect(displayedMonth) {
        dayListState.scrollToItem(0)
    }

    Scaffold(
        containerColor = Color(0xFFF8FAFC),
        topBar = {
            TopAppBar(
                title = { Text(if (isLabMode) "Lab Collection Slots" else "Slot Publishing", fontWeight = FontWeight.Bold) },
                navigationIcon = {
                    IconButton(onClick = { navController.popBackStack() }) {
                        Icon(Icons.Default.ArrowBack, contentDescription = "Back")
                    }
                },
                actions = {
                    TextButton(
                        onClick = {
                            val route = if (effectiveClinicId.isNotBlank()) "${NavRoutes.WorkingHoursBreak}/$effectiveClinicId" else NavRoutes.WorkingHoursBreak
                            navController.navigate(route)
                        }
                    ) {
                        Icon(Icons.Default.Schedule, contentDescription = null, modifier = Modifier.size(18.dp))
                        Spacer(Modifier.width(4.dp))
                        Text("Working Hours & Break", fontWeight = FontWeight.Bold, fontSize = 12.sp)
                    }
                }
            )
        },
        floatingActionButton = {
            ExtendedFloatingActionButton(
                onClick = {
                    if (doctors.isEmpty() || isLabMode) {
                        showAddDialog = true
                    } else {
                        if (selectedDate == today) {
                            val localNow = java.time.LocalTime.now()
                            val currentMinutesToday = localNow.hour * 60 + localNow.minute
                            val minAllowedToday = (currentMinutesToday - 120).coerceAtLeast(0)
                            val curStartMinutes = parseTimeMins(startTime)
                            if (curStartMinutes < minAllowedToday) {
                                startTime = formatMinsToTime(currentMinutesToday)
                                endTime = DateTimePickers.addMinutesToTime(startTime, 120)
                            }
                        }
                        showAddDialog = true
                    }
                },
                icon = { Icon(Icons.Default.Add, contentDescription = null) },
                text = { Text(if (isLabMode) "Add Sample Slot ($selectedDate)" else "Add Time Slot ($selectedDate)") },
                shape = RoundedCornerShape(16.dp),
                containerColor = MaterialTheme.colorScheme.primaryContainer
            )
        }
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
        ) {
            // ACTION FEEDBACK BANNER
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

            if (doctors.isEmpty() && !isLabMode) {
                Card(
                    shape = RoundedCornerShape(14.dp),
                    colors = CardDefaults.cardColors(containerColor = Color(0xFFFEF3C7)),
                    border = BorderStroke(1.dp, Color(0xFFFDE68A)),
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp, vertical = 6.dp)
                ) {
                    Column(
                        modifier = Modifier.padding(14.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            Icon(Icons.Default.Info, contentDescription = null, tint = Color(0xFFD97706))
                            Text("No Affiliated Doctors Yet", fontWeight = FontWeight.Bold, fontSize = 14.sp, color = Color(0xFF92400E))
                        }
                        Text(
                            text = "You can only publish timed appointment slots for doctors who have accepted your clinic invitation.",
                            fontSize = 12.sp,
                            color = Color(0xFF78350F)
                        )
                        Button(
                            onClick = { navController.navigate(NavRoutes.InvitationManager) },
                            colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFD97706)),
                            shape = RoundedCornerShape(8.dp)
                        ) {
                            Icon(Icons.Default.GroupAdd, contentDescription = null, modifier = Modifier.size(16.dp))
                            Spacer(Modifier.width(6.dp))
                            Text("Send Doctor Invitation", fontSize = 12.sp, fontWeight = FontWeight.Bold)
                        }
                    }
                }
            }

            // ── INFORMATIONAL WORKING HOURS & BREAK LINK BAR ──
            Card(
                shape = RoundedCornerShape(14.dp),
                colors = CardDefaults.cardColors(containerColor = Color.White),
                border = BorderStroke(1.dp, Color(0xFFCBD5E1)),
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 6.dp)
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(12.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            text = "Slot Publishing (Manual Booking Slots)",
                            fontWeight = FontWeight.ExtraBold,
                            fontSize = 13.sp,
                            color = Color(0xFF0F172A)
                        )
                        Text(
                            text = "Working hours do not publish slots automatically. Publish booking slots per date below.",
                            fontSize = 11.sp,
                            color = Color(0xFF64748B)
                        )
                    }
                    Button(
                        onClick = {
                            val route = if (effectiveClinicId.isNotBlank()) "${NavRoutes.WorkingHoursBreak}/$effectiveClinicId" else NavRoutes.WorkingHoursBreak
                            navController.navigate(route)
                        },
                        shape = RoundedCornerShape(10.dp),
                        colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF00796B)),
                        contentPadding = PaddingValues(horizontal = 12.dp, vertical = 6.dp),
                        modifier = Modifier.height(34.dp)
                    ) {
                        Icon(Icons.Default.Schedule, contentDescription = null, modifier = Modifier.size(15.dp))
                        Spacer(Modifier.width(4.dp))
                        Text("Hours & Break", fontSize = 11.sp, fontWeight = FontWeight.Bold)
                    }
                }
            }

            // ── Month & Year Selector (< October 2026 >) ─────────────────────
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 4.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                val isCurrentMonth = displayedMonth <= YearMonth.from(todayDate)
                IconButton(
                    onClick = {
                        if (!isCurrentMonth) {
                            val prev = displayedMonth.minusMonths(1)
                            displayedMonth = prev
                            selectedDate = if (prev == YearMonth.from(todayDate)) today else prev.atDay(1).toString()
                        }
                    },
                    enabled = !isCurrentMonth
                ) {
                    Icon(
                        Icons.Default.ChevronLeft,
                        contentDescription = "Previous Month",
                        tint = if (isCurrentMonth) Color.LightGray else MaterialTheme.colorScheme.onSurface
                    )
                }

                Text(
                    text = "${displayedMonth.month.getDisplayName(TextStyle.FULL, Locale.ENGLISH)} ${displayedMonth.year}",
                    fontSize = 16.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = MaterialTheme.colorScheme.onSurface
                )

                IconButton(
                    onClick = {
                        val next = displayedMonth.plusMonths(1)
                        displayedMonth = next
                        selectedDate = next.atDay(1).toString()
                    }
                ) {
                    Icon(
                        Icons.Default.ChevronRight,
                        contentDescription = "Next Month",
                        tint = MaterialTheme.colorScheme.onSurface
                    )
                }
            }

            // ── Horizontal Date Cards ────────────────────────────────────────
            LazyRow(
                state = dayListState,
                contentPadding = PaddingValues(horizontal = 16.dp),
                horizontalArrangement = Arrangement.spacedBy(10.dp),
                modifier = Modifier.fillMaxWidth()
            ) {
                items(daysInMonth, key = { it.toString() }) { date ->
                    val dateStr = date.toString()
                    val isSelected = (selectedDate == dateStr)
                    val dayOfWeekStr = date.dayOfWeek.getDisplayName(TextStyle.SHORT, Locale.ENGLISH)
                    val isDayWorkingWeekly = weeklySchedule[date.dayOfWeek]?.isWorking == true
                    val hasSlots = allClinicSlots.any { it.slotDate == dateStr } || slots.any { it.slotDate == dateStr } || isDayWorkingWeekly

                    Surface(
                        shape = RoundedCornerShape(14.dp),
                        color = if (isSelected) MaterialTheme.colorScheme.primary else Color.White,
                        border = BorderStroke(
                            1.dp,
                            if (isSelected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.outlineVariant
                        ),
                        modifier = Modifier
                            .width(62.dp)
                            .height(74.dp)
                            .clickable { selectedDate = dateStr }
                    ) {
                        Column(
                            horizontalAlignment = Alignment.CenterHorizontally,
                            verticalArrangement = Arrangement.Center,
                            modifier = Modifier.padding(vertical = 6.dp)
                        ) {
                            Text(
                                text = dayOfWeekStr,
                                fontSize = 12.sp,
                                fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Medium,
                                color = if (isSelected) Color.White else MaterialTheme.colorScheme.onSurfaceVariant
                            )
                            Spacer(Modifier.height(3.dp))
                            Text(
                                text = "${date.dayOfMonth}",
                                fontSize = 18.sp,
                                fontWeight = FontWeight.ExtraBold,
                                color = if (isSelected) Color.White else MaterialTheme.colorScheme.onSurface
                            )
                            if (hasSlots) {
                                Spacer(Modifier.height(3.dp))
                                Surface(
                                    shape = CircleShape,
                                    color = if (isSelected) Color.White else MaterialTheme.colorScheme.primary,
                                    modifier = Modifier.size(5.dp)
                                ) {}
                            }
                        }
                    }
                }
            }

            Spacer(Modifier.height(10.dp))

            // Content Area for Selected Date
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(horizontal = 16.dp)
            ) {
                val currentSlots = slots.filter { it.slotDate == selectedDate }
                val parsedSelectedDate = try { LocalDate.parse(selectedDate) } catch (e: Exception) { todayDate }
                val dateLabel = "${parsedSelectedDate.dayOfWeek.getDisplayName(TextStyle.FULL, Locale.ENGLISH)}, ${parsedSelectedDate.dayOfMonth} ${parsedSelectedDate.month.getDisplayName(TextStyle.FULL, Locale.ENGLISH)}"

                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(vertical = 4.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            text = dateLabel,
                            fontWeight = FontWeight.Bold,
                            fontSize = 15.sp,
                            color = MaterialTheme.colorScheme.onSurface
                        )
                        if (!dateOverrideNote.isNullOrBlank()) {
                            Text(
                                text = "Custom Date Override: $dateOverrideNote",
                                fontSize = 11.sp,
                                fontWeight = FontWeight.SemiBold,
                                color = Color(0xFFD97706)
                            )
                        }
                    }

                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        OutlinedButton(
                            onClick = { showDateOverrideModal = true },
                            shape = RoundedCornerShape(10.dp),
                            contentPadding = PaddingValues(horizontal = 10.dp, vertical = 4.dp),
                            modifier = Modifier.height(32.dp)
                        ) {
                            Icon(Icons.Default.EditCalendar, contentDescription = null, modifier = Modifier.size(14.dp))
                            Spacer(Modifier.width(4.dp))
                            Text("Add / Subtract Hours", fontSize = 11.sp, fontWeight = FontWeight.Bold)
                        }

                        Surface(
                            shape = RoundedCornerShape(12.dp),
                            color = if (currentSlots.isNotEmpty()) Color(0xFFDCFCE7) else MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f)
                        ) {
                            Text(
                                text = "${currentSlots.size} slot${if (currentSlots.size != 1) "s" else ""}",
                                fontSize = 11.sp,
                                fontWeight = FontWeight.Bold,
                                color = if (currentSlots.isNotEmpty()) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant,
                                modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
                            )
                        }
                    }
                }

                if (currentSlots.isEmpty()) {
                    Box(
                        modifier = Modifier
                            .fillMaxSize()
                            .padding(bottom = 70.dp),
                        contentAlignment = Alignment.Center
                    ) {
                        Card(
                            shape = RoundedCornerShape(16.dp),
                            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                            border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.6f)),
                            elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Column(
                                modifier = Modifier
                                    .padding(24.dp)
                                    .fillMaxWidth(),
                                horizontalAlignment = Alignment.CenterHorizontally,
                                verticalArrangement = Arrangement.spacedBy(10.dp)
                            ) {
                                Surface(
                                    shape = CircleShape,
                                    color = MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.5f),
                                    modifier = Modifier.size(56.dp)
                                ) {
                                    Box(contentAlignment = Alignment.Center) {
                                        Icon(
                                            Icons.Default.EventAvailable,
                                            contentDescription = null,
                                            tint = MaterialTheme.colorScheme.primary,
                                            modifier = Modifier.size(32.dp)
                                        )
                                    }
                                }
                                Text("No Booking Slots Published for $selectedDate", fontWeight = FontWeight.Bold, fontSize = 16.sp)
                                Text(
                                    "Working hours are informational only and do not auto-publish slots. Tap 'Add slot' below to open booking capacity for $selectedDate.",
                                    fontSize = 12.sp,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    textAlign = androidx.compose.ui.text.style.TextAlign.Center
                                )
                                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                    OutlinedButton(
                                        onClick = {
                                            val route = if (effectiveClinicId.isNotBlank()) "${NavRoutes.WorkingHoursBreak}/$effectiveClinicId" else NavRoutes.WorkingHoursBreak
                                            navController.navigate(route)
                                        },
                                        shape = RoundedCornerShape(10.dp)
                                    ) {
                                        Text("Working Hours & Break", fontSize = 12.sp, fontWeight = FontWeight.Bold)
                                    }
                                    Button(
                                        onClick = {
                                            if (doctors.isEmpty()) {
                                                showAddDialog = true
                                            } else {
                                                showAddDialog = true
                                            }
                                        },
                                        shape = RoundedCornerShape(10.dp)
                                    ) {
                                        Text("Add slot", fontSize = 12.sp, fontWeight = FontWeight.Bold)
                                    }
                                }
                            }
                        }
                    }
                } else {
                    LazyColumn(
                        verticalArrangement = Arrangement.spacedBy(12.dp),
                        modifier = Modifier.fillMaxSize(),
                        contentPadding = PaddingValues(bottom = 80.dp)
                    ) {
                        items(currentSlots, key = { it.id }) { slot ->
                            val doctor = doctors.find { it.id == slot.doctorId }
                            Card(
                                shape = RoundedCornerShape(14.dp),
                                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                                border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.5f)),
                                elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
                                modifier = Modifier.fillMaxWidth()
                            ) {
                                Column(
                                    modifier = Modifier.padding(14.dp),
                                    verticalArrangement = Arrangement.spacedBy(10.dp)
                                ) {
                                    Row(
                                        modifier = Modifier.fillMaxWidth(),
                                        horizontalArrangement = Arrangement.SpaceBetween,
                                        verticalAlignment = Alignment.CenterVertically
                                    ) {
                                        Row(
                                            verticalAlignment = Alignment.CenterVertically,
                                            horizontalArrangement = Arrangement.spacedBy(10.dp),
                                            modifier = Modifier.weight(1f)
                                        ) {
                                            Surface(
                                                shape = RoundedCornerShape(8.dp),
                                                color = MaterialTheme.colorScheme.primaryContainer,
                                                modifier = Modifier.size(38.dp)
                                            ) {
                                                Box(contentAlignment = Alignment.Center) {
                                                    Icon(Icons.Default.Schedule, contentDescription = null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(20.dp))
                                                }
                                            }
                                            Column {
                                                Text(
                                                    text = "${slot.startTime} - ${slot.endTime}",
                                                    fontWeight = FontWeight.Bold,
                                                    fontSize = 16.sp,
                                                    color = MaterialTheme.colorScheme.onSurface
                                                )
                                                Text(
                                                    text = if (isLabMode) "Lab Phlebotomy Counter" else (doctor?.fullName ?: "Doctor"),
                                                    fontSize = 12.sp,
                                                    fontWeight = FontWeight.Medium,
                                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                                )
                                            }
                                        }

                                        Surface(
                                            shape = RoundedCornerShape(6.dp),
                                            color = Color(0xFFD1FAE5)
                                        ) {
                                            Text(
                                                text = "Active Hours",
                                                fontSize = 11.sp,
                                                fontWeight = FontWeight.Bold,
                                                color = Color(0xFF065F46),
                                                modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
                                            )
                                        }
                                    }

                                    HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.3f))

                                    Row(
                                        modifier = Modifier.fillMaxWidth(),
                                        horizontalArrangement = Arrangement.SpaceBetween,
                                        verticalAlignment = Alignment.CenterVertically
                                    ) {
                                        val remaining = (slot.maxCapacity - slot.bookedCount).coerceAtLeast(0)
                                        Column(modifier = Modifier.weight(1f)) {
                                            Text(
                                                text = "Registered: ${slot.bookedCount} / ${slot.maxCapacity} patients",
                                                fontSize = 12.sp,
                                                color = MaterialTheme.colorScheme.onSurfaceVariant
                                            )
                                            Text(
                                                text = "$remaining seats remaining",
                                                fontSize = 11.sp,
                                                color = if (slot.bookedCount >= slot.maxCapacity) MaterialTheme.colorScheme.error else Color(0xFF059669),
                                                fontWeight = FontWeight.SemiBold
                                            )
                                        }

                                        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                            // Subtract 30m / 1hr quick button for specific date
                                            OutlinedButton(
                                                onClick = {
                                                    val sMins = parseTimeMins(slot.startTime)
                                                    val eMins = parseTimeMins(slot.endTime)
                                                    if (eMins - sMins > 30) {
                                                        val updatedEnd = formatMinsToTime(eMins - 30)
                                                        coroutineScope.launch {
                                                            slotRepository?.deleteSlot(slot.id)
                                                            val updatedSlot = slot.copy(id = UUID.randomUUID().toString(), endTime = updatedEnd)
                                                            slotRepository?.createSlot(updatedSlot)
                                                            slots = slots.map { if (it.id == slot.id) updatedSlot else it }
                                                            ClinicScheduleStorage.saveDateOverrideNote(context, effectiveClinicId, selectedDate, "Subtracted 30m (${slot.startTime}-$updatedEnd)")
                                                            dateOverrideNote = "Subtracted 30m (${slot.startTime}-$updatedEnd)"
                                                            actionMessage = "✓ Subtracted 30 mins for $selectedDate: now ${slot.startTime} - $updatedEnd"
                                                        }
                                                    } else {
                                                        slotToDelete = slot
                                                    }
                                                },
                                                shape = RoundedCornerShape(8.dp),
                                                contentPadding = PaddingValues(horizontal = 8.dp, vertical = 6.dp),
                                                modifier = Modifier.defaultMinSize(minHeight = 34.dp)
                                            ) {
                                                Text("-30m", fontSize = 11.sp, fontWeight = FontWeight.Bold)
                                            }

                                            OutlinedButton(
                                                onClick = {
                                                    val eMins = parseTimeMins(slot.endTime)
                                                    val updatedEnd = formatMinsToTime(eMins + 30)
                                                    coroutineScope.launch {
                                                        slotRepository?.deleteSlot(slot.id)
                                                        val updatedSlot = slot.copy(id = UUID.randomUUID().toString(), endTime = updatedEnd)
                                                        slotRepository?.createSlot(updatedSlot)
                                                        slots = slots.map { if (it.id == slot.id) updatedSlot else it }
                                                        ClinicScheduleStorage.saveDateOverrideNote(context, effectiveClinicId, selectedDate, "Added +30m (${slot.startTime}-$updatedEnd)")
                                                        dateOverrideNote = "Added +30m (${slot.startTime}-$updatedEnd)"
                                                        actionMessage = "✓ Added +30 mins for $selectedDate: now ${slot.startTime} - $updatedEnd"
                                                    }
                                                },
                                                shape = RoundedCornerShape(8.dp),
                                                contentPadding = PaddingValues(horizontal = 8.dp, vertical = 6.dp),
                                                modifier = Modifier.defaultMinSize(minHeight = 34.dp)
                                            ) {
                                                Text("+30m", fontSize = 11.sp, fontWeight = FontWeight.Bold)
                                            }

                                            OutlinedButton(
                                                onClick = {
                                                    showSlotPatientsModal = slot
                                                },
                                                shape = RoundedCornerShape(8.dp),
                                                contentPadding = PaddingValues(horizontal = 10.dp, vertical = 6.dp),
                                                modifier = Modifier.defaultMinSize(minHeight = 34.dp)
                                            ) {
                                                Icon(Icons.Default.PeopleAlt, contentDescription = "Patients", modifier = Modifier.size(14.dp))
                                                Spacer(Modifier.width(4.dp))
                                                Text("Patients", fontSize = 11.sp, fontWeight = FontWeight.Bold)
                                            }

                                            OutlinedButton(
                                                onClick = { slotToDelete = slot },
                                                colors = ButtonDefaults.outlinedButtonColors(contentColor = MaterialTheme.colorScheme.error),
                                                border = BorderStroke(1.dp, MaterialTheme.colorScheme.error.copy(alpha = 0.5f)),
                                                shape = RoundedCornerShape(8.dp),
                                                contentPadding = PaddingValues(horizontal = 8.dp, vertical = 6.dp),
                                                modifier = Modifier.defaultMinSize(minHeight = 34.dp)
                                            ) {
                                                Icon(Icons.Default.Delete, contentDescription = "Remove", modifier = Modifier.size(14.dp))
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        // ── 1. WEEKLY GENERALIZED WORKING DAYS & DAY-WISE WORKING HOURS MODAL ──
        if (showWeeklyScheduleModal) {
            var draftSchedule by remember(weeklySchedule) { mutableStateOf(weeklySchedule) }
            var selectedDayTab by remember { mutableStateOf(DayOfWeek.MONDAY) }
            var newRangeStart by remember { mutableStateOf("06:00") }
            var newRangeEnd by remember { mutableStateOf("08:00") }
            var newRangeCap by remember { mutableStateOf("10") }

            AlertDialog(
                onDismissRequest = { if (!isSyncingSchedule) showWeeklyScheduleModal = false },
                title = {
                    Column {
                        Text("Weekly Working Days & Hours", fontWeight = FontWeight.ExtraBold, fontSize = 17.sp)
                        Text(
                            "Set day-wise working hours (e.g., 06:00 to 08:00) generalized every week.",
                            fontSize = 11.sp,
                            color = Color(0xFF64748B)
                        )
                    }
                },
                text = {
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .verticalScroll(rememberScrollState()),
                        verticalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        Text("1. Select Working Days of Week:", fontSize = 12.sp, fontWeight = FontWeight.Bold)
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .horizontalScroll(rememberScrollState()),
                            horizontalArrangement = Arrangement.spacedBy(6.dp)
                        ) {
                            listOf(
                                DayOfWeek.SUNDAY,
                                DayOfWeek.MONDAY,
                                DayOfWeek.TUESDAY,
                                DayOfWeek.WEDNESDAY,
                                DayOfWeek.THURSDAY,
                                DayOfWeek.FRIDAY,
                                DayOfWeek.SATURDAY
                            ).forEach { dow ->
                                val d = draftSchedule[dow] ?: DayWorkingSchedule(dow, true, emptyList())
                                val isSelectedTab = selectedDayTab == dow
                                Surface(
                                    shape = RoundedCornerShape(10.dp),
                                    color = when {
                                        isSelectedTab -> Color(0xFF00796B)
                                        d.isWorking -> Color(0xFFECFDF5)
                                        else -> Color(0xFFF1F5F9)
                                    },
                                    border = BorderStroke(
                                        1.dp,
                                        if (isSelectedTab) Color(0xFF00796B) else if (d.isWorking) Color(0xFF10B981) else Color(0xFFCBD5E1)
                                    ),
                                    modifier = Modifier.clickable { selectedDayTab = dow }
                                ) {
                                    Column(
                                        modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp),
                                        horizontalAlignment = Alignment.CenterHorizontally
                                    ) {
                                        Text(
                                            text = dow.getDisplayName(TextStyle.SHORT, Locale.ENGLISH),
                                            fontSize = 11.sp,
                                            fontWeight = FontWeight.Bold,
                                            color = if (isSelectedTab) Color.White else Color(0xFF0F172A)
                                        )
                                        Text(
                                            text = if (d.isWorking) "Open" else "Off",
                                            fontSize = 9.sp,
                                            color = if (isSelectedTab) Color.White.copy(alpha = 0.9f) else if (d.isWorking) Color(0xFF059669) else Color(0xFF94A3B8)
                                        )
                                    }
                                }
                            }
                        }

                        val currentDaySched = draftSchedule[selectedDayTab] ?: DayWorkingSchedule(selectedDayTab, true, emptyList())

                        Card(
                            shape = RoundedCornerShape(12.dp),
                            colors = CardDefaults.cardColors(containerColor = Color(0xFFF8FAFC)),
                            border = BorderStroke(1.dp, Color(0xFFE2E8F0)),
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Column(
                                modifier = Modifier.padding(12.dp),
                                verticalArrangement = Arrangement.spacedBy(10.dp)
                            ) {
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Text(
                                        text = "${selectedDayTab.getDisplayName(TextStyle.FULL, Locale.ENGLISH)} Working Status",
                                        fontWeight = FontWeight.Bold,
                                        fontSize = 13.sp
                                    )
                                    Switch(
                                        checked = currentDaySched.isWorking,
                                        onCheckedChange = { checked ->
                                            draftSchedule = draftSchedule.toMutableMap().apply {
                                                put(selectedDayTab, currentDaySched.copy(isWorking = checked))
                                            }
                                        }
                                    )
                                }

                                if (currentDaySched.isWorking) {
                                    Text(
                                        text = "Working Hours for ${selectedDayTab.getDisplayName(TextStyle.FULL, Locale.ENGLISH)}:",
                                        fontSize = 12.sp,
                                        fontWeight = FontWeight.SemiBold,
                                        color = Color(0xFF334155)
                                    )

                                    if (currentDaySched.ranges.isEmpty()) {
                                        Text("No hours added yet. Add a shift below (e.g. 06:00 to 08:00).", fontSize = 11.sp, color = Color(0xFF64748B))
                                    } else {
                                        currentDaySched.ranges.forEachIndexed { idx, r ->
                                            Surface(
                                                shape = RoundedCornerShape(8.dp),
                                                color = Color.White,
                                                border = BorderStroke(1.dp, Color(0xFFCBD5E1)),
                                                modifier = Modifier.fillMaxWidth()
                                            ) {
                                                Row(
                                                    modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp),
                                                    horizontalArrangement = Arrangement.SpaceBetween,
                                                    verticalAlignment = Alignment.CenterVertically
                                                ) {
                                                    Text(
                                                        text = "${r.startTime} - ${r.endTime} (Cap: ${r.capacity})",
                                                        fontSize = 12.sp,
                                                        fontWeight = FontWeight.Bold,
                                                        color = Color(0xFF0F172A)
                                                    )
                                                    IconButton(
                                                        onClick = {
                                                            val updated = currentDaySched.ranges.filterIndexed { i, _ -> i != idx }
                                                            draftSchedule = draftSchedule.toMutableMap().apply {
                                                                put(selectedDayTab, currentDaySched.copy(ranges = updated))
                                                            }
                                                        },
                                                        modifier = Modifier.size(24.dp)
                                                    ) {
                                                        Icon(Icons.Default.Delete, contentDescription = "Remove", tint = MaterialTheme.colorScheme.error, modifier = Modifier.size(16.dp))
                                                    }
                                                }
                                            }
                                        }
                                    }

                                    // Quick Preset Shift Chips (e.g., 06:00-08:00, 09:00-12:00, 14:00-17:00, 17:00-19:00)
                                    Text("Quick Add Shift:", fontSize = 11.sp, color = Color(0xFF64748B))
                                    Row(
                                        modifier = Modifier
                                            .fillMaxWidth()
                                            .horizontalScroll(rememberScrollState()),
                                        horizontalArrangement = Arrangement.spacedBy(6.dp)
                                    ) {
                                        listOf(
                                            "06:00" to "08:00",
                                            "08:00" to "12:00",
                                            "10:00" to "14:00",
                                            "14:00" to "17:00",
                                            "17:00" to "19:00"
                                        ).forEach { (s, e) ->
                                            AssistChip(
                                                onClick = {
                                                    val added = (currentDaySched.ranges + WorkingHourRange(s, e, 10)).distinct()
                                                    draftSchedule = draftSchedule.toMutableMap().apply {
                                                        put(selectedDayTab, currentDaySched.copy(isWorking = true, ranges = added))
                                                    }
                                                },
                                                label = { Text("+ $s-$e", fontSize = 11.sp) }
                                            )
                                        }
                                    }

                                    // Custom Shift Input
                                    Row(
                                        modifier = Modifier.fillMaxWidth(),
                                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                                        verticalAlignment = Alignment.CenterVertically
                                    ) {
                                        OutlinedTextField(
                                            value = newRangeStart,
                                            onValueChange = { newRangeStart = it },
                                            label = { Text("From", fontSize = 10.sp) },
                                            singleLine = true,
                                            modifier = Modifier.weight(1f)
                                        )
                                        OutlinedTextField(
                                            value = newRangeEnd,
                                            onValueChange = { newRangeEnd = it },
                                            label = { Text("To", fontSize = 10.sp) },
                                            singleLine = true,
                                            modifier = Modifier.weight(1f)
                                        )
                                        Button(
                                            onClick = {
                                                if (newRangeStart.isNotBlank() && newRangeEnd.isNotBlank()) {
                                                    val cap = (newRangeCap.toIntOrNull() ?: 10).coerceAtLeast(1)
                                                    val added = currentDaySched.ranges + WorkingHourRange(newRangeStart.trim(), newRangeEnd.trim(), cap)
                                                    draftSchedule = draftSchedule.toMutableMap().apply {
                                                        put(selectedDayTab, currentDaySched.copy(isWorking = true, ranges = added))
                                                    }
                                                }
                                            },
                                            contentPadding = PaddingValues(horizontal = 10.dp, vertical = 8.dp)
                                        ) {
                                            Text("Add", fontSize = 11.sp, fontWeight = FontWeight.Bold)
                                        }
                                    }

                                    // Copy this day's hours to all working days
                                    TextButton(
                                        onClick = {
                                            val updatedMap = draftSchedule.mapValues { (_, v) ->
                                                if (v.isWorking) v.copy(ranges = currentDaySched.ranges) else v
                                            }
                                            draftSchedule = updatedMap
                                        }
                                    ) {
                                        Icon(Icons.Default.CopyAll, contentDescription = null, modifier = Modifier.size(15.dp))
                                        Spacer(Modifier.width(4.dp))
                                        Text("Copy ${selectedDayTab.getDisplayName(TextStyle.SHORT, Locale.ENGLISH)} hours to all working days", fontSize = 11.sp)
                                    }
                                }
                            }
                        }
                    }
                },
                confirmButton = {
                    Button(
                        onClick = {
                            if (effectiveClinicId.isBlank()) {
                                showWeeklyScheduleModal = false
                                return@Button
                            }
                            isSyncingSchedule = true
                            ClinicScheduleStorage.saveWeeklySchedule(context, effectiveClinicId, draftSchedule)
                            weeklySchedule = draftSchedule
                            hasSavedWeekly = true
                            actionMessage = "✓ Weekly working days & hours saved (informational only; slots are added manually)."
                            isSyncingSchedule = false
                            showWeeklyScheduleModal = false
                        },
                        enabled = !isSyncingSchedule,
                        colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF00796B))
                    ) {
                        Text(if (isSyncingSchedule) "Saving & Syncing..." else "Save Weekly Schedule", fontWeight = FontWeight.Bold)
                    }
                },
                dismissButton = {
                    TextButton(onClick = { showWeeklyScheduleModal = false }) {
                        Text("Cancel")
                    }
                }
            )
        }

        // ── 2. DATE-SPECIFIC OVERRIDE MODAL (Add / Subtract / Create Working Hours for `selectedDate`) ──
        if (showDateOverrideModal) {
            var customStart by remember { mutableStateOf("06:00") }
            var customEnd by remember { mutableStateOf("08:00") }
            var customCap by remember { mutableStateOf("10") }

            AlertDialog(
                onDismissRequest = { showDateOverrideModal = false },
                title = {
                    Column {
                        Text("Customize Hours for $selectedDate", fontWeight = FontWeight.ExtraBold, fontSize = 17.sp)
                        Text(
                            "Add, subtract, or replace working hours specifically for $selectedDate without affecting other weeks.",
                            fontSize = 11.sp,
                            color = Color(0xFF64748B)
                        )
                    }
                },
                text = {
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .verticalScroll(rememberScrollState()),
                        verticalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        Text("Current Working Hours on $selectedDate:", fontSize = 12.sp, fontWeight = FontWeight.Bold)
                        val daySlots = slots.filter { it.slotDate == selectedDate }
                        if (daySlots.isEmpty()) {
                            Text("No active working hours on $selectedDate.", fontSize = 12.sp, color = Color(0xFF64748B))
                        } else {
                            daySlots.forEach { s ->
                                Surface(
                                    shape = RoundedCornerShape(10.dp),
                                    color = Color(0xFFF8FAFC),
                                    border = BorderStroke(1.dp, Color(0xFFCBD5E1)),
                                    modifier = Modifier.fillMaxWidth()
                                ) {
                                    Row(
                                        modifier = Modifier.padding(10.dp),
                                        horizontalArrangement = Arrangement.SpaceBetween,
                                        verticalAlignment = Alignment.CenterVertically
                                    ) {
                                        Text("${s.startTime} - ${s.endTime}", fontWeight = FontWeight.Bold, fontSize = 13.sp)
                                        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                            OutlinedButton(
                                                onClick = {
                                                    val sM = parseTimeMins(s.startTime)
                                                    val eM = parseTimeMins(s.endTime)
                                                    if (eM - sM > 60) {
                                                        val newEnd = formatMinsToTime(eM - 60)
                                                        coroutineScope.launch {
                                                            slotRepository?.deleteSlot(s.id)
                                                            val up = s.copy(id = UUID.randomUUID().toString(), endTime = newEnd)
                                                            slotRepository?.createSlot(up)
                                                            slots = slots.map { if (it.id == s.id) up else it }
                                                            ClinicScheduleStorage.saveDateOverrideNote(context, effectiveClinicId, selectedDate, "Subtracted 1 hr (${s.startTime}-$newEnd)")
                                                            dateOverrideNote = "Subtracted 1 hr (${s.startTime}-$newEnd)"
                                                        }
                                                    } else {
                                                        coroutineScope.launch {
                                                            slotRepository?.deleteSlot(s.id)
                                                            slots = slots.filter { it.id != s.id }
                                                        }
                                                    }
                                                },
                                                contentPadding = PaddingValues(horizontal = 8.dp, vertical = 4.dp),
                                                modifier = Modifier.height(30.dp)
                                            ) {
                                                Text("-1 hr", fontSize = 11.sp)
                                            }
                                            OutlinedButton(
                                                onClick = {
                                                    val eM = parseTimeMins(s.endTime)
                                                    val newEnd = formatMinsToTime(eM + 60)
                                                    coroutineScope.launch {
                                                        slotRepository?.deleteSlot(s.id)
                                                        val up = s.copy(id = UUID.randomUUID().toString(), endTime = newEnd)
                                                        slotRepository?.createSlot(up)
                                                        slots = slots.map { if (it.id == s.id) up else it }
                                                        ClinicScheduleStorage.saveDateOverrideNote(context, effectiveClinicId, selectedDate, "Added 1 hr (${s.startTime}-$newEnd)")
                                                        dateOverrideNote = "Added 1 hr (${s.startTime}-$newEnd)"
                                                    }
                                                },
                                                contentPadding = PaddingValues(horizontal = 8.dp, vertical = 4.dp),
                                                modifier = Modifier.height(30.dp)
                                            ) {
                                                Text("+1 hr", fontSize = 11.sp)
                                            }
                                        }
                                    }
                                }
                            }
                        }

                        HorizontalDivider()

                        Text("Add / Create Specific Working Hour for $selectedDate:", fontSize = 12.sp, fontWeight = FontWeight.Bold)
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            OutlinedTextField(
                                value = customStart,
                                onValueChange = { customStart = it },
                                label = { Text("Start (e.g. 06:00)", fontSize = 11.sp) },
                                singleLine = true,
                                modifier = Modifier.weight(1f)
                            )
                            OutlinedTextField(
                                value = customEnd,
                                onValueChange = { customEnd = it },
                                label = { Text("End (e.g. 08:00)", fontSize = 11.sp) },
                                singleLine = true,
                                modifier = Modifier.weight(1f)
                            )
                        }
                        Button(
                            onClick = {
                                val doc = selectedDoctor ?: doctors.firstOrNull()
                                if (slotRepository != null) {
                                    val newS = Slot(
                                        id = UUID.randomUUID().toString(),
                                        clinicId = effectiveClinicId,
                                        doctorId = doc?.id,
                                        slotDate = selectedDate,
                                        startTime = customStart.trim(),
                                        endTime = customEnd.trim(),
                                        maxCapacity = (customCap.toIntOrNull() ?: 10).coerceAtLeast(1),
                                        bookedCount = 0,
                                        isPublished = true
                                    )
                                    coroutineScope.launch {
                                        slotRepository.createSlot(newS)
                                        slots = slots + newS
                                        allClinicSlots = allClinicSlots + newS
                                        val note = "Added ${newS.startTime}-${newS.endTime}"
                                        ClinicScheduleStorage.saveDateOverrideNote(context, effectiveClinicId, selectedDate, note)
                                        dateOverrideNote = note
                                        actionMessage = "✓ Saved custom working hours (${newS.startTime} - ${newS.endTime}) for $selectedDate!"
                                        showDateOverrideModal = false
                                    }
                                }
                            },
                            modifier = Modifier.fillMaxWidth(),
                            colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF00796B))
                        ) {
                            Icon(Icons.Default.Add, contentDescription = null, modifier = Modifier.size(16.dp))
                            Spacer(Modifier.width(6.dp))
                            Text("Save & Add Hours for $selectedDate", fontWeight = FontWeight.Bold)
                        }

                        OutlinedButton(
                            onClick = {
                                coroutineScope.launch {
                                    daySlots.forEach { s -> slotRepository?.deleteSlot(s.id) }
                                    slots = slots.filter { it.slotDate != selectedDate }
                                    ClinicScheduleStorage.saveDateOverrideNote(context, effectiveClinicId, selectedDate, "DAY_OFF")
                                    dateOverrideNote = "DAY_OFF"
                                    actionMessage = "✓ Marked $selectedDate as Day Off (all hours removed for this date)."
                                    showDateOverrideModal = false
                                }
                            },
                            colors = ButtonDefaults.outlinedButtonColors(contentColor = MaterialTheme.colorScheme.error),
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Text("Mark $selectedDate as Day Off (Clear Hours)", fontWeight = FontWeight.Bold, fontSize = 12.sp)
                        }
                    }
                },
                confirmButton = {
                    TextButton(onClick = { showDateOverrideModal = false }) {
                        Text("Done")
                    }
                }
            )
        }

        // Publish Slot Dialog
        if (showAddDialog) {
            if (false) {
                AlertDialog(
                    onDismissRequest = { showAddDialog = false },
                    title = { Text("Slot Publishing Locked", fontWeight = FontWeight.Bold) },
                    text = {
                        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                            Text(
                                "Cannot publish slots: No doctor has accepted an invitation to your clinic yet.",
                                color = MaterialTheme.colorScheme.error,
                                fontSize = 13.sp,
                                fontWeight = FontWeight.SemiBold
                            )
                        }
                    },
                    confirmButton = {
                        Button(
                            onClick = {
                                showAddDialog = false
                                showAddDialog = true
                            }
                        ) {
                            Text("Go to Staff Invites")
                        }
                    },
                    dismissButton = {
                        TextButton(onClick = { showAddDialog = false }) {
                            Text("Cancel")
                        }
                    }
                )
            } else {
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

                val startMinutes = parseTimeMins(startTime)
                val endMinutes = parseTimeMins(endTime)

                val isDateToday = selectedDate == today
                val minAllowedMinutesToday = if (isDateToday) {
                    val localNow = java.time.LocalTime.now()
                    (localNow.hour * 60 + localNow.minute - 120).coerceAtLeast(0)
                } else null
                val isDateInPast = selectedDate < today
                val isInvalidInterval = endMinutes <= startMinutes
                val hasTimeError = isDateInPast || isInvalidInterval

                AlertDialog(
                    onDismissRequest = { showAddDialog = false },
                    title = { Text(if (isLabMode) "Add Sample Collection Slot ($selectedDate)" else "Add Slot ($selectedDate)", fontWeight = FontWeight.Bold) },
                    text = {
                        Column(
                            modifier = Modifier.verticalScroll(rememberScrollState()),
                            verticalArrangement = Arrangement.spacedBy(12.dp)
                        ) {
                            if (!isLabMode) {
                                Text("Select Doctor", fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
                                Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                                    doctors.forEach { doc ->
                                        Row(
                                            verticalAlignment = Alignment.CenterVertically,
                                            modifier = Modifier.fillMaxWidth()
                                        ) {
                                            RadioButton(
                                                selected = selectedDoctor?.id == doc.id,
                                                onClick = { selectedDoctor = doc }
                                            )
                                            Text("${doc.fullName} (${doc.specialty ?: "General"})", fontSize = 13.sp)
                                        }
                                    }
                                }
                            } else {
                                Surface(
                                    shape = RoundedCornerShape(10.dp),
                                    color = Color(0xFFE0F2F1),
                                    border = BorderStroke(1.dp, Color(0xFF80CBC4)),
                                    modifier = Modifier.fillMaxWidth()
                                ) {
                                    Row(
                                        modifier = Modifier.padding(10.dp),
                                        verticalAlignment = Alignment.CenterVertically,
                                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                                    ) {
                                        Icon(Icons.Default.Science, contentDescription = null, tint = Color(0xFF00796B), modifier = Modifier.size(20.dp))
                                        Column {
                                            Text("Diagnostic Lab Mode", fontWeight = FontWeight.Bold, fontSize = 12.sp, color = Color(0xFF004D40))
                                            Text("Facility phlebotomy collection window (no doctor required)", fontSize = 11.sp, color = Color(0xFF00796B))
                                        }
                                    }
                                }
                            }

                            Text("Slot Time Window (e.g. 09:00 to 12:00 or after-hours):", fontSize = 13.sp, fontWeight = FontWeight.SemiBold)

                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.spacedBy(10.dp)
                            ) {
                                Surface(
                                    shape = RoundedCornerShape(12.dp),
                                    color = MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.35f),
                                    border = BorderStroke(1.dp, MaterialTheme.colorScheme.primary.copy(alpha = 0.6f)),
                                    modifier = Modifier
                                        .weight(1f)
                                        .clickable { showStartTimePicker = true }
                                ) {
                                    Column(
                                        modifier = Modifier.padding(12.dp),
                                        horizontalAlignment = Alignment.CenterHorizontally
                                    ) {
                                        Text("START TIME", fontSize = 10.sp, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.primary)
                                        Spacer(Modifier.height(4.dp))
                                        Text(format12h(startTime), fontSize = 16.sp, fontWeight = FontWeight.ExtraBold)
                                        Text("($startTime)", fontSize = 10.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                    }
                                }

                                Surface(
                                    shape = RoundedCornerShape(12.dp),
                                    color = if (isInvalidInterval) MaterialTheme.colorScheme.errorContainer.copy(alpha = 0.5f) else MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f),
                                    border = BorderStroke(1.dp, if (isInvalidInterval) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.outlineVariant),
                                    modifier = Modifier
                                        .weight(1f)
                                        .clickable { showEndTimePicker = true }
                                ) {
                                    Column(
                                        modifier = Modifier.padding(12.dp),
                                        horizontalAlignment = Alignment.CenterHorizontally
                                    ) {
                                        Text("END TIME", fontSize = 10.sp, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                        Spacer(Modifier.height(4.dp))
                                        Text(format12h(endTime), fontSize = 16.sp, fontWeight = FontWeight.ExtraBold)
                                        Text("($endTime)", fontSize = 10.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                    }
                                }
                            }

                            if (isInvalidInterval) {
                                Surface(
                                    color = MaterialTheme.colorScheme.errorContainer,
                                    shape = RoundedCornerShape(8.dp),
                                    modifier = Modifier.fillMaxWidth()
                                ) {
                                    Row(
                                        modifier = Modifier.padding(8.dp),
                                        verticalAlignment = Alignment.CenterVertically,
                                        horizontalArrangement = Arrangement.spacedBy(6.dp)
                                    ) {
                                        Icon(Icons.Default.Warning, contentDescription = null, tint = MaterialTheme.colorScheme.error, modifier = Modifier.size(16.dp))
                                        Text(
                                            text = "End time (${format12h(endTime)}) must be later than start time (${format12h(startTime)}).",
                                            fontSize = 11.sp,
                                            color = MaterialTheme.colorScheme.onErrorContainer
                                        )
                                    }
                                }
                            } else if (!hasTimeError) {
                                Text(
                                    text = "✓ Slot Time Window: ${format12h(startTime)} to ${format12h(endTime)} (${endMinutes - startMinutes} mins) — Can be published anytime, even on closed days or outside regular hours.",
                                    fontSize = 11.sp,
                                    color = Color(0xFF047857),
                                    fontWeight = FontWeight.SemiBold
                                )
                            }

                            Text("Quick Duration:", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            Row(
                                horizontalArrangement = Arrangement.spacedBy(6.dp),
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .horizontalScroll(rememberScrollState())
                            ) {
                                listOf(15, 30, 60, 120, 180, 240).forEach { mins ->
                                    FilterChip(
                                        selected = (endMinutes - startMinutes) == mins,
                                        onClick = {
                                            endTime = DateTimePickers.addMinutesToTime(startTime, mins)
                                        },
                                        label = { Text(if (mins >= 60) "+${mins / 60} hr" else "+$mins min", fontSize = 11.sp) }
                                    )
                                }
                            }

                            OutlinedTextField(
                                value = capacity,
                                onValueChange = { capacity = it },
                                label = { Text("Patient Capacity") },
                                placeholder = { Text(if (isLabMode) "25" else "10") },
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
                                val capVal = (capacity.toIntOrNull() ?: if (isLabMode) 25 else 10).coerceAtLeast(1)
                                val doc = if (isLabMode) null else (selectedDoctor ?: doctors.firstOrNull())
                                if (startTime.isNotBlank() && endTime.isNotBlank()) {
                                    val newSlot = Slot(
                                        id = UUID.randomUUID().toString(),
                                        clinicId = effectiveClinicId,
                                        doctorId = doc?.id,
                                        slotDate = selectedDate,
                                        startTime = startTime.trim(),
                                        endTime = endTime.trim(),
                                        maxCapacity = capVal,
                                        bookedCount = 0,
                                        isPublished = true
                                    )

                                    coroutineScope.launch {
                                        slotRepository?.createSlot(newSlot)
                                        slots = slots + newSlot
                                        allClinicSlots = allClinicSlots + newSlot
                                        ClinicScheduleStorage.saveDateOverrideNote(context, effectiveClinicId, selectedDate, "Added ${newSlot.startTime}-${newSlot.endTime}")
                                        dateOverrideNote = "Added ${newSlot.startTime}-${newSlot.endTime}"
                                        showAddDialog = false
                                        actionMessage = "✓ Slot added for $selectedDate (${newSlot.startTime} - ${newSlot.endTime})!"
                                    }
                                }
                            },
                            enabled = !hasTimeError
                        ) {
                            Text("Add slot")
                        }
                    },
                    dismissButton = {
                        TextButton(onClick = { showAddDialog = false }) {
                            Text("Cancel")
                        }
                    }
                )

                if (showStartTimePicker) {
                    TimeCarouselPickerDialog(
                        initialTime = startTime,
                        minTimeMinutes = if (isDateToday) minAllowedMinutesToday else null,
                        title = "Select Start Time",
                        onDismiss = { showStartTimePicker = false },
                        onTimeSelected = { picked ->
                            startTime = picked
                            endTime = DateTimePickers.addMinutesToTime(picked, 120)
                        }
                    )
                }

                if (showEndTimePicker) {
                    TimeCarouselPickerDialog(
                        initialTime = endTime,
                        minTimeMinutes = startMinutes,
                        title = "Select End Time",
                        onDismiss = { showEndTimePicker = false },
                        onTimeSelected = { picked ->
                            endTime = picked
                        }
                    )
                }
            }
        }

        // Remove Slot Confirmation Dialog
        if (slotToDelete != null) {
            val target = slotToDelete!!
            val docName = if (isLabMode) "Lab Phlebotomy Counter" else (doctors.find { it.id == target.doctorId }?.fullName ?: "Doctor")
            AlertDialog(
                onDismissRequest = { slotToDelete = null },
                icon = { Icon(Icons.Default.DeleteForever, contentDescription = null, tint = MaterialTheme.colorScheme.error, modifier = Modifier.size(32.dp)) },
                title = { Text("Remove Working Hour?", fontWeight = FontWeight.Bold) },
                text = {
                    Text(
                        "Remove the working hour for $docName (${target.startTime} - ${target.endTime}) on ${target.slotDate}?",
                        fontSize = 13.sp
                    )
                },
                confirmButton = {
                    Button(
                        onClick = {
                            val toRemove = target
                            slotToDelete = null
                            coroutineScope.launch {
                                val ok = slotRepository?.deleteSlot(toRemove.id) ?: false
                                if (ok) {
                                    slots = slots.filter { it.id != toRemove.id }
                                    ClinicScheduleStorage.saveDateOverrideNote(context, effectiveClinicId, selectedDate, "Removed ${toRemove.startTime}-${toRemove.endTime}")
                                    dateOverrideNote = "Removed ${toRemove.startTime}-${toRemove.endTime}"
                                    actionMessage = "✓ Working hour ${toRemove.startTime} - ${toRemove.endTime} removed for ${toRemove.slotDate}."
                                }
                            }
                        },
                        colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.error)
                    ) {
                        Text("Yes, Remove", fontWeight = FontWeight.Bold)
                    }
                },
                dismissButton = {
                    TextButton(onClick = { slotToDelete = null }) {
                        Text("Cancel")
                    }
                }
            )
        }

        // Edit Capacity Dialog
        if (slotToEditCapacity != null) {
            val target = slotToEditCapacity!!
            AlertDialog(
                onDismissRequest = { slotToEditCapacity = null },
                icon = { Icon(Icons.Default.PeopleAlt, contentDescription = null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(32.dp)) },
                title = { Text("Edit Patient Capacity", fontWeight = FontWeight.Bold) },
                text = {
                    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        Text(
                            "Update maximum patient bookings for (${target.startTime} - ${target.endTime}) on ${target.slotDate}:",
                            fontSize = 13.sp,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                        OutlinedTextField(
                            value = newCapacityInput,
                            onValueChange = { newCapacityInput = it },
                            label = { Text("Maximum Patient Capacity") },
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                            modifier = Modifier.fillMaxWidth(),
                            shape = RoundedCornerShape(10.dp)
                        )
                    }
                },
                confirmButton = {
                    Button(
                        onClick = {
                            val capVal = newCapacityInput.trim().toIntOrNull()
                            if (capVal != null && capVal > 0) {
                                val toUpdate = target
                                slotToEditCapacity = null
                                coroutineScope.launch {
                                    val ok = slotRepository?.updateSlotCapacity(toUpdate.id, capVal) ?: false
                                    if (ok) {
                                        slots = slots.map { if (it.id == toUpdate.id) it.copy(maxCapacity = capVal) else it }
                                        actionMessage = "✓ Capacity updated to $capVal patients."
                                    }
                                }
                            }
                        }
                    ) {
                        Text("Save Capacity", fontWeight = FontWeight.Bold)
                    }
                },
                dismissButton = {
                    TextButton(onClick = { slotToEditCapacity = null }) {
                        Text("Cancel")
                    }
                }
            )
        }

        // Slot Patients Dialog (Links directly to Live Queue)
        if (showSlotPatientsModal != null) {
            val targetSlot = showSlotPatientsModal!!
            val targetDoc = doctors.find { it.id == targetSlot.doctorId }
            val remainingSeats = (targetSlot.maxCapacity - targetSlot.bookedCount).coerceAtLeast(0)
            AlertDialog(
                onDismissRequest = { showSlotPatientsModal = null },
                icon = {
                    Icon(
                        Icons.Default.People,
                        contentDescription = null,
                        tint = Color(0xFF00796B),
                        modifier = Modifier.size(32.dp)
                    )
                },
                title = {
                    Text("Slot Patients", fontWeight = FontWeight.Bold)
                },
                text = {
                    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        Surface(
                            shape = RoundedCornerShape(12.dp),
                            color = Color(0xFFF1F5F9),
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Column(
                                modifier = Modifier.padding(12.dp),
                                verticalArrangement = Arrangement.spacedBy(4.dp)
                            ) {
                                Text(
                                    text = "${targetSlot.startTime} – ${targetSlot.endTime} ($selectedDate)",
                                    fontWeight = FontWeight.Bold,
                                    fontSize = 14.sp,
                                    color = Color(0xFF0F172A)
                                )
                                Text(
                                    text = if (isLabMode) "Service: Lab Phlebotomy / Sample Collection" else "Doctor: ${targetDoc?.fullName ?: "All Doctors"}",
                                    fontSize = 12.sp,
                                    color = Color(0xFF475569)
                                )
                                Text(
                                    text = "Registration: ${targetSlot.bookedCount}/${targetSlot.maxCapacity} seats • $remainingSeats seats remaining",
                                    fontSize = 12.sp,
                                    fontWeight = FontWeight.SemiBold,
                                    color = if (remainingSeats > 0) Color(0xFF15803D) else Color(0xFFDC2626)
                                )
                            }
                        }

                        Text(
                            text = "Jump to the Live Patient Queue Board to view consultation turns, notify waiting patients, or advance queue tokens for this slot session.",
                            fontSize = 12.sp,
                            color = Color(0xFF64748B)
                        )
                    }
                },
                confirmButton = {
                    Button(
                        onClick = {
                            val slotDocId = targetSlot.doctorId
                            val targetDate = targetSlot.slotDate.ifBlank { selectedDate }
                            showSlotPatientsModal = null
                            val route = if (!slotDocId.isNullOrBlank()) {
                                "${NavRoutes.QueueBoard}/$effectiveClinicId?doctorId=$slotDocId&date=$targetDate"
                            } else {
                                "${NavRoutes.QueueBoard}/$effectiveClinicId?date=$targetDate"
                            }
                            navController.navigate(route)
                        },
                        colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF0284C7)),
                        shape = RoundedCornerShape(10.dp)
                    ) {
                        Icon(Icons.Default.Launch, contentDescription = null, modifier = Modifier.size(15.dp))
                        Spacer(Modifier.width(4.dp))
                        Text("Open in Live Queue", fontWeight = FontWeight.Bold, fontSize = 12.sp)
                    }
                },
                dismissButton = {
                    OutlinedButton(
                        onClick = {
                            val toEdit = targetSlot
                            showSlotPatientsModal = null
                            slotToEditCapacity = toEdit
                            newCapacityInput = toEdit.maxCapacity.toString()
                        },
                        shape = RoundedCornerShape(10.dp)
                    ) {
                        Text("Edit Capacity", fontSize = 12.sp)
                    }
                }
            )
        }
    }
}

