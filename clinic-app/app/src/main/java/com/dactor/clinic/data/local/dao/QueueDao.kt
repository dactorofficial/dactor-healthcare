package com.dactor.clinic.data.local.dao

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import com.dactor.clinic.data.local.entity.QueueEntryEntity
import kotlinx.coroutines.flow.Flow

@Dao
interface QueueDao {

    @Query("SELECT * FROM queue_entries WHERE clinic_id = :clinicId AND doctor_id = :doctorId AND is_deleted = 0 ORDER BY queue_position ASC")
    fun getQueueForDoctor(clinicId: String, doctorId: String): Flow<List<QueueEntryEntity>>

    @Query("SELECT * FROM queue_entries WHERE clinic_id = :clinicId AND doctor_id = :doctorId AND is_deleted = 0 ORDER BY queue_position ASC")
    suspend fun getQueueForDoctorList(clinicId: String, doctorId: String): List<QueueEntryEntity>

    @Query("SELECT * FROM queue_entries WHERE doctor_id = :doctorId AND is_deleted = 0 ORDER BY queue_position ASC")
    suspend fun getQueueForDoctorOnlyList(doctorId: String): List<QueueEntryEntity>

    @Query("SELECT * FROM queue_entries WHERE clinic_id = :clinicId AND is_deleted = 0 ORDER BY queue_position ASC")
    fun getQueueForClinic(clinicId: String): Flow<List<QueueEntryEntity>>

    @Query("SELECT * FROM queue_entries WHERE clinic_id = :clinicId AND is_deleted = 0 ORDER BY queue_position ASC")
    suspend fun getQueueForClinicList(clinicId: String): List<QueueEntryEntity>

    @Query("SELECT * FROM queue_entries WHERE id = :id AND is_deleted = 0 LIMIT 1")
    suspend fun getQueueEntryById(id: String): QueueEntryEntity?

    @Query("SELECT * FROM queue_entries WHERE appointment_id = :appointmentId AND is_deleted = 0 LIMIT 1")
    suspend fun getQueueEntryByAppointmentId(appointmentId: String): QueueEntryEntity?

    @Query("SELECT * FROM queue_entries WHERE sync_status != 'synced'")
    suspend fun getPendingSyncQueueEntries(): List<QueueEntryEntity>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(entry: QueueEntryEntity)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertAll(entries: List<QueueEntryEntity>)

    @Query("UPDATE queue_entries SET sync_status = 'synced' WHERE id = :id")
    suspend fun markSynced(id: String)

    @Query("UPDATE queue_entries SET is_deleted = 1, deleted_at = :deletedAt, sync_status = 'pending_update', updated_at = :deletedAt WHERE id = :id")
    suspend fun softDelete(id: String, deletedAt: Long = System.currentTimeMillis())
}
