package com.dactor.clinic.ui.settings

import android.net.Uri
import android.widget.Toast
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import com.dactor.clinic.ui.auth.PickMultipleClinicImagesContract
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import coil.compose.AsyncImage
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.ExitToApp
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.navigation.NavController
import com.dactor.clinic.data.local.UserSessionManager
import com.dactor.clinic.data.model.Clinic
import com.dactor.clinic.data.repository.ClinicRepository
import com.dactor.clinic.domain.util.ArchiveDateUtils
import com.dactor.clinic.ui.legal.ClinicTermsAndConditionsDialog
import com.dactor.clinic.ui.navigation.NavRoutes
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ClinicSettingsScreen(
    navController: NavController,
    clinicId: String? = null,
    clinicRepository: ClinicRepository? = null
) {
    val context = LocalContext.current
    val sessionManager = remember { UserSessionManager(context) }
    val effectiveClinicId = remember(clinicId) {
        if (!clinicId.isNullOrBlank() && clinicId != "c1") clinicId
        else sessionManager.getSavedClinicId() ?: ""
    }

    var loadedClinicId by remember { mutableStateOf<String?>(null) }
    var currentVerificationStatus by remember { mutableStateOf<String?>("pending") }
    var name by remember { mutableStateOf("") }
    var phoneDigits by remember { mutableStateOf("") }
    var managerPhoneDigits by remember { mutableStateOf("") }
    var panNumber by remember { mutableStateOf("") }
    var email by remember { mutableStateOf("") }
    var address by remember { mutableStateOf("") }
    var latitude by remember { mutableStateOf("27.7052") }
    var longitude by remember { mutableStateOf("85.3193") }
    var selectedType by remember { mutableStateOf("multi_visit") }
    var selectedSpecialties by remember { mutableStateOf<Set<String>>(emptySet()) }
    var availableSpecialtiesList by remember { mutableStateOf<List<com.dactor.clinic.data.model.MedicalSpecialty>>(emptyList()) }
    var threshold by remember { mutableStateOf("2") }
    var avgConsultationTimeMinutes by remember { mutableStateOf("10") }
    var description by remember { mutableStateOf("") }

    var regDocUri by remember { mutableStateOf<Uri?>(null) }
    var regDocName by remember { mutableStateOf<String?>(null) }
    var existingRegDocUrl by remember { mutableStateOf<String?>(null) }
    var clinicPictures by remember { mutableStateOf<List<String>>(emptyList()) }

    // Direct Payment Gateway API Keys state
    var isDirectPaymentEnabled by remember { mutableStateOf(false) }
    var selectedGatewayProvider by remember { mutableStateOf("esewa") }
    var paymentMerchantId by remember { mutableStateOf("") }
    var paymentApiKey by remember { mutableStateOf("") }
    var paymentSecretKey by remember { mutableStateOf("") }
    var fonepayUsername by remember { mutableStateOf("") }
    var fonepayPassword by remember { mutableStateOf("") }
    var connectipsAppId by remember { mutableStateOf("") }
    var connectipsAppName by remember { mutableStateOf("DactorClinic") }
    var connectipsAppPassword by remember { mutableStateOf("") }
    var connectipsPrivateKeyPem by remember { mutableStateOf("") }
    var connectipsPfxBase64 by remember { mutableStateOf("") }
    var connectipsPfxFileName by remember { mutableStateOf<String?>(null) }
    var connectipsPfxPassword by remember { mutableStateOf("") }
    var serverCallbackBaseUrl by remember { mutableStateOf("https://ojfoofojcpabqegxmsab.supabase.co/functions/v1/appointment-payment") }
    var showSecretKey by remember { mutableStateOf(false) }
    var paymentGatewaysConfig by remember { mutableStateOf(com.dactor.clinic.data.model.PaymentGatewaysConfig()) }
    var isSavingGatewayOnly by remember { mutableStateOf(false) }

    // Platform License / Admin Subscription Payment state
    var showSubscriptionPayDialog by remember { mutableStateOf(false) }
    var platformGatewaysConfig by remember { mutableStateOf<com.dactor.clinic.data.model.PaymentGatewaysConfig?>(null) }
    var isLoadingPlatformGateways by remember { mutableStateOf(false) }
    var isProcessingSubscriptionPayment by remember { mutableStateOf(false) }
    var selectedAdminPlan by remember { mutableStateOf("1_month") } // "1_month" (1500) or "12_month" (15000)
    var selectedAdminGateway by remember { mutableStateOf("esewa") }
    var adminPaymentTxId by remember { mutableStateOf("") }

    // Clinic Activation & Subscription state
    var isActivated by remember { mutableStateOf<Boolean?>(true) }
    var activationExpiresAt by remember { mutableStateOf<String?>(null) }
    var activationPlan by remember { mutableStateOf<String?>("1_month") }
    var activationPaidAmount by remember { mutableStateOf<Double?>(0.0) }
    var activationNotes by remember { mutableStateOf<String?>(null) }
    var activationPaymentProofUrl by remember { mutableStateOf<String?>(null) }

    // 30-Day Archive & Account Deletion state
    var isArchived by remember { mutableStateOf(sessionManager.isClinicArchived()) }
    var deletionScheduledAt by remember { mutableStateOf(sessionManager.getClinicDeletionScheduledAt()) }
    var archivedAt by remember { mutableStateOf<String?>(null) }
    var showDeleteAccountDialog by remember { mutableStateOf(false) }
    var isDeletingAccount by remember { mutableStateOf(false) }
    var isRestoringAccount by remember { mutableStateOf(false) }

    // UI state
    var showLocationPicker by remember { mutableStateOf(false) }
    var showTermsDialog by remember { mutableStateOf(false) }
    var isSaving by remember { mutableStateOf(false) }
    var showSuccessMessage by remember { mutableStateOf(false) }
    var errorMessage by remember { mutableStateOf<String?>(null) }

    val coroutineScope = rememberCoroutineScope()
    val scrollState = rememberScrollState()

    // File Pickers
    val connectIpsPfxLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.GetContent()
    ) { uri: Uri? ->
        if (uri != null) {
            try {
                val bytes = context.contentResolver.openInputStream(uri)?.use { it.readBytes() }
                if (bytes != null && bytes.isNotEmpty()) {
                    connectipsPfxBase64 = android.util.Base64.encodeToString(bytes, android.util.Base64.NO_WRAP)
                    connectipsPfxFileName = com.dactor.clinic.domain.util.FileCompressor.resolveDisplayFileName(
                        context = context,
                        uri = uri,
                        defaultBaseName = "connectips_certificate.pfx"
                    )
                    Toast.makeText(context, "Loaded certificate: ${connectipsPfxFileName}", Toast.LENGTH_SHORT).show()
                }
            } catch (e: Exception) {
                Toast.makeText(context, "Could not read .pfx certificate: ${e.message}", Toast.LENGTH_LONG).show()
            }
        }
    }

    val regDocLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.GetContent()
    ) { uri: Uri? ->
        if (uri != null) {
            regDocUri = uri
            regDocName = com.dactor.clinic.domain.util.FileCompressor.resolveDisplayFileName(
                context = context,
                uri = uri,
                defaultBaseName = "registration_doc"
            )
        }
    }

    val remainingClinicSlots = (4 - clinicPictures.size).coerceAtLeast(0)
    val pictureLauncher = rememberLauncherForActivityResult(
        contract = PickMultipleClinicImagesContract()
    ) { uris: List<Uri> ->
        if (uris.isNotEmpty()) {
            val remaining = (4 - clinicPictures.size).coerceAtLeast(0)
            if (remaining > 0) {
                val currentSet = clinicPictures.toSet()
                val uniqueUris = uris.filter { it.toString() !in currentSet }
                val toAdd = uniqueUris.take(remaining).map { it.toString() }
                if (toAdd.isNotEmpty()) {
                    clinicPictures = (clinicPictures + toAdd).take(4)
                }
                if (uris.size > remaining) {
                    Toast.makeText(
                        context,
                        "Added ${toAdd.size} photo(s). Maximum 4 photos allowed.",
                        Toast.LENGTH_SHORT
                    ).show()
                } else if (uniqueUris.size < uris.size) {
                    Toast.makeText(
                        context,
                        "Duplicate photos were ignored.",
                        Toast.LENGTH_SHORT
                    ).show()
                }
            } else {
                Toast.makeText(
                    context,
                    "Maximum 4 photos already selected.",
                    Toast.LENGTH_SHORT
                ).show()
            }
        }
    }

    fun loadClinicData() {
        coroutineScope.launch {
            if (clinicRepository != null) {
                val clinic = if (effectiveClinicId.isNotBlank()) {
                    clinicRepository.getClinicById(effectiveClinicId)
                } else {
                    null
                }
                if (clinic != null) {
                    loadedClinicId = clinic.id
                    currentVerificationStatus = clinic.verificationStatus
                    name = clinic.name
                    phoneDigits = (clinic.contactPhone ?: "").removePrefix("+977").trim()
                    managerPhoneDigits = (clinic.managerPhone ?: "").removePrefix("+977").trim()
                    panNumber = clinic.panNumber ?: ""
                    email = clinic.contactEmail ?: ""
                    address = clinic.addressText ?: ""
                    latitude = (clinic.latitude ?: 27.7052).toString()
                    longitude = (clinic.longitude ?: 85.3193).toString()
                    selectedType = clinic.type ?: "multi_visit"
                    selectedSpecialties = clinic.specialties.toSet()
                    threshold = (clinic.autoNotifyThreshold ?: 2).toString()
                    avgConsultationTimeMinutes = (clinic.avgConsultationTimeMinutes ?: sessionManager.getAverageConsultationTimeMinutes(clinic.id)).toString()
                    description = clinic.description ?: ""
                    existingRegDocUrl = clinic.registrationDocUrl
                    regDocName = clinic.registrationDocUrl?.substringAfterLast('/')
                    clinicPictures = clinic.pictures

                    coroutineScope.launch {
                        try {
                            val specs = clinicRepository?.getSpecialties() ?: emptyList()
                            if (specs.isNotEmpty()) availableSpecialtiesList = specs
                        } catch (e: Exception) {
                            e.printStackTrace()
                        }
                    }

                    // Payment Gateway
                    isDirectPaymentEnabled = clinic.isDirectPaymentEnabled ?: false
                    val initialProv = (clinic.paymentGatewayProvider ?: "esewa").lowercase()
                    selectedGatewayProvider = if (initialProv in listOf("esewa", "khalti", "fonepay", "connectips")) initialProv else "esewa"
                    paymentMerchantId = clinic.merchantId ?: ""
                    paymentApiKey = clinic.paymentApiKey ?: ""
                    paymentSecretKey = ""
                    paymentGatewaysConfig = clinic.getPaymentGatewaysConfig()

                    // Fetch authoritative server setup status + trigger background payment sweep
                    coroutineScope.launch {
                        try {
                            clinicRepository.reconcilePendingPayments(clinic.id)
                        } catch (_: Exception) {}
                        try {
                            val env = clinicRepository.getGatewaySetupStatus(clinic.id)
                            if (!env?.callbackBaseUrl.isNullOrBlank()) {
                                serverCallbackBaseUrl = env!!.callbackBaseUrl!!
                            }
                            val s = env?.setup
                            if (s != null) {
                                isDirectPaymentEnabled = s.isDirectPaymentEnabled
                                val merged = paymentGatewaysConfig.copy(
                                    esewa = paymentGatewaysConfig.esewa.copy(
                                        enabled = s.esewa.enabled,
                                        isVerified = s.esewa.isVerified,
                                        verifiedAt = s.esewa.verifiedAt,
                                        environment = s.esewa.environment,
                                        merchantId = s.esewa.merchantId.ifBlank { paymentGatewaysConfig.esewa.merchantId },
                                        hasSecretKey = s.esewa.hasSecretKey,
                                        callbackUrl = "$serverCallbackBaseUrl?action=return&gateway=esewa"
                                    ),
                                    khalti = paymentGatewaysConfig.khalti.copy(
                                        enabled = s.khalti.enabled,
                                        isVerified = s.khalti.isVerified,
                                        verifiedAt = s.khalti.verifiedAt,
                                        environment = s.khalti.environment,
                                        publicKey = s.khalti.publicKey.ifBlank { paymentGatewaysConfig.khalti.publicKey },
                                        hasSecretKey = s.khalti.hasSecretKey,
                                        callbackUrl = "$serverCallbackBaseUrl?action=return&gateway=khalti"
                                    ),
                                    fonepay = paymentGatewaysConfig.fonepay.copy(
                                        enabled = s.fonepay.enabled,
                                        isVerified = s.fonepay.isVerified,
                                        verifiedAt = s.fonepay.verifiedAt,
                                        environment = s.fonepay.environment,
                                        merchantId = s.fonepay.merchantCode.ifBlank { paymentGatewaysConfig.fonepay.merchantId },
                                        username = s.fonepay.username,
                                        hasSecretKey = s.fonepay.hasSecretKey,
                                        callbackUrl = "$serverCallbackBaseUrl?action=return&gateway=fonepay"
                                    ),
                                    connectips = paymentGatewaysConfig.connectips.copy(
                                        enabled = s.connectips.enabled,
                                        isVerified = s.connectips.isVerified,
                                        verifiedAt = s.connectips.verifiedAt,
                                        environment = s.connectips.environment,
                                        merchantId = s.connectips.merchantId.ifBlank { paymentGatewaysConfig.connectips.merchantId },
                                        appId = s.connectips.appId,
                                        appName = s.connectips.appName.ifBlank { "DactorClinic" },
                                        hasAppPassword = s.connectips.hasAppPassword,
                                        hasPrivateKey = s.connectips.hasPrivateKey,
                                        callbackUrl = "$serverCallbackBaseUrl?action=return&gateway=connectips"
                                    )
                                )
                                paymentGatewaysConfig = merged
                                val cur = merged.getGateway(selectedGatewayProvider)
                                paymentMerchantId = cur.merchantId
                                paymentApiKey = cur.publicKey
                                fonepayUsername = cur.username
                                connectipsAppId = cur.appId
                                connectipsAppName = cur.appName.ifBlank { "DactorClinic" }
                            }
                        } catch (_: Exception) {}
                    }

                    // Activation & Subscription
                    isActivated = clinic.isActivated
                    activationExpiresAt = clinic.activationExpiresAt
                    activationPlan = clinic.activationPlan ?: "1_month"
                    activationPaidAmount = clinic.activationPaidAmount ?: 0.0
                    activationNotes = clinic.activationNotes
                    activationPaymentProofUrl = clinic.activationPaymentProofUrl

                    // Archive status
                    val clinicIsArchived = clinic.isArchived ?: false
                    isArchived = clinicIsArchived
                    deletionScheduledAt = clinic.deletionScheduledAt
                    archivedAt = clinic.archivedAt
                    sessionManager.setClinicArchivedStatus(clinicIsArchived, clinic.deletionScheduledAt)
                }
            }
        }
    }

    LaunchedEffect(effectiveClinicId) {
        loadClinicData()
    }

    fun performRestoreClinic() {
        val targetId = loadedClinicId ?: effectiveClinicId
        if (targetId.isBlank() || clinicRepository == null) return

        isRestoringAccount = true
        coroutineScope.launch {
            try {
                val res = clinicRepository.cancelClinicDeletion(targetId)
                if (res.isSuccess) {
                    sessionManager.setClinicArchivedStatus(false, null)
                    isArchived = false
                    deletionScheduledAt = null
                    archivedAt = null
                    Toast.makeText(context, "Clinic account restored! Normal operations resumed.", Toast.LENGTH_LONG).show()
                    loadClinicData()
                } else {
                    errorMessage = "Unable to restore account: ${res.exceptionOrNull()?.message}"
                }
            } catch (e: Exception) {
                errorMessage = "Error restoring account: ${e.message}"
            } finally {
                isRestoringAccount = false
            }
        }
    }

    fun performScheduleDeletion() {
        val targetId = loadedClinicId ?: effectiveClinicId
        isDeletingAccount = true
        coroutineScope.launch {
            try {
                if (targetId.isNotBlank() && clinicRepository != null) {
                    val result = clinicRepository.scheduleClinicDeletion(targetId)
                    if (result.isSuccess) {
                        val scheduledDate = result.getOrNull()
                        sessionManager.setClinicArchivedStatus(true, scheduledDate)
                    }
                }

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

                // Immediately logout from mobile device
                sessionManager.clearSession()
                try {
                    com.google.android.gms.auth.api.signin.GoogleSignIn.getClient(
                        context,
                        com.google.android.gms.auth.api.signin.GoogleSignInOptions.DEFAULT_SIGN_IN
                    ).signOut()
                    com.google.firebase.auth.FirebaseAuth.getInstance().signOut()
                } catch (ignored: Exception) {}

                showDeleteAccountDialog = false
                Toast.makeText(
                    context,
                    "Clinic account archived for 30 days. You have been logged out.",
                    Toast.LENGTH_LONG
                ).show()

                navController.navigate(NavRoutes.ClinicLogin) {
                    popUpTo(0) { inclusive = true }
                }
            } catch (e: Exception) {
                e.printStackTrace()
                showDeleteAccountDialog = false
                errorMessage = "Failed to schedule deletion: ${e.message}"
            } finally {
                isDeletingAccount = false
            }
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        if (isArchived) "Clinic Archive Status" else "Clinic Configuration",
                        fontWeight = FontWeight.Bold
                    )
                },
                navigationIcon = {
                    IconButton(onClick = { navController.popBackStack() }) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                }
            )
        }
    ) { padding ->

        if (isArchived) {
            // =========================================================================
            // 30-DAY ARCHIVE VIEW: LOCKED OUT FROM CLINIC PORTAL OPERATIONS
            // DISPLAYS DAY COUNTDOWN, SCHEDULED DATE, PURGE NOTICE, & RESTORE BUTTON
            // =========================================================================
            val daysRemaining = ArchiveDateUtils.calculateDaysRemaining(deletionScheduledAt)
            val formattedDate = ArchiveDateUtils.formatScheduledDeletionDate(deletionScheduledAt)

            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(padding)
                    .padding(20.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.Center
            ) {
                // Hourglass Badge
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

                Spacer(Modifier.height(18.dp))

                Text(
                    text = "Clinic Scheduled for Deletion",
                    fontSize = 20.sp,
                    fontWeight = FontWeight.Bold,
                    color = Color(0xFF991B1B),
                    textAlign = TextAlign.Center
                )

                Spacer(Modifier.height(6.dp))

                Text(
                    text = "Your clinic is currently in the 30-day archive holding period.",
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
                        Text(
                            text = "ARCHIVE COUNTDOWN",
                            fontSize = 11.sp,
                            fontWeight = FontWeight.Bold,
                            color = Color(0xFFB91C1C),
                            letterSpacing = 1.sp
                        )

                        Text(
                            text = "$daysRemaining Days Left",
                            fontSize = 32.sp,
                            fontWeight = FontWeight.ExtraBold,
                            color = Color(0xFFDC2626)
                        )

                        Text(
                            text = "Permanent purge scheduled for: $formattedDate",
                            fontSize = 12.sp,
                            fontWeight = FontWeight.Medium,
                            color = Color(0xFF7F1D1D),
                            textAlign = TextAlign.Center
                        )
                    }
                }

                Spacer(Modifier.height(16.dp))

                // Patient Data Purge Warning Box
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
                        Icon(
                            Icons.Default.Warning,
                            contentDescription = null,
                            tint = Color(0xFFD97706),
                            modifier = Modifier.size(20.dp)
                        )
                        Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                            Text(
                                text = "Patient Records Purge Warning",
                                fontWeight = FontWeight.Bold,
                                fontSize = 13.sp,
                                color = Color(0xFF92400E)
                            )
                            Text(
                                text = "If this 30-day archive period expires without cancellation, all patient appointment records, consultation histories, lab test reports, and queue tokens under this clinic will be permanently deleted from the database.",
                                fontSize = 11.sp,
                                color = Color(0xFF78350F),
                                lineHeight = 16.sp
                            )
                        }
                    }
                }

                Spacer(Modifier.height(28.dp))

                // Cancel Deletion & Restore Button
                Button(
                    onClick = { performRestoreClinic() },
                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF059669)),
                    shape = RoundedCornerShape(14.dp),
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(52.dp),
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

                // Sign Out Button
                OutlinedButton(
                    onClick = {
                        sessionManager.clearSession()
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
            // ACTIVE MODE: FULL EDITING OF CLINIC DETAILS, PAYMENT KEYS & SETTINGS
            // =========================================================================
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(padding)
                    .verticalScroll(scrollState)
                    .padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp)
            ) {
                // Error Message
                AnimatedVisibility(visible = errorMessage != null) {
                    Surface(
                        color = MaterialTheme.colorScheme.errorContainer,
                        shape = RoundedCornerShape(12.dp),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Row(
                            modifier = Modifier.padding(14.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            Icon(Icons.Default.ErrorOutline, contentDescription = null, tint = MaterialTheme.colorScheme.error)
                            Text(
                                errorMessage ?: "",
                                color = MaterialTheme.colorScheme.onErrorContainer,
                                fontSize = 13.sp,
                                fontWeight = FontWeight.Medium
                            )
                        }
                    }
                }

                // Success Message
                AnimatedVisibility(visible = showSuccessMessage) {
                    Surface(
                        color = MaterialTheme.colorScheme.primaryContainer,
                        shape = RoundedCornerShape(12.dp),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Row(
                            modifier = Modifier.padding(14.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            Icon(Icons.Default.Check, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
                            Text(
                                "Clinic settings and profile saved successfully!",
                                color = MaterialTheme.colorScheme.onPrimaryContainer,
                                fontSize = 13.sp,
                                fontWeight = FontWeight.Medium
                            )
                        }
                    }
                }

                // SUBSCRIPTION & ACTIVATION STATUS CARD
                val isLicValid = ArchiveDateUtils.isClinicActivationValid(isActivated, activationExpiresAt)
                val daysRemaining = ArchiveDateUtils.calculateActivationDaysLeft(activationExpiresAt)
                val formattedExpiry = ArchiveDateUtils.formatActivationExpiryDate(activationExpiresAt)

                Card(
                    shape = RoundedCornerShape(16.dp),
                    colors = CardDefaults.cardColors(
                        containerColor = if (isLicValid) Color(0xFFECFDF5) else Color(0xFFFEF2F2)
                    ),
                    border = BorderStroke(1.dp, if (isLicValid) Color(0xFFA7F3D0) else Color(0xFFFECACA)),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Column(
                        modifier = Modifier.padding(16.dp),
                        verticalArrangement = Arrangement.spacedBy(10.dp)
                    ) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.SpaceBetween
                        ) {
                            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                Icon(
                                    if (isLicValid) Icons.Default.Verified else Icons.Default.Warning,
                                    contentDescription = null,
                                    tint = if (isLicValid) Color(0xFF059669) else Color(0xFFDC2626),
                                    modifier = Modifier.size(22.dp)
                                )
                                Text(
                                    "Portal License & Subscription",
                                    fontWeight = FontWeight.Bold,
                                    fontSize = 15.sp,
                                    color = if (isLicValid) Color(0xFF065F46) else Color(0xFF991B1B)
                                )
                            }
                            Surface(
                                shape = RoundedCornerShape(8.dp),
                                color = if (isLicValid) Color(0xFFD1FAE5) else Color(0xFFFEE2E2)
                            ) {
                                Text(
                                    text = if (isLicValid) "$daysRemaining Days Left" else "Inactive / Expired",
                                    fontSize = 11.sp,
                                    fontWeight = FontWeight.Bold,
                                    color = if (isLicValid) Color(0xFF047857) else Color(0xFFB91C1C),
                                    modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
                                )
                            }
                        }

                        Text(
                            text = if (isLicValid) "Your clinic portal is active and discoverable on Dactor Nepal. Subscription expires on $formattedExpiry."
                            else "Your clinic portal is inactive or expired. Inactive clinics cannot process queues or accept bookings.",
                            fontSize = 12.sp,
                            color = if (isLicValid) Color(0xFF047857) else Color(0xFF7F1D1D),
                            lineHeight = 16.sp
                        )

                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            Surface(
                                shape = RoundedCornerShape(8.dp),
                                color = MaterialTheme.colorScheme.surface,
                                border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.5f)),
                                modifier = Modifier.weight(1f)
                            ) {
                                Column(modifier = Modifier.padding(10.dp)) {
                                    Text("Current Plan", fontSize = 10.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                    Text(
                                        if (activationPlan == "12_month") "12 Months (Annual)" else "1 Month (Monthly)",
                                        fontSize = 12.sp,
                                        fontWeight = FontWeight.Bold
                                    )
                                }
                            }
                            Surface(
                                shape = RoundedCornerShape(8.dp),
                                color = MaterialTheme.colorScheme.surface,
                                border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.5f)),
                                modifier = Modifier.weight(1f)
                            ) {
                                Column(modifier = Modifier.padding(10.dp)) {
                                    Text("Valid Until", fontSize = 10.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                    Text(
                                        formattedExpiry,
                                        fontSize = 12.sp,
                                        fontWeight = FontWeight.Bold
                                    )
                                }
                            }
                        }

                        // Pay & Renew Subscription Button
                        Button(
                            onClick = {
                                showSubscriptionPayDialog = true
                                isLoadingPlatformGateways = true
                                coroutineScope.launch {
                                    try {
                                        platformGatewaysConfig = clinicRepository?.getPlatformPaymentConfig()
                                    } catch (e: Exception) {
                                        e.printStackTrace()
                                    } finally {
                                        isLoadingPlatformGateways = false
                                    }
                                }
                            },
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(44.dp),
                            shape = RoundedCornerShape(10.dp),
                            colors = ButtonDefaults.buttonColors(
                                containerColor = if (isLicValid) MaterialTheme.colorScheme.primary else Color(0xFFDC2626)
                            )
                        ) {
                            Icon(Icons.Default.Payment, contentDescription = null, modifier = Modifier.size(18.dp))
                            Spacer(Modifier.width(8.dp))
                            Text(
                                if (isLicValid) "Pay & Renew Platform License" else "Activate Platform License Now",
                                fontWeight = FontWeight.Bold,
                                fontSize = 13.sp
                            )
                        }
                    }
                }

                // Section 1: Clinic Operational Type Self-Management
                Card(
                    shape = RoundedCornerShape(16.dp),
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f))
                ) {
                    Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        Text("Clinic Operational Type", fontWeight = FontWeight.Bold, fontSize = 15.sp)
                        Text(
                            "You can edit your clinic's operational model at any time to configure patient workflow:",
                            fontSize = 12.sp,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )

                        Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                RadioButton(
                                    selected = selectedType == "single_visit",
                                    onClick = { selectedType = "single_visit" }
                                )
                                Column(modifier = Modifier.padding(start = 4.dp)) {
                                    Text("Single Visit Consultation", fontWeight = FontWeight.SemiBold, fontSize = 13.sp)
                                    Text("For one-time specialist consultations. Requires payment for booking.", fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                }
                            }

                            Row(verticalAlignment = Alignment.CenterVertically) {
                                RadioButton(
                                    selected = selectedType == "multi_visit",
                                    onClick = { selectedType = "multi_visit" }
                                )
                                Column(modifier = Modifier.padding(start = 4.dp)) {
                                    Text("Multi-Visit / Ongoing Care Clinic", fontWeight = FontWeight.SemiBold, fontSize = 13.sp)
                                    Text("Returning patients can book follow-ups with 10-digit code directly without upfront payment.", fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                }
                            }

                            Row(verticalAlignment = Alignment.CenterVertically) {
                                RadioButton(
                                    selected = selectedType == "diagnostic_lab",
                                    onClick = { selectedType = "diagnostic_lab" }
                                )
                                Column(modifier = Modifier.padding(start = 4.dp)) {
                                    Text("Diagnostic / Pathology Lab", fontWeight = FontWeight.SemiBold, fontSize = 13.sp)
                                    Text("Sample collection, diagnostic processing, and digital test report distribution.", fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                }
                            }
                        }
                    }
                }

                // Section 1.5: Medical Specialties & Clinical Offerings (Multi-Select)
                Card(
                    shape = RoundedCornerShape(16.dp),
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                    border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant)
                ) {
                    Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text(
                                if (selectedType == "diagnostic_lab") "Lab Services & Scans (Multi-Select)"
                                else "Clinical Specialties (Multi-Select)",
                                fontWeight = FontWeight.Bold,
                                fontSize = 15.sp
                            )
                            Text(
                                "${selectedSpecialties.size} Selected",
                                fontSize = 12.sp,
                                color = MaterialTheme.colorScheme.primary,
                                fontWeight = FontWeight.Bold
                            )
                        }
                        Text(
                            if (selectedType == "diagnostic_lab") "Select all diagnostic tests, imaging scans, and pathology offerings provided (e.g. MRI, CT Scan, X-Ray, Blood Tests). When patients search for tests or scans, matching offerings direct them to your lab."
                            else "Select all medical departments provided at your facility (e.g. skin, heart, child, bone). When patients search for symptoms or conditions, matching specialties direct them to your clinic.",
                            fontSize = 12.sp,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )

                        val allSpecNames = if (selectedType == "diagnostic_lab") {
                            listOf(
                                "MRI (Magnetic Resonance Imaging)",
                                "CT Scan (Computed Tomography)",
                                "Digital X-Ray (Radiography)",
                                "Ultrasound (USG / Sonography)",
                                "Blood Tests & CBC (Hematology)",
                                "Pathology & Biopsy",
                                "Clinical Biochemistry",
                                "Microbiology & Culture",
                                "ECG (Electrocardiogram)",
                                "Echocardiography (Echo)",
                                "Urine & Stool Analysis",
                                "Endoscopy & Colonoscopy",
                                "Histopathology & Cytology",
                                "Mammography & Breast Scan",
                                "Thyroid & Hormone Profile",
                                "Lipid Profile & Cardiac Markers",
                                "Allergy & Immunology Tests",
                                "Bone Densitometry (BMD/DEXA)"
                            )
                        } else if (availableSpecialtiesList.isNotEmpty()) {
                            availableSpecialtiesList.map { it.name }
                        } else {
                            listOf(
                                "General Medicine & Physician",
                                "Dermatology & Skin Care",
                                "Cardiology (Heart Care)",
                                "Pediatrics & Child Health",
                                "Orthopedics & Joint Care",
                                "Gynecology & Obstetrics",
                                "ENT (Ear, Nose & Throat)",
                                "Ophthalmology (Eye Care)",
                                "Dental Care & Dentistry",
                                "Neurology (Brain & Nerve)",
                                "Psychiatry & Mental Health",
                                "Gastroenterology & Liver",
                                "Pulmonology & Chest Care",
                                "Urology & Kidney Care",
                                "Endocrinology & Diabetes",
                                "Oncology & Cancer Care"
                            )
                        }

                        // Grid of selectable chips
                        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            allSpecNames.chunked(2).forEach { rowSpecs ->
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                                ) {
                                    rowSpecs.forEach { specName ->
                                        val isSelected = selectedSpecialties.contains(specName)
                                        FilterChip(
                                            selected = isSelected,
                                            onClick = {
                                                selectedSpecialties = if (isSelected) {
                                                    selectedSpecialties - specName
                                                } else {
                                                    selectedSpecialties + specName
                                                }
                                            },
                                            label = { Text(specName, fontSize = 11.sp, maxLines = 1) },
                                            leadingIcon = if (isSelected) {
                                                { Icon(Icons.Default.Check, contentDescription = null, modifier = Modifier.size(14.dp)) }
                                            } else null,
                                            modifier = Modifier.weight(1f)
                                        )
                                    }
                                    if (rowSpecs.size == 1) {
                                        Spacer(modifier = Modifier.weight(1f))
                                    }
                                }
                            }
                        }
                    }
                }

                // Section 2: Clinic Profile Details (Full Editing)
                Card(
                    shape = RoundedCornerShape(16.dp),
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                    border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant)
                ) {
                    Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
                        Text("Clinic Profile Information", fontWeight = FontWeight.Bold, fontSize = 15.sp)

                        // 1. Clinic Name
                        OutlinedTextField(
                            value = name,
                            onValueChange = { name = it },
                            label = { Text("Name of the Clinic *") },
                            placeholder = { Text("Enter clinic or hospital name") },
                            leadingIcon = { Icon(Icons.Default.LocalHospital, contentDescription = null) },
                            modifier = Modifier.fillMaxWidth(),
                            shape = RoundedCornerShape(12.dp)
                        )

                        // 2. Location (with Location Picker button)
                        Surface(
                            shape = RoundedCornerShape(12.dp),
                            color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f),
                            border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                        Icon(Icons.Default.LocationOn, contentDescription = null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(18.dp))
                                        Text("Location *", fontWeight = FontWeight.SemiBold, fontSize = 13.sp)
                                    }
                                    FilledTonalButton(
                                        onClick = { showLocationPicker = true },
                                        shape = RoundedCornerShape(8.dp),
                                        contentPadding = PaddingValues(horizontal = 10.dp, vertical = 6.dp),
                                        modifier = Modifier.defaultMinSize(minHeight = 36.dp)
                                    ) {
                                        Icon(Icons.Default.Map, contentDescription = null, modifier = Modifier.size(14.dp))
                                        Spacer(Modifier.width(4.dp))
                                        Text("Open Map Picker", fontSize = 11.sp, fontWeight = FontWeight.Bold)
                                    }
                                }

                                OutlinedTextField(
                                    value = address,
                                    onValueChange = { address = it },
                                    label = { Text("Address Text") },
                                    placeholder = { Text("e.g. Lagankhel, Lalitpur") },
                                    singleLine = true,
                                    modifier = Modifier.fillMaxWidth(),
                                    shape = RoundedCornerShape(10.dp)
                                )

                                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                    OutlinedTextField(
                                        value = latitude,
                                        onValueChange = { latitude = it },
                                        label = { Text("Latitude") },
                                        modifier = Modifier.weight(1f),
                                        shape = RoundedCornerShape(10.dp),
                                        singleLine = true
                                    )
                                    OutlinedTextField(
                                        value = longitude,
                                        onValueChange = { longitude = it },
                                        label = { Text("Longitude") },
                                        modifier = Modifier.weight(1f),
                                        shape = RoundedCornerShape(10.dp),
                                        singleLine = true
                                    )
                                }
                            }
                        }

                        // 3. Registration Paper (upload)
                        Surface(
                            shape = RoundedCornerShape(12.dp),
                            color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f),
                            border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Row(
                                modifier = Modifier.padding(12.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.SpaceBetween
                            ) {
                                Column(modifier = Modifier.weight(1f)) {
                                    Text("Registration Paper (Upload)", fontWeight = FontWeight.SemiBold, fontSize = 13.sp)
                                    Text(
                                        text = regDocName ?: "Upload government registration certificate",
                                        fontSize = 11.sp,
                                        color = if (regDocName != null) Color(0xFF047857) else MaterialTheme.colorScheme.onSurfaceVariant,
                                        fontWeight = if (regDocName != null) FontWeight.Bold else FontWeight.Normal
                                    )
                                }

                                OutlinedButton(
                                    onClick = { regDocLauncher.launch("*/*") },
                                    shape = RoundedCornerShape(8.dp),
                                    contentPadding = PaddingValues(horizontal = 12.dp, vertical = 6.dp),
                                    modifier = Modifier.defaultMinSize(minHeight = 36.dp)
                                ) {
                                    Icon(Icons.Default.UploadFile, contentDescription = null, modifier = Modifier.size(14.dp))
                                    Spacer(Modifier.width(4.dp))
                                    Text(if (regDocName != null) "Change" else "Upload", fontSize = 12.sp)
                                }
                            }
                        }

                        // 4. PAN Number (always 9 digit)
                        OutlinedTextField(
                            value = panNumber,
                            onValueChange = {
                                if (it.length <= 9 && it.all { ch -> ch.isDigit() }) {
                                    panNumber = it
                                }
                            },
                            label = { Text("PAN Number (9 Digits Always) *") },
                            placeholder = { Text("e.g. 601234567") },
                            leadingIcon = { Icon(Icons.Default.Badge, contentDescription = null) },
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                            singleLine = true,
                            supportingText = {
                                Text(
                                    text = "${panNumber.length}/9 digits" + if (panNumber.length == 9) " ✓ Valid" else " (Must be exactly 9 digits)",
                                    color = if (panNumber.length == 9) Color(0xFF047857) else MaterialTheme.colorScheme.onSurfaceVariant
                                )
                            },
                            isError = panNumber.isNotBlank() && panNumber.length != 9,
                            modifier = Modifier.fillMaxWidth(),
                            shape = RoundedCornerShape(12.dp)
                        )

                        // 5. Clinic Contact Number (+977 and 10 digits)
                        OutlinedTextField(
                            value = phoneDigits,
                            onValueChange = {
                                if (it.length <= 10 && it.all { ch -> ch.isDigit() }) {
                                    phoneDigits = it
                                }
                            },
                            label = { Text("Clinic Contact Number *") },
                            placeholder = { Text("98xxxxxxxx (10 digits)") },
                            prefix = { Text("+977 ", fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.primary) },
                            leadingIcon = { Icon(Icons.Default.Phone, contentDescription = null) },
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone),
                            singleLine = true,
                            supportingText = {
                                Text(
                                    text = "Country code +977 • ${phoneDigits.length}/10 digits" + if (phoneDigits.length == 10) " ✓" else "",
                                    color = if (phoneDigits.length == 10) Color(0xFF047857) else MaterialTheme.colorScheme.onSurfaceVariant
                                )
                            },
                            isError = phoneDigits.isNotBlank() && phoneDigits.length != 10,
                            modifier = Modifier.fillMaxWidth(),
                            shape = RoundedCornerShape(12.dp)
                        )

                        // 6. Manager Contact Number (+977 and 10 digits)
                        OutlinedTextField(
                            value = managerPhoneDigits,
                            onValueChange = {
                                if (it.length <= 10 && it.all { ch -> ch.isDigit() }) {
                                    managerPhoneDigits = it
                                }
                            },
                            label = { Text("Manager Contact Number *") },
                            placeholder = { Text("98xxxxxxxx (10 digits)") },
                            prefix = { Text("+977 ", fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.primary) },
                            leadingIcon = { Icon(Icons.Default.ContactPhone, contentDescription = null) },
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone),
                            singleLine = true,
                            supportingText = {
                                Text(
                                    text = "Country code +977 • ${managerPhoneDigits.length}/10 digits" + if (managerPhoneDigits.length == 10) " ✓" else "",
                                    color = if (managerPhoneDigits.length == 10) Color(0xFF047857) else MaterialTheme.colorScheme.onSurfaceVariant
                                )
                            },
                            isError = managerPhoneDigits.isNotBlank() && managerPhoneDigits.length != 10,
                            modifier = Modifier.fillMaxWidth(),
                            shape = RoundedCornerShape(12.dp)
                        )

                        // 7. Pictures of Clinic (1-4, one by one)
                        Surface(
                            shape = RoundedCornerShape(12.dp),
                            color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f),
                            border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Column(modifier = Modifier.weight(1f, fill = false)) {
                                        Row(
                                            verticalAlignment = Alignment.CenterVertically,
                                            horizontalArrangement = Arrangement.spacedBy(6.dp)
                                        ) {
                                            Text("Pictures of Clinic (1-4) *", fontWeight = FontWeight.SemiBold, fontSize = 13.sp)
                                            Surface(
                                                color = if (clinicPictures.size == 4) Color(0xFF047857).copy(alpha = 0.15f)
                                                        else if (clinicPictures.isNotEmpty()) MaterialTheme.colorScheme.primaryContainer
                                                        else MaterialTheme.colorScheme.surfaceVariant,
                                                shape = RoundedCornerShape(6.dp),
                                                border = BorderStroke(
                                                    0.5.dp,
                                                    if (clinicPictures.size == 4) Color(0xFF047857)
                                                    else if (clinicPictures.isNotEmpty()) MaterialTheme.colorScheme.primary
                                                    else MaterialTheme.colorScheme.outlineVariant
                                                )
                                            ) {
                                                Text(
                                                    text = "${clinicPictures.size}/4",
                                                    fontSize = 11.sp,
                                                    fontWeight = FontWeight.Bold,
                                                    color = if (clinicPictures.size == 4) Color(0xFF047857)
                                                            else if (clinicPictures.isNotEmpty()) MaterialTheme.colorScheme.primary
                                                            else MaterialTheme.colorScheme.onSurfaceVariant,
                                                    modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
                                                )
                                            }
                                        }
                                        Spacer(Modifier.height(2.dp))
                                        Text(
                                            text = when (clinicPictures.size) {
                                                0 -> "0/4 photos added • You can select up to 4 pictures"
                                                4 -> "4/4 photos added • Maximum reached ✓"
                                                else -> "${clinicPictures.size}/4 photos added • Can select up to $remainingClinicSlots more"
                                            },
                                            fontSize = 11.sp,
                                            color = if (clinicPictures.isNotEmpty()) Color(0xFF047857) else MaterialTheme.colorScheme.onSurfaceVariant,
                                            fontWeight = if (clinicPictures.isNotEmpty()) FontWeight.Bold else FontWeight.Normal
                                        )
                                    }

                                    if (remainingClinicSlots > 0) {
                                        OutlinedButton(
                                            onClick = { pictureLauncher.launch(remainingClinicSlots) },
                                            shape = RoundedCornerShape(8.dp),
                                            contentPadding = PaddingValues(horizontal = 12.dp, vertical = 6.dp),
                                            modifier = Modifier.defaultMinSize(minHeight = 36.dp)
                                        ) {
                                            Icon(Icons.Default.AddPhotoAlternate, contentDescription = null, modifier = Modifier.size(14.dp))
                                            Spacer(Modifier.width(4.dp))
                                            Text(
                                                text = if (clinicPictures.isEmpty()) "+ Add Photos (up to 4)" else "+ Add (${remainingClinicSlots} left)",
                                                fontSize = 12.sp,
                                                fontWeight = FontWeight.Bold
                                            )
                                        }
                                    }
                                }

                                // Compact Previews Row
                                if (clinicPictures.isNotEmpty()) {
                                    val previewScrollState = rememberScrollState()
                                    Row(
                                        modifier = Modifier
                                            .fillMaxWidth()
                                            .horizontalScroll(previewScrollState),
                                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                                        verticalAlignment = Alignment.CenterVertically
                                    ) {
                                        clinicPictures.forEachIndexed { idx, picUriStr ->
                                            Box(
                                                modifier = Modifier
                                                    .size(68.dp)
                                                    .clip(RoundedCornerShape(10.dp))
                                                    .border(1.dp, MaterialTheme.colorScheme.outlineVariant, RoundedCornerShape(10.dp))
                                                    .background(MaterialTheme.colorScheme.surfaceVariant)
                                            ) {
                                                AsyncImage(
                                                    model = picUriStr,
                                                    contentDescription = "Clinic photo ${idx + 1}",
                                                    contentScale = ContentScale.Crop,
                                                    modifier = Modifier.fillMaxSize()
                                                )
                                                // Photo number badge on bottom-start
                                                Surface(
                                                    shape = RoundedCornerShape(topEnd = 6.dp),
                                                    color = Color.Black.copy(alpha = 0.65f),
                                                    modifier = Modifier.align(Alignment.BottomStart)
                                                ) {
                                                    Text(
                                                        text = "${idx + 1}/4",
                                                        color = Color.White,
                                                        fontSize = 9.sp,
                                                        fontWeight = FontWeight.Bold,
                                                        modifier = Modifier.padding(horizontal = 4.dp, vertical = 1.dp)
                                                    )
                                                }
                                                // Remove badge on top-right
                                                Surface(
                                                    onClick = {
                                                        clinicPictures = clinicPictures.filterIndexed { i, _ -> i != idx }
                                                    },
                                                    shape = CircleShape,
                                                    color = Color.Black.copy(alpha = 0.7f),
                                                    modifier = Modifier
                                                        .align(Alignment.TopEnd)
                                                        .padding(3.dp)
                                                        .size(20.dp)
                                                ) {
                                                    Icon(
                                                        imageVector = Icons.Default.Close,
                                                        contentDescription = "Remove photo",
                                                        tint = Color.White,
                                                        modifier = Modifier.padding(3.dp)
                                                    )
                                                }
                                            }
                                        }

                                        // Direct "+ Add" box if less than 4
                                        if (remainingClinicSlots > 0) {
                                            Surface(
                                                onClick = { pictureLauncher.launch(remainingClinicSlots) },
                                                shape = RoundedCornerShape(10.dp),
                                                color = MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.35f),
                                                border = BorderStroke(1.dp, MaterialTheme.colorScheme.primary.copy(alpha = 0.4f)),
                                                modifier = Modifier.size(68.dp)
                                            ) {
                                                Column(
                                                    modifier = Modifier.fillMaxSize(),
                                                    horizontalAlignment = Alignment.CenterHorizontally,
                                                    verticalArrangement = Arrangement.Center
                                                ) {
                                                    Icon(
                                                        Icons.Default.Add,
                                                        contentDescription = "Add picture",
                                                        tint = MaterialTheme.colorScheme.primary,
                                                        modifier = Modifier.size(20.dp)
                                                    )
                                                    Text(
                                                        text = "+ ($remainingClinicSlots)",
                                                        fontSize = 10.sp,
                                                        fontWeight = FontWeight.Bold,
                                                        color = MaterialTheme.colorScheme.primary
                                                    )
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }

                        // 8. Description
                        OutlinedTextField(
                            value = description,
                            onValueChange = { description = it },
                            label = { Text("Description") },
                            placeholder = { Text("Specialties, clinic timings, available lab facilities...") },
                            maxLines = 3,
                            modifier = Modifier.fillMaxWidth(),
                            shape = RoundedCornerShape(12.dp)
                        )

                        // 9. Auto-Notify Threshold
                        OutlinedTextField(
                            value = threshold,
                            onValueChange = { threshold = it },
                            label = { Text("Auto-Alert Threshold (Patients Ahead)") },
                            placeholder = { Text("2") },
                            supportingText = { Text("System triggers an advance SMS/alert when this many patients are ahead in queue.") },
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                            modifier = Modifier.fillMaxWidth(),
                            shape = RoundedCornerShape(12.dp)
                        )

                        // 10. Average Consultation Time
                        OutlinedTextField(
                            value = avgConsultationTimeMinutes,
                            onValueChange = { avgConsultationTimeMinutes = it.filter { ch -> ch.isDigit() } },
                            label = { Text("Average Consultation Duration (Minutes)") },
                            placeholder = { Text("15") },
                            trailingIcon = { Text("mins", modifier = Modifier.padding(end = 12.dp), color = MaterialTheme.colorScheme.onSurfaceVariant) },
                            supportingText = { Text("Auto-recalculated after each consultation based on actual time inside. You can edit this value anytime.") },
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                            modifier = Modifier.fillMaxWidth(),
                            shape = RoundedCornerShape(12.dp)
                        )
                    }
                }

                // Section 3: Direct Payment Gateway & Merchant API Keys
                Card(
                    shape = RoundedCornerShape(16.dp),
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                    border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant)
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
                            Column(modifier = Modifier.weight(1f)) {
                                Text("Direct Payment Gateway & API Keys", fontWeight = FontWeight.Bold, fontSize = 15.sp)
                                Text(
                                    "Receive patient payments directly into your clinic account",
                                    fontSize = 11.sp,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                            }
                            Switch(
                                checked = isDirectPaymentEnabled,
                                onCheckedChange = { isDirectPaymentEnabled = it }
                            )
                        }

                        if (isDirectPaymentEnabled) {
                            Surface(
                                shape = RoundedCornerShape(12.dp),
                                color = MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.25f),
                                border = BorderStroke(1.dp, MaterialTheme.colorScheme.primary.copy(alpha = 0.3f)),
                                modifier = Modifier.fillMaxWidth()
                            ) {
                                Row(
                                    modifier = Modifier.padding(12.dp),
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                                ) {
                                    Icon(Icons.Default.AccountBalance, contentDescription = null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(18.dp))
                                    Text(
                                        "Payment credentials are securely encrypted. Patient consultation fees route directly to your registered gateway.",
                                        fontSize = 11.sp,
                                        color = MaterialTheme.colorScheme.onPrimaryContainer,
                                        lineHeight = 15.sp
                                    )
                                }
                            }

                            // Payment Gateway Provider Selection
                            Text("Select Payment Gateway Provider:", fontWeight = FontWeight.SemiBold, fontSize = 12.sp)
                            Text(
                                "Only gateways with verified keys appear to patients. Pay at Desk (+5%) requires no keys and is always available.",
                                fontSize = 10.sp,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                lineHeight = 14.sp
                            )
                            val gateways = listOf(
                                "esewa" to "eSewa",
                                "khalti" to "Khalti",
                                "fonepay" to "Fonepay QR",
                                "connectips" to "ConnectIPS"
                            )

                            gateways.chunked(2).forEach { rowItems ->
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                                ) {
                                    rowItems.forEach { (id, label) ->
                                        val gwItem = paymentGatewaysConfig.getGateway(id)
                                        val badgeSuffix = if (gwItem.isVerified && gwItem.enabled) " ✓" else ""
                                        FilterChip(
                                            selected = selectedGatewayProvider == id,
                                            onClick = {
                                                selectedGatewayProvider = id
                                                val currentItem = paymentGatewaysConfig.getGateway(id)
                                                paymentMerchantId = currentItem.merchantId
                                                paymentApiKey = currentItem.publicKey
                                                paymentSecretKey = ""
                                                fonepayUsername = currentItem.username
                                                connectipsAppId = currentItem.appId
                                                connectipsAppName = currentItem.appName.ifBlank { "DactorClinic" }
                                            },
                                            label = { Text("$label$badgeSuffix", fontSize = 11.sp, fontWeight = FontWeight.SemiBold) },
                                            modifier = Modifier.weight(1f)
                                        )
                                    }
                                }
                            }

                            val activeGatewayItem = paymentGatewaysConfig.getGateway(selectedGatewayProvider)
                            val gatewayCallbackUrl = "$serverCallbackBaseUrl?action=return&gateway=$selectedGatewayProvider"

                            // Verification Status Pill
                            Surface(
                                shape = RoundedCornerShape(10.dp),
                                color = if (activeGatewayItem.isVerified) Color(0xFFECFDF5) else Color(0xFFFFFBEB),
                                border = BorderStroke(1.dp, if (activeGatewayItem.isVerified) Color(0xFFA7F3D0) else Color(0xFFFDE68A)),
                                modifier = Modifier.fillMaxWidth()
                            ) {
                                Row(
                                    modifier = Modifier.padding(10.dp),
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                                ) {
                                    Icon(
                                        if (activeGatewayItem.isVerified) Icons.Default.Verified else Icons.Default.Info,
                                        contentDescription = null,
                                        tint = if (activeGatewayItem.isVerified) Color(0xFF059669) else Color(0xFFD97706),
                                        modifier = Modifier.size(18.dp)
                                    )
                                    Text(
                                        if (activeGatewayItem.isVerified)
                                            "${selectedGatewayProvider.uppercase()} is verified on server (${activeGatewayItem.environment.uppercase()})."
                                        else
                                            "Keys required: ${selectedGatewayProvider.uppercase()} stays hidden from patients until verified below.",
                                        fontSize = 11.sp,
                                        color = if (activeGatewayItem.isVerified) Color(0xFF065F46) else Color(0xFF92400E),
                                        fontWeight = FontWeight.Medium,
                                        lineHeight = 15.sp
                                    )
                                }
                            }

                            // Gateway Enabled Switch
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Text("Enable ${activeGatewayItem.providerName.ifBlank { selectedGatewayProvider.uppercase() }} for Patients", fontSize = 12.sp, fontWeight = FontWeight.Medium)
                                Switch(
                                    checked = activeGatewayItem.enabled,
                                    onCheckedChange = { isEn ->
                                        val updatedItem = activeGatewayItem.copy(enabled = isEn)
                                        paymentGatewaysConfig = paymentGatewaysConfig.withGateway(selectedGatewayProvider, updatedItem)
                                        val targetId = loadedClinicId ?: effectiveClinicId
                                        if (activeGatewayItem.isVerified && targetId.isNotBlank()) {
                                            coroutineScope.launch {
                                                val res = clinicRepository?.toggleGateway(targetId, selectedGatewayProvider, isEn)
                                                if (res?.isFailure == true) {
                                                    Toast.makeText(context, res.exceptionOrNull()?.message ?: "Could not toggle gateway", Toast.LENGTH_LONG).show()
                                                }
                                            }
                                        }
                                    }
                                )
                            }

                            // Environment Mode (Admin-Managed Platform Routing)
                            Surface(
                                modifier = Modifier.fillMaxWidth(),
                                shape = RoundedCornerShape(10.dp),
                                color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f),
                                border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant)
                            ) {
                                Row(
                                    modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Column {
                                        Text("Gateway Environment Mode", fontSize = 11.sp, fontWeight = FontWeight.SemiBold)
                                        Text(
                                            "Controlled exclusively by Platform Super Admin",
                                            fontSize = 9.sp,
                                            color = MaterialTheme.colorScheme.onSurfaceVariant
                                        )
                                    }
                                    Surface(
                                        shape = RoundedCornerShape(6.dp),
                                        color = if (activeGatewayItem.environment.lowercase() == "live") Color(0xFFD1FAE5) else Color(0xFFFEF3C7)
                                    ) {
                                        Text(
                                            text = if (activeGatewayItem.environment.lowercase() == "live") "LIVE PRODUCTION" else "SANDBOX DEMO",
                                            fontSize = 9.sp,
                                            fontWeight = FontWeight.Bold,
                                            color = if (activeGatewayItem.environment.lowercase() == "live") Color(0xFF047857) else Color(0xFFB45309),
                                            modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
                                        )
                                    }
                                }
                            }

                            // Gateway-Specific Credential Inputs
                            when (selectedGatewayProvider) {
                                "esewa" -> {
                                    OutlinedTextField(
                                        value = paymentMerchantId,
                                        onValueChange = {
                                            paymentMerchantId = it
                                            paymentGatewaysConfig = paymentGatewaysConfig.withGateway("esewa", activeGatewayItem.copy(merchantId = it))
                                        },
                                        label = { Text("eSewa Product Code / Merchant ID *") },
                                        placeholder = { Text("e.g. EPAYTEST (test) or live merchant code") },
                                        leadingIcon = { Icon(Icons.Default.Key, contentDescription = null) },
                                        singleLine = true,
                                        modifier = Modifier.fillMaxWidth(),
                                        shape = RoundedCornerShape(12.dp)
                                    )
                                    OutlinedTextField(
                                        value = paymentSecretKey,
                                        onValueChange = { paymentSecretKey = it },
                                        label = { Text(if (activeGatewayItem.hasSecretKey) "eSewa Secret Key (Stored — enter to replace)" else "eSewa HMAC Secret Key *") },
                                        placeholder = { Text("e.g. 8gBm/:&EnhH.1/q") },
                                        leadingIcon = { Icon(Icons.Default.Lock, contentDescription = null) },
                                        trailingIcon = {
                                            IconButton(onClick = { showSecretKey = !showSecretKey }) {
                                                Icon(if (showSecretKey) Icons.Default.VisibilityOff else Icons.Default.Visibility, contentDescription = null)
                                            }
                                        },
                                        visualTransformation = if (showSecretKey) VisualTransformation.None else PasswordVisualTransformation(),
                                        singleLine = true,
                                        modifier = Modifier.fillMaxWidth(),
                                        shape = RoundedCornerShape(12.dp)
                                    )
                                }
                                "khalti" -> {
                                    OutlinedTextField(
                                        value = paymentApiKey,
                                        onValueChange = {
                                            paymentApiKey = it
                                            paymentGatewaysConfig = paymentGatewaysConfig.withGateway("khalti", activeGatewayItem.copy(publicKey = it))
                                        },
                                        label = { Text("Khalti Public Key (Optional Display ID)") },
                                        placeholder = { Text("live_public_key_... or test_public_key_...") },
                                        leadingIcon = { Icon(Icons.Default.VpnKey, contentDescription = null) },
                                        singleLine = true,
                                        modifier = Modifier.fillMaxWidth(),
                                        shape = RoundedCornerShape(12.dp)
                                    )
                                    OutlinedTextField(
                                        value = paymentSecretKey,
                                        onValueChange = { paymentSecretKey = it },
                                        label = { Text(if (activeGatewayItem.hasSecretKey) "Khalti Secret Key (Stored — enter to replace)" else "Khalti Secret Key (Required) *") },
                                        placeholder = { Text("live_secret_key_... or test_secret_key_...") },
                                        leadingIcon = { Icon(Icons.Default.Lock, contentDescription = null) },
                                        trailingIcon = {
                                            IconButton(onClick = { showSecretKey = !showSecretKey }) {
                                                Icon(if (showSecretKey) Icons.Default.VisibilityOff else Icons.Default.Visibility, contentDescription = null)
                                            }
                                        },
                                        visualTransformation = if (showSecretKey) VisualTransformation.None else PasswordVisualTransformation(),
                                        singleLine = true,
                                        modifier = Modifier.fillMaxWidth(),
                                        shape = RoundedCornerShape(12.dp)
                                    )
                                }
                                "fonepay" -> {
                                    OutlinedTextField(
                                        value = paymentMerchantId,
                                        onValueChange = {
                                            paymentMerchantId = it
                                            paymentGatewaysConfig = paymentGatewaysConfig.withGateway("fonepay", activeGatewayItem.copy(merchantId = it))
                                        },
                                        label = { Text("Fonepay Merchant Code (PID) *") },
                                        placeholder = { Text("e.g. NBQM or Fonepay Merchant PID") },
                                        leadingIcon = { Icon(Icons.Default.Key, contentDescription = null) },
                                        singleLine = true,
                                        modifier = Modifier.fillMaxWidth(),
                                        shape = RoundedCornerShape(12.dp)
                                    )
                                    OutlinedTextField(
                                        value = paymentSecretKey,
                                        onValueChange = { paymentSecretKey = it },
                                        label = { Text(if (activeGatewayItem.hasSecretKey) "Fonepay HMAC Secret Key (Stored — enter to replace)" else "Fonepay HMAC-SHA512 Secret Key *") },
                                        placeholder = { Text("Fonepay shared secret key") },
                                        leadingIcon = { Icon(Icons.Default.Lock, contentDescription = null) },
                                        trailingIcon = {
                                            IconButton(onClick = { showSecretKey = !showSecretKey }) {
                                                Icon(if (showSecretKey) Icons.Default.VisibilityOff else Icons.Default.Visibility, contentDescription = null)
                                            }
                                        },
                                        visualTransformation = if (showSecretKey) VisualTransformation.None else PasswordVisualTransformation(),
                                        singleLine = true,
                                        modifier = Modifier.fillMaxWidth(),
                                        shape = RoundedCornerShape(12.dp)
                                    )
                                    OutlinedTextField(
                                        value = fonepayUsername,
                                        onValueChange = { fonepayUsername = it },
                                        label = { Text("Dynamic QR API Username (Optional)") },
                                        placeholder = { Text("98XXXXXXXX or merchant API username") },
                                        leadingIcon = { Icon(Icons.Default.Person, contentDescription = null) },
                                        singleLine = true,
                                        modifier = Modifier.fillMaxWidth(),
                                        shape = RoundedCornerShape(12.dp)
                                    )
                                    OutlinedTextField(
                                        value = fonepayPassword,
                                        onValueChange = { fonepayPassword = it },
                                        label = { Text("Dynamic QR API Password (Optional)") },
                                        placeholder = { Text("Fonepay Dynamic QR API password") },
                                        leadingIcon = { Icon(Icons.Default.Password, contentDescription = null) },
                                        visualTransformation = if (showSecretKey) VisualTransformation.None else PasswordVisualTransformation(),
                                        singleLine = true,
                                        modifier = Modifier.fillMaxWidth(),
                                        shape = RoundedCornerShape(12.dp)
                                    )
                                }
                                "connectips" -> {
                                    OutlinedTextField(
                                        value = paymentMerchantId,
                                        onValueChange = {
                                            paymentMerchantId = it
                                            paymentGatewaysConfig = paymentGatewaysConfig.withGateway("connectips", activeGatewayItem.copy(merchantId = it))
                                        },
                                        label = { Text("ConnectIPS Merchant ID *") },
                                        placeholder = { Text("e.g. 1024") },
                                        leadingIcon = { Icon(Icons.Default.Key, contentDescription = null) },
                                        singleLine = true,
                                        modifier = Modifier.fillMaxWidth(),
                                        shape = RoundedCornerShape(12.dp)
                                    )
                                    OutlinedTextField(
                                        value = connectipsAppId,
                                        onValueChange = {
                                            connectipsAppId = it
                                            paymentGatewaysConfig = paymentGatewaysConfig.withGateway("connectips", activeGatewayItem.copy(appId = it))
                                        },
                                        label = { Text("ConnectIPS App ID *") },
                                        placeholder = { Text("e.g. MER-1024-APP-1") },
                                        leadingIcon = { Icon(Icons.Default.VpnKey, contentDescription = null) },
                                        singleLine = true,
                                        modifier = Modifier.fillMaxWidth(),
                                        shape = RoundedCornerShape(12.dp)
                                    )
                                    OutlinedTextField(
                                        value = connectipsAppName,
                                        onValueChange = { connectipsAppName = it },
                                        label = { Text("ConnectIPS App Name *") },
                                        placeholder = { Text("Exact NCHL registered App Name") },
                                        leadingIcon = { Icon(Icons.Default.Badge, contentDescription = null) },
                                        singleLine = true,
                                        modifier = Modifier.fillMaxWidth(),
                                        shape = RoundedCornerShape(12.dp)
                                    )
                                    OutlinedTextField(
                                        value = connectipsAppPassword,
                                        onValueChange = { connectipsAppPassword = it },
                                        label = { Text(if (activeGatewayItem.hasAppPassword) "Validation API Password (Stored — enter to replace)" else "Validation API Password (Basic Auth) *") },
                                        placeholder = { Text("NCHL validation password") },
                                        leadingIcon = { Icon(Icons.Default.Lock, contentDescription = null) },
                                        trailingIcon = {
                                            IconButton(onClick = { showSecretKey = !showSecretKey }) {
                                                Icon(if (showSecretKey) Icons.Default.VisibilityOff else Icons.Default.Visibility, contentDescription = null)
                                            }
                                        },
                                        visualTransformation = if (showSecretKey) VisualTransformation.None else PasswordVisualTransformation(),
                                        singleLine = true,
                                        modifier = Modifier.fillMaxWidth(),
                                        shape = RoundedCornerShape(12.dp)
                                    )
                                    OutlinedButton(
                                        onClick = { connectIpsPfxLauncher.launch("*/*") },
                                        modifier = Modifier.fillMaxWidth(),
                                        shape = RoundedCornerShape(12.dp)
                                    ) {
                                        Icon(Icons.Default.UploadFile, contentDescription = null, modifier = Modifier.size(16.dp))
                                        Spacer(Modifier.width(6.dp))
                                        Text(
                                            connectipsPfxFileName?.let { "Certificate Loaded: $it" }
                                                ?: if (activeGatewayItem.hasPrivateKey) "Signing Key Stored — Upload New .pfx/.p12 to Replace"
                                                else "Upload NCHL CREDITOR.pfx / .p12 Certificate",
                                            fontSize = 11.sp,
                                            fontWeight = FontWeight.SemiBold
                                        )
                                    }
                                    if (connectipsPfxBase64.isNotBlank()) {
                                        OutlinedTextField(
                                            value = connectipsPfxPassword,
                                            onValueChange = { connectipsPfxPassword = it },
                                            label = { Text(".pfx Certificate Password") },
                                            placeholder = { Text("Password for uploaded .pfx file") },
                                            leadingIcon = { Icon(Icons.Default.Password, contentDescription = null) },
                                            visualTransformation = if (showSecretKey) VisualTransformation.None else PasswordVisualTransformation(),
                                            singleLine = true,
                                            modifier = Modifier.fillMaxWidth(),
                                            shape = RoundedCornerShape(12.dp)
                                        )
                                    }
                                    OutlinedTextField(
                                        value = connectipsPrivateKeyPem,
                                        onValueChange = { connectipsPrivateKeyPem = it },
                                        label = { Text("Or Paste RSA Private Key PEM (PKCS#8)") },
                                        placeholder = { Text("-----BEGIN PRIVATE KEY----- ...") },
                                        minLines = 2,
                                        maxLines = 4,
                                        modifier = Modifier.fillMaxWidth(),
                                        shape = RoundedCornerShape(12.dp)
                                    )
                                }
                            }

                            // Read-only Server Callback URL (Copyable for NCHL / Fonepay / Khalti Merchant Portal)
                            OutlinedTextField(
                                value = gatewayCallbackUrl,
                                onValueChange = {},
                                readOnly = true,
                                label = { Text("Server Return / Webhook URL (Copy for Merchant Portal)") },
                                leadingIcon = { Icon(Icons.Default.Link, contentDescription = null) },
                                trailingIcon = {
                                    IconButton(onClick = {
                                        val clipboard = context.getSystemService(android.content.Context.CLIPBOARD_SERVICE) as? android.content.ClipboardManager
                                        clipboard?.setPrimaryClip(android.content.ClipData.newPlainText("Callback URL", gatewayCallbackUrl))
                                        Toast.makeText(context, "Callback URL copied!", Toast.LENGTH_SHORT).show()
                                    }) {
                                        Icon(Icons.Default.ContentCopy, contentDescription = "Copy URL")
                                    }
                                },
                                singleLine = true,
                                modifier = Modifier.fillMaxWidth(),
                                shape = RoundedCornerShape(12.dp)
                            )

                            // Direct Save & Verify Gateway Credentials Button (Anti-Double-Click Guarded)
                            Button(
                                onClick = {
                                    if (isSavingGatewayOnly) return@Button
                                    isSavingGatewayOnly = true
                                    coroutineScope.launch {
                                        try {
                                            val targetId = loadedClinicId ?: effectiveClinicId
                                            val curr = paymentGatewaysConfig.getGateway(selectedGatewayProvider)
                                            val credentialSave = clinicRepository?.saveGatewayCredentials(
                                                clinicId = targetId,
                                                gatewayProvider = selectedGatewayProvider,
                                                environment = curr.environment,
                                                enabled = curr.enabled,
                                                isDirectPaymentEnabled = isDirectPaymentEnabled,
                                                merchantId = paymentMerchantId,
                                                apiKey = paymentApiKey,
                                                secretKey = paymentSecretKey,
                                                username = fonepayUsername,
                                                password = fonepayPassword,
                                                appId = connectipsAppId,
                                                appName = connectipsAppName,
                                                appPassword = connectipsAppPassword,
                                                privateKeyPem = connectipsPrivateKeyPem,
                                                pfxBase64 = connectipsPfxBase64,
                                                pfxPassword = connectipsPfxPassword
                                            )
                                            if (credentialSave?.isFailure == true) {
                                                throw credentialSave.exceptionOrNull() ?: Exception("Could not verify gateway credentials")
                                            }
                                            paymentSecretKey = ""
                                            fonepayPassword = ""
                                            connectipsAppPassword = ""
                                            connectipsPrivateKeyPem = ""
                                            connectipsPfxBase64 = ""
                                            connectipsPfxPassword = ""
                                            loadClinicData()
                                            Toast.makeText(
                                                context,
                                                credentialSave?.getOrNull() ?: "${selectedGatewayProvider.uppercase()} verified & saved!",
                                                Toast.LENGTH_LONG
                                            ).show()
                                        } catch (e: Exception) {
                                            Toast.makeText(context, "${e.message ?: "Error saving gateway keys"}", Toast.LENGTH_LONG).show()
                                        } finally {
                                            isSavingGatewayOnly = false
                                        }
                                    }
                                },
                                modifier = Modifier.fillMaxWidth().height(44.dp),
                                shape = RoundedCornerShape(10.dp),
                                colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.secondary),
                                enabled = !isSavingGatewayOnly
                            ) {
                                if (isSavingGatewayOnly) {
                                    CircularProgressIndicator(color = Color.White, modifier = Modifier.size(16.dp), strokeWidth = 2.dp)
                                    Spacer(Modifier.width(8.dp))
                                }
                                Icon(Icons.Default.VerifiedUser, contentDescription = null, modifier = Modifier.size(16.dp))
                                Spacer(Modifier.width(6.dp))
                                Text(
                                    if (isSavingGatewayOnly) "Verifying & Saving..." else "Verify & Save ${selectedGatewayProvider.uppercase()} Keys",
                                    fontSize = 12.sp,
                                    fontWeight = FontWeight.Bold
                                )
                            }
                        }
                    }
                }

                // Save All Settings Button
                Button(
                    onClick = {
                        val cleanPan = panNumber.trim()
                        if (cleanPan.isNotBlank() && (cleanPan.length != 9 || !cleanPan.all { it.isDigit() })) {
                            errorMessage = "PAN number must be exactly 9 digits."
                            return@Button
                        }
                        val cleanPhone = phoneDigits.trim()
                        if (cleanPhone.isNotBlank() && (cleanPhone.length != 10 || !cleanPhone.all { it.isDigit() })) {
                            errorMessage = "Clinic contact number must be exactly 10 digits (with +977 country code)."
                            return@Button
                        }
                        val cleanManager = managerPhoneDigits.trim()
                        if (cleanManager.isNotBlank() && (cleanManager.length != 10 || !cleanManager.all { it.isDigit() })) {
                            errorMessage = "Manager contact number must be exactly 10 digits (with +977 country code)."
                            return@Button
                        }

                        errorMessage = null
                        isSaving = true
                        coroutineScope.launch {
                            val targetId = loadedClinicId ?: effectiveClinicId.ifBlank { java.util.UUID.randomUUID().toString() }

                            // 1. Upload any newly selected local pictures (content:// URIs) to Supabase Storage with <= 500 KB compression
                            val uploadedPictures = mutableListOf<String>()
                            for ((idx, pic) in clinicPictures.withIndex()) {
                                if (pic.startsWith("content://") || pic.startsWith("file://")) {
                                    try {
                                        val uri = Uri.parse(pic)
                                        val compressed = com.dactor.clinic.domain.util.FileCompressor.compressUri(
                                            context = context,
                                            uri = uri,
                                            fallbackFileName = "clinic_${targetId}_${idx + 1}.jpg"
                                        )
                                        if (compressed != null) {
                                            val fileName = "clinic_${targetId}_${System.currentTimeMillis()}_${compressed.fileName}"
                                            val publicUrl = clinicRepository?.uploadClinicFile(fileName, compressed.bytes, "clinic_photos")
                                            if (!publicUrl.isNullOrBlank()) {
                                                uploadedPictures.add(publicUrl)
                                            } else {
                                                uploadedPictures.add(pic)
                                            }
                                        } else {
                                            uploadedPictures.add(pic)
                                        }
                                    } catch (e: Exception) {
                                        e.printStackTrace()
                                        uploadedPictures.add(pic)
                                    }
                                } else {
                                    uploadedPictures.add(pic)
                                }
                            }

                            // 2. Upload newly selected registration document if present with <= 500 KB compression
                            var finalRegDocUrl = existingRegDocUrl
                            if (regDocUri != null) {
                                try {
                                    val resolvedName = com.dactor.clinic.domain.util.FileCompressor.resolveRealFileName(
                                        context = context,
                                        uri = regDocUri!!,
                                        defaultBaseName = "registration_doc"
                                    )
                                    val compressedDoc = com.dactor.clinic.domain.util.FileCompressor.compressUri(
                                        context = context,
                                        uri = regDocUri!!,
                                        fallbackFileName = resolvedName
                                    )
                                    if (compressedDoc != null) {
                                        val cleanDocName = compressedDoc.fileName.replace("\\s+".toRegex(), "_")
                                        val fileName = "reg_${targetId}_${System.currentTimeMillis()}_$cleanDocName"
                                        val publicDocUrl = clinicRepository?.uploadClinicFile(fileName, compressedDoc.bytes, "clinic_photos")
                                        if (!publicDocUrl.isNullOrBlank()) {
                                            finalRegDocUrl = publicDocUrl
                                        }
                                    }
                                } catch (e: Exception) {
                                    e.printStackTrace()
                                }
                            }

                            val updated = Clinic(
                                id = targetId,
                                name = name.trim(),
                                type = selectedType,
                                verificationStatus = currentVerificationStatus ?: "pending",
                                contactPhone = if (cleanPhone.isNotBlank()) "+977$cleanPhone" else null,
                                managerPhone = if (cleanManager.isNotBlank()) "+977$cleanManager" else null,
                                panNumber = if (cleanPan.isNotBlank()) cleanPan else null,
                                contactEmail = email.trim(),
                                addressText = address.trim(),
                                latitude = latitude.toDoubleOrNull() ?: 27.7052,
                                longitude = longitude.toDoubleOrNull() ?: 85.3193,
                                autoNotifyThreshold = threshold.toIntOrNull() ?: 2,
                                description = description.trim().ifBlank { null },
                                registrationDocUrl = finalRegDocUrl,
                                pictures = uploadedPictures,
                                specialties = selectedSpecialties.toList(),
                                isArchived = isArchived,
                                archivedAt = archivedAt,
                                deletionScheduledAt = deletionScheduledAt,
                                paymentGatewayProvider = selectedGatewayProvider,
                                paymentApiKey = paymentApiKey.trim().ifBlank { null },
                                paymentSecretKey = null,
                                merchantId = paymentMerchantId.trim().ifBlank { null },
                                isDirectPaymentEnabled = isDirectPaymentEnabled,
                                paymentGatewaysJson = paymentGatewaysConfig.toJson(),
                                isActivated = isActivated,
                                activationExpiresAt = activationExpiresAt,
                                activationPlan = activationPlan,
                                activationPaidAmount = activationPaidAmount,
                                activationNotes = activationNotes,
                                activationPaymentProofUrl = activationPaymentProofUrl,
                                avgConsultationTimeMinutes = avgConsultationTimeMinutes.toIntOrNull() ?: 10,
                                manualAvgConsultationTimeMinutes = avgConsultationTimeMinutes.toIntOrNull() ?: 10
                            )

                            val res = clinicRepository?.updateClinic(targetId, updated)
                            if (res == true || res == null) {
                                clinicPictures = uploadedPictures
                                existingRegDocUrl = finalRegDocUrl
                                regDocUri = null
                                val savedMins = avgConsultationTimeMinutes.toIntOrNull() ?: 10
                                sessionManager.saveClinicSession(targetId, email.trim(), name.trim())
                                sessionManager.saveAverageConsultationTimeMinutes(targetId, savedMins)
                                sessionManager.saveManualAverageConsultationTimeMinutes(targetId, savedMins)
                                showSuccessMessage = true
                                Toast.makeText(context, "Clinic configuration & photos saved!", Toast.LENGTH_SHORT).show()
                            } else {
                                errorMessage = "Failed to update clinic configuration."
                            }
                            isSaving = false
                        }
                    },
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(52.dp),
                    shape = RoundedCornerShape(14.dp),
                    enabled = !isSaving
                ) {
                    if (isSaving) {
                        CircularProgressIndicator(color = MaterialTheme.colorScheme.onPrimary, modifier = Modifier.size(20.dp), strokeWidth = 2.dp)
                        Spacer(Modifier.width(8.dp))
                    }
                    Text(if (isSaving) "Saving Changes..." else "Save Clinic Settings", fontWeight = FontWeight.Bold)
                }

                Spacer(modifier = Modifier.height(4.dp))
                HorizontalDivider()
                Spacer(modifier = Modifier.height(4.dp))

                // Section 4: Legal & Regulatory Policies
                Card(
                    shape = RoundedCornerShape(14.dp),
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                    border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Column(
                        modifier = Modifier.padding(16.dp),
                        verticalArrangement = Arrangement.spacedBy(10.dp)
                    ) {
                        Text("Legal & Compliance", fontWeight = FontWeight.Bold, fontSize = 14.sp)

                        Surface(
                            shape = RoundedCornerShape(10.dp),
                            color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f),
                            onClick = { showTermsDialog = true },
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Row(
                                modifier = Modifier.padding(14.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.SpaceBetween
                            ) {
                                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                                    Icon(Icons.Default.Gavel, contentDescription = null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(20.dp))
                                    Text("Terms of Service & Regulatory Policy", fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
                                }
                                Icon(Icons.Default.ChevronRight, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                        }

                        Surface(
                            shape = RoundedCornerShape(10.dp),
                            color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f),
                            onClick = {
                                try {
                                    val intent = android.content.Intent(
                                        android.content.Intent.ACTION_VIEW,
                                        Uri.parse("https://dactorofficial.github.io/privacy-clinic.html")
                                    )
                                    context.startActivity(intent)
                                } catch (e: Exception) {
                                    android.widget.Toast.makeText(context, "Opening Clinic Privacy Policy...", android.widget.Toast.LENGTH_SHORT).show()
                                }
                            },
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Row(
                                modifier = Modifier.padding(14.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.SpaceBetween
                            ) {
                                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                                    Icon(Icons.Default.Security, contentDescription = null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(20.dp))
                                    Column {
                                        Text("Clinic Privacy Policy", fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
                                        Text("Official policy hosted on GitHub Pages", fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                    }
                                }
                                Icon(Icons.Default.OpenInBrowser, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.size(18.dp))
                            }
                        }
                    }
                }

                // Section: Contact Us & Official Support Helpdesk
                Card(
                    shape = RoundedCornerShape(14.dp),
                    colors = CardDefaults.cardColors(containerColor = Color(0xFFF0FDF4)),
                    border = BorderStroke(1.dp, Color(0xFFBBF7D0)),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Column(
                        modifier = Modifier.padding(16.dp),
                        verticalArrangement = Arrangement.spacedBy(10.dp)
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            Icon(Icons.Default.SupportAgent, contentDescription = null, tint = Color(0xFF16A34A), modifier = Modifier.size(20.dp))
                            Text("Contact Us & Dactor Helpdesk Support", fontWeight = FontWeight.Bold, fontSize = 14.sp, color = Color(0xFF14532D))
                        }

                        Text(
                            text = "Connect directly with our regulatory and support team for clinic verification, license subscriptions, or operational technical assistance.",
                            fontSize = 12.sp,
                            color = Color(0xFF166534),
                            lineHeight = 16.sp
                        )

                        OutlinedButton(
                            onClick = {
                                try {
                                    val intent = android.content.Intent(
                                        android.content.Intent.ACTION_VIEW,
                                        Uri.parse("https://dactorofficial.github.io/support")
                                    )
                                    context.startActivity(intent)
                                } catch (e: Exception) {
                                    android.widget.Toast.makeText(context, "Opening support site...", android.widget.Toast.LENGTH_SHORT).show()
                                }
                            },
                            shape = RoundedCornerShape(10.dp),
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Icon(Icons.Default.OpenInBrowser, contentDescription = null, modifier = Modifier.size(16.dp))
                            Spacer(Modifier.width(8.dp))
                            Text("Open Official Support Site", fontWeight = FontWeight.Bold, fontSize = 13.sp)
                        }
                    }
                }

                // Section 5: Account Danger Zone & 30-Day Archive Deletion
                Card(
                    shape = RoundedCornerShape(14.dp),
                    colors = CardDefaults.cardColors(containerColor = Color(0xFFFEF2F2)),
                    border = BorderStroke(1.dp, Color(0xFFFECACA)),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Column(
                        modifier = Modifier.padding(16.dp),
                        verticalArrangement = Arrangement.spacedBy(10.dp)
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            Icon(Icons.Default.WarningAmber, contentDescription = null, tint = Color(0xFFDC2626), modifier = Modifier.size(20.dp))
                            Text("Account Deletion & 30-Day Archive", fontWeight = FontWeight.Bold, fontSize = 14.sp, color = Color(0xFF991B1B))
                        }

                        Text(
                            text = "Deletes this clinic from mobile immediately and places it into 30 days archive. IMPORTANT: If the 30-day period expires without cancellation, all patient records and clinic data will be permanently wiped.",
                            fontSize = 12.sp,
                            color = Color(0xFF7F1D1D),
                            lineHeight = 16.sp
                        )

                        Button(
                            onClick = { showDeleteAccountDialog = true },
                            colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFDC2626)),
                            shape = RoundedCornerShape(12.dp),
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(46.dp)
                        ) {
                            Icon(Icons.Default.DeleteForever, contentDescription = null, modifier = Modifier.size(18.dp))
                            Spacer(Modifier.width(8.dp))
                            Text("Delete Clinic Account (30-Day Archive)", fontWeight = FontWeight.Bold, fontSize = 13.sp)
                        }
                    }
                }

                // Section 6: Session & Log Out
                Card(
                    shape = RoundedCornerShape(14.dp),
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                    border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Column(
                        modifier = Modifier.padding(16.dp),
                        verticalArrangement = Arrangement.spacedBy(10.dp)
                    ) {
                        Text("Account Session", fontWeight = FontWeight.Bold, fontSize = 14.sp)
                        Text(
                            "Signed in as clinic administrator. Logging out clears your active session on this device.",
                            fontSize = 12.sp,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )

                        OutlinedButton(
                            onClick = {
                                sessionManager.clearSession()
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
                            colors = ButtonDefaults.outlinedButtonColors(contentColor = MaterialTheme.colorScheme.error),
                            border = BorderStroke(1.dp, MaterialTheme.colorScheme.error.copy(alpha = 0.5f)),
                            shape = RoundedCornerShape(12.dp),
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(48.dp)
                        ) {
                            Icon(Icons.AutoMirrored.Filled.ExitToApp, contentDescription = null, modifier = Modifier.size(18.dp))
                            Spacer(Modifier.width(8.dp))
                            Text("Log Out from Clinic Account", fontWeight = FontWeight.Bold)
                        }
                    }
                }
            }
        }
    }

    // TERMS AND CONDITIONS DIALOG
    if (showTermsDialog) {
        ClinicTermsAndConditionsDialog(onDismiss = { showTermsDialog = false })
    }

    // DELETE CLINIC ACCOUNT CONFIRMATION DIALOG
    if (showDeleteAccountDialog) {
        AlertDialog(
            onDismissRequest = { if (!isDeletingAccount) showDeleteAccountDialog = false },
            icon = {
                Surface(
                    shape = CircleShape,
                    color = Color(0xFFFEE2E2),
                    modifier = Modifier.size(44.dp)
                ) {
                    Box(contentAlignment = Alignment.Center) {
                        Icon(Icons.Default.Warning, contentDescription = null, tint = Color(0xFFDC2626), modifier = Modifier.size(24.dp))
                    }
                }
            },
            title = {
                Text(
                    "Delete Clinic Account?",
                    fontWeight = FontWeight.Bold,
                    fontSize = 17.sp,
                    color = Color(0xFF991B1B)
                )
            },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Text(
                        "Your clinic account will be signed out from this device and put into a 30-day archive holding period.",
                        fontSize = 13.sp,
                        lineHeight = 17.sp
                    )
                    Surface(
                        shape = RoundedCornerShape(8.dp),
                        color = Color(0xFFFEF2F2),
                        border = BorderStroke(1.dp, Color(0xFFFECACA)),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Text(
                            text = "CRITICAL WARNING: If this deletion is not cancelled within 30 days, ALL patient details, consultations, diagnostic reports, and queue records will be permanently deleted.",
                            fontSize = 12.sp,
                            fontWeight = FontWeight.SemiBold,
                            color = Color(0xFFB91C1C),
                            modifier = Modifier.padding(10.dp),
                            lineHeight = 16.sp
                        )
                    }
                    Text(
                        "You can log back in at any time within 30 days to cancel this deletion.",
                        fontSize = 12.sp,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            },
            confirmButton = {
                Button(
                    onClick = { performScheduleDeletion() },
                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFDC2626)),
                    enabled = !isDeletingAccount
                ) {
                    if (isDeletingAccount) {
                        CircularProgressIndicator(color = Color.White, modifier = Modifier.size(16.dp), strokeWidth = 2.dp)
                        Spacer(Modifier.width(6.dp))
                    }
                    Text("Confirm 30-Day Deletion")
                }
            },
            dismissButton = {
                TextButton(
                    onClick = { showDeleteAccountDialog = false },
                    enabled = !isDeletingAccount
                ) {
                    Text("Cancel")
                }
            }
        )
    }

    // LOCATION PICKER DIALOG
    if (showLocationPicker) {
        val predefinedLocations = listOf(
            Triple("Kathmandu (Bagbazar / City Center)", 27.7052, 85.3193),
            Triple("Kathmandu (Thamel / Lazimpat)", 27.7172, 85.3120),
            Triple("Kathmandu (New Baneshwor)", 27.6915, 85.3420),
            Triple("Kathmandu (Maharajgunj / Teaching Hosp.)", 27.7360, 85.3305),
            Triple("Lalitpur (Lagankhel / Patan Hospital)", 27.6685, 85.3214),
            Triple("Lalitpur (Pulchowk / Jawalakhel)", 27.6766, 85.3168),
            Triple("Bhaktapur (Suryabinayak)", 27.6710, 85.4298),
            Triple("Pokhara (New Road / Lakeside)", 28.2096, 83.9856),
            Triple("Chitwan (Bharatpur Medical City)", 27.6833, 84.4333),
            Triple("Biratnagar (Main Road / Koshi)", 26.4525, 87.2718),
            Triple("Butwal (Traffic Chowk)", 27.7006, 83.4484),
            Triple("Dharan (BPKIHS Area)", 26.8124, 87.2834),
            Triple("Nepalgunj (Birendra Chowk)", 28.0500, 81.6167)
        )
        var tempAddress by remember { mutableStateOf(address.ifBlank { "Kathmandu, Nepal" }) }
        var tempLat by remember { mutableStateOf(latitude) }
        var tempLng by remember { mutableStateOf(longitude) }

        com.dactor.clinic.ui.components.OpenStreetMapPicker(
            initialAddress = address,
            initialLat = latitude.toDoubleOrNull() ?: 27.7052,
            initialLng = longitude.toDoubleOrNull() ?: 85.3193,
            onSaveLocation = { newAddress, newLat, newLng ->
                address = newAddress
                latitude = newLat.toString()
                longitude = newLng.toString()
                showLocationPicker = false
            },
            onDismiss = {
                showLocationPicker = false
            }
        )
    }

    // PLATFORM LICENSE & SUBSCRIPTION PAYMENT DIALOG (WITH TEST BYPASS)
    if (showSubscriptionPayDialog) {
        val planAmount = if (selectedAdminPlan == "12_month") 15000.0 else 1500.0
        val daysToAdd = if (selectedAdminPlan == "12_month") 365 else 30
        val targetId = loadedClinicId ?: effectiveClinicId

        AlertDialog(
            onDismissRequest = {
                if (!isProcessingSubscriptionPayment) showSubscriptionPayDialog = false
            },
            icon = {
                Surface(
                    shape = CircleShape,
                    color = MaterialTheme.colorScheme.primaryContainer,
                    modifier = Modifier.size(48.dp)
                ) {
                    Box(contentAlignment = Alignment.Center) {
                        Icon(Icons.Default.Payment, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
                    }
                }
            },
            title = {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text("Renew Platform License", fontWeight = FontWeight.Bold, fontSize = 17.sp)
                    Text("Pay administration to keep clinic active", fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            },
            text = {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .verticalScroll(rememberScrollState()),
                    verticalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    if (isLoadingPlatformGateways) {
                        Box(modifier = Modifier.fillMaxWidth().height(100.dp), contentAlignment = Alignment.Center) {
                            CircularProgressIndicator()
                        }
                    } else {
                        // 1. Select Plan
                        Text("1. Select Subscription Plan:", fontWeight = FontWeight.SemiBold, fontSize = 12.sp)
                        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            FilterChip(
                                selected = selectedAdminPlan == "1_month",
                                onClick = { selectedAdminPlan = "1_month" },
                                label = { Text("1 Month (NPR 1,500)", fontSize = 11.sp) },
                                modifier = Modifier.weight(1f)
                            )
                            FilterChip(
                                selected = selectedAdminPlan == "12_month",
                                onClick = { selectedAdminPlan = "12_month" },
                                label = { Text("12 Months (NPR 15,000)", fontSize = 11.sp) },
                                modifier = Modifier.weight(1f)
                            )
                        }

                        // 2. Select Payment Method
                        Text("2. Pay via Admin Gateway:", fontWeight = FontWeight.SemiBold, fontSize = 12.sp)
                        val adminGateways = listOf(
                            "esewa" to "eSewa",
                            "khalti" to "Khalti",
                            "fonepay" to "Fonepay QR",
                            "connectips" to "ConnectIPS"
                        )
                        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                            adminGateways.forEach { (gId, gName) ->
                                FilterChip(
                                    selected = selectedAdminGateway == gId,
                                    onClick = { selectedAdminGateway = gId },
                                    label = { Text(gName, fontSize = 10.sp) }
                                )
                            }
                        }

                        // Admin Gateway Real Credentials Card
                        val adminGw = platformGatewaysConfig?.getGateway(selectedAdminGateway)
                            ?: com.dactor.clinic.data.model.GatewayCredentialItem()

                        Surface(
                            shape = RoundedCornerShape(10.dp),
                            color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.6f),
                            border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                    Text("Gateway:", fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                    Text(selectedAdminGateway.uppercase(), fontSize = 11.sp, fontWeight = FontWeight.Bold)
                                }
                                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                    Text("Payable Amount:", fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                    Text("NPR ${planAmount.toInt()}", fontSize = 12.sp, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.primary)
                                }
                                if (adminGw.merchantId.isNotBlank()) {
                                    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                        Text("Admin Merchant ID:", fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                        Text(adminGw.merchantId, fontSize = 11.sp, fontWeight = FontWeight.Medium)
                                    }
                                }
                                if (adminGw.accountNumber.isNotBlank()) {
                                    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                        Text("Admin Wallet / Account:", fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                        Text(adminGw.accountNumber, fontSize = 11.sp, fontWeight = FontWeight.Medium)
                                    }
                                }
                                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                    Text("Environment:", fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                    Text(
                                        if (adminGw.environment.lowercase() == "live") "LIVE PRODUCTION" else "SANDBOX / TEST",
                                        fontSize = 10.sp,
                                        fontWeight = FontWeight.Bold,
                                        color = if (adminGw.environment.lowercase() == "live") Color(0xFF059669) else Color(0xFFD97706)
                                    )
                                }
                            }
                        }

                        // 3. Transaction ID input
                        OutlinedTextField(
                            value = adminPaymentTxId,
                            onValueChange = { adminPaymentTxId = it },
                            label = { Text("Transaction / Reference ID") },
                            placeholder = { Text("e.g. TXN987654321") },
                            singleLine = true,
                            modifier = Modifier.fillMaxWidth(),
                            shape = RoundedCornerShape(10.dp)
                        )

                        // 4. Test Bypass Button
                        Surface(
                            shape = RoundedCornerShape(8.dp),
                            color = Color(0xFFFFFBEB),
                            border = BorderStroke(1.dp, Color(0xFFFDE68A)),
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Column(modifier = Modifier.padding(10.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                                Text(
                                    "Testing & Development Mode:",
                                    fontSize = 11.sp,
                                    fontWeight = FontWeight.Bold,
                                    color = Color(0xFFB45309)
                                )
                                Text(
                                    "Use bypass to instantly confirm payment without real transaction and activate subscription.",
                                    fontSize = 10.sp,
                                    color = Color(0xFF92400E),
                                    lineHeight = 14.sp
                                )
                                Button(
                                    onClick = {
                                        if (isProcessingSubscriptionPayment) return@Button
                                        isProcessingSubscriptionPayment = true
                                        coroutineScope.launch {
                                            try {
                                                val testTxId = "BYPASS-TEST-${System.currentTimeMillis()}"
                                                val res = clinicRepository?.completeClinicSubscriptionPayment(
                                                    clinicId = targetId,
                                                    daysToAdd = daysToAdd,
                                                    planName = selectedAdminPlan,
                                                    paidAmount = planAmount,
                                                    transactionId = testTxId,
                                                    gateway = "${selectedAdminGateway}_bypass"
                                                )
                                                if (res != null && res.isSuccess) {
                                                    Toast.makeText(context, "Subscription extended by $daysToAdd days (Bypass Testing)!", Toast.LENGTH_LONG).show()
                                                    showSubscriptionPayDialog = false
                                                    loadClinicData()
                                                } else {
                                                    Toast.makeText(context, "Bypass failed: ${res?.exceptionOrNull()?.message}", Toast.LENGTH_LONG).show()
                                                }
                                            } catch (e: Exception) {
                                                Toast.makeText(context, "Error: ${e.message}", Toast.LENGTH_LONG).show()
                                            } finally {
                                                isProcessingSubscriptionPayment = false
                                            }
                                        }
                                    },
                                    modifier = Modifier.fillMaxWidth().height(38.dp),
                                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFD97706)),
                                    shape = RoundedCornerShape(8.dp),
                                    enabled = !isProcessingSubscriptionPayment
                                ) {
                                    Icon(Icons.Default.Bolt, contentDescription = null, modifier = Modifier.size(16.dp))
                                    Spacer(Modifier.width(6.dp))
                                    Text("Bypass Payment for Testing", fontSize = 11.sp, fontWeight = FontWeight.Bold)
                                }
                            }
                        }
                    }
                }
            },
            confirmButton = {
                Button(
                    onClick = {
                        if (isProcessingSubscriptionPayment) return@Button
                        if (adminPaymentTxId.isBlank()) {
                            Toast.makeText(context, "Please enter your payment Transaction ID", Toast.LENGTH_SHORT).show()
                            return@Button
                        }
                        isProcessingSubscriptionPayment = true
                        coroutineScope.launch {
                            try {
                                val res = clinicRepository?.completeClinicSubscriptionPayment(
                                    clinicId = targetId,
                                    daysToAdd = daysToAdd,
                                    planName = selectedAdminPlan,
                                    paidAmount = planAmount,
                                    transactionId = adminPaymentTxId.trim(),
                                    gateway = selectedAdminGateway
                                )
                                if (res != null && res.isSuccess) {
                                    Toast.makeText(context, "License payment recorded! Active for $daysToAdd days.", Toast.LENGTH_LONG).show()
                                    showSubscriptionPayDialog = false
                                    adminPaymentTxId = ""
                                    loadClinicData()
                                } else {
                                    Toast.makeText(context, "Payment failed: ${res?.exceptionOrNull()?.message}", Toast.LENGTH_LONG).show()
                                }
                            } catch (e: Exception) {
                                Toast.makeText(context, "Error: ${e.message}", Toast.LENGTH_LONG).show()
                            } finally {
                                isProcessingSubscriptionPayment = false
                            }
                        }
                    },
                    enabled = !isProcessingSubscriptionPayment && !isLoadingPlatformGateways,
                    shape = RoundedCornerShape(8.dp)
                ) {
                    if (isProcessingSubscriptionPayment) {
                        CircularProgressIndicator(color = Color.White, modifier = Modifier.size(14.dp), strokeWidth = 2.dp)
                        Spacer(Modifier.width(6.dp))
                    }
                    Text("Confirm & Submit Payment", fontSize = 12.sp)
                }
            },
            dismissButton = {
                TextButton(
                    onClick = { showSubscriptionPayDialog = false },
                    enabled = !isProcessingSubscriptionPayment
                ) {
                    Text("Cancel")
                }
            }
        )
    }
}
