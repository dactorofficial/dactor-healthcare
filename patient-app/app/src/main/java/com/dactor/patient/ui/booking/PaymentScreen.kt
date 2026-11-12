package com.dactor.patient.ui.booking

import android.widget.Toast
import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedVisibility
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
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.navigation.NavController
import com.dactor.patient.data.local.UserSessionManager
import com.dactor.patient.data.model.Appointment
import com.dactor.patient.data.model.Clinic
import com.dactor.patient.data.model.GatewayCredentialItem
import com.dactor.patient.data.model.PatientTransactionRecord
import com.dactor.patient.data.model.PaymentGatewaysConfig
import com.dactor.patient.data.model.PublicPaymentMethod
import com.dactor.patient.data.repository.AppointmentRepository
import com.dactor.patient.data.repository.ClinicRepository
import com.dactor.patient.data.repository.SlotRepository
import com.dactor.patient.domain.util.CurrencyFormatter
import com.dactor.patient.ui.navigation.NavRoutes
import androidx.compose.ui.text.style.TextAlign
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import java.time.Instant

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PaymentScreen(
    navController: NavController,
    appointmentId: String = "",
    feeAmount: Double = 500.0,
    slotRepository: SlotRepository? = null,
    appointmentRepository: AppointmentRepository? = null,
    clinicRepository: ClinicRepository? = null,
    sessionManager: UserSessionManager? = null
) {
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current
    val coroutineScope = rememberCoroutineScope()
    val scrollState = rememberScrollState()

    var appointment by remember { mutableStateOf<Appointment?>(null) }
    var clinic by remember { mutableStateOf<Clinic?>(null) }
    var clinicGatewaysConfig by remember { mutableStateOf(PaymentGatewaysConfig()) }
    var serverPaymentMethods by remember { mutableStateOf<List<PublicPaymentMethod>>(emptyList()) }
    var effectiveFee by remember { mutableDoubleStateOf(feeAmount) }

    // 2-Phase Reservation Setup
    var activeSession by remember { mutableStateOf(sessionManager?.getActivePaymentSession()) }
    var paymentInitiated by remember {
        mutableStateOf(
            activeSession != null &&
            activeSession?.transactionId?.isNotBlank() == true &&
            activeSession?.transactionId?.startsWith("TXN-") == false
        )
    }
    val initialExpiresAt = remember {
        activeSession?.expiresAtEpochMs ?: (System.currentTimeMillis() + 300_000L)
    }

    var timeLeftSeconds by remember {
        val rem = ((initialExpiresAt - System.currentTimeMillis()) / 1000L).toInt()
        mutableIntStateOf(if (rem > 0) rem else 0)
    }
    var isExpired by remember { mutableStateOf(false) }

    var selectedPaymentMethod by remember { mutableStateOf(activeSession?.gateway?.takeIf { it.isNotBlank() } ?: "esewa") }
    var transactionReferenceInput by remember { mutableStateOf("") }
    var isProcessing by remember { mutableStateOf(false) }
    var isCancelling by remember { mutableStateOf(false) }
    var showCancelConfirmDialog by remember { mutableStateOf(false) }

    // Load Appointment and Authoritative Server-Verified Clinic Payment Options
    LaunchedEffect(appointmentId) {
        if (appointmentId.isNotBlank() && appointmentRepository != null) {
            var appt = appointmentRepository.getAppointmentById(appointmentId)
            var attempts = 0
            while (appt == null && attempts < 3) {
                delay(400L)
                appt = appointmentRepository.getAppointmentById(appointmentId)
                attempts++
            }
            if (appt != null) {
                appointment = appt
                if (appt.feeAmount > 0.0) {
                    effectiveFee = appt.feeAmount
                } else if (appt.totalAmount > 0.0) {
                    effectiveFee = appt.totalAmount
                }
                val pubMethods = try {
                    appointmentRepository.getClinicPublicPaymentMethods(appt.clinicId)
                } catch (_: Exception) {
                    emptyList()
                }
                if (pubMethods.isNotEmpty()) {
                    serverPaymentMethods = pubMethods
                }
                if (clinicRepository != null) {
                    val c = clinicRepository.getClinicById(appt.clinicId)
                    if (c != null) {
                        clinic = c
                        clinicGatewaysConfig = c.getPaymentGatewaysConfig()
                    }
                }
                val preferredSessionGateway = activeSession?.gateway?.lowercase()?.trim()
                if (pubMethods.isNotEmpty()) {
                    val validIds = pubMethods.filter { it.id == "pay_at_desk" || it.isVerified }.map { it.id.lowercase() }
                    selectedPaymentMethod = when {
                        !preferredSessionGateway.isNullOrBlank() && preferredSessionGateway in validIds -> preferredSessionGateway
                        validIds.firstOrNull { it != "pay_at_desk" } != null -> validIds.first { it != "pay_at_desk" }
                        else -> "pay_at_desk"
                    }
                }
            }
        }
    }

    // Double-Click Guarded: Cancellation & Fail Logic
    fun handleCancelOrExpireTransaction(reason: String) {
        if (isCancelling || isProcessing) return
        isCancelling = true
        coroutineScope.launch {
            try {
                if (appointmentId.isNotBlank() && appointmentRepository != null) {
                    val appt = appointment ?: appointmentRepository.getAppointmentById(appointmentId)
                    appointmentRepository.failOrCancelPaymentTransaction(
                        appointmentId = appointmentId,
                        reason = reason,
                        transactionId = transactionReferenceInput.ifBlank { "TXN-CANCELLED-${System.currentTimeMillis()}" },
                        paymentGateway = selectedPaymentMethod
                    )
                    slotRepository?.cancelPendingAppointment(appointmentId)
                    if (appt != null) {
                        sessionManager?.saveLocalTransactionRecord(
                            PatientTransactionRecord(
                                id = "TXN-FAIL-${System.currentTimeMillis()}",
                                appointmentId = appointmentId,
                                trackingCode = appt.trackingCode10Digit,
                                clinicName = clinic?.name ?: "Medical Clinic",
                                doctorName = "Consulting Specialist",
                                patientName = appt.patientName,
                                appointmentDate = appt.appointmentDate,
                                appointmentTime = appt.appointmentTime,
                                amount = effectiveFee,
                                paymentStatus = "failed",
                                paymentMethod = selectedPaymentMethod,
                                transactionId = "CANCELLED",
                                createdAt = Instant.now().toString()
                            )
                        )
                    }
                }
            } catch (e: Exception) {
                e.printStackTrace()
            } finally {
                sessionManager?.clearActivePaymentSession()
                sessionManager?.setShowTransactionFailedBanner(true)
                isCancelling = false
                showCancelConfirmDialog = false
                val targetClinicId = clinic?.id ?: appointment?.clinicId ?: ""
                val targetDocId = appointment?.doctorId
                navController.navigate(NavRoutes.Booking.createRoute(targetClinicId, targetDocId)) {
                    popUpTo(NavRoutes.Booking.route) { inclusive = true }
                }
            }
        }
    }

    // Phase 1: 5-Minute Decision Window Timer (stops when payment is initiated)
    LaunchedEffect(initialExpiresAt, paymentInitiated) {
        if (paymentInitiated) return@LaunchedEffect
        while (true) {
            val rem = ((initialExpiresAt - System.currentTimeMillis()) / 1000L).toInt()
            if (rem <= 0) {
                timeLeftSeconds = 0
                isExpired = true
                handleCancelOrExpireTransaction("Payment decision window expired")
                break
            } else {
                timeLeftSeconds = rem
            }
            delay(1000L)
        }
    }

    // Helper to reconcile payment status with the server across ALL gateways and navigate immediately
    suspend fun checkAndNavigateConfirmed(apptId: String): Boolean {
        if (apptId.isBlank() || appointmentRepository == null) return false
        val status = try { appointmentRepository.refreshOnlinePayment(apptId) } catch (_: Exception) { null }
        val latest = appointmentRepository.getAppointmentById(apptId)
        if (latest != null) appointment = latest
        if (latest?.paymentStatus?.equals("paid", ignoreCase = true) == true || status?.status?.equals("complete", ignoreCase = true) == true) {
            val confirmed = latest ?: appointmentRepository.getAppointmentById(apptId)
            if (confirmed != null) {
                sessionManager?.clearActivePaymentSession()
                sessionManager?.saveTrackingCode(confirmed.trackingCode10Digit, "${confirmed.patientName} \u2022 ${confirmed.appointmentDate}")
                sessionManager?.saveLastConfirmedAppointment(
                    appointmentId = confirmed.id,
                    trackingCode = confirmed.trackingCode10Digit,
                    clinicName = clinic?.name ?: "Medical Clinic",
                    doctorName = "Consulting Specialist",
                    doctorSpecialty = "Consultation",
                    patientName = confirmed.patientName,
                    appointmentDate = confirmed.appointmentDate,
                    timeWindow = confirmed.appointmentTime
                )
                navController.navigate(NavRoutes.AppointmentConfirmed.createRoute(confirmed.trackingCode10Digit)) {
                    popUpTo(NavRoutes.PatientMain.route) { inclusive = false }
                    launchSingleTop = true
                }
                return true
            }
        }

        // Failure detection: gateway session cancelled/expired or server backstop reached
        if (status?.status?.equals("failed", ignoreCase = true) == true ||
            latest?.status?.equals("EXPIRED", ignoreCase = true) == true ||
            latest?.checkinStatus?.equals("cancelled", ignoreCase = true) == true) {
            handleCancelOrExpireTransaction("Payment session expired or was cancelled by gateway")
            return false
        }

        return false
    }

    // Immediate re-check on resuming app from eSewa / Khalti / Fonepay / ConnectIPS checkout
    DisposableEffect(lifecycleOwner, appointmentId) {
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_RESUME && appointmentId.isNotBlank()) {
                coroutineScope.launch {
                    checkAndNavigateConfirmed(appointmentId)
                }
            }
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose {
            lifecycleOwner.lifecycle.removeObserver(observer)
        }
    }

    // Periodic background reconciliation loop
    LaunchedEffect(appointmentId, paymentInitiated) {
        while (appointmentId.isNotBlank() && appointmentRepository != null) {
            val confirmed = checkAndNavigateConfirmed(appointmentId)
            if (confirmed) break
            val latest = appointment ?: appointmentRepository.getAppointmentById(appointmentId)
            if (latest?.checkinStatus?.equals("cancelled", ignoreCase = true) == true ||
                latest?.status?.equals("EXPIRED", ignoreCase = true) == true) break
            delay(6_000L)
        }
    }

    val gatewayDisplayLabel = when (selectedPaymentMethod.lowercase()) {
        "esewa" -> "eSewa"
        "khalti" -> "Khalti"
        "fonepay" -> "Fonepay"
        "connectips" -> "ConnectIPS"
        else -> selectedPaymentMethod.uppercase()
    }

    // Start server-owned online checkout (eSewa, Khalti, Fonepay, ConnectIPS).
    // Payment completion is finalized on the server even if the app is closed in the background.
    fun handleCompletePayment() {
        if (isProcessing || isCancelling) return
        val gw = selectedPaymentMethod.lowercase().trim()
        if (gw !in listOf("esewa", "khalti", "fonepay", "connectips")) {
            Toast.makeText(context, "Please select a verified online gateway or Pay at Desk.", Toast.LENGTH_LONG).show()
            return
        }
        isProcessing = true
        coroutineScope.launch {
            try {
                // Phase 2 transition: clear decision window and set gateway backstop on server
                slotRepository?.initiateOnlinePaymentPhase(appointmentId, gw)
                paymentInitiated = true

                val checkout = appointmentRepository?.startOnlinePayment(
                    appointmentId = appointmentId,
                    gateway = gw,
                    selectedTests = appointment?.selectedLabTests
                ) ?: throw IllegalStateException("Payment service is unavailable")
                sessionManager?.updateActivePaymentSessionGateway(gw, checkout.transactionUuid)
                val intent = android.content.Intent(android.content.Intent.ACTION_VIEW, android.net.Uri.parse(checkout.checkoutUrl))
                context.startActivity(intent)
                Toast.makeText(
                    context,
                    "Opening $gatewayDisplayLabel. Slot is reserved \u2014 your appointment confirms automatically even in background.",
                    Toast.LENGTH_LONG
                ).show()
            } catch (e: Exception) {
                Toast.makeText(context, "Could not open $gatewayDisplayLabel: ${e.message ?: "please try again"}", Toast.LENGTH_LONG).show()
            } finally {
                isProcessing = false
            }
        }
    }

    val serviceCharge = Math.round(effectiveFee * (com.dactor.patient.data.repository.PAY_AT_DESK_SERVICE_CHARGE_PERCENT / 100.0) * 100.0) / 100.0
    val totalAtDesk = effectiveFee + serviceCharge

    fun handleConfirmPayAtDesk() {
        if (isProcessing || isCancelling) return
        isProcessing = true
        coroutineScope.launch {
            try {
                val appt = appointment ?: appointmentRepository?.getAppointmentById(appointmentId)
                if (appt == null) {
                    Toast.makeText(context, "Could not load appointment details", Toast.LENGTH_SHORT).show()
                    return@launch
                }
                val success = appointmentRepository?.updateAppointmentPayAtDesk(
                    appointmentId = appt.id,
                    feeAmount = effectiveFee,
                    serviceChargeAmount = serviceCharge,
                    totalAmount = totalAtDesk
                ) ?: false
                if (success) {
                    sessionManager?.clearActivePaymentSession()
                    sessionManager?.saveTrackingCode(appt.trackingCode10Digit, "${appt.patientName} \u2022 ${appt.appointmentDate}")
                    sessionManager?.saveLastConfirmedAppointment(
                        appointmentId = appt.id,
                        trackingCode = appt.trackingCode10Digit,
                        clinicName = clinic?.name ?: "Medical Clinic",
                        doctorName = "Consulting Specialist",
                        doctorSpecialty = "Consultation",
                        patientName = appt.patientName,
                        appointmentDate = appt.appointmentDate,
                        timeWindow = appt.appointmentTime
                    )
                    navController.navigate(NavRoutes.AppointmentConfirmed.createRoute(appt.trackingCode10Digit)) {
                        popUpTo(NavRoutes.PatientMain.route) { inclusive = false }
                        launchSingleTop = true
                    }
                } else {
                    Toast.makeText(context, "Failed to submit Pay at Desk request", Toast.LENGTH_SHORT).show()
                }
            } catch (e: Exception) {
                Toast.makeText(context, "Error: ${e.message ?: "Failed to submit request"}", Toast.LENGTH_SHORT).show()
            } finally {
                isProcessing = false
            }
        }
    }

    // LOCK: Prevent quitting inside the app while processing or cancelling
    BackHandler(enabled = !isProcessing && !isCancelling) {
        showCancelConfirmDialog = true
    }

    val minutes = timeLeftSeconds / 60
    val seconds = timeLeftSeconds % 60
    val formattedTime = "%02d:%02d".format(minutes, seconds)

    val activeGatewayCreds = clinicGatewaysConfig.getGateway(selectedPaymentMethod)

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Appointment Payment", fontWeight = FontWeight.Bold, fontSize = 18.sp) },
                navigationIcon = {
                    IconButton(
                        onClick = { showCancelConfirmDialog = true },
                        enabled = !isProcessing && !isCancelling
                    ) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
                actions = {
                    TextButton(
                        onClick = { showCancelConfirmDialog = true },
                        enabled = !isProcessing && !isCancelling
                    ) {
                        Text("Cancel", color = MaterialTheme.colorScheme.error, fontWeight = FontWeight.SemiBold)
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
            // ── 1. 2-PHASE RESERVATION BANNER CARD ──────────────────────
            if (paymentInitiated) {
                // PHASE 2: Gateway Checkout in Progress (Calm, No Timer, Slot Reserved)
                Card(
                    shape = RoundedCornerShape(16.dp),
                    colors = CardDefaults.cardColors(
                        containerColor = MaterialTheme.colorScheme.primaryContainer
                    ),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Column(
                        modifier = Modifier.padding(16.dp),
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            CircularProgressIndicator(
                                modifier = Modifier.size(18.dp),
                                color = MaterialTheme.colorScheme.primary,
                                strokeWidth = 2.dp
                            )
                            Text(
                                "Payment in Progress with $gatewayDisplayLabel",
                                fontWeight = FontWeight.Bold,
                                fontSize = 13.sp,
                                color = MaterialTheme.colorScheme.onPrimaryContainer
                            )
                        }

                        Text(
                            text = "Slot Reserved",
                            fontSize = 26.sp,
                            fontWeight = FontWeight.ExtraBold,
                            color = MaterialTheme.colorScheme.primary,
                            letterSpacing = 1.sp
                        )

                        Surface(
                            shape = RoundedCornerShape(8.dp),
                            color = MaterialTheme.colorScheme.surface.copy(alpha = 0.7f),
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Text(
                                text = "Your slot is held while you complete checkout in $gatewayDisplayLabel. Once confirmed, your appointment and live queue token will activate automatically. You can switch back here anytime.",
                                fontSize = 12.sp,
                                color = MaterialTheme.colorScheme.onSurface,
                                modifier = Modifier.padding(10.dp),
                                textAlign = TextAlign.Center
                            )
                        }
                    }
                }
            } else {
                // PHASE 1: 5-Minute Decision Window Banner Card
                Card(
                    shape = RoundedCornerShape(16.dp),
                    colors = CardDefaults.cardColors(
                        containerColor = if (timeLeftSeconds < 60) MaterialTheme.colorScheme.errorContainer else MaterialTheme.colorScheme.primaryContainer
                    ),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Column(
                        modifier = Modifier.padding(16.dp),
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.spacedBy(6.dp)
                    ) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(6.dp)
                        ) {
                            Icon(
                                Icons.Default.Lock,
                                contentDescription = null,
                                tint = if (timeLeftSeconds < 60) MaterialTheme.colorScheme.onErrorContainer else MaterialTheme.colorScheme.onPrimaryContainer,
                                modifier = Modifier.size(18.dp)
                            )
                            Text(
                                if (isExpired) "Decision Window Ended" else "Choose Payment Option (Slot Held)",
                                fontWeight = FontWeight.Bold,
                                fontSize = 13.sp,
                                color = if (timeLeftSeconds < 60) MaterialTheme.colorScheme.onErrorContainer else MaterialTheme.colorScheme.onPrimaryContainer
                            )
                        }

                        Text(
                            text = if (isExpired) "Checking" else formattedTime,
                            fontSize = 38.sp,
                            fontWeight = FontWeight.ExtraBold,
                            color = if (timeLeftSeconds < 60) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.primary,
                            letterSpacing = 2.sp
                        )

                        LinearProgressIndicator(
                            progress = { (timeLeftSeconds / 300f).coerceIn(0f, 1f) },
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(6.dp),
                            color = if (timeLeftSeconds < 60) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.primary,
                            trackColor = Color.White.copy(alpha = 0.5f)
                        )

                        Text(
                            text = "Please choose a payment method within 5 minutes. Selecting online payment reserves your slot until digital payment completes.",
                            fontSize = 11.sp,
                            color = if (timeLeftSeconds < 60) MaterialTheme.colorScheme.onErrorContainer else MaterialTheme.colorScheme.onPrimaryContainer,
                            textAlign = TextAlign.Center
                        )
                    }
                }
            }

            // ── 2. PAYMENT SUMMARY CARD ──────────────────────────────────────────
            Card(
                shape = RoundedCornerShape(14.dp),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
                border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
                modifier = Modifier.fillMaxWidth()
            ) {
                Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("Payment Summary", fontWeight = FontWeight.Bold, fontSize = 14.sp)
                    if (clinic != null) {
                        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                            Text("Clinic", fontSize = 13.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            Text(clinic?.name ?: "", fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
                        }
                    }
                    if (appointment != null) {
                        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                            Text("Appointment Date", fontSize = 13.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            Text("${appointment?.appointmentDate} (${appointment?.appointmentTime})", fontSize = 12.sp, fontWeight = FontWeight.Medium)
                        }
                    }
                    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        Text("Consultation Fee", fontSize = 13.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        Text(CurrencyFormatter.formatNPR(effectiveFee), fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
                    }
                    if (selectedPaymentMethod == "pay_at_desk") {
                        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                            Text("Platform Service Charge (5%)", fontSize = 13.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            Text(CurrencyFormatter.formatNPR(serviceCharge), fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
                        }
                    } else {
                        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                            Text("Queue Reservation Fee", fontSize = 13.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            Text("FREE", fontSize = 13.sp, fontWeight = FontWeight.SemiBold, color = Color(0xFF059669))
                        }
                    }
                    HorizontalDivider(modifier = Modifier.padding(vertical = 4.dp))
                    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        Text("Total Amount Due", fontWeight = FontWeight.Bold, fontSize = 15.sp)
                        Text(
                            CurrencyFormatter.formatNPR(if (selectedPaymentMethod == "pay_at_desk") totalAtDesk else effectiveFee),
                            fontWeight = FontWeight.ExtraBold,
                            fontSize = 17.sp,
                            color = MaterialTheme.colorScheme.primary
                        )
                    }
                }
            }

            // ── 3. REAL PAYMENT GATEWAYS SELECTION (STRICT CLINIC OWNER KEY RULE) ─────
            Text("Select Payment Option", fontWeight = FontWeight.Bold, fontSize = 14.sp)

            val isDirectPaymentEnabled = clinic?.isDirectPaymentEnabled == true
            val availableGateways = remember(clinic, clinicGatewaysConfig, serverPaymentMethods) {
                if (serverPaymentMethods.isNotEmpty()) {
                    val list = mutableListOf<Pair<String, String>>()
                    for (m in serverPaymentMethods) {
                        val id = m.id.lowercase().trim()
                        if (id == "pay_at_desk") {
                            list.add(Pair("pay_at_desk", m.name.ifBlank { "Pay at Desk (+5%)" }))
                        } else if (id in listOf("esewa", "khalti", "fonepay", "connectips") && m.isVerified) {
                            list.add(Pair(id, m.name))
                        }
                    }
                    if (list.none { it.first == "pay_at_desk" }) {
                        list.add(Pair("pay_at_desk", "Pay at Desk (+5%)"))
                    }
                    list
                } else {
                    val list = mutableListOf<Pair<String, String>>()
                    if (isDirectPaymentEnabled && clinicGatewaysConfig.esewa.enabled && clinicGatewaysConfig.esewa.isVerified && clinicGatewaysConfig.esewa.merchantId.isNotBlank()) {
                        list.add(Pair("esewa", "eSewa Mobile Wallet"))
                    }
                    if (isDirectPaymentEnabled && clinicGatewaysConfig.khalti.enabled && clinicGatewaysConfig.khalti.isVerified && (clinicGatewaysConfig.khalti.merchantId.isNotBlank() || clinicGatewaysConfig.khalti.publicKey.isNotBlank())) {
                        list.add(Pair("khalti", "Khalti Digital Wallet"))
                    }
                    if (isDirectPaymentEnabled && clinicGatewaysConfig.fonepay.enabled && clinicGatewaysConfig.fonepay.isVerified && clinicGatewaysConfig.fonepay.merchantId.isNotBlank()) {
                        list.add(Pair("fonepay", "Fonepay QR / Direct Banking"))
                    }
                    if (isDirectPaymentEnabled && clinicGatewaysConfig.connectips.enabled && clinicGatewaysConfig.connectips.isVerified && (clinicGatewaysConfig.connectips.merchantId.isNotBlank() || clinicGatewaysConfig.connectips.publicKey.isNotBlank())) {
                        list.add(Pair("connectips", "ConnectIPS Direct Bank"))
                    }
                    // Pay at Desk NEVER requires keys and is always available
                    list.add(Pair("pay_at_desk", "Pay at Desk (+5%)"))
                    list
                }
            }

            LaunchedEffect(availableGateways) {
                if (availableGateways.none { it.first == selectedPaymentMethod }) {
                    selectedPaymentMethod = availableGateways.firstOrNull()?.first ?: "pay_at_desk"
                }
            }

            Column(
                modifier = Modifier.fillMaxWidth(),
                verticalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                availableGateways.forEach { (id, rawLabel) ->
                    val sMethod = serverPaymentMethods.firstOrNull { it.id.equals(id, ignoreCase = true) }
                    val (title, subtitle, feeBadge) = when (id.lowercase().trim()) {
                        "esewa" -> Triple("eSewa Wallet", "Mobile wallet & NetBanking", "0% Fee")
                        "khalti" -> Triple("Khalti Wallet", "Instant wallet & Mobile Banking", "0% Fee")
                        "fonepay" -> Triple("Fonepay QR", "Direct interbank QR payment", "0% Fee")
                        "connectips" -> Triple("ConnectIPS", "NCHL direct bank account transfer", "0% Fee")
                        "pay_at_desk" -> Triple("Pay at Desk", "Pay cash at clinic reception counter", "+5% Fee")
                        else -> Triple(
                            sMethod?.name?.ifBlank { rawLabel } ?: rawLabel,
                            sMethod?.subtitle?.ifBlank { "Verified digital payment" } ?: "Verified digital payment",
                            "0% Fee"
                        )
                    }

                    PaymentOptionCard(
                        gatewayId = id,
                        title = title,
                        subtitle = subtitle,
                        feeBadgeText = feeBadge,
                        isSelected = selectedPaymentMethod == id,
                        onClick = { selectedPaymentMethod = id }
                    )
                }
            }

            val selectedServerMethod = serverPaymentMethods.firstOrNull { it.id.equals(selectedPaymentMethod, ignoreCase = true) }

            // ── 4. DETAILS CARD: PAY AT DESK OR VERIFIED GATEWAY INTERFACE ────────
            if (selectedPaymentMethod == "pay_at_desk") {
                Card(
                    shape = RoundedCornerShape(14.dp),
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.secondaryContainer.copy(alpha = 0.4f)),
                    border = BorderStroke(1.dp, MaterialTheme.colorScheme.secondary.copy(alpha = 0.4f)),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            Icon(Icons.Default.Info, contentDescription = null, tint = MaterialTheme.colorScheme.secondary, modifier = Modifier.size(20.dp))
                            Text(
                                text = "A ${com.dactor.patient.data.repository.PAY_AT_DESK_SERVICE_CHARGE_PERCENT.toInt()}% service charge will be added to your bill when paying at the desk",
                                fontWeight = FontWeight.Bold,
                                fontSize = 12.sp,
                                color = MaterialTheme.colorScheme.onSecondaryContainer
                            )
                        }
                        HorizontalDivider(modifier = Modifier.padding(vertical = 2.dp))
                        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                            Text("Consultation Fee:", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            Text(CurrencyFormatter.formatNPR(effectiveFee), fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
                        }
                        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                            Text("5% Service Charge:", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            Text(CurrencyFormatter.formatNPR(serviceCharge), fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
                        }
                        HorizontalDivider(modifier = Modifier.padding(vertical = 2.dp))
                        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                            Text("Total at Desk:", fontWeight = FontWeight.Bold, fontSize = 13.sp)
                            Text(CurrencyFormatter.formatNPR(totalAtDesk), fontWeight = FontWeight.ExtraBold, fontSize = 14.sp, color = MaterialTheme.colorScheme.primary)
                        }
                        Text(
                            text = "No merchant gateway key or online payment is required now. Your request will be submitted for clinic desk approval.",
                            fontSize = 11.sp,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }
            } else {
                val effectiveEnv = (selectedServerMethod?.environment?.ifBlank { null } ?: activeGatewayCreds.environment).lowercase()
                val displayMerchantId = selectedServerMethod?.merchantDisplayId?.ifBlank { null } ?: activeGatewayCreds.merchantId
                Card(
                    shape = RoundedCornerShape(14.dp),
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f)),
                    border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text(
                                text = "$gatewayDisplayLabel Verified Checkout",
                                fontWeight = FontWeight.Bold,
                                fontSize = 13.sp
                            )
                            Surface(
                                shape = RoundedCornerShape(6.dp),
                                color = if (effectiveEnv == "live") Color(0xFFD1FAE5) else Color(0xFFFEF3C7)
                            ) {
                                Text(
                                    text = if (effectiveEnv == "live") "LIVE GATEWAY" else "TEST SANDBOX",
                                    fontSize = 10.sp,
                                    fontWeight = FontWeight.Bold,
                                    color = if (effectiveEnv == "live") Color(0xFF047857) else Color(0xFFB45309),
                                    modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
                                )
                            }
                        }

                        if (!selectedServerMethod?.subtitle.isNullOrBlank()) {
                            Text(
                                text = selectedServerMethod?.subtitle ?: "",
                                fontSize = 11.sp,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }

                        if (displayMerchantId.isNotBlank()) {
                            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                Text("Verified Merchant ID:", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                Text(displayMerchantId, fontSize = 12.sp, fontWeight = FontWeight.Medium)
                            }
                        }

                        Surface(
                            shape = RoundedCornerShape(8.dp),
                            color = MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.4f),
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Row(
                                modifier = Modifier.padding(10.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(8.dp)
                            ) {
                                Icon(
                                    Icons.Default.VerifiedUser,
                                    contentDescription = null,
                                    tint = MaterialTheme.colorScheme.primary,
                                    modifier = Modifier.size(20.dp)
                                )
                                Text(
                                    text = "Automated Server & Background Verification: Your $gatewayDisplayLabel payment is verified directly on the server. Even if this app closes while you pay, your appointment & queue token will still be generated automatically.",
                                    fontSize = 11.sp,
                                    color = MaterialTheme.colorScheme.onPrimaryContainer,
                                    lineHeight = 15.sp
                                )
                            }
                        }
                    }
                }
            }

            // ── 5. CONFIRMATION / PAY BUTTON ──────────────────────────────────────────
            Button(
                onClick = {
                    if (selectedPaymentMethod == "pay_at_desk") {
                        handleConfirmPayAtDesk()
                    } else {
                        handleCompletePayment()
                    }
                },
                modifier = Modifier
                    .fillMaxWidth()
                    .height(52.dp),
                shape = RoundedCornerShape(14.dp),
                colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.primary),
                enabled = !isProcessing && !isCancelling
            ) {
                if (isProcessing) {
                    CircularProgressIndicator(color = Color.White, modifier = Modifier.size(20.dp), strokeWidth = 2.dp)
                    Spacer(Modifier.width(8.dp))
                }
                Icon(if (selectedPaymentMethod == "pay_at_desk") Icons.Default.Check else Icons.Default.Payment, contentDescription = null)
                Spacer(Modifier.width(8.dp))
                Text(
                    text = if (selectedPaymentMethod == "pay_at_desk")
                        "Confirm Pay at Desk (${CurrencyFormatter.formatNPR(totalAtDesk)})"
                    else
                        "Pay with $gatewayDisplayLabel (${CurrencyFormatter.formatNPR(effectiveFee)})",
                    fontWeight = FontWeight.Bold,
                    fontSize = 15.sp
                )
            }

            // ── 6. CANCEL TRANSACTION BUTTON ──────────────────────────────────────
            OutlinedButton(
                onClick = { showCancelConfirmDialog = true },
                modifier = Modifier
                    .fillMaxWidth()
                    .height(48.dp),
                shape = RoundedCornerShape(14.dp),
                colors = ButtonDefaults.outlinedButtonColors(contentColor = MaterialTheme.colorScheme.error),
                border = BorderStroke(1.dp, MaterialTheme.colorScheme.error.copy(alpha = 0.5f)),
                enabled = !isProcessing && !isCancelling
            ) {
                if (isCancelling) {
                    CircularProgressIndicator(color = MaterialTheme.colorScheme.error, modifier = Modifier.size(18.dp), strokeWidth = 2.dp)
                    Spacer(Modifier.width(8.dp))
                }
                Icon(Icons.Default.Close, contentDescription = null, modifier = Modifier.size(18.dp))
                Spacer(Modifier.width(6.dp))
                Text(if (isCancelling) "Cancelling Transaction..." else "Cancel Transaction", fontWeight = FontWeight.SemiBold)
            }
        }

        // CONFIRM CANCEL TRANSACTION DIALOG
        if (showCancelConfirmDialog) {
            AlertDialog(
                onDismissRequest = { if (!isCancelling) showCancelConfirmDialog = false },
                icon = { Icon(Icons.Default.WarningAmber, contentDescription = null, tint = MaterialTheme.colorScheme.error, modifier = Modifier.size(36.dp)) },
                title = { Text("Cancel This Transaction?", fontWeight = FontWeight.Bold) },
                text = {
                    Text("Cancelling releases the appointment request. If you already paid or your wallet still shows processing, do not cancel; return here and let the payment status update first.", fontSize = 13.sp)
                },
                confirmButton = {
                    Button(
                        onClick = { handleCancelOrExpireTransaction("Patient clicked Cancel") },
                        colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.error),
                        enabled = !isCancelling
                    ) {
                        Text("Yes, Cancel Transaction")
                    }
                },
                dismissButton = {
                    TextButton(
                        onClick = { showCancelConfirmDialog = false },
                        enabled = !isCancelling
                    ) {
                        Text("Continue Payment")
                    }
                }
            )
        }
    }
}
