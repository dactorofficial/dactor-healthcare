package com.dactor.patient.data.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class ClinicService(
    val id: String,
    @SerialName("clinic_id") val clinicId: String,
    @SerialName("service_name") val serviceName: String,
    val description: String? = null,
    val price: Double = 0.0
)
