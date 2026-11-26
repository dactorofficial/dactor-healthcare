package com.dactor.patient.ui.i18n

import androidx.compose.runtime.compositionLocalOf

interface DactorStrings {
    // Domain Sub-Interfaces
    val common: PatientCommonStrings
    val discoveryBooking: PatientDiscoveryBookingStrings
    val queueRecords: PatientQueueRecordsStrings
    val profileAuth: PatientProfileAuthStrings

    // Legacy direct getters for seamless compatibility
    val chooseLanguageTitle: String get() = common.chooseLanguageTitle
    val chooseLanguageSubtitle: String get() = common.chooseLanguageSubtitle
    val languageEnglish: String get() = common.languageEnglish
    val languageNepali: String get() = common.languageNepali
    val confirmAndContinue: String get() = common.confirmAndContinue
    val changeLaterHint: String get() = common.changeLaterHint
    val changeLanguageTitle: String get() = common.changeLanguageTitle
    val applyBtn: String get() = common.applyBtn
    val cancelBtn: String get() = common.cancelBtn

    val navHome: String get() = discoveryBooking.navHome
    val navRecords: String get() = discoveryBooking.navRecords
    val navAppointments: String get() = discoveryBooking.navAppointments
    val navProfile: String get() = discoveryBooking.navProfile

    val commonSearch: String get() = common.search
    val commonClose: String get() = common.close
    val commonBack: String get() = common.back
    val commonConfirm: String get() = common.confirm
    val commonLoading: String get() = common.loading
    val commonRetry: String get() = common.retry
    val commonRefresh: String get() = common.refresh
    val commonSave: String get() = common.save
    val commonEdit: String get() = common.edit
    val commonDelete: String get() = common.delete
    val commonViewAll: String get() = common.viewAll
    val commonResetFilters: String get() = common.resetFilters
    val commonVerified: String get() = common.verified
    val commonInClinic: String get() = common.inClinic
    val commonAway: String get() = common.away
    val commonFree: String get() = common.free
    val commonRsPrefix: String get() = common.rsPrefix

    val homeLocationPrompt: String get() = discoveryBooking.homeLocationPrompt
    val homeSearchPlaceholder: String get() = discoveryBooking.homeSearchPlaceholder
    val homeFilterAll: String get() = discoveryBooking.homeFilterAll
    val homeFilterDoctors: String get() = discoveryBooking.homeFilterDoctors
    val homeFilterClinics: String get() = discoveryBooking.homeFilterClinics
    val homeSortLabel: String get() = discoveryBooking.homeSortLabel
    val homeSortRecommended: String get() = discoveryBooking.homeSortRecommended
    val homeSortInClinic: String get() = discoveryBooking.homeSortInClinic
    val homeSortLowFee: String get() = discoveryBooking.homeSortLowFee
    val homeSortName: String get() = discoveryBooking.homeSortName
    val homeFeaturedDoctors: String get() = discoveryBooking.homeFeaturedDoctors
    val homeFeaturedClinics: String get() = discoveryBooking.homeFeaturedClinics
    val homeNoDoctorsFound: String get() = discoveryBooking.homeNoDoctorsFound
    val homeNoClinicsFound: String get() = discoveryBooking.homeNoClinicsFound
    val homeSelectCity: String get() = discoveryBooking.homeSelectCity
    val homeLiveGps: String get() = discoveryBooking.homeLiveGps
    val homeTodayApptTitle: String get() = discoveryBooking.homeTodayApptTitle
    val homeTodayApptSub: String get() = discoveryBooking.homeTodayApptSub
    val homeBookNow: String get() = discoveryBooking.homeBookNow
    val homeNextAvailable: String get() = discoveryBooking.homeNextAvailable

    val queueStatusTitle: String get() = queueRecords.queueStatusTitle
    val queueTrackPrompt: String get() = queueRecords.queueTrackPrompt
    val queueTokenLabel: String get() = queueRecords.queueTokenLabel
    val queuePositionLabel: String get() = queueRecords.queuePositionLabel
    val queueEstWaitLabel: String get() = queueRecords.queueEstWaitLabel
    val queueDoctorInside: String get() = queueRecords.queueDoctorInside
    val queueDoctorAway: String get() = queueRecords.queueDoctorAway
    val queueCancelNotice: String get() = queueRecords.queueCancelNotice

    val recordsHeaderTitle: String get() = queueRecords.recordsHeaderTitle
    val recordsHeaderSub: String get() = queueRecords.recordsHeaderSub
    val recordsFilterAll: String get() = queueRecords.recordsFilterAll
    val recordsFilterCompleted: String get() = queueRecords.recordsFilterCompleted
    val recordsFilterWithBills: String get() = queueRecords.recordsFilterWithBills
    val recordsLinkCodeBtn: String get() = queueRecords.recordsLinkCodeBtn
    val recordsCombinedTotal: String get() = queueRecords.recordsCombinedTotal
    val recordsCombinedPaid: String get() = queueRecords.recordsCombinedPaid
    val recordsCombinedDue: String get() = queueRecords.recordsCombinedDue
    val recordsViewDetails: String get() = queueRecords.recordsViewDetails

    val apptsActiveTitle: String get() = discoveryBooking.homeTodayApptTitle
    val apptsActiveSub: String get() = discoveryBooking.homeTodayApptSub
    val apptsInQueueToday: String get() = queueRecords.queueStatusTitle
    val apptsScheduledUpcoming: String get() = "Upcoming Appointments"
    val apptsRescheduleBtn: String get() = queueRecords.queueRescheduleBtn
    val apptsTrackQueueBtn: String get() = discoveryBooking.viewTokenBtn
    val apptsEmptyMsg: String get() = "No active appointments found"

    val settingsHeader: String get() = profileAuth.settingsHeader
    val appLanguageLabel: String get() = profileAuth.appLanguageLabel
    val appLanguageSub: String get() = profileAuth.appLanguageSub
    val changeLanguageBtn: String get() = profileAuth.changeLanguageBtn
    val editProfileTitle: String get() = profileAuth.editProfileTitle
    val editProfileSub: String get() = profileAuth.editProfileSub
    val pushNotifTitle: String get() = profileAuth.pushNotifTitle
    val pushNotifSub: String get() = profileAuth.pushNotifSub
    val pushNotifActive: String get() = profileAuth.pushNotifActive
    val clearCacheTitle: String get() = profileAuth.clearCacheTitle
    val clearCacheSub: String get() = profileAuth.clearCacheSub
    val txHistoryTitle: String get() = profileAuth.txHistoryTitle
    val txHistorySub: String get() = profileAuth.txHistorySub
    val termsPolicyTitle: String get() = profileAuth.termsPolicyTitle
    val termsPolicySub: String get() = profileAuth.termsPolicySub
    val signOutBtn: String get() = profileAuth.signOutBtn
    val deleteAccountTitle: String get() = profileAuth.deleteAccountTitle
    val deleteAccountSub: String get() = profileAuth.deleteAccountSub
    val guestAccountBadge: String get() = profileAuth.guestAccountBadge
    val guestAccountTitle: String get() = profileAuth.guestAccountTitle
    val guestAccountSub: String get() = profileAuth.guestAccountSub
    val signInGoogleBtn: String get() = profileAuth.signInGoogleBtn

    val slide1Badge: String get() = profileAuth.slide1Badge
    val slide1Title: String get() = profileAuth.slide1Title
    val slide1Desc: String get() = profileAuth.slide1Desc
    val slide1Pill1: String get() = profileAuth.slide1Pill1
    val slide1Pill2: String get() = profileAuth.slide1Pill2

    val slide2Badge: String get() = profileAuth.slide2Badge
    val slide2Title: String get() = profileAuth.slide2Title
    val slide2Desc: String get() = profileAuth.slide2Desc
    val slide2Pill1: String get() = profileAuth.slide2Pill1
    val slide2Pill2: String get() = profileAuth.slide2Pill2

    val slide3Badge: String get() = profileAuth.slide3Badge
    val slide3Title: String get() = profileAuth.slide3Title
    val slide3Desc: String get() = profileAuth.slide3Desc
    val slide3Pill1: String get() = profileAuth.slide3Pill1
    val slide3Pill2: String get() = profileAuth.slide3Pill2

    val slide4Badge: String get() = profileAuth.slide4Badge
    val slide4Title: String get() = profileAuth.slide4Title
    val slide4Desc: String get() = profileAuth.slide4Desc
    val slide4Pill1: String get() = profileAuth.slide4Pill1
    val slide4Pill2: String get() = profileAuth.slide4Pill2

    val slide5Badge: String get() = profileAuth.slide5Badge
    val slide5Title: String get() = profileAuth.slide5Title
    val slide5Desc: String get() = profileAuth.slide5Desc
    val signInWithGoogle: String get() = profileAuth.signInWithGoogle
    val continueAsGuest: String get() = profileAuth.continueAsGuest
    val guestModeDesc: String get() = profileAuth.guestModeDesc
    val nextBtn: String get() = profileAuth.nextBtn
}

object EnglishStrings : DactorStrings {
    override val common: PatientCommonStrings = PatientCommonEnglish
    override val discoveryBooking: PatientDiscoveryBookingStrings = PatientDiscoveryBookingEnglish
    override val queueRecords: PatientQueueRecordsStrings = PatientQueueRecordsEnglish
    override val profileAuth: PatientProfileAuthStrings = PatientProfileAuthEnglish
}

object NepaliStrings : DactorStrings {
    override val common: PatientCommonStrings = PatientCommonNepali
    override val discoveryBooking: PatientDiscoveryBookingStrings = PatientDiscoveryBookingNepali
    override val queueRecords: PatientQueueRecordsStrings = PatientQueueRecordsNepali
    override val profileAuth: PatientProfileAuthStrings = PatientProfileAuthNepali
}

val LocalAppStrings = compositionLocalOf<DactorStrings> { EnglishStrings }
val LocalAppLanguage = compositionLocalOf<AppLanguage> { AppLanguage.ENGLISH }
val LocalUpdateAppLanguage = compositionLocalOf<(AppLanguage) -> Unit> { {} }
