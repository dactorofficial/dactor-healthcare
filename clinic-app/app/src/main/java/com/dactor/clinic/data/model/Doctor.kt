package com.dactor.clinic.data.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class Doctor(
    @SerialName("id") val id: String,
    @SerialName("user_id") val userId: String? = null,
    @SerialName("clinic_id") val clinicId: String? = null,
    @SerialName("full_name") val fullName: String,
    @SerialName("email") val email: String,
    @SerialName("specialty") val specialty: String? = null,
    @SerialName("specialties") val specialties: List<String> = emptyList(),
    @SerialName("gender") val gender: String? = null,
    @SerialName("age") val age: Int? = null,
    @SerialName("starting_practicing_year") val startingPracticingYear: Int? = null,
    @SerialName("profile_picture_url") val profilePictureUrl: String? = null,
    @SerialName("education") val education: String? = null,
    @SerialName("personal_mobile_number") val personalMobileNumber: String? = null,
    @SerialName("public_mobile_number") val publicMobileNumber: String? = null,
    @SerialName("description") val description: String? = null,
    @SerialName("nmc_license_number") val nmcLicenseNumber: String? = null,
    @SerialName("license_doc_url") val licenseDocUrl: String? = null,
    @SerialName("certificates_doc_url") val certificatesDocUrl: String? = null,
    @SerialName("kyc_status") val kycStatus: String? = null,
    @SerialName("is_in_clinic") val isInClinic: Boolean = false,
    @SerialName("active_clinic_id") val activeClinicId: String? = null,
    @SerialName("primary_clinic_id") val primaryClinicId: String? = null,
    @SerialName("consultation_fee") val consultationFee: Double? = null,
    @SerialName("practitioner_role") val practitionerRole: String? = null
) {
    val isLabTechnician: Boolean
        get() = practitionerRole.equals("lab_technician", ignoreCase = true) ||
                specialty?.contains("Lab Technician", ignoreCase = true) == true ||
                specialty?.contains("Pathology Technician", ignoreCase = true) == true ||
                education?.contains("MLT", ignoreCase = true) == true

    val resolvedProfilePictureUrl: String?
        get() {
            val raw = profilePictureUrl?.trim()
            if (raw.isNullOrBlank()) return null
            if (raw.startsWith("http://") || raw.startsWith("https://")) {
                return raw
            }
            val cleanPath = raw.removePrefix("/")
            return when {
                cleanPath.startsWith("doctor_photos/") || cleanPath.startsWith("doctor-photos/") || cleanPath.startsWith("avatars/") -> {
                    "https://ojfoofojcpabqegxmsab.supabase.co/storage/v1/object/public/$cleanPath"
                }
                else -> {
                    "https://ojfoofojcpabqegxmsab.supabase.co/storage/v1/object/public/doctor_photos/$cleanPath"
                }
            }
        }
}

