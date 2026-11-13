package com.dactor.clinic.ui.billing

import android.app.DatePickerDialog
import android.content.Intent
import android.widget.Toast
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
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
import androidx.navigation.NavController
import com.dactor.clinic.data.model.*
import com.dactor.clinic.data.repository.AppointmentRepository
import com.dactor.clinic.data.repository.BillingRepository
import com.dactor.clinic.data.repository.ClinicRepository
import com.dactor.clinic.data.repository.DoctorRepository
import com.dactor.clinic.domain.util.BillPdfDownloader
import com.dactor.clinic.domain.util.CurrencyFormatter
import com.dactor.clinic.domain.util.PaymentLedgerHelper
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale

@OptIn(ExperimentalMaterial3Api::class)
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

    // Dialog & delete states for Expenses
    var showAddExpenseDialog by remember { mutableStateOf(false) }
    var expenseToDelete by remember { mutableStateOf<ClinicExpense?>(null) }

    // Active filters & periods
    var selectedTab by remember { mutableStateOf(0) } // 0: Ledger, 1: Expenses, 2: Doctors, 3: 5% & Subscriptions

    // Period Scope: "daily", "monthly", "yearly", "custom", "all"
    var periodScope by remember { mutableStateOf("daily") }

    val todayStr = remember { SimpleDateFormat("yyyy-MM-dd", Locale.US).format(Date()) }
    val currentMonthStr = remember { todayStr.substring(0, 7) }
    val currentYearStr = remember { todayStr.substring(0, 4) }

    var selectedDate by remember { mutableStateOf(todayStr) }
    var selectedMonth by remember { mutableStateOf(currentMonthStr) }
    var selectedYear by remember { mutableStateOf(currentYearStr) }
    var customStartDate by remember { mutableStateOf(todayStr) }
    var customEndDate by remember { mutableStateOf(todayStr) }

    // Visit type filter: "all", "new", "followup"
    var visitTypeFilter by remember { mutableStateOf("all") }

    // Payment method filter: "all", "CASH", "FONEPAY", "ESEWA", "KHALTI"
    var paymentMethodFilter by remember { mutableStateOf("all") }

    var selectedDoctorId by remember { mutableStateOf("all") }
    var searchQuery by remember { mutableStateOf("") }

    // Selected log entry for details modal
    var selectedLogEntry by remember { mutableStateOf<UnifiedPaymentLogEntry?>(null) }

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

                appointments = appts
                invoices = invs
                doctors = docs
                transactions = txs
                subscriptions = subs
                settlements = sets
                expenses = exps
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

    // Unified logs
    val unifiedLogs = remember(appointments, invoices, doctors, transactions) {
        PaymentLedgerHelper.buildUnifiedPaymentLogs(appointments, invoices, doctors, transactions)
    }

    // Doctor Analytics
    val doctorAnalytics = remember(appointments, doctors, invoices, transactions) {
        PaymentLedgerHelper.computeDoctorDailyAndMonthlyStats(appointments, doctors, invoices, transactions)
    }

    // Filtered Logs
    val filteredLogs = remember(
        unifiedLogs, periodScope, selectedDate, selectedMonth, selectedYear,
        customStartDate, customEndDate, visitTypeFilter, paymentMethodFilter,
        selectedDoctorId, searchQuery
    ) {
        unifiedLogs.filter { log ->
            // Doctor filter
            if (selectedDoctorId != "all") {
                val appt = appointments.find { it.id == log.appointmentId }
                if (appt?.doctorId != selectedDoctorId) return@filter false
            }

            // Period scope filter
            val logDate = if (log.dateTime.length >= 10) log.dateTime.substring(0, 10) else ""
            when (periodScope) {
                "daily" -> if (logDate != selectedDate) return@filter false
                "monthly" -> if (!logDate.startsWith(selectedMonth)) return@filter false
                "yearly" -> if (!logDate.startsWith(selectedYear)) return@filter false
                "custom" -> if (logDate < customStartDate || logDate > customEndDate) return@filter false
                "all" -> { /* No date restriction */ }
            }

            // Visit type filter
            when (visitTypeFilter) {
                "new" -> if (!log.isNewPatientForDoctor) return@filter false
                "followup" -> if (log.isNewPatientForDoctor) return@filter false
            }

            // Payment method filter
            if (paymentMethodFilter != "all") {
                if (!log.paymentMethod.equals(paymentMethodFilter, ignoreCase = true)) return@filter false
            }

            // Search query
            if (searchQuery.isNotBlank()) {
                val q = searchQuery.lowercase()
                val matchToken = log.trackingCode10Digit?.lowercase()?.contains(q) == true
                val matchPatient = log.patientName.lowercase().contains(q)
                val matchPhone = log.patientPhone.contains(q)
                val matchRef = log.referenceId?.lowercase()?.contains(q) == true
                val matchDoctor = log.doctorName.lowercase().contains(q)
                if (!matchToken && !matchPatient && !matchPhone && !matchRef && !matchDoctor) return@filter false
            }

            true
        }
    }

    // Filtered Expenses
    val filteredExpenses = remember(
        expenses, periodScope, selectedDate, selectedMonth, selectedYear,
        customStartDate, customEndDate, paymentMethodFilter, searchQuery
    ) {
        expenses.filter { exp ->
            // Period scope filter
            val expDate = exp.expenseDate
            when (periodScope) {
                "daily" -> if (expDate != selectedDate) return@filter false
                "monthly" -> if (!expDate.startsWith(selectedMonth)) return@filter false
                "yearly" -> if (!expDate.startsWith(selectedYear)) return@filter false
                "custom" -> if (expDate < customStartDate || expDate > customEndDate) return@filter false
                "all" -> { /* No date restriction */ }
            }

            // Payment method filter
            if (paymentMethodFilter != "all") {
                if (!exp.paymentMethod.equals(paymentMethodFilter, ignoreCase = true)) return@filter false
            }

            // Search query
            if (searchQuery.isNotBlank()) {
                val q = searchQuery.lowercase()
                val matchTitle = exp.title.lowercase().contains(q)
                val matchCat = exp.category.lowercase().contains(q)
                val matchVoucher = exp.voucherNumber?.lowercase()?.contains(q) == true
                val matchRemarks = exp.remarks?.lowercase()?.contains(q) == true
                if (!matchTitle && !matchCat && !matchVoucher && !matchRemarks) return@filter false
            }

            true
        }
    }

    // Period display label for reports
    val periodLabel = remember(periodScope, selectedDate, selectedMonth, selectedYear, customStartDate, customEndDate) {
        when (periodScope) {
            "daily" -> "Day: $selectedDate"
            "monthly" -> "Month: $selectedMonth"
            "yearly" -> "Year: $selectedYear"
            "custom" -> "$customStartDate to $customEndDate"
            else -> "All-Time"
        }
    }

    // Export CSV
    fun exportCsv() {
        if (filteredLogs.isEmpty() && filteredExpenses.isEmpty()) {
            Toast.makeText(context, "No financial records match the current filters.", Toast.LENGTH_SHORT).show()
            return
        }
        val clinicName = clinicObj?.name ?: "Dactor Partner Clinic"
        val csv = PaymentLedgerHelper.generatePaymentLogsCsv(filteredLogs, periodLabel, clinicName, filteredExpenses)
        val sendIntent = Intent().apply {
            action = Intent.ACTION_SEND
            putExtra(Intent.EXTRA_TEXT, csv)
            putExtra(Intent.EXTRA_SUBJECT, "Financial-Ledger-$periodLabel.csv")
            type = "text/csv"
        }
        val shareIntent = Intent.createChooser(sendIntent, "Export Financial Ledger CSV")
        context.startActivity(shareIntent)
    }

    // Export PDF
    fun exportPdf() {
        if (filteredLogs.isEmpty() && filteredExpenses.isEmpty()) {
            Toast.makeText(context, "No financial records match the current filters.", Toast.LENGTH_SHORT).show()
            return
        }
        val clinicName = clinicObj?.name ?: "Dactor Partner Clinic"
        val clinicAddress = clinicObj?.addressText ?: "Kathmandu, Nepal"
        BillPdfDownloader.downloadPaymentStatementPdf(
            context = context,
            clinicName = clinicName,
            clinicAddress = clinicAddress,
            periodLabel = periodLabel,
            logs = filteredLogs,
            expenses = filteredExpenses
        )
    }

    // Helper Date Picker
    fun showDatePicker(initialDateStr: String, onDateSelected: (String) -> Unit) {
        val cal = Calendar.getInstance()
        try {
            val sdf = SimpleDateFormat("yyyy-MM-dd", Locale.US)
            cal.time = sdf.parse(initialDateStr) ?: Date()
        } catch (_: Exception) {}
        DatePickerDialog(
            context,
            { _, y, m, d ->
                val formatted = String.format(Locale.US, "%04d-%02d-%02d", y, m + 1, d)
                onDateSelected(formatted)
            },
            cal.get(Calendar.YEAR),
            cal.get(Calendar.MONTH),
            cal.get(Calendar.DAY_OF_MONTH)
        ).show()
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text(
                            text = "Payment Logs & Ledger",
                            fontWeight = FontWeight.Bold,
                            fontSize = 17.sp,
                            maxLines = 1
                        )
                        Text(
                            text = "Live revenue audit \u2022 Doctor tracker \u2022 Payouts",
                            fontSize = 11.sp,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                },
                navigationIcon = {
                    IconButton(onClick = { navController.navigateUp() }) {
                        Icon(Icons.Default.ArrowBack, contentDescription = "Back")
                    }
                },
                actions = {
                    // Add Expense Action
                    IconButton(onClick = { showAddExpenseDialog = true }) {
                        Icon(
                            Icons.Default.AddCircleOutline,
                            contentDescription = "Add Expense",
                            tint = Color(0xFFE11D48)
                        )
                    }
                    // PDF Statement Download Action
                    IconButton(onClick = { exportPdf() }) {
                        Icon(
                            Icons.Default.PictureAsPdf,
                            contentDescription = "Download PDF Statement",
                            tint = Color(0xFFDC2626) // PDF Red
                        )
                    }
                    // CSV Export Action
                    IconButton(onClick = { exportCsv() }) {
                        Icon(
                            Icons.Default.Share,
                            contentDescription = "Export CSV",
                            tint = Color(0xFF0D9488)
                        )
                    }
                    // Refresh Action
                    IconButton(onClick = { refreshAll() }) {
                        Icon(Icons.Default.Refresh, contentDescription = "Refresh")
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.surface
                )
            )
        },
        floatingActionButton = {
            if (selectedTab == 1) {
                ExtendedFloatingActionButton(
                    onClick = { showAddExpenseDialog = true },
                    icon = { Icon(Icons.Default.Add, contentDescription = null) },
                    text = { Text("Add Expense", fontWeight = FontWeight.Bold) },
                    containerColor = Color(0xFFE11D48),
                    contentColor = Color.White
                )
            }
        }
    ) { paddingValues ->
        if (isLoading) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(paddingValues),
                contentAlignment = Alignment.Center
            ) {
                CircularProgressIndicator(color = Color(0xFF0D9488))
            }
        } else {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(paddingValues)
            ) {
                // Scope selector pills (Daily / Monthly / Yearly / Custom / All)
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp, vertical = 4.dp)
                        .horizontalScroll(rememberScrollState()),
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    listOf(
                        "daily" to "Daily",
                        "monthly" to "Monthly",
                        "yearly" to "Yearly",
                        "custom" to "Custom Range",
                        "all" to "All-Time"
                    ).forEach { (scopeKey, scopeName) ->
                        FilterChip(
                            selected = periodScope == scopeKey,
                            onClick = { periodScope = scopeKey },
                            label = { Text(scopeName, fontSize = 11.sp, fontWeight = FontWeight.SemiBold) },
                            colors = FilterChipDefaults.filterChipColors(
                                selectedContainerColor = Color(0xFF0D9488),
                                selectedLabelColor = Color.White
                            )
                        )
                    }
                }

                // Date Stepper / Picker Bar
                Surface(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp, vertical = 2.dp),
                    shape = RoundedCornerShape(10.dp),
                    color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.45f)
                ) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 8.dp, vertical = 4.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        when (periodScope) {
                            "daily" -> {
                                IconButton(
                                    onClick = { selectedDate = stepDay(selectedDate, -1) },
                                    modifier = Modifier.size(32.dp)
                                ) {
                                    Icon(Icons.Default.ChevronLeft, contentDescription = "Previous Day")
                                }

                                Row(
                                    verticalAlignment = Alignment.CenterVertically,
                                    modifier = Modifier
                                        .clip(RoundedCornerShape(8.dp))
                                        .clickable { showDatePicker(selectedDate) { selectedDate = it } }
                                        .padding(horizontal = 8.dp, vertical = 4.dp)
                                ) {
                                    Icon(
                                        Icons.Default.CalendarToday,
                                        contentDescription = null,
                                        tint = Color(0xFF0D9488),
                                        modifier = Modifier.size(16.dp)
                                    )
                                    Spacer(modifier = Modifier.width(6.dp))
                                    Text(
                                        text = if (selectedDate == todayStr) "$selectedDate (Today)" else selectedDate,
                                        fontWeight = FontWeight.Bold,
                                        fontSize = 13.sp,
                                        color = Color(0xFF0F766E)
                                    )
                                }

                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    if (selectedDate != todayStr) {
                                        TextButton(
                                            onClick = { selectedDate = todayStr },
                                            contentPadding = PaddingValues(horizontal = 6.dp)
                                        ) {
                                            Text("Today", fontSize = 11.sp, fontWeight = FontWeight.Bold, color = Color(0xFF0D9488))
                                        }
                                    }
                                    IconButton(
                                        onClick = { selectedDate = stepDay(selectedDate, 1) },
                                        modifier = Modifier.size(32.dp)
                                    ) {
                                        Icon(Icons.Default.ChevronRight, contentDescription = "Next Day")
                                    }
                                }
                            }
                            "monthly" -> {
                                IconButton(
                                    onClick = { selectedMonth = stepMonth(selectedMonth, -1) },
                                    modifier = Modifier.size(32.dp)
                                ) {
                                    Icon(Icons.Default.ChevronLeft, contentDescription = "Previous Month")
                                }

                                Row(
                                    verticalAlignment = Alignment.CenterVertically,
                                    modifier = Modifier
                                        .clip(RoundedCornerShape(8.dp))
                                        .clickable {
                                            showDatePicker("$selectedMonth-01") { picked ->
                                                selectedMonth = picked.substring(0, 7)
                                            }
                                        }
                                        .padding(horizontal = 8.dp, vertical = 4.dp)
                                ) {
                                    Icon(
                                        Icons.Default.CalendarMonth,
                                        contentDescription = null,
                                        tint = Color(0xFF0D9488),
                                        modifier = Modifier.size(16.dp)
                                    )
                                    Spacer(modifier = Modifier.width(6.dp))
                                    Text(
                                        text = if (selectedMonth == currentMonthStr) "$selectedMonth (Current)" else selectedMonth,
                                        fontWeight = FontWeight.Bold,
                                        fontSize = 13.sp,
                                        color = Color(0xFF0F766E)
                                    )
                                }

                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    if (selectedMonth != currentMonthStr) {
                                        TextButton(
                                            onClick = { selectedMonth = currentMonthStr },
                                            contentPadding = PaddingValues(horizontal = 6.dp)
                                        ) {
                                            Text("Current", fontSize = 11.sp, fontWeight = FontWeight.Bold, color = Color(0xFF0D9488))
                                        }
                                    }
                                    IconButton(
                                        onClick = { selectedMonth = stepMonth(selectedMonth, 1) },
                                        modifier = Modifier.size(32.dp)
                                    ) {
                                        Icon(Icons.Default.ChevronRight, contentDescription = "Next Month")
                                    }
                                }
                            }
                            "yearly" -> {
                                IconButton(
                                    onClick = { selectedYear = stepYear(selectedYear, -1) },
                                    modifier = Modifier.size(32.dp)
                                ) {
                                    Icon(Icons.Default.ChevronLeft, contentDescription = "Previous Year")
                                }

                                Row(
                                    verticalAlignment = Alignment.CenterVertically,
                                    modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
                                ) {
                                    Icon(
                                        Icons.Default.CalendarMonth,
                                        contentDescription = null,
                                        tint = Color(0xFF0D9488),
                                        modifier = Modifier.size(16.dp)
                                    )
                                    Spacer(modifier = Modifier.width(6.dp))
                                    Text(
                                        text = "Year $selectedYear",
                                        fontWeight = FontWeight.Bold,
                                        fontSize = 13.sp,
                                        color = Color(0xFF0F766E)
                                    )
                                }

                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    if (selectedYear != currentYearStr) {
                                        TextButton(
                                            onClick = { selectedYear = currentYearStr },
                                            contentPadding = PaddingValues(horizontal = 6.dp)
                                        ) {
                                            Text("This Year", fontSize = 11.sp, fontWeight = FontWeight.Bold, color = Color(0xFF0D9488))
                                        }
                                    }
                                    IconButton(
                                        onClick = { selectedYear = stepYear(selectedYear, 1) },
                                        modifier = Modifier.size(32.dp)
                                    ) {
                                        Icon(Icons.Default.ChevronRight, contentDescription = "Next Year")
                                    }
                                }
                            }
                            "custom" -> {
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.SpaceEvenly,
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    OutlinedButton(
                                        onClick = { showDatePicker(customStartDate) { customStartDate = it } },
                                        shape = RoundedCornerShape(8.dp),
                                        contentPadding = PaddingValues(horizontal = 10.dp, vertical = 4.dp)
                                    ) {
                                        Text("From: $customStartDate", fontSize = 11.sp)
                                    }
                                    Text("→", fontSize = 13.sp, fontWeight = FontWeight.Bold)
                                    OutlinedButton(
                                        onClick = { showDatePicker(customEndDate) { customEndDate = it } },
                                        shape = RoundedCornerShape(8.dp),
                                        contentPadding = PaddingValues(horizontal = 10.dp, vertical = 4.dp)
                                    ) {
                                        Text("To: $customEndDate", fontSize = 11.sp)
                                    }
                                }
                            }
                            else -> {
                                Box(modifier = Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
                                    Text("Showing all historical transaction records", fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                }
                            }
                        }
                    }
                }

                // 4 Financial & Clinical KPI Summary Cards (2x2 Grid)
                val grossCollected = filteredLogs.sumOf { it.amount }
                val freeFollowupCount = filteredLogs.count { !it.isNewPatientForDoctor }
                val newPaidCount = filteredLogs.count { it.isNewPatientForDoctor }
                val platformCommission = filteredLogs.sumOf { it.serviceChargeAmount }
                val totalExpenses = filteredExpenses.sumOf { it.amount }
                val netClinicPayout = grossCollected - platformCommission
                val netClinicProfit = netClinicPayout - totalExpenses

                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp, vertical = 4.dp),
                    verticalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    // Row 1: Collections & Expenses
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Card(
                            modifier = Modifier.weight(1f),
                            colors = CardDefaults.cardColors(containerColor = Color(0xFFECFDF5)),
                            shape = RoundedCornerShape(12.dp),
                            border = BorderStroke(1.dp, Color(0xFFA7F3D0))
                        ) {
                            Column(modifier = Modifier.padding(10.dp)) {
                                Text("Gross Collections", fontSize = 10.sp, fontWeight = FontWeight.Bold, color = Color(0xFF065F46))
                                Text(CurrencyFormatter.formatNPR(grossCollected), fontSize = 15.sp, fontWeight = FontWeight.Black, color = Color(0xFF047857))
                                Text("${filteredLogs.size} total receipts", fontSize = 9.sp, color = Color(0xFF059669))
                            }
                        }

                        Card(
                            modifier = Modifier.weight(1f),
                            colors = CardDefaults.cardColors(containerColor = Color(0xFFFFF1F2)),
                            shape = RoundedCornerShape(12.dp),
                            border = BorderStroke(1.dp, Color(0xFFFECDD3))
                        ) {
                            Column(modifier = Modifier.padding(10.dp)) {
                                Text("Total Expenses", fontSize = 10.sp, fontWeight = FontWeight.Bold, color = Color(0xFF9F1239))
                                Text(CurrencyFormatter.formatNPR(totalExpenses), fontSize = 15.sp, fontWeight = FontWeight.Black, color = Color(0xFFBE123C))
                                Text("${filteredExpenses.size} logged expenses", fontSize = 9.sp, color = Color(0xFFE11D48))
                            }
                        }
                    }

                    // Row 2: Consultations & Net Clinic Profit
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Card(
                            modifier = Modifier.weight(1f),
                            colors = CardDefaults.cardColors(containerColor = Color(0xFFEFF6FF)),
                            shape = RoundedCornerShape(12.dp),
                            border = BorderStroke(1.dp, Color(0xFFBFDBFE))
                        ) {
                            Column(modifier = Modifier.padding(10.dp)) {
                                Text("Patients Consulted", fontSize = 10.sp, fontWeight = FontWeight.Bold, color = Color(0xFF1E40AF))
                                Text("+$newPaidCount New", fontSize = 15.sp, fontWeight = FontWeight.Black, color = Color(0xFF1D4ED8))
                                Text("$freeFollowupCount free follow-ups", fontSize = 9.sp, color = Color(0xFF2563EB))
                            }
                        }

                        Card(
                            modifier = Modifier.weight(1f),
                            colors = CardDefaults.cardColors(containerColor = if (netClinicProfit >= 0) Color(0xFFF5F3FF) else Color(0xFFFFF7ED)),
                            shape = RoundedCornerShape(12.dp),
                            border = BorderStroke(1.dp, if (netClinicProfit >= 0) Color(0xFFDDD6FE) else Color(0xFFFFEDD5))
                        ) {
                            Column(modifier = Modifier.padding(10.dp)) {
                                Text("Net Clinic Profit", fontSize = 10.sp, fontWeight = FontWeight.Bold, color = if (netClinicProfit >= 0) Color(0xFF5B21B6) else Color(0xFF9A3412))
                                Text(CurrencyFormatter.formatNPR(netClinicProfit), fontSize = 15.sp, fontWeight = FontWeight.Black, color = if (netClinicProfit >= 0) Color(0xFF6D28D9) else Color(0xFFC2410C))
                                Text(
                                    if (platformCommission > 0.0) "After desk fees & expenses" else "Gross collections - expenses",
                                    fontSize = 9.sp,
                                    color = if (netClinicProfit >= 0) Color(0xFF7C3AED) else Color(0xFFEA580C)
                                )
                            }
                        }
                    }
                }

                // Payment Method & Visit Type Filter Chips
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp, vertical = 2.dp)
                        .horizontalScroll(rememberScrollState()),
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    // Visit Type Filter Chips
                    listOf(
                        "all" to "All Visits (${filteredLogs.size})",
                        "new" to "New Paid (+$newPaidCount)",
                        "followup" to "Follow-up Free ($freeFollowupCount)"
                    ).forEach { (vtKey, vtLabel) ->
                        FilterChip(
                            selected = visitTypeFilter == vtKey,
                            onClick = { visitTypeFilter = vtKey },
                            label = { Text(vtLabel, fontSize = 10.5.sp, fontWeight = FontWeight.Bold) },
                            colors = FilterChipDefaults.filterChipColors(
                                selectedContainerColor = if (vtKey == "followup") Color(0xFF2563EB) else Color(0xFF0D9488),
                                selectedLabelColor = Color.White
                            )
                        )
                    }

                    // Payment Method filter chips
                    listOf("all", "CASH", "FONEPAY", "ESEWA", "KHALTI").forEach { method ->
                        val count = if (method == "all") unifiedLogs.size else unifiedLogs.count { it.paymentMethod.equals(method, ignoreCase = true) }
                        FilterChip(
                            selected = paymentMethodFilter == method,
                            onClick = { paymentMethodFilter = method },
                            label = { Text(if (method == "all") "All Methods" else method, fontSize = 10.sp) }
                        )
                    }
                }

                // Search Box & Doctor Filter
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp, vertical = 2.dp),
                    verticalArrangement = Arrangement.spacedBy(4.dp)
                ) {
                    OutlinedTextField(
                        value = searchQuery,
                        onValueChange = { searchQuery = it },
                        placeholder = { Text("Search records, vouchers, categories", fontSize = 13.sp) },
                        leadingIcon = { Icon(Icons.Default.Search, contentDescription = null, modifier = Modifier.size(18.dp)) },
                        trailingIcon = {
                            if (searchQuery.isNotBlank()) {
                                IconButton(onClick = { searchQuery = "" }) {
                                    Icon(Icons.Default.Clear, contentDescription = "Clear", modifier = Modifier.size(16.dp))
                                }
                            }
                        },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(10.dp)
                    )

                    // Doctor filter chips
                    if (doctors.isNotEmpty()) {
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .horizontalScroll(rememberScrollState()),
                            horizontalArrangement = Arrangement.spacedBy(6.dp)
                        ) {
                            FilterChip(
                                selected = selectedDoctorId == "all",
                                onClick = { selectedDoctorId = "all" },
                                label = { Text("All Doctors", fontSize = 11.sp) }
                            )
                            doctors.forEach { doc ->
                                FilterChip(
                                    selected = selectedDoctorId == doc.id,
                                    onClick = { selectedDoctorId = doc.id },
                                    label = { Text(doc.fullName, fontSize = 11.sp) }
                                )
                            }
                        }
                    }
                }

                // Navigation Tab Row
                TabRow(
                    selectedTabIndex = selectedTab,
                    containerColor = MaterialTheme.colorScheme.surface,
                    contentColor = Color(0xFF0D9488)
                ) {
                    Tab(
                        selected = selectedTab == 0,
                        onClick = { selectedTab = 0 },
                        text = { Text("Ledger (${filteredLogs.size})", fontSize = 11.5.sp, fontWeight = FontWeight.Bold) }
                    )
                    Tab(
                        selected = selectedTab == 1,
                        onClick = { selectedTab = 1 },
                        text = { Text("Expenses (${filteredExpenses.size})", fontSize = 11.5.sp, fontWeight = FontWeight.Bold) }
                    )
                    Tab(
                        selected = selectedTab == 2,
                        onClick = { selectedTab = 2 },
                        text = { Text("Doctor Tracker (${doctorAnalytics.size})", fontSize = 11.5.sp, fontWeight = FontWeight.Bold) }
                    )
                    Tab(
                        selected = selectedTab == 3,
                        onClick = { selectedTab = 3 },
                        text = { Text("Fees & Subs (${subscriptions.size + settlements.size})", fontSize = 11.5.sp, fontWeight = FontWeight.Bold) }
                    )
                }

                // Content View according to selected tab
                when (selectedTab) {
                    0 -> LedgerListView(
                        logs = filteredLogs,
                        onSelectLog = { selectedLogEntry = it }
                    )
                    1 -> ExpensesListView(
                        expenses = filteredExpenses,
                        onAddExpense = { showAddExpenseDialog = true },
                        onDeleteExpense = { expenseToDelete = it }
                    )
                    2 -> DoctorTrackerListView(
                        analytics = doctorAnalytics,
                        selectedDoctorId = selectedDoctorId
                    )
                    3 -> FeesAndSubscriptionView(
                        subscriptions = subscriptions,
                        settlements = settlements
                    )
                }
            }
        }
    }

    // Detail Bottom Sheet / Modal
    if (selectedLogEntry != null) {
        val entry = selectedLogEntry!!
        val appt = appointments.find { it.id == entry.appointmentId }
        val inv = invoices.find { (entry.appointmentId != null && it.appointmentId == entry.appointmentId) || (entry.invoiceId != null && it.id == entry.invoiceId) }

        AlertDialog(
            onDismissRequest = { selectedLogEntry = null },
            confirmButton = {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    if (appt != null) {
                        OutlinedButton(
                            onClick = {
                                BillPdfDownloader.downloadBillPdf(
                                    context = context,
                                    appointment = appt,
                                    invoice = inv,
                                    clinicName = clinicObj?.name ?: "Dactor Partner Clinic",
                                    clinicAddress = clinicObj?.addressText ?: "Kathmandu, Nepal",
                                    doctorName = entry.doctorName
                                )
                            }
                        ) {
                            Icon(Icons.Default.PictureAsPdf, contentDescription = null, modifier = Modifier.size(16.dp), tint = Color(0xFFDC2626))
                            Spacer(modifier = Modifier.width(4.dp))
                            Text("Print Bill", fontSize = 12.sp)
                        }
                    }
                    Button(
                        onClick = { selectedLogEntry = null },
                        colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF0D9488))
                    ) {
                        Text("Close", fontWeight = FontWeight.Bold, fontSize = 12.sp)
                    }
                }
            },
            title = {
                Column {
                    Text("Payment Receipt & Audit", fontWeight = FontWeight.Bold, fontSize = 16.sp)
                    Text("Token #${entry.trackingCode10Digit ?: "\u2013"}", fontSize = 12.sp, color = Color(0xFF0D9488))
                }
            },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        Text("Patient:", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        Text(entry.patientName, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                    }
                    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        Text("Mobile:", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        Text(entry.patientPhone, fontSize = 12.sp)
                    }
                    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        Text("Doctor:", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        Text(entry.doctorName, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                    }
                    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        Text("Visit Type:", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        Text(
                            if (entry.isNewPatientForDoctor) "NEW PATIENT (1st Consultation)" else "FOLLOW-UP (Free OPD Consult)",
                            fontSize = 11.sp,
                            fontWeight = FontWeight.Bold,
                            color = if (entry.isNewPatientForDoctor) Color(0xFF059669) else Color(0xFF2563EB)
                        )
                    }
                    HorizontalDivider()
                    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        Text("Payment Method:", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        Text(entry.paymentMethod, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                    }
                    if (!entry.referenceId.isNullOrBlank()) {
                        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                            Text("Reference ID:", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            Text(entry.referenceId, fontSize = 12.sp)
                        }
                    }
                    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        Text("Amount Collected:", fontSize = 13.sp, fontWeight = FontWeight.Bold)
                        Text(
                            if (entry.amount == 0.0 && !entry.isNewPatientForDoctor) "Rs. 0 (Free OPD)" else CurrencyFormatter.formatNPR(entry.amount),
                            fontSize = 14.sp,
                            fontWeight = FontWeight.Black,
                            color = if (entry.amount == 0.0 && !entry.isNewPatientForDoctor) Color(0xFF2563EB) else Color(0xFF0D9488)
                        )
                    }
                    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        Text("Date & Time:", fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        Text(PaymentLedgerHelper.formatDisplayDateTime(entry.dateTime), fontSize = 11.sp)
                    }
                    if (!entry.note.isNullOrBlank()) {
                        Text("Notes: ${entry.note}", fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
            }
        )
    }

    // Add Expense Dialog
    if (showAddExpenseDialog) {
        AddEditExpenseDialog(
            initialDate = if (periodScope == "daily") selectedDate else todayStr,
            onDismiss = { showAddExpenseDialog = false },
            onSave = { newExpense ->
                val expenseToSave = newExpense.copy(clinicId = clinicId)
                coroutineScope.launch {
                    val saved = billingRepository?.addExpense(expenseToSave)
                    if (saved != null) {
                        expenses = listOf(saved) + expenses
                        showAddExpenseDialog = false
                        Toast.makeText(context, "✓ Expense logged: ${saved.title}", Toast.LENGTH_SHORT).show()
                    } else {
                        Toast.makeText(context, "Failed to save expense", Toast.LENGTH_SHORT).show()
                    }
                }
            }
        )
    }

    // Delete Expense Confirmation Dialog
    if (expenseToDelete != null) {
        val exp = expenseToDelete!!
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
                                Toast.makeText(context, "✓ Expense deleted", Toast.LENGTH_SHORT).show()
                            } else {
                                Toast.makeText(context, "Failed to delete expense", Toast.LENGTH_SHORT).show()
                            }
                            expenseToDelete = null
                        }
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFDC2626))
                ) {
                    Text("Delete", fontWeight = FontWeight.Bold, color = Color.White)
                }
            },
            dismissButton = {
                TextButton(onClick = { expenseToDelete = null }) {
                    Text("Cancel")
                }
            }
        )
    }
}

@Composable
private fun LedgerListView(
    logs: List<UnifiedPaymentLogEntry>,
    onSelectLog: (UnifiedPaymentLogEntry) -> Unit
) {
    if (logs.isEmpty()) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(32.dp),
            contentAlignment = Alignment.Center
        ) {
            Text(
                "No payment records match the current filters.",
                fontSize = 13.sp,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
    } else {
        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            items(logs, key = { it.id }) { log ->
                val isFreeFollowup = !log.isNewPatientForDoctor && log.amount == 0.0

                Card(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable { onSelectLog(log) },
                    shape = RoundedCornerShape(12.dp),
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.4f)),
                    border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.15f))
                ) {
                    Column(modifier = Modifier.padding(12.dp)) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                Text(
                                    text = log.patientName,
                                    fontWeight = FontWeight.Bold,
                                    fontSize = 13.sp,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis
                                )
                                if (log.isNewPatientForDoctor) {
                                    Box(
                                        modifier = Modifier
                                            .clip(RoundedCornerShape(4.dp))
                                            .background(Color(0xFFD1FAE5))
                                            .padding(horizontal = 4.dp, vertical = 2.dp)
                                    ) {
                                        Text("NEW", fontSize = 8.sp, fontWeight = FontWeight.Bold, color = Color(0xFF065F46))
                                    }
                                } else {
                                    Box(
                                        modifier = Modifier
                                            .clip(RoundedCornerShape(4.dp))
                                            .background(Color(0xFFDBEAFE))
                                            .padding(horizontal = 4.dp, vertical = 2.dp)
                                    ) {
                                        Text("FOLLOW-UP (FREE)", fontSize = 8.sp, fontWeight = FontWeight.Bold, color = Color(0xFF1E40AF))
                                    }
                                }
                            }

                            Text(
                                text = if (isFreeFollowup) "Rs. 0 (Free)" else CurrencyFormatter.formatNPR(log.amount),
                                fontWeight = FontWeight.Black,
                                fontSize = 14.sp,
                                color = if (isFreeFollowup) Color(0xFF2563EB) else Color(0xFF0D9488)
                            )
                        }

                        Spacer(modifier = Modifier.height(4.dp))

                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text(
                                text = "Token #${log.trackingCode10Digit ?: "\u2013"} \u2022 Dr. ${log.doctorName}",
                                fontSize = 11.sp,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )

                            // Method Badge
                            Box(
                                modifier = Modifier
                                    .clip(RoundedCornerShape(6.dp))
                                    .background(
                                        when (log.paymentMethod.uppercase()) {
                                            "FREE" -> Color(0xFFDBEAFE)
                                            "ESEWA" -> Color(0xFFDCFCE7)
                                            "KHALTI" -> Color(0xFFEDE9FE)
                                            "FONEPAY" -> Color(0xFFFFE4E6)
                                            "CONNECTIPS" -> Color(0xFFDBEAFE)
                                            "BANK_TRANSFER" -> Color(0xFFE0E7FF)
                                            else -> Color(0xFFF1F5F9)
                                        }
                                    )
                                    .padding(horizontal = 6.dp, vertical = 2.dp)
                                ) {
                                    Text(
                                        text = log.paymentMethod,
                                        fontSize = 9.sp,
                                        fontWeight = FontWeight.Bold,
                                        color = when (log.paymentMethod.uppercase()) {
                                            "FREE" -> Color(0xFF1D4ED8)
                                            "ESEWA" -> Color(0xFF15803D)
                                            "KHALTI" -> Color(0xFF6D28D9)
                                            "FONEPAY" -> Color(0xFFBE123C)
                                            "CONNECTIPS" -> Color(0xFF1D4ED8)
                                            "BANK_TRANSFER" -> Color(0xFF3730A3)
                                            else -> Color(0xFF475569)
                                        }
                                    )
                                }
                        }

                        Spacer(modifier = Modifier.height(2.dp))

                        Text(
                            text = PaymentLedgerHelper.formatDisplayDateTime(log.dateTime),
                            fontSize = 10.sp,
                            color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.8f)
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun ExpensesListView(
    expenses: List<ClinicExpense>,
    onAddExpense: () -> Unit,
    onDeleteExpense: (ClinicExpense) -> Unit
) {
    if (expenses.isEmpty()) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(32.dp),
            contentAlignment = Alignment.Center
        ) {
            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                Surface(
                    shape = CircleShape,
                    color = Color(0xFFFFF1F2),
                    modifier = Modifier.size(56.dp)
                ) {
                    Box(contentAlignment = Alignment.Center) {
                        Icon(
                            Icons.Default.ReceiptLong,
                            contentDescription = null,
                            tint = Color(0xFFE11D48),
                            modifier = Modifier.size(28.dp)
                        )
                    }
                }
                Text(
                    "No clinic expenses logged for this period.",
                    fontSize = 14.sp,
                    fontWeight = FontWeight.Medium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                Text(
                    "Track petty cash, rent, salaries, utilities, and medical supplies directly in your ledger.",
                    fontSize = 12.sp,
                    color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.8f),
                    textAlign = androidx.compose.ui.text.style.TextAlign.Center
                )
                Button(
                    onClick = onAddExpense,
                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFE11D48)),
                    shape = RoundedCornerShape(8.dp)
                ) {
                    Icon(Icons.Default.Add, contentDescription = null, modifier = Modifier.size(16.dp))
                    Spacer(modifier = Modifier.width(6.dp))
                    Text("Add First Expense", fontWeight = FontWeight.Bold)
                }
            }
        }
    } else {
        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            items(expenses, key = { it.id }) { expense ->
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(12.dp),
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.35f)),
                    border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.15f))
                ) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(12.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        // Left: Icon & Details
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(10.dp),
                            modifier = Modifier.weight(1f)
                        ) {
                            Surface(
                                shape = RoundedCornerShape(10.dp),
                                color = getExpenseCategoryBgColor(expense.category),
                                modifier = Modifier.size(40.dp)
                            ) {
                                Box(contentAlignment = Alignment.Center) {
                                    Icon(
                                        imageVector = getExpenseCategoryIcon(expense.category),
                                        contentDescription = null,
                                        tint = getExpenseCategoryTextColor(expense.category),
                                        modifier = Modifier.size(20.dp)
                                    )
                                }
                            }

                            Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                                Text(
                                    text = expense.title,
                                    fontSize = 13.5.sp,
                                    fontWeight = FontWeight.Bold,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis
                                )
                                Row(
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(4.dp)
                                ) {
                                    Text(
                                        text = expense.category.replace('_', ' '),
                                        fontSize = 10.sp,
                                        fontWeight = FontWeight.Bold,
                                        color = getExpenseCategoryTextColor(expense.category)
                                    )
                                    Text("•", fontSize = 10.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                    Text(
                                        text = expense.expenseDate,
                                        fontSize = 10.5.sp,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant
                                    )
                                    if (!expense.expenseTime.isNullOrBlank()) {
                                        Text(
                                            text = expense.expenseTime,
                                            fontSize = 10.5.sp,
                                            color = MaterialTheme.colorScheme.onSurfaceVariant
                                        )
                                    }
                                }
                                Row(
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(4.dp)
                                ) {
                                    Surface(
                                        shape = RoundedCornerShape(4.dp),
                                        color = MaterialTheme.colorScheme.surfaceVariant
                                    ) {
                                        Text(
                                            text = expense.paymentMethod,
                                            fontSize = 9.5.sp,
                                            fontWeight = FontWeight.SemiBold,
                                            modifier = Modifier.padding(horizontal = 4.dp, vertical = 1.dp)
                                        )
                                    }
                                    if (!expense.voucherNumber.isNullOrBlank()) {
                                        Text(
                                            text = "Ref: #${expense.voucherNumber}",
                                            fontSize = 10.sp,
                                            color = MaterialTheme.colorScheme.onSurfaceVariant
                                        )
                                    }
                                }
                                if (!expense.remarks.isNullOrBlank()) {
                                    Text(
                                        text = expense.remarks,
                                        fontSize = 10.5.sp,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.85f),
                                        maxLines = 1,
                                        overflow = TextOverflow.Ellipsis
                                    )
                                }
                            }
                        }

                        // Right: Amount and Delete
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(4.dp)
                        ) {
                            Text(
                                text = "- ${CurrencyFormatter.formatNPR(expense.amount)}",
                                fontSize = 13.5.sp,
                                fontWeight = FontWeight.Black,
                                color = Color(0xFFE11D48)
                            )
                            IconButton(
                                onClick = { onDeleteExpense(expense) },
                                modifier = Modifier.size(32.dp)
                            ) {
                                Icon(
                                    Icons.Default.DeleteOutline,
                                    contentDescription = "Delete Expense",
                                    tint = MaterialTheme.colorScheme.error.copy(alpha = 0.7f),
                                    modifier = Modifier.size(18.dp)
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun AddEditExpenseDialog(
    initialDate: String,
    onDismiss: () -> Unit,
    onSave: (ClinicExpense) -> Unit
) {
    val context = LocalContext.current
    var title by remember { mutableStateOf("") }
    var amountText by remember { mutableStateOf("") }
    var selectedCategory by remember { mutableStateOf("PETTY_CASH") }
    var selectedPaymentMethod by remember { mutableStateOf("CASH") }
    var expenseDate by remember { mutableStateOf(initialDate.ifBlank { SimpleDateFormat("yyyy-MM-dd", Locale.US).format(Date()) }) }
    var expenseTime by remember { mutableStateOf(SimpleDateFormat("HH:mm", Locale.US).format(Date())) }
    var voucherNumber by remember { mutableStateOf("") }
    var remarks by remember { mutableStateOf("") }

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
                            Icons.Default.AddCircle,
                            contentDescription = null,
                            tint = Color(0xFFE11D48),
                            modifier = Modifier.size(20.dp)
                        )
                    }
                }
                Text("Log Clinic Expense", fontWeight = FontWeight.Bold, fontSize = 16.sp)
            }
        },
        text = {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                // Title
                OutlinedTextField(
                    value = title,
                    onValueChange = { title = it },
                    label = { Text("Expense Title *") },
                    placeholder = { Text("e.g. Syringes & Cotton, Office tea, Electricity") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(8.dp)
                )

                // Amount
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

                // Category chips
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

                // Payment Method
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
                            label = { Text(method, fontSize = 11.sp) }
                        )
                    }
                }

                // Date & Time
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

                // Voucher / Bill Reference Number
                OutlinedTextField(
                    value = voucherNumber,
                    onValueChange = { voucherNumber = it },
                    label = { Text("Bill / Voucher No. (Optional)") },
                    placeholder = { Text("e.g. V-1042") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(8.dp)
                )

                // Remarks
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

                    val expense = ClinicExpense(
                        clinicId = "",
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
                Text("Save Expense", fontWeight = FontWeight.Bold)
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text("Cancel")
            }
        }
    )
}

private fun getExpenseCategoryIcon(category: String) = when (category.uppercase()) {
    "PETTY_CASH" -> Icons.Default.Payments
    "MEDICAL_SUPPLIES" -> Icons.Default.MedicalServices
    "RENT" -> Icons.Default.Home
    "SALARIES" -> Icons.Default.People
    "UTILITIES" -> Icons.Default.Bolt
    "EQUIPMENT" -> Icons.Default.Build
    "REFRESHMENTS" -> Icons.Default.LocalCafe
    else -> Icons.Default.ReceiptLong
}

private fun getExpenseCategoryBgColor(category: String) = when (category.uppercase()) {
    "PETTY_CASH" -> Color(0xFFFEF3C7) // Amber 100
    "MEDICAL_SUPPLIES" -> Color(0xFFE0F2FE) // Sky 100
    "RENT" -> Color(0xFFEDE9FE) // Violet 100
    "SALARIES" -> Color(0xFFDCFCE7) // Emerald 100
    "UTILITIES" -> Color(0xFFFEF9C3) // Yellow 100
    "EQUIPMENT" -> Color(0xFFF1F5F9) // Slate 100
    "REFRESHMENTS" -> Color(0xFFFFEDD5) // Orange 100
    else -> Color(0xFFFEE2E2) // Red 100
}

private fun getExpenseCategoryTextColor(category: String) = when (category.uppercase()) {
    "PETTY_CASH" -> Color(0xFFB45309) // Amber 700
    "MEDICAL_SUPPLIES" -> Color(0xFF0369A1) // Sky 700
    "RENT" -> Color(0xFF6D28D9) // Violet 700
    "SALARIES" -> Color(0xFF15803D) // Emerald 700
    "UTILITIES" -> Color(0xFFA16207) // Yellow 700
    "EQUIPMENT" -> Color(0xFF475569) // Slate 700
    "REFRESHMENTS" -> Color(0xFFC2410C) // Orange 700
    else -> Color(0xFFB91C1C) // Red 700
}

@Composable
private fun DoctorTrackerListView(
    analytics: List<DoctorVisitAnalytics>,
    selectedDoctorId: String
) {
    val displayed = remember(analytics, selectedDoctorId) {
        if (selectedDoctorId == "all") analytics else analytics.filter { it.doctorId == selectedDoctorId }
    }

    if (displayed.isEmpty()) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(32.dp),
            contentAlignment = Alignment.Center
        ) {
            Text("No doctor analytics available.", fontSize = 13.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    } else {
        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            items(displayed, key = { it.doctorId }) { doc ->
                var isExpanded by remember { mutableStateOf(false) }

                Card(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(14.dp),
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                    border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.2f))
                ) {
                    Column(modifier = Modifier.padding(14.dp)) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Column {
                                Text(doc.doctorName, fontWeight = FontWeight.Bold, fontSize = 14.sp)
                                Text(doc.specialty, fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                            Text(
                                "Fee: ${CurrencyFormatter.formatNPR(doc.consultationFee)}",
                                fontWeight = FontWeight.Bold,
                                fontSize = 11.sp,
                                color = Color(0xFF0D9488)
                            )
                        }

                        Spacer(modifier = Modifier.height(10.dp))

                        // Metric blocks
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.4f), RoundedCornerShape(10.dp))
                                .padding(8.dp),
                            horizontalArrangement = Arrangement.SpaceAround
                        ) {
                            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                                Text("Total", fontSize = 9.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                Text("${doc.totalVisits}", fontSize = 14.sp, fontWeight = FontWeight.Black)
                            }
                            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                                Text("New Patients", fontSize = 9.sp, fontWeight = FontWeight.Bold, color = Color(0xFF059669))
                                Text("+${doc.newPatients}", fontSize = 14.sp, fontWeight = FontWeight.Black, color = Color(0xFF059669))
                            }
                            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                                Text("Follow-up", fontSize = 9.sp, fontWeight = FontWeight.Bold, color = Color(0xFF2563EB))
                                Text("${doc.followupPatients}", fontSize = 14.sp, fontWeight = FontWeight.Black, color = Color(0xFF2563EB))
                            }
                            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                                Text("OPD Revenue", fontSize = 9.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                Text(CurrencyFormatter.formatNPR(doc.totalOpdRevenue), fontSize = 12.sp, fontWeight = FontWeight.Bold)
                            }
                        }

                        Spacer(modifier = Modifier.height(8.dp))

                        // Toggle Expand Daily Breakdowns
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clickable { isExpanded = !isExpanded }
                                .padding(vertical = 4.dp),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text(
                                if (isExpanded) "Hide Daily & Monthly Breakdown" else "View Daily & Monthly Breakdown (${doc.dailyBreakdown.size} days)",
                                fontSize = 11.sp,
                                fontWeight = FontWeight.Bold,
                                color = Color(0xFF0D9488)
                            )
                            Icon(
                                if (isExpanded) Icons.Default.ExpandLess else Icons.Default.ExpandMore,
                                contentDescription = null,
                                tint = Color(0xFF0D9488),
                                modifier = Modifier.size(16.dp)
                            )
                        }

                        if (isExpanded) {
                            Spacer(modifier = Modifier.height(6.dp))
                            Text("Recent Daily Breakdown:", fontSize = 10.sp, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            Spacer(modifier = Modifier.height(4.dp))
                            doc.dailyBreakdown.entries.sortedByDescending { it.key }.take(7).forEach { (day, stats) ->
                                Row(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .padding(vertical = 2.dp),
                                    horizontalArrangement = Arrangement.SpaceBetween
                                ) {
                                    Text(day, fontSize = 11.sp, fontWeight = FontWeight.Medium)
                                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                        Text("+${stats.newPatients} New", fontSize = 11.sp, color = Color(0xFF059669), fontWeight = FontWeight.Bold)
                                        Text("${stats.followupPatients} F/U", fontSize = 11.sp, color = Color(0xFF2563EB))
                                        Text(CurrencyFormatter.formatNPR(stats.totalRevenue), fontSize = 11.sp, fontWeight = FontWeight.Bold)
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

@Composable
private fun FeesAndSubscriptionView(
    subscriptions: List<ClinicSubscriptionPayment>,
    settlements: List<PlatformCommissionSettlement>
) {
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        // 5% Platform Commission Section
        item {
            Text("5% Pay-at-Desk Platform Service Charges", fontWeight = FontWeight.Bold, fontSize = 14.sp)
            Spacer(modifier = Modifier.height(6.dp))
            if (settlements.isEmpty()) {
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(10.dp),
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.3f))
                ) {
                    Text("No platform commission settlements recorded yet.", modifier = Modifier.padding(14.dp), fontSize = 12.sp)
                }
            } else {
                Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    settlements.forEach { setRow ->
                        Card(
                            modifier = Modifier.fillMaxWidth(),
                            shape = RoundedCornerShape(10.dp),
                            border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.15f))
                        ) {
                            Column(modifier = Modifier.padding(12.dp)) {
                                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                    Text("${setRow.periodStart} → ${setRow.periodEnd}", fontSize = 12.sp, fontWeight = FontWeight.Bold)
                                    Text(
                                        setRow.status,
                                        fontSize = 10.sp,
                                        fontWeight = FontWeight.Bold,
                                        color = if (setRow.status == "SETTLED") Color(0xFF059669) else Color(0xFFD97706)
                                    )
                                }
                                Spacer(modifier = Modifier.height(4.dp))
                                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                    Text("Gross Pay-at-Desk: ${CurrencyFormatter.formatNPR(setRow.totalPayAtDeskAmount)}", fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                    Text("5% Cut: ${CurrencyFormatter.formatNPR(setRow.platformFeeAmount)}", fontSize = 12.sp, fontWeight = FontWeight.Black, color = Color(0xFF0D9488))
                                }
                            }
                        }
                    }
                }
            }
        }

        // Clinic License Subscriptions Section
        item {
            Text("Clinic Portal License & Renewal Payments", fontWeight = FontWeight.Bold, fontSize = 14.sp)
            Spacer(modifier = Modifier.height(6.dp))
            if (subscriptions.isEmpty()) {
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(10.dp),
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.3f))
                ) {
                    Text("No subscription renewal payments recorded yet.", modifier = Modifier.padding(14.dp), fontSize = 12.sp)
                }
            } else {
                Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    subscriptions.forEach { sub ->
                        Card(
                            modifier = Modifier.fillMaxWidth(),
                            shape = RoundedCornerShape(10.dp),
                            border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.15f))
                        ) {
                            Column(modifier = Modifier.padding(12.dp)) {
                                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                    Text(
                                        if (sub.durationMonths == 12) "12 Months (Annual Plan)" else "${sub.durationMonths} Month Plan",
                                        fontSize = 12.sp,
                                        fontWeight = FontWeight.Bold
                                    )
                                    Text(
                                        sub.status,
                                        fontSize = 10.sp,
                                        fontWeight = FontWeight.Bold,
                                        color = if (sub.status == "VERIFIED") Color(0xFF059669) else Color(0xFFD97706)
                                    )
                                }
                                Spacer(modifier = Modifier.height(4.dp))
                                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                    Text("Method: ${sub.paymentMethod} \u2022 Ref: ${sub.referenceId ?: "\u2013"}", fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                    Text(CurrencyFormatter.formatNPR(sub.amount), fontSize = 13.sp, fontWeight = FontWeight.Black, color = Color(0xFF0D9488))
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

// Stepper navigation utilities
private fun stepDay(current: String, deltaDays: Int): String {
    return try {
        val sdf = SimpleDateFormat("yyyy-MM-dd", Locale.US)
        val cal = Calendar.getInstance()
        cal.time = sdf.parse(current) ?: Date()
        cal.add(Calendar.DAY_OF_MONTH, deltaDays)
        sdf.format(cal.time)
    } catch (_: Exception) {
        current
    }
}

private fun stepMonth(currentMonthStr: String, deltaMonths: Int): String {
    return try {
        val sdf = SimpleDateFormat("yyyy-MM", Locale.US)
        val cal = Calendar.getInstance()
        cal.time = sdf.parse(currentMonthStr) ?: Date()
        cal.add(Calendar.MONTH, deltaMonths)
        sdf.format(cal.time)
    } catch (_: Exception) {
        currentMonthStr
    }
}

private fun stepYear(currentYearStr: String, deltaYears: Int): String {
    val y = currentYearStr.toIntOrNull() ?: Calendar.getInstance().get(Calendar.YEAR)
    return (y + deltaYears).toString()
}
