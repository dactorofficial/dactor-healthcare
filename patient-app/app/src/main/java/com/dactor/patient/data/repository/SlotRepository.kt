package com.dactor.patient.data.repository

import com.dactor.patient.data.model.Slot
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.postgrest.postgrest
import io.github.jan.supabase.postgrest.rpc
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import java.util.concurrent.ConcurrentHashMap
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class SlotRepository @Inject constructor(
    private val supabaseClient: SupabaseClient
) {
    private val cachedSlotsByDate = ConcurrentHashMap<String, Map<String, List<Slot>>>()
    private var cachedNextAvailableDates: Map<String, String>? = null

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
         * Returns true if the slot's ending time is already over for the given [dateStr].
         * As long as the ending time has not passed (endMins > nowMins), the slot remains active and bookable.
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

                val rangePattern = Regex("""\s*(?:-|–|—|\bto\b)\s*""", RegexOption.IGNORE_CASE)

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

        /**
         * Formats a target date string (e.g. "2026-10-15") into a user-friendly label
         * with the exact date (e.g. "Next available: Thu, 15 Oct 2026").
         */
        fun formatNextAvailableDate(dateStr: String?): String {
            if (dateStr.isNullOrBlank()) return "No upcoming slots scheduled"
            return try {
                val target = java.time.LocalDate.parse(dateStr)
                val today = java.time.LocalDate.now()
                when (target) {
                    today -> "Available today"
                    today.plusDays(1) -> "Next available: Tomorrow, ${target.format(java.time.format.DateTimeFormatter.ofPattern("d MMM", java.util.Locale.ENGLISH))}"
                    else -> "Next available: ${target.format(java.time.format.DateTimeFormatter.ofPattern("EEE, d MMM yyyy", java.util.Locale.ENGLISH))}"
                }
            } catch (e: Exception) {
                "Next available: $dateStr"
            }
        }
    }

    private fun filterActiveSlotsForDate(slots: List<Slot>, date: String): List<Slot> {
        return slots.filter { slot ->
            slot.isPublished && !isSlotEndTimeOver(slot.endTime, date.ifBlank { slot.slotDate }, slot.startTime)
        }
    }

    fun getCachedSlotsForDate(date: String): Map<String, List<Slot>>? {
        val cached = cachedSlotsByDate[date] ?: return null
        return cached.mapValues { (_, list) -> filterActiveSlotsForDate(list, date) }
    }

    /**
     * Fetches ALL slots and appointments for [date] across all clinics in 1 parallel round-trip (2 queries total)
     * instead of 2*N queries per clinic. Automatically removes slots whose ending time is over.
     */
    suspend fun getAllAvailableSlotsForDate(
        date: String,
        forceRefresh: Boolean = false
    ): Map<String, List<Slot>> = coroutineScope {
        if (!forceRefresh && cachedSlotsByDate.containsKey(date)) {
            return@coroutineScope cachedSlotsByDate[date]!!.mapValues { (_, list) ->
                filterActiveSlotsForDate(list, date)
            }
        }

        val slotsDeferred = async {
            try {
                supabaseClient.postgrest["slots"]
                    .select {
                        filter {
                            eq("slot_date", date)
                        }
                    }
                    .decodeList<Slot>()
            } catch (e: Exception) {
                emptyList()
            }
        }

        val apptsDeferred = async {
            try {
                supabaseClient.postgrest["appointments"]
                    .select {
                        filter {
                            eq("appointment_date", date)
                        }
                    }
                    .decodeList<com.dactor.patient.data.model.Appointment>()
            } catch (e: Exception) {
                emptyList()
            }
        }

        val allSlots = slotsDeferred.await()
        val allAppts = apptsDeferred.await()

        val activeCountBySlotId = allAppts
            .filter { it.checkinStatus != "cancelled" && !it.slotId.isNullOrBlank() }
            .groupingBy { it.slotId!! }
            .eachCount()

        val enrichedSlots = filterActiveSlotsForDate(
            allSlots.map { slot ->
                val registeredCount = activeCountBySlotId[slot.id] ?: slot.bookedCount
                slot.copy(bookedCount = registeredCount)
            },
            date
        )

        val grouped = enrichedSlots.groupBy { it.clinicId }
        cachedSlotsByDate[date] = grouped
        grouped
    }

    fun clearCache() {
        cachedSlotsByDate.clear()
        cachedNextAvailableDates = null
    }

    /**
     * Determines the exact next available date (YYYY-MM-DD) for a specific clinic.
     * Evaluates capacity and skips past slots today.
     */
    suspend fun getNextAvailableDate(
        clinicId: String,
        fromDate: String = java.time.LocalDate.now().toString(),
        doctorId: String? = null
    ): String? = coroutineScope {
        try {
            val cachedMap = cachedNextAvailableDates
            if (cachedMap != null && doctorId == null && cachedMap.containsKey(clinicId)) {
                return@coroutineScope cachedMap[clinicId]
            }

            val slotsDeferred = async {
                try {
                    supabaseClient.postgrest["slots"]
                        .select {
                            filter {
                                eq("clinic_id", clinicId)
                                gte("slot_date", fromDate)
                                eq("is_published", true)
                            }
                        }
                        .decodeList<Slot>()
                } catch (e: Exception) {
                    emptyList()
                }
            }

            val apptsDeferred = async {
                try {
                    supabaseClient.postgrest["appointments"]
                        .select {
                            filter {
                                eq("clinic_id", clinicId)
                                gte("appointment_date", fromDate)
                            }
                        }
                        .decodeList<com.dactor.patient.data.model.Appointment>()
                } catch (e: Exception) {
                    emptyList()
                }
            }

            val slots = slotsDeferred.await()
            val appts = apptsDeferred.await()

            val activeCountBySlotId = appts
                .filter { it.checkinStatus != "cancelled" && !it.slotId.isNullOrBlank() }
                .groupingBy { it.slotId!! }
                .eachCount()

            val relevantSlots = if (!doctorId.isNullOrBlank()) {
                val matches = slots.filter { it.doctorId == doctorId }
                matches.ifEmpty { slots.filter { it.doctorId.isNullOrBlank() } }
            } else {
                slots
            }

            val groupedByDate = relevantSlots.groupBy { it.slotDate }.toSortedMap()
            for ((date, dateSlots) in groupedByDate) {
                val hasAvailable = dateSlots.any { slot ->
                    val booked = activeCountBySlotId[slot.id] ?: slot.bookedCount
                    val hasCapacity = (slot.maxCapacity - booked) > 0
                    if (date == fromDate) {
                        hasCapacity && !isSlotEndTimeOver(slot.endTime, fromDate, slot.startTime)
                    } else {
                        hasCapacity
                    }
                }
                if (hasAvailable) {
                    return@coroutineScope date
                }
            }
            null
        } catch (e: Exception) {
            e.printStackTrace()
            null
        }
    }

    /**
     * Batch queries upcoming available dates for all clinics in 1 round-trip.
     * Maps clinicId -> earliest available date string ("YYYY-MM-DD").
     */
    suspend fun getAllClinicsNextAvailableDates(
        fromDate: String = java.time.LocalDate.now().toString(),
        forceRefresh: Boolean = false
    ): Map<String, String> = coroutineScope {
        if (!forceRefresh && cachedNextAvailableDates != null) {
            return@coroutineScope cachedNextAvailableDates!!
        }

        try {
            val slotsDeferred = async {
                try {
                    supabaseClient.postgrest["slots"]
                        .select {
                            filter {
                                gte("slot_date", fromDate)
                                eq("is_published", true)
                            }
                        }
                        .decodeList<Slot>()
                } catch (e: Exception) {
                    emptyList()
                }
            }

            val apptsDeferred = async {
                try {
                    supabaseClient.postgrest["appointments"]
                        .select {
                            filter {
                                gte("appointment_date", fromDate)
                            }
                        }
                        .decodeList<com.dactor.patient.data.model.Appointment>()
                } catch (e: Exception) {
                    emptyList()
                }
            }

            val slots = slotsDeferred.await()
            val appts = apptsDeferred.await()

            val activeCountBySlotId = appts
                .filter { it.checkinStatus != "cancelled" && !it.slotId.isNullOrBlank() }
                .groupingBy { it.slotId!! }
                .eachCount()

            val byClinic = slots.groupBy { it.clinicId }
            val resultMap = mutableMapOf<String, String>()

            for ((clinicId, clinicSlots) in byClinic) {
                val byDate = clinicSlots.groupBy { it.slotDate }.toSortedMap()
                for ((date, dateSlots) in byDate) {
                    val hasAvailable = dateSlots.any { slot ->
                        val booked = activeCountBySlotId[slot.id] ?: slot.bookedCount
                        val hasCap = (slot.maxCapacity - booked) > 0
                        if (date == fromDate) {
                            hasCap && !isSlotEndTimeOver(slot.endTime, fromDate, slot.startTime)
                        } else {
                            hasCap
                        }
                    }
                    if (hasAvailable) {
                        resultMap[clinicId] = date
                        break
                    }
                }
            }

            cachedNextAvailableDates = resultMap
            resultMap
        } catch (e: Exception) {
            e.printStackTrace()
            emptyMap()
        }
    }

    /**
     * Fetches ALL slots and active appointments for a clinic across the entire [yearMonth]
     * in a single parallel call (2 queries: slots & appointments).
     * Returns a map of date string ("YYYY-MM-DD") to list of enriched slots.
     */
    suspend fun getMonthSlots(
        clinicId: String,
        yearMonth: java.time.YearMonth,
        doctorId: String? = null
    ): Map<String, List<Slot>> = coroutineScope {
        val startDate = yearMonth.atDay(1).toString()
        val endDate = yearMonth.atEndOfMonth().toString()

        val slotsDeferred = async {
            try {
                supabaseClient.postgrest["slots"]
                    .select {
                        filter {
                            eq("clinic_id", clinicId)
                            gte("slot_date", startDate)
                            lte("slot_date", endDate)
                        }
                    }
                    .decodeList<Slot>()
            } catch (e: Exception) {
                e.printStackTrace()
                emptyList()
            }
        }

        val apptsDeferred = async {
            try {
                supabaseClient.postgrest["appointments"]
                    .select {
                        filter {
                            eq("clinic_id", clinicId)
                            gte("appointment_date", startDate)
                            lte("appointment_date", endDate)
                        }
                    }
                    .decodeList<com.dactor.patient.data.model.Appointment>()
            } catch (e: Exception) {
                emptyList()
            }
        }

        val slots = slotsDeferred.await()
        val appointments = apptsDeferred.await()

        val activeCountBySlotId = appointments
            .filter { it.checkinStatus != "cancelled" && !it.slotId.isNullOrBlank() }
            .groupingBy { it.slotId!! }
            .eachCount()

        val enrichedSlots = slots.map { slot ->
            val registeredCount = activeCountBySlotId[slot.id] ?: slot.bookedCount
            slot.copy(bookedCount = registeredCount)
        }

        val grouped = enrichedSlots.groupBy { it.slotDate }
        for ((date, dateSlots) in grouped) {
            val existing = cachedSlotsByDate[date]?.toMutableMap() ?: mutableMapOf()
            existing[clinicId] = dateSlots
            cachedSlotsByDate[date] = existing
        }

        grouped
    }

    suspend fun getAvailableSlots(clinicId: String, date: String, forceRefresh: Boolean = false): List<Slot> = coroutineScope {
        if (!forceRefresh) {
            cachedSlotsByDate[date]?.get(clinicId)?.let {
                return@coroutineScope filterActiveSlotsForDate(it, date)
            }
        }

        val slotsDeferred = async {
            try {
                supabaseClient.postgrest["slots"]
                    .select {
                        filter {
                            eq("clinic_id", clinicId)
                            eq("slot_date", date)
                        }
                    }
                    .decodeList<Slot>()
            } catch (e: Exception) {
                e.printStackTrace()
                emptyList()
            }
        }

        val apptsDeferred = async {
            try {
                supabaseClient.postgrest["appointments"]
                    .select {
                        filter {
                            eq("clinic_id", clinicId)
                            eq("appointment_date", date)
                        }
                    }
                    .decodeList<com.dactor.patient.data.model.Appointment>()
            } catch (e: Exception) {
                emptyList()
            }
        }

        val slots = slotsDeferred.await()
        val appointments = apptsDeferred.await()

        val activeCountBySlotId = appointments
            .filter { it.checkinStatus != "cancelled" && !it.slotId.isNullOrBlank() }
            .groupingBy { it.slotId!! }
            .eachCount()

        filterActiveSlotsForDate(
            slots.map { slot ->
                val registeredCount = activeCountBySlotId[slot.id] ?: slot.bookedCount
                slot.copy(bookedCount = registeredCount)
            },
            date
        )
    }

    suspend fun incrementSlotBookedCount(slotId: String): Boolean {
        cachedSlotsByDate.clear()
        return try {
            val slot = getSlotById(slotId) ?: return false
            supabaseClient.postgrest["slots"]
                .update({
                    set("booked_count", slot.bookedCount + 1)
                }) {
                    filter { eq("id", slotId) }
                }
            true
        } catch (e: Exception) {
            e.printStackTrace()
            false
        }
    }

    suspend fun getSlotById(slotId: String): Slot? {
        return try {
            supabaseClient.postgrest["slots"]
                .select { filter { eq("id", slotId) } }
                .decodeSingleOrNull<Slot>()
        } catch (e: Exception) {
            e.printStackTrace()
            null
        }
    }

    /**
     * Phase 2 transition: Called when patient taps "Pay with [Gateway]".
     * Clears the 5-minute decision window and sets a gateway-specific backstop timeout.
     */
    suspend fun initiateOnlinePaymentPhase(appointmentId: String, gateway: String) {
        try {
            supabaseClient.postgrest.rpc(
                function = "initiate_online_payment_phase",
                parameters = buildJsonObject {
                    put("p_appointment_id", appointmentId)
                    put("p_gateway", gateway)
                }
            )
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    /**
     * Atomically cancels a pending appointment and decrements the slot's booked_count.
     */
    suspend fun cancelPendingAppointment(appointmentId: String): Boolean {
        return try {
            supabaseClient.postgrest.rpc(
                function = "cancel_pending_appointment",
                parameters = buildJsonObject {
                    put("p_appointment_id", appointmentId)
                }
            )
            true
        } catch (e: Exception) {
            e.printStackTrace()
            false
        }
    }
}
