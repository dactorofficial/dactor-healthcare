package com.dactor.patient.domain.util

import java.text.NumberFormat
import java.util.Locale

object CurrencyFormatter {
    fun formatNPR(amount: Double): String {
        val format = NumberFormat.getNumberInstance(Locale("en", "IN"))
        return "Rs. ${format.format(amount)}"
    }
}
