package com.dactor.patient.ui.main

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.widget.Toast
import java.util.Locale
import android.Manifest
import android.content.pm.PackageManager
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.BackHandler
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.*
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.*
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.foundation.border
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.nestedscroll.NestedScrollConnection
import androidx.compose.ui.input.nestedscroll.NestedScrollSource
import androidx.compose.ui.input.nestedscroll.nestedScroll
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.navigation.NavController
import androidx.navigation.compose.currentBackStackEntryAsState
import com.dactor.patient.data.local.UserSessionManager
import com.dactor.patient.data.model.*
import com.dactor.patient.data.repository.*
import com.dactor.patient.domain.util.CurrencyFormatter
import com.dactor.patient.ui.components.GuestAccountView
import com.dactor.patient.ui.legal.TermsAndConditionsDialog
import com.dactor.patient.ui.navigation.NavRoutes
import com.dactor.patient.util.BillPdfDownloader
import com.dactor.patient.util.DiagnosticLabPolicy
import com.dactor.patient.service.NotificationHelper
import com.dactor.patient.util.MedicalSearchEngine
import com.dactor.patient.util.OpenRouteSpatialEngine
import com.dactor.patient.util.SearchMatchResult
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.time.Instant
import java.time.LocalDate
import java.time.YearMonth
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.format.TextStyle
import java.time.temporal.ChronoUnit
import java.util.UUID

data class ClinicHomeItem(
    val clinic: Clinic,
    val doctors: List<Doctor>,
    val services: List<ClinicService>,
    val availableSlots: List<Slot> = emptyList()
)

data class DoctorHomeItem(
    val doctor: Doctor,
    val practicingClinics: List<Clinic>
)

data class HomeCategoryItem(
    val title: String,
    val subtitle: String,
    val searchTerm: String,
    val icon: androidx.compose.ui.graphics.vector.ImageVector,
    val isLab: Boolean
)

val HOME_SPECIALIST_AND_LAB_CATEGORIES = listOf(
    // Medical Specialists
    HomeCategoryItem("Dermatology", "Skin & Hair", "Dermatologist", Icons.Default.Face, false),
    HomeCategoryItem("Cardiology", "Heart Care", "Cardiologist", Icons.Default.Favorite, false),
    HomeCategoryItem("Pediatrics", "Child Health", "Pediatrician", Icons.Default.ChildCare, false),
    HomeCategoryItem("Orthopedics", "Bone & Joint", "Orthopedic", Icons.Default.Accessibility, false),
    HomeCategoryItem("Gynecology", "Women's Care", "Gynecologist", Icons.Default.Female, false),
    HomeCategoryItem("ENT Care", "Ear, Nose, Throat", "ENT Specialist", Icons.Default.Hearing, false),
    HomeCategoryItem("Eye Care", "Vision & Optics", "Ophthalmologist", Icons.Default.Visibility, false),
    HomeCategoryItem("Dental", "Teeth & Oral", "Dentist", Icons.Default.HealthAndSafety, false),
    HomeCategoryItem("Neurology", "Brain & Nerve", "Neurologist", Icons.Default.Psychology, false),
    HomeCategoryItem("General OPD", "Physician", "General Physician", Icons.Default.LocalHospital, false),
    HomeCategoryItem("Psychiatry", "Mental Health", "Psychiatrist", Icons.Default.Person, false),
    HomeCategoryItem("Gastro", "Stomach & Liver", "Gastroenterologist", Icons.Default.MedicalServices, false),
    
    // Diagnostic Labs & Scans
    HomeCategoryItem("MRI Scan", "Imaging & Scan", "MRI", Icons.Default.Biotech, true),
    HomeCategoryItem("CT Scan", "Computed Scan", "CT Scan", Icons.Default.Biotech, true),
    HomeCategoryItem("Digital X-Ray", "Radiology", "X-Ray", Icons.Default.CameraAlt, true),
    HomeCategoryItem("Ultrasound (USG)", "Sonography", "Ultrasound", Icons.Default.Sensors, true),
    HomeCategoryItem("Blood Tests", "CBC & Pathology", "Blood Test", Icons.Default.Bloodtype, true),
    HomeCategoryItem("Pathology", "Biopsy & Tests", "Pathology", Icons.Default.Science, true),
    HomeCategoryItem("ECG / Echo", "Heart Rhythm", "ECG", Icons.Default.MonitorHeart, true),
    HomeCategoryItem("Urine Analysis", "Diagnostic Lab", "Urine", Icons.Default.WaterDrop, true),
    HomeCategoryItem("Endoscopy", "Diagnostic Scan", "Endoscopy", Icons.Default.Videocam, true),
    HomeCategoryItem("Mammography", "Breast Imaging", "Mammography", Icons.Default.Image, true)
)

private val DEFAULT_NEPAL_MAJOR_LOCATIONS = listOf(
    "All Nepal",
    "Kathmandu",
    "Lalitpur",
    "Bhaktapur",
    "Pokhara",
    "Janakpur",
    "Biratnagar",
    "Birgunj",
    "Dharan",
    "Chitwan",
    "Butwal",
    "Nepalgunj",
    "Hetauda",
    "Dhangadhi"
)

private val DEFAULT_NEPAL_DISTRICT_ALIASES = mapOf(
    "Kathmandu" to listOf("kathmandu", "ktm", "bagmati", "thamel", "kapan", "baneshwor", "chabahil", "maharajgunj", "tekut", "kalanki"),
    "Lalitpur" to listOf("lalitpur", "patan", "pulchowk", "jawalakhel", "kupondole", "kumaripati", "lagankhel"),
    "Bhaktapur" to listOf("bhaktapur", "thimi", "suryabinayak", "sallaghari"),
    "Pokhara" to listOf("pokhara", "kaski", "lakeside", "gandaki", "prithvichowk", "new road pokhara"),
    "Janakpur" to listOf("janakpur", "dhanusha", "dhanusa", "madhesh", "bhanu chowk", "muralichowk"),
    "Biratnagar" to listOf("biratnagar", "morang", "koshi", "traffic chowk"),
    "Birgunj" to listOf("birgunj", "birganj", "parsa", "ghantaghar"),
    "Dharan" to listOf("dharan", "sunsari", "bhanuchowk"),
    "Chitwan" to listOf("chitwan", "bharatpur", "narayangarh", "ratnanagar", "chaubiskothi"),
    "Butwal" to listOf("butwal", "rupandehi", "bhairahawa", "lumbini", "traffic chowk butwal"),
    "Nepalgunj" to listOf("nepalgunj", "nepalganj", "banke", "dhamboji"),
    "Hetauda" to listOf("hetauda", "makwanpur"),
    "Dhangadhi" to listOf("dhangadhi", "kailali", "sudurpashchim")
)

private val DEFAULT_NEPAL_CITY_COORDINATES = mapOf(
    "Kathmandu" to Pair(27.7172, 85.3240),
    "Lalitpur" to Pair(27.6674, 85.3206),
    "Bhaktapur" to Pair(27.6710, 85.4298),
    "Pokhara" to Pair(28.2096, 83.9856),
    "Janakpur" to Pair(26.7288, 85.9244),
    "Biratnagar" to Pair(26.4525, 87.2718),
    "Birgunj" to Pair(27.0104, 84.8774),
    "Dharan" to Pair(26.8124, 87.2834),
    "Chitwan" to Pair(27.5291, 84.3542),
    "Butwal" to Pair(27.7006, 83.4484),
    "Nepalgunj" to Pair(28.0500, 81.6167),
    "Hetauda" to Pair(27.4287, 85.0331),
    "Dhangadhi" to Pair(28.6833, 80.6000)
)

var NEPAL_MAJOR_LOCATIONS by mutableStateOf(DEFAULT_NEPAL_MAJOR_LOCATIONS)
var NEPAL_DISTRICT_ALIASES by mutableStateOf(DEFAULT_NEPAL_DISTRICT_ALIASES)
var NEPAL_CITY_COORDINATES by mutableStateOf(DEFAULT_NEPAL_CITY_COORDINATES)

fun syncLocationsFromAdmin(remoteLocations: List<com.dactor.patient.data.model.MedicalQualification>) {
    val activeLocs = remoteLocations.filter { it.isActive }
    if (activeLocs.isEmpty()) return

    val orderedNames = mutableListOf("All Nepal")
    val newAliases = DEFAULT_NEPAL_DISTRICT_ALIASES.toMutableMap()
    val newCoords = DEFAULT_NEPAL_CITY_COORDINATES.toMutableMap()

    for (loc in activeLocs) {
        val cityName = loc.degreeName.trim()
        if (cityName.isNotBlank() && !cityName.equals("All Nepal", ignoreCase = true)) {
            if (!orderedNames.contains(cityName)) {
                orderedNames.add(cityName)
            }
            val parsedAliases = (loc.description ?: "")
                .split(",")
                .map { it.trim().lowercase(java.util.Locale.ROOT) }
                .filter { it.isNotBlank() }
                .toMutableList()
            if (!parsedAliases.contains(cityName.lowercase(java.util.Locale.ROOT))) {
                parsedAliases.add(0, cityName.lowercase(java.util.Locale.ROOT))
            }
            newAliases[cityName] = parsedAliases

            val coordParts = (loc.fieldOfStudy ?: "").split(",")
            if (coordParts.size >= 2) {
                val lat = coordParts[0].trim().toDoubleOrNull()
                val lng = coordParts[1].trim().toDoubleOrNull()
                if (lat != null && lng != null) {
                    newCoords[cityName] = Pair(lat, lng)
                }
            }
        }
    }

    NEPAL_MAJOR_LOCATIONS = orderedNames
    NEPAL_DISTRICT_ALIASES = newAliases
    NEPAL_CITY_COORDINATES = newCoords
}

fun calculateDistanceKm(lat1: Double, lon1: Double, lat2: Double, lon2: Double): Double {
    val r = 6371.0
    val dLat = Math.toRadians(lat2 - lat1)
    val dLon = Math.toRadians(lon2 - lon1)
    val a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(Math.toRadians(lat1)) * Math.cos(Math.toRadians(lat2)) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2)
    val c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
    return r * c
}

@Suppress("MissingPermission")
fun fetchCurrentLocation(
    context: Context,
    onLocationDisabled: (() -> Unit)? = null,
    onLocation: (Double, Double, String, String) -> Unit
) {
    try {
        val lm = context.getSystemService(Context.LOCATION_SERVICE) as? android.location.LocationManager ?: return
        val hasGps = try { lm.isProviderEnabled(android.location.LocationManager.GPS_PROVIDER) } catch (e: Exception) { false }
        val hasNet = try { lm.isProviderEnabled(android.location.LocationManager.NETWORK_PROVIDER) } catch (e: Exception) { false }

        if (!hasGps && !hasNet) {
            onLocationDisabled?.invoke()
            return
        }

        // Sub-millisecond offline spatial city matching against NEPAL_CITY_COORDINATES
        fun matchCityFast(lat: Double, lng: Double): String {
            var closestCity = "Kathmandu"
            var minDistance = Double.MAX_VALUE
            for ((city, coords) in NEPAL_CITY_COORDINATES) {
                val d = calculateDistanceKm(lat, lng, coords.first, coords.second)
                if (d < minDistance) {
                    minDistance = d
                    closestCity = city
                }
            }
            return closestCity
        }

        fun resolveAndDeliver(loc: android.location.Location) {
            val lat = loc.latitude
            val lng = loc.longitude
            com.dactor.patient.util.OpenRouteSpatialEngine.lastKnownUserLat = lat
            com.dactor.patient.util.OpenRouteSpatialEngine.lastKnownUserLng = lng

            // 1. Immediately match city in memory (< 0.1ms) with zero UI freeze
            val fastCity = matchCityFast(lat, lng)
            val label = "$fastCity (Live)"

            // Deliver immediately on Main thread so UI updates in <100ms
            android.os.Handler(android.os.Looper.getMainLooper()).post {
                onLocation(lat, lng, label, fastCity)
            }

            // 2. Offload Geocoder to background Dispatchers.IO to refine if needed without blocking UI
            kotlinx.coroutines.CoroutineScope(Dispatchers.IO).launch {
                try {
                    if (android.location.Geocoder.isPresent()) {
                        val geocoder = android.location.Geocoder(context, java.util.Locale.ENGLISH)
                        val addrs = geocoder.getFromLocation(lat, lng, 1)
                        if (!addrs.isNullOrEmpty()) {
                            val addr = addrs[0]
                            val locStr = (addr.locality ?: addr.subAdminArea ?: addr.adminArea ?: "").lowercase()
                            var refinedCity = ""
                            for ((city, aliases) in NEPAL_DISTRICT_ALIASES) {
                                if (aliases.any { locStr.contains(it) }) {
                                    refinedCity = city
                                    break
                                }
                            }
                            if (refinedCity.isNotBlank() && refinedCity != fastCity) {
                                withContext(Dispatchers.Main) {
                                    onLocation(lat, lng, "$refinedCity (Live)", refinedCity)
                                }
                            }
                        }
                    }
                } catch (ignored: Exception) {}
            }
        }

        // Phase 1: Check fresh last-known location for sub-5ms instant delivery
        val providers = listOf(
            android.location.LocationManager.GPS_PROVIDER,
            android.location.LocationManager.NETWORK_PROVIDER,
            android.location.LocationManager.PASSIVE_PROVIDER
        )
        var bestCachedLoc: android.location.Location? = null
        for (p in providers) {
            try {
                val loc = lm.getLastKnownLocation(p)
                if (loc != null) {
                    val ageMs = System.currentTimeMillis() - loc.time
                    if (ageMs < 20 * 60 * 1000 && (bestCachedLoc == null || loc.accuracy < bestCachedLoc.accuracy)) {
                        bestCachedLoc = loc
                    }
                }
            } catch (ignored: SecurityException) {}
        }
        if (bestCachedLoc != null) {
            resolveAndDeliver(bestCachedLoc)
        }

        // Phase 2: Rapid lock using NETWORK_PROVIDER (locks in 50-100ms) or GPS refinement
        try {
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.R) {
                val fastProvider = if (hasNet) android.location.LocationManager.NETWORK_PROVIDER else android.location.LocationManager.GPS_PROVIDER
                lm.getCurrentLocation(fastProvider, null, context.mainExecutor) { liveLoc ->
                    if (liveLoc != null) {
                        resolveAndDeliver(liveLoc)
                    } else if (fastProvider == android.location.LocationManager.NETWORK_PROVIDER && hasGps) {
                        lm.getCurrentLocation(android.location.LocationManager.GPS_PROVIDER, null, context.mainExecutor) { gpsLoc ->
                            if (gpsLoc != null) resolveAndDeliver(gpsLoc)
                        }
                    }
                }
            } else {
                val listener = object : android.location.LocationListener {
                    override fun onLocationChanged(location: android.location.Location) {
                        lm.removeUpdates(this)
                        resolveAndDeliver(location)
                    }
                    @Deprecated("Deprecated in Java")
                    override fun onStatusChanged(provider: String?, status: Int, extras: android.os.Bundle?) {}
                    override fun onProviderEnabled(provider: String) {}
                    override fun onProviderDisabled(provider: String) {}
                }
                if (hasNet) {
                    lm.requestSingleUpdate(android.location.LocationManager.NETWORK_PROVIDER, listener, android.os.Looper.getMainLooper())
                } else if (hasGps) {
                    lm.requestSingleUpdate(android.location.LocationManager.GPS_PROVIDER, listener, android.os.Looper.getMainLooper())
                }
            }
        } catch (ignored: Exception) {}
    } catch (e: Exception) {
        e.printStackTrace()
    }
}


@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PatientMainScreen(
    navController: NavController,
    clinicRepository: ClinicRepository? = null,
    doctorRepository: DoctorRepository? = null,
    slotRepository: SlotRepository? = null,
    appointmentRepository: AppointmentRepository? = null,
    queueRepository: QueueRepository? = null,
    labReportRepository: LabReportRepository? = null,
    notificationRepository: NotificationRepository? = null,
    authRepository: AuthRepository? = null,
    sessionManager: UserSessionManager? = null,
    initialTab: Int = 0
) {
    var selectedTab by rememberSaveable { mutableIntStateOf(initialTab.coerceIn(0, 3)) }

    // ── Today's Appointment Top Popup Notification State ───────────────────
    var todayAppointment by remember { mutableStateOf<Appointment?>(null) }
    var todayClinicName by remember { mutableStateOf<String?>(null) }
    var todayDoctorName by remember { mutableStateOf<String?>(null) }
    var showTodayPopup by remember { mutableStateOf(true) }

    // ── Mandatory Non-Skippable Terms & Privacy Policy Gate ───────────────
    var showMandatoryTermsDialog by remember {
        mutableStateOf(sessionManager?.hasAcceptedTerms() == false)
    }

    if (showMandatoryTermsDialog) {
        TermsAndConditionsDialog(
            isMandatory = true,
            onAccept = {
                sessionManager?.setTermsAccepted(true)
                showMandatoryTermsDialog = false
            },
            onDismiss = {
                if (sessionManager?.hasAcceptedTerms() == true) {
                    showMandatoryTermsDialog = false
                }
            }
        )
    }

    val navBackStackEntry by navController.currentBackStackEntryAsState()
    val currentRoute = navBackStackEntry?.destination?.route
    val lifecycleOwner = androidx.compose.ui.platform.LocalLifecycleOwner.current
    val context = androidx.compose.ui.platform.LocalContext.current
    var refreshCounter by remember { mutableIntStateOf(0) }

    DisposableEffect(lifecycleOwner) {
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_RESUME) {
                refreshCounter++
            }
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose { lifecycleOwner.lifecycle.removeObserver(observer) }
    }

    LaunchedEffect(selectedTab, currentRoute, refreshCounter) {
        val activePayment = sessionManager?.getActivePaymentSession()
        if (activePayment != null && !activePayment.isExpired()) {
            navController.navigate(NavRoutes.Payment.createRoute(activePayment.appointmentId)) {
                launchSingleTop = true
            }
            return@LaunchedEffect
        }
        try {
            val todayStr = LocalDate.now().toString()
            var patientId = sessionManager?.getSavedPatientId() ?: ""
            val email = sessionManager?.getSavedEmail()?.takeIf { it.isNotBlank() }
                ?: authRepository?.getCurrentUserEmail()?.takeIf { it.isNotBlank() }
            var phone = sessionManager?.getSavedPhone()?.takeIf { it.isNotBlank() }

            if (!email.isNullOrBlank() && authRepository != null) {
                try {
                    authRepository.syncPatientProfile(
                        userId = patientId,
                        email = email,
                        fullName = sessionManager?.getSavedName().orEmpty(),
                        phone = phone.orEmpty()
                    )
                    val p = authRepository.getProfileByEmail(email)
                    if (p != null) {
                        patientId = p.id
                        if (phone.isNullOrBlank() && !p.phone.isNullOrBlank()) {
                            phone = p.phone
                        }
                    }
                } catch (ignored: Exception) {}
            }

            val savedCodes = sessionManager?.getSavedTrackingCodes()?.map { it.first } ?: emptyList()
            val combined = if (appointmentRepository != null) {
                appointmentRepository.getAllPatientAppointments(
                    userId = patientId,
                    email = email,
                    phone = phone,
                    trackingCodes = savedCodes
                )
            } else emptyList()

            val hiddenCodes = sessionManager?.getHiddenRecordCodes() ?: emptySet()
            for (appt in combined) {
                if (appt.trackingCode10Digit.isNotBlank() && !hiddenCodes.contains(appt.trackingCode10Digit) && !hiddenCodes.contains(appt.id)) {
                    sessionManager?.saveTrackingCode(
                        appt.trackingCode10Digit,
                        "${appt.patientName} \u2022 ${appt.appointmentDate}"
                    )
                }
                val isDone = appt.checkinStatus.lowercase() in listOf("completed", "done", "cancelled")
                if (isDone) {
                    NotificationHelper.cancelAppointmentNotifications(context, appt.id)
                    if (appt.trackingCode10Digit.isNotBlank()) {
                        NotificationHelper.cancelAppointmentNotifications(context, appt.trackingCode10Digit)
                    }
                }
            }

            val activeToday = combined.firstOrNull { appt ->
                if (appt.appointmentDate.trim().take(10) != todayStr) return@firstOrNull false
                val cStatus = appt.checkinStatus.lowercase()
                if (cStatus in listOf("completed", "done", "cancelled")) return@firstOrNull false

                if (queueRepository != null) {
                    try {
                        val q = queueRepository.getQueueStatus(appt.id)
                        val qStatus = q?.status?.lowercase()
                        if (qStatus in listOf("done", "completed", "cancelled")) return@firstOrNull false
                    } catch (_: Exception) {}
                }
                true
            }

            if (activeToday != null) {
                todayAppointment = activeToday
                try {
                    if (activeToday.clinicId.isNotBlank() && clinicRepository != null) {
                        todayClinicName = clinicRepository.getClinicById(activeToday.clinicId)?.name
                    }
                    if (!activeToday.doctorId.isNullOrBlank() && doctorRepository != null) {
                        todayDoctorName = doctorRepository.getDoctorById(activeToday.doctorId)?.fullName
                    }
                } catch (ignored: Exception) {}
            } else {
                todayAppointment = null
                showTodayPopup = false
            }
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    Scaffold(
        bottomBar = {
            NavigationBar(
                containerColor = MaterialTheme.colorScheme.surface,
                tonalElevation = 8.dp
            ) {
                NavigationBarItem(
                    selected = selectedTab == 0,
                    onClick = { selectedTab = 0 },
                    icon = { Icon(Icons.Default.Home, contentDescription = "Home") },
                    label = { Text("Home", fontSize = 12.sp, fontWeight = if (selectedTab == 0) FontWeight.Bold else FontWeight.Normal) },
                    colors = NavigationBarItemDefaults.colors(
                        selectedIconColor = MaterialTheme.colorScheme.primary,
                        selectedTextColor = MaterialTheme.colorScheme.primary,
                        indicatorColor = MaterialTheme.colorScheme.primaryContainer
                    )
                )

                NavigationBarItem(
                    selected = selectedTab == 1,
                    onClick = { selectedTab = 1 },
                    icon = { Icon(Icons.AutoMirrored.Filled.Article, contentDescription = "Records") },
                    label = { Text("Records", fontSize = 12.sp, fontWeight = if (selectedTab == 1) FontWeight.Bold else FontWeight.Normal) },
                    colors = NavigationBarItemDefaults.colors(
                        selectedIconColor = MaterialTheme.colorScheme.primary,
                        selectedTextColor = MaterialTheme.colorScheme.primary,
                        indicatorColor = MaterialTheme.colorScheme.primaryContainer
                    )
                )

                NavigationBarItem(
                    selected = selectedTab == 2,
                    onClick = { selectedTab = 2 },
                    icon = { Icon(Icons.Default.EventNote, contentDescription = "Appointments") },
                    label = { Text("Appointments", fontSize = 12.sp, fontWeight = if (selectedTab == 2) FontWeight.Bold else FontWeight.Normal) },
                    colors = NavigationBarItemDefaults.colors(
                        selectedIconColor = MaterialTheme.colorScheme.primary,
                        selectedTextColor = MaterialTheme.colorScheme.primary,
                        indicatorColor = MaterialTheme.colorScheme.primaryContainer
                    )
                )

                NavigationBarItem(
                    selected = selectedTab == 3,
                    onClick = { selectedTab = 3 },
                    icon = { Icon(Icons.Default.Person, contentDescription = "Profile") },
                    label = { Text("Profile", fontSize = 12.sp, fontWeight = if (selectedTab == 3) FontWeight.Bold else FontWeight.Normal) },
                    colors = NavigationBarItemDefaults.colors(
                        selectedIconColor = MaterialTheme.colorScheme.primary,
                        selectedTextColor = MaterialTheme.colorScheme.primary,
                        indicatorColor = MaterialTheme.colorScheme.primaryContainer
                    )
                )
            }
        }
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
        ) {
            // ── TOP POPUP NOTIFICATION FOR TODAY'S APPOINTMENT ─────────────
            val isTodayCompleted = todayAppointment?.checkinStatus?.lowercase() in listOf("completed", "done", "cancelled")
            AnimatedVisibility(visible = showTodayPopup && todayAppointment != null && !isTodayCompleted) {
                todayAppointment?.let { appt ->
                    Card(
                        shape = RoundedCornerShape(16.dp),
                        colors = CardDefaults.cardColors(containerColor = Color(0xFF0284C7)),
                        elevation = CardDefaults.cardElevation(defaultElevation = 6.dp),
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 16.dp, vertical = 8.dp)
                            .clickable {
                                navController.navigate(NavRoutes.QueueStatus.createRoute(appt.trackingCode10Digit))
                            }
                    ) {
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(horizontal = 14.dp, vertical = 12.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(12.dp)
                        ) {
                            Surface(
                                shape = CircleShape,
                                color = Color.White.copy(alpha = 0.2f),
                                modifier = Modifier.size(40.dp)
                            ) {
                                Box(contentAlignment = Alignment.Center) {
                                    Icon(
                                        Icons.Default.NotificationsActive,
                                        contentDescription = "Today's Appointment",
                                        tint = Color.White,
                                        modifier = Modifier.size(22.dp)
                                    )
                                }
                            }

                            Column(modifier = Modifier.weight(1f)) {
                                Row(
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(6.dp)
                                ) {
                                    Surface(
                                        shape = RoundedCornerShape(4.dp),
                                        color = Color(0xFFFEF08A)
                                    ) {
                                        Text(
                                            text = "TODAY \u2022 ${appt.appointmentTime}",
                                            fontSize = 10.sp,
                                            fontWeight = FontWeight.ExtraBold,
                                            color = Color(0xFF854D0E),
                                            modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
                                        )
                                    }
                                    Text(
                                        text = "Code: #${appt.trackingCode10Digit}",
                                        fontSize = 11.sp,
                                        fontWeight = FontWeight.Bold,
                                        color = Color.White.copy(alpha = 0.9f)
                                    )
                                }
                                Spacer(Modifier.height(3.dp))
                                Text(
                                    text = buildString {
                                        append(todayClinicName ?: "Appointment Today")
                                        if (!todayDoctorName.isNullOrBlank()) {
                                            append(" \u2022 Dr. $todayDoctorName")
                                        }
                                    },
                                    fontSize = 14.sp,
                                    fontWeight = FontWeight.Bold,
                                    color = Color.White,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis
                                )
                                Text(
                                    text = "Tap to open live queue tracking →",
                                    fontSize = 11.sp,
                                    fontWeight = FontWeight.Medium,
                                    color = Color(0xFFCCFBF1)
                                )
                            }

                            // Cancel / Dismiss Button
                            Surface(
                                shape = CircleShape,
                                color = Color.White.copy(alpha = 0.18f),
                                modifier = Modifier
                                    .size(30.dp)
                                    .clickable { showTodayPopup = false }
                            ) {
                                Box(contentAlignment = Alignment.Center) {
                                    Icon(
                                        Icons.Default.Close,
                                        contentDescription = "Cancel / Dismiss Notification",
                                        tint = Color.White,
                                        modifier = Modifier.size(16.dp)
                                    )
                                }
                            }
                        }
                    }
                }
            }

            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .weight(1f)
            ) {
                when (selectedTab) {
                    0 -> HomeTab(
                        navController = navController,
                        clinicRepository = clinicRepository,
                        doctorRepository = doctorRepository,
                        slotRepository = slotRepository,
                        notificationRepository = notificationRepository,
                        appointmentRepository = appointmentRepository,
                        sessionManager = sessionManager
                    )
                    1 -> RecordsTab(
                        navController = navController,
                        appointmentRepository = appointmentRepository,
                        labReportRepository = labReportRepository,
                        clinicRepository = clinicRepository,
                        doctorRepository = doctorRepository,
                        authRepository = authRepository,
                        sessionManager = sessionManager
                    )
                    2 -> AppointmentsTab(
                        navController = navController,
                        appointmentRepository = appointmentRepository,
                        queueRepository = queueRepository,
                        doctorRepository = doctorRepository,
                        clinicRepository = clinicRepository,
                        labReportRepository = labReportRepository,
                        authRepository = authRepository,
                        sessionManager = sessionManager
                    )
                    3 -> ProfileTab(
                        navController = navController,
                        authRepository = authRepository,
                        appointmentRepository = appointmentRepository,
                        clinicRepository = clinicRepository,
                        doctorRepository = doctorRepository,
                        labReportRepository = labReportRepository,
                        sessionManager = sessionManager
                    )
                }
            }
        }
    }
}

// =========================================================================
// TAB 0: HOME SCREEN (Matches Mockup Image with Date Picker & Clinic List)
// =========================================================================
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HomeTab(
    navController: NavController,
    clinicRepository: ClinicRepository?,
    doctorRepository: DoctorRepository?,
    slotRepository: SlotRepository?,
    notificationRepository: NotificationRepository? = null,
    appointmentRepository: AppointmentRepository? = null,
    sessionManager: UserSessionManager? = null
) {
    val context = LocalContext.current
    val coroutineScope = rememberCoroutineScope()

    val today = remember { LocalDate.now() }
    var viewedYearMonth by remember { mutableStateOf(YearMonth.from(today)) }
    val viewedYearMonthStr = viewedYearMonth.toString()

    var selectedDate by remember { mutableStateOf(today) }
    val selectedDateStr = selectedDate.toString()

    var selectedLocation by rememberSaveable { mutableStateOf("All Nepal") }
    var detectedCityName by rememberSaveable { mutableStateOf("") }
    var userLatitude by rememberSaveable { mutableStateOf<Double?>(null) }
    var userLongitude by rememberSaveable { mutableStateOf<Double?>(null) }
    var isLiveGpsActive by rememberSaveable { mutableStateOf(false) }
    var hasInitializedGps by rememberSaveable { mutableStateOf(false) }
    var showLocationDialog by remember { mutableStateOf(false) }
    var showEnableGpsDialog by remember { mutableStateOf(false) }
    var showMapPicker by remember { mutableStateOf(false) }

    val gpsSettingsLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.StartActivityForResult()
    ) {
        fetchCurrentLocation(
            context = context,
            onLocationDisabled = { }
        ) { lat, lng, label, city ->
            userLatitude = lat
            userLongitude = lng
            selectedLocation = label
            detectedCityName = city
            isLiveGpsActive = true
            showLocationDialog = false
            Toast.makeText(context, "Live Location: $city matched", Toast.LENGTH_SHORT).show()
        }
    }

    val locationPermissionLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestMultiplePermissions()
    ) { perms ->
        val granted = perms[Manifest.permission.ACCESS_FINE_LOCATION] == true ||
                      perms[Manifest.permission.ACCESS_COARSE_LOCATION] == true
        if (granted) {
            fetchCurrentLocation(
                context = context,
                onLocationDisabled = { showEnableGpsDialog = true }
            ) { lat, lng, label, city ->
                userLatitude = lat
                userLongitude = lng
                selectedLocation = label
                detectedCityName = city
                isLiveGpsActive = true
                showLocationDialog = false
                Toast.makeText(context, "Live Location: $city matched", Toast.LENGTH_SHORT).show()
            }
        } else {
            Toast.makeText(context, "Location permission not granted", Toast.LENGTH_SHORT).show()
        }
    }

    // Proactively ask for location permission on launch if not granted, or fetch location if granted
    LaunchedEffect(Unit) {
        if (!hasInitializedGps) {
            hasInitializedGps = true
            val hasFine = ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
            val hasCoarse = ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED
            if (hasFine || hasCoarse) {
                fetchCurrentLocation(
                    context = context,
                    onLocationDisabled = { showEnableGpsDialog = true }
                ) { lat, lng, label, city ->
                    userLatitude = lat
                    userLongitude = lng
                    selectedLocation = label
                    detectedCityName = city
                    isLiveGpsActive = true
                }
            } else {
                locationPermissionLauncher.launch(
                    arrayOf(
                        Manifest.permission.ACCESS_FINE_LOCATION,
                        Manifest.permission.ACCESS_COARSE_LOCATION
                    )
                )
            }
        }
    }

    // Sync Location Options configured in Admin Portal on launch & whenever top location selector opens
    LaunchedEffect(showLocationDialog) {
        try {
            val remoteLocs = withContext(Dispatchers.IO) {
                clinicRepository?.getServiceLocations(forceRefresh = true) ?: emptyList()
            }
            if (remoteLocs.isNotEmpty()) {
                syncLocationsFromAdmin(remoteLocs)
            }
        } catch (ignored: Exception) {}
    }

    var searchQuery by remember { mutableStateOf("") }
    var selectedSort by rememberSaveable { mutableStateOf("default") }
    var showSortMenu by remember { mutableStateOf(false) }
    var selectedEntityFilter by rememberSaveable { mutableStateOf("all") } // "all", "doctors", "clinics"
    var activeCategoryFilter by rememberSaveable { mutableStateOf<String?>(null) }

    BackHandler(enabled = activeCategoryFilter != null) {
        activeCategoryFilter = null
    }

    // ── Instant 0ms Stale-While-Revalidate (SWR) Initial Hydration from L1 Cache ──
    var allClinics by remember {
        val cachedClinics = clinicRepository?.getCachedClinics()
        val cachedRosterMap = doctorRepository?.getCachedDoctorsByClinicMap() ?: emptyMap()
        val cachedServicesMap = clinicRepository?.getCachedAllServicesByClinic() ?: emptyMap()
        val cachedSlotsMap = slotRepository?.getCachedSlotsForDate(selectedDateStr) ?: emptyMap()
        val initialItems = if (!cachedClinics.isNullOrEmpty()) {
            cachedClinics.map { clinic ->
                val docs = cachedRosterMap[clinic.id] ?: emptyList()
                val srvs = cachedServicesMap[clinic.id] ?: emptyList()
                val slots = cachedSlotsMap[clinic.id] ?: emptyList()
                OpenRouteSpatialEngine.indexClinic(clinic, docs, srvs)
                ClinicHomeItem(clinic = clinic, doctors = docs, services = srvs, availableSlots = slots)
            }
        } else emptyList()
        mutableStateOf(initialItems)
    }

    var allDoctors by remember {
        val cachedDocs = doctorRepository?.getCachedAllDoctors()
        val cachedClinics = clinicRepository?.getCachedClinics() ?: emptyList()
        val cachedRosterMap = doctorRepository?.getCachedDoctorsByClinicMap() ?: emptyMap()
        val initialDocs = if (!cachedDocs.isNullOrEmpty()) {
            cachedDocs.map { doc ->
                val linked = cachedClinics.filter { c ->
                    c.id == doc.clinicId ||
                        c.id == doc.activeClinicId ||
                        c.id == doc.primaryClinicId ||
                        cachedRosterMap[c.id]?.any { d -> d.id == doc.id } == true
                }
                OpenRouteSpatialEngine.indexDoctor(doc, linked)
                DoctorHomeItem(doctor = doc, practicingClinics = linked)
            }
        } else emptyList()
        mutableStateOf(initialDocs)
    }

    var isLoadingClinics by remember { mutableStateOf(allClinics.isEmpty() && allDoctors.isEmpty()) }

    // Modal state for "Select Clinic to Book" when clicking a Doctor
    var selectedDoctorForClinicPicker by remember { mutableStateOf<DoctorHomeItem?>(null) }
    var clinicsNextAvailableDates by remember { mutableStateOf<Map<String, String>>(emptyMap()) }

    val dateListState = rememberLazyListState()

    // ── Date Options Calculation ──────────────────────────────────────────
    val daysInMonth = remember(viewedYearMonthStr, today) {
        val ym = try { YearMonth.parse(viewedYearMonthStr) } catch (_: Exception) { YearMonth.from(today) }
        val startDay = if (ym == YearMonth.from(today)) today.dayOfMonth else 1
        val totalDays = ym.lengthOfMonth()
        (startDay..totalDays).map { day -> ym.atDay(day) }
    }

    // ── Single-Roundtrip Parallel Batch Load for Clinics, Doctors, Services & Initial Slots ──
    LaunchedEffect(Unit) {
        if (allClinics.isEmpty() && allDoctors.isEmpty()) {
            isLoadingClinics = true
        }
        if (clinicRepository != null) {
            try {
                val dateStr = selectedDate.toString()
                val (builtPair, nextDates) = withContext(Dispatchers.IO) {
                    coroutineScope {
                        val clinicsDef = async { val lat = userLatitude; val lng = userLongitude; if (lat != null && lng != null) clinicRepository.getNearbyClinics(lat, lng, radiusKm = 35.0) else clinicRepository.getClinics(forceRefresh = true) }
                        val servicesDef = async { clinicRepository.getAllClinicServicesGrouped(forceRefresh = true) }
                        val slotsDef = async { slotRepository?.getAllAvailableSlotsForDate(dateStr) ?: emptyMap() }
                        val nextDatesDef = async { slotRepository?.getAllClinicsNextAvailableDates() ?: emptyMap() }

                        val remoteClinics = clinicsDef.await()
                        val clinicIds = remoteClinics.map { it.id }
                        val (standaloneDocs, rosterByClinic) = doctorRepository?.getAllDoctorsAndClinicRoster(
                            clinicIds = clinicIds,
                            forceRefresh = true
                        ) ?: Pair(emptyList(), emptyMap())

                        val servicesByClinic = servicesDef.await()
                        val slotsByClinic = slotsDef.await()
                        val datesMap = nextDatesDef.await()

                        val pair = withContext(Dispatchers.Default) {
                            val items = remoteClinics.map { clinic ->
                                val docs = rosterByClinic[clinic.id] ?: emptyList()
                                val srvs = servicesByClinic[clinic.id] ?: emptyList()
                                val slots = slotsByClinic[clinic.id] ?: emptyList()
                                OpenRouteSpatialEngine.indexClinic(clinic, docs, srvs)
                                ClinicHomeItem(clinic = clinic, doctors = docs, services = srvs, availableSlots = slots)
                            }

                            val combinedDocs = (standaloneDocs + items.flatMap { it.doctors }).distinctBy { it.id }
                            val docItems = combinedDocs.map { doc ->
                                val linkedClinics = remoteClinics.filter { c ->
                                    c.id == doc.clinicId ||
                                        c.id == doc.activeClinicId ||
                                        c.id == doc.primaryClinicId ||
                                        rosterByClinic[c.id]?.any { d -> d.id == doc.id } == true
                                }
                                OpenRouteSpatialEngine.indexDoctor(doc, linkedClinics)
                                DoctorHomeItem(doctor = doc, practicingClinics = linkedClinics)
                            }
                            Pair(items, docItems)
                        }
                        Pair(pair, datesMap)
                    }
                }
                allClinics = builtPair.first
                allDoctors = builtPair.second
                clinicsNextAvailableDates = nextDates
            } catch (e: Exception) {
                e.printStackTrace()
            } finally {
                isLoadingClinics = false
            }
        } else {
            isLoadingClinics = false
        }
    }

    // ── Instant Slot-Only Hydration on Date Change (No Re-Fetching of Clinics/Doctors!) ──
    LaunchedEffect(selectedDate) {
        if (slotRepository != null && allClinics.isNotEmpty()) {
            val dateStr = selectedDate.toString()
            val cachedForDate = slotRepository.getCachedSlotsForDate(dateStr)
            if (cachedForDate != null) {
                allClinics = allClinics.map { item ->
                    item.copy(availableSlots = cachedForDate[item.clinic.id] ?: emptyList())
                }
            }
            val freshSlotsByClinic = withContext(Dispatchers.IO) {
                slotRepository.getAllAvailableSlotsForDate(dateStr, forceRefresh = true)
            }
            allClinics = allClinics.map { item ->
                item.copy(availableSlots = freshSlotsByClinic[item.clinic.id] ?: emptyList())
            }
            if (clinicsNextAvailableDates.isEmpty()) {
                val dates = withContext(Dispatchers.IO) {
                    slotRepository.getAllClinicsNextAvailableDates()
                }
                clinicsNextAvailableDates = dates
            }
        }
    }

    // ── Phase 2 Asynchronous OpenRouteService (ORS) Matrix Road-Network Enrichment ──
    val orsRouteVersion by OpenRouteSpatialEngine.routeCacheVersion.collectAsState()
    LaunchedEffect(userLatitude, userLongitude, allClinics.size) {
        if (userLatitude != null && userLongitude != null && allClinics.isNotEmpty()) {
            OpenRouteSpatialEngine.enrichWithOpenRouteServiceMatrix(
                userLat = userLatitude,
                userLng = userLongitude,
                clinics = allClinics.map { it.clinic }
            )
        }
    }

    var isSearching by remember { mutableStateOf(false) }

    LaunchedEffect(searchQuery) {
        if (searchQuery.isNotBlank()) {
            isSearching = true
            delay(100L)
            isSearching = false
        } else {
            isSearching = false
        }
    }

    // Instant Specialist Suggestions (e.g., searching "skin" suggests "Dermatologist")
    val suggestedSpecialties = remember(searchQuery) {
        MedicalSearchEngine.getSuggestedSpecialties(searchQuery)
    }

    val effectiveQuery = remember(searchQuery, activeCategoryFilter) {
        if (searchQuery.isNotBlank()) searchQuery else (activeCategoryFilter ?: "")
    }

    // ── Filter & Sort Clinics using MedicalSearchEngine & OpenRouteSpatialEngine ─────────
    val displayedClinics = remember(
        allClinics,
        selectedDate,
        effectiveQuery,
        searchQuery,
        activeCategoryFilter,
        selectedLocation,
        selectedSort,
        userLatitude,
        userLongitude,
        isLiveGpsActive,
        detectedCityName,
        orsRouteVersion,
        NEPAL_DISTRICT_ALIASES
    ) {
        var list = allClinics

        if (isLiveGpsActive && userLatitude != null && userLongitude != null) {
            val uLat = userLatitude!!
            val uLng = userLongitude!!
            val targetCity = if (detectedCityName.isNotBlank()) detectedCityName else selectedLocation.replace(" (Live)", "").trim()
            val aliases = NEPAL_DISTRICT_ALIASES[targetCity] ?: listOf(targetCity.lowercase(java.util.Locale.ROOT))

            val matchedByCityOrProximity = list.filter { item ->
                val c = item.clinic
                val corpus = OpenRouteSpatialEngine.getClinicCorpus(c, item.doctors, item.services)
                val matchesAlias = aliases.any { a -> corpus.addressLower.contains(a) || corpus.nameLower.contains(a) }

                val distKm = OpenRouteSpatialEngine.getEffectiveDistanceKm(uLat, uLng, c)
                val matchesProximity = distKm != null && distKm <= 35.0

                matchesAlias || matchesProximity
            }

            if (matchedByCityOrProximity.isNotEmpty()) {
                list = matchedByCityOrProximity
            }
        } else if (selectedLocation != "All Nepal") {
            val aliases = NEPAL_DISTRICT_ALIASES[selectedLocation] ?: listOf(selectedLocation.lowercase(java.util.Locale.ROOT))
            list = list.filter { item ->
                val corpus = OpenRouteSpatialEngine.getClinicCorpus(item.clinic, item.doctors, item.services)
                aliases.any { a -> corpus.addressLower.contains(a) || corpus.nameLower.contains(a) }
            }
        }

        val scoredList = list.map { item ->
            val result = MedicalSearchEngine.matchClinic(
                clinic = item.clinic,
                doctors = item.doctors,
                services = item.services,
                query = effectiveQuery
            )
            Pair(item, result)
        }.filter { it.second.isMatch }

        when (selectedSort) {
            "in_clinic" -> scoredList.sortedByDescending { it.first.doctors.any { d -> d.isInClinic == true } }
            "fee_asc" -> scoredList.sortedBy { it.first.doctors.minOfOrNull { d -> d.consultationFee ?: 500.0 } ?: 500.0 }
            "name" -> scoredList.sortedBy { it.first.clinic.name.lowercase(java.util.Locale.ROOT) }
            else -> {
                if (effectiveQuery.isNotBlank()) {
                    scoredList.sortedByDescending { it.second.score }
                } else if (isLiveGpsActive && userLatitude != null && userLongitude != null) {
                    val uLat = userLatitude!!
                    val uLng = userLongitude!!
                    scoredList.sortedBy {
                        OpenRouteSpatialEngine.getEffectiveDistanceKm(uLat, uLng, it.first.clinic)
                            ?: calculateDistanceKm(uLat, uLng, it.first.clinic.latitude ?: 27.7052, it.first.clinic.longitude ?: 85.3193)
                    }
                } else {
                    scoredList.sortedByDescending { it.first.doctors.any { d -> d.isInClinic == true } }
                }
            }
        }
    }

    // ── Filter & Sort Doctors using Pre-Indexed Corpus & MedicalSearchEngine ──────────────────
    val displayedDoctors = remember(allDoctors, effectiveQuery, searchQuery, activeCategoryFilter, selectedLocation, selectedSort, isLiveGpsActive, detectedCityName, NEPAL_DISTRICT_ALIASES) {
        var docList = allDoctors

        if (selectedLocation != "All Nepal" && !isLiveGpsActive) {
            val aliases = NEPAL_DISTRICT_ALIASES[selectedLocation] ?: listOf(selectedLocation.lowercase(java.util.Locale.ROOT))
            val locFiltered = docList.filter { item ->
                val corpus = OpenRouteSpatialEngine.getDoctorCorpus(item.doctor, item.practicingClinics)
                aliases.any { a -> corpus.clinicsJoinedLower.contains(a) }
            }
            if (locFiltered.isNotEmpty()) docList = locFiltered
        }

        val scoredDocs = docList.map { item ->
            val result = MedicalSearchEngine.matchDoctor(
                doctor = item.doctor,
                clinics = item.practicingClinics,
                query = effectiveQuery
            )
            Pair(item, result)
        }.filter { it.second.isMatch }

        when (selectedSort) {
            "in_clinic" -> scoredDocs.sortedByDescending { it.first.doctor.isInClinic == true }
            "fee_asc" -> scoredDocs.sortedBy { it.first.doctor.consultationFee ?: 500.0 }
            "name" -> scoredDocs.sortedBy { it.first.doctor.fullName.lowercase(java.util.Locale.ROOT) }
            else -> {
                if (effectiveQuery.isNotBlank()) {
                    scoredDocs.sortedByDescending { it.second.score }
                } else {
                    scoredDocs.sortedByDescending { it.first.doctor.isInClinic == true }
                }
            }
        }
    }

    var isSearchFocused by remember { mutableStateOf(false) }
    val focusManager = androidx.compose.ui.platform.LocalFocusManager.current

    val clinicListState = rememberLazyListState()
    var isDateAndSortVisible by remember { mutableStateOf(true) }

    LaunchedEffect(clinicListState.firstVisibleItemIndex) {
        if (clinicListState.firstVisibleItemIndex == 0) {
            isDateAndSortVisible = true
        }
    }

    val homeNestedScrollConnection = remember {
        object : NestedScrollConnection {
            override fun onPreScroll(
                available: Offset,
                source: NestedScrollSource
            ): Offset {
                val deltaY = available.y
                if (deltaY < -15f && clinicListState.firstVisibleItemIndex > 0) {
                    // Scrolling down the clinic list -> collapse Date & Sort section smoothly
                    if (isDateAndSortVisible) {
                        isDateAndSortVisible = false
                    }
                    if (isSearchFocused && searchQuery.isBlank()) {
                        focusManager.clearFocus()
                    }
                } else if (deltaY > 10f) {
                    // Scrolled back up -> pop Date & Sort section right back immediately!
                    if (!isDateAndSortVisible) {
                        isDateAndSortVisible = true
                    }
                }
                return Offset.Zero
            }
        }
    }

    var unreadCount by remember { mutableIntStateOf(0) }
    LaunchedEffect(notificationRepository, sessionManager) {
        if (notificationRepository != null) {
            try {
                val userId = sessionManager?.getSavedPatientId()
                val email = sessionManager?.getSavedEmail()?.takeIf { it.isNotBlank() }
                val phone = sessionManager?.getSavedPhone()?.takeIf { it.isNotBlank() }
                val codes = sessionManager?.getSavedTrackingCodes()?.map { it.first } ?: emptyList()
                val apptIds = if (appointmentRepository != null) {
                    try {
                        appointmentRepository.getAllPatientAppointments(
                            userId = userId,
                            email = email,
                            phone = phone,
                            trackingCodes = codes
                        ).map { it.id }
                    } catch (_: Exception) { emptyList() }
                } else emptyList()
                val list = notificationRepository.getNotifications(
                    userId = userId,
                    appointmentIds = apptIds
                )
                unreadCount = list.count { !it.isRead }
            } catch (_: Exception) {}
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(Color(0xFFF0F9FF).copy(alpha = 0.4f))
            .nestedScroll(homeNestedScrollConnection)
    ) {
        // ── TOP BAR: Location Selector (Left) + Notification Bell Button (Top-Right, Non-Overlapping) ──
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 20.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Row(
                modifier = Modifier
                    .weight(1f, fill = false)
                    .clip(RoundedCornerShape(8.dp))
                    .clickable { showLocationDialog = true }
                    .padding(vertical = 4.dp, horizontal = 2.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(6.dp)
            ) {
                if (isLiveGpsActive) {
                    Icon(
                        Icons.Default.MyLocation,
                        contentDescription = "Live GPS",
                        tint = Color(0xFF16A34A),
                        modifier = Modifier.size(20.dp)
                    )
                } else {
                    Icon(
                        Icons.Default.KeyboardArrowDown,
                        contentDescription = "Select Location",
                        tint = MaterialTheme.colorScheme.onSurface,
                        modifier = Modifier.size(24.dp)
                    )
                }
                Text(
                    text = selectedLocation,
                    fontSize = 20.sp,
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.onSurface,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
                if (isLiveGpsActive) {
                    Surface(
                        shape = RoundedCornerShape(4.dp),
                        color = Color(0xFFDCFCE7)
                    ) {
                        Text(
                            "LIVE",
                            fontSize = 10.sp,
                            fontWeight = FontWeight.ExtraBold,
                            color = Color(0xFF15803D),
                            modifier = Modifier.padding(horizontal = 5.dp, vertical = 2.dp)
                        )
                    }
                }
            }

            Spacer(modifier = Modifier.width(12.dp))

            // Top-Right Notification Button (Non-overlapping pill/icon surface)
            Surface(
                shape = RoundedCornerShape(12.dp),
                color = Color.White,
                border = BorderStroke(1.dp, Color(0xFFE2E8F0)),
                shadowElevation = 2.dp,
                modifier = Modifier
                    .size(42.dp)
                    .clip(RoundedCornerShape(12.dp))
                    .clickable { navController.navigate(NavRoutes.Notifications.route) }
            ) {
                Box(contentAlignment = Alignment.Center) {
                    Icon(
                        imageVector = Icons.Default.Notifications,
                        contentDescription = "Notifications",
                        tint = Color(0xFF0284C7),
                        modifier = Modifier.size(22.dp)
                    )
                    if (unreadCount > 0) {
                        Surface(
                            shape = CircleShape,
                            color = Color(0xFFDC2626),
                            modifier = Modifier
                                .align(Alignment.TopEnd)
                                .padding(top = 6.dp, end = 6.dp)
                                .size(16.dp)
                        ) {
                            Box(contentAlignment = Alignment.Center) {
                                Text(
                                    text = if (unreadCount > 9) "9+" else unreadCount.toString(),
                                    color = Color.White,
                                    fontSize = 9.sp,
                                    fontWeight = FontWeight.ExtraBold
                                )
                            }
                        }
                    }
                }
            }
        }

        // ── SEARCH BAR (Pushes dedicated full-screen Search route on tap) ──
        Surface(
            onClick = {
                navController.navigate(NavRoutes.Search.createRoute(selectedDate.toString())) {
                    launchSingleTop = true
                }
            },
            shape = RoundedCornerShape(26.dp),
            color = Color.White,
            border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
            shadowElevation = 1.dp,
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 20.dp)
                .height(50.dp)
        ) {
            Row(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(horizontal = 16.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                Icon(
                    Icons.Default.Search,
                    contentDescription = "Search",
                    tint = MaterialTheme.colorScheme.primary,
                    modifier = Modifier.size(20.dp)
                )
                Text(
                    text = "Search doctor, clinic or symptom...",
                    fontSize = 13.sp,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f)
                )
            }
        }

        // ── COLLAPSIBLE DATE & SORT SECTION (Hides on scroll down, pops back immediately on slight scroll up) ──
        AnimatedVisibility(
            visible = isDateAndSortVisible,
            enter = androidx.compose.animation.expandVertically() + androidx.compose.animation.fadeIn(),
            exit = androidx.compose.animation.shrinkVertically() + androidx.compose.animation.fadeOut()
        ) {
            Column {
                Spacer(Modifier.height(6.dp))

                // ── MONTH & YEAR SELECTOR (< October 2026 >) ─────────────────────
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 20.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    val isCurrentMonth = viewedYearMonth <= YearMonth.from(today)
                    IconButton(
                        onClick = {
                            if (!isCurrentMonth) {
                                val prev = viewedYearMonth.minusMonths(1)
                                viewedYearMonth = prev
                                selectedDate = if (prev == YearMonth.from(today)) today else prev.atDay(1)
                                coroutineScope.launch { dateListState.scrollToItem(0) }
                            }
                        },
                        enabled = !isCurrentMonth
                    ) {
                        Icon(
                            Icons.Default.ChevronLeft,
                            contentDescription = "Previous Month",
                            tint = if (isCurrentMonth) Color.LightGray else MaterialTheme.colorScheme.onSurface
                        )
                    }

                    Text(
                        text = "${viewedYearMonth.month.getDisplayName(TextStyle.FULL, Locale.ENGLISH)} ${viewedYearMonth.year}",
                        fontSize = 17.sp,
                        fontWeight = FontWeight.SemiBold,
                        color = MaterialTheme.colorScheme.onSurface
                    )

                    IconButton(
                        onClick = {
                            val next = viewedYearMonth.plusMonths(1)
                            viewedYearMonth = next
                            selectedDate = next.atDay(1)
                            coroutineScope.launch { dateListState.scrollToItem(0) }
                        }
                    ) {
                        Icon(
                            Icons.Default.ChevronRight,
                            contentDescription = "Next Month",
                            tint = MaterialTheme.colorScheme.onSurface
                        )
                    }
                }

                Spacer(Modifier.height(6.dp))

                // ── HORIZONTAL DATE CARDS (Past dates removed) ────────────────────
                LazyRow(
                    state = dateListState,
                    contentPadding = PaddingValues(horizontal = 20.dp),
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    items(daysInMonth, key = { it.toString() }) { date ->
                        val isSelected = (date == selectedDate)
                        val dayOfWeekStr = date.dayOfWeek.getDisplayName(TextStyle.SHORT, Locale.ENGLISH)

                        Surface(
                            shape = RoundedCornerShape(14.dp),
                            color = if (isSelected) MaterialTheme.colorScheme.primary else Color.White,
                            border = BorderStroke(
                                1.dp,
                                if (isSelected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.outlineVariant
                            ),
                            modifier = Modifier
                                .width(62.dp)
                                .defaultMinSize(minHeight = 76.dp)
                                .clickable { selectedDate = date }
                        ) {
                            Column(
                                horizontalAlignment = Alignment.CenterHorizontally,
                                verticalArrangement = Arrangement.Center,
                                modifier = Modifier.padding(vertical = 8.dp, horizontal = 4.dp)
                            ) {
                                Text(
                                    text = dayOfWeekStr,
                                    fontSize = 12.sp,
                                    lineHeight = 14.sp,
                                    fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Medium,
                                    color = if (isSelected) Color.White else MaterialTheme.colorScheme.onSurfaceVariant
                                )
                                Spacer(Modifier.height(4.dp))
                                Text(
                                    text = "${date.dayOfMonth}",
                                    fontSize = 18.sp,
                                    lineHeight = 20.sp,
                                    fontWeight = FontWeight.ExtraBold,
                                    color = if (isSelected) Color.White else MaterialTheme.colorScheme.onSurface
                                )
                            }
                        }
                    }
                }

                Spacer(Modifier.height(10.dp))

                // ── ENTITY FILTER PILLS (All / Doctors / Clinics) & SORT PILL ──────
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 20.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Row(
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        listOf(
                            "all" to "All (${displayedDoctors.size + displayedClinics.size})",
                            "doctors" to "Doctors (${displayedDoctors.size})",
                            "clinics" to "Clinics (${displayedClinics.size})"
                        ).forEach { (key, label) ->
                            val isSel = selectedEntityFilter == key
                            Surface(
                                shape = RoundedCornerShape(18.dp),
                                color = if (isSel) Color(0xFF0284C7) else Color.White,
                                border = BorderStroke(1.dp, if (isSel) Color(0xFF0284C7) else Color(0xFFCBD5E1)),
                                modifier = Modifier.clickable { selectedEntityFilter = key }
                            ) {
                                Text(
                                    text = label,
                                    fontSize = 11.sp,
                                    fontWeight = if (isSel) FontWeight.Bold else FontWeight.Medium,
                                    color = if (isSel) Color.White else Color(0xFF334155),
                                    modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp)
                                )
                            }
                        }
                    }

                    Box {
                        val sortLabel = when (selectedSort) {
                            "in_clinic" -> "Inside"
                            "fee_asc" -> "Low Fee"
                            "name" -> "A-Z"
                            else -> "Sort"
                        }
                        val isCustomSort = selectedSort != "default"

                        Surface(
                            onClick = { showSortMenu = true },
                            shape = RoundedCornerShape(20.dp),
                            color = if (isCustomSort) MaterialTheme.colorScheme.primaryContainer else Color.White,
                            border = BorderStroke(
                                1.dp,
                                if (isCustomSort) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.outlineVariant
                            ),
                            shadowElevation = 1.dp,
                            modifier = Modifier.defaultMinSize(minHeight = 32.dp)
                        ) {
                            Row(
                                modifier = Modifier.padding(horizontal = 10.dp, vertical = 5.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(4.dp)
                            ) {
                                Icon(
                                    Icons.Default.Tune,
                                    contentDescription = "Sort Options",
                                    modifier = Modifier.size(14.dp),
                                    tint = if (isCustomSort) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant
                                )
                                Text(
                                    text = sortLabel,
                                    fontSize = 11.sp,
                                    fontWeight = FontWeight.SemiBold,
                                    color = if (isCustomSort) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurface
                                )
                            }
                        }

                        DropdownMenu(
                            expanded = showSortMenu,
                            onDismissRequest = { showSortMenu = false },
                            modifier = Modifier.background(Color.White)
                        ) {
                            DropdownMenuItem(
                                leadingIcon = { Icon(Icons.Default.Star, contentDescription = null, modifier = Modifier.size(18.dp), tint = if (selectedSort == "default") MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant) },
                                text = { Text("Default (Recommended)", fontWeight = if (selectedSort == "default") FontWeight.Bold else FontWeight.Normal) },
                                onClick = { selectedSort = "default"; showSortMenu = false }
                            )
                            DropdownMenuItem(
                                leadingIcon = { Icon(Icons.Default.CheckCircle, contentDescription = null, modifier = Modifier.size(18.dp), tint = Color(0xFF16A34A)) },
                                text = { Text("Doctor Inside Clinic First", fontWeight = if (selectedSort == "in_clinic") FontWeight.Bold else FontWeight.Normal) },
                                onClick = { selectedSort = "in_clinic"; showSortMenu = false }
                            )
                            DropdownMenuItem(
                                leadingIcon = { Icon(Icons.Default.Payments, contentDescription = null, modifier = Modifier.size(18.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant) },
                                text = { Text("Consultation Fee (Low to High)", fontWeight = if (selectedSort == "fee_asc") FontWeight.Bold else FontWeight.Normal) },
                                onClick = { selectedSort = "fee_asc"; showSortMenu = false }
                            )
                            DropdownMenuItem(
                                leadingIcon = { Icon(Icons.Default.SortByAlpha, contentDescription = null, modifier = Modifier.size(18.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant) },
                                text = { Text("Name (A to Z)", fontWeight = if (selectedSort == "name") FontWeight.Bold else FontWeight.Normal) },
                                onClick = { selectedSort = "name"; showSortMenu = false }
                            )
                        }
                    }
                }
            }
        }

        Spacer(Modifier.height(10.dp))

        val showDoctorsSection = selectedEntityFilter == "all" || selectedEntityFilter == "doctors"
        val showClinicsSection = selectedEntityFilter == "all" || selectedEntityFilter == "clinics"
        val isNothingFound = (!showDoctorsSection || displayedDoctors.isEmpty()) && (!showClinicsSection || displayedClinics.isEmpty())

        // ── AVAILABLE DOCTORS & CLINICS LIST ──────────────────────────────
        if (isLoadingClinics) {
            // ── RADAR LOADING STATE ─────────────────────────────────────────
            val radarTransition = rememberInfiniteTransition(label = "radarTransition")

            val ring1Scale by radarTransition.animateFloat(
                initialValue = 0.6f, targetValue = 1.9f,
                animationSpec = infiniteRepeatable(
                    animation = tween(2000, easing = LinearOutSlowInEasing),
                    repeatMode = RepeatMode.Restart
                ), label = "ring1Scale"
            )
            val ring1Alpha by radarTransition.animateFloat(
                initialValue = 0.8f, targetValue = 0f,
                animationSpec = infiniteRepeatable(
                    animation = tween(2000, easing = LinearEasing),
                    repeatMode = RepeatMode.Restart
                ), label = "ring1Alpha"
            )
            val ring2Scale by radarTransition.animateFloat(
                initialValue = 0.6f, targetValue = 1.9f,
                animationSpec = infiniteRepeatable(
                    animation = tween(2000, delayMillis = 700, easing = LinearOutSlowInEasing),
                    repeatMode = RepeatMode.Restart
                ), label = "ring2Scale"
            )
            val ring2Alpha by radarTransition.animateFloat(
                initialValue = 0.8f, targetValue = 0f,
                animationSpec = infiniteRepeatable(
                    animation = tween(2000, delayMillis = 700, easing = LinearEasing),
                    repeatMode = RepeatMode.Restart
                ), label = "ring2Alpha"
            )
            val ring3Scale by radarTransition.animateFloat(
                initialValue = 0.6f, targetValue = 1.9f,
                animationSpec = infiniteRepeatable(
                    animation = tween(2000, delayMillis = 1400, easing = LinearOutSlowInEasing),
                    repeatMode = RepeatMode.Restart
                ), label = "ring3Scale"
            )
            val ring3Alpha by radarTransition.animateFloat(
                initialValue = 0.8f, targetValue = 0f,
                animationSpec = infiniteRepeatable(
                    animation = tween(2000, delayMillis = 1400, easing = LinearEasing),
                    repeatMode = RepeatMode.Restart
                ), label = "ring3Alpha"
            )
            val dot1Scale by radarTransition.animateFloat(
                initialValue = 0.5f, targetValue = 1f,
                animationSpec = infiniteRepeatable(
                    animation = tween(600, easing = FastOutSlowInEasing),
                    repeatMode = RepeatMode.Reverse
                ), label = "dot1"
            )
            val dot2Scale by radarTransition.animateFloat(
                initialValue = 0.5f, targetValue = 1f,
                animationSpec = infiniteRepeatable(
                    animation = tween(600, delayMillis = 200, easing = FastOutSlowInEasing),
                    repeatMode = RepeatMode.Reverse
                ), label = "dot2"
            )
            val dot3Scale by radarTransition.animateFloat(
                initialValue = 0.5f, targetValue = 1f,
                animationSpec = infiniteRepeatable(
                    animation = tween(600, delayMillis = 400, easing = FastOutSlowInEasing),
                    repeatMode = RepeatMode.Reverse
                ), label = "dot3"
            )

            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .weight(1f),
                contentAlignment = Alignment.Center
            ) {
                Column(
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(24.dp),
                    modifier = Modifier.padding(horizontal = 32.dp)
                ) {
                    // Radar rings + location icon
                    Box(
                        contentAlignment = Alignment.Center,
                        modifier = Modifier.size(110.dp)
                    ) {
                        listOf(
                            ring1Scale to ring1Alpha,
                            ring2Scale to ring2Alpha,
                            ring3Scale to ring3Alpha
                        ).forEach { (scale, alpha) ->
                            Box(
                                modifier = Modifier
                                    .size(90.dp)
                                    .graphicsLayer {
                                        scaleX = scale
                                        scaleY = scale
                                        this.alpha = alpha
                                    }
                                    .border(
                                        width = 2.dp,
                                        color = Color(0xFF0284C7),
                                        shape = CircleShape
                                    )
                            )
                        }
                        Surface(
                            shape = CircleShape,
                            color = Color(0xFFE0F2FE),
                            border = BorderStroke(2.dp, Color(0xFF0284C7)),
                            modifier = Modifier.size(60.dp)
                        ) {
                            Box(contentAlignment = Alignment.Center) {
                                Icon(
                                    imageVector = Icons.Default.LocationOn,
                                    contentDescription = "Scanning location",
                                    tint = Color(0xFF0284C7),
                                    modifier = Modifier.size(28.dp)
                                )
                            }
                        }
                    }

                    // Text
                    Column(
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.spacedBy(6.dp)
                    ) {
                        Text(
                            text = "Scanning Nearby Doctors",
                            fontSize = 17.sp,
                            fontWeight = FontWeight.ExtraBold,
                            color = Color(0xFF0F172A)
                        )
                        Text(
                            text = if (detectedCityName.isNotBlank()) "$detectedCityName \u2022 Checking clinic availability"
                                else "Checking real-time clinic availability",
                            fontSize = 13.sp,
                            color = Color(0xFF64748B),
                            textAlign = androidx.compose.ui.text.style.TextAlign.Center
                        )
                    }

                    // Bouncing dots
                    Row(
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        listOf(dot1Scale, dot2Scale, dot3Scale).forEach { scale ->
                            Box(
                                modifier = Modifier
                                    .size(10.dp)
                                    .graphicsLayer { scaleX = scale; scaleY = scale }
                                    .background(Color(0xFF0284C7), CircleShape)
                            )
                        }
                    }
                }
            }
        } else if (isNothingFound) {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .weight(1f)
                    .padding(30.dp),
                contentAlignment = Alignment.Center
            ) {
                Column(
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    Icon(
                        Icons.Default.EventBusy,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.primary.copy(alpha = 0.6f),
                        modifier = Modifier.size(52.dp)
                    )
                    Text(
                        "No Matching Doctors or Clinics Found",
                        fontWeight = FontWeight.Bold,
                        fontSize = 16.sp,
                        color = MaterialTheme.colorScheme.onSurface
                    )
                    Text(
                        if (effectiveQuery.isNotBlank())
                            "No doctor or clinic matches '$effectiveQuery'. Try searching Skin, Heart, Dental, or Orthopedics."
                        else
                            "Try selecting another date or location.",
                        fontSize = 12.sp,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        textAlign = androidx.compose.ui.text.style.TextAlign.Center
                    )
                }
            }
        } else {
            val showScrollToTop by remember {
                derivedStateOf { clinicListState.firstVisibleItemIndex > 1 }
            }
            Box(modifier = Modifier.fillMaxWidth().weight(1f)) {
            val isDefaultStream = selectedEntityFilter == "all" && searchQuery.isBlank() && activeCategoryFilter == null
            val inClinicDoctors = remember(allDoctors) {
                allDoctors.filter { it.doctor.isInClinic == true }
            }
            val categoryPairs = remember { HOME_SPECIALIST_AND_LAB_CATEGORIES.chunked(2) }
            val opdClinics = remember(displayedClinics) {
                val nonLabs = displayedClinics.filter { it.first.clinic.type != "diagnostic_lab" }
                if (nonLabs.isNotEmpty()) nonLabs else displayedClinics
            }
            val diagnosticLabs = remember(displayedClinics) {
                displayedClinics.filter {
                    it.first.clinic.type == "diagnostic_lab" ||
                    it.first.services.any { s ->
                        val n = s.serviceName.lowercase(java.util.Locale.ROOT)
                        n.contains("scan") || n.contains("test") || n.contains("lab") || n.contains("ray") || n.contains("mri") || n.contains("usg")
                    }
                }
            }

            LazyColumn(
                state = clinicListState,
                contentPadding = PaddingValues(start = 20.dp, end = 20.dp, bottom = 24.dp),
                verticalArrangement = Arrangement.spacedBy(14.dp),
                modifier = Modifier.fillMaxSize()
            ) {
                // ── 1. URGENT CARE IN-CLINIC DOCTOR CAROUSEL ──────────────────────────────────────────────────────────
                if (inClinicDoctors.isNotEmpty() && activeCategoryFilter == null && searchQuery.isBlank() && selectedEntityFilter != "clinics") {
                    item(key = "section_in_clinic_carousel") {
                        val infiniteTransition = rememberInfiniteTransition(label = "pulse")
                        val pulseAlpha by infiniteTransition.animateFloat(
                            initialValue = 0.4f,
                            targetValue = 1f,
                            animationSpec = infiniteRepeatable(
                                animation = tween(900, easing = LinearEasing),
                                repeatMode = RepeatMode.Reverse
                            ),
                            label = "pulseAlpha"
                        )

                        Column(modifier = Modifier.fillMaxWidth().padding(top = 2.dp)) {
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(bottom = 10.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.SpaceBetween
                            ) {
                                Row(
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                                ) {
                                    Box(
                                        modifier = Modifier
                                            .size(10.dp)
                                            .background(Color(0xFF10B981).copy(alpha = pulseAlpha), CircleShape)
                                    )
                                    Text(
                                        text = "In Clinic Right Now",
                                        fontSize = 15.sp,
                                        fontWeight = FontWeight.ExtraBold,
                                        color = Color(0xFF0F172A)
                                    )
                                }
                                Surface(
                                    shape = RoundedCornerShape(10.dp),
                                    color = Color(0xFFDCFCE7),
                                    border = BorderStroke(1.dp, Color(0xFF86EFAC))
                                ) {
                                    Text(
                                        text = "Walk-In Available",
                                        fontSize = 10.sp,
                                        fontWeight = FontWeight.Bold,
                                        color = Color(0xFF15803D),
                                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp)
                                    )
                                }
                            }

                            LazyRow(
                                horizontalArrangement = Arrangement.spacedBy(10.dp),
                                modifier = Modifier.fillMaxWidth()
                            ) {
                                items(inClinicDoctors, key = { "inclinic_${it.doctor.id}" }) { docItem ->
                                    val doc = docItem.doctor
                                    val clinic = docItem.practicingClinics.firstOrNull()
                                    val distKm = if (userLatitude != null && userLongitude != null && clinic != null) {
                                        calculateDistanceKm(userLatitude!!, userLongitude!!, clinic.latitude ?: 27.7052, clinic.longitude ?: 85.3193)
                                    } else null
                                    val distStr = if (distKm != null) String.format(java.util.Locale.US, " \u2022 %.1f km", distKm) else ""

                                    Card(
                                        shape = RoundedCornerShape(16.dp),
                                        colors = CardDefaults.cardColors(containerColor = Color.White),
                                        border = BorderStroke(1.dp, Color(0xFF86EFAC)),
                                        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp),
                                        modifier = Modifier
                                            .width(185.dp)
                                            .clickable { selectedDoctorForClinicPicker = docItem }
                                    ) {
                                        Column(
                                            modifier = Modifier.padding(12.dp),
                                            verticalArrangement = Arrangement.spacedBy(8.dp)
                                        ) {
                                            Row(
                                                modifier = Modifier.fillMaxWidth(),
                                                verticalAlignment = Alignment.CenterVertically,
                                                horizontalArrangement = Arrangement.SpaceBetween
                                            ) {
                                                Surface(
                                                    shape = CircleShape,
                                                    color = Color(0xFFE0F2FE),
                                                    border = BorderStroke(1.5.dp, Color(0xFF0284C7)),
                                                    modifier = Modifier.size(40.dp)
                                                ) {
                                                    val avatarUrl = doc.resolvedProfilePictureUrl
                                                    if (!avatarUrl.isNullOrBlank()) {
                                                        coil.compose.AsyncImage(
                                                            model = avatarUrl,
                                                            contentDescription = doc.fullName,
                                                            contentScale = androidx.compose.ui.layout.ContentScale.Crop,
                                                            modifier = Modifier.fillMaxSize()
                                                        )
                                                    } else {
                                                        val initials = doc.fullName.split(" ")
                                                            .filter { it.isNotBlank() }
                                                            .take(2)
                                                            .mapNotNull { it.firstOrNull()?.uppercaseChar() }
                                                            .joinToString("")
                                                            .ifBlank { "DR" }
                                                        Box(contentAlignment = Alignment.Center) {
                                                            Text(
                                                                text = initials,
                                                                fontSize = 13.sp,
                                                                fontWeight = FontWeight.Bold,
                                                                color = Color(0xFF0284C7)
                                                            )
                                                        }
                                                    }
                                                }
                                                Surface(
                                                    shape = RoundedCornerShape(6.dp),
                                                    color = Color(0xFFDCFCE7)
                                                ) {
                                                    Text(
                                                        text = "Present",
                                                        fontSize = 9.sp,
                                                        fontWeight = FontWeight.Bold,
                                                        color = Color(0xFF15803D),
                                                        modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
                                                    )
                                                }
                                            }

                                            Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                                                Text(
                                                    text = "Dr. ${doc.fullName}",
                                                    fontSize = 13.sp,
                                                    fontWeight = FontWeight.Bold,
                                                    color = Color(0xFF0F172A),
                                                    maxLines = 1,
                                                    overflow = TextOverflow.Ellipsis
                                                )
                                                Text(
                                                    text = doc.specialty ?: "Specialist",
                                                    fontSize = 11.sp,
                                                    fontWeight = FontWeight.SemiBold,
                                                    color = Color(0xFF0284C7),
                                                    maxLines = 1,
                                                    overflow = TextOverflow.Ellipsis
                                                )
                                                Text(
                                                    text = "${clinic?.name ?: "Partner Clinic"}$distStr",
                                                    fontSize = 9.5.sp,
                                                    color = Color(0xFF64748B),
                                                    maxLines = 1,
                                                    overflow = TextOverflow.Ellipsis
                                                )
                                            }

                                            HorizontalDivider(color = Color(0xFFF1F5F9))

                                            Row(
                                                modifier = Modifier.fillMaxWidth(),
                                                verticalAlignment = Alignment.CenterVertically,
                                                horizontalArrangement = Arrangement.SpaceBetween
                                            ) {
                                                Text(
                                                    text = CurrencyFormatter.formatNPR(doc.consultationFee ?: 500.0),
                                                    fontSize = 11.5.sp,
                                                    fontWeight = FontWeight.ExtraBold,
                                                    color = Color(0xFF0F172A)
                                                )
                                                Surface(
                                                    shape = RoundedCornerShape(8.dp),
                                                    color = Color(0xFF16A34A),
                                                    modifier = Modifier.clickable { selectedDoctorForClinicPicker = docItem }
                                                ) {
                                                    Text(
                                                        text = "Walk In",
                                                        fontSize = 10.5.sp,
                                                        fontWeight = FontWeight.Bold,
                                                        color = Color.White,
                                                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
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

                // ── 2. ALL 22 COMMON CONSULTATIONS & DIAGNOSTICS (2-ROW HORIZONTAL SCROLL) ────────
                if (searchQuery.isBlank()) {
                    item(key = "section_common_consultations") {
                        Column(modifier = Modifier.fillMaxWidth().padding(top = 2.dp)) {
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(bottom = 8.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.SpaceBetween
                            ) {
                                Text(
                                    text = "Consultations & Diagnostics",
                                    fontSize = 15.sp,
                                    fontWeight = FontWeight.ExtraBold,
                                    color = Color(0xFF0F172A)
                                )
                                Text(
                                    text = "Scroll across",
                                    fontSize = 10.5.sp,
                                    fontWeight = FontWeight.Bold,
                                    color = Color(0xFF0284C7)
                                )
                            }

                            LazyRow(
                                horizontalArrangement = Arrangement.spacedBy(8.dp),
                                modifier = Modifier.fillMaxWidth()
                            ) {
                                items(categoryPairs) { pair ->
                                    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                        pair.forEach { cat ->
                                            val isSelected = activeCategoryFilter?.equals(cat.searchTerm, ignoreCase = true) == true
                                            Surface(
                                                shape = RoundedCornerShape(12.dp),
                                                color = if (isSelected) Color(0xFF0284C7) else Color.White,
                                                border = BorderStroke(
                                                    1.dp,
                                                    if (isSelected) Color(0xFF0284C7) else Color(0xFFE2E8F0)
                                                ),
                                                shadowElevation = if (isSelected) 2.dp else 0.5.dp,
                                                modifier = Modifier
                                                    .widthIn(min = 152.dp, max = 175.dp)
                                                    .clickable {
                                                        activeCategoryFilter = if (isSelected) null else cat.searchTerm
                                                    }
                                            ) {
                                                Row(
                                                    modifier = Modifier.padding(horizontal = 10.dp, vertical = 7.dp),
                                                    verticalAlignment = Alignment.CenterVertically,
                                                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                                                ) {
                                                    Surface(
                                                        shape = RoundedCornerShape(8.dp),
                                                        color = if (isSelected) Color.White.copy(alpha = 0.2f) else if (cat.isLab) Color(0xFFF3E8FF) else Color(0xFFE0F2FE),
                                                        modifier = Modifier.size(30.dp)
                                                    ) {
                                                        Box(contentAlignment = Alignment.Center) {
                                                            Icon(
                                                                cat.icon,
                                                                contentDescription = null,
                                                                tint = if (isSelected) Color.White else if (cat.isLab) Color(0xFF9333EA) else Color(0xFF0284C7),
                                                                modifier = Modifier.size(16.dp)
                                                            )
                                                        }
                                                    }
                                                    Column(modifier = Modifier.weight(1f)) {
                                                        Text(
                                                            text = cat.title,
                                                            fontSize = 11.sp,
                                                            fontWeight = FontWeight.Bold,
                                                            color = if (isSelected) Color.White else Color(0xFF0F172A),
                                                            maxLines = 1,
                                                            overflow = TextOverflow.Ellipsis
                                                        )
                                                        Text(
                                                            text = cat.subtitle,
                                                            fontSize = 9.sp,
                                                            fontWeight = FontWeight.Medium,
                                                            color = if (isSelected) Color.White.copy(alpha = 0.85f) else Color(0xFF64748B),
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
                        }
                    }
                }

                // ── ACTIVE CATEGORY FILTER CHIP BAR ──────────────────────────────────────────────────────────────────
                if (activeCategoryFilter != null) {
                    item(key = "section_active_filter_banner") {
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(vertical = 4.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.SpaceBetween
                        ) {
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(6.dp)
                            ) {
                                Text("Filtered by:", fontSize = 12.sp, color = Color(0xFF64748B))
                                Surface(
                                    shape = RoundedCornerShape(12.dp),
                                    color = Color(0xFFE0F2FE),
                                    border = BorderStroke(1.dp, Color(0xFF0284C7))
                                ) {
                                    Row(
                                        verticalAlignment = Alignment.CenterVertically,
                                        modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp),
                                        horizontalArrangement = Arrangement.spacedBy(6.dp)
                                    ) {
                                        Text(
                                            text = activeCategoryFilter ?: "",
                                            fontSize = 11.5.sp,
                                            fontWeight = FontWeight.Bold,
                                            color = Color(0xFF0284C7)
                                        )
                                        Icon(
                                            Icons.Default.Close,
                                            contentDescription = "Clear",
                                            modifier = Modifier
                                                .size(14.dp)
                                                .clickable { activeCategoryFilter = null },
                                            tint = Color(0xFF0284C7)
                                        )
                                    }
                                }
                            }
                            TextButton(
                                onClick = { activeCategoryFilter = null },
                                contentPadding = PaddingValues(horizontal = 8.dp, vertical = 0.dp)
                            ) {
                                Text("Clear All", fontSize = 11.sp, color = Color(0xFFDC2626), fontWeight = FontWeight.Bold)
                            }
                        }
                    }
                }

                // ── MAIN STREAM (DISCOVERY VS FILTERED) ──────────────────────────────────────────────────────────────
                if (isDefaultStream) {
                    // ── 3. DOCTORS AVAILABLE TODAY ───────────────────────────────────────────────────────────────────────
                    if (displayedDoctors.isNotEmpty()) {
                        item(key = "header_doctors_today") {
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(top = 4.dp, bottom = 2.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.SpaceBetween
                            ) {
                                Row(
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(6.dp)
                                ) {
                                    Icon(Icons.Default.MedicalServices, contentDescription = null, tint = Color(0xFF0284C7), modifier = Modifier.size(18.dp))
                                    Text(
                                        text = "Doctors Available Today",
                                        fontSize = 15.sp,
                                        fontWeight = FontWeight.ExtraBold,
                                        color = Color(0xFF0F172A)
                                    )
                                }
                                if (displayedDoctors.size > 3) {
                                    Text(
                                        text = "View All (${displayedDoctors.size})",
                                        fontSize = 11.5.sp,
                                        fontWeight = FontWeight.Bold,
                                        color = Color(0xFF0284C7),
                                        modifier = Modifier.clickable { selectedEntityFilter = "doctors" }
                                    )
                                }
                            }
                        }

                        items(displayedDoctors.take(3), key = { "doc_${it.first.doctor.id}" }) { (docItem, matchResult) ->
                            PatientHomeDoctorCard(
                                docItem = docItem,
                                matchResult = matchResult,
                                allClinics = allClinics,
                                clinicsNextAvailableDates = clinicsNextAvailableDates,
                                selectedDate = selectedDate,
                                userLatitude = userLatitude,
                                userLongitude = userLongitude,
                                searchQuery = searchQuery,
                                onSelectDoctorToBook = { selectedDoctorForClinicPicker = it }
                            )
                        }
                    }

                    // ── 4. LIVE OPD CLINICS & HOSPITALS ──────────────────────────────────────────────────────────────────
                    if (opdClinics.isNotEmpty()) {
                        item(key = "header_clinics_today") {
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(top = 10.dp, bottom = 2.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.SpaceBetween
                            ) {
                                Row(
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(6.dp)
                                ) {
                                    Icon(Icons.Default.LocalHospital, contentDescription = null, tint = Color(0xFF0891B2), modifier = Modifier.size(18.dp))
                                    Text(
                                        text = "Live OPD Clinics & Hospitals",
                                        fontSize = 15.sp,
                                        fontWeight = FontWeight.ExtraBold,
                                        color = Color(0xFF0F172A)
                                    )
                                }
                                if (displayedClinics.size > 3) {
                                    Text(
                                        text = "View All (${displayedClinics.size})",
                                        fontSize = 11.5.sp,
                                        fontWeight = FontWeight.Bold,
                                        color = Color(0xFF0891B2),
                                        modifier = Modifier.clickable { selectedEntityFilter = "clinics" }
                                    )
                                }
                            }
                        }

                        items(opdClinics.take(3), key = { "clinic_${it.first.clinic.id}" }) { (item, matchResult) ->
                            PatientHomeClinicCard(
                                item = item,
                                matchResult = matchResult,
                                clinicsNextAvailableDates = clinicsNextAvailableDates,
                                selectedDate = selectedDate,
                                userLatitude = userLatitude,
                                userLongitude = userLongitude,
                                searchQuery = searchQuery,
                                onNavigateToClinic = { clinicId ->
                                    navController.navigate(NavRoutes.ClinicDetail.createRoute(clinicId))
                                },
                                onCallClinic = { phone ->
                                    if (phone.isNotBlank()) {
                                        try {
                                            val intent = android.content.Intent(android.content.Intent.ACTION_DIAL, android.net.Uri.parse("tel:$phone"))
                                            context.startActivity(intent)
                                        } catch (_: Exception) {}
                                    }
                                }
                            )
                        }
                    }

                    // ── 5. DIAGNOSTIC SCANS & PATHOLOGY LABS ─────────────────────────────────────────────────────────────
                    if (diagnosticLabs.isNotEmpty()) {
                        item(key = "header_diagnostic_labs") {
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(top = 10.dp, bottom = 2.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(6.dp)
                            ) {
                                Icon(Icons.Default.Biotech, contentDescription = null, tint = Color(0xFF9333EA), modifier = Modifier.size(18.dp))
                                Text(
                                    text = "Diagnostic Scans & Pathology Labs",
                                    fontSize = 15.sp,
                                    fontWeight = FontWeight.ExtraBold,
                                    color = Color(0xFF0F172A)
                                )
                            }
                        }

                        items(diagnosticLabs.take(2), key = { "lab_${it.first.clinic.id}" }) { (item, matchResult) ->
                            PatientHomeClinicCard(
                                item = item,
                                matchResult = matchResult,
                                clinicsNextAvailableDates = clinicsNextAvailableDates,
                                selectedDate = selectedDate,
                                userLatitude = userLatitude,
                                userLongitude = userLongitude,
                                searchQuery = searchQuery,
                                onNavigateToClinic = { clinicId ->
                                    navController.navigate(NavRoutes.ClinicDetail.createRoute(clinicId))
                                },
                                onCallClinic = { phone ->
                                    if (phone.isNotBlank()) {
                                        try {
                                            val intent = android.content.Intent(android.content.Intent.ACTION_DIAL, android.net.Uri.parse("tel:$phone"))
                                            context.startActivity(intent)
                                        } catch (_: Exception) {}
                                    }
                                }
                            )
                        }
                    }
                } else {
                    // ── FILTERED OR SEARCH RESULTS FEED ──────────────────────────────────────────────────────────────────
                    if (showDoctorsSection && displayedDoctors.isNotEmpty()) {
                        item(key = "header_matching_doctors") {
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(6.dp),
                                modifier = Modifier.padding(top = 4.dp, bottom = 2.dp)
                            ) {
                                Icon(Icons.Default.MedicalServices, contentDescription = null, tint = Color(0xFF0284C7), modifier = Modifier.size(18.dp))
                                Text(
                                    text = if (activeCategoryFilter != null) "$activeCategoryFilter Specialists (${displayedDoctors.size})" else "Matching Doctors (${displayedDoctors.size})",
                                    fontSize = 15.sp,
                                    fontWeight = FontWeight.ExtraBold,
                                    color = Color(0xFF0F172A)
                                )
                            }
                        }

                        items(displayedDoctors, key = { "doc_${it.first.doctor.id}" }) { (docItem, matchResult) ->
                            PatientHomeDoctorCard(
                                docItem = docItem,
                                matchResult = matchResult,
                                allClinics = allClinics,
                                clinicsNextAvailableDates = clinicsNextAvailableDates,
                                selectedDate = selectedDate,
                                userLatitude = userLatitude,
                                userLongitude = userLongitude,
                                searchQuery = searchQuery,
                                onSelectDoctorToBook = { selectedDoctorForClinicPicker = it }
                            )
                        }
                    }

                    if (showClinicsSection && displayedClinics.isNotEmpty()) {
                        item(key = "header_matching_clinics") {
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(6.dp),
                                modifier = Modifier.padding(top = 10.dp, bottom = 2.dp)
                            ) {
                                Icon(Icons.Default.LocalHospital, contentDescription = null, tint = Color(0xFF0891B2), modifier = Modifier.size(18.dp))
                                Text(
                                    text = if (activeCategoryFilter != null) "$activeCategoryFilter Centers & Labs (${displayedClinics.size})" else "Matching Clinics (${displayedClinics.size})",
                                    fontSize = 15.sp,
                                    fontWeight = FontWeight.ExtraBold,
                                    color = Color(0xFF0F172A)
                                )
                            }
                        }

                        items(displayedClinics, key = { "clinic_${it.first.clinic.id}" }) { (item, matchResult) ->
                            PatientHomeClinicCard(
                                item = item,
                                matchResult = matchResult,
                                clinicsNextAvailableDates = clinicsNextAvailableDates,
                                selectedDate = selectedDate,
                                userLatitude = userLatitude,
                                userLongitude = userLongitude,
                                searchQuery = searchQuery,
                                onNavigateToClinic = { clinicId ->
                                    navController.navigate(NavRoutes.ClinicDetail.createRoute(clinicId))
                                },
                                onCallClinic = { phone ->
                                    if (phone.isNotBlank()) {
                                        try {
                                            val intent = android.content.Intent(android.content.Intent.ACTION_DIAL, android.net.Uri.parse("tel:$phone"))
                                            context.startActivity(intent)
                                        } catch (_: Exception) {}
                                    }
                                }
                            )
                        }
                    }
                }
            }

            // ── SMOOTH SCROLL TO TOP FLOATING BUTTON ──
            androidx.compose.animation.AnimatedVisibility(
                visible = showScrollToTop,
                enter = androidx.compose.animation.fadeIn() + androidx.compose.animation.scaleIn(),
                exit = androidx.compose.animation.fadeOut() + androidx.compose.animation.scaleOut(),
                modifier = Modifier
                    .align(Alignment.BottomEnd)
                    .padding(end = 20.dp, bottom = 24.dp)
            ) {
                FloatingActionButton(
                    onClick = {
                        coroutineScope.launch {
                            isDateAndSortVisible = true
                            clinicListState.animateScrollToItem(0)
                        }
                    },
                    containerColor = Color(0xFF0284C7),
                    contentColor = Color.White,
                    shape = CircleShape,
                    elevation = FloatingActionButtonDefaults.elevation(defaultElevation = 6.dp)
                ) {
                    Icon(
                        Icons.Default.KeyboardArrowUp,
                        contentDescription = "Scroll to Top",
                        modifier = Modifier.size(28.dp)
                    )
                }
            }
        }
    }

    // ── SELECT CLINIC FOR DOCTOR BOOKING DIALOG ───────────────────────────
    if (selectedDoctorForClinicPicker != null) {
        val docItem = selectedDoctorForClinicPicker!!
        val doctor = docItem.doctor
        val dateStr = selectedDate.toString()
        val clinicsForDoctor = remember(docItem) {
            docItem.practicingClinics
        }

        AlertDialog(
            onDismissRequest = { selectedDoctorForClinicPicker = null },
            title = {
                Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text(
                        text = "Select Clinic to Book",
                        fontWeight = FontWeight.ExtraBold,
                        fontSize = 18.sp,
                        color = Color(0xFF0F172A)
                    )
                    Text(
                        text = "Dr. ${doctor.fullName} \u2022 ${doctor.specialty ?: "Specialist"}",
                        fontSize = 13.sp,
                        fontWeight = FontWeight.SemiBold,
                        color = Color(0xFF0284C7)
                    )
                }
            },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    if (clinicsForDoctor.isEmpty()) {
                        Surface(
                            shape = RoundedCornerShape(12.dp),
                            color = Color(0xFFF1F5F9),
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Column(
                                modifier = Modifier.padding(16.dp),
                                horizontalAlignment = Alignment.CenterHorizontally,
                                verticalArrangement = Arrangement.spacedBy(8.dp)
                            ) {
                                Icon(
                                    Icons.Default.DomainDisabled,
                                    contentDescription = null,
                                    tint = Color(0xFF64748B),
                                    modifier = Modifier.size(32.dp)
                                )
                                Text(
                                    text = "Not Affiliated",
                                    fontWeight = FontWeight.Bold,
                                    fontSize = 14.sp,
                                    color = Color(0xFF0F172A)
                                )
                                Text(
                                    text = "Dr. ${doctor.fullName} is currently not affiliated with any active clinic.",
                                    fontSize = 12.sp,
                                    color = Color(0xFF64748B),
                                    textAlign = androidx.compose.ui.text.style.TextAlign.Center
                                )
                            }
                        }
                    } else {
                        Text(
                            text = "Choose the clinic where you want to book your appointment with Dr. ${doctor.fullName}:",
                            fontSize = 12.sp,
                            color = Color(0xFF64748B)
                        )

                        LazyColumn(
                            modifier = Modifier.heightIn(max = 320.dp),
                            verticalArrangement = Arrangement.spacedBy(10.dp)
                        ) {
                        items(clinicsForDoctor, key = { it.id }) { clinic ->
                            Card(
                                shape = RoundedCornerShape(14.dp),
                                colors = CardDefaults.cardColors(containerColor = Color(0xFFF8FAFC)),
                                border = BorderStroke(1.dp, Color(0xFFCBD5E1)),
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .clickable {
                                        selectedDoctorForClinicPicker = null
                                        val isDemo = sessionManager?.isGuestMode() == true || sessionManager?.isLoggedIn() != true
                                        val targetRoute = NavRoutes.Booking.createRoute(
                                            clinicId = clinic.id,
                                            doctorId = doctor.id,
                                            date = dateStr
                                        )
                                        if (isDemo) {
                                            sessionManager?.savePendingBookingRedirect(
                                                route = targetRoute,
                                                clinicId = clinic.id,
                                                doctorId = doctor.id,
                                                selectedDate = dateStr
                                            )
                                            Toast.makeText(context, "Please sign in with Google to book an appointment", Toast.LENGTH_SHORT).show()
                                            navController.navigate(NavRoutes.Login.route)
                                        } else {
                                            navController.navigate(targetRoute)
                                        }
                                    }
                            ) {
                                Row(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .padding(14.dp),
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(12.dp)
                                ) {
                                    Surface(
                                        shape = RoundedCornerShape(10.dp),
                                        color = Color(0xFFE0F2FE),
                                        modifier = Modifier.size(42.dp)
                                    ) {
                                        Box(contentAlignment = Alignment.Center) {
                                            Icon(
                                                Icons.Default.LocalHospital,
                                                contentDescription = null,
                                                tint = Color(0xFF0284C7),
                                                modifier = Modifier.size(22.dp)
                                            )
                                        }
                                    }

                                    Column(modifier = Modifier.weight(1f)) {
                                        Text(
                                            text = clinic.name,
                                            fontWeight = FontWeight.Bold,
                                            fontSize = 14.sp,
                                            color = Color(0xFF0F172A)
                                        )
                                        Text(
                                            text = clinic.addressText ?: "Kathmandu, Nepal",
                                            fontSize = 12.sp,
                                            color = Color(0xFF64748B),
                                            maxLines = 1,
                                            overflow = TextOverflow.Ellipsis
                                        )
                                        Text(
                                            text = "Fee: ${CurrencyFormatter.formatNPR(doctor.consultationFee ?: 500.0)}",
                                            fontSize = 11.sp,
                                            fontWeight = FontWeight.Bold,
                                            color = Color(0xFF0284C7)
                                        )
                                    }

                                    val hasSlotForDoc = remember(clinic, doctor, allClinics, selectedDate) {
                                        val slots = allClinics.firstOrNull { it.clinic.id == clinic.id }?.availableSlots ?: emptyList()
                                        slots.any { s ->
                                            s.isPublished && (s.doctorId == doctor.id || s.doctorId.isNullOrBlank()) &&
                                                (s.maxCapacity - s.bookedCount) > 0 &&
                                                !com.dactor.patient.data.repository.SlotRepository.isSlotEndTimeOver(s.endTime, dateStr, s.startTime)
                                        }
                                    }

                                    Button(
                                        onClick = {
                                            selectedDoctorForClinicPicker = null
                                            val isDemo = sessionManager?.isGuestMode() == true || sessionManager?.isLoggedIn() != true
                                            val targetRoute = NavRoutes.Booking.createRoute(
                                                clinicId = clinic.id,
                                                doctorId = doctor.id,
                                                date = dateStr
                                            )
                                            if (isDemo) {
                                                sessionManager?.savePendingBookingRedirect(
                                                    route = targetRoute,
                                                    clinicId = clinic.id,
                                                    doctorId = doctor.id,
                                                    selectedDate = dateStr
                                                )
                                                Toast.makeText(context, "Please sign in with Google to book an appointment", Toast.LENGTH_SHORT).show()
                                                navController.navigate(NavRoutes.Login.route)
                                            } else {
                                                navController.navigate(targetRoute)
                                            }
                                        },
                                        shape = RoundedCornerShape(10.dp),
                                        colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF0284C7)),
                                        contentPadding = PaddingValues(horizontal = 12.dp, vertical = 6.dp),
                                        modifier = Modifier.height(36.dp)
                                    ) {
                                        Text("Book", fontSize = 12.sp, fontWeight = FontWeight.Bold)
                                    }
                                }
                            }
                        }
                    }
                }
            }
        },
        confirmButton = {
            TextButton(onClick = { selectedDoctorForClinicPicker = null }) {
                Text("Cancel")
            }
        }
    )
}

    // ── LOCATION SELECTOR DIALOG ──────────────────────────────────────────
    if (showLocationDialog) {
        AlertDialog(
            onDismissRequest = { showLocationDialog = false },
            title = { Text("Select Location in Nepal", fontWeight = FontWeight.Bold) },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Surface(
                        shape = RoundedCornerShape(12.dp),
                        color = MaterialTheme.colorScheme.primaryContainer,
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable {
                                val hasFine = ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
                                val hasCoarse = ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED
                                if (hasFine || hasCoarse) {
                                    fetchCurrentLocation(
                                        context = context,
                                        onLocationDisabled = {
                                            showLocationDialog = false
                                            showEnableGpsDialog = true
                                        }
                                    ) { lat, lng, label, city ->
                                        userLatitude = lat
                                        userLongitude = lng
                                        selectedLocation = label
                                        detectedCityName = city
                                        isLiveGpsActive = true
                                        showLocationDialog = false
                                        Toast.makeText(context, "Live Location: $city matched", Toast.LENGTH_SHORT).show()
                                    }
                                } else {
                                    locationPermissionLauncher.launch(
                                        arrayOf(
                                            Manifest.permission.ACCESS_FINE_LOCATION,
                                            Manifest.permission.ACCESS_COARSE_LOCATION
                                        )
                                    )
                                }
                            }
                    ) {
                        Row(
                            modifier = Modifier.padding(horizontal = 14.dp, vertical = 12.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(10.dp)
                        ) {
                            Icon(
                                Icons.Default.MyLocation,
                                contentDescription = null,
                                tint = MaterialTheme.colorScheme.primary,
                                modifier = Modifier.size(20.dp)
                            )
                            Column {
                                Text(
                                    text = "Use Current Location (GPS)",
                                    fontWeight = FontWeight.Bold,
                                    fontSize = 14.sp,
                                    color = MaterialTheme.colorScheme.onPrimaryContainer
                                )
                                Text(
                                    text = "Find clinics nearest to you right now",
                                    fontSize = 11.sp,
                                    color = MaterialTheme.colorScheme.onPrimaryContainer.copy(alpha = 0.7f)
                                )
                            }
                        }
                    }

                    Surface(
                        shape = RoundedCornerShape(12.dp),
                        color = MaterialTheme.colorScheme.secondaryContainer.copy(alpha = 0.7f),
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable {
                                showLocationDialog = false
                                showMapPicker = true
                            }
                    ) {
                        Row(
                            modifier = Modifier.padding(horizontal = 14.dp, vertical = 12.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(10.dp)
                        ) {
                            Icon(
                                Icons.Default.Map,
                                contentDescription = null,
                                tint = MaterialTheme.colorScheme.secondary,
                                modifier = Modifier.size(20.dp)
                            )
                            Column {
                                Text(
                                    text = "Pick Location on Free Map",
                                    fontWeight = FontWeight.Bold,
                                    fontSize = 14.sp,
                                    color = MaterialTheme.colorScheme.onSecondaryContainer
                                )
                                Text(
                                    text = "Tap on interactive map to set your exact location",
                                    fontSize = 11.sp,
                                    color = MaterialTheme.colorScheme.onSecondaryContainer.copy(alpha = 0.7f)
                                )
                            }
                        }
                    }

                    HorizontalDivider(modifier = Modifier.padding(vertical = 4.dp))

                    LazyColumn(
                        modifier = Modifier.heightIn(max = 280.dp),
                        verticalArrangement = Arrangement.spacedBy(4.dp)
                    ) {
                        items(NEPAL_MAJOR_LOCATIONS) { loc ->
                            Surface(
                                shape = RoundedCornerShape(8.dp),
                                color = if (selectedLocation == loc && !isLiveGpsActive) MaterialTheme.colorScheme.primaryContainer else Color.Transparent,
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .clickable {
                                        selectedLocation = loc
                                        isLiveGpsActive = false
                                        showLocationDialog = false
                                    }
                            ) {
                                Row(
                                    modifier = Modifier.padding(horizontal = 12.dp, vertical = 10.dp),
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.SpaceBetween
                                ) {
                                    Text(
                                        text = loc,
                                        fontWeight = if (selectedLocation == loc && !isLiveGpsActive) FontWeight.Bold else FontWeight.Normal,
                                        fontSize = 14.sp
                                    )
                                    if (selectedLocation == loc && !isLiveGpsActive) {
                                        Icon(Icons.Default.Check, contentDescription = null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(18.dp))
                                    }
                                }
                            }
                        }
                    }
                }
            },
            confirmButton = {
                TextButton(onClick = { showLocationDialog = false }) {
                    Text("Close")
                }
            }
        )
    }

    if (showMapPicker) {
        com.dactor.patient.ui.components.OpenStreetMapPicker(
            initialAddress = selectedLocation,
            initialLat = userLatitude ?: 27.7052,
            initialLng = userLongitude ?: 85.3193,
            onSaveLocation = { address, lat, lng ->
                userLatitude = lat
                userLongitude = lng
                selectedLocation = address
                isLiveGpsActive = true
                showMapPicker = false
                Toast.makeText(context, "Location set on Map: $address", Toast.LENGTH_SHORT).show()
            },
            onDismiss = { showMapPicker = false }
        )
    }

    if (showEnableGpsDialog) {
        AlertDialog(
            onDismissRequest = { showEnableGpsDialog = false },
            icon = { Icon(Icons.Default.MyLocation, contentDescription = null, tint = MaterialTheme.colorScheme.primary) },
            title = { Text("Enable Device Location", fontWeight = FontWeight.Bold) },
            text = {
                Text(
                    "Your phone's GPS / Location Services are turned off. Please turn on Location Services so Dactor can automatically find clinics near you.",
                    fontSize = 13.sp
                )
            },
            confirmButton = {
                Button(onClick = {
                    showEnableGpsDialog = false
                    try {
                        gpsSettingsLauncher.launch(android.content.Intent(android.provider.Settings.ACTION_LOCATION_SOURCE_SETTINGS))
                    } catch (e: Exception) {
                        context.startActivity(android.content.Intent(android.provider.Settings.ACTION_LOCATION_SOURCE_SETTINGS))
                    }
                }) {
                    Text("Turn On Location")
                }
            },
            dismissButton = {
                TextButton(onClick = { showEnableGpsDialog = false }) {
                    Text("Not Now")
                }
            }
        )
    }
}
}

// =========================================================================
@Composable
private fun PatientHomeDoctorCard(
    docItem: DoctorHomeItem,
    matchResult: com.dactor.patient.util.SearchMatchResult,
    allClinics: List<ClinicHomeItem>,
    clinicsNextAvailableDates: Map<String, String>,
    selectedDate: java.time.LocalDate,
    userLatitude: Double?,
    userLongitude: Double?,
    searchQuery: String,
    onSelectDoctorToBook: (DoctorHomeItem) -> Unit
) {
    val doctor = docItem.doctor
    val clinicsForDoc = docItem.practicingClinics
    val primaryClinic = clinicsForDoc.firstOrNull()
    val allDocSpecs = remember(doctor) {
        (listOfNotNull(doctor.specialty?.takeIf { it.isNotBlank() }) + doctor.specialties).distinct()
            .ifEmpty { listOf("General Physician") }
    }

    val distKm = if (userLatitude != null && userLongitude != null && primaryClinic != null) {
        calculateDistanceKm(userLatitude, userLongitude, primaryClinic.latitude ?: 27.7052, primaryClinic.longitude ?: 85.3193)
    } else null
    val distText = if (distKm != null) String.format(java.util.Locale.US, " \u2022 %.1f km away", distKm) else ""

    val earliestSlot = remember(docItem, allClinics, selectedDate) {
        val dateStr = selectedDate.toString()
        clinicsForDoc.flatMap { c ->
            allClinics.firstOrNull { it.clinic.id == c.id }?.availableSlots ?: emptyList()
        }.filter { s ->
            s.isPublished && (s.doctorId == doctor.id || s.doctorId.isNullOrBlank()) &&
                (s.maxCapacity - s.bookedCount) > 0 &&
                !com.dactor.patient.data.repository.SlotRepository.isSlotEndTimeOver(s.endTime, dateStr, s.startTime)
        }.minByOrNull { it.startTime }
    }
    val slotText = if (earliestSlot != null) {
        "Today, ${earliestSlot.startTime}"
    } else {
        val nextDate = clinicsForDoc.mapNotNull { clinicsNextAvailableDates[it.id] }.minOrNull()
        if (!nextDate.isNullOrBlank()) {
            com.dactor.patient.data.repository.SlotRepository.formatNextAvailableDate(nextDate)
        } else {
            "No Published Slots"
        }
    }

    Card(
        shape = RoundedCornerShape(18.dp),
        colors = CardDefaults.cardColors(containerColor = Color.White),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp),
        border = BorderStroke(1.dp, Color(0xFFE2E8F0)),
        modifier = Modifier
            .fillMaxWidth()
            .clickable { onSelectDoctorToBook(docItem) }
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            // Top Row: Avatar + Name & Degree + Status Badge
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                Surface(
                    shape = CircleShape,
                    color = Color(0xFFE0F2FE),
                    border = BorderStroke(2.dp, Color(0xFF0284C7)),
                    modifier = Modifier.size(52.dp)
                ) {
                    val avatarUrl = doctor.resolvedProfilePictureUrl
                    if (!avatarUrl.isNullOrBlank()) {
                        coil.compose.AsyncImage(
                            model = avatarUrl,
                            contentDescription = doctor.fullName,
                            contentScale = androidx.compose.ui.layout.ContentScale.Crop,
                            modifier = Modifier.fillMaxSize()
                        )
                    } else {
                        val initials = doctor.fullName.split(" ")
                            .filter { it.isNotBlank() }
                            .take(2)
                            .mapNotNull { it.firstOrNull()?.uppercaseChar() }
                            .joinToString("")
                            .ifBlank { "DR" }
                        Box(contentAlignment = Alignment.Center) {
                            Text(
                                text = initials,
                                fontSize = 16.sp,
                                fontWeight = FontWeight.ExtraBold,
                                color = Color(0xFF0284C7)
                            )
                        }
                    }
                }

                Column(modifier = Modifier.weight(1f)) {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                        Text(
                            text = "Dr. ${doctor.fullName}",
                            fontWeight = FontWeight.ExtraBold,
                            fontSize = 16.sp,
                            color = Color(0xFF0F172A),
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis
                        )
                        Icon(
                            Icons.Default.Verified,
                            contentDescription = "Verified",
                            tint = Color(0xFF0284C7),
                            modifier = Modifier.size(15.dp)
                        )
                    }
                    Text(
                        text = if (!doctor.education.isNullOrBlank()) "${allDocSpecs.first()} \u2022 ${doctor.education}" else allDocSpecs.first(),
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Medium,
                        color = Color(0xFF64748B),
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                }

                // Doctor Status Badge
                Surface(
                    color = if (clinicsForDoc.isEmpty()) {
                        Color(0xFFF1F5F9)
                    } else if (doctor.isInClinic == true) {
                        Color(0xFFDCFCE7)
                    } else {
                        Color(0xFFEFF6FF)
                    },
                    shape = RoundedCornerShape(8.dp)
                ) {
                    Text(
                        text = if (clinicsForDoc.isEmpty()) {
                            "Not affiliated"
                        } else if (doctor.isInClinic == true) {
                            "🟢 In Clinic"
                        } else {
                            "Verified Doctor"
                        },
                        color = if (clinicsForDoc.isEmpty()) {
                            Color(0xFF64748B)
                        } else if (doctor.isInClinic == true) {
                            Color(0xFF15803D)
                        } else {
                            Color(0xFF0284C7)
                        },
                        fontWeight = FontWeight.Bold,
                        fontSize = 10.sp,
                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
                    )
                }
            }

            // Search Highlight Reason (e.g. "Suggested for 'skin': Dermatologist")
            if (searchQuery.isNotBlank() && matchResult.matchHighlightReason != null) {
                Surface(
                    color = Color(0xFFECFDF5),
                    shape = RoundedCornerShape(8.dp),
                    border = BorderStroke(1.dp, Color(0xFFA7F3D0)),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Row(
                        modifier = Modifier.padding(horizontal = 10.dp, vertical = 5.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(6.dp)
                    ) {
                        Icon(Icons.Default.Verified, contentDescription = null, tint = Color(0xFF059669), modifier = Modifier.size(14.dp))
                        Text(
                            text = matchResult.matchHighlightReason ?: "",
                            color = Color(0xFF065F46),
                            fontSize = 11.sp,
                            fontWeight = FontWeight.Bold,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis
                        )
                    }
                }
            }

            // Specialties Chips
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .horizontalScroll(rememberScrollState()),
                horizontalArrangement = Arrangement.spacedBy(6.dp)
            ) {
                allDocSpecs.forEach { spec ->
                    Surface(
                        shape = RoundedCornerShape(12.dp),
                        color = Color(0xFFF1F5F9)
                    ) {
                        Text(
                            text = spec,
                            fontSize = 11.sp,
                            fontWeight = FontWeight.Medium,
                            color = Color(0xFF334155),
                            modifier = Modifier.padding(horizontal = 9.dp, vertical = 4.dp)
                        )
                    }
                }
            }

            // Practicing Clinics Summary
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(6.dp)
            ) {
                Icon(
                    imageVector = if (clinicsForDoc.isEmpty()) Icons.Default.DomainDisabled else Icons.Default.LocalHospital,
                    contentDescription = null,
                    tint = if (clinicsForDoc.isEmpty()) Color(0xFF94A3B8) else Color(0xFF0284C7),
                    modifier = Modifier.size(15.dp)
                )
                Text(
                    text = when {
                        clinicsForDoc.isEmpty() -> "Not affiliated with any active clinic"
                        clinicsForDoc.size > 1 -> "Available at ${clinicsForDoc.size} clinics (${primaryClinic?.name ?: ""}$distText & more)"
                        else -> "Practices at ${primaryClinic?.name ?: "Partner Clinic"}${distText}"
                    },
                    fontSize = 11.5.sp,
                    fontWeight = FontWeight.Medium,
                    color = if (clinicsForDoc.isEmpty()) Color(0xFF64748B) else Color(0xFF475569),
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
            }

            HorizontalDivider(color = Color(0xFFF1F5F9), modifier = Modifier.padding(vertical = 2.dp))

            // Bottom Row: Earliest Slot & Consultation Fee (Left) + Select Clinic & Book Button (Right)
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                        Box(
                            modifier = Modifier
                                .size(6.dp)
                                .background(if (earliestSlot != null) Color(0xFF10B981) else Color(0xFF0284C7), CircleShape)
                        )
                        Text(
                            text = slotText,
                            fontSize = 11.5.sp,
                            fontWeight = FontWeight.SemiBold,
                            color = if (earliestSlot != null) Color(0xFF15803D) else Color(0xFF0284C7)
                        )
                    }
                    Text(
                        text = "Fee: ${CurrencyFormatter.formatNPR(doctor.consultationFee ?: 500.0)}",
                        fontSize = 13.sp,
                        fontWeight = FontWeight.ExtraBold,
                        color = Color(0xFF0F172A)
                    )
                }

                if (clinicsForDoc.isEmpty()) {
                    OutlinedButton(
                        onClick = { onSelectDoctorToBook(docItem) },
                        shape = RoundedCornerShape(12.dp),
                        border = BorderStroke(1.dp, Color(0xFFCBD5E1)),
                        colors = ButtonDefaults.outlinedButtonColors(containerColor = Color(0xFFF8FAFC)),
                        modifier = Modifier.height(40.dp)
                    ) {
                        Text("Not Affiliated", fontWeight = FontWeight.Bold, fontSize = 12.sp, color = Color(0xFF64748B))
                    }
                } else {
                    Button(
                        onClick = { onSelectDoctorToBook(docItem) },
                        shape = RoundedCornerShape(12.dp),
                        colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF0284C7)),
                        modifier = Modifier.height(40.dp)
                    ) {
                        Icon(Icons.Default.Storefront, contentDescription = null, modifier = Modifier.size(15.dp))
                        Spacer(Modifier.width(5.dp))
                        Text(if (clinicsForDoc.size > 1) "Select Clinic" else "Book Slot", fontWeight = FontWeight.Bold, fontSize = 12.5.sp)
                    }
                }
            }
        }
    }
}

@Composable
private fun PatientHomeClinicCard(
    item: ClinicHomeItem,
    matchResult: com.dactor.patient.util.SearchMatchResult,
    clinicsNextAvailableDates: Map<String, String>,
    selectedDate: java.time.LocalDate,
    userLatitude: Double?,
    userLongitude: Double?,
    searchQuery: String,
    onNavigateToClinic: (String) -> Unit,
    onCallClinic: (String) -> Unit
) {
    val clinic = item.clinic
    val primaryDoctor = matchResult.matchedDoctors.firstOrNull() ?: item.doctors.firstOrNull()
    val distText = OpenRouteSpatialEngine.formatDistanceBadge(userLatitude, userLongitude, clinic)
        ?: run {
            val distKm = if (userLatitude != null && userLongitude != null) {
                calculateDistanceKm(
                    userLatitude,
                    userLongitude,
                    clinic.latitude ?: 27.7052,
                    clinic.longitude ?: 85.3193
                )
            } else 2.3
            String.format(java.util.Locale.US, "%.1f km", distKm)
        }
    val queueCount = item.availableSlots.sumOf { it.bookedCount }
    val estWaitMin = queueCount * 10
    val queueText = if (queueCount == 0) "No wait \u2022 Direct Entry" else "👥 $queueCount in queue (~${estWaitMin}m wait)"
    val queueBg = when {
        queueCount <= 2 -> Color(0xFFDCFCE7)
        queueCount <= 5 -> Color(0xFFE0F2FE)
        else -> Color(0xFFFEF3C7)
    }
    val queueTextColor = when {
        queueCount <= 2 -> Color(0xFF15803D)
        queueCount <= 5 -> Color(0xFF0284C7)
        else -> Color(0xFFB45309)
    }

    Card(
        shape = RoundedCornerShape(18.dp),
        colors = CardDefaults.cardColors(containerColor = Color.White),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp),
        border = BorderStroke(1.dp, Color(0xFFE2E8F0)),
        modifier = Modifier
            .fillMaxWidth()
            .clickable { onNavigateToClinic(clinic.id) }
    ) {
        Column {
            // Top Clinic Banner / Header
            val firstPic = clinic.pictures.firstOrNull() ?: clinic.logoUrl
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(118.dp)
                    .background(Color(0xFFE0F2FE)),
                contentAlignment = Alignment.Center
            ) {
                if (!firstPic.isNullOrBlank()) {
                    coil.compose.AsyncImage(
                        model = firstPic,
                        contentDescription = clinic.name,
                        contentScale = androidx.compose.ui.layout.ContentScale.Crop,
                        modifier = Modifier.fillMaxSize()
                    )
                } else {
                    Surface(
                        shape = RoundedCornerShape(12.dp),
                        color = Color(0xFF0284C7).copy(alpha = 0.15f),
                        modifier = Modifier.size(50.dp)
                    ) {
                        Box(contentAlignment = Alignment.Center) {
                            Icon(
                                Icons.Default.LocalHospital,
                                contentDescription = null,
                                tint = Color(0xFF0284C7),
                                modifier = Modifier.size(28.dp)
                            )
                        }
                    }
                }

                // Facility Badge (Top Right)
                Surface(
                    color = if (clinic.type == "diagnostic_lab") Color(0xFFFDF4FF) else Color(0xFFF0F9FF),
                    shape = RoundedCornerShape(8.dp),
                    border = BorderStroke(1.dp, if (clinic.type == "diagnostic_lab") Color(0xFFF0ABFC) else Color(0xFFBAE6FD)),
                    modifier = Modifier
                        .align(Alignment.TopEnd)
                        .padding(10.dp)
                ) {
                    Text(
                        text = if (clinic.type == "diagnostic_lab") "Diagnostic Lab" else "Polyclinic & OPD",
                        color = if (clinic.type == "diagnostic_lab") Color(0xFF9333EA) else Color(0xFF0284C7),
                        fontWeight = FontWeight.Bold,
                        fontSize = 10.5.sp,
                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp)
                    )
                }
            }

            Column(
                modifier = Modifier.padding(15.dp),
                verticalArrangement = Arrangement.spacedBy(9.dp)
            ) {
                // Search Highlight Reason
                if (searchQuery.isNotBlank() && matchResult.matchHighlightReason != null) {
                    Surface(
                        color = Color(0xFFEFF6FF),
                        shape = RoundedCornerShape(8.dp),
                        border = BorderStroke(1.dp, Color(0xFFBFDBFE)),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Row(
                            modifier = Modifier.padding(horizontal = 10.dp, vertical = 5.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(6.dp)
                        ) {
                            Icon(Icons.Default.Verified, contentDescription = null, tint = Color(0xFF2563EB), modifier = Modifier.size(14.dp))
                            Text(
                                text = matchResult.matchHighlightReason ?: "",
                                color = Color(0xFF1D4ED8),
                                fontSize = 11.sp,
                                fontWeight = FontWeight.Bold,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis
                            )
                        }
                    }
                }

                // Clinic Name & Address/Distance
                Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                    Text(
                        text = clinic.name,
                        fontWeight = FontWeight.Bold,
                        fontSize = 16.5.sp,
                        color = Color(0xFF0F172A)
                    )
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(4.dp)
                    ) {
                        Icon(Icons.Default.LocationOn, contentDescription = null, tint = Color(0xFF0284C7), modifier = Modifier.size(14.dp))
                        Text(
                            text = "${clinic.addressText ?: "Nepal"} \u2022 $distText",
                            fontSize = 12.sp,
                            color = Color(0xFF64748B)
                        )
                    }
                }

                // Lab / Specialty Chips & Offerings
                val isLabClinic = remember(clinic) {
                    clinic.type.equals("diagnostic_lab", ignoreCase = true) ||
                    clinic.type?.contains("lab", ignoreCase = true) == true ||
                    clinic.name.contains("lab", ignoreCase = true)
                }

                val displayChips = remember(clinic, item.services) {
                    if (isLabClinic) {
                        if (item.services.isNotEmpty()) {
                            item.services.map { it.serviceName }
                        } else {
                            val labSpecs = clinic.specialties.filter { s ->
                                val l = s.lowercase()
                                l.contains("test") || l.contains("scan") || l.contains("lab") ||
                                l.contains("mri") || l.contains("ct") || l.contains("x-ray") ||
                                l.contains("blood") || l.contains("patholog") || l.contains("urine") ||
                                l.contains("profile") || l.contains("ecg") || l.contains("echo")
                            }
                            if (labSpecs.isNotEmpty()) labSpecs
                            else listOf("Blood Tests & CBC", "Pathology", "Digital X-Ray", "Urine Routine")
                        }
                    } else {
                        if (clinic.specialties.isNotEmpty()) clinic.specialties else listOf("General Medicine")
                    }
                }

                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .horizontalScroll(rememberScrollState()),
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    if (isLabClinic) {
                        Surface(
                            shape = RoundedCornerShape(12.dp),
                            color = Color(0xFFF3E8FF),
                            border = BorderStroke(1.dp, Color(0xFFD8B4FE))
                        ) {
                            Row(
                                modifier = Modifier.padding(horizontal = 7.dp, vertical = 4.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(3.dp)
                            ) {
                                Icon(
                                    Icons.Default.Science,
                                    contentDescription = "Diagnostic Lab",
                                    tint = Color(0xFF7E22CE),
                                    modifier = Modifier.size(12.dp)
                                )
                                Text(
                                    text = "Lab Tests",
                                    fontSize = 10.5.sp,
                                    fontWeight = FontWeight.Bold,
                                    color = Color(0xFF7E22CE)
                                )
                            }
                        }
                    }

                    displayChips.take(3).forEach { spec ->
                        Surface(
                            shape = RoundedCornerShape(12.dp),
                            color = if (isLabClinic) Color(0xFFFAF5FF) else Color(0xFFF1F5F9),
                            border = if (isLabClinic) BorderStroke(1.dp, Color(0xFFE9D5FF)) else null
                        ) {
                            Text(
                                text = spec,
                                fontSize = 11.sp,
                                fontWeight = FontWeight.Medium,
                                color = if (isLabClinic) Color(0xFF6B21A8) else Color(0xFF334155),
                                modifier = Modifier.padding(horizontal = 9.dp, vertical = 4.dp)
                            )
                        }
                    }
                    if (displayChips.size > 3) {
                        Surface(
                            shape = RoundedCornerShape(12.dp),
                            color = if (isLabClinic) Color(0xFFFAF5FF) else Color(0xFFF1F5F9),
                            border = if (isLabClinic) BorderStroke(1.dp, Color(0xFFE9D5FF)) else null
                        ) {
                            Text(
                                text = "+${displayChips.size - 3}",
                                fontSize = 11.sp,
                                fontWeight = FontWeight.Bold,
                                color = if (isLabClinic) Color(0xFF7E22CE) else Color(0xFF0284C7),
                                modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
                            )
                        }
                    }
                }

                // Primary Doctor Row (Only for non-lab clinics)
                if (!isLabClinic && primaryDoctor != null) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        val initials = primaryDoctor.fullName.split(" ")
                            .filter { it.isNotBlank() }
                            .take(2)
                            .mapNotNull { it.firstOrNull()?.uppercaseChar() }
                            .joinToString("")
                            .ifBlank { "DR" }

                        Surface(
                            shape = CircleShape,
                            color = Color(0xFF0284C7).copy(alpha = 0.12f),
                            modifier = Modifier.size(34.dp)
                        ) {
                            Box(contentAlignment = Alignment.Center) {
                                Text(
                                    text = initials,
                                    fontSize = 12.sp,
                                    fontWeight = FontWeight.Bold,
                                    color = Color(0xFF0284C7)
                                )
                            }
                        }

                        Column(modifier = Modifier.weight(1f)) {
                            Text(
                                text = "Dr. ${primaryDoctor.fullName.removePrefix("Dr.").removePrefix("dr.").trim()}",
                                fontWeight = FontWeight.SemiBold,
                                fontSize = 12.5.sp,
                                color = Color(0xFF0F172A)
                            )
                            Text(
                                text = primaryDoctor.specialty ?: "General Physician",
                                fontSize = 10.5.sp,
                                color = Color(0xFF64748B)
                            )
                        }
                    }
                }

                HorizontalDivider(color = Color(0xFFF1F5F9), modifier = Modifier.padding(vertical = 1.dp))

                // Operating Hours, Lunch Break & Live Queue Badge
                val todaySched = remember(clinic) { clinic.getTodaySchedule() }
                val hasBreak = todaySched.isOpen && todaySched.hasBreak &&
                    !todaySched.breakStart.isNullOrBlank() && !todaySched.breakEnd.isNullOrBlank()
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(5.dp)) {
                            Box(
                                modifier = Modifier
                                    .size(7.dp)
                                    .background(
                                        if (todaySched.isOpen) Color(0xFF10B981) else Color(0xFFEF4444),
                                        CircleShape
                                    )
                            )
                            Text(
                                text = if (todaySched.isOpen) "Open \u2022 ${todaySched.openTime} - ${todaySched.closeTime}" else "Closed Today",
                                fontSize = 11.5.sp,
                                fontWeight = FontWeight.Medium,
                                color = if (todaySched.isOpen) Color(0xFF334155) else Color(0xFFDC2626)
                            )
                        }
                        if (hasBreak) {
                            Text(
                                text = "Break: ${todaySched.breakStart} - ${todaySched.breakEnd}",
                                fontSize = 10.sp,
                                color = Color(0xFFD97706),
                                fontWeight = FontWeight.Medium,
                                modifier = Modifier.padding(start = 12.dp)
                            )
                        }
                    }

                    // Live Queue Badge
                    Surface(
                        shape = RoundedCornerShape(8.dp),
                        color = queueBg,
                        border = BorderStroke(1.dp, queueTextColor.copy(alpha = 0.3f))
                    ) {
                        Text(
                            text = queueText,
                            fontSize = 10.5.sp,
                            fontWeight = FontWeight.Bold,
                            color = queueTextColor,
                            modifier = Modifier.padding(horizontal = 7.dp, vertical = 3.dp)
                        )
                    }
                }

                // Dual Action Buttons (Call + Book)
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    OutlinedButton(
                        onClick = { onCallClinic(clinic.contactPhone?.trim().orEmpty()) },
                        shape = RoundedCornerShape(12.dp),
                        border = BorderStroke(1.dp, Color(0xFF0284C7)),
                        colors = ButtonDefaults.outlinedButtonColors(contentColor = Color(0xFF0284C7)),
                        modifier = Modifier
                            .weight(1f)
                            .height(42.dp)
                    ) {
                        Icon(Icons.Default.Phone, contentDescription = null, modifier = Modifier.size(15.dp))
                        Spacer(Modifier.width(5.dp))
                        Text("Call", fontWeight = FontWeight.Bold, fontSize = 12.5.sp)
                    }

                    Button(
                        onClick = { onNavigateToClinic(clinic.id) },
                        shape = RoundedCornerShape(12.dp),
                        colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF0284C7)),
                        modifier = Modifier
                            .weight(1f)
                            .height(42.dp)
                    ) {
                        Text(if (isLabClinic) "Book Lab Test" else "Book OPD", fontWeight = FontWeight.Bold, fontSize = 12.5.sp)
                        Spacer(Modifier.width(5.dp))
                        Icon(Icons.Default.ArrowForward, contentDescription = null, modifier = Modifier.size(15.dp))
                    }
                }
            }
        }
    }
}

// TAB 1: DIRECTORY & RECORDS (Clinic Name, Doctor + Image, Date/Time, Bills)
// =========================================================================
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun RecordsTab(
    navController: NavController,
    appointmentRepository: AppointmentRepository?,
    labReportRepository: LabReportRepository?,
    clinicRepository: ClinicRepository? = null,
    doctorRepository: DoctorRepository? = null,
    authRepository: AuthRepository? = null,
    sessionManager: UserSessionManager?
) {
    val context = LocalContext.current
    val coroutineScope = rememberCoroutineScope()

    var allRecords by remember { mutableStateOf<List<Appointment>>(emptyList()) }
    var isLoading by remember { mutableStateOf(true) }
    var selectedFilter by remember { mutableStateOf("All") } // "All", "Completed", "With Bills"
    var searchQuery by remember { mutableStateOf("") }

    // Caches for Clinics, Doctors, Invoices, Remarks, Lab Reports
    val clinicMap = remember { mutableStateMapOf<String, Clinic>() }
    val doctorMap = remember { mutableStateMapOf<String, Doctor>() }
    val invoiceMap = remember { mutableStateMapOf<String, BillingInvoice>() }
    val remarksMap = remember { mutableStateMapOf<String, String>() }
    val labReportMap = remember { mutableStateMapOf<String, List<LabReport>>() }

    var allClinicsList by remember { mutableStateOf<List<Clinic>>(emptyList()) }
    var allDoctorsList by remember { mutableStateOf<List<Doctor>>(emptyList()) }

    // Confidential Lab Report Gate
    var verifyingReport by remember { mutableStateOf<LabReport?>(null) }
    var enteredPatientName by remember { mutableStateOf("") }
    var verificationError by remember { mutableStateOf<String?>(null) }

    // Billing Invoice & Payment Edit Modal
    var editingPaymentAppt by remember { mutableStateOf<Appointment?>(null) }
    var editTotalAmountInput by remember { mutableStateOf("") }
    var editPaidAmountInput by remember { mutableStateOf("") }
    var editPaymentRemarksInput by remember { mutableStateOf("") }
    var isSavingPayment by remember { mutableStateOf(false) }

    // Add Patient / Link Record to Directory Modal
    var showAddPatientRecordDialog by remember { mutableStateOf(false) }
    var addMode by remember { mutableStateOf("code") } // default to "code" for fast linking
    var linkCodeInput by remember { mutableStateOf("") }
    var newPatientName by remember { mutableStateOf(sessionManager?.getSavedName() ?: "") }
    var newPatientMobile by remember { mutableStateOf(sessionManager?.getSavedPhone() ?: "") }
    var newPatientAge by remember { mutableStateOf(sessionManager?.getSavedAge()?.toString() ?: "") }
    var newPatientGender by remember { mutableStateOf(sessionManager?.getSavedGender() ?: "Male") }
    var selectedClinicIdForAdd by remember { mutableStateOf("") }
    var selectedDoctorIdForAdd by remember { mutableStateOf("") }
    var newApptDate by remember { mutableStateOf(LocalDate.now().toString()) }
    var newApptTime by remember { mutableStateOf("10:30 AM") }
    var newTotalBill by remember { mutableStateOf("500") }
    var newPaidAmount by remember { mutableStateOf("500") }
    var newClinicalRemarks by remember { mutableStateOf("") }
    var isAddingDirectoryRecord by remember { mutableStateOf(false) }

    // Viewing Record Comprehensive Details Modal & Associated Visits
    var viewingRecordDetails by remember { mutableStateOf<Appointment?>(null) }
    var associatedVisitsForDetail by remember { mutableStateOf<List<Appointment>>(emptyList()) }
    var isLoadingVisitsForDetail by remember { mutableStateOf(false) }
    var apptToRemoveConfirm by remember { mutableStateOf<Appointment?>(null) }
    var apptToRescheduleConfirm by remember { mutableStateOf<Appointment?>(null) }

    suspend fun loadDirectoryRecords() {
        isLoading = true
        try {
            sessionManager?.awaitIdentityResolved(timeoutMs = 2500)
            // Load clinics & doctors into lookup maps
            if (clinicRepository != null) {
                val clinics = clinicRepository.getClinics()
                allClinicsList = clinics
                clinics.forEach { clinicMap[it.id] = it }
                if (selectedClinicIdForAdd.isBlank() && clinics.isNotEmpty()) {
                    selectedClinicIdForAdd = clinics.first().id
                }
            }
            if (doctorRepository != null) {
                val docs = doctorRepository.getDoctors(null)
                allDoctorsList = docs
                docs.forEach { doctorMap[it.id] = it }
                if (selectedDoctorIdForAdd.isBlank() && docs.isNotEmpty()) {
                    selectedDoctorIdForAdd = docs.first().id
                }
            }

            val hiddenCodes = sessionManager?.getHiddenRecordCodes() ?: emptySet()
            val patientId = sessionManager?.getSavedPatientId() ?: ""
            val email = sessionManager?.getSavedEmail()?.takeIf { it.isNotBlank() }
                ?: authRepository?.getCurrentUserEmail().orEmpty()
            val phone = sessionManager?.getSavedPhone() ?: ""
            val savedCodes = sessionManager?.getSavedTrackingCodes()?.map { it.first } ?: emptyList()

            val fetchedAppts = if (appointmentRepository != null) {
                appointmentRepository.getAllPatientAppointments(
                    userId = patientId,
                    email = email,
                    phone = phone,
                    trackingCodes = savedCodes
                )
            } else emptyList()

            // Ensure all appointments associated with any saved tracking code are retrieved
            val existingCodes = fetchedAppts.map { it.trackingCode10Digit }.toSet()
            val missingCodes = savedCodes.filter { it !in existingCodes && !hiddenCodes.contains(it) }
            val extraAppts = missingCodes.mapNotNull { code ->
                try {
                    appointmentRepository?.getAppointmentByTrackingCode(code)
                } catch (_: Exception) { null }
            }

            val combinedAppts = (fetchedAppts + extraAppts)
                .distinctBy { it.id }
                .filter { !hiddenCodes.contains(it.trackingCode10Digit) && !hiddenCodes.contains(it.id) }

            for (appt in combinedAppts) {
                if (appt.trackingCode10Digit.isNotBlank() && !hiddenCodes.contains(appt.trackingCode10Digit)) {
                    sessionManager?.saveTrackingCode(
                        appt.trackingCode10Digit,
                        "${appt.patientName} \u2022 ${appt.appointmentDate}"
                    )
                }
            }

            allRecords = combinedAppts

            // Resolve any missing clinics or doctors
            for (appt in combinedAppts) {
                if (appt.clinicId.isNotBlank() && !clinicMap.containsKey(appt.clinicId) && clinicRepository != null) {
                    clinicRepository.getClinicById(appt.clinicId)?.let { clinicMap[appt.clinicId] = it }
                }
                if (!appt.doctorId.isNullOrBlank() && !doctorMap.containsKey(appt.doctorId) && doctorRepository != null) {
                    doctorRepository.getDoctorById(appt.doctorId)?.let { doctorMap[appt.doctorId] = it }
                }
            }

            // Batch load invoices for all appointments
            if (appointmentRepository != null && combinedAppts.isNotEmpty()) {
                val invoicesByAppt = appointmentRepository.getInvoicesForAppointments(combinedAppts.map { it.id })
                invoiceMap.clear()
                invoiceMap.putAll(invoicesByAppt)
            }
        } catch (e: Exception) {
            e.printStackTrace()
        } finally {
            isLoading = false
        }
    }

    LaunchedEffect(Unit) {
        loadDirectoryRecords()
    }

    LaunchedEffect(viewingRecordDetails?.id) {
        val target = viewingRecordDetails
        if (target == null) {
            associatedVisitsForDetail = emptyList()
            return@LaunchedEffect
        }
        isLoadingVisitsForDetail = true
        try {
            val targetCode = target.trackingCode10Digit
            val dbByCode = if (appointmentRepository != null && targetCode.isNotBlank()) {
                try { appointmentRepository.getAllAppointmentsByTrackingCode(targetCode) } catch (_: Exception) { emptyList() }
            } else emptyList()
            val codeMatches = allRecords.filter { it.trackingCode10Digit == targetCode }
            val hiddenCodes = sessionManager?.getHiddenRecordCodes() ?: emptySet()
            // Strictly isolate visits by Appointment ID (targetCode); do NOT mix in clinic-wide visits
            val combined = (dbByCode + codeMatches + listOf(target))
                .distinctBy { it.id }
                .filter { !hiddenCodes.contains(it.trackingCode10Digit) && !hiddenCodes.contains(it.id) }
                .sortedWith(
                    compareByDescending<Appointment> { it.appointmentDate }
                        .thenByDescending { it.appointmentTime ?: "" }
                )
            associatedVisitsForDetail = combined

            // Resolve missing clinic or doctor for target
            if (target.clinicId.isNotBlank() && !clinicMap.containsKey(target.clinicId) && clinicRepository != null) {
                try { clinicRepository.getClinicById(target.clinicId)?.let { clinicMap[target.clinicId] = it } } catch (_: Exception) {}
            }
            if (!target.doctorId.isNullOrBlank() && !doctorMap.containsKey(target.doctorId) && doctorRepository != null) {
                try { doctorRepository.getDoctorById(target.doctorId)?.let { doctorMap[target.doctorId] = it } } catch (_: Exception) {}
            }

            // Ensure invoice, remarks, and lab reports are loaded for the target appointment
            if (appointmentRepository != null) {
                if (!invoiceMap.containsKey(target.id)) {
                    val inv = appointmentRepository.getInvoiceForAppointment(target.id)
                    if (inv != null) invoiceMap[target.id] = inv
                }
                if (!remarksMap.containsKey(target.id)) {
                    val rem = appointmentRepository.getRemarksForAppointment(target.id)
                    if (!rem.isNullOrBlank()) remarksMap[target.id] = rem
                }
            }
            if (labReportRepository != null && !labReportMap.containsKey(target.id)) {
                val reps = labReportRepository.getLabReportsForAppointment(
                    appointmentId = target.id,
                    trackingCode = target.trackingCode10Digit
                )
                labReportMap[target.id] = reps
            }
        } catch (_: Exception) {
            associatedVisitsForDetail = listOf(target)
        } finally {
            isLoadingVisitsForDetail = false
        }
    }

    val displayedRecords = remember(allRecords, selectedFilter, searchQuery, clinicMap.size, doctorMap.size, invoiceMap.size) {
        val hiddenCodes = sessionManager?.getHiddenRecordCodes() ?: emptySet()
        allRecords.filter { appt ->
            if (hiddenCodes.contains(appt.trackingCode10Digit) || hiddenCodes.contains(appt.id)) return@filter false
            val matchesFilter = when (selectedFilter) {
                "Completed" -> appt.checkinStatus.lowercase() in listOf("completed", "done")
                "With Bills" -> invoiceMap.containsKey(appt.id) || (appt.feeAmount ?: 0.0) > 0.0
                else -> true
            }
            if (!matchesFilter) return@filter false
            if (searchQuery.isBlank()) return@filter true
            val q = searchQuery.trim().lowercase()
            val cName = clinicMap[appt.clinicId]?.name?.lowercase() ?: ""
            val dName = appt.doctorId?.let { doctorMap[it]?.fullName?.lowercase() } ?: ""
            appt.patientName.lowercase().contains(q) ||
                appt.trackingCode10Digit.lowercase().contains(q) ||
                cName.contains(q) ||
                dName.contains(q) ||
                appt.appointmentDate.contains(q)
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(Color(0xFFF8FAFC))
    ) {
        // ── TOP GRADIENT HEADER BANNER ───────────────────────────────────────
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .background(
                    Brush.verticalGradient(
                        colors = listOf(Color(0xFF0284C7), Color(0xFF0369A1))
                    )
                )
                .padding(horizontal = 20.dp, vertical = 16.dp)
        ) {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Column {
                        Text(
                            text = "Patient Directory & Records",
                            fontSize = 20.sp,
                            fontWeight = FontWeight.ExtraBold,
                            color = Color.White
                        )
                        Text(
                            text = "Consultations, Doctors, Clinic Bills & Lab Reports",
                            fontSize = 12.sp,
                            color = Color.White.copy(alpha = 0.85f)
                        )
                    }

                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Button(
                            onClick = {
                                addMode = "code"
                                linkCodeInput = ""
                                showAddPatientRecordDialog = true
                            },
                            colors = ButtonDefaults.buttonColors(containerColor = Color.White),
                            shape = RoundedCornerShape(20.dp),
                            contentPadding = PaddingValues(horizontal = 10.dp, vertical = 6.dp),
                            modifier = Modifier.height(34.dp)
                        ) {
                            Icon(Icons.Default.AddLink, contentDescription = null, tint = Color(0xFF0284C7), modifier = Modifier.size(16.dp))
                            Spacer(Modifier.width(4.dp))
                            Text("+ Link Code", fontSize = 11.5.sp, fontWeight = FontWeight.ExtraBold, color = Color(0xFF0284C7))
                        }

                        IconButton(
                            onClick = { coroutineScope.launch { loadDirectoryRecords() } },
                            modifier = Modifier
                                .size(34.dp)
                                .background(Color.White.copy(alpha = 0.18f), CircleShape)
                        ) {
                            Icon(Icons.Default.Refresh, contentDescription = "Refresh", tint = Color.White, modifier = Modifier.size(18.dp))
                        }
                    }
                }

                // Search bar inside Directory
                OutlinedTextField(
                    value = searchQuery,
                    onValueChange = { searchQuery = it },
                    placeholder = {
                        Text(
                            "Search clinic, doctor or code...",
                            fontSize = 12.sp,
                            color = Color(0xFF64748B)
                        )
                    },
                    leadingIcon = {
                        Icon(Icons.Default.Search, contentDescription = null, tint = Color(0xFF0284C7), modifier = Modifier.size(18.dp))
                    },
                    trailingIcon = {
                        if (searchQuery.isNotBlank()) {
                            IconButton(onClick = { searchQuery = "" }) {
                                Icon(Icons.Default.Clear, contentDescription = "Clear", modifier = Modifier.size(16.dp))
                            }
                        }
                    },
                    singleLine = true,
                    shape = RoundedCornerShape(12.dp),
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedContainerColor = Color.White,
                        unfocusedContainerColor = Color.White,
                        focusedBorderColor = Color.Transparent,
                        unfocusedBorderColor = Color.Transparent
                    ),
                    textStyle = LocalTextStyle.current.copy(fontSize = 13.sp, color = Color(0xFF0F172A)),
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(56.dp)
                )
            }
        }

        // Filter Chips Row
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 10.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            listOf(
                "All" to "All Records (${allRecords.size})",
                "Completed" to "Completed (${allRecords.count { it.checkinStatus.lowercase() in listOf("completed", "done") }})",
                "With Bills" to "Bills & Receipts (${allRecords.count { invoiceMap.containsKey(it.id) || (it.feeAmount ?: 0.0) > 0.0 }})"
            ).forEach { (key, label) ->
                FilterChip(
                    selected = selectedFilter == key,
                    onClick = { selectedFilter = key },
                    label = { Text(label, fontSize = 11.sp, fontWeight = FontWeight.Bold) },
                    colors = FilterChipDefaults.filterChipColors(
                        selectedContainerColor = Color(0xFFE0F2F1),
                        selectedLabelColor = Color(0xFF0284C7)
                    )
                )
            }
        }

        if (isLoading) {
            com.dactor.patient.ui.common.ShimmerListPlaceholder(
                count = 4,
                modifier = Modifier
                    .fillMaxSize()
                    .padding(16.dp)
            )
        } else if (displayedRecords.isEmpty()) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(24.dp),
                contentAlignment = Alignment.Center
            ) {
                Column(
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    Surface(
                        shape = CircleShape,
                        color = Color(0xFFE0F2F1),
                        modifier = Modifier.size(72.dp)
                    ) {
                        Box(contentAlignment = Alignment.Center) {
                            Icon(
                                Icons.AutoMirrored.Filled.Article,
                                contentDescription = null,
                                tint = Color(0xFF0284C7),
                                modifier = Modifier.size(36.dp)
                            )
                        }
                    }
                    Text("No Directory Records Found", fontWeight = FontWeight.ExtraBold, fontSize = 17.sp, color = Color(0xFF0F172A))
                    Text(
                        "Your clinic visits, doctor consultations, medical bills, and lab test reports will appear here automatically when booked or pushed by the clinic.",
                        fontSize = 12.sp,
                        color = Color(0xFF64748B),
                        textAlign = androidx.compose.ui.text.style.TextAlign.Center
                    )
                    Button(
                        onClick = {
                            addMode = "code"
                            linkCodeInput = ""
                            showAddPatientRecordDialog = true
                        },
                        colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF0284C7)),
                        shape = RoundedCornerShape(12.dp),
                        contentPadding = PaddingValues(horizontal = 16.dp, vertical = 10.dp)
                    ) {
                        Icon(Icons.Default.AddLink, contentDescription = null, modifier = Modifier.size(16.dp))
                        Spacer(Modifier.width(6.dp))
                        Text("Link Record with 10-Digit Code", fontWeight = FontWeight.Bold, fontSize = 12.5.sp)
                    }
                }
            }
        } else {
            LazyColumn(
                verticalArrangement = Arrangement.spacedBy(16.dp),
                contentPadding = PaddingValues(horizontal = 16.dp, vertical = 8.dp),
                modifier = Modifier.fillMaxSize()
            ) {
                items(displayedRecords, key = { it.id }) { appt ->
                    val clinic = clinicMap[appt.clinicId]
                    val doctor = appt.doctorId?.let { doctorMap[it] }
                    val invoice = invoiceMap[appt.id]
                    val remarks = remarksMap[appt.id] ?: invoice?.remarks
                    val labReports = labReportMap[appt.id] ?: emptyList()

                    LaunchedEffect(appt.id) {
                        if (appointmentRepository != null) {
                            val rem = appointmentRepository.getRemarksForAppointment(appt.id)
                            if (!rem.isNullOrBlank()) remarksMap[appt.id] = rem
                            val inv = appointmentRepository.getInvoiceForAppointment(appt.id)
                            if (inv != null) invoiceMap[appt.id] = inv
                        }
                        if (labReportRepository != null) {
                            labReportMap[appt.id] = labReportRepository.getLabReportsForAppointment(
                                appointmentId = appt.id,
                                trackingCode = appt.trackingCode10Digit
                            )
                        }
                    }

                    val clinicName = clinic?.name ?: "Partner Medical Clinic"
                    val clinicAddress = clinic?.addressText ?: "Nepal"
                    val doctorName = doctor?.fullName?.let { if (it.startsWith("Dr.", true)) it else "Dr. $it" } ?: "Attending Physician"
                    val doctorSpec = doctor?.allSpecialties?.firstOrNull() ?: doctor?.specialty ?: "General Physician"
                    val doctorAvatar = doctor?.resolvedProfilePictureUrl

                    val totalBill = when {
                        invoice != null && invoice.totalAmount > 0.0 -> invoice.totalAmount
                        (appt.feeAmount ?: 0.0) > 0.0 -> appt.feeAmount ?: 0.0
                        (doctor?.consultationFee ?: 0.0) > 0.0 -> doctor?.consultationFee ?: 500.0
                        else -> 0.0
                    }
                    val paidAmount = when {
                        invoice != null && (invoice.paidAmount != null || invoice.totalAmount > 0.0) -> invoice.effectivePaidAmount
                        appt.paymentStatus.equals("paid", ignoreCase = true) -> totalBill
                        else -> 0.0
                    }
                    val balanceLeft = (totalBill - paidAmount).coerceAtLeast(0.0)

                    Card(
                        shape = RoundedCornerShape(20.dp),
                        colors = CardDefaults.cardColors(containerColor = Color.White),
                        elevation = CardDefaults.cardElevation(defaultElevation = 3.dp),
                        border = BorderStroke(1.dp, Color(0xFFE2E8F0)),
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable { viewingRecordDetails = appt }
                    ) {
                        Column {
                            // ── 1. TOP CLINIC BANNER & APPOINTMENT STATUS ────────
                            Box(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .background(
                                        Brush.horizontalGradient(
                                            colors = listOf(Color(0xFFF0FDFA), Color(0xFFE0F2FE))
                                        )
                                    )
                                    .padding(horizontal = 16.dp, vertical = 12.dp)
                            ) {
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Row(
                                        verticalAlignment = Alignment.CenterVertically,
                                        horizontalArrangement = Arrangement.spacedBy(10.dp),
                                        modifier = Modifier.weight(1f)
                                    ) {
                                        val clinicImg = clinic?.resolvedLogoUrl ?: clinic?.resolvedCoverPictureUrl ?: clinic?.pictures?.firstOrNull()
                                        Surface(
                                            shape = RoundedCornerShape(10.dp),
                                            color = Color(0xFF0284C7).copy(alpha = 0.12f),
                                            border = BorderStroke(1.dp, Color(0xFF0284C7).copy(alpha = 0.25f)),
                                            modifier = Modifier.size(38.dp)
                                        ) {
                                            if (!clinicImg.isNullOrBlank()) {
                                                coil.compose.AsyncImage(
                                                    model = clinicImg,
                                                    contentDescription = clinicName,
                                                    contentScale = androidx.compose.ui.layout.ContentScale.Crop,
                                                    modifier = Modifier.fillMaxSize()
                                                )
                                            } else {
                                                Box(contentAlignment = Alignment.Center) {
                                                    Icon(
                                                        Icons.Default.LocalHospital,
                                                        contentDescription = null,
                                                        tint = Color(0xFF0284C7),
                                                        modifier = Modifier.size(20.dp)
                                                    )
                                                }
                                            }
                                        }
                                        Column {
                                            Text(
                                                text = clinicName,
                                                fontWeight = FontWeight.ExtraBold,
                                                fontSize = 15.sp,
                                                color = Color(0xFF0F172A),
                                                maxLines = 1,
                                                overflow = TextOverflow.Ellipsis
                                            )
                                            Row(
                                                verticalAlignment = Alignment.CenterVertically,
                                                horizontalArrangement = Arrangement.spacedBy(4.dp)
                                            ) {
                                                Icon(
                                                    Icons.Default.LocationOn,
                                                    contentDescription = null,
                                                    tint = Color(0xFF0F766E),
                                                    modifier = Modifier.size(12.dp)
                                                )
                                                Text(
                                                    text = clinicAddress,
                                                    fontSize = 11.sp,
                                                    color = Color(0xFF475569),
                                                    maxLines = 1,
                                                    overflow = TextOverflow.Ellipsis
                                                )
                                            }
                                        }
                                    }

                                    val isCompleted = appt.checkinStatus.lowercase() in listOf("completed", "done")
                                    Row(
                                        verticalAlignment = Alignment.CenterVertically,
                                        horizontalArrangement = Arrangement.spacedBy(6.dp)
                                    ) {
                                        Surface(
                                            color = if (isCompleted) Color(0xFFDCFCE7) else Color(0xFFFEF3C7),
                                            shape = RoundedCornerShape(8.dp)
                                        ) {
                                            Text(
                                                text = if (isCompleted) "✓ Completed" else appt.checkinStatus.replaceFirstChar { it.uppercase() },
                                                color = if (isCompleted) Color(0xFF15803D) else Color(0xFFB45309),
                                                fontWeight = FontWeight.Bold,
                                                fontSize = 11.sp,
                                                modifier = Modifier.padding(horizontal = 9.dp, vertical = 4.dp)
                                            )
                                        }

                                        IconButton(
                                            onClick = { apptToRemoveConfirm = appt },
                                            modifier = Modifier.size(32.dp)
                                        ) {
                                            Icon(
                                                Icons.Default.DeleteOutline,
                                                contentDescription = "Remove from My Records",
                                                tint = Color(0xFF94A3B8),
                                                modifier = Modifier.size(18.dp)
                                            )
                                        }
                                    }
                                }
                            }

                            Column(
                                modifier = Modifier.padding(16.dp),
                                verticalArrangement = Arrangement.spacedBy(12.dp)
                            ) {
                                // ── 2. DOCTOR PROFILE ROW WITH IMAGE & TIME DONE ─
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(12.dp)
                                ) {
                                    Surface(
                                        shape = CircleShape,
                                        color = Color(0xFFE0F2FE),
                                        border = BorderStroke(2.dp, Color(0xFF0284C7)),
                                        modifier = Modifier.size(56.dp)
                                    ) {
                                        if (!doctorAvatar.isNullOrBlank()) {
                                            coil.compose.AsyncImage(
                                                model = doctorAvatar,
                                                contentDescription = doctorName,
                                                contentScale = androidx.compose.ui.layout.ContentScale.Crop,
                                                modifier = Modifier.fillMaxSize()
                                            )
                                        } else {
                                            val initials = (doctor?.fullName ?: "DR")
                                                .split(" ")
                                                .filter { it.isNotBlank() }
                                                .take(2)
                                                .mapNotNull { it.firstOrNull()?.uppercaseChar() }
                                                .joinToString("")
                                                .ifBlank { "DR" }
                                            Box(contentAlignment = Alignment.Center) {
                                                Text(
                                                    text = initials,
                                                    fontWeight = FontWeight.ExtraBold,
                                                    fontSize = 18.sp,
                                                    color = Color(0xFF0284C7)
                                                )
                                            }
                                        }
                                    }

                                    Column(modifier = Modifier.weight(1f)) {
                                        Text(
                                            text = doctorName,
                                            fontWeight = FontWeight.ExtraBold,
                                            fontSize = 16.sp,
                                            color = Color(0xFF0F172A)
                                        )
                                        Text(
                                            text = doctorSpec,
                                            fontWeight = FontWeight.SemiBold,
                                            fontSize = 12.sp,
                                            color = Color(0xFF0284C7)
                                        )
                                        if (!doctor?.education.isNullOrBlank()) {
                                            Text(
                                                text = doctor?.education ?: "",
                                                fontSize = 11.sp,
                                                color = Color(0xFF64748B),
                                                maxLines = 1,
                                                overflow = TextOverflow.Ellipsis
                                            )
                                        }
                                    }

                                    // Date & Time of Appointment Done Box
                                    Surface(
                                        shape = RoundedCornerShape(10.dp),
                                        color = Color(0xFFF8FAFC),
                                        border = BorderStroke(1.dp, Color(0xFFE2E8F0))
                                    ) {
                                        Column(
                                            modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp),
                                            horizontalAlignment = Alignment.End
                                        ) {
                                            Row(
                                                verticalAlignment = Alignment.CenterVertically,
                                                horizontalArrangement = Arrangement.spacedBy(4.dp)
                                            ) {
                                                Icon(
                                                    Icons.Default.Event,
                                                    contentDescription = null,
                                                    tint = Color(0xFF0284C7),
                                                    modifier = Modifier.size(12.dp)
                                                )
                                                Text(
                                                    text = appt.appointmentDate,
                                                    fontWeight = FontWeight.Bold,
                                                    fontSize = 11.sp,
                                                    color = Color(0xFF0F172A)
                                                )
                                            }
                                            Spacer(Modifier.height(2.dp))
                                            Row(
                                                verticalAlignment = Alignment.CenterVertically,
                                                horizontalArrangement = Arrangement.spacedBy(4.dp)
                                            ) {
                                                Icon(
                                                    Icons.Default.Schedule,
                                                    contentDescription = null,
                                                    tint = Color(0xFF0891B2),
                                                    modifier = Modifier.size(12.dp)
                                                )
                                                Text(
                                                    text = appt.appointmentTime ?: "OPD",
                                                    fontWeight = FontWeight.SemiBold,
                                                    fontSize = 11.sp,
                                                    color = Color(0xFF0891B2)
                                                )
                                            }
                                        }
                                    }
                                }

                                // ── 3. PATIENT DETAILS & 10-DIGIT CODE ROW ───────
                                Surface(
                                    shape = RoundedCornerShape(12.dp),
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
                                        Column(modifier = Modifier.weight(1f)) {
                                            Text(
                                                text = "Patient: ${appt.patientName}",
                                                fontWeight = FontWeight.Bold,
                                                fontSize = 13.sp,
                                                color = Color(0xFF1E293B)
                                            )
                                            val demoParts = listOfNotNull(
                                                appt.patientGender?.takeIf { it.isNotBlank() },
                                                appt.patientAge?.let { "$it yrs" },
                                                appt.patientMobile?.takeIf { it.isNotBlank() }
                                            )
                                            if (demoParts.isNotEmpty()) {
                                                Text(
                                                    text = demoParts.joinToString(" \u2022 "),
                                                    fontSize = 11.sp,
                                                    color = Color(0xFF64748B)
                                                )
                                            }
                                        }

                                        Row(
                                            verticalAlignment = Alignment.CenterVertically,
                                            horizontalArrangement = Arrangement.spacedBy(4.dp)
                                        ) {
                                            Surface(
                                                shape = RoundedCornerShape(6.dp),
                                                color = Color(0xFFE0F2F1)
                                            ) {
                                                Text(
                                                    text = "#${appt.trackingCode10Digit}",
                                                    fontSize = 12.sp,
                                                    fontWeight = FontWeight.ExtraBold,
                                                    color = Color(0xFF0284C7),
                                                    modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
                                                )
                                            }
                                            IconButton(
                                                onClick = {
                                                    val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
                                                    clipboard.setPrimaryClip(ClipData.newPlainText("Code", appt.trackingCode10Digit))
                                                    Toast.makeText(context, "Copied: ${appt.trackingCode10Digit}", Toast.LENGTH_SHORT).show()
                                                },
                                                modifier = Modifier.size(28.dp)
                                            ) {
                                                Icon(
                                                    Icons.Default.ContentCopy,
                                                    contentDescription = "Copy Code",
                                                    tint = Color(0xFF0284C7),
                                                    modifier = Modifier.size(15.dp)
                                                )
                                            }
                                        }
                                    }
                                }

                                // ── 4. DOCTOR'S CLINICAL REMARKS ─────────────────
                                Surface(
                                    color = Color(0xFFFAFAFA),
                                    shape = RoundedCornerShape(10.dp),
                                    border = BorderStroke(1.dp, Color(0xFFE2E8F0)),
                                    modifier = Modifier.fillMaxWidth()
                                ) {
                                    Column(
                                        modifier = Modifier.padding(10.dp),
                                        verticalArrangement = Arrangement.spacedBy(4.dp)
                                    ) {
                                        Row(
                                            verticalAlignment = Alignment.CenterVertically,
                                            horizontalArrangement = Arrangement.spacedBy(6.dp)
                                        ) {
                                            Icon(
                                                Icons.Default.RateReview,
                                                contentDescription = null,
                                                tint = Color(0xFF0284C7),
                                                modifier = Modifier.size(14.dp)
                                            )
                                            Text(
                                                "Doctor's Clinical Remarks & Notes",
                                                fontWeight = FontWeight.Bold,
                                                fontSize = 11.sp,
                                                color = Color(0xFF0284C7)
                                            )
                                        }
                                        Text(
                                            text = com.dactor.patient.util.PaymentLedgerHelper.extractCleanClinicalRemarks(remarks).takeIf { it.isNotBlank() } ?: "No clinical remarks recorded for this visit.",
                                            fontSize = 12.sp,
                                            color = Color(0xFF334155)
                                        )
                                    }
                                }

                                // ── 5. DIAGNOSTIC LAB REPORTS ────────────────────
                                if (labReports.isNotEmpty()) {
                                    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                        Text(
                                            "Diagnostic Lab Reports (${labReports.size})",
                                            fontWeight = FontWeight.Bold,
                                            fontSize = 12.sp,
                                            color = Color(0xFF0F172A)
                                        )
                                        labReports.forEach { report ->
                                            val isPrepared = report.stage.equals("prepared", ignoreCase = true) || !report.fileUrl.isNullOrBlank()
                                            Surface(
                                                shape = RoundedCornerShape(10.dp),
                                                color = Color(0xFFFAF5FF),
                                                border = BorderStroke(1.dp, Color(0xFFE9D5FF)),
                                                modifier = Modifier.fillMaxWidth()
                                            ) {
                                                Column(
                                                    modifier = Modifier.padding(10.dp),
                                                    verticalArrangement = Arrangement.spacedBy(8.dp)
                                                ) {
                                                    Row(
                                                        modifier = Modifier.fillMaxWidth(),
                                                        horizontalArrangement = Arrangement.SpaceBetween,
                                                        verticalAlignment = Alignment.CenterVertically
                                                    ) {
                                                        Row(
                                                            verticalAlignment = Alignment.CenterVertically,
                                                            horizontalArrangement = Arrangement.spacedBy(6.dp),
                                                            modifier = Modifier.weight(1f)
                                                        ) {
                                                            Icon(Icons.Default.Biotech, contentDescription = null, tint = Color(0xFF9333EA), modifier = Modifier.size(16.dp))
                                                            Text(
                                                                text = report.testName.ifBlank { "Pathology Report" },
                                                                fontWeight = FontWeight.Bold,
                                                                fontSize = 12.sp,
                                                                color = Color(0xFF581C87)
                                                            )
                                                        }
                                                        Surface(
                                                            shape = RoundedCornerShape(6.dp),
                                                            color = if (isPrepared) Color(0xFFDCFCE7) else Color(0xFFFEF3C7)
                                                        ) {
                                                            Text(
                                                                text = when (report.stage.lowercase()) {
                                                                    "prepared" -> "✓ Published"
                                                                    "in_lab" -> "In Lab Processing"
                                                                    else -> "Sample Collected"
                                                                },
                                                                fontSize = 10.sp,
                                                                fontWeight = FontWeight.Bold,
                                                                color = if (isPrepared) Color(0xFF15803D) else Color(0xFFB45309),
                                                                modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
                                                            )
                                                        }
                                                    }

                                                    Row(
                                                        modifier = Modifier.fillMaxWidth(),
                                                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                                                    ) {
                                                        OutlinedButton(
                                                            onClick = {
                                                                verifyingReport = report
                                                                enteredPatientName = ""
                                                                verificationError = null
                                                            },
                                                            shape = RoundedCornerShape(8.dp),
                                                            contentPadding = PaddingValues(horizontal = 10.dp, vertical = 6.dp),
                                                            modifier = Modifier
                                                                .weight(1f)
                                                                .defaultMinSize(minHeight = 34.dp)
                                                        ) {
                                                            Icon(Icons.Default.Visibility, contentDescription = null, tint = Color(0xFF9333EA), modifier = Modifier.size(14.dp))
                                                            Spacer(Modifier.width(4.dp))
                                                            Text("View Report", fontSize = 11.sp, fontWeight = FontWeight.Bold, color = Color(0xFF9333EA))
                                                        }

                                                        if (isPrepared) {
                                                            Button(
                                                                onClick = {
                                                                    com.dactor.patient.util.LabReportPdfDownloader.downloadAndSaveReportFile(
                                                                        context = context,
                                                                        report = report,
                                                                        patientName = appt.patientName,
                                                                        patientAgeGender = listOfNotNull(appt.patientGender, appt.patientAge?.let { "$it yrs" }).joinToString(" \u2022 "),
                                                                        clinicName = clinicName,
                                                                        doctorName = doctorName
                                                                    )
                                                                },
                                                                shape = RoundedCornerShape(8.dp),
                                                                colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF9333EA)),
                                                                contentPadding = PaddingValues(horizontal = 10.dp, vertical = 6.dp),
                                                                modifier = Modifier
                                                                    .weight(1f)
                                                                    .defaultMinSize(minHeight = 34.dp)
                                                            ) {
                                                                Icon(Icons.Default.Download, contentDescription = null, modifier = Modifier.size(14.dp))
                                                                Spacer(Modifier.width(4.dp))
                                                                Text("Download PDF", fontSize = 11.sp, fontWeight = FontWeight.Bold)
                                                            }
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }

                                // ── 6. CONNECTED BILL & PAYMENT SECTION ──────────
                                Surface(
                                    color = if (balanceLeft <= 0.0 && totalBill > 0.0) Color(0xFFF0FDF4) else Color(0xFFFFFBEB),
                                    shape = RoundedCornerShape(14.dp),
                                    border = BorderStroke(
                                        1.dp,
                                        if (balanceLeft <= 0.0 && totalBill > 0.0) Color(0xFFBBF7D0) else Color(0xFFFDE68A)
                                    ),
                                    modifier = Modifier.fillMaxWidth()
                                ) {
                                    Column(
                                        modifier = Modifier.padding(12.dp),
                                        verticalArrangement = Arrangement.spacedBy(10.dp)
                                    ) {
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
                                                    Icons.Default.ReceiptLong,
                                                    contentDescription = null,
                                                    tint = Color(0xFF0F766E),
                                                    modifier = Modifier.size(16.dp)
                                                )
                                                Text(
                                                    text = if (invoice != null) "Clinic Pushed Bill & Payment" else "Consultation Fee & Payment",
                                                    fontWeight = FontWeight.ExtraBold,
                                                    fontSize = 12.sp,
                                                    color = Color(0xFF0F172A)
                                                )
                                            }

                                            val payBadgeText = when {
                                                totalBill <= 0.0 -> "NO BILL"
                                                balanceLeft <= 0.0 -> "PAID"
                                                paidAmount > 0.0 -> "PARTIAL"
                                                else -> "UNPAID"
                                            }
                                            Surface(
                                                shape = RoundedCornerShape(6.dp),
                                                color = when (payBadgeText) {
                                                    "PAID" -> Color(0xFFDCFCE7)
                                                    "PARTIAL" -> Color(0xFFFEF3C7)
                                                    else -> Color(0xFFFEE2E2)
                                                }
                                            ) {
                                                Text(
                                                    text = payBadgeText,
                                                    fontWeight = FontWeight.ExtraBold,
                                                    fontSize = 10.sp,
                                                    color = when (payBadgeText) {
                                                        "PAID" -> Color(0xFF15803D)
                                                        "PARTIAL" -> Color(0xFFB45309)
                                                        else -> Color(0xFFB91C1C)
                                                    },
                                                    modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp)
                                                )
                                            }
                                        }

                                        // 3-Column Financial Breakdown: Total Bill | Paid | Remaining Left
                                        Row(
                                            modifier = Modifier.fillMaxWidth(),
                                            horizontalArrangement = Arrangement.SpaceBetween
                                        ) {
                                            Column {
                                                Text("Total Bill", fontSize = 10.sp, color = Color(0xFF64748B))
                                                Text(
                                                    "Rs. ${totalBill.toInt()}",
                                                    fontWeight = FontWeight.ExtraBold,
                                                    fontSize = 14.sp,
                                                    color = Color(0xFF0F172A)
                                                )
                                            }
                                            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                                                Text("Amount Paid", fontSize = 10.sp, color = Color(0xFF64748B))
                                                Text(
                                                    "Rs. ${paidAmount.toInt()}",
                                                    fontWeight = FontWeight.ExtraBold,
                                                    fontSize = 14.sp,
                                                    color = Color(0xFF15803D)
                                                )
                                            }
                                            Column(horizontalAlignment = Alignment.End) {
                                                Text("Remaining Left", fontSize = 10.sp, color = Color(0xFF64748B))
                                                Text(
                                                    "Rs. ${balanceLeft.toInt()}",
                                                    fontWeight = FontWeight.ExtraBold,
                                                    fontSize = 14.sp,
                                                    color = if (balanceLeft > 0.0) Color(0xFFDC2626) else Color(0xFF15803D)
                                                )
                                            }
                                        }

                                        // Date-Wise Bill & Payment Entries Ledger
                                        val invoiceItems = invoice?.items ?: emptyList()
                                        if (invoiceItems.isNotEmpty()) {
                                            Surface(
                                                color = Color(0xFFF8FAFC),
                                                shape = RoundedCornerShape(8.dp),
                                                border = BorderStroke(1.dp, Color(0xFFE2E8F0)),
                                                modifier = Modifier.fillMaxWidth()
                                            ) {
                                                Column(modifier = Modifier.padding(8.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                                                    Text(
                                                        "Date-Wise Bill & Payment Ledger:",
                                                        fontSize = 10.sp,
                                                        fontWeight = FontWeight.Bold,
                                                        color = Color(0xFF475569)
                                                    )
                                                    invoiceItems.forEach { item ->
                                                        Row(
                                                            modifier = Modifier.fillMaxWidth(),
                                                            horizontalArrangement = Arrangement.SpaceBetween
                                                        ) {
                                                            Text(
                                                                text = item.itemName,
                                                                fontSize = 11.sp,
                                                                color = Color(0xFF334155),
                                                                maxLines = 1,
                                                                overflow = TextOverflow.Ellipsis,
                                                                modifier = Modifier.weight(1f)
                                                            )
                                                            Text(
                                                                text = "Rs. ${item.effectiveTotal.toInt()}",
                                                                fontSize = 11.sp,
                                                                fontWeight = FontWeight.Bold,
                                                                color = Color(0xFF0F172A)
                                                            )
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                        // Payment Receipts & Time Log
                                        val paymentLogs = com.dactor.patient.util.PaymentLedgerHelper.parsePaymentRecords(remarks, paidAmount, invoice?.paidAt)
                                        if (paymentLogs.isNotEmpty()) {
                                            Surface(
                                                color = Color(0xFFF0FDF4),
                                                shape = RoundedCornerShape(8.dp),
                                                border = BorderStroke(1.dp, Color(0xFFBBF7D0)),
                                                modifier = Modifier.fillMaxWidth()
                                            ) {
                                                Column(modifier = Modifier.padding(8.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                                                    Text(
                                                        "Payment Receipts & Time Log:",
                                                        fontSize = 10.sp,
                                                        fontWeight = FontWeight.Bold,
                                                        color = Color(0xFF166534)
                                                    )
                                                    paymentLogs.forEachIndexed { pIdx, p ->
                                                        Row(
                                                            modifier = Modifier.fillMaxWidth(),
                                                            horizontalArrangement = Arrangement.SpaceBetween,
                                                            verticalAlignment = Alignment.CenterVertically
                                                        ) {
                                                            Column(modifier = Modifier.weight(1f)) {
                                                                Text(
                                                                    text = p.dateTime,
                                                                    fontSize = 10.5.sp,
                                                                    fontWeight = FontWeight.SemiBold,
                                                                    color = Color(0xFF0F172A)
                                                                )
                                                                if (!p.note.isNullOrBlank()) {
                                                                    Text(
                                                                        text = p.note,
                                                                        fontSize = 9.5.sp,
                                                                        color = Color(0xFF64748B)
                                                                    )
                                                                }
                                                            }
                                                            Text(
                                                                text = "Rs. ${p.amount.toInt()}",
                                                                fontSize = 11.sp,
                                                                fontWeight = FontWeight.Bold,
                                                                color = Color(0xFF15803D)
                                                            )
                                                        }
                                                        if (pIdx < paymentLogs.size - 1) {
                                                            HorizontalDivider(color = Color(0xFFDCFCE7), thickness = 0.5.dp)
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                        Button(
                                            onClick = {
                                                BillPdfDownloader.downloadBillPdf(
                                                    context = context,
                                                    appointment = appt,
                                                    invoice = invoice,
                                                    clinicName = clinicName,
                                                    clinicAddress = clinicAddress,
                                                    doctorName = doctorName,
                                                    doctorSpecialty = doctorSpec,
                                                    clinicalRemarks = com.dactor.patient.util.PaymentLedgerHelper.extractCleanClinicalRemarks(remarks)
                                                )
                                            },
                                            shape = RoundedCornerShape(10.dp),
                                            colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF0284C7)),
                                            contentPadding = PaddingValues(horizontal = 14.dp, vertical = 8.dp),
                                            modifier = Modifier
                                                .fillMaxWidth()
                                                .height(42.dp)
                                        ) {
                                            Icon(Icons.Default.Download, contentDescription = null, modifier = Modifier.size(16.dp))
                                            Spacer(Modifier.width(8.dp))
                                            Text("Download Bill PDF", fontSize = 12.5.sp, fontWeight = FontWeight.Bold)
                                        }
                                    }
                                }

                                // ── 6b. ACTION BUTTONS: RESCHEDULE / FOLLOW-UP & VIEW FULL DETAILS ──
                                val isLabAppt = DiagnosticLabPolicy.isDiagnosticLabAppointment(
                                    appointment = appt,
                                    clinic = clinic,
                                    labReports = labReports
                                )
                                val isLabReportReady = isLabAppt && DiagnosticLabPolicy.isLabReportReadyOrCompleted(
                                    appointment = appt,
                                    labReports = labReports
                                )
                                val canRescheduleMissedLab = isLabAppt && DiagnosticLabPolicy.canRescheduleDiagnosticLab(
                                    appointment = appt,
                                    labReports = labReports,
                                    requireNoShow = true
                                )
                                val isVisitCompleted = if (isLabAppt) {
                                    isLabReportReady
                                } else {
                                    appt.checkinStatus.lowercase() in listOf("done", "completed")
                                }

                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.spacedBy(10.dp)
                                ) {
                                    if (isLabAppt) {
                                        if (isLabReportReady) {
                                            OutlinedButton(
                                                onClick = {
                                                    navController.navigate(NavRoutes.QueueStatus.createRoute(appt.trackingCode10Digit))
                                                },
                                                shape = RoundedCornerShape(12.dp),
                                                border = BorderStroke(1.dp, Color(0xFF00796B)),
                                                colors = ButtonDefaults.outlinedButtonColors(
                                                    containerColor = Color(0xFFE0F2F1),
                                                    contentColor = Color(0xFF00796B)
                                                ),
                                                modifier = Modifier
                                                    .weight(1f)
                                                    .height(44.dp)
                                            ) {
                                                Icon(Icons.Default.Science, contentDescription = null, modifier = Modifier.size(16.dp))
                                                Spacer(Modifier.width(6.dp))
                                                Text("View Lab Report", fontSize = 12.sp, fontWeight = FontWeight.Bold, maxLines = 1)
                                            }
                                        } else if (canRescheduleMissedLab) {
                                            OutlinedButton(
                                                onClick = { apptToRescheduleConfirm = appt },
                                                shape = RoundedCornerShape(12.dp),
                                                border = BorderStroke(1.dp, Color(0xFF0284C7)),
                                                colors = ButtonDefaults.outlinedButtonColors(
                                                    containerColor = Color(0xFFEFF6FF),
                                                    contentColor = Color(0xFF0284C7)
                                                ),
                                                modifier = Modifier
                                                    .weight(1f)
                                                    .height(44.dp)
                                            ) {
                                                Icon(Icons.Default.CalendarMonth, contentDescription = null, modifier = Modifier.size(16.dp))
                                                Spacer(Modifier.width(6.dp))
                                                Text("Reschedule Missed Slot", fontSize = 11.5.sp, fontWeight = FontWeight.Bold, maxLines = 1)
                                            }
                                        } else {
                                            OutlinedButton(
                                                onClick = {
                                                    navController.navigate(NavRoutes.QueueStatus.createRoute(appt.trackingCode10Digit))
                                                },
                                                shape = RoundedCornerShape(12.dp),
                                                border = BorderStroke(1.dp, Color(0xFF0284C7)),
                                                colors = ButtonDefaults.outlinedButtonColors(
                                                    containerColor = Color(0xFFF0F9FF),
                                                    contentColor = Color(0xFF0284C7)
                                                ),
                                                modifier = Modifier
                                                    .weight(1f)
                                                    .height(44.dp)
                                            ) {
                                                Icon(Icons.Default.Schedule, contentDescription = null, modifier = Modifier.size(16.dp))
                                                Spacer(Modifier.width(6.dp))
                                                Text("Sample Status", fontSize = 12.sp, fontWeight = FontWeight.Bold, maxLines = 1)
                                            }
                                        }
                                    } else {
                                        OutlinedButton(
                                            onClick = { apptToRescheduleConfirm = appt },
                                            shape = RoundedCornerShape(12.dp),
                                            border = BorderStroke(1.dp, Color(0xFF0284C7)),
                                            colors = ButtonDefaults.outlinedButtonColors(
                                                containerColor = Color(0xFFF0F9FF),
                                                contentColor = Color(0xFF0284C7)
                                            ),
                                            modifier = Modifier
                                                .weight(1f)
                                                .height(44.dp)
                                        ) {
                                            Icon(
                                                imageVector = if (isVisitCompleted) Icons.Default.EventRepeat else Icons.Default.CalendarMonth,
                                                contentDescription = null,
                                                modifier = Modifier.size(16.dp)
                                            )
                                            Spacer(Modifier.width(6.dp))
                                            Text(
                                                text = if (isVisitCompleted) "Book Follow-Up" else "Reschedule",
                                                fontSize = 12.sp,
                                                fontWeight = FontWeight.Bold,
                                                maxLines = 1
                                            )
                                        }
                                    }

                                    Button(
                                        onClick = { viewingRecordDetails = appt },
                                        shape = RoundedCornerShape(12.dp),
                                        colors = ButtonDefaults.buttonColors(
                                            containerColor = Color(0xFF0284C7),
                                            contentColor = Color.White
                                        ),
                                        modifier = Modifier
                                            .weight(1f)
                                            .height(44.dp)
                                    ) {
                                        Icon(Icons.Default.Info, contentDescription = null, modifier = Modifier.size(16.dp))
                                        Spacer(Modifier.width(6.dp))
                                        Text("View Details", fontSize = 12.5.sp, fontWeight = FontWeight.Bold, maxLines = 1)
                                    }
                                }

                                // ── 7. DIRECT LIVE QUEUE TRACKING BUTTON (IF ACTIVE) ──
                                if (appt.checkinStatus.lowercase() !in listOf("completed", "done", "cancelled")) {
                                    Button(
                                        onClick = {
                                            navController.navigate(NavRoutes.QueueStatus.createRoute(appt.trackingCode10Digit))
                                        },
                                        shape = RoundedCornerShape(12.dp),
                                        colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF0284C7)),
                                        modifier = Modifier
                                            .fillMaxWidth()
                                            .height(42.dp)
                                    ) {
                                        Icon(Icons.Default.Radar, contentDescription = null, modifier = Modifier.size(16.dp))
                                        Spacer(Modifier.width(8.dp))
                                        Text("Track Live Queue Directly", fontSize = 12.sp, fontWeight = FontWeight.Bold)
                                        Spacer(Modifier.width(6.dp))
                                        Icon(Icons.Default.ArrowForward, contentDescription = null, modifier = Modifier.size(14.dp))
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    // ── NAME VERIFICATION GATE FOR LAB REPORT ─────────────────────────────
    if (verifyingReport != null) {
        val targetReport = verifyingReport!!
        AlertDialog(
            onDismissRequest = { verifyingReport = null },
            title = { Text("Confidential Lab Security Gate", fontWeight = FontWeight.Bold) },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(
                        "As per healthcare privacy regulations, enter the patient's full name matching the laboratory requisition to view this report.",
                        fontSize = 12.sp,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    OutlinedTextField(
                        value = enteredPatientName,
                        onValueChange = { enteredPatientName = it },
                        label = { Text("Patient Full Name") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )
                    if (verificationError != null) {
                        Text(verificationError!!, color = MaterialTheme.colorScheme.error, fontSize = 12.sp)
                    }
                }
            },
            confirmButton = {
                Button(
                    onClick = {
                        val expected = targetReport.patientNameVerification
                        val matches = labReportRepository?.verifyPatientName(expected, enteredPatientName) == true ||
                                      enteredPatientName.trim().equals(expected.trim(), ignoreCase = true)
                        if (matches) {
                            val repId = targetReport.id
                            verifyingReport = null
                            navController.navigate(NavRoutes.LabReport.createRoute(repId))
                        } else {
                            verificationError = "Name does not match the laboratory requisition record."
                        }
                    }
                ) {
                    Text("Unlock & View")
                }
            },
            dismissButton = {
                TextButton(onClick = { verifyingReport = null }) {
                    Text("Cancel")
                }
            }
        )
    }



    // ── ADD PATIENT / LINK RECORD TO DIRECTORY DIALOG ─────────────────────
    if (showAddPatientRecordDialog) {
        AlertDialog(
            onDismissRequest = { if (!isAddingDirectoryRecord) showAddPatientRecordDialog = false },
            title = {
                Text("Add Patient to Directory", fontWeight = FontWeight.Bold, fontSize = 18.sp)
            },
            text = {
                Column(
                    modifier = Modifier.fillMaxWidth(),
                    verticalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        FilterChip(
                            selected = addMode == "new",
                            onClick = { addMode = "new" },
                            label = { Text("Add Patient Visit", fontSize = 11.sp, fontWeight = FontWeight.Bold) }
                        )
                        FilterChip(
                            selected = addMode == "code",
                            onClick = { addMode = "code" },
                            label = { Text("Link 10-Digit Code", fontSize = 11.sp, fontWeight = FontWeight.Bold) }
                        )
                    }

                    if (addMode == "code") {
                        Text(
                            "Enter the 10-digit appointment code provided by the clinic to add the patient visit and bill into your directory:",
                            fontSize = 12.sp,
                            color = Color(0xFF64748B)
                        )
                        OutlinedTextField(
                            value = linkCodeInput,
                            onValueChange = { if (it.length <= 10 && it.all { c -> c.isDigit() }) linkCodeInput = it },
                            label = { Text("10-Digit Appointment Code") },
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                            singleLine = true,
                            modifier = Modifier.fillMaxWidth()
                        )
                    } else {
                        OutlinedTextField(
                            value = newPatientName,
                            onValueChange = { newPatientName = it },
                            label = { Text("Patient Full Name *") },
                            singleLine = true,
                            modifier = Modifier.fillMaxWidth()
                        )
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            OutlinedTextField(
                                value = newPatientMobile,
                                onValueChange = { if (it.length <= 10 && it.all { c -> c.isDigit() }) newPatientMobile = it },
                                label = { Text("Mobile") },
                                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone),
                                singleLine = true,
                                modifier = Modifier.weight(1.4f)
                            )
                            OutlinedTextField(
                                value = newPatientAge,
                                onValueChange = { if (it.length <= 3 && it.all { c -> c.isDigit() }) newPatientAge = it },
                                label = { Text("Age") },
                                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                                singleLine = true,
                                modifier = Modifier.weight(0.8f)
                            )
                        }

                        // Select Clinic
                        if (allClinicsList.isNotEmpty()) {
                            Text("Clinic", fontSize = 11.sp, fontWeight = FontWeight.Bold, color = Color(0xFF475569))
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .horizontalScroll(rememberScrollState()),
                                horizontalArrangement = Arrangement.spacedBy(6.dp)
                            ) {
                                allClinicsList.forEach { c ->
                                    FilterChip(
                                        selected = selectedClinicIdForAdd == c.id,
                                        onClick = { selectedClinicIdForAdd = c.id },
                                        label = { Text(c.name, fontSize = 11.sp) }
                                    )
                                }
                            }
                        }

                        // Select Doctor
                        if (allDoctorsList.isNotEmpty()) {
                            Text("Doctor", fontSize = 11.sp, fontWeight = FontWeight.Bold, color = Color(0xFF475569))
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .horizontalScroll(rememberScrollState()),
                                horizontalArrangement = Arrangement.spacedBy(6.dp)
                            ) {
                                allDoctorsList.forEach { d ->
                                    FilterChip(
                                        selected = selectedDoctorIdForAdd == d.id,
                                        onClick = { selectedDoctorIdForAdd = d.id },
                                        label = { Text("Dr. ${d.fullName}", fontSize = 11.sp) }
                                    )
                                }
                            }
                        }

                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            OutlinedTextField(
                                value = newApptDate,
                                onValueChange = { newApptDate = it },
                                label = { Text("Date (YYYY-MM-DD)") },
                                singleLine = true,
                                modifier = Modifier.weight(1f)
                            )
                            OutlinedTextField(
                                value = newApptTime,
                                onValueChange = { newApptTime = it },
                                label = { Text("Time Done") },
                                singleLine = true,
                                modifier = Modifier.weight(1f)
                            )
                        }

                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            OutlinedTextField(
                                value = newTotalBill,
                                onValueChange = { if (it.all { c -> c.isDigit() || c == '.' }) newTotalBill = it },
                                label = { Text("Total Bill (Rs.)") },
                                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                                singleLine = true,
                                modifier = Modifier.weight(1f)
                            )
                            OutlinedTextField(
                                value = newPaidAmount,
                                onValueChange = { if (it.all { c -> c.isDigit() || c == '.' }) newPaidAmount = it },
                                label = { Text("Paid (Rs.)") },
                                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                                singleLine = true,
                                modifier = Modifier.weight(1f)
                            )
                        }
                    }
                }
            },
            confirmButton = {
                Button(
                    onClick = {
                        if (appointmentRepository == null) return@Button
                        isAddingDirectoryRecord = true
                        coroutineScope.launch {
                            try {
                                if (addMode == "code") {
                                    val code = linkCodeInput.trim()
                                    val found = appointmentRepository.getAppointmentByTrackingCode(code)
                                        ?: appointmentRepository.getAppointmentById(code)
                                    if (found != null) {
                                        sessionManager?.unhideRecord(found.trackingCode10Digit)
                                        sessionManager?.unhideRecord(found.id)
                                        sessionManager?.saveTrackingCode(found.trackingCode10Digit, "${found.patientName} \u2022 ${found.appointmentDate}", explicitUnhide = true)
                                        val pid = sessionManager?.getSavedPatientId()
                                        if (!pid.isNullOrBlank()) {
                                            appointmentRepository.claimAppointment(found.id, pid)
                                        }
                                        Toast.makeText(context, "Linked #${found.trackingCode10Digit} to Directory!", Toast.LENGTH_SHORT).show()
                                        showAddPatientRecordDialog = false
                                        loadDirectoryRecords()
                                    } else {
                                        Toast.makeText(context, "No appointment found for code or ID $code", Toast.LENGTH_SHORT).show()
                                    }
                                } else {
                                    if (newPatientName.isBlank()) {
                                        Toast.makeText(context, "Please enter Patient Name", Toast.LENGTH_SHORT).show()
                                        isAddingDirectoryRecord = false
                                        return@launch
                                    }
                                    val cId = selectedClinicIdForAdd.ifBlank { allClinicsList.firstOrNull()?.id ?: "" }
                                    if (cId.isBlank()) {
                                        Toast.makeText(context, "No active clinic found", Toast.LENGTH_SHORT).show()
                                        isAddingDirectoryRecord = false
                                        return@launch
                                    }
                                    val dId = selectedDoctorIdForAdd.ifBlank { allDoctorsList.firstOrNull()?.id }
                                    val code10 = (1..10).map { ('0'..'9').random() }.joinToString("")
                                    val totalVal = newTotalBill.toDoubleOrNull() ?: 500.0
                                    val paidVal = newPaidAmount.toDoubleOrNull() ?: totalVal
                                    val savedEmail = sessionManager?.getSavedEmail()
                                    val resolvedProfileId = if (!savedEmail.isNullOrBlank() && authRepository != null) {
                                        authRepository.getProfileByEmail(savedEmail)?.id
                                    } else null

                                    val apptToCreate = Appointment(
                                        id = UUID.randomUUID().toString(),
                                        trackingCode10Digit = code10,
                                        userId = resolvedProfileId,
                                        clinicId = cId,
                                        doctorId = dId,
                                        patientName = newPatientName.trim(),
                                        patientAge = newPatientAge.toIntOrNull() ?: 25,
                                        patientGender = newPatientGender.ifBlank { "Other" },
                                        patientMobile = newPatientMobile.trim().ifBlank { "9800000000" },
                                        patientEmail = savedEmail,
                                        appointmentDate = newApptDate.trim().ifBlank { LocalDate.now().toString() },
                                        appointmentTime = newApptTime.trim().ifBlank { "10:30 AM" },
                                        checkinStatus = "completed",
                                        paymentStatus = if (paidVal >= totalVal) "paid" else if (paidVal > 0) "partial" else "unpaid",
                                        feeAmount = totalVal
                                    )
                                    val created = appointmentRepository.createAppointment(apptToCreate)
                                    if (created != null) {
                                        sessionManager?.saveTrackingCode(created.trackingCode10Digit, "${created.patientName} \u2022 ${created.appointmentDate}")
                                        appointmentRepository.saveOrUpdateInvoicePayment(
                                            appointment = created,
                                            existingInvoice = null,
                                            totalAmount = totalVal,
                                            paidAmount = paidVal,
                                            remarks = newClinicalRemarks.takeIf { it.isNotBlank() }
                                        )
                                        Toast.makeText(context, "Added ${created.patientName} to Directory!", Toast.LENGTH_SHORT).show()
                                        showAddPatientRecordDialog = false
                                        loadDirectoryRecords()
                                    } else {
                                        Toast.makeText(context, "Failed to add patient record.", Toast.LENGTH_SHORT).show()
                                    }
                                }
                            } finally {
                                isAddingDirectoryRecord = false
                            }
                        }
                    },
                    enabled = !isAddingDirectoryRecord,
                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF0284C7))
                ) {
                    Text(if (isAddingDirectoryRecord) "Saving..." else "Save to Directory")
                }
            },
            dismissButton = {
                TextButton(
                    onClick = { showAddPatientRecordDialog = false },
                    enabled = !isAddingDirectoryRecord
                ) {
                    Text("Cancel")
                }
            }
        )
    }

    // ── 8. COMPREHENSIVE RECORD & VISIT HISTORY DETAILS MODAL ─────────────
    viewingRecordDetails?.let { targetAppt ->
        PatientRecordDetailDialog(
            targetAppt = targetAppt,
            clinicMap = clinicMap,
            doctorMap = doctorMap,
            invoiceMap = invoiceMap,
            remarksMap = remarksMap,
            labReportMap = labReportMap,
            associatedVisits = associatedVisitsForDetail,
            isLoadingVisits = isLoadingVisitsForDetail,
            onDismiss = { viewingRecordDetails = null },
            onSelectVisit = { selectedVisit ->
                viewingRecordDetails = selectedVisit
            },
            onReschedule = { appt ->
                apptToRescheduleConfirm = appt
            },
            onRemove = { appt ->
                apptToRemoveConfirm = appt
            },
            onViewReport = { report ->
                verifyingReport = report
                enteredPatientName = ""
                verificationError = null
            }
        )
    }

    // ── CONFIRMATION DIALOG: REMOVE RECORD ──
    apptToRemoveConfirm?.let { targetAppt ->
        RemoveRecordConfirmDialog(
            targetAppt = targetAppt,
            onDismiss = { apptToRemoveConfirm = null },
            onConfirmRemove = { appt ->
                val code = appt.trackingCode10Digit
                if (code.isNotBlank()) {
                    sessionManager?.removeTrackingCode(code)
                    sessionManager?.hideRecord(code)
                }
                sessionManager?.hideRecord(appt.id)
                Toast.makeText(context, "Record #${code.ifBlank { appt.id.take(8) }} removed from active records", Toast.LENGTH_SHORT).show()
                if (viewingRecordDetails?.id == appt.id) {
                    viewingRecordDetails = null
                }
                apptToRemoveConfirm = null
                coroutineScope.launch { loadDirectoryRecords() }
            }
        )
    }

    // ── CONFIRMATION DIALOG: RESCHEDULE CONSULTATION ──
    apptToRescheduleConfirm?.let { targetAppt ->
        RescheduleConfirmDialog(
            targetAppt = targetAppt,
            clinicMap = clinicMap,
            doctorMap = doctorMap,
            labReports = labReportMap[targetAppt.id] ?: emptyList(),
            onDismiss = { apptToRescheduleConfirm = null },
            onConfirmReschedule = { appt ->
                apptToRescheduleConfirm = null
                viewingRecordDetails = null
                sessionManager?.savePendingReschedule(
                    com.dactor.patient.data.local.UserSessionManager.PendingRescheduleData(
                        appointmentId = appt.id,
                        trackingCode = appt.trackingCode10Digit,
                        clinicId = appt.clinicId,
                        doctorId = appt.doctorId,
                        patientName = appt.patientName,
                        patientMobile = appt.patientMobile,
                        patientAge = appt.patientAge.toString(),
                        patientGender = appt.patientGender ?: "Male",
                        patientEmail = appt.patientEmail,
                        originalDate = appt.appointmentDate,
                        originalTime = appt.appointmentTime,
                        status = appt.status
                    )
                )
                navController.navigate(
                    NavRoutes.Booking.createRoute(
                        clinicId = appt.clinicId,
                        doctorId = appt.doctorId,
                        rescheduleApptId = appt.id
                    )
                )
            }
        )
    }
}

private fun parseAppointmentTimeMinutes(timeStr: String?): Int {
    if (timeStr.isNullOrBlank()) return 12 * 60
    return try {
        val clean = timeStr.split("-", "to").first().trim()
        val parts = clean.split(":", " ")
        var hour = parts[0].toIntOrNull() ?: 12
        val minute = parts.getOrNull(1)?.toIntOrNull() ?: 0
        val isPm = clean.contains("PM", ignoreCase = true)
        val isAm = clean.contains("AM", ignoreCase = true)
        if (isPm && hour < 12) hour += 12
        if (isAm && hour == 12) hour = 0
        hour * 60 + minute
    } catch (_: Exception) {
        12 * 60
    }
}

private fun shouldKeepInAppointmentsTab(
    appt: Appointment,
    queueStatus: String?,
    completedAt: String?,
    hasLabReport: Boolean = false
): Boolean {
    val today = try { LocalDate.now() } catch (_: Exception) { return true }
    val apptDate = try { LocalDate.parse(appt.appointmentDate.trim().take(10)) } catch (_: Exception) { null }
    val isPastDate = apptDate != null && apptDate.isBefore(today)

    val isCompleted = hasLabReport ||
        appt.checkinStatus.trim().lowercase() in DiagnosticLabPolicy.SAMPLE_COLLECTED_OR_FURTHER_STATUSES ||
        appt.status.equals("COMPLETED", ignoreCase = true) ||
        queueStatus?.trim()?.lowercase() in DiagnosticLabPolicy.SAMPLE_COLLECTED_OR_FURTHER_STATUSES

    val isNoShowRaw = queueStatus?.lowercase() in listOf("no_show", "missed") ||
        appt.checkinStatus.lowercase() in listOf("no_show", "missed") ||
        appt.status.lowercase() in listOf("no_show", "missed")

    val isNoShow = isNoShowRaw && !isCompleted
    val isMissed = isNoShow || (isPastDate && !isCompleted)

    val isExplicitlyCancelled = (appt.checkinStatus.lowercase() in listOf("cancelled", "rejected") && !isNoShow) ||
        appt.status.equals("CANCELLED", ignoreCase = true) ||
        appt.status.equals("REJECTED", ignoreCase = true) ||
        (queueStatus?.lowercase() in listOf("cancelled", "rejected") && !isNoShow)

    // Cancelled appointments are hidden from active appointments tab (still accessible in Records)
    if (isExplicitlyCancelled) return false

    // Missed appointments: retain in active appointments tab for up to 7 days so patient can reschedule
    if (isMissed) {
        if (apptDate != null) {
            val daysPassed = java.time.temporal.ChronoUnit.DAYS.between(apptDate, today)
            return daysPassed in 0..7
        }
        return true
    }

    // Active or upcoming appointments are always displayed
    if (!isCompleted) return true

    // For completed / sample-collected appointments: retain if completed within the last 2 days (<= 2 days)
    val refDateStr = completedAt?.take(10) ?: appt.appointmentDate.trim().take(10)
    val compDate = try { LocalDate.parse(refDateStr) } catch (_: Exception) { null }
    if (compDate == null) return true

    val daysPassed = java.time.temporal.ChronoUnit.DAYS.between(compDate, today)
    return daysPassed in 0..2
}

private fun sortAppointmentsSoonerFirst(
    appts: List<Appointment>,
    queueCache: Map<String, QueueEntry> = emptyMap(),
    labReportCache: Map<String, List<LabReport>> = emptyMap()
): List<Appointment> {
    val today = try { LocalDate.now() } catch (_: Exception) { null }

    val comparator = compareBy<Appointment> { appt ->
        val q = queueCache[appt.id]
        val qStatus = q?.status?.lowercase()
        val hasLabReport = !labReportCache[appt.id].isNullOrEmpty()
        val apptDate = try { LocalDate.parse(appt.appointmentDate.trim().take(10)) } catch (_: Exception) { null }
        val isPast = apptDate != null && today != null && apptDate.isBefore(today)

        val isDone = hasLabReport ||
            appt.checkinStatus.trim().lowercase() in DiagnosticLabPolicy.SAMPLE_COLLECTED_OR_FURTHER_STATUSES ||
            appt.status.equals("COMPLETED", ignoreCase = true) ||
            qStatus in DiagnosticLabPolicy.SAMPLE_COLLECTED_OR_FURTHER_STATUSES

        val isMissed = !isDone && (
            qStatus in listOf("no_show", "missed") ||
            appt.checkinStatus.lowercase() in listOf("no_show", "missed") ||
            appt.status.lowercase() in listOf("no_show", "missed") ||
            isPast
        )

        val isToday = apptDate != null && today != null && apptDate.isEqual(today)

        when {
            isToday && !isDone && !isMissed -> 0
            !isPast && !isDone && !isMissed -> 1
            isMissed -> 2
            isDone -> 3
            else -> 4
        }
    }.thenBy { appt ->
        appt.appointmentDate.trim().take(10)
    }.thenBy { appt ->
        parseAppointmentTimeMinutes(appt.appointmentTime)
    }
    return appts.sortedWith(comparator)
}

// =========================================================================
// TAB 2: APPOINTMENTS (Live Queue Tracking, Add Code, Upcoming OPD)
// =========================================================================
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AppointmentsTab(
    navController: NavController,
    appointmentRepository: AppointmentRepository?,
    queueRepository: QueueRepository?,
    doctorRepository: DoctorRepository?,
    clinicRepository: ClinicRepository? = null,
    labReportRepository: LabReportRepository? = null,
    authRepository: AuthRepository? = null,
    sessionManager: UserSessionManager?
) {
    val context = LocalContext.current
    val coroutineScope = rememberCoroutineScope()

    var trackingInput by remember { mutableStateOf("") }
    var isAddingCode by remember { mutableStateOf(false) }
    var addCodeMessage by remember { mutableStateOf<String?>(null) }

    val cachedInitial = remember {
        val l1 = appointmentRepository?.getCachedAppointments()?.filter {
            shouldKeepInAppointmentsTab(it, queueStatus = null, completedAt = null)
        }
        if (!l1.isNullOrEmpty()) sortAppointmentsSoonerFirst(l1)
        else {
            val l2 = sessionManager?.getCachedActiveAppointments()?.filter {
                shouldKeepInAppointmentsTab(it, queueStatus = null, completedAt = null)
            }
            if (!l2.isNullOrEmpty()) sortAppointmentsSoonerFirst(l2) else emptyList()
        }
    }
    var activeAppts by remember { mutableStateOf<List<Appointment>>(cachedInitial) }
    var isLoading by remember { mutableStateOf(cachedInitial.isEmpty()) }
    var isRefreshing by remember { mutableStateOf(false) }

    // Associated entity caches pre-warmed from repositories
    val clinicCache = remember {
        mutableStateMapOf<String, Clinic>().apply {
            clinicRepository?.getCachedClinics()?.forEach { put(it.id, it) }
        }
    }
    val doctorCache = remember {
        mutableStateMapOf<String, Doctor>().apply {
            doctorRepository?.getCachedAllDoctors()?.forEach { put(it.id, it) }
        }
    }
    val queueCache = remember { mutableStateMapOf<String, QueueEntry>() }
    val clinicQueueCache = remember { mutableStateMapOf<String, List<QueueEntry>>() }
    val labReportCache = remember { mutableStateMapOf<String, List<LabReport>>() }

    // Confirmation Dialog States
    var apptToRescheduleConfirm by remember { mutableStateOf<Appointment?>(null) }
    var apptToCancelConfirm by remember { mutableStateOf<Appointment?>(null) }
    var isCancelling by remember { mutableStateOf(false) }

    suspend fun loadActiveAppointments() {
        if (activeAppts.isEmpty()) {
            isLoading = true
        } else {
            isRefreshing = true
        }
        try {
            val patientId = sessionManager?.getSavedPatientId() ?: ""
            val email = sessionManager?.getSavedEmail()?.takeIf { it.isNotBlank() }
                ?: authRepository?.getCurrentUserEmail()
            val phone = sessionManager?.getSavedPhone()?.takeIf { it.isNotBlank() }
            val savedCodes = sessionManager?.getSavedTrackingCodes()?.map { it.first } ?: emptyList()

            val combined = if (appointmentRepository != null) {
                appointmentRepository.getAllPatientAppointments(
                    userId = patientId,
                    email = email,
                    phone = phone,
                    trackingCodes = savedCodes
                )
            } else emptyList()

            val hiddenCodes = sessionManager?.getHiddenRecordCodes() ?: emptySet()
            for (appt in combined) {
                if (appt.trackingCode10Digit.isNotBlank() && !hiddenCodes.contains(appt.trackingCode10Digit) && !hiddenCodes.contains(appt.id)) {
                    sessionManager?.saveTrackingCode(
                        appt.trackingCode10Digit,
                        "${appt.patientName} \u2022 ${appt.appointmentDate}"
                    )
                }
                val isDone = appt.checkinStatus.lowercase() in listOf("completed", "done", "cancelled")
                if (isDone) {
                    NotificationHelper.cancelAppointmentNotifications(context, appt.id)
                    if (appt.trackingCode10Digit.isNotBlank()) {
                        NotificationHelper.cancelAppointmentNotifications(context, appt.trackingCode10Digit)
                    }
                }
            }

            val candidateAppts = combined.filter {
                shouldKeepInAppointmentsTab(it, queueStatus = null, completedAt = null)
            }

            // Populate entity caches and check live queue statuses concurrently
            val distinctClinicIds = candidateAppts.mapNotNull { it.clinicId?.takeIf { id -> id.isNotBlank() } }.distinct()
            val distinctDocIds = candidateAppts.mapNotNull { it.doctorId?.takeIf { id -> id.isNotBlank() } }.distinct()

            coroutineScope {
                val clinicJobs = distinctClinicIds.map { cId ->
                    async {
                        if (clinicRepository != null && !clinicCache.containsKey(cId)) {
                            try {
                                val c = clinicRepository.getClinicById(cId, forceRefresh = false)
                                if (c != null) clinicCache[cId] = c
                            } catch (ignored: Exception) {}
                        }
                        if (queueRepository != null) {
                            try {
                                val entries = queueRepository.getQueueEntriesForClinic(cId)
                                clinicQueueCache[cId] = entries
                            } catch (ignored: Exception) {}
                        }
                    }
                }

                val docJobs = distinctDocIds.map { dId ->
                    async {
                        if (doctorRepository != null && !doctorCache.containsKey(dId)) {
                            try {
                                val d = doctorRepository.getDoctorById(dId, forceRefresh = false)
                                if (d != null) doctorCache[dId] = d
                            } catch (ignored: Exception) {}
                        }
                    }
                }

                val queueJobs = candidateAppts.map { appt ->
                    async {
                        if (queueRepository != null) {
                            try {
                                val freshQ = queueRepository.getQueueStatus(appt.id)
                                if (freshQ != null) {
                                    queueCache[appt.id] = freshQ
                                }
                            } catch (ignored: Exception) {}
                        }
                        if (labReportRepository != null) {
                            try {
                                val reports = labReportRepository.getLabReportsForAppointment(
                                    appointmentId = appt.id,
                                    trackingCode = appt.trackingCode10Digit
                                )
                                labReportCache[appt.id] = reports
                            } catch (ignored: Exception) {}
                        }
                    }
                }

                awaitAll(*(clinicJobs + docJobs + queueJobs).toTypedArray())
            }

            val stillActive = mutableListOf<Appointment>()
            for (appt in candidateAppts) {
                val q = queueCache[appt.id]
                val qStatus = q?.status?.lowercase()
                val qCompletedAt = q?.completedAt
                val hasLabReport = !labReportCache[appt.id].isNullOrEmpty()
                val isDoneOrCancelled = qStatus in listOf("completed", "done", "cancelled", "rejected", "report_prepared", "prepared", "delivered") ||
                    appt.checkinStatus.lowercase() in listOf("completed", "done", "cancelled", "rejected", "report_prepared", "prepared", "delivered")
                if (isDoneOrCancelled) {
                    NotificationHelper.cancelAppointmentNotifications(context, appt.id)
                    if (appt.trackingCode10Digit.isNotBlank()) {
                        NotificationHelper.cancelAppointmentNotifications(context, appt.trackingCode10Digit)
                    }
                }

                if (shouldKeepInAppointmentsTab(appt, queueStatus = qStatus, completedAt = qCompletedAt, hasLabReport = hasLabReport)) {
                    stillActive.add(appt)
                }
            }

            val sortedAppts = sortAppointmentsSoonerFirst(stillActive, queueCache, labReportCache)
            activeAppts = sortedAppts
            appointmentRepository?.setCachedAppointments(sortedAppts)
            sessionManager?.saveCachedActiveAppointments(sortedAppts)
        } catch (e: Exception) {
            e.printStackTrace()
        } finally {
            isLoading = false
            isRefreshing = false
        }
    }

    val navBackStackEntry by navController.currentBackStackEntryAsState()
    val currentRoute = navBackStackEntry?.destination?.route
    val lifecycleOwner = androidx.compose.ui.platform.LocalLifecycleOwner.current

    LaunchedEffect(currentRoute) {
        loadActiveAppointments()
    }

    DisposableEffect(lifecycleOwner) {
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_RESUME) {
                coroutineScope.launch {
                    loadActiveAppointments()
                }
            }
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose {
            lifecycleOwner.lifecycle.removeObserver(observer)
        }
    }

    val todayDateStr = remember {
        try { LocalDate.now().toString() } catch (e: Exception) { "" }
    }
    val todayInQueueCount = activeAppts.count { it.appointmentDate.trim().take(10) == todayDateStr }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(Color(0xFFF8FAFC))
    ) {
        // ── 1. TOP HEADER BANNER (Active Appointments + Queue Count) ─────────
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .background(
                    Brush.verticalGradient(
                        colors = listOf(Color(0xFF0284C7), Color(0xFF0369A1))
                    )
                )
                .padding(horizontal = 20.dp, vertical = 18.dp)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                    Text(
                        text = "Active Appointments",
                        fontSize = 22.sp,
                        fontWeight = FontWeight.Bold,
                        color = Color.White
                    )
                    Text(
                        text = "Your health, our priority",
                        fontSize = 12.sp,
                        color = Color.White.copy(alpha = 0.85f)
                    )
                }

                // Top Right Pill Badge (Reflects live queue vs scheduled)
                Surface(
                    shape = RoundedCornerShape(20.dp),
                    color = Color.White.copy(alpha = 0.18f),
                    border = BorderStroke(1.dp, Color.White.copy(alpha = 0.25f))
                ) {
                    Row(
                        modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(6.dp)
                    ) {
                        Icon(
                            Icons.Default.People,
                            contentDescription = null,
                            tint = Color.White,
                            modifier = Modifier.size(16.dp)
                        )
                        Text(
                            text = if (todayInQueueCount > 0) "$todayInQueueCount in queue" else "${activeAppts.size} scheduled",
                            fontSize = 12.sp,
                            fontWeight = FontWeight.Bold,
                            color = Color.White
                        )
                    }
                }
            }
        }

        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(horizontal = 16.dp),
            contentPadding = PaddingValues(top = 16.dp, bottom = 28.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            // ── 2. TRACK APPOINTMENT CARD ────────────────────────────────────
            item {
                Card(
                    shape = RoundedCornerShape(18.dp),
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
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(12.dp)
                        ) {
                            Surface(
                                shape = RoundedCornerShape(12.dp),
                                color = Color(0xFF0284C7),
                                modifier = Modifier.size(42.dp)
                            ) {
                                Box(contentAlignment = Alignment.Center) {
                                    Icon(
                                        Icons.Default.QrCodeScanner,
                                        contentDescription = null,
                                        tint = Color.White,
                                        modifier = Modifier.size(22.dp)
                                    )
                                }
                            }

                            Column {
                                Text(
                                    text = "Track Appointment",
                                    fontWeight = FontWeight.Bold,
                                    fontSize = 15.sp,
                                    color = Color(0xFF0F172A)
                                )
                                Text(
                                    text = "Enter your 10 digit appointment code",
                                    fontSize = 11.sp,
                                    color = Color(0xFF64748B)
                                )
                            }
                        }

                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(10.dp)
                        ) {
                            OutlinedTextField(
                                value = trackingInput,
                                onValueChange = {
                                    if (it.length <= 10 && it.all { c -> c.isDigit() }) trackingInput = it
                                },
                                placeholder = { Text("e.g. 1234567890", fontSize = 13.sp) },
                                leadingIcon = {
                                    Icon(
                                        Icons.Default.ConfirmationNumber,
                                        contentDescription = null,
                                        tint = Color(0xFF0284C7),
                                        modifier = Modifier.size(18.dp)
                                    )
                                },
                                trailingIcon = {
                                    IconButton(
                                        onClick = {
                                            val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
                                            val text = clipboard.primaryClip?.getItemAt(0)?.text?.toString() ?: ""
                                            val digits = text.filter { it.isDigit() }.take(10)
                                            if (digits.length == 10) trackingInput = digits
                                        }
                                    ) {
                                        Icon(Icons.Default.ContentPaste, contentDescription = "Paste", modifier = Modifier.size(16.dp))
                                    }
                                },
                                singleLine = true,
                                textStyle = androidx.compose.ui.text.TextStyle(
                                    fontSize = 14.sp,
                                    fontWeight = FontWeight.SemiBold,
                                    color = Color(0xFF0F172A),
                                    lineHeight = 18.sp
                                ),
                                shape = RoundedCornerShape(12.dp),
                                colors = OutlinedTextFieldDefaults.colors(
                                    focusedBorderColor = Color(0xFF0284C7),
                                    unfocusedBorderColor = Color(0xFFCBD5E1),
                                    focusedContainerColor = Color(0xFFF8FAFC),
                                    unfocusedContainerColor = Color(0xFFF8FAFC)
                                ),
                                modifier = Modifier
                                    .weight(1f)
                                    .height(52.dp)
                            )

                            Button(
                                onClick = {
                                    val input = trackingInput.trim()
                                    if (input.isNotBlank() && appointmentRepository != null) {
                                        coroutineScope.launch {
                                            isAddingCode = true
                                            val appt = appointmentRepository.getAppointmentByTrackingCode(input)
                                                ?: appointmentRepository.getAppointmentById(input)
                                            if (appt != null) {
                                                sessionManager?.unhideRecord(appt.trackingCode10Digit)
                                                sessionManager?.unhideRecord(appt.id)
                                                sessionManager?.saveTrackingCode(appt.trackingCode10Digit, "${appt.patientName} \u2022 ${appt.appointmentDate}", explicitUnhide = true)
                                                addCodeMessage = "✓ Code #${appt.trackingCode10Digit} verified!"
                                                val targetCode = appt.trackingCode10Digit
                                                trackingInput = ""
                                                loadActiveAppointments()
                                                navController.navigate(NavRoutes.QueueStatus.createRoute(targetCode))
                                            } else {
                                                addCodeMessage = "No booking found for $input."
                                            }
                                            isAddingCode = false
                                        }
                                    }
                                },
                                shape = RoundedCornerShape(12.dp),
                                colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF0284C7)),
                                enabled = trackingInput.isNotBlank() && !isAddingCode,
                                modifier = Modifier.height(52.dp)
                            ) {
                                Text(if (isAddingCode) "..." else "Track", fontSize = 13.sp, fontWeight = FontWeight.Bold)
                                Spacer(Modifier.width(4.dp))
                                Icon(Icons.Default.ArrowForward, contentDescription = null, modifier = Modifier.size(15.dp))
                            }
                        }

                        if (addCodeMessage != null) {
                            Text(
                                text = addCodeMessage!!,
                                fontSize = 11.sp,
                                fontWeight = FontWeight.SemiBold,
                                color = if (addCodeMessage!!.startsWith("✓")) Color(0xFF10B981) else MaterialTheme.colorScheme.error
                            )
                        }
                    }
                }
            }

            // ── 3. APPOINTMENTS LIST ─────────────────────────────────────────
            if (isRefreshing && activeAppts.isNotEmpty()) {
                item {
                    LinearProgressIndicator(
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(3.dp)
                            .clip(RoundedCornerShape(2.dp)),
                        color = Color(0xFF0284C7),
                        trackColor = Color(0xFFE2E8F0)
                    )
                }
            }

            if (isLoading && activeAppts.isEmpty()) {
                items(2) {
                    com.dactor.patient.ui.common.AppointmentShimmerCard()
                }
            } else if (activeAppts.isEmpty()) {
                item {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(24.dp),
                        contentAlignment = Alignment.Center
                    ) {
                        Column(
                            horizontalAlignment = Alignment.CenterHorizontally,
                            verticalArrangement = Arrangement.spacedBy(10.dp)
                        ) {
                            Icon(
                                Icons.Default.EventAvailable,
                                contentDescription = null,
                                tint = Color(0xFF0284C7).copy(alpha = 0.5f),
                                modifier = Modifier.size(54.dp)
                            )
                            Text("No Active Appointments", fontWeight = FontWeight.Bold, fontSize = 16.sp)
                            Text(
                                "You don't have any waiting or upcoming consultations right now. Book a slot or enter your 10-digit code above to track live.",
                                fontSize = 12.sp,
                                color = Color(0xFF64748B),
                                textAlign = androidx.compose.ui.text.style.TextAlign.Center
                            )
                        }
                    }
                }
            } else {
                items(activeAppts, key = { it.id }) { appt ->
                    val clinic = appt.clinicId?.let { clinicCache[it] }
                    val doctor = appt.doctorId?.let { doctorCache[it] }
                    val qEntry = queueCache[appt.id]

                    val clinicName = clinic?.name ?: "Himalayan Health Clinic"
                    val clinicAddress = clinic?.addressText ?: "Thamel, Kathmandu"
                    val doctorName = doctor?.fullName ?: "Ramesh Shrestha"
                    val apptDateStr = appt.appointmentDate.trim().take(10)

                    val todayLocalDate = LocalDate.now()
                    val todayDateStr = todayLocalDate.toString()
                    val isToday = apptDateStr == todayDateStr
                    val parsedApptLocalDate = try { LocalDate.parse(apptDateStr) } catch (_: Exception) { null }
                    val isTomorrow = parsedApptLocalDate?.isEqual(todayLocalDate.plusDays(1)) ?: false
                    val isPastDate = parsedApptLocalDate != null && parsedApptLocalDate.isBefore(todayLocalDate)

                    val formattedDateLabel = when {
                        isToday -> "Today"
                        isTomorrow -> "Tomorrow"
                        parsedApptLocalDate != null -> parsedApptLocalDate.format(java.time.format.DateTimeFormatter.ofPattern("d MMM", java.util.Locale.ENGLISH))
                        else -> apptDateStr
                    }

                    val clinicEntries = appt.clinicId?.let { clinicQueueCache[it] } ?: emptyList()
                    val myPos = qEntry?.queuePosition ?: 1
                    val liveAhead = if (isToday && clinicEntries.isNotEmpty()) {
                        val sortedActive = clinicEntries
                            .filter { it.status == "waiting" || it.status == "inside" || it.status == "in_consultation" }
                            .sortedWith(
                                compareBy<com.dactor.patient.data.model.QueueEntry> { if (it.status == "inside" || it.status == "in_consultation") 0 else 1 }
                                    .thenBy { it.queuePosition }
                            )
                        val myIdx = sortedActive.indexOfFirst { it.appointmentId == appt.id || it.id == qEntry?.id }
                        when {
                            qEntry?.status in listOf("inside", "in_consultation") -> 0
                            myIdx >= 0 -> myIdx
                            else -> clinicEntries.count { (it.status == "waiting" || it.status == "inside") && it.queuePosition < myPos }
                        }
                    } else if (isToday) {
                        (myPos - 1).coerceAtLeast(0)
                    } else {
                        0
                    }
                    val totalWaiting = if (clinicEntries.isNotEmpty()) {
                        clinicEntries.count { it.status == "waiting" || it.status == "inside" }
                    } else {
                        liveAhead + 1
                    }
                    val isInClinic = doctor?.isInClinic == true
                    val isWithDoctor = isToday && qEntry?.status == "inside"
                    val isClinicOnBreak = clinic?.isOnBreak == true
                    val apptLabReports = labReportCache[appt.id] ?: emptyList()
                    val isLabAppt = DiagnosticLabPolicy.isDiagnosticLabAppointment(
                        appointment = appt,
                        clinic = clinic,
                        queueStatus = qEntry?.status,
                        labReports = apptLabReports
                    )
                    val isLabSampleDoneOrFurther = isLabAppt && DiagnosticLabPolicy.isSampleCollectedOrFurther(
                        appointment = appt,
                        queueStatus = qEntry?.status,
                        labReports = apptLabReports
                    )
                    val isLabReportReady = isLabAppt && DiagnosticLabPolicy.isLabReportReadyOrCompleted(
                        appointment = appt,
                        queueStatus = qEntry?.status,
                        labReports = apptLabReports
                    )
                    val isConsultationDone = isLabSampleDoneOrFurther ||
                        qEntry?.status?.lowercase() in listOf("done", "completed") ||
                        appt.checkinStatus.lowercase() in listOf("done", "completed") ||
                        appt.status.equals("COMPLETED", ignoreCase = true)

                    val isNoShowStatus = !isConsultationDone && (
                        qEntry?.status?.lowercase() in listOf("no_show", "missed") ||
                        appt.checkinStatus.lowercase() in listOf("no_show", "missed") ||
                        appt.status.lowercase() in listOf("no_show", "missed")
                    )

                    val isMissed = !isConsultationDone && (isNoShowStatus || isPastDate)

                    // Calculate live queue timing estimate ONLY for today's appointment
                    val timingEstimate = remember(clinic, doctor, qEntry, liveAhead, isInClinic, isClinicOnBreak, clinicEntries, isToday) {
                        if (isToday) {
                            QueueRepository.calculateLiveQueueTimingEstimate(
                                clinic = clinic,
                                isDoctorInClinic = isInClinic,
                                allClinicQueueEntries = clinicEntries,
                                targetEntry = qEntry,
                                fallbackPatientsAhead = liveAhead,
                                appointmentTime = appt.appointmentTime,
                                appointmentDate = appt.appointmentDate
                            )
                        } else {
                            com.dactor.patient.data.repository.LiveQueueTimingEstimate(
                                estimatedTimeLeftText = "Scheduled",
                                expectedExactTimeText = appt.appointmentTime ?: "10:00 AM",
                                doctorStatusBanner = null,
                                isDoctorNotInside = !isInClinic,
                                isSoonBeReady = false
                            )
                        }
                    }

                    // Calculate early arrival time (15 mins early) for scheduled slots
                    val earlyArrivalText = remember(appt.appointmentTime) {
                        try {
                            val rawTime = (appt.appointmentTime ?: "10:00 AM").split("-").first().trim()
                            val parsedTime = java.time.LocalTime.parse(rawTime, java.time.format.DateTimeFormatter.ofPattern("hh:mm a", java.util.Locale.US))
                            parsedTime.minusMinutes(15).format(java.time.format.DateTimeFormatter.ofPattern("hh:mm a", java.util.Locale.US))
                        } catch (_: Exception) {
                            try {
                                val rawTime = (appt.appointmentTime ?: "10:00 AM").split("-").first().trim()
                                val parsedTime = java.time.LocalTime.parse(rawTime, java.time.format.DateTimeFormatter.ofPattern("h:mm a", java.util.Locale.US))
                                parsedTime.minusMinutes(15).format(java.time.format.DateTimeFormatter.ofPattern("h:mm a", java.util.Locale.US))
                            } catch (_: Exception) {
                                "15 mins early"
                            }
                        }
                    }

                    val clinicImgUrl = clinic?.resolvedLogoUrl ?: clinic?.resolvedCoverPictureUrl
                    val clinicInitials = remember(clinicName) {
                        clinicName.split(" ")
                            .filter { it.isNotBlank() }
                            .take(2)
                            .mapNotNull { it.firstOrNull()?.uppercaseChar() }
                            .joinToString("")
                            .ifBlank { "CL" }
                    }

                    val doctorImgUrl = doctor?.resolvedProfilePictureUrl
                    val doctorInitials = remember(doctorName) {
                        doctorName.split(" ")
                            .filter { it.isNotBlank() }
                            .take(2)
                            .mapNotNull { it.firstOrNull()?.uppercaseChar() }
                            .joinToString("")
                            .ifBlank { "DR" }
                    }

                    Card(
                        shape = RoundedCornerShape(20.dp),
                        colors = CardDefaults.cardColors(containerColor = Color.White),
                        border = BorderStroke(1.dp, Color(0xFFE2E8F0)),
                        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Column(
                            modifier = Modifier.padding(18.dp),
                            verticalArrangement = Arrangement.spacedBy(14.dp)
                        ) {
                            // ── A. Clinic Header & Status Pill ───────────────
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.Top
                            ) {
                                Row(
                                    modifier = Modifier.weight(1f),
                                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    // Real Clinic Picture / Logo with Fallback Initials
                                    Surface(
                                        shape = RoundedCornerShape(12.dp),
                                        color = Color(0xFFE0F2FE),
                                        border = BorderStroke(1.dp, Color(0xFFBAE6FD)),
                                        modifier = Modifier.size(48.dp)
                                    ) {
                                        if (!clinicImgUrl.isNullOrBlank()) {
                                            coil.compose.AsyncImage(
                                                model = clinicImgUrl,
                                                contentDescription = clinicName,
                                                contentScale = androidx.compose.ui.layout.ContentScale.Crop,
                                                modifier = Modifier.fillMaxSize()
                                            )
                                        } else {
                                            Box(contentAlignment = Alignment.Center) {
                                                Text(
                                                    text = clinicInitials,
                                                    fontWeight = FontWeight.Bold,
                                                    fontSize = 16.sp,
                                                    color = Color(0xFF0284C7)
                                                )
                                            }
                                        }
                                    }

                                    Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                                        Text(
                                            text = clinicName,
                                            fontWeight = FontWeight.Bold,
                                            fontSize = 16.sp,
                                            color = Color(0xFF0F172A)
                                        )
                                        Row(
                                            verticalAlignment = Alignment.CenterVertically,
                                            horizontalArrangement = Arrangement.spacedBy(3.dp)
                                        ) {
                                            Icon(Icons.Default.LocationOn, contentDescription = null, tint = Color(0xFF0284C7), modifier = Modifier.size(13.dp))
                                            Text(
                                                text = clinicAddress,
                                                fontSize = 11.sp,
                                                color = Color(0xFF64748B)
                                            )
                                        }
                                    }
                                }

                                // Status Pill: Completed, In OPD queue (Today) or Scheduled for Tomorrow/Date
                                if (isConsultationDone) {
                                    Surface(
                                        shape = RoundedCornerShape(14.dp),
                                        color = Color(0xFFDCFCE7),
                                        border = BorderStroke(1.dp, Color(0xFF86EFAC))
                                    ) {
                                        Row(
                                            modifier = Modifier.padding(horizontal = 9.dp, vertical = 4.dp),
                                            verticalAlignment = Alignment.CenterVertically,
                                            horizontalArrangement = Arrangement.spacedBy(4.dp)
                                        ) {
                                            Icon(
                                                Icons.Default.CheckCircle,
                                                contentDescription = null,
                                                tint = Color(0xFF15803D),
                                                modifier = Modifier.size(12.dp)
                                            )
                                            Text(
                                                text = "Consultation completed",
                                                fontSize = 11.sp,
                                                fontWeight = FontWeight.Bold,
                                                color = Color(0xFF15803D)
                                            )
                                        }
                                    }
                                } else if (isMissed) {
                                    Surface(
                                        shape = RoundedCornerShape(14.dp),
                                        color = Color(0xFFFFE4E6),
                                        border = BorderStroke(1.dp, Color(0xFFFB7185))
                                    ) {
                                        Row(
                                            modifier = Modifier.padding(horizontal = 9.dp, vertical = 4.dp),
                                            verticalAlignment = Alignment.CenterVertically,
                                            horizontalArrangement = Arrangement.spacedBy(4.dp)
                                        ) {
                                            Icon(
                                                Icons.Default.EventBusy,
                                                contentDescription = null,
                                                tint = Color(0xFFE11D48),
                                                modifier = Modifier.size(12.dp)
                                            )
                                            Text(
                                                text = "Missed Appointment",
                                                fontSize = 11.sp,
                                                fontWeight = FontWeight.Bold,
                                                color = Color(0xFFBE123C)
                                            )
                                        }
                                    }
                                } else if (isToday) {
                                    val isLate = timingEstimate.isPatientLate
                                    Surface(
                                        shape = RoundedCornerShape(14.dp),
                                        color = when {
                                            isLate -> Color(0xFFFFE4E6)
                                            isWithDoctor -> Color(0xFFDCFCE7)
                                            else -> Color(0xFFE0F2FE)
                                        },
                                        border = BorderStroke(1.dp, when {
                                            isLate -> Color(0xFFFB7185)
                                            isWithDoctor -> Color(0xFF86EFAC)
                                            else -> Color(0xFFBAE6FD)
                                        })
                                    ) {
                                        Row(
                                            modifier = Modifier.padding(horizontal = 9.dp, vertical = 4.dp),
                                            verticalAlignment = Alignment.CenterVertically,
                                            horizontalArrangement = Arrangement.spacedBy(4.dp)
                                        ) {
                                            if (isLate) {
                                                Icon(
                                                    Icons.Default.Warning,
                                                    contentDescription = null,
                                                    tint = Color(0xFFE11D48),
                                                    modifier = Modifier.size(11.dp)
                                                )
                                                Text(
                                                    text = "Arrive soon, you are late",
                                                    fontSize = 11.sp,
                                                    fontWeight = FontWeight.Bold,
                                                    color = Color(0xFFBE123C)
                                                )
                                            } else {
                                                Box(
                                                    modifier = Modifier
                                                        .size(6.dp)
                                                        .background(if (isWithDoctor) Color(0xFF15803D) else Color(0xFF0284C7), CircleShape)
                                                )
                                                Text(
                                                    text = if (isWithDoctor) "With Doctor" else "In OPD queue",
                                                    fontSize = 11.sp,
                                                    fontWeight = FontWeight.Bold,
                                                    color = if (isWithDoctor) Color(0xFF15803D) else Color(0xFF0284C7)
                                                )
                                            }
                                        }
                                    }
                                } else if (isTomorrow) {
                                    Surface(
                                        shape = RoundedCornerShape(14.dp),
                                        color = Color(0xFFE0F2FE),
                                        border = BorderStroke(1.dp, Color(0xFFBAE6FD))
                                    ) {
                                        Row(
                                            modifier = Modifier.padding(horizontal = 9.dp, vertical = 4.dp),
                                            verticalAlignment = Alignment.CenterVertically,
                                            horizontalArrangement = Arrangement.spacedBy(4.dp)
                                        ) {
                                            Icon(
                                                Icons.Default.CalendarToday,
                                                contentDescription = null,
                                                tint = Color(0xFF0284C7),
                                                modifier = Modifier.size(11.dp)
                                            )
                                            Text(
                                                text = "Scheduled for Tomorrow",
                                                fontSize = 11.sp,
                                                fontWeight = FontWeight.Bold,
                                                color = Color(0xFF0284C7)
                                            )
                                        }
                                    }
                                } else {
                                    Surface(
                                        shape = RoundedCornerShape(14.dp),
                                        color = Color(0xFFF1F5F9),
                                        border = BorderStroke(1.dp, Color(0xFFCBD5E1))
                                    ) {
                                        Row(
                                            modifier = Modifier.padding(horizontal = 9.dp, vertical = 4.dp),
                                            verticalAlignment = Alignment.CenterVertically,
                                            horizontalArrangement = Arrangement.spacedBy(4.dp)
                                        ) {
                                            Icon(
                                                Icons.Default.CalendarToday,
                                                contentDescription = null,
                                                tint = Color(0xFF475569),
                                                modifier = Modifier.size(11.dp)
                                            )
                                            Text(
                                                text = "Scheduled: $formattedDateLabel",
                                                fontSize = 11.sp,
                                                fontWeight = FontWeight.Bold,
                                                color = Color(0xFF475569)
                                            )
                                        }
                                    }
                                }
                            }

                            // ── B. Progress Stepper Bar ──
                            Column(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(horizontal = 8.dp),
                                verticalArrangement = Arrangement.spacedBy(6.dp)
                            ) {
                                if (isMissed) {
                                    Row(
                                        modifier = Modifier.fillMaxWidth(),
                                        verticalAlignment = Alignment.CenterVertically
                                    ) {
                                        Surface(
                                            shape = CircleShape,
                                            color = Color(0xFF0284C7),
                                            modifier = Modifier.size(18.dp)
                                        ) {
                                            Box(contentAlignment = Alignment.Center) {
                                                Icon(Icons.Default.Check, contentDescription = null, tint = Color.White, modifier = Modifier.size(12.dp))
                                            }
                                        }
                                        Box(
                                            modifier = Modifier
                                                .weight(1f)
                                                .height(3.dp)
                                                .background(Color(0xFFFDA4AF))
                                        )
                                        Surface(
                                            shape = CircleShape,
                                            color = Color(0xFFFFE4E6),
                                            border = BorderStroke(1.5.dp, Color(0xFFE11D48)),
                                            modifier = Modifier.size(18.dp)
                                        ) {
                                            Box(contentAlignment = Alignment.Center) {
                                                Icon(Icons.Default.Close, contentDescription = null, tint = Color(0xFFE11D48), modifier = Modifier.size(11.dp))
                                            }
                                        }
                                        Box(
                                            modifier = Modifier
                                                .weight(1f)
                                                .height(3.dp)
                                                .background(Color(0xFFE2E8F0))
                                        )
                                        Surface(
                                            shape = CircleShape,
                                            color = Color(0xFFE2E8F0),
                                            modifier = Modifier.size(18.dp)
                                        ) {}
                                    }
                                    Row(
                                        modifier = Modifier.fillMaxWidth(),
                                        horizontalArrangement = Arrangement.SpaceBetween
                                    ) {
                                        Text("Booked", fontSize = 11.sp, color = Color(0xFF0284C7), fontWeight = FontWeight.Bold)
                                        Text("Queue Closed", fontSize = 11.sp, color = Color(0xFFE11D48), fontWeight = FontWeight.Bold)
                                        Text("Missed", fontSize = 11.sp, color = Color(0xFF94A3B8), fontWeight = FontWeight.Medium)
                                    }
                                } else {
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    // 1. Booked (Completed Checkmark)
                                    Surface(
                                        shape = CircleShape,
                                        color = Color(0xFF0284C7),
                                        modifier = Modifier.size(18.dp)
                                    ) {
                                        Box(contentAlignment = Alignment.Center) {
                                            Icon(Icons.Default.Check, contentDescription = null, tint = Color.White, modifier = Modifier.size(12.dp))
                                        }
                                    }

                                    // Line 1
                                    Box(
                                        modifier = Modifier
                                            .weight(1f)
                                            .height(3.dp)
                                            .background(if (isToday || isConsultationDone) Color(0xFF0284C7) else Color(0xFFCBD5E1))
                                    )

                                    // 2. In Queue (Active only if Today or Done)
                                    Surface(
                                        shape = CircleShape,
                                        color = if (isToday || isConsultationDone) Color(0xFF0284C7) else Color(0xFFCBD5E1),
                                        border = BorderStroke(2.dp, Color.White),
                                        modifier = Modifier.size(18.dp)
                                    ) {
                                        if ((isToday && isWithDoctor) || isConsultationDone) {
                                            Box(contentAlignment = Alignment.Center) {
                                                Icon(Icons.Default.Check, contentDescription = null, tint = Color.White, modifier = Modifier.size(12.dp))
                                            }
                                        }
                                    }

                                    // Line 2
                                    Box(
                                        modifier = Modifier
                                            .weight(1f)
                                            .height(3.dp)
                                            .background(if (isConsultationDone) Color(0xFF15803D) else if (isWithDoctor) Color(0xFF0284C7) else Color(0xFFCBD5E1))
                                    )

                                    // 3. With Doctor / Done
                                    Surface(
                                        shape = CircleShape,
                                        color = if (isConsultationDone) Color(0xFF15803D) else if (isWithDoctor) Color(0xFF0284C7) else Color(0xFFCBD5E1),
                                        modifier = Modifier.size(18.dp)
                                    ) {
                                        if (isWithDoctor || isConsultationDone) {
                                            Box(contentAlignment = Alignment.Center) {
                                                Icon(Icons.Default.Check, contentDescription = null, tint = Color.White, modifier = Modifier.size(12.dp))
                                            }
                                        }
                                    }
                                }

                                // Step Labels Row
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.SpaceBetween
                                ) {
                                    Text("Booked", fontSize = 11.sp, color = Color(0xFF0284C7), fontWeight = FontWeight.Bold)
                                    Text(
                                        text = when {
                                            isConsultationDone -> "In queue"
                                            isToday -> "In queue"
                                            isTomorrow -> "Queue Opens Tomorrow"
                                            else -> "Queue Opens Visit Day"
                                        },
                                        fontSize = 11.sp,
                                        color = if (isToday || isConsultationDone) Color(0xFF0284C7) else Color(0xFF64748B),
                                        fontWeight = if (isToday || isConsultationDone) FontWeight.Bold else FontWeight.Medium
                                    )
                                    Text(
                                        text = when {
                                            isLabAppt && isLabSampleDoneOrFurther -> if (isLabReportReady) "Report Ready" else "In Lab"
                                            isConsultationDone -> "Done"
                                            else -> "With doctor"
                                        },
                                        fontSize = 11.sp,
                                        color = if (isConsultationDone) Color(0xFF15803D) else if (isWithDoctor) Color(0xFF0284C7) else Color(0xFF94A3B8),
                                        fontWeight = if (isWithDoctor || isConsultationDone) FontWeight.Bold else FontWeight.Medium
                                    )
                                }
                                }
                            }

                            // ── C. HERO CENTER BOX: Completed vs Today (Live Queue) vs Tomorrow/Future (Scheduled Window) ─
                            if (isConsultationDone) {
                                Surface(
                                    shape = RoundedCornerShape(14.dp),
                                    color = Color(0xFFF0FDF4),
                                    border = BorderStroke(1.dp, Color(0xFFBBF7D0)),
                                    modifier = Modifier.fillMaxWidth()
                                ) {
                                    Row(
                                        modifier = Modifier.padding(12.dp),
                                        verticalAlignment = Alignment.CenterVertically,
                                        horizontalArrangement = Arrangement.spacedBy(14.dp)
                                    ) {
                                        Surface(
                                            shape = RoundedCornerShape(10.dp),
                                            color = Color(0xFF16A34A),
                                            modifier = Modifier.size(46.dp)
                                        ) {
                                            Box(contentAlignment = Alignment.Center) {
                                                Icon(
                                                    if (isLabAppt) Icons.Default.Science else Icons.Default.CheckCircle,
                                                    contentDescription = null,
                                                    tint = Color.White,
                                                    modifier = Modifier.size(24.dp)
                                                )
                                            }
                                        }

                                        Column(
                                            modifier = Modifier.weight(1f),
                                            verticalArrangement = Arrangement.spacedBy(2.dp)
                                        ) {
                                            Text(
                                                text = when {
                                                    isLabAppt && isLabReportReady -> "Lab Report Prepared"
                                                    isLabAppt && isLabSampleDoneOrFurther -> "Sample Collected \u2022 In Lab"
                                                    else -> "Consultation Completed"
                                                },
                                                fontWeight = FontWeight.Bold,
                                                fontSize = 14.sp,
                                                color = Color(0xFF15803D)
                                            )
                                            Text(
                                                text = when {
                                                    isLabAppt && isLabReportReady -> "Your diagnostic report is ready at $clinicName"
                                                    isLabAppt && isLabSampleDoneOrFurther -> "Sample collected & processing at $clinicName"
                                                    else -> "Token #$myPos \u2022 Completed today at $clinicName"
                                                },
                                                fontSize = 12.sp,
                                                color = Color(0xFF166534)
                                            )
                                        }

                                        Surface(
                                            shape = RoundedCornerShape(10.dp),
                                            color = Color.White,
                                            border = BorderStroke(1.dp, Color(0xFFBBF7D0))
                                        ) {
                                            Text(
                                                text = when {
                                                    isLabAppt && isLabReportReady -> "Ready"
                                                    isLabAppt && isLabSampleDoneOrFurther -> "Processing"
                                                    else -> "Finished"
                                                },
                                                fontSize = 11.sp,
                                                fontWeight = FontWeight.Bold,
                                                color = Color(0xFF16A34A),
                                                modifier = Modifier.padding(horizontal = 8.dp, vertical = 5.dp)
                                            )
                                        }
                                    }
                                }
                            } else if (isMissed) {
                                Surface(
                                    shape = RoundedCornerShape(14.dp),
                                    color = Color(0xFFFFF1F2),
                                    border = BorderStroke(1.dp, Color(0xFFFECDD3)),
                                    modifier = Modifier.fillMaxWidth()
                                ) {
                                    Column(
                                        modifier = Modifier.padding(14.dp),
                                        verticalArrangement = Arrangement.spacedBy(10.dp)
                                    ) {
                                        Row(
                                            modifier = Modifier.fillMaxWidth(),
                                            verticalAlignment = Alignment.CenterVertically,
                                            horizontalArrangement = Arrangement.SpaceBetween
                                        ) {
                                            Row(
                                                modifier = Modifier.weight(1f),
                                                verticalAlignment = Alignment.CenterVertically,
                                                horizontalArrangement = Arrangement.spacedBy(12.dp)
                                            ) {
                                                Surface(
                                                    shape = RoundedCornerShape(10.dp),
                                                    color = Color(0xFFE11D48),
                                                    modifier = Modifier.size(46.dp)
                                                ) {
                                                    Box(contentAlignment = Alignment.Center) {
                                                        Icon(
                                                            Icons.Default.EventBusy,
                                                            contentDescription = null,
                                                            tint = Color.White,
                                                            modifier = Modifier.size(24.dp)
                                                        )
                                                    }
                                                }
                                                Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                                                    Text(
                                                        text = "Missed Consultation",
                                                        fontWeight = FontWeight.Bold,
                                                        fontSize = 14.sp,
                                                        color = Color(0xFF9F1239)
                                                    )
                                                    Text(
                                                        text = "Scheduled for $formattedDateLabel ($apptDateStr) \u2022 Slot passed",
                                                        fontSize = 12.sp,
                                                        color = Color(0xFFBE123C)
                                                    )
                                                }
                                            }
                                            Surface(
                                                shape = RoundedCornerShape(8.dp),
                                                color = Color.White,
                                                border = BorderStroke(1.dp, Color(0xFFFECDD3))
                                            ) {
                                                Text(
                                                    text = "Missed",
                                                    fontSize = 11.sp,
                                                    fontWeight = FontWeight.Bold,
                                                    color = Color(0xFFE11D48),
                                                    modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
                                                )
                                            }
                                        }
                                        Surface(
                                            shape = RoundedCornerShape(10.dp),
                                            color = Color.White,
                                            border = BorderStroke(1.dp, Color(0xFFFECDD3)),
                                            modifier = Modifier.fillMaxWidth()
                                        ) {
                                            Row(
                                                modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp),
                                                verticalAlignment = Alignment.CenterVertically,
                                                horizontalArrangement = Arrangement.spacedBy(8.dp)
                                            ) {
                                                Icon(
                                                    Icons.Default.Info,
                                                    contentDescription = null,
                                                    tint = Color(0xFFE11D48),
                                                    modifier = Modifier.size(15.dp)
                                                )
                                                Text(
                                                    text = "Patient was transferred to no-show. You can reschedule this appointment to another available date for free.",
                                                    fontSize = 11.sp,
                                                    color = Color(0xFF9F1239),
                                                    lineHeight = 15.sp
                                                )
                                            }
                                        }
                                    }
                                }
                            } else if (isToday) {
                                val isLate = timingEstimate.isPatientLate
                                // ── TODAY: LIVE QUEUE POSITION BOX ──
                                Surface(
                                    shape = RoundedCornerShape(14.dp),
                                    color = if (isLate) Color(0xFFFFF1F2) else Color(0xFFE0F2FE),
                                    border = BorderStroke(1.dp, if (isLate) Color(0xFFFB7185) else Color(0xFFBAE6FD)),
                                    modifier = Modifier.fillMaxWidth()
                                ) {
                                    Row(
                                        modifier = Modifier.padding(12.dp),
                                        verticalAlignment = Alignment.CenterVertically,
                                        horizontalArrangement = Arrangement.spacedBy(14.dp)
                                    ) {
                                        Surface(
                                            shape = RoundedCornerShape(10.dp),
                                            color = when {
                                                isLate -> Color(0xFFE11D48)
                                                isWithDoctor -> Color(0xFF15803D)
                                                else -> Color(0xFF0284C7)
                                            },
                                            modifier = Modifier.size(46.dp)
                                        ) {
                                            Box(contentAlignment = Alignment.Center) {
                                                Text(
                                                    text = when {
                                                        isLate -> "LATE"
                                                        isWithDoctor -> "NOW"
                                                        else -> "$liveAhead"
                                                    },
                                                    fontWeight = FontWeight.ExtraBold,
                                                    fontSize = if (isLate) 10.sp else if (isWithDoctor) 13.sp else 18.sp,
                                                    color = Color.White
                                                )
                                            }
                                        }

                                        Column(
                                            modifier = Modifier.weight(1f),
                                            verticalArrangement = Arrangement.spacedBy(2.dp)
                                        ) {
                                            Text(
                                                text = if (isLate) "Arrive Soon \u2022 Turn Bypassed" else "Live Queue Position",
                                                fontWeight = FontWeight.Bold,
                                                fontSize = 14.sp,
                                                color = if (isLate) Color(0xFF9F1239) else Color(0xFF0F172A)
                                            )
                                            Text(
                                                text = when {
                                                    isLate -> "Another patient was called inside \u2022 Please arrive now"
                                                    isWithDoctor -> "With doctor in consultation room \u2022 Token #$myPos"
                                                    liveAhead == 0 -> "Next in line (0 ahead) \u2022 Token #$myPos \u2022 $totalWaiting in queue"
                                                    liveAhead == 1 && clinicEntries.any { it.status == "inside" || it.status == "in_consultation" } -> "Doctor consulting \u2022 You're up next (1 ahead) \u2022 Token #$myPos"
                                                    else -> "$liveAhead ahead of you in line \u2022 Token #$myPos \u2022 $totalWaiting in queue"
                                                },
                                                fontSize = 12.sp,
                                                color = if (isLate) Color(0xFFBE123C) else Color(0xFF64748B)
                                            )
                                        }

                                        Surface(
                                            shape = RoundedCornerShape(10.dp),
                                            color = Color.White,
                                            border = BorderStroke(1.dp, if (isLate) Color(0xFFFB7185) else Color(0xFFBAE6FD))
                                        ) {
                                            Column(
                                                modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp),
                                                horizontalAlignment = Alignment.End
                                            ) {
                                                Text(
                                                    text = when {
                                                        isLate -> "Arrive Soon"
                                                        isWithDoctor -> "In consultation"
                                                        isClinicOnBreak -> "Clinic on break"
                                                        timingEstimate.isSoonBeReady || timingEstimate.expectedExactTimeText == "Soon, be ready" -> "Soon, be ready"
                                                        timingEstimate.doctorStatusBanner != null -> timingEstimate.estimatedTimeLeftText
                                                        liveAhead == 0 -> "Soon, be ready"
                                                        else -> timingEstimate.estimatedTimeLeftText
                                                    },
                                                    fontSize = 11.sp,
                                                    fontWeight = FontWeight.Bold,
                                                    color = when {
                                                        isLate -> Color(0xFFE11D48)
                                                        isClinicOnBreak -> Color(0xFFDC2626)
                                                        else -> Color(0xFF0284C7)
                                                    }
                                                )
                                                Text(
                                                    text = when {
                                                        isLate -> "You are late"
                                                        isWithDoctor -> "Inside now"
                                                        isClinicOnBreak -> "Paused"
                                                        timingEstimate.expectedExactTimeText == "In Consultation" || timingEstimate.expectedExactTimeText == "Done" -> timingEstimate.expectedExactTimeText
                                                        timingEstimate.expectedExactTimeText == "Soon, be ready" -> "Prepare to enter"
                                                        timingEstimate.expectedExactTimeText.isNotBlank() -> "Exp: ${timingEstimate.expectedExactTimeText}"
                                                        else -> "Next in line"
                                                    },
                                                    fontSize = 10.sp,
                                                    color = if (isLate) Color(0xFFBE123C) else Color(0xFF64748B)
                                                )
                                            }
                                        }
                                    }
                                }
                            } else {
                                // ── TOMORROW / FUTURE: SCHEDULED CONSULTATION WINDOW BOX ──
                                Surface(
                                    shape = RoundedCornerShape(14.dp),
                                    color = Color(0xFFF0F9FF),
                                    border = BorderStroke(1.dp, Color(0xFFBAE6FD)),
                                    modifier = Modifier.fillMaxWidth()
                                ) {
                                    Column(
                                        modifier = Modifier.padding(14.dp),
                                        verticalArrangement = Arrangement.spacedBy(10.dp)
                                    ) {
                                        Row(
                                            modifier = Modifier.fillMaxWidth(),
                                            verticalAlignment = Alignment.CenterVertically,
                                            horizontalArrangement = Arrangement.SpaceBetween
                                        ) {
                                            Row(
                                                verticalAlignment = Alignment.CenterVertically,
                                                horizontalArrangement = Arrangement.spacedBy(12.dp)
                                            ) {
                                                Surface(
                                                    shape = RoundedCornerShape(10.dp),
                                                    color = Color(0xFF0284C7),
                                                    modifier = Modifier.size(46.dp)
                                                ) {
                                                    Box(contentAlignment = Alignment.Center) {
                                                        Icon(
                                                            Icons.Default.Event,
                                                            contentDescription = null,
                                                            tint = Color.White,
                                                            modifier = Modifier.size(24.dp)
                                                        )
                                                    }
                                                }

                                                Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                                                    Text(
                                                        text = if (isTomorrow) "Tomorrow \u2022 Position #$myPos in line" else "$formattedDateLabel \u2022 Position #$myPos in line",
                                                        fontWeight = FontWeight.Bold,
                                                        fontSize = 13.5.sp,
                                                        color = Color(0xFF0F172A)
                                                    )
                                                    Text(
                                                        text = appt.appointmentTime ?: "10:00 AM - 11:00 AM",
                                                        fontSize = 14.sp,
                                                        fontWeight = FontWeight.ExtraBold,
                                                        color = Color(0xFF0284C7)
                                                    )
                                                }
                                            }

                                            Surface(
                                                shape = RoundedCornerShape(8.dp),
                                                color = Color(0xFFE0F2FE),
                                                border = BorderStroke(1.dp, Color(0xFFBAE6FD))
                                            ) {
                                                Text(
                                                    text = if (isTomorrow) "Position #$myPos" else "Token #$myPos",
                                                    fontSize = 11.sp,
                                                    fontWeight = FontWeight.Bold,
                                                    color = Color(0xFF0284C7),
                                                    modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
                                                )
                                            }
                                        }

                                        // Arrival Guidance Box
                                        Surface(
                                            shape = RoundedCornerShape(8.dp),
                                            color = Color.White,
                                            border = BorderStroke(1.dp, Color(0xFFE2E8F0)),
                                            modifier = Modifier.fillMaxWidth()
                                        ) {
                                            Row(
                                                modifier = Modifier.padding(horizontal = 10.dp, vertical = 7.dp),
                                                verticalAlignment = Alignment.CenterVertically,
                                                horizontalArrangement = Arrangement.SpaceBetween
                                            ) {
                                                Row(
                                                    modifier = Modifier.weight(1f, fill = false),
                                                    verticalAlignment = Alignment.CenterVertically,
                                                    horizontalArrangement = Arrangement.spacedBy(6.dp)
                                                ) {
                                                    Icon(
                                                        Icons.Default.AccessTime,
                                                        contentDescription = null,
                                                        tint = Color(0xFFF59E0B),
                                                        modifier = Modifier.size(15.dp)
                                                    )
                                                    Text(
                                                        text = "Please arrive 15 min early:",
                                                        fontSize = 11.5.sp,
                                                        fontWeight = FontWeight.SemiBold,
                                                        color = Color(0xFF0F172A),
                                                        maxLines = 1,
                                                        overflow = TextOverflow.Ellipsis
                                                    )
                                                    Text(
                                                        text = "by $earlyArrivalText",
                                                        fontSize = 11.5.sp,
                                                        fontWeight = FontWeight.Bold,
                                                        color = Color(0xFF0284C7),
                                                        maxLines = 1,
                                                        overflow = TextOverflow.Ellipsis
                                                    )
                                                }
                                                Spacer(Modifier.width(8.dp))
                                                Surface(
                                                    shape = RoundedCornerShape(6.dp),
                                                    color = Color(0xFFF8FAFC),
                                                    border = BorderStroke(1.dp, Color(0xFFCBD5E1))
                                                ) {
                                                    Text(
                                                        text = "\u00B115 min",
                                                        fontSize = 10.5.sp,
                                                        fontWeight = FontWeight.SemiBold,
                                                        color = Color(0xFF475569),
                                                        modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.5.dp),
                                                        maxLines = 1,
                                                        softWrap = false
                                                    )
                                                }
                                            }
                                        }

                                        Text(
                                            text = "\u2022 Live OPD queue tracking will activate on ${if (isTomorrow) "tomorrow morning" else apptDateStr} when the clinic opens.",
                                            fontSize = 11.sp,
                                            color = Color(0xFF64748B),
                                            lineHeight = 15.sp
                                        )
                                    }
                                }
                            }

                            // ── Selected Diagnostic Lab Tests (if any) ─────────
                            if (!appt.selectedLabTests.isNullOrBlank()) {
                                Surface(
                                    shape = RoundedCornerShape(12.dp),
                                    color = Color(0xFFF0FDF4),
                                    border = BorderStroke(1.dp, Color(0xFFBBF7D0)),
                                    modifier = Modifier.fillMaxWidth()
                                ) {
                                    Row(
                                        modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp),
                                        verticalAlignment = Alignment.CenterVertically,
                                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                                    ) {
                                        Icon(Icons.Default.Healing, contentDescription = null, tint = Color(0xFF16A34A), modifier = Modifier.size(16.dp))
                                        Column {
                                            Text("Selected Lab Tests", fontSize = 10.sp, fontWeight = FontWeight.Bold, color = Color(0xFF15803D))
                                            Text(appt.selectedLabTests, fontSize = 12.sp, color = Color(0xFF1E293B), fontWeight = FontWeight.Medium)
                                        }
                                    }
                                }
                            }

                            // ── D. Metadata Grid (Doctor, Patient, Scheduled) ─
                            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.SpaceBetween
                                ) {
                                    // Doctor with Real Photo / Avatar
                                    Row(
                                        modifier = Modifier.weight(1f),
                                        verticalAlignment = Alignment.CenterVertically,
                                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                                    ) {
                                        Surface(
                                            shape = CircleShape,
                                            color = Color(0xFFE0F2FE),
                                            border = BorderStroke(1.dp, Color(0xFFBAE6FD)),
                                            modifier = Modifier.size(36.dp)
                                        ) {
                                            if (!doctorImgUrl.isNullOrBlank()) {
                                                coil.compose.AsyncImage(
                                                    model = doctorImgUrl,
                                                    contentDescription = doctorName,
                                                    contentScale = androidx.compose.ui.layout.ContentScale.Crop,
                                                    modifier = Modifier.fillMaxSize()
                                                )
                                            } else {
                                                Box(contentAlignment = Alignment.Center) {
                                                    Text(
                                                        text = doctorInitials,
                                                        fontWeight = FontWeight.Bold,
                                                        fontSize = 13.sp,
                                                        color = Color(0xFF0284C7)
                                                    )
                                                }
                                            }
                                        }

                                        Column {
                                            Text("Doctor", fontSize = 10.sp, color = Color(0xFF94A3B8))
                                            Text("Dr. $doctorName", fontSize = 13.sp, fontWeight = FontWeight.Bold, color = Color(0xFF0F172A), maxLines = 1, overflow = TextOverflow.Ellipsis)
                                        }
                                    }

                                    // Patient
                                    Row(
                                        modifier = Modifier.weight(1f),
                                        verticalAlignment = Alignment.CenterVertically,
                                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                                    ) {
                                        Surface(
                                            shape = CircleShape,
                                            color = Color(0xFFF1F5F9),
                                            border = BorderStroke(1.dp, Color(0xFFCBD5E1)),
                                            modifier = Modifier.size(36.dp)
                                        ) {
                                            Box(contentAlignment = Alignment.Center) {
                                                Icon(Icons.Default.Person, contentDescription = null, tint = Color(0xFF64748B), modifier = Modifier.size(18.dp))
                                            }
                                        }
                                        Column {
                                            Text("Patient", fontSize = 10.sp, color = Color(0xFF94A3B8))
                                            Text(appt.patientName, fontSize = 13.sp, fontWeight = FontWeight.Bold, color = Color(0xFF0F172A), maxLines = 1, overflow = TextOverflow.Ellipsis)
                                        }
                                    }
                                }

                                // Scheduled Time
                                Row(
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                                ) {
                                    Icon(Icons.Default.CalendarToday, contentDescription = null, tint = Color(0xFF0284C7), modifier = Modifier.size(18.dp))
                                    Column {
                                        Text("Scheduled Date & Time", fontSize = 10.sp, color = Color(0xFF94A3B8))
                                        Text("${appt.appointmentDate}  \u2022  ${appt.appointmentTime ?: "10:00 AM"}", fontSize = 13.sp, fontWeight = FontWeight.Bold, color = Color(0xFF0F172A))
                                    }
                                }
                            }

                            // ── E. 10-Digit Appointment ID Box with Copy ─────
                            Surface(
                                shape = RoundedCornerShape(12.dp),
                                color = Color(0xFFF8FAFC),
                                border = BorderStroke(1.dp, Color(0xFFE2E8F0)),
                                modifier = Modifier.fillMaxWidth()
                            ) {
                                Row(
                                    modifier = Modifier.padding(horizontal = 14.dp, vertical = 10.dp),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Row(
                                        verticalAlignment = Alignment.CenterVertically,
                                        horizontalArrangement = Arrangement.spacedBy(10.dp)
                                    ) {
                                        Icon(Icons.Default.Assignment, contentDescription = null, tint = Color(0xFF0284C7), modifier = Modifier.size(20.dp))
                                        Column {
                                            Text("Appointment ID", fontSize = 10.sp, color = Color(0xFF64748B))
                                            val formattedCode = appt.trackingCode10Digit.chunked(3).joinToString(" ")
                                            Text(
                                                text = formattedCode,
                                                fontWeight = FontWeight.ExtraBold,
                                                fontSize = 15.sp,
                                                color = Color(0xFF0F172A)
                                            )
                                        }
                                    }

                                    OutlinedButton(
                                        onClick = {
                                            val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
                                            clipboard.setPrimaryClip(ClipData.newPlainText("Appointment ID", appt.trackingCode10Digit))
                                            Toast.makeText(context, "Copied ID: ${appt.trackingCode10Digit}", Toast.LENGTH_SHORT).show()
                                        },
                                        shape = RoundedCornerShape(8.dp),
                                        border = BorderStroke(1.dp, Color(0xFFCBD5E1)),
                                        contentPadding = PaddingValues(horizontal = 10.dp, vertical = 4.dp),
                                        modifier = Modifier.defaultMinSize(minHeight = 32.dp)
                                    ) {
                                        Icon(Icons.Default.ContentCopy, contentDescription = null, modifier = Modifier.size(13.dp))
                                        Spacer(Modifier.width(4.dp))
                                        Text("Copy", fontSize = 11.sp, fontWeight = FontWeight.SemiBold)
                                    }
                                }
                            }

                            // ── F1. Clinic On Break Banner (if active) ─────────
                            if (isClinicOnBreak) {
                                Surface(
                                    shape = RoundedCornerShape(10.dp),
                                    color = Color(0xFFFEE2E2),
                                    border = BorderStroke(1.dp, Color(0xFFFECACA)),
                                    modifier = Modifier.fillMaxWidth()
                                ) {
                                    Row(
                                        modifier = Modifier.padding(horizontal = 12.dp, vertical = 7.dp),
                                        verticalAlignment = Alignment.CenterVertically,
                                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                                    ) {
                                        Icon(Icons.Default.PauseCircle, contentDescription = null, tint = Color(0xFFDC2626), modifier = Modifier.size(16.dp))
                                        Text(
                                            text = "Clinic is currently on a break \u2014 consultations paused temporarily",
                                            color = Color(0xFF991B1B),
                                            fontSize = 11.sp,
                                            fontWeight = FontWeight.Bold
                                        )
                                    }
                                }
                            }

                            // ── F2. Clinic Break Hours ─────────────────────────
                            val todaySched = clinic?.getTodaySchedule()
                            if (todaySched?.hasBreak == true && !todaySched.breakStart.isNullOrBlank() && !todaySched.breakEnd.isNullOrBlank()) {
                                Surface(
                                    shape = RoundedCornerShape(10.dp),
                                    color = Color(0xFFFFF7ED),
                                    border = BorderStroke(1.dp, Color(0xFFFED7AA)),
                                    modifier = Modifier.fillMaxWidth()
                                ) {
                                    Row(
                                        modifier = Modifier.padding(horizontal = 12.dp, vertical = 7.dp),
                                        verticalAlignment = Alignment.CenterVertically,
                                        horizontalArrangement = Arrangement.SpaceBetween
                                    ) {
                                        Row(
                                            verticalAlignment = Alignment.CenterVertically,
                                            horizontalArrangement = Arrangement.spacedBy(6.dp)
                                        ) {
                                            Icon(Icons.Default.Coffee, contentDescription = null, tint = Color(0xFFEA580C), modifier = Modifier.size(15.dp))
                                            Text(
                                                text = "Clinic Break Hours Today:",
                                                fontSize = 11.sp,
                                                fontWeight = FontWeight.SemiBold,
                                                color = Color(0xFF9A3412)
                                            )
                                        }
                                        Text(
                                            text = "${todaySched.breakStart} - ${todaySched.breakEnd}",
                                            fontSize = 11.5.sp,
                                            fontWeight = FontWeight.ExtraBold,
                                            color = Color(0xFFC2410C)
                                        )
                                    }
                                }
                            }

                            // ── F3. Doctor Physical Presence Banner (ONLY for today's appointment if not done) ──
                            if (isToday && !isConsultationDone) {
                                Surface(
                                    shape = RoundedCornerShape(10.dp),
                                    color = if (isInClinic) Color(0xFFDCFCE7) else Color(0xFFFEF3C7),
                                    modifier = Modifier.fillMaxWidth()
                                ) {
                                    Row(
                                        modifier = Modifier.padding(horizontal = 12.dp, vertical = 7.dp),
                                        verticalAlignment = Alignment.CenterVertically,
                                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                                    ) {
                                        Box(
                                            modifier = Modifier
                                                .size(8.dp)
                                                .background(if (isInClinic) Color(0xFF16A34A) else Color(0xFFD97706), CircleShape)
                                        )
                                        Text(
                                            text = if (isInClinic) "Doctor is inside the clinic" else "Doctor is not inside the clinic (He/She is not in)",
                                            color = if (isInClinic) Color(0xFF15803D) else Color(0xFFB45309),
                                            fontSize = 11.sp,
                                            fontWeight = FontWeight.Bold
                                        )
                                    }
                                }
                            }

                            // ── G. ACTION BUTTONS: 2-TIER DESIGN ──────────────
                            Column(
                                modifier = Modifier.fillMaxWidth(),
                                verticalArrangement = Arrangement.spacedBy(8.dp)
                            ) {
                                // Tier 1: Hero Primary Action Button
                                if (isConsultationDone) {
                                    Button(
                                        onClick = {
                                            navController.navigate(NavRoutes.QueueStatus.createRoute(appt.trackingCode10Digit))
                                        },
                                        shape = RoundedCornerShape(12.dp),
                                        colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF16A34A)),
                                        modifier = Modifier
                                            .fillMaxWidth()
                                            .height(44.dp)
                                    ) {
                                        Icon(if (isLabAppt) Icons.Default.Science else Icons.Default.ReceiptLong, contentDescription = null, modifier = Modifier.size(16.dp))
                                        Spacer(Modifier.width(6.dp))
                                        Text(
                                            text = when {
                                                isLabAppt && isLabReportReady -> "View Lab Report"
                                                isLabAppt && isLabSampleDoneOrFurther -> "Sample Status & Lab Report"
                                                else -> "View Consultation & Bills"
                                            },
                                            fontSize = 13.sp,
                                            fontWeight = FontWeight.Bold
                                        )
                                        Spacer(Modifier.width(4.dp))
                                        Icon(Icons.AutoMirrored.Filled.ArrowForward, contentDescription = null, modifier = Modifier.size(14.dp))
                                    }
                                } else if (isMissed) {
                                    Button(
                                        onClick = {
                                            apptToRescheduleConfirm = appt
                                        },
                                        shape = RoundedCornerShape(12.dp),
                                        colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF0284C7)),
                                        modifier = Modifier
                                            .fillMaxWidth()
                                            .height(44.dp)
                                    ) {
                                        Icon(Icons.Default.CalendarMonth, contentDescription = null, modifier = Modifier.size(16.dp))
                                        Spacer(Modifier.width(6.dp))
                                        Text("Reschedule Missed Slot", fontSize = 13.sp, fontWeight = FontWeight.Bold)
                                        Spacer(Modifier.width(4.dp))
                                        Icon(Icons.AutoMirrored.Filled.ArrowForward, contentDescription = null, modifier = Modifier.size(14.dp))
                                    }
                                    Row(
                                        modifier = Modifier.fillMaxWidth(),
                                        horizontalArrangement = Arrangement.spacedBy(10.dp),
                                        verticalAlignment = Alignment.CenterVertically
                                    ) {
                                        OutlinedButton(
                                            onClick = {
                                                try {
                                                    val mapUri = android.net.Uri.parse("geo:0,0?q=" + android.net.Uri.encode("$clinicName, $clinicAddress"))
                                                    val mapIntent = android.content.Intent(android.content.Intent.ACTION_VIEW, mapUri)
                                                    context.startActivity(mapIntent)
                                                } catch (e: Exception) {
                                                    Toast.makeText(context, "Clinic location: $clinicAddress", Toast.LENGTH_LONG).show()
                                                }
                                            },
                                            shape = RoundedCornerShape(12.dp),
                                            border = BorderStroke(1.dp, Color(0xFFCBD5E1)),
                                            contentPadding = PaddingValues(horizontal = 8.dp, vertical = 6.dp),
                                            modifier = Modifier.weight(1f).height(42.dp)
                                        ) {
                                            Icon(Icons.Default.Directions, contentDescription = null, modifier = Modifier.size(15.dp))
                                            Spacer(Modifier.width(4.dp))
                                            Text("Directions", fontSize = 12.sp, fontWeight = FontWeight.Bold, maxLines = 1)
                                        }
                                        OutlinedButton(
                                            onClick = {
                                                apptToCancelConfirm = appt
                                            },
                                            shape = RoundedCornerShape(12.dp),
                                            border = BorderStroke(1.dp, Color(0xFFFECACA)),
                                            colors = ButtonDefaults.outlinedButtonColors(
                                                containerColor = Color(0xFFFFF1F2),
                                                contentColor = Color(0xFFE11D48)
                                            ),
                                            contentPadding = PaddingValues(horizontal = 8.dp, vertical = 6.dp),
                                            modifier = Modifier.weight(1f).height(42.dp)
                                        ) {
                                            Icon(Icons.Default.Close, contentDescription = null, modifier = Modifier.size(15.dp))
                                            Spacer(Modifier.width(4.dp))
                                            Text("Remove", fontSize = 12.sp, fontWeight = FontWeight.Bold, maxLines = 1)
                                        }
                                    }
                                } else if (isToday) {
                                    Button(
                                        onClick = {
                                            navController.navigate(NavRoutes.QueueStatus.createRoute(appt.trackingCode10Digit))
                                        },
                                        shape = RoundedCornerShape(12.dp),
                                        colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF0284C7)),
                                        modifier = Modifier
                                            .fillMaxWidth()
                                            .height(44.dp)
                                    ) {
                                        Icon(Icons.Default.LocationOn, contentDescription = null, modifier = Modifier.size(16.dp))
                                        Spacer(Modifier.width(6.dp))
                                        Text("Live Queue Tracker", fontSize = 13.sp, fontWeight = FontWeight.Bold)
                                        Spacer(Modifier.width(4.dp))
                                        Icon(Icons.AutoMirrored.Filled.ArrowForward, contentDescription = null, modifier = Modifier.size(14.dp))
                                    }
                                } else {
                                    Button(
                                        onClick = {
                                            try {
                                                val mapUri = android.net.Uri.parse("geo:0,0?q=" + android.net.Uri.encode("$clinicName, $clinicAddress"))
                                                val mapIntent = android.content.Intent(android.content.Intent.ACTION_VIEW, mapUri)
                                                context.startActivity(mapIntent)
                                            } catch (e: Exception) {
                                                Toast.makeText(context, "Clinic location: $clinicAddress", Toast.LENGTH_LONG).show()
                                            }
                                        },
                                        shape = RoundedCornerShape(12.dp),
                                        colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF0284C7)),
                                        modifier = Modifier
                                            .fillMaxWidth()
                                            .height(44.dp)
                                    ) {
                                        Icon(Icons.Default.Directions, contentDescription = null, modifier = Modifier.size(16.dp))
                                        Spacer(Modifier.width(6.dp))
                                        Text("Get Clinic Directions", fontSize = 13.sp, fontWeight = FontWeight.Bold)
                                        Spacer(Modifier.width(4.dp))
                                        Icon(Icons.AutoMirrored.Filled.ArrowForward, contentDescription = null, modifier = Modifier.size(14.dp))
                                    }
                                }

                                // Tier 2: Reschedule & Cancel Action Buttons (ONLY if active & not missed)
                                if (!isConsultationDone && !isMissed) {
                                    Row(
                                        modifier = Modifier.fillMaxWidth(),
                                        horizontalArrangement = Arrangement.spacedBy(10.dp),
                                        verticalAlignment = Alignment.CenterVertically
                                    ) {
                                        OutlinedButton(
                                            onClick = {
                                                apptToRescheduleConfirm = appt
                                            },
                                            shape = RoundedCornerShape(12.dp),
                                            border = BorderStroke(1.dp, Color(0xFF0284C7)),
                                            colors = ButtonDefaults.outlinedButtonColors(contentColor = Color(0xFF0284C7)),
                                            modifier = Modifier
                                                .weight(1f)
                                                .height(42.dp)
                                        ) {
                                            Icon(Icons.Default.CalendarMonth, contentDescription = null, modifier = Modifier.size(15.dp))
                                            Spacer(Modifier.width(6.dp))
                                            Text("Reschedule Slot", fontSize = 12.5.sp, fontWeight = FontWeight.Bold)
                                        }

                                        OutlinedButton(
                                            onClick = {
                                                apptToCancelConfirm = appt
                                            },
                                            shape = RoundedCornerShape(12.dp),
                                            border = BorderStroke(1.dp, Color(0xFFFECACA)),
                                            colors = ButtonDefaults.outlinedButtonColors(
                                                containerColor = Color(0xFFFFF1F2),
                                                contentColor = Color(0xFFE11D48)
                                            ),
                                            modifier = Modifier
                                                .weight(1f)
                                                .height(42.dp)
                                        ) {
                                            Icon(Icons.Default.Close, contentDescription = null, modifier = Modifier.size(15.dp))
                                            Spacer(Modifier.width(4.dp))
                                            Text("Cancel Booking", fontSize = 12.5.sp, fontWeight = FontWeight.Bold)
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

    // ── CONFIRMATION DIALOG: RESCHEDULE ──
    apptToRescheduleConfirm?.let { targetAppt ->
        RescheduleConfirmDialog(
            targetAppt = targetAppt,
            clinicMap = clinicCache,
            doctorMap = doctorCache,
            labReports = labReportCache[targetAppt.id] ?: emptyList(),
            queueStatus = queueCache[targetAppt.id]?.status,
            onDismiss = { apptToRescheduleConfirm = null },
            onConfirmReschedule = { appt ->
                apptToRescheduleConfirm = null
                sessionManager?.savePendingReschedule(
                    com.dactor.patient.data.local.UserSessionManager.PendingRescheduleData(
                        appointmentId = appt.id,
                        trackingCode = appt.trackingCode10Digit,
                        clinicId = appt.clinicId,
                        doctorId = appt.doctorId,
                        patientName = appt.patientName,
                        patientMobile = appt.patientMobile,
                        patientAge = appt.patientAge.toString(),
                        patientGender = appt.patientGender ?: "Male",
                        patientEmail = appt.patientEmail,
                        originalDate = appt.appointmentDate,
                        originalTime = appt.appointmentTime,
                        status = appt.status
                    )
                )
                navController.navigate(
                    NavRoutes.Booking.createRoute(
                        clinicId = appt.clinicId,
                        doctorId = appt.doctorId,
                        rescheduleApptId = appt.id
                    )
                )
            }
        )
    }

    // ── CONFIRMATION DIALOG: CANCEL ──
    apptToCancelConfirm?.let { targetAppt ->
        val targetDoctor = targetAppt.doctorId?.let { doctorCache[it] }
        AlertDialog(
            onDismissRequest = { if (!isCancelling) apptToCancelConfirm = null },
            title = {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    Icon(Icons.Default.Warning, contentDescription = null, tint = Color(0xFFE11D48))
                    Text("Cancel Appointment?", fontWeight = FontWeight.Bold, fontSize = 16.sp)
                }
            },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Text(
                        "Are you sure you want to cancel your appointment with Dr. ${targetDoctor?.fullName ?: ""} on ${targetAppt.appointmentDate}?",
                        fontSize = 13.sp,
                        color = Color(0xFF475569)
                    )
                    Text(
                        "Your reserved slot will be released back for other patients to book.",
                        fontSize = 12.sp,
                        color = Color(0xFF94A3B8)
                    )
                }
            },
            confirmButton = {
                Button(
                    onClick = {
                        val apptId = targetAppt.id
                        isCancelling = true
                        coroutineScope.launch {
                            val success = appointmentRepository?.cancelAppointment(apptId) ?: false
                            isCancelling = false
                            apptToCancelConfirm = null
                            if (success) {
                                Toast.makeText(context, "Appointment cancelled successfully", Toast.LENGTH_SHORT).show()
                                loadActiveAppointments()
                            } else {
                                Toast.makeText(context, "Failed to cancel appointment. Please retry.", Toast.LENGTH_SHORT).show()
                            }
                        }
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFE11D48)),
                    enabled = !isCancelling,
                    shape = RoundedCornerShape(8.dp)
                ) {
                    Text(if (isCancelling) "Cancelling..." else "Yes, Cancel Slot", fontWeight = FontWeight.Bold)
                }
            },
            dismissButton = {
                OutlinedButton(
                    onClick = { apptToCancelConfirm = null },
                    enabled = !isCancelling,
                    shape = RoundedCornerShape(8.dp)
                ) {
                    Text("No, Keep Booking")
                }
            }
        )
    }
}

// =========================================================================
// SHARED REUSABLE CONSULTATION RECORD DIALOGS (Parity between RecordsTab & ProfileTab)
// =========================================================================

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PatientRecordDetailDialog(
    targetAppt: Appointment,
    clinicMap: Map<String, Clinic>,
    doctorMap: Map<String, Doctor>,
    invoiceMap: Map<String, BillingInvoice>,
    remarksMap: Map<String, String>,
    labReportMap: Map<String, List<LabReport>>,
    associatedVisits: List<Appointment>,
    isLoadingVisits: Boolean,
    onDismiss: () -> Unit,
    onSelectVisit: (Appointment) -> Unit,
    onReschedule: (Appointment) -> Unit,
    onRemove: (Appointment) -> Unit,
    onViewReport: ((LabReport) -> Unit)? = null
) {
    val context = LocalContext.current
    val dClinic = clinicMap[targetAppt.clinicId]
    val dDoctor = targetAppt.doctorId?.let { doctorMap[it] }
    val dInvoice = invoiceMap[targetAppt.id]
    val dRemarks = remarksMap[targetAppt.id] ?: dInvoice?.remarks
    val dLabReports = labReportMap[targetAppt.id] ?: emptyList()

    val clinicName = dClinic?.name ?: "Partner Medical Clinic"
    val clinicAddress = dClinic?.addressText ?: "Nepal"
    val doctorName = dDoctor?.fullName?.let { if (it.startsWith("Dr.", true)) it else "Dr. $it" } ?: "Attending Physician"
    val doctorSpec = dDoctor?.allSpecialties?.firstOrNull() ?: dDoctor?.specialty ?: "General Physician"
    val doctorAvatar = dDoctor?.resolvedProfilePictureUrl

    val totalBill = when {
        dInvoice != null && dInvoice.totalAmount > 0.0 -> dInvoice.totalAmount
        (targetAppt.feeAmount ?: 0.0) > 0.0 -> targetAppt.feeAmount ?: 0.0
        (dDoctor?.consultationFee ?: 0.0) > 0.0 -> dDoctor?.consultationFee ?: 500.0
        else -> 0.0
    }
    val paidAmount = when {
        dInvoice != null && (dInvoice.paidAmount != null || dInvoice.totalAmount > 0.0) -> dInvoice.effectivePaidAmount
        targetAppt.paymentStatus.equals("paid", ignoreCase = true) -> totalBill
        else -> 0.0
    }
    val balanceLeft = (totalBill - paidAmount).coerceAtLeast(0.0)
    val isCompleted = targetAppt.checkinStatus.lowercase() in listOf("completed", "done")

    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(
            usePlatformDefaultWidth = false,
            dismissOnBackPress = true,
            dismissOnClickOutside = true
        )
    ) {
        val navBarBottom = WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding()
        val safeBottomFloor = maxOf(navBarBottom + 14.dp, 56.dp)

        Box(
            modifier = Modifier
                .fillMaxSize()
                .navigationBarsPadding()
                .padding(horizontal = 14.dp)
                .padding(top = 16.dp, bottom = safeBottomFloor),
            contentAlignment = Alignment.Center
        ) {
            Surface(
                modifier = Modifier
                    .fillMaxWidth()
                    .fillMaxHeight(),
                shape = RoundedCornerShape(24.dp),
                color = Color(0xFFF8FAFC),
                shadowElevation = 16.dp
            ) {
                Column(modifier = Modifier.fillMaxSize()) {
                    // Header Banner
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .background(
                                Brush.horizontalGradient(
                                    colors = listOf(Color(0xFF0284C7), Color(0xFF0F766E))
                                )
                            )
                            .padding(horizontal = 20.dp, vertical = 16.dp)
                    ) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Column(modifier = Modifier.weight(1f)) {
                                Text(
                                    text = "Comprehensive Consultation Details",
                                    fontWeight = FontWeight.ExtraBold,
                                    fontSize = 16.sp,
                                    color = Color.White
                                )
                                Text(
                                    text = "Appointment #${targetAppt.trackingCode10Digit} \u2022 Complete Visit History",
                                    fontSize = 12.sp,
                                    color = Color.White.copy(alpha = 0.9f)
                                )
                            }
                            IconButton(
                                onClick = onDismiss,
                                modifier = Modifier
                                    .size(32.dp)
                                    .background(Color.White.copy(alpha = 0.2f), CircleShape)
                            ) {
                                Icon(Icons.Default.Close, contentDescription = "Close", tint = Color.White, modifier = Modifier.size(18.dp))
                            }
                        }
                    }

                    // Scrollable Body
                    LazyColumn(
                        modifier = Modifier
                            .weight(1f)
                            .fillMaxWidth(),
                        contentPadding = PaddingValues(16.dp),
                        verticalArrangement = Arrangement.spacedBy(14.dp)
                    ) {
                        // ── 1. ATTENDING DOCTOR & CLINIC CREDENTIALS ──
                        item {
                            Surface(
                                shape = RoundedCornerShape(16.dp),
                                color = Color.White,
                                border = BorderStroke(1.dp, Color(0xFFE2E8F0)),
                                modifier = Modifier.fillMaxWidth()
                            ) {
                                Column(
                                    modifier = Modifier.padding(14.dp),
                                    verticalArrangement = Arrangement.spacedBy(10.dp)
                                ) {
                                    Row(
                                        modifier = Modifier.fillMaxWidth(),
                                        verticalAlignment = Alignment.CenterVertically,
                                        horizontalArrangement = Arrangement.spacedBy(12.dp)
                                    ) {
                                        Surface(
                                            shape = CircleShape,
                                            color = Color(0xFFE0F2FE),
                                            border = BorderStroke(2.dp, Color(0xFF0284C7)),
                                            modifier = Modifier.size(60.dp)
                                        ) {
                                            if (!doctorAvatar.isNullOrBlank()) {
                                                coil.compose.AsyncImage(
                                                    model = doctorAvatar,
                                                    contentDescription = doctorName,
                                                    contentScale = androidx.compose.ui.layout.ContentScale.Crop,
                                                    modifier = Modifier.fillMaxSize()
                                                )
                                            } else {
                                                val initials = (dDoctor?.fullName ?: "DR")
                                                    .split(" ")
                                                    .filter { it.isNotBlank() }
                                                    .take(2)
                                                    .mapNotNull { it.firstOrNull()?.uppercaseChar() }
                                                    .joinToString("")
                                                    .ifBlank { "DR" }
                                                Box(contentAlignment = Alignment.Center) {
                                                    Text(
                                                        text = initials,
                                                        fontWeight = FontWeight.ExtraBold,
                                                        fontSize = 19.sp,
                                                        color = Color(0xFF0284C7)
                                                    )
                                                }
                                            }
                                        }

                                        Column(modifier = Modifier.weight(1f)) {
                                            Text(
                                                text = doctorName,
                                                fontWeight = FontWeight.ExtraBold,
                                                fontSize = 17.sp,
                                                color = Color(0xFF0F172A)
                                            )
                                            Text(
                                                text = doctorSpec,
                                                fontWeight = FontWeight.SemiBold,
                                                fontSize = 13.sp,
                                                color = Color(0xFF0284C7)
                                            )
                                            if (!dDoctor?.education.isNullOrBlank()) {
                                                Text(
                                                    text = dDoctor?.education ?: "",
                                                    fontSize = 11.5.sp,
                                                    color = Color(0xFF475569)
                                                )
                                            }
                                        }
                                    }

                                    HorizontalDivider(color = Color(0xFFF1F5F9))

                                    val dClinicImg = dClinic?.resolvedLogoUrl ?: dClinic?.resolvedCoverPictureUrl ?: dClinic?.pictures?.firstOrNull()
                                    Row(
                                        verticalAlignment = Alignment.CenterVertically,
                                        horizontalArrangement = Arrangement.spacedBy(10.dp)
                                    ) {
                                        Surface(
                                            shape = RoundedCornerShape(8.dp),
                                            color = Color(0xFF0F766E).copy(alpha = 0.12f),
                                            border = BorderStroke(1.dp, Color(0xFF0F766E).copy(alpha = 0.25f)),
                                            modifier = Modifier.size(36.dp)
                                        ) {
                                            if (!dClinicImg.isNullOrBlank()) {
                                                coil.compose.AsyncImage(
                                                    model = dClinicImg,
                                                    contentDescription = clinicName,
                                                    contentScale = androidx.compose.ui.layout.ContentScale.Crop,
                                                    modifier = Modifier.fillMaxSize()
                                                )
                                            } else {
                                                Box(contentAlignment = Alignment.Center) {
                                                    Icon(Icons.Default.LocalHospital, contentDescription = null, tint = Color(0xFF0F766E), modifier = Modifier.size(18.dp))
                                                }
                                            }
                                        }
                                        Column {
                                            Text(text = clinicName, fontWeight = FontWeight.Bold, fontSize = 13.sp, color = Color(0xFF0F172A))
                                            Text(text = clinicAddress, fontSize = 11.sp, color = Color(0xFF64748B))
                                        }
                                    }
                                }
                            }
                        }

                        // ── 2. APPOINTMENT TIME & 10-DIGIT CODE ──
                        item {
                            Surface(
                                shape = RoundedCornerShape(16.dp),
                                color = Color.White,
                                border = BorderStroke(1.dp, Color(0xFFE2E8F0)),
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
                                        Column {
                                            Text("10-Digit Appointment ID", fontSize = 11.sp, color = Color(0xFF64748B))
                                            Row(
                                                verticalAlignment = Alignment.CenterVertically,
                                                horizontalArrangement = Arrangement.spacedBy(6.dp)
                                            ) {
                                                Text(
                                                    text = "#${targetAppt.trackingCode10Digit}",
                                                    fontWeight = FontWeight.ExtraBold,
                                                    fontSize = 16.sp,
                                                    color = Color(0xFF0284C7)
                                                )
                                                IconButton(
                                                    onClick = {
                                                        val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
                                                        clipboard.setPrimaryClip(ClipData.newPlainText("Code", targetAppt.trackingCode10Digit))
                                                        Toast.makeText(context, "Copied #${targetAppt.trackingCode10Digit}", Toast.LENGTH_SHORT).show()
                                                    },
                                                    modifier = Modifier.size(24.dp)
                                                ) {
                                                    Icon(Icons.Default.ContentCopy, contentDescription = "Copy", tint = Color(0xFF0284C7), modifier = Modifier.size(14.dp))
                                                }
                                            }
                                        }

                                        Surface(
                                            color = if (isCompleted) Color(0xFFDCFCE7) else Color(0xFFFEF3C7),
                                            shape = RoundedCornerShape(8.dp)
                                        ) {
                                            Text(
                                                text = if (isCompleted) "✓ Completed" else targetAppt.checkinStatus.replaceFirstChar { it.uppercase() },
                                                color = if (isCompleted) Color(0xFF15803D) else Color(0xFFB45309),
                                                fontWeight = FontWeight.Bold,
                                                fontSize = 11.5.sp,
                                                modifier = Modifier.padding(horizontal = 10.dp, vertical = 5.dp)
                                            )
                                        }
                                    }

                                    Row(
                                        modifier = Modifier.fillMaxWidth(),
                                        horizontalArrangement = Arrangement.SpaceBetween
                                    ) {
                                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                            Icon(Icons.Default.Event, contentDescription = null, tint = Color(0xFF0284C7), modifier = Modifier.size(14.dp))
                                            Text(text = targetAppt.appointmentDate, fontWeight = FontWeight.Bold, fontSize = 12.5.sp, color = Color(0xFF0F172A))
                                        }
                                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                            Icon(Icons.Default.Schedule, contentDescription = null, tint = Color(0xFF0891B2), modifier = Modifier.size(14.dp))
                                            Text(text = targetAppt.appointmentTime ?: "OPD Slot", fontWeight = FontWeight.SemiBold, fontSize = 12.5.sp, color = Color(0xFF0891B2))
                                        }
                                    }

                                    HorizontalDivider(color = Color(0xFFF1F5F9))

                                    // Patient Demographics
                                    Row(
                                        modifier = Modifier.fillMaxWidth(),
                                        horizontalArrangement = Arrangement.SpaceBetween
                                    ) {
                                        Column {
                                            Text("Patient Name", fontSize = 10.5.sp, color = Color(0xFF64748B))
                                            Text(targetAppt.patientName, fontWeight = FontWeight.Bold, fontSize = 13.sp, color = Color(0xFF0F172A))
                                        }
                                        Column(horizontalAlignment = Alignment.End) {
                                            Text("Demographics", fontSize = 10.5.sp, color = Color(0xFF64748B))
                                            Text(
                                                listOfNotNull(
                                                    targetAppt.patientGender?.takeIf { it.isNotBlank() },
                                                    targetAppt.patientAge?.let { "$it yrs" }
                                                ).joinToString(" \u2022 ").ifBlank { "N/A" },
                                                fontSize = 12.sp,
                                                fontWeight = FontWeight.SemiBold,
                                                color = Color(0xFF334155)
                                            )
                                        }
                                    }
                                }
                            }
                        }

                        // ── 3. CLINICAL REMARKS & NOTES ──
                        item {
                            Surface(
                                shape = RoundedCornerShape(16.dp),
                                color = Color.White,
                                border = BorderStroke(1.dp, Color(0xFFE2E8F0)),
                                modifier = Modifier.fillMaxWidth()
                            ) {
                                Column(
                                    modifier = Modifier.padding(14.dp),
                                    verticalArrangement = Arrangement.spacedBy(8.dp)
                                ) {
                                    Row(
                                        verticalAlignment = Alignment.CenterVertically,
                                        horizontalArrangement = Arrangement.spacedBy(6.dp)
                                    ) {
                                        Icon(Icons.Default.RateReview, contentDescription = null, tint = Color(0xFF0284C7), modifier = Modifier.size(16.dp))
                                        Text("Doctor's Clinical Remarks & Recommendations", fontWeight = FontWeight.Bold, fontSize = 12.5.sp, color = Color(0xFF0284C7))
                                    }
                                    val cleanRem = com.dactor.patient.util.PaymentLedgerHelper.extractCleanClinicalRemarks(dRemarks)
                                    Text(
                                        text = cleanRem.ifBlank { "No clinical remarks recorded for this consultation." },
                                        fontSize = 13.sp,
                                        color = Color(0xFF334155),
                                        lineHeight = 18.sp
                                    )
                                }
                            }
                        }

                        // ── 4. DIAGNOSTIC LAB REPORTS ──
                        item {
                            Surface(
                                shape = RoundedCornerShape(16.dp),
                                color = Color.White,
                                border = BorderStroke(1.dp, Color(0xFFE2E8F0)),
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
                                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                            Icon(Icons.Default.Biotech, contentDescription = null, tint = Color(0xFF9333EA), modifier = Modifier.size(16.dp))
                                            Text("Diagnostic Lab Reports", fontWeight = FontWeight.Bold, fontSize = 13.sp, color = Color(0xFF581C87))
                                        }
                                        Surface(
                                            shape = RoundedCornerShape(6.dp),
                                            color = Color(0xFFFAF5FF)
                                        ) {
                                            Text(
                                                "${dLabReports.size} Available",
                                                fontSize = 10.5.sp,
                                                fontWeight = FontWeight.Bold,
                                                color = Color(0xFF9333EA),
                                                modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
                                            )
                                        }
                                    }

                                    if (dLabReports.isEmpty()) {
                                        Text("No diagnostic lab tests attached to this appointment.", fontSize = 12.sp, color = Color(0xFF94A3B8))
                                    } else {
                                        dLabReports.forEach { report ->
                                            val isPrepared = report.stage.equals("prepared", ignoreCase = true) || !report.fileUrl.isNullOrBlank()
                                            Surface(
                                                shape = RoundedCornerShape(10.dp),
                                                color = Color(0xFFFAF5FF),
                                                border = BorderStroke(1.dp, Color(0xFFE9D5FF)),
                                                modifier = Modifier.fillMaxWidth()
                                            ) {
                                                Column(
                                                    modifier = Modifier.padding(10.dp),
                                                    verticalArrangement = Arrangement.spacedBy(8.dp)
                                                ) {
                                                    Row(
                                                        modifier = Modifier.fillMaxWidth(),
                                                        horizontalArrangement = Arrangement.SpaceBetween,
                                                        verticalAlignment = Alignment.CenterVertically
                                                    ) {
                                                        Text(
                                                            text = report.testName.ifBlank { "Pathology Report" },
                                                            fontWeight = FontWeight.Bold,
                                                            fontSize = 12.5.sp,
                                                            color = Color(0xFF581C87)
                                                        )
                                                        Surface(
                                                            shape = RoundedCornerShape(6.dp),
                                                            color = if (isPrepared) Color(0xFFDCFCE7) else Color(0xFFFEF3C7)
                                                        ) {
                                                            Text(
                                                                text = if (isPrepared) "✓ Published" else "In Lab Processing",
                                                                fontSize = 10.sp,
                                                                fontWeight = FontWeight.Bold,
                                                                color = if (isPrepared) Color(0xFF15803D) else Color(0xFFB45309),
                                                                modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
                                                            )
                                                        }
                                                    }

                                                    Row(
                                                        modifier = Modifier.fillMaxWidth(),
                                                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                                                    ) {
                                                        OutlinedButton(
                                                            onClick = { onViewReport?.invoke(report) },
                                                            shape = RoundedCornerShape(8.dp),
                                                            modifier = Modifier.weight(1f).height(34.dp),
                                                            contentPadding = PaddingValues(horizontal = 8.dp, vertical = 4.dp)
                                                        ) {
                                                            Icon(Icons.Default.Visibility, contentDescription = null, tint = Color(0xFF9333EA), modifier = Modifier.size(13.dp))
                                                            Spacer(Modifier.width(4.dp))
                                                            Text("View Report", fontSize = 11.sp, fontWeight = FontWeight.Bold, color = Color(0xFF9333EA))
                                                        }
                                                        if (isPrepared) {
                                                            Button(
                                                                onClick = {
                                                                    com.dactor.patient.util.LabReportPdfDownloader.downloadAndSaveReportFile(
                                                                        context = context,
                                                                        report = report,
                                                                        patientName = targetAppt.patientName,
                                                                        patientAgeGender = listOfNotNull(targetAppt.patientGender, targetAppt.patientAge?.let { "$it yrs" }).joinToString(" \u2022 "),
                                                                        clinicName = clinicName,
                                                                        doctorName = doctorName
                                                                    )
                                                                },
                                                                shape = RoundedCornerShape(8.dp),
                                                                colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF9333EA)),
                                                                modifier = Modifier.weight(1f).height(34.dp),
                                                                contentPadding = PaddingValues(horizontal = 8.dp, vertical = 4.dp)
                                                            ) {
                                                                Icon(Icons.Default.Download, contentDescription = null, modifier = Modifier.size(13.dp))
                                                                Spacer(Modifier.width(4.dp))
                                                                Text("Download PDF", fontSize = 11.sp, fontWeight = FontWeight.Bold)
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

                        // ── 5. BILLING BREAKDOWN & PAYMENT LEDGER ──
                        item {
                            Surface(
                                shape = RoundedCornerShape(16.dp),
                                color = Color.White,
                                border = BorderStroke(1.dp, Color(0xFFE2E8F0)),
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
                                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                            Icon(Icons.Default.ReceiptLong, contentDescription = null, tint = Color(0xFF0F766E), modifier = Modifier.size(16.dp))
                                            Text("Billing Breakdown & Ledger", fontWeight = FontWeight.Bold, fontSize = 13.sp, color = Color(0xFF0F172A))
                                        }
                                        Surface(
                                            shape = RoundedCornerShape(6.dp),
                                            color = if (balanceLeft <= 0.0 && totalBill > 0.0) Color(0xFFDCFCE7) else Color(0xFFFEF3C7)
                                        ) {
                                            Text(
                                                text = if (totalBill <= 0.0) "NO BILL" else if (balanceLeft <= 0.0) "PAID" else "UNPAID (Rs. ${balanceLeft.toInt()})",
                                                fontWeight = FontWeight.ExtraBold,
                                                fontSize = 10.sp,
                                                color = if (balanceLeft <= 0.0 && totalBill > 0.0) Color(0xFF15803D) else Color(0xFFB45309),
                                                modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
                                            )
                                        }
                                    }

                                    Row(
                                        modifier = Modifier.fillMaxWidth(),
                                        horizontalArrangement = Arrangement.SpaceBetween
                                    ) {
                                        Column {
                                            Text("Total Bill", fontSize = 10.5.sp, color = Color(0xFF64748B))
                                            Text("Rs. ${totalBill.toInt()}", fontWeight = FontWeight.ExtraBold, fontSize = 14.sp, color = Color(0xFF0F172A))
                                        }
                                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                                            Text("Paid", fontSize = 10.5.sp, color = Color(0xFF64748B))
                                            Text("Rs. ${paidAmount.toInt()}", fontWeight = FontWeight.ExtraBold, fontSize = 14.sp, color = Color(0xFF15803D))
                                        }
                                        Column(horizontalAlignment = Alignment.End) {
                                            Text("Remaining", fontSize = 10.5.sp, color = Color(0xFF64748B))
                                            Text("Rs. ${balanceLeft.toInt()}", fontWeight = FontWeight.ExtraBold, fontSize = 14.sp, color = if (balanceLeft > 0.0) Color(0xFFDC2626) else Color(0xFF15803D))
                                        }
                                    }

                                    // Itemized Entries
                                    val dInvoiceItems = dInvoice?.items ?: emptyList()
                                    if (dInvoiceItems.isNotEmpty()) {
                                        Surface(
                                            color = Color(0xFFF8FAFC),
                                            shape = RoundedCornerShape(8.dp),
                                            border = BorderStroke(1.dp, Color(0xFFE2E8F0)),
                                            modifier = Modifier.fillMaxWidth()
                                        ) {
                                            Column(modifier = Modifier.padding(8.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                                                Text("Itemized Bill Entries:", fontSize = 10.5.sp, fontWeight = FontWeight.Bold, color = Color(0xFF475569))
                                                dInvoiceItems.forEach { itm ->
                                                    Row(
                                                        modifier = Modifier.fillMaxWidth(),
                                                        horizontalArrangement = Arrangement.SpaceBetween
                                                    ) {
                                                        Text(itm.itemName, fontSize = 11.sp, color = Color(0xFF334155))
                                                        Text("Rs. ${itm.effectiveTotal.toInt()}", fontSize = 11.sp, fontWeight = FontWeight.Bold, color = Color(0xFF0F172A))
                                                    }
                                                }
                                            }
                                        }
                                    }

                                    // Payment Receipts Time Log
                                    val pLogs = com.dactor.patient.util.PaymentLedgerHelper.parsePaymentRecords(dRemarks, paidAmount, dInvoice?.paidAt)
                                    if (pLogs.isNotEmpty()) {
                                        Surface(
                                            color = Color(0xFFF0FDF4),
                                            shape = RoundedCornerShape(8.dp),
                                            border = BorderStroke(1.dp, Color(0xFFBBF7D0)),
                                            modifier = Modifier.fillMaxWidth()
                                        ) {
                                            Column(modifier = Modifier.padding(8.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                                                Text("Payment Receipts & Time Log:", fontSize = 10.5.sp, fontWeight = FontWeight.Bold, color = Color(0xFF166534))
                                                pLogs.forEachIndexed { pIdx, p ->
                                                    Row(
                                                        modifier = Modifier.fillMaxWidth(),
                                                        horizontalArrangement = Arrangement.SpaceBetween,
                                                        verticalAlignment = Alignment.CenterVertically
                                                    ) {
                                                        Column(modifier = Modifier.weight(1f)) {
                                                            Text(p.dateTime, fontSize = 10.5.sp, fontWeight = FontWeight.SemiBold, color = Color(0xFF0F172A))
                                                            if (!p.note.isNullOrBlank()) {
                                                                Text(p.note, fontSize = 9.5.sp, color = Color(0xFF64748B))
                                                            }
                                                        }
                                                        Text("Rs. ${p.amount.toInt()}", fontSize = 11.sp, fontWeight = FontWeight.Bold, color = Color(0xFF15803D))
                                                    }
                                                    if (pIdx < pLogs.size - 1) {
                                                        HorizontalDivider(color = Color(0xFFDCFCE7), thickness = 0.5.dp)
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }

                        // ── 6. ASSOCIATED PAST APPOINTMENTS & VISIT HISTORY ──
                        item {
                            Surface(
                                shape = RoundedCornerShape(16.dp),
                                color = Color.White,
                                border = BorderStroke(1.dp, Color(0xFFE2E8F0)),
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
                                        Row(
                                            modifier = Modifier.weight(1f, fill = false),
                                            verticalAlignment = Alignment.CenterVertically,
                                            horizontalArrangement = Arrangement.spacedBy(6.dp)
                                        ) {
                                            Icon(Icons.Default.History, contentDescription = null, tint = Color(0xFF0284C7), modifier = Modifier.size(16.dp))
                                            Text(
                                                "All Associated Appointments & Visits",
                                                fontWeight = FontWeight.Bold,
                                                fontSize = 13.sp,
                                                color = Color(0xFF0F172A),
                                                maxLines = 1,
                                                overflow = TextOverflow.Ellipsis
                                            )
                                        }
                                        Spacer(Modifier.width(8.dp))
                                        Surface(
                                            shape = RoundedCornerShape(6.dp),
                                            color = Color(0xFFE0F2FE)
                                        ) {
                                            Text(
                                                "${associatedVisits.size} ${if (associatedVisits.size == 1) "Record" else "Records"}",
                                                fontSize = 10.5.sp,
                                                fontWeight = FontWeight.Bold,
                                                color = Color(0xFF0284C7),
                                                maxLines = 1,
                                                softWrap = false,
                                                modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
                                            )
                                        }
                                    }

                                    if (isLoadingVisits) {
                                        Box(modifier = Modifier.fillMaxWidth().padding(12.dp), contentAlignment = Alignment.Center) {
                                            CircularProgressIndicator(modifier = Modifier.size(24.dp), strokeWidth = 2.dp, color = Color(0xFF0284C7))
                                        }
                                    } else if (associatedVisits.isEmpty()) {
                                        Text("No associated visit history found.", fontSize = 12.sp, color = Color(0xFF94A3B8))
                                    } else {
                                        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                            associatedVisits.forEach { pastAppt ->
                                                val isSelected = pastAppt.id == targetAppt.id
                                                val pastDoc = pastAppt.doctorId?.let { doctorMap[it] }
                                                val pastDocName = pastDoc?.fullName?.let { if (it.startsWith("Dr.", true)) it else "Dr. $it" } ?: "Attending Physician"
                                                val pastClinic = clinicMap[pastAppt.clinicId]
                                                val pastClinicName = pastClinic?.name ?: "Partner Medical Clinic"

                                                Surface(
                                                    shape = RoundedCornerShape(12.dp),
                                                    color = if (isSelected) Color(0xFFF0F9FF) else Color(0xFFF8FAFC),
                                                    border = BorderStroke(
                                                        width = if (isSelected) 1.5.dp else 1.dp,
                                                        color = if (isSelected) Color(0xFF0284C7) else Color(0xFFE2E8F0)
                                                    ),
                                                    modifier = Modifier
                                                        .fillMaxWidth()
                                                        .clickable {
                                                            onSelectVisit(pastAppt)
                                                        }
                                                ) {
                                                    Row(
                                                        modifier = Modifier
                                                            .fillMaxWidth()
                                                            .padding(10.dp),
                                                        horizontalArrangement = Arrangement.SpaceBetween,
                                                        verticalAlignment = Alignment.CenterVertically
                                                    ) {
                                                        Column(
                                                            modifier = Modifier.weight(1f),
                                                            verticalArrangement = Arrangement.spacedBy(3.dp)
                                                        ) {
                                                            Row(
                                                                verticalAlignment = Alignment.CenterVertically,
                                                                horizontalArrangement = Arrangement.spacedBy(6.dp)
                                                            ) {
                                                                Text(
                                                                    text = pastAppt.appointmentDate,
                                                                    fontWeight = FontWeight.Bold,
                                                                    fontSize = 12.5.sp,
                                                                    color = if (isSelected) Color(0xFF0369A1) else Color(0xFF0F172A)
                                                                )
                                                                Text(
                                                                    text = "(${pastAppt.appointmentTime ?: "OPD"})",
                                                                    fontSize = 11.5.sp,
                                                                    color = Color(0xFF64748B)
                                                                )
                                                            }
                                                            Text(
                                                                text = "$pastDocName \u2022 $pastClinicName",
                                                                fontSize = 11.5.sp,
                                                                color = Color(0xFF475569),
                                                                maxLines = 1,
                                                                overflow = TextOverflow.Ellipsis
                                                            )
                                                        }

                                                        Spacer(Modifier.width(8.dp))

                                                        Column(
                                                            horizontalAlignment = Alignment.End,
                                                            verticalArrangement = Arrangement.spacedBy(4.dp)
                                                        ) {
                                                            // Checkin Status Badge
                                                            val isStatusCompleted = pastAppt.checkinStatus.lowercase() in listOf("completed", "done")
                                                            val formattedStatus = when {
                                                                isStatusCompleted -> "Completed"
                                                                pastAppt.checkinStatus.equals("checked_in", ignoreCase = true) -> "Checked In"
                                                                else -> pastAppt.checkinStatus.replace("_", " ").split(" ")
                                                                    .joinToString(" ") { word -> word.replaceFirstChar { if (it.isLowerCase()) it.titlecase() else it.toString() } }
                                                            }
                                                            Surface(
                                                                shape = RoundedCornerShape(6.dp),
                                                                color = if (isStatusCompleted) Color(0xFFDCFCE7) else Color(0xFFFEF3C7)
                                                            ) {
                                                                Text(
                                                                    text = formattedStatus,
                                                                    fontSize = 10.sp,
                                                                    fontWeight = FontWeight.Bold,
                                                                    color = if (isStatusCompleted) Color(0xFF15803D) else Color(0xFFB45309),
                                                                    maxLines = 1,
                                                                    softWrap = false,
                                                                    modifier = Modifier.padding(horizontal = 7.dp, vertical = 2.dp)
                                                                )
                                                            }

                                                            // Current Selection Status Badge or Switch Prompt
                                                            if (isSelected) {
                                                                Surface(
                                                                    shape = RoundedCornerShape(10.dp),
                                                                    color = Color(0xFFE0F2FE),
                                                                    border = BorderStroke(1.dp, Color(0xFF0284C7).copy(alpha = 0.35f))
                                                                ) {
                                                                    Row(
                                                                        verticalAlignment = Alignment.CenterVertically,
                                                                        horizontalArrangement = Arrangement.spacedBy(3.dp),
                                                                        modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
                                                                    ) {
                                                                        Icon(
                                                                            Icons.Default.CheckCircle,
                                                                            contentDescription = null,
                                                                            tint = Color(0xFF0284C7),
                                                                            modifier = Modifier.size(10.dp)
                                                                        )
                                                                        Text(
                                                                            "Current Appointment",
                                                                            fontSize = 9.sp,
                                                                            fontWeight = FontWeight.Bold,
                                                                            color = Color(0xFF0284C7),
                                                                            maxLines = 1,
                                                                            softWrap = false
                                                                        )
                                                                    }
                                                                }
                                                            } else {
                                                                Row(
                                                                    verticalAlignment = Alignment.CenterVertically,
                                                                    horizontalArrangement = Arrangement.spacedBy(2.dp)
                                                                ) {
                                                                    Text(
                                                                        "Tap to view",
                                                                        fontSize = 9.5.sp,
                                                                        color = Color(0xFF0284C7),
                                                                        fontWeight = FontWeight.Medium
                                                                    )
                                                                    Icon(
                                                                        Icons.Default.ChevronRight,
                                                                        contentDescription = null,
                                                                        tint = Color(0xFF0284C7),
                                                                        modifier = Modifier.size(11.dp)
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
                    }

                    // ── ACTION FOOTER: RESCHEDULE, BILL PDF & REMOVE (Docked with Inset Safety) ──
                    Surface(
                        color = Color.White,
                        shadowElevation = 8.dp,
                        border = BorderStroke(1.dp, Color(0xFFE2E8F0)),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Column(
                            modifier = Modifier
                                .fillMaxWidth()
                                .navigationBarsPadding()
                                .padding(horizontal = 14.dp, vertical = 12.dp),
                            verticalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.spacedBy(8.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                val isLabAppt = DiagnosticLabPolicy.isDiagnosticLabAppointment(
                                    appointment = targetAppt,
                                    clinic = dClinic,
                                    labReports = dLabReports
                                )
                                val canRescheduleModalAppt = if (isLabAppt) {
                                    DiagnosticLabPolicy.canRescheduleDiagnosticLab(
                                        appointment = targetAppt,
                                        labReports = dLabReports,
                                        requireNoShow = true
                                    )
                                } else {
                                    true
                                }
                                val isVisitCompleted = targetAppt.checkinStatus.lowercase() in listOf("done", "completed")
                                if (canRescheduleModalAppt) {
                                    OutlinedButton(
                                        onClick = { onReschedule(targetAppt) },
                                        shape = RoundedCornerShape(12.dp),
                                        border = BorderStroke(1.dp, Color(0xFF0284C7)),
                                        colors = ButtonDefaults.outlinedButtonColors(
                                            containerColor = Color(0xFFF0F9FF),
                                            contentColor = Color(0xFF0284C7)
                                        ),
                                        contentPadding = PaddingValues(horizontal = 4.dp, vertical = 0.dp),
                                        modifier = Modifier
                                            .weight(1.25f)
                                            .height(42.dp)
                                    ) {
                                        Icon(
                                            imageVector = if (!isLabAppt && isVisitCompleted) Icons.Default.EventRepeat else Icons.Default.CalendarMonth,
                                            contentDescription = null,
                                            modifier = Modifier.size(15.dp)
                                        )
                                        Spacer(Modifier.width(4.dp))
                                        Text(
                                            text = if (!isLabAppt && isVisitCompleted) "Book Follow-Up" else "Reschedule",
                                            fontSize = 11.5.sp,
                                            fontWeight = FontWeight.Bold,
                                            maxLines = 1,
                                            softWrap = false
                                        )
                                    }
                                }

                                Button(
                                    onClick = {
                                        BillPdfDownloader.downloadBillPdf(
                                            context = context,
                                            appointment = targetAppt,
                                            invoice = dInvoice,
                                            clinicName = clinicName,
                                            clinicAddress = clinicAddress,
                                            doctorName = doctorName,
                                            doctorSpecialty = doctorSpec,
                                            clinicalRemarks = com.dactor.patient.util.PaymentLedgerHelper.extractCleanClinicalRemarks(dRemarks)
                                        )
                                    },
                                    shape = RoundedCornerShape(12.dp),
                                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF0284C7)),
                                    contentPadding = PaddingValues(horizontal = 4.dp, vertical = 0.dp),
                                    modifier = Modifier
                                        .weight(1.05f)
                                        .height(42.dp)
                                ) {
                                    Icon(Icons.Default.Download, contentDescription = null, modifier = Modifier.size(15.dp))
                                    Spacer(Modifier.width(4.dp))
                                    Text(
                                        "Bill PDF",
                                        fontSize = 11.5.sp,
                                        fontWeight = FontWeight.Bold,
                                        maxLines = 1,
                                        softWrap = false
                                    )
                                }

                                OutlinedButton(
                                    onClick = { onRemove(targetAppt) },
                                    shape = RoundedCornerShape(12.dp),
                                    border = BorderStroke(1.dp, Color(0xFFFECACA)),
                                    colors = ButtonDefaults.outlinedButtonColors(
                                        containerColor = Color(0xFFFFF1F2),
                                        contentColor = Color(0xFFDC2626)
                                    ),
                                    contentPadding = PaddingValues(horizontal = 4.dp, vertical = 0.dp),
                                    modifier = Modifier
                                        .weight(0.95f)
                                        .height(42.dp)
                                ) {
                                    Icon(Icons.Default.DeleteOutline, contentDescription = null, modifier = Modifier.size(15.dp))
                                    Spacer(Modifier.width(3.dp))
                                    Text(
                                        "Remove",
                                        fontSize = 11.5.sp,
                                        fontWeight = FontWeight.Bold,
                                        maxLines = 1,
                                        softWrap = false
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

@Composable
fun RemoveRecordConfirmDialog(
    targetAppt: Appointment,
    onDismiss: () -> Unit,
    onConfirmRemove: (Appointment) -> Unit
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        icon = {
            Icon(Icons.Default.DeleteOutline, contentDescription = null, tint = Color(0xFFDC2626), modifier = Modifier.size(28.dp))
        },
        title = {
            Text("Remove from My Records?", fontWeight = FontWeight.Bold, fontSize = 17.sp)
        },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(
                    "Are you sure you want to remove appointment #${targetAppt.trackingCode10Digit} (${targetAppt.patientName} \u2022 ${targetAppt.appointmentDate}) from your active records list?",
                    fontSize = 13.sp,
                    color = Color(0xFF475569)
                )
                Surface(
                    shape = RoundedCornerShape(8.dp),
                    color = Color(0xFFF1F5F9),
                    modifier = Modifier.fillMaxWidth().padding(top = 4.dp)
                ) {
                    Text(
                        "You can easily re-add and restore this record anytime by clicking '+ Link Code' and entering its 10-digit tracking code (${targetAppt.trackingCode10Digit}) or Appointment ID.",
                        fontSize = 11.5.sp,
                        color = Color(0xFF0F766E),
                        modifier = Modifier.padding(10.dp)
                    )
                }
            }
        },
        confirmButton = {
            Button(
                onClick = { onConfirmRemove(targetAppt) },
                colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFDC2626)),
                shape = RoundedCornerShape(8.dp)
            ) {
                Text("Remove Record", fontWeight = FontWeight.Bold)
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text("Keep Record")
            }
        }
    )
}

@Composable
fun RescheduleConfirmDialog(
    targetAppt: Appointment,
    clinicMap: Map<String, Clinic>,
    doctorMap: Map<String, Doctor>,
    labReports: List<LabReport> = emptyList(),
    queueStatus: String? = null,
    onDismiss: () -> Unit,
    onConfirmReschedule: (Appointment) -> Unit
) {
    val targetClinic = clinicMap[targetAppt.clinicId]
    val targetDoctor = targetAppt.doctorId?.let { doctorMap[it] }
    val isTargetLab = DiagnosticLabPolicy.isDiagnosticLabAppointment(
        appointment = targetAppt,
        clinic = targetClinic,
        queueStatus = queueStatus,
        labReports = labReports
    )
    val isLabBlocked = isTargetLab && DiagnosticLabPolicy.isSampleCollectedOrFurther(
        appointment = targetAppt,
        queueStatus = queueStatus,
        labReports = labReports
    )
    val isCompleted = !isTargetLab && targetAppt.checkinStatus.lowercase() in listOf("done", "completed")
    AlertDialog(
        onDismissRequest = onDismiss,
        icon = {
            Icon(
                imageVector = when {
                    isLabBlocked -> Icons.Default.Science
                    isCompleted -> Icons.Default.EventRepeat
                    else -> Icons.Default.CalendarMonth
                },
                contentDescription = null,
                tint = if (isLabBlocked) Color(0xFF00796B) else Color(0xFF0284C7),
                modifier = Modifier.size(28.dp)
            )
        },
        title = {
            Text(
                text = when {
                    isLabBlocked -> "Reschedule Unavailable"
                    isTargetLab -> "Reschedule Lab Appointment?"
                    isCompleted -> "Book Follow-Up Consultation?"
                    else -> "Reschedule Consultation?"
                },
                fontWeight = FontWeight.Bold,
                fontSize = 17.sp
            )
        },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text(
                    text = when {
                        isLabBlocked -> "Your diagnostic lab sample has already been collected or processed. This appointment can no longer be rescheduled."
                        isCompleted -> "You will be redirected to choose a new follow-up date and time slot. Your past medical notes and prescriptions remain securely preserved."
                        else -> "You will be redirected to choose a new available date and time slot from the calendar."
                    },
                    fontSize = 13.sp,
                    color = Color(0xFF475569)
                )
                Surface(
                    shape = RoundedCornerShape(10.dp),
                    color = Color(0xFFF8FAFC),
                    border = BorderStroke(1.dp, Color(0xFFE2E8F0)),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Column(
                        modifier = Modifier.padding(10.dp),
                        verticalArrangement = Arrangement.spacedBy(4.dp)
                    ) {
                        Text(
                            if (isTargetLab) "Service: Lab Sample Collection" else "Doctor: ${targetDoctor?.fullName?.let { if (it.startsWith("Dr.", true)) it else "Dr. $it" } ?: "Attending Doctor"}",
                            fontSize = 12.sp,
                            fontWeight = FontWeight.SemiBold,
                            color = Color(0xFF0F172A)
                        )
                        Text(
                            "Clinic: ${targetClinic?.name ?: "Partner Medical Clinic"}",
                            fontSize = 12.sp,
                            color = Color(0xFF64748B)
                        )
                        Text(
                            "Visit: ${targetAppt.appointmentDate} \u2022 ${targetAppt.appointmentTime ?: "OPD"}",
                            fontSize = 12.sp,
                            fontWeight = FontWeight.Bold,
                            color = Color(0xFF0284C7)
                        )
                        if (!isLabBlocked) {
                            Text(
                                text = if (isCompleted) "Follow-Up Fee: Free (Rs. 0)" else "Fee: Retained (Rs. 0 / Zero Additional Payment)",
                                fontSize = 11.5.sp,
                                fontWeight = FontWeight.ExtraBold,
                                color = Color(0xFF16A34A)
                            )
                        }
                    }
                }
            }
        },
        confirmButton = {
            if (isLabBlocked) {
                Button(
                    onClick = onDismiss,
                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF00796B)),
                    shape = RoundedCornerShape(8.dp)
                ) {
                    Text("Close", fontWeight = FontWeight.Bold)
                }
            } else {
                Button(
                    onClick = { onConfirmReschedule(targetAppt) },
                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF0284C7)),
                    shape = RoundedCornerShape(8.dp)
                ) {
                    Text(if (isCompleted) "Pick Follow-Up Slot →" else "Pick New Slot →", fontWeight = FontWeight.Bold)
                }
            }
        },
        dismissButton = {
            if (!isLabBlocked) {
                TextButton(onClick = onDismiss) {
                    Text("Cancel")
                }
            }
        }
    )
}

// =========================================================================
// TAB 3: PROFILE (Full Profile, Saved Codes, Claim, Terms, Archive/Delete)
// =========================================================================
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ProfileTab(
    navController: NavController,
    authRepository: AuthRepository?,
    appointmentRepository: AppointmentRepository?,
    clinicRepository: ClinicRepository? = null,
    doctorRepository: DoctorRepository? = null,
    labReportRepository: LabReportRepository? = null,
    sessionManager: UserSessionManager?
) {
    val context = LocalContext.current
    val coroutineScope = rememberCoroutineScope()

    var isUserLoggedIn by remember {
        mutableStateOf(
            sessionManager?.isLoggedIn() == true ||
            (authRepository?.isLoggedIn() == true) ||
            (try { com.google.firebase.auth.FirebaseAuth.getInstance().currentUser != null } catch (_: Exception) { false })
        )
    }

    LaunchedEffect(Unit) {
        val currentLoginState = sessionManager?.isLoggedIn() == true ||
            (authRepository?.isLoggedIn() == true) ||
            (try { com.google.firebase.auth.FirebaseAuth.getInstance().currentUser != null } catch (_: Exception) { false })
        if (currentLoginState != isUserLoggedIn) {
            isUserLoggedIn = currentLoginState
        }
    }

    if (!isUserLoggedIn) {
        Scaffold(
            topBar = {
                TopAppBar(
                    title = {
                        Text(
                            "Account",
                            fontWeight = FontWeight.Bold,
                            fontSize = 20.sp,
                            color = Color(0xFF0F172A)
                        )
                    },
                    colors = TopAppBarDefaults.topAppBarColors(containerColor = Color.Transparent)
                )
            },
            containerColor = Color(0xFFF8FAFC)
        ) { padding ->
            GuestAccountView(
                onSignInClicked = {
                    navController.navigate(NavRoutes.Login.route)
                },
                modifier = Modifier.padding(padding),
                authRepository = authRepository,
                sessionManager = sessionManager,
                appointmentRepository = appointmentRepository,
                onLoginSuccess = {
                    isUserLoggedIn = true
                }
            )
        }
        return
    }

    var userName by remember { mutableStateOf(sessionManager?.getSavedName() ?: "Patient") }
    var userEmail by remember { mutableStateOf(sessionManager?.getSavedEmail() ?: "") }
    var userPhone by remember { mutableStateOf(sessionManager?.getSavedPhone() ?: "") }
    var userGender by remember { mutableStateOf(sessionManager?.getSavedGender() ?: "Not specified") }
    var userAge by remember { mutableStateOf(sessionManager?.getSavedAge()) }

    var isArchived by remember { mutableStateOf(sessionManager?.isAccountArchived() == true) }
    var deletionScheduledAt by remember { mutableStateOf(sessionManager?.getDeletionScheduledAt()) }

    var showEditProfileDialog by remember { mutableStateOf(false) }
    var editName by remember { mutableStateOf(userName) }
    var editPhone by remember { mutableStateOf(userPhone) }
    var editGender by remember { mutableStateOf(if (userGender != "Not specified") userGender else "Male") }
    var editAge by remember { mutableStateOf(userAge?.toString() ?: "") }

    var showClaimDialog by remember { mutableStateOf(false) }
    var claimCodeInput by remember { mutableStateOf("") }
    var claimMessage by remember { mutableStateOf<String?>(null) }

    var showTermsDialog by remember { mutableStateOf(false) }
    var showSignOutDialog by remember { mutableStateOf(false) }
    var showDeleteAccountDialog by remember { mutableStateOf(false) }

    var savedCodes by remember { mutableStateOf(sessionManager?.getSavedTrackingCodes() ?: emptyList()) }

    var showTransactionHistoryDialog by remember { mutableStateOf(false) }
    var transactionHistoryList by remember { mutableStateOf<List<com.dactor.patient.data.model.PatientTransactionRecord>>(emptyList()) }
    var isLoadingTransactions by remember { mutableStateOf(false) }

    fun loadTransactionHistory() {
        if (isLoadingTransactions) return
        isLoadingTransactions = true
        coroutineScope.launch {
            try {
                val cached = sessionManager?.getLocalTransactionRecords() ?: emptyList()
                val pid = sessionManager?.getSavedPatientId() ?: ""
                val remote = appointmentRepository?.getAllPatientTransactions(
                    userId = pid,
                    email = userEmail,
                    phone = userPhone,
                    trackingCodes = savedCodes.map { it.first }
                ) ?: emptyList()
                val merged = (remote + cached).distinctBy { it.id + it.appointmentId }.sortedByDescending { it.appointmentDate }
                transactionHistoryList = merged
            } catch (e: Exception) {
                e.printStackTrace()
                transactionHistoryList = sessionManager?.getLocalTransactionRecords() ?: emptyList()
            } finally {
                isLoadingTransactions = false
            }
        }
    }

    // Connected Bills & Appointments in Profile
    var patientAppts by remember { mutableStateOf<List<Appointment>>(emptyList()) }
    val profileInvoiceMap = remember { mutableStateMapOf<String, BillingInvoice>() }
    val profileClinicMap = remember { mutableStateMapOf<String, Clinic>() }
    val profileDoctorMap = remember { mutableStateMapOf<String, Doctor>() }
    var isLoadingBills by remember { mutableStateOf(true) }

    // Edit Paid / Left Dialog in Profile
    var editingProfileBillAppt by remember { mutableStateOf<Appointment?>(null) }
    var profileTotalInput by remember { mutableStateOf("") }
    var profilePaidInput by remember { mutableStateOf("") }
    var isSavingProfilePayment by remember { mutableStateOf(false) }

    // Full Details, Visit History, Lab Reports & Actions in Profile
    var viewingRecordDetails by remember { mutableStateOf<Appointment?>(null) }
    var associatedVisitsForDetail by remember { mutableStateOf<List<Appointment>>(emptyList()) }
    var isLoadingVisitsForDetail by remember { mutableStateOf(false) }
    var apptToRemoveConfirm by remember { mutableStateOf<Appointment?>(null) }
    var apptToRescheduleConfirm by remember { mutableStateOf<Appointment?>(null) }
    val profileRemarksMap = remember { mutableStateMapOf<String, String>() }
    val profileLabReportMap = remember { mutableStateMapOf<String, List<com.dactor.patient.data.model.LabReport>>() }
    var verifyingReport by remember { mutableStateOf<com.dactor.patient.data.model.LabReport?>(null) }
    var enteredPatientName by remember { mutableStateOf("") }
    var verificationError by remember { mutableStateOf<String?>(null) }

    suspend fun loadProfileBillsAndHistory() {
        isLoadingBills = true
        try {
            savedCodes = sessionManager?.getSavedTrackingCodes() ?: emptyList()
            if (clinicRepository != null) {
                clinicRepository.getClinics().forEach { profileClinicMap[it.id] = it }
            }
            if (doctorRepository != null) {
                doctorRepository.getDoctors(null).forEach { profileDoctorMap[it.id] = it }
            }
            val pid = sessionManager?.getSavedPatientId() ?: ""
            val hiddenCodes = sessionManager?.getHiddenRecordCodes() ?: emptySet()
            val appts = appointmentRepository?.getAllPatientAppointments(
                userId = pid,
                email = userEmail,
                phone = userPhone,
                trackingCodes = savedCodes.map { it.first }
            ) ?: emptyList()
            val filteredAppts = appts.filter { !hiddenCodes.contains(it.trackingCode10Digit) && !hiddenCodes.contains(it.id) }
            patientAppts = filteredAppts

            if (appointmentRepository != null && filteredAppts.isNotEmpty()) {
                val invs = appointmentRepository.getInvoicesForAppointments(filteredAppts.map { it.id })
                profileInvoiceMap.clear()
                profileInvoiceMap.putAll(invs)
            }

            if (labReportRepository != null && filteredAppts.isNotEmpty()) {
                coroutineScope {
                    filteredAppts.filter { appt ->
                        DiagnosticLabPolicy.isDiagnosticLabAppointment(appt, profileClinicMap[appt.clinicId])
                    }.map { appt ->
                        async {
                            try {
                                val reports = labReportRepository.getLabReportsForAppointment(
                                    appointmentId = appt.id,
                                    trackingCode = appt.trackingCode10Digit
                                )
                                profileLabReportMap[appt.id] = reports
                            } catch (_: Exception) {}
                        }
                    }.awaitAll()
                }
            }
        } catch (e: Exception) {
            e.printStackTrace()
        } finally {
            isLoadingBills = false
        }
    }

    LaunchedEffect(Unit) {
        loadProfileBillsAndHistory()
    }

    LaunchedEffect(viewingRecordDetails?.id) {
        val target = viewingRecordDetails
        if (target != null) {
            isLoadingVisitsForDetail = true
            try {
                if (appointmentRepository != null) {
                    val targetCode = target.trackingCode10Digit
                    val visits = if (targetCode.isNotBlank()) {
                        appointmentRepository.getAllAppointmentsByTrackingCode(targetCode)
                    } else {
                        listOf(target)
                    }
                    associatedVisitsForDetail = visits.ifEmpty { listOf(target) }

                    val visitIds = associatedVisitsForDetail.map { it.id }
                    val invoices = appointmentRepository.getInvoicesForAppointments(visitIds)
                    profileInvoiceMap.putAll(invoices)

                    invoices.forEach { (apptId, inv) ->
                        val cleanRemarks = com.dactor.patient.util.PaymentLedgerHelper.extractCleanClinicalRemarks(inv.remarks)
                        if (!cleanRemarks.isNullOrBlank()) {
                            profileRemarksMap[apptId] = cleanRemarks
                        }
                    }

                    if (labReportRepository != null) {
                        associatedVisitsForDetail.forEach { v ->
                            try {
                                val reports = labReportRepository.getLabReportsForAppointment(
                                    appointmentId = v.id,
                                    trackingCode = v.trackingCode10Digit
                                )
                                if (reports.isNotEmpty()) {
                                    profileLabReportMap[v.id] = reports
                                }
                            } catch (_: Exception) {}
                        }
                    }
                } else {
                    associatedVisitsForDetail = listOf(target)
                }
            } catch (e: Exception) {
                e.printStackTrace()
                associatedVisitsForDetail = listOf(target)
            } finally {
                isLoadingVisitsForDetail = false
            }
        } else {
            associatedVisitsForDetail = emptyList()
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                navigationIcon = {
                    IconButton(onClick = { navController.popBackStack() }) {
                        Icon(
                            Icons.AutoMirrored.Filled.ArrowBack,
                            contentDescription = "Back",
                            tint = Color(0xFF0F172A)
                        )
                    }
                },
                title = {
                    Column {
                        Text(
                            "Patient Profile",
                            fontWeight = FontWeight.Bold,
                            fontSize = 20.sp,
                            color = Color(0xFF0F172A)
                        )
                        Text(
                            "Your health record, bills & account",
                            fontSize = 12.sp,
                            color = Color(0xFF64748B)
                        )
                    }
                },
                actions = {
                    IconButton(onClick = { coroutineScope.launch { loadProfileBillsAndHistory() } }) {
                        Icon(
                            Icons.Default.Refresh,
                            contentDescription = "Refresh Bills",
                            tint = Color(0xFF0F172A),
                            modifier = Modifier.size(22.dp)
                        )
                    }
                    IconButton(onClick = { navController.navigate(NavRoutes.Notifications.route) }) {
                        Icon(
                            Icons.Default.NotificationsNone,
                            contentDescription = "Notifications",
                            tint = Color(0xFF0F172A),
                            modifier = Modifier.size(24.dp)
                        )
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = Color.Transparent)
            )
        },
        containerColor = Color(0xFFF8FAFC)
    ) { padding ->
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(horizontal = 20.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
            contentPadding = PaddingValues(top = 8.dp, bottom = 32.dp)
        ) {
            // ── 1. Profile Card Header ─────────────────────────────────────────
            item {
                Card(
                    shape = RoundedCornerShape(22.dp),
                    colors = CardDefaults.cardColors(containerColor = Color.White),
                    elevation = CardDefaults.cardElevation(defaultElevation = 2.dp),
                    border = BorderStroke(1.dp, Color(0xFFE2E8F0)),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Column(
                        modifier = Modifier.padding(18.dp),
                        verticalArrangement = Arrangement.spacedBy(16.dp)
                    ) {
                        // Avatar, User Info, Edit Button
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(14.dp)
                        ) {
                            Surface(
                                shape = CircleShape,
                                color = Color(0xFFE0F7FA),
                                modifier = Modifier.size(60.dp)
                            ) {
                                Box(contentAlignment = Alignment.Center) {
                                    Icon(
                                        Icons.Default.Person,
                                        contentDescription = null,
                                        tint = Color(0xFF0284C7),
                                        modifier = Modifier.size(34.dp)
                                    )
                                }
                            }

                            Column(modifier = Modifier.weight(1f)) {
                                Text(
                                    text = userName,
                                    fontWeight = FontWeight.ExtraBold,
                                    fontSize = 18.sp,
                                    color = Color(0xFF0F172A)
                                )
                                Spacer(Modifier.height(3.dp))
                                Row(
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(4.dp)
                                ) {
                                    Icon(
                                        Icons.Default.Email,
                                        contentDescription = null,
                                        tint = Color(0xFF0284C7),
                                        modifier = Modifier.size(13.dp)
                                    )
                                    Text(
                                        text = if (userEmail.isNotBlank()) userEmail else "No email linked",
                                        fontSize = 12.sp,
                                        color = Color(0xFF64748B),
                                        maxLines = 1,
                                        overflow = TextOverflow.Ellipsis
                                    )
                                }
                            }

                            OutlinedButton(
                                onClick = {
                                    editName = userName
                                    editPhone = userPhone
                                    editGender = if (userGender != "Not specified") userGender else "Male"
                                    editAge = userAge?.toString() ?: ""
                                    showEditProfileDialog = true
                                },
                                shape = RoundedCornerShape(12.dp),
                                border = BorderStroke(1.dp, Color(0xFF0284C7)),
                                contentPadding = PaddingValues(horizontal = 14.dp, vertical = 6.dp),
                                modifier = Modifier.defaultMinSize(minHeight = 36.dp)
                            ) {
                                Icon(
                                    Icons.Default.Edit,
                                    contentDescription = null,
                                    tint = Color(0xFF0284C7),
                                    modifier = Modifier.size(14.dp)
                                )
                                Spacer(Modifier.width(6.dp))
                                Text(
                                    "Edit",
                                    fontSize = 12.sp,
                                    fontWeight = FontWeight.Bold,
                                    color = Color(0xFF0284C7)
                                )
                            }
                        }

                        // 3-Column Demographics Row
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            // Col 1: Gender
                            Column(
                                modifier = Modifier.weight(1f),
                                verticalArrangement = Arrangement.spacedBy(3.dp)
                            ) {
                                Row(
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(4.dp)
                                ) {
                                    Icon(
                                        Icons.Default.Wc,
                                        contentDescription = null,
                                        tint = Color(0xFF0284C7),
                                        modifier = Modifier.size(15.dp)
                                    )
                                    Text("Gender", fontSize = 11.sp, color = Color(0xFF64748B))
                                }
                                Text(
                                    text = userGender,
                                    fontWeight = FontWeight.Bold,
                                    fontSize = 13.sp,
                                    color = Color(0xFF1E293B)
                                )
                            }

                            Box(
                                modifier = Modifier
                                    .width(1.dp)
                                    .height(28.dp)
                                    .background(Color(0xFFE2E8F0))
                            )

                            // Col 2: Age
                            Column(
                                modifier = Modifier
                                    .weight(1f)
                                    .padding(start = 12.dp),
                                verticalArrangement = Arrangement.spacedBy(3.dp)
                            ) {
                                Row(
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(4.dp)
                                ) {
                                    Icon(
                                        Icons.Default.CalendarToday,
                                        contentDescription = null,
                                        tint = Color(0xFF0284C7),
                                        modifier = Modifier.size(14.dp)
                                    )
                                    Text("Age", fontSize = 11.sp, color = Color(0xFF64748B))
                                }
                                Text(
                                    text = userAge?.let { "$it yrs" } ?: "Not set",
                                    fontWeight = FontWeight.Bold,
                                    fontSize = 13.sp,
                                    color = Color(0xFF1E293B)
                                )
                            }

                            Box(
                                modifier = Modifier
                                    .width(1.dp)
                                    .height(28.dp)
                                    .background(Color(0xFFE2E8F0))
                            )

                            // Col 3: Account Type
                            Column(
                                modifier = Modifier
                                    .weight(1.2f)
                                    .padding(start = 12.dp),
                                verticalArrangement = Arrangement.spacedBy(3.dp)
                            ) {
                                Row(
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(4.dp)
                                ) {
                                    Icon(
                                        Icons.Default.PersonOutline,
                                        contentDescription = null,
                                        tint = Color(0xFF0284C7),
                                        modifier = Modifier.size(15.dp)
                                    )
                                    Text("Account Type", fontSize = 11.sp, color = Color(0xFF64748B))
                                }
                                Text(
                                    text = "Nepal Account",
                                    fontWeight = FontWeight.Bold,
                                    fontSize = 13.sp,
                                    color = Color(0xFF0284C7)
                                )
                            }
                        }

                        // Security Banner inside bottom of Card
                        Surface(
                            shape = RoundedCornerShape(14.dp),
                            color = Color(0xFFF0FDF4),
                            border = BorderStroke(1.dp, Color(0xFFCCFBF1)),
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Row(
                                modifier = Modifier.padding(horizontal = 12.dp, vertical = 10.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(10.dp)
                            ) {
                                Icon(
                                    Icons.Default.Shield,
                                    contentDescription = null,
                                    tint = Color(0xFF0F766E),
                                    modifier = Modifier.size(24.dp)
                                )
                                Column(modifier = Modifier.weight(1f)) {
                                    Text(
                                        "Your health information is secure",
                                        fontWeight = FontWeight.Bold,
                                        fontSize = 12.sp,
                                        color = Color(0xFF0F172A)
                                    )
                                    Text(
                                        "We keep your data safe and confidential.",
                                        fontSize = 10.sp,
                                        color = Color(0xFF64748B)
                                    )
                                }
                                Icon(
                                    Icons.Default.ChevronRight,
                                    contentDescription = null,
                                    tint = Color(0xFF0F766E),
                                    modifier = Modifier.size(18.dp)
                                )
                            }
                        }
                    }
                }
            }

            // ── 2. My Clinic Bills & Payment Summary Card (Connected to Clinic Billing) ──
            item {
                val billableAppts = patientAppts

                var grandTotalBilled = 0.0
                var grandTotalPaid = 0.0
                billableAppts.forEach { appt ->
                    val inv = profileInvoiceMap[appt.id]
                    val doc = appt.doctorId?.let { profileDoctorMap[it] }
                    val t = when {
                        inv != null && inv.totalAmount > 0.0 -> inv.totalAmount
                        (appt.feeAmount ?: 0.0) > 0.0 -> appt.feeAmount ?: 0.0
                        else -> doc?.consultationFee ?: 500.0
                    }
                    val p = when {
                        inv != null && (inv.paidAmount != null || inv.totalAmount > 0.0) -> inv.effectivePaidAmount
                        appt.paymentStatus.equals("paid", ignoreCase = true) -> t
                        else -> 0.0
                    }
                    grandTotalBilled += t
                    grandTotalPaid += p
                }
                val grandTotalLeft = (grandTotalBilled - grandTotalPaid).coerceAtLeast(0.0)

                Card(
                    shape = RoundedCornerShape(22.dp),
                    colors = CardDefaults.cardColors(containerColor = Color.White),
                    elevation = CardDefaults.cardElevation(defaultElevation = 2.dp),
                    border = BorderStroke(1.dp, Color(0xFFE2E8F0)),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Column(
                        modifier = Modifier.padding(18.dp),
                        verticalArrangement = Arrangement.spacedBy(14.dp)
                    ) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(10.dp)
                            ) {
                                Surface(
                                    shape = RoundedCornerShape(12.dp),
                                    color = Color(0xFFE0F2F1),
                                    modifier = Modifier.size(40.dp)
                                ) {
                                    Box(contentAlignment = Alignment.Center) {
                                        Icon(
                                            Icons.Default.ReceiptLong,
                                            contentDescription = null,
                                            tint = Color(0xFF0284C7),
                                            modifier = Modifier.size(22.dp)
                                        )
                                    }
                                }
                                Column {
                                    Text(
                                        "Clinic Bills & Consultations (${billableAppts.size})",
                                        fontWeight = FontWeight.Bold,
                                        fontSize = 14.sp,
                                        color = Color(0xFF0F172A)
                                    )
                                    Text(
                                        "Tap record for full details & history, reschedule or bill",
                                        fontSize = 11.sp,
                                        color = Color(0xFF64748B)
                                    )
                                }
                            }

                            IconButton(
                                onClick = { coroutineScope.launch { loadProfileBillsAndHistory() } },
                                modifier = Modifier.size(32.dp)
                            ) {
                                Icon(Icons.Default.Refresh, contentDescription = "Refresh", tint = Color(0xFF0284C7), modifier = Modifier.size(18.dp))
                            }
                        }

                        // Summary Totals Banner (Total Billed | Paid | Left)
                        Surface(
                            shape = RoundedCornerShape(14.dp),
                            color = Color(0xFFF8FAFC),
                            border = BorderStroke(1.dp, Color(0xFFE2E8F0)),
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(horizontal = 14.dp, vertical = 10.dp),
                                horizontalArrangement = Arrangement.SpaceBetween
                            ) {
                                Column {
                                    Text("Total Billed", fontSize = 10.sp, color = Color(0xFF64748B))
                                    Text(
                                        "Rs. ${grandTotalBilled.toInt()}",
                                        fontWeight = FontWeight.ExtraBold,
                                        fontSize = 15.sp,
                                        color = Color(0xFF0F172A)
                                    )
                                }
                                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                                    Text("Total Paid", fontSize = 10.sp, color = Color(0xFF64748B))
                                    Text(
                                        "Rs. ${grandTotalPaid.toInt()}",
                                        fontWeight = FontWeight.ExtraBold,
                                        fontSize = 15.sp,
                                        color = Color(0xFF15803D)
                                    )
                                }
                                Column(horizontalAlignment = Alignment.End) {
                                    Text("Remaining Left", fontSize = 10.sp, color = Color(0xFF64748B))
                                    Text(
                                        "Rs. ${grandTotalLeft.toInt()}",
                                        fontWeight = FontWeight.ExtraBold,
                                        fontSize = 15.sp,
                                        color = if (grandTotalLeft > 0.0) Color(0xFFDC2626) else Color(0xFF15803D)
                                    )
                                }
                            }
                        }

                        if (isLoadingBills) {
                            Box(modifier = Modifier.fillMaxWidth().padding(12.dp), contentAlignment = Alignment.Center) {
                                CircularProgressIndicator(modifier = Modifier.size(24.dp), strokeWidth = 2.dp, color = Color(0xFF0284C7))
                            }
                        } else if (billableAppts.isEmpty()) {
                            Text(
                                "No clinic bills pushed yet. Link a 10-digit code below or book a consultation to view and download your bills here.",
                                fontSize = 12.sp,
                                color = Color(0xFF94A3B8),
                                modifier = Modifier.padding(vertical = 4.dp)
                            )
                        } else {
                            billableAppts.forEach { appt ->
                                val inv = profileInvoiceMap[appt.id]
                                val clinic = profileClinicMap[appt.clinicId]
                                val doc = appt.doctorId?.let { profileDoctorMap[it] }
                                val cName = clinic?.name ?: "Partner Medical Clinic"
                                val cAddr = clinic?.addressText ?: "Nepal"
                                val dName = doc?.fullName?.let { if (it.startsWith("Dr.", true)) it else "Dr. $it" } ?: "Attending Doctor"
                                val dSpec = doc?.allSpecialties?.firstOrNull() ?: doc?.specialty ?: "General Physician"

                                val totalBill = when {
                                    inv != null && inv.totalAmount > 0.0 -> inv.totalAmount
                                    (appt.feeAmount ?: 0.0) > 0.0 -> appt.feeAmount ?: 0.0
                                    else -> doc?.consultationFee ?: 500.0
                                }
                                val paidAmt = when {
                                    inv != null && (inv.paidAmount != null || inv.totalAmount > 0.0) -> inv.effectivePaidAmount
                                    appt.paymentStatus.equals("paid", ignoreCase = true) -> totalBill
                                    else -> 0.0
                                }
                                val leftAmt = (totalBill - paidAmt).coerceAtLeast(0.0)

                                Surface(
                                    shape = RoundedCornerShape(14.dp),
                                    color = if (leftAmt > 0.0) Color(0xFFFFFBEB) else Color(0xFFF0FDF4).copy(alpha = 0.6f),
                                    border = BorderStroke(1.dp, if (leftAmt > 0.0) Color(0xFFFDE68A) else Color(0xFFBBF7D0)),
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .clickable { viewingRecordDetails = appt }
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
                                                modifier = Modifier.weight(1f),
                                                verticalAlignment = Alignment.CenterVertically,
                                                horizontalArrangement = Arrangement.spacedBy(10.dp)
                                            ) {
                                                val cImg = clinic?.resolvedLogoUrl ?: clinic?.resolvedCoverPictureUrl ?: clinic?.pictures?.firstOrNull()
                                                Surface(
                                                    shape = RoundedCornerShape(8.dp),
                                                    color = Color(0xFF0284C7).copy(alpha = 0.12f),
                                                    modifier = Modifier.size(34.dp)
                                                ) {
                                                    if (!cImg.isNullOrBlank()) {
                                                        coil.compose.AsyncImage(
                                                            model = cImg,
                                                            contentDescription = cName,
                                                            contentScale = androidx.compose.ui.layout.ContentScale.Crop,
                                                            modifier = Modifier.fillMaxSize()
                                                        )
                                                    } else {
                                                        Box(contentAlignment = Alignment.Center) {
                                                            Icon(Icons.Default.LocalHospital, contentDescription = null, tint = Color(0xFF0284C7), modifier = Modifier.size(18.dp))
                                                        }
                                                    }
                                                }
                                                Column {
                                                    Text(
                                                        text = cName,
                                                        fontWeight = FontWeight.ExtraBold,
                                                        fontSize = 14.sp,
                                                        color = Color(0xFF0F172A)
                                                    )
                                                    Text(
                                                        text = "$dName \u2022 ${appt.appointmentDate} (${appt.appointmentTime ?: "OPD"})",
                                                        fontSize = 11.sp,
                                                        color = Color(0xFF475569)
                                                    )
                                                }
                                            }
                                            Row(
                                                verticalAlignment = Alignment.CenterVertically,
                                                horizontalArrangement = Arrangement.spacedBy(4.dp)
                                            ) {
                                                Surface(
                                                    shape = RoundedCornerShape(6.dp),
                                                    color = Color(0xFFE0F2F1)
                                                ) {
                                                    Text(
                                                        text = "#${appt.trackingCode10Digit}",
                                                        fontWeight = FontWeight.Bold,
                                                        fontSize = 10.sp,
                                                        color = Color(0xFF0284C7),
                                                        modifier = Modifier.padding(horizontal = 6.dp, vertical = 3.dp)
                                                    )
                                                }
                                                IconButton(
                                                    onClick = { apptToRemoveConfirm = appt },
                                                    modifier = Modifier.size(24.dp)
                                                ) {
                                                    Icon(
                                                        Icons.Default.DeleteOutline,
                                                        contentDescription = "Remove Record",
                                                        tint = Color(0xFFDC2626),
                                                        modifier = Modifier.size(16.dp)
                                                    )
                                                }
                                            }
                                        }

                                        Row(
                                            modifier = Modifier.fillMaxWidth(),
                                            horizontalArrangement = Arrangement.SpaceBetween
                                        ) {
                                            Text(
                                                "Total: Rs. ${totalBill.toInt()}",
                                                fontWeight = FontWeight.Bold,
                                                fontSize = 12.sp,
                                                color = Color(0xFF0F172A)
                                            )
                                            Text(
                                                "Paid: Rs. ${paidAmt.toInt()}",
                                                fontWeight = FontWeight.Bold,
                                                fontSize = 12.sp,
                                                color = Color(0xFF15803D)
                                            )
                                            Text(
                                                "Left: Rs. ${leftAmt.toInt()}",
                                                fontWeight = FontWeight.ExtraBold,
                                                fontSize = 12.sp,
                                                color = if (leftAmt > 0.0) Color(0xFFDC2626) else Color(0xFF15803D)
                                            )
                                        }

                                        Row(
                                            modifier = Modifier.fillMaxWidth(),
                                            horizontalArrangement = Arrangement.spacedBy(6.dp)
                                        ) {
                                            OutlinedButton(
                                                onClick = { viewingRecordDetails = appt },
                                                shape = RoundedCornerShape(8.dp),
                                                border = BorderStroke(1.dp, Color(0xFF0284C7)),
                                                colors = ButtonDefaults.outlinedButtonColors(contentColor = Color(0xFF0284C7)),
                                                contentPadding = PaddingValues(horizontal = 8.dp, vertical = 6.dp),
                                                modifier = Modifier.weight(1.05f).height(36.dp)
                                            ) {
                                                Icon(Icons.Default.Info, contentDescription = null, modifier = Modifier.size(13.dp))
                                                Spacer(Modifier.width(3.dp))
                                                Text("Full Details", fontSize = 10.5.sp, fontWeight = FontWeight.Bold)
                                            }

                                            val apptLabReports = profileLabReportMap[appt.id] ?: emptyList()
                                            val isLabRecord = DiagnosticLabPolicy.isDiagnosticLabAppointment(
                                                appointment = appt,
                                                clinic = profileClinicMap[appt.clinicId],
                                                labReports = apptLabReports
                                            )
                                            val canRescheduleLabRecord = isLabRecord && DiagnosticLabPolicy.canRescheduleDiagnosticLab(
                                                appointment = appt,
                                                labReports = apptLabReports,
                                                requireNoShow = true
                                            )
                                            val isCompletedRecord = isLabRecord && DiagnosticLabPolicy.isLabReportReadyOrCompleted(
                                                appointment = appt,
                                                labReports = apptLabReports
                                            )

                                            if (isLabRecord) {
                                                if (isCompletedRecord) {
                                                    Button(
                                                        onClick = {
                                                            navController.navigate(NavRoutes.QueueStatus.createRoute(appt.trackingCode10Digit))
                                                        },
                                                        shape = RoundedCornerShape(8.dp),
                                                        colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF00796B)),
                                                        contentPadding = PaddingValues(horizontal = 8.dp, vertical = 6.dp),
                                                        modifier = Modifier.weight(1.05f).height(36.dp)
                                                    ) {
                                                        Icon(Icons.Default.Science, contentDescription = null, modifier = Modifier.size(13.dp))
                                                        Spacer(Modifier.width(3.dp))
                                                        Text("Lab Report", fontSize = 10.5.sp, fontWeight = FontWeight.Bold)
                                                    }
                                                } else if (canRescheduleLabRecord) {
                                                    Button(
                                                        onClick = { apptToRescheduleConfirm = appt },
                                                        shape = RoundedCornerShape(8.dp),
                                                        colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF0284C7)),
                                                        contentPadding = PaddingValues(horizontal = 8.dp, vertical = 6.dp),
                                                        modifier = Modifier.weight(1.05f).height(36.dp)
                                                    ) {
                                                        Icon(Icons.Default.CalendarMonth, contentDescription = null, modifier = Modifier.size(13.dp))
                                                        Spacer(Modifier.width(3.dp))
                                                        Text("Reschedule", fontSize = 10.5.sp, fontWeight = FontWeight.Bold)
                                                    }
                                                } else {
                                                    OutlinedButton(
                                                        onClick = {
                                                            navController.navigate(NavRoutes.QueueStatus.createRoute(appt.trackingCode10Digit))
                                                        },
                                                        shape = RoundedCornerShape(8.dp),
                                                        border = BorderStroke(1.dp, Color(0xFF0284C7)),
                                                        contentPadding = PaddingValues(horizontal = 8.dp, vertical = 6.dp),
                                                        modifier = Modifier.weight(1.05f).height(36.dp)
                                                    ) {
                                                        Icon(Icons.Default.Schedule, contentDescription = null, modifier = Modifier.size(13.dp))
                                                        Spacer(Modifier.width(3.dp))
                                                        Text("Sample Status", fontSize = 10.5.sp, fontWeight = FontWeight.Bold)
                                                    }
                                                }
                                            } else {
                                                Button(
                                                    onClick = { apptToRescheduleConfirm = appt },
                                                    shape = RoundedCornerShape(8.dp),
                                                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF0284C7)),
                                                    contentPadding = PaddingValues(horizontal = 8.dp, vertical = 6.dp),
                                                    modifier = Modifier.weight(1.05f).height(36.dp)
                                                ) {
                                                    Icon(Icons.Default.CalendarMonth, contentDescription = null, modifier = Modifier.size(13.dp))
                                                    Spacer(Modifier.width(3.dp))
                                                    Text("Reschedule", fontSize = 10.5.sp, fontWeight = FontWeight.Bold)
                                                }
                                            }

                                            FilledTonalButton(
                                                onClick = {
                                                    BillPdfDownloader.downloadBillPdf(
                                                        context = context,
                                                        appointment = appt,
                                                        invoice = inv,
                                                        clinicName = cName,
                                                        clinicAddress = cAddr,
                                                        doctorName = dName,
                                                        doctorSpecialty = dSpec,
                                                        clinicalRemarks = com.dactor.patient.util.PaymentLedgerHelper.extractCleanClinicalRemarks(inv?.remarks)
                                                    )
                                                },
                                                shape = RoundedCornerShape(8.dp),
                                                colors = ButtonDefaults.filledTonalButtonColors(containerColor = Color(0xFFE2E8F0), contentColor = Color(0xFF1E293B)),
                                                contentPadding = PaddingValues(horizontal = 6.dp, vertical = 6.dp),
                                                modifier = Modifier.weight(0.9f).height(36.dp)
                                            ) {
                                                Icon(Icons.Default.Download, contentDescription = null, modifier = Modifier.size(13.dp))
                                                Spacer(Modifier.width(2.dp))
                                                Text("Bill PDF", fontSize = 10.5.sp, fontWeight = FontWeight.Bold)
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }

            // ── 3. Saved 10-Digit Tracking Codes Card ───────────────────────────
            item {
                Card(
                    shape = RoundedCornerShape(22.dp),
                    colors = CardDefaults.cardColors(containerColor = Color.White),
                    elevation = CardDefaults.cardElevation(defaultElevation = 2.dp),
                    border = BorderStroke(1.dp, Color(0xFFE2E8F0)),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Column(
                        modifier = Modifier.padding(18.dp),
                        verticalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(10.dp)
                            ) {
                                Surface(
                                    shape = RoundedCornerShape(12.dp),
                                    color = Color(0xFFE0F7FA),
                                    modifier = Modifier.size(40.dp)
                                ) {
                                    Box(contentAlignment = Alignment.Center) {
                                        Icon(
                                            Icons.Default.QrCode2,
                                            contentDescription = null,
                                            tint = Color(0xFF0284C7),
                                            modifier = Modifier.size(22.dp)
                                        )
                                    }
                                }
                                Column {
                                    Text(
                                        "Saved 10-Digit Codes (${savedCodes.size})",
                                        fontWeight = FontWeight.Bold,
                                        fontSize = 14.sp,
                                        color = Color(0xFF0F172A)
                                    )
                                    Text(
                                        "Quick access to your past appointments",
                                        fontSize = 11.sp,
                                        color = Color(0xFF64748B)
                                    )
                                }
                            }

                            TextButton(
                                onClick = { showClaimDialog = true },
                                contentPadding = PaddingValues(horizontal = 4.dp, vertical = 2.dp)
                            ) {
                                Text(
                                    "+ Link",
                                    fontSize = 13.sp,
                                    fontWeight = FontWeight.Bold,
                                    color = Color(0xFF0284C7)
                                )
                            }
                        }

                        if (savedCodes.isEmpty()) {
                            Text(
                                "No saved appointment tracking codes yet.",
                                fontSize = 12.sp,
                                color = Color(0xFF94A3B8),
                                modifier = Modifier.padding(vertical = 4.dp)
                            )
                        } else {
                            savedCodes.forEach { (code, label) ->
                                Surface(
                                    color = Color(0xFFF0FDF4).copy(alpha = 0.5f),
                                    shape = RoundedCornerShape(14.dp),
                                    border = BorderStroke(1.dp, Color(0xFFCCFBF1)),
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .clickable {
                                            navController.navigate(NavRoutes.QueueStatus.createRoute(code))
                                        }
                                ) {
                                    Row(
                                        modifier = Modifier.padding(horizontal = 14.dp, vertical = 12.dp),
                                        horizontalArrangement = Arrangement.SpaceBetween,
                                        verticalAlignment = Alignment.CenterVertically
                                    ) {
                                        Column(
                                            modifier = Modifier
                                                .weight(1f)
                                                .clickable {
                                                    navController.navigate(NavRoutes.QueueStatus.createRoute(code))
                                                }
                                        ) {
                                            Text(
                                                text = code,
                                                fontWeight = FontWeight.ExtraBold,
                                                fontSize = 16.sp,
                                                color = Color(0xFF0284C7)
                                            )
                                            Spacer(Modifier.height(2.dp))
                                            Text(
                                                text = if (label.isNotBlank()) label else "Saved Appointment ID",
                                                fontSize = 11.sp,
                                                color = Color(0xFF64748B)
                                            )
                                        }

                                        Row(
                                            verticalAlignment = Alignment.CenterVertically,
                                            horizontalArrangement = Arrangement.spacedBy(4.dp)
                                        ) {
                                            IconButton(
                                                onClick = {
                                                    val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
                                                    clipboard.setPrimaryClip(ClipData.newPlainText("Code", code))
                                                    Toast.makeText(context, "Copied $code", Toast.LENGTH_SHORT).show()
                                                },
                                                modifier = Modifier.size(32.dp)
                                            ) {
                                                Icon(
                                                    Icons.Default.ContentCopy,
                                                    contentDescription = "Copy",
                                                    tint = Color(0xFF334155),
                                                    modifier = Modifier.size(18.dp)
                                                )
                                            }

                                            IconButton(
                                                onClick = {
                                                    sessionManager?.removeTrackingCode(code)
                                                    savedCodes = sessionManager?.getSavedTrackingCodes() ?: emptyList()
                                                },
                                                modifier = Modifier.size(32.dp)
                                            ) {
                                                Icon(
                                                    Icons.Default.DeleteOutline,
                                                    contentDescription = "Remove",
                                                    tint = Color(0xFF64748B),
                                                    modifier = Modifier.size(18.dp)
                                                )
                                            }

                                            IconButton(
                                                onClick = {
                                                    navController.navigate(NavRoutes.QueueStatus.createRoute(code))
                                                },
                                                modifier = Modifier.size(32.dp)
                                            ) {
                                                Icon(
                                                    Icons.Default.ChevronRight,
                                                    contentDescription = "Open Appointment",
                                                    tint = Color(0xFF0284C7),
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
            }

            // ── 4. Notifications & Broadcasts Card ──────────────────────────────
            item {
                Card(
                    shape = RoundedCornerShape(18.dp),
                    colors = CardDefaults.cardColors(containerColor = Color.White),
                    elevation = CardDefaults.cardElevation(defaultElevation = 2.dp),
                    border = BorderStroke(1.dp, Color(0xFFE2E8F0)),
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable { navController.navigate(NavRoutes.Notifications.route) }
                ) {
                    Row(
                        modifier = Modifier.padding(16.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(14.dp)
                    ) {
                        Surface(
                            shape = CircleShape,
                            color = Color(0xFFE0F7FA),
                            modifier = Modifier.size(46.dp)
                        ) {
                            Box(contentAlignment = Alignment.Center) {
                                Icon(
                                    Icons.Default.Notifications,
                                    contentDescription = null,
                                    tint = Color(0xFF0284C7),
                                    modifier = Modifier.size(22.dp)
                                )
                            }
                        }
                        Column(modifier = Modifier.weight(1f)) {
                            Text(
                                "Notifications & Broadcasts",
                                fontWeight = FontWeight.Bold,
                                fontSize = 14.sp,
                                color = Color(0xFF0F172A)
                            )
                            Spacer(Modifier.height(2.dp))
                            Text(
                                "Get updates about your appointments, health tips and more.",
                                fontSize = 11.sp,
                                color = Color(0xFF64748B)
                            )
                        }
                        Icon(
                            Icons.Default.ChevronRight,
                            contentDescription = null,
                            tint = Color(0xFF0284C7),
                            modifier = Modifier.size(20.dp)
                        )
                    }
                }
            }

            // ── 4b. Transaction History Card ────────────────────────────────────
            item {
                Card(
                    shape = RoundedCornerShape(18.dp),
                    colors = CardDefaults.cardColors(containerColor = Color.White),
                    elevation = CardDefaults.cardElevation(defaultElevation = 2.dp),
                    border = BorderStroke(1.dp, Color(0xFFE2E8F0)),
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable {
                            showTransactionHistoryDialog = true
                            loadTransactionHistory()
                        }
                ) {
                    Row(
                        modifier = Modifier.padding(16.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(14.dp)
                    ) {
                        Surface(
                            shape = CircleShape,
                            color = Color(0xFFE0F2F1),
                            modifier = Modifier.size(46.dp)
                        ) {
                            Box(contentAlignment = Alignment.Center) {
                                Icon(
                                    Icons.Default.ReceiptLong,
                                    contentDescription = null,
                                    tint = Color(0xFF0284C7),
                                    modifier = Modifier.size(24.dp)
                                )
                            }
                        }
                        Column(modifier = Modifier.weight(1f)) {
                            Text(
                                "Transaction History",
                                fontWeight = FontWeight.Bold,
                                fontSize = 14.sp,
                                color = Color(0xFF0F172A)
                            )
                            Spacer(Modifier.height(2.dp))
                            Text(
                                "View all payment amounts, times, and transaction IDs.",
                                fontSize = 11.sp,
                                color = Color(0xFF64748B)
                            )
                        }
                        Icon(
                            Icons.Default.ChevronRight,
                            contentDescription = null,
                            tint = Color(0xFF0284C7),
                            modifier = Modifier.size(20.dp)
                        )
                    }
                }
            }

            // ── 5. Terms & Conditions (Nepal Law) Card ──────────────────────────
            item {
                Card(
                    shape = RoundedCornerShape(18.dp),
                    colors = CardDefaults.cardColors(containerColor = Color.White),
                    elevation = CardDefaults.cardElevation(defaultElevation = 2.dp),
                    border = BorderStroke(1.dp, Color(0xFFE2E8F0)),
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable { showTermsDialog = true }
                ) {
                    Row(
                        modifier = Modifier.padding(16.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(14.dp)
                    ) {
                        Surface(
                            shape = CircleShape,
                            color = Color(0xFFE0F7FA),
                            modifier = Modifier.size(46.dp)
                        ) {
                            Box(contentAlignment = Alignment.Center) {
                                Icon(
                                    Icons.Default.Gavel,
                                    contentDescription = null,
                                    tint = Color(0xFF0284C7),
                                    modifier = Modifier.size(22.dp)
                                )
                            }
                        }
                        Column(modifier = Modifier.weight(1f)) {
                            Text(
                                "Terms & Conditions (Nepal Law)",
                                fontWeight = FontWeight.Bold,
                                fontSize = 14.sp,
                                color = Color(0xFF0F172A)
                            )
                            Spacer(Modifier.height(2.dp))
                            Text(
                                "Read our policies and user agreement.",
                                fontSize = 11.sp,
                                color = Color(0xFF64748B)
                            )
                        }
                        Icon(
                            Icons.Default.ChevronRight,
                            contentDescription = null,
                            tint = Color(0xFF0284C7),
                            modifier = Modifier.size(20.dp)
                        )
                    }
                }
            }

            // ── 6. Account Actions: Sign Out ────────────────────────────────────
            item {
                Column(
                    modifier = Modifier.padding(top = 4.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    OutlinedButton(
                        onClick = { showSignOutDialog = true },
                        shape = RoundedCornerShape(14.dp),
                        border = BorderStroke(1.dp, Color(0xFF0284C7)),
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(48.dp)
                    ) {
                        Icon(
                            Icons.AutoMirrored.Filled.ExitToApp,
                            contentDescription = null,
                            tint = Color(0xFF0284C7),
                            modifier = Modifier.size(18.dp)
                        )
                        Spacer(Modifier.width(8.dp))
                        Text(
                            "Sign Out / Switch Account",
                            fontWeight = FontWeight.Bold,
                            fontSize = 14.sp,
                            color = Color(0xFF0284C7)
                        )
                    }

                    TextButton(
                        onClick = { showDeleteAccountDialog = true },
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Text(
                            "Delete or Archive Account (30-day grace)",
                            color = MaterialTheme.colorScheme.error,
                            fontSize = 11.sp
                        )
                    }
                }
            }
        }
    }



    // ── EDIT PROFILE DIALOG ───────────────────────────────────────────────
    if (showEditProfileDialog) {
        var profileValidationTriggered by remember { mutableStateOf(false) }
        val isEditNameValid = editName.trim().length >= 2 && editName.trim().any { it.isLetter() }
        val isEditNameError = (profileValidationTriggered || editName.isNotBlank()) && !isEditNameValid
        val editPhoneDigits = editPhone.filter { it.isDigit() }
        val isEditPhoneValid = editPhoneDigits.length == 10 && editPhoneDigits.startsWith("9")
        val isEditPhoneError = (profileValidationTriggered || editPhone.isNotBlank()) && !isEditPhoneValid
        val parsedEditAge = editAge.trim().toIntOrNull()
        val isEditAgeValid = parsedEditAge != null && parsedEditAge in 1..120
        val isEditAgeError = (profileValidationTriggered || editAge.isNotBlank()) && !isEditAgeValid
        val isEditGenderValid = editGender.isNotBlank()
        val isEditGenderError = profileValidationTriggered && !isEditGenderValid

        AlertDialog(
            onDismissRequest = { showEditProfileDialog = false },
            title = { Text("Edit Patient Profile", fontWeight = FontWeight.Bold) },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    OutlinedTextField(
                        value = editName,
                        onValueChange = { editName = it },
                        label = { Text("Full Name *") },
                        isError = isEditNameError,
                        supportingText = if (isEditNameError) {
                            { Text("Enter full name (at least 2 letters).", color = Color(0xFFDC2626), fontSize = 11.sp) }
                        } else null,
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )
                    OutlinedTextField(
                        value = editPhone,
                        onValueChange = { if (it.length <= 10 && it.all { c -> c.isDigit() }) editPhone = it },
                        label = { Text("Mobile (+977) *") },
                        placeholder = { Text("98XXXXXXXX") },
                        isError = isEditPhoneError,
                        supportingText = if (isEditPhoneError) {
                            { Text("Must be a 10-digit number starting with 9 (${editPhoneDigits.length}/10).", color = Color(0xFFDC2626), fontSize = 11.sp) }
                        } else null,
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone),
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )
                    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Text(
                            text = if (isEditGenderError) "Gender * (Required)" else "Gender *",
                            fontSize = 11.sp,
                            fontWeight = FontWeight.SemiBold,
                            color = if (isEditGenderError) Color(0xFFDC2626) else Color(0xFF64748B)
                        )
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            listOf("Male", "Female", "Other").forEach { g ->
                                FilterChip(
                                    selected = editGender == g,
                                    onClick = { editGender = g },
                                    label = { Text(g, fontSize = 11.sp) }
                                )
                            }
                        }
                    }
                    OutlinedTextField(
                        value = editAge,
                        onValueChange = { if (it.length <= 3 && it.all { c -> c.isDigit() }) editAge = it },
                        label = { Text("Age (years) *") },
                        placeholder = { Text("1\u2013120") },
                        isError = isEditAgeError,
                        supportingText = if (isEditAgeError) {
                            { Text("Enter a valid age between 1 and 120.", color = Color(0xFFDC2626), fontSize = 11.sp) }
                        } else null,
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )
                }
            },
            confirmButton = {
                Button(
                    onClick = {
                        profileValidationTriggered = true
                        if (!isEditNameValid || !isEditPhoneValid || !isEditGenderValid || !isEditAgeValid) {
                            return@Button
                        }
                        sessionManager?.updateProfileInfo(editName.trim(), editPhoneDigits, editGender, parsedEditAge)
                        userName = editName.trim()
                        userPhone = editPhoneDigits
                        userGender = editGender
                        userAge = parsedEditAge
                        showEditProfileDialog = false
                    }
                ) {
                    Text("Save Changes")
                }
            },
            dismissButton = {
                TextButton(onClick = { showEditProfileDialog = false }) {
                    Text("Cancel")
                }
            }
        )
    }

    // ── CLAIM / RESTORE RECORD DIALOG ─────────────────────────────────────
    if (showClaimDialog) {
        AlertDialog(
            onDismissRequest = { showClaimDialog = false },
            title = { Text("Link / Restore Record", fontWeight = FontWeight.Bold) },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(
                        "Enter your 10-digit tracking code or Appointment ID to link or restore this consultation to your profile.",
                        fontSize = 12.sp,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    OutlinedTextField(
                        value = claimCodeInput,
                        onValueChange = { if (it.length <= 50) claimCodeInput = it },
                        label = { Text("Tracking Code or Appointment ID") },
                        placeholder = { Text("e.g. 8492018471 or UUID") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )
                    if (claimMessage != null) {
                        Text(claimMessage!!, fontSize = 11.sp, color = MaterialTheme.colorScheme.primary)
                    }
                }
            },
            confirmButton = {
                Button(
                    onClick = {
                        val input = claimCodeInput.trim()
                        if (input.isNotEmpty()) {
                            coroutineScope.launch {
                                val appt = appointmentRepository?.getAppointmentByTrackingCode(input)
                                    ?: appointmentRepository?.getAppointmentById(input)
                                if (appt != null) {
                                    sessionManager?.unhideRecord(appt.trackingCode10Digit)
                                    sessionManager?.unhideRecord(appt.id)
                                    sessionManager?.unhideRecord(input)
                                    sessionManager?.saveTrackingCode(appt.trackingCode10Digit, "${appt.patientName} \u2022 ${appt.appointmentDate}", explicitUnhide = true)
                                    val pid = sessionManager?.getSavedPatientId()
                                    if (!pid.isNullOrBlank()) {
                                        appointmentRepository?.claimAppointment(appt.id, pid)
                                    }
                                    claimMessage = "✓ Record #${appt.trackingCode10Digit} linked & restored successfully!"
                                    loadProfileBillsAndHistory()
                                    delay(600)
                                    showClaimDialog = false
                                } else {
                                    claimMessage = "No appointment found for this tracking code or ID."
                                }
                            }
                        }
                    },
                    enabled = claimCodeInput.trim().isNotEmpty()
                ) {
                    Text("Link / Restore")
                }
            },
            dismissButton = {
                TextButton(onClick = { showClaimDialog = false }) {
                    Text("Cancel")
                }
            }
        )
    }

    // ── TERMS & CONDITIONS DIALOG ─────────────────────────────────────────
    if (showTermsDialog) {
        TermsAndConditionsDialog(onDismiss = { showTermsDialog = false })
    }

    // ── SIGN OUT CONFIRMATION DIALOG ──────────────────────────────────────
    if (showSignOutDialog) {
        AlertDialog(
            onDismissRequest = { showSignOutDialog = false },
            title = { Text("Sign Out of Dactor?", fontWeight = FontWeight.Bold) },
            text = { Text("You can sign back in anytime with your Google account. Your saved 10-digit codes will remain on this device.", fontSize = 13.sp) },
            confirmButton = {
                Button(
                    onClick = {
                        showSignOutDialog = false
                        coroutineScope.launch {
                            authRepository?.signOut()
                            sessionManager?.clearSession()
                            sessionManager?.setGuestMode(true)
                            navController.navigate(NavRoutes.PatientMain.route) {
                                popUpTo(0) { inclusive = true }
                            }
                        }
                    }
                ) {
                    Text("Sign Out")
                }
            },
            dismissButton = {
                TextButton(onClick = { showSignOutDialog = false }) {
                    Text("Cancel")
                }
            }
        )
    }

    // ── DELETE / ARCHIVE ACCOUNT DIALOG ───────────────────────────────────
    if (showDeleteAccountDialog) {
        AlertDialog(
            onDismissRequest = { showDeleteAccountDialog = false },
            title = { Text("Delete / Archive Account", fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.error) },
            text = {
                Text(
                    "Your account will enter a 30-day grace period. During these 30 days, you can restore your account by simply signing back in. After 30 days, your data will be permanently deleted.",
                    fontSize = 12.sp
                )
            },
            confirmButton = {
                Button(
                    onClick = {
                        showDeleteAccountDialog = false
                        coroutineScope.launch {
                            val pid = sessionManager?.getSavedPatientId() ?: ""
                            val scheduledDate = authRepository?.scheduleAccountDeletion(pid)?.getOrNull()
                                ?: LocalDate.now().plusDays(30).toString()
                            try {
                                val fbUser = com.google.firebase.auth.FirebaseAuth.getInstance().currentUser
                                if (fbUser != null) {
                                    com.google.android.gms.tasks.Tasks.await(
                                        fbUser.delete(),
                                        3,
                                        java.util.concurrent.TimeUnit.SECONDS
                                    )
                                }
                            } catch (e: Exception) {
                                e.printStackTrace()
                            }
                            try {
                                com.google.android.gms.auth.api.signin.GoogleSignIn.getClient(
                                    context,
                                    com.google.android.gms.auth.api.signin.GoogleSignInOptions.DEFAULT_SIGN_IN
                                ).signOut()
                                com.google.firebase.auth.FirebaseAuth.getInstance().signOut()
                            } catch (ignored: Exception) {}
                            authRepository?.signOut()
                            sessionManager?.clearSession()
                            sessionManager?.setArchivedStatus(true, scheduledDate)
                            navController.navigate(NavRoutes.PatientMain.route) {
                                popUpTo(0) { inclusive = true }
                            }
                        }
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.error)
                ) {
                    Text("Proceed to Archive")
                }
            },
            dismissButton = {
                TextButton(onClick = { showDeleteAccountDialog = false }) {
                    Text("Cancel")
                }
            }
        )
    }

    // ── TRANSACTION HISTORY DIALOG ────────────────────────────────────────
    if (showTransactionHistoryDialog) {
        com.dactor.patient.ui.profile.PatientTransactionHistoryDialog(
            transactions = transactionHistoryList,
            isLoading = isLoadingTransactions,
            onRefresh = { loadTransactionHistory() },
            onDismiss = { showTransactionHistoryDialog = false }
        )
    }

    // ── COMPREHENSIVE RECORD & VISIT HISTORY DETAILS MODAL ─────────────
    viewingRecordDetails?.let { targetAppt ->
        PatientRecordDetailDialog(
            targetAppt = targetAppt,
            clinicMap = profileClinicMap,
            doctorMap = profileDoctorMap,
            invoiceMap = profileInvoiceMap,
            remarksMap = profileRemarksMap,
            labReportMap = profileLabReportMap,
            associatedVisits = associatedVisitsForDetail,
            isLoadingVisits = isLoadingVisitsForDetail,
            onDismiss = { viewingRecordDetails = null },
            onSelectVisit = { selectedVisit ->
                viewingRecordDetails = selectedVisit
            },
            onReschedule = { appt ->
                apptToRescheduleConfirm = appt
            },
            onRemove = { appt ->
                apptToRemoveConfirm = appt
            },
            onViewReport = { report ->
                verifyingReport = report
                enteredPatientName = ""
                verificationError = null
            }
        )
    }

    // ── CONFIRMATION DIALOG: REMOVE RECORD ──
    apptToRemoveConfirm?.let { targetAppt ->
        RemoveRecordConfirmDialog(
            targetAppt = targetAppt,
            onDismiss = { apptToRemoveConfirm = null },
            onConfirmRemove = { appt ->
                val code = appt.trackingCode10Digit
                if (code.isNotBlank()) {
                    sessionManager?.removeTrackingCode(code)
                    sessionManager?.hideRecord(code)
                }
                sessionManager?.hideRecord(appt.id)
                Toast.makeText(context, "Record #${code.ifBlank { appt.id.take(8) }} removed from active records", Toast.LENGTH_SHORT).show()
                if (viewingRecordDetails?.id == appt.id) {
                    viewingRecordDetails = null
                }
                apptToRemoveConfirm = null
                coroutineScope.launch { loadProfileBillsAndHistory() }
            }
        )
    }

    // ── CONFIRMATION DIALOG: RESCHEDULE CONSULTATION ──
    apptToRescheduleConfirm?.let { targetAppt ->
        RescheduleConfirmDialog(
            targetAppt = targetAppt,
            clinicMap = profileClinicMap,
            doctorMap = profileDoctorMap,
            labReports = profileLabReportMap[targetAppt.id] ?: emptyList(),
            onDismiss = { apptToRescheduleConfirm = null },
            onConfirmReschedule = { appt ->
                apptToRescheduleConfirm = null
                viewingRecordDetails = null
                sessionManager?.savePendingReschedule(
                    com.dactor.patient.data.local.UserSessionManager.PendingRescheduleData(
                        appointmentId = appt.id,
                        trackingCode = appt.trackingCode10Digit,
                        clinicId = appt.clinicId,
                        doctorId = appt.doctorId,
                        patientName = appt.patientName,
                        patientMobile = appt.patientMobile,
                        patientAge = appt.patientAge.toString(),
                        patientGender = appt.patientGender ?: "Male",
                        patientEmail = appt.patientEmail,
                        originalDate = appt.appointmentDate,
                        originalTime = appt.appointmentTime,
                        status = appt.status
                    )
                )
                navController.navigate(
                    NavRoutes.Booking.createRoute(
                        clinicId = appt.clinicId,
                        doctorId = appt.doctorId,
                        rescheduleApptId = appt.id
                    )
                )
            }
        )
    }

    // ── CONFIDENTIAL LAB SECURITY GATE ────────────────────────────────────
    verifyingReport?.let { targetReport ->
        AlertDialog(
            onDismissRequest = { verifyingReport = null },
            title = { Text("Confidential Lab Security Gate", fontWeight = FontWeight.Bold) },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(
                        "As per healthcare privacy regulations, enter the patient's full name matching the laboratory requisition to view this report.",
                        fontSize = 12.sp,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    OutlinedTextField(
                        value = enteredPatientName,
                        onValueChange = { enteredPatientName = it },
                        label = { Text("Patient Full Name") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )
                    if (verificationError != null) {
                        Text(verificationError!!, color = MaterialTheme.colorScheme.error, fontSize = 12.sp)
                    }
                }
            },
            confirmButton = {
                Button(
                    onClick = {
                        val expected = targetReport.patientNameVerification
                        val matches = labReportRepository?.verifyPatientName(expected, enteredPatientName) == true ||
                                      enteredPatientName.trim().equals(expected.trim(), ignoreCase = true)
                        if (matches) {
                            val repId = targetReport.id
                            verifyingReport = null
                            navController.navigate(NavRoutes.LabReport.createRoute(repId))
                        } else {
                            verificationError = "Name does not match the laboratory requisition record."
                        }
                    }
                ) {
                    Text("Unlock & View")
                }
            },
            dismissButton = {
                TextButton(onClick = { verifyingReport = null }) {
                    Text("Cancel")
                }
            }
        )
    }
}


