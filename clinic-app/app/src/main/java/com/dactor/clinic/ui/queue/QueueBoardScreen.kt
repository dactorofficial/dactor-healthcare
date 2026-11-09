package com.dactor.clinic.ui.queue

import android.content.Intent
import android.net.Uri
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import java.time.LocalDate
import java.time.YearMonth
import java.time.format.TextStyle
import java.util.Locale
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.navigation.NavController
import com.dactor.clinic.R
import com.dactor.clinic.data.model.Appointment
import com.dactor.clinic.data.model.Clinic
import com.dactor.clinic.data.model.Doctor
import com.dactor.clinic.data.model.QueueEntry
import com.dactor.clinic.data.repository.AppointmentRepository
import com.dactor.clinic.data.repository.BillingRepository
import com.dactor.clinic.data.repository.ClinicRepository
import com.dactor.clinic.data.repository.LabReportRepository
import com.dactor.clinic.data.repository.DoctorRepository
import com.dactor.clinic.data.repository.QueueRepository
import com.dactor.clinic.ui.navigation.NavRoutes
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

data class QueueItemUi(
    val id: String,
    val appointmentId: String,
    val patientName: String,
    val patientAge: Int,
    val patientGender: String,
    val patientMobile: String,
    val trackingCode: String,
    var queuePosition: Int,
    var status: String, // "waiting", "inside", "done", "no_show", "processing"
    val appointmentDate: String = "",
    val appointmentTime: String = "",
    val insideAt: String? = null,
    val calledAt: String? = null,
    val completedAt: String? = null,
    val consultationDurationSeconds: Long? = null,
    val selectedLabTests: String? = null,
    val optInEarlyCall: Boolean = false,
    val doctorId: String? = null,
    val doctorName: String? = null,
    val paymentMode: String? = null,
    val paymentStatus: String? = null,
    val totalAmount: Double = 0.0
)

@OptIn(ExperimentalFoundationApi::class, ExperimentalMaterial3Api::class)
@Composable
fun QueueBoardScreen(
    navController: NavController,
    clinicId: String = "",
    initialDoctorId: String? = null,
    initialDate: String? = null,
    queueRepository: QueueRepository? = null,
    doctorRepository: DoctorRepository? = null,
    appointmentRepository: AppointmentRepository? = null,
    billingRepository: BillingRepository? = null,
    clinicRepository: ClinicRepository? = null,
    labReportRepository: LabReportRepository? = null
) {
    val context = androidx.compose.ui.platform.LocalContext.current
    val sessionManager = remember { com.dactor.clinic.data.local.UserSessionManager(context) }
    var effectiveClinicId by remember(clinicId) {
        mutableStateOf(
            if (clinicId.isNotBlank() && clinicId != "c1") clinicId
            else sessionManager.getSavedClinicId() ?: ""
        )
    }

    val savedDocId = remember { sessionManager.getSavedDoctorId() }
    val initialCachedDocs = remember(effectiveClinicId) {
        if (effectiveClinicId.isNotBlank()) {
            doctorRepository?.getCachedDoctorsByClinic(effectiveClinicId)?.takeIf { it.isNotEmpty() }
        } else null
    } ?: doctorRepository?.getLastCachedDoctors() ?: emptyList()

    var clinicDoctors by remember(effectiveClinicId) { mutableStateOf(initialCachedDocs) }
    var isDoctorsLoading by remember { mutableStateOf(initialCachedDocs.isEmpty()) }
    var isQueueLoading by remember { mutableStateOf(true) }
    var selectedDoctorFilterId by remember(savedDocId, initialDoctorId) {
        mutableStateOf<String?>(initialDoctorId?.takeIf { it.isNotBlank() } ?: savedDocId?.takeIf { it.isNotBlank() })
    }

    var isLabClinic by remember { mutableStateOf(false) }
    var currentClinic by remember(effectiveClinicId) { mutableStateOf<com.dactor.clinic.data.model.Clinic?>(null) }
    var isClinicOnBreak by remember(effectiveClinicId) { mutableStateOf(false) }
    var lastBreakToggleMs by remember { mutableLongStateOf(0L) }
    var rawQueueEntries by remember(effectiveClinicId) { mutableStateOf<List<QueueEntry>>(emptyList()) }

    LaunchedEffect(effectiveClinicId) {
        if (clinicRepository != null) {
            try {
                if (effectiveClinicId.isBlank()) {
                    val savedEmail = sessionManager.getSavedEmail()
                    val fallback = if (!savedEmail.isNullOrBlank()) {
                        clinicRepository.getClinicByEmail(savedEmail)
                    } else {
                        clinicRepository.getClinics().firstOrNull()
                    }
                    if (fallback != null) {
                        effectiveClinicId = fallback.id
                        sessionManager.saveClinicSession(fallback.id, fallback.contactEmail ?: savedEmail ?: "", fallback.name)
                    }
                }
                if (effectiveClinicId.isNotBlank()) {
                    val c = clinicRepository.getClinicById(effectiveClinicId)
                    currentClinic = c
                    if (System.currentTimeMillis() - lastBreakToggleMs > 12_000L) {
                        isClinicOnBreak = c?.isOnBreak == true
                    }
                    val t = c?.type?.lowercase() ?: ""
                    val n = c?.name?.lowercase() ?: ""
                    isLabClinic = t == "diagnostic_lab" || t.contains("lab") || n.contains("lab") || (c?.specialties?.any { it.lowercase().contains("lab") || it.lowercase().contains("patholog") } == true)
                }
            } catch (e: Exception) {
                e.printStackTrace()
            }
        }
    }

    var queueItems by remember(effectiveClinicId) { mutableStateOf<List<QueueItemUi>>(emptyList()) }
    var selectedQueueTab by remember { mutableStateOf(0) } // 0: Live, 1: Completed
    val today = remember { LocalDate.now() }
    val parsedInitDate = remember(initialDate) {
        initialDate?.takeIf { it.isNotBlank() }?.let {
            try { LocalDate.parse(it) } catch (_: Exception) { null }
        }
    }
    var selectedQueueDate by remember(initialDate) { mutableStateOf(parsedInitDate?.toString() ?: today.toString()) }
    var viewedYearMonth by remember(parsedInitDate) { mutableStateOf(parsedInitDate?.let { YearMonth.from(it) } ?: YearMonth.from(today)) }
    val initialDateIndex = remember(parsedInitDate) { ((parsedInitDate ?: today).dayOfMonth - 1 - 2).coerceAtLeast(0) }
    val dateListState = rememberLazyListState(initialFirstVisibleItemIndex = initialDateIndex)
    val queueListState = rememberLazyListState()

    LaunchedEffect(selectedQueueTab) {
        queueListState.scrollToItem(0)
    }

    // Scroll to the targeted date on screen launch
    LaunchedEffect(initialDate) {
        val curToday = LocalDate.now()
        val targetDate = parsedInitDate ?: curToday
        selectedQueueDate = targetDate.toString()
        viewedYearMonth = YearMonth.from(targetDate)
        kotlinx.coroutines.delay(150)
        val targetIdx = (targetDate.dayOfMonth - 1 - 2).coerceAtLeast(0)
        dateListState.animateScrollToItem(targetIdx)
    }

    LaunchedEffect(viewedYearMonth) {
        val curToday = LocalDate.now()
        kotlinx.coroutines.delay(120)
        val targetIdx = if (viewedYearMonth == YearMonth.from(curToday)) {
            (curToday.dayOfMonth - 1 - 2).coerceAtLeast(0)
        } else {
            0
        }
        dateListState.animateScrollToItem(targetIdx)
    }
    var expandedItemId by remember { mutableStateOf<String?>(null) }
    var notificationSentMessage by remember { mutableStateOf<String?>(null) }
    var currentEpochSecond by remember { mutableLongStateOf(System.currentTimeMillis() / 1000) }

    // Reorder state
    var reorderItemDialog by remember { mutableStateOf<QueueItemUi?>(null) }
    var newPositionInput by remember { mutableStateOf("") }
    var longPressedItemId by remember { mutableStateOf<String?>(null) }

    // Remarks State
    var remarksMap by remember(effectiveClinicId) { mutableStateOf<Map<String, String>>(emptyMap()) }
    var remarkTargetItem by remember { mutableStateOf<QueueItemUi?>(null) }
    var remarkInputText by remember { mutableStateOf("") }
    var isSavingRemark by remember { mutableStateOf(false) }

    // Queue Average Time Calculation State
    var avgCalculationDetails by remember(effectiveClinicId) { mutableStateOf<QueueRepository.ClinicAverageCalculationResult?>(null) }
    var showAutoNoShowDialog by remember { mutableStateOf(false) }
    var isAutoNoShowProcessing by remember { mutableStateOf(false) }

    fun getInitials(name: String): String {
        val trimmed = name.trim()
        if (trimmed.isBlank()) return "PT"
        val parts = trimmed.split("\\s+".toRegex()).filter { it.isNotBlank() }
        return when {
            parts.size >= 2 -> "${parts[0].first().uppercaseChar()}${parts[1].first().uppercaseChar()}"
            parts.isNotEmpty() && parts[0].length >= 2 -> parts[0].take(2).uppercase()
            parts.isNotEmpty() -> parts[0].take(1).uppercase()
            else -> "PT"
        }
    }

    fun cleanPhoneNumber(phone: String): String {
        var p = phone.trim()
        if (p.startsWith("+91")) p = p.removePrefix("+91").trim()
        if (p.startsWith("+977")) p = p.removePrefix("+977").trim()
        if (p.startsWith("91") && p.length > 10) p = p.removePrefix("91").trim()
        if (p.startsWith("977") && p.length > 10) p = p.removePrefix("977").trim()
        val digits = p.filter { it.isDigit() }
        return if (digits.length == 10) {
            "${digits.substring(0, 5)} ${digits.substring(5)}"
        } else {
            p.ifBlank { "N/A" }
        }
    }

    fun formatConsultationDuration(insideAt: String?, completedAt: String?, storedDuration: Long?): String {
        val totalSec = if (storedDuration != null && storedDuration > 0) {
            storedDuration
        } else if (!insideAt.isNullOrBlank() && !completedAt.isNullOrBlank()) {
            try {
                val start = java.time.Instant.parse(insideAt).epochSecond
                val end = java.time.Instant.parse(completedAt).epochSecond
                (end - start).coerceAtLeast(0)
            } catch (e: Exception) { 0L }
        } else 0L

        if (totalSec <= 0) return ""
        val min = totalSec / 60
        val sec = totalSec % 60
        return if (min > 0) {
            if (sec > 0) "${min}m ${sec}s" else "${min}m"
        } else {
            "${sec}s"
        }
    }

    val coroutineScope = rememberCoroutineScope()
    val completedStatuses = remember { setOf("done", "processing", "sample_collected", "report_prepared") }
    val pastStatuses = remember { setOf("done", "processing", "sample_collected", "report_prepared", "no_show") }

    fun optimisticallyUpdateStatus(itemId: String, newStatus: String) {
        val nowIso = java.time.Instant.now().toString()
        val updated = queueItems.map { current ->
            if (current.id == itemId) {
                when (newStatus) {
                    "inside" -> current.copy(status = "inside", insideAt = nowIso)
                    else -> {
                        val calcDur = if (!current.insideAt.isNullOrBlank()) {
                            try {
                                val s = java.time.Instant.parse(current.insideAt).epochSecond
                                val e = java.time.Instant.parse(nowIso).epochSecond
                                (e - s).coerceAtLeast(0)
                            } catch (e: Exception) { current.consultationDurationSeconds }
                        } else current.consultationDurationSeconds
                        current.copy(
                            status = newStatus,
                            completedAt = nowIso,
                            consultationDurationSeconds = calcDur
                        )
                    }
                }
            } else current
        }
        val active = updated
            .filter { it.status == "waiting" || it.status == "inside" }
            .sortedWith(compareBy<QueueItemUi> { if (it.status == "inside") 0 else 1 }.thenBy { it.queuePosition })
            .mapIndexed { idx, itm -> itm.copy(queuePosition = idx + 1) }
        val past = updated.filter { it.status in pastStatuses }
        queueItems = active + past
        if (expandedItemId == itemId && newStatus in pastStatuses) {
            expandedItemId = null
        }
    }

    fun moveItemToPosition(item: QueueItemUi, targetPosition1Based: Int) {
        val activeItems = queueItems.filter { it.status == "waiting" || it.status == "inside" }.toMutableList()
        val oldIndex = activeItems.indexOfFirst { it.id == item.id }
        if (oldIndex < 0) return
        val clampedTarget = targetPosition1Based.coerceIn(1, activeItems.size)
        val targetIndex = clampedTarget - 1
        if (oldIndex == targetIndex) return

        val moved = activeItems.removeAt(oldIndex)
        activeItems.add(targetIndex, moved)

        val updatedQueue = activeItems.mapIndexed { idx, itm ->
            itm.copy(queuePosition = idx + 1)
        }
        val pastItems = queueItems.filter { it.status in pastStatuses }
        queueItems = updatedQueue + pastItems

        coroutineScope.launch {
            val entriesToUpdate = updatedQueue.map {
                QueueEntry(
                    id = it.id,
                    appointmentId = it.appointmentId,
                    clinicId = effectiveClinicId,
                    queuePosition = it.queuePosition,
                    status = it.status,
                    insideAt = it.insideAt,
                    calledAt = it.calledAt
                )
            }
            queueRepository?.reorderQueue(entriesToUpdate)
        }
    }

    fun moveItemOneStep(item: QueueItemUi, direction: Int) { // direction: -1 (up), +1 (down)
        val activeItems = queueItems.filter { it.status == "waiting" || it.status == "inside" }
        val currentIndex = activeItems.indexOfFirst { it.id == item.id }
        if (currentIndex < 0) return
        val targetIndex = currentIndex + direction
        if (targetIndex in activeItems.indices) {
            moveItemToPosition(item, targetIndex + 1)
        }
    }

    // Live ticking timer for consultation duration
    LaunchedEffect(Unit) {
        while (isActive) {
            delay(1000L)
            currentEpochSecond = System.currentTimeMillis() / 1000
        }
    }

    suspend fun loadQueue() {
        if (queueRepository != null && effectiveClinicId.isNotBlank()) {
            // Offload background audits so they never delay UI rendering
            coroutineScope.launch {
                try {
                    queueRepository.autoTransferUncompletedQueueToNoShow(effectiveClinicId, includeTodayExpired = false)
                } catch (_: Exception) {}
                try {
                    avgCalculationDetails = queueRepository.getClinicAverageTimeDetails(effectiveClinicId)
                } catch (_: Exception) {}
            }

            // Concurrent execution for UI-critical data (Queue + Appts + Doctors + Clinic in parallel)
            coroutineScope {
                val clinicDeferred = async<Clinic?> {
                    try {
                        clinicRepository?.getClinicById(effectiveClinicId)
                    } catch (_: Exception) { null }
                }
                val docsDeferred = async<List<Doctor>> {
                    try {
                        doctorRepository?.getDoctorsByClinic(effectiveClinicId) ?: emptyList()
                    } catch (_: Exception) { emptyList() }
                }
                val entriesDeferred = async<List<QueueEntry>> {
                    try {
                        queueRepository.getQueueForClinic(effectiveClinicId)
                    } catch (_: Exception) { emptyList() }
                }
                val apptsDeferred = async<List<Appointment>> {
                    try {
                        appointmentRepository?.getAppointmentsByClinic(effectiveClinicId) ?: emptyList()
                    } catch (_: Exception) { emptyList() }
                }

                val c = clinicDeferred.await()
                if (c != null) {
                    currentClinic = c
                    if (System.currentTimeMillis() - lastBreakToggleMs > 12_000L) {
                        isClinicOnBreak = c.isOnBreak == true
                    }
                }

                val docs = docsDeferred.await()
                if (docs.isNotEmpty() || clinicDoctors.isEmpty()) {
                    clinicDoctors = docs
                    if (selectedDoctorFilterId == null && docs.size == 1 && initialDoctorId.isNullOrBlank()) {
                        selectedDoctorFilterId = docs.first().id
                    }
                }
                isDoctorsLoading = false
                val docMap = clinicDoctors.associateBy { it.id }

                val entries = entriesDeferred.await()
                rawQueueEntries = entries
                val appts = apptsDeferred.await()
                val apptMap = appts.associateBy { it.id }

                // Strict FIFO system: inside consultation room is position 1, waiting patients sorted chronologically (unapproved excluded)
                queueItems = entries
                    .filter { entry ->
                        val appt = apptMap[entry.appointmentId]
                        appt != null &&
                            appt.status.equals("APPROVED", ignoreCase = true) &&
                            appt.checkinStatus != "cancelled"
                    }
                    .sortedWith(
                        compareBy<QueueEntry> { if (it.status == "inside") 0 else 1 }
                            .thenBy { it.queuePosition }
                    )
                    .map { entry ->
                        val appt = apptMap[entry.appointmentId]
                        val durationSec = entry.consultationDurationSeconds ?: run {
                            if (!entry.insideAt.isNullOrBlank() && !entry.completedAt.isNullOrBlank()) {
                                try {
                                    val start = java.time.Instant.parse(entry.insideAt).epochSecond
                                    val end = java.time.Instant.parse(entry.completedAt).epochSecond
                                    (end - start).coerceAtLeast(0)
                                } catch (e: Exception) { null }
                            } else null
                        }
                        QueueItemUi(
                            id = entry.id,
                            appointmentId = entry.appointmentId,
                            patientName = appt?.patientName ?: "Patient #${entry.queuePosition}",
                            patientAge = appt?.patientAge ?: 0,
                            patientGender = appt?.patientGender ?: "Registered",
                            patientMobile = appt?.patientMobile ?: "",
                            trackingCode = appt?.trackingCode10Digit ?: entry.appointmentId.take(8),
                            queuePosition = entry.queuePosition,
                            status = entry.status,
                            appointmentDate = appt?.appointmentDate ?: "",
                            appointmentTime = appt?.appointmentTime ?: "",
                            insideAt = entry.insideAt,
                            calledAt = entry.calledAt,
                            completedAt = entry.completedAt,
                            consultationDurationSeconds = durationSec,
                            selectedLabTests = appt?.selectedLabTests,
                            optInEarlyCall = appt?.optInEarlyCall ?: false,
                            doctorId = entry.doctorId ?: appt?.doctorId,
                            doctorName = docMap[entry.doctorId ?: appt?.doctorId]?.fullName,
                            paymentMode = appt?.paymentMode,
                            paymentStatus = appt?.paymentStatus,
                            totalAmount = appt?.totalAmount ?: appt?.feeAmount ?: 0.0
                        )
                    }

                isQueueLoading = false

                val pastApptIds = entries.filter { it.status in pastStatuses }.map { it.appointmentId }
                if (billingRepository != null && pastApptIds.isNotEmpty()) {
                    try {
                        val map = billingRepository.getRemarksForAppointments(pastApptIds)
                        if (map.isNotEmpty()) {
                            remarksMap = map
                        }
                    } catch (ignored: Exception) {}
                }
            }
        }
    }

    LaunchedEffect(effectiveClinicId) {
        while (isActive) {
            loadQueue()
            delay(4000L)
        }
    }

    val liveQueue = queueItems.filter {
        (it.status == "waiting" || it.status == "inside") &&
        (it.appointmentDate.isBlank() || it.appointmentDate == selectedQueueDate) &&
        (selectedDoctorFilterId == null || it.doctorId == selectedDoctorFilterId)
    }.sortedWith(
        compareBy<QueueItemUi> { if (it.status == "inside") 0 else 1 }
            .thenBy { it.queuePosition }
    )
    val pastQueue = queueItems.filter {
        it.status in pastStatuses &&
        (it.appointmentDate.isBlank() || it.appointmentDate == selectedQueueDate) &&
        (selectedDoctorFilterId == null || it.doctorId == selectedDoctorFilterId)
    }
    val insideCount = liveQueue.count { it.status == "inside" }
    val waitingCount = liveQueue.count { it.status == "waiting" }
    val todayExpiredWaitingCount = remember(liveQueue, currentEpochSecond) {
        val nowMin = java.time.LocalTime.now().let { it.hour * 60 + it.minute }
        liveQueue.count { it.status == "waiting" && com.dactor.clinic.data.repository.AppointmentRepository.parseAppointmentEndTimeToMinutes(it.appointmentTime) < nowMin }
    }
    val doneCount = pastQueue.count { it.status in completedStatuses }

    Scaffold(
        containerColor = Color(0xFFF8FAFC),
        topBar = {
            TopAppBar(
                title = {
                    if (selectedQueueTab == 1) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(10.dp)
                        ) {
                            Surface(
                                shape = RoundedCornerShape(8.dp),
                                color = Color.White,
                                border = BorderStroke(1.dp, Color(0xFFE2E8F0)),
                                modifier = Modifier.size(34.dp)
                            ) {
                                Image(
                                    painter = painterResource(id = R.drawable.app_logo),
                                    contentDescription = "Dactor Official Logo",
                                    modifier = Modifier
                                        .fillMaxSize()
                                        .padding(2.dp),
                                    contentScale = ContentScale.Fit
                                )
                            }
                            Text(
                                "Completed",
                                fontWeight = FontWeight.Bold,
                                fontSize = 20.sp,
                                color = Color(0xFF0F172A)
                            )
                        }
                    } else {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(10.dp)
                        ) {
                            Surface(
                                shape = RoundedCornerShape(8.dp),
                                color = Color.White,
                                border = BorderStroke(1.dp, Color(0xFFE2E8F0)),
                                modifier = Modifier.size(34.dp)
                            ) {
                                Image(
                                    painter = painterResource(id = R.drawable.app_logo),
                                    contentDescription = "Dactor Official Logo",
                                    modifier = Modifier
                                        .fillMaxSize()
                                        .padding(2.dp),
                                    contentScale = ContentScale.Fit
                                )
                            }
                            Text(
                                "Live Patient Queue Board",
                                fontWeight = FontWeight.Bold,
                                fontSize = 18.sp,
                                color = Color(0xFF0F172A)
                            )
                        }
                    }
                },
                navigationIcon = {
                    IconButton(onClick = { navController.popBackStack() }) {
                        Icon(
                            Icons.Default.ArrowBack,
                            contentDescription = "Back",
                            tint = Color(0xFF0F172A)
                        )
                    }
                },
                actions = {
                    IconButton(
                        onClick = { showAutoNoShowDialog = true },
                        enabled = !isAutoNoShowProcessing
                    ) {
                        Icon(
                            Icons.Default.EventBusy,
                            contentDescription = "Auto No-Show Uncompleted",
                            tint = Color(0xFFDC2626)
                        )
                    }
                    IconButton(onClick = {
                        coroutineScope.launch { loadQueue() }
                    }) {
                        Icon(
                            Icons.Default.Refresh,
                            contentDescription = "Refresh",
                            tint = Color(0xFF0F172A)
                        )
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = Color.White
                )
            )
        }
    ) { padding ->
        LazyColumn(
            state = queueListState,
            modifier = Modifier
                .fillMaxSize()
                .padding(padding),
            contentPadding = PaddingValues(bottom = 32.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp)
        ) {
            // 3 Stat Cards (Shown on Live Queue tab)
            if (selectedQueueTab == 0) {
                item(key = "stat_cards") {
                    Box(modifier = Modifier.padding(horizontal = 16.dp)) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            // 1. In Consultation Card (Soft Light Blue)
                            Surface(
                                color = Color(0xFFE8F1FD),
                                shape = RoundedCornerShape(12.dp),
                                modifier = Modifier.weight(1f)
                            ) {
                                Column(
                                    modifier = Modifier.padding(horizontal = 8.dp, vertical = 7.dp),
                                    verticalArrangement = Arrangement.spacedBy(2.dp)
                                ) {
                                    Surface(
                                        shape = CircleShape,
                                        color = Color(0xFFD3E4FB),
                                        modifier = Modifier.size(22.dp)
                                    ) {
                                        Box(contentAlignment = Alignment.Center) {
                                            Icon(
                                                Icons.Default.Person,
                                                contentDescription = null,
                                                tint = Color(0xFF1E64D4),
                                                modifier = Modifier.size(13.dp)
                                            )
                                        }
                                    }
                                    Text(
                                        text = "$insideCount",
                                        fontWeight = FontWeight.Bold,
                                        fontSize = 17.sp,
                                        color = Color(0xFF1351B4)
                                    )
                                    Text(
                                        text = "In Consultation",
                                        fontSize = 10.sp,
                                        lineHeight = 12.sp,
                                        color = Color(0xFF3362A8),
                                        fontWeight = FontWeight.Medium,
                                        maxLines = 2,
                                        overflow = TextOverflow.Ellipsis
                                    )
                                }
                            }

                            // 2. Waiting in Lobby Card (Soft Light Peach/Orange)
                            Surface(
                                color = Color(0xFFFDF2E4),
                                shape = RoundedCornerShape(12.dp),
                                modifier = Modifier.weight(1f)
                            ) {
                                Column(
                                    modifier = Modifier.padding(horizontal = 8.dp, vertical = 7.dp),
                                    verticalArrangement = Arrangement.spacedBy(2.dp)
                                ) {
                                    Surface(
                                        shape = CircleShape,
                                        color = Color(0xFFFAE0C3),
                                        modifier = Modifier.size(22.dp)
                                    ) {
                                        Box(contentAlignment = Alignment.Center) {
                                            Icon(
                                                Icons.Default.AccessTime,
                                                contentDescription = null,
                                                tint = Color(0xFFB45B10),
                                                modifier = Modifier.size(13.dp)
                                            )
                                        }
                                    }
                                    Text(
                                        text = "$waitingCount",
                                        fontWeight = FontWeight.Bold,
                                        fontSize = 17.sp,
                                        color = Color(0xFFB45B10)
                                    )
                                    Text(
                                        text = "Waiting in Lobby",
                                        fontSize = 10.sp,
                                        lineHeight = 12.sp,
                                        color = Color(0xFF9E5417),
                                        fontWeight = FontWeight.Medium,
                                        maxLines = 2,
                                        overflow = TextOverflow.Ellipsis
                                    )
                                }
                            }

                            // 3. Completed Today Card (Soft Light Mint/Green)
                            Surface(
                                color = Color(0xFFE5F8EE),
                                shape = RoundedCornerShape(12.dp),
                                modifier = Modifier.weight(1f)
                            ) {
                                Column(
                                    modifier = Modifier.padding(horizontal = 8.dp, vertical = 7.dp),
                                    verticalArrangement = Arrangement.spacedBy(2.dp)
                                ) {
                                    Surface(
                                        shape = CircleShape,
                                        color = Color(0xFFC7F0DB),
                                        modifier = Modifier.size(22.dp)
                                    ) {
                                        Box(contentAlignment = Alignment.Center) {
                                            Icon(
                                                Icons.Default.CheckCircle,
                                                contentDescription = null,
                                                tint = Color(0xFF0F8A50),
                                                modifier = Modifier.size(13.dp)
                                            )
                                        }
                                    }
                                    Text(
                                        text = "$doneCount",
                                        fontWeight = FontWeight.Bold,
                                        fontSize = 17.sp,
                                        color = Color(0xFF0F8A50)
                                    )
                                    Text(
                                        text = "Completed Today",
                                        fontSize = 10.sp,
                                        lineHeight = 12.sp,
                                        color = Color(0xFF137747),
                                        fontWeight = FontWeight.Medium,
                                        maxLines = 2,
                                        overflow = TextOverflow.Ellipsis
                                    )
                                }
                            }
                        }
                    }
                }
            }

            // ── COMPACT DATE SCROLLER ─────────────────────────────
            item(key = "date_scroller") {
                Box(modifier = Modifier.padding(horizontal = 16.dp)) {
                    Surface(
                        color = Color.White,
                        shape = RoundedCornerShape(16.dp),
                        shadowElevation = 1.dp,
                        modifier = Modifier.fillMaxWidth()
                    ) {
                Column(
                    modifier = Modifier.padding(vertical = 10.dp, horizontal = 12.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    // Header: Month/Year navigation & "Today" shortcut
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(2.dp)
                        ) {
                            IconButton(
                                onClick = {
                                    val prev = viewedYearMonth.minusMonths(1)
                                    viewedYearMonth = prev
                                    val curToday = LocalDate.now()
                                    if (prev == YearMonth.from(curToday)) {
                                        selectedQueueDate = curToday.toString()
                                        coroutineScope.launch {
                                            val targetIdx = (curToday.dayOfMonth - 1).coerceAtLeast(0)
                                            dateListState.animateScrollToItem(targetIdx)
                                        }
                                    } else {
                                        val newDate = prev.atDay(1)
                                        selectedQueueDate = newDate.toString()
                                        coroutineScope.launch { dateListState.scrollToItem(0) }
                                    }
                                },
                                modifier = Modifier.size(30.dp)
                            ) {
                                Icon(
                                    Icons.Default.ChevronLeft,
                                    contentDescription = "Previous Month",
                                    tint = Color(0xFF475569),
                                    modifier = Modifier.size(18.dp)
                                )
                            }
                            Text(
                                text = "${viewedYearMonth.month.getDisplayName(TextStyle.FULL, Locale.ENGLISH)} ${viewedYearMonth.year}",
                                fontSize = 14.sp,
                                fontWeight = FontWeight.Bold,
                                color = Color(0xFF0F172A)
                            )
                            IconButton(
                                onClick = {
                                    val next = viewedYearMonth.plusMonths(1)
                                    viewedYearMonth = next
                                    val curToday = LocalDate.now()
                                    if (next == YearMonth.from(curToday)) {
                                        selectedQueueDate = curToday.toString()
                                        coroutineScope.launch {
                                            val targetIdx = (curToday.dayOfMonth - 1).coerceAtLeast(0)
                                            dateListState.animateScrollToItem(targetIdx)
                                        }
                                    } else {
                                        val newDate = next.atDay(1)
                                        selectedQueueDate = newDate.toString()
                                        coroutineScope.launch { dateListState.scrollToItem(0) }
                                    }
                                },
                                modifier = Modifier.size(30.dp)
                            ) {
                                Icon(
                                    Icons.Default.ChevronRight,
                                    contentDescription = "Next Month",
                                    tint = Color(0xFF475569),
                                    modifier = Modifier.size(18.dp)
                                )
                            }
                        }

                        // "Today" Button
                        val curToday = LocalDate.now()
                        val isTodaySelected = selectedQueueDate == curToday.toString()
                        Surface(
                            shape = RoundedCornerShape(12.dp),
                            color = if (isTodaySelected) Color(0xFFE0F2FE) else Color(0xFFF1F5F9),
                            border = BorderStroke(1.dp, if (isTodaySelected) Color(0xFF0284C7) else Color(0xFFCBD5E1)),
                            modifier = Modifier.clickable {
                                viewedYearMonth = YearMonth.from(curToday)
                                selectedQueueDate = curToday.toString()
                                coroutineScope.launch {
                                    val targetIdx = (curToday.dayOfMonth - 1 - 2).coerceAtLeast(0)
                                    dateListState.animateScrollToItem(targetIdx)
                                }
                            }
                        ) {
                            Text(
                                text = "Today",
                                fontSize = 11.5.sp,
                                fontWeight = FontWeight.SemiBold,
                                color = if (isTodaySelected) Color(0xFF0284C7) else Color(0xFF475569),
                                modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp)
                            )
                        }
                    }

                    // Compact Horizontal Date List
                    val daysInMonth = remember(viewedYearMonth) {
                        (1..viewedYearMonth.lengthOfMonth()).map { viewedYearMonth.atDay(it) }
                    }
                    LazyRow(
                        state = dateListState,
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                        contentPadding = PaddingValues(horizontal = 2.dp),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        items(daysInMonth, key = { it.toString() }) { date ->
                            val isSelected = date.toString() == selectedQueueDate
                            val dayOfWeekStr = date.dayOfWeek.getDisplayName(TextStyle.SHORT, Locale.ENGLISH).take(3)
                            Surface(
                                shape = RoundedCornerShape(10.dp),
                                color = if (isSelected) Color(0xFF0284C7) else Color(0xFFF8FAFC),
                                border = BorderStroke(
                                    1.dp,
                                    if (isSelected) Color(0xFF0284C7) else Color(0xFFE2E8F0)
                                ),
                                modifier = Modifier
                                    .width(46.dp)
                                    .defaultMinSize(minHeight = 56.dp)
                                    .clickable {
                                        selectedQueueDate = date.toString()
                                        coroutineScope.launch {
                                            val targetIdx = (date.dayOfMonth - 1 - 2).coerceAtLeast(0)
                                            dateListState.animateScrollToItem(targetIdx)
                                        }
                                    }
                            ) {
                                Column(
                                    horizontalAlignment = Alignment.CenterHorizontally,
                                    verticalArrangement = Arrangement.Center,
                                    modifier = Modifier.padding(vertical = 6.dp, horizontal = 2.dp)
                                ) {
                                    Text(
                                        text = dayOfWeekStr,
                                        fontSize = 10.5.sp,
                                        fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Medium,
                                        color = if (isSelected) Color.White.copy(alpha = 0.9f) else Color(0xFF64748B)
                                    )
                                    Spacer(Modifier.height(2.dp))
                                    Text(
                                        text = "${date.dayOfMonth}",
                                        fontSize = 15.sp,
                                        fontWeight = FontWeight.ExtraBold,
                                        color = if (isSelected) Color.White else Color(0xFF0F172A)
                                    )
                                }
                            }
                        }
                    }
                }
            }
        }
    }

            // ── DEDICATED DOCTOR FILTER ROW (Matches media_1793087755798_d126b7f8.png) ──
            if (clinicDoctors.isNotEmpty()) {
                item(key = "doctor_filter_row") {
                    Box(modifier = Modifier.padding(horizontal = 16.dp, vertical = 2.dp)) {
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .horizontalScroll(rememberScrollState()),
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            // If more than 1 doctor, show All Doctors chip
                            if (clinicDoctors.size > 1) {
                                val isAllSelected = selectedDoctorFilterId == null
                                Surface(
                                    shape = RoundedCornerShape(20.dp),
                                    color = if (isAllSelected) Color(0xFF0284C7) else Color.White,
                                    border = BorderStroke(1.dp, if (isAllSelected) Color(0xFF0284C7) else Color(0xFFCBD5E1)),
                                    shadowElevation = if (isAllSelected) 2.dp else 0.dp,
                                    modifier = Modifier.clickable { selectedDoctorFilterId = null }
                                ) {
                                    Row(
                                        modifier = Modifier.padding(horizontal = 14.dp, vertical = 7.dp),
                                        verticalAlignment = Alignment.CenterVertically,
                                        horizontalArrangement = Arrangement.spacedBy(6.dp)
                                    ) {
                                        Icon(
                                            Icons.Default.Person,
                                            contentDescription = null,
                                            tint = if (isAllSelected) Color.White else Color(0xFF64748B),
                                            modifier = Modifier.size(16.dp)
                                        )
                                        Text(
                                            text = "All Doctors",
                                            fontWeight = if (isAllSelected) FontWeight.Bold else FontWeight.Medium,
                                            fontSize = 12.sp,
                                            color = if (isAllSelected) Color.White else Color(0xFF334155)
                                        )
                                    }
                                }
                            }

                            // Individual Real Doctor Chips
                            clinicDoctors.forEach { doc ->
                                val isDocSelected = selectedDoctorFilterId == doc.id
                                val docWaitingCount = queueItems.count {
                                    (it.status == "waiting" || it.status == "inside") &&
                                    it.doctorId == doc.id &&
                                    (it.appointmentDate.isBlank() || it.appointmentDate == selectedQueueDate)
                                }
                                val rawName = doc.fullName.trim()
                                val displayName = if (rawName.startsWith("Dr.", ignoreCase = true) || rawName.startsWith("Dr ", ignoreCase = true)) {
                                    rawName
                                } else {
                                    "Dr. $rawName"
                                }

                                Surface(
                                    shape = RoundedCornerShape(20.dp),
                                    color = if (isDocSelected) Color(0xFF0284C7) else Color.White,
                                    border = BorderStroke(1.dp, if (isDocSelected) Color(0xFF0284C7) else Color(0xFFCBD5E1)),
                                    shadowElevation = if (isDocSelected) 2.dp else 0.dp,
                                    modifier = Modifier.clickable { selectedDoctorFilterId = doc.id }
                                ) {
                                    Row(
                                        modifier = Modifier.padding(horizontal = 14.dp, vertical = 7.dp),
                                        verticalAlignment = Alignment.CenterVertically,
                                        horizontalArrangement = Arrangement.spacedBy(6.dp)
                                    ) {
                                        Icon(
                                            Icons.Default.Person,
                                            contentDescription = null,
                                            tint = if (isDocSelected) Color.White else Color(0xFF64748B),
                                            modifier = Modifier.size(16.dp)
                                        )
                                        Text(
                                            text = if (docWaitingCount > 0) "$displayName ($docWaitingCount)" else displayName,
                                            fontWeight = if (isDocSelected) FontWeight.Bold else FontWeight.Medium,
                                            fontSize = 12.sp,
                                            color = if (isDocSelected) Color.White else Color(0xFF334155)
                                        )
                                    }
                                }
                            }
                        }
                    }
                }
            } else if (isDoctorsLoading) {
                item(key = "doctor_filter_row_skeleton") {
                    Box(modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp)) {
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            Surface(
                                shape = RoundedCornerShape(20.dp),
                                color = Color(0xFFF1F5F9),
                                border = BorderStroke(1.dp, Color(0xFFE2E8F0))
                            ) {
                                Box(modifier = Modifier.size(90.dp, 32.dp))
                            }
                            Surface(
                                shape = RoundedCornerShape(20.dp),
                                color = Color(0xFFF1F5F9),
                                border = BorderStroke(1.dp, Color(0xFFE2E8F0))
                            ) {
                                Box(modifier = Modifier.size(110.dp, 32.dp))
                            }
                        }
                    }
                }
            }

            // Sub-Tabs Sticky Header (Live vs Completed)
            stickyHeader(key = "queue_tabs") {
                Surface(
                    color = Color.White,
                    shadowElevation = 2.dp,
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 16.dp, vertical = 8.dp)
                    ) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            // Live Tab
                            Surface(
                                shape = RoundedCornerShape(20.dp),
                                color = if (selectedQueueTab == 0) Color(0xFF0284C7) else Color.White,
                                border = BorderStroke(1.dp, if (selectedQueueTab == 0) Color(0xFF0284C7) else Color(0xFFCBD5E1)),
                                shadowElevation = if (selectedQueueTab == 0) 2.dp else 0.dp,
                                modifier = Modifier.clickable { selectedQueueTab = 0 }
                            ) {
                                Row(
                                    modifier = Modifier.padding(horizontal = 14.dp, vertical = 7.dp),
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(6.dp)
                                ) {
                                    Icon(
                                        Icons.Default.Groups,
                                        contentDescription = null,
                                        tint = if (selectedQueueTab == 0) Color.White else Color(0xFF64748B),
                                        modifier = Modifier.size(16.dp)
                                    )
                                    Text(
                                        "Live (${liveQueue.size})",
                                        fontWeight = FontWeight.Bold,
                                        fontSize = 12.5.sp,
                                        color = if (selectedQueueTab == 0) Color.White else Color(0xFF334155)
                                    )
                                }
                            }

                            // Completed Tab
                            Surface(
                                shape = RoundedCornerShape(20.dp),
                                color = if (selectedQueueTab == 1) Color(0xFF0284C7) else Color.White,
                                border = BorderStroke(1.dp, if (selectedQueueTab == 1) Color(0xFF0284C7) else Color(0xFFCBD5E1)),
                                shadowElevation = if (selectedQueueTab == 1) 2.dp else 0.dp,
                                modifier = Modifier.clickable { selectedQueueTab = 1 }
                            ) {
                                Row(
                                    modifier = Modifier.padding(horizontal = 14.dp, vertical = 7.dp),
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(6.dp)
                                ) {
                                    Icon(
                                        Icons.Default.CheckCircle,
                                        contentDescription = null,
                                        tint = if (selectedQueueTab == 1) Color.White else Color(0xFF64748B),
                                        modifier = Modifier.size(16.dp)
                                    )
                                    Text(
                                        "Completed (${pastQueue.size})",
                                        fontWeight = FontWeight.Bold,
                                        fontSize = 12.5.sp,
                                        color = if (selectedQueueTab == 1) Color.White else Color(0xFF334155)
                                    )
                                }
                            }
                        }
                    }
                }
            }

    if (selectedQueueTab == 0) {
        item(key = "info_banner") {
            Box(modifier = Modifier.padding(horizontal = 16.dp)) {
                // Live OPD Queue Info Banner (Matching template in media_1791633639645_ca1532cb.png)
                Surface(
                    color = Color(0xFFEEF6FF),
                    shape = RoundedCornerShape(16.dp),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 14.dp, vertical = 14.dp),
                        horizontalArrangement = Arrangement.spacedBy(12.dp),
                        verticalAlignment = Alignment.Top
                    ) {
                        Surface(
                            shape = CircleShape,
                            color = Color(0xFF3B82F6),
                            modifier = Modifier.size(28.dp)
                        ) {
                            Box(contentAlignment = Alignment.Center) {
                                Icon(
                                    Icons.Default.Info,
                                    contentDescription = null,
                                    tint = Color.White,
                                    modifier = Modifier.size(18.dp)
                                )
                            }
                        }
                        Column(
                            modifier = Modifier.weight(1f),
                            verticalArrangement = Arrangement.spacedBy(4.dp)
                        ) {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Text(
                                    text = "Live OPD Queue",
                                    fontWeight = FontWeight.Bold,
                                    fontSize = 14.5.sp,
                                    color = Color(0xFF0F172A)
                                )
                                // Compact Break Mode Toggle chip
                                val todaySched = currentClinic?.getTodaySchedule()
                                Surface(
                                    shape = RoundedCornerShape(20.dp),
                                    color = if (isClinicOnBreak) Color(0xFFFEF3C7) else Color(0xFFDBEAFE),
                                    border = BorderStroke(1.dp, if (isClinicOnBreak) Color(0xFFF59E0B) else Color(0xFF93C5FD)),
                                    modifier = Modifier.clickable {
                                        val newValue = !isClinicOnBreak
                                        lastBreakToggleMs = System.currentTimeMillis()
                                        isClinicOnBreak = newValue
                                        currentClinic = currentClinic?.copy(isOnBreak = newValue)
                                        coroutineScope.launch {
                                            val updated = clinicRepository?.toggleClinicBreak(effectiveClinicId, newValue)
                                            if (updated != null) {
                                                currentClinic = updated
                                            }
                                            if (newValue) {
                                                val windowStr = if (todaySched?.hasBreak == true) "${todaySched.breakStart} - ${todaySched.breakEnd}" else null
                                                val count = queueRepository?.sendClinicBreakNotificationsToActiveAppointments(
                                                    clinicId = effectiveClinicId,
                                                    clinicName = currentClinic?.name ?: "Dactor Clinic",
                                                    breakWindowText = windowStr
                                                ) ?: 0
                                                notificationSentMessage = "☕ Clinic Break ON \u2014 notified $count active appointment(s)."
                                            } else {
                                                notificationSentMessage = "✓ Clinic Break OFF \u2014 live queue resumed."
                                            }
                                        }
                                    }
                                ) {
                                    Row(
                                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp),
                                        verticalAlignment = Alignment.CenterVertically,
                                        horizontalArrangement = Arrangement.spacedBy(4.dp)
                                    ) {
                                        Icon(
                                            Icons.Default.FreeBreakfast,
                                            contentDescription = null,
                                            tint = if (isClinicOnBreak) Color(0xFFD97706) else Color(0xFF1D4ED8),
                                            modifier = Modifier.size(12.dp)
                                        )
                                        Text(
                                            text = if (isClinicOnBreak) "Break: ON" else "Break: OFF",
                                            fontSize = 10.5.sp,
                                            fontWeight = FontWeight.Bold,
                                            color = if (isClinicOnBreak) Color(0xFFB45309) else Color(0xFF1D4ED8)
                                        )
                                    }
                                }
                            }
                            Text(
                                text = "Live OPD Queue operates on a strict FIFO system. When consultation completes, the patient moves to Past Queue and the next patient becomes #1.",
                                fontSize = 12.sp,
                                color = Color(0xFF475569),
                                lineHeight = 17.sp
                            )
                        }
                    }
                }
            }
        }
    }

    if (notificationSentMessage != null) {
        item(key = "notification_sent_banner") {
            Box(modifier = Modifier.padding(horizontal = 16.dp)) {
                Surface(
                    color = Color(0xFFDCFCE7),
                    shape = RoundedCornerShape(10.dp),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Row(
                        modifier = Modifier.padding(10.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(6.dp)
                    ) {
                        Icon(Icons.Default.NotificationsActive, contentDescription = null, tint = Color(0xFF16A34A))
                        Text(notificationSentMessage ?: "", fontSize = 12.sp, fontWeight = FontWeight.Medium, color = Color(0xFF166534))
                    }
                }
            }
        }
    }

    val currentQueueList = if (selectedQueueTab == 0) liveQueue else pastQueue

    if (isQueueLoading && currentQueueList.isEmpty()) {
        items(3, key = { index -> "loading_queue_skeleton_$index" }) {
            Box(modifier = Modifier.padding(horizontal = 16.dp, vertical = 6.dp)) {
                Surface(
                    shape = RoundedCornerShape(18.dp),
                    color = Color.White,
                    border = BorderStroke(1.dp, Color(0xFFE2E8F0)),
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
                                horizontalArrangement = Arrangement.spacedBy(10.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Box(
                                    modifier = Modifier
                                        .size(36.dp)
                                        .clip(CircleShape)
                                        .background(Color(0xFFE2E8F0))
                                )
                                Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                                    Box(
                                        modifier = Modifier
                                            .size(130.dp, 16.dp)
                                            .clip(RoundedCornerShape(4.dp))
                                            .background(Color(0xFFE2E8F0))
                                    )
                                    Box(
                                        modifier = Modifier
                                            .size(80.dp, 12.dp)
                                            .clip(RoundedCornerShape(4.dp))
                                            .background(Color(0xFFF1F5F9))
                                    )
                                }
                            }
                            Box(
                                modifier = Modifier
                                    .size(70.dp, 28.dp)
                                    .clip(RoundedCornerShape(14.dp))
                                    .background(Color(0xFFF1F5F9))
                            )
                        }
                    }
                }
            }
        }
    } else if (currentQueueList.isEmpty()) {
        item(key = "empty_queue_state") {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = 40.dp, bottom = 40.dp)
                    .padding(horizontal = 16.dp),
                contentAlignment = Alignment.Center
            ) {
                Column(
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    Icon(
                        if (selectedQueueTab == 0) Icons.Default.Schedule else Icons.Default.DoneAll,
                        contentDescription = null,
                        tint = Color(0xFF94A3B8),
                        modifier = Modifier.size(48.dp)
                    )
                    Text(
                        text = if (selectedQueueTab == 0) "No Active Patients in Live Queue" else "No Completed Appointments",
                        fontWeight = FontWeight.Bold,
                        fontSize = 16.sp,
                        color = Color(0xFF0F172A)
                    )
                    Text(
                        text = if (selectedQueueTab == 0)
                            "Patients will appear here when appointments are checked in."
                        else
                            "Completed patient consultations for this date will be listed here.",
                        fontSize = 12.sp,
                        color = Color(0xFF64748B)
                    )
                }
            }
        }
    } else if (selectedQueueTab == 1) {
        itemsIndexed(pastQueue, key = { _, item -> item.id }) { index, item ->
            Box(modifier = Modifier.padding(horizontal = 16.dp)) {
                Card(
                            shape = RoundedCornerShape(18.dp),
                            colors = CardDefaults.cardColors(containerColor = Color.White),
                            border = BorderStroke(1.dp, Color(0xFFE2E8F0)),
                            elevation = CardDefaults.cardElevation(defaultElevation = 2.dp),
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Column(modifier = Modifier.padding(16.dp)) {
                                // Top Row: Avatar with Initials + Name/ID + Completed Stamp
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
                                        // Circular Initials Avatar (matching screenshot RS, PP, AK)
                                        Surface(
                                            shape = CircleShape,
                                            color = Color(0xFFDBEAFE),
                                            modifier = Modifier.size(46.dp)
                                        ) {
                                            Box(contentAlignment = Alignment.Center) {
                                                Text(
                                                    text = getInitials(item.patientName),
                                                    fontWeight = FontWeight.Bold,
                                                    fontSize = 16.sp,
                                                    color = Color(0xFF1E40AF)
                                                )
                                            }
                                        }

                                        Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                                            Text(
                                                text = item.patientName,
                                                fontWeight = FontWeight.Bold,
                                                fontSize = 16.sp,
                                                color = Color(0xFF0F172A)
                                            )
                                            Text(
                                                text = "App. ID: ${item.trackingCode}",
                                                fontSize = 12.5.sp,
                                                color = Color(0xFF64748B)
                                            )
                                        }
                                    }

                                    // Appointment Completion Stamp / Badge
                                    Surface(
                                        shape = RoundedCornerShape(16.dp),
                                        color = if (item.status == "no_show") Color(0xFFFEE2E2) else Color(0xFFDCFCE7)
                                    ) {
                                        Row(
                                            modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp),
                                            verticalAlignment = Alignment.CenterVertically,
                                            horizontalArrangement = Arrangement.spacedBy(5.dp)
                                        ) {
                                            Icon(
                                                if (item.status == "no_show") Icons.Default.Cancel else Icons.Default.CheckCircle,
                                                contentDescription = null,
                                                tint = if (item.status == "no_show") Color(0xFFDC2626) else Color(0xFF16A34A),
                                                modifier = Modifier.size(15.dp)
                                            )
                                            Text(
                                                text = if (item.status == "no_show") "No Show" else "Completed",
                                                color = if (item.status == "no_show") Color(0xFFDC2626) else Color(0xFF15803D),
                                                fontWeight = FontWeight.SemiBold,
                                                fontSize = 12.sp
                                            )
                                        }
                                    }
                                }

                                Spacer(modifier = Modifier.height(14.dp))
                                Divider(color = Color(0xFFF1F5F9), thickness = 1.dp)
                                Spacer(modifier = Modifier.height(12.dp))

                                // Details Row: Turn No. | Phone No. | Appointment Time (+ Time Inside) | Add Remark Button
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.SpaceBetween
                                ) {
                                    // 1. Turn No.
                                    Column {
                                        Text("Turn No.", fontSize = 11.sp, color = Color(0xFF64748B))
                                        Spacer(Modifier.height(2.dp))
                                        Text(
                                            text = "${item.queuePosition}",
                                            fontSize = 14.5.sp,
                                            fontWeight = FontWeight.Bold,
                                            color = Color(0xFF0F172A)
                                        )
                                    }

                                    // Vertical divider
                                    Box(modifier = Modifier.height(30.dp).width(1.dp).background(Color(0xFFE2E8F0)))

                                    // 2. Phone No. (WITHOUT +91)
                                    Column {
                                        Text("Phone No.", fontSize = 11.sp, color = Color(0xFF64748B))
                                        Spacer(Modifier.height(2.dp))
                                        Text(
                                            text = cleanPhoneNumber(item.patientMobile),
                                            fontSize = 13.5.sp,
                                            fontWeight = FontWeight.Bold,
                                            color = Color(0xFF0F172A)
                                        )
                                    }

                                    // Vertical divider
                                    Box(modifier = Modifier.height(30.dp).width(1.dp).background(Color(0xFFE2E8F0)))

                                    // 3. Appointment Time & Time Inside
                                    Column {
                                        Text("Appointment Time", fontSize = 11.sp, color = Color(0xFF64748B))
                                        Spacer(Modifier.height(2.dp))
                                        Text(
                                            text = item.appointmentTime.ifBlank { "Turn #${item.queuePosition}" },
                                            fontSize = 13.5.sp,
                                            fontWeight = FontWeight.Bold,
                                            color = Color(0xFF0F172A)
                                        )
                                        val durationText = formatConsultationDuration(item.insideAt, item.completedAt, item.consultationDurationSeconds)
                                        if (durationText.isNotBlank()) {
                                            Spacer(Modifier.height(1.dp))
                                            Text(
                                                text = "Inside: $durationText",
                                                fontSize = 11.sp,
                                                fontWeight = FontWeight.SemiBold,
                                                color = Color(0xFF00838F)
                                            )
                                        }
                                    }

                                    // 4. Add Remark Button
                                    OutlinedButton(
                                        onClick = {
                                            remarkTargetItem = item
                                            remarkInputText = remarksMap[item.appointmentId] ?: ""
                                        },
                                        shape = RoundedCornerShape(10.dp),
                                        border = BorderStroke(1.dp, Color(0xFF00838F)),
                                        colors = ButtonDefaults.outlinedButtonColors(containerColor = Color.Transparent),
                                        contentPadding = PaddingValues(horizontal = 10.dp, vertical = 6.dp)
                                    ) {
                                        Icon(
                                            Icons.Default.ChatBubbleOutline,
                                            contentDescription = null,
                                            tint = Color(0xFF00838F),
                                            modifier = Modifier.size(15.dp)
                                        )
                                        Spacer(modifier = Modifier.width(4.dp))
                                        Text(
                                            text = if (remarksMap[item.appointmentId]?.isNotBlank() == true) "Edit Remark" else "Add Remark",
                                            color = Color(0xFF00838F),
                                            fontWeight = FontWeight.Bold,
                                            fontSize = 12.sp
                                        )
                                    }
                                }

                                // Clinical Remark container if already saved
                                val existingRemark = remarksMap[item.appointmentId]
                                if (!existingRemark.isNullOrBlank()) {
                                    Spacer(modifier = Modifier.height(10.dp))
                                    Surface(
                                        color = Color(0xFFF8FAFC),
                                        shape = RoundedCornerShape(8.dp),
                                        border = BorderStroke(1.dp, Color(0xFFE2E8F0)),
                                        modifier = Modifier.fillMaxWidth()
                                    ) {
                                        Row(
                                            modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp),
                                            verticalAlignment = Alignment.CenterVertically,
                                            horizontalArrangement = Arrangement.spacedBy(6.dp)
                                        ) {
                                            Icon(Icons.Default.Notes, contentDescription = null, tint = Color(0xFF00838F), modifier = Modifier.size(14.dp))
                                            Text(
                                                text = "Remark: $existingRemark",
                                                fontSize = 11.5.sp,
                                                color = Color(0xFF334155),
                                                maxLines = 2,
                                                overflow = TextOverflow.Ellipsis
                                            )
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            } else {
                if (todayExpiredWaitingCount > 0 && selectedQueueDate == today.toString()) {
                    item(key = "auto_noshow_banner") {
                        Surface(
                            shape = RoundedCornerShape(12.dp),
                            color = Color(0xFFFEF2F2),
                            border = BorderStroke(1.dp, Color(0xFFFECACA)),
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(horizontal = 16.dp, vertical = 4.dp)
                        ) {
                            Row(
                                modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.SpaceBetween
                            ) {
                                Row(
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                                    modifier = Modifier.weight(1f)
                                ) {
                                    Icon(Icons.Default.EventBusy, contentDescription = null, tint = Color(0xFFDC2626), modifier = Modifier.size(16.dp))
                                    Text(
                                        "$todayExpiredWaitingCount waiting patient(s) passed slot time",
                                        fontSize = 11.5.sp,
                                        fontWeight = FontWeight.SemiBold,
                                        color = Color(0xFF991B1B)
                                    )
                                }
                                TextButton(
                                    onClick = { showAutoNoShowDialog = true },
                                    contentPadding = PaddingValues(horizontal = 8.dp, vertical = 2.dp)
                                ) {
                                    Text("Auto No-Show", fontSize = 11.5.sp, fontWeight = FontWeight.Bold, color = Color(0xFFDC2626))
                                }
                            }
                        }
                    }
                }
                itemsIndexed(liveQueue, key = { _, item -> item.id }) { index, item ->
                    val isLongPressed = longPressedItemId == item.id
                    Box(modifier = Modifier.padding(horizontal = 16.dp)) {
                        Card(
                            shape = RoundedCornerShape(18.dp),
                            colors = CardDefaults.cardColors(containerColor = Color.White),
                            border = BorderStroke(1.dp, if (isLongPressed) Color(0xFF00838F) else Color(0xFFE2E8F0)),
                            elevation = CardDefaults.cardElevation(defaultElevation = 2.dp),
                            modifier = Modifier
                                .fillMaxWidth()
                                .combinedClickable(
                                    onClick = {
                                        expandedItemId = if (expandedItemId == item.id) null else item.id
                                    },
                                    onLongClick = {
                                        if (selectedQueueTab == 0) {
                                            longPressedItemId = if (longPressedItemId == item.id) null else item.id
                                        }
                                    }
                                )
                        ) {
                            Column(modifier = Modifier.padding(16.dp)) {
                                // Reorder Arrow Controls Strip (Shown on long press)
                                if (selectedQueueTab == 0 && isLongPressed) {
                                    Surface(
                                        color = Color(0xFFF1F5F9),
                                        shape = RoundedCornerShape(10.dp),
                                        modifier = Modifier
                                            .fillMaxWidth()
                                            .padding(bottom = 12.dp)
                                    ) {
                                        Row(
                                            modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp),
                                            verticalAlignment = Alignment.CenterVertically,
                                            horizontalArrangement = Arrangement.SpaceBetween
                                        ) {
                                            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                                Icon(Icons.Default.SwapVert, contentDescription = null, tint = Color(0xFF00838F), modifier = Modifier.size(16.dp))
                                                Text("Position: Turn #${index + 1}", fontSize = 12.sp, fontWeight = FontWeight.Bold, color = Color(0xFF334155))
                                            }

                                            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                                                IconButton(
                                                    onClick = { moveItemOneStep(item, -1) },
                                                    enabled = index > 0,
                                                    modifier = Modifier.size(32.dp)
                                                ) {
                                                    Icon(Icons.Default.ArrowUpward, contentDescription = "Move Up", modifier = Modifier.size(18.dp), tint = if (index > 0) Color(0xFF00838F) else Color.Gray)
                                                }

                                                IconButton(
                                                    onClick = { moveItemOneStep(item, 1) },
                                                    enabled = index < currentQueueList.size - 1,
                                                    modifier = Modifier.size(32.dp)
                                                ) {
                                                    Icon(Icons.Default.ArrowDownward, contentDescription = "Move Down", modifier = Modifier.size(18.dp), tint = if (index < currentQueueList.size - 1) Color(0xFF00838F) else Color.Gray)
                                                }

                                                FilledTonalButton(
                                                    onClick = {
                                                        reorderItemDialog = item
                                                        newPositionInput = (index + 1).toString()
                                                    },
                                                    shape = RoundedCornerShape(6.dp),
                                                    contentPadding = PaddingValues(horizontal = 8.dp, vertical = 4.dp),
                                                    modifier = Modifier.defaultMinSize(minHeight = 32.dp)
                                                ) {
                                                    Text("Set Pos #", fontSize = 11.sp, fontWeight = FontWeight.Bold)
                                                }
                                            }
                                        }
                                    }
                                }

                                // Top Row: Avatar + Name & Subtitle + Pill (#1)
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
                                        // Blue Circle Avatar with Person Icon
                                        Surface(
                                            shape = CircleShape,
                                            color = Color(0xFF4C8DF5),
                                            modifier = Modifier.size(46.dp)
                                        ) {
                                            Box(contentAlignment = Alignment.Center) {
                                                Icon(
                                                    Icons.Default.Person,
                                                    contentDescription = null,
                                                    tint = Color.White,
                                                    modifier = Modifier.size(28.dp)
                                                )
                                            }
                                        }

                                        Column(verticalArrangement = Arrangement.spacedBy(3.dp)) {
                                            Text(
                                                text = item.patientName,
                                                fontWeight = FontWeight.Bold,
                                                fontSize = 16.sp,
                                                color = Color(0xFF0F172A)
                                            )
                                            // Mobile number, Age, Gender directly visible
                                            val demographicParts = buildList {
                                                if (item.patientAge > 0) add("${item.patientAge} yrs")
                                                if (item.patientGender.isNotBlank() && item.patientGender != "Registered") add(item.patientGender)
                                                if (item.patientMobile.isNotBlank()) add(item.patientMobile)
                                            }
                                            if (demographicParts.isNotEmpty()) {
                                                Text(
                                                    text = demographicParts.joinToString(" \u2022 "),
                                                    fontSize = 12.sp,
                                                    fontWeight = FontWeight.SemiBold,
                                                    color = Color(0xFF0284C7)
                                                )
                                            }
                                            if (!item.doctorName.isNullOrBlank()) {
                                                Text(
                                                    text = "👨‍⚕️ ${item.doctorName}",
                                                    fontSize = 11.5.sp,
                                                    fontWeight = FontWeight.Bold,
                                                    color = Color(0xFF475569)
                                                )
                                            }
                                            if (!item.selectedLabTests.isNullOrBlank()) {
                                                Text(
                                                    text = "Tests: ${item.selectedLabTests}",
                                                    fontSize = 11.5.sp,
                                                    fontWeight = FontWeight.SemiBold,
                                                    color = Color(0xFF0F4C81),
                                                    maxLines = 2,
                                                    overflow = TextOverflow.Ellipsis
                                                )
                                            }
                                            if (item.paymentMode == "PAY_AT_DESK") {
                                                Surface(
                                                    shape = RoundedCornerShape(4.dp),
                                                    color = if (item.paymentStatus == "paid") Color(0xFFDCFCE7) else Color(0xFFFEF3C7),
                                                    border = BorderStroke(0.5.dp, if (item.paymentStatus == "paid") Color(0xFF86EFAC) else Color(0xFFFDE68A)),
                                                    modifier = Modifier.padding(top = 2.dp)
                                                ) {
                                                    Text(
                                                        text = if (item.paymentStatus == "paid") "✓ Paid at Desk" else "💵 Pay at Desk (Due Rs. ${item.totalAmount.toInt()})",
                                                        fontSize = 11.sp,
                                                        fontWeight = FontWeight.Bold,
                                                        color = if (item.paymentStatus == "paid") Color(0xFF166534) else Color(0xFF92400E),
                                                        modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
                                                    )
                                                }
                                            }
                                            Row(
                                                verticalAlignment = Alignment.CenterVertically,
                                                horizontalArrangement = Arrangement.spacedBy(4.dp),
                                                modifier = Modifier.clickable {
                                                    if (selectedQueueTab == 0) {
                                                        reorderItemDialog = item
                                                        newPositionInput = (index + 1).toString()
                                                    }
                                                }
                                            ) {
                                                Icon(
                                                    Icons.Default.Sync,
                                                    contentDescription = null,
                                                    tint = Color(0xFF64748B),
                                                    modifier = Modifier.size(13.dp)
                                                )
                                                Text(
                                                    text = "Tap # to change position",
                                                    fontSize = 11.sp,
                                                    color = Color(0xFF64748B),
                                                    fontWeight = FontWeight.Medium
                                                )
                                            }
                                        }
                                    }

                                    // Right Pill: #1 / #Position (Soft Light Blue Pill with Bold Blue Text)
                                    Surface(
                                        shape = RoundedCornerShape(12.dp),
                                        color = when (item.status) {
                                            "inside" -> Color(0xFFDCFCE7)
                                            "done" -> Color(0xFFF1F5F9)
                                            "no_show" -> Color(0xFFFEE2E2)
                                            else -> Color(0xFFEBF3FE)
                                        },
                                        modifier = Modifier
                                            .clickable {
                                                if (selectedQueueTab == 0) {
                                                    reorderItemDialog = item
                                                    newPositionInput = (index + 1).toString()
                                                }
                                            }
                                    ) {
                                        val activeInside = queueItems.firstOrNull { it.status == "inside" }
                                        val isPassedOver = item.status == "waiting" && activeInside != null && activeInside.queuePosition > item.queuePosition

                                        Text(
                                            text = when {
                                                item.status == "inside" -> "Inside"
                                                item.status == "done" -> "Done"
                                                item.status == "no_show" -> "No Show"
                                                isPassedOver -> "Late"
                                                else -> "#${index + 1}"
                                            },
                                            color = when {
                                                item.status == "inside" -> Color(0xFF15803D)
                                                item.status == "done" -> Color(0xFF475569)
                                                item.status == "no_show" -> Color(0xFFDC2626)
                                                isPassedOver -> Color(0xFFD97706)
                                                else -> Color(0xFF1D68E2)
                                            },
                                            fontWeight = FontWeight.ExtraBold,
                                            fontSize = 15.sp,
                                            modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp)
                                        )
                                    }
                                }

                                Spacer(modifier = Modifier.height(14.dp))
                                Divider(color = Color(0xFFF1F5F9), thickness = 1.dp)
                                Spacer(modifier = Modifier.height(12.dp))

                                // Bottom Row: Slot / Inside elapsed time + Action Button (ONLY primary action directly visible)
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.SpaceBetween
                                ) {
                                    // Left Slot Window
                                    Row(
                                        verticalAlignment = Alignment.CenterVertically,
                                        horizontalArrangement = Arrangement.spacedBy(6.dp)
                                    ) {
                                        Icon(
                                            Icons.Default.AccessTime,
                                            contentDescription = null,
                                            tint = if (item.status == "inside") Color(0xFF15803D) else Color(0xFF64748B),
                                            modifier = Modifier.size(16.dp)
                                        )
                                        Text(
                                            text = if (item.status == "inside") {
                                                val elapsedSec = if (!item.insideAt.isNullOrBlank()) {
                                                    try {
                                                        (currentEpochSecond - java.time.Instant.parse(item.insideAt).epochSecond).coerceAtLeast(0)
                                                    } catch (e: Exception) { 0L }
                                                } else 0L
                                                "Inside: ${elapsedSec / 60}m ${elapsedSec % 60}s"
                                            } else {
                                                item.appointmentTime.ifBlank { "Turn #${index + 1}" }
                                            },
                                            fontSize = 12.sp,
                                            fontWeight = FontWeight.SemiBold,
                                            color = if (item.status == "inside") Color(0xFF15803D) else Color(0xFF475569)
                                        )
                                    }

                                    // Right Action Button
                                    if (isLabClinic && (item.status == "waiting" || item.status == "inside")) {
                                        Row(
                                            verticalAlignment = Alignment.CenterVertically,
                                            horizontalArrangement = Arrangement.spacedBy(6.dp)
                                        ) {
                                            if (item.status == "waiting") {
                                                OutlinedButton(
                                                    onClick = {
                                                        optimisticallyUpdateStatus(item.id, "inside")
                                                        coroutineScope.launch {
                                                            queueRepository?.updateQueueStatus(item.id, "inside", effectiveClinicId)
                                                            loadQueue()
                                                        }
                                                    },
                                                    shape = RoundedCornerShape(10.dp),
                                                    border = BorderStroke(1.dp, Color(0xFF00838F)),
                                                    colors = ButtonDefaults.outlinedButtonColors(containerColor = Color.Transparent),
                                                    contentPadding = PaddingValues(horizontal = 10.dp, vertical = 8.dp)
                                                ) {
                                                    Text(
                                                        "Call",
                                                        color = Color(0xFF00838F),
                                                        fontWeight = FontWeight.Bold,
                                                        fontSize = 12.sp
                                                    )
                                                }
                                            }
                                            Button(
                                                onClick = {
                                                    optimisticallyUpdateStatus(item.id, "processing")
                                                    coroutineScope.launch {
                                                        // 1. Move queue entry to processing
                                                        queueRepository?.updateQueueStatus(item.id, "processing", effectiveClinicId)
                                                        // 2. Update appointment checkin status to processing
                                                        appointmentRepository?.updateCheckinStatus(item.appointmentId, "processing")
                                                        // 3. Upsert lab report into Processing stage
                                                        labReportRepository?.upsertLabReportForAppointment(
                                                            appointmentId = item.appointmentId,
                                                            clinicId = effectiveClinicId,
                                                            patientName = item.patientName,
                                                            testName = item.selectedLabTests?.takeIf { it.isNotBlank() } ?: "Diagnostic Lab Analysis",
                                                            stage = "processing"
                                                        )
                                                        notificationSentMessage = "✓ Sample collected for ${item.patientName}! Patient transferred to Processing section in Operational Management."
                                                        loadQueue()
                                                    }
                                                },
                                                shape = RoundedCornerShape(10.dp),
                                                colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF0F4C81)),
                                                contentPadding = PaddingValues(horizontal = 12.dp, vertical = 8.dp)
                                            ) {
                                                Icon(
                                                    imageVector = Icons.Default.Biotech,
                                                    contentDescription = null,
                                                    tint = Color.White,
                                                    modifier = Modifier.size(15.dp)
                                                )
                                                Spacer(modifier = Modifier.width(5.dp))
                                                Text(
                                                    text = "Collected",
                                                    color = Color.White,
                                                    fontWeight = FontWeight.Bold,
                                                    fontSize = 12.5.sp
                                                )
                                            }
                                        }
                                    } else if (item.status == "waiting") {
                                        val activeInside = queueItems.firstOrNull { it.status == "inside" }
                                        val isPassedOver = activeInside != null && activeInside.queuePosition > item.queuePosition

                                        OutlinedButton(
                                            onClick = {
                                                optimisticallyUpdateStatus(item.id, "inside")
                                                coroutineScope.launch {
                                                    queueRepository?.updateQueueStatus(item.id, "inside", effectiveClinicId)
                                                    loadQueue()
                                                }
                                            },
                                            shape = RoundedCornerShape(10.dp),
                                            border = BorderStroke(1.dp, if (isPassedOver) Color(0xFFD97706) else Color(0xFF00838F)),
                                            colors = ButtonDefaults.outlinedButtonColors(
                                                containerColor = if (isPassedOver) Color(0xFFFFFBEB) else Color.Transparent
                                            ),
                                            contentPadding = PaddingValues(horizontal = 14.dp, vertical = 8.dp)
                                        ) {
                                            Icon(
                                                if (isPassedOver) Icons.Default.PriorityHigh else Icons.Default.NearMe,
                                                contentDescription = null,
                                                tint = if (isPassedOver) Color(0xFFD97706) else Color(0xFF00838F),
                                                modifier = Modifier.size(16.dp)
                                            )
                                            Spacer(modifier = Modifier.width(6.dp))
                                            Text(
                                                if (isPassedOver) "Arrived (Take Next)" else if (index == 0) "Next to enter" else "Call Inside",
                                                color = if (isPassedOver) Color(0xFFD97706) else Color(0xFF00838F),
                                                fontWeight = FontWeight.Bold,
                                                fontSize = 12.5.sp
                                            )
                                        }
                                    } else if (item.status == "inside") {
                                        Button(
                                            onClick = {
                                                optimisticallyUpdateStatus(item.id, "done")
                                                coroutineScope.launch {
                                                    queueRepository?.updateQueueStatus(item.id, "done", effectiveClinicId)
                                                    appointmentRepository?.updateCheckinStatus(item.appointmentId, "completed")
                                                    notificationSentMessage = "✓ Consultation completed for ${item.patientName}!"
                                                    loadQueue()
                                                }
                                            },
                                            shape = RoundedCornerShape(10.dp),
                                            colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF059669)),
                                            contentPadding = PaddingValues(horizontal = 14.dp, vertical = 8.dp)
                                        ) {
                                            Icon(
                                                imageVector = Icons.Default.Check,
                                                contentDescription = null,
                                                tint = Color.White,
                                                modifier = Modifier.size(16.dp)
                                            )
                                            Spacer(modifier = Modifier.width(6.dp))
                                            Text(
                                                text = "Mark Done",
                                                color = Color.White,
                                                fontWeight = FontWeight.Bold,
                                                fontSize = 12.5.sp
                                            )
                                        }
                                    } else {
                                        OutlinedButton(
                                            onClick = {
                                                navController.navigate("${NavRoutes.PatientDetail}/${item.appointmentId}")
                                            },
                                            shape = RoundedCornerShape(10.dp),
                                            border = BorderStroke(1.dp, Color(0xFFCBD5E1)),
                                            contentPadding = PaddingValues(horizontal = 12.dp, vertical = 8.dp)
                                        ) {
                                            Text(
                                                "View Details",
                                                color = Color(0xFF475569),
                                                fontWeight = FontWeight.Medium,
                                                fontSize = 12.sp
                                            )
                                        }
                                    }
                                }

                                // Expanded Drawer for Call Inside / Mark Done, Send Alert, Chart / Bill, and No-Show
                                AnimatedVisibility(visible = expandedItemId == item.id) {
                                    Column(
                                        modifier = Modifier
                                            .fillMaxWidth()
                                            .padding(top = 12.dp)
                                            .background(Color(0xFFF8FAFC), RoundedCornerShape(12.dp))
                                            .padding(12.dp),
                                        verticalArrangement = Arrangement.spacedBy(10.dp)
                                    ) {
                                        Row(
                                            modifier = Modifier.fillMaxWidth(),
                                            horizontalArrangement = Arrangement.SpaceBetween,
                                            verticalAlignment = Alignment.CenterVertically
                                        ) {
                                            Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                                                Surface(
                                                    color = Color(0xFFDBEAFE),
                                                    shape = RoundedCornerShape(6.dp)
                                                ) {
                                                    Text(
                                                        text = "Token: #${item.trackingCode}",
                                                        fontSize = 12.sp,
                                                        fontWeight = FontWeight.Bold,
                                                        color = Color(0xFF1D4ED8),
                                                        modifier = Modifier.padding(horizontal = 7.dp, vertical = 2.dp)
                                                    )
                                                }
                                                Text(
                                                    text = "Phone: ${cleanPhoneNumber(item.patientMobile)}",
                                                    fontSize = 12.sp,
                                                    fontWeight = FontWeight.SemiBold,
                                                    color = Color(0xFF0F172A)
                                                )
                                                Text(
                                                    text = "Age: ${if (item.patientAge > 0) "${item.patientAge} yrs" else "N/A"} \u2022 Gender: ${item.patientGender.ifBlank { "N/A" }}",
                                                    fontSize = 11.5.sp,
                                                    color = Color(0xFF64748B)
                                                )
                                            }

                                            // Direct Phone Call Button
                                            if (item.patientMobile.isNotBlank()) {
                                                Button(
                                                    onClick = {
                                                        try {
                                                            val cleanDigits = item.patientMobile.filter { it.isDigit() || it == '+' }
                                                            val dialIntent = Intent(Intent.ACTION_DIAL, Uri.parse("tel:$cleanDigits"))
                                                            context.startActivity(dialIntent)
                                                        } catch (e: Exception) {
                                                            e.printStackTrace()
                                                        }
                                                    },
                                                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF16A34A)),
                                                    shape = RoundedCornerShape(8.dp),
                                                    contentPadding = PaddingValues(horizontal = 10.dp, vertical = 6.dp)
                                                ) {
                                                    Icon(Icons.Default.Phone, contentDescription = null, tint = Color.White, modifier = Modifier.size(15.dp))
                                                    Spacer(modifier = Modifier.width(4.dp))
                                                    Text("Call Patient", color = Color.White, fontSize = 11.5.sp, fontWeight = FontWeight.Bold)
                                                }
                                            }
                                        }

                                        Divider(color = Color(0xFFE2E8F0), thickness = 1.dp)

                                        // Position Reorder Controls (Move Up, Move Down, Emergency #1)
                                        if (selectedQueueTab == 0 && item.status == "waiting") {
                                            Row(
                                                modifier = Modifier.fillMaxWidth(),
                                                horizontalArrangement = Arrangement.spacedBy(6.dp),
                                                verticalAlignment = Alignment.CenterVertically
                                            ) {
                                                OutlinedButton(
                                                    onClick = { moveItemOneStep(item, -1) },
                                                    enabled = index > 0,
                                                    modifier = Modifier.weight(1f),
                                                    shape = RoundedCornerShape(8.dp),
                                                    contentPadding = PaddingValues(horizontal = 4.dp, vertical = 6.dp)
                                                ) {
                                                    Icon(Icons.Default.ArrowUpward, contentDescription = null, modifier = Modifier.size(14.dp))
                                                    Spacer(modifier = Modifier.width(3.dp))
                                                    Text("Move Up", fontSize = 11.sp, fontWeight = FontWeight.SemiBold)
                                                }

                                                OutlinedButton(
                                                    onClick = { moveItemOneStep(item, 1) },
                                                    enabled = index < liveQueue.size - 1,
                                                    modifier = Modifier.weight(1f),
                                                    shape = RoundedCornerShape(8.dp),
                                                    contentPadding = PaddingValues(horizontal = 4.dp, vertical = 6.dp)
                                                ) {
                                                    Icon(Icons.Default.ArrowDownward, contentDescription = null, modifier = Modifier.size(14.dp))
                                                    Spacer(modifier = Modifier.width(3.dp))
                                                    Text("Move Down", fontSize = 11.sp, fontWeight = FontWeight.SemiBold)
                                                }

                                                OutlinedButton(
                                                    onClick = { moveItemToPosition(item, 1) },
                                                    enabled = index > 0,
                                                    modifier = Modifier.weight(1.1f),
                                                    shape = RoundedCornerShape(8.dp),
                                                    colors = ButtonDefaults.outlinedButtonColors(contentColor = Color(0xFFDC2626)),
                                                    border = BorderStroke(1.dp, Color(0xFFFCA5A5)),
                                                    contentPadding = PaddingValues(horizontal = 4.dp, vertical = 6.dp)
                                                ) {
                                                    Icon(Icons.Default.PriorityHigh, contentDescription = null, modifier = Modifier.size(14.dp))
                                                    Spacer(modifier = Modifier.width(2.dp))
                                                    Text("Emergency #1", fontSize = 11.sp, fontWeight = FontWeight.Bold)
                                                }
                                            }
                                        }

                                        Row(
                                            modifier = Modifier.fillMaxWidth(),
                                            horizontalArrangement = Arrangement.spacedBy(8.dp)
                                        ) {
                                            // Primary status action inside expanded drawer ("Call Inside" or "Mark Done")
                                            if (item.status == "waiting") {
                                                Button(
                                                    onClick = {
                                                        optimisticallyUpdateStatus(item.id, "inside")
                                                        coroutineScope.launch {
                                                            queueRepository?.updateQueueStatus(item.id, "inside", effectiveClinicId)
                                                            val docName = item.doctorName?.takeIf { it.isNotBlank() } ?: "Attending Physician"
                                                            queueRepository?.notifyCallInside(
                                                                appointmentId = item.appointmentId,
                                                                patientName = item.patientName,
                                                                doctorName = docName,
                                                                trackingCode = item.trackingCode
                                                            )
                                                            notificationSentMessage = "🔔 Called ${item.patientName} inside (push alert dispatched)."
                                                            loadQueue()
                                                        }
                                                    },
                                                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF00838F)),
                                                    modifier = Modifier.weight(1.1f),
                                                    shape = RoundedCornerShape(8.dp),
                                                    contentPadding = PaddingValues(horizontal = 8.dp, vertical = 8.dp)
                                                ) {
                                                    Text("Call Inside", fontSize = 11.5.sp, fontWeight = FontWeight.Bold)
                                                }
                                            } else if (item.status == "inside") {
                                                Button(
                                                    onClick = {
                                                        optimisticallyUpdateStatus(item.id, "done")
                                                        coroutineScope.launch {
                                                            queueRepository?.updateQueueStatus(item.id, "done", effectiveClinicId)
                                                            appointmentRepository?.updateCheckinStatus(item.appointmentId, "completed")
                                                            notificationSentMessage = "✓ Consultation completed for ${item.patientName}!"
                                                            loadQueue()
                                                        }
                                                    },
                                                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF059669)),
                                                    modifier = Modifier.weight(1.1f),
                                                    shape = RoundedCornerShape(8.dp),
                                                    contentPadding = PaddingValues(horizontal = 8.dp, vertical = 8.dp)
                                                ) {
                                                    Icon(Icons.Default.Check, contentDescription = null, modifier = Modifier.size(15.dp))
                                                    Spacer(modifier = Modifier.width(4.dp))
                                                    Text("Mark Done", fontSize = 11.5.sp, fontWeight = FontWeight.Bold)
                                                }
                                            }

                                            // Pay at Desk Counter Collection Action
                                            if (item.paymentMode == "PAY_AT_DESK" && item.paymentStatus != "paid") {
                                                Button(
                                                    onClick = {
                                                        coroutineScope.launch {
                                                            val res = appointmentRepository?.markPaymentCollectedAtDesk(item.appointmentId)
                                                            if (res?.isSuccess == true) {
                                                                notificationSentMessage = "✓ Collected NPR ${item.totalAmount.toInt()} at desk for ${item.patientName}!"
                                                                loadQueue()
                                                            }
                                                        }
                                                    },
                                                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFD97706)),
                                                    modifier = Modifier.weight(1.1f),
                                                    shape = RoundedCornerShape(8.dp),
                                                    contentPadding = PaddingValues(horizontal = 6.dp, vertical = 8.dp)
                                                ) {
                                                    Icon(Icons.Default.Payment, contentDescription = null, modifier = Modifier.size(14.dp), tint = Color.White)
                                                    Spacer(modifier = Modifier.width(3.dp))
                                                    Text("Mark Paid", fontSize = 11.sp, fontWeight = FontWeight.Bold, color = Color.White)
                                                }
                                            }

                                            // Direct Billing Shortcut
                                            OutlinedButton(
                                                onClick = {
                                                    navController.navigate("${NavRoutes.BillingScreen}/${item.appointmentId}")
                                                },
                                                modifier = Modifier.weight(0.9f),
                                                shape = RoundedCornerShape(8.dp),
                                                colors = ButtonDefaults.outlinedButtonColors(contentColor = Color(0xFF00796B)),
                                                border = BorderStroke(1.dp, Color(0xFF80CBC4)),
                                                contentPadding = PaddingValues(horizontal = 6.dp, vertical = 8.dp)
                                            ) {
                                                Icon(Icons.Default.Receipt, contentDescription = null, modifier = Modifier.size(14.dp), tint = Color(0xFF00796B))
                                                Spacer(modifier = Modifier.width(3.dp))
                                                Text("Bill", fontSize = 11.sp, fontWeight = FontWeight.SemiBold, color = Color(0xFF00796B))
                                            }

                                            // Patient Chart Shortcut
                                            OutlinedButton(
                                                onClick = {
                                                    navController.navigate("${NavRoutes.PatientDetail}/${item.appointmentId}")
                                                },
                                                modifier = Modifier.weight(0.9f),
                                                shape = RoundedCornerShape(8.dp),
                                                contentPadding = PaddingValues(horizontal = 6.dp, vertical = 8.dp)
                                            ) {
                                                Icon(Icons.Default.MedicalInformation, contentDescription = null, modifier = Modifier.size(14.dp))
                                                Spacer(modifier = Modifier.width(3.dp))
                                                Text("Chart", fontSize = 11.sp, fontWeight = FontWeight.SemiBold)
                                            }

                                            // Send Alert Notification Button
                                            if (item.status !in completedStatuses) {
                                                OutlinedButton(
                                                    onClick = {
                                                        coroutineScope.launch {
                                                            val pos = index + 1
                                                            val peopleAheadCount = liveQueue.take(index).count { it.status == "inside" || it.status == "waiting" }
                                                            val targetRaw = rawQueueEntries.find { it.id == item.id }
                                                            val timing = QueueRepository.calculateLiveQueueTimingEstimate(
                                                                clinic = currentClinic?.copy(isOnBreak = isClinicOnBreak),
                                                                isDoctorInClinic = true,
                                                                allClinicQueueEntries = rawQueueEntries,
                                                                targetEntry = targetRaw,
                                                                fallbackPatientsAhead = peopleAheadCount,
                                                                appointmentTime = item.appointmentTime,
                                                                optInEarlyCall = item.optInEarlyCall
                                                            )
                                                            val isFirstPos = (pos == 1) || (peopleAheadCount == 0)
                                                            val alertTitle = "Your Turn is Coming Soon!"
                                                            val alertBody = when {
                                                                item.status == "inside" -> "You are currently called inside (Position 1). Please proceed to the consultation room."
                                                                isFirstPos -> "You are at position 1. You are next in line \u2014 please be ready at the consultation room!"
                                                                peopleAheadCount == 1 -> "You are at position $pos. Only 1 person is ahead of you in the queue."
                                                                else -> "You are at position $pos. Only $peopleAheadCount people are ahead of you in the queue."
                                                            }
                                                            val rightTimeText = when {
                                                                isFirstPos -> "Your turn, arrive fast"
                                                                timing.expectedExactTimeText.isNotBlank() &&
                                                                timing.expectedExactTimeText != "Wait a few moments" -> timing.expectedExactTimeText
                                                                else -> item.appointmentTime.ifBlank { "Soon, be ready" }
                                                            }
                                                            val leftTimeText = when {
                                                                isFirstPos -> "Arrive Fast"
                                                                else -> timing.estimatedTimeLeftText.ifBlank { "Soon, be ready" }
                                                            }
                                                            val sentOk = queueRepository?.sendManualNotification(
                                                                appointmentId = item.appointmentId,
                                                                title = alertTitle,
                                                                message = alertBody,
                                                                trackingCode = item.trackingCode,
                                                                estimatedTimeLeft = leftTimeText,
                                                                expectedTime = rightTimeText,
                                                                leftLabel = "Estimated Time",
                                                                rightLabel = if (isFirstPos) "Turn Status" else "Your Appointment"
                                                            ) ?: false
                                                            notificationSentMessage = if (sentOk) {
                                                                "✓ Push alert sent to ${item.patientName} (Pos #$pos)."
                                                            } else {
                                                                "⚠ Could not deliver push alert for ${item.patientName}. Please retry."
                                                            }
                                                        }
                                                    },
                                                    modifier = Modifier.weight(1f),
                                                    shape = RoundedCornerShape(8.dp),
                                                    contentPadding = PaddingValues(horizontal = 8.dp, vertical = 8.dp)
                                                ) {
                                                    Icon(Icons.Default.Notifications, contentDescription = null, modifier = Modifier.size(15.dp))
                                                    Spacer(modifier = Modifier.width(4.dp))
                                                    Text("Send Alert", fontSize = 11.5.sp, fontWeight = FontWeight.SemiBold)
                                                }
                                            }


                                            // No Show Button
                                            if (item.status == "waiting") {
                                                OutlinedButton(
                                                    onClick = {
                                                        optimisticallyUpdateStatus(item.id, "no_show")
                                                        coroutineScope.launch {
                                                            queueRepository?.updateQueueStatus(item.id, "no_show", effectiveClinicId)
                                                            loadQueue()
                                                        }
                                                    },
                                                    colors = ButtonDefaults.outlinedButtonColors(contentColor = Color(0xFFDC2626)),
                                                    border = BorderStroke(1.dp, Color(0xFFFCA5A5)),
                                                    modifier = Modifier.weight(0.9f),
                                                    shape = RoundedCornerShape(8.dp),
                                                    contentPadding = PaddingValues(horizontal = 6.dp, vertical = 8.dp)
                                                ) {
                                                    Text("No Show", fontSize = 11.5.sp, fontWeight = FontWeight.SemiBold)
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
        }

    // Direct Queue Position Change Dialog (Tap # on badge)
    if (reorderItemDialog != null) {
        val target = reorderItemDialog!!
        val liveCount = queueItems.count { it.status == "waiting" || it.status == "inside" }
        AlertDialog(
            onDismissRequest = { reorderItemDialog = null },
            title = {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Icon(Icons.Default.SwapVert, contentDescription = null, tint = Color(0xFF00838F))
                    Text("Change Queue Position", fontWeight = FontWeight.Bold, fontSize = 17.sp)
                }
            },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    Text(
                        text = "Move patient \"${target.patientName}\" to a new turn position in the live queue.",
                        fontSize = 13.sp,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )

                    OutlinedTextField(
                        value = newPositionInput,
                        onValueChange = { input ->
                            if (input.all { it.isDigit() }) {
                                newPositionInput = input
                            }
                        },
                        label = { Text("New Position Number (1 to $liveCount)") },
                        placeholder = { Text("e.g. 1") },
                        keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(keyboardType = androidx.compose.ui.text.input.KeyboardType.Number),
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(10.dp)
                    )

                    // Quick Jump Chips
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(6.dp)
                    ) {
                        SuggestionChip(
                            onClick = { newPositionInput = "1" },
                            label = { Text("Turn #1 (First)", fontSize = 11.sp) }
                        )
                        if (liveCount >= 2) {
                            SuggestionChip(
                                onClick = { newPositionInput = "2" },
                                label = { Text("Turn #2", fontSize = 11.sp) }
                            )
                        }
                        if (liveCount >= 3) {
                            SuggestionChip(
                                onClick = { newPositionInput = "$liveCount" },
                                label = { Text("Turn #$liveCount (Last)", fontSize = 11.sp) }
                            )
                        }
                    }
                }
            },
            confirmButton = {
                Button(
                    onClick = {
                        val enteredPos = newPositionInput.toIntOrNull()
                        if (enteredPos != null && enteredPos in 1..liveCount) {
                            moveItemToPosition(target, enteredPos)
                            reorderItemDialog = null
                            longPressedItemId = null
                        }
                    },
                    shape = RoundedCornerShape(8.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF00838F)),
                    enabled = newPositionInput.toIntOrNull() != null && (newPositionInput.toIntOrNull() ?: 0) in 1..liveCount
                ) {
                    Text("Update Position")
                }
            },
            dismissButton = {
                TextButton(onClick = { reorderItemDialog = null }) {
                    Text("Cancel")
                }
            }
        )
    }

    // Clinical Remark Dialog
    if (remarkTargetItem != null) {
        val target = remarkTargetItem!!
        AlertDialog(
            onDismissRequest = { remarkTargetItem = null },
            title = {
                Column {
                    Text(
                        text = if (remarksMap[target.appointmentId]?.isNotBlank() == true) "Edit Clinical Remark" else "Add Clinical Remark",
                        fontWeight = FontWeight.Bold,
                        fontSize = 17.sp,
                        color = Color(0xFF0F172A)
                    )
                    Spacer(Modifier.height(2.dp))
                    Text(
                        text = "For ${target.patientName} \u2022 App ID: ${target.trackingCode}",
                        fontSize = 12.sp,
                        color = Color(0xFF64748B)
                    )
                }
            },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedTextField(
                        value = remarkInputText,
                        onValueChange = { remarkInputText = it },
                        placeholder = { Text("Enter diagnosis, treatment advice, prescription, or clinical remarks...") },
                        modifier = Modifier.fillMaxWidth(),
                        minLines = 3,
                        maxLines = 6,
                        shape = RoundedCornerShape(12.dp)
                    )
                }
            },
            confirmButton = {
                Button(
                    onClick = {
                        val apptId = target.appointmentId
                        val textToSave = remarkInputText.trim()
                        coroutineScope.launch {
                            isSavingRemark = true
                            try {
                                billingRepository?.saveRemarkForAppointment(apptId, effectiveClinicId, textToSave)
                                remarksMap = remarksMap + (apptId to textToSave)
                            } catch (e: Exception) {
                                e.printStackTrace()
                            } finally {
                                isSavingRemark = false
                                remarkTargetItem = null
                            }
                        }
                    },
                    enabled = !isSavingRemark,
                    shape = RoundedCornerShape(10.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF00838F))
                ) {
                    Text(if (isSavingRemark) "Saving..." else "Save Remark", fontWeight = FontWeight.Bold)
                }
            },
            dismissButton = {
                TextButton(
                    onClick = { remarkTargetItem = null },
                    enabled = !isSavingRemark
                ) {
                    Text("Cancel", color = Color(0xFF64748B))
                }
            },
            containerColor = Color.White,
            shape = RoundedCornerShape(16.dp)
        )
    }



    if (showAutoNoShowDialog) {
        val waitingPatientsCount = liveQueue.count { it.status == "waiting" }
        AlertDialog(
            onDismissRequest = { if (!isAutoNoShowProcessing) showAutoNoShowDialog = false },
            icon = {
                Icon(
                    Icons.Default.EventBusy,
                    contentDescription = null,
                    tint = Color(0xFFDC2626),
                    modifier = Modifier.size(32.dp)
                )
            },
            title = {
                Text(
                    text = "Transfer to No-Show",
                    fontWeight = FontWeight.Bold,
                    fontSize = 18.sp
                )
            },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(
                        text = if (waitingPatientsCount > 0) {
                            "Are you sure you want to transfer $waitingPatientsCount uncompleted waiting patient(s) in the live queue to No-Show?\n\nThey will be removed from the active queue and added to the No-Show Manager where they can be audited or rescheduled."
                        } else {
                            "There are no waiting patients currently in the live queue for today. Tapping confirm will audit all past uncompleted visits across the clinic and transfer them to No-Show."
                        },
                        fontSize = 13.sp,
                        color = Color(0xFF475569)
                    )
                }
            },
            confirmButton = {
                Button(
                    onClick = {
                        coroutineScope.launch {
                            isAutoNoShowProcessing = true
                            val count = queueRepository?.autoTransferUncompletedQueueToNoShow(
                                clinicId = effectiveClinicId,
                                includeTodayExpired = (waitingPatientsCount > 0),
                                todayCutoffMinutes = 0
                            ) ?: 0
                            loadQueue()
                            isAutoNoShowProcessing = false
                            showAutoNoShowDialog = false
                            notificationSentMessage = "Successfully transferred $count patient(s) to No-Show."
                        }
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFDC2626)),
                    shape = RoundedCornerShape(8.dp),
                    enabled = !isAutoNoShowProcessing
                ) {
                    if (isAutoNoShowProcessing) {
                        CircularProgressIndicator(
                            color = Color.White,
                            modifier = Modifier.size(16.dp),
                            strokeWidth = 2.dp
                        )
                    } else {
                        Text("Confirm Transfer", fontWeight = FontWeight.Bold)
                    }
                }
            },
            dismissButton = {
                TextButton(
                    onClick = { showAutoNoShowDialog = false },
                    enabled = !isAutoNoShowProcessing
                ) {
                    Text("Cancel", color = Color(0xFF64748B))
                }
            }
        )
    }

}
}
