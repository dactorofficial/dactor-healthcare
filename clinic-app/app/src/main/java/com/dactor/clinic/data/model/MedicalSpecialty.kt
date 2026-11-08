package com.dactor.clinic.data.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class MedicalSpecialty(
    @SerialName("id") val id: String,
    @SerialName("name") val name: String,
    @SerialName("category") val category: String? = "Specialized Care",
    @SerialName("description") val description: String? = null,
    @SerialName("search_keywords") val searchKeywords: String = "",
    @SerialName("icon") val icon: String? = "stethoscope",
    @SerialName("is_active") val isActive: Boolean = true,
    @SerialName("created_at") val createdAt: String? = null
)
