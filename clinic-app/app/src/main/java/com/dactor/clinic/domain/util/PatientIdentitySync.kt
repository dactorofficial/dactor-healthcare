package com.dactor.clinic.domain.util

import java.util.UUID

object PatientIdentitySync {
    /**
     * Derives a canonical, deterministic RFC 4122 v3 UUID for any patient email (e.g. Gmail).
     * Two walk-ins or registrations with the same email will always produce the identical UUID.
     */
    fun getDeterministicPatientIdForEmail(email: String): String {
        val clean = email.trim().lowercase()
        return UUID.nameUUIDFromBytes("dactor:patient:$clean".toByteArray(Charsets.UTF_8)).toString()
    }

    /**
     * Derives a canonical, deterministic RFC 4122 v3 UUID for a 10-digit mobile phone number.
     */
    fun getDeterministicPatientIdForPhone(phone: String): String {
        val clean = phone.filter { it.isDigit() }.takeLast(10)
        return UUID.nameUUIDFromBytes("dactor:patient:phone:$clean".toByteArray(Charsets.UTF_8)).toString()
    }

    /**
     * Computes a permanent, deterministic 10-digit numeric ID for a given patient UUID.
     * Used for the Patient Directory Record ID and Offline Tracking.
     */
    fun getDeterministicAppointmentId(patientId: String): String {
        val h1 = Math.abs(patientId.hashCode().toLong())
        val h2 = Math.abs(patientId.reversed().hashCode().toLong())
        val num = (h1 * 100000L + (h2 % 100000L)) % 9000000000L + 1000000000L
        return num.toString()
    }

    /**
     * Validates whether a given string is a valid UUID.
     */
    fun isValidUuid(str: String?): Boolean {
        if (str.isNullOrBlank()) return false
        return try {
            UUID.fromString(str)
            true
        } catch (_: Exception) {
            false
        }
    }
}
