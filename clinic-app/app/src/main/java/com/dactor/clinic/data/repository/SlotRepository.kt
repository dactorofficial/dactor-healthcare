package com.dactor.clinic.data.repository

import android.content.Context
import com.dactor.clinic.data.model.Slot
import dagger.hilt.android.qualifiers.ApplicationContext
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.postgrest.postgrest
import io.github.jan.supabase.postgrest.query.Columns
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.withContext
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.Json
import java.time.Instant
import java.time.LocalDate
import java.util.concurrent.ConcurrentHashMap
import javax.inject.Inject
import javax.inject.Singleton

@Serializable
private data class SlotApptCountDto(
    @SerialName("id") val id: String,
    @SerialName("slot_id") val slotId: String? = null,
    @SerialName("checkin_status") val checkinStatus: String? = null,
    @SerialName("payment_mode") val paymentMode: String? = null,
    @SerialName("status") val status: String = ""
)

@Serializable
private data class SlotMetaFingerprintDto(
    @SerialName("id") val id: String,
    @SerialName("slot_date") val slotDate: String = "",
    @SerialName("start_time") val startTime: String = "",
    @SerialName("end_time") val endTime: String = "",
    @SerialName("booked_count") val bookedCount: Int = 0,
    @SerialName("max_capacity") val maxCapacity: Int = 0,
    @SerialName("is_published") val isPublished: Boolean = false,
    @SerialName("updated_at") val updatedAt: String? = null
)

@Serializable
private data class SlotIdDateRefDto(
    @SerialName("id") val id: String,
    @SerialName("slot_date") val slotDate: String = ""
)

@Serializable
private data class SlotInsertDto(
    @SerialName("id") val id: String,
    @SerialName("clinic_id") val clinicId: String,
    @SerialName("doctor_id") val doctorId: String? = null,
    @SerialName("slot_date") val slotDate: String,
    @SerialName("start_time") val startTime: String,
    @SerialName("end_time") val endTime: String,
    @SerialName("max_capacity") val maxCapacity: Int,
    @SerialName("booked_count") val bookedCount: Int = 0,
    @SerialName("is_published") val isPublished: Boolean = true,
    @SerialName("updated_at") val updatedAt: String? = null
)

@Singleton
open class SlotRepository @Inject constructor(
    private val supabaseClient: SupabaseClient,
    @ApplicationContext private val context: Context? = null
) {
    private val cacheJson = Json {
        ignoreUnknownKeys = true
        isLenient = true
        encodeDefaults = true
        coerceInputValues = true
    }
    private val prefs by lazy {
        try {
            context?.getSharedPreferences("dactor_slot_persistent_cache", Context.MODE_PRIVATE)
        } catch (_: Exception) {
            null
        }
    }

    private val slotsByClinicDateCache = ConcurrentHashMap<String, List<Slot>>()
    private val clinicAllSlotsCache = ConcurrentHashMap<String, List<Slot>>()
    private val lastClinicSyncWatermark = ConcurrentHashMap<String, String>()

    private fun dateCacheKey(clinicId: String, date: String): String = "$clinicId|$date"

    private fun computeMaxWatermark(slots: List<Slot>): String? {
        return slots.mapNotNull { it.updatedAt?.takeIf { u -> u.isNotBlank() } ?: it.createdAt?.takeIf { c -> c.isNotBlank() } }
            .maxOrNull()
    }

    private fun persistClinicSlotsToPrefs(clinicId: String, allSlots: List<Slot>, watermark: String? = null) {
        if (clinicId.isBlank()) return
        try {
            val cutoff = try { LocalDate.now().minusDays(31).toString() } catch (_: Exception) { "" }
            val bounded = if (cutoff.isNotBlank()) allSlots.filter { it.slotDate >= cutoff } else allSlots
            val serialized = cacheJson.encodeToString(ListSerializer(Slot.serializer()), bounded)
            val editor = prefs?.edit() ?: return
            editor.putString("slots_clinic_$clinicId", serialized)
            val resolvedWatermark = watermark ?: computeMaxWatermark(bounded) ?: lastClinicSyncWatermark[clinicId]
            if (!resolvedWatermark.isNullOrBlank()) {
                lastClinicSyncWatermark[clinicId] = resolvedWatermark
                editor.putString("slots_sync_at_$clinicId", resolvedWatermark)
            }
            editor.apply()
        } catch (_: Exception) {}
    }

    private fun loadClinicSlotsFromPrefs(clinicId: String): List<Slot> {
        if (clinicId.isBlank()) return emptyList()
        return try {
            val savedWatermark = prefs?.getString("slots_sync_at_$clinicId", null)
            if (!savedWatermark.isNullOrBlank()) {
                lastClinicSyncWatermark.putIfAbsent(clinicId, savedWatermark)
            }
            val raw = prefs?.getString("slots_clinic_$clinicId", null) ?: return emptyList()
            val list = cacheJson.decodeFromString(ListSerializer(Slot.serializer()), raw)
            clinicAllSlotsCache[clinicId] = list
            list.groupBy { it.slotDate }.forEach { (d, dayList) ->
                slotsByClinicDateCache.putIfAbsent(dateCacheKey(clinicId, d), dayList.sortedBy { it.startTime })
            }
            list
        } catch (_: Exception) {
            emptyList()
        }
    }

    private fun mergeClinicAndDateCache(clinicId: String, date: String?, dateSlots: List<Slot>?, fullClinicList: List<Slot>? = null) {
        if (clinicId.isBlank()) return
        if (fullClinicList != null) {
            val existingDateMap = slotsByClinicDateCache.filterKeys { it.startsWith("$clinicId|") }
            val enriched = fullClinicList.map { remote ->
                val dateKey = dateCacheKey(clinicId, remote.slotDate)
                val cachedMatch = existingDateMap[dateKey]?.find { it.id == remote.id }
                if (cachedMatch != null && cachedMatch.bookedCount == remote.bookedCount && remote.waitingCount == 0 && cachedMatch.waitingCount > 0) {
                    remote.copy(waitingCount = cachedMatch.waitingCount)
                } else {
                    remote
                }
            }
            clinicAllSlotsCache[clinicId] = enriched
            enriched.groupBy { it.slotDate }.forEach { (d, list) ->
                slotsByClinicDateCache[dateCacheKey(clinicId, d)] = list.sortedBy { it.startTime }
            }
            persistClinicSlotsToPrefs(clinicId, enriched)
            return
        }

        if (date != null && dateSlots != null) {
            val sorted = dateSlots.sortedBy { it.startTime }
            slotsByClinicDateCache[dateCacheKey(clinicId, date)] = sorted
            val existingAll = clinicAllSlotsCache[clinicId] ?: loadClinicSlotsFromPrefs(clinicId)
            val updatedAll = (existingAll.filterNot { it.slotDate == date } + sorted)
                .sortedWith(compareBy<Slot> { it.slotDate }.thenBy { it.startTime })
            clinicAllSlotsCache[clinicId] = updatedAll
            persistClinicSlotsToPrefs(clinicId, updatedAll)
        }
    }

    private fun upsertSlotIntoCache(slot: Slot) {
        if (slot.clinicId.isBlank()) return
        val key = dateCacheKey(slot.clinicId, slot.slotDate)
        val currentDateList = getCachedSlots(slot.clinicId, slot.slotDate)
        val nextDateList = (currentDateList.filterNot { it.id == slot.id } + slot).sortedBy { it.startTime }
        slotsByClinicDateCache[key] = nextDateList

        val currentAll = getCachedSlotsForClinic(slot.clinicId)
        val nextAll = (currentAll.filterNot { it.id == slot.id } + slot)
            .sortedWith(compareBy<Slot> { it.slotDate }.thenBy { it.startTime })
        clinicAllSlotsCache[slot.clinicId] = nextAll
        persistClinicSlotsToPrefs(slot.clinicId, nextAll, slot.updatedAt ?: slot.createdAt)
    }

    private fun removeSlotFromCache(slotId: String) {
        if (slotId.isBlank()) return
        val affectedClinics = mutableSetOf<String>()
        slotsByClinicDateCache.keys.toList().forEach { key ->
            val list = slotsByClinicDateCache[key] ?: return@forEach
            if (list.any { it.id == slotId }) {
                slotsByClinicDateCache[key] = list.filterNot { it.id == slotId }
                affectedClinics.add(key.substringBefore("|"))
            }
        }
        clinicAllSlotsCache.keys.toList().forEach { cid ->
            val list = clinicAllSlotsCache[cid] ?: return@forEach
            if (list.any { it.id == slotId }) {
                val updated = list.filterNot { it.id == slotId }
                clinicAllSlotsCache[cid] = updated
                persistClinicSlotsToPrefs(cid, updated)
                affectedClinics.remove(cid)
            }
        }
        affectedClinics.forEach { cid ->
            val cached = clinicAllSlotsCache[cid] ?: loadClinicSlotsFromPrefs(cid)
            val updated = cached.filterNot { it.id == slotId }
            clinicAllSlotsCache[cid] = updated
            persistClinicSlotsToPrefs(cid, updated)
        }
    }

    open fun getCachedSlots(clinicId: String, date: String): List<Slot> {
        if (clinicId.isBlank() || date.isBlank()) return emptyList()
        val key = dateCacheKey(clinicId, date)
        slotsByClinicDateCache[key]?.let { return it }
        val inClinicMem = clinicAllSlotsCache[clinicId]?.filter { it.slotDate == date }?.sortedBy { it.startTime }
        if (inClinicMem != null) {
            slotsByClinicDateCache[key] = inClinicMem
            return inClinicMem
        }
        val fromPrefs = loadClinicSlotsFromPrefs(clinicId).filter { it.slotDate == date }.sortedBy { it.startTime }
        if (fromPrefs.isNotEmpty()) {
            slotsByClinicDateCache[key] = fromPrefs
        }
        return fromPrefs
    }

    open fun getCachedSlotsForClinic(clinicId: String): List<Slot> {
        if (clinicId.isBlank()) return emptyList()
        clinicAllSlotsCache[clinicId]?.let { return it }
        return loadClinicSlotsFromPrefs(clinicId)
    }

    fun clearCache() {
        slotsByClinicDateCache.clear()
        clinicAllSlotsCache.clear()
        lastClinicSyncWatermark.clear()
        try {
            prefs?.edit()?.clear()?.apply()
        } catch (_: Exception) {}
    }

    companion object {
        fun parseTimeToMinutes(raw: String): Int? {
            val clean = raw.trim().uppercase(java.util.Locale.US)
            if (clean.isBlank()) return null
            return try {
                val isPm = clean.contains("PM")
                val isAm = clean.contains("AM")
                val timePart = clean.replace("AM", "").replace("PM", "").trim()
                val match = Regex("""(\d{1,2})(?:[:.](\d{1,2}))?""").find(timePart) ?: return null
                var hour = match.groupValues[1].toInt()
                val minute = match.groupValues[2].takeIf { it.isNotBlank() }?.toInt() ?: 0

                if (isPm && hour < 12) hour += 12
                if (isAm && hour == 12) hour = 0

                // In medical clinic contexts, if AM/PM is omitted and hour is 1..6,
                // it represents afternoon hours (1:00 PM to 6:00 PM / 13:00 to 18:00)
                if (!isPm && !isAm && hour in 1..6) {
                    hour += 12
                }

                hour * 60 + minute
            } catch (e: Exception) {
                null
            }
        }

        /**
         * Checks whether the ending time of a slot/window is already over for [dateStr].
         * If the ending time has not passed yet, returns false (slot is still active & valid).
         * If the end time has passed (endMins <= nowMins) on today's date, or if dateStr is in the past,
         * this returns true so the expired slot option is removed from booking.
         */
        fun isSlotEndTimeOver(endTimeStr: String, dateStr: String, startTimeStr: String = ""): Boolean {
            return try {
                val today = java.time.LocalDate.now().toString()
                if (dateStr < today) return true
                if (dateStr > today) return false

                // Extract effective start & end strings, handling range strings like "12:00 - 1:00" or "12 to 1"
                var cleanEnd = endTimeStr.trim()
                var cleanStart = startTimeStr.trim()

                val rangePattern = Regex("""\s*(?:-|\u2013|\u2014|\bto\b)\s*""", RegexOption.IGNORE_CASE)

                if (cleanEnd.isBlank() && cleanStart.contains(rangePattern)) {
                    val parts = cleanStart.split(rangePattern)
                    if (parts.size >= 2) {
                        cleanStart = parts[0].trim()
                        cleanEnd = parts[1].trim()
                    }
                } else if (cleanEnd.contains(rangePattern)) {
                    val parts = cleanEnd.split(rangePattern)
                    if (parts.size >= 2) {
                        if (cleanStart.isBlank()) cleanStart = parts[0].trim()
                        cleanEnd = parts.last().trim()
                    }
                }

                val startMins = parseTimeToMinutes(cleanStart)
                var endMins = parseTimeToMinutes(cleanEnd)

                if (endMins == null) {
                    if (startMins != null) {
                        // If no end time is specified, default to 30 mins after start
                        endMins = startMins + 30
                    } else {
                        return false
                    }
                }

                if (startMins != null && endMins == startMins) {
                    endMins = startMins + 30
                }

                // Handle 12-hour rollover without AM/PM:
                // E.g. start at 12:00 (720m) and end at 1:00 (which if not converted would be 60m)
                // If endMins < startMins, check if adding 12 hours (720 mins) makes it a valid afternoon/evening slot
                if (endMins == 0 && (startMins == null || startMins > 0)) {
                    endMins = 24 * 60
                } else if (startMins != null && endMins < startMins) {
                    if (endMins + 720 > startMins && (endMins + 720 - startMins) <= 720) {
                        endMins += 720
                    } else {
                        endMins += 24 * 60
                    }
                }

                val now = java.time.LocalTime.now()
                val nowMins = now.hour * 60 + now.minute
                endMins <= nowMins
            } catch (e: Exception) {
                false
            }
        }
    }

    private suspend fun fetchMinimalSlotAppts(clinicId: String, date: String): List<SlotApptCountDto> {
        return try {
            supabaseClient.postgrest["appointments"]
                .select(Columns.list("id", "slot_id", "checkin_status", "payment_mode", "status")) {
                    filter {
                        eq("clinic_id", clinicId)
                        eq("appointment_date", date)
                    }
                }.decodeList<SlotApptCountDto>()
        } catch (_: Exception) {
            emptyList()
        }
    }

    private fun enrichSlotCounts(
        slots: List<Slot>,
        appointments: List<SlotApptCountDto>,
        syncBookedCountRemote: Boolean = false
    ): List<Slot> {
        return slots.map { slot ->
            val registeredCount = appointments.count {
                it.slotId == slot.id &&
                    it.checkinStatus != "cancelled" &&
                    !(it.paymentMode.equals("PAY_AT_DESK", ignoreCase = true) && it.status.equals("WAITING_FOR_APPROVAL", ignoreCase = true))
            }
            val waitingCount = appointments.count {
                val cStatus = it.checkinStatus?.lowercase()?.trim().orEmpty()
                val status = it.status.uppercase().trim()
                it.slotId == slot.id &&
                    cStatus !in listOf("completed", "done", "finished", "report_prepared", "results_ready", "cancelled", "no_show", "rejected") &&
                    status !in listOf("COMPLETED", "DONE", "FINISHED", "CANCELLED", "REJECTED", "EXPIRED", "UNAPPROVED", "PENDING_PAYMENT") &&
                    !(it.paymentMode.equals("PAY_AT_DESK", ignoreCase = true) && status == "WAITING_FOR_APPROVAL")
            }
            slot.copy(
                bookedCount = if (syncBookedCountRemote || appointments.isNotEmpty()) registeredCount else slot.bookedCount,
                waitingCount = waitingCount
            )
        }.sortedBy { it.startTime }
    }

    /**
     * Checks ONLY updated/new/deleted slots against local cache so switching dates or refreshing
     * does not reload unchanged slots or clinic history.
     */
    open suspend fun refreshUpdatedSlotsOnly(
        clinicId: String,
        date: String? = null
    ): List<Slot> = withContext(Dispatchers.IO) {
        if (clinicId.isBlank()) return@withContext emptyList()
        try {
            if (date != null) {
                val cached = getCachedSlots(clinicId, date)
                val hasClinicCache = clinicAllSlotsCache.containsKey(clinicId) ||
                    (prefs?.getString("slots_clinic_$clinicId", null) != null)
                if (cached.isEmpty() && !hasClinicCache) {
                    return@withContext getSlots(clinicId, date)
                }

                val remoteFingerprints = supabaseClient.postgrest["slots"]
                    .select(
                        Columns.list(
                            "id", "slot_date", "start_time", "end_time",
                            "booked_count", "max_capacity", "is_published", "updated_at"
                        )
                    ) {
                        filter {
                            eq("clinic_id", clinicId)
                            eq("slot_date", date)
                        }
                    }.decodeList<SlotMetaFingerprintDto>()

                val cachedById = cached.associateBy { it.id }
                val remoteIds = remoteFingerprints.map { it.id }.toSet()
                val deletedIds = cached.map { it.id }.filterNot { it in remoteIds }.toSet()

                val changedOrNewIds = remoteFingerprints.filter { fp ->
                    val old = cachedById[fp.id]
                    old == null ||
                        old.bookedCount != fp.bookedCount ||
                        old.maxCapacity != fp.maxCapacity ||
                        old.startTime != fp.startTime ||
                        old.endTime != fp.endTime ||
                        old.isPublished != fp.isPublished ||
                        (!fp.updatedAt.isNullOrBlank() && fp.updatedAt != old.updatedAt)
                }.map { it.id }

                if (changedOrNewIds.isEmpty() && deletedIds.isEmpty()) {
                    return@withContext cached
                }

                if (changedOrNewIds.isEmpty() && deletedIds.isNotEmpty()) {
                    val pruned = cached.filterNot { it.id in deletedIds }.sortedBy { it.startTime }
                    mergeClinicAndDateCache(clinicId, date, pruned)
                    return@withContext pruned
                }

                val (fetchedChanged, minimalAppts) = coroutineScope {
                    val slotsDeferred = async {
                        supabaseClient.postgrest["slots"]
                            .select {
                                filter {
                                    eq("clinic_id", clinicId)
                                    isIn("id", changedOrNewIds)
                                }
                            }.decodeList<Slot>()
                    }
                    val apptsDeferred = async { fetchMinimalSlotAppts(clinicId, date) }
                    slotsDeferred.await() to apptsDeferred.await()
                }

                val enrichedChanged = enrichSlotCounts(fetchedChanged, minimalAppts, syncBookedCountRemote = false)
                val changedMap = enrichedChanged.associateBy { it.id }
                val merged = (cached.filterNot { it.id in deletedIds || changedMap.containsKey(it.id) } + enrichedChanged)
                    .sortedBy { it.startTime }
                mergeClinicAndDateCache(clinicId, date, merged)
                return@withContext merged
            } else {
                val cachedAll = getCachedSlotsForClinic(clinicId)
                val sinceIso = lastClinicSyncWatermark[clinicId] ?: computeMaxWatermark(cachedAll)
                val cutoffDate = try { LocalDate.now().minusDays(31).toString() } catch (_: Exception) { "" }

                if (cachedAll.isEmpty() || sinceIso.isNullOrBlank()) {
                    val freshAll = supabaseClient.postgrest["slots"]
                        .select {
                            filter {
                                eq("clinic_id", clinicId)
                                if (cutoffDate.isNotBlank()) gte("slot_date", cutoffDate)
                            }
                        }.decodeList<Slot>()
                    mergeClinicAndDateCache(clinicId, null, null, freshAll)
                    return@withContext freshAll
                }

                val (deltaSlots, activeIdRefs) = coroutineScope {
                    val deltaDeferred = async {
                        supabaseClient.postgrest["slots"]
                            .select {
                                filter {
                                    eq("clinic_id", clinicId)
                                    if (cutoffDate.isNotBlank()) gte("slot_date", cutoffDate)
                                    gt("updated_at", sinceIso)
                                }
                            }.decodeList<Slot>()
                    }
                    val idsDeferred = async {
                        supabaseClient.postgrest["slots"]
                            .select(Columns.list("id", "slot_date")) {
                                filter {
                                    eq("clinic_id", clinicId)
                                    if (cutoffDate.isNotBlank()) gte("slot_date", cutoffDate)
                                }
                            }.decodeList<SlotIdDateRefDto>()
                    }
                    deltaDeferred.await() to idsDeferred.await()
                }

                val activeIds = activeIdRefs.map { it.id }.toSet()
                val deltaMap = deltaSlots.associateBy { it.id }
                val base = cachedAll.filter { it.id in activeIds && !deltaMap.containsKey(it.id) }
                val mergedAll = (base + deltaSlots).sortedWith(compareBy<Slot> { it.slotDate }.thenBy { it.startTime })
                mergeClinicAndDateCache(clinicId, null, null, mergedAll)
                return@withContext mergedAll
            }
        } catch (e: Exception) {
            e.printStackTrace()
            return@withContext if (date != null) getCachedSlots(clinicId, date) else getCachedSlotsForClinic(clinicId)
        }
    }

    open suspend fun getSlots(clinicId: String, date: String): List<Slot> = withContext(Dispatchers.IO) {
        try {
            val (slots, appointments) = coroutineScope {
                val slotsDeferred = async {
                    supabaseClient.postgrest["slots"]
                        .select {
                            filter {
                                eq("clinic_id", clinicId)
                                eq("slot_date", date)
                            }
                        }.decodeList<Slot>()
                }
                val apptsDeferred = async { fetchMinimalSlotAppts(clinicId, date) }
                slotsDeferred.await() to apptsDeferred.await()
            }

            val enriched = slots.map { slot ->
                val registeredCount = appointments.count {
                    it.slotId == slot.id &&
                        it.checkinStatus != "cancelled" &&
                        !(it.paymentMode.equals("PAY_AT_DESK", ignoreCase = true) && it.status.equals("WAITING_FOR_APPROVAL", ignoreCase = true))
                }
                val waitingCount = appointments.count {
                    val cStatus = it.checkinStatus?.lowercase()?.trim().orEmpty()
                    val status = it.status.uppercase().trim()
                    it.slotId == slot.id &&
                        cStatus !in listOf("completed", "done", "finished", "report_prepared", "results_ready", "cancelled", "no_show", "rejected") &&
                        status !in listOf("COMPLETED", "DONE", "FINISHED", "CANCELLED", "REJECTED", "EXPIRED", "UNAPPROVED", "PENDING_PAYMENT") &&
                        !(it.paymentMode.equals("PAY_AT_DESK", ignoreCase = true) && status == "WAITING_FOR_APPROVAL")
                }
                if (slot.bookedCount != registeredCount) {
                    try {
                        supabaseClient.postgrest["slots"].update({
                            set("booked_count", registeredCount)
                            set("updated_at", Instant.now().toString())
                        }) {
                            filter { eq("id", slot.id) }
                        }
                    } catch (_: Exception) {}
                }
                slot.copy(bookedCount = registeredCount, waitingCount = waitingCount)
            }.sortedBy { it.startTime }

            mergeClinicAndDateCache(clinicId, date, enriched)
            enriched
        } catch (e: Exception) {
            e.printStackTrace()
            getCachedSlots(clinicId, date)
        }
    }

    suspend fun getSlotsForClinic(clinicId: String): List<Slot> = withContext(Dispatchers.IO) {
        refreshUpdatedSlotsOnly(clinicId, date = null)
    }

    suspend fun incrementSlotBookedCount(slotId: String): Boolean = withContext(Dispatchers.IO) {
        try {
            val slot = supabaseClient.postgrest["slots"]
                .select { filter { eq("id", slotId) } }
                .decodeSingleOrNull<Slot>() ?: return@withContext false
            val nowIso = Instant.now().toString()
            supabaseClient.postgrest["slots"]
                .update({
                    set("booked_count", slot.bookedCount + 1)
                    set("updated_at", nowIso)
                }) {
                    filter { eq("id", slotId) }
                }
            upsertSlotIntoCache(slot.copy(bookedCount = slot.bookedCount + 1, updatedAt = nowIso))
            true
        } catch (e: Exception) {
            e.printStackTrace()
            false
        }
    }

    suspend fun createSlot(slot: Slot): Slot? = withContext(Dispatchers.IO) {
        try {
            val nowIso = Instant.now().toString()
            val payload = SlotInsertDto(
                id = slot.id,
                clinicId = slot.clinicId,
                doctorId = slot.doctorId,
                slotDate = slot.slotDate,
                startTime = AppointmentRepository.normalizeTimeForPostgres(slot.startTime),
                endTime = AppointmentRepository.normalizeTimeForPostgres(slot.endTime),
                maxCapacity = slot.maxCapacity,
                bookedCount = slot.bookedCount,
                isPublished = slot.isPublished,
                updatedAt = nowIso
            )
            val created = supabaseClient.postgrest["slots"]
                .insert(payload) {
                    select()
                }.decodeSingleOrNull<Slot>()
            if (created != null) {
                upsertSlotIntoCache(created)
            } else {
                upsertSlotIntoCache(
                    slot.copy(
                        startTime = payload.startTime,
                        endTime = payload.endTime,
                        updatedAt = nowIso
                    )
                )
            }
            created
        } catch (e: Exception) {
            e.printStackTrace()
            null
        }
    }

    suspend fun updateSlotTime(slotId: String, startTime: String, endTime: String): Slot? = withContext(Dispatchers.IO) {
        try {
            val nowIso = Instant.now().toString()
            val normStart = AppointmentRepository.normalizeTimeForPostgres(startTime)
            val normEnd = AppointmentRepository.normalizeTimeForPostgres(endTime)
            val updated = supabaseClient.postgrest["slots"]
                .update({
                    set("start_time", normStart)
                    set("end_time", normEnd)
                    set("updated_at", nowIso)
                }) {
                    filter { eq("id", slotId) }
                    select()
                }.decodeSingleOrNull<Slot>()
            if (updated != null) {
                upsertSlotIntoCache(updated)
            }
            updated
        } catch (e: Exception) {
            e.printStackTrace()
            null
        }
    }

    suspend fun deleteSlot(id: String): Boolean = withContext(Dispatchers.IO) {
        try {
            supabaseClient.postgrest["slots"]
                .delete {
                    filter {
                        eq("id", id)
                    }
                }
            removeSlotFromCache(id)
            true
        } catch (e: Exception) {
            e.printStackTrace()
            false
        }
    }

    suspend fun updateSlotCapacity(slotId: String, newCapacity: Int): Boolean = withContext(Dispatchers.IO) {
        try {
            val nowIso = Instant.now().toString()
            val updated = supabaseClient.postgrest["slots"]
                .update({
                    set("max_capacity", newCapacity)
                    set("updated_at", nowIso)
                }) {
                    filter {
                        eq("id", slotId)
                    }
                    select()
                }.decodeSingleOrNull<Slot>()
            if (updated != null) {
                upsertSlotIntoCache(updated)
            }
            true
        } catch (e: Exception) {
            e.printStackTrace()
            false
        }
    }
}
