package com.dactor.clinic.data.local.security

import android.content.Context
import android.content.SharedPreferences
import android.os.Build
import android.util.Base64
import android.util.Log
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import dagger.hilt.android.qualifiers.ApplicationContext
import java.security.SecureRandom
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Manages the 256-bit AES cryptographic passphrase used by SQLCipher to encrypt
 * the local Room SQLite database at rest.
 * Backed by hardware keystore via Jetpack Security (EncryptedSharedPreferences).
 */
@Singleton
class DatabaseKeyManager @Inject constructor(
    @ApplicationContext private val context: Context
) {
    companion object {
        private const val TAG = "DatabaseKeyManager"
        private const val PREFS_FILE = "dactor_vault_db_sec"
        private const val FALLBACK_PREFS_FILE = "dactor_vault_db_sec_fb"
        private const val KEY_DB_PASSPHRASE = "k_sqlcipher_db_pass"
        private const val KEY_LENGTH_BYTES = 32 // 256 bits
    }

    /**
     * Retrieves or generates a 256-bit AES passphrase for SQLCipher SupportFactory.
     * Hardened against Android Keystore invalidation, AEADBadTagException,
     * and OEM crypto provider failures across app updates.
     */
    @Synchronized
    fun getOrCreatePassphrase(): ByteArray {
        val prefs = getEncryptedPreferencesOrFallback()

        var encodedPass: String? = null
        try {
            encodedPass = prefs.getString(KEY_DB_PASSPHRASE, null)
        } catch (t: Throwable) {
            Log.e(TAG, "Failed to read database passphrase from SharedPreferences. Purging corrupted prefs.", t)
            resetCorruptedPrefs()
        }

        if (!encodedPass.isNullOrBlank()) {
            try {
                val decoded = Base64.decode(encodedPass, Base64.NO_WRAP)
                if (decoded.size == KEY_LENGTH_BYTES) {
                    return decoded
                }
            } catch (t: Throwable) {
                Log.w(TAG, "Failed to decode existing database passphrase; generating a fresh key.", t)
            }
        }

        // Generate a new secure 256-bit key
        val randomBytes = ByteArray(KEY_LENGTH_BYTES)
        SecureRandom().nextBytes(randomBytes)
        val newEncodedPass = Base64.encodeToString(randomBytes, Base64.NO_WRAP)

        // Attempt saving to primary prefs, falling back if write fails
        var saved = false
        try {
            prefs.edit().putString(KEY_DB_PASSPHRASE, newEncodedPass).apply()
            saved = true
        } catch (t: Throwable) {
            Log.e(TAG, "Failed to save key in primary prefs. Attempting fallback.", t)
        }

        if (!saved) {
            try {
                val fbPrefs = context.getSharedPreferences(FALLBACK_PREFS_FILE, Context.MODE_PRIVATE)
                fbPrefs.edit().putString(KEY_DB_PASSPHRASE, newEncodedPass).apply()
            } catch (t: Throwable) {
                Log.e(TAG, "Failed to save key in fallback prefs.", t)
            }
        }

        return randomBytes
    }

    private fun getEncryptedPreferencesOrFallback(): SharedPreferences {
        return try {
            createEncryptedSharedPreferences()
        } catch (t: Throwable) {
            Log.w(TAG, "MasterKey / EncryptedSharedPreferences unavailable or corrupt. Attempting cleanup.", t)
            resetCorruptedPrefs()
            try {
                createEncryptedSharedPreferences()
            } catch (t2: Throwable) {
                Log.e(TAG, "Secondary EncryptedSharedPreferences initialization failed. Using fallback SharedPreferences.", t2)
                context.getSharedPreferences(FALLBACK_PREFS_FILE, Context.MODE_PRIVATE)
            }
        }
    }

    private fun createEncryptedSharedPreferences(): SharedPreferences {
        val masterKey = MasterKey.Builder(context)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            .build()

        return EncryptedSharedPreferences.create(
            context,
            PREFS_FILE,
            masterKey,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
        )
    }

    private fun resetCorruptedPrefs() {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                context.deleteSharedPreferences(PREFS_FILE)
            } else {
                context.getSharedPreferences(PREFS_FILE, Context.MODE_PRIVATE).edit().clear().apply()
            }
        } catch (t: Throwable) {
            Log.w(TAG, "Could not delete corrupted shared preferences: ${t.message}", t)
        }
    }
}
