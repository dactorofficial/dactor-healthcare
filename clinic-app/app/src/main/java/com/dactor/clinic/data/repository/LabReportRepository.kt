package com.dactor.clinic.data.repository

import com.dactor.clinic.data.model.LabReport
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.postgrest.postgrest
import io.github.jan.supabase.storage.storage
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import java.time.Instant
import java.util.UUID
import javax.inject.Inject
import javax.inject.Singleton

@Serializable
private data class LabNotificationInsertDto(
    @SerialName("id") val id: String,
    @SerialName("user_id") val userId: String? = null,
    @SerialName("title") val title: String,
    @SerialName("message") val message: String,
    @SerialName("type") val type: String = "lab_report",
    @SerialName("target_audience") val targetAudience: String = "patients",
    @SerialName("appointment_id") val appointmentId: String? = null,
    @SerialName("created_at") val createdAt: String
)

@Singleton
class LabReportRepository @Inject constructor(
    private val supabaseClient: SupabaseClient
) {
    private fun detectFileType(fileName: String?): String? {
        if (fileName.isNullOrBlank()) return null
        val lower = fileName.lowercase()
        return when {
            lower.endsWith(".pdf") -> "pdf"
            lower.endsWith(".jpg") || lower.endsWith(".jpeg") || lower.endsWith(".png") || lower.endsWith(".webp") -> "image"
            else -> "document"
        }
    }

    suspend fun getLabReports(clinicId: String): List<LabReport> = withContext(Dispatchers.IO) {
        try {
            if (clinicId.isBlank()) {
                supabaseClient.postgrest["lab_reports"]
                    .select()
                    .decodeList<LabReport>()
            } else {
                val byClinic = supabaseClient.postgrest["lab_reports"]
                    .select {
                        filter {
                            eq("clinic_id", clinicId)
                        }
                    }.decodeList<LabReport>()
                byClinic
            }
        } catch (e: Exception) {
            e.printStackTrace()
            emptyList()
        }
    }

    suspend fun createLabReport(report: LabReport): LabReport? = withContext(Dispatchers.IO) {
        try {
            val inserted = supabaseClient.postgrest["lab_reports"]
                .insert(report) {
                    select()
                }.decodeSingleOrNull<LabReport>() ?: report
            if (inserted.stage.equals("prepared", ignoreCase = true)) {
                dispatchLabReportNotification(inserted)
            }
            inserted
        } catch (e: Exception) {
            e.printStackTrace()
            null
        }
    }

    suspend fun upsertLabReportForAppointment(
        appointmentId: String,
        clinicId: String,
        patientName: String,
        testName: String,
        stage: String,
        fileUrl: String? = null,
        fileName: String? = null
    ): LabReport? = withContext(Dispatchers.IO) {
        try {
            val existing = try {
                supabaseClient.postgrest["lab_reports"]
                    .select {
                        filter {
                            eq("appointment_id", appointmentId)
                        }
                    }.decodeList<LabReport>().firstOrNull()
            } catch (e: Exception) {
                null
            }

            val nowIso = Instant.now().toString()
            if (existing != null) {
                updateLabReportStage(
                    id = existing.id,
                    newStage = stage,
                    fileUrl = fileUrl ?: existing.fileUrl,
                    fileName = fileName ?: existing.fileName,
                    testName = testName.ifBlank { existing.testName }
                )
                existing.copy(
                    stage = stage,
                    testName = testName.ifBlank { existing.testName },
                    fileUrl = fileUrl ?: existing.fileUrl,
                    fileName = fileName ?: existing.fileName,
                    fileType = detectFileType(fileName ?: existing.fileName),
                    preparedAt = if (stage == "prepared") nowIso else existing.preparedAt
                )
            } else {
                val newReport = LabReport(
                    id = UUID.randomUUID().toString(),
                    appointmentId = appointmentId,
                    clinicId = clinicId,
                    testName = testName.ifBlank { "Complete Diagnostic Panel" },
                    stage = stage,
                    fileUrl = fileUrl,
                    fileName = fileName,
                    fileType = detectFileType(fileName),
                    patientNameVerification = patientName,
                    sampleCollectedAt = nowIso,
                    preparedAt = if (stage == "prepared") nowIso else null
                )
                createLabReport(newReport)
            }
        } catch (e: Exception) {
            e.printStackTrace()
            null
        }
    }

    suspend fun updateLabReportStage(
        id: String,
        newStage: String,
        fileUrl: String? = null,
        fileName: String? = null,
        testName: String? = null
    ): Boolean = withContext(Dispatchers.IO) {
        try {
            val nowIso = Instant.now().toString()
            val detectedType = detectFileType(fileName)
            supabaseClient.postgrest["lab_reports"]
                .update({
                    set("stage", newStage)
                    if (newStage == "sample_collected") {
                        set("sample_collected_at", nowIso)
                    }
                    if (newStage == "prepared") {
                        set("prepared_at", nowIso)
                    }
                    if (fileUrl != null) set("file_url", fileUrl)
                    if (fileName != null) set("file_name", fileName)
                    if (detectedType != null) set("file_type", detectedType)
                    if (!testName.isNullOrBlank()) set("test_name", testName)
                }) {
                    filter {
                        eq("id", id)
                    }
                }

            if (newStage.equals("prepared", ignoreCase = true)) {
                val updatedReport = try {
                    supabaseClient.postgrest["lab_reports"]
                        .select {
                            filter { eq("id", id) }
                        }.decodeSingleOrNull<LabReport>()
                } catch (e: Exception) {
                    null
                }
                if (updatedReport != null) {
                    dispatchLabReportNotification(updatedReport)
                }
            }
            true
        } catch (e: Exception) {
            e.printStackTrace()
            false
        }
    }

    private suspend fun dispatchLabReportNotification(report: LabReport) {
        try {
            val matchedAppt = if (report.appointmentId.isNotBlank()) {
                try {
                    supabaseClient.postgrest["appointments"]
                        .select {
                            filter { eq("id", report.appointmentId) }
                        }.decodeList<com.dactor.clinic.data.model.Appointment>().firstOrNull()
                        ?: supabaseClient.postgrest["appointments"]
                            .select {
                                filter { eq("tracking_code_10_digit", report.appointmentId) }
                            }.decodeList<com.dactor.clinic.data.model.Appointment>().firstOrNull()
                } catch (e: Exception) {
                    null
                }
            } else null

            val patientLabel = report.patientNameVerification?.takeIf { it.isNotBlank() }
                ?: matchedAppt?.patientName
                ?: "Patient"
            val trackingCode = matchedAppt?.trackingCode10Digit ?: report.appointmentId.take(10)
            val actualApptId = matchedAppt?.id ?: report.appointmentId
            val connectedUserId = matchedAppt?.userId?.takeIf { it.isNotBlank() }

            val hasFile = !report.fileUrl.isNullOrBlank()
            val messageText = if (hasFile) {
                "Diagnostic lab report for $patientLabel (Code: #$trackingCode) is now Prepared! Verify your name or mobile number in Live Queue Tracker or Lab Reports to view in-app or download directly."
            } else {
                "Your diagnostic lab test (${report.testName}) for $patientLabel (Code: #$trackingCode) is now Prepared!"
            }

            val dto = LabNotificationInsertDto(
                id = UUID.randomUUID().toString(),
                userId = connectedUserId,
                title = "Lab Report Prepared: ${report.testName}",
                message = messageText,
                type = "lab_report",
                targetAudience = "patients",
                appointmentId = actualApptId,
                createdAt = Instant.now().toString()
            )
            supabaseClient.postgrest["notifications"].insert(dto)

            // Update appointment checkin_status and queue_entries status to report_prepared so Live Queue Tracker shows Prepared
            if (actualApptId.isNotBlank()) {
                try {
                    supabaseClient.postgrest["appointments"].update({
                        set("checkin_status", "report_prepared")
                    }) {
                        filter { eq("id", actualApptId) }
                    }
                } catch (ignored: Exception) {}

                try {
                    supabaseClient.postgrest["queue_entries"].update({
                        set("status", "report_prepared")
                        set("completed_at", Instant.now().toString())
                    }) {
                        filter { eq("appointment_id", actualApptId) }
                    }
                } catch (ignored: Exception) {}
            }
        } catch (e: Exception) {
            try {
                supabaseClient.postgrest["notifications"].insert(
                    mapOf(
                        "title" to "Lab Report Prepared: ${report.testName}",
                        "message" to "Your diagnostic report (${report.testName}) is prepared and ready to view/download (Ref #${report.appointmentId.take(10)}).",
                        "type" to "lab_report",
                        "appointment_id" to report.appointmentId
                    )
                )
            } catch (_: Exception) {
            }
        }
    }

    suspend fun uploadReportDocument(reportId: String, fileName: String, bytes: ByteArray): String? = withContext(Dispatchers.IO) {
        val candidateBuckets = listOf("clinic_photos", "doctor_photos")
        val compressed = com.dactor.clinic.domain.util.FileCompressor.compressBytes(bytes, fileName)
        val cleanName = compressed.fileName.replace("\\s+".toRegex(), "_")
        val path = "lab_reports/${reportId}_$cleanName"
        for (bName in candidateBuckets) {
            try {
                val bucket = supabaseClient.storage[bName]
                bucket.upload(path, compressed.bytes, upsert = true)
                val url = bucket.publicUrl(path)
                if (!url.isNullOrBlank()) {
                    return@withContext url
                }
            } catch (e: Exception) {
                e.printStackTrace()
            }
        }
        null
    }
}
