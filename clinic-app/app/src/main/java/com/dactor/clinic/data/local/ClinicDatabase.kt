package com.dactor.clinic.data.local

import android.content.Context
import android.util.Log
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase
import com.dactor.clinic.data.local.dao.AppointmentDao
import com.dactor.clinic.data.local.dao.BillingDao
import com.dactor.clinic.data.local.dao.QueueDao
import com.dactor.clinic.data.local.dao.SyncMetadataDao
import com.dactor.clinic.data.local.entity.AppointmentEntity
import com.dactor.clinic.data.local.entity.BillingInvoiceEntity
import com.dactor.clinic.data.local.entity.InvoiceTransactionEntity
import com.dactor.clinic.data.local.entity.QueueEntryEntity
import com.dactor.clinic.data.local.entity.SyncMetadataEntity
import com.dactor.clinic.data.local.security.DatabaseKeyManager
import net.sqlcipher.database.SQLiteDatabase
import net.sqlcipher.database.SupportFactory

@Database(
    entities = [
        AppointmentEntity::class,
        BillingInvoiceEntity::class,
        InvoiceTransactionEntity::class,
        QueueEntryEntity::class,
        SyncMetadataEntity::class
    ],
    version = 1,
    exportSchema = false
)
abstract class ClinicDatabase : RoomDatabase() {

    abstract fun appointmentDao(): AppointmentDao
    abstract fun billingDao(): BillingDao
    abstract fun queueDao(): QueueDao
    abstract fun syncMetadataDao(): SyncMetadataDao

    companion object {
        const val DATABASE_NAME = "dactor_clinic_encrypted.db"
        private const val TAG = "ClinicDatabase"

        fun buildDatabase(context: Context, keyManager: DatabaseKeyManager): ClinicDatabase {
            val appContext = context.applicationContext
            val passphrase = keyManager.getOrCreatePassphrase()
            val supportFactory = SupportFactory(passphrase)

            // Pre-flight check: verify if existing database can be opened with the passphrase.
            // If the Keystore was invalidated or rotated during an app update, delete the stale database
            // so Room can cleanly create a fresh encrypted DB rather than crashing the app on startup.
            try {
                try {
                    SQLiteDatabase.loadLibs(appContext)
                } catch (_: Throwable) {}

                val dbFile = appContext.getDatabasePath(DATABASE_NAME)
                if (dbFile.exists()) {
                    try {
                        val testDb = SQLiteDatabase.openOrCreateDatabase(dbFile.absolutePath, passphrase, null)
                        testDb.rawQuery("PRAGMA user_version;", null)?.use { it.moveToFirst() }
                        testDb.close()
                    } catch (e: Exception) {
                        Log.e(TAG, "Database passphrase mismatch or corruption after app update. Resetting local encrypted DB.", e)
                        appContext.deleteDatabase(DATABASE_NAME)
                    }
                }
            } catch (t: Throwable) {
                Log.w(TAG, "Pre-flight database check error: ${t.message}", t)
            }

            return Room.databaseBuilder(
                appContext,
                ClinicDatabase::class.java,
                DATABASE_NAME
            )
                .openHelperFactory(supportFactory)
                .fallbackToDestructiveMigration()
                .build()
        }
    }
}
