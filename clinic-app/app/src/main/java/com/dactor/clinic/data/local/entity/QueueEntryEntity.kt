package com.dactor.clinic.data.local.entity

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.PrimaryKey
import com.dactor.clinic.data.model.QueueEntry

@Entity(tableName = "queue_entries")
data class QueueEntryEntity(
    @PrimaryKey
    @ColumnInfo(name = "id")
    val id: String,

    @ColumnInfo(name = "appointment_id")
    val appointmentId: String,

    @ColumnInfo(name = "clinic_id")
    val clinicId: String,

    @ColumnInfo(name = "doctor_id")
    val doctorId: String? = null,

    @ColumnInfo(name = "token_number")
    val tokenNumber: String = "",

    @ColumnInfo(name = "queue_position")
    val queuePosition: Int,

    @ColumnInfo(name = "status")
    val status: String,

    @ColumnInfo(name = "called_at")
    val calledAt: String? = null,

    @ColumnInfo(name = "inside_at")
    val insideAt: String? = null,

    @ColumnInfo(name = "completed_at")
    val completedAt: String? = null,

    @ColumnInfo(name = "consultation_duration_seconds")
    val consultationDurationSeconds: Long? = null,

    @ColumnInfo(name = "created_at")
    val createdAt: String? = null,

    // Offline sync metadata
    @ColumnInfo(name = "sync_status")
    val syncStatus: String = "synced", // "synced", "pending_insert", "pending_update"

    @ColumnInfo(name = "is_deleted")
    val isDeleted: Boolean = false,

    @ColumnInfo(name = "deleted_at")
    val deletedAt: Long? = null,

    @ColumnInfo(name = "updated_at")
    val updatedAt: Long = System.currentTimeMillis()
) {
    fun toDomainModel(): QueueEntry {
        return QueueEntry(
            id = id,
            appointmentId = appointmentId,
            clinicId = clinicId,
            doctorId = doctorId,
            queuePosition = queuePosition,
            status = status,
            calledAt = calledAt,
            insideAt = insideAt,
            completedAt = completedAt,
            consultationDurationSeconds = consultationDurationSeconds,
            createdAt = createdAt
        )
    }

    companion object {
        fun fromDomainModel(
            model: QueueEntry,
            tokenNumber: String = "",
            syncStatus: String = "synced",
            isDeleted: Boolean = false,
            deletedAt: Long? = null,
            updatedAt: Long = System.currentTimeMillis()
        ): QueueEntryEntity {
            return QueueEntryEntity(
                id = model.id,
                appointmentId = model.appointmentId,
                clinicId = model.clinicId,
                doctorId = model.doctorId,
                tokenNumber = tokenNumber,
                queuePosition = model.queuePosition,
                status = model.status,
                calledAt = model.calledAt,
                insideAt = model.insideAt,
                completedAt = model.completedAt,
                consultationDurationSeconds = model.consultationDurationSeconds,
                createdAt = model.createdAt,
                syncStatus = syncStatus,
                isDeleted = isDeleted,
                deletedAt = deletedAt,
                updatedAt = updatedAt
            )
        }
    }
}
