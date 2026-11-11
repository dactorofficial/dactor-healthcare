package com.dactor.clinic.data.repository

import com.dactor.clinic.data.model.Clinic
import com.dactor.clinic.data.model.ClinicScheduleHelper
import com.dactor.clinic.data.model.QueueEntry
import com.dactor.clinic.data.model.Appointment
import com.dactor.clinic.data.model.DactorNotification
import com.dactor.clinic.data.model.NotificationTemplate
import com.dactor.clinic.data.model.NotificationType
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.functions.functions
import io.github.jan.supabase.postgrest.postgrest
import io.github.jan.supabase.postgrest.rpc
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import android.util.Log
import java.time.Instant
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale
import java.util.UUID
import javax.inject.Inject
import javax.inject.Singleton

@Serializable
data class NotificationInsertDto(
    @SerialName("id") val id: String = UUID.randomUUID().toString(),
    @SerialName("user_id") val userId: String? = null,
    @SerialName("appointment_id") val appointmentId: String? = null,
    @SerialName("title") val title: String,
    @SerialName("message") val message: String,
    @SerialName("type") val type: String = "manual_alert",
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
    val earlyArrivalOfferText: String? = null
)

@Singleton
class QueueRepository @Inject constructor(
    private val supabaseClient: SupabaseClient,
    private val clinicRepository: ClinicRepository,
    private val queueDao: com.dactor.clinic.data.local.dao.QueueDao? = null,
    private val devicePrefixManager: com.dactor.clinic.data.local.DevicePrefixManager? = null
) {
    suspend fun getQueueForClinic(clinicId: String): List<QueueEntry> = withContext(Dispatchers.IO) {
        try {
            // Automatically audit and transfer uncompleted past live queue patients to 'no_show'
            try {
                autoTransferUncompletedQueueToNoShow(clinicId = clinicId, includeTodayExpired = false)
            } catch (ignored: Exception) {}

            var currentEntries = supabaseClient.postgrest["queue_entries"]
                .select {
                    filter {
                        eq("clinic_id", clinicId)
                    }
                }.decodeList<QueueEntry>()

            // Purge rogue queue entries for unapproved or pending appointments
            if (currentEntries.isNotEmpty()) {
                try {
                    val apptIds = currentEntries.map { it.appointmentId }.filter { it.isNotBlank() }
                    if (apptIds.isNotEmpty()) {
                        val appts = supabaseClient.postgrest["appointments"]
                            .select {
                                filter {
                                    isIn("id", apptIds)
                                }
                            }.decodeList<com.dactor.clinic.data.model.Appointment>()
                        val approvedApptIds = appts.filter {
                            it.status.equals("APPROVED", ignoreCase = true) &&
                            it.status != "WAITING_FOR_APPROVAL" &&
                            it.status != "pending_payment" &&
                            it.status != "UNAPPROVED" &&
                            it.status != "EXPIRED" &&
                            it.checkinStatus != "cancelled"
                        }.map { it.id }.toSet()

                        val rogueEntries = currentEntries.filter { it.appointmentId !in approvedApptIds }
                        val rogueApptIds = rogueEntries.map { it.appointmentId }.toSet()

                        if (rogueApptIds.isNotEmpty()) {
                            try {
                                supabaseClient.postgrest["queue_entries"].delete {
                                    filter {
                                        isIn("appointment_id", rogueApptIds.toList())
                                    }
                                }
                            } catch (_: Exception) {}
                            currentEntries = currentEntries.filter { it.appointmentId in approvedApptIds }
                        }
                    }
                } catch (_: Exception) {}
            }

            // Auto-transfer today's approved booked appointments into live queue (unapproved appointments strictly excluded)
            try {
                val todayStr = java.time.LocalDate.now().toString()
                val todayAppts = supabaseClient.postgrest["appointments"]
                    .select {
                        filter {
                            eq("clinic_id", clinicId)
                            eq("appointment_date", todayStr)
                        }
                    }.decodeList<com.dactor.clinic.data.model.Appointment>()
                    .filter {
                        it.checkinStatus != "completed" &&
                            it.checkinStatus != "cancelled" &&
                            it.checkinStatus != "processing" &&
                            it.checkinStatus != "report_prepared" &&
                            it.status.equals("APPROVED", ignoreCase = true) &&
                            it.status != "WAITING_FOR_APPROVAL" &&
                            it.status != "pending_payment" &&
                            it.status != "UNAPPROVED" &&
                            it.status != "EXPIRED"
                    }

                val enrolledIds = currentEntries.map { it.appointmentId }.toSet()
                var nextPos = (currentEntries.map { it.queuePosition }.maxOrNull() ?: 0) + 1
                var addedAny = false

                for (appt in todayAppts) {
                    if (!enrolledIds.contains(appt.id)) {
                        val cleanDocId = appt.doctorId?.takeIf { com.dactor.clinic.domain.util.PatientIdentitySync.isValidUuid(it) }
                        val newEntryDto = QueueEntryInsertDto(
                            id = java.util.UUID.randomUUID().toString(),
                            appointmentId = appt.id,
                            clinicId = clinicId,
                            doctorId = cleanDocId,
                            queuePosition = nextPos++,
                            status = "waiting"
                        )
                        try {
                            supabaseClient.postgrest["queue_entries"].insert(newEntryDto)
                            addedAny = true
                        } catch (e: Exception) {
                            if (cleanDocId != null) {
                                try {
                                    supabaseClient.postgrest["queue_entries"].insert(newEntryDto.copy(doctorId = null))
                                    addedAny = true
                                } catch (ignored: Exception) {}
                            }
                        }
                    }
                    if (appt.checkinStatus == "not_checked_in" || appt.checkinStatus == "registered") {
                        try {
                            supabaseClient.postgrest["appointments"]
                                .update({ set("checkin_status", "checked_in") }) {
                                    filter { eq("id", appt.id) }
                                }
                        } catch (ignored: Exception) {}
                    }
                }

                if (addedAny) {
                    reindexActiveQueue(clinicId, null, sortBySlotTime = true)
                    currentEntries = supabaseClient.postgrest["queue_entries"]
                        .select {
                            filter {
                                eq("clinic_id", clinicId)
                            }
                        }.decodeList<QueueEntry>()
                }
            } catch (ignored: Exception) {}

            val sorted = currentEntries.sortedBy { it.queuePosition }
            try {
                queueDao?.upsertAll(
                    sorted.map { com.dactor.clinic.data.local.entity.QueueEntryEntity.fromDomainModel(it, syncStatus = "synced") }
                )
            } catch (_: Exception) {}
            sorted
        } catch (e: Exception) {
            e.printStackTrace()
            val cached = try {
                queueDao?.getQueueForClinicList(clinicId)?.map { it.toDomainModel() }
            } catch (_: Exception) { null }
            cached ?: emptyList()
        }
    }

    suspend fun getQueueForDoctor(doctorId: String): List<QueueEntry> = withContext(Dispatchers.IO) {
        try {
            // Automatically audit and transfer uncompleted past live queue patients to 'no_show'
            try {
                val doc = try {
                    supabaseClient.postgrest["doctors"]
                        .select { filter { eq("id", doctorId) } }
                        .decodeSingleOrNull<com.dactor.clinic.data.model.Doctor>()
                } catch (e: Exception) { null }
                val docClinicId = doc?.clinicId
                if (!docClinicId.isNullOrBlank()) {
                    autoTransferUncompletedQueueToNoShow(clinicId = docClinicId, includeTodayExpired = false)
                }
            } catch (ignored: Exception) {}

            var currentEntries = supabaseClient.postgrest["queue_entries"]
                .select {
                    filter {
                        eq("doctor_id", doctorId)
                    }
                }.decodeList<QueueEntry>()

            // Purge rogue queue entries for unapproved or pending appointments
            if (currentEntries.isNotEmpty()) {
                try {
                    val apptIds = currentEntries.map { it.appointmentId }.filter { it.isNotBlank() }
                    if (apptIds.isNotEmpty()) {
                        val appts = supabaseClient.postgrest["appointments"]
                            .select {
                                filter {
                                    isIn("id", apptIds)
                                }
                            }.decodeList<com.dactor.clinic.data.model.Appointment>()
                        val approvedApptIds = appts.filter {
                            it.status.equals("APPROVED", ignoreCase = true) &&
                            it.status != "WAITING_FOR_APPROVAL" &&
                            it.status != "pending_payment" &&
                            it.status != "UNAPPROVED" &&
                            it.status != "EXPIRED" &&
                            it.checkinStatus != "cancelled"
                        }.map { it.id }.toSet()

                        val rogueEntries = currentEntries.filter { it.appointmentId !in approvedApptIds }
                        val rogueApptIds = rogueEntries.map { it.appointmentId }.toSet()

                        if (rogueApptIds.isNotEmpty()) {
                            try {
                                supabaseClient.postgrest["queue_entries"].delete {
                                    filter {
                                        isIn("appointment_id", rogueApptIds.toList())
                                    }
                                }
                            } catch (_: Exception) {}
                            currentEntries = currentEntries.filter { it.appointmentId in approvedApptIds }
                        }
                    }
                } catch (_: Exception) {}
            }

            // Auto-transfer today's approved booked appointments for this doctor into live queue
            try {
                val todayStr = java.time.LocalDate.now().toString()
                val todayAppts = supabaseClient.postgrest["appointments"]
                    .select {
                        filter {
                            eq("doctor_id", doctorId)
                            eq("appointment_date", todayStr)
                        }
                    }.decodeList<com.dactor.clinic.data.model.Appointment>()
                    .filter {
                        it.checkinStatus != "completed" &&
                            it.checkinStatus != "done" &&
                            it.checkinStatus != "cancelled" &&
                            it.checkinStatus != "no_show" &&
                            it.checkinStatus != "processing" &&
                            it.checkinStatus != "report_prepared" &&
                            it.status.equals("APPROVED", ignoreCase = true) &&
                            it.status != "WAITING_FOR_APPROVAL" &&
                            it.status != "pending_payment" &&
                            it.status != "UNAPPROVED" &&
                            it.status != "EXPIRED"
                    }

                val enrolledIds = currentEntries.map { it.appointmentId }.toSet()
                var nextPos = (currentEntries.map { it.queuePosition }.maxOrNull() ?: 0) + 1
                var addedAny = false

                for (appt in todayAppts) {
                    if (!enrolledIds.contains(appt.id)) {
                        val newEntryDto = QueueEntryInsertDto(
                            id = java.util.UUID.randomUUID().toString(),
                            appointmentId = appt.id,
                            clinicId = appt.clinicId,
                            doctorId = doctorId,
                            queuePosition = nextPos++,
                            status = "waiting"
                        )
                        try {
                            supabaseClient.postgrest["queue_entries"].insert(newEntryDto)
                            addedAny = true
                        } catch (ignored: Exception) {}
                    }
                    if (appt.checkinStatus == "not_checked_in" || appt.checkinStatus == "registered") {
                        try {
                            supabaseClient.postgrest["appointments"]
                                .update({ set("checkin_status", "checked_in") }) {
                                    filter { eq("id", appt.id) }
                                }
                        } catch (ignored: Exception) {}
                    }
                }

                if (addedAny) {
                    val docClinic = todayAppts.firstOrNull()?.clinicId
                    if (!docClinic.isNullOrBlank()) {
                        reindexActiveQueue(docClinic, doctorId, sortBySlotTime = true)
                    }
                    currentEntries = supabaseClient.postgrest["queue_entries"]
                        .select {
                            filter {
                                eq("doctor_id", doctorId)
                            }
                        }.decodeList<QueueEntry>()
                }
            } catch (ignored: Exception) {}

            val sorted = currentEntries.sortedBy { it.queuePosition }
            try {
                queueDao?.upsertAll(
                    sorted.map { com.dactor.clinic.data.local.entity.QueueEntryEntity.fromDomainModel(it, syncStatus = "synced") }
                )
            } catch (_: Exception) {}
            sorted
        } catch (e: Exception) {
            e.printStackTrace()
            val cached = try {
                queueDao?.getQueueForDoctorOnlyList(doctorId)?.map { it.toDomainModel() }
            } catch (_: Exception) { null }
            cached ?: emptyList()
        }
    }

    suspend fun updateQueueStatus(id: String, status: String, clinicId: String? = null): Boolean = withContext(Dispatchers.IO) {
        try {
            val now = Instant.now().toString()
            val existingEntry = try {
                supabaseClient.postgrest["queue_entries"]
                    .select {
                        filter {
                            or {
                                eq("id", id)
                                eq("appointment_id", id)
                            }
                        }
                    }
                    .decodeSingleOrNull<QueueEntry>()
            } catch (e: Exception) { null }

            val targetEntryId = existingEntry?.id ?: id

            val startTs = existingEntry?.insideAt ?: existingEntry?.calledAt
            val durationSeconds = if ((status == "done" || status == "processing") && !startTs.isNullOrBlank()) {
                try {
                    val start = Instant.parse(startTs).epochSecond
                    val end = Instant.parse(now).epochSecond
                    (end - start).coerceAtLeast(0)
                } catch (e: Exception) { null }
            } else null

            if (existingEntry == null) {
                val appt = try {
                    supabaseClient.postgrest["appointments"]
                        .select { filter { eq("id", id) } }
                        .decodeSingleOrNull<com.dactor.clinic.data.model.Appointment>()
                } catch (e: Exception) { null }

                if (appt == null || !appt.status.equals("APPROVED", ignoreCase = true) ||
                    appt.status == "WAITING_FOR_APPROVAL" || appt.status == "pending_payment" ||
                    appt.status == "UNAPPROVED" || appt.status == "EXPIRED" ||
                    appt.checkinStatus == "cancelled"
                ) {
                    return@withContext false
                }

                val targetClinic = clinicId ?: appt?.clinicId
                if (!targetClinic.isNullOrBlank()) {
                    val cleanDocId = appt?.doctorId?.takeIf { com.dactor.clinic.domain.util.PatientIdentitySync.isValidUuid(it) }
                    val newEntry = QueueEntryInsertDto(
                        id = java.util.UUID.randomUUID().toString(),
                        appointmentId = id,
                        clinicId = targetClinic,
                        doctorId = cleanDocId,
                        queuePosition = 1,
                        status = status,
                        calledAt = if (status == "inside") now else null,
                        insideAt = if (status == "inside") now else null,
                        completedAt = if (status in listOf("done", "processing", "no_show", "sample_collected", "report_prepared")) now else null
                    )
                    try {
                        supabaseClient.postgrest["queue_entries"].insert(newEntry)
                    } catch (e: Exception) {
                        try {
                            supabaseClient.postgrest["queue_entries"].insert(newEntry.copy(doctorId = null))
                        } catch (e2: Exception) {
                            e2.printStackTrace()
                        }
                    }
                }
            } else {
                // Primary update: only guaranteed schema columns so missing optional columns never fail the status transition
                supabaseClient.postgrest["queue_entries"]
                    .update({
                        set("status", status)
                        when (status) {
                            "inside" -> set("called_at", now)
                            "done", "processing", "no_show", "sample_collected", "report_prepared" -> {
                                set("completed_at", now)
                            }
                        }
                    }) {
                        filter {
                            or {
                                eq("id", targetEntryId)
                                eq("appointment_id", id)
                            }
                        }
                    }

                if (status == "inside") {
                    try {
                        supabaseClient.postgrest["queue_entries"]
                            .update({ set("inside_at", now) }) {
                                filter {
                                    or {
                                        eq("id", targetEntryId)
                                        eq("appointment_id", id)
                                    }
                                }
                            }
                    } catch (ignored: Exception) {}
                }

                // Optional column update: persist consultation_duration_seconds if column exists in DB
                if (durationSeconds != null) {
                    try {
                        supabaseClient.postgrest["queue_entries"]
                            .update({
                                set("consultation_duration_seconds", durationSeconds)
                            }) {
                                filter {
                                    or {
                                        eq("id", targetEntryId)
                                        eq("appointment_id", id)
                                    }
                                }
                            }
                    } catch (ignored: Exception) {}
                }
            }

            if (status in listOf("inside", "done", "processing", "no_show", "sample_collected", "report_prepared")) {
                val apptId = existingEntry?.appointmentId ?: id
                if (apptId.isNotBlank()) {
                    try {
                        val newCheckin = when (status) {
                            "inside" -> "inside"
                            "processing" -> "processing"
                            "sample_collected" -> "sample_collected"
                            "report_prepared" -> "report_prepared"
                            "no_show" -> "no_show"
                            else -> "completed"
                        }
                        supabaseClient.postgrest["appointments"]
                            .update({ set("checkin_status", newCheckin) }) {
                                filter { eq("id", apptId) }
                            }
                    } catch (ignored: Exception) {}
                }

                val effectiveCId = if (!clinicId.isNullOrBlank()) clinicId else existingEntry?.clinicId
                if (!effectiveCId.isNullOrBlank()) {
                    reindexActiveQueue(effectiveCId, existingEntry?.doctorId)
                    if (status != "inside") {
                        // Auto-recalculate clinic's average consultation time after every consultancy
                        recalculateAndUpdateClinicAverageTime(effectiveCId)
                    }
                }
            }
            true
        } catch (e: Exception) {
            e.printStackTrace()
            false
        }
    }

    suspend fun updateQueueStatusByAppointmentId(appointmentId: String, status: String): Boolean = withContext(Dispatchers.IO) {
        try {
            val now = Instant.now().toString()
            val existingEntry = try {
                supabaseClient.postgrest["queue_entries"]
                    .select { filter { eq("appointment_id", appointmentId) } }
                    .decodeSingleOrNull<QueueEntry>()
            } catch (e: Exception) { null }

            supabaseClient.postgrest["queue_entries"]
                .update({
                    set("status", status)
                    if (status == "inside") {
                        set("inside_at", now)
                        set("called_at", now)
                    } else if (status in listOf("done", "report_prepared", "processing", "no_show", "sample_collected")) {
                        set("completed_at", now)
                    }
                }) {
                    filter {
                        eq("appointment_id", appointmentId)
                    }
                }

            val newCheckin = when (status) {
                "inside" -> "inside"
                "processing" -> "processing"
                "sample_collected" -> "sample_collected"
                "report_prepared" -> "report_prepared"
                "no_show" -> "no_show"
                "done" -> "completed"
                else -> null
            }
            if (newCheckin != null) {
                try {
                    supabaseClient.postgrest["appointments"]
                        .update({ set("checkin_status", newCheckin) }) {
                            filter { eq("id", appointmentId) }
                        }
                } catch (ignored: Exception) {}
            }

            val cId = existingEntry?.clinicId
            if (!cId.isNullOrBlank()) {
                reindexActiveQueue(cId, existingEntry?.doctorId)
                if (status != "inside" && status != "waiting") {
                    recalculateAndUpdateClinicAverageTime(cId)
                }
            }
            true
        } catch (e: Exception) {
            e.printStackTrace()
            false
        }
    }

    /**
     * Automatically transfers patients in live queue whose appointment is not completed to 'no_show'.
     * Handles past-day appointments (where appointment_date < today) and optionally today's expired slots/appointments.
     */
    suspend fun autoTransferUncompletedQueueToNoShow(
        clinicId: String,
        includeTodayExpired: Boolean = false,
        todayCutoffMinutes: Int = 60
    ): Int = withContext(Dispatchers.IO) {
        if (clinicId.isBlank()) return@withContext 0
        try {
            // 1. First attempt server-side RPC for atomic execution
            try {
                @Serializable
                data class AutoNoShowParams(
                    val p_clinic_id: String,
                    val p_include_today: Boolean = false,
                    val p_today_cutoff_minutes: Int = 60
                )
                supabaseClient.postgrest.rpc(
                    "auto_transfer_uncompleted_queue_to_noshow",
                    AutoNoShowParams(clinicId, includeTodayExpired, todayCutoffMinutes)
                )
                reindexActiveQueue(clinicId, null)
                return@withContext 1
            } catch (rpcErr: Exception) {
                // Fall back to client-side batch sweep if RPC is not available
            }

            val today = LocalDate.now()
            val todayStr = today.toString()
            val nowTime = LocalTime.now()
            val currentMinutesToday = nowTime.hour * 60 + nowTime.minute
            val nowIso = Instant.now().toString()

            val allAppts = try {
                supabaseClient.postgrest["appointments"]
                    .select { filter { eq("clinic_id", clinicId) } }
                    .decodeList<Appointment>()
            } catch (e: Exception) {
                emptyList()
            }

            val activeEntries = try {
                supabaseClient.postgrest["queue_entries"]
                    .select {
                        filter {
                            eq("clinic_id", clinicId)
                            or {
                                eq("status", "waiting")
                                eq("status", "inside")
                                eq("status", "skipped")
                            }
                        }
                    }.decodeList<QueueEntry>()
            } catch (e: Exception) {
                emptyList()
            }

            val apptMap = allAppts.associateBy { it.id }
            var transferredCount = 0

            // 1. Process all uncompleted appointments whose scheduled day has passed
            val pastMissedAppts = allAppts.filter { appt ->
                val isPastDate = appt.appointmentDate.isNotBlank() && appt.appointmentDate < todayStr
                val isUnfinished = appt.checkinStatus != "completed" &&
                        appt.checkinStatus != "done" &&
                        appt.checkinStatus != "processing" &&
                        appt.checkinStatus != "report_prepared" &&
                        appt.checkinStatus != "no_show" &&
                        appt.checkinStatus != "cancelled"

                val isTodayExpired = if (includeTodayExpired && appt.appointmentDate == todayStr && isUnfinished) {
                    val endMin = AppointmentRepository.parseAppointmentEndTimeToMinutes(appt.appointmentTime)
                    (currentMinutesToday >= endMin + todayCutoffMinutes)
                } else false

                isUnfinished && (isPastDate || isTodayExpired)
            }

            for (appt in pastMissedAppts) {
                try {
                    supabaseClient.postgrest["appointments"]
                        .update({
                            set("checkin_status", "no_show")
                        }) {
                            filter { eq("id", appt.id) }
                        }

                    if (!appt.slotId.isNullOrBlank()) {
                        try {
                            val slotAppts = supabaseClient.postgrest["appointments"]
                                .select { filter { eq("slot_id", appt.slotId) } }
                                .decodeList<Appointment>()
                            val realCount = slotAppts.count { it.id != appt.id && it.checkinStatus != "cancelled" && it.checkinStatus != "no_show" }
                            supabaseClient.postgrest["slots"]
                                .update({ set("booked_count", realCount) }) {
                                    filter { eq("id", appt.slotId) }
                                }
                        } catch (_: Exception) {}
                    }
                    transferredCount++
                } catch (e: Exception) {
                    e.printStackTrace()
                }
            }

            // 2. Mark active queue entries matching past appointments or past created_at as no_show
            for (entry in activeEntries) {
                val appt = apptMap[entry.appointmentId]
                var shouldMarkNoShow = false

                if (appt != null) {
                    val isPastDate = appt.appointmentDate.isNotBlank() && appt.appointmentDate < todayStr
                    val isUnfinished = appt.checkinStatus != "completed" &&
                        appt.checkinStatus != "done" &&
                        appt.checkinStatus != "processing" &&
                        appt.checkinStatus != "report_prepared" &&
                        appt.checkinStatus != "no_show" &&
                        appt.checkinStatus != "cancelled"
                    val isTodayExpired = if (includeTodayExpired && appt.appointmentDate == todayStr && isUnfinished) {
                        val endMin = AppointmentRepository.parseAppointmentEndTimeToMinutes(appt.appointmentTime)
                        (currentMinutesToday >= endMin + todayCutoffMinutes)
                    } else false

                    if (isUnfinished && (isPastDate || isTodayExpired)) {
                        shouldMarkNoShow = true
                    }
                } else {
                    // Orphaned queue entry with past created_at
                    if (!entry.createdAt.isNullOrBlank() && entry.createdAt.length >= 10) {
                        val createdDate = entry.createdAt.substring(0, 10)
                        if (createdDate < todayStr) {
                            shouldMarkNoShow = true
                        }
                    }
                }

                if (shouldMarkNoShow) {
                    try {
                        supabaseClient.postgrest["queue_entries"]
                            .update({
                                set("status", "no_show")
                                set("completed_at", nowIso)
                            }) {
                                filter { eq("id", entry.id) }
                            }
                    } catch (e: Exception) {
                        e.printStackTrace()
                    }
                }
            }

            if (transferredCount > 0) {
                reindexActiveQueue(clinicId, null)
            }
            transferredCount
        } catch (e: Exception) {
            e.printStackTrace()
            0
        }
    }

    data class ClinicAverageCalculationResult(
        val effectiveAvgMinutes: Int,
        val manualAvgMinutes: Int,
        val calculatedAvgMinutes: Int?,
        val completedVisitsCount: Int,
        val outliersOmittedCount: Int,
        val isAutoReplaced: Boolean,
        val mode: String = "auto"
    )

    suspend fun recalculateAndUpdateClinicAverageTime(clinicId: String): ClinicAverageCalculationResult = withContext(Dispatchers.IO) {
        try {
            val clinic = clinicRepository.getClinicById(clinicId)

            val manualMinutes = clinic?.manualAvgConsultationTimeMinutes ?: clinic?.avgConsultationTimeMinutes ?: 10
            val currentMode = clinic?.avgTimeMode ?: "auto"

            val doneEntries = supabaseClient.postgrest["queue_entries"]
                .select {
                    filter {
                        eq("clinic_id", clinicId)
                        or {
                            eq("status", "done")
                            eq("status", "processing")
                            eq("status", "sample_collected")
                            eq("status", "report_prepared")
                        }
                    }
                }.decodeList<QueueEntry>()

            val validDurations = doneEntries.mapNotNull { entry ->
                if (entry.consultationDurationSeconds != null && entry.consultationDurationSeconds > 0) {
                    entry.consultationDurationSeconds
                } else if (!entry.insideAt.isNullOrBlank() && !entry.completedAt.isNullOrBlank()) {
                    try {
                        val start = Instant.parse(entry.insideAt).epochSecond
                        val end = Instant.parse(entry.completedAt).epochSecond
                        val diff = end - start
                        if (diff > 0) diff else null
                    } catch (e: Exception) { null }
                } else null
            }

            if (validDurations.isEmpty()) {
                val result = ClinicAverageCalculationResult(
                    effectiveAvgMinutes = manualMinutes,
                    manualAvgMinutes = manualMinutes,
                    calculatedAvgMinutes = null,
                    completedVisitsCount = 0,
                    outliersOmittedCount = 0,
                    isAutoReplaced = false,
                    mode = currentMode
                )
                if (clinic != null) {
                    clinicRepository.updateClinic(
                        clinicId,
                        clinic.copy(
                            avgConsultationTimeMinutes = manualMinutes,
                            manualAvgConsultationTimeMinutes = manualMinutes
                        )
                    )
                }
                return@withContext result
            }

            // 1. Calculate preliminary calculated average
            val preliminaryAvgSec = validDurations.average()

            // 2. Outlier filtering:
            // "if any specific appointment is largely deviated from calculated average like directly 2 times or more than the calculated average not given average omit that specific data"
            val outlierLimitSec = 2.0 * preliminaryAvgSec
            val cleanDurations = validDurations.filter { it < outlierLimitSec }
            val outliersCount = validDurations.size - cleanDurations.size

            // 3. Re-calculate actual average without outliers
            val actualAvgSec = if (cleanDurations.isNotEmpty()) cleanDurations.average() else preliminaryAvgSec
            val calculatedMinutes = kotlin.math.round(actualAvgSec / 60.0).toInt().coerceAtLeast(1)

            // 4. Replacement logic:
            // "once the actual calculated time comes near like + - 5 minutes it will be replaced by actual average"
            val diff = kotlin.math.abs(calculatedMinutes - manualMinutes)
            val isWithinFiveMinutes = diff <= 5

            val effectiveMinutes = when (currentMode) {
                "manual" -> manualMinutes
                "calculated" -> calculatedMinutes
                else -> if (isWithinFiveMinutes) calculatedMinutes else manualMinutes // "auto"
            }

            if (clinic != null) {
                clinicRepository.updateClinic(
                    clinicId,
                    clinic.copy(
                        avgConsultationTimeMinutes = effectiveMinutes,
                        calculatedAvgConsultationTimeMinutes = calculatedMinutes,
                        manualAvgConsultationTimeMinutes = manualMinutes,
                        avgTimeMode = currentMode
                    )
                )
            }

            ClinicAverageCalculationResult(
                effectiveAvgMinutes = effectiveMinutes,
                manualAvgMinutes = manualMinutes,
                calculatedAvgMinutes = calculatedMinutes,
                completedVisitsCount = validDurations.size,
                outliersOmittedCount = outliersCount,
                isAutoReplaced = (currentMode == "auto" && isWithinFiveMinutes),
                mode = currentMode
            )
        } catch (e: Exception) {
            e.printStackTrace()
            ClinicAverageCalculationResult(
                effectiveAvgMinutes = 10,
                manualAvgMinutes = 10,
                calculatedAvgMinutes = null,
                completedVisitsCount = 0,
                outliersOmittedCount = 0,
                isAutoReplaced = false,
                mode = "auto"
            )
        }
    }

    suspend fun getClinicAverageTimeDetails(clinicId: String): ClinicAverageCalculationResult = withContext(Dispatchers.IO) {
        recalculateAndUpdateClinicAverageTime(clinicId)
    }

    suspend fun updateClinicAverageTimePreference(clinicId: String, manualMinutes: Int, mode: String = "auto"): Boolean = withContext(Dispatchers.IO) {
        try {
            val calcResult = recalculateAndUpdateClinicAverageTime(clinicId)
            val effective = when (mode) {
                "manual" -> manualMinutes
                "calculated" -> calcResult.calculatedAvgMinutes ?: manualMinutes
                else -> {
                    val calc = calcResult.calculatedAvgMinutes
                    if (calc != null && kotlin.math.abs(calc - manualMinutes) <= 5) calc else manualMinutes
                }
            }

            val clinic = clinicRepository.getClinicById(clinicId)
            if (clinic != null) {
                clinicRepository.updateClinic(
                    clinicId,
                    clinic.copy(
                        manualAvgConsultationTimeMinutes = manualMinutes,
                        avgConsultationTimeMinutes = effective,
                        calculatedAvgConsultationTimeMinutes = calcResult.calculatedAvgMinutes,
                        avgTimeMode = mode
                    )
                )
            } else {
                false
            }
        } catch (e: Exception) {
            e.printStackTrace()
            false
        }
    }

    suspend fun getClinicAverageTimeMinutes(clinicId: String): Int = withContext(Dispatchers.IO) {
        try {
            val clinic = clinicRepository.getClinicById(clinicId)
            clinic?.getEffectiveAvgMinutes() ?: 10
        } catch (e: Exception) {
            10
        }
    }

    suspend fun updateClinicAverageTimeMinutes(clinicId: String, minutes: Int): Boolean = withContext(Dispatchers.IO) {
        updateClinicAverageTimePreference(clinicId, minutes, "manual")
    }

    suspend fun reindexActiveQueue(
        clinicId: String,
        doctorId: String? = null,
        sortBySlotTime: Boolean = false
    ): Boolean = withContext(Dispatchers.IO) {
        try {
            val activeEntries = supabaseClient.postgrest["queue_entries"]
                .select {
                    filter {
                        eq("clinic_id", clinicId)
                        if (!doctorId.isNullOrBlank()) {
                            eq("doctor_id", doctorId)
                        }
                        or {
                            eq("status", "waiting")
                            eq("status", "inside")
                        }
                    }
                }.decodeList<QueueEntry>()

            if (activeEntries.isEmpty()) return@withContext true

            val apptMap = if (sortBySlotTime) {
                try {
                    supabaseClient.postgrest["appointments"]
                        .select {
                            filter {
                                eq("clinic_id", clinicId)
                                if (!doctorId.isNullOrBlank()) {
                                    eq("doctor_id", doctorId)
                                }
                            }
                        }.decodeList<com.dactor.clinic.data.model.Appointment>()
                        .associateBy { it.id }
                } catch (e: Exception) {
                    emptyMap()
                }
            } else {
                emptyMap()
            }

            // Group by doctorId to partition queues per cabin/doctor
            val groupedEntries = if (!doctorId.isNullOrBlank()) {
                mapOf(doctorId to activeEntries)
            } else {
                activeEntries.groupBy { it.doctorId ?: "" }
            }

            for ((_, group) in groupedEntries) {
                // Patients currently inside consultation room maintain #1.
                // Waiting entries keep existing queuePosition priority unless chronological slot sort is explicitly requested.
                val sortedEntries = if (sortBySlotTime) {
                    group.sortedWith(
                        compareBy<QueueEntry> { if (it.status == "inside") 0 else 1 }
                            .thenBy { entry ->
                                val appt = apptMap[entry.appointmentId]
                                AppointmentRepository.parseTimeToMinutes(appt?.appointmentTime)
                            }.thenBy { it.queuePosition }
                    )
                } else {
                    group.sortedWith(
                        compareBy<QueueEntry> { if (it.status == "inside") 0 else 1 }
                            .thenBy { it.queuePosition }
                    )
                }

                // Two-pass update with negative offsets to prevent unique key violation
                for (entry in sortedEntries) {
                    try {
                        supabaseClient.postgrest["queue_entries"]
                            .update({ set("queue_position", - (entry.queuePosition + 10000)) }) {
                                filter { eq("id", entry.id) }
                            }
                    } catch (ignored: Exception) {}
                }

                sortedEntries.forEachIndexed { index, entry ->
                    val newPosition = index + 1
                    try {
                        supabaseClient.postgrest["queue_entries"]
                            .update({ set("queue_position", newPosition) }) {
                                filter { eq("id", entry.id) }
                            }
                    } catch (ignored: Exception) {}
                }
            }
            true
        } catch (e: Exception) {
            e.printStackTrace()
            false
        }
    }

    suspend fun reorderQueue(orderedEntries: List<QueueEntry>): Boolean = withContext(Dispatchers.IO) {
        try {
            orderedEntries.forEachIndexed { index, entry ->
                supabaseClient.postgrest["queue_entries"]
                    .update({
                        set("queue_position", index + 1)
                    }) {
                        filter {
                            eq("id", entry.id)
                        }
                    }
            }
            true
        } catch (e: Exception) {
            e.printStackTrace()
            false
        }
    }

    private fun buildMetaTaggedMessage(
        cleanMessage: String,
        leftLabel: String = "Estimated Time Left",
        leftValue: String,
        rightLabel: String = "Your Appointment Time",
        rightValue: String,
        trackingCode: String? = null
    ): String {
        val safeLeftLabel = leftLabel.replace("|", "/").replace("]", "")
        val safeLeftVal = leftValue.replace("|", "/").replace("]", "")
        val safeRightLabel = rightLabel.replace("|", "/").replace("]", "")
        val safeRightVal = rightValue.replace("|", "/").replace("]", "")
        val codePart = if (!trackingCode.isNullOrBlank()) "|code=${trackingCode.trim()}" else ""
        return "${cleanMessage.trim()}\n[[META:leftLabel=$safeLeftLabel|leftVal=$safeLeftVal|rightLabel=$safeRightLabel|rightVal=$safeRightVal$codePart]]"
    }

    private suspend fun insertNotificationRowSafely(dto: NotificationInsertDto): Boolean {
        try {
            supabaseClient.postgrest["notifications"].insert(dto)
            return true
        } catch (e: Exception) {
            e.printStackTrace()
            // Fallback: if user_id or appointment_id foreign key rejected the insert, retry with nullable fields cleared
            try {
                val fallbackDto = dto.copy(
                    id = UUID.randomUUID().toString(),
                    userId = null
                )
                supabaseClient.postgrest["notifications"].insert(fallbackDto)
                return true
            } catch (e2: Exception) {
                try {
                    val minimalDto = dto.copy(
                        id = UUID.randomUUID().toString(),
                        userId = null,
                        appointmentId = null
                    )
                    supabaseClient.postgrest["notifications"].insert(minimalDto)
                    return true
                } catch (e3: Exception) {
                    e3.printStackTrace()
                    return false
                }
            }
        }
    }

    suspend fun sendManualNotification(
        appointmentId: String,
        title: String,
        message: String,
        trackingCode: String? = null,
        estimatedTimeLeft: String? = null,
        expectedTime: String? = null,
        leftLabel: String = "Estimated Time Left",
        rightLabel: String = "Your Appointment Time",
        type: String = "manual_alert"
    ): Boolean = withContext(Dispatchers.IO) {
        try {
            val appt = try {
                supabaseClient.postgrest["appointments"]
                    .select { filter { eq("id", appointmentId) } }
                    .decodeSingleOrNull<com.dactor.clinic.data.model.Appointment>()
            } catch (e: Exception) { null }

            val apptUserId = appt?.userId?.takeIf { it.isNotBlank() }
            val effectiveTrackingCode = trackingCode?.takeIf { it.isNotBlank() } ?: appt?.trackingCode10Digit
            val validUuidApptId = appt?.id ?: appointmentId.takeIf { it.length == 36 && it.contains("-") }

            val isFirstPos = message.contains("position 1", ignoreCase = true) ||
                message.contains("next in line", ignoreCase = true) ||
                expectedTime?.contains("arrive fast", ignoreCase = true) == true ||
                estimatedTimeLeft?.contains("arrive fast", ignoreCase = true) == true

            val leftVal = if (isFirstPos) "Arrive Fast" else (estimatedTimeLeft?.takeIf { it.isNotBlank() } ?: "Soon, be ready")
            val rightVal = if (isFirstPos) "Your turn, arrive fast" else (expectedTime?.takeIf { it.isNotBlank() }
                ?: appt?.appointmentTime?.takeIf { it.isNotBlank() }
                ?: "Soon, be ready")
            val effectiveRightLabel = if (isFirstPos) "Turn Status" else rightLabel

            val taggedMessage = if (message.contains("[[META:")) {
                message
            } else {
                NotificationTemplate.ManualAlert.buildMessage(
                    cleanMessage = message,
                    leftLabel = leftLabel,
                    leftVal = leftVal,
                    rightLabel = effectiveRightLabel,
                    rightVal = rightVal,
                    trackingCode = effectiveTrackingCode
                )
            }

            val dto = NotificationInsertDto(
                id = UUID.randomUUID().toString(),
                userId = apptUserId,
                appointmentId = validUuidApptId,
                title = title,
                message = taggedMessage,
                type = type,
                targetAudience = "specific",
                isRead = false
            )
            val inserted = insertNotificationRowSafely(dto)

            // Direct FCM push alert dispatch to patient device
            if (validUuidApptId != null) {
                try {
                    val targetClinicId = appt?.clinicId
                    supabaseClient.functions.invoke(
                        function = "send-fcm-alert",
                        body = buildJsonObject {
                            put("appointmentId", validUuidApptId)
                            if (!targetClinicId.isNullOrBlank()) {
                                put("clinicId", targetClinicId)
                            }
                            put("title", title.trim())
                            put("message", message.trim())
                            put("type", type)
                            if (!effectiveTrackingCode.isNullOrBlank()) {
                                put("trackingCode", effectiveTrackingCode)
                            }
                        }
                    )
                } catch (eFcm: Exception) {
                    Log.w("QueueRepository", "send-fcm-alert failed for appointment $validUuidApptId", eFcm)
                }
            }
            inserted
        } catch (e: Exception) {
            e.printStackTrace()
            false
        }
    }

    suspend fun getClinicNotifications(clinicId: String): List<DactorNotification> = withContext(Dispatchers.IO) {
        try {
            val apptIds = try {
                supabaseClient.postgrest["appointments"]
                    .select { filter { eq("clinic_id", clinicId) } }
                    .decodeList<Appointment>()
                    .map { it.id }
            } catch (e: Exception) {
                emptyList()
            }
            val allNotes = try {
                supabaseClient.postgrest["notifications"]
                    .select {
                        order("created_at", io.github.jan.supabase.postgrest.query.Order.DESCENDING)
                        limit(50)
                    }.decodeList<DactorNotification>()
            } catch (e: Exception) {
                emptyList()
            }
            if (apptIds.isEmpty()) {
                allNotes.take(30)
            } else {
                val apptIdSet = apptIds.toSet()
                allNotes.filter { it.appointmentId == null || apptIdSet.contains(it.appointmentId) }
            }
        } catch (e: Exception) {
            e.printStackTrace()
            emptyList()
        }
    }

    suspend fun sendClinicBroadcastNotification(
        clinicId: String,
        title: String,
        cleanMessage: String,
        leftLabel: String = "Status",
        leftVal: String = "Clinic Alert",
        rightLabel: String = "Target",
        rightVal: String = "All Patients"
    ): Boolean = withContext(Dispatchers.IO) {
        try {
            val tagged = NotificationTemplate.ClinicBroadcast.buildMessage(
                cleanMessage = cleanMessage,
                leftLabel = leftLabel,
                leftVal = leftVal,
                rightLabel = rightLabel,
                rightVal = rightVal
            )
            val dto = NotificationInsertDto(
                id = UUID.randomUUID().toString(),
                userId = null,
                appointmentId = null,
                title = title,
                message = tagged,
                type = NotificationType.CLINIC_BROADCAST.key,
                targetAudience = "clinic_$clinicId",
                isRead = false
            )
            val inserted = insertNotificationRowSafely(dto)

            // Direct FCM push broadcast dispatch to clinic topic and active patients
            if (clinicId.isNotBlank()) {
                try {
                    supabaseClient.functions.invoke(
                        function = "send-fcm-alert",
                        body = buildJsonObject {
                            put("clinicId", clinicId)
                            put("title", title.trim())
                            put("message", cleanMessage.trim())
                            put("type", NotificationType.CLINIC_BROADCAST.key)
                        }
                    )
                } catch (eFcm: Exception) {
                    Log.w("QueueRepository", "send-fcm-alert failed for clinic broadcast $clinicId", eFcm)
                }
            }
            inserted
        } catch (e: Exception) {
            e.printStackTrace()
            false
        }
    }

    suspend fun sendClinicBreakNotificationsToActiveAppointments(
        clinicId: String,
        clinicName: String,
        breakWindowText: String? = null
    ): Int = withContext(Dispatchers.IO) {
        try {
            val todayStr = LocalDate.now().toString()
            val activeAppts = supabaseClient.postgrest["appointments"]
                .select {
                    filter {
                        eq("clinic_id", clinicId)
                        eq("appointment_date", todayStr)
                    }
                }.decodeList<com.dactor.clinic.data.model.Appointment>()
                .filter {
                    val status = it.checkinStatus?.lowercase() ?: ""
                    status !in listOf("completed", "done", "finished", "cancelled", "no_show", "report_prepared") &&
                        status in listOf("waiting", "checked_in", "inside")
                }

            var sentCount = 0
            val title = NotificationTemplate.ClinicBreak.buildTitle(clinicName)

            for (appt in activeAppts) {
                val tagged = NotificationTemplate.ClinicBreak.buildMessage(
                    clinicName = clinicName,
                    breakWindowText = breakWindowText,
                    appointmentTime = appt.appointmentTime,
                    trackingCode = appt.trackingCode10Digit
                )
                val dto = NotificationInsertDto(
                    id = UUID.randomUUID().toString(),
                    userId = appt.userId?.takeIf { it.isNotBlank() },
                    appointmentId = appt.id.takeIf { it.length == 36 },
                    title = title,
                    message = tagged,
                    type = NotificationType.CLINIC_BREAK.key,
                    targetAudience = "specific",
                    isRead = false
                )
                if (insertNotificationRowSafely(dto)) {
                    sentCount++
                    if (appt.id.length == 36) {
                        try {
                            supabaseClient.functions.invoke(
                                function = "send-fcm-alert",
                                body = buildJsonObject {
                                    put("appointmentId", appt.id)
                                    put("title", title.trim())
                                    put("message", "Clinic is currently on break: ${breakWindowText ?: "Please check with reception"}")
                                    put("type", NotificationType.CLINIC_BREAK.key)
                                }
                            )
                        } catch (_: Exception) {}
                    }
                }
            }
            sentCount
        } catch (e: Exception) {
            e.printStackTrace()
            0
        }
    }

    suspend fun notifyDoctorPresenceToPatients(
        doctorId: String,
        doctorName: String,
        clinicName: String,
        isInClinic: Boolean
    ): Int = withContext(Dispatchers.IO) {
        try {
            val todayStr = java.time.LocalDate.now().toString()
            val allAppts = try {
                supabaseClient.postgrest["appointments"]
                    .select {
                        filter {
                            eq("doctor_id", doctorId)
                            eq("appointment_date", todayStr)
                        }
                    }
                    .decodeList<Appointment>()
            } catch (e: Exception) {
                emptyList()
            }

            val waitingAppts = allAppts.filter { appt ->
                val status = appt.checkinStatus?.lowercase() ?: ""
                status in listOf("waiting", "checked_in", "booked", "inside", "pending")
            }

            if (waitingAppts.isEmpty()) return@withContext 0

            val title = if (isInClinic) {
                NotificationTemplate.DoctorArrived.buildTitle(doctorName)
            } else {
                NotificationTemplate.DoctorSteppedOut.buildTitle(doctorName)
            }

            val notifType = if (isInClinic) NotificationType.DOCTOR_ARRIVAL.key else NotificationType.DOCTOR_STATUS.key

            var sentCount = 0
            for (appt in waitingAppts) {
                val tagged = if (isInClinic) {
                    NotificationTemplate.DoctorArrived.buildMessage(
                        patientName = appt.patientName,
                        doctorName = doctorName,
                        clinicName = clinicName,
                        code = appt.trackingCode10Digit
                    )
                } else {
                    NotificationTemplate.DoctorSteppedOut.buildMessage(
                        patientName = appt.patientName,
                        doctorName = doctorName,
                        clinicName = clinicName,
                        code = appt.trackingCode10Digit
                    )
                }

                val dto = NotificationInsertDto(
                    id = UUID.randomUUID().toString(),
                    userId = appt.userId?.takeIf { it.isNotBlank() },
                    appointmentId = appt.id.takeIf { it.length == 36 },
                    title = title,
                    message = tagged,
                    type = notifType,
                    targetAudience = "specific",
                    isRead = false
                )
                if (insertNotificationRowSafely(dto)) {
                    sentCount++
                    if (appt.id.length == 36) {
                        try {
                            val cleanMsg = if (isInClinic) "Doctor $doctorName has arrived at $clinicName." else "Doctor $doctorName has temporarily stepped out."
                            supabaseClient.functions.invoke(
                                function = "send-fcm-alert",
                                body = buildJsonObject {
                                    put("appointmentId", appt.id)
                                    put("title", title.trim())
                                    put("message", cleanMsg)
                                    put("type", notifType)
                                }
                            )
                        } catch (eFcm: Exception) {
                            Log.w("QueueRepository", "send-fcm-alert failed for doctor presence appt ${appt.id}", eFcm)
                        }
                    }
                }
            }
            sentCount
        } catch (e: Exception) {
            e.printStackTrace()
            0
        }
    }

    /**
     * Sends an urgent "Doctor is Calling You Inside" notification and high-priority FCM alert
     * to the patient whose turn is called now.
     */
    suspend fun notifyCallInside(
        appointmentId: String,
        patientName: String,
        doctorName: String,
        trackingCode: String? = null,
        roomNumber: String? = null
    ): Boolean = withContext(Dispatchers.IO) {
        try {
            val validUuid = appointmentId.takeIf { it.length == 36 && it.contains("-") }
            val title = "🔔 Doctor is Calling You Inside!"
            val roomText = if (!roomNumber.isNullOrBlank()) "room $roomNumber" else "the consultation room"
            val cleanMsg = "Dear $patientName, Dr. $doctorName is ready for your consultation. Please proceed to $roomText now."
            val safeCode = trackingCode?.takeIf { it.isNotBlank() } ?: appointmentId.take(10)
            val tagged = NotificationTemplate.DoctorCallingInside.buildMessage(
                patientName = patientName,
                code = safeCode,
                queuePosition = 1
            )
            val dto = NotificationInsertDto(
                id = UUID.randomUUID().toString(),
                userId = null,
                appointmentId = validUuid,
                title = title,
                message = tagged,
                type = "turn_call",
                targetAudience = "specific",
                isRead = false
            )
            val inserted = insertNotificationRowSafely(dto)
            if (validUuid != null) {
                try {
                    val appt = try {
                        supabaseClient.postgrest["appointments"]
                            .select { filter { eq("id", validUuid) } }
                            .decodeSingleOrNull<com.dactor.clinic.data.model.Appointment>()
                    } catch (_: Exception) { null }
                    val targetClinicId = appt?.clinicId
                    supabaseClient.functions.invoke(
                        function = "send-fcm-alert",
                        body = buildJsonObject {
                            put("appointmentId", validUuid)
                            if (!targetClinicId.isNullOrBlank()) {
                                put("clinicId", targetClinicId)
                            }
                            put("title", title)
                            put("message", cleanMsg)
                            put("type", "turn_call")
                            if (!safeCode.isNullOrBlank()) {
                                put("trackingCode", safeCode)
                            }
                        }
                    )
                } catch (eFcm: Exception) {
                    Log.w("QueueRepository", "send-fcm-alert failed for call inside $validUuid", eFcm)
                }
            }
            inserted
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
            val title = com.dactor.clinic.data.model.NotificationTemplate.EarlyArrivalInvite.buildTitle()
            val msg = com.dactor.clinic.data.model.NotificationTemplate.EarlyArrivalInvite.buildMessage(
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
            insertNotificationRowSafely(dto)
        } catch (e: Exception) {
            e.printStackTrace()
            false
        }
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
            optInEarlyCall: Boolean = false
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
                        val ts = entry.completedAt ?: entry.insideAt
                        if (!ts.isNullOrBlank()) {
                            try { Instant.parse(ts) } catch (_: Exception) { null }
                        } else null
                    }.maxOrNull() ?: allClinicQueueEntries.mapNotNull { entry ->
                        if (!entry.createdAt.isNullOrBlank()) {
                            try { Instant.parse(entry.createdAt) } catch (_: Exception) { null }
                        } else null
                    }.minOrNull()

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
    }
}

