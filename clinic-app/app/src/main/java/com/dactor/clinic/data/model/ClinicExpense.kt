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
    @SerialName("receipt_no") val receiptNo: String? = null,
    @SerialName("notes") val notes: String? = null,
    @SerialName("payee_name") val payeeName: String? = null,
    @SerialName("created_at") val createdAt: String? = null,
    @SerialName("updated_at") val updatedAt: String? = null
) {
    val displayVoucherNumber: String?
        get() = voucherNumber?.ifBlank { null } ?: receiptNo?.ifBlank { null }

    val displayRemarks: String?
        get() {
            val r = remarks?.ifBlank { null } ?: notes?.ifBlank { null }
            return if (r != null && r.startsWith("[") && r.contains("]")) {
                r.replace(Regex("^\\[\\d{1,2}:\\d{2}\\]\\s*"), "").ifBlank { null }
            } else {
                r
            }
        }

    val displayTime: String?
        get() {
            if (!expenseTime.isNullOrBlank()) return expenseTime
            val r = remarks ?: notes
            if (r != null) {
                val match = Regex("^\\[(\\d{1,2}:\\d{2})\\]").find(r)
                if (match != null) return match.groupValues[1]
            }
            return null
        }

    fun normalized(): ClinicExpense {
        val v = displayVoucherNumber
        val rem = displayRemarks
        val t = displayTime
        return copy(
            voucherNumber = v,
            receiptNo = v,
            remarks = rem,
            notes = rem,
            expenseTime = t
        )
    }
}
