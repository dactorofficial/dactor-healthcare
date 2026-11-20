package com.dactor.clinic.data.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class TransitionQueueEntryStatusResult(
    @SerialName("success") val success: Boolean = false,
    @SerialName("entry_id") val entryId: String? = null,
    @SerialName("appointment_id") val appointmentId: String? = null,
    @SerialName("status") val status: String? = null,
    @SerialName("called_at") val calledAt: String? = null,
    @SerialName("inside_at") val insideAt: String? = null,
    @SerialName("completed_at") val completedAt: String? = null,
    @SerialName("consultation_duration_seconds") val consultationDurationSeconds: Long? = null,
    @SerialName("updated_by_actor_type") val updatedByActorType: String? = null,
    @SerialName("updated_by_actor_id") val updatedByActorId: String? = null,
    @SerialName("error") val error: String? = null,
    @SerialName("message") val message: String? = null,
    @SerialName("current_status") val currentStatus: String? = null
)
