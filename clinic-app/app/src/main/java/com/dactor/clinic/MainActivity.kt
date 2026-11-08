package com.dactor.clinic

import android.content.Context
import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.ui.Modifier
import androidx.lifecycle.lifecycleScope
import com.dactor.clinic.data.local.RegistrationDraftManager
import com.dactor.clinic.data.model.Clinic
import com.dactor.clinic.data.model.Doctor
import com.dactor.clinic.data.repository.*
import com.dactor.clinic.data.security.AuthDeepLinkValidator
import com.dactor.clinic.ui.navigation.DactorClinicNavHost
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import android.os.Build
import com.dactor.clinic.service.NotificationHelper
import com.google.firebase.messaging.FirebaseMessaging
import io.github.jan.supabase.postgrest.postgrest
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.serialization.Serializable
import java.util.UUID
import javax.inject.Inject

@Serializable
private data class ClinicFcmTokenDto(
    val user_id: String? = null,
    val token: String,
    val device_info: String? = null,
    val updated_at: String? = null
)

@AndroidEntryPoint
class MainActivity : ComponentActivity() {

    @Inject lateinit var authRepository: AuthRepository
    @Inject lateinit var clinicRepository: ClinicRepository
    @Inject lateinit var doctorRepository: DoctorRepository
    @Inject lateinit var appointmentRepository: AppointmentRepository
    @Inject lateinit var queueRepository: QueueRepository
    @Inject lateinit var billingRepository: BillingRepository
    @Inject lateinit var labReportRepository: LabReportRepository
    @Inject lateinit var slotRepository: SlotRepository
    @Inject lateinit var invitationRepository: InvitationRepository
    @Inject lateinit var notificationRepository: NotificationRepository
    @Inject lateinit var draftManager: RegistrationDraftManager
    @Inject lateinit var sessionManager: com.dactor.clinic.data.local.UserSessionManager
    @Inject lateinit var appUpdateRepository: AppUpdateRepository

    private val seenNotifIds = mutableSetOf<String>()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        handleDeepLink(intent)

        // 1. Initialize Notification Channel safely
        try {
            NotificationHelper.createNotificationChannel(this)
        } catch (t: Throwable) {
            t.printStackTrace()
        }

        // 2. Request Android 13+ Notification Permission safely
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                if (checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) != android.content.pm.PackageManager.PERMISSION_GRANTED) {
                    requestPermissions(arrayOf(android.Manifest.permission.POST_NOTIFICATIONS), 102)
                }
            }
        } catch (t: Throwable) {
            t.printStackTrace()
        }

        // 3. Register Firebase Cloud Messaging and upload token to Supabase fcm_tokens
        try {
            FirebaseMessaging.getInstance().token.addOnCompleteListener { task ->
                if (task.isSuccessful) {
                    val token = task.result
                    if (!token.isNullOrBlank()) {
                        getSharedPreferences("dactor_user_session", Context.MODE_PRIVATE)
                            .edit().putString("fcm_token", token).apply()
                        lifecycleScope.launch(Dispatchers.IO) {
                            try {
                                val targetId = sessionManager.getSavedClinicId().takeIf { !it.isNullOrBlank() }
                                    ?: sessionManager.getSavedDoctorId()
                                    ?: authRepository.getCurrentUser()
                                val client = com.dactor.clinic.di.AppModule.provideSupabaseClient()
                                val deviceInfo = "Android Clinic App ${Build.VERSION.RELEASE} (${Build.MANUFACTURER} ${Build.MODEL})"
                                val nowIso = java.time.Instant.now().toString()
                                client.postgrest["fcm_tokens"].upsert(
                                    ClinicFcmTokenDto(
                                        user_id = targetId,
                                        token = token,
                                        device_info = deviceInfo,
                                        updated_at = nowIso
                                    )
                                )
                            } catch (e: Exception) {
                                e.printStackTrace()
                            }
                        }
                    }
                }
            }
            FirebaseMessaging.getInstance().subscribeToTopic("all_users")
            FirebaseMessaging.getInstance().subscribeToTopic("all_clinics")
            FirebaseMessaging.getInstance().subscribeToTopic("all_doctors")
            val cid = sessionManager.getSavedClinicId()
            if (!cid.isNullOrBlank()) {
                FirebaseMessaging.getInstance().subscribeToTopic("clinic_$cid")
            }
        } catch (e: Exception) {
            e.printStackTrace()
        }

        // 4. Start background watcher for broadcast and staff alerts while activity is alive
        lifecycleScope.launch(Dispatchers.IO) {
            var isFirstPoll = true
            while (isActive) {
                try {
                    val userId = authRepository.getCurrentUser()
                    val notifs = notificationRepository.getNotifications(userId = userId)
                    val fifteenMinutesAgoMs = System.currentTimeMillis() - (15 * 60 * 1000L)

                    for (notif in notifs) {
                        if (seenNotifIds.contains(notif.id)) continue

                        val createdEpochMs = try {
                            if (!notif.createdAt.isNullOrBlank()) {
                                java.time.Instant.parse(notif.createdAt).toEpochMilli()
                            } else 0L
                        } catch (_: Exception) {
                            0L
                        }
                        val isCreatedRecently = createdEpochMs >= fifteenMinutesAgoMs

                        if (isFirstPoll && !isCreatedRecently) {
                            seenNotifIds.add(notif.id)
                            continue
                        }

                        val notifId = (notif.id.hashCode() and 0x7FFFFFFF) % 100000
                        NotificationHelper.showSystemNotification(
                            context = this@MainActivity,
                            id = notifId,
                            title = notif.title.ifBlank { "Dactor Clinic Alert" },
                            message = notif.message
                        )
                        seenNotifIds.add(notif.id)
                    }
                    isFirstPoll = false
                } catch (e: Exception) {
                    e.printStackTrace()
                }
                delay(4000L)
            }
        }
        setContent {
            com.dactor.clinic.ui.theme.DactorClinicTheme {
                Surface(
                    modifier = Modifier
                        .fillMaxSize()
                        .navigationBarsPadding(),
                    color = MaterialTheme.colorScheme.background
                ) {
                    com.dactor.clinic.ui.components.NetworkConnectivityGate {
                        com.dactor.clinic.ui.components.AppUpdateGate(appUpdateRepository = appUpdateRepository) {
                            com.dactor.clinic.ui.components.NotificationPermissionEnforcer()
                            DactorClinicNavHost(
                                authRepository = authRepository,
                                clinicRepository = clinicRepository,
                                doctorRepository = doctorRepository,
                                appointmentRepository = appointmentRepository,
                                queueRepository = queueRepository,
                                billingRepository = billingRepository,
                                labReportRepository = labReportRepository,
                                slotRepository = slotRepository,
                                invitationRepository = invitationRepository,
                                draftManager = draftManager,
                                sessionManager = sessionManager
                            )
                        }
                    }
                }
            }
        }
    }

    override fun onResume() {
        super.onResume()
        try {
            appUpdateRepository.resumeImmediateUpdateIfInProgress(this)
        } catch (t: Throwable) {
            t.printStackTrace()
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        handleDeepLink(intent)
    }

    private fun handleDeepLink(intent: Intent?) {
        val uri = intent?.data ?: return

        // R1: Pre-validate URI strictly against dactor://auth/callback
        val validation = AuthDeepLinkValidator.validate(uri.toString())
        if (validation !is AuthDeepLinkValidator.ValidationResult.Valid) {
            return
        }

        lifecycleScope.launch(Dispatchers.IO) {
            try {
                // R1 & R3: Execute deep link auth callback and verify live session
                val handled = authRepository.handleAuthCallback(uri)
                if (!handled) {
                    return@launch
                }

                // R3: Strictly verify active authenticated user session
                val currentUserId = authRepository.getCurrentUserId() ?: authRepository.getCurrentUser()
                if (currentUserId.isNullOrBlank()) {
                    return@launch
                }
                val currentUserEmail = authRepository.getCurrentUserEmail()?.lowercase() ?: ""

                // R2 & R3: Sync Clinic Draft (strictly pending_verification, bound to verified user)
                val clinicDraft = draftManager.getClinicDraft()
                if (clinicDraft != null) {
                    val clinicEmail = if (currentUserEmail.isNotBlank()) currentUserEmail else clinicDraft.email.trim().lowercase()
                    val clinic = Clinic(
                        id = UUID.randomUUID().toString(),
                        name = clinicDraft.name.trim(),
                        type = clinicDraft.type,
                        verificationStatus = "pending_verification",
                        contactPhone = clinicDraft.phone.trim(),
                        contactEmail = clinicEmail,
                        addressText = clinicDraft.address.trim(),
                        latitude = clinicDraft.latitude,
                        longitude = clinicDraft.longitude,
                        autoNotifyThreshold = 2,
                        description = clinicDraft.description?.trim()?.ifBlank { null }
                    )
                    clinicRepository.createClinic(clinic)
                    authRepository.syncProfile(
                        authUid = currentUserId,
                        email = clinicEmail,
                        fullName = clinicDraft.name.trim(),
                        role = "clinic_admin"
                    )
                    draftManager.clearClinicDraft()
                }

                // R2 & R3: Sync Doctor Draft (strictly pending, never NMC-VERIFIED, bound to verified user)
                val doctorDraft = draftManager.getDoctorDraft()
                if (doctorDraft != null) {
                    val doctorEmail = if (currentUserEmail.isNotBlank()) currentUserEmail else doctorDraft.email.trim().lowercase()
                    val doctor = Doctor(
                        id = UUID.randomUUID().toString(),
                        userId = currentUserId,
                        fullName = doctorDraft.fullName.trim(),
                        email = doctorEmail,
                        specialty = doctorDraft.specialty.trim(),
                        nmcLicenseNumber = "PENDING",
                        kycStatus = "pending",
                        isInClinic = false,
                        consultationFee = doctorDraft.fee
                    )
                    doctorRepository.createDoctor(doctor)
                    authRepository.syncProfile(
                        authUid = currentUserId,
                        email = doctorEmail,
                        fullName = doctorDraft.fullName.trim(),
                        role = "doctor"
                    )
                    draftManager.clearDoctorDraft()
                }
            } catch (e: Exception) {
                e.printStackTrace()
            }
        }
    }
}
