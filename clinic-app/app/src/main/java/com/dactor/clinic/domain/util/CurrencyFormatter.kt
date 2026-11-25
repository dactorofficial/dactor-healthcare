package com.dactor.clinic.domain.util

import java.util.Locale
import kotlin.math.abs
import kotlin.math.roundToLong

object CurrencyFormatter {
    /**
     * Formats NPR amounts with Nepali lakh/crore grouping (e.g. `Rs. 1,25,000`),
     * omitting decimals unless non-zero paisa exist, and prefixing negative
     * values with a typographic minus (`− Rs. 500`).
     */
    fun formatNPR(amount: Double): String {
        val safe = if (amount.isNaN() || amount.isInfinite()) 0.0 else amount
        val totalPaisa = (abs(safe) * 100.0).roundToLong()
        val isNegative = safe < -0.004 && totalPaisa > 0L
        val whole = totalPaisa / 100L
        val paisa = (totalPaisa % 100L).toInt()

        val groupedWhole = formatNepaliGrouping(whole)
        val formattedNumber = if (paisa > 0) {
            "$groupedWhole.${String.format(Locale.US, "%02d", paisa)}"
        } else {
            groupedWhole
        }
        return if (isNegative) "\u2212 Rs. $formattedNumber" else "Rs. $formattedNumber"
    }

    fun formatNpr(amount: Double): String = formatNPR(amount)

    private fun formatNepaliGrouping(value: Long): String {
        val digits = value.toString()
        if (digits.length <= 3) return digits
        val lastThree = digits.takeLast(3)
        val remaining = digits.dropLast(3)
        val chunks = mutableListOf<String>()
        var idx = remaining.length
        while (idx > 0) {
            val start = (idx - 2).coerceAtLeast(0)
            chunks.add(remaining.substring(start, idx))
            idx = start
        }
        return chunks.reversed().joinToString(",") + "," + lastThree
    }
}
