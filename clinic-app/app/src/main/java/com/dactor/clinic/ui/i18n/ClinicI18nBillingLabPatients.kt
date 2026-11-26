package com.dactor.clinic.ui.i18n

interface ClinicBillingLabPatientsStrings {
    // Billing & Invoices
    val billingHeaderTitle: String
    val invoicesTab: String
    val catalogTab: String
    val newInvoiceBtn: String
    val patientSearchPrompt: String
    val selectDoctorForBill: String
    val invoiceNumber: String
    val itemDescription: String
    val unitPrice: String
    val quantity: String
    val subtotal: String
    val taxAmount: String
    val discountAmount: String
    val totalAmount: String
    val paidAmount: String
    val dueAmount: String
    val paymentModeLabel: String
    val paymentModeCash: String
    val paymentModeEsewa: String
    val paymentModeKhalti: String
    val paymentModeCard: String
    val paymentModePayAtDesk: String
    val paymentStatusPaid: String
    val paymentStatusPending: String
    val paymentStatusRefunded: String
    val generateBillBtn: String
    val downloadPdfBtn: String
    val printBillBtn: String
    val consultationFeeManagerTitle: String
    val standardOpdFee: String
    val followUpFee: String
    val emergencyFee: String
    val paymentAuditLogsTitle: String
    val transactionId: String

    // Lab & Diagnostics
    val labWorkflowTitle: String
    val tabPendingSample: String
    val tabSampleCollected: String
    val tabInAnalysis: String
    val tabReportReady: String
    val tabDelivered: String
    val testName: String
    val specimenType: String
    val collectedBy: String
    val collectSampleBtn: String
    val markAnalysisBtn: String
    val uploadReportBtn: String
    val deliverReportBtn: String
    val reportFileLabel: String
    val labReportCompressionHint: String
    val sampleCollectionTime: String
    val normalRangeLabel: String
    val testResultLabel: String
    val labRemarks: String

    // Patient Directory & Details
    val patientDirectoryTitle: String
    val searchPatientsPlaceholder: String
    val addNewWalkinPatient: String
    val patientName: String
    val patientAgeGender: String
    val contactNumber: String
    val emergencyContact: String
    val medicalHistory: String
    val chronicConditions: String
    val allergies: String
    val pastVisitsCount: String
    val lastVisitDate: String
    val viewFullProfile: String
    val startConsultationBtn: String
    val issueTokenBtn: String
    val registerPatientBtn: String
}

object ClinicBillingLabPatientsEnglish : ClinicBillingLabPatientsStrings {
    override val billingHeaderTitle: String = "Billing & Financial Invoices"
    override val invoicesTab: String = "Invoices"
    override val catalogTab: String = "Service Catalog"
    override val newInvoiceBtn: String = "New Invoice"
    override val patientSearchPrompt: String = "Search patient by name or phone"
    override val selectDoctorForBill: String = "Attending Doctor"
    override val invoiceNumber: String = "Invoice #"
    override val itemDescription: String = "Service / Item Description"
    override val unitPrice: String = "Unit Price"
    override val quantity: String = "Qty"
    override val subtotal: String = "Subtotal"
    override val taxAmount: String = "Tax (VAT)"
    override val discountAmount: String = "Discount"
    override val totalAmount: String = "Total Amount"
    override val paidAmount: String = "Paid Amount"
    override val dueAmount: String = "Due Balance"
    override val paymentModeLabel: String = "Payment Method"
    override val paymentModeCash: String = "Cash at Counter"
    override val paymentModeEsewa: String = "eSewa"
    override val paymentModeKhalti: String = "Khalti"
    override val paymentModeCard: String = "Credit/Debit Card"
    override val paymentModePayAtDesk: String = "Pay at Desk"
    override val paymentStatusPaid: String = "Paid"
    override val paymentStatusPending: String = "Pending"
    override val paymentStatusRefunded: String = "Refunded"
    override val generateBillBtn: String = "Generate Bill & Receipt"
    override val downloadPdfBtn: String = "Download Official PDF"
    override val printBillBtn: String = "Print Receipt"
    override val consultationFeeManagerTitle: String = "Doctor Consultation Fees"
    override val standardOpdFee: String = "Standard OPD Fee"
    override val followUpFee: String = "Follow-up Fee"
    override val emergencyFee: String = "Emergency OPD Fee"
    override val paymentAuditLogsTitle: String = "Payment Audit & Transaction Logs"
    override val transactionId: String = "Transaction Ref / ID"

    override val labWorkflowTitle: String = "Laboratory & Diagnostic Workflow"
    override val tabPendingSample: String = "Pending Collection"
    override val tabSampleCollected: String = "Sample Collected"
    override val tabInAnalysis: String = "In Analysis"
    override val tabReportReady: String = "Report Ready"
    override val tabDelivered: String = "Delivered"
    override val testName: String = "Investigation / Test"
    override val specimenType: String = "Specimen Type (Blood, Urine, Swab)"
    override val collectedBy: String = "Collected By Phlebotomist"
    override val collectSampleBtn: String = "Confirm Sample Collected"
    override val markAnalysisBtn: String = "Send for Analysis"
    override val uploadReportBtn: String = "Upload Lab Report"
    override val deliverReportBtn: String = "Deliver to Patient"
    override val reportFileLabel: String = "Report Document (PDF / Images)"
    override val labReportCompressionHint: String = "Auto-optimized: up to 100 KB per uploaded image (n × 100 KB total)"
    override val sampleCollectionTime: String = "Collection Timestamp"
    override val normalRangeLabel: String = "Reference Normal Range"
    override val testResultLabel: String = "Observed Result"
    override val labRemarks: String = "Pathologist Remarks"

    override val patientDirectoryTitle: String = "Patient Medical Directory"
    override val searchPatientsPlaceholder: String = "Search by name, phone or 10-digit code..."
    override val addNewWalkinPatient: String = "New Walk-in Patient"
    override val patientName: String = "Patient Name"
    override val patientAgeGender: String = "Age / Gender"
    override val contactNumber: String = "Primary Phone"
    override val emergencyContact: String = "Emergency Contact Person & Phone"
    override val medicalHistory: String = "Medical History & Pre-existing Illness"
    override val chronicConditions: String = "Chronic Conditions"
    override val allergies: String = "Known Drug / Food Allergies"
    override val pastVisitsCount: String = "Past Visits"
    override val lastVisitDate: String = "Last Visited"
    override val viewFullProfile: String = "View Full Medical Chart"
    override val startConsultationBtn: String = "Open Consultation"
    override val issueTokenBtn: String = "Issue OPD Token"
    override val registerPatientBtn: String = "Register Patient"
}

object ClinicBillingLabPatientsNepali : ClinicBillingLabPatientsStrings {
    override val billingHeaderTitle: String = "बिलिङ तथा वित्तीय रसिदहरू"
    override val invoicesTab: String = "रसिदहरू (Invoices)"
    override val catalogTab: String = "सेवा शुल्क सूची"
    override val newInvoiceBtn: String = "नयाँ बिल बनाउनुहोस्"
    override val patientSearchPrompt: String = "नाम वा फोनबाट बिरामी खोज्नुहोस्"
    override val selectDoctorForBill: String = "सम्बन्धित डाक्टर"
    override val invoiceNumber: String = "रसिद नं. #"
    override val itemDescription: String = "सेवा / वस्तुको विवरण"
    override val unitPrice: String = "दर"
    override val quantity: String = "परिमाण"
    override val subtotal: String = "जम्मा रकम"
    override val taxAmount: String = "कर (VAT)"
    override val discountAmount: String = "छुट"
    override val totalAmount: String = "कुल रकम"
    override val paidAmount: String = "बुझाइएको रकम"
    override val dueAmount: String = "बाँकी रकम"
    override val paymentModeLabel: String = "भुक्तानी विधि"
    override val paymentModeCash: String = "काउन्टरमा नगद"
    override val paymentModeEsewa: String = "ईसेवा (eSewa)"
    override val paymentModeKhalti: String = "खल्ती (Khalti)"
    override val paymentModeCard: String = "क्रेडिट/डेबिट कार्ड"
    override val paymentModePayAtDesk: String = "काउन्टर भुक्तानी (Pay at Desk)"
    override val paymentStatusPaid: String = "भुक्तान भइसकेको"
    override val paymentStatusPending: String = "बाँकी"
    override val paymentStatusRefunded: String = "फिर्ता गरिएको"
    override val generateBillBtn: String = "बिल तथा रसिद जारी गर्नुहोस्"
    override val downloadPdfBtn: String = "आधिकारिक PDF डाउनलोड गर्नुहोस्"
    override val printBillBtn: String = "रसिद प्रिन्ट गर्नुहोस्"
    override val consultationFeeManagerTitle: String = "डाक्टर परामर्श शुल्क व्यवस्थापन"
    override val standardOpdFee: String = "नियमित ओपीडी शुल्क"
    override val followUpFee: String = "फलो-अप (Follow-up) शुल्क"
    override val emergencyFee: String = "आकस्मिक ओपीडी शुल्क"
    override val paymentAuditLogsTitle: String = "भुक्तानी विवरण तथा अडिट लग"
    override val transactionId: String = "कारोबार सन्दर्भ / ID"

    override val labWorkflowTitle: String = "ल्याब तथा निदान परीक्षण कार्यप्रणाली"
    override val tabPendingSample: String = "नमुना संकलन बाँकी"
    override val tabSampleCollected: String = "नमुना संकलित"
    override val tabInAnalysis: String = "परीक्षण हुँदै"
    override val tabReportReady: String = "रिपोर्ट तयार"
    override val tabDelivered: String = "बिरामीलाई दिइयो"
    override val testName: String = "परीक्षणको नाम"
    override val specimenType: String = "नमुना प्रकार (रगत, पिसाब, स्वाब)"
    override val collectedBy: String = "नमुना संकलनकर्ता"
    override val collectSampleBtn: String = "नमुना संकलन पुष्टि गर्नुहोस्"
    override val markAnalysisBtn: String = "परीक्षणका लागि पठाउनुहोस्"
    override val uploadReportBtn: String = "ल्याब रिपोर्ट अपलोड गर्नुहोस्"
    override val deliverReportBtn: String = "बिरामीलाई रिपोर्ट हस्तान्तरण गर्नुहोस्"
    override val reportFileLabel: String = "रिपोर्ट फाइल (PDF / तस्बिर)"
    override val labReportCompressionHint: String = "स्वतः अनुकूलित: प्रति तस्बिर बढीमा १०० केबी सम्म (n × १०० केबी)"
    override val sampleCollectionTime: String = "संकलन मिति तथा समय"
    override val normalRangeLabel: String = "सामान्य दायरा (Normal Range)"
    override val testResultLabel: String = "परीक्षण नतिजा"
    override val labRemarks: String = "प्याथोलोजिस्ट कैफियत"

    override val patientDirectoryTitle: String = "बिरामी स्वास्थ्य डाइरेक्टरी"
    override val searchPatientsPlaceholder: String = "नाम, फोन वा १०-अङ्के कोडबाट खोज्नुहोस्..."
    override val addNewWalkinPatient: String = "नयाँ वाक-इन बिरामी"
    override val patientName: String = "बिरामीको नाम"
    override val patientAgeGender: String = "उमेर / लिङ्ग"
    override val contactNumber: String = "सम्पर्क फोन"
    override val emergencyContact: String = "आकस्मिक सम्पर्क व्यक्ति र फोन"
    override val medicalHistory: String = "विगतको स्वास्थ्य इतिहास"
    override val chronicConditions: String = "दीर्घरोग"
    override val allergies: String = "औषधि / खानाको एलर्जी"
    override val pastVisitsCount: String = "पहिलेका भ्रमणहरू"
    override val lastVisitDate: String = "पछिल्लो पटक आएको मिति"
    override val viewFullProfile: String = "पूर्ण स्वास्थ्य विवरण हेर्नुहोस्"
    override val startConsultationBtn: String = "परामर्श सुरु गर्नुहोस्"
    override val issueTokenBtn: String = "ओपीडी टोकन जारी गर्नुहोस्"
    override val registerPatientBtn: String = "बिरामी दर्ता गर्नुहोस्"
}
