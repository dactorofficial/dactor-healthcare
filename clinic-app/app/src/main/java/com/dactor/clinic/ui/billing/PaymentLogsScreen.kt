package com.dactor.clinic.ui.billing

import android.app.DatePickerDialog
import android.content.Intent
import android.widget.Toast
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.navigation.NavController
import com.dactor.clinic.data.model.*
import com.dactor.clinic.data.repository.AppointmentRepository
import com.dactor.clinic.data.repository.BillingRepository
import com.dactor.clinic.data.repository.ClinicRepository
import com.dactor.clinic.data.repository.DoctorRepository
import com.dactor.clinic.domain.util.BillPdfDownloader
import com.dactor.clinic.domain.util.CurrencyFormatter
import com.dactor.clinic.domain.util.PaymentLedgerHelper
import com.dactor.clinic.ui.common.ShimmerCard
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.time.LocalDate
import java.time.YearMonth
import java.time.format.DateTimeFormatter
import java.util.Calendar
import java.util.Date
import java.util.Locale

private val TealAccent = Color(0xFF0D9488)
private val CollectedGreen = Color(0xFF047857)
private val PendingAmber = Color(0xFFB45309)
private val ExpenseRed = Color(0xFFBE123C)
private val NetPurple = Color(0xFF5B21B6)
private val FreeBlue = Color(0xFF2563EB)

@OptIn(ExperimentalMaterial3Api::class, ExperimentalFoundationApi::class)
@Composable
fun PaymentLogsScreen(
    navController: NavController,
    clinicId: String,
    billingRepository: BillingRepository? = null,
    appointmentRepository: AppointmentRepository? = null,
    doctorRepository: DoctorRepository? = null,
    clinicRepository: ClinicRepository? = null
) {
    val context = LocalContext.current
    val coroutineScope = rememberCoroutineScope()

    var isLoading by remember { mutableStateOf(true) }
    var clinicObj by remember { mutableStateOf<Clinic?>(null) }
    var appointments by remember { mutableStateOf<List<Appointment>>(emptyList()) }
    var invoices by remember { mutableStateOf<List<BillingInvoice>>(emptyList()) }
    var doctors by remember { mutableStateOf<List<Doctor>>(emptyList()) }
    var transactions by remember { mutableStateOf<List<InvoiceTransaction>>(emptyList()) }
    var subscriptions by remember { mutableStateOf<List<ClinicSubscriptionPayment>>(emptyList()) }
    var settlements by remember { mutableStateOf<List<PlatformCommissionSettlement>>(emptyList()) }
    var expenses by remember { mutableStateOf<List<ClinicExpense>>(emptyList()) }
    var clinicServices by remember { mutableStateOf<List<ClinicService>>(emptyList()) }

    // Remember active tab across configuration changes / recompositions
    var selectedTab by rememberSaveable { mutableIntStateOf(0) } // 0: Payments, 1: Pending, 2: Doctors/Tests, 3: Expenses, 4: Fees

    // Period selector state
    val todayStr = remember { LocalDate.now().toString() }
    val yesterdayStr = remember(todayStr) { LocalDate.parse(todayStr).minusDays(1).toString() }
    val currentMonthStr = remember(todayStr) { todayStr.substring(0, 7) }
    val currentYearStr = remember(todayStr) { todayStr.substring(0, 4) }

    var periodScope by remember { mutableStateOf(PaymentPeriodScope.DAY) }
    var selectedDate by remember { mutableStateOf(todayStr) }
    var selectedMonth by remember { mutableStateOf(currentMonthStr) }
    var selectedYear by remember { mutableStateOf(currentYearStr) }
    var customStartDate by remember { mutableStateOf(LocalDate.parse(todayStr).minusDays(6).toString()) }
    var customEndDate by remember { mutableStateOf(todayStr) }

    // Unified filter state (applies to Payments & Pending tabs)
    var searchQuery by remember { mutableStateOf("") }
    var paymentMethodFilter by remember { mutableStateOf("all") }
    var visitTypeFilter by remember { mutableStateOf("all") }
    var selectedDoctorId by remember { mutableStateOf("all") }
    var selectedTestFilter by remember { mutableStateOf("all") }
    var pendingStatusFilter by remember { mutableStateOf("all") }

    // Modals & bottom sheets
    var showFilterSheet by remember { mutableStateOf(false) }
    var showExportSheet by remember { mutableStateOf(false) }
    var showCustomRangePicker by remember { mutableStateOf(false) }
    var selectedDetailTarget by remember { mutableStateOf<PaymentDetailTarget?>(null) }
    var quickCollectTarget by remember { mutableStateOf<Pair<Appointment, Double>?>(null) }

    // Expense dialogs
    var showAddEditExpenseDialog by remember { mutableStateOf(false) }
    var expenseToEdit by remember { mutableStateOf<ClinicExpense?>(null) }
    var expenseToDelete by remember { mutableStateOf<ClinicExpense?>(null) }

    val isLabClinic = remember(clinicObj) { clinicObj?.isDiagnosticLab() == true }

    fun refreshAll() {
        if (billingRepository == null || appointmentRepository == null || doctorRepository == null) {
            isLoading = false
            return
        }
        isLoading = true
        coroutineScope.launch {
            try {
                try {
                    clinicRepository?.reconcilePendingPayments(clinicId)
                } catch (_: Exception) {}

                val cDetails = clinicRepository?.getClinicById(clinicId)
                clinicObj = cDetails

                val appts = appointmentRepository.getAppointmentsByClinic(clinicId)
                val invs = billingRepository.getInvoicesForClinic(clinicId)
                val docs = doctorRepository.getDoctorsByClinic(clinicId)
                val txs = billingRepository.getTransactionsForClinic(clinicId)
                val subs = billingRepository.getSubscriptionPaymentsForClinic(clinicId)
                val sets = billingRepository.getCommissionSettlementsForClinic(clinicId)
                val exps = billingRepository.getExpensesForClinic(clinicId)
                val srvs = try {
                    clinicRepository?.getClinicServices(clinicId) ?: emptyList()
                } catch (_: Exception) {
                    emptyList()
                }

                appointments = appts
                invoices = invs
                doctors = docs
                transactions = txs
                subscriptions = subs
                settlements = sets
                expenses = exps
                clinicServices = srvs
            } catch (e: Exception) {
                e.printStackTrace()
                Toast.makeText(context, "Error loading payment logs: ${e.message}", Toast.LENGTH_SHORT).show()
            } finally {
                isLoading = false
            }
        }
    }

    LaunchedEffect(clinicId) {
        if (clinicId.isNotBlank()) {
            refreshAll()
        }
    }

    // 1. All unified payment rows (1 row per payment)
    val unifiedLogs = remember(appointments, invoices, doctors, transactions, isLabClinic, clinicServices) {
        PaymentLedgerHelper.buildUnifiedPaymentLogs(
            appointments = appointments,
            invoices = invoices,
            doctors = doctors,
            transactions = transactions,
            isLabClinic = isLabClinic,
            clinicServices = clinicServices
        )
    }

    val periodCheck: (String?) -> Boolean = remember(
        periodScope, selectedDate, selectedMonth, selectedYear, customStartDate, customEndDate
    ) {
        { rawDate ->
            PaymentLedgerHelper.isDateInPeriod(
                dateStr = rawDate,
                scope = periodScope,
                selectedDate = selectedDate,
                selectedMonth = selectedMonth,
                selectedYear = selectedYear,
                customStartDate = customStartDate,
                customEndDate = customEndDate
            )
        }
    }

    // 2. Period-scoped collections, pending bills, expenses, and appointments
    val periodLogs = remember(unifiedLogs, periodCheck) {
        unifiedLogs.filter { periodCheck(it.dateTime) }
    }

    val periodPendingBills = remember(appointments, invoices, doctors, isLabClinic, clinicServices, periodCheck) {
        PaymentLedgerHelper.buildPendingBills(
            appointments = appointments,
            invoices = invoices,
            doctors = doctors,
            isLabClinic = isLabClinic,
            clinicServices = clinicServices,
            periodPredicate = { dateStr -> periodCheck(dateStr) }
        )
    }

    val periodExpenses = remember(expenses, periodCheck) {
        expenses
            .filter { periodCheck(it.expenseDate) }
            .sortedWith(compareByDescending<ClinicExpense> { it.expenseDate }.thenByDescending { it.displayTime ?: "" })
    }

    val periodAppointments = remember(appointments, periodCheck) {
        appointments.filter { periodCheck(it.appointmentDate) }
    }

    val periodSubscriptions = remember(subscriptions, periodCheck) {
        subscriptions.filter { periodCheck(it.createdAt) }
    }

    // 3. Single Source of Truth Summary (Cards & Totals always agree)
    val summary = remember(periodLogs, periodPendingBills, periodExpenses, periodSubscriptions) {
        PaymentLedgerHelper.computeSummary(
            periodLogs = periodLogs,
            periodPendingBills = periodPendingBills,
            periodExpenses = periodExpenses,
            subscriptionsInPeriod = periodSubscriptions
        )
    }

    // 4. Period-scoped Doctor & Lab Test Analytics (tabs reconcile to Collected)
    val doctorStats = remember(periodLogs, periodAppointments, appointments, doctors, isLabClinic) {
        if (isLabClinic) emptyList()
        else PaymentLedgerHelper.computeDoctorPeriodStats(
            periodLogs = periodLogs,
            periodAppointments = periodAppointments,
            allAppointments = appointments,
            doctors = doctors
        )
    }

    val testStats = remember(periodLogs, appointments, invoices, clinicServices, isLabClinic) {
        if (!isLabClinic) emptyList()
        else PaymentLedgerHelper.computeTestPeriodStats(
            periodLogs = periodLogs,
            appointments = appointments,
            invoices = invoices,
            clinicServices = clinicServices
        )
    }

    // Distinct test options for Lab filter sheet
    val availableTestNames = remember(clinicServices, testStats, periodLogs) {
        val set = linkedSetOf<String>()
        testStats.forEach { set.add(it.testName) }
        clinicServices.forEach { if (it.serviceName.isNotBlank()) set.add(it.serviceName.trim()) }
        periodLogs.forEach { log -> log.testNames.forEach { if (it.isNotBlank()) set.add(it) } }
        set.toList().sorted()
    }

    // Dynamic Payment Method list built from period data + fixed standards
    val availableMethods = remember(periodLogs) {
        val baseOrder = listOf(
            "all" to "All",
            "CASH" to "Cash",
            "FONEPAY" to "Fonepay",
            "ESEWA" to "eSewa",
            "KHALTI" to "Khalti",
            "PAY_AT_DESK" to "Pay at Desk",
            "ONLINE" to "Online",
            "FREE" to "Free"
        )
        val seen = baseOrder.map { it.first.uppercase() }.toMutableSet()
        val extra = mutableListOf<Pair<String, String>>()
        for (log in periodLogs) {
            val code = log.paymentMethod.trim().uppercase()
            if (code.isNotBlank() && !seen.contains(code)) {
                seen.add(code)
                extra.add(code to formatMethodDisplayName(code))
            }
        }
        baseOrder + extra
    }

    // 5. Filtered Payments & Pending lists (search + filter sheet)
    val filteredLogs = remember(
        periodLogs, paymentMethodFilter, visitTypeFilter, selectedDoctorId, selectedTestFilter, searchQuery, isLabClinic
    ) {
        periodLogs.filter { log ->
            if (!matchesMethodFilter(log.paymentMethod, log.paymentMode, log.amount, paymentMethodFilter)) {
                return@filter false
            }
            if (!isLabClinic && visitTypeFilter != "all") {
                if (!log.visitType.equals(visitTypeFilter, ignoreCase = true)) return@filter false
            }
            if (!isLabClinic && selectedDoctorId != "all") {
                if (log.doctorId != selectedDoctorId) return@filter false
            }
            if (isLabClinic && selectedTestFilter != "all") {
                if (log.testNames.none { it.equals(selectedTestFilter, ignoreCase = true) }) return@filter false
            }
            if (searchQuery.isNotBlank()) {
                val q = searchQuery.trim().lowercase()
                val matches = log.patientName.lowercase().contains(q) ||
                    log.patientPhone.contains(q) ||
                    (log.trackingCode10Digit?.lowercase()?.contains(q) == true) ||
                    (log.referenceId?.lowercase()?.contains(q) == true) ||
                    (if (isLabClinic) log.testNames.any { it.lowercase().contains(q) }
                    else log.doctorName.lowercase().contains(q))
                if (!matches) return@filter false
            }
            true
        }
    }

    val filteredPendingBills = remember(
        periodPendingBills, paymentMethodFilter, visitTypeFilter, selectedDoctorId,
        selectedTestFilter, pendingStatusFilter, searchQuery, isLabClinic
    ) {
        periodPendingBills.filter { bill ->
            if (paymentMethodFilter != "all") {
                when (paymentMethodFilter.uppercase()) {
                    "PAY_AT_DESK" -> if (!bill.paymentMode.equals("PAY_AT_DESK", ignoreCase = true)) return@filter false
                    "ONLINE" -> if (bill.paymentMode.equals("PAY_AT_DESK", ignoreCase = true)) return@filter false
                    else -> if (!bill.paymentMode.equals(paymentMethodFilter, ignoreCase = true)) return@filter false
                }
            }
            if (!isLabClinic && visitTypeFilter != "all") {
                if (!bill.visitType.equals(visitTypeFilter, ignoreCase = true)) return@filter false
            }
            if (!isLabClinic && selectedDoctorId != "all") {
                if (bill.doctorId != selectedDoctorId) return@filter false
            }
            if (isLabClinic && selectedTestFilter != "all") {
                if (bill.testNames.none { it.equals(selectedTestFilter, ignoreCase = true) }) return@filter false
            }
            when (pendingStatusFilter) {
                "unpaid" -> if (bill.isPartlyPaid) return@filter false
                "partial" -> if (!bill.isPartlyPaid) return@filter false
            }
            if (searchQuery.isNotBlank()) {
                val q = searchQuery.trim().lowercase()
                val matches = bill.patientName.lowercase().contains(q) ||
                    bill.patientPhone.contains(q) ||
                    bill.trackingCode10Digit.lowercase().contains(q) ||
                    (if (isLabClinic) bill.testNames.any { it.lowercase().contains(q) }
                    else bill.doctorName.lowercase().contains(q))
                if (!matches) return@filter false
            }
            true
        }
    }

    fun resetFilters() {
        paymentMethodFilter = "all"
        visitTypeFilter = "all"
        selectedDoctorId = "all"
        selectedTestFilter = "all"
        pendingStatusFilter = "all"
        searchQuery = ""
    }

    val activeFilterChips = remember(
        paymentMethodFilter, visitTypeFilter, selectedDoctorId, selectedTestFilter, pendingStatusFilter, doctors, isLabClinic, selectedTab
    ) {
        buildList<Pair<String, () -> Unit>> {
            if (paymentMethodFilter != "all") {
                add(formatMethodDisplayName(paymentMethodFilter) to { paymentMethodFilter = "all" })
            }
            if (!isLabClinic && visitTypeFilter != "all") {
                val label = if (visitTypeFilter == "new") "New" else "Follow-up"
                add(label to { visitTypeFilter = "all" })
            }
            if (!isLabClinic && selectedDoctorId != "all") {
                val doc = doctors.find { it.id == selectedDoctorId }
                val label = PaymentLedgerHelper.formatDoctorDisplayName(doc?.fullName).ifBlank { doc?.fullName ?: "Doctor" }
                add(label to { selectedDoctorId = "all" })
            }
            if (isLabClinic && selectedTestFilter != "all") {
                add(selectedTestFilter to { selectedTestFilter = "all" })
            }
            if (selectedTab == 1 && pendingStatusFilter != "all") {
                val label = if (pendingStatusFilter == "unpaid") "Unpaid" else "Partly paid"
                add(label to { pendingStatusFilter = "all" })
            }
        }
    }

    val activeFilterCount = activeFilterChips.size

    // Period stepper display & future-guard
    val periodStepperLabel = remember(
        periodScope, selectedDate, selectedMonth, selectedYear, customStartDate, customEndDate, todayStr, yesterdayStr
    ) {
        when (periodScope) {
            PaymentPeriodScope.DAY -> PaymentLedgerHelper.formatStepperDayLabel(selectedDate, todayStr, yesterdayStr)
            PaymentPeriodScope.MONTH -> formatMonthLabel(selectedMonth)
            PaymentPeriodScope.YEAR -> selectedYear
            PaymentPeriodScope.CUSTOM -> formatCustomRangeLabel(customStartDate, customEndDate)
        }
    }

    val canStepNext = remember(periodScope, selectedDate, selectedMonth, selectedYear, todayStr, currentMonthStr, currentYearStr) {
        when (periodScope) {
            PaymentPeriodScope.DAY -> selectedDate < todayStr
            PaymentPeriodScope.MONTH -> selectedMonth < currentMonthStr
            PaymentPeriodScope.YEAR -> selectedYear < currentYearStr
            PaymentPeriodScope.CUSTOM -> false
        }
    }

    val exportPeriodLabel = remember(periodScope, selectedDate, selectedMonth, selectedYear, customStartDate, customEndDate) {
        when (periodScope) {
            PaymentPeriodScope.DAY -> "Day: $selectedDate"
            PaymentPeriodScope.MONTH -> "Month: $selectedMonth"
            PaymentPeriodScope.YEAR -> "Year: $selectedYear"
            PaymentPeriodScope.CUSTOM -> "$customStartDate to $customEndDate"
        }
    }

    fun exportCsv() {
        if (filteredLogs.isEmpty() && periodExpenses.isEmpty()) {
            Toast.makeText(context, "No financial records match the current period.", Toast.LENGTH_SHORT).show()
            return
        }
        val clinicName = clinicObj?.name ?: "Dactor Partner Clinic"
        val csv = PaymentLedgerHelper.generatePaymentLogsCsv(
            logs = filteredLogs,
            periodLabel = exportPeriodLabel,
            clinicName = clinicName,
            expenses = periodExpenses,
            isLabClinic = isLabClinic
        )
        val sendIntent = Intent().apply {
            action = Intent.ACTION_SEND
            putExtra(Intent.EXTRA_TEXT, csv)
            putExtra(Intent.EXTRA_SUBJECT, "Payment-Logs-$exportPeriodLabel.csv")
            type = "text/csv"
        }
        context.startActivity(Intent.createChooser(sendIntent, "Export Payment Logs CSV"))
    }

    fun exportPdf() {
        if (filteredLogs.isEmpty() && periodExpenses.isEmpty()) {
            Toast.makeText(context, "No financial records match the current period.", Toast.LENGTH_SHORT).show()
            return
        }
        BillPdfDownloader.downloadPaymentStatementPdf(
            context = context,
            clinicName = clinicObj?.name ?: "Dactor Partner Clinic",
            clinicAddress = clinicObj?.addressText ?: "Kathmandu, Nepal",
            periodLabel = exportPeriodLabel,
            logs = filteredLogs,
            expenses = periodExpenses
        )
    }

    fun showSingleDatePicker(initialDateStr: String, onPicked: (String) -> Unit) {
        val cal = Calendar.getInstance()
        try {
            val sdf = SimpleDateFormat("yyyy-MM-dd", Locale.US)
            cal.time = sdf.parse(initialDateStr) ?: Date()
        } catch (_: Exception) {}
        DatePickerDialog(
            context,
            { _, y, m, d ->
                onPicked(String.format(Locale.US, "%04d-%02d-%02d", y, m + 1, d))
            },
            cal.get(Calendar.YEAR),
            cal.get(Calendar.MONTH),
            cal.get(Calendar.DAY_OF_MONTH)
        ).show()
    }

    Scaffold(
        containerColor = MaterialTheme.colorScheme.background,
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        text = "Payment Logs",
                        fontWeight = FontWeight.Bold,
                        fontSize = 18.sp,
                        maxLines = 1
                    )
                },
                navigationIcon = {
                    IconButton(onClick = { navController.navigateUp() }) {
                        Icon(Icons.Default.ArrowBack, contentDescription = "Back")
                    }
                },
                actions = {
                    IconButton(onClick = { refreshAll() }) {
                        Icon(Icons.Default.Refresh, contentDescription = "Refresh")
                    }
                    IconButton(onClick = { showExportSheet = true }) {
                        Icon(
                            Icons.Default.FileDownload,
                            contentDescription = "Export CSV / PDF",
                            tint = TealAccent
                        )
                    }
                    IconButton(onClick = {
                        expenseToEdit = null
                        showAddEditExpenseDialog = true
                    }) {
                        Icon(
                            Icons.Default.AddCircleOutline,
                            contentDescription = "Add Expense",
                            tint = ExpenseRed
                        )
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.surface
                )
            )
        }
    ) { paddingValues ->
        if (isLoading) {
            LazyColumn(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(paddingValues),
                contentPadding = PaddingValues(16.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                items(6) {
                    ShimmerCard(lineCount = 3)
                }
            }
        } else {
            LazyColumn(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(paddingValues),
                contentPadding = PaddingValues(bottom = 32.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                // 2. Period Selector (Segmented row + Stepper)
                item(key = "period_selector") {
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 16.dp)
                            .padding(top = 8.dp),
                        verticalArrangement = Arrangement.spacedBy(6.dp)
                    ) {
                        val scopes = PaymentPeriodScope.entries
                        SingleChoiceSegmentedButtonRow(
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            scopes.forEachIndexed { idx, scope ->
                                SegmentedButton(
                                    selected = periodScope == scope,
                                    onClick = {
                                        periodScope = scope
                                        if (scope == PaymentPeriodScope.CUSTOM) {
                                            showCustomRangePicker = true
                                        }
                                    },
                                    shape = SegmentedButtonDefaults.itemShape(index = idx, count = scopes.size),
                                    icon = {},
                                    colors = SegmentedButtonDefaults.colors(
                                        activeContainerColor = TealAccent,
                                        activeContentColor = Color.White,
                                        inactiveContainerColor = MaterialTheme.colorScheme.surface,
                                        inactiveContentColor = MaterialTheme.colorScheme.onSurface
                                    ),
                                    label = {
                                        Text(
                                            text = scope.label,
                                            fontSize = 12.sp,
                                            fontWeight = FontWeight.SemiBold,
                                            maxLines = 1,
                                            overflow = TextOverflow.Ellipsis
                                        )
                                    }
                                )
                            }
                        }

                        // Stepper row under segmented selector
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.SpaceBetween
                        ) {
                            IconButton(
                                onClick = {
                                    when (periodScope) {
                                        PaymentPeriodScope.DAY -> selectedDate = stepDay(selectedDate, -1)
                                        PaymentPeriodScope.MONTH -> selectedMonth = stepMonth(selectedMonth, -1)
                                        PaymentPeriodScope.YEAR -> selectedYear = stepYear(selectedYear, -1)
                                        PaymentPeriodScope.CUSTOM -> showCustomRangePicker = true
                                    }
                                },
                                modifier = Modifier.size(40.dp)
                            ) {
                                Icon(Icons.Default.ChevronLeft, contentDescription = "Previous period")
                            }

                            Text(
                                text = periodStepperLabel,
                                fontSize = 15.sp,
                                fontWeight = FontWeight.SemiBold,
                                color = MaterialTheme.colorScheme.onSurface,
                                textAlign = TextAlign.Center,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                                modifier = Modifier
                                    .weight(1f)
                                    .clip(RoundedCornerShape(8.dp))
                                    .clickable {
                                        when (periodScope) {
                                            PaymentPeriodScope.DAY -> showSingleDatePicker(selectedDate) { selectedDate = it }
                                            PaymentPeriodScope.MONTH -> showSingleDatePicker("$selectedMonth-01") { picked ->
                                                selectedMonth = picked.substring(0, 7)
                                            }
                                            PaymentPeriodScope.YEAR -> showSingleDatePicker("$selectedYear-01-01") { picked ->
                                                selectedYear = picked.substring(0, 4)
                                            }
                                            PaymentPeriodScope.CUSTOM -> showCustomRangePicker = true
                                        }
                                    }
                                    .padding(vertical = 6.dp)
                            )

                            IconButton(
                                onClick = {
                                    when (periodScope) {
                                        PaymentPeriodScope.DAY -> selectedDate = stepDay(selectedDate, 1)
                                        PaymentPeriodScope.MONTH -> selectedMonth = stepMonth(selectedMonth, 1)
                                        PaymentPeriodScope.YEAR -> selectedYear = stepYear(selectedYear, 1)
                                        PaymentPeriodScope.CUSTOM -> showCustomRangePicker = true
                                    }
                                },
                                enabled = canStepNext || periodScope == PaymentPeriodScope.CUSTOM,
                                modifier = Modifier.size(40.dp)
                            ) {
                                Icon(
                                    imageVector = if (periodScope == PaymentPeriodScope.CUSTOM) Icons.Default.DateRange else Icons.Default.ChevronRight,
                                    contentDescription = "Next period",
                                    tint = if (canStepNext || periodScope == PaymentPeriodScope.CUSTOM) {
                                        MaterialTheme.colorScheme.onSurface
                                    } else {
                                        MaterialTheme.colorScheme.onSurface.copy(alpha = 0.28f)
                                    }
                                )
                            }
                        }
                    }
                }

                // 3. Summary Cards (2 x 2 Grid)
                item(key = "summary_grid") {
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 16.dp)
                            .padding(bottom = 4.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            SummaryMetricCard(
                                label = "Collected",
                                value = CurrencyFormatter.formatNPR(summary.collected),
                                hint = "${summary.collectedCount} ${if (summary.collectedCount == 1) "payment" else "payments"}",
                                valueColor = CollectedGreen,
                                modifier = Modifier.weight(1f),
                                onClick = { selectedTab = 0 }
                            )
                            SummaryMetricCard(
                                label = "Pending",
                                value = CurrencyFormatter.formatNPR(summary.pendingTotal),
                                hint = "${summary.pendingCount} ${if (summary.pendingCount == 1) "bill" else "bills"}",
                                valueColor = PendingAmber,
                                modifier = Modifier.weight(1f),
                                onClick = { selectedTab = 1 }
                            )
                        }
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            SummaryMetricCard(
                                label = "Expenses",
                                value = CurrencyFormatter.formatNPR(summary.expenses),
                                hint = "${summary.expensesCount} ${if (summary.expensesCount == 1) "entry" else "entries"}",
                                valueColor = ExpenseRed,
                                modifier = Modifier.weight(1f),
                                onClick = { selectedTab = 3 }
                            )
                            SummaryMetricCard(
                                label = "Net",
                                value = CurrencyFormatter.formatNPR(summary.net),
                                hint = "after fees & expenses",
                                valueColor = if (summary.net < 0) ExpenseRed else NetPurple,
                                modifier = Modifier.weight(1f),
                                onClick = { selectedTab = 4 }
                            )
                        }
                    }
                }

                // 4 + 5. Sticky Tabs + Sticky Search & Filters (both stick together cleanly!)
                stickyHeader(key = "sticky_tabs_and_search") {
                    Surface(
                        color = MaterialTheme.colorScheme.surface,
                        shadowElevation = 2.dp,
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Column(modifier = Modifier.fillMaxWidth()) {
                            val tabTitles = listOf(
                                "Payments (${filteredLogs.size})",
                                "Pending (${filteredPendingBills.size})",
                                if (isLabClinic) "Tests (${testStats.size})" else "Doctors (${doctorStats.size})",
                                "Expenses (${periodExpenses.size})",
                                "Fees"
                            )
                            ScrollableTabRow(
                                selectedTabIndex = selectedTab.coerceIn(0, 4),
                                edgePadding = 16.dp,
                                containerColor = MaterialTheme.colorScheme.surface,
                                contentColor = TealAccent
                            ) {
                                tabTitles.forEachIndexed { idx, title ->
                                    Tab(
                                        selected = selectedTab == idx,
                                        onClick = { selectedTab = idx },
                                        text = {
                                            Text(
                                                text = title,
                                                fontSize = 13.sp,
                                                fontWeight = FontWeight.SemiBold,
                                                maxLines = 1
                                            )
                                        }
                                    )
                                }
                            }

                            if (selectedTab == 0 || selectedTab == 1) {
                                Column(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .padding(horizontal = 16.dp, vertical = 10.dp),
                                    verticalArrangement = Arrangement.spacedBy(8.dp)
                                ) {
                                    Row(
                                        modifier = Modifier.fillMaxWidth(),
                                        verticalAlignment = Alignment.CenterVertically,
                                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                                    ) {
                                        OutlinedTextField(
                                            value = searchQuery,
                                            onValueChange = { searchQuery = it },
                                            placeholder = {
                                                Text(
                                                    "Search name, phone, code",
                                                    fontSize = 13.sp,
                                                    maxLines = 1,
                                                    overflow = TextOverflow.Ellipsis
                                                )
                                            },
                                            leadingIcon = {
                                                Icon(
                                                    Icons.Default.Search,
                                                    contentDescription = null,
                                                    modifier = Modifier.size(18.dp)
                                                )
                                            },
                                            trailingIcon = {
                                                if (searchQuery.isNotBlank()) {
                                                    IconButton(onClick = { searchQuery = "" }) {
                                                        Icon(
                                                            Icons.Default.Close,
                                                            contentDescription = "Clear search",
                                                            modifier = Modifier.size(16.dp)
                                                        )
                                                    }
                                                }
                                            },
                                            singleLine = true,
                                            shape = RoundedCornerShape(12.dp),
                                            modifier = Modifier
                                                .weight(1f)
                                                .heightIn(min = 48.dp)
                                        )

                                        FilledTonalButton(
                                            onClick = { showFilterSheet = true },
                                            shape = RoundedCornerShape(12.dp),
                                            contentPadding = PaddingValues(horizontal = 12.dp, vertical = 12.dp),
                                            colors = ButtonDefaults.filledTonalButtonColors(
                                                containerColor = if (activeFilterCount > 0) TealAccent.copy(alpha = 0.14f) else MaterialTheme.colorScheme.surfaceVariant,
                                                contentColor = if (activeFilterCount > 0) TealAccent else MaterialTheme.colorScheme.onSurface
                                            )
                                        ) {
                                            Icon(Icons.Default.Tune, contentDescription = null, modifier = Modifier.size(18.dp))
                                            Spacer(modifier = Modifier.width(6.dp))
                                            Text(
                                                text = if (activeFilterCount > 0) "Filters $activeFilterCount" else "Filters",
                                                fontSize = 13.sp,
                                                fontWeight = FontWeight.SemiBold,
                                                maxLines = 1
                                            )
                                        }
                                    }

                                    if (activeFilterChips.isNotEmpty()) {
                                        LazyRow(
                                            horizontalArrangement = Arrangement.spacedBy(6.dp),
                                            modifier = Modifier.fillMaxWidth()
                                        ) {
                                            items(activeFilterChips, key = { it.first }) { (label, onClear) ->
                                                InputChip(
                                                    selected = true,
                                                    onClick = onClear,
                                                    label = { Text(label, fontSize = 12.sp) },
                                                    trailingIcon = {
                                                        Icon(
                                                            Icons.Default.Close,
                                                            contentDescription = "Remove $label filter",
                                                            modifier = Modifier.size(14.dp)
                                                        )
                                                    },
                                                    colors = InputChipDefaults.inputChipColors(
                                                        selectedContainerColor = TealAccent.copy(alpha = 0.12f),
                                                        selectedLabelColor = TealAccent,
                                                        selectedTrailingIconColor = TealAccent
                                                    )
                                                )
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }

                // 6. Active Tab Body
                when (selectedTab) {
                    0 -> paymentsTabItems(
                        logs = filteredLogs,
                        isLabClinic = isLabClinic,
                        todayStr = todayStr,
                        yesterdayStr = yesterdayStr,
                        periodShortLabel = periodStepperLabel,
                        hasActiveFilters = activeFilterCount > 0 || searchQuery.isNotBlank(),
                        onClearFilters = { resetFilters() },
                        onSelectLog = { selectedDetailTarget = PaymentDetailTarget.FromLog(it) }
                    )
                    1 -> pendingTabItems(
                        bills = filteredPendingBills,
                        isLabClinic = isLabClinic,
                        todayStr = todayStr,
                        yesterdayStr = yesterdayStr,
                        appointments = appointments,
                        hasActiveFilters = activeFilterCount > 0 || searchQuery.isNotBlank(),
                        onClearFilters = { resetFilters() },
                        onSelectBill = { selectedDetailTarget = PaymentDetailTarget.FromPending(it) },
                        onCollectBill = { appt, due -> quickCollectTarget = appt to due }
                    )
                    2 -> if (isLabClinic) {
                        testsTabItems(
                            stats = testStats,
                            periodBillsCount = periodLogs.mapNotNull { it.appointmentId ?: it.invoiceId }.distinct().size,
                            onSelectTest = { testName ->
                                selectedTestFilter = testName
                                selectedTab = 0
                            }
                        )
                    } else {
                        doctorsTabItems(
                            stats = doctorStats,
                            periodAppointments = periodAppointments,
                            allAppointments = appointments,
                            onSelectDoctor = { docId ->
                                selectedDoctorId = docId
                                selectedTab = 0
                            }
                        )
                    }
                    3 -> expensesTabItems(
                        expenses = periodExpenses,
                        todayStr = todayStr,
                        yesterdayStr = yesterdayStr,
                        onEditExpense = { exp ->
                            expenseToEdit = exp
                            showAddEditExpenseDialog = true
                        },
                        onDeleteExpense = { expenseToDelete = it }
                    )
                    4 -> feesTabItems(
                        clinicObj = clinicObj,
                        platformFeesInPeriod = summary.platformFees,
                        settlements = settlements,
                        subscriptions = subscriptions
                    )
                }
            }
        }
    }

    // Bottom Sheets & Dialogs
    if (showFilterSheet) {
        PaymentFiltersBottomSheet(
            isPendingTab = selectedTab == 1,
            isLabClinic = isLabClinic,
            availableMethods = availableMethods,
            doctors = doctors,
            availableTests = availableTestNames,
            selectedMethod = paymentMethodFilter,
            selectedVisitType = visitTypeFilter,
            selectedDoctorId = selectedDoctorId,
            selectedTestName = selectedTestFilter,
            selectedPendingStatus = pendingStatusFilter,
            matchingCount = if (selectedTab == 1) filteredPendingBills.size else filteredLogs.size,
            onSelectMethod = { paymentMethodFilter = it },
            onSelectVisitType = { visitTypeFilter = it },
            onSelectDoctor = { selectedDoctorId = it },
            onSelectTest = { selectedTestFilter = it },
            onSelectPendingStatus = { pendingStatusFilter = it },
            onReset = { resetFilters() },
            onDismiss = { showFilterSheet = false }
        )
    }

    if (showExportSheet) {
        ExportSummaryBottomSheet(
            periodLabel = exportPeriodLabel,
            onExportCsv = { exportCsv() },
            onExportPdf = { exportPdf() },
            onDismiss = { showExportSheet = false }
        )
    }

    if (showCustomRangePicker) {
        CustomDateRangePickerDialog(
            initialStartDate = customStartDate,
            initialEndDate = customEndDate,
            onConfirmRange = { start, end ->
                customStartDate = start
                customEndDate = end
                showCustomRangePicker = false
            },
            onDismiss = { showCustomRangePicker = false }
        )
    }

    selectedDetailTarget?.let { target ->
        PaymentDetailBottomSheet(
            target = target,
            isLabClinic = isLabClinic,
            clinicObj = clinicObj,
            appointments = appointments,
            invoices = invoices,
            allLogs = unifiedLogs,
            doctors = doctors,
            clinicServices = clinicServices,
            onCollectBalance = { appt, due ->
                selectedDetailTarget = null
                quickCollectTarget = appt to due
            },
            onOpenAppointment = { originAppt ->
                val matchingLog = unifiedLogs.find { it.appointmentId == originAppt.id }
                if (matchingLog != null) {
                    selectedDetailTarget = PaymentDetailTarget.FromLog(matchingLog)
                } else {
                    val matchingPending = periodPendingBills.find { it.appointmentId == originAppt.id }
                    if (matchingPending != null) {
                        selectedDetailTarget = PaymentDetailTarget.FromPending(matchingPending)
                    } else {
                        Toast.makeText(context, "Visit #${originAppt.trackingCode10Digit} has no bill record yet", Toast.LENGTH_SHORT).show()
                    }
                }
            },
            onDismiss = { selectedDetailTarget = null }
        )
    }

    quickCollectTarget?.let { (appt, defaultDue) ->
        QuickCollectBalanceDialog(
            appointment = appt,
            defaultAmount = defaultDue,
            onDismiss = { quickCollectTarget = null },
            onConfirmCollect = { amt, note ->
                quickCollectTarget = null
                coroutineScope.launch {
                    val savedInv = billingRepository?.pushQuickPayment(
                        appointment = appt,
                        paymentDate = todayStr,
                        paidAmount = amt,
                        note = note
                    )
                    if (savedInv != null) {
                        Toast.makeText(context, "\u2713 Payment recorded: ${CurrencyFormatter.formatNPR(amt)}", Toast.LENGTH_SHORT).show()
                        refreshAll()
                    } else {
                        Toast.makeText(context, "Could not record payment", Toast.LENGTH_SHORT).show()
                    }
                }
            }
        )
    }

    if (showAddEditExpenseDialog) {
        AddEditExpenseDialog(
            initialDate = if (periodScope == PaymentPeriodScope.DAY) selectedDate else todayStr,
            existingExpense = expenseToEdit,
            onDismiss = {
                showAddEditExpenseDialog = false
                expenseToEdit = null
            },
            onSave = { formExpense ->
                val toSave = formExpense.copy(clinicId = clinicId)
                coroutineScope.launch {
                    val result = if (expenseToEdit != null) {
                        billingRepository?.updateExpense(toSave)
                    } else {
                        billingRepository?.addExpense(toSave)
                    }
                    if (result != null) {
                        expenses = if (expenseToEdit != null) {
                            expenses.map { if (it.id == result.id) result else it }
                        } else {
                            listOf(result) + expenses
                        }
                        showAddEditExpenseDialog = false
                        expenseToEdit = null
                        Toast.makeText(context, "\u2713 Expense saved: ${result.title}", Toast.LENGTH_SHORT).show()
                    } else {
                        Toast.makeText(context, "Failed to save expense", Toast.LENGTH_SHORT).show()
                    }
                }
            }
        )
    }

    expenseToDelete?.let { exp ->
        AlertDialog(
            onDismissRequest = { expenseToDelete = null },
            title = { Text("Delete Expense?", fontWeight = FontWeight.Bold) },
            text = { Text("Are you sure you want to delete '${exp.title}' (${CurrencyFormatter.formatNPR(exp.amount)})?") },
            confirmButton = {
                Button(
                    onClick = {
                        coroutineScope.launch {
                            val success = billingRepository?.deleteExpense(exp.id) ?: false
                            if (success) {
                                expenses = expenses.filter { it.id != exp.id }
                                Toast.makeText(context, "\u2713 Expense deleted", Toast.LENGTH_SHORT).show()
                            } else {
                                Toast.makeText(context, "Failed to delete expense", Toast.LENGTH_SHORT).show()
                            }
                            expenseToDelete = null
                        }
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = ExpenseRed)
                ) {
                    Text("Delete", fontWeight = FontWeight.Bold, color = Color.White)
                }
            },
            dismissButton = {
                TextButton(onClick = { expenseToDelete = null }) { Text("Cancel") }
            }
        )
    }
}

@Composable
private fun SummaryMetricCard(
    label: String,
    value: String,
    hint: String,
    valueColor: Color,
    modifier: Modifier = Modifier,
    onClick: () -> Unit
) {
    Card(
        modifier = modifier
            .heightIn(min = 84.dp)
            .clickable(onClick = onClick),
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant)
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(12.dp),
            verticalArrangement = Arrangement.spacedBy(2.dp)
        ) {
            Text(
                text = label,
                fontSize = 12.sp,
                fontWeight = FontWeight.Medium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 1
            )
            Text(
                text = value,
                fontSize = 20.sp,
                fontWeight = FontWeight.Bold,
                color = valueColor,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
            Text(
                text = hint,
                fontSize = 11.sp,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
        }
    }
}

@OptIn(ExperimentalFoundationApi::class, ExperimentalLayoutApi::class)
private fun LazyListScope.paymentsTabItems(
    logs: List<UnifiedPaymentLogEntry>,
    isLabClinic: Boolean,
    todayStr: String,
    yesterdayStr: String,
    periodShortLabel: String,
    hasActiveFilters: Boolean,
    onClearFilters: () -> Unit,
    onSelectLog: (UnifiedPaymentLogEntry) -> Unit
) {
    if (logs.isEmpty()) {
        item(key = "empty_payments") {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 24.dp, vertical = 48.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                Icon(
                    imageVector = Icons.Default.ReceiptLong,
                    contentDescription = null,
                    tint = Color(0xFFCBD5E1),
                    modifier = Modifier.size(48.dp)
                )
                Text(
                    text = if (hasActiveFilters) "No payments match your filters" else "No payments for $periodShortLabel",
                    fontSize = 15.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = MaterialTheme.colorScheme.onSurface,
                    textAlign = TextAlign.Center
                )
                Text(
                    text = if (hasActiveFilters) "Try clearing search or filter selections." else "Payments you collect will appear here.",
                    fontSize = 13.sp,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    textAlign = TextAlign.Center
                )
                if (hasActiveFilters) {
                    TextButton(onClick = onClearFilters) {
                        Text("Clear filters", color = TealAccent, fontWeight = FontWeight.Bold)
                    }
                }
            }
        }
        return
    }

    val grouped = logs.groupBy {
        PaymentLedgerHelper.extractLocalDate(it.dateTime).ifBlank { "other" }
    }

    grouped.forEach { (dateKey, dayLogs) ->
        val dayTotal = dayLogs.sumOf { it.amount }
        item(key = "pay_hdr_$dateKey") {
            DaySectionHeader(
                title = PaymentLedgerHelper.formatListDayHeader(dateKey, todayStr, yesterdayStr),
                rightSummary = "${CurrencyFormatter.formatNPR(dayTotal)} \u00B7 ${dayLogs.size}"
            )
        }
        items(dayLogs, key = { it.id }) { log ->
            val cleanDoc = PaymentLedgerHelper.formatDoctorDisplayName(log.doctorName)
            val subtitle = buildString {
                append("#${log.trackingCode10Digit ?: "\u2013"}")
                if (isLabClinic) {
                    if (log.testNames.isNotEmpty()) append(" \u00B7 ${log.testNames.joinToString(", ")}")
                } else {
                    if (cleanDoc.isNotBlank()) append(" \u00B7 $cleanDoc")
                }
            }
            val amountText = when {
                log.isRefund || log.amount < 0.0 -> CurrencyFormatter.formatNPR(log.amount)
                log.amount == 0.0 -> "Free"
                else -> CurrencyFormatter.formatNPR(log.amount)
            }
            val amountColor = when {
                log.isRefund || log.amount < 0.0 -> ExpenseRed
                log.amount == 0.0 -> FreeBlue
                else -> CollectedGreen
            }
            val rowTime = PaymentLedgerHelper.formatRowTime(log.dateTime)
            val (methodBg, methodFg) = getMethodPillColors(log.paymentMethod)

            Card(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp)
                    .heightIn(min = 72.dp)
                    .clickable { onSelectLog(log) },
                shape = RoundedCornerShape(12.dp),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant)
            ) {
                Column(
                    modifier = Modifier.padding(12.dp),
                    verticalArrangement = Arrangement.spacedBy(5.dp)
                ) {
                    // Line 1: Patient Name + Right-aligned Amount
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(
                            text = log.patientName,
                            fontSize = 15.sp,
                            fontWeight = FontWeight.SemiBold,
                            color = MaterialTheme.colorScheme.onSurface,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                            modifier = Modifier.weight(1f).padding(end = 8.dp)
                        )
                        Text(
                            text = amountText,
                            fontSize = 15.sp,
                            fontWeight = FontWeight.Bold,
                            color = amountColor,
                            maxLines = 1
                        )
                    }

                    // Line 2: #Code · Doctor/Tests + Right-aligned Method Pill & Time
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(
                            text = subtitle,
                            fontSize = 12.sp,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                            modifier = Modifier.weight(1f).padding(end = 8.dp)
                        )
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(6.dp)
                        ) {
                            PillBadge(
                                text = formatMethodDisplayName(log.paymentMethod).uppercase(Locale.US),
                                bg = methodBg,
                                fg = methodFg,
                                cornerDp = 6
                            )
                            if (rowTime.isNotBlank()) {
                                Text(
                                    text = rowTime,
                                    fontSize = 12.sp,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    maxLines = 1
                                )
                            }
                        }
                    }

                    // Line 3: Status Badges (only those that apply)
                    val badges = buildList<Triple<String, Color, Color>> {
                        if (!isLabClinic) {
                            when (log.visitType.lowercase()) {
                                "new" -> add(Triple("NEW", Color(0xFFD1FAE5), Color(0xFF065F46)))
                                "follow_up" -> add(Triple("FOLLOW-UP", Color(0xFFDBEAFE), Color(0xFF1E40AF)))
                            }
                        }
                        if (log.amount == 0.0 && !log.isRefund) {
                            add(Triple("FREE", Color(0xFFEFF6FF), Color(0xFF2563EB)))
                        }
                        log.paymentPart?.let { (k, n) ->
                            add(Triple("PART $k/$n", Color(0xFFFEF3C7), Color(0xFF92400E)))
                        }
                        if (log.paymentMode.equals("PAY_AT_DESK", ignoreCase = true) && log.serviceChargeAmount > 0.0) {
                            add(Triple("PAY AT DESK +5%", Color(0xFFEDE9FE), Color(0xFF5B21B6)))
                        }
                        if (log.isRefund || log.amount < 0.0) {
                            add(Triple("REFUND", Color(0xFFFFE4E6), Color(0xFF9F1239)))
                        }
                    }
                    if (badges.isNotEmpty()) {
                        FlowRow(
                            horizontalArrangement = Arrangement.spacedBy(6.dp),
                            verticalArrangement = Arrangement.spacedBy(4.dp)
                        ) {
                            badges.forEach { (text, bg, fg) ->
                                PillBadge(text = text, bg = bg, fg = fg, cornerDp = 4)
                            }
                        }
                    }
                }
            }
        }
    }
}

@OptIn(ExperimentalFoundationApi::class, ExperimentalLayoutApi::class)
private fun LazyListScope.pendingTabItems(
    bills: List<PendingBillEntry>,
    isLabClinic: Boolean,
    todayStr: String,
    yesterdayStr: String,
    appointments: List<Appointment>,
    hasActiveFilters: Boolean,
    onClearFilters: () -> Unit,
    onSelectBill: (PendingBillEntry) -> Unit,
    onCollectBill: (Appointment, Double) -> Unit
) {
    if (bills.isEmpty()) {
        item(key = "empty_pending") {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 24.dp, vertical = 48.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                Icon(
                    imageVector = Icons.Default.CheckCircleOutline,
                    contentDescription = null,
                    tint = Color(0xFFCBD5E1),
                    modifier = Modifier.size(48.dp)
                )
                Text(
                    text = if (hasActiveFilters) "No pending bills match your filters" else "No pending bills",
                    fontSize = 15.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = MaterialTheme.colorScheme.onSurface
                )
                Text(
                    text = if (hasActiveFilters) "Try clearing search or filter selections." else "Unpaid and partly paid bills for visits in this period appear here.",
                    fontSize = 13.sp,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    textAlign = TextAlign.Center
                )
                if (hasActiveFilters) {
                    TextButton(onClick = onClearFilters) {
                        Text("Clear filters", color = TealAccent, fontWeight = FontWeight.Bold)
                    }
                }
            }
        }
        return
    }

    val grouped = bills.groupBy { it.visitDate.ifBlank { "other" } }
    grouped.forEach { (dateKey, dayBills) ->
        val dayDue = dayBills.sumOf { it.balanceDue }
        item(key = "pend_hdr_$dateKey") {
            DaySectionHeader(
                title = PaymentLedgerHelper.formatListDayHeader(dateKey, todayStr, yesterdayStr),
                rightSummary = "${CurrencyFormatter.formatNPR(dayDue)} due \u00B7 ${dayBills.size}"
            )
        }
        items(dayBills, key = { it.appointmentId }) { bill ->
            val cleanDoc = PaymentLedgerHelper.formatDoctorDisplayName(bill.doctorName)
            val leftSubtitle = buildString {
                append("#${bill.trackingCode10Digit}")
                if (isLabClinic) {
                    if (bill.testNames.isNotEmpty()) append(" \u00B7 ${bill.testNames.joinToString(", ")}")
                } else {
                    if (cleanDoc.isNotBlank()) append(" \u00B7 $cleanDoc")
                }
                append(" \u00B7 of ${CurrencyFormatter.formatNPR(bill.totalAmount)}")
            }
            val matchingAppt = appointments.find { it.id == bill.appointmentId }

            Card(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp)
                    .heightIn(min = 72.dp)
                    .clickable { onSelectBill(bill) },
                shape = RoundedCornerShape(12.dp),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant)
            ) {
                Column(
                    modifier = Modifier.padding(12.dp),
                    verticalArrangement = Arrangement.spacedBy(5.dp)
                ) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(
                            text = bill.patientName,
                            fontSize = 15.sp,
                            fontWeight = FontWeight.SemiBold,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                            modifier = Modifier.weight(1f).padding(end = 8.dp)
                        )
                        Text(
                            text = "${CurrencyFormatter.formatNPR(bill.balanceDue)} due",
                            fontSize = 15.sp,
                            fontWeight = FontWeight.Bold,
                            color = PendingAmber,
                            maxLines = 1
                        )
                    }

                    Text(
                        text = leftSubtitle,
                        fontSize = 12.sp,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        FlowRow(
                            horizontalArrangement = Arrangement.spacedBy(6.dp),
                            verticalArrangement = Arrangement.spacedBy(4.dp),
                            modifier = Modifier.weight(1f)
                        ) {
                            if (bill.isPartlyPaid) {
                                PillBadge("PARTLY PAID", Color(0xFFFFEDD5), Color(0xFF9A3412), cornerDp = 4)
                            } else {
                                PillBadge("UNPAID", Color(0xFFFEF3C7), Color(0xFF92400E), cornerDp = 4)
                            }
                            if (bill.paymentMode.equals("PAY_AT_DESK", ignoreCase = true)) {
                                PillBadge("PAY AT DESK", Color(0xFFEDE9FE), Color(0xFF5B21B6), cornerDp = 4)
                            }
                        }
                        if (matchingAppt != null) {
                            TextButton(
                                onClick = { onCollectBill(matchingAppt, bill.balanceDue) },
                                contentPadding = PaddingValues(horizontal = 10.dp, vertical = 2.dp),
                                modifier = Modifier.height(30.dp)
                            ) {
                                Text("Collect", color = TealAccent, fontSize = 13.sp, fontWeight = FontWeight.Bold)
                            }
                        }
                    }
                }
            }
        }
    }
}

private fun LazyListScope.doctorsTabItems(
    stats: List<DoctorPeriodStat>,
    periodAppointments: List<Appointment>,
    allAppointments: List<Appointment>,
    onSelectDoctor: (String) -> Unit
) {
    val validPeriod = periodAppointments.filter {
        !it.status.equals("cancelled", true) && !it.status.equals("rejected", true) && !it.checkinStatus.equals("cancelled", true)
    }
    val totalVisits = stats.sumOf { it.totalVisits }.takeIf { it > 0 } ?: validPeriod.size
    val totalNew = stats.sumOf { it.newPatients }
    val totalFollowup = stats.sumOf { it.followupPatients }

    item(key = "doctors_header_strip") {
        Surface(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 4.dp),
            shape = RoundedCornerShape(10.dp),
            color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f)
        ) {
            Text(
                text = "Visits $totalVisits \u00B7 New $totalNew \u00B7 Follow-ups $totalFollowup",
                fontSize = 12.5.sp,
                fontWeight = FontWeight.SemiBold,
                color = MaterialTheme.colorScheme.onSurface,
                modifier = Modifier.padding(horizontal = 12.dp, vertical = 10.dp)
            )
        }
    }

    if (stats.isEmpty()) {
        item(key = "empty_doctors") {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(32.dp),
                contentAlignment = Alignment.Center
            ) {
                Text("No doctor activity in this period.", fontSize = 13.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
        return
    }

    items(stats, key = { it.doctorId }) { doc ->
        val sharePct = doc.sharePercent.toInt().coerceIn(0, 100)
        Card(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp)
                .clickable { onSelectDoctor(doc.doctorId) },
            shape = RoundedCornerShape(12.dp),
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
            border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant)
        ) {
            Column(
                modifier = Modifier.padding(12.dp),
                verticalArrangement = Arrangement.spacedBy(6.dp)
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = doc.doctorName,
                        fontSize = 15.sp,
                        fontWeight = FontWeight.SemiBold,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.weight(1f).padding(end = 8.dp)
                    )
                    Text(
                        text = CurrencyFormatter.formatNPR(doc.collectedAmount),
                        fontSize = 15.sp,
                        fontWeight = FontWeight.Bold,
                        color = CollectedGreen,
                        maxLines = 1
                    )
                }

                Text(
                    text = "${doc.specialty} \u00B7 Fee ${CurrencyFormatter.formatNPR(doc.consultationFee)}",
                    fontSize = 12.sp,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )

                Text(
                    text = buildAnnotatedString {
                        withStyle(SpanStyle(fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onSurface)) {
                            append("${doc.totalVisits}")
                        }
                        append(" visits   ")
                        withStyle(SpanStyle(fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onSurface)) {
                            append("${doc.newPatients}")
                        }
                        append(" new   ")
                        withStyle(SpanStyle(fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onSurface)) {
                            append("${doc.followupPatients}")
                        }
                        append(" follow-ups")
                    },
                    fontSize = 12.sp,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    LinearProgressIndicator(
                        progress = { (doc.sharePercent / 100.0).toFloat().coerceIn(0f, 1f) },
                        modifier = Modifier
                            .weight(1f)
                            .height(6.dp)
                            .clip(RoundedCornerShape(3.dp)),
                        color = TealAccent,
                        trackColor = TealAccent.copy(alpha = 0.16f)
                    )
                    Text(
                        text = "$sharePct% of income",
                        fontSize = 11.5.sp,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 1
                    )
                }
            }
        }
    }
}

private fun LazyListScope.testsTabItems(
    stats: List<LabTestPeriodStat>,
    periodBillsCount: Int,
    onSelectTest: (String) -> Unit
) {
    val totalTestsDone = stats.sumOf { it.count }
    val totalTestIncome = stats.sumOf { it.collectedIncome }

    item(key = "tests_header_strip") {
        Surface(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 4.dp),
            shape = RoundedCornerShape(10.dp),
            color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f)
        ) {
            Text(
                text = "Tests done $totalTestsDone \u00B7 Bills $periodBillsCount",
                fontSize = 12.5.sp,
                fontWeight = FontWeight.SemiBold,
                color = MaterialTheme.colorScheme.onSurface,
                modifier = Modifier.padding(horizontal = 12.dp, vertical = 10.dp)
            )
        }
    }

    if (stats.isEmpty()) {
        item(key = "empty_tests") {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(32.dp),
                contentAlignment = Alignment.Center
            ) {
                Text("No paid test collections in this period.", fontSize = 13.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
        return
    }

    items(stats, key = { it.testName }) { stat ->
        val sharePct = stat.sharePercent.toInt().coerceIn(0, 100)
        Card(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp)
                .clickable { onSelectTest(stat.testName) },
            shape = RoundedCornerShape(12.dp),
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
            border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant)
        ) {
            Column(
                modifier = Modifier.padding(12.dp),
                verticalArrangement = Arrangement.spacedBy(6.dp)
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = stat.testName,
                        fontSize = 15.sp,
                        fontWeight = FontWeight.SemiBold,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.weight(1f).padding(end = 8.dp)
                    )
                    Text(
                        text = CurrencyFormatter.formatNPR(stat.collectedIncome),
                        fontSize = 15.sp,
                        fontWeight = FontWeight.Bold,
                        color = CollectedGreen,
                        maxLines = 1
                    )
                }

                Text(
                    text = "${stat.count} ${if (stat.count == 1) "test" else "tests"} \u00B7 ${CurrencyFormatter.formatNPR(stat.unitPrice)} each",
                    fontSize = 12.sp,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    LinearProgressIndicator(
                        progress = { (stat.sharePercent / 100.0).toFloat().coerceIn(0f, 1f) },
                        modifier = Modifier
                            .weight(1f)
                            .height(6.dp)
                            .clip(RoundedCornerShape(3.dp)),
                        color = TealAccent,
                        trackColor = TealAccent.copy(alpha = 0.16f)
                    )
                    Text(
                        text = "$sharePct% of income",
                        fontSize = 11.5.sp,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 1
                    )
                }
            }
        }
    }

    item(key = "tests_total_footer") {
        Surface(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 4.dp),
            shape = RoundedCornerShape(12.dp),
            color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.45f),
            border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant)
        ) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 14.dp, vertical = 12.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text("Total", fontSize = 14.sp, fontWeight = FontWeight.Bold)
                Text(
                    text = CurrencyFormatter.formatNPR(totalTestIncome),
                    fontSize = 15.sp,
                    fontWeight = FontWeight.Bold,
                    color = CollectedGreen
                )
            }
        }
    }
}

@OptIn(ExperimentalFoundationApi::class)
private fun LazyListScope.expensesTabItems(
    expenses: List<ClinicExpense>,
    todayStr: String,
    yesterdayStr: String,
    onEditExpense: (ClinicExpense) -> Unit,
    onDeleteExpense: (ClinicExpense) -> Unit
) {
    if (expenses.isEmpty()) {
        item(key = "empty_expenses") {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 24.dp, vertical = 48.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                Icon(
                    imageVector = Icons.Default.ReceiptLong,
                    contentDescription = null,
                    tint = Color(0xFFCBD5E1),
                    modifier = Modifier.size(48.dp)
                )
                Text("No expenses for this period", fontSize = 15.sp, fontWeight = FontWeight.SemiBold)
                Text(
                    "Use + in the top bar to log clinic expenses.",
                    fontSize = 13.sp,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    textAlign = TextAlign.Center
                )
            }
        }
        return
    }

    val grouped = expenses.groupBy { it.expenseDate.take(10).ifBlank { "other" } }
    grouped.forEach { (dateKey, dayExpenses) ->
        val daySum = dayExpenses.sumOf { it.amount }
        item(key = "exp_hdr_$dateKey") {
            DaySectionHeader(
                title = PaymentLedgerHelper.formatListDayHeader(dateKey, todayStr, yesterdayStr),
                rightSummary = "${CurrencyFormatter.formatNPR(-daySum)} \u00B7 ${dayExpenses.size}"
            )
        }
        items(dayExpenses, key = { it.id }) { expense ->
            var menuExpanded by remember { mutableStateOf(false) }
            Card(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp),
                shape = RoundedCornerShape(12.dp),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant)
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(12.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Column(
                        modifier = Modifier.weight(1f),
                        verticalArrangement = Arrangement.spacedBy(4.dp)
                    ) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text(
                                text = expense.title,
                                fontSize = 15.sp,
                                fontWeight = FontWeight.SemiBold,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                                modifier = Modifier.weight(1f).padding(end = 8.dp)
                            )
                            Text(
                                text = CurrencyFormatter.formatNPR(-expense.amount),
                                fontSize = 15.sp,
                                fontWeight = FontWeight.Bold,
                                color = ExpenseRed,
                                maxLines = 1
                            )
                        }

                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(6.dp)
                        ) {
                            PillBadge(
                                text = expense.category.replace('_', ' '),
                                bg = getExpenseCategoryBgColor(expense.category),
                                fg = getExpenseCategoryTextColor(expense.category),
                                cornerDp = 4
                            )
                            Text(
                                text = formatMethodDisplayName(expense.paymentMethod),
                                fontSize = 12.sp,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                            val displayTime = expense.displayTime?.let { PaymentLedgerHelper.formatRowTime("2026-01-01 $it") }
                            if (!displayTime.isNullOrBlank()) {
                                Text(
                                    text = "\u00B7 $displayTime",
                                    fontSize = 12.sp,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                            }
                        }

                        val voucherOrRemarks = listOfNotNull(
                            expense.displayVoucherNumber?.let { "Voucher #$it" },
                            expense.displayRemarks
                        ).joinToString(" \u00B7 ")
                        if (voucherOrRemarks.isNotBlank()) {
                            Text(
                                text = voucherOrRemarks,
                                fontSize = 11.5.sp,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis
                            )
                        }
                    }

                    Box {
                        IconButton(
                            onClick = { menuExpanded = true },
                            modifier = Modifier.size(32.dp)
                        ) {
                            Icon(
                                Icons.Default.MoreVert,
                                contentDescription = "Expense options",
                                tint = MaterialTheme.colorScheme.onSurfaceVariant,
                                modifier = Modifier.size(18.dp)
                            )
                        }
                        DropdownMenu(
                            expanded = menuExpanded,
                            onDismissRequest = { menuExpanded = false }
                        ) {
                            DropdownMenuItem(
                                text = { Text("Edit") },
                                leadingIcon = { Icon(Icons.Default.Edit, contentDescription = null, modifier = Modifier.size(18.dp)) },
                                onClick = {
                                    menuExpanded = false
                                    onEditExpense(expense)
                                }
                            )
                            DropdownMenuItem(
                                text = { Text("Delete", color = ExpenseRed) },
                                leadingIcon = { Icon(Icons.Default.DeleteOutline, contentDescription = null, tint = ExpenseRed, modifier = Modifier.size(18.dp)) },
                                onClick = {
                                    menuExpanded = false
                                    onDeleteExpense(expense)
                                }
                            )
                        }
                    }
                }
            }
        }
    }
}

private fun LazyListScope.feesTabItems(
    clinicObj: Clinic?,
    platformFeesInPeriod: Double,
    settlements: List<PlatformCommissionSettlement>,
    subscriptions: List<ClinicSubscriptionPayment>
) {
    val settledTotal = settlements
        .filter { it.status.equals("settled", ignoreCase = true) }
        .sumOf { it.platformFeeAmount }
    val dueTotal = settlements
        .filter { !it.status.equals("settled", ignoreCase = true) }
        .sumOf { it.platformFeeAmount }
        .takeIf { it > 0.0 } ?: platformFeesInPeriod

    // Section 1: Platform fee (5% on Pay-at-Desk)
    item(key = "fees_platform_section") {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp)
                .padding(top = 6.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Text(
                text = "Platform fee (5% on Pay-at-Desk)",
                fontSize = 14.sp,
                fontWeight = FontWeight.Bold
            )

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                SummaryMetricCard(
                    label = "Due",
                    value = CurrencyFormatter.formatNPR(dueTotal),
                    hint = "period accrual",
                    valueColor = PendingAmber,
                    modifier = Modifier.weight(1f),
                    onClick = {}
                )
                SummaryMetricCard(
                    label = "Settled",
                    value = CurrencyFormatter.formatNPR(settledTotal),
                    hint = "${settlements.count { it.status.equals("settled", true) }} settlements",
                    valueColor = CollectedGreen,
                    modifier = Modifier.weight(1f),
                    onClick = {}
                )
            }

            if (settlements.isEmpty()) {
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(12.dp),
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                    border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant)
                ) {
                    Text(
                        text = "No platform settlements recorded yet.",
                        fontSize = 12.5.sp,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(14.dp)
                    )
                }
            } else {
                settlements.forEach { setRow ->
                    Card(
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(12.dp),
                        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant)
                    ) {
                        Column(
                            modifier = Modifier.padding(12.dp),
                            verticalArrangement = Arrangement.spacedBy(4.dp)
                        ) {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Text(
                                    text = "${setRow.periodStart} \u2192 ${setRow.periodEnd}",
                                    fontSize = 13.5.sp,
                                    fontWeight = FontWeight.SemiBold
                                )
                                Text(
                                    text = CurrencyFormatter.formatNPR(setRow.platformFeeAmount),
                                    fontSize = 14.sp,
                                    fontWeight = FontWeight.Bold,
                                    color = TealAccent
                                )
                            }
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Text(
                                    text = "Ref: ${setRow.settlementReference ?: "\u2013"} \u00B7 Desk ${CurrencyFormatter.formatNPR(setRow.totalPayAtDeskAmount)}",
                                    fontSize = 12.sp,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                                val isSettled = setRow.status.equals("settled", ignoreCase = true)
                                PillBadge(
                                    text = setRow.status.uppercase(),
                                    bg = if (isSettled) Color(0xFFD1FAE5) else Color(0xFFFEF3C7),
                                    fg = if (isSettled) Color(0xFF065F46) else Color(0xFF92400E),
                                    cornerDp = 4
                                )
                            }
                        }
                    }
                }
            }
        }
    }

    // Section 2: Subscription
    item(key = "fees_subscription_section") {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp)
                .padding(top = 8.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Text(
                text = "Subscription",
                fontSize = 14.sp,
                fontWeight = FontWeight.Bold
            )

            Card(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(12.dp),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant)
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(12.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Column {
                        val planLabel = if (clinicObj?.activationPlan?.contains("12") == true) "Annual Plan" else "Monthly Plan"
                        Text(planLabel, fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
                        val expDate = clinicObj?.activationExpiresAt?.take(10)?.ifBlank { null } ?: "Active"
                        Text("Next due / expires: $expDate", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    PillBadge(
                        text = if (clinicObj?.isActivated != false) "ACTIVE" else "EXPIRED",
                        bg = if (clinicObj?.isActivated != false) Color(0xFFD1FAE5) else Color(0xFFFFE4E6),
                        fg = if (clinicObj?.isActivated != false) Color(0xFF065F46) else Color(0xFF9F1239),
                        cornerDp = 6
                    )
                }
            }

            if (subscriptions.isEmpty()) {
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(12.dp),
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                    border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant)
                ) {
                    Text(
                        text = "No subscription payments recorded yet.",
                        fontSize = 12.5.sp,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(14.dp)
                    )
                }
            } else {
                subscriptions.forEach { sub ->
                    val isVerified = sub.status.equals("verified", ignoreCase = true) || sub.status.equals("paid", ignoreCase = true)
                    Card(
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(12.dp),
                        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant)
                    ) {
                        Column(
                            modifier = Modifier.padding(12.dp),
                            verticalArrangement = Arrangement.spacedBy(4.dp)
                        ) {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Text(
                                    text = if (sub.durationMonths == 12) "12 Months (Annual Plan)" else "${sub.durationMonths} Month Plan",
                                    fontSize = 13.5.sp,
                                    fontWeight = FontWeight.SemiBold
                                )
                                Text(
                                    text = CurrencyFormatter.formatNPR(sub.amount),
                                    fontSize = 14.sp,
                                    fontWeight = FontWeight.Bold,
                                    color = CollectedGreen
                                )
                            }
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                val dt = PaymentLedgerHelper.extractLocalDate(sub.createdAt).ifBlank { "\u2013" }
                                Text(
                                    text = "$dt \u00B7 ${formatMethodDisplayName(sub.paymentMethod)} \u00B7 Ref ${sub.referenceId ?: "\u2013"}",
                                    fontSize = 12.sp,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                                PillBadge(
                                    text = sub.status.uppercase(),
                                    bg = if (isVerified) Color(0xFFD1FAE5) else Color(0xFFFEF3C7),
                                    fg = if (isVerified) Color(0xFF065F46) else Color(0xFF92400E),
                                    cornerDp = 4
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun DaySectionHeader(
    title: String,
    rightSummary: String
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(MaterialTheme.colorScheme.background)
            .padding(horizontal = 16.dp)
            .height(32.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(
            text = title,
            fontSize = 12.sp,
            fontWeight = FontWeight.Bold,
            letterSpacing = 0.6.sp,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            maxLines = 1
        )
        Text(
            text = rightSummary,
            fontSize = 12.sp,
            fontWeight = FontWeight.SemiBold,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            maxLines = 1
        )
    }
}

@Composable
private fun PillBadge(
    text: String,
    bg: Color,
    fg: Color,
    cornerDp: Int = 4
) {
    Box(
        modifier = Modifier
            .clip(RoundedCornerShape(cornerDp.dp))
            .background(bg)
            .padding(horizontal = 6.dp, vertical = 2.dp)
    ) {
        Text(
            text = text,
            fontSize = 10.sp,
            fontWeight = FontWeight.Bold,
            color = fg,
            maxLines = 1
        )
    }
}

private fun getMethodPillColors(method: String): Pair<Color, Color> = when (method.trim().uppercase()) {
    "CASH" -> Color(0xFFECFDF5) to Color(0xFF047857)
    "FONEPAY", "FONEPAY_QR", "QR" -> Color(0xFFFEF2F2) to Color(0xFFB91C1C)
    "ESEWA" -> Color(0xFFF0FDF4) to Color(0xFF15803D)
    "KHALTI" -> Color(0xFFF5F3FF) to Color(0xFF6D28D9)
    "PAY_AT_DESK" -> Color(0xFFEDE9FE) to Color(0xFF5B21B6)
    "ONLINE", "CONNECTIPS", "BANK_TRANSFER" -> Color(0xFFEFF6FF) to Color(0xFF1D4ED8)
    "FREE" -> Color(0xFFF1F5F9) to Color(0xFF475569)
    else -> Color(0xFFF1F5F9) to Color(0xFF475569)
}

private fun matchesMethodFilter(
    logMethod: String,
    logMode: String,
    logAmount: Double,
    filter: String
): Boolean {
    if (filter.equals("all", ignoreCase = true)) return true
    val target = filter.trim().uppercase()
    val m = logMethod.trim().uppercase()
    val mode = logMode.trim().uppercase()
    return when (target) {
        "PAY_AT_DESK" -> mode == "PAY_AT_DESK" || m == "PAY_AT_DESK"
        "ONLINE" -> mode == "ONLINE" || m in listOf("ESEWA", "KHALTI", "FONEPAY", "CONNECTIPS", "ONLINE")
        "FREE" -> logAmount == 0.0 || m == "FREE"
        else -> m == target
    }
}

private fun formatMonthLabel(yyyyMm: String): String = try {
    YearMonth.parse(yyyyMm).format(DateTimeFormatter.ofPattern("MMMM yyyy", Locale.US))
} catch (_: Exception) {
    yyyyMm
}

private fun formatCustomRangeLabel(startStr: String, endStr: String): String = try {
    val s = LocalDate.parse(minOf(startStr, endStr))
    val e = LocalDate.parse(maxOf(startStr, endStr))
    val fmtNoYear = DateTimeFormatter.ofPattern("dd MMM", Locale.US)
    val fmtWithYear = DateTimeFormatter.ofPattern("dd MMM yyyy", Locale.US)
    if (s.year == e.year) {
        "${s.format(fmtNoYear)} \u2013 ${e.format(fmtWithYear)}"
    } else {
        "${s.format(fmtWithYear)} \u2013 ${e.format(fmtWithYear)}"
    }
} catch (_: Exception) {
    "$startStr \u2013 $endStr"
}

private fun stepDay(current: String, deltaDays: Int): String = try {
    LocalDate.parse(current).plusDays(deltaDays.toLong()).toString()
} catch (_: Exception) {
    current
}

private fun stepMonth(currentMonthStr: String, deltaMonths: Int): String = try {
    YearMonth.parse(currentMonthStr).plusMonths(deltaMonths.toLong()).toString()
} catch (_: Exception) {
    currentMonthStr
}

private fun stepYear(currentYearStr: String, deltaYears: Int): String {
    val y = currentYearStr.toIntOrNull() ?: LocalDate.now().year
    return (y + deltaYears).toString()
}
