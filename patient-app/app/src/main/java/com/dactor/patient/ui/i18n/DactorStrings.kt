package com.dactor.patient.ui.i18n

import androidx.compose.runtime.compositionLocalOf

interface DactorStrings {
    // Language Picker Dialog
    val chooseLanguageTitle: String
    val chooseLanguageSubtitle: String
    val languageEnglish: String
    val languageNepali: String
    val confirmAndContinue: String
    val changeLaterHint: String
    val changeLanguageTitle: String
    val applyBtn: String
    val cancelBtn: String

    // Bottom Navigation
    val navHome: String
    val navRecords: String
    val navAppointments: String
    val navProfile: String

    // Onboarding Slides
    val slide1Badge: String
    val slide1Title: String
    val slide1Desc: String
    val slide1Pill1: String
    val slide1Pill2: String

    val slide2Badge: String
    val slide2Title: String
    val slide2Desc: String
    val slide2Pill1: String
    val slide2Pill2: String

    val slide3Badge: String
    val slide3Title: String
    val slide3Desc: String
    val slide3Pill1: String
    val slide3Pill2: String

    val slide4Badge: String
    val slide4Title: String
    val slide4Desc: String
    val slide4Pill1: String
    val slide4Pill2: String

    val slide5Badge: String
    val slide5Title: String
    val slide5Desc: String
    val signInWithGoogle: String
    val continueAsGuest: String
    val guestModeDesc: String
    val nextBtn: String

    // Settings & Profile
    val settingsHeader: String
    val appLanguageLabel: String
    val appLanguageSub: String
    val changeLanguageBtn: String
    val editProfileTitle: String
    val editProfileSub: String
    val pushNotifTitle: String
    val pushNotifSub: String
    val pushNotifActive: String
    val clearCacheTitle: String
    val clearCacheSub: String
    val txHistoryTitle: String
    val txHistorySub: String
    val termsPolicyTitle: String
    val termsPolicySub: String
}

object EnglishStrings : DactorStrings {
    override val chooseLanguageTitle: String = "Choose Your Language"
    override val chooseLanguageSubtitle: String = "Select your preferred language to continue"
    override val languageEnglish: String = "English"
    override val languageNepali: String = "नेपाली (Nepali)"
    override val confirmAndContinue: String = "Confirm & Continue"
    override val changeLaterHint: String = "You can change this anytime from Settings"
    override val changeLanguageTitle: String = "Change Language"
    override val applyBtn: String = "Apply"
    override val cancelBtn: String = "Cancel"

    override val navHome: String = "Home"
    override val navRecords: String = "Records"
    override val navAppointments: String = "Appointments"
    override val navProfile: String = "Profile"

    override val slide1Badge: String = "SMART CLINIC VISITS"
    override val slide1Title: String = "Instant Clinic Appointments"
    override val slide1Desc: String = "Skip the long waiting lines. Browse verified specialist doctors and clinics across Nepal, compare fees, and reserve your guaranteed OPD slot in seconds."
    override val slide1Pill1: String = "Guaranteed OPD Slot Confirmation"
    override val slide1Pill2: String = "Verified Clinics & Doctors Across Nepal"

    override val slide2Badge: String = "REAL-TIME OPD QUEUE"
    override val slide2Title: String = "Live Queue Tracking"
    override val slide2Desc: String = "Track your exact consultation queue position live from home. Arrive precisely when your turn is called with zero waiting room hassle."
    override val slide2Pill1: String = "Real-time Live Token Position"
    override val slide2Pill2: String = "Estimated Wait Time & Delay Alerts"

    override val slide3Badge: String = "INSTANT SMART ALERTS"
    override val slide3Title: String = "Smart Appointment Alerts"
    override val slide3Desc: String = "Receive automated priority push notifications when your doctor is ready or if your token moves forward in the live queue."
    override val slide3Pill1: String = "Instant Push Notifications"
    override val slide3Pill2: String = "Doctor In-Clinic Arrival Notifications"

    override val slide4Badge: String = "DIGITAL MEDICAL RECORDS"
    override val slide4Title: String = "Instant Lab Reports & History"
    override val slide4Desc: String = "Access your digital medical lab reports, consultation bills, and diagnostic records directly on your phone securely."
    override val slide4Pill1: String = "End-to-End Encrypted Access"
    override val slide4Pill2: String = "Official PDF Download & Print"

    override val slide5Badge: String = "GET STARTED"
    override val slide5Title: String = "Welcome to Dactor Nepal"
    override val slide5Desc: String = "Connect with top verified medical clinics and specialist doctors. Track live queues and receive instant health alerts."
    override val signInWithGoogle: String = "Sign in with Google"
    override val continueAsGuest: String = "Continue as Guest"
    override val guestModeDesc: String = "In Guest Mode, you can search clinics, explore doctors, track live queues with code, and receive real-time notifications. Sign-in is only required to book an appointment."
    override val nextBtn: String = "Next"

    override val settingsHeader: String = "Settings & Account Preferences"
    override val appLanguageLabel: String = "App Language"
    override val appLanguageSub: String = "English"
    override val changeLanguageBtn: String = "Change"
    override val editProfileTitle: String = "Edit Profile Details"
    override val editProfileSub: String = "Name, phone, age, gender"
    override val pushNotifTitle: String = "Push Notifications (FCM)"
    override val pushNotifSub: String = "Real-time live queue alerts & calls"
    override val pushNotifActive: String = "Active"
    override val clearCacheTitle: String = "Clear Saved Tracking Codes"
    override val clearCacheSub: String = "Reset local tracking codes on this device"
    override val txHistoryTitle: String = "Transaction History"
    override val txHistorySub: String = "All appointment payments, times, and transaction IDs"
    override val termsPolicyTitle: String = "Terms & Privacy Policy"
    override val termsPolicySub: String = "Official patient confidentiality & legal terms"
}

object NepaliStrings : DactorStrings {
    override val chooseLanguageTitle: String = "भाषा चयन गर्नुहोस्"
    override val chooseLanguageSubtitle: String = "अगाडि बढ्नको लागि आफ्नो मनपर्ने भाषा छान्नुहोस्"
    override val languageEnglish: String = "English"
    override val languageNepali: String = "नेपाली (Nepali)"
    override val confirmAndContinue: String = "पुष्टि गरी अगाडि बढ्नुहोस्"
    override val changeLaterHint: String = "तपाईंले यसलाई पछि सेटिङबाट जुनसुकै बेला परिवर्तन गर्न सक्नुहुन्छ"
    override val changeLanguageTitle: String = "भाषा परिवर्तन गर्नुहोस्"
    override val applyBtn: String = "लागू गर्नुहोस्"
    override val cancelBtn: String = "रद्द गर्नुहोस्"

    override val navHome: String = "होम"
    override val navRecords: String = "रेकर्डहरू"
    override val navAppointments: String = "अपोइन्टमेन्टहरू"
    override val navProfile: String = "प्रोफाइल"

    override val slide1Badge: String = "स्मार्ट क्लिनिक सेवा"
    override val slide1Title: String = "तुरुन्त क्लिनिक अपोइन्टमेन्ट"
    override val slide1Desc: String = "लामो लाइनमा उभिनु पर्दैन। नेपालभरिका प्रमाणित विशेषज्ञ डाक्टर र क्लिनिकहरू हेर्नुहोस्, शुल्क तुलना गर्नुहोस् र केही सेकेन्डमै आफ्नो ओपीडी पालो सुरक्षित गर्नुहोस्।"
    override val slide1Pill1: String = "निश्चित ओपीडी पालो पुष्टि"
    override val slide1Pill2: String = "नेपालभरिका प्रमाणित क्लिनिक तथा डाक्टरहरू"

    override val slide2Badge: String = "प्रत्यक्ष ओपीडी लाम"
    override val slide2Title: String = "प्रत्यक्ष लाम ट्र्याकिङ"
    override val slide2Desc: String = "घरमै बसी आफ्नो ओपीडी पालो प्रत्यक्ष ट्र्याक गर्नुहोस्। अनावश्यक प्रतीक्षा नगरी आफ्नो पालो आउँदा मात्र क्लिनिक पुग्नुहोस्।"
    override val slide2Pill1: String = "प्रत्यक्ष टोकन नम्बर तथा स्थिति"
    override val slide2Pill2: String = "अनुमानित प्रतीक्षा समय र सूचना"

    override val slide3Badge: String = "स्मार्ट स्वास्थ्य सूचना"
    override val slide3Title: String = "महत्त्वपूर्ण स्वास्थ्य सूचनाहरू"
    override val slide3Desc: String = "तपाईंको पालो आउन लाग्दा वा डाक्टर क्लिनिकमा उपलब्ध हुँदा तुरुन्तै मोबाइलमा प्रत्यक्ष सूचना पाउनुहोस्।"
    override val slide3Pill1: String = "तुरुन्त मोबाइल सूचना (FCM)"
    override val slide3Pill2: String = "डाक्टर क्लिनिक आगमन अलर्ट"

    override val slide4Badge: String = "डिजिटल स्वास्थ्य रेकर्ड"
    override val slide4Title: String = "ल्याब रिपोर्ट तथा इतिहास"
    override val slide4Desc: String = "आफ्ना सबै ल्याब रिपोर्ट, प्रेस्क्रिप्सन र बिलहरू सुरक्षित रूपमा मोबाइलमै प्राप्त र डाउनलोड गर्नुहोस्।"
    override val slide4Pill1: String = "सुरक्षित र गोप्य रिपोर्ट पहुँच"
    override val slide4Pill2: String = "आधिकारिक PDF डाउनलोड र प्रिन्ट"

    override val slide5Badge: String = "सुरु गर्नुहोस्"
    override val slide5Title: String = "डाक्टर नेपालमा स्वागत छ"
    override val slide5Desc: String = "शीर्ष प्रमाणित मेडिकल क्लिनिक र विशेषज्ञ डाक्टरहरूसँग जोडिनुहोस्। प्रत्यक्ष लाम ट्र्याक गर्नुहोस् र तत्काल स्वास्थ्य सूचनाहरू पाउनुहोस्।"
    override val signInWithGoogle: String = "गुगलबाट साइन इन गर्नुहोस्"
    override val continueAsGuest: String = "पाहुनाको रूपमा जारी राख्नुहोस्"
    override val guestModeDesc: String = "पाहुना मोडमा तपाईं क्लिनिक र डाक्टर खोज्न, कोडबाट प्रत्यक्ष लाम ट्र्याक गर्न र सूचनाहरू पाउन सक्नुहुन्छ। अपोइन्टमेन्ट लिन मात्र साइन इन आवश्यक पर्छ।"
    override val nextBtn: String = "अर्को"

    override val settingsHeader: String = "सेटिङ र खाता प्राथमिकताहरू"
    override val appLanguageLabel: String = "एपको भाषा"
    override val appLanguageSub: String = "नेपाली"
    override val changeLanguageBtn: String = "परिवर्तन"
    override val editProfileTitle: String = "प्रोफाइल सम्पादन गर्नुहोस्"
    override val editProfileSub: String = "नाम, फोन, उमेर, लिङ्ग"
    override val pushNotifTitle: String = "पुश सूचनाहरू (FCM)"
    override val pushNotifSub: String = "प्रत्यक्ष लाम अलर्ट तथा सूचना"
    override val pushNotifActive: String = "सक्रिय"
    override val clearCacheTitle: String = "सुरक्षित ट्र्याकिङ कोड हटाउनुहोस्"
    override val clearCacheSub: String = "यस डिभाइसमा रहेका ट्र्याकिङ कोड खाली गर्नुहोस्"
    override val txHistoryTitle: String = "कारोबार इतिहास"
    override val txHistorySub: String = "सबै अपोइन्टमेन्ट भुक्तानी र विवरणहरू"
    override val termsPolicyTitle: String = "सर्तहरू र गोपनीयता नीति"
    override val termsPolicySub: String = "आधिकारिक बिरामी गोपनीयता तथा कानुनी सर्त"
}

val LocalAppStrings = compositionLocalOf<DactorStrings> { EnglishStrings }
val LocalAppLanguage = compositionLocalOf<AppLanguage> { AppLanguage.ENGLISH }
val LocalUpdateAppLanguage = compositionLocalOf<(AppLanguage) -> Unit> { {} }

