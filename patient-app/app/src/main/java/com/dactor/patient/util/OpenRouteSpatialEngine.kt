package com.dactor.patient.util

import com.dactor.patient.data.model.Clinic
import com.dactor.patient.data.model.ClinicService
import com.dactor.patient.data.model.Doctor
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL
import java.util.Locale
import java.util.concurrent.ConcurrentHashMap
import kotlin.math.*

/**
 * Cached road-network routing metrics from OpenRouteService (ORS) Matrix API
 * (`/v2/matrix/driving-car`) with instant Haversine fallback.
 */
data class OrsRouteMetrics(
    val distanceKm: Double,
    val durationMinutes: Int,
    val isRoadNetworkExact: Boolean
)

/**
 * Pre-computed lowercase search index for a Clinic and its roster/services
 * to avoid repeated string allocations and lowercasing on the UI thread during typing.
 */
data class PreIndexedClinicCorpus(
    val clinicId: String,
    val nameLower: String,
    val addressLower: String,
    val typeLower: String,
    val descLower: String,
    val specialtiesJoinedLower: String,
    val servicesJoinedLower: String,
    val doctorsJoinedLower: String,
    val combinedCorpus: String
) {
    operator fun contains(token: String): Boolean = combinedCorpus.contains(token)
}

/**
 * Pre-computed lowercase search index for a Doctor and their practicing clinics.
 */
data class PreIndexedDoctorCorpus(
    val doctorId: String,
    val nameLower: String,
    val specLower: String,
    val allSpecsLower: String,
    val bioLower: String,
    val eduLower: String,
    val clinicsJoinedLower: String,
    val combinedCorpus: String
) {
    operator fun contains(token: String): Boolean = combinedCorpus.contains(token)
}

/**
 * Two-Phase Zero-Lag Spatial & OpenRouteService (ORS) Search/Routing Engine:
 *
 * Phase 1 (0ms Instant Client-Side):
 * - Fast bounding-box degree filter + Haversine distance calculation so clinic/doctor
 *   lists render, filter, and sort in < 1ms without waiting on network I/O.
 * - Pre-indexed search corpus memoization for O(1) token matching while typing.
 *
 * Phase 2 (Asynchronous OpenRouteService Matrix Hydration):
 * - Batches uncached clinic coordinates into a single `POST https://api.openrouteservice.org/v2/matrix/driving-car`
 *   call (GeoJSON `[longitude, latitude]` order), memoizes results in a ~110m spatial grid cache,
 *   and increments [routeCacheVersion] so Compose UI updates road distances & drive times smoothly in-place.
 */
object OpenRouteSpatialEngine {

    // Spatial Grid Memoization Cache: key = "${round3(userLat)},${round3(userLng)}->${clinicId}"
    private val orsRouteCache = ConcurrentHashMap<String, OrsRouteMetrics>()

    // Pre-computed search corpus caches
    private val clinicCorpusCache = ConcurrentHashMap<String, PreIndexedClinicCorpus>()
    private val doctorCorpusCache = ConcurrentHashMap<String, PreIndexedDoctorCorpus>()

    // Emits an incremented version whenever background OpenRouteService matrix results arrive
    private val _routeCacheVersion = MutableStateFlow(0)
    val routeCacheVersion: StateFlow<Int> = _routeCacheVersion.asStateFlow()

    // Optional OpenRouteService API key (can be configured at runtime or via BuildConfig/Supabase)
    @Volatile
    var openRouteServiceApiKey: String = ""

    @Volatile
    var lastKnownUserLat: Double? = null

    @Volatile
    var lastKnownUserLng: Double? = null

    private fun spatialGridKey(userLat: Double, userLng: Double, clinicId: String): String {
        val hash = GeoHashUtils.encode(userLat, userLng, 7)
        return "$hash->$clinicId"
    }

    /**
     * Ultra-fast bounding box check (avoids trig operations for distant clinics).
     */
    fun isWithinBoundingBox(
        lat1: Double,
        lon1: Double,
        lat2: Double,
        lon2: Double,
        maxRadiusKm: Double
    ): Boolean {
        val maxDegLat = maxRadiusKm / 111.0
        if (abs(lat1 - lat2) > maxDegLat) return false
        val maxDegLon = maxRadiusKm / (111.0 * cos(Math.toRadians(lat1)).coerceAtLeast(0.2))
        return abs(lon1 - lon2) <= maxDegLon
    }

    /**
     * Fast Haversine distance in kilometers.
     */
    fun haversineKm(lat1: Double, lon1: Double, lat2: Double, lon2: Double): Double {
        val r = 6371.0
        val dLat = Math.toRadians(lat2 - lat1)
        val dLon = Math.toRadians(lon2 - lon1)
        val a = sin(dLat / 2) * sin(dLat / 2) +
                cos(Math.toRadians(lat1)) * cos(Math.toRadians(lat2)) *
                sin(dLon / 2) * sin(dLon / 2)
        val c = 2 * atan2(sqrt(a), sqrt(1 - a))
        return r * c
    }

    /**
     * Phase 1 + Phase 2 unified distance getter:
     * Returns exact OpenRouteService road distance if cached for the user's current ~110m grid cell,
     * or immediate Haversine distance in 0ms.
     */
    fun getEffectiveDistanceKm(userLat: Double?, userLng: Double?, clinic: Clinic): Double? {
        if (userLat == null || userLng == null) return null
        val cLat = clinic.latitude ?: return null
        val cLng = clinic.longitude ?: return null
        val key = spatialGridKey(userLat, userLng, clinic.id)
        orsRouteCache[key]?.let { return it.distanceKm }
        return haversineKm(userLat, userLng, cLat, cLng)
    }

    /**
     * Returns full routing metrics (road distance km + driving duration minutes).
     */
    fun getRouteMetrics(userLat: Double, userLng: Double, clinic: Clinic): OrsRouteMetrics? {
        val cLat = clinic.latitude ?: return null
        val cLng = clinic.longitude ?: return null
        val key = spatialGridKey(userLat, userLng, clinic.id)
        orsRouteCache[key]?.let { return it }

        val straightKm = haversineKm(userLat, userLng, cLat, cLng)
        val estRoadKm = straightKm * 1.25
        val estMinutes = ((estRoadKm / 26.0) * 60.0).roundToInt().coerceAtLeast(2)
        return OrsRouteMetrics(
            distanceKm = straightKm,
            durationMinutes = estMinutes,
            isRoadNetworkExact = false
        )
    }

    /**
     * Formats distance & travel time for display on clinic cards.
     */
    fun formatDistanceBadge(userLat: Double?, userLng: Double?, clinic: Clinic): String? {
        if (userLat == null || userLng == null) return null
        val metrics = getRouteMetrics(userLat, userLng, clinic) ?: return null
        val distStr = String.format(Locale.US, "%.1f km", metrics.distanceKm)
        return if (metrics.isRoadNetworkExact) {
            "$distStr • ${metrics.durationMinutes} min drive"
        } else {
            "$distStr away"
        }
    }

    /**
     * Phase 2: Asynchronous OpenRouteService Matrix API (`/v2/matrix/driving-car`) batch enrichment.
     * Never blocks the UI thread. When road-network distances & durations arrive, updates [orsRouteCache]
     * and increments [routeCacheVersion] so Compose recomposes smoothly.
     */
    suspend fun enrichWithOpenRouteServiceMatrix(
        userLat: Double?,
        userLng: Double?,
        clinics: List<Clinic>,
        apiKeyOverride: String? = null
    ) = withContext(Dispatchers.IO) {
        if (userLat == null || userLng == null || clinics.isEmpty()) return@withContext
        val apiKey = (apiKeyOverride ?: openRouteServiceApiKey).trim()

        // Filter top 40 clinics within 60km bounding box that aren't yet cached
        val uncachedCandidates = clinics.filter { c ->
            val cLat = c.latitude
            val cLng = c.longitude
            cLat != null && cLng != null &&
                isWithinBoundingBox(userLat, userLng, cLat, cLng, 60.0) &&
                !orsRouteCache.containsKey(spatialGridKey(userLat, userLng, c.id))
        }.sortedBy { c ->
            haversineKm(userLat, userLng, c.latitude!!, c.longitude!!)
        }.take(40)

        if (uncachedCandidates.isEmpty()) return@withContext

        // If an OpenRouteService API key is configured, query POST /v2/matrix/driving-car
        if (apiKey.isNotBlank()) {
            try {
                val locationsArray = JSONArray()
                // Source 0: User location in GeoJSON [longitude, latitude] order
                locationsArray.put(JSONArray().put(userLng).put(userLat))

                val destIndices = JSONArray()
                uncachedCandidates.forEachIndexed { idx, clinic ->
                    locationsArray.put(JSONArray().put(clinic.longitude!!).put(clinic.latitude!!))
                    destIndices.put(idx + 1)
                }

                val payload = JSONObject().apply {
                    put("locations", locationsArray)
                    put("sources", JSONArray().put(0))
                    put("destinations", destIndices)
                    put("metrics", JSONArray().put("distance").put("duration"))
                    put("units", "km")
                }

                val url = URL("https://api.openrouteservice.org/v2/matrix/driving-car")
                val conn = (url.openConnection() as HttpURLConnection).apply {
                    requestMethod = "POST"
                    connectTimeout = 5000
                    readTimeout = 5000
                    doOutput = true
                    setRequestProperty("Authorization", apiKey)
                    setRequestProperty("Content-Type", "application/json; charset=utf-8")
                    setRequestProperty("Accept", "application/json, application/geo+json; charset=utf-8")
                }

                OutputStreamWriter(conn.outputStream, Charsets.UTF_8).use { writer ->
                    writer.write(payload.toString())
                    writer.flush()
                }

                if (conn.responseCode in 200..299) {
                    val responseText = conn.inputStream.bufferedReader(Charsets.UTF_8).use { it.readText() }
                    val json = JSONObject(responseText)
                    val distancesRow = json.optJSONArray("distances")?.optJSONArray(0)
                    val durationsRow = json.optJSONArray("durations")?.optJSONArray(0)

                    var updatedAny = false
                    uncachedCandidates.forEachIndexed { idx, clinic ->
                        val distKm = distancesRow?.optDouble(idx, Double.NaN) ?: Double.NaN
                        val durSec = durationsRow?.optDouble(idx, Double.NaN) ?: Double.NaN
                        if (!distKm.isNaN() && distKm > 0.0) {
                            val mins = if (!durSec.isNaN() && durSec > 0.0) {
                                (durSec / 60.0).roundToInt().coerceAtLeast(1)
                            } else {
                                ((distKm / 26.0) * 60.0).roundToInt().coerceAtLeast(1)
                            }
                            orsRouteCache[spatialGridKey(userLat, userLng, clinic.id)] = OrsRouteMetrics(
                                distanceKm = distKm,
                                durationMinutes = mins,
                                isRoadNetworkExact = true
                            )
                            updatedAny = true
                        }
                    }

                    if (updatedAny) {
                        _routeCacheVersion.value += 1
                    }
                }
                conn.disconnect()
            } catch (e: Exception) {
                // Silent fallback to Phase 1 Haversine metrics so UI never errors or lags
            }
        }
    }

    /**
     * Pre-indexes a clinic, its doctors, and its services once when loaded so search filtering
     * runs in O(1) memory lookups without per-keystroke string allocations.
     */
    fun indexClinic(
        clinic: Clinic,
        doctors: List<Doctor>,
        services: List<ClinicService>
    ): PreIndexedClinicCorpus {
        val nameLower = clinic.name.lowercase(Locale.ROOT)
        val addressLower = (clinic.addressText ?: "").lowercase(Locale.ROOT)
        val typeLower = (clinic.type ?: "").lowercase(Locale.ROOT)
        val descLower = (clinic.description ?: "").lowercase(Locale.ROOT)
        val specsLower = clinic.specialties.joinToString(" ") { it.lowercase(Locale.ROOT) }
        val srvsLower = services.joinToString(" ") { it.serviceName.lowercase(Locale.ROOT) }
        val docsLower = doctors.joinToString(" ") { d ->
            "${d.fullName} ${d.specialty ?: ""} ${d.specialties.joinToString(" ")} ${d.education ?: ""} ${d.bio ?: ""}".lowercase(Locale.ROOT)
        }
        val combined = "$nameLower $addressLower $typeLower $descLower $specsLower $srvsLower $docsLower"
        val corpus = PreIndexedClinicCorpus(
            clinicId = clinic.id,
            nameLower = nameLower,
            addressLower = addressLower,
            typeLower = typeLower,
            descLower = descLower,
            specialtiesJoinedLower = specsLower,
            servicesJoinedLower = srvsLower,
            doctorsJoinedLower = docsLower,
            combinedCorpus = combined
        )
        clinicCorpusCache[clinic.id] = corpus
        return corpus
    }

    fun getClinicCorpus(clinic: Clinic, doctors: List<Doctor>, services: List<ClinicService>): PreIndexedClinicCorpus {
        return clinicCorpusCache[clinic.id] ?: indexClinic(clinic, doctors, services)
    }

    /**
     * Pre-indexes a doctor and their practicing clinics once when loaded.
     */
    fun indexDoctor(doctor: Doctor, clinics: List<Clinic> = emptyList()): PreIndexedDoctorCorpus {
        val nameLower = doctor.fullName.lowercase(Locale.ROOT)
        val specLower = (doctor.specialty ?: "").lowercase(Locale.ROOT)
        val allSpecsLower = (listOf(specLower) + doctor.specialties.map { it.lowercase(Locale.ROOT) }).joinToString(" ")
        val bioLower = (doctor.bio ?: "").lowercase(Locale.ROOT)
        val eduLower = (doctor.education ?: "").lowercase(Locale.ROOT)
        val clinicsLower = clinics.joinToString(" ") { c ->
            "${c.name} ${c.addressText ?: ""} ${c.specialties.joinToString(" ")}".lowercase(Locale.ROOT)
        }
        val combined = "$nameLower $allSpecsLower $bioLower $eduLower $clinicsLower"
        val corpus = PreIndexedDoctorCorpus(
            doctorId = doctor.id,
            nameLower = nameLower,
            specLower = specLower,
            allSpecsLower = allSpecsLower,
            bioLower = bioLower,
            eduLower = eduLower,
            clinicsJoinedLower = clinicsLower,
            combinedCorpus = combined
        )
        doctorCorpusCache[doctor.id] = corpus
        return corpus
    }

    fun getDoctorCorpus(doctor: Doctor, clinics: List<Clinic> = emptyList()): PreIndexedDoctorCorpus {
        return doctorCorpusCache[doctor.id] ?: indexDoctor(doctor, clinics)
    }
}
