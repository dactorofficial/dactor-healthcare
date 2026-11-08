package com.dactor.patient.data.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class ClinicInvitation(
    @SerialName("id") val id: String,
    @SerialName("clinic_id") val clinicId: String,
    @SerialName("email") val email: String,
    @SerialName("role") val role: String,
    @SerialName("status") val status: String,
    @SerialName("created_at") val createdAt: String? = null
)
