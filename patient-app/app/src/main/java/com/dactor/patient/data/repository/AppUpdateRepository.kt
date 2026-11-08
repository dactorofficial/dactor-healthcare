package com.dactor.patient.data.repository

import android.content.Context
import androidx.core.content.pm.PackageInfoCompat
import com.dactor.patient.data.model.AppUpdateCheckResult
import com.dactor.patient.data.model.AppVersionDto
import com.dactor.patient.data.model.MedicalSpecialty
import dagger.hilt.android.qualifiers.ApplicationContext
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.postgrest.postgrest
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class AppUpdateRepository @Inject constructor(
    private val supabaseClient: SupabaseClient,
    @ApplicationContext private val context: Context
) {
    private val prefs = context.getSharedPreferences("dactor_app_update_prefs", Context.MODE_PRIVATE)

    fun getInstalledVersionCode(): Long {
        return try {
            val pInfo = context.packageManager.getPackageInfo(context.packageName, 0)
            PackageInfoCompat.getLongVersionCode(pInfo)
        } catch (_: Exception) {
            110L
        }
    }

    fun getInstalledVersionName(): String {
        return try {
            val pInfo = context.packageManager.getPackageInfo(context.packageName, 0)
            pInfo.versionName ?: "1.0.10"
        } catch (_: Exception) {
            "1.0.10"
        }
    }

    suspend fun checkAppUpdate(): AppUpdateCheckResult = withContext(Dispatchers.IO) {
        val installedCode = getInstalledVersionCode()
        val installedName = getInstalledVersionName()

        var minCode = prefs.getInt("cached_min_version_code", 1)
        var latestCode = prefs.getInt("cached_latest_version_code", installedCode.toInt())
        var latestName = prefs.getString("cached_latest_version_name", installedName) ?: installedName
        var updateUrl = prefs.getString(
            "cached_update_url",
            "https://play.google.com/store/apps/details?id=${context.packageName}"
        ) ?: "https://play.google.com/store/apps/details?id=${context.packageName}"
        var releaseNotes = prefs.getString(
            "cached_release_notes",
            "A critical update is available. Please update to continue using Dactor."
        ) ?: "A critical update is available. Please update to continue using Dactor."
        var isCompulsory = prefs.getBoolean("cached_is_compulsory", true)

        try {
            // 1. Try querying dedicated app_versions table first
            var fetchedFromAppVersions = false
            try {
                val versions = supabaseClient.postgrest["app_versions"]
                    .select {
                        filter {
                            eq("app_name", "patient_app")
                        }
                    }
                    .decodeList<AppVersionDto>()
                val matched = versions.firstOrNull()
                if (matched != null) {
                    minCode = matched.minVersionCode
                    latestCode = matched.latestVersionCode
                    latestName = matched.latestVersionName
                    if (matched.updateUrl.isNotBlank()) updateUrl = matched.updateUrl
                    if (!matched.releaseNotes.isNullOrBlank()) releaseNotes = matched.releaseNotes
                    isCompulsory = matched.isCompulsory
                    fetchedFromAppVersions = true
                }
            } catch (_: Exception) {
                // Table might not exist yet; gracefully proceed to dual-layer fallback
            }

            // 2. Dual-layer fallback: query medical_specialties (category = 'system_config')
            if (!fetchedFromAppVersions) {
                try {
                    val configs = supabaseClient.postgrest["medical_specialties"]
                        .select {
                            filter {
                                eq("category", "system_config")
                                eq("is_active", true)
                            }
                        }
                        .decodeList<MedicalSpecialty>()

                    configs.forEach { row ->
                        val cleanVal = row.searchKeywords.trim()
                        when (row.name) {
                            "system_config:patient_app_min_version" -> {
                                cleanVal.toIntOrNull()?.let { minCode = it }
                            }
                            "system_config:patient_app_latest_version",
                            "system_config:patient_app_latest_code" -> {
                                cleanVal.toIntOrNull()?.let { latestCode = it }
                            }
                            "system_config:patient_app_version_name" -> {
                                if (cleanVal.isNotBlank()) latestName = cleanVal
                            }
                            "system_config:patient_app_update_url" -> {
                                if (cleanVal.isNotBlank()) updateUrl = cleanVal
                            }
                            "system_config:patient_app_release_notes" -> {
                                if (cleanVal.isNotBlank()) releaseNotes = cleanVal
                            }
                            "system_config:patient_app_is_compulsory" -> {
                                isCompulsory = cleanVal.equals("true", ignoreCase = true)
                            }
                        }
                    }
                } catch (_: Exception) {}
            }

            // Cache successfully resolved values
            prefs.edit()
                .putInt("cached_min_version_code", minCode)
                .putInt("cached_latest_version_code", latestCode)
                .putString("cached_latest_version_name", latestName)
                .putString("cached_update_url", updateUrl)
                .putString("cached_release_notes", releaseNotes)
                .putBoolean("cached_is_compulsory", isCompulsory)
                .apply()
        } catch (_: Exception) {
            // Network failure: uses cached values
        }

        // An update is compulsory if installed version is below minVersionCode or latestCode (when compulsory is true)
        val updateRequired = (installedCode < minCode && isCompulsory) || (installedCode < latestCode && isCompulsory)

        AppUpdateCheckResult(
            isUpdateRequired = updateRequired,
            installedVersionCode = installedCode,
            installedVersionName = installedName,
            minVersionCode = minCode,
            latestVersionCode = latestCode,
            latestVersionName = latestName,
            updateUrl = updateUrl,
            releaseNotes = releaseNotes,
            isCompulsory = isCompulsory
        )
    }
}
