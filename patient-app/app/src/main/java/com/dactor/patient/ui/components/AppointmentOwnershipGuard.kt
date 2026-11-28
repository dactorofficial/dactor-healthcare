package com.dactor.patient.ui.components

import android.widget.Toast
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Phone
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.dactor.patient.data.local.UserSessionManager
import com.dactor.patient.data.model.Appointment
import com.dactor.patient.data.repository.AppointmentRepository
import com.dactor.patient.data.repository.AuthRepository
import com.dactor.patient.ui.i18n.AppLanguage
import com.dactor.patient.ui.i18n.LocalAppLanguage
import com.google.firebase.auth.FirebaseAuth
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch

enum class ProtectedActionType {
    DOWNLOAD_BILL,
    BOOK_FOLLOWUP,
    RESCHEDULE,
    LINK_RECORD
}

/**
 * Masks a patient's name in R***n format for unverified live queue / guest views.
 */
fun maskPatientName(rawName: String?): String {
    val clean = rawName?.trim().orEmpty()
    if (clean.isBlank() || clean.equals("Confidential Patient", ignoreCase = true) || clean.equals("Patient", ignoreCase = true)) {
        return "Confidential Patient"
    }
    return clean.split(Regex("\\s+")).filter { it.isNotBlank() }.joinToString(" ") { word ->
        when {
            word.length <= 1 -> "*"
            word.length == 2 -> "${word.first()}*"
            else -> "${word.first()}${"*".repeat(minOf(4, word.length - 2))}${word.last()}"
        }
    }
}

/**
 * Masks a 10-digit mobile number to ******6789 for unverified views.
 */
fun maskMobileNumber(rawPhone: String?): String {
    val digits = rawPhone?.filter { it.isDigit() }.orEmpty()
    if (digits.length < 4) return "**********"
    return "******${digits.takeLast(4)}"
}

/**
 * Resolves the active signed-in Gmail address if the user is logged in.
 */
fun resolveActivePatientEmail(
    sessionManager: UserSessionManager?,
    authRepository: AuthRepository? = null
): String? {
    if (sessionManager != null && !sessionManager.isLoggedIn()) return null
    val fbEmail = try {
        FirebaseAuth.getInstance().currentUser?.email?.trim()?.lowercase()?.takeIf { it.isNotBlank() }
    } catch (_: Exception) {
        null
    }
    if (fbEmail != null) return fbEmail
    val savedEmail = sessionManager?.getSavedEmail()?.trim()?.lowercase()?.takeIf { it.isNotBlank() }
    if (savedEmail != null) return savedEmail
    return authRepository?.getCurrentUserEmail()?.trim()?.lowercase()?.takeIf { it.isNotBlank() }
}

/**
 * Resolves the active signed-in user's 10-digit mobile number if logged in.
 */
fun resolveActivePatientPhone(sessionManager: UserSessionManager?): String? {
    if (sessionManager == null || !sessionManager.isLoggedIn()) return null
    val digits = sessionManager.getSavedPhone()?.filter { it.isDigit() }?.takeLast(10).orEmpty()
    return digits.takeIf { it.length == 10 }
}

/**
 * Shared state controller enforcing:
 * - Logged-in Gmail user: tracking code must belong to that Gmail (if unclaimed walk-in with blank email, fallback to associated mobile).
 * - Guest user: must input the 10-digit mobile number associated with that specific tracking code.
 */
class AppointmentOwnershipController(
    private val context: android.content.Context,
    private val coroutineScope: CoroutineScope,
    private val sessionManager: UserSessionManager?,
    private val authRepository: AuthRepository?,
    private val appointmentRepository: AppointmentRepository?,
    private val isNepali: Boolean
) {
    // Verification state strictly keyed by specific tracking code (never shared across codes)
    val verifiedTrackingCodes = mutableStateMapOf<String, String>()

    var pendingTrackingCode by mutableStateOf<String?>(null)
    var pendingAppointment by mutableStateOf<Appointment?>(null)
    var pendingActionType by mutableStateOf(ProtectedActionType.DOWNLOAD_BILL)
    var pendingCallback by mutableStateOf<((verifiedPhone: String?) -> Unit)?>(null)
    var showPhoneVerifyDialog by mutableStateOf(false)
    var showGmailMismatchDialog by mutableStateOf<String?>(null)

    fun isCodeVerifiedInSession(trackingCode: String, appointment: Appointment?): Boolean {
        val codeKey = normalizeCodeKey(trackingCode, appointment)
        val activeEmail = resolveActivePatientEmail(sessionManager, authRepository)
        val activePhone = resolveActivePatientPhone(sessionManager)
        val apptPhone10 = appointment?.patientMobile?.filter { it.isDigit() }?.takeLast(10)?.takeIf { it.length == 10 }
        if (activePhone != null && apptPhone10 != null && activePhone == apptPhone10) {
            return true
        }
        if (activeEmail != null) {
            val apptEmail = appointment?.patientEmail?.trim()?.lowercase()?.takeIf { it.isNotBlank() }
            if (apptEmail != null && apptEmail == activeEmail) return true
            return verifiedTrackingCodes.containsKey(codeKey)
        }
        return verifiedTrackingCodes.containsKey(codeKey)
    }

    fun markCodeVerified(trackingCode: String, verifiedPhone: String = "verified") {
        val clean = trackingCode.trim().uppercase()
        if (clean.isNotBlank()) {
            verifiedTrackingCodes[clean] = verifiedPhone
        }
    }

    fun runProtectedAction(
        trackingCode: String,
        appointment: Appointment? = null,
        actionType: ProtectedActionType,
        onAllowed: (verifiedPhone: String?) -> Unit
    ) {
        val codeKey = normalizeCodeKey(trackingCode, appointment)
        if (codeKey.isBlank()) {
            Toast.makeText(
                context,
                if (isNepali) "ट्र्याकिङ कोड फेला परेन।" else "Tracking code not found.",
                Toast.LENGTH_SHORT
            ).show()
            return
        }

        val activeEmail = resolveActivePatientEmail(sessionManager, authRepository)
        val activePhone = resolveActivePatientPhone(sessionManager)
        val localPhone10 = appointment?.patientMobile?.filter { it.isDigit() }?.takeLast(10)?.takeIf { it.length == 10 }

        // Fast local check: if tracker device is logged in with the same mobile number, allow everything directly
        if (activePhone != null && localPhone10 != null && activePhone == localPhone10) {
            markCodeVerified(codeKey, activePhone)
            onAllowed(activePhone)
            return
        }

        // Fast local check when appointment email already matches signed-in Gmail
        val localEmail = appointment?.patientEmail?.trim()?.lowercase()?.takeIf { it.isNotBlank() }
        if (activeEmail != null && localEmail != null) {
            if (localEmail == activeEmail) {
                markCodeVerified(codeKey, "gmail")
                onAllowed(null)
                return
            } else {
                showGmailMismatchDialog = if (isNepali) {
                    "यो ट्र्याकिङ कोड (#$codeKey) अर्कै Gmail खातामा दर्ता छ। कृपया सही Gmail बाट लगइन गर्नुहोस्।"
                } else {
                    "Tracking code #$codeKey belongs to a different Gmail account. Please sign in with the registered Gmail."
                }
                return
            }
        }

        // If guest already verified THIS specific tracking code in this session, allow immediately
        val cachedPhone = verifiedTrackingCodes[codeKey]
        if (cachedPhone != null && (activeEmail == null || localEmail == null)) {
            onAllowed(cachedPhone.takeIf { it != "gmail" && it != "verified" })
            return
        }

        coroutineScope.launch {
            if (activeEmail != null && appointmentRepository != null) {
                val res = appointmentRepository.verifyAppointmentOwnership(
                    trackingCodeOrId = codeKey,
                    email = activeEmail,
                    phone = null,
                    allowBlankEmailPhoneFallback = true
                )
                if (res.allowed) {
                    markCodeVerified(codeKey, "gmail")
                    onAllowed(null)
                    return@launch
                }
                if (res.reason == "gmail_mismatch") {
                    showGmailMismatchDialog = if (isNepali) {
                        "यो ट्र्याकिङ कोड (#$codeKey) अर्कै Gmail खातामा दर्ता छ। कृपया सही Gmail बाट लगइन गर्नुहोस्।"
                    } else {
                        "Tracking code #$codeKey belongs to a different Gmail account. Please sign in with the registered Gmail."
                    }
                    return@launch
                }
                if (res.reason == "not_found") {
                    Toast.makeText(
                        context,
                        if (isNepali) "यो ट्र्याकिङ कोडको विवरण फेला परेन।" else "No appointment found for tracking code #$codeKey.",
                        Toast.LENGTH_SHORT
                    ).show()
                    return@launch
                }
                // Blank email walk-in fallback: require associated 10-digit mobile number
            }

            // Guest mode or unclaimed walk-in: prompt for associated 10-digit mobile number
            pendingTrackingCode = codeKey
            pendingAppointment = appointment
            pendingActionType = actionType
            pendingCallback = onAllowed
            showPhoneVerifyDialog = true
        }
    }

    private fun normalizeCodeKey(trackingCode: String, appointment: Appointment?): String {
        val raw = trackingCode.ifBlank { appointment?.trackingCode10Digit.orEmpty() }.ifBlank { appointment?.id.orEmpty() }
        return raw.trim().uppercase()
    }
}

@Composable
fun rememberAppointmentOwnershipController(
    sessionManager: UserSessionManager?,
    authRepository: AuthRepository?,
    appointmentRepository: AppointmentRepository?
): AppointmentOwnershipController {
    val context = LocalContext.current
    val coroutineScope = rememberCoroutineScope()
    val isNepali = LocalAppLanguage.current == AppLanguage.NEPALI
    val controller = remember(context, sessionManager, authRepository, appointmentRepository, isNepali) {
        AppointmentOwnershipController(
            context = context,
            coroutineScope = coroutineScope,
            sessionManager = sessionManager,
            authRepository = authRepository,
            appointmentRepository = appointmentRepository,
            isNepali = isNepali
        )
    }

    AppointmentOwnershipDialogs(
        controller = controller,
        appointmentRepository = appointmentRepository,
        sessionManager = sessionManager,
        authRepository = authRepository,
        isNepali = isNepali
    )
    return controller
}

@Composable
fun AppointmentOwnershipDialogs(
    controller: AppointmentOwnershipController,
    appointmentRepository: AppointmentRepository?,
    sessionManager: UserSessionManager?,
    authRepository: AuthRepository?,
    isNepali: Boolean
) {
    val coroutineScope = rememberCoroutineScope()

    controller.showGmailMismatchDialog?.let { msg ->
        AlertDialog(
            onDismissRequest = { controller.showGmailMismatchDialog = null },
            icon = { Icon(Icons.Default.Lock, contentDescription = null, tint = Color(0xFFDC2626)) },
            title = {
                Text(
                    text = if (isNepali) "पहुँच अस्वीकृत" else "Access Denied",
                    fontWeight = FontWeight.Bold,
                    fontSize = 17.sp
                )
            },
            text = { Text(msg, fontSize = 13.sp, color = Color(0xFF475569)) },
            confirmButton = {
                Button(
                    onClick = { controller.showGmailMismatchDialog = null },
                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF0284C7))
                ) {
                    Text(if (isNepali) "ठीक छ" else "OK", fontWeight = FontWeight.Bold)
                }
            }
        )
    }

    if (controller.showPhoneVerifyDialog) {
        val targetCode = controller.pendingTrackingCode.orEmpty()
        val targetAppt = controller.pendingAppointment
        var phoneInput by remember(targetCode) { mutableStateOf("") }
        var verifyError by remember(targetCode) { mutableStateOf<String?>(null) }
        var isVerifying by remember(targetCode) { mutableStateOf(false) }
        var failedCount by remember(targetCode) { mutableIntStateOf(0) }

        val actionLabel = when (controller.pendingActionType) {
            ProtectedActionType.DOWNLOAD_BILL -> if (isNepali) "बिल डाउनलोड गर्न" else "to download this bill"
            ProtectedActionType.BOOK_FOLLOWUP -> if (isNepali) "फलो-अप बुक गर्न" else "to book a follow-up"
            ProtectedActionType.RESCHEDULE -> if (isNepali) "समय परिवर्तन गर्न" else "to reschedule"
            ProtectedActionType.LINK_RECORD -> if (isNepali) "रेकर्ड जोड्न" else "to link this record"
        }

        AlertDialog(
            onDismissRequest = {
                if (!isVerifying) controller.showPhoneVerifyDialog = false
            },
            icon = { Icon(Icons.Default.Lock, contentDescription = null, tint = Color(0xFF0284C7)) },
            title = {
                Text(
                    text = if (isNepali) "मोबाइल नम्बर प्रमाणीकरण" else "Verify Mobile Number",
                    fontWeight = FontWeight.Bold,
                    fontSize = 17.sp
                )
            },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Text(
                        text = if (isNepali)
                            "कोड #$targetCode $actionLabel यस बुकिङसँग जोडिएको 10-अङ्के मोबाइल नम्बर राख्नुहोस्।"
                        else
                            "Enter the 10-digit mobile number associated with tracking code #$targetCode $actionLabel.",
                        fontSize = 12.5.sp,
                        color = Color(0xFF475569)
                    )
                    OutlinedTextField(
                        value = phoneInput,
                        onValueChange = {
                            if (it.length <= 10 && it.all { c -> c.isDigit() }) {
                                phoneInput = it
                                verifyError = null
                            }
                        },
                        label = { Text(if (isNepali) "10-अङ्के मोबाइल नम्बर" else "10-Digit Mobile Number") },
                        placeholder = { Text("98XXXXXXXX") },
                        leadingIcon = { Icon(Icons.Default.Phone, contentDescription = null, tint = Color(0xFF0284C7)) },
                        singleLine = true,
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone),
                        isError = verifyError != null,
                        shape = RoundedCornerShape(10.dp),
                        modifier = Modifier.fillMaxWidth()
                    )
                    if (verifyError != null) {
                        Text(
                            text = verifyError.orEmpty(),
                            fontSize = 11.5.sp,
                            color = MaterialTheme.colorScheme.error,
                            fontWeight = FontWeight.SemiBold
                        )
                    }
                }
            },
            confirmButton = {
                Button(
                    onClick = {
                        val clean = phoneInput.filter { it.isDigit() }
                        if (clean.length != 10) {
                            verifyError = if (isNepali) "कृपया 10-अङ्के मोबाइल नम्बर राख्नुहोस्।" else "Please enter a valid 10-digit mobile number."
                            return@Button
                        }
                        if (failedCount >= 5) {
                            verifyError = if (isNepali) "धेरै असफल प्रयास भयो। कृपया 15 मिनेटपछि प्रयास गर्नुहोस्।" else "Too many failed attempts. Please wait 15 minutes."
                            return@Button
                        }
                        isVerifying = true
                        coroutineScope.launch {
                            val activeEmail = resolveActivePatientEmail(sessionManager, authRepository)
                            val ok = if (appointmentRepository != null) {
                                val res = appointmentRepository.verifyAppointmentOwnership(
                                    trackingCodeOrId = targetCode,
                                    email = activeEmail,
                                    phone = clean,
                                    allowBlankEmailPhoneFallback = true
                                )
                                if (!res.allowed && res.reason == "rate_limited") {
                                    failedCount = 5
                                    verifyError = if (isNepali) "धेरै असफल प्रयास भयो। कृपया 15 मिनेटपछि प्रयास गर्नुहोस्।" else res.message
                                    isVerifying = false
                                    return@launch
                                }
                                res.allowed
                            } else {
                                targetAppt?.patientMobile?.filter { it.isDigit() }?.takeLast(10) == clean
                            }
                            isVerifying = false
                            if (ok) {
                                controller.markCodeVerified(targetCode, clean)
                                controller.showPhoneVerifyDialog = false
                                val cb = controller.pendingCallback
                                controller.pendingCallback = null
                                cb?.invoke(clean)
                            } else {
                                failedCount++
                                val left = (5 - failedCount).coerceAtLeast(0)
                                verifyError = if (isNepali) {
                                    "मोबाइल नम्बर मेल खाएन। बाँकी प्रयास: $left"
                                } else {
                                    "Mobile number does not match. $left attempt(s) remaining."
                                }
                            }
                        }
                    },
                    enabled = phoneInput.length == 10 && !isVerifying && failedCount < 5,
                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF0284C7))
                ) {
                    Text(
                        text = if (isVerifying) "..." else if (isNepali) "प्रमाणित गर्नुहोस्" else "Verify",
                        fontWeight = FontWeight.Bold
                    )
                }
            },
            dismissButton = {
                TextButton(
                    onClick = { controller.showPhoneVerifyDialog = false },
                    enabled = !isVerifying
                ) {
                    Text(if (isNepali) "रद्द" else "Cancel")
                }
            }
        )
    }
}
