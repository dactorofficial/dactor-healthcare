package com.dactor.clinic.ui.services

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.navigation.NavController
import com.dactor.clinic.data.local.UserSessionManager
import com.dactor.clinic.data.model.Clinic
import com.dactor.clinic.data.model.ClinicService
import com.dactor.clinic.data.repository.ClinicRepository
import com.dactor.clinic.domain.util.CurrencyFormatter
import kotlinx.coroutines.launch
import java.util.UUID

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ServicesScreen(
    navController: NavController,
    clinicId: String = "",
    clinicRepository: ClinicRepository? = null
) {
    val context = androidx.compose.ui.platform.LocalContext.current
    val sessionManager = remember { UserSessionManager(context) }
    val effectiveClinicId = remember(clinicId) {
        if (clinicId.isNotBlank() && clinicId != "c1") clinicId
        else sessionManager.getSavedClinicId() ?: ""
    }
    val defaultClinicName = remember(context) {
        sessionManager.getSavedName()?.takeIf { it.isNotBlank() } ?: "Diagnostic Lab"
    }

    var currentClinic by remember(effectiveClinicId) { mutableStateOf<Clinic?>(null) }
    var services by remember(effectiveClinicId) { mutableStateOf<List<ClinicService>>(emptyList()) }
    var isLabClinic by remember { mutableStateOf(false) }
    var searchQuery by remember { mutableStateOf("") }

    var showAddDialog by remember { mutableStateOf(false) }
    var newServiceName by remember { mutableStateOf("") }
    var newServiceDesc by remember { mutableStateOf("") }
    var newServicePrice by remember { mutableStateOf("") }
    var isAdding by remember { mutableStateOf(false) }

    val coroutineScope = rememberCoroutineScope()

    val quickLabPresets = remember {
        listOf(
            Triple("Complete Blood Count (CBC)", "Hb, TLC, DLC, Platelets, RBC", "450"),
            Triple("Lipid Profile", "Total Cholesterol, HDL, LDL, Triglycerides", "850"),
            Triple("Thyroid Function Test (TFT)", "T3, T4, TSH Panel", "950"),
            Triple("Liver Function Test (LFT)", "Bilirubin, SGOT, SGPT, ALP", "800"),
            Triple("Renal Function Test (RFT)", "Urea, Creatinine, Uric Acid, Electrolytes", "750"),
            Triple("HbA1c & Fasting Blood Sugar", "Glycosylated Hemoglobin & Glucose", "650"),
            Triple("Urine Routine & Microscopy", "Physical, Chemical & Microscopic Exam", "250"),
            Triple("Vitamin D & B12 Panel", "25-OH Vitamin D & Serum B12", "1800")
        )
    }

    suspend fun loadServices() {
        if (clinicRepository != null && effectiveClinicId.isNotBlank()) {
            val remote = clinicRepository.getClinicServices(effectiveClinicId)
            services = remote
            try {
                val c = clinicRepository.getClinicById(effectiveClinicId)
                currentClinic = c
                if (c != null) {
                    val t = c.type?.lowercase() ?: ""
                    val n = c.name.lowercase()
                    isLabClinic = t.contains("lab") || t == "diagnostic_lab" || n.contains("lab") ||
                        (c.specialties?.any { it.lowercase().contains("lab") || it.lowercase().contains("patholog") } == true)
                }
            } catch (ignored: Exception) {}
        }
    }

    LaunchedEffect(effectiveClinicId) {
        loadServices()
    }

    val filteredServices = remember(services, searchQuery) {
        if (searchQuery.isBlank()) services
        else {
            val q = searchQuery.trim().lowercase()
            services.filter {
                it.serviceName.lowercase().contains(q) ||
                    (it.description?.lowercase()?.contains(q) == true) ||
                    it.price.toInt().toString().contains(q)
            }
        }
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(
                Brush.verticalGradient(
                    colors = listOf(
                        Color(0xFFF8FAFC),
                        Color(0xFFF1F5F9),
                        Color(0xFFE0F2FE).copy(alpha = 0.35f)
                    )
                )
            )
    ) {
        Scaffold(
            containerColor = Color.Transparent,
            topBar = {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .statusBarsPadding()
                        .padding(horizontal = 16.dp, vertical = 6.dp)
                ) {
                    // Top Clinic Pill Tag Matching PatientDirectoryScreen Template
                    Surface(
                        color = Color(0xFF0F4C81),
                        shape = RoundedCornerShape(8.dp),
                        modifier = Modifier.padding(bottom = 6.dp)
                    ) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(4.dp),
                            modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp)
                        ) {
                            Icon(
                                Icons.Default.LocalHospital,
                                contentDescription = null,
                                tint = Color.White,
                                modifier = Modifier.size(11.dp)
                            )
                            Text(
                                text = currentClinic?.name ?: defaultClinicName,
                                color = Color.White,
                                fontSize = 11.sp,
                                fontWeight = FontWeight.SemiBold
                            )
                        }
                    }

                    // Main Top App Bar Row
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(10.dp),
                            modifier = Modifier.weight(1f)
                        ) {
                            IconButton(
                                onClick = { navController.popBackStack() },
                                modifier = Modifier.size(36.dp)
                            ) {
                                Icon(
                                    Icons.AutoMirrored.Filled.ArrowBack,
                                    contentDescription = "Back",
                                    tint = Color(0xFF0F172A),
                                    modifier = Modifier.size(24.dp)
                                )
                            }
                            Text(
                                text = if (isLabClinic) "Lab Tests & Report Rates" else "Clinic Services & Pricing",
                                fontWeight = FontWeight.Bold,
                                fontSize = 19.sp,
                                color = Color(0xFF0F172A)
                            )
                        }

                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                            IconButton(
                                onClick = {
                                    newServiceName = ""
                                    newServiceDesc = ""
                                    newServicePrice = ""
                                    showAddDialog = true
                                },
                                modifier = Modifier.size(36.dp)
                            ) {
                                Icon(Icons.Default.AddCircle, contentDescription = "Add Test", tint = Color(0xFF0097A7))
                            }
                            IconButton(
                                onClick = { coroutineScope.launch { loadServices() } },
                                modifier = Modifier.size(36.dp)
                            ) {
                                Icon(Icons.Default.Refresh, contentDescription = "Refresh", tint = Color(0xFF475569))
                            }
                        }
                    }
                }
            },
            floatingActionButton = {
                ExtendedFloatingActionButton(
                    onClick = {
                        newServiceName = ""
                        newServiceDesc = ""
                        newServicePrice = ""
                        showAddDialog = true
                    },
                    icon = { Icon(Icons.Default.Add, contentDescription = null, tint = Color.White) },
                    text = {
                        Text(
                            if (isLabClinic) "Add Lab Test & Price" else "Add Service",
                            fontWeight = FontWeight.Bold,
                            color = Color.White
                        )
                    },
                    shape = RoundedCornerShape(16.dp),
                    containerColor = Color(0xFF0097A7)
                )
            }
        ) { padding ->
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(padding)
                    .padding(horizontal = 16.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                // Info Banner Matching PatientDirectoryScreen Style
                Surface(
                    shape = RoundedCornerShape(16.dp),
                    color = Color.White,
                    border = BorderStroke(1.dp, Color(0xFFE2E8F0)),
                    shadowElevation = 1.dp,
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(14.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        Surface(
                            shape = CircleShape,
                            color = Color(0xFFE0F7FA),
                            modifier = Modifier.size(40.dp)
                        ) {
                            Box(contentAlignment = Alignment.Center) {
                                Icon(
                                    if (isLabClinic) Icons.Default.Science else Icons.Default.MedicalServices,
                                    contentDescription = null,
                                    tint = Color(0xFF00838F),
                                    modifier = Modifier.size(22.dp)
                                )
                            }
                        }
                        Column(modifier = Modifier.weight(1f)) {
                            Text(
                                text = if (isLabClinic) "Booking Price Decided by Selected Tests (${services.size} Tests)"
                                else "Configured Clinic Services (${services.size})",
                                fontWeight = FontWeight.Bold,
                                fontSize = 13.5.sp,
                                color = Color(0xFF0F172A)
                            )
                            Text(
                                text = if (isLabClinic)
                                    "Lab bookings have no fixed consultation fee. Patients select which tests/reports they want from this list and the total price is calculated automatically."
                                else
                                    "Services configured here are searchable by patients and can be added to clinic bills.",
                                fontSize = 11.5.sp,
                                color = Color(0xFF64748B)
                            )
                        }
                    }
                }

                // Search Bar Matching PatientDirectoryScreen Template
                Surface(
                    shape = RoundedCornerShape(16.dp),
                    color = Color.White,
                    border = BorderStroke(1.dp, Color(0xFFE2E8F0)),
                    shadowElevation = 1.dp,
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 14.dp, vertical = 4.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(10.dp)
                    ) {
                        Icon(
                            Icons.Default.Search,
                            contentDescription = null,
                            tint = Color(0xFF0097A7),
                            modifier = Modifier.size(22.dp)
                        )

                        OutlinedTextField(
                            value = searchQuery,
                            onValueChange = { searchQuery = it },
                            placeholder = {
                                Text(
                                    if (isLabClinic) "Search Lab Test Name or Price..." else "Search Service Name or Price...",
                                    fontSize = 12.5.sp,
                                    color = Color(0xFF94A3B8)
                                )
                            },
                            trailingIcon = {
                                if (searchQuery.isNotBlank()) {
                                    IconButton(
                                        onClick = { searchQuery = "" },
                                        modifier = Modifier.size(24.dp)
                                    ) {
                                        Icon(Icons.Default.Clear, contentDescription = "Clear", tint = Color(0xFF64748B), modifier = Modifier.size(16.dp))
                                    }
                                }
                            },
                            singleLine = true,
                            colors = OutlinedTextFieldDefaults.colors(
                                focusedBorderColor = Color.Transparent,
                                unfocusedBorderColor = Color.Transparent,
                                cursorColor = Color(0xFF0097A7)
                            ),
                            modifier = Modifier.weight(1f)
                        )
                    }
                }

                if (filteredServices.isEmpty()) {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .weight(1f)
                            .padding(vertical = 36.dp),
                        contentAlignment = Alignment.Center
                    ) {
                        Column(
                            horizontalAlignment = Alignment.CenterHorizontally,
                            verticalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            Icon(
                                if (isLabClinic) Icons.Default.Science else Icons.Default.MedicalServices,
                                contentDescription = null,
                                tint = Color(0xFF94A3B8),
                                modifier = Modifier.size(48.dp)
                            )
                            Text(
                                text = if (isLabClinic) "No Lab Tests Added Yet" else "No Services Added Yet",
                                fontWeight = FontWeight.Bold,
                                fontSize = 16.sp,
                                color = Color(0xFF0F172A)
                            )
                            Text(
                                text = if (isLabClinic)
                                    "Tap 'Add Lab Test & Price' below to configure diagnostic tests and report rates for patient booking."
                                else
                                    "Tap 'Add Service' to configure your first clinic service.",
                                fontSize = 12.sp,
                                color = Color(0xFF64748B),
                                textAlign = TextAlign.Center
                            )
                        }
                    }
                } else {
                    LazyColumn(
                        verticalArrangement = Arrangement.spacedBy(12.dp),
                        contentPadding = PaddingValues(bottom = 84.dp),
                        modifier = Modifier
                            .fillMaxWidth()
                            .weight(1f)
                    ) {
                        items(filteredServices, key = { it.id }) { service ->
                            Card(
                                shape = RoundedCornerShape(20.dp),
                                colors = CardDefaults.cardColors(containerColor = Color.White),
                                border = BorderStroke(1.dp, Color(0xFFE2E8F0)),
                                elevation = CardDefaults.cardElevation(defaultElevation = 2.dp),
                                modifier = Modifier.fillMaxWidth()
                            ) {
                                Column(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .padding(16.dp),
                                    verticalArrangement = Arrangement.spacedBy(10.dp)
                                ) {
                                    Row(
                                        modifier = Modifier.fillMaxWidth(),
                                        verticalAlignment = Alignment.CenterVertically,
                                        horizontalArrangement = Arrangement.spacedBy(14.dp)
                                    ) {
                                        Surface(
                                            shape = CircleShape,
                                            color = Color(0xFFD0EEFB),
                                            modifier = Modifier.size(48.dp)
                                        ) {
                                            Box(contentAlignment = Alignment.Center) {
                                                Icon(
                                                    if (isLabClinic) Icons.Default.Science else Icons.Default.MedicalServices,
                                                    contentDescription = null,
                                                    tint = Color(0xFF00838F),
                                                    modifier = Modifier.size(26.dp)
                                                )
                                            }
                                        }

                                        Column(modifier = Modifier.weight(1f)) {
                                            Text(
                                                text = service.serviceName,
                                                fontWeight = FontWeight.Bold,
                                                fontSize = 16.sp,
                                                color = Color(0xFF0F172A),
                                                maxLines = 2,
                                                overflow = TextOverflow.Ellipsis
                                            )
                                            if (!service.description.isNullOrBlank()) {
                                                Text(
                                                    text = service.description ?: "",
                                                    fontSize = 12.sp,
                                                    color = Color(0xFF64748B),
                                                    modifier = Modifier.padding(top = 2.dp)
                                                )
                                            }
                                        }

                                        Surface(
                                            color = Color(0xFFECFDF5),
                                            shape = RoundedCornerShape(10.dp),
                                            border = BorderStroke(1.dp, Color(0xFFA7F3D0))
                                        ) {
                                            Text(
                                                text = CurrencyFormatter.formatNPR(service.price),
                                                fontWeight = FontWeight.ExtraBold,
                                                fontSize = 14.5.sp,
                                                color = Color(0xFF059669),
                                                modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp)
                                            )
                                        }

                                        IconButton(
                                            onClick = {
                                                coroutineScope.launch {
                                                    clinicRepository?.deleteService(service.id)
                                                    services = services.filter { it.id != service.id }
                                                }
                                            },
                                            modifier = Modifier.size(34.dp)
                                        ) {
                                            Icon(
                                                Icons.Default.Delete,
                                                contentDescription = "Delete",
                                                tint = Color(0xFFDC2626),
                                                modifier = Modifier.size(20.dp)
                                            )
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }

            // Add Lab Test / Service Dialog
            if (showAddDialog) {
                AlertDialog(
                    onDismissRequest = { if (!isAdding) showAddDialog = false },
                    title = {
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            Icon(
                                if (isLabClinic) Icons.Default.Science else Icons.Default.MedicalServices,
                                contentDescription = null,
                                tint = Color(0xFF0097A7)
                            )
                            Text(
                                if (isLabClinic) "Add Lab Test & Report Price" else "Add Clinic Service",
                                fontWeight = FontWeight.Bold,
                                fontSize = 17.sp
                            )
                        }
                    },
                    text = {
                        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                            if (isLabClinic) {
                                Text("Quick-Fill Common Lab Tests:", fontSize = 11.5.sp, fontWeight = FontWeight.SemiBold, color = Color(0xFF475569))
                                Row(
                                    modifier = Modifier.horizontalScroll(rememberScrollState()),
                                    horizontalArrangement = Arrangement.spacedBy(6.dp)
                                ) {
                                    quickLabPresets.forEach { (tName, tDesc, tPrice) ->
                                        SuggestionChip(
                                            onClick = {
                                                newServiceName = tName
                                                newServiceDesc = tDesc
                                                newServicePrice = tPrice
                                            },
                                            label = { Text("$tName (Rs. $tPrice)", fontSize = 11.sp) }
                                        )
                                    }
                                }
                            }

                            OutlinedTextField(
                                value = newServiceName,
                                onValueChange = { newServiceName = it },
                                label = { Text(if (isLabClinic) "Lab Test / Report Name *" else "Service / Test Name *") },
                                placeholder = { Text(if (isLabClinic) "e.g. Complete Blood Count (CBC)" else "e.g. ECG, Dental X-Ray") },
                                modifier = Modifier.fillMaxWidth(),
                                shape = RoundedCornerShape(10.dp)
                            )
                            OutlinedTextField(
                                value = newServiceDesc,
                                onValueChange = { newServiceDesc = it },
                                label = { Text(if (isLabClinic) "Test Parameters / Details (Optional)" else "Description (Optional)") },
                                placeholder = { Text(if (isLabClinic) "e.g. Hb, TLC, DLC, Platelets count" else "Short description") },
                                modifier = Modifier.fillMaxWidth(),
                                shape = RoundedCornerShape(10.dp)
                            )
                            OutlinedTextField(
                                value = newServicePrice,
                                onValueChange = { newServicePrice = it },
                                label = { Text("Price (in Rs.) *") },
                                placeholder = { Text(if (isLabClinic) "450" else "500") },
                                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                                modifier = Modifier.fillMaxWidth(),
                                shape = RoundedCornerShape(10.dp)
                            )
                        }
                    },
                    confirmButton = {
                        Button(
                            onClick = {
                                val priceVal = newServicePrice.toDoubleOrNull() ?: 0.0
                                if (newServiceName.isNotBlank() && priceVal > 0) {
                                    isAdding = true
                                    val newSrv = ClinicService(
                                        id = UUID.randomUUID().toString(),
                                        clinicId = effectiveClinicId,
                                        serviceName = newServiceName.trim(),
                                        description = newServiceDesc.trim().ifBlank { null },
                                        price = priceVal
                                    )
                                    coroutineScope.launch {
                                        clinicRepository?.addService(newSrv)
                                        services = services + newSrv
                                        newServiceName = ""
                                        newServiceDesc = ""
                                        newServicePrice = ""
                                        isAdding = false
                                        showAddDialog = false
                                    }
                                }
                            },
                            enabled = !isAdding && newServiceName.isNotBlank() && newServicePrice.isNotBlank(),
                            colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF0097A7)),
                            shape = RoundedCornerShape(10.dp)
                        ) {
                            Text(if (isLabClinic) "Add Lab Test" else "Add Service", fontWeight = FontWeight.Bold)
                        }
                    },
                    dismissButton = {
                        TextButton(onClick = { showAddDialog = false }) {
                            Text("Cancel")
                        }
                    }
                )
            }
        }
    }
}
