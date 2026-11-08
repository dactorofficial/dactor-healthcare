package com.dactor.clinic.service

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.PowerManager
import com.dactor.clinic.data.local.UserSessionManager
import com.dactor.clinic.data.model.DactorNotification
import com.dactor.clinic.di.AppModule
import io.github.jan.supabase.postgrest.postgrest
import io.github.jan.supabase.postgrest.query.Order
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

class NotificationAlarmReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent?) {
        val powerManager = context.getSystemService(Context.POWER_SERVICE) as? PowerManager
        val wakeLock = powerManager?.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "dactor:ClinicAlarmWakeLock")
        wakeLock?.acquire(60_000L) // 1 minute max lock

        // Reschedule next background sync check in 30 seconds
        scheduleNextAlarm(context, 30_000L)

        val pendingResult = goAsync()
        CoroutineScope(Dispatchers.IO).launch {
            try {
                val sessionManager = UserSessionManager(context)
                val client = AppModule.provideSupabaseClient()

                val clinicId = sessionManager.getSavedClinicId()
                val doctorId = sessionManager.getSavedDoctorId()
                val email = sessionManager.getSavedEmail()?.trim()?.lowercase()
                val savedName = sessionManager.getSavedName()?.trim()
                val doctorActiveClinic = sessionManager.getSavedActiveClinicIdForDoctor()

                // Fetch recent notifications from Supabase
                val list = try {
                    client.postgrest["notifications"]
                        .select {
                            order("created_at", Order.DESCENDING)
                            limit(50)
                        }
                        .decodeList<DactorNotification>()
                } catch (_: Exception) {
                    emptyList()
                }

                val relevant = list.filter { notif ->
                    val audience = notif.targetAudience?.lowercase()
                    val isBroadcast = audience in listOf("all_clinics", "all_doctors", "all_users") || notif.type == "broadcast"
                    val matchesClinic = (!clinicId.isNullOrBlank() && notif.userId == clinicId) ||
                        (!doctorActiveClinic.isNullOrBlank() && notif.userId == doctorActiveClinic)
                    val matchesDoctor = (!doctorId.isNullOrBlank() && notif.userId == doctorId)
                    val matchesEmail = (!email.isNullOrBlank() && (
                        notif.message.contains(email, ignoreCase = true) ||
                        notif.title.contains(email, ignoreCase = true)
                    ))
                    val isActivation = notif.type == "activation_alert" && (
                        matchesClinic ||
                        matchesDoctor ||
                        matchesEmail ||
                        (!savedName.isNullOrBlank() && notif.message.contains(savedName, ignoreCase = true)) ||
                        audience == "all_clinics" ||
                        audience == "all_users"
                    )

                    matchesClinic || matchesDoctor || matchesEmail || isActivation || isBroadcast
                }

                for (notif in relevant) {
                    if (!sessionManager.isNotificationSeen(notif.id)) {
                        val notifId = (notif.id.hashCode() and 0x7FFFFFFF) % 100000
                        NotificationHelper.showSystemNotification(
                            context = context,
                            id = notifId,
                            title = notif.title.ifBlank { "Dactor Clinic Alert" },
                            message = notif.message,
                            appointmentId = notif.appointmentId
                        )
                        sessionManager.markNotificationSeen(notif.id)
                    }
                }
            } catch (e: Exception) {
                e.printStackTrace()
            } finally {
                try {
                    if (wakeLock?.isHeld == true) {
                        wakeLock.release()
                    }
                } catch (_: Exception) {}
                pendingResult.finish()
            }
        }
    }

    companion object {
        const val ACTION_CHECK_ALERTS = "com.dactor.clinic.ACTION_CHECK_ALERTS"
        private const val ALARM_REQUEST_CODE = 20091

        fun scheduleNextAlarm(context: Context, delayMillis: Long = 30_000L) {
            val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as? AlarmManager ?: return
            val intent = Intent(context, NotificationAlarmReceiver::class.java).apply {
                action = ACTION_CHECK_ALERTS
            }
            val pendingIntent = PendingIntent.getBroadcast(
                context,
                ALARM_REQUEST_CODE,
                intent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
            val triggerAtMillis = System.currentTimeMillis() + delayMillis
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && !alarmManager.canScheduleExactAlarms()) {
                        alarmManager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAtMillis, pendingIntent)
                    } else {
                        alarmManager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAtMillis, pendingIntent)
                    }
                } else {
                    alarmManager.setExact(AlarmManager.RTC_WAKEUP, triggerAtMillis, pendingIntent)
                }
            } catch (_: Exception) {
                try {
                    alarmManager.set(AlarmManager.RTC_WAKEUP, triggerAtMillis, pendingIntent)
                } catch (_: Exception) {}
            }
        }

        fun startPeriodicAlarm(context: Context) {
            scheduleNextAlarm(context, 5_000L)
        }
    }
}
