package com.dactor.patient.util

import com.dactor.patient.data.model.Appointment
import com.dactor.patient.data.model.BillingInvoice
import com.dactor.patient.data.model.InvoiceItem
import com.dactor.patient.data.model.PaymentRecord
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

object PaymentLedgerHelper {
    private val json = Json {
        ignoreUnknownKeys = true
        isLenient = true
        encodeDefaults = true
    }

    private const val START_TAG = "<!--PAYMENT_LOG_START-->"
    private const val END_TAG = "<!--PAYMENT_LOG_END-->"

    private val NEPAL_ZONE: java.time.ZoneId
        get() = try {
            java.time.ZoneId.of("Asia/Kathmandu")
        } catch (_: Exception) {
            java.time.ZoneId.systemDefault()
        }

    private fun parseIsoToNepalDateTime(raw: String): java.time.ZonedDateTime? {
        val trimmed = raw.trim()
        if (!trimmed.contains("T")) return null
        return try {
            java.time.Instant.parse(trimmed).atZone(NEPAL_ZONE)
        } catch (_: Exception) {
            try {
                java.time.OffsetDateTime.parse(trimmed).atZoneSameInstant(NEPAL_ZONE)
            } catch (_: Exception) {
                try {
                    java.time.ZonedDateTime.parse(trimmed).withZoneSameInstant(NEPAL_ZONE)
                } catch (_: Exception) {
                    null
                }
            }
        }
    }

    fun normalizeTimestampForLedger(raw: String?): String {
        if (raw.isNullOrBlank()) return java.time.LocalDate.now(NEPAL_ZONE).toString()
        val trimmed = raw.trim()
        parseIsoToNepalDateTime(trimmed)?.let { zdt ->
            return zdt.format(java.time.format.DateTimeFormatter.ofPattern("yyyy-MM-dd hh:mm a", java.util.Locale.US))
        }
        return trimmed.replace("T", " ")
    }

    fun parsePaymentRecords(
        rawRemarks: String?,
        fallbackPaidAmount: Double = 0.0,
        fallbackDate: String? = null
    ): List<PaymentRecord> {
        if (!rawRemarks.isNullOrBlank() && rawRemarks.contains(START_TAG) && rawRemarks.contains(END_TAG)) {
            try {
                val jsonStr = rawRemarks.substringAfter(START_TAG).substringBefore(END_TAG).trim()
                if (jsonStr.isNotBlank()) {
                    val list = json.decodeFromString<List<PaymentRecord>>(jsonStr)
                    if (list.isNotEmpty()) return list
                }
            } catch (e: Exception) {
                e.printStackTrace()
            }
        }
        // Fallback: If legacy invoice has paidAmount > 0 and no payment log tag
        if (fallbackPaidAmount > 0.0) {
            val dateStr = normalizeTimestampForLedger(fallbackDate)
            return listOf(
                PaymentRecord(
                    amount = fallbackPaidAmount,
                    dateTime = dateStr,
                    note = "Payment Received"
                )
            )
        }
        return emptyList()
    }

    fun extractCleanClinicalRemarks(rawRemarks: String?): String {
        if (rawRemarks.isNullOrBlank()) return ""
        var text = rawRemarks
        // 1. Remove PAYMENT_LOG block case-insensitively
        text = text.replace(Regex("(?i)<!--PAYMENT_LOG_START-->[\\s\\S]*?<!--PAYMENT_LOG_END-->"), "")
        // 2. Remove any other HTML comments
        text = text.replace(Regex("<!--[\\s\\S]*?-->"), "")
        // 3. Remove standalone json lines containing payment record fields if tags were malformed
        text = text.lines().filterNot { line ->
            val l = line.trim()
            l.startsWith("[{\"id\":") || l.startsWith("{\"id\":") || (l.contains("\"amount\":") && l.contains("\"date_time\":"))
        }.joinToString("\n")
        return text.trim()
    }

    fun buildCombinedRemarks(cleanRemarks: String, paymentRecords: List<PaymentRecord>): String {
        val trimmedRemarks = cleanRemarks.trim()
        if (paymentRecords.isEmpty()) return trimmedRemarks
        val recordsJson = json.encodeToString(paymentRecords)
        val logBlock = "$START_TAG\n$recordsJson\n$END_TAG"
        return if (trimmedRemarks.isNotBlank()) {
            "$trimmedRemarks\n\n$logBlock"
        } else {
            logBlock
        }
    }

    fun formatDisplayDateTime(raw: String?): String {
        if (raw.isNullOrBlank()) return "Date Logged"
        val trimmed = raw.trim()
        return try {
            val zdt = parseIsoToNepalDateTime(trimmed)
            if (zdt != null) {
                zdt.format(java.time.format.DateTimeFormatter.ofPattern("dd MMM yyyy, hh:mm a", java.util.Locale.US))
            } else if (trimmed.contains("-") && trimmed.length >= 10) {
                val parts = trimmed.split(" ", limit = 2)
                val datePart = java.time.LocalDate.parse(parts[0])
                val dateFmt = datePart.format(java.time.format.DateTimeFormatter.ofPattern("dd MMM yyyy", java.util.Locale.US))
                if (parts.size > 1 && parts[1].isNotBlank()) {
                    val rawTime = parts[1].trim()
                    val formattedTime = try {
                        java.time.LocalTime.parse(rawTime, java.time.format.DateTimeFormatter.ofPattern("H:mm[:ss]", java.util.Locale.US))
                            .format(java.time.format.DateTimeFormatter.ofPattern("hh:mm a", java.util.Locale.US))
                    } catch (_: Exception) {
                        rawTime
                    }
                    "$dateFmt, $formattedTime"
                } else {
                    dateFmt
                }
            } else {
                trimmed
            }
        } catch (_: Exception) {
            trimmed.replace("T", " ").take(19)
        }
    }

    fun reconcilePaymentRecordsForAppointment(
        appt: Appointment?,
        inv: BillingInvoice?,
        rawRemarks: String?,
        paidAmount: Double = 0.0,
        paidAt: String? = null
    ): List<PaymentRecord> {
        val parsed = parsePaymentRecords(rawRemarks, paidAmount, paidAt)
        if (appt == null || !appt.isPayAtDesk || parsed.size != 1) return parsed
        val expectedTotal = appt.effectiveTotalForInvoice(inv)
        val isPaid = inv?.paymentStatus.equals("paid", ignoreCase = true) ||
            appt.paymentStatus.equals("paid", ignoreCase = true) ||
            paidAmount >= expectedTotal
        val first = parsed[0]
        return if (isPaid && expectedTotal > 0.0 && first.amount > 0.0 && first.amount < expectedTotal) {
            listOf(first.copy(amount = maxOf(first.amount, paidAmount, expectedTotal)))
        } else {
            parsed
        }
    }

    fun formatRsAmount(amount: Double): String {
        val rounded = kotlin.math.round(amount * 100.0) / 100.0
        return if (rounded % 1.0 == 0.0) {
            rounded.toInt().toString()
        } else {
            String.format(java.util.Locale.US, "%.2f", rounded).trimEnd('0').trimEnd('.')
        }
    }

    data class CombinedBillingSummary(
        val visitsCount: Int,
        val totalBill: Double,
        val totalPaid: Double,
        val balanceDue: Double,
        val items: List<InvoiceItem>,
        val paymentRecords: List<PaymentRecord>,
        val cleanRemarks: String
    )

    fun computeCombinedBillingSummary(
        visits: List<Appointment>,
        invoicesByApptId: Map<String, BillingInvoice>
    ): CombinedBillingSummary {
        if (visits.isEmpty()) {
            return CombinedBillingSummary(0, 0.0, 0.0, 0.0, emptyList(), emptyList(), "")
        }
        val sortedVisits = visits
            .distinctBy { it.id }
            .sortedWith(compareBy<Appointment>({ it.attemptNumber }, { it.appointmentDate }, { it.appointmentTime }, { it.createdAt ?: "" }))

        val isMultiVisit = sortedVisits.size > 1
        val allItems = mutableListOf<InvoiceItem>()
        val allPayments = mutableListOf<PaymentRecord>()
        val allRemarks = mutableListOf<String>()
        var grandTotal = 0.0

        for (v in sortedVisits) {
            val inv = invoicesByApptId[v.id]
            val isCancelled = v.status.equals("cancelled", true) ||
                v.status.equals("rejected", true) ||
                v.checkinStatus.equals("cancelled", true)
            if (isCancelled && (inv == null || (inv.totalAmount <= 0.0 && inv.paidAmount <= 0.0))) {
                continue
            }

            val isFollowUp = v.isFreeFollowUp
            val rawCleanItems = inv?.items?.filterNot {
                it.itemName.startsWith("Payment Received", ignoreCase = true)
            } ?: emptyList()

            val visitItems: List<InvoiceItem> = when {
                rawCleanItems.isNotEmpty() -> {
                    val hasServiceCharge = rawCleanItems.any {
                        val lower = it.itemName.lowercase()
                        lower.contains("service charge") || lower.contains("5%") || lower.contains("+5%")
                    }
                    if (!isFollowUp && v.isPayAtDesk && v.effectiveServiceCharge > 0.0 && !hasServiceCharge) {
                        rawCleanItems + InvoiceItem(
                            itemName = "Pay at Desk Service Charge (5%)",
                            quantity = 1,
                            price = v.effectiveServiceCharge,
                            total = v.effectiveServiceCharge
                        )
                    } else {
                        rawCleanItems
                    }
                }
                inv != null && inv.totalAmount > 0.0 -> {
                    listOf(
                        InvoiceItem(
                            itemName = "OPD Consultation & Services (${v.appointmentDate})",
                            quantity = 1,
                            price = inv.totalAmount,
                            total = inv.totalAmount
                        )
                    )
                }
                !isFollowUp && v.effectiveTotalAmount > 0.0 -> {
                    if (v.isPayAtDesk && v.effectiveServiceCharge > 0.0) {
                        listOf(
                            InvoiceItem("OPD Consultation (${v.appointmentDate})", 1, v.feeAmount, v.feeAmount),
                            InvoiceItem("Pay at Desk Service Charge (5%)", 1, v.effectiveServiceCharge, v.effectiveServiceCharge)
                        )
                    } else {
                        listOf(InvoiceItem("OPD Consultation (${v.appointmentDate})", 1, v.effectiveTotalAmount, v.effectiveTotalAmount))
                    }
                }
                else -> emptyList()
            }

            val visitTotal = if (visitItems.isNotEmpty()) {
                visitItems.sumOf { it.effectiveTotal }
            } else if (inv != null && inv.totalAmount > 0.0) {
                inv.totalAmount
            } else if (!isFollowUp) {
                v.effectiveTotalAmount
            } else {
                0.0
            }

            grandTotal += visitTotal
            visitItems.forEach { item ->
                val taggedName = if (isMultiVisit && !item.itemName.startsWith("Visit #")) {
                    "Visit #${v.attemptNumber} (${v.appointmentDate}) \u2022 ${item.itemName}"
                } else {
                    item.itemName
                }
                allItems.add(
                    InvoiceItem(
                        itemName = taggedName,
                        quantity = item.quantity,
                        price = item.price,
                        total = item.effectiveTotal
                    )
                )
            }

            val parsedLogs = parsePaymentRecords(
                rawRemarks = inv?.remarks,
                fallbackPaidAmount = 0.0,
                fallbackDate = inv?.paidAt
            )
            if (parsedLogs.isNotEmpty()) {
                allPayments.addAll(parsedLogs)
            } else {
                val explicitPaid = inv?.effectivePaidAmount ?: 0.0
                val synthPaid = when {
                    explicitPaid > 0.0 -> explicitPaid
                    !isFollowUp && v.paymentStatus.equals("paid", true) && visitTotal > 0.0 -> visitTotal
                    else -> 0.0
                }
                if (synthPaid > 0.0) {
                    val stamp = when {
                        !inv?.paidAt.isNullOrBlank() -> normalizeTimestampForLedger(inv?.paidAt)
                        !v.approvedAt.isNullOrBlank() -> normalizeTimestampForLedger(v.approvedAt)
                        else -> "${v.appointmentDate} ${v.appointmentTime.ifBlank { "10:00 AM" }}"
                    }
                    allPayments.add(
                        PaymentRecord(
                            amount = synthPaid,
                            dateTime = stamp,
                            note = if (v.isPayAtDesk) "Pay at Desk Collection" else "Consultation Payment"
                        )
                    )
                }
            }

            val cleanRem = extractCleanClinicalRemarks(inv?.remarks)
            if (cleanRem.isNotBlank()) {
                allRemarks.add(if (isMultiVisit) "[${v.appointmentDate}] $cleanRem" else cleanRem)
            }
        }

        val totalPaid = allPayments.sumOf { it.amount }
        val balance = (grandTotal - totalPaid).coerceAtLeast(0.0)
        return CombinedBillingSummary(
            visitsCount = sortedVisits.size,
            totalBill = grandTotal,
            totalPaid = totalPaid,
            balanceDue = balance,
            items = allItems,
            paymentRecords = allPayments,
            cleanRemarks = allRemarks.joinToString("\n")
        )
    }
}
