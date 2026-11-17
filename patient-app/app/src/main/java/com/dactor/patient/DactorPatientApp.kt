package com.dactor.patient

import android.app.Application
import android.content.Intent
import com.dactor.patient.service.NotificationHelper
import com.dactor.patient.service.NotificationWatchdogService
import dagger.hilt.android.HiltAndroidApp

@HiltAndroidApp
class DactorPatientApp : Application() {

    override fun onCreate() {
        super.onCreate()

        // 1. Permanently register high-importance notification channel in Android OS
        NotificationHelper.createNotificationChannel(this)

        // Background checks and the appointment-window loop are scheduled by
        // AppointmentAlarmPlanner only for patients with an upcoming appointment.

        // 4. Clean up any leftover foreground watchdog notifications
        try {
            val nm = getSystemService(android.content.Context.NOTIFICATION_SERVICE) as? android.app.NotificationManager
            nm?.cancel(99101)
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
                nm?.deleteNotificationChannel("dactor_background_sync")
            }
        } catch (_: Exception) {}
    }
}
