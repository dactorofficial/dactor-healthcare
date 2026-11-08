package com.dactor.clinic.di

import android.content.Context
import com.dactor.clinic.data.local.ClinicDatabase
import com.dactor.clinic.data.local.dao.AppointmentDao
import com.dactor.clinic.data.local.dao.BillingDao
import com.dactor.clinic.data.local.dao.QueueDao
import com.dactor.clinic.data.local.dao.SyncMetadataDao
import com.dactor.clinic.data.local.security.DatabaseKeyManager
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
object DatabaseModule {

    @Provides
    @Singleton
    fun provideClinicDatabase(
        @ApplicationContext context: Context,
        keyManager: DatabaseKeyManager
    ): ClinicDatabase {
        return ClinicDatabase.buildDatabase(context, keyManager)
    }

    @Provides
    fun provideAppointmentDao(db: ClinicDatabase): AppointmentDao = db.appointmentDao()

    @Provides
    fun provideBillingDao(db: ClinicDatabase): BillingDao = db.billingDao()

    @Provides
    fun provideQueueDao(db: ClinicDatabase): QueueDao = db.queueDao()

    @Provides
    fun provideSyncMetadataDao(db: ClinicDatabase): SyncMetadataDao = db.syncMetadataDao()
}
