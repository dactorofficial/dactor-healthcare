package com.dactor.clinic.service

import android.content.Context
import com.dactor.clinic.data.local.UserSessionManager
import com.dactor.clinic.di.AppModule
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import io.github.jan.supabase.postgrest.postgrest
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.serialization.Serializable

@Serializable
private data class FcmTokenInsertDto(
    val user_id: String? = null,
    val clinic_id: String? = null,
    val doctor_id: String? = null,
    val token: String,
    val device_info: String? = "android_clinic_app",
    val updated_at: String? = null
)

class FcmService : FirebaseMessagingService() {

    override fun onMessageReceived(message: RemoteMessage) {
        super.onMessageReceived(message)

        val title = message.notification?.title
            ?: message.data["title"]
            ?: "Dactor Clinic Alert"

        val body = message.notification?.body
            ?: message.data["message"]
            ?: message.data["body"]
            ?: "New notification from Dactor administrative desk."

        val appointmentId = message.data["appointment_id"]
        val notificationId = (System.currentTimeMillis() % 100000).toInt()

        NotificationHelper.showSystemNotification(
            context = applicationContext,
            id = notificationId,
            title = title,
            message = body,
            appointmentId = appointmentId
        )
    }

    override fun onNewToken(token: String) {
        super.onNewToken(token)
        try {
            val prefs = applicationContext.getSharedPreferences("dactor_user_session", Context.MODE_PRIVATE)
            prefs.edit().putString("fcm_token", token).apply()

            // Register with Supabase fcm_tokens if clinic/user session exists
            CoroutineScope(Dispatchers.IO).launch {
                try {
                    val sessionManager = UserSessionManager(applicationContext)
                    val cid = sessionManager.getSavedClinicId()?.takeIf { it.isNotBlank() }
                    val docId = sessionManager.getSavedDoctorId()?.takeIf { it.isNotBlank() }
                    val client = AppModule.provideSupabaseClient()
                    client.postgrest["fcm_tokens"].upsert(
                        FcmTokenInsertDto(
                            user_id = null,
                            clinic_id = cid,
                            doctor_id = docId,
                            token = token,
                            device_info = "Android Clinic App (${android.os.Build.MODEL})",
                            updated_at = java.time.Instant.now().toString()
                        )
                    )
                } catch (e: Exception) {
                    e.printStackTrace()
                }
            }
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }
}
