package com.dactor.clinic.data.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class Profile(
    @SerialName("id") val id: String,
    @SerialName("auth_uid") val authUid: String? = null,
    @SerialName("email") val email: String,
    @SerialName("full_name") val fullName: String? = null,
    @SerialName("role") val role: String? = null,
    @SerialName("phone") val phone: String? = null,
    @SerialName("gender") val gender: String? = null,
    @SerialName("age") val age: Int? = null,
    @SerialName("is_archived") val isArchived: Boolean? = false,
    @SerialName("archived_at") val archivedAt: String? = null,
    @SerialName("deletion_scheduled_at") val deletionScheduledAt: String? = null,
    @SerialName("created_at") val createdAt: String? = null,
    @SerialName("updated_at") val updatedAt: String? = null
)
