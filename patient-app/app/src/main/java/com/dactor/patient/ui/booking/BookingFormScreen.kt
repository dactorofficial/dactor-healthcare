package com.dactor.patient.ui.booking

import android.widget.Toast
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.ArrowForward
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.positionInParent
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.navigation.NavController
import com.dactor.patient.data.model.Appointment
import com.dactor.patient.data.model.Slot
import com.dactor.patient.data.repository.AppointmentRepository
import com.dactor.patient.domain.util.TrackingCodeGenerator
import com.dactor.patient.ui.navigation.NavRoutes
import kotlinx.coroutines.launch
import java.util.UUID

private val FormTeal = Color(0xFF00796B)
private val FormTealDark = Color(0xFF004D40)
private val FormTealLight = Color(0xFFE0F2F1)
private val FormBg = Color(0xFFF8FAFC)
private val SlateDark = Color(0xFF0F172A)
private val SlateMuted = Color(0xFF64748B)
private val CardBorderColor = Color(0xFFE2E8F0)
private val ErrorRed = Color(0xFFDC2626)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun BookingFormScreen(
    navController: NavController,
    slotId: String = "",
    clinicId: String = "",
    clinicType: String = "", // "single_visit", "multi_visit", "diagnostic_lab"
    appointmentRepository: AppointmentRepository? = null,
    slotRepository: com.dactor.patient.data.repository.SlotRepository? = null,
    clinicRepository: com.dactor.patient.data.repository.ClinicRepository? = null,
    authRepository: com.dactor.patient.data.repository.AuthRepository? = null,
    sessionManager: com.dactor.patient.data.local.UserSessionManager? = null,
    doctorRepository: com.dactor.patient.data.repository.DoctorRepository? = null
) {
    val context = LocalContext.current
    val isUserLoggedIn = sessionManager?.isLoggedIn() == true ||
            (authRepository?.isLoggedIn() ?: false) ||
            (try { com.google.firebase.auth.FirebaseAuth.getInstance().currentUser != null } catch (e: Exception) { false })

    // Never auto-fill name, gender, or age from Google account; only use explicitly saved patient profile fields
    val savedName = if (isUserLoggedIn) sessionManager?.getSavedName()?.ifBlank { null } else null
    val savedEmail = if (isUserLoggedIn) (sessionManager?.getSavedEmail()?.ifBlank { null }
        ?: try { com.google.firebase.auth.FirebaseAuth.getInstance().currentUser?.email } catch (e: Exception) { null }) else null
    val savedPhone = if (isUserLoggedIn) sessionManager?.getSavedPhone()?.ifBlank { null } else null
    val savedAge = if (isUserLoggedIn) sessionManager?.getSavedAge()?.toString() else null
    val savedGender = if (isUserLoggedIn) sessionManager?.getSavedGender()?.ifBlank { null } else null
    val savedPatientId = if (isUserLoggedIn) (sessionManager?.getSavedPatientId()?.ifBlank { null }
        ?: try { com.google.firebase.auth.FirebaseAuth.getInstance().currentUser?.uid } catch (e: Exception) { null }) else null

    var savedProfileName by remember { mutableStateOf(savedName ?: "") }
    var savedProfilePhone by remember { mutableStateOf(savedPhone ?: "") }
    var savedProfileAge by remember { mutableStateOf(savedAge ?: "") }
    var savedProfileGender by remember { mutableStateOf(savedGender ?: "") }
    var savedProfileEmail by remember { mutableStateOf(savedEmail ?: "") }

    LaunchedEffect(isUserLoggedIn) {
        if (!isUserLoggedIn) {
            Toast.makeText(context, "Please sign in with Google to book an appointment", Toast.LENGTH_SHORT).show()
            navController.navigate(NavRoutes.Login.route)
        }
    }

    var isReturningPatient by remember { mutableStateOf(false) }
    var selectedReturningCode by remember { mutableStateOf("") }
    var manualCodeInput by remember { mutableStateOf("") }
    var retainedAppointment by remember { mutableStateOf<Appointment?>(null) }
    var isLookingUpCode by remember { mutableStateOf(false) }
    val isRetainedCompleted = retainedAppointment?.checkinStatus?.lowercase() in listOf("done", "completed")
    val isRetainedActive = retainedAppointment != null && !isRetainedCompleted && retainedAppointment?.checkinStatus?.lowercase() != "cancelled"

    var fullName by remember { mutableStateOf("") }
    var age by remember { mutableStateOf("") }
    var selectedGender by remember { mutableStateOf("") }
    var mobile by remember { mutableStateOf("") }
    var email by remember { mutableStateOf("") }
    var visitNotes by remember { mutableStateOf("") }

    var validationTriggered by remember { mutableStateOf(false) }
    val nameFocusRequester = remember { FocusRequester() }
    val mobileFocusRequester = remember { FocusRequester() }
    val ageFocusRequester = remember { FocusRequester() }
    val emailFocusRequester = remember { FocusRequester() }
    val codeFocusRequester = remember { FocusRequester() }

    var followupCardOffsetY by remember { mutableIntStateOf(0) }
    var labCardOffsetY by remember { mutableIntStateOf(0) }
    var patientCardOffsetY by remember { mutableIntStateOf(0) }
    var nameFieldOffsetY by remember { mutableIntStateOf(0) }
    var mobileFieldOffsetY by remember { mutableIntStateOf(0) }
    var ageFieldOffsetY by remember { mutableIntStateOf(0) }
    var emailFieldOffsetY by remember { mutableIntStateOf(0) }

    val savedCodes = remember { mutableStateListOf<Pair<String, String>>() }

    var errorMessage by remember { mutableStateOf<String?>(null) }
    var isSubmitting by remember { mutableStateOf(false) }
    var pendingPayAtDeskAppointment by remember { mutableStateOf<Appointment?>(null) }
    var showPendingPayAtDeskDialog by remember { mutableStateOf(false) }
    var isCancellingPendingPayAtDesk by remember { mutableStateOf(false) }
    val coroutineScope = rememberCoroutineScope()
    val scrollState = rememberScrollState()

    fun fillFromSavedProfile() {
        val nameToFill = savedProfileName.ifBlank { sessionManager?.getSavedName().orEmpty() }
        val phoneToFill = savedProfilePhone.ifBlank { sessionManager?.getSavedPhone().orEmpty() }
        val ageToFill = savedProfileAge.ifBlank { sessionManager?.getSavedAge()?.toString().orEmpty() }
        val genderToFill = savedProfileGender.ifBlank { sessionManager?.getSavedGender().orEmpty() }
        val emailToFill = savedProfileEmail.ifBlank { sessionManager?.getSavedEmail().orEmpty() }

        if (nameToFill.isBlank() && phoneToFill.isBlank() && emailToFill.isBlank()) {
            Toast.makeText(context, "No saved profile details found for this account. Please enter manually.", Toast.LENGTH_LONG).show()
            return
        }

        if (nameToFill.isNotBlank()) fullName = nameToFill
        if (phoneToFill.isNotBlank()) {
            val digits = phoneToFill.filter { it.isDigit() }
            mobile = if (digits.startsWith("977") && digits.length == 13) digits.drop(3) else digits
        }
        if (ageToFill.isNotBlank()) age = ageToFill
        if (genderToFill.isNotBlank()) selectedGender = genderToFill
        if (emailToFill.isNotBlank()) email = emailToFill

        if (errorMessage != null) errorMessage = null
        val filledDisplayName = nameToFill.ifBlank { "your account" }
        Toast.makeText(context, "Filled details from saved profile: $filledDisplayName", Toast.LENGTH_SHORT).show()
    }

    var loadedSlot by remember { mutableStateOf<Slot?>(null) }
    var slotDoctorName by remember { mutableStateOf<String?>(null) }
    var slotDoctorSpecialty by remember { mutableStateOf<String?>(null) }
    var clinicDisplayName by remember { mutableStateOf<String?>(null) }
    var consultationFee by remember { mutableStateOf(500.0) }
    var effectiveClinicType by remember { mutableStateOf(clinicType) }

    val isMultiVisitClinic = remember(effectiveClinicType) {
        effectiveClinicType.equals("multi_visit", ignoreCase = true) ||
        effectiveClinicType.contains("multi", ignoreCase = true)
    }

    var isLabClinicDetected by remember { mutableStateOf(false) }
    val isLabClinic = remember(effectiveClinicType, clinicDisplayName, isLabClinicDetected) {
        isLabClinicDetected ||
        effectiveClinicType.equals("diagnostic_lab", ignoreCase = true) ||
        effectiveClinicType.contains("lab", ignoreCase = true) ||
        (clinicDisplayName?.contains("lab", ignoreCase = true) == true)
    }
    var availableLabTests by remember { mutableStateOf<List<com.dactor.patient.data.model.ClinicService>>(emptyList()) }
    var selectedLabTests by remember { mutableStateOf<Set<com.dactor.patient.data.model.ClinicService>>(emptySet()) }

    // Live validation criteria: red mark stays until each field's exact criteria is met
    val cleanMobileDigits = remember(mobile) {
        val digits = mobile.filter { it.isDigit() }
        if (digits.startsWith("977") && digits.length == 13) digits.drop(3) else digits
    }
    val isMobileValid = cleanMobileDigits.length == 10 && cleanMobileDigits.startsWith("9")
    val isMobileError = (validationTriggered || mobile.isNotBlank()) && !isReturningPatient && !isMobileValid

    val isNameValid = fullName.trim().length >= 2 && fullName.trim().any { it.isLetter() }
    val isNameError = (validationTriggered || fullName.isNotBlank()) && !isReturningPatient && !isNameValid

    val parsedAge = age.trim().toIntOrNull()
    val isAgeValid = parsedAge != null && parsedAge in 1..120
    val isAgeError = (validationTriggered || age.isNotBlank()) && !isReturningPatient && !isAgeValid

    val isGenderValid = selectedGender.isNotBlank()
    val isGenderError = validationTriggered && !isReturningPatient && !isGenderValid

    val isEmailValid = email.trim().isEmpty() || android.util.Patterns.EMAIL_ADDRESS.matcher(email.trim()).matches()
    val isEmailError = (validationTriggered || email.isNotBlank()) && !isReturningPatient && !isEmailValid

    val isLabTestsValid = !isLabClinic || selectedLabTests.isNotEmpty()
    val isLabTestsError = validationTriggered && !isReturningPatient && !isLabTestsValid

    val isFollowupCodeValid = manualCodeInput.length == 10 && manualCodeInput.all { it.isDigit() }
    val isFollowupCodeError = (validationTriggered || manualCodeInput.isNotBlank()) && isReturningPatient && !isFollowupCodeValid

    LaunchedEffect(isMultiVisitClinic, isLabClinic) {
        if (isLabClinic || (!isMultiVisitClinic && isReturningPatient && savedCodes.isEmpty())) {
            isReturningPatient = false
            selectedReturningCode = ""
            manualCodeInput = ""
            retainedAppointment = null
        }
    }

    LaunchedEffect(isReturningPatient, manualCodeInput) {
        if (isReturningPatient && manualCodeInput.length == 10 && appointmentRepository != null) {
            isLookingUpCode = true
            try {
                retainedAppointment = appointmentRepository.getAppointmentByTrackingCode(manualCodeInput)
            } catch (e: Exception) {
                retainedAppointment = null
            } finally {
                isLookingUpCode = false
            }
        } else {
            retainedAppointment = null
            isLookingUpCode = false
        }
    }

    LaunchedEffect(clinicId, loadedSlot, effectiveClinicType) {
        val cid = clinicId.ifBlank { loadedSlot?.clinicId ?: "" }
        if (cid.isNotBlank() && clinicRepository != null) {
            var labDetectedNow = isLabClinic
            try {
                val c = clinicRepository.getClinicById(cid)
                if (c != null) {
                    clinicDisplayName = c.name
                    val t = c.type?.lowercase() ?: ""
                    val n = c.name.lowercase()
                    val specHasLab = c.specialties?.any { it.lowercase().contains("lab") || it.lowercase().contains("patholog") } == true
                    if (t == "diagnostic_lab" || t.contains("lab") || n.contains("lab") || specHasLab) {
                        isLabClinicDetected = true
                        effectiveClinicType = "diagnostic_lab"
                        labDetectedNow = true
                    } else if (!c.type.isNullOrBlank()) {
                        effectiveClinicType = c.type
                    }
                }
            } catch (ignored: Exception) {}

            if (labDetectedNow || isLabClinic) {
                try {
                    availableLabTests = clinicRepository.getClinicServices(cid)
                    // No fixed/direct fee for lab clinics: price is strictly the sum of selected tests
                    consultationFee = selectedLabTests.sumOf { it.price }
                } catch (e: Exception) {
                    e.printStackTrace()
                }
            }
        }
    }

    LaunchedEffect(slotId) {
        if (slotId.isNotBlank() && slotRepository != null) {
            try {
                val s = slotRepository.getSlotById(slotId)
                if (s != null) {
                    loadedSlot = s
                    if (doctorRepository != null && !s.doctorId.isNullOrBlank()) {
                        val doc = doctorRepository.getDoctorById(s.doctorId)
                        slotDoctorName = doc?.fullName
                        slotDoctorSpecialty = doc?.specialty
                        val docFee = doc?.consultationFee ?: 0.0
                        if (docFee > 0.0 && !isLabClinic) {
                            consultationFee = docFee
                        }
                    }
                }
            } catch (e: Exception) {
                e.printStackTrace()
            }
        }
    }

    LaunchedEffect(Unit) {
        if (sessionManager != null) {
            val localCodes = sessionManager.getSavedTrackingCodes()
            savedCodes.clear()
            savedCodes.addAll(localCodes)
            if (appointmentRepository != null) {
                try {
                    val linkedAppts = appointmentRepository.getAllPatientAppointments(
                        userId = savedPatientId,
                        email = savedEmail,
                        phone = savedPhone,
                        trackingCodes = localCodes.map { it.first }
                    )
                    for (a in linkedAppts) {
                        if (a.trackingCode10Digit.isNotBlank()) {
                            val label = "${a.patientName} • ${a.appointmentDate}"
                            sessionManager.saveTrackingCode(a.trackingCode10Digit, label)
                            if (savedCodes.none { it.first == a.trackingCode10Digit }) {
                                savedCodes.add(a.trackingCode10Digit to label)
                            }
                        }
                    }
                } catch (ignored: Exception) {}
            }
        }

        if (isUserLoggedIn) {
            val queryEmail = savedEmail ?: authRepository?.getCurrentUserEmail()
            if (!queryEmail.isNullOrBlank() && authRepository != null) {
                try {
                    val profile = authRepository.getProfileByEmail(queryEmail)
                    if (profile != null) {
                        if (!profile.fullName.isNullOrBlank()) {
                            savedProfileName = profile.fullName
                        }
                        if (!profile.phone.isNullOrBlank()) {
                            savedProfilePhone = profile.phone
                        }
                        if (profile.age != null && profile.age > 0) {
                            savedProfileAge = profile.age.toString()
                        }
                        if (!profile.gender.isNullOrBlank()) {
                            savedProfileGender = profile.gender
                        }
                        if (!profile.email.isNullOrBlank()) {
                            savedProfileEmail = profile.email
                        }
                    }
                } catch (ignored: Exception) {}
            }
            if (savedProfileName.isBlank()) {
                val fbName = try { com.google.firebase.auth.FirebaseAuth.getInstance().currentUser?.displayName } catch (e: Exception) { null }
                if (!fbName.isNullOrBlank()) savedProfileName = fbName
            }
        }
    }

    val cleanDoctorDisplay = remember(slotDoctorName) {
        val raw = slotDoctorName?.trim().orEmpty()
        if (raw.isBlank()) "OPD Attending Physician"
        else if (raw.startsWith("Dr.", ignoreCase = true)) raw
        else "Dr. $raw"
    }

    fun executeCreateBooking(forceProceed: Boolean = false) {
        if (isSubmitting) return
        errorMessage = null
        isSubmitting = true

        coroutineScope.launch {
            try {
                var resolvedClinicId = clinicId.ifBlank { null }
                var resolvedDoctorId: String? = null
                var resolvedDate = java.time.LocalDate.now().toString()
                var resolvedTime = "09:30"

                val s = loadedSlot ?: (if (slotId.isNotBlank() && slotRepository != null) slotRepository.getSlotById(slotId) else null)
                if (s != null) {
                    if (com.dactor.patient.data.repository.SlotRepository.isSlotEndTimeOver(s.endTime, s.slotDate, s.startTime)) {
                        errorMessage = "This slot (${s.startTime} - ${s.endTime}) has ended and is no longer available to book."
                        isSubmitting = false
                        return@launch
                    }
                    if (resolvedClinicId == null && s.clinicId.isNotBlank()) {
                        resolvedClinicId = s.clinicId
                    }
                    if (!s.doctorId.isNullOrBlank() && !isLabClinic) {
                        resolvedDoctorId = s.doctorId
                    }
                    resolvedDate = s.slotDate
                    resolvedTime = com.dactor.patient.data.repository.AppointmentRepository.normalizeTimeForPostgres(s.startTime)
                }

                if (resolvedClinicId == null && clinicRepository != null) {
                    resolvedClinicId = clinicRepository.getClinics().firstOrNull()?.id
                }

                val finalClinicId = resolvedClinicId ?: "b5d931aa-15d2-4eee-b2f1-7729d2f28d64"

                if (!isLabClinic && resolvedDoctorId.isNullOrBlank() && doctorRepository != null) {
                    try {
                        val docs = doctorRepository.getDoctors(finalClinicId)
                        resolvedDoctorId = docs.firstOrNull()?.id
                    } catch (ignored: Exception) {}
                }

                val cleanBookingEmail = email.trim().lowercase()
                    .ifBlank { savedEmail?.trim()?.lowercase().orEmpty() }
                    .takeIf { it.isNotBlank() }

                var resolvedUserId: String? = null
                if (!cleanBookingEmail.isNullOrBlank() && authRepository != null) {
                    try {
                        val p = authRepository.getProfileByEmail(cleanBookingEmail)
                        if (p != null) {
                            resolvedUserId = p.id
                        }
                    } catch (ignored: Exception) {}
                }
                if (resolvedUserId == null && isUserLoggedIn && !savedPatientId.isNullOrBlank()) {
                    try {
                        java.util.UUID.fromString(savedPatientId)
                        resolvedUserId = savedPatientId
                    } catch (ignored: Exception) {
                        resolvedUserId = null
                    }
                }

                if (isReturningPatient) {
                    // Retain patient from the 10-digit Appointment ID without requiring patient details input
                    val bookedFollowUp = appointmentRepository?.bookFollowUpAppointment(
                        trackingCode = manualCodeInput,
                        slotId = slotId.ifBlank { null },
                        clinicId = finalClinicId,
                        doctorId = resolvedDoctorId,
                        appointmentDate = resolvedDate,
                        appointmentTime = resolvedTime,
                        fallbackUserId = resolvedUserId,
                        fallbackEmail = cleanBookingEmail
                    )

                    if (bookedFollowUp == null) {
                        errorMessage = "No patient record found for Appointment ID $manualCodeInput. Please verify your 10-digit code."
                        isSubmitting = false
                        return@launch
                    }

                    sessionManager?.saveTrackingCode(
                        bookedFollowUp.trackingCode10Digit,
                        "${bookedFollowUp.patientName} • $resolvedDate"
                    )
                    sessionManager?.saveLastConfirmedAppointment(
                        appointmentId = bookedFollowUp.id,
                        trackingCode = bookedFollowUp.trackingCode10Digit,
                        clinicName = clinicDisplayName ?: "Patan Clinic",
                        doctorName = slotDoctorName ?: "Dr. Kshitiz",
                        doctorSpecialty = slotDoctorSpecialty ?: "Ophthalmology",
                        patientName = bookedFollowUp.patientName,
                        appointmentDate = resolvedDate,
                        timeWindow = if (resolvedTime.contains(" - ")) resolvedTime else if (resolvedTime.contains("09:30") || resolvedTime.contains("09:00")) "09:00 AM - 12:00 PM" else resolvedTime
                    )
                    navController.navigate(NavRoutes.AppointmentConfirmed.createRoute(bookedFollowUp.id))
                } else {
                    // 1. Detect unapproved Pay at Desk appointment for this exact patient
                    if (!forceProceed && appointmentRepository != null) {
                        val pendingAppt = appointmentRepository.findPendingPayAtDeskAppointment(
                            clinicId = finalClinicId,
                            patientMobile = mobile.trim(),
                            appointmentDate = resolvedDate,
                            patientName = fullName.trim()
                        )
                        if (pendingAppt != null) {
                            pendingPayAtDeskAppointment = pendingAppt
                            showPendingPayAtDeskDialog = true
                            isSubmitting = false
                            return@launch
                        }
                    }

                    val generatedCode = TrackingCodeGenerator.generate()
                    val apptId = UUID.randomUUID().toString()

                    val selectedTestsStr = if (isLabClinic && selectedLabTests.isNotEmpty()) {
                        selectedLabTests.joinToString(", ") { "${it.serviceName} (Rs. ${it.price.toInt()})" }
                    } else null

                    val effectiveBookingFee = if (isLabClinic) selectedLabTests.sumOf { it.price } else consultationFee
                    val effectiveDoctorId = if (isLabClinic) null else resolvedDoctorId

                    val appt = Appointment(
                        id = apptId,
                        trackingCode10Digit = generatedCode,
                        slotId = slotId.ifBlank { null },
                        clinicId = finalClinicId,
                        doctorId = effectiveDoctorId,
                        userId = resolvedUserId,
                        patientName = fullName.trim(),
                        patientMobile = mobile.trim(),
                        patientAge = age.toIntOrNull() ?: 30,
                        patientGender = selectedGender,
                        patientEmail = cleanBookingEmail,
                        appointmentDate = resolvedDate,
                        appointmentTime = resolvedTime,
                        paymentStatus = "pending",
                        checkinStatus = "not_checked_in",
                        feeAmount = effectiveBookingFee,
                        isWalkin = false,
                        optInEarlyCall = false,
                        selectedLabTests = selectedTestsStr
                    )

                    val createdAppt = appointmentRepository?.createAppointment(appt) ?: appt
                    val finalApptId = createdAppt.id.ifBlank { apptId }
                    val finalTracking = createdAppt.trackingCode10Digit.ifBlank { generatedCode }
                    val finalFee = if (isLabClinic && effectiveBookingFee > 0.0) effectiveBookingFee else if (createdAppt.feeAmount > 0.0) createdAppt.feeAmount else consultationFee
                    val resolvedExpiresAtMs = createdAppt.expiresAt?.let { iso ->
                        try {
                            java.time.Instant.parse(iso).toEpochMilli()
                        } catch (_: Exception) {
                            try {
                                java.time.OffsetDateTime.parse(iso).toInstant().toEpochMilli()
                            } catch (_: Exception) {
                                null
                            }
                        }
                    } ?: (System.currentTimeMillis() + 300_000L)

                    sessionManager?.saveTrackingCode(finalTracking, "${fullName.trim()} • $resolvedDate")
                    sessionManager?.saveActivePaymentSession(
                        appointmentId = finalApptId,
                        clinicId = finalClinicId,
                        doctorId = effectiveDoctorId,
                        slotId = slotId.ifBlank { null },
                        appointmentDate = resolvedDate,
                        amount = finalFee,
                        transactionId = "TXN-$finalTracking",
                        expiresAtEpochMs = resolvedExpiresAtMs,
                        patientName = fullName.trim(),
                        trackingCode = finalTracking
                    )
                    navController.navigate(NavRoutes.Payment.createRoute(finalApptId))
                }
            } catch (e: Exception) {
                e.printStackTrace()
                errorMessage = "Booking error: ${e.message ?: "Please try again."}"
            } finally {
                isSubmitting = false
            }
        }
    }

    Scaffold(
        containerColor = FormBg,
        topBar = {
            Surface(
                color = Color.White,
                shadowElevation = 2.dp
            ) {
                TopAppBar(
                    colors = TopAppBarDefaults.topAppBarColors(containerColor = Color.White),
                    title = {
                        Column {
                            Text(
                                "Patient Appointment Form",
                                fontWeight = FontWeight.ExtraBold,
                                fontSize = 18.sp,
                                color = SlateDark
                            )
                            Text(
                                "Step 2 of 2 • Confirm Patient Details",
                                fontSize = 11.sp,
                                color = SlateMuted,
                                fontWeight = FontWeight.Medium
                            )
                        }
                    },
                    navigationIcon = {
                        IconButton(onClick = { navController.popBackStack() }) {
                            Icon(
                                Icons.AutoMirrored.Filled.ArrowBack,
                                contentDescription = "Back",
                                tint = SlateDark
                            )
                        }
                    }
                )
            }
        },
        bottomBar = {
            Surface(
                color = Color.White,
                shadowElevation = 12.dp,
                border = BorderStroke(1.dp, CardBorderColor)
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .navigationBarsPadding()
                        .padding(horizontal = 18.dp, vertical = 14.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            text = when {
                                isLabClinic -> "Lab Tests (${selectedLabTests.size} selected)"
                                isReturningPatient && isRetainedActive -> "Reschedule Visit"
                                isReturningPatient -> "Follow-Up Visit"
                                else -> "Consultation Fee"
                            },
                            fontSize = 11.sp,
                            color = SlateMuted,
                            fontWeight = FontWeight.Medium,
                            maxLines = 1,
                            overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis
                        )
                        Text(
                            text = if (isReturningPatient) "FREE (Rs. 0)" else "Rs. ${consultationFee.toInt()}",
                            fontSize = 18.sp,
                            fontWeight = FontWeight.ExtraBold,
                            color = if (isReturningPatient) Color(0xFF059669) else FormTealDark
                        )
                    }

                    Spacer(Modifier.width(10.dp))

                    Button(
                        enabled = !isSubmitting,
                        onClick = {
                            if (isSubmitting) return@Button
                            validationTriggered = true
                            if (isReturningPatient) {
                                if (!isMultiVisitClinic && savedCodes.isEmpty()) {
                                    errorMessage = "Follow-up bookings are only available for clinics with prior visit history."
                                    return@Button
                                }
                                if (!isFollowupCodeValid) {
                                    errorMessage = "Please enter a valid 10-digit Appointment ID."
                                    coroutineScope.launch {
                                        scrollState.animateScrollTo(followupCardOffsetY)
                                        try { codeFocusRequester.requestFocus() } catch (_: Exception) {}
                                    }
                                    return@Button
                                }
                            } else {
                                if (isLabClinic && !isLabTestsValid) {
                                    errorMessage = "Please select at least one laboratory test to proceed."
                                    coroutineScope.launch {
                                        scrollState.animateScrollTo(labCardOffsetY)
                                    }
                                    return@Button
                                }
                                if (!isNameValid) {
                                    errorMessage = "Please enter the patient's full name (minimum 2 letters)."
                                    coroutineScope.launch {
                                        scrollState.animateScrollTo((patientCardOffsetY + nameFieldOffsetY - 80).coerceAtLeast(0))
                                        try { nameFocusRequester.requestFocus() } catch (_: Exception) {}
                                    }
                                    return@Button
                                }
                                if (!isMobileValid) {
                                    errorMessage = "Please enter a valid 10-digit mobile number starting with 9."
                                    coroutineScope.launch {
                                        scrollState.animateScrollTo((patientCardOffsetY + mobileFieldOffsetY - 80).coerceAtLeast(0))
                                        try { mobileFocusRequester.requestFocus() } catch (_: Exception) {}
                                    }
                                    return@Button
                                }
                                if (!isAgeValid) {
                                    errorMessage = "Please enter a valid patient age between 1 and 120."
                                    coroutineScope.launch {
                                        scrollState.animateScrollTo((patientCardOffsetY + ageFieldOffsetY - 80).coerceAtLeast(0))
                                        try { ageFocusRequester.requestFocus() } catch (_: Exception) {}
                                    }
                                    return@Button
                                }
                                if (!isGenderValid) {
                                    errorMessage = "Please select the patient's gender."
                                    coroutineScope.launch {
                                        scrollState.animateScrollTo((patientCardOffsetY + ageFieldOffsetY - 80).coerceAtLeast(0))
                                    }
                                    return@Button
                                }
                                if (!isEmailValid) {
                                    errorMessage = "Please enter a valid email address or leave it blank."
                                    coroutineScope.launch {
                                        scrollState.animateScrollTo((patientCardOffsetY + emailFieldOffsetY - 80).coerceAtLeast(0))
                                        try { emailFocusRequester.requestFocus() } catch (_: Exception) {}
                                    }
                                    return@Button
                                }
                            }

                            executeCreateBooking(forceProceed = false)
                        },
                        shape = RoundedCornerShape(14.dp),
                        colors = ButtonDefaults.buttonColors(
                            containerColor = FormTeal,
                            contentColor = Color.White
                        ),
                        contentPadding = PaddingValues(horizontal = 22.dp, vertical = 14.dp),
                        modifier = Modifier.height(52.dp)
                    ) {
                        if (isSubmitting) {
                            CircularProgressIndicator(
                                modifier = Modifier.size(20.dp),
                                strokeWidth = 2.dp,
                                color = Color.White
                            )
                        } else {
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(8.dp)
                            ) {
                                Text(
                                    text = when {
                                        isReturningPatient && isRetainedActive -> "Confirm Reschedule"
                                        isReturningPatient -> "Confirm Follow-Up"
                                        else -> "Proceed to Payment"
                                    },
                                    fontWeight = FontWeight.Bold,
                                    fontSize = 13.5.sp,
                                    maxLines = 1,
                                    overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis
                                )
                                Icon(
                                    Icons.AutoMirrored.Filled.ArrowForward,
                                    contentDescription = null,
                                    modifier = Modifier.size(18.dp)
                                )
                            }
                        }
                    }
                }
            }
        }
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .verticalScroll(scrollState)
                .padding(horizontal = 16.dp, vertical = 14.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp)
        ) {
            // ── 1. APPOINTMENT SUMMARY HERO CARD ──────────────────────────────
            Card(
                shape = RoundedCornerShape(18.dp),
                colors = CardDefaults.cardColors(containerColor = Color.White),
                border = BorderStroke(1.dp, FormTeal.copy(alpha = 0.22f)),
                elevation = CardDefaults.cardElevation(defaultElevation = 2.dp),
                modifier = Modifier.fillMaxWidth()
            ) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(
                            Brush.horizontalGradient(
                                listOf(FormTealLight.copy(alpha = 0.55f), Color.White)
                            )
                        )
                        .padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        Surface(
                            shape = RoundedCornerShape(14.dp),
                            color = FormTeal,
                            modifier = Modifier.size(48.dp)
                        ) {
                            Box(contentAlignment = Alignment.Center) {
                                Icon(
                                    Icons.Default.EventAvailable,
                                    contentDescription = null,
                                    tint = Color.White,
                                    modifier = Modifier.size(24.dp)
                                )
                            }
                        }

                        Column(modifier = Modifier.weight(1f)) {
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(6.dp)
                            ) {
                                Surface(
                                    shape = RoundedCornerShape(6.dp),
                                    color = FormTeal.copy(alpha = 0.12f)
                                ) {
                                    Text(
                                        text = "PUBLISHED SLOT",
                                        fontSize = 9.sp,
                                        fontWeight = FontWeight.ExtraBold,
                                        color = FormTealDark,
                                        modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
                                    )
                                }
                                if (!clinicDisplayName.isNullOrBlank()) {
                                    Text(
                                        text = "• ${clinicDisplayName!!}",
                                        fontSize = 11.sp,
                                        color = SlateMuted,
                                        fontWeight = FontWeight.SemiBold,
                                        maxLines = 1,
                                        overflow = TextOverflow.Ellipsis
                                    )
                                }
                            }
                            Spacer(modifier = Modifier.height(2.dp))
                            Text(
                                text = cleanDoctorDisplay,
                                fontWeight = FontWeight.ExtraBold,
                                fontSize = 16.sp,
                                color = SlateDark
                            )
                            if (!slotDoctorSpecialty.isNullOrBlank()) {
                                Text(
                                    text = slotDoctorSpecialty!!,
                                    fontSize = 12.sp,
                                    color = SlateMuted
                                )
                            }
                        }
                    }

                    HorizontalDivider(color = FormTeal.copy(alpha = 0.14f))

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(6.dp)
                        ) {
                            Icon(
                                Icons.Default.CalendarToday,
                                contentDescription = null,
                                tint = FormTeal,
                                modifier = Modifier.size(15.dp)
                            )
                            Text(
                                text = loadedSlot?.slotDate ?: java.time.LocalDate.now().toString(),
                                fontWeight = FontWeight.Bold,
                                fontSize = 12.sp,
                                color = SlateDark
                            )
                        }

                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(6.dp)
                        ) {
                            Icon(
                                Icons.Default.Schedule,
                                contentDescription = null,
                                tint = FormTeal,
                                modifier = Modifier.size(16.dp)
                            )
                            Text(
                                text = if (loadedSlot != null) "${loadedSlot?.startTime} – ${loadedSlot?.endTime}" else "Selected Slot",
                                fontWeight = FontWeight.Bold,
                                fontSize = 12.sp,
                                color = FormTealDark
                            )
                        }
                    }
                }
            }

            // ── 2. SIGNED-IN ACCOUNT VERIFIED STRIP ───────────────────────────
            if (isUserLoggedIn) {
                Surface(
                    shape = RoundedCornerShape(14.dp),
                    color = Color(0xFFECFDF5),
                    border = BorderStroke(1.dp, Color(0xFFA7F3D0)),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Row(
                        modifier = Modifier.padding(horizontal = 14.dp, vertical = 10.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(10.dp)
                    ) {
                        Surface(
                            shape = CircleShape,
                            color = Color(0xFF059669),
                            modifier = Modifier.size(28.dp)
                        ) {
                            Box(contentAlignment = Alignment.Center) {
                                Icon(
                                    Icons.Default.VerifiedUser,
                                    contentDescription = null,
                                    tint = Color.White,
                                    modifier = Modifier.size(16.dp)
                                )
                            }
                        }
                        Column(modifier = Modifier.weight(1f)) {
                            Text(
                                text = "Booking as ${fullName.ifBlank { savedProfileName.ifBlank { savedName ?: "Verified Patient" } }}",
                                fontWeight = FontWeight.Bold,
                                fontSize = 12.sp,
                                color = Color(0xFF065F46)
                            )
                            Text(
                                text = "Your live token & medical history will sync automatically to your profile.",
                                fontSize = 11.sp,
                                color = Color(0xFF047857)
                            )
                        }
                    }
                }
            }

            // ── 3. CLINIC VISIT TYPE / MULTI-VISIT SELECTOR ───────────────────
            if (!isLabClinic && (isMultiVisitClinic || savedCodes.isNotEmpty())) {
                Card(
                    shape = RoundedCornerShape(18.dp),
                    colors = CardDefaults.cardColors(containerColor = Color.White),
                    border = BorderStroke(1.dp, CardBorderColor),
                    elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Column(
                        modifier = Modifier.padding(16.dp),
                        verticalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            Icon(
                                Icons.Default.Loop,
                                contentDescription = null,
                                tint = FormTeal,
                                modifier = Modifier.size(20.dp)
                            )
                            Column {
                                Text(
                                    "Visit Type (Multi-Visit Clinic)",
                                    fontWeight = FontWeight.Bold,
                                    fontSize = 14.sp,
                                    color = SlateDark
                                )
                                Text(
                                    "Choose New Consultation or Free Follow-Up with your 10-digit code",
                                    fontSize = 11.sp,
                                    color = SlateMuted
                                )
                            }
                        }

                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(10.dp)
                        ) {
                            // Option 1: New Visit
                            Surface(
                                shape = RoundedCornerShape(14.dp),
                                color = if (!isReturningPatient) FormTealLight.copy(alpha = 0.65f) else Color(0xFFF8FAFC),
                                border = BorderStroke(
                                    width = if (!isReturningPatient) 1.5.dp else 1.dp,
                                    color = if (!isReturningPatient) FormTeal else CardBorderColor
                                ),
                                modifier = Modifier
                                    .weight(1f)
                                    .clip(RoundedCornerShape(14.dp))
                                    .clickable {
                                        isReturningPatient = false
                                        selectedReturningCode = ""
                                        manualCodeInput = ""
                                        retainedAppointment = null
                                        errorMessage = null
                                    }
                            ) {
                                Column(
                                    modifier = Modifier.padding(12.dp),
                                    verticalArrangement = Arrangement.spacedBy(4.dp)
                                ) {
                                    Row(
                                        modifier = Modifier.fillMaxWidth(),
                                        horizontalArrangement = Arrangement.SpaceBetween,
                                        verticalAlignment = Alignment.CenterVertically
                                    ) {
                                        Icon(
                                            Icons.Default.PersonAddAlt1,
                                            contentDescription = null,
                                            tint = if (!isReturningPatient) FormTeal else SlateMuted,
                                            modifier = Modifier.size(18.dp)
                                        )
                                        Surface(
                                            shape = RoundedCornerShape(6.dp),
                                            color = if (!isReturningPatient) FormTeal else Color(0xFFE2E8F0)
                                        ) {
                                            Text(
                                                "Rs. ${consultationFee.toInt()}",
                                                fontSize = 10.sp,
                                                fontWeight = FontWeight.Bold,
                                                color = if (!isReturningPatient) Color.White else SlateDark,
                                                modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
                                            )
                                        }
                                    }
                                    Spacer(modifier = Modifier.height(2.dp))
                                    Text(
                                        "New Patient",
                                        fontWeight = FontWeight.Bold,
                                        fontSize = 13.sp,
                                        color = SlateDark
                                    )
                                    Text(
                                        "First consultation",
                                        fontSize = 11.sp,
                                        color = SlateMuted
                                    )
                                }
                            }

                            // Option 2: Follow-Up Visit
                            Surface(
                                shape = RoundedCornerShape(14.dp),
                                color = if (isReturningPatient) Color(0xFFECFDF5) else Color(0xFFF8FAFC),
                                border = BorderStroke(
                                    width = if (isReturningPatient) 1.5.dp else 1.dp,
                                    color = if (isReturningPatient) Color(0xFF059669) else CardBorderColor
                                ),
                                modifier = Modifier
                                    .weight(1f)
                                    .clip(RoundedCornerShape(14.dp))
                                    .clickable {
                                        isReturningPatient = true
                                        errorMessage = null
                                    }
                            ) {
                                Column(
                                    modifier = Modifier.padding(12.dp),
                                    verticalArrangement = Arrangement.spacedBy(4.dp)
                                ) {
                                    Row(
                                        modifier = Modifier.fillMaxWidth(),
                                        horizontalArrangement = Arrangement.SpaceBetween,
                                        verticalAlignment = Alignment.CenterVertically
                                    ) {
                                        Icon(
                                            Icons.Default.History,
                                            contentDescription = null,
                                            tint = if (isReturningPatient) Color(0xFF059669) else SlateMuted,
                                            modifier = Modifier.size(18.dp)
                                        )
                                        Surface(
                                            shape = RoundedCornerShape(6.dp),
                                            color = Color(0xFFD1FAE5)
                                        ) {
                                            Text(
                                                "FREE",
                                                fontSize = 10.sp,
                                                fontWeight = FontWeight.ExtraBold,
                                                color = Color(0xFF065F46),
                                                modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
                                            )
                                        }
                                    }
                                    Spacer(modifier = Modifier.height(2.dp))
                                    Text(
                                        "Follow-Up",
                                        fontWeight = FontWeight.Bold,
                                        fontSize = 13.sp,
                                        color = SlateDark
                                    )
                                    Text(
                                        "Use 10-digit ID",
                                        fontSize = 11.sp,
                                        color = SlateMuted
                                    )
                                }
                            }
                        }

                        // Returning patient 10-digit code selector
                        AnimatedVisibility(visible = isReturningPatient) {
                            Column(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(top = 4.dp),
                                verticalArrangement = Arrangement.spacedBy(10.dp)
                            ) {
                                if (savedCodes.isNotEmpty()) {
                                    Text(
                                        "Tap a saved 10-digit Appointment ID:",
                                        fontSize = 12.sp,
                                        fontWeight = FontWeight.SemiBold,
                                        color = SlateDark
                                    )
                                    savedCodes.forEach { (code, label) ->
                                        val isCodeSelected = selectedReturningCode == code
                                        Surface(
                                            shape = RoundedCornerShape(12.dp),
                                            color = if (isCodeSelected) Color(0xFFECFDF5) else Color(0xFFF8FAFC),
                                            border = BorderStroke(
                                                1.dp,
                                                if (isCodeSelected) Color(0xFF059669) else CardBorderColor
                                            ),
                                            modifier = Modifier
                                                .fillMaxWidth()
                                                .clip(RoundedCornerShape(12.dp))
                                                .clickable {
                                                    selectedReturningCode = code
                                                    manualCodeInput = code
                                                    if (errorMessage != null) errorMessage = null
                                                }
                                        ) {
                                            Row(
                                                modifier = Modifier.padding(horizontal = 12.dp, vertical = 10.dp),
                                                horizontalArrangement = Arrangement.SpaceBetween,
                                                verticalAlignment = Alignment.CenterVertically
                                            ) {
                                                Row(
                                                    verticalAlignment = Alignment.CenterVertically,
                                                    horizontalArrangement = Arrangement.spacedBy(10.dp)
                                                ) {
                                                    Icon(
                                                        Icons.Default.ConfirmationNumber,
                                                        contentDescription = null,
                                                        tint = if (isCodeSelected) Color(0xFF059669) else SlateMuted,
                                                        modifier = Modifier.size(18.dp)
                                                    )
                                                    Column {
                                                        Text(
                                                            code,
                                                            fontWeight = FontWeight.ExtraBold,
                                                            fontSize = 14.sp,
                                                            color = SlateDark
                                                        )
                                                        Text(
                                                            label,
                                                            fontSize = 11.sp,
                                                            color = SlateMuted
                                                        )
                                                    }
                                                }
                                                if (isCodeSelected) {
                                                    Icon(
                                                        Icons.Default.CheckCircle,
                                                        contentDescription = null,
                                                        tint = Color(0xFF059669),
                                                        modifier = Modifier.size(20.dp)
                                                    )
                                                }
                                            }
                                        }
                                    }
                                }

                                OutlinedTextField(
                                    value = manualCodeInput,
                                    onValueChange = {
                                        if (it.length <= 10 && it.all { char -> char.isDigit() }) {
                                            manualCodeInput = it
                                            selectedReturningCode = it
                                            if (errorMessage != null) errorMessage = null
                                        }
                                    },
                                    label = { Text("10-Digit Appointment ID *") },
                                    placeholder = { Text("Enter 10-digit code") },
                                    leadingIcon = {
                                        Icon(
                                            Icons.Default.Badge,
                                            contentDescription = null,
                                            tint = if (isFollowupCodeError) ErrorRed else FormTeal
                                        )
                                    },
                                    isError = isFollowupCodeError,
                                    supportingText = if (isFollowupCodeError) {
                                        { Text("Appointment ID must be exactly 10 digits (${manualCodeInput.length}/10).", color = ErrorRed, fontSize = 11.sp) }
                                    } else null,
                                    singleLine = true,
                                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .focusRequester(codeFocusRequester)
                                        .onGloballyPositioned { followupCardOffsetY = it.positionInParent().y.toInt() },
                                    shape = RoundedCornerShape(12.dp),
                                    colors = OutlinedTextFieldDefaults.colors(
                                        focusedBorderColor = FormTeal,
                                        unfocusedBorderColor = CardBorderColor,
                                        errorBorderColor = ErrorRed,
                                        errorLabelColor = ErrorRed
                                    )
                                )

                                // Retained patient confirmation from Appointment ID
                                val retained = retainedAppointment
                                if (isLookingUpCode) {
                                    Row(
                                        verticalAlignment = Alignment.CenterVertically,
                                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                                        modifier = Modifier.padding(vertical = 4.dp)
                                    ) {
                                        CircularProgressIndicator(
                                            modifier = Modifier.size(16.dp),
                                            strokeWidth = 2.dp,
                                            color = FormTeal
                                        )
                                        Text(
                                            "Looking up patient details from Appointment ID...",
                                            fontSize = 12.sp,
                                            color = SlateMuted
                                        )
                                    }
                                } else if (retained != null) {
                                    val isRetainedActiveAppt = isRetainedActive
                                    Surface(
                                        shape = RoundedCornerShape(12.dp),
                                        color = if (isRetainedActiveAppt) Color(0xFFEFF6FF) else Color(0xFFECFDF5),
                                        border = BorderStroke(1.dp, if (isRetainedActiveAppt) Color(0xFF93C5FD) else Color(0xFFA7F3D0)),
                                        modifier = Modifier.fillMaxWidth()
                                    ) {
                                        Row(
                                            modifier = Modifier.padding(12.dp),
                                            verticalAlignment = Alignment.Top,
                                            horizontalArrangement = Arrangement.spacedBy(10.dp)
                                        ) {
                                            Icon(
                                                if (isRetainedActiveAppt) Icons.Default.Update else Icons.Default.CheckCircle,
                                                contentDescription = null,
                                                tint = if (isRetainedActiveAppt) Color(0xFF1D4ED8) else Color(0xFF059669),
                                                modifier = Modifier.size(20.dp).padding(top = 2.dp)
                                            )
                                            Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                                                Text(
                                                    text = if (isRetainedActiveAppt) "Active Appointment Found • Rescheduling" else "Completed Visit Found • Free Follow-Up",
                                                    fontWeight = FontWeight.Bold,
                                                    fontSize = 12.5.sp,
                                                    color = if (isRetainedActiveAppt) Color(0xFF1E3A8A) else Color(0xFF065F46)
                                                )
                                                Text(
                                                    text = "Patient: ${retained.patientName} (${retained.patientAge} yrs • ${retained.patientGender} • ${retained.patientMobile})",
                                                    fontWeight = FontWeight.SemiBold,
                                                    fontSize = 12.sp,
                                                    color = SlateDark
                                                )
                                                Text(
                                                    text = if (isRetainedActiveAppt) {
                                                        "Currently scheduled: ${retained.appointmentDate} at ${retained.appointmentTime}. Confirming below will shift this visit to your newly selected slot."
                                                    } else {
                                                        "Eligible for free follow-up consultation. Completed visit medical history is safely preserved in records."
                                                    },
                                                    fontSize = 11.sp,
                                                    color = if (isRetainedActiveAppt) Color(0xFF2563EB) else Color(0xFF047857)
                                                )
                                            }
                                        }
                                    }
                                }

                                AnimatedVisibility(visible = errorMessage != null) {
                                    Surface(
                                        color = Color(0xFFFEF2F2),
                                        border = BorderStroke(1.dp, Color(0xFFFECACA)),
                                        shape = RoundedCornerShape(12.dp),
                                        modifier = Modifier.fillMaxWidth()
                                    ) {
                                        Row(
                                            modifier = Modifier.padding(12.dp),
                                            verticalAlignment = Alignment.CenterVertically,
                                            horizontalArrangement = Arrangement.spacedBy(8.dp)
                                        ) {
                                            Icon(
                                                Icons.Default.ErrorOutline,
                                                contentDescription = null,
                                                tint = Color(0xFFDC2626),
                                                modifier = Modifier.size(18.dp)
                                            )
                                            Text(
                                                text = errorMessage ?: "",
                                                color = Color(0xFF991B1B),
                                                fontSize = 12.sp,
                                                fontWeight = FontWeight.Medium
                                            )
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }

            // ── SINGLE-VISIT CLINIC INFO BANNER ───────────────────────────────
            if (effectiveClinicType == "single_visit") {
                Surface(
                    shape = RoundedCornerShape(14.dp),
                    color = Color(0xFFFFFBEB),
                    border = BorderStroke(1.dp, Color(0xFFFDE68A)),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Row(
                        modifier = Modifier.padding(14.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(10.dp)
                    ) {
                        Icon(
                            Icons.Default.Info,
                            contentDescription = null,
                            tint = Color(0xFFD97706),
                            modifier = Modifier.size(20.dp)
                        )
                        Column(modifier = Modifier.weight(1f)) {
                            Text(
                                "Single-Visit Consultation Clinic",
                                fontWeight = FontWeight.Bold,
                                fontSize = 12.sp,
                                color = Color(0xFF92400E)
                            )
                            Text(
                                "Each booking generates a single-use OPD token. Follow-up re-bookings on the same ID are not applicable.",
                                fontSize = 11.sp,
                                color = Color(0xFF78350F)
                            )
                        }
                    }
                }
            }

            // ── DIAGNOSTIC LAB INFO BANNER ────────────────────────────────────
            if (effectiveClinicType == "diagnostic_lab") {
                Surface(
                    shape = RoundedCornerShape(14.dp),
                    color = Color(0xFFF0F9FF),
                    border = BorderStroke(1.dp, Color(0xFFBAE6FD)),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Row(
                        modifier = Modifier.padding(14.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(10.dp)
                    ) {
                        Icon(
                            Icons.Default.Science,
                            contentDescription = null,
                            tint = Color(0xFF0284C7),
                            modifier = Modifier.size(20.dp)
                        )
                        Column(modifier = Modifier.weight(1f)) {
                            Text(
                                "Diagnostic Lab Booking",
                                fontWeight = FontWeight.Bold,
                                fontSize = 12.sp,
                                color = Color(0xFF075985)
                            )
                            Text(
                                "Once your sample is processed, your digital lab report will be delivered straight to your app.",
                                fontSize = 11.sp,
                                color = Color(0xFF0369A1)
                            )
                        }
                    }
                }
            }

            // ── DIAGNOSTIC LAB TEST SELECTION CARD ────────────────────────────
            if (isLabClinic) {
                Card(
                    shape = RoundedCornerShape(18.dp),
                    colors = CardDefaults.cardColors(containerColor = Color.White),
                    border = BorderStroke(
                        width = if (isLabTestsError) 1.5.dp else 1.dp,
                        color = if (isLabTestsError) ErrorRed else CardBorderColor
                    ),
                    elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
                    modifier = Modifier
                        .fillMaxWidth()
                        .onGloballyPositioned { labCardOffsetY = it.positionInParent().y.toInt() }
                ) {
                    Column(
                        modifier = Modifier.padding(16.dp),
                        verticalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(10.dp)
                        ) {
                            Surface(
                                shape = RoundedCornerShape(10.dp),
                                color = if (isLabTestsError) Color(0xFFFEE2E2) else Color(0xFFE0F2FE),
                                modifier = Modifier.size(38.dp)
                            ) {
                                Box(contentAlignment = Alignment.Center) {
                                    Icon(
                                        Icons.Default.Science,
                                        contentDescription = null,
                                        tint = if (isLabTestsError) ErrorRed else Color(0xFF0284C7),
                                        modifier = Modifier.size(20.dp)
                                    )
                                }
                            }
                            Column {
                                Text(
                                    "Select Lab Diagnostic Tests *",
                                    fontWeight = FontWeight.ExtraBold,
                                    fontSize = 15.sp,
                                    color = if (isLabTestsError) ErrorRed else SlateDark
                                )
                                Text(
                                    if (isLabTestsError) "Required: Select at least 1 test to continue"
                                    else "Choose single or multiple lab tests. Charges update dynamically.",
                                    fontSize = 11.sp,
                                    color = if (isLabTestsError) ErrorRed else SlateMuted,
                                    fontWeight = if (isLabTestsError) FontWeight.SemiBold else FontWeight.Normal
                                )
                            }
                        }

                        HorizontalDivider(color = Color(0xFFF1F5F9))

                        if (availableLabTests.isEmpty()) {
                            Text(
                                "No tests configured by this lab clinic yet.",
                                fontSize = 12.sp,
                                color = SlateMuted,
                                modifier = Modifier.padding(vertical = 8.dp)
                            )
                        } else {
                            availableLabTests.forEach { test ->
                                val isSelected = selectedLabTests.contains(test)
                                Surface(
                                    shape = RoundedCornerShape(14.dp),
                                    color = if (isSelected) Color(0xFFF0FDF4) else Color(0xFFF8FAFC),
                                    border = BorderStroke(
                                        width = if (isSelected) 1.5.dp else 1.dp,
                                        color = if (isSelected) Color(0xFF10B981) else CardBorderColor
                                    ),
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .clip(RoundedCornerShape(14.dp))
                                        .clickable {
                                            val updated = if (isSelected) {
                                                selectedLabTests - test
                                            } else {
                                                selectedLabTests + test
                                            }
                                            selectedLabTests = updated
                                            consultationFee = updated.sumOf { it.price }
                                        }
                                ) {
                                    Row(
                                        modifier = Modifier
                                            .fillMaxWidth()
                                            .padding(14.dp),
                                        verticalAlignment = Alignment.CenterVertically,
                                        horizontalArrangement = Arrangement.SpaceBetween
                                    ) {
                                        Row(
                                            modifier = Modifier.weight(1f),
                                            verticalAlignment = Alignment.CenterVertically,
                                            horizontalArrangement = Arrangement.spacedBy(12.dp)
                                        ) {
                                            Surface(
                                                shape = RoundedCornerShape(6.dp),
                                                color = if (isSelected) Color(0xFF10B981) else Color.White,
                                                border = BorderStroke(
                                                    1.5.dp,
                                                    if (isSelected) Color(0xFF10B981) else Color(0xFFCBD5E1)
                                                ),
                                                modifier = Modifier.size(22.dp)
                                            ) {
                                                Box(contentAlignment = Alignment.Center) {
                                                    if (isSelected) {
                                                        Icon(
                                                            Icons.Default.Check,
                                                            contentDescription = null,
                                                            tint = Color.White,
                                                            modifier = Modifier.size(14.dp)
                                                        )
                                                    }
                                                }
                                            }
                                            val isFastingRequired = test.serviceName.contains("fasting", ignoreCase = true) ||
                                                test.serviceName.contains("glucose", ignoreCase = true) ||
                                                test.serviceName.contains("sugar", ignoreCase = true) ||
                                                test.serviceName.contains("lipid", ignoreCase = true) ||
                                                test.serviceName.contains("cholesterol", ignoreCase = true) ||
                                                test.description?.contains("fasting", ignoreCase = true) == true

                                            Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                                                Row(
                                                    verticalAlignment = Alignment.CenterVertically,
                                                    horizontalArrangement = Arrangement.spacedBy(6.dp)
                                                ) {
                                                    Text(
                                                        text = test.serviceName,
                                                        fontWeight = FontWeight.Bold,
                                                        fontSize = 13.sp,
                                                        color = SlateDark
                                                    )
                                                    if (isFastingRequired) {
                                                        Surface(
                                                            shape = RoundedCornerShape(4.dp),
                                                            color = Color(0xFFFEF3C7),
                                                            border = BorderStroke(1.dp, Color(0xFFFDE68A))
                                                        ) {
                                                            Text(
                                                                text = "Fasting (8-12h)",
                                                                fontSize = 9.5.sp,
                                                                fontWeight = FontWeight.Bold,
                                                                color = Color(0xFF92400E),
                                                                modifier = Modifier.padding(horizontal = 4.dp, vertical = 1.dp)
                                                            )
                                                        }
                                                    }
                                                }
                                                if (!test.description.isNullOrBlank()) {
                                                    Text(
                                                        text = test.description,
                                                        fontSize = 11.sp,
                                                        color = SlateMuted
                                                    )
                                                }
                                            }
                                        }

                                        Surface(
                                            shape = RoundedCornerShape(8.dp),
                                            color = if (isSelected) Color(0xFFDCFCE7) else Color(0xFFE2E8F0)
                                        ) {
                                            Text(
                                                text = "Rs. ${test.price.toInt()}",
                                                fontWeight = FontWeight.ExtraBold,
                                                fontSize = 12.sp,
                                                color = if (isSelected) Color(0xFF15803D) else SlateDark,
                                                modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
                                            )
                                        }
                                    }
                                }
                            }

                            val hasFastingInSelected = selectedLabTests.any { t ->
                                t.serviceName.contains("fasting", ignoreCase = true) ||
                                t.serviceName.contains("glucose", ignoreCase = true) ||
                                t.serviceName.contains("sugar", ignoreCase = true) ||
                                t.serviceName.contains("lipid", ignoreCase = true) ||
                                t.serviceName.contains("cholesterol", ignoreCase = true) ||
                                t.description?.contains("fasting", ignoreCase = true) == true
                            }
                            if (hasFastingInSelected) {
                                Surface(
                                    shape = RoundedCornerShape(12.dp),
                                    color = Color(0xFFFEF3C7),
                                    border = BorderStroke(1.dp, Color(0xFFFDE68A)),
                                    modifier = Modifier.fillMaxWidth()
                                ) {
                                    Row(
                                        modifier = Modifier.padding(12.dp),
                                        verticalAlignment = Alignment.CenterVertically,
                                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                                    ) {
                                        Icon(Icons.Default.Info, contentDescription = null, tint = Color(0xFFD97706), modifier = Modifier.size(20.dp))
                                        Column {
                                            Text("Preparation Notice: Fasting Required", fontWeight = FontWeight.Bold, fontSize = 12.sp, color = Color(0xFF92400E))
                                            Text("Selected test(s) require 8 to 12 hours of overnight fasting (water permitted). Please attend your collection slot without eating breakfast.", fontSize = 11.sp, color = Color(0xFF78350F))
                                        }
                                    }
                                }
                            }

                            Surface(
                                shape = RoundedCornerShape(10.dp),
                                color = Color(0xFFEFF6FF),
                                modifier = Modifier.fillMaxWidth()
                            ) {
                                Row(
                                    modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp),
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.SpaceBetween
                                ) {
                                    Text(
                                        text = "${selectedLabTests.size} test(s) selected",
                                        fontWeight = FontWeight.SemiBold,
                                        fontSize = 12.sp,
                                        color = Color(0xFF1D4ED8)
                                    )
                                    Text(
                                        text = "Total: Rs. ${consultationFee.toInt()}",
                                        fontWeight = FontWeight.Bold,
                                        fontSize = 12.sp,
                                        color = Color(0xFF1D4ED8)
                                    )
                                }
                            }
                        }
                    }
                }
            }

            // ── 4. PATIENT DEMOGRAPHICS FORM CARD (HIDDEN DURING FOLLOW-UP) ───
            if (!isReturningPatient) {
                Card(
                    shape = RoundedCornerShape(18.dp),
                    colors = CardDefaults.cardColors(containerColor = Color.White),
                    border = BorderStroke(1.dp, CardBorderColor),
                    elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
                    modifier = Modifier
                        .fillMaxWidth()
                        .onGloballyPositioned { patientCardOffsetY = it.positionInParent().y.toInt() }
                ) {
                    Column(
                        modifier = Modifier.padding(18.dp),
                        verticalArrangement = Arrangement.spacedBy(14.dp)
                    ) {
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
                                Surface(
                                    shape = RoundedCornerShape(10.dp),
                                    color = FormTealLight,
                                    modifier = Modifier.size(38.dp)
                                ) {
                                    Box(contentAlignment = Alignment.Center) {
                                        Icon(
                                            Icons.Default.AssignmentInd,
                                            contentDescription = null,
                                            tint = FormTeal,
                                            modifier = Modifier.size(20.dp)
                                        )
                                    }
                                }
                                Column {
                                    Text(
                                        "Patient Details",
                                        fontWeight = FontWeight.ExtraBold,
                                        fontSize = 15.sp,
                                        color = SlateDark
                                    )
                                    Text(
                                        "Used for your OPD queue token & prescription slip",
                                        fontSize = 11.sp,
                                        color = SlateMuted
                                    )
                                }
                            }

                            // Quick Fill Button in header
                            OutlinedButton(
                                onClick = { fillFromSavedProfile() },
                                shape = RoundedCornerShape(10.dp),
                                border = BorderStroke(1.2.dp, FormTeal),
                                colors = ButtonDefaults.outlinedButtonColors(
                                    containerColor = FormTealLight.copy(alpha = 0.5f),
                                    contentColor = FormTealDark
                                ),
                                contentPadding = PaddingValues(horizontal = 10.dp, vertical = 6.dp),
                                modifier = Modifier.height(34.dp)
                            ) {
                                Icon(
                                    Icons.Default.Person,
                                    contentDescription = null,
                                    tint = FormTeal,
                                    modifier = Modifier.size(15.dp)
                                )
                                Spacer(modifier = Modifier.width(4.dp))
                                Text(
                                    "Use Profile",
                                    fontSize = 11.5.sp,
                                    fontWeight = FontWeight.Bold,
                                    color = FormTealDark
                                )
                            }
                        }

                        HorizontalDivider(color = Color(0xFFF1F5F9))

                        // ── "USE SAVED PROFILE" QUICK-ACTION CARD ─────────────
                        Surface(
                            shape = RoundedCornerShape(14.dp),
                            color = Color(0xFFF0FDF4),
                            border = BorderStroke(1.2.dp, Color(0xFF86EFAC)),
                            modifier = Modifier
                                .fillMaxWidth()
                                .clip(RoundedCornerShape(14.dp))
                                .clickable { fillFromSavedProfile() }
                        ) {
                            Row(
                                modifier = Modifier.padding(horizontal = 14.dp, vertical = 11.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.SpaceBetween
                            ) {
                                Row(
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                                    modifier = Modifier.weight(1f)
                                ) {
                                    Surface(
                                        shape = CircleShape,
                                        color = Color(0xFF16A34A),
                                        modifier = Modifier.size(34.dp)
                                    ) {
                                        Box(contentAlignment = Alignment.Center) {
                                            Icon(
                                                Icons.Default.AccountCircle,
                                                contentDescription = null,
                                                tint = Color.White,
                                                modifier = Modifier.size(22.dp)
                                            )
                                        }
                                    }
                                    Column {
                                        Text(
                                            text = "Use Saved Profile",
                                            fontWeight = FontWeight.Bold,
                                            fontSize = 13.5.sp,
                                            color = Color(0xFF14532D)
                                        )
                                        val profileSummary = if (savedProfileName.isNotBlank()) {
                                            "Auto-fill details for $savedProfileName" + if (savedProfilePhone.isNotBlank()) " ($savedProfilePhone)" else ""
                                        } else {
                                            "Click to auto-fill details associated with this account"
                                        }
                                        Text(
                                            text = profileSummary,
                                            fontSize = 11.sp,
                                            color = Color(0xFF166534),
                                            maxLines = 1,
                                            overflow = TextOverflow.Ellipsis
                                        )
                                    }
                                }

                                Surface(
                                    shape = RoundedCornerShape(8.dp),
                                    color = Color(0xFF16A34A)
                                ) {
                                    Row(
                                        modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp),
                                        verticalAlignment = Alignment.CenterVertically,
                                        horizontalArrangement = Arrangement.spacedBy(4.dp)
                                    ) {
                                        Icon(
                                            Icons.Default.Check,
                                            contentDescription = null,
                                            tint = Color.White,
                                            modifier = Modifier.size(13.dp)
                                        )
                                        Text(
                                            text = "Auto-Fill",
                                            fontWeight = FontWeight.Bold,
                                            fontSize = 11.5.sp,
                                            color = Color.White
                                        )
                                    }
                                }
                            }
                        }

                        AnimatedVisibility(visible = errorMessage != null) {
                            Surface(
                                color = Color(0xFFFEF2F2),
                                border = BorderStroke(1.dp, Color(0xFFFECACA)),
                                shape = RoundedCornerShape(12.dp),
                                modifier = Modifier.fillMaxWidth()
                            ) {
                                Row(
                                    modifier = Modifier.padding(12.dp),
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                                ) {
                                    Icon(
                                        Icons.Default.ErrorOutline,
                                        contentDescription = null,
                                        tint = Color(0xFFDC2626),
                                        modifier = Modifier.size(18.dp)
                                    )
                                    Text(
                                        text = errorMessage ?: "",
                                        color = Color(0xFF991B1B),
                                        fontSize = 12.sp,
                                        fontWeight = FontWeight.Medium
                                    )
                                }
                            }
                        }

                        // Full Name
                        OutlinedTextField(
                            value = fullName,
                            onValueChange = {
                                fullName = it
                                if (errorMessage != null) errorMessage = null
                            },
                            label = { Text("Patient Full Name *") },
                            placeholder = { Text("Enter patient's full name") },
                            leadingIcon = {
                                Icon(
                                    Icons.Default.Person,
                                    contentDescription = null,
                                    tint = if (isNameError) ErrorRed else FormTeal
                                )
                            },
                            isError = isNameError,
                            supportingText = if (isNameError) {
                                { Text("Required: Enter full name (at least 2 letters).", color = ErrorRed, fontSize = 11.sp) }
                            } else null,
                            singleLine = true,
                            modifier = Modifier
                                .fillMaxWidth()
                                .focusRequester(nameFocusRequester)
                                .onGloballyPositioned { nameFieldOffsetY = it.positionInParent().y.toInt() },
                            shape = RoundedCornerShape(12.dp),
                            colors = OutlinedTextFieldDefaults.colors(
                                focusedBorderColor = FormTeal,
                                unfocusedBorderColor = CardBorderColor,
                                errorBorderColor = ErrorRed,
                                errorLabelColor = ErrorRed
                            )
                        )

                        // Mobile Number
                        OutlinedTextField(
                            value = mobile,
                            onValueChange = { input ->
                                val filtered = input.filter { it.isDigit() }.take(10)
                                mobile = filtered
                                if (errorMessage != null) errorMessage = null
                            },
                            label = { Text("Mobile Number (+977) *") },
                            placeholder = { Text("10-digit mobile number (98XXXXXXXX)") },
                            leadingIcon = {
                                Icon(
                                    Icons.Default.Phone,
                                    contentDescription = null,
                                    tint = if (isMobileError) ErrorRed else FormTeal
                                )
                            },
                            isError = isMobileError,
                            supportingText = if (isMobileError) {
                                { Text("Required: Must be a 10-digit number starting with 9 (${cleanMobileDigits.length}/10).", color = ErrorRed, fontSize = 11.sp) }
                            } else null,
                            singleLine = true,
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone),
                            modifier = Modifier
                                .fillMaxWidth()
                                .focusRequester(mobileFocusRequester)
                                .onGloballyPositioned { mobileFieldOffsetY = it.positionInParent().y.toInt() },
                            shape = RoundedCornerShape(12.dp),
                            colors = OutlinedTextFieldDefaults.colors(
                                focusedBorderColor = FormTeal,
                                unfocusedBorderColor = CardBorderColor,
                                errorBorderColor = ErrorRed,
                                errorLabelColor = ErrorRed
                            )
                        )

                        // Age + Gender Row
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .onGloballyPositioned { ageFieldOffsetY = it.positionInParent().y.toInt() },
                            horizontalArrangement = Arrangement.spacedBy(12.dp),
                            verticalAlignment = Alignment.Top
                        ) {
                            OutlinedTextField(
                                value = age,
                                onValueChange = {
                                    if (it.length <= 3 && it.all { ch -> ch.isDigit() }) {
                                        age = it
                                        if (errorMessage != null) errorMessage = null
                                    }
                                },
                                label = { Text("Age (Yrs) *") },
                                placeholder = { Text("1-120") },
                                leadingIcon = {
                                    Icon(
                                        Icons.Default.Cake,
                                        contentDescription = null,
                                        tint = if (isAgeError) ErrorRed else FormTeal,
                                        modifier = Modifier.size(18.dp)
                                    )
                                },
                                isError = isAgeError,
                                supportingText = if (isAgeError) {
                                    { Text("Enter valid age (1–120)", color = ErrorRed, fontSize = 10.sp) }
                                } else null,
                                singleLine = true,
                                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                                modifier = Modifier
                                    .weight(0.95f)
                                    .focusRequester(ageFocusRequester),
                                shape = RoundedCornerShape(12.dp),
                                colors = OutlinedTextFieldDefaults.colors(
                                    focusedBorderColor = FormTeal,
                                    unfocusedBorderColor = CardBorderColor,
                                    errorBorderColor = ErrorRed,
                                    errorLabelColor = ErrorRed
                                )
                            )

                            Column(
                                modifier = Modifier.weight(1.45f),
                                verticalArrangement = Arrangement.spacedBy(6.dp)
                            ) {
                                Text(
                                    text = if (isGenderError) "Gender * (Required)" else "Gender *",
                                    fontSize = 11.sp,
                                    fontWeight = FontWeight.SemiBold,
                                    color = if (isGenderError) ErrorRed else SlateMuted
                                )
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.spacedBy(6.dp)
                                ) {
                                    listOf("Male", "Female", "Other").forEach { g ->
                                        val isSelected = selectedGender == g
                                        Surface(
                                            shape = RoundedCornerShape(10.dp),
                                            color = if (isSelected) FormTeal else if (isGenderError) Color(0xFFFEF2F2) else Color(0xFFF8FAFC),
                                            border = BorderStroke(
                                                1.dp,
                                                if (isSelected) FormTeal else if (isGenderError) ErrorRed else CardBorderColor
                                            ),
                                            modifier = Modifier
                                                .weight(1f)
                                                .height(48.dp)
                                                .clip(RoundedCornerShape(10.dp))
                                                .clickable {
                                                    selectedGender = g
                                                    if (errorMessage != null) errorMessage = null
                                                }
                                        ) {
                                            Box(contentAlignment = Alignment.Center) {
                                                Text(
                                                    text = g,
                                                    fontSize = 12.sp,
                                                    fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Medium,
                                                    color = if (isSelected) Color.White else if (isGenderError) ErrorRed else SlateDark
                                                )
                                            }
                                        }
                                    }
                                }
                            }
                        }

                        // Optional Email
                        OutlinedTextField(
                            value = email,
                            onValueChange = {
                                email = it
                                if (errorMessage != null) errorMessage = null
                            },
                            label = { Text("Email Address (Optional)") },
                            placeholder = { Text("Enter email address") },
                            leadingIcon = {
                                Icon(
                                    Icons.Default.Email,
                                    contentDescription = null,
                                    tint = if (isEmailError) ErrorRed else FormTeal
                                )
                            },
                            isError = isEmailError,
                            supportingText = if (isEmailError) {
                                { Text("Enter a valid email address or leave blank.", color = ErrorRed, fontSize = 11.sp) }
                            } else null,
                            singleLine = true,
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email),
                            modifier = Modifier
                                .fillMaxWidth()
                                .focusRequester(emailFocusRequester)
                                .onGloballyPositioned { emailFieldOffsetY = it.positionInParent().y.toInt() },
                            shape = RoundedCornerShape(12.dp),
                            colors = OutlinedTextFieldDefaults.colors(
                                focusedBorderColor = FormTeal,
                                unfocusedBorderColor = CardBorderColor,
                                errorBorderColor = ErrorRed,
                                errorLabelColor = ErrorRed
                            )
                        )

                        // Optional Symptoms / Notes
                        OutlinedTextField(
                            value = visitNotes,
                            onValueChange = { visitNotes = it },
                            label = { Text("Symptoms or Reason for Visit (Optional)") },
                            placeholder = { Text("Briefly describe symptoms or questions for the doctor...") },
                            leadingIcon = {
                                Icon(Icons.Default.MedicalInformation, contentDescription = null, tint = FormTeal)
                            },
                            maxLines = 3,
                            modifier = Modifier.fillMaxWidth(),
                            shape = RoundedCornerShape(12.dp),
                            colors = OutlinedTextFieldDefaults.colors(
                                focusedBorderColor = FormTeal,
                                unfocusedBorderColor = CardBorderColor
                            )
                        )
                    }
                }
            }

            Spacer(modifier = Modifier.height(12.dp))
        }
    }

    if (showPendingPayAtDeskDialog && pendingPayAtDeskAppointment != null) {
        val pending = pendingPayAtDeskAppointment!!
        AlertDialog(
            onDismissRequest = {
                if (!isCancellingPendingPayAtDesk) {
                    showPendingPayAtDeskDialog = false
                }
            },
            icon = {
                Surface(
                    shape = CircleShape,
                    color = Color(0xFFFEF3C7),
                    modifier = Modifier.size(54.dp)
                ) {
                    Box(contentAlignment = Alignment.Center) {
                        Icon(
                            imageVector = Icons.Default.HourglassTop,
                            contentDescription = null,
                            tint = Color(0xFFD97706),
                            modifier = Modifier.size(28.dp)
                        )
                    }
                }
            },
            title = {
                Text(
                    text = "Unapproved Pay at Desk Request",
                    fontWeight = FontWeight.Bold,
                    fontSize = 17.sp,
                    textAlign = TextAlign.Center
                )
            },
            text = {
                Column(
                    modifier = Modifier.fillMaxWidth(),
                    verticalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    Text(
                        text = "You already submitted a Pay at Desk request for this patient that is waiting for clinic counter approval.",
                        fontSize = 13.sp,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )

                    Surface(
                        shape = RoundedCornerShape(12.dp),
                        color = Color(0xFFF8FAFC),
                        border = BorderStroke(1.dp, Color(0xFFE2E8F0)),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Column(
                            modifier = Modifier.padding(12.dp),
                            verticalArrangement = Arrangement.spacedBy(4.dp)
                        ) {
                            Text(
                                text = "Patient: ${pending.patientName}",
                                fontWeight = FontWeight.SemiBold,
                                fontSize = 13.sp,
                                color = SlateDark
                            )
                            Text(
                                text = "Date: ${pending.appointmentDate} (${pending.appointmentTime})",
                                fontSize = 12.sp,
                                color = SlateMuted
                            )
                            Text(
                                text = "Tracking Code: ${pending.trackingCode10Digit}",
                                fontWeight = FontWeight.Bold,
                                fontSize = 12.sp,
                                color = FormTeal
                            )
                            Text(
                                text = "Status: Waiting for Counter Approval",
                                fontWeight = FontWeight.Medium,
                                fontSize = 12.sp,
                                color = Color(0xFFD97706)
                            )
                        }
                    }

                    Surface(
                        shape = RoundedCornerShape(8.dp),
                        color = Color(0xFFEFF6FF),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Text(
                            text = "Pay at Desk does not hold your slot until approved by clinic counter staff. To book fresh or pay online (eSewa) to secure your spot, you can cancel this pending request.",
                            fontSize = 11.sp,
                            color = Color(0xFF1E40AF),
                            modifier = Modifier.padding(8.dp)
                        )
                    }
                }
            },
            confirmButton = {
                Column(
                    modifier = Modifier.fillMaxWidth(),
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    Button(
                        onClick = {
                            if (isCancellingPendingPayAtDesk) return@Button
                            isCancellingPendingPayAtDesk = true
                            coroutineScope.launch {
                                try {
                                    val success = appointmentRepository?.cancelPendingPayAtDeskAppointment(pending.id) ?: false
                                    if (success) {
                                        Toast.makeText(context, "Previous request #${pending.trackingCode10Digit} cancelled", Toast.LENGTH_SHORT).show()
                                        showPendingPayAtDeskDialog = false
                                        pendingPayAtDeskAppointment = null
                                        executeCreateBooking(forceProceed = true)
                                    } else {
                                        Toast.makeText(context, "Failed to cancel previous request. Please try again.", Toast.LENGTH_SHORT).show()
                                    }
                                } catch (e: Exception) {
                                    Toast.makeText(context, "Error: ${e.message}", Toast.LENGTH_SHORT).show()
                                } finally {
                                    isCancellingPendingPayAtDesk = false
                                }
                            }
                        },
                        colors = ButtonDefaults.buttonColors(
                            containerColor = Color(0xFFDC2626),
                            contentColor = Color.White
                        ),
                        shape = RoundedCornerShape(10.dp),
                        modifier = Modifier.fillMaxWidth().height(44.dp),
                        enabled = !isCancellingPendingPayAtDesk
                    ) {
                        if (isCancellingPendingPayAtDesk) {
                            CircularProgressIndicator(modifier = Modifier.size(16.dp), color = Color.White, strokeWidth = 2.dp)
                        } else {
                            Text("Cancel Request & Continue", fontWeight = FontWeight.Bold, fontSize = 13.sp)
                        }
                    }

                    OutlinedButton(
                        onClick = {
                            showPendingPayAtDeskDialog = false
                            navController.navigate(NavRoutes.QueueStatus.createRoute(pending.trackingCode10Digit))
                        },
                        shape = RoundedCornerShape(10.dp),
                        border = BorderStroke(1.2.dp, FormTeal),
                        colors = ButtonDefaults.outlinedButtonColors(contentColor = FormTeal),
                        modifier = Modifier.fillMaxWidth().height(42.dp),
                        enabled = !isCancellingPendingPayAtDesk
                    ) {
                        Text("Track Current Request", fontWeight = FontWeight.SemiBold, fontSize = 13.sp)
                    }

                    TextButton(
                        onClick = { showPendingPayAtDeskDialog = false },
                        modifier = Modifier.fillMaxWidth().height(38.dp),
                        enabled = !isCancellingPendingPayAtDesk
                    ) {
                        Text("Keep Request & Close", fontSize = 12.5.sp, color = SlateMuted)
                    }
                }
            },
            dismissButton = null
        )
    }
}
