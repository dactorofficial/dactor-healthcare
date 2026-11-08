package com.dactor.patient.data.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class PatientTransactionRecord(
    val id: String,
    @SerialName("appointment_id") val appointmentId: String,
    @SerialName("tracking_code") val trackingCode: String,
    @SerialName("clinic_name") val clinicName: String = "Medical Clinic",
    @SerialName("doctor_name") val doctorName: String = "Consulting Doctor",
    @SerialName("patient_name") val patientName: String = "",
    @SerialName("appointment_date") val appointmentDate: String = "",
    @SerialName("appointment_time") val appointmentTime: String = "",
    val amount: Double = 0.0,
    @SerialName("payment_status") val paymentStatus: String = "paid", // "paid", "failed", "pending", "bypassed"
    @SerialName("payment_method") val paymentMethod: String = "esewa", // "esewa", "khalti", "fonepay", "connectips", "bypass"
    @SerialName("transaction_id") val transactionId: String = "",
    @SerialName("created_at") val createdAt: String = ""
)
