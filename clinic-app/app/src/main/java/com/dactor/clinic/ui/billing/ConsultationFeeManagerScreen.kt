package com.dactor.clinic.ui.billing

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.navigation.NavController
import coil.compose.AsyncImage
import com.dactor.clinic.data.local.UserSessionManager
import com.dactor.clinic.data.model.Doctor
import com.dactor.clinic.data.repository.DoctorRepository
import com.dactor.clinic.ui.navigation.NavRoutes
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ConsultationFeeManagerScreen(
    navController: NavController,
    clinicId: String = "",
    doctorRepository: DoctorRepository? = null
) {
    val context = LocalContext.current
    val focusManager = LocalFocusManager.current
    val coroutineScope = rememberCoroutineScope()

    val effectiveClinicId = remember(clinicId) {
        if (clinicId.isNotBlank() && clinicId != "c1") clinicId
        else UserSessionManager(context).getSavedClinicId() ?: ""
    }

    var doctors by remember(effectiveClinicId) {
        mutableStateOf(
            if (effectiveClinicId.isNotBlank() && doctorRepository != null) {
                doctorRepository.getCachedDoctorsByClinic(effectiveClinicId)
            } else emptyList()
        )
    }
    var isLoading by remember { mutableStateOf(doctors.isEmpty()) }
    var searchQuery by remember { mutableStateOf("") }
    var feeInputs by remember { mutableStateOf<Map<String, String>>(emptyMap()) }
    var savingDoctorId by remember { mutableStateOf<String?>(null) }
    var savedDoctorId by remember { mutableStateOf<String?>(null) }
    var statusBanner by remember { mutableStateOf<String?>(null) }

    var bulkFeeInput by remember { mutableStateOf("") }
    var isApplyingBulk by remember { mutableStateOf(false) }

    fun loadDoctors() {
        coroutineScope.launch {
            if (doctorRepository != null && effectiveClinicId.isNotBlank()) {
                if (doctors.isEmpty()) isLoading = true
                val fetched = doctorRepository.getDoctorsByClinic(effectiveClinicId)
                    .filter { !it.isLabTechnician }
                doctors = fetched
                val initialMap = mutableMapOf<String, String>()
                fetched.forEach { doc ->
                    initialMap[doc.id] = (doc.consultationFee ?: 500.0).toInt().toString()
                }
                feeInputs = initialMap
                isLoading = false
            } else {
                isLoading = false
            }
        }
    }

    LaunchedEffect(effectiveClinicId) {
        loadDoctors()
    }

    val filteredDoctors = remember(doctors, searchQuery) {
        if (searchQuery.isBlank()) doctors
        else {
            val q = searchQuery.trim().lowercase()
            doctors.filter { doc ->
                doc.fullName.lowercase().contains(q) ||
                    (doc.specialty?.lowercase()?.contains(q) == true) ||
                    (doc.nmcLicenseNumber?.lowercase()?.contains(q) == true)
            }
        }
    }

    val presetFees = listOf(300, 500, 600, 800, 1000)

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text(
                            "Consultation Fees",
                            fontWeight = FontWeight.Bold,
                            fontSize = 18.sp,
                            color = Color(0xFF0F172A)
                        )
                        Text(
                            "Clinic-controlled OPD fees for enlisted doctors",
                            fontSize = 11.sp,
                            color = Color(0xFF64748B)
                        )
                    }
                },
                navigationIcon = {
                    IconButton(onClick = { navController.popBackStack() }) {
                        Icon(Icons.Default.ArrowBack, contentDescription = "Back")
                    }
                },
                actions = {
                    IconButton(onClick = { loadDoctors() }) {
                        Icon(Icons.Default.Refresh, contentDescription = "Refresh")
                    }
                }
            )
        }
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .background(Color(0xFFF8FAFC))
                .padding(padding)
                .padding(horizontal = 16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            Spacer(Modifier.height(2.dp))

            // Info Card
            Surface(
                shape = RoundedCornerShape(14.dp),
                color = Color(0xFFF0FDFA),
                border = BorderStroke(1.dp, Color(0xFF99F6E4)),
                modifier = Modifier.fillMaxWidth()
            ) {
                Row(
                    modifier = Modifier.padding(12.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    Surface(
                        shape = CircleShape,
                        color = Color(0xFFCCFBF1),
                        modifier = Modifier.size(36.dp)
                    ) {
                        Box(contentAlignment = Alignment.Center) {
                            Icon(
                                Icons.Default.Payments,
                                contentDescription = null,
                                tint = Color(0xFF0D9488),
                                modifier = Modifier.size(18.dp)
                            )
                        }
                    }
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            "Clinic Fee Control Active",
                            fontWeight = FontWeight.Bold,
                            fontSize = 13.sp,
                            color = Color(0xFF115E59)
                        )
                        Text(
                            "Consultation fees are managed exclusively by your clinic and automatically reflect on patient bookings & walk-in counters.",
                            fontSize = 11.sp,
                            color = Color(0xFF0F766E),
                            lineHeight = 15.sp
                        )
                    }
                }
            }

            if (statusBanner != null) {
                Surface(
                    shape = RoundedCornerShape(10.dp),
                    color = Color(0xFFDCFCE7),
                    border = BorderStroke(1.dp, Color(0xFF86EFAC)),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Row(
                        modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                            modifier = Modifier.weight(1f)
                        ) {
                            Icon(
                                Icons.Default.CheckCircle,
                                contentDescription = null,
                                tint = Color(0xFF16A34A),
                                modifier = Modifier.size(16.dp)
                            )
                            Text(
                                statusBanner ?: "",
                                fontSize = 12.sp,
                                fontWeight = FontWeight.SemiBold,
                                color = Color(0xFF166534)
                            )
                        }
                        IconButton(
                            onClick = { statusBanner = null },
                            modifier = Modifier.size(24.dp)
                        ) {
                            Icon(
                                Icons.Default.Close,
                                contentDescription = "Dismiss",
                                tint = Color(0xFF166534),
                                modifier = Modifier.size(14.dp)
                            )
                        }
                    }
                }
            }

            if (isLoading) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .weight(1f),
                    contentAlignment = Alignment.Center
                ) {
                    CircularProgressIndicator(color = Color(0xFF0D9488))
                }
            } else if (doctors.isEmpty()) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .weight(1f),
                    contentAlignment = Alignment.Center
                ) {
                    Card(
                        shape = RoundedCornerShape(18.dp),
                        colors = CardDefaults.cardColors(containerColor = Color.White),
                        border = BorderStroke(1.dp, Color(0xFFE2E8F0)),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Column(
                            modifier = Modifier.padding(24.dp),
                            horizontalAlignment = Alignment.CenterHorizontally,
                            verticalArrangement = Arrangement.spacedBy(10.dp)
                        ) {
                            Surface(
                                shape = CircleShape,
                                color = Color(0xFFEFF6FF),
                                modifier = Modifier.size(56.dp)
                            ) {
                                Box(contentAlignment = Alignment.Center) {
                                    Icon(
                                        Icons.Default.PersonAddAlt1,
                                        contentDescription = null,
                                        tint = Color(0xFF2563EB),
                                        modifier = Modifier.size(28.dp)
                                    )
                                }
                            }
                            Text(
                                "No Enlisted Doctors Yet",
                                fontWeight = FontWeight.Bold,
                                fontSize = 16.sp,
                                color = Color(0xFF0F172A)
                            )
                            Text(
                                "Invite and connect doctors to your clinic roster to configure their OPD consultation fees.",
                                fontSize = 12.sp,
                                color = Color(0xFF64748B),
                                textAlign = TextAlign.Center
                            )
                            Spacer(Modifier.height(4.dp))
                            Button(
                                onClick = { navController.navigate(NavRoutes.InvitationManager) },
                                shape = RoundedCornerShape(12.dp),
                                colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF2563EB))
                            ) {
                                Icon(Icons.Default.Add, contentDescription = null, modifier = Modifier.size(18.dp))
                                Spacer(Modifier.width(6.dp))
                                Text("Invite Doctors", fontWeight = FontWeight.Bold)
                            }
                        }
                    }
                }
            } else {
                // Search Bar + Bulk Fee Setter
                OutlinedTextField(
                    value = searchQuery,
                    onValueChange = { searchQuery = it },
                    label = { Text("Search doctor by name or specialty") },
                    leadingIcon = { Icon(Icons.Default.Search, contentDescription = null) },
                    trailingIcon = {
                        if (searchQuery.isNotEmpty()) {
                            IconButton(onClick = { searchQuery = "" }) {
                                Icon(Icons.Default.Clear, contentDescription = "Clear")
                            }
                        }
                    },
                    singleLine = true,
                    shape = RoundedCornerShape(12.dp),
                    modifier = Modifier.fillMaxWidth()
                )

                // Uniform Bulk Fee Card (Optional quick action for clinic)
                Card(
                    shape = RoundedCornerShape(14.dp),
                    colors = CardDefaults.cardColors(containerColor = Color.White),
                    border = BorderStroke(1.dp, Color(0xFFE2E8F0)),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(12.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(10.dp)
                    ) {
                        OutlinedTextField(
                            value = bulkFeeInput,
                            onValueChange = { if (it.all { ch -> ch.isDigit() } && it.length <= 6) bulkFeeInput = it },
                            label = { Text("Set Standard Fee for All (Rs.)") },
                            placeholder = { Text("e.g. 500") },
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                            singleLine = true,
                            shape = RoundedCornerShape(10.dp),
                            modifier = Modifier.weight(1f)
                        )
                        Button(
                            onClick = {
                                val feeVal = bulkFeeInput.toDoubleOrNull()
                                if (feeVal != null && feeVal >= 0 && doctorRepository != null) {
                                    focusManager.clearFocus()
                                    isApplyingBulk = true
                                    coroutineScope.launch {
                                        doctors.forEach { doc ->
                                            doctorRepository.updateDoctorConsultationFee(
                                                doctorId = doc.id,
                                                consultationFee = feeVal,
                                                clinicId = effectiveClinicId
                                            )
                                        }
                                        val updated = doctors.map { it.copy(consultationFee = feeVal) }
                                        doctors = updated
                                        val newInputs = feeInputs.toMutableMap()
                                        updated.forEach { d -> newInputs[d.id] = feeVal.toInt().toString() }
                                        feeInputs = newInputs
                                        isApplyingBulk = false
                                        statusBanner = "Updated consultation fee to Rs. ${feeVal.toInt()} for all ${updated.size} doctors."
                                    }
                                }
                            },
                            enabled = !isApplyingBulk && bulkFeeInput.isNotBlank(),
                            shape = RoundedCornerShape(10.dp),
                            colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF0D9488)),
                            modifier = Modifier.height(52.dp)
                        ) {
                            if (isApplyingBulk) {
                                CircularProgressIndicator(
                                    color = Color.White,
                                    modifier = Modifier.size(16.dp),
                                    strokeWidth = 2.dp
                                )
                            } else {
                                Text("Apply All", fontWeight = FontWeight.Bold, fontSize = 12.sp)
                            }
                        }
                    }
                }

                LazyColumn(
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                    contentPadding = PaddingValues(bottom = 80.dp),
                    modifier = Modifier
                        .fillMaxWidth()
                        .weight(1f)
                ) {
                    items(filteredDoctors, key = { it.id }) { doctor ->
                        val currentInput = feeInputs[doctor.id] ?: (doctor.consultationFee ?: 500.0).toInt().toString()
                        val displayDocName = if (doctor.fullName.startsWith("Dr.", ignoreCase = true)) {
                            doctor.fullName
                        } else {
                            "Dr. ${doctor.fullName}"
                        }
                        val isSavingThis = savingDoctorId == doctor.id
                        val isSavedThis = savedDoctorId == doctor.id

                        Card(
                            shape = RoundedCornerShape(16.dp),
                            colors = CardDefaults.cardColors(containerColor = Color.White),
                            border = BorderStroke(1.dp, Color(0xFFE2E8F0)),
                            elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Column(
                                modifier = Modifier.padding(16.dp),
                                verticalArrangement = Arrangement.spacedBy(12.dp)
                            ) {
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.SpaceBetween
                                ) {
                                    Row(
                                        verticalAlignment = Alignment.CenterVertically,
                                        horizontalArrangement = Arrangement.spacedBy(12.dp),
                                        modifier = Modifier.weight(1f)
                                    ) {
                                        if (!doctor.resolvedProfilePictureUrl.isNullOrBlank()) {
                                            AsyncImage(
                                                model = doctor.resolvedProfilePictureUrl,
                                                contentDescription = doctor.fullName,
                                                contentScale = ContentScale.Crop,
                                                modifier = Modifier
                                                    .size(48.dp)
                                                    .clip(CircleShape)
                                            )
                                        } else {
                                            Surface(
                                                shape = CircleShape,
                                                color = Color(0xFFE0F2FE),
                                                modifier = Modifier.size(48.dp)
                                            ) {
                                                Box(contentAlignment = Alignment.Center) {
                                                    Icon(
                                                        Icons.Default.MedicalServices,
                                                        contentDescription = null,
                                                        tint = Color(0xFF0284C7),
                                                        modifier = Modifier.size(24.dp)
                                                    )
                                                }
                                            }
                                        }

                                        Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                                            Text(
                                                displayDocName,
                                                fontWeight = FontWeight.Bold,
                                                fontSize = 15.sp,
                                                color = Color(0xFF0F172A)
                                            )
                                            Text(
                                                "${doctor.specialty ?: "General Physician"}${if (!doctor.nmcLicenseNumber.isNullOrBlank()) " • NMC: ${doctor.nmcLicenseNumber}" else ""}",
                                                fontSize = 12.sp,
                                                color = Color(0xFF64748B)
                                            )
                                        }
                                    }

                                    Surface(
                                        shape = RoundedCornerShape(10.dp),
                                        color = Color(0xFFF0FDFA),
                                        border = BorderStroke(1.dp, Color(0xFF99F6E4))
                                    ) {
                                        Text(
                                            text = "Rs. ${(doctor.consultationFee ?: 500.0).toInt()}",
                                            fontWeight = FontWeight.ExtraBold,
                                            fontSize = 14.sp,
                                            color = Color(0xFF0D9488),
                                            modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp)
                                        )
                                    }
                                }

                                // Quick Preset Fee Chips
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.spacedBy(6.dp)
                                ) {
                                    presetFees.forEach { preset ->
                                        val isSelected = currentInput.trim() == preset.toString()
                                        Surface(
                                            shape = RoundedCornerShape(8.dp),
                                            color = if (isSelected) Color(0xFF0D9488) else Color(0xFFF1F5F9),
                                            modifier = Modifier
                                                .weight(1f)
                                                .clickable {
                                                    feeInputs = feeInputs.toMutableMap().apply {
                                                        put(doctor.id, preset.toString())
                                                    }
                                                }
                                        ) {
                                            Text(
                                                text = "Rs.$preset",
                                                fontSize = 11.sp,
                                                fontWeight = FontWeight.Bold,
                                                color = if (isSelected) Color.White else Color(0xFF475569),
                                                textAlign = TextAlign.Center,
                                                modifier = Modifier.padding(vertical = 6.dp)
                                            )
                                        }
                                    }
                                }

                                // Custom Fee Input + Save Button
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(10.dp)
                                ) {
                                    OutlinedTextField(
                                        value = currentInput,
                                        onValueChange = { value ->
                                            if (value.all { it.isDigit() } && value.length <= 6) {
                                                feeInputs = feeInputs.toMutableMap().apply {
                                                    put(doctor.id, value)
                                                }
                                            }
                                        },
                                        label = { Text("Consultation Fee (Rs.)") },
                                        leadingIcon = { Icon(Icons.Default.Payments, contentDescription = null) },
                                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                                        singleLine = true,
                                        shape = RoundedCornerShape(10.dp),
                                        modifier = Modifier.weight(1f)
                                    )

                                    Button(
                                        onClick = {
                                            val newFee = currentInput.toDoubleOrNull()
                                            if (newFee != null && newFee >= 0 && doctorRepository != null) {
                                                focusManager.clearFocus()
                                                savingDoctorId = doctor.id
                                                coroutineScope.launch {
                                                    val ok = doctorRepository.updateDoctorConsultationFee(
                                                        doctorId = doctor.id,
                                                        consultationFee = newFee,
                                                        clinicId = effectiveClinicId
                                                    )
                                                    savingDoctorId = null
                                                    if (ok) {
                                                        doctors = doctors.map {
                                                            if (it.id == doctor.id) it.copy(consultationFee = newFee) else it
                                                        }
                                                        savedDoctorId = doctor.id
                                                        statusBanner = "Updated $displayDocName's consultation fee to Rs. ${newFee.toInt()}."
                                                        delay(2000L)
                                                        if (savedDoctorId == doctor.id) savedDoctorId = null
                                                    }
                                                }
                                            }
                                        },
                                        enabled = !isSavingThis && currentInput.isNotBlank(),
                                        shape = RoundedCornerShape(10.dp),
                                        colors = ButtonDefaults.buttonColors(
                                            containerColor = if (isSavedThis) Color(0xFF16A34A) else Color(0xFF0284C7)
                                        ),
                                        modifier = Modifier.height(52.dp)
                                    ) {
                                        if (isSavingThis) {
                                            CircularProgressIndicator(
                                                color = Color.White,
                                                modifier = Modifier.size(16.dp),
                                                strokeWidth = 2.dp
                                            )
                                        } else if (isSavedThis) {
                                            Icon(Icons.Default.Check, contentDescription = null, modifier = Modifier.size(16.dp))
                                            Spacer(Modifier.width(4.dp))
                                            Text("Saved", fontWeight = FontWeight.Bold, fontSize = 12.sp)
                                        } else {
                                            Text("Save Fee", fontWeight = FontWeight.Bold, fontSize = 12.sp)
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
