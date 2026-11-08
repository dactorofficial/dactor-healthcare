package com.dactor.clinic.data.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class InvoiceTransaction(
    @SerialName("id") val id: String = java.util.UUID.randomUUID().toString(),
    @SerialName("invoice_id") val invoiceId: String? = null,
    @SerialName("clinic_id") val clinicId: String? = null,
    @SerialName("appointment_id") val appointmentId: String? = null,
    @SerialName("amount") val amount: Double = 0.0,
    @SerialName("payment_method") val paymentMethod: String = "CASH",
    @SerialName("reference_id") val referenceId: String? = null,
    @SerialName("notes") val notes: String? = null,
    @SerialName("category") val category: String? = "CONSULTATION",
    @SerialName("created_at") val createdAt: String? = null
)

@Serializable
data class ClinicSubscriptionPayment(
    @SerialName("id") val id: String = java.util.UUID.randomUUID().toString(),
    @SerialName("clinic_id") val clinicId: String,
    @SerialName("amount") val amount: Double = 0.0,
    @SerialName("payment_method") val paymentMethod: String = "ESEWA",
    @SerialName("reference_id") val referenceId: String? = null,
    @SerialName("receipt_url") val receiptUrl: String? = null,
    @SerialName("status") val status: String = "PENDING",
    @SerialName("duration_months") val durationMonths: Int = 1,
    @SerialName("notes") val notes: String? = null,
    @SerialName("created_at") val createdAt: String? = null
)

@Serializable
data class PlatformCommissionSettlement(
    @SerialName("id") val id: String = java.util.UUID.randomUUID().toString(),
    @SerialName("clinic_id") val clinicId: String,
    @SerialName("period_start") val periodStart: String,
    @SerialName("period_end") val periodEnd: String,
    @SerialName("total_pay_at_desk_amount") val totalPayAtDeskAmount: Double = 0.0,
    @SerialName("platform_fee_amount") val platformFeeAmount: Double = 0.0,
    @SerialName("commission_rate") val commissionRate: Double = 0.05,
    @SerialName("status") val status: String = "PENDING",
    @SerialName("settled_at") val settledAt: String? = null,
    @SerialName("settlement_reference") val settlementReference: String? = null,
    @SerialName("notes") val notes: String? = null,
    @SerialName("created_at") val createdAt: String? = null
)

data class UnifiedPaymentLogEntry(
    val id: String,
    val appointmentId: String?,
    val invoiceId: String? = null,
    val trackingCode10Digit: String?,
    val patientName: String,
    val patientPhone: String,
    val doctorName: String,
    val doctorSpecialty: String,
    val consultationFee: Double,
    val amount: Double,
    val dateTime: String,
    val paymentMethod: String,
    val referenceId: String?,
    val note: String?,
    val invoiceStatus: String,
    val totalBill: Double,
    val balanceDue: Double,
    val receiptUrl: String?,
    val isNewPatientForDoctor: Boolean,
    val category: String
)

data class VisitMetric(
    val newPatients: Int = 0,
    val followupPatients: Int = 0,
    val totalRevenue: Double = 0.0
)

data class DoctorVisitAnalytics(
    val doctorId: String,
    val doctorName: String,
    val specialty: String,
    val consultationFee: Double,
    val totalVisits: Int,
    val newPatients: Int,
    val followupPatients: Int,
    val totalOpdRevenue: Double,
    val dailyBreakdown: Map<String, VisitMetric>,
    val monthlyBreakdown: Map<String, VisitMetric>
)
