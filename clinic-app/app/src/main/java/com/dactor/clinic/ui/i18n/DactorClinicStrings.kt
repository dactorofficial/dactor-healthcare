package com.dactor.clinic.ui.i18n

import androidx.compose.runtime.compositionLocalOf

interface DactorClinicStrings {
    // Domain Sub-Interfaces
    val common: ClinicCommonStrings
    val authDashboard: ClinicAuthDashboardStrings
    val queueOps: ClinicQueueOperationsStrings
    val billingLab: ClinicBillingLabPatientsStrings

    // Legacy direct shortcuts for backward compatibility
    val chooseLanguageTitle: String get() = common.chooseLanguageTitle
    val languageEnglish: String get() = common.languageEnglish
    val languageNepali: String get() = common.languageNepali
    val closeBtn: String get() = common.closeBtn
    val applyBtn: String get() = common.applyBtn
    val cancelBtn: String get() = common.cancelBtn

    val commonSearch: String get() = common.search
    val commonConfirm: String get() = common.confirm
    val commonSave: String get() = common.save
    val commonLoading: String get() = common.loading
    val commonRefresh: String get() = common.refresh
    val commonBack: String get() = common.back
    val commonDelete: String get() = common.delete
    val commonEdit: String get() = common.edit
    val commonActive: String get() = common.active
    val commonInactive: String get() = common.inactive
    val commonRsPrefix: String get() = common.rsPrefix

    val dashboardTitle: String get() = authDashboard.clinicDashboardTitle
    val doctorDashboardTitle: String get() = authDashboard.doctorDashboardTitle
    val liveQueueCardTitle: String get() = authDashboard.tileLiveQueue
    val walkinCardTitle: String get() = authDashboard.tileWalkinToken
    val billingCardTitle: String get() = authDashboard.tileBilling
    val patientDirectoryTitle: String get() = authDashboard.tilePatients
    val doctorInStatus: String get() = authDashboard.doctorInClinic
    val doctorOutStatus: String get() = authDashboard.doctorAway
    val clinicBreakActive: String get() = authDashboard.clinicOnBreak
    val notificationsTitle: String get() = authDashboard.tileNotifications
    val subscriptionDaysLeft: String get() = authDashboard.trialDaysRemaining

    val queueWaitingTab: String get() = queueOps.tabWaiting
    val queueInConsultTab: String get() = queueOps.tabInConsult
    val queueDoneTab: String get() = queueOps.tabCompleted
    val queueCallNextBtn: String get() = queueOps.callNextPatient
    val queueRecallBtn: String get() = queueOps.recallPatient
    val queueMarkDoneBtn: String get() = queueOps.markCompleted
    val queueNoShowBtn: String get() = queueOps.markNoShow
    val queueTransferBtn: String get() = queueOps.transferQueue

    val settingsHeader: String get() = authDashboard.tileSettings
    val appLanguageLabel: String get() = common.chooseLanguageTitle
    val appLanguageSub: String get() = if (this is ClinicNepaliStrings) "नेपाली" else "English"
    val changeLanguageBtn: String get() = common.edit
    val signOutBtn: String get() = "Sign Out"
}

object ClinicEnglishStrings : DactorClinicStrings {
    override val common: ClinicCommonStrings = ClinicCommonEnglish
    override val authDashboard: ClinicAuthDashboardStrings = ClinicAuthDashboardEnglish
    override val queueOps: ClinicQueueOperationsStrings = ClinicQueueOperationsEnglish
    override val billingLab: ClinicBillingLabPatientsStrings = ClinicBillingLabPatientsEnglish
    override val signOutBtn: String = "Sign Out"
}

object ClinicNepaliStrings : DactorClinicStrings {
    override val common: ClinicCommonStrings = ClinicCommonNepali
    override val authDashboard: ClinicAuthDashboardStrings = ClinicAuthDashboardNepali
    override val queueOps: ClinicQueueOperationsStrings = ClinicQueueOperationsNepali
    override val billingLab: ClinicBillingLabPatientsStrings = ClinicBillingLabPatientsNepali
    override val signOutBtn: String = "साइन आउट"
}

val LocalClinicStrings = compositionLocalOf<DactorClinicStrings> { ClinicEnglishStrings }
val LocalClinicLanguage = compositionLocalOf<ClinicLanguage> { ClinicLanguage.ENGLISH }
val LocalUpdateClinicLanguage = compositionLocalOf<(ClinicLanguage) -> Unit> { {} }
