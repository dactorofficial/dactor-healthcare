package com.dactor.clinic.ui.dashboard

import android.widget.Toast
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.*
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import coil.compose.AsyncImage
import coil.compose.SubcomposeAsyncImage
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.navigation.NavController
import com.dactor.clinic.data.local.UserSessionManager
import com.dactor.clinic.data.model.Clinic
import com.dactor.clinic.data.model.Doctor
import com.dactor.clinic.data.repository.ClinicRepository
import com.dactor.clinic.data.repository.DoctorRepository
import com.dactor.clinic.domain.util.ArchiveDateUtils
import com.dactor.clinic.ui.navigation.NavRoutes
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DashboardScreen(
    navController: NavController,
    clinicId: String? = null,
    clinicRepository: ClinicRepository? = null,
    doctorRepository: DoctorRepository? = null,
    authRepository: com.dactor.clinic.data.repository.AuthRepository? = null,
    appointmentRepository: com.dactor.clinic.data.repository.AppointmentRepository? = null
) {
    val context = LocalContext.current
    val sessionManager = remember { UserSessionManager(context) }
    val initialEffectiveClinicId = remember(clinicId) {
        if (!clinicId.isNullOrBlank() && clinicId != "c1") clinicId
        else sessionManager.getSavedClinicId() ?: ""
    }
    var clinic by remember(initialEffectiveClinicId) {
        mutableStateOf<Clinic?>(
            if (initialEffectiveClinicId.isNotBlank()) {
                clinicRepository?.getCachedClinicById(initialEffectiveClinicId)
                    ?: clinicRepository?.getLastCachedClinic()
                    ?: sessionManager.getLastCachedClinicJson()?.let {
                        try {
                            kotlinx.serialization.json.Json { ignoreUnknownKeys = true; isLenient = true }
                                .decodeFromString<Clinic>(it)
                        } catch (_: Exception) { null }
                    }
                    ?: Clinic(
                        id = initialEffectiveClinicId,
                        name = sessionManager.getSavedName()?.takeIf { it.isNotBlank() } ?: "Clinic Dashboard",
                        contactEmail = sessionManager.getSavedEmail(),
                        addressText = "Offline Mode \u2022 Local Operations Active",
                        isActivated = true
                    )
            } else null
        )
    }
    val initialCachedDoctors = remember(initialEffectiveClinicId) {
        if (initialEffectiveClinicId.isNotBlank()) {
            doctorRepository?.getCachedDoctorsByClinic(initialEffectiveClinicId)?.takeIf { it.isNotEmpty() }
        } else null
    } ?: doctorRepository?.getLastCachedDoctors() ?: emptyList()

    var doctors by remember(initialEffectiveClinicId) {
        mutableStateOf<List<Doctor>>(initialCachedDoctors)
    }
    var isDoctorsLoading by remember { mutableStateOf(initialCachedDoctors.isEmpty()) }
    var isLoading by remember { mutableStateOf(clinic == null) }
    var isRestoringAccount by remember { mutableStateOf(false) }
    var pendingPayAtDeskCount by remember { mutableIntStateOf(0) }

    val isLabClinic = remember(clinic) {
        clinic?.type?.equals("diagnostic_lab", ignoreCase = true) == true ||
        clinic?.type?.contains("lab", ignoreCase = true) == true ||
        clinic?.name?.contains("lab", ignoreCase = true) == true ||
        clinic?.specialties?.any { it.contains("lab", ignoreCase = true) || it.contains("patholog", ignoreCase = true) } == true
    }

    // Activation & License Subscription state
    var showRenewalDialog by remember { mutableStateOf(false) }
    var selectedPlan by remember { mutableStateOf("1_month") } // "1_month" or "12_month"
    var paymentTransactionNote by remember { mutableStateOf("") }
    var isSubmittingPayment by remember { mutableStateOf(false) }
    var renewalSubmittedMessage by remember { mutableStateOf<String?>(null) }

    val coroutineScope = rememberCoroutineScope()
    val scrollState = rememberScrollState()

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

    fun loadClinic() {
        coroutineScope.launch {
            if (clinicRepository != null) {
                val sessionClinicId = sessionManager.getSavedClinicId()
                val targetCid = when {
                    !clinicId.isNullOrBlank() && clinicId != "c1" -> clinicId
                    !sessionClinicId.isNullOrBlank() -> sessionClinicId
                    else -> ""
                }
                if (targetCid.isBlank()) {
                    sessionManager.awaitIdentityResolved(timeoutMs = 1500)
                }
                val currentEmail = authRepository?.getCurrentUserEmail() ?: sessionManager.getSavedEmail()
                val resolvedCid = targetCid.ifBlank { sessionManager.getSavedClinicId() ?: "" }

                // Fetch doctors concurrently with clinic so there is zero sequential delay
                val earlyDocsJob = if (resolvedCid.isNotBlank() && doctorRepository != null) {
                    launch {
                        val liveDocs = doctorRepository.getDoctorsByClinic(resolvedCid)
                        if (liveDocs.isNotEmpty() || doctors.isEmpty()) {
                            doctors = liveDocs
                        }
                        isDoctorsLoading = false
                    }
                } else null

                val fetchedClinic = if (resolvedCid.isNotBlank()) {
                    clinicRepository.getClinicById(resolvedCid)
                } else if (!currentEmail.isNullOrBlank()) {
                    clinicRepository.getClinicByEmail(currentEmail)
                } else {
                    null
                }
                if (fetchedClinic != null) {
                    clinic = fetchedClinic
                    try {
                        val serialized = kotlinx.serialization.json.Json { ignoreUnknownKeys = true; isLenient = true }.encodeToString(Clinic.serializer(), fetchedClinic)
                        sessionManager.saveCachedClinicJson(serialized)
                    } catch (_: Exception) {}
                } else if (clinic == null && resolvedCid.isNotBlank()) {
                    val fallback = clinicRepository.getCachedClinicById(resolvedCid)
                        ?: clinicRepository.getLastCachedClinic()
                        ?: sessionManager.getLastCachedClinicJson()?.let {
                            try {
                                kotlinx.serialization.json.Json { ignoreUnknownKeys = true; isLenient = true }
                                    .decodeFromString<Clinic>(it)
                            } catch (_: Exception) { null }
                        }
                        ?: Clinic(
                            id = resolvedCid,
                            name = sessionManager.getSavedName()?.takeIf { it.isNotBlank() } ?: "Clinic Dashboard",
                            contactEmail = sessionManager.getSavedEmail() ?: currentEmail,
                            addressText = "Offline Mode \u2022 Local Operations Active",
                            isActivated = true
                        )
                    clinic = fallback
                }

                if (fetchedClinic != null) {
                    sessionManager.saveClinicSession(
                        fetchedClinic.id,
                        fetchedClinic.contactEmail ?: currentEmail ?: "",
                        fetchedClinic.name
                    )
                    sessionManager.setClinicArchivedStatus(
                        fetchedClinic.isArchived ?: false,
                        fetchedClinic.deletionScheduledAt
                    )

                    // If archived and passed 30 days -> Purge patient data
                    if (fetchedClinic.isArchived == true) {
                        val days = ArchiveDateUtils.calculateDaysRemaining(fetchedClinic.deletionScheduledAt)
                        if (days <= 0) {
                            try {
                                clinicRepository.purgeExceededArchivedClinicData(fetchedClinic.id)
                            } catch (e: Exception) {
                                e.printStackTrace()
                            }
                        }
                    }
                }

                if (fetchedClinic != null && doctorRepository != null && earlyDocsJob == null) {
                    val liveDocs = doctorRepository.getDoctorsByClinic(fetchedClinic.id)
                    if (liveDocs.isNotEmpty() || doctors.isEmpty()) {
                        doctors = liveDocs
                    }
                    isDoctorsLoading = false
                }
                earlyDocsJob?.join()
                isDoctorsLoading = false
            }
            isLoading = false
            isDoctorsLoading = false
        }
    }

    // Track recently toggled doctor IDs with a timestamp debounce so background poll doesn't reverse user clicks
    var pendingToggleDoctors by remember { mutableStateOf<Map<String, Long>>(emptyMap()) }

    LaunchedEffect(initialEffectiveClinicId) {
        loadClinic()
        // Periodic live presence sync loop:
        // Automatically reflects whenever a doctor is toggled in another clinic or by the doctor themselves
        while (isActive) {
            delay(3500L)
            val currentCid = clinic?.id ?: sessionManager.getSavedClinicId()
            if (!currentCid.isNullOrBlank() && doctorRepository != null) {
                try {
                    val liveDocs = doctorRepository.getDoctorsByClinic(currentCid)
                    val now = System.currentTimeMillis()
                    val activePending = pendingToggleDoctors.filterValues { now - it < 4500L }
                    pendingToggleDoctors = activePending
                    
                    if (activePending.isEmpty()) {
                        doctors = liveDocs
                    } else {
                        // Merge liveDocs while preserving optimistic local state for doctors toggled in the last 4.5 seconds
                        doctors = liveDocs.map { liveDoc ->
                            if (activePending.containsKey(liveDoc.id)) {
                                val currentDoc = doctors.find { it.id == liveDoc.id }
                                if (currentDoc != null) liveDoc.copy(isInClinic = currentDoc.isInClinic) else liveDoc
                            } else {
                                liveDoc
                            }
                        }
                    }

                    if (appointmentRepository != null) {
                        try {
                            pendingPayAtDeskCount = appointmentRepository.getPendingPayAtDeskCount(currentCid)
                        } catch (_: Exception) {}
                    }
                } catch (e: Exception) {
                    // ignore polling errors
                }
            }
        }
    }

    val isClinicArchived = clinic?.isArchived == true || sessionManager.isClinicArchived()
    val deletionScheduledAt = clinic?.deletionScheduledAt ?: sessionManager.getClinicDeletionScheduledAt()
    val daysRemaining = ArchiveDateUtils.calculateDaysRemaining(deletionScheduledAt)
    val formattedDeletionDate = ArchiveDateUtils.formatScheduledDeletionDate(deletionScheduledAt)

    val isClinicActivated = clinic == null || ArchiveDateUtils.isClinicActivationValid(clinic?.isActivated, clinic?.activationExpiresAt)
    val activationDaysLeft = ArchiveDateUtils.calculateActivationDaysLeft(clinic?.activationExpiresAt)
    val formattedActivationExpiry = ArchiveDateUtils.formatActivationExpiryDate(clinic?.activationExpiresAt)

    val displayClinicTitle = if (isClinicArchived) "Clinic Deletion Archive" else if (!isClinicActivated) "Clinic Portal Locked" else (clinic?.name ?: "Clinic Administration Portal")
    val displayClinicSubtitle = if (isClinicArchived) "Operations Suspended \u2022 30-Day Archive" else if (!isClinicActivated) "License Subscription Required" else (clinic?.addressText ?: "Nepal Healthcare Operations & Queue Management")

    Scaffold(
        topBar = {
            if (isClinicArchived || !isClinicActivated) {
                TopAppBar(
                    title = {
                        Column {
                            Text(displayClinicTitle, fontWeight = FontWeight.Bold, fontSize = 17.sp, maxLines = 1)
                            Text(displayClinicSubtitle, fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1)
                        }
                    },
                    actions = {
                        IconButton(
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
                            }
                        ) {
                            Icon(Icons.AutoMirrored.Filled.ExitToApp, contentDescription = "Sign Out", tint = MaterialTheme.colorScheme.error)
                        }
                    }
                )
            }
        }
    ) { padding ->

        if (isClinicArchived) {
            // =========================================================================
            // 30-DAY ARCHIVE VIEW: LOCKED OUT FROM PORTAL & CANNOT VIEW DATA
            // =========================================================================
            if (daysRemaining <= 0) {
                // Purged Exceeded Screen
                Column(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(padding)
                        .padding(24.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.Center
                ) {
                    Surface(
                        shape = CircleShape,
                        color = Color(0xFFFEE2E2),
                        modifier = Modifier.size(80.dp)
                    ) {
                        Box(contentAlignment = Alignment.Center) {
                            Icon(Icons.Default.DeleteForever, contentDescription = null, tint = Color(0xFFDC2626), modifier = Modifier.size(42.dp))
                        }
                    }

                    Spacer(Modifier.height(18.dp))

                    Text("Clinic Account Purged", fontWeight = FontWeight.Bold, fontSize = 20.sp, color = Color(0xFF991B1B))
                    Spacer(Modifier.height(8.dp))
                    Text(
                        "This clinic account has exceeded the 30-day archive holding period. All patient records, consultations, diagnostic lab tests, and queue tokens have been permanently wiped from the database.",
                        fontSize = 13.sp,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        textAlign = TextAlign.Center,
                        lineHeight = 18.sp
                    )

                    Spacer(Modifier.height(24.dp))

                    Button(
                        onClick = {
                            sessionManager.clearSession()
                            clinicRepository?.clearCache()
                            doctorRepository?.clearCache()
                            navController.navigate(NavRoutes.ClinicLogin) {
                                popUpTo(0) { inclusive = true }
                            }
                        },
                        shape = RoundedCornerShape(12.dp)
                    ) {
                        Text("Exit to Login")
                    }
                }
            } else {
                // Active Archive Holding Screen
                Column(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(padding)
                        .padding(20.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.Center
                ) {
                    Surface(
                        shape = CircleShape,
                        color = Color(0xFFFEE2E2),
                        modifier = Modifier.size(88.dp)
                    ) {
                        Box(contentAlignment = Alignment.Center) {
                            Icon(Icons.Default.HourglassTop, contentDescription = null, tint = Color(0xFFDC2626), modifier = Modifier.size(46.dp))
                        }
                    }

                    Spacer(Modifier.height(18.dp))

                    Text("Clinic Scheduled for Deletion", fontSize = 20.sp, fontWeight = FontWeight.Bold, color = Color(0xFF991B1B))
                    Spacer(Modifier.height(6.dp))
                    Text(
                        "Your clinic is currently in the 30-day archive holding period. Normal clinic operations and OPD queues are locked.",
                        fontSize = 13.sp,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        textAlign = TextAlign.Center
                    )

                    Spacer(Modifier.height(20.dp))

                    // Countdown Card
                    Card(
                        shape = RoundedCornerShape(18.dp),
                        colors = CardDefaults.cardColors(containerColor = Color(0xFFFEF2F2)),
                        border = BorderStroke(1.dp, Color(0xFFFECACA)),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Column(
                            modifier = Modifier.padding(20.dp),
                            horizontalAlignment = Alignment.CenterHorizontally,
                            verticalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            Text("ARCHIVE COUNTDOWN", fontSize = 11.sp, fontWeight = FontWeight.Bold, color = Color(0xFFB91C1C), letterSpacing = 1.sp)
                            Text("$daysRemaining Days Left", fontSize = 32.sp, fontWeight = FontWeight.ExtraBold, color = Color(0xFFDC2626))
                            Text("Scheduled purge: $formattedDeletionDate", fontSize = 12.sp, fontWeight = FontWeight.Medium, color = Color(0xFF7F1D1D))
                        }
                    }

                    Spacer(Modifier.height(16.dp))

                    // Patient Purge Notice
                    Surface(
                        shape = RoundedCornerShape(14.dp),
                        color = Color(0xFFFFFBEB),
                        border = BorderStroke(1.dp, Color(0xFFFDE68A)),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Row(
                            modifier = Modifier.padding(14.dp),
                            verticalAlignment = Alignment.Top,
                            horizontalArrangement = Arrangement.spacedBy(10.dp)
                        ) {
                            Icon(Icons.Default.Warning, contentDescription = null, tint = Color(0xFFD97706), modifier = Modifier.size(20.dp))
                            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                                Text("Patient Data Purge Notice", fontWeight = FontWeight.Bold, fontSize = 13.sp, color = Color(0xFF92400E))
                                Text(
                                    "If not cancelled before $formattedDeletionDate, all patient appointment records, consultation files, diagnostic reports, and tokens will be permanently deleted.",
                                    fontSize = 11.sp,
                                    color = Color(0xFF78350F),
                                    lineHeight = 16.sp
                                )
                            }
                        }
                    }

                    Spacer(Modifier.height(26.dp))

                    // Cancel Deletion & Restore Button
                    Button(
                        onClick = {
                            val effClinicId = clinic?.id ?: sessionManager.getSavedClinicId() ?: ""
                            if (effClinicId.isNotBlank() && clinicRepository != null) {
                                isRestoringAccount = true
                                coroutineScope.launch {
                                    val res = clinicRepository.cancelClinicDeletion(effClinicId)
                                    if (res.isSuccess) {
                                        sessionManager.setClinicArchivedStatus(false, null)
                                        loadClinic()
                                    }
                                    isRestoringAccount = false
                                }
                            }
                        },
                        colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF059669)),
                        shape = RoundedCornerShape(14.dp),
                        modifier = Modifier.fillMaxWidth().height(52.dp),
                        enabled = !isRestoringAccount
                    ) {
                        if (isRestoringAccount) {
                            CircularProgressIndicator(color = Color.White, modifier = Modifier.size(20.dp), strokeWidth = 2.dp)
                            Spacer(Modifier.width(8.dp))
                        } else {
                            Icon(Icons.Default.Restore, contentDescription = null, modifier = Modifier.size(20.dp))
                            Spacer(Modifier.width(8.dp))
                        }
                        Text("Cancel Deletion & Restore Clinic Account", fontWeight = FontWeight.Bold, fontSize = 14.sp)
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
                        modifier = Modifier.fillMaxWidth().height(50.dp)
                    ) {
                        Icon(Icons.AutoMirrored.Filled.ExitToApp, contentDescription = null, modifier = Modifier.size(18.dp))
                        Spacer(Modifier.width(8.dp))
                        Text("Log Out from Clinic Account", fontWeight = FontWeight.Bold)
                    }
                }
            }
        } else if (clinic != null && !isClinicActivated) {
            // =========================================================================
            // ACTIVATION LOCK VIEW: CLINIC CANNOT USE ANY FUNCTION UNTIL ACTIVATED
            // =========================================================================
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(padding)
                    .verticalScroll(rememberScrollState())
                    .padding(20.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(16.dp)
            ) {
                Surface(
                    shape = CircleShape,
                    color = Color(0xFFFEF3C7),
                    modifier = Modifier.size(80.dp)
                ) {
                    Box(contentAlignment = Alignment.Center) {
                        Icon(
                            Icons.Default.Lock,
                            contentDescription = null,
                            tint = Color(0xFFD97706),
                            modifier = Modifier.size(42.dp)
                        )
                    }
                }

                Text(
                    text = "Clinic Portal Locked",
                    fontSize = 22.sp,
                    fontWeight = FontWeight.Bold,
                    color = Color(0xFF92400E)
                )

                Text(
                    text = "Your clinic activation license has expired or is inactive. Inactive clinics cannot manage live queues, publish doctor slots, or accept patient bookings.",
                    fontSize = 13.sp,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    textAlign = TextAlign.Center,
                    lineHeight = 18.sp
                )

                // Current Expiry Details Card
                Card(
                    shape = RoundedCornerShape(14.dp),
                    colors = CardDefaults.cardColors(containerColor = Color(0xFFFFFBEB)),
                    border = BorderStroke(1.dp, Color(0xFFFDE68A)),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Column(
                        modifier = Modifier.padding(16.dp),
                        verticalArrangement = Arrangement.spacedBy(6.dp)
                    ) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            Icon(Icons.Default.Info, contentDescription = null, tint = Color(0xFFD97706), modifier = Modifier.size(18.dp))
                            Text("License Status", fontWeight = FontWeight.Bold, fontSize = 13.sp, color = Color(0xFF92400E))
                        }
                        Text(
                            text = "Last Expiry: $formattedActivationExpiry",
                            fontSize = 12.sp,
                            color = Color(0xFF78350F)
                        )
                        Text(
                            text = "Choose an activation package below to renew your portal access and resume clinic operations.",
                            fontSize = 11.sp,
                            color = Color(0xFF92400E)
                        )
                    }
                }

                // Plan Selection
                Text(
                    text = "Select Activation Period",
                    fontWeight = FontWeight.Bold,
                    fontSize = 15.sp,
                    modifier = Modifier.align(Alignment.Start)
                )

                // 1 Month Plan Card
                Card(
                    shape = RoundedCornerShape(14.dp),
                    colors = CardDefaults.cardColors(
                        containerColor = if (selectedPlan == "1_month") MaterialTheme.colorScheme.primaryContainer else MaterialTheme.colorScheme.surface
                    ),
                    border = BorderStroke(
                        if (selectedPlan == "1_month") 2.dp else 1.dp,
                        if (selectedPlan == "1_month") MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.outlineVariant
                    ),
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable { selectedPlan = "1_month" }
                ) {
                    Row(
                        modifier = Modifier.padding(16.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                Text("1 Month Access", fontWeight = FontWeight.Bold, fontSize = 15.sp)
                                Surface(
                                    shape = RoundedCornerShape(6.dp),
                                    color = MaterialTheme.colorScheme.primary.copy(alpha = 0.15f)
                                ) {
                                    Text("30 Days", fontSize = 10.sp, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.primary, modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp))
                                }
                            }
                            Text("Full OPD Queue & Doctor Slot Management", fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                        Text("Rs. 1,500", fontWeight = FontWeight.ExtraBold, fontSize = 16.sp, color = MaterialTheme.colorScheme.primary)
                    }
                }

                // 12 Months Plan Card
                Card(
                    shape = RoundedCornerShape(14.dp),
                    colors = CardDefaults.cardColors(
                        containerColor = if (selectedPlan == "12_month") MaterialTheme.colorScheme.primaryContainer else MaterialTheme.colorScheme.surface
                    ),
                    border = BorderStroke(
                        if (selectedPlan == "12_month") 2.dp else 1.dp,
                        if (selectedPlan == "12_month") MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.outlineVariant
                    ),
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable { selectedPlan = "12_month" }
                ) {
                    Row(
                        modifier = Modifier.padding(16.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                Text("12 Months (1 Year)", fontWeight = FontWeight.Bold, fontSize = 15.sp)
                                Surface(
                                    shape = RoundedCornerShape(6.dp),
                                    color = Color(0xFF059669).copy(alpha = 0.15f)
                                ) {
                                    Text("Save Rs. 3,000", fontSize = 10.sp, fontWeight = FontWeight.Bold, color = Color(0xFF059669), modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp))
                                }
                            }
                            Text("365 Days \u2022 Uninterrupted clinic & patient portal", fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                        Text("Rs. 15,000", fontWeight = FontWeight.ExtraBold, fontSize = 16.sp, color = MaterialTheme.colorScheme.primary)
                    }
                }

                // Payment Instructions Card
                Card(
                    shape = RoundedCornerShape(14.dp),
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f)),
                    border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Column(
                        modifier = Modifier.padding(16.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Text("App Owner Payment Details", fontWeight = FontWeight.Bold, fontSize = 13.sp)
                        Text("Transfer the subscription fee via eSewa, Khalti, or Direct Bank:", fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)

                        Surface(
                            shape = RoundedCornerShape(8.dp),
                            color = Color(0xFFF3F4F6),
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Column(modifier = Modifier.padding(10.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                                Text("\u2022 eSewa / Khalti ID: 9841000000 (Dactor Admin)", fontSize = 12.sp, fontWeight = FontWeight.Medium)
                                Text("\u2022 Bank: Nabil Bank | A/C: 01234567890123", fontSize = 12.sp, fontWeight = FontWeight.Medium)
                                Text("\u2022 Account Holder: Dactor Health Nepal Pvt Ltd", fontSize = 12.sp, fontWeight = FontWeight.Medium)
                            }
                        }
                    }
                }

                // Reference / Transaction Note Field
                OutlinedTextField(
                    value = paymentTransactionNote,
                    onValueChange = { paymentTransactionNote = it },
                    label = { Text("Transaction ID / Payment Reference Note") },
                    placeholder = { Text("e.g. eSewa TxID 9841-ABC or Depositor Name") },
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(12.dp)
                )

                if (renewalSubmittedMessage != null) {
                    Surface(
                        shape = RoundedCornerShape(10.dp),
                        color = Color(0xFFD1FAE5),
                        border = BorderStroke(1.dp, Color(0xFFA7F3D0)),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Text(
                            text = renewalSubmittedMessage ?: "",
                            fontSize = 12.sp,
                            fontWeight = FontWeight.Medium,
                            color = Color(0xFF065F46),
                            modifier = Modifier.padding(12.dp)
                        )
                    }
                }

                // Submit Payment Button
                Button(
                    onClick = {
                        val effClinicId = clinic?.id ?: sessionManager.getSavedClinicId() ?: ""
                        if (effClinicId.isNotBlank() && clinicRepository != null) {
                            isSubmittingPayment = true
                            coroutineScope.launch {
                                val amount = if (selectedPlan == "12_month") 15000.0 else 1500.0
                                val notes = paymentTransactionNote.trim().ifBlank {
                                    "Activation payment for $selectedPlan submitted from clinic app"
                                }
                                val res = clinicRepository.requestActivationRenewal(
                                    clinicId = effClinicId,
                                    plan = selectedPlan,
                                    amount = amount,
                                    notes = notes
                                )
                                isSubmittingPayment = false
                                if (res.isSuccess) {
                                    renewalSubmittedMessage = "Payment details submitted! Admin will verify and activate your portal shortly."
                                    paymentTransactionNote = ""
                                    loadClinic()
                                } else {
                                    renewalSubmittedMessage = "Failed to submit request: ${res.exceptionOrNull()?.message}"
                                }
                            }
                        }
                    },
                    shape = RoundedCornerShape(14.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF059669)),
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(52.dp),
                    enabled = !isSubmittingPayment
                ) {
                    if (isSubmittingPayment) {
                        CircularProgressIndicator(color = Color.White, modifier = Modifier.size(20.dp), strokeWidth = 2.dp)
                        Spacer(Modifier.width(8.dp))
                    } else {
                        Icon(Icons.Default.Payment, contentDescription = null, modifier = Modifier.size(20.dp))
                        Spacer(Modifier.width(8.dp))
                    }
                    Text(
                        text = if (selectedPlan == "12_month") "Submit 12-Month Activation (Rs. 15,000)" else "Submit 1-Month Activation (Rs. 1,500)",
                        fontWeight = FontWeight.Bold,
                        fontSize = 14.sp
                    )
                }

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
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(50.dp)
                ) {
                    Icon(Icons.AutoMirrored.Filled.ExitToApp, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(Modifier.width(8.dp))
                    Text("Log Out from Clinic Account", fontWeight = FontWeight.Bold)
                }
            }
        } else {
            // =========================================================================
            // ACTIVE DASHBOARD VIEW: NORMAL CLINIC OPERATIONS
            // =========================================================================
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(padding)
                    .statusBarsPadding()
                    .verticalScroll(scrollState)
                    .padding(horizontal = 16.dp, vertical = 12.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp)
            ) {
                if (clinic == null && isLoading) {
                    com.dactor.clinic.ui.common.ShimmerListPlaceholder(count = 3)
                } else if (clinic == null && !isLoading && sessionManager.getSavedClinicId().isNullOrBlank()) {
                    Card(
                        shape = RoundedCornerShape(16.dp),
                        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.5f))
                    ) {
                        Column(
                            modifier = Modifier.padding(16.dp),
                            verticalArrangement = Arrangement.spacedBy(10.dp)
                        ) {
                            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                Icon(Icons.Default.AddBusiness, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
                                Text("No Registered Clinic Loaded", fontWeight = FontWeight.Bold, fontSize = 14.sp)
                            }
                            Text(
                                "You are currently signed in as administrator. Register your clinic or hospital branch to configure services, OPD slots, and onboard physicians.",
                                fontSize = 12.sp,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                            Button(
                                onClick = { navController.navigate(NavRoutes.ClinicRegister) },
                                shape = RoundedCornerShape(10.dp)
                            ) {
                                Text("Register Clinic Now")
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
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(48.dp)
                    ) {
                        Icon(Icons.AutoMirrored.Filled.ExitToApp, contentDescription = null, modifier = Modifier.size(18.dp), tint = MaterialTheme.colorScheme.error)
                        Spacer(Modifier.width(8.dp))
                        Text("Sign Out from Clinic Account", fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.error)
                    }
                } else if (clinic != null) {

                // 1. TOP CLINIC IDENTITY HEADER
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(top = 2.dp, bottom = 2.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(12.dp),
                        modifier = Modifier.weight(1f)
                    ) {
                        val clinicThumb = clinic?.pictures?.firstOrNull() ?: clinic?.logoUrl ?: clinic?.registrationDocUrl
                        if (!clinicThumb.isNullOrBlank()) {
                            AsyncImage(
                                model = clinicThumb,
                                contentDescription = clinic?.name ?: "Clinic",
                                contentScale = ContentScale.Crop,
                                modifier = Modifier
                                    .size(56.dp)
                                    .clip(RoundedCornerShape(14.dp))
                            )
                        } else {
                            Surface(
                                shape = RoundedCornerShape(14.dp),
                                color = Color(0xFFF1F5F9),
                                border = BorderStroke(1.dp, Color(0xFFE2E8F0)),
                                modifier = Modifier.size(56.dp)
                            ) {
                                Box(contentAlignment = Alignment.Center) {
                                    Icon(
                                        Icons.Default.LocalHospital,
                                        contentDescription = null,
                                        tint = Color(0xFF0284C7),
                                        modifier = Modifier.size(28.dp)
                                    )
                                }
                            }
                        }

                        Column(
                            verticalArrangement = Arrangement.spacedBy(3.dp),
                            modifier = Modifier.weight(1f)
                        ) {
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(4.dp)
                            ) {
                                Text(
                                    text = clinic?.name ?: "Clinic Administration",
                                    fontWeight = FontWeight.Bold,
                                    fontSize = 17.sp,
                                    color = Color(0xFF0F172A),
                                    maxLines = 1
                                )
                                Icon(
                                    Icons.Default.Verified,
                                    contentDescription = "Verified Clinic",
                                    tint = Color(0xFF2563EB),
                                    modifier = Modifier.size(18.dp)
                                )
                            }
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(3.dp)
                            ) {
                                Icon(
                                    Icons.Default.Place,
                                    contentDescription = null,
                                    tint = Color(0xFF64748B),
                                    modifier = Modifier.size(14.dp)
                                )
                                Text(
                                    text = clinic?.addressText?.ifBlank { "Kathmandu, Nepal" } ?: "Kathmandu, Nepal",
                                    fontSize = 12.sp,
                                    color = Color(0xFF64748B),
                                    maxLines = 1
                                )
                            }
                        }
                    }

                    Spacer(Modifier.width(8.dp))

                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        // Top Right Notification Bell Button
                        Surface(
                            shape = CircleShape,
                            color = Color(0xFFF8FAFC),
                            border = BorderStroke(1.dp, Color(0xFFE2E8F0)),
                            modifier = Modifier
                                .size(38.dp)
                                .clickable { navController.navigate(NavRoutes.Notifications) }
                        ) {
                            Box(contentAlignment = Alignment.Center) {
                                Icon(
                                    imageVector = Icons.Default.Notifications,
                                    contentDescription = "Notifications",
                                    tint = Color(0xFF1E293B),
                                    modifier = Modifier.size(19.dp)
                                )
                            }
                        }

                        // Top Right Subscription Badge (Clickable to open Renewal Dialog / Page)
                        Surface(
                            shape = RoundedCornerShape(16.dp),
                            color = Color(0xFFDCFCE7),
                            border = BorderStroke(1.dp, Color(0xFFA7F3D0)),
                            modifier = Modifier.clickable { showRenewalDialog = true }
                        ) {
                            Row(
                                modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(6.dp)
                            ) {
                                Box(
                                    modifier = Modifier
                                        .size(7.dp)
                                        .clip(CircleShape)
                                        .background(Color(0xFF16A34A))
                                )
                                Column {
                                    Text(
                                        text = "Active",
                                        fontSize = 11.sp,
                                        fontWeight = FontWeight.Bold,
                                        color = Color(0xFF15803D),
                                        lineHeight = 13.sp
                                    )
                                    Row(
                                        verticalAlignment = Alignment.CenterVertically,
                                        horizontalArrangement = Arrangement.spacedBy(2.dp)
                                    ) {
                                        Text(
                                            text = "$activationDaysLeft days left",
                                            fontSize = 10.sp,
                                            color = Color(0xFF166534),
                                            lineHeight = 12.sp
                                        )
                                        Icon(
                                            Icons.Default.ChevronRight,
                                            contentDescription = null,
                                            tint = Color(0xFF166534),
                                            modifier = Modifier.size(12.dp)
                                        )
                                    }
                                }
                            }
                        }
                    }
                }

                // 2. ACTIVE PORTAL SUBSCRIPTION BANNER (Only shown when expiring within 7 days)
                if (clinic != null && activationDaysLeft <= 7) {
                    Card(
                        shape = RoundedCornerShape(16.dp),
                        colors = CardDefaults.cardColors(containerColor = Color(0xFFECFDF5)),
                        border = BorderStroke(1.dp, Color(0xFFA7F3D0)),
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable { showRenewalDialog = true }
                    ) {
                        Row(
                            modifier = Modifier.padding(14.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.SpaceBetween
                        ) {
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(12.dp),
                                modifier = Modifier.weight(1f)
                            ) {
                                Surface(
                                    shape = CircleShape,
                                    color = Color(0xFFD1FAE5),
                                    modifier = Modifier.size(46.dp)
                                ) {
                                    Box(contentAlignment = Alignment.Center) {
                                        Icon(
                                            Icons.Default.CalendarMonth,
                                            contentDescription = null,
                                            tint = Color(0xFF059669),
                                            modifier = Modifier.size(24.dp)
                                        )
                                    }
                                }
                                Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                                    Text(
                                        text = "Active Portal Subscription ($activationDaysLeft days left)",
                                        fontWeight = FontWeight.Bold,
                                        fontSize = 13.sp,
                                        color = Color(0xFF065F46)
                                    )
                                    Text(
                                        text = "Expires on $formattedActivationExpiry",
                                        fontSize = 11.sp,
                                        color = Color(0xFF047857)
                                    )
                                }
                            }
                            IconButton(onClick = { showRenewalDialog = true }) {
                                Icon(
                                    Icons.Default.ChevronRight,
                                    contentDescription = "Renew",
                                    tint = Color(0xFF059669),
                                    modifier = Modifier.size(22.dp)
                                )
                            }
                        }
                    }
                }

                // 3. QUICK ACTION CARDS: LIVE QUEUE & WALK-IN TOKEN
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    // Live Queue Card
                    Card(
                        shape = RoundedCornerShape(18.dp),
                        colors = CardDefaults.cardColors(containerColor = Color(0xFFEFF6FF)),
                        border = BorderStroke(1.dp, Color(0xFFDBEAFE)),
                        elevation = CardDefaults.cardElevation(defaultElevation = 0.dp),
                        modifier = Modifier
                            .weight(1f)
                            .height(170.dp)
                            .clickable {
                                val activeCid = clinic?.id?.takeIf { it.isNotBlank() } ?: initialEffectiveClinicId
                                navController.navigate(if (activeCid.isNotBlank()) "${NavRoutes.QueueBoard}/$activeCid" else NavRoutes.QueueBoard)
                            }
                    ) {
                        Column(
                            modifier = Modifier
                                .fillMaxSize()
                                .padding(14.dp),
                            verticalArrangement = Arrangement.SpaceBetween
                        ) {
                            Surface(
                                shape = CircleShape,
                                color = Color(0xFFDBEAFE),
                                modifier = Modifier.size(44.dp)
                            ) {
                                Box(contentAlignment = Alignment.Center) {
                                    Icon(
                                        Icons.Default.People,
                                        contentDescription = null,
                                        tint = Color(0xFF2563EB),
                                        modifier = Modifier.size(24.dp)
                                    )
                                }
                            }

                            Column(verticalArrangement = Arrangement.spacedBy(3.dp)) {
                                Text(
                                    "Live Queue",
                                    fontWeight = FontWeight.Bold,
                                    fontSize = 16.sp,
                                    color = Color(0xFF0F172A)
                                )
                                Text(
                                    "Call next patient &\nmanage turns",
                                    fontSize = 11.sp,
                                    color = Color(0xFF64748B),
                                    lineHeight = 14.sp
                                )
                            }

                            Box(modifier = Modifier.fillMaxWidth(), contentAlignment = Alignment.BottomEnd) {
                                Surface(
                                    shape = CircleShape,
                                    color = Color(0xFFDBEAFE),
                                    modifier = Modifier.size(34.dp)
                                ) {
                                    Box(contentAlignment = Alignment.Center) {
                                        Icon(
                                            Icons.Default.ArrowForward,
                                            contentDescription = null,
                                            tint = Color(0xFF2563EB),
                                            modifier = Modifier.size(16.dp)
                                        )
                                    }
                                }
                            }
                        }
                    }

                    // Walk-in Token Card
                    Card(
                        shape = RoundedCornerShape(18.dp),
                        colors = CardDefaults.cardColors(containerColor = Color(0xFFF5F3FF)),
                        border = BorderStroke(1.dp, Color(0xFFEDE9FE)),
                        elevation = CardDefaults.cardElevation(defaultElevation = 0.dp),
                        modifier = Modifier
                            .weight(1f)
                            .height(170.dp)
                            .clickable {
                                val activeCid = clinic?.id?.takeIf { it.isNotBlank() } ?: initialEffectiveClinicId
                                navController.navigate(if (activeCid.isNotBlank()) "${NavRoutes.WalkinBooking}/$activeCid" else NavRoutes.WalkinBooking)
                            }
                    ) {
                        Column(
                            modifier = Modifier
                                .fillMaxSize()
                                .padding(14.dp),
                            verticalArrangement = Arrangement.SpaceBetween
                        ) {
                            Surface(
                                shape = CircleShape,
                                color = Color(0xFFEDE9FE),
                                modifier = Modifier.size(44.dp)
                            ) {
                                Box(contentAlignment = Alignment.Center) {
                                    Icon(
                                        Icons.Default.PersonAdd,
                                        contentDescription = null,
                                        tint = Color(0xFF7C3AED),
                                        modifier = Modifier.size(24.dp)
                                    )
                                }
                            }

                            Column(verticalArrangement = Arrangement.spacedBy(3.dp)) {
                                Text(
                                    "Walk-in Token",
                                    fontWeight = FontWeight.Bold,
                                    fontSize = 16.sp,
                                    color = Color(0xFF0F172A)
                                )
                                Text(
                                    "Issue new 10-digit OPD\ntoken",
                                    fontSize = 11.sp,
                                    color = Color(0xFF64748B),
                                    lineHeight = 14.sp
                                )
                            }

                            Box(modifier = Modifier.fillMaxWidth(), contentAlignment = Alignment.BottomEnd) {
                                Surface(
                                    shape = CircleShape,
                                    color = Color(0xFFEDE9FE),
                                    modifier = Modifier.size(34.dp)
                                ) {
                                    Box(contentAlignment = Alignment.Center) {
                                        Icon(
                                            Icons.Default.ArrowForward,
                                            contentDescription = null,
                                            tint = Color(0xFF7C3AED),
                                            modifier = Modifier.size(16.dp)
                                        )
                                    }
                                }
                            }
                        }
                    }
                }

                // PAY AT DESK REQUESTS QUICK ACCESS
                Card(
                    shape = RoundedCornerShape(18.dp),
                    colors = CardDefaults.cardColors(containerColor = Color(0xFFFFFBEB)),
                    border = BorderStroke(1.dp, Color(0xFFFDE68A)),
                    elevation = CardDefaults.cardElevation(defaultElevation = 0.dp),
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable {
                            val activeCid = clinic?.id?.takeIf { it.isNotBlank() } ?: initialEffectiveClinicId
                            navController.navigate(if (activeCid.isNotBlank()) "${NavRoutes.PayAtDeskRequests}/$activeCid" else NavRoutes.PayAtDeskRequests)
                        }
                ) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(16.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Surface(
                            shape = CircleShape,
                            color = Color(0xFFFEF3C7),
                            modifier = Modifier.size(44.dp)
                        ) {
                            Box(contentAlignment = Alignment.Center) {
                                Icon(
                                    Icons.Default.CreditCard,
                                    contentDescription = null,
                                    tint = Color(0xFFD97706),
                                    modifier = Modifier.size(22.dp)
                                )
                            }
                        }

                        Spacer(Modifier.width(12.dp))

                        Column(modifier = Modifier.weight(1f)) {
                            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                Text(
                                    "View Requests",
                                    fontWeight = FontWeight.Bold,
                                    fontSize = 15.5.sp,
                                    color = Color(0xFF0F172A)
                                )
                                if (pendingPayAtDeskCount > 0) {
                                    Surface(
                                        shape = CircleShape,
                                        color = Color(0xFFF59E0B)
                                    ) {
                                        Text(
                                            "$pendingPayAtDeskCount Pending",
                                            color = Color.White,
                                            fontSize = 10.5.sp,
                                            fontWeight = FontWeight.Bold,
                                            modifier = Modifier.padding(horizontal = 7.dp, vertical = 2.dp)
                                        )
                                    }
                                }
                            }
                            Text(
                                text = if (pendingPayAtDeskCount > 0) {
                                    "$pendingPayAtDeskCount Pay at Desk booking(s) waiting for approval"
                                } else {
                                    "Review & approve Pay at Desk appointments"
                                },
                                fontSize = 11.5.sp,
                                color = Color(0xFF92400E),
                                lineHeight = 15.sp,
                                maxLines = 2,
                                overflow = TextOverflow.Ellipsis
                            )
                        }

                        Spacer(Modifier.width(12.dp))

                        Surface(
                            shape = CircleShape,
                            color = Color(0xFFFEF3C7),
                            modifier = Modifier.size(32.dp)
                        ) {
                            Box(contentAlignment = Alignment.Center) {
                                Icon(
                                    Icons.AutoMirrored.Filled.ArrowForward,
                                    contentDescription = null,
                                    tint = Color(0xFFD97706),
                                    modifier = Modifier.size(15.dp)
                                )
                            }
                        }
                    }
                }

                // 4. ENLISTED DOCTORS & PRESENCE (Hidden for Diagnostic Labs)
                if (!isLabClinic) {
                    Card(
                        shape = RoundedCornerShape(18.dp),
                        colors = CardDefaults.cardColors(containerColor = Color.White),
                        border = BorderStroke(1.dp, Color(0xFFE2E8F0)),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                    Column(
                        modifier = Modifier.padding(16.dp),
                        verticalArrangement = Arrangement.spacedBy(14.dp)
                    ) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(10.dp)
                            ) {
                                Surface(
                                    shape = CircleShape,
                                    color = Color(0xFFE0F2FE),
                                    modifier = Modifier.size(38.dp)
                                ) {
                                    Box(contentAlignment = Alignment.Center) {
                                        Icon(
                                            Icons.Default.MedicalServices,
                                            contentDescription = null,
                                            tint = Color(0xFF0284C7),
                                            modifier = Modifier.size(20.dp)
                                        )
                                    }
                                }
                                Text(
                                    "Enlisted Doctors & Presence",
                                    fontWeight = FontWeight.Bold,
                                    fontSize = 15.sp,
                                    color = Color(0xFF0F172A)
                                )
                            }

                            if (doctors.isNotEmpty()) {
                                val anyPresent = doctors.any { it.isInClinic }
                                Switch(
                                    checked = anyPresent,
                                    onCheckedChange = { checked ->
                                        val now = System.currentTimeMillis()
                                        pendingToggleDoctors = pendingToggleDoctors + doctors.associate { it.id to now }
                                        val updatedList = doctors.map { it.copy(isInClinic = checked) }
                                        doctors = updatedList
                                        val cid = clinic?.id ?: sessionManager.getSavedClinicId() ?: ""
                                        doctorRepository?.updateCachedDoctorsByClinic(cid, updatedList)
                                        coroutineScope.launch {
                                            updatedList.forEach { doc ->
                                                doctorRepository?.toggleDoctorPresence(doc.id, checked, cid)
                                            }
                                        }
                                    }
                                )
                            } else if (isDoctorsLoading) {
                                Box(
                                    modifier = Modifier
                                        .size(48.dp, 28.dp)
                                        .clip(RoundedCornerShape(14.dp))
                                        .background(Color(0xFFE2E8F0))
                                )
                            }
                        }

                        if (isDoctorsLoading && doctors.isEmpty()) {
                            // Instant Skeleton Shimmer while initial fetch completes (never show false "No Doctors Enlisted")
                            Surface(
                                shape = RoundedCornerShape(16.dp),
                                color = Color.White,
                                border = BorderStroke(1.dp, Color(0xFFE2E8F0)),
                                modifier = Modifier.fillMaxWidth()
                            ) {
                                Column(
                                    modifier = Modifier.padding(14.dp),
                                    verticalArrangement = Arrangement.spacedBy(12.dp)
                                ) {
                                    Row(
                                        modifier = Modifier.fillMaxWidth(),
                                        horizontalArrangement = Arrangement.SpaceBetween,
                                        verticalAlignment = Alignment.CenterVertically
                                    ) {
                                        Row(
                                            horizontalArrangement = Arrangement.spacedBy(12.dp),
                                            verticalAlignment = Alignment.CenterVertically,
                                            modifier = Modifier.weight(1f)
                                        ) {
                                            Box(
                                                modifier = Modifier
                                                    .size(52.dp)
                                                    .clip(CircleShape)
                                                    .background(Color(0xFFE2E8F0))
                                            )
                                            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                                                Box(
                                                    modifier = Modifier
                                                        .size(140.dp, 16.dp)
                                                        .clip(RoundedCornerShape(4.dp))
                                                        .background(Color(0xFFE2E8F0))
                                                )
                                                Box(
                                                    modifier = Modifier
                                                        .size(90.dp, 12.dp)
                                                        .clip(RoundedCornerShape(4.dp))
                                                        .background(Color(0xFFF1F5F9))
                                                )
                                            }
                                        }
                                        Box(
                                            modifier = Modifier
                                                .size(48.dp, 26.dp)
                                                .clip(RoundedCornerShape(13.dp))
                                                .background(Color(0xFFE2E8F0))
                                        )
                                    }
                                }
                            }
                        } else if (doctors.isEmpty()) {
                            Surface(
                                shape = RoundedCornerShape(14.dp),
                                color = Color(0xFFF8FAFC),
                                border = BorderStroke(1.dp, Color(0xFFE2E8F0)),
                                modifier = Modifier.fillMaxWidth()
                            ) {
                                Column(
                                    modifier = Modifier.padding(16.dp),
                                    horizontalAlignment = Alignment.CenterHorizontally,
                                    verticalArrangement = Arrangement.spacedBy(8.dp)
                                ) {
                                    Surface(
                                        shape = CircleShape,
                                        color = Color(0xFFEFF6FF),
                                        modifier = Modifier.size(44.dp)
                                    ) {
                                        Box(contentAlignment = Alignment.Center) {
                                            Icon(
                                                Icons.Default.PersonAddAlt1,
                                                contentDescription = null,
                                                tint = Color(0xFF2563EB),
                                                modifier = Modifier.size(22.dp)
                                            )
                                        }
                                    }
                                    Text(
                                        "No Doctors Enlisted",
                                        fontWeight = FontWeight.Bold,
                                        fontSize = 14.sp,
                                        color = Color(0xFF0F172A)
                                    )
                                    Text(
                                        "No medical specialists are currently connected with this clinic. Invite doctors to manage queues and publish slots.",
                                        fontSize = 11.sp,
                                        color = Color(0xFF64748B),
                                        textAlign = TextAlign.Center
                                    )
                                    Spacer(Modifier.height(4.dp))
                                    Button(
                                        onClick = {
                                            val activeCid = clinic?.id?.takeIf { it.isNotBlank() } ?: initialEffectiveClinicId
                                            navController.navigate(if (activeCid.isNotBlank()) "${NavRoutes.InvitationManager}/$activeCid" else NavRoutes.InvitationManager)
                                        },
                                        shape = RoundedCornerShape(10.dp),
                                        colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF2563EB))
                                    ) {
                                        Icon(Icons.Default.Add, contentDescription = null, modifier = Modifier.size(16.dp))
                                        Spacer(Modifier.width(6.dp))
                                        Text("Add / Invite Doctor", fontWeight = FontWeight.Bold, fontSize = 12.sp)
                                    }
                                }
                            }
                        } else {
                            doctors.forEach { doctor ->
                                key(doctor.id) {
                                    val isInClinic = doctor.isInClinic
                                    val displayDocName = when {
                                        doctor.isLabTechnician -> if (doctor.fullName.startsWith("Lab", ignoreCase = true)) doctor.fullName else "Lab Tech. ${doctor.fullName}"
                                        doctor.fullName.startsWith("Dr.", ignoreCase = true) -> doctor.fullName
                                        else -> "Dr. ${doctor.fullName}"
                                    }
                                    Surface(
                                        shape = RoundedCornerShape(16.dp),
                                        color = Color.White,
                                        border = BorderStroke(1.dp, Color(0xFFE2E8F0)),
                                        shadowElevation = 1.dp,
                                        modifier = Modifier.fillMaxWidth()
                                    ) {
                                        Column(
                                            modifier = Modifier.padding(14.dp),
                                            verticalArrangement = Arrangement.spacedBy(10.dp)
                                        ) {
                                            // Top Row: Avatar + Details + Accepted Badge
                                            Row(
                                                modifier = Modifier.fillMaxWidth(),
                                                horizontalArrangement = Arrangement.SpaceBetween,
                                                verticalAlignment = Alignment.Top
                                            ) {
                                                Row(
                                                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                                                    modifier = Modifier.weight(1f)
                                                ) {
                                                    // Doctor Photo with Online dot
                                                    Box(modifier = Modifier.size(52.dp)) {
                                                        if (!doctor.resolvedProfilePictureUrl.isNullOrBlank()) {
                                                            AsyncImage(
                                                                model = doctor.resolvedProfilePictureUrl,
                                                                contentDescription = doctor.fullName,
                                                                contentScale = ContentScale.Crop,
                                                                modifier = Modifier
                                                                    .fillMaxSize()
                                                                    .clip(CircleShape)
                                                            )
                                                        } else {
                                                            Surface(
                                                                shape = CircleShape,
                                                                color = Color(0xFFE2E8F0),
                                                                modifier = Modifier.fillMaxSize()
                                                            ) {
                                                                Box(contentAlignment = Alignment.Center) {
                                                                    Icon(
                                                                        if (doctor.isLabTechnician) Icons.Default.Biotech else Icons.Default.MedicalServices,
                                                                        contentDescription = null,
                                                                        tint = Color(0xFF64748B),
                                                                        modifier = Modifier.size(24.dp)
                                                                    )
                                                                }
                                                            }
                                                        }
                                                        Box(
                                                            modifier = Modifier
                                                                .size(14.dp)
                                                                .align(Alignment.BottomEnd)
                                                                .background(Color.White, CircleShape)
                                                                .padding(2.dp)
                                                                .background(if (isInClinic) Color(0xFF10B981) else Color(0xFF94A3B8), CircleShape)
                                                        )
                                                    }

                                                    // Doctor Details
                                                    Column(
                                                        verticalArrangement = Arrangement.spacedBy(3.dp),
                                                        modifier = Modifier.weight(1f)
                                                    ) {
                                                        Row(
                                                            verticalAlignment = Alignment.CenterVertically,
                                                            horizontalArrangement = Arrangement.spacedBy(4.dp)
                                                        ) {
                                                            Text(
                                                                text = displayDocName,
                                                                fontWeight = FontWeight.Bold,
                                                                fontSize = 15.sp,
                                                                color = Color(0xFF0F172A),
                                                                maxLines = 1,
                                                                overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis
                                                            )
                                                            Icon(
                                                                Icons.Default.Verified,
                                                                contentDescription = "Verified",
                                                                tint = Color(0xFF0284C7),
                                                                modifier = Modifier.size(16.dp)
                                                            )
                                                        }

                                                        Text(
                                                            text = "${doctor.specialty ?: if (doctor.isLabTechnician) "Medical Lab Technician" else "General Physician"} \u2022 NMC: ${doctor.nmcLicenseNumber ?: "N/A"}",
                                                            fontSize = 12.sp,
                                                            color = Color(0xFF64748B),
                                                            maxLines = 1,
                                                            overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis
                                                        )

                                                        // Degree & Specialty Pills
                                                        Row(
                                                            horizontalArrangement = Arrangement.spacedBy(6.dp),
                                                            modifier = Modifier.padding(top = 2.dp)
                                                        ) {
                                                            val degreeText = doctor.education?.split(",")?.firstOrNull()?.trim() ?: if (doctor.isLabTechnician) "DMLT" else "MBBS"
                                                            Surface(
                                                                shape = RoundedCornerShape(6.dp),
                                                                color = Color(0xFFE0F2FE)
                                                            ) {
                                                                Text(
                                                                    text = degreeText,
                                                                    color = Color(0xFF0284C7),
                                                                    fontSize = 11.sp,
                                                                    fontWeight = FontWeight.Medium,
                                                                    modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
                                                                )
                                                            }

                                                            val specialtyTag = doctor.specialty?.ifBlank { if (doctor.isLabTechnician) "Technician" else "General Physician" } ?: "General Physician"
                                                            Surface(
                                                                shape = RoundedCornerShape(6.dp),
                                                                color = Color(0xFFE0F2FE)
                                                            ) {
                                                                Text(
                                                                    text = specialtyTag,
                                                                    color = Color(0xFF0284C7),
                                                                    fontSize = 11.sp,
                                                                    fontWeight = FontWeight.Medium,
                                                                    maxLines = 1,
                                                                    overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis,
                                                                    modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
                                                                )
                                                            }
                                                        }

                                                        // Email Row
                                                        if (doctor.email.isNotBlank()) {
                                                            Row(
                                                                verticalAlignment = Alignment.CenterVertically,
                                                                horizontalArrangement = Arrangement.spacedBy(4.dp),
                                                                modifier = Modifier.padding(top = 2.dp)
                                                            ) {
                                                                Icon(
                                                                    Icons.Default.MailOutline,
                                                                    contentDescription = null,
                                                                    tint = Color(0xFF64748B),
                                                                    modifier = Modifier.size(13.dp)
                                                                )
                                                                Text(
                                                                    text = doctor.email,
                                                                    fontSize = 11.5.sp,
                                                                    color = Color(0xFF64748B),
                                                                    maxLines = 1,
                                                                    overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis
                                                                )
                                                            }
                                                        }
                                                    }
                                                }

                                                // Top-Right Accepted Badge
                                                Surface(
                                                    color = Color(0xFFDCFCE7),
                                                    shape = RoundedCornerShape(8.dp)
                                                ) {
                                                    Row(
                                                        verticalAlignment = Alignment.CenterVertically,
                                                        horizontalArrangement = Arrangement.spacedBy(3.dp),
                                                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
                                                    ) {
                                                        Icon(
                                                            Icons.Default.Check,
                                                            contentDescription = null,
                                                            tint = Color(0xFF15803D),
                                                            modifier = Modifier.size(13.dp)
                                                        )
                                                        Text(
                                                            text = "Accepted",
                                                            color = Color(0xFF15803D),
                                                            fontSize = 11.5.sp,
                                                            fontWeight = FontWeight.Bold
                                                        )
                                                    }
                                                }
                                            }

                                            // Bottom Bar: Active on Clinic Roster + Presence Switch (No Fee Indicator)
                                            Surface(
                                                color = Color(0xFFF0F9FF),
                                                shape = RoundedCornerShape(12.dp),
                                                modifier = Modifier.fillMaxWidth()
                                            ) {
                                                Row(
                                                    modifier = Modifier
                                                        .fillMaxWidth()
                                                        .padding(horizontal = 10.dp, vertical = 6.dp),
                                                    horizontalArrangement = Arrangement.SpaceBetween,
                                                    verticalAlignment = Alignment.CenterVertically
                                                ) {
                                                    Surface(
                                                        color = Color(0xFFDCFCE7),
                                                        shape = RoundedCornerShape(6.dp)
                                                    ) {
                                                        Row(
                                                            verticalAlignment = Alignment.CenterVertically,
                                                            horizontalArrangement = Arrangement.spacedBy(4.dp),
                                                            modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
                                                        ) {
                                                            Icon(
                                                                Icons.Default.CheckCircle,
                                                                contentDescription = null,
                                                                tint = Color(0xFF16A34A),
                                                                modifier = Modifier.size(13.dp)
                                                            )
                                                            Text(
                                                                text = "Accepted \u2022 Active on Clinic Roster",
                                                                color = Color(0xFF15803D),
                                                                fontSize = 11.sp,
                                                                fontWeight = FontWeight.SemiBold
                                                            )
                                                        }
                                                    }

                                                    Row(
                                                        verticalAlignment = Alignment.CenterVertically,
                                                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                                                    ) {
                                                        Text(
                                                            text = if (isInClinic) "Present" else "Off-Duty",
                                                            fontSize = 11.sp,
                                                            fontWeight = FontWeight.Bold,
                                                            color = if (isInClinic) Color(0xFF16A34A) else Color(0xFF64748B)
                                                        )
                                                         Switch(
                                                            checked = isInClinic,
                                                            onCheckedChange = { checked ->
                                                                val cid = clinic?.id ?: sessionManager.getSavedClinicId() ?: ""
                                                                pendingToggleDoctors = pendingToggleDoctors + (doctor.id to System.currentTimeMillis())
                                                                val updatedList = doctors.map {
                                                                    if (it.id == doctor.id) it.copy(isInClinic = checked) else it
                                                                }
                                                                doctors = updatedList
                                                                doctorRepository?.updateCachedDoctorsByClinic(cid, updatedList)
                                                                coroutineScope.launch {
                                                                    val ok = doctorRepository?.toggleDoctorPresence(doctor.id, checked, cid)
                                                                    if (ok != true) {
                                                                        val reverted = doctors.map {
                                                                            if (it.id == doctor.id) it.copy(isInClinic = !checked) else it
                                                                        }
                                                                        doctors = reverted
                                                                        doctorRepository?.updateCachedDoctorsByClinic(cid, reverted)
                                                                    }
                                                                }
                                                            }
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
                }
                }

                // 5. OPERATIONAL MANAGEMENT
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    modifier = Modifier.padding(top = 4.dp)
                ) {
                    Icon(
                        Icons.Default.Settings,
                        contentDescription = null,
                        tint = Color(0xFF2563EB),
                        modifier = Modifier.size(22.dp)
                    )
                    Text(
                        "Operational Management",
                        fontWeight = FontWeight.Bold,
                        fontSize = 17.sp,
                        color = Color(0xFF0F172A)
                    )
                }

                val isMultiVisitClinic = remember(clinic) {
                    val type = clinic?.type?.lowercase() ?: ""
                    type.contains("multi") || type.contains("poly") || type.contains("hospital") || type.contains("center") || ((clinic?.specialties?.size ?: 0) > 1)
                }
                // No-show button in operational management is only retained for single visit and lab clinics
                val isNoShowSupported = !isMultiVisitClinic || isLabClinic

                val opModules = buildList {
                    add(
                        ModuleItem(
                            title = "Slot Publishing",
                            desc = if (isLabClinic) "Publish lab booking slots & capacity" else "Publish doctor booking slots & capacity",
                            icon = Icons.Default.CalendarMonth,
                            route = NavRoutes.SlotManager,
                            color = Color(0xFF2563EB)
                        )
                    )
                    add(
                        ModuleItem(
                            title = "Working Hours & Break",
                            desc = "Sun\u2013Sat working hours, break times & live break toggle",
                            icon = Icons.Default.Schedule,
                            route = NavRoutes.WorkingHoursBreak,
                            color = Color(0xFF00796B)
                        )
                    )
                    add(
                        ModuleItem(
                            title = "Patient Directory",
                            desc = "Past visits & history",
                            icon = Icons.Default.FolderShared,
                            route = NavRoutes.PatientDirectory,
                            color = Color(0xFF059669)
                        )
                    )
                    add(
                        ModuleItem(
                            title = "Average Time",
                            desc = "Ensures estimated consultation time & queue pacing",
                            icon = Icons.Default.Timer,
                            route = NavRoutes.AverageTime,
                            color = Color(0xFF006B7D)
                        )
                    )
                    add(
                        ModuleItem(
                            title = "Future OPD",
                            desc = "Upcoming scheduled patients",
                            icon = Icons.Default.Event,
                            route = NavRoutes.FutureAppointments,
                            color = Color(0xFFD97706)
                        )
                    )
                    // No-show management button for all clinics
                    add(
                        ModuleItem(
                            title = "No-Show Patients",
                            desc = "Past-day missed visits & arrange new date",
                            icon = Icons.Default.EventBusy,
                            route = NavRoutes.NoShowManager,
                            color = Color(0xFFDC2626)
                        )
                    )
                    if (!isLabClinic) {
                        add(
                            ModuleItem(
                                title = "Consultation Fees",
                                desc = "Set & manage doctor OPD consultation fees",
                                icon = Icons.Default.Payments,
                                route = NavRoutes.ConsultationFeeManager,
                                color = Color(0xFF0D9488)
                            )
                        )
                    }
                    if (isLabClinic) {
                        add(
                            ModuleItem(
                                title = "Lab Tests & Rates",
                                desc = "Add tests & report prices selectable during patient booking",
                                icon = Icons.Default.Science,
                                route = NavRoutes.ServicesScreen,
                                color = Color(0xFF0284C7)
                            )
                        )
                    } else {
                        add(
                            ModuleItem(
                                title = "Services & Pricing",
                                desc = "Procedures, medical services & charges",
                                icon = Icons.Default.MedicalServices,
                                route = NavRoutes.ServicesScreen,
                                color = Color(0xFF0284C7)
                            )
                        )
                    }
                    add(
                        ModuleItem(
                            title = "Catalog & Rates",
                            desc = if (isLabClinic) "Billing items & package rates" else "Procedures, tests & billing items",
                            icon = Icons.Default.ReceiptLong,
                            route = NavRoutes.CatalogManager,
                            color = Color(0xFF7C3AED)
                        )
                    )
                    add(
                        ModuleItem(
                            title = "Payment Logs & Ledger",
                            desc = "Audit collections, doctor new-patient stats & platform fees",
                            icon = Icons.Default.Payment,
                            route = NavRoutes.PaymentLogs,
                            color = Color(0xFF0D9488)
                        )
                    )
                    // Dedicated Processing section button in Operational Management ONLY for Lab Clinics
                    if (isLabClinic) {
                        add(
                            ModuleItem(
                                title = "Processing",
                                desc = "Collected samples → Mark Prepared & upload optional PDF/photo",
                                icon = Icons.Default.Biotech,
                                route = NavRoutes.LabWorkflow,
                                color = Color(0xFFDC2626)
                            )
                        )
                    }
                    if (!isLabClinic) {
                        add(
                            ModuleItem(
                                title = "Doctor Invites",
                                desc = "Enlist & manage specialists",
                                icon = Icons.Default.PersonAddAlt1,
                                route = NavRoutes.InvitationManager,
                                color = Color(0xFF0891B2)
                            )
                        )
                    }
                }

                opModules.chunked(2).forEach { rowModules ->
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(IntrinsicSize.Max),
                        horizontalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        rowModules.forEach { module ->
                            Card(
                                shape = RoundedCornerShape(18.dp),
                                colors = CardDefaults.cardColors(containerColor = module.color.copy(alpha = 0.08f)),
                                border = BorderStroke(1.dp, module.color.copy(alpha = 0.2f)),
                                elevation = CardDefaults.cardElevation(defaultElevation = 0.dp),
                                modifier = Modifier
                                    .weight(1f)
                                    .fillMaxHeight()
                                    .heightIn(min = 172.dp)
                                    .clickable {
                                        val activeCid = clinic?.id?.takeIf { it.isNotBlank() } ?: initialEffectiveClinicId
                                        val targetRoute = if (activeCid.isNotBlank()) "${module.route}/$activeCid" else module.route
                                        navController.navigate(targetRoute)
                                    }
                            ) {
                                Column(
                                    modifier = Modifier
                                        .padding(13.dp)
                                        .fillMaxSize(),
                                    verticalArrangement = Arrangement.SpaceBetween
                                ) {
                                    Surface(
                                        shape = CircleShape,
                                        color = module.color.copy(alpha = 0.15f),
                                        modifier = Modifier.size(40.dp)
                                    ) {
                                        Box(contentAlignment = Alignment.Center) {
                                            Icon(module.icon, contentDescription = null, tint = module.color, modifier = Modifier.size(20.dp))
                                        }
                                    }

                                    Spacer(Modifier.height(4.dp))

                                    Column(
                                        modifier = Modifier.weight(1f, fill = false),
                                        verticalArrangement = Arrangement.spacedBy(2.dp)
                                    ) {
                                        Text(
                                            module.title,
                                            fontWeight = FontWeight.Bold,
                                            fontSize = 13.5.sp,
                                            color = Color(0xFF0F172A),
                                            lineHeight = 17.sp,
                                            maxLines = 2
                                        )
                                        Text(
                                            module.desc,
                                            fontSize = 11.sp,
                                            color = Color(0xFF64748B),
                                            maxLines = 2,
                                            lineHeight = 14.sp
                                        )
                                    }

                                    Spacer(Modifier.height(4.dp))

                                    Box(modifier = Modifier.fillMaxWidth(), contentAlignment = Alignment.BottomEnd) {
                                        Surface(
                                            shape = CircleShape,
                                            color = module.color.copy(alpha = 0.18f),
                                            modifier = Modifier
                                                .size(30.dp)
                                                .aspectRatio(1f)
                                        ) {
                                            Box(contentAlignment = Alignment.Center) {
                                                Icon(
                                                    Icons.Default.ArrowForward,
                                                    contentDescription = null,
                                                    tint = module.color,
                                                    modifier = Modifier.size(15.dp)
                                                )
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }

                // 6. DEDICATED DOCTOR INVITATION CARD (Hidden for Diagnostic Labs)
                if (!isLabClinic) {
                    Card(
                        shape = RoundedCornerShape(18.dp),
                        colors = CardDefaults.cardColors(containerColor = Color(0xFFEFF6FF)),
                        border = BorderStroke(1.dp, Color(0xFFBFDBFE)),
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable {
                                val activeCid = clinic?.id?.takeIf { it.isNotBlank() } ?: initialEffectiveClinicId
                                navController.navigate(if (activeCid.isNotBlank()) "${NavRoutes.InvitationManager}/$activeCid" else NavRoutes.InvitationManager)
                            }
                    ) {
                        Row(
                            modifier = Modifier.padding(16.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.SpaceBetween
                        ) {
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(12.dp),
                                modifier = Modifier.weight(1f)
                            ) {
                                Surface(
                                    shape = RoundedCornerShape(12.dp),
                                    color = Color(0xFFDBEAFE),
                                    modifier = Modifier.size(46.dp)
                                ) {
                                    Box(contentAlignment = Alignment.Center) {
                                        Icon(
                                            Icons.Default.PersonAddAlt1,
                                            contentDescription = null,
                                            tint = Color(0xFF2563EB),
                                            modifier = Modifier.size(24.dp)
                                        )
                                    }
                                }
                                Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                                    Text(
                                        "Invite & Enlist Doctors",
                                        fontWeight = FontWeight.Bold,
                                        fontSize = 15.sp,
                                        color = Color(0xFF1E3A8A)
                                    )
                                    Text(
                                        "Send digital invitations to specialists to connect and publish OPD slots",
                                        fontSize = 11.sp,
                                        color = Color(0xFF3B82F6),
                                        lineHeight = 15.sp
                                    )
                                }
                            }
                            Button(
                                onClick = {
                                    val activeCid = clinic?.id?.takeIf { it.isNotBlank() } ?: initialEffectiveClinicId
                                    navController.navigate(if (activeCid.isNotBlank()) "${NavRoutes.InvitationManager}/$activeCid" else NavRoutes.InvitationManager)
                                },
                                shape = RoundedCornerShape(10.dp),
                                colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF2563EB))
                            ) {
                                Icon(Icons.Default.Add, contentDescription = null, modifier = Modifier.size(16.dp))
                                Spacer(Modifier.width(4.dp))
                                Text("Invite", fontSize = 12.sp, fontWeight = FontWeight.Bold)
                            }
                        }
                    }
                }

                // 7. CLINIC PROFILE & SETTINGS CARD
                Card(
                    shape = RoundedCornerShape(16.dp),
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                    border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
                    elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable {
                            val activeCid = clinic?.id?.takeIf { it.isNotBlank() } ?: initialEffectiveClinicId
                            navController.navigate(if (activeCid.isNotBlank()) "${NavRoutes.ClinicSettings}/$activeCid" else NavRoutes.ClinicSettings)
                        }
                ) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(16.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(14.dp),
                            modifier = Modifier.weight(1f)
                        ) {
                            Surface(
                                shape = RoundedCornerShape(12.dp),
                                color = MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.7f),
                                modifier = Modifier.size(46.dp)
                            ) {
                                Box(contentAlignment = Alignment.Center) {
                                    Icon(
                                        Icons.Default.Tune,
                                        contentDescription = null,
                                        tint = MaterialTheme.colorScheme.primary,
                                        modifier = Modifier.size(24.dp)
                                    )
                                }
                            }
                            Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                                Text(
                                    "Clinic Profile & Settings",
                                    fontWeight = FontWeight.Bold,
                                    fontSize = 15.sp,
                                    color = MaterialTheme.colorScheme.onSurface
                                )
                                Text(
                                    "Manage specialties, operating hours, photos, PAN & payment APIs",
                                    fontSize = 11.sp,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    maxLines = 2,
                                    lineHeight = 15.sp
                                )
                            }
                        }
                        Icon(
                            Icons.Default.ChevronRight,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.size(24.dp)
                        )
                    }
                }

                // 8. SIGN OUT BUTTON
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
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(48.dp)
                ) {
                    Icon(Icons.AutoMirrored.Filled.ExitToApp, contentDescription = null, modifier = Modifier.size(18.dp), tint = MaterialTheme.colorScheme.error)
                    Spacer(Modifier.width(8.dp))
                    Text("Sign Out from Clinic Account", fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.error)
                }
                }
            }
        }
    }

    // EARLY RENEWAL DIALOG
    if (showRenewalDialog && clinic != null) {
        AlertDialog(
            onDismissRequest = { if (!isSubmittingPayment) showRenewalDialog = false },
            title = {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Icon(Icons.Default.CreditCard, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
                    Text("Renew Portal Subscription", fontWeight = FontWeight.Bold, fontSize = 17.sp)
                }
            },
            text = {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .verticalScroll(rememberScrollState()),
                    verticalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    Text("Extend your clinic portal activation period. Active clinics can manage live queues and receive patient bookings.", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)

                    // 1 Month option
                    Surface(
                        shape = RoundedCornerShape(10.dp),
                        color = if (selectedPlan == "1_month") MaterialTheme.colorScheme.primaryContainer else MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f),
                        border = BorderStroke(if (selectedPlan == "1_month") 2.dp else 1.dp, if (selectedPlan == "1_month") MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.outlineVariant),
                        onClick = { selectedPlan = "1_month" },
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Row(modifier = Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween) {
                            Column {
                                Text("1 Month Access (30 Days)", fontWeight = FontWeight.Bold, fontSize = 13.sp)
                                Text("Standard monthly portal access", fontSize = 10.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                            Text("Rs. 1,500", fontWeight = FontWeight.Bold, fontSize = 14.sp, color = MaterialTheme.colorScheme.primary)
                        }
                    }

                    // 12 Months option
                    Surface(
                        shape = RoundedCornerShape(10.dp),
                        color = if (selectedPlan == "12_month") MaterialTheme.colorScheme.primaryContainer else MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f),
                        border = BorderStroke(if (selectedPlan == "12_month") 2.dp else 1.dp, if (selectedPlan == "12_month") MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.outlineVariant),
                        onClick = { selectedPlan = "12_month" },
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Row(modifier = Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween) {
                            Column {
                                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                                    Text("12 Months (1 Year)", fontWeight = FontWeight.Bold, fontSize = 13.sp)
                                    Surface(shape = RoundedCornerShape(4.dp), color = Color(0xFF059669).copy(alpha = 0.15f)) {
                                        Text("Save Rs 3,000", fontSize = 9.sp, fontWeight = FontWeight.Bold, color = Color(0xFF059669), modifier = Modifier.padding(horizontal = 4.dp, vertical = 2.dp))
                                    }
                                }
                                Text("365 Days annual license", fontSize = 10.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                            Text("Rs. 15,000", fontWeight = FontWeight.Bold, fontSize = 14.sp, color = MaterialTheme.colorScheme.primary)
                        }
                    }

                    // Payment details
                    Surface(
                        shape = RoundedCornerShape(8.dp),
                        color = Color(0xFFF3F4F6),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Column(modifier = Modifier.padding(10.dp), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                            Text("App Owner Payment Accounts:", fontSize = 11.sp, fontWeight = FontWeight.Bold)
                            Text("\u2022 eSewa / Khalti: 9841000000 (Dactor Admin)", fontSize = 11.sp)
                            Text("\u2022 Nabil Bank A/C: 01234567890123", fontSize = 11.sp)
                        }
                    }

                    OutlinedTextField(
                        value = paymentTransactionNote,
                        onValueChange = { paymentTransactionNote = it },
                        label = { Text("Payment Ref / TxID", fontSize = 12.sp) },
                        placeholder = { Text("e.g. eSewa TxID or Depositor Name", fontSize = 11.sp) },
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(8.dp),
                        singleLine = true
                    )
                }
            },
            confirmButton = {
                Button(
                    onClick = {
                        val effClinicId = clinic?.id ?: sessionManager.getSavedClinicId() ?: ""
                        if (effClinicId.isNotBlank() && clinicRepository != null) {
                            isSubmittingPayment = true
                            coroutineScope.launch {
                                val amount = if (selectedPlan == "12_month") 15000.0 else 1500.0
                                val notes = paymentTransactionNote.trim().ifBlank {
                                    "Early renewal for $selectedPlan submitted from clinic app"
                                }
                                val res = clinicRepository.requestActivationRenewal(
                                    clinicId = effClinicId,
                                    plan = selectedPlan,
                                    amount = amount,
                                    notes = notes
                                )
                                isSubmittingPayment = false
                                if (res.isSuccess) {
                                    Toast.makeText(context, "Renewal request submitted to Admin!", Toast.LENGTH_LONG).show()
                                    paymentTransactionNote = ""
                                    showRenewalDialog = false
                                    loadClinic()
                                } else {
                                    Toast.makeText(context, "Failed: ${res.exceptionOrNull()?.message}", Toast.LENGTH_SHORT).show()
                                }
                            }
                        }
                    },
                    enabled = !isSubmittingPayment
                ) {
                    if (isSubmittingPayment) {
                        CircularProgressIndicator(color = Color.White, modifier = Modifier.size(16.dp), strokeWidth = 2.dp)
                        Spacer(Modifier.width(6.dp))
                    }
                    Text("Submit Renewal Request")
                }
            },
            dismissButton = {
                TextButton(
                    onClick = { showRenewalDialog = false },
                    enabled = !isSubmittingPayment
                ) {
                    Text("Cancel")
                }
            }
        )
    }
}

data class ModuleItem(
    val title: String,
    val desc: String,
    val icon: ImageVector,
    val route: String,
    val color: Color
)
