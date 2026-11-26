package com.dactor.clinic.ui.i18n

interface ClinicAuthDashboardStrings {
    // Auth & Register
    val clinicLoginTitle: String
    val clinicLoginSub: String
    val doctorLoginTitle: String
    val doctorLoginSub: String
    val clinicRegisterTitle: String
    val clinicRegisterSub: String
    val doctorRegisterTitle: String
    val doctorRegisterSub: String
    val tabClinicStaff: String
    val tabDoctor: String
    val emailLabel: String
    val emailPlaceholder: String
    val passwordLabel: String
    val passwordPlaceholder: String
    val rememberMe: String
    val forgotPassword: String
    val signInBtn: String
    val registerBtn: String
    val doNotHaveAccount: String
    val alreadyHaveAccount: String
    val clinicNameLabel: String
    val regNumberLabel: String
    val panVatLabel: String
    val doctorNameLabel: String
    val doctorNmcNumberLabel: String
    val doctorDegreeLabel: String
    val doctorSpecialtyLabel: String
    val doctorExperienceLabel: String
    val kycStatusPending: String
    val kycStatusApproved: String
    val kycStatusRejected: String
    val kycNotice: String

    // Dashboard & Desks
    val clinicDashboardTitle: String
    val doctorDashboardTitle: String
    val activeClinicLabel: String
    val switchClinic: String
    val doctorInClinic: String
    val doctorAway: String
    val toggleInClinicPrompt: String
    val clinicOnBreak: String
    val breakNotice: String
    val resumeOperations: String
    val trialDaysRemaining: String
    val archiveWarning: String
    val subscriptionLocked: String
    val renewalPrompt: String

    // Quick Action Tiles
    val tileLiveQueue: String
    val tileWalkinToken: String
    val tileBilling: String
    val tilePatients: String
    val tileLabWorkflow: String
    val tilePayAtDesk: String
    val tileSlotManager: String
    val tileServices: String
    val tileSettings: String
    val tileDoctorRoster: String
    val tileNotifications: String
    val tileFutureAppts: String
    val tileNoShow: String
    val tileAvgTime: String

    // Stats
    val statTotalToday: String
    val statWaiting: String
    val statCompleted: String
    val statNoShow: String
    val statRevenueToday: String
}

object ClinicAuthDashboardEnglish : ClinicAuthDashboardStrings {
    override val clinicLoginTitle: String = "Clinic Staff Login"
    override val clinicLoginSub: String = "Sign in to manage OPD queues, billing & patient records"
    override val doctorLoginTitle: String = "Doctor Consultation Portal"
    override val doctorLoginSub: String = "Sign in to access your OPD consultation desk and clinical notes"
    override val clinicRegisterTitle: String = "Register Healthcare Clinic"
    override val clinicRegisterSub: String = "Create an account to streamline your clinic workflow"
    override val doctorRegisterTitle: String = "Doctor Registration"
    override val doctorRegisterSub: String = "Join Dactor platform with medical council credentials"
    override val tabClinicStaff: String = "Clinic Staff"
    override val tabDoctor: String = "Doctor"
    override val emailLabel: String = "Email Address"
    override val emailPlaceholder: String = "e.g. clinic@example.com"
    override val passwordLabel: String = "Password"
    override val passwordPlaceholder: String = "Enter your password"
    override val rememberMe: String = "Remember this device"
    override val forgotPassword: String = "Forgot Password?"
    override val signInBtn: String = "Sign In"
    override val registerBtn: String = "Register Now"
    override val doNotHaveAccount: String = "Don't have an account?"
    override val alreadyHaveAccount: String = "Already have an account?"
    override val clinicNameLabel: String = "Clinic Name"
    override val regNumberLabel: String = "Clinic Registration No."
    override val panVatLabel: String = "PAN / VAT Number"
    override val doctorNameLabel: String = "Doctor Full Name"
    override val doctorNmcNumberLabel: String = "NMC / NNC License No."
    override val doctorDegreeLabel: String = "Medical Qualifications (e.g. MBBS, MD)"
    override val doctorSpecialtyLabel: String = "Primary Specialty"
    override val doctorExperienceLabel: String = "Years of Experience"
    override val kycStatusPending: String = "Verification Under Review"
    override val kycStatusApproved: String = "Verified Practitioner"
    override val kycStatusRejected: String = "Verification Incomplete"
    override val kycNotice: String = "Your medical credentials are being verified by the Dactor medical board."

    override val clinicDashboardTitle: String = "Clinic Operations Dashboard"
    override val doctorDashboardTitle: String = "Doctor Consultation Desk"
    override val activeClinicLabel: String = "Active Clinic"
    override val switchClinic: String = "Switch Clinic"
    override val doctorInClinic: String = "Doctor In Clinic"
    override val doctorAway: String = "Doctor Away"
    override val toggleInClinicPrompt: String = "Toggle status when you enter or leave consultation chamber"
    override val clinicOnBreak: String = "Clinic On Break"
    override val breakNotice: String = "Queue calling is temporarily paused during scheduled break."
    override val resumeOperations: String = "Resume Queue"
    override val trialDaysRemaining: String = "Trial days left:"
    override val archiveWarning: String = "Clinic account is scheduled for archival."
    override val subscriptionLocked: String = "Feature locked - Active subscription required."
    override val renewalPrompt: String = "Renew Subscription"

    override val tileLiveQueue: String = "Live OPD Queue"
    override val tileWalkinToken: String = "Reception Walk-In"
    override val tileBilling: String = "Invoices & Billing"
    override val tilePatients: String = "Patient Directory"
    override val tileLabWorkflow: String = "Lab & Diagnostics"
    override val tilePayAtDesk: String = "Pay at Desk"
    override val tileSlotManager: String = "OPD Slot Manager"
    override val tileServices: String = "Clinic Services"
    override val tileSettings: String = "Clinic Settings"
    override val tileDoctorRoster: String = "Doctor Roster"
    override val tileNotifications: String = "Broadcasts & Alerts"
    override val tileFutureAppts: String = "Future Appointments"
    override val tileNoShow: String = "No-Show Manager"
    override val tileAvgTime: String = "Consultation Time"

    override val statTotalToday: String = "Total Booked"
    override val statWaiting: String = "Currently Waiting"
    override val statCompleted: String = "Consulted"
    override val statNoShow: String = "No-Show"
    override val statRevenueToday: String = "Today's Collection"
}

object ClinicAuthDashboardNepali : ClinicAuthDashboardStrings {
    override val clinicLoginTitle: String = "क्लिनिक कर्मचारी लगइन"
    override val clinicLoginSub: String = "ओपीडी लाम, बिलिङ र बिरामी विवरण व्यवस्थापन गर्न साइन इन गर्नुहोस्"
    override val doctorLoginTitle: String = "डाक्टर परामर्श पोर्टल"
    override val doctorLoginSub: String = "तपाईंको ओपीडी परामर्श डेस्क र क्लिनिकल नोटहरू खोल्नुहोस्"
    override val clinicRegisterTitle: String = "स्वास्थ्य क्लिनिक दर्ता"
    override val clinicRegisterSub: String = "क्लिनिकको कार्यप्रणाली व्यवस्थित गर्न खाता खोल्नुहोस्"
    override val doctorRegisterTitle: String = "डाक्टर दर्ता"
    override val doctorRegisterSub: String = "नेपाल मेडिकल काउन्सिल विवरणसहित डाक्टर प्लेटफर्ममा जोडिनुहोस्"
    override val tabClinicStaff: String = "क्लिनिक कर्मचारी"
    override val tabDoctor: String = "डाक्टर"
    override val emailLabel: String = "इमेल ठेगाना"
    override val emailPlaceholder: String = "उदा. clinic@example.com"
    override val passwordLabel: String = "गोप्य पासवर्ड"
    override val passwordPlaceholder: String = "तपाईंको पासवर्ड राख्नुहोस्"
    override val rememberMe: String = "यो डिभाइसमा सुरक्षित राख्नुहोस्"
    override val forgotPassword: String = "पासवर्ड बिर्सनुभयो?"
    override val signInBtn: String = "साइन इन"
    override val registerBtn: String = "दर्ता गर्नुहोस्"
    override val doNotHaveAccount: String = "खाता छैन?"
    override val alreadyHaveAccount: String = "पहिले नै खाता छ?"
    override val clinicNameLabel: String = "क्लिनिकको नाम"
    override val regNumberLabel: String = "क्लिनिक दर्ता नम्बर"
    override val panVatLabel: String = "प्यान / भ्याट (PAN/VAT) नम्बर"
    override val doctorNameLabel: String = "डाक्टरको पूरा नाम"
    override val doctorNmcNumberLabel: String = "NMC / NNC लाइसेन्स नम्बर"
    override val doctorDegreeLabel: String = "चिकित्सा योग्यता (उदा. MBBS, MD)"
    override val doctorSpecialtyLabel: String = "विशेषज्ञता (Specialty)"
    override val doctorExperienceLabel: String = "अनुभव (वर्ष)"
    override val kycStatusPending: String = "प्रमाणीकरण विचाराधीन"
    override val kycStatusApproved: String = "प्रमाणित चिकित्सक"
    override val kycStatusRejected: String = "प्रमाणीकरण अपूर्ण"
    override val kycNotice: String = "तपाईंको कागजात डाक्टर मेडिकल बोर्डद्वारा प्रमाणीकरण हुँदैछ।"

    override val clinicDashboardTitle: String = "क्लिनिक व्यवस्थापन ड्यासबोर्ड"
    override val doctorDashboardTitle: String = "डाक्टर परामर्श डेस्क"
    override val activeClinicLabel: String = "सक्रिय क्लिनिक"
    override val switchClinic: String = "क्लिनिक फेर्नुहोस्"
    override val doctorInClinic: String = "डाक्टर क्लिनिकभित्र"
    override val doctorAway: String = "डाक्टर बाहिर"
    override val toggleInClinicPrompt: String = "परामर्श कोठामा प्रवेश गर्दा वा बाहिरिँदा स्थिति बदल्नुहोस्"
    override val clinicOnBreak: String = "क्लिनिक ब्रेकमा"
    override val breakNotice: String = "ब्रेकको समयमा पालो बोलाउने कार्य केही समय रोकिएको छ।"
    override val resumeOperations: String = "लाम पुनः सुरु गर्नुहोस्"
    override val trialDaysRemaining: String = "परीक्षण अवधि बाँकी दिन:"
    override val archiveWarning: String = "क्लिनिक खाता अभिलेख (आर्काइभ) सूचीमा छ।"
    override val subscriptionLocked: String = "सुविधा बन्द - सक्रिय सदस्यता आवश्यक छ।"
    override val renewalPrompt: String = "सदस्यता नवीकरण गर्नुहोस्"

    override val tileLiveQueue: String = "प्रत्यक्ष ओपीडी लाम"
    override val tileWalkinToken: String = "काउन्टर वाक-इन टोकन"
    override val tileBilling: String = "बिलिङ तथा रसिदहरू"
    override val tilePatients: String = "बिरामी डाइरेक्टरी"
    override val tileLabWorkflow: String = "ल्याब तथा परीक्षण"
    override val tilePayAtDesk: String = "काउन्टर भुक्तानी (Pay at Desk)"
    override val tileSlotManager: String = "ओपीडी स्लट व्यवस्थापक"
    override val tileServices: String = "क्लिनिक सेवाहरू"
    override val tileSettings: String = "क्लिनिक सेटिङ"
    override val tileDoctorRoster: String = "डाक्टरहरूको तालिका"
    override val tileNotifications: String = "सूचना तथा अलर्टहरू"
    override val tileFutureAppts: String = "भावी अपोइन्टमेन्टहरू"
    override val tileNoShow: String = "उपस्थित नभएका (No-Show)"
    override val tileAvgTime: String = "परामर्श समय"

    override val statTotalToday: String = "आजको कुल बुकिङ"
    override val statWaiting: String = "प्रतीक्षारत बिरामी"
    override val statCompleted: String = "परामर्श सम्पन्न"
    override val statNoShow: String = "अनुपस्थित"
    override val statRevenueToday: String = "आजको संकलन"
}
