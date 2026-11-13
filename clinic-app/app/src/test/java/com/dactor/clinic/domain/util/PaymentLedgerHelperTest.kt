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
}
