package com.dactor.patient.ui.discovery

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.navigation.NavController
import com.dactor.patient.data.model.Clinic
import com.dactor.patient.data.model.ClinicService
import com.dactor.patient.data.model.Doctor
import com.dactor.patient.data.model.MedicalSpecialty
import com.dactor.patient.data.repository.ClinicRepository
import com.dactor.patient.data.repository.DoctorRepository
import com.dactor.patient.domain.util.CurrencyFormatter
import com.dactor.patient.ui.navigation.NavRoutes
import com.dactor.patient.util.MedicalSearchEngine
import com.dactor.patient.util.OpenRouteSpatialEngine
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

data class ClinicDiscoveryItem(
    val clinic: Clinic,
    val services: List<ClinicService>,
    val doctors: List<Doctor>,
    val distanceText: String = "1.2 km away"
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DiscoveryScreen(
    navController: NavController,
    clinicRepository: ClinicRepository? = null,
    doctorRepository: DoctorRepository? = null
) {
    val coroutineScope = rememberCoroutineScope()
    var searchQuery by remember { mutableStateOf("") }
    var searchCategory by remember { mutableStateOf("all") } // "all", "clinic", "doctor", "service"

    val initialCachedClinics = remember { clinicRepository?.getCachedClinics() ?: emptyList() }
    val initialCachedDoctors = remember { doctorRepository?.getCachedAllDoctors() ?: emptyList() }

    var masterSpecialties by remember {
        mutableStateOf(clinicRepository?.getCachedSpecialties() ?: emptyList())
    }
    var discoveryList by remember {
        mutableStateOf(
            initialCachedClinics.map { clinic ->
                val srv = clinicRepository?.getCachedServices(clinic.id) ?: emptyList()
                val docs = doctorRepository?.getCachedDoctorsForClinic(clinic.id) ?: emptyList()
                OpenRouteSpatialEngine.indexClinic(clinic, docs, srv)
                ClinicDiscoveryItem(
                    clinic = clinic,
                    services = srv,
                    doctors = docs,
                    distanceText = clinic.addressText ?: "Nepal"
                )
            }
        )
    }
    var allDoctorsList by remember {
        mutableStateOf(
            initialCachedDoctors.also { list -> list.forEach { OpenRouteSpatialEngine.indexDoctor(it, emptyList()) } }
        )
    }
    var isLoading by remember { mutableStateOf(initialCachedClinics.isEmpty()) }

    // Dialog state for "Select Practicing Clinic" when a doctor is clicked
    var selectedDoctorForClinicModal by remember { mutableStateOf<Doctor?>(null) }
    var doctorPracticingClinics by remember { mutableStateOf<List<Clinic>>(emptyList()) }
    var isLoadingDoctorClinics by remember { mutableStateOf(false) }

    LaunchedEffect(Unit) {
        try {
            withContext(Dispatchers.IO) {
                coroutineScope {
                    val locsDef = async { clinicRepository?.getServiceLocations(forceRefresh = true) ?: emptyList() }
                    val specsDef = async { clinicRepository?.getSpecialties() ?: emptyList() }
                    val clinicsDef = async { clinicRepository?.getClinics(forceRefresh = true) ?: emptyList() }
                    val servicesByClinicDef = async { clinicRepository?.getAllClinicServicesGrouped(forceRefresh = true) ?: emptyMap() }

                    val remoteClinics = clinicsDef.await()
                    val clinicIds = remoteClinics.map { it.id }
                    val doctorsBatchDef = async {
                        doctorRepository?.getAllDoctorsAndClinicRoster(clinicIds, forceRefresh = true)
                            ?: Pair(emptyList(), emptyMap())
                    }

                    val remoteLocs = locsDef.await()
                    val specs = specsDef.await()
                    val servicesByClinic = servicesByClinicDef.await()
                    val (allDocs, rosterByClinic) = doctorsBatchDef.await()

                    val remoteItems = remoteClinics.map { clinic ->
                        val services = servicesByClinic[clinic.id] ?: emptyList()
                        val doctors = rosterByClinic[clinic.id] ?: emptyList()
                        OpenRouteSpatialEngine.indexClinic(clinic, doctors, services)
                        ClinicDiscoveryItem(
                            clinic = clinic,
                            services = services,
                            doctors = doctors,
                            distanceText = clinic.addressText ?: "Nepal"
                        )
                    }
                    val uniqueDocs = (allDocs + remoteItems.flatMap { it.doctors }).distinctBy { it.id }
                    uniqueDocs.forEach { OpenRouteSpatialEngine.indexDoctor(it, emptyList()) }

                    withContext(Dispatchers.Main) {
                        if (remoteLocs.isNotEmpty()) {
                            com.dactor.patient.ui.main.syncLocationsFromAdmin(remoteLocs)
                        }
                        masterSpecialties = specs
                        discoveryList = remoteItems
                        allDoctorsList = uniqueDocs
                    }
                }
            }
        } catch (e: Exception) {
            e.printStackTrace()
        } finally {
            isLoading = false
        }
    }

    // Dynamic symptom / condition keyword matching
    val cleanQuery = searchQuery.trim().lowercase()
    val matchedSpecialties = remember(cleanQuery, masterSpecialties) {
        if (cleanQuery.isBlank()) emptyList()
        else {
            masterSpecialties.filter { spec ->
                spec.name.lowercase().contains(cleanQuery) ||
                spec.category?.lowercase()?.contains(cleanQuery) == true ||
                spec.searchKeywords.split(",").any { kw ->
                    val trimmed = kw.trim().lowercase()
                    trimmed.isNotBlank() && (cleanQuery.contains(trimmed) || trimmed.contains(cleanQuery))
                }
            }
        }
    }
    val suggestedFromEngine = remember(cleanQuery) {
        MedicalSearchEngine.getSuggestedSpecialties(cleanQuery)
    }
    val combinedSuggestedSpecialties = remember(matchedSpecialties, suggestedFromEngine) {
        (suggestedFromEngine + matchedSpecialties.map { it.name }).distinct()
    }
    val matchedSpecialtyNames = remember(combinedSuggestedSpecialties) {
        combinedSuggestedSpecialties.map { it.lowercase() }.toSet()
    }

    // Semantic medical stems
    val expandedStems = remember(cleanQuery) {
        MedicalSearchEngine.expandQuery(cleanQuery)
    }

    val context = androidx.compose.ui.platform.LocalContext.current
    var selectedCity by remember { mutableStateOf("All Nepal") }
    var detectedCityName by remember { mutableStateOf("") }
    var userLatitude by remember { mutableStateOf<Double?>(null) }
    var userLongitude by remember { mutableStateOf<Double?>(null) }
    var isLiveGpsActive by remember { mutableStateOf(false) }
    val orsRouteCacheVersion by OpenRouteSpatialEngine.routeCacheVersion.collectAsState()

    // Phase 2 OpenRouteService Matrix async enrichment when GPS is active
    LaunchedEffect(isLiveGpsActive, userLatitude, userLongitude, discoveryList.size) {
        val uLat = userLatitude
        val uLng = userLongitude
        if (isLiveGpsActive && uLat != null && uLng != null && discoveryList.isNotEmpty()) {
            OpenRouteSpatialEngine.enrichWithOpenRouteServiceMatrix(
                userLat = uLat,
                userLng = uLng,
                clinics = discoveryList.map { it.clinic }
            )
        }
    }

    val locationPermissionLauncher = androidx.activity.compose.rememberLauncherForActivityResult(
        contract = androidx.activity.result.contract.ActivityResultContracts.RequestMultiplePermissions()
    ) { perms ->
        val granted = perms[android.Manifest.permission.ACCESS_FINE_LOCATION] == true ||
                      perms[android.Manifest.permission.ACCESS_COARSE_LOCATION] == true
        if (granted) {
            com.dactor.patient.ui.main.fetchCurrentLocation(context) { lat, lng, label, city ->
                userLatitude = lat
                userLongitude = lng
                selectedCity = label
                detectedCityName = city
                isLiveGpsActive = true
                android.widget.Toast.makeText(context, "Matched Live Location: $city", android.widget.Toast.LENGTH_SHORT).show()
            }
        }
    }

    // Filtered Clinics (using OpenRouteSpatialEngine bounding box, ORS matrix cache, and pre-indexed corpus)
    val filteredClinics = remember(cleanQuery, searchCategory, discoveryList, matchedSpecialtyNames, expandedStems, selectedCity, isLiveGpsActive, userLatitude, userLongitude, detectedCityName, orsRouteCacheVersion) {
        val locationFiltered = discoveryList.mapNotNull { item ->
            if (isLiveGpsActive && userLatitude != null && userLongitude != null) {
                val targetCity = if (detectedCityName.isNotBlank()) detectedCityName else selectedCity.replace(" (Live)", "").trim()
                val aliases = com.dactor.patient.ui.main.NEPAL_DISTRICT_ALIASES[targetCity] ?: listOf(targetCity.lowercase(java.util.Locale.ROOT))
                val addr = (item.clinic.addressText ?: "").lowercase(java.util.Locale.ROOT)
                val name = item.clinic.name.lowercase(java.util.Locale.ROOT)
                val matchesAlias = aliases.any { a -> addr.contains(a) || name.contains(a) }

                val distKm = OpenRouteSpatialEngine.getEffectiveDistanceKm(userLatitude, userLongitude, item.clinic)
                val matchesProximity = distKm != null && distKm <= 35.0
                if (matchesAlias || matchesProximity) {
                    val badge = OpenRouteSpatialEngine.formatDistanceBadge(userLatitude, userLongitude, item.clinic)
                    if (badge != null) item.copy(distanceText = "$badge • ${item.clinic.addressText ?: "Nepal"}") else item
                } else null
            } else if (selectedCity != "All Nepal") {
                val aliases = com.dactor.patient.ui.main.NEPAL_DISTRICT_ALIASES[selectedCity] ?: listOf(selectedCity.lowercase(java.util.Locale.ROOT))
                val addr = (item.clinic.addressText ?: "").lowercase(java.util.Locale.ROOT)
                val name = item.clinic.name.lowercase(java.util.Locale.ROOT)
                if (aliases.any { a -> addr.contains(a) || name.contains(a) }) item else null
            } else {
                item
            }
        }

        locationFiltered.filter { item ->
            if (cleanQuery.isBlank()) return@filter true

            // Fast O(1) pre-indexed corpus check when searching "all"
            val corpus = OpenRouteSpatialEngine.getClinicCorpus(item.clinic, item.doctors, item.services)
            val corpusQuickHit = corpus.contains(cleanQuery) ||
                matchedSpecialtyNames.any { corpus.contains(it) } ||
                expandedStems.any { corpus.contains(it) }

            if (!corpusQuickHit) return@filter false
            if (searchCategory == "all") return@filter true

            val matchesNameOrAddr = item.clinic.name.lowercase().contains(cleanQuery) ||
                    (item.clinic.addressText ?: "").lowercase().contains(cleanQuery)
            val matchesSpecialty = item.clinic.specialties.any { cs ->
                val csl = cs.lowercase()
                csl.contains(cleanQuery) ||
                matchedSpecialtyNames.any { ms -> csl.contains(ms) || ms.contains(csl) } ||
                expandedStems.any { stem -> csl.contains(stem) }
            }
            val matchesService = item.services.any { srv ->
                val srvl = srv.serviceName.lowercase()
                srvl.contains(cleanQuery) || expandedStems.any { stem -> srvl.contains(stem) }
            }
            val matchesDoctor = item.doctors.any { doc ->
                val docCorpus = OpenRouteSpatialEngine.getDoctorCorpus(doc, emptyList())
                docCorpus.contains(cleanQuery) ||
                matchedSpecialtyNames.any { ms -> docCorpus.contains(ms) } ||
                expandedStems.any { stem -> docCorpus.contains(stem) }
            }

            when (searchCategory) {
                "service" -> matchesService
                "clinic" -> matchesNameOrAddr || matchesSpecialty
                "doctor" -> matchesDoctor
                else -> true
            }
        }
    }

    val matchingClinicDoctorIds = remember(filteredClinics) {
        filteredClinics.flatMap { it.doctors.map { d -> d.id } }.toSet()
    }

    // Filtered Doctors (using O(1) pre-indexed doctor corpus)
    val filteredDoctors = remember(cleanQuery, searchCategory, allDoctorsList, matchedSpecialtyNames, expandedStems, selectedCity, isLiveGpsActive, matchingClinicDoctorIds) {
        val baseDoctors = if (selectedCity != "All Nepal" || isLiveGpsActive) {
            allDoctorsList.filter { matchingClinicDoctorIds.contains(it.id) }
        } else {
            allDoctorsList
        }

        baseDoctors.filter { doc ->
            if (cleanQuery.isBlank()) return@filter true

            val docCorpus = OpenRouteSpatialEngine.getDoctorCorpus(doc, emptyList())
            docCorpus.contains(cleanQuery) ||
                matchedSpecialtyNames.any { ms -> docCorpus.contains(ms) } ||
                expandedStems.any { stem -> docCorpus.contains(stem) }
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Find Clinics & Doctors", fontWeight = FontWeight.Bold) },
                navigationIcon = {
                    IconButton(onClick = { navController.popBackStack() }) {
                        Icon(Icons.Default.ArrowBack, contentDescription = "Back")
                    }
                },
                actions = {
                    IconButton(onClick = { navController.navigate(NavRoutes.Notifications.route) }) {
                        Icon(
                            Icons.Default.Notifications,
                            contentDescription = "Notifications",
                            tint = MaterialTheme.colorScheme.primary
                        )
                    }
                    IconButton(onClick = { navController.navigate(NavRoutes.Profile.route) }) {
                        Icon(Icons.Default.AccountCircle, contentDescription = "Profile & Settings")
                    }
                }
            )
        }
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(horizontal = 16.dp)
        ) {
            // Search Input Field
            OutlinedTextField(
                value = searchQuery,
                onValueChange = { searchQuery = it },
                label = { Text("Search by issue, doctor, or clinic") },
                placeholder = { Text("e.g. Eye, Teeth, Skin, Heart, MBBS, Dr. Name") },
                leadingIcon = { Icon(Icons.Default.Search, contentDescription = null) },
                trailingIcon = {
                    if (searchQuery.isNotEmpty()) {
                        IconButton(onClick = { searchQuery = "" }) {
                            Icon(Icons.Default.Close, contentDescription = "Clear")
                        }
                    }
                },
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(vertical = 8.dp),
                shape = RoundedCornerShape(14.dp),
                singleLine = true
            )

            // Dynamic Symptom / Condition Match Banner
            if (combinedSuggestedSpecialties.isNotEmpty()) {
                Surface(
                    shape = RoundedCornerShape(12.dp),
                    color = MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.5f),
                    border = androidx.compose.foundation.BorderStroke(1.dp, MaterialTheme.colorScheme.primary.copy(alpha = 0.3f)),
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(bottom = 8.dp)
                ) {
                    Row(
                        modifier = Modifier.padding(10.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Icon(
                            Icons.Default.HealthAndSafety,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.primary,
                            modifier = Modifier.size(20.dp)
                        )
                        Column {
                            Text(
                                "Suggested Specialist / Medical Department",
                                fontSize = 11.sp,
                                fontWeight = FontWeight.SemiBold,
                                color = MaterialTheme.colorScheme.primary
                            )
                            Text(
                                combinedSuggestedSpecialties.joinToString(", "),
                                fontSize = 13.sp,
                                fontWeight = FontWeight.Bold,
                                color = MaterialTheme.colorScheme.onPrimaryContainer
                            )
                        }
                    }
                }
            }

            // City / Live Location Selector Strip
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(bottom = 8.dp)
                    .horizontalScroll(rememberScrollState()),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                // Live GPS button
                FilterChip(
                    selected = isLiveGpsActive,
                    onClick = {
                        val hasFine = androidx.core.content.ContextCompat.checkSelfPermission(context, android.Manifest.permission.ACCESS_FINE_LOCATION) == android.content.pm.PackageManager.PERMISSION_GRANTED
                        val hasCoarse = androidx.core.content.ContextCompat.checkSelfPermission(context, android.Manifest.permission.ACCESS_COARSE_LOCATION) == android.content.pm.PackageManager.PERMISSION_GRANTED
                        if (hasFine || hasCoarse) {
                            com.dactor.patient.ui.main.fetchCurrentLocation(context) { lat, lng, label, city ->
                                userLatitude = lat
                                userLongitude = lng
                                selectedCity = label
                                detectedCityName = city
                                isLiveGpsActive = true
                            }
                        } else {
                            locationPermissionLauncher.launch(
                                arrayOf(
                                    android.Manifest.permission.ACCESS_FINE_LOCATION,
                                    android.Manifest.permission.ACCESS_COARSE_LOCATION
                                )
                            )
                        }
                    },
                    leadingIcon = {
                        Icon(
                            Icons.Default.MyLocation,
                            contentDescription = null,
                            modifier = Modifier.size(16.dp),
                            tint = if (isLiveGpsActive) MaterialTheme.colorScheme.primary else Color(0xFF64748B)
                        )
                    },
                    label = {
                        Text(
                            if (isLiveGpsActive && detectedCityName.isNotBlank()) "Near Me: $detectedCityName" else "Near Me (GPS)",
                            fontSize = 11.sp,
                            fontWeight = if (isLiveGpsActive) FontWeight.Bold else FontWeight.Normal
                        )
                    }
                )

                com.dactor.patient.ui.main.NEPAL_MAJOR_LOCATIONS.forEach { city ->
                    val isCitySelected = selectedCity == city && !isLiveGpsActive
                    FilterChip(
                        selected = isCitySelected,
                        onClick = {
                            selectedCity = city
                            isLiveGpsActive = false
                        },
                        label = {
                            Text(
                                city,
                                fontSize = 11.sp,
                                fontWeight = if (isCitySelected) FontWeight.Bold else FontWeight.Normal
                            )
                        }
                    )
                }
            }

            // Dimension Filter Pills
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(bottom = 12.dp)
                    .horizontalScroll(rememberScrollState()),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                FilterChip(
                    selected = searchCategory == "all",
                    onClick = { searchCategory = "all" },
                    label = { Text("All (${filteredClinics.size + filteredDoctors.size})", fontSize = 12.sp) }
                )
                FilterChip(
                    selected = searchCategory == "clinic",
                    onClick = { searchCategory = "clinic" },
                    label = { Text("Clinics (${filteredClinics.size})", fontSize = 12.sp) }
                )
                FilterChip(
                    selected = searchCategory == "doctor",
                    onClick = { searchCategory = "doctor" },
                    label = { Text("Doctors (${filteredDoctors.size})", fontSize = 12.sp) }
                )
                FilterChip(
                    selected = searchCategory == "service",
                    onClick = { searchCategory = "service" },
                    label = { Text("Services", fontSize = 12.sp) }
                )
            }

            // Results List
            LazyColumn(
                verticalArrangement = Arrangement.spacedBy(14.dp),
                modifier = Modifier.fillMaxSize()
            ) {
                if (isLoading) {
                    item {
                        Box(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(vertical = 36.dp, horizontal = 16.dp),
                            contentAlignment = Alignment.Center
                        ) {
                            Card(
                                shape = RoundedCornerShape(20.dp),
                                colors = CardDefaults.cardColors(containerColor = Color.White),
                                elevation = CardDefaults.cardElevation(defaultElevation = 3.dp),
                                modifier = Modifier.fillMaxWidth(0.9f)
                            ) {
                                Column(
                                    modifier = Modifier.padding(24.dp),
                                    horizontalAlignment = Alignment.CenterHorizontally,
                                    verticalArrangement = Arrangement.spacedBy(14.dp)
                                ) {
                                    Box(contentAlignment = Alignment.Center) {
                                        CircularProgressIndicator(
                                            modifier = Modifier.size(50.dp),
                                            strokeWidth = 3.5.dp,
                                            color = MaterialTheme.colorScheme.primary,
                                            trackColor = MaterialTheme.colorScheme.primary.copy(alpha = 0.15f)
                                        )
                                        Icon(
                                            Icons.Default.LocalHospital,
                                            contentDescription = null,
                                            tint = MaterialTheme.colorScheme.primary,
                                            modifier = Modifier.size(22.dp)
                                        )
                                    }
                                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                                        Text(
                                            "Searching Clinics & Doctors...",
                                            fontWeight = FontWeight.Bold,
                                            fontSize = 15.sp,
                                            color = MaterialTheme.colorScheme.onSurface
                                        )
                                        Spacer(Modifier.height(4.dp))
                                        Text(
                                            "Scanning medical specialties and practitioner directories",
                                            fontSize = 12.sp,
                                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                                            textAlign = androidx.compose.ui.text.style.TextAlign.Center
                                        )
                                    }
                                }
                            }
                        }
                    }
                } else if (filteredClinics.isEmpty() && filteredDoctors.isEmpty()) {
                    item {
                        Card(
                            shape = RoundedCornerShape(16.dp),
                            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f)),
                            modifier = Modifier.fillMaxWidth().padding(vertical = 24.dp)
                        ) {
                            Column(
                                modifier = Modifier.padding(24.dp).fillMaxWidth(),
                                horizontalAlignment = Alignment.CenterHorizontally,
                                verticalArrangement = Arrangement.spacedBy(8.dp)
                            ) {
                                Icon(Icons.Default.LocalHospital, contentDescription = null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(40.dp))
                                Text("No Matching Clinics or Doctors", fontWeight = FontWeight.Bold, fontSize = 15.sp)
                                Text(
                                    "Try searching for specific symptoms (e.g. eye, teeth, fever, skin) or general medical departments.",
                                    fontSize = 12.sp,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    textAlign = androidx.compose.ui.text.style.TextAlign.Center
                                )
                            }
                        }
                    }
                }

                // Section 1: Matching Doctors (Shown in "doctor" tab or "all" tab when searching)
                if (searchCategory == "doctor" || (searchCategory == "all" && filteredDoctors.isNotEmpty())) {
                    if (searchCategory == "all") {
                        item {
                            Text(
                                "👨‍⚕️ Matching Doctors (${filteredDoctors.size})",
                                fontWeight = FontWeight.Bold,
                                fontSize = 14.sp,
                                color = MaterialTheme.colorScheme.primary
                            )
                        }
                    }

                    items(filteredDoctors, key = { "doc_${it.id}" }) { doc ->
                        Card(
                            shape = RoundedCornerShape(16.dp),
                            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                            elevation = CardDefaults.cardElevation(defaultElevation = 2.dp),
                            modifier = Modifier
                                .fillMaxWidth()
                                .clickable {
                                    // Clicking a doctor triggers the clinic selection flow
                                    selectedDoctorForClinicModal = doc
                                    isLoadingDoctorClinics = true
                                    coroutineScope.launch {
                                        try {
                                            doctorPracticingClinics = doctorRepository?.getClinicsForDoctor(doc) ?: emptyList()
                                        } catch (e: Exception) {
                                            doctorPracticingClinics = emptyList()
                                        } finally {
                                            isLoadingDoctorClinics = false
                                        }
                                    }
                                }
                        ) {
                            Column(
                                modifier = Modifier.padding(14.dp),
                                verticalArrangement = Arrangement.spacedBy(8.dp)
                            ) {
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                    verticalAlignment = Alignment.Top
                                ) {
                                    Column(modifier = Modifier.weight(1f)) {
                                        Text(
                                            text = doc.fullName ?: "Doctor",
                                            fontWeight = FontWeight.Bold,
                                            fontSize = 15.sp,
                                            color = MaterialTheme.colorScheme.onSurface
                                        )
                                        if (!doc.education.isNullOrBlank()) {
                                            Text(
                                                text = "🎓 ${doc.education}",
                                                fontSize = 12.sp,
                                                fontWeight = FontWeight.SemiBold,
                                                color = MaterialTheme.colorScheme.primary
                                            )
                                        }
                                        Text(
                                            text = doc.specialty ?: "General Physician",
                                            fontSize = 12.sp,
                                            color = MaterialTheme.colorScheme.onSurfaceVariant
                                        )
                                    }

                                    Surface(
                                        shape = RoundedCornerShape(8.dp),
                                        color = MaterialTheme.colorScheme.secondaryContainer
                                    ) {
                                        Text(
                                            text = if (doc.isInClinic == true) "Available" else "Away",
                                            fontSize = 11.sp,
                                            fontWeight = FontWeight.Bold,
                                            color = if (doc.isInClinic == true) Color(0xFF047857) else Color(0xFFB91C1C),
                                            modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
                                        )
                                    }
                                }

                                // Doctor's multiple specialties if any
                                if (doc.specialties.isNotEmpty()) {
                                    Row(
                                        modifier = Modifier
                                            .fillMaxWidth()
                                            .horizontalScroll(rememberScrollState()),
                                        horizontalArrangement = Arrangement.spacedBy(4.dp)
                                    ) {
                                        doc.specialties.forEach { specName ->
                                            Surface(
                                                shape = RoundedCornerShape(6.dp),
                                                color = MaterialTheme.colorScheme.surfaceVariant
                                            ) {
                                                Text(
                                                    text = specName,
                                                    fontSize = 10.sp,
                                                    modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
                                                )
                                            }
                                        }
                                    }
                                }

                                Button(
                                    onClick = {
                                        selectedDoctorForClinicModal = doc
                                        isLoadingDoctorClinics = true
                                        coroutineScope.launch {
                                            try {
                                                doctorPracticingClinics = doctorRepository?.getClinicsForDoctor(doc) ?: emptyList()
                                            } catch (e: Exception) {
                                                doctorPracticingClinics = emptyList()
                                            } finally {
                                                isLoadingDoctorClinics = false
                                            }
                                        }
                                    },
                                    modifier = Modifier.fillMaxWidth().height(40.dp),
                                    shape = RoundedCornerShape(10.dp)
                                ) {
                                    Icon(Icons.Default.Apartment, contentDescription = null, modifier = Modifier.size(16.dp))
                                    Spacer(Modifier.width(6.dp))
                                    Text("Select Clinic to Consult Dr. ${doc.fullName.split(" ").lastOrNull() ?: ""}", fontSize = 12.sp, fontWeight = FontWeight.Bold)
                                }
                            }
                        }
                    }
                }

                // Section 2: Matching Clinics (Shown in "clinic", "service", or "all" tab)
                if (searchCategory == "clinic" || searchCategory == "service" || searchCategory == "all") {
                    if (searchCategory == "all" && filteredDoctors.isNotEmpty()) {
                        item {
                            Spacer(Modifier.height(8.dp))
                            Text(
                                "🏥 Matching Clinics (${filteredClinics.size})",
                                fontWeight = FontWeight.Bold,
                                fontSize = 14.sp,
                                color = MaterialTheme.colorScheme.primary
                            )
                        }
                    }

                    items(filteredClinics, key = { "clinic_${it.clinic.id}" }) { item ->
                        Card(
                            shape = RoundedCornerShape(18.dp),
                            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                            elevation = CardDefaults.cardElevation(defaultElevation = 2.dp),
                            modifier = Modifier
                                .fillMaxWidth()
                                .clickable {
                                    // Clicking a clinic navigates to detailed clinic profile
                                    navController.navigate(NavRoutes.ClinicDetail.createRoute(item.clinic.id))
                                }
                        ) {
                            Column(
                                modifier = Modifier.padding(16.dp),
                                verticalArrangement = Arrangement.spacedBy(10.dp)
                            ) {
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                    verticalAlignment = Alignment.Top
                                ) {
                                    Row(
                                        modifier = Modifier.weight(1f),
                                        verticalAlignment = Alignment.CenterVertically,
                                        horizontalArrangement = Arrangement.spacedBy(10.dp)
                                    ) {
                                        val cPic = item.clinic.resolvedLogoUrl ?: item.clinic.resolvedCoverPictureUrl
                                        Surface(
                                            shape = RoundedCornerShape(10.dp),
                                            color = MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.4f),
                                            modifier = Modifier.size(44.dp)
                                        ) {
                                            if (!cPic.isNullOrBlank()) {
                                                coil.compose.AsyncImage(
                                                    model = cPic,
                                                    contentDescription = item.clinic.name,
                                                    contentScale = androidx.compose.ui.layout.ContentScale.Crop,
                                                    modifier = Modifier.fillMaxSize()
                                                )
                                            } else {
                                                Box(contentAlignment = Alignment.Center) {
                                                    Icon(Icons.Default.LocalHospital, contentDescription = null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(22.dp))
                                                }
                                            }
                                        }
                                        Column {
                                            Text(
                                                text = item.clinic.name,
                                                fontWeight = FontWeight.Bold,
                                                fontSize = 16.sp,
                                                color = MaterialTheme.colorScheme.onSurface
                                            )
                                            Row(
                                                verticalAlignment = Alignment.CenterVertically,
                                                horizontalArrangement = Arrangement.spacedBy(4.dp),
                                                modifier = Modifier.padding(top = 2.dp)
                                            ) {
                                                Icon(Icons.Default.LocationOn, contentDescription = null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(14.dp))
                                                Text(
                                                    text = item.clinic.addressText ?: "Nepal",
                                                    fontSize = 12.sp,
                                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                                )
                                            }
                                        }
                                    }

                                    if (item.clinic.type == "diagnostic_lab") {
                                        SuggestionChip(
                                            onClick = { },
                                            label = {
                                                Text(
                                                    text = "Diagnostic Lab",
                                                    fontSize = 10.sp,
                                                    fontWeight = FontWeight.Bold
                                                )
                                            }
                                        )
                                    }
                                }

                                // Clinic Specialty Chips
                                if (item.clinic.specialties.isNotEmpty()) {
                                    Row(
                                        modifier = Modifier
                                            .fillMaxWidth()
                                            .horizontalScroll(rememberScrollState()),
                                        horizontalArrangement = Arrangement.spacedBy(6.dp)
                                    ) {
                                        item.clinic.specialties.forEach { specName ->
                                            Surface(
                                                shape = RoundedCornerShape(8.dp),
                                                color = MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.5f)
                                            ) {
                                                Text(
                                                    text = specName,
                                                    fontSize = 11.sp,
                                                    fontWeight = FontWeight.Medium,
                                                    color = MaterialTheme.colorScheme.onPrimaryContainer,
                                                    modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp)
                                                )
                                            }
                                        }
                                    }
                                }

                                // Doctors Available at this Clinic
                                val isLabFacility = item.clinic.type.equals("diagnostic_lab", ignoreCase = true) || (item.clinic.type ?: "").contains("lab", ignoreCase = true)
                                if (!isLabFacility && item.doctors.isNotEmpty()) {
                                    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                                        Text("Physicians at this Clinic:", fontSize = 11.sp, fontWeight = FontWeight.SemiBold, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                        item.doctors.forEach { doc ->
                                            val qual = if (!doc.education.isNullOrBlank()) " (${doc.education})" else ""
                                            Row(
                                                modifier = Modifier.fillMaxWidth(),
                                                horizontalArrangement = Arrangement.SpaceBetween,
                                                verticalAlignment = Alignment.CenterVertically
                                            ) {
                                                Text("• ${doc.fullName}$qual - ${doc.specialty ?: "General"}", fontSize = 12.sp, fontWeight = FontWeight.Medium)
                                                val isInClinic = doc.isInClinic == true
                                                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                                                    Box(
                                                        modifier = Modifier
                                                            .size(8.dp)
                                                            .background(
                                                                if (isInClinic) Color(0xFF10B981) else Color(0xFFEF4444),
                                                                RoundedCornerShape(4.dp)
                                                            )
                                                    )
                                                    Text(
                                                        text = if (isInClinic) "In Clinic" else "Away",
                                                        fontSize = 11.sp,
                                                        fontWeight = FontWeight.Bold,
                                                        color = if (isInClinic) Color(0xFF047857) else Color(0xFFDC2626)
                                                    )
                                                }
                                            }
                                        }
                                    }
                                }

                                val isLab = item.clinic.type.equals("diagnostic_lab", ignoreCase = true) || (item.clinic.type ?: "").contains("lab", ignoreCase = true)
                                val offeredTests = if (isLab && item.services.isEmpty()) {
                                    listOf(
                                        ClinicService(id = "def_cbc", clinicId = item.clinic.id, serviceName = "Complete Blood Count (CBC)", description = "Includes Hb, TLC, DLC, Platelets", price = 350.0),
                                        ClinicService(id = "def_lipid", clinicId = item.clinic.id, serviceName = "Lipid Profile", description = "Cholesterol Panel", price = 650.0),
                                        ClinicService(id = "def_thyroid", clinicId = item.clinic.id, serviceName = "Thyroid Profile (T3, T4, TSH)", description = "Full thyroid screening", price = 800.0),
                                        ClinicService(id = "def_urine", clinicId = item.clinic.id, serviceName = "Urine Routine", description = "Routine urinalysis", price = 200.0),
                                        ClinicService(id = "def_glucose", clinicId = item.clinic.id, serviceName = "Fasting Blood Sugar (FBS)", description = "Glucose test", price = 150.0)
                                    )
                                } else item.services

                                if (offeredTests.isNotEmpty()) {
                                    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                                        Text(
                                            text = if (isLab) "Available Diagnostic Lab Tests:" else "Services Offered:",
                                            fontSize = 11.sp,
                                            fontWeight = FontWeight.SemiBold,
                                            color = MaterialTheme.colorScheme.onSurfaceVariant
                                        )
                                        Row(
                                            modifier = Modifier
                                                .fillMaxWidth()
                                                .horizontalScroll(rememberScrollState()),
                                            horizontalArrangement = Arrangement.spacedBy(6.dp)
                                        ) {
                                            offeredTests.take(6).forEach { test ->
                                                Surface(
                                                    shape = RoundedCornerShape(8.dp),
                                                    color = if (isLab) Color(0xFFF0FDF4) else MaterialTheme.colorScheme.surfaceVariant,
                                                    border = if (isLab) androidx.compose.foundation.BorderStroke(1.dp, Color(0xFFBBF7D0)) else null
                                                ) {
                                                    Row(
                                                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
                                                        horizontalArrangement = Arrangement.spacedBy(4.dp),
                                                        verticalAlignment = Alignment.CenterVertically
                                                    ) {
                                                        Text(
                                                            text = test.serviceName,
                                                            fontSize = 11.sp,
                                                            fontWeight = FontWeight.Medium,
                                                            color = if (isLab) Color(0xFF166534) else MaterialTheme.colorScheme.onSurfaceVariant
                                                        )
                                                        Text(
                                                            text = "Rs. ${test.price.toInt()}",
                                                            fontSize = 10.sp,
                                                            fontWeight = FontWeight.Bold,
                                                            color = if (isLab) Color(0xFF15803D) else MaterialTheme.colorScheme.primary
                                                        )
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }

                                // Book Appointment Button (Clinic-First Flow: User selects doctor then slot)
                                Button(
                                    onClick = {
                                        navController.navigate(NavRoutes.Booking.createRoute(item.clinic.id))
                                    },
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .height(44.dp),
                                    shape = RoundedCornerShape(12.dp)
                                ) {
                                    Text(
                                        text = if (isLab) "Select Lab Tests & Book Slot" else "Select Doctor & Book Slot at Clinic",
                                        fontWeight = FontWeight.Bold,
                                        fontSize = 13.sp
                                    )
                                }
                            }
                        }
                    }
                }
            }
        }

        // Doctor-First Flow Modal: "Select Practicing Clinic for Dr. [Name]"
        if (selectedDoctorForClinicModal != null) {
            val doctor = selectedDoctorForClinicModal!!
            AlertDialog(
                onDismissRequest = { selectedDoctorForClinicModal = null },
                title = {
                    Column {
                        Text("Select Clinic for Consultation", fontWeight = FontWeight.Bold, fontSize = 16.sp)
                        Text(
                            "${doctor.fullName}${if (!doctor.education.isNullOrBlank()) " (${doctor.education})" else ""} • ${doctor.specialty}",
                            fontSize = 12.sp,
                            color = MaterialTheme.colorScheme.primary
                        )
                    }
                },
                text = {
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(vertical = 4.dp),
                        verticalArrangement = Arrangement.spacedBy(10.dp)
                    ) {
                        Text(
                            "Please choose the clinic location where you want to meet Dr. ${doctor.fullName.split(" ").lastOrNull() ?: ""}. Available slots will be displayed next.",
                            fontSize = 12.sp,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )

                        if (isLoadingDoctorClinics) {
                            Box(modifier = Modifier.fillMaxWidth().padding(16.dp), contentAlignment = Alignment.Center) {
                                CircularProgressIndicator()
                            }
                        } else {
                            val availableClinics = if (doctorPracticingClinics.isNotEmpty()) {
                                doctorPracticingClinics
                            } else {
                                // Fallback: all active clinics from discovery
                                discoveryList.map { it.clinic }.filter { it.isArchived != true }
                            }

                            if (availableClinics.isEmpty()) {
                                Text("No affiliated clinics found for this doctor currently.", fontSize = 12.sp, color = MaterialTheme.colorScheme.error)
                            } else {
                                availableClinics.forEach { clinic ->
                                    Card(
                                        shape = RoundedCornerShape(12.dp),
                                        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f)),
                                        modifier = Modifier
                                            .fillMaxWidth()
                                            .clickable {
                                                val docId = doctor.id
                                                selectedDoctorForClinicModal = null
                                                // Navigates to booking screen with both clinicId and doctorId!
                                                navController.navigate(NavRoutes.Booking.createRoute(clinic.id, docId))
                                            }
                                    ) {
                                        Row(
                                            modifier = Modifier.padding(12.dp).fillMaxWidth(),
                                            horizontalArrangement = Arrangement.SpaceBetween,
                                            verticalAlignment = Alignment.CenterVertically
                                        ) {
                                            Column(modifier = Modifier.weight(1f)) {
                                                Text(clinic.name, fontWeight = FontWeight.Bold, fontSize = 13.sp)
                                                Text(clinic.addressText ?: "Nepal", fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                            }
                                            Icon(Icons.Default.ArrowForward, contentDescription = "Select", tint = MaterialTheme.colorScheme.primary)
                                        }
                                    }
                                }
                            }
                        }
                    }
                },
                confirmButton = {},
                dismissButton = {
                    TextButton(onClick = { selectedDoctorForClinicModal = null }) {
                        Text("Cancel")
                    }
                }
            )
        }
    }
}
