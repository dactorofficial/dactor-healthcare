package com.dactor.clinic.service

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import com.dactor.clinic.MainActivity

object NotificationHelper {
    const val CHANNEL_ID = "dactor_clinic_alerts"
    const val CHANNEL_NAME = "Dactor Clinic & Staff Broadcasts"

    fun createNotificationChannel(context: Context) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val importance = NotificationManager.IMPORTANCE_HIGH
            val notificationManager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            val channel = NotificationChannel(CHANNEL_ID, CHANNEL_NAME, importance).apply {
                description = "System broadcasts and administrative alerts for clinics and doctors."
                enableVibration(true)
                enableLights(true)
            }
            notificationManager.createNotificationChannel(channel)

            val medicalChannel = NotificationChannel("dactor_medical_alerts", "Dactor Queue & Medical Alerts", importance).apply {
                description = "Queue alerts and urgent notices."
                enableVibration(true)
                enableLights(true)
            }
            notificationManager.createNotificationChannel(medicalChannel)
        }
    }

    fun showSystemNotification(
        context: Context,
        id: Int,
        title: String,
        message: String,
        appointmentId: String? = null
    ) {
        createNotificationChannel(context)

        val intent = Intent(context, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
            if (!appointmentId.isNullOrBlank()) {
                putExtra("appointment_id", appointmentId)
            }
        }

        val pendingIntent = PendingIntent.getActivity(
            context,
            id,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val builder = NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(com.dactor.clinic.R.mipmap.ic_launcher)
            .setContentTitle(title)
            .setContentText(message)
            .setStyle(NotificationCompat.BigTextStyle().bigText(message))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setDefaults(NotificationCompat.DEFAULT_ALL)
            .setContentIntent(pendingIntent)
            .setAutoCancel(true)

        try {
            NotificationManagerCompat.from(context).notify(id, builder.build())
        } catch (e: SecurityException) {
            e.printStackTrace()
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }
}
