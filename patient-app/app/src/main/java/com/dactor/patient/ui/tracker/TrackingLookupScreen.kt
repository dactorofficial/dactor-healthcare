package com.dactor.patient.ui.tracker

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.navigation.NavController
import com.dactor.patient.data.local.UserSessionManager
import com.dactor.patient.data.model.Appointment
import com.dactor.patient.data.repository.AppointmentRepository
import com.dactor.patient.data.repository.AuthRepository
import kotlinx.coroutines.launch
import com.dactor.patient.ui.navigation.NavRoutes

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TrackingLookupScreen(
    navController: NavController,
    appointmentRepository: AppointmentRepository? = null,
    authRepository: AuthRepository? = null,
    sessionManager: UserSessionManager? = null
) {
    var trackingCode by remember { mutableStateOf("") }
    var errorMessage by remember { mutableStateOf<String?>(null) }
    var isLoading by remember { mutableStateOf(false) }
    var linkedLiveAppointments by remember { mutableStateOf<List<Appointment>>(emptyList()) }

    val focusManager = LocalFocusManager.current
    val scrollState = rememberScrollState()
    val coroutineScope = rememberCoroutineScope()

    LaunchedEffect(Unit) {
        if (appointmentRepository != null) {
            try {
                val patientId = sessionManager?.getSavedPatientId()
                val email = sessionManager?.getSavedEmail()?.takeIf { it.isNotBlank() }
                    ?: authRepository?.getCurrentUserEmail()
                val phone = sessionManager?.getSavedPhone()
                val savedCodes = sessionManager?.getSavedTrackingCodes()?.map { it.first } ?: emptyList()

                val allAppts = appointmentRepository.getAllPatientAppointments(
                    userId = patientId,
                    email = email,
                    phone = phone,
                    trackingCodes = savedCodes
                )
                for (appt in allAppts) {
                    if (appt.trackingCode10Digit.isNotBlank()) {
                        sessionManager?.saveTrackingCode(
                            appt.trackingCode10Digit,
                            "${appt.patientName} • ${appt.appointmentDate}"
                        )
                    }
                }
                linkedLiveAppointments = allAppts.filter {
                    val s = it.checkinStatus.lowercase()
                    s !in listOf("completed", "done", "cancelled")
                }
            } catch (ignored: Exception) {}
        }
    }

    fun performLookup() {
        focusManager.clearFocus()
        val cleaned = trackingCode.trim()
        if (cleaned.isBlank()) {
            errorMessage = "Please enter your 10-digit code, Gmail address, or mobile number"
            return
        }

        val isEmail = cleaned.contains("@") && cleaned.contains(".")
        val isDigits = cleaned.all { it.isDigit() }

        if (!isEmail && !isDigits) {
            errorMessage = "Please enter a valid 10-digit code, Gmail address, or 10-digit mobile number"
            return
        }

        errorMessage = null
        isLoading = true

        coroutineScope.launch {
            try {
                // 1. If 10-digit code entered, check if an appointment matches this tracking code
                if (isDigits && cleaned.length == 10) {
                    val apptByCode = appointmentRepository?.getAppointmentByTrackingCode(cleaned)
                    if (apptByCode != null) {
                        sessionManager?.saveTrackingCode(cleaned, "${apptByCode.patientName} • ${apptByCode.appointmentDate}")
                        isLoading = false
                        navController.navigate(NavRoutes.QueueStatus.createRoute(cleaned))
                        return@launch
                    }
                }

                // 2. Query appointments matching email or phone or deterministic ID
                val queryEmail = if (isEmail) cleaned else null
                val queryPhone = if (isDigits) cleaned else null
                val deterministicUid = if (isEmail) {
                    com.dactor.patient.domain.util.PatientIdentitySync.getDeterministicPatientIdForEmail(cleaned)
                } else if (isDigits) {
                    com.dactor.patient.domain.util.PatientIdentitySync.getDeterministicPatientIdForPhone(cleaned)
                } else null

                val foundAppts = appointmentRepository?.getAllPatientAppointments(
                    userId = deterministicUid,
                    email = queryEmail,
                    phone = queryPhone,
                    trackingCodes = if (isDigits && cleaned.length == 10) listOf(cleaned) else emptyList()
                ) ?: emptyList()

                if (foundAppts.isNotEmpty()) {
                    foundAppts.forEach { a ->
                        if (a.trackingCode10Digit.isNotBlank()) {
                            sessionManager?.saveTrackingCode(a.trackingCode10Digit, "${a.patientName} • ${a.appointmentDate}")
                        }
                    }
                    val targetAppt = foundAppts.find {
                        val s = it.checkinStatus.lowercase()
                        s !in listOf("completed", "done", "cancelled")
                    }
                        ?: foundAppts.sortedByDescending { it.appointmentDate }.first()

                    if (targetAppt.trackingCode10Digit.isNotBlank()) {
                        isLoading = false
                        navController.navigate(NavRoutes.QueueStatus.createRoute(targetAppt.trackingCode10Digit))
                        return@launch
                    }
                }

                // 3. Fallback: if 10 digits entered and no record found online yet, try direct navigation
                if (isDigits && cleaned.length == 10) {
                    isLoading = false
                    navController.navigate(NavRoutes.QueueStatus.createRoute(cleaned))
                    return@launch
                }

                errorMessage = "No appointment found for '$cleaned'. Please check with reception or verify your Gmail/code."
            } catch (e: Exception) {
                if (isDigits && cleaned.length == 10) {
                    navController.navigate(NavRoutes.QueueStatus.createRoute(cleaned))
                } else {
                    errorMessage = "Lookup failed: ${e.message ?: "Please try again."}"
                }
            } finally {
                isLoading = false
            }
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Track Live Appointment", fontWeight = FontWeight.Bold) },
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
                .padding(20.dp),
            verticalArrangement = Arrangement.spacedBy(20.dp)
        ) {
            // Direct 1-Tap Live Queue Tracking for Appointments Linked to Email/Account
            if (linkedLiveAppointments.isNotEmpty()) {
                Card(
                    shape = RoundedCornerShape(18.dp),
                    colors = CardDefaults.cardColors(containerColor = Color(0xFFE0F2F1)),
                    border = BorderStroke(1.dp, Color(0xFF00796B).copy(alpha = 0.35f)),
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
                            Icon(Icons.Default.VerifiedUser, contentDescription = null, tint = Color(0xFF00796B), modifier = Modifier.size(20.dp))
                            Text(
                                text = "Live Queue Linked to Your Email",
                                fontWeight = FontWeight.ExtraBold,
                                fontSize = 15.sp,
                                color = Color(0xFF004D40)
                            )
                        }
                        Text(
                            text = "Tap any appointment below to track its live queue directly without entering a code:",
                            fontSize = 12.sp,
                            color = Color(0xFF00695C)
                        )
                        linkedLiveAppointments.forEach { appt ->
                            Surface(
                                shape = RoundedCornerShape(12.dp),
                                color = Color.White,
                                border = BorderStroke(1.dp, Color(0xFFB2DFDB)),
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .clickable {
                                        navController.navigate(NavRoutes.QueueStatus.createRoute(appt.trackingCode10Digit))
                                    }
                            ) {
                                Row(
                                    modifier = Modifier.padding(horizontal = 14.dp, vertical = 12.dp),
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.SpaceBetween
                                ) {
                                    Column(modifier = Modifier.weight(1f)) {
                                        Text(
                                            text = appt.patientName,
                                            fontWeight = FontWeight.Bold,
                                            fontSize = 14.sp,
                                            color = Color(0xFF0F172A)
                                        )
                                        Text(
                                            text = "${appt.appointmentDate} • ${appt.appointmentTime} • ID #${appt.trackingCode10Digit}",
                                            fontSize = 11.sp,
                                            color = Color(0xFF64748B)
                                        )
                                    }
                                    Surface(
                                        shape = RoundedCornerShape(8.dp),
                                        color = Color(0xFF00796B)
                                    ) {
                                        Row(
                                            modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp),
                                            verticalAlignment = Alignment.CenterVertically,
                                            horizontalArrangement = Arrangement.spacedBy(4.dp)
                                        ) {
                                            Text("Track Live", color = Color.White, fontWeight = FontWeight.Bold, fontSize = 11.sp)
                                            Icon(Icons.Default.ArrowForward, contentDescription = null, tint = Color.White, modifier = Modifier.size(13.dp))
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }

            // Header Info Card
            Card(
                shape = RoundedCornerShape(20.dp),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.4f)),
                modifier = Modifier.fillMaxWidth()
            ) {
                Row(
                    modifier = Modifier.padding(20.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(16.dp)
                ) {
                    Surface(
                        shape = CircleShape,
                        color = MaterialTheme.colorScheme.primary,
                        modifier = Modifier.size(54.dp)
                    ) {
                        Box(contentAlignment = Alignment.Center) {
                            Icon(Icons.Default.Radar, contentDescription = null, tint = Color.White, modifier = Modifier.size(28.dp))
                        }
                    }
                    Column {
                        Text("Live Queue Tracking", fontWeight = FontWeight.Bold, fontSize = 16.sp)
                        Text(
                            "Track your turn in real time without creating an account or logging in.",
                            fontSize = 13.sp,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }
            }

            // Code Entry Form
            Card(
                shape = RoundedCornerShape(16.dp),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                elevation = CardDefaults.cardElevation(defaultElevation = 2.dp),
                modifier = Modifier.fillMaxWidth()
            ) {
                Column(
                    modifier = Modifier.padding(20.dp),
                    verticalArrangement = Arrangement.spacedBy(16.dp)
                ) {
                    Text("Tracking Code, Gmail, or Mobile", fontWeight = FontWeight.Bold, fontSize = 14.sp)

                    OutlinedTextField(
                        value = trackingCode,
                        onValueChange = { input ->
                            if (input.length <= 80) {
                                trackingCode = input
                                if (errorMessage != null) errorMessage = null
                            }
                        },
                        label = { Text("Code, Gmail, or Mobile") },
                        placeholder = { Text("10-digit code, user@gmail.com, or phone") },
                        leadingIcon = {
                            Icon(Icons.Default.Pin, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
                        },
                        trailingIcon = {
                            if (trackingCode.isNotEmpty()) {
                                IconButton(onClick = { trackingCode = "" }) {
                                    Icon(Icons.Default.Clear, contentDescription = "Clear")
                                }
                            }
                        },
                        keyboardOptions = KeyboardOptions(
                            keyboardType = KeyboardType.Email,
                            imeAction = ImeAction.Search
                        ),
                        keyboardActions = KeyboardActions(
                            onSearch = { performLookup() }
                        ),
                        singleLine = true,
                        textStyle = if (trackingCode.all { it.isDigit() } && trackingCode.length <= 10) {
                            LocalTextStyle.current.copy(
                                fontSize = 18.sp,
                                fontWeight = FontWeight.Bold,
                                letterSpacing = 2.sp,
                                fontFamily = FontFamily.Monospace
                            )
                        } else {
                            LocalTextStyle.current.copy(
                                fontSize = 15.sp,
                                fontWeight = FontWeight.SemiBold
                            )
                        },
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(12.dp)
                    )

                    AnimatedVisibility(visible = errorMessage != null) {
                        Text(
                            text = errorMessage ?: "",
                            color = MaterialTheme.colorScheme.error,
                            fontSize = 12.sp,
                            fontWeight = FontWeight.Medium
                        )
                    }

                    Button(
                        onClick = { performLookup() },
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(50.dp),
                        shape = RoundedCornerShape(12.dp),
                        enabled = trackingCode.trim().isNotBlank() && !isLoading
                    ) {
                        if (isLoading) {
                            CircularProgressIndicator(
                                modifier = Modifier.size(22.dp),
                                color = MaterialTheme.colorScheme.onPrimary,
                                strokeWidth = 2.dp
                            )
                        } else {
                            Icon(Icons.Default.Search, contentDescription = null, modifier = Modifier.size(18.dp))
                            Spacer(Modifier.width(8.dp))
                            Text("Track Queue Status", fontWeight = FontWeight.Bold, fontSize = 15.sp)
                        }
                    }
                }
            }



            // Information & Help Guide
            Card(
                shape = RoundedCornerShape(14.dp),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.35f)),
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
                        Icon(Icons.Default.Info, contentDescription = null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(18.dp))
                        Text("Instant Tracking Options", fontWeight = FontWeight.Bold, fontSize = 13.sp)
                    }
                    Text(
                        "• 10-Digit Code: From physical token slip or SMS.\n" +
                        "• Gmail Address: Used at walk-in reception or online booking.\n" +
                        "• Mobile Number: 10-digit phone number registered for the visit.\n" +
                        "• Unregistered walk-ins are automatically tracked and synced.",
                        fontSize = 12.sp,
                        lineHeight = 18.sp,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }

            // Login Shortcut Card
            Card(
                shape = RoundedCornerShape(14.dp),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                modifier = Modifier.fillMaxWidth()
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable { navController.navigate(NavRoutes.Profile.route) }
                        .padding(16.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        Surface(
                            shape = CircleShape,
                            color = MaterialTheme.colorScheme.secondaryContainer,
                            modifier = Modifier.size(40.dp)
                        ) {
                            Box(contentAlignment = Alignment.Center) {
                                Icon(Icons.Default.Person, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
                            }
                        }
                        Column {
                            Text("Already have an account?", fontWeight = FontWeight.Bold, fontSize = 13.sp)
                            Text("View all your saved appointments in 1 tap", fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                    Icon(Icons.Default.ChevronRight, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }
    }
}
