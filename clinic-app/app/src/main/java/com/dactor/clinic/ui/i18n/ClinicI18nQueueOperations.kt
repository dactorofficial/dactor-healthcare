package com.dactor.clinic.ui.i18n

interface ClinicQueueOperationsStrings {
    // Queue Board & Desk
    val queueBoardTitle: String
    val selectDoctorPrompt: String
    val tabWaiting: String
    val tabInConsult: String
    val tabCompleted: String
    val tabNoShow: String
    val tokenNumber: String
    val callNextPatient: String
    val recallPatient: String
    val markCompleted: String
    val markNoShow: String
    val transferQueue: String
    val pauseQueue: String
    val resumeQueue: String
    val currentServing: String
    val noPatientsWaiting: String
    val noActiveConsultation: String
    val walkinTokenBadge: String
    val onlineBookingBadge: String
    val estimatedWaitMinutes: String
    val patientVitals: String
    val bloodPressure: String
    val pulseRate: String
    val temperature: String
    val weightKg: String
    val clinicalNotes: String
    val rxPrescription: String
    val attachLabOrder: String
    val saveConsultation: String

    // Queue Date Scroller
    val dateToday: String
    val dateTomorrow: String
    val pickDate: String
    val allDoctors: String

    // Consultation Time & Settings
    val avgConsultationTimeTitle: String
    val autoCalculatedMode: String
    val manualOverrideMode: String
    val minutesUnit: String
    val saveAvgTimePrompt: String

    // Working Hours & Breaks
    val workingHoursTitle: String
    val dayOfWeek: String
    val openTime: String
    val closeTime: String
    val isClosedDay: String
    val clinicBreakTitle: String
    val breakStart: String
    val breakEnd: String
    val addBreakBtn: String

    // Future & No-Show & Desk
    val futureApptsTitle: String
    val noShowManagerTitle: String
    val restoreToQueue: String
    val payAtDeskTitle: String
    val approvePayment: String
    val rejectPayment: String
    val slotManagerTitle: String
    val maxPatientsPerSlot: String
    val createSlotBtn: String
}

object ClinicQueueOperationsEnglish : ClinicQueueOperationsStrings {
    override val queueBoardTitle: String = "Live OPD Queue Board"
    override val selectDoctorPrompt: String = "Select Doctor"
    override val tabWaiting: String = "Waiting"
    override val tabInConsult: String = "In Consultation"
    override val tabCompleted: String = "Completed"
    override val tabNoShow: String = "No-Show"
    override val tokenNumber: String = "Token #"
    override val callNextPatient: String = "Call Next Patient"
    override val recallPatient: String = "Call In Again"
    override val markCompleted: String = "Mark Completed"
    override val markNoShow: String = "Mark No-Show"
    override val transferQueue: String = "Transfer to Another Doctor"
    override val pauseQueue: String = "Pause Queue"
    override val resumeQueue: String = "Resume Queue"
    override val currentServing: String = "Currently Serving"
    override val noPatientsWaiting: String = "No patients in waiting line"
    override val noActiveConsultation: String = "No patient currently inside consultation room"
    override val walkinTokenBadge: String = "Walk-In"
    override val onlineBookingBadge: String = "Online App"
    override val estimatedWaitMinutes: String = "Est. Wait"
    override val patientVitals: String = "Patient Vitals"
    override val bloodPressure: String = "Blood Pressure (BP)"
    override val pulseRate: String = "Pulse (BPM)"
    override val temperature: String = "Temperature (°F)"
    override val weightKg: String = "Weight (kg)"
    override val clinicalNotes: String = "Clinical Notes & Diagnosis"
    override val rxPrescription: String = "Prescription (Rx)"
    override val attachLabOrder: String = "Attach Lab Test Order"
    override val saveConsultation: String = "Save & Complete Consultation"

    override val dateToday: String = "Today"
    override val dateTomorrow: String = "Tomorrow"
    override val pickDate: String = "Pick Date"
    override val allDoctors: String = "All Doctors"

    override val avgConsultationTimeTitle: String = "Average Consultation Time"
    override val autoCalculatedMode: String = "Smart Auto (Based on actual consultation times)"
    override val manualOverrideMode: String = "Manual Override"
    override val minutesUnit: String = "minutes"
    override val saveAvgTimePrompt: String = "Save Consultation Duration"

    override val workingHoursTitle: String = "Working Hours & Schedule"
    override val dayOfWeek: String = "Day"
    override val openTime: String = "Open Time"
    override val closeTime: String = "Close Time"
    override val isClosedDay: String = "Closed Day"
    override val clinicBreakTitle: String = "Scheduled Daily Breaks"
    override val breakStart: String = "Break Start"
    override val breakEnd: String = "Break End"
    override val addBreakBtn: String = "Add Break Interval"

    override val futureApptsTitle: String = "Future OPD Appointments"
    override val noShowManagerTitle: String = "No-Show Patient Recovery"
    override val restoreToQueue: String = "Re-add to Queue"
    override val payAtDeskTitle: String = "Pay-at-Desk Approvals"
    override val approvePayment: String = "Approve & Issue Token"
    override val rejectPayment: String = "Decline Request"
    override val slotManagerTitle: String = "Time Slot Capacity Manager"
    override val maxPatientsPerSlot: String = "Max Patients per Slot"
    override val createSlotBtn: String = "Add Time Slot"
}

object ClinicQueueOperationsNepali : ClinicQueueOperationsStrings {
    override val queueBoardTitle: String = "प्रत्यक्ष ओपीडी लाम बोर्ड"
    override val selectDoctorPrompt: String = "डाक्टर छान्नुहोस्"
    override val tabWaiting: String = "प्रतीक्षारत"
    override val tabInConsult: String = "परामर्श कक्षमा"
    override val tabCompleted: String = "सम्पन्न"
    override val tabNoShow: String = "अनुपस्थित (No-Show)"
    override val tokenNumber: String = "टोकन #"
    override val callNextPatient: String = "पालो बोलाउनुहोस्"
    override val recallPatient: String = "पुनः बोलाउनुहोस्"
    override val markCompleted: String = "सम्पन्न गर्नुहोस्"
    override val markNoShow: String = "उपस्थित नभएको जनाउनुहोस्"
    override val transferQueue: String = "अर्को डाक्टरमा स्थानान्तरण"
    override val pauseQueue: String = "लाम रोक्नुहोस्"
    override val resumeQueue: String = "लाम सुरु गर्नुहोस्"
    override val currentServing: String = "हाल सेवा पाइरहनुभएको"
    override val noPatientsWaiting: String = "प्रतीक्षा सूचीमा कोही बिरामी छैनन्"
    override val noActiveConsultation: String = "हाल परामर्श कक्षमा कोही बिरामी हुनुहुन्न"
    override val walkinTokenBadge: String = "वाक-इन (काउन्टर)"
    override val onlineBookingBadge: String = "अनलाइन बुकिङ"
    override val estimatedWaitMinutes: String = "अनुमानित समय"
    override val patientVitals: String = "बिरामीको स्वास्थ्य मापदण्ड (Vitals)"
    override val bloodPressure: String = "रक्तचाप (BP)"
    override val pulseRate: String = "नाडी गति (BPM)"
    override val temperature: String = "तापक्रम (°F)"
    override val weightKg: String = "तौल (के.जी.)"
    override val clinicalNotes: String = "रोग निदान तथा क्लिनिकल नोट"
    override val rxPrescription: String = "औषधि प्रेस्क्रिप्सन (Rx)"
    override val attachLabOrder: String = "ल्याब परीक्षण सिफारिस थप्नुहोस्"
    override val saveConsultation: String = "सुरक्षित गरी सम्पन्न गर्नुहोस्"

    override val dateToday: String = "आज"
    override val dateTomorrow: String = "भोलि"
    override val pickDate: String = "मिति छान्नुहोस्"
    override val allDoctors: String = "सबै डाक्टरहरू"

    override val avgConsultationTimeTitle: String = "औसत परामर्श समय"
    override val autoCalculatedMode: String = "स्मार्ट स्वतः गणना (वास्तविक परामर्श समयअनुसार)"
    override val manualOverrideMode: String = "म्यानुअल निर्धारण"
    override val minutesUnit: String = "मिनेट"
    override val saveAvgTimePrompt: String = "परामर्श समय सुरक्षित गर्नुहोस्"

    override val workingHoursTitle: String = "कार्य समय तथा तालिका"
    override val dayOfWeek: String = "दिन"
    override val openTime: String = "खुल्ने समय"
    override val closeTime: String = "बन्द हुने समय"
    override val isClosedDay: String = "सार्वजनिक बिदा"
    override val clinicBreakTitle: String = "दैनिक विश्राम (ब्रेक) समय"
    override val breakStart: String = "ब्रेक सुरु"
    override val breakEnd: String = "ब्रेक अन्त्य"
    override val addBreakBtn: String = "ब्रेक समय थप्नुहोस्"

    override val futureApptsTitle: String = "आगामी ओपीडी अपोइन्टमेन्टहरू"
    override val noShowManagerTitle: String = "अनुपस्थित बिरामी व्यवस्थापन"
    override val restoreToQueue: String = "लाममा पुनः थप्नुहोस्"
    override val payAtDeskTitle: String = "काउन्टर भुक्तानी स्वीकृति (Pay at Desk)"
    override val approvePayment: String = "स्वीकृत गरी टोकन जारी गर्नुहोस्"
    override val rejectPayment: String = "अस्वीकार गर्नुहोस्"
    override val slotManagerTitle: String = "समय स्लट क्षमता व्यवस्थापक"
    override val maxPatientsPerSlot: String = "प्रति स्लट अधिकतम बिरामी"
    override val createSlotBtn: String = "नयाँ स्लट थप्नुहोस्"
}
