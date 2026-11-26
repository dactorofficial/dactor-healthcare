package com.dactor.patient.ui.i18n

import java.util.Locale

enum class AppLanguage(
    val code: String,
    val displayName: String,
    val nativeName: String,
    val shortBadge: String,
    val javaLocale: Locale
) {
    ENGLISH("en", "English", "English", "EN", Locale.US),
    NEPALI("ne", "Nepali", "नेपाली", "ने", Locale("ne", "NP"));

    companion object {
        fun fromCode(code: String?): AppLanguage =
            entries.firstOrNull { it.code.equals(code, ignoreCase = true) } ?: ENGLISH
    }
}

