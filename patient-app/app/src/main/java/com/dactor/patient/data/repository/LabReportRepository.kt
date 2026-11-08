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

            // 1. Direct query by appointment_id (primary UUID)
            if (cleanApptId.isNotBlank()) {
                val directReports = supabaseClient.postgrest["lab_reports"]
                    .select {
                        filter {
                            eq("appointment_id", cleanApptId)
                        }
                    }.decodeList<LabReport>()
                if (directReports.isNotEmpty()) return@withContext directReports
            }

            // 2. Direct query by trackingCode if different
            if (!cleanTracking.isNullOrBlank() && cleanTracking != cleanApptId) {
                val reportsByCode = supabaseClient.postgrest["lab_reports"]
                    .select {
                        filter {
                            eq("appointment_id", cleanTracking)
                        }
                    }.decodeList<LabReport>()
                if (reportsByCode.isNotEmpty()) return@withContext reportsByCode
            }

            // 3. Fallback: query all reports and filter
            val allReports = supabaseClient.postgrest["lab_reports"]
                .select()
                .decodeList<LabReport>()
            val targetIds = listOfNotNull(
                cleanApptId.takeIf { it.isNotBlank() },
                cleanTracking?.takeIf { it.isNotBlank() }
            ).toSet()
            allReports.filter { it.appointmentId in targetIds }
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
