package com.dactor.patient.ui.profile

import android.widget.Toast
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.navigation.NavController
import com.dactor.patient.data.model.Appointment
import com.dactor.patient.data.repository.AppointmentRepository
import com.dactor.patient.data.repository.AuthRepository
import com.dactor.patient.ui.components.GuestAccountView
import com.dactor.patient.ui.navigation.NavRoutes
import kotlinx.coroutines.launch
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.temporal.ChronoUnit

fun calculateDaysRemaining(deletionScheduledAt: String?): Long {
    if (deletionScheduledAt.isNullOrBlank()) return 30L
    return try {
        val target = Instant.parse(deletionScheduledAt)
        val now = Instant.now()
        val secondsDiff = target.epochSecond - now.epochSecond
        val days = (secondsDiff + 86399) / 86400 // round up to whole day
        days.coerceAtLeast(1L).coerceAtMost(30L)
    } catch (e: Exception) {
        try {
            val targetDate = LocalDate.parse(deletionScheduledAt.take(10))
            val today = LocalDate.now()
            ChronoUnit.DAYS.between(today, targetDate).coerceAtLeast(1L).coerceAtMost(30L)
        } catch (e2: Exception) {
            30L
        }
    }
}

fun formatScheduledDeletionDate(deletionScheduledAt: String?): String {
    if (deletionScheduledAt.isNullOrBlank()) {
        val defaultDate = LocalDate.now().plusDays(30)
        return "${defaultDate.month.name.lowercase().replaceFirstChar { it.uppercase() }} ${defaultDate.dayOfMonth}, ${defaultDate.year}"
    }
    return try {
        val dt = Instant.parse(deletionScheduledAt)
        val localDate = dt.atZone(ZoneId.systemDefault()).toLocalDate()
        "${localDate.month.name.lowercase().replaceFirstChar { it.uppercase() }} ${localDate.dayOfMonth}, ${localDate.year}"
    } catch (e: Exception) {
        try {
            val localDate = LocalDate.parse(deletionScheduledAt.take(10))
            "${localDate.month.name.lowercase().replaceFirstChar { it.uppercase() }} ${localDate.dayOfMonth}, ${localDate.year}"
        } catch (e2: Exception) {
            deletionScheduledAt.take(10)
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ProfileScreen(
    navController: NavController,
    authRepository: AuthRepository? = null,
    appointmentRepository: AppointmentRepository? = null,
    sessionManager: com.dactor.patient.data.local.UserSessionManager? = null
) {
    val coroutineScope = rememberCoroutineScope()
    val context = LocalContext.current
    val clipboardManager = LocalClipboardManager.current

    var patientId by remember { mutableStateOf<String?>(null) }
    var userEmail by remember { mutableStateOf<String?>(null) }
    var userName by remember { mutableStateOf<String?>(null) }
    var userPhone by remember { mutableStateOf<String?>(null) }
    var userGender by remember { mutableStateOf<String?>(null) }
    var userAge by remember { mutableStateOf<Int?>(null) }
    var isLoggedIn by remember {
        mutableStateOf(sessionManager?.isLoggedIn() == true || (authRepository?.isLoggedIn() == true) || (try { com.google.firebase.auth.FirebaseAuth.getInstance().currentUser != null } catch (_: Exception) { false }))
    }

    // Account archive & scheduled deletion states
    var isArchived by remember { mutableStateOf(false) }
    var deletionScheduledAt by remember { mutableStateOf<String?>(null) }
    var archivedAt by remember { mutableStateOf<String?>(null) }
    var isRestoringAccount by remember { mutableStateOf(false) }
    var isDeletingAccount by remember { mutableStateOf(false) }

    // Status / Alert message banner
    var statusMessage by remember { mutableStateOf<String?>(null) }

    // Dialog state for claiming an appointment code
    var showClaimDialog by remember { mutableStateOf(false) }
    var claimCodeInput by remember { mutableStateOf("") }
    var claimStatusMessage by remember { mutableStateOf<String?>(null) }
    var isClaiming by remember { mutableStateOf(false) }

    // Dialog state for editing profile details
    var showEditProfileDialog by remember { mutableStateOf(false) }
    var editNameInput by remember { mutableStateOf("") }
    var editPhoneDigits by remember { mutableStateOf("") }
    var editGenderChoice by remember { mutableStateOf("Male") }
    var editAgeInput by remember { mutableStateOf("") }
    var isSavingProfile by remember { mutableStateOf(false) }
    var editProfileError by remember { mutableStateOf<String?>(null) }

    // Dialog state for deleting account
    var showDeleteAccountDialog by remember { mutableStateOf(false) }

    // Dialog state for signing out
    var showSignOutConfirmDialog by remember { mutableStateOf(false) }

    // Dialog state for Terms and Conditions
    var showTermsDialog by remember { mutableStateOf(false) }

    var showTransactionHistoryDialog by remember { mutableStateOf(false) }
    var transactionHistoryList by remember { mutableStateOf<List<com.dactor.patient.data.model.PatientTransactionRecord>>(emptyList()) }
    var isLoadingTransactions by remember { mutableStateOf(false) }

    fun loadTransactionHistory() {
        if (isLoadingTransactions) return
        isLoadingTransactions = true
        coroutineScope.launch {
            try {
                val cached = sessionManager?.getLocalTransactionRecords() ?: emptyList()
                val pid = patientId ?: sessionManager?.getSavedPatientId() ?: ""
                val trackingCodes = sessionManager?.getSavedTrackingCodes()?.map { it.first } ?: emptyList()
                val remote = appointmentRepository?.getAllPatientTransactions(
                    userId = pid,
                    email = userEmail,
                    phone = userPhone,
                    trackingCodes = trackingCodes
                ) ?: emptyList()
                val merged = (remote + cached).distinctBy { it.id + it.appointmentId }.sortedByDescending { it.appointmentDate }
                transactionHistoryList = merged
            } catch (e: Exception) {
                e.printStackTrace()
                transactionHistoryList = sessionManager?.getLocalTransactionRecords() ?: emptyList()
            } finally {
                isLoadingTransactions = false
            }
        }
    }

    var copiedCode by remember { mutableStateOf<String?>(null) }

    // Appointments list
    var savedAppointments by remember { mutableStateOf<List<Appointment>>(emptyList()) }
    var isLoadingAppointments by remember { mutableStateOf(false) }

    suspend fun loadAppointmentsForUser(uid: String?, email: String?, phone: String?) {
        if (appointmentRepository == null || isArchived) return
        isLoadingAppointments = true
        try {
            val localCodes = sessionManager?.getSavedTrackingCodes()?.map { it.first } ?: emptyList()
            val appts = appointmentRepository.getAllPatientAppointments(
                userId = uid,
                email = email,
                phone = phone,
                trackingCodes = localCodes
            )
            for (appt in appts) {
                if (appt.trackingCode10Digit.isNotBlank()) {
                    sessionManager?.saveTrackingCode(
                        appt.trackingCode10Digit,
                        "${appt.patientName} • ${appt.appointmentDate}"
                    )
                }
            }
            savedAppointments = appts
        } catch (e: Exception) {
            e.printStackTrace()
        } finally {
            isLoadingAppointments = false
        }
    }

    LaunchedEffect(Unit) {
        // 1. Initial load from local session
        if (sessionManager != null) {
            isLoggedIn = sessionManager.isLoggedIn()
            patientId = sessionManager.getSavedPatientId()
            userEmail = sessionManager.getSavedEmail()
            userName = sessionManager.getSavedName()
            userPhone = sessionManager.getSavedPhone()
            userGender = sessionManager.getSavedGender()
            userAge = sessionManager.getSavedAge()
            isArchived = sessionManager.isAccountArchived()
            deletionScheduledAt = sessionManager.getDeletionScheduledAt()
        }

        // 2. Fetch fresh profile from Supabase
        if (authRepository != null) {
            val uid = authRepository.getCurrentUser()
            if (uid != null) isLoggedIn = true
            if (userEmail.isNullOrBlank()) userEmail = authRepository.getCurrentUserEmail()

            val profile = authRepository.getCurrentProfile()
                ?: (if (!userEmail.isNullOrBlank()) authRepository.getProfileByEmail(userEmail!!) else null)
                ?: (if (!patientId.isNullOrBlank()) authRepository.getProfileById(patientId!!) else null)

            if (profile != null) {
                patientId = profile.id
                if (!profile.fullName.isNullOrBlank()) userName = profile.fullName
                if (!profile.phone.isNullOrBlank()) userPhone = profile.phone
                if (profile.email.isNotBlank()) userEmail = profile.email
                if (!profile.gender.isNullOrBlank()) userGender = profile.gender
                if (profile.age != null) userAge = profile.age

                // Check archive & deletion status
                val remoteArchived = profile.isArchived == true
                isArchived = remoteArchived
                deletionScheduledAt = profile.deletionScheduledAt
                archivedAt = profile.archivedAt

                sessionManager?.savePatientSession(
                    patientId = profile.id,
                    email = profile.email,
                    name = profile.fullName ?: userName ?: "",
                    phone = profile.phone ?: userPhone ?: "",
                    gender = profile.gender ?: userGender,
                    age = profile.age ?: userAge,
                    isArchived = remoteArchived,
                    deletionScheduledAt = profile.deletionScheduledAt
                )
            }
        }

        // 3. Load all appointments matching userId, email, phone, and saved tracking codes
        if (!isArchived) {
            loadAppointmentsForUser(patientId, userEmail, userPhone)
        }
    }

    fun performSignOut() {
        coroutineScope.launch {
            sessionManager?.clearSession()
            try {
                com.google.android.gms.auth.api.signin.GoogleSignIn.getClient(
                    context,
                    com.google.android.gms.auth.api.signin.GoogleSignInOptions.DEFAULT_SIGN_IN
                ).signOut()
                com.google.firebase.auth.FirebaseAuth.getInstance().signOut()
            } catch (ignored: Exception) {}
            authRepository?.signOut()
            isLoggedIn = false
            userEmail = null
            userName = null
            userPhone = null
            userGender = null
            userAge = null
            isArchived = false
            savedAppointments = emptyList()
            sessionManager?.setGuestMode(true)
            navController.navigate(NavRoutes.PatientMain.route) {
                popUpTo(0) { inclusive = true }
            }
        }
    }

    fun performCancelDeletion() {
        val effId = patientId ?: authRepository?.getCurrentUser() ?: ""
        if (effId.isBlank() || authRepository == null) return

        isRestoringAccount = true
        coroutineScope.launch {
            try {
                val res = authRepository.cancelAccountDeletion(effId)
                if (res.isSuccess) {
                    sessionManager?.setArchivedStatus(false, null)
                    isArchived = false
                    deletionScheduledAt = null
                    archivedAt = null
                    statusMessage = "Account deletion cancelled! Your profile, appointments, and services have been restored."

                    // Reload user appointments
                    loadAppointmentsForUser(effId, userEmail, userPhone)
                } else {
                    statusMessage = "Unable to cancel deletion: ${res.exceptionOrNull()?.message}"
                }
            } catch (e: Exception) {
                statusMessage = "Error: ${e.message}"
            } finally {
                isRestoringAccount = false
            }
        }
    }

    fun performScheduleDeletion() {
        val effId = patientId ?: authRepository?.getCurrentUser() ?: ""
        isDeletingAccount = true
        coroutineScope.launch {
            try {
                if (effId.isNotBlank() && authRepository != null) {
                    authRepository.scheduleAccountDeletion(effId)
                }

                // CRITICAL REQUIREMENT:
                // Logout from mobile device immediately.
                // All appointment details stay in every clinic.
                // Real Firebase Authentication Account Deletion Rule
                try {
                    val fbUser = com.google.firebase.auth.FirebaseAuth.getInstance().currentUser
                    if (fbUser != null) {
                        try {
                            com.google.android.gms.tasks.Tasks.await(
                                fbUser.delete(),
                                3,
                                java.util.concurrent.TimeUnit.SECONDS
                            )
                        } catch (e: Exception) {
                            e.printStackTrace()
                        }
                    }
                } catch (ignored: Exception) {}

                sessionManager?.clearSession()
                try {
                    com.google.android.gms.auth.api.signin.GoogleSignIn.getClient(
                        context,
                        com.google.android.gms.auth.api.signin.GoogleSignInOptions.DEFAULT_SIGN_IN
                    ).signOut()
                    com.google.firebase.auth.FirebaseAuth.getInstance().signOut()
                } catch (ignored: Exception) {}
                authRepository?.signOut()

                showDeleteAccountDialog = false
                sessionManager?.setGuestMode(true)
                Toast.makeText(context, "Account archived for 30 days. You have been logged out.", Toast.LENGTH_LONG).show()
                navController.navigate(NavRoutes.PatientMain.route) {
                    popUpTo(0) { inclusive = true }
                }
            } catch (e: Exception) {
                e.printStackTrace()
                showDeleteAccountDialog = false
            } finally {
                isDeletingAccount = false
            }
        }
    }

    fun openEditProfileDialog() {
        editNameInput = userName ?: ""
        editPhoneDigits = (userPhone ?: "").removePrefix("+977").trim()
        editGenderChoice = userGender ?: ""
        editAgeInput = userAge?.toString() ?: ""
        editProfileError = null
        showEditProfileDialog = true
    }

    fun saveProfileChanges() {
        val cleanName = editNameInput.trim()
        val cleanPhone = editPhoneDigits.filter { it.isDigit() }
        val ageInt = editAgeInput.trim().toIntOrNull()

        if (cleanName.length < 2) {
            editProfileError = "Please enter your full name (at least 2 characters)."
            return
        }
        if (cleanPhone.length != 10 || !cleanPhone.startsWith("9")) {
            editProfileError = "Please enter a valid 10-digit mobile number starting with 9."
            return
        }
        if (editGenderChoice.isBlank()) {
            editProfileError = "Please select your gender."
            return
        }
        if (ageInt == null || ageInt !in 1..120) {
            editProfileError = "Please enter a valid age between 1 and 120."
            return
        }

        val effId = patientId ?: authRepository?.getCurrentUser() ?: ""
        if (effId.isBlank() || authRepository == null) {
            // Update locally only
            userName = cleanName
            userPhone = cleanPhone
            userGender = editGenderChoice
            userAge = ageInt
            sessionManager?.updateProfileInfo(cleanName, cleanPhone, editGenderChoice, ageInt)
            showEditProfileDialog = false
            statusMessage = "Profile updated locally."
            return
        }

        isSavingProfile = true
        editProfileError = null
        coroutineScope.launch {
            try {
                val res = authRepository.updatePatientProfileDetails(
                    userId = effId,
                    fullName = cleanName,
                    phone = cleanPhone,
                    gender = editGenderChoice,
                    age = ageInt
                )
                if (res.isSuccess) {
                    userName = cleanName
                    userPhone = cleanPhone
                    userGender = editGenderChoice
                    userAge = ageInt
                    sessionManager?.updateProfileInfo(cleanName, cleanPhone, editGenderChoice, ageInt)
                    showEditProfileDialog = false
                    statusMessage = "Profile details updated successfully!"
                } else {
                    editProfileError = "Failed to update profile: ${res.exceptionOrNull()?.message}"
                }
            } catch (e: Exception) {
                editProfileError = "Error: ${e.message}"
            } finally {
                isSavingProfile = false
            }
        }
    }

    fun handleClaimCode() {
        val cleaned = claimCodeInput.trim()
        if (cleaned.length != 10 || !cleaned.all { it.isDigit() }) {
            claimStatusMessage = "Please enter a valid 10-digit code"
            return
        }

        isClaiming = true
        coroutineScope.launch {
            try {
                if (appointmentRepository != null) {
                    val appt = appointmentRepository.getAppointmentByTrackingCode(cleaned)
                    if (appt != null) {
                        sessionManager?.saveTrackingCode(cleaned, "${appt.patientName} • ${appt.appointmentDate}")
                        savedAppointments = listOf(appt) + savedAppointments.filter { it.trackingCode10Digit != cleaned }
                        showClaimDialog = false
                        claimCodeInput = ""
                        claimStatusMessage = null
                    } else {
                        claimStatusMessage = "Appointment with code $cleaned not found."
                    }
                } else {
                    showClaimDialog = false
                }
            } catch (e: Exception) {
                claimStatusMessage = e.message ?: "Failed to find appointment."
            } finally {
                isClaiming = false
            }
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        if (!isLoggedIn) "Account" else if (isArchived) "Account Status (Archive)" else "Patient Account & Profile",
                        fontWeight = FontWeight.Bold
                    )
                },
                navigationIcon = {
                    IconButton(onClick = { navController.popBackStack() }) {
                        Icon(Icons.Default.ArrowBack, contentDescription = "Back")
                    }
                },
                actions = {
                    if (isLoggedIn) {
                        IconButton(onClick = { showSignOutConfirmDialog = true }) {
                            Icon(Icons.Default.Logout, contentDescription = "Sign Out", tint = MaterialTheme.colorScheme.error)
                        }
                    }
                    if (!isArchived && isLoggedIn) {
                        IconButton(onClick = { navController.navigate(NavRoutes.Notifications.route) }) {
                            Icon(Icons.Default.Notifications, contentDescription = "Notifications")
                        }
                    }
                }
            )
        }
    ) { padding ->

        if (!isLoggedIn) {
            GuestAccountView(
                onSignInClicked = {
                    navController.navigate(NavRoutes.Login.route)
                },
                modifier = Modifier.padding(padding),
                authRepository = authRepository,
                sessionManager = sessionManager,
                appointmentRepository = appointmentRepository,
                onLoginSuccess = {
                    isLoggedIn = true
                    patientId = sessionManager?.getSavedPatientId()
                    userEmail = sessionManager?.getSavedEmail()
                    userName = sessionManager?.getSavedName()
                    userPhone = sessionManager?.getSavedPhone()
                    userGender = sessionManager?.getSavedGender()
                    userAge = sessionManager?.getSavedAge()
                    coroutineScope.launch {
                        loadAppointmentsForUser(patientId, userEmail, userPhone)
                    }
                }
            )
        } else if (isArchived) {
            // =========================================================================
            // 30-DAY ARCHIVE STATE: USER CANNOT VIEW ANYTHING IN PROFILE
            // SHOWS DAY COUNTDOWN, SCHEDULED DELETION DATE, AND CANCEL DELETION BUTTON
            // =========================================================================
            val daysRemaining = calculateDaysRemaining(deletionScheduledAt)
            val formattedDeletionDate = formatScheduledDeletionDate(deletionScheduledAt)

            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(padding)
                    .padding(20.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.Center
            ) {
                // Warning / Archive Badge Icon
                Surface(
                    shape = CircleShape,
                    color = Color(0xFFFEE2E2),
                    modifier = Modifier.size(88.dp)
                ) {
                    Box(contentAlignment = Alignment.Center) {
                        Icon(
                            Icons.Default.HourglassTop,
                            contentDescription = null,
                            tint = Color(0xFFDC2626),
                            modifier = Modifier.size(46.dp)
                        )
                    }
                }

                Spacer(Modifier.height(20.dp))

                Text(
                    text = "Account Scheduled for Deletion",
                    fontSize = 20.sp,
                    fontWeight = FontWeight.Bold,
                    color = Color(0xFF991B1B),
                    textAlign = TextAlign.Center
                )

                Spacer(Modifier.height(8.dp))

                Text(
                    text = "Your account is currently in the 30-day archive period.",
                    fontSize = 13.sp,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    textAlign = TextAlign.Center
                )

                Spacer(Modifier.height(24.dp))

                // Countdown Highlight Card
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
                        Text(
                            text = "DAYS REMAINING",
                            fontSize = 11.sp,
                            fontWeight = FontWeight.Bold,
                            color = Color(0xFFB91C1C),
                            letterSpacing = 1.sp
                        )

                        Text(
                            text = "$daysRemaining Days",
                            fontSize = 32.sp,
                            fontWeight = FontWeight.ExtraBold,
                            color = Color(0xFFDC2626)
                        )

                        HorizontalDivider(color = Color(0xFFFCA5A5), modifier = Modifier.padding(vertical = 4.dp))

                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(6.dp)
                        ) {
                            Icon(Icons.Default.Event, contentDescription = null, tint = Color(0xFF991B1B), modifier = Modifier.size(16.dp))
                            Text(
                                text = "Scheduled Deletion: $formattedDeletionDate",
                                fontSize = 13.sp,
                                fontWeight = FontWeight.SemiBold,
                                color = Color(0xFF7F1D1D)
                            )
                        }
                    }
                }

                Spacer(Modifier.height(18.dp))

                // Data Preservation & Privacy Guarantee Card
                Surface(
                    shape = RoundedCornerShape(14.dp),
                    color = Color(0xFFF0FDF4),
                    border = BorderStroke(1.dp, Color(0xFFBBF7D0)),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Row(
                        modifier = Modifier.padding(14.dp),
                        verticalAlignment = Alignment.Top,
                        horizontalArrangement = Arrangement.spacedBy(10.dp)
                    ) {
                        Icon(Icons.Default.Shield, contentDescription = null, tint = Color(0xFF16A34A), modifier = Modifier.size(20.dp))
                        Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                            Text(
                                text = "Clinic Medical Records Intact",
                                fontWeight = FontWeight.Bold,
                                fontSize = 13.sp,
                                color = Color(0xFF166534)
                            )
                            Text(
                                text = "All your appointment history, invoices, and lab tests remain safely preserved across all clinics in Nepal. No clinic medical data has been wiped.",
                                fontSize = 11.sp,
                                color = Color(0xFF14532D),
                                lineHeight = 16.sp
                            )
                        }
                    }
                }

                Spacer(Modifier.height(28.dp))

                // Button: Cancel Deletion & Restore Account
                Button(
                    onClick = { performCancelDeletion() },
                    enabled = !isRestoringAccount,
                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF059669)),
                    shape = RoundedCornerShape(12.dp),
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(50.dp)
                ) {
                    if (isRestoringAccount) {
                        CircularProgressIndicator(modifier = Modifier.size(20.dp), color = Color.White, strokeWidth = 2.dp)
                        Spacer(Modifier.width(10.dp))
                        Text("Restoring Account...", fontWeight = FontWeight.Bold)
                    } else {
                        Icon(Icons.Default.Restore, contentDescription = null, modifier = Modifier.size(20.dp))
                        Spacer(Modifier.width(8.dp))
                        Text("Cancel Deletion & Restore Account", fontWeight = FontWeight.Bold, fontSize = 14.sp)
                    }
                }

                Spacer(Modifier.height(10.dp))

                // Button: Sign Out
                OutlinedButton(
                    onClick = { performSignOut() },
                    shape = RoundedCornerShape(12.dp),
                    border = BorderStroke(1.dp, Color(0xFFE2E8F0)),
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(48.dp)
                ) {
                    Icon(Icons.Default.Logout, contentDescription = null, tint = Color(0xFF64748B), modifier = Modifier.size(18.dp))
                    Spacer(Modifier.width(8.dp))
                    Text("Sign Out", color = Color(0xFF475569), fontWeight = FontWeight.SemiBold)
                }
            }

        } else {

            // =========================================================================
            // ACTIVE PATIENT PROFILE & SETTINGS
            // =========================================================================
            LazyColumn(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(padding)
                    .padding(horizontal = 16.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp),
                contentPadding = PaddingValues(bottom = 28.dp)
            ) {

                // Status Alert Banner (if any)
                if (statusMessage != null) {
                    item {
                        Surface(
                            color = Color(0xFFD1FAE5),
                            shape = RoundedCornerShape(12.dp),
                            border = BorderStroke(1.dp, Color(0xFFA7F3D0)),
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Row(
                                modifier = Modifier.padding(14.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.SpaceBetween
                            ) {
                                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.weight(1f)) {
                                    Icon(Icons.Default.CheckCircle, contentDescription = null, tint = Color(0xFF059669))
                                    Text(statusMessage ?: "", color = Color(0xFF065F46), fontSize = 12.sp, fontWeight = FontWeight.Medium)
                                }
                                IconButton(onClick = { statusMessage = null }) {
                                    Icon(Icons.Default.Close, contentDescription = "Close", tint = Color(0xFF047857), modifier = Modifier.size(16.dp))
                                }
                            }
                        }
                    }
                }

                // Patient Profile Header Card
                item {
                    Card(
                        shape = RoundedCornerShape(20.dp),
                        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.45f)),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Column(
                            modifier = Modifier.padding(20.dp),
                            verticalArrangement = Arrangement.spacedBy(14.dp)
                        ) {
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(16.dp)
                            ) {
                                Surface(
                                    shape = CircleShape,
                                    color = MaterialTheme.colorScheme.primary,
                                    modifier = Modifier.size(58.dp)
                                ) {
                                    Box(contentAlignment = Alignment.Center) {
                                        Icon(Icons.Default.Person, contentDescription = null, tint = Color.White, modifier = Modifier.size(34.dp))
                                    }
                                }

                                Column(modifier = Modifier.weight(1f)) {
                                    Text(
                                        text = userName?.ifBlank { null } ?: if (isLoggedIn) "Verified Patient" else "Guest Patient",
                                        fontWeight = FontWeight.Bold,
                                        fontSize = 18.sp
                                    )
                                    Text(
                                        text = userEmail?.ifBlank { null } ?: if (isLoggedIn) "Account Active" else "No account linked",
                                        fontSize = 13.sp,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant
                                    )
                                    if (!userPhone.isNullOrBlank()) {
                                        Text("+977 $userPhone", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant, fontWeight = FontWeight.Medium)
                                    }
                                    if (!userGender.isNullOrBlank() || userAge != null) {
                                        Text(
                                            listOfNotNull(
                                                userGender?.ifBlank { null },
                                                userAge?.let { "$it yrs" }
                                            ).joinToString(" • "),
                                            fontSize = 11.sp,
                                            color = MaterialTheme.colorScheme.primary,
                                            fontWeight = FontWeight.SemiBold
                                        )
                                    }
                                }
                            }

                            HorizontalDivider(modifier = Modifier.padding(vertical = 2.dp))

                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                if (isLoggedIn) {
                                    OutlinedButton(
                                        onClick = { openEditProfileDialog() },
                                        shape = RoundedCornerShape(10.dp),
                                        contentPadding = PaddingValues(horizontal = 12.dp, vertical = 6.dp)
                                    ) {
                                        Icon(Icons.Default.Edit, contentDescription = null, modifier = Modifier.size(15.dp))
                                        Spacer(Modifier.width(6.dp))
                                        Text("Edit Profile", fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
                                    }
                                } else {
                                    Button(
                                        onClick = { navController.navigate(NavRoutes.Login.route) },
                                        shape = RoundedCornerShape(10.dp),
                                        contentPadding = PaddingValues(horizontal = 14.dp, vertical = 6.dp)
                                    ) {
                                        Icon(Icons.Default.Login, contentDescription = null, modifier = Modifier.size(16.dp))
                                        Spacer(Modifier.width(6.dp))
                                        Text("Sign In / Register", fontSize = 12.sp)
                                    }
                                }

                                OutlinedButton(
                                    onClick = { showClaimDialog = true },
                                    shape = RoundedCornerShape(10.dp),
                                    contentPadding = PaddingValues(horizontal = 12.dp, vertical = 6.dp)
                                ) {
                                    Icon(Icons.Default.AddLink, contentDescription = null, modifier = Modifier.size(16.dp))
                                    Spacer(Modifier.width(6.dp))
                                    Text("Link 10-Digit Code", fontSize = 12.sp)
                                }
                            }
                        }
                    }
                }

                // Quick Info: Multi-Visit Returning Patient Benefit
                item {
                    Surface(
                        shape = RoundedCornerShape(12.dp),
                        color = Color(0xFFEFF6FF),
                        border = BorderStroke(1.dp, Color(0xFFBFDBFE)),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Row(
                            modifier = Modifier.padding(14.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(10.dp)
                        ) {
                            Icon(Icons.Default.Loyalty, contentDescription = null, tint = Color(0xFF2563EB))
                            Column {
                                Text("Returning Patient Follow-Up Access", fontWeight = FontWeight.Bold, fontSize = 13.sp, color = Color(0xFF1E40AF))
                                Text(
                                    "Your 10-digit codes can be reused for free follow-up bookings at multi-visit clinics in Nepal.",
                                    fontSize = 11.sp,
                                    color = Color(0xFF1E3A8A),
                                    lineHeight = 16.sp
                                )
                            }
                        }
                    }
                }

                // Section Header: Appointments
                item {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text("Your Active Appointments", fontWeight = FontWeight.Bold, fontSize = 16.sp)
                        TextButton(onClick = { navController.navigate(NavRoutes.TrackingLookup.route) }) {
                            Text("Track Another Code", fontSize = 12.sp)
                        }
                    }
                }

                // Appointments List
                if (isLoadingAppointments) {
                    item {
                        Box(modifier = Modifier.fillMaxWidth().padding(24.dp), contentAlignment = Alignment.Center) {
                            CircularProgressIndicator(modifier = Modifier.size(28.dp))
                        }
                    }
                } else if (savedAppointments.isEmpty()) {
                    item {
                        Card(
                            shape = RoundedCornerShape(14.dp),
                            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.4f)),
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Column(
                                modifier = Modifier.padding(24.dp),
                                horizontalAlignment = Alignment.CenterHorizontally,
                                verticalArrangement = Arrangement.spacedBy(8.dp)
                            ) {
                                Icon(Icons.Default.EventBusy, contentDescription = null, tint = MaterialTheme.colorScheme.outline, modifier = Modifier.size(36.dp))
                                Text("No appointments linked yet", fontWeight = FontWeight.SemiBold, fontSize = 14.sp)
                                Text(
                                    "Book an appointment or link an existing 10-digit code to view queue position in real-time.",
                                    fontSize = 12.sp,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    textAlign = TextAlign.Center
                                )
                                Button(
                                    onClick = { navController.navigate(NavRoutes.Discovery.route) },
                                    modifier = Modifier.padding(top = 8.dp),
                                    shape = RoundedCornerShape(10.dp)
                                ) {
                                    Text("Find Clinics & Book Now")
                                }
                            }
                        }
                    }
                } else {
                    items(savedAppointments, key = { it.id }) { appt ->
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
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Text(
                                        appt.patientName,
                                        fontWeight = FontWeight.Bold,
                                        fontSize = 15.sp,
                                        modifier = Modifier.weight(1f)
                                    )

                                    Surface(
                                        shape = RoundedCornerShape(8.dp),
                                        color = when (appt.checkinStatus) {
                                            "checked_in" -> Color(0xFF10B981).copy(alpha = 0.15f)
                                            "sample_given" -> Color(0xFF3B82F6).copy(alpha = 0.15f)
                                            else -> Color(0xFF6B7280).copy(alpha = 0.15f)
                                        }
                                    ) {
                                        Text(
                                            text = (appt.checkinStatus ?: "CONFIRMED").uppercase().replace('_', ' '),
                                            modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
                                            fontSize = 10.sp,
                                            fontWeight = FontWeight.Bold,
                                            color = when (appt.checkinStatus) {
                                                "checked_in" -> Color(0xFF047857)
                                                "sample_given" -> Color(0xFF1D4ED8)
                                                else -> Color(0xFF374151)
                                            }
                                        )
                                    }
                                }

                                // 10-Digit Code Display with Copy Button
                                Surface(
                                    shape = RoundedCornerShape(10.dp),
                                    color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f),
                                    modifier = Modifier.fillMaxWidth()
                                ) {
                                    Row(
                                        modifier = Modifier
                                            .padding(horizontal = 14.dp, vertical = 10.dp)
                                            .fillMaxWidth(),
                                        horizontalArrangement = Arrangement.SpaceBetween,
                                        verticalAlignment = Alignment.CenterVertically
                                    ) {
                                        Column {
                                            Text("10-Digit Tracking Code", fontSize = 10.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                            Text(
                                                appt.trackingCode10Digit,
                                                fontWeight = FontWeight.Bold,
                                                fontSize = 16.sp,
                                                fontFamily = FontFamily.Monospace,
                                                letterSpacing = 1.sp,
                                                color = MaterialTheme.colorScheme.primary
                                            )
                                        }

                                        IconButton(
                                            onClick = {
                                                clipboardManager.setText(AnnotatedString(appt.trackingCode10Digit))
                                                copiedCode = appt.trackingCode10Digit
                                            }
                                        ) {
                                            Icon(
                                                if (copiedCode == appt.trackingCode10Digit) Icons.Default.Check else Icons.Default.ContentCopy,
                                                contentDescription = "Copy Code",
                                                tint = if (copiedCode == appt.trackingCode10Digit) Color(0xFF059669) else MaterialTheme.colorScheme.onSurfaceVariant,
                                                modifier = Modifier.size(18.dp)
                                            )
                                        }
                                    }
                                }

                                // Date and Time
                                Row(
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(16.dp)
                                ) {
                                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                        Icon(Icons.Default.CalendarToday, contentDescription = null, tint = MaterialTheme.colorScheme.outline, modifier = Modifier.size(14.dp))
                                        Text(appt.appointmentDate, fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                    }
                                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                        Icon(Icons.Default.Schedule, contentDescription = null, tint = MaterialTheme.colorScheme.outline, modifier = Modifier.size(14.dp))
                                        Text(appt.appointmentTime, fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                    }
                                }

                                // Action Button
                                Button(
                                    onClick = {
                                        navController.navigate(NavRoutes.QueueStatus.createRoute(appt.trackingCode10Digit))
                                    },
                                    modifier = Modifier.fillMaxWidth(),
                                    shape = RoundedCornerShape(10.dp)
                                ) {
                                    Icon(Icons.Default.Radar, contentDescription = null, modifier = Modifier.size(16.dp))
                                    Spacer(Modifier.width(6.dp))
                                    Text("Track Live Queue", fontSize = 12.sp, fontWeight = FontWeight.Bold)
                                }
                            }
                        }
                    }
                }

                // =========================================================================
                // SETTINGS & ACCOUNT MANAGEMENT SECTION
                // =========================================================================
                item {
                    Card(
                        shape = RoundedCornerShape(18.dp),
                        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                            Text("Settings & Account Preferences", fontWeight = FontWeight.Bold, fontSize = 15.sp)
                            Spacer(Modifier.height(6.dp))

                            // 1. EDIT PROFILE DETAILS
                            if (isLoggedIn) {
                                Row(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .clickable { openEditProfileDialog() }
                                        .padding(vertical = 12.dp),
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.SpaceBetween
                                ) {
                                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                                        Surface(shape = CircleShape, color = MaterialTheme.colorScheme.primaryContainer, modifier = Modifier.size(36.dp)) {
                                            Box(contentAlignment = Alignment.Center) {
                                                Icon(Icons.Default.Edit, contentDescription = null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(18.dp))
                                            }
                                        }
                                        Column {
                                            Text("Edit Profile Details", fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
                                            Text("Name, phone, age, gender", fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                        }
                                    }
                                    Icon(Icons.Default.ChevronRight, contentDescription = null, tint = MaterialTheme.colorScheme.outline, modifier = Modifier.size(20.dp))
                                }

                                HorizontalDivider()
                            }

                            // 2. PUSH NOTIFICATION ALERTS
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .clickable { navController.navigate(NavRoutes.Notifications.route) }
                                    .padding(vertical = 12.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.SpaceBetween
                            ) {
                                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                                    Surface(shape = CircleShape, color = Color(0xFFEFF6FF), modifier = Modifier.size(36.dp)) {
                                        Box(contentAlignment = Alignment.Center) {
                                            Icon(Icons.Default.Notifications, contentDescription = null, tint = Color(0xFF2563EB), modifier = Modifier.size(18.dp))
                                        }
                                    }
                                    Column {
                                        Text("Push Notifications (FCM)", fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
                                        Text("Real-time live queue alerts & calls", fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                    }
                                }
                                Surface(shape = RoundedCornerShape(6.dp), color = Color(0xFFDCFCE7)) {
                                    Text("Active", fontSize = 11.sp, color = Color(0xFF15803D), fontWeight = FontWeight.Bold, modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp))
                                }
                            }

                            HorizontalDivider()

                            // 3. CLEAR SAVED HISTORY & CACHE
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .clickable {
                                        coroutineScope.launch {
                                            sessionManager?.clearSavedTrackingCodes()
                                            savedAppointments = emptyList()
                                            statusMessage = "Local history cache cleared."
                                        }
                                    }
                                    .padding(vertical = 12.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(12.dp)
                            ) {
                                Surface(shape = CircleShape, color = MaterialTheme.colorScheme.surfaceVariant, modifier = Modifier.size(36.dp)) {
                                    Box(contentAlignment = Alignment.Center) {
                                        Icon(Icons.Default.DeleteSweep, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.size(18.dp))
                                    }
                                }
                                Column {
                                    Text("Clear Saved Tracking Codes", fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
                                    Text("Reset local tracking codes on this device", fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                }
                            }

                            HorizontalDivider()

                            // TRANSACTION HISTORY OPTION
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .clickable {
                                        showTransactionHistoryDialog = true
                                        loadTransactionHistory()
                                    }
                                    .padding(vertical = 12.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.SpaceBetween
                            ) {
                                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                                    Surface(shape = CircleShape, color = Color(0xFFE0F2F1), modifier = Modifier.size(36.dp)) {
                                        Box(contentAlignment = Alignment.Center) {
                                            Icon(Icons.Default.ReceiptLong, contentDescription = null, tint = Color(0xFF00796B), modifier = Modifier.size(18.dp))
                                        }
                                    }
                                    Column {
                                        Text("Transaction History", fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
                                        Text("All appointment payments, times, and transaction IDs", fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                    }
                                }
                                Icon(Icons.Default.ChevronRight, contentDescription = null, tint = MaterialTheme.colorScheme.outline, modifier = Modifier.size(20.dp))
                            }

                            HorizontalDivider()

                            // TERMS AND CONDITIONS & PRIVACY POLICY
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .clickable { showTermsDialog = true }
                                    .padding(vertical = 12.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.SpaceBetween
                            ) {
                                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                                    Surface(shape = CircleShape, color = Color(0xFFF3E8FF), modifier = Modifier.size(36.dp)) {
                                        Box(contentAlignment = Alignment.Center) {
                                            Icon(Icons.Default.HealthAndSafety, contentDescription = null, tint = Color(0xFF7E22CE), modifier = Modifier.size(18.dp))
                                        }
                                    }
                                    Column {
                                        Text("Terms & Privacy Policy", fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
                                        Text("NMC healthcare compliance, data privacy & archive terms", fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                    }
                                }
                                Icon(Icons.Default.ChevronRight, contentDescription = null, tint = MaterialTheme.colorScheme.outline, modifier = Modifier.size(20.dp))
                            }

                                HorizontalDivider()

                                // PATIENT PRIVACY POLICY (OFFICIAL GITHUB PAGES URL)
                                Row(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .clickable {
                                            try {
                                                val intent = android.content.Intent(
                                                    android.content.Intent.ACTION_VIEW,
                                                    android.net.Uri.parse("https://dactorofficial.github.io/privacy-patient.html")
                                                )
                                                context.startActivity(intent)
                                            } catch (e: Exception) {
                                                android.widget.Toast.makeText(context, "Opening Patient Privacy Policy...", android.widget.Toast.LENGTH_SHORT).show()
                                            }
                                        }
                                        .padding(vertical = 12.dp),
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.SpaceBetween
                                ) {
                                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                                        Surface(shape = CircleShape, color = Color(0xFFECFDF5), modifier = Modifier.size(36.dp)) {
                                            Box(contentAlignment = Alignment.Center) {
                                                Icon(Icons.Default.Security, contentDescription = null, tint = Color(0xFF059669), modifier = Modifier.size(18.dp))
                                            }
                                        }
                                        Column {
                                            Text("Patient Privacy Policy", fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
                                            Text("Official online policy hosted on GitHub Pages", fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                        }
                                    }
                                    Icon(Icons.Default.OpenInBrowser, contentDescription = null, tint = MaterialTheme.colorScheme.outline, modifier = Modifier.size(20.dp))
                                }

                                HorizontalDivider()

                                // CONTACT US & OFFICIAL HELPDESK
                                Row(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .clickable {
                                            try {
                                                val intent = android.content.Intent(
                                                    android.content.Intent.ACTION_VIEW,
                                                    android.net.Uri.parse("https://dactorofficial.github.io/support")
                                                )
                                                context.startActivity(intent)
                                            } catch (e: Exception) {
                                                android.widget.Toast.makeText(context, "Opening support site...", android.widget.Toast.LENGTH_SHORT).show()
                                            }
                                        }
                                        .padding(vertical = 12.dp),
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(12.dp)
                                ) {
                                    Surface(shape = CircleShape, color = Color(0xFFEFF6FF), modifier = Modifier.size(36.dp)) {
                                        Box(contentAlignment = Alignment.Center) {
                                            Icon(Icons.Default.SupportAgent, contentDescription = null, tint = Color(0xFF2563EB), modifier = Modifier.size(18.dp))
                                        }
                                    }
                                    Column(modifier = Modifier.weight(1f)) {
                                        Text("Contact Us & Dactor Helpdesk", fontSize = 14.sp, color = Color(0xFF1E40AF), fontWeight = FontWeight.Bold)
                                        Text("24/7 Dactor support, FAQs, and ticket resolution", fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                    }
                                    Icon(Icons.Default.OpenInNew, contentDescription = null, tint = MaterialTheme.colorScheme.outline, modifier = Modifier.size(16.dp))
                                }

                                HorizontalDivider()

                                // 4. SIGN OUT OPTION
                                Row(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .clickable { showSignOutConfirmDialog = true }
                                        .padding(vertical = 12.dp),
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(12.dp)
                                ) {
                                    Surface(shape = CircleShape, color = Color(0xFFFEF2F2), modifier = Modifier.size(36.dp)) {
                                        Box(contentAlignment = Alignment.Center) {
                                            Icon(Icons.Default.Logout, contentDescription = null, tint = Color(0xFFDC2626), modifier = Modifier.size(18.dp))
                                        }
                                    }
                                    Column {
                                        Text("Sign Out", fontSize = 14.sp, color = Color(0xFFDC2626), fontWeight = FontWeight.Bold)
                                        Text("Log out from your Dactor session on this device", fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                    }
                                }

                                HorizontalDivider()

                                // 5. DELETE ACCOUNT (30-DAY ARCHIVE)
                                Row(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .clickable { showDeleteAccountDialog = true }
                                        .padding(vertical = 12.dp),
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(12.dp)
                                ) {
                                    Surface(shape = CircleShape, color = Color(0xFFFEE2E2), modifier = Modifier.size(36.dp)) {
                                        Box(contentAlignment = Alignment.Center) {
                                            Icon(Icons.Default.DeleteForever, contentDescription = null, tint = Color(0xFFB91C1C), modifier = Modifier.size(18.dp))
                                        }
                                    }
                                    Column {
                                        Text("Delete Account", fontSize = 14.sp, color = Color(0xFFB91C1C), fontWeight = FontWeight.Bold)
                                        Text("30-day archive period • Clinic appointments preserved", fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

    // =========================================================================
    // DIALOG 1: EDIT PROFILE DETAILS
    // =========================================================================
    if (showEditProfileDialog) {
        var editValidationTriggered by remember { mutableStateOf(false) }
        val isNameError = (editValidationTriggered || editNameInput.isNotEmpty()) && editNameInput.trim().length < 2
        val isPhoneError = (editValidationTriggered || editPhoneDigits.isNotEmpty()) && (editPhoneDigits.length != 10 || !editPhoneDigits.startsWith("9"))
        val isGenderError = editValidationTriggered && editGenderChoice.isBlank()
        val parsedAge = editAgeInput.trim().toIntOrNull()
        val isAgeError = (editValidationTriggered || editAgeInput.isNotEmpty()) && (parsedAge == null || parsedAge !in 1..120)

        AlertDialog(
            onDismissRequest = {
                if (!isSavingProfile) showEditProfileDialog = false
            },
            title = {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Icon(Icons.Default.Edit, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
                    Text("Edit Profile Details", fontWeight = FontWeight.Bold)
                }
            },
            text = {
                Column(
                    modifier = Modifier.fillMaxWidth(),
                    verticalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    if (editProfileError != null) {
                        Surface(
                            color = MaterialTheme.colorScheme.errorContainer,
                            shape = RoundedCornerShape(8.dp),
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Text(
                                text = editProfileError ?: "",
                                color = MaterialTheme.colorScheme.onErrorContainer,
                                modifier = Modifier.padding(10.dp),
                                fontSize = 12.sp,
                                fontWeight = FontWeight.Medium
                            )
                        }
                    }

                    // Full Name
                    OutlinedTextField(
                        value = editNameInput,
                        onValueChange = {
                            editNameInput = it
                            if (editProfileError != null) editProfileError = null
                        },
                        label = { Text("Full Name *") },
                        placeholder = { Text("Enter full name") },
                        leadingIcon = { Icon(Icons.Default.Person, contentDescription = null) },
                        isError = isNameError,
                        supportingText = if (isNameError) {
                            { Text("Required: Enter at least 2 characters", color = MaterialTheme.colorScheme.error, fontSize = 11.sp) }
                        } else null,
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(10.dp)
                    )

                    // Phone Number with Nepal +977 prefix
                    OutlinedTextField(
                        value = editPhoneDigits,
                        onValueChange = {
                            if (it.length <= 10 && it.all { ch -> ch.isDigit() }) {
                                editPhoneDigits = it
                                if (editProfileError != null) editProfileError = null
                            }
                        },
                        label = { Text("Mobile Number (Nepal) *") },
                        placeholder = { Text("98xxxxxxxx") },
                        prefix = { Text("+977 ", fontWeight = FontWeight.Bold) },
                        leadingIcon = { Icon(Icons.Default.Phone, contentDescription = null) },
                        isError = isPhoneError,
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone),
                        singleLine = true,
                        supportingText = {
                            if (isPhoneError) {
                                Text(
                                    text = "Required: 10 digits starting with 9 (${editPhoneDigits.length}/10)",
                                    fontSize = 11.sp,
                                    color = MaterialTheme.colorScheme.error
                                )
                            } else {
                                Text(
                                    text = "${editPhoneDigits.length}/10 digits",
                                    fontSize = 11.sp,
                                    color = if (editPhoneDigits.length == 10 && editPhoneDigits.startsWith("9")) Color(0xFF047857) else MaterialTheme.colorScheme.onSurfaceVariant
                                )
                            }
                        },
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(10.dp)
                    )

                    // Gender Chips
                    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Text(
                            "Gender *",
                            fontSize = 12.sp,
                            fontWeight = FontWeight.SemiBold,
                            color = if (isGenderError) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurface
                        )
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            listOf("Male", "Female", "Other").forEach { g ->
                                FilterChip(
                                    selected = editGenderChoice == g,
                                    onClick = {
                                        editGenderChoice = g
                                        if (editProfileError != null) editProfileError = null
                                    },
                                    label = { Text(g, fontSize = 11.sp) },
                                    border = FilterChipDefaults.filterChipBorder(
                                        enabled = true,
                                        selected = editGenderChoice == g,
                                        borderColor = if (isGenderError) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.outline
                                    )
                                )
                            }
                        }
                        if (isGenderError) {
                            Text("Required: Select gender", fontSize = 11.sp, color = MaterialTheme.colorScheme.error)
                        }
                    }

                    // Age
                    OutlinedTextField(
                        value = editAgeInput,
                        onValueChange = {
                            if (it.length <= 3 && it.all { ch -> ch.isDigit() }) {
                                editAgeInput = it
                                if (editProfileError != null) editProfileError = null
                            }
                        },
                        label = { Text("Age (Years) *") },
                        placeholder = { Text("1 - 120") },
                        leadingIcon = { Icon(Icons.Default.Cake, contentDescription = null) },
                        isError = isAgeError,
                        supportingText = if (isAgeError) {
                            { Text("Required: Valid age between 1 and 120", color = MaterialTheme.colorScheme.error, fontSize = 11.sp) }
                        } else null,
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(10.dp)
                    )
                }
            },
            confirmButton = {
                Button(
                    onClick = {
                        editValidationTriggered = true
                        saveProfileChanges()
                    },
                    enabled = !isSavingProfile,
                    shape = RoundedCornerShape(10.dp)
                ) {
                    if (isSavingProfile) {
                        CircularProgressIndicator(modifier = Modifier.size(16.dp), color = MaterialTheme.colorScheme.onPrimary, strokeWidth = 2.dp)
                        Spacer(Modifier.width(6.dp))
                        Text("Saving...")
                    } else {
                        Text("Save Changes")
                    }
                }
            },
            dismissButton = {
                TextButton(
                    onClick = { showEditProfileDialog = false },
                    enabled = !isSavingProfile
                ) {
                    Text("Cancel")
                }
            }
        )
    }

    // =========================================================================
    // DIALOG 2: DELETE ACCOUNT CONFIRMATION (30-DAY ARCHIVE)
    // =========================================================================
    if (showDeleteAccountDialog) {
        val scheduledDateDisplay = LocalDate.now().plusDays(30).toString()

        AlertDialog(
            onDismissRequest = {
                if (!isDeletingAccount) showDeleteAccountDialog = false
            },
            icon = {
                Surface(
                    shape = CircleShape,
                    color = Color(0xFFFEE2E2),
                    modifier = Modifier.size(48.dp)
                ) {
                    Box(contentAlignment = Alignment.Center) {
                        Icon(Icons.Default.Warning, contentDescription = null, tint = Color(0xFFDC2626), modifier = Modifier.size(26.dp))
                    }
                }
            },
            title = {
                Text("Delete Account?", fontWeight = FontWeight.Bold, textAlign = TextAlign.Center)
            },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Text(
                        "Are you sure you want to schedule your account for deletion?",
                        fontSize = 13.sp,
                        fontWeight = FontWeight.SemiBold
                    )

                    Surface(
                        color = Color(0xFFFEF2F2),
                        shape = RoundedCornerShape(10.dp),
                        border = BorderStroke(1.dp, Color(0xFFFECACA)),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                            Text(
                                "• 30-Day Archive: Your account will be archived for 30 days and deleted on $scheduledDateDisplay.",
                                fontSize = 12.sp,
                                color = Color(0xFF991B1B)
                            )
                            Text(
                                "• Device Logout: You will be logged out of this device immediately.",
                                fontSize = 12.sp,
                                color = Color(0xFF991B1B)
                            )
                            Text(
                                "• Clinic Records Safe: All your past appointment details and medical history in every clinic will safely stay preserved in clinic records. Nothing in Supabase will be wiped.",
                                fontSize = 12.sp,
                                color = Color(0xFF166534),
                                fontWeight = FontWeight.SemiBold
                            )
                            Text(
                                "• Restore Anytime: If you log in during the 30-day grace period, you will see your day countdown and can cancel the deletion with a single tap.",
                                fontSize = 12.sp,
                                color = Color(0xFF1E40AF)
                            )
                        }
                    }
                }
            },
            confirmButton = {
                Button(
                    onClick = { performScheduleDeletion() },
                    enabled = !isDeletingAccount,
                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFDC2626)),
                    shape = RoundedCornerShape(10.dp)
                ) {
                    if (isDeletingAccount) {
                        CircularProgressIndicator(modifier = Modifier.size(16.dp), color = Color.White, strokeWidth = 2.dp)
                        Spacer(Modifier.width(6.dp))
                        Text("Archiving...")
                    } else {
                        Text("Archive & Delete Account")
                    }
                }
            },
            dismissButton = {
                OutlinedButton(
                    onClick = { showDeleteAccountDialog = false },
                    enabled = !isDeletingAccount,
                    shape = RoundedCornerShape(10.dp)
                ) {
                    Text("Keep Account")
                }
            }
        )
    }

    // =========================================================================
    // DIALOG 3: SIGN OUT CONFIRMATION
    // =========================================================================
    if (showSignOutConfirmDialog) {
        AlertDialog(
            onDismissRequest = { showSignOutConfirmDialog = false },
            icon = {
                Icon(Icons.Default.Logout, contentDescription = null, tint = MaterialTheme.colorScheme.error)
            },
            title = {
                Text("Sign Out", fontWeight = FontWeight.Bold)
            },
            text = {
                Text("Are you sure you want to sign out from your Dactor patient account on this mobile device?", fontSize = 13.sp)
            },
            confirmButton = {
                Button(
                    onClick = {
                        showSignOutConfirmDialog = false
                        performSignOut()
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.error),
                    shape = RoundedCornerShape(10.dp)
                ) {
                    Text("Sign Out")
                }
            },
            dismissButton = {
                TextButton(onClick = { showSignOutConfirmDialog = false }) {
                    Text("Cancel")
                }
            }
        )
    }

    // =========================================================================
    // DIALOG 4: CLAIM 10-DIGIT TRACKING CODE
    // =========================================================================
    if (showClaimDialog) {
        AlertDialog(
            onDismissRequest = {
                showClaimDialog = false
                claimStatusMessage = null
            },
            title = {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Icon(Icons.Default.AddLink, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
                    Text("Link 10-Digit Code", fontWeight = FontWeight.Bold, fontSize = 16.sp)
                }
            },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    Text(
                        "Did you book an appointment as a guest or receive a token from the clinic front desk? Enter your 10-digit code to link it to your active list.",
                        fontSize = 12.sp,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )

                    OutlinedTextField(
                        value = claimCodeInput,
                        onValueChange = { input ->
                            val digitsOnly = input.filter { it.isDigit() }
                            if (digitsOnly.length <= 10) claimCodeInput = digitsOnly
                        },
                        label = { Text("10-Digit Numeric Code") },
                        placeholder = { Text("e.g. 9841203841") },
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )

                    AnimatedVisibility(visible = claimStatusMessage != null) {
                        Text(
                            text = claimStatusMessage ?: "",
                            color = MaterialTheme.colorScheme.error,
                            fontSize = 12.sp
                        )
                    }
                }
            },
            confirmButton = {
                Button(
                    onClick = { handleClaimCode() },
                    enabled = claimCodeInput.length == 10 && !isClaiming
                ) {
                    if (isClaiming) {
                        CircularProgressIndicator(modifier = Modifier.size(16.dp), color = MaterialTheme.colorScheme.onPrimary, strokeWidth = 2.dp)
                    } else {
                        Text("Link Code")
                    }
                }
            },
            dismissButton = {
                TextButton(onClick = {
                    showClaimDialog = false
                    claimStatusMessage = null
                }) {
                    Text("Cancel")
                }
            }
        )
    }

    // TERMS AND CONDITIONS DIALOG
    if (showTermsDialog) {
        com.dactor.patient.ui.legal.TermsAndConditionsDialog(
            onDismiss = { showTermsDialog = false }
        )
    }

    // TRANSACTION HISTORY DIALOG
    if (showTransactionHistoryDialog) {
        PatientTransactionHistoryDialog(
            transactions = transactionHistoryList,
            isLoading = isLoadingTransactions,
            onRefresh = { loadTransactionHistory() },
            onDismiss = { showTransactionHistoryDialog = false }
        )
    }
}
