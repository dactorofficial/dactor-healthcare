package com.dactor.patient.data.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class AppVersionDto(
    @SerialName("id") val id: String? = null,
    @SerialName("app_name") val appName: String = "patient_app",
    @SerialName("min_version_code") val minVersionCode: Int = 1,
    @SerialName("latest_version_code") val latestVersionCode: Int = 1,
    @SerialName("latest_version_name") val latestVersionName: String = "1.0.0",
    @SerialName("update_url") val updateUrl: String = "https://play.google.com/store/apps/details?id=com.dactor.patient",
    @SerialName("release_notes") val releaseNotes: String? = null,
    @SerialName("is_compulsory") val isCompulsory: Boolean = true,
    @SerialName("is_temporarily_closed") val isTemporarilyClosed: Boolean = false,
    @SerialName("closure_title") val closureTitle: String? = null,
    @SerialName("closure_message") val closureMessage: String? = null
)

data class AppUpdateCheckResult(
    val isUpdateRequired: Boolean,
    val installedVersionCode: Long,
    val installedVersionName: String,
    val minVersionCode: Int,
    val latestVersionCode: Int,
    val latestVersionName: String,
    val updateUrl: String,
    val releaseNotes: String,
    val isCompulsory: Boolean,
    val isTemporarilyClosed: Boolean = false,
    val closureTitle: String? = null,
    val closureMessage: String? = null
)
