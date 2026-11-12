package com.dactor.patient.util

import com.dactor.patient.data.model.Appointment
import com.dactor.patient.data.model.BillingInvoice
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
            val dateStr = fallbackDate?.take(16)?.replace("T", " ") ?: java.time.LocalDate.now().toString()
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
            if (trimmed.contains("T")) {
                val instant = java.time.Instant.parse(trimmed)
                val zdt = instant.atZone(java.time.ZoneId.systemDefault())
                zdt.format(java.time.format.DateTimeFormatter.ofPattern("dd MMM yyyy, hh:mm a"))
            } else if (trimmed.contains("-") && trimmed.length >= 10) {
                val parts = trimmed.split(" ")
                val datePart = java.time.LocalDate.parse(parts[0])
                val dateFmt = datePart.format(java.time.format.DateTimeFormatter.ofPattern("dd MMM yyyy"))
                if (parts.size > 1) {
                    val timePart = parts.subList(1, parts.size).joinToString(" ")
                    "$dateFmt, $timePart"
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
}
