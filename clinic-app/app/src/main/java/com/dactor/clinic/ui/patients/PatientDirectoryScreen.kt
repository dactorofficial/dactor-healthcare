package com.dactor.clinic.ui.patients

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
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
import androidx.compose.ui.window.DialogProperties
import androidx.navigation.NavController
import com.dactor.clinic.data.local.UserSessionManager
import com.dactor.clinic.data.model.Appointment
import com.dactor.clinic.data.model.Clinic
import com.dactor.clinic.data.model.Doctor
import com.dactor.clinic.data.model.Profile
import com.dactor.clinic.data.model.Slot
import com.dactor.clinic.data.repository.*
import com.dactor.clinic.domain.util.TrackingCodeGenerator
import com.dactor.clinic.ui.navigation.NavRoutes
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import java.time.LocalDate
import java.time.format.DateTimeFormatter

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PatientDirectoryScreen(
    navController: NavController,
    clinicId: String = "",
    authRepository: AuthRepository? = null,
    appointmentRepository: AppointmentRepository? = null,
    doctorRepository: DoctorRepository? = null,
    billingRepository: BillingRepository? = null,
    clinicRepository: ClinicRepository? = null,
    slotRepository: SlotRepository? = null,
    sessionManager: UserSessionManager? = null,
    queueRepository: QueueRepository? = null
) {
    val context = LocalContext.current
    val clipboardManager = LocalClipboardManager.current
    val effectiveSessionManager = sessionManager ?: remember { UserSessionManager(context) }
    var userRole by remember { mutableStateOf(effectiveSessionManager.getUserRole() ?: "clinic") }
    var savedDoctorId by remember { mutableStateOf(effectiveSessionManager.getSavedDoctorId() ?: "") }
    val effectiveClinicId = remember(clinicId) {
        if (clinicId.isNotBlank() && clinicId != "c1") clinicId
        else effectiveSessionManager.getSavedClinicId() ?: ""
    }
    val defaultClinicName = remember(context) {
        effectiveSessionManager.getSavedName()?.takeIf { it.isNotBlank() } ?: "Solecito Ve"
    }

    var selectedTab by remember { mutableIntStateOf(0) } // 0: Live OPD Queue, 1: Patient Directory, 2: Datewise Visits
    var selectedVisitDate by remember { mutableStateOf(LocalDate.now()) }
    var datewiseSearchQuery by remember { mutableStateOf("") }
    var showDatePickerDialog by remember { mutableStateOf(false) }
    val directoryPrefs = remember(context) {
        context.getSharedPreferences("clinic_patient_directory", android.content.Context.MODE_PRIVATE)
    }
    var appointments by remember(effectiveClinicId) { mutableStateOf<List<Appointment>>(emptyList()) }
    var locallyAddedProfiles by remember(effectiveClinicId) {
        val savedRaw = directoryPrefs.getString("records_${effectiveClinicId.ifBlank { "default" }}", "") ?: ""
        val loaded = savedRaw.split("\n").mapNotNull { line ->
            val parts = line.split("|")
            if (parts.size >= 5 && parts[0].isNotBlank()) {
                Profile(
                    id = parts[0],
                    authUid = null,
                    email = parts.getOrNull(4) ?: "",
                    fullName = parts[1],
                    role = "patient",
                    phone = parts[2],
                    gender = parts[3].ifBlank { "Male" },
                    age = parts.getOrNull(5)?.toIntOrNull()
                )
            } else null
        }
        mutableStateOf(loaded)
    }
    var affiliatedDoctors by remember(effectiveClinicId) { mutableStateOf<List<Doctor>>(emptyList()) }
    var allClinicsMap by remember(effectiveClinicId) { mutableStateOf<Map<String, Clinic>>(emptyMap()) }
    var currentClinic by remember(effectiveClinicId) { mutableStateOf<Clinic?>(null) }
    var remarksMap by remember(effectiveClinicId) { mutableStateOf<Map<String, String>>(emptyMap()) }

    var actionMessage by remember { mutableStateOf<String?>(null) }
    var isOperating by remember { mutableStateOf(false) }
    var searchQuery by remember { mutableStateOf("") }

    // Patient History & Details Modal State
    var selectedPatientForDetails by remember { mutableStateOf<PatientDetailItem?>(null) }
    var patientFullHistoryAppts by remember { mutableStateOf<List<Appointment>>(emptyList()) }
    var isLoadingHistory by remember { mutableStateOf(false) }

    // Editable Remark State
    var editingApptRemark by remember { mutableStateOf<Appointment?>(null) }
    var remarkTextValue by remember { mutableStateOf("") }
    var isSavingRemark by remember { mutableStateOf(false) }

    // Reschedule / Edit Visit Date State
    var editingApptSchedule by remember { mutableStateOf<Appointment?>(null) }
    var newVisitDateInput by remember { mutableStateOf("") }
    var newVisitTimeInput by remember { mutableStateOf("") }
    var rescheduleDoctorId by remember { mutableStateOf("") }
    var selectedRescheduleSlotId by remember { mutableStateOf<String?>(null) }
    var availableRescheduleSlots by remember { mutableStateOf<List<Slot>>(emptyList()) }
    var isLoadingRescheduleSlots by remember { mutableStateOf(false) }
    var showRescheduleDatePicker by remember { mutableStateOf(false) }
    var isSavingSchedule by remember { mutableStateOf(false) }

    LaunchedEffect(newVisitDateInput, rescheduleDoctorId, editingApptSchedule) {
        if (editingApptSchedule != null && slotRepository != null && effectiveClinicId.isNotBlank() && newVisitDateInput.isNotBlank()) {
            isLoadingRescheduleSlots = true
            try {
                val slots = slotRepository.getSlots(effectiveClinicId, newVisitDateInput)
                availableRescheduleSlots = if (rescheduleDoctorId.isNotBlank()) {
                    slots.filter { it.doctorId == rescheduleDoctorId }
                } else slots
            } catch (_: Exception) {
                availableRescheduleSlots = emptyList()
            } finally {
                isLoadingRescheduleSlots = false
            }
        } else {
            availableRescheduleSlots = emptyList()
        }
    }

    // Schedule Next Visit (Multi-Type Clinic) Dialog State
    var showScheduleDialogForPatient by remember { mutableStateOf<PatientDetailItem?>(null) }
    var scheduleDoctorId by remember { mutableStateOf("") }
    var scheduleDateInput by remember { mutableStateOf(LocalDate.now().plusDays(1).toString()) }
    var scheduleTimeInput by remember { mutableStateOf("10:00 AM") }
    var scheduleRemarksInput by remember { mutableStateOf("") }
    var isScheduling by remember { mutableStateOf(false) }

    // Add Patient Dialog State
    var showRegisterPatientDialog by remember { mutableStateOf(false) }
    var newPatientName by remember { mutableStateOf("") }
    var newPatientPhone by remember { mutableStateOf("") }
    var newPatientAge by remember { mutableStateOf("") }
    var newPatientGender by remember { mutableStateOf("Male") }
    var newPatientEmail by remember { mutableStateOf("") }
    var generatedApptIdPreview by remember { mutableStateOf(TrackingCodeGenerator.generate()) }
    var isRegistering by remember { mutableStateOf(false) }
    var registerError by remember { mutableStateOf<String?>(null) }

    val today = remember { LocalDate.now().toString() }
    val coroutineScope = rememberCoroutineScope()

    fun getDeterministicAppointmentId(patientId: String): String {
        val h1 = Math.abs(patientId.hashCode().toLong())
        val h2 = Math.abs(patientId.reversed().hashCode().toLong())
        val num = (h1 * 100000L + (h2 % 100000L)) % 9000000000L + 1000000000L
        return num.toString()
    }

    suspend fun loadData() {
        try {
            val savedRaw = directoryPrefs.getString("records_${effectiveClinicId.ifBlank { "default" }}", "") ?: ""
            val loaded = savedRaw.split("\n").mapNotNull { line ->
                val parts = line.split("|")
                if (parts.size >= 5 && parts[0].isNotBlank()) {
                    Profile(
                        id = parts[0],
                        authUid = null,
                        email = parts.getOrNull(4) ?: "",
                        fullName = parts[1],
                        role = "patient",
                        phone = parts[2],
                        gender = parts[3].ifBlank { "Male" },
                        age = parts.getOrNull(5)?.toIntOrNull()
                    )
                } else null
            }
            locallyAddedProfiles = loaded
        } catch (_: Exception) {}

        if (clinicRepository != null) {
            try {
                val clinics = clinicRepository.getClinics()
                allClinicsMap = clinics.associateBy { it.id }
                if (effectiveClinicId.isNotBlank()) {
                    currentClinic = clinics.find { it.id == effectiveClinicId }
                }
            } catch (e: Exception) {
                e.printStackTrace()
            }
        }

        // Patient directory is strictly clinic-scoped: only patients with confirmed/approved clinic appointments or local desk registrations are included

        if (appointmentRepository != null) {
            val isDocMode = userRole == "doctor" && savedDoctorId.isNotBlank()
            val docIdToUse = savedDoctorId

            val fetched = if (isDocMode && docIdToUse.isNotBlank()) {
                appointmentRepository.getAppointmentsByDoctor(docIdToUse)
            } else {
                val cId = if (effectiveClinicId.isNotBlank()) effectiveClinicId
                else effectiveSessionManager.getSavedClinicId() ?: ""
                if (cId.isNotBlank()) {
                    if (doctorRepository != null) {
                        affiliatedDoctors = doctorRepository.getDoctorsByClinic(cId)
                    }
                    appointmentRepository.getAppointmentsByClinic(cId)
                } else emptyList()
            }
            // Strict Clinic Directory Guard: Only APPROVED appointments belong in the Clinic Directory & Live OPD Queue
            val approvedOnly = fetched.filter {
                it.status.equals("APPROVED", ignoreCase = true) &&
                it.status != "WAITING_FOR_APPROVAL" &&
                it.status != "pending_payment" &&
                it.status != "UNAPPROVED" &&
                it.status != "EXPIRED" &&
                it.checkinStatus != "cancelled"
            }
            appointments = approvedOnly

            // Load remarks in batch
            if (billingRepository != null && fetched.isNotEmpty()) {
                val apptIds = fetched.map { it.id }
                val map = billingRepository.getRemarksForAppointments(apptIds)
                remarksMap = map
            }
        }
    }

    LaunchedEffect(effectiveClinicId, savedDoctorId, userRole, clinicId) {
        while (isActive) {
            loadData()
            delay(5000L)
        }
    }

    // Determine if current clinic is a multi-type / polyclinic
    val isMultiTypeClinic = remember(currentClinic) {
        val type = currentClinic?.type?.lowercase() ?: ""
        type.contains("multi") || type.contains("poly") || type.contains("hospital") || type.contains("center") || currentClinic?.specialties?.size ?: 0 > 1
    }

    // Queue / in-consultation appointments for Tab 0 (Only APPROVED appointments enter live queue)
    val inConsultationAppts = remember(appointments) {
        appointments.filter {
            it.checkinStatus != "completed" &&
            it.checkinStatus != "cancelled" &&
            it.status.equals("APPROVED", ignoreCase = true) &&
            it.status != "WAITING_FOR_APPROVAL" &&
            it.status != "pending_payment" &&
            it.status != "UNAPPROVED" &&
            it.status != "EXPIRED"
        }
    }

    // Filtered lists for Tab 0 (Live Queue)
    val filteredLiveQueue = remember(inConsultationAppts, searchQuery) {
        if (searchQuery.isBlank()) inConsultationAppts
        else {
            val q = searchQuery.trim().lowercase()
            inConsultationAppts.filter { appt ->
                appt.patientName.lowercase().contains(q) ||
                appt.patientMobile.contains(q) ||
                (appt.patientEmail?.lowercase()?.contains(q) == true) ||
                appt.trackingCode10Digit.contains(q) ||
                appt.id.lowercase().contains(q)
            }
        }
    }

    // Filtered list for Tab 1 (All Patients Directory for current clinic)
    // Distinct Directory Entries for Tab 1 (All Patients Directory for current clinic)
    // Appointments are never combined across different appointment IDs; each discrete appointment has its own record
    val allDirectoryProfiles = remember(locallyAddedProfiles, appointments) {
        val list = mutableListOf<Profile>()
        val seenApptIds = mutableSetOf<String>()

        // 1. Only APPROVED appointments belong in the Patient Directory
        appointments.filter {
            it.status.equals("APPROVED", ignoreCase = true) &&
            it.status != "WAITING_FOR_APPROVAL" &&
            it.status != "pending_payment" &&
            it.status != "UNAPPROVED" &&
            it.status != "EXPIRED" &&
            it.checkinStatus != "cancelled"
        }.forEach { appt ->
            if (appt.id !in seenApptIds) {
                seenApptIds.add(appt.id)
                list.add(
                    Profile(
                        id = appt.id,
                        authUid = null,
                        email = appt.patientEmail ?: "",
                        fullName = appt.patientName,
                        role = "patient",
                        phone = appt.patientMobile,
                        gender = appt.patientGender ?: "Male",
                        age = appt.patientAge
                    )
                )
            }
        }

        // 2. Standalone locally added profiles from desk registration (who haven't booked an online appt yet)
        val existingPhones = appointments.map { it.patientMobile.trim() }.filter { it.isNotBlank() }.toSet()
        locallyAddedProfiles.forEach { p ->
            val hasAppt = (!p.phone.isNullOrBlank() && p.phone!!.trim() in existingPhones)
            if (!hasAppt && list.none { it.id == p.id }) {
                list.add(p)
            }
        }
        list
    }

    val filteredProfiles = remember(allDirectoryProfiles, appointments, searchQuery) {
        if (searchQuery.isBlank()) allDirectoryProfiles
        else {
            val q = searchQuery.trim().lowercase()
            allDirectoryProfiles.filter { p ->
                val appt = appointments.find { it.id == p.id }
                val apptCode = appt?.trackingCode10Digit ?: getDeterministicAppointmentId(p.id)
                val apptDoctor = appt?.doctorId?.let { dId -> affiliatedDoctors.find { it.id == dId }?.fullName }
                (p.fullName?.lowercase()?.contains(q) == true) ||
                (p.phone?.contains(q) == true) ||
                p.id.lowercase().contains(q) ||
                p.email.lowercase().contains(q) ||
                apptCode.lowercase().contains(q) ||
                (apptDoctor?.lowercase()?.contains(q) == true)
            }
        }
    }

    // Filtered & Chronologically Sorted Appointments for Tab 2 (Datewise Visits in Checking Order)
    val selectedVisitDateStr = remember(selectedVisitDate) { selectedVisitDate.toString() }
    val datewiseAppointmentsForDay = remember(appointments, selectedVisitDateStr) {
        appointments.filter {
            it.appointmentDate == selectedVisitDateStr &&
            it.status.equals("APPROVED", ignoreCase = true) &&
            it.status != "WAITING_FOR_APPROVAL" &&
            it.status != "pending_payment" &&
            it.status != "UNAPPROVED" &&
            it.status != "EXPIRED" &&
            it.checkinStatus != "cancelled"
        }
    }

    // Sort strictly in checking order: who was checked first appears first
    val sortedDatewiseAppointments = remember(datewiseAppointmentsForDay) {
        datewiseAppointmentsForDay.sortedWith(
            compareBy<Appointment> { appt ->
                when (appt.checkinStatus?.lowercase()) {
                    "completed", "done", "visited" -> 0
                    "in_consultation", "consulting", "inside" -> 1
                    "waiting", "checked_in" -> 2
                    else -> 3
                }
            }.thenBy { appt ->
                appt.appointmentTime
            }
        )
    }

    val filteredDatewiseAppointments = remember(sortedDatewiseAppointments, datewiseSearchQuery, searchQuery) {
        val q = if (datewiseSearchQuery.isNotBlank()) datewiseSearchQuery.trim().lowercase()
                else searchQuery.trim().lowercase()
        if (q.isBlank()) sortedDatewiseAppointments
        else {
            sortedDatewiseAppointments.filter { appt ->
                appt.patientName.lowercase().contains(q) ||
                appt.patientMobile.contains(q) ||
                (appt.patientEmail?.lowercase()?.contains(q) == true) ||
                appt.trackingCode10Digit.contains(q) ||
                appt.id.lowercase().contains(q) ||
                (remarksMap[appt.id]?.lowercase()?.contains(q) == true) ||
                (affiliatedDoctors.find { d -> d.id == appt.doctorId }?.fullName?.lowercase()?.contains(q) == true)
            }
        }
    }

    fun openPatientHistory(item: PatientDetailItem) {
        selectedPatientForDetails = item
        coroutineScope.launch {
            isLoadingHistory = true
            patientFullHistoryAppts = if (item.currentAppointment != null) {
                // Strictly isolate appointments by 10-digit Appointment ID (trackingCode)
                // Appointments with different appointment IDs from the same clinic must NEVER be grouped into the same history
                if (item.trackingCode.isNotBlank() && appointmentRepository != null) {
                    val sameCode = appointmentRepository.getAllAppointmentsByTrackingCode(item.trackingCode)
                        .filter {
                            it.status.equals("APPROVED", ignoreCase = true) &&
                            it.status != "WAITING_FOR_APPROVAL" &&
                            it.status != "pending_payment" &&
                            it.status != "UNAPPROVED" &&
                            it.status != "EXPIRED" &&
                            it.checkinStatus != "cancelled"
                        }
                    sameCode.ifEmpty { listOf(item.currentAppointment) }
                } else {
                    listOf(item.currentAppointment)
                }
            } else if (appointmentRepository != null && item.trackingCode.isNotBlank()) {
                appointmentRepository.getAllAppointmentsByTrackingCode(item.trackingCode).filter {
                    it.status.equals("APPROVED", ignoreCase = true) &&
                    it.status != "WAITING_FOR_APPROVAL" &&
                    it.status != "pending_payment" &&
                    it.status != "UNAPPROVED" &&
                    it.status != "EXPIRED" &&
                    it.checkinStatus != "cancelled"
                }
            } else emptyList()

            // Fetch remarks for these patient history appointments
            if (billingRepository != null && patientFullHistoryAppts.isNotEmpty()) {
                val historyIds = patientFullHistoryAppts.map { it.id }
                val fetchedRemarks = billingRepository.getRemarksForAppointments(historyIds)
                remarksMap = remarksMap + fetchedRemarks
            }
            isLoadingHistory = false
        }
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(
                Brush.verticalGradient(
                    colors = listOf(
                        Color(0xFFF8FAFC),
                        Color(0xFFF1F5F9),
                        Color(0xFFE0F2FE).copy(alpha = 0.35f)
                    )
                )
            )
    ) {
        Scaffold(
            containerColor = Color.Transparent,
            topBar = {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .statusBarsPadding()
                        .padding(horizontal = 16.dp, vertical = 6.dp)
                ) {
                    // Top Clinic Pill Tag Matching Template (e.g. Solecito Ve)
                    Surface(
                        color = Color(0xFF0F4C81),
                        shape = RoundedCornerShape(8.dp),
                        modifier = Modifier.padding(bottom = 6.dp)
                    ) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(4.dp),
                            modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp)
                        ) {
                            Icon(
                                Icons.Default.LocalHospital,
                                contentDescription = null,
                                tint = Color.White,
                                modifier = Modifier.size(11.dp)
                            )
                            Text(
                                text = currentClinic?.name ?: defaultClinicName,
                                color = Color.White,
                                fontSize = 11.sp,
                                fontWeight = FontWeight.SemiBold
                            )
                        }
                    }

                    // Main Top App Bar Row
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(10.dp),
                            modifier = Modifier.weight(1f)
                        ) {
                            IconButton(
                                onClick = { navController.popBackStack() },
                                modifier = Modifier.size(36.dp)
                            ) {
                                Icon(
                                    Icons.AutoMirrored.Filled.ArrowBack,
                                    contentDescription = "Back",
                                    tint = Color(0xFF0F172A),
                                    modifier = Modifier.size(24.dp)
                                )
                            }
                            Text(
                                text = "Patient Records Directory",
                                fontWeight = FontWeight.Bold,
                                fontSize = 19.sp,
                                color = Color(0xFF0F172A)
                            )
                        }

                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                            IconButton(
                                onClick = {
                                    newPatientName = ""
                                    newPatientPhone = ""
                                    newPatientAge = ""
                                    newPatientGender = "Male"
                                    newPatientEmail = ""
                                    registerError = null
                                    generatedApptIdPreview = TrackingCodeGenerator.generate()
                                    showRegisterPatientDialog = true
                                },
                                modifier = Modifier.size(36.dp)
                            ) {
                                Icon(Icons.Default.PersonAdd, contentDescription = "Add Patient", tint = Color(0xFF0097A7))
                            }

                            IconButton(
                                onClick = { coroutineScope.launch { loadData() } },
                                modifier = Modifier.size(36.dp)
                            ) {
                                Icon(Icons.Default.Refresh, contentDescription = "Refresh", tint = Color(0xFF475569))
                            }
                        }
                    }
                }
            },
            floatingActionButton = {
                ExtendedFloatingActionButton(
                    onClick = {
                        newPatientName = ""
                        newPatientPhone = ""
                        newPatientAge = ""
                        newPatientGender = "Male"
                        newPatientEmail = ""
                        registerError = null
                        generatedApptIdPreview = TrackingCodeGenerator.generate()
                        showRegisterPatientDialog = true
                    },
                    icon = { Icon(Icons.Default.PersonAdd, contentDescription = null, tint = Color.White) },
                    text = { Text("Add Patient", fontWeight = FontWeight.Bold, color = Color.White) },
                    shape = RoundedCornerShape(16.dp),
                    containerColor = Color(0xFF0097A7)
                )
            }
        ) { padding ->
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(padding)
                    .padding(horizontal = 16.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                // Action Feedback Banner
                if (actionMessage != null) {
                    Surface(
                        color = Color(0xFFDCFCE7),
                        shape = RoundedCornerShape(12.dp),
                        border = BorderStroke(1.dp, Color(0xFF86EFAC)),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Row(
                            modifier = Modifier.padding(12.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            Icon(Icons.Default.CheckCircle, contentDescription = null, tint = Color(0xFF15803D), modifier = Modifier.size(18.dp))
                            Text(actionMessage ?: "", fontSize = 12.sp, fontWeight = FontWeight.Medium, color = Color(0xFF166534), modifier = Modifier.weight(1f))
                            IconButton(onClick = { actionMessage = null }, modifier = Modifier.size(20.dp)) {
                                Icon(Icons.Default.Close, contentDescription = "Dismiss", tint = Color(0xFF166534), modifier = Modifier.size(16.dp))
                            }
                        }
                    }
                }

                // ── Three Segmented Tabs: Live Queue, Patient Directory, Datewise Visits ──
                Surface(
                    shape = RoundedCornerShape(16.dp),
                    color = Color.White,
                    border = BorderStroke(1.dp, Color(0xFFE2E8F0)),
                    shadowElevation = 1.dp,
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(4.dp),
                        horizontalArrangement = Arrangement.spacedBy(4.dp)
                    ) {
                        // Tab 0: Live OPD Queue
                        val isTab0 = selectedTab == 0
                        Surface(
                            onClick = { selectedTab = 0 },
                            shape = RoundedCornerShape(12.dp),
                            color = if (isTab0) Color(0xFFE0F7FA).copy(alpha = 0.5f) else Color.Transparent,
                            modifier = Modifier.weight(1f)
                        ) {
                            Column(
                                horizontalAlignment = Alignment.CenterHorizontally,
                                modifier = Modifier.padding(vertical = 8.dp)
                            ) {
                                Row(
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(4.dp)
                                ) {
                                    Icon(
                                        Icons.Default.Groups,
                                        contentDescription = null,
                                        tint = if (isTab0) Color(0xFF0097A7) else Color(0xFF64748B),
                                        modifier = Modifier.size(17.dp)
                                    )
                                    Text(
                                        text = "Live Queue\n(${inConsultationAppts.size})",
                                        fontWeight = if (isTab0) FontWeight.Bold else FontWeight.Medium,
                                        fontSize = 11.5.sp,
                                        lineHeight = 14.sp,
                                        textAlign = TextAlign.Center,
                                        color = if (isTab0) Color(0xFF00838F) else Color(0xFF475569)
                                    )
                                }
                                if (isTab0) {
                                    Spacer(Modifier.height(3.dp))
                                    Box(
                                        modifier = Modifier
                                            .width(60.dp)
                                            .height(2.5.dp)
                                            .background(Color(0xFF0097A7), RoundedCornerShape(2.dp))
                                    )
                                }
                            }
                        }

                        // Tab 1: All Patients Directory
                        val isTab1 = selectedTab == 1
                        Surface(
                            onClick = { selectedTab = 1 },
                            shape = RoundedCornerShape(12.dp),
                            color = if (isTab1) Color(0xFFE0F7FA).copy(alpha = 0.5f) else Color.Transparent,
                            modifier = Modifier.weight(1f)
                        ) {
                            Column(
                                horizontalAlignment = Alignment.CenterHorizontally,
                                modifier = Modifier.padding(vertical = 8.dp)
                            ) {
                                Row(
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(4.dp)
                                ) {
                                    Icon(
                                        Icons.Default.FolderShared,
                                        contentDescription = null,
                                        tint = if (isTab1) Color(0xFF0097A7) else Color(0xFF64748B),
                                        modifier = Modifier.size(16.dp)
                                    )
                                    Text(
                                        text = "Directory\n(${allDirectoryProfiles.size})",
                                        fontWeight = if (isTab1) FontWeight.Bold else FontWeight.Medium,
                                        fontSize = 11.5.sp,
                                        lineHeight = 14.sp,
                                        textAlign = TextAlign.Center,
                                        color = if (isTab1) Color(0xFF00838F) else Color(0xFF475569)
                                    )
                                }
                                if (isTab1) {
                                    Spacer(Modifier.height(3.dp))
                                    Box(
                                        modifier = Modifier
                                            .width(60.dp)
                                            .height(2.5.dp)
                                            .background(Color(0xFF0097A7), RoundedCornerShape(2.dp))
                                    )
                                }
                            }
                        }

                        // Tab 2: Datewise Visits
                        val isTab2 = selectedTab == 2
                        Surface(
                            onClick = { selectedTab = 2 },
                            shape = RoundedCornerShape(12.dp),
                            color = if (isTab2) Color(0xFFE0F7FA).copy(alpha = 0.5f) else Color.Transparent,
                            modifier = Modifier.weight(1f)
                        ) {
                            Column(
                                horizontalAlignment = Alignment.CenterHorizontally,
                                modifier = Modifier.padding(vertical = 8.dp)
                            ) {
                                Row(
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(4.dp)
                                ) {
                                    Icon(
                                        Icons.Default.CalendarMonth,
                                        contentDescription = null,
                                        tint = if (isTab2) Color(0xFF0097A7) else Color(0xFF64748B),
                                        modifier = Modifier.size(16.dp)
                                    )
                                    Text(
                                        text = "Date Visits\n(${datewiseAppointmentsForDay.size})",
                                        fontWeight = if (isTab2) FontWeight.Bold else FontWeight.Medium,
                                        fontSize = 11.5.sp,
                                        lineHeight = 14.sp,
                                        textAlign = TextAlign.Center,
                                        color = if (isTab2) Color(0xFF00838F) else Color(0xFF475569)
                                    )
                                }
                                if (isTab2) {
                                    Spacer(Modifier.height(3.dp))
                                    Box(
                                        modifier = Modifier
                                            .width(60.dp)
                                            .height(2.5.dp)
                                            .background(Color(0xFF0097A7), RoundedCornerShape(2.dp))
                                    )
                                }
                            }
                        }
                    }
                }

                // ── Search Bar Matching Template ──────────────────────────────────
                Surface(
                    shape = RoundedCornerShape(16.dp),
                    color = Color.White,
                    border = BorderStroke(1.dp, Color(0xFFE2E8F0)),
                    shadowElevation = 1.dp,
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 14.dp, vertical = 6.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(10.dp)
                    ) {
                        Icon(
                            Icons.Default.Search,
                            contentDescription = null,
                            tint = Color(0xFF0097A7),
                            modifier = Modifier.size(24.dp)
                        )

                        OutlinedTextField(
                            value = searchQuery,
                            onValueChange = { searchQuery = it },
                            placeholder = {
                                Text(
                                    "Search",
                                    fontSize = 14.sp,
                                    color = Color(0xFF94A3B8)
                                )
                            },
                            trailingIcon = {
                                if (searchQuery.isNotBlank()) {
                                    IconButton(
                                        onClick = { searchQuery = "" },
                                        modifier = Modifier.size(24.dp)
                                    ) {
                                        Icon(Icons.Default.Clear, contentDescription = "Clear", tint = Color(0xFF64748B), modifier = Modifier.size(16.dp))
                                    }
                                }
                            },
                            singleLine = false,
                            maxLines = 2,
                            colors = OutlinedTextFieldDefaults.colors(
                                focusedBorderColor = Color.Transparent,
                                unfocusedBorderColor = Color.Transparent,
                                cursorColor = Color(0xFF0097A7)
                            ),
                            modifier = Modifier.weight(1f)
                        )
                    }
                }

                // ── Content Area: Tab 0 (Live Queue), Tab 1 (Directory), or Tab 2 (Datewise Visits) ──
                if (selectedTab == 0) {
                    // TAB 0: LIVE OPD QUEUE
                    if (filteredLiveQueue.isEmpty()) {
                        Box(
                            modifier = Modifier
                                .fillMaxWidth()
                                .weight(1f)
                                .padding(vertical = 40.dp),
                            contentAlignment = Alignment.Center
                        ) {
                            Column(
                                horizontalAlignment = Alignment.CenterHorizontally,
                                verticalArrangement = Arrangement.spacedBy(8.dp)
                            ) {
                                Icon(Icons.Default.Groups, contentDescription = null, tint = Color(0xFF94A3B8), modifier = Modifier.size(50.dp))
                                Text(
                                    if (searchQuery.isNotBlank()) "No Live Patients Matching '$searchQuery'" else "No Patients in Live OPD Queue",
                                    fontWeight = FontWeight.Bold,
                                    fontSize = 16.sp,
                                    color = Color(0xFF0F172A)
                                )
                                Text(
                                    "Checked-in or queued patient consultations appear here.",
                                    fontSize = 12.sp,
                                    color = Color(0xFF64748B)
                                )
                            }
                        }
                    } else {
                        LazyColumn(
                            verticalArrangement = Arrangement.spacedBy(14.dp),
                            contentPadding = PaddingValues(bottom = 80.dp),
                            modifier = Modifier
                                .fillMaxWidth()
                                .weight(1f)
                        ) {
                            items(filteredLiveQueue, key = { it.id }) { appt ->
                                val assignedDoctor = affiliatedDoctors.find { it.id == appt.doctorId }
                                val existingRemark = remarksMap[appt.id]
                                val detailItem = PatientDetailItem(
                                    patientName = appt.patientName,
                                    age = appt.patientAge,
                                    gender = appt.patientGender ?: "Male",
                                    phone = appt.patientMobile,
                                    email = appt.patientEmail,
                                    trackingCode = appt.trackingCode10Digit,
                                    userId = appt.userId,
                                    currentAppointment = appt
                                )

                                PatientRecordCardItem(
                                    item = detailItem,
                                    doctorName = assignedDoctor?.fullName ?: "Dr. Rajanpurbey55",
                                    scheduleDate = appt.appointmentDate,
                                    scheduleTime = appt.appointmentTime,
                                    queueStatusText = "In Dr. ${(assignedDoctor?.fullName ?: "Rajanpurbey55").removePrefix("Dr. ").removePrefix("Dr.")}'s OPD Queue",
                                    badgeText = "In Doctor Queue",
                                    existingRemark = existingRemark,
                                    isMultiTypeClinic = isMultiTypeClinic,
                                    onCardClick = { openPatientHistory(detailItem) },
                                    onCopyTracking = { code ->
                                        clipboardManager.setText(AnnotatedString(code))
                                        actionMessage = "✓ Copied Appointment ID: $code to clipboard!"
                                    },
                                    onCallPatient = { phone ->
                                        try {
                                            val intent = Intent(Intent.ACTION_DIAL, Uri.parse("tel:$phone"))
                                            context.startActivity(intent)
                                        } catch (ignored: Exception) {}
                                    },
                                    onScheduleNextVisit = {
                                        showScheduleDialogForPatient = detailItem
                                        scheduleDoctorId = appt.doctorId ?: affiliatedDoctors.firstOrNull()?.id ?: ""
                                    },
                                    onOpenBilling = {
                                        navController.navigate("${NavRoutes.BillingScreen}/${appt.id}")
                                    }
                                )
                            }
                        }
                    }
                } else if (selectedTab == 1) {
                    // TAB 1: ALL PATIENTS DIRECTORY
                    if (filteredProfiles.isEmpty()) {
                        Box(
                            modifier = Modifier
                                .fillMaxWidth()
                                .weight(1f)
                                .padding(vertical = 40.dp),
                            contentAlignment = Alignment.Center
                        ) {
                            Column(
                                horizontalAlignment = Alignment.CenterHorizontally,
                                verticalArrangement = Arrangement.spacedBy(8.dp)
                            ) {
                                Icon(Icons.Default.PersonSearch, contentDescription = null, tint = Color(0xFF94A3B8), modifier = Modifier.size(50.dp))
                                Text(
                                    if (searchQuery.isNotBlank()) "No Patient Profiles Matching '$searchQuery'" else "No Patients in Directory",
                                    fontWeight = FontWeight.Bold,
                                    fontSize = 16.sp,
                                    color = Color(0xFF0F172A)
                                )
                                Text(
                                    "Tap '+ Add Patient' to register a patient record.",
                                    fontSize = 12.sp,
                                    color = Color(0xFF64748B)
                                )
                            }
                        }
                    } else {
                        LazyColumn(
                            verticalArrangement = Arrangement.spacedBy(14.dp),
                            contentPadding = PaddingValues(bottom = 80.dp),
                            modifier = Modifier
                                .fillMaxWidth()
                                .weight(1f)
                        ) {
                            items(filteredProfiles, key = { it.id }) { patient ->
                                val thisAppt = appointments.find { it.id == patient.id }
                                val deterministicApptId = remember(patient.id) { getDeterministicAppointmentId(patient.id) }
                                val assignedApptId = thisAppt?.trackingCode10Digit ?: deterministicApptId
                                val assignedDoctor = affiliatedDoctors.find { it.id == thisAppt?.doctorId }
                                val existingRemark = thisAppt?.let { remarksMap[it.id] }

                                val detailItem = PatientDetailItem(
                                    patientName = patient.fullName ?: (thisAppt?.patientName ?: "Unnamed Patient"),
                                    age = patient.age ?: thisAppt?.patientAge,
                                    gender = patient.gender ?: (thisAppt?.patientGender ?: "Male"),
                                    phone = patient.phone?.ifBlank { thisAppt?.patientMobile ?: "" } ?: (thisAppt?.patientMobile ?: ""),
                                    email = patient.email.ifBlank { thisAppt?.patientEmail },
                                    trackingCode = assignedApptId,
                                    userId = thisAppt?.userId ?: patient.id,
                                    currentAppointment = thisAppt
                                )

                                val isCompleted = thisAppt?.checkinStatus?.lowercase() in listOf("completed", "done", "visited")
                                val isCancelled = thisAppt?.checkinStatus?.lowercase() == "cancelled"

                                PatientRecordCardItem(
                                    item = detailItem,
                                    doctorName = assignedDoctor?.fullName ?: (if (thisAppt != null) "Medical Specialist" else "Unassigned"),
                                    scheduleDate = thisAppt?.appointmentDate ?: today,
                                    scheduleTime = thisAppt?.appointmentTime ?: "10:00:00",
                                    queueStatusText = when {
                                        thisAppt == null -> "Registered in Patient Directory"
                                        isCompleted -> "Visit Completed on ${thisAppt.appointmentDate}"
                                        isCancelled -> "Cancelled Appointment"
                                        else -> "In Dr. ${(assignedDoctor?.fullName ?: "Specialist").removePrefix("Dr. ").removePrefix("Dr.")}'s OPD Queue"
                                    },
                                    badgeText = when {
                                        thisAppt == null -> "Directory Record"
                                        isCompleted -> "Completed"
                                        isCancelled -> "Cancelled"
                                        else -> "In Doctor Queue"
                                    },
                                    existingRemark = existingRemark,
                                    isMultiTypeClinic = isMultiTypeClinic,
                                    onCardClick = { openPatientHistory(detailItem) },
                                    onCopyTracking = { code ->
                                        clipboardManager.setText(AnnotatedString(code))
                                        actionMessage = "✓ Copied Appointment ID: $code to clipboard!"
                                    },
                                    onCallPatient = { phone ->
                                        try {
                                            val intent = Intent(Intent.ACTION_DIAL, Uri.parse("tel:$phone"))
                                            context.startActivity(intent)
                                        } catch (ignored: Exception) {}
                                    },
                                    onScheduleNextVisit = {
                                        showScheduleDialogForPatient = detailItem
                                        scheduleDoctorId = thisAppt?.doctorId ?: affiliatedDoctors.firstOrNull()?.id ?: ""
                                    },
                                    onOpenBilling = {
                                        val targetId = thisAppt?.id ?: assignedApptId
                                        navController.navigate("${NavRoutes.BillingScreen}/$targetId")
                                    }
                                )
                            }
                        }
                    }
                } else {
                    // TAB 2: DATEWISE VISITS (in checking order who was checked first, with date controls & search)
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .weight(1f),
                        verticalArrangement = Arrangement.spacedBy(10.dp)
                    ) {
                        // 1. Date Navigation & Picker Bar
                        Surface(
                            shape = RoundedCornerShape(14.dp),
                            color = Color.White,
                            border = BorderStroke(1.dp, Color(0xFFE2E8F0)),
                            shadowElevation = 1.dp,
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(horizontal = 8.dp, vertical = 6.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.SpaceBetween
                            ) {
                                // Previous Day Button
                                IconButton(
                                    onClick = { selectedVisitDate = selectedVisitDate.minusDays(1) },
                                    modifier = Modifier.size(34.dp)
                                ) {
                                    Icon(Icons.Default.ChevronLeft, contentDescription = "Previous Day", tint = Color(0xFF0F172A), modifier = Modifier.size(22.dp))
                                }

                                // Clickable Date Center Pill (Opens DatePicker)
                                Surface(
                                    onClick = { showDatePickerDialog = true },
                                    shape = RoundedCornerShape(10.dp),
                                    color = Color(0xFFF0FDF4),
                                    border = BorderStroke(1.dp, Color(0xFFBBF7D0))
                                ) {
                                    Row(
                                        verticalAlignment = Alignment.CenterVertically,
                                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                                        modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp)
                                    ) {
                                        Icon(
                                            Icons.Default.CalendarToday,
                                            contentDescription = null,
                                            tint = Color(0xFF16A34A),
                                            modifier = Modifier.size(15.dp)
                                        )
                                        val isToday = selectedVisitDate == LocalDate.now()
                                        val dateFormatted = try {
                                            if (isToday) "${selectedVisitDate.format(DateTimeFormatter.ofPattern("d MMM yyyy"))} (Today)"
                                            else selectedVisitDate.format(DateTimeFormatter.ofPattern("EEE, d MMM yyyy"))
                                        } catch (e: Exception) {
                                            selectedVisitDate.toString()
                                        }
                                        Text(
                                            text = dateFormatted,
                                            fontWeight = FontWeight.Bold,
                                            fontSize = 13.sp,
                                            color = Color(0xFF15803D)
                                        )
                                        Icon(
                                            Icons.Default.ArrowDropDown,
                                            contentDescription = "Pick Date",
                                            tint = Color(0xFF16A34A),
                                            modifier = Modifier.size(16.dp)
                                        )
                                    }
                                }

                                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(2.dp)) {
                                    // "Today" shortcut button if not today
                                    if (selectedVisitDate != LocalDate.now()) {
                                        TextButton(
                                            onClick = { selectedVisitDate = LocalDate.now() },
                                            contentPadding = PaddingValues(horizontal = 8.dp, vertical = 2.dp),
                                            modifier = Modifier.height(30.dp)
                                        ) {
                                            Text("Today", fontSize = 11.5.sp, fontWeight = FontWeight.Bold, color = Color(0xFF0097A7))
                                        }
                                    }

                                    // Next Day Button
                                    IconButton(
                                        onClick = { selectedVisitDate = selectedVisitDate.plusDays(1) },
                                        modifier = Modifier.size(34.dp)
                                    ) {
                                        Icon(Icons.Default.ChevronRight, contentDescription = "Next Day", tint = Color(0xFF0F172A), modifier = Modifier.size(22.dp))
                                    }
                                }
                            }
                        }

                        // 2. Datewise Dedicated Search Bar
                        Surface(
                            shape = RoundedCornerShape(14.dp),
                            color = Color.White,
                            border = BorderStroke(1.dp, Color(0xFFE2E8F0)),
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(horizontal = 12.dp, vertical = 4.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(8.dp)
                            ) {
                                Icon(Icons.Default.Search, contentDescription = null, tint = Color(0xFF0097A7), modifier = Modifier.size(20.dp))
                                OutlinedTextField(
                                    value = datewiseSearchQuery,
                                    onValueChange = { datewiseSearchQuery = it },
                                    placeholder = {
                                        Text(
                                            "Search",
                                            fontSize = 13.sp,
                                            color = Color(0xFF94A3B8)
                                        )
                                    },
                                    trailingIcon = {
                                        if (datewiseSearchQuery.isNotBlank()) {
                                            IconButton(onClick = { datewiseSearchQuery = "" }, modifier = Modifier.size(20.dp)) {
                                                Icon(Icons.Default.Clear, contentDescription = "Clear", tint = Color(0xFF64748B), modifier = Modifier.size(14.dp))
                                            }
                                        }
                                    },
                                    singleLine = true,
                                    colors = OutlinedTextFieldDefaults.colors(
                                        focusedBorderColor = Color.Transparent,
                                        unfocusedBorderColor = Color.Transparent,
                                        cursorColor = Color(0xFF0097A7)
                                    ),
                                    modifier = Modifier.weight(1f)
                                )
                            }
                        }

                        // 3. Status summary banner
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text(
                                text = "Checking Order (${filteredDatewiseAppointments.size} visits):",
                                fontSize = 12.sp,
                                fontWeight = FontWeight.Bold,
                                color = Color(0xFF475569)
                            )
                            Text(
                                text = "Sorted by consultation time",
                                fontSize = 11.sp,
                                color = Color(0xFF94A3B8)
                            )
                        }

                        // 4. List of patients in checking order
                        if (filteredDatewiseAppointments.isEmpty()) {
                            Box(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .weight(1f)
                                    .padding(vertical = 30.dp),
                                contentAlignment = Alignment.Center
                            ) {
                                Column(
                                    horizontalAlignment = Alignment.CenterHorizontally,
                                    verticalArrangement = Arrangement.spacedBy(8.dp)
                                ) {
                                    Icon(Icons.Default.EventBusy, contentDescription = null, tint = Color(0xFF94A3B8), modifier = Modifier.size(48.dp))
                                    Text(
                                        text = if (datewiseSearchQuery.isNotBlank() || searchQuery.isNotBlank()) "No Visits Matching Query on This Date"
                                        else "No Patient Visits on $selectedVisitDateStr",
                                        fontWeight = FontWeight.Bold,
                                        fontSize = 15.sp,
                                        color = Color(0xFF0F172A)
                                    )
                                    Text(
                                        text = "Use the date controls above to view another day or add a walk-in patient.",
                                        fontSize = 12.sp,
                                        color = Color(0xFF64748B),
                                        textAlign = TextAlign.Center
                                    )
                                }
                            }
                        } else {
                            LazyColumn(
                                verticalArrangement = Arrangement.spacedBy(12.dp),
                                contentPadding = PaddingValues(bottom = 80.dp),
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .weight(1f)
                            ) {
                                itemsIndexed(filteredDatewiseAppointments, key = { _, appt -> appt.id }) { index, appt ->
                                    val assignedDoctor = affiliatedDoctors.find { it.id == appt.doctorId }
                                    val doctorName = assignedDoctor?.fullName ?: "Doctor"
                                    val existingRemark = remarksMap[appt.id]
                                    val isCompleted = appt.checkinStatus?.lowercase() in listOf("completed", "done", "visited")
                                    val isConsulting = appt.checkinStatus?.lowercase() in listOf("in_consultation", "consulting", "inside")

                                    val detailItem = PatientDetailItem(
                                        patientName = appt.patientName,
                                        age = appt.patientAge,
                                        gender = appt.patientGender ?: "Male",
                                        phone = appt.patientMobile,
                                        email = appt.patientEmail,
                                        trackingCode = appt.trackingCode10Digit,
                                        userId = appt.userId,
                                        currentAppointment = appt
                                    )

                                    Surface(
                                        shape = RoundedCornerShape(16.dp),
                                        color = Color.White,
                                        border = BorderStroke(1.dp, if (isCompleted) Color(0xFFBBF7D0) else Color(0xFFE2E8F0)),
                                        shadowElevation = 2.dp,
                                        modifier = Modifier
                                            .fillMaxWidth()
                                            .clickable { openPatientHistory(detailItem) }
                                    ) {
                                        Column(
                                            modifier = Modifier.padding(14.dp),
                                            verticalArrangement = Arrangement.spacedBy(10.dp)
                                        ) {
                                            // Top Row: Checking Order sequence badge + Consultation Time + Status
                                            Row(
                                                modifier = Modifier.fillMaxWidth(),
                                                horizontalArrangement = Arrangement.SpaceBetween,
                                                verticalAlignment = Alignment.CenterVertically
                                            ) {
                                                // Checking Order sequence badge
                                                Surface(
                                                    shape = RoundedCornerShape(6.dp),
                                                    color = when {
                                                        isCompleted -> Color(0xFFDCFCE7)
                                                        isConsulting -> Color(0xFFE0F2FE)
                                                        else -> Color(0xFFFEF3C7)
                                                    }
                                                ) {
                                                    Row(
                                                        verticalAlignment = Alignment.CenterVertically,
                                                        horizontalArrangement = Arrangement.spacedBy(4.dp),
                                                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp)
                                                    ) {
                                                        Icon(
                                                            when {
                                                                isCompleted -> Icons.Default.CheckCircle
                                                                isConsulting -> Icons.Default.PlayCircle
                                                                else -> Icons.Default.Schedule
                                                            },
                                                            contentDescription = null,
                                                            tint = when {
                                                                isCompleted -> Color(0xFF15803D)
                                                                isConsulting -> Color(0xFF0284C7)
                                                                else -> Color(0xFFB45309)
                                                            },
                                                            modifier = Modifier.size(13.dp)
                                                        )
                                                        Text(
                                                            text = when {
                                                                isCompleted -> "#${index + 1} Checked"
                                                                isConsulting -> "#${index + 1} In Consultation"
                                                                else -> "#${index + 1} In Queue"
                                                            },
                                                            fontSize = 11.sp,
                                                            fontWeight = FontWeight.Bold,
                                                            color = when {
                                                                isCompleted -> Color(0xFF15803D)
                                                                isConsulting -> Color(0xFF0284C7)
                                                                else -> Color(0xFFB45309)
                                                            }
                                                        )
                                                    }
                                                }

                                                // Time & Status Pill
                                                Row(
                                                    verticalAlignment = Alignment.CenterVertically,
                                                    horizontalArrangement = Arrangement.spacedBy(6.dp)
                                                ) {
                                                    Text(
                                                        text = appt.appointmentTime,
                                                        fontSize = 12.sp,
                                                        fontWeight = FontWeight.SemiBold,
                                                        color = Color(0xFF475569)
                                                    )
                                                    Surface(
                                                        shape = RoundedCornerShape(6.dp),
                                                        color = when {
                                                            isCompleted -> Color(0xFFE2E8F0)
                                                            isConsulting -> Color(0xFFCCFBF1)
                                                            else -> Color(0xFFF1F5F9)
                                                        }
                                                    ) {
                                                        Text(
                                                            text = (appt.checkinStatus ?: "SCHEDULED").uppercase(),
                                                            fontSize = 10.sp,
                                                            fontWeight = FontWeight.Bold,
                                                            color = when {
                                                                isCompleted -> Color(0xFF334155)
                                                                isConsulting -> Color(0xFF0F766E)
                                                                else -> Color(0xFF64748B)
                                                            },
                                                            modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
                                                        )
                                                    }
                                                }
                                            }

                                            // Patient Row: Avatar + Name + Subtitle + Call
                                            Row(
                                                modifier = Modifier.fillMaxWidth(),
                                                verticalAlignment = Alignment.CenterVertically,
                                                horizontalArrangement = Arrangement.spacedBy(10.dp)
                                            ) {
                                                Surface(
                                                    shape = CircleShape,
                                                    color = Color(0xFFE0F2FE),
                                                    modifier = Modifier.size(44.dp)
                                                ) {
                                                    Box(contentAlignment = Alignment.Center) {
                                                        Text(
                                                            text = appt.patientName.take(1).uppercase(),
                                                            fontWeight = FontWeight.Bold,
                                                            fontSize = 18.sp,
                                                            color = Color(0xFF0369A1)
                                                        )
                                                    }
                                                }

                                                Column(modifier = Modifier.weight(1f)) {
                                                    Text(
                                                        text = appt.patientName,
                                                        fontWeight = FontWeight.Bold,
                                                        fontSize = 16.sp,
                                                        color = Color(0xFF0F172A),
                                                        maxLines = 1,
                                                        overflow = TextOverflow.Ellipsis
                                                    )
                                                    Text(
                                                        text = "${appt.patientAge ?: "--"} yrs | ${appt.patientGender ?: "Patient"}",
                                                        fontSize = 12.sp,
                                                        color = Color(0xFF64748B)
                                                    )
                                                }

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
                                                            Text("Call", color = Color(0xFF15803D), fontSize = 11.5.sp, fontWeight = FontWeight.Bold)
                                                        }
                                                    }
                                                }
                                            }

                                            // Tracking & Doctor Row
                                            Row(
                                                modifier = Modifier.fillMaxWidth(),
                                                horizontalArrangement = Arrangement.SpaceBetween,
                                                verticalAlignment = Alignment.CenterVertically
                                            ) {
                                                Surface(
                                                    shape = RoundedCornerShape(4.dp),
                                                    color = Color(0xFFF1F5F9),
                                                    modifier = Modifier.clickable {
                                                        clipboardManager.setText(AnnotatedString(appt.trackingCode10Digit))
                                                        actionMessage = "✓ Copied Appointment ID: ${appt.trackingCode10Digit}"
                                                    }
                                                ) {
                                                    Row(
                                                        verticalAlignment = Alignment.CenterVertically,
                                                        horizontalArrangement = Arrangement.spacedBy(4.dp),
                                                        modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
                                                    ) {
                                                        Text(
                                                            text = "ID: ${appt.trackingCode10Digit}",
                                                            fontSize = 11.sp,
                                                            fontFamily = FontFamily.Monospace,
                                                            fontWeight = FontWeight.Bold,
                                                            color = Color(0xFF0284C7)
                                                        )
                                                        Icon(Icons.Default.ContentCopy, contentDescription = "Copy", tint = Color(0xFF0284C7), modifier = Modifier.size(10.dp))
                                                    }
                                                }

                                                Text(
                                                    text = "Dr. ${doctorName.removePrefix("Dr. ").removePrefix("Dr.")}",
                                                    fontSize = 12.sp,
                                                    color = Color(0xFF334155),
                                                    fontWeight = FontWeight.Medium
                                                )
                                            }

                                            // Clinical Remark / Diagnosis (if any, or button to add)
                                            if (!existingRemark.isNullOrBlank()) {
                                                Surface(
                                                    color = Color(0xFFF8FAFC),
                                                    shape = RoundedCornerShape(8.dp),
                                                    border = BorderStroke(1.dp, Color(0xFFE2E8F0)),
                                                    modifier = Modifier.fillMaxWidth()
                                                ) {
                                                    Row(
                                                        modifier = Modifier.padding(8.dp),
                                                        verticalAlignment = Alignment.CenterVertically,
                                                        horizontalArrangement = Arrangement.SpaceBetween
                                                    ) {
                                                        Column(modifier = Modifier.weight(1f)) {
                                                            Text("Clinical Notes / Diagnosis:", fontSize = 10.sp, fontWeight = FontWeight.Bold, color = Color(0xFF64748B))
                                                            Text(existingRemark, fontSize = 11.5.sp, color = Color(0xFF0F172A), maxLines = 2, overflow = TextOverflow.Ellipsis)
                                                        }
                                                        IconButton(
                                                            onClick = {
                                                                editingApptRemark = appt
                                                                remarkTextValue = existingRemark
                                                            },
                                                            modifier = Modifier.size(24.dp)
                                                        ) {
                                                            Icon(Icons.Default.Edit, contentDescription = "Edit Remark", tint = Color(0xFF0097A7), modifier = Modifier.size(13.dp))
                                                        }
                                                    }
                                                }
                                            } else {
                                                Row(
                                                    modifier = Modifier.fillMaxWidth(),
                                                    horizontalArrangement = Arrangement.End
                                                ) {
                                                    TextButton(
                                                        onClick = {
                                                            editingApptRemark = appt
                                                            remarkTextValue = ""
                                                        },
                                                        contentPadding = PaddingValues(horizontal = 6.dp, vertical = 0.dp),
                                                        modifier = Modifier.height(24.dp)
                                                    ) {
                                                        Icon(Icons.Default.EditNote, contentDescription = null, tint = Color(0xFF0097A7), modifier = Modifier.size(13.dp))
                                                        Spacer(Modifier.width(2.dp))
                                                        Text("+ Add Diagnosis / Remark", fontSize = 10.5.sp, fontWeight = FontWeight.Bold, color = Color(0xFF0097A7))
                                                    }
                                                }
                                            }

                                            // Action Buttons: Patient File & Billing
                                            Row(
                                                modifier = Modifier.fillMaxWidth(),
                                                horizontalArrangement = Arrangement.spacedBy(8.dp)
                                            ) {
                                                OutlinedButton(
                                                    onClick = { openPatientHistory(detailItem) },
                                                    shape = RoundedCornerShape(8.dp),
                                                    contentPadding = PaddingValues(horizontal = 8.dp, vertical = 4.dp),
                                                    modifier = Modifier
                                                        .weight(1f)
                                                        .height(34.dp)
                                                ) {
                                                    Icon(Icons.Default.FolderShared, contentDescription = null, tint = Color(0xFF0284C7), modifier = Modifier.size(14.dp))
                                                    Spacer(Modifier.width(4.dp))
                                                    Text("Patient File", fontSize = 11.sp, fontWeight = FontWeight.Bold, color = Color(0xFF0284C7))
                                                }

                                                Button(
                                                    onClick = { navController.navigate("${NavRoutes.BillingScreen}/${appt.id}") },
                                                    shape = RoundedCornerShape(8.dp),
                                                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF0F766E)),
                                                    contentPadding = PaddingValues(horizontal = 8.dp, vertical = 4.dp),
                                                    modifier = Modifier
                                                        .weight(1f)
                                                        .height(34.dp)
                                                ) {
                                                    Icon(Icons.Default.ReceiptLong, contentDescription = null, tint = Color.White, modifier = Modifier.size(14.dp))
                                                    Spacer(Modifier.width(4.dp))
                                                    Text("Billing", fontSize = 11.sp, fontWeight = FontWeight.Bold, color = Color.White)
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

        // =========================================================================
        // DATE PICKER DIALOG (FOR TAB 2: DATEWISE VISITS)
        // =========================================================================
        if (showDatePickerDialog) {
            android.app.DatePickerDialog(
                context,
                { _, year, month, dayOfMonth ->
                    selectedVisitDate = LocalDate.of(year, month + 1, dayOfMonth)
                },
                selectedVisitDate.year,
                selectedVisitDate.monthValue - 1,
                selectedVisitDate.dayOfMonth
            ).show()
            showDatePickerDialog = false
        }

        // Reschedule Date Picker Dialog
        if (showRescheduleDatePicker) {
            val initialDate = try {
                if (newVisitDateInput.length == 10) LocalDate.parse(newVisitDateInput) else LocalDate.now().plusDays(1)
            } catch (_: Exception) { LocalDate.now().plusDays(1) }

            android.app.DatePickerDialog(
                context,
                { _, year, month, dayOfMonth ->
                    val chosen = LocalDate.of(year, month + 1, dayOfMonth)
                    newVisitDateInput = chosen.toString()
                    selectedRescheduleSlotId = null
                    showRescheduleDatePicker = false
                },
                initialDate.year,
                initialDate.monthValue - 1,
                initialDate.dayOfMonth
            ).apply {
                datePicker.minDate = System.currentTimeMillis()
            }.show()
            showRescheduleDatePicker = false
        }

        // =========================================================================
        // FULL PATIENT HISTORY & VISITS DETAIL MODAL (Tapped Patient Card)
        // Shows Every Past Detail as per what clinic they visited + Editable Remarks
        // =========================================================================
        selectedPatientForDetails?.let { patientItem ->
            PatientFullHistoryModalDialog(
                item = patientItem,
                appointments = patientFullHistoryAppts,
                isLoading = isLoadingHistory,
                clinicsMap = allClinicsMap,
                doctors = affiliatedDoctors,
                remarksMap = remarksMap,
                isMultiTypeClinic = isMultiTypeClinic,
                onDismiss = { selectedPatientForDetails = null },
                onCopyTracking = { code ->
                    clipboardManager.setText(AnnotatedString(code))
                    actionMessage = "✓ Copied Appointment ID: $code to clipboard!"
                },
                onCallPatient = { phone ->
                    try {
                        val intent = Intent(Intent.ACTION_DIAL, Uri.parse("tel:$phone"))
                        context.startActivity(intent)
                    } catch (ignored: Exception) {}
                },
                onEditRemark = { appt, curRemark ->
                    editingApptRemark = appt
                    remarkTextValue = curRemark
                },
                onEditSchedule = { appt ->
                    editingApptSchedule = appt
                    newVisitDateInput = appt.appointmentDate
                    newVisitTimeInput = appt.appointmentTime
                    rescheduleDoctorId = appt.doctorId ?: affiliatedDoctors.firstOrNull()?.id ?: ""
                    selectedRescheduleSlotId = appt.slotId
                },
                onScheduleNewVisit = {
                    showScheduleDialogForPatient = patientItem
                    scheduleDoctorId = affiliatedDoctors.firstOrNull()?.id ?: ""
                }
            )
        }

        // =========================================================================
        // EDIT REMARKS DIALOG (Editable by Clinic & Saved Properly to Server)
        // =========================================================================
        editingApptRemark?.let { appt ->
            AlertDialog(
                onDismissRequest = { if (!isSavingRemark) editingApptRemark = null },
                title = {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Icon(Icons.Default.EditNote, contentDescription = null, tint = Color(0xFF0097A7))
                        Text("Edit Clinic Visit Remarks", fontWeight = FontWeight.Bold, fontSize = 16.sp)
                    }
                },
                text = {
                    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        Text(
                            text = "Patient: ${appt.patientName} | Visit: ${appt.appointmentDate} at ${appt.appointmentTime}",
                            fontSize = 12.sp,
                            color = Color(0xFF64748B)
                        )
                        OutlinedTextField(
                            value = remarkTextValue,
                            onValueChange = { remarkTextValue = it },
                            label = { Text("Clinical Remarks & Diagnosis") },
                            placeholder = { Text("e.g. Prescribed medication. Patient advised for follow-up in 10 days.") },
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
                                val clinicIdToUse = if (appt.clinicId.isNotBlank()) appt.clinicId else effectiveClinicId
                                if (billingRepository != null) {
                                    val ok = billingRepository.saveRemarkForAppointment(appt.id, clinicIdToUse, remarkTextValue.trim())
                                    if (ok) {
                                        remarksMap = remarksMap + (appt.id to remarkTextValue.trim())
                                        actionMessage = "✓ Visit remarks saved to server for ${appt.patientName}!"
                                    } else {
                                        actionMessage = "Failed to save remarks. Please check network."
                                    }
                                }
                                isSavingRemark = false
                                editingApptRemark = null
                            }
                        },
                        colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF0097A7)),
                        shape = RoundedCornerShape(10.dp),
                        enabled = !isSavingRemark
                    ) {
                        if (isSavingRemark) {
                            CircularProgressIndicator(modifier = Modifier.size(16.dp), color = Color.White, strokeWidth = 2.dp)
                            Spacer(Modifier.width(6.dp))
                        }
                        Text("Save to Server", fontWeight = FontWeight.Bold, color = Color.White)
                    }
                },
                dismissButton = {
                    TextButton(onClick = { editingApptRemark = null }, enabled = !isSavingRemark) {
                        Text("Cancel")
                    }
                }
            )
        }

        // =========================================================================
        // EDIT APPOINTMENT SCHEDULE / DATE DIALOG (Saved Properly to Server)
        // =========================================================================
        editingApptSchedule?.let { appt ->
            Dialog(onDismissRequest = { if (!isSavingSchedule) editingApptSchedule = null }) {
                Card(
                    shape = RoundedCornerShape(20.dp),
                    colors = CardDefaults.cardColors(containerColor = Color.White),
                    modifier = Modifier.fillMaxWidth().padding(horizontal = 4.dp)
                ) {
                    Column(
                        modifier = Modifier
                            .padding(20.dp)
                            .verticalScroll(rememberScrollState()),
                        verticalArrangement = Arrangement.spacedBy(14.dp)
                    ) {
                        // Title Row
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(8.dp)
                            ) {
                                Surface(
                                    shape = RoundedCornerShape(8.dp),
                                    color = Color(0xFF0097A7),
                                    modifier = Modifier.size(32.dp)
                                ) {
                                    Box(contentAlignment = Alignment.Center) {
                                        Icon(Icons.Default.EditCalendar, contentDescription = null, tint = Color.White, modifier = Modifier.size(18.dp))
                                    }
                                }
                                Column {
                                    Text("Reschedule Appointment", fontWeight = FontWeight.Bold, fontSize = 16.sp, color = Color(0xFF0F172A))
                                    Text("Update visit date, doctor, or slot", fontSize = 11.sp, color = Color(0xFF64748B))
                                }
                            }
                            IconButton(
                                onClick = { editingApptSchedule = null },
                                enabled = !isSavingSchedule,
                                modifier = Modifier.size(28.dp)
                            ) {
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
                                    Text("Code: #${appt.trackingCode10Digit} \u2022 ${appt.patientMobile}", fontSize = 11.sp, color = Color(0xFF0284C7), fontFamily = FontFamily.Monospace)
                                }
                                Surface(
                                    shape = RoundedCornerShape(6.dp),
                                    color = Color(0xFFFEF3C7)
                                ) {
                                    Text(
                                        text = (appt.checkinStatus ?: "ACTIVE").uppercase(),
                                        color = Color(0xFF92400E),
                                        fontWeight = FontWeight.Bold,
                                        fontSize = 10.sp,
                                        modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
                                    )
                                }
                            }
                        }

                        // Doctor Selector
                        if (affiliatedDoctors.isNotEmpty()) {
                            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                                Text("Consulting Doctor", fontSize = 12.sp, fontWeight = FontWeight.Bold, color = Color(0xFF334155))
                                Row(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .horizontalScroll(rememberScrollState()),
                                    horizontalArrangement = Arrangement.spacedBy(6.dp)
                                ) {
                                    affiliatedDoctors.forEach { doc ->
                                        val isSelected = rescheduleDoctorId == doc.id
                                        FilterChip(
                                            selected = isSelected,
                                            onClick = {
                                                rescheduleDoctorId = doc.id
                                                selectedRescheduleSlotId = null
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
                                    value = newVisitDateInput,
                                    onValueChange = {
                                        newVisitDateInput = it
                                        selectedRescheduleSlotId = null
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

                            val todayDate = remember { LocalDate.now() }
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.spacedBy(6.dp)
                            ) {
                                SuggestionChip(
                                    onClick = {
                                        newVisitDateInput = todayDate.toString()
                                        selectedRescheduleSlotId = null
                                    },
                                    label = { Text("Today", fontSize = 11.sp) },
                                    colors = SuggestionChipDefaults.suggestionChipColors(
                                        containerColor = if (newVisitDateInput == todayDate.toString()) Color(0xFFE0F2FE) else Color.White
                                    )
                                )
                                SuggestionChip(
                                    onClick = {
                                        newVisitDateInput = todayDate.plusDays(1).toString()
                                        selectedRescheduleSlotId = null
                                    },
                                    label = { Text("Tomorrow", fontSize = 11.sp) },
                                    colors = SuggestionChipDefaults.suggestionChipColors(
                                        containerColor = if (newVisitDateInput == todayDate.plusDays(1).toString()) Color(0xFFE0F2FE) else Color.White
                                    )
                                )
                                SuggestionChip(
                                    onClick = {
                                        newVisitDateInput = todayDate.plusDays(2).toString()
                                        selectedRescheduleSlotId = null
                                    },
                                    label = { Text("+2 Days", fontSize = 11.sp) },
                                    colors = SuggestionChipDefaults.suggestionChipColors(
                                        containerColor = if (newVisitDateInput == todayDate.plusDays(2).toString()) Color(0xFFE0F2FE) else Color.White
                                    )
                                )
                                SuggestionChip(
                                    onClick = {
                                        newVisitDateInput = todayDate.plusDays(7).toString()
                                        selectedRescheduleSlotId = null
                                    },
                                    label = { Text("+1 Week", fontSize = 11.sp) },
                                    colors = SuggestionChipDefaults.suggestionChipColors(
                                        containerColor = if (newVisitDateInput == todayDate.plusDays(7).toString()) Color(0xFFE0F2FE) else Color.White
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
                                if (isLoadingRescheduleSlots) {
                                    CircularProgressIndicator(modifier = Modifier.size(12.dp), strokeWidth = 1.5.dp, color = Color(0xFF0097A7))
                                }
                            }

                            if (availableRescheduleSlots.isNotEmpty()) {
                                LazyRow(
                                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                                    modifier = Modifier.fillMaxWidth()
                                ) {
                                    items(availableRescheduleSlots) { slot ->
                                        val isSelected = selectedRescheduleSlotId == slot.id
                                        val availableCapacity = (slot.maxCapacity - slot.bookedCount).coerceAtLeast(0)
                                        val timeLabel = "${slot.startTime} \u2013 ${slot.endTime}"

                                        Surface(
                                            shape = RoundedCornerShape(8.dp),
                                            color = if (isSelected) Color(0xFF0097A7) else Color(0xFFF1F5F9),
                                            border = BorderStroke(1.dp, if (isSelected) Color(0xFF0097A7) else Color(0xFFCBD5E1)),
                                            modifier = Modifier.clickable {
                                                selectedRescheduleSlotId = slot.id
                                                newVisitTimeInput = slot.startTime
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
                            value = newVisitTimeInput,
                            onValueChange = { newVisitTimeInput = it },
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
                                val cleanDate = newVisitDateInput.trim()
                                val cleanTime = newVisitTimeInput.trim()
                                if (cleanDate.length == 10 && cleanTime.isNotBlank()) {
                                    isSavingSchedule = true
                                    coroutineScope.launch {
                                        val ok = appointmentRepository?.rescheduleAppointment(
                                            id = appt.id,
                                            newDate = cleanDate,
                                            newTime = cleanTime,
                                            newSlotId = selectedRescheduleSlotId,
                                            newDoctorId = rescheduleDoctorId.ifBlank { null }
                                        ) ?: false

                                        isSavingSchedule = false
                                        if (ok) {
                                            if (cleanDate == LocalDate.now().toString()) {
                                                queueRepository?.getQueueForClinic(effectiveClinicId)
                                                actionMessage = "✓ Rescheduled ${appt.patientName} for Today ($cleanTime) & re-added to live queue!"
                                            } else {
                                                actionMessage = "✓ Rescheduled ${appt.patientName} for $cleanDate at $cleanTime!"
                                            }
                                            editingApptSchedule = null
                                            loadData()
                                            selectedPatientForDetails?.let { openPatientHistory(it) }
                                        } else {
                                            actionMessage = "Reschedule failed. Please try again."
                                        }
                                    }
                                }
                            },
                            shape = RoundedCornerShape(10.dp),
                            colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF0097A7)),
                            enabled = !isSavingSchedule && newVisitDateInput.isNotBlank() && newVisitTimeInput.isNotBlank(),
                            modifier = Modifier.fillMaxWidth().height(44.dp)
                        ) {
                            if (isSavingSchedule) {
                                CircularProgressIndicator(color = Color.White, modifier = Modifier.size(16.dp), strokeWidth = 2.dp)
                            } else {
                                Icon(Icons.Default.Check, contentDescription = null, tint = Color.White, modifier = Modifier.size(16.dp))
                                Spacer(Modifier.width(6.dp))
                                Text("Save & Update Schedule", fontWeight = FontWeight.Bold, color = Color.White)
                            }
                        }

                        // Cancel Button
                        TextButton(
                            onClick = { editingApptSchedule = null },
                            enabled = !isSavingSchedule,
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Text("Cancel", color = Color(0xFF64748B))
                        }
                    }
                }
            }
        }

        // =========================================================================
        // SCHEDULE NEXT VISIT / BOOK SLOT DIALOG (Multi-Type Clinic)
        // =========================================================================
        showScheduleDialogForPatient?.let { pItem ->
            AlertDialog(
                onDismissRequest = { if (!isScheduling) showScheduleDialogForPatient = null },
                title = {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Icon(Icons.Default.CalendarMonth, contentDescription = null, tint = Color(0xFF0097A7))
                        Text("Schedule Visit for ${pItem.patientName}", fontWeight = FontWeight.Bold, fontSize = 16.sp)
                    }
                },
                text = {
                    Column(
                        modifier = Modifier.verticalScroll(rememberScrollState()),
                        verticalArrangement = Arrangement.spacedBy(10.dp)
                    ) {
                        Text("Schedule a follow-up or new appointment directly into the clinic and doctor roster.", fontSize = 12.sp, color = Color(0xFF64748B))

                        Text("Select Doctor:", fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
                        Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                            affiliatedDoctors.forEach { doc ->
                                Row(
                                    verticalAlignment = Alignment.CenterVertically,
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .clickable { scheduleDoctorId = doc.id }
                                ) {
                                    RadioButton(
                                        selected = scheduleDoctorId == doc.id,
                                        onClick = { scheduleDoctorId = doc.id }
                                    )
                                    Text("${doc.fullName} (${doc.specialty ?: "General Practice"})", fontSize = 13.sp)
                                }
                            }
                        }

                        OutlinedTextField(
                            value = scheduleDateInput,
                            onValueChange = { scheduleDateInput = it },
                            label = { Text("Appointment Date (YYYY-MM-DD)") },
                            singleLine = true,
                            modifier = Modifier.fillMaxWidth(),
                            shape = RoundedCornerShape(10.dp)
                        )

                        OutlinedTextField(
                            value = scheduleTimeInput,
                            onValueChange = { scheduleTimeInput = it },
                            label = { Text("Appointment Time (e.g. 11:00 AM)") },
                            singleLine = true,
                            modifier = Modifier.fillMaxWidth(),
                            shape = RoundedCornerShape(10.dp)
                        )

                        OutlinedTextField(
                            value = scheduleRemarksInput,
                            onValueChange = { scheduleRemarksInput = it },
                            label = { Text("Initial Clinical Note / Reason") },
                            placeholder = { Text("e.g. Follow-up consultation for blood pressure check") },
                            minLines = 2,
                            modifier = Modifier.fillMaxWidth(),
                            shape = RoundedCornerShape(10.dp)
                        )
                    }
                },
                confirmButton = {
                    Button(
                        onClick = {
                            coroutineScope.launch {
                                isScheduling = true
                                if (appointmentRepository != null && effectiveClinicId.isNotBlank()) {
                                    val newAppt = Appointment(
                                        id = java.util.UUID.randomUUID().toString(),
                                        trackingCode10Digit = TrackingCodeGenerator.generate(),
                                        clinicId = effectiveClinicId,
                                        doctorId = scheduleDoctorId.ifBlank { affiliatedDoctors.firstOrNull()?.id },
                                        userId = pItem.userId,
                                        patientName = pItem.patientName,
                                        patientAge = pItem.age,
                                        patientGender = pItem.gender,
                                        patientMobile = pItem.phone.ifBlank { "9841000000" },
                                        patientEmail = pItem.email,
                                        paymentStatus = "pending",
                                        checkinStatus = "waiting",
                                        appointmentDate = scheduleDateInput.trim(),
                                        appointmentTime = scheduleTimeInput.trim(),
                                        feeAmount = 0.0, // Follow-up visit: free consultation
                                        isWalkin = true
                                    )
                                    val created = appointmentRepository.createWalkinAppointment(newAppt)
                                    if (created != null) {
                                        if (scheduleRemarksInput.isNotBlank() && billingRepository != null) {
                                            billingRepository.saveRemarkForAppointment(created.id, effectiveClinicId, scheduleRemarksInput.trim())
                                        }
                                        actionMessage = "✓ Visit scheduled for ${pItem.patientName} on $scheduleDateInput!"
                                        loadData()
                                        showScheduleDialogForPatient = null
                                    } else {
                                        actionMessage = "Failed to schedule appointment. Please try again."
                                    }
                                }
                                isScheduling = false
                            }
                        },
                        colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF0097A7)),
                        shape = RoundedCornerShape(10.dp),
                        enabled = !isScheduling
                    ) {
                        if (isScheduling) {
                            CircularProgressIndicator(modifier = Modifier.size(16.dp), color = Color.White, strokeWidth = 2.dp)
                            Spacer(Modifier.width(6.dp))
                        }
                        Text("Confirm & Schedule", fontWeight = FontWeight.Bold, color = Color.White)
                    }
                },
                dismissButton = {
                    TextButton(onClick = { showScheduleDialogForPatient = null }, enabled = !isScheduling) {
                        Text("Cancel")
                    }
                }
            )
        }

        // =========================================================================
        // ADD PATIENT TO DIRECTORY DIALOG
        // =========================================================================
        if (showRegisterPatientDialog) {
            AlertDialog(
                onDismissRequest = { if (!isRegistering) showRegisterPatientDialog = false },
                title = {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Icon(Icons.Default.PersonAdd, contentDescription = null, tint = Color(0xFF0097A7))
                        Text("Add Patient to Directory", fontWeight = FontWeight.Bold)
                    }
                },
                text = {
                    Column(
                        modifier = Modifier.verticalScroll(rememberScrollState()),
                        verticalArrangement = Arrangement.spacedBy(10.dp)
                    ) {
                        // Patient Record ID Preview Box
                        Surface(
                            shape = RoundedCornerShape(10.dp),
                            color = Color(0xFFE0F7FA).copy(alpha = 0.6f),
                            border = BorderStroke(1.dp, Color(0xFFB2EBF2)),
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Row(
                                modifier = Modifier.padding(12.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.SpaceBetween
                            ) {
                                Column {
                                    Text("Patient Directory Record ID", fontSize = 10.sp, color = Color(0xFF00838F))
                                    Text(
                                        generatedApptIdPreview,
                                        fontWeight = FontWeight.Bold,
                                        fontSize = 17.sp,
                                        fontFamily = FontFamily.Monospace,
                                        letterSpacing = 1.sp,
                                        color = Color(0xFF006064)
                                    )
                                }
                                Surface(shape = RoundedCornerShape(6.dp), color = Color(0xFF0097A7)) {
                                    Text("Clinic Record Only", fontSize = 10.sp, fontWeight = FontWeight.Bold, color = Color.White, modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp))
                                }
                            }
                        }

                        if (registerError != null) {
                            Surface(color = Color(0xFFFEE2E2), shape = RoundedCornerShape(8.dp), modifier = Modifier.fillMaxWidth()) {
                                Text(registerError ?: "", color = Color(0xFF991B1B), fontSize = 12.sp, modifier = Modifier.padding(8.dp))
                            }
                        }

                        OutlinedTextField(
                            value = newPatientName,
                            onValueChange = { newPatientName = it },
                            label = { Text("Full Name *") },
                            placeholder = { Text("e.g. Rajanpurbey45") },
                            singleLine = true,
                            modifier = Modifier.fillMaxWidth(),
                            shape = RoundedCornerShape(10.dp)
                        )

                        OutlinedTextField(
                            value = newPatientPhone,
                            onValueChange = { newPatientPhone = it },
                            label = { Text("Mobile Phone *") },
                            placeholder = { Text("e.g. 9841234567") },
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone),
                            singleLine = true,
                            modifier = Modifier.fillMaxWidth(),
                            shape = RoundedCornerShape(10.dp)
                        )

                        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            OutlinedTextField(
                                value = newPatientAge,
                                onValueChange = { newPatientAge = it },
                                label = { Text("Age") },
                                placeholder = { Text("66") },
                                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                                singleLine = true,
                                modifier = Modifier.weight(1f),
                                shape = RoundedCornerShape(10.dp)
                            )

                            Column(modifier = Modifier.weight(1.3f)) {
                                Text("Gender", fontSize = 11.sp, color = Color(0xFF64748B))
                                Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                                    listOf("Male", "Female", "Other").forEach { g ->
                                        FilterChip(
                                            selected = newPatientGender == g,
                                            onClick = { newPatientGender = g },
                                            label = { Text(g, fontSize = 10.sp) },
                                            modifier = Modifier.height(32.dp)
                                        )
                                    }
                                }
                            }
                        }

                        OutlinedTextField(
                            value = newPatientEmail,
                            onValueChange = { newPatientEmail = it },
                            label = { Text("Email (Optional)") },
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email),
                            singleLine = true,
                            modifier = Modifier.fillMaxWidth(),
                            shape = RoundedCornerShape(10.dp)
                        )
                    }
                },
                confirmButton = {
                    Button(
                        onClick = {
                            if (newPatientName.isBlank()) {
                                registerError = "Please enter patient full name."
                                return@Button
                            }
                            if (newPatientPhone.isBlank()) {
                                registerError = "Please enter mobile phone number."
                                return@Button
                            }
                            coroutineScope.launch {
                                isRegistering = true
                                registerError = null
                                val res = authRepository?.registerPatient(
                                    fullName = newPatientName.trim(),
                                    phone = newPatientPhone.trim(),
                                    gender = newPatientGender,
                                    age = newPatientAge.trim().toIntOrNull(),
                                    email = newPatientEmail.trim().ifBlank { null }
                                )
                                val deterministicFallbackId = when {
                                    newPatientEmail.isNotBlank() -> com.dactor.clinic.domain.util.PatientIdentitySync.getDeterministicPatientIdForEmail(newPatientEmail)
                                    newPatientPhone.isNotBlank() -> com.dactor.clinic.domain.util.PatientIdentitySync.getDeterministicPatientIdForPhone(newPatientPhone)
                                    else -> java.util.UUID.randomUUID().toString()
                                }
                                val createdProfile = res?.getOrNull() ?: Profile(
                                    id = deterministicFallbackId,
                                    authUid = null,
                                    email = newPatientEmail.trim().ifBlank { "patient_${newPatientPhone.trim().takeLast(10)}@dactor.internal" },
                                    fullName = newPatientName.trim(),
                                    role = "patient",
                                    phone = newPatientPhone.trim(),
                                    gender = newPatientGender,
                                    age = newPatientAge.trim().toIntOrNull()
                                )
                                val updatedLocal = (listOf(createdProfile) + locallyAddedProfiles).distinctBy { it.id }
                                locallyAddedProfiles = updatedLocal
                                val serialized = updatedLocal.joinToString("\n") { p ->
                                    listOf(
                                        p.id,
                                        (p.fullName ?: "").replace("|", " ").replace("\n", " "),
                                        (p.phone ?: "").replace("|", " ").replace("\n", " "),
                                        (p.gender ?: "Male").replace("|", " ").replace("\n", " "),
                                        p.email.replace("|", " ").replace("\n", " "),
                                        p.age?.toString() ?: ""
                                    ).joinToString("|")
                                }
                                directoryPrefs.edit()
                                    .putString("records_${effectiveClinicId.ifBlank { "default" }}", serialized)
                                    .apply()

                                actionMessage = "✓ Patient '${newPatientName.trim()}' saved to clinic directory! (No appointment booked)"
                                showRegisterPatientDialog = false
                                selectedTab = 1
                                loadData()
                                isRegistering = false
                            }
                        },
                        colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF0097A7)),
                        shape = RoundedCornerShape(10.dp),
                        enabled = !isRegistering
                    ) {
                        if (isRegistering) {
                            CircularProgressIndicator(modifier = Modifier.size(16.dp), color = Color.White, strokeWidth = 2.dp)
                            Spacer(Modifier.width(6.dp))
                        }
                        Text("Save Patient Details", fontWeight = FontWeight.Bold, color = Color.White)
                    }
                },
                dismissButton = {
                    TextButton(onClick = { showRegisterPatientDialog = false }, enabled = !isRegistering) {
                        Text("Cancel")
                    }
                }
            )
        }
    }
}

/**
 * Data holder for patient details
 */
data class PatientDetailItem(
    val patientName: String,
    val age: Int?,
    val gender: String,
    val phone: String,
    val email: String?,
    val trackingCode: String,
    val userId: String?,
    val currentAppointment: Appointment?
)

/**
 * Patient Record Card Item strictly adhering to media_1791614570127_5145146c.png
 * Includes phone number, call button, tap-to-copy tracking ID, and multi-type schedule button.
 */
@Composable
private fun PatientRecordCardItem(
    item: PatientDetailItem,
    doctorName: String,
    scheduleDate: String,
    scheduleTime: String,
    queueStatusText: String,
    badgeText: String,
    existingRemark: String?,
    isMultiTypeClinic: Boolean,
    onCardClick: () -> Unit,
    onCopyTracking: (String) -> Unit,
    onCallPatient: (String) -> Unit,
    onScheduleNextVisit: () -> Unit,
    onOpenBilling: (() -> Unit)? = null
) {
    Card(
        shape = RoundedCornerShape(20.dp),
        colors = CardDefaults.cardColors(containerColor = Color.White),
        border = BorderStroke(1.dp, Color(0xFFE2E8F0)),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp),
        modifier = Modifier
            .fillMaxWidth()
            .clickable { onCardClick() }
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            // Header: Avatar, Name, Age/Gender, Tracking, Phone & Call Button
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(14.dp)
            ) {
                // Circular Cyan Avatar
                Surface(
                    shape = CircleShape,
                    color = Color(0xFFD0EEFB),
                    modifier = Modifier.size(54.dp)
                ) {
                    Box(contentAlignment = Alignment.Center) {
                        Icon(
                            Icons.Default.Person,
                            contentDescription = null,
                            tint = Color(0xFF00838F),
                            modifier = Modifier.size(32.dp)
                        )
                    }
                }

                Column(
                    modifier = Modifier.weight(1f),
                    verticalArrangement = Arrangement.spacedBy(2.dp)
                ) {
                    Text(
                        text = item.patientName,
                        fontWeight = FontWeight.Bold,
                        fontSize = 17.sp,
                        color = Color(0xFF0F172A),
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )

                    // Subtitle: Age, Gender & Tap-to-Copy Tracking ID
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(4.dp)
                    ) {
                        Text(
                            text = "${item.age ?: "--"} yrs | ${item.gender}",
                            fontSize = 12.sp,
                            color = Color(0xFF64748B)
                        )

                        // Tap Tracking to Copy to Clipboard
                        Surface(
                            shape = RoundedCornerShape(4.dp),
                            color = Color(0xFFF1F5F9),
                            modifier = Modifier.clickable { onCopyTracking(item.trackingCode) }
                        ) {
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(2.dp),
                                modifier = Modifier.padding(horizontal = 4.dp, vertical = 2.dp)
                            ) {
                                Text(
                                    text = "Tracking: ${item.trackingCode}",
                                    fontSize = 11.5.sp,
                                    fontFamily = FontFamily.Monospace,
                                    fontWeight = FontWeight.Bold,
                                    color = Color(0xFF0284C7)
                                )
                                Icon(
                                    Icons.Default.ContentCopy,
                                    contentDescription = "Copy",
                                    tint = Color(0xFF0284C7),
                                    modifier = Modifier.size(11.dp)
                                )
                            }
                        }
                    }

                    // Patient Phone & Direct Call Option
                    if (item.phone.isNotBlank()) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(6.dp),
                            modifier = Modifier.padding(top = 2.dp)
                        ) {
                            Icon(
                                Icons.Default.Phone,
                                contentDescription = null,
                                tint = Color(0xFF10B981),
                                modifier = Modifier.size(12.dp)
                            )
                            Text(
                                text = item.phone,
                                fontSize = 11.5.sp,
                                fontWeight = FontWeight.SemiBold,
                                color = Color(0xFF334155)
                            )
                        }
                    }
                }

                // Call Action Button
                if (item.phone.isNotBlank()) {
                    Surface(
                        shape = RoundedCornerShape(10.dp),
                        color = Color(0xFFDCFCE7),
                        modifier = Modifier.clickable { onCallPatient(item.phone) }
                    ) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(4.dp),
                            modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp)
                        ) {
                            Icon(
                                Icons.Default.Call,
                                contentDescription = "Call",
                                tint = Color(0xFF15803D),
                                modifier = Modifier.size(14.dp)
                            )
                            Text(
                                text = "Call",
                                color = Color(0xFF15803D),
                                fontSize = 12.sp,
                                fontWeight = FontWeight.Bold
                            )
                        }
                    }
                }
            }

            HorizontalDivider(color = Color(0xFFE2E8F0))

            // Schedule & Doctor Rows Matching Template
            if (item.currentAppointment != null) {
                Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(6.dp)
                    ) {
                        Icon(
                            Icons.Default.CalendarToday,
                            contentDescription = null,
                            tint = Color(0xFF0284C7),
                            modifier = Modifier.size(14.dp)
                        )
                        Text(
                            text = "Schedule: $scheduleDate at $scheduleTime",
                            fontSize = 13.sp,
                            fontWeight = FontWeight.Bold,
                            color = Color(0xFF0284C7)
                        )
                    }

                    Text(
                        text = "Doctor: $doctorName",
                        fontSize = 12.5.sp,
                        color = Color(0xFF475569),
                        modifier = Modifier.padding(start = 20.dp)
                    )
                }
            } else {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    Icon(
                        Icons.Default.FolderShared,
                        contentDescription = null,
                        tint = Color(0xFF00838F),
                        modifier = Modifier.size(14.dp)
                    )
                    Text(
                        text = "Clinic Record Only \u2014 No Appointment Booked",
                        fontSize = 12.5.sp,
                        fontWeight = FontWeight.SemiBold,
                        color = Color(0xFF00838F)
                    )
                }
            }

            // Existing Remark preview (if present)
            if (!existingRemark.isNullOrBlank()) {
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
                        Icon(Icons.Default.RateReview, contentDescription = null, tint = Color(0xFF0097A7), modifier = Modifier.size(13.dp))
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

            // Bottom Status Bar Matching Template
            Surface(
                color = Color(0xFFECFDF5),
                shape = RoundedCornerShape(12.dp),
                modifier = Modifier.fillMaxWidth()
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 12.dp, vertical = 9.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    // Left Green Checkmark & Status Text
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                        modifier = Modifier.weight(1f)
                    ) {
                        Icon(
                            Icons.Default.CheckCircle,
                            contentDescription = null,
                            tint = Color(0xFF059669),
                            modifier = Modifier.size(17.dp)
                        )
                        Text(
                            text = queueStatusText,
                            fontSize = 11.5.sp,
                            fontWeight = FontWeight.SemiBold,
                            color = Color(0xFF065F46),
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis
                        )
                    }

                    // Right Status Pill with Person Icon
                    Surface(
                        color = Color(0xFFD1FAE5),
                        shape = RoundedCornerShape(8.dp)
                    ) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(4.dp),
                            modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
                        ) {
                            Icon(
                                Icons.Default.Person,
                                contentDescription = null,
                                tint = Color(0xFF065F46),
                                modifier = Modifier.size(13.dp)
                            )
                            Text(
                                text = badgeText,
                                color = Color(0xFF065F46),
                                fontSize = 10.5.sp,
                                fontWeight = FontWeight.Bold
                            )
                        }
                    }
                }
            }

            // Action Row: Schedule Next Visit & Push / Edit Bill
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                if (isMultiTypeClinic) {
                    OutlinedButton(
                        onClick = { onScheduleNextVisit() },
                        shape = RoundedCornerShape(10.dp),
                        border = BorderStroke(1.dp, Color(0xFF0097A7)),
                        contentPadding = PaddingValues(horizontal = 10.dp, vertical = 6.dp),
                        modifier = Modifier
                            .weight(1f)
                            .height(38.dp)
                    ) {
                        Icon(
                            Icons.Default.CalendarMonth,
                            contentDescription = null,
                            tint = Color(0xFF0097A7),
                            modifier = Modifier.size(15.dp)
                        )
                        Spacer(Modifier.width(5.dp))
                        Text(
                            text = "Schedule Visit",
                            color = Color(0xFF0097A7),
                            fontSize = 11.5.sp,
                            fontWeight = FontWeight.Bold
                        )
                    }
                }

                if (onOpenBilling != null) {
                    Button(
                        onClick = { onOpenBilling() },
                        shape = RoundedCornerShape(10.dp),
                        colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF0F766E)),
                        contentPadding = PaddingValues(horizontal = 10.dp, vertical = 6.dp),
                        modifier = Modifier
                            .weight(1f)
                            .height(38.dp)
                    ) {
                        Icon(
                            Icons.Default.ReceiptLong,
                            contentDescription = null,
                            tint = Color.White,
                            modifier = Modifier.size(15.dp)
                        )
                        Spacer(Modifier.width(5.dp))
                        Text(
                            text = "Push / Edit Bill",
                            color = Color.White,
                            fontSize = 11.5.sp,
                            fontWeight = FontWeight.Bold
                        )
                    }
                }
            }
        }
    }
}

/**
 * Full Patient History Modal Dialog showing:
 * - Demographics, Phone (with Call), Tracking (with copy)
 * - Every past visit with what clinic they visited
 * - Editable remarks and editable visit dates saved to server
 * - Multi-type clinic schedule button
 */
@Composable
private fun PatientFullHistoryModalDialog(
    item: PatientDetailItem,
    appointments: List<Appointment>,
    isLoading: Boolean,
    clinicsMap: Map<String, Clinic>,
    doctors: List<Doctor>,
    remarksMap: Map<String, String>,
    isMultiTypeClinic: Boolean,
    onDismiss: () -> Unit,
    onCopyTracking: (String) -> Unit,
    onCallPatient: (String) -> Unit,
    onEditRemark: (Appointment, String) -> Unit,
    onEditSchedule: (Appointment) -> Unit,
    onScheduleNewVisit: () -> Unit
) {
    Dialog(
        onDismissRequest = { onDismiss() },
        properties = DialogProperties(usePlatformDefaultWidth = false)
    ) {
        val navBarBottom = WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding()
        val safeBottomFloor = maxOf(navBarBottom + 14.dp, 48.dp)

        Box(
            modifier = Modifier
                .fillMaxSize()
                .navigationBarsPadding()
                .padding(horizontal = 14.dp)
                .padding(top = 16.dp, bottom = safeBottomFloor),
            contentAlignment = Alignment.Center
        ) {
            Surface(
                shape = RoundedCornerShape(24.dp),
                color = Color.White,
                border = BorderStroke(1.dp, Color(0xFFE2E8F0)),
                shadowElevation = 8.dp,
                modifier = Modifier
                    .fillMaxWidth()
                    .fillMaxHeight()
            ) {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(20.dp)
            ) {
                // Top Header Row
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Column {
                        Text(
                            text = item.patientName,
                            fontWeight = FontWeight.Bold,
                            fontSize = 19.sp,
                            color = Color(0xFF0F172A)
                        )
                        Text(
                            text = "${item.age ?: "--"} yrs | ${item.gender} | Patient Clinical File",
                            fontSize = 12.sp,
                            color = Color(0xFF64748B)
                        )
                    }

                    IconButton(onClick = { onDismiss() }, modifier = Modifier.size(32.dp)) {
                        Icon(Icons.Default.Close, contentDescription = "Close", tint = Color(0xFF64748B), modifier = Modifier.size(20.dp))
                    }
                }

                Spacer(Modifier.height(10.dp))

                // Patient Demographic Strip (Phone, Call, Tracking ID)
                Surface(
                    shape = RoundedCornerShape(14.dp),
                    color = Color(0xFFF8FAFC),
                    border = BorderStroke(1.dp, Color(0xFFE2E8F0)),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Row(
                        modifier = Modifier
                            .padding(12.dp)
                            .fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                            // Tracking ID (Tap to Copy)
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(4.dp),
                                modifier = Modifier.clickable { onCopyTracking(item.trackingCode) }
                            ) {
                                Text("Tracking ID:", fontSize = 11.sp, color = Color(0xFF64748B))
                                Text(
                                    item.trackingCode,
                                    fontSize = 12.sp,
                                    fontFamily = FontFamily.Monospace,
                                    fontWeight = FontWeight.Bold,
                                    color = Color(0xFF0284C7)
                                )
                                Icon(Icons.Default.ContentCopy, contentDescription = "Copy", tint = Color(0xFF0284C7), modifier = Modifier.size(12.dp))
                            }

                            // Phone
                            if (item.phone.isNotBlank()) {
                                Row(
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(4.dp)
                                ) {
                                    Icon(Icons.Default.Phone, contentDescription = null, tint = Color(0xFF10B981), modifier = Modifier.size(13.dp))
                                    Text(item.phone, fontSize = 12.sp, fontWeight = FontWeight.SemiBold, color = Color(0xFF0F172A))
                                }
                            }
                        }

                        // Call Action Button
                        if (item.phone.isNotBlank()) {
                            Button(
                                onClick = { onCallPatient(item.phone) },
                                colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF059669)),
                                shape = RoundedCornerShape(10.dp),
                                contentPadding = PaddingValues(horizontal = 12.dp, vertical = 6.dp),
                                modifier = Modifier.height(36.dp)
                            ) {
                                Icon(Icons.Default.Call, contentDescription = null, tint = Color.White, modifier = Modifier.size(14.dp))
                                Spacer(Modifier.width(4.dp))
                                Text("Call Patient", fontSize = 11.5.sp, fontWeight = FontWeight.Bold, color = Color.White)
                            }
                        }
                    }
                }

                Spacer(Modifier.height(10.dp))

                // Schedule Next Visit Button for Multi-Type Clinics
                if (isMultiTypeClinic) {
                    Button(
                        onClick = { onScheduleNewVisit() },
                        colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF0097A7)),
                        shape = RoundedCornerShape(12.dp),
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(42.dp)
                    ) {
                        Icon(Icons.Default.AddCircleOutline, contentDescription = null, tint = Color.White, modifier = Modifier.size(16.dp))
                        Spacer(Modifier.width(6.dp))
                        Text("+ Schedule Next Visit / Book Slot", fontWeight = FontWeight.Bold, fontSize = 12.5.sp, color = Color.White)
                    }
                    Spacer(Modifier.height(10.dp))
                }

                // Visits Header
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = "Consultation & Visit Records (${appointments.size})",
                        fontWeight = FontWeight.Bold,
                        fontSize = 14.sp,
                        color = Color(0xFF0F172A)
                    )
                    Text(
                        text = "Editable Remarks & Dates",
                        fontSize = 11.sp,
                        color = Color(0xFF0284C7),
                        fontWeight = FontWeight.Medium
                    )
                }

                Spacer(Modifier.height(8.dp))

                // Scrollable Visits List
                if (isLoading) {
                    Box(modifier = Modifier.fillMaxWidth().weight(1f), contentAlignment = Alignment.Center) {
                        CircularProgressIndicator(color = Color(0xFF0097A7))
                    }
                } else if (appointments.isEmpty()) {
                    Box(modifier = Modifier.fillMaxWidth().weight(1f), contentAlignment = Alignment.Center) {
                        Column(
                            horizontalAlignment = Alignment.CenterHorizontally,
                            verticalArrangement = Arrangement.spacedBy(6.dp)
                        ) {
                            Icon(Icons.Default.FolderOpen, contentDescription = null, tint = Color(0xFF94A3B8), modifier = Modifier.size(40.dp))
                            Text("No Past Consultations on File", fontWeight = FontWeight.Bold, fontSize = 14.sp, color = Color(0xFF0F172A))
                            Text("Tap '+ Schedule Next Visit' to book a consultation slot.", fontSize = 12.sp, color = Color(0xFF64748B))
                        }
                    }
                } else {
                    LazyColumn(
                        verticalArrangement = Arrangement.spacedBy(10.dp),
                        modifier = Modifier.weight(1f)
                    ) {
                        items(appointments, key = { it.id }) { appt ->
                            val visitedClinic = clinicsMap[appt.clinicId]
                            val clinicName = visitedClinic?.name ?: "Primary Clinic"
                            val doc = doctors.find { it.id == appt.doctorId }
                            val doctorName = doc?.fullName ?: "Doctor Specialist"
                            val curRemark = remarksMap[appt.id] ?: ""

                            Card(
                                shape = RoundedCornerShape(14.dp),
                                colors = CardDefaults.cardColors(containerColor = Color(0xFFF8FAFC)),
                                border = BorderStroke(1.dp, Color(0xFFE2E8F0)),
                                modifier = Modifier.fillMaxWidth()
                            ) {
                                Column(
                                    modifier = Modifier.padding(12.dp),
                                    verticalArrangement = Arrangement.spacedBy(8.dp)
                                ) {
                                    // Row 1: Date & Time + Status Badge
                                    Row(
                                        modifier = Modifier.fillMaxWidth(),
                                        horizontalArrangement = Arrangement.SpaceBetween,
                                        verticalAlignment = Alignment.CenterVertically
                                    ) {
                                        val isCompleted = appt.checkinStatus == "completed" || appt.checkinStatus == "done"
                                        Row(
                                            verticalAlignment = Alignment.CenterVertically,
                                            horizontalArrangement = Arrangement.spacedBy(6.dp)
                                         ) {
                                            Icon(Icons.Default.CalendarToday, contentDescription = null, tint = Color(0xFF0284C7), modifier = Modifier.size(14.dp))
                                            Text(
                                                text = "${appt.appointmentDate} at ${appt.appointmentTime}",
                                                fontWeight = FontWeight.Bold,
                                                fontSize = 13.sp,
                                                color = Color(0xFF0F172A)
                                            )
                                            // Edit Date Button (Only for active/upcoming appointments - completed visits are read-only to preserve medical history)
                                            if (!isCompleted) {
                                                IconButton(
                                                    onClick = { onEditSchedule(appt) },
                                                    modifier = Modifier.size(24.dp)
                                                ) {
                                                    Icon(Icons.Default.EditCalendar, contentDescription = "Reschedule Visit", tint = Color(0xFF0284C7), modifier = Modifier.size(14.dp))
                                                }
                                            }
                                        }

                                        Surface(
                                            shape = RoundedCornerShape(6.dp),
                                            color = if (isCompleted) Color(0xFFDCFCE7) else Color(0xFFFEF3C7)
                                        ) {
                                            Text(
                                                text = (appt.checkinStatus ?: "VISITED").uppercase(),
                                                color = if (isCompleted) Color(0xFF15803D) else Color(0xFF92400E),
                                                fontWeight = FontWeight.Bold,
                                                fontSize = 10.sp,
                                                modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
                                            )
                                        }
                                    }

                                    // Row 2: Which Clinic Visited + Doctor
                                    Row(
                                        modifier = Modifier.fillMaxWidth(),
                                        horizontalArrangement = Arrangement.SpaceBetween,
                                        verticalAlignment = Alignment.CenterVertically
                                    ) {
                                        // Visited Clinic Tag
                                        Surface(
                                            shape = RoundedCornerShape(6.dp),
                                            color = Color(0xFFE0F2FE)
                                        ) {
                                            Row(
                                                verticalAlignment = Alignment.CenterVertically,
                                                horizontalArrangement = Arrangement.spacedBy(4.dp),
                                                modifier = Modifier.padding(horizontal = 6.dp, vertical = 3.dp)
                                            ) {
                                                Icon(Icons.Default.LocalHospital, contentDescription = null, tint = Color(0xFF0284C7), modifier = Modifier.size(11.dp))
                                                Text("Clinic: $clinicName", fontSize = 11.sp, fontWeight = FontWeight.Bold, color = Color(0xFF0284C7))
                                            }
                                        }

                                        Text(
                                            text = "Doctor: Dr. ${doctorName.removePrefix("Dr. ").removePrefix("Dr.")}",
                                            fontSize = 11.5.sp,
                                            color = Color(0xFF475569)
                                        )
                                    }

                                    // Row 3: Tracking ID & Copy
                                    Row(
                                        modifier = Modifier.fillMaxWidth(),
                                        horizontalArrangement = Arrangement.SpaceBetween,
                                        verticalAlignment = Alignment.CenterVertically
                                    ) {
                                        Text(
                                            text = "Appt ID: ${appt.trackingCode10Digit}",
                                            fontSize = 11.sp,
                                            fontFamily = FontFamily.Monospace,
                                            color = Color(0xFF64748B)
                                        )
                                        IconButton(
                                            onClick = { onCopyTracking(appt.trackingCode10Digit) },
                                            modifier = Modifier.size(22.dp)
                                        ) {
                                            Icon(Icons.Default.ContentCopy, contentDescription = "Copy", tint = Color(0xFF64748B), modifier = Modifier.size(12.dp))
                                        }
                                    }

                                    HorizontalDivider(color = Color(0xFFE2E8F0))

                                    // Row 4: Editable Clinic Remarks
                                    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                                        Row(
                                            modifier = Modifier.fillMaxWidth(),
                                            horizontalArrangement = Arrangement.SpaceBetween,
                                            verticalAlignment = Alignment.CenterVertically
                                        ) {
                                            Text(
                                                text = "Clinical Remarks & Diagnosis:",
                                                fontSize = 11.sp,
                                                fontWeight = FontWeight.Bold,
                                                color = Color(0xFF0F172A)
                                            )
                                            TextButton(
                                                onClick = { onEditRemark(appt, curRemark) },
                                                contentPadding = PaddingValues(horizontal = 6.dp, vertical = 0.dp),
                                                modifier = Modifier.height(24.dp)
                                            ) {
                                                Icon(Icons.Default.Edit, contentDescription = null, modifier = Modifier.size(12.dp), tint = Color(0xFF0097A7))
                                                Spacer(Modifier.width(2.dp))
                                                Text(if (curRemark.isBlank()) "+ Add Remark" else "Edit Remark", fontSize = 11.sp, fontWeight = FontWeight.Bold, color = Color(0xFF0097A7))
                                            }
                                        }

                                        if (curRemark.isNotBlank()) {
                                            Surface(
                                                color = Color.White,
                                                shape = RoundedCornerShape(8.dp),
                                                border = BorderStroke(1.dp, Color(0xFFCBD5E1)),
                                                modifier = Modifier.fillMaxWidth()
                                            ) {
                                                Text(
                                                    text = curRemark,
                                                    fontSize = 11.5.sp,
                                                    color = Color(0xFF334155),
                                                    modifier = Modifier.padding(8.dp)
                                                )
                                            }
                                        } else {
                                            Text(
                                                text = "No remarks added for this visit yet. Tap '+ Add Remark' to save diagnosis notes to the server.",
                                                fontSize = 11.sp,
                                                color = Color(0xFF94A3B8)
                                            )
                                        }
                                    }
                                }
                            }
                        }
                    }
                }

                Spacer(Modifier.height(10.dp))

                // Bottom Dismiss Button
                OutlinedButton(
                    onClick = { onDismiss() },
                    shape = RoundedCornerShape(12.dp),
                    modifier = Modifier
                        .fillMaxWidth()
                        .navigationBarsPadding()
                        .height(44.dp)
                ) {
                    Text("Close", fontWeight = FontWeight.SemiBold, color = Color(0xFF475569))
                }
            }
        }
        }
    }
}
