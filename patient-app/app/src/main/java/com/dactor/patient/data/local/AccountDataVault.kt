package com.dactor.patient.data.local

import android.content.Context

/**
 * Keeps each account's own data on the phone across sign-outs, hidden from other accounts.
 *
 * On sign-out the account's prefs are moved into a copy named after the account and the
 * active prefs are cleared, so the next user (or guest) sees nothing of theirs.
 * On sign-in the copy for that account is moved back. No server call is involved.
 *
 * Common data (clinic/doctor lists, images) lives elsewhere and is never touched.
 */
object AccountDataVault {

    /** Prefs files that hold one account's own data. */
    private val USER_FILES = listOf("dactor_patient_session", "dactor_alert_planner", "dactor_patient_drafts")

    /** Device-level keys that stay with the phone, not with an account. */
    private val DEVICE_KEYS = setOf("has_seen_onboarding", "has_accepted_terms_v1", "fcm_token")

    fun accountKey(emailOrId: String?): String? =
        emailOrId?.trim()?.lowercase()?.takeIf { it.isNotBlank() }
            ?.replace(Regex("[^a-z0-9._@-]"), "_")

    /** Move the active account data into its hidden copy and clear the active files. */
    fun hide(context: Context, accountKey: String) {
        for (file in USER_FILES) {
            val active = context.getSharedPreferences(file, Context.MODE_PRIVATE)
            val vault = context.getSharedPreferences(vaultName(file, accountKey), Context.MODE_PRIVATE)
            val vaultEditor = vault.edit().clear()
            val activeEditor = active.edit()
            for ((key, value) in active.all) {
                if (key in DEVICE_KEYS) continue
                put(vaultEditor, key, value)
                activeEditor.remove(key)
            }
            vaultEditor.apply()
            activeEditor.apply()
        }
    }

    /** Bring back the hidden copy for this account, if any. */
    fun restore(context: Context, accountKey: String) {
        for (file in USER_FILES) {
            val vault = context.getSharedPreferences(vaultName(file, accountKey), Context.MODE_PRIVATE)
            val saved = vault.all
            if (saved.isEmpty()) continue
            val activeEditor = context.getSharedPreferences(file, Context.MODE_PRIVATE).edit()
            for ((key, value) in saved) {
                if (key in DEVICE_KEYS) continue
                put(activeEditor, key, value)
            }
            activeEditor.apply()
            vault.edit().clear().apply()
        }
    }

    private fun vaultName(file: String, accountKey: String) = "${file}__acct_$accountKey"

    @Suppress("UNCHECKED_CAST")
    private fun put(editor: android.content.SharedPreferences.Editor, key: String, value: Any?) {
        when (value) {
            is String -> editor.putString(key, value)
            is Boolean -> editor.putBoolean(key, value)
            is Int -> editor.putInt(key, value)
            is Long -> editor.putLong(key, value)
            is Float -> editor.putFloat(key, value)
            is Set<*> -> editor.putStringSet(key, value as Set<String>)
        }
    }
}
