package com.dactor.clinic.domain.util

import com.dactor.clinic.data.model.*
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

object PaymentLedgerHelper {
    private val json = Json {
        ignoreUnknownKeys = true
        isLenient = true
        encodeDefaults = true
    }

    private const val START_TAG = "<!--PAYMENT_LOG_START-->"
    private const val END_TAG = "<!--PAYMENT_LOG_END-->"

    fun parsePaymentRecords(
        rawRemarks: String?,
        fallbackPaidAmount: Double = 0.0,
        fallbackDate: String? = null
    ): List<PaymentRecord> {
        if (!rawRemarks.isNullOrBlank() && rawRemarks.contains(START_TAG) && rawRemarks.contains(END_TAG)) {
            try {
                val jsonStr = rawRemarks.substringAfter(START_TAG).substringBefore(END_TAG).trim()
                if (jsonStr.isNotBlank()) {
                    val list = json.decodeFromString<List<PaymentRecord>>(jsonStr)
                    if (list.isNotEmpty()) return list
                }
            } catch (e: Exception) {
                e.printStackTrace()
            }
        }
        // Fallback: If legacy invoice has paidAmount > 0 and no payment log tag
        if (fallbackPaidAmount > 0.0) {
            val dateStr = fallbackDate?.take(16)?.replace("T", " ") ?: java.text.SimpleDateFormat("yyyy-MM-dd", java.util.Locale.US).format(java.util.Date())
            return listOf(
                PaymentRecord(
                    amount = fallbackPaidAmount,
                    dateTime = dateStr,
                    note = "Payment Received"
                )
            )
        }
        return emptyList()
    }

    fun extractCleanClinicalRemarks(rawRemarks: String?): String {
        if (rawRemarks.isNullOrBlank()) return ""
        var text = rawRemarks
        text = text.replace(Regex("(?i)<!--PAYMENT_LOG_START-->[\\s\\S]*?<!--PAYMENT_LOG_END-->"), "")
        text = text.replace(Regex("<!--[\\s\\S]*?-->"), "")
        text = text.lines().filterNot { line ->
            val l = line.trim()
            l.startsWith("[{\"id\":") || l.startsWith("{\"id\":") || (l.contains("\"amount\":") && l.contains("\"date_time\":"))
        }.joinToString("\n")
        return text.trim()
    }

    fun buildCombinedRemarks(cleanRemarks: String, paymentRecords: List<PaymentRecord>): String {
        val trimmedRemarks = cleanRemarks.trim()
        if (paymentRecords.isEmpty()) return trimmedRemarks
        val recordsJson = json.encodeToString(paymentRecords)
        val logBlock = "$START_TAG\n$recordsJson\n$END_TAG"
        return if (trimmedRemarks.isNotBlank()) {
            "$trimmedRemarks\n\n$logBlock"
        } else {
            logBlock
        }
    }

    fun formatDisplayDateTime(raw: String?): String {
        if (raw.isNullOrBlank()) return "Date Logged"
        val trimmed = raw.trim()
        return try {
            if (trimmed.contains("T")) {
                val instant = java.time.Instant.parse(trimmed)
                val zdt = instant.atZone(java.time.ZoneId.systemDefault())
                zdt.format(java.time.format.DateTimeFormatter.ofPattern("dd MMM yyyy, hh:mm a"))
            } else if (trimmed.contains("-") && trimmed.length >= 10) {
                val parts = trimmed.split(" ")
                val datePart = java.time.LocalDate.parse(parts[0])
                val dateFmt = datePart.format(java.time.format.DateTimeFormatter.ofPattern("dd MMM yyyy"))
                if (parts.size > 1) {
                    val timePart = parts.subList(1, parts.size).joinToString(" ")
                    "$dateFmt, $timePart"
                } else {
                    dateFmt
                }
            } else {
                trimmed
            }
        } catch (_: Exception) {
            trimmed.replace("T", " ").take(19)
        }
    }

    // Nepal family-phone safe unique patient key resolution
    fun derivePatientKey(userId: String?, phone: String?, name: String?, fallbackId: String): String {
        if (!userId.isNullOrBlank()) return userId.trim()
        val cleanPhone = (phone ?: "").filter { it.isDigit() }
        val cleanName = (name ?: "").trim().lowercase()
        if (cleanPhone.length >= 7) {
            return "$cleanPhone|$cleanName"
        }
        return cleanName.ifBlank { fallbackId }
    }

    // Unify transactions and legacy remarks into chronological ledger
    fun buildUnifiedPaymentLogs(
        appointments: List<Appointment>,
        invoices: List<BillingInvoice>,
        doctors: List<Doctor>,
        transactions: List<InvoiceTransaction>
    ): List<UnifiedPaymentLogEntry> {
        val doctorMap = doctors.associateBy { it.id }
        val invoiceMap = invoices.associateBy { it.appointmentId }
        val apptMap = appointments.associateBy { it.id }

        // Sort appointments chronologically to determine first-seen per doctor
        val validAppts = appointments
            .filter { !it.status.equals("cancelled", ignoreCase = true) && !it.status.equals("rejected", ignoreCase = true) }
            .sortedWith(compareBy({ it.appointmentDate }, { it.appointmentTime }, { it.id }))

        val seenByDoctor = mutableMapOf<String, MutableSet<String>>()
        val firstVisitSet = mutableSetOf<String>()

        for (appt in validAppts) {
            val docId = appt.doctorId ?: continue
            val pKey = derivePatientKey(appt.userId, appt.patientMobile, appt.patientName, appt.id)
            val seenSet = seenByDoctor.getOrPut(docId) { mutableSetOf() }
            if (!seenSet.contains(pKey)) {
                seenSet.add(pKey)
                firstVisitSet.add(appt.id)
            }
        }

        val entries = mutableListOf<UnifiedPaymentLogEntry>()
        val processedInvoiceIds = mutableSetOf<String>()

        // 1. Transactions from dedicated invoice_transactions table
        for (tx in transactions) {
            val appt = tx.appointmentId?.let { apptMap[it] }
            val inv = tx.invoiceId?.let { iId -> invoices.find { it.id == iId } } ?: tx.appointmentId?.let { invoiceMap[it] }
            val doc = appt?.doctorId?.let { doctorMap[it] }
            val isNew = appt?.let { firstVisitSet.contains(it.id) } ?: false
            val isFollowUp = !isNew || (appt?.feeAmount ?: 1.0) == 0.0
            val isConsultation = tx.category == null || tx.category.equals("CONSULTATION", ignoreCase = true)
            val isPad = appt?.isPayAtDesk == true
            val expectedPadTotal = if (isPad && !isFollowUp) (appt?.effectiveTotalAmount ?: 0.0) else 0.0
            val baseTxAmount = if (isFollowUp && isConsultation) 0.0 else tx.amount
            val effectiveAmount = if (isPad && !isFollowUp && isConsultation && expectedPadTotal > 0.0 && baseTxAmount > 0.0 && baseTxAmount < expectedPadTotal) {
                expectedPadTotal
            } else {
                baseTxAmount
            }
            val effTotalBill = if (isFollowUp && isConsultation) {
                0.0
            } else if (isPad && expectedPadTotal > 0.0) {
                maxOf(inv?.totalAmount ?: 0.0, effectiveAmount, expectedPadTotal)
            } else {
                inv?.totalAmount ?: tx.amount
            }

            entries.add(
                UnifiedPaymentLogEntry(
                    id = tx.id,
                    appointmentId = tx.appointmentId ?: inv?.appointmentId,
                    invoiceId = tx.invoiceId ?: inv?.id,
                    trackingCode10Digit = appt?.trackingCode10Digit ?: "\u2013",
                    patientName = appt?.patientName ?: "Walk-in Patient",
                    patientPhone = appt?.patientMobile ?: "\u2013",
                    doctorName = doc?.fullName ?: "Doctor",
                    doctorSpecialty = doc?.specialty ?: "General Practice",
                    consultationFee = if (isFollowUp) 0.0 else (doc?.consultationFee ?: appt?.feeAmount ?: 500.0),
                    amount = effectiveAmount,
                    dateTime = tx.createdAt ?: "\u2013",
                    paymentMethod = if (effectiveAmount == 0.0) "FREE" else tx.paymentMethod,
                    referenceId = if (effectiveAmount == 0.0) (tx.referenceId ?: "FOLLOWUP-WAIVED") else tx.referenceId,
                    note = tx.notes ?: (if (isFollowUp) "Follow-up Consultation (Free)" else "OPD Consultation"),
                    invoiceStatus = inv?.paymentStatus ?: "paid",
                    totalBill = effTotalBill,
                    balanceDue = if (isFollowUp && isConsultation) 0.0 else (if (effTotalBill > effectiveAmount) (inv?.balanceDue ?: 0.0) else 0.0),
                    receiptUrl = null,
                    isNewPatientForDoctor = !isFollowUp,
                    category = if (isFollowUp && isConsultation) "FREE_FOLLOWUP" else (tx.category ?: "CONSULTATION")
                )
            )
            if (inv != null) {
                processedInvoiceIds.add(inv.id)
            }
        }

        // 2. Fallback to legacy payment records in invoice remarks
        for (inv in invoices) {
            if (processedInvoiceIds.contains(inv.id)) continue

            val appt = apptMap[inv.appointmentId]
            val doc = appt?.doctorId?.let { doctorMap[it] }
            val isNew = appt?.let { firstVisitSet.contains(it.id) } ?: false
            val isFollowUp = !isNew || (appt?.feeAmount ?: 1.0) == 0.0
            val isPad = appt?.isPayAtDesk == true
            val expectedPadTotal = if (isPad && !isFollowUp) (appt?.effectiveTotalAmount ?: 0.0) else 0.0
            val effInvTotal = if (isPad && !isFollowUp && expectedPadTotal > 0.0) maxOf(inv.totalAmount, expectedPadTotal) else inv.totalAmount
            val effInvPaid = if (!isFollowUp && inv.paymentStatus.equals("paid", ignoreCase = true) && isPad && expectedPadTotal > 0.0) {
                maxOf(inv.effectivePaidAmount, effInvTotal)
            } else {
                inv.effectivePaidAmount
            }

            val fallbackAmt = if (isFollowUp) {
                val nonConsultTotal = inv.items.filterNot {
                    val n = it.itemName.lowercase()
                    n.contains("consultation") || n.contains("opd doctor") || n.contains("clinical service") || n.contains("follow-up")
                }.sumOf { it.total }
                nonConsultTotal
            } else {
                effInvPaid
            }

            val records = parsePaymentRecords(inv.remarks, fallbackAmt, inv.createdAt)

            for (r in records) {
                val method = r.paymentMethod ?: when {
                    r.note?.contains("eSewa", ignoreCase = true) == true -> "ESEWA"
                    r.note?.contains("Khalti", ignoreCase = true) == true -> "KHALTI"
                    r.note?.contains("Fonepay", ignoreCase = true) == true -> "FONEPAY"
                    r.note?.contains("ConnectIPS", ignoreCase = true) == true -> "CONNECTIPS"
                    r.note?.contains("QR", ignoreCase = true) == true || r.note?.contains("Bank", ignoreCase = true) == true -> "BANK_TRANSFER"
                    isPad -> "PAY_AT_DESK"
                    else -> if (isFollowUp && fallbackAmt == 0.0) "FREE" else "CASH"
                }

                val isConsultation = r.category == null || r.category.equals("CONSULTATION", ignoreCase = true) ||
                    r.note?.contains("consultation", ignoreCase = true) == true
                val effectiveAmount = when {
                    isFollowUp && isConsultation -> 0.0
                    isPad && !isFollowUp && isConsultation && records.size == 1 && expectedPadTotal > 0.0 && r.amount > 0.0 && r.amount < expectedPadTotal -> expectedPadTotal
                    else -> r.amount
                }

                entries.add(
                    UnifiedPaymentLogEntry(
                        id = r.id,
                        appointmentId = inv.appointmentId,
                        invoiceId = inv.id,
                        trackingCode10Digit = appt?.trackingCode10Digit ?: "\u2013",
                        patientName = appt?.patientName ?: "Patient",
                        patientPhone = appt?.patientMobile ?: "\u2013",
                        doctorName = doc?.fullName ?: "Doctor",
                        doctorSpecialty = doc?.specialty ?: "General Practice",
                        consultationFee = if (isFollowUp) 0.0 else (doc?.consultationFee ?: appt?.feeAmount ?: 500.0),
                        amount = effectiveAmount,
                        dateTime = r.dateTime,
                        paymentMethod = if (effectiveAmount == 0.0) "FREE" else method,
                        referenceId = if (effectiveAmount == 0.0) (r.referenceId ?: "FOLLOWUP-WAIVED") else r.referenceId,
                        note = r.note ?: (if (isFollowUp) "Follow-up Consultation (Free)" else "OPD Consultation"),
                        invoiceStatus = inv.paymentStatus,
                        totalBill = if (isFollowUp && isConsultation) 0.0 else effInvTotal,
                        balanceDue = if (isFollowUp && isConsultation) 0.0 else (effInvTotal - effInvPaid).coerceAtLeast(0.0),
                        receiptUrl = null,
                        isNewPatientForDoctor = !isFollowUp,
                        category = if (isFollowUp && isConsultation) "FREE_FOLLOWUP" else (r.category ?: "CONSULTATION")
                    )
                )
            }
        }

        // 3. Fallback for appointments not covered by invoices or transactions
        val processedAppointmentIds = entries.mapNotNull { it.appointmentId }.toSet()
        for (appt in validAppts) {
            if (processedAppointmentIds.contains(appt.id)) continue
            val doc = appt.doctorId?.let { doctorMap[it] }
            val isNew = firstVisitSet.contains(appt.id)
            val isFollowUp = !isNew || appt.feeAmount == 0.0
            val effectiveAmount = if (isFollowUp) 0.0 else appt.effectiveTotalAmount
            val apptDateTime = "${appt.appointmentDate} ${appt.appointmentTime.ifBlank { "10:00 AM" }}"

            entries.add(
                UnifiedPaymentLogEntry(
                    id = "appt-${appt.id}",
                    appointmentId = appt.id,
                    trackingCode10Digit = appt.trackingCode10Digit.ifBlank { "\u2013" },
                    patientName = appt.patientName.ifBlank { "Patient" },
                    patientPhone = appt.patientMobile.ifBlank { "\u2013" },
                    doctorName = doc?.fullName ?: "Doctor",
                    doctorSpecialty = doc?.specialty ?: "General Practice",
                    consultationFee = if (isFollowUp) 0.0 else (doc?.consultationFee ?: appt.feeAmount),
                    amount = effectiveAmount,
                    dateTime = apptDateTime,
                    paymentMethod = if (effectiveAmount == 0.0) "FREE" else (if (appt.paymentMode.isNotBlank()) appt.paymentMode else "CASH"),
                    referenceId = if (effectiveAmount == 0.0) "FOLLOWUP-WAIVED" else null,
                    note = if (isFollowUp) "Follow-up Consultation (Free)" else "OPD Consultation",
                    invoiceStatus = "paid",
                    totalBill = effectiveAmount,
                    balanceDue = 0.0,
                    receiptUrl = null,
                    isNewPatientForDoctor = !isFollowUp,
                    category = if (isFollowUp) "FREE_FOLLOWUP" else "CONSULTATION"
                )
            )
        }

        return entries.sortedByDescending { it.dateTime }
    }

    // Compute Doctor Daily and Monthly Performance and New Patient Metrics
    fun computeDoctorDailyAndMonthlyStats(
        appointments: List<Appointment>,
        doctors: List<Doctor>,
        invoices: List<BillingInvoice> = emptyList(),
        transactions: List<InvoiceTransaction> = emptyList()
    ): List<DoctorVisitAnalytics> {
        val doctorMap = doctors.associateBy { it.id }
        val invoiceMap = invoices.associateBy { it.appointmentId }
        val txMap = transactions.filter { !it.appointmentId.isNullOrBlank() }.groupBy { it.appointmentId!! }

        val validAppts = appointments
            .filter { !it.status.equals("cancelled", ignoreCase = true) && !it.status.equals("rejected", ignoreCase = true) }
            .sortedWith(compareBy({ it.appointmentDate }, { it.appointmentTime }, { it.id }))

        val seenByDoctor = mutableMapOf<String, MutableSet<String>>()
        val docStats = mutableMapOf<String, MutableMap<String, Any>>()

        for (appt in validAppts) {
            val docId = appt.doctorId ?: continue
            val doc = doctorMap[docId] ?: Doctor(id = docId, fullName = "Doctor", email = "")
            val standardFee = doc.consultationFee ?: (if (appt.feeAmount > 0.0) appt.feeAmount else 500.0)

            val pKey = derivePatientKey(appt.userId, appt.patientMobile, appt.patientName, appt.id)
            val seenSet = seenByDoctor.getOrPut(docId) { mutableSetOf() }
            val isNew = !seenSet.contains(pKey)
            seenSet.add(pKey)

            val apptDate = appt.appointmentDate.ifBlank { "2026-01-01" }
            val apptMonth = if (apptDate.length >= 7) apptDate.substring(0, 7) else "2026-01"

            val inv = invoiceMap[appt.id]
            val apptTxs = txMap[appt.id] ?: emptyList()
            val txPaid = apptTxs.sumOf { it.amount }

            // Follow-up patients do NOT add money until bill items or payments are explicitly added
            val revenueAdded: Double = if (isNew) {
                if (inv != null && inv.totalAmount > 0.0) {
                    maxOf(inv.totalAmount, standardFee)
                } else if (txPaid > 0.0) {
                    maxOf(txPaid, standardFee)
                } else {
                    standardFee
                }
            } else {
                // Follow-up patient: Doctor consultation is strictly FREE (0.0).
                // ONLY count additional non-consultation procedures, tests, or services.
                if (inv != null) {
                    val nonConsultationTotal = inv.items
                        .filterNot {
                            val name = it.itemName.lowercase()
                            name.contains("consultation") || name.contains("opd doctor") || name.contains("clinical service") || name.contains("follow-up")
                        }
                        .sumOf { it.total }

                    if (nonConsultationTotal > 0.0) {
                        nonConsultationTotal
                    } else {
                        val nonConsultationTx = apptTxs.filter {
                            it.category != null && !it.category.equals("CONSULTATION", ignoreCase = true)
                        }.sumOf { it.amount }
                        nonConsultationTx
                    }
                } else {
                    val nonConsultationTx = apptTxs.filter {
                        it.category != null && !it.category.equals("CONSULTATION", ignoreCase = true)
                    }.sumOf { it.amount }
                    nonConsultationTx
                }
            }

            if (!docStats.containsKey(docId)) {
                docStats[docId] = mutableMapOf(
                    "doctorId" to docId,
                    "doctorName" to doc.fullName,
                    "specialty" to (doc.specialty ?: "General Practice"),
                    "fee" to standardFee,
                    "total" to 0,
                    "new" to 0,
                    "followup" to 0,
                    "revenue" to 0.0,
                    "daily" to mutableMapOf<String, VisitMetric>(),
                    "monthly" to mutableMapOf<String, VisitMetric>()
                )
            }

            val dMap = docStats[docId]!!
            dMap["total"] = (dMap["total"] as Int) + 1
            dMap["revenue"] = (dMap["revenue"] as Double) + revenueAdded
            if (isNew) {
                dMap["new"] = (dMap["new"] as Int) + 1
            } else {
                dMap["followup"] = (dMap["followup"] as Int) + 1
            }

            @Suppress("UNCHECKED_CAST")
            val dailyMap = dMap["daily"] as MutableMap<String, VisitMetric>
            val currentDay = dailyMap[apptDate] ?: VisitMetric()
            dailyMap[apptDate] = currentDay.copy(
                newPatients = currentDay.newPatients + (if (isNew) 1 else 0),
                followupPatients = currentDay.followupPatients + (if (!isNew) 1 else 0),
                totalRevenue = currentDay.totalRevenue + revenueAdded
            )

            @Suppress("UNCHECKED_CAST")
            val monthlyMap = dMap["monthly"] as MutableMap<String, VisitMetric>
            val currentMonth = monthlyMap[apptMonth] ?: VisitMetric()
            monthlyMap[apptMonth] = currentMonth.copy(
                newPatients = currentMonth.newPatients + (if (isNew) 1 else 0),
                followupPatients = currentMonth.followupPatients + (if (!isNew) 1 else 0),
                totalRevenue = currentMonth.totalRevenue + revenueAdded
            )
        }

        return docStats.values.map { m ->
            @Suppress("UNCHECKED_CAST")
            DoctorVisitAnalytics(
                doctorId = m["doctorId"] as String,
                doctorName = m["doctorName"] as String,
                specialty = m["specialty"] as String,
                consultationFee = m["fee"] as Double,
                totalVisits = m["total"] as Int,
                newPatients = m["new"] as Int,
                followupPatients = m["followup"] as Int,
                totalOpdRevenue = m["revenue"] as Double,
                dailyBreakdown = m["daily"] as Map<String, VisitMetric>,
                monthlyBreakdown = m["monthly"] as Map<String, VisitMetric>
            )
        }.sortedByDescending { it.totalVisits }
    }

    // RFC 4180 CSV Export with UTF-8 BOM & Executive Audit Metadata
    fun generatePaymentLogsCsv(
        logs: List<UnifiedPaymentLogEntry>,
        periodLabel: String = "All Time",
        clinicName: String = "Dactor Partner Clinic"
    ): String {
        val grossCollected = logs.sumOf { it.amount }
        val followupCount = logs.count { !it.isNewPatientForDoctor }
        val newPatientCount = logs.count { it.isNewPatientForDoctor }
        val platformCut = kotlin.math.round(grossCollected * 0.05)
        val netPayout = grossCollected - platformCut

        val sb = StringBuilder()
        sb.append("\uFEFF") // UTF-8 BOM for Excel

        // Summary Metadata Block
        sb.append("\"Clinic Name\",\"${clinicName.replace("\"", "\"\"")}\"\r\n")
        sb.append("\"Audit Scope Period\",\"${periodLabel.replace("\"", "\"\"")}\"\r\n")
        sb.append("\"Gross Collections (NPR)\",\"${grossCollected.toInt()}\"\r\n")
        sb.append("\"Free Follow-up Consultations (0 NPR)\",\"$followupCount Patients (Fee Waived)\"\r\n")
        sb.append("\"New Patients Seen\",\"$newPatientCount Patients\"\r\n")
        sb.append("\"Total Audit Records\",\"${logs.size}\"\r\n")
        sb.append("\"Dactor 5% Platform Desk Cut (NPR)\",\"${platformCut.toInt()}\"\r\n")
        sb.append("\"Net Clinic OPD Payout (NPR)\",\"${netPayout.toInt()}\"\r\n")
        sb.append("\r\n")

        val headers = listOf(
            "Date Time",
            "Token",
            "Patient Name",
            "Mobile",
            "Doctor Name",
            "Specialty",
            "Visit Type",
            "Category",
            "Payment Method",
            "Amount Collected (NPR)",
            "Ref ID",
            "Notes"
        )
        sb.append(headers.joinToString(",")).append("\r\n")

        for (log in logs) {
            val visitType = if (log.isNewPatientForDoctor) "NEW_PATIENT" else "FREE_FOLLOW_UP"
            val row = listOf(
                log.dateTime,
                log.trackingCode10Digit ?: "",
                "\"${(log.patientName).replace("\"", "\"\"")}\"",
                log.patientPhone,
                "\"${(log.doctorName).replace("\"", "\"\"")}\"",
                "\"${(log.doctorSpecialty).replace("\"", "\"\"")}\"",
                visitType,
                log.category,
                log.paymentMethod,
                log.amount.toInt().toString(),
                "\"${(log.referenceId ?: "").replace("\"", "\"\"")}\"",
                "\"${(log.note ?: "").replace("\"", "\"\"")}\""
            )
            sb.append(row.joinToString(",")).append("\r\n")
        }
        return sb.toString()
    }
}
