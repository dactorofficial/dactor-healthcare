package com.dactor.clinic.data.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class MedicalQualification(
    @SerialName("id") val id: String,
    @SerialName("degree_name") val degreeName: String,
    @SerialName("level") val level: String? = "Postgraduate",
    @SerialName("field_of_study") val fieldOfStudy: String? = "Medicine",
    @SerialName("description") val description: String? = null,
    @SerialName("is_active") val isActive: Boolean = true,
    @SerialName("created_at") val createdAt: String? = null
)
