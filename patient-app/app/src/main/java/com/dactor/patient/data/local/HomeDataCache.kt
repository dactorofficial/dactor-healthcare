package com.dactor.patient.data.local

import android.content.Context
import com.dactor.patient.data.model.Clinic
import com.dactor.patient.data.model.ClinicService
import com.dactor.patient.data.model.Doctor
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

/**
 * Clinic, doctor and service lists saved on the phone. They are the same for every account
 * and rarely change, so the home screen reuses them for [MAX_AGE_MS] instead of downloading
 * everything on every app open. Slot availability is not cached (it changes with bookings).
 */
object HomeDataCache {
    private const val PREFS = "dactor_common_data_cache"
    private const val KEY = "home_lists"
    const val MAX_AGE_MS = 6 * 60 * 60 * 1000L

    private val json = Json { ignoreUnknownKeys = true; isLenient = true; encodeDefaults = true; coerceInputValues = true }

    @Serializable
    data class HomeLists(
        val savedAt: Long,
        val clinics: List<Clinic>,
        val servicesByClinic: Map<String, List<ClinicService>>,
        val standaloneDoctors: List<Doctor>,
        val rosterByClinic: Map<String, List<Doctor>>
    )

    /** Saved lists if younger than [MAX_AGE_MS], else null. */
    fun loadFresh(context: Context): HomeLists? = runCatching {
        val raw = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY, null) ?: return null
        json.decodeFromString(HomeLists.serializer(), raw)
            .takeIf { System.currentTimeMillis() - it.savedAt in 0 until MAX_AGE_MS && it.clinics.isNotEmpty() }
    }.getOrNull()

    fun save(context: Context, lists: HomeLists) {
        runCatching {
            context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
                .putString(KEY, json.encodeToString(HomeLists.serializer(), lists))
                .apply()
        }
    }
}
