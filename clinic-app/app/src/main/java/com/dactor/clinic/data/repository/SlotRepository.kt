package com.dactor.clinic.data.repository

import com.dactor.clinic.data.model.Slot
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.postgrest.postgrest
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class SlotRepository @Inject constructor(
    private val supabaseClient: SupabaseClient
) {
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
    }

    suspend fun getSlots(clinicId: String, date: String): List<Slot> = withContext(Dispatchers.IO) {
        try {
            val slots = supabaseClient.postgrest["slots"]
                .select {
                    filter {
                        eq("clinic_id", clinicId)
                        eq("slot_date", date)
                    }
                }.decodeList<Slot>()

            val appointments = try {
                supabaseClient.postgrest["appointments"]
                    .select {
                        filter {
                            eq("clinic_id", clinicId)
                            eq("appointment_date", date)
                        }
                    }.decodeList<com.dactor.clinic.data.model.Appointment>()
            } catch (e: Exception) {
                emptyList()
            }

            slots.map { slot ->
                val registeredCount = appointments.count { it.slotId == slot.id && it.checkinStatus != "cancelled" }
                if (slot.bookedCount != registeredCount) {
                    try {
                        supabaseClient.postgrest["slots"].update({
                            set("booked_count", registeredCount)
                        }) {
                            filter { eq("id", slot.id) }
                        }
                    } catch (ignored: Exception) {}
                }
                slot.copy(bookedCount = registeredCount)
            }
        } catch (e: Exception) {
            e.printStackTrace()
            emptyList()
        }
    }

    suspend fun getSlotsForClinic(clinicId: String): List<Slot> = withContext(Dispatchers.IO) {
        try {
            supabaseClient.postgrest["slots"]
                .select {
                    filter {
                        eq("clinic_id", clinicId)
                    }
                }.decodeList<Slot>()
        } catch (e: Exception) {
            e.printStackTrace()
            emptyList()
        }
    }

    suspend fun incrementSlotBookedCount(slotId: String): Boolean = withContext(Dispatchers.IO) {
        try {
            val slot = supabaseClient.postgrest["slots"]
                .select { filter { eq("id", slotId) } }
                .decodeSingleOrNull<Slot>() ?: return@withContext false
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

    suspend fun createSlot(slot: Slot): Slot? = withContext(Dispatchers.IO) {
        try {
            val normalizedSlot = slot.copy(
                startTime = AppointmentRepository.normalizeTimeForPostgres(slot.startTime),
                endTime = AppointmentRepository.normalizeTimeForPostgres(slot.endTime)
            )
            supabaseClient.postgrest["slots"]
                .insert(normalizedSlot) {
                    select()
                }.decodeSingleOrNull<Slot>()
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
            true
        } catch (e: Exception) {
            e.printStackTrace()
            false
        }
    }

    suspend fun updateSlotCapacity(slotId: String, newCapacity: Int): Boolean = withContext(Dispatchers.IO) {
        try {
            supabaseClient.postgrest["slots"]
                .update({
                    set("max_capacity", newCapacity)
                }) {
                    filter {
                        eq("id", slotId)
                    }
                }
            true
        } catch (e: Exception) {
            e.printStackTrace()
            false
        }
    }
}
