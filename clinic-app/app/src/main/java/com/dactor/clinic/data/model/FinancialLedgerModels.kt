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
    @SerialName("amount_npr") val amount: Double = 0.0,
    @SerialName("payment_method") val paymentMethod: String = "ESEWA",
    @SerialName("transaction_reference") val referenceId: String? = null,
    @SerialName("payment_proof_url") val receiptUrl: String? = null,
    @SerialName("status") val status: String = "pending_verification",
    @SerialName("plan_type") val planType: String = "1_month",
    @SerialName("notes") val notes: String? = null,
    @SerialName("created_at") val createdAt: String? = null
) {
    val durationMonths: Int
        get() = if (planType.contains("12")) 12 else 1
}

@Serializable
data class PlatformCommissionSettlement(
    @SerialName("id") val id: String = java.util.UUID.randomUUID().toString(),
    @SerialName("clinic_id") val clinicId: String,
    @SerialName("period_start") val periodStart: String,
    @SerialName("period_end") val periodEnd: String,
    @SerialName("appointments_count") val appointmentsCount: Int = 0,
    @SerialName("gross_desk_amount_npr") val totalPayAtDeskAmount: Double = 0.0,
    @SerialName("commission_amount_npr") val platformFeeAmount: Double = 0.0,
    @SerialName("payment_method") val paymentMethod: String = "BANK_TRANSFER",
    @SerialName("status") val status: String = "settled",
    @SerialName("settled_at") val settledAt: String? = null,
    @SerialName("transaction_reference") val settlementReference: String? = null,
    @SerialName("notes") val notes: String? = null,
    @SerialName("created_at") val createdAt: String? = null
) {
    val commissionRate: Double
        get() = 0.05
}

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
