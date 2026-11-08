package com.dactor.clinic.data.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class LabReport(
    @SerialName("id") val id: String = "",
    @SerialName("appointment_id") val appointmentId: String = "",
    @SerialName("clinic_id") val clinicId: String = "",
    @SerialName("test_name") val testName: String = "Lab Diagnostic Report",
    @SerialName("stage") val stage: String = "sample_collected",
    @SerialName("file_url") val fileUrl: String? = null,
    @SerialName("file_name") val fileName: String? = null,
    @SerialName("file_type") val fileType: String? = null,
    @SerialName("patient_name_verification") val patientNameVerification: String? = null,
    @SerialName("sample_collected_at") val sampleCollectedAt: String? = null,
    @SerialName("prepared_at") val preparedAt: String? = null
)
