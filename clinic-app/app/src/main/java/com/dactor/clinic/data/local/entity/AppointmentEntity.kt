package com.dactor.clinic.data.local.entity

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.PrimaryKey
import com.dactor.clinic.data.model.Appointment

@Entity(tableName = "appointments")
data class AppointmentEntity(
    @PrimaryKey
    @ColumnInfo(name = "id")
    val id: String,

    @ColumnInfo(name = "tracking_code_10_digit")
    val trackingCode10Digit: String,

    @ColumnInfo(name = "slot_id")
    val slotId: String? = null,

    @ColumnInfo(name = "clinic_id")
    val clinicId: String,

    @ColumnInfo(name = "doctor_id")
    val doctorId: String? = null,

    @ColumnInfo(name = "user_id")
    val userId: String? = null,

    @ColumnInfo(name = "patient_name")
    val patientName: String,

    @ColumnInfo(name = "patient_age")
    val patientAge: Int? = null,

    @ColumnInfo(name = "patient_gender")
    val patientGender: String? = null,

    @ColumnInfo(name = "patient_mobile")
    val patientMobile: String,

    @ColumnInfo(name = "patient_email")
    val patientEmail: String? = null,

    @ColumnInfo(name = "payment_status")
    val paymentStatus: String? = null,

    @ColumnInfo(name = "checkin_status")
    val checkinStatus: String? = null,

    @ColumnInfo(name = "appointment_date")
    val appointmentDate: String,

    @ColumnInfo(name = "appointment_time")
    val appointmentTime: String,

    @ColumnInfo(name = "fee_amount")
    val feeAmount: Double = 0.0,

    @ColumnInfo(name = "is_walkin")
    val isWalkin: Boolean = false,

    @ColumnInfo(name = "opt_in_early_call")
    val optInEarlyCall: Boolean = false,

    @ColumnInfo(name = "selected_lab_tests")
    val selectedLabTests: String? = null,

    @ColumnInfo(name = "payment_mode")
    val paymentMode: String = "ONLINE",

    @ColumnInfo(name = "status")
    val status: String = "APPROVED",

    @ColumnInfo(name = "attempt_number")
    val attemptNumber: Int = 1,

    @ColumnInfo(name = "service_charge_amount")
    val serviceChargeAmount: Double = 0.0,

    @ColumnInfo(name = "total_amount")
    val totalAmount: Double = 0.0,

    @ColumnInfo(name = "expires_at")
    val expiresAt: String? = null,

    @ColumnInfo(name = "approved_at")
    val approvedAt: String? = null,

    @ColumnInfo(name = "rejected_at")
    val rejectedAt: String? = null,

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
    fun toDomainModel(): Appointment {
        return Appointment(
            id = id,
            trackingCode10Digit = trackingCode10Digit,
            slotId = slotId,
            clinicId = clinicId,
            doctorId = doctorId,
            userId = userId,
            patientName = patientName,
            patientAge = patientAge,
            patientGender = patientGender,
            patientMobile = patientMobile,
            patientEmail = patientEmail,
            paymentStatus = paymentStatus,
            checkinStatus = checkinStatus,
            appointmentDate = appointmentDate,
            appointmentTime = appointmentTime,
            feeAmount = feeAmount,
            isWalkin = isWalkin,
            optInEarlyCall = optInEarlyCall,
            selectedLabTests = selectedLabTests,
            paymentMode = paymentMode,
            status = status,
            attemptNumber = attemptNumber,
            serviceChargeAmount = serviceChargeAmount,
            totalAmount = totalAmount,
            expiresAt = expiresAt,
            approvedAt = approvedAt,
            rejectedAt = rejectedAt,
            createdAt = createdAt
        )
    }

    companion object {
        fun fromDomainModel(
            model: Appointment,
            syncStatus: String = "synced",
            isDeleted: Boolean = false,
            deletedAt: Long? = null,
            updatedAt: Long = System.currentTimeMillis()
        ): AppointmentEntity {
            return AppointmentEntity(
                id = model.id,
                trackingCode10Digit = model.trackingCode10Digit,
                slotId = model.slotId,
                clinicId = model.clinicId,
                doctorId = model.doctorId,
                userId = model.userId,
                patientName = model.patientName,
                patientAge = model.patientAge,
                patientGender = model.patientGender,
                patientMobile = model.patientMobile,
                patientEmail = model.patientEmail,
                paymentStatus = model.paymentStatus,
                checkinStatus = model.checkinStatus,
                appointmentDate = model.appointmentDate,
                appointmentTime = model.appointmentTime,
                feeAmount = model.feeAmount,
                isWalkin = model.isWalkin,
                optInEarlyCall = model.optInEarlyCall,
                selectedLabTests = model.selectedLabTests,
                paymentMode = model.paymentMode,
                status = model.status,
                attemptNumber = model.attemptNumber,
                serviceChargeAmount = model.serviceChargeAmount,
                totalAmount = model.totalAmount,
                expiresAt = model.expiresAt,
                approvedAt = model.approvedAt,
                rejectedAt = model.rejectedAt,
                createdAt = model.createdAt,
                syncStatus = syncStatus,
                isDeleted = isDeleted,
                deletedAt = deletedAt,
                updatedAt = updatedAt
            )
        }
    }
}
