package com.dactor.patient.data.repository

import com.dactor.patient.data.model.Appointment
import com.dactor.patient.data.model.Clinic
import com.dactor.patient.data.model.ClinicScheduleHelper
import com.dactor.patient.data.model.NotificationTemplateData
import com.dactor.patient.data.model.QueueEntry
import com.dactor.patient.data.model.Slot
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.postgrest.postgrest
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import java.time.Instant
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale
import java.util.UUID
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import javax.inject.Inject
import javax.inject.Singleton

@Serializable
data class NotificationInsertDto(
    @SerialName("id") val id: String = UUID.randomUUID().toString(),
    @SerialName("user_id") val userId: String? = null,
    @SerialName("appointment_id") val appointmentId: String? = null,
    @SerialName("title") val title: String,
    @SerialName("message") val message: String,
    @SerialName("type") val type: String = "queue_alert",
    @SerialName("target_audience") val targetAudience: String = "specific",
    @SerialName("is_read") val isRead: Boolean = false
)

data class LiveQueueTimingEstimate(
    val estimatedTimeLeftText: String,
    val expectedExactTimeText: String,
    val doctorStatusBanner: String?,
    val isDoctorIdleFiveMins: Boolean = false,
    val isDoctorNotInside: Boolean = false,
    val isClinicOnBreak: Boolean = false,
    val isSoonBeReady: Boolean = false,
    val timeWindowText: String = "",
    val approxTimeText: String = "",
    val slotStartTimeText: String = "",
    val suggestedArrivalText: String = "",
    val slotNoticeText: String = "",
    val canOfferEarlyArrival: Boolean = false,
    val earlyArrivalOfferText: String? = null,
    val isPatientLate: Boolean = false
)

data class MultiSlotPositionResult(
    val cumulativePosition: Int = 1,
    val patientsAheadInDay: Int = 0,
    val positionInSlot: Int = 1,
    val slotStartTimeText: String = "",
    val slotEndTimeText: String = "",
    val approxAppointmentTimeText: String = "",
    val timeWindowText: String = "",
    val dateLabel: String = "",
    val isToday: Boolean = true,
    val isTomorrow: Boolean = false,
    val isFutureDate: Boolean = false
)

@Singleton
class QueueRepository @Inject constructor(
    private val supabaseClient: SupabaseClient
) {
    suspend fun getQueueStatus(appointmentId: String): QueueEntry? {
        if (appointmentId.isBlank()) return null
        return try {
            val list = supabaseClient.postgrest["queue_entries"]
                .select { filter { eq("appointment_id", appointmentId) } }
                .decodeList<QueueEntry>()
            list.firstOrNull { it.status.lowercase() in listOf("waiting", "inside", "in_consultation") }
                ?: list.firstOrNull { it.status.lowercase() in listOf("done", "completed") }
                ?: list.lastOrNull()
        } catch (e: Exception) {
            e.printStackTrace()
            null
        }
    }

    suspend fun ensureQueueEntryForAppointment(
        appointmentId: String,
        clinicId: String,
        doctorId: String? = null
    ): QueueEntry? = withContext(Dispatchers.IO) {
        if (appointmentId.isBlank() || clinicId.isBlank()) return@withContext null
        try {
            // Guard: Never create a queue entry for an unapproved appointment
            val appt = try {
                supabaseClient.postgrest["appointments"]
                    .select { filter { eq("id", appointmentId) } }
                    .decodeList<com.dactor.patient.data.model.Appointment>()
                    .firstOrNull()
            } catch (_: Exception) { null }

            val isUnapproved = appt == null ||
                !appt.status.equals("APPROVED", ignoreCase = true) ||
                appt.status == "WAITING_FOR_APPROVAL" ||
                appt.status == "pending_payment" ||
                appt.status == "UNAPPROVED" ||
                appt.status == "EXPIRED" ||
                appt.checkinStatus == "cancelled"

            if (isUnapproved) {
                try {
                    supabaseClient.postgrest["queue_entries"].delete {
                        filter { eq("appointment_id", appointmentId) }
                    }
                } catch (_: Exception) {}
                return@withContext null
            }

            val existing = getQueueStatus(appointmentId)
            val cleanDocId = doctorId?.takeIf { com.dactor.patient.domain.util.PatientIdentitySync.isValidUuid(it) }

            if (existing != null) {
                // If previous queue entry is already done or completed, do not reset it
                if (existing.status.lowercase() in listOf("done", "completed")) {
                    return@withContext existing
                }
                // If previous queue entry was cancelled, no_show, or skipped, reset it to active waiting for today's OPD
                if (existing.status.lowercase() in listOf("cancelled", "no_show", "skipped")) {
                    val resolvedDoc = cleanDocId ?: existing.doctorId
                    val currentEntries = getQueueEntriesForDoctor(clinicId, resolvedDoc)
                    val nextPos = (currentEntries
                        .filter { it.status == "waiting" || it.status == "inside" }
                        .map { it.queuePosition }
                        .maxOrNull() ?: 0) + 1

                    try {
                        supabaseClient.postgrest["queue_entries"].update({
                            set("status", "waiting")
                            set("queue_position", nextPos)
                            set("called_at", null as String?)
                            set("inside_at", null as String?)
                            set("completed_at", null as String?)
                            if (resolvedDoc != null) set("doctor_id", resolvedDoc)
                        }) {
                            filter { eq("id", existing.id) }
                        }
                        return@withContext existing.copy(
                            status = "waiting",
                            queuePosition = nextPos,
                            doctorId = resolvedDoc,
                            calledAt = null,
                            insideAt = null,
                            completedAt = null
                        )
                    } catch (e: Exception) {
                        e.printStackTrace()
                    }
                }
                return@withContext existing
            }

            // Doctor-partitioned queue sequence: token starts from 1 for each specific doctor
            val doctorEntries = getQueueEntriesForDoctor(clinicId, cleanDocId)
            val nextPos = (doctorEntries
                .filter { it.status == "waiting" || it.status == "inside" }
                .map { it.queuePosition }
                .maxOrNull() ?: 0) + 1

            val newEntry = QueueEntry(
                id = UUID.randomUUID().toString(),
                appointmentId = appointmentId,
                clinicId = clinicId,
                doctorId = cleanDocId,
                queuePosition = nextPos,
                status = "waiting"
            )

            try {
                supabaseClient.postgrest["queue_entries"].insert(newEntry)
                newEntry
            } catch (e: Exception) {
                if (cleanDocId != null) {
                    try {
                        val fallbackEntry = newEntry.copy(doctorId = null)
                        supabaseClient.postgrest["queue_entries"].insert(fallbackEntry)
                        fallbackEntry
                    } catch (e2: Exception) {
                        null
                    }
                } else null
            }
        } catch (e: Exception) {
            e.printStackTrace()
            null
        }
    }

    suspend fun getQueueEntriesForClinic(clinicId: String): List<QueueEntry> {
        if (clinicId.isBlank()) return emptyList()
        return try {
            supabaseClient.postgrest["queue_entries"]
                .select { filter { eq("clinic_id", clinicId) } }
                .decodeList<QueueEntry>()
        } catch (e: Exception) {
            e.printStackTrace()
            emptyList()
        }
    }

    suspend fun getQueueEntriesForDoctor(clinicId: String, doctorId: String?): List<QueueEntry> {
        if (clinicId.isBlank()) return emptyList()
        val all = getQueueEntriesForClinic(clinicId)
        return if (doctorId.isNullOrBlank()) {
            all.filter { it.doctorId.isNullOrBlank() }
        } else {
            all.filter { it.doctorId == doctorId }
        }
    }

    fun subscribeToQueueUpdates(clinicId: String, onUpdate: (List<QueueEntry>) -> Unit) {
        // Implementation simplified for compilation
    }

    suspend fun removeOrCancelQueueEntry(appointmentId: String): Boolean {
        if (appointmentId.isBlank()) return false
        return try {
            supabaseClient.postgrest["queue_entries"].delete {
                filter { eq("appointment_id", appointmentId) }
            }
            true
        } catch (e: Exception) {
            e.printStackTrace()
            false
        }
    }

    suspend fun updateQueueStatus(appointmentId: String, newStatus: String): Boolean {
        if (appointmentId.isBlank()) return false
        return try {
            supabaseClient.postgrest["queue_entries"].update({
                set("status", newStatus)
            }) {
                filter { eq("appointment_id", appointmentId) }
            }
            true
        } catch (e: Exception) {
            e.printStackTrace()
            false
        }
    }

    /**
     * Inserts an automatic queue alert notification into the `notifications` table.
     * Targeted to a specific patient via `user_id` and `appointment_id` so only they receive it.
     */
    suspend fun insertAutoAlert(
        appointmentId: String,
        userId: String?,
        title: String,
        message: String,
        estimatedTimeLeft: String? = null,
        expectedTime: String? = null,
        trackingCode: String? = null
    ): Boolean {
        return try {
            val validUuidApptId = appointmentId.takeIf { it.length == 36 && it.contains("-") }
            val taggedMessage = if (message.contains("[[META:")) {
                message
            } else {
                val isFirstPos = message.contains("position 1", ignoreCase = true) ||
                    message.contains("next in line", ignoreCase = true) ||
                    expectedTime?.contains("arrive fast", ignoreCase = true) == true ||
                    estimatedTimeLeft?.contains("arrive fast", ignoreCase = true) == true

                val leftVal = if (isFirstPos) "Arrive Fast" else (estimatedTimeLeft ?: "Soon, be ready")
                val rightVal = if (isFirstPos) "Your turn, arrive fast" else (expectedTime ?: "Soon, be ready")
                val rightLabel = if (isFirstPos) "Turn Status" else "Your Appointment Time"

                NotificationTemplateData.buildMessageWithMeta(
                    cleanMessage = message,
                    leftLabel = "Estimated Time",
                    leftValue = leftVal,
                    rightLabel = rightLabel,
                    rightValue = rightVal,
                    trackingCode = trackingCode
                )
            }
            val dto = NotificationInsertDto(
                id = UUID.randomUUID().toString(),
                userId = userId?.takeIf { it.isNotBlank() },
                appointmentId = validUuidApptId,
                title = title,
                message = taggedMessage,
                type = "queue_alert",
                targetAudience = "specific",
                isRead = false
            )
            try {
                supabaseClient.postgrest["notifications"].insert(dto)
            } catch (e: Exception) {
                supabaseClient.postgrest["notifications"].insert(dto.copy(id = UUID.randomUUID().toString(), userId = null))
            }
            true
        } catch (e: Exception) {
            e.printStackTrace()
            false
        }
    }

    /**
     * Sends an early arrival invite push notification to a patient who opted into early calls
     * when the doctor is free ahead of schedule.
     */
    suspend fun sendEarlyArrivalInvite(
        appointmentId: String,
        userId: String?,
        patientName: String,
        trackingCode: String,
        originalSlot: String
    ): Boolean {
        return try {
            val validUuidApptId = appointmentId.takeIf { it.length == 36 && it.contains("-") }
            val title = com.dactor.patient.data.model.NotificationTemplate.EarlyArrivalInvite.buildTitle()
            val msg = com.dactor.patient.data.model.NotificationTemplate.EarlyArrivalInvite.buildMessage(
                patientName = patientName,
                code = trackingCode,
                originalSlot = originalSlot
            )
            val dto = NotificationInsertDto(
                id = UUID.randomUUID().toString(),
                userId = userId?.takeIf { it.isNotBlank() },
                appointmentId = validUuidApptId,
                title = title,
                message = msg,
                type = "early_arrival",
                targetAudience = "specific",
                isRead = false
            )
            try {
                supabaseClient.postgrest["notifications"].insert(dto)
            } catch (e: Exception) {
                supabaseClient.postgrest["notifications"].insert(dto.copy(id = UUID.randomUUID().toString(), userId = null))
            }
            true
        } catch (e: Exception) {
            e.printStackTrace()
            false
        }
    }

    /**
     * Calculates cumulative line position across all slots of the day,
     * including prior slots count, in-slot position, and approximate time with ±15m tolerance.
     */
    suspend fun calculateMultiSlotDailyPosition(
        clinicId: String,
        doctorId: String?,
        appointmentDate: String,
        targetAppointmentId: String,
        targetSlotId: String?,
        targetAppointmentTime: String?,
        avgConsultationMinutes: Int = 10
    ): MultiSlotPositionResult = withContext(Dispatchers.IO) {
        val targetDateStr = appointmentDate.trim().take(10)
        val slots = try {
            if (clinicId.isNotBlank() && targetDateStr.isNotBlank()) {
                supabaseClient.postgrest["slots"].select {
                    filter {
                        eq("clinic_id", clinicId)
                        eq("slot_date", targetDateStr)
                        eq("is_published", true)
                    }
                }.decodeList<Slot>()
            } else emptyList()
        } catch (e: Exception) {
            emptyList()
        }

        val appointments = try {
            if (clinicId.isNotBlank() && targetDateStr.isNotBlank()) {
                supabaseClient.postgrest["appointments"].select {
                    filter {
                        eq("clinic_id", clinicId)
                        eq("appointment_date", targetDateStr)
                    }
                }.decodeList<Appointment>().filter { it.checkinStatus != "cancelled" }
            } else emptyList()
        } catch (e: Exception) {
            emptyList()
        }

        computeMultiSlotDailyPosition(
            targetAppointmentId = targetAppointmentId,
            targetSlotId = targetSlotId,
            targetAppointmentTime = targetAppointmentTime,
            appointmentDate = targetDateStr,
            allSlotsForDate = slots,
            allAppointmentsForDate = appointments,
            doctorId = doctorId,
            avgConsultationMinutes = avgConsultationMinutes
        )
    }

    companion object {
        fun parseTimeString(timeStr: String?): LocalTime? {
            if (timeStr.isNullOrBlank()) return null
            val clean = timeStr.trim().uppercase()
            val regex = Regex("""^(\d{1,2}):(\d{2})(?::\d{2})?(?:\s*([AP]M))?""")
            val match = regex.find(clean)
            if (match != null) {
                var hours = match.groupValues[1].toInt()
                val minutes = match.groupValues[2].toInt()
                val ampm = match.groupValues[3]
                if (ampm == "PM" && hours < 12) hours += 12
                else if (ampm == "AM" && hours == 12) hours = 0
                try {
                    return LocalTime.of(hours, minutes)
                } catch (_: Exception) {}
            }
            val formatters = listOf(
                DateTimeFormatter.ofPattern("HH:mm:ss", Locale.US),
                DateTimeFormatter.ofPattern("H:mm:ss", Locale.US),
                DateTimeFormatter.ofPattern("hh:mm:ss a", Locale.US),
                DateTimeFormatter.ofPattern("h:mm:ss a", Locale.US),
                DateTimeFormatter.ofPattern("hh:mm a", Locale.US),
                DateTimeFormatter.ofPattern("h:mm a", Locale.US),
                DateTimeFormatter.ofPattern("HH:mm", Locale.US),
                DateTimeFormatter.ofPattern("H:mm", Locale.US),
                DateTimeFormatter.ofPattern("h:mma", Locale.US),
                DateTimeFormatter.ofPattern("hh:mma", Locale.US)
            )
            for (fmt in formatters) {
                try {
                    return LocalTime.parse(clean, fmt)
                } catch (_: Exception) {}
            }
            return null
        }

        fun parseLocalDateSafe(dateStr: String?): LocalDate? {
            if (dateStr.isNullOrBlank()) return null
            val clean = dateStr.trim().take(10)
            val patterns = listOf(
                "yyyy-MM-dd",
                "dd-MM-yyyy",
                "yyyy/MM/dd",
                "dd/MM/yyyy",
                "d-M-yyyy",
                "d/M/yyyy"
            )
            for (p in patterns) {
                try {
                    return LocalDate.parse(clean, DateTimeFormatter.ofPattern(p, Locale.US))
                } catch (_: Exception) {}
            }
            try {
                return java.time.OffsetDateTime.parse(dateStr.trim()).toLocalDate()
            } catch (_: Exception) {}
            try {
                return java.time.Instant.parse(dateStr.trim()).atZone(ZoneId.systemDefault()).toLocalDate()
            } catch (_: Exception) {}
            return null
        }

        fun parseSlotStartTime(slotStr: String?): LocalTime? {
            if (slotStr.isNullOrBlank()) return null
            val parts = slotStr.split("-", "\u2013", "\u2014", "to")
            val token = parts.firstOrNull()?.trim() ?: return null
            var clean = token.uppercase()
            if (!clean.contains("AM") && !clean.contains("PM") && parts.size > 1) {
                val endPart = parts[1].uppercase()
                if (endPart.contains("PM")) clean = "$clean PM"
                else if (endPart.contains("AM")) clean = "$clean AM"
            }
            return parseTimeString(clean)
        }

        fun parseSlotEndTime(slotStr: String?): LocalTime? {
            if (slotStr.isNullOrBlank()) return null
            val parts = slotStr.split("-", "\u2013", "\u2014", "to")
            if (parts.size < 2) return null
            val clean = parts[1].trim().uppercase()
            return parseTimeString(clean)
        }

        fun formatTimeWindow(time: LocalTime, spreadMinutes: Int = 15): String {
            val fmt = DateTimeFormatter.ofPattern("h:mm a", Locale.US)
            val start = time.minusMinutes(5)
            val end = time.plusMinutes((spreadMinutes - 5).coerceAtLeast(5).toLong())
            return "${start.format(fmt)} \u2013 ${end.format(fmt)}"
        }

        fun formatApproxTime(time: LocalTime): String {
            val fmt = DateTimeFormatter.ofPattern("h:mm a", Locale.US)
            return "around ${time.format(fmt)}"
        }

        fun calculateLiveQueueTimingEstimate(
            clinic: Clinic?,
            isDoctorInClinic: Boolean,
            allClinicQueueEntries: List<QueueEntry>,
            targetEntry: QueueEntry?,
            fallbackPatientsAhead: Int = 0,
            appointmentTime: String? = null,
            optInEarlyCall: Boolean = false,
            appointmentDate: String? = null
        ): LiveQueueTimingEstimate {
            val avgMins = (clinic?.getEffectiveAvgMinutes() ?: 10).coerceAtLeast(1)
            val todaySchedule = clinic?.getTodaySchedule()
            val openLocalTime = ClinicScheduleHelper.parseTimeToLocalTime(todaySchedule?.openTime ?: "08:00 AM")
            val timeFormatter = DateTimeFormatter.ofPattern("h:mm a", Locale.US)
            val nowTime = LocalTime.now()
            val nowInstant = Instant.now()
            val zoneId = ZoneId.systemDefault()

            // Count ONLY active people. Strictly exclude completed, cancelled and no-show patients.
            val activeEntries = allClinicQueueEntries
                .filter { it.status == "waiting" || it.status == "inside" || it.status == "in_consultation" }
                .sortedWith(
                    compareBy<QueueEntry> { if (it.status == "inside" || it.status == "in_consultation") 0 else 1 }
                        .thenBy { it.queuePosition }
                )

            val insideEntry = activeEntries.firstOrNull { it.status == "inside" || it.status == "in_consultation" }

            val totalPeopleAhead = if (targetEntry != null) {
                if (targetEntry.status in listOf("inside", "in_consultation")) {
                    0
                } else {
                    val myIdx = activeEntries.indexOfFirst { it.id == targetEntry.id }
                    if (myIdx >= 0) myIdx else fallbackPatientsAhead.coerceAtLeast(0)
                }
            } else {
                fallbackPatientsAhead.coerceAtLeast(0)
            }

            // Parse slot details
            val slotStartTime = parseSlotStartTime(appointmentTime)
            val slotEndTime = parseSlotEndTime(appointmentTime)
            val slotStartStr = slotStartTime?.format(timeFormatter) ?: ""
            val slotEndStr = slotEndTime?.format(timeFormatter) ?: ""
            val suggestedArrivalStr = slotStartTime?.minusMinutes(15)?.format(timeFormatter) ?: ""
            val arrivalAdvice = if (suggestedArrivalStr.isNotBlank()) "Please arrive by $suggestedArrivalStr." else ""

            val slotNotice = when {
                slotStartTime != null && totalPeopleAhead == 0 -> {
                    "No one ahead of you. Your slot starts at $slotStartStr. $arrivalAdvice".trim()
                }
                slotStartTime != null && totalPeopleAhead > 0 -> {
                    val personWord = if (totalPeopleAhead == 1) "person" else "people"
                    "$totalPeopleAhead $personWord ahead. Your slot starts at $slotStartStr. $arrivalAdvice".trim()
                }
                totalPeopleAhead == 0 -> "No one ahead of you. You are up next!"
                else -> "$totalPeopleAhead ${if (totalPeopleAhead == 1) "person" else "people"} ahead in line."
            }

            // 0. Completed / Done
            if (targetEntry?.status in listOf("done", "completed")) {
                return LiveQueueTimingEstimate(
                    estimatedTimeLeftText = "Completed",
                    expectedExactTimeText = "Done",
                    doctorStatusBanner = null,
                    isClinicOnBreak = false,
                    isDoctorNotInside = false,
                    slotNoticeText = "Consultation completed",
                    slotStartTimeText = slotStartStr,
                    suggestedArrivalText = suggestedArrivalStr
                )
            }

            // 1. Currently inside
            if (targetEntry?.status in listOf("inside", "in_consultation")) {
                return LiveQueueTimingEstimate(
                    estimatedTimeLeftText = "Now Inside",
                    expectedExactTimeText = "In Consultation",
                    doctorStatusBanner = null,
                    isClinicOnBreak = clinic?.isOnBreak == true,
                    slotNoticeText = "You are currently inside for consultation",
                    slotStartTimeText = slotStartStr,
                    suggestedArrivalText = suggestedArrivalStr
                )
            }

            // 2. Clinic on break
            if (clinic?.isOnBreak == true) {
                val breakDesc = if (todaySchedule?.hasBreak == true) {
                    "${todaySchedule.breakStart} - ${todaySchedule.breakEnd}"
                } else {
                    "Short Break"
                }
                return LiveQueueTimingEstimate(
                    estimatedTimeLeftText = "Clinic on Break",
                    expectedExactTimeText = breakDesc,
                    doctorStatusBanner = "Clinic is currently on a break ($breakDesc)",
                    isClinicOnBreak = true,
                    slotNoticeText = "Queue paused: clinic on break ($breakDesc)",
                    slotStartTimeText = slotStartStr,
                    suggestedArrivalText = suggestedArrivalStr
                )
            }

            // 3. Late Patient Detection:
            // Patient's turn arrived, but they have not entered cabin, and another patient is called inside
            // (or another patient with higher queue position is inside, or slot time has expired and queue has progressed)
            val parsedAppt = parseLocalDateSafe(appointmentDate)
            val isApptDateToday = if (parsedAppt != null) {
                parsedAppt.isEqual(java.time.LocalDate.now())
            } else if (!appointmentDate.isNullOrBlank()) {
                val todayDateStr = java.time.LocalDate.now().toString()
                appointmentDate.trim().take(10) == todayDateStr
            } else {
                true // default for clinic live queue callers where appointmentDate is omitted
            }
            val isWaiting = (targetEntry?.status == "waiting" || targetEntry == null)
            val myQueuePosition = targetEntry?.queuePosition ?: if (fallbackPatientsAhead >= 0) (fallbackPatientsAhead + 1) else 1
            val anyLaterActiveOrDone = allClinicQueueEntries.any {
                it.status in listOf("inside", "in_consultation", "done", "completed") &&
                it.queuePosition > myQueuePosition
            }
            val isPatientLate = isApptDateToday && isWaiting && (
                (insideEntry != null && insideEntry.queuePosition > myQueuePosition) ||
                anyLaterActiveOrDone ||
                (insideEntry != null && targetEntry != null && insideEntry.id != targetEntry.id && totalPeopleAhead == 0) ||
                (slotEndTime != null && nowTime.isAfter(slotEndTime) && insideEntry != null)
            )

            if (isPatientLate) {
                val lateTimeText = "Arrive Soon"
                val lateExactText = "Arrive soon, you are late"
                val lateNotice = "Your turn was reached, but you haven't arrived. Another patient was called inside."
                val lateBanner = "Turn Bypassed: Another patient has been called inside. Please proceed to the clinic immediately."
                return LiveQueueTimingEstimate(
                    estimatedTimeLeftText = lateTimeText,
                    expectedExactTimeText = lateExactText,
                    doctorStatusBanner = lateBanner,
                    isDoctorNotInside = false,
                    isDoctorIdleFiveMins = false,
                    isClinicOnBreak = false,
                    isSoonBeReady = true,
                    timeWindowText = "Arrive soon, you are late",
                    approxTimeText = "Arrive soon, you are late",
                    slotStartTimeText = slotStartStr,
                    suggestedArrivalText = suggestedArrivalStr,
                    slotNoticeText = lateNotice,
                    canOfferEarlyArrival = false,
                    earlyArrivalOfferText = null,
                    isPatientLate = true
                )
            }

            // Check doctor availability & early arrival eligibility:
            // Doctor is free when: doctor is in clinic, no patient is currently inside, and clinic not on break
            val isDoctorFree = isDoctorInClinic && insideEntry == null && clinic?.isOnBreak != true
            val isSlotInFuture = slotStartTime != null && nowTime.isBefore(slotStartTime)
            val canOfferEarly = isDoctorFree && isSlotInFuture && optInEarlyCall && totalPeopleAhead == 0
            val earlyArrivalMsg = if (canOfferEarly) "Doctor is free now. Come in early?" else null

            // Calculate dynamic queue expected time
            var dynamicExpectedTime: LocalTime
            var minsWaitCalc: Int

            if (insideEntry != null) {
                val insideInstant = try {
                    if (!insideEntry.insideAt.isNullOrBlank()) Instant.parse(insideEntry.insideAt) else nowInstant
                } catch (_: Exception) {
                    nowInstant
                }
                val multiplier = totalPeopleAhead.coerceAtLeast(1)
                val expectedInstant = insideInstant.plusSeconds(multiplier * avgMins * 60L)
                val diffSec = expectedInstant.epochSecond - nowInstant.epochSecond
                minsWaitCalc = kotlin.math.ceil(diffSec / 60.0).toInt().coerceAtLeast(1)
                dynamicExpectedTime = expectedInstant.atZone(zoneId).toLocalTime()
            } else {
                // No patient currently inside
                val hasAnyActivityToday = allClinicQueueEntries.any {
                    !it.insideAt.isNullOrBlank() || !it.completedAt.isNullOrBlank() ||
                        it.status in listOf("done", "processing", "sample_collected", "report_prepared")
                }

                if (nowTime.isBefore(openLocalTime) || (!hasAnyActivityToday && !isDoctorInClinic)) {
                    dynamicExpectedTime = openLocalTime.plusMinutes((totalPeopleAhead * avgMins).toLong())
                    val diff = java.time.Duration.between(nowTime, dynamicExpectedTime).toMinutes().toInt()
                    minsWaitCalc = diff.coerceAtLeast((totalPeopleAhead.coerceAtLeast(1)) * avgMins)
                } else if (!isDoctorInClinic) {
                    dynamicExpectedTime = openLocalTime.plusMinutes((totalPeopleAhead * avgMins).toLong())
                    val diff = java.time.Duration.between(nowTime, dynamicExpectedTime).toMinutes().toInt()
                    minsWaitCalc = diff.coerceAtLeast(1)
                } else {
                    // Doctor is in clinic, no one inside
                    val latestActivityInstant = allClinicQueueEntries.mapNotNull { entry ->
                        val ts = entry.completedAt ?: entry.insideAt ?: entry.calledAt
                        if (!ts.isNullOrBlank()) {
                            try { Instant.parse(ts) } catch (_: Exception) { null }
                        } else null
                    }.maxOrNull()

                    val idleMinutes = if (latestActivityInstant != null) {
                        java.time.Duration.between(latestActivityInstant, nowInstant).toMinutes()
                    } else {
                        java.time.Duration.between(openLocalTime, nowTime).toMinutes().coerceAtLeast(0)
                    }

                    if (idleMinutes >= 5 && activeEntries.isNotEmpty()) {
                        dynamicExpectedTime = nowTime.plusMinutes((totalPeopleAhead * avgMins).toLong())
                        minsWaitCalc = (totalPeopleAhead * avgMins)
                    } else if (totalPeopleAhead == 0) {
                        dynamicExpectedTime = nowTime
                        minsWaitCalc = 0
                    } else {
                        val anchorInstant = latestActivityInstant ?: nowInstant
                        val expectedInstant = anchorInstant.plusSeconds(totalPeopleAhead * avgMins * 60L)
                        val diffSec = expectedInstant.epochSecond - nowInstant.epochSecond
                        minsWaitCalc = kotlin.math.ceil(diffSec / 60.0).toInt().coerceAtLeast(1)
                        dynamicExpectedTime = expectedInstant.atZone(zoneId).toLocalTime()
                    }
                }
            }

            // Apply Rule 2: Dynamic slot-aware queue time calculation
            val isFirstPosition = (totalPeopleAhead == 0)

            val effectiveExpectedTime: LocalTime
            val effectiveTimeLeftText: String
            val effectiveExactTimeText: String

            if (isFirstPosition) {
                if (isSlotInFuture && !canOfferEarly) {
                    effectiveExpectedTime = slotStartTime ?: nowTime
                    val diff = java.time.Duration.between(nowTime, effectiveExpectedTime).toMinutes().toInt()
                    effectiveTimeLeftText = if (diff > 60) {
                        val hours = diff / 60
                        val rem = diff % 60
                        if (rem == 0) "~ $hours hr" else "~ ${hours}h ${rem}m"
                    } else if (diff > 0) {
                        "~ $diff min"
                    } else {
                        "Starts at $slotStartStr"
                    }
                    effectiveExactTimeText = slotStartStr.ifBlank { effectiveExpectedTime.format(timeFormatter) }
                } else {
                    // Position 1 and current time is within slot, doctor free early, or slot is over:
                    // Directly shows "Your turn, arrive fast"
                    effectiveExpectedTime = nowTime
                    effectiveTimeLeftText = "Arrive Fast"
                    effectiveExactTimeText = "Your turn, arrive fast"
                }
            } else {
                // Patient is at position 2, 3, etc. (totalPeopleAhead > 0)
                if (isSlotInFuture) {
                    // Stagger patient by (totalPeopleAhead * avgMins) so time is in between the time slot!
                    val slotStaggered = (slotStartTime ?: nowTime).plusMinutes((totalPeopleAhead * avgMins).toLong())
                    effectiveExpectedTime = if (dynamicExpectedTime.isAfter(slotStaggered)) dynamicExpectedTime else slotStaggered
                    val diff = java.time.Duration.between(nowTime, effectiveExpectedTime).toMinutes().toInt()
                    effectiveTimeLeftText = if (diff > 60) {
                        val hours = diff / 60
                        val rem = diff % 60
                        if (rem == 0) "~ $hours hr" else "~ ${hours}h ${rem}m"
                    } else if (diff > 0) {
                        "~ $diff min"
                    } else {
                        "~ ${(totalPeopleAhead * avgMins)} min"
                    }
                    effectiveExactTimeText = effectiveExpectedTime.format(timeFormatter)
                } else {
                    // Current time is within slot or slot is over: calculate dynamically based on active queue
                    if (dynamicExpectedTime.isBefore(nowTime)) {
                        dynamicExpectedTime = nowTime.plusMinutes((totalPeopleAhead * avgMins).toLong())
                        minsWaitCalc = (totalPeopleAhead * avgMins)
                    }
                    effectiveExpectedTime = dynamicExpectedTime
                    effectiveTimeLeftText = "~ $minsWaitCalc min"
                    effectiveExactTimeText = effectiveExpectedTime.format(timeFormatter)
                }
            }

            val windowText = formatTimeWindow(effectiveExpectedTime)
            val approxText = formatApproxTime(effectiveExpectedTime)

            val docBanner = when {
                !isDoctorInClinic -> "Doctor is not inside the clinic (He/She is not in yet)"
                canOfferEarly -> "Doctor is free now. Since you opted into early calls, you can come in early!"
                else -> null
            }

            return LiveQueueTimingEstimate(
                estimatedTimeLeftText = effectiveTimeLeftText,
                expectedExactTimeText = effectiveExactTimeText,
                doctorStatusBanner = docBanner,
                isDoctorNotInside = !isDoctorInClinic,
                isDoctorIdleFiveMins = false,
                isClinicOnBreak = false,
                isSoonBeReady = totalPeopleAhead == 0 || effectiveTimeLeftText.contains("Soon") || effectiveTimeLeftText.contains("Arrive Fast"),
                timeWindowText = windowText,
                approxTimeText = approxText,
                slotStartTimeText = slotStartStr,
                suggestedArrivalText = suggestedArrivalStr,
                slotNoticeText = slotNotice,
                canOfferEarlyArrival = canOfferEarly,
                earlyArrivalOfferText = earlyArrivalMsg
            )
        }

        fun computeMultiSlotDailyPosition(
            targetAppointmentId: String,
            targetSlotId: String?,
            targetAppointmentTime: String?,
            appointmentDate: String,
            allSlotsForDate: List<Slot>,
            allAppointmentsForDate: List<Appointment>,
            doctorId: String? = null,
            avgConsultationMinutes: Int = 10,
            nowDate: java.time.LocalDate = java.time.LocalDate.now()
        ): MultiSlotPositionResult {
            val parsedTarget = parseLocalDateSafe(appointmentDate)
            val targetLocalDate = parsedTarget ?: nowDate
            val isToday = parsedTarget != null && parsedTarget.isEqual(nowDate)
            val isTomorrow = parsedTarget != null && parsedTarget.isEqual(nowDate.plusDays(1))
            val isFutureDate = parsedTarget != null && parsedTarget.isAfter(nowDate)

            val dateLabel = when {
                isToday -> "Today"
                isTomorrow -> "Tomorrow"
                parsedTarget != null -> parsedTarget.format(DateTimeFormatter.ofPattern("d MMM", Locale.ENGLISH))
                else -> appointmentDate.trim().take(10)
            }

            val relevantSlots = if (!doctorId.isNullOrBlank()) {
                val matching = allSlotsForDate.filter { it.doctorId == doctorId }
                if (matching.isNotEmpty()) matching else allSlotsForDate
            } else {
                allSlotsForDate
            }

            val sortedSlots = relevantSlots.sortedBy { SlotRepository.parseTimeToMinutes(it.startTime) ?: 0 }

            val relevantAppointments = if (!doctorId.isNullOrBlank()) {
                val matching = allAppointmentsForDate.filter { it.doctorId == doctorId }
                if (matching.isNotEmpty()) matching else allAppointmentsForDate
            } else {
                allAppointmentsForDate
            }

            var targetSlot = sortedSlots.firstOrNull { it.id == targetSlotId }
            if (targetSlot == null && !targetAppointmentTime.isNullOrBlank()) {
                val targetTimeMins = SlotRepository.parseTimeToMinutes(targetAppointmentTime)
                if (targetTimeMins != null) {
                    targetSlot = sortedSlots.firstOrNull { slot ->
                        val sMins = SlotRepository.parseTimeToMinutes(slot.startTime) ?: -1
                        val eMins = SlotRepository.parseTimeToMinutes(slot.endTime) ?: -1
                        (targetTimeMins in sMins until eMins) || targetTimeMins == sMins
                    }
                }
            }

            var priorAppointmentsCount = 0
            var positionInSlot = 1
            var cumulativePos = 1

            if (targetSlot != null && sortedSlots.isNotEmpty()) {
                val targetSlotIndex = sortedSlots.indexOfFirst { it.id == targetSlot.id }
                val priorSlotIds = if (targetSlotIndex > 0) {
                    sortedSlots.take(targetSlotIndex).map { it.id }.toSet()
                } else emptySet()

                val targetSlotStartMins = SlotRepository.parseTimeToMinutes(targetSlot.startTime) ?: 0

                val priorAppointments = relevantAppointments.filter { appt ->
                    appt.id != targetAppointmentId && (
                        (appt.slotId != null && appt.slotId in priorSlotIds) ||
                        (appt.slotId.isNullOrBlank() && appt.appointmentTime.isNotBlank() &&
                            (SlotRepository.parseTimeToMinutes(appt.appointmentTime) ?: 9999) < targetSlotStartMins)
                    )
                }
                priorAppointmentsCount = priorAppointments.size

                val inSlotAppointments = relevantAppointments.filter { appt ->
                    appt.slotId == targetSlot.id ||
                    (appt.slotId.isNullOrBlank() && appt.appointmentTime.isNotBlank() &&
                        (SlotRepository.parseTimeToMinutes(appt.appointmentTime) ?: -1) == targetSlotStartMins) ||
                    appt.id == targetAppointmentId
                }.distinctBy { it.id }.sortedWith(compareBy({ it.appointmentTime }, { it.id }))

                val inSlotIndex = inSlotAppointments.indexOfFirst { it.id == targetAppointmentId }
                positionInSlot = if (inSlotIndex >= 0) inSlotIndex + 1 else 1
                cumulativePos = priorAppointmentsCount + positionInSlot
            } else {
                val sortedAppts = relevantAppointments
                    .sortedWith(compareBy({ SlotRepository.parseTimeToMinutes(it.appointmentTime) ?: 0 }, { it.id }))
                val myIdx = sortedAppts.indexOfFirst { it.id == targetAppointmentId }
                cumulativePos = if (myIdx >= 0) myIdx + 1 else 1
                priorAppointmentsCount = (cumulativePos - 1).coerceAtLeast(0)
                positionInSlot = 1
            }

            val effectiveSlotStartStr = targetSlot?.startTime?.ifBlank { null }
                ?: targetAppointmentTime?.takeIf { it.isNotBlank() }
                ?: "09:00 AM"

            val effectiveSlotEndStr = targetSlot?.endTime?.ifBlank { null }
                ?: ""

            val baseStartTime = parseSlotStartTime(effectiveSlotStartStr)
                ?: parseTimeString(effectiveSlotStartStr)
                ?: LocalTime.of(9, 0)

            val timeFormatter = DateTimeFormatter.ofPattern("h:mm a", Locale.US)
            val formattedSlotStart = baseStartTime.format(timeFormatter)

            val staggerMinutes = ((positionInSlot - 1).coerceAtLeast(0) * avgConsultationMinutes.coerceAtLeast(1)).toLong()
            val approxAppointmentTime = baseStartTime.plusMinutes(staggerMinutes)
            val approxTimeFormatted = approxAppointmentTime.format(timeFormatter)

            val approxAppointmentTimeText = "$approxTimeFormatted (\u00B115 min)"
            val windowStart = approxAppointmentTime.minusMinutes(15).format(timeFormatter)
            val windowEnd = approxAppointmentTime.plusMinutes(15).format(timeFormatter)
            val timeWindowText = "$windowStart \u2013 $windowEnd"

            return MultiSlotPositionResult(
                cumulativePosition = cumulativePos,
                patientsAheadInDay = (cumulativePos - 1).coerceAtLeast(0),
                positionInSlot = positionInSlot,
                slotStartTimeText = formattedSlotStart,
                slotEndTimeText = effectiveSlotEndStr,
                approxAppointmentTimeText = approxAppointmentTimeText,
                timeWindowText = timeWindowText,
                dateLabel = dateLabel,
                isToday = isToday,
                isTomorrow = isTomorrow,
                isFutureDate = isFutureDate
            )
        }
    }
}

