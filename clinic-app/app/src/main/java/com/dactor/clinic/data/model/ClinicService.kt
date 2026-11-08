package com.dactor.clinic.data.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class ClinicService(
    @SerialName("id") val id: String,
    @SerialName("clinic_id") val clinicId: String,
    @SerialName("service_name") val serviceName: String,
    @SerialName("description") val description: String? = null,
    @SerialName("price") val price: Double
)
