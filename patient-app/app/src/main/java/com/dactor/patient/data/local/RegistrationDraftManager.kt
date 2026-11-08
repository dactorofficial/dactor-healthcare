package com.dactor.patient.data.local

import android.content.Context
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Singleton

data class PendingPatientDraft(
    val fullName: String,
    val phone: String,
    val email: String,
    val password: String
)

@Singleton
class RegistrationDraftManager @Inject constructor(
    @ApplicationContext private val context: Context
) {
    private val prefs = context.getSharedPreferences("dactor_patient_drafts", Context.MODE_PRIVATE)

    fun savePatientDraft(draft: PendingPatientDraft) {
        prefs.edit()
            .putString("patient_name", draft.fullName)
            .putString("patient_phone", draft.phone)
            .putString("patient_email", draft.email)
            .putString("patient_password", draft.password)
            .putBoolean("has_patient_draft", true)
            .apply()
    }

    fun getPatientDraft(): PendingPatientDraft? {
        if (!prefs.getBoolean("has_patient_draft", false)) return null
        val name = prefs.getString("patient_name", null) ?: return null
        val phone = prefs.getString("patient_phone", "") ?: ""
        val email = prefs.getString("patient_email", null) ?: return null
        val password = prefs.getString("patient_password", null) ?: return null
        return PendingPatientDraft(
            fullName = name,
            phone = phone,
            email = email,
            password = password
        )
    }

    fun clearPatientDraft() {
        prefs.edit()
            .remove("patient_name")
            .remove("patient_phone")
            .remove("patient_email")
            .remove("patient_password")
            .putBoolean("has_patient_draft", false)
            .apply()
    }
}
