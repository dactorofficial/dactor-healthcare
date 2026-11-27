package com.dactor.clinic.ui.billing

import android.app.DatePickerDialog
import android.content.Intent
import android.net.Uri
import android.widget.Toast
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.dactor.clinic.data.model.*
import com.dactor.clinic.domain.util.BillPdfDownloader
import com.dactor.clinic.domain.util.CurrencyFormatter
import com.dactor.clinic.domain.util.PaymentLedgerHelper
import java.text.SimpleDateFormat
import java.time.Instant
import java.time.ZoneId
import java.util.Calendar
import java.util.Date
import java.util.Locale

internal sealed interface PaymentDetailTarget {
    val appointmentId: String?
    val invoiceId: String?
    val trackingCode: String
    val patientName: String
    val patientPhone: String
    val doctorName: String
    val testNames: List<String>
    val visitType: String
    val dateTimeLabel: String
    val balanceDue: Double

    data class FromLog(val entry: UnifiedPaymentLogEntry) : PaymentDetailTarget {
        override val appointmentId: String? get() = entry.appointmentId
        override val invoiceId: String? get() = entry.invoiceId
        override val trackingCode: String get() = entry.trackingCode10Digit ?: "\u2013"
        override val patientName: String get() = entry.patientName
        override val patientPhone: String get() = entry.patientPhone
        override val doctorName: String get() = entry.doctorName
        override val testNames: List<String> get() = entry.testNames
        override val visitType: String get() = entry.visitType
        override val dateTimeLabel: String get() = PaymentLedgerHelper.formatDisplayDateTime(entry.dateTime)
        override val balanceDue: Double get() = entry.balanceDue
    }

    data class FromPending(val bill: PendingBillEntry) : PaymentDetailTarget {
        override val appointmentId: String get() = bill.appointmentId
        override val invoiceId: String? get() = bill.invoiceId
        override val trackingCode: String get() = bill.trackingCode10Digit
        override val patientName: String get() = bill.patientName
        override val patientPhone: String get() = bill.patientPhone
        override val doctorName: String get() = bill.doctorName
        override val testNames: List<String> get() = bill.testNames
        override val visitType: String get() = bill.visitType
        override val dateTimeLabel: String
            get() = PaymentLedgerHelper.formatDisplayDateTime("${bill.visitDate} ${bill.visitTime}".trim())
        override val balanceDue: Double get() = bill.balanceDue
    }
}

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
internal fun PaymentFiltersBottomSheet(
    isPendingTab: Boolean,
    isLabClinic: Boolean,
    availableMethods: List<Pair<String, String>>,
    doctors: List<Doctor>,
    availableTests: List<String>,
    selectedMethod: String,
    selectedVisitType: String,
    selectedDoctorId: String,
    selectedTestName: String,
    selectedPendingStatus: String,
    matchingCount: Int,
    onSelectMethod: (String) -> Unit,
    onSelectVisitType: (String) -> Unit,
    onSelectDoctor: (String) -> Unit,
    onSelectTest: (String) -> Unit,
    onSelectPendingStatus: (String) -> Unit,
    onReset: () -> Unit,
    onDismiss: () -> Unit
) {
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = sheetState,
        containerColor = MaterialTheme.colorScheme.surface
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 20.dp)
                .padding(bottom = 28.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text("Filters", fontSize = 18.sp, fontWeight = FontWeight.Bold)
                TextButton(onClick = onReset) {
                    Text("Reset", color = Color(0xFF0D9488), fontWeight = FontWeight.SemiBold)
                }
            }

            HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)

            // Payment method
            Text("Payment method", fontSize = 13.sp, fontWeight = FontWeight.SemiBold, color = MaterialTheme.colorScheme.onSurfaceVariant)
            FlowRow(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalArrangement = Arrangement.spacedBy(6.dp)
            ) {
                availableMethods.forEach { (key, label) ->
                    FilterChip(
                        selected = selectedMethod.equals(key, ignoreCase = true),
                        onClick = { onSelectMethod(key) },
                        label = { Text(label, fontSize = 12.sp) },
                        colors = FilterChipDefaults.filterChipColors(
                            selectedContainerColor = Color(0xFF0D9488),
                            selectedLabelColor = Color.White
                        )
                    )
                }
            }

            // Visit type (OPD only)
            if (!isLabClinic) {
                Text("Visit type", fontSize = 13.sp, fontWeight = FontWeight.SemiBold, color = MaterialTheme.colorScheme.onSurfaceVariant)
                FlowRow(
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    listOf("all" to "All", "new" to "New", "follow_up" to "Follow-up").forEach { (key, label) ->
                        FilterChip(
                            selected = selectedVisitType == key,
                            onClick = { onSelectVisitType(key) },
                            label = { Text(label, fontSize = 12.sp) },
                            colors = FilterChipDefaults.filterChipColors(
                                selectedContainerColor = Color(0xFF0D9488),
                                selectedLabelColor = Color.White
                            )
                        )
                    }
                }
            }

            // Doctor (OPD) or Tests (Lab)
            if (!isLabClinic && doctors.isNotEmpty()) {
                Text("Doctor", fontSize = 13.sp, fontWeight = FontWeight.SemiBold, color = MaterialTheme.colorScheme.onSurfaceVariant)
                FlowRow(
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    FilterChip(
                        selected = selectedDoctorId == "all",
                        onClick = { onSelectDoctor("all") },
                        label = { Text("All doctors", fontSize = 12.sp) },
                        colors = FilterChipDefaults.filterChipColors(
                            selectedContainerColor = Color(0xFF0D9488),
                            selectedLabelColor = Color.White
                        )
                    )
                    doctors.forEach { doc ->
                        val label = PaymentLedgerHelper.formatDoctorDisplayName(doc.fullName).ifBlank { doc.fullName }
                        FilterChip(
                            selected = selectedDoctorId == doc.id,
                            onClick = { onSelectDoctor(doc.id) },
                            label = { Text(label, fontSize = 12.sp) },
                            colors = FilterChipDefaults.filterChipColors(
                                selectedContainerColor = Color(0xFF0D9488),
                                selectedLabelColor = Color.White
                            )
                        )
                    }
                }
            } else if (isLabClinic && availableTests.isNotEmpty()) {
                Text("Tests", fontSize = 13.sp, fontWeight = FontWeight.SemiBold, color = MaterialTheme.colorScheme.onSurfaceVariant)
                FlowRow(
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    FilterChip(
                        selected = selectedTestName == "all",
                        onClick = { onSelectTest("all") },
                        label = { Text("All tests", fontSize = 12.sp) },
                        colors = FilterChipDefaults.filterChipColors(
                            selectedContainerColor = Color(0xFF0D9488),
                            selectedLabelColor = Color.White
                        )
                    )
                    availableTests.forEach { testName ->
                        FilterChip(
                            selected = selectedTestName.equals(testName, ignoreCase = true),
                            onClick = { onSelectTest(testName) },
                            label = { Text(testName, fontSize = 12.sp) },
                            colors = FilterChipDefaults.filterChipColors(
                                selectedContainerColor = Color(0xFF0D9488),
                                selectedLabelColor = Color.White
                            )
                        )
                    }
                }
            }

            // Status (Pending tab only)
            if (isPendingTab) {
                Text("Status", fontSize = 13.sp, fontWeight = FontWeight.SemiBold, color = MaterialTheme.colorScheme.onSurfaceVariant)
                FlowRow(
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    listOf("all" to "All", "unpaid" to "Unpaid", "partial" to "Partly paid").forEach { (key, label) ->
                        FilterChip(
                            selected = selectedPendingStatus == key,
                            onClick = { onSelectPendingStatus(key) },
                            label = { Text(label, fontSize = 12.sp) },
                            colors = FilterChipDefaults.filterChipColors(
                                selectedContainerColor = Color(0xFF0D9488),
                                selectedLabelColor = Color.White
                            )
                        )
                    }
                }
            }

            HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)

            Button(
                onClick = onDismiss,
                modifier = Modifier
                    .fillMaxWidth()
                    .height(48.dp),
                shape = RoundedCornerShape(12.dp),
                colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF0D9488))
            ) {
                Text("Show $matchingCount results", fontWeight = FontWeight.Bold, fontSize = 14.sp, color = Color.White)
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun PaymentDetailBottomSheet(
    target: PaymentDetailTarget,
    isLabClinic: Boolean,
    clinicObj: Clinic?,
    appointments: List<Appointment>,
    invoices: List<BillingInvoice>,
    allLogs: List<UnifiedPaymentLogEntry>,
    doctors: List<Doctor>,
    clinicServices: List<ClinicService>,
    onCollectBalance: (Appointment, Double) -> Unit,
    onOpenAppointment: (Appointment) -> Unit,
    onDismiss: () -> Unit
) {
    val context = LocalContext.current
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)

    val appt = target.appointmentId?.let { id -> appointments.find { it.id == id } }
    val inv = invoices.find {
        (target.invoiceId != null && it.id == target.invoiceId) ||
            (target.appointmentId != null && it.appointmentId == target.appointmentId)
    }

    val billItems = remember(appt, inv, clinicServices, isLabClinic) {
        val raw = inv?.items?.filterNot { it.itemName.startsWith("Payment Received", ignoreCase = true) } ?: emptyList()
        when {
            raw.isNotEmpty() -> raw
            isLabClinic -> PaymentLedgerHelper.parseLabTestItems(appt, inv, clinicServices).map { (name, price) ->
                InvoiceItem(itemName = name, quantity = 1, price = price, total = price)
            }
            appt != null -> {
                val baseFee = appt.feeAmount
                val items = mutableListOf<InvoiceItem>()
                if (baseFee > 0.0) {
                    items.add(InvoiceItem("OPD Consultation", 1, baseFee, baseFee))
                } else {
                    items.add(InvoiceItem("Follow-up Consultation", 1, 0.0, 0.0))
                }
                if (appt.isPayAtDesk && appt.effectiveServiceCharge > 0.0) {
                    items.add(InvoiceItem("Pay at Desk Charge (5%)", 1, appt.effectiveServiceCharge, appt.effectiveServiceCharge))
                }
                items
            }
            else -> emptyList()
        }
    }

    val billTotal = when {
        inv != null && inv.totalAmount > 0.0 -> {
            if (appt?.isPayAtDesk == true) maxOf(inv.totalAmount, appt.effectiveTotalAmount) else inv.totalAmount
        }
        appt != null -> appt.effectiveTotalAmount
        target is PaymentDetailTarget.FromPending -> target.bill.totalAmount
        target is PaymentDetailTarget.FromLog -> target.entry.totalBill
        else -> 0.0
    }

    val billPayments = remember(allLogs, target) {
        allLogs.filter { log ->
            (target.appointmentId != null && log.appointmentId == target.appointmentId) ||
                (target.invoiceId != null && log.invoiceId == target.invoiceId)
        }.sortedBy { it.dateTime }
    }

    val paidTotal = when {
        billPayments.isNotEmpty() -> billPayments.sumOf { it.amount }
        inv != null -> inv.effectivePaidAmount
        target is PaymentDetailTarget.FromPending -> target.bill.paidAmount
        target is PaymentDetailTarget.FromLog -> target.entry.amount
        else -> 0.0
    }
    val balanceDue = when {
        inv != null && inv.paymentStatus.equals("paid", ignoreCase = true) && inv.balanceDue <= 0.01 -> 0.0
        else -> (billTotal - paidTotal).coerceAtLeast(target.balanceDue).coerceAtLeast(0.0)
    }

    val cleanRemarks = remember(inv, appt) {
        PaymentLedgerHelper.extractCleanClinicalRemarks(inv?.remarks)
            .ifBlank { appt?.notes?.takeIf { !it.startsWith("Lab Tests:", ignoreCase = true) } ?: "" }
    }

    val followUpOrigin = remember(appt, appointments) {
        appt?.followUpOfAppointmentId?.let { origId -> appointments.find { it.id == origId } }
    }
    val cleanDoctorLabel = PaymentLedgerHelper.formatDoctorDisplayName(
        target.doctorName.ifBlank { appt?.doctorId?.let { id -> doctors.find { it.id == id }?.fullName } }
    )
    val badgeLabel = when {
        isLabClinic -> null
        target.visitType == "new" -> "NEW"
        target.visitType == "follow_up" -> "FOLLOW-UP"
        else -> null
    }
    val subheadParts = listOfNotNull(
        "#${target.trackingCode}",
        badgeLabel,
        target.dateTimeLabel
    ).joinToString(" \u00B7 ")

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = sheetState,
        containerColor = MaterialTheme.colorScheme.surface
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 20.dp)
                .padding(bottom = 28.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.Top
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = target.patientName,
                        fontSize = 18.sp,
                        fontWeight = FontWeight.Bold,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                    Spacer(modifier = Modifier.height(2.dp))
                    Text(
                        text = subheadParts,
                        fontSize = 12.sp,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
                IconButton(onClick = onDismiss, modifier = Modifier.size(32.dp)) {
                    Icon(Icons.Default.Close, contentDescription = "Close")
                }
            }

            HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)

            // Bill breakdown
            Text("Bill", fontSize = 12.sp, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Surface(
                shape = RoundedCornerShape(12.dp),
                color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.35f),
                border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant)
            ) {
                Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    if (billItems.isEmpty()) {
                        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                            Text("Bill total", fontSize = 13.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            Text(CurrencyFormatter.formatNPR(billTotal), fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
                        }
                    } else {
                        billItems.forEach { item ->
                            val rowAmt = if (item.total > 0.0) item.total else item.price * item.quantity
                            val qtyLabel = if (item.quantity > 1) " x${item.quantity}" else ""
                            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                Text(
                                    "${item.itemName}$qtyLabel",
                                    fontSize = 13.sp,
                                    modifier = Modifier.weight(1f).padding(end = 8.dp),
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis
                                )
                                Text(CurrencyFormatter.formatNPR(rowAmt), fontSize = 13.sp, fontWeight = FontWeight.Medium)
                            }
                        }
                    }
                    HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
                    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        Text("Total", fontSize = 13.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        Text(CurrencyFormatter.formatNPR(billTotal), fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
                    }
                    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        Text("Paid", fontSize = 13.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        Text(CurrencyFormatter.formatNPR(paidTotal), fontSize = 13.sp, fontWeight = FontWeight.Bold, color = Color(0xFF047857))
                    }
                    if (balanceDue > 0.01) {
                        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                            Text("Balance due", fontSize = 13.sp, fontWeight = FontWeight.Bold, color = Color(0xFFB45309))
                            Text(CurrencyFormatter.formatNPR(balanceDue), fontSize = 14.sp, fontWeight = FontWeight.Bold, color = Color(0xFFB45309))
                        }
                    }
                }
            }

            // Payments list
            if (billPayments.isNotEmpty()) {
                Text("Payments", fontSize = 12.sp, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    billPayments.forEach { p ->
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text(
                                text = "${PaymentLedgerHelper.formatShortDateTime(p.dateTime)} \u00B7 ${formatMethodDisplayName(p.paymentMethod)}",
                                fontSize = 12.5.sp,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                            Text(
                                text = if (p.amount == 0.0) "Free" else CurrencyFormatter.formatNPR(p.amount),
                                fontSize = 13.sp,
                                fontWeight = FontWeight.Bold,
                                color = when {
                                    p.isRefund || p.amount < 0 -> Color(0xFFBE123C)
                                    p.amount == 0.0 -> Color(0xFF2563EB)
                                    else -> Color(0xFF047857)
                                }
                            )
                        }
                    }
                }
            }

            // Visit metadata
            val hasVisitMeta = (!isLabClinic && cleanDoctorLabel.isNotBlank()) ||
                (isLabClinic && target.testNames.isNotEmpty()) ||
                followUpOrigin != null
            if (hasVisitMeta) {
                Text("Visit", fontSize = 12.sp, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    if (!isLabClinic && cleanDoctorLabel.isNotBlank()) {
                        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                            Text("Doctor", fontSize = 13.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            Text(cleanDoctorLabel, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
                        }
                    }
                    if (isLabClinic && target.testNames.isNotEmpty()) {
                        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                            Text("Tests", fontSize = 13.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            Text(
                                target.testNames.joinToString(", "),
                                fontSize = 13.sp,
                                fontWeight = FontWeight.SemiBold,
                                modifier = Modifier.weight(1f, fill = false).padding(start = 12.dp),
                                maxLines = 2,
                                overflow = TextOverflow.Ellipsis
                            )
                        }
                    }
                    if (followUpOrigin != null) {
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clip(RoundedCornerShape(8.dp))
                                .clickable { onOpenAppointment(followUpOrigin) }
                                .padding(vertical = 4.dp),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text("Follow-up of", fontSize = 13.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Text(
                                    "#${followUpOrigin.trackingCode10Digit}",
                                    fontSize = 13.sp,
                                    fontWeight = FontWeight.Bold,
                                    color = Color(0xFF0D9488)
                                )
                                Icon(
                                    Icons.Default.ChevronRight,
                                    contentDescription = null,
                                    tint = Color(0xFF0D9488),
                                    modifier = Modifier.size(18.dp)
                                )
                            }
                        }
                    }
                }
            }

            // Clinical remarks
            if (cleanRemarks.isNotBlank()) {
                Text("Remarks", fontSize = 12.sp, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Text(cleanRemarks, fontSize = 13.sp, color = MaterialTheme.colorScheme.onSurface)
            }

            HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)

            // Action buttons
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                if (balanceDue > 0.01 && appt != null) {
                    Button(
                        onClick = { onCollectBalance(appt, balanceDue) },
                        modifier = Modifier.weight(1f),
                        shape = RoundedCornerShape(10.dp),
                        colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF0D9488))
                    ) {
                        Text("Collect balance", fontSize = 12.5.sp, fontWeight = FontWeight.Bold, maxLines = 1)
                    }
                }
                if (appt != null) {
                    OutlinedButton(
                        onClick = {
                            BillPdfDownloader.downloadBillPdf(
                                context = context,
                                appointment = appt,
                                invoice = inv,
                                clinicName = clinicObj?.name ?: "Dactor Partner Clinic",
                                clinicAddress = clinicObj?.addressText ?: "Kathmandu, Nepal",
                                doctorName = if (isLabClinic) "" else cleanDoctorLabel
                            )
                        },
                        modifier = Modifier.weight(1f),
                        shape = RoundedCornerShape(10.dp)
                    ) {
                        Icon(Icons.Default.PictureAsPdf, contentDescription = null, modifier = Modifier.size(16.dp), tint = Color(0xFFDC2626))
                        Spacer(modifier = Modifier.width(4.dp))
                        Text("View bill PDF", fontSize = 12.5.sp, maxLines = 1)
                    }
                }
                if (target.patientPhone.isNotBlank()) {
                    OutlinedButton(
                        onClick = {
                            try {
                                val dialIntent = Intent(Intent.ACTION_DIAL, Uri.parse("tel:${target.patientPhone}"))
                                context.startActivity(dialIntent)
                            } catch (_: Exception) {
                                Toast.makeText(context, "Unable to open phone dialer", Toast.LENGTH_SHORT).show()
                            }
                        },
                        shape = RoundedCornerShape(10.dp)
                    ) {
                        Icon(Icons.Default.Call, contentDescription = "Call patient", modifier = Modifier.size(16.dp), tint = Color(0xFF0D9488))
                        Spacer(modifier = Modifier.width(4.dp))
                        Text("Call", fontSize = 12.5.sp)
                    }
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun ExportSummaryBottomSheet(
    periodLabel: String,
    onExportCsv: () -> Unit,
    onExportPdf: () -> Unit,
    onDismiss: () -> Unit
) {
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        containerColor = MaterialTheme.colorScheme.surface
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 20.dp)
                .padding(bottom = 28.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            Text("Export Summary", fontSize = 17.sp, fontWeight = FontWeight.Bold)
            Text(periodLabel, fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Spacer(modifier = Modifier.height(4.dp))

            OutlinedCard(
                onClick = {
                    onDismiss()
                    onExportCsv()
                },
                shape = RoundedCornerShape(12.dp),
                border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant)
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(14.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    Icon(Icons.Default.TableChart, contentDescription = null, tint = Color(0xFF0D9488))
                    Column(modifier = Modifier.weight(1f)) {
                        Text("Export CSV Ledger", fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
                        Text("Spreadsheet-ready ledger with expenses & fees", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    Icon(Icons.Default.ChevronRight, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }

            OutlinedCard(
                onClick = {
                    onDismiss()
                    onExportPdf()
                },
                shape = RoundedCornerShape(12.dp),
                border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant)
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(14.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    Icon(Icons.Default.PictureAsPdf, contentDescription = null, tint = Color(0xFFDC2626))
                    Column(modifier = Modifier.weight(1f)) {
                        Text("Share / Download PDF Summary", fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
                        Text("Formatted A4 financial statement for this period", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    Icon(Icons.Default.ChevronRight, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun CustomDateRangePickerDialog(
    initialStartDate: String,
    initialEndDate: String,
    onConfirmRange: (String, String) -> Unit,
    onDismiss: () -> Unit
) {
    val sdf = remember { SimpleDateFormat("yyyy-MM-dd", Locale.US) }
    val initStartMillis = remember(initialStartDate) {
        try { sdf.parse(initialStartDate)?.time } catch (_: Exception) { null }
    }
    val initEndMillis = remember(initialEndDate) {
        try { sdf.parse(initialEndDate)?.time } catch (_: Exception) { null }
    }
    val state = rememberDateRangePickerState(
        initialSelectedStartDateMillis = initStartMillis,
        initialSelectedEndDateMillis = initEndMillis
    )

    DatePickerDialog(
        onDismissRequest = onDismiss,
        confirmButton = {
            Button(
                onClick = {
                    val startMs = state.selectedStartDateMillis
                    val endMs = state.selectedEndDateMillis ?: startMs
                    if (startMs != null && endMs != null) {
                        val s = Instant.ofEpochMilli(startMs).atZone(ZoneId.of("UTC")).toLocalDate().toString()
                        val e = Instant.ofEpochMilli(endMs).atZone(ZoneId.of("UTC")).toLocalDate().toString()
                        onConfirmRange(minOf(s, e), maxOf(s, e))
                    } else {
                        onDismiss()
                    }
                },
                colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF0D9488))
            ) {
                Text("Apply", fontWeight = FontWeight.Bold)
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("Cancel") }
        }
    ) {
        DateRangePicker(
            state = state,
            modifier = Modifier
                .fillMaxWidth()
                .height(460.dp)
                .padding(top = 8.dp),
            title = {
                Text(
                    "Select Period Range",
                    modifier = Modifier.padding(horizontal = 20.dp, vertical = 8.dp),
                    fontWeight = FontWeight.Bold
                )
            }
        )
    }
}

@Composable
internal fun QuickCollectBalanceDialog(
    appointment: Appointment,
    defaultAmount: Double,
    onDismiss: () -> Unit,
    onConfirmCollect: (Double, String) -> Unit
) {
    val context = LocalContext.current
    var amountText by remember {
        mutableStateOf(
            if (defaultAmount % 1.0 == 0.0) defaultAmount.toInt().toString()
            else String.format(Locale.US, "%.2f", defaultAmount)
        )
    }
    var selectedMethod by remember { mutableStateOf("CASH") }
    var noteText by remember { mutableStateOf("") }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = {
            Column {
                Text("Collect Balance", fontWeight = FontWeight.Bold, fontSize = 17.sp)
                Text(
                    "${appointment.patientName} \u00B7 #${appointment.trackingCode10Digit}",
                    fontSize = 12.sp,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                OutlinedTextField(
                    value = amountText,
                    onValueChange = { amountText = it.filter { ch -> ch.isDigit() || ch == '.' } },
                    label = { Text("Amount (NPR)") },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(10.dp)
                )
                Text("Payment Method", fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .horizontalScroll(rememberScrollState()),
                    horizontalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    listOf("CASH", "FONEPAY", "ESEWA", "KHALTI").forEach { m ->
                        FilterChip(
                            selected = selectedMethod == m,
                            onClick = { selectedMethod = m },
                            label = { Text(formatMethodDisplayName(m), fontSize = 11.sp) }
                        )
                    }
                }
                OutlinedTextField(
                    value = noteText,
                    onValueChange = { noteText = it },
                    label = { Text("Note (optional)") },
                    placeholder = { Text("e.g. Paid at counter") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(10.dp)
                )
            }
        },
        confirmButton = {
            Button(
                onClick = {
                    val amt = amountText.toDoubleOrNull() ?: 0.0
                    if (amt <= 0.0) {
                        Toast.makeText(context, "Enter a valid amount", Toast.LENGTH_SHORT).show()
                        return@Button
                    }
                    val finalNote = listOfNotNull(selectedMethod, noteText.trim().ifBlank { null }).joinToString(" - ")
                    onConfirmCollect(amt, finalNote)
                },
                colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF0D9488))
            ) {
                Text("Record Payment", fontWeight = FontWeight.Bold)
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("Cancel") }
        }
    )
}

@Composable
internal fun AddEditExpenseDialog(
    initialDate: String,
    existingExpense: ClinicExpense? = null,
    onDismiss: () -> Unit,
    onSave: (ClinicExpense) -> Unit
) {
    val context = LocalContext.current
    var title by remember { mutableStateOf(existingExpense?.title ?: "") }
    var amountText by remember {
        mutableStateOf(
            existingExpense?.amount?.let {
                if (it % 1.0 == 0.0) it.toInt().toString() else it.toString()
            } ?: ""
        )
    }
    var selectedCategory by remember { mutableStateOf(existingExpense?.category ?: "PETTY_CASH") }
    var selectedPaymentMethod by remember { mutableStateOf(existingExpense?.paymentMethod ?: "CASH") }
    var expenseDate by remember {
        mutableStateOf(
            existingExpense?.expenseDate?.ifBlank { null }
                ?: initialDate.ifBlank { SimpleDateFormat("yyyy-MM-dd", Locale.US).format(Date()) }
        )
    }
    var expenseTime by remember {
        mutableStateOf(
            existingExpense?.displayTime ?: SimpleDateFormat("HH:mm", Locale.US).format(Date())
        )
    }
    var voucherNumber by remember { mutableStateOf(existingExpense?.displayVoucherNumber ?: "") }
    var remarks by remember { mutableStateOf(existingExpense?.displayRemarks ?: "") }

    val categories = listOf(
        "PETTY_CASH" to "Petty Cash",
        "MEDICAL_SUPPLIES" to "Medical Supplies",
        "RENT" to "Rent",
        "SALARIES" to "Salaries",
        "UTILITIES" to "Utilities",
        "EQUIPMENT" to "Equipment",
        "REFRESHMENTS" to "Refreshments",
        "OTHER" to "Other"
    )
    val paymentMethods = listOf("CASH", "FONEPAY", "ESEWA", "KHALTI", "BANK_TRANSFER")

    fun showPicker() {
        val cal = Calendar.getInstance()
        try {
            val sdf = SimpleDateFormat("yyyy-MM-dd", Locale.US)
            cal.time = sdf.parse(expenseDate) ?: Date()
        } catch (_: Exception) {}
        DatePickerDialog(
            context,
            { _, y, m, d ->
                expenseDate = String.format(Locale.US, "%04d-%02d-%02d", y, m + 1, d)
            },
            cal.get(Calendar.YEAR),
            cal.get(Calendar.MONTH),
            cal.get(Calendar.DAY_OF_MONTH)
        ).show()
    }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                Surface(
                    shape = CircleShape,
                    color = Color(0xFFFFF1F2),
                    modifier = Modifier.size(36.dp)
                ) {
                    Box(contentAlignment = Alignment.Center) {
                        Icon(
                            if (existingExpense != null) Icons.Default.Edit else Icons.Default.AddCircle,
                            contentDescription = null,
                            tint = Color(0xFFE11D48),
                            modifier = Modifier.size(20.dp)
                        )
                    }
                }
                Text(
                    if (existingExpense != null) "Edit Clinic Expense" else "Log Clinic Expense",
                    fontWeight = FontWeight.Bold,
                    fontSize = 16.sp
                )
            }
        },
        text = {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                OutlinedTextField(
                    value = title,
                    onValueChange = { title = it },
                    label = { Text("Expense Title *") },
                    placeholder = { Text("e.g. Syringes & Cotton, Office tea, Electricity") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(8.dp)
                )

                OutlinedTextField(
                    value = amountText,
                    onValueChange = { amountText = it.filter { ch -> ch.isDigit() || ch == '.' } },
                    label = { Text("Amount (NPR) *") },
                    placeholder = { Text("0.00") },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(8.dp)
                )

                Text("Category", fontSize = 11.5.sp, fontWeight = FontWeight.Bold)
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .horizontalScroll(rememberScrollState()),
                    horizontalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    categories.forEach { (catKey, catLabel) ->
                        FilterChip(
                            selected = selectedCategory == catKey,
                            onClick = { selectedCategory = catKey },
                            label = { Text(catLabel, fontSize = 11.sp) },
                            colors = FilterChipDefaults.filterChipColors(
                                selectedContainerColor = getExpenseCategoryBgColor(catKey),
                                selectedLabelColor = getExpenseCategoryTextColor(catKey)
                            )
                        )
                    }
                }

                Text("Payment Method", fontSize = 11.5.sp, fontWeight = FontWeight.Bold)
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .horizontalScroll(rememberScrollState()),
                    horizontalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    paymentMethods.forEach { method ->
                        FilterChip(
                            selected = selectedPaymentMethod == method,
                            onClick = { selectedPaymentMethod = method },
                            label = { Text(formatMethodDisplayName(method), fontSize = 11.sp) }
                        )
                    }
                }

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    OutlinedButton(
                        onClick = { showPicker() },
                        modifier = Modifier.weight(1f),
                        shape = RoundedCornerShape(8.dp)
                    ) {
                        Icon(Icons.Default.CalendarToday, contentDescription = null, modifier = Modifier.size(16.dp))
                        Spacer(modifier = Modifier.width(6.dp))
                        Text(expenseDate, fontSize = 11.5.sp)
                    }

                    OutlinedTextField(
                        value = expenseTime,
                        onValueChange = { expenseTime = it },
                        label = { Text("Time") },
                        modifier = Modifier.weight(1f),
                        singleLine = true,
                        shape = RoundedCornerShape(8.dp)
                    )
                }

                OutlinedTextField(
                    value = voucherNumber,
                    onValueChange = { voucherNumber = it },
                    label = { Text("Bill / Voucher No. (Optional)") },
                    placeholder = { Text("e.g. V-1042") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(8.dp)
                )

                OutlinedTextField(
                    value = remarks,
                    onValueChange = { remarks = it },
                    label = { Text("Remarks / Vendor (Optional)") },
                    placeholder = { Text("e.g. Paid to medical supplier") },
                    maxLines = 2,
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(8.dp)
                )
            }
        },
        confirmButton = {
            Button(
                onClick = {
                    val trimmedTitle = title.trim()
                    val amt = amountText.toDoubleOrNull() ?: 0.0
                    if (trimmedTitle.isBlank()) {
                        Toast.makeText(context, "Please enter an expense title", Toast.LENGTH_SHORT).show()
                        return@Button
                    }
                    if (amt <= 0.0) {
                        Toast.makeText(context, "Please enter a valid expense amount", Toast.LENGTH_SHORT).show()
                        return@Button
                    }
                    val expense = (existingExpense ?: ClinicExpense()).copy(
                        title = trimmedTitle,
                        category = selectedCategory,
                        amount = amt,
                        paymentMethod = selectedPaymentMethod,
                        expenseDate = expenseDate,
                        expenseTime = expenseTime.ifBlank { null },
                        voucherNumber = voucherNumber.trim().ifBlank { null },
                        remarks = remarks.trim().ifBlank { null }
                    )
                    onSave(expense)
                },
                colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFE11D48))
            ) {
                Text(if (existingExpense != null) "Update Expense" else "Save Expense", fontWeight = FontWeight.Bold)
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("Cancel") }
        }
    )
}

internal fun formatMethodDisplayName(raw: String): String = when (raw.trim().uppercase()) {
    "ALL" -> "All"
    "CASH" -> "Cash"
    "FONEPAY", "FONEPAY_QR", "QR" -> "Fonepay"
    "ESEWA" -> "eSewa"
    "KHALTI" -> "Khalti"
    "CONNECTIPS" -> "ConnectIPS"
    "PAY_AT_DESK" -> "Pay at Desk"
    "ONLINE" -> "Online"
    "FREE" -> "Free"
    "BANK_TRANSFER" -> "Bank"
    "PARTIAL" -> "Partial"
    "REFUND" -> "Refund"
    else -> raw.replace('_', ' ').lowercase().replaceFirstChar { it.uppercase() }
}

internal fun getExpenseCategoryIcon(category: String) = when (category.uppercase()) {
    "PETTY_CASH" -> Icons.Default.Payments
    "MEDICAL_SUPPLIES" -> Icons.Default.MedicalServices
    "RENT" -> Icons.Default.Home
    "SALARIES" -> Icons.Default.People
    "UTILITIES" -> Icons.Default.Bolt
    "EQUIPMENT" -> Icons.Default.Build
    "REFRESHMENTS" -> Icons.Default.LocalCafe
    "PLATFORM_COMMISSION" -> Icons.Default.AccountBalance
    else -> Icons.Default.ReceiptLong
}

internal fun getExpenseCategoryBgColor(category: String) = when (category.uppercase()) {
    "PETTY_CASH" -> Color(0xFFFEF3C7)
    "MEDICAL_SUPPLIES" -> Color(0xFFE0F2FE)
    "RENT" -> Color(0xFFEDE9FE)
    "SALARIES" -> Color(0xFFDCFCE7)
    "UTILITIES" -> Color(0xFFFEF9C3)
    "EQUIPMENT" -> Color(0xFFF1F5F9)
    "REFRESHMENTS" -> Color(0xFFFFEDD5)
    "PLATFORM_COMMISSION" -> Color(0xFFCCFBF1)
    else -> Color(0xFFFEE2E2)
}

internal fun getExpenseCategoryTextColor(category: String) = when (category.uppercase()) {
    "PETTY_CASH" -> Color(0xFFB45309)
    "MEDICAL_SUPPLIES" -> Color(0xFF0369A1)
    "RENT" -> Color(0xFF6D28D9)
    "SALARIES" -> Color(0xFF15803D)
    "UTILITIES" -> Color(0xFFA16207)
    "EQUIPMENT" -> Color(0xFF475569)
    "REFRESHMENTS" -> Color(0xFFC2410C)
    "PLATFORM_COMMISSION" -> Color(0xFF0F766E)
    else -> Color(0xFFB91C1C)
}
