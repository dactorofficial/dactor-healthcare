package com.dactor.patient.data.repository

import com.dactor.patient.data.model.LabReport
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.postgrest.postgrest
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class LabReportRepository @Inject constructor(
    private val supabaseClient: SupabaseClient
) {
    suspend fun getLabReportById(id: String): LabReport? = withContext(Dispatchers.IO) {
        try {
            supabaseClient.postgrest["lab_reports"]
                .select {
                    filter {
                        eq("id", id)
                    }
                }.decodeSingleOrNull<LabReport>()
        } catch (e: Exception) {
            e.printStackTrace()
            null
        }
    }

    suspend fun getLabReportsForAppointment(
        appointmentId: String,
        trackingCode: String? = null
    ): List<LabReport> = withContext(Dispatchers.IO) {
        try {
            val cleanApptId = appointmentId.trim()
            val cleanTracking = trackingCode?.trim()
            val targetIds = listOfNotNull(
                cleanApptId.takeIf { it.isNotBlank() },
                cleanTracking?.takeIf { it.isNotBlank() && it != cleanApptId }
            ).distinct()
            if (targetIds.isEmpty()) return@withContext emptyList()

            supabaseClient.postgrest["lab_reports"]
                .select {
                    filter {
                        if (targetIds.size == 1) {
                            eq("appointment_id", targetIds[0])
                        } else {
                            isIn("appointment_id", targetIds)
                        }
                    }
                }.decodeList<LabReport>()
        } catch (e: Exception) {
            e.printStackTrace()
            emptyList()
        }
    }

    fun verifyPatientName(expectedName: String, enteredName: String): Boolean {
        val normalizedExpected = expectedName.trim().lowercase().replace(Regex("\\s+"), " ")
        val normalizedEntered = enteredName.trim().lowercase().replace(Regex("\\s+"), " ")
        return normalizedExpected.isEmpty() || (normalizedEntered.isNotEmpty() && (normalizedExpected == normalizedEntered || normalizedExpected.contains(normalizedEntered) || normalizedEntered.contains(normalizedExpected)))
    }
}
