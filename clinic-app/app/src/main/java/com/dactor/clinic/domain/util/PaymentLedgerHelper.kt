package com.dactor.clinic.domain.util

import com.dactor.clinic.data.model.*
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale
import kotlin.math.abs
import kotlin.math.roundToLong

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
                    val normalizedJson = jsonStr.replace("\"dateTime\":", "\"date_time\":")
                    val list = json.decodeFromString<List<PaymentRecord>>(normalizedJson)
                    if (list.isNotEmpty()) return list
                }
            } catch (e: Exception) {
                e.printStackTrace()
            }
        }
        // Support [PAYMENT_LOGS]...[/PAYMENT_LOGS] from web portal
        if (!rawRemarks.isNullOrBlank() && rawRemarks.contains("[PAYMENT_LOGS]") && rawRemarks.contains("[/PAYMENT_LOGS]")) {
            try {
                val jsonStr = rawRemarks.substringAfter("[PAYMENT_LOGS]").substringBefore("[/PAYMENT_LOGS]").trim()
                if (jsonStr.isNotBlank()) {
                    val normalizedJson = jsonStr.replace("\"dateTime\":", "\"date_time\":")
                    val list = json.decodeFromString<List<PaymentRecord>>(normalizedJson)
                    if (list.isNotEmpty()) return list
                }
            } catch (e: Exception) {
                e.printStackTrace()
            }
        }
        // Fallback: If legacy invoice has paidAmount > 0 and no payment log tag
        if (fallbackPaidAmount > 0.0) {
            val dateStr = fallbackDate?.take(16)?.replace("T", " ")
                ?: java.text.SimpleDateFormat("yyyy-MM-dd", Locale.US).format(java.util.Date())
            val inferredMethod = inferPaymentMethodFromText(rawRemarks, null, null)
            val refId = Regex("(?:provider\\s*reference|reference|ref|txn)\\s*[:#]\\s*([A-Za-z0-9_-]+)", RegexOption.IGNORE_CASE)
                .find(rawRemarks ?: "")?.groupValues?.getOrNull(1)?.trim()
            val cleanNote = if (!rawRemarks.isNullOrBlank() &&
                Regex("paid\\s+via|esewa|khalti|fonepay|connectips|desk", RegexOption.IGNORE_CASE).containsMatchIn(rawRemarks)
            ) {
                rawRemarks.trim()
            } else {
                "Payment Received"
            }
            return listOf(
                PaymentRecord(
                    amount = fallbackPaidAmount,
                    dateTime = dateStr,
                    note = cleanNote,
                    paymentMethod = inferredMethod.takeIf { it.isNotBlank() },
                    referenceId = refId
                )
            )
        }
        return emptyList()
    }

    fun inferPaymentMethodFromText(
        text: String?,
        paymentMode: String? = null,
        fallbackMethod: String? = null
    ): String {
        val lower = (text ?: "").lowercase(Locale.US)
        when {
            lower.contains("esewa") -> return "ESEWA"
            lower.contains("khalti") -> return "KHALTI"
            lower.contains("fonepay") -> return "FONEPAY"
            lower.contains("connectips") -> return "CONNECTIPS"
            lower.contains("pay at desk") || lower.contains("pay_at_desk") || lower.contains("desk") -> return "PAY_AT_DESK"
            lower.contains("qr") || lower.contains("bank") -> return "BANK_TRANSFER"
            lower.contains("free follow") || lower.contains("waived") -> return "FREE"
            lower.contains("cash") -> return "CASH"
        }
        val modeUpper = (paymentMode ?: "").trim().uppercase(Locale.US)
        return when (modeUpper) {
            "PAY_AT_DESK", "DESK" -> "PAY_AT_DESK"
            "FREE" -> "FREE"
            "ONLINE" -> "ONLINE"
            "CASH" -> "CASH"
            else -> (fallbackMethod ?: "").trim().uppercase(Locale.US)
        }
    }

    fun extractCleanClinicalRemarks(rawRemarks: String?): String {
        if (rawRemarks.isNullOrBlank()) return ""
        var text = rawRemarks
        text = text.replace(Regex("(?i)<!--PAYMENT_LOG_START-->[\\s\\S]*?<!--PAYMENT_LOG_END-->"), "")
        text = text.replace(Regex("(?i)\\[PAYMENT_LOGS\\][\\s\\S]*?\\[/PAYMENT_LOGS\\]"), "")
        text = text.replace(Regex("<!--[\\s\\S]*?-->"), "")
        text = text.replace(Regex("(?i)\\[\\[META:[\\s\\S]*?\\]\\]"), "")
        text = text.replace(Regex("\\[\\[[\\s\\S]*?\\]\\]"), "")
        text = text.replace(Regex("(?i)\\[[A-Z0-9_]+:[^\\]]*\\]"), "")
        text = text.replace(Regex("\\[\\s*\\{[\\s\\S]*?\\}\\s*\\]"), "")
        text = text.replace(Regex("\\{\\s*\"[a-zA-Z0-9_]+\"\\s*:[\\s\\S]*?\\}"), "")
        text = text.lines().filterNot { line ->
            val l = line.trim()
            l.startsWith("[{\"") || l.startsWith("{\"") ||
                (l.contains("\"amount\":") && (l.contains("\"date_time\":") || l.contains("\"dateTime\":"))) ||
                l.startsWith("<!--") || l.endsWith("-->") ||
                l.startsWith("[PAYMENT_LOGS]") || l.endsWith("[/PAYMENT_LOGS]")
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

    /** Formats e.g. `Mon, 24 Nov 2026` or `Today` / `Yesterday`. */
    fun formatListDayHeader(dateStr: String, todayStr: String, yesterdayStr: String): String {
        val clean = dateStr.trim().take(10)
        return when (clean) {
            todayStr -> "TODAY"
            yesterdayStr -> "YESTERDAY"
            else -> try {
                LocalDate.parse(clean)
                    .format(DateTimeFormatter.ofPattern("EEE, dd MMM yyyy", Locale.US))
                    .uppercase(Locale.US)
            } catch (_: Exception) {
                clean.ifBlank { "OTHER" }
            }
        }
    }

    /** Formats stepper label: `Today, Mon 24 Nov 2026` / `Yesterday, ...` / `Mon, 24 Nov 2026`. */
    fun formatStepperDayLabel(dateStr: String, todayStr: String, yesterdayStr: String): String {
        val clean = dateStr.trim().take(10)
        return try {
            val d = LocalDate.parse(clean)
            val base = d.format(DateTimeFormatter.ofPattern("EEE dd MMM yyyy", Locale.US))
            when (clean) {
                todayStr -> "Today, $base"
                yesterdayStr -> "Yesterday, $base"
                else -> d.format(DateTimeFormatter.ofPattern("EEE, dd MMM yyyy", Locale.US))
            }
        } catch (_: Exception) {
            clean
        }
    }

    /** Extracts clean 12-hour time like `10:42 AM` for list rows. */
    fun formatRowTime(raw: String?): String {
        if (raw.isNullOrBlank()) return ""
        val trimmed = raw.trim()
        // ISO timestamp e.g. 2026-11-24T10:42:00Z
        if (trimmed.contains("T")) {
            try {
                val instant = Instant.parse(trimmed)
                return instant.atZone(ZoneId.systemDefault())
                    .format(DateTimeFormatter.ofPattern("hh:mm a", Locale.US))
            } catch (_: Exception) {}
            try {
                val odt = java.time.OffsetDateTime.parse(trimmed)
                return odt.atZoneSameInstant(ZoneId.systemDefault())
                    .format(DateTimeFormatter.ofPattern("hh:mm a", Locale.US))
            } catch (_: Exception) {}
        }
        // Space-separated time e.g. "2026-11-24 10:42 AM" or "2026-11-24 14:30:00"
        val timeMatch = Regex("(\\d{1,2}:\\d{2})(?::\\d{2})?\\s*([APap][Mm])?").find(
            if (trimmed.length > 10 && trimmed[4] == '-') trimmed.substring(10) else trimmed
        )
        if (timeMatch != null) {
            val hm = timeMatch.groupValues[1]
            val ampm = timeMatch.groupValues[2].uppercase(Locale.US)
            if (ampm.isNotBlank()) {
                val parts = hm.split(":")
                val h = parts[0].toIntOrNull() ?: 0
                val m = parts[1].toIntOrNull() ?: 0
                return String.format(Locale.US, "%02d:%02d %s", if (h == 0) 12 else h, m, ampm)
            }
            val parts = hm.split(":")
            val h24 = parts[0].toIntOrNull()
            val min = parts[1].toIntOrNull()
            if (h24 != null && min != null && h24 in 0..23 && min in 0..59) {
                val suffix = if (h24 >= 12) "PM" else "AM"
                val h12 = when {
                    h24 == 0 -> 12
                    h24 > 12 -> h24 - 12
                    else -> h24
                }
                return String.format(Locale.US, "%02d:%02d %s", h12, min, suffix)
            }
        }
        return ""
    }

    /** Formats local calendar YYYY-MM-DD from an ISO or date string. */
    fun extractLocalDate(raw: String?): String {
        if (raw.isNullOrBlank()) return ""
        val trimmed = raw.trim()
        if (trimmed.contains("T")) {
            try {
                return Instant.parse(trimmed)
                    .atZone(ZoneId.systemDefault())
                    .toLocalDate()
                    .toString()
            } catch (_: Exception) {}
            try {
                return java.time.OffsetDateTime.parse(trimmed)
                    .atZoneSameInstant(ZoneId.systemDefault())
                    .toLocalDate()
                    .toString()
            } catch (_: Exception) {}
        }
        return if (trimmed.length >= 10 && trimmed[4] == '-' && trimmed[7] == '-') {
            trimmed.substring(0, 10)
        } else {
            ""
        }
    }

    fun formatDisplayDateTime(raw: String?): String {
        if (raw.isNullOrBlank()) return "Date Logged"
        val dateStr = extractLocalDate(raw)
        val timeStr = formatRowTime(raw)
        return if (dateStr.isNotBlank()) {
            val formattedDate = try {
                LocalDate.parse(dateStr).format(DateTimeFormatter.ofPattern("EEE dd MMM yyyy", Locale.US))
            } catch (_: Exception) {
                dateStr
            }
            if (timeStr.isNotBlank()) "$formattedDate, $timeStr" else formattedDate
        } else {
            raw.trim()
        }
    }

    fun formatShortDateTime(raw: String?): String {
        if (raw.isNullOrBlank()) return ""
        val dateStr = extractLocalDate(raw)
        val timeStr = formatRowTime(raw)
        return if (dateStr.isNotBlank()) {
            val shortDate = try {
                LocalDate.parse(dateStr).format(DateTimeFormatter.ofPattern("dd MMM", Locale.US))
            } catch (_: Exception) {
                dateStr
            }
            if (timeStr.isNotBlank()) "$shortDate $timeStr" else shortDate
        } else {
            raw.trim()
        }
    }

    fun formatDoctorDisplayName(rawName: String?): String {
        val clean = (rawName ?: "").trim()
        if (clean.isBlank() || clean.equals("Doctor", ignoreCase = true) || clean.equals("Clinic Doctor", ignoreCase = true)) {
            return ""
        }
        val stripped = clean.replace(Regex("^(?i)dr\\.?\\s*"), "").trim()
        return if (stripped.isNotBlank()) "Dr. $stripped" else ""
    }

    fun isDateInPeriod(
        dateStr: String?,
        scope: PaymentPeriodScope,
        selectedDate: String,
        selectedMonth: String,
        selectedYear: String,
        customStartDate: String,
        customEndDate: String
    ): Boolean {
        val d = extractLocalDate(dateStr).ifBlank { (dateStr ?: "").trim().take(10) }
        if (d.isBlank()) return false
        return when (scope) {
            PaymentPeriodScope.DAY -> d == selectedDate
            PaymentPeriodScope.MONTH -> d.startsWith(selectedMonth)
            PaymentPeriodScope.YEAR -> d.startsWith(selectedYear)
            PaymentPeriodScope.CUSTOM -> {
                val start = minOf(customStartDate, customEndDate)
                val end = maxOf(customStartDate, customEndDate)
                d in start..end
            }
        }
    }

    // Nepal family-phone safe unique patient key resolution
    fun derivePatientKey(userId: String?, phone: String?, name: String?, fallbackId: String): String {
        val cleanPhone = (phone ?: "").filter { it.isDigit() }.takeLast(10)
        val cleanName = (name ?: "").trim().lowercase()
        val cleanUserId = (userId ?: "").trim()
        if (cleanPhone.length >= 7) {
            return "$cleanPhone|$cleanName"
        }
        if (cleanUserId.isNotBlank() && cleanName.isNotBlank()) {
            return "$cleanUserId|$cleanName"
        }
        if (cleanUserId.isNotBlank()) {
            return cleanUserId
        }
        return cleanName.ifBlank { fallbackId }
    }

    /**
     * Parses diagnostic lab tests into normalized `(testName, catalogOrEmbeddedPrice)` pairs.
     */
    fun parseLabTestItems(
        appt: Appointment?,
        invoice: BillingInvoice? = null,
        clinicServices: List<ClinicService> = emptyList()
    ): List<Pair<String, Double>> {
        val catalogByLower = clinicServices.associateBy { it.serviceName.trim().lowercase() }
        val results = mutableListOf<Pair<String, Double>>()

        fun addParsedToken(rawToken: String, explicitPrice: Double? = null) {
            val trimmed = rawToken.trim()
            if (trimmed.isBlank()) return
            val priceMatch = Regex("\\(Rs\\.?\\s*([0-9.,]+)\\)\\s*$", RegexOption.IGNORE_CASE).find(trimmed)
            val embeddedPrice = priceMatch?.groupValues?.get(1)?.replace(",", "")?.toDoubleOrNull()
            val rawName = trimmed.replace(Regex("\\s*\\(Rs\\.?[^)]*\\)\\s*$", RegexOption.IGNORE_CASE), "").trim()
            if (rawName.isBlank()) return
            val catalogEntry = catalogByLower[rawName.lowercase()]
            val canonicalName = catalogEntry?.serviceName?.trim() ?: rawName
            val weight = explicitPrice?.takeIf { it > 0.0 }
                ?: embeddedPrice?.takeIf { it > 0.0 }
                ?: catalogEntry?.price?.takeIf { it > 0.0 }
                ?: 0.0
            results.add(canonicalName to weight)
        }

        val rawSelected = appt?.selectedLabTests?.trim()
        if (!rawSelected.isNullOrBlank()) {
            rawSelected.split(",").forEach { addParsedToken(it) }
        }

        if (results.isEmpty() && invoice != null && invoice.items.isNotEmpty()) {
            invoice.items.filterNot { item ->
                val lower = item.itemName.lowercase()
                lower.startsWith("payment received") ||
                    lower.contains("pay at desk") ||
                    lower.contains("service charge") ||
                    lower.contains("consultation") ||
                    lower.contains("opd doctor")
            }.forEach { item ->
                val price = if (item.total > 0.0) item.total else item.price * item.quantity
                addParsedToken(item.itemName, explicitPrice = price)
            }
        }

        if (results.isEmpty() && appt?.notes?.contains("Lab Tests:", ignoreCase = true) == true) {
            val part = appt.notes.replace(Regex("^.*Lab Tests:\\s*", RegexOption.IGNORE_CASE), "").trim()
            part.split(",").forEach { addParsedToken(it) }
        }

        return results
    }

    private fun resolveVisitType(
        appt: Appointment?,
        firstVisitSet: Set<String>,
        isLabClinic: Boolean
    ): String {
        if (isLabClinic || appt == null) return ""
        val explicit = appt.visitType?.trim()?.lowercase()
        if (!explicit.isNullOrBlank()) {
            return when {
                explicit.contains("follow") -> "follow_up"
                explicit == "new" -> "new"
                else -> "unknown"
            }
        }
        if (!appt.followUpOfAppointmentId.isNullOrBlank() || appt.attemptNumber > 1) {
            return "follow_up"
        }
        val notesLower = (appt.notes ?: "").lowercase()
        if (notesLower.contains("follow-up") || notesLower.contains("followup")) {
            return "follow_up"
        }
        if (appt.feeAmount > 0.0 && appt.attemptNumber <= 1) {
            return "new"
        }
        val docId = appt.doctorId
        if (!docId.isNullOrBlank()) {
            return if (firstVisitSet.contains(appt.id)) {
                if (appt.feeAmount > 0.0) "new" else "follow_up"
            } else {
                "follow_up"
            }
        }
        return if (appt.feeAmount <= 0.0) "follow_up" else "unknown"
    }

    private fun isValidClinicalVisitForHistory(appt: Appointment): Boolean {
        val st = appt.status.trim().lowercase(Locale.US)
        val ck = appt.checkinStatus.trim().lowercase(Locale.US)
        if (st in setOf("cancelled", "rejected", "pending_payment", "waiting_for_approval", "unapproved", "expired")) {
            return false
        }
        if (ck == "cancelled" || (ck == "no_show" && !appt.paymentStatus.equals("paid", ignoreCase = true))) {
            return false
        }
        return true
    }

    private fun resolveDisplayDoctorName(doc: Doctor?, isLabClinic: Boolean): String {
        if (isLabClinic || doc == null) return ""
        val raw = doc.fullName.trim()
        return if (raw.isBlank() || raw.equals("Doctor", ignoreCase = true)) "" else raw
    }

    /**
     * Builds one ledger row per payment transaction (plus a Rs. 0 FREE row for completed/paid
     * zero-fee visits with no transaction). Multi-part payments on the same bill receive
     * `paymentPart = k to n` (`PART 1/2`, `PART 2/2`) sorted chronologically.
     */
    fun buildUnifiedPaymentLogs(
        appointments: List<Appointment>,
        invoices: List<BillingInvoice>,
        doctors: List<Doctor>,
        transactions: List<InvoiceTransaction>,
        isLabClinic: Boolean = false,
        clinicServices: List<ClinicService> = emptyList()
    ): List<UnifiedPaymentLogEntry> {
        val doctorMap = doctors.associateBy { it.id }
        val invoiceMap = invoices.associateBy { it.appointmentId }
        val apptMap = appointments.associateBy { it.id }

        val validAppts = appointments
            .filter { isValidClinicalVisitForHistory(it) }
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
        val processedApptIdsFromTx = mutableSetOf<String>()
        val assignedCommissionApptIds = mutableSetOf<String>()

        // 1. Transactions from dedicated invoice_transactions table (1 row per payment)
        for (tx in transactions) {
            val appt = tx.appointmentId?.let { apptMap[it] }
            val inv = tx.invoiceId?.let { iId -> invoices.find { it.id == iId } }
                ?: tx.appointmentId?.let { invoiceMap[it] }
            val doc = appt?.doctorId?.let { doctorMap[it] }
            val visitType = resolveVisitType(appt, firstVisitSet, isLabClinic)
            val isFollowUp = visitType == "follow_up"
            val isConsultation = tx.category == null || tx.category.equals("CONSULTATION", ignoreCase = true)
            val isPad = appt?.isPayAtDesk == true
            val isFreeFollowUpConsult = isFollowUp && isConsultation && (appt?.feeAmount ?: 0.0) <= 0.0
            val expectedPadTotal = if (isPad && !isFreeFollowUpConsult) (appt?.effectiveTotalAmount ?: 0.0) else 0.0
            val isRefundTx = tx.amount < 0.0 ||
                tx.category.equals("REFUND", ignoreCase = true) ||
                (tx.notes?.contains("refund", ignoreCase = true) == true && tx.amount <= 0.0)

            val baseTxAmount = if (isFreeFollowUpConsult) 0.0 else tx.amount
            val effectiveAmount = if (
                !isRefundTx && isPad && !isFreeFollowUpConsult && isConsultation &&
                expectedPadTotal > 0.0 && baseTxAmount > 0.0 && baseTxAmount < expectedPadTotal
            ) {
                expectedPadTotal
            } else {
                baseTxAmount
            }

            val effTotalBill = when {
                isFreeFollowUpConsult -> inv?.totalAmount?.takeIf { it > 0.0 } ?: 0.0
                isPad && expectedPadTotal > 0.0 -> maxOf(inv?.totalAmount ?: 0.0, effectiveAmount, expectedPadTotal)
                else -> inv?.totalAmount ?: abs(tx.amount)
            }
            val serviceCharge = if (
                !isRefundTx && isPad && !isFreeFollowUpConsult && isConsultation &&
                appt != null && assignedCommissionApptIds.add(appt.id)
            ) {
                appt.effectiveServiceCharge
            } else {
                0.0
            }

            val tests = if (isLabClinic) parseLabTestItems(appt, inv, clinicServices).map { it.first } else emptyList()
            val followUpOfAppt = appt?.followUpOfAppointmentId?.let { apptMap[it] }
            val isOnlineMode = appt?.paymentMode.equals("ONLINE", ignoreCase = true)
            val rawMethod = when {
                isRefundTx -> tx.paymentMethod.ifBlank { "REFUND" }
                effectiveAmount == 0.0 -> "FREE"
                isPad && tx.paymentMethod.equals("CASH", ignoreCase = true) -> "PAY_AT_DESK"
                isOnlineMode && (tx.paymentMethod.isBlank() || tx.paymentMethod.equals("CASH", ignoreCase = true)) ->
                    inferPaymentMethodFromText(inv?.remarks ?: tx.notes, appt?.paymentMode, "ONLINE")
                else -> tx.paymentMethod
            }

            entries.add(
                UnifiedPaymentLogEntry(
                    id = tx.id,
                    appointmentId = tx.appointmentId ?: inv?.appointmentId,
                    invoiceId = tx.invoiceId ?: inv?.id,
                    trackingCode10Digit = appt?.trackingCode10Digit?.ifBlank { "\u2013" } ?: "\u2013",
                    followUpOfAppointmentId = appt?.followUpOfAppointmentId,
                    followUpOfTrackingCode = followUpOfAppt?.trackingCode10Digit?.ifBlank { null },
                    doctorId = if (isLabClinic) null else appt?.doctorId,
                    patientName = appt?.patientName?.ifBlank { "Walk-in Patient" } ?: "Walk-in Patient",
                    patientPhone = appt?.patientMobile?.ifBlank { "" } ?: "",
                    doctorName = resolveDisplayDoctorName(doc, isLabClinic),
                    doctorSpecialty = if (isLabClinic) "" else (doc?.specialty ?: ""),
                    consultationFee = if (isLabClinic || isFreeFollowUpConsult) 0.0 else (doc?.consultationFee ?: appt?.feeAmount ?: 0.0),
                    amount = effectiveAmount,
                    dateTime = tx.createdAt ?: inv?.paidAt ?: "",
                    paymentMethod = rawMethod,
                    paymentMode = appt?.paymentMode ?: if (effectiveAmount == 0.0) "FREE" else "ONLINE",
                    referenceId = if (effectiveAmount == 0.0 && !isRefundTx) (tx.referenceId ?: "FOLLOWUP-WAIVED") else tx.referenceId,
                    note = tx.notes ?: (if (isFreeFollowUpConsult) "Follow-up Consultation (Free)" else if (isLabClinic) "Diagnostic Lab Tests" else "OPD Consultation"),
                    invoiceStatus = inv?.paymentStatus ?: "paid",
                    totalBill = effTotalBill,
                    balanceDue = inv?.balanceDue ?: 0.0,
                    receiptUrl = null,
                    visitType = visitType,
                    testNames = tests,
                    paymentPart = null,
                    isRefund = isRefundTx,
                    category = if (isRefundTx) "REFUND" else if (isFreeFollowUpConsult) "FREE_FOLLOWUP" else (tx.category ?: "CONSULTATION"),
                    serviceChargeAmount = serviceCharge
                )
            )
            if (inv != null) processedInvoiceIds.add(inv.id)
            (tx.appointmentId ?: inv?.appointmentId)?.let { processedApptIdsFromTx.add(it) }
        }

        // 2. Fallback to payment records embedded in billing_invoices.remarks
        for (inv in invoices) {
            if (processedInvoiceIds.contains(inv.id)) continue
            if (inv.appointmentId.isNotBlank() && processedApptIdsFromTx.contains(inv.appointmentId)) continue

            val appt = apptMap[inv.appointmentId]
            val doc = appt?.doctorId?.let { doctorMap[it] }
            val visitType = resolveVisitType(appt, firstVisitSet, isLabClinic)
            val isFollowUp = visitType == "follow_up"
            val isPad = appt?.isPayAtDesk == true
            val isFreeFollowUpOnly = isFollowUp && (appt?.feeAmount ?: 0.0) <= 0.0 &&
                inv.items.none {
                    val n = it.itemName.lowercase()
                    !n.contains("consultation") && !n.contains("opd doctor") && !n.contains("clinical service") && !n.contains("follow-up")
                }
            val expectedPadTotal = if (isPad && !isFreeFollowUpOnly) (appt?.effectiveTotalAmount ?: 0.0) else 0.0
            val effInvTotal = if (isPad && !isFreeFollowUpOnly && expectedPadTotal > 0.0) maxOf(inv.totalAmount, expectedPadTotal) else inv.totalAmount
            val effInvPaid = if (!isFreeFollowUpOnly && inv.paymentStatus.equals("paid", ignoreCase = true) && isPad && expectedPadTotal > 0.0) {
                maxOf(inv.effectivePaidAmount, effInvTotal)
            } else {
                inv.effectivePaidAmount
            }

            val fallbackAmt = if (isFreeFollowUpOnly) {
                0.0
            } else if (isFollowUp && (appt?.feeAmount ?: 0.0) <= 0.0) {
                val nonConsultTotal = inv.items.filterNot {
                    val n = it.itemName.lowercase()
                    n.contains("consultation") || n.contains("opd doctor") || n.contains("clinical service") || n.contains("follow-up")
                }.sumOf { it.total }
                if (inv.paidAmount > 0.0) inv.paidAmount else nonConsultTotal
            } else {
                effInvPaid
            }

            val fallbackDateToUse = inv.paidAt?.takeIf { it.isNotBlank() }
                ?: inv.updatedAt?.takeIf { it.isNotBlank() }
                ?: inv.createdAt
            val records = parsePaymentRecords(inv.remarks, fallbackAmt, fallbackDateToUse)
            val tests = if (isLabClinic) parseLabTestItems(appt, inv, clinicServices).map { it.first } else emptyList()
            val followUpOfAppt = appt?.followUpOfAppointmentId?.let { apptMap[it] }

            for (r in records) {
                val isRefundRec = r.amount < 0.0 || r.category.equals("REFUND", ignoreCase = true)
                val method = r.paymentMethod?.takeIf { it.isNotBlank() } ?: when {
                    isRefundRec -> "REFUND"
                    else -> inferPaymentMethodFromText(
                        listOfNotNull(r.note, inv.remarks).joinToString(" "),
                        appt?.paymentMode,
                        when {
                            isPad -> "PAY_AT_DESK"
                            appt?.paymentMode.equals("ONLINE", ignoreCase = true) -> "ONLINE"
                            fallbackAmt == 0.0 -> "FREE"
                            else -> "CASH"
                        }
                    )
                }

                val isConsultation = r.category == null || r.category.equals("CONSULTATION", ignoreCase = true) ||
                    r.note?.contains("consultation", ignoreCase = true) == true
                val effectiveAmount = when {
                    isRefundRec -> r.amount
                    isFreeFollowUpOnly && isConsultation -> 0.0
                    isPad && !isFreeFollowUpOnly && isConsultation && records.size == 1 && expectedPadTotal > 0.0 && r.amount > 0.0 && r.amount < expectedPadTotal -> expectedPadTotal
                    else -> r.amount
                }
                val serviceCharge = if (
                    !isRefundRec && isPad && !isFreeFollowUpOnly && isConsultation &&
                    appt != null && assignedCommissionApptIds.add(appt.id)
                ) {
                    appt.effectiveServiceCharge
                } else {
                    0.0
                }

                entries.add(
                    UnifiedPaymentLogEntry(
                        id = r.id,
                        appointmentId = inv.appointmentId,
                        invoiceId = inv.id,
                        trackingCode10Digit = appt?.trackingCode10Digit?.ifBlank { "\u2013" } ?: "\u2013",
                        followUpOfAppointmentId = appt?.followUpOfAppointmentId,
                        followUpOfTrackingCode = followUpOfAppt?.trackingCode10Digit?.ifBlank { null },
                        doctorId = if (isLabClinic) null else appt?.doctorId,
                        patientName = appt?.patientName?.ifBlank { "Patient" } ?: "Patient",
                        patientPhone = appt?.patientMobile?.ifBlank { "" } ?: "",
                        doctorName = resolveDisplayDoctorName(doc, isLabClinic),
                        doctorSpecialty = if (isLabClinic) "" else (doc?.specialty ?: ""),
                        consultationFee = if (isLabClinic || isFreeFollowUpOnly) 0.0 else (doc?.consultationFee ?: appt?.feeAmount ?: 0.0),
                        amount = effectiveAmount,
                        dateTime = r.dateTime,
                        paymentMethod = if (!isRefundRec && effectiveAmount == 0.0) "FREE" else method,
                        paymentMode = appt?.paymentMode ?: if (effectiveAmount == 0.0) "FREE" else "CASH",
                        referenceId = if (!isRefundRec && effectiveAmount == 0.0) (r.referenceId ?: "FOLLOWUP-WAIVED") else r.referenceId,
                        note = r.note ?: (if (isFreeFollowUpOnly) "Follow-up Consultation (Free)" else if (isLabClinic) "Diagnostic Lab Tests" else "OPD Consultation"),
                        invoiceStatus = inv.paymentStatus,
                        totalBill = if (isFreeFollowUpOnly && isConsultation) 0.0 else effInvTotal,
                        balanceDue = if (isFreeFollowUpOnly && isConsultation) 0.0 else (effInvTotal - effInvPaid).coerceAtLeast(0.0),
                        receiptUrl = null,
                        visitType = visitType,
                        testNames = tests,
                        paymentPart = null,
                        isRefund = isRefundRec,
                        category = if (isRefundRec) "REFUND" else if (isFreeFollowUpOnly && isConsultation) "FREE_FOLLOWUP" else (r.category ?: "CONSULTATION"),
                        serviceChargeAmount = serviceCharge
                    )
                )
            }
        }

        // 3. Fallback for paid or Rs. 0 free visits not yet covered by invoices or transactions
        val processedAppointmentIds = entries.mapNotNull { it.appointmentId }.toSet()
        for (appt in validAppts) {
            if (processedAppointmentIds.contains(appt.id)) continue
            val isPaid = appt.paymentStatus.equals("paid", ignoreCase = true)
            val isFreeVisit = appt.feeAmount <= 0.0 &&
                (isPaid || appt.paymentMode.equals("FREE", ignoreCase = true) || appt.status.equals("APPROVED", ignoreCase = true))
            if (!isPaid && !isFreeVisit) continue

            val doc = appt.doctorId?.let { doctorMap[it] }
            val visitType = resolveVisitType(appt, firstVisitSet, isLabClinic)
            val isFollowUp = visitType == "follow_up"
            val effectiveAmount = if (appt.feeAmount <= 0.0 && appt.totalAmount <= 0.0) 0.0 else appt.effectiveTotalAmount
            val apptDateTime = appt.approvedAt?.takeIf { it.isNotBlank() }
                ?: appt.createdAt?.takeIf { it.isNotBlank() }
                ?: "${appt.appointmentDate} ${appt.appointmentTime.ifBlank { "10:00 AM" }}"
            val isPad = appt.isPayAtDesk
            val serviceCharge = if (isPad && effectiveAmount > 0.0 && assignedCommissionApptIds.add(appt.id)) {
                appt.effectiveServiceCharge
            } else {
                0.0
            }
            val tests = if (isLabClinic) parseLabTestItems(appt, null, clinicServices).map { it.first } else emptyList()
            val followUpOfAppt = appt.followUpOfAppointmentId?.let { apptMap[it] }

            entries.add(
                UnifiedPaymentLogEntry(
                    id = "appt-${appt.id}",
                    appointmentId = appt.id,
                    trackingCode10Digit = appt.trackingCode10Digit.ifBlank { "\u2013" },
                    followUpOfAppointmentId = appt.followUpOfAppointmentId,
                    followUpOfTrackingCode = followUpOfAppt?.trackingCode10Digit?.ifBlank { null },
                    doctorId = if (isLabClinic) null else appt.doctorId,
                    patientName = appt.patientName.ifBlank { "Patient" },
                    patientPhone = appt.patientMobile.ifBlank { "" },
                    doctorName = resolveDisplayDoctorName(doc, isLabClinic),
                    doctorSpecialty = if (isLabClinic) "" else (doc?.specialty ?: ""),
                    consultationFee = if (isLabClinic || isFollowUp) 0.0 else (doc?.consultationFee ?: appt.feeAmount),
                    amount = effectiveAmount,
                    dateTime = apptDateTime,
                    paymentMethod = if (effectiveAmount == 0.0) "FREE" else inferPaymentMethodFromText(appt.notes, appt.paymentMode, appt.paymentMode.ifBlank { "CASH" }),
                    paymentMode = if (effectiveAmount == 0.0) "FREE" else appt.paymentMode,
                    referenceId = if (effectiveAmount == 0.0) "FOLLOWUP-WAIVED" else null,
                    note = if (isFollowUp && effectiveAmount == 0.0) "Follow-up Consultation (Free)" else if (isLabClinic) "Diagnostic Lab Tests" else "OPD Consultation",
                    invoiceStatus = "paid",
                    totalBill = effectiveAmount,
                    balanceDue = 0.0,
                    receiptUrl = null,
                    visitType = visitType,
                    testNames = tests,
                    paymentPart = null,
                    isRefund = false,
                    category = if (isFollowUp && effectiveAmount == 0.0) "FREE_FOLLOWUP" else "CONSULTATION",
                    serviceChargeAmount = serviceCharge
                )
            )
        }

        // Annotate split/part payments (`PART k/n`) for bills with > 1 positive payment
        val partByEntryId = mutableMapOf<String, Pair<Int, Int>>()
        val groupedByBill = entries
            .filter { !it.isRefund && it.amount > 0.0 && (!it.invoiceId.isNullOrBlank() || !it.appointmentId.isNullOrBlank()) }
            .groupBy { it.invoiceId?.takeIf { id -> id.isNotBlank() } ?: it.appointmentId!! }

        for ((_, group) in groupedByBill) {
            if (group.size > 1) {
                val chronological = group.sortedWith(compareBy({ it.dateTime }, { it.id }))
                chronological.forEachIndexed { idx, entry ->
                    partByEntryId[entry.id] = (idx + 1) to chronological.size
                }
            }
        }

        return entries
            .map { entry ->
                partByEntryId[entry.id]?.let { entry.copy(paymentPart = it) } ?: entry
            }
            .sortedByDescending { it.dateTime }
    }

    /**
     * Returns unpaid or partly paid bills for visits inside the selected period,
     * sorted oldest first (money waiting longest on top).
     */
    fun buildPendingBills(
        appointments: List<Appointment>,
        invoices: List<BillingInvoice>,
        doctors: List<Doctor>,
        isLabClinic: Boolean = false,
        clinicServices: List<ClinicService> = emptyList(),
        periodPredicate: (String) -> Boolean
    ): List<PendingBillEntry> {
        val doctorMap = doctors.associateBy { it.id }
        val invoiceMap = invoices.associateBy { it.appointmentId }

        val validAppts = appointments
            .filter { isValidClinicalVisitForHistory(it) }
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

        val pending = mutableListOf<PendingBillEntry>()
        val coveredApptIds = mutableSetOf<String>()

        for (appt in validAppts) {
            val visitDate = appt.appointmentDate.take(10).ifBlank { extractLocalDate(appt.createdAt) }
            if (!periodPredicate(visitDate)) continue

            val inv = invoiceMap[appt.id]
            val doc = appt.doctorId?.let { doctorMap[it] }
            val visitType = resolveVisitType(appt, firstVisitSet, isLabClinic)
            val tests = if (isLabClinic) parseLabTestItems(appt, inv, clinicServices).map { it.first } else emptyList()

            val totalAmt: Double
            val paidAmt: Double
            val dueAmt: Double

            if (inv != null) {
                val invIsPaid = inv.paymentStatus.equals("paid", ignoreCase = true) && inv.balanceDue <= 0.01
                if (invIsPaid) {
                    coveredApptIds.add(appt.id)
                    continue
                }
                val baseTotal = if (inv.totalAmount > 0.0) inv.totalAmount else appt.effectiveTotalAmount
                totalAmt = if (appt.isPayAtDesk) maxOf(baseTotal, appt.effectiveTotalAmount) else baseTotal
                paidAmt = inv.effectivePaidAmount
                dueAmt = if (inv.balanceDue > 0.01) inv.balanceDue else (totalAmt - paidAmt).coerceAtLeast(0.0)
            } else {
                val apptPaid = appt.paymentStatus.equals("paid", ignoreCase = true)
                val isFree = appt.effectiveTotalAmount <= 0.0 || appt.paymentMode.equals("FREE", ignoreCase = true)
                if (apptPaid || isFree) {
                    coveredApptIds.add(appt.id)
                    continue
                }
                totalAmt = appt.effectiveTotalAmount
                paidAmt = 0.0
                dueAmt = totalAmt
            }

            if (dueAmt > 0.01) {
                coveredApptIds.add(appt.id)
                pending.add(
                    PendingBillEntry(
                        invoiceId = inv?.id,
                        appointmentId = appt.id,
                        trackingCode10Digit = appt.trackingCode10Digit.ifBlank { "\u2013" },
                        patientName = appt.patientName.ifBlank { "Patient" },
                        patientPhone = appt.patientMobile,
                        doctorId = if (isLabClinic) null else appt.doctorId,
                        doctorName = resolveDisplayDoctorName(doc, isLabClinic),
                        testNames = tests,
                        visitDate = visitDate,
                        visitTime = formatRowTime(appt.appointmentTime),
                        visitType = visitType,
                        paymentMode = appt.paymentMode,
                        totalAmount = totalAmt,
                        paidAmount = paidAmt,
                        balanceDue = dueAmt,
                        isPartlyPaid = paidAmt > 0.01 && dueAmt > 0.01
                    )
                )
            }
        }

        // Include any orphan pending invoice whose appointment isn't in appointments list
        for (inv in invoices) {
            if (coveredApptIds.contains(inv.appointmentId)) continue
            val invDate = extractLocalDate(inv.createdAt ?: inv.updatedAt ?: inv.paidAt)
            if (!periodPredicate(invDate)) continue
            val due = if (inv.balanceDue > 0.01) inv.balanceDue else (inv.totalAmount - inv.effectivePaidAmount).coerceAtLeast(0.0)
            if (!inv.paymentStatus.equals("paid", ignoreCase = true) && due > 0.01) {
                pending.add(
                    PendingBillEntry(
                        invoiceId = inv.id,
                        appointmentId = inv.appointmentId,
                        trackingCode10Digit = "\u2013",
                        patientName = "Patient",
                        patientPhone = "",
                        visitDate = invDate,
                        totalAmount = inv.totalAmount,
                        paidAmount = inv.effectivePaidAmount,
                        balanceDue = due,
                        isPartlyPaid = inv.effectivePaidAmount > 0.01 && due > 0.01
                    )
                )
            }
        }

        return pending.sortedWith(compareBy({ it.visitDate }, { it.visitTime }, { it.patientName }))
    }

    /**
     * Computes single source-of-truth financial KPIs for the selected period so
     * all cards, tabs, and breakdowns always reconcile cleanly.
     */
    fun computeSummary(
        periodLogs: List<UnifiedPaymentLogEntry>,
        periodPendingBills: List<PendingBillEntry>,
        periodExpenses: List<ClinicExpense>,
        subscriptionsInPeriod: List<ClinicSubscriptionPayment> = emptyList()
    ): PaymentPeriodSummary {
        val collected = periodLogs.sumOf { it.amount }
        val pendingTotal = periodPendingBills.sumOf { it.balanceDue }
        val expenses = periodExpenses.sumOf { it.amount }
        val platformFees = periodLogs.sumOf { it.serviceChargeAmount }
        val subscriptionDue = subscriptionsInPeriod
            .filter {
                val st = it.status.lowercase()
                st.contains("due") || st.contains("unpaid")
            }
            .sumOf { it.amount }
        val net = collected - expenses - platformFees - subscriptionDue
        return PaymentPeriodSummary(
            collected = collected,
            collectedCount = periodLogs.size,
            pendingTotal = pendingTotal,
            pendingCount = periodPendingBills.size,
            expenses = expenses,
            expensesCount = periodExpenses.size,
            platformFees = platformFees,
            subscriptionDue = subscriptionDue,
            net = net
        )
    }

    /**
     * Per-doctor stats for the selected period, reconciling `collectedAmount` directly
     * to `periodLogs` so total income across doctors matches the Collected card.
     */
    fun computeDoctorPeriodStats(
        periodLogs: List<UnifiedPaymentLogEntry>,
        periodAppointments: List<Appointment>,
        allAppointments: List<Appointment>,
        doctors: List<Doctor>
    ): List<DoctorPeriodStat> {
        val doctorMap = doctors.associateBy { it.id }

        val validAll = allAppointments
            .filter { isValidClinicalVisitForHistory(it) }
            .sortedWith(compareBy({ it.appointmentDate }, { it.appointmentTime }, { it.id }))

        val seenByDoctor = mutableMapOf<String, MutableSet<String>>()
        val firstVisitSet = mutableSetOf<String>()
        for (appt in validAll) {
            val docId = appt.doctorId ?: continue
            val pKey = derivePatientKey(appt.userId, appt.patientMobile, appt.patientName, appt.id)
            val seen = seenByDoctor.getOrPut(docId) { mutableSetOf() }
            if (seen.add(pKey)) firstVisitSet.add(appt.id)
        }

        val visitsByDoc = mutableMapOf<String, Triple<Int, Int, Int>>() // total, new, followup
        for (appt in periodAppointments) {
            if (appt.status.equals("cancelled", true) || appt.status.equals("rejected", true) || appt.checkinStatus.equals("cancelled", true)) continue
            val docId = appt.doctorId ?: continue
            val vType = resolveVisitType(appt, firstVisitSet, isLabClinic = false)
            val prev = visitsByDoc[docId] ?: Triple(0, 0, 0)
            val addNew = if (vType == "new") 1 else 0
            val addFu = if (vType == "follow_up") 1 else 0
            visitsByDoc[docId] = Triple(prev.first + 1, prev.second + addNew, prev.third + addFu)
        }

        val collectedByDoc = mutableMapOf<String, Double>()
        for (log in periodLogs) {
            val docId = log.doctorId ?: continue
            collectedByDoc[docId] = (collectedByDoc[docId] ?: 0.0) + log.amount
        }

        val docIds = (visitsByDoc.keys + collectedByDoc.keys).toSet()
        val totalCollectedAcrossDocs = collectedByDoc.values.sum()

        return docIds.mapNotNull { docId ->
            val doc = doctorMap[docId] ?: return@mapNotNull null
            val visits = visitsByDoc[docId] ?: Triple(0, 0, 0)
            val collected = collectedByDoc[docId] ?: 0.0
            val share = if (totalCollectedAcrossDocs > 0.0) (collected / totalCollectedAcrossDocs * 100.0) else 0.0
            DoctorPeriodStat(
                doctorId = docId,
                doctorName = formatDoctorDisplayName(doc.fullName).ifBlank { doc.fullName },
                specialty = doc.specialty?.ifBlank { "General Practice" } ?: "General Practice",
                consultationFee = doc.consultationFee ?: 0.0,
                totalVisits = visits.first,
                newPatients = visits.second,
                followupPatients = visits.third,
                collectedAmount = collected,
                sharePercent = share
            )
        }.sortedByDescending { it.collectedAmount }
    }

    /**
     * Lab-only "Income per Test" breakdown. Splits each payment proportionally across
     * the visit's tests using catalog/listed prices so discounts are shared fairly and
     * `sum(collectedIncome) == sum(periodLogs.amount)`.
     */
    fun computeTestPeriodStats(
        periodLogs: List<UnifiedPaymentLogEntry>,
        appointments: List<Appointment>,
        invoices: List<BillingInvoice>,
        clinicServices: List<ClinicService>
    ): List<LabTestPeriodStat> {
        val apptMap = appointments.associateBy { it.id }
        val invMap = invoices.associateBy { it.appointmentId }
        val catalogByLower = clinicServices.associateBy { it.serviceName.trim().lowercase() }

        val incomeByTestPaisa = mutableMapOf<String, Long>()
        val countByTest = mutableMapOf<String, Int>()
        val unitPriceByTest = mutableMapOf<String, Double>()
        val countedTestsPerAppt = mutableSetOf<String>()

        for (log in periodLogs) {
            val appt = log.appointmentId?.let { apptMap[it] }
            val inv = log.invoiceId?.let { id -> invoices.find { it.id == id } } ?: log.appointmentId?.let { invMap[it] }
            val parsed = parseLabTestItems(appt, inv, clinicServices)
                .ifEmpty { log.testNames.map { name -> name to (catalogByLower[name.lowercase()]?.price ?: 0.0) } }
                .ifEmpty { listOf("Lab Service" to 1.0) }

            val apptKeyPrefix = log.appointmentId ?: log.invoiceId ?: log.id
            for ((tName, price) in parsed) {
                if (price > 0.0 && !unitPriceByTest.containsKey(tName)) {
                    unitPriceByTest[tName] = price
                }
                val dedupKey = "$apptKeyPrefix|$tName"
                if (countedTestsPerAppt.add(dedupKey)) {
                    countByTest[tName] = (countByTest[tName] ?: 0) + 1
                }
            }

            val totalLogPaisa = (log.amount * 100.0).roundToLong()
            val totalWeight = parsed.sumOf { it.second }
            var distributedPaisa = 0L

            parsed.forEachIndexed { idx, (tName, weight) ->
                val sharePaisa = if (idx == parsed.lastIndex) {
                    totalLogPaisa - distributedPaisa
                } else if (totalWeight > 0.0) {
                    ((log.amount * (weight / totalWeight)) * 100.0).roundToLong()
                } else {
                    totalLogPaisa / parsed.size
                }
                distributedPaisa += sharePaisa
                incomeByTestPaisa[tName] = (incomeByTestPaisa[tName] ?: 0L) + sharePaisa
            }
        }

        val totalIncome = incomeByTestPaisa.values.sum() / 100.0
        return incomeByTestPaisa.map { (name, paisa) ->
            val income = paisa / 100.0
            val cnt = countByTest[name] ?: 1
            val catalogPrice = unitPriceByTest[name] ?: catalogByLower[name.lowercase()]?.price ?: (if (cnt > 0) income / cnt else 0.0)
            val share = if (totalIncome > 0.0) (income / totalIncome * 100.0) else 0.0
            LabTestPeriodStat(
                testName = name,
                count = cnt,
                unitPrice = catalogPrice,
                collectedIncome = income,
                sharePercent = share
            )
        }.sortedByDescending { it.collectedIncome }
    }

    // Legacy Compute Doctor Daily and Monthly Performance (kept for backwards compatibility)
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
            val standardFee = doc.consultationFee?.takeIf { it > 0.0 } ?: appt.feeAmount.takeIf { it > 0.0 } ?: 0.0

            val pKey = derivePatientKey(appt.userId, appt.patientMobile, appt.patientName, appt.id)
            val seenSet = seenByDoctor.getOrPut(docId) { mutableSetOf() }
            val isNew = !seenSet.contains(pKey)
            seenSet.add(pKey)

            val apptDate = appt.appointmentDate.ifBlank { "2026-01-01" }
            val apptMonth = if (apptDate.length >= 7) apptDate.substring(0, 7) else "2026-01"

            val inv = invoiceMap[appt.id]
            val apptTxs = txMap[appt.id] ?: emptyList()
            val txPaid = apptTxs.sumOf { it.amount }

            val isFreeFollowUp = !isNew && (appt.feeAmount <= 0.0)
            val revenueAdded: Double = if (!isFreeFollowUp) {
                if (inv != null && inv.totalAmount > 0.0) {
                    maxOf(inv.totalAmount, standardFee)
                } else if (txPaid > 0.0) {
                    maxOf(txPaid, standardFee)
                } else {
                    standardFee
                }
            } else {
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
                        apptTxs.filter {
                            it.category != null && !it.category.equals("CONSULTATION", ignoreCase = true)
                        }.sumOf { it.amount }
                    }
                } else {
                    apptTxs.filter {
                        it.category != null && !it.category.equals("CONSULTATION", ignoreCase = true)
                    }.sumOf { it.amount }
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
        clinicName: String = "Dactor Partner Clinic",
        expenses: List<ClinicExpense> = emptyList(),
        isLabClinic: Boolean = false
    ): String {
        val grossCollected = logs.sumOf { it.amount }
        val followupCount = logs.count { it.visitType == "follow_up" }
        val newPatientCount = logs.count { it.visitType == "new" }
        val platformCommission = logs.sumOf { it.serviceChargeAmount }
        val netPayout = grossCollected - platformCommission
        val totalExpenses = expenses.sumOf { it.amount }
        val netClinicProfit = netPayout - totalExpenses

        val sb = StringBuilder()
        sb.append("\uFEFF") // UTF-8 BOM for Excel

        sb.append("\"Clinic Name\",\"${clinicName.replace("\"", "\"\"")}\"\r\n")
        sb.append("\"Audit Scope Period\",\"${periodLabel.replace("\"", "\"\"")}\"\r\n")
        sb.append("\"Gross Collections (NPR)\",\"${grossCollected.toInt()}\"\r\n")
        sb.append("\"Dactor Pay-at-Desk Platform Commission (NPR)\",\"${platformCommission.toInt()}\"\r\n")
        sb.append("\"Net Clinic OPD Payout (NPR)\",\"${netPayout.toInt()}\"\r\n")
        sb.append("\"Total Clinic Expenses (NPR)\",\"${totalExpenses.toInt()}\"\r\n")
        sb.append("\"Net Clinic Profit / Cash Flow (NPR)\",\"${netClinicProfit.toInt()}\"\r\n")
        if (!isLabClinic) {
            sb.append("\"Free Follow-up Consultations (0 NPR)\",\"$followupCount Patients (Fee Waived)\"\r\n")
            sb.append("\"New Patients Seen\",\"$newPatientCount Patients\"\r\n")
        }
        sb.append("\"Total Audit Records\",\"${logs.size}\"\r\n")
        sb.append("\r\n")

        val headers = listOf(
            "Date Time",
            "Token",
            "Patient Name",
            "Mobile",
            if (isLabClinic) "Tests" else "Doctor Name",
            if (isLabClinic) "Type" else "Specialty",
            "Visit Type",
            "Category",
            "Payment Method",
            "Amount Collected (NPR)",
            "Ref ID",
            "Notes"
        )
        sb.append(headers.joinToString(",")).append("\r\n")

        for (log in logs) {
            val visitTypeLabel = when {
                log.isRefund -> "REFUND"
                isLabClinic -> if (log.amount == 0.0) "FREE" else "LAB_ORDER"
                log.visitType == "follow_up" -> "FREE_FOLLOW_UP"
                log.visitType == "new" -> "NEW_PATIENT"
                else -> "VISIT"
            }
            val personOrTests = if (isLabClinic) log.testNames.joinToString("; ") else log.doctorName
            val specOrType = if (isLabClinic) "Diagnostic Lab" else log.doctorSpecialty
            val row = listOf(
                log.dateTime,
                log.trackingCode10Digit ?: "",
                "\"${log.patientName.replace("\"", "\"\"")}\"",
                log.patientPhone,
                "\"${personOrTests.replace("\"", "\"\"")}\"",
                "\"${specOrType.replace("\"", "\"\"")}\"",
                visitTypeLabel,
                log.category,
                log.paymentMethod,
                log.amount.toInt().toString(),
                "\"${(log.referenceId ?: "").replace("\"", "\"\"")}\"",
                "\"${(log.note ?: "").replace("\"", "\"\"")}\""
            )
            sb.append(row.joinToString(",")).append("\r\n")
        }

        if (expenses.isNotEmpty()) {
            sb.append("\r\n")
            sb.append("\"CLINIC EXPENSES AUDIT LOG\"\r\n")
            val expenseHeaders = listOf(
                "Date",
                "Time",
                "Expense Title",
                "Category",
                "Payment Method",
                "Amount (NPR)",
                "Voucher / Bill No",
                "Remarks"
            )
            sb.append(expenseHeaders.joinToString(",")).append("\r\n")
            for (exp in expenses) {
                val expRow = listOf(
                    exp.expenseDate,
                    exp.expenseTime ?: "",
                    "\"${exp.title.replace("\"", "\"\"")}\"",
                    exp.category,
                    exp.paymentMethod,
                    exp.amount.toInt().toString(),
                    "\"${(exp.voucherNumber ?: "").replace("\"", "\"\"")}\"",
                    "\"${(exp.remarks ?: "").replace("\"", "\"\"")}\""
                )
                sb.append(expRow.joinToString(",")).append("\r\n")
            }
        }

        return sb.toString()
    }

    data class CombinedBillingSummary(
        val visitsCount: Int,
        val totalBill: Double,
        val totalPaid: Double,
        val balanceDue: Double,
        val items: List<InvoiceItem>,
        val paymentRecords: List<PaymentRecord>,
        val cleanRemarks: String
    )

    fun computeCombinedBillingSummary(
        visits: List<Appointment>,
        invoicesByApptId: Map<String, BillingInvoice>,
        transactions: List<InvoiceTransaction> = emptyList()
    ): CombinedBillingSummary {
        if (visits.isEmpty()) {
            return CombinedBillingSummary(0, 0.0, 0.0, 0.0, emptyList(), emptyList(), "")
        }
        val sortedVisits = visits
            .distinctBy { it.id }
            .sortedWith(compareBy<Appointment>({ it.attemptNumber }, { it.appointmentDate }, { it.appointmentTime }, { it.createdAt ?: "" }))

        val isMultiVisit = sortedVisits.size > 1
        val allItems = mutableListOf<InvoiceItem>()
        val allPayments = mutableListOf<PaymentRecord>()
        val allRemarks = mutableListOf<String>()
        var grandTotal = 0.0

        for (v in sortedVisits) {
            val inv = invoicesByApptId[v.id]
            val isCancelled = v.status.equals("cancelled", true) ||
                v.status.equals("rejected", true) ||
                v.checkinStatus.equals("cancelled", true)
            if (isCancelled && (inv == null || (inv.totalAmount <= 0.0 && inv.paidAmount <= 0.0))) {
                continue
            }

            val isFollowUp = v.attemptNumber > 1 ||
                v.visitType.equals("follow_up", true) ||
                !v.followUpOfAppointmentId.isNullOrBlank() ||
                (v.feeAmount <= 0.0 && v.notes?.contains("follow", true) == true)

            val rawCleanItems = inv?.items?.filterNot {
                it.itemName.startsWith("Payment Received", ignoreCase = true)
            } ?: emptyList()

            val visitItems: List<InvoiceItem> = when {
                rawCleanItems.isNotEmpty() -> {
                    val hasServiceCharge = rawCleanItems.any {
                        val lower = it.itemName.lowercase()
                        lower.contains("service charge") || lower.contains("5%") || lower.contains("+5%")
                    }
                    if (!isFollowUp && v.isPayAtDesk && v.effectiveServiceCharge > 0.0 && !hasServiceCharge) {
                        rawCleanItems + InvoiceItem(
                            itemName = "Pay at Desk Service Charge (5%)",
                            quantity = 1,
                            price = v.effectiveServiceCharge,
                            total = v.effectiveServiceCharge
                        )
                    } else {
                        rawCleanItems
                    }
                }
                inv != null && inv.totalAmount > 0.0 -> {
                    listOf(
                        InvoiceItem(
                            itemName = "OPD Consultation & Services (${v.appointmentDate})",
                            quantity = 1,
                            price = inv.totalAmount,
                            total = inv.totalAmount
                        )
                    )
                }
                !isFollowUp && v.effectiveTotalAmount > 0.0 -> {
                    if (v.isPayAtDesk && v.effectiveServiceCharge > 0.0) {
                        listOf(
                            InvoiceItem("OPD Consultation (${v.appointmentDate})", 1, v.feeAmount, v.feeAmount),
                            InvoiceItem("Pay at Desk Service Charge (5%)", 1, v.effectiveServiceCharge, v.effectiveServiceCharge)
                        )
                    } else {
                        listOf(InvoiceItem("OPD Consultation (${v.appointmentDate})", 1, v.effectiveTotalAmount, v.effectiveTotalAmount))
                    }
                }
                else -> emptyList()
            }

            val visitTotal = if (visitItems.isNotEmpty()) {
                visitItems.sumOf { if (it.total > 0.0) it.total else it.price * it.quantity }
            } else if (inv != null && inv.totalAmount > 0.0) {
                inv.totalAmount
            } else if (!isFollowUp) {
                v.effectiveTotalAmount
            } else {
                0.0
            }

            grandTotal += visitTotal
            visitItems.forEach { item ->
                val taggedName = if (isMultiVisit && !item.itemName.startsWith("Visit #")) {
                    "Visit #${v.attemptNumber} (${v.appointmentDate}) \u2022 ${item.itemName}"
                } else {
                    item.itemName
                }
                allItems.add(item.copy(itemName = taggedName))
            }

            // Collect actual payments (never synthesize payment on unbilled free follow-up!)
            val parsedLogs = parsePaymentRecords(
                rawRemarks = inv?.remarks,
                fallbackPaidAmount = 0.0,
                fallbackDate = inv?.paidAt
            )
            if (parsedLogs.isNotEmpty()) {
                allPayments.addAll(parsedLogs)
            } else {
                val apptTxs = transactions.filter { it.appointmentId == v.id && it.amount != 0.0 }
                if (apptTxs.isNotEmpty()) {
                    apptTxs.forEach { tx ->
                        allPayments.add(
                            PaymentRecord(
                                id = tx.id,
                                amount = tx.amount,
                                dateTime = tx.createdAt?.take(16)?.replace("T", " ") ?: v.appointmentDate,
                                note = tx.notes ?: "Payment Received",
                                paymentMethod = tx.paymentMethod,
                                referenceId = tx.referenceId
                            )
                        )
                    }
                } else {
                    val explicitPaid = inv?.effectivePaidAmount ?: 0.0
                    val synthPaid = when {
                        explicitPaid > 0.0 -> explicitPaid
                        !isFollowUp && v.paymentStatus.equals("paid", true) && visitTotal > 0.0 -> visitTotal
                        else -> 0.0
                    }
                    if (synthPaid > 0.0) {
                        val stamp = inv?.paidAt?.take(16)?.replace("T", " ")
                            ?: v.approvedAt?.take(16)?.replace("T", " ")
                            ?: "${v.appointmentDate} ${v.appointmentTime.ifBlank { "10:00 AM" }}"
                        allPayments.add(
                            PaymentRecord(
                                amount = synthPaid,
                                dateTime = stamp,
                                note = if (v.isPayAtDesk) "Pay at Desk Collection" else "Consultation Payment"
                            )
                        )
                    }
                }
            }

            val cleanRem = extractCleanClinicalRemarks(inv?.remarks)
            if (cleanRem.isNotBlank()) {
                allRemarks.add(if (isMultiVisit) "[${v.appointmentDate}] $cleanRem" else cleanRem)
            }
        }

        val totalPaid = allPayments.sumOf { it.amount }
        val balance = (grandTotal - totalPaid).coerceAtLeast(0.0)
        return CombinedBillingSummary(
            visitsCount = sortedVisits.size,
            totalBill = grandTotal,
            totalPaid = totalPaid,
            balanceDue = balance,
            items = allItems,
            paymentRecords = allPayments,
            cleanRemarks = allRemarks.joinToString("\n")
        )
    }
}
