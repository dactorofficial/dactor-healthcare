package com.dactor.patient.data.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class Slot(
    val id: String = "",
    @SerialName("clinic_id") val clinicId: String = "",
    @SerialName("doctor_id") val doctorId: String? = null,
    @SerialName("slot_date") val slotDate: String = "",
    @SerialName("start_time") val startTime: String = "",
    @SerialName("end_time") val endTime: String = "",
    @SerialName("max_capacity") val maxCapacity: Int = 20,
    @SerialName("booked_count") val bookedCount: Int = 0,
    @SerialName("is_published") val isPublished: Boolean = true
)
