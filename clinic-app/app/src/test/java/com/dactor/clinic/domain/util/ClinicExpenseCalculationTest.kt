package com.dactor.clinic.domain.util

import com.dactor.clinic.data.model.ClinicExpense
import com.dactor.clinic.data.model.UnifiedPaymentLogEntry
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class ClinicExpenseCalculationTest {

    @Test
    fun testExpensePeriodFiltering() {
        val expenses = listOf(
            ClinicExpense(
                id = "exp-1",
                clinicId = "c1",
                title = "Syringes & Cotton",
                category = "MEDICAL_SUPPLIES",
                amount = 1500.0,
                paymentMethod = "CASH",
                expenseDate = "2026-11-13"
            ),
            ClinicExpense(
                id = "exp-2",
                clinicId = "c1",
                title = "Clinic Electricity Bill",
                category = "UTILITIES",
                amount = 4500.0,
                paymentMethod = "FONEPAY",
                expenseDate = "2026-11-10"
            ),
            ClinicExpense(
                id = "exp-3",
                clinicId = "c1",
                title = "Clinic Rent October",
                category = "RENT",
                amount = 25000.0,
                paymentMethod = "BANK_TRANSFER",
                expenseDate = "2026-10-28"
            ),
            ClinicExpense(
                id = "exp-4",
                clinicId = "c1",
                title = "Stethoscope calibration",
                category = "EQUIPMENT",
                amount = 3000.0,
                paymentMethod = "CASH",
                expenseDate = "2025-12-15"
            )
        )

        // 1. Daily filter (2026-11-13)
        val daily = expenses.filter { it.expenseDate == "2026-11-13" }
        assertEquals(1, daily.size)
        assertEquals(1500.0, daily.sumOf { it.amount }, 0.01)

        // 2. Monthly filter (2026-11)
        val monthly = expenses.filter { it.expenseDate.startsWith("2026-11") }
        assertEquals(2, monthly.size)
        assertEquals(6000.0, monthly.sumOf { it.amount }, 0.01)

        // 3. Yearly filter (2026)
        val yearly = expenses.filter { it.expenseDate.startsWith("2026") }
        assertEquals(3, yearly.size)
        assertEquals(31000.0, yearly.sumOf { it.amount }, 0.01)

        // 4. Custom range (2026-10-01 to 2026-11-11)
        val custom = expenses.filter { it.expenseDate in "2026-10-01".."2026-11-11" }
        assertEquals(2, custom.size)
        assertEquals(29500.0, custom.sumOf { it.amount }, 0.01)
    }

    @Test
    fun testNetClinicProfitCalculation() {
        val grossCollections = 50000.0
        val platformCommission = 2500.0 // 5% desk fees
        val totalExpenses = 18000.0

        val netClinicPayout = grossCollections - platformCommission
        val netClinicProfit = netClinicPayout - totalExpenses

        assertEquals(47500.0, netClinicPayout, 0.01)
        assertEquals(29500.0, netClinicProfit, 0.01)
    }

    @Test
    fun testCsvExportWithExpenses() {
        val doctor = com.dactor.clinic.data.model.Doctor(
            id = "doc-1",
            fullName = "Dr. Koirala",
            email = "koirala@example.com",
            specialty = "Cardiology",
            consultationFee = 950.0
        )
        val appt = com.dactor.clinic.data.model.Appointment(
            id = "appt-1",
            clinicId = "c1",
            doctorId = "doc-1",
            patientName = "Ram Sharma",
            patientMobile = "9841000001",
            appointmentDate = "2026-11-13",
            appointmentTime = "10:30",
            paymentMode = "PAY_AT_DESK",
            paymentStatus = "paid",
            feeAmount = 950.0,
            serviceChargeAmount = 50.0,
            totalAmount = 1000.0
        )
        val tx = com.dactor.clinic.data.model.InvoiceTransaction(
            id = "tx-1",
            appointmentId = "appt-1",
            clinicId = "c1",
            amount = 1000.0,
            paymentMethod = "CASH",
            category = "CONSULTATION",
            notes = "Cash at desk",
            createdAt = "2026-11-13T10:30:00Z"
        )
        val logs = PaymentLedgerHelper.buildUnifiedPaymentLogs(
            appointments = listOf(appt),
            invoices = emptyList(),
            doctors = listOf(doctor),
            transactions = listOf(tx)
        )

        val expenses = listOf(
            ClinicExpense(
                id = "exp-1",
                title = "Bandages & Antiseptic",
                category = "MEDICAL_SUPPLIES",
                amount = 400.0,
                paymentMethod = "CASH",
                expenseDate = "2026-11-13",
                voucherNumber = "V-101",
                remarks = "Purchased locally"
            )
        )

        val csv = PaymentLedgerHelper.generatePaymentLogsCsv(
            logs = logs,
            periodLabel = "Day: 2026-11-13",
            clinicName = "Dactor Health Clinic",
            expenses = expenses
        )

        assertTrue(csv.contains("Gross Collections (NPR)"))
        assertTrue(csv.contains("\"1000\""))
        assertTrue(csv.contains("Total Clinic Expenses (NPR)"))
        assertTrue(csv.contains("\"400\""))
        assertTrue(csv.contains("Net Clinic Profit / Cash Flow (NPR)"))
        assertTrue(csv.contains("\"550\"")) // (1000 - 50) - 400 = 550
        assertTrue(csv.contains("CLINIC EXPENSES AUDIT LOG"))
        assertTrue(csv.contains("Bandages & Antiseptic"))
        assertTrue(csv.contains("MEDICAL_SUPPLIES"))
        assertTrue(csv.contains("V-101"))
    }
}
