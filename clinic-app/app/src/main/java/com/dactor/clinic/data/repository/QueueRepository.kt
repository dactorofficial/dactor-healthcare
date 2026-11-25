package com.dactor.clinic.data.repository

import com.dactor.clinic.data.model.Clinic
import com.dactor.clinic.data.model.ClinicScheduleHelper
import com.dactor.clinic.data.model.QueueEntry
import com.dactor.clinic.data.model.Appointment
import com.dactor.clinic.data.model.DactorNotification
import com.dactor.clinic.data.model.NotificationTemplate
import com.dactor.clinic.data.model.NotificationType
import com.dactor.clinic.data.model.TransitionQueueEntryStatusResult
import com.dactor.clinic.domain.model.QueueConflictException
import com.dactor.clinic.domain.util.PatientIdentitySync
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.functions.functions
import io.github.jan.supabase.postgrest.postgrest
import io.github.jan.supabase.postgrest.rpc
import io.github.jan.supabase.realtime.PostgresAction
import io.github.jan.supabase.realtime.RealtimeChannel
import io.github.jan.supabase.realtime.channel
import io.github.jan.supabase.realtime.postgresChangeFlow
import io.github.jan.supabase.realtime.realtime
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.flow.debounce
import kotlinx.coroutines.flow.merge
import kotlinx.coroutines.launch
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

@Serializable
data class FastLiveQueueItemDto(
    @SerialName("id") val id: String = "",
    @SerialName("appointment_id") val appointmentId: String = "",
    @SerialName("clinic_id") val clinicId: String = "",
    @SerialName("doctor_id") val doctorId: String? = null,
    @SerialName("doctor_name") val doctorName: String? = null,
    @SerialName("queue_position") val queuePosition: Int = 0,
    @SerialName("status") val status: String = "waiting",
    @SerialName("called_at") val calledAt: String? = null,
    @SerialName("inside_at") val insideAt: String? = null,
    @SerialName("completed_at") val completedAt: String? = null,
    @SerialName("consultation_duration_seconds") val consultationDurationSeconds: Long? = null,
    @SerialName("patient_name") val patientName: String = "",
    @SerialName("patient_age") val patientAge: Int = 0,
    @SerialName("patient_gender") val patientGender: String = "",
    @SerialName("patient_mobile") val patientMobile: String = "",
    @SerialName("tracking_code") val trackingCode: String = "",
    @SerialName("appointment_date") val appointmentDate: String = "",
    @SerialName("appointment_time") val appointmentTime: String = "",
    @SerialName("payment_mode") val paymentMode: String? = null,
    @SerialName("payment_status") val paymentStatus: String? = null,
    @SerialName("total_amount") val totalAmount: Double = 0.0,
    @SerialName("user_id") val userId: String? = null,
    @SerialName("is_walkin") val isWalkin: Boolean = false,
    @SerialName("selected_lab_tests") val selectedLabTests: String? = null,
    @SerialName("opt_in_early_call") val optInEarlyCall: Boolean = false,
    @SerialName("created_at") val createdAt: String? = null
) {
    fun toQueueItemUi(): com.dactor.clinic.ui.queue.QueueItemUi = com.dactor.clinic.ui.queue.QueueItemUi(
        id = id,
        appointmentId = appointmentId,
        patientName = if (patientName.isNotBlank()) patientName else "Patient #$queuePosition",
        patientAge = patientAge,
        patientGender = if (patientGender.isNotBlank()) patientGender else "Registered",
        patientMobile = patientMobile,
        trackingCode = if (trackingCode.isNotBlank()) trackingCode else appointmentId.take(8),
        queuePosition = queuePosition,
        status = status,
        appointmentDate = appointmentDate,
        appointmentTime = appointmentTime,
        insideAt = insideAt,
        calledAt = calledAt,
        completedAt = completedAt,
        consultationDurationSeconds = consultationDurationSeconds,
        selectedLabTests = selectedLabTests,
        optInEarlyCall = optInEarlyCall,
        doctorId = doctorId,
        doctorName = doctorName,
        paymentMode = paymentMode,
        paymentStatus = paymentStatus,
        totalAmount = totalAmount,
        userId = userId,
        isWalkin = isWalkin,
        createdAt = createdAt
    )
}

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

@Singleton
open class QueueRepository @Inject constructor(
    private val supabaseClient: SupabaseClient,
    private val clinicRepository: ClinicRepository,
    private val queueDao: com.dactor.clinic.data.local.dao.QueueDao? = null,
    private val appointmentDao: com.dactor.clinic.data.local.dao.AppointmentDao? = null,
    private val devicePrefixManager: com.dactor.clinic.data.local.DevicePrefixManager? = null
) {
    private val clinicQueueCache = java.util.concurrent.ConcurrentHashMap<String, Pair<Long, List<QueueEntry>>>()
    private val doctorQueueCache = java.util.concurrent.ConcurrentHashMap<String, Pair<Long, List<QueueEntry>>>()
    private val clinicQueueSince = java.util.concurrent.ConcurrentHashMap<String, String>()
    private val clinicQueueActiveCheckAt = java.util.concurrent.ConcurrentHashMap<String, Long>()
    private val ACTIVE_ID_CHECK_MS = 60_000L

    private fun parseServerInstant(raw: String): Instant? =
        runCatching { java.time.OffsetDateTime.parse(raw.trim()).toInstant() }.getOrNull()
            ?: runCatching { Instant.parse(raw.trim()) }.getOrNull()

    open suspend fun getFastDoctorLiveQueue(
        doctorId: String,
        clinicId: String,
        date: String = java.time.LocalDate.now().toString()
    ): List<FastLiveQueueItemDto> = withContext(Dispatchers.IO) {
        if (clinicId.isBlank()) return@withContext emptyList()
        try {
            val isLab = isDiagnosticLab(clinicId)
            val cleanDocId = if (isLab) null else doctorId.takeIf { com.dactor.clinic.domain.util.PatientIdentitySync.isValidUuid(it) }
            val params = buildJsonObject {
                if (cleanDocId != null) {
                    put("p_doctor_id", cleanDocId)
                }
                put("p_clinic_id", clinicId)
                put("p_date", date)
            }
            val response = supabaseClient.postgrest.rpc("get_doctor_live_queue", params)
            val items = response.decodeList<FastLiveQueueItemDto>()
            if (items.isNotEmpty()) {
                val uiItems = items.map { it.toQueueItemUi() }
                saveEnrichedQueueItems(uiItems, clinicId)
            }
            items
        } catch (e: Exception) {
            Log.w("QueueRepo", "getFastDoctorLiveQueue RPC failed: ${e.message}")
            emptyList()
        }
    }

    open suspend fun getFastClinicLiveQueue(
        clinicId: String,
        date: String = java.time.LocalDate.now().toString()
    ): List<FastLiveQueueItemDto> = withContext(Dispatchers.IO) {
        if (clinicId.isBlank()) return@withContext emptyList()
        try {
            val params = buildJsonObject {
                put("p_clinic_id", clinicId)
                put("p_date", date)
            }
            val response = supabaseClient.postgrest.rpc("get_clinic_live_queue", params)
            val items = response.decodeList<FastLiveQueueItemDto>()
            if (items.isNotEmpty()) {
                val uiItems = items.map { it.toQueueItemUi() }
                saveEnrichedQueueItems(uiItems, clinicId)
            }
            items
        } catch (e: Exception) {
            Log.w("QueueRepo", "getFastClinicLiveQueue RPC failed: ${e.message}")
            emptyList()
        }
    }

    suspend fun getLocalCachedQueueForDoctor(
        doctorId: String,
        clinicId: String,
        date: String
    ): List<com.dactor.clinic.ui.queue.QueueItemUi> = withContext(Dispatchers.IO) {
        if (doctorId.isBlank() || clinicId.isBlank()) return@withContext emptyList()
        try {
            val local = queueDao?.getQueueForClinicAndDoctorAndDate(clinicId, doctorId, date)
            if (!local.isNullOrEmpty()) {
                return@withContext local.map { it.toQueueItemUi() }
            }
        } catch (_: Exception) {}
        emptyList()
    }

    suspend fun getLocalCachedQueueForClinic(
        clinicId: String,
        date: String? = null
    ): List<com.dactor.clinic.ui.queue.QueueItemUi> = withContext(Dispatchers.IO) {
        if (clinicId.isBlank()) return@withContext emptyList()
        try {
            val local = if (!date.isNullOrBlank()) {
                queueDao?.getQueueForClinicAndDateList(clinicId, date)
            } else {
                queueDao?.getQueueForClinicList(clinicId)
            }
            if (!local.isNullOrEmpty()) {
                return@withContext local.map { it.toQueueItemUi() }
            }
        } catch (_: Exception) {}
        emptyList()
    }

    suspend fun saveEnrichedQueueItems(
        items: List<com.dactor.clinic.ui.queue.QueueItemUi>,
        clinicId: String
    ) = withContext(Dispatchers.IO) {
        if (queueDao == null || items.isEmpty()) return@withContext
        try {
            val entities = items.map { item ->
                com.dactor.clinic.data.local.entity.QueueEntryEntity(
                    id = item.id,
                    appointmentId = item.appointmentId,
                    clinicId = clinicId,
                    doctorId = item.doctorId,
                    queuePosition = item.queuePosition,
                    status = item.status,
                    calledAt = item.calledAt,
                    insideAt = item.insideAt,
                    completedAt = item.completedAt,
                    consultationDurationSeconds = item.consultationDurationSeconds,
                    patientName = item.patientName,
                    patientAge = item.patientAge,
                    patientGender = item.patientGender,
                    patientMobile = item.patientMobile,
                    trackingCode = item.trackingCode,
                    appointmentDate = item.appointmentDate,
                    appointmentTime = item.appointmentTime,
                    doctorName = item.doctorName,
                    paymentMode = item.paymentMode,
                    paymentStatus = item.paymentStatus,
                    totalAmount = item.totalAmount,
                    userId = item.userId,
                    isWalkin = item.isWalkin,
                    selectedLabTests = item.selectedLabTests,
                    optInEarlyCall = item.optInEarlyCall,
                    createdAt = item.createdAt,
                    syncStatus = "synced"
                )
            }
            queueDao.upsertAll(entities)
        } catch (_: Exception) {}
    }

    private suspend fun mapToEnrichedEntities(entries: List<QueueEntry>): List<com.dactor.clinic.data.local.entity.QueueEntryEntity> {
        if (queueDao == null) return emptyList()
        return entries.map { entry ->
            val existing = queueDao.getQueueEntryById(entry.id) ?: queueDao.getQueueEntryByAppointmentId(entry.appointmentId)
            val appt = if (existing == null || existing.patientName.isBlank()) {
                appointmentDao?.getAppointmentById(entry.appointmentId)?.toDomainModel()
            } else null

            if (existing != null) {
                existing.copy(
                    queuePosition = entry.queuePosition,
                    status = entry.status,
                    calledAt = entry.calledAt ?: existing.calledAt,
                    insideAt = entry.insideAt ?: existing.insideAt,
                    completedAt = entry.completedAt ?: existing.completedAt,
                    consultationDurationSeconds = entry.consultationDurationSeconds ?: existing.consultationDurationSeconds,
                    doctorId = entry.doctorId ?: existing.doctorId,
                    syncStatus = "synced",
                    patientName = if (existing.patientName.isNotBlank()) existing.patientName else appt?.patientName.orEmpty(),
                    patientAge = if (existing.patientAge > 0) existing.patientAge else (appt?.patientAge ?: 0),
                    patientGender = if (existing.patientGender.isNotBlank()) existing.patientGender else appt?.patientGender.orEmpty(),
                    patientMobile = if (existing.patientMobile.isNotBlank()) existing.patientMobile else appt?.patientMobile.orEmpty(),
                    trackingCode = if (existing.trackingCode.isNotBlank()) existing.trackingCode else (appt?.trackingCode10Digit ?: entry.appointmentId.take(8)),
                    appointmentDate = if (existing.appointmentDate.isNotBlank()) existing.appointmentDate else appt?.appointmentDate.orEmpty(),
                    appointmentTime = if (existing.appointmentTime.isNotBlank()) existing.appointmentTime else appt?.appointmentTime.orEmpty(),
                    paymentMode = existing.paymentMode ?: appt?.paymentMode,
                    paymentStatus = existing.paymentStatus ?: appt?.paymentStatus,
                    totalAmount = if (existing.totalAmount > 0.0) existing.totalAmount else (appt?.let { if (it.totalAmount > 0.0) it.totalAmount else it.feeAmount } ?: 0.0),
                    isWalkin = existing.isWalkin || (appt?.isWalkin ?: false),
                    selectedLabTests = existing.selectedLabTests ?: appt?.selectedLabTests,
                    optInEarlyCall = existing.optInEarlyCall || (appt?.optInEarlyCall ?: false),
                    userId = existing.userId ?: appt?.userId
                )
            } else {
                com.dactor.clinic.data.local.entity.QueueEntryEntity.fromDomainModel(
                    model = entry,
                    appointment = appt,
                    syncStatus = "synced"
                )
            }
        }
    }

    fun getCachedQueueForClinic(clinicId: String): List<QueueEntry> {
        if (clinicId.isBlank()) return emptyList()
        return clinicQueueCache[clinicId]?.second ?: emptyList()
    }

    open fun clearCache() {
        clinicQueueCache.clear()
        doctorQueueCache.clear()
        clinicQueueSince.clear()
        clinicQueueActiveCheckAt.clear()
    }

    fun invalidateClinicQueueCache(clinicId: String) {
        if (clinicId.isNotBlank()) {
            clinicQueueCache.remove(clinicId)
        }
    }

    fun invalidateDoctorQueueCache(doctorId: String? = null) {
        if (doctorId.isNullOrBlank()) {
            doctorQueueCache.clear()
        } else {
            doctorQueueCache.keys.filter { it.startsWith(doctorId) }.forEach {
                doctorQueueCache.remove(it)
            }
        }
    }

    suspend fun isDiagnosticLab(clinicId: String): Boolean {
        if (clinicId.isBlank()) return false
        val c = try { clinicRepository.getCachedClinicById(clinicId) ?: clinicRepository.getClinicById(clinicId) } catch (_: Exception) { null }
        return c?.isDiagnosticLab() == true
    }

    suspend fun getLocalOrCachedQueueForClinic(clinicId: String): List<QueueEntry> = withContext(Dispatchers.IO) {
        if (clinicId.isBlank()) return@withContext emptyList()
        clinicQueueCache[clinicId]?.second?.let { if (it.isNotEmpty()) return@withContext it }
        try {
            val local = queueDao?.getQueueForClinicList(clinicId)?.map { it.toDomainModel() }
            if (!local.isNullOrEmpty()) {
                clinicQueueCache[clinicId] = Pair(System.currentTimeMillis(), local)
                return@withContext local
            }
        } catch (_: Exception) {}
        emptyList()
    }

    /**
     * Fast, lightweight delta synchronization for live queue display.
     * Fetches only active/changing queue entries from the server and persists them to the local Room DB,
     * completely bypassing heavy master queries, rogue sweeps, and background audits.
     */
    suspend fun syncQueueDeltaForClinic(clinicId: String): List<QueueEntry> = withContext(Dispatchers.IO) {
        if (clinicId.isBlank()) return@withContext emptyList()
        try {
            // Download only rows changed since the last fetch and merge them into the cached list.
            // Once a minute, a small id-only check of waiting/inside rows drops entries deleted
            // on the server (cancellations); status changes arrive through updated_at.
            val nowMs = System.currentTimeMillis()
            val cached = clinicQueueCache[clinicId]?.second
            val since = clinicQueueSince[clinicId]
            val needFull = cached == null || since == null
            val fetched = supabaseClient.postgrest["queue_entries"]
                .select {
                    filter {
                        eq("clinic_id", clinicId)
                        if (!needFull) gt("updated_at", since!!)
                    }
                }.decodeList<QueueEntry>()
            var entries = if (needFull) {
                clinicQueueActiveCheckAt[clinicId] = nowMs
                fetched
            } else {
                (cached!!.associateBy { it.id } + fetched.associateBy { it.id }).values.toList()
            }
            if (!needFull && nowMs - (clinicQueueActiveCheckAt[clinicId] ?: 0L) > ACTIVE_ID_CHECK_MS) {
                @Serializable
                data class IdOnly(val id: String)
                val activeIds = supabaseClient.postgrest["queue_entries"]
                    .select(io.github.jan.supabase.postgrest.query.Columns.list("id")) {
                        filter {
                            eq("clinic_id", clinicId)
                            isIn("status", listOf("waiting", "inside"))
                        }
                    }.decodeList<IdOnly>().map { it.id }.toSet()
                entries = entries.filter { it.status !in listOf("waiting", "inside") || it.id in activeIds }
                clinicQueueActiveCheckAt[clinicId] = nowMs
            }
            (fetched + (cached ?: emptyList())).mapNotNull { it.updatedAt?.let(::parseServerInstant) }.maxOrNull()?.let {
                clinicQueueSince[clinicId] = it.minusSeconds(120).toString()
            }

            val sorted = entries.sortedBy { it.queuePosition }
            clinicQueueCache[clinicId] = Pair(System.currentTimeMillis(), sorted)
            try {
                queueDao?.upsertAll(mapToEnrichedEntities(sorted))
            } catch (_: Exception) {}
            sorted
        } catch (e: Exception) {
            getLocalOrCachedQueueForClinic(clinicId)
        }
    }

    open suspend fun syncQueueDeltaForDoctor(doctorId: String, clinicId: String? = null): List<QueueEntry> = withContext(Dispatchers.IO) {
        if (!clinicId.isNullOrBlank() && isDiagnosticLab(clinicId)) {
            // Diagnostic Lab: Single common live queue across this clinic facility!
            return@withContext syncQueueDeltaForClinic(clinicId)
        }
        if (doctorId.isBlank()) return@withContext emptyList()
        val cacheKey = "${doctorId}_${clinicId ?: "all"}"
        try {
            val entries = supabaseClient.postgrest["queue_entries"]
                .select {
                    filter {
                        eq("doctor_id", doctorId)
                        if (!clinicId.isNullOrBlank()) {
                            eq("clinic_id", clinicId)
                        }
                    }
                }.decodeList<QueueEntry>()

            val sorted = entries.sortedBy { it.queuePosition }
            doctorQueueCache[cacheKey] = Pair(System.currentTimeMillis(), sorted)
            try {
                queueDao?.upsertAll(mapToEnrichedEntities(sorted))
            } catch (_: Exception) {}
            sorted
        } catch (e: Exception) {
            try {
                doctorQueueCache[cacheKey]?.second
                    ?: if (!clinicId.isNullOrBlank()) {
                        queueDao?.getQueueForDoctorList(clinicId, doctorId)?.map { it.toDomainModel() }
                    } else {
                        queueDao?.getQueueForDoctorOnlyList(doctorId)?.map { it.toDomainModel() }
                    }
                    ?: emptyList()
            } catch (_: Exception) { emptyList() }
        }
    }

    /**
     * Authoritatively removes rogue / cancelled / rescheduled queue entries
     * from both remote Supabase, local Room DAO, and in-memory caches.
     */
    open suspend fun removeRogueQueueEntry(appointmentId: String): Boolean = withContext(Dispatchers.IO) {
        if (appointmentId.isBlank()) return@withContext false
        try {
            supabaseClient.postgrest["queue_entries"].delete {
                filter {
                    eq("appointment_id", appointmentId)
                }
            }
            try {
                val cached = queueDao?.getQueueEntryByAppointmentId(appointmentId)
                if (cached != null) {
                    queueDao.softDelete(cached.id)
                }
            } catch (_: Exception) {}

            clinicQueueCache.forEach { (cid, pair) ->
                val filtered = pair.second.filter { it.appointmentId != appointmentId }
                clinicQueueCache[cid] = Pair(pair.first, filtered)
            }
            doctorQueueCache.forEach { (did, pair) ->
                val filtered = pair.second.filter { it.appointmentId != appointmentId }
                doctorQueueCache[did] = Pair(pair.first, filtered)
            }
            true
        } catch (e: Exception) {
            false
        }
    }

    /**
     * Enrolls newly booked or approved appointments into the active queue with the next queue position.
     */
    open suspend fun autoEnrollNewAppointment(
        clinicId: String,
        doctorId: String?,
        appointmentId: String,
        currentMaxPos: Int = 0
    ): QueueEntry? = withContext(Dispatchers.IO) {
        if (clinicId.isBlank() || appointmentId.isBlank()) return@withContext null
        try {
            val isLab = isDiagnosticLab(clinicId)
            val cleanDocId = if (isLab) null else doctorId?.takeIf { com.dactor.clinic.domain.util.PatientIdentitySync.isValidUuid(it) }
            val newEntryDto = QueueEntryInsertDto(
                id = java.util.UUID.randomUUID().toString(),
                appointmentId = appointmentId,
                clinicId = clinicId,
                doctorId = cleanDocId,
                queuePosition = currentMaxPos + 1,
                status = "waiting"
            )
            try {
                supabaseClient.postgrest["queue_entries"].insert(newEntryDto)
            } catch (_: Exception) {
                if (cleanDocId != null) {
                    supabaseClient.postgrest["queue_entries"].insert(newEntryDto.copy(doctorId = null))
                }
            }
            val entry = QueueEntry(
                id = newEntryDto.id,
                appointmentId = appointmentId,
                clinicId = clinicId,
                doctorId = newEntryDto.doctorId,
                queuePosition = newEntryDto.queuePosition,
                status = "waiting"
            )
            try {
                queueDao?.upsert(com.dactor.clinic.data.local.entity.QueueEntryEntity.fromDomainModel(entry, syncStatus = "synced"))
            } catch (_: Exception) {}
            entry
        } catch (e: Exception) {
            null
        }
    }

    private val lastAuditRunMs = java.util.concurrent.ConcurrentHashMap<String, Long>()

    suspend fun getQueueForClinic(
        clinicId: String,
        forceRefresh: Boolean = false,
        targetDate: String? = null
    ): List<QueueEntry> = withContext(Dispatchers.IO) {
        if (clinicId.isBlank()) return@withContext emptyList()
        if (!forceRefresh && targetDate.isNullOrBlank()) {
            val cached = clinicQueueCache[clinicId]
            if (cached != null && (System.currentTimeMillis() - cached.first) < 1500L) {
                return@withContext cached.second
            }
        }
        try {
            // Run background audit asynchronously (debounced to avoid reindex contention)
            val lastAudit = lastAuditRunMs[clinicId] ?: 0L
            val nowMs = System.currentTimeMillis()
            if (nowMs - lastAudit > 60_000L) {
                lastAuditRunMs[clinicId] = nowMs
                kotlinx.coroutines.CoroutineScope(Dispatchers.IO).launch {
                    try {
                        autoTransferUncompletedQueueToNoShow(clinicId = clinicId, includeTodayExpired = false)
                    } catch (_: Exception) {}
                }
            }

            var currentEntries = supabaseClient.postgrest["queue_entries"]
                .select {
                    filter {
                        eq("clinic_id", clinicId)
                        if (!targetDate.isNullOrBlank()) {
                            or {
                                isIn("status", listOf("waiting", "inside"))
                                gte("updated_at", "${targetDate.take(10)}T00:00:00Z")
                            }
                        }
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
                            it.checkinStatus != "no_show" &&
                            it.checkinStatus != "processing" &&
                            it.checkinStatus != "sample_collected" &&
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

                // Strictly sort today's approved appointments by slot time, then booking turn (createdAt)
                val sortedTodayAppts = todayAppts.sortedWith(
                    compareBy<com.dactor.clinic.data.model.Appointment> {
                        AppointmentRepository.parseTimeToMinutes(it.appointmentTime)
                    }.thenBy {
                        it.createdAt.orEmpty()
                    }.thenBy {
                        it.id
                    }
                )

                for (appt in sortedTodayAppts) {
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

                // Check for any duplicate or unaligned queue positions among active entries
                val activeEntries = currentEntries.filter { it.status == "waiting" || it.status == "inside" }
                val hasDuplicatePositions = activeEntries.groupBy { it.queuePosition }.any { it.value.size > 1 }

                if (addedAny || hasDuplicatePositions) {
                    reindexActiveQueue(clinicId, null, sortBySlotTime = true)
                    currentEntries = supabaseClient.postgrest["queue_entries"]
                        .select {
                            filter {
                                eq("clinic_id", clinicId)
                            }
                        }.decodeList<QueueEntry>()
                }
            } catch (ignored: Exception) {}

            val sorted = currentEntries.sortedWith(
                compareBy<QueueEntry> { it.queuePosition }.thenBy { it.id }
            )
            clinicQueueCache[clinicId] = Pair(System.currentTimeMillis(), sorted)
            try {
                queueDao?.upsertAll(mapToEnrichedEntities(sorted))
            } catch (_: Exception) {}
            sorted
        } catch (e: Exception) {
            e.printStackTrace()
            val cached = try {
                clinicQueueCache[clinicId]?.second
                    ?: queueDao?.getQueueForClinicList(clinicId)?.map { it.toDomainModel() }
            } catch (_: Exception) { null }
            cached ?: emptyList()
        }
    }

    open suspend fun getQueueForDoctor(
        doctorId: String,
        clinicId: String? = null,
        forceRefresh: Boolean = false
    ): List<QueueEntry> = withContext(Dispatchers.IO) {
        val effectiveClinicId = clinicId?.takeIf { it.isNotBlank() } ?: run {
            val doc = try {
                supabaseClient.postgrest["doctors"]
                    .select { filter { eq("id", doctorId) } }
                    .decodeSingleOrNull<com.dactor.clinic.data.model.Doctor>()
            } catch (e: Exception) { null }
            doc?.clinicId
        }

        if (!effectiveClinicId.isNullOrBlank() && isDiagnosticLab(effectiveClinicId)) {
            // Diagnostic Lab: Single common live queue across this clinic facility!
            return@withContext getQueueForClinic(effectiveClinicId, forceRefresh = forceRefresh)
        }

        if (doctorId.isBlank()) return@withContext emptyList()
        val cacheKey = "${doctorId}_${clinicId ?: "all"}"
        if (!forceRefresh) {
            val cached = doctorQueueCache[cacheKey]
            if (cached != null && (System.currentTimeMillis() - cached.first) < 1500L) {
                return@withContext cached.second
            }
        }
        try {
            // Automatically audit and transfer uncompleted past live queue patients to 'no_show'
            kotlinx.coroutines.CoroutineScope(Dispatchers.IO).launch {
                try {
                    val docClinicId = clinicId?.takeIf { it.isNotBlank() } ?: run {
                        val doc = try {
                            supabaseClient.postgrest["doctors"]
                                .select { filter { eq("id", doctorId) } }
                                .decodeSingleOrNull<com.dactor.clinic.data.model.Doctor>()
                        } catch (e: Exception) { null }
                        doc?.clinicId
                    }
                    if (!docClinicId.isNullOrBlank()) {
                        autoTransferUncompletedQueueToNoShow(clinicId = docClinicId, includeTodayExpired = false)
                    }
                } catch (_: Exception) {}
            }

            var currentEntries = supabaseClient.postgrest["queue_entries"]
                .select {
                    filter {
                        eq("doctor_id", doctorId)
                        if (!clinicId.isNullOrBlank()) {
                            eq("clinic_id", clinicId)
                        }
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
                            if (!clinicId.isNullOrBlank()) {
                                eq("clinic_id", clinicId)
                            }
                            eq("appointment_date", todayStr)
                        }
                    }.decodeList<com.dactor.clinic.data.model.Appointment>()
                    .filter {
                        it.checkinStatus != "completed" &&
                            it.checkinStatus != "done" &&
                            it.checkinStatus != "cancelled" &&
                            it.checkinStatus != "no_show" &&
                            it.checkinStatus != "processing" &&
                            it.checkinStatus != "sample_collected" &&
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
                    val docClinic = clinicId?.takeIf { it.isNotBlank() } ?: todayAppts.firstOrNull()?.clinicId
                    if (!docClinic.isNullOrBlank()) {
                        reindexActiveQueue(docClinic, doctorId, sortBySlotTime = true)
                    }
                    currentEntries = supabaseClient.postgrest["queue_entries"]
                        .select {
                            filter {
                                eq("doctor_id", doctorId)
                                if (!clinicId.isNullOrBlank()) {
                                    eq("clinic_id", clinicId)
                                }
                            }
                        }.decodeList<QueueEntry>()
                }
            } catch (ignored: Exception) {}

            val sorted = currentEntries.sortedBy { it.queuePosition }
            doctorQueueCache[cacheKey] = Pair(System.currentTimeMillis(), sorted)
            try {
                queueDao?.upsertAll(mapToEnrichedEntities(sorted))
            } catch (_: Exception) {}
            sorted
        } catch (e: Exception) {
            e.printStackTrace()
            val cached = try {
                doctorQueueCache[cacheKey]?.second
                    ?: if (!clinicId.isNullOrBlank()) {
                        queueDao?.getQueueForDoctorList(clinicId, doctorId)?.map { it.toDomainModel() }
                    } else {
                        queueDao?.getQueueForDoctorOnlyList(doctorId)?.map { it.toDomainModel() }
                    }
            } catch (_: Exception) { null }
            cached ?: emptyList()
        }
    }

    open suspend fun transitionQueueEntryStatus(
        entryId: String,
        expectedStatus: String,
        newStatus: String,
        actorType: String,
        actorId: String
    ): TransitionQueueEntryStatusResult = withContext(Dispatchers.IO) {
        val cleanActorId = actorId.takeIf { com.dactor.clinic.domain.util.PatientIdentitySync.isValidUuid(it) }

        val rpcParams = buildJsonObject {
            put("p_entry_id", entryId)
            put("p_expected_status", expectedStatus)
            put("p_new_status", newStatus)
            put("p_actor_type", actorType)
            if (cleanActorId != null) {
                put("p_actor_id", cleanActorId)
            }
        }

        val response = supabaseClient.postgrest.rpc("transition_queue_entry_status", rpcParams)
        val rawJson = response.data?.trim()
        val jsonParser = kotlinx.serialization.json.Json {
            ignoreUnknownKeys = true
            isLenient = true
            coerceInputValues = true
        }

        val result = if (!rawJson.isNullOrBlank()) {
            try {
                jsonParser.decodeFromString<TransitionQueueEntryStatusResult>(rawJson)
            } catch (_: Exception) {
                response.decodeAs<TransitionQueueEntryStatusResult>()
            }
        } else {
            response.decodeAs<TransitionQueueEntryStatusResult>()
        }

        if (!result.success) {
            if (result.error == "CONFLICT") {
                throw com.dactor.clinic.domain.model.QueueConflictException(
                    message = result.message ?: "This entry was just updated",
                    currentStatus = result.currentStatus ?: ""
                )
            } else if (result.error == "UNAUTHORIZED") {
                throw SecurityException(result.message ?: "Not authorized to transition queue entry")
            } else {
                throw IllegalStateException(result.message ?: "Queue status transition failed (${result.error})")
            }
        }

        // Success: update local Room cache
        try {
            val targetId = result.entryId ?: entryId
            val cached = queueDao?.getQueueEntryById(targetId)
                ?: (result.appointmentId?.let { queueDao?.getQueueEntryByAppointmentId(it) })
            if (cached != null) {
                queueDao?.upsert(
                    cached.copy(
                        status = result.status ?: newStatus,
                        calledAt = result.calledAt ?: cached.calledAt,
                        insideAt = result.insideAt ?: cached.insideAt,
                        completedAt = result.completedAt ?: cached.completedAt,
                        consultationDurationSeconds = result.consultationDurationSeconds ?: cached.consultationDurationSeconds,
                        syncStatus = "synced"
                    )
                )
            }
        } catch (_: Exception) {}

        result
    }

    /**
     * Atomically transitions a diagnostic visit from the live queue into `processing`
     * via the authoritative `transition_diagnostic_to_processing` RPC when available,
     * falling back cleanly to resilient table updates if the RPC has not been deployed.
     */
    suspend fun transitionDiagnosticToProcessing(
        appointmentId: String,
        queueEntryId: String? = null,
        testName: String? = null
    ): Boolean = withContext(Dispatchers.IO) {
        if (appointmentId.isBlank() && queueEntryId.isNullOrBlank()) return@withContext false

        try {
            val rpcParams = buildJsonObject {
                if (appointmentId.isNotBlank()) put("p_appointment_id", appointmentId)
                if (!queueEntryId.isNullOrBlank()) put("p_queue_entry_id", queueEntryId)
                if (!testName.isNullOrBlank()) put("p_test_name", testName)
            }
            supabaseClient.postgrest.rpc("transition_diagnostic_to_processing", rpcParams)
            val cachedTarget = try {
                queueEntryId?.takeIf { it.isNotBlank() }?.let { queueDao?.getQueueEntryById(it) }
                    ?: appointmentId.takeIf { it.isNotBlank() }?.let { queueDao?.getQueueEntryByAppointmentId(it) }
            } catch (_: Exception) { null }
            if (cachedTarget != null) {
                try {
                    queueDao?.upsert(cachedTarget.copy(status = "processing", syncStatus = "synced"))
                } catch (_: Exception) {}
            }
            return@withContext true
        } catch (rpcErr: Exception) {
            Log.w("QueueRepository", "transition_diagnostic_to_processing RPC unavailable/failed, using fallback: ${rpcErr.message}")
        }

        val targetId = queueEntryId?.takeIf { it.isNotBlank() } ?: appointmentId
        val queueOk = updateQueueStatus(targetId, "processing")
        val apptOk = if (appointmentId.isNotBlank()) {
            try {
                supabaseClient.postgrest["appointments"]
                    .update({ set("checkin_status", "processing") }) {
                        filter { eq("id", appointmentId) }
                    }
                true
            } catch (e: Exception) {
                e.printStackTrace()
                false
            }
        } else false

        queueOk || apptOk
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
                    .decodeList<QueueEntry>()
                    .firstOrNull()
            } catch (e: Exception) { null }

            val targetEntryId = existingEntry?.id ?: id
            val resolvedApptId = existingEntry?.appointmentId ?: id
            var queueUpdated = false
            var apptUpdated = false

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
                        .decodeList<com.dactor.clinic.data.model.Appointment>()
                        .firstOrNull()
                } catch (e: Exception) { null }

                if (appt == null || !appt.status.equals("APPROVED", ignoreCase = true) ||
                    appt.status == "WAITING_FOR_APPROVAL" || appt.status == "pending_payment" ||
                    appt.status == "UNAPPROVED" || appt.status == "EXPIRED" ||
                    appt.checkinStatus == "cancelled"
                ) {
                    return@withContext false
                }

                val targetClinic = clinicId ?: appt.clinicId
                if (!targetClinic.isNullOrBlank()) {
                    val cleanDocId = appt.doctorId?.takeIf { com.dactor.clinic.domain.util.PatientIdentitySync.isValidUuid(it) }
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
                        queueUpdated = true
                    } catch (e: Exception) {
                        try {
                            supabaseClient.postgrest["queue_entries"].insert(newEntry.copy(doctorId = null))
                            queueUpdated = true
                        } catch (e2: Exception) {
                            e2.printStackTrace()
                        }
                    }
                }
            } else {
                // Primary update: only guaranteed schema columns so missing optional columns never fail the status transition
                try {
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
                    queueUpdated = true
                } catch (qErr: Exception) {
                    qErr.printStackTrace()
                }

                if (queueUpdated && status == "inside") {
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
                if (queueUpdated && durationSeconds != null) {
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
                if (resolvedApptId.isNotBlank()) {
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
                                filter { eq("id", resolvedApptId) }
                            }
                        apptUpdated = true
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

            if (queueUpdated || apptUpdated) {
                try {
                    val cached = queueDao?.getQueueEntryById(targetEntryId)
                        ?: queueDao?.getQueueEntryByAppointmentId(resolvedApptId)
                    if (cached != null) {
                        queueDao?.upsert(cached.copy(status = status, syncStatus = "synced"))
                    }
                } catch (_: Exception) {}
            }

            queueUpdated || apptUpdated
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
                    .decodeList<QueueEntry>()
                    .firstOrNull()
            } catch (e: Exception) { null }

            var queueUpdated = false
            var apptUpdated = false

            try {
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
                queueUpdated = true
            } catch (qErr: Exception) {
                qErr.printStackTrace()
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
                    apptUpdated = true
                } catch (ignored: Exception) {}
            }

            val cId = existingEntry?.clinicId
            if (!cId.isNullOrBlank()) {
                reindexActiveQueue(cId, existingEntry?.doctorId)
                if (status != "inside" && status != "waiting") {
                    recalculateAndUpdateClinicAverageTime(cId)
                }
            }

            if (queueUpdated || apptUpdated) {
                try {
                    val cached = queueDao?.getQueueEntryByAppointmentId(appointmentId)
                    if (cached != null) {
                        queueDao?.upsert(cached.copy(status = status, syncStatus = "synced"))
                    }
                } catch (_: Exception) {}
            }

            queueUpdated || apptUpdated
        } catch (e: Exception) {
            e.printStackTrace()
            false
        }
    }

    /**
     * Automatically transfers patients in live queue whose appointment is not completed to 'no_show'.
     * Handles past-day appointments (where appointment_date < today) and optionally today's expired slots/appointments.
     */
    open suspend fun autoTransferUncompletedQueueToNoShow(
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
                        appt.checkinStatus != "sample_collected" &&
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
                        appt.checkinStatus != "sample_collected" &&
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

            // The server keeps a running count + average per doctor (outliers over 2x already
            // excluded), so no consultation history is downloaded here.
            @Serializable
            data class StatsParams(val p_clinic_id: String)
            @Serializable
            data class ClinicStats(val completed_count: Int = 0, val avg_seconds: Double? = null)
            val stats = supabaseClient.postgrest
                .rpc("get_clinic_consultation_stats", StatsParams(clinicId))
                .decodeList<ClinicStats>()
                .firstOrNull()
            val completedCount = stats?.completed_count ?: 0
            val serverAvgSec = stats?.avg_seconds?.takeIf { completedCount > 0 && it > 0 }

            if (serverAvgSec == null) {
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

            val actualAvgSec = serverAvgSec
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
                completedVisitsCount = completedCount,
                outliersOmittedCount = 0,
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
        sortBySlotTime: Boolean = true
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

            val apptIds = activeEntries.map { it.appointmentId }.filter { it.isNotBlank() }
            val apptMap = if (sortBySlotTime && apptIds.isNotEmpty()) {
                try {
                    supabaseClient.postgrest["appointments"]
                        .select {
                            filter {
                                isIn("id", apptIds)
                            }
                        }.decodeList<com.dactor.clinic.data.model.Appointment>()
                        .associateBy { it.id }
                } catch (e: Exception) {
                    emptyMap()
                }
            } else {
                emptyMap()
            }

            // If doctorId is specified, reindex that doctor cabin's queue.
            // If doctorId is null/blank, reindex clinic-wide sequentially without duplicate positions!
            val entryGroups: List<List<QueueEntry>> = if (!doctorId.isNullOrBlank()) {
                listOf(activeEntries.filter { it.doctorId == doctorId })
            } else {
                listOf(activeEntries)
            }

            val nowMin = java.time.LocalTime.now().let { it.hour * 60 + it.minute }

            for (group in entryGroups) {
                // 1. Patients currently inside consultation room maintain #1
                // 2. Pay at Desk appointment with slot passed -> placed at top of waiting queue
                // 3. Strictly arranged by time slot start minutes
                // 4. Same slot: booking turn (createdAt)
                // 5. Deterministic tie-breaker
                val sortedEntries = if (sortBySlotTime) {
                    group.sortedWith(
                        compareBy<QueueEntry> { if (it.status == "inside") 0 else 1 }
                            .thenBy { entry ->
                                val appt = apptMap[entry.appointmentId]
                                val isPayAtDesk = appt?.paymentMode == "PAY_AT_DESK"
                                val slotEndMin = AppointmentRepository.parseAppointmentEndTimeToMinutes(appt?.appointmentTime)
                                if (isPayAtDesk && slotEndMin < nowMin) 0 else 1
                            }
                            .thenBy { entry ->
                                val appt = apptMap[entry.appointmentId]
                                AppointmentRepository.parseTimeToMinutes(appt?.appointmentTime)
                            }
                            .thenBy { entry ->
                                val appt = apptMap[entry.appointmentId]
                                appt?.createdAt.orEmpty()
                            }
                            .thenBy { entry ->
                                val appt = apptMap[entry.appointmentId]
                                appt?.id ?: entry.id
                            }
                    )
                } else {
                    group.sortedWith(
                        compareBy<QueueEntry> { if (it.status == "inside") 0 else 1 }
                            .thenBy { it.queuePosition }
                            .thenBy { it.id }
                    )
                }

                // Two-pass update only when necessary to avoid negative offset thrashing
                val needsUpdate = sortedEntries.mapIndexed { idx, e -> (idx + 1) != e.queuePosition }.any { it }
                if (needsUpdate) {
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
            }
            true
        } catch (e: Exception) {
            e.printStackTrace()
            false
        }
    }

    open suspend fun reorderQueue(orderedEntries: List<QueueEntry>): Boolean = withContext(Dispatchers.IO) {
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
                try {
                    val existing = queueDao?.getQueueEntryById(entry.id) ?: queueDao?.getQueueEntryByAppointmentId(entry.appointmentId)
                    if (existing != null) {
                        queueDao?.upsert(existing.copy(queuePosition = index + 1, syncStatus = "synced"))
                    }
                } catch (_: Exception) {}
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

    open suspend fun sendManualNotification(
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

            val isArriveSoon = type == NotificationType.ARRIVE_SOON.key ||
                type == "arrive_soon" ||
                title.contains("arrive soon", ignoreCase = true) ||
                message.contains("arrive soon", ignoreCase = true)

            val isFirstPos = message.contains("position 1", ignoreCase = true) ||
                message.contains("next in line", ignoreCase = true) ||
                expectedTime?.contains("arrive fast", ignoreCase = true) == true ||
                expectedTime?.contains("arrive soon", ignoreCase = true) == true ||
                estimatedTimeLeft?.contains("arrive fast", ignoreCase = true) == true ||
                estimatedTimeLeft?.contains("arrive soon", ignoreCase = true) == true

            val leftVal = if (isArriveSoon) {
                "Arrive Soon"
            } else if (isFirstPos) {
                "Arrive Soon"
            } else {
                (estimatedTimeLeft?.takeIf { it.isNotBlank() } ?: "Soon, be ready")
            }
            val rightVal = if (isArriveSoon) {
                if (isFirstPos) "Your turn, arrive soon" else (expectedTime?.takeIf { it.isNotBlank() } ?: "Position #1")
            } else if (isFirstPos) {
                "Your turn, arrive soon"
            } else {
                (expectedTime?.takeIf { it.isNotBlank() }
                    ?: appt?.appointmentTime?.takeIf { it.isNotBlank() }
                    ?: "Soon, be ready")
            }
            val effectiveRightLabel = if (isArriveSoon) "Queue Position" else if (isFirstPos) "Turn Status" else rightLabel
            val effectiveLeftLabel = if (isArriveSoon) "Turn Status" else leftLabel

            val taggedMessage = if (message.contains("[[META:")) {
                message
            } else {
                NotificationTemplate.ManualAlert.buildMessage(
                    cleanMessage = message,
                    leftLabel = effectiveLeftLabel,
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
                    com.dactor.clinic.data.remote.EdgeFunctionCaller.call(
                        supabaseClient,
                        "send-fcm-alert",
                        buildJsonObject {
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
        // Query request removed from doctor and clinic portal (restricted to patient app)
        emptyList()
    }

    suspend fun markAsRead(id: String): Boolean = withContext(Dispatchers.IO) {
        try {
            val cleanId = id.trim()
            if (cleanId.isBlank() || cleanId.startsWith("lab_notif_")) return@withContext true
            supabaseClient.postgrest["notifications"]
                .update({
                    set("is_read", true)
                }) {
                    filter {
                        eq("id", cleanId)
                    }
                }
            true
        } catch (e: Exception) {
            false
        }
    }

    suspend fun markAllAsRead(ids: List<String>): Boolean = withContext(Dispatchers.IO) {
        try {
            val validIds = ids.map { it.trim() }.filter { it.isNotBlank() && !it.startsWith("lab_notif_") }
            if (validIds.isEmpty()) return@withContext true
            for (chunk in validIds.chunked(30)) {
                try {
                    supabaseClient.postgrest["notifications"]
                        .update({
                            set("is_read", true)
                        }) {
                            filter {
                                isIn("id", chunk)
                            }
                        }
                } catch (_: Exception) {}
            }
            true
        } catch (e: Exception) {
            false
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
                    com.dactor.clinic.data.remote.EdgeFunctionCaller.call(
                        supabaseClient,
                        "send-fcm-alert",
                        buildJsonObject {
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

    open suspend fun sendClinicBreakNotificationsToActiveAppointments(
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
                            com.dactor.clinic.data.remote.EdgeFunctionCaller.call(
                                supabaseClient,
                                "send-fcm-alert",
                                buildJsonObject {
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
                            com.dactor.clinic.data.remote.EdgeFunctionCaller.call(
                                supabaseClient,
                                "send-fcm-alert",
                                buildJsonObject {
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
    open suspend fun notifyCallInside(
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
                    com.dactor.clinic.data.remote.EdgeFunctionCaller.call(
                        supabaseClient,
                        "send-fcm-alert",
                        buildJsonObject {
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

    /**
     * Creates a reactive Flow emitting on any doctor queue entry or appointment change.
     * Encapsulates Supabase Realtime channel lifecycle.
     */
    @OptIn(kotlinx.coroutines.FlowPreview::class)
    open fun observeDoctorQueueRealtime(doctorId: String, clinicId: String): Flow<Unit> = callbackFlow {
        if (doctorId.isBlank() || clinicId.isBlank()) {
            close()
            return@callbackFlow
        }

        val channelTopic = "doctor_live_queue_${doctorId}_${clinicId}"
        val channel: RealtimeChannel = supabaseClient.channel(channelTopic)

        val queueChanges = channel.postgresChangeFlow<PostgresAction>(schema = "public") {
            table = "queue_entries"
            filter = "doctor_id=eq.$doctorId"
        }

        val apptChanges = channel.postgresChangeFlow<PostgresAction>(schema = "public") {
            table = "appointments"
            filter = "doctor_id=eq.$doctorId"
        }

        val job = kotlinx.coroutines.CoroutineScope(Dispatchers.IO).launch {
            try {
                channel.subscribe()
                merge(queueChanges, apptChanges)
                    .debounce(300L)
                    .collect {
                        trySend(Unit)
                    }
            } catch (e: Exception) {
                Log.e("QueueRepo", "Realtime subscription failed: ${e.message}")
            }
        }

        awaitClose {
            job.cancel()
            kotlinx.coroutines.CoroutineScope(Dispatchers.IO).launch {
                try {
                    channel.unsubscribe()
                    supabaseClient.realtime.removeChannel(channel)
                } catch (_: Exception) {}
            }
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
                val hasBreakSchedule = todaySchedule?.hasBreak == true && !todaySchedule.breakEnd.isNullOrBlank()
                val breakDesc = if (hasBreakSchedule) {
                    "${todaySchedule!!.breakStart} - ${todaySchedule.breakEnd}"
                } else {
                    "Short Break"
                }

                // Determine effective break ending time (anchor for post-break resumption)
                val rawBreakEnd = if (hasBreakSchedule) {
                    ClinicScheduleHelper.parseTimeToLocalTime(todaySchedule!!.breakEnd)
                } else {
                    val def2pm = ClinicScheduleHelper.parseTimeToLocalTime("02:00 PM")
                    if (nowTime.isBefore(def2pm)) def2pm else nowTime.plusMinutes(15)
                }

                // If scheduled break end has already passed (e.g. clinic still on break after scheduled end),
                // anchor resumption to now (+5 mins buffer) so expected time is never in the past
                val effectiveBreakEnd = if (nowTime.isAfter(rawBreakEnd)) {
                    nowTime.plusMinutes(5)
                } else {
                    rawBreakEnd
                }

                // Stagger patients from the break ending time:
                // First person in active queue (totalPeopleAhead == 0) gets effectiveBreakEnd
                // Subsequent patients get effectiveBreakEnd + (totalPeopleAhead * avgMins)
                val breakStaggeredTime = effectiveBreakEnd.plusMinutes((totalPeopleAhead * avgMins).toLong())

                // If patient booked a slot later in the day that is further out than the break resumption time,
                // respect their booked slot start time
                val effectiveExpectedTime = if (slotStartTime != null && slotStartTime.isAfter(breakStaggeredTime)) {
                    slotStartTime.plusMinutes((totalPeopleAhead * avgMins).toLong())
                } else {
                    breakStaggeredTime
                }

                val diffSec = java.time.Duration.between(nowTime, effectiveExpectedTime).seconds
                val diffMins = kotlin.math.ceil(diffSec / 60.0).toInt().coerceAtLeast(0)

                val effectiveTimeLeftText = when {
                    diffMins > 60 -> {
                        val hours = diffMins / 60
                        val rem = diffMins % 60
                        if (rem == 0) "~ $hours hr" else "~ ${hours}h ${rem}m"
                    }
                    diffMins > 0 -> "~ $diffMins min"
                    else -> "Resuming shortly"
                }

                val effectiveExactTimeText = effectiveExpectedTime.format(timeFormatter)
                val windowText = formatTimeWindow(effectiveExpectedTime)
                val approxText = formatApproxTime(effectiveExpectedTime)

                val breakEndStr = effectiveBreakEnd.format(timeFormatter)
                val bannerText = "Clinic is currently on a break ($breakDesc). Consultations resume at $breakEndStr."
                val noticeText = if (totalPeopleAhead == 0) {
                    "Clinic on break ($breakDesc). You are #1 in queue; consultation resumes at $breakEndStr."
                } else {
                    val personWord = if (totalPeopleAhead == 1) "person" else "people"
                    "Clinic on break ($breakDesc). $totalPeopleAhead $personWord ahead; consultation resumes around $effectiveExactTimeText."
                }

                return LiveQueueTimingEstimate(
                    estimatedTimeLeftText = effectiveTimeLeftText,
                    expectedExactTimeText = effectiveExactTimeText,
                    doctorStatusBanner = bannerText,
                    isDoctorNotInside = false,
                    isDoctorIdleFiveMins = false,
                    isClinicOnBreak = true,
                    isSoonBeReady = (totalPeopleAhead == 0) || (diffMins <= 5),
                    timeWindowText = windowText,
                    approxTimeText = approxText,
                    slotStartTimeText = slotStartStr,
                    suggestedArrivalText = suggestedArrivalStr,
                    slotNoticeText = noticeText,
                    canOfferEarlyArrival = false,
                    earlyArrivalOfferText = null,
                    isPatientLate = false
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
                    if (!insideEntry.insideAt.isNullOrBlank()) java.time.OffsetDateTime.parse(insideEntry.insideAt.trim()).toInstant() else nowInstant
                } catch (_: Exception) {
                    nowInstant
                }
                // The patient inside ends at the later of (went inside + average) and now:
                // a consultation running long pushes everyone behind it later.
                val currentEnd = maxOf(insideInstant.plusSeconds(avgMins * 60L), nowInstant.plusSeconds(60L))
                val expectedInstant = currentEnd.plusSeconds((totalPeopleAhead - 1).coerceAtLeast(0) * avgMins * 60L)
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
                    // Directly shows "Your turn, arrive soon"
                    effectiveExpectedTime = nowTime
                    effectiveTimeLeftText = "Arrive Soon"
                    effectiveExactTimeText = "Your turn, arrive soon"
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
                isSoonBeReady = totalPeopleAhead == 0 || effectiveTimeLeftText.contains("Soon") || effectiveTimeLeftText.contains("Arrive Fast") || effectiveTimeLeftText.contains("Arrive Soon"),
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

