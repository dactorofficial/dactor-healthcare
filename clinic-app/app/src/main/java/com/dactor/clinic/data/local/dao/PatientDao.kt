package com.dactor.clinic.data.local.dao

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import com.dactor.clinic.data.local.entity.PatientEntity
import kotlinx.coroutines.flow.Flow

@Dao
interface PatientDao {

    @Query("SELECT * FROM patients WHERE clinic_id = :clinicId ORDER BY updated_at DESC")
    fun getPatientsForClinic(clinicId: String): Flow<List<PatientEntity>>

    @Query("SELECT * FROM patients WHERE clinic_id = :clinicId ORDER BY updated_at DESC")
    suspend fun getPatientsForClinicList(clinicId: String): List<PatientEntity>

    @Query("SELECT * FROM patients WHERE id = :id LIMIT 1")
    suspend fun getPatientById(id: String): PatientEntity?

    @Query("SELECT * FROM patients WHERE tracking_code_10_digit = :code LIMIT 1")
    suspend fun getPatientByTrackingCode(code: String): PatientEntity?

    @Query("SELECT * FROM patients WHERE clinic_id = :clinicId AND (full_name LIKE '%' || :query || '%' OR phone LIKE '%' || :query || '%' OR tracking_code_10_digit LIKE '%' || :query || '%' OR email LIKE '%' || :query || '%') ORDER BY updated_at DESC LIMIT 100")
    suspend fun searchPatients(clinicId: String, query: String): List<PatientEntity>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(patient: PatientEntity)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertAll(patients: List<PatientEntity>)

    @Query("DELETE FROM patients WHERE id = :id")
    suspend fun deleteById(id: String)

    @Query("DELETE FROM patients WHERE clinic_id = :clinicId")
    suspend fun deleteAllForClinic(clinicId: String)
}
