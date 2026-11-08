package com.dactor.clinic.data.sync

import android.content.Context
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import androidx.work.workDataOf
import dagger.hilt.EntryPoint
import dagger.hilt.InstallIn
import dagger.hilt.android.EntryPointAccessors
import dagger.hilt.components.SingletonComponent
import java.util.concurrent.TimeUnit

class SyncWorker(
    appContext: Context,
    workerParams: WorkerParameters
) : CoroutineWorker(appContext, workerParams) {

    @EntryPoint
    @InstallIn(SingletonComponent::class)
    interface SyncWorkerEntryPoint {
        fun syncEngine(): SyncEngine
    }

    override suspend fun doWork(): Result {
        val clinicId = inputData.getString(KEY_CLINIC_ID)
        if (clinicId.isNullOrBlank()) {
            return Result.failure()
        }

        return try {
            val entryPoint = EntryPointAccessors.fromApplication(
                applicationContext,
                SyncWorkerEntryPoint::class.java
            )
            val syncEngine = entryPoint.syncEngine()
            val success = syncEngine.syncAll(clinicId)

            if (success) {
                Result.success()
            } else {
                Result.retry()
            }
        } catch (e: Exception) {
            e.printStackTrace()
            Result.retry()
        }
    }

    companion object {
        const val KEY_CLINIC_ID = "sync_clinic_id"
        private const val UNIQUE_PERIODIC_WORK = "dactor_clinic_periodic_sync"
        private const val UNIQUE_ONE_TIME_WORK = "dactor_clinic_immediate_sync"

        /**
         * Enqueues immediate one-time sync when connectivity resumes or user requests refresh.
         */
        fun enqueueOneTimeSync(context: Context, clinicId: String) {
            if (clinicId.isBlank()) return

            val constraints = Constraints.Builder()
                .setRequiredNetworkType(NetworkType.CONNECTED)
                .build()

            val request = OneTimeWorkRequestBuilder<SyncWorker>()
                .setConstraints(constraints)
                .setInputData(workDataOf(KEY_CLINIC_ID to clinicId))
                .build()

            WorkManager.getInstance(context).enqueueUniqueWork(
                UNIQUE_ONE_TIME_WORK,
                ExistingWorkPolicy.REPLACE,
                request
            )
        }

        /**
         * Enqueues periodic background sync (every 15 minutes when connected to network).
         */
        fun enqueuePeriodicSync(context: Context, clinicId: String) {
            if (clinicId.isBlank()) return

            val constraints = Constraints.Builder()
                .setRequiredNetworkType(NetworkType.CONNECTED)
                .build()

            val request = PeriodicWorkRequestBuilder<SyncWorker>(15, TimeUnit.MINUTES)
                .setConstraints(constraints)
                .setInputData(workDataOf(KEY_CLINIC_ID to clinicId))
                .build()

            WorkManager.getInstance(context).enqueueUniquePeriodicWork(
                UNIQUE_PERIODIC_WORK,
                ExistingPeriodicWorkPolicy.KEEP,
                request
            )
        }
    }
}
