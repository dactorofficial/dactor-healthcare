package com.dactor.patient.service

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.graphics.BitmapFactory
import android.media.AudioAttributes
import android.media.RingtoneManager
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import android.widget.RemoteViews
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import com.dactor.patient.MainActivity
import com.dactor.patient.R
import com.dactor.patient.data.model.NotificationTemplateData

object NotificationHelper {
    const val CHANNEL_ID = "dactor_medical_alerts"
    const val CHANNEL_NAME = "Dactor Doctor & Queue Alerts"

    fun createNotificationChannel(context: Context) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val importance = NotificationManager.IMPORTANCE_HIGH
            val channel = NotificationChannel(CHANNEL_ID, CHANNEL_NAME, importance).apply {
                description = "Urgent alerts for patient queue turns, doctor calls, clinic breaks, and lab reports."
                enableVibration(true)
                vibrationPattern = longArrayOf(0, 300, 200, 300)
                enableLights(true)
                lockscreenVisibility = android.app.Notification.VISIBILITY_PUBLIC
                val soundUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)
                setSound(
                    soundUri,
                    AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_NOTIFICATION_COMMUNICATION_INSTANT)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                        .build()
                )
            }
            val notificationManager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            notificationManager.createNotificationChannel(channel)

            val clinicChannel = NotificationChannel("dactor_clinic_alerts", "Dactor Clinic Broadcasts", importance).apply {
                description = "Clinic broadcasts and notices."
                enableVibration(true)
                enableLights(true)
            }
            notificationManager.createNotificationChannel(clinicChannel)

            // Remove annoying foreground watchdog sync channel and dismiss ongoing watchdog notification
            try {
                notificationManager.deleteNotificationChannel("dactor_background_sync")
                notificationManager.cancel(99101)
            } catch (_: Exception) {}
        }
    }

    fun showSystemNotification(
        context: Context,
        id: Int,
        title: String,
        message: String,
        appointmentId: String? = null,
        type: String = "queue_alert",
        estimatedTimeLeft: String? = null,
        expectedTime: String? = null
    ) {
        createNotificationChannel(context)

        val parsed = NotificationTemplateData.fromNotification(title, message, type)
        val displayTitle = parsed.title
        val displayBody = parsed.cleanMessage
        val isArriveFast = parsed.rightValue.contains("arrive fast", ignoreCase = true) ||
            parsed.leftValue.contains("arrive fast", ignoreCase = true)
        val leftLabel = parsed.leftLabel
        val leftVal = if (isArriveFast) "Arrive Fast" else (estimatedTimeLeft?.takeIf { it.isNotBlank() } ?: parsed.leftValue)
        val rightVal = if (isArriveFast) "Your turn, arrive fast" else (expectedTime?.takeIf { it.isNotBlank() } ?: parsed.rightValue)
        val rightLabel = if (isArriveFast || rightVal.contains("arrive fast", ignoreCase = true)) "Turn Status" else parsed.rightLabel

        val intent = Intent(context, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_NEW_TASK
            putExtra("appointment_id", appointmentId ?: parsed.trackingCode)
            putExtra("navigate_to", "notifications")
        }

        val pendingIntent = PendingIntent.getActivity(
            context,
            id,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val soundUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)

        val collapsedView = RemoteViews(context.packageName, R.layout.notification_dactor_collapsed).apply {
            setTextViewText(R.id.notif_title, displayTitle)
            setTextViewText(R.id.notif_body, displayBody)
        }

        val formattedRightVal = if (rightLabel.contains("Appointment", ignoreCase = true) || rightLabel.contains("Slot", ignoreCase = true)) {
            NotificationTemplateData.calculateApproximateSlotWindow(rightVal, 10, includeTolerance = true)
        } else {
            rightVal
        }

        val expandedView = RemoteViews(context.packageName, R.layout.notification_dactor_expanded).apply {
            setTextViewText(R.id.notif_title, displayTitle)
            setTextViewText(R.id.notif_body, displayBody)

            // Only show 2-column queue metrics container for queue status reminder notifications or when arriving fast!
            if (parsed.isQueueReminder || isArriveFast) {
                setViewVisibility(R.id.notif_metrics_container, android.view.View.VISIBLE)
                setTextViewText(R.id.notif_left_label, leftLabel)
                setTextViewText(R.id.notif_left_value, leftVal)
                setTextViewText(R.id.notif_right_label, rightLabel)
                setTextViewText(R.id.notif_right_value, formattedRightVal)
            } else {
                setViewVisibility(R.id.notif_metrics_container, android.view.View.GONE)
            }
        }

        val builder = NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(R.drawable.app_logo)
            .setColor(androidx.core.content.ContextCompat.getColor(context, R.color.primary))
            .setContentTitle(displayTitle)
            .setContentText(displayBody)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setSound(soundUri)
            .setVibrate(longArrayOf(0, 300, 200, 300))
            .setDefaults(NotificationCompat.DEFAULT_ALL)
            .setContentIntent(pendingIntent)
            .setAutoCancel(true)

        if (parsed.isQueueReminder || isArriveFast) {
            builder.setStyle(NotificationCompat.DecoratedCustomViewStyle())
                .setCustomContentView(collapsedView)
                .setCustomBigContentView(expandedView)
                .setCustomHeadsUpContentView(expandedView)
        } else {
            builder.setStyle(NotificationCompat.BigTextStyle().bigText(displayBody))
        }

        // Add contextual 1-tap action buttons directly in Android Notification Tray
        val notifType = com.dactor.patient.data.model.NotificationType.from(type)
        when (notifType) {
            com.dactor.patient.data.model.NotificationType.QUEUE_ALERT,
            com.dactor.patient.data.model.NotificationType.ARRIVE_SOON,
            com.dactor.patient.data.model.NotificationType.WAIT_FEW_MINUTES,
            com.dactor.patient.data.model.NotificationType.WAIT_FEW_MINS,
            com.dactor.patient.data.model.NotificationType.DOCTOR_ARRIVAL -> {
                val trackIntent = Intent(context, MainActivity::class.java).apply {
                    flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_NEW_TASK
                    putExtra("appointment_id", appointmentId ?: parsed.trackingCode)
                    putExtra("navigate_to", "tracker")
                }
                val trackPending = PendingIntent.getActivity(
                    context,
                    id * 10 + 1,
                    trackIntent,
                    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
                )
                builder.addAction(R.drawable.ic_notif_people, "Track Live Queue", trackPending)
            }
            com.dactor.patient.data.model.NotificationType.EARLY_ARRIVAL -> {
                val acceptIntent = Intent(context, MainActivity::class.java).apply {
                    flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_NEW_TASK
                    putExtra("appointment_id", appointmentId ?: parsed.trackingCode)
                    putExtra("navigate_to", "tracker")
                }
                val acceptPending = PendingIntent.getActivity(
                    context,
                    id * 10 + 2,
                    acceptIntent,
                    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
                )
                builder.addAction(R.drawable.ic_notif_calendar_clock, "Coming Now", acceptPending)
            }
            com.dactor.patient.data.model.NotificationType.LAB_REPORT -> {
                val labIntent = Intent(context, MainActivity::class.java).apply {
                    flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_NEW_TASK
                    putExtra("appointment_id", appointmentId ?: parsed.trackingCode)
                    putExtra("navigate_to", "notifications")
                }
                val labPending = PendingIntent.getActivity(
                    context,
                    id * 10 + 3,
                    labIntent,
                    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
                )
                builder.addAction(R.drawable.ic_notif_calendar_clock, "View Report", labPending)
            }
            com.dactor.patient.data.model.NotificationType.DOCTOR_NOT_ARRIVED,
            com.dactor.patient.data.model.NotificationType.DOCTOR_DELAYED,
            com.dactor.patient.data.model.NotificationType.CLINIC_BREAK,
            com.dactor.patient.data.model.NotificationType.DOCTOR_STATUS -> {
                val statusIntent = Intent(context, MainActivity::class.java).apply {
                    flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_NEW_TASK
                    putExtra("appointment_id", appointmentId ?: parsed.trackingCode)
                    putExtra("navigate_to", "tracker")
                }
                val statusPending = PendingIntent.getActivity(
                    context,
                    id * 10 + 4,
                    statusIntent,
                    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
                )
                builder.addAction(R.drawable.ic_notif_people, "Check Status", statusPending)
            }
            else -> {}
        }

        try {
            NotificationManagerCompat.from(context).notify(id, builder.build())
        } catch (e: SecurityException) {
            e.printStackTrace()
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    fun requestIgnoreBatteryOptimizations(context: Context) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                val powerManager = context.getSystemService(Context.POWER_SERVICE) as PowerManager
                if (!powerManager.isIgnoringBatteryOptimizations(context.packageName)) {
                    val intent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
                        data = Uri.parse("package:${context.packageName}")
                        flags = Intent.FLAG_ACTIVITY_NEW_TASK
                    }
                    context.startActivity(intent)
                }
            }
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    fun cancelNotification(context: Context, id: Int) {
        try {
            val notificationManager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            notificationManager.cancel(id)
        } catch (_: Exception) {}
    }

    fun cancelAppointmentNotifications(context: Context, appointmentId: String) {
        if (appointmentId.isBlank()) return
        try {
            val notificationManager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            val baseId = (appointmentId.hashCode() and 0x7FFFFFFF) % 100000
            val todayKeyId = ("auto_appt_today_$appointmentId".hashCode() and 0x7FFFFFFF) % 100000
            val pos1KeyId = ("auto_qpos_${appointmentId}_1".hashCode() and 0x7FFFFFFF) % 100000
            val pos2KeyId = ("auto_qpos_${appointmentId}_2".hashCode() and 0x7FFFFFFF) % 100000
            val insideKeyId = ("auto_inside_$appointmentId".hashCode() and 0x7FFFFFFF) % 100000
            notificationManager.cancel(baseId)
            notificationManager.cancel(todayKeyId)
            notificationManager.cancel(pos1KeyId)
            notificationManager.cancel(pos2KeyId)
            notificationManager.cancel(insideKeyId)
        } catch (_: Exception) {}
    }
}

