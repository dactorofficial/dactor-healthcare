package com.dactor.clinic

import android.app.Application
import android.content.Context
import android.util.Log
import com.dactor.clinic.service.NotificationAlarmReceiver
import com.dactor.clinic.service.NotificationHelper
import dagger.hilt.android.HiltAndroidApp

@HiltAndroidApp
class DactorClinicApp : Application() {

    override fun onCreate() {
        super.onCreate()

        // 1. Initialize SQLCipher native libraries before any Room/Database access
        try {
            net.sqlcipher.database.SQLiteDatabase.loadLibs(this)
        } catch (e: Throwable) {
            Log.e("DactorClinicApp", "Failed to load SQLCipher native libraries", e)
        }

        // 2. Permanently create notification channel in Android OS upon application startup
        try {
            NotificationHelper.createNotificationChannel(this)
        } catch (e: Throwable) {
            Log.e("DactorClinicApp", "Failed to create notification channel", e)
        }

        // 3. Start background alarm receiver for closed-app notification checks
        try {
            NotificationAlarmReceiver.startPeriodicAlarm(this)
        } catch (e: Throwable) {
            Log.e("DactorClinicApp", "Failed to start background notification alarm", e)
        }

        // 4. Local Crash Diagnostics Vault
        val defaultHandler = Thread.getDefaultUncaughtExceptionHandler()
        Thread.setDefaultUncaughtExceptionHandler { thread, throwable ->
            try {
                val prefs = getSharedPreferences("dactor_crash_vault", Context.MODE_PRIVATE)
                val stackTrace = Log.getStackTraceString(throwable)
                val timestamp = try {
                    java.time.Instant.now().toString()
                } catch (_: Throwable) {
                    java.util.Date().toString()
                }
                prefs.edit()
                    .putString("last_crash_timestamp", timestamp)
                    .putString("last_crash_message", throwable.message ?: "Unknown")
                    .putString("last_crash_stacktrace", stackTrace)
                    .apply()
            } catch (_: Throwable) {}
            defaultHandler?.uncaughtException(thread, throwable)
        }
    }
}
