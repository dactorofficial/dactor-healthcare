package com.dactor.patient.data.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class InvoiceItem(
    @SerialName("item_name") val rawItemName: String? = null,
    @SerialName("itemName") val camelItemName: String? = null,
    @SerialName("name") val plainName: String? = null,
    @SerialName("quantity") val quantity: Int = 1,
    @SerialName("price") val price: Double = 0.0,
    @SerialName("total") val total: Double = 0.0
) {
    constructor(
        itemName: String,
        quantity: Int = 1,
        price: Double = 0.0,
        total: Double = 0.0
    ) : this(
        rawItemName = itemName,
        camelItemName = itemName,
        plainName = itemName,
        quantity = quantity,
        price = price,
        total = if (total > 0.0) total else price * quantity
    )

    val itemName: String
        get() = rawItemName?.takeIf { it.isNotBlank() }
            ?: camelItemName?.takeIf { it.isNotBlank() }
            ?: plainName?.takeIf { it.isNotBlank() }
            ?: "Clinical Service"

    val effectiveTotal: Double
        get() = if (total > 0.0) total else price * quantity
}

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
