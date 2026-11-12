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
) {
    val isPayAtDesk: Boolean
        get() = paymentMode.equals("PAY_AT_DESK", ignoreCase = true)

    val effectiveServiceCharge: Double
        get() = when {
            !isPayAtDesk || feeAmount <= 0.0 -> 0.0
            serviceChargeAmount > 0.0 -> serviceChargeAmount
            else -> kotlin.math.round(feeAmount * 5.0) / 100.0
        }

    val effectiveTotalAmount: Double
        get() = when {
            isPayAtDesk -> {
                if (totalAmount > feeAmount) totalAmount
                else kotlin.math.round((feeAmount + effectiveServiceCharge) * 100.0) / 100.0
            }
            totalAmount > 0.0 -> totalAmount
            else -> feeAmount
        }

    fun effectiveTotalForInvoice(inv: BillingInvoice?, fallbackFee: Double = 0.0): Double {
        val apptTotal = if (effectiveTotalAmount > 0.0) effectiveTotalAmount else fallbackFee
        val invTotal = inv?.totalAmount ?: 0.0
        return when {
            isPayAtDesk -> maxOf(invTotal, apptTotal)
            invTotal > 0.0 -> invTotal
            else -> apptTotal
        }
    }

    fun effectivePaidForInvoice(inv: BillingInvoice?, totalBill: Double = effectiveTotalForInvoice(inv)): Double {
        val invPaid = inv?.effectivePaidAmount ?: 0.0
        val isPaid = inv?.paymentStatus.equals("paid", ignoreCase = true) ||
            paymentStatus.equals("paid", ignoreCase = true)
        return when {
            isPaid -> maxOf(invPaid, totalBill)
            inv != null -> invPaid
            else -> 0.0
        }
    }

    fun effectiveItemsForInvoice(
        inv: BillingInvoice?,
        fallbackDate: String = appointmentDate,
        fallbackTotal: Double = effectiveTotalForInvoice(inv)
    ): List<InvoiceItem> {
        val existing = (inv?.items ?: emptyList()).filterNot {
            it.itemName.lowercase().startsWith("payment received")
        }
        val deskCharge = effectiveServiceCharge
        val dateLabel = appointmentDate.ifBlank { fallbackDate }
        if (existing.isNotEmpty()) {
            if (isPayAtDesk && deskCharge > 0.0) {
                val hasServiceCharge = existing.any {
                    val lower = it.itemName.lowercase()
                    lower.contains("service charge") || lower.contains("5%") || lower.contains("+5%")
                }
                if (!hasServiceCharge) {
                    return existing + InvoiceItem(
                        itemName = "Pay at Desk Service Charge (5%)",
                        quantity = 1,
                        price = deskCharge,
                        total = deskCharge
                    )
                }
            }
            return existing
        }
        return if (isPayAtDesk && deskCharge > 0.0) {
            listOf(
                InvoiceItem(
                    itemName = if (dateLabel.isNotBlank()) "OPD Consultation Fee ($dateLabel)" else "OPD Consultation Fee",
                    quantity = 1,
                    price = feeAmount,
                    total = feeAmount
                ),
                InvoiceItem(
                    itemName = "Pay at Desk Service Charge (5%)",
                    quantity = 1,
                    price = deskCharge,
                    total = deskCharge
                )
            )
        } else {
            listOf(
                InvoiceItem(
                    itemName = if (dateLabel.isNotBlank()) "Consultation Fee ($dateLabel)" else "Consultation Fee",
                    quantity = 1,
                    price = fallbackTotal,
                    total = fallbackTotal
                )
            )
        }
    }
}
