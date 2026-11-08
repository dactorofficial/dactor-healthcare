package com.dactor.clinic.data.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class BillingInvoice(
    @SerialName("id") val id: String = "",
    @SerialName("appointment_id") val appointmentId: String = "",
    @SerialName("clinic_id") val clinicId: String = "",
    @SerialName("items") val items: List<InvoiceItem> = emptyList(),
    @SerialName("total_amount") val totalAmount: Double = 0.0,
    @SerialName("paid_amount") val paidAmount: Double = 0.0,
    @SerialName("balance_due") val balanceDue: Double = 0.0,
    @SerialName("payment_status") val paymentStatus: String = "pending",
    @SerialName("paid_at") val paidAt: String? = null,
    @SerialName("remarks") val remarks: String? = null,
    @SerialName("created_at") val createdAt: String? = null,
    @SerialName("updated_at") val updatedAt: String? = null
) {
    val effectivePaidAmount: Double
        get() = if (paidAmount > 0.0) {
            paidAmount
        } else if (paymentStatus.equals("paid", ignoreCase = true) && balanceDue <= 0.0) {
            totalAmount
        } else {
            0.0
        }
}
