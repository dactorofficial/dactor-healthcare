package com.dactor.clinic.ui.i18n

import androidx.compose.runtime.compositionLocalOf

interface DactorClinicStrings {
    // Dialogs & Pickers
    val chooseLanguageTitle: String
    val languageEnglish: String
    val languageNepali: String
    val closeBtn: String
    val applyBtn: String
    val cancelBtn: String

    // Common
    val commonSearch: String
    val commonConfirm: String
    val commonSave: String
    val commonLoading: String
    val commonRefresh: String
    val commonBack: String
    val commonDelete: String
    val commonEdit: String
    val commonActive: String
    val commonInactive: String
    val commonRsPrefix: String

    // Dashboard & Header
    val dashboardTitle: String
    val doctorDashboardTitle: String
    val liveQueueCardTitle: String
    val walkinCardTitle: String
    val billingCardTitle: String
    val patientDirectoryTitle: String
    val doctorInStatus: String
    val doctorOutStatus: String
    val clinicBreakActive: String
    val notificationsTitle: String
    val subscriptionDaysLeft: String

    // Queue Board & Consultations
    val queueWaitingTab: String
    val queueInConsultTab: String
    val queueDoneTab: String
    val queueCallNextBtn: String
    val queueRecallBtn: String
    val queueMarkDoneBtn: String
    val queueNoShowBtn: String
    val queueTransferBtn: String

    // Settings
    val settingsHeader: String
    val appLanguageLabel: String
    val appLanguageSub: String
    val changeLanguageBtn: String
    val signOutBtn: String
}

object ClinicEnglishStrings : DactorClinicStrings {
    override val chooseLanguageTitle: String = "Choose Language / भाषा छान्नुहोस्"
    override val languageEnglish: String = "English"
    override val languageNepali: String = "नेपाली (Nepali)"
    override val closeBtn: String = "Close"
    override val applyBtn: String = "Apply"
    override val cancelBtn: String = "Cancel"

    override val commonSearch: String = "Search..."
    override val commonConfirm: String = "Confirm"
    override val commonSave: String = "Save"
    override val commonLoading: String = "Loading..."
    override val commonRefresh: String = "Refresh"
    override val commonBack: String = "Back"
    override val commonDelete: String = "Delete"
    override val commonEdit: String = "Edit"
    override val commonActive: String = "Active"
    override val commonInactive: String = "Inactive"
    override val commonRsPrefix: String = "Rs."

    override val dashboardTitle: String = "Clinic Operations Dashboard"
    override val doctorDashboardTitle: String = "Doctor Consultation Desk"
    override val liveQueueCardTitle: String = "Live OPD Queue Board"
    override val walkinCardTitle: String = "Reception Walk-In Token"
    override val billingCardTitle: String = "Billing & Invoices"
    override val patientDirectoryTitle: String = "Patient Directory"
    override val doctorInStatus: String = "Doctor In Clinic"
    override val doctorOutStatus: String = "Doctor Away"
    override val clinicBreakActive: String = "Clinic On Break"
    override val notificationsTitle: String = "Notifications & Broadcasts"
    override val subscriptionDaysLeft: String = "days left"

    override val queueWaitingTab: String = "Waiting"
    override val queueInConsultTab: String = "In Consultation"
    override val queueDoneTab: String = "Completed"
    override val queueCallNextBtn: String = "Call Next Patient"
    override val queueRecallBtn: String = "Call In Again"
    override val queueMarkDoneBtn: String = "Mark Completed"
    override val queueNoShowBtn: String = "No-Show"
    override val queueTransferBtn: String = "Transfer Queue"

    override val settingsHeader: String = "Clinic & App Settings"
    override val appLanguageLabel: String = "App Language"
    override val appLanguageSub: String = "English"
    override val changeLanguageBtn: String = "Change"
    override val signOutBtn: String = "Sign Out"
}

object ClinicNepaliStrings : DactorClinicStrings {
    override val chooseLanguageTitle: String = "भाषा छान्नुहोस् (Choose Language)"
    override val languageEnglish: String = "English"
    override val languageNepali: String = "नेपाली (Nepali)"
    override val closeBtn: String = "बन्द गर्नुहोस्"
    override val applyBtn: String = "लागू गर्नुहोस्"
    override val cancelBtn: String = "रद्द गर्नुहोस्"

    override val commonSearch: String = "खोज्नुहोस्..."
    override val commonConfirm: String = "पुष्टि गर्नुहोस्"
    override val commonSave: String = "सुरक्षित गर्नुहोस्"
    override val commonLoading: String = "लोड हुँदैछ..."
    override val commonRefresh: String = "ताजा गर्नुहोस्"
    override val commonBack: String = "पछाडि"
    override val commonDelete: String = "हटाउनुहोस्"
    override val commonEdit: String = "सम्पादन"
    override val commonActive: String = "सक्रिय"
    override val commonInactive: String = "निष्क्रिय"
    override val commonRsPrefix: String = "रु."

    override val dashboardTitle: String = "क्लिनिक व्यवस्थापन ड्यासबोर्ड"
    override val doctorDashboardTitle: String = "डाक्टर परामर्श डेस्क"
    override val liveQueueCardTitle: String = "प्रत्यक्ष ओपीडी लाम बोर्ड"
    override val walkinCardTitle: String = "काउन्टर वाक-इन टोकन"
    override val billingCardTitle: String = "बिलिङ तथा रसिदहरू"
    override val patientDirectoryTitle: String = "बिरामी डाइरेक्टरी"
    override val doctorInStatus: String = "डाक्टर क्लिनिकभित्र"
    override val doctorOutStatus: String = "डाक्टर बाहिर"
    override val clinicBreakActive: String = "क्लिनिक ब्रेकमा"
    override val notificationsTitle: String = "सूचना तथा अलर्टहरू"
    override val subscriptionDaysLeft: String = "दिन बाँकी"

    override val queueWaitingTab: String = "प्रतीक्षारत"
    override val queueInConsultTab: String = "परामर्श कक्षमा"
    override val queueDoneTab: String = "सम्पन्न"
    override val queueCallNextBtn: String = "पालो बोलाउनुहोस्"
    override val queueRecallBtn: String = "पुनः बोलाउनुहोस्"
    override val queueMarkDoneBtn: String = "सम्पन्न गर्नुहोस्"
    override val queueNoShowBtn: String = "उपस्थित नभएको"
    override val queueTransferBtn: String = "लाम स्थानान्तरण"

    override val settingsHeader: String = "क्लिनिक तथा एप सेटिङ"
    override val appLanguageLabel: String = "एपको भाषा (App Language)"
    override val appLanguageSub: String = "नेपाली"
    override val changeLanguageBtn: String = "परिवर्तन गर्नुहोस्"
    override val signOutBtn: String = "साइन आउट"
}

val LocalClinicStrings = compositionLocalOf<DactorClinicStrings> { ClinicEnglishStrings }
val LocalClinicLanguage = compositionLocalOf<ClinicLanguage> { ClinicLanguage.ENGLISH }
val LocalUpdateClinicLanguage = compositionLocalOf<(ClinicLanguage) -> Unit> { {} }
