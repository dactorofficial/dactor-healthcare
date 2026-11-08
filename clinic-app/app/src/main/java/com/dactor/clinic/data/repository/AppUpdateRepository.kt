package com.dactor.clinic.data.repository

import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import com.google.android.play.core.appupdate.AppUpdateInfo
import com.google.android.play.core.appupdate.AppUpdateManager
import com.google.android.play.core.appupdate.AppUpdateManagerFactory
import com.google.android.play.core.install.model.AppUpdateType
import com.google.android.play.core.install.model.UpdateAvailability
import dagger.hilt.android.qualifiers.ApplicationContext
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.postgrest.postgrest
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.withContext
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import javax.inject.Inject
import javax.inject.Singleton

@Serializable
data class AppVersionPolicy(
    val minVersionCode: Int = 0,
    val latestVersionCode: Int = 0,
    val latestVersionName: String = "",
    val isForceUpdate: Boolean = false,
    val updateUrl: String = "https://play.google.com/store/apps/details?id=com.dactor.clinic",
    val releaseNotes: String = ""
)

data class UpdateCheckResult(
    val isUpdateRequired: Boolean,
    val currentVersionCode: Int,
    val currentVersionName: String,
    val policy: AppVersionPolicy,
    val isPlayStoreUpdateAvailable: Boolean = false,
    val playStoreAvailableVersionCode: Int? = null
)

@Serializable
private data class AppVersionRow(
    @SerialName("app_name") val appName: String? = null,
    @SerialName("min_version_code") val minVersionCode: Int? = null,
    @SerialName("latest_version_code") val latestVersionCode: Int? = null,
    @SerialName("latest_version_name") val latestVersionName: String? = null,
    @SerialName("update_url") val updateUrl: String? = null,
    @SerialName("release_notes") val releaseNotes: String? = null,
    @SerialName("is_compulsory") val isCompulsory: Boolean? = null
)

@Serializable
private data class SystemConfigRow(
    @SerialName("name") val name: String? = null,
    @SerialName("category") val category: String? = null,
    @SerialName("search_keywords") val searchKeywords: String? = null,
    @SerialName("description") val description: String? = null
)

@Serializable
private data class SystemSettingRow(
    @SerialName("key") val key: String? = null,
    @SerialName("value") val value: String? = null
)

@Singleton
class AppUpdateRepository @Inject constructor(
    @ApplicationContext private val context: Context,
    private val supabase: SupabaseClient
) {
    private val appUpdateManager: AppUpdateManager by lazy {
        AppUpdateManagerFactory.create(context)
    }

    private var cachedAppUpdateInfo: AppUpdateInfo? = null

    companion object {
        const val UPDATE_REQUEST_CODE = 9102
        private const val PLAY_STORE_WEB_URL = "https://play.google.com/store/apps/details?id=com.dactor.clinic"
        private const val PLAY_STORE_MARKET_URI = "market://details?id=com.dactor.clinic"
    }

    fun getCurrentVersionCode(): Int {
        return try {
            val pm = context.packageManager
            val pkg = context.packageName
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                val info = pm.getPackageInfo(pkg, PackageManager.PackageInfoFlags.of(0))
                info.longVersionCode.toInt()
            } else {
                @Suppress("DEPRECATION")
                val info = pm.getPackageInfo(pkg, 0)
                @Suppress("DEPRECATION")
                info.versionCode
            }
        } catch (_: Exception) {
            64 // Safe fallback aligned with current build
        }
    }

    fun getCurrentVersionName(): String {
        return try {
            val pm = context.packageManager
            val pkg = context.packageName
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                pm.getPackageInfo(pkg, PackageManager.PackageInfoFlags.of(0)).versionName ?: "1.0.64"
            } else {
                @Suppress("DEPRECATION")
                pm.getPackageInfo(pkg, 0).versionName ?: "1.0.64"
            }
        } catch (_: Exception) {
            "1.0.64"
        }
    }

    /**
     * Checks Google Play Core In-App Update API
     */
    suspend fun checkGooglePlayUpdate(): AppUpdateInfo? = withContext(Dispatchers.IO) {
        try {
            val info = appUpdateManager.appUpdateInfo.await()
            cachedAppUpdateInfo = info
            info
        } catch (_: Throwable) {
            // Sideloaded / offline / emulator / Play Store not available
            null
        }
    }

    /**
     * Fetches mandatory version policy from Supabase.
     * Evaluates `system_settings` first, falling back to `medical_specialties (category = 'system_config')`.
     */
    suspend fun fetchAppVersionPolicy(): AppVersionPolicy = withContext(Dispatchers.IO) {
        var minCode = 0
        var latestCode = 0
        var latestName = ""
        var forceUpdate = false
        var updateUrl = PLAY_STORE_WEB_URL
        var releaseNotes = "A mandatory update is required to continue using Dactor Clinic. Please update to maintain live queue accuracy and data synchronization."

        // 1. Try app_versions table (app_name = 'clinic_app')
        try {
            val appVersions = supabase.postgrest["app_versions"]
                .select {
                    filter {
                        eq("app_name", "clinic_app")
                    }
                }
                .decodeList<AppVersionRow>()

            val clinicVer = appVersions.firstOrNull()
            if (clinicVer != null) {
                clinicVer.minVersionCode?.let { minCode = it }
                clinicVer.latestVersionCode?.let { latestCode = it }
                clinicVer.latestVersionName?.takeIf { it.isNotBlank() }?.let { latestName = it }
                clinicVer.isCompulsory?.let { forceUpdate = it }
                clinicVer.updateUrl?.takeIf { it.isNotBlank() }?.let { updateUrl = it }
                clinicVer.releaseNotes?.takeIf { it.isNotBlank() }?.let { releaseNotes = it }
            }
        } catch (_: Exception) {}

        // 2. Query medical_specialties for system_config rows
        try {
            val specRows = supabase.postgrest["medical_specialties"]
                .select {
                    filter {
                        eq("category", "system_config")
                    }
                }
                .decodeList<SystemConfigRow>()

            for (r in specRows) {
                when (r.name) {
                    "system_config:clinic_app_min_version", "system_config:clinic_min_version_code" -> {
                        minCode = r.searchKeywords?.trim()?.toIntOrNull() ?: minCode
                    }
                    "system_config:clinic_app_latest_version", "system_config:clinic_latest_version_code" -> {
                        latestCode = r.searchKeywords?.trim()?.toIntOrNull() ?: latestCode
                    }
                    "system_config:clinic_app_version_name", "system_config:clinic_latest_version_name" -> {
                        latestName = r.searchKeywords?.trim().orEmpty().ifBlank { latestName }
                    }
                    "system_config:clinic_app_is_compulsory", "system_config:clinic_force_update" -> {
                        val flag = r.searchKeywords?.trim()?.equals("true", ignoreCase = true) == true
                        if (flag) forceUpdate = true
                    }
                    "system_config:clinic_app_update_url", "system_config:clinic_update_url" -> {
                        updateUrl = r.searchKeywords?.trim().orEmpty().ifBlank { updateUrl }
                    }
                    "system_config:clinic_app_release_notes", "system_config:clinic_update_notes" -> {
                        val notes = r.description?.trim().orEmpty().ifBlank { r.searchKeywords?.trim().orEmpty() }
                        if (notes.isNotBlank()) releaseNotes = notes
                    }
                }
            }
        } catch (e: Exception) {
            e.printStackTrace()
        }

        // 3. Fallback to system_settings if values not found
        try {
            val rows = supabase.postgrest["system_settings"]
                .select()
                .decodeList<SystemSettingRow>()
            
            for (r in rows) {
                when (r.key) {
                    "clinic_app_min_version_code" -> if (minCode == 0) minCode = r.value?.trim()?.toIntOrNull() ?: minCode
                    "clinic_app_latest_version_code" -> if (latestCode == 0) latestCode = r.value?.trim()?.toIntOrNull() ?: latestCode
                    "clinic_app_latest_version_name" -> if (latestName.isBlank()) latestName = r.value?.trim().orEmpty().ifBlank { latestName }
                    "clinic_app_force_update" -> if (!forceUpdate) forceUpdate = r.value?.trim()?.equals("true", ignoreCase = true) == true
                    "clinic_app_update_url" -> if (updateUrl == PLAY_STORE_WEB_URL) updateUrl = r.value?.trim().orEmpty().ifBlank { updateUrl }
                    "clinic_app_update_notes" -> if (releaseNotes.isBlank()) releaseNotes = r.value?.trim().orEmpty().ifBlank { releaseNotes }
                }
            }
        } catch (_: Exception) {}

        AppVersionPolicy(
            minVersionCode = minCode,
            latestVersionCode = latestCode,
            latestVersionName = latestName.ifBlank { getCurrentVersionName() },
            isForceUpdate = forceUpdate,
            updateUrl = updateUrl,
            releaseNotes = releaseNotes
        )
    }

    /**
     * Executes comprehensive mandatory update check across both Google Play and Supabase Remote Config.
     */
    suspend fun checkUpdateRequirement(): UpdateCheckResult = withContext(Dispatchers.IO) {
        val currentCode = getCurrentVersionCode()
        val currentName = getCurrentVersionName()

        val policy = fetchAppVersionPolicy()
        val playInfo = checkGooglePlayUpdate()

        val isPlayUpdateAvailable = playInfo != null &&
            playInfo.updateAvailability() == UpdateAvailability.UPDATE_AVAILABLE

        // Compulsory condition:
        // 1. If cloud policy defines minVersionCode and current is lower -> Mandatory Update!
        // 2. If cloud policy marks isForceUpdate=true and current is lower than latestVersionCode -> Mandatory Update!
        // 3. If Google Play reports immediate update is available -> Mandatory Update!
        val isCloudRequired = (policy.minVersionCode > 0 && currentCode < policy.minVersionCode) ||
                              (policy.isForceUpdate && policy.latestVersionCode > 0 && currentCode < policy.latestVersionCode)

        val isRequired = isCloudRequired || isPlayUpdateAvailable

        UpdateCheckResult(
            isUpdateRequired = isRequired,
            currentVersionCode = currentCode,
            currentVersionName = currentName,
            policy = policy,
            isPlayStoreUpdateAvailable = isPlayUpdateAvailable,
            playStoreAvailableVersionCode = playInfo?.availableVersionCode()
        )
    }

    /**
     * Launches the update flow:
     * 1. Attempts Google Play In-App Immediate Update (if allowed and available).
     * 2. Launches Google Play Store app directly (`market://details?id=com.dactor.clinic`).
     * 3. Falls back to web browser URL (`https://play.google.com/store/apps/details?id=com.dactor.clinic`).
     */
    fun launchUpdate(activity: Activity?, customUrl: String? = null) {
        val targetUrl = customUrl?.takeIf { it.isNotBlank() } ?: PLAY_STORE_WEB_URL
        
        // 1. Try Google Play In-App Immediate Update
        if (activity != null && cachedAppUpdateInfo != null) {
            try {
                if (cachedAppUpdateInfo!!.updateAvailability() == UpdateAvailability.UPDATE_AVAILABLE &&
                    cachedAppUpdateInfo!!.isUpdateTypeAllowed(AppUpdateType.IMMEDIATE)
                ) {
                    appUpdateManager.startUpdateFlowForResult(
                        cachedAppUpdateInfo!!,
                        AppUpdateType.IMMEDIATE,
                        activity,
                        UPDATE_REQUEST_CODE
                    )
                    return
                }
            } catch (e: Throwable) {
                android.util.Log.w("AppUpdateRepository", "startUpdateFlowForResult error: ${e.message}", e)
            }
        }

        // 2. Launch Google Play App directly
        try {
            val marketIntent = Intent(Intent.ACTION_VIEW, Uri.parse(PLAY_STORE_MARKET_URI)).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
            }
            context.startActivity(marketIntent)
            return
        } catch (_: ActivityNotFoundException) {
            // Google Play app not installed or unavailable
        }

        // 3. Fallback to web browser
        try {
            val webIntent = Intent(Intent.ACTION_VIEW, Uri.parse(targetUrl)).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            context.startActivity(webIntent)
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    /**
     * Resumes an in-progress immediate update when Activity resumes.
     * Fully safe against missing Play Services / non-Play devices.
     */
    fun resumeImmediateUpdateIfInProgress(activity: Activity) {
        try {
            appUpdateManager.appUpdateInfo.addOnSuccessListener { info ->
                try {
                    cachedAppUpdateInfo = info
                    if (info.updateAvailability() == UpdateAvailability.DEVELOPER_TRIGGERED_UPDATE_IN_PROGRESS) {
                        appUpdateManager.startUpdateFlowForResult(
                            info,
                            AppUpdateType.IMMEDIATE,
                            activity,
                            UPDATE_REQUEST_CODE
                        )
                    }
                } catch (e: Throwable) {
                    android.util.Log.w("AppUpdateRepository", "Failed to start update flow for in-progress update", e)
                }
            }.addOnFailureListener { e ->
                // Gracefully ignore on devices without Google Play Services or offline
                android.util.Log.d("AppUpdateRepository", "Google Play Update check failed or unsupported: ${e.message}")
            }
        } catch (e: Throwable) {
            android.util.Log.w("AppUpdateRepository", "Google Play Core appUpdateInfo unavailable", e)
        }
    }
}
