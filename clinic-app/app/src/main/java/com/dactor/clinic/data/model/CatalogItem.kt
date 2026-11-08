package com.dactor.clinic.data.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class CatalogItem(
    @SerialName("id") val id: String,
    @SerialName("clinic_id") val clinicId: String,
    @SerialName("item_name") val itemName: String,
    @SerialName("category") val category: String? = null,
    @SerialName("price") val price: Double
)
