package com.dactor.patient.data.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class QueueEntry(
    val id: String,
    @SerialName("appointment_id") val appointmentId: String,
    @SerialName("clinic_id") val clinicId: String,
    @SerialName("doctor_id") val doctorId: String? = null,
    @SerialName("queue_position") val queuePosition: Int = 1,
    val status: String = "waiting",
    @SerialName("called_at") val calledAt: String? = null,
    @SerialName("inside_at") val insideAt: String? = null,
    @SerialName("completed_at") val completedAt: String? = null
)
