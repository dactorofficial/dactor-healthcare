package com.dactor.patient.data.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class Appointment(
    val id: String = "",
    @SerialName("tracking_code_10_digit") val trackingCode10Digit: String = "",
    @SerialName("slot_id") val slotId: String? = null,
    @SerialName("clinic_id") val clinicId: String = "",
    @SerialName("doctor_id") val doctorId: String? = null,
    @SerialName("user_id") val userId: String? = null,
    @SerialName("patient_name") val patientName: String = "",
    @SerialName("patient_age") val patientAge: Int = 0,
    @SerialName("patient_gender") val patientGender: String = "",
    @SerialName("patient_mobile") val patientMobile: String = "",
    @SerialName("patient_email") val patientEmail: String? = null,
    @SerialName("payment_status") val paymentStatus: String = "paid",
    @SerialName("checkin_status") val checkinStatus: String = "checked_in",
    @SerialName("appointment_date") val appointmentDate: String = "",
    @SerialName("appointment_time") val appointmentTime: String = "",
    @SerialName("fee_amount") val feeAmount: Double = 0.0,
    @SerialName("is_walkin") val isWalkin: Boolean = false,
    @SerialName("opt_in_early_call") val optInEarlyCall: Boolean = false,
    @kotlinx.serialization.Transient val selectedLabTests: String? = null,
    @SerialName("notes") val notes: String? = null,
    @SerialName("payment_mode") val paymentMode: String = "ONLINE",
    @SerialName("status") val status: String = "APPROVED",
    @SerialName("attempt_number") val attemptNumber: Int = 1,
    @SerialName("service_charge_amount") val serviceChargeAmount: Double = 0.0,
    @SerialName("total_amount") val totalAmount: Double = 0.0,
    @SerialName("expires_at") val expiresAt: String? = null,
    @SerialName("approved_at") val approvedAt: String? = null,
    @SerialName("rejected_at") val rejectedAt: String? = null,
    @SerialName("created_at") val createdAt: String? = null
)
