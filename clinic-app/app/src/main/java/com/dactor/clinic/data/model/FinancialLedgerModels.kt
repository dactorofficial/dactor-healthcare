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

enum class PaymentPeriodScope(val label: String) {
    DAY("Day"),
    MONTH("Month"),
    YEAR("Year"),
    CUSTOM("Custom")
}

data class UnifiedPaymentLogEntry(
    val id: String,
    val appointmentId: String? = null,
    val invoiceId: String? = null,
    val trackingCode10Digit: String? = null,
    val followUpOfAppointmentId: String? = null,
    val followUpOfTrackingCode: String? = null,
    val doctorId: String? = null,
    val patientName: String,
    val patientPhone: String,
    val doctorName: String = "",
    val doctorSpecialty: String = "",
    val consultationFee: Double = 0.0,
    val amount: Double,
    val dateTime: String,
    val paymentMethod: String,
    val paymentMode: String = "ONLINE",
    val referenceId: String? = null,
    val note: String? = null,
    val invoiceStatus: String = "paid",
    val totalBill: Double = 0.0,
    val balanceDue: Double = 0.0,
    val receiptUrl: String? = null,
    val visitType: String = "new", // "new" | "follow_up" | "unknown" | ""
    val testNames: List<String> = emptyList(),
    val paymentPart: Pair<Int, Int>? = null,
    val isRefund: Boolean = false,
    val category: String = "CONSULTATION",
    val serviceChargeAmount: Double = 0.0
) {
    /** Compatibility helper used by PDF/CSV exporters. */
    val isNewPatientForDoctor: Boolean
        get() = visitType.equals("new", ignoreCase = true)
}

data class PendingBillEntry(
    val invoiceId: String? = null,
    val appointmentId: String,
    val trackingCode10Digit: String,
    val patientName: String,
    val patientPhone: String,
    val doctorId: String? = null,
    val doctorName: String = "",
    val testNames: List<String> = emptyList(),
    val visitDate: String,
    val visitTime: String = "",
    val visitType: String = "unknown",
    val paymentMode: String = "ONLINE",
    val totalAmount: Double,
    val paidAmount: Double,
    val balanceDue: Double,
    val isPartlyPaid: Boolean = paidAmount > 0.01 && balanceDue > 0.01
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

data class DoctorPeriodStat(
    val doctorId: String,
    val doctorName: String,
    val specialty: String,
    val consultationFee: Double,
    val totalVisits: Int,
    val newPatients: Int,
    val followupPatients: Int,
    val collectedAmount: Double,
    val sharePercent: Double
)

data class LabTestPeriodStat(
    val testName: String,
    val count: Int,
    val unitPrice: Double,
    val collectedIncome: Double,
    val sharePercent: Double
)

data class PaymentPeriodSummary(
    val collected: Double,
    val collectedCount: Int,
    val pendingTotal: Double,
    val pendingCount: Int,
    val expenses: Double,
    val expensesCount: Int,
    val platformFees: Double,
    val subscriptionDue: Double,
    val net: Double
)
