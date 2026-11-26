package com.dactor.clinic.ui.billing

import android.widget.Toast
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.navigation.NavController
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
import com.dactor.clinic.domain.util.DateTimePickers
import com.dactor.clinic.domain.util.PaymentLedgerHelper
import kotlinx.coroutines.launch
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.format.DateTimeFormatter
import java.util.UUID

data class InvoiceLineItem(
    val name: String,
    val unitPrice: Double,
    var quantity: Int = 1
) {
    val total: Double get() = unitPrice * quantity
}

private fun checkIsFollowUp(appt: Appointment, allAppts: List<Appointment>): Boolean {
    if (appt.attemptNumber > 1 || appt.visitType.equals("follow_up", ignoreCase = true)) return true
    if (appt.feeAmount > 0.0) return false
    return appt.notes?.contains("follow", ignoreCase = true) == true || appt.feeAmount <= 0.0
}
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun BillingScreen(
    navController: NavController,
    clinicId: String = "",
    appointmentId: String = "",
    patientName: String = "Patient Consultation",
    trackingCode: String = "",
    billingRepository: BillingRepository? = null,
    appointmentRepository: AppointmentRepository? = null,
    clinicRepository: ClinicRepository? = null,
    doctorRepository: DoctorRepository? = null
) {
    val context = LocalContext.current
    val coroutineScope = rememberCoroutineScope()
    val sessionManager = remember { com.dactor.clinic.data.local.UserSessionManager(context) }
    val effectiveClinicId = remember(clinicId) {
        if (clinicId.isNotBlank() && clinicId != "c1") clinicId
        else sessionManager.getSavedClinicId() ?: ""
    }

    var clinicAppointments by remember(effectiveClinicId) { mutableStateOf<List<Appointment>>(emptyList()) }
    var invoicesMap by remember { mutableStateOf<Map<String, BillingInvoice>>(emptyMap()) }
    var loadedClinic by remember { mutableStateOf<Clinic?>(null) }
    var doctorsMap by remember { mutableStateOf<Map<String, Doctor>>(emptyMap()) }

    // Date Directory State
    val today = remember { LocalDate.now().toString() }
    val yesterday = remember { LocalDate.now().minusDays(1).toString() }
    var selectedDateFilter by remember { mutableStateOf(today) } // "All", or specific date string "YYYY-MM-DD"
    var directoryStatusFilter by remember { mutableStateOf("ALL") } // "ALL", "PAID", "PARTIAL", "UNPAID", "NO BILL"
    var directorySearchQuery by remember { mutableStateOf("") }
    var isDateDirectoryExpanded by remember { mutableStateOf(true) }

    // Selected Patient for Bill/Payment Push
    var selectedAppointment by remember { mutableStateOf<Appointment?>(null) }
    var resolvedAppointmentId by remember { mutableStateOf(appointmentId) }
    var resolvedClinicId by remember(effectiveClinicId) { mutableStateOf(effectiveClinicId) }
    var realPatientName by remember { mutableStateOf(patientName) }
    var realTrackingCode by remember { mutableStateOf(trackingCode) }

    // Payment Ledger History for the selected appointment
    var paymentRecords by remember { mutableStateOf<List<PaymentRecord>>(emptyList()) }
    var priorVisitsSummary by remember {
        mutableStateOf(
            PaymentLedgerHelper.CombinedBillingSummary(0, 0.0, 0.0, 0.0, emptyList(), emptyList(), "")
        )
    }

    // Follow-up Service Items (Charges added across visits)
    var lineItems by remember { mutableStateOf<List<InvoiceLineItem>>(emptyList()) }
    var manualItemName by remember { mutableStateOf("") }
    var manualItemPrice by remember { mutableStateOf("") }
    var customClinicServices by remember { mutableStateOf<List<Pair<String, Double>>>(emptyList()) }

    // Follow-up Payment Input (New payment to record in this session)
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

    // Doctor Clinical Remarks
    var clinicalRemarks by remember { mutableStateOf("") }

    var isSaving by remember { mutableStateOf(false) }
    var showSuccessDialog by remember { mutableStateOf(false) }
    var successDialogInvoice by remember { mutableStateOf<BillingInvoice?>(null) }

    val scrollState = rememberScrollState()

    suspend fun selectAppointment(appt: Appointment) {
        selectedAppointment = appt
        resolvedAppointmentId = appt.id
        resolvedClinicId = appt.clinicId.ifBlank { effectiveClinicId }
        realPatientName = appt.patientName
        realTrackingCode = appt.trackingCode10Digit
        newPaymentDate = today
        newPaymentTime = try {
            java.time.LocalTime.now().format(DateTimeFormatter.ofPattern("hh:mm a"))
        } catch (_: Exception) {
            "12:00 PM"
        }

        if (billingRepository != null) {
            val isFollowUp = checkIsFollowUp(appt, clinicAppointments)
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
            val siblingVisits = if (appt.trackingCode10Digit.isNotBlank()) {
                val remoteSiblings = try {
                    appointmentRepository?.getAllAppointmentsByTrackingCode(appt.trackingCode10Digit) ?: emptyList()
                } catch (_: Exception) {
                    emptyList()
                }
                (clinicAppointments.filter { it.trackingCode10Digit == appt.trackingCode10Digit } + remoteSiblings + listOf(appt))
                    .distinctBy { it.id }
            } else {
                listOf(appt)
            }
            val otherVisits = siblingVisits.filter { it.id != appt.id }
            val siblingInvoicesMap = if (siblingVisits.size > 1) {
                val fetched = billingRepository.getInvoicesForAppointments(siblingVisits.map { it.id })
                invoicesMap + fetched
            } else {
                invoicesMap
            }
            priorVisitsSummary = PaymentLedgerHelper.computeCombinedBillingSummary(
                visits = otherVisits,
                invoicesByApptId = siblingInvoicesMap
            )

            val existingInv = siblingInvoicesMap[appt.id] ?: billingRepository.getInvoiceByAppointment(appt.id)
            if (existingInv != null) {
                val cleanItems = existingInv.items.filterNot { it.itemName.startsWith("Payment Received", ignoreCase = true) }
                val mapped = cleanItems.map {
                    val uPrice = if (it.price > 0.0) it.price else if (it.total > 0.0 && it.quantity > 0) it.total / it.quantity else 0.0
                    InvoiceLineItem(name = it.itemName, unitPrice = uPrice, quantity = it.quantity)
                }
                lineItems = if (mapped.isNotEmpty()) {
                    mapped
                } else if (!isFollowUp && appt.isPayAtDesk && defaultOpdItems.isNotEmpty()) {
                    defaultOpdItems
                } else if (!isFollowUp && existingInv.totalAmount > 0.0) {
                    listOf(InvoiceLineItem(name = "OPD Consultation & Clinical Services", unitPrice = existingInv.totalAmount, quantity = 1))
                } else {
                    defaultOpdItems
                }
                val fallbackAmt = if (isFollowUp) {
                    val nonConsultTotal = existingInv.items.filterNot {
                        val n = it.itemName.lowercase()
                        n.contains("consultation") || n.contains("opd doctor") || n.contains("clinical service") || n.contains("follow-up")
                    }.sumOf { it.total }
                    nonConsultTotal
                } else {
                    existingInv.effectivePaidAmount
                }
                paymentRecords = PaymentLedgerHelper.parsePaymentRecords(
                    rawRemarks = existingInv.remarks,
                    fallbackPaidAmount = fallbackAmt,
                    fallbackDate = existingInv.paidAt
                )
                clinicalRemarks = PaymentLedgerHelper.extractCleanClinicalRemarks(existingInv.remarks)
                newPaymentAmountInput = ""
                newPaymentNote = ""
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
                newPaymentAmountInput = ""
                newPaymentNote = ""
            }
        }
    }

    suspend fun loadAppointmentsAndInvoices() {
        if (effectiveClinicId.isBlank()) return
        if (clinicRepository != null && loadedClinic == null) {
            try {
                loadedClinic = clinicRepository.getClinicById(effectiveClinicId)
            } catch (_: Exception) {}
        }
        if (doctorRepository != null && doctorsMap.isEmpty()) {
            try {
                val docs = doctorRepository.getDoctorsByClinic(effectiveClinicId)
                doctorsMap = docs.associateBy { it.id }
            } catch (_: Exception) {}
        }
        val combinedServicesList = mutableListOf<Pair<String, Double>>()
        if (clinicRepository != null) {
            try {
                val srvs = clinicRepository.getClinicServices(effectiveClinicId)
                combinedServicesList.addAll(srvs.map { Pair(it.serviceName, it.price) })
            } catch (_: Exception) {}
        }
        if (billingRepository != null) {
            try {
                val cat = billingRepository.getCatalog(effectiveClinicId)
                combinedServicesList.addAll(cat.map { Pair(it.itemName, it.price) })
            } catch (_: Exception) {}
        }
        if (combinedServicesList.isNotEmpty()) {
            customClinicServices = combinedServicesList.distinctBy { it.first.trim().lowercase() }
        }
        if (appointmentRepository != null) {
            val appts = appointmentRepository.getAppointmentsByClinic(effectiveClinicId)
            clinicAppointments = appts

            if (billingRepository != null) {
                val invList = billingRepository.getInvoicesForClinic(effectiveClinicId)
                invoicesMap = invList.groupBy { it.appointmentId }
                    .mapValues { (_, rows) ->
                        rows.sortedWith(
                            compareByDescending<BillingInvoice> { it.updatedAt ?: it.paidAt ?: it.createdAt ?: "" }
                                .thenByDescending { it.items.isNotEmpty() }
                                .thenByDescending { it.totalAmount }
                        ).first()
                    }
            }

            // Auto-select initial appointment if specified or default to first
            var target = if (resolvedAppointmentId.isNotBlank()) {
                appts.find { it.id == resolvedAppointmentId || it.trackingCode10Digit == resolvedAppointmentId }
            } else null

            if (target == null && resolvedAppointmentId.isNotBlank()) {
                try {
                    target = appointmentRepository.getAppointmentById(resolvedAppointmentId)
                } catch (_: Exception) {}
            }

            if (target == null && appts.isNotEmpty()) {
                target = appts.find { it.appointmentDate == today } ?: appts.first()
            }

            if (target != null && selectedAppointment == null) {
                selectAppointment(target)
            }
        }
    }

    LaunchedEffect(effectiveClinicId, appointmentId) {
        loadAppointmentsAndInvoices()
    }

    // Filter appointments for Date-Wise Directory
    val uniqueDates = remember(clinicAppointments) {
        clinicAppointments.map { it.appointmentDate }.filter { it.isNotBlank() }.distinct().sortedDescending()
    }

    val directoryFilteredAppointments = remember(clinicAppointments, selectedDateFilter, directorySearchQuery, invoicesMap) {
        clinicAppointments.filter { appt ->
            val matchesDate = when (selectedDateFilter) {
                "All" -> true
                else -> appt.appointmentDate == selectedDateFilter
            }
            if (!matchesDate) return@filter false
            if (directorySearchQuery.isBlank()) return@filter true
            val q = directorySearchQuery.trim().lowercase()
            appt.patientName.lowercase().contains(q) ||
                appt.trackingCode10Digit.lowercase().contains(q) ||
                appt.patientMobile.contains(q)
        }
    }

    // Calculations for combined multi-visit bill (prior visits + active visit edits)
    val lineItemsSum = lineItems.sumOf { it.total }
    val loggedPaidSum = paymentRecords.sumOf { it.amount }
    val parsedNewPayment = newPaymentAmountInput.toDoubleOrNull() ?: 0.0
    val totalPaid = loggedPaidSum + parsedNewPayment
    val totalAmount = if (lineItemsSum > 0.0) lineItemsSum else totalPaid
    val balanceDue = (totalAmount - totalPaid).coerceAtLeast(0.0)
    val combinedTotalAmount = priorVisitsSummary.totalBill + totalAmount
    val combinedTotalPaid = priorVisitsSummary.totalPaid + totalPaid
    val combinedBalanceDue = (combinedTotalAmount - combinedTotalPaid).coerceAtLeast(0.0)
    val pendingManualPrice = manualItemPrice.trim().replace(",", "").toDoubleOrNull() ?: 0.0
    val hasPendingManualItem = manualItemName.trim().isNotBlank() && pendingManualPrice > 0.0

    val currentInvoice = selectedAppointment?.let { invoicesMap[it.id] }
    val activeDoctorFee = selectedAppointment?.let { appt ->
        appt.doctorId?.let { doctorsMap[it]?.consultationFee }?.takeIf { it > 0.0 }
            ?: appt.feeAmount.takeIf { it > 0.0 }
    }

    val quickCatalogItems = remember(customClinicServices, activeDoctorFee) {
        val defaultCatalog = buildList {
            if (activeDoctorFee != null && activeDoctorFee > 0.0) {
                add(Pair("General OPD Consultation", activeDoctorFee))
            }
            add(Pair("12-Lead ECG Test", 1000.0))
            add(Pair("CT Scan", 500.0))
            add(Pair("Complete Blood Count (CBC)", 650.0))
            add(Pair("Ultrasonography (USG)", 1500.0))
            add(Pair("MRI Scan", 5000.0))
            add(Pair("Digital X-Ray", 800.0))
            add(Pair("Wound Dressing & Care", 350.0))
            add(Pair("Lipid Profile Test", 1200.0))
        }
        val seen = mutableSetOf<String>()
        val result = mutableListOf<Pair<String, Double>>()
        for (item in customClinicServices) {
            val k = item.first.trim().lowercase()
            if (k.isNotBlank() && seen.add(k)) {
                result.add(item)
            }
        }
        for (item in defaultCatalog) {
            val k = item.first.trim().lowercase()
            if (seen.add(k)) {
                result.add(item)
            }
        }
        result
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text("Date-Wise Billing & Patient Ledger", fontWeight = FontWeight.Bold, fontSize = 17.sp)
                        Text(
                            "Directory by Date \u2022 Quick Paid Push \u2022 On-Demand Bill PDF",
                            fontSize = 11.sp,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                },
                navigationIcon = {
                    IconButton(onClick = { navController.popBackStack() }) {
                        Icon(Icons.Default.ArrowBack, contentDescription = "Back")
                    }
                },
                actions = {
                    IconButton(onClick = { coroutineScope.launch { loadAppointmentsAndInvoices() } }) {
                        Icon(Icons.Default.Refresh, contentDescription = "Refresh")
                    }
                }
            )
        }
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .verticalScroll(scrollState)
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {

            // =========================================================================
            // SECTION 1: DATE-WISE PATIENT & BILL DIRECTORY
            // =========================================================================
            val directoryRowEntries = remember(
                directoryFilteredAppointments,
                clinicAppointments,
                invoicesMap,
                selectedAppointment,
                combinedTotalAmount,
                combinedTotalPaid
            ) {
                directoryFilteredAppointments.map { appt ->
                    val isSelected = selectedAppointment?.id == appt.id
                    val chainVisits = if (appt.trackingCode10Digit.isNotBlank()) {
                        clinicAppointments.filter { it.trackingCode10Digit == appt.trackingCode10Digit }
                    } else listOf(appt)
                    val chainSummary = PaymentLedgerHelper.computeCombinedBillingSummary(chainVisits, invoicesMap)
                    val totalBilled = if (isSelected) combinedTotalAmount else chainSummary.totalBill
                    val rowPaid = if (isSelected) combinedTotalPaid else chainSummary.totalPaid
                    val balanceLeft = (totalBilled - rowPaid).coerceAtLeast(0.0)
                    val statusBadge = when {
                        totalBilled <= 0.0 -> "NO BILL"
                        balanceLeft <= 0.0 -> "PAID"
                        rowPaid > 0.0 -> "PARTIAL"
                        else -> "UNPAID"
                    }
                    Triple(appt, Triple(totalBilled, rowPaid, balanceLeft), statusBadge)
                }
            }

            val kpiTotalBilled = directoryRowEntries.sumOf { it.second.first }
            val kpiTotalPaid = directoryRowEntries.sumOf { it.second.second }
            val kpiBalanceDue = directoryRowEntries.sumOf { it.second.third }
            val statusFilteredEntries = remember(directoryRowEntries, directoryStatusFilter) {
                if (directoryStatusFilter == "ALL") directoryRowEntries
                else directoryRowEntries.filter { it.third == directoryStatusFilter }
            }

            Card(
                shape = RoundedCornerShape(16.dp),
                colors = CardDefaults.cardColors(containerColor = Color.White),
                border = BorderStroke(1.dp, Color(0xFFCCFBF1)),
                elevation = CardDefaults.cardElevation(defaultElevation = 2.dp),
                modifier = Modifier.fillMaxWidth()
            ) {
                Column(
                    modifier = Modifier.padding(14.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                            modifier = Modifier.weight(1f)
                        ) {
                            Surface(
                                shape = CircleShape,
                                color = Color(0xFFE0F2F1),
                                modifier = Modifier.size(34.dp)
                            ) {
                                Box(contentAlignment = Alignment.Center) {
                                    Icon(Icons.Default.CalendarMonth, contentDescription = null, tint = Color(0xFF00796B), modifier = Modifier.size(18.dp))
                                }
                            }
                            Column {
                                Text("Patient & Billing Directory by Date", fontWeight = FontWeight.Bold, fontSize = 14.5.sp, color = Color(0xFF0F172A))
                                Text("Browse dates to push payment or view patient bills", fontSize = 11.sp, color = Color(0xFF64748B))
                            }
                        }

                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                            OutlinedButton(
                                onClick = {
                                    val initialDate = if (selectedDateFilter == "All") today else selectedDateFilter
                                    DateTimePickers.showDatePicker(context, initialDate) { picked ->
                                        selectedDateFilter = picked
                                        isDateDirectoryExpanded = true
                                    }
                                },
                                contentPadding = PaddingValues(horizontal = 10.dp, vertical = 4.dp),
                                shape = RoundedCornerShape(10.dp),
                                border = BorderStroke(1.dp, Color(0xFF99F6E4)),
                                modifier = Modifier.height(30.dp)
                            ) {
                                Icon(Icons.Default.DateRange, contentDescription = "Pick Date", tint = Color(0xFF00796B), modifier = Modifier.size(14.dp))
                                Spacer(Modifier.width(4.dp))
                                Text("Pick Date", fontSize = 11.sp, fontWeight = FontWeight.Bold, color = Color(0xFF00796B))
                            }

                            IconButton(
                                onClick = { isDateDirectoryExpanded = !isDateDirectoryExpanded },
                                modifier = Modifier.size(28.dp)
                            ) {
                                Icon(
                                    if (isDateDirectoryExpanded) Icons.Default.ExpandLess else Icons.Default.ExpandMore,
                                    contentDescription = "Toggle Directory",
                                    tint = Color(0xFF00796B)
                                )
                            }
                        }
                    }

                    if (isDateDirectoryExpanded) {
                        // Date Filter Selector Chips Row
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .horizontalScroll(rememberScrollState()),
                            horizontalArrangement = Arrangement.spacedBy(6.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            FilterChip(
                                selected = selectedDateFilter == "All",
                                onClick = { selectedDateFilter = "All" },
                                label = { Text("All Dates", fontSize = 11.sp, fontWeight = FontWeight.Bold) }
                            )

                            FilterChip(
                                selected = selectedDateFilter == today,
                                onClick = { selectedDateFilter = today },
                                label = { Text("Today ($today)", fontSize = 11.sp, fontWeight = FontWeight.Bold) }
                            )

                            FilterChip(
                                selected = selectedDateFilter == yesterday,
                                onClick = { selectedDateFilter = yesterday },
                                label = { Text("Yesterday ($yesterday)", fontSize = 11.sp, fontWeight = FontWeight.SemiBold) }
                            )

                            uniqueDates.filter { it != today && it != yesterday }.forEach { d ->
                                FilterChip(
                                    selected = selectedDateFilter == d,
                                    onClick = { selectedDateFilter = d },
                                    label = { Text(d, fontSize = 11.sp) }
                                )
                            }

                            if (selectedDateFilter != "All" && selectedDateFilter != today && selectedDateFilter != yesterday && !uniqueDates.contains(selectedDateFilter)) {
                                FilterChip(
                                    selected = true,
                                    onClick = { },
                                    label = { Text(selectedDateFilter, fontSize = 11.sp, fontWeight = FontWeight.Bold) }
                                )
                            }
                        }

                        // Date Summary KPI Strip
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            Surface(
                                shape = RoundedCornerShape(10.dp),
                                color = Color(0xFFF8FAFC),
                                border = BorderStroke(1.dp, Color(0xFFE2E8F0)),
                                modifier = Modifier.weight(1f)
                            ) {
                                Column(modifier = Modifier.padding(horizontal = 8.dp, vertical = 7.dp)) {
                                    Text("Visits", fontSize = 10.sp, color = Color(0xFF64748B))
                                    Text("${directoryRowEntries.size}", fontWeight = FontWeight.ExtraBold, fontSize = 13.sp, color = Color(0xFF0F172A))
                                }
                            }
                            Surface(
                                shape = RoundedCornerShape(10.dp),
                                color = Color(0xFFF8FAFC),
                                border = BorderStroke(1.dp, Color(0xFFE2E8F0)),
                                modifier = Modifier.weight(1.2f)
                            ) {
                                Column(modifier = Modifier.padding(horizontal = 8.dp, vertical = 7.dp)) {
                                    Text("Billed", fontSize = 10.sp, color = Color(0xFF64748B))
                                    Text("Rs. ${kpiTotalBilled.toInt()}", fontWeight = FontWeight.ExtraBold, fontSize = 13.sp, color = Color(0xFF0F172A), maxLines = 1, overflow = TextOverflow.Ellipsis)
                                }
                            }
                            Surface(
                                shape = RoundedCornerShape(10.dp),
                                color = Color(0xFFF0FDF4),
                                border = BorderStroke(1.dp, Color(0xFFBBF7D0)),
                                modifier = Modifier.weight(1.2f)
                            ) {
                                Column(modifier = Modifier.padding(horizontal = 8.dp, vertical = 7.dp)) {
                                    Text("Paid", fontSize = 10.sp, color = Color(0xFF15803D))
                                    Text("Rs. ${kpiTotalPaid.toInt()}", fontWeight = FontWeight.ExtraBold, fontSize = 13.sp, color = Color(0xFF15803D), maxLines = 1, overflow = TextOverflow.Ellipsis)
                                }
                            }
                            Surface(
                                shape = RoundedCornerShape(10.dp),
                                color = if (kpiBalanceDue > 0.0) Color(0xFFFEF2F2) else Color(0xFFF8FAFC),
                                border = BorderStroke(1.dp, if (kpiBalanceDue > 0.0) Color(0xFFFECACA) else Color(0xFFE2E8F0)),
                                modifier = Modifier.weight(1.2f)
                            ) {
                                Column(modifier = Modifier.padding(horizontal = 8.dp, vertical = 7.dp)) {
                                    Text("Due", fontSize = 10.sp, color = if (kpiBalanceDue > 0.0) Color(0xFFB91C1C) else Color(0xFF64748B))
                                    Text("Rs. ${kpiBalanceDue.toInt()}", fontWeight = FontWeight.ExtraBold, fontSize = 13.sp, color = if (kpiBalanceDue > 0.0) Color(0xFFB91C1C) else Color(0xFF15803D), maxLines = 1, overflow = TextOverflow.Ellipsis)
                                }
                            }
                        }

                        // Payment Status Filter Chips
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .horizontalScroll(rememberScrollState()),
                            horizontalArrangement = Arrangement.spacedBy(6.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            listOf("ALL", "PAID", "PARTIAL", "UNPAID", "NO BILL").forEach { st ->
                                FilterChip(
                                    selected = directoryStatusFilter == st,
                                    onClick = { directoryStatusFilter = st },
                                    label = { Text(st, fontSize = 10.5.sp, fontWeight = FontWeight.Bold) }
                                )
                            }
                        }

                        // Directory Search Field
                        OutlinedTextField(
                            value = directorySearchQuery,
                            onValueChange = { directorySearchQuery = it },
                            placeholder = { Text("Search name, #tracking code, mobile...", fontSize = 13.sp) },
                            leadingIcon = { Icon(Icons.Default.Search, contentDescription = null, tint = Color(0xFF00796B), modifier = Modifier.size(18.dp)) },
                            trailingIcon = {
                                if (directorySearchQuery.isNotBlank()) {
                                    IconButton(onClick = { directorySearchQuery = "" }) {
                                        Icon(Icons.Default.Clear, contentDescription = "Clear", modifier = Modifier.size(16.dp))
                                    }
                                }
                            },
                            singleLine = true,
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(48.dp),
                            shape = RoundedCornerShape(10.dp)
                        )

                        // Directory Patient Rows
                        if (statusFilteredEntries.isEmpty()) {
                            Surface(
                                shape = RoundedCornerShape(10.dp),
                                color = Color(0xFFF8FAFC),
                                border = BorderStroke(1.dp, Color(0xFFE2E8F0)),
                                modifier = Modifier.fillMaxWidth()
                            ) {
                                Column(
                                    modifier = Modifier.padding(14.dp),
                                    verticalArrangement = Arrangement.spacedBy(6.dp)
                                ) {
                                    Text(
                                        text = if (directorySearchQuery.isNotBlank()) "No patients matching '$directorySearchQuery' on $selectedDateFilter"
                                        else "No patient consultations recorded for $selectedDateFilter" + if (directoryStatusFilter != "ALL") " ($directoryStatusFilter)." else ".",
                                        fontSize = 12.sp,
                                        color = Color(0xFF64748B)
                                    )
                                    if (selectedDateFilter != "All" || directoryStatusFilter != "ALL" || directorySearchQuery.isNotBlank()) {
                                        TextButton(
                                            onClick = {
                                                selectedDateFilter = "All"
                                                directoryStatusFilter = "ALL"
                                                directorySearchQuery = ""
                                            },
                                            contentPadding = PaddingValues(horizontal = 8.dp, vertical = 2.dp)
                                        ) {
                                            Text("Show All Dates & Reset Filters", fontSize = 11.5.sp, fontWeight = FontWeight.Bold, color = Color(0xFF00796B))
                                        }
                                    }
                                }
                            }
                        } else {
                            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                statusFilteredEntries.forEach { (appt, amounts, statusBadge) ->
                                    val isSelected = selectedAppointment?.id == appt.id
                                    val (totalBilled, rowPaid, balanceLeft) = amounts

                                    Surface(
                                        shape = RoundedCornerShape(12.dp),
                                        color = if (isSelected) Color(0xFFE0F2F1) else Color(0xFFF8FAFC),
                                        border = BorderStroke(if (isSelected) 1.5.dp else 1.dp, if (isSelected) Color(0xFF00796B) else Color(0xFFE2E8F0)),
                                        onClick = {
                                            coroutineScope.launch { selectAppointment(appt) }
                                        },
                                        modifier = Modifier.fillMaxWidth()
                                    ) {
                                        Row(
                                            modifier = Modifier
                                                .fillMaxWidth()
                                                .padding(horizontal = 12.dp, vertical = 10.dp),
                                            horizontalArrangement = Arrangement.SpaceBetween,
                                            verticalAlignment = Alignment.CenterVertically
                                        ) {
                                            Column(modifier = Modifier.weight(1f)) {
                                                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                                    Text(
                                                        text = appt.patientName,
                                                        fontWeight = FontWeight.Bold,
                                                        fontSize = 13.sp,
                                                        color = Color(0xFF0F172A),
                                                        maxLines = 1,
                                                        overflow = TextOverflow.Ellipsis
                                                    )
                                                    Surface(
                                                        shape = RoundedCornerShape(5.dp),
                                                        color = Color(0xFFCCFBF1)
                                                    ) {
                                                        Text(
                                                            text = "#${appt.trackingCode10Digit}",
                                                            fontSize = 10.5.sp,
                                                            color = Color(0xFF0F766E),
                                                            fontWeight = FontWeight.Bold,
                                                            modifier = Modifier.padding(horizontal = 5.dp, vertical = 1.dp)
                                                        )
                                                    }
                                                }
                                                Text(
                                                    text = "Date: ${appt.appointmentDate} (${appt.appointmentTime.ifBlank { "OPD" }}) \u2022 Ph: ${appt.patientMobile.ifBlank { "N/A" }}",
                                                    fontSize = 11.sp,
                                                    color = Color(0xFF64748B),
                                                    modifier = Modifier.padding(top = 2.dp)
                                                )
                                            }

                                            Column(horizontalAlignment = Alignment.End, verticalArrangement = Arrangement.spacedBy(2.dp)) {
                                                Surface(
                                                    shape = RoundedCornerShape(6.dp),
                                                    color = when (statusBadge) {
                                                        "PAID" -> Color(0xFFDCFCE7)
                                                        "PARTIAL" -> Color(0xFFFEF3C7)
                                                        "UNPAID" -> Color(0xFFFEE2E2)
                                                        else -> Color(0xFFE2E8F0)
                                                    }
                                                ) {
                                                    Text(
                                                        text = statusBadge,
                                                        fontSize = 9.5.sp,
                                                        fontWeight = FontWeight.ExtraBold,
                                                        color = when (statusBadge) {
                                                            "PAID" -> Color(0xFF15803D)
                                                            "PARTIAL" -> Color(0xFFB45309)
                                                            "UNPAID" -> Color(0xFFB91C1C)
                                                            else -> Color(0xFF475569)
                                                        },
                                                        modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
                                                    )
                                                }
                                                if (totalBilled > 0.0) {
                                                    Text(
                                                        text = "Bill: Rs. ${totalBilled.toInt()} | Paid: Rs. ${rowPaid.toInt()}",
                                                        fontSize = 10.sp,
                                                        color = Color(0xFF334155),
                                                        fontWeight = FontWeight.SemiBold
                                                    )
                                                    if (balanceLeft > 0.0) {
                                                        Text(
                                                            text = "Due: Rs. ${balanceLeft.toInt()}",
                                                            fontSize = 10.sp,
                                                            color = Color(0xFFB91C1C),
                                                            fontWeight = FontWeight.Bold
                                                        )
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }

            // =========================================================================
            // SECTION 2: SELECTED PATIENT BILLING & LEDGER HEADER CARD
            // =========================================================================
            selectedAppointment?.let { appt ->
                val apptInvoice = invoicesMap[appt.id]
                val currentTotal = combinedTotalAmount
                val currentPaid = combinedTotalPaid
                val currentLeft = combinedBalanceDue

                Card(
                    shape = RoundedCornerShape(16.dp),
                    colors = CardDefaults.cardColors(containerColor = Color(0xFFF0FDFA)),
                    border = BorderStroke(1.5.dp, Color(0xFF99F6E4)),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Column(
                        modifier = Modifier.padding(14.dp),
                        verticalArrangement = Arrangement.spacedBy(10.dp)
                    ) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Column(modifier = Modifier.weight(1f)) {
                                Text(
                                    text = appt.patientName,
                                    fontWeight = FontWeight.ExtraBold,
                                    fontSize = 17.sp,
                                    color = Color(0xFF0F172A)
                                )
                                Text(
                                    text = "Code: #${appt.trackingCode10Digit} \u2022 Visit Date: ${appt.appointmentDate}",
                                    fontSize = 12.sp,
                                    color = Color(0xFF0F766E),
                                    fontWeight = FontWeight.SemiBold
                                )
                            }

                            // ON-DEMAND "GENERATE BILL PDF" BUTTON
                            Button(
                                onClick = {
                                    val assignedDoc = appt.doctorId?.let { doctorsMap[it]?.fullName } ?: "Attending Physician"
                                    val cName = loadedClinic?.name ?: "Dactor Medical Clinic"
                                    val cAddr = loadedClinic?.addressText ?: "Nepal"

                                    val opdFee = (appt.feeAmount ?: 0.0).takeIf { it > 0.0 } ?: 0.0
                                    val pendingCleanPrice = manualItemPrice.trim().replace(",", "")
                                    val pendingPrice = pendingCleanPrice.toDoubleOrNull() ?: 0.0
                                    val pendingName = manualItemName.trim()
                                    val currentItems = if (pendingName.isNotBlank() && pendingPrice > 0.0) {
                                        val flushed = lineItems + InvoiceLineItem(name = pendingName, unitPrice = pendingPrice, quantity = 1)
                                        lineItems = flushed
                                        manualItemName = ""
                                        manualItemPrice = ""
                                        flushed
                                    } else {
                                        lineItems
                                    }

                                    val baseLiveItems = if (currentItems.isNotEmpty()) {
                                        currentItems.map { InvoiceItem(itemName = it.name, quantity = it.quantity, price = it.unitPrice, total = it.total) }
                                    } else {
                                        val clean = apptInvoice?.items?.filterNot { it.itemName.startsWith("Payment Received", ignoreCase = true) }
                                        if (!clean.isNullOrEmpty()) clean else emptyList()
                                    }
                                    val liveItems = if (baseLiveItems.isNotEmpty()) {
                                        val hasServiceCharge = baseLiveItems.any {
                                            val lower = it.itemName.lowercase()
                                            lower.contains("service charge") || lower.contains("5%") || lower.contains("+5%")
                                        }
                                        if (appt.isPayAtDesk && appt.effectiveServiceCharge > 0.0 && !hasServiceCharge) {
                                            baseLiveItems + InvoiceItem(
                                                itemName = "Pay at Desk Service Charge (5%)",
                                                quantity = 1,
                                                price = appt.effectiveServiceCharge,
                                                total = appt.effectiveServiceCharge
                                            )
                                        } else {
                                            baseLiveItems
                                        }
                                    } else if (opdFee > 0.0 && appt.isPayAtDesk && appt.effectiveServiceCharge > 0.0) {
                                        listOf(
                                            InvoiceItem(itemName = "OPD Doctor Consultation (${appt.appointmentDate})", quantity = 1, price = opdFee, total = opdFee),
                                            InvoiceItem(itemName = "Pay at Desk Service Charge (5%)", quantity = 1, price = appt.effectiveServiceCharge, total = appt.effectiveServiceCharge)
                                        )
                                    } else if (opdFee > 0.0) {
                                        listOf(InvoiceItem(itemName = "OPD Doctor Consultation (${appt.appointmentDate})", quantity = 1, price = opdFee, total = opdFee))
                                    } else {
                                        emptyList()
                                    }
                                    val livePayments = if (paymentRecords.isNotEmpty()) {
                                        paymentRecords
                                    } else {
                                        PaymentLedgerHelper.parsePaymentRecords(apptInvoice?.remarks, currentPaid, apptInvoice?.paidAt)
                                    }
                                    val allCombinedItems = priorVisitsSummary.items + liveItems
                                    val allCombinedPayments = priorVisitsSummary.paymentRecords + livePayments
                                    val allCombinedTotal = allCombinedItems.sumOf { if (it.total > 0.0) it.total else it.price * it.quantity }
                                        .let { if (it > 0.0) it else currentTotal }
                                    val allCombinedPaid = allCombinedPayments.sumOf { it.amount }
                                    val liveBalance = (allCombinedTotal - allCombinedPaid).coerceAtLeast(0.0)
                                    val liveStatus = if (liveBalance <= 0.0 && allCombinedTotal > 0.0) "paid" else if (allCombinedPaid > 0.0) "partial" else "pending"
                                    val combinedRem = PaymentLedgerHelper.buildCombinedRemarks(
                                        cleanRemarks = listOf(
                                            priorVisitsSummary.cleanRemarks,
                                            clinicalRemarks.ifBlank { PaymentLedgerHelper.extractCleanClinicalRemarks(apptInvoice?.remarks) }
                                        ).filter { it.isNotBlank() }.joinToString("\n"),
                                        paymentRecords = allCombinedPayments
                                    )
                                    val invoiceToPrint = (apptInvoice ?: currentInvoice)?.copy(
                                        trackingCode10Digit = appt.trackingCode10Digit,
                                        items = allCombinedItems,
                                        totalAmount = allCombinedTotal,
                                        paidAmount = allCombinedPaid,
                                        balanceDue = liveBalance,
                                        paymentStatus = liveStatus,
                                        remarks = combinedRem
                                    ) ?: BillingInvoice(
                                        id = UUID.randomUUID().toString(),
                                        appointmentId = appt.id,
                                        clinicId = appt.clinicId.ifBlank { effectiveClinicId },
                                        trackingCode10Digit = appt.trackingCode10Digit,
                                        items = allCombinedItems,
                                        totalAmount = allCombinedTotal,
                                        paidAmount = allCombinedPaid,
                                        balanceDue = liveBalance,
                                        paymentStatus = liveStatus,
                                        paidAt = java.time.Instant.now().toString(),
                                        remarks = combinedRem
                                    )

                                    BillPdfDownloader.downloadBillPdf(
                                        context = context,
                                        appointment = appt,
                                        invoice = invoiceToPrint,
                                        clinicName = cName,
                                        clinicAddress = cAddr,
                                        doctorName = assignedDoc,
                                        clinicalRemarks = combinedRem
                                    )
                                },
                                shape = RoundedCornerShape(10.dp),
                                colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF00796B)),
                                contentPadding = PaddingValues(horizontal = 10.dp, vertical = 6.dp),
                                modifier = Modifier.height(36.dp)
                            ) {
                                Icon(Icons.Default.Download, contentDescription = null, modifier = Modifier.size(14.dp))
                                Spacer(Modifier.width(4.dp))
                                Text("Generate Bill PDF", fontSize = 11.sp, fontWeight = FontWeight.Bold)
                            }
                        }

                        // Current Combined Total, Paid, and Remaining Left breakdown
                        Surface(
                            shape = RoundedCornerShape(10.dp),
                            color = Color.White,
                            border = BorderStroke(1.dp, Color(0xFFCCFBF1)),
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(horizontal = 14.dp, vertical = 10.dp),
                                horizontalArrangement = Arrangement.SpaceBetween
                            ) {
                                Column {
                                    Text(
                                        if (priorVisitsSummary.visitsCount > 0) "Combined Bill (${priorVisitsSummary.visitsCount + 1} Visits)" else "Combined Bill",
                                        fontSize = 10.sp,
                                        color = Color(0xFF64748B)
                                    )
                                    Text("Rs. ${combinedTotalAmount.toInt()}", fontWeight = FontWeight.ExtraBold, fontSize = 14.sp, color = Color(0xFF0F172A))
                                    if (hasPendingManualItem) {
                                        Text("(+ Rs. ${pendingManualPrice.toInt()} pending)", fontSize = 9.5.sp, color = Color(0xFFD97706), fontWeight = FontWeight.Bold)
                                    }
                                }
                                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                                    Text("Total Paid", fontSize = 10.sp, color = Color(0xFF64748B))
                                    Text("Rs. ${combinedTotalPaid.toInt()}", fontWeight = FontWeight.ExtraBold, fontSize = 14.sp, color = Color(0xFF15803D))
                                }
                                Column(horizontalAlignment = Alignment.End) {
                                    Text("Remaining Left", fontSize = 10.sp, color = Color(0xFF64748B))
                                    Text("Rs. ${combinedBalanceDue.toInt()}", fontWeight = FontWeight.ExtraBold, fontSize = 14.sp, color = if (combinedBalanceDue > 0.0) Color(0xFFDC2626) else Color(0xFF15803D))
                                }
                            }
                        }
                    }
                }

                // =====================================================================
                // SECTION 3: SERVICES & CHARGES (Add as many times as clinic wants!)
                // =====================================================================
                Card(
                    shape = RoundedCornerShape(16.dp),
                    colors = CardDefaults.cardColors(containerColor = Color.White),
                    border = BorderStroke(1.dp, Color(0xFFE2E8F0)),
                    elevation = CardDefaults.cardElevation(defaultElevation = 2.dp),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Column(
                        modifier = Modifier.padding(14.dp),
                        verticalArrangement = Arrangement.spacedBy(10.dp)
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            Surface(
                                shape = CircleShape,
                                color = Color(0xFFE0F2F1),
                                modifier = Modifier.size(32.dp)
                            ) {
                                Box(contentAlignment = Alignment.Center) {
                                    Icon(Icons.Default.MedicalServices, contentDescription = null, tint = Color(0xFF00796B), modifier = Modifier.size(18.dp))
                                }
                            }
                            Column {
                                Text("Services, Tests & Procedures", fontWeight = FontWeight.Bold, fontSize = 14.5.sp, color = Color(0xFF0F172A))
                                Text("Add items anytime (e.g. ECG, CT Scan) \u2014 will accumulate into combined bill", fontSize = 11.sp, color = Color(0xFF64748B))
                            }
                        }

                        // 1-Click Catalog Quick Add Chips
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

                        // Custom Service or Test Input
                        Surface(
                            shape = RoundedCornerShape(10.dp),
                            color = Color(0xFFF8FAFC),
                            border = BorderStroke(1.dp, Color(0xFFE2E8F0)),
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Column(modifier = Modifier.padding(10.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                                Text(
                                    "Add Custom Service, Test, or Procedure",
                                    fontSize = 11.5.sp,
                                    fontWeight = FontWeight.SemiBold,
                                    color = Color(0xFF475569)
                                )
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    val addManualServiceItem = {
                                        val cleanPrice = manualItemPrice.trim().replace(",", "")
                                        val price = cleanPrice.toDoubleOrNull() ?: 0.0
                                        val name = manualItemName.trim()
                                        if (name.isNotBlank() && price > 0.0) {
                                            lineItems = lineItems + InvoiceLineItem(name = name, unitPrice = price, quantity = 1)
                                            manualItemName = ""
                                            manualItemPrice = ""
                                        }
                                    }

                                    OutlinedTextField(
                                        value = manualItemName,
                                        onValueChange = { manualItemName = it },
                                        placeholder = { Text("Service / Test Name (e.g. ECG, Dressing)", fontSize = 12.sp) },
                                        keyboardOptions = KeyboardOptions(imeAction = ImeAction.Next),
                                        keyboardActions = KeyboardActions(
                                            onNext = {
                                                if (manualItemName.trim().isNotBlank() && manualItemPrice.trim().isNotBlank()) {
                                                    addManualServiceItem()
                                                }
                                            },
                                            onDone = { addManualServiceItem() }
                                        ),
                                        singleLine = true,
                                        modifier = Modifier.weight(2f),
                                        shape = RoundedCornerShape(8.dp)
                                    )
                                    OutlinedTextField(
                                        value = manualItemPrice,
                                        onValueChange = { input ->
                                            if (input.all { c -> c.isDigit() || c == '.' || c == ',' }) {
                                                manualItemPrice = input
                                            }
                                        },
                                        placeholder = { Text("Price (Rs.)", fontSize = 12.sp) },
                                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number, imeAction = ImeAction.Done),
                                        keyboardActions = KeyboardActions(onDone = { addManualServiceItem() }),
                                        singleLine = true,
                                        modifier = Modifier.weight(1.2f),
                                        shape = RoundedCornerShape(8.dp)
                                    )
                                    Button(
                                        onClick = { addManualServiceItem() },
                                        shape = RoundedCornerShape(8.dp),
                                        colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF00796B)),
                                        contentPadding = PaddingValues(horizontal = 12.dp, vertical = 0.dp),
                                        modifier = Modifier.height(48.dp)
                                    ) {
                                        Icon(Icons.Default.Add, contentDescription = "Add Item", modifier = Modifier.size(16.dp))
                                        Spacer(Modifier.width(4.dp))
                                        Text("Add", fontSize = 12.sp, fontWeight = FontWeight.Bold)
                                    }
                                }

                                if (hasPendingManualItem) {
                                    Text(
                                        "⚡ Tap '+ Add' or Save bill to include '${manualItemName.trim()}' (+ Rs. ${pendingManualPrice.toInt()}) in bill",
                                        fontSize = 11.sp,
                                        color = Color(0xFFD97706),
                                        fontWeight = FontWeight.Medium
                                    )
                                }
                            }
                        }

                        // Prior Visits Combined Items (Read-only context from earlier visits sharing this 10-digit ID)
                        if (priorVisitsSummary.items.isNotEmpty()) {
                            Text(
                                "Previous Visits Items (${priorVisitsSummary.items.size}) • Rs. ${priorVisitsSummary.totalBill.toInt()}",
                                fontWeight = FontWeight.Bold,
                                fontSize = 12.sp,
                                color = Color(0xFF0F766E)
                            )
                            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                                priorVisitsSummary.items.forEach { prevItem ->
                                    Surface(
                                        shape = RoundedCornerShape(8.dp),
                                        color = Color(0xFFF0FDFA),
                                        border = BorderStroke(1.dp, Color(0xFFCCFBF1)),
                                        modifier = Modifier.fillMaxWidth()
                                    ) {
                                        Row(
                                            modifier = Modifier
                                                .fillMaxWidth()
                                                .padding(horizontal = 12.dp, vertical = 6.dp),
                                            horizontalArrangement = Arrangement.SpaceBetween,
                                            verticalAlignment = Alignment.CenterVertically
                                        ) {
                                            Text(prevItem.itemName, fontSize = 12.sp, color = Color(0xFF0F172A), modifier = Modifier.weight(1f))
                                            Text(
                                                CurrencyFormatter.formatNPR(prevItem.effectiveTotal),
                                                fontWeight = FontWeight.Bold,
                                                fontSize = 12.sp,
                                                color = Color(0xFF0F766E)
                                            )
                                        }
                                    }
                                }
                            }
                        }

                        // Current Combined Items List
                        if (lineItems.isNotEmpty()) {
                            Text("Current Billed Items (${lineItems.size})", fontWeight = FontWeight.Bold, fontSize = 12.5.sp, color = Color(0xFF334155))
                            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                                lineItems.forEachIndexed { index, item ->
                                    Surface(
                                        shape = RoundedCornerShape(8.dp),
                                        color = Color(0xFFF1F5F9),
                                        modifier = Modifier.fillMaxWidth()
                                    ) {
                                        Row(
                                            modifier = Modifier
                                                .fillMaxWidth()
                                                .padding(horizontal = 12.dp, vertical = 8.dp),
                                            horizontalArrangement = Arrangement.SpaceBetween,
                                            verticalAlignment = Alignment.CenterVertically
                                        ) {
                                            Column(modifier = Modifier.weight(1f)) {
                                                Text(item.name, fontWeight = FontWeight.SemiBold, fontSize = 13.sp, color = Color(0xFF0F172A))
                                                Text("Rs. ${item.unitPrice.toInt()} × ${item.quantity}", fontSize = 11.sp, color = Color(0xFF64748B))
                                            }
                                            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                                Text(
                                                    CurrencyFormatter.formatNPR(item.total),
                                                    fontWeight = FontWeight.Bold,
                                                    fontSize = 13.sp,
                                                    color = Color(0xFF0F766E)
                                                )
                                                IconButton(
                                                    onClick = {
                                                        lineItems = lineItems.filterIndexed { i, _ -> i != index }
                                                    },
                                                    modifier = Modifier.size(24.dp)
                                                ) {
                                                    Icon(Icons.Default.Delete, contentDescription = "Delete", tint = Color(0xFFEF4444), modifier = Modifier.size(16.dp))
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }

                // =====================================================================
                // SECTION 4: PAYMENT RECEIPTS & TIME LOG (CHRONOLOGICAL LEDGER)
                // =====================================================================
                Card(
                    shape = RoundedCornerShape(16.dp),
                    colors = CardDefaults.cardColors(containerColor = Color.White),
                    border = BorderStroke(1.dp, Color(0xFFE2E8F0)),
                    elevation = CardDefaults.cardElevation(defaultElevation = 2.dp),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Column(
                        modifier = Modifier.padding(14.dp),
                        verticalArrangement = Arrangement.spacedBy(10.dp)
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            Surface(
                                shape = CircleShape,
                                color = Color(0xFFDCFCE7),
                                modifier = Modifier.size(32.dp)
                            ) {
                                Box(contentAlignment = Alignment.Center) {
                                    Icon(Icons.Default.ReceiptLong, contentDescription = null, tint = Color(0xFF16A34A), modifier = Modifier.size(18.dp))
                                }
                            }
                            Column {
                                Text("Payment Receipts & Time Log", fontWeight = FontWeight.Bold, fontSize = 14.5.sp, color = Color(0xFF0F172A))
                                Text("Complete historical payment timeline for this patient", fontSize = 11.sp, color = Color(0xFF64748B))
                            }
                        }

                        if (priorVisitsSummary.paymentRecords.isNotEmpty()) {
                            Text(
                                "Previous Visits Payments (${priorVisitsSummary.paymentRecords.size}) • Rs. ${priorVisitsSummary.totalPaid.toInt()}",
                                fontWeight = FontWeight.Bold,
                                fontSize = 12.sp,
                                color = Color(0xFF15803D)
                            )
                            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                                priorVisitsSummary.paymentRecords.forEach { prevRec ->
                                    Surface(
                                        shape = RoundedCornerShape(8.dp),
                                        color = Color(0xFFF0FDF4),
                                        border = BorderStroke(1.dp, Color(0xFFBBF7D0)),
                                        modifier = Modifier.fillMaxWidth()
                                    ) {
                                        Row(
                                            modifier = Modifier
                                                .fillMaxWidth()
                                                .padding(horizontal = 12.dp, vertical = 6.dp),
                                            horizontalArrangement = Arrangement.SpaceBetween,
                                            verticalAlignment = Alignment.CenterVertically
                                        ) {
                                            Column(modifier = Modifier.weight(1f)) {
                                                Text(prevRec.dateTime, fontWeight = FontWeight.SemiBold, fontSize = 11.5.sp, color = Color(0xFF0F172A))
                                                Text(prevRec.note ?: "Prior Visit Payment", fontSize = 10.5.sp, color = Color(0xFF15803D))
                                            }
                                            Text("Rs. ${prevRec.amount.toInt()}", fontWeight = FontWeight.Bold, fontSize = 12.5.sp, color = Color(0xFF15803D))
                                        }
                                    }
                                }
                            }
                        }

                        if (paymentRecords.isEmpty() && priorVisitsSummary.paymentRecords.isEmpty()) {
                            Surface(
                                shape = RoundedCornerShape(8.dp),
                                color = Color(0xFFF8FAFC),
                                modifier = Modifier.fillMaxWidth()
                            ) {
                                Text(
                                    "No prior payments logged yet. Use the section below to record payments.",
                                    fontSize = 11.5.sp,
                                    color = Color(0xFF64748B),
                                    modifier = Modifier.padding(12.dp)
                                )
                            }
                        } else {
                            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                                paymentRecords.forEach { record ->
                                    Surface(
                                        shape = RoundedCornerShape(8.dp),
                                        color = Color(0xFFF0FDF4),
                                        border = BorderStroke(1.dp, Color(0xFFBBF7D0)),
                                        modifier = Modifier.fillMaxWidth()
                                    ) {
                                        Row(
                                            modifier = Modifier
                                                .fillMaxWidth()
                                                .padding(horizontal = 12.dp, vertical = 8.dp),
                                            horizontalArrangement = Arrangement.SpaceBetween,
                                            verticalAlignment = Alignment.CenterVertically
                                        ) {
                                            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                                Icon(Icons.Default.CheckCircle, contentDescription = null, tint = Color(0xFF16A34A), modifier = Modifier.size(16.dp))
                                                Column {
                                                    Text(record.dateTime, fontWeight = FontWeight.Bold, fontSize = 12.sp, color = Color(0xFF0F172A))
                                                    Text(record.note ?: "Payment Received", fontSize = 11.sp, color = Color(0xFF15803D))
                                                }
                                            }
                                            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                                Text(
                                                    "Rs. ${record.amount.toInt()}",
                                                    fontWeight = FontWeight.ExtraBold,
                                                    fontSize = 13.5.sp,
                                                    color = Color(0xFF15803D)
                                                )
                                                IconButton(
                                                    onClick = {
                                                        paymentRecords = paymentRecords.filter { it.id != record.id }
                                                    },
                                                    modifier = Modifier.size(24.dp)
                                                ) {
                                                    Icon(Icons.Default.Close, contentDescription = "Remove payment", tint = Color(0xFF94A3B8), modifier = Modifier.size(14.dp))
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }

                // =====================================================================
                // SECTION 5: RECORD NEW FOLLOW-UP PAYMENT (TIME-STAMPED)
                // =====================================================================
                Card(
                    shape = RoundedCornerShape(16.dp),
                    colors = CardDefaults.cardColors(containerColor = Color(0xFFF8FAFC)),
                    border = BorderStroke(1.5.dp, Color(0xFF38BDF8)),
                    elevation = CardDefaults.cardElevation(defaultElevation = 2.dp),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Column(
                        modifier = Modifier.padding(14.dp),
                        verticalArrangement = Arrangement.spacedBy(10.dp)
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            Surface(
                                shape = CircleShape,
                                color = Color(0xFFE0F2FE),
                                modifier = Modifier.size(32.dp)
                            ) {
                                Box(contentAlignment = Alignment.Center) {
                                    Icon(Icons.Default.AddCard, contentDescription = null, tint = Color(0xFF0284C7), modifier = Modifier.size(18.dp))
                                }
                            }
                            Column {
                                Text("Record Payment (Time-Stamped)", fontWeight = FontWeight.Bold, fontSize = 14.5.sp, color = Color(0xFF0369A1))
                                Text("Log payment made now with date & time stamp", fontSize = 11.sp, color = Color(0xFF64748B))
                            }
                        }

                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            OutlinedTextField(
                                value = newPaymentDate,
                                onValueChange = { newPaymentDate = it },
                                label = { Text("Payment Date") },
                                singleLine = true,
                                modifier = Modifier.weight(1f),
                                shape = RoundedCornerShape(10.dp)
                            )

                            OutlinedTextField(
                                value = newPaymentTime,
                                onValueChange = { newPaymentTime = it },
                                label = { Text("Payment Time") },
                                singleLine = true,
                                modifier = Modifier.weight(1f),
                                shape = RoundedCornerShape(10.dp)
                            )
                        }

                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            OutlinedTextField(
                                value = newPaymentAmountInput,
                                onValueChange = { if (it.all { c -> c.isDigit() || c == '.' }) newPaymentAmountInput = it },
                                label = { Text("Amount Paid Now (Rs.)") },
                                placeholder = { Text(if (balanceDue > 0) "e.g. ${balanceDue.toInt()}" else "e.g. 500") },
                                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                                singleLine = true,
                                modifier = Modifier.weight(1.2f),
                                shape = RoundedCornerShape(10.dp)
                            )

                            OutlinedTextField(
                                value = newPaymentNote,
                                onValueChange = { newPaymentNote = it },
                                label = { Text("Payment Note / Mode") },
                                placeholder = { Text("e.g. Cash, CT scan advance") },
                                singleLine = true,
                                modifier = Modifier.weight(1.8f),
                                shape = RoundedCornerShape(10.dp)
                            )
                        }

                        // Quick Amount Chips
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .horizontalScroll(rememberScrollState()),
                            horizontalArrangement = Arrangement.spacedBy(6.dp)
                        ) {
                            if (balanceDue > 0.0) {
                                AssistChip(
                                    onClick = { newPaymentAmountInput = balanceDue.toInt().toString() },
                                    label = { Text("Clear Balance (Rs. ${balanceDue.toInt()})", fontSize = 11.sp, fontWeight = FontWeight.Bold) }
                                )
                            }
                            listOf("500", "1000", "1500", "2000").forEach { preset ->
                                AssistChip(
                                    onClick = { newPaymentAmountInput = preset },
                                    label = { Text("Rs. $preset", fontSize = 11.sp) }
                                )
                            }
                        }
                    }
                }

                // =====================================================================
                // SECTION 6: DOCTOR CLINICAL REMARKS & PRESCRIPTIONS
                // =====================================================================
                Text("Doctor Clinical Remarks & Prescriptions", fontWeight = FontWeight.Bold, fontSize = 13.5.sp, color = Color(0xFF0F172A))
                OutlinedTextField(
                    value = clinicalRemarks,
                    onValueChange = { clinicalRemarks = it },
                    label = { Text("Clinical Notes / Prescriptions") },
                    placeholder = { Text("Doctor's findings, prescriptions, and follow-up advice...") },
                    modifier = Modifier.fillMaxWidth(),
                    minLines = 2,
                    shape = RoundedCornerShape(12.dp)
                )

                // =====================================================================
                // SECTION 7: PRIMARY SAVE & PUSH COMBINED BILL BUTTON
                // =====================================================================
                Button(
                    onClick = {
                        isSaving = true
                        coroutineScope.launch {
                            val finalAppt = selectedAppointment ?: return@launch
                            val opdFee = (finalAppt.feeAmount ?: 0.0).takeIf { it > 0.0 } ?: 0.0
                            val pendingCleanPrice = manualItemPrice.trim().replace(",", "")
                            val pendingPrice = pendingCleanPrice.toDoubleOrNull() ?: 0.0
                            val pendingName = manualItemName.trim()
                            val currentItems = if (pendingName.isNotBlank() && pendingPrice > 0.0) {
                                val flushed = lineItems + InvoiceLineItem(name = pendingName, unitPrice = pendingPrice, quantity = 1)
                                lineItems = flushed
                                manualItemName = ""
                                manualItemPrice = ""
                                flushed
                            } else {
                                lineItems
                            }

                            val baseItems = if (currentItems.isNotEmpty()) {
                                currentItems.map { InvoiceItem(itemName = it.name, quantity = it.quantity, price = it.unitPrice, total = it.total) }
                            } else {
                                emptyList()
                            }
                            val isSavingFollowUp = checkIsFollowUp(finalAppt, clinicAppointments)
                            val itemsToSave = if (baseItems.isNotEmpty()) {
                                baseItems
                            } else if (!isSavingFollowUp && opdFee > 0.0) {
                                if (finalAppt.isPayAtDesk && finalAppt.effectiveServiceCharge > 0.0) {
                                    listOf(
                                        InvoiceItem(itemName = "OPD Doctor Consultation", quantity = 1, price = opdFee, total = opdFee),
                                        InvoiceItem(itemName = "Pay at Desk Service Charge (5%)", quantity = 1, price = finalAppt.effectiveServiceCharge, total = finalAppt.effectiveServiceCharge)
                                    )
                                } else {
                                    listOf(InvoiceItem(itemName = "OPD Doctor Consultation", quantity = 1, price = opdFee, total = opdFee))
                                }
                            } else if (isSavingFollowUp) {
                                listOf(InvoiceItem(itemName = "OPD Doctor Consultation (Follow-up)", quantity = 1, price = 0.0, total = 0.0))
                            } else {
                                val totalToUse = if (totalAmount > 0.0) totalAmount else (totalPaid)
                                if (totalToUse > 0.0) {
                                    listOf(InvoiceItem(itemName = "Consultation / Service ($newPaymentDate)", quantity = 1, price = totalToUse, total = totalToUse))
                                } else emptyList()
                            }

                            val newAmt = newPaymentAmountInput.toDoubleOrNull() ?: 0.0
                            val paymentTimeStr = "$newPaymentDate $newPaymentTime"
                            val paymentNoteStr = newPaymentNote.ifBlank { "Payment Received" }

                            // If user deleted or modified historical payment records, update existing records first
                            val existingPayments = paymentRecords
                            val updatedPayments = if (newAmt > 0.0) {
                                existingPayments + PaymentRecord(
                                    amount = newAmt,
                                    dateTime = paymentTimeStr,
                                    note = paymentNoteStr
                                )
                            } else {
                                existingPayments
                            }

                            val totalPaidCalc = updatedPayments.sumOf { it.amount }
                            val totalItemsCalc = itemsToSave.sumOf { it.total }
                            val totalBillCalc = if (totalItemsCalc > 0.0) totalItemsCalc else if (isSavingFollowUp) 0.0 else totalPaidCalc
                            val balanceCalc = (totalBillCalc - totalPaidCalc).coerceAtLeast(0.0)
                            val statusCalc = when {
                                balanceCalc <= 0.0 && totalBillCalc > 0.0 -> "paid"
                                totalPaidCalc > 0.0 -> "partial"
                                else -> "pending"
                            }
                            val cleanClinical = PaymentLedgerHelper.extractCleanClinicalRemarks(clinicalRemarks)
                            val combinedRemarks = PaymentLedgerHelper.buildCombinedRemarks(cleanClinical, updatedPayments)

                            val invoice = BillingInvoice(
                                id = currentInvoice?.id ?: UUID.randomUUID().toString(),
                                appointmentId = finalAppt.id,
                                clinicId = finalAppt.clinicId.ifBlank { effectiveClinicId },
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
                            isSaving = false
                            if (saved != null) {
                                successDialogInvoice = saved
                                showSuccessDialog = true
                                newPaymentAmountInput = ""
                                newPaymentNote = ""
                                manualItemName = ""
                                manualItemPrice = ""
                                val updatedAppt = finalAppt.copy(feeAmount = totalBillCalc, paymentStatus = statusCalc)
                                selectedAppointment = updatedAppt
                                invoicesMap = invoicesMap + (finalAppt.id to saved)
                                clinicAppointments = clinicAppointments.map { if (it.id == finalAppt.id) updatedAppt else it }
                                val cleanSavedItems = saved.items.filterNot { it.itemName.startsWith("Payment Received", ignoreCase = true) }
                                val mappedSaved = cleanSavedItems.map {
                                    val uPrice = if (it.price > 0.0) it.price else if (it.total > 0.0 && it.quantity > 0) it.total / it.quantity else 0.0
                                    InvoiceLineItem(name = it.itemName, unitPrice = uPrice, quantity = it.quantity)
                                }
                                if (mappedSaved.isNotEmpty()) {
                                    lineItems = mappedSaved
                                }
                                paymentRecords = updatedPayments
                                clinicalRemarks = PaymentLedgerHelper.extractCleanClinicalRemarks(saved.remarks)
                            } else {
                                android.widget.Toast.makeText(context, "Failed to save bill to server. Please check connection and try again.", android.widget.Toast.LENGTH_LONG).show()
                            }
                        }
                    },
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(52.dp),
                    shape = RoundedCornerShape(14.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF00796B)),
                    enabled = !isSaving
                ) {
                    if (isSaving) {
                        CircularProgressIndicator(color = Color.White, modifier = Modifier.size(20.dp), strokeWidth = 2.dp)
                        Spacer(Modifier.width(8.dp))
                        Text("Saving Combined Bill...", fontWeight = FontWeight.Bold)
                    } else {
                        val displayTotal = combinedTotalAmount + (if (hasPendingManualItem) pendingManualPrice else 0.0)
                        val displayDue = (displayTotal - combinedTotalPaid).coerceAtLeast(0.0)
                        Icon(Icons.Default.Save, contentDescription = null, modifier = Modifier.size(18.dp))
                        Spacer(Modifier.width(8.dp))
                        Text(
                            "Save & Push Combined Bill (Total: Rs. ${displayTotal.toInt()} \u2022 Paid: Rs. ${combinedTotalPaid.toInt()} \u2022 Due: Rs. ${displayDue.toInt()})",
                            fontWeight = FontWeight.Bold,
                            fontSize = 13.sp
                        )
                    }
                }
            }

        // =========================================================================
        // SECTION 5: SUCCESS CONFIRMATION DIALOG (WITH ON-DEMAND "GENERATE BILL PDF")
        // =========================================================================
        if (showSuccessDialog) {
            AlertDialog(
                onDismissRequest = {
                    showSuccessDialog = false
                    navController.popBackStack()
                },
                icon = { Icon(Icons.Default.CheckCircle, contentDescription = null, tint = Color(0xFF059669), modifier = Modifier.size(40.dp)) },
                title = { Text("Bill Successfully Pushed", fontWeight = FontWeight.Bold) },
                text = {
                    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text(
                            "Bill and payment details for $realPatientName (Total: ${CurrencyFormatter.formatNPR(combinedTotalAmount)}, Paid: ${CurrencyFormatter.formatNPR(combinedTotalPaid)}, Left: ${CurrencyFormatter.formatNPR(combinedBalanceDue)}) have been saved and pushed to the patient's records.",
                            fontSize = 13.sp
                        )
                        Text(
                            "PDF bills are generated only on-demand when requested by a user. Tap below to generate/download the formal bill now or close.",
                            fontSize = 11.5.sp,
                            color = Color(0xFF64748B)
                        )
                    }
                },
                confirmButton = {
                    Button(
                        onClick = {
                            selectedAppointment?.let { appt ->
                                val assignedDoc = appt.doctorId?.let { doctorsMap[it]?.fullName } ?: "Attending Physician"
                                val cName = loadedClinic?.name ?: "Dactor Medical Clinic"
                                val cAddr = loadedClinic?.addressText ?: "Nepal"
                                val rawInv = successDialogInvoice
                                val combinedItemsForPdf = priorVisitsSummary.items + (rawInv?.items ?: emptyList())
                                val combinedPaymentsForPdf = priorVisitsSummary.paymentRecords + paymentRecords
                                val combinedTotalForPdf = combinedItemsForPdf.sumOf { if (it.total > 0.0) it.total else it.price * it.quantity }
                                    .let { if (it > 0.0) it else combinedTotalAmount }
                                val combinedPaidForPdf = combinedPaymentsForPdf.sumOf { it.amount }
                                val combinedBalForPdf = (combinedTotalForPdf - combinedPaidForPdf).coerceAtLeast(0.0)
                                val combinedRemarksForPdf = PaymentLedgerHelper.buildCombinedRemarks(
                                    cleanRemarks = listOf(
                                        priorVisitsSummary.cleanRemarks,
                                        PaymentLedgerHelper.extractCleanClinicalRemarks(rawInv?.remarks).ifBlank { clinicalRemarks }
                                    ).filter { it.isNotBlank() }.joinToString("\n"),
                                    paymentRecords = combinedPaymentsForPdf
                                )
                                val combinedPdfInvoice = rawInv?.copy(
                                    trackingCode10Digit = appt.trackingCode10Digit,
                                    items = combinedItemsForPdf,
                                    totalAmount = combinedTotalForPdf,
                                    paidAmount = combinedPaidForPdf,
                                    balanceDue = combinedBalForPdf,
                                    paymentStatus = if (combinedBalForPdf <= 0.0 && combinedTotalForPdf > 0.0) "paid" else if (combinedPaidForPdf > 0.0) "partial" else "pending",
                                    remarks = combinedRemarksForPdf
                                )
                                BillPdfDownloader.downloadBillPdf(
                                    context = context,
                                    appointment = appt,
                                    invoice = combinedPdfInvoice,
                                    clinicName = cName,
                                    clinicAddress = cAddr,
                                    doctorName = assignedDoc,
                                    clinicalRemarks = combinedRemarksForPdf
                                )
                            }
                            showSuccessDialog = false
                            navController.popBackStack()
                        },
                        colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF00796B))
                    ) {
                        Icon(Icons.Default.Download, contentDescription = null, modifier = Modifier.size(16.dp))
                        Spacer(Modifier.width(6.dp))
                        Text("Generate Bill PDF")
                    }
                },
                dismissButton = {
                    TextButton(onClick = {
                        showSuccessDialog = false
                        navController.popBackStack()
                    }) {
                        Text("Close")
                    }
                }
            )
        }
    }
}
}
