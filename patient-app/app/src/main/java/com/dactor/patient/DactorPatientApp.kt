package com.dactor.patient

import android.app.Application
import android.content.Intent
import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import com.dactor.patient.service.NotificationAlarmReceiver
import com.dactor.patient.service.NotificationHelper
import com.dactor.patient.service.NotificationSyncWorker
import com.dactor.patient.service.NotificationWatchdogService
import dagger.hilt.android.HiltAndroidApp
import java.util.concurrent.TimeUnit

@HiltAndroidApp
class DactorPatientApp : Application() {

    override fun onCreate() {
        super.onCreate()

        // 1. Permanently register high-importance notification channel in Android OS
        NotificationHelper.createNotificationChannel(this)

        // 2. Schedule background periodic WorkManager to check for notifications even when app is closed/killed
        try {
            val constraints = Constraints.Builder()
                .setRequiredNetworkType(NetworkType.CONNECTED)
                .build()

            val syncWorkRequest = PeriodicWorkRequestBuilder<NotificationSyncWorker>(
                15, TimeUnit.MINUTES
            ).setConstraints(constraints).build()

            WorkManager.getInstance(this).enqueueUniquePeriodicWork(
                "DactorNotificationSyncWork",
                ExistingPeriodicWorkPolicy.KEEP,
                syncWorkRequest
            )
        } catch (e: Exception) {
            e.printStackTrace()
        }

        // 3. Start resilient AlarmManager background receiver for closed-app notification delivery
        try {
            NotificationAlarmReceiver.startPeriodicAlarm(this)
        } catch (e: Exception) {
            e.printStackTrace()
        }

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
