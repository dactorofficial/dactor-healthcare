package com.dactor.clinic.data.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class ClinicExpense(
    @SerialName("id") val id: String = java.util.UUID.randomUUID().toString(),
    @SerialName("clinic_id") val clinicId: String = "",
    @SerialName("title") val title: String = "",
    @SerialName("category") val category: String = "OTHER",
    @SerialName("amount") val amount: Double = 0.0,
    @SerialName("payment_method") val paymentMethod: String = "CASH",
    @SerialName("expense_date") val expenseDate: String = "",
    @SerialName("expense_time") val expenseTime: String? = null,
    @SerialName("voucher_number") val voucherNumber: String? = null,
    @SerialName("remarks") val remarks: String? = null,
    @SerialName("created_at") val createdAt: String? = null,
    @SerialName("updated_at") val updatedAt: String? = null
)
