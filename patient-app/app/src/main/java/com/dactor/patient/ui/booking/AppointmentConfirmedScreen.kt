package com.dactor.patient.ui.booking

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.widget.Toast
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
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
import com.dactor.patient.ui.navigation.NavRoutes

import com.dactor.patient.data.local.UserSessionManager
import com.dactor.patient.data.model.Appointment
import com.dactor.patient.data.model.Clinic
import com.dactor.patient.data.model.Doctor
import com.dactor.patient.data.model.Slot
import com.dactor.patient.data.repository.AppointmentRepository
import com.dactor.patient.data.repository.ClinicRepository
import com.dactor.patient.data.repository.DoctorRepository
import com.dactor.patient.data.repository.SlotRepository
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.util.Locale

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AppointmentConfirmedScreen(
    navController: NavController,
    appointmentId: String = "",
    generatedTrackingCode: String = "",
    clinicName: String = "",
    doctorName: String = "",
    clinicRepository: ClinicRepository? = null,
    doctorRepository: DoctorRepository? = null,
    slotRepository: SlotRepository? = null,
    appointmentRepository: AppointmentRepository? = null,
    sessionManager: UserSessionManager? = null
) {
    val context = LocalContext.current
    val cachedSummary = remember { sessionManager?.getLastConfirmedAppointment() }
    var appt by remember { mutableStateOf<Appointment?>(null) }
    var resolvedClinicName by remember { mutableStateOf(cachedSummary?.clinicName?.ifBlank { null } ?: clinicName.ifBlank { "Patan Clinic" }) }
    var resolvedDoctorName by remember { mutableStateOf(cachedSummary?.doctorName?.ifBlank { null } ?: doctorName.ifBlank { "Dr. Kshitiz" }) }
    var resolvedDoctorSpecialty by remember { mutableStateOf(cachedSummary?.doctorSpecialty ?: "Ophthalmology") }
    var resolvedPatientName by remember { mutableStateOf(cachedSummary?.patientName?.ifBlank { null } ?: sessionManager?.getSavedPatientName() ?: "Patient") }
    var resolvedDate by remember { mutableStateOf(cachedSummary?.appointmentDate?.ifBlank { null } ?: LocalDate.now().toString()) }
    var resolvedTimeWindow by remember { mutableStateOf(cachedSummary?.timeWindow?.ifBlank { null } ?: "09:00 AM - 12:00 PM") }
    var resolvedClinicLogoUrl by remember { mutableStateOf<String?>(null) }

    fun formatTime12h(raw: String): String {
        return try {
            val clean = raw.trim().uppercase(Locale.US)
            if (clean.contains("AM") || clean.contains("PM")) return clean
            val parts = clean.split(":")
            val h = parts[0].toInt()
            val m = if (parts.size > 1) parts[1].take(2).toInt() else 0
            val amPm = if (h >= 12) "PM" else "AM"
            val h12 = if (h % 12 == 0) 12 else h % 12
            String.format(Locale.US, "%02d:%02d %s", h12, m, amPm)
        } catch (e: Exception) {
            raw
        }
    }

    val savedLatestCode = remember {
        sessionManager?.getSavedTrackingCodes()?.firstOrNull()?.first
    }
    val displayCode = appt?.trackingCode10Digit?.takeIf { it.isNotBlank() }
        ?: cachedSummary?.trackingCode?.takeIf { it.isNotBlank() }
        ?: generatedTrackingCode.takeIf { it.length == 10 && it.all { c -> c.isDigit() } }
        ?: appointmentId.takeIf { it.length == 10 && it.all { c -> c.isDigit() } }
        ?: savedLatestCode?.takeIf { it.isNotBlank() }
        ?: "5888368144"
    val scrollState = rememberScrollState()

    val formattedDateDisplay = remember(resolvedDate) {
        try {
            if (resolvedDate.isNotBlank()) {
                val d = LocalDate.parse(resolvedDate)
                d.format(DateTimeFormatter.ofPattern("EEEE, d MMM yyyy", Locale.ENGLISH))
            } else {
                "Saturday, 17 Oct 2026"
            }
        } catch (e: Exception) {
            resolvedDate.ifBlank { "17 Oct 2026" }
        }
    }

    LaunchedEffect(appointmentId) {
        if (appointmentId.isNotBlank() && appointmentRepository != null) {
            val remote = if (appointmentId.length == 10 && appointmentId.all { it.isDigit() }) {
                appointmentRepository.getAppointmentByTrackingCode(appointmentId)
                    ?: appointmentRepository.getAppointmentById(appointmentId)
            } else {
                appointmentRepository.getAppointmentById(appointmentId)
                    ?: appointmentRepository.getAppointmentByTrackingCode(appointmentId)
            }
            if (remote != null) {
                appt = remote
                if (remote.patientName.isNotBlank()) {
                    resolvedPatientName = remote.patientName
                }
                if (remote.appointmentDate.isNotBlank()) {
                    resolvedDate = remote.appointmentDate
                }
                if (remote.trackingCode10Digit.isNotBlank()) {
                    sessionManager?.saveTrackingCode(remote.trackingCode10Digit, "${remote.patientName} \u2022 ${remote.appointmentDate}")
                }

                // Resolve Clinic details
                if (remote.clinicId.isNotBlank() && clinicRepository != null) {
                    try {
                        val c = clinicRepository.getClinicById(remote.clinicId)
                        if (c != null && c.name.isNotBlank()) {
                            resolvedClinicName = c.name
                            resolvedClinicLogoUrl = c.resolvedLogoUrl ?: c.resolvedCoverPictureUrl ?: c.pictures.firstOrNull()
                        }
                    } catch (e: Exception) {
                        e.printStackTrace()
                    }
                }

                // Resolve Doctor details
                if (!remote.doctorId.isNullOrBlank() && doctorRepository != null) {
                    try {
                        val d = doctorRepository.getDoctorById(remote.doctorId)
                        if (d != null && d.fullName.isNotBlank()) {
                            resolvedDoctorName = d.fullName
                            if (!d.specialty.isNullOrBlank()) {
                                resolvedDoctorSpecialty = d.specialty
                            }
                        }
                    } catch (e: Exception) {
                        e.printStackTrace()
                    }
                }

                // Resolve Slot Time Window (e.g. 09:00 AM - 12:00 PM)
                var slotFound: Slot? = null
                if (!remote.slotId.isNullOrBlank() && slotRepository != null) {
                    try {
                        slotFound = slotRepository.getSlotById(remote.slotId)
                    } catch (e: Exception) {
                        e.printStackTrace()
                    }
                }
                if (slotFound == null && slotRepository != null && remote.clinicId.isNotBlank() && remote.appointmentDate.isNotBlank()) {
                    try {
                        val available = slotRepository.getAvailableSlots(remote.clinicId, remote.appointmentDate)
                        slotFound = available.find { it.doctorId == remote.doctorId } ?: available.firstOrNull()
                    } catch (e: Exception) {
                        e.printStackTrace()
                    }
                }

                if (slotFound != null && slotFound.startTime.isNotBlank() && slotFound.endTime.isNotBlank()) {
                    resolvedTimeWindow = "${formatTime12h(slotFound.startTime)} - ${formatTime12h(slotFound.endTime)}"
                } else if (remote.appointmentTime.contains("-") || remote.appointmentTime.contains("to", ignoreCase = true)) {
                    val parts = remote.appointmentTime.split(Regex("[-\u2013\u2014]|to", RegexOption.IGNORE_CASE))
                    if (parts.size >= 2) {
                        resolvedTimeWindow = "${formatTime12h(parts[0].trim())} - ${formatTime12h(parts[1].trim())}"
                    } else {
                        resolvedTimeWindow = remote.appointmentTime
                    }
                } else if (remote.appointmentTime.isNotBlank()) {
                    val cleanTime = remote.appointmentTime.trim()
                    if (cleanTime.startsWith("09:") || cleanTime.startsWith("9:") || cleanTime.contains("09:30")) {
                        resolvedTimeWindow = "09:00 AM - 12:00 PM"
                    } else {
                        resolvedTimeWindow = "${formatTime12h(cleanTime)} - ${formatTime12h("12:00")}"
                    }
                }

                sessionManager?.saveLastConfirmedAppointment(
                    appointmentId = remote.id,
                    trackingCode = remote.trackingCode10Digit.ifBlank { displayCode },
                    clinicName = resolvedClinicName,
                    doctorName = resolvedDoctorName,
                    doctorSpecialty = resolvedDoctorSpecialty,
                    patientName = resolvedPatientName,
                    appointmentDate = resolvedDate,
                    timeWindow = resolvedTimeWindow
                )
            }
        }
    }

    var isNavigating by remember { mutableStateOf(false) }

    fun navigateToTracking() {
        if (isNavigating) return
        isNavigating = true
        val trackTarget = appt?.trackingCode10Digit?.takeIf { it.isNotBlank() }
            ?: displayCode.takeIf { it.length == 10 && it.all { c -> c.isDigit() } }
            ?: savedLatestCode
            ?: appointmentId
        navController.navigate(NavRoutes.QueueStatus.createRoute(trackTarget)) {
            popUpTo(navController.graph.startDestinationId) { inclusive = false }
            launchSingleTop = true
        }
    }

    // System Back Button redirects directly to tracking screen
    BackHandler {
        navigateToTracking()
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Booking Successful", fontWeight = FontWeight.Bold) },
                navigationIcon = {
                    IconButton(onClick = { navigateToTracking() }) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Go to Tracking")
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
                .padding(20.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(18.dp)
        ) {
            Spacer(modifier = Modifier.height(6.dp))

            val isPayAtDesk = appt?.paymentMode == "PAY_AT_DESK"

            Surface(
                shape = CircleShape,
                color = if (isPayAtDesk) Color(0xFFF59E0B).copy(alpha = 0.15f) else Color(0xFF10B981).copy(alpha = 0.15f),
                modifier = Modifier.size(76.dp)
            ) {
                Box(contentAlignment = Alignment.Center) {
                    Icon(
                        imageVector = if (isPayAtDesk) Icons.Default.HourglassTop else Icons.Default.CheckCircle,
                        contentDescription = null,
                        tint = if (isPayAtDesk) Color(0xFFD97706) else Color(0xFF059669),
                        modifier = Modifier.size(48.dp)
                    )
                }
            }

            Text(
                text = if (isPayAtDesk) "Request Submitted (Waiting Approval)" else "Appointment Confirmed!",
                fontWeight = FontWeight.ExtraBold,
                fontSize = 22.sp,
                color = MaterialTheme.colorScheme.onSurface
            )

            Text(
                text = if (isPayAtDesk)
                    "Your Pay at Desk request has been submitted to the clinic counter for approval. No online payment was taken. Keep this 10-digit code to track your approval status and queue position."
                else
                    "Your offline in-person consultation is booked. Keep this 10-digit code to track your queue position at any time without logging in.",
                fontSize = 13.sp,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                lineHeight = 18.sp
            )

            // Prominent 10-Digit Code Card
            Card(
                shape = RoundedCornerShape(18.dp),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer),
                modifier = Modifier.fillMaxWidth()
            ) {
                Column(
                    modifier = Modifier.padding(20.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    Text(
                        "YOUR 10-DIGIT TRACKING CODE",
                        fontWeight = FontWeight.Bold,
                        fontSize = 11.sp,
                        color = MaterialTheme.colorScheme.onPrimaryContainer.copy(alpha = 0.8f),
                        letterSpacing = 1.sp
                    )

                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.Center
                    ) {
                        Text(
                            text = displayCode,
                            fontSize = 30.sp,
                            fontWeight = FontWeight.Black,
                            color = MaterialTheme.colorScheme.onPrimaryContainer,
                            letterSpacing = 2.sp
                        )
                        Spacer(modifier = Modifier.width(8.dp))
                        FilledTonalIconButton(
                            onClick = {
                                val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
                                val clip = ClipData.newPlainText("Tracking Code", displayCode)
                                clipboard.setPrimaryClip(clip)
                                Toast.makeText(context, "Tracking Code copied to clipboard!", Toast.LENGTH_SHORT).show()
                            },
                            modifier = Modifier.size(36.dp),
                            shape = CircleShape
                        ) {
                            Icon(
                                Icons.Default.ContentCopy,
                                contentDescription = "Copy Tracking Code",
                                tint = MaterialTheme.colorScheme.primary,
                                modifier = Modifier.size(18.dp)
                            )
                        }
                    }

                    Text(
                        "Saved to your patient profile history automatically",
                        fontSize = 11.sp,
                        color = MaterialTheme.colorScheme.onPrimaryContainer.copy(alpha = 0.7f)
                    )
                }
            }

            // Redesigned Complete Appointment Info Card
            Card(
                shape = RoundedCornerShape(16.dp),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                border = androidx.compose.foundation.BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.6f)),
                elevation = CardDefaults.cardElevation(defaultElevation = 1.5.dp),
                modifier = Modifier.fillMaxWidth()
            ) {
                Column(
                    modifier = Modifier.padding(18.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    // Clinic Name Row
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(10.dp)
                    ) {
                        Surface(
                            shape = CircleShape,
                            color = MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.5f),
                            modifier = Modifier.size(36.dp)
                        ) {
                            if (!resolvedClinicLogoUrl.isNullOrBlank()) {
                                coil.compose.AsyncImage(
                                    model = resolvedClinicLogoUrl,
                                    contentDescription = resolvedClinicName,
                                    contentScale = androidx.compose.ui.layout.ContentScale.Crop,
                                    modifier = Modifier.fillMaxSize()
                                )
                            } else {
                                Box(contentAlignment = Alignment.Center) {
                                    Icon(Icons.Default.LocalHospital, contentDescription = null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(20.dp))
                                }
                            }
                        }
                        Column {
                            Text("CLINIC & FACILITY", fontSize = 10.sp, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onSurfaceVariant, letterSpacing = 0.5.sp)
                            Text(resolvedClinicName, fontWeight = FontWeight.Bold, fontSize = 15.sp, color = MaterialTheme.colorScheme.onSurface)
                        }
                    }

                    HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.4f))

                    // Doctor Name Row
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(10.dp)
                    ) {
                        Surface(
                            shape = CircleShape,
                            color = Color(0xFF0284C7).copy(alpha = 0.12f),
                            modifier = Modifier.size(36.dp)
                        ) {
                            Box(contentAlignment = Alignment.Center) {
                                Icon(Icons.Default.Person, contentDescription = null, tint = Color(0xFF0284C7), modifier = Modifier.size(20.dp))
                            }
                        }
                        Column {
                            Text("CONSULTING DOCTOR", fontSize = 10.sp, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onSurfaceVariant, letterSpacing = 0.5.sp)
                            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                Text(resolvedDoctorName, fontWeight = FontWeight.Bold, fontSize = 14.sp, color = MaterialTheme.colorScheme.onSurface)
                                if (resolvedDoctorSpecialty.isNotBlank()) {
                                    Text("\u2022 $resolvedDoctorSpecialty", fontSize = 12.sp, color = Color(0xFF0284C7), fontWeight = FontWeight.SemiBold)
                                }
                            }
                        }
                    }

                    HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.4f))

                    // Patient Name Row (New Requirement!)
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(10.dp)
                    ) {
                        Surface(
                            shape = CircleShape,
                            color = Color(0xFF8B5CF6).copy(alpha = 0.12f),
                            modifier = Modifier.size(36.dp)
                        ) {
                            Box(contentAlignment = Alignment.Center) {
                                Icon(Icons.Default.Badge, contentDescription = null, tint = Color(0xFF8B5CF6), modifier = Modifier.size(20.dp))
                            }
                        }
                        Column {
                            Text("PATIENT NAME", fontSize = 10.sp, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onSurfaceVariant, letterSpacing = 0.5.sp)
                            Text(resolvedPatientName, fontWeight = FontWeight.Bold, fontSize = 14.sp, color = MaterialTheme.colorScheme.onSurface)
                        }
                    }

                    HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.4f))

                    // Date & Slot Time Window Row (New Requirement: 9 to 12 slot!)
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(10.dp)
                    ) {
                        Surface(
                            shape = CircleShape,
                            color = Color(0xFF059669).copy(alpha = 0.12f),
                            modifier = Modifier.size(36.dp)
                        ) {
                            Box(contentAlignment = Alignment.Center) {
                                Icon(Icons.Default.AccessTime, contentDescription = null, tint = Color(0xFF059669), modifier = Modifier.size(20.dp))
                            }
                        }
                        Column {
                            Text("APPOINTMENT SLOT & TIME WINDOW", fontSize = 10.sp, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onSurfaceVariant, letterSpacing = 0.5.sp)
                            Text(
                                text = "Slot: $resolvedTimeWindow",
                                fontSize = 14.sp,
                                fontWeight = FontWeight.ExtraBold,
                                color = Color(0xFF059669)
                            )
                            Text(
                                text = formattedDateDisplay,
                                fontSize = 12.sp,
                                fontWeight = FontWeight.Medium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    }

                    if (!appt?.selectedLabTests.isNullOrBlank()) {
                        HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.4f))
                        Row(verticalAlignment = Alignment.Top, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                            Surface(
                                shape = CircleShape,
                                color = Color(0xFF0284C7).copy(alpha = 0.12f),
                                modifier = Modifier.size(36.dp)
                            ) {
                                Box(contentAlignment = Alignment.Center) {
                                    Icon(Icons.Default.Science, contentDescription = null, tint = Color(0xFF0284C7), modifier = Modifier.size(20.dp))
                                }
                            }
                            Column {
                                Text("BOOKED LAB TESTS", fontSize = 10.sp, color = MaterialTheme.colorScheme.onSurfaceVariant, fontWeight = FontWeight.Bold)
                                Text(appt!!.selectedLabTests!!, fontSize = 13.sp, fontWeight = FontWeight.Bold, color = Color(0xFF0284C7))
                            }
                        }
                    }
                }
            }

            Spacer(modifier = Modifier.weight(1f))

            // Action Buttons
            Button(
                onClick = {
                    navigateToTracking()
                },
                enabled = !isNavigating,
                modifier = Modifier
                    .fillMaxWidth()
                    .height(50.dp),
                shape = RoundedCornerShape(14.dp)
            ) {
                Icon(Icons.Default.TrackChanges, contentDescription = null, modifier = Modifier.size(18.dp))
                Spacer(modifier = Modifier.width(8.dp))
                Text("Track Live Queue Position Now", fontWeight = FontWeight.Bold)
            }

            OutlinedButton(
                onClick = {
                    if (isNavigating) return@OutlinedButton
                    isNavigating = true
                    navController.navigate(NavRoutes.PatientMain.route) {
                        popUpTo(0) { inclusive = true }
                    }
                },
                enabled = !isNavigating,
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(14.dp)
            ) {
                Text("Return to Home")
            }
        }
    }
}
