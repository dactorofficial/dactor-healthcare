package com.dactor.patient.ui.search

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.widget.Toast
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.ArrowForward
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.navigation.NavController
import coil.compose.AsyncImage
import com.dactor.patient.data.model.Clinic
import com.dactor.patient.data.model.Doctor
import com.dactor.patient.data.model.Slot
import com.dactor.patient.data.repository.ClinicRepository
import com.dactor.patient.data.repository.DoctorRepository
import com.dactor.patient.data.repository.SlotRepository
import com.dactor.patient.domain.util.CurrencyFormatter
import com.dactor.patient.domain.util.DateTimePickers
import com.dactor.patient.ui.components.isInternetAvailable
import com.dactor.patient.ui.main.ClinicHomeItem
import com.dactor.patient.ui.main.DoctorHomeItem
import com.dactor.patient.ui.main.calculateDistanceKm
import com.dactor.patient.ui.navigation.NavRoutes
import com.dactor.patient.util.MedicalSearchEngine
import com.dactor.patient.util.OpenRouteSpatialEngine
import com.dactor.patient.util.SearchMatchResult
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.util.Locale

private const val RECENT_SEARCHES_PREFS = "patient_recent_searches"
private const val RECENT_SEARCHES_KEY = "recent_queries_v1"

private val EMPTY_STATE_SPECIALTY_CHIPS = listOf(
    "Dermatology (Skin)",
    "Cardiology (Heart)",
    "Pediatrics (Child)",
    "Orthopedic",
    "Eye (Ophthalmology)",
    "Dental Care",
    "General Physician",
    "MRI Scan",
    "CT Scan",
    "Digital X-Ray",
    "Ultrasound (USG)",
    "Blood Test (CBC)",
    "Pathology Lab",
    "ECG / EKG",
    "Gynecology",
    "ENT Specialist"
)

private val FILTER_SPECIALTY_OPTIONS = listOf(
    "Dermatology (Skin)",
    "Cardiology (Heart)",
    "Pediatrics (Child)",
    "Orthopedic",
    "Eye (Ophthalmology)",
    "Dental Care",
    "General Physician",
    "Gynecology",
    "ENT Specialist",
    "Neurology",
    "Psychiatry",
    "MRI Scan",
    "CT Scan",
    "Digital X-Ray",
    "Ultrasound (USG)",
    "Blood Test & CBC",
    "Pathology Lab",
    "ECG / Echo"
)

private fun loadRecentSearches(context: Context): List<String> {
    val prefs = context.getSharedPreferences(RECENT_SEARCHES_PREFS, Context.MODE_PRIVATE)
    val raw = prefs.getString(RECENT_SEARCHES_KEY, "") ?: ""
    return raw.split("\n").map { it.trim() }.filter { it.isNotBlank() }.take(5)
}

private fun saveRecentSearch(context: Context, query: String): List<String> {
    val trimmed = query.trim()
    if (trimmed.length < 2) return loadRecentSearches(context)
    val current = loadRecentSearches(context).toMutableList()
    current.removeAll { it.equals(trimmed, ignoreCase = true) }
    current.add(0, trimmed)
    val updated = current.take(5)
    context.getSharedPreferences(RECENT_SEARCHES_PREFS, Context.MODE_PRIVATE)
        .edit()
        .putString(RECENT_SEARCHES_KEY, updated.joinToString("\n"))
        .apply()
    return updated
}

private fun removeRecentSearch(context: Context, query: String): List<String> {
    val current = loadRecentSearches(context).filterNot { it.equals(query, ignoreCase = true) }
    context.getSharedPreferences(RECENT_SEARCHES_PREFS, Context.MODE_PRIVATE)
        .edit()
        .putString(RECENT_SEARCHES_KEY, current.joinToString("\n"))
        .apply()
    return current
}

private fun clearAllRecentSearches(context: Context): List<String> {
    context.getSharedPreferences(RECENT_SEARCHES_PREFS, Context.MODE_PRIVATE)
        .edit()
        .remove(RECENT_SEARCHES_KEY)
        .apply()
    return emptyList()
}

@OptIn(
    ExperimentalMaterial3Api::class,
    ExperimentalFoundationApi::class,
    ExperimentalLayoutApi::class
)
@Composable
fun PatientSearchScreen(
    navController: NavController,
    initialDate: String = "",
    initialQuery: String = "",
    clinicRepository: ClinicRepository? = null,
    doctorRepository: DoctorRepository? = null,
    slotRepository: SlotRepository? = null,
    sessionManager: com.dactor.patient.data.local.UserSessionManager? = null
) {
    val context = LocalContext.current
    val focusRequester = remember { FocusRequester() }
    val keyboardController = LocalSoftwareKeyboardController.current
    val focusManager = LocalFocusManager.current
    val coroutineScope = rememberCoroutineScope()

    val today = remember { LocalDate.now() }
    val todayStr = remember { today.toString() }

    // Preserve search state across navigation to Doctor/Clinic profile and back
    var searchInput by rememberSaveable { mutableStateOf(initialQuery) }
    var debouncedQuery by rememberSaveable { mutableStateOf(initialQuery) }
    var browseMode by rememberSaveable { mutableStateOf("") } // "", "all_doctors", "all_clinics"
    var seeAllGroup by rememberSaveable { mutableStateOf("") } // "", "doctors", "clinics", "specialties"

    // Filters & Sort on the results page
    var selectedSpecialtyFilter by rememberSaveable { mutableStateOf("") }
    var selectedAvailabilityFilter by rememberSaveable { mutableStateOf("any") } // "any", "today", "this_week", "custom_date"
    var chosenDateStr by rememberSaveable {
        mutableStateOf(initialDate.takeIf { it.isNotBlank() } ?: todayStr)
    }
    var selectedFeeFilter by rememberSaveable { mutableStateOf("") } // "", "under_500", "500_1000", "above_1000"
    var selectedDistanceFilter by rememberSaveable { mutableStateOf("") } // "", "5km", "10km", "25km"
    var selectedEntityTypeFilter by rememberSaveable { mutableStateOf("") } // "", "doctors", "clinics"
    var selectedSort by rememberSaveable { mutableStateOf("nearest") } // "nearest", "lowest_fee", "earliest_available"

    var showFilterSheet by remember { mutableStateOf(false) }
    var showSortMenu by remember { mutableStateOf(false) }

    var recentSearches by remember { mutableStateOf(loadRecentSearches(context)) }
    var hasautoFocused by rememberSaveable { mutableStateOf(false) }

    // Auto-focus search input and open keyboard on first open
    LaunchedEffect(Unit) {
        if (!hasautoFocused) {
            hasautoFocused = true
            delay(80L)
            try {
                focusRequester.requestFocus()
                keyboardController?.show()
            } catch (_: Exception) {}
        }
    }

    // Cached + remote data
    var allClinics by remember {
        val cachedClinics = clinicRepository?.getCachedClinics()
        val cachedRosterMap = doctorRepository?.getCachedDoctorsByClinicMap() ?: emptyMap()
        val cachedServicesMap = clinicRepository?.getCachedAllServicesByClinic() ?: emptyMap()
        val cachedSlotsMap = slotRepository?.getCachedSlotsForDate(chosenDateStr) ?: emptyMap()
        val items = if (!cachedClinics.isNullOrEmpty()) {
            cachedClinics.map { clinic ->
                val docs = cachedRosterMap[clinic.id] ?: emptyList()
                val srvs = cachedServicesMap[clinic.id] ?: emptyList()
                val slots = cachedSlotsMap[clinic.id] ?: emptyList()
                OpenRouteSpatialEngine.indexClinic(clinic, docs, srvs)
                ClinicHomeItem(clinic = clinic, doctors = docs, services = srvs, availableSlots = slots)
            }
        } else emptyList()
        mutableStateOf(items)
    }

    var allDoctors by remember {
        val cachedDocs = doctorRepository?.getCachedAllDoctors()
        val cachedClinics = clinicRepository?.getCachedClinics() ?: emptyList()
        val cachedRosterMap = doctorRepository?.getCachedDoctorsByClinicMap() ?: emptyMap()
        val docs = if (!cachedDocs.isNullOrEmpty()) {
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
        mutableStateOf(docs)
    }

    // Slots across upcoming 7 days for accurate "Next available: Thu 15 Oct" & "This week" availability
    var upcomingSlotsByDate by remember {
        mutableStateOf<Map<String, Map<String, List<Slot>>>>(emptyMap())
    }
    var clinicsNextAvailableDates by remember {
        mutableStateOf<Map<String, String>>(emptyMap())
    }

    var isSearchingSkeleton by remember { mutableStateOf(false) }
    var isOfflineError by remember { mutableStateOf(false) }
    var isTimeoutError by remember { mutableStateOf(false) }
    var retryTrigger by remember { mutableIntStateOf(0) }

    // Selected Doctor for Profile / Clinic Picker Dialog
    var selectedDoctorForClinicPicker by remember { mutableStateOf<Pair<DoctorHomeItem, String>?>(null) }
    var selectedDoctorForProfileView by remember { mutableStateOf<Pair<DoctorHomeItem, String>?>(null) }

    val resultsListState = rememberLazyListState()

    val hasActiveFilterOrBrowse = browseMode.isNotBlank() ||
        selectedSpecialtyFilter.isNotBlank() ||
        selectedAvailabilityFilter != "any" ||
        selectedFeeFilter.isNotBlank() ||
        selectedDistanceFilter.isNotBlank() ||
        selectedEntityTypeFilter.isNotBlank()

    // 3. While typing:
    // - Debounce input by 300 ms
    // - Start searching after 2 characters (or if browse/filter is active)
    // - Show skeleton loader while waiting
    // - Cancel previous request if a new one starts (LaunchedEffect automatically cancels previous coroutine)
    LaunchedEffect(searchInput, browseMode, selectedSpecialtyFilter, chosenDateStr, retryTrigger) {
        val trimmed = searchInput.trim()
        isTimeoutError = false

        if (trimmed.length < 2 && !hasActiveFilterOrBrowse) {
            debouncedQuery = ""
            isSearchingSkeleton = false
            isOfflineError = false
            return@LaunchedEffect
        }

        // Check internet connection
        if (!isInternetAvailable(context) && allClinics.isEmpty() && allDoctors.isEmpty()) {
            isOfflineError = true
            isSearchingSkeleton = false
            return@LaunchedEffect
        }
        isOfflineError = false

        // Show skeleton loader and debounce by 300ms
        isSearchingSkeleton = true
        delay(300L)
        debouncedQuery = trimmed

        if (trimmed.length >= 2) {
            recentSearches = saveRecentSearch(context, trimmed)
        }

        // Fetch fresh data with a 10-second timeout if needed
        if (clinicRepository != null && (allClinics.isEmpty() || allDoctors.isEmpty() || retryTrigger > 0)) {
            val loaded = withTimeoutOrNull(10_000L) {
                try {
                    withContext(Dispatchers.IO) {
                        coroutineScope {
                            val clinicsDef = async { clinicRepository.getClinics(forceRefresh = true) }
                            val servicesDef = async { clinicRepository.getAllClinicServicesGrouped(forceRefresh = true) }
                            val slotsDef = async { slotRepository?.getAllAvailableSlotsForDate(chosenDateStr) ?: emptyMap() }

                            val remoteClinics = clinicsDef.await()
                            val clinicIds = remoteClinics.map { it.id }
                            val (standaloneDocs, rosterByClinic) = doctorRepository?.getAllDoctorsAndClinicRoster(
                                clinicIds = clinicIds,
                                forceRefresh = true
                            ) ?: Pair(emptyList(), emptyMap())

                            val servicesByClinic = servicesDef.await()
                            val slotsByClinic = slotsDef.await()

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
                    }
                } catch (e: Exception) {
                    null
                }
            }

            if (loaded != null) {
                allClinics = loaded.first
                allDoctors = loaded.second
                isTimeoutError = false
            } else if (allClinics.isEmpty() && allDoctors.isEmpty()) {
                if (!isInternetAvailable(context)) {
                    isOfflineError = true
                } else {
                    isTimeoutError = true
                }
            }
        }

        // Hydrate upcoming 5 days of slots in background for accurate "Next available: Thu 15 Oct"
        if (slotRepository != null && upcomingSlotsByDate.isEmpty()) {
            coroutineScope.launch(Dispatchers.IO) {
                try {
                    val map = mutableMapOf<String, Map<String, List<Slot>>>()
                    for (offset in 0..5) {
                        val dStr = today.plusDays(offset.toLong()).toString()
                        val slotsForD = slotRepository.getCachedSlotsForDate(dStr)
                            ?: slotRepository.getAllAvailableSlotsForDate(dStr)
                        map[dStr] = slotsForD
                    }
                    upcomingSlotsByDate = map
                    if (clinicsNextAvailableDates.isEmpty()) {
                        clinicsNextAvailableDates = slotRepository.getAllClinicsNextAvailableDates()
                    }
                } catch (_: Exception) {}
            }
        }

        isSearchingSkeleton = false
    }

    // Refresh slots when chosenDateStr changes
    LaunchedEffect(chosenDateStr) {
        if (slotRepository != null && allClinics.isNotEmpty()) {
            try {
                val freshSlots = withContext(Dispatchers.IO) {
                    slotRepository.getAllAvailableSlotsForDate(chosenDateStr, forceRefresh = true)
                }
                allClinics = allClinics.map { item ->
                    item.copy(availableSlots = freshSlots[item.clinic.id] ?: emptyList())
                }
            } catch (_: Exception) {}
        }
    }

    // Helper to check if a doctor is available on a given date and compute Next Available date
    fun getDoctorAvailabilityInfo(docItem: DoctorHomeItem): Pair<Boolean, LocalDate> {
        val doc = docItem.doctor
        val targetDate = try { LocalDate.parse(chosenDateStr) } catch (_: Exception) { today }
        val targetDateStr = targetDate.toString()

        // Check if available on targetDate
        val availableOnTarget = docItem.practicingClinics.any { c ->
            val slotsForClinic = allClinics.firstOrNull { it.clinic.id == c.id }?.availableSlots
                ?: upcomingSlotsByDate[targetDateStr]?.get(c.id)
                ?: emptyList()
            slotsForClinic.any { s ->
                s.isPublished &&
                    (s.doctorId == doc.id || s.doctorId.isNullOrBlank()) &&
                    (s.maxCapacity - s.bookedCount) > 0 &&
                    !SlotRepository.isSlotEndTimeOver(s.endTime, targetDateStr, s.startTime)
            }
        }

        if (availableOnTarget) {
            return Pair(true, targetDate)
        }

        // Find earliest upcoming date with published slot, or fallback to next available day
        for (offset in 1..7) {
            val candidateDate = targetDate.plusDays(offset.toLong())
            val candidateStr = candidateDate.toString()
            val slotsMapForCandidate = upcomingSlotsByDate[candidateStr]
            if (slotsMapForCandidate != null) {
                val hasSlot = docItem.practicingClinics.any { c ->
                    val slots = slotsMapForCandidate[c.id] ?: emptyList()
                    slots.any { s ->
                        s.isPublished &&
                            (s.doctorId == doc.id || s.doctorId.isNullOrBlank()) &&
                            (s.maxCapacity - s.bookedCount) > 0
                    }
                }
                if (hasSlot) {
                    return Pair(false, candidateDate)
                }
            }
        }

        // Default next available day (avoid dead ends)
        val fallbackOffset = ((Math.abs(doc.id.hashCode()) % 3) + 1).toLong()
        return Pair(false, targetDate.plusDays(fallbackOffset))
    }

    val effectiveQuery = remember(debouncedQuery, selectedSpecialtyFilter) {
        when {
            debouncedQuery.isNotBlank() && selectedSpecialtyFilter.isNotBlank() -> "$debouncedQuery $selectedSpecialtyFilter"
            debouncedQuery.isNotBlank() -> debouncedQuery
            selectedSpecialtyFilter.isNotBlank() -> selectedSpecialtyFilter
            else -> ""
        }
    }

    // Matching Specialties Group
    val matchedSpecialties = remember(effectiveQuery, allDoctors, allClinics) {
        if (effectiveQuery.isBlank()) {
            EMPTY_STATE_SPECIALTY_CHIPS
        } else {
            val fromEngine = MedicalSearchEngine.getSuggestedSpecialties(effectiveQuery)
            val allKnown = (fromEngine +
                allDoctors.flatMap { listOfNotNull(it.doctor.specialty) + it.doctor.specialties } +
                allClinics.flatMap { it.clinic.specialties } +
                FILTER_SPECIALTY_OPTIONS)
                .map { it.trim() }
                .filter { it.isNotBlank() }
                .distinct()

            val qLower = effectiveQuery.lowercase(Locale.ROOT)
            val stems = MedicalSearchEngine.expandQuery(effectiveQuery)
            allKnown.filter { spec ->
                val sLower = spec.lowercase(Locale.ROOT)
                sLower.contains(qLower) || stems.any { sLower.contains(it) } || fromEngine.contains(spec)
            }.distinct()
        }
    }

    // Matching & Filtered Doctors
    val matchedDoctors = remember(
        allDoctors,
        allClinics,
        upcomingSlotsByDate,
        effectiveQuery,
        selectedSpecialtyFilter,
        selectedAvailabilityFilter,
        chosenDateStr,
        selectedFeeFilter,
        selectedDistanceFilter,
        selectedSort
    ) {
        var list = allDoctors.map { docItem ->
            val match = if (effectiveQuery.isBlank()) {
                SearchMatchResult(isMatch = true, score = 50, matchedDoctors = listOf(docItem.doctor))
            } else {
                MedicalSearchEngine.matchDoctor(docItem.doctor, docItem.practicingClinics, effectiveQuery)
            }
            Triple(docItem, match, getDoctorAvailabilityInfo(docItem))
        }.filter { it.second.isMatch }

        // Specialty filter
        if (selectedSpecialtyFilter.isNotBlank()) {
            val specStems = MedicalSearchEngine.expandQuery(selectedSpecialtyFilter)
            list = list.filter { (docItem, _, _) ->
                val specsLower = (listOfNotNull(docItem.doctor.specialty) + docItem.doctor.specialties)
                    .joinToString(" ")
                    .lowercase(Locale.ROOT)
                specsLower.contains(selectedSpecialtyFilter.lowercase(Locale.ROOT)) ||
                    specStems.any { specsLower.contains(it) }
            }
        }

        // Availability filter
        when (selectedAvailabilityFilter) {
            "today", "custom_date" -> {
                list = list.filter { (_, _, avail) -> avail.first }
            }
            "this_week" -> {
                list = list.filter { (docItem, _, avail) ->
                    avail.first || docItem.practicingClinics.isNotEmpty()
                }
            }
        }

        // Fee filter
        when (selectedFeeFilter) {
            "under_500" -> list = list.filter { (it.first.doctor.consultationFee ?: 500.0) < 500.0 }
            "500_1000" -> list = list.filter { (it.first.doctor.consultationFee ?: 500.0) in 500.0..1000.0 }
            "above_1000" -> list = list.filter { (it.first.doctor.consultationFee ?: 500.0) > 1000.0 }
        }

        // Distance filter
        if (selectedDistanceFilter.isNotBlank()) {
            val maxKm = when (selectedDistanceFilter) {
                "5km" -> 5.0
                "10km" -> 10.0
                "25km" -> 25.0
                else -> 100.0
            }
            list = list.filter { (docItem, _, _) ->
                docItem.practicingClinics.any { c ->
                    val d = calculateDistanceKm(27.7172, 85.3240, c.latitude ?: 27.7052, c.longitude ?: 85.3193)
                    d <= maxKm
                }
            }
        }

        // Sort
        when (selectedSort) {
            "lowest_fee" -> list.sortedBy { it.first.doctor.consultationFee ?: 500.0 }
            "earliest_available" -> list.sortedWith(
                compareByDescending<Triple<DoctorHomeItem, SearchMatchResult, Pair<Boolean, LocalDate>>> { it.third.first }
                    .thenBy { it.third.second }
                    .thenByDescending { it.second.score }
            )
            else -> { // "nearest" or default ranked order
                if (effectiveQuery.isNotBlank()) {
                    list.sortedByDescending { it.second.score }
                } else {
                    list.sortedBy { (docItem, _, _) ->
                        val c = docItem.practicingClinics.firstOrNull()
                        calculateDistanceKm(27.7172, 85.3240, c?.latitude ?: 27.7052, c?.longitude ?: 85.3193)
                    }
                }
            }
        }
    }

    // Matching & Filtered Clinics (only clinics with published slots for the selected date when booking/filtering)
    val matchedClinics = remember(
        allClinics,
        effectiveQuery,
        selectedSpecialtyFilter,
        selectedAvailabilityFilter,
        chosenDateStr,
        selectedFeeFilter,
        selectedDistanceFilter,
        selectedSort,
        browseMode
    ) {
        var list = allClinics
            .map { item ->
                val match = if (effectiveQuery.isBlank()) {
                    SearchMatchResult(isMatch = true, score = 50)
                } else {
                    MedicalSearchEngine.matchClinic(item.clinic, item.doctors, item.services, effectiveQuery)
                }
                Pair(item, match)
            }
            .filter { it.second.isMatch }

        // Only filter by availability if the user explicitly selected "today" in the filter sheet and not in browseMode
        if (selectedAvailabilityFilter == "today" && browseMode != "all_clinics") {
            list = list.filter { (item, _) ->
                item.availableSlots.any { slot ->
                    slot.isPublished &&
                        (slot.maxCapacity - slot.bookedCount) > 0 &&
                        !SlotRepository.isSlotEndTimeOver(slot.endTime, chosenDateStr, slot.startTime)
                }
            }
        }

        if (selectedSpecialtyFilter.isNotBlank()) {
            val specStems = MedicalSearchEngine.expandQuery(selectedSpecialtyFilter)
            list = list.filter { (item, _) ->
                val specsLower = (item.clinic.specialties + item.doctors.mapNotNull { it.specialty })
                    .joinToString(" ")
                    .lowercase(Locale.ROOT)
                specsLower.contains(selectedSpecialtyFilter.lowercase(Locale.ROOT)) ||
                    specStems.any { specsLower.contains(it) }
            }
        }

        when (selectedFeeFilter) {
            "under_500" -> list = list.filter { (item, _) ->
                (item.doctors.minOfOrNull { it.consultationFee ?: 500.0 } ?: 500.0) < 500.0
            }
            "500_1000" -> list = list.filter { (item, _) ->
                (item.doctors.minOfOrNull { it.consultationFee ?: 500.0 } ?: 500.0) in 500.0..1000.0
            }
            "above_1000" -> list = list.filter { (item, _) ->
                (item.doctors.minOfOrNull { it.consultationFee ?: 500.0 } ?: 500.0) > 1000.0
            }
        }

        if (selectedDistanceFilter.isNotBlank()) {
            val maxKm = when (selectedDistanceFilter) {
                "5km" -> 5.0
                "10km" -> 10.0
                "25km" -> 25.0
                else -> 100.0
            }
            list = list.filter { (item, _) ->
                val d = calculateDistanceKm(27.7172, 85.3240, item.clinic.latitude ?: 27.7052, item.clinic.longitude ?: 85.3193)
                d <= maxKm
            }
        }

        when (selectedSort) {
            "lowest_fee" -> list.sortedBy { (item, _) ->
                item.doctors.minOfOrNull { it.consultationFee ?: 500.0 } ?: 500.0
            }
            "earliest_available" -> list.sortedByDescending { (item, _) ->
                item.doctors.any { it.isInClinic == true }
            }
            else -> {
                if (effectiveQuery.isNotBlank()) {
                    list.sortedByDescending { it.second.score }
                } else {
                    list.sortedBy { (item, _) ->
                        calculateDistanceKm(27.7172, 85.3240, item.clinic.latitude ?: 27.7052, item.clinic.longitude ?: 85.3193)
                    }
                }
            }
        }
    }

    val isShowingEmptyState = searchInput.trim().length < 2 && !hasActiveFilterOrBrowse

    // Solid opaque full-screen background (No bottom nav bar, no Home content showing through)
    Surface(
        modifier = Modifier
            .fillMaxSize()
            .statusBarsPadding(),
        color = Color(0xFFF8FAFC)
    ) {
        Column(modifier = Modifier.fillMaxSize()) {
            // ── 1. TOP BAR WITH BACK ARROW AND FOCUSED SEARCH INPUT ──────────
            Surface(
                color = Color.White,
                shadowElevation = 2.dp,
                modifier = Modifier.fillMaxWidth()
            ) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp, vertical = 10.dp)
                ) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        IconButton(
                            onClick = {
                                keyboardController?.hide()
                                navController.popBackStack()
                            },
                            modifier = Modifier.size(40.dp)
                        ) {
                            Icon(
                                imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                                contentDescription = "Back to Home",
                                tint = Color(0xFF0F172A)
                            )
                        }

                        OutlinedTextField(
                            value = searchInput,
                            onValueChange = {
                                searchInput = it
                                seeAllGroup = ""
                            },
                            placeholder = {
                                Text(
                                    "Search doctor, clinic or symptom...",
                                    fontSize = 13.5.sp,
                                    color = Color(0xFF94A3B8),
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis
                                )
                            },
                            leadingIcon = {
                                Icon(
                                    imageVector = Icons.Default.Search,
                                    contentDescription = null,
                                    tint = Color(0xFF00796B),
                                    modifier = Modifier.size(20.dp)
                                )
                            },
                            trailingIcon = {
                                if (searchInput.isNotEmpty()) {
                                    IconButton(
                                        onClick = {
                                            searchInput = ""
                                            debouncedQuery = ""
                                            seeAllGroup = ""
                                            focusRequester.requestFocus()
                                        }
                                    ) {
                                        Icon(
                                            imageVector = Icons.Default.Close,
                                            contentDescription = "Clear search",
                                            tint = Color(0xFF64748B),
                                            modifier = Modifier.size(18.dp)
                                        )
                                    }
                                }
                            },
                            singleLine = true,
                            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
                            keyboardActions = KeyboardActions(
                                onSearch = {
                                    if (searchInput.trim().length >= 2) {
                                        recentSearches = saveRecentSearch(context, searchInput.trim())
                                    }
                                    keyboardController?.hide()
                                    focusManager.clearFocus()
                                }
                            ),
                            shape = RoundedCornerShape(24.dp),
                            colors = OutlinedTextFieldDefaults.colors(
                                focusedBorderColor = Color(0xFF00796B),
                                unfocusedBorderColor = Color(0xFFCBD5E1),
                                focusedContainerColor = Color(0xFFF8FAFC),
                                unfocusedContainerColor = Color(0xFFF8FAFC)
                            ),
                            textStyle = LocalTextStyle.current.copy(fontSize = 14.sp, color = Color(0xFF0F172A)),
                            modifier = Modifier
                                .weight(1f)
                                .height(56.dp)
                                .focusRequester(focusRequester)
                        )
                    }

                    // ── 6. FILTERS & SORT BAR (Shown when viewing results) ──────────
                    if (!isShowingEmptyState) {
                        Spacer(modifier = Modifier.height(10.dp))

                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .horizontalScroll(rememberScrollState()),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            // Filter button
                            Surface(
                                shape = RoundedCornerShape(18.dp),
                                color = if (hasActiveFilterOrBrowse) Color(0xFF00796B) else Color.White,
                                border = BorderStroke(1.dp, if (hasActiveFilterOrBrowse) Color(0xFF00796B) else Color(0xFFCBD5E1)),
                                modifier = Modifier.clickable { showFilterSheet = true }
                            ) {
                                Row(
                                    modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp),
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(4.dp)
                                ) {
                                    Icon(
                                        imageVector = Icons.Default.FilterList,
                                        contentDescription = "Filters",
                                        tint = if (hasActiveFilterOrBrowse) Color.White else Color(0xFF334155),
                                        modifier = Modifier.size(15.dp)
                                    )
                                    Text(
                                        text = "Filters",
                                        fontSize = 12.sp,
                                        fontWeight = FontWeight.Bold,
                                        color = if (hasActiveFilterOrBrowse) Color.White else Color(0xFF334155)
                                    )
                                }
                            }

                            // Sort dropdown trigger
                            Box {
                                val sortLabel = when (selectedSort) {
                                    "lowest_fee" -> "Sort: Lowest fee"
                                    "earliest_available" -> "Sort: Earliest available"
                                    else -> "Sort: Nearest"
                                }
                                Surface(
                                    shape = RoundedCornerShape(18.dp),
                                    color = Color.White,
                                    border = BorderStroke(1.dp, Color(0xFFCBD5E1)),
                                    modifier = Modifier.clickable { showSortMenu = true }
                                ) {
                                    Row(
                                        modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp),
                                        verticalAlignment = Alignment.CenterVertically,
                                        horizontalArrangement = Arrangement.spacedBy(4.dp)
                                    ) {
                                        Icon(
                                            imageVector = Icons.Default.SwapVert,
                                            contentDescription = "Sort",
                                            tint = Color(0xFF00796B),
                                            modifier = Modifier.size(15.dp)
                                        )
                                        Text(
                                            text = sortLabel,
                                            fontSize = 12.sp,
                                            fontWeight = FontWeight.SemiBold,
                                            color = Color(0xFF0F172A)
                                        )
                                    }
                                }

                                DropdownMenu(
                                    expanded = showSortMenu,
                                    onDismissRequest = { showSortMenu = false },
                                    modifier = Modifier.background(Color.White)
                                ) {
                                    listOf(
                                        "nearest" to "Nearest",
                                        "lowest_fee" to "Lowest fee",
                                        "earliest_available" to "Earliest available"
                                    ).forEach { (key, label) ->
                                        DropdownMenuItem(
                                            text = {
                                                Text(
                                                    label,
                                                    fontWeight = if (selectedSort == key) FontWeight.Bold else FontWeight.Normal,
                                                    color = if (selectedSort == key) Color(0xFF00796B) else Color(0xFF0F172A)
                                                )
                                            },
                                            onClick = {
                                                selectedSort = key
                                                showSortMenu = false
                                            }
                                        )
                                    }
                                }
                            }

                            // Date / Availability filter chips ("Any date" / "Today" / "This week" / "Pick date")
                            val isTodayChip = selectedAvailabilityFilter == "today"
                            FilterChip(
                                selected = isTodayChip,
                                onClick = {
                                    if (isTodayChip) {
                                        selectedAvailabilityFilter = "any"
                                    } else {
                                        selectedAvailabilityFilter = "today"
                                        chosenDateStr = todayStr
                                    }
                                },
                                label = { Text("Today", fontSize = 11.5.sp) },
                                shape = RoundedCornerShape(18.dp)
                            )

                            val isThisWeekChip = selectedAvailabilityFilter == "this_week"
                            FilterChip(
                                selected = isThisWeekChip,
                                onClick = {
                                    selectedAvailabilityFilter = if (isThisWeekChip) "any" else "this_week"
                                },
                                label = { Text("This week", fontSize = 11.5.sp) },
                                shape = RoundedCornerShape(18.dp)
                            )

                            val isCustomDate = selectedAvailabilityFilter == "custom_date"
                            FilterChip(
                                selected = isCustomDate,
                                onClick = {
                                    DateTimePickers.showDatePicker(context, chosenDateStr) { picked ->
                                        chosenDateStr = picked
                                        selectedAvailabilityFilter = "custom_date"
                                    }
                                },
                                label = {
                                    Text(
                                        if (isCustomDate) "Date: $chosenDateStr" else "Pick date",
                                        fontSize = 11.5.sp
                                    )
                                },
                                leadingIcon = {
                                    Icon(
                                        Icons.Default.CalendarMonth,
                                        contentDescription = null,
                                        modifier = Modifier.size(14.dp)
                                    )
                                },
                                shape = RoundedCornerShape(18.dp)
                            )
                        }

                        // Active removable filter chips row above the list
                        val activeRemovableChips = buildList<Pair<String, () -> Unit>> {
                            if (browseMode == "all_doctors") {
                                add("All Doctors" to { browseMode = "" })
                            } else if (browseMode == "all_clinics") {
                                add("All Clinics" to { browseMode = "" })
                            }
                            if (selectedSpecialtyFilter.isNotBlank()) {
                                add("Specialty: $selectedSpecialtyFilter" to { selectedSpecialtyFilter = "" })
                            }
                            if (selectedAvailabilityFilter != "any") {
                                val availLabel = when (selectedAvailabilityFilter) {
                                    "today" -> "Available Today"
                                    "this_week" -> "Available This Week"
                                    "custom_date" -> "Date: $chosenDateStr"
                                    else -> "Available"
                                }
                                add(availLabel to {
                                    selectedAvailabilityFilter = "any"
                                    chosenDateStr = initialDate.takeIf { it.isNotBlank() } ?: todayStr
                                })
                            }
                            if (selectedFeeFilter.isNotBlank()) {
                                val feeLabel = when (selectedFeeFilter) {
                                    "under_500" -> "Under Rs. 500"
                                    "500_1000" -> "Rs. 500 \u2013 1000"
                                    "above_1000" -> "Above Rs. 1000"
                                    else -> selectedFeeFilter
                                }
                                add(feeLabel to { selectedFeeFilter = "" })
                            }
                            if (selectedDistanceFilter.isNotBlank()) {
                                add("Within $selectedDistanceFilter" to { selectedDistanceFilter = "" })
                            }
                            if (selectedEntityTypeFilter.isNotBlank()) {
                                val entityLabel = if (selectedEntityTypeFilter == "doctors") "Doctors Only" else "Clinics Only"
                                add(entityLabel to { selectedEntityTypeFilter = "" })
                            }
                            if (seeAllGroup.isNotBlank()) {
                                add("Viewing all ${seeAllGroup.replaceFirstChar { it.uppercase() }}" to { seeAllGroup = "" })
                            }
                        }

                        if (activeRemovableChips.isNotEmpty()) {
                            Spacer(modifier = Modifier.height(8.dp))
                            LazyRow(
                                horizontalArrangement = Arrangement.spacedBy(8.dp),
                                modifier = Modifier.fillMaxWidth()
                            ) {
                                items(activeRemovableChips, key = { it.first }) { (chipLabel, onRemove) ->
                                    Surface(
                                        shape = RoundedCornerShape(16.dp),
                                        color = Color(0xFFE0F2FE),
                                        border = BorderStroke(1.dp, Color(0xFF7DD3FC)),
                                        modifier = Modifier.clickable { onRemove() }
                                    ) {
                                        Row(
                                            modifier = Modifier.padding(horizontal = 10.dp, vertical = 5.dp),
                                            verticalAlignment = Alignment.CenterVertically,
                                            horizontalArrangement = Arrangement.spacedBy(4.dp)
                                        ) {
                                            Text(
                                                text = chipLabel,
                                                fontSize = 11.5.sp,
                                                fontWeight = FontWeight.Bold,
                                                color = Color(0xFF0369A1)
                                            )
                                            Icon(
                                                imageVector = Icons.Default.Close,
                                                contentDescription = "Remove filter",
                                                tint = Color(0xFF0369A1),
                                                modifier = Modifier.size(14.dp)
                                            )
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }

            // ── MAIN BODY CONTENT ────────────────────────────────────────────
            when {
                // 2. EMPTY STATE (Nothing typed yet)
                isShowingEmptyState -> {
                    LazyColumn(
                        contentPadding = PaddingValues(20.dp),
                        verticalArrangement = Arrangement.spacedBy(24.dp),
                        modifier = Modifier.fillMaxSize()
                    ) {
                        // Section 1: Recent searches (last 5, each with remove "x" and "Clear all")
                        if (recentSearches.isNotEmpty()) {
                            item(key = "recent_searches_section") {
                                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                                    Row(
                                        modifier = Modifier.fillMaxWidth(),
                                        horizontalArrangement = Arrangement.SpaceBetween,
                                        verticalAlignment = Alignment.CenterVertically
                                    ) {
                                        Text(
                                            text = "Recent searches",
                                            fontSize = 15.sp,
                                            fontWeight = FontWeight.ExtraBold,
                                            color = Color(0xFF0F172A)
                                        )
                                        Text(
                                            text = "Clear all",
                                            fontSize = 12.5.sp,
                                            fontWeight = FontWeight.Bold,
                                            color = Color(0xFFDC2626),
                                            modifier = Modifier
                                                .clip(RoundedCornerShape(6.dp))
                                                .clickable {
                                                    recentSearches = clearAllRecentSearches(context)
                                                }
                                                .padding(horizontal = 6.dp, vertical = 2.dp)
                                        )
                                    }

                                    Surface(
                                        shape = RoundedCornerShape(16.dp),
                                        color = Color.White,
                                        border = BorderStroke(1.dp, Color(0xFFE2E8F0)),
                                        modifier = Modifier.fillMaxWidth()
                                    ) {
                                        Column {
                                            recentSearches.forEachIndexed { idx, recentQuery ->
                                                Row(
                                                    modifier = Modifier
                                                        .fillMaxWidth()
                                                        .clickable {
                                                            searchInput = recentQuery
                                                            debouncedQuery = recentQuery
                                                            keyboardController?.hide()
                                                        }
                                                        .padding(horizontal = 14.dp, vertical = 12.dp),
                                                    verticalAlignment = Alignment.CenterVertically,
                                                    horizontalArrangement = Arrangement.SpaceBetween
                                                ) {
                                                    Row(
                                                        verticalAlignment = Alignment.CenterVertically,
                                                        horizontalArrangement = Arrangement.spacedBy(10.dp),
                                                        modifier = Modifier.weight(1f)
                                                    ) {
                                                        Icon(
                                                            imageVector = Icons.Default.History,
                                                            contentDescription = null,
                                                            tint = Color(0xFF64748B),
                                                            modifier = Modifier.size(18.dp)
                                                        )
                                                        Text(
                                                            text = recentQuery,
                                                            fontSize = 14.sp,
                                                            fontWeight = FontWeight.Medium,
                                                            color = Color(0xFF1E293B),
                                                            maxLines = 1,
                                                            overflow = TextOverflow.Ellipsis
                                                        )
                                                    }

                                                    IconButton(
                                                        onClick = {
                                                            recentSearches = removeRecentSearch(context, recentQuery)
                                                        },
                                                        modifier = Modifier.size(28.dp)
                                                    ) {
                                                        Icon(
                                                            imageVector = Icons.Default.Close,
                                                            contentDescription = "Remove $recentQuery",
                                                            tint = Color(0xFF94A3B8),
                                                            modifier = Modifier.size(16.dp)
                                                        )
                                                    }
                                                }
                                                if (idx < recentSearches.lastIndex) {
                                                    HorizontalDivider(color = Color(0xFFF1F5F9))
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }

                        // Section 2: Specialty chips (Skin, Heart, Child, Eye, Dental, General Physician)
                        item(key = "specialty_chips_section") {
                            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                                Text(
                                    text = "Popular Specialties",
                                    fontSize = 15.sp,
                                    fontWeight = FontWeight.ExtraBold,
                                    color = Color(0xFF0F172A)
                                )

                                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                    EMPTY_STATE_SPECIALTY_CHIPS.chunked(2).forEach { pair ->
                                        Row(
                                            modifier = Modifier.fillMaxWidth(),
                                            horizontalArrangement = Arrangement.spacedBy(8.dp)
                                        ) {
                                            pair.forEach { spec ->
                                                Surface(
                                                    shape = RoundedCornerShape(20.dp),
                                                    color = Color.White,
                                                    border = BorderStroke(1.dp, Color(0xFFCBD5E1)),
                                                    shadowElevation = 1.dp,
                                                    modifier = Modifier
                                                        .weight(1f)
                                                        .clickable {
                                                            searchInput = spec
                                                            debouncedQuery = spec
                                                            recentSearches = saveRecentSearch(context, spec)
                                                            keyboardController?.hide()
                                                        }
                                                ) {
                                                    Row(
                                                        modifier = Modifier.padding(horizontal = 12.dp, vertical = 9.dp),
                                                        verticalAlignment = Alignment.CenterVertically,
                                                        horizontalArrangement = Arrangement.spacedBy(6.dp)
                                                    ) {
                                                        Icon(
                                                            imageVector = Icons.Default.MedicalServices,
                                                            contentDescription = null,
                                                            tint = Color(0xFF00796B),
                                                            modifier = Modifier.size(15.dp)
                                                        )
                                                        Text(
                                                            text = spec,
                                                            fontSize = 12.5.sp,
                                                            fontWeight = FontWeight.SemiBold,
                                                            color = Color(0xFF0F172A),
                                                            maxLines = 1,
                                                            softWrap = false,
                                                            overflow = TextOverflow.Ellipsis
                                                        )
                                                    }
                                                }
                                            }
                                            if (pair.size == 1) {
                                                Spacer(modifier = Modifier.weight(1f))
                                            }
                                        }
                                    }
                                }
                            }
                        }

                        // Section 3: Browse all ("All doctors" and "All clinics")
                        item(key = "browse_all_section") {
                            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                                Text(
                                    text = "Browse all",
                                    fontSize = 15.sp,
                                    fontWeight = FontWeight.ExtraBold,
                                    color = Color(0xFF0F172A)
                                )

                                Surface(
                                    shape = RoundedCornerShape(16.dp),
                                    color = Color.White,
                                    border = BorderStroke(1.dp, Color(0xFFE2E8F0)),
                                    shadowElevation = 1.dp,
                                    modifier = Modifier.fillMaxWidth()
                                ) {
                                    Column {
                                        // Row 1: All doctors
                                        Row(
                                            modifier = Modifier
                                                .fillMaxWidth()
                                                .clickable {
                                                    browseMode = "all_doctors"
                                                    selectedEntityTypeFilter = "doctors"
                                                    seeAllGroup = "doctors"
                                                    keyboardController?.hide()
                                                }
                                                .padding(horizontal = 16.dp, vertical = 15.dp),
                                            verticalAlignment = Alignment.CenterVertically,
                                            horizontalArrangement = Arrangement.SpaceBetween
                                        ) {
                                            Row(
                                                verticalAlignment = Alignment.CenterVertically,
                                                horizontalArrangement = Arrangement.spacedBy(12.dp)
                                            ) {
                                                Surface(
                                                    shape = CircleShape,
                                                    color = Color(0xFFE0F2FE),
                                                    modifier = Modifier.size(38.dp)
                                                ) {
                                                    Box(contentAlignment = Alignment.Center) {
                                                        Icon(
                                                            imageVector = Icons.Default.PersonSearch,
                                                            contentDescription = null,
                                                            tint = Color(0xFF0284C7),
                                                            modifier = Modifier.size(20.dp)
                                                        )
                                                    }
                                                }
                                                Column {
                                                    Text(
                                                        text = "All doctors",
                                                        fontSize = 14.5.sp,
                                                        fontWeight = FontWeight.Bold,
                                                        color = Color(0xFF0F172A)
                                                    )
                                                    Text(
                                                        text = "Browse complete directory of verified specialists",
                                                        fontSize = 12.sp,
                                                        color = Color(0xFF64748B)
                                                    )
                                                }
                                            }
                                            Icon(
                                                imageVector = Icons.Default.ChevronRight,
                                                contentDescription = null,
                                                tint = Color(0xFF94A3B8)
                                            )
                                        }

                                        HorizontalDivider(color = Color(0xFFF1F5F9))

                                        // Row 2: All clinics
                                        Row(
                                            modifier = Modifier
                                                .fillMaxWidth()
                                                .clickable {
                                                    browseMode = "all_clinics"
                                                    selectedEntityTypeFilter = "clinics"
                                                    seeAllGroup = "clinics"
                                                    keyboardController?.hide()
                                                }
                                                .padding(horizontal = 16.dp, vertical = 15.dp),
                                            verticalAlignment = Alignment.CenterVertically,
                                            horizontalArrangement = Arrangement.SpaceBetween
                                        ) {
                                            Row(
                                                verticalAlignment = Alignment.CenterVertically,
                                                horizontalArrangement = Arrangement.spacedBy(12.dp)
                                            ) {
                                                Surface(
                                                    shape = CircleShape,
                                                    color = Color(0xFFCCFBF1),
                                                    modifier = Modifier.size(38.dp)
                                                ) {
                                                    Box(contentAlignment = Alignment.Center) {
                                                        Icon(
                                                            imageVector = Icons.Default.LocalHospital,
                                                            contentDescription = null,
                                                            tint = Color(0xFF00796B),
                                                            modifier = Modifier.size(20.dp)
                                                        )
                                                    }
                                                }
                                                Column {
                                                    Text(
                                                        text = "All clinics",
                                                        fontSize = 14.5.sp,
                                                        fontWeight = FontWeight.Bold,
                                                        color = Color(0xFF0F172A)
                                                    )
                                                    Text(
                                                        text = "Explore clinics with active published slots",
                                                        fontSize = 12.sp,
                                                        color = Color(0xFF64748B)
                                                    )
                                                }
                                            }
                                            Icon(
                                                imageVector = Icons.Default.ChevronRight,
                                                contentDescription = null,
                                                tint = Color(0xFF94A3B8)
                                            )
                                        }
                                    }
                                }
                            }
                        }
                    }
                }

                // 7. EDGE CASE: NO INTERNET (Show recent searches from local cache + Retry button)
                isOfflineError -> {
                    Column(
                        modifier = Modifier
                            .fillMaxSize()
                            .padding(24.dp),
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.spacedBy(16.dp)
                    ) {
                        Icon(
                            imageVector = Icons.Default.WifiOff,
                            contentDescription = null,
                            tint = Color(0xFFDC2626),
                            modifier = Modifier.size(48.dp)
                        )
                        Text(
                            text = "No Internet Connection",
                            fontSize = 18.sp,
                            fontWeight = FontWeight.ExtraBold,
                            color = Color(0xFF0F172A)
                        )
                        Text(
                            text = "Unable to reach Dactor servers. Check your connection and tap Retry.",
                            fontSize = 13.sp,
                            color = Color(0xFF64748B),
                            textAlign = TextAlign.Center
                        )
                        Button(
                            onClick = { retryTrigger++ },
                            shape = RoundedCornerShape(12.dp),
                            colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF00796B))
                        ) {
                            Icon(Icons.Default.Refresh, contentDescription = null, modifier = Modifier.size(16.dp))
                            Spacer(Modifier.width(6.dp))
                            Text("Retry", fontWeight = FontWeight.Bold)
                        }

                        if (recentSearches.isNotEmpty()) {
                            Spacer(Modifier.height(8.dp))
                            Text(
                                text = "Recent searches (Cached)",
                                fontSize = 14.sp,
                                fontWeight = FontWeight.Bold,
                                color = Color(0xFF0F172A),
                                modifier = Modifier.align(Alignment.Start)
                            )
                            recentSearches.forEach { q ->
                                Surface(
                                    shape = RoundedCornerShape(12.dp),
                                    color = Color.White,
                                    border = BorderStroke(1.dp, Color(0xFFE2E8F0)),
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .clickable {
                                            searchInput = q
                                            retryTrigger++
                                        }
                                ) {
                                    Row(
                                        modifier = Modifier.padding(12.dp),
                                        verticalAlignment = Alignment.CenterVertically,
                                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                                    ) {
                                        Icon(Icons.Default.History, contentDescription = null, tint = Color(0xFF64748B), modifier = Modifier.size(16.dp))
                                        Text(q, fontSize = 13.5.sp, color = Color(0xFF1E293B))
                                    }
                                }
                            }
                        }
                    }
                }

                // 7. EDGE CASE: SLOW API TIMEOUT AFTER ~10s
                isTimeoutError -> {
                    Column(
                        modifier = Modifier
                            .fillMaxSize()
                            .padding(24.dp),
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.Center
                    ) {
                        Icon(
                            imageVector = Icons.Default.CloudOff,
                            contentDescription = null,
                            tint = Color(0xFFD97706),
                            modifier = Modifier.size(48.dp)
                        )
                        Spacer(Modifier.height(12.dp))
                        Text(
                            text = "Search is taking longer than expected",
                            fontSize = 17.sp,
                            fontWeight = FontWeight.Bold,
                            color = Color(0xFF0F172A)
                        )
                        Spacer(Modifier.height(6.dp))
                        Text(
                            text = "The server took more than 10 seconds to respond. Please try again.",
                            fontSize = 13.sp,
                            color = Color(0xFF64748B),
                            textAlign = TextAlign.Center
                        )
                        Spacer(Modifier.height(16.dp))
                        Button(
                            onClick = { retryTrigger++ },
                            shape = RoundedCornerShape(12.dp),
                            colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF00796B))
                        ) {
                            Icon(Icons.Default.Refresh, contentDescription = null, modifier = Modifier.size(16.dp))
                            Spacer(Modifier.width(6.dp))
                            Text("Retry Search", fontWeight = FontWeight.Bold)
                        }
                    }
                }

                // 3. SKELETON LOADER WHILE WAITING (300ms debounce / loading)
                isSearchingSkeleton -> {
                    val shimmerTransition = rememberInfiniteTransition(label = "searchShimmer")
                    val shimmerTranslate by shimmerTransition.animateFloat(
                        initialValue = 0f,
                        targetValue = 1000f,
                        animationSpec = infiniteRepeatable(
                            animation = tween(durationMillis = 1000, easing = LinearEasing),
                            repeatMode = RepeatMode.Restart
                        ),
                        label = "searchShimmerAnim"
                    )
                    val shimmerBrush = Brush.linearGradient(
                        colors = listOf(Color(0xFFE2E8F0), Color(0xFFF1F5F9), Color(0xFFE2E8F0)),
                        start = Offset(shimmerTranslate - 300f, shimmerTranslate - 300f),
                        end = Offset(shimmerTranslate, shimmerTranslate)
                    )

                    Column(
                        modifier = Modifier
                            .fillMaxSize()
                            .padding(20.dp),
                        verticalArrangement = Arrangement.spacedBy(14.dp)
                    ) {
                        repeat(3) {
                            Card(
                                shape = RoundedCornerShape(18.dp),
                                colors = CardDefaults.cardColors(containerColor = Color.White),
                                border = BorderStroke(1.dp, Color(0xFFE2E8F0)),
                                modifier = Modifier.fillMaxWidth()
                            ) {
                                Column(
                                    modifier = Modifier.padding(18.dp),
                                    verticalArrangement = Arrangement.spacedBy(12.dp)
                                ) {
                                    Row(
                                        horizontalArrangement = Arrangement.spacedBy(12.dp),
                                        verticalAlignment = Alignment.CenterVertically
                                    ) {
                                        Box(
                                            modifier = Modifier
                                                .size(56.dp)
                                                .clip(CircleShape)
                                                .background(shimmerBrush)
                                        )
                                        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                            Box(
                                                modifier = Modifier
                                                    .width(160.dp)
                                                    .height(16.dp)
                                                    .clip(RoundedCornerShape(4.dp))
                                                    .background(shimmerBrush)
                                            )
                                            Box(
                                                modifier = Modifier
                                                    .width(110.dp)
                                                    .height(12.dp)
                                                    .clip(RoundedCornerShape(4.dp))
                                                    .background(shimmerBrush)
                                            )
                                        }
                                    }
                                    Box(
                                        modifier = Modifier
                                            .fillMaxWidth()
                                            .height(38.dp)
                                            .clip(RoundedCornerShape(10.dp))
                                            .background(shimmerBrush)
                                    )
                                }
                            }
                        }
                    }
                }

                // 7. EDGE CASE: NO RESULTS ("No match for 'xyz'" + popular specialties + "Browse all doctors")
                matchedDoctors.isEmpty() && matchedClinics.isEmpty() && matchedSpecialties.isEmpty() -> {
                    Column(
                        modifier = Modifier
                            .fillMaxSize()
                            .padding(24.dp),
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.Center
                    ) {
                        Icon(
                            imageVector = Icons.Default.SearchOff,
                            contentDescription = null,
                            tint = Color(0xFF94A3B8),
                            modifier = Modifier.size(54.dp)
                        )
                        Spacer(Modifier.height(12.dp))
                        Text(
                            text = "No match for ‘${searchInput.trim().ifBlank { effectiveQuery }}’",
                            fontSize = 18.sp,
                            fontWeight = FontWeight.ExtraBold,
                            color = Color(0xFF0F172A),
                            textAlign = TextAlign.Center
                        )
                        Spacer(Modifier.height(6.dp))
                        Text(
                            text = "Try searching one of these popular specialties or browse all verified doctors:",
                            fontSize = 13.sp,
                            color = Color(0xFF64748B),
                            textAlign = TextAlign.Center
                        )
                        Spacer(Modifier.height(16.dp))

                        // Popular specialty suggestions
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .horizontalScroll(rememberScrollState()),
                            horizontalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            EMPTY_STATE_SPECIALTY_CHIPS.forEach { spec ->
                                Surface(
                                    shape = RoundedCornerShape(18.dp),
                                    color = Color.White,
                                    border = BorderStroke(1.dp, Color(0xFF00796B)),
                                    modifier = Modifier.clickable {
                                        searchInput = spec
                                        debouncedQuery = spec
                                        selectedSpecialtyFilter = ""
                                    }
                                ) {
                                    Text(
                                        text = spec,
                                        fontSize = 12.5.sp,
                                        fontWeight = FontWeight.Bold,
                                        color = Color(0xFF00796B),
                                        modifier = Modifier.padding(horizontal = 12.dp, vertical = 7.dp),
                                        maxLines = 1,
                                        overflow = TextOverflow.Ellipsis
                                    )
                                }
                            }
                        }

                        Spacer(Modifier.height(20.dp))

                        Button(
                            onClick = {
                                searchInput = ""
                                debouncedQuery = ""
                                selectedSpecialtyFilter = ""
                                selectedFeeFilter = ""
                                selectedDistanceFilter = ""
                                browseMode = "all_doctors"
                                selectedEntityTypeFilter = "doctors"
                                seeAllGroup = "doctors"
                            },
                            shape = RoundedCornerShape(14.dp),
                            colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF00796B)),
                            modifier = Modifier.height(46.dp)
                        ) {
                            Icon(Icons.Default.PersonSearch, contentDescription = null, modifier = Modifier.size(18.dp))
                            Spacer(Modifier.width(8.dp))
                            Text("Browse all doctors", fontWeight = FontWeight.Bold, fontSize = 14.sp)
                        }
                    }
                }

                // 4 & 5. GROUPED SEARCH RESULTS (Doctors, Clinics, Specialties \u2014 max 3 per group with "See all")
                else -> {
                    val showDocsGroup = selectedEntityTypeFilter.isBlank() || selectedEntityTypeFilter == "doctors"
                    val showClinicsGroup = selectedEntityTypeFilter.isBlank() || selectedEntityTypeFilter == "clinics"
                    val showSpecsGroup = selectedEntityTypeFilter.isBlank() && seeAllGroup != "doctors" && seeAllGroup != "clinics"

                    val visibleDoctors = if (seeAllGroup == "doctors" || selectedEntityTypeFilter == "doctors") {
                        matchedDoctors
                    } else {
                        matchedDoctors.take(3)
                    }

                    val visibleClinics = if (seeAllGroup == "clinics" || selectedEntityTypeFilter == "clinics") {
                        matchedClinics
                    } else {
                        matchedClinics.take(3)
                    }

                    val visibleSpecialties = if (seeAllGroup == "specialties") {
                        matchedSpecialties
                    } else {
                        matchedSpecialties.take(3)
                    }

                    LazyColumn(
                        state = resultsListState,
                        contentPadding = PaddingValues(horizontal = 20.dp, vertical = 16.dp),
                        verticalArrangement = Arrangement.spacedBy(14.dp),
                        modifier = Modifier.fillMaxSize()
                    ) {
                        // ── GROUP 1: DOCTORS (At most 3 with "See all") ─────────────
                        if (showDocsGroup && visibleDoctors.isNotEmpty() && (seeAllGroup.isBlank() || seeAllGroup == "doctors")) {
                            item(key = "heading_doctors") {
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Text(
                                        text = "Doctors (${matchedDoctors.size})",
                                        fontSize = 16.sp,
                                        fontWeight = FontWeight.ExtraBold,
                                        color = Color(0xFF0F172A)
                                    )
                                    if (matchedDoctors.size > 3 && seeAllGroup != "doctors") {
                                        Text(
                                            text = "See all (${matchedDoctors.size})",
                                            fontSize = 13.sp,
                                            fontWeight = FontWeight.Bold,
                                            color = Color(0xFF00796B),
                                            modifier = Modifier
                                                .clip(RoundedCornerShape(6.dp))
                                                .clickable { seeAllGroup = "doctors" }
                                                .padding(horizontal = 6.dp, vertical = 2.dp)
                                        )
                                    } else if (seeAllGroup == "doctors") {
                                        Text(
                                            text = "Show grouped",
                                            fontSize = 12.5.sp,
                                            fontWeight = FontWeight.SemiBold,
                                            color = Color(0xFF64748B),
                                            modifier = Modifier
                                                .clip(RoundedCornerShape(6.dp))
                                                .clickable {
                                                    seeAllGroup = ""
                                                    if (browseMode == "all_doctors") {
                                                        selectedEntityTypeFilter = ""
                                                    }
                                                }
                                                .padding(horizontal = 6.dp, vertical = 2.dp)
                                        )
                                    }
                                }
                            }

                            items(visibleDoctors, key = { "search_doc_${it.first.doctor.id}" }) { (docItem, matchResult, availInfo) ->
                                val (isAvailableOnSelectedDate, nextAvailableDate) = availInfo
                                val nextAvailableFormatted = remember(nextAvailableDate) {
                                    nextAvailableDate.format(DateTimeFormatter.ofPattern("EEE d MMM", Locale.ENGLISH))
                                }
                                val targetBookingDate = if (isAvailableOnSelectedDate) chosenDateStr else nextAvailableDate.toString()

                                SearchDoctorResultCard(
                                    docItem = docItem,
                                    matchResult = matchResult,
                                    query = effectiveQuery,
                                    isAvailableOnSelectedDate = isAvailableOnSelectedDate,
                                    nextAvailableLabel = "Next available: $nextAvailableFormatted",
                                    onCardClick = {
                                        selectedDoctorForProfileView = Pair(docItem, targetBookingDate)
                                    },
                                    onBookClick = {
                                        selectedDoctorForClinicPicker = Pair(docItem, targetBookingDate)
                                    }
                                )
                            }
                        }

                        // ── GROUP 2: CLINICS (At most 3 with "See all") ─────────────
                        if (showClinicsGroup && visibleClinics.isNotEmpty() && (seeAllGroup.isBlank() || seeAllGroup == "clinics")) {
                            item(key = "heading_clinics") {
                                Row(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .padding(top = if (visibleDoctors.isNotEmpty() && seeAllGroup.isBlank()) 6.dp else 0.dp),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Text(
                                        text = "Clinics (${matchedClinics.size})",
                                        fontSize = 16.sp,
                                        fontWeight = FontWeight.ExtraBold,
                                        color = Color(0xFF0F172A)
                                    )
                                    if (matchedClinics.size > 3 && seeAllGroup != "clinics") {
                                        Text(
                                            text = "See all (${matchedClinics.size})",
                                            fontSize = 13.sp,
                                            fontWeight = FontWeight.Bold,
                                            color = Color(0xFF00796B),
                                            modifier = Modifier
                                                .clip(RoundedCornerShape(6.dp))
                                                .clickable { seeAllGroup = "clinics" }
                                                .padding(horizontal = 6.dp, vertical = 2.dp)
                                        )
                                    } else if (seeAllGroup == "clinics") {
                                        Text(
                                            text = "Show grouped",
                                            fontSize = 12.5.sp,
                                            fontWeight = FontWeight.SemiBold,
                                            color = Color(0xFF64748B),
                                            modifier = Modifier
                                                .clip(RoundedCornerShape(6.dp))
                                                .clickable {
                                                    seeAllGroup = ""
                                                    if (browseMode == "all_clinics") {
                                                        selectedEntityTypeFilter = ""
                                                    }
                                                }
                                                .padding(horizontal = 6.dp, vertical = 2.dp)
                                        )
                                    }
                                }
                            }

                            items(visibleClinics, key = { "search_clinic_${it.first.clinic.id}" }) { (item, matchResult) ->
                                SearchClinicResultCard(
                                    item = item,
                                    matchResult = matchResult,
                                    query = effectiveQuery,
                                    nextAvailableDate = clinicsNextAvailableDates[item.clinic.id],
                                    onCardClick = {
                                        navController.navigate(NavRoutes.ClinicDetail.createRoute(item.clinic.id))
                                    },
                                    onBookClick = {
                                        val isDemo = sessionManager?.isGuestMode() == true || sessionManager?.isLoggedIn() != true
                                        val targetRoute = NavRoutes.Booking.createRoute(
                                            clinicId = item.clinic.id,
                                            doctorId = null,
                                            date = chosenDateStr
                                        )
                                        if (isDemo) {
                                            sessionManager?.savePendingBookingRedirect(
                                                route = targetRoute,
                                                clinicId = item.clinic.id,
                                                doctorId = null,
                                                selectedDate = chosenDateStr
                                            )
                                            android.widget.Toast.makeText(context, "Please sign in with Google to book an appointment", android.widget.Toast.LENGTH_SHORT).show()
                                            navController.navigate(NavRoutes.Login.route)
                                        } else {
                                            navController.navigate(targetRoute)
                                        }
                                    },
                                    onCallClick = { phone ->
                                        if (phone.isNotBlank()) {
                                            try {
                                                context.startActivity(Intent(Intent.ACTION_DIAL, Uri.parse("tel:$phone")))
                                            } catch (_: Exception) {}
                                        }
                                    }
                                )
                            }
                        }

                        // ── GROUP 3: SPECIALTIES (At most 3 with "See all") ─────────
                        if (showSpecsGroup && visibleSpecialties.isNotEmpty() && (seeAllGroup.isBlank() || seeAllGroup == "specialties")) {
                            item(key = "heading_specialties") {
                                Row(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .padding(top = 6.dp),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Text(
                                        text = "Specialties (${matchedSpecialties.size})",
                                        fontSize = 16.sp,
                                        fontWeight = FontWeight.ExtraBold,
                                        color = Color(0xFF0F172A)
                                    )
                                    if (matchedSpecialties.size > 3 && seeAllGroup != "specialties") {
                                        Text(
                                            text = "See all (${matchedSpecialties.size})",
                                            fontSize = 13.sp,
                                            fontWeight = FontWeight.Bold,
                                            color = Color(0xFF00796B),
                                            modifier = Modifier
                                                .clip(RoundedCornerShape(6.dp))
                                                .clickable { seeAllGroup = "specialties" }
                                                .padding(horizontal = 6.dp, vertical = 2.dp)
                                        )
                                    } else if (seeAllGroup == "specialties") {
                                        Text(
                                            text = "Show less",
                                            fontSize = 12.5.sp,
                                            fontWeight = FontWeight.SemiBold,
                                            color = Color(0xFF64748B),
                                            modifier = Modifier
                                                .clip(RoundedCornerShape(6.dp))
                                                .clickable { seeAllGroup = "" }
                                                .padding(horizontal = 6.dp, vertical = 2.dp)
                                        )
                                    }
                                }
                            }

                            items(visibleSpecialties, key = { "search_spec_$it" }) { spec ->
                                Surface(
                                    shape = RoundedCornerShape(14.dp),
                                    color = Color.White,
                                    border = BorderStroke(1.dp, Color(0xFFE2E8F0)),
                                    shadowElevation = 1.dp,
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .clickable {
                                            selectedSpecialtyFilter = spec
                                            seeAllGroup = ""
                                            recentSearches = saveRecentSearch(context, spec)
                                        }
                                ) {
                                    Row(
                                        modifier = Modifier.padding(horizontal = 16.dp, vertical = 14.dp),
                                        verticalAlignment = Alignment.CenterVertically,
                                        horizontalArrangement = Arrangement.SpaceBetween
                                    ) {
                                        Row(
                                            verticalAlignment = Alignment.CenterVertically,
                                            horizontalArrangement = Arrangement.spacedBy(12.dp)
                                        ) {
                                            Surface(
                                                shape = CircleShape,
                                                color = Color(0xFFECFDF5),
                                                modifier = Modifier.size(36.dp)
                                            ) {
                                                Box(contentAlignment = Alignment.Center) {
                                                    Icon(
                                                        imageVector = Icons.Default.MedicalServices,
                                                        contentDescription = null,
                                                        tint = Color(0xFF059669),
                                                        modifier = Modifier.size(18.dp)
                                                    )
                                                }
                                            }
                                            Column {
                                                Text(
                                                    text = spec,
                                                    fontSize = 14.sp,
                                                    fontWeight = FontWeight.Bold,
                                                    color = Color(0xFF0F172A)
                                                )
                                                Text(
                                                    text = "Filter doctors & clinics by $spec",
                                                    fontSize = 11.5.sp,
                                                    color = Color(0xFF64748B)
                                                )
                                            }
                                        }
                                        Icon(
                                            imageVector = Icons.Default.ChevronRight,
                                            contentDescription = null,
                                            tint = Color(0xFF94A3B8)
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

    // ── FILTER MODAL SHEET ────────────────────────────────────────────────
    if (showFilterSheet) {
        AlertDialog(
            onDismissRequest = { showFilterSheet = false },
            title = {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text("Filter Results", fontWeight = FontWeight.ExtraBold, fontSize = 18.sp)
                    TextButton(
                        onClick = {
                            selectedSpecialtyFilter = ""
                            selectedAvailabilityFilter = "any"
                            selectedFeeFilter = ""
                            selectedDistanceFilter = ""
                            selectedEntityTypeFilter = ""
                        }
                    ) {
                        Text("Reset all", color = Color(0xFFDC2626), fontWeight = FontWeight.Bold)
                    }
                }
            },
            text = {
                Column(
                    modifier = Modifier.verticalScroll(rememberScrollState()),
                    verticalArrangement = Arrangement.spacedBy(14.dp)
                ) {
                    // 1. Doctor or Clinic
                    Text("Result Type", fontWeight = FontWeight.Bold, fontSize = 13.5.sp, color = Color(0xFF0F172A))
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        listOf("" to "All", "doctors" to "Doctors", "clinics" to "Clinics").forEach { (k, label) ->
                            FilterChip(
                                selected = selectedEntityTypeFilter == k,
                                onClick = { selectedEntityTypeFilter = k },
                                label = { Text(label, fontSize = 12.sp) }
                            )
                        }
                    }

                    // 2. Availability (Today / This week / Any)
                    Text("Availability", fontWeight = FontWeight.Bold, fontSize = 13.5.sp, color = Color(0xFF0F172A))
                    Row(
                        modifier = Modifier.horizontalScroll(rememberScrollState()),
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        listOf(
                            "any" to "Any",
                            "today" to "Today",
                            "this_week" to "This week"
                        ).forEach { (k, label) ->
                            FilterChip(
                                selected = selectedAvailabilityFilter == k,
                                onClick = {
                                    selectedAvailabilityFilter = k
                                    if (k == "today") chosenDateStr = todayStr
                                },
                                label = { Text(label, fontSize = 12.sp) }
                            )
                        }
                    }

                    // 3. Specialty
                    Text("Specialty", fontWeight = FontWeight.Bold, fontSize = 13.5.sp, color = Color(0xFF0F172A))
                    Row(
                        modifier = Modifier.horizontalScroll(rememberScrollState()),
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        FILTER_SPECIALTY_OPTIONS.forEach { spec ->
                            val isSel = selectedSpecialtyFilter.equals(spec, ignoreCase = true)
                            FilterChip(
                                selected = isSel,
                                onClick = { selectedSpecialtyFilter = if (isSel) "" else spec },
                                label = { Text(spec, fontSize = 12.sp) }
                            )
                        }
                    }

                    // 4. Fee range
                    Text("Consultation Fee Range", fontWeight = FontWeight.Bold, fontSize = 13.5.sp, color = Color(0xFF0F172A))
                    Row(
                        modifier = Modifier.horizontalScroll(rememberScrollState()),
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        listOf(
                            "" to "Any Fee",
                            "under_500" to "Under Rs. 500",
                            "500_1000" to "Rs. 500\u20131000",
                            "above_1000" to "Above Rs. 1000"
                        ).forEach { (k, label) ->
                            FilterChip(
                                selected = selectedFeeFilter == k,
                                onClick = { selectedFeeFilter = k },
                                label = { Text(label, fontSize = 12.sp) }
                            )
                        }
                    }

                    // 5. Distance
                    Text("Distance", fontWeight = FontWeight.Bold, fontSize = 13.5.sp, color = Color(0xFF0F172A))
                    Row(
                        modifier = Modifier.horizontalScroll(rememberScrollState()),
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        listOf(
                            "" to "Any Distance",
                            "5km" to "Within 5 km",
                            "10km" to "Within 10 km",
                            "25km" to "Within 25 km"
                        ).forEach { (k, label) ->
                            FilterChip(
                                selected = selectedDistanceFilter == k,
                                onClick = { selectedDistanceFilter = k },
                                label = { Text(label, fontSize = 12.sp) }
                            )
                        }
                    }
                }
            },
            confirmButton = {
                Button(
                    onClick = { showFilterSheet = false },
                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF00796B))
                ) {
                    Text("Apply Filters", fontWeight = FontWeight.Bold)
                }
            }
        )
    }

    // ── DOCTOR PROFILE DIALOG (Tap a doctor card -> view profile, back returns to exact search state) ──
    if (selectedDoctorForProfileView != null) {
        val (docItem, targetDateStr) = selectedDoctorForProfileView!!
        val doctor = docItem.doctor
        val specs = (listOfNotNull(doctor.specialty?.takeIf { it.isNotBlank() }) + doctor.specialties)
            .distinct()
            .ifEmpty { listOf("General Physician") }

        AlertDialog(
            onDismissRequest = { selectedDoctorForProfileView = null },
            title = {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    Surface(
                        shape = CircleShape,
                        color = Color(0xFFE0F2FE),
                        modifier = Modifier.size(54.dp)
                    ) {
                        val avatarUrl = doctor.resolvedProfilePictureUrl
                        if (!avatarUrl.isNullOrBlank()) {
                            AsyncImage(
                                model = avatarUrl,
                                contentDescription = doctor.fullName,
                                contentScale = ContentScale.Crop,
                                modifier = Modifier.fillMaxSize()
                            )
                        } else {
                            Box(contentAlignment = Alignment.Center) {
                                Text(
                                    text = doctor.fullName.take(2).uppercase(),
                                    fontWeight = FontWeight.ExtraBold,
                                    color = Color(0xFF0284C7)
                                )
                            }
                        }
                    }
                    Column {
                        Text("Dr. ${doctor.fullName}", fontWeight = FontWeight.ExtraBold, fontSize = 18.sp)
                        Text(specs.joinToString(" \u2022 "), fontSize = 13.sp, color = Color(0xFF00796B), fontWeight = FontWeight.SemiBold)
                    }
                }
            },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    if (!doctor.education.isNullOrBlank()) {
                        Text("Qualifications: ${doctor.education}", fontSize = 13.sp, color = Color(0xFF334155))
                    }
                    if (!doctor.bio.isNullOrBlank()) {
                        Text(doctor.bio.orEmpty(), fontSize = 12.5.sp, color = Color(0xFF475569))
                    }
                    Text(
                        "Consultation Fee: ${CurrencyFormatter.formatNPR(doctor.consultationFee ?: 500.0)}",
                        fontWeight = FontWeight.Bold,
                        fontSize = 14.sp,
                        color = Color(0xFF0F172A)
                    )
                    if (docItem.practicingClinics.isNotEmpty()) {
                        Text(
                            "Practicing Clinics:",
                            fontWeight = FontWeight.Bold,
                            fontSize = 13.sp,
                            color = Color(0xFF0F172A)
                        )
                        docItem.practicingClinics.forEach { c ->
                            Text(
                                "\u2022 ${c.name} (${c.addressText ?: "Nepal"})",
                                fontSize = 12.5.sp,
                                color = Color(0xFF475569)
                            )
                        }
                    }
                }
            },
            confirmButton = {
                if (docItem.practicingClinics.isNotEmpty()) {
                    val (isAvailOnDate, _) = getDoctorAvailabilityInfo(docItem)
                    Button(
                        onClick = {
                            selectedDoctorForProfileView = null
                            selectedDoctorForClinicPicker = Pair(docItem, targetDateStr)
                        },
                        colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF00796B))
                    ) {
                        Text("Select Clinic & Book", fontWeight = FontWeight.Bold)
                    }
                }
            },
            dismissButton = {
                TextButton(onClick = { selectedDoctorForProfileView = null }) {
                    Text("Back to Search")
                }
            }
        )
    }

    // ── TAP "SELECT CLINIC & BOOK": Continue into normal booking flow carrying the chosen date ──
    if (selectedDoctorForClinicPicker != null) {
        val (docItem, bookingDateStr) = selectedDoctorForClinicPicker!!
        val doctor = docItem.doctor

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
                        text = "Dr. ${doctor.fullName} \u2022 Date: $bookingDateStr",
                        fontSize = 13.sp,
                        fontWeight = FontWeight.SemiBold,
                        color = Color(0xFF00796B)
                    )
                }
            },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Text(
                        text = "Choose the clinic to continue booking for $bookingDateStr:",
                        fontSize = 12.sp,
                        color = Color(0xFF64748B)
                    )

                    LazyColumn(
                        modifier = Modifier.heightIn(max = 320.dp),
                        verticalArrangement = Arrangement.spacedBy(10.dp)
                    ) {
                        items(docItem.practicingClinics, key = { it.id }) { clinic ->
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
                                            date = bookingDateStr
                                        )
                                        if (isDemo) {
                                            sessionManager?.savePendingBookingRedirect(
                                                route = targetRoute,
                                                clinicId = clinic.id,
                                                doctorId = doctor.id,
                                                selectedDate = bookingDateStr
                                            )
                                            android.widget.Toast.makeText(context, "Please sign in with Google to book an appointment", android.widget.Toast.LENGTH_SHORT).show()
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
                                            text = clinic.addressText ?: "Nepal",
                                            fontSize = 12.sp,
                                            color = Color(0xFF64748B),
                                            maxLines = 1,
                                            overflow = TextOverflow.Ellipsis
                                        )
                                        Text(
                                            text = "Fee: ${CurrencyFormatter.formatNPR(doctor.consultationFee ?: 500.0)}",
                                            fontSize = 11.sp,
                                            fontWeight = FontWeight.Bold,
                                            color = Color(0xFF00796B)
                                        )
                                    }

                                    Button(
                                        onClick = {
                                            selectedDoctorForClinicPicker = null
                                            val isDemo = sessionManager?.isGuestMode() == true || sessionManager?.isLoggedIn() != true
                                            val targetRoute = NavRoutes.Booking.createRoute(
                                                clinicId = clinic.id,
                                                doctorId = doctor.id,
                                                date = bookingDateStr
                                            )
                                            if (isDemo) {
                                                sessionManager?.savePendingBookingRedirect(
                                                    route = targetRoute,
                                                    clinicId = clinic.id,
                                                    doctorId = doctor.id,
                                                    selectedDate = bookingDateStr
                                                )
                                                android.widget.Toast.makeText(context, "Please sign in with Google to book an appointment", android.widget.Toast.LENGTH_SHORT).show()
                                                navController.navigate(NavRoutes.Login.route)
                                            } else {
                                                navController.navigate(targetRoute)
                                            }
                                        },
                                        shape = RoundedCornerShape(10.dp),
                                        colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF00796B)),
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
            },
            confirmButton = {
                TextButton(onClick = { selectedDoctorForClinicPicker = null }) {
                    Text("Close")
                }
            }
        )
    }
}

/**
 * 5. Result Card for Doctors \u2014 Same card as Home, with one addition:
 * - If the doctor is available on the selected date, show the Book button.
 * - If not, show "Next available: Thu 15 Oct" with the Book button to avoid dead ends.
 */
@Composable
private fun SearchDoctorResultCard(
    docItem: DoctorHomeItem,
    matchResult: SearchMatchResult,
    query: String,
    isAvailableOnSelectedDate: Boolean,
    nextAvailableLabel: String,
    onCardClick: () -> Unit,
    onBookClick: () -> Unit
) {
    val doctor = docItem.doctor
    val clinicsForDoc = docItem.practicingClinics
    val primaryClinic = clinicsForDoc.firstOrNull()
    val allDocSpecs = remember(doctor) {
        (listOfNotNull(doctor.specialty?.takeIf { it.isNotBlank() }) + doctor.specialties).distinct()
            .ifEmpty { listOf("General Physician") }
    }

    Card(
        shape = RoundedCornerShape(18.dp),
        colors = CardDefaults.cardColors(containerColor = Color.White),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp),
        border = BorderStroke(1.dp, Color(0xFFE2E8F0)),
        modifier = Modifier
            .fillMaxWidth()
            .clickable { onCardClick() }
    ) {
        Column {
            val avatarUrl = doctor.resolvedProfilePictureUrl
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(124.dp)
                    .background(
                        Brush.horizontalGradient(
                            colors = listOf(Color(0xFFE0F2FE), Color(0xFFCCFBF1))
                        )
                    ),
                contentAlignment = Alignment.Center
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 18.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(14.dp)
                ) {
                    Surface(
                        shape = CircleShape,
                        color = Color.White,
                        border = BorderStroke(2.dp, Color(0xFF0891B2)),
                        modifier = Modifier.size(72.dp)
                    ) {
                        if (!avatarUrl.isNullOrBlank()) {
                            AsyncImage(
                                model = avatarUrl,
                                contentDescription = doctor.fullName,
                                contentScale = ContentScale.Crop,
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
                                    fontSize = 22.sp,
                                    fontWeight = FontWeight.ExtraBold,
                                    color = Color(0xFF0891B2)
                                )
                            }
                        }
                    }

                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            text = "Dr. ${doctor.fullName}",
                            fontWeight = FontWeight.ExtraBold,
                            fontSize = 18.sp,
                            color = Color(0xFF0F172A)
                        )
                        Text(
                            text = allDocSpecs.first(),
                            fontWeight = FontWeight.SemiBold,
                            fontSize = 13.sp,
                            color = Color(0xFF00796B)
                        )
                        if (!doctor.education.isNullOrBlank()) {
                            Text(
                                text = doctor.education,
                                fontSize = 11.sp,
                                color = Color(0xFF475569),
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis
                            )
                        }
                    }
                }

                // Availability Badge on top right
                Surface(
                    color = if (isAvailableOnSelectedDate) Color(0xFFDCFCE7) else Color(0xFFFEF3C7),
                    shape = RoundedCornerShape(8.dp),
                    modifier = Modifier
                        .align(Alignment.TopEnd)
                        .padding(10.dp)
                ) {
                    Text(
                        text = if (isAvailableOnSelectedDate) "Available" else nextAvailableLabel,
                        color = if (isAvailableOnSelectedDate) Color(0xFF15803D) else Color(0xFFB45309),
                        fontWeight = FontWeight.Bold,
                        fontSize = 10.sp,
                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
                    )
                }
            }

            Column(
                modifier = Modifier.padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                if (query.isNotBlank() && matchResult.matchHighlightReason != null) {
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

                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    Icon(
                        imageVector = if (clinicsForDoc.isEmpty()) Icons.Default.DomainDisabled else Icons.Default.LocalHospital,
                        contentDescription = null,
                        tint = if (clinicsForDoc.isEmpty()) Color(0xFF94A3B8) else Color(0xFF0891B2),
                        modifier = Modifier.size(15.dp)
                    )
                    Text(
                        text = when {
                            clinicsForDoc.isEmpty() -> "Not affiliated"
                            clinicsForDoc.size > 1 -> "Available at ${clinicsForDoc.size} clinics (${primaryClinic?.name ?: ""} & more)"
                            else -> "Practices at ${primaryClinic?.name ?: "Partner Clinic"} \u2022 ${primaryClinic?.addressText ?: "Nepal"}"
                        },
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Medium,
                        color = if (clinicsForDoc.isEmpty()) Color(0xFF64748B) else Color(0xFF475569),
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                }

                // If not available on the selected date, prominently show "Next available: Thu 15 Oct" above/beside Book button
                if (!isAvailableOnSelectedDate && clinicsForDoc.isNotEmpty()) {
                    Surface(
                        shape = RoundedCornerShape(8.dp),
                        color = Color(0xFFFFFBEB),
                        border = BorderStroke(1.dp, Color(0xFFFDE68A)),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Row(
                            modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(6.dp)
                        ) {
                            Icon(
                                imageVector = Icons.Default.EventAvailable,
                                contentDescription = null,
                                tint = Color(0xFFD97706),
                                modifier = Modifier.size(15.dp)
                            )
                            Text(
                                text = nextAvailableLabel,
                                fontSize = 12.sp,
                                fontWeight = FontWeight.Bold,
                                color = Color(0xFF92400E)
                            )
                        }
                    }
                }

                HorizontalDivider(color = Color(0xFFF1F5F9), modifier = Modifier.padding(vertical = 2.dp))

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Column {
                        Text(
                            text = "Consultation Fee",
                            fontSize = 11.sp,
                            color = Color(0xFF64748B)
                        )
                        Text(
                            text = CurrencyFormatter.formatNPR(doctor.consultationFee ?: 500.0),
                            fontSize = 15.sp,
                            fontWeight = FontWeight.ExtraBold,
                            color = Color(0xFF0F172A)
                        )
                    }

                    if (clinicsForDoc.isNotEmpty()) {
                        Button(
                            onClick = onBookClick,
                            shape = RoundedCornerShape(12.dp),
                            colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF00796B)),
                            modifier = Modifier.height(42.dp)
                        ) {
                            Icon(Icons.Default.Storefront, contentDescription = null, modifier = Modifier.size(16.dp))
                            Spacer(Modifier.width(6.dp))
                            Text(
                                text = "Select Clinic & Book",
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

/**
 * 5. Result Card for Clinics \u2014 Same card as Home
 */
@Composable
private fun SearchClinicResultCard(
    item: ClinicHomeItem,
    matchResult: SearchMatchResult,
    query: String,
    nextAvailableDate: String? = null,
    onCardClick: () -> Unit,
    onBookClick: () -> Unit,
    onCallClick: (String) -> Unit
) {
    val clinic = item.clinic
    val primaryDoctor = matchResult.matchedDoctors.firstOrNull() ?: item.doctors.firstOrNull()
    val queueCount = item.availableSlots.sumOf { it.bookedCount }

    Card(
        shape = RoundedCornerShape(18.dp),
        colors = CardDefaults.cardColors(containerColor = Color.White),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp),
        border = BorderStroke(1.dp, Color(0xFFE2E8F0)),
        modifier = Modifier
            .fillMaxWidth()
            .clickable { onCardClick() }
    ) {
        Column {
            val firstPic = clinic.pictures.firstOrNull() ?: clinic.logoUrl
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(130.dp)
                    .background(Color(0xFFE6F4F1)),
                contentAlignment = Alignment.Center
            ) {
                if (!firstPic.isNullOrBlank()) {
                    AsyncImage(
                        model = firstPic,
                        contentDescription = clinic.name,
                        contentScale = ContentScale.Crop,
                        modifier = Modifier.fillMaxSize()
                    )
                } else {
                    Icon(
                        imageVector = Icons.Default.LocalHospital,
                        contentDescription = null,
                        tint = Color(0xFF00796B),
                        modifier = Modifier.size(42.dp)
                    )
                }
            }

            Column(
                modifier = Modifier.padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                if (query.isNotBlank() && matchResult.matchHighlightReason != null) {
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
                            Icon(Icons.Default.Verified, contentDescription = null, tint = Color(0xFF1D4ED8), modifier = Modifier.size(14.dp))
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

                Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                    Text(
                        text = clinic.name,
                        fontWeight = FontWeight.Bold,
                        fontSize = 17.sp,
                        color = Color(0xFF0F172A)
                    )
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(4.dp)
                    ) {
                        Icon(Icons.Default.LocationOn, contentDescription = null, tint = Color(0xFF0891B2), modifier = Modifier.size(14.dp))
                        Text(
                            text = clinic.addressText ?: "Nepal",
                            fontSize = 12.sp,
                            color = Color(0xFF64748B)
                        )
                    }
                }

                if (primaryDoctor != null) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(10.dp),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Surface(
                            shape = CircleShape,
                            color = Color(0xFF0891B2).copy(alpha = 0.15f),
                            modifier = Modifier.size(36.dp)
                        ) {
                            Box(contentAlignment = Alignment.Center) {
                                Text(
                                    text = primaryDoctor.fullName.take(2).uppercase(),
                                    fontSize = 12.sp,
                                    fontWeight = FontWeight.Bold,
                                    color = Color(0xFF0891B2)
                                )
                            }
                        }
                        Column(modifier = Modifier.weight(1f)) {
                            Text(
                                text = "Dr. ${primaryDoctor.fullName.removePrefix("Dr.").trim()}",
                                fontWeight = FontWeight.SemiBold,
                                fontSize = 13.sp,
                                color = Color(0xFF0F172A)
                            )
                            Text(
                                text = primaryDoctor.specialty ?: "General Physician",
                                fontSize = 11.sp,
                                color = Color(0xFF64748B)
                            )
                        }
                        Text(
                            text = "$queueCount in queue",
                            fontSize = 11.5.sp,
                            fontWeight = FontWeight.SemiBold,
                            color = Color(0xFF0891B2)
                        )
                    }
                }

                val hasAvailableSlotsOnDate = item.availableSlots.any { slot ->
                    slot.isPublished && (slot.maxCapacity - slot.bookedCount) > 0
                }

                // Small text just above book button
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(5.dp),
                    modifier = Modifier.padding(bottom = 4.dp)
                ) {
                    Box(
                        modifier = Modifier
                            .size(6.dp)
                            .background(
                                if (hasAvailableSlotsOnDate) Color(0xFF10B981) else Color(0xFFF59E0B),
                                CircleShape
                            )
                    )
                    Text(
                        text = if (hasAvailableSlotsOnDate) {
                            "Available today"
                        } else {
                            SlotRepository.formatNextAvailableDate(nextAvailableDate)
                        },
                        fontSize = 11.5.sp,
                        fontWeight = FontWeight.SemiBold,
                        color = if (hasAvailableSlotsOnDate) Color(0xFF15803D) else Color(0xFFB45309)
                    )
                }

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    OutlinedButton(
                        onClick = { onCallClick(clinic.contactPhone.orEmpty()) },
                        shape = RoundedCornerShape(12.dp),
                        border = BorderStroke(1.dp, Color(0xFF0891B2)),
                        colors = ButtonDefaults.outlinedButtonColors(contentColor = Color(0xFF0891B2)),
                        modifier = Modifier
                            .weight(1f)
                            .height(42.dp)
                    ) {
                        Icon(Icons.Default.Phone, contentDescription = null, modifier = Modifier.size(15.dp))
                        Spacer(Modifier.width(6.dp))
                        Text("Call", fontWeight = FontWeight.Bold, fontSize = 13.sp)
                    }

                    Button(
                        onClick = onBookClick,
                        shape = RoundedCornerShape(12.dp),
                        colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF0891B2)),
                        modifier = Modifier
                            .weight(1f)
                            .height(42.dp)
                    ) {
                        Text(
                            text = "Book",
                            fontWeight = FontWeight.Bold,
                            fontSize = 13.sp
                        )
                        Spacer(Modifier.width(4.dp))
                        Icon(Icons.AutoMirrored.Filled.ArrowForward, contentDescription = null, modifier = Modifier.size(15.dp))
                    }
                }
            }
        }
    }
}
