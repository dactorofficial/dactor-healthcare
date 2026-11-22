package com.dactor.clinic.data.local.entity

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.PrimaryKey
import com.dactor.clinic.data.model.Appointment
import com.dactor.clinic.data.model.QueueEntry
import com.dactor.clinic.ui.queue.QueueItemUi

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

    // Basic patient & appointment details for instant local queue rendering
    @ColumnInfo(name = "patient_name")
    val patientName: String = "",

    @ColumnInfo(name = "patient_age")
    val patientAge: Int = 0,

    @ColumnInfo(name = "patient_gender")
    val patientGender: String = "",

    @ColumnInfo(name = "patient_mobile")
    val patientMobile: String = "",

    @ColumnInfo(name = "tracking_code")
    val trackingCode: String = "",

    @ColumnInfo(name = "appointment_date")
    val appointmentDate: String = "",

    @ColumnInfo(name = "appointment_time")
    val appointmentTime: String = "",

    @ColumnInfo(name = "doctor_name")
    val doctorName: String? = null,

    @ColumnInfo(name = "payment_mode")
    val paymentMode: String? = null,

    @ColumnInfo(name = "payment_status")
    val paymentStatus: String? = null,

    @ColumnInfo(name = "total_amount")
    val totalAmount: Double = 0.0,

    @ColumnInfo(name = "user_id")
    val userId: String? = null,

    @ColumnInfo(name = "is_walkin")
    val isWalkin: Boolean = false,

    @ColumnInfo(name = "selected_lab_tests")
    val selectedLabTests: String? = null,

    @ColumnInfo(name = "opt_in_early_call")
    val optInEarlyCall: Boolean = false,

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

    fun toQueueItemUi(): QueueItemUi {
        return QueueItemUi(
            id = id,
            appointmentId = appointmentId,
            patientName = if (patientName.isNotBlank()) patientName else "Patient #$queuePosition",
            patientAge = patientAge,
            patientGender = if (patientGender.isNotBlank()) patientGender else "Registered",
            patientMobile = patientMobile,
            trackingCode = if (trackingCode.isNotBlank()) trackingCode else appointmentId.take(8),
            queuePosition = queuePosition,
            status = status,
            appointmentDate = appointmentDate,
            appointmentTime = appointmentTime,
            insideAt = insideAt,
            calledAt = calledAt,
            completedAt = completedAt,
            consultationDurationSeconds = consultationDurationSeconds,
            selectedLabTests = selectedLabTests,
            optInEarlyCall = optInEarlyCall,
            doctorId = doctorId,
            doctorName = doctorName,
            paymentMode = paymentMode,
            paymentStatus = paymentStatus,
            totalAmount = totalAmount,
            userId = userId,
            isWalkin = isWalkin,
            createdAt = createdAt
        )
    }

    companion object {
        fun fromDomainModel(
            model: QueueEntry,
            appointment: Appointment? = null,
            doctorName: String? = null,
            tokenNumber: String = "",
            syncStatus: String = "synced",
            isDeleted: Boolean = false,
            deletedAt: Long? = null,
            updatedAt: Long = System.currentTimeMillis()
        ): QueueEntryEntity {
            val rawTotal = appointment?.let { if (it.totalAmount > 0.0) it.totalAmount else it.feeAmount } ?: 0.0
            return QueueEntryEntity(
                id = model.id,
                appointmentId = model.appointmentId,
                clinicId = model.clinicId,
                doctorId = model.doctorId ?: appointment?.doctorId,
                tokenNumber = tokenNumber,
                queuePosition = model.queuePosition,
                status = model.status,
                calledAt = model.calledAt,
                insideAt = model.insideAt,
                completedAt = model.completedAt,
                consultationDurationSeconds = model.consultationDurationSeconds,
                createdAt = model.createdAt ?: appointment?.createdAt,
                patientName = appointment?.patientName.orEmpty(),
                patientAge = appointment?.patientAge ?: 0,
                patientGender = appointment?.patientGender.orEmpty(),
                patientMobile = appointment?.patientMobile.orEmpty(),
                trackingCode = appointment?.trackingCode10Digit ?: appointment?.id?.take(8).orEmpty(),
                appointmentDate = appointment?.appointmentDate.orEmpty(),
                appointmentTime = appointment?.appointmentTime.orEmpty(),
                doctorName = doctorName,
                paymentMode = appointment?.paymentMode,
                paymentStatus = appointment?.paymentStatus,
                totalAmount = rawTotal,
                userId = appointment?.userId,
                isWalkin = appointment?.isWalkin ?: false,
                selectedLabTests = appointment?.selectedLabTests,
                optInEarlyCall = appointment?.optInEarlyCall ?: false,
                syncStatus = syncStatus,
                isDeleted = isDeleted,
                deletedAt = deletedAt,
                updatedAt = updatedAt
            )
        }
    }
}
