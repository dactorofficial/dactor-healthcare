package com.dactor.clinic.ui.billing

import android.widget.Toast
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import com.dactor.clinic.data.model.Appointment
import com.dactor.clinic.data.model.BillingInvoice
import com.dactor.clinic.data.model.Clinic
import com.dactor.clinic.data.model.Doctor
import com.dactor.clinic.data.model.InvoiceItem
import com.dactor.clinic.data.model.PaymentRecord
import com.dactor.clinic.data.repository.AppointmentRepository
import com.dactor.clinic.data.repository.BillingRepository
import com.dactor.clinic.data.repository.ClinicRepository
import com.dactor.clinic.data.repository.DoctorRepository
import com.dactor.clinic.domain.util.BillPdfDownloader
import com.dactor.clinic.domain.util.CurrencyFormatter
import com.dactor.clinic.domain.util.PaymentLedgerHelper
import kotlinx.coroutines.launch
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.util.UUID

data class QuickBillPatientFallback(
    val patientName: String,
    val patientAge: Int? = null,
    val patientGender: String? = null,
    val patientMobile: String = "",
    val patientEmail: String? = null,
    val trackingCode10Digit: String = "",
    val userId: String? = null,
    val doctorId: String? = null
)

private fun isFollowUpAppointmentForPopup(appt: Appointment): Boolean {
    if (appt.attemptNumber > 1 || appt.visitType.equals("follow_up", ignoreCase = true) || !appt.followUpOfAppointmentId.isNullOrBlank()) {
        return true
    }
    if (appt.feeAmount > 0.0) return false
    return appt.notes?.contains("follow", ignoreCase = true) == true
}

/**
 * Reusable in-place overlapping dialog for pushing / editing a specific patient's bill directly
 * from Live Queue (Completed or Live), Patient Directory, or Patient Chart without navigating away
 * to the Patient & Billing Directory screen.
 *
 * Includes a second overlapping Confirm / Cancel AlertDialog prompt when pushing the bill.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun QuickPushEditBillDialog(
    targetAppointment: Appointment?,
    targetPatientFallback: QuickBillPatientFallback? = null,
    clinicId: String,
    billingRepository: BillingRepository?,
    appointmentRepository: AppointmentRepository?,
    clinicRepository: ClinicRepository?,
    doctorRepository: DoctorRepository?,
    knownClinicAppointments: List<Appointment> = emptyList(),
    knownDoctors: List<Doctor> = emptyList(),
    loadedClinicHint: Clinic? = null,
    onDismiss: () -> Unit,
    onBillSaved: (Appointment, BillingInvoice) -> Unit
) {
    val context = LocalContext.current
    val coroutineScope = rememberCoroutineScope()
    val today = remember { LocalDate.now().toString() }

    var isLoading by remember { mutableStateOf(true) }
    var isSaving by remember { mutableStateOf(false) }
    var showConfirmDialog by remember { mutableStateOf(false) }

    var loadedClinic by remember { mutableStateOf(loadedClinicHint) }
    var doctorsMap by remember(knownDoctors) { mutableStateOf(knownDoctors.associateBy { it.id }) }
    var customClinicServices by remember { mutableStateOf<List<Pair<String, Double>>>(emptyList()) }

    var resolvedAppointment by remember(targetAppointment?.id) { mutableStateOf(targetAppointment) }
    var existingInvoice by remember { mutableStateOf<BillingInvoice?>(null) }
    var priorVisitsSummary by remember {
        mutableStateOf(
            PaymentLedgerHelper.CombinedBillingSummary(0, 0.0, 0.0, 0.0, emptyList(), emptyList(), "")
        )
    }

    var lineItems by remember { mutableStateOf<List<InvoiceLineItem>>(emptyList()) }
    var manualItemName by remember { mutableStateOf("") }
    var manualItemPrice by remember { mutableStateOf("") }

    var paymentRecords by remember { mutableStateOf<List<PaymentRecord>>(emptyList()) }
    var newPaymentDate by remember { mutableStateOf(today) }
    var newPaymentTime by remember {
        mutableStateOf(
            try {
                java.time.LocalTime.now().format(DateTimeFormatter.ofPattern("hh:mm a"))
            } catch (_: Exception) {
                "12:00 PM"
            }
        )
    }
    var newPaymentAmountInput by remember { mutableStateOf("") }
    var newPaymentNote by remember { mutableStateOf("") }
    var clinicalRemarks by remember { mutableStateOf("") }

    // Load exact appointment, combined sibling visits, catalog, and existing invoice strictly for this specific user
    LaunchedEffect(targetAppointment?.id, targetPatientFallback?.trackingCode10Digit, clinicId) {
        isLoading = true
        try {
            if (clinicRepository != null && loadedClinic == null && clinicId.isNotBlank()) {
                loadedClinic = try {
                    clinicRepository.getClinicById(clinicId)
                } catch (_: Exception) {
                    clinicRepository.getCachedClinicById(clinicId)
                }
            }
            if (doctorRepository != null && doctorsMap.isEmpty() && clinicId.isNotBlank()) {
                try {
                    doctorsMap = doctorRepository.getDoctorsByClinic(clinicId).associateBy { it.id }
                } catch (_: Exception) {}
            }

            val combinedCatalog = mutableListOf<Pair<String, Double>>()
            if (clinicRepository != null && clinicId.isNotBlank()) {
                try {
                    combinedCatalog.addAll(clinicRepository.getClinicServices(clinicId).map { it.serviceName to it.price })
                } catch (_: Exception) {}
            }
            if (billingRepository != null && clinicId.isNotBlank()) {
                try {
                    combinedCatalog.addAll(billingRepository.getCatalog(clinicId).map { it.itemName to it.price })
                } catch (_: Exception) {}
            }
            if (combinedCatalog.isNotEmpty()) {
                customClinicServices = combinedCatalog.distinctBy { it.first.trim().lowercase() }
            }

            // Strictly resolve target appointment for THIS user (never fall back to unrelated appts.first())
            var appt = targetAppointment
            if (appt != null && appointmentRepository != null) {
                try {
                    val fresh = appointmentRepository.getAppointmentById(appt.id)
                    if (fresh != null) appt = fresh
                } catch (_: Exception) {}
            } else if (appt == null && targetPatientFallback != null && appointmentRepository != null) {
                val track = targetPatientFallback.trackingCode10Digit.trim()
                if (track.length == 10) {
                    val byCode = try {
                        appointmentRepository.getAllAppointmentsByTrackingCode(track)
                    } catch (_: Exception) { emptyList() }
                    appt = byCode.filter { clinicId.isBlank() || it.clinicId == clinicId }
                        .maxByOrNull { "${it.appointmentDate}_${it.attemptNumber}_${it.createdAt.orEmpty()}" }
                }
                if (appt == null) {
                    val pool = knownClinicAppointments.ifEmpty {
                        if (clinicId.isNotBlank()) appointmentRepository.getAppointmentsByClinic(clinicId) else emptyList()
                    }
                    val cleanFallbackDigits = targetPatientFallback.patientMobile.filter { it.isDigit() }.takeLast(10)
                    appt = pool.filter { cand ->
                        val candDigits = cand.patientMobile.filter { it.isDigit() }.takeLast(10)
                        val matchPhone = cleanFallbackDigits.length >= 7 && candDigits == cleanFallbackDigits
                        val matchName = cand.patientName.trim().equals(targetPatientFallback.patientName.trim(), ignoreCase = true)
                        matchPhone && matchName
                    }.maxByOrNull { "${it.appointmentDate}_${it.attemptNumber}_${it.createdAt.orEmpty()}" }
                }
            }

            resolvedAppointment = appt

            if (appt != null && billingRepository != null) {
                val tracking = appt.trackingCode10Digit.trim()
                val siblingVisits = if (tracking.isNotBlank()) {
                    val remoteSiblings = try {
                        appointmentRepository?.getAllAppointmentsByTrackingCode(tracking) ?: emptyList()
                    } catch (_: Exception) { emptyList() }
                    (knownClinicAppointments.filter { it.trackingCode10Digit == tracking } + remoteSiblings + listOf(appt))
                        .distinctBy { it.id }
                } else {
                    listOf(appt)
                }
                val siblingInvoices = try {
                    billingRepository.getInvoicesForAppointments(siblingVisits.map { it.id })
                } catch (_: Exception) { emptyMap() }

                val otherVisits = siblingVisits.filter { it.id != appt.id }
                priorVisitsSummary = PaymentLedgerHelper.computeCombinedBillingSummary(
                    visits = otherVisits,
                    invoicesByApptId = siblingInvoices
                )

                val existingInv = siblingInvoices[appt.id] ?: billingRepository.getInvoiceByAppointment(appt.id)
                existingInvoice = existingInv

                val isFollowUp = isFollowUpAppointmentForPopup(appt)
                val opdFee = if (isFollowUp) 0.0 else appt.feeAmount
                val deskCharge = if (isFollowUp) 0.0 else appt.effectiveServiceCharge
                val effectiveBillTotal = if (isFollowUp) 0.0 else appt.effectiveTotalAmount
                val defaultOpdItems = when {
                    isFollowUp -> listOf(InvoiceLineItem(name = "OPD Doctor Consultation (Follow-up)", unitPrice = 0.0, quantity = 1))
                    opdFee > 0.0 && appt.isPayAtDesk && deskCharge > 0.0 -> listOf(
                        InvoiceLineItem(name = "OPD Doctor Consultation", unitPrice = opdFee, quantity = 1),
                        InvoiceLineItem(name = "Pay at Desk Service Charge (5%)", unitPrice = deskCharge, quantity = 1)
                    )
                    opdFee > 0.0 -> listOf(InvoiceLineItem(name = "OPD Doctor Consultation", unitPrice = opdFee, quantity = 1))
                    else -> emptyList()
                }

                if (existingInv != null) {
                    val cleanItems = existingInv.items.filterNot { it.itemName.startsWith("Payment Received", ignoreCase = true) }
                    val mapped = cleanItems.map {
                        val uPrice = if (it.price > 0.0) it.price else if (it.total > 0.0 && it.quantity > 0) it.total / it.quantity else 0.0
                        InvoiceLineItem(name = it.itemName, unitPrice = uPrice, quantity = it.quantity)
                    }
                    lineItems = when {
                        mapped.isNotEmpty() -> mapped
                        !isFollowUp && appt.isPayAtDesk && defaultOpdItems.isNotEmpty() -> defaultOpdItems
                        !isFollowUp && existingInv.totalAmount > 0.0 -> listOf(
                            InvoiceLineItem(name = "OPD Consultation & Clinical Services", unitPrice = existingInv.totalAmount, quantity = 1)
                        )
                        else -> defaultOpdItems
                    }
                    val fallbackAmt = if (isFollowUp) {
                        existingInv.items.filterNot {
                            val n = it.itemName.lowercase()
                            n.contains("consultation") || n.contains("opd doctor") || n.contains("clinical service") || n.contains("follow-up")
                        }.sumOf { it.total }
                    } else {
                        existingInv.effectivePaidAmount
                    }
                    paymentRecords = PaymentLedgerHelper.parsePaymentRecords(
                        rawRemarks = existingInv.remarks,
                        fallbackPaidAmount = fallbackAmt,
                        fallbackDate = existingInv.paidAt
                    )
                    clinicalRemarks = PaymentLedgerHelper.extractCleanClinicalRemarks(existingInv.remarks)
                } else {
                    lineItems = defaultOpdItems
                    val existingApptFee = effectiveBillTotal
                    if (!isFollowUp && appt.paymentStatus.equals("paid", ignoreCase = true) && existingApptFee > 0.0) {
                        val rawStamp = appt.approvedAt?.takeIf { it.isNotBlank() } ?: appt.createdAt?.takeIf { it.isNotBlank() }
                        val payStamp = if (!rawStamp.isNullOrBlank()) {
                            if (rawStamp.length >= 16) rawStamp.substring(0, 16).replace("T", " ") else rawStamp.replace("T", " ")
                        } else {
                            "${appt.appointmentDate} ${appt.appointmentTime.ifBlank { "10:00 AM" }}"
                        }
                        paymentRecords = listOf(
                            PaymentRecord(
                                amount = existingApptFee,
                                dateTime = payStamp,
                                note = if (appt.isPayAtDesk) "Pay at Desk Collection (incl. 5% charge)" else "OPD Consultation Fee"
                            )
                        )
                    } else {
                        paymentRecords = emptyList()
                    }
                    clinicalRemarks = ""
                }
            } else {
                // Zero prior appointments for this directory patient
                priorVisitsSummary = PaymentLedgerHelper.CombinedBillingSummary(0, 0.0, 0.0, 0.0, emptyList(), emptyList(), "")
                existingInvoice = null
                lineItems = emptyList()
                paymentRecords = emptyList()
                clinicalRemarks = ""
            }
        } catch (e: Exception) {
            e.printStackTrace()
        } finally {
            isLoading = false
        }
    }

    val displayPatientName = resolvedAppointment?.patientName?.takeIf { it.isNotBlank() }
        ?: targetPatientFallback?.patientName
        ?: "Patient"
    val displayTrackingCode = resolvedAppointment?.trackingCode10Digit?.takeIf { it.isNotBlank() }
        ?: targetPatientFallback?.trackingCode10Digit
        ?: ""
    val displayVisitMeta = if (resolvedAppointment != null) {
        val docName = resolvedAppointment?.doctorId?.let { doctorsMap[it]?.fullName }
        listOfNotNull(
            displayTrackingCode.takeIf { it.isNotBlank() }?.let { "ID: #$it" },
            resolvedAppointment?.appointmentDate?.takeIf { it.isNotBlank() },
            docName?.takeIf { it.isNotBlank() }
        ).joinToString(" • ")
    } else {
        "Directory Patient (New Billing Visit on Save)"
    }

    val lineItemsSum = lineItems.sumOf { it.total }
    val pendingManualPrice = manualItemPrice.trim().replace(",", "").toDoubleOrNull() ?: 0.0
    val hasPendingManualItem = manualItemName.trim().isNotBlank() && pendingManualPrice > 0.0
    val loggedPaidSum = paymentRecords.sumOf { it.amount }
    val parsedNewPayment = newPaymentAmountInput.toDoubleOrNull() ?: 0.0
    val totalPaidCurrent = loggedPaidSum + parsedNewPayment
    val currentTotalWithPending = lineItemsSum + (if (hasPendingManualItem) pendingManualPrice else 0.0)
    val totalAmountCurrent = if (currentTotalWithPending > 0.0) currentTotalWithPending else totalPaidCurrent

    val combinedTotalAmount = priorVisitsSummary.totalBill + totalAmountCurrent
    val combinedTotalPaid = priorVisitsSummary.totalPaid + totalPaidCurrent
    val combinedBalanceDue = (combinedTotalAmount - combinedTotalPaid).coerceAtLeast(0.0)

    val activeDoctorFee = resolvedAppointment?.let { appt ->
        appt.doctorId?.let { doctorsMap[it]?.consultationFee }?.takeIf { it > 0.0 }
            ?: appt.feeAmount.takeIf { it > 0.0 }
    } ?: targetPatientFallback?.doctorId?.let { doctorsMap[it]?.consultationFee }?.takeIf { it > 0.0 }

    val quickCatalogItems = remember(customClinicServices, activeDoctorFee) {
        val defaultCatalog = buildList {
            if (activeDoctorFee != null && activeDoctorFee > 0.0) {
                add("General OPD Consultation" to activeDoctorFee)
            }
            add("12-Lead ECG Test" to 1000.0)
            add("Complete Blood Count (CBC)" to 650.0)
            add("Digital X-Ray" to 800.0)
            add("Wound Dressing & Care" to 350.0)
            add("Ultrasonography (USG)" to 1500.0)
        }
        val seen = mutableSetOf<String>()
        val result = mutableListOf<Pair<String, Double>>()
        for (item in customClinicServices + defaultCatalog) {
            val k = item.first.trim().lowercase()
            if (k.isNotBlank() && seen.add(k)) result.add(item)
        }
        result
    }

    fun addManualServiceItem() {
        val price = manualItemPrice.trim().replace(",", "").toDoubleOrNull() ?: 0.0
        val name = manualItemName.trim()
        if (name.isNotBlank() && price > 0.0) {
            lineItems = lineItems + InvoiceLineItem(name = name, unitPrice = price, quantity = 1)
            manualItemName = ""
            manualItemPrice = ""
        }
    }

    fun buildPreviewInvoiceForPdf(appt: Appointment): BillingInvoice {
        val cleanName = manualItemName.trim()
        val pendingPrice = manualItemPrice.trim().replace(",", "").toDoubleOrNull() ?: 0.0
        val currItems = if (cleanName.isNotBlank() && pendingPrice > 0.0) {
            lineItems + InvoiceLineItem(name = cleanName, unitPrice = pendingPrice, quantity = 1)
        } else lineItems
        val liveItems = currItems.map { InvoiceItem(itemName = it.name, quantity = it.quantity, price = it.unitPrice, total = it.total) }
        val allCombinedItems = priorVisitsSummary.items + liveItems
        val newAmt = newPaymentAmountInput.toDoubleOrNull() ?: 0.0
        val livePayments = if (newAmt > 0.0) {
            paymentRecords + PaymentRecord(
                amount = newAmt,
                dateTime = "$newPaymentDate $newPaymentTime",
                note = newPaymentNote.ifBlank { "Payment Received" }
            )
        } else paymentRecords
        val allCombinedPayments = priorVisitsSummary.paymentRecords + livePayments
        val tot = allCombinedItems.sumOf { if (it.total > 0.0) it.total else it.price * it.quantity }
            .let { if (it > 0.0) it else combinedTotalAmount }
        val paid = allCombinedPayments.sumOf { it.amount }
        val bal = (tot - paid).coerceAtLeast(0.0)
        val status = if (bal <= 0.0 && tot > 0.0) "paid" else if (paid > 0.0) "partial" else "pending"
        val combinedRem = PaymentLedgerHelper.buildCombinedRemarks(
            cleanRemarks = listOf(priorVisitsSummary.cleanRemarks, PaymentLedgerHelper.extractCleanClinicalRemarks(clinicalRemarks))
                .filter { it.isNotBlank() }.joinToString("\n"),
            paymentRecords = allCombinedPayments
        )
        return (existingInvoice ?: BillingInvoice(
            id = UUID.randomUUID().toString(),
            appointmentId = appt.id,
            clinicId = appt.clinicId.ifBlank { clinicId }
        )).copy(
            trackingCode10Digit = appt.trackingCode10Digit,
            items = allCombinedItems,
            totalAmount = tot,
            paidAmount = paid,
            balanceDue = bal,
            paymentStatus = status,
            remarks = combinedRem
        )
    }

    suspend fun performSaveBill() {
        isSaving = true
        try {
            // Ensure a real Appointment record exists when triggered for a directory-only user
            var finalAppt = resolvedAppointment
            if (finalAppt == null && targetPatientFallback != null && appointmentRepository != null && clinicId.isNotBlank()) {
                finalAppt = appointmentRepository.createCompletedBillingVisit(
                    clinicId = clinicId,
                    patientName = targetPatientFallback.patientName,
                    patientAge = targetPatientFallback.patientAge,
                    patientGender = targetPatientFallback.patientGender,
                    patientMobile = targetPatientFallback.patientMobile,
                    patientEmail = targetPatientFallback.patientEmail,
                    trackingCode = targetPatientFallback.trackingCode10Digit,
                    userId = targetPatientFallback.userId,
                    doctorId = targetPatientFallback.doctorId
                )
            }
            if (finalAppt == null) {
                Toast.makeText(context, "Unable to locate or create patient billing record.", Toast.LENGTH_LONG).show()
                isSaving = false
                showConfirmDialog = false
                return
            }

            val pendingPrice = manualItemPrice.trim().replace(",", "").toDoubleOrNull() ?: 0.0
            val pendingName = manualItemName.trim()
            val currentItems = if (pendingName.isNotBlank() && pendingPrice > 0.0) {
                val flushed = lineItems + InvoiceLineItem(name = pendingName, unitPrice = pendingPrice, quantity = 1)
                lineItems = flushed
                manualItemName = ""
                manualItemPrice = ""
                flushed
            } else lineItems

            val isFollowUp = isFollowUpAppointmentForPopup(finalAppt)
            val opdFee = if (isFollowUp) 0.0 else finalAppt.feeAmount
            val baseItems = currentItems.map {
                InvoiceItem(itemName = it.name, quantity = it.quantity, price = it.unitPrice, total = it.total)
            }
            val itemsToSave = when {
                baseItems.isNotEmpty() -> baseItems
                !isFollowUp && opdFee > 0.0 -> {
                    if (finalAppt.isPayAtDesk && finalAppt.effectiveServiceCharge > 0.0) {
                        listOf(
                            InvoiceItem(itemName = "OPD Doctor Consultation", quantity = 1, price = opdFee, total = opdFee),
                            InvoiceItem(itemName = "Pay at Desk Service Charge (5%)", quantity = 1, price = finalAppt.effectiveServiceCharge, total = finalAppt.effectiveServiceCharge)
                        )
                    } else {
                        listOf(InvoiceItem(itemName = "OPD Doctor Consultation", quantity = 1, price = opdFee, total = opdFee))
                    }
                }
                isFollowUp -> listOf(InvoiceItem(itemName = "OPD Doctor Consultation (Follow-up)", quantity = 1, price = 0.0, total = 0.0))
                else -> {
                    val paidOnly = (paymentRecords.sumOf { it.amount } + (newPaymentAmountInput.toDoubleOrNull() ?: 0.0))
                    if (paidOnly > 0.0) listOf(InvoiceItem(itemName = "Consultation / Service ($newPaymentDate)", quantity = 1, price = paidOnly, total = paidOnly))
                    else emptyList()
                }
            }

            val newAmt = newPaymentAmountInput.toDoubleOrNull() ?: 0.0
            val updatedPayments = if (newAmt > 0.0) {
                paymentRecords + PaymentRecord(
                    amount = newAmt,
                    dateTime = "$newPaymentDate $newPaymentTime",
                    note = newPaymentNote.ifBlank { "Payment Received" }
                )
            } else paymentRecords

            val totalPaidCalc = updatedPayments.sumOf { it.amount }
            val totalItemsCalc = itemsToSave.sumOf { it.total }
            val totalBillCalc = if (totalItemsCalc > 0.0) totalItemsCalc else if (isFollowUp) 0.0 else totalPaidCalc
            val balanceCalc = (totalBillCalc - totalPaidCalc).coerceAtLeast(0.0)
            val statusCalc = when {
                balanceCalc <= 0.0 && totalBillCalc > 0.0 -> "paid"
                totalPaidCalc > 0.0 -> "partial"
                else -> "pending"
            }

            val cleanClinical = PaymentLedgerHelper.extractCleanClinicalRemarks(clinicalRemarks)
            val combinedRemarks = PaymentLedgerHelper.buildCombinedRemarks(cleanClinical, updatedPayments)

            val invoice = BillingInvoice(
                id = existingInvoice?.id ?: UUID.randomUUID().toString(),
                appointmentId = finalAppt.id,
                clinicId = finalAppt.clinicId.ifBlank { clinicId },
                trackingCode10Digit = finalAppt.trackingCode10Digit,
                items = itemsToSave,
                totalAmount = totalBillCalc,
                paidAmount = totalPaidCalc,
                balanceDue = balanceCalc,
                paymentStatus = statusCalc,
                paidAt = java.time.Instant.now().toString(),
                remarks = combinedRemarks
            )

            val saved = billingRepository?.saveInvoice(invoice)
            if (saved != null) {
                val updatedAppt = finalAppt.copy(feeAmount = totalBillCalc, paymentStatus = statusCalc)
                Toast.makeText(context, "✓ Bill pushed for $displayPatientName!", Toast.LENGTH_SHORT).show()
                showConfirmDialog = false
                onBillSaved(updatedAppt, saved)
            } else {
                Toast.makeText(context, "Failed to save bill to server. Check connection and try again.", Toast.LENGTH_LONG).show()
            }
        } catch (e: Exception) {
            e.printStackTrace()
            Toast.makeText(context, "Error pushing bill: ${e.message}", Toast.LENGTH_LONG).show()
        } finally {
            isSaving = false
        }
    }

    // MAIN OVERLAPPING BILLING DIALOG
    Dialog(
        onDismissRequest = { if (!isSaving && !showConfirmDialog) onDismiss() },
        properties = DialogProperties(usePlatformDefaultWidth = false)
    ) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .navigationBarsPadding()
                .padding(horizontal = 14.dp, vertical = 20.dp),
            contentAlignment = Alignment.Center
        ) {
            Surface(
                shape = RoundedCornerShape(22.dp),
                color = Color.White,
                border = BorderStroke(1.dp, Color(0xFFE2E8F0)),
                shadowElevation = 10.dp,
                modifier = Modifier
                    .fillMaxWidth()
                    .widthIn(max = 560.dp)
                    .heightIn(max = 680.dp)
            ) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(16.dp)
                ) {
                    // Header
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.Top
                    ) {
                        Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(6.dp)
                            ) {
                                Text(
                                    text = "Push / Edit Bill",
                                    fontSize = 16.sp,
                                    fontWeight = FontWeight.ExtraBold,
                                    color = Color(0xFF0F172A)
                                )
                                Surface(
                                    shape = RoundedCornerShape(6.dp),
                                    color = Color(0xFFCCFBF1)
                                ) {
                                    Text(
                                        text = if (priorVisitsSummary.visitsCount > 0) "Combined ${priorVisitsSummary.visitsCount + 1} Visits" else "Direct Popup",
                                        fontSize = 10.sp,
                                        fontWeight = FontWeight.Bold,
                                        color = Color(0xFF0F766E),
                                        modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
                                    )
                                }
                            }
                            Text(
                                text = displayPatientName,
                                fontSize = 14.sp,
                                fontWeight = FontWeight.Bold,
                                color = Color(0xFF00796B),
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis
                            )
                            Text(
                                text = displayVisitMeta,
                                fontSize = 11.sp,
                                color = Color(0xFF64748B),
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis
                            )
                        }
                        IconButton(
                            onClick = { if (!isSaving) onDismiss() },
                            modifier = Modifier.size(30.dp)
                        ) {
                            Icon(Icons.Default.Close, contentDescription = "Close", tint = Color(0xFF64748B), modifier = Modifier.size(18.dp))
                        }
                    }

                    Spacer(Modifier.height(10.dp))

                    if (isLoading) {
                        Box(
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(200.dp),
                            contentAlignment = Alignment.Center
                        ) {
                            Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                CircularProgressIndicator(color = Color(0xFF0F766E), modifier = Modifier.size(32.dp), strokeWidth = 3.dp)
                                Text("Loading patient combined ledger...", fontSize = 12.sp, color = Color(0xFF64748B))
                            }
                        }
                    } else {
                        // Combined KPI Summary Strip
                        Surface(
                            shape = RoundedCornerShape(12.dp),
                            color = Color(0xFFF0FDFA),
                            border = BorderStroke(1.dp, Color(0xFF99F6E4)),
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(horizontal = 12.dp, vertical = 9.dp),
                                horizontalArrangement = Arrangement.SpaceBetween
                            ) {
                                Column {
                                    Text(
                                        if (priorVisitsSummary.visitsCount > 0) "Combined Bill (${priorVisitsSummary.visitsCount + 1})" else "Total Bill",
                                        fontSize = 10.sp,
                                        color = Color(0xFF64748B)
                                    )
                                    Text(
                                        CurrencyFormatter.formatNPR(combinedTotalAmount),
                                        fontWeight = FontWeight.ExtraBold,
                                        fontSize = 13.5.sp,
                                        color = Color(0xFF0F172A)
                                    )
                                }
                                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                                    Text("Total Paid", fontSize = 10.sp, color = Color(0xFF64748B))
                                    Text(
                                        CurrencyFormatter.formatNPR(combinedTotalPaid),
                                        fontWeight = FontWeight.ExtraBold,
                                        fontSize = 13.5.sp,
                                        color = Color(0xFF15803D)
                                    )
                                }
                                Column(horizontalAlignment = Alignment.End) {
                                    Text("Remaining Due", fontSize = 10.sp, color = Color(0xFF64748B))
                                    Text(
                                        CurrencyFormatter.formatNPR(combinedBalanceDue),
                                        fontWeight = FontWeight.ExtraBold,
                                        fontSize = 13.5.sp,
                                        color = if (combinedBalanceDue > 0.0) Color(0xFFDC2626) else Color(0xFF15803D)
                                    )
                                }
                            }
                        }

                        Spacer(Modifier.height(10.dp))

                        // Scrollable Body inside Dialog
                        Column(
                            modifier = Modifier
                                .weight(1f, fill = false)
                                .verticalScroll(rememberScrollState()),
                            verticalArrangement = Arrangement.spacedBy(10.dp)
                        ) {
                            // 1-Click Catalog Quick Chips
                            Text("Quick Add from Catalog", fontSize = 11.5.sp, fontWeight = FontWeight.Bold, color = Color(0xFF334155))
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .horizontalScroll(rememberScrollState()),
                                horizontalArrangement = Arrangement.spacedBy(6.dp)
                            ) {
                                quickCatalogItems.forEach { (name, price) ->
                                    AssistChip(
                                        onClick = {
                                            lineItems = lineItems + InvoiceLineItem(name = name, unitPrice = price, quantity = 1)
                                        },
                                        label = { Text("+ $name (Rs. ${price.toInt()})", fontSize = 11.sp) }
                                    )
                                }
                            }

                            // Add Custom Item Row
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.spacedBy(6.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                OutlinedTextField(
                                    value = manualItemName,
                                    onValueChange = { manualItemName = it },
                                    placeholder = { Text("Item / Test Name", fontSize = 11.5.sp) },
                                    singleLine = true,
                                    keyboardOptions = KeyboardOptions(imeAction = ImeAction.Next),
                                    keyboardActions = KeyboardActions(onDone = { addManualServiceItem() }),
                                    modifier = Modifier.weight(2f),
                                    shape = RoundedCornerShape(10.dp)
                                )
                                OutlinedTextField(
                                    value = manualItemPrice,
                                    onValueChange = { input ->
                                        if (input.all { c -> c.isDigit() || c == '.' || c == ',' }) {
                                            manualItemPrice = input
                                        }
                                    },
                                    placeholder = { Text("Rs.", fontSize = 11.5.sp) },
                                    singleLine = true,
                                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number, imeAction = ImeAction.Done),
                                    keyboardActions = KeyboardActions(onDone = { addManualServiceItem() }),
                                    modifier = Modifier.weight(1f),
                                    shape = RoundedCornerShape(10.dp)
                                )
                                Button(
                                    onClick = { addManualServiceItem() },
                                    shape = RoundedCornerShape(10.dp),
                                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF0F766E)),
                                    contentPadding = PaddingValues(horizontal = 10.dp, vertical = 0.dp),
                                    modifier = Modifier.height(48.dp)
                                ) {
                                    Icon(Icons.Default.Add, contentDescription = "Add", modifier = Modifier.size(16.dp))
                                }
                            }

                            // Prior Visits Combined Items (Read-Only)
                            if (priorVisitsSummary.items.isNotEmpty()) {
                                Text(
                                    text = "Prior Visits Items (${priorVisitsSummary.items.size}) • Rs. ${priorVisitsSummary.totalBill.toInt()}",
                                    fontSize = 11.5.sp,
                                    fontWeight = FontWeight.Bold,
                                    color = Color(0xFF0F766E)
                                )
                                priorVisitsSummary.items.forEach { prev ->
                                    Surface(
                                        shape = RoundedCornerShape(8.dp),
                                        color = Color(0xFFF0FDFA),
                                        border = BorderStroke(1.dp, Color(0xFFCCFBF1)),
                                        modifier = Modifier.fillMaxWidth()
                                    ) {
                                        Row(
                                            modifier = Modifier
                                                .fillMaxWidth()
                                                .padding(horizontal = 10.dp, vertical = 6.dp),
                                            horizontalArrangement = Arrangement.SpaceBetween
                                        ) {
                                            Text(prev.itemName, fontSize = 11.5.sp, color = Color(0xFF0F172A), modifier = Modifier.weight(1f))
                                            Text(CurrencyFormatter.formatNPR(prev.effectiveTotal), fontSize = 11.5.sp, fontWeight = FontWeight.Bold, color = Color(0xFF0F766E))
                                        }
                                    }
                                }
                            }

                            // Current Visit Line Items
                            if (lineItems.isNotEmpty()) {
                                Text("Current Visit Items (${lineItems.size})", fontSize = 11.5.sp, fontWeight = FontWeight.Bold, color = Color(0xFF334155))
                                lineItems.forEachIndexed { idx, item ->
                                    Surface(
                                        shape = RoundedCornerShape(8.dp),
                                        color = Color(0xFFF8FAFC),
                                        border = BorderStroke(1.dp, Color(0xFFE2E8F0)),
                                        modifier = Modifier.fillMaxWidth()
                                    ) {
                                        Row(
                                            modifier = Modifier
                                                .fillMaxWidth()
                                                .padding(horizontal = 10.dp, vertical = 6.dp),
                                            horizontalArrangement = Arrangement.SpaceBetween,
                                            verticalAlignment = Alignment.CenterVertically
                                        ) {
                                            Column(modifier = Modifier.weight(1f)) {
                                                Text(item.name, fontSize = 12.sp, fontWeight = FontWeight.SemiBold, color = Color(0xFF0F172A))
                                                Text("Rs. ${item.unitPrice.toInt()} × ${item.quantity}", fontSize = 10.5.sp, color = Color(0xFF64748B))
                                            }
                                            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                                Text(CurrencyFormatter.formatNPR(item.total), fontSize = 12.sp, fontWeight = FontWeight.Bold, color = Color(0xFF0F766E))
                                                IconButton(
                                                    onClick = { lineItems = lineItems.filterIndexed { i, _ -> i != idx } },
                                                    modifier = Modifier.size(22.dp)
                                                ) {
                                                    Icon(Icons.Default.Delete, contentDescription = "Remove", tint = Color(0xFFEF4444), modifier = Modifier.size(15.dp))
                                                }
                                            }
                                        }
                                    }
                                }
                            }

                            // Prior & Current Payment Log
                            if (priorVisitsSummary.paymentRecords.isNotEmpty() || paymentRecords.isNotEmpty()) {
                                Text("Recorded Payments", fontSize = 11.5.sp, fontWeight = FontWeight.Bold, color = Color(0xFF15803D))
                                priorVisitsSummary.paymentRecords.forEach { prevPay ->
                                    Surface(
                                        shape = RoundedCornerShape(8.dp),
                                        color = Color(0xFFF0FDF4),
                                        border = BorderStroke(1.dp, Color(0xFFBBF7D0)),
                                        modifier = Modifier.fillMaxWidth()
                                    ) {
                                        Row(
                                            modifier = Modifier
                                                .fillMaxWidth()
                                                .padding(horizontal = 10.dp, vertical = 5.dp),
                                            horizontalArrangement = Arrangement.SpaceBetween
                                        ) {
                                            Text("${prevPay.dateTime} • ${prevPay.note ?: "Prior"}", fontSize = 11.sp, color = Color(0xFF15803D), modifier = Modifier.weight(1f))
                                            Text("Rs. ${prevPay.amount.toInt()}", fontSize = 11.5.sp, fontWeight = FontWeight.Bold, color = Color(0xFF15803D))
                                        }
                                    }
                                }
                                paymentRecords.forEach { rec ->
                                    Surface(
                                        shape = RoundedCornerShape(8.dp),
                                        color = Color(0xFFF0FDF4),
                                        border = BorderStroke(1.dp, Color(0xFFBBF7D0)),
                                        modifier = Modifier.fillMaxWidth()
                                    ) {
                                        Row(
                                            modifier = Modifier
                                                .fillMaxWidth()
                                                .padding(horizontal = 10.dp, vertical = 5.dp),
                                            horizontalArrangement = Arrangement.SpaceBetween,
                                            verticalAlignment = Alignment.CenterVertically
                                        ) {
                                            Text("${rec.dateTime} • ${rec.note ?: "Paid"}", fontSize = 11.sp, color = Color(0xFF0F172A), modifier = Modifier.weight(1f))
                                            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                                                Text("Rs. ${rec.amount.toInt()}", fontSize = 11.5.sp, fontWeight = FontWeight.Bold, color = Color(0xFF15803D))
                                                IconButton(
                                                    onClick = { paymentRecords = paymentRecords.filter { it.id != rec.id } },
                                                    modifier = Modifier.size(20.dp)
                                                ) {
                                                    Icon(Icons.Default.Close, contentDescription = "Delete log", tint = Color(0xFF94A3B8), modifier = Modifier.size(13.dp))
                                                }
                                            }
                                        }
                                    }
                                }
                            }

                            // Record New Payment Section
                            Surface(
                                shape = RoundedCornerShape(12.dp),
                                color = Color(0xFFF8FAFC),
                                border = BorderStroke(1.dp, Color(0xFFBAE6FD)),
                                modifier = Modifier.fillMaxWidth()
                            ) {
                                Column(
                                    modifier = Modifier.padding(10.dp),
                                    verticalArrangement = Arrangement.spacedBy(6.dp)
                                ) {
                                    Row(
                                        modifier = Modifier.fillMaxWidth(),
                                        horizontalArrangement = Arrangement.SpaceBetween,
                                        verticalAlignment = Alignment.CenterVertically
                                    ) {
                                        Text("Record Payment Now", fontSize = 11.5.sp, fontWeight = FontWeight.Bold, color = Color(0xFF0369A1))
                                        val unpaidBeforeInput = (combinedTotalAmount - (priorVisitsSummary.totalPaid + loggedPaidSum)).coerceAtLeast(0.0)
                                        if (unpaidBeforeInput > 0.0) {
                                            AssistChip(
                                                onClick = { newPaymentAmountInput = unpaidBeforeInput.toInt().toString() },
                                                label = { Text("Clear Due (Rs. ${unpaidBeforeInput.toInt()})", fontSize = 10.5.sp, fontWeight = FontWeight.Bold) }
                                            )
                                        }
                                    }
                                    Row(
                                        modifier = Modifier.fillMaxWidth(),
                                        horizontalArrangement = Arrangement.spacedBy(6.dp)
                                    ) {
                                        OutlinedTextField(
                                            value = newPaymentAmountInput,
                                            onValueChange = { if (it.all { c -> c.isDigit() || c == '.' }) newPaymentAmountInput = it },
                                            label = { Text("Amount (Rs.)", fontSize = 11.sp) },
                                            singleLine = true,
                                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                                            modifier = Modifier.weight(1f),
                                            shape = RoundedCornerShape(10.dp)
                                        )
                                        OutlinedTextField(
                                            value = newPaymentNote,
                                            onValueChange = { newPaymentNote = it },
                                            label = { Text("Mode / Note", fontSize = 11.sp) },
                                            placeholder = { Text("Cash / eSewa", fontSize = 11.sp) },
                                            singleLine = true,
                                            modifier = Modifier.weight(1.3f),
                                            shape = RoundedCornerShape(10.dp)
                                        )
                                    }
                                }
                            }

                            // Clinical Remarks
                            OutlinedTextField(
                                value = clinicalRemarks,
                                onValueChange = { clinicalRemarks = it },
                                label = { Text("Clinical Remarks / Prescriptions", fontSize = 11.5.sp) },
                                singleLine = false,
                                minLines = 2,
                                maxLines = 3,
                                modifier = Modifier.fillMaxWidth(),
                                shape = RoundedCornerShape(10.dp)
                            )
                        }

                        Spacer(Modifier.height(12.dp))

                        // Dialog Footer Actions: Cancel | PDF | Push / Update Bill
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            OutlinedButton(
                                onClick = { if (!isSaving) onDismiss() },
                                shape = RoundedCornerShape(10.dp),
                                enabled = !isSaving,
                                contentPadding = PaddingValues(horizontal = 12.dp, vertical = 10.dp)
                            ) {
                                Text("Cancel", fontSize = 12.sp, fontWeight = FontWeight.SemiBold, color = Color(0xFF475569))
                            }

                            if (resolvedAppointment != null) {
                                OutlinedButton(
                                    onClick = {
                                        val appt = resolvedAppointment ?: return@OutlinedButton
                                        val invPdf = buildPreviewInvoiceForPdf(appt)
                                        val assignedDoc = appt.doctorId?.let { doctorsMap[it]?.fullName } ?: "Attending Physician"
                                        BillPdfDownloader.downloadBillPdf(
                                            context = context,
                                            appointment = appt,
                                            invoice = invPdf,
                                            clinicName = loadedClinic?.name ?: "Dactor Medical Clinic",
                                            clinicAddress = loadedClinic?.addressText ?: "Nepal",
                                            doctorName = assignedDoc,
                                            clinicalRemarks = invPdf.remarks
                                        )
                                    },
                                    shape = RoundedCornerShape(10.dp),
                                    border = BorderStroke(1.dp, Color(0xFF0F766E)),
                                    contentPadding = PaddingValues(horizontal = 10.dp, vertical = 10.dp)
                                ) {
                                    Icon(Icons.Default.Download, contentDescription = null, tint = Color(0xFF0F766E), modifier = Modifier.size(15.dp))
                                    Spacer(Modifier.width(4.dp))
                                    Text("PDF", fontSize = 12.sp, fontWeight = FontWeight.Bold, color = Color(0xFF0F766E))
                                }
                            }

                            Button(
                                onClick = { showConfirmDialog = true },
                                enabled = !isSaving,
                                shape = RoundedCornerShape(10.dp),
                                colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF0F766E)),
                                contentPadding = PaddingValues(horizontal = 12.dp, vertical = 10.dp),
                                modifier = Modifier.weight(1f)
                            ) {
                                Icon(Icons.Default.ReceiptLong, contentDescription = null, tint = Color.White, modifier = Modifier.size(15.dp))
                                Spacer(Modifier.width(5.dp))
                                Text(
                                    text = "Push / Update Bill",
                                    fontSize = 12.5.sp,
                                    fontWeight = FontWeight.Bold,
                                    color = Color.White,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis
                                )
                            }
                        }
                    }
                }
            }
        }
    }

    // NESTED OVERLAPPING CONFIRM / CANCEL DIALOG
    if (showConfirmDialog) {
        AlertDialog(
            onDismissRequest = { if (!isSaving) showConfirmDialog = false },
            icon = {
                Icon(
                    Icons.Default.CheckCircle,
                    contentDescription = null,
                    tint = Color(0xFF0F766E),
                    modifier = Modifier.size(34.dp)
                )
            },
            title = {
                Text(
                    text = "Confirm Push / Update Bill",
                    fontWeight = FontWeight.Bold,
                    fontSize = 17.sp,
                    color = Color(0xFF0F172A)
                )
            },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(
                        text = "Push this updated bill directly to $displayPatientName's records?",
                        fontSize = 13.sp,
                        color = Color(0xFF334155)
                    )
                    Surface(
                        shape = RoundedCornerShape(10.dp),
                        color = Color(0xFFF0FDFA),
                        border = BorderStroke(1.dp, Color(0xFF99F6E4)),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Column(
                            modifier = Modifier.padding(10.dp),
                            verticalArrangement = Arrangement.spacedBy(3.dp)
                        ) {
                            Text(
                                text = "Total Bill: ${CurrencyFormatter.formatNPR(combinedTotalAmount)}",
                                fontSize = 12.5.sp,
                                fontWeight = FontWeight.Bold,
                                color = Color(0xFF0F172A)
                            )
                            Text(
                                text = "Total Paid: ${CurrencyFormatter.formatNPR(combinedTotalPaid)}",
                                fontSize = 12.sp,
                                fontWeight = FontWeight.SemiBold,
                                color = Color(0xFF15803D)
                            )
                            Text(
                                text = "Remaining Due: ${CurrencyFormatter.formatNPR(combinedBalanceDue)}",
                                fontSize = 12.sp,
                                fontWeight = FontWeight.Bold,
                                color = if (combinedBalanceDue > 0.0) Color(0xFFDC2626) else Color(0xFF15803D)
                            )
                        }
                    }
                }
            },
            confirmButton = {
                Button(
                    onClick = {
                        coroutineScope.launch { performSaveBill() }
                    },
                    enabled = !isSaving,
                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF0F766E)),
                    shape = RoundedCornerShape(8.dp)
                ) {
                    if (isSaving) {
                        CircularProgressIndicator(color = Color.White, modifier = Modifier.size(16.dp), strokeWidth = 2.dp)
                        Spacer(Modifier.width(6.dp))
                        Text("Saving...", fontWeight = FontWeight.Bold, color = Color.White)
                    } else {
                        Text("Confirm", fontWeight = FontWeight.Bold, color = Color.White)
                    }
                }
            },
            dismissButton = {
                TextButton(
                    onClick = { showConfirmDialog = false },
                    enabled = !isSaving
                ) {
                    Text("Cancel", fontWeight = FontWeight.SemiBold, color = Color(0xFF64748B))
                }
            },
            containerColor = Color.White,
            shape = RoundedCornerShape(16.dp)
        )
    }
}
