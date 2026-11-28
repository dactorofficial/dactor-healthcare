package com.dactor.patient.ui.i18n

interface PatientQueueRecordsStrings {
    // Queue Status & Live Tracker
    val queueStatusTitle: String
    val queueTrackPrompt: String
    val queueTokenLabel: String
    val queuePositionLabel: String
    val queueEstWaitLabel: String
    val queueDoctorInside: String
    val queueDoctorAway: String
    val queueCancelNotice: String
    val queueCurrentServing: String
    val queueExpectedWindow: String
    val queueStageWaiting: String
    val queueStageInConsult: String
    val queueStageCompleted: String
    val queueCancelApptBtn: String
    val queueRescheduleBtn: String
    val queueTrackingCodeLabel: String
    val copyTrackingCode: String
    val trackingCodeCopied: String

    // Lookup & Quick Track
    val trackingLookupTitle: String
    val enterTrackingCodePlaceholder: String
    val trackNowBtn: String
    val pastTrackedList: String

    // Health Records & History
    val recordsHeaderTitle: String
    val recordsHeaderSub: String
    val recordsFilterAll: String
    val recordsFilterCompleted: String
    val recordsFilterWithBills: String
    val recordsLinkCodeBtn: String
    val recordsLinkCodeDialogTitle: String
    val recordsCombinedTotal: String
    val recordsCombinedPaid: String
    val recordsCombinedDue: String
    val recordsViewDetails: String
    val recordNoPrescription: String
    val recordAttachedLabReports: String
    val downloadOfficialBillPdf: String

    // Lab Reports
    val labReportsTitle: String
    val labReportsSub: String
    val labReportReadyBadge: String
    val labReportPendingBadge: String
    val labReportDeliveredBadge: String
    val viewReportBtn: String
    val downloadReportPdfBtn: String
    val labTestCategory: String
    val specimenCollectedAt: String
    val reportUploadedAt: String
    val pathologistNotes: String
}

object PatientQueueRecordsEnglish : PatientQueueRecordsStrings {
    override val queueStatusTitle: String = "Live Queue Tracker"
    override val queueTrackPrompt: String = "Real-time consultation status & arrival window"
    override val queueTokenLabel: String = "Your Token"
    override val queuePositionLabel: String = "Position in Queue"
    override val queueEstWaitLabel: String = "Est. Waiting Time"
    override val queueDoctorInside: String = "Doctor In Clinic - Consultations active"
    override val queueDoctorAway: String = "Doctor Away - Consultations paused temporarily"
    override val queueCancelNotice: String = "This appointment has been cancelled."
    override val queueCurrentServing: String = "Now Calling Token #"
    override val queueExpectedWindow: String = "Expected Consultation Window"
    override val queueStageWaiting: String = "Waiting in Queue"
    override val queueStageInConsult: String = "In Consultation Chamber"
    override val queueStageCompleted: String = "Consultation Completed"
    override val queueCancelApptBtn: String = "Cancel Appointment"
    override val queueRescheduleBtn: String = "Reschedule Slot"
    override val queueTrackingCodeLabel: String = "10-Digit Tracking Code"
    override val copyTrackingCode: String = "Copy Code"
    override val trackingCodeCopied: String = "Tracking code copied to clipboard"

    override val trackingLookupTitle: String = "Track with 10-Digit Code"
    override val enterTrackingCodePlaceholder: String = "Enter 10-digit code (e.g. AB12CD34EF)"
    override val trackNowBtn: String = "Track Live Queue"
    override val pastTrackedList: String = "Recent Saved Appointments"

    override val recordsHeaderTitle: String = "Medical History"
    override val recordsHeaderSub: String = "Visits & lab reports"
    override val recordsFilterAll: String = "All"
    override val recordsFilterCompleted: String = "Completed"
    override val recordsFilterWithBills: String = "Invoices"
    override val recordsLinkCodeBtn: String = "Link Code"
    override val recordsLinkCodeDialogTitle: String = "Link Appointment via Tracking Code"
    override val recordsCombinedTotal: String = "Total Billed"
    override val recordsCombinedPaid: String = "Total Paid"
    override val recordsCombinedDue: String = "Outstanding Due"
    override val recordsViewDetails: String = "View Consultation Summary"
    override val recordNoPrescription: String = "No digital prescription attached"
    override val recordAttachedLabReports: String = "Attached Lab Reports"
    override val downloadOfficialBillPdf: String = "Download Official Receipt (PDF)"

    override val labReportsTitle: String = "Laboratory & Diagnostic Reports"
    override val labReportsSub: String = "View and download digital medical test reports"
    override val labReportReadyBadge: String = "Report Ready"
    override val labReportPendingBadge: String = "In Analysis"
    override val labReportDeliveredBadge: String = "Delivered"
    override val viewReportBtn: String = "View Report"
    override val downloadReportPdfBtn: String = "Download PDF"
    override val labTestCategory: String = "Investigation"
    override val specimenCollectedAt: String = "Sample Collected"
    override val reportUploadedAt: String = "Report Released"
    override val pathologistNotes: String = "Pathologist Findings"
}

object PatientQueueRecordsNepali : PatientQueueRecordsStrings {
    override val queueStatusTitle: String = "प्रत्यक्ष लाम ट्र्याकर"
    override val queueTrackPrompt: String = "वास्तविक समयको परामर्श अवस्था र पुग्नुपर्ने समय"
    override val queueTokenLabel: String = "तपाईंको टोकन"
    override val queuePositionLabel: String = "लाममा तपाईंको पालो"
    override val queueEstWaitLabel: String = "अनुमानित पर्खने समय"
    override val queueDoctorInside: String = "डाक्टर क्लिनिकभित्र - परामर्श जारी छ"
    override val queueDoctorAway: String = "डाक्टर बाहिर - परामर्श केही समय रोकिएको छ"
    override val queueCancelNotice: String = "यो अपोइन्टमेन्ट रद्द गरिएको छ।"
    override val queueCurrentServing: String = "हाल सेवा पाइरहनुभएको टोकन #"
    override val queueExpectedWindow: String = "अपेक्षित परामर्श समय"
    override val queueStageWaiting: String = "लाममा प्रतीक्षारत"
    override val queueStageInConsult: String = "परामर्श कक्षमा"
    override val queueStageCompleted: String = "परामर्श सम्पन्न"
    override val queueCancelApptBtn: String = "अपोइन्टमेन्ट रद्द गर्नुहोस्"
    override val queueRescheduleBtn: String = "समय परिवर्तन गर्नुहोस्"
    override val queueTrackingCodeLabel: String = "१०-अङ्के ट्र्याकिङ कोड"
    override val copyTrackingCode: String = "कोड कपी गर्नुहोस्"
    override val trackingCodeCopied: String = "ट्र्याकिङ कोड कपी भयो"

    override val trackingLookupTitle: String = "१०-अङ्के कोडबाट ट्र्याक गर्नुहोस्"
    override val enterTrackingCodePlaceholder: String = "१०-अङ्के कोड राख्नुहोस् (उदा. AB12CD34EF)"
    override val trackNowBtn: String = "प्रत्यक्ष लाम हेर्नुहोस्"
    override val pastTrackedList: String = "हालसालै सुरक्षित गरिएका अपोइन्टमेन्टहरू"

    override val recordsHeaderTitle: String = "स्वास्थ्य विवरण"
    override val recordsHeaderSub: String = "परामर्श र रिपोर्टहरू"
    override val recordsFilterAll: String = "सबै"
    override val recordsFilterCompleted: String = "सम्पन्न"
    override val recordsFilterWithBills: String = "रसिदसहित"
    override val recordsLinkCodeBtn: String = "कोड जोड्नुहोस्"
    override val recordsLinkCodeDialogTitle: String = "ट्र्याकिङ कोडमार्फत अपोइन्टमेन्ट जोड्नुहोस्"
    override val recordsCombinedTotal: String = "कुल बिल रकम"
    override val recordsCombinedPaid: String = "तिरिसकेको रकम"
    override val recordsCombinedDue: String = "बाँकी बक्यौता"
    override val recordsViewDetails: String = "परामर्श सारांश हेर्नुहोस्"
    override val recordNoPrescription: String = "कुनै डिजिटल प्रेस्क्रिप्सन फेला परेन"
    override val recordAttachedLabReports: String = "संलग्न ल्याब रिपोर्टहरू"
    override val downloadOfficialBillPdf: String = "आधिकारिक रसिद (PDF) डाउनलोड"

    override val labReportsTitle: String = "ल्याब तथा निदान रिपोर्टहरू"
    override val labReportsSub: String = "डिजिटल स्वास्थ्य परीक्षण रिपोर्टहरू हेर्नुहोस् र डाउनलोड गर्नुहोस्"
    override val labReportReadyBadge: String = "रिपोर्ट तयार"
    override val labReportPendingBadge: String = "परीक्षण हुँदै"
    override val labReportDeliveredBadge: String = "हस्तान्तरण गरियो"
    override val viewReportBtn: String = "रिपोर्ट हेर्नुहोस्"
    override val downloadReportPdfBtn: String = "PDF डाउनलोड गर्नुहोस्"
    override val labTestCategory: String = "परीक्षणको नाम"
    override val specimenCollectedAt: String = "नमुना संकलित मिति"
    override val reportUploadedAt: String = "रिपोर्ट जारी मिति"
    override val pathologistNotes: String = "प्याथोलोजिस्ट निष्कर्ष"
}
