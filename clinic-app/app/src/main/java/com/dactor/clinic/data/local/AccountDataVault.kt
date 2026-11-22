package com.dactor.clinic.data.local

import android.content.Context

/**
 * Keeps each account's own data on the phone across sign-outs, hidden from other accounts.
 *
 * On sign-out the account's session, drafts and "last used clinic/doctor" entries are moved
 * into a copy named after the account; on sign-in that copy is moved back. No server call.
 *
 * Not touched: the encrypted local database (rows are scoped by clinic id, so another clinic's
 * account never sees them) and common data (clinic/doctor lists, images).
 */
object AccountDataVault {

    /** Prefs file -> keys that belong to one account (null = every key in the file). */
    private val USER_DATA: Map<String, Set<String>?> = mapOf(
        "dactor_user_session" to null,
        "dactor_registration_drafts" to null,
        "dactor_clinic_persistent_cache" to setOf("last_active_clinic"),
        "dactor_doctor_persistent_cache" to setOf("last_active_doctor"),
    )

    /** Device-level keys that stay with the phone. */
    private val DEVICE_KEYS = setOf("has_accepted_terms_v1")

    fun accountKey(emailOrId: String?): String? =
        emailOrId?.trim()?.lowercase()?.takeIf { it.isNotBlank() }
            ?.replace(Regex("[^a-z0-9._@-]"), "_")

    fun hide(context: Context, accountKey: String) {
        for ((file, keys) in USER_DATA) {
            val active = context.getSharedPreferences(file, Context.MODE_PRIVATE)
            val vaultEditor = context.getSharedPreferences(vaultName(file, accountKey), Context.MODE_PRIVATE).edit().clear()
            val activeEditor = active.edit()
            for ((key, value) in active.all) {
                if (key in DEVICE_KEYS || (keys != null && key !in keys)) continue
                put(vaultEditor, key, value)
                activeEditor.remove(key)
            }
            vaultEditor.apply()
            activeEditor.apply()
        }
    }

    fun restore(context: Context, accountKey: String) {
        for (file in USER_DATA.keys) {
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
