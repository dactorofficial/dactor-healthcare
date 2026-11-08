package com.dactor.clinic.domain.util

import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.temporal.ChronoUnit

object ArchiveDateUtils {
    fun calculateDaysRemaining(deletionScheduledAt: String?): Long {
        if (deletionScheduledAt.isNullOrBlank()) return 30L
        return try {
            val target = Instant.parse(deletionScheduledAt)
            val now = Instant.now()
            val secondsDiff = target.epochSecond - now.epochSecond
            if (secondsDiff <= 0) return 0L
            val days = (secondsDiff + 86399) / 86400
            days.coerceAtLeast(0L).coerceAtMost(30L)
        } catch (e: Exception) {
            try {
                val targetDate = LocalDate.parse(deletionScheduledAt.take(10))
                val today = LocalDate.now()
                val days = ChronoUnit.DAYS.between(today, targetDate)
                if (days <= 0) 0L else days.coerceAtLeast(0L).coerceAtMost(30L)
            } catch (e2: Exception) {
                30L
            }
        }
    }

    fun formatScheduledDeletionDate(deletionScheduledAt: String?): String {
        if (deletionScheduledAt.isNullOrBlank()) {
            val defaultDate = LocalDate.now().plusDays(30)
            return "${defaultDate.month.name.lowercase().replaceFirstChar { it.uppercase() }} ${defaultDate.dayOfMonth}, ${defaultDate.year}"
        }
        return try {
            val dt = Instant.parse(deletionScheduledAt)
            val localDate = dt.atZone(ZoneId.systemDefault()).toLocalDate()
            "${localDate.month.name.lowercase().replaceFirstChar { it.uppercase() }} ${localDate.dayOfMonth}, ${localDate.year}"
        } catch (e: Exception) {
            try {
                val localDate = LocalDate.parse(deletionScheduledAt.take(10))
                "${localDate.month.name.lowercase().replaceFirstChar { it.uppercase() }} ${localDate.dayOfMonth}, ${localDate.year}"
            } catch (e2: Exception) {
                deletionScheduledAt.take(10)
            }
        }
    }

    fun isClinicActivationValid(isActivated: Boolean?, activationExpiresAt: String?): Boolean {
        if (isActivated == false) return false
        if (activationExpiresAt.isNullOrBlank()) return true
        return calculateActivationDaysLeft(activationExpiresAt) > 0
    }

    fun calculateActivationDaysLeft(activationExpiresAt: String?): Long {
        if (activationExpiresAt.isNullOrBlank()) return 30L
        return try {
            val target = Instant.parse(activationExpiresAt)
            val now = Instant.now()
            val secondsDiff = target.epochSecond - now.epochSecond
            if (secondsDiff <= 0) return 0L
            val days = (secondsDiff + 86399) / 86400
            days.coerceAtLeast(0L)
        } catch (e: Exception) {
            try {
                val targetDate = LocalDate.parse(activationExpiresAt.take(10))
                val today = LocalDate.now()
                val days = ChronoUnit.DAYS.between(today, targetDate)
                if (days <= 0) 0L else days.coerceAtLeast(0L)
            } catch (e2: Exception) {
                30L
            }
        }
    }

    fun formatActivationExpiryDate(activationExpiresAt: String?): String {
        if (activationExpiresAt.isNullOrBlank()) {
            val defaultDate = LocalDate.now().plusDays(30)
            return "${defaultDate.month.name.lowercase().replaceFirstChar { it.uppercase() }} ${defaultDate.dayOfMonth}, ${defaultDate.year}"
        }
        return try {
            val dt = Instant.parse(activationExpiresAt)
            val localDate = dt.atZone(ZoneId.systemDefault()).toLocalDate()
            "${localDate.month.name.lowercase().replaceFirstChar { it.uppercase() }} ${localDate.dayOfMonth}, ${localDate.year}"
        } catch (e: Exception) {
            try {
                val localDate = LocalDate.parse(activationExpiresAt.take(10))
                "${localDate.month.name.lowercase().replaceFirstChar { it.uppercase() }} ${localDate.dayOfMonth}, ${localDate.year}"
            } catch (e2: Exception) {
                activationExpiresAt.take(10)
            }
        }
    }
}
