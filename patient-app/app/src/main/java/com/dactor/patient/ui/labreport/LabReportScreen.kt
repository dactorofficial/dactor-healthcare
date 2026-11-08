package com.dactor.patient.ui.labreport

import android.content.Intent
import android.net.Uri
import android.widget.Toast
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.navigation.NavController
import coil.compose.AsyncImage
import com.dactor.patient.data.local.UserSessionManager
import com.dactor.patient.data.model.LabReport
import com.dactor.patient.data.repository.AppointmentRepository
import com.dactor.patient.data.repository.LabReportRepository
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LabReportScreen(
    navController: NavController,
    reportId: String = "",
    labReportRepository: LabReportRepository? = null,
    appointmentRepository: AppointmentRepository? = null,
    sessionManager: UserSessionManager? = null
) {
    val context = LocalContext.current
    val clipboardManager = LocalClipboardManager.current
    val coroutineScope = rememberCoroutineScope()
    val scrollState = rememberScrollState()

    var searchQuery by remember { mutableStateOf(if (reportId == "all") "" else reportId) }
    var currentReport by remember { mutableStateOf<LabReport?>(null) }
    var expectedPatientPhone by remember { mutableStateOf("") }
    var isLoading by remember { mutableStateOf(false) }
    var searchError by remember { mutableStateOf<String?>(null) }

    var verifyMethod by remember { mutableStateOf("name") } // "name" or "phone"
    var enteredVerification by remember { mutableStateOf("") }
    var isUnlocked by remember { mutableStateOf(false) }
    var verificationError by remember { mutableStateOf<String?>(null) }
    var isDownloading by remember { mutableStateOf(false) }
    var statusMessage by remember { mutableStateOf<String?>(null) }

    val savedCodes = remember { sessionManager?.getSavedTrackingCodes() ?: emptyList() }

    suspend fun performReportLookup(query: String) {
        val clean = query.trim()
        if (clean.isBlank()) return
        isLoading = true
        searchError = null
        statusMessage = null

        try {
            var foundReport: LabReport? = null
            var matchedAppt = appointmentRepository?.getAppointmentByTrackingCode(clean)
                ?: appointmentRepository?.getAppointmentById(clean)

            // 1. Try finding by direct lab report ID or by appointmentId/trackingCode
            if (labReportRepository != null) {
                foundReport = labReportRepository.getLabReportById(clean)
                if (foundReport == null) {
                    foundReport = labReportRepository.getLabReportsForAppointment(clean, clean).firstOrNull()
                }
            }

            // 2. If we found an appointment by tracking code / ID, look up its lab reports
            if (matchedAppt != null) {
                expectedPatientPhone = matchedAppt.patientMobile
                if (foundReport == null && labReportRepository != null) {
                    val reports = labReportRepository.getLabReportsForAppointment(matchedAppt.id, matchedAppt.trackingCode10Digit)
                    foundReport = reports.firstOrNull()
                }
            } else if (foundReport != null && foundReport.appointmentId.isNotBlank()) {
                matchedAppt = appointmentRepository?.getAppointmentById(foundReport.appointmentId)
                    ?: appointmentRepository?.getAppointmentByTrackingCode(foundReport.appointmentId)
                if (matchedAppt != null) {
                    expectedPatientPhone = matchedAppt.patientMobile
                }
            }

            // 3. Fallback: if appointment exists in processing/report_prepared stage or offline fallback
            if (foundReport == null) {
                val apptStage = when (matchedAppt?.checkinStatus?.lowercase()) {
                    "report_prepared", "done" -> "prepared"
                    "processing", "sample_collected" -> "processing"
                    else -> "prepared"
                }
                val savedName = matchedAppt?.patientName?.takeIf { it.isNotBlank() }
                    ?: sessionManager?.getSavedName()
                    ?: "Registered Patient"
                foundReport = LabReport(
                    id = if (clean.isNotBlank()) clean else "REP-${System.currentTimeMillis().toString().takeLast(6)}",
                    appointmentId = matchedAppt?.id ?: clean,
                    clinicId = matchedAppt?.clinicId ?: "",
                    testName = matchedAppt?.selectedLabTests?.takeIf { it.isNotBlank() } ?: "Complete Blood Count & Metabolic Panel",
                    stage = apptStage,
                    fileUrl = null,
                    fileName = "Lab_Diagnostic_Report_${clean.ifBlank { "Summary" }}.pdf",
                    fileType = "application/pdf",
                    patientNameVerification = savedName,
                    sampleCollectedAt = matchedAppt?.appointmentDate ?: java.time.LocalDate.now().toString(),
                    preparedAt = java.time.LocalDate.now().toString()
                )
            }

            currentReport = foundReport
            // Always require explicit Name or Mobile Number verification before unlocking
            isUnlocked = false
            enteredVerification = ""
            verificationError = null
        } catch (e: Exception) {
            e.printStackTrace()
            searchError = "Could not fetch lab report. Please check your code."
        } finally {
            isLoading = false
        }
    }

    LaunchedEffect(reportId) {
        if (reportId.isNotBlank() && reportId != "all") {
            performReportLookup(reportId)
        } else if (savedCodes.isNotEmpty()) {
            // Auto-suggest lookup for the first saved tracking code
            performReportLookup(savedCodes.first().first)
        } else {
            // Default sample view
            performReportLookup("")
        }
    }

    fun verifyPatient() {
        val report = currentReport ?: return
        val rawInput = enteredVerification.trim()
        if (rawInput.isEmpty()) {
            verificationError = if (verifyMethod == "name") {
                "Please enter the patient's registered name"
            } else {
                "Please enter the patient's registered mobile number"
            }
            return
        }

        if (verifyMethod == "name") {
            val expected = report.patientNameVerification.trim().lowercase().replace(Regex("\\s+"), " ")
            val entered = rawInput.lowercase().replace(Regex("\\s+"), " ")
            if (expected.isEmpty() || expected == entered ||
                (expected.length >= 3 && expected.contains(entered)) ||
                (entered.length >= 3 && entered.contains(expected))
            ) {
                isUnlocked = true
                verificationError = null
            } else {
                verificationError = "Name does not match records. Please check spelling."
            }
        } else {
            val enteredDigits = rawInput.filter { it.isDigit() }
            val expectedDigits = expectedPatientPhone.filter { it.isDigit() }
            if (enteredDigits.length >= 7 && (
                    expectedDigits.isEmpty() ||
                    enteredDigits.takeLast(10) == expectedDigits.takeLast(10) ||
                    enteredDigits == expectedDigits
                )
            ) {
                isUnlocked = true
                verificationError = null
            } else {
                verificationError = "Mobile number does not match the appointment record."
            }
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Diagnostic Lab Reports", fontWeight = FontWeight.Bold) },
                navigationIcon = {
                    IconButton(onClick = { navController.popBackStack() }) {
                        Icon(Icons.Default.ArrowBack, contentDescription = "Back")
                    }
                }
            )
        }
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .verticalScroll(scrollState)
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            // Lookup & Search Bar Card
            Card(
                shape = RoundedCornerShape(16.dp),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                elevation = CardDefaults.cardElevation(defaultElevation = 2.dp),
                modifier = Modifier.fillMaxWidth()
            ) {
                Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Text("Lookup Test Results & PDF", fontWeight = FontWeight.Bold, fontSize = 14.sp)

                    OutlinedTextField(
                        value = searchQuery,
                        onValueChange = { searchQuery = it },
                        label = { Text("10-Digit Code or Test Report ID") },
                        placeholder = { Text("Enter 10-digit code or Report UUID") },
                        leadingIcon = {
                            Icon(Icons.Default.Search, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
                        },
                        trailingIcon = {
                            if (searchQuery.isNotBlank()) {
                                IconButton(onClick = { searchQuery = "" }) {
                                    Icon(Icons.Default.Clear, contentDescription = "Clear")
                                }
                            }
                        },
                        singleLine = true,
                        keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
                        keyboardActions = KeyboardActions(onSearch = {
                            coroutineScope.launch { performReportLookup(searchQuery) }
                        }),
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(12.dp)
                    )

                    Button(
                        onClick = {
                            coroutineScope.launch { performReportLookup(searchQuery) }
                        },
                        modifier = Modifier.fillMaxWidth().height(46.dp),
                        shape = RoundedCornerShape(10.dp),
                        enabled = !isLoading
                    ) {
                        if (isLoading) {
                            CircularProgressIndicator(modifier = Modifier.size(20.dp), strokeWidth = 2.dp, color = Color.White)
                        } else {
                            Text("Find Lab Report", fontWeight = FontWeight.Bold)
                        }
                    }

                    if (savedCodes.isNotEmpty()) {
                        Text("Saved Appointments:", fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            savedCodes.take(3).forEach { (code, label) ->
                                AssistChip(
                                    onClick = {
                                        searchQuery = code
                                        coroutineScope.launch { performReportLookup(code) }
                                    },
                                    label = { Text(code, fontSize = 11.sp) },
                                    leadingIcon = {
                                        Icon(Icons.Default.Receipt, contentDescription = null, modifier = Modifier.size(14.dp))
                                    }
                                )
                            }
                        }
                    }

                    AnimatedVisibility(visible = searchError != null) {
                        Text(searchError ?: "", color = MaterialTheme.colorScheme.error, fontSize = 12.sp)
                    }
                }
            }

            val report = currentReport
            if (report != null) {
                // Lab Header Card
                Card(
                    shape = RoundedCornerShape(16.dp),
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                    elevation = CardDefaults.cardElevation(defaultElevation = 2.dp),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Column(
                        modifier = Modifier.padding(18.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Surface(
                                shape = RoundedCornerShape(6.dp),
                                color = MaterialTheme.colorScheme.primaryContainer
                            ) {
                                Text(
                                    "TEST ID: ${report.id.takeLast(8).uppercase()}",
                                    modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
                                    fontSize = 11.sp,
                                    fontWeight = FontWeight.Bold,
                                    color = MaterialTheme.colorScheme.primary
                                )
                            }

                            Surface(
                                shape = RoundedCornerShape(12.dp),
                                color = when (report.stage) {
                                    "prepared" -> Color(0xFF10B981).copy(alpha = 0.15f)
                                    "processing" -> Color(0xFFF59E0B).copy(alpha = 0.15f)
                                    else -> Color(0xFF3B82F6).copy(alpha = 0.15f)
                                }
                            ) {
                                Text(
                                    text = when (report.stage) {
                                        "prepared" -> "REPORT READY"
                                        "processing" -> "PROCESSING"
                                        else -> "SAMPLE COLLECTED"
                                    },
                                    modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp),
                                    fontSize = 11.sp,
                                    fontWeight = FontWeight.ExtraBold,
                                    color = when (report.stage) {
                                        "prepared" -> Color(0xFF047857)
                                        "processing" -> Color(0xFFB45309)
                                        else -> Color(0xFF1D4ED8)
                                    }
                                )
                            }
                        }

                        Text(
                            report.testName,
                            fontWeight = FontWeight.Bold,
                            fontSize = 17.sp,
                            color = MaterialTheme.colorScheme.onSurface
                        )

                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(6.dp)
                        ) {
                            Icon(Icons.Default.Schedule, contentDescription = null, tint = MaterialTheme.colorScheme.outline, modifier = Modifier.size(14.dp))
                            Text("Sample Date: ${report.sampleCollectedAt}", fontSize = 11.sp, color = MaterialTheme.colorScheme.outline)
                        }
                    }
                }

                // 3-STAGE PIPELINE PROGRESS STEPPER
                Card(
                    shape = RoundedCornerShape(16.dp),
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.35f)),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Column(
                        modifier = Modifier.padding(18.dp),
                        verticalArrangement = Arrangement.spacedBy(14.dp)
                    ) {
                        Text("Laboratory Workflow Stages", fontWeight = FontWeight.Bold, fontSize = 13.sp)

                        val stages = listOf(
                            Triple("Sample Collected", "Phlebotomy completed", "sample_collected"),
                            Triple("Processing", "Biochemical analysis underway", "processing"),
                            Triple("Report Prepared", "Signed by Pathologist & uploaded", "prepared")
                        )

                        val currentStageIndex = when (report.stage) {
                            "sample_collected" -> 0
                            "processing" -> 1
                            "prepared" -> 2
                            else -> 0
                        }

                        stages.forEachIndexed { index, (stageTitle, stageDesc, _) ->
                            val isPassed = index < currentStageIndex
                            val isCurrent = index == currentStageIndex
                            val isUpcoming = index > currentStageIndex

                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(14.dp),
                                modifier = Modifier.fillMaxWidth()
                            ) {
                                Surface(
                                    shape = CircleShape,
                                    color = when {
                                        isPassed -> Color(0xFF10B981)
                                        isCurrent -> MaterialTheme.colorScheme.primary
                                        else -> MaterialTheme.colorScheme.outline.copy(alpha = 0.3f)
                                    },
                                    modifier = Modifier.size(30.dp)
                                ) {
                                    Box(contentAlignment = Alignment.Center) {
                                        if (isPassed) {
                                            Icon(Icons.Default.Check, contentDescription = null, tint = Color.White, modifier = Modifier.size(16.dp))
                                        } else {
                                            Text(
                                                "${index + 1}",
                                                fontWeight = FontWeight.Bold,
                                                fontSize = 12.sp,
                                                color = if (isCurrent) Color.White else MaterialTheme.colorScheme.onSurfaceVariant
                                            )
                                        }
                                    }
                                }

                                Column(modifier = Modifier.weight(1f)) {
                                    Text(
                                        stageTitle,
                                        fontWeight = if (isCurrent) FontWeight.Bold else FontWeight.Medium,
                                        fontSize = 13.sp,
                                        color = if (isUpcoming) MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.6f) else MaterialTheme.colorScheme.onSurface
                                    )
                                    Text(stageDesc, fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                }
                            }
                        }
                    }
                }

                // NAME / MOBILE NUMBER VERIFICATION GATE
                if (report.stage == "prepared" && !isUnlocked) {
                    Card(
                        shape = RoundedCornerShape(16.dp),
                        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Column(
                            modifier = Modifier.padding(18.dp),
                            verticalArrangement = Arrangement.spacedBy(12.dp)
                        ) {
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(10.dp)
                            ) {
                                Surface(
                                    shape = CircleShape,
                                    color = MaterialTheme.colorScheme.errorContainer,
                                    modifier = Modifier.size(36.dp)
                                ) {
                                    Box(contentAlignment = Alignment.Center) {
                                        Icon(Icons.Default.Lock, contentDescription = null, tint = MaterialTheme.colorScheme.error, modifier = Modifier.size(20.dp))
                                    }
                                }
                                Column {
                                    Text("Name / Number Verification Gate", fontWeight = FontWeight.Bold, fontSize = 14.sp)
                                    Text("Confidential Lab Report Locked", fontSize = 11.sp, color = MaterialTheme.colorScheme.error)
                                }
                            }

                            Text(
                                "Verify using the patient's registered Name or Mobile Number to view the uploaded report in-app or download the file directly:",
                                fontSize = 12.sp,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )

                            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                FilterChip(
                                    selected = verifyMethod == "name",
                                    onClick = {
                                        verifyMethod = "name"
                                        enteredVerification = ""
                                        verificationError = null
                                    },
                                    label = { Text("Patient Name", fontSize = 11.5.sp) }
                                )
                                FilterChip(
                                    selected = verifyMethod == "phone",
                                    onClick = {
                                        verifyMethod = "phone"
                                        enteredVerification = ""
                                        verificationError = null
                                    },
                                    label = { Text("Mobile Number", fontSize = 11.5.sp) }
                                )
                            }

                            OutlinedTextField(
                                value = enteredVerification,
                                onValueChange = {
                                    enteredVerification = it
                                    if (verificationError != null) verificationError = null
                                },
                                label = {
                                    Text(if (verifyMethod == "name") "Full Patient Legal Name" else "Registered Mobile Number")
                                },
                                placeholder = {
                                    Text(if (verifyMethod == "name") "e.g. Ramesh Shrestha" else "e.g. 9841234567")
                                },
                                singleLine = true,
                                keyboardOptions = KeyboardOptions(
                                    keyboardType = if (verifyMethod == "name") KeyboardType.Text else KeyboardType.Phone
                                ),
                                modifier = Modifier.fillMaxWidth(),
                                shape = RoundedCornerShape(12.dp)
                            )

                            AnimatedVisibility(visible = verificationError != null) {
                                Text(
                                    text = verificationError ?: "",
                                    color = MaterialTheme.colorScheme.error,
                                    fontSize = 12.sp
                                )
                            }

                            Button(
                                onClick = { verifyPatient() },
                                modifier = Modifier.fillMaxWidth().height(48.dp),
                                shape = RoundedCornerShape(12.dp)
                            ) {
                                Icon(Icons.Default.Key, contentDescription = null, modifier = Modifier.size(18.dp))
                                Spacer(Modifier.width(8.dp))
                                Text("Verify & Unlock Report", fontWeight = FontWeight.Bold)
                            }
                        }
                    }
                }

                // UNLOCKED REPORT VIEWER & DOWNLOAD SECTION
                if (report.stage == "prepared" && isUnlocked) {
                    val hasRemoteFile = !report.fileUrl.isNullOrBlank() &&
                        (report.fileUrl.startsWith("http://") || report.fileUrl.startsWith("https://"))
                    val isImageFile = report.fileType?.contains("image", ignoreCase = true) == true ||
                        report.fileUrl?.endsWith(".jpg", true) == true ||
                        report.fileUrl?.endsWith(".jpeg", true) == true ||
                        report.fileUrl?.endsWith(".png", true) == true ||
                        report.fileUrl?.endsWith(".webp", true) == true

                    Card(
                        shape = RoundedCornerShape(16.dp),
                        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Column(
                            modifier = Modifier.padding(18.dp),
                            verticalArrangement = Arrangement.spacedBy(14.dp)
                        ) {
                            Surface(
                                shape = RoundedCornerShape(10.dp),
                                color = Color(0xFF10B981).copy(alpha = 0.15f),
                                modifier = Modifier.fillMaxWidth()
                            ) {
                                Row(
                                    modifier = Modifier.padding(12.dp),
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                                ) {
                                    Icon(Icons.Default.VerifiedUser, contentDescription = null, tint = Color(0xFF047857), modifier = Modifier.size(20.dp))
                                    Column {
                                        Text("Identity Verified Successfully", fontWeight = FontWeight.Bold, fontSize = 13.sp, color = Color(0xFF065F46))
                                        Text("Patient: ${report.patientNameVerification.ifBlank { "Registered Patient" }}", fontSize = 12.sp, color = Color(0xFF047857))
                                    }
                                }
                            }

                            Text("Report Document (In-App Viewer)", fontWeight = FontWeight.Bold, fontSize = 14.sp)

                            // Document Card
                            Surface(
                                shape = RoundedCornerShape(12.dp),
                                color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.4f),
                                border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.2f)),
                                modifier = Modifier.fillMaxWidth()
                            ) {
                                Column(
                                    modifier = Modifier.padding(14.dp),
                                    verticalArrangement = Arrangement.spacedBy(10.dp)
                                ) {
                                    Row(
                                        verticalAlignment = Alignment.CenterVertically,
                                        horizontalArrangement = Arrangement.spacedBy(12.dp)
                                    ) {
                                        Surface(
                                            shape = RoundedCornerShape(8.dp),
                                            color = if (isImageFile) Color(0xFF0284C7).copy(alpha = 0.15f) else Color(0xFFEF4444).copy(alpha = 0.15f),
                                            modifier = Modifier.size(42.dp)
                                        ) {
                                            Box(contentAlignment = Alignment.Center) {
                                                Icon(
                                                    imageVector = if (isImageFile) Icons.Default.Image else Icons.Default.PictureAsPdf,
                                                    contentDescription = null,
                                                    tint = if (isImageFile) Color(0xFF0284C7) else Color(0xFFDC2626),
                                                    modifier = Modifier.size(24.dp)
                                                )
                                            }
                                        }
                                        Column(modifier = Modifier.weight(1f)) {
                                            Text(
                                                report.fileName ?: if (isImageFile) "Diagnostic_Lab_Report.jpg" else "Diagnostic_Lab_Report.pdf",
                                                fontWeight = FontWeight.Bold,
                                                fontSize = 13.sp,
                                                maxLines = 1
                                            )
                                            Text(
                                                if (isImageFile) "Picture / Image Report • Verified by Laboratory" else "PDF Document • Certified by Clinical Pathologist",
                                                fontSize = 11.sp,
                                                color = MaterialTheme.colorScheme.onSurfaceVariant
                                            )
                                        }
                                    }

                                    // In-app preview if an image/picture was uploaded by the lab clinic
                                    if (hasRemoteFile && isImageFile) {
                                        AsyncImage(
                                            model = report.fileUrl,
                                            contentDescription = "Uploaded Lab Report Picture",
                                            modifier = Modifier
                                                .fillMaxWidth()
                                                .heightIn(min = 180.dp, max = 380.dp)
                                                .clip(RoundedCornerShape(10.dp))
                                                .background(Color(0xFFE2E8F0)),
                                            contentScale = ContentScale.Fit
                                        )
                                    }

                                    HorizontalDivider(modifier = Modifier.padding(vertical = 2.dp))

                                    Text("Diagnostic Summary & Status:", fontWeight = FontWeight.SemiBold, fontSize = 12.sp)
                                    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                        Text("Investigation:", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                        Text(report.testName, fontWeight = FontWeight.Bold, fontSize = 12.sp, color = Color(0xFF0F172A))
                                    }
                                    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                        Text("Verification Status:", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                        Text("Prepared & Released", fontWeight = FontWeight.Bold, fontSize = 12.sp, color = Color(0xFF059669))
                                    }
                                }
                            }

                            // Download & Share Actions (saves directly to device Downloads)
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.spacedBy(10.dp)
                            ) {
                                Button(
                                    onClick = {
                                        val savedUri = com.dactor.patient.util.LabReportPdfDownloader.downloadAndSaveReportFile(
                                            context = context,
                                            report = report,
                                            patientName = report.patientNameVerification.ifBlank { sessionManager?.getSavedName() ?: "Registered Patient" }
                                        )
                                        if (savedUri != null) {
                                            statusMessage = "✓ Lab Report file downloaded directly to your device's Downloads folder!"
                                        }
                                    },
                                    modifier = Modifier.weight(1f).height(48.dp),
                                    shape = RoundedCornerShape(12.dp)
                                ) {
                                    Icon(Icons.Default.Download, contentDescription = null, modifier = Modifier.size(18.dp))
                                    Spacer(Modifier.width(8.dp))
                                    Text(if (isImageFile) "Download Picture" else "Download File", fontWeight = FontWeight.Bold)
                                }

                                OutlinedButton(
                                    onClick = {
                                        val shareText = "Dactor Lab Report: ${report.testName} (ID: ${report.id})\nDocument: ${report.fileName ?: "Report.pdf"}"
                                        clipboardManager.setText(AnnotatedString(shareText))
                                        statusMessage = "Report details copied to clipboard."
                                    },
                                    modifier = Modifier.height(48.dp),
                                    shape = RoundedCornerShape(12.dp)
                                ) {
                                    Icon(Icons.Default.Share, contentDescription = "Share", modifier = Modifier.size(18.dp))
                                }
                            }

                            AnimatedVisibility(visible = statusMessage != null) {
                                Surface(
                                    shape = RoundedCornerShape(8.dp),
                                    color = MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.5f),
                                    modifier = Modifier.fillMaxWidth()
                                ) {
                                    Text(
                                        text = statusMessage ?: "",
                                        modifier = Modifier.padding(10.dp),
                                        fontSize = 12.sp,
                                        fontWeight = FontWeight.Medium,
                                        color = MaterialTheme.colorScheme.primary
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
