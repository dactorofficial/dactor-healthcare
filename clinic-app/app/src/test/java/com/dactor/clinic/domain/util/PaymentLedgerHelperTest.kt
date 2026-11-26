package com.dactor.clinic.domain.util

import com.dactor.clinic.data.model.Appointment
import com.dactor.clinic.data.model.BillingInvoice
import com.dactor.clinic.data.model.Doctor
import com.dactor.clinic.data.model.InvoiceTransaction
import com.dactor.clinic.data.model.PaymentRecord
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class PaymentLedgerHelperTest {

    @Test
    fun testExtractCleanClinicalRemarks_pureRemarks() {
        val input = "Patient diagnosed with mild viral fever. Advised 3 days bed rest."
        val result = PaymentLedgerHelper.extractCleanClinicalRemarks(input)
        assertEquals(input, result)
    }

    @Test
    fun testExtractCleanClinicalRemarks_nullOrBlank() {
        assertEquals("", PaymentLedgerHelper.extractCleanClinicalRemarks(null))
        assertEquals("", PaymentLedgerHelper.extractCleanClinicalRemarks(""))
        assertEquals("", PaymentLedgerHelper.extractCleanClinicalRemarks("   \n\t  "))
    }

    @Test
    fun testExtractCleanClinicalRemarks_stripsPaymentLogTags() {
        val input = """
            Follow-up visit in 7 days. Prescribed paracetamol 500mg.
            
            <!--PAYMENT_LOG_START-->
            [{"amount":500.0,"dateTime":"2026-11-13 10:30 AM","note":"Cash"}]
            <!--PAYMENT_LOG_END-->
        """.trimIndent()

        val result = PaymentLedgerHelper.extractCleanClinicalRemarks(input)
        assertEquals("Follow-up visit in 7 days. Prescribed paracetamol 500mg.", result)
    }

    @Test
    fun testExtractCleanClinicalRemarks_onlyPaymentLogReturnsEmpty() {
        val input = """
            <!--PAYMENT_LOG_START-->
            [{"amount":1000.0,"dateTime":"2026-11-13 11:00 AM","note":"Payment Received"}]
            <!--PAYMENT_LOG_END-->
        """.trimIndent()

        val result = PaymentLedgerHelper.extractCleanClinicalRemarks(input)
        assertEquals("", result)
    }

    @Test
    fun testExtractCleanClinicalRemarks_stripsWebPaymentLogsTag() {
        val input = """
            [PAYMENT_LOGS][{"amount":750.0,"date_time":"2026-11-13 12:00 PM","note":"Cash"}][/PAYMENT_LOGS] Patient advised regular exercise.
        """.trimIndent()

        val result = PaymentLedgerHelper.extractCleanClinicalRemarks(input)
        assertEquals("Patient advised regular exercise.", result)
    }

    @Test
    fun testExtractCleanClinicalRemarks_stripsRawJsonAndHtmlComments() {
        val input = """
            <!-- Internal comment -->
            [[META:clinic_id=123]]
            [{"amount":500.0,"date_time":"2026-11-13"}]
            Prescribed eye drops.
        """.trimIndent()

        val result = PaymentLedgerHelper.extractCleanClinicalRemarks(input)
        assertEquals("Prescribed eye drops.", result)
    }

    @Test
    fun testParsePaymentRecords_parsesStandardCommentFormat() {
        val rawRemarks = """
            Checkup done.
            <!--PAYMENT_LOG_START-->
            [{"amount":500.0,"dateTime":"2026-11-13 10:00 AM","note":"Cash"}, {"amount":300.0,"dateTime":"2026-11-13 11:00 AM","note":"Advance"}]
            <!--PAYMENT_LOG_END-->
        """.trimIndent()

        val records = PaymentLedgerHelper.parsePaymentRecords(rawRemarks)
        assertEquals(2, records.size)
        assertEquals(500.0, records[0].amount, 0.001)
        assertEquals("Cash", records[0].note)
        assertEquals(300.0, records[1].amount, 0.001)
        assertEquals("Advance", records[1].note)
    }

    @Test
    fun testParsePaymentRecords_parsesWebPortalFormat() {
        val rawRemarks = """
            [PAYMENT_LOGS][{"amount":1200.0,"dateTime":"2026-11-13 02:00 PM","note":"Pay at Desk"}][/PAYMENT_LOGS]
        """.trimIndent()

        val records = PaymentLedgerHelper.parsePaymentRecords(rawRemarks)
        assertEquals(1, records.size)
        assertEquals(1200.0, records[0].amount, 0.001)
        assertEquals("Pay at Desk", records[0].note)
    }

    @Test
    fun testBuildCombinedRemarks_preservesBothRemarksAndLogs() {
        val cleanNote = "Patient cleared for discharge."
        val payments = listOf(
            PaymentRecord(amount = 1500.0, dateTime = "2026-11-13 12:00 PM", note = "Cash Payment")
        )

        val combined = PaymentLedgerHelper.buildCombinedRemarks(cleanNote, payments)
        assertTrue(combined.contains(cleanNote))
        assertTrue(combined.contains("<!--PAYMENT_LOG_START-->"))
        assertTrue(combined.contains("<!--PAYMENT_LOG_END-->"))
        assertTrue(combined.contains("1500.0"))

        // Extracting clean remarks must recover the exact note without payment logs
        val extractedNote = PaymentLedgerHelper.extractCleanClinicalRemarks(combined)
        assertEquals(cleanNote, extractedNote)

        // Parsing payments must recover the exact payment records
        val parsedPayments = PaymentLedgerHelper.parsePaymentRecords(combined)
        assertEquals(1, parsedPayments.size)
        assertEquals(1500.0, parsedPayments[0].amount, 0.001)
        assertEquals("Cash Payment", parsedPayments[0].note)
    }

    @Test
    fun testUnifiedPaymentLogs_payAtDeskExactCommissionNotGrossPercent() {
        val doctor = Doctor(
            id = "doc-1",
            fullName = "Dr. Subash Sharma",
            email = "dr.sharma@example.com",
            specialty = "Cardiology",
            consultationFee = 450.0
        )
        val appt = Appointment(
            id = "appt-1",
            clinicId = "clinic-1",
            doctorId = "doc-1",
            patientName = "Ram Bahadur",
            patientMobile = "9800000001",
            appointmentDate = "2026-11-13",
            appointmentTime = "10:00 AM",
            paymentMode = "PAY_AT_DESK",
            paymentStatus = "paid",
            feeAmount = 450.0,
            serviceChargeAmount = 22.5,
            totalAmount = 472.5
        )
        // Patient paid 472.5 for consultation + 200.0 for an ECG procedure
        val txConsultation = InvoiceTransaction(
            id = "tx-1",
            appointmentId = "appt-1",
            clinicId = "clinic-1",
            amount = 472.5,
            paymentMethod = "PAY_AT_DESK",
            category = "CONSULTATION",
            notes = "Pay at Desk Consultation (incl 5% charge)",
            createdAt = "2026-11-13T10:00:00Z"
        )
        val txEcg = InvoiceTransaction(
            id = "tx-2",
            appointmentId = "appt-1",
            clinicId = "clinic-1",
            amount = 200.0,
            paymentMethod = "CASH",
            category = "PROCEDURE",
            notes = "12-Lead ECG Test",
            createdAt = "2026-11-13T10:15:00Z"
        )

        val logs = PaymentLedgerHelper.buildUnifiedPaymentLogs(
            appointments = listOf(appt),
            invoices = emptyList(),
            doctors = listOf(doctor),
            transactions = listOf(txConsultation, txEcg)
        )

        assertEquals(2, logs.size)
        val consultLog = logs.find { it.category == "CONSULTATION" }!!
        val ecgLog = logs.find { it.category == "PROCEDURE" }!!

        // Commission must be strictly 22.5 on consultation, and 0.0 on extra procedure
        assertEquals(22.5, consultLog.serviceChargeAmount, 0.001)
        assertEquals(0.0, ecgLog.serviceChargeAmount, 0.001)

        val grossCollected = logs.sumOf { it.amount }
        val platformCommission = logs.sumOf { it.serviceChargeAmount }
        val netClinicPayout = grossCollected - platformCommission

        assertEquals(672.5, grossCollected, 0.001)
        assertEquals(22.5, platformCommission, 0.001)
        // Clinic receives full 450 (consultation) + 200 (ECG) = 650.0 (NOT 638.87 / 95% haircut!)
        assertEquals(650.0, netClinicPayout, 0.001)
    }

    @Test
    fun testGeneratePaymentLogsCsv_accurateCommissionAndNo95Percent() {
        val doctor = Doctor(
            id = "doc-1",
            fullName = "Dr. Subash Sharma",
            email = "dr.sharma@example.com",
            specialty = "Cardiology",
            consultationFee = 450.0
        )
        val appt = Appointment(
            id = "appt-1",
            clinicId = "clinic-1",
            doctorId = "doc-1",
            patientName = "Ram Bahadur",
            patientMobile = "9800000001",
            appointmentDate = "2026-11-13",
            appointmentTime = "10:00 AM",
            paymentMode = "PAY_AT_DESK",
            paymentStatus = "paid",
            feeAmount = 450.0,
            serviceChargeAmount = 22.5,
            totalAmount = 472.5
        )
        val tx = InvoiceTransaction(
            id = "tx-1",
            appointmentId = "appt-1",
            clinicId = "clinic-1",
            amount = 472.5,
            paymentMethod = "PAY_AT_DESK",
            category = "CONSULTATION",
            notes = "Pay at Desk Consultation",
            createdAt = "2026-11-13T10:00:00Z"
        )
        val logs = PaymentLedgerHelper.buildUnifiedPaymentLogs(
            appointments = listOf(appt),
            invoices = emptyList(),
            doctors = listOf(doctor),
            transactions = listOf(tx)
        )

        val csv = PaymentLedgerHelper.generatePaymentLogsCsv(logs, "Today", "Kathmandu Heart Clinic")

        // Must not contain "95%"
        assertFalse(csv.contains("95%"))
        assertFalse(csv.contains("5% Platform Desk Cut"))
        // Must accurately state Pay-at-Desk platform commission
        assertTrue(csv.contains("\"Dactor Pay-at-Desk Platform Commission (NPR)\",\"22\""))
        assertTrue(csv.contains("\"Net Clinic OPD Payout (NPR)\",\"450\""))
    }

    @Test
    fun testDerivePatientKey_distinguishesFamilyMembersUnderSameUserId() {
        val key1 = PaymentLedgerHelper.derivePatientKey(
            userId = "shared_account_uuid",
            phone = "9703951751",
            name = "evil pathogen",
            fallbackId = "fb1"
        )
        val key2 = PaymentLedgerHelper.derivePatientKey(
            userId = "shared_account_uuid",
            phone = "9345842404",
            name = "anubhav",
            fallbackId = "fb2"
        )
        // Two distinct patients under the same user account must not collide
        assertFalse("Distinct patients under same account should not share key", key1 == key2)
        assertEquals("9703951751|evil pathogen", key1)
        assertEquals("9345842404|anubhav", key2)
    }

    @Test
    fun testComputeDoctorDailyAndMonthlyStats_chargedVisitReturningPatientMaintainsRevenue() {
        val doctor = Doctor(
            id = "doc-1",
            fullName = "Dr. Test Doctor",
            email = "doc@example.com",
            consultationFee = 1300.0
        )
        // Patient visits on 2026-11-20 (visit 1, free/earlier)
        val appt1 = Appointment(
            id = "appt-1",
            clinicId = "clinic-1",
            doctorId = "doc-1",
            userId = "usr-1",
            patientName = "evil pathogen",
            patientMobile = "9703951751",
            appointmentDate = "2026-11-20",
            appointmentTime = "10:00:00",
            feeAmount = 0.0,
            totalAmount = 0.0,
            status = "APPROVED"
        )
        // Patient visits again on 2026-11-21 as a paid consultation (visit 2, fee = 1300)
        val appt2 = Appointment(
            id = "appt-2",
            clinicId = "clinic-1",
            doctorId = "doc-1",
            userId = "usr-1",
            patientName = "evil pathogen",
            patientMobile = "9703951751",
            appointmentDate = "2026-11-21",
            appointmentTime = "09:00:00",
            feeAmount = 1300.0,
            totalAmount = 1365.0,
            status = "APPROVED"
        )

        val stats = PaymentLedgerHelper.computeDoctorDailyAndMonthlyStats(
            appointments = listOf(appt1, appt2),
            invoices = emptyList(),
            doctors = listOf(doctor),
            transactions = emptyList()
        )

        assertEquals(1, stats.size)
        val docStat = stats[0]
        assertEquals(2, docStat.totalVisits)
        assertEquals(1, docStat.newPatients)
        assertEquals(1, docStat.followupPatients)
        // Revenue should include the 1300.0 from appt2, not be wiped to 0!
        assertEquals(1300.0, docStat.totalOpdRevenue, 0.001)
    }

    @Test
    fun testBuildUnifiedPaymentLogs_updatedBillOnThatDayReflectsIncomingForThatDay() {
        val doctor = Doctor(
            id = "doc-1",
            fullName = "Dr. Test Doctor",
            email = "doc@example.com",
            consultationFee = 500.0
        )
        // Appointment was scheduled for 2026-11-20 with pending payment
        val appt = Appointment(
            id = "appt-100",
            clinicId = "clinic-1",
            doctorId = "doc-1",
            patientName = "Sita Sharma",
            patientMobile = "9841234567",
            appointmentDate = "2026-11-20",
            appointmentTime = "10:00 AM",
            paymentMode = "PAY_AT_DESK",
            paymentStatus = "paid",
            approvedAt = "2026-11-23T11:30:00Z",
            feeAmount = 500.0,
            serviceChargeAmount = 25.0,
            totalAmount = 525.0
        )
        // Invoice updated as paid on 2026-11-23
        val inv = BillingInvoice(
            id = "inv-100",
            appointmentId = "appt-100",
            clinicId = "clinic-1",
            totalAmount = 525.0,
            paidAmount = 525.0,
            paymentStatus = "paid",
            paidAt = "2026-11-23T11:30:00Z",
            createdAt = "2026-11-20T09:00:00Z"
        )

        val logs = PaymentLedgerHelper.buildUnifiedPaymentLogs(
            appointments = listOf(appt),
            invoices = listOf(inv),
            doctors = listOf(doctor),
            transactions = emptyList()
        )

        assertEquals(1, logs.size)
        val log = logs[0]
        // Must reflect 2026-11-23 as the incoming payment date, NOT 2026-11-20
        assertTrue("Log date must reflect the day payment was updated", log.dateTime.startsWith("2026-11-23"))
        assertEquals(525.0, log.amount, 0.001)
    }

    @Test
    fun testBuildUnifiedPaymentLogs_pendingAppointmentExcludedFromPaidIncoming() {
        val doctor = Doctor(
            id = "doc-1",
            fullName = "Dr. Test Doctor",
            email = "doc@example.com",
            consultationFee = 500.0
        )
        // Appointment is scheduled but pending payment
        val apptPending = Appointment(
            id = "appt-pending",
            clinicId = "clinic-1",
            doctorId = "doc-1",
            patientName = "Hari Kumar",
            patientMobile = "9841000000",
            appointmentDate = "2026-11-23",
            appointmentTime = "10:00 AM",
            paymentMode = "PAY_AT_DESK",
            paymentStatus = "pending",
            feeAmount = 500.0,
            serviceChargeAmount = 25.0,
            totalAmount = 525.0
        )

        val logs = PaymentLedgerHelper.buildUnifiedPaymentLogs(
            appointments = listOf(apptPending),
            invoices = emptyList(),
            doctors = listOf(doctor),
            transactions = emptyList()
        )

        // Pending appointment without payment must not be in incoming payment log
        assertTrue("Pending appointment without payment must not produce paid log entry", logs.isEmpty())
    }

    @Test
    fun testCurrencyFormatter_nepaliGroupingDecimalsAndNegatives() {
        assertEquals("Rs. 0", CurrencyFormatter.formatNPR(0.0))
        assertEquals("Rs. 500", CurrencyFormatter.formatNPR(500.0))
        assertEquals("Rs. 1,250", CurrencyFormatter.formatNPR(1250.0))
        assertEquals("Rs. 18,400", CurrencyFormatter.formatNPR(18400.0))
        assertEquals("Rs. 1,25,000", CurrencyFormatter.formatNPR(125000.0))
        assertEquals("Rs. 500.50", CurrencyFormatter.formatNPR(500.5))
        assertEquals("\u2212 Rs. 500", CurrencyFormatter.formatNPR(-500.0))
    }

    @Test
    fun testMultiPartPaymentsAcrossTwoDays_splitPartBadgesAndDailyTotals() {
        val doctor = Doctor(id = "doc-1", fullName = "Dr. Anil Thapa", email = "a@b.com", consultationFee = 500.0)
        val appt = Appointment(
            id = "appt-part",
            clinicId = "clinic-1",
            doctorId = "doc-1",
            trackingCode10Digit = "4821930176",
            patientName = "Ram Sharma",
            patientMobile = "9800000001",
            appointmentDate = "2026-11-24",
            appointmentTime = "10:00 AM",
            paymentStatus = "paid",
            visitType = "new",
            feeAmount = 900.0,
            totalAmount = 900.0
        )
        val tx1 = InvoiceTransaction(
            id = "tx-p1",
            invoiceId = "inv-part",
            appointmentId = "appt-part",
            clinicId = "clinic-1",
            amount = 500.0,
            paymentMethod = "CASH",
            createdAt = "2026-11-24T05:00:00Z"
        )
        val tx2 = InvoiceTransaction(
            id = "tx-p2",
            invoiceId = "inv-part",
            appointmentId = "appt-part",
            clinicId = "clinic-1",
            amount = 400.0,
            paymentMethod = "ESEWA",
            createdAt = "2026-11-25T05:00:00Z"
        )

        val logs = PaymentLedgerHelper.buildUnifiedPaymentLogs(
            appointments = listOf(appt),
            invoices = emptyList(),
            doctors = listOf(doctor),
            transactions = listOf(tx1, tx2)
        )

        assertEquals(2, logs.size)
        val part1 = logs.find { it.id == "tx-p1" }!!
        val part2 = logs.find { it.id == "tx-p2" }!!
        assertEquals(1 to 2, part1.paymentPart)
        assertEquals(2 to 2, part2.paymentPart)
        assertEquals(500.0, part1.amount, 0.001)
        assertEquals(400.0, part2.amount, 0.001)
        assertEquals("new", part1.visitType)
        assertEquals("new", part2.visitType)
    }

    @Test
    fun testFollowUpWithExtraItems_preservesFollowUpVisitType() {
        val doctor = Doctor(id = "doc-1", fullName = "Dr. Anil Thapa", email = "a@b.com", consultationFee = 500.0)
        val appt = Appointment(
            id = "appt-fu",
            clinicId = "clinic-1",
            doctorId = "doc-1",
            patientName = "Sita KC",
            patientMobile = "9800000002",
            appointmentDate = "2026-11-24",
            appointmentTime = "10:15 AM",
            paymentStatus = "paid",
            visitType = "follow_up",
            feeAmount = 400.0,
            totalAmount = 400.0
        )
        val tx = InvoiceTransaction(
            id = "tx-fu",
            appointmentId = "appt-fu",
            clinicId = "clinic-1",
            amount = 400.0,
            paymentMethod = "CASH",
            category = "LAB",
            createdAt = "2026-11-24T10:15:00Z"
        )

        val logs = PaymentLedgerHelper.buildUnifiedPaymentLogs(
            appointments = listOf(appt),
            invoices = emptyList(),
            doctors = listOf(doctor),
            transactions = listOf(tx)
        )

        assertEquals(1, logs.size)
        assertEquals("follow_up", logs[0].visitType)
        assertFalse(logs[0].isNewPatientForDoctor)
    }

    @Test
    fun testDiagnosticLabMode_proportionalTestSplitMatchesCollectedAndHidesDoctor() {
        val services = listOf(
            ClinicService(id = "s1", clinicId = "lab-1", serviceName = "CBC", price = 500.0),
            ClinicService(id = "s2", clinicId = "lab-1", serviceName = "Lipid Profile", price = 1200.0)
        )
        val appt = Appointment(
            id = "lab-appt-1",
            clinicId = "lab-1",
            doctorId = "should-ignore-doc",
            patientName = "Hari Thapa",
            patientMobile = "9811111111",
            appointmentDate = "2026-11-24",
            appointmentTime = "09:30 AM",
            selectedLabTests = "CBC (Rs. 500), Lipid Profile (Rs. 1200)",
            paymentStatus = "paid",
            feeAmount = 1500.0, // discounted from 1700 -> 1500
            totalAmount = 1500.0
        )
        val tx = InvoiceTransaction(
            id = "lab-tx-1",
            appointmentId = "lab-appt-1",
            clinicId = "lab-1",
            amount = 1500.0,
            paymentMethod = "FONEPAY",
            category = "LAB",
            createdAt = "2026-11-24T09:30:00Z"
        )

        val logs = PaymentLedgerHelper.buildUnifiedPaymentLogs(
            appointments = listOf(appt),
            invoices = emptyList(),
            doctors = emptyList(),
            transactions = listOf(tx),
            isLabClinic = true,
            clinicServices = services
        )

        assertEquals(1, logs.size)
        assertEquals("", logs[0].doctorName)
        assertEquals("", logs[0].visitType)
        assertEquals(listOf("CBC", "Lipid Profile"), logs[0].testNames)

        val testStats = PaymentLedgerHelper.computeTestPeriodStats(
            periodLogs = logs,
            appointments = listOf(appt),
            invoices = emptyList(),
            clinicServices = services
        )
        assertEquals(2, testStats.size)
        assertEquals(1500.0, testStats.sumOf { it.collectedIncome }, 0.01)

        val summary = PaymentLedgerHelper.computeSummary(
            periodLogs = logs,
            periodPendingBills = emptyList(),
            periodExpenses = emptyList()
        )
        assertEquals(summary.collected, testStats.sumOf { it.collectedIncome }, 0.01)
    }

    @Test
    fun testPendingBillsAndSummary_separatesCollectedPendingExpensesAndRefunds() {
        val doctor = Doctor(id = "doc-1", fullName = "Dr. Anil Thapa", email = "a@b.com", consultationFee = 500.0)
        val paidAppt = Appointment(
            id = "a-paid",
            clinicId = "c-1",
            doctorId = "doc-1",
            patientName = "Paid Patient",
            patientMobile = "9800000001",
            appointmentDate = "2026-11-24",
            appointmentTime = "09:00 AM",
            paymentMode = "PAY_AT_DESK",
            paymentStatus = "paid",
            feeAmount = 500.0,
            serviceChargeAmount = 25.0,
            totalAmount = 525.0
        )
        val unpaidPadAppt = Appointment(
            id = "a-unpaid",
            clinicId = "c-1",
            doctorId = "doc-1",
            patientName = "Unpaid Desk",
            patientMobile = "9800000002",
            appointmentDate = "2026-11-23",
            appointmentTime = "10:00 AM",
            paymentMode = "PAY_AT_DESK",
            paymentStatus = "pending",
            feeAmount = 500.0,
            serviceChargeAmount = 25.0,
            totalAmount = 525.0
        )
        val txPaid = InvoiceTransaction(
            id = "tx-paid",
            appointmentId = "a-paid",
            clinicId = "c-1",
            amount = 525.0,
            paymentMethod = "PAY_AT_DESK",
            createdAt = "2026-11-24T09:05:00Z"
        )
        val txRefund = InvoiceTransaction(
            id = "tx-ref",
            appointmentId = "a-paid",
            clinicId = "c-1",
            amount = -100.0,
            paymentMethod = "CASH",
            category = "REFUND",
            createdAt = "2026-11-24T09:10:00Z"
        )
        val expense = ClinicExpense(
            id = "e-1",
            clinicId = "c-1",
            title = "Gloves",
            category = "MEDICAL_SUPPLIES",
            amount = 150.0,
            expenseDate = "2026-11-24"
        )

        val logs = PaymentLedgerHelper.buildUnifiedPaymentLogs(
            appointments = listOf(paidAppt, unpaidPadAppt),
            invoices = emptyList(),
            doctors = listOf(doctor),
            transactions = listOf(txPaid, txRefund)
        )
        val pending = PaymentLedgerHelper.buildPendingBills(
            appointments = listOf(paidAppt, unpaidPadAppt),
            invoices = emptyList(),
            doctors = listOf(doctor),
            periodPredicate = { true }
        )

        assertEquals(2, logs.size)
        assertTrue(logs.any { it.isRefund && it.amount == -100.0 })
        assertEquals(1, pending.size)
        assertEquals("a-unpaid", pending[0].appointmentId)
        assertEquals(525.0, pending[0].balanceDue, 0.001)

        val summary = PaymentLedgerHelper.computeSummary(
            periodLogs = logs,
            periodPendingBills = pending,
            periodExpenses = listOf(expense)
        )
        assertEquals(425.0, summary.collected, 0.001) // 525 - 100
        assertEquals(525.0, summary.pendingTotal, 0.001)
        assertEquals(150.0, summary.expenses, 0.001)
        assertEquals(25.0, summary.platformFees, 0.001)
        assertEquals(250.0, summary.net, 0.001) // 425 - 150 - 25
    }

    @Test
    fun testEsewaPlainRemarks_resolvesEsewaInsteadOfCash_andIgnoresIncompletePriorForVisitType() {
        val doctor = Doctor(
            id = "doc-1",
            fullName = "Dr. Test",
            email = "doc@example.com",
            consultationFee = 200.0
        )
        val abandonedPrior = Appointment(
            id = "prior-abandoned",
            clinicId = "clinic-1",
            doctorId = "doc-1",
            patientName = "Aashish",
            patientMobile = "9800000001",
            patientAge = 11,
            appointmentDate = "2026-11-24",
            appointmentTime = "10:00 AM",
            paymentMode = "ONLINE",
            paymentStatus = "pending",
            status = "pending_payment",
            checkinStatus = "no_show",
            feeAmount = 200.0
        )
        val paidEsewaNew = Appointment(
            id = "esewa-new",
            clinicId = "clinic-1",
            doctorId = "doc-1",
            patientName = "Aashish",
            patientMobile = "9800000001",
            patientAge = 69,
            appointmentDate = "2026-11-25",
            appointmentTime = "11:00 AM",
            paymentMode = "ONLINE",
            paymentStatus = "paid",
            status = "APPROVED",
            checkinStatus = "checked_in",
            feeAmount = 200.0,
            attemptNumber = 1
        )
        val inv = BillingInvoice(
            id = "inv-esewa",
            appointmentId = "esewa-new",
            clinicId = "clinic-1",
            totalAmount = 200.0,
            paidAmount = 200.0,
            balanceDue = 0.0,
            paymentStatus = "paid",
            paidAt = "2026-11-25T13:23:07Z",
            remarks = "Paid via eSewa; provider reference: 000HHLW"
        )

        val logs = PaymentLedgerHelper.buildUnifiedPaymentLogs(
            appointments = listOf(abandonedPrior, paidEsewaNew),
            invoices = listOf(inv),
            doctors = listOf(doctor),
            transactions = emptyList()
        )

        assertEquals(1, logs.size)
        assertEquals("ESEWA", logs[0].paymentMethod)
        assertEquals("000HHLW", logs[0].referenceId)
        assertEquals("new", logs[0].visitType)
        assertTrue(logs[0].isNewPatientForDoctor)
    }
}
