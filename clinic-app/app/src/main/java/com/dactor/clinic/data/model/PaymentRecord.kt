package com.dactor.clinic.data.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class PaymentRecord(
    @SerialName("id") val id: String = java.util.UUID.randomUUID().toString(),
    @SerialName("amount") val amount: Double,
    @SerialName("date_time") val dateTime: String,
    @SerialName("note") val note: String? = null,
    @SerialName("payment_method") val paymentMethod: String? = null,
    @SerialName("reference_id") val referenceId: String? = null,
    @SerialName("category") val category: String? = null
)
