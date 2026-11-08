package com.dactor.clinic.domain.util

import java.text.NumberFormat
import java.util.Locale

object CurrencyFormatter {
    fun formatNPR(amount: Double): String {
        val format = NumberFormat.getCurrencyInstance(Locale("en", "NP"))
        return format.format(amount)
    }

    fun formatNpr(amount: Double): String = formatNPR(amount)
}
