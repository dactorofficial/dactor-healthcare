package com.dactor.clinic.ui.patients

import android.app.DatePickerDialog
import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
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
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.navigation.NavController
import com.dactor.clinic.data.model.Appointment
import com.dactor.clinic.data.model.Clinic
import com.dactor.clinic.data.model.Doctor
import com.dactor.clinic.data.model.Slot
import com.dactor.clinic.data.repository.*
import com.dactor.clinic.domain.util.TrackingCodeGenerator
import com.dactor.clinic.ui.navigation.NavRoutes
import kotlinx.coroutines.launch
import java.time.LocalDate
import java.util.UUID

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PatientDetailScreen(
    navController: NavController,
    appointmentId: String = "",
    appointmentRepository: AppointmentRepository? = null,
    queueRepository: QueueRepository? = null,
    billingRepository: BillingRepository? = null,
    clinicRepository: ClinicRepository? = null,
    doctorRepository: DoctorRepository? = null,
    slotRepository: SlotRepository? = null,
    labReportRepository: LabReportRepository? = null
) {
    val context = LocalContext.current
    val clipboardManager = LocalClipboardManager.current
    val coroutineScope = rememberCoroutineScope()

    var appointment by remember {
        mutableStateOf(
            Appointment(
                id = appointmentId,
                trackingCode10Digit = if (appointmentId.isNotBlank()) appointmentId else "N/A",
                slotId = null,
                clinicId = "",
                patientName = "Consultation Patient",
                patientAge = 35,
                patientGender = "Male",
                patientMobile = "98XXXXXXXX",
                patientEmail = null,
                paymentStatus = "pending",
                checkinStatus = "in_consultation",
                appointmentDate = LocalDate.now().toString(),
                appointmentTime = "10:00 AM",
                feeAmount = 500.0,
                isWalkin = false
            )
        )
    }

    var clinicalNotes by remember { mutableStateOf("") }
    var prescriptionText by remember { mutableStateOf("") }
    var isNotesSaved by remember { mutableStateOf(false) }
    var isSavingNotes by remember { mutableStateOf(false) }

    var pastVisitsForPatient by remember { mutableStateOf<List<Appointment>>(emptyList()) }
    var pastRemarksMap by remember { mutableStateOf<Map<String, String>>(emptyMap()) }
    var clinicsMap by remember { mutableStateOf<Map<String, Clinic>>(emptyMap()) }
    var doctorsList by remember { mutableStateOf<List<Doctor>>(emptyList()) }

    var actionMessage by remember { mutableStateOf<String?>(null) }

    // Editing Past Visit Remark Dialog
    var editingPastApptRemark by remember { mutableStateOf<Appointment?>(null) }
    var pastRemarkInput by remember { mutableStateOf("") }

    // Editing Past Visit Date / Reschedule Dialog
    var editingPastApptDate by remember { mutableStateOf<Appointment?>(null) }
    var pastDateInput by remember { mutableStateOf("") }
    var pastTimeInput by remember { mutableStateOf("") }
    var pastDoctorId by remember { mutableStateOf("") }
    var selectedPastSlotId by remember { mutableStateOf<String?>(null) }
    var availablePastSlots by remember { mutableStateOf<List<Slot>>(emptyList()) }
    var isLoadingPastSlots by remember { mutableStateOf(false) }
    var showPastDatePicker by remember { mutableStateOf(false) }
    var isSavingPastSchedule by remember { mutableStateOf(false) }

    LaunchedEffect(pastDateInput, pastDoctorId, editingPastApptDate) {
        val clinicIdToUse = editingPastApptDate?.clinicId?.ifBlank { appointment.clinicId } ?: appointment.clinicId
        if (editingPastApptDate != null && slotRepository != null && clinicIdToUse.isNotBlank() && pastDateInput.isNotBlank()) {
            isLoadingPastSlots = true
            try {
                val slots = slotRepository.getSlots(clinicIdToUse, pastDateInput)
                availablePastSlots = if (pastDoctorId.isNotBlank()) {
                    slots.filter { it.doctorId == pastDoctorId }
                } else slots
            } catch (_: Exception) {
                availablePastSlots = emptyList()
            } finally {
                isLoadingPastSlots = false
            }
        } else {
            availablePastSlots = emptyList()
        }
    }

    // Schedule Follow-Up Visit Dialog
    var showScheduleFollowUpDialog by remember { mutableStateOf(false) }
    var followUpDate by remember { mutableStateOf(LocalDate.now().plusDays(7).toString()) }
    var followUpTime by remember { mutableStateOf("10:30 AM") }
    var followUpDoctorId by remember { mutableStateOf("") }
    var followUpNotes by remember { mutableStateOf("") }

    suspend fun loadChartData() {
        if (clinicRepository != null) {
            try {
                val allClinics = clinicRepository.getClinics()
                clinicsMap = allClinics.associateBy { it.id }
            } catch (ignored: Exception) {}
        }

        if (appointmentRepository != null && appointmentId.isNotBlank()) {
            val remote = appointmentRepository.getAppointmentByTrackingCode(appointmentId)
                ?: appointmentRepository.getAppointmentById(appointmentId)
            if (remote != null) {
                appointment = remote
                followUpDoctorId = remote.doctorId ?: ""
                if (doctorRepository != null && remote.clinicId.isNotBlank()) {
                    doctorsList = doctorRepository.getDoctorsByClinic(remote.clinicId)
                }

                val existingRemarks = billingRepository?.getRemarkForAppointment(remote.id)
                if (!existingRemarks.isNullOrBlank()) {
                    clinicalNotes = existingRemarks
                    isNotesSaved = true
                }

                // Strictly isolate past visits by the exact same 10-digit Appointment ID
                // Appointments with different appointment IDs from the same clinic must NEVER be grouped together
                val allPatientVisits = if (remote.trackingCode10Digit.isNotBlank()) {
                    appointmentRepository.getAllAppointmentsByTrackingCode(remote.trackingCode10Digit)
                } else listOf(remote)
                pastVisitsForPatient = allPatientVisits.filter { 
                    it.id != remote.id && 
                    it.status.equals("APPROVED", ignoreCase = true) &&
                    it.status != "WAITING_FOR_APPROVAL" &&
                    it.status != "pending_payment" &&
                    it.status != "UNAPPROVED" &&
                    it.status != "EXPIRED" &&
                    it.checkinStatus != "cancelled"
                }
                if (billingRepository != null && pastVisitsForPatient.isNotEmpty()) {
                    pastRemarksMap = billingRepository.getRemarksForAppointments(pastVisitsForPatient.map { it.id })
                }
            }
        }
    }

    LaunchedEffect(appointmentId) {
        loadChartData()
    }

    val scrollState = rememberScrollState()

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Patient Clinical Chart & History", fontWeight = FontWeight.Bold, fontSize = 18.sp) },
                navigationIcon = {
                    IconButton(onClick = { navController.popBackStack() }) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                }
            )
        }
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .background(Color(0xFFF8FAFC))
                .verticalScroll(scrollState)
                .navigationBarsPadding()
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
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

            // Patient Header Card
            Card(
                shape = RoundedCornerShape(20.dp),
                colors = CardDefaults.cardColors(containerColor = Color.White),
                border = BorderStroke(1.dp, Color(0xFFE2E8F0)),
                elevation = CardDefaults.cardElevation(defaultElevation = 2.dp),
                modifier = Modifier.fillMaxWidth()
            ) {
                Column(
                    modifier = Modifier.padding(18.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                            Surface(
                                shape = CircleShape,
                                color = Color(0xFFD0EEFB),
                                modifier = Modifier.size(52.dp)
                            ) {
                                Box(contentAlignment = Alignment.Center) {
                                    Icon(Icons.Default.Person, contentDescription = null, tint = Color(0xFF00838F), modifier = Modifier.size(28.dp))
                                }
                            }
                            Column {
                                Text(appointment.patientName, fontWeight = FontWeight.Bold, fontSize = 18.sp, color = Color(0xFF0F172A))
                                Text(
                                    "${appointment.patientAge ?: 35} yrs | ${appointment.patientGender ?: "Male"}",
                                    fontSize = 13.sp,
                                    color = Color(0xFF64748B)
                                )
                            }
                        }

                        // Call Patient Button
                        if (appointment.patientMobile.isNotBlank()) {
                            Button(
                                onClick = {
                                    try {
                                        val intent = Intent(Intent.ACTION_DIAL, Uri.parse("tel:${appointment.patientMobile}"))
                                        context.startActivity(intent)
                                    } catch (ignored: Exception) {}
                                },
                                colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF059669)),
                                shape = RoundedCornerShape(10.dp),
                                contentPadding = PaddingValues(horizontal = 12.dp, vertical = 6.dp),
                                modifier = Modifier.height(36.dp)
                            ) {
                                Icon(Icons.Default.Call, contentDescription = null, tint = Color.White, modifier = Modifier.size(14.dp))
                                Spacer(Modifier.width(4.dp))
                                Text("Call", fontSize = 12.sp, fontWeight = FontWeight.Bold, color = Color.White)
                            }
                        }
                    }

                    HorizontalDivider(color = Color(0xFFE2E8F0))

                    // Contact Details & Clinic Visited
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Column {
                            Text("Mobile Number", fontSize = 11.sp, color = Color(0xFF64748B))
                            Text(appointment.patientMobile, fontWeight = FontWeight.SemiBold, fontSize = 13.sp, color = Color(0xFF0F172A))
                        }
                        Column(horizontalAlignment = Alignment.End) {
                            Text("Clinic Visited", fontSize = 11.sp, color = Color(0xFF64748B))
                            Text(
                                clinicsMap[appointment.clinicId]?.name ?: "Primary Clinic",
                                fontWeight = FontWeight.SemiBold,
                                fontSize = 13.sp,
                                color = Color(0xFF0284C7)
                            )
                        }
                    }

                    // 10-Digit Tracking Code Box (Tap to Copy)
                    Surface(
                        shape = RoundedCornerShape(12.dp),
                        color = Color(0xFFF0F9FF),
                        border = BorderStroke(1.dp, Color(0xFFBAE6FD)),
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable {
                                clipboardManager.setText(AnnotatedString(appointment.trackingCode10Digit))
                                actionMessage = "✓ Copied Appointment ID: ${appointment.trackingCode10Digit} to clipboard!"
                            }
                    ) {
                        Row(
                            modifier = Modifier.padding(horizontal = 14.dp, vertical = 10.dp),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Column {
                                Text("10-Digit Appointment / Tracking ID (Tap to Copy)", fontSize = 10.sp, color = Color(0xFF0284C7))
                                Text(
                                    appointment.trackingCode10Digit,
                                    fontWeight = FontWeight.Bold,
                                    fontSize = 16.sp,
                                    fontFamily = FontFamily.Monospace,
                                    letterSpacing = 1.sp,
                                    color = Color(0xFF0369A1)
                                )
                            }
                            Icon(
                                Icons.Default.ContentCopy,
                                contentDescription = "Copy Code",
                                tint = Color(0xFF0284C7),
                                modifier = Modifier.size(18.dp)
                            )
                        }
                    }

                    // Schedule Follow-Up Button
                    OutlinedButton(
                        onClick = { showScheduleFollowUpDialog = true },
                        shape = RoundedCornerShape(10.dp),
                        border = BorderStroke(1.dp, Color(0xFF0097A7)),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Icon(Icons.Default.CalendarMonth, contentDescription = null, tint = Color(0xFF0097A7), modifier = Modifier.size(16.dp))
                        Spacer(Modifier.width(6.dp))
                        Text("Schedule Follow-Up / Next Appointment", color = Color(0xFF0097A7), fontWeight = FontWeight.Bold, fontSize = 12.5.sp)
                    }
                }
            }

            // Current Visit Remarks / Clinical Notes (Editable & Saved to Server)
            Card(
                shape = RoundedCornerShape(20.dp),
                colors = CardDefaults.cardColors(containerColor = Color.White),
                border = BorderStroke(1.dp, Color(0xFFE2E8F0)),
                elevation = CardDefaults.cardElevation(defaultElevation = 2.dp),
                modifier = Modifier.fillMaxWidth()
            ) {
                Column(
                    modifier = Modifier.padding(18.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            Icon(Icons.Default.MedicalInformation, contentDescription = null, tint = Color(0xFF0097A7))
                            Text("Visit Remarks & Clinical Notes (${appointment.appointmentDate})", fontWeight = FontWeight.Bold, fontSize = 14.sp)
                        }
                        if (isNotesSaved) {
                            Text("✓ Saved", fontSize = 11.sp, color = Color(0xFF059669), fontWeight = FontWeight.Bold)
                        }
                    }

                    OutlinedTextField(
                        value = clinicalNotes,
                        onValueChange = {
                            clinicalNotes = it
                            isNotesSaved = false
                        },
                        label = { Text("Diagnosis, Symptoms & Clinic Remarks") },
                        modifier = Modifier.fillMaxWidth(),
                        minLines = 3,
                        shape = RoundedCornerShape(12.dp)
                    )

                    OutlinedTextField(
                        value = prescriptionText,
                        onValueChange = {
                            prescriptionText = it
                            isNotesSaved = false
                        },
                        label = { Text("Rx / Prescribed Medications") },
                        modifier = Modifier.fillMaxWidth(),
                        minLines = 2,
                        shape = RoundedCornerShape(12.dp)
                    )

                    Button(
                        onClick = {
                            coroutineScope.launch {
                                isSavingNotes = true
                                val combinedRemarks = buildString {
                                    if (clinicalNotes.isNotBlank()) append(clinicalNotes.trim())
                                    if (prescriptionText.isNotBlank()) {
                                        if (isNotEmpty()) append("\n\nRx: ") else append("Rx: ")
                                        append(prescriptionText.trim())
                                    }
                                }
                                val ok = billingRepository?.saveRemarkForAppointment(appointment.id, appointment.clinicId, combinedRemarks) ?: false
                                if (ok) {
                                    isNotesSaved = true
                                    actionMessage = "✓ Clinical remarks saved to server!"
                                }
                                isSavingNotes = false
                            }
                        },
                        colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF0097A7)),
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(10.dp),
                        enabled = !isSavingNotes
                    ) {
                        if (isSavingNotes) {
                            CircularProgressIndicator(modifier = Modifier.size(16.dp), color = Color.White, strokeWidth = 2.dp)
                            Spacer(Modifier.width(8.dp))
                            Text("Saving to Server...", color = Color.White)
                        } else {
                            Icon(Icons.Default.Save, contentDescription = null, tint = Color.White, modifier = Modifier.size(16.dp))
                            Spacer(Modifier.width(8.dp))
                            Text("Save Remarks to Server", fontWeight = FontWeight.Bold, color = Color.White)
                        }
                    }
                }
            }

            // All Past Appointments Section (Showing Clinic Visited, Date, and Editable Remarks)
            Card(
                shape = RoundedCornerShape(20.dp),
                colors = CardDefaults.cardColors(containerColor = Color.White),
                border = BorderStroke(1.dp, Color(0xFFE2E8F0)),
                modifier = Modifier.fillMaxWidth()
            ) {
                Column(
                    modifier = Modifier.padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Icon(Icons.Default.History, contentDescription = null, tint = Color(0xFF0097A7))
                        Text("Past Consultation History (${pastVisitsForPatient.size})", fontWeight = FontWeight.Bold, fontSize = 15.sp, color = Color(0xFF0F172A))
                    }

                    if (pastVisitsForPatient.isEmpty()) {
                        Text(
                            "No other past consultations recorded for this patient yet.",
                            fontSize = 12.sp,
                            color = Color(0xFF64748B)
                        )
                    } else {
                        pastVisitsForPatient.forEach { prev ->
                            val visitedClinicName = clinicsMap[prev.clinicId]?.name ?: "Visited Clinic"
                            val prevRemark = pastRemarksMap[prev.id] ?: ""

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
                                    Row(
                                        modifier = Modifier.fillMaxWidth(),
                                        horizontalArrangement = Arrangement.SpaceBetween,
                                        verticalAlignment = Alignment.CenterVertically
                                    ) {
                                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                            Text("${prev.appointmentDate} | ${prev.appointmentTime}", fontWeight = FontWeight.Bold, fontSize = 12.5.sp, color = Color(0xFF0F172A))
                                            val isPrevCompleted = prev.checkinStatus?.lowercase() in listOf("completed", "done")
                                            if (!isPrevCompleted) {
                                                IconButton(
                                                    onClick = {
                                                        editingPastApptDate = prev
                                                        pastDateInput = prev.appointmentDate
                                                        pastTimeInput = prev.appointmentTime
                                                        pastDoctorId = prev.doctorId ?: doctorsList.firstOrNull()?.id ?: ""
                                                        selectedPastSlotId = prev.slotId
                                                    },
                                                    modifier = Modifier.size(22.dp)
                                                ) {
                                                    Icon(Icons.Default.EditCalendar, contentDescription = "Reschedule Visit", tint = Color(0xFF0284C7), modifier = Modifier.size(14.dp))
                                                }
                                            }
                                        }

                                        Surface(
                                            shape = RoundedCornerShape(6.dp),
                                            color = Color(0xFFE0F2FE)
                                        ) {
                                            Text(
                                                "Clinic: $visitedClinicName",
                                                fontSize = 10.5.sp,
                                                fontWeight = FontWeight.Bold,
                                                color = Color(0xFF0284C7),
                                                modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
                                            )
                                        }
                                    }

                                    Row(
                                        modifier = Modifier.fillMaxWidth(),
                                        horizontalArrangement = Arrangement.SpaceBetween,
                                        verticalAlignment = Alignment.CenterVertically
                                    ) {
                                        Text(
                                            text = "Appt ID: ${prev.trackingCode10Digit} | Status: ${(prev.checkinStatus ?: "visited").uppercase()}",
                                            fontSize = 11.sp,
                                            color = Color(0xFF64748B),
                                            modifier = Modifier.clickable {
                                                clipboardManager.setText(AnnotatedString(prev.trackingCode10Digit))
                                                actionMessage = "✓ Copied Appointment ID: ${prev.trackingCode10Digit}"
                                            }
                                        )
                                        TextButton(
                                            onClick = {
                                                editingPastApptRemark = prev
                                                pastRemarkInput = prevRemark
                                            },
                                            contentPadding = PaddingValues(horizontal = 6.dp, vertical = 0.dp),
                                            modifier = Modifier.height(24.dp)
                                        ) {
                                            Text(if (prevRemark.isBlank()) "+ Add Remark" else "Edit Remark", fontSize = 11.sp, fontWeight = FontWeight.Bold, color = Color(0xFF0097A7))
                                        }
                                    }

                                    if (prevRemark.isNotBlank()) {
                                        Surface(
                                            color = Color.White,
                                            shape = RoundedCornerShape(6.dp),
                                            border = BorderStroke(1.dp, Color(0xFFCBD5E1)),
                                            modifier = Modifier.fillMaxWidth()
                                        ) {
                                            Text("Remark: $prevRemark", fontSize = 11.5.sp, color = Color(0xFF334155), modifier = Modifier.padding(8.dp))
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }

            val currentClinic = clinicsMap[appointment.clinicId]
            val isLabClinic = currentClinic?.type?.equals("diagnostic_lab", ignoreCase = true) == true ||
                    currentClinic?.type?.contains("lab", ignoreCase = true) == true

            // Quick Actions: Billing & (Only for Lab Type Clinics) Lab Process Workflow
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                Button(
                    onClick = { navController.navigate("${NavRoutes.BillingScreen}/${appointment.id}") },
                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF0097A7)),
                    modifier = Modifier.weight(1f).height(48.dp),
                    shape = RoundedCornerShape(12.dp)
                ) {
                    Icon(Icons.Default.ReceiptLong, contentDescription = null, modifier = Modifier.size(16.dp), tint = Color.White)
                    Spacer(Modifier.width(6.dp))
                    Text("Generate Bill", fontSize = 13.sp, fontWeight = FontWeight.Bold, color = Color.White)
                }

                if (isLabClinic) {
                    Button(
                        onClick = { navController.navigate(NavRoutes.LabWorkflow) },
                        colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFDC2626)),
                        modifier = Modifier.weight(1f).height(48.dp),
                        shape = RoundedCornerShape(12.dp)
                    ) {
                        Icon(Icons.Default.Science, contentDescription = null, modifier = Modifier.size(16.dp), tint = Color.White)
                        Spacer(Modifier.width(6.dp))
                        Text("Lab Workflow", fontSize = 13.sp, fontWeight = FontWeight.Bold, color = Color.White)
                    }
                }
            }

            if (isLabClinic) {
                Card(
                    shape = RoundedCornerShape(16.dp),
                    colors = CardDefaults.cardColors(containerColor = Color(0xFFFEF2F2)),
                    border = BorderStroke(1.dp, Color(0xFFFECACA)),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Column(
                        modifier = Modifier.padding(14.dp),
                        verticalArrangement = Arrangement.spacedBy(10.dp)
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            Icon(Icons.Default.Biotech, contentDescription = null, tint = Color(0xFFDC2626), modifier = Modifier.size(18.dp))
                            Text("Lab Process Workflow (Code: #${appointment.trackingCode10Digit})", fontWeight = FontWeight.Bold, fontSize = 13.sp, color = Color(0xFF991B1B))
                        }
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(6.dp)
                        ) {
                            OutlinedButton(
                                onClick = {
                                    coroutineScope.launch {
                                        labReportRepository?.upsertLabReportForAppointment(
                                            appointmentId = appointment.id,
                                            clinicId = appointment.clinicId,
                                            patientName = appointment.patientName,
                                            testName = clinicalNotes.ifBlank { "Complete Diagnostic Panel" },
                                            stage = "sample_collected"
                                        )
                                        actionMessage = "✓ Stage 1: Sample Collected recorded for ${appointment.patientName}!"
                                    }
                                },
                                modifier = Modifier.weight(1f),
                                shape = RoundedCornerShape(8.dp),
                                contentPadding = PaddingValues(horizontal = 6.dp, vertical = 6.dp)
                            ) {
                                Text("1. Collect Sample", fontSize = 10.5.sp, fontWeight = FontWeight.Bold, color = Color(0xFFDC2626))
                            }
                            OutlinedButton(
                                onClick = {
                                    coroutineScope.launch {
                                        labReportRepository?.upsertLabReportForAppointment(
                                            appointmentId = appointment.id,
                                            clinicId = appointment.clinicId,
                                            patientName = appointment.patientName,
                                            testName = clinicalNotes.ifBlank { "Complete Diagnostic Panel" },
                                            stage = "in_lab"
                                        )
                                        actionMessage = "✓ Stage 2: Sample is now Processing in Lab!"
                                    }
                                },
                                modifier = Modifier.weight(1f),
                                shape = RoundedCornerShape(8.dp),
                                contentPadding = PaddingValues(horizontal = 6.dp, vertical = 6.dp)
                            ) {
                                Text("2. Process in Lab", fontSize = 10.5.sp, fontWeight = FontWeight.Bold, color = Color(0xFFD97706))
                            }
                            Button(
                                onClick = {
                                    coroutineScope.launch {
                                        labReportRepository?.upsertLabReportForAppointment(
                                            appointmentId = appointment.id,
                                            clinicId = appointment.clinicId,
                                            patientName = appointment.patientName,
                                            testName = clinicalNotes.ifBlank { "Complete Diagnostic Panel" },
                                            stage = "prepared",
                                            fileName = "Dactor_Lab_Report_${appointment.trackingCode10Digit}.pdf"
                                        )
                                        actionMessage = "✓ Stage 3: Lab Report Published & Patient Notified!"
                                        navController.navigate(NavRoutes.LabWorkflow)
                                    }
                                },
                                colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF059669)),
                                modifier = Modifier.weight(1f),
                                shape = RoundedCornerShape(8.dp),
                                contentPadding = PaddingValues(horizontal = 6.dp, vertical = 6.dp)
                            ) {
                                Text("3. Publish Report", fontSize = 10.5.sp, fontWeight = FontWeight.Bold, color = Color.White)
                            }
                        }
                    }
                }
            }
        }
    }

    // Edit Past Remark Dialog
    editingPastApptRemark?.let { pastAppt ->
        AlertDialog(
            onDismissRequest = { editingPastApptRemark = null },
            title = { Text("Edit Past Visit Remark (${pastAppt.appointmentDate})", fontWeight = FontWeight.Bold, fontSize = 16.sp) },
            text = {
                OutlinedTextField(
                    value = pastRemarkInput,
                    onValueChange = { pastRemarkInput = it },
                    label = { Text("Clinical Remark") },
                    minLines = 3,
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(10.dp)
                )
            },
            confirmButton = {
                Button(
                    onClick = {
                        coroutineScope.launch {
                            val ok = billingRepository?.saveRemarkForAppointment(pastAppt.id, pastAppt.clinicId, pastRemarkInput.trim()) ?: false
                            if (ok) {
                                pastRemarksMap = pastRemarksMap + (pastAppt.id to pastRemarkInput.trim())
                                actionMessage = "✓ Past visit remark saved to server!"
                            }
                            editingPastApptRemark = null
                        }
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF0097A7))
                ) {
                    Text("Save to Server", color = Color.White, fontWeight = FontWeight.Bold)
                }
            },
            dismissButton = {
                TextButton(onClick = { editingPastApptRemark = null }) { Text("Cancel") }
            }
        )
    }

    // Reschedule Date Picker Dialog
    if (showPastDatePicker) {
        val initialDate = try {
            if (pastDateInput.length == 10) LocalDate.parse(pastDateInput) else LocalDate.now().plusDays(1)
        } catch (_: Exception) { LocalDate.now().plusDays(1) }

        DatePickerDialog(
            context,
            { _, year, month, dayOfMonth ->
                val chosen = LocalDate.of(year, month + 1, dayOfMonth)
                pastDateInput = chosen.toString()
                selectedPastSlotId = null
                showPastDatePicker = false
            },
            initialDate.year,
            initialDate.monthValue - 1,
            initialDate.dayOfMonth
        ).apply {
            datePicker.minDate = System.currentTimeMillis()
        }.show()
        showPastDatePicker = false
    }

    // Edit Past Date / Reschedule Dialog
    editingPastApptDate?.let { pastAppt ->
        Dialog(onDismissRequest = { if (!isSavingPastSchedule) editingPastApptDate = null }) {
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
                            onClick = { editingPastApptDate = null },
                            enabled = !isSavingPastSchedule,
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
                                Text(pastAppt.patientName, fontWeight = FontWeight.Bold, fontSize = 14.sp, color = Color(0xFF0F172A))
                                Text("Code: #${pastAppt.trackingCode10Digit} • ${pastAppt.patientMobile}", fontSize = 11.sp, color = Color(0xFF0284C7), fontFamily = FontFamily.Monospace)
                            }
                            Surface(
                                shape = RoundedCornerShape(6.dp),
                                color = Color(0xFFFEF3C7)
                            ) {
                                Text(
                                    text = (pastAppt.checkinStatus ?: "ACTIVE").uppercase(),
                                    color = Color(0xFF92400E),
                                    fontWeight = FontWeight.Bold,
                                    fontSize = 10.sp,
                                    modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
                                )
                            }
                        }
                    }

                    // Doctor Selector
                    if (doctorsList.isNotEmpty()) {
                        Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                            Text("Consulting Doctor", fontSize = 12.sp, fontWeight = FontWeight.Bold, color = Color(0xFF334155))
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .horizontalScroll(rememberScrollState()),
                                horizontalArrangement = Arrangement.spacedBy(6.dp)
                            ) {
                                doctorsList.forEach { doc ->
                                    val isSelected = pastDoctorId == doc.id
                                    FilterChip(
                                        selected = isSelected,
                                        onClick = {
                                            pastDoctorId = doc.id
                                            selectedPastSlotId = null
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
                                value = pastDateInput,
                                onValueChange = {
                                    pastDateInput = it
                                    selectedPastSlotId = null
                                },
                                label = { Text("Date (YYYY-MM-DD)") },
                                singleLine = true,
                                shape = RoundedCornerShape(10.dp),
                                modifier = Modifier.weight(1f)
                            )
                            IconButton(
                                onClick = { showPastDatePicker = true },
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
                                    pastDateInput = todayDate.toString()
                                    selectedPastSlotId = null
                                },
                                label = { Text("Today", fontSize = 11.sp) },
                                colors = SuggestionChipDefaults.suggestionChipColors(
                                    containerColor = if (pastDateInput == todayDate.toString()) Color(0xFFE0F2FE) else Color.White
                                )
                            )
                            SuggestionChip(
                                onClick = {
                                    pastDateInput = todayDate.plusDays(1).toString()
                                    selectedPastSlotId = null
                                },
                                label = { Text("Tomorrow", fontSize = 11.sp) },
                                colors = SuggestionChipDefaults.suggestionChipColors(
                                    containerColor = if (pastDateInput == todayDate.plusDays(1).toString()) Color(0xFFE0F2FE) else Color.White
                                )
                            )
                            SuggestionChip(
                                onClick = {
                                    pastDateInput = todayDate.plusDays(2).toString()
                                    selectedPastSlotId = null
                                },
                                label = { Text("+2 Days", fontSize = 11.sp) },
                                colors = SuggestionChipDefaults.suggestionChipColors(
                                    containerColor = if (pastDateInput == todayDate.plusDays(2).toString()) Color(0xFFE0F2FE) else Color.White
                                )
                            )
                            SuggestionChip(
                                onClick = {
                                    pastDateInput = todayDate.plusDays(7).toString()
                                    selectedPastSlotId = null
                                },
                                label = { Text("+1 Week", fontSize = 11.sp) },
                                colors = SuggestionChipDefaults.suggestionChipColors(
                                    containerColor = if (pastDateInput == todayDate.plusDays(7).toString()) Color(0xFFE0F2FE) else Color.White
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
                            if (isLoadingPastSlots) {
                                CircularProgressIndicator(modifier = Modifier.size(12.dp), strokeWidth = 1.5.dp, color = Color(0xFF0097A7))
                            }
                        }

                        if (availablePastSlots.isNotEmpty()) {
                            LazyRow(
                                horizontalArrangement = Arrangement.spacedBy(6.dp),
                                modifier = Modifier.fillMaxWidth()
                            ) {
                                items(availablePastSlots) { slot ->
                                    val isSelected = selectedPastSlotId == slot.id
                                    val availableCapacity = (slot.maxCapacity - slot.bookedCount).coerceAtLeast(0)
                                    val timeLabel = "${slot.startTime} – ${slot.endTime}"

                                    Surface(
                                        shape = RoundedCornerShape(8.dp),
                                        color = if (isSelected) Color(0xFF0097A7) else Color(0xFFF1F5F9),
                                        border = BorderStroke(1.dp, if (isSelected) Color(0xFF0097A7) else Color(0xFFCBD5E1)),
                                        modifier = Modifier.clickable {
                                            selectedPastSlotId = slot.id
                                            pastTimeInput = slot.startTime
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
                        value = pastTimeInput,
                        onValueChange = { pastTimeInput = it },
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
                            val cleanDate = pastDateInput.trim()
                            val cleanTime = pastTimeInput.trim()
                            if (cleanDate.length == 10 && cleanTime.isNotBlank()) {
                                isSavingPastSchedule = true
                                coroutineScope.launch {
                                    val ok = appointmentRepository?.rescheduleAppointment(
                                        id = pastAppt.id,
                                        newDate = cleanDate,
                                        newTime = cleanTime,
                                        newSlotId = selectedPastSlotId,
                                        newDoctorId = pastDoctorId.ifBlank { null }
                                    ) ?: false

                                    isSavingPastSchedule = false
                                    if (ok) {
                                        val clinicIdToUse = pastAppt.clinicId.ifBlank { appointment.clinicId }
                                        if (cleanDate == LocalDate.now().toString()) {
                                            queueRepository?.getQueueForClinic(clinicIdToUse)
                                            actionMessage = "✓ Rescheduled ${pastAppt.patientName} for Today ($cleanTime) & re-added to live queue!"
                                        } else {
                                            actionMessage = "✓ Rescheduled ${pastAppt.patientName} for $cleanDate at $cleanTime!"
                                        }
                                        editingPastApptDate = null
                                        loadChartData()
                                    } else {
                                        actionMessage = "Reschedule failed. Please try again."
                                    }
                                }
                            }
                        },
                        shape = RoundedCornerShape(10.dp),
                        colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF0097A7)),
                        enabled = !isSavingPastSchedule && pastDateInput.isNotBlank() && pastTimeInput.isNotBlank(),
                        modifier = Modifier.fillMaxWidth().height(44.dp)
                    ) {
                        if (isSavingPastSchedule) {
                            CircularProgressIndicator(color = Color.White, modifier = Modifier.size(16.dp), strokeWidth = 2.dp)
                        } else {
                            Icon(Icons.Default.Check, contentDescription = null, tint = Color.White, modifier = Modifier.size(16.dp))
                            Spacer(Modifier.width(6.dp))
                            Text("Save & Update Schedule", fontWeight = FontWeight.Bold, color = Color.White)
                        }
                    }

                    // Cancel Button
                    TextButton(
                        onClick = { editingPastApptDate = null },
                        enabled = !isSavingPastSchedule,
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Text("Cancel", color = Color(0xFF64748B))
                    }
                }
            }
        }
    }

    // Schedule Follow-Up Dialog
    if (showScheduleFollowUpDialog) {
        AlertDialog(
            onDismissRequest = { showScheduleFollowUpDialog = false },
            title = { Text("Schedule Follow-Up Visit", fontWeight = FontWeight.Bold, fontSize = 16.sp) },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    OutlinedTextField(
                        value = followUpDate,
                        onValueChange = { followUpDate = it },
                        label = { Text("Date (YYYY-MM-DD)") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )
                    OutlinedTextField(
                        value = followUpTime,
                        onValueChange = { followUpTime = it },
                        label = { Text("Time (e.g. 10:30 AM)") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )
                    OutlinedTextField(
                        value = followUpNotes,
                        onValueChange = { followUpNotes = it },
                        label = { Text("Follow-Up Remarks") },
                        minLines = 2,
                        modifier = Modifier.fillMaxWidth()
                    )
                }
            },
            confirmButton = {
                Button(
                    onClick = {
                        coroutineScope.launch {
                            val newAppt = Appointment(
                                id = UUID.randomUUID().toString(),
                                trackingCode10Digit = TrackingCodeGenerator.generate(),
                                clinicId = appointment.clinicId,
                                doctorId = followUpDoctorId.ifBlank { appointment.doctorId },
                                userId = appointment.userId,
                                patientName = appointment.patientName,
                                patientAge = appointment.patientAge,
                                patientGender = appointment.patientGender,
                                patientMobile = appointment.patientMobile,
                                patientEmail = appointment.patientEmail,
                                paymentStatus = "pending",
                                checkinStatus = "waiting",
                                appointmentDate = followUpDate.trim(),
                                appointmentTime = followUpTime.trim(),
                                feeAmount = 0.0, // Follow-up visit: free consultation
                                isWalkin = true
                            )
                            val created = appointmentRepository?.createWalkinAppointment(newAppt)
                            if (created != null) {
                                if (followUpNotes.isNotBlank()) {
                                    billingRepository?.saveRemarkForAppointment(created.id, appointment.clinicId, followUpNotes.trim())
                                }
                                actionMessage = "✓ Follow-up scheduled for $followUpDate!"
                                loadChartData()
                            }
                            showScheduleFollowUpDialog = false
                        }
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF0097A7))
                ) {
                    Text("Confirm & Schedule", color = Color.White, fontWeight = FontWeight.Bold)
                }
            },
            dismissButton = {
                TextButton(onClick = { showScheduleFollowUpDialog = false }) { Text("Cancel") }
            }
        )
    }
}
