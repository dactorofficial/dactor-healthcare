package com.dactor.patient.ui.components

import android.accounts.AccountManager
import android.app.Activity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.dactor.patient.R
import com.dactor.patient.data.local.UserSessionManager
import com.dactor.patient.data.repository.AppointmentRepository
import com.dactor.patient.data.repository.AuthRepository
import com.google.android.gms.auth.api.signin.GoogleSignIn
import com.google.android.gms.auth.api.signin.GoogleSignInOptions
import com.google.android.gms.common.AccountPicker
import com.google.android.gms.common.api.ApiException
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.auth.GoogleAuthProvider
import kotlinx.coroutines.launch
import java.util.UUID

@Composable
fun GuestAccountView(
    onSignInClicked: () -> Unit,
    modifier: Modifier = Modifier,
    authRepository: AuthRepository? = null,
    sessionManager: UserSessionManager? = null,
    appointmentRepository: AppointmentRepository? = null,
    onLoginSuccess: (() -> Unit)? = null
) {
    val context = LocalContext.current
    val coroutineScope = rememberCoroutineScope()
    val scrollState = rememberScrollState()

    var isGoogleLoading by remember { mutableStateOf(false) }

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

    fun handleSelectedGoogleEmail(rawEmail: String) {
        val email = rawEmail.trim().lowercase()
        if (email.isBlank()) {
            isGoogleLoading = false
            return
        }
        isGoogleLoading = true

        coroutineScope.launch {
            try {
                val portalAssoc = try {
                    authRepository?.checkPortalAssociation(email)
                } catch (_: Exception) { null }

                if (portalAssoc != null && portalAssoc.portal != "patient") {
                    sessionManager?.setPendingVerifiedEmail(email)
                    isGoogleLoading = false
                    onSignInClicked()
                    return@launch
                }

                val existingProfile = try {
                    authRepository?.getProfileByEmail(email)
                } catch (_: Exception) { null }

                val linkedAppts = try {
                    appointmentRepository?.getAllPatientAppointments(
                        userId = existingProfile?.id,
                        email = email,
                        phone = existingProfile?.phone
                    ).orEmpty()
                } catch (_: Exception) { emptyList() }

                sessionManager?.clearSavedTrackingCodes()
                appointmentRepository?.clearCache()

                for (appt in linkedAppts) {
                    if (appt.trackingCode10Digit.isNotBlank()) {
                        sessionManager?.saveTrackingCode(
                            appt.trackingCode10Digit,
                            "${appt.patientName} | ${appt.appointmentDate}"
                        )
                    }
                }

                val latestAppt = linkedAppts.firstOrNull()
                val effectiveName = existingProfile?.fullName?.takeIf { it.isNotBlank() }
                    ?: latestAppt?.patientName?.takeIf { it.isNotBlank() }.orEmpty()
                val effectivePhone = existingProfile?.phone?.takeIf { it.isNotBlank() }
                    ?: latestAppt?.patientMobile?.takeIf { it.isNotBlank() }.orEmpty()

                if (sessionManager != null && effectiveName.isNotBlank() && effectivePhone.isNotBlank()) {
                    val profileId = existingProfile?.id ?: UUID.randomUUID().toString()
                    try {
                        authRepository?.syncPatientProfile(
                            userId = profileId,
                            email = email,
                            fullName = effectiveName,
                            phone = effectivePhone,
                            gender = existingProfile?.gender ?: latestAppt?.patientGender,
                            age = existingProfile?.age ?: latestAppt?.patientAge
                        )
                    } catch (_: Exception) {}

                    sessionManager.savePatientSession(
                        patientId = profileId,
                        email = email,
                        name = effectiveName,
                        phone = effectivePhone,
                        gender = existingProfile?.gender ?: latestAppt?.patientGender,
                        age = existingProfile?.age ?: latestAppt?.patientAge,
                        isArchived = existingProfile?.isArchived == true,
                        deletionScheduledAt = existingProfile?.deletionScheduledAt
                    )
                    sessionManager.setGuestMode(false)
                    isGoogleLoading = false
                    if (onLoginSuccess != null) {
                        onLoginSuccess()
                    } else {
                        onSignInClicked()
                    }
                } else {
                    // First-time patient: store verified email and navigate directly to registration form
                    sessionManager?.setPendingVerifiedEmail(email)
                    isGoogleLoading = false
                    onSignInClicked()
                }
            } catch (e: Exception) {
                sessionManager?.setPendingVerifiedEmail(email)
                isGoogleLoading = false
                onSignInClicked()
            }
        }
    }

    val accountPickerLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.StartActivityForResult()
    ) { result ->
        if (result.resultCode == Activity.RESULT_OK) {
            val email = result.data?.getStringExtra(AccountManager.KEY_ACCOUNT_NAME)
            if (!email.isNullOrBlank()) {
                handleSelectedGoogleEmail(email)
            } else {
                isGoogleLoading = false
            }
        } else {
            isGoogleLoading = false
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
                    handleSelectedGoogleEmail(account.email!!)
                    return@rememberLauncherForActivityResult
                }
            } catch (e: Exception) {
                e.printStackTrace()
            }
        }
        isGoogleLoading = false
    }

    fun launchDirectGoogleLogin() {
        if (sessionManager == null && authRepository == null) {
            onSignInClicked()
            return
        }
        if (isGoogleLoading) return
        isGoogleLoading = true
        coroutineScope.launch {
            try {
                kotlinx.coroutines.withTimeoutOrNull(1500) {
                    com.google.android.gms.tasks.Tasks.await(googleSignInClient.signOut())
                }
            } catch (_: Exception) {}
            try {
                googleSignInLauncher.launch(googleSignInClient.signInIntent)
            } catch (e: Exception) {
                isGoogleLoading = false
                onSignInClicked()
            }
        }
    }

    Column(
        modifier = modifier
            .fillMaxSize()
            .verticalScroll(scrollState)
            .padding(horizontal = 24.dp, vertical = 20.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        // App Logo
        Surface(
            shape = RoundedCornerShape(24.dp),
            color = Color.White,
            shadowElevation = 2.dp,
            tonalElevation = 0.dp,
            border = BorderStroke(1.dp, Color(0xFFD0E3F5)),
            modifier = Modifier.size(96.dp)
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

        Spacer(Modifier.height(16.dp))

        Surface(
            shape = RoundedCornerShape(20.dp),
            color = Color(0xFFE3F2FD)
        ) {
            Text(
                text = "GUEST ACCOUNT",
                color = Color(0xFF1565C0),
                fontWeight = FontWeight.ExtraBold,
                fontSize = 11.sp,
                modifier = Modifier.padding(horizontal = 14.dp, vertical = 5.dp),
                letterSpacing = 0.8.sp
            )
        }

        Spacer(Modifier.height(14.dp))

        Text(
            text = "Welcome to Dactor Nepal",
            fontSize = 22.sp,
            fontWeight = FontWeight.ExtraBold,
            color = Color(0xFF0D3B66),
            textAlign = TextAlign.Center
        )

        Spacer(Modifier.height(8.dp))

        Text(
            text = "You are currently browsing as a Guest. Sign in or sign up with your Google account to book appointments and unlock your health records.",
            fontSize = 13.5.sp,
            color = Color(0xFF475569),
            textAlign = TextAlign.Center,
            lineHeight = 19.sp,
            modifier = Modifier.padding(horizontal = 10.dp)
        )

        Spacer(Modifier.height(24.dp))

        // Main Login Card
        Card(
            shape = RoundedCornerShape(20.dp),
            colors = CardDefaults.cardColors(containerColor = Color.White),
            border = BorderStroke(1.dp, Color(0xFFD0E3F5)),
            elevation = CardDefaults.cardElevation(defaultElevation = 2.dp),
            modifier = Modifier.fillMaxWidth()
        ) {
            Column(
                modifier = Modifier.padding(20.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                // Large Prominent Button: Login / Sign Up with Google
                Button(
                    onClick = { launchDirectGoogleLogin() },
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(52.dp),
                    shape = RoundedCornerShape(14.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF1E88E5)),
                    enabled = !isGoogleLoading
                ) {
                    if (isGoogleLoading) {
                        CircularProgressIndicator(
                            color = Color.White,
                            modifier = Modifier.size(20.dp),
                            strokeWidth = 2.dp
                        )
                        Spacer(Modifier.width(10.dp))
                        Text(
                            text = "Signing In...",
                            fontWeight = FontWeight.Bold,
                            fontSize = 15.sp
                        )
                    } else {
                        Icon(
                            Icons.Default.AccountCircle,
                            contentDescription = "Google",
                            modifier = Modifier.size(24.dp)
                        )
                        Spacer(Modifier.width(10.dp))
                        Text(
                            text = "Login / Sign Up with Google",
                            fontWeight = FontWeight.Bold,
                            fontSize = 15.sp
                        )
                    }
                }

                // Features unlocked with login
                Surface(
                    shape = RoundedCornerShape(14.dp),
                    color = Color(0xFFF0F7FF),
                    border = BorderStroke(1.dp, Color(0xFFD0E3F5)),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Column(
                        modifier = Modifier.padding(16.dp),
                        verticalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        Text(
                            text = "Unlocked with Google Sign-In:",
                            fontWeight = FontWeight.Bold,
                            fontSize = 12.5.sp,
                            color = Color(0xFF0D3B66)
                        )

                        BenefitRow(
                            icon = Icons.Default.EventAvailable,
                            text = "Book guaranteed doctor & clinic appointments"
                        )
                        BenefitRow(
                            icon = Icons.Default.NotificationsActive,
                            text = "Live queue callouts & sound alert notifications"
                        )
                        BenefitRow(
                            icon = Icons.Default.ReceiptLong,
                            text = "Official digital medical bills & payment ledgers"
                        )
                        BenefitRow(
                            icon = Icons.Default.Devices,
                            text = "Sync appointments & records across all devices"
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun BenefitRow(icon: androidx.compose.ui.graphics.vector.ImageVector, text: String) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        Surface(
            shape = CircleShape,
            color = Color(0xFFE3F2FD),
            modifier = Modifier.size(24.dp)
        ) {
            Box(contentAlignment = Alignment.Center) {
                Icon(
                    icon,
                    contentDescription = null,
                    tint = Color(0xFF1E88E5),
                    modifier = Modifier.size(14.dp)
                )
            }
        }
        Text(
            text = text,
            fontSize = 12.sp,
            color = Color(0xFF334155),
            fontWeight = FontWeight.Medium
        )
    }
}
