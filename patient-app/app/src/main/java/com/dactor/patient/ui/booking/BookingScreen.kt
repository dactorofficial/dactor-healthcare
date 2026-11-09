package com.dactor.patient.ui.booking

import android.net.Uri
import android.widget.Toast
import kotlinx.coroutines.launch
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.navigation.NavController
import coil.compose.AsyncImage
import com.dactor.patient.data.model.Clinic
import com.dactor.patient.data.model.Doctor
import com.dactor.patient.data.model.Slot
import com.dactor.patient.data.repository.AuthRepository
import com.dactor.patient.data.repository.ClinicRepository
import com.dactor.patient.data.repository.DoctorRepository
import com.dactor.patient.data.repository.SlotRepository
import com.dactor.patient.domain.util.CurrencyFormatter
import com.dactor.patient.ui.navigation.NavRoutes
import java.time.LocalDate
import java.time.YearMonth
import java.time.format.DateTimeFormatter
import java.time.format.TextStyle
import java.util.Locale

enum class CalendarDateState {
    AVAILABLE,      // 1. Available: selectable (green dot)
    FULLY_BOOKED,   // 2. Fully booked: not selectable (amber dot)
    CLOSED,         // 3. Clinic closed: not selectable (gray dot)
    PAST            // 4. Past date: not selectable
}

fun computeCalendarDateState(
    date: LocalDate,
    clinic: Clinic?,
    selectedDoctor: Doctor?,
    monthSlotsMap: Map<String, List<Slot>>,
    todayDate: LocalDate
): CalendarDateState {
    val dateStr = date.toString()
    if (date < todayDate) {
        return CalendarDateState.PAST
    }

    val isHoliday = clinic?.isHolidayOnDate(dateStr) == true
    val schedule = clinic?.getScheduleForDate(dateStr)
    val isWeeklyOff = schedule?.isOpen == false
    if (isHoliday || isWeeklyOff) {
        return CalendarDateState.CLOSED
    }

    val isLabClinic = clinic?.type?.lowercase()?.let { it == "diagnostic_lab" || it.contains("lab") } == true ||
        clinic?.name?.lowercase()?.contains("lab") == true ||
        clinic?.specialties?.any { it.lowercase().contains("lab") || it.lowercase().contains("patholog") } == true
    if (isLabClinic) {
        return CalendarDateState.AVAILABLE
    }

    val rawSlots = monthSlotsMap[dateStr]?.filter { it.isPublished } ?: emptyList()
    val relevantSlots = if (selectedDoctor != null) {
        val matches = rawSlots.filter { it.doctorId.isNullOrBlank() || it.doctorId == selectedDoctor.id }
        matches.ifEmpty { rawSlots.filter { it.doctorId.isNullOrBlank() } }
    } else {
        rawSlots
    }

    val activeSlots = if (date == todayDate) {
        relevantSlots.filter { !SlotRepository.isSlotEndTimeOver(it.endTime, dateStr, it.startTime) }
    } else {
        relevantSlots
    }

    if (activeSlots.isEmpty()) {
        return CalendarDateState.CLOSED
    }

    val hasCapacity = activeSlots.any { (it.maxCapacity - it.bookedCount) > 0 }
    return if (hasCapacity) {
        CalendarDateState.AVAILABLE
    } else {
        CalendarDateState.FULLY_BOOKED
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun BookingScreen(
    navController: NavController,
    clinicId: String = "",
    initialDoctorId: String? = null,
    initialDate: String? = null,
    rescheduleApptId: String? = null,
    slotRepository: SlotRepository? = null,
    doctorRepository: DoctorRepository? = null,
    clinicRepository: ClinicRepository? = null,
    authRepository: AuthRepository? = null,
    appointmentRepository: com.dactor.patient.data.repository.AppointmentRepository? = null,
    queueRepository: com.dactor.patient.data.repository.QueueRepository? = null,
    sessionManager: com.dactor.patient.data.local.UserSessionManager? = null
) {
    val context = LocalContext.current
    val coroutineScope = rememberCoroutineScope()
    val todayDate = remember { LocalDate.now() }
    val today = remember { todayDate.toString() }

    var activeRescheduleCancelled by remember { mutableStateOf(false) }
    val pendingReschedule = remember(rescheduleApptId, activeRescheduleCancelled) {
        if (activeRescheduleCancelled || rescheduleApptId.isNullOrBlank()) {
            null
        } else {
            sessionManager?.getPendingReschedule()?.takeIf {
                it.appointmentId == rescheduleApptId
            }
        }
    }
    val isRescheduleMode = pendingReschedule != null
    var isExecutingReschedule by remember { mutableStateOf(false) }

    // Clear stale pending reschedule if navigating without an explicit rescheduleApptId
    LaunchedEffect(rescheduleApptId) {
        if (rescheduleApptId.isNullOrBlank()) {
            sessionManager?.clearPendingReschedule()
        }
    }

    val pendingRedirect = remember(clinicId) {
        sessionManager?.getPendingBookingRedirect()?.takeIf { it.clinicId == clinicId }
    }

    val resolvedInitialDateStr = remember(pendingRedirect, initialDate, today) {
        (pendingRedirect?.selectedDate ?: initialDate?.takeIf { it.isNotBlank() } ?: today)
    }

    var currentTimeTicker by remember { mutableStateOf(System.currentTimeMillis()) }
    LaunchedEffect(Unit) {
        while (true) {
            kotlinx.coroutines.delay(15_000L)
            currentTimeTicker = System.currentTimeMillis()
        }
    }

    var viewedYearMonth by remember {
        val initDate = try { LocalDate.parse(resolvedInitialDateStr) } catch (e: Exception) { null } ?: todayDate
        mutableStateOf(YearMonth.from(initDate))
    }
    var selectedDate by remember {
        mutableStateOf(resolvedInitialDateStr)
    }

    val listState = rememberLazyListState()
    val dateListState = rememberLazyListState()

    val daysInMonth = remember(viewedYearMonth, todayDate) {
        val startDay = if (viewedYearMonth == YearMonth.from(todayDate)) todayDate.dayOfMonth else 1
        val totalDays = viewedYearMonth.lengthOfMonth()
        (startDay..totalDays).map { day -> viewedYearMonth.atDay(day) }
    }

    var clinic by remember { mutableStateOf<Clinic?>(null) }
    var doctors by remember { mutableStateOf<List<Doctor>>(emptyList()) }
    var selectedDoctor by remember { mutableStateOf<Doctor?>(null) }
    var slots by remember { mutableStateOf<List<Slot>>(emptyList()) }
    var monthSlotsMap by remember { mutableStateOf<Map<String, List<Slot>>>(emptyMap()) }
    var isLoadingMonthSlots by remember { mutableStateOf(false) }
    var selectedSlotId by remember { mutableStateOf<String?>(pendingRedirect?.selectedSlotId) }
    var isLoading by remember { mutableStateOf(true) }

    var showTransactionFailedBanner by remember {
        mutableStateOf(sessionManager?.consumeTransactionFailedBanner() == true)
    }
    var isNavigatingToForm by remember { mutableStateOf(false) }

    LaunchedEffect(showTransactionFailedBanner) {
        if (showTransactionFailedBanner) {
            kotlinx.coroutines.delay(2000L)
            showTransactionFailedBanner = false
        }
    }

    val isUserLoggedIn = sessionManager?.isLoggedIn() == true || (authRepository?.isLoggedIn() == true)

    LaunchedEffect(clinicId, initialDoctorId) {
        if (clinicId.isNotBlank()) {
            if (clinicRepository != null) {
                clinic = clinicRepository.getClinicById(clinicId, forceRefresh = true)
            }
            val targetDocId = pendingRedirect?.doctorId ?: pendingReschedule?.doctorId ?: initialDoctorId
            if (doctorRepository != null) {
                val docs = doctorRepository.getDoctors(clinicId).toMutableList()
                if (!targetDocId.isNullOrBlank() && docs.none { it.id == targetDocId }) {
                    val initDoc = doctorRepository.getDoctorById(targetDocId)
                    if (initDoc != null) {
                        docs.add(0, initDoc)
                    }
                }
                doctors = docs
                selectedDoctor = if (!targetDocId.isNullOrBlank()) {
                    docs.firstOrNull { it.id == targetDocId } ?: docs.firstOrNull()
                } else {
                    docs.firstOrNull()
                }
            }
        }
        isLoading = false

        // Restore exact scroll position if returning from login redirect
        if (pendingRedirect != null) {
            try {
                listState.scrollToItem(pendingRedirect.scrollIndex, pendingRedirect.scrollOffset)
            } catch (ignored: Exception) {}
            sessionManager?.clearPendingBookingRedirect()
        }
    }

    // Fetch availability for the whole visible month in one call, and refetch when the month or doctor changes
    LaunchedEffect(clinicId, viewedYearMonth, selectedDoctor) {
        if (slotRepository != null && clinicId.isNotBlank()) {
            isLoadingMonthSlots = true
            try {
                val res = slotRepository.getMonthSlots(clinicId, viewedYearMonth, selectedDoctor?.id)
                monthSlotsMap = res

                val isCurrentMonth = (viewedYearMonth == YearMonth.from(todayDate))
                val todayState = computeCalendarDateState(todayDate, clinic, selectedDoctor, res, todayDate)

                if (isCurrentMonth && todayState == CalendarDateState.AVAILABLE) {
                    val selDateParsed = try { LocalDate.parse(selectedDate) } catch (_: Exception) { null }
                    if (selectedDate.isBlank() || selDateParsed == null || selDateParsed < todayDate || YearMonth.from(selDateParsed) != viewedYearMonth) {
                        selectedDate = today
                    }
                } else {
                    val startDay = if (isCurrentMonth) todayDate.dayOfMonth else 1
                    val nextAvail = (startDay..viewedYearMonth.lengthOfMonth())
                        .map { viewedYearMonth.atDay(it) }
                        .firstOrNull { computeCalendarDateState(it, clinic, selectedDoctor, res, todayDate) == CalendarDateState.AVAILABLE }

                    val selDateParsed = try { LocalDate.parse(selectedDate) } catch (_: Exception) { null }
                    val isCurrentSelAvailable = selDateParsed != null &&
                        selDateParsed >= todayDate &&
                        YearMonth.from(selDateParsed) == viewedYearMonth &&
                        computeCalendarDateState(selDateParsed, clinic, selectedDoctor, res, todayDate) == CalendarDateState.AVAILABLE

                    if (nextAvail != null && !isCurrentSelAvailable) {
                        selectedDate = nextAvail.toString()
                    } else if (selectedDate.isBlank() || selDateParsed == null || selDateParsed < todayDate) {
                        selectedDate = (nextAvail ?: todayDate).toString()
                    }
                }
            } catch (e: Exception) {
                e.printStackTrace()
            } finally {
                isLoadingMonthSlots = false
            }
        }
    }





    LaunchedEffect(selectedDate, monthSlotsMap, selectedDoctor, currentTimeTicker) {
        if (clinicRepository != null && clinicId.isNotBlank()) {
            clinic = clinicRepository.getClinicById(clinicId, forceRefresh = true) ?: clinic
        }
        val isClosedHoliday = clinic?.isHolidayOnDate(selectedDate) == true
        if (isClosedHoliday) {
            slots = emptyList()
            selectedSlotId = null
        } else {
            val raw = monthSlotsMap[selectedDate]?.filter { it.isPublished } ?: emptyList()
            val isCurrentLab = clinic?.type?.lowercase()?.let { it == "diagnostic_lab" || it.contains("lab") } == true ||
                clinic?.name?.lowercase()?.contains("lab") == true ||
                clinic?.specialties?.any { it.lowercase().contains("lab") || it.lowercase().contains("patholog") } == true
            val filtered = if (isCurrentLab) {
                raw
            } else if (selectedDoctor != null) {
                val docMatches = raw.filter { it.doctorId == selectedDoctor?.id }
                docMatches.ifEmpty { raw.filter { it.doctorId.isNullOrBlank() } }
            } else {
                raw
            }
            val effectiveList = if (filtered.isEmpty() && isCurrentLab) {
                listOf(
                    Slot(id = "lab_auto_${selectedDate}_07:00:00", clinicId = clinicId, doctorId = "", slotDate = selectedDate, startTime = "07:00:00", endTime = "08:00:00", maxCapacity = 25, bookedCount = 0, isPublished = true),
                    Slot(id = "lab_auto_${selectedDate}_08:00:00", clinicId = clinicId, doctorId = "", slotDate = selectedDate, startTime = "08:00:00", endTime = "09:00:00", maxCapacity = 25, bookedCount = 0, isPublished = true),
                    Slot(id = "lab_auto_${selectedDate}_09:00:00", clinicId = clinicId, doctorId = "", slotDate = selectedDate, startTime = "09:00:00", endTime = "10:00:00", maxCapacity = 25, bookedCount = 0, isPublished = true),
                    Slot(id = "lab_auto_${selectedDate}_10:00:00", clinicId = clinicId, doctorId = "", slotDate = selectedDate, startTime = "10:00:00", endTime = "11:00:00", maxCapacity = 25, bookedCount = 0, isPublished = true),
                    Slot(id = "lab_auto_${selectedDate}_11:00:00", clinicId = clinicId, doctorId = "", slotDate = selectedDate, startTime = "11:00:00", endTime = "12:00:00", maxCapacity = 25, bookedCount = 0, isPublished = true),
                    Slot(id = "lab_auto_${selectedDate}_12:00:00", clinicId = clinicId, doctorId = "", slotDate = selectedDate, startTime = "12:00:00", endTime = "13:00:00", maxCapacity = 25, bookedCount = 0, isPublished = true),
                    Slot(id = "lab_auto_${selectedDate}_13:00:00", clinicId = clinicId, doctorId = "", slotDate = selectedDate, startTime = "13:00:00", endTime = "14:00:00", maxCapacity = 25, bookedCount = 0, isPublished = true),
                    Slot(id = "lab_auto_${selectedDate}_14:00:00", clinicId = clinicId, doctorId = "", slotDate = selectedDate, startTime = "14:00:00", endTime = "15:00:00", maxCapacity = 25, bookedCount = 0, isPublished = true),
                    Slot(id = "lab_auto_${selectedDate}_15:00:00", clinicId = clinicId, doctorId = "", slotDate = selectedDate, startTime = "15:00:00", endTime = "16:00:00", maxCapacity = 25, bookedCount = 0, isPublished = true)
                )
            } else {
                filtered
            }
            val active = if (selectedDate == today) {
                effectiveList.filter { !SlotRepository.isSlotEndTimeOver(it.endTime, selectedDate, it.startTime) }
            } else {
                effectiveList
            }
            slots = active

            // Preserve previously restored slotId if valid, else select first available published slot
            val currentMatch = active.firstOrNull { it.id == selectedSlotId && (it.maxCapacity - it.bookedCount) > 0 }
            val firstOpen = active.firstOrNull { (it.maxCapacity - it.bookedCount) > 0 }
            selectedSlotId = (currentMatch ?: firstOpen)?.id
        }
    }

    val isLabClinic = remember(clinic) {
        val t = clinic?.type?.lowercase() ?: ""
        val n = clinic?.name?.lowercase() ?: ""
        t == "diagnostic_lab" || t.contains("lab") || n.contains("lab") ||
            (clinic?.specialties?.any { it.lowercase().contains("lab") || it.lowercase().contains("patholog") } == true)
    }

    val isDeclaredHolidayOnSelectedDate = remember(clinic, selectedDate) {
        clinic?.isHolidayOnDate(selectedDate) == true
    }
    val selectedDateSchedule = remember(clinic, selectedDate) {
        clinic?.getScheduleForDate(selectedDate) ?: com.dactor.patient.data.model.DayScheduleInfo(
            dayOfWeek = "TODAY",
            displayName = "Today",
            isOpen = true,
            openTime = "08:00 AM",
            closeTime = "05:00 PM",
            hasBreak = true,
            breakStart = "01:00 PM",
            breakEnd = "02:00 PM"
        )
    }
    val isClinicClosedOnSelectedDate = isDeclaredHolidayOnSelectedDate || !selectedDateSchedule.isOpen

    val activeDoctor = if (isLabClinic) null else (selectedDoctor ?: doctors.firstOrNull())
    val consultationFee = if (isLabClinic) 0.0 else (activeDoctor?.consultationFee ?: 500.0)
    val selectedSlot = slots.firstOrNull { it.id == selectedSlotId }
    val canBookSelectedSlot = !isClinicClosedOnSelectedDate && (selectedSlot != null &&
        selectedSlot.isPublished &&
        (selectedSlot.maxCapacity - selectedSlot.bookedCount) > 0 &&
        !SlotRepository.isSlotEndTimeOver(selectedSlot.endTime, selectedDate, selectedSlot.startTime))

    fun redirectToLoginSavingPosition(slotIdToSave: String?) {
        val currentRoute = NavRoutes.Booking.createRoute(clinicId, activeDoctor?.id)
        sessionManager?.savePendingBookingRedirect(
            route = currentRoute,
            clinicId = clinicId,
            doctorId = activeDoctor?.id,
            selectedDate = selectedDate,
            selectedSlotId = slotIdToSave,
            scrollIndex = listState.firstVisibleItemIndex,
            scrollOffset = listState.firstVisibleItemScrollOffset
        )
        Toast.makeText(
            context,
            "Please sign in to book an appointment slot",
            Toast.LENGTH_SHORT
        ).show()
        navController.navigate(NavRoutes.Login.route)
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text(if (isLabClinic) "Book Lab Test Appointment" else "Book Appointment", fontWeight = FontWeight.Bold, fontSize = 18.sp)
                        Text(
                            if (isLabClinic) "Select a time slot & choose diagnostic tests on next step"
                            else "Choose a doctor and select a published clinic slot",
                            fontSize = 11.sp,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                },
                navigationIcon = {
                    IconButton(onClick = { navController.popBackStack() }) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                }
            )
        },
        bottomBar = {
            Surface(
                tonalElevation = 8.dp,
                shadowElevation = 8.dp,
                color = Color.White,
                modifier = Modifier.fillMaxWidth()
            ) {
                Box(modifier = Modifier.padding(16.dp)) {
                    Button(
                        onClick = {
                            if (isNavigatingToForm || isExecutingReschedule) return@Button
                            val chosenSlotId = selectedSlot?.id ?: if (isLabClinic) "synth__lab_$selectedDate" else null
                            if (selectedSlot != null && SlotRepository.isSlotEndTimeOver(selectedSlot.endTime, selectedDate, selectedSlot.startTime)) {
                                Toast.makeText(context, "This time slot has already passed. Please select an upcoming slot.", Toast.LENGTH_SHORT).show()
                                return@Button
                            }

                            // If in Reschedule Mode: execute reschedule in place without asking for payment or booking form!
                            if (isRescheduleMode && pendingReschedule != null) {
                                if (selectedSlot == null) {
                                    Toast.makeText(context, "Please select an available slot to reschedule", Toast.LENGTH_SHORT).show()
                                    return@Button
                                }
                                isExecutingReschedule = true
                                val targetDoctorId = selectedDoctor?.id?.takeIf { it.isNotBlank() }
                                    ?: selectedSlot.doctorId.takeIf { !it.isNullOrBlank() }
                                    ?: pendingReschedule.doctorId
                                coroutineScope.launch {
                                    try {
                                        val existingAppt = appointmentRepository?.getAppointmentById(pendingReschedule.appointmentId)
                                        val isCompleted = existingAppt?.checkinStatus?.lowercase() in listOf("done", "completed")

                                        if (isCompleted && !isLabClinic) {
                                            // Completed consultation -> Protect medical record, book fresh follow-up
                                            val created = appointmentRepository?.bookFollowUpAppointment(
                                                trackingCode = pendingReschedule.trackingCode,
                                                slotId = selectedSlot.id,
                                                clinicId = pendingReschedule.clinicId,
                                                doctorId = targetDoctorId,
                                                appointmentDate = selectedDate,
                                                appointmentTime = selectedSlot.startTime
                                            )
                                            if (created != null) {
                                                sessionManager?.clearPendingReschedule()
                                                Toast.makeText(context, "Follow-Up booked for $selectedDate at ${selectedSlot.startTime}!", Toast.LENGTH_LONG).show()
                                                navController.navigate(NavRoutes.QueueStatus.createRoute(created.trackingCode10Digit)) {
                                                    popUpTo(NavRoutes.PatientMain.route) { inclusive = false }
                                                }
                                            } else {
                                                Toast.makeText(context, "Failed to book follow-up. Please try again.", Toast.LENGTH_SHORT).show()
                                            }
                                        } else {
                                            // Active / Upcoming / Missed / No-Show visit -> Reschedule in-place
                                            val ok = appointmentRepository?.rescheduleAppointment(
                                                id = pendingReschedule.appointmentId,
                                                newDate = selectedDate,
                                                newTime = selectedSlot.startTime,
                                                slotId = selectedSlot.id,
                                                newDoctorId = if (isLabClinic) null else targetDoctorId
                                            ) ?: false
                                            if (ok) {
                                                if (selectedDate == today && !pendingReschedule.status.equals("WAITING_FOR_APPROVAL", ignoreCase = true)) {
                                                    queueRepository?.ensureQueueEntryForAppointment(
                                                        appointmentId = pendingReschedule.appointmentId,
                                                        clinicId = pendingReschedule.clinicId,
                                                        doctorId = targetDoctorId
                                                    )
                                                } else {
                                                    queueRepository?.removeOrCancelQueueEntry(pendingReschedule.appointmentId)
                                                }
                                                sessionManager?.clearPendingReschedule()
                                                Toast.makeText(context, "Rescheduled to $selectedDate at ${selectedSlot.startTime} successfully!", Toast.LENGTH_LONG).show()
                                                navController.navigate(NavRoutes.QueueStatus.createRoute(pendingReschedule.trackingCode)) {
                                                    popUpTo(NavRoutes.PatientMain.route) { inclusive = false }
                                                }
                                            } else {
                                                Toast.makeText(context, "Failed to reschedule. Please try again.", Toast.LENGTH_SHORT).show()
                                            }
                                        }
                                    } catch (e: Exception) {
                                        Toast.makeText(context, "Error: ${e.message}", Toast.LENGTH_SHORT).show()
                                    } finally {
                                        isExecutingReschedule = false
                                    }
                                }
                                return@Button
                            }

                            val isUserLoggedIn = sessionManager?.isLoggedIn() == true || (authRepository?.isLoggedIn() == true)
                            if (!isUserLoggedIn) {
                                redirectToLoginSavingPosition(chosenSlotId)
                                return@Button
                            }
                            if (chosenSlotId == null) return@Button
                            isNavigatingToForm = true
                            navController.navigate(NavRoutes.BookingForm.createRoute(chosenSlotId, clinicId))
                        },
                        enabled = canBookSelectedSlot && !isNavigatingToForm && !isExecutingReschedule,
                        shape = RoundedCornerShape(14.dp),
                        colors = ButtonDefaults.buttonColors(
                            containerColor = Color(0xFF00796B),
                            disabledContainerColor = Color(0xFFCBD5E1),
                            disabledContentColor = Color(0xFF64748B)
                        ),
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(52.dp)
                    ) {
                        Text(
                            text = when {
                                isExecutingReschedule -> "Rescheduling..."
                                isRescheduleMode && !canBookSelectedSlot -> "Select a Slot to Reschedule"
                                isRescheduleMode && selectedSlot != null -> "Confirm Reschedule \u2022 ${selectedSlot.startTime}"
                                !canBookSelectedSlot -> "Select a Published Slot to Book"
                                isLabClinic -> "Select Lab Tests & Book"
                                else -> "Book Appointment"
                            },
                            fontWeight = FontWeight.Bold,
                            fontSize = if (isRescheduleMode) 13.5.sp else 14.5.sp,
                            maxLines = 1,
                            overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis
                        )
                        Spacer(Modifier.width(6.dp))
                        Icon(Icons.Default.ArrowForward, contentDescription = null, modifier = Modifier.size(18.dp))
                    }
                }
            }
        }
    ) { padding ->
        LazyColumn(
            state = listState,
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .background(Color(0xFFF8FAFC)),
            contentPadding = PaddingValues(horizontal = 16.dp, vertical = 12.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            // ── RESCHEDULE MODE BANNER ────────────────────────────────────────
            if (isRescheduleMode && pendingReschedule != null) {
                item {
                    Surface(
                        shape = RoundedCornerShape(16.dp),
                        color = Color(0xFFEFF6FF),
                        border = BorderStroke(1.dp, Color(0xFF93C5FD)),
                        shadowElevation = 2.dp,
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
                                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                                ) {
                                    Icon(Icons.Default.Update, contentDescription = null, tint = Color(0xFF1D4ED8), modifier = Modifier.size(20.dp))
                                    Text("Reschedule Mode", fontWeight = FontWeight.ExtraBold, fontSize = 15.sp, color = Color(0xFF1E3A8A))
                                }
                                Surface(
                                    shape = RoundedCornerShape(8.dp),
                                    color = Color(0xFFDBEAFE)
                                ) {
                                    Text(
                                        text = "FEE RETAINED",
                                        fontSize = 10.sp,
                                        fontWeight = FontWeight.ExtraBold,
                                        color = Color(0xFF1D4ED8),
                                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp)
                                    )
                                }
                            }
                            Text(
                                text = "Rescheduling appointment for ${pendingReschedule.patientName} (Code #${pendingReschedule.trackingCode}).\nSelect your preferred date and slot below. Previous queue token will be updated automatically.",
                                fontSize = 12.sp,
                                color = Color(0xFF1E40AF),
                                lineHeight = 17.sp
                            )
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.End
                            ) {
                                TextButton(
                                    onClick = {
                                        sessionManager?.clearPendingReschedule()
                                        activeRescheduleCancelled = true
                                        Toast.makeText(context, "Reschedule cancelled. Booking regular appointment.", Toast.LENGTH_SHORT).show()
                                    },
                                    contentPadding = PaddingValues(horizontal = 6.dp, vertical = 2.dp)
                                ) {
                                    Icon(
                                        Icons.Default.Close,
                                        contentDescription = null,
                                        tint = Color(0xFFDC2626),
                                        modifier = Modifier.size(14.dp)
                                    )
                                    Spacer(Modifier.width(4.dp))
                                    Text(
                                        "Cancel Reschedule \u2022 Book New Instead",
                                        color = Color(0xFFDC2626),
                                        fontSize = 11.5.sp,
                                        fontWeight = FontWeight.Bold
                                    )
                                }
                            }
                        }
                    }
                }
            }
            // ── 0. TRANSACTION FAILED BANNER (Auto-dismisses in 2 seconds) ────
            if (showTransactionFailedBanner && !isRescheduleMode) {
                item {
                    androidx.compose.animation.AnimatedVisibility(visible = showTransactionFailedBanner && !isRescheduleMode) {
                        Surface(
                            color = Color(0xFFDC2626),
                            shape = RoundedCornerShape(12.dp),
                            shadowElevation = 3.dp,
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Row(
                                modifier = Modifier.padding(14.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(10.dp)
                            ) {
                                Icon(Icons.Default.ErrorOutline, contentDescription = null, tint = Color.White, modifier = Modifier.size(24.dp))
                                Column {
                                    Text("Transaction Failed", fontWeight = FontWeight.Bold, color = Color.White, fontSize = 14.sp)
                                    Text("Payment was cancelled or expired. Please select a slot to try again.", color = Color.White.copy(alpha = 0.9f), fontSize = 11.sp)
                                }
                            }
                        }
                    }
                }
            }
            // ── 1. DOCTOR SELECTOR ROW (If multiple doctors) ─────────────────
            if (doctors.size > 1 && !isLabClinic) {
                item {
                    Text(
                        if (isRescheduleMode) "Assigned Doctor (Locked for Reschedule)" else "Select Doctor from Clinic",
                        fontWeight = FontWeight.SemiBold,
                        fontSize = 13.sp,
                        color = Color(0xFF64748B)
                    )
                    Spacer(Modifier.height(6.dp))
                    LazyRow(
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        items(doctors) { doc ->
                            val isCur = selectedDoctor?.id == doc.id
                            val cleanShortName = doc.fullName
                                .removePrefix("Dr.")
                                .removePrefix("dr.")
                                .trim()
                            FilterChip(
                                selected = isCur,
                                onClick = { if (!isRescheduleMode) selectedDoctor = doc },
                                enabled = !isRescheduleMode,
                                label = { Text("Dr. $cleanShortName", fontSize = 12.sp) },
                                leadingIcon = if (isCur) {
                                    { Icon(Icons.Default.Check, contentDescription = null, modifier = Modifier.size(14.dp)) }
                                } else null,
                                shape = RoundedCornerShape(16.dp),
                                colors = FilterChipDefaults.filterChipColors(
                                    selectedContainerColor = Color(0xFF00796B),
                                    selectedLabelColor = Color.White
                                )
                            )
                        }
                    }
                }
            }

            // ── 2. DOCTOR CARD OR LAB INFORMATION CARD ───────
            item {
                if (isLabClinic) {
                    Card(
                        shape = RoundedCornerShape(18.dp),
                        colors = CardDefaults.cardColors(containerColor = Color.White),
                        border = BorderStroke(1.dp, Color(0xFFE2E8F0)),
                        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Column(
                            modifier = Modifier.padding(16.dp),
                            verticalArrangement = Arrangement.spacedBy(12.dp)
                        ) {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Row(
                                    modifier = Modifier.weight(1f),
                                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Surface(
                                        shape = RoundedCornerShape(14.dp),
                                        color = Color(0xFFE0F2F1),
                                        modifier = Modifier.size(56.dp)
                                    ) {
                                        Box(contentAlignment = Alignment.Center) {
                                            Icon(
                                                Icons.Default.LocalHospital,
                                                contentDescription = null,
                                                tint = Color(0xFF00796B),
                                                modifier = Modifier.size(30.dp)
                                            )
                                        }
                                    }
                                    Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                                        Text(
                                            text = clinic?.name ?: "Diagnostic Pathology Lab",
                                            fontWeight = FontWeight.Bold,
                                            fontSize = 16.sp,
                                            color = Color(0xFF0F172A)
                                        )
                                        Text(
                                            text = "Diagnostic Sample Collection",
                                            fontSize = 12.sp,
                                            fontWeight = FontWeight.Medium,
                                            color = Color(0xFF00796B)
                                        )
                                        Text(
                                            text = "Select time slot below \u00B7 Tests chosen on next step",
                                            fontSize = 11.sp,
                                            color = Color(0xFF64748B)
                                        )
                                    }
                                }
                                Surface(
                                    shape = RoundedCornerShape(16.dp),
                                    color = Color(0xFFE0F2F1)
                                ) {
                                    Text(
                                        text = "Lab Mode",
                                        color = Color(0xFF00796B),
                                        fontSize = 11.sp,
                                        fontWeight = FontWeight.Bold,
                                        modifier = Modifier.padding(horizontal = 10.dp, vertical = 5.dp)
                                    )
                                }
                            }
                            Surface(
                                shape = RoundedCornerShape(12.dp),
                                color = if (isClinicClosedOnSelectedDate) Color(0xFFFEF2F2) else Color(0xFFF0FDF4),
                                border = BorderStroke(1.dp, if (isClinicClosedOnSelectedDate) Color(0xFFFCA5A5) else Color(0xFFBBF7D0)),
                                modifier = Modifier.fillMaxWidth()
                            ) {
                                Row(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .padding(horizontal = 12.dp, vertical = 10.dp),
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.SpaceBetween
                                ) {
                                    Row(
                                        verticalAlignment = Alignment.CenterVertically,
                                        horizontalArrangement = Arrangement.spacedBy(6.dp)
                                    ) {
                                        Icon(
                                            if (isClinicClosedOnSelectedDate) Icons.Default.EventBusy else Icons.Default.Schedule,
                                            contentDescription = null,
                                            tint = if (isClinicClosedOnSelectedDate) Color(0xFFDC2626) else Color(0xFF15803D),
                                            modifier = Modifier.size(15.dp)
                                        )
                                        Text(
                                            text = "Collection Hours (${selectedDateSchedule.displayName}):",
                                            fontSize = 11.sp,
                                            fontWeight = FontWeight.SemiBold,
                                            color = if (isClinicClosedOnSelectedDate) Color(0xFF991B1B) else Color(0xFF166534)
                                        )
                                    }
                                    Text(
                                        text = when {
                                            isDeclaredHolidayOnSelectedDate -> "Closed (Holiday)"
                                            !selectedDateSchedule.isOpen -> "Closed (Off)"
                                            else -> {
                                                val cleanOpen = selectedDateSchedule.openTime.filter { it in ' '..'~' }.trim()
                                                val cleanClose = selectedDateSchedule.closeTime.filter { it in ' '..'~' }.trim()
                                                "$cleanOpen - $cleanClose"
                                            }
                                        },
                                        fontSize = 11.5.sp,
                                        fontWeight = FontWeight.ExtraBold,
                                        maxLines = 1,
                                        softWrap = false,
                                        color = if (isClinicClosedOnSelectedDate) Color(0xFFDC2626) else Color(0xFF15803D)
                                    )
                                }
                            }
                        }
                    }
                } else {
                val cleanDocName = (activeDoctor?.fullName ?: "Attending Physician")
                    .removePrefix("Dr.")
                    .removePrefix("dr.")
                    .trim()
                    .ifBlank { "Attending Physician" }

                Card(
                    shape = RoundedCornerShape(18.dp),
                    colors = CardDefaults.cardColors(containerColor = Color.White),
                    border = BorderStroke(1.dp, Color(0xFFE2E8F0)),
                    elevation = CardDefaults.cardElevation(defaultElevation = 2.dp),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Column(
                        modifier = Modifier.padding(16.dp),
                        verticalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.Top
                        ) {
                            Row(
                                modifier = Modifier.weight(1f),
                                horizontalArrangement = Arrangement.spacedBy(12.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                // Doctor Avatar
                                if (!activeDoctor?.resolvedProfilePictureUrl.isNullOrBlank()) {
                                    AsyncImage(
                                        model = activeDoctor!!.resolvedProfilePictureUrl,
                                        contentDescription = cleanDocName,
                                        contentScale = ContentScale.Crop,
                                        modifier = Modifier
                                            .size(62.dp)
                                            .clip(CircleShape)
                                    )
                                } else {
                                    Surface(
                                        shape = CircleShape,
                                        color = Color(0xFFE6F4F1),
                                        modifier = Modifier.size(62.dp)
                                    ) {
                                        Box(contentAlignment = Alignment.Center) {
                                            Icon(
                                                Icons.Default.Person,
                                                contentDescription = null,
                                                tint = Color(0xFF00796B),
                                                modifier = Modifier.size(34.dp)
                                            )
                                        }
                                    }
                                }

                                Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                                    Text(
                                        text = "Dr. $cleanDocName",
                                        fontWeight = FontWeight.Bold,
                                        fontSize = 17.sp,
                                        color = Color(0xFF0F172A)
                                    )
                                    Text(
                                        text = activeDoctor?.specialty ?: "General Physician",
                                        fontSize = 13.sp,
                                        fontWeight = FontWeight.Medium,
                                        color = Color(0xFF00796B)
                                    )
                                    Text(
                                        text = activeDoctor?.education ?: "MBBS",
                                        fontSize = 11.sp,
                                        color = Color(0xFF64748B)
                                    )
                                }
                            }

                            // Selected Badge on top right
                            Surface(
                                shape = RoundedCornerShape(16.dp),
                                color = Color(0xFF00796B)
                            ) {
                                Row(
                                    modifier = Modifier.padding(horizontal = 10.dp, vertical = 5.dp),
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(4.dp)
                                ) {
                                    Icon(Icons.Default.Check, contentDescription = null, tint = Color.White, modifier = Modifier.size(13.dp))
                                    Text("Selected", color = Color.White, fontSize = 11.sp, fontWeight = FontWeight.Bold)
                                }
                            }
                        }

                        // Experience & Hospital affiliation
                        val expText = remember(activeDoctor?.startingPracticingYear) {
                            val startYear = activeDoctor?.startingPracticingYear
                            if (startYear != null && startYear in 1950..2026) {
                                val yrs = (java.time.Year.now().value - startYear).coerceAtLeast(1)
                                "$yrs+ yrs (Since $startYear)"
                            } else {
                                "Verified Specialist"
                            }
                        }
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(16.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                Icon(Icons.Default.WorkOutline, contentDescription = null, tint = Color(0xFF64748B), modifier = Modifier.size(16.dp))
                                Column {
                                    Text(expText, fontWeight = FontWeight.Bold, fontSize = 12.sp, color = Color(0xFF0F172A))
                                    Text("Experience", fontSize = 10.sp, color = Color(0xFF64748B))
                                }
                            }

                            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                Icon(Icons.Default.Apartment, contentDescription = null, tint = Color(0xFF64748B), modifier = Modifier.size(16.dp))
                                Column {
                                    Text(
                                        clinic?.name ?: "Partner Clinic",
                                        fontWeight = FontWeight.Bold,
                                        fontSize = 12.sp,
                                        color = Color(0xFF0F172A),
                                        maxLines = 1,
                                        overflow = TextOverflow.Ellipsis
                                    )
                                    Text(
                                        clinic?.addressText ?: "Nepal",
                                        fontSize = 10.sp,
                                        color = Color(0xFF64748B),
                                        maxLines = 1,
                                        overflow = TextOverflow.Ellipsis
                                    )
                                }
                            }
                        }

                        // Clinic Working Hours for Selected Date (Informational — Break hours only shown in queue/appt status)
                        Surface(
                            shape = RoundedCornerShape(12.dp),
                            color = if (isClinicClosedOnSelectedDate) Color(0xFFFEF2F2) else Color(0xFFF0FDF4),
                            border = BorderStroke(1.dp, if (isClinicClosedOnSelectedDate) Color(0xFFFCA5A5) else Color(0xFFBBF7D0)),
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Column(
                                modifier = Modifier.padding(horizontal = 12.dp, vertical = 10.dp),
                                verticalArrangement = Arrangement.spacedBy(4.dp)
                            ) {
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.SpaceBetween
                                ) {
                                    Row(
                                        verticalAlignment = Alignment.CenterVertically,
                                        horizontalArrangement = Arrangement.spacedBy(6.dp)
                                    ) {
                                        Icon(
                                            if (isClinicClosedOnSelectedDate) Icons.Default.EventBusy else Icons.Default.Schedule,
                                            contentDescription = null,
                                            tint = if (isClinicClosedOnSelectedDate) Color(0xFFDC2626) else Color(0xFF15803D),
                                            modifier = Modifier.size(15.dp)
                                        )
                                        Text(
                                            text = "Working Hours (${selectedDateSchedule.displayName}):",
                                            fontSize = 11.sp,
                                            fontWeight = FontWeight.SemiBold,
                                            color = if (isClinicClosedOnSelectedDate) Color(0xFF991B1B) else Color(0xFF166534)
                                        )
                                    }
                                    Text(
                                        text = when {
                                            isDeclaredHolidayOnSelectedDate -> "Closed (Declared Holiday)"
                                            !selectedDateSchedule.isOpen -> "Closed (Weekly Off)"
                                            else -> {
                                                val cleanOpen = selectedDateSchedule.openTime.filter { it in ' '..'~' }.trim()
                                                val cleanClose = selectedDateSchedule.closeTime.filter { it in ' '..'~' }.trim()
                                                "$cleanOpen - $cleanClose"
                                            }
                                        },
                                        fontSize = 11.5.sp,
                                        fontWeight = FontWeight.ExtraBold,
                                        maxLines = 1,
                                        softWrap = false,
                                        color = if (isClinicClosedOnSelectedDate) Color(0xFFDC2626) else Color(0xFF15803D)
                                    )
                                }
                            }
                        }

                        if (isLabClinic || !isRescheduleMode) {
                            HorizontalDivider(color = Color(0xFFF1F5F9))
                        }

                        // Consultation Fee (or Lab Test Pricing notice for Lab Clinics)
                        if (isLabClinic) {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Text("Diagnostic Test Charges", fontSize = 13.sp, color = Color(0xFF64748B), fontWeight = FontWeight.Medium)
                                Text(
                                    text = "Decided by Selected Reports",
                                    fontWeight = FontWeight.ExtraBold,
                                    fontSize = 14.sp,
                                    color = Color(0xFF00796B)
                                )
                            }
                        } else if (!isRescheduleMode) {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Text("Consultation Fee", fontSize = 13.sp, color = Color(0xFF64748B), fontWeight = FontWeight.Medium)
                                Text(
                                    text = CurrencyFormatter.formatNPR(consultationFee),
                                    fontWeight = FontWeight.ExtraBold,
                                    fontSize = 17.sp,
                                    color = Color(0xFF00796B)
                                )
                            }
                        }
                    }
                }
            }

                }
            // ── 3. SELECT DATE CALENDAR SECTION (Month view with < > and status dots) ──
            item {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    Icon(Icons.Default.CalendarMonth, contentDescription = null, tint = Color(0xFF00796B), modifier = Modifier.size(18.dp))
                    Text("Select Date", fontWeight = FontWeight.Bold, fontSize = 15.sp, color = Color(0xFF0F172A))
                }
                Spacer(Modifier.height(10.dp))

                MonthCalendarCard(
                    viewedYearMonth = viewedYearMonth,
                    selectedDate = selectedDate,
                    todayDate = todayDate,
                    clinic = clinic,
                    selectedDoctor = selectedDoctor,
                    monthSlotsMap = monthSlotsMap,
                    onPreviousMonthClick = {
                        val curYearMonth = YearMonth.from(todayDate)
                        if (viewedYearMonth > curYearMonth) {
                            viewedYearMonth = viewedYearMonth.minusMonths(1)
                        }
                    },
                    onNextMonthClick = {
                        viewedYearMonth = viewedYearMonth.plusMonths(1)
                    },
                    onDateSelected = { clickedDate ->
                        selectedDate = clickedDate.toString()
                    }
                )
            }

            // ── 4. SELECT PUBLISHED TIME SLOT SECTION (Along with slot) ──
            item {
                val formattedSelectedDate = remember(selectedDate) {
                    try {
                        LocalDate.parse(selectedDate).format(DateTimeFormatter.ofPattern("EEE, d MMM", Locale.ENGLISH))
                    } catch (_: Exception) {
                        selectedDate
                    }
                }
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    Icon(Icons.Default.AccessTime, contentDescription = null, tint = Color(0xFF00796B), modifier = Modifier.size(18.dp))
                    Text("Available Slots ($formattedSelectedDate)", fontWeight = FontWeight.Bold, fontSize = 15.sp, color = Color(0xFF0F172A))
                }
                Spacer(Modifier.height(10.dp))

                if (isClinicClosedOnSelectedDate) {
                    Card(
                        shape = RoundedCornerShape(16.dp),
                        colors = CardDefaults.cardColors(containerColor = Color(0xFFFEF2F2)),
                        border = BorderStroke(1.dp, Color(0xFFFCA5A5)),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Column(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(20.dp),
                            horizontalAlignment = Alignment.CenterHorizontally,
                            verticalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            Surface(
                                shape = CircleShape,
                                color = Color(0xFFFEE2E2),
                                modifier = Modifier.size(52.dp)
                            ) {
                                Box(contentAlignment = Alignment.Center) {
                                    Icon(
                                        Icons.Default.EventBusy,
                                        contentDescription = null,
                                        tint = Color(0xFFDC2626),
                                        modifier = Modifier.size(26.dp)
                                    )
                                }
                            }
                            Text(
                                text = if (isDeclaredHolidayOnSelectedDate) "Clinic is Closed on $selectedDate (Holiday)" else "Clinic is Closed on $selectedDate",
                                fontWeight = FontWeight.Bold,
                                fontSize = 15.sp,
                                color = Color(0xFF991B1B),
                                textAlign = TextAlign.Center
                            )
                            Text(
                                text = "The clinic is declared closed on this day. Appointments cannot be booked for this date. Please select another open date above.",
                                fontSize = 12.sp,
                                color = Color(0xFFB91C1C),
                                textAlign = TextAlign.Center,
                                lineHeight = 17.sp
                            )
                        }
                    }
                } else if (slots.isEmpty()) {
                    Card(
                        shape = RoundedCornerShape(16.dp),
                        colors = CardDefaults.cardColors(containerColor = Color.White),
                        border = BorderStroke(1.dp, Color(0xFFE2E8F0)),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Column(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(20.dp),
                            horizontalAlignment = Alignment.CenterHorizontally,
                            verticalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            Surface(
                                shape = CircleShape,
                                color = Color(0xFFE6F4F1),
                                modifier = Modifier.size(48.dp)
                            ) {
                                Box(contentAlignment = Alignment.Center) {
                                    Icon(
                                        Icons.Default.EventBusy,
                                        contentDescription = null,
                                        tint = Color(0xFF00796B),
                                        modifier = Modifier.size(24.dp)
                                    )
                                }
                            }
                            Text(
                                text = "No Published Slots for $selectedDate",
                                fontWeight = FontWeight.Bold,
                                fontSize = 14.sp,
                                color = Color(0xFF0F172A)
                            )
                            Text(
                                text = "Appointments can only be booked into time slots published by the clinic. Please select another date above or check back once the clinic publishes slots.",
                                fontSize = 12.sp,
                                color = Color(0xFF64748B),
                                textAlign = TextAlign.Center,
                                lineHeight = 17.sp
                            )
                        }
                    }
                } else {
                    // Grid layout of strictly clinic-published slots (2 columns for clear time + capacity display)
                    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        slots.chunked(2).forEach { rowSlots ->
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.spacedBy(10.dp)
                            ) {
                                rowSlots.forEach { slot ->
                                    val isChosen = selectedSlotId == slot.id
                                    val spotsLeft = (slot.maxCapacity - slot.bookedCount).coerceAtLeast(0)
                                    val isFull = spotsLeft <= 0
                                    val timeLabel = if (slot.endTime.isNotBlank() && slot.endTime != slot.startTime) {
                                        "${slot.startTime} - ${slot.endTime}"
                                    } else {
                                        slot.startTime
                                    }

                                    Surface(
                                        shape = RoundedCornerShape(14.dp),
                                        color = when {
                                            isFull -> Color(0xFFF1F5F9)
                                            isChosen -> Color(0xFF00796B)
                                            else -> Color.White
                                        },
                                        border = BorderStroke(
                                            1.dp,
                                            when {
                                                isFull -> Color(0xFFCBD5E1)
                                                isChosen -> Color(0xFF00796B)
                                                else -> Color(0xFFE2E8F0)
                                            }
                                        ),
                                        modifier = Modifier
                                            .weight(1f)
                                            .defaultMinSize(minHeight = 60.dp)
                                            .clickable(enabled = !isFull) {
                                                if (!isUserLoggedIn && !isRescheduleMode) {
                                                    redirectToLoginSavingPosition(slot.id)
                                                } else {
                                                    selectedSlotId = slot.id
                                                }
                                            }
                                    ) {
                                        Column(
                                            horizontalAlignment = Alignment.CenterHorizontally,
                                            verticalArrangement = Arrangement.Center,
                                            modifier = Modifier.padding(horizontal = 10.dp, vertical = 10.dp)
                                        ) {
                                            Text(
                                                text = timeLabel,
                                                fontWeight = FontWeight.Bold,
                                                fontSize = 13.sp,
                                                color = when {
                                                    isFull -> Color(0xFF94A3B8)
                                                    isChosen -> Color.White
                                                    else -> Color(0xFF0F172A)
                                                },
                                                maxLines = 1,
                                                overflow = TextOverflow.Ellipsis
                                            )
                                            Spacer(Modifier.height(2.dp))
                                            Text(
                                                text = if (isFull) "Slot Full" else "$spotsLeft spots available",
                                                fontSize = 10.sp,
                                                fontWeight = FontWeight.Medium,
                                                color = when {
                                                    isFull -> Color(0xFFEF4444)
                                                    isChosen -> Color(0xFFCCFBF1)
                                                    else -> Color(0xFF00796B)
                                                }
                                            )
                                        }
                                    }
                                }
                                repeat(2 - rowSlots.size) {
                                    Spacer(modifier = Modifier.weight(1f))
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun MonthCalendarCard(
    viewedYearMonth: YearMonth,
    selectedDate: String,
    todayDate: LocalDate,
    clinic: Clinic?,
    selectedDoctor: Doctor?,
    monthSlotsMap: Map<String, List<Slot>>,
    onPreviousMonthClick: () -> Unit,
    onNextMonthClick: () -> Unit,
    onDateSelected: (LocalDate) -> Unit
) {
    val currentYearMonth = remember(todayDate) { YearMonth.from(todayDate) }
    val isPreviousMonthAllowed = viewedYearMonth > currentYearMonth

    Card(
        shape = RoundedCornerShape(18.dp),
        colors = CardDefaults.cardColors(containerColor = Color.White),
        border = BorderStroke(1.dp, Color(0xFFE2E8F0)),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp),
        modifier = Modifier.fillMaxWidth()
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            // Header: < Month Year >
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                IconButton(
                    onClick = onPreviousMonthClick,
                    enabled = isPreviousMonthAllowed,
                    modifier = Modifier.size(36.dp)
                ) {
                    Icon(
                        imageVector = Icons.Default.ChevronLeft,
                        contentDescription = "Previous Month",
                        tint = if (isPreviousMonthAllowed) Color(0xFF00796B) else Color(0xFFCBD5E1)
                    )
                }

                val monthTitle = remember(viewedYearMonth) {
                    val m = viewedYearMonth.month.getDisplayName(TextStyle.FULL, Locale.ENGLISH)
                    "$m ${viewedYearMonth.year}"
                }
                Text(
                    text = monthTitle,
                    fontWeight = FontWeight.Bold,
                    fontSize = 16.sp,
                    color = Color(0xFF0F172A)
                )

                IconButton(
                    onClick = onNextMonthClick,
                    modifier = Modifier.size(36.dp)
                ) {
                    Icon(
                        imageVector = Icons.Default.ChevronRight,
                        contentDescription = "Next Month",
                        tint = Color(0xFF00796B)
                    )
                }
            }

            // Days of week header row
            val daysOfWeek = listOf("Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat")
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceEvenly
            ) {
                daysOfWeek.forEach { dayName ->
                    Text(
                        text = dayName,
                        fontSize = 11.5.sp,
                        fontWeight = FontWeight.SemiBold,
                        color = Color(0xFF64748B),
                        textAlign = TextAlign.Center,
                        modifier = Modifier.weight(1f)
                    )
                }
            }

            HorizontalDivider(color = Color(0xFFF1F5F9))

            // Calendar Grid
            val firstDayOfMonth = remember(viewedYearMonth) { viewedYearMonth.atDay(1) }
            val firstDayOfWeek = remember(firstDayOfMonth) { firstDayOfMonth.dayOfWeek.value % 7 } // 0=Sun..6=Sat
            val daysInMonth = remember(viewedYearMonth) { viewedYearMonth.lengthOfMonth() }
            val totalCells = firstDayOfWeek + daysInMonth
            val rowCount = (totalCells + 6) / 7

            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                for (rowIndex in 0 until rowCount) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceEvenly
                    ) {
                        for (colIndex in 0 until 7) {
                            val cellIndex = rowIndex * 7 + colIndex
                            if (cellIndex < firstDayOfWeek || cellIndex >= totalCells) {
                                Spacer(modifier = Modifier.weight(1f))
                            } else {
                                val dayNum = cellIndex - firstDayOfWeek + 1
                                val date = viewedYearMonth.atDay(dayNum)
                                val dateStr = date.toString()
                                val isSelected = (selectedDate == dateStr)
                                val dateState = computeCalendarDateState(date, clinic, selectedDoctor, monthSlotsMap, todayDate)
                                val isSelectable = (dateState == CalendarDateState.AVAILABLE)

                                Box(
                                    modifier = Modifier
                                        .weight(1f)
                                        .aspectRatio(1f)
                                        .clip(RoundedCornerShape(12.dp))
                                        .background(
                                            if (isSelected) Color(0xFF00796B) else Color.Transparent
                                        )
                                        .clickable(enabled = isSelectable) {
                                            onDateSelected(date)
                                        },
                                    contentAlignment = Alignment.Center
                                ) {
                                    Column(
                                        horizontalAlignment = Alignment.CenterHorizontally,
                                        verticalArrangement = Arrangement.Center
                                    ) {
                                        Text(
                                            text = "$dayNum",
                                            fontSize = 13.sp,
                                            fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Medium,
                                            color = when {
                                                isSelected -> Color.White
                                                dateState == CalendarDateState.PAST -> Color(0xFFCBD5E1)
                                                dateState == CalendarDateState.CLOSED -> Color(0xFF94A3B8)
                                                dateState == CalendarDateState.FULLY_BOOKED -> Color(0xFF64748B)
                                                else -> Color(0xFF0F172A)
                                            }
                                        )
                                        Spacer(Modifier.height(2.dp))
                                        // Status dot
                                        val dotColor = when (dateState) {
                                            CalendarDateState.AVAILABLE -> if (isSelected) Color(0xFFCCFBF1) else Color(0xFF10B981)
                                            CalendarDateState.FULLY_BOOKED -> Color(0xFFF59E0B)
                                            CalendarDateState.CLOSED -> Color(0xFF94A3B8)
                                            CalendarDateState.PAST -> Color.Transparent
                                        }
                                        if (dotColor != Color.Transparent) {
                                            Box(
                                                modifier = Modifier
                                                    .size(5.dp)
                                                    .clip(CircleShape)
                                                    .background(dotColor)
                                            )
                                        } else {
                                            Spacer(Modifier.size(5.dp))
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }

            // Short Legend beneath the calendar
            HorizontalDivider(color = Color(0xFFF1F5F9))
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(vertical = 4.dp),
                horizontalArrangement = Arrangement.SpaceEvenly,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(5.dp)) {
                    Box(modifier = Modifier.size(7.dp).clip(CircleShape).background(Color(0xFF10B981)))
                    Text("Available", fontSize = 11.sp, color = Color(0xFF475569), fontWeight = FontWeight.Medium)
                }
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(5.dp)) {
                    Box(modifier = Modifier.size(7.dp).clip(CircleShape).background(Color(0xFFF59E0B)))
                    Text("Fully booked", fontSize = 11.sp, color = Color(0xFF475569), fontWeight = FontWeight.Medium)
                }
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(5.dp)) {
                    Box(modifier = Modifier.size(7.dp).clip(CircleShape).background(Color(0xFF94A3B8)))
                    Text("Closed", fontSize = 11.sp, color = Color(0xFF475569), fontWeight = FontWeight.Medium)
                }
            }
        }
    }
}
