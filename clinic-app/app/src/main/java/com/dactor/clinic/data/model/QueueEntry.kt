package com.dactor.clinic.data.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class QueueEntry(
    @SerialName("id") val id: String,
    @SerialName("appointment_id") val appointmentId: String,
    @SerialName("clinic_id") val clinicId: String,
    @SerialName("doctor_id") val doctorId: String? = null,
    @SerialName("queue_position") val queuePosition: Int,
    @SerialName("status") val status: String,
    @SerialName("called_at") val calledAt: String? = null,
    @SerialName("inside_at") val insideAt: String? = null,
    @SerialName("completed_at") val completedAt: String? = null,
    @SerialName("consultation_duration_seconds") val consultationDurationSeconds: Long? = null,
    @SerialName("created_at") val createdAt: String? = null
)
