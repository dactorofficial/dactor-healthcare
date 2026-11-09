package com.dactor.clinic.ui.walkin

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Phone
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.*
import com.dactor.clinic.domain.util.DateTimePickers
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.positionInRoot
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.navigation.NavController
import com.dactor.clinic.data.model.Appointment
import com.dactor.clinic.data.repository.AppointmentRepository
import com.dactor.clinic.domain.util.TrackingCodeGenerator
import kotlinx.coroutines.launch
import java.time.LocalDate

import androidx.compose.foundation.horizontalScroll
import com.dactor.clinic.data.model.Doctor

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun WalkinBookingScreen(
    navController: NavController,
    clinicId: String = "",
    appointmentRepository: AppointmentRepository? = null,
    doctorRepository: com.dactor.clinic.data.repository.DoctorRepository? = null,
    slotRepository: com.dactor.clinic.data.repository.SlotRepository? = null,
    clinicRepository: com.dactor.clinic.data.repository.ClinicRepository? = null
) {
    val context = androidx.compose.ui.platform.LocalContext.current
    val session = remember { com.dactor.clinic.data.local.UserSessionManager(context) }
    var effectiveClinicId by remember(clinicId) {
        mutableStateOf(
            if (clinicId.isNotBlank() && clinicId != "c1") clinicId
            else session.getSavedClinicId() ?: session.getSavedActiveClinicIdForDoctor() ?: ""
        )
    }
    var patientName by remember { mutableStateOf("") }
    var mobileNumber by remember { mutableStateOf("") }
    var age by remember { mutableStateOf("") }
    var selectedGender by remember { mutableStateOf("") }
    var email by remember { mutableStateOf("") }
    var appointmentDate by remember { mutableStateOf(LocalDate.now().toString()) }

    var validationTriggered by remember { mutableStateOf(false) }
    val nameFocus = remember { FocusRequester() }
    val phoneFocus = remember { FocusRequester() }
    val ageFocus = remember { FocusRequester() }

    var nameFieldY by remember { mutableIntStateOf(0) }
    var phoneFieldY by remember { mutableIntStateOf(0) }
    var ageFieldY by remember { mutableIntStateOf(0) }
    var genderFieldY by remember { mutableIntStateOf(0) }
    var labTestsFieldY by remember { mutableIntStateOf(0) }

    val cleanPhone = mobileNumber.filter { it.isDigit() }
    val parsedAge = age.trim().toIntOrNull()

    val isNameError = (validationTriggered || patientName.isNotEmpty()) && patientName.trim().length < 2
    val isPhoneError = (validationTriggered || mobileNumber.isNotEmpty()) && (cleanPhone.length != 10 || !cleanPhone.startsWith("9"))
    val isAgeError = (validationTriggered || age.isNotEmpty()) && (parsedAge == null || parsedAge !in 1..120)
    val isGenderError = validationTriggered && selectedGender.isBlank()

    val todayStr = remember { java.time.LocalDate.now().toString() }
    val isDateInPast = appointmentDate < todayStr

    var feeAmount by remember { mutableStateOf("500") }
    var isFollowUpVisit by remember { mutableStateOf(false) }
    var isOverbookingConfirmed by remember { mutableStateOf(false) }
    var pastClinicAppointments by remember { mutableStateOf<List<Appointment>>(emptyList()) }
    var returningPatientRecord by remember { mutableStateOf<Appointment?>(null) }

    var affiliatedDoctors by remember { mutableStateOf<List<Doctor>>(emptyList()) }
    var selectedDoctor by remember { mutableStateOf<Doctor?>(null) }
    var publishedSlots by remember { mutableStateOf<List<com.dactor.clinic.data.model.Slot>>(emptyList()) }
    var selectedSlot by remember { mutableStateOf<com.dactor.clinic.data.model.Slot?>(null) }

    // Check whether the selected slot's end time is over.
    val isTimeInPast = remember(appointmentDate, selectedSlot) {
        val slot = selectedSlot
        if (slot != null) {
            com.dactor.clinic.data.repository.SlotRepository.isSlotEndTimeOver(
                endTimeStr = slot.endTime,
                dateStr = appointmentDate,
                startTimeStr = slot.startTime
            )
        } else false
    }

    var isLabClinic by remember { mutableStateOf(false) }
    var availableLabTests by remember { mutableStateOf<List<com.dactor.clinic.data.model.ClinicService>>(emptyList()) }
    var selectedLabTests by remember { mutableStateOf<List<com.dactor.clinic.data.model.ClinicService>>(emptyList()) }
    val isLabTestError = validationTriggered && isLabClinic && availableLabTests.isNotEmpty() && selectedLabTests.isEmpty()

    LaunchedEffect(effectiveClinicId) {
        if (effectiveClinicId.isBlank() && clinicRepository != null) {
            try {
                val allClinics = clinicRepository.getClinics()
                val matched = allClinics.firstOrNull { it.contactEmail.equals(session.getSavedEmail(), ignoreCase = true) }
                    ?: allClinics.firstOrNull()
                if (matched != null) {
                    effectiveClinicId = matched.id
                }
            } catch (ignored: Exception) {}
        }
        if (clinicRepository != null && effectiveClinicId.isNotBlank()) {
            try {
                val c = clinicRepository.getClinicById(effectiveClinicId)
                val t = c?.type?.lowercase() ?: ""
                val n = c?.name?.lowercase() ?: ""
                val labDetected = t == "diagnostic_lab" || t.contains("lab") || n.contains("lab") ||
                    (c?.specialties?.any { it.lowercase().contains("lab") || it.lowercase().contains("patholog") } == true)
                isLabClinic = labDetected
                if (labDetected) {
                    feeAmount = "0"
                    availableLabTests = clinicRepository.getClinicServices(effectiveClinicId)
                }
            } catch (ignored: Exception) {}
        }
        if (doctorRepository != null && effectiveClinicId.isNotBlank()) {
            val docs = doctorRepository.getDoctorsByClinic(effectiveClinicId)
            affiliatedDoctors = docs
            if (selectedDoctor == null) {
                selectedDoctor = docs.firstOrNull()
            }
        }
        if (appointmentRepository != null && effectiveClinicId.isNotBlank()) {
            try {
                pastClinicAppointments = appointmentRepository.getAppointmentsByClinic(effectiveClinicId)
            } catch (_: Exception) {}
        }
    }

    LaunchedEffect(mobileNumber, selectedDoctor, pastClinicAppointments) {
        val clean = mobileNumber.filter { it.isDigit() }.takeLast(10)
        if (clean.length == 10) {
            val matchedPrior = pastClinicAppointments.firstOrNull { appt ->
                val pPhone = appt.patientMobile.filter { it.isDigit() }.takeLast(10)
                pPhone == clean && (selectedDoctor == null || appt.doctorId == selectedDoctor?.id) &&
                    !appt.status.equals("cancelled", ignoreCase = true) &&
                    !appt.status.equals("rejected", ignoreCase = true)
            }
            returningPatientRecord = matchedPrior
            if (matchedPrior != null) {
                isFollowUpVisit = true
                feeAmount = "0"
            }
        } else {
            returningPatientRecord = null
        }
    }

    LaunchedEffect(effectiveClinicId, appointmentDate, selectedDoctor) {
        if (slotRepository != null && effectiveClinicId.isNotBlank() && selectedDoctor != null) {
            val allSlots = slotRepository.getSlots(effectiveClinicId, appointmentDate)
            val activeSlots = allSlots.filter { slot ->
                slot.doctorId == selectedDoctor?.id &&
                    !com.dactor.clinic.data.repository.SlotRepository.isSlotEndTimeOver(
                        endTimeStr = slot.endTime,
                        dateStr = appointmentDate,
                        startTimeStr = slot.startTime
                    )
            }
            publishedSlots = activeSlots
            // Clear selectedSlot if its end time is now over or it's no longer in activeSlots
            if (selectedSlot != null && activeSlots.none { it.id == selectedSlot?.id }) {
                selectedSlot = null
            }
            // Auto-select first slot that has open availability; if all full, fallback to first slot for overbooking
            if (selectedSlot == null && activeSlots.isNotEmpty()) {
                selectedSlot = activeSlots.firstOrNull { it.bookedCount < it.maxCapacity } ?: activeSlots.first()
            }
        } else {
            publishedSlots = emptyList()
        }
    }

    var isSubmitting by remember { mutableStateOf(false) }
    var confirmedCode by remember { mutableStateOf<String?>(null) }
    var errorMessage by remember { mutableStateOf<String?>(null) }

    val coroutineScope = rememberCoroutineScope()
    val scrollState = rememberScrollState()

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Reception Desk Walk-In Booking", fontWeight = FontWeight.Bold) },
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
            Text(
                text = "Book an offline in-person consultation on the spot. If the patient registers on Dactor with this phone or email in the future, all records sync automatically.",
                fontSize = 12.sp,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )

            if (errorMessage != null) {
                Surface(
                    color = MaterialTheme.colorScheme.errorContainer,
                    shape = RoundedCornerShape(12.dp),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Text(
                        text = errorMessage ?: "",
                        color = MaterialTheme.colorScheme.onErrorContainer,
                        modifier = Modifier.padding(12.dp),
                        fontSize = 13.sp
                    )
                }
            }

            OutlinedTextField(
                value = patientName,
                onValueChange = {
                    patientName = it
                    if (errorMessage != null) errorMessage = null
                },
                label = { Text("Patient Full Name *") },
                placeholder = { Text("Full Legal Name") },
                leadingIcon = { Icon(Icons.Default.Person, contentDescription = null) },
                isError = isNameError,
                supportingText = if (isNameError) {
                    { Text("Required: Patient full name (at least 2 characters)", color = MaterialTheme.colorScheme.error, fontSize = 11.sp) }
                } else null,
                modifier = Modifier
                    .fillMaxWidth()
                    .focusRequester(nameFocus)
                    .onGloballyPositioned { nameFieldY = it.positionInRoot().y.toInt() },
                shape = RoundedCornerShape(12.dp)
            )

            OutlinedTextField(
                value = mobileNumber,
                onValueChange = {
                    if (it.length <= 10 && it.all { ch -> ch.isDigit() }) mobileNumber = it
                    if (errorMessage != null) errorMessage = null
                },
                label = { Text("Mobile Number (+977) *") },
                placeholder = { Text("98xxxxxxxx (10 digits)") },
                leadingIcon = { Icon(Icons.Default.Phone, contentDescription = null) },
                isError = isPhoneError,
                supportingText = if (isPhoneError) {
                    { Text("Required: Exactly 10 digits starting with 9", color = MaterialTheme.colorScheme.error, fontSize = 11.sp) }
                } else null,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone),
                modifier = Modifier
                    .fillMaxWidth()
                    .focusRequester(phoneFocus)
                    .onGloballyPositioned { phoneFieldY = it.positionInRoot().y.toInt() },
                shape = RoundedCornerShape(12.dp)
            )

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                OutlinedTextField(
                    value = age,
                    onValueChange = {
                        if (it.length <= 3 && it.all { ch -> ch.isDigit() }) age = it
                        if (errorMessage != null) errorMessage = null
                    },
                    label = { Text("Age *") },
                    placeholder = { Text("e.g. 35") },
                    isError = isAgeError,
                    supportingText = if (isAgeError) {
                        { Text("Age: 1-120", color = MaterialTheme.colorScheme.error, fontSize = 10.sp) }
                    } else null,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    modifier = Modifier
                        .weight(1f)
                        .focusRequester(ageFocus)
                        .onGloballyPositioned { ageFieldY = it.positionInRoot().y.toInt() },
                    shape = RoundedCornerShape(12.dp)
                )

                Column(
                    modifier = Modifier
                        .weight(2f)
                        .onGloballyPositioned { genderFieldY = it.positionInRoot().y.toInt() }
                ) {
                    Text(
                        text = "Gender *" + if (isGenderError) " (Required)" else "",
                        fontSize = 12.sp,
                        color = if (isGenderError) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurfaceVariant,
                        fontWeight = if (isGenderError) FontWeight.Bold else FontWeight.Normal
                    )
                    Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                        listOf("Male", "Female", "Other").forEach { gender ->
                            FilterChip(
                                selected = selectedGender == gender,
                                onClick = {
                                    selectedGender = gender
                                    if (errorMessage != null) errorMessage = null
                                },
                                label = { Text(gender, fontSize = 12.sp) },
                                border = if (isGenderError) BorderStroke(1.dp, MaterialTheme.colorScheme.error) else null
                            )
                        }
                    }
                }
            }

            OutlinedTextField(
                value = email,
                onValueChange = { email = it },
                label = { Text("Email (Optional for Future Sync)") },
                placeholder = { Text("patient@example.com") },
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email),
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(12.dp)
            )

            if (affiliatedDoctors.isNotEmpty()) {
                Text("Select Attending Doctor", fontWeight = FontWeight.Bold, fontSize = 13.sp)
                Row(
                    modifier = Modifier.horizontalScroll(androidx.compose.foundation.rememberScrollState()),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    for (doc in affiliatedDoctors) {
                        FilterChip(
                            selected = selectedDoctor?.id == doc.id,
                            onClick = {
                                selectedDoctor = doc
                                if (!isFollowUpVisit) {
                                    feeAmount = (doc.consultationFee ?: 500.0).toInt().toString()
                                }
                            },
                            label = { Text("Dr. ${doc.fullName} (${doc.specialty})", fontSize = 12.sp) }
                        )
                    }
                }
            }

            // ─── CONSULTATION VISIT TYPE & FEE ─────────────────────────────
            if (!isLabClinic) {
                Card(
                    colors = CardDefaults.cardColors(
                        containerColor = if (isFollowUpVisit) Color(0xFFEFF6FF) else Color(0xFFF8FAFC)
                    ),
                    border = BorderStroke(
                        1.dp,
                        if (isFollowUpVisit) Color(0xFFBFDBFE) else MaterialTheme.colorScheme.outlineVariant
                    ),
                    shape = RoundedCornerShape(14.dp),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Column(
                        modifier = Modifier.padding(14.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text(
                                "Consultation Visit Type",
                                fontWeight = FontWeight.Bold,
                                fontSize = 13.sp,
                                color = MaterialTheme.colorScheme.onSurface
                            )
                            Text(
                                if (isFollowUpVisit) "Fee: Free (Rs. 0)" else "Fee: Rs. $feeAmount",
                                fontWeight = FontWeight.ExtraBold,
                                fontSize = 13.sp,
                                color = if (isFollowUpVisit) Color(0xFF2563EB) else Color(0xFF0D9488)
                            )
                        }

                        if (returningPatientRecord != null) {
                            Surface(
                                color = Color(0xFFDCFCE7),
                                border = BorderStroke(1.dp, Color(0xFF86EFAC)),
                                shape = RoundedCornerShape(8.dp),
                                modifier = Modifier.fillMaxWidth()
                            ) {
                                Row(
                                    modifier = Modifier.padding(8.dp),
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(6.dp)
                                ) {
                                    Icon(
                                        Icons.Default.CheckCircle,
                                        contentDescription = null,
                                        tint = Color(0xFF15803D),
                                        modifier = Modifier.size(16.dp)
                                    )
                                    Text(
                                        text = "Returning patient detected! Prior visit with Dr. ${selectedDoctor?.fullName ?: "Doctor"} on ${returningPatientRecord?.appointmentDate ?: "record"}. Eligible for Free Follow-up.",
                                        fontSize = 11.sp,
                                        color = Color(0xFF166534),
                                        fontWeight = FontWeight.SemiBold
                                    )
                                }
                            }
                        }

                        Row(
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            FilterChip(
                                selected = !isFollowUpVisit,
                                onClick = {
                                    isFollowUpVisit = false
                                    feeAmount = (selectedDoctor?.consultationFee ?: 500.0).toInt().toString()
                                },
                                label = { Text("New Patient (Paid)", fontSize = 12.sp, fontWeight = FontWeight.Bold) },
                                colors = FilterChipDefaults.filterChipColors(
                                    selectedContainerColor = Color(0xFF0D9488),
                                    selectedLabelColor = Color.White
                                )
                            )
                            FilterChip(
                                selected = isFollowUpVisit,
                                onClick = {
                                    isFollowUpVisit = true
                                    feeAmount = "0"
                                },
                                label = { Text("Follow-up (Free / Rs. 0)", fontSize = 12.sp, fontWeight = FontWeight.Bold) },
                                colors = FilterChipDefaults.filterChipColors(
                                    selectedContainerColor = Color(0xFF2563EB),
                                    selectedLabelColor = Color.White
                                )
                            )
                        }

                        Text(
                            text = if (isFollowUpVisit) {
                                "✓ Follow-up consultation is free of charge (0 NPR). Amount received will not be increased."
                            } else {
                                "Standard consultation fee of Rs. $feeAmount will be recorded for this new patient."
                            },
                            fontSize = 11.sp,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }
            }

            // Appointment Date
            OutlinedTextField(
                value = appointmentDate,
                onValueChange = { appointmentDate = it },
                label = { Text("Appointment Date *") },
                placeholder = { Text("YYYY-MM-DD") },
                trailingIcon = {
                    IconButton(onClick = {
                        DateTimePickers.showDatePicker(context, appointmentDate) { picked ->
                            appointmentDate = picked
                        }
                    }) {
                        Icon(Icons.Default.CalendarMonth, contentDescription = "Pick Date", tint = MaterialTheme.colorScheme.primary)
                    }
                },
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(12.dp)
            )

            // Published Slots Section
            if (!isLabClinic) {
                if (publishedSlots.isEmpty()) {
                    Card(
                        colors = CardDefaults.cardColors(
                            containerColor = MaterialTheme.colorScheme.errorContainer.copy(alpha = 0.5f)
                        ),
                        border = BorderStroke(1.dp, MaterialTheme.colorScheme.error.copy(alpha = 0.4f)),
                        shape = RoundedCornerShape(12.dp),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Row(
                            modifier = Modifier.padding(14.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(10.dp)
                        ) {
                            Icon(Icons.Default.Warning, contentDescription = null, tint = MaterialTheme.colorScheme.error)
                            Column {
                                Text(
                                    "No Published OPD Slots",
                                    fontWeight = FontWeight.Bold,
                                    fontSize = 13.sp,
                                    color = MaterialTheme.colorScheme.onErrorContainer
                                )
                                Text(
                                    "No active OPD slots are published for ${selectedDoctor?.fullName?.let { "Dr. $it" } ?: "the attending doctor"} on $appointmentDate. Please create and publish slots in Doctor Schedule before issuing walk-in tokens.",
                                    fontSize = 11.5.sp,
                                    color = MaterialTheme.colorScheme.onErrorContainer
                                )
                            }
                        }
                    }
                } else {
                    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        val totalAvailableSpots = publishedSlots.sumOf { (it.maxCapacity - it.bookedCount).coerceAtLeast(0) }
                        val allSlotsFull = publishedSlots.isNotEmpty() && totalAvailableSpots == 0

                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text("Select Published OPD Slot *", fontWeight = FontWeight.Bold, fontSize = 13.sp)
                            Surface(
                                color = if (allSlotsFull) Color(0xFFFEF3C7) else Color(0xFFE8F5E9),
                                shape = RoundedCornerShape(6.dp)
                            ) {
                                Text(
                                    text = if (allSlotsFull) "All Full \u2022 Overbooking Mode" else "$totalAvailableSpots available \u2022 ${publishedSlots.size} slot${if (publishedSlots.size > 1) "s" else ""}",
                                    fontSize = 11.sp,
                                    fontWeight = FontWeight.SemiBold,
                                    color = if (allSlotsFull) Color(0xFFB45309) else Color(0xFF2E7D32),
                                    modifier = Modifier.padding(horizontal = 8.dp, vertical = 2.dp)
                                )
                            }
                        }

                        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            for (slot in publishedSlots) {
                                val spotsAvailable = (slot.maxCapacity - slot.bookedCount).coerceAtLeast(0)
                                val isFull = slot.bookedCount >= slot.maxCapacity
                                val isSelected = selectedSlot?.id == slot.id
                                val slotRange = "${slot.startTime} - ${slot.endTime}"

                                Surface(
                                    onClick = { selectedSlot = slot },
                                    shape = RoundedCornerShape(12.dp),
                                    color = when {
                                        isSelected && isFull -> Color(0xFFFEF3C7)
                                        isSelected -> MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.7f)
                                        isFull -> Color(0xFFFFFBEB)
                                        else -> MaterialTheme.colorScheme.surface
                                    },
                                    border = BorderStroke(
                                        width = if (isSelected) 2.dp else 1.dp,
                                        color = when {
                                            isSelected && isFull -> Color(0xFFD97706)
                                            isSelected -> MaterialTheme.colorScheme.primary
                                            isFull -> Color(0xFFF59E0B)
                                            else -> MaterialTheme.colorScheme.outlineVariant
                                        }
                                    ),
                                    modifier = Modifier.fillMaxWidth()
                                ) {
                                    Row(
                                        modifier = Modifier
                                            .fillMaxWidth()
                                            .padding(horizontal = 14.dp, vertical = 12.dp),
                                        verticalAlignment = Alignment.CenterVertically,
                                        horizontalArrangement = Arrangement.SpaceBetween
                                    ) {
                                        Row(
                                            verticalAlignment = Alignment.CenterVertically,
                                            horizontalArrangement = Arrangement.spacedBy(10.dp),
                                            modifier = Modifier.weight(1f)
                                        ) {
                                            RadioButton(
                                                selected = isSelected,
                                                onClick = { selectedSlot = slot },
                                                colors = RadioButtonDefaults.colors(
                                                    selectedColor = if (isFull) Color(0xFFD97706) else MaterialTheme.colorScheme.primary
                                                )
                                            )
                                            Column {
                                                Text(
                                                    text = slotRange,
                                                    fontWeight = FontWeight.Bold,
                                                    fontSize = 14.sp,
                                                    color = if (isSelected && !isFull) MaterialTheme.colorScheme.onPrimaryContainer else MaterialTheme.colorScheme.onSurface
                                                )
                                                if (isFull) {
                                                    Surface(
                                                        color = Color(0xFFFEF3C7),
                                                        shape = RoundedCornerShape(6.dp),
                                                        modifier = Modifier.padding(top = 4.dp)
                                                    ) {
                                                        Text(
                                                            text = "Full (${slot.bookedCount}/${slot.maxCapacity}) \u2022 Overbooking Available",
                                                            color = Color(0xFFB45309),
                                                            fontWeight = FontWeight.Bold,
                                                            fontSize = 11.sp,
                                                            modifier = Modifier.padding(horizontal = 8.dp, vertical = 2.dp)
                                                        )
                                                    }
                                                } else {
                                                    Row(
                                                        verticalAlignment = Alignment.CenterVertically,
                                                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                                                        modifier = Modifier.padding(top = 2.dp)
                                                    ) {
                                                        Surface(
                                                            color = Color(0xFFE8F5E9),
                                                            shape = RoundedCornerShape(4.dp)
                                                        ) {
                                                            Text(
                                                                text = "$spotsAvailable available",
                                                                color = Color(0xFF2E7D32),
                                                                fontWeight = FontWeight.Bold,
                                                                fontSize = 11.sp,
                                                                modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
                                                            )
                                                        }
                                                        Text(
                                                            text = "(${slot.bookedCount} / ${slot.maxCapacity} booked)",
                                                            fontSize = 11.sp,
                                                            color = MaterialTheme.colorScheme.onSurfaceVariant
                                                        )
                                                    }
                                                }
                                            }
                                        }
                                        Text(
                                            text = "Cap: ${slot.maxCapacity}",
                                            fontSize = 11.sp,
                                            fontWeight = FontWeight.Medium,
                                            color = MaterialTheme.colorScheme.onSurfaceVariant
                                        )
                                    }
                                }
                            }
                        }
                    }
                }
            }

            // Validation Banner if Past Date or Expired Slot End Time Selected
            if (isDateInPast || isTimeInPast) {
                Surface(
                    color = MaterialTheme.colorScheme.errorContainer,
                    shape = RoundedCornerShape(12.dp),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Row(
                        modifier = Modifier.padding(12.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Icon(Icons.Default.Warning, contentDescription = null, tint = MaterialTheme.colorScheme.error)
                        Text(
                            text = if (isDateInPast) {
                                "Selected appointment date ($appointmentDate) is in the past. Walk-in will be booked for today ($todayStr)."
                            } else {
                                "Cannot select past slot (${selectedSlot?.let { "${it.startTime} - ${it.endTime}" }}). The ending time of this slot has already passed."
                            },
                            color = MaterialTheme.colorScheme.onErrorContainer,
                            fontSize = 12.sp,
                            fontWeight = FontWeight.SemiBold
                        )
                    }
                }
            }

            if (isLabClinic) {
                Card(
                    colors = CardDefaults.cardColors(containerColor = if (isLabTestError) Color(0xFFFEF2F2) else Color(0xFFF0F9FF)),
                    border = BorderStroke(if (isLabTestError) 1.5.dp else 1.dp, if (isLabTestError) MaterialTheme.colorScheme.error else Color(0xFFBAE6FD)),
                    shape = RoundedCornerShape(14.dp),
                    modifier = Modifier
                        .fillMaxWidth()
                        .onGloballyPositioned { labTestsFieldY = it.positionInRoot().y.toInt() }
                ) {
                    Column(
                        modifier = Modifier.padding(14.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text(
                                "Select Lab Tests / Reports *",
                                fontWeight = FontWeight.Bold,
                                fontSize = 14.sp,
                                color = Color(0xFF0F4C81)
                            )
                            Text(
                                "Total: Rs. ${selectedLabTests.sumOf { it.price }.toInt()}",
                                fontWeight = FontWeight.ExtraBold,
                                fontSize = 14.sp,
                                color = Color(0xFF059669)
                            )
                        }
                        Text(
                            "Price is decided by selecting which diagnostic reports the patient wants.",
                            fontSize = 11.5.sp,
                            color = Color(0xFF475569)
                        )
                        if (availableLabTests.isEmpty()) {
                            Text(
                                "No lab tests configured yet. Add tests & rates in 'Lab Tests & Rates' under Operational Management.",
                                fontSize = 11.5.sp,
                                color = Color(0xFFDC2626),
                                fontWeight = FontWeight.Medium
                            )
                        } else {
                            availableLabTests.forEach { test ->
                                val isChecked = selectedLabTests.any { it.id == test.id }
                                Surface(
                                    onClick = {
                                        selectedLabTests = if (isChecked) {
                                            selectedLabTests.filterNot { it.id == test.id }
                                        } else {
                                            selectedLabTests + test
                                        }
                                        feeAmount = selectedLabTests.sumOf { it.price }.toInt().toString()
                                    },
                                    shape = RoundedCornerShape(10.dp),
                                    color = if (isChecked) Color(0xFFE0F2FE) else Color.White,
                                    modifier = Modifier.fillMaxWidth()
                                ) {
                                    Row(
                                        modifier = Modifier
                                            .fillMaxWidth()
                                            .padding(horizontal = 10.dp, vertical = 8.dp),
                                        verticalAlignment = Alignment.CenterVertically,
                                        horizontalArrangement = Arrangement.SpaceBetween
                                    ) {
                                        Row(
                                            verticalAlignment = Alignment.CenterVertically,
                                            modifier = Modifier.weight(1f)
                                        ) {
                                            Checkbox(
                                                checked = isChecked,
                                                onCheckedChange = { checked ->
                                                    selectedLabTests = if (checked) {
                                                        selectedLabTests + test
                                                    } else {
                                                        selectedLabTests.filterNot { it.id == test.id }
                                                    }
                                                    feeAmount = selectedLabTests.sumOf { it.price }.toInt().toString()
                                                }
                                            )
                                            Column {
                                                Text(test.serviceName, fontWeight = FontWeight.SemiBold, fontSize = 13.sp, color = Color(0xFF0F172A))
                                                if (!test.description.isNullOrBlank()) {
                                                    Text(test.description, fontSize = 11.sp, color = Color(0xFF64748B))
                                                }
                                            }
                                        }
                                        Text(
                                            "Rs. ${test.price.toInt()}",
                                            fontWeight = FontWeight.Bold,
                                            fontSize = 13.sp,
                                            color = Color(0xFF0F4C81)
                                        )
                                    }
                                }
                            }
                        }
                    }
                }
            }

            // Contextual Slot Capacity & Overbooking Status Notice
            if (!isLabClinic && selectedSlot != null) {
                val isSelectedFull = selectedSlot!!.bookedCount >= selectedSlot!!.maxCapacity
                if (isSelectedFull) {
                    Card(
                        colors = CardDefaults.cardColors(
                            containerColor = Color(0xFFFFFBEB)
                        ),
                        border = BorderStroke(1.dp, Color(0xFFF59E0B)),
                        shape = RoundedCornerShape(14.dp),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Row(
                            modifier = Modifier.padding(14.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(10.dp)
                        ) {
                            Icon(Icons.Default.Warning, contentDescription = null, tint = Color(0xFFD97706))
                            Column {
                                Text("Reception Desk Overbooking Active", fontWeight = FontWeight.Bold, fontSize = 13.sp, color = Color(0xFF92400E))
                                Text(
                                    "The selected OPD slot (${selectedSlot?.startTime} - ${selectedSlot?.endTime}) is at maximum capacity (${selectedSlot?.bookedCount}/${selectedSlot?.maxCapacity}). Submitting will overbook this walk-in patient into today's queue.",
                                    fontSize = 11.5.sp,
                                    color = Color(0xFFB45309)
                                )
                            }
                        }
                    }
                } else {
                    Surface(
                        color = Color(0xFFF0FDF4),
                        border = BorderStroke(1.dp, Color(0xFFBBF7D0)),
                        shape = RoundedCornerShape(12.dp),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Row(
                            modifier = Modifier.padding(12.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(10.dp)
                        ) {
                            Icon(Icons.Default.CheckCircle, contentDescription = null, tint = Color(0xFF16A34A))
                            Column {
                                Text("Slot Available", fontWeight = FontWeight.Bold, fontSize = 13.sp, color = Color(0xFF166534))
                                Text(
                                    "Slot ${selectedSlot?.startTime} - ${selectedSlot?.endTime} has ${(selectedSlot!!.maxCapacity - selectedSlot!!.bookedCount).coerceAtLeast(0)} open spots remaining (${selectedSlot!!.bookedCount}/${selectedSlot!!.maxCapacity} booked). Patient will be placed in queue according to slot schedule.",
                                    fontSize = 11.5.sp,
                                    color = Color(0xFF15803D)
                                )
                            }
                        }
                    }
                }
            }

            if (errorMessage != null) {
                Surface(
                    color = MaterialTheme.colorScheme.errorContainer,
                    shape = RoundedCornerShape(12.dp),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Row(
                        modifier = Modifier.padding(12.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Icon(Icons.Default.Warning, contentDescription = null, tint = MaterialTheme.colorScheme.error)
                        Text(
                            text = errorMessage ?: "",
                            color = MaterialTheme.colorScheme.onErrorContainer,
                            fontSize = 13.sp,
                            fontWeight = FontWeight.SemiBold
                        )
                    }
                }
            }

            val isSelectedSlotOverbooked = !isLabClinic && selectedSlot != null && selectedSlot!!.bookedCount >= selectedSlot!!.maxCapacity
            Button(
                onClick = {
                    validationTriggered = true
                    if (patientName.trim().length < 2) {
                        errorMessage = "Please enter patient name (at least 2 characters)."
                        coroutineScope.launch {
                            scrollState.animateScrollTo((nameFieldY - 150).coerceAtLeast(0))
                            runCatching { nameFocus.requestFocus() }
                        }
                        return@Button
                    }
                    if (cleanPhone.length != 10 || !cleanPhone.startsWith("9")) {
                        errorMessage = "Mobile number must be exactly 10 digits starting with 9."
                        coroutineScope.launch {
                            scrollState.animateScrollTo((phoneFieldY - 150).coerceAtLeast(0))
                            runCatching { phoneFocus.requestFocus() }
                        }
                        return@Button
                    }
                    if (parsedAge == null || parsedAge !in 1..120) {
                        errorMessage = "Please enter a valid age between 1 and 120."
                        coroutineScope.launch {
                            scrollState.animateScrollTo((ageFieldY - 150).coerceAtLeast(0))
                            runCatching { ageFocus.requestFocus() }
                        }
                        return@Button
                    }
                    if (selectedGender.isBlank()) {
                        errorMessage = "Please select patient gender."
                        coroutineScope.launch {
                            scrollState.animateScrollTo((genderFieldY - 150).coerceAtLeast(0))
                        }
                        return@Button
                    }
                    if (isLabClinic && availableLabTests.isNotEmpty() && selectedLabTests.isEmpty()) {
                        errorMessage = "Please select at least one diagnostic lab test / report."
                        coroutineScope.launch {
                            scrollState.animateScrollTo((labTestsFieldY - 150).coerceAtLeast(0))
                        }
                        return@Button
                    }

                    val actualDate = if (appointmentDate < todayStr) todayStr else appointmentDate
                    if (appointmentDate < todayStr) {
                        appointmentDate = todayStr
                    }

                    if (!isLabClinic && selectedSlot == null) {
                        errorMessage = if (publishedSlots.isEmpty()) {
                            "No published OPD slots for this doctor on $appointmentDate. Please create slots first."
                        } else {
                            "Please select a published OPD time slot."
                        }
                        coroutineScope.launch { scrollState.animateScrollTo(0) }
                        return@Button
                    }

                    // Block if the selected slot's end time is in the past
                    if (isTimeInPast) {
                        errorMessage = "Selected slot (${selectedSlot?.let { "${it.startTime} - ${it.endTime}" }}) has already passed. Please select an active slot."
                        coroutineScope.launch { scrollState.animateScrollTo(0) }
                        return@Button
                    }

                    val slotTimeRange = if (selectedSlot != null) {
                        "${selectedSlot!!.startTime} - ${selectedSlot!!.endTime}"
                    } else {
                        try {
                            java.time.LocalTime.now().plusMinutes(5).format(java.time.format.DateTimeFormatter.ofPattern("HH:mm"))
                        } catch (e: Exception) { "10:00" }
                    }

                    isSubmitting = true
                    errorMessage = null

                    coroutineScope.launch {
                        val generatedCode = TrackingCodeGenerator.generate()
                        try {
                            var cleanClinicId = effectiveClinicId.trim().ifBlank {
                                session.getSavedClinicId() ?: session.getSavedActiveClinicIdForDoctor() ?: ""
                            }
                            if (cleanClinicId.isBlank() && clinicRepository != null) {
                                val allClinics = clinicRepository.getClinics()
                                val matched = allClinics.firstOrNull { it.contactEmail.equals(session.getSavedEmail(), ignoreCase = true) }
                                    ?: allClinics.firstOrNull()
                                if (matched != null) {
                                    cleanClinicId = matched.id
                                    effectiveClinicId = matched.id
                                }
                            }
                            val selectedTestsSummary = if (selectedLabTests.isNotEmpty()) {
                                selectedLabTests.joinToString(", ") { "${it.serviceName} (Rs. ${it.price.toInt()})" }
                            } else null
                            val computedFee = if (isLabClinic) {
                                selectedLabTests.sumOf { it.price }
                            } else if (isFollowUpVisit) {
                                0.0
                            } else {
                                selectedDoctor?.consultationFee ?: (feeAmount.toDoubleOrNull() ?: 500.0)
                            }
                            val walkin = Appointment(
                                id = java.util.UUID.randomUUID().toString(),
                                trackingCode10Digit = generatedCode,
                                slotId = selectedSlot?.id,
                                clinicId = cleanClinicId,
                                doctorId = selectedDoctor?.id ?: affiliatedDoctors.firstOrNull()?.id,
                                patientName = patientName.trim(),
                                patientMobile = cleanPhone,
                                patientAge = (age.trim().toIntOrNull() ?: 30).coerceIn(1, 120),
                                patientGender = selectedGender,
                                patientEmail = email.trim().ifBlank { null },
                                appointmentDate = actualDate,
                                appointmentTime = slotTimeRange,
                                paymentStatus = "paid",
                                checkinStatus = "checked_in",
                                feeAmount = computedFee,
                                totalAmount = computedFee,
                                paymentMode = if (computedFee > 0.0) "CASH" else "FREE",
                                isWalkin = true,
                                selectedLabTests = selectedTestsSummary
                            )

                            val result = appointmentRepository?.createWalkinAppointment(walkin, allowOverbooking = true)
                            if (result != null) {
                                confirmedCode = result.trackingCode10Digit.ifBlank { generatedCode }
                                // Immediately persist into clinic_patient_directory local records so it appears in Patient Directory
                                try {
                                    val resolvedPatientId = result.userId?.takeIf { it.isNotBlank() }
                                        ?: (if (email.isNotBlank()) com.dactor.clinic.domain.util.PatientIdentitySync.getDeterministicPatientIdForEmail(email)
                                            else com.dactor.clinic.domain.util.PatientIdentitySync.getDeterministicPatientIdForPhone(cleanPhone))
                                    val directoryPrefs = context.getSharedPreferences("clinic_patient_directory", android.content.Context.MODE_PRIVATE)
                                    val key = "records_${cleanClinicId.ifBlank { "default" }}"
                                    val savedRaw = directoryPrefs.getString(key, "") ?: ""
                                    val existing = savedRaw.split("\n").mapNotNull { line ->
                                        val parts = line.split("|")
                                        if (parts.size >= 5 && parts[0].isNotBlank()) {
                                            com.dactor.clinic.data.model.Profile(
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
                                    }.toMutableList()

                                    val newProf = com.dactor.clinic.data.model.Profile(
                                        id = resolvedPatientId,
                                        authUid = null,
                                        email = email.trim(),
                                        fullName = patientName.trim(),
                                        role = "patient",
                                        phone = cleanPhone,
                                        gender = selectedGender.ifBlank { "Male" },
                                        age = age.trim().toIntOrNull() ?: 30
                                    )

                                    existing.removeAll {
                                        it.id == resolvedPatientId ||
                                        (email.isNotBlank() && it.email.equals(email.trim(), ignoreCase = true)) ||
                                        (cleanPhone.isNotBlank() && it.phone == cleanPhone)
                                    }
                                    existing.add(0, newProf)

                                    val serialized = existing.joinToString("\n") { p ->
                                        listOf(
                                            p.id,
                                            (p.fullName ?: "").replace("|", " ").replace("\n", " "),
                                            (p.phone ?: "").replace("|", " ").replace("\n", " "),
                                            (p.gender ?: "Male").replace("|", " ").replace("\n", " "),
                                            p.email.replace("|", " ").replace("\n", " "),
                                            p.age?.toString() ?: ""
                                        ).joinToString("|")
                                    }
                                    directoryPrefs.edit().putString(key, serialized).apply()
                                } catch (e: Exception) {
                                    e.printStackTrace()
                                }
                            } else {
                                errorMessage = "Failed to save walk-in appointment. Please check your internet connection and try again."
                                scrollState.animateScrollTo(0)
                            }
                        } catch (e: Exception) {
                            e.printStackTrace()
                            errorMessage = "Error saving walk-in: ${e.message ?: "Please try again."}"
                            scrollState.animateScrollTo(0)
                        } finally {
                            isSubmitting = false
                        }
                    }
                },
                modifier = Modifier
                    .fillMaxWidth()
                    .height(52.dp),
                shape = RoundedCornerShape(14.dp),
                enabled = !isSubmitting
            ) {
                Text(
                    text = when {
                        isSubmitting && isSelectedSlotOverbooked -> "Overbooking Walk-In..."
                        isSubmitting -> "Booking Walk-In..."
                        isSelectedSlotOverbooked -> "Confirm & Overbook Walk-In Patient"
                        else -> "Confirm Walk-In & Generate 10-Digit Code"
                    },
                    fontWeight = FontWeight.Bold
                )
            }
        }

        // Confirmation Dialog with 10-digit code
        if (confirmedCode != null) {
            AlertDialog(
                onDismissRequest = {
                    confirmedCode = null
                    navController.popBackStack()
                },
                icon = { Icon(Icons.Default.CheckCircle, contentDescription = null, tint = Color(0xFF059669), modifier = Modifier.size(36.dp)) },
                title = { Text("Walk-In Appointment Confirmed!", fontWeight = FontWeight.Bold) },
                text = {
                    Column(
                        horizontalAlignment = Alignment.CenterHorizontally,
                        modifier = Modifier.fillMaxWidth(),
                        verticalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Text("Patient is enqueued. Provide this 10-digit tracking code to the patient:", fontSize = 13.sp)
                        Surface(
                            color = MaterialTheme.colorScheme.primaryContainer,
                            shape = RoundedCornerShape(12.dp)
                        ) {
                            Text(
                                text = confirmedCode ?: "",
                                fontSize = 22.sp,
                                fontWeight = FontWeight.ExtraBold,
                                color = MaterialTheme.colorScheme.onPrimaryContainer,
                                letterSpacing = 2.sp,
                                modifier = Modifier.padding(horizontal = 20.dp, vertical = 10.dp)
                            )
                        }
                        Text(
                            "The patient can track their live queue position at anytime using this code without logging in.",
                            fontSize = 11.sp,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                },
                confirmButton = {
                    Button(onClick = {
                        confirmedCode = null
                        navController.popBackStack()
                    }) {
                        Text("Done")
                    }
                }
            )
        }
    }
}
