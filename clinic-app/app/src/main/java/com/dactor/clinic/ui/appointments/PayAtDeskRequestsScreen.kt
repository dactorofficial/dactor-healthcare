package com.dactor.clinic.ui.appointments

import android.content.Intent
import android.net.Uri
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
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.navigation.NavController
import com.dactor.clinic.data.model.Appointment
import com.dactor.clinic.data.model.Doctor
import com.dactor.clinic.data.repository.AppointmentRepository
import com.dactor.clinic.data.repository.DoctorRepository
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PayAtDeskRequestsScreen(
    navController: NavController,
    clinicId: String,
    appointmentRepository: AppointmentRepository? = null,
    doctorRepository: DoctorRepository? = null
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val snackbarHostState = remember { SnackbarHostState() }

    var requests by remember { mutableStateOf<List<Appointment>>(emptyList()) }
    var doctorsMap by remember { mutableStateOf<Map<String, Doctor>>(emptyMap()) }
    var isLoading by remember { mutableStateOf(true) }
    var errorMessage by remember { mutableStateOf<String?>(null) }

    // Dialog state for confirmation & details
    var selectedRequestForDetail by remember { mutableStateOf<Appointment?>(null) }
    var confirmApproveAppt by remember { mutableStateOf<Appointment?>(null) }
    var confirmRejectAppt by remember { mutableStateOf<Appointment?>(null) }
    var isProcessingAction by remember { mutableStateOf(false) }

    fun loadData() {
        if (clinicId.isBlank() || appointmentRepository == null) {
            isLoading = false
            return
        }
        isLoading = true
        errorMessage = null
        scope.launch {
            try {
                val list = appointmentRepository.getPendingPayAtDeskRequests(clinicId)
                requests = list
                
                // Fetch doctors for lookup if available
                if (doctorRepository != null) {
                    try {
                        val docs = doctorRepository.getDoctorsByClinic(clinicId)
                        doctorsMap = docs.associateBy { it.id }
                    } catch (_: Exception) {}
                }
            } catch (e: Exception) {
                errorMessage = e.message ?: "Failed to load requests"
            } finally {
                isLoading = false
            }
        }
    }

    LaunchedEffect(clinicId) {
        loadData()
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text("Pay at Desk Requests", fontWeight = FontWeight.Bold, fontSize = 18.sp)
                        if (requests.isNotEmpty()) {
                            Surface(
                                shape = CircleShape,
                                color = Color(0xFFF59E0B),
                                modifier = Modifier.padding(start = 4.dp)
                            ) {
                                Text(
                                    requests.size.toString(),
                                    color = Color.White,
                                    fontSize = 11.sp,
                                    fontWeight = FontWeight.Bold,
                                    modifier = Modifier.padding(horizontal = 7.dp, vertical = 2.dp)
                                )
                            }
                        }
                    }
                },
                navigationIcon = {
                    IconButton(onClick = { navController.popBackStack() }) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
                actions = {
                    IconButton(onClick = { loadData() }, enabled = !isLoading) {
                        Icon(Icons.Default.Refresh, contentDescription = "Refresh", tint = MaterialTheme.colorScheme.primary)
                    }
                }
            )
        },
        snackbarHost = { SnackbarHost(snackbarHostState) }
    ) { padding ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
        ) {
            when {
                isLoading && requests.isEmpty() -> {
                    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                        CircularProgressIndicator(color = MaterialTheme.colorScheme.primary)
                    }
                }
                errorMessage != null && requests.isEmpty() -> {
                    Column(
                        modifier = Modifier
                            .fillMaxSize()
                            .padding(24.dp),
                        verticalArrangement = Arrangement.Center,
                        horizontalAlignment = Alignment.CenterHorizontally
                    ) {
                        Icon(Icons.Default.ErrorOutline, contentDescription = null, tint = MaterialTheme.colorScheme.error, modifier = Modifier.size(48.dp))
                        Spacer(Modifier.height(12.dp))
                        Text(errorMessage ?: "An error occurred", color = MaterialTheme.colorScheme.error, fontWeight = FontWeight.SemiBold)
                        Spacer(Modifier.height(16.dp))
                        Button(onClick = { loadData() }) {
                            Text("Retry")
                        }
                    }
                }
                requests.isEmpty() -> {
                    Column(
                        modifier = Modifier
                            .fillMaxSize()
                            .padding(24.dp),
                        verticalArrangement = Arrangement.Center,
                        horizontalAlignment = Alignment.CenterHorizontally
                    ) {
                        Surface(
                            shape = CircleShape,
                            color = Color(0xFFFEF3C7),
                            modifier = Modifier.size(72.dp)
                        ) {
                            Box(contentAlignment = Alignment.Center) {
                                Icon(Icons.Default.ReceiptLong, contentDescription = null, tint = Color(0xFFD97706), modifier = Modifier.size(36.dp))
                            }
                        }
                        Spacer(Modifier.height(16.dp))
                        Text("No Pending Requests", fontWeight = FontWeight.Bold, fontSize = 18.sp, color = Color(0xFF1E293B))
                        Spacer(Modifier.height(6.dp))
                        Text(
                            "There are currently no Pay at Desk appointment requests waiting for approval.",
                            fontSize = 13.sp,
                            color = Color(0xFF64748B),
                            textAlign = androidx.compose.ui.text.style.TextAlign.Center
                        )
                        Spacer(Modifier.height(20.dp))
                        OutlinedButton(onClick = { loadData() }) {
                            Icon(Icons.Default.Refresh, contentDescription = null, modifier = Modifier.size(16.dp))
                            Spacer(Modifier.width(6.dp))
                            Text("Check for New Requests")
                        }
                    }
                }
                else -> {
                    LazyColumn(
                        modifier = Modifier
                            .fillMaxSize()
                            .padding(horizontal = 16.dp, vertical = 8.dp),
                        verticalArrangement = Arrangement.spacedBy(14.dp)
                    ) {
                        item {
                            Surface(
                                shape = RoundedCornerShape(12.dp),
                                color = Color(0xFFFFFBEB),
                                border = BorderStroke(1.dp, Color(0xFFFDE68A)),
                                modifier = Modifier.fillMaxWidth()
                            ) {
                                Row(modifier = Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                                    Icon(Icons.Default.Info, contentDescription = null, tint = Color(0xFFD97706), modifier = Modifier.size(20.dp))
                                    Spacer(Modifier.width(10.dp))
                                    Text(
                                        "Requests are arranged chronologically with the oldest on top. Approving from top to bottom ensures patients enter the live queue in fair booking order.",
                                        fontSize = 12.sp,
                                        color = Color(0xFF92400E),
                                        lineHeight = 16.sp
                                    )
                                }
                            }
                        }

                        itemsIndexed(requests, key = { _, it -> it.id }) { index, appt ->
                            val doc = doctorsMap[appt.doctorId]
                            PayAtDeskRequestCard(
                                appointment = appt,
                                doctor = doc,
                                isOldest = (index == 0),
                                onCardClick = { selectedRequestForDetail = appt },
                                onApproveClick = { confirmApproveAppt = appt },
                                onRejectClick = { confirmRejectAppt = appt },
                                onCallPhone = { phone ->
                                    try {
                                        val intent = Intent(Intent.ACTION_DIAL, Uri.parse("tel:$phone"))
                                        context.startActivity(intent)
                                    } catch (_: Exception) {}
                                },
                                isProcessing = isProcessingAction
                            )
                        }

                        item {
                            Spacer(Modifier.height(40.dp))
                        }
                    }
                }
            }
        }
    }

    // Confirmation Modal: Approve Request
    if (confirmApproveAppt != null) {
        val target = confirmApproveAppt!!
        AlertDialog(
            onDismissRequest = { if (!isProcessingAction) confirmApproveAppt = null },
            icon = { Icon(Icons.Default.CheckCircle, contentDescription = null, tint = Color(0xFF16A34A), modifier = Modifier.size(32.dp)) },
            title = { Text("Approve Appointment?", fontWeight = FontWeight.Bold) },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text("Patient: ${target.patientName}", fontWeight = FontWeight.SemiBold)
                    Text("Slot: ${target.appointmentDate} at ${target.appointmentTime}")
                    Text("Total at Desk: NPR ${target.totalAmount}")
                    Spacer(Modifier.height(4.dp))
                    Text(
                        "This patient will be added to the live OPD queue for this slot. If the slot is at capacity, it will be safely overloaded.",
                        fontSize = 12.sp,
                        color = Color(0xFF64748B)
                    )
                }
            },
            confirmButton = {
                Button(
                    onClick = {
                        if (isProcessingAction) return@Button
                        isProcessingAction = true
                        scope.launch {
                            try {
                                val effectiveCid = target.clinicId.trim().ifEmpty { clinicId.trim() }
                                val result = appointmentRepository?.approvePayAtDeskAppointment(target.id, effectiveCid)
                                if (result?.isSuccess == true) {
                                    snackbarHostState.showSnackbar("Appointment #${target.trackingCode10Digit} Approved!")
                                    confirmApproveAppt = null
                                    loadData()
                                } else {
                                    val err = result?.exceptionOrNull()?.message ?: "Failed to approve appointment"
                                    snackbarHostState.showSnackbar("Error: $err")
                                }
                            } catch (e: Exception) {
                                snackbarHostState.showSnackbar("Error: ${e.message}")
                            } finally {
                                isProcessingAction = false
                            }
                        }
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF16A34A)),
                    enabled = !isProcessingAction
                ) {
                    if (isProcessingAction) {
                        CircularProgressIndicator(color = Color.White, modifier = Modifier.size(16.dp), strokeWidth = 2.dp)
                        Spacer(Modifier.width(8.dp))
                    }
                    Text("Confirm Approve")
                }
            },
            dismissButton = {
                OutlinedButton(
                    onClick = { confirmApproveAppt = null },
                    enabled = !isProcessingAction
                ) {
                    Text("Cancel")
                }
            }
        )
    }

    // Confirmation Modal: Reject / Cancel Request
    if (confirmRejectAppt != null) {
        val target = confirmRejectAppt!!
        AlertDialog(
            onDismissRequest = { if (!isProcessingAction) confirmRejectAppt = null },
            icon = { Icon(Icons.Default.Cancel, contentDescription = null, tint = Color(0xFFDC2626), modifier = Modifier.size(32.dp)) },
            title = { Text("Cancel Booking Request?", fontWeight = FontWeight.Bold) },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text("Cancelling request for ${target.patientName} (ID: ${target.trackingCode10Digit}).")
                    Text("Attempt count: ${target.attemptNumber} of 3.")
                    Spacer(Modifier.height(4.dp))
                    Text(
                        "The booking request will be cancelled. The patient will be notified and can retry booking if they wish.",
                        fontSize = 12.sp,
                        color = Color(0xFF64748B)
                    )
                }
            },
            confirmButton = {
                Button(
                    onClick = {
                        if (isProcessingAction) return@Button
                        isProcessingAction = true
                        scope.launch {
                            try {
                                val effectiveCid = target.clinicId.trim().ifEmpty { clinicId.trim() }
                                val result = appointmentRepository?.rejectPayAtDeskAppointment(target.id, effectiveCid)
                                if (result?.isSuccess == true) {
                                    snackbarHostState.showSnackbar("Request #${target.trackingCode10Digit} Cancelled")
                                    confirmRejectAppt = null
                                    loadData()
                                } else {
                                    val err = result?.exceptionOrNull()?.message ?: "Failed to reject appointment"
                                    snackbarHostState.showSnackbar("Error: $err")
                                }
                            } catch (e: Exception) {
                                snackbarHostState.showSnackbar("Error: ${e.message}")
                            } finally {
                                isProcessingAction = false
                            }
                        }
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFDC2626)),
                    enabled = !isProcessingAction
                ) {
                    if (isProcessingAction) {
                        CircularProgressIndicator(color = Color.White, modifier = Modifier.size(16.dp), strokeWidth = 2.dp)
                        Spacer(Modifier.width(8.dp))
                    }
                    Text("Confirm Cancel")
                }
            },
            dismissButton = {
                OutlinedButton(
                    onClick = { confirmRejectAppt = null },
                    enabled = !isProcessingAction
                ) {
                    Text("Back")
                }
            }
        )
    }

    // Full Detail Modal
    if (selectedRequestForDetail != null) {
        val req = selectedRequestForDetail!!
        val doc = doctorsMap[req.doctorId]
        AlertDialog(
            onDismissRequest = { selectedRequestForDetail = null },
            title = {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween, modifier = Modifier.fillMaxWidth()) {
                    Text("Request Details", fontWeight = FontWeight.Bold, fontSize = 18.sp)
                    Surface(
                        shape = RoundedCornerShape(8.dp),
                        color = Color(0xFFFEF3C7)
                    ) {
                        Text(
                            "Attempt ${req.attemptNumber} of 3",
                            color = Color(0xFFB45309),
                            fontWeight = FontWeight.Bold,
                            fontSize = 11.sp,
                            modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
                        )
                    }
                }
            },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.fillMaxWidth()) {
                    DetailRow("10-Digit ID", req.trackingCode10Digit, isMonospace = true)
                    DetailRow("Patient Name", req.patientName)
                    DetailRow("Age / Gender", "${req.patientAge ?: '\u2014'} yrs \u2022 ${req.patientGender ?: '\u2014'}")
                    DetailRow("Phone", req.patientMobile)
                    if (!req.patientEmail.isNullOrBlank()) {
                        DetailRow("Email", req.patientEmail)
                    }
                    DetailRow("Doctor", doc?.fullName ?: "Assigned Doctor")
                    DetailRow("Date & Time", "${req.appointmentDate} \u2022 ${req.appointmentTime}")
                    if (!req.createdAt.isNullOrBlank()) {
                        DetailRow("Requested At", "${formatRelativeTime(req.createdAt)} (${req.createdAt})")
                    }
                    if (!req.selectedLabTests.isNullOrBlank()) {
                        DetailRow("Notes / Tests", req.selectedLabTests)
                    }
                    HorizontalDivider(modifier = Modifier.padding(vertical = 4.dp))
                    DetailRow("Consultation Fee", "NPR ${req.feeAmount}")
                    DetailRow("5% Service Charge", "NPR ${req.serviceChargeAmount}")
                    DetailRow("Total Due at Desk", "NPR ${req.totalAmount}", isBold = true, valueColor = Color(0xFF16A34A))
                }
            },
            confirmButton = {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedButton(
                        onClick = {
                            confirmRejectAppt = req
                            selectedRequestForDetail = null
                        },
                        colors = ButtonDefaults.outlinedButtonColors(contentColor = Color(0xFFDC2626))
                    ) {
                        Text("Cancel")
                    }
                    Button(
                        onClick = {
                            confirmApproveAppt = req
                            selectedRequestForDetail = null
                        },
                        colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF16A34A))
                    ) {
                        Text("Approve")
                    }
                }
            },
            dismissButton = {
                TextButton(onClick = { selectedRequestForDetail = null }) {
                    Text("Close")
                }
            }
        )
    }
}

@Composable
fun PayAtDeskRequestCard(
    appointment: Appointment,
    doctor: Doctor?,
    isOldest: Boolean = false,
    onCardClick: () -> Unit,
    onApproveClick: () -> Unit,
    onRejectClick: () -> Unit,
    onCallPhone: (String) -> Unit,
    isProcessing: Boolean
) {
    Card(
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = Color.White),
        border = if (isOldest) BorderStroke(2.dp, Color(0xFFF59E0B)) else BorderStroke(1.dp, Color(0xFFE2E8F0)),
        elevation = CardDefaults.cardElevation(defaultElevation = if (isOldest) 4.dp else 2.dp),
        modifier = Modifier
            .fillMaxWidth()
            .clickable { onCardClick() }
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            // Prominent banner for the oldest request
            if (isOldest) {
                Surface(
                    shape = RoundedCornerShape(8.dp),
                    color = Color(0xFFFEF3C7),
                    border = BorderStroke(1.dp, Color(0xFFFDE68A)),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Row(
                        modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(6.dp)
                    ) {
                        Icon(
                            Icons.Default.Schedule,
                            contentDescription = null,
                            tint = Color(0xFFD97706),
                            modifier = Modifier.size(15.dp)
                        )
                        Text(
                            "⚡ OLDEST REQUEST \u2022 NEXT TO APPROVE",
                            fontWeight = FontWeight.ExtraBold,
                            fontSize = 11.sp,
                            color = Color(0xFFB45309),
                            letterSpacing = 0.5.sp
                        )
                    }
                }
            }
            // Header: ID + Attempt Badge
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    Icon(Icons.Default.CreditCard, contentDescription = null, tint = Color(0xFFD97706), modifier = Modifier.size(16.dp))
                    Text(
                        appointment.trackingCode10Digit,
                        fontFamily = FontFamily.Monospace,
                        fontWeight = FontWeight.Bold,
                        fontSize = 14.sp,
                        color = Color(0xFF0F172A)
                    )
                }

                Surface(
                    shape = RoundedCornerShape(8.dp),
                    color = Color(0xFFFEF3C7)
                ) {
                    Text(
                        "Attempt ${appointment.attemptNumber} of 3",
                        color = Color(0xFFB45309),
                        fontWeight = FontWeight.Bold,
                        fontSize = 11.sp,
                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp)
                    )
                }
            }

            // Patient details
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Column {
                    Text(
                        appointment.patientName,
                        fontWeight = FontWeight.Bold,
                        fontSize = 16.sp,
                        color = Color(0xFF0F172A)
                    )
                    Text(
                        "${appointment.patientAge ?: "\u2014"} yrs \u2022 ${appointment.patientGender ?: "Other"}",
                        fontSize = 12.sp,
                        color = Color(0xFF64748B)
                    )
                }

                if (appointment.patientMobile.isNotBlank()) {
                    IconButton(
                        onClick = { onCallPhone(appointment.patientMobile) },
                        modifier = Modifier.size(34.dp)
                    ) {
                        Surface(shape = CircleShape, color = Color(0xFFDCFCE7), modifier = Modifier.fillMaxSize()) {
                            Box(contentAlignment = Alignment.Center) {
                                Icon(Icons.Default.Phone, contentDescription = "Call", tint = Color(0xFF16A34A), modifier = Modifier.size(16.dp))
                            }
                        }
                    }
                }
            }

            // Doctor & Slot info
            Surface(
                shape = RoundedCornerShape(10.dp),
                color = Color(0xFFF8FAFC),
                modifier = Modifier.fillMaxWidth()
            ) {
                Column(modifier = Modifier.padding(10.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Default.MedicalServices, contentDescription = null, tint = Color(0xFF3B82F6), modifier = Modifier.size(14.dp))
                        Spacer(Modifier.width(6.dp))
                        Text(doctor?.fullName ?: "Assigned Doctor", fontSize = 12.sp, fontWeight = FontWeight.SemiBold, color = Color(0xFF1E293B))
                    }
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Default.CalendarToday, contentDescription = null, tint = Color(0xFF64748B), modifier = Modifier.size(14.dp))
                        Spacer(Modifier.width(6.dp))
                        Text("Slot: ${appointment.appointmentDate} \u2022 ${appointment.appointmentTime}", fontSize = 12.sp, color = Color(0xFF475569))
                    }
                    if (!appointment.createdAt.isNullOrBlank()) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(Icons.Default.AccessTime, contentDescription = null, tint = Color(0xFFD97706), modifier = Modifier.size(14.dp))
                            Spacer(Modifier.width(6.dp))
                            Text("Requested: ${formatRelativeTime(appointment.createdAt)}", fontSize = 12.sp, fontWeight = FontWeight.Medium, color = Color(0xFF92400E))
                        }
                    }
                }
            }

            // Price Breakdown Banner
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(vertical = 2.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column {
                    Text(
                        "Fee: NPR ${appointment.feeAmount} + 5% Chg: NPR ${appointment.serviceChargeAmount}",
                        fontSize = 11.sp,
                        color = Color(0xFF64748B)
                    )
                    Text(
                        "Total at Desk: NPR ${appointment.totalAmount}",
                        fontWeight = FontWeight.Bold,
                        fontSize = 14.sp,
                        color = Color(0xFF0F172A)
                    )
                }
            }

            // Action Buttons: Approve & Cancel
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                OutlinedButton(
                    onClick = onRejectClick,
                    enabled = !isProcessing,
                    shape = RoundedCornerShape(10.dp),
                    colors = ButtonDefaults.outlinedButtonColors(contentColor = Color(0xFFDC2626)),
                    border = BorderStroke(1.dp, Color(0xFFFECACA)),
                    modifier = Modifier.weight(1f)
                ) {
                    Icon(Icons.Default.Close, contentDescription = null, modifier = Modifier.size(16.dp))
                    Spacer(Modifier.width(6.dp))
                    Text("Cancel", fontWeight = FontWeight.SemiBold)
                }

                Button(
                    onClick = onApproveClick,
                    enabled = !isProcessing,
                    shape = RoundedCornerShape(10.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF16A34A)),
                    modifier = Modifier.weight(1f)
                ) {
                    Icon(Icons.Default.Check, contentDescription = null, modifier = Modifier.size(16.dp))
                    Spacer(Modifier.width(6.dp))
                    Text("Approve", fontWeight = FontWeight.SemiBold)
                }
            }
        }
    }
}

@Composable
fun DetailRow(
    label: String,
    value: String,
    isBold: Boolean = false,
    isMonospace: Boolean = false,
    valueColor: Color = Color(0xFF0F172A)
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(label, fontSize = 12.sp, color = Color(0xFF64748B))
        Text(
            value,
            fontSize = 13.sp,
            fontWeight = if (isBold) FontWeight.Bold else FontWeight.Normal,
            fontFamily = if (isMonospace) FontFamily.Monospace else FontFamily.Default,
            color = valueColor
        )
    }
}

private fun formatRelativeTime(isoString: String?): String {
    if (isoString.isNullOrBlank()) return ""
    return try {
        val millis = java.time.Instant.parse(isoString).toEpochMilli()
        val diff = System.currentTimeMillis() - millis
        val minutes = diff / (1000 * 60)
        val hours = diff / (1000 * 60 * 60)
        val days = diff / (1000 * 60 * 60 * 24)

        when {
            diff < 0 -> "Just now"
            minutes < 1 -> "Just now"
            minutes < 60 -> "${minutes}m ago"
            hours < 24 -> "${hours}h ago"
            days == 1L -> "Yesterday"
            else -> "${days}d ago"
        }
    } catch (_: Exception) {
        if (isoString.length >= 16) {
            isoString.substring(0, 10) + " " + isoString.substring(11, 16)
        } else {
            isoString
        }
    }
}
