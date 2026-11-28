package com.dactor.patient.ui.i18n

interface PatientDiscoveryBookingStrings {
    // Nav & Search
    val navHome: String
    val navRecords: String
    val navAppointments: String
    val navProfile: String
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

    // Clinic Detail & Map
    val clinicAboutTitle: String
    val clinicDoctorsTab: String
    val clinicServicesTab: String
    val clinicWorkingHoursTab: String
    val clinicContactAddress: String
    val clinicOpenMapBtn: String
    val clinicDirectionsBtn: String
    val clinicCallBtn: String

    // Booking Form & Flow
    val bookingScreenTitle: String
    val selectDoctorStep: String
    val selectDateStep: String
    val selectSlotStep: String
    val patientDetailsStep: String
    val patientFullName: String
    val patientAge: String
    val patientGender: String
    val patientPhone: String
    val appointmentReason: String
    val consultationFee: String
    val bookingConfirmedTitle: String
    val bookingConfirmedSub: String
    val viewTokenBtn: String
    val addToCalendarBtn: String

    // Payments
    val paymentTitle: String
    val selectPaymentMethod: String
    val payWithEsewa: String
    val payWithKhalti: String
    val payAtClinicCounter: String
    val paymentSuccess: String
    val paymentFailed: String
    val totalPayable: String
}

object PatientDiscoveryBookingEnglish : PatientDiscoveryBookingStrings {
    override val navHome: String = "Home"
    override val navRecords: String = "Records"
    override val navAppointments: String = "Appointments"
    override val navProfile: String = "Profile"
    override val homeLocationPrompt: String = "Location"
    override val homeSearchPlaceholder: String = "Search doctors, clinics, specialties..."
    override val homeFilterAll: String = "All"
    override val homeFilterDoctors: String = "Doctors"
    override val homeFilterClinics: String = "Clinics"
    override val homeSortLabel: String = "Sort"
    override val homeSortRecommended: String = "Recommended"
    override val homeSortInClinic: String = "Doctor In Clinic First"
    override val homeSortLowFee: String = "Fee: Low to High"
    override val homeSortName: String = "Name: A to Z"
    override val homeFeaturedDoctors: String = "Featured Doctors"
    override val homeFeaturedClinics: String = "Top Clinics"
    override val homeNoDoctorsFound: String = "No doctors match your query"
    override val homeNoClinicsFound: String = "No clinics found in this area"
    override val homeSelectCity: String = "Select City / Region"
    override val homeLiveGps: String = "Use Current Location (GPS)"
    override val homeTodayApptTitle: String = "Upcoming Appointment"
    override val homeTodayApptSub: String = "Track your live queue status"
    override val homeBookNow: String = "Book OPD Appointment"
    override val homeNextAvailable: String = "Next Available Slot"

    override val clinicAboutTitle: String = "About Clinic"
    override val clinicDoctorsTab: String = "Doctors"
    override val clinicServicesTab: String = "Services"
    override val clinicWorkingHoursTab: String = "Hours"
    override val clinicContactAddress: String = "Location & Contact"
    override val clinicOpenMapBtn: String = "View Map"
    override val clinicDirectionsBtn: String = "Get Directions"
    override val clinicCallBtn: String = "Call Clinic"

    override val bookingScreenTitle: String = "Book Doctor Appointment"
    override val selectDoctorStep: String = "Select Practitioner"
    override val selectDateStep: String = "Choose Appointment Date"
    override val selectSlotStep: String = "Select Time Slot"
    override val patientDetailsStep: String = "Patient Information"
    override val patientFullName: String = "Patient Full Name"
    override val patientAge: String = "Age"
    override val patientGender: String = "Gender"
    override val patientPhone: String = "Mobile Number (10 digits)"
    override val appointmentReason: String = "Reason for Visit / Symptoms"
    override val consultationFee: String = "Consultation Fee"
    override val bookingConfirmedTitle: String = "Appointment Confirmed!"
    override val bookingConfirmedSub: String = "Your OPD appointment has been booked successfully."
    override val viewTokenBtn: String = "Track Live Queue Token"
    override val addToCalendarBtn: String = "Add to Calendar"

    override val paymentTitle: String = "Payment Checkout"
    override val selectPaymentMethod: String = "Choose Payment Option"
    override val payWithEsewa: String = "Pay with eSewa"
    override val payWithKhalti: String = "Pay with Khalti"
    override val payAtClinicCounter: String = "Pay at Counter (Cash/Card)"
    override val paymentSuccess: String = "Payment Processed Successfully"
    override val paymentFailed: String = "Payment Unsuccessful - Please Try Again"
    override val totalPayable: String = "Total Amount Due"
}

object PatientDiscoveryBookingNepali : PatientDiscoveryBookingStrings {
    override val navHome: String = "गृहपृष्ठ"
    override val navRecords: String = "रेकर्ड"
    override val navAppointments: String = "अपोइन्टमेन्ट"
    override val navProfile: String = "प्रोफाइल"
    override val homeLocationPrompt: String = "स्थान"
    override val homeSearchPlaceholder: String = "डाक्टर, क्लिनिक वा विशेषज्ञता खोज्नुहोस्..."
    override val homeFilterAll: String = "सबै"
    override val homeFilterDoctors: String = "डाक्टर"
    override val homeFilterClinics: String = "क्लिनिक"
    override val homeSortLabel: String = "क्रमबद्ध"
    override val homeSortRecommended: String = "सिफारिस गरिएको"
    override val homeSortInClinic: String = "डाक्टर क्लिनिकभित्र पहिले"
    override val homeSortLowFee: String = "न्यूनतम परामर्श शुल्क"
    override val homeSortName: String = "नाम: अ-ज्ञ"
    override val homeFeaturedDoctors: String = "प्रमुख डाक्टरहरू"
    override val homeFeaturedClinics: String = "उत्कृष्ट क्लिनिकहरू"
    override val homeNoDoctorsFound: String = "कुनै डाक्टर भेटिएन"
    override val homeNoClinicsFound: String = "यस क्षेत्रमा कुनै क्लिनिक भेटिएन"
    override val homeSelectCity: String = "सहर / क्षेत्र छान्नुहोस्"
    override val homeLiveGps: String = "हालको स्थान प्रयोग गर्नुहोस् (GPS)"
    override val homeTodayApptTitle: String = "आगामी अपोइन्टमेन्ट"
    override val homeTodayApptSub: String = "प्रत्यक्ष लाम स्थिति ट्र्याक गर्नुहोस्"
    override val homeBookNow: String = "ओपीडी अपोइन्टमेन्ट लिनुहोस्"
    override val homeNextAvailable: String = "अर्को उपलब्ध स्लट"

    override val clinicAboutTitle: String = "क्लिनिकको बारेमा"
    override val clinicDoctorsTab: String = "डाक्टरहरू"
    override val clinicServicesTab: String = "सेवाहरू"
    override val clinicWorkingHoursTab: String = "समय तालिका"
    override val clinicContactAddress: String = "ठेगाना तथा सम्पर्क"
    override val clinicOpenMapBtn: String = "नक्सा हेर्नुहोस्"
    override val clinicDirectionsBtn: String = "बाटो देखाउनुहोस्"
    override val clinicCallBtn: String = "कल गर्नुहोस्"

    override val bookingScreenTitle: String = "डाक्टर अपोइन्टमेन्ट बुकिङ"
    override val selectDoctorStep: String = "डाक्टर छान्नुहोस्"
    override val selectDateStep: String = "अपोइन्टमेन्ट मिति छान्नुहोस्"
    override val selectSlotStep: String = "समय स्लट चयन गर्नुहोस्"
    override val patientDetailsStep: String = "बिरामीको व्यक्तिगत विवरण"
    override val patientFullName: String = "बिरामीको पूरा नाम"
    override val patientAge: String = "उमेर"
    override val patientGender: String = "लिङ्ग"
    override val patientPhone: String = "मोबाइल नम्बर (10 अङ्क)"
    override val appointmentReason: String = "जाँच गराउनुको कारण / लक्षणहरू"
    override val consultationFee: String = "परामर्श शुल्क"
    override val bookingConfirmedTitle: String = "अपोइन्टमेन्ट सुनिश्चित भयो!"
    override val bookingConfirmedSub: String = "तपाईंको ओपीडी अपोइन्टमेन्ट सफलतापूर्वक दर्ता भएको छ।"
    override val viewTokenBtn: String = "प्रत्यक्ष लाम टोकन हेर्नुहोस्"
    override val addToCalendarBtn: String = "क्यालेन्डरमा थप्नुहोस्"

    override val paymentTitle: String = "भुक्तानी चेकआउट"
    override val selectPaymentMethod: String = "भुक्तानी विधि छान्नुहोस्"
    override val payWithEsewa: String = "ईसेवा (eSewa) मार्फत भुक्तानी"
    override val payWithKhalti: String = "खल्ती (Khalti) मार्फत भुक्तानी"
    override val payAtClinicCounter: String = "काउन्टरमा भुक्तानी (नगद/कार्ड)"
    override val paymentSuccess: String = "भुक्तानी सफलतापूर्वक सम्पन्न भयो"
    override val paymentFailed: String = "भुक्तानी असफल भयो - कृपया पुनः प्रयास गर्नुहोस्"
    override val totalPayable: String = "कुल तिर्नुपर्ने रकम"
}
