package com.dactor.clinic.domain.util

import android.app.DatePickerDialog
import android.app.TimePickerDialog
import android.content.Context
import java.time.LocalDate
import java.util.Locale

object DateTimePickers {

    fun showClockTimePicker(
        context: Context,
        currentTime: String,
        onTimeSelected: (String) -> Unit
    ) {
        val clean = currentTime.trim()
        val parts = clean.split(":")
        val initialHour = parts.getOrNull(0)?.trim()?.toIntOrNull() ?: 9
        val initialMinute = parts.getOrNull(1)?.trim()?.take(2)?.toIntOrNull() ?: 0

        TimePickerDialog(
            context,
            { _, hourOfDay, minute ->
                val formatted = String.format(Locale.US, "%02d:%02d", hourOfDay, minute)
                onTimeSelected(formatted)
            },
            initialHour,
            initialMinute,
            false
        ).show()
    }

    fun showDatePicker(
        context: Context,
        currentDate: String,
        onDateSelected: (String) -> Unit
    ) {
        val parts = currentDate.trim().split("-")
        val now = LocalDate.now()
        val initialYear = parts.getOrNull(0)?.toIntOrNull() ?: now.year
        val initialMonth = ((parts.getOrNull(1)?.toIntOrNull() ?: now.monthValue) - 1).coerceIn(0, 11)
        val initialDay = parts.getOrNull(2)?.toIntOrNull() ?: now.dayOfMonth

        DatePickerDialog(
            context,
            { _, year, month, dayOfMonth ->
                val formatted = String.format(Locale.US, "%04d-%02d-%02d", year, month + 1, dayOfMonth)
                onDateSelected(formatted)
            },
            initialYear,
            initialMonth,
            initialDay
        ).show()
    }

    fun addMinutesToTime(time: String, minutesToAdd: Int): String {
        val parts = time.trim().split(":")
        val hour = parts.getOrNull(0)?.toIntOrNull() ?: 9
        val minute = parts.getOrNull(1)?.take(2)?.toIntOrNull() ?: 0
        val totalMinutes = hour * 60 + minute + minutesToAdd
        val normalized = totalMinutes % (24 * 60)
        val newHour = normalized / 60
        val newMin = normalized % 60
        return String.format(Locale.US, "%02d:%02d", newHour, newMin)
    }
}
