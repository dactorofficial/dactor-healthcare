package com.dactor.clinic.ui.dashboard

import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ExitToApp
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
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.navigation.NavController
import coil.compose.AsyncImage
import com.dactor.clinic.data.model.Appointment
import com.dactor.clinic.data.model.Clinic
import com.dactor.clinic.data.model.ClinicInvitation
import com.dactor.clinic.data.model.Doctor
import com.dactor.clinic.data.repository.AppointmentRepository
import com.dactor.clinic.data.repository.ClinicRepository
import com.dactor.clinic.data.repository.DoctorRepository
import com.dactor.clinic.data.repository.InvitationRepository
import com.dactor.clinic.data.repository.QueueRepository
import com.dactor.clinic.ui.navigation.NavRoutes
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import java.time.LocalDate

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DoctorDashboardScreen(
    navController: NavController,
    doctorId: String? = null,
    doctorRepository: DoctorRepository? = null,
    queueRepository: QueueRepository? = null,
    appointmentRepository: AppointmentRepository? = null,
    invitationRepository: InvitationRepository? = null,
    clinicRepository: ClinicRepository? = null
) {
    val context = LocalContext.current
    val sessionManager = remember { com.dactor.clinic.data.local.UserSessionManager(context) }
    val effectiveDocId = remember(doctorId) { if (!doctorId.isNullOrBlank()) doctorId else sessionManager.getSavedDoctorId().orEmpty() }
    var doctor by remember(effectiveDocId) {
        mutableStateOf<Doctor?>(
            if (effectiveDocId.isNotBlank()) doctorRepository?.getCachedDoctorById(effectiveDocId) ?: doctorRepository?.getLastCachedDoctor() else null
        )
    }
    var clinic by remember { mutableStateOf<Clinic?>(null) }
    var affiliatedClinics by remember { mutableStateOf<List<Clinic>>(emptyList()) }
    var doctorIsInClinic by remember { mutableStateOf(true) }
    var appointmentsQueue by remember { mutableStateOf<List<Appointment>>(emptyList()) }
    var pendingInvitations by remember { mutableStateOf<List<ClinicInvitation>>(emptyList()) }
    var invitingClinics by remember { mutableStateOf<Map<String, Clinic>>(emptyMap()) }
    var isLoading by remember { mutableStateOf(true) }
    var activeConsultationSeconds by remember { mutableIntStateOf(0) }

    // ── Mandatory Non-Skippable Terms & Regulatory Policy Gate ──────────
    var showMandatoryTermsDialog by remember {
        mutableStateOf(!sessionManager.hasAcceptedTerms())
    }

    if (showMandatoryTermsDialog) {
        com.dactor.clinic.ui.legal.ClinicTermsAndConditionsDialog(
            isMandatory = true,
            onAccept = {
                sessionManager.setTermsAccepted(true)
                showMandatoryTermsDialog = false
            },
            onDismiss = {
                if (sessionManager.hasAcceptedTerms()) {
                    showMandatoryTermsDialog = false
                }
            }
        )
    }

    // Settings & Profile Dialog state
    var showSettingsDialog by remember { mutableStateOf(false) }
    var showSignOutConfirmDialog by remember { mutableStateOf(false) }
    var editPractitionerRole by remember { mutableStateOf("doctor") }
    var editSpecialtyDropdownExpanded by remember { mutableStateOf(false) }
    var editEducationDropdownExpanded by remember { mutableStateOf(false) }
    var editStartingYearDropdownExpanded by remember { mutableStateOf(false) }
    val practicingYears = remember { (2026 downTo 1960).map { it.toString() } }
    var editName by remember { mutableStateOf("") }
    var editGender by remember { mutableStateOf("") }
    var editAge by remember { mutableStateOf("") }
    var editStartingYear by remember { mutableStateOf("") }
    var editPictureUri by remember { mutableStateOf<Uri?>(null) }
    var editPictureName by remember { mutableStateOf<String?>(null) }
    var editSpecialty by remember { mutableStateOf("") }
    var editEducation by remember { mutableStateOf("") }
    var editNmc by remember { mutableStateOf("") }
    var editPersonalPhone by remember { mutableStateOf("") }
    var editPublicPhone by remember { mutableStateOf("") }
    var editDescription by remember { mutableStateOf("") }
    var isSavingProfile by remember { mutableStateOf(false) }
    var profileMessage by remember { mutableStateOf<String?>(null) }
    var masterSpecialtiesList by remember { mutableStateOf<List<com.dactor.clinic.data.model.MedicalSpecialty>>(emptyList()) }
    var masterQualificationsList by remember { mutableStateOf<List<com.dactor.clinic.data.model.MedicalQualification>>(emptyList()) }

    val editPictureLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.GetContent()
    ) { uri: Uri? ->
        if (uri != null) {
            editPictureUri = uri
            editPictureName = com.dactor.clinic.domain.util.FileCompressor.resolveDisplayFileName(
                context = context,
                uri = uri,
                defaultBaseName = "doctor_photo"
            )
        }
    }

    val coroutineScope = rememberCoroutineScope()
    val scrollState = rememberScrollState()
    val today = LocalDate.now().toString()

    // Live ticking timer for ongoing doctor consultation
    LaunchedEffect(appointmentsQueue.firstOrNull { it.checkinStatus == "inside" || it.checkinStatus == "in_consultation" || it.checkinStatus == "inside_opd" }?.id) {
        activeConsultationSeconds = 0
        while (isActive && appointmentsQueue.any { it.checkinStatus == "inside" || it.checkinStatus == "in_consultation" || it.checkinStatus == "inside_opd" }) {
            delay(1000L)
            activeConsultationSeconds++
        }
    }

    suspend fun loadDoctorData() {
        if (doctorRepository != null) {
            val sessionManager = com.dactor.clinic.data.local.UserSessionManager(context)
            sessionManager.awaitIdentityResolved(timeoutMs = 2500)
            val sessionDocId = sessionManager.getSavedDoctorId()
            val sessionDocEmail = sessionManager.getSavedEmail()

            val targetDoc = if (!doctorId.isNullOrBlank() && doctorId != "d1") {
                doctorRepository.getDoctorById(doctorId)
            } else if (!sessionDocId.isNullOrBlank()) {
                doctorRepository.getDoctorById(sessionDocId)
            } else if (!sessionDocEmail.isNullOrBlank()) {
                doctorRepository.getDoctorByEmail(sessionDocEmail)
            } else {
                null
            }

            if (targetDoc != null) {
                doctor = targetDoc
                com.dactor.clinic.data.local.UserSessionManager(context).saveDoctorSession(
                    targetDoc.id,
                    targetDoc.email,
                    targetDoc.fullName
                )
                // Load all affiliated clinics for this doctor
                val affClinics = doctorRepository.getAffiliatedClinicsForDoctor(targetDoc.id, targetDoc.email)
                affiliatedClinics = affClinics

                val sessionActiveClinicId = com.dactor.clinic.data.local.UserSessionManager(context).getSavedActiveClinicIdForDoctor()
                val activeCId = sessionActiveClinicId?.takeIf { id -> affClinics.any { it.id == id } }
                    ?: targetDoc.activeClinicId?.takeIf { id -> affClinics.any { it.id == id } }
                    ?: targetDoc.clinicId?.takeIf { id -> affClinics.any { it.id == id } }
                    ?: affClinics.firstOrNull()?.id

                clinic = if (!activeCId.isNullOrBlank() && clinicRepository != null) {
                    affClinics.find { it.id == activeCId } ?: clinicRepository.getClinicById(activeCId)
                } else {
                    affClinics.firstOrNull()
                }

                if (clinic != null) {
                    com.dactor.clinic.data.local.UserSessionManager(context).saveActiveClinicIdForDoctor(clinic!!.id)
                }

                doctorIsInClinic = (targetDoc.isInClinic == true)
                editPractitionerRole = if (targetDoc.isLabTechnician) "lab_technician" else "doctor"
                editName = targetDoc.fullName
                editGender = targetDoc.gender ?: ""
                editAge = targetDoc.age?.toString() ?: ""
                editStartingYear = targetDoc.startingPracticingYear?.toString() ?: ""
                editPictureName = targetDoc.profilePictureUrl?.substringAfterLast('/')
                editSpecialty = targetDoc.specialty?.ifBlank { null } ?: if (targetDoc.isLabTechnician) "Medical Lab Technician (MLT)" else "General Medicine & Physician"
                editEducation = targetDoc.education ?: ""
                editNmc = targetDoc.nmcLicenseNumber ?: ""
                editPersonalPhone = targetDoc.personalMobileNumber ?: ""
                editPublicPhone = targetDoc.publicMobileNumber ?: ""
                editDescription = targetDoc.description ?: ""

                try {
                    val specs = doctorRepository.getSpecialties()
                    if (specs.isNotEmpty()) masterSpecialtiesList = specs
                    val quals = doctorRepository.getQualifications()
                    if (quals.isNotEmpty()) masterQualificationsList = quals
                } catch (e: Exception) {
                    e.printStackTrace()
                }

                // Load clinic invitations & inviting clinic details
                if (invitationRepository != null && targetDoc.email.isNotBlank()) {
                    val invites = invitationRepository.getInvitationsForDoctor(targetDoc.email)
                        .filter { it.status == "pending" }
                    pendingInvitations = invites

                    if (clinicRepository != null) {
                        val clinicMap = mutableMapOf<String, Clinic>()
                        for (inv in invites) {
                            val c = clinicRepository.getClinicById(inv.clinicId)
                            if (c != null) {
                                clinicMap[inv.id] = c
                            }
                        }
                        invitingClinics = clinicMap
                    }
                }

                // Load today's active appointments
                if (appointmentRepository != null) {
                    val todayStr = java.time.LocalDate.now().toString()
                    val appts = appointmentRepository.getAppointmentsByDoctor(targetDoc.id, todayStr)
                    val effectiveTargetClinicId = clinic?.id ?: activeCId
                    appointmentsQueue = appts.filter { appt ->
                        (effectiveTargetClinicId.isNullOrBlank() || appt.clinicId == effectiveTargetClinicId) &&
                        appt.checkinStatus != "completed" && appt.checkinStatus != "cancelled" &&
                        appt.status.equals("APPROVED", ignoreCase = true) &&
                        appt.status != "WAITING_FOR_APPROVAL" &&
                        appt.status != "pending_payment" &&
                        appt.status != "UNAPPROVED" &&
                        appt.status != "EXPIRED"
                    }
                }
            }
        }
        isLoading = false
    }

    LaunchedEffect(doctorId) {
        while (isActive) {
            loadDoctorData()
            delay(4000L)
        }
    }

    val displayName = doctor?.fullName ?: "Practicing Physician"
    val currentDoctor = doctor
    val formattedDoctorName = remember(displayName, currentDoctor) {
        if (currentDoctor == null) {
            "Doctor Portal"
        } else when {
            displayName.startsWith("Dr.", ignoreCase = true) || displayName.startsWith("Dr ", ignoreCase = true) -> displayName
            currentDoctor.isLabTechnician -> displayName
            else -> "Dr. $displayName"
        }
    }
    val displaySpecialty = doctor?.specialty ?: "Specialist OPD"
    val displayNmc = doctor?.nmcLicenseNumber ?: "Pending Verification"
    val kycStatus = doctor?.kycStatus ?: "pending"
    val activeAppointment = appointmentsQueue.firstOrNull { it.checkinStatus == "inside" || it.checkinStatus == "in_consultation" || it.checkinStatus == "inside_opd" }
    val nextWaitingAppt = appointmentsQueue.firstOrNull { it.id != activeAppointment?.id && it.checkinStatus != "completed" && it.checkinStatus != "cancelled" }
    val isAffiliated = doctor?.clinicId != null && clinic != null

    val commonSpecialties = listOf(
        "General Physician",
        "Cardiologist",
        "Pediatrician",
        "Orthopedic Surgeon",
        "Dermatologist",
        "Gynecologist & Obstetrician",
        "ENT Specialist",
        "Neurologist",
        "Psychiatrist",
        "Ophthalmologist",
        "Radiologist",
        "Dentist"
    )

    Scaffold(
        topBar = {
            Surface(
                color = MaterialTheme.colorScheme.surface,
                shadowElevation = 2.dp,
                border = BorderStroke(1.dp, Color(0xFFE2E8F0).copy(alpha = 0.8f)),
                modifier = Modifier.fillMaxWidth()
            ) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .statusBarsPadding()
                        .padding(horizontal = 16.dp, vertical = 10.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    // Row 1: Doctor Identity Section + Top Action Buttons
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        // Left: Doctor Identity Section (Avatar + Name & Role)
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(10.dp),
                            modifier = Modifier
                                .weight(1f)
                                .clickable { showSettingsDialog = true }
                        ) {
                            // Avatar with Live Presence Indicator
                            Box(contentAlignment = Alignment.BottomEnd) {
                                val photoUrl = doctor?.resolvedProfilePictureUrl
                                if (!photoUrl.isNullOrBlank()) {
                                    AsyncImage(
                                        model = photoUrl,
                                        contentDescription = displayName,
                                        contentScale = ContentScale.Crop,
                                        modifier = Modifier
                                            .size(42.dp)
                                            .clip(CircleShape)
                                            .border(1.5.dp, MaterialTheme.colorScheme.primary.copy(alpha = 0.3f), CircleShape)
                                    )
                                } else {
                                    Surface(
                                        shape = CircleShape,
                                        color = MaterialTheme.colorScheme.primaryContainer,
                                        modifier = Modifier.size(42.dp)
                                    ) {
                                        Box(contentAlignment = Alignment.Center) {
                                            val initials = displayName.split(" ")
                                                .filter { it.isNotBlank() && !it.startsWith("Dr", ignoreCase = true) }
                                                .mapNotNull { it.firstOrNull()?.toString() }
                                                .take(2)
                                                .joinToString("")
                                                .ifBlank { "DR" }
                                            Text(
                                                text = initials,
                                                fontWeight = FontWeight.Bold,
                                                fontSize = 15.sp,
                                                color = MaterialTheme.colorScheme.onPrimaryContainer
                                            )
                                        }
                                    }
                                }
                                // Online Presence Dot: Green if in clinic, Amber if away
                                Box(
                                    modifier = Modifier
                                        .size(11.dp)
                                        .background(
                                            color = if (doctorIsInClinic) Color(0xFF10B981) else Color(0xFFF59E0B),
                                            shape = CircleShape
                                        )
                                        .border(2.dp, Color.White, CircleShape)
                                )
                            }

                            // Doctor Name and Specialty
                            Column(
                                modifier = Modifier.weight(1f),
                                verticalArrangement = Arrangement.spacedBy(2.dp)
                            ) {
                                Row(
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(4.dp)
                                ) {
                                    Text(
                                        text = formattedDoctorName,
                                        fontWeight = FontWeight.Bold,
                                        fontSize = 16.sp,
                                        color = MaterialTheme.colorScheme.onSurface,
                                        maxLines = 1,
                                        overflow = TextOverflow.Ellipsis
                                    )
                                    if (kycStatus.equals("verified", ignoreCase = true) || kycStatus.equals("approved", ignoreCase = true)) {
                                        Icon(
                                            Icons.Default.Verified,
                                            contentDescription = "Verified Doctor",
                                            tint = Color(0xFF0284C7),
                                            modifier = Modifier.size(15.dp)
                                        )
                                    }
                                }
                                Text(
                                    text = displaySpecialty,
                                    fontSize = 12.sp,
                                    fontWeight = FontWeight.Medium,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis
                                )
                            }
                        }

                        Spacer(Modifier.width(8.dp))

                        // Right: Professional Action Buttons
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(6.dp)
                        ) {
                            // Notifications
                            Surface(
                                shape = CircleShape,
                                color = Color(0xFFF1F5F9),
                                modifier = Modifier.size(36.dp)
                            ) {
                                IconButton(
                                    onClick = { navController.navigate(NavRoutes.Notifications) },
                                    modifier = Modifier.fillMaxSize()
                                ) {
                                    Icon(
                                        Icons.Default.Notifications,
                                        contentDescription = "Notifications",
                                        tint = Color(0xFF334155),
                                        modifier = Modifier.size(17.dp)
                                    )
                                }
                            }

                            // Profile Settings
                            Surface(
                                shape = CircleShape,
                                color = Color(0xFFF1F5F9),
                                modifier = Modifier.size(36.dp)
                            ) {
                                IconButton(
                                    onClick = { showSettingsDialog = true },
                                    modifier = Modifier.fillMaxSize()
                                ) {
                                    Icon(
                                        Icons.Default.Settings,
                                        contentDescription = "Doctor Profile Settings",
                                        tint = MaterialTheme.colorScheme.primary,
                                        modifier = Modifier.size(17.dp)
                                    )
                                }
                            }

                            // Sign Out
                            Surface(
                                shape = CircleShape,
                                color = Color(0xFFFEE2E2).copy(alpha = 0.7f),
                                modifier = Modifier.size(36.dp)
                            ) {
                                IconButton(
                                    onClick = { showSignOutConfirmDialog = true },
                                    modifier = Modifier.fillMaxSize()
                                ) {
                                    Icon(
                                        Icons.AutoMirrored.Filled.ExitToApp,
                                        contentDescription = "Sign Out",
                                        tint = Color(0xFFDC2626),
                                        modifier = Modifier.size(17.dp)
                                    )
                                }
                            }
                        }
                    }

                    // Row 2: Status Badges Row (NMC Verification Status & Practice Affiliation)
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        // Badge 1: NMC License Status
                        if (kycStatus.equals("pending", ignoreCase = true)) {
                            Surface(
                                shape = RoundedCornerShape(6.dp),
                                color = Color(0xFFFEF3C7),
                                border = BorderStroke(1.dp, Color(0xFFFDE68A))
                            ) {
                                Row(
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(4.dp),
                                    modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp)
                                ) {
                                    Icon(
                                        Icons.Default.PendingActions,
                                        contentDescription = null,
                                        tint = Color(0xFFD97706),
                                        modifier = Modifier.size(11.dp)
                                    )
                                    Text(
                                        text = "NMC Review Pending",
                                        color = Color(0xFF92400E),
                                        fontSize = 11.sp,
                                        fontWeight = FontWeight.SemiBold
                                    )
                                }
                            }
                        } else if (kycStatus.equals("rejected", ignoreCase = true)) {
                            Surface(
                                shape = RoundedCornerShape(6.dp),
                                color = Color(0xFFFEE2E2),
                                border = BorderStroke(1.dp, Color(0xFFFECACA))
                            ) {
                                Row(
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(4.dp),
                                    modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp)
                                ) {
                                    Icon(
                                        Icons.Default.ErrorOutline,
                                        contentDescription = null,
                                        tint = Color(0xFFDC2626),
                                        modifier = Modifier.size(11.dp)
                                    )
                                    Text(
                                        text = "NMC Rejected",
                                        color = Color(0xFF991B1B),
                                        fontSize = 11.sp,
                                        fontWeight = FontWeight.SemiBold
                                    )
                                }
                            }
                        } else {
                            Surface(
                                shape = RoundedCornerShape(6.dp),
                                color = Color(0xFFECFDF5),
                                border = BorderStroke(1.dp, Color(0xFFA7F3D0))
                            ) {
                                Row(
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(4.dp),
                                    modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp)
                                ) {
                                    Icon(
                                        Icons.Default.Verified,
                                        contentDescription = null,
                                        tint = Color(0xFF059669),
                                        modifier = Modifier.size(11.dp)
                                    )
                                    Text(
                                        text = "NMC: $displayNmc",
                                        color = Color(0xFF065F46),
                                        fontSize = 11.sp,
                                        fontWeight = FontWeight.SemiBold
                                    )
                                }
                            }
                        }

                        // Badge 2: Practice Affiliation Status
                        Surface(
                            shape = RoundedCornerShape(6.dp),
                            color = if (isAffiliated) Color(0xFFEFF6FF) else Color(0xFFF1F5F9),
                            border = BorderStroke(1.dp, if (isAffiliated) Color(0xFFBFDBFE) else Color(0xFFE2E8F0)),
                            modifier = Modifier.weight(1f, fill = false)
                        ) {
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(4.dp),
                                modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp)
                            ) {
                                Icon(
                                    imageVector = if (isAffiliated) Icons.Default.LocalHospital else Icons.Default.DomainDisabled,
                                    contentDescription = null,
                                    tint = if (isAffiliated) Color(0xFF1D4ED8) else Color(0xFF64748B),
                                    modifier = Modifier.size(11.dp)
                                )
                                Text(
                                    text = if (isAffiliated) (clinic?.name ?: "Affiliated") else "Independent Practice",
                                    color = if (isAffiliated) Color(0xFF1E40AF) else Color(0xFF475569),
                                    fontSize = 11.sp,
                                    fontWeight = FontWeight.SemiBold,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis
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
                .padding(horizontal = 16.dp, vertical = 12.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp)
        ) {
            if (doctor == null && isLoading) {
                com.dactor.clinic.ui.common.ShimmerListPlaceholder(count = 4)
            } else if (doctor == null && !isLoading && sessionManager.getSavedDoctorId().isNullOrBlank()) {
                Card(
                    shape = RoundedCornerShape(16.dp),
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.5f))
                ) {
                    Column(
                        modifier = Modifier.padding(16.dp),
                        verticalArrangement = Arrangement.spacedBy(10.dp)
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            Icon(Icons.Default.MedicalServices, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
                            Text("No Doctor Profile Found", fontWeight = FontWeight.Bold, fontSize = 14.sp)
                        }
                        Text(
                            "You are currently signed in, but no physician profile was found associated with your account. Complete your doctor registration to start managing appointments and queue.",
                            fontSize = 12.sp,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                        Button(
                            onClick = { navController.navigate(NavRoutes.DoctorRegister) },
                            shape = RoundedCornerShape(10.dp)
                        ) {
                            Text("Register Doctor Profile Now")
                        }
                    }
                }

                Spacer(Modifier.height(12.dp))

                OutlinedButton(
                    onClick = {
                        sessionManager.clearSession()
                        clinicRepository?.clearCache()
                        doctorRepository?.clearCache()
                        try {
                            com.google.android.gms.auth.api.signin.GoogleSignIn.getClient(
                                context,
                                com.google.android.gms.auth.api.signin.GoogleSignInOptions.DEFAULT_SIGN_IN
                            ).signOut()
                            com.google.firebase.auth.FirebaseAuth.getInstance().signOut()
                        } catch (ignored: Exception) {}
                        navController.navigate(NavRoutes.ClinicLogin) {
                            popUpTo(0) { inclusive = true }
                        }
                    },
                    shape = RoundedCornerShape(14.dp),
                    modifier = Modifier.fillMaxWidth().height(48.dp)
                ) {
                    Icon(Icons.Default.ExitToApp, contentDescription = null, modifier = Modifier.size(18.dp), tint = MaterialTheme.colorScheme.error)
                    Spacer(Modifier.width(8.dp))
                    Text("Sign Out", fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.error)
                }
            } else {
            // KYC STATUS ADVISORY (Displayed only if verification requires attention)
            if (kycStatus.equals("pending", ignoreCase = true)) {
                Card(
                    shape = RoundedCornerShape(12.dp),
                    colors = CardDefaults.cardColors(containerColor = Color(0xFFFEF3C7)),
                    border = BorderStroke(1.dp, Color(0xFFFDE68A))
                ) {
                    Row(
                        modifier = Modifier.padding(12.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(10.dp)
                    ) {
                        Icon(Icons.Default.PendingActions, contentDescription = null, tint = Color(0xFFD97706))
                        Column {
                            Text("NMC License Verification Pending", fontWeight = FontWeight.Bold, fontSize = 13.sp, color = Color(0xFF92400E))
                            Text("Your credentials have been submitted and are under review by the Super Admin.", fontSize = 11.sp, color = Color(0xFF78350F))
                        }
                    }
                }
            } else if (kycStatus.equals("rejected", ignoreCase = true)) {
                Card(
                    shape = RoundedCornerShape(12.dp),
                    colors = CardDefaults.cardColors(containerColor = Color(0xFFFEE2E2)),
                    border = BorderStroke(1.dp, Color(0xFFFECACA))
                ) {
                    Row(
                        modifier = Modifier.padding(12.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(10.dp)
                    ) {
                        Icon(Icons.Default.ErrorOutline, contentDescription = null, tint = Color(0xFFDC2626))
                        Column {
                            Text("NMC Verification Action Required", fontWeight = FontWeight.Bold, fontSize = 13.sp, color = Color(0xFF991B1B))
                            Text("Your NMC credentials were not approved. Please review your submitted documents and update them in settings.", fontSize = 11.sp, color = Color(0xFF7F1D1D))
                        }
                    }
                }
            }

            // AFFILIATED CLINICS & PRACTICE LOCATION SELECTION
            if (affiliatedClinics.isNotEmpty()) {
                Card(
                    shape = RoundedCornerShape(16.dp),
                    colors = CardDefaults.cardColors(containerColor = Color(0xFFF8FAFC)),
                    border = BorderStroke(1.dp, Color(0xFFCBD5E1)),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.SpaceBetween,
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                Icon(Icons.Default.LocalHospital, contentDescription = null, tint = Color(0xFF0284C7), modifier = Modifier.size(20.dp))
                                Text("Affiliated Practice Facilities (${affiliatedClinics.size})", fontWeight = FontWeight.Bold, fontSize = 14.sp, color = Color(0xFF0F172A))
                            }
                            Text("1 Clinic at a Time", fontSize = 11.sp, color = Color(0xFF64748B), fontWeight = FontWeight.SemiBold)
                        }

                        Text(
                            text = "You are affiliated with multiple clinics. Select which facility is your active practice location today. Your presence and live queue are active at the selected facility.",
                            fontSize = 11.sp,
                            color = Color(0xFF475569)
                        )

                        affiliatedClinics.forEach { affClinic ->
                            val savedActiveCId = com.dactor.clinic.data.local.UserSessionManager(context).getSavedActiveClinicIdForDoctor()
                            val effectiveActiveClinicId = clinic?.id ?: savedActiveCId ?: doctor?.activeClinicId ?: doctor?.clinicId
                            val isActiveClinic = affClinic.id == effectiveActiveClinicId
                            Card(
                                shape = RoundedCornerShape(12.dp),
                                colors = CardDefaults.cardColors(
                                    containerColor = if (isActiveClinic) Color(0xFFECFDF5) else Color(0xFFFFFFFF)
                                ),
                                border = BorderStroke(
                                    1.5.dp,
                                    if (isActiveClinic) Color(0xFF10B981) else Color(0xFFE2E8F0)
                                ),
                                modifier = Modifier.fillMaxWidth()
                            ) {
                                Row(
                                    modifier = Modifier
                                        .padding(12.dp)
                                        .fillMaxWidth(),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Column(modifier = Modifier.weight(1f)) {
                                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                            Text(affClinic.name, fontWeight = FontWeight.Bold, fontSize = 14.sp, color = if (isActiveClinic) Color(0xFF064E3B) else Color(0xFF1E293B))
                                            if (isActiveClinic) {
                                                Surface(
                                                    color = Color(0xFF10B981).copy(alpha = 0.2f),
                                                    shape = RoundedCornerShape(4.dp)
                                                ) {
                                                    Text("Active OPD Location", fontSize = 9.sp, fontWeight = FontWeight.Bold, color = Color(0xFF047857), modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp))
                                                }
                                            }
                                        }
                                        Text(affClinic.addressText ?: "Nepal", fontSize = 11.sp, color = Color(0xFF64748B))
                                    }

                                    if (!isActiveClinic) {
                                        Button(
                                            onClick = {
                                                coroutineScope.launch {
                                                    val targetId = doctor?.id
                                                    if (targetId != null && doctorRepository != null) {
                                                        com.dactor.clinic.data.local.UserSessionManager(context).saveActiveClinicIdForDoctor(affClinic.id)
                                                        clinic = affClinic
                                                        doctorIsInClinic = true
                                                        doctorRepository.switchActiveClinic(targetId, affClinic.id, true)
                                                        loadDoctorData()
                                                    }
                                                }
                                            },
                                            colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF0284C7)),
                                            shape = RoundedCornerShape(8.dp),
                                            contentPadding = PaddingValues(horizontal = 10.dp, vertical = 6.dp)
                                        ) {
                                            Text("Set Active", fontSize = 11.sp, fontWeight = FontWeight.Bold)
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            } else {
                Card(
                    shape = RoundedCornerShape(16.dp),
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.45f)),
                    border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Row(
                        modifier = Modifier.padding(16.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(14.dp)
                    ) {
                        Box(
                            modifier = Modifier
                                .size(46.dp)
                                .background(MaterialTheme.colorScheme.surfaceVariant, CircleShape),
                            contentAlignment = Alignment.Center
                        ) {
                            Icon(Icons.Default.DomainDisabled, contentDescription = null, tint = MaterialTheme.colorScheme.outline, modifier = Modifier.size(24.dp))
                        }
                        Column(modifier = Modifier.weight(1f)) {
                            Text("Independent Practice • No Clinic Affiliated", fontWeight = FontWeight.Bold, fontSize = 14.sp)
                            Text(
                                "You are not affiliated with any clinic yet. A clinic administrator can invite you using your email: ${doctor?.email ?: "your registered email"}. You can accept the invitation below to get affiliated.",
                                fontSize = 11.sp,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    }
                }
            }

            // CLINIC INVITATIONS ACCEPTANCE BANNER (DISTINCT ACTION BUTTON)
            if (pendingInvitations.isNotEmpty()) {
                pendingInvitations.forEach { invite ->
                    val invitingClinic = invitingClinics[invite.id]
                    Card(
                        shape = RoundedCornerShape(16.dp),
                        colors = CardDefaults.cardColors(containerColor = Color(0xFFEFF6FF)),
                        border = BorderStroke(1.5.dp, Color(0xFF60A5FA)),
                        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(8.dp)
                            ) {
                                Box(
                                    modifier = Modifier
                                        .size(36.dp)
                                        .background(Color(0xFF2563EB).copy(alpha = 0.15f), CircleShape),
                                    contentAlignment = Alignment.Center
                                ) {
                                    Icon(Icons.Default.Mail, contentDescription = null, tint = Color(0xFF2563EB), modifier = Modifier.size(20.dp))
                                }
                                Column {
                                    Text("Clinic Affiliation Invitation", fontWeight = FontWeight.Bold, fontSize = 14.sp, color = Color(0xFF1E40AF))
                                    Text("From: ${invitingClinic?.name ?: "Verified Clinic Partner"}", fontSize = 12.sp, fontWeight = FontWeight.SemiBold, color = Color(0xFF1E3A8A))
                                }
                            }

                            if (invitingClinic?.addressText != null) {
                                Text(
                                    text = "Location: ${invitingClinic.addressText}",
                                    fontSize = 12.sp,
                                    color = Color(0xFF1E3A8A)
                                )
                            }
                            Text(
                                text = "Accepting this invitation will affiliate your doctor profile to this clinic, allowing them to publish OPD time slots for your patients.",
                                fontSize = 11.sp,
                                color = Color(0xFF3B82F6)
                            )

                            // DISTINCT DEDICATED ACCEPT BUTTON
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.spacedBy(10.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Button(
                                    onClick = {
                                        val targetDoc = doctor
                                        if (targetDoc != null && invitationRepository != null) {
                                            coroutineScope.launch {
                                                invitationRepository.acceptDoctorInvitation(
                                                    invitationId = invite.id,
                                                    doctorId = targetDoc.id,
                                                    clinicId = invite.clinicId
                                                )
                                                loadDoctorData()
                                            }
                                        }
                                    },
                                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF059669)),
                                    shape = RoundedCornerShape(12.dp),
                                    elevation = ButtonDefaults.buttonElevation(defaultElevation = 2.dp),
                                    modifier = Modifier
                                        .weight(1f)
                                        .defaultMinSize(minHeight = 44.dp),
                                    contentPadding = PaddingValues(horizontal = 8.dp, vertical = 6.dp)
                                ) {
                                    Icon(Icons.Default.CheckCircle, contentDescription = null, modifier = Modifier.size(16.dp), tint = Color.White)
                                    Spacer(Modifier.width(6.dp))
                                    Text("Accept Invite", fontSize = 12.sp, fontWeight = FontWeight.Bold, color = Color.White, maxLines = 1)
                                }

                                OutlinedButton(
                                    onClick = {
                                        if (invitationRepository != null) {
                                            coroutineScope.launch {
                                                invitationRepository.respondToInvitation(invite.id, accept = false)
                                                loadDoctorData()
                                            }
                                        }
                                    },
                                    shape = RoundedCornerShape(12.dp),
                                    colors = ButtonDefaults.outlinedButtonColors(contentColor = Color(0xFFDC2626)),
                                    border = BorderStroke(1.dp, Color(0xFFFCA5A5)),
                                    modifier = Modifier.defaultMinSize(minHeight = 44.dp),
                                    contentPadding = PaddingValues(horizontal = 8.dp, vertical = 6.dp)
                                ) {
                                    Icon(Icons.Default.Close, contentDescription = null, modifier = Modifier.size(16.dp))
                                    Spacer(Modifier.width(4.dp))
                                    Text("Decline", fontSize = 12.sp, maxLines = 1)
                                }
                            }
                        }
                    }
                }
            }

            // DOCTOR PHYSICAL PRESENCE IN CLINIC TOGGLE
            Card(
                shape = RoundedCornerShape(16.dp),
                colors = CardDefaults.cardColors(
                    containerColor = if (doctorIsInClinic) MaterialTheme.colorScheme.primaryContainer else MaterialTheme.colorScheme.surfaceVariant
                ),
                elevation = CardDefaults.cardElevation(defaultElevation = 2.dp),
                modifier = Modifier.fillMaxWidth()
            ) {
                Row(
                    modifier = Modifier
                        .padding(16.dp)
                        .fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(12.dp),
                        modifier = Modifier.weight(1f)
                    ) {
                        Box(
                            modifier = Modifier
                                .size(14.dp)
                                .background(
                                    if (doctorIsInClinic) Color(0xFF10B981) else Color(0xFFEF4444),
                                    CircleShape
                                )
                        )
                        Column {
                            Text(
                                text = if (doctorIsInClinic) "Status: In Clinic at ${clinic?.name ?: "Facility"}" else "Status: Away / On Round",
                                fontWeight = FontWeight.Bold,
                                fontSize = 14.sp,
                                color = if (doctorIsInClinic) MaterialTheme.colorScheme.onPrimaryContainer else MaterialTheme.colorScheme.onSurfaceVariant
                            )
                            Text(
                                text = if (doctorIsInClinic)
                                    "Present at ${clinic?.name ?: "this facility"}. Patients at your other clinics see you as Away."
                                else
                                    "Patients see: Doctor has not arrived / on break",
                                fontSize = 11.sp,
                                color = if (doctorIsInClinic) Color(0xFF047857) else Color(0xFFB91C1C),
                                fontWeight = FontWeight.Medium
                            )
                        }
                    }

                    Switch(
                        checked = doctorIsInClinic,
                        onCheckedChange = { newState ->
                            doctorIsInClinic = newState
                            coroutineScope.launch {
                                val targetId = doctor?.id ?: doctorId
                                if (targetId != null) {
                                    val currentClinicId = doctor?.activeClinicId ?: clinic?.id ?: doctor?.clinicId ?: ""
                                    if (newState && currentClinicId.isNotBlank()) {
                                        doctorRepository?.switchActiveClinic(targetId, currentClinicId, true)
                                    } else {
                                        doctorRepository?.toggleDoctorPresence(targetId, false, currentClinicId.takeIf { it.isNotBlank() })
                                    }
                                    loadDoctorData()
                                }
                            }
                        }
                    )
                }
            }

            // ACTIVE PATIENT CONSULTATION CARD
            Card(
                shape = RoundedCornerShape(16.dp),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                elevation = CardDefaults.cardElevation(defaultElevation = 3.dp),
                modifier = Modifier.fillMaxWidth()
            ) {
                Column(modifier = Modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(
                            text = if (activeAppointment != null) "Active Patient Consultation" else "Doctor Cabin Free / Ready",
                            fontWeight = FontWeight.Bold,
                            fontSize = 15.sp
                        )
                        if (activeAppointment != null) {
                            Surface(
                                color = Color(0xFFDBEAFE),
                                shape = RoundedCornerShape(8.dp)
                            ) {
                                Text(
                                    text = "Code: ${activeAppointment.trackingCode10Digit}",
                                    color = Color(0xFF1E40AF),
                                    fontWeight = FontWeight.Bold,
                                    fontSize = 12.sp,
                                    modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
                                )
                            }
                        } else if (nextWaitingAppt != null) {
                            Surface(
                                color = Color(0xFFDCFCE7),
                                shape = RoundedCornerShape(8.dp)
                            ) {
                                Text(
                                    text = "Ready for Next Patient",
                                    color = Color(0xFF15803D),
                                    fontWeight = FontWeight.Bold,
                                    fontSize = 12.sp,
                                    modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
                                )
                            }
                        }
                    }

                    HorizontalDivider()

                    if (activeAppointment != null) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Column {
                                Text(activeAppointment.patientName, fontWeight = FontWeight.Bold, fontSize = 16.sp)
                                Text("${activeAppointment.patientAge} yrs • ${activeAppointment.patientGender} • Ph: ${activeAppointment.patientMobile}", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }

                            Surface(
                                color = Color(0xFF10B981).copy(alpha = 0.15f),
                                shape = RoundedCornerShape(6.dp)
                            ) {
                                Text(
                                    text = (activeAppointment.checkinStatus ?: "Checked In").uppercase(),
                                    color = Color(0xFF047857),
                                    fontWeight = FontWeight.SemiBold,
                                    fontSize = 11.sp,
                                    modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp)
                                )
                            }
                        }

                        // Working Consultation Live Timer & Phase Banner
                        val elapsedMins = activeConsultationSeconds / 60
                        val elapsedSecs = activeConsultationSeconds % 60
                        val formattedElapsed = String.format(java.util.Locale.US, "%02d:%02d", elapsedMins, elapsedSecs)
                        Surface(
                            color = Color(0xFFDCFCE7),
                            shape = RoundedCornerShape(8.dp),
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Row(
                                modifier = Modifier.padding(horizontal = 12.dp, vertical = 7.dp),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                    Box(modifier = Modifier.size(8.dp).background(Color(0xFF16A34A), CircleShape))
                                    Text("Phase: Clinical Consultation in Progress", fontSize = 12.sp, fontWeight = FontWeight.Bold, color = Color(0xFF15803D))
                                }
                                Text("⏱ $formattedElapsed min", fontSize = 12.sp, fontWeight = FontWeight.ExtraBold, color = Color(0xFF166534))
                            }
                        }

                        val isLabPractitionerOrClinic = doctor?.isLabTechnician == true ||
                            clinic?.type == "diagnostic_lab" ||
                            clinic?.type?.contains("lab", ignoreCase = true) == true

                        // Clinical Rx & Lab Buttons
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(10.dp)
                        ) {
                            Button(
                                onClick = {
                                    navController.navigate("${NavRoutes.PatientDetail}/${activeAppointment.trackingCode10Digit}")
                                },
                                modifier = Modifier.weight(1f),
                                shape = RoundedCornerShape(10.dp)
                            ) {
                                Icon(Icons.Default.EditNote, contentDescription = null, modifier = Modifier.size(16.dp))
                                Spacer(Modifier.width(6.dp))
                                Text("Clinical Rx", fontSize = 12.sp)
                            }

                            if (isLabPractitionerOrClinic) {
                                OutlinedButton(
                                    onClick = {
                                        navController.navigate(NavRoutes.LabWorkflow)
                                    },
                                    modifier = Modifier.weight(1f),
                                    shape = RoundedCornerShape(10.dp)
                                ) {
                                    Icon(Icons.Default.Biotech, contentDescription = null, modifier = Modifier.size(16.dp))
                                    Spacer(Modifier.width(6.dp))
                                    Text("Lab Workflow", fontSize = 12.sp)
                                }
                            }
                        }

                        // Complete Consultation Button
                        var isCompleting by remember { mutableStateOf(false) }
                        Button(
                            onClick = {
                                if (isCompleting) return@Button
                                isCompleting = true
                                coroutineScope.launch {
                                    try {
                                        if (appointmentRepository != null) {
                                            val completedApptId = activeAppointment.id
                                            // Immediately update local state so next patient appears smoothly
                                            appointmentsQueue = appointmentsQueue.filter { it.id != completedApptId }
                                            val ok = appointmentRepository.completeConsultation(completedApptId)
                                        }
                                        loadDoctorData()
                                    } catch (e: Exception) {
                                        e.printStackTrace()
                                    } finally {
                                        isCompleting = false
                                    }
                                }
                            },
                            colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.primary),
                            modifier = Modifier.fillMaxWidth(),
                            shape = RoundedCornerShape(10.dp),
                            enabled = !isCompleting
                        ) {
                            Icon(Icons.Default.DoneAll, contentDescription = null, modifier = Modifier.size(18.dp))
                            Spacer(Modifier.width(8.dp))
                            Text(
                                text = if (isCompleting) "Completing Consultation..." else "Complete Consultation",
                                fontWeight = FontWeight.Bold
                            )
                        }

                        // Next Patients in Queue with Time Window
                        val upcomingWaiting = appointmentsQueue.filter { it.id != activeAppointment.id }
                        if (upcomingWaiting.isNotEmpty()) {
                            HorizontalDivider()
                            Text("Next Patients in Queue (${upcomingWaiting.size} waiting):", fontSize = 12.sp, fontWeight = FontWeight.SemiBold, color = Color(0xFF475569))
                            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                                upcomingWaiting.take(3).forEachIndexed { idx, waitAppt ->
                                    Surface(
                                        color = Color(0xFFF8FAFC),
                                        shape = RoundedCornerShape(8.dp),
                                        border = BorderStroke(1.dp, Color(0xFFE2E8F0)),
                                        modifier = Modifier.fillMaxWidth()
                                    ) {
                                        Row(
                                            modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp),
                                            horizontalArrangement = Arrangement.SpaceBetween,
                                            verticalAlignment = Alignment.CenterVertically
                                        ) {
                                            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                                Surface(shape = CircleShape, color = Color(0xFF3B82F6), modifier = Modifier.size(20.dp)) {
                                                    Box(contentAlignment = Alignment.Center) {
                                                        Text("#${idx + 1}", color = Color.White, fontSize = 10.sp, fontWeight = FontWeight.Bold)
                                                    }
                                                }
                                                Text(waitAppt.patientName, fontSize = 13.sp, fontWeight = FontWeight.Bold)
                                            }
                                            Text(
                                                text = if (waitAppt.appointmentTime.isNotBlank()) "Slot: ${waitAppt.appointmentTime}" else "Waiting in Lobby",
                                                fontSize = 11.sp,
                                                color = Color(0xFF0284C7),
                                                fontWeight = FontWeight.Medium
                                            )
                                        }
                                    }
                                }
                            }
                        }
                    } else if (nextWaitingAppt != null) {
                        // Doctor Cabin Free / Ready card showing next waiting patient with prominent Call Inside button
                        Column(
                            modifier = Modifier.fillMaxWidth(),
                            verticalArrangement = Arrangement.spacedBy(14.dp)
                        ) {
                            Surface(
                                color = Color(0xFFF0FDF4),
                                shape = RoundedCornerShape(12.dp),
                                border = BorderStroke(1.dp, Color(0xFFBBF7D0)),
                                modifier = Modifier.fillMaxWidth()
                            ) {
                                Row(
                                    modifier = Modifier.padding(14.dp),
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(12.dp)
                                ) {
                                    Surface(
                                        shape = CircleShape,
                                        color = Color(0xFF16A34A),
                                        modifier = Modifier.size(38.dp)
                                    ) {
                                        Box(contentAlignment = Alignment.Center) {
                                            Icon(
                                                Icons.Default.MeetingRoom,
                                                contentDescription = null,
                                                tint = Color.White,
                                                modifier = Modifier.size(22.dp)
                                            )
                                        }
                                    }
                                    Column(modifier = Modifier.weight(1f)) {
                                        Text(
                                            "Doctor Cabin Free / Ready",
                                            fontWeight = FontWeight.Bold,
                                            fontSize = 15.sp,
                                            color = Color(0xFF15803D)
                                        )
                                        Text(
                                            "OPD chamber is open. Patient enters only when called inside.",
                                            fontSize = 12.sp,
                                            color = Color(0xFF166534)
                                        )
                                    }
                                }
                            }

                            // Next Waiting Patient Details Card
                            Surface(
                                color = Color(0xFFF8FAFC),
                                shape = RoundedCornerShape(12.dp),
                                border = BorderStroke(1.dp, Color(0xFFE2E8F0)),
                                modifier = Modifier.fillMaxWidth()
                            ) {
                                Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                    Row(
                                        modifier = Modifier.fillMaxWidth(),
                                        horizontalArrangement = Arrangement.SpaceBetween,
                                        verticalAlignment = Alignment.CenterVertically
                                    ) {
                                        Column {
                                            Text(
                                                text = nextWaitingAppt.patientName,
                                                fontWeight = FontWeight.Bold,
                                                fontSize = 16.sp,
                                                color = Color(0xFF0F172A)
                                            )
                                            val demo = listOfNotNull(
                                                "${nextWaitingAppt.patientAge} yrs".takeIf { (nextWaitingAppt.patientAge ?: 0) > 0 },
                                                nextWaitingAppt.patientGender?.takeIf { it.isNotBlank() && it != "Registered" },
                                                nextWaitingAppt.patientMobile.takeIf { it.isNotBlank() }
                                            ).joinToString(" • ")
                                            if (demo.isNotBlank()) {
                                                Text(demo, fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                            }
                                        }

                                        Surface(
                                            color = Color(0xFFDBEAFE),
                                            shape = RoundedCornerShape(8.dp)
                                        ) {
                                            Text(
                                                text = if (nextWaitingAppt.appointmentTime.isNotBlank()) "Slot: ${nextWaitingAppt.appointmentTime}" else "Next in Turn",
                                                color = Color(0xFF1E40AF),
                                                fontWeight = FontWeight.Bold,
                                                fontSize = 11.5.sp,
                                                modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
                                            )
                                        }
                                    }
                                }
                            }

                            // Prominent "Call Inside" Button
                            var isCallingInside by remember { mutableStateOf(false) }
                            Button(
                                onClick = {
                                    if (isCallingInside) return@Button
                                    isCallingInside = true
                                    coroutineScope.launch {
                                        try {
                                            val targetClinicId = clinic?.id ?: nextWaitingAppt.clinicId
                                            // Optimistically promote next waiting patient to inside
                                            appointmentsQueue = appointmentsQueue.map {
                                                if (it.id == nextWaitingAppt.id) it.copy(checkinStatus = "inside") else it
                                            }
                                            queueRepository?.updateQueueStatus(nextWaitingAppt.id, "inside", targetClinicId)
                                            appointmentRepository?.updateCheckinStatus(nextWaitingAppt.id, "inside")
                                            loadDoctorData()
                                        } catch (e: Exception) {
                                            e.printStackTrace()
                                        } finally {
                                            isCallingInside = false
                                        }
                                    }
                                },
                                colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF16A34A)),
                                modifier = Modifier.fillMaxWidth(),
                                shape = RoundedCornerShape(10.dp),
                                enabled = !isCallingInside
                            ) {
                                Icon(Icons.Default.Campaign, contentDescription = null, modifier = Modifier.size(18.dp))
                                Spacer(Modifier.width(8.dp))
                                Text(
                                    text = if (isCallingInside) "Calling Inside..." else "Call Inside (Next Patient)",
                                    fontWeight = FontWeight.Bold,
                                    fontSize = 14.sp
                                )
                            }

                            // Remaining Patients in Queue
                            val remainingWaiting = appointmentsQueue.filter { it.id != nextWaitingAppt.id && it.checkinStatus != "completed" && it.checkinStatus != "cancelled" }
                            if (remainingWaiting.isNotEmpty()) {
                                HorizontalDivider()
                                Text("Upcoming Patients in Queue (${remainingWaiting.size} more waiting):", fontSize = 12.sp, fontWeight = FontWeight.SemiBold, color = Color(0xFF475569))
                                Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                                    remainingWaiting.take(3).forEachIndexed { idx, waitAppt ->
                                        Surface(
                                            color = Color(0xFFF8FAFC),
                                            shape = RoundedCornerShape(8.dp),
                                            border = BorderStroke(1.dp, Color(0xFFE2E8F0)),
                                            modifier = Modifier.fillMaxWidth()
                                        ) {
                                            Row(
                                                modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp),
                                                horizontalArrangement = Arrangement.SpaceBetween,
                                                verticalAlignment = Alignment.CenterVertically
                                            ) {
                                                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                                    Surface(shape = CircleShape, color = Color(0xFF3B82F6), modifier = Modifier.size(20.dp)) {
                                                        Box(contentAlignment = Alignment.Center) {
                                                            Text("#${idx + 2}", color = Color.White, fontSize = 10.sp, fontWeight = FontWeight.Bold)
                                                        }
                                                    }
                                                    Text(waitAppt.patientName, fontSize = 13.sp, fontWeight = FontWeight.Bold)
                                                }
                                                Text(
                                                    text = if (waitAppt.appointmentTime.isNotBlank()) "Slot: ${waitAppt.appointmentTime}" else "Waiting in Lobby",
                                                    fontSize = 11.sp,
                                                    color = Color(0xFF0284C7),
                                                    fontWeight = FontWeight.Medium
                                                )
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    } else {
                        // Empty queue state - NO LOOPING
                        Column(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(vertical = 12.dp),
                            horizontalAlignment = Alignment.CenterHorizontally,
                            verticalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            Icon(
                                Icons.Default.CheckCircle,
                                contentDescription = null,
                                tint = Color(0xFF10B981),
                                modifier = Modifier.size(40.dp)
                            )
                            Text("No Active Consultations", fontWeight = FontWeight.Bold, fontSize = 15.sp)
                            Text(
                                "All appointments for today are completed, or no patients have checked in yet.",
                                fontSize = 12.sp,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                textAlign = androidx.compose.ui.text.style.TextAlign.Center
                            )
                            OutlinedButton(
                                onClick = {
                                    coroutineScope.launch { loadDoctorData() }
                                },
                                shape = RoundedCornerShape(8.dp)
                            ) {
                                Icon(Icons.Default.Refresh, contentDescription = null, modifier = Modifier.size(16.dp))
                                Spacer(Modifier.width(6.dp))
                                Text("Refresh OPD Queue")
                            }
                        }
                    }
                }
            }

            // DOCTOR WORKSPACE MODULES
            val showLabModule = doctor?.isLabTechnician == true ||
                clinic?.type == "diagnostic_lab" ||
                clinic?.type?.contains("lab", ignoreCase = true) == true

            Text(
                if (doctor?.isLabTechnician == true) "Lab Technician & Clinical Tools" else "Doctor Clinical Tools",
                fontWeight = FontWeight.Bold,
                fontSize = 15.sp
            )

            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Card(
                    modifier = Modifier.weight(1f).height(100.dp),
                    shape = RoundedCornerShape(12.dp),
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                    onClick = {
                        val docId = doctor?.id ?: doctorId ?: com.dactor.clinic.data.local.UserSessionManager(context).getSavedDoctorId() ?: ""
                        if (docId.isNotBlank()) {
                            navController.navigate("${NavRoutes.PatientDirectory}/$docId")
                        } else {
                            navController.navigate(NavRoutes.PatientDirectory)
                        }
                    }
                ) {
                    Column(
                        modifier = Modifier.padding(12.dp).fillMaxSize(),
                        verticalArrangement = Arrangement.SpaceBetween
                    ) {
                        Icon(Icons.Default.People, contentDescription = null, tint = Color(0xFF3B82F6))
                        Column {
                            Text("Patient Directory", fontWeight = FontWeight.Bold, fontSize = 12.sp)
                            Text("Past history & clinical records", fontSize = 10.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                }

                Card(
                    modifier = Modifier.weight(1f).height(100.dp),
                    shape = RoundedCornerShape(12.dp),
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                    onClick = {
                        val targetCid = clinic?.id ?: com.dactor.clinic.data.local.UserSessionManager(context).getSavedActiveClinicIdForDoctor() ?: ""
                        if (targetCid.isNotBlank()) {
                            navController.navigate("${NavRoutes.FutureAppointments}/$targetCid")
                        } else {
                            navController.navigate(NavRoutes.FutureAppointments)
                        }
                    }
                ) {
                    Column(
                        modifier = Modifier.padding(12.dp).fillMaxSize(),
                        verticalArrangement = Arrangement.SpaceBetween
                    ) {
                        Icon(Icons.Default.CalendarToday, contentDescription = null, tint = Color(0xFF8B5CF6))
                        Column {
                            Text("OPD Schedule", fontWeight = FontWeight.Bold, fontSize = 12.sp)
                            Text("Upcoming bookings by date", fontSize = 10.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                }
            }

            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                if (showLabModule) {
                    Card(
                        modifier = Modifier.weight(1f).height(100.dp),
                        shape = RoundedCornerShape(12.dp),
                        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                        onClick = { navController.navigate(NavRoutes.LabWorkflow) }
                    ) {
                        Column(
                            modifier = Modifier.padding(12.dp).fillMaxSize(),
                            verticalArrangement = Arrangement.SpaceBetween
                        ) {
                            Icon(Icons.Default.Biotech, contentDescription = null, tint = Color(0xFFEC4899))
                            Column {
                                Text("Lab Process Workflow", fontWeight = FontWeight.Bold, fontSize = 12.sp)
                                Text("Sample -> Process -> Publish Report", fontSize = 10.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                        }
                    }
                }

                Card(
                    modifier = Modifier.weight(1f).height(100.dp),
                    shape = RoundedCornerShape(12.dp),
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                    onClick = { navController.navigate(NavRoutes.BillingScreen) }
                ) {
                    Column(
                        modifier = Modifier.padding(12.dp).fillMaxSize(),
                        verticalArrangement = Arrangement.SpaceBetween
                    ) {
                        Icon(Icons.Default.Receipt, contentDescription = null, tint = Color(0xFF10B981))
                        Column {
                            Text("Invoices & Rx Fee", fontWeight = FontWeight.Bold, fontSize = 12.sp)
                            Text("Settled and due billing", fontSize = 10.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                }
            }
            }
        }
    }

    if (showSignOutConfirmDialog) {
        AlertDialog(
            onDismissRequest = { showSignOutConfirmDialog = false },
            title = { Text("Sign Out", fontWeight = FontWeight.Bold) },
            text = { Text("Are you sure you want to sign out from your Doctor Portal account?") },
            confirmButton = {
                Button(
                    onClick = {
                        showSignOutConfirmDialog = false
                        com.dactor.clinic.data.local.UserSessionManager(context).clearSession()
                        clinicRepository?.clearCache()
                        doctorRepository?.clearCache()
                        try {
                            com.google.android.gms.auth.api.signin.GoogleSignIn.getClient(
                                context,
                                com.google.android.gms.auth.api.signin.GoogleSignInOptions.DEFAULT_SIGN_IN
                            ).signOut()
                            com.google.firebase.auth.FirebaseAuth.getInstance().signOut()
                        } catch (ignored: Exception) {}
                        navController.navigate(NavRoutes.ClinicLogin) {
                            popUpTo(0) { inclusive = true }
                        }
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.error)
                ) {
                    Text("Sign Out")
                }
            },
            dismissButton = {
                OutlinedButton(onClick = { showSignOutConfirmDialog = false }) {
                    Text("Cancel")
                }
            }
        )
    }

    if (showSettingsDialog) {
        val labSpecializations = listOf(
            "MRI Specialist & Radiographer",
            "CT Scan Specialist & Technologist",
            "Digital X-Ray Technologist",
            "Ultrasound (USG) Sonographer",
            "Medical Lab Technician (MLT)",
            "Pathology & Hematology Specialist",
            "Clinical Biochemistry Technician",
            "Microbiology Lab Technician",
            "ECG & Echo Technician",
            "Phlebotomist & Sample Collector",
            "Histopathology & Cytology Technician"
        )
        val labTechQualifications = listOf(
            "CMLT (Certificate in Medical Lab Technology)",
            "DMLT (Diploma in Medical Lab Technology)",
            "BMLT / B.Sc. MLT (Bachelor in Medical Lab Technology)",
            "M.Sc. MLT / Clinical Biochemistry",
            "M.Sc. Medical Microbiology",
            "PCL in Medical Lab Technology",
            "Certified Phlebotomy & Lab Technician"
        )
        val doctorQualifications = if (masterQualificationsList.isNotEmpty()) {
            masterQualificationsList.map { it.degreeName }
        } else {
            listOf(
                "MBBS",
                "MD - Internal Medicine",
                "MS - General Surgery",
                "BDS",
                "MDS",
                "DM - Cardiology",
                "MCh - Neurosurgery",
                "MD - Pediatrics",
                "DNB",
                "FRCS",
                "MRCP",
                "BAMS",
                "BHMS",
                "BPT"
            )
        }

        val cleanEditPersonal = editPersonalPhone.filter { it.isDigit() }
        val cleanEditPublic = editPublicPhone.filter { it.isDigit() }
        val parsedEditAge = editAge.trim().toIntOrNull()
        val isEditNameError = editName.isNotBlank() && editName.trim().length < 3
        val isEditAgeError = editAge.isNotBlank() && (parsedEditAge == null || parsedEditAge !in 20..100)
        val isEditPersonalPhoneError = editPersonalPhone.isNotBlank() && (cleanEditPersonal.length != 10 || !cleanEditPersonal.startsWith("9"))
        val isEditPublicPhoneError = editPublicPhone.isNotBlank() && (cleanEditPublic.length != 10 || !cleanEditPublic.startsWith("9"))

        AlertDialog(
            onDismissRequest = { showSettingsDialog = false },
            title = {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Icon(Icons.Default.Settings, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
                    Text(
                        if (editPractitionerRole == "lab_technician") "Lab Technician Profile" else "Doctor Profile & Settings",
                        fontWeight = FontWeight.Bold
                    )
                }
            },
            text = {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .heightIn(max = 500.dp)
                        .verticalScroll(rememberScrollState()),
                    verticalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    if (profileMessage != null) {
                        Surface(
                            color = Color(0xFFD1FAE5),
                            shape = RoundedCornerShape(8.dp),
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Text(
                                text = profileMessage ?: "",
                                color = Color(0xFF065F46),
                                modifier = Modifier.padding(10.dp),
                                fontSize = 12.sp,
                                fontWeight = FontWeight.SemiBold
                            )
                        }
                    }

                    // 0. Practitioner Role (Doctor vs Lab Technician)
                    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        Text("Practitioner Role *", fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            FilterChip(
                                selected = editPractitionerRole == "doctor",
                                onClick = {
                                    editPractitionerRole = "doctor"
                                    if (editSpecialty.isBlank() || editSpecialty in labSpecializations || editSpecialty.contains("Technician", ignoreCase = true) || editSpecialty.contains("MLT", ignoreCase = true)) {
                                        editSpecialty = if (masterSpecialtiesList.isNotEmpty()) {
                                            masterSpecialtiesList.firstOrNull { it.category != "system_config" && it.name.startsWith("General", ignoreCase = true) }?.name
                                                ?: masterSpecialtiesList.firstOrNull { it.category != "system_config" }?.name
                                                ?: "General Medicine & Physician"
                                        } else {
                                            "General Medicine & Physician"
                                        }
                                    }
                                    if (editEducation in labTechQualifications || editEducation.isBlank()) {
                                        editEducation = doctorQualifications.firstOrNull() ?: "MBBS"
                                    }
                                },
                                label = { Text("Doctor", fontSize = 12.sp, fontWeight = FontWeight.SemiBold) },
                                leadingIcon = {
                                    Icon(Icons.Default.MedicalServices, contentDescription = null, modifier = Modifier.size(15.dp))
                                },
                                modifier = Modifier.weight(1f)
                            )
                            FilterChip(
                                selected = editPractitionerRole == "lab_technician",
                                onClick = {
                                    editPractitionerRole = "lab_technician"
                                    if (editSpecialty.isBlank() || editSpecialty !in labSpecializations) {
                                        editSpecialty = "Medical Lab Technician (MLT)"
                                    }
                                    if (editEducation !in labTechQualifications) {
                                        editEducation = labTechQualifications.first()
                                    }
                                },
                                label = { Text("Lab Technician", fontSize = 12.sp, fontWeight = FontWeight.SemiBold) },
                                leadingIcon = {
                                    Icon(Icons.Default.Biotech, contentDescription = null, modifier = Modifier.size(15.dp))
                                },
                                modifier = Modifier.weight(1f)
                            )
                        }
                    }


                    // 1. Full Name
                    OutlinedTextField(
                        value = editName,
                        onValueChange = { editName = it },
                        label = { Text("Full Name with Title *") },
                        placeholder = {
                            Text(
                                if (editPractitionerRole == "lab_technician") "e.g. Tech. Suman Thapa"
                                else "e.g. Dr. Ram Bahadur Sharma"
                            )
                        },
                        leadingIcon = { Icon(Icons.Default.Person, contentDescription = null) },
                        isError = isEditNameError,
                        supportingText = if (isEditNameError) {
                            { Text("Required: Name must be at least 3 characters", color = MaterialTheme.colorScheme.error, fontSize = 11.sp) }
                        } else null,
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(10.dp)
                    )

                    // 2. Gender
                    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Text("Gender *", fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            listOf("Male", "Female", "Other").forEach { g ->
                                FilterChip(
                                    selected = editGender == g,
                                    onClick = { editGender = g },
                                    label = { Text(g, fontSize = 11.sp) }
                                )
                            }
                        }
                    }

                    // 3. Age & Starting Practicing Year
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        OutlinedTextField(
                            value = editAge,
                            onValueChange = {
                                if (it.length <= 3 && it.all { ch -> ch.isDigit() }) editAge = it
                            },
                            label = { Text("Age") },
                            placeholder = { Text("e.g. 38") },
                            leadingIcon = { Icon(Icons.Default.Cake, contentDescription = null) },
                            isError = isEditAgeError,
                            supportingText = if (isEditAgeError) {
                                { Text("Age: 20-100", color = MaterialTheme.colorScheme.error, fontSize = 10.sp) }
                            } else null,
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                            singleLine = true,
                            modifier = Modifier.weight(1f),
                            shape = RoundedCornerShape(10.dp)
                        )

                        // Dropbox for doctor starting practicing year
                        ExposedDropdownMenuBox(
                            expanded = editStartingYearDropdownExpanded,
                            onExpandedChange = { editStartingYearDropdownExpanded = !editStartingYearDropdownExpanded },
                            modifier = Modifier.weight(1f)
                        ) {
                            OutlinedTextField(
                                value = editStartingYear,
                                onValueChange = {},
                                readOnly = true,
                                label = { Text("Practicing Since") },
                                placeholder = { Text("Select year") },
                                leadingIcon = { Icon(Icons.Default.CalendarToday, contentDescription = null) },
                                trailingIcon = {
                                    ExposedDropdownMenuDefaults.TrailingIcon(expanded = editStartingYearDropdownExpanded)
                                },
                                singleLine = true,
                                modifier = Modifier
                                    .menuAnchor()
                                    .fillMaxWidth(),
                                shape = RoundedCornerShape(10.dp)
                            )

                            ExposedDropdownMenu(
                                expanded = editStartingYearDropdownExpanded,
                                onDismissRequest = { editStartingYearDropdownExpanded = false }
                            ) {
                                practicingYears.forEach { yr ->
                                    DropdownMenuItem(
                                        text = {
                                            Text(
                                                text = yr,
                                                fontSize = 13.sp,
                                                fontWeight = if (editStartingYear == yr) FontWeight.Bold else FontWeight.Normal
                                            )
                                        },
                                        onClick = {
                                            editStartingYear = yr
                                            editStartingYearDropdownExpanded = false
                                        }
                                    )
                                }
                            }
                        }
                    }

                    // 4. Picture Upload
                    Surface(
                        shape = RoundedCornerShape(10.dp),
                        color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f),
                        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Row(
                            modifier = Modifier.padding(10.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.SpaceBetween
                        ) {
                            Column(modifier = Modifier.weight(1f)) {
                                Text("Profile Picture / Avatar", fontWeight = FontWeight.SemiBold, fontSize = 12.sp)
                                Text(
                                    text = editPictureName ?: "No picture uploaded",
                                    fontSize = 11.sp,
                                    color = if (editPictureName != null) Color(0xFF047857) else MaterialTheme.colorScheme.onSurfaceVariant
                                )
                            }

                            OutlinedButton(
                                onClick = { editPictureLauncher.launch("image/*") },
                                shape = RoundedCornerShape(8.dp),
                                contentPadding = PaddingValues(horizontal = 10.dp, vertical = 6.dp),
                                modifier = Modifier.defaultMinSize(minHeight = 36.dp)
                            ) {
                                Icon(Icons.Default.PhotoCamera, contentDescription = null, modifier = Modifier.size(14.dp))
                                Spacer(Modifier.width(4.dp))
                                Text(if (editPictureName != null) "Change" else "Upload", fontSize = 11.sp)
                            }
                        }
                    }

                    // 5. Specialization
                    Text("Specialization *", fontWeight = FontWeight.SemiBold, fontSize = 12.sp)

                    val isLabContext = editPractitionerRole == "lab_technician"
                    val specOptions = if (isLabContext) {
                        labSpecializations
                    } else if (masterSpecialtiesList.isNotEmpty()) {
                        masterSpecialtiesList
                            .filter { it.category != "system_config" && !it.name.startsWith("system_config") }
                            .map { it.name }
                    } else {
                        listOf(
                            "General Medicine & Physician",
                            "General Physician & Medicine",
                            "Dermatologist (Skin & Hair)",
                            "Cardiologist (Heart Care)",
                            "Pediatrician (Child Health)",
                            "Orthopedic Surgeon & Joint Care",
                            "Gynecology & Obstetrics",
                            "ENT Specialist (Ear, Nose, Throat)",
                            "Ophthalmology (Eye Care)",
                            "Dental Care & Dentistry",
                            "Neurology (Brain & Nerve)",
                            "Psychiatry & Mental Health",
                            "Gastroenterology & Liver",
                            "Pulmonology (Chest & Lungs)",
                            "Urology & Kidney Care"
                        )
                    }

                    ExposedDropdownMenuBox(
                        expanded = editSpecialtyDropdownExpanded,
                        onExpandedChange = { editSpecialtyDropdownExpanded = !editSpecialtyDropdownExpanded },
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        OutlinedTextField(
                            value = editSpecialty,
                            onValueChange = {},
                            readOnly = true,
                            label = {
                                Text(
                                    if (isLabContext) "Lab Specialization"
                                    else "Medical Specialty"
                                )
                            },
                            placeholder = {
                                Text(
                                    if (isLabContext) "Select lab specialization"
                                    else "Select medical specialty"
                                )
                            },
                            leadingIcon = {
                                Icon(
                                    imageVector = if (isLabContext) Icons.Default.Biotech else Icons.Default.MedicalServices,
                                    contentDescription = null
                                )
                            },
                            trailingIcon = {
                                ExposedDropdownMenuDefaults.TrailingIcon(expanded = editSpecialtyDropdownExpanded)
                            },
                            singleLine = true,
                            modifier = Modifier
                                .menuAnchor()
                                .fillMaxWidth(),
                            shape = RoundedCornerShape(10.dp)
                        )

                        ExposedDropdownMenu(
                            expanded = editSpecialtyDropdownExpanded,
                            onDismissRequest = { editSpecialtyDropdownExpanded = false }
                        ) {
                            specOptions.forEach { spec ->
                                val isSelected = editSpecialty == spec ||
                                    (editSpecialty.isNotBlank() && (
                                        spec.equals(editSpecialty, ignoreCase = true) ||
                                        (editSpecialty.startsWith("General", ignoreCase = true) && spec.startsWith("General", ignoreCase = true)) ||
                                        (editSpecialty.contains("Lab Technician", ignoreCase = true) && spec.contains("Lab Technician", ignoreCase = true))
                                    ))
                                DropdownMenuItem(
                                    text = {
                                        Text(
                                            text = spec,
                                            fontSize = 12.sp,
                                            fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Normal
                                        )
                                    },
                                    onClick = {
                                        editSpecialty = spec
                                        editSpecialtyDropdownExpanded = false
                                    },
                                    leadingIcon = {
                                        Icon(
                                            imageVector = if (isLabContext) Icons.Default.Biotech else Icons.Default.MedicalServices,
                                            contentDescription = null,
                                            modifier = Modifier.size(15.dp),
                                            tint = if (isSelected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant
                                        )
                                    }
                                )
                            }
                        }
                    }

                    // 6. Education / Qualifications (Dropdown / Dropbox instead of scroll buttons)
                    Text("Education / Qualifications *", fontWeight = FontWeight.SemiBold, fontSize = 12.sp)

                    val qualOptions = if (editPractitionerRole == "lab_technician") {
                        labTechQualifications
                    } else {
                        doctorQualifications
                    }

                    ExposedDropdownMenuBox(
                        expanded = editEducationDropdownExpanded,
                        onExpandedChange = { editEducationDropdownExpanded = !editEducationDropdownExpanded },
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        OutlinedTextField(
                            value = editEducation,
                            onValueChange = { editEducation = it },
                            label = {
                                Text(
                                    if (editPractitionerRole == "lab_technician") "Lab Technician Qualification"
                                    else "Medical Degree / Qualification"
                                )
                            },
                            placeholder = {
                                Text(
                                    if (editPractitionerRole == "lab_technician") "Select Lab Technician Qualification"
                                    else "Select Medical Qualification"
                                )
                            },
                            leadingIcon = { Icon(Icons.Default.School, contentDescription = null) },
                            trailingIcon = {
                                ExposedDropdownMenuDefaults.TrailingIcon(expanded = editEducationDropdownExpanded)
                            },
                            singleLine = true,
                            modifier = Modifier
                                .menuAnchor()
                                .fillMaxWidth(),
                            shape = RoundedCornerShape(10.dp)
                        )

                        ExposedDropdownMenu(
                            expanded = editEducationDropdownExpanded,
                            onDismissRequest = { editEducationDropdownExpanded = false }
                        ) {
                            qualOptions.forEach { qual ->
                                DropdownMenuItem(
                                    text = {
                                        Text(
                                            text = qual,
                                            fontSize = 12.sp,
                                            fontWeight = if (editEducation == qual) FontWeight.Bold else FontWeight.Normal
                                        )
                                    },
                                    onClick = {
                                        editEducation = qual
                                        editEducationDropdownExpanded = false
                                    },
                                    leadingIcon = {
                                        Icon(
                                            imageVector = if (editPractitionerRole == "lab_technician") Icons.Default.Biotech else Icons.Default.School,
                                            contentDescription = null,
                                            modifier = Modifier.size(15.dp),
                                            tint = if (editEducation == qual) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant
                                        )
                                    }
                                )
                            }
                        }
                    }

                    // 7. NMC / NHPC License ID
                    OutlinedTextField(
                        value = editNmc,
                        onValueChange = { editNmc = it },
                        label = {
                            Text(
                                if (editPractitionerRole == "lab_technician") "NHPC / Lab Council License ID"
                                else "NMC License ID"
                            )
                        },
                        placeholder = {
                            Text(
                                if (editPractitionerRole == "lab_technician") "e.g. NHPC-A-4520"
                                else "e.g. NMC-14520"
                            )
                        },
                        leadingIcon = { Icon(Icons.Default.Badge, contentDescription = null) },
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(10.dp)
                    )

                    // 8. Personal Mobile Number
                    OutlinedTextField(
                        value = editPersonalPhone,
                        onValueChange = {
                            if (it.length <= 10 && it.all { ch -> ch.isDigit() }) editPersonalPhone = it
                        },
                        label = { Text("Personal Mobile Number") },
                        placeholder = { Text("98xxxxxxxx (10 digits)") },
                        leadingIcon = { Icon(Icons.Default.PhoneIphone, contentDescription = null) },
                        isError = isEditPersonalPhoneError,
                        supportingText = if (isEditPersonalPhoneError) {
                            { Text("Must be 10 digits starting with 9", color = MaterialTheme.colorScheme.error, fontSize = 10.sp) }
                        } else null,
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone),
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(10.dp)
                    )

                    // 9. Public Mobile Number
                    OutlinedTextField(
                        value = editPublicPhone,
                        onValueChange = {
                            if (it.length <= 10 && it.all { ch -> ch.isDigit() }) editPublicPhone = it
                        },
                        label = { Text("Public Mobile Number (For Patients)") },
                        placeholder = { Text("98xxxxxxxx (10 digits)") },
                        leadingIcon = { Icon(Icons.Default.Phone, contentDescription = null) },
                        isError = isEditPublicPhoneError,
                        supportingText = if (isEditPublicPhoneError) {
                            { Text("Must be 10 digits starting with 9", color = MaterialTheme.colorScheme.error, fontSize = 10.sp) }
                        } else null,
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone),
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(10.dp)
                    )

                    // 10. Description
                    OutlinedTextField(
                        value = editDescription,
                        onValueChange = { editDescription = it },
                        label = { Text("Description / Bio") },
                        placeholder = { Text("Special clinical interests, background...") },
                        maxLines = 3,
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(10.dp)
                    )
                }
            },
            confirmButton = {
                Button(
                    onClick = {
                        val targetDoc = doctor
                        if (targetDoc != null && doctorRepository != null) {
                            isSavingProfile = true
                            coroutineScope.launch {
                                val feeDouble = targetDoc.consultationFee ?: 500.0
                                val ageInt = editAge.toIntOrNull()
                                val yearInt = editStartingYear.toIntOrNull()
                                val picUrl = if (editPictureUri != null) {
                                    try {
                                        val bytes = context.contentResolver.openInputStream(editPictureUri!!)?.use { it.readBytes() }
                                        if (bytes != null) {
                                            val resolvedName = com.dactor.clinic.domain.util.FileCompressor.resolveRealFileName(
                                                context = context,
                                                uri = editPictureUri!!,
                                                rawBytes = bytes,
                                                defaultBaseName = "doctor_photo"
                                            )
                                            val cleanPicName = resolvedName.replace("\\s+".toRegex(), "_")
                                            val fileName = "doc_${targetDoc.id}_${System.currentTimeMillis()}_$cleanPicName"
                                            doctorRepository.uploadProfilePicture(fileName, bytes) ?: targetDoc.profilePictureUrl
                                        } else targetDoc.profilePictureUrl
                                    } catch (e: Exception) {
                                        targetDoc.profilePictureUrl
                                    }
                                } else {
                                    targetDoc.profilePictureUrl
                                }

                                val resolvedSpecialty = editSpecialty.trim().ifBlank {
                                    if (editPractitionerRole == "lab_technician") "Medical Lab Technician (MLT)" else "General Medicine & Physician"
                                }

                                doctorRepository.updateDoctorFullProfile(
                                    id = targetDoc.id,
                                    fullName = editName.trim(),
                                    gender = editGender,
                                    age = ageInt,
                                    startingYear = yearInt,
                                    pictureUrl = picUrl,
                                    specialty = resolvedSpecialty,
                                    education = editEducation.trim().ifBlank { null },
                                    nmcLicenseNumber = editNmc.trim().ifBlank { null },
                                    personalMobile = editPersonalPhone.trim().ifBlank { null },
                                    publicMobile = editPublicPhone.trim().ifBlank { null },
                                    description = editDescription.trim().ifBlank { null },
                                    consultationFee = feeDouble,
                                    practitionerRole = editPractitionerRole
                                )

                                doctor = targetDoc.copy(
                                    fullName = editName.trim(),
                                    gender = editGender,
                                    age = ageInt,
                                    startingPracticingYear = yearInt,
                                    profilePictureUrl = picUrl,
                                    specialty = resolvedSpecialty,
                                    specialties = listOf(resolvedSpecialty),
                                    education = editEducation.trim().ifBlank { null },
                                    nmcLicenseNumber = editNmc.trim().ifBlank { null },
                                    personalMobileNumber = editPersonalPhone.trim().ifBlank { null },
                                    publicMobileNumber = editPublicPhone.trim().ifBlank { null },
                                    description = editDescription.trim().ifBlank { null },
                                    consultationFee = feeDouble,
                                    practitionerRole = editPractitionerRole
                                )
                                isSavingProfile = false
                                profileMessage = "Profile updated successfully!"
                            }
                        }
                    },
                    enabled = !isSavingProfile && !isEditNameError && !isEditAgeError && !isEditPersonalPhoneError && !isEditPublicPhoneError,
                    shape = RoundedCornerShape(8.dp)
                ) {
                    Text(if (isSavingProfile) "Saving..." else "Save Changes")
                }
            },
            dismissButton = {
                TextButton(onClick = { showSettingsDialog = false }) {
                    Text("Close")
                }
            }
        )
    }
}
