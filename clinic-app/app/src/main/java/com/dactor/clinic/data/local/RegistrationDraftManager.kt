package com.dactor.clinic.data.local

import android.content.Context
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Singleton

data class PendingClinicDraft(
    val name: String,
    val phone: String,
    val email: String,
    val password: String,
    val address: String,
    val latitude: Double,
    val longitude: Double,
    val type: String,
    val description: String?
)

data class PendingDoctorDraft(
    val fullName: String,
    val email: String,
    val password: String,
    val specialty: String,
    val fee: Double
)

@Singleton
class RegistrationDraftManager @Inject constructor(
    @ApplicationContext private val context: Context
) {
    private val prefs = context.getSharedPreferences("dactor_registration_drafts", Context.MODE_PRIVATE)

    fun saveClinicDraft(draft: PendingClinicDraft) {
        prefs.edit()
            .putString("clinic_name", draft.name)
            .putString("clinic_phone", draft.phone)
            .putString("clinic_email", draft.email)
            .putString("clinic_password", draft.password)
            .putString("clinic_address", draft.address)
            .putFloat("clinic_lat", draft.latitude.toFloat())
            .putFloat("clinic_lng", draft.longitude.toFloat())
            .putString("clinic_type", draft.type)
            .putString("clinic_description", draft.description ?: "")
            .putBoolean("has_clinic_draft", true)
            .apply()
    }

    fun getClinicDraft(): PendingClinicDraft? {
        if (!prefs.getBoolean("has_clinic_draft", false)) return null
        val name = prefs.getString("clinic_name", null) ?: return null
        val phone = prefs.getString("clinic_phone", "") ?: ""
        val email = prefs.getString("clinic_email", null) ?: return null
        val password = prefs.getString("clinic_password", null) ?: return null
        val address = prefs.getString("clinic_address", "") ?: ""
        val lat = prefs.getFloat("clinic_lat", 27.7052f).toDouble()
        val lng = prefs.getFloat("clinic_lng", 85.3193f).toDouble()
        val type = prefs.getString("clinic_type", "single_visit") ?: "single_visit"
        val desc = prefs.getString("clinic_description", null)?.ifBlank { null }
        return PendingClinicDraft(
            name = name,
            phone = phone,
            email = email,
            password = password,
            address = address,
            latitude = lat,
            longitude = lng,
            type = type,
            description = desc
        )
    }

    fun clearClinicDraft() {
        prefs.edit()
            .remove("clinic_name")
            .remove("clinic_phone")
            .remove("clinic_email")
            .remove("clinic_password")
            .remove("clinic_address")
            .remove("clinic_lat")
            .remove("clinic_lng")
            .remove("clinic_type")
            .remove("clinic_description")
            .putBoolean("has_clinic_draft", false)
            .apply()
    }

    fun saveDoctorDraft(draft: PendingDoctorDraft) {
        prefs.edit()
            .putString("doctor_name", draft.fullName)
            .putString("doctor_email", draft.email)
            .putString("doctor_password", draft.password)
            .putString("doctor_specialty", draft.specialty)
            .putFloat("doctor_fee", draft.fee.toFloat())
            .putBoolean("has_doctor_draft", true)
            .apply()
    }

    fun getDoctorDraft(): PendingDoctorDraft? {
        if (!prefs.getBoolean("has_doctor_draft", false)) return null
        val name = prefs.getString("doctor_name", null) ?: return null
        val email = prefs.getString("doctor_email", null) ?: return null
        val password = prefs.getString("doctor_password", null) ?: return null
        val specialty = prefs.getString("doctor_specialty", "General Medicine") ?: "General Medicine"
        val fee = prefs.getFloat("doctor_fee", 500f).toDouble()
        return PendingDoctorDraft(
            fullName = name,
            email = email,
            password = password,
            specialty = specialty,
            fee = fee
        )
    }

    fun clearDoctorDraft() {
        prefs.edit()
            .remove("doctor_name")
            .remove("doctor_email")
            .remove("doctor_password")
            .remove("doctor_specialty")
            .remove("doctor_fee")
            .putBoolean("has_doctor_draft", false)
            .apply()
    }
}
