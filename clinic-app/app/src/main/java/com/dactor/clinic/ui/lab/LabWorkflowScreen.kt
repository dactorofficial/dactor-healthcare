package com.dactor.clinic.ui.lab

import android.content.Intent
import android.net.Uri
import android.provider.OpenableColumns
import android.widget.Toast
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.navigation.NavController
import com.dactor.clinic.data.local.UserSessionManager
import com.dactor.clinic.data.model.Appointment
import com.dactor.clinic.data.model.Clinic
import com.dactor.clinic.data.model.LabReport
import com.dactor.clinic.data.repository.AppointmentRepository
import com.dactor.clinic.data.repository.ClinicRepository
import com.dactor.clinic.data.repository.LabReportRepository
import com.dactor.clinic.data.repository.QueueRepository
import com.dactor.clinic.domain.util.CurrencyFormatter
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import java.util.UUID

data class LabOrderUi(
    val id: String,
    val appointmentId: String,
    val patientName: String,
    val patientAge: Int?,
    val patientGender: String,
    val patientMobile: String,
    val trackingCode: String,
    val appointmentDate: String,
    val appointmentTime: String,
    val feeAmount: Double,
    val testName: String,
    var stage: String, // "processing", "prepared"
    var reportFileName: String? = null,
    var reportFileUrl: String? = null,
    var fileType: String? = null
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LabWorkflowScreen(
    navController: NavController,
    clinicId: String = "",
    labReportRepository: LabReportRepository? = null,
    appointmentRepository: AppointmentRepository? = null,
    queueRepository: QueueRepository? = null,
    clinicRepository: ClinicRepository? = null
) {
    val context = LocalContext.current
    val clipboardManager = LocalClipboardManager.current
    val sessionManager = remember { UserSessionManager(context) }
    val effectiveClinicId = remember(clinicId) {
        if (clinicId.isNotBlank() && clinicId != "c1") clinicId
        else sessionManager.getSavedClinicId()
            ?: sessionManager.getSavedActiveClinicIdForDoctor()
            ?: ""
    }
    val defaultClinicName = remember(context) {
        sessionManager.getSavedName()?.takeIf { it.isNotBlank() } ?: "Diagnostic Lab"
    }

    var currentClinic by remember(effectiveClinicId) { mutableStateOf<Clinic?>(null) }
    var labOrders by remember(effectiveClinicId) { mutableStateOf<List<LabOrderUi>>(emptyList()) }
    var clinicAppointments by remember(effectiveClinicId) { mutableStateOf<List<Appointment>>(emptyList()) }
    var isLoading by remember { mutableStateOf(true) }

    var selectedTab by remember { mutableIntStateOf(0) } // 0: Processing, 1: Prepared, 2: Live Queue (Awaiting Sample)
    var searchQuery by remember { mutableStateOf("") }
    var alertNotice by remember { mutableStateOf<String?>(null) }

    // Mark Prepared & Optional Upload Dialog State
    var selectedOrderForPrepare by remember { mutableStateOf<LabOrderUi?>(null) }
    var publishTestSummary by remember { mutableStateOf("") }
    var selectedFileName by remember { mutableStateOf<String?>(null) }
    var selectedFileBytes by remember { mutableStateOf<ByteArray?>(null) }
    var isUploading by remember { mutableStateOf(false) }

    // Name / Number Verification Gate for Viewing Prepared Report
    var verifyingOrderForViewing by remember { mutableStateOf<LabOrderUi?>(null) }
    var enteredIdentityInput by remember { mutableStateOf("") }
    var verificationError by remember { mutableStateOf<String?>(null) }

    val coroutineScope = rememberCoroutineScope()

    var selectedFileSizeInfo by remember { mutableStateOf<String?>(null) }

    val filePickerLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.GetContent()
    ) { uri: Uri? ->
        if (uri != null) {
            coroutineScope.launch {
                try {
                    val resolvedName = com.dactor.clinic.domain.util.FileCompressor.resolveRealFileName(
                        context = context,
                        uri = uri,
                        defaultBaseName = "Lab_Report"
                    )
                    val compressed = com.dactor.clinic.domain.util.FileCompressor.compressUri(
                        context = context,
                        uri = uri,
                        fallbackFileName = resolvedName
                    )
                    if (compressed != null) {
                        selectedFileBytes = compressed.bytes
                        selectedFileName = compressed.fileName
                        selectedFileSizeInfo = compressed.formattedSummary
                    }
                } catch (e: Exception) {
                    e.printStackTrace()
                }
            }
        }
    }

    suspend fun loadLabOrders() {
        if (clinicRepository != null && effectiveClinicId.isNotBlank() && currentClinic == null) {
            try {
                currentClinic = clinicRepository.getClinicById(effectiveClinicId)
            } catch (ignored: Exception) {}
        }

        val appts = if (appointmentRepository != null && effectiveClinicId.isNotBlank()) {
            try {
                appointmentRepository.getAppointmentsByClinic(effectiveClinicId)
            } catch (e: Exception) {
                emptyList()
            }
        } else emptyList()
        clinicAppointments = appts
        val apptById = appts.associateBy { it.id }
        val apptByCode = appts.associateBy { it.trackingCode10Digit }

        val remoteReports = if (labReportRepository != null && effectiveClinicId.isNotBlank()) {
            try {
                labReportRepository.getLabReports(effectiveClinicId)
            } catch (e: Exception) {
                emptyList()
            }
        } else emptyList()

        val combinedOrders = linkedMapOf<String, LabOrderUi>()

        // 1. Add all existing lab_reports rows
        for (report in remoteReports) {
            val matchedAppt = apptById[report.appointmentId] ?: apptByCode[report.appointmentId]
            val normalizedStage = when (report.stage.lowercase()) {
                "prepared", "completed", "report_prepared" -> "prepared"
                else -> "processing"
            }
            val key = matchedAppt?.id ?: report.appointmentId
            combinedOrders[key] = LabOrderUi(
                id = report.id,
                appointmentId = matchedAppt?.id ?: report.appointmentId,
                patientName = report.patientNameVerification?.takeIf { it.isNotBlank() }
                    ?: matchedAppt?.patientName
                    ?: "Patient",
                patientAge = matchedAppt?.patientAge,
                patientGender = matchedAppt?.patientGender ?: "Male",
                patientMobile = matchedAppt?.patientMobile ?: "",
                trackingCode = matchedAppt?.trackingCode10Digit ?: report.appointmentId.take(10),
                appointmentDate = matchedAppt?.appointmentDate ?: "",
                appointmentTime = matchedAppt?.appointmentTime ?: "",
                feeAmount = matchedAppt?.feeAmount ?: 0.0,
                testName = report.testName.ifBlank { matchedAppt?.selectedLabTests ?: "Diagnostic Lab Test" },
                stage = normalizedStage,
                reportFileName = report.fileName,
                reportFileUrl = report.fileUrl,
                fileType = report.fileType
            )
        }

        // 2. Also include any appointments whose checkinStatus is "processing" or "report_prepared"
        for (appt in appts) {
            val statusLower = appt.checkinStatus?.lowercase() ?: ""
            if ((statusLower == "processing" || statusLower == "report_prepared") && !combinedOrders.containsKey(appt.id)) {
                val stage = if (statusLower == "report_prepared") "prepared" else "processing"
                combinedOrders[appt.id] = LabOrderUi(
                    id = "synthetic_${appt.id}",
                    appointmentId = appt.id,
                    patientName = appt.patientName,
                    patientAge = appt.patientAge,
                    patientGender = appt.patientGender ?: "Male",
                    patientMobile = appt.patientMobile,
                    trackingCode = appt.trackingCode10Digit,
                    appointmentDate = appt.appointmentDate,
                    appointmentTime = appt.appointmentTime,
                    feeAmount = appt.feeAmount,
                    testName = appt.selectedLabTests?.takeIf { it.isNotBlank() } ?: "Diagnostic Lab Test",
                    stage = stage,
                    reportFileName = null,
                    reportFileUrl = null,
                    fileType = null
                )
            }
        }

        labOrders = combinedOrders.values.toList()
        isLoading = false
    }

    LaunchedEffect(effectiveClinicId) {
        while (isActive) {
            loadLabOrders()
            delay(5000L)
        }
    }

    val processingOrders = remember(labOrders, searchQuery) {
        val list = labOrders.filter { it.stage == "processing" }
        if (searchQuery.isBlank()) list
        else {
            val q = searchQuery.trim().lowercase()
            list.filter {
                it.patientName.lowercase().contains(q) ||
                    it.patientMobile.contains(q) ||
                    it.trackingCode.lowercase().contains(q) ||
                    it.testName.lowercase().contains(q)
            }
        }
    }

    val preparedOrders = remember(labOrders, searchQuery) {
        val list = labOrders.filter { it.stage == "prepared" }
        if (searchQuery.isBlank()) list
        else {
            val q = searchQuery.trim().lowercase()
            list.filter {
                it.patientName.lowercase().contains(q) ||
                    it.patientMobile.contains(q) ||
                    it.trackingCode.lowercase().contains(q) ||
                    it.testName.lowercase().contains(q)
            }
        }
    }

    val existingOrderApptIds = remember(labOrders) {
        labOrders.map { it.appointmentId }.toSet()
    }

    val awaitingSampleAppts = remember(clinicAppointments, existingOrderApptIds, searchQuery) {
        val list = clinicAppointments.filter { appt ->
            appt.id !in existingOrderApptIds &&
                appt.checkinStatus != "cancelled" &&
                appt.checkinStatus != "completed" &&
                appt.checkinStatus != "processing" &&
                appt.checkinStatus != "report_prepared"
        }
        if (searchQuery.isBlank()) list
        else {
            val q = searchQuery.trim().lowercase()
            list.filter {
                it.patientName.lowercase().contains(q) ||
                    it.patientMobile.contains(q) ||
                    it.trackingCode10Digit.lowercase().contains(q) ||
                    (it.selectedLabTests?.lowercase()?.contains(q) == true)
            }
        }
    }

    val totalProcessingCount = remember(labOrders) { labOrders.count { it.stage == "processing" } }
    val totalPreparedCount = remember(labOrders) { labOrders.count { it.stage == "prepared" } }
    val totalAwaitingCount = remember(clinicAppointments, existingOrderApptIds) {
        clinicAppointments.count { appt ->
            appt.id !in existingOrderApptIds &&
                appt.checkinStatus != "cancelled" &&
                appt.checkinStatus != "completed" &&
                appt.checkinStatus != "processing" &&
                appt.checkinStatus != "report_prepared"
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
                    // Top Clinic Pill Tag Matching PatientDirectoryScreen Template
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
                                text = "Lab Processing & Reports",
                                fontWeight = FontWeight.Bold,
                                fontSize = 19.sp,
                                color = Color(0xFF0F172A)
                            )
                        }

                        IconButton(
                            onClick = { coroutineScope.launch { loadLabOrders() } },
                            modifier = Modifier.size(36.dp)
                        ) {
                            Icon(Icons.Default.Refresh, contentDescription = "Refresh", tint = Color(0xFF475569))
                        }
                    }
                }
            }
        ) { padding ->
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(padding)
                    .padding(horizontal = 16.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                if (alertNotice != null) {
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
                            Text(
                                text = alertNotice ?: "",
                                fontSize = 12.sp,
                                fontWeight = FontWeight.Medium,
                                color = Color(0xFF166534),
                                modifier = Modifier.weight(1f)
                            )
                            IconButton(onClick = { alertNotice = null }, modifier = Modifier.size(20.dp)) {
                                Icon(Icons.Default.Close, contentDescription = "Dismiss", tint = Color(0xFF166534), modifier = Modifier.size(16.dp))
                            }
                        }
                    }
                }

                // ── Segmented Tabs Matching PatientDirectoryScreen Template ──
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
                        // Tab 0: Processing (Samples Collected)
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
                                        Icons.Default.Biotech,
                                        contentDescription = null,
                                        tint = if (isTab0) Color(0xFF0097A7) else Color(0xFF64748B),
                                        modifier = Modifier.size(17.dp)
                                    )
                                    Text(
                                        text = "Processing\n($totalProcessingCount)",
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

                        // Tab 1: Prepared Reports
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
                                        Icons.Default.AssignmentTurnedIn,
                                        contentDescription = null,
                                        tint = if (isTab1) Color(0xFF0097A7) else Color(0xFF64748B),
                                        modifier = Modifier.size(16.dp)
                                    )
                                    Text(
                                        text = "Prepared\n($totalPreparedCount)",
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

                        // Tab 2: Live Queue (Awaiting Sample Collection)
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
                                        Icons.Default.Science,
                                        contentDescription = null,
                                        tint = if (isTab2) Color(0xFF0097A7) else Color(0xFF64748B),
                                        modifier = Modifier.size(16.dp)
                                    )
                                    Text(
                                        text = "Live Queue\n($totalAwaitingCount)",
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

                // ── Search Bar Matching PatientDirectoryScreen Template ──
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
                                    "Search by Name, Phone, or\n10-Digit Appointment ID",
                                    fontSize = 12.5.sp,
                                    color = Color(0xFF94A3B8),
                                    lineHeight = 16.sp
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

                // ── Content Area ──
                if (selectedTab == 0) {
                    if (processingOrders.isEmpty()) {
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
                                Icon(Icons.Default.Biotech, contentDescription = null, tint = Color(0xFF94A3B8), modifier = Modifier.size(50.dp))
                                Text(
                                    text = if (searchQuery.isNotBlank()) "No Processing Patients Matching '$searchQuery'" else "No Patients in Processing Yet",
                                    fontWeight = FontWeight.Bold,
                                    fontSize = 16.sp,
                                    color = Color(0xFF0F172A)
                                )
                                Text(
                                    text = "When a patient's sample is marked 'Collected' in the Live Queue, they automatically appear here for lab processing.",
                                    fontSize = 12.sp,
                                    color = Color(0xFF64748B),
                                    textAlign = TextAlign.Center
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
                            items(processingOrders, key = { it.id }) { order ->
                                LabPatientDirectoryStyleCard(
                                    order = order,
                                    onCopyTracking = { code ->
                                        clipboardManager.setText(AnnotatedString(code))
                                        Toast.makeText(context, "Tracking ID copied: $code", Toast.LENGTH_SHORT).show()
                                    },
                                    onCallPatient = { phone ->
                                        try {
                                            context.startActivity(Intent(Intent.ACTION_DIAL, Uri.parse("tel:$phone")))
                                        } catch (ignored: Exception) {}
                                    },
                                    onMarkPreparedClick = {
                                        selectedOrderForPrepare = order
                                        publishTestSummary = order.testName
                                        selectedFileName = order.reportFileName
                                        selectedFileBytes = null
                                    },
                                    onViewReportClick = null
                                )
                            }
                        }
                    }
                } else if (selectedTab == 1) {
                    if (preparedOrders.isEmpty()) {
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
                                Icon(Icons.Default.AssignmentTurnedIn, contentDescription = null, tint = Color(0xFF94A3B8), modifier = Modifier.size(50.dp))
                                Text(
                                    text = if (searchQuery.isNotBlank()) "No Prepared Reports Matching '$searchQuery'" else "No Prepared Reports Yet",
                                    fontWeight = FontWeight.Bold,
                                    fontSize = 16.sp,
                                    color = Color(0xFF0F172A)
                                )
                                Text(
                                    text = "Reports marked Prepared from the Processing tab will be archived here.",
                                    fontSize = 12.sp,
                                    color = Color(0xFF64748B),
                                    textAlign = TextAlign.Center
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
                            items(preparedOrders, key = { it.id }) { order ->
                                LabPatientDirectoryStyleCard(
                                    order = order,
                                    onCopyTracking = { code ->
                                        clipboardManager.setText(AnnotatedString(code))
                                        Toast.makeText(context, "Tracking ID copied: $code", Toast.LENGTH_SHORT).show()
                                    },
                                    onCallPatient = { phone ->
                                        try {
                                            context.startActivity(Intent(Intent.ACTION_DIAL, Uri.parse("tel:$phone")))
                                        } catch (ignored: Exception) {}
                                    },
                                    onMarkPreparedClick = {
                                        selectedOrderForPrepare = order
                                        publishTestSummary = order.testName
                                        selectedFileName = order.reportFileName
                                        selectedFileBytes = null
                                    },
                                    onViewReportClick = {
                                        verifyingOrderForViewing = order
                                        enteredIdentityInput = ""
                                        verificationError = null
                                    }
                                )
                            }
                        }
                    }
                } else {
                    // Tab 2: Live Queue Awaiting Sample Collection
                    if (awaitingSampleAppts.isEmpty()) {
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
                                Icon(Icons.Default.Science, contentDescription = null, tint = Color(0xFF94A3B8), modifier = Modifier.size(50.dp))
                                Text(
                                    text = "No Appointments Awaiting Sample Collection",
                                    fontWeight = FontWeight.Bold,
                                    fontSize = 16.sp,
                                    color = Color(0xFF0F172A)
                                )
                                Text(
                                    text = "New lab bookings appear in the Live Queue and here until their sample is marked 'Collected'.",
                                    fontSize = 12.sp,
                                    color = Color(0xFF64748B),
                                    textAlign = TextAlign.Center
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
                            items(awaitingSampleAppts, key = { it.id }) { appt ->
                                Card(
                                    shape = RoundedCornerShape(20.dp),
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
                                            verticalAlignment = Alignment.CenterVertically,
                                            horizontalArrangement = Arrangement.spacedBy(14.dp)
                                        ) {
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
                                                    text = appt.patientName,
                                                    fontWeight = FontWeight.Bold,
                                                    fontSize = 17.sp,
                                                    color = Color(0xFF0F172A)
                                                )
                                                Row(
                                                    verticalAlignment = Alignment.CenterVertically,
                                                    horizontalArrangement = Arrangement.spacedBy(4.dp)
                                                ) {
                                                    Text(
                                                        text = "${appt.patientAge ?: "--"} yrs | ${appt.patientGender ?: "Male"}",
                                                        fontSize = 12.sp,
                                                        color = Color(0xFF64748B)
                                                    )
                                                    Surface(
                                                        shape = RoundedCornerShape(4.dp),
                                                        color = Color(0xFFF1F5F9),
                                                        modifier = Modifier.clickable {
                                                            clipboardManager.setText(AnnotatedString(appt.trackingCode10Digit))
                                                            Toast.makeText(context, "Tracking ID copied: ${appt.trackingCode10Digit}", Toast.LENGTH_SHORT).show()
                                                        }
                                                    ) {
                                                        Row(
                                                            verticalAlignment = Alignment.CenterVertically,
                                                            horizontalArrangement = Arrangement.spacedBy(2.dp),
                                                            modifier = Modifier.padding(horizontal = 4.dp, vertical = 2.dp)
                                                        ) {
                                                            Text(
                                                                text = "Tracking: ${appt.trackingCode10Digit}",
                                                                fontSize = 11.5.sp,
                                                                fontFamily = FontFamily.Monospace,
                                                                fontWeight = FontWeight.Bold,
                                                                color = Color(0xFF0284C7)
                                                            )
                                                            Icon(Icons.Default.ContentCopy, contentDescription = "Copy", tint = Color(0xFF0284C7), modifier = Modifier.size(11.dp))
                                                        }
                                                    }
                                                }
                                                if (appt.patientMobile.isNotBlank()) {
                                                    Text(
                                                        text = appt.patientMobile,
                                                        fontSize = 11.5.sp,
                                                        fontWeight = FontWeight.SemiBold,
                                                        color = Color(0xFF334155)
                                                    )
                                                }
                                            }

                                            Button(
                                                onClick = {
                                                    coroutineScope.launch {
                                                        queueRepository?.updateQueueStatusByAppointmentId(appt.id, "processing")
                                                        appointmentRepository?.updateCheckinStatus(appt.id, "processing")
                                                        labReportRepository?.upsertLabReportForAppointment(
                                                            appointmentId = appt.id,
                                                            clinicId = effectiveClinicId,
                                                            patientName = appt.patientName,
                                                            testName = appt.selectedLabTests?.takeIf { it.isNotBlank() } ?: "Diagnostic Lab Analysis",
                                                            stage = "processing"
                                                        )
                                                        alertNotice = "✓ Sample collected for ${appt.patientName}! Moved to Processing."
                                                        selectedTab = 0
                                                        loadLabOrders()
                                                    }
                                                },
                                                colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF0F4C81)),
                                                shape = RoundedCornerShape(10.dp),
                                                contentPadding = PaddingValues(horizontal = 12.dp, vertical = 8.dp)
                                            ) {
                                                Icon(Icons.Default.Biotech, contentDescription = null, tint = Color.White, modifier = Modifier.size(15.dp))
                                                Spacer(Modifier.width(5.dp))
                                                Text("Collected", fontWeight = FontWeight.Bold, fontSize = 12.sp, color = Color.White)
                                            }
                                        }

                                        if (!appt.selectedLabTests.isNullOrBlank()) {
                                            HorizontalDivider(color = Color(0xFFE2E8F0))
                                            Text(
                                                text = "Selected Tests: ${appt.selectedLabTests}",
                                                fontSize = 12.5.sp,
                                                fontWeight = FontWeight.SemiBold,
                                                color = Color(0xFF0F4C81)
                                            )
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        // ── Mark Prepared & Optional Report Upload Dialog ──
        selectedOrderForPrepare?.let { order ->
            val isImageSelected = selectedFileName?.lowercase()?.let {
                it.endsWith(".jpg") || it.endsWith(".jpeg") || it.endsWith(".png") || it.endsWith(".webp")
            } == true

            AlertDialog(
                onDismissRequest = {
                    if (!isUploading) selectedOrderForPrepare = null
                },
                title = {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Icon(Icons.Default.AssignmentTurnedIn, contentDescription = null, tint = Color(0xFF059669))
                        Text("Mark Report Prepared", fontWeight = FontWeight.Bold, fontSize = 18.sp)
                    }
                },
                text = {
                    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                        Surface(
                            color = Color(0xFFF8FAFC),
                            shape = RoundedCornerShape(10.dp),
                            border = BorderStroke(1.dp, Color(0xFFE2E8F0)),
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Column(modifier = Modifier.padding(10.dp), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                                Text("Patient: ${order.patientName}", fontSize = 13.5.sp, fontWeight = FontWeight.Bold, color = Color(0xFF0F172A))
                                Text("10-Digit Code: #${order.trackingCode}", fontSize = 12.sp, fontFamily = FontFamily.Monospace, color = Color(0xFF0284C7), fontWeight = FontWeight.SemiBold)
                            }
                        }

                        OutlinedTextField(
                            value = publishTestSummary,
                            onValueChange = { publishTestSummary = it },
                            label = { Text("Tests / Report Summary") },
                            placeholder = { Text("e.g. Complete Blood Count (CBC) - Prepared") },
                            modifier = Modifier.fillMaxWidth(),
                            shape = RoundedCornerShape(10.dp)
                        )

                        Text(
                            text = "Upload Report File (Optional — PDF or Picture):",
                            fontSize = 12.sp,
                            fontWeight = FontWeight.Bold,
                            color = Color(0xFF334155)
                        )

                        if (selectedFileName != null) {
                            Surface(
                                color = Color(0xFFD1FAE5),
                                shape = RoundedCornerShape(10.dp),
                                border = BorderStroke(1.dp, Color(0xFF86EFAC)),
                                modifier = Modifier.fillMaxWidth()
                            ) {
                                Row(
                                    modifier = Modifier.padding(10.dp),
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.SpaceBetween
                                ) {
                                    Row(
                                        verticalAlignment = Alignment.CenterVertically,
                                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                                        modifier = Modifier.weight(1f)
                                    ) {
                                        Icon(
                                            if (isImageSelected) Icons.Default.Image else Icons.Default.PictureAsPdf,
                                            contentDescription = null,
                                            tint = Color(0xFF059669),
                                            modifier = Modifier.size(20.dp)
                                        )
                                        Text(
                                            text = selectedFileName ?: "",
                                            fontSize = 12.sp,
                                            fontWeight = FontWeight.SemiBold,
                                            color = Color(0xFF065F46),
                                            maxLines = 1,
                                            overflow = TextOverflow.Ellipsis
                                        )
                                    }
                                    Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                                        TextButton(onClick = { filePickerLauncher.launch("*/*") }) {
                                            Text("Change", fontSize = 11.sp)
                                        }
                                        IconButton(
                                            onClick = {
                                                selectedFileName = null
                                                selectedFileBytes = null
                                            },
                                            modifier = Modifier.size(24.dp)
                                        ) {
                                            Icon(Icons.Default.Close, contentDescription = "Remove file", tint = Color(0xFF065F46), modifier = Modifier.size(15.dp))
                                        }
                                    }
                                }
                            }
                        } else {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.spacedBy(8.dp)
                            ) {
                                OutlinedButton(
                                    onClick = { filePickerLauncher.launch("application/pdf") },
                                    modifier = Modifier.weight(1f),
                                    shape = RoundedCornerShape(10.dp),
                                    contentPadding = PaddingValues(horizontal = 8.dp, vertical = 10.dp)
                                ) {
                                    Icon(Icons.Default.PictureAsPdf, contentDescription = null, modifier = Modifier.size(16.dp), tint = Color(0xFFDC2626))
                                    Spacer(modifier = Modifier.width(6.dp))
                                    Text("Upload PDF", fontSize = 11.5.sp, fontWeight = FontWeight.SemiBold)
                                }

                                OutlinedButton(
                                    onClick = { filePickerLauncher.launch("image/*") },
                                    modifier = Modifier.weight(1f),
                                    shape = RoundedCornerShape(10.dp),
                                    contentPadding = PaddingValues(horizontal = 8.dp, vertical = 10.dp)
                                ) {
                                    Icon(Icons.Default.Image, contentDescription = null, modifier = Modifier.size(16.dp), tint = Color(0xFF0284C7))
                                    Spacer(modifier = Modifier.width(6.dp))
                                    Text("Upload Picture", fontSize = 11.5.sp, fontWeight = FontWeight.SemiBold)
                                }
                            }
                        }

                        Text(
                            text = "Marking Prepared updates the live queue status to 'Prepared' and immediately sends a notification to ${order.patientName} (and any device tracking #${order.trackingCode}). To view or download the report, the patient must verify their Name or Mobile Number.",
                            fontSize = 11.sp,
                            color = Color(0xFF065F46),
                            fontWeight = FontWeight.Medium
                        )
                    }
                },
                confirmButton = {
                    Button(
                        onClick = {
                            val fName = selectedFileName
                            val bytes = selectedFileBytes
                            val updatedTestName = publishTestSummary.trim().ifBlank { order.testName }

                            isUploading = true
                            coroutineScope.launch {
                                var publicUrl: String? = null
                                val targetReportId = if (order.id.startsWith("synthetic_")) UUID.randomUUID().toString() else order.id
                                if (bytes != null && fName != null && labReportRepository != null) {
                                    publicUrl = labReportRepository.uploadReportDocument(targetReportId, fName, bytes)
                                }

                                val finalUrl = when {
                                    publicUrl != null -> publicUrl
                                    fName != null && order.reportFileUrl != null -> order.reportFileUrl
                                    else -> null
                                }

                                // 1. Upsert or update lab_reports to "prepared" (also sends notification & updates appointment/queue)
                                labReportRepository?.upsertLabReportForAppointment(
                                    appointmentId = order.appointmentId,
                                    clinicId = effectiveClinicId,
                                    patientName = order.patientName,
                                    testName = updatedTestName,
                                    stage = "prepared",
                                    fileUrl = finalUrl,
                                    fileName = fName
                                )

                                // 2. Explicitly ensure queue_entries and appointments reflect "report_prepared"
                                queueRepository?.updateQueueStatusByAppointmentId(order.appointmentId, "report_prepared")
                                appointmentRepository?.updateCheckinStatus(order.appointmentId, "report_prepared")

                                loadLabOrders()
                                isUploading = false
                                alertNotice = if (fName != null) {
                                    "✓ Report marked Prepared with '$fName' & notification sent to ${order.patientName} (#${order.trackingCode})!"
                                } else {
                                    "✓ Status marked Prepared & notification sent to ${order.patientName} (#${order.trackingCode})!"
                                }
                                selectedOrderForPrepare = null
                                selectedTab = 1
                            }
                        },
                        enabled = !isUploading,
                        colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF059669)),
                        shape = RoundedCornerShape(10.dp)
                    ) {
                        Text(
                            if (isUploading) "Updating..." else "Mark Prepared & Notify Patient",
                            fontWeight = FontWeight.Bold,
                            color = Color.White
                        )
                    }
                },
                dismissButton = {
                    TextButton(onClick = { selectedOrderForPrepare = null }, enabled = !isUploading) {
                        Text("Cancel")
                    }
                }
            )
        }

        // ── Name / Mobile Number Security Verification Gate for Viewing Report ──
        verifyingOrderForViewing?.let { order ->
            AlertDialog(
                onDismissRequest = { verifyingOrderForViewing = null },
                title = {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Icon(Icons.Default.VerifiedUser, contentDescription = null, tint = Color(0xFF0F4C81))
                        Text("Verify Patient Name / Number", fontWeight = FontWeight.Bold, fontSize = 17.sp)
                    }
                },
                text = {
                    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text(
                            "Enter the patient's Name or Mobile Number matching the appointment record (#${order.trackingCode}) to view or download the report.",
                            fontSize = 12.sp,
                            color = Color(0xFF475569)
                        )
                        OutlinedTextField(
                            value = enteredIdentityInput,
                            onValueChange = {
                                enteredIdentityInput = it
                                verificationError = null
                            },
                            label = { Text("Patient Name or Mobile Number") },
                            placeholder = { Text("e.g. ${order.patientName}") },
                            singleLine = true,
                            modifier = Modifier.fillMaxWidth(),
                            shape = RoundedCornerShape(10.dp)
                        )
                        if (verificationError != null) {
                            Text(
                                text = verificationError ?: "",
                                color = MaterialTheme.colorScheme.error,
                                fontSize = 11.5.sp,
                                fontWeight = FontWeight.SemiBold
                            )
                        }
                    }
                },
                confirmButton = {
                    Button(
                        onClick = {
                            val input = enteredIdentityInput.trim()
                            val inputDigits = input.filter { it.isDigit() }
                            val targetDigits = order.patientMobile.filter { it.isDigit() }
                            val nameMatches = input.isNotBlank() && (
                                order.patientName.equals(input, ignoreCase = true) ||
                                    order.patientName.lowercase().contains(input.lowercase())
                                )
                            val phoneMatches = inputDigits.length >= 6 && targetDigits.isNotBlank() && (
                                targetDigits.endsWith(inputDigits) || inputDigits.endsWith(targetDigits)
                                )

                            if (nameMatches || phoneMatches) {
                                verifyingOrderForViewing = null
                                val labRep = com.dactor.clinic.data.model.LabReport(
                                    id = order.id,
                                    appointmentId = order.appointmentId,
                                    clinicId = effectiveClinicId,
                                    testName = order.testName,
                                    stage = "prepared",
                                    fileUrl = order.reportFileUrl,
                                    fileName = order.reportFileName,
                                    fileType = order.fileType,
                                    patientNameVerification = order.patientName
                                )
                                com.dactor.clinic.domain.util.LabReportPdfDownloader.downloadAndSaveReportFile(
                                    context = context,
                                    report = labRep,
                                    patientName = order.patientName,
                                    clinicName = "Dactor Diagnostic & Pathology Lab"
                                )
                            } else {
                                verificationError = "Name or Mobile Number does not match the patient record."
                            }
                        },
                        colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF0F4C81)),
                        shape = RoundedCornerShape(10.dp)
                    ) {
                        Text("Verify & Open Report", fontWeight = FontWeight.Bold)
                    }
                },
                dismissButton = {
                    TextButton(onClick = { verifyingOrderForViewing = null }) {
                        Text("Cancel")
                    }
                }
            )
        }
    }
}

@Composable
private fun LabPatientDirectoryStyleCard(
    order: LabOrderUi,
    onCopyTracking: (String) -> Unit,
    onCallPatient: (String) -> Unit,
    onMarkPreparedClick: () -> Unit,
    onViewReportClick: (() -> Unit)?
) {
    val isPrepared = order.stage == "prepared"
    val hasUploadedFile = !order.reportFileUrl.isNullOrBlank() || !order.reportFileName.isNullOrBlank()
    val isImageFile = order.fileType == "image" || (order.reportFileName?.lowercase()?.let {
        it.endsWith(".jpg") || it.endsWith(".jpeg") || it.endsWith(".png") || it.endsWith(".webp")
    } == true)

    Card(
        shape = RoundedCornerShape(20.dp),
        colors = CardDefaults.cardColors(containerColor = Color.White),
        border = BorderStroke(1.dp, Color(0xFFE2E8F0)),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp),
        modifier = Modifier.fillMaxWidth()
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            // Header: Avatar, Name, Age/Gender, Tracking, Phone & Call Button (Matching PatientDirectoryScreen)
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(14.dp)
            ) {
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
                        text = order.patientName,
                        fontWeight = FontWeight.Bold,
                        fontSize = 17.sp,
                        color = Color(0xFF0F172A),
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )

                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(4.dp)
                    ) {
                        Text(
                            text = "${order.patientAge ?: "--"} yrs | ${order.patientGender}",
                            fontSize = 12.sp,
                            color = Color(0xFF64748B)
                        )

                        Surface(
                            shape = RoundedCornerShape(4.dp),
                            color = Color(0xFFF1F5F9),
                            modifier = Modifier.clickable { onCopyTracking(order.trackingCode) }
                        ) {
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(2.dp),
                                modifier = Modifier.padding(horizontal = 4.dp, vertical = 2.dp)
                            ) {
                                Text(
                                    text = "Tracking: ${order.trackingCode}",
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

                    if (order.patientMobile.isNotBlank()) {
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
                                text = order.patientMobile,
                                fontSize = 11.5.sp,
                                fontWeight = FontWeight.SemiBold,
                                color = Color(0xFF334155)
                            )
                        }
                    }
                }

                if (order.patientMobile.isNotBlank()) {
                    Surface(
                        shape = RoundedCornerShape(10.dp),
                        color = Color(0xFFDCFCE7),
                        modifier = Modifier.clickable { onCallPatient(order.patientMobile) }
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

            // Lab Tests & Schedule Details
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    Icon(
                        Icons.Default.Science,
                        contentDescription = null,
                        tint = Color(0xFF0284C7),
                        modifier = Modifier.size(15.dp)
                    )
                    Text(
                        text = "Tests: ${order.testName}",
                        fontSize = 13.sp,
                        fontWeight = FontWeight.Bold,
                        color = Color(0xFF0284C7)
                    )
                }

                val scheduleStr = buildList {
                    if (order.appointmentDate.isNotBlank()) add("${order.appointmentDate} ${order.appointmentTime}".trim())
                    if (order.feeAmount > 0) add("Total: ${CurrencyFormatter.formatNPR(order.feeAmount)}")
                }.joinToString(" • ")

                if (scheduleStr.isNotBlank()) {
                    Text(
                        text = scheduleStr,
                        fontSize = 12.sp,
                        color = Color(0xFF475569),
                        modifier = Modifier.padding(start = 21.dp)
                    )
                }
            }

            // Bottom Status Bar Matching PatientDirectoryScreen Template
            Surface(
                color = if (isPrepared) Color(0xFFECFDF5) else Color(0xFFFFFBEB),
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
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                        modifier = Modifier.weight(1f)
                    ) {
                        Icon(
                            if (isPrepared) Icons.Default.CheckCircle else Icons.Default.Biotech,
                            contentDescription = null,
                            tint = if (isPrepared) Color(0xFF059669) else Color(0xFFD97706),
                            modifier = Modifier.size(17.dp)
                        )
                        Text(
                            text = if (isPrepared) {
                                if (hasUploadedFile) "Prepared • File: ${order.reportFileName ?: "Attached"}"
                                else "Report Prepared • Patient Notified"
                            } else {
                                "Sample Collected • Under Lab Processing"
                            },
                            fontSize = 11.5.sp,
                            fontWeight = FontWeight.SemiBold,
                            color = if (isPrepared) Color(0xFF065F46) else Color(0xFF92400E),
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis
                        )
                    }

                    Surface(
                        color = if (isPrepared) Color(0xFFD1FAE5) else Color(0xFFFEF3C7),
                        shape = RoundedCornerShape(8.dp)
                    ) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(4.dp),
                            modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
                        ) {
                            Icon(
                                if (isPrepared) (if (isImageFile) Icons.Default.Image else Icons.Default.TaskAlt) else Icons.Default.HourglassTop,
                                contentDescription = null,
                                tint = if (isPrepared) Color(0xFF065F46) else Color(0xFF92400E),
                                modifier = Modifier.size(13.dp)
                            )
                            Text(
                                text = if (isPrepared) "PREPARED" else "PROCESSING",
                                color = if (isPrepared) Color(0xFF065F46) else Color(0xFF92400E),
                                fontSize = 10.5.sp,
                                fontWeight = FontWeight.Bold
                            )
                        }
                    }
                }
            }

            // Action Buttons Row
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                if (!isPrepared) {
                    Button(
                        onClick = onMarkPreparedClick,
                        shape = RoundedCornerShape(10.dp),
                        colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF059669)),
                        contentPadding = PaddingValues(horizontal = 12.dp, vertical = 8.dp),
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(40.dp)
                    ) {
                        Icon(
                            Icons.Default.AssignmentTurnedIn,
                            contentDescription = null,
                            tint = Color.White,
                            modifier = Modifier.size(16.dp)
                        )
                        Spacer(Modifier.width(6.dp))
                        Text(
                            text = "Mark Prepared (Optional PDF / Photo Upload)",
                            color = Color.White,
                            fontSize = 12.sp,
                            fontWeight = FontWeight.Bold
                        )
                    }
                } else {
                    OutlinedButton(
                        onClick = onMarkPreparedClick,
                        shape = RoundedCornerShape(10.dp),
                        border = BorderStroke(1.dp, Color(0xFF0097A7)),
                        contentPadding = PaddingValues(horizontal = 10.dp, vertical = 6.dp),
                        modifier = Modifier
                            .weight(1f)
                            .height(38.dp)
                    ) {
                        Icon(
                            Icons.Default.UploadFile,
                            contentDescription = null,
                            tint = Color(0xFF0097A7),
                            modifier = Modifier.size(15.dp)
                        )
                        Spacer(Modifier.width(5.dp))
                        Text(
                            text = if (hasUploadedFile) "Update PDF/Photo" else "Upload PDF/Photo",
                            color = Color(0xFF0097A7),
                            fontSize = 11.5.sp,
                            fontWeight = FontWeight.Bold
                        )
                    }

                    if (onViewReportClick != null) {
                        Button(
                            onClick = onViewReportClick,
                            shape = RoundedCornerShape(10.dp),
                            colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF0F766E)),
                            contentPadding = PaddingValues(horizontal = 10.dp, vertical = 6.dp),
                            modifier = Modifier
                                .weight(1f)
                                .height(38.dp)
                        ) {
                            Icon(
                                Icons.Default.Visibility,
                                contentDescription = null,
                                tint = Color.White,
                                modifier = Modifier.size(15.dp)
                            )
                            Spacer(Modifier.width(5.dp))
                            Text(
                                text = "View Report",
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
}
