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

    // Common Buttons & Statuses
    val commonSearch: String
    val commonClose: String
    val commonBack: String
    val commonConfirm: String
    val commonLoading: String
    val commonRetry: String
    val commonRefresh: String
    val commonSave: String
    val commonEdit: String
    val commonDelete: String
    val commonViewAll: String
    val commonResetFilters: String
    val commonVerified: String
    val commonInClinic: String
    val commonAway: String
    val commonFree: String
    val commonRsPrefix: String

    // Home Screen & Search
    val homeLocationPrompt: String
    val homeSearchPlaceholder: String
    val homeFilterAll: String
    val homeFilterDoctors: String
    val homeFilterClinics: String
    val homeSortLabel: String
    val homeSortRecommended: String
    val homeSortInClinic: String
    val homeSortLowFee: String
    val homeSortName: String
    val homeFeaturedDoctors: String
    val homeFeaturedClinics: String
    val homeNoDoctorsFound: String
    val homeNoClinicsFound: String
    val homeSelectCity: String
    val homeLiveGps: String
    val homeTodayApptTitle: String
    val homeTodayApptSub: String
    val homeBookNow: String
    val homeNextAvailable: String

    // Queue & Tracker
    val queueStatusTitle: String
    val queueTrackPrompt: String
    val queueTokenLabel: String
    val queuePositionLabel: String
    val queueEstWaitLabel: String
    val queueDoctorInside: String
    val queueDoctorAway: String
    val queueCancelNotice: String

    // Directory & Records
    val recordsHeaderTitle: String
    val recordsHeaderSub: String
    val recordsFilterAll: String
    val recordsFilterCompleted: String
    val recordsFilterWithBills: String
    val recordsLinkCodeBtn: String
    val recordsCombinedTotal: String
    val recordsCombinedPaid: String
    val recordsCombinedDue: String
    val recordsViewDetails: String

    // Appointments Screen
    val apptsActiveTitle: String
    val apptsActiveSub: String
    val apptsInQueueToday: String
    val apptsScheduledUpcoming: String
    val apptsRescheduleBtn: String
    val apptsTrackQueueBtn: String
    val apptsEmptyMsg: String

    // Profile Screen & Settings
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
    val signOutBtn: String
    val deleteAccountTitle: String
    val deleteAccountSub: String
    val guestAccountBadge: String
    val guestAccountTitle: String
    val guestAccountSub: String
    val signInGoogleBtn: String

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

    override val commonSearch: String = "Search"
    override val commonClose: String = "Close"
    override val commonBack: String = "Back"
    override val commonConfirm: String = "Confirm"
    override val commonLoading: String = "Loading..."
    override val commonRetry: String = "Retry"
    override val commonRefresh: String = "Refresh"
    override val commonSave: String = "Save"
    override val commonEdit: String = "Edit"
    override val commonDelete: String = "Delete"
    override val commonViewAll: String = "View All"
    override val commonResetFilters: String = "Reset Filters"
    override val commonVerified: String = "Verified"
    override val commonInClinic: String = "In Clinic"
    override val commonAway: String = "Away"
    override val commonFree: String = "Free"
    override val commonRsPrefix: String = "Rs."

    override val homeLocationPrompt: String = "Select City / Region"
    override val homeSearchPlaceholder: String = "Search symptoms, doctors, or clinics..."
    override val homeFilterAll: String = "All"
    override val homeFilterDoctors: String = "Doctors"
    override val homeFilterClinics: String = "Clinics & Labs"
    override val homeSortLabel: String = "Sort"
    override val homeSortRecommended: String = "Recommended"
    override val homeSortInClinic: String = "Inside Clinic"
    override val homeSortLowFee: String = "Lowest Fee"
    override val homeSortName: String = "A-Z"
    override val homeFeaturedDoctors: String = "Specialist Doctors"
    override val homeFeaturedClinics: String = "Verified Clinics & Diagnostic Labs"
    override val homeNoDoctorsFound: String = "No specialist doctors found matching criteria."
    override val homeNoClinicsFound: String = "No medical clinics found matching criteria."
    override val homeSelectCity: String = "Select Location"
    override val homeLiveGps: String = "LIVE GPS"
    override val homeTodayApptTitle: String = "Appointment Scheduled Today"
    override val homeTodayApptSub: String = "Tap to view live token & queue progress →"
    override val homeBookNow: String = "Book Appointment"
    override val homeNextAvailable: String = "Next Available"

    override val queueStatusTitle: String = "Live Queue Tracking"
    override val queueTrackPrompt: String = "Enter 10-Digit Tracking Code"
    override val queueTokenLabel: String = "Your Token Number"
    override val queuePositionLabel: String = "Patients Ahead"
    override val queueEstWaitLabel: String = "Estimated Wait Time"
    override val queueDoctorInside: String = "Doctor is Physically Inside Clinic"
    override val queueDoctorAway: String = "Doctor is Away / In Transit"
    override val queueCancelNotice: String = "Appointment Cancelled"

    override val recordsHeaderTitle: String = "Patient Directory & Health Records"
    override val recordsHeaderSub: String = "Consultations, bills, prescriptions & lab reports"
    override val recordsFilterAll: String = "All Records"
    override val recordsFilterCompleted: String = "Completed Visits"
    override val recordsFilterWithBills: String = "With Invoices"
    override val recordsLinkCodeBtn: String = "+ Link Code"
    override val recordsCombinedTotal: String = "Total Bill"
    override val recordsCombinedPaid: String = "Total Paid"
    override val recordsCombinedDue: String = "Amount Left"
    override val recordsViewDetails: String = "View Records & Bill PDF"

    override val apptsActiveTitle: String = "Active Appointments"
    override val apptsActiveSub: String = "Real-time queue tracking & upcoming consultations"
    override val apptsInQueueToday: String = "In Today's Queue"
    override val apptsScheduledUpcoming: String = "Upcoming Schedule"
    override val apptsRescheduleBtn: String = "Reschedule"
    override val apptsTrackQueueBtn: String = "Track Live Queue"
    override val apptsEmptyMsg: String = "No active appointments found."

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
    override val signOutBtn: String = "Sign Out / Switch Account"
    override val deleteAccountTitle: String = "Delete or Archive Account"
    override val deleteAccountSub: String = "30-day grace period before data purge"
    override val guestAccountBadge: String = "GUEST ACCOUNT"
    override val guestAccountTitle: String = "Welcome to Dactor Nepal"
    override val guestAccountSub: String = "Sign in with Google to view personal medical history and book instant appointments."
    override val signInGoogleBtn: String = "Continue with Google"

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
}

object NepaliStrings : DactorStrings {
    override val chooseLanguageTitle: String = "भाषा चयन गर्नुहोस्"
    override val chooseLanguageSubtitle: String = "अगाडि बढ्नको लागि आफ्नो मनपर्ने भाषा छान्नुहोस्"
    override val languageEnglish: String = "English"
    override val languageNepali: String = "नेपाली (Nepali)"
    override val confirmAndContinue: String = "पुष्टि गरी अगाडि बढ्नुहोस्"
    override val changeLaterHint: String = "तपाईंले यसलाई पछि प्रोफाइल वा सेटिङबाट जुनसुकै बेला परिवर्तन गर्न सक्नुहुन्छ"
    override val changeLanguageTitle: String = "भाषा परिवर्तन गर्नुहोस्"
    override val applyBtn: String = "लागू गर्नुहोस्"
    override val cancelBtn: String = "रद्द गर्नुहोस्"

    override val navHome: String = "गृहपृष्ठ"
    override val navRecords: String = "रेकर्डहरू"
    override val navAppointments: String = "अपोइन्टमेन्टहरू"
    override val navProfile: String = "प्रोफाइल"

    override val commonSearch: String = "खोज्नुहोस्"
    override val commonClose: String = "बन्द गर्नुहोस्"
    override val commonBack: String = "पछाडि"
    override val commonConfirm: String = "पुष्टि गर्नुहोस्"
    override val commonLoading: String = "लोड हुँदैछ..."
    override val commonRetry: String = "पुनः प्रयास"
    override val commonRefresh: String = "ताजा गर्नुहोस्"
    override val commonSave: String = "सुरक्षित गर्नुहोस्"
    override val commonEdit: String = "सम्पादन"
    override val commonDelete: String = "हटाउनुहोस्"
    override val commonViewAll: String = "सबै हेर्नुहोस्"
    override val commonResetFilters: String = "फिल्टर रिसेट गर्नुहोस्"
    override val commonVerified: String = "प्रमाणित"
    override val commonInClinic: String = "क्लिनिकमा उपलब्ध"
    override val commonAway: String = "बाहिर / आउँदै"
    override val commonFree: String = "निःशुल्क"
    override val commonRsPrefix: String = "रु."

    override val homeLocationPrompt: String = "शहर वा क्षेत्र चयन गर्नुहोस्"
    override val homeSearchPlaceholder: String = "रोगको लक्षण, डाक्टर वा क्लिनिक खोज्नुहोस्..."
    override val homeFilterAll: String = "सबै"
    override val homeFilterDoctors: String = "विशेषज्ञ डाक्टरहरू"
    override val homeFilterClinics: String = "क्लिनिक तथा ल्याबहरू"
    override val homeSortLabel: String = "क्रमबद्ध"
    override val homeSortRecommended: String = "सिफारिस गरिएको"
    override val homeSortInClinic: String = "क्लिनिकमा उपलब्ध"
    override val homeSortLowFee: String = "न्यूनतम शुल्क"
    override val homeSortName: String = "नाम अनुसार (A-Z)"
    override val homeFeaturedDoctors: String = "प्रमाणित विशेषज्ञ डाक्टरहरू"
    override val homeFeaturedClinics: String = "नेपालका उत्कृष्ट क्लिनिक तथा डायग्नोस्टिक ल्याबहरू"
    override val homeNoDoctorsFound: String = "खोजिएको शर्त अनुसार कुनै डाक्टर फेला परेन।"
    override val homeNoClinicsFound: String = "खोजिएको शर्त अनुसार कुनै क्लिनिक फेला परेन।"
    override val homeSelectCity: String = "स्थान चयन गर्नुहोस्"
    override val homeLiveGps: String = "प्रत्यक्ष जीपीएस"
    override val homeTodayApptTitle: String = "आजको निर्धारित अपोइन्टमेन्ट"
    override val homeTodayApptSub: String = "प्रत्यक्ष टोकन र पालो हेर्न यहाँ थिच्नुहोस् →"
    override val homeBookNow: String = "अपोइन्टमेन्ट लिनुहोस्"
    override val homeNextAvailable: String = "अर्को उपलब्ध मिति"

    override val queueStatusTitle: String = "प्रत्यक्ष लाम ट्र्याकिङ"
    override val queueTrackPrompt: String = "१०-अङ्के ट्र्याकिङ कोड राख्नुहोस्"
    override val queueTokenLabel: String = "तपाईंको टोकन नम्बर"
    override val queuePositionLabel: String = "तपाईं अगाडिका बिरामी"
    override val queueEstWaitLabel: String = "अनुमानित प्रतीक्षा समय"
    override val queueDoctorInside: String = "डाक्टर क्लिनिकभित्र परामर्श कक्षमा हुनुहुन्छ"
    override val queueDoctorAway: String = "डाक्टर क्लिनिक आइपुग्नुभएको छैन"
    override val queueCancelNotice: String = "अपोइन्टमेन्ट रद्द गरिएको छ"

    override val recordsHeaderTitle: String = "बिरामी स्वास्थ्य रेकर्ड तथा विवरण"
    override val recordsHeaderSub: String = "परामर्श इतिहास, क्लिनिक बिल, प्रेस्क्रिप्सन र ल्याब रिपोर्टहरू"
    override val recordsFilterAll: String = "सबै रेकर्डहरू"
    override val recordsFilterCompleted: String = "सम्पन्न परामर्श"
    override val recordsFilterWithBills: String = "बिल भएका मात्र"
    override val recordsLinkCodeBtn: String = "+ कोड जोड्नुहोस्"
    override val recordsCombinedTotal: String = "जम्मा बिल"
    override val recordsCombinedPaid: String = "भुक्तानी भएको"
    override val recordsCombinedDue: String = "तिर्न बाँकी"
    override val recordsViewDetails: String = "विवरण तथा बिल पीडीएफ हेर्नुहोस्"

    override val apptsActiveTitle: String = "सक्रिय अपोइन्टमेन्टहरू"
    override val apptsActiveSub: String = "प्रत्यक्ष लाम स्थिति र आगामी परामर्शहरू"
    override val apptsInQueueToday: String = "आजको प्रत्यक्ष लाममा"
    override val apptsScheduledUpcoming: String = "आगामी तालिका"
    override val apptsRescheduleBtn: String = "मिति सार्नुहोस्"
    override val apptsTrackQueueBtn: String = "प्रत्यक्ष लाम ट्र्याक गर्नुहोस्"
    override val apptsEmptyMsg: String = "कुनै सक्रिय अपोइन्टमेन्ट फेला परेन।"

    override val settingsHeader: String = "सेटिङ र खाता प्राथमिकताहरू"
    override val appLanguageLabel: String = "एपको भाषा (App Language)"
    override val appLanguageSub: String = "नेपाली"
    override val changeLanguageBtn: String = "परिवर्तन गर्नुहोस्"
    override val editProfileTitle: String = "प्रोफाइल सम्पादन गर्नुहोस्"
    override val editProfileSub: String = "नाम, मोबाइल, उमेर र लिङ्ग"
    override val pushNotifTitle: String = "पुश सूचनाहरू (FCM)"
    override val pushNotifSub: String = "प्रत्यक्ष पालो अलर्ट र क्लिनिक सूचना"
    override val pushNotifActive: String = "सक्रिय"
    override val clearCacheTitle: String = "सुरक्षित ट्र्याकिङ कोड हटाउनुहोस्"
    override val clearCacheSub: String = "यस डिभाइसमा रहेका स्थानीय कोडहरू हटाउनुहोस्"
    override val txHistoryTitle: String = "भुक्तानी तथा कारोबार इतिहास"
    override val txHistorySub: String = "सबै अपोइन्टमेन्ट भुक्तानी र रसिद नम्बरहरू"
    override val termsPolicyTitle: String = "सर्तहरू र गोपनीयता नीति"
    override val termsPolicySub: String = "आधिकारिक बिरामी गोपनीयता तथा कानुनी सर्त"
    override val signOutBtn: String = "साइन आउट / खाता परिवर्तन"
    override val deleteAccountTitle: String = "खाता निष्क्रिय वा हटाउनुहोस्"
    override val deleteAccountSub: String = "३० दिनको समयसीमा सहित"
    override val guestAccountBadge: String = "पाहुना खाता (Guest)"
    override val guestAccountTitle: String = "डाक्टर नेपालमा स्वागत छ"
    override val guestAccountSub: String = "व्यक्तिगत स्वास्थ्य इतिहास सुरक्षित राख्न र तुरुन्त अपोइन्टमेन्ट लिन गुगलबाट साइन इन गर्नुहोस्।"
    override val signInGoogleBtn: String = "गुगलबाट जारी राख्नुहोस्"

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
}

val LocalAppStrings = compositionLocalOf<DactorStrings> { EnglishStrings }
val LocalAppLanguage = compositionLocalOf<AppLanguage> { AppLanguage.ENGLISH }
val LocalUpdateAppLanguage = compositionLocalOf<(AppLanguage) -> Unit> { {} }
