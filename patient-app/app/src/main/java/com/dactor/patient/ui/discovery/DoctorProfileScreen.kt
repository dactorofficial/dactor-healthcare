package com.dactor.patient.ui.discovery

import android.widget.Toast
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.ArrowForward
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.navigation.NavController
import coil.compose.AsyncImage
import com.dactor.patient.data.local.UserSessionManager
import com.dactor.patient.data.model.Clinic
import com.dactor.patient.data.model.Doctor
import com.dactor.patient.data.repository.ClinicRepository
import com.dactor.patient.data.repository.DoctorRepository
import com.dactor.patient.data.repository.SlotRepository
import com.dactor.patient.ui.navigation.NavRoutes
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.withContext
import java.time.LocalDate

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun DoctorProfileScreen(
    navController: NavController,
    doctorId: String,
    initialDate: String? = null,
    doctorRepository: DoctorRepository? = null,
    clinicRepository: ClinicRepository? = null,
    slotRepository: SlotRepository? = null,
    sessionManager: UserSessionManager? = null
) {
    val context = LocalContext.current
    val todayStr = remember { LocalDate.now().toString() }
    val targetDateStr = remember(initialDate, todayStr) {
        initialDate?.takeIf { it.isNotBlank() } ?: todayStr
    }

    // Check in-memory caches first for instant rendering
    val initialCachedDoc = remember(doctorId) {
        doctorRepository?.getCachedAllDoctors()?.firstOrNull { it.id == doctorId }
            ?: doctorRepository?.getCachedDoctorsByClinicMap()?.values?.flatten()?.firstOrNull { it.id == doctorId }
    }

    var doctor by remember { mutableStateOf(initialCachedDoc) }
    var practicingClinics by remember { mutableStateOf<List<Clinic>>(emptyList()) }
    var clinicAvailabilityLabels by remember { mutableStateOf<Map<String, Pair<Boolean, String>>>(emptyMap()) }
    var isLoading by remember { mutableStateOf(initialCachedDoc == null) }
    var isLoadingClinics by remember { mutableStateOf(true) }

    LaunchedEffect(doctorId, targetDateStr) {
        withContext(Dispatchers.IO) {
            try {
                val resolvedDoc = doctorRepository?.getDoctorById(doctorId, forceRefresh = false)
                    ?: initialCachedDoc
                withContext(Dispatchers.Main) {
                    doctor = resolvedDoc
                    isLoading = false
                }

                if (resolvedDoc != null) {
                    // Resolve affiliated clinics robustly (remote + cached roster fallback)
                    val repoClinics = try {
                        doctorRepository?.getClinicsForDoctor(resolvedDoc) ?: emptyList()
                    } catch (_: Exception) {
                        emptyList()
                    }

                    val cachedRosterClinics = try {
                        val allC = clinicRepository?.getCachedClinics() ?: clinicRepository?.getClinics() ?: emptyList()
                        val byClinic = doctorRepository?.getCachedDoctorsByClinicMap() ?: emptyMap()
                        allC.filter { c ->
                            c.id == resolvedDoc.clinicId ||
                                c.id == resolvedDoc.primaryClinicId ||
                                c.id == resolvedDoc.activeClinicId ||
                                (byClinic[c.id]?.any { it.id == resolvedDoc.id } == true)
                        }
                    } catch (_: Exception) {
                        emptyList()
                    }

                    val combinedClinics = (repoClinics + cachedRosterClinics).distinctBy { it.id }
                    withContext(Dispatchers.Main) {
                        practicingClinics = combinedClinics
                        isLoadingClinics = false
                    }

                    // Fetch live slot availability per practicing clinic
                    if (slotRepository != null && combinedClinics.isNotEmpty()) {
                        val availPairs = coroutineScope {
                            combinedClinics.map { clinic ->
                                async {
                                    val dateSlots = try {
                                        slotRepository.getAvailableSlots(clinic.id, targetDateStr)
                                    } catch (_: Exception) {
                                        emptyList()
                                    }
                                    val matchingOnTarget = dateSlots.filter { s ->
                                        s.isPublished &&
                                            (s.doctorId == resolvedDoc.id || s.doctorId.isNullOrBlank()) &&
                                            (s.maxCapacity - s.bookedCount) > 0 &&
                                            !SlotRepository.isSlotEndTimeOver(s.endTime, targetDateStr, s.startTime)
                                    }.minByOrNull { it.startTime }

                                    if (matchingOnTarget != null) {
                                        val prefix = if (targetDateStr == todayStr) "Today" else targetDateStr
                                        clinic.id to (true to "$prefix \u2022 ${matchingOnTarget.startTime}")
                                    } else {
                                        val nextDate = try {
                                            slotRepository.getNextAvailableDate(clinic.id, todayStr, resolvedDoc.id)
                                        } catch (_: Exception) {
                                            null
                                        }
                                        val label = if (!nextDate.isNullOrBlank()) {
                                            SlotRepository.formatNextAvailableDate(nextDate)
                                        } else {
                                            "Check clinic schedule"
                                        }
                                        clinic.id to (false to label)
                                    }
                                }
                            }.awaitAll()
                        }
                        withContext(Dispatchers.Main) {
                            clinicAvailabilityLabels = availPairs.toMap()
                        }
                    }
                } else {
                    withContext(Dispatchers.Main) {
                        isLoading = false
                        isLoadingClinics = false
                    }
                }
            } catch (e: Exception) {
                e.printStackTrace()
                withContext(Dispatchers.Main) {
                    isLoading = false
                    isLoadingClinics = false
                }
            }
        }
    }

    fun navigateToBooking(clinic: Clinic, doc: Doctor) {
        val isDemo = sessionManager?.isGuestMode() == true || sessionManager?.isLoggedIn() != true
        val targetRoute = NavRoutes.Booking.createRoute(
            clinicId = clinic.id,
            doctorId = doc.id,
            date = targetDateStr
        )
        if (isDemo) {
            sessionManager?.savePendingBookingRedirect(
                route = targetRoute,
                clinicId = clinic.id,
                doctorId = doc.id,
                selectedDate = targetDateStr
            )
            Toast.makeText(context, "Please sign in with Google to book an appointment", Toast.LENGTH_SHORT).show()
            navController.navigate(NavRoutes.Login.route)
        } else {
            navController.navigate(targetRoute)
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        text = "Doctor Profile",
                        fontWeight = FontWeight.ExtraBold,
                        fontSize = 18.sp,
                        color = Color(0xFF0F172A)
                    )
                },
                navigationIcon = {
                    IconButton(onClick = { navController.popBackStack() }) {
                        Icon(
                            Icons.AutoMirrored.Filled.ArrowBack,
                            contentDescription = "Back",
                            tint = Color(0xFF0F172A)
                        )
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = Color.White)
            )
        },
        containerColor = Color(0xFFF0F9FF).copy(alpha = 0.45f)
    ) { padding ->
        if (isLoading) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(padding),
                contentAlignment = Alignment.Center
            ) {
                CircularProgressIndicator(color = Color(0xFF0284C7))
            }
            return@Scaffold
        }

        val currentDoc = doctor
        if (currentDoc == null) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(padding)
                    .padding(24.dp),
                contentAlignment = Alignment.Center
            ) {
                Column(
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    Icon(
                        Icons.Default.PersonOff,
                        contentDescription = null,
                        tint = Color(0xFF94A3B8),
                        modifier = Modifier.size(48.dp)
                    )
                    Text(
                        text = "Doctor profile not available",
                        fontWeight = FontWeight.Bold,
                        fontSize = 16.sp,
                        color = Color(0xFF0F172A)
                    )
                    OutlinedButton(onClick = { navController.popBackStack() }) {
                        Text("Go Back")
                    }
                }
            }
            return@Scaffold
        }

        val cleanName = currentDoc.fullName.removePrefix("Dr.").removePrefix("dr.").trim()
        val specs = currentDoc.allSpecialties.ifEmpty { listOf("General Physician") }
        val expYearsText = currentDoc.startingPracticingYear?.let { startYr ->
            val yrs = (LocalDate.now().year - startYr).coerceAtLeast(1)
            "$yrs+ Years"
        } ?: "Verified"
        val initials = cleanName.split(" ")
            .filter { it.isNotBlank() }
            .take(2)
            .mapNotNull { it.firstOrNull()?.uppercaseChar() }
            .joinToString("")
            .ifBlank { "DR" }

        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding),
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp)
        ) {
            // ── 1. BIG HERO PHOTO & IDENTITY CARD ─────────────────────────────────────
            item(key = "doc_hero") {
                Card(
                    shape = RoundedCornerShape(22.dp),
                    colors = CardDefaults.cardColors(containerColor = Color.White),
                    border = BorderStroke(1.dp, Color(0xFFE2E8F0)),
                    elevation = CardDefaults.cardElevation(defaultElevation = 2.dp),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 20.dp, vertical = 22.dp),
                        horizontalAlignment = Alignment.CenterHorizontally
                    ) {
                        Box(contentAlignment = Alignment.BottomEnd) {
                            Surface(
                                shape = CircleShape,
                                color = Color(0xFFE0F2FE),
                                border = BorderStroke(3.dp, Color(0xFF0284C7)),
                                shadowElevation = 4.dp,
                                modifier = Modifier.size(116.dp)
                            ) {
                                val avatarUrl = currentDoc.resolvedProfilePictureUrl
                                if (!avatarUrl.isNullOrBlank()) {
                                    AsyncImage(
                                        model = avatarUrl,
                                        contentDescription = "Dr. $cleanName",
                                        contentScale = ContentScale.Crop,
                                        modifier = Modifier.fillMaxSize()
                                    )
                                } else {
                                    Box(contentAlignment = Alignment.Center) {
                                        Text(
                                            text = initials,
                                            fontSize = 34.sp,
                                            fontWeight = FontWeight.ExtraBold,
                                            color = Color(0xFF0284C7)
                                        )
                                    }
                                }
                            }

                            if (currentDoc.isInClinic == true) {
                                Surface(
                                    shape = RoundedCornerShape(12.dp),
                                    color = Color(0xFFDCFCE7),
                                    border = BorderStroke(1.dp, Color(0xFF86EFAC)),
                                    shadowElevation = 2.dp
                                ) {
                                    Row(
                                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp),
                                        verticalAlignment = Alignment.CenterVertically,
                                        horizontalArrangement = Arrangement.spacedBy(4.dp)
                                    ) {
                                        Box(
                                            modifier = Modifier
                                                .size(7.dp)
                                                .background(Color(0xFF16A34A), CircleShape)
                                        )
                                        Text(
                                            text = "In Clinic",
                                            fontSize = 10.sp,
                                            fontWeight = FontWeight.ExtraBold,
                                            color = Color(0xFF15803D)
                                        )
                                    }
                                }
                            }
                        }

                        Spacer(Modifier.height(14.dp))

                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.Center
                        ) {
                            Text(
                                text = "Dr. $cleanName",
                                fontSize = 21.sp,
                                fontWeight = FontWeight.ExtraBold,
                                color = Color(0xFF0F172A),
                                textAlign = TextAlign.Center
                            )
                            Spacer(Modifier.width(6.dp))
                            Icon(
                                Icons.Default.Verified,
                                contentDescription = "Verified Doctor",
                                tint = Color(0xFF0284C7),
                                modifier = Modifier.size(19.dp)
                            )
                        }

                        Spacer(Modifier.height(6.dp))

                        FlowRow(
                            horizontalArrangement = Arrangement.spacedBy(6.dp, Alignment.CenterHorizontally),
                            verticalArrangement = Arrangement.spacedBy(6.dp)
                        ) {
                            specs.forEach { spec ->
                                Surface(
                                    shape = RoundedCornerShape(12.dp),
                                    color = Color(0xFFE0F2FE)
                                ) {
                                    Text(
                                        text = spec,
                                        fontSize = 11.5.sp,
                                        fontWeight = FontWeight.Bold,
                                        color = Color(0xFF0284C7),
                                        modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp)
                                    )
                                }
                            }
                        }

                        if (!currentDoc.nmcLicenseNumber.isNullOrBlank()) {
                            Spacer(Modifier.height(10.dp))
                            Surface(
                                shape = RoundedCornerShape(20.dp),
                                color = Color(0xFFF1F5F9),
                                border = BorderStroke(1.dp, Color(0xFFE2E8F0))
                            ) {
                                Text(
                                    text = "NMC License #${currentDoc.nmcLicenseNumber}",
                                    fontSize = 11.5.sp,
                                    fontWeight = FontWeight.SemiBold,
                                    color = Color(0xFF475569),
                                    modifier = Modifier.padding(horizontal = 12.dp, vertical = 5.dp)
                                )
                            }
                        }
                    }
                }
            }

            // ── 2. EXPERIENCE & CLINICS STATS ROW (Consultation Fee intentionally hidden) ─
            item(key = "doc_stats") {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    Card(
                        shape = RoundedCornerShape(18.dp),
                        colors = CardDefaults.cardColors(containerColor = Color.White),
                        border = BorderStroke(1.dp, Color(0xFFE2E8F0)),
                        modifier = Modifier.weight(1f)
                    ) {
                        Column(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(14.dp),
                            horizontalAlignment = Alignment.CenterHorizontally,
                            verticalArrangement = Arrangement.spacedBy(4.dp)
                        ) {
                            Icon(
                                Icons.Default.WorkspacePremium,
                                contentDescription = null,
                                tint = Color(0xFF0284C7),
                                modifier = Modifier.size(22.dp)
                            )
                            Text(
                                text = expYearsText,
                                fontSize = 16.sp,
                                fontWeight = FontWeight.ExtraBold,
                                color = Color(0xFF0284C7)
                            )
                            Text(
                                text = "Clinical Experience",
                                fontSize = 11.sp,
                                color = Color(0xFF64748B),
                                fontWeight = FontWeight.Medium
                            )
                        }
                    }

                    Card(
                        shape = RoundedCornerShape(18.dp),
                        colors = CardDefaults.cardColors(containerColor = Color.White),
                        border = BorderStroke(1.dp, Color(0xFFE2E8F0)),
                        modifier = Modifier.weight(1f)
                    ) {
                        Column(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(14.dp),
                            horizontalAlignment = Alignment.CenterHorizontally,
                            verticalArrangement = Arrangement.spacedBy(4.dp)
                        ) {
                            Icon(
                                Icons.Default.LocalHospital,
                                contentDescription = null,
                                tint = Color(0xFF15803D),
                                modifier = Modifier.size(22.dp)
                            )
                            Text(
                                text = "${practicingClinics.size} ${if (practicingClinics.size == 1) "Clinic" else "Clinics"}",
                                fontSize = 16.sp,
                                fontWeight = FontWeight.ExtraBold,
                                color = Color(0xFF15803D)
                            )
                            Text(
                                text = "Practicing Locations",
                                fontSize = 11.sp,
                                color = Color(0xFF64748B),
                                fontWeight = FontWeight.Medium
                            )
                        }
                    }
                }
            }

            // ── 3. EDUCATION & QUALIFICATIONS ─────────────────────────────────────────
            if (!currentDoc.education.isNullOrBlank()) {
                item(key = "doc_education") {
                    Card(
                        shape = RoundedCornerShape(18.dp),
                        colors = CardDefaults.cardColors(containerColor = Color.White),
                        border = BorderStroke(1.dp, Color(0xFFE2E8F0)),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Column(
                            modifier = Modifier.padding(16.dp),
                            verticalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(8.dp)
                            ) {
                                Icon(
                                    Icons.Default.School,
                                    contentDescription = null,
                                    tint = Color(0xFF0284C7),
                                    modifier = Modifier.size(18.dp)
                                )
                                Text(
                                    text = "Education & Qualifications",
                                    fontSize = 14.sp,
                                    fontWeight = FontWeight.ExtraBold,
                                    color = Color(0xFF0F172A)
                                )
                            }
                            Text(
                                text = currentDoc.education.orEmpty(),
                                fontSize = 13.sp,
                                color = Color(0xFF334155),
                                lineHeight = 19.sp
                            )
                        }
                    }
                }
            }

            // ── 4. ABOUT DOCTOR / BIO & DESCRIPTION ───────────────────────────────────
            item(key = "doc_about") {
                val bioText = currentDoc.bio?.trim().takeIf { !it.isNullOrBlank() }
                    ?: "Dr. $cleanName provides dedicated outpatient consultations in ${specs.joinToString(", ")} with patient-centered diagnosis and care."
                Card(
                    shape = RoundedCornerShape(18.dp),
                    colors = CardDefaults.cardColors(containerColor = Color.White),
                    border = BorderStroke(1.dp, Color(0xFFE2E8F0)),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Column(
                        modifier = Modifier.padding(16.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            Icon(
                                Icons.Default.MedicalInformation,
                                contentDescription = null,
                                tint = Color(0xFF0284C7),
                                modifier = Modifier.size(18.dp)
                            )
                            Text(
                                text = "About Doctor",
                                fontSize = 14.sp,
                                fontWeight = FontWeight.ExtraBold,
                                color = Color(0xFF0F172A)
                            )
                        }
                        Text(
                            text = bioText,
                            fontSize = 13.sp,
                            color = Color(0xFF475569),
                            lineHeight = 20.sp
                        )
                    }
                }
            }

            // ── 5. CHOOSE CLINIC FOR FURTHER APPOINTMENT ──────────────────────────────
            item(key = "doc_clinics_header") {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(top = 4.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Text(
                        text = "Choose Clinic for Appointment",
                        fontSize = 15.sp,
                        fontWeight = FontWeight.ExtraBold,
                        color = Color(0xFF0F172A)
                    )
                    Text(
                        text = targetDateStr,
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Bold,
                        color = Color(0xFF0284C7)
                    )
                }
            }

            if (isLoadingClinics) {
                item(key = "doc_clinics_loading") {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(20.dp),
                        contentAlignment = Alignment.Center
                    ) {
                        CircularProgressIndicator(
                            modifier = Modifier.size(26.dp),
                            color = Color(0xFF0284C7),
                            strokeWidth = 2.5.dp
                        )
                    }
                }
            } else if (practicingClinics.isEmpty()) {
                item(key = "doc_clinics_empty") {
                    Card(
                        shape = RoundedCornerShape(18.dp),
                        colors = CardDefaults.cardColors(containerColor = Color.White),
                        border = BorderStroke(1.dp, Color(0xFFE2E8F0)),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Column(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(20.dp),
                            horizontalAlignment = Alignment.CenterHorizontally,
                            verticalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            Icon(
                                Icons.Default.DomainDisabled,
                                contentDescription = null,
                                tint = Color(0xFF94A3B8),
                                modifier = Modifier.size(34.dp)
                            )
                            Text(
                                text = "Not Affiliated",
                                fontWeight = FontWeight.Bold,
                                fontSize = 14.sp,
                                color = Color(0xFF0F172A)
                            )
                            Text(
                                text = "Dr. $cleanName is currently not affiliated with any active clinic for online booking.",
                                fontSize = 12.sp,
                                color = Color(0xFF64748B),
                                textAlign = TextAlign.Center
                            )
                        }
                    }
                }
            } else {
                items(practicingClinics, key = { "prof_clinic_${it.id}" }) { clinic ->
                    val availInfo = clinicAvailabilityLabels[clinic.id]
                    val isTodayAvail = availInfo?.first == true
                    val availLabel = availInfo?.second ?: "Available for Booking"

                    Card(
                        shape = RoundedCornerShape(18.dp),
                        colors = CardDefaults.cardColors(containerColor = Color.White),
                        border = BorderStroke(1.dp, Color(0xFFE2E8F0)),
                        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable { navigateToBooking(clinic, currentDoc) }
                    ) {
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(14.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(12.dp)
                        ) {
                            Surface(
                                shape = RoundedCornerShape(12.dp),
                                color = Color(0xFFE0F2FE),
                                border = BorderStroke(1.dp, Color(0xFFBAE6FD)),
                                modifier = Modifier.size(48.dp)
                            ) {
                                val logoUrl = clinic.resolvedLogoUrl
                                if (!logoUrl.isNullOrBlank()) {
                                    AsyncImage(
                                        model = logoUrl,
                                        contentDescription = clinic.name,
                                        contentScale = ContentScale.Crop,
                                        modifier = Modifier.fillMaxSize()
                                    )
                                } else {
                                    Box(contentAlignment = Alignment.Center) {
                                        Icon(
                                            Icons.Default.LocalHospital,
                                            contentDescription = null,
                                            tint = Color(0xFF0284C7),
                                            modifier = Modifier.size(24.dp)
                                        )
                                    }
                                }
                            }

                            Column(
                                modifier = Modifier.weight(1f),
                                verticalArrangement = Arrangement.spacedBy(3.dp)
                            ) {
                                Text(
                                    text = clinic.name,
                                    fontSize = 14.5.sp,
                                    fontWeight = FontWeight.ExtraBold,
                                    color = Color(0xFF0F172A),
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis
                                )
                                Text(
                                    text = clinic.addressText?.ifBlank { null } ?: "Nepal",
                                    fontSize = 12.sp,
                                    color = Color(0xFF64748B),
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis
                                )
                                Row(
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(5.dp)
                                ) {
                                    Box(
                                        modifier = Modifier
                                            .size(6.dp)
                                            .background(
                                                if (isTodayAvail) Color(0xFF16A34A) else Color(0xFF0284C7),
                                                CircleShape
                                            )
                                    )
                                    Text(
                                        text = availLabel,
                                        fontSize = 11.5.sp,
                                        fontWeight = FontWeight.Bold,
                                        color = if (isTodayAvail) Color(0xFF15803D) else Color(0xFF0284C7)
                                    )
                                }
                            }

                            Button(
                                onClick = { navigateToBooking(clinic, currentDoc) },
                                shape = RoundedCornerShape(12.dp),
                                colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF0284C7)),
                                contentPadding = PaddingValues(horizontal = 12.dp, vertical = 8.dp),
                                modifier = Modifier.height(38.dp)
                            ) {
                                Text("Book Here", fontSize = 12.sp, fontWeight = FontWeight.Bold)
                                Spacer(Modifier.width(4.dp))
                                Icon(
                                    Icons.AutoMirrored.Filled.ArrowForward,
                                    contentDescription = null,
                                    modifier = Modifier.size(14.dp)
                                )
                            }
                        }
                    }
                }
            }

            item(key = "doc_profile_bottom_spacer") {
                Spacer(Modifier.height(16.dp))
            }
        }
    }
}
