package com.dactor.patient.ui.auth

import android.app.Activity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.positionInRoot
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import com.dactor.patient.R
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.navigation.NavController
import com.dactor.patient.data.local.RegistrationDraftManager
import com.dactor.patient.data.local.UserSessionManager
import com.dactor.patient.data.repository.AuthRepository
import com.dactor.patient.ui.navigation.NavRoutes
import com.google.android.gms.auth.api.signin.GoogleSignIn
import com.google.android.gms.auth.api.signin.GoogleSignInAccount
import com.google.android.gms.auth.api.signin.GoogleSignInOptions
import com.google.android.gms.common.api.ApiException
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.auth.GoogleAuthProvider
import android.accounts.AccountManager
import com.google.android.gms.common.AccountPicker
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await
import java.util.UUID

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LoginScreen(
    navController: NavController,
    authRepository: AuthRepository? = null,
    draftManager: RegistrationDraftManager? = null,
    sessionManager: UserSessionManager? = null,
    appointmentRepository: com.dactor.patient.data.repository.AppointmentRepository? = null
) {
    val context = LocalContext.current
    val coroutineScope = rememberCoroutineScope()
    val scrollState = rememberScrollState()

    var currentView by remember { mutableStateOf("auth_choice") } // "auth_choice" or "register_form"
    var authActionIntent by remember { mutableStateOf("login") } // "login" or "register"

    var isLoading by remember { mutableStateOf(false) }
    var errorMessage by remember { mutableStateOf<String?>(null) }
    var statusInfo by remember { mutableStateOf<String?>(null) }

    // Google Account Details
    var googleAccount by remember { mutableStateOf<GoogleSignInAccount?>(null) }
    var verifiedEmail by remember { mutableStateOf("") }
    var verifiedDisplayName by remember { mutableStateOf("") }

    // Patient Registration Form Inputs (never prefilled from Google account or demo defaults)
    var patientName by remember { mutableStateOf("") }
    var patientPhone by remember { mutableStateOf("") }
    var patientAge by remember { mutableStateOf("") }
    var patientGender by remember { mutableStateOf("") }
    var patientCity by remember { mutableStateOf("") }
    var showTermsDialog by remember { mutableStateOf(false) }
    var patientTermsAccepted by remember { mutableStateOf(false) }
    var validationTriggered by remember { mutableStateOf(false) }

    val nameFocusRequester = remember { FocusRequester() }
    val phoneFocusRequester = remember { FocusRequester() }
    val ageFocusRequester = remember { FocusRequester() }

    var nameFieldY by remember { mutableIntStateOf(0) }
    var phoneFieldY by remember { mutableIntStateOf(0) }
    var ageFieldY by remember { mutableIntStateOf(0) }
    var genderFieldY by remember { mutableIntStateOf(0) }
    var termsFieldY by remember { mutableIntStateOf(0) }

    val cleanPhoneDigits = patientPhone.filter { it.isDigit() }
    val parsedAge = patientAge.trim().toIntOrNull()
    val isNameError = (validationTriggered || patientName.isNotEmpty()) && patientName.trim().length < 2
    val isPhoneError = (validationTriggered || patientPhone.isNotEmpty()) && (cleanPhoneDigits.length != 10 || !cleanPhoneDigits.startsWith("9"))
    val isAgeError = (validationTriggered || patientAge.isNotEmpty()) && (parsedAge == null || parsedAge !in 1..120)
    val isGenderError = validationTriggered && patientGender.isBlank()
    val isTermsError = validationTriggered && !patientTermsAccepted

    val googleSignInClient = remember {
        val defaultWebClientId = try {
            val resId = context.resources.getIdentifier("default_web_client_id", "string", context.packageName)
            if (resId != 0) context.getString(resId) else null
        } catch (e: Exception) { null } ?: "429529188002-58s8gufhr6fheu6dd7hfnqi7i5dh4163.apps.googleusercontent.com"

        val gsoBuilder = GoogleSignInOptions.Builder(GoogleSignInOptions.DEFAULT_SIGN_IN)
            .requestEmail()
            .requestProfile()
            .requestIdToken(defaultWebClientId)
        GoogleSignIn.getClient(context, gsoBuilder.build())
    }

    fun proceedWithGoogleAccount(email: String) {
        val trimmedEmail = email.trim().lowercase()
        if (trimmedEmail.isBlank()) {
            isLoading = false
            statusInfo = null
            return
        }
        verifiedEmail = trimmedEmail
        verifiedDisplayName = ""

        isLoading = true
        statusInfo = "Checking account portal association..."
        errorMessage = null

        coroutineScope.launch {
            try {
                // 0. Enforce 1 Google Account = 1 Portal Role rule (cannot use Doctor or Clinic email in Patient Portal)
                val portalAssoc = try {
                    authRepository?.checkPortalAssociation(trimmedEmail)
                } catch (e: Exception) {
                    null
                }

                if (portalAssoc != null && portalAssoc.portal != "patient") {
                    runCatching { googleSignInClient.signOut() }
                    runCatching { FirebaseAuth.getInstance().signOut() }
                    verifiedEmail = ""
                    verifiedDisplayName = ""
                    googleAccount = null
                    isLoading = false
                    statusInfo = null
                    currentView = "auth_choice"
                    val entitySuffix = if (portalAssoc.entityName.isNotBlank()) " (${portalAssoc.entityName})" else ""
                    errorMessage = "This Google account ($trimmedEmail) is already associated with a ${portalAssoc.portalLabel} account$entitySuffix. You cannot log in to the Patient Portal with this Google ID. Please change your Google account."
                    return@launch
                }

                // 1. Check existing patient profile in Supabase
                val existingProfile = try {
                    authRepository?.getProfileByEmail(trimmedEmail)
                } catch (e: Exception) {
                    null
                }

                val linkedAppts = try {
                    appointmentRepository?.getAllPatientAppointments(
                        userId = existingProfile?.id,
                        email = trimmedEmail,
                        phone = existingProfile?.phone
                    ).orEmpty()
                } catch (e: Exception) {
                    emptyList()
                }

                val latestAppt = linkedAppts.firstOrNull()
                val hasCompletedProfile = existingProfile != null &&
                        !existingProfile.fullName.isNullOrBlank() &&
                        !existingProfile.phone.isNullOrBlank()
                val hasKnownIdentity = hasCompletedProfile ||
                        (latestAppt != null && latestAppt.patientName.isNotBlank() && latestAppt.patientMobile.isNotBlank())

                if (hasKnownIdentity) {
                    val profileId = existingProfile?.id ?: UUID.randomUUID().toString()
                    val resolvedName = existingProfile?.fullName?.takeIf { it.isNotBlank() }
                        ?: latestAppt?.patientName.orEmpty()
                    val resolvedPhone = existingProfile?.phone?.takeIf { it.isNotBlank() }
                        ?: latestAppt?.patientMobile.orEmpty()
                    val resolvedGender = existingProfile?.gender?.takeIf { it.isNotBlank() }
                        ?: latestAppt?.patientGender
                    val resolvedAge = existingProfile?.age ?: latestAppt?.patientAge

                    // Retroactively link any appointments booked with this email/phone
                    try {
                        authRepository?.syncPatientProfile(
                            userId = profileId,
                            email = trimmedEmail,
                            fullName = resolvedName,
                            phone = resolvedPhone,
                            gender = resolvedGender,
                            age = resolvedAge
                        )
                    } catch (e: Exception) {
                        e.printStackTrace()
                    }

                    val allLinkedAppts = try {
                        appointmentRepository?.getAllPatientAppointments(
                            userId = profileId,
                            email = trimmedEmail,
                            phone = resolvedPhone
                        ).orEmpty()
                    } catch (e: Exception) {
                        linkedAppts
                    }

                    for (appt in allLinkedAppts) {
                        if (appt.trackingCode10Digit.isNotBlank()) {
                            sessionManager?.saveTrackingCode(
                                appt.trackingCode10Digit,
                                "${appt.patientName} • ${appt.appointmentDate}"
                            )
                        }
                    }

                    val isArchived = existingProfile?.isArchived == true

                    sessionManager?.savePatientSession(
                        patientId = profileId,
                        email = trimmedEmail,
                        name = resolvedName,
                        phone = resolvedPhone,
                        gender = resolvedGender,
                        age = resolvedAge,
                        isArchived = isArchived,
                        deletionScheduledAt = existingProfile?.deletionScheduledAt
                    )

                    isLoading = false
                    statusInfo = null

                    val pendingRedirect = sessionManager?.getPendingBookingRedirect()
                    if (isArchived) {
                        navController.navigate(NavRoutes.Profile.route) {
                            popUpTo(0) { inclusive = true }
                        }
                    } else if (pendingRedirect != null && pendingRedirect.route.isNotBlank()) {
                        sessionManager?.clearPendingBookingRedirect()
                        navController.navigate(pendingRedirect.route) {
                            popUpTo(NavRoutes.Login.route) { inclusive = true }
                            launchSingleTop = true
                        }
                    } else {
                        navController.navigate(NavRoutes.PatientMain.route) {
                            popUpTo(0) { inclusive = true }
                        }
                    }
                } else {
                    // First-time patient sign-in: never prefill name, gender, or age from Google account
                    patientName = ""
                    patientPhone = ""
                    patientAge = ""
                    patientGender = ""
                    validationTriggered = false
                    isLoading = false
                    statusInfo = null
                    currentView = "register_form"
                }
            } catch (e: Exception) {
                // On lookup failure for first-time user, show registration form with blank fields
                patientName = ""
                patientPhone = ""
                patientAge = ""
                patientGender = ""
                validationTriggered = false
                isLoading = false
                statusInfo = null
                currentView = "register_form"
            }
        }
    }

    LaunchedEffect(Unit) {
        val pendingEmail = sessionManager?.consumePendingVerifiedEmail()
        if (!pendingEmail.isNullOrBlank()) {
            proceedWithGoogleAccount(pendingEmail)
        }
    }

    val accountPickerLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.StartActivityForResult()
    ) { result ->
        if (result.resultCode == Activity.RESULT_OK) {
            val email = result.data?.getStringExtra(AccountManager.KEY_ACCOUNT_NAME)
            if (!email.isNullOrBlank()) {
                proceedWithGoogleAccount(email)
            } else {
                isLoading = false
                statusInfo = null
            }
        } else {
            isLoading = false
            statusInfo = null
        }
    }

    val googleSignInLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.StartActivityForResult()
    ) { result ->
        if (result.resultCode == Activity.RESULT_OK) {
            val task = GoogleSignIn.getSignedInAccountFromIntent(result.data)
            try {
                val account = task.getResult(ApiException::class.java)
                if (account != null && !account.email.isNullOrBlank()) {
                    val idToken = account.idToken
                    if (!idToken.isNullOrBlank()) {
                        try {
                            val credential = GoogleAuthProvider.getCredential(idToken, null)
                            FirebaseAuth.getInstance().signInWithCredential(credential)
                        } catch (e: Exception) {
                            e.printStackTrace()
                        }
                    }
                    googleAccount = account
                    verifiedDisplayName = account.displayName ?: ""
                    proceedWithGoogleAccount(account.email!!)
                    return@rememberLauncherForActivityResult
                }
            } catch (e: Exception) {
                e.printStackTrace()
                isLoading = false
                statusInfo = null
                errorMessage = "Google Sign-In failed: ${e.message ?: "Code ${(e as? ApiException)?.statusCode}"}"
                return@rememberLauncherForActivityResult
            }
        }
        isLoading = false
        statusInfo = null
    }

    fun launchGoogleSignInFlow() {
        if (isLoading) return
        isLoading = true
        errorMessage = null
        statusInfo = "Opening Google Sign-In..."

        try {
            googleSignInClient.signOut().addOnCompleteListener {
                googleSignInLauncher.launch(googleSignInClient.signInIntent)
            }
        } catch (e: Exception) {
            try {
                googleSignInLauncher.launch(googleSignInClient.signInIntent)
            } catch (e2: Exception) {
                isLoading = false
                statusInfo = null
                errorMessage = "Could not open Google Sign-In: ${e2.message}"
            }
        }
    }

    fun switchGoogleAccount() {
        isLoading = true
        errorMessage = null
        statusInfo = "Opening Google account chooser..."
        verifiedEmail = ""
        verifiedDisplayName = ""
        googleAccount = null
        currentView = "auth_choice"

        runCatching { FirebaseAuth.getInstance().signOut() }
        try {
            googleSignInClient.signOut().addOnCompleteListener {
                try {
                    val pickerIntent = AccountPicker.newChooseAccountIntent(
                        AccountPicker.AccountChooserOptions.Builder()
                            .setAllowableAccountsTypes(listOf("com.google"))
                            .build()
                    )
                    accountPickerLauncher.launch(pickerIntent)
                } catch (e: Exception) {
                    try {
                        googleSignInLauncher.launch(googleSignInClient.signInIntent)
                    } catch (e2: Exception) {
                        isLoading = false
                        statusInfo = null
                        errorMessage = "Could not open Google account chooser: ${e2.message}"
                    }
                }
            }
        } catch (e: Exception) {
            try {
                val pickerIntent = AccountPicker.newChooseAccountIntent(
                    AccountPicker.AccountChooserOptions.Builder()
                        .setAllowableAccountsTypes(listOf("com.google"))
                        .build()
                )
                accountPickerLauncher.launch(pickerIntent)
            } catch (e2: Exception) {
                try {
                    googleSignInLauncher.launch(googleSignInClient.signInIntent)
                } catch (e3: Exception) {
                    isLoading = false
                    statusInfo = null
                    errorMessage = "Could not open Google account chooser: ${e3.message}"
                }
            }
        }
    }

    fun submitPatientRegistration() {
        validationTriggered = true
        val digits = patientPhone.filter { it.isDigit() }
        val cleanAge = patientAge.trim().toIntOrNull()

        if (patientName.trim().length < 2) {
            errorMessage = "Please enter your full name (at least 2 characters)."
            coroutineScope.launch {
                scrollState.animateScrollTo((nameFieldY - 200).coerceAtLeast(0))
                runCatching { nameFocusRequester.requestFocus() }
            }
            return
        }
        if (digits.length != 10 || !digits.startsWith("9")) {
            errorMessage = "Please enter a valid 10-digit mobile number starting with 9."
            coroutineScope.launch {
                scrollState.animateScrollTo((phoneFieldY - 200).coerceAtLeast(0))
                runCatching { phoneFocusRequester.requestFocus() }
            }
            return
        }
        if (cleanAge == null || cleanAge !in 1..120) {
            errorMessage = "Please enter a valid age between 1 and 120."
            coroutineScope.launch {
                scrollState.animateScrollTo((ageFieldY - 200).coerceAtLeast(0))
                runCatching { ageFocusRequester.requestFocus() }
            }
            return
        }
        if (patientGender.isBlank()) {
            errorMessage = "Please select your gender."
            coroutineScope.launch {
                scrollState.animateScrollTo((genderFieldY - 200).coerceAtLeast(0))
            }
            return
        }
        if (!patientTermsAccepted) {
            errorMessage = "Please review and accept the Terms & Conditions and Privacy Policy to register."
            coroutineScope.launch {
                scrollState.animateScrollTo((termsFieldY - 200).coerceAtLeast(0))
            }
            return
        }
        isLoading = true
        errorMessage = null
        statusInfo = "Creating patient profile in Supabase..."

        coroutineScope.launch {
            try {
                val newProfileId = UUID.randomUUID().toString()
                val email = verifiedEmail.trim().lowercase()

                val portalAssoc = try {
                    authRepository?.checkPortalAssociation(email)
                } catch (e: Exception) {
                    null
                }
                if (portalAssoc != null && portalAssoc.portal != "patient") {
                    runCatching { googleSignInClient.signOut() }
                    runCatching { FirebaseAuth.getInstance().signOut() }
                    verifiedEmail = ""
                    isLoading = false
                    statusInfo = null
                    currentView = "auth_choice"
                    val entitySuffix = if (portalAssoc.entityName.isNotBlank()) " (${portalAssoc.entityName})" else ""
                    errorMessage = "This Google account ($email) is already associated with a ${portalAssoc.portalLabel} account$entitySuffix. You cannot register in the Patient Portal with this Google ID. Please change your Google account."
                    return@launch
                }

                authRepository?.syncPatientProfile(
                    userId = newProfileId,
                    email = email,
                    fullName = patientName.trim(),
                    phone = patientPhone.trim(),
                    gender = patientGender,
                    age = cleanAge
                )

                val syncedProfile = try {
                    authRepository?.getProfileByEmail(email)
                } catch (e: Exception) {
                    null
                }
                val finalProfileId = syncedProfile?.id ?: newProfileId

                val linkedAppts = try {
                    appointmentRepository?.getAllPatientAppointments(
                        userId = finalProfileId,
                        email = email,
                        phone = patientPhone.trim()
                    ).orEmpty()
                } catch (e: Exception) {
                    emptyList()
                }
                for (appt in linkedAppts) {
                    if (appt.trackingCode10Digit.isNotBlank()) {
                        sessionManager?.saveTrackingCode(
                            appt.trackingCode10Digit,
                            "${appt.patientName} • ${appt.appointmentDate}"
                        )
                    }
                }

                sessionManager?.savePatientSession(
                    patientId = finalProfileId,
                    email = email,
                    name = patientName.trim(),
                    phone = patientPhone.trim(),
                    gender = patientGender,
                    age = cleanAge,
                    isArchived = false,
                    deletionScheduledAt = null
                )

                isLoading = false
                statusInfo = null
                val pendingRedirect = sessionManager?.getPendingBookingRedirect()
                if (pendingRedirect != null && pendingRedirect.route.isNotBlank()) {
                    sessionManager?.clearPendingBookingRedirect()
                    navController.navigate(pendingRedirect.route) {
                        popUpTo(NavRoutes.Login.route) { inclusive = true }
                        launchSingleTop = true
                    }
                } else {
                    navController.navigate(NavRoutes.PatientMain.route) {
                        popUpTo(0) { inclusive = true }
                    }
                }
            } catch (e: Exception) {
                isLoading = false
                statusInfo = null
                errorMessage = "Registration failed: ${e.message}"
            }
        }
    }

    val hasPendingBooking = remember { sessionManager?.getPendingBookingRedirect() != null }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        if (currentView == "register_form") "Patient Registration" else "Patient Sign In",
                        fontWeight = FontWeight.Bold
                    )
                },
                navigationIcon = {
                    if (currentView == "register_form") {
                        IconButton(onClick = {
                            currentView = "auth_choice"
                            errorMessage = null
                        }) {
                            Icon(Icons.Default.ArrowBack, contentDescription = "Back")
                        }
                    } else {
                        IconButton(onClick = {
                            sessionManager?.clearPendingBookingRedirect()
                            navController.popBackStack()
                        }) {
                            Icon(Icons.Default.ArrowBack, contentDescription = "Back")
                        }
                    }
                }
            )
        }
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .background(MaterialTheme.colorScheme.background)
                .verticalScroll(scrollState)
                .padding(horizontal = 24.dp, vertical = 18.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(20.dp)
        ) {
            if (hasPendingBooking) {
                Surface(
                    color = Color(0xFFE3F2FD),
                    shape = RoundedCornerShape(14.dp),
                    border = BorderStroke(1.dp, Color(0xFF1E88E5).copy(alpha = 0.35f)),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Row(
                        modifier = Modifier.padding(14.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(10.dp)
                    ) {
                        Icon(
                            Icons.Default.EventAvailable,
                            contentDescription = null,
                            tint = Color(0xFF1E88E5),
                            modifier = Modifier.size(22.dp)
                        )
                        Column(modifier = Modifier.weight(1f)) {
                            Text(
                                text = "Sign In Required to Book Appointment",
                                color = Color(0xFF0F172A),
                                fontSize = 13.sp,
                                fontWeight = FontWeight.Bold
                            )
                            Text(
                                text = "Your selected clinic, doctor, date, and slot position are saved. You'll return right where you left off after signing in.",
                                color = Color(0xFF1565C0),
                                fontSize = 11.sp,
                                lineHeight = 15.sp
                            )
                        }
                    }
                }
            }

            // Error Banner
            AnimatedVisibility(visible = errorMessage != null) {
                Surface(
                    color = MaterialTheme.colorScheme.errorContainer,
                    shape = RoundedCornerShape(12.dp),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Column(
                        modifier = Modifier.padding(14.dp),
                        verticalArrangement = Arrangement.spacedBy(10.dp)
                    ) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(10.dp)
                        ) {
                            Icon(Icons.Default.ErrorOutline, contentDescription = null, tint = MaterialTheme.colorScheme.error)
                            Text(
                                text = errorMessage ?: "",
                                color = MaterialTheme.colorScheme.onErrorContainer,
                                fontSize = 13.sp,
                                fontWeight = FontWeight.Medium,
                                modifier = Modifier.weight(1f)
                            )
                        }
                        OutlinedButton(
                            onClick = { switchGoogleAccount() },
                            shape = RoundedCornerShape(10.dp),
                            border = BorderStroke(1.dp, MaterialTheme.colorScheme.error),
                            colors = ButtonDefaults.outlinedButtonColors(
                                contentColor = MaterialTheme.colorScheme.onErrorContainer
                            ),
                            modifier = Modifier.fillMaxWidth().height(40.dp),
                            enabled = !isLoading
                        ) {
                            Icon(Icons.Default.SwapHoriz, contentDescription = null, modifier = Modifier.size(16.dp))
                            Spacer(Modifier.width(6.dp))
                            Text("Change Account", fontSize = 12.sp, fontWeight = FontWeight.Bold)
                        }
                    }
                }
            }

            // Status Banner
            AnimatedVisibility(visible = statusInfo != null) {
                Surface(
                    color = MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.5f),
                    shape = RoundedCornerShape(12.dp),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Row(
                        modifier = Modifier.padding(12.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(10.dp)
                    ) {
                        CircularProgressIndicator(modifier = Modifier.size(18.dp), strokeWidth = 2.dp)
                        Text(
                            text = statusInfo ?: "",
                            color = MaterialTheme.colorScheme.onPrimaryContainer,
                            fontSize = 13.sp,
                            fontWeight = FontWeight.Medium
                        )
                    }
                }
            }

            if (currentView == "auth_choice") {
                Surface(
                    shape = RoundedCornerShape(24.dp),
                    color = Color.White,
                    shadowElevation = 2.dp,
                    tonalElevation = 0.dp,
                    border = BorderStroke(1.dp, Color(0xFFD0E3F5)),
                    modifier = Modifier.size(100.dp)
                ) {
                    Box(
                        contentAlignment = Alignment.Center,
                        modifier = Modifier
                            .fillMaxSize()
                            .padding(12.dp)
                    ) {
                        Image(
                            painter = painterResource(id = R.drawable.app_logo),
                            contentDescription = "Dactor Logo",
                            contentScale = ContentScale.Fit,
                            modifier = Modifier.fillMaxSize()
                        )
                    }
                }

                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text(
                        text = "Welcome to Dactor Nepal",
                        fontSize = 24.sp,
                        fontWeight = FontWeight.ExtraBold,
                        color = MaterialTheme.colorScheme.onBackground
                    )
                    Spacer(modifier = Modifier.height(6.dp))
                    Text(
                        text = "Connect securely with your Google account. All your medical appointments, live token queues, and diagnostic lab reports will be linked.",
                        fontSize = 13.sp,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        textAlign = TextAlign.Center,
                        lineHeight = 18.sp,
                        modifier = Modifier.padding(horizontal = 8.dp)
                    )
                }

                Card(
                    shape = RoundedCornerShape(22.dp),
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                    elevation = CardDefaults.cardElevation(defaultElevation = 2.dp),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Column(
                        modifier = Modifier.padding(22.dp),
                        verticalArrangement = Arrangement.spacedBy(16.dp),
                        horizontalAlignment = Alignment.CenterHorizontally
                    ) {
                        // Unified Google Authentication Button
                        Button(
                            onClick = {
                                launchGoogleSignInFlow()
                            },
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(54.dp),
                            shape = RoundedCornerShape(14.dp),
                            colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.primary),
                            enabled = !isLoading
                        ) {
                            Icon(Icons.Default.AccountCircle, contentDescription = "Google", modifier = Modifier.size(24.dp))
                            Spacer(Modifier.width(10.dp))
                            Text("Continue with Google", fontWeight = FontWeight.Bold, fontSize = 16.sp)
                        }

                        // Terms & Conditions and Privacy Policy Disclosure Button
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(top = 4.dp),
                            horizontalArrangement = Arrangement.Center,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text(
                                "By continuing, you accept Dactor's ",
                                fontSize = 11.sp,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                            TextButton(
                                onClick = { showTermsDialog = true },
                                contentPadding = PaddingValues(0.dp)
                            ) {
                                Text(
                                    "Terms & Privacy Policy",
                                    fontSize = 11.sp,
                                    fontWeight = FontWeight.Bold,
                                    color = MaterialTheme.colorScheme.primary
                                )
                            }
                        }
                    }
                }

                if (!hasPendingBooking) {
                    OutlinedButton(
                        onClick = {
                            navController.navigate(NavRoutes.Discovery.route) {
                                popUpTo(NavRoutes.Login.route) { inclusive = true }
                            }
                        },
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(48.dp),
                        shape = RoundedCornerShape(12.dp)
                    ) {
                        Icon(Icons.Default.ArrowForward, contentDescription = null, modifier = Modifier.size(18.dp))
                        Spacer(Modifier.width(8.dp))
                        Text("Continue as Guest (Browse Only)", fontWeight = FontWeight.SemiBold, fontSize = 13.sp)
                    }
                }
            } else {
                // REGISTRATION FORM VIEW
                Surface(
                    shape = RoundedCornerShape(16.dp),
                    color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f),
                    modifier = Modifier.fillMaxWidth()
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
                            Icon(Icons.Default.CheckCircle, contentDescription = "Verified", tint = Color(0xFF2E7D32), modifier = Modifier.size(28.dp))
                            Column(modifier = Modifier.weight(1f)) {
                                Text("Google Account Verified", fontWeight = FontWeight.Bold, fontSize = 13.sp, color = Color(0xFF2E7D32))
                                Text(verifiedEmail, fontSize = 14.sp, fontWeight = FontWeight.SemiBold, color = MaterialTheme.colorScheme.onSurface)
                                if (verifiedDisplayName.isNotBlank()) {
                                    Text(verifiedDisplayName, fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                }
                            }
                        }
                        OutlinedButton(
                            onClick = { switchGoogleAccount() },
                            shape = RoundedCornerShape(8.dp),
                            contentPadding = PaddingValues(horizontal = 10.dp, vertical = 6.dp),
                            modifier = Modifier.defaultMinSize(minHeight = 36.dp),
                            enabled = !isLoading
                        ) {
                            Icon(Icons.Default.SwapHoriz, contentDescription = null, modifier = Modifier.size(15.dp))
                            Spacer(Modifier.width(4.dp))
                            Text("Change Account", fontSize = 11.sp, fontWeight = FontWeight.Bold)
                        }
                    }
                }

                Card(
                    shape = RoundedCornerShape(20.dp),
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                    elevation = CardDefaults.cardElevation(defaultElevation = 2.dp),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Column(
                        modifier = Modifier.padding(20.dp),
                        verticalArrangement = Arrangement.spacedBy(14.dp)
                    ) {
                        Text("Patient Profile Details", fontWeight = FontWeight.Bold, fontSize = 17.sp)

                        OutlinedTextField(
                            value = patientName,
                            onValueChange = {
                                patientName = it
                                if (errorMessage != null) errorMessage = null
                            },
                            label = { Text("Full Name *") },
                            placeholder = { Text("Enter your full name") },
                            leadingIcon = { Icon(Icons.Default.Person, contentDescription = null) },
                            isError = isNameError,
                            supportingText = if (isNameError) {
                                { Text("Required: Enter full name (at least 2 characters)", color = MaterialTheme.colorScheme.error, fontSize = 11.sp) }
                            } else null,
                            singleLine = true,
                            modifier = Modifier
                                .fillMaxWidth()
                                .focusRequester(nameFocusRequester)
                                .onGloballyPositioned { nameFieldY = it.positionInRoot().y.toInt() },
                            shape = RoundedCornerShape(12.dp)
                        )

                        OutlinedTextField(
                            value = patientPhone,
                            onValueChange = { input ->
                                val digitsOnly = input.filter { it.isDigit() }.take(10)
                                patientPhone = digitsOnly
                                if (errorMessage != null) errorMessage = null
                            },
                            label = { Text("Mobile Phone Number (10 digits) *") },
                            placeholder = { Text("98XXXXXXXX") },
                            leadingIcon = { Icon(Icons.Default.Phone, contentDescription = null) },
                            isError = isPhoneError,
                            supportingText = {
                                if (isPhoneError) {
                                    Text(
                                        "Required: Must be 10 digits starting with 9 (${cleanPhoneDigits.length}/10)",
                                        color = MaterialTheme.colorScheme.error,
                                        fontSize = 11.sp
                                    )
                                } else {
                                    Text(
                                        "${cleanPhoneDigits.length}/10 digits",
                                        color = if (cleanPhoneDigits.length == 10 && cleanPhoneDigits.startsWith("9")) Color(0xFF2E7D32) else MaterialTheme.colorScheme.onSurfaceVariant,
                                        fontSize = 11.sp
                                    )
                                }
                            },
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone),
                            singleLine = true,
                            modifier = Modifier
                                .fillMaxWidth()
                                .focusRequester(phoneFocusRequester)
                                .onGloballyPositioned { phoneFieldY = it.positionInRoot().y.toInt() },
                            shape = RoundedCornerShape(12.dp)
                        )

                        OutlinedTextField(
                            value = patientAge,
                            onValueChange = {
                                if (it.length <= 3 && it.all { ch -> ch.isDigit() }) {
                                    patientAge = it
                                    if (errorMessage != null) errorMessage = null
                                }
                            },
                            label = { Text("Age *") },
                            placeholder = { Text("1 - 120") },
                            isError = isAgeError,
                            supportingText = if (isAgeError) {
                                { Text("Enter valid age (1–120)", color = MaterialTheme.colorScheme.error, fontSize = 10.sp) }
                            } else null,
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                            singleLine = true,
                            modifier = Modifier
                                .fillMaxWidth()
                                .focusRequester(ageFocusRequester)
                                .onGloballyPositioned { ageFieldY = it.positionInRoot().y.toInt() },
                            shape = RoundedCornerShape(12.dp)
                        )

                        Column(
                            modifier = Modifier
                                .fillMaxWidth()
                                .onGloballyPositioned { genderFieldY = it.positionInRoot().y.toInt() },
                            verticalArrangement = Arrangement.spacedBy(4.dp)
                        ) {
                            Text(
                                "Gender *",
                                fontSize = 12.sp,
                                fontWeight = FontWeight.SemiBold,
                                color = if (isGenderError) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurface
                            )
                            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                listOf("Male", "Female", "Other").forEach { g ->
                                    FilterChip(
                                        selected = patientGender == g,
                                        onClick = {
                                            patientGender = g
                                            if (errorMessage != null) errorMessage = null
                                        },
                                        label = { Text(g, fontSize = 11.sp) },
                                        border = FilterChipDefaults.filterChipBorder(
                                            enabled = true,
                                            selected = patientGender == g,
                                            borderColor = if (isGenderError) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.outline
                                        )
                                    )
                                }
                            }
                            if (isGenderError) {
                                Text(
                                    "Required: Please select your gender",
                                    color = MaterialTheme.colorScheme.error,
                                    fontSize = 11.sp
                                )
                            }
                        }

                        // Terms Acceptance Checkbox Card
                        Surface(
                            shape = RoundedCornerShape(12.dp),
                            color = if (isTermsError) MaterialTheme.colorScheme.errorContainer.copy(alpha = 0.25f) else MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f),
                            border = BorderStroke(
                                if (isTermsError) 1.5.dp else 1.dp,
                                if (isTermsError) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.outlineVariant
                            ),
                            modifier = Modifier
                                .fillMaxWidth()
                                .onGloballyPositioned { termsFieldY = it.positionInRoot().y.toInt() }
                        ) {
                            Row(
                                modifier = Modifier.padding(10.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(8.dp)
                            ) {
                                Checkbox(
                                    checked = patientTermsAccepted,
                                    onCheckedChange = {
                                        patientTermsAccepted = it
                                        if (errorMessage != null) errorMessage = null
                                    }
                                )
                                Column(modifier = Modifier.weight(1f)) {
                                    Row(verticalAlignment = Alignment.CenterVertically) {
                                        Text(
                                            "I accept the ",
                                            fontSize = 12.sp,
                                            color = MaterialTheme.colorScheme.onSurface
                                        )
                                        TextButton(
                                            onClick = { showTermsDialog = true },
                                            contentPadding = PaddingValues(0.dp)
                                        ) {
                                            Text(
                                                "Terms & Privacy Policy *",
                                                fontSize = 12.sp,
                                                fontWeight = FontWeight.Bold,
                                                color = if (isTermsError) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.primary
                                            )
                                        }
                                    }
                                    Text(
                                        if (isTermsError) "Required: Please accept Terms & Privacy Policy to continue."
                                        else "Compliant with Nepal Individual Privacy Act 2075 & Google Play Health Policies.",
                                        fontSize = 10.sp,
                                        color = if (isTermsError) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurfaceVariant,
                                        lineHeight = 14.sp
                                    )
                                }
                            }
                        }

                        Button(
                            onClick = { submitPatientRegistration() },
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(52.dp),
                            shape = RoundedCornerShape(12.dp),
                            enabled = !isLoading
                        ) {
                            if (isLoading) {
                                CircularProgressIndicator(modifier = Modifier.size(20.dp), color = MaterialTheme.colorScheme.onPrimary)
                                Spacer(Modifier.width(8.dp))
                                Text("Creating Profile...")
                            } else {
                                Icon(Icons.Default.Check, contentDescription = null)
                                Spacer(Modifier.width(8.dp))
                                Text("Complete Registration & Enter Dactor", fontWeight = FontWeight.Bold)
                            }
                        }
                    }
                }
            }
        }
    }

    if (showTermsDialog) {
        com.dactor.patient.ui.legal.TermsAndConditionsDialog(
            onAccept = {
                patientTermsAccepted = true
                showTermsDialog = false
            },
            onDismiss = {
                showTermsDialog = false
            }
        )
    }
}
