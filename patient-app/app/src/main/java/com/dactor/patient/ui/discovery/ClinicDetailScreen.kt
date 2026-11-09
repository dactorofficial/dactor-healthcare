package com.dactor.patient.ui.discovery

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.widget.Toast
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
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
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.navigation.NavController
import coil.compose.AsyncImage
import com.dactor.patient.data.model.ClinicService
import com.dactor.patient.data.model.Doctor
import com.dactor.patient.domain.util.CurrencyFormatter
import com.dactor.patient.ui.navigation.NavRoutes
import kotlinx.coroutines.delay

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ClinicDetailScreen(
    navController: NavController,
    clinicId: String? = null,
    clinicRepository: com.dactor.patient.data.repository.ClinicRepository? = null,
    doctorRepository: com.dactor.patient.data.repository.DoctorRepository? = null,
    slotRepository: com.dactor.patient.data.repository.SlotRepository? = null,
    sessionManager: com.dactor.patient.data.local.UserSessionManager? = null
) {
    val context = LocalContext.current
    var clinic by remember { mutableStateOf<com.dactor.patient.data.model.Clinic?>(null) }
    var services by remember { mutableStateOf<List<ClinicService>>(emptyList()) }
    var doctors by remember { mutableStateOf<List<Doctor>>(emptyList()) }
    var hasAvailableSlotsToday by remember { mutableStateOf(false) }
    var publishedTodaySlots by remember { mutableStateOf<List<com.dactor.patient.data.model.Slot>>(emptyList()) }
    var nextAvailableDate by remember { mutableStateOf<String?>(null) }
    var isLoading by remember { mutableStateOf(true) }
    var isFavorite by remember { mutableStateOf(false) }

    // Auto-advancing looping photo carousel index
    var selectedPhotoIndex by remember { mutableIntStateOf(0) }
    var selectedTab by remember { mutableIntStateOf(0) } // 0: Overview, 1: Timings, 2: Services

    LaunchedEffect(clinicId) {
        if (!clinicId.isNullOrBlank() && clinicRepository != null) {
            val c = clinicRepository.getClinicById(clinicId)
            clinic = c
            services = clinicRepository.getClinicServices(clinicId)
            doctors = doctorRepository?.getDoctors(clinicId) ?: emptyList()
            if (slotRepository != null) {
                val todayStr = java.time.LocalDate.now().toString()
                val todaySlots = slotRepository.getAvailableSlots(clinicId, todayStr)
                publishedTodaySlots = todaySlots
                val isTodayAvail = todaySlots.any {
                    it.isPublished && (it.maxCapacity - it.bookedCount) > 0 &&
                        !com.dactor.patient.data.repository.SlotRepository.isSlotEndTimeOver(it.endTime, todayStr, it.startTime)
                }
                hasAvailableSlotsToday = isTodayAvail
                nextAvailableDate = if (isTodayAvail) {
                    todayStr
                } else {
                    slotRepository.getNextAvailableDate(clinicId, todayStr)
                }
            }
        }
        isLoading = false
    }

    val clinicName = clinic?.name ?: "Clinic Profile"
    val address = clinic?.addressText?.ifBlank { null } ?: "Address not listed"
    val phone = clinic?.contactPhone?.trim().orEmpty()
    val email = clinic?.contactEmail?.trim().orEmpty()
    val panNumber = clinic?.panNumber?.trim().orEmpty()
    val isLabFacility = remember(clinic) {
        clinic?.type.equals("diagnostic_lab", ignoreCase = true) ||
        clinic?.type?.contains("lab", ignoreCase = true) == true ||
        clinic?.name?.contains("lab", ignoreCase = true) == true ||
        clinic?.specialties?.any { it.contains("lab", ignoreCase = true) || it.contains("patholog", ignoreCase = true) } == true
    }

    val displayOfferings = remember(clinic, services, isLabFacility) {
        if (isLabFacility) {
            if (services.isNotEmpty()) {
                services.map { it.serviceName }
            } else {
                val labSpecs = clinic?.specialties?.filter { s ->
                    val l = s.lowercase()
                    l.contains("test") || l.contains("scan") || l.contains("lab") ||
                    l.contains("mri") || l.contains("ct") || l.contains("x-ray") ||
                    l.contains("blood") || l.contains("patholog") || l.contains("urine") ||
                    l.contains("profile") || l.contains("ecg") || l.contains("echo")
                } ?: emptyList()
                if (labSpecs.isNotEmpty()) labSpecs
                else listOf("Blood Tests & CBC", "Pathology", "Digital X-Ray", "Urine Routine")
            }
        } else {
            if (clinic?.specialties.isNullOrEmpty()) listOf("General Medicine") else clinic!!.specialties
        }
    }

    val description = clinic?.description?.trim().orEmpty().ifBlank {
        if (isLabFacility) "$clinicName is a certified diagnostic pathology laboratory offering comprehensive sample collection, diagnostic processing, and digital report distribution."
        else "$clinicName provides outpatient consultations, diagnostic care, and queue-managed appointments."
    }
    val pictures = clinic?.pictures ?: emptyList()
    val primaryDoctor = doctors.firstOrNull()
    val todaySchedule = remember(clinic) {
        clinic?.getTodaySchedule() ?: com.dactor.patient.data.model.DayScheduleInfo(
            dayOfWeek = "TODAY",
            displayName = "Today",
            isOpen = true,
            openTime = "09:00 AM",
            closeTime = "05:00 PM",
            hasBreak = true,
            breakStart = "01:00 PM",
            breakEnd = "02:00 PM"
        )
    }
    val weeklySchedule = remember(clinic) {
        clinic?.getWeeklySchedule() ?: com.dactor.patient.data.model.ClinicScheduleHelper.defaultDays
    }

    // ── Auto-slide image carousel loop ───────────────────────────────────────
    LaunchedEffect(pictures.size) {
        if (pictures.size > 1) {
            while (true) {
                delay(3500) // Slide automatically every 3.5 seconds
                selectedPhotoIndex = (selectedPhotoIndex + 1) % pictures.size
            }
        }
    }

    fun dialNumber(number: String) {
        if (number.isNotBlank()) {
            try {
                val intent = Intent(Intent.ACTION_DIAL, Uri.parse("tel:$number"))
                context.startActivity(intent)
            } catch (e: Exception) {
                Toast.makeText(context, "Cannot open dialer: $number", Toast.LENGTH_SHORT).show()
            }
        }
    }

    fun sendEmail(targetEmail: String) {
        if (targetEmail.isNotBlank()) {
            try {
                val intent = Intent(Intent.ACTION_SENDTO, Uri.parse("mailto:$targetEmail"))
                context.startActivity(intent)
            } catch (e: Exception) {
                Toast.makeText(context, "Cannot open email client: $targetEmail", Toast.LENGTH_SHORT).show()
            }
        }
    }

    fun openMaps(addr: String) {
        try {
            val intent = Intent(Intent.ACTION_VIEW, Uri.parse("geo:0,0?q=${Uri.encode(addr)}"))
            context.startActivity(intent)
        } catch (ignored: Exception) {}
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Clinic Profile", fontWeight = FontWeight.Bold, fontSize = 18.sp) },
                navigationIcon = {
                    IconButton(onClick = { navController.popBackStack() }) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
                actions = {
                    IconButton(onClick = { isFavorite = !isFavorite }) {
                        Icon(
                            if (isFavorite) Icons.Default.Favorite else Icons.Default.FavoriteBorder,
                            contentDescription = "Favorite",
                            tint = if (isFavorite) Color(0xFFEF4444) else MaterialTheme.colorScheme.onSurface
                        )
                    }
                    IconButton(onClick = {
                        val shareIntent = Intent(Intent.ACTION_SEND).apply {
                            type = "text/plain"
                            putExtra(Intent.EXTRA_TEXT, "Check out $clinicName on Dactor Nepal: $address. Book online instantly!")
                        }
                        context.startActivity(Intent.createChooser(shareIntent, "Share Clinic"))
                    }) {
                        Icon(Icons.Default.Share, contentDescription = "Share")
                    }
                }
            )
        },
        bottomBar = {
            Surface(
                tonalElevation = 8.dp,
                shadowElevation = 8.dp,
                color = Color.White,
                modifier = Modifier.fillMaxWidth()
            ) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp, vertical = 10.dp),
                    verticalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    // Availability indicator just above Book button
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(6.dp)
                    ) {
                        Box(
                            modifier = Modifier
                                .size(7.dp)
                                .background(
                                    if (hasAvailableSlotsToday) Color(0xFF10B981) else Color(0xFFF59E0B),
                                    CircleShape
                                )
                        )
                        Text(
                            text = if (hasAvailableSlotsToday) {
                                if (isLabFacility) "Sample Collection Open Today" else "Available today"
                            } else {
                                com.dactor.patient.data.repository.SlotRepository.formatNextAvailableDate(nextAvailableDate)
                            },
                            fontSize = 12.sp,
                            fontWeight = FontWeight.SemiBold,
                            color = if (hasAvailableSlotsToday) Color(0xFF15803D) else Color(0xFFB45309)
                        )
                    }

                    Button(
                        onClick = {
                            val targetId = clinicId ?: clinic?.id ?: ""
                            val isDemo = sessionManager?.isGuestMode() == true || sessionManager?.isLoggedIn() != true
                            val targetRoute = NavRoutes.Booking.createRoute(targetId)
                            if (isDemo) {
                                sessionManager?.savePendingBookingRedirect(
                                    route = targetRoute,
                                    clinicId = targetId,
                                    doctorId = null,
                                    selectedDate = ""
                                )
                                Toast.makeText(context, "Please sign in with Google to book an appointment", Toast.LENGTH_SHORT).show()
                                navController.navigate(NavRoutes.Login.route)
                            } else {
                                navController.navigate(targetRoute)
                            }
                        },
                        shape = RoundedCornerShape(14.dp),
                        colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF00796B)),
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(52.dp)
                    ) {
                        Icon(Icons.Default.CalendarMonth, contentDescription = null, modifier = Modifier.size(18.dp))
                        Spacer(Modifier.width(8.dp))
                        val isLabFacility = clinic?.type.equals("diagnostic_lab", ignoreCase = true) ||
                            clinic?.type?.contains("lab", ignoreCase = true) == true ||
                            clinic?.name?.contains("lab", ignoreCase = true) == true
                        Text(if (isLabFacility) "Book Lab Test" else "Book Appointment", fontWeight = FontWeight.Bold, fontSize = 15.sp)
                        Spacer(Modifier.width(6.dp))
                        Icon(Icons.Default.ArrowForward, contentDescription = null, modifier = Modifier.size(18.dp))
                    }
                }
            }
        }
    ) { padding ->
        if (isLoading) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(padding),
                contentAlignment = Alignment.Center
            ) {
                CircularProgressIndicator(color = Color(0xFF00796B))
            }
        } else {
            LazyColumn(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(padding)
                    .background(Color(0xFFF8FAFC)),
                contentPadding = PaddingValues(bottom = 24.dp)
            ) {
                // ── 1. HERO IMAGE CAROUSEL (ONLY IF PHOTOS EXIST) OR WORKING & BREAK HOURS BANNER ──
                item {
                    val activeUrl = pictures.getOrNull(selectedPhotoIndex) ?: clinic?.logoUrl
                    if (!activeUrl.isNullOrBlank()) {
                        Box(
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(190.dp)
                                .background(Color(0xFFE2E8F0))
                        ) {
                            AsyncImage(
                                model = activeUrl,
                                contentDescription = "Clinic Photo",
                                contentScale = ContentScale.Crop,
                                modifier = Modifier.fillMaxSize()
                            )

                            // Verified Clinic Pill Badge (Top Right)
                            Surface(
                                shape = RoundedCornerShape(20.dp),
                                color = Color(0xFFDCFCE7),
                                border = BorderStroke(1.dp, Color(0xFF86EFAC)),
                                modifier = Modifier
                                    .align(Alignment.TopEnd)
                                    .padding(14.dp)
                            ) {
                                Row(
                                    modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp),
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(4.dp)
                                ) {
                                    Icon(Icons.Default.CheckCircle, contentDescription = null, tint = Color(0xFF16A34A), modifier = Modifier.size(13.dp))
                                    Text(
                                        "Verified Clinic",
                                        color = Color(0xFF15803D),
                                        fontSize = 11.sp,
                                        fontWeight = FontWeight.Bold
                                    )
                                }
                            }

                            // Sliding Progress / Dot Indicators at Bottom Left
                            if (pictures.size > 1) {
                                Row(
                                    modifier = Modifier
                                        .align(Alignment.BottomStart)
                                        .padding(14.dp),
                                    horizontalArrangement = Arrangement.spacedBy(5.dp),
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    pictures.indices.forEach { idx ->
                                        val isCur = idx == selectedPhotoIndex
                                        Box(
                                            modifier = Modifier
                                                .height(5.dp)
                                                .width(if (isCur) 18.dp else 6.dp)
                                                .clip(CircleShape)
                                                .background(if (isCur) Color.White else Color.White.copy(alpha = 0.5f))
                                                .clickable { selectedPhotoIndex = idx }
                                        )
                                    }
                                }
                            }
                        }
                    }
                }

                // ── 2. CLINIC HEADER INFO (Name, Location, Call Card) ────────────
                item {
                    Surface(
                        color = Color.White,
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Column(
                            modifier = Modifier.padding(18.dp),
                            verticalArrangement = Arrangement.spacedBy(14.dp)
                        ) {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.Top
                            ) {
                                Row(
                                    modifier = Modifier.weight(1f),
                                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                                    verticalAlignment = Alignment.Top
                                ) {
                                    // Clinic Icon Square / Photo
                                    val cLogo = clinic?.resolvedLogoUrl ?: clinic?.resolvedCoverPictureUrl ?: clinic?.pictures?.firstOrNull()
                                    Surface(
                                        shape = RoundedCornerShape(14.dp),
                                        color = Color(0xFFE6F4F1),
                                        border = BorderStroke(1.dp, Color(0xFF00796B).copy(alpha = 0.2f)),
                                        modifier = Modifier.size(54.dp)
                                    ) {
                                        if (!cLogo.isNullOrBlank()) {
                                            coil.compose.AsyncImage(
                                                model = cLogo,
                                                contentDescription = clinicName,
                                                contentScale = androidx.compose.ui.layout.ContentScale.Crop,
                                                modifier = Modifier.fillMaxSize()
                                            )
                                        } else {
                                            Box(contentAlignment = Alignment.Center) {
                                                Icon(
                                                    Icons.Default.LocalHospital,
                                                    contentDescription = null,
                                                    tint = Color(0xFF00796B),
                                                    modifier = Modifier.size(30.dp)
                                                )
                                            }
                                        }
                                    }

                                    Column(
                                        modifier = Modifier.weight(1f).padding(end = 8.dp),
                                        verticalArrangement = Arrangement.spacedBy(3.dp)
                                    ) {
                                        Text(
                                            text = clinicName,
                                            fontWeight = FontWeight.Bold,
                                            fontSize = 19.sp,
                                            color = Color(0xFF0F172A)
                                        )
                                        Row(
                                            verticalAlignment = Alignment.CenterVertically,
                                            horizontalArrangement = Arrangement.spacedBy(4.dp)
                                        ) {
                                            Icon(Icons.Default.LocationOn, contentDescription = null, tint = Color(0xFF00796B), modifier = Modifier.size(15.dp))
                                            Text(
                                                text = address,
                                                fontSize = 12.sp,
                                                color = Color(0xFF64748B),
                                                maxLines = 2,
                                                overflow = TextOverflow.Ellipsis
                                            )
                                        }
                                    }
                                }

                                // Call Button Card on right
                                Surface(
                                    shape = RoundedCornerShape(12.dp),
                                    color = Color(0xFFE6F4F1),
                                    border = BorderStroke(1.dp, Color(0xFF00796B).copy(alpha = 0.3f)),
                                    modifier = Modifier.clickable { dialNumber(phone) }
                                ) {
                                    Row(
                                        modifier = Modifier.padding(horizontal = 10.dp, vertical = 8.dp),
                                        verticalAlignment = Alignment.CenterVertically,
                                        horizontalArrangement = Arrangement.spacedBy(6.dp)
                                    ) {
                                        Icon(Icons.Default.Phone, contentDescription = null, tint = Color(0xFF00796B), modifier = Modifier.size(16.dp))
                                        Column {
                                            Text("Call", fontSize = 11.sp, fontWeight = FontWeight.Bold, color = Color(0xFF00796B))
                                            Text(phone.take(13), fontSize = 10.sp, color = Color(0xFF00796B))
                                        }
                                    }
                                }
                            }

                            // Full-width wrapping specialties/tests tags (Prevents vertical text squishing)
                            @OptIn(ExperimentalLayoutApi::class)
                            FlowRow(
                                horizontalArrangement = Arrangement.spacedBy(8.dp),
                                verticalArrangement = Arrangement.spacedBy(6.dp),
                                modifier = Modifier.fillMaxWidth().padding(top = 2.dp)
                            ) {
                                if (isLabFacility) {
                                    Surface(
                                        shape = RoundedCornerShape(12.dp),
                                        color = Color(0xFFF3E8FF),
                                        border = BorderStroke(1.dp, Color(0xFFD8B4FE))
                                    ) {
                                        Row(
                                            modifier = Modifier.padding(horizontal = 8.dp, vertical = 5.dp),
                                            verticalAlignment = Alignment.CenterVertically,
                                            horizontalArrangement = Arrangement.spacedBy(4.dp)
                                        ) {
                                            Icon(
                                                Icons.Default.Science,
                                                contentDescription = "Diagnostic Lab",
                                                tint = Color(0xFF7E22CE),
                                                modifier = Modifier.size(13.dp)
                                            )
                                            Text(
                                                text = "Lab Tests",
                                                fontSize = 11.5.sp,
                                                fontWeight = FontWeight.Bold,
                                                color = Color(0xFF7E22CE)
                                            )
                                        }
                                    }
                                }

                                displayOfferings.forEach { spec ->
                                    Surface(
                                        shape = RoundedCornerShape(12.dp),
                                        color = if (isLabFacility) Color(0xFFFAF5FF) else Color(0xFFE6F4F1),
                                        border = if (isLabFacility) BorderStroke(1.dp, Color(0xFFE9D5FF)) else null
                                    ) {
                                        Text(
                                            text = spec,
                                            fontSize = 11.5.sp,
                                            fontWeight = FontWeight.Medium,
                                            color = if (isLabFacility) Color(0xFF6B21A8) else Color(0xFF00796B),
                                            modifier = Modifier.padding(horizontal = 10.dp, vertical = 5.dp),
                                            maxLines = 1,
                                            softWrap = false
                                        )
                                    }
                                }
                            }

                            HorizontalDivider(color = Color(0xFFF1F5F9))

                            // ── 3. WORKING HOURS & BREAK HOURS CARD (Replaces empty space & demo stats) ──
                            Surface(
                                shape = RoundedCornerShape(14.dp),
                                color = Color(0xFFF0FDF4),
                                border = BorderStroke(1.dp, Color(0xFFBBF7D0)),
                                modifier = Modifier.fillMaxWidth()
                            ) {
                                Column(
                                    modifier = Modifier.padding(12.dp),
                                    verticalArrangement = Arrangement.spacedBy(8.dp)
                                ) {
                                    Row(
                                        modifier = Modifier.fillMaxWidth(),
                                        horizontalArrangement = Arrangement.SpaceBetween,
                                        verticalAlignment = Alignment.CenterVertically
                                    ) {
                                        Row(
                                            verticalAlignment = Alignment.CenterVertically,
                                            horizontalArrangement = Arrangement.spacedBy(8.dp)
                                        ) {
                                            Icon(
                                                Icons.Default.Schedule,
                                                contentDescription = null,
                                                tint = Color(0xFF00796B),
                                                modifier = Modifier.size(18.dp)
                                            )
                                            Column {
                                                Text(
                                                    "Working Hours (${todaySchedule.displayName})",
                                                    fontSize = 11.sp,
                                                    color = Color(0xFF475569),
                                                    fontWeight = FontWeight.Medium
                                                )
                                                Text(
                                                    if (todaySchedule.isOpen) "${todaySchedule.openTime} \u2013 ${todaySchedule.closeTime}" else "Closed Today",
                                                    fontSize = 13.sp,
                                                    fontWeight = FontWeight.ExtraBold,
                                                    color = if (todaySchedule.isOpen) Color(0xFF0F172A) else Color(0xFFDC2626)
                                                )
                                            }
                                        }

                                        Surface(
                                            shape = RoundedCornerShape(8.dp),
                                            color = if (todaySchedule.isOpen) Color(0xFFDCFCE7) else Color(0xFFFEE2E2)
                                        ) {
                                            Text(
                                                text = if (todaySchedule.isOpen) "OPEN TODAY" else "CLOSED",
                                                fontSize = 10.sp,
                                                fontWeight = FontWeight.ExtraBold,
                                                color = if (todaySchedule.isOpen) Color(0xFF15803D) else Color(0xFFB91C1C),
                                                modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
                                            )
                                        }
                                    }

                                    if (!isLabFacility) {
                                        HorizontalDivider(color = Color(0xFFDCFCE7))

                                        Row(
                                            modifier = Modifier.fillMaxWidth(),
                                            horizontalArrangement = Arrangement.SpaceBetween,
                                            verticalAlignment = Alignment.CenterVertically
                                        ) {
                                            Row(
                                                verticalAlignment = Alignment.CenterVertically,
                                                horizontalArrangement = Arrangement.spacedBy(6.dp)
                                            ) {
                                                Icon(
                                                    Icons.Default.MedicalServices,
                                                    contentDescription = null,
                                                    tint = Color(0xFF00796B),
                                                    modifier = Modifier.size(16.dp)
                                                )
                                                Text(
                                                    "Outpatient OPD & Consultation",
                                                    fontSize = 11.5.sp,
                                                    color = Color(0xFF475569),
                                                    fontWeight = FontWeight.Medium
                                                )
                                            }

                                            Row(
                                                verticalAlignment = Alignment.CenterVertically,
                                                horizontalArrangement = Arrangement.spacedBy(6.dp)
                                            ) {
                                                Icon(
                                                    Icons.Default.People,
                                                    contentDescription = null,
                                                    tint = Color(0xFF00796B),
                                                    modifier = Modifier.size(16.dp)
                                                )
                                                Text(
                                                    "${doctors.size.coerceAtLeast(1)} Doctor(s)",
                                                    fontSize = 11.sp,
                                                    fontWeight = FontWeight.Bold,
                                                    color = Color(0xFF0F172A)
                                                )
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }

                // ── 4. CONSULTING DOCTOR CARD ────────────────────────────────────
                item {
                    val isLabFacility = clinic?.type.equals("diagnostic_lab", ignoreCase = true) ||
                        clinic?.type?.contains("lab", ignoreCase = true) == true ||
                        clinic?.name?.contains("lab", ignoreCase = true) == true
                    val docToDisplay = primaryDoctor
                    if (!isLabFacility && docToDisplay != null) {
                        Card(
                            shape = RoundedCornerShape(16.dp),
                            colors = CardDefaults.cardColors(containerColor = Color.White),
                            border = BorderStroke(1.dp, Color(0xFFE2E8F0)),
                            elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(horizontal = 16.dp, vertical = 8.dp)
                                .clickable {
                                    val targetId = clinicId ?: clinic?.id ?: ""
                                    navController.navigate("booking/$targetId?doctorId=${docToDisplay.id}")
                                }
                        ) {
                            Row(
                                modifier = Modifier
                                    .padding(14.dp)
                                    .fillMaxWidth(),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(12.dp)
                            ) {
                                // Doctor Avatar
                                if (!docToDisplay.resolvedProfilePictureUrl.isNullOrBlank()) {
                                    AsyncImage(
                                        model = docToDisplay.resolvedProfilePictureUrl,
                                        contentDescription = docToDisplay.fullName,
                                        contentScale = ContentScale.Crop,
                                        modifier = Modifier
                                            .size(54.dp)
                                            .clip(CircleShape)
                                    )
                                } else {
                                    Surface(
                                        shape = CircleShape,
                                        color = Color(0xFFE6F4F1),
                                        modifier = Modifier.size(54.dp)
                                    ) {
                                        Box(contentAlignment = Alignment.Center) {
                                            Icon(Icons.Default.Person, contentDescription = null, tint = Color(0xFF00796B), modifier = Modifier.size(28.dp))
                                        }
                                    }
                                }

                                Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                                    Text("Consulting Doctor", fontSize = 10.sp, color = Color(0xFF64748B), fontWeight = FontWeight.Medium)
                                    val cleanDocName = docToDisplay.fullName.replace(Regex("^(?i)dr\\.?\\s*"), "").trim()
                                        .split(" ").filter { it.isNotBlank() }
                                        .joinToString(" ") { it.replaceFirstChar { c -> c.uppercase() } }
                                    Text(
                                        "Dr. $cleanDocName",
                                        fontWeight = FontWeight.Bold,
                                        fontSize = 15.sp,
                                        color = Color(0xFF0F172A)
                                    )
                                    if (!docToDisplay.education.isNullOrBlank()) {
                                        Text(
                                            docToDisplay.education,
                                            fontSize = 11.sp,
                                            color = Color(0xFF64748B)
                                        )
                                    }
                                    val docSpecs = remember(docToDisplay) {
                                        (listOfNotNull(docToDisplay.specialty?.takeIf { it.isNotBlank() }) + docToDisplay.specialties)
                                            .distinct()
                                            .ifEmpty { listOf("Medical Specialist") }
                                    }
                                    Text(
                                        docSpecs.joinToString(", "),
                                        fontSize = 11.sp,
                                        fontWeight = FontWeight.Medium,
                                        color = Color(0xFF00796B)
                                    )
                                    val hasDocSlotToday = remember(publishedTodaySlots, docToDisplay) {
                                        val today = java.time.LocalDate.now().toString()
                                        publishedTodaySlots.any {
                                            it.isPublished &&
                                                (it.doctorId == docToDisplay.id || it.doctorId.isNullOrBlank()) &&
                                                (it.maxCapacity - it.bookedCount) > 0 &&
                                                !com.dactor.patient.data.repository.SlotRepository.isSlotEndTimeOver(it.endTime, today, it.startTime)
                                        }
                                    }
                                    Surface(
                                        shape = RoundedCornerShape(6.dp),
                                        color = if (hasDocSlotToday) Color(0xFFDCFCE7) else Color(0xFFF1F5F9),
                                        modifier = Modifier.padding(top = 2.dp)
                                    ) {
                                        Text(
                                            if (hasDocSlotToday) "Available Today" else "Schedule on Request",
                                            fontSize = 10.sp,
                                            fontWeight = FontWeight.Bold,
                                            color = if (hasDocSlotToday) Color(0xFF15803D) else Color(0xFF64748B),
                                            modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
                                        )
                                    }
                                }

                                Icon(
                                    Icons.Default.ChevronRight,
                                    contentDescription = "View Doctor",
                                    tint = Color(0xFF00796B),
                                    modifier = Modifier.size(24.dp)
                                )
                            }
                        }
                    }
                }

                // ── 5. TAB SELECTOR (Overview, Timings, Services) ────────────────
                item {
                    Surface(
                        color = Color.White,
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(top = 8.dp)
                    ) {
                        TabRow(
                            selectedTabIndex = selectedTab,
                            containerColor = Color.White,
                            contentColor = Color(0xFF00796B),
                            divider = { HorizontalDivider(color = Color(0xFFE2E8F0)) }
                        ) {
                            listOf("Overview", "Timings", if (isLabFacility) "Lab Tests" else "Services").forEachIndexed { index, title ->
                                Tab(
                                    selected = selectedTab == index,
                                    onClick = { selectedTab = index },
                                    text = {
                                        Text(
                                            title,
                                            fontWeight = if (selectedTab == index) FontWeight.Bold else FontWeight.Medium,
                                            fontSize = 13.sp
                                        )
                                    }
                                )
                            }
                        }
                    }
                }

                // ── 6. TAB CONTENT ───────────────────────────────────────────────
                item {
                    Surface(
                        color = Color.White,
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(bottom = 8.dp)
                    ) {
                        Column(
                            modifier = Modifier.padding(16.dp),
                            verticalArrangement = Arrangement.spacedBy(16.dp)
                        ) {
                            when (selectedTab) {
                                0 -> {
                                    // Overview Description
                                    Text(
                                        text = description,
                                        fontSize = 13.sp,
                                        color = Color(0xFF475569),
                                        lineHeight = 19.sp
                                    )

                                    // 4 Highlight Icons Grid
                                    Row(
                                        modifier = Modifier.fillMaxWidth(),
                                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                                    ) {
                                        // Modern Facilities
                                        Surface(
                                            shape = RoundedCornerShape(12.dp),
                                            color = Color(0xFFF8FAFC),
                                            border = BorderStroke(1.dp, Color(0xFFE2E8F0)),
                                            modifier = Modifier.weight(1f)
                                        ) {
                                            Column(
                                                modifier = Modifier.padding(10.dp),
                                                horizontalAlignment = Alignment.CenterHorizontally,
                                                verticalArrangement = Arrangement.spacedBy(4.dp)
                                            ) {
                                                Icon(Icons.Default.Apartment, contentDescription = null, tint = Color(0xFF00796B), modifier = Modifier.size(20.dp))
                                                Text("Modern Facilities", fontSize = 10.sp, fontWeight = FontWeight.Bold, color = Color(0xFF0F172A), textAlign = androidx.compose.ui.text.style.TextAlign.Center)
                                            }
                                        }

                                        // Clean & Safe
                                        Surface(
                                            shape = RoundedCornerShape(12.dp),
                                            color = Color(0xFFF8FAFC),
                                            border = BorderStroke(1.dp, Color(0xFFE2E8F0)),
                                            modifier = Modifier.weight(1f)
                                        ) {
                                            Column(
                                                modifier = Modifier.padding(10.dp),
                                                horizontalAlignment = Alignment.CenterHorizontally,
                                                verticalArrangement = Arrangement.spacedBy(4.dp)
                                            ) {
                                                Icon(Icons.Default.HealthAndSafety, contentDescription = null, tint = Color(0xFF00796B), modifier = Modifier.size(20.dp))
                                                Text("Clean & Safe Environment", fontSize = 10.sp, fontWeight = FontWeight.Bold, color = Color(0xFF0F172A), textAlign = androidx.compose.ui.text.style.TextAlign.Center)
                                            }
                                        }

                                        // Experienced Team
                                        Surface(
                                            shape = RoundedCornerShape(12.dp),
                                            color = Color(0xFFF8FAFC),
                                            border = BorderStroke(1.dp, Color(0xFFE2E8F0)),
                                            modifier = Modifier.weight(1f)
                                        ) {
                                            Column(
                                                modifier = Modifier.padding(10.dp),
                                                horizontalAlignment = Alignment.CenterHorizontally,
                                                verticalArrangement = Arrangement.spacedBy(4.dp)
                                            ) {
                                                Icon(Icons.Default.Group, contentDescription = null, tint = Color(0xFF00796B), modifier = Modifier.size(20.dp))
                                                Text(if (isLabFacility) "Certified Lab Team" else "Experienced Medical Team", fontSize = 10.sp, fontWeight = FontWeight.Bold, color = Color(0xFF0F172A), textAlign = androidx.compose.ui.text.style.TextAlign.Center)
                                            }
                                        }

                                        // Affordable Fees
                                        Surface(
                                            shape = RoundedCornerShape(12.dp),
                                            color = Color(0xFFF8FAFC),
                                            border = BorderStroke(1.dp, Color(0xFFE2E8F0)),
                                            modifier = Modifier.weight(1f)
                                        ) {
                                            Column(
                                                modifier = Modifier.padding(10.dp),
                                                horizontalAlignment = Alignment.CenterHorizontally,
                                                verticalArrangement = Arrangement.spacedBy(4.dp)
                                            ) {
                                                Icon(Icons.Default.Payments, contentDescription = null, tint = Color(0xFF00796B), modifier = Modifier.size(20.dp))
                                                Text(if (isLabFacility) "Affordable Lab Tests" else "Affordable Consultation", fontSize = 10.sp, fontWeight = FontWeight.Bold, color = Color(0xFF0F172A), textAlign = androidx.compose.ui.text.style.TextAlign.Center)
                                            }
                                        }
                                    }
                                }
                                1 -> {
                                    // Weekly Working Hours & Break Hours Schedule
                                    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                        Text("Weekly Working Hours & Break Schedule:", fontWeight = FontWeight.Bold, fontSize = 13.sp, color = Color(0xFF0F172A))
                                        weeklySchedule.forEach { daySched ->
                                            Surface(
                                                shape = RoundedCornerShape(10.dp),
                                                color = Color(0xFFF8FAFC),
                                                border = BorderStroke(1.dp, Color(0xFFE2E8F0)),
                                                modifier = Modifier.fillMaxWidth()
                                            ) {
                                                Row(
                                                    modifier = Modifier
                                                        .fillMaxWidth()
                                                        .padding(horizontal = 12.dp, vertical = 8.dp),
                                                    horizontalArrangement = Arrangement.SpaceBetween,
                                                    verticalAlignment = Alignment.CenterVertically
                                                ) {
                                                    Text(daySched.displayName, fontSize = 12.sp, fontWeight = FontWeight.Bold, color = Color(0xFF334155))
                                                    Column(horizontalAlignment = Alignment.End) {
                                                        Text(
                                                            text = if (daySched.isOpen) "${daySched.openTime} \u2013 ${daySched.closeTime}" else "Closed",
                                                            fontSize = 12.sp,
                                                            fontWeight = FontWeight.SemiBold,
                                                            color = if (daySched.isOpen) Color(0xFF00796B) else Color(0xFFDC2626)
                                                        )
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                                2 -> {
                                    // Services List
                                    if (services.isEmpty()) {
                                        Text("General OPD consultations, follow-up evaluations and prescription refills available.", fontSize = 12.sp, color = Color(0xFF64748B))
                                    } else {
                                        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                            services.forEach { srv ->
                                                Row(
                                                    modifier = Modifier.fillMaxWidth(),
                                                    horizontalArrangement = Arrangement.SpaceBetween
                                                ) {
                                                    Text(srv.serviceName, fontSize = 13.sp, fontWeight = FontWeight.Medium)
                                                    Text(CurrencyFormatter.formatNPR(srv.price), fontSize = 13.sp, fontWeight = FontWeight.Bold, color = Color(0xFF00796B))
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }

                // ── 7. CONTACT INFORMATION SECTION ───────────────────────────────
                item {
                    Card(
                        shape = RoundedCornerShape(16.dp),
                        colors = CardDefaults.cardColors(containerColor = Color.White),
                        border = BorderStroke(1.dp, Color(0xFFE2E8F0)),
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 16.dp, vertical = 8.dp)
                    ) {
                        Column(
                            modifier = Modifier.padding(16.dp),
                            verticalArrangement = Arrangement.spacedBy(12.dp)
                        ) {
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(6.dp)
                            ) {
                                Icon(Icons.Default.LocationOn, contentDescription = null, tint = Color(0xFF00796B), modifier = Modifier.size(18.dp))
                                Text("Contact Information", fontWeight = FontWeight.Bold, fontSize = 14.sp)
                            }

                            // Phone
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                    Icon(Icons.Default.Phone, contentDescription = null, tint = Color(0xFF64748B), modifier = Modifier.size(16.dp))
                                    Text(phone, fontSize = 13.sp, color = Color(0xFF0F172A))
                                }
                                Text(
                                    "Call",
                                    fontSize = 12.sp,
                                    fontWeight = FontWeight.Bold,
                                    color = Color(0xFF00796B),
                                    modifier = Modifier.clickable { dialNumber(phone) }
                                )
                            }

                            HorizontalDivider(color = Color(0xFFF1F5F9))

                            // Email
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                    Icon(Icons.Default.Email, contentDescription = null, tint = Color(0xFF64748B), modifier = Modifier.size(16.dp))
                                    Text(email, fontSize = 13.sp, color = Color(0xFF0F172A))
                                }
                                Text(
                                    "Email",
                                    fontSize = 12.sp,
                                    fontWeight = FontWeight.Bold,
                                    color = Color(0xFF00796B),
                                    modifier = Modifier.clickable { sendEmail(email) }
                                )
                            }

                            HorizontalDivider(color = Color(0xFFF1F5F9))

                            // Address with non-squishing Directions pill
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Row(
                                    modifier = Modifier.weight(1f).padding(end = 10.dp),
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                                ) {
                                    Icon(Icons.Default.Place, contentDescription = null, tint = Color(0xFF64748B), modifier = Modifier.size(16.dp))
                                    Text(
                                        text = address,
                                        fontSize = 12.sp,
                                        color = Color(0xFF0F172A),
                                        maxLines = 2,
                                        overflow = TextOverflow.Ellipsis
                                    )
                                }
                                Surface(
                                    shape = RoundedCornerShape(10.dp),
                                    color = Color(0xFFE6F4F1),
                                    border = BorderStroke(1.dp, Color(0xFF00796B).copy(alpha = 0.2f)),
                                    modifier = Modifier.clickable { openMaps(address) }
                                ) {
                                    Row(
                                        modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp),
                                        verticalAlignment = Alignment.CenterVertically,
                                        horizontalArrangement = Arrangement.spacedBy(4.dp)
                                    ) {
                                        Icon(Icons.Default.Directions, contentDescription = null, tint = Color(0xFF00796B), modifier = Modifier.size(14.dp))
                                        Text(
                                            "Get Directions",
                                            fontSize = 11.5.sp,
                                            fontWeight = FontWeight.Bold,
                                            color = Color(0xFF00796B),
                                            maxLines = 1,
                                            softWrap = false
                                        )
                                    }
                                }
                            }

                            com.dactor.patient.ui.components.ClinicMapView(
                                clinicName = clinicName,
                                clinicAddress = address,
                                latitude = clinic?.latitude ?: 0.0,
                                longitude = clinic?.longitude ?: 0.0,
                                modifier = Modifier.padding(top = 6.dp)
                            )
                        }
                    }
                }
            }
        }
    }
}
