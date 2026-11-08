package com.dactor.clinic.ui.auth

import android.app.Activity
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.ui.res.painterResource
import com.dactor.clinic.R
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.horizontalScroll
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.positionInRoot
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
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.navigation.NavController
import com.dactor.clinic.data.local.RegistrationDraftManager
import com.dactor.clinic.data.local.UserSessionManager
import com.dactor.clinic.data.model.Clinic
import com.dactor.clinic.data.model.Doctor
import com.dactor.clinic.data.repository.AuthRepository
import com.dactor.clinic.data.repository.ClinicRepository
import com.dactor.clinic.data.repository.DoctorRepository
import com.dactor.clinic.ui.navigation.NavRoutes
import com.google.android.gms.auth.api.signin.GoogleSignIn
import com.google.android.gms.auth.api.signin.GoogleSignInAccount
import com.google.android.gms.auth.api.signin.GoogleSignInOptions
import com.google.android.gms.common.api.ApiException
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.auth.GoogleAuthProvider
import android.accounts.AccountManager
import com.google.android.gms.common.AccountPicker
import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.location.Geocoder
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.os.Build
import android.os.Bundle
import android.os.Looper
import android.content.Intent
import android.provider.MediaStore
import androidx.activity.result.contract.ActivityResultContract
import androidx.core.content.ContextCompat
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.withContext
import java.util.Locale
import java.util.UUID

/**
 * ActivityResultContract that allows picking multiple images with a dynamic upper limit (1 to 4).
 * On modern Android systems (Android 11+ with PhotoPicker or Android 13+), MediaStore.ACTION_PICK_IMAGES
 * is used with MediaStore.EXTRA_PICK_IMAGES_MAX set to the remaining allowed count.
 * If only 1 image slot remains, EXTRA_PICK_IMAGES_MAX is omitted so the system picker acts as single-select.
 * On legacy systems without PhotoPicker, Intent.ACTION_GET_CONTENT is used as a fallback.
 */
class PickMultipleClinicImagesContract : ActivityResultContract<Int, List<Uri>>() {
    override fun getSynchronousResult(context: Context, input: Int): SynchronousResult<List<Uri>>? {
        if (input <= 0) {
            return SynchronousResult(emptyList())
        }
        return null
    }

    override fun createIntent(context: Context, input: Int): Intent {
        val maxItems = input.coerceIn(1, 4)
        val isPhotoPickerAvailable = try {
            ActivityResultContracts.PickVisualMedia.isPhotoPickerAvailable(context) &&
                Intent(MediaStore.ACTION_PICK_IMAGES).apply { type = "image/*" }.resolveActivity(context.packageManager) != null
        } catch (_: Exception) {
            false
        }

        return if (isPhotoPickerAvailable) {
            val intent = Intent(MediaStore.ACTION_PICK_IMAGES).apply {
                type = "image/*"
            }
            if (maxItems > 1) {
                intent.putExtra(MediaStore.EXTRA_PICK_IMAGES_MAX, maxItems)
            }
            intent
        } else {
            val intent = Intent(Intent.ACTION_GET_CONTENT).apply {
                type = "image/*"
                addCategory(Intent.CATEGORY_OPENABLE)
            }
            if (maxItems > 1) {
                intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true)
            }
            if (intent.resolveActivity(context.packageManager) == null) {
                intent.removeCategory(Intent.CATEGORY_OPENABLE)
            }
            intent
        }
    }

    override fun parseResult(resultCode: Int, intent: Intent?): List<Uri> {
        if (resultCode != Activity.RESULT_OK || intent == null) return emptyList()
        val uris = LinkedHashSet<Uri>()
        intent.data?.let { uris.add(it) }
        val clipData = intent.clipData
        if (clipData != null) {
            for (i in 0 until clipData.itemCount) {
                val itemUri = clipData.getItemAt(i).uri
                if (itemUri != null) {
                    uris.add(itemUri)
                }
            }
        }
        return uris.toList()
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ClinicLoginScreen(
    navController: NavController,
    authRepository: AuthRepository? = null,
    doctorRepository: DoctorRepository? = null,
    clinicRepository: ClinicRepository? = null,
    draftManager: RegistrationDraftManager? = null,
    sessionManager: UserSessionManager? = null,
    initialTab: Int = 0
) {
    val context = LocalContext.current
    val coroutineScope = rememberCoroutineScope()
    val scrollState = rememberScrollState()

    var selectedTab by remember { mutableIntStateOf(initialTab) } // 0: Clinic, 1: Doctor
    var currentView by remember { mutableStateOf("auth_choice") } // "auth_choice" or "register_form"
    var authActionIntent by remember { mutableStateOf("login") } // "login" or "register"

    var isLoading by remember { mutableStateOf(false) }
    var statusMessage by remember { mutableStateOf<String?>(null) }
    var errorMessage by remember { mutableStateOf<String?>(null) }
    var emailInput by remember { mutableStateOf("") }

    // Google Account Details
    var googleAccount by remember { mutableStateOf<GoogleSignInAccount?>(null) }
    var verifiedEmail by remember { mutableStateOf("") }
    var verifiedDisplayName by remember { mutableStateOf("") }

    // Clinic Registration Form Fields
    var clinicName by remember { mutableStateOf("") }
    var clinicAddress by remember { mutableStateOf("") }
    var clinicLat by remember { mutableDoubleStateOf(27.7052) }
    var clinicLng by remember { mutableDoubleStateOf(85.3193) }
    var showLocationPicker by remember { mutableStateOf(false) }
    var clinicPan by remember { mutableStateOf("") } // 9 digit validation
    var clinicPhoneDigits by remember { mutableStateOf("") } // 10 digit phone (+977)
    var managerPhoneDigits by remember { mutableStateOf("") } // 10 digit phone (+977)
    var clinicRegDocUri by remember { mutableStateOf<Uri?>(null) }
    var clinicRegDocName by remember { mutableStateOf<String?>(null) }
    var clinicPictures by remember { mutableStateOf<List<Uri>>(emptyList()) }
    var clinicType by remember { mutableStateOf("single_visit") }
    var clinicSpecialties by remember { mutableStateOf<Set<String>>(emptySet()) }
    var availableSpecialtiesList by remember { mutableStateOf<List<com.dactor.clinic.data.model.MedicalSpecialty>>(emptyList()) }
    var availableQualificationsList by remember { mutableStateOf<List<com.dactor.clinic.data.model.MedicalQualification>>(emptyList()) }
    var clinicDesc by remember { mutableStateOf("") }

    // Doctor Registration Form Fields (never prefill name, gender, or age from Google account or demo defaults)
    var doctorPractitionerRole by remember { mutableStateOf("doctor") } // "doctor" or "lab_technician"
    var doctorSpecialtyDropdownExpanded by remember { mutableStateOf(false) }
    var educationDropdownExpanded by remember { mutableStateOf(false) }
    var doctorStartingYearDropdownExpanded by remember { mutableStateOf(false) }
    val practicingYears = remember { (2026 downTo 1960).map { it.toString() } }
    var doctorName by remember { mutableStateOf("") }
    var doctorGender by remember { mutableStateOf("") }
    var doctorAge by remember { mutableStateOf("") }
    var doctorStartingYear by remember { mutableStateOf("") }
    var doctorPictureUri by remember { mutableStateOf<Uri?>(null) }
    var doctorPictureName by remember { mutableStateOf<String?>(null) }
    var doctorSpecialty by remember { mutableStateOf("") }
    var doctorEducation by remember { mutableStateOf("") }
    var doctorNmc by remember { mutableStateOf("") }
    var doctorPersonalPhone by remember { mutableStateOf("") }
    var doctorPublicPhone by remember { mutableStateOf("") }
    var doctorDesc by remember { mutableStateOf("") }

    // Validation & Focus Requesters
    var clinicValidationTriggered by remember { mutableStateOf(false) }
    var doctorValidationTriggered by remember { mutableStateOf(false) }

    val clinicNameFocus = remember { FocusRequester() }
    val clinicPanFocus = remember { FocusRequester() }
    val clinicPhoneFocus = remember { FocusRequester() }
    val managerPhoneFocus = remember { FocusRequester() }

    val doctorNameFocus = remember { FocusRequester() }
    val doctorAgeFocus = remember { FocusRequester() }
    val doctorNmcFocus = remember { FocusRequester() }
    val doctorPhoneFocus = remember { FocusRequester() }

    // Field Y Offsets for Auto-Scroll Redirection
    var clinicNameFieldY by remember { mutableIntStateOf(0) }
    var clinicAddressFieldY by remember { mutableIntStateOf(0) }
    var clinicRegDocFieldY by remember { mutableIntStateOf(0) }
    var clinicPanFieldY by remember { mutableIntStateOf(0) }
    var clinicPhoneFieldY by remember { mutableIntStateOf(0) }
    var managerPhoneFieldY by remember { mutableIntStateOf(0) }
    var clinicPicturesFieldY by remember { mutableIntStateOf(0) }
    var clinicTermsFieldY by remember { mutableIntStateOf(0) }

    var doctorNameFieldY by remember { mutableIntStateOf(0) }
    var doctorGenderFieldY by remember { mutableIntStateOf(0) }
    var doctorAgeFieldY by remember { mutableIntStateOf(0) }
    var doctorStartingYearFieldY by remember { mutableIntStateOf(0) }
    var doctorSpecialtyFieldY by remember { mutableIntStateOf(0) }
    var doctorEducationFieldY by remember { mutableIntStateOf(0) }
    var doctorNmcFieldY by remember { mutableIntStateOf(0) }
    var doctorPhoneFieldY by remember { mutableIntStateOf(0) }
    var doctorTermsFieldY by remember { mutableIntStateOf(0) }

    // Terms & Conditions States
    var showTermsDialog by remember { mutableStateOf(false) }
    var termsDialogInitialTab by remember { mutableIntStateOf(0) }
    var clinicTermsAccepted by remember { mutableStateOf(false) }
    var doctorTermsAccepted by remember { mutableStateOf(false) }

    // Live Validation Criteria - Clinic Form
    val cleanClinicPanDigits = clinicPan.filter { it.isDigit() }
    val cleanClinicPhoneDigits = clinicPhoneDigits.filter { it.isDigit() }
    val cleanManagerPhoneDigits = managerPhoneDigits.filter { it.isDigit() }

    val isClinicNameError = (clinicValidationTriggered || clinicName.isNotEmpty()) && clinicName.trim().length < 2
    val isClinicAddressError = clinicValidationTriggered && clinicAddress.isBlank()
    val isClinicRegDocError = clinicValidationTriggered && clinicRegDocUri == null
    val isClinicPanError = (clinicValidationTriggered || clinicPan.isNotEmpty()) && cleanClinicPanDigits.length != 9
    val isClinicPhoneError = (clinicValidationTriggered || clinicPhoneDigits.isNotEmpty()) && (cleanClinicPhoneDigits.length != 10 || !cleanClinicPhoneDigits.startsWith("9"))
    val isManagerPhoneError = (clinicValidationTriggered || managerPhoneDigits.isNotEmpty()) && (cleanManagerPhoneDigits.length != 10 || !cleanManagerPhoneDigits.startsWith("9"))
    val isClinicPicturesError = clinicValidationTriggered && clinicPictures.isEmpty()
    val isClinicTermsError = clinicValidationTriggered && !clinicTermsAccepted

    // Live Validation Criteria - Doctor Form
    val parsedDocAge = doctorAge.trim().toIntOrNull()
    val parsedDocYear = doctorStartingYear.trim().toIntOrNull()
    val cleanDocPhoneDigits = doctorPersonalPhone.filter { it.isDigit() }

    val isDoctorNameError = (doctorValidationTriggered || doctorName.isNotEmpty()) && doctorName.trim().length < 3
    val isDoctorGenderError = doctorValidationTriggered && doctorGender.isBlank()
    val isDoctorAgeError = (doctorValidationTriggered || doctorAge.isNotEmpty()) && (parsedDocAge == null || parsedDocAge !in 20..100)
    val isDoctorStartingYearError = doctorValidationTriggered && (parsedDocYear == null || parsedDocYear !in 1960..2026)
    val isDoctorSpecialtyError = doctorValidationTriggered && doctorSpecialty.isBlank()
    val isDoctorEducationError = doctorValidationTriggered && doctorEducation.isBlank()
    val isDoctorNmcError = (doctorValidationTriggered || doctorNmc.isNotEmpty()) && doctorNmc.trim().length < 3
    val isDoctorPhoneError = (doctorValidationTriggered || doctorPersonalPhone.isNotEmpty()) && (cleanDocPhoneDigits.length != 10 || !cleanDocPhoneDigits.startsWith("9"))
    val isDoctorTermsError = doctorValidationTriggered && !doctorTermsAccepted

    // Pending Admin Verification State
    var pendingEntityName by remember { mutableStateOf("") }
    var pendingEmail by remember { mutableStateOf("") }
    var pendingRole by remember { mutableStateOf("clinic") } // "clinic" or "doctor"
    var pendingStatus by remember { mutableStateOf("pending") } // "pending" or "rejected"
    var pendingDetails by remember { mutableStateOf("") }
    var pendingId by remember { mutableStateOf("") }

    var isUnregisteredAccountNotice by remember { mutableStateOf(false) }

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

    LaunchedEffect(Unit) {
        // Load master medical specialties and qualifications
        coroutineScope.launch {
            try {
                val specs = clinicRepository?.getSpecialties() ?: emptyList()
                if (specs.isNotEmpty()) availableSpecialtiesList = specs
                val quals = doctorRepository?.getQualifications() ?: emptyList()
                if (quals.isNotEmpty()) availableQualificationsList = quals
            } catch (e: Exception) {
                e.printStackTrace()
            }
        }

        // Clear active login session so returning from launcher home never resumes a stale account
        sessionManager?.clearActiveLoginSession()
        try {
            googleSignInClient.signOut()
        } catch (ignored: Exception) {}

        // Check if there was a pending registration waiting for review
        val pending = sessionManager?.getPendingVerification()
        if (pending != null) {
            coroutineScope.launch {
                try {
                    if (pending.role == "clinic") {
                        val clinic = clinicRepository?.getClinicByEmail(pending.email)
                        if (clinic != null) {
                            if (clinic.verificationStatus.equals("approved", ignoreCase = true)) {
                                sessionManager.clearPendingVerification()
                                clinicRepository?.clearCache()
                                doctorRepository?.clearCache()
                                sessionManager.saveClinicSession(clinic.id, clinic.contactEmail ?: pending.email, clinic.name)
                                navController.navigate("${NavRoutes.Dashboard}/${clinic.id}") {
                                    popUpTo(NavRoutes.ClinicLogin) { inclusive = true }
                                }
                            } else {
                                pendingEntityName = clinic.name
                                pendingEmail = clinic.contactEmail ?: pending.email
                                pendingRole = "clinic"
                                pendingStatus = clinic.verificationStatus ?: "pending"
                                pendingDetails = "${(clinic.type ?: "clinic").replace('_', ' ').replaceFirstChar { it.uppercase() }} • ${clinic.addressText ?: "Nepal"}"
                                pendingId = clinic.id
                                currentView = "pending_verification"
                            }
                        }
                    } else {
                        val doc = doctorRepository?.getDoctorByEmail(pending.email)
                        if (doc != null) {
                            if (doc.kycStatus.equals("approved", ignoreCase = true) || doc.kycStatus.equals("verified", ignoreCase = true)) {
                                sessionManager.clearPendingVerification()
                                clinicRepository?.clearCache()
                                doctorRepository?.clearCache()
                                sessionManager.saveDoctorSession(doc.id, doc.email, doc.fullName)
                                navController.navigate("${NavRoutes.DoctorDashboard}/${doc.id}") {
                                    popUpTo(NavRoutes.ClinicLogin) { inclusive = true }
                                }
                            } else {
                                pendingEntityName = doc.fullName
                                pendingEmail = doc.email
                                pendingRole = "doctor"
                                pendingStatus = doc.kycStatus ?: "pending"
                                pendingDetails = "NMC: ${doc.nmcLicenseNumber ?: "N/A"} • ${doc.specialty ?: "General"}"
                                pendingId = doc.id
                                currentView = "pending_verification"
                            }
                        }
                    }
                } catch (e: Exception) {
                    e.printStackTrace()
                }
            }
        }
    }

    fun processLoginForEmail(email: String, displayName: String = "", accountId: String? = null) {
        val trimmedEmail = email.trim().lowercase()
        if (trimmedEmail.isBlank()) {
            isLoading = false
            statusMessage = null
            return
        }
        isLoading = true
        errorMessage = null
        statusMessage = "Checking account portal association..."
        verifiedEmail = trimmedEmail
        verifiedDisplayName = ""

        coroutineScope.launch {
            try {
                val existingClinic = try {
                    clinicRepository?.getClinicByEmail(trimmedEmail)
                } catch (e: Exception) {
                    null
                }
                val existingDoctor = try {
                    doctorRepository?.getDoctorByEmail(trimmedEmail)
                } catch (e: Exception) {
                    null
                }
                val existingProfile = try {
                    authRepository?.getProfileByEmail(trimmedEmail)
                } catch (e: Exception) {
                    null
                }

                if (selectedTab == 0) {
                    // CLINIC STAFF PORTAL
                    // 0a. Block if Google account is already associated with Doctor / Specialist Portal
                    if (existingDoctor != null || (existingClinic == null && existingProfile?.role?.lowercase() in listOf("doctor", "lab_technician"))) {
                        runCatching { googleSignInClient.signOut() }
                        runCatching { FirebaseAuth.getInstance().signOut() }
                        verifiedEmail = ""
                        verifiedDisplayName = ""
                        googleAccount = null
                        isLoading = false
                        statusMessage = null
                        currentView = "auth_choice"
                        val docName = existingDoctor?.fullName?.takeIf { it.isNotBlank() }
                            ?: existingProfile?.fullName?.takeIf { it.isNotBlank() }
                        val suffix = if (docName != null) " ($docName)" else ""
                        errorMessage = "This Google account ($trimmedEmail) is already associated with a Doctor / Specialist Portal account$suffix. You cannot log in to the Clinic Portal with this Google ID. Please change your Google account."
                        return@launch
                    }

                    // 0b. Block if Google account is already associated with Patient Portal
                    if (existingClinic == null && existingProfile != null &&
                        existingProfile.role.equals("patient", ignoreCase = true) &&
                        (!existingProfile.fullName.isNullOrBlank() || !existingProfile.phone.isNullOrBlank())
                    ) {
                        runCatching { googleSignInClient.signOut() }
                        runCatching { FirebaseAuth.getInstance().signOut() }
                        verifiedEmail = ""
                        verifiedDisplayName = ""
                        googleAccount = null
                        isLoading = false
                        statusMessage = null
                        currentView = "auth_choice"
                        val patName = existingProfile.fullName?.takeIf { it.isNotBlank() }
                        val suffix = if (patName != null) " ($patName)" else ""
                        errorMessage = "This Google account ($trimmedEmail) is already associated with a Patient Portal account$suffix. You cannot log in to the Clinic Portal with this Google ID. Please change your Google account."
                        return@launch
                    }

                    if (existingClinic != null) {
                        val clinicId = existingClinic.id
                        if (existingClinic.isArchived == true) {
                            sessionManager?.setClinicArchivedStatus(true, existingClinic.deletionScheduledAt)
                        } else {
                            sessionManager?.setClinicArchivedStatus(false, null)
                        }

                        if (existingClinic.verificationStatus.equals("approved", ignoreCase = true)) {
                            sessionManager?.clearPendingVerification()
                            clinicRepository?.clearCache()
                            doctorRepository?.clearCache()
                            sessionManager?.saveClinicSession(clinicId, existingClinic.contactEmail ?: trimmedEmail, existingClinic.name)
                            try {
                                authRepository?.syncProfile(accountId ?: clinicId, trimmedEmail, existingClinic.name, "clinic_admin")
                            } catch (ignored: Exception) {}

                            isLoading = false
                            statusMessage = null
                            navController.navigate("${NavRoutes.Dashboard}/$clinicId") {
                                popUpTo(NavRoutes.ClinicLogin) { inclusive = true }
                            }
                        } else {
                            // Pending admin review
                            pendingEntityName = existingClinic.name
                            pendingEmail = existingClinic.contactEmail ?: trimmedEmail
                            pendingRole = "clinic"
                            pendingStatus = existingClinic.verificationStatus ?: "pending"
                            pendingDetails = "${(existingClinic.type ?: "clinic").replace('_', ' ').replaceFirstChar { it.uppercase() }} • ${existingClinic.addressText ?: "Nepal"}"
                            pendingId = existingClinic.id
                            sessionManager?.savePendingVerification(
                                email = pendingEmail,
                                role = "clinic",
                                name = existingClinic.name,
                                id = existingClinic.id,
                                details = pendingDetails,
                                status = pendingStatus
                            )
                            isLoading = false
                            statusMessage = null
                            currentView = "pending_verification"
                        }
                    } else {
                        // First-time clinic registration: Do NOT prefill clinicName from Google account
                        clinicName = ""
                        isUnregisteredAccountNotice = false
                        isLoading = false
                        statusMessage = null
                        currentView = "register_form"
                    }
                } else {
                    // DOCTOR / SPECIALIST PORTAL
                    // 0a. Block if Google account is already associated with Clinic Portal
                    if (existingClinic != null || (existingDoctor == null && existingProfile?.role?.lowercase() in listOf("clinic_admin", "clinic"))) {
                        runCatching { googleSignInClient.signOut() }
                        runCatching { FirebaseAuth.getInstance().signOut() }
                        verifiedEmail = ""
                        verifiedDisplayName = ""
                        googleAccount = null
                        isLoading = false
                        statusMessage = null
                        currentView = "auth_choice"
                        val cName = existingClinic?.name?.takeIf { it.isNotBlank() }
                            ?: existingProfile?.fullName?.takeIf { it.isNotBlank() }
                        val suffix = if (cName != null) " ($cName)" else ""
                        errorMessage = "This Google account ($trimmedEmail) is already associated with a Clinic Portal account$suffix. You cannot log in to the Doctor / Specialist Portal with this Google ID. Please change your Google account."
                        return@launch
                    }

                    // 0b. Block if Google account is already associated with Patient Portal
                    if (existingDoctor == null && existingProfile != null &&
                        existingProfile.role.equals("patient", ignoreCase = true) &&
                        (!existingProfile.fullName.isNullOrBlank() || !existingProfile.phone.isNullOrBlank())
                    ) {
                        runCatching { googleSignInClient.signOut() }
                        runCatching { FirebaseAuth.getInstance().signOut() }
                        verifiedEmail = ""
                        verifiedDisplayName = ""
                        googleAccount = null
                        isLoading = false
                        statusMessage = null
                        currentView = "auth_choice"
                        val patName = existingProfile.fullName?.takeIf { it.isNotBlank() }
                        val suffix = if (patName != null) " ($patName)" else ""
                        errorMessage = "This Google account ($trimmedEmail) is already associated with a Patient Portal account$suffix. You cannot log in to the Doctor / Specialist Portal with this Google ID. Please change your Google account."
                        return@launch
                    }

                    if (existingDoctor != null) {
                        val doctorId = existingDoctor.id
                        if (existingDoctor.kycStatus.equals("approved", ignoreCase = true) ||
                            existingDoctor.kycStatus.equals("verified", ignoreCase = true)
                        ) {
                            sessionManager?.clearPendingVerification()
                            clinicRepository?.clearCache()
                            doctorRepository?.clearCache()
                            sessionManager?.saveDoctorSession(doctorId, existingDoctor.email, existingDoctor.fullName)
                            try {
                                authRepository?.syncProfile(accountId ?: doctorId, trimmedEmail, existingDoctor.fullName, "doctor")
                            } catch (ignored: Exception) {}

                            isLoading = false
                            statusMessage = null
                            navController.navigate("${NavRoutes.DoctorDashboard}/$doctorId") {
                                popUpTo(NavRoutes.ClinicLogin) { inclusive = true }
                            }
                        } else {
                            // Pending KYC review
                            pendingEntityName = existingDoctor.fullName
                            pendingEmail = existingDoctor.email
                            pendingRole = "doctor"
                            pendingStatus = existingDoctor.kycStatus ?: "pending"
                            pendingDetails = "NMC: ${existingDoctor.nmcLicenseNumber ?: "N/A"} • ${existingDoctor.specialty ?: "General"}"
                            pendingId = existingDoctor.id
                            sessionManager?.savePendingVerification(
                                email = pendingEmail,
                                role = "doctor",
                                name = existingDoctor.fullName,
                                id = existingDoctor.id,
                                details = pendingDetails,
                                status = pendingStatus
                            )
                            isLoading = false
                            statusMessage = null
                            currentView = "pending_verification"
                        }
                    } else {
                        // First-time doctor registration: Do NOT prefill doctorName from Google account
                        doctorName = ""
                        isUnregisteredAccountNotice = false
                        isLoading = false
                        statusMessage = null
                        currentView = "register_form"
                    }
                }
            } catch (e: Exception) {
                // If checking DB fails (e.g. network glitch or first time user), do NOT prefill from Google account
                isLoading = false
                statusMessage = null
                if (selectedTab == 0) {
                    clinicName = ""
                    currentView = "register_form"
                } else {
                    doctorName = ""
                    currentView = "register_form"
                }
            }
        }
    }

    fun handleGoogleAccountReceived(account: GoogleSignInAccount) {
        googleAccount = account
        val email = account.email ?: ""
        val idToken = account.idToken
        if (!idToken.isNullOrBlank()) {
            try {
                val credential = GoogleAuthProvider.getCredential(idToken, null)
                FirebaseAuth.getInstance().signInWithCredential(credential)
            } catch (e: Exception) {
                e.printStackTrace()
            }
        }
        processLoginForEmail(email, "", account.id)
    }

    val accountPickerLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.StartActivityForResult()
    ) { result ->
        if (result.resultCode == Activity.RESULT_OK) {
            val email = result.data?.getStringExtra(AccountManager.KEY_ACCOUNT_NAME)
            if (!email.isNullOrBlank()) {
                processLoginForEmail(email, "")
            } else {
                isLoading = false
                statusMessage = null
            }
        } else {
            isLoading = false
            statusMessage = null
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
                    handleGoogleAccountReceived(account)
                    return@rememberLauncherForActivityResult
                }
            } catch (e: Exception) {
                e.printStackTrace()
                isLoading = false
                statusMessage = null
                errorMessage = "Google Sign-In failed: ${e.message ?: "Code ${(e as? ApiException)?.statusCode}"}"
                return@rememberLauncherForActivityResult
            }
        }
        isLoading = false
        statusMessage = null
    }

    // Registration Paper Picker Launcher
    val regDocLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.GetContent()
    ) { uri: Uri? ->
        if (uri != null) {
            clinicRegDocUri = uri
            clinicRegDocName = com.dactor.clinic.domain.util.FileCompressor.resolveDisplayFileName(
                context = context,
                uri = uri,
                defaultBaseName = "registration_doc"
            )
        }
    }

    // Clinic Picture Picker Launcher (supports up to 4 pictures with remaining slot limit)
    val clinicPictureLauncher = rememberLauncherForActivityResult(
        contract = PickMultipleClinicImagesContract()
    ) { uris: List<Uri> ->
        if (uris.isNotEmpty()) {
            val remaining = (4 - clinicPictures.size).coerceAtLeast(0)
            if (remaining > 0) {
                val uniqueUris = uris.filter { it !in clinicPictures }
                val toAdd = uniqueUris.take(remaining)
                if (toAdd.isNotEmpty()) {
                    clinicPictures = (clinicPictures + toAdd).take(4)
                }
                if (uris.size > remaining) {
                    android.widget.Toast.makeText(
                        context,
                        "Added ${toAdd.size} photo(s). Maximum 4 photos allowed.",
                        android.widget.Toast.LENGTH_SHORT
                    ).show()
                } else if (uniqueUris.size < uris.size) {
                    android.widget.Toast.makeText(
                        context,
                        "Duplicate photos were ignored.",
                        android.widget.Toast.LENGTH_SHORT
                    ).show()
                }
            } else {
                android.widget.Toast.makeText(
                    context,
                    "Maximum 4 photos already selected.",
                    android.widget.Toast.LENGTH_SHORT
                ).show()
            }
        }
    }

    // Doctor Profile Picture Launcher
    val doctorPictureLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.GetContent()
    ) { uri: Uri? ->
        if (uri != null) {
            doctorPictureUri = uri
            doctorPictureName = com.dactor.clinic.domain.util.FileCompressor.resolveDisplayFileName(
                context = context,
                uri = uri,
                defaultBaseName = "doctor_photo"
            )
        }
    }

    var isFetchingLocation by remember { mutableStateOf(false) }
    var showEnableGpsDialog by remember { mutableStateOf(false) }
    var showLocationPermissionDialog by remember { mutableStateOf(false) }

    fun isDeviceLocationEnabled(): Boolean {
        val locManager = context.getSystemService(Context.LOCATION_SERVICE) as? LocationManager ?: return false
        return try {
            locManager.isProviderEnabled(LocationManager.GPS_PROVIDER) ||
                locManager.isProviderEnabled(LocationManager.NETWORK_PROVIDER)
        } catch (e: Exception) {
            false
        }
    }

    fun fetchCurrentLocation() {
        val locManager = context.getSystemService(Context.LOCATION_SERVICE) as? LocationManager
        if (locManager == null) {
            isFetchingLocation = false
            return
        }

        if (!isDeviceLocationEnabled()) {
            isFetchingLocation = false
            showEnableGpsDialog = true
            return
        }

        isFetchingLocation = true

        fun applyLocation(loc: Location) {
            val lat = loc.latitude
            val lng = loc.longitude
            coroutineScope.launch(Dispatchers.IO) {
                var addressResult = ""
                try {
                    val geocoder = Geocoder(context, Locale.getDefault())
                    val addresses = geocoder.getFromLocation(lat, lng, 1)
                    if (!addresses.isNullOrEmpty()) {
                        val addr = addresses[0]
                        val parts = listOfNotNull(
                            addr.featureName,
                            addr.subLocality,
                            addr.locality,
                            addr.subAdminArea,
                            addr.adminArea
                        ).distinct()
                        addressResult = parts.joinToString(", ")
                    }
                } catch (ignored: Exception) {}

                if (addressResult.isBlank()) {
                    addressResult = "Location (${String.format(Locale.US, "%.5f", lat)}, ${String.format(Locale.US, "%.5f", lng)})"
                }

                withContext(Dispatchers.Main) {
                    clinicLat = lat
                    clinicLng = lng
                    clinicAddress = addressResult
                    isFetchingLocation = false
                }
            }
        }

        // 1. Initial cached reading if present
        var bestLoc: Location? = null
        val providers = listOf(LocationManager.GPS_PROVIDER, LocationManager.NETWORK_PROVIDER, LocationManager.PASSIVE_PROVIDER)
        for (p in providers) {
            try {
                val loc = locManager.getLastKnownLocation(p)
                if (loc != null && (bestLoc == null || loc.accuracy < bestLoc.accuracy)) {
                    bestLoc = loc
                }
            } catch (ignored: Exception) {}
        }
        if (bestLoc != null) {
            applyLocation(bestLoc)
        }

        // 2. Request fast fix (prefer fast Network provider for indoor lock, refine with GPS)
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                val fastProvider = when {
                    locManager.isProviderEnabled(LocationManager.NETWORK_PROVIDER) -> LocationManager.NETWORK_PROVIDER
                    locManager.isProviderEnabled(LocationManager.GPS_PROVIDER) -> LocationManager.GPS_PROVIDER
                    else -> LocationManager.PASSIVE_PROVIDER
                }
                locManager.getCurrentLocation(fastProvider, null, context.mainExecutor) { liveLoc ->
                    if (liveLoc != null) {
                        applyLocation(liveLoc)
                    } else if (fastProvider == LocationManager.NETWORK_PROVIDER && locManager.isProviderEnabled(LocationManager.GPS_PROVIDER)) {
                        locManager.getCurrentLocation(LocationManager.GPS_PROVIDER, null, context.mainExecutor) { gpsLoc ->
                            if (gpsLoc != null) applyLocation(gpsLoc)
                            else if (bestLoc == null) coroutineScope.launch(Dispatchers.Main) { isFetchingLocation = false }
                        }
                    } else if (bestLoc == null) {
                        coroutineScope.launch(Dispatchers.Main) { isFetchingLocation = false }
                    }
                }
            } else {
                val listener = object : LocationListener {
                    override fun onLocationChanged(location: Location) {
                        locManager.removeUpdates(this)
                        applyLocation(location)
                    }
                    @Deprecated("Deprecated in Java")
                    override fun onStatusChanged(provider: String?, status: Int, extras: Bundle?) {}
                    override fun onProviderEnabled(provider: String) {}
                    override fun onProviderDisabled(provider: String) {}
                }
                if (locManager.isProviderEnabled(LocationManager.NETWORK_PROVIDER)) {
                    locManager.requestSingleUpdate(LocationManager.NETWORK_PROVIDER, listener, Looper.getMainLooper())
                } else if (locManager.isProviderEnabled(LocationManager.GPS_PROVIDER)) {
                    locManager.requestSingleUpdate(LocationManager.GPS_PROVIDER, listener, Looper.getMainLooper())
                }
            }
        } catch (e: Exception) {
            e.printStackTrace()
            if (bestLoc == null) {
                coroutineScope.launch(Dispatchers.Main) { isFetchingLocation = false }
            }
        }
    }

    val gpsSettingsLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.StartActivityForResult()
    ) {
        if (isDeviceLocationEnabled()) {
            fetchCurrentLocation()
        }
    }

    val locationPermissionLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestMultiplePermissions()
    ) { permissions ->
        val granted = permissions[Manifest.permission.ACCESS_FINE_LOCATION] == true ||
                      permissions[Manifest.permission.ACCESS_COARSE_LOCATION] == true
        if (granted) {
            fetchCurrentLocation()
        } else {
            showLocationPermissionDialog = true
        }
    }

    fun requestLocationAndFetch() {
        val hasFine = ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
        val hasCoarse = ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED
        if (hasFine || hasCoarse) {
            fetchCurrentLocation()
        } else {
            locationPermissionLauncher.launch(
                arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION)
            )
        }
    }

    // Automatically request location permission and fetch location when entering Clinic Registration
    LaunchedEffect(currentView, selectedTab) {
        if (currentView == "register_form" && selectedTab == 0 && clinicAddress.isBlank()) {
            requestLocationAndFetch()
        }
    }

    fun launchGoogleSignIn(intentType: String) {
        if (isLoading) return
        isLoading = true
        errorMessage = null
        authActionIntent = intentType
        statusMessage = "Opening Google Sign-In..."
        isUnregisteredAccountNotice = false

        try {
            googleSignInClient.signOut().addOnCompleteListener {
                googleSignInLauncher.launch(googleSignInClient.signInIntent)
            }
        } catch (e: Exception) {
            try {
                googleSignInLauncher.launch(googleSignInClient.signInIntent)
            } catch (e2: Exception) {
                isLoading = false
                statusMessage = null
                errorMessage = "Failed to launch Google Sign-In: ${e2.message}"
            }
        }
    }

    fun switchGoogleAccount() {
        isLoading = true
        errorMessage = null
        statusMessage = "Opening Google account chooser..."
        isUnregisteredAccountNotice = false
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
                        statusMessage = null
                        errorMessage = "Failed to open account chooser: ${e2.message}"
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
                    statusMessage = null
                    errorMessage = "Failed to launch account picker: ${e3.message}"
                }
            }
        }
    }

    fun resetToAuthChoice() {
        sessionManager?.clearSession()
        clinicRepository?.clearCache()
        doctorRepository?.clearCache()
        isLoading = false
        statusMessage = null
        errorMessage = null
        isUnregisteredAccountNotice = false
        verifiedEmail = ""
        verifiedDisplayName = ""
        googleAccount = null
        clinicName = ""
        clinicAddress = ""
        clinicPan = ""
        clinicPhoneDigits = ""
        managerPhoneDigits = ""
        clinicRegDocUri = null
        clinicRegDocName = null
        clinicPictures = emptyList()
        clinicDesc = ""
        doctorName = ""
        doctorGender = ""
        doctorAge = ""
        doctorStartingYear = ""
        doctorPictureUri = null
        doctorPictureName = null
        doctorSpecialty = ""
        doctorEducation = ""
        doctorNmc = ""
        doctorPersonalPhone = ""
        doctorPublicPhone = ""
        doctorDesc = ""
        clinicValidationTriggered = false
        doctorValidationTriggered = false
        currentView = "auth_choice"
        try {
            googleSignInClient.signOut()
            FirebaseAuth.getInstance().signOut()
        } catch (ignored: Exception) {}
    }

    fun submitClinicRegistration() {
        clinicValidationTriggered = true
        if (clinicName.trim().length < 2) {
            errorMessage = "Please enter clinic name (at least 2 characters)."
            coroutineScope.launch {
                scrollState.animateScrollTo((clinicNameFieldY - 200).coerceAtLeast(0))
                runCatching { clinicNameFocus.requestFocus() }
            }
            return
        }
        if (clinicAddress.isBlank()) {
            errorMessage = "Please enter or pick the clinic location."
            coroutineScope.launch {
                scrollState.animateScrollTo((clinicAddressFieldY - 200).coerceAtLeast(0))
            }
            return
        }
        if (clinicRegDocUri == null) {
            errorMessage = "Please upload the clinic registration certificate (PDF or Image)."
            coroutineScope.launch {
                scrollState.animateScrollTo((clinicRegDocFieldY - 200).coerceAtLeast(0))
            }
            return
        }
        val cleanPan = clinicPan.trim()
        if (cleanPan.length != 9 || !cleanPan.all { it.isDigit() }) {
            errorMessage = "PAN number must be exactly 9 digits."
            coroutineScope.launch {
                scrollState.animateScrollTo((clinicPanFieldY - 200).coerceAtLeast(0))
                runCatching { clinicPanFocus.requestFocus() }
            }
            return
        }
        val cleanClinicPhone = clinicPhoneDigits.trim()
        if (cleanClinicPhone.length != 10 || !cleanClinicPhone.startsWith("9") || !cleanClinicPhone.all { it.isDigit() }) {
            errorMessage = "Clinic contact number must be exactly 10 digits starting with 9."
            coroutineScope.launch {
                scrollState.animateScrollTo((clinicPhoneFieldY - 200).coerceAtLeast(0))
                runCatching { clinicPhoneFocus.requestFocus() }
            }
            return
        }
        val cleanManagerPhone = managerPhoneDigits.trim()
        if (cleanManagerPhone.length != 10 || !cleanManagerPhone.startsWith("9") || !cleanManagerPhone.all { it.isDigit() }) {
            errorMessage = "Manager contact number must be exactly 10 digits starting with 9."
            coroutineScope.launch {
                scrollState.animateScrollTo((managerPhoneFieldY - 200).coerceAtLeast(0))
                runCatching { managerPhoneFocus.requestFocus() }
            }
            return
        }
        if (clinicPictures.isEmpty()) {
            errorMessage = "Please upload at least 1 clinic picture (1 to 4 pictures required)."
            coroutineScope.launch {
                scrollState.animateScrollTo((clinicPicturesFieldY - 200).coerceAtLeast(0))
            }
            return
        }
        if (clinicPictures.size > 4) {
            errorMessage = "Maximum 4 clinic pictures allowed."
            return
        }
        if (!clinicTermsAccepted) {
            errorMessage = "Please review and accept the Clinic Terms of Service & Regulatory Policy to register."
            coroutineScope.launch {
                scrollState.animateScrollTo((clinicTermsFieldY - 200).coerceAtLeast(0))
            }
            return
        }

        isLoading = true
        errorMessage = null
        statusMessage = "Submitting clinic registration to Supabase..."

        coroutineScope.launch {
            try {
                val newId = UUID.randomUUID().toString()
                val email = verifiedEmail.trim().lowercase()

                // 1. Upload registration document to Supabase Storage if selected
                var uploadedRegDocUrl: String? = null
                if (clinicRegDocUri != null) {
                    statusMessage = "Uploading registration document to Supabase Storage..."
                    try {
                        val bytes = context.contentResolver.openInputStream(clinicRegDocUri!!)?.use { it.readBytes() }
                        if (bytes != null) {
                            val resolvedDocName = com.dactor.clinic.domain.util.FileCompressor.resolveRealFileName(
                                context = context,
                                uri = clinicRegDocUri!!,
                                rawBytes = bytes,
                                defaultBaseName = "registration_doc"
                            )
                            val cleanDocName = resolvedDocName.replace("\\s+".toRegex(), "_")
                            val fileName = "reg_${newId}_${System.currentTimeMillis()}_$cleanDocName"
                            uploadedRegDocUrl = clinicRepository?.uploadClinicFile(fileName, bytes)
                        }
                    } catch (e: Exception) {
                        e.printStackTrace()
                    }
                }

                // 2. Upload clinic pictures to Supabase Storage
                val uploadedPictureUrls = mutableListOf<String>()
                statusMessage = "Uploading clinic pictures to Supabase Storage..."
                for ((idx, picUri) in clinicPictures.withIndex()) {
                    try {
                        val bytes = context.contentResolver.openInputStream(picUri)?.use { it.readBytes() }
                        if (bytes != null) {
                            val fileName = "clinic_${newId}_${System.currentTimeMillis()}_${idx + 1}.jpg"
                            val publicUrl = clinicRepository?.uploadClinicFile(fileName, bytes)
                            if (publicUrl != null) {
                                uploadedPictureUrls.add(publicUrl)
                            }
                        }
                    } catch (e: Exception) {
                        e.printStackTrace()
                    }
                }

                val newClinic = Clinic(
                    id = newId,
                    name = clinicName.trim(),
                    type = clinicType,
                    verificationStatus = "pending", // Pending admin verification
                    contactPhone = "+977$cleanClinicPhone",
                    contactEmail = email,
                    addressText = clinicAddress.trim(),
                    latitude = clinicLat,
                    longitude = clinicLng,
                    autoNotifyThreshold = 2,
                    description = clinicDesc.trim().ifBlank { null },
                    panNumber = cleanPan,
                    managerPhone = "+977$cleanManagerPhone",
                    registrationDocUrl = uploadedRegDocUrl,
                    pictures = uploadedPictureUrls,
                    specialties = clinicSpecialties.toList()
                )

                clinicRepository?.createClinic(newClinic)
                authRepository?.syncProfile(googleAccount?.id ?: "", email, newClinic.name, "clinic_admin")

                isLoading = false
                statusMessage = null

                pendingEntityName = newClinic.name
                pendingEmail = email
                pendingRole = "clinic"
                pendingStatus = "pending"
                pendingDetails = "PAN: $cleanPan • ${(newClinic.type ?: "clinic").replace('_', ' ').replaceFirstChar { it.uppercase() }} • ${newClinic.addressText ?: "Nepal"}"
                pendingId = newId
                sessionManager?.savePendingVerification(
                    email = email,
                    role = "clinic",
                    name = newClinic.name,
                    id = newId,
                    details = pendingDetails,
                    status = "pending"
                )
                currentView = "pending_verification"
            } catch (e: Exception) {
                isLoading = false
                statusMessage = null
                errorMessage = "Failed to submit clinic registration: ${e.message}"
            }
        }
    }

    fun submitDoctorRegistration() {
        doctorValidationTriggered = true
        if (doctorName.trim().length < 3) {
            errorMessage = "Please enter doctor full name (at least 3 characters)."
            coroutineScope.launch {
                scrollState.animateScrollTo((doctorNameFieldY - 200).coerceAtLeast(0))
                runCatching { doctorNameFocus.requestFocus() }
            }
            return
        }
        if (doctorGender.isBlank()) {
            errorMessage = "Please select doctor gender."
            coroutineScope.launch {
                scrollState.animateScrollTo((doctorGenderFieldY - 200).coerceAtLeast(0))
            }
            return
        }
        val cleanAge = doctorAge.trim().toIntOrNull()
        if (cleanAge == null || cleanAge !in 20..100) {
            errorMessage = "Please enter a valid age between 20 and 100."
            coroutineScope.launch {
                scrollState.animateScrollTo((doctorAgeFieldY - 200).coerceAtLeast(0))
                runCatching { doctorAgeFocus.requestFocus() }
            }
            return
        }
        val cleanYear = doctorStartingYear.trim().toIntOrNull()
        if (cleanYear == null || cleanYear !in 1960..2026) {
            errorMessage = "Please select starting practicing year from the dropdown."
            coroutineScope.launch {
                scrollState.animateScrollTo((doctorStartingYearFieldY - 200).coerceAtLeast(0))
            }
            return
        }
        if (doctorSpecialty.isBlank()) {
            errorMessage = "Please select practitioner specialization."
            coroutineScope.launch {
                scrollState.animateScrollTo((doctorSpecialtyFieldY - 200).coerceAtLeast(0))
            }
            return
        }
        if (doctorEducation.isBlank()) {
            errorMessage = "Please select educational qualification."
            coroutineScope.launch {
                scrollState.animateScrollTo((doctorEducationFieldY - 200).coerceAtLeast(0))
            }
            return
        }
        if (doctorNmc.trim().length < 3) {
            errorMessage = "Please enter a valid NMC license number (at least 3 characters)."
            coroutineScope.launch {
                scrollState.animateScrollTo((doctorNmcFieldY - 200).coerceAtLeast(0))
                runCatching { doctorNmcFocus.requestFocus() }
            }
            return
        }
        val cleanPersonal = doctorPersonalPhone.trim()
        val cleanPublic = doctorPublicPhone.trim()
        if (cleanPersonal.length != 10 || !cleanPersonal.startsWith("9") || !cleanPersonal.all { it.isDigit() }) {
            errorMessage = "Personal mobile number must be exactly 10 digits starting with 9."
            coroutineScope.launch {
                scrollState.animateScrollTo((doctorPhoneFieldY - 200).coerceAtLeast(0))
                runCatching { doctorPhoneFocus.requestFocus() }
            }
            return
        }
        if (!doctorTermsAccepted) {
            errorMessage = "Please review and accept the Doctor Terms of Service & NMC Code of Ethics to register."
            coroutineScope.launch {
                scrollState.animateScrollTo((doctorTermsFieldY - 200).coerceAtLeast(0))
            }
            return
        }

        isLoading = true
        errorMessage = null
        statusMessage = "Submitting doctor profile to Supabase..."

        coroutineScope.launch {
            try {
                val newId = UUID.randomUUID().toString()
                val email = verifiedEmail.trim().lowercase()

                // Upload doctor profile picture to Supabase Storage if selected
                var uploadedProfilePicUrl: String? = null
                if (doctorPictureUri != null) {
                    statusMessage = "Uploading doctor photo to Supabase Storage..."
                    try {
                        val bytes = context.contentResolver.openInputStream(doctorPictureUri!!)?.use { it.readBytes() }
                        if (bytes != null) {
                            val resolvedPicName = com.dactor.clinic.domain.util.FileCompressor.resolveRealFileName(
                                context = context,
                                uri = doctorPictureUri!!,
                                rawBytes = bytes,
                                defaultBaseName = "doctor_photo"
                            )
                            val cleanPicName = resolvedPicName.replace("\\s+".toRegex(), "_")
                            val fileName = "doc_${newId}_${System.currentTimeMillis()}_$cleanPicName"
                            uploadedProfilePicUrl = doctorRepository?.uploadProfilePicture(fileName, bytes)
                        }
                    } catch (e: Exception) {
                        e.printStackTrace()
                    }
                }

                val newDoctor = Doctor(
                    id = newId,
                    fullName = doctorName.trim(),
                    email = email,
                    gender = doctorGender,
                    age = cleanAge,
                    startingPracticingYear = cleanYear,
                    profilePictureUrl = uploadedProfilePicUrl,
                    specialty = doctorSpecialty.trim(),
                    specialties = listOf(doctorSpecialty.trim()),
                    education = doctorEducation.trim().ifBlank { null },
                    nmcLicenseNumber = doctorNmc.trim(),
                    personalMobileNumber = if (cleanPersonal.isNotBlank()) cleanPersonal else null,
                    publicMobileNumber = if (cleanPublic.isNotBlank()) cleanPublic else null,
                    description = doctorDesc.trim().ifBlank { null },
                    kycStatus = "pending", // Pending admin verification
                    isInClinic = true,
                    consultationFee = 500.0, // Controlled by clinic in Operational Management
                    practitionerRole = doctorPractitionerRole
                )

                doctorRepository?.createDoctor(newDoctor)
                authRepository?.syncProfile(googleAccount?.id ?: "", email, newDoctor.fullName, "doctor")

                isLoading = false
                statusMessage = null

                pendingEntityName = newDoctor.fullName
                pendingEmail = email
                pendingRole = "doctor"
                pendingStatus = "pending"
                pendingDetails = "NMC: ${newDoctor.nmcLicenseNumber} • ${newDoctor.specialty ?: "General"}"
                pendingId = newId
                sessionManager?.savePendingVerification(
                    email = email,
                    role = "doctor",
                    name = newDoctor.fullName,
                    id = newId,
                    details = pendingDetails,
                    status = "pending"
                )
                currentView = "pending_verification"
            } catch (e: Exception) {
                isLoading = false
                statusMessage = null
                errorMessage = "Failed to submit doctor profile: ${e.message}"
            }
        }
    }

    fun checkVerificationStatus() {
        isLoading = true
        errorMessage = null
        statusMessage = "Checking verification status with Admin..."
        val email = pendingEmail.trim().lowercase()

        coroutineScope.launch {
            try {
                if (pendingRole == "clinic") {
                    val refreshedClinic = if (pendingId.isNotBlank()) {
                        clinicRepository?.getClinicById(pendingId)
                    } else {
                        clinicRepository?.getClinicByEmail(email)
                    }

                    if (refreshedClinic != null) {
                        pendingStatus = refreshedClinic.verificationStatus ?: "pending"
                        if (refreshedClinic.verificationStatus.equals("approved", ignoreCase = true)) {
                            statusMessage = "Your clinic has been verified! Opening portal..."
                            clinicRepository?.clearCache()
                            doctorRepository?.clearCache()
                            sessionManager?.saveClinicSession(refreshedClinic.id, refreshedClinic.contactEmail ?: email, refreshedClinic.name)
                            authRepository?.syncProfile(googleAccount?.id ?: "", email, refreshedClinic.name, "clinic_admin")
                            isLoading = false
                            navController.navigate("${NavRoutes.Dashboard}/${refreshedClinic.id}") {
                                popUpTo(NavRoutes.ClinicLogin) { inclusive = true }
                            }
                        } else if (refreshedClinic.verificationStatus.equals("rejected", ignoreCase = true)) {
                            isLoading = false
                            statusMessage = null
                            errorMessage = "Your clinic registration was rejected by the admin team. Please contact support."
                        } else {
                            isLoading = false
                            statusMessage = "Your clinic application is still pending admin review. Please wait for admin approval."
                        }
                    } else {
                        isLoading = false
                        statusMessage = null
                        errorMessage = "Record not found. Please try logging in again."
                    }
                } else {
                    val refreshedDoctor = if (pendingId.isNotBlank()) {
                        doctorRepository?.getDoctorById(pendingId)
                    } else {
                        doctorRepository?.getDoctorByEmail(email)
                    }

                    if (refreshedDoctor != null) {
                        pendingStatus = refreshedDoctor.kycStatus ?: "pending"
                        if (refreshedDoctor.kycStatus.equals("approved", ignoreCase = true) ||
                            refreshedDoctor.kycStatus.equals("verified", ignoreCase = true)
                        ) {
                            statusMessage = "Your doctor profile has been verified! Opening OPD dashboard..."
                            clinicRepository?.clearCache()
                            doctorRepository?.clearCache()
                            sessionManager?.saveDoctorSession(refreshedDoctor.id, refreshedDoctor.email, refreshedDoctor.fullName)
                            authRepository?.syncProfile(googleAccount?.id ?: "", email, refreshedDoctor.fullName, "doctor")
                            isLoading = false
                            navController.navigate("${NavRoutes.DoctorDashboard}/${refreshedDoctor.id}") {
                                popUpTo(NavRoutes.ClinicLogin) { inclusive = true }
                            }
                        } else if (refreshedDoctor.kycStatus.equals("rejected", ignoreCase = true)) {
                            isLoading = false
                            statusMessage = null
                            errorMessage = "Your doctor KYC was rejected by the admin team. Please contact support."
                        } else {
                            isLoading = false
                            statusMessage = "Your doctor KYC is still pending admin verification. Please wait for admin approval."
                        }
                    } else {
                        isLoading = false
                        statusMessage = null
                        errorMessage = "Record not found. Please try logging in again."
                    }
                }
            } catch (e: Exception) {
                isLoading = false
                statusMessage = null
                errorMessage = "Failed to refresh verification status: ${e.message}"
            }
        }
    }

    fun signOutFromPending() {
        try {
            googleSignInClient.signOut()
            FirebaseAuth.getInstance().signOut()
            clinicRepository?.clearCache()
            doctorRepository?.clearCache()
            sessionManager?.clearSession()
        } catch (ignored: Exception) {}
        currentView = "auth_choice"
        errorMessage = null
        statusMessage = null
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        when (currentView) {
                            "register_form" -> if (selectedTab == 0) "Clinic Registration" else "Doctor Registration"
                            "pending_verification" -> "Admin Verification"
                            else -> "Dactor Portal"
                        },
                        fontWeight = FontWeight.Bold
                    )
                },
                navigationIcon = {
                    if (currentView == "register_form") {
                        IconButton(onClick = { resetToAuthChoice() }) {
                            Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                        }
                    } else if (currentView == "pending_verification") {
                        IconButton(onClick = { signOutFromPending() }) {
                            Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                        }
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.surface)
            )
        }
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .background(MaterialTheme.colorScheme.background)
                .verticalScroll(scrollState)
                .padding(horizontal = 24.dp, vertical = 16.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(18.dp)
        ) {
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
            AnimatedVisibility(visible = statusMessage != null) {
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
                            text = statusMessage ?: "",
                            color = MaterialTheme.colorScheme.onPrimaryContainer,
                            fontSize = 13.sp,
                            fontWeight = FontWeight.Medium
                        )
                    }
                }
            }

            if (currentView == "auth_choice") {
                // Portal Selector Tabs
                Surface(
                    shape = RoundedCornerShape(14.dp),
                    color = Color.Transparent,
                    modifier = Modifier.fillMaxWidth()
                ) {
                    TabRow(
                        selectedTabIndex = selectedTab,
                        containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f)
                    ) {
                        Tab(
                            selected = selectedTab == 0,
                            onClick = {
                                selectedTab = 0
                                errorMessage = null
                            },
                            text = {
                                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                    Icon(Icons.Default.LocalHospital, contentDescription = null, modifier = Modifier.size(18.dp))
                                    Text("Clinic Staff", fontWeight = FontWeight.Bold)
                                }
                            }
                        )
                        Tab(
                            selected = selectedTab == 1,
                            onClick = {
                                selectedTab = 1
                                errorMessage = null
                            },
                            text = {
                                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                    Icon(Icons.Default.MedicalServices, contentDescription = null, modifier = Modifier.size(18.dp))
                                    Text("Doctor / Specialist", fontWeight = FontWeight.Bold)
                                }
                            }
                        )
                    }
                }

                // Portal Avatar Icon
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
                        text = if (selectedTab == 0) "Clinic & Reception Portal" else "Doctor & Specialist Portal",
                        fontSize = 22.sp,
                        fontWeight = FontWeight.ExtraBold,
                        color = MaterialTheme.colorScheme.onBackground
                    )
                    Spacer(modifier = Modifier.height(6.dp))
                    Text(
                        text = if (selectedTab == 0)
                            "Manage tokens, walk-ins, queues, and services for your clinic in Nepal."
                        else
                            "Track active patient queue, conduct consultations, and order diagnostic labs.",
                        fontSize = 13.sp,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        textAlign = TextAlign.Center,
                        lineHeight = 18.sp,
                        modifier = Modifier.padding(horizontal = 8.dp)
                    )
                }

                // Primary Actions Card
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
                        // Single Unified Google Authentication Button
                        Button(
                            onClick = { launchGoogleSignIn("login") },
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(54.dp),
                            shape = RoundedCornerShape(14.dp),
                            colors = ButtonDefaults.buttonColors(
                                containerColor = if (selectedTab == 0) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.tertiary
                            ),
                            enabled = !isLoading
                        ) {
                            Icon(Icons.Default.AccountCircle, contentDescription = "Google", modifier = Modifier.size(24.dp))
                            Spacer(Modifier.width(10.dp))
                            Text(
                                "Continue with Google",
                                fontWeight = FontWeight.Bold,
                                fontSize = 16.sp
                            )
                        }

                        // Terms & Conditions and Regulatory Policy Disclosure Button
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(top = 2.dp),
                            horizontalArrangement = Arrangement.Center,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text(
                                "By continuing, you accept Dactor's ",
                                fontSize = 11.sp,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                            TextButton(
                                onClick = {
                                    termsDialogInitialTab = if (selectedTab == 0) 0 else 1
                                    showTermsDialog = true
                                },
                                contentPadding = PaddingValues(0.dp)
                            ) {
                                Text(
                                    if (selectedTab == 0) "Clinic Terms & Policy" else "Doctor Terms & Policy",
                                    fontSize = 11.sp,
                                    fontWeight = FontWeight.Bold,
                                    color = if (selectedTab == 0) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.tertiary
                                )
                            }
                        }
                    }
                }

                // Security Note
                Surface(
                    shape = RoundedCornerShape(12.dp),
                    color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.4f),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Row(
                        modifier = Modifier.padding(14.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(10.dp)
                    ) {
                        Icon(Icons.Default.Shield, contentDescription = null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(20.dp))
                        Text(
                            text = "Authenticated with Firebase Auth. All data and realtime queues stored securely in Supabase Cloud PostgreSQL.",
                            fontSize = 11.sp,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            lineHeight = 15.sp
                        )
                    }
                }
            } else if (currentView == "register_form") {
                // REGISTRATION FORM VIEW

                // Unregistered Account Notice (if mistakenly selected an unregistered account during login)
                if (isUnregisteredAccountNotice) {
                    Surface(
                        color = Color(0xFFFEF3C7),
                        shape = RoundedCornerShape(14.dp),
                        border = BorderStroke(1.dp, Color(0xFFFDE68A)),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Column(
                            modifier = Modifier.padding(14.dp),
                            verticalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(8.dp)
                            ) {
                                Icon(Icons.Default.WarningAmber, contentDescription = null, tint = Color(0xFFB45309), modifier = Modifier.size(20.dp))
                                Text(
                                    text = "Account Not Registered",
                                    fontWeight = FontWeight.Bold,
                                    fontSize = 14.sp,
                                    color = Color(0xFF92400E)
                                )
                            }
                            Text(
                                text = "No ${if (selectedTab == 0) "Clinic" else "Doctor"} profile is registered under \"$verifiedEmail\". Complete your details below to register, or tap Change Account to use another Gmail.",
                                fontSize = 12.sp,
                                color = Color(0xFF78350F),
                                lineHeight = 16.sp
                            )
                        }
                    }
                }

                // Google Account Verification Card with quick "Change Account" action
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
                            Column {
                                Text("Selected Google Account", fontWeight = FontWeight.Bold, fontSize = 12.sp, color = Color(0xFF2E7D32))
                                Text(verifiedEmail, fontSize = 13.sp, fontWeight = FontWeight.SemiBold, color = MaterialTheme.colorScheme.onSurface)
                                if (verifiedDisplayName.isNotBlank()) {
                                    Text(verifiedDisplayName, fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
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

                if (selectedTab == 0) {
                    // CLINIC FORM
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
                            Text("Clinic Details", fontWeight = FontWeight.Bold, fontSize = 17.sp)

                            // 1. Clinic Name
                            OutlinedTextField(
                                value = clinicName,
                                onValueChange = {
                                    clinicName = it
                                    if (errorMessage != null) errorMessage = null
                                },
                                label = { Text("Name of the Clinic *") },
                                placeholder = { Text("e.g. Patan Health Care Polyclinic") },
                                leadingIcon = { Icon(Icons.Default.LocalHospital, contentDescription = null) },
                                isError = isClinicNameError,
                                supportingText = if (isClinicNameError) {
                                    { Text("Required: Clinic name must be at least 2 characters", color = MaterialTheme.colorScheme.error, fontSize = 11.sp) }
                                } else null,
                                singleLine = true,
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .focusRequester(clinicNameFocus)
                                    .onGloballyPositioned { clinicNameFieldY = it.positionInRoot().y.toInt() },
                                shape = RoundedCornerShape(12.dp)
                            )

                            // 2. Location (With GPS & OpenStreetMap Picker)
                            Surface(
                                shape = RoundedCornerShape(12.dp),
                                color = if (isClinicAddressError) MaterialTheme.colorScheme.errorContainer.copy(alpha = 0.2f) else MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f),
                                border = BorderStroke(if (isClinicAddressError) 1.5.dp else 1.dp, if (isClinicAddressError) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.outlineVariant),
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .onGloballyPositioned { clinicAddressFieldY = it.positionInRoot().y.toInt() }
                            ) {
                                Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                                    Row(
                                        modifier = Modifier.fillMaxWidth(),
                                        verticalAlignment = Alignment.CenterVertically,
                                        horizontalArrangement = Arrangement.spacedBy(6.dp)
                                    ) {
                                        Icon(
                                            Icons.Default.LocationOn,
                                            contentDescription = null,
                                            tint = if (isClinicAddressError) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.primary,
                                            modifier = Modifier.size(18.dp)
                                        )
                                        Text(
                                            "Clinic Location *",
                                            fontWeight = FontWeight.SemiBold,
                                            fontSize = 13.sp,
                                            color = if (isClinicAddressError) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurface
                                        )
                                    }

                                    Row(
                                        modifier = Modifier.fillMaxWidth(),
                                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                                        verticalAlignment = Alignment.CenterVertically
                                    ) {
                                        FilledTonalButton(
                                            onClick = { requestLocationAndFetch() },
                                            shape = RoundedCornerShape(10.dp),
                                            contentPadding = PaddingValues(horizontal = 12.dp, vertical = 8.dp),
                                            modifier = Modifier.weight(1f).height(40.dp),
                                            enabled = !isFetchingLocation
                                        ) {
                                            if (isFetchingLocation) {
                                                CircularProgressIndicator(modifier = Modifier.size(14.dp), strokeWidth = 2.dp)
                                            } else {
                                                Icon(Icons.Default.MyLocation, contentDescription = null, modifier = Modifier.size(16.dp))
                                            }
                                            Spacer(Modifier.width(6.dp))
                                            Text(
                                                text = if (isFetchingLocation) "Locating..." else "Use GPS",
                                                fontSize = 12.sp,
                                                fontWeight = FontWeight.Bold,
                                                maxLines = 1
                                            )
                                        }

                                        OutlinedButton(
                                            onClick = { showLocationPicker = true },
                                            shape = RoundedCornerShape(10.dp),
                                            contentPadding = PaddingValues(horizontal = 12.dp, vertical = 8.dp),
                                            modifier = Modifier.weight(1f).height(40.dp)
                                        ) {
                                            Icon(Icons.Default.Map, contentDescription = null, modifier = Modifier.size(16.dp))
                                            Spacer(Modifier.width(6.dp))
                                            Text(
                                                text = "Map Picker",
                                                fontSize = 12.sp,
                                                fontWeight = FontWeight.Bold,
                                                maxLines = 1
                                            )
                                        }
                                    }

                                    OutlinedTextField(
                                        value = clinicAddress,
                                        onValueChange = {
                                            clinicAddress = it
                                            if (errorMessage != null) errorMessage = null
                                        },
                                        placeholder = { Text("e.g. Lagankhel, Lalitpur (or tap Use GPS / Map Picker)") },
                                        isError = isClinicAddressError,
                                        supportingText = if (isClinicAddressError) {
                                            { Text("Required: Location cannot be blank", color = MaterialTheme.colorScheme.error, fontSize = 11.sp) }
                                        } else null,
                                        singleLine = true,
                                        modifier = Modifier.fillMaxWidth(),
                                        shape = RoundedCornerShape(10.dp)
                                    )

                                    Text(
                                        text = "Pinned GPS: (${String.format(Locale.US, "%.4f", clinicLat)}, ${String.format(Locale.US, "%.4f", clinicLng)})",
                                        fontSize = 11.sp,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant
                                    )
                                }
                            }

                            // 3. Registration Paper (Upload)
                            Surface(
                                shape = RoundedCornerShape(12.dp),
                                color = if (isClinicRegDocError) MaterialTheme.colorScheme.errorContainer.copy(alpha = 0.2f) else MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f),
                                border = BorderStroke(if (isClinicRegDocError) 1.5.dp else 1.dp, if (isClinicRegDocError) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.outlineVariant),
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .onGloballyPositioned { clinicRegDocFieldY = it.positionInRoot().y.toInt() }
                            ) {
                                Row(
                                    modifier = Modifier.padding(12.dp),
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.SpaceBetween
                                ) {
                                    Column(modifier = Modifier.weight(1f)) {
                                        Text(
                                            "Registration Paper (Upload) *",
                                            fontWeight = FontWeight.SemiBold,
                                            fontSize = 13.sp,
                                            color = if (isClinicRegDocError) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurface
                                        )
                                        Text(
                                            text = if (isClinicRegDocError) "Required: Please upload registration certificate (PDF/Image)"
                                                   else clinicRegDocName ?: "No file uploaded yet (PDF or Image)",
                                            fontSize = 11.sp,
                                            color = if (isClinicRegDocError) MaterialTheme.colorScheme.error
                                                    else if (clinicRegDocName != null) Color(0xFF047857)
                                                    else MaterialTheme.colorScheme.onSurfaceVariant,
                                            fontWeight = if (clinicRegDocName != null) FontWeight.Bold else FontWeight.Normal
                                        )
                                    }

                                    OutlinedButton(
                                        onClick = { regDocLauncher.launch("*/*") },
                                        shape = RoundedCornerShape(8.dp),
                                        contentPadding = PaddingValues(horizontal = 12.dp, vertical = 6.dp),
                                        modifier = Modifier.defaultMinSize(minHeight = 36.dp)
                                    ) {
                                        Icon(Icons.Default.UploadFile, contentDescription = null, modifier = Modifier.size(15.dp))
                                        Spacer(Modifier.width(4.dp))
                                        Text(if (clinicRegDocName != null) "Change" else "Upload", fontSize = 12.sp, fontWeight = FontWeight.Bold)
                                    }
                                }
                            }

                            // 4. PAN Number (always 9 digit)
                            OutlinedTextField(
                                value = clinicPan,
                                onValueChange = { input ->
                                    val digitsOnly = input.filter { it.isDigit() }.take(9)
                                    clinicPan = digitsOnly
                                    if (errorMessage != null) errorMessage = null
                                },
                                label = { Text("PAN Number (9 Digits Always) *") },
                                placeholder = { Text("e.g. 601234567") },
                                leadingIcon = { Icon(Icons.Default.Badge, contentDescription = null) },
                                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                                singleLine = true,
                                isError = isClinicPanError,
                                supportingText = {
                                    if (isClinicPanError) {
                                        Text(
                                            "Required: PAN must be exactly 9 digits (${cleanClinicPanDigits.length}/9)",
                                            color = MaterialTheme.colorScheme.error,
                                            fontSize = 11.sp
                                        )
                                    } else {
                                        Text(
                                            "${clinicPan.length}/9 digits" + if (clinicPan.length == 9) " ✓ Valid" else "",
                                            color = if (clinicPan.length == 9) Color(0xFF047857) else MaterialTheme.colorScheme.onSurfaceVariant,
                                            fontSize = 11.sp
                                        )
                                    }
                                },
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .focusRequester(clinicPanFocus)
                                    .onGloballyPositioned { clinicPanFieldY = it.positionInRoot().y.toInt() },
                                shape = RoundedCornerShape(12.dp)
                            )

                            // 5. Clinic Contact Number (+977 and 10 digits starting with 9)
                            OutlinedTextField(
                                value = clinicPhoneDigits,
                                onValueChange = { input ->
                                    val digitsOnly = input.filter { it.isDigit() }.take(10)
                                    clinicPhoneDigits = digitsOnly
                                    if (errorMessage != null) errorMessage = null
                                },
                                label = { Text("Clinic Contact Number *") },
                                placeholder = { Text("98xxxxxxxx (10 digits)") },
                                prefix = { Text("+977 ", fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.primary) },
                                leadingIcon = { Icon(Icons.Default.Phone, contentDescription = null) },
                                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone),
                                singleLine = true,
                                isError = isClinicPhoneError,
                                supportingText = {
                                    if (isClinicPhoneError) {
                                        Text(
                                            "Required: 10 digits starting with 9 (${cleanClinicPhoneDigits.length}/10)",
                                            color = MaterialTheme.colorScheme.error,
                                            fontSize = 11.sp
                                        )
                                    } else {
                                        Text(
                                            "Country code +977 • ${clinicPhoneDigits.length}/10 digits" + if (cleanClinicPhoneDigits.length == 10 && cleanClinicPhoneDigits.startsWith("9")) " ✓" else "",
                                            color = if (cleanClinicPhoneDigits.length == 10 && cleanClinicPhoneDigits.startsWith("9")) Color(0xFF047857) else MaterialTheme.colorScheme.onSurfaceVariant,
                                            fontSize = 11.sp
                                        )
                                    }
                                },
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .focusRequester(clinicPhoneFocus)
                                    .onGloballyPositioned { clinicPhoneFieldY = it.positionInRoot().y.toInt() },
                                shape = RoundedCornerShape(12.dp)
                            )

                            // 6. Manager Contact Number (+977 and 10 digits starting with 9)
                            OutlinedTextField(
                                value = managerPhoneDigits,
                                onValueChange = { input ->
                                    val digitsOnly = input.filter { it.isDigit() }.take(10)
                                    managerPhoneDigits = digitsOnly
                                    if (errorMessage != null) errorMessage = null
                                },
                                label = { Text("Manager Contact Number *") },
                                placeholder = { Text("98xxxxxxxx (10 digits)") },
                                prefix = { Text("+977 ", fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.primary) },
                                leadingIcon = { Icon(Icons.Default.ContactPhone, contentDescription = null) },
                                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone),
                                singleLine = true,
                                isError = isManagerPhoneError,
                                supportingText = {
                                    if (isManagerPhoneError) {
                                        Text(
                                            "Required: 10 digits starting with 9 (${cleanManagerPhoneDigits.length}/10)",
                                            color = MaterialTheme.colorScheme.error,
                                            fontSize = 11.sp
                                        )
                                    } else {
                                        Text(
                                            "Country code +977 • ${managerPhoneDigits.length}/10 digits" + if (cleanManagerPhoneDigits.length == 10 && cleanManagerPhoneDigits.startsWith("9")) " ✓" else "",
                                            color = if (cleanManagerPhoneDigits.length == 10 && cleanManagerPhoneDigits.startsWith("9")) Color(0xFF047857) else MaterialTheme.colorScheme.onSurfaceVariant,
                                            fontSize = 11.sp
                                        )
                                    }
                                },
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .focusRequester(managerPhoneFocus)
                                    .onGloballyPositioned { managerPhoneFieldY = it.positionInRoot().y.toInt() },
                                shape = RoundedCornerShape(12.dp)
                            )

                            // 7. Pictures of Clinic (1-4, up to 4 pictures total)
                            val remainingClinicSlots = (4 - clinicPictures.size).coerceAtLeast(0)
                            Surface(
                                shape = RoundedCornerShape(12.dp),
                                color = if (isClinicPicturesError) MaterialTheme.colorScheme.errorContainer.copy(alpha = 0.2f) else MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f),
                                border = BorderStroke(if (isClinicPicturesError) 1.5.dp else 1.dp, if (isClinicPicturesError) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.outlineVariant),
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .onGloballyPositioned { clinicPicturesFieldY = it.positionInRoot().y.toInt() }
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
                                                onClick = { clinicPictureLauncher.launch(remainingClinicSlots) },
                                                shape = RoundedCornerShape(8.dp),
                                                contentPadding = PaddingValues(horizontal = 12.dp, vertical = 6.dp),
                                                modifier = Modifier.defaultMinSize(minHeight = 36.dp)
                                            ) {
                                                Icon(Icons.Default.AddPhotoAlternate, contentDescription = null, modifier = Modifier.size(15.dp))
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
                                            clinicPictures.forEachIndexed { idx, picUri ->
                                                Box(
                                                    modifier = Modifier
                                                        .size(68.dp)
                                                        .clip(RoundedCornerShape(10.dp))
                                                        .border(1.dp, MaterialTheme.colorScheme.outlineVariant, RoundedCornerShape(10.dp))
                                                        .background(MaterialTheme.colorScheme.surfaceVariant)
                                                ) {
                                                    AsyncImage(
                                                        model = picUri,
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
                                                    onClick = { clinicPictureLauncher.launch(remainingClinicSlots) },
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
                                value = clinicDesc,
                                onValueChange = { clinicDesc = it },
                                label = { Text("Description") },
                                placeholder = { Text("Specialties, opening hours, facilities, etc.") },
                                maxLines = 3,
                                modifier = Modifier.fillMaxWidth(),
                                shape = RoundedCornerShape(12.dp)
                            )

                            // Facility Type
                            Text("Facility Type:", fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.spacedBy(8.dp)
                            ) {
                                FilterChip(
                                    selected = clinicType == "single_visit",
                                    onClick = { clinicType = "single_visit" },
                                    label = { Text("Single Doctor", fontSize = 11.sp) }
                                )
                                FilterChip(
                                    selected = clinicType == "multi_visit",
                                    onClick = { clinicType = "multi_visit" },
                                    label = { Text("Polyclinic", fontSize = 11.sp) }
                                )
                                FilterChip(
                                    selected = clinicType == "diagnostic_lab",
                                    onClick = { clinicType = "diagnostic_lab" },
                                    label = { Text("Diagnostic Lab", fontSize = 11.sp) }
                                )
                            }

                            // Clinic Specialties & Diagnostic Services (Multi-Select based on clinicType)
                            val allClinicSpecOptions = if (clinicType == "diagnostic_lab") {
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

                            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Text(
                                        if (clinicType == "diagnostic_lab") "Lab Services & Scans (Select Multiple):"
                                        else "Clinic Specialties (Select Multiple):",
                                        fontSize = 12.sp,
                                        fontWeight = FontWeight.SemiBold
                                    )
                                    Text(
                                        "${clinicSpecialties.size} Selected",
                                        fontSize = 11.sp,
                                        color = MaterialTheme.colorScheme.primary,
                                        fontWeight = FontWeight.Bold
                                    )
                                }
                                Text(
                                    if (clinicType == "diagnostic_lab") "Select all diagnostic tests, imaging scans, and lab services offered (e.g. MRI, CT Scan, X-Ray, Blood Tests). Patients searching for scans will match your lab."
                                    else "Select all medical departments you operate (e.g. skin, heart, child, bone). Patients searching for symptoms will match your clinic.",
                                    fontSize = 10.sp,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                )

                                allClinicSpecOptions.chunked(2).forEach { rowSpecs ->
                                    Row(
                                        modifier = Modifier.fillMaxWidth(),
                                        horizontalArrangement = Arrangement.spacedBy(6.dp)
                                    ) {
                                        rowSpecs.forEach { specName ->
                                            val isSelected = clinicSpecialties.contains(specName)
                                            FilterChip(
                                                selected = isSelected,
                                                onClick = {
                                                    clinicSpecialties = if (isSelected) {
                                                        clinicSpecialties - specName
                                                    } else {
                                                        clinicSpecialties + specName
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

                            // Terms Acceptance Checkbox Card
                            Surface(
                                shape = RoundedCornerShape(12.dp),
                                color = if (isClinicTermsError) MaterialTheme.colorScheme.errorContainer.copy(alpha = 0.2f) else MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f),
                                border = BorderStroke(if (isClinicTermsError) 1.5.dp else 1.dp, if (isClinicTermsError) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.outlineVariant),
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .onGloballyPositioned { clinicTermsFieldY = it.positionInRoot().y.toInt() }
                            ) {
                                Row(
                                    modifier = Modifier.padding(10.dp),
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                                ) {
                                    Checkbox(
                                        checked = clinicTermsAccepted,
                                        onCheckedChange = {
                                            clinicTermsAccepted = it
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
                                                onClick = {
                                                    termsDialogInitialTab = 0
                                                    showTermsDialog = true
                                                },
                                                contentPadding = PaddingValues(0.dp)
                                            ) {
                                                Text(
                                                    "Clinic Terms & Policy *",
                                                    fontSize = 12.sp,
                                                    fontWeight = FontWeight.Bold,
                                                    color = if (isClinicTermsError) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.primary
                                                )
                                            }
                                        }
                                        Text(
                                            if (isClinicTermsError) "Required: Please review and accept terms to register clinic"
                                            else "Compliant with Nepal Health Institution Standards 2077 & Google Play Policies.",
                                            fontSize = 10.sp,
                                            color = if (isClinicTermsError) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurfaceVariant,
                                            lineHeight = 14.sp
                                        )
                                    }
                                }
                            }

                            Button(
                                onClick = { submitClinicRegistration() },
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .height(52.dp),
                                shape = RoundedCornerShape(12.dp),
                                enabled = !isLoading
                            ) {
                                if (isLoading) {
                                    CircularProgressIndicator(modifier = Modifier.size(20.dp), color = MaterialTheme.colorScheme.onPrimary)
                                    Spacer(Modifier.width(8.dp))
                                    Text("Submitting...")
                                } else {
                                    Icon(Icons.Default.Check, contentDescription = null)
                                    Spacer(Modifier.width(8.dp))
                                    Text("Submit Clinic for Admin Verification", fontWeight = FontWeight.Bold)
                                }
                            }
                        }
                    }
                } else {
                    // DOCTOR / LAB TECHNICIAN FORM
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
                    val labTechnicianEducations = listOf(
                        "CMLT (Certificate in Medical Lab Technology)",
                        "DMLT (Diploma in Medical Lab Technology)",
                        "BMLT / B.Sc. MLT (Bachelor in Medical Lab Technology)",
                        "M.Sc. MLT / Clinical Biochemistry",
                        "M.Sc. Medical Microbiology",
                        "PCL in Medical Lab Technology",
                        "Certified Phlebotomy & Lab Technician"
                    )
                    val doctorEducations = if (availableQualificationsList.isNotEmpty()) {
                        availableQualificationsList.map { it.degreeName }
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
                            Text(
                                text = if (doctorPractitionerRole == "lab_technician") "Lab Technician Details" else "Doctor Details",
                                fontWeight = FontWeight.Bold,
                                fontSize = 17.sp
                            )

                            // 0. Practitioner Role (Doctor vs Lab Technician)
                            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                                Text("Practitioner Role *", fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.spacedBy(10.dp)
                                ) {
                                    FilterChip(
                                        selected = doctorPractitionerRole == "doctor",
                                        onClick = {
                                            doctorPractitionerRole = "doctor"
                                            if (doctorSpecialty.isBlank() || doctorSpecialty in labSpecializations || doctorSpecialty.contains("Technician", ignoreCase = true) || doctorSpecialty.contains("MLT", ignoreCase = true)) {
                                                doctorSpecialty = if (availableSpecialtiesList.isNotEmpty()) {
                                                    availableSpecialtiesList.firstOrNull { it.category != "system_config" && it.name.startsWith("General", ignoreCase = true) }?.name
                                                        ?: availableSpecialtiesList.firstOrNull { it.category != "system_config" }?.name
                                                        ?: "General Medicine & Physician"
                                                } else {
                                                    "General Medicine & Physician"
                                                }
                                            }
                                            if (doctorEducation in labTechnicianEducations || doctorEducation.isBlank()) {
                                                doctorEducation = doctorEducations.firstOrNull() ?: "MBBS"
                                            }
                                        },
                                        label = { Text("Doctor", fontWeight = FontWeight.SemiBold, fontSize = 13.sp) },
                                        leadingIcon = {
                                            Icon(
                                                imageVector = Icons.Default.MedicalServices,
                                                contentDescription = null,
                                                modifier = Modifier.size(16.dp)
                                            )
                                        },
                                        modifier = Modifier.weight(1f)
                                    )
                                    FilterChip(
                                        selected = doctorPractitionerRole == "lab_technician",
                                        onClick = {
                                            doctorPractitionerRole = "lab_technician"
                                            if (doctorSpecialty.isBlank() || doctorSpecialty !in labSpecializations) {
                                                doctorSpecialty = "Medical Lab Technician (MLT)"
                                            }
                                            if (doctorEducation !in labTechnicianEducations) {
                                                doctorEducation = labTechnicianEducations.first()
                                            }
                                        },
                                        label = { Text("Lab Technician", fontWeight = FontWeight.SemiBold, fontSize = 13.sp) },
                                        leadingIcon = {
                                            Icon(
                                                imageVector = Icons.Default.Biotech,
                                                contentDescription = null,
                                                modifier = Modifier.size(16.dp)
                                            )
                                        },
                                        modifier = Modifier.weight(1f)
                                    )
                                }
                            }

                            // 1. Name
                            OutlinedTextField(
                                value = doctorName,
                                onValueChange = {
                                    doctorName = it
                                    if (errorMessage != null) errorMessage = null
                                },
                                label = { Text("Full Name with Title *") },
                                placeholder = {
                                    Text(
                                        if (doctorPractitionerRole == "lab_technician") "e.g. Tech. Suman Thapa"
                                        else "e.g. Dr. Ram Bahadur Sharma"
                                    )
                                },
                                leadingIcon = { Icon(Icons.Default.Person, contentDescription = null) },
                                isError = isDoctorNameError,
                                supportingText = if (isDoctorNameError) {
                                    { Text("Required: Doctor name must be at least 3 characters", color = MaterialTheme.colorScheme.error, fontSize = 11.sp) }
                                } else null,
                                singleLine = true,
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .focusRequester(doctorNameFocus)
                                    .onGloballyPositioned { doctorNameFieldY = it.positionInRoot().y.toInt() },
                                shape = RoundedCornerShape(12.dp)
                            )

                            // 2. Gender
                            Column(
                                verticalArrangement = Arrangement.spacedBy(4.dp),
                                modifier = Modifier.onGloballyPositioned { doctorGenderFieldY = it.positionInRoot().y.toInt() }
                            ) {
                                Text(
                                    text = "Gender *" + if (isDoctorGenderError) " (Required: Select Gender)" else "",
                                    fontSize = 12.sp,
                                    fontWeight = FontWeight.SemiBold,
                                    color = if (isDoctorGenderError) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurface
                                )
                                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                    listOf("Male", "Female", "Other").forEach { g ->
                                        FilterChip(
                                            selected = doctorGender == g,
                                            onClick = { doctorGender = g },
                                            label = { Text(g, fontSize = 12.sp) },
                                            border = if (isDoctorGenderError) BorderStroke(1.dp, MaterialTheme.colorScheme.error) else null
                                        )
                                    }
                                }
                            }

                            // 3. Age & Starting Practicing Year in a Row
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.spacedBy(10.dp)
                            ) {
                                OutlinedTextField(
                                    value = doctorAge,
                                    onValueChange = {
                                        if (it.length <= 3 && it.all { ch -> ch.isDigit() }) doctorAge = it
                                        if (errorMessage != null) errorMessage = null
                                    },
                                    label = { Text("Age *") },
                                    placeholder = { Text("e.g. 38") },
                                    leadingIcon = { Icon(Icons.Default.Cake, contentDescription = null) },
                                    isError = isDoctorAgeError,
                                    supportingText = if (isDoctorAgeError) {
                                        { Text("Age: 20-100", color = MaterialTheme.colorScheme.error, fontSize = 10.sp) }
                                    } else null,
                                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                                    singleLine = true,
                                    modifier = Modifier
                                        .weight(0.38f)
                                        .focusRequester(doctorAgeFocus)
                                        .onGloballyPositioned { doctorAgeFieldY = it.positionInRoot().y.toInt() },
                                    shape = RoundedCornerShape(12.dp)
                                )

                                // Drop box for practicing since / starting year
                                ExposedDropdownMenuBox(
                                    expanded = doctorStartingYearDropdownExpanded,
                                    onExpandedChange = { doctorStartingYearDropdownExpanded = !doctorStartingYearDropdownExpanded },
                                    modifier = Modifier
                                        .weight(0.62f)
                                        .onGloballyPositioned { doctorStartingYearFieldY = it.positionInRoot().y.toInt() }
                                ) {
                                    OutlinedTextField(
                                        value = doctorStartingYear,
                                        onValueChange = {},
                                        readOnly = true,
                                        label = { Text("Practicing Since *", maxLines = 1, softWrap = false) },
                                        placeholder = { Text("Select year") },
                                        trailingIcon = {
                                            ExposedDropdownMenuDefaults.TrailingIcon(expanded = doctorStartingYearDropdownExpanded)
                                        },
                                        isError = isDoctorStartingYearError,
                                        supportingText = if (isDoctorStartingYearError) {
                                            { Text("Select year", color = MaterialTheme.colorScheme.error, fontSize = 10.sp) }
                                        } else null,
                                        singleLine = true,
                                        modifier = Modifier
                                            .menuAnchor()
                                            .fillMaxWidth(),
                                        shape = RoundedCornerShape(12.dp)
                                    )

                                    ExposedDropdownMenu(
                                        expanded = doctorStartingYearDropdownExpanded,
                                        onDismissRequest = { doctorStartingYearDropdownExpanded = false }
                                    ) {
                                        practicingYears.forEach { yr ->
                                            DropdownMenuItem(
                                                text = {
                                                    Text(
                                                        text = yr,
                                                        fontSize = 13.sp,
                                                        fontWeight = if (doctorStartingYear == yr) FontWeight.Bold else FontWeight.Normal
                                                    )
                                                },
                                                onClick = {
                                                    doctorStartingYear = yr
                                                    doctorStartingYearDropdownExpanded = false
                                                    if (errorMessage != null) errorMessage = null
                                                }
                                            )
                                        }
                                    }
                                }
                            }

                            // 4. Picture Upload
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
                                    Row(
                                        verticalAlignment = Alignment.CenterVertically,
                                        horizontalArrangement = Arrangement.spacedBy(10.dp),
                                        modifier = Modifier.weight(1f)
                                    ) {
                                        if (doctorPictureUri != null) {
                                            Box(
                                                modifier = Modifier
                                                    .size(54.dp)
                                                    .clip(RoundedCornerShape(8.dp))
                                                    .border(1.dp, MaterialTheme.colorScheme.primary, RoundedCornerShape(8.dp))
                                            ) {
                                                AsyncImage(
                                                    model = doctorPictureUri,
                                                    contentDescription = "Doctor photo preview",
                                                    contentScale = ContentScale.Crop,
                                                    modifier = Modifier.fillMaxSize()
                                                )
                                                Surface(
                                                    onClick = {
                                                        doctorPictureUri = null
                                                        doctorPictureName = null
                                                    },
                                                    shape = CircleShape,
                                                    color = Color.Black.copy(alpha = 0.7f),
                                                    modifier = Modifier
                                                        .align(Alignment.TopEnd)
                                                        .padding(2.dp)
                                                        .size(18.dp)
                                                ) {
                                                    Icon(
                                                        imageVector = Icons.Default.Close,
                                                        contentDescription = "Remove photo",
                                                        tint = Color.White,
                                                        modifier = Modifier.padding(2.dp)
                                                    )
                                                }
                                            }
                                        }

                                        Column {
                                            Text("Profile Picture / Photo", fontWeight = FontWeight.SemiBold, fontSize = 13.sp)
                                            Text(
                                                text = doctorPictureName ?: "Select profile picture",
                                                fontSize = 11.sp,
                                                color = if (doctorPictureName != null) Color(0xFF047857) else MaterialTheme.colorScheme.onSurfaceVariant,
                                                fontWeight = if (doctorPictureName != null) FontWeight.Bold else FontWeight.Normal
                                            )
                                        }
                                    }

                                    OutlinedButton(
                                        onClick = { doctorPictureLauncher.launch("image/*") },
                                        shape = RoundedCornerShape(8.dp),
                                        contentPadding = PaddingValues(horizontal = 12.dp, vertical = 6.dp),
                                        modifier = Modifier.defaultMinSize(minHeight = 36.dp)
                                    ) {
                                        Icon(Icons.Default.PhotoCamera, contentDescription = null, modifier = Modifier.size(15.dp))
                                        Spacer(Modifier.width(4.dp))
                                        Text(if (doctorPictureName != null) "Change" else "Upload", fontSize = 12.sp, fontWeight = FontWeight.Bold)
                                    }
                                }
                            }

                            // 5. Specialization
                            val docSpecOptions = if (doctorPractitionerRole == "lab_technician") {
                                labSpecializations
                            } else if (availableSpecialtiesList.isNotEmpty()) {
                                availableSpecialtiesList
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
                                expanded = doctorSpecialtyDropdownExpanded,
                                onExpandedChange = { doctorSpecialtyDropdownExpanded = !doctorSpecialtyDropdownExpanded },
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .onGloballyPositioned { doctorSpecialtyFieldY = it.positionInRoot().y.toInt() }
                            ) {
                                OutlinedTextField(
                                    value = doctorSpecialty,
                                    onValueChange = {},
                                    readOnly = true,
                                    label = {
                                        Text(
                                            if (doctorPractitionerRole == "lab_technician") "Lab Specialization *"
                                            else "Medical Specialization *"
                                        )
                                    },
                                    placeholder = {
                                        Text(
                                            if (doctorPractitionerRole == "lab_technician") "Select lab specialization"
                                            else "Select medical specialty"
                                        )
                                    },
                                    leadingIcon = {
                                        Icon(
                                            imageVector = if (doctorPractitionerRole == "lab_technician") Icons.Default.Biotech else Icons.Default.MedicalServices,
                                            contentDescription = null
                                        )
                                    },
                                    trailingIcon = {
                                        ExposedDropdownMenuDefaults.TrailingIcon(expanded = doctorSpecialtyDropdownExpanded)
                                    },
                                    isError = isDoctorSpecialtyError,
                                    supportingText = if (isDoctorSpecialtyError) {
                                        { Text("Required: Please select specialization", color = MaterialTheme.colorScheme.error, fontSize = 11.sp) }
                                    } else null,
                                    singleLine = true,
                                    modifier = Modifier
                                        .menuAnchor()
                                        .fillMaxWidth(),
                                    shape = RoundedCornerShape(12.dp)
                                )

                                ExposedDropdownMenu(
                                    expanded = doctorSpecialtyDropdownExpanded,
                                    onDismissRequest = { doctorSpecialtyDropdownExpanded = false }
                                ) {
                                    docSpecOptions.forEach { spec ->
                                        val isSelected = doctorSpecialty == spec ||
                                            (doctorSpecialty.isNotBlank() && (
                                                spec.equals(doctorSpecialty, ignoreCase = true) ||
                                                (doctorSpecialty.startsWith("General", ignoreCase = true) && spec.startsWith("General", ignoreCase = true)) ||
                                                (doctorSpecialty.contains("Lab Technician", ignoreCase = true) && spec.contains("Lab Technician", ignoreCase = true))
                                            ))
                                        DropdownMenuItem(
                                            text = {
                                                Text(
                                                    text = spec,
                                                    fontSize = 13.sp,
                                                    fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Normal
                                                )
                                            },
                                            onClick = {
                                                doctorSpecialty = spec
                                                doctorSpecialtyDropdownExpanded = false
                                                if (errorMessage != null) errorMessage = null
                                            },
                                            leadingIcon = {
                                                Icon(
                                                    imageVector = if (doctorPractitionerRole == "lab_technician") Icons.Default.Biotech else Icons.Default.MedicalServices,
                                                    contentDescription = null,
                                                    modifier = Modifier.size(16.dp),
                                                    tint = if (isSelected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant
                                                )
                                            }
                                        )
                                    }
                                }
                            }

                            // 6. Education (Dropdown / Dropbox instead of scroll buttons, options based on Doctor vs Lab Technician)
                            val docQualOptions = if (doctorPractitionerRole == "lab_technician") {
                                labTechnicianEducations
                            } else {
                                doctorEducations
                            }

                            ExposedDropdownMenuBox(
                                expanded = educationDropdownExpanded,
                                onExpandedChange = { educationDropdownExpanded = !educationDropdownExpanded },
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .onGloballyPositioned { doctorEducationFieldY = it.positionInRoot().y.toInt() }
                            ) {
                                OutlinedTextField(
                                    value = doctorEducation,
                                    onValueChange = {
                                        doctorEducation = it
                                        if (errorMessage != null) errorMessage = null
                                    },
                                    readOnly = true,
                                    label = {
                                        Text(
                                            if (doctorPractitionerRole == "lab_technician") "Lab Technician Education / Qualification *"
                                            else "Doctor Education / Qualification *"
                                        )
                                    },
                                    placeholder = {
                                        Text(
                                            if (doctorPractitionerRole == "lab_technician") "Select Lab Technician Qualification"
                                            else "Select Medical Degree / Qualification"
                                        )
                                    },
                                    leadingIcon = { Icon(Icons.Default.School, contentDescription = null) },
                                    trailingIcon = {
                                        ExposedDropdownMenuDefaults.TrailingIcon(expanded = educationDropdownExpanded)
                                    },
                                    isError = isDoctorEducationError,
                                    supportingText = if (isDoctorEducationError) {
                                        { Text("Required: Please select qualification", color = MaterialTheme.colorScheme.error, fontSize = 11.sp) }
                                    } else null,
                                    singleLine = true,
                                    modifier = Modifier
                                        .menuAnchor()
                                        .fillMaxWidth(),
                                    shape = RoundedCornerShape(12.dp)
                                )

                                ExposedDropdownMenu(
                                    expanded = educationDropdownExpanded,
                                    onDismissRequest = { educationDropdownExpanded = false }
                                ) {
                                    docQualOptions.forEach { qual ->
                                        DropdownMenuItem(
                                            text = {
                                                Text(
                                                    text = qual,
                                                    fontSize = 13.sp,
                                                    fontWeight = if (doctorEducation == qual) FontWeight.Bold else FontWeight.Normal
                                                )
                                            },
                                            onClick = {
                                                doctorEducation = qual
                                                educationDropdownExpanded = false
                                                if (errorMessage != null) errorMessage = null
                                            },
                                            leadingIcon = {
                                                Icon(
                                                    imageVector = if (doctorPractitionerRole == "lab_technician") Icons.Default.Biotech else Icons.Default.School,
                                                    contentDescription = null,
                                                    modifier = Modifier.size(16.dp),
                                                    tint = if (doctorEducation == qual) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant
                                                )
                                            }
                                        )
                                    }
                                }
                            }

                            // 7. NMC / NHPC License ID
                            OutlinedTextField(
                                value = doctorNmc,
                                onValueChange = {
                                    doctorNmc = it
                                    if (errorMessage != null) errorMessage = null
                                },
                                label = {
                                    Text(
                                        if (doctorPractitionerRole == "lab_technician") "NHPC / Lab Council License ID *"
                                        else "NMC License ID *"
                                    )
                                },
                                placeholder = {
                                    Text(
                                        if (doctorPractitionerRole == "lab_technician") "e.g. NHPC-A-4520"
                                        else "e.g. NMC-14520"
                                    )
                                },
                                leadingIcon = { Icon(Icons.Default.Badge, contentDescription = null) },
                                isError = isDoctorNmcError,
                                supportingText = if (isDoctorNmcError) {
                                    { Text("Required: Valid License ID (at least 3 characters)", color = MaterialTheme.colorScheme.error, fontSize = 11.sp) }
                                } else null,
                                singleLine = true,
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .focusRequester(doctorNmcFocus)
                                    .onGloballyPositioned { doctorNmcFieldY = it.positionInRoot().y.toInt() },
                                shape = RoundedCornerShape(12.dp)
                            )

                            // 8. Personal Mobile Number
                            OutlinedTextField(
                                value = doctorPersonalPhone,
                                onValueChange = {
                                    if (it.length <= 10 && it.all { ch -> ch.isDigit() }) doctorPersonalPhone = it
                                    if (errorMessage != null) errorMessage = null
                                },
                                label = { Text("Personal Mobile Number *") },
                                placeholder = { Text("98xxxxxxxx (10 digits)") },
                                leadingIcon = { Icon(Icons.Default.PhoneIphone, contentDescription = null) },
                                isError = isDoctorPhoneError,
                                supportingText = if (isDoctorPhoneError) {
                                    { Text("Required: Exactly 10 digits starting with 9", color = MaterialTheme.colorScheme.error, fontSize = 11.sp) }
                                } else null,
                                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone),
                                singleLine = true,
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .focusRequester(doctorPhoneFocus)
                                    .onGloballyPositioned { doctorPhoneFieldY = it.positionInRoot().y.toInt() },
                                shape = RoundedCornerShape(12.dp)
                            )

                            // 9. Public Mobile Number
                            OutlinedTextField(
                                value = doctorPublicPhone,
                                onValueChange = {
                                    if (it.length <= 10 && it.all { ch -> ch.isDigit() }) doctorPublicPhone = it
                                    if (errorMessage != null) errorMessage = null
                                },
                                label = { Text("Public Mobile Number (For Patients)") },
                                placeholder = { Text("98xxxxxxxx (10 digits)") },
                                leadingIcon = { Icon(Icons.Default.Phone, contentDescription = null) },
                                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone),
                                singleLine = true,
                                modifier = Modifier.fillMaxWidth(),
                                shape = RoundedCornerShape(12.dp)
                            )

                            // 10. Description
                            OutlinedTextField(
                                value = doctorDesc,
                                onValueChange = { doctorDesc = it },
                                label = { Text("Doctor Description / Bio") },
                                placeholder = { Text("Years of experience, special clinical interests, etc.") },
                                maxLines = 3,
                                modifier = Modifier.fillMaxWidth(),
                                shape = RoundedCornerShape(12.dp)
                            )

                            // Terms Acceptance Checkbox Card
                            Surface(
                                shape = RoundedCornerShape(12.dp),
                                color = if (isDoctorTermsError) MaterialTheme.colorScheme.errorContainer.copy(alpha = 0.2f) else MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f),
                                border = BorderStroke(if (isDoctorTermsError) 1.5.dp else 1.dp, if (isDoctorTermsError) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.outlineVariant),
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .onGloballyPositioned { doctorTermsFieldY = it.positionInRoot().y.toInt() }
                            ) {
                                Row(
                                    modifier = Modifier.padding(10.dp),
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                                ) {
                                    Checkbox(
                                        checked = doctorTermsAccepted,
                                        onCheckedChange = {
                                            doctorTermsAccepted = it
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
                                                onClick = {
                                                    termsDialogInitialTab = 1
                                                    showTermsDialog = true
                                                },
                                                contentPadding = PaddingValues(0.dp)
                                            ) {
                                                Text(
                                                    "Doctor Terms & NMC Code *",
                                                    fontSize = 12.sp,
                                                    fontWeight = FontWeight.Bold,
                                                    color = if (isDoctorTermsError) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.tertiary
                                                )
                                            }
                                        }
                                        Text(
                                            if (isDoctorTermsError) "Required: Please review and accept doctor terms to register"
                                            else "Compliant with Nepal Medical Council Act 2020 & Google Play Health Policies.",
                                            fontSize = 10.sp,
                                            color = if (isDoctorTermsError) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurfaceVariant,
                                            lineHeight = 14.sp
                                        )
                                    }
                                }
                            }

                            Button(
                                onClick = { submitDoctorRegistration() },
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .height(52.dp),
                                shape = RoundedCornerShape(12.dp),
                                colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.tertiary),
                                enabled = !isLoading
                            ) {
                                if (isLoading) {
                                    CircularProgressIndicator(modifier = Modifier.size(20.dp), color = MaterialTheme.colorScheme.onTertiary)
                                    Spacer(Modifier.width(8.dp))
                                    Text("Submitting...")
                                } else {
                                    Icon(Icons.Default.Check, contentDescription = null)
                                    Spacer(Modifier.width(8.dp))
                                    Text("Submit Doctor Profile for Admin Verification", fontWeight = FontWeight.Bold)
                                }
                            }
                        }
                    }
                }

                // Cancel & Return Option
                TextButton(
                    onClick = { resetToAuthChoice() },
                    modifier = Modifier.fillMaxWidth().padding(top = 4.dp),
                    enabled = !isLoading
                ) {
                    Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = null, modifier = Modifier.size(16.dp))
                    Spacer(Modifier.width(6.dp))
                    Text("Cancel and Return to Sign In", fontSize = 13.sp)
                }
            } else if (currentView == "pending_verification") {
                // PENDING ADMIN VERIFICATION VIEW
                val isRejected = pendingStatus.equals("rejected", ignoreCase = true)
                val isApproved = pendingStatus.equals("approved", ignoreCase = true) || pendingStatus.equals("verified", ignoreCase = true)

                Surface(
                    shape = CircleShape,
                    color = when {
                        isApproved -> MaterialTheme.colorScheme.primaryContainer
                        isRejected -> MaterialTheme.colorScheme.errorContainer
                        else -> Color(0xFFFFF3CD)
                    },
                    modifier = Modifier.size(90.dp)
                ) {
                    Box(contentAlignment = Alignment.Center) {
                        Icon(
                            imageVector = when {
                                isApproved -> Icons.Default.CheckCircle
                                isRejected -> Icons.Default.Cancel
                                else -> Icons.Default.HourglassEmpty
                            },
                            contentDescription = null,
                            tint = when {
                                isApproved -> MaterialTheme.colorScheme.primary
                                isRejected -> MaterialTheme.colorScheme.error
                                else -> Color(0xFF856404)
                            },
                            modifier = Modifier.size(50.dp)
                        )
                    }
                }

                Column(
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    Text(
                        text = when {
                            isApproved -> "Account Verified!"
                            isRejected -> "Application Rejected"
                            else -> "Verification Under Review"
                        },
                        fontSize = 22.sp,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.onBackground
                    )
                    Text(
                        text = when {
                            isApproved -> "Your credentials have been verified by the Admin. You can now access all portal features."
                            isRejected -> "Your registration was not approved by the admin team. Please contact Dactor support."
                            else -> "Your application has been received and is waiting for review by the Dactor Admin Team. Once verified, all clinic and OPD management features will unlock automatically."
                        },
                        fontSize = 13.sp,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        textAlign = TextAlign.Center,
                        lineHeight = 18.sp
                    )
                }

                Card(
                    shape = RoundedCornerShape(16.dp),
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f)),
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
                            Text("Application Details", fontWeight = FontWeight.Bold, fontSize = 15.sp)
                            Surface(
                                shape = RoundedCornerShape(8.dp),
                                color = when {
                                    isApproved -> Color(0xFFD4EDDA)
                                    isRejected -> Color(0xFFF8D7DA)
                                    else -> Color(0xFFFFF3CD)
                                }
                            ) {
                                Text(
                                    text = when {
                                        isApproved -> "APPROVED"
                                        isRejected -> "REJECTED"
                                        else -> "PENDING REVIEW"
                                    },
                                    fontSize = 11.sp,
                                    fontWeight = FontWeight.ExtraBold,
                                    color = when {
                                        isApproved -> Color(0xFF155724)
                                        isRejected -> Color(0xFF721C24)
                                        else -> Color(0xFF856404)
                                    },
                                    modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp)
                                )
                            }
                        }

                        HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.4f))

                        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                            Text("Name / Title", fontSize = 13.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            Text(pendingEntityName, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
                        }

                        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                            Text("Registered Email", fontSize = 13.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            Text(pendingEmail, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
                        }

                        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                            Text("Role", fontSize = 13.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            Text(if (pendingRole == "clinic") "Clinic Administration" else "Doctor / Specialist", fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
                        }

                        if (pendingDetails.isNotBlank()) {
                            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                Text("Details", fontSize = 13.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                Text(pendingDetails, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
                            }
                        }
                    }
                }

                // Contact Support Desk Button
                Button(
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
                    modifier = Modifier.fillMaxWidth().height(50.dp),
                    shape = RoundedCornerShape(12.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFD97706))
                ) {
                    Icon(Icons.Default.SupportAgent, contentDescription = null, tint = Color.White, modifier = Modifier.size(18.dp))
                    Spacer(modifier = Modifier.width(8.dp))
                    Text("Contact Dactor Support & Onboarding Desk", fontWeight = FontWeight.Bold, fontSize = 14.sp, color = Color.White)
                }

                Button(
                    onClick = { checkVerificationStatus() },
                    modifier = Modifier.fillMaxWidth().height(52.dp),
                    shape = RoundedCornerShape(12.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.primary),
                    enabled = !isLoading
                ) {
                    if (isLoading) {
                        CircularProgressIndicator(modifier = Modifier.size(20.dp), color = MaterialTheme.colorScheme.onPrimary, strokeWidth = 2.dp)
                        Spacer(modifier = Modifier.width(10.dp))
                        Text("Checking Status...")
                    } else {
                        Icon(Icons.Default.Refresh, contentDescription = null, modifier = Modifier.size(18.dp))
                        Spacer(modifier = Modifier.width(8.dp))
                        Text(if (isApproved) "Proceed to Portal" else "Check Verification Status", fontWeight = FontWeight.Bold, fontSize = 15.sp)
                    }
                }

                OutlinedButton(
                    onClick = {
                        sessionManager?.clearPendingVerification()
                        switchGoogleAccount()
                    },
                    modifier = Modifier.fillMaxWidth().height(48.dp),
                    shape = RoundedCornerShape(12.dp)
                ) {
                    Icon(Icons.Default.SwapHoriz, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(modifier = Modifier.width(8.dp))
                    Text("Change Account", fontWeight = FontWeight.Bold, fontSize = 14.sp)
                }

                TextButton(
                    onClick = { signOutFromPending() },
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Icon(Icons.AutoMirrored.Filled.ExitToApp, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(modifier = Modifier.width(8.dp))
                    Text("Sign Out", fontSize = 13.sp)
                }
            }
        }
    }

    // CLINIC LOCATION PICKER DIALOG
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
        com.dactor.clinic.ui.components.OpenStreetMapPicker(
            initialAddress = clinicAddress,
            initialLat = clinicLat,
            initialLng = clinicLng,
            onSaveLocation = { newAddress, newLat, newLng ->
                clinicAddress = newAddress
                clinicLat = newLat
                clinicLng = newLng
                showLocationPicker = false
            },
            onDismiss = {
                showLocationPicker = false
            }
        )
    }

    // CLINIC & DOCTOR TERMS & CONDITIONS DIALOG
    if (showTermsDialog) {
        com.dactor.clinic.ui.legal.ClinicTermsAndConditionsDialog(
            initialTab = termsDialogInitialTab,
            onAccept = {
                if (termsDialogInitialTab == 0) {
                    clinicTermsAccepted = true
                } else {
                    doctorTermsAccepted = true
                }
                showTermsDialog = false
            },
            onDismiss = {
                showTermsDialog = false
            }
        )
    }

    if (showEnableGpsDialog) {
        AlertDialog(
            onDismissRequest = { showEnableGpsDialog = false },
            icon = { Icon(Icons.Default.MyLocation, contentDescription = null, tint = MaterialTheme.colorScheme.primary) },
            title = { Text("Enable Device Location", fontWeight = FontWeight.Bold) },
            text = {
                Text(
                    "Device GPS / Location Services are currently turned off. Please turn on Location Services so the app can automatically pin your clinic's exact GPS coordinates.",
                    fontSize = 13.sp
                )
            },
            confirmButton = {
                Button(onClick = {
                    showEnableGpsDialog = false
                    try {
                        gpsSettingsLauncher.launch(android.content.Intent(android.provider.Settings.ACTION_LOCATION_SOURCE_SETTINGS))
                    } catch (e: Exception) {
                        context.startActivity(android.content.Intent(android.provider.Settings.ACTION_LOCATION_SOURCE_SETTINGS))
                    }
                }) {
                    Text("Turn On Location")
                }
            },
            dismissButton = {
                TextButton(onClick = { showEnableGpsDialog = false }) {
                    Text("Cancel")
                }
            }
        )
    }

    if (showLocationPermissionDialog) {
        AlertDialog(
            onDismissRequest = { showLocationPermissionDialog = false },
            icon = { Icon(Icons.Default.LocationOn, contentDescription = null, tint = MaterialTheme.colorScheme.primary) },
            title = { Text("Location Permission Required", fontWeight = FontWeight.Bold) },
            text = {
                Text(
                    "Dactor needs Location Permission to detect your clinic's GPS coordinates and display your location on the map. Please grant Location Permission.",
                    fontSize = 13.sp
                )
            },
            confirmButton = {
                Button(onClick = {
                    showLocationPermissionDialog = false
                    try {
                        val intent = android.content.Intent(
                            android.provider.Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                            Uri.fromParts("package", context.packageName, null)
                        )
                        context.startActivity(intent)
                    } catch (ignored: Exception) {}
                }) {
                    Text("Open Permission Settings")
                }
            },
            dismissButton = {
                TextButton(onClick = {
                    showLocationPermissionDialog = false
                    locationPermissionLauncher.launch(
                        arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION)
                    )
                }) {
                    Text("Ask Again")
                }
            }
        )
    }
}
