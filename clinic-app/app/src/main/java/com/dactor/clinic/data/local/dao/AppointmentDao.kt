package com.dactor.clinic.data.local.dao

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Update
import com.dactor.clinic.data.local.entity.AppointmentEntity
import kotlinx.coroutines.flow.Flow

@Dao
interface AppointmentDao {

    @Query("SELECT * FROM appointments WHERE clinic_id = :clinicId AND appointment_date = :date AND is_deleted = 0 ORDER BY appointment_time ASC")
    fun getAppointmentsForDate(clinicId: String, date: String): Flow<List<AppointmentEntity>>

    @Query("SELECT * FROM appointments WHERE clinic_id = :clinicId AND appointment_date = :date AND is_deleted = 0 ORDER BY appointment_time ASC")
    suspend fun getAppointmentsForDateList(clinicId: String, date: String): List<AppointmentEntity>

    @Query("SELECT * FROM appointments WHERE clinic_id = :clinicId AND doctor_id = :doctorId AND appointment_date = :date AND is_deleted = 0 ORDER BY appointment_time ASC")
    fun getAppointmentsForDoctorAndDate(clinicId: String, doctorId: String, date: String): Flow<List<AppointmentEntity>>

    @Query("SELECT * FROM appointments WHERE id = :id AND is_deleted = 0 LIMIT 1")
    suspend fun getAppointmentById(id: String): AppointmentEntity?

    @Query("SELECT * FROM appointments WHERE tracking_code_10_digit = :trackingCode AND is_deleted = 0 LIMIT 1")
    suspend fun getAppointmentByTrackingCode(trackingCode: String): AppointmentEntity?

    @Query("SELECT * FROM appointments WHERE clinic_id = :clinicId AND is_deleted = 0 AND (patient_name LIKE '%' || :query || '%' OR patient_mobile LIKE '%' || :query || '%' OR tracking_code_10_digit LIKE '%' || :query || '%') LIMIT 50")
    suspend fun searchPatients(clinicId: String, query: String): List<AppointmentEntity>

    @Query("SELECT * FROM appointments WHERE sync_status != 'synced'")
    suspend fun getPendingSyncAppointments(): List<AppointmentEntity>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(appointment: AppointmentEntity)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertAll(appointments: List<AppointmentEntity>)

    @Query("UPDATE appointments SET sync_status = 'synced' WHERE id = :id")
    suspend fun markSynced(id: String)

    @Query("UPDATE appointments SET is_deleted = 1, deleted_at = :deletedAt, sync_status = 'pending_update', updated_at = :deletedAt WHERE id = :id")
    suspend fun softDelete(id: String, deletedAt: Long = System.currentTimeMillis())

    @Query("DELETE FROM appointments WHERE is_deleted = 1 AND sync_status = 'synced'")
    suspend fun purgeSyncedDeleted()
}
