package com.dactor.patient.data.repository

import com.dactor.patient.data.model.Appointment
import com.dactor.patient.data.model.Clinic
import com.dactor.patient.data.model.ClinicScheduleHelper
import com.dactor.patient.data.model.NotificationTemplateData
import com.dactor.patient.data.model.QueueEntry
import com.dactor.patient.data.model.Slot
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.postgrest.postgrest
import io.github.jan.supabase.postgrest.rpc
import io.github.jan.supabase.postgrest.query.filter.FilterOperator
import io.github.jan.supabase.realtime.PostgresAction
import io.github.jan.supabase.realtime.channel
import io.github.jan.supabase.realtime.postgresChangeFlow
import io.github.jan.supabase.realtime.RealtimeChannel
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.launch
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.JsonPrimitive
import java.time.Instant
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneId
import java.time.ZonedDateTime
import java.time.format.DateTimeFormatter
import java.util.Locale
import java.util.UUID
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import javax.inject.Inject
import javax.inject.Singleton

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
)

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

@Serializable
data class LiveQueueDelta(
    @SerialName("tracking_code_10_digit") val trackingCode10Digit: String = "",
    @SerialName("appointment_id") val appointmentId: String = "",
    @SerialName("clinic_id") val clinicId: String = "",
    @SerialName("clinic_name") val clinicName: String = "",
    @SerialName("doctor_id") val doctorId: String? = null,
    @SerialName("doctor_name") val doctorName: String = "",
    @SerialName("doctor_specialty") val doctorSpecialty: String = "",
    @SerialName("appointment_date") val appointmentDate: String = "",
    @SerialName("appointment_time") val appointmentTime: String = "",
    @SerialName("checkin_status") val checkinStatus: String = "waiting",
    @SerialName("queue_status") val queueStatus: String = "waiting",
    @SerialName("token_number") val tokenNumber: Int = 1,
    @SerialName("queue_position") val queuePosition: Int = 1,
    @SerialName("patients_ahead") val patientsAhead: Int = 0,
    @SerialName("current_serving_token") val currentServingToken: Int = 0,
    @SerialName("doctor_is_in_clinic") val doctorIsInClinic: Boolean = false,
    @SerialName("is_anyone_inside") val isAnyoneInside: Boolean = false,
    @SerialName("estimated_wait_minutes") val estimatedWaitMinutes: Int = 0,
    @SerialName("slot_notice") val slotNotice: String = "",
    @SerialName("current_inside_since") val currentInsideSince: String? = null,
    @SerialName("avg_consultation_seconds") val avgConsultationSeconds: Int? = null
)

@Singleton
class QueueRepository @Inject constructor(
    private val supabaseClient: SupabaseClient
) {

    data class QueueTimingInfo(
        val insideSince: String? = null,
        val avgSeconds: Int? = null
    )

    /** Doctor's running consultation metrics (inside timestamp and average seconds) from get_public_queue_status. */
    suspend fun getQueueTimingInfo(trackingCode: String): QueueTimingInfo? = withContext(Dispatchers.IO) {
        if (!Regex("^[0-9]{10}$").matches(trackingCode)) return@withContext null
        @Serializable
        data class Params(val p_tracking_code: String)
        @Serializable
        data class Row(
            val avg_consultation_seconds: Int? = null,
            val current_inside_since: String? = null
        )
        runCatching {
            supabaseClient.postgrest.rpc("get_public_queue_status", Params(trackingCode))
                .decodeList<Row>().firstOrNull()?.let {
                    QueueTimingInfo(
                        insideSince = it.current_inside_since,
                        avgSeconds = it.avg_consultation_seconds
                    )
                }
        }.getOrNull()
    }

    /** Doctor's running average consultation time (seconds) for this booking's queue, from the server. */
    suspend fun getDoctorAvgConsultationSeconds(trackingCode: String): Int? = withContext(Dispatchers.IO) {
        getQueueTimingInfo(trackingCode)?.avgSeconds
    }

    private val queueEntriesForClinicCache = java.util.concurrent.ConcurrentHashMap<String, Pair<Long, List<QueueEntry>>>()
    private val queueStatusCache = java.util.concurrent.ConcurrentHashMap<String, Pair<Long, QueueEntry>>()
    private val diagnosticLabClinicCache = java.util.concurrent.ConcurrentHashMap<String, Boolean>()

    fun clearCache() {
        queueEntriesForClinicCache.clear()
        queueStatusCache.clear()
        diagnosticLabClinicCache.clear()
    }

    suspend fun isDiagnosticLabClinic(clinicId: String): Boolean {
        if (clinicId.isBlank()) return false
        val cached = diagnosticLabClinicCache[clinicId]
        if (cached != null) return cached
        return try {
            val clinicList = supabaseClient.postgrest["clinics"]
                .select { filter { eq("id", clinicId) } }
                .decodeList<com.dactor.patient.data.model.Clinic>()
            val c = clinicList.firstOrNull()
            val isLab = com.dactor.patient.util.DiagnosticLabPolicy.isDiagnosticOrPathologyLab(c)
            diagnosticLabClinicCache[clinicId] = isLab
            isLab
        } catch (_: Exception) {
            false
        }
    }

    suspend fun getQueueStatus(appointmentId: String, forceRefresh: Boolean = false): QueueEntry? {
        if (appointmentId.isBlank()) return null
        if (!forceRefresh) {
            val cached = queueStatusCache[appointmentId]
            if (cached != null && (System.currentTimeMillis() - cached.first) < 15_000L) {
                return cached.second
            }
        }
        return try {
            val list = supabaseClient.postgrest["queue_entries"]
                .select { filter { eq("appointment_id", appointmentId) } }
                .decodeList<QueueEntry>()
            val found = list.firstOrNull { it.status.lowercase() in listOf("waiting", "inside", "in_consultation") }
                ?: list.firstOrNull { it.status.lowercase() in listOf("done", "completed") }
                ?: list.lastOrNull()
            if (found != null) {
                queueStatusCache[appointmentId] = Pair(System.currentTimeMillis(), found)
            }
            found
        } catch (e: Exception) {
            e.printStackTrace()
            queueStatusCache[appointmentId]?.second
        }
    }

    suspend fun fetchLiveQueueDelta(codeOrId: String): LiveQueueDelta? = withContext(Dispatchers.IO) {
        if (codeOrId.isBlank()) return@withContext null
        try {
            val list = supabaseClient.postgrest.rpc(
                function = "get_live_queue_status",
                parameters = buildJsonObject {
                    put("p_code_or_id", JsonPrimitive(codeOrId.trim()))
                }
            ).decodeList<LiveQueueDelta>()
            list.firstOrNull()
        } catch (e: Exception) {
            e.printStackTrace()
            null
        }
    }

    /**
     * Subscribes to live WebSocket changes on queue_entries and appointments for real-time cabin vacating.
     */
    fun observeQueueRealtime(clinicId: String, doctorId: String?, appointmentId: String): Flow<Unit> = callbackFlow {
        if (clinicId.isBlank()) {
            close()
            return@callbackFlow
        }
        var channel: RealtimeChannel? = null
        try {
            val safeClinic = clinicId.replace("-", "").take(8)
            val safeAppt = appointmentId.replace("-", "").take(8)
            val chName = "queue_rt_${safeClinic}_${safeAppt}_${System.currentTimeMillis()}"
            channel = supabaseClient.channel(chName)
            val qeFlow = channel.postgresChangeFlow<PostgresAction>(schema = "public") {
                table = "queue_entries"
                filter("clinic_id", FilterOperator.EQ, clinicId)
            }
            val apptFlow = channel.postgresChangeFlow<PostgresAction>(schema = "public") {
                table = "appointments"
                filter("id", FilterOperator.EQ, appointmentId)
            }
            channel.subscribe()
            val job1 = launch(Dispatchers.IO) {
                qeFlow.collect {
                    trySend(Unit)
                }
            }
            val job2 = launch(Dispatchers.IO) {
                apptFlow.collect {
                    trySend(Unit)
                }
            }
            awaitClose {
                job1.cancel()
                job2.cancel()
                runCatching { channel.unsubscribe() }
            }
        } catch (_: Exception) {
            awaitClose {
                runCatching { channel?.unsubscribe() }
            }
        }
    }

    suspend fun ensureQueueEntryForAppointment(
        appointmentId: String,
        clinicId: String,
        doctorId: String? = null
    ): QueueEntry? = withContext(Dispatchers.IO) {
        if (appointmentId.isBlank() || clinicId.isBlank()) return@withContext null
        try {
            // Server-side authoritative assignment with SECURITY DEFINER
            try {
                supabaseClient.postgrest.rpc(
                    function = "assign_or_get_queue_token",
                    parameters = buildJsonObject {
                        put("p_appointment_id", JsonPrimitive(appointmentId.trim()))
                    }
                )
            } catch (rpcErr: Exception) {
                rpcErr.printStackTrace()
            }

            // Fetch live operational status from delta
            val delta = fetchLiveQueueDelta(appointmentId)
            if (delta != null && delta.tokenNumber > 0) {
                val qe = QueueEntry(
                    id = UUID.randomUUID().toString(),
                    appointmentId = appointmentId,
                    clinicId = clinicId,
                    doctorId = doctorId,
                    queuePosition = delta.tokenNumber,
                    status = delta.queueStatus
                )
                queueStatusCache[appointmentId] = Pair(System.currentTimeMillis(), qe)
                return@withContext qe
            }

            getQueueStatus(appointmentId, forceRefresh = true)
        } catch (e: Exception) {
            e.printStackTrace()
            getQueueStatus(appointmentId)
        }
    }

    /**
     * Only what the live tracker needs: entries still waiting/inside plus entries changed today
     * (finished consultations and their times), not the clinic's whole history.
     */
    suspend fun getTodayQueueEntriesForClinic(clinicId: String): List<QueueEntry> = withContext(Dispatchers.IO) {
        val startOfToday = java.time.LocalDate.now().atStartOfDay(java.time.ZoneId.systemDefault()).toInstant().toString()
        try {
            supabaseClient.postgrest["queue_entries"]
                .select {
                    filter {
                        eq("clinic_id", clinicId)
                        or {
                            isIn("status", listOf("waiting", "inside"))
                            gte("updated_at", startOfToday)
                        }
                    }
                }.decodeList<QueueEntry>()
        } catch (e: Exception) {
            e.printStackTrace()
            emptyList()
        }
    }

    suspend fun getQueueEntriesForClinic(clinicId: String, forceRefresh: Boolean = false): List<QueueEntry> {
        if (clinicId.isBlank()) return emptyList()
        if (!forceRefresh) {
            val cached = queueEntriesForClinicCache[clinicId]
            if (cached != null && (System.currentTimeMillis() - cached.first) < 15_000L) {
                return cached.second
            }
        }
        return try {
            val list = supabaseClient.postgrest["queue_entries"]
                .select { filter { eq("clinic_id", clinicId) } }
                .decodeList<QueueEntry>()
            queueEntriesForClinicCache[clinicId] = Pair(System.currentTimeMillis(), list)
            list
        } catch (e: Exception) {
            e.printStackTrace()
            queueEntriesForClinicCache[clinicId]?.second ?: emptyList()
        }
    }

    suspend fun getQueueEntriesForDoctor(clinicId: String, doctorId: String?): List<QueueEntry> {
        if (clinicId.isBlank()) return emptyList()
        val all = getQueueEntriesForClinic(clinicId)
        if (isDiagnosticLabClinic(clinicId)) {
            // Diagnostic Lab: Single common queue across this clinic (no doctor partition)
            return all
        }
        return if (doctorId.isNullOrBlank()) {
            all.filter { it.doctorId.isNullOrBlank() }
        } else {
            all.filter { it.doctorId == doctorId }
        }
    }

    suspend fun getQueueEntriesForDoctorAndDate(
        clinicId: String,
        doctorId: String?,
        appointmentDate: String,
        forceRefresh: Boolean = false
    ): List<QueueEntry> {
        if (clinicId.isBlank()) return emptyList()
        val isLab = isDiagnosticLabClinic(clinicId)
        val targetDateStr = appointmentDate.trim().take(10)

        // 1. Try atomic high-speed live queue RPC first
        if (targetDateStr.isNotBlank()) {
            try {
                val cleanDocId = if (isLab) null else doctorId?.takeIf { it.length == 36 && it.contains("-") }
                val params = buildJsonObject {
                    if (cleanDocId != null) {
                        put("p_doctor_id", cleanDocId)
                    }
                    put("p_clinic_id", clinicId)
                    put("p_date", targetDateStr)
                }
                val response = supabaseClient.postgrest.rpc("get_doctor_live_queue", params)
                val dtos = response.decodeList<FastLiveQueueItemDto>()
                if (dtos.isNotEmpty()) {
                    return dtos.map { dto ->
                        QueueEntry(
                            id = dto.id,
                            appointmentId = dto.appointmentId,
                            clinicId = dto.clinicId,
                            doctorId = dto.doctorId,
                            queuePosition = dto.queuePosition,
                            status = dto.status,
                            calledAt = dto.calledAt,
                            insideAt = dto.insideAt,
                            completedAt = dto.completedAt
                        )
                    }
                }
            } catch (_: Exception) {}
        }

        // 2. Legacy fallback path
        val allEntries = if (isLab) getQueueEntriesForClinic(clinicId, forceRefresh) else getQueueEntriesForDoctor(clinicId, doctorId)
        if (targetDateStr.isBlank()) return allEntries
        return try {
            val validApptIds = supabaseClient.postgrest["appointments"].select {
                filter {
                    eq("clinic_id", clinicId)
                    eq("appointment_date", targetDateStr)
                    if (!isLab && !doctorId.isNullOrBlank()) {
                        eq("doctor_id", doctorId)
                    }
                }
            }.decodeList<Appointment>()
                .filter {
                    it.status.equals("APPROVED", ignoreCase = true) &&
                    it.status != "WAITING_FOR_APPROVAL" &&
                    it.status != "pending_payment" &&
                    it.status != "UNAPPROVED" &&
                    it.status != "EXPIRED" &&
                    it.checkinStatus != "cancelled"
                }
                .map { it.id }.toSet()

            allEntries.filter { it.appointmentId in validApptIds }
        } catch (e: Exception) {
            e.printStackTrace()
            allEntries
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
                    expectedTime?.contains("arrive soon", ignoreCase = true) == true ||
                    estimatedTimeLeft?.contains("arrive fast", ignoreCase = true) == true ||
                    estimatedTimeLeft?.contains("arrive soon", ignoreCase = true) == true

                val leftVal = if (isFirstPos) "Arrive Soon" else (estimatedTimeLeft ?: "Soon, be ready")
                val rightVal = if (isFirstPos) "Your turn, arrive soon" else (expectedTime ?: "Soon, be ready")
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
        val CLINIC_ZONE_ID: ZoneId = ZoneId.of("Asia/Kathmandu")

        fun currentNepalLocalDate(): LocalDate = LocalDate.now(CLINIC_ZONE_ID)

        fun parseServerInstant(ts: String?): Instant? {
            if (ts.isNullOrBlank()) return null
            val clean = ts.trim()
            return try {
                Instant.parse(clean)
            } catch (_: Exception) {
                try {
                    java.time.OffsetDateTime.parse(clean).toInstant()
                } catch (_: Exception) {
                    try {
                        val normalized = clean.replace(" ", "T")
                        if (!normalized.contains("+") && normalized.indexOf("-", startIndex = 10) < 0 && !normalized.endsWith("Z")) {
                            java.time.LocalDateTime.parse(normalized).atZone(CLINIC_ZONE_ID).toInstant()
                        } else {
                            java.time.OffsetDateTime.parse(normalized).toInstant()
                        }
                    } catch (_: Exception) {
                        null
                    }
                }
            }
        }

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
                val inst = parseServerInstant(dateStr)
                if (inst != null) return inst.atZone(CLINIC_ZONE_ID).toLocalDate()
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
            appointmentDate: String? = null,
            avgMinutesOverride: Int? = null,
            currentInsideSince: String? = null,
            isAnyoneInsideOverride: Boolean? = null
        ): LiveQueueTimingEstimate {
            val avgMins = (avgMinutesOverride ?: clinic?.getEffectiveAvgMinutes() ?: 10).coerceAtLeast(1)
            val todaySchedule = clinic?.getTodaySchedule()
            val openLocalTime = ClinicScheduleHelper.parseTimeToLocalTime(todaySchedule?.openTime ?: "08:00 AM")
            val timeFormatter = DateTimeFormatter.ofPattern("h:mm a", Locale.US)
            val zoneId = CLINIC_ZONE_ID
            val nowZoned = ZonedDateTime.now(zoneId)
            val nowTime = nowZoned.toLocalTime()
            val nowInstant = nowZoned.toInstant()

            // Count ONLY active people. Strictly exclude completed, cancelled and no-show patients.
            val activeEntries = allClinicQueueEntries
                .filter { it.status == "waiting" || it.status == "inside" || it.status == "in_consultation" }
                .sortedWith(
                    compareBy<QueueEntry> { if (it.status == "inside" || it.status == "in_consultation") 0 else 1 }
                        .thenBy { it.queuePosition }
                )

            val insideEntryFromList = activeEntries.firstOrNull { it.status == "inside" || it.status == "in_consultation" }
            val insideEntry = when {
                isAnyoneInsideOverride == false -> null
                insideEntryFromList != null -> insideEntryFromList
                isAnyoneInsideOverride == true -> {
                    QueueEntry(
                        id = "synthetic_inside_cabin",
                        appointmentId = "",
                        clinicId = clinic?.id ?: "",
                        doctorId = null,
                        queuePosition = 0,
                        status = "inside",
                        insideAt = currentInsideSince
                    )
                }
                else -> null
            }

            val totalPeopleAhead = if (targetEntry != null) {
                if (targetEntry.status in listOf("inside", "in_consultation")) {
                    0
                } else {
                    val myIdx = activeEntries.indexOfFirst { it.id == targetEntry.id }
                    if (myIdx >= 0) {
                        if (fallbackPatientsAhead >= 0 && fallbackPatientsAhead != myIdx) {
                            fallbackPatientsAhead
                        } else {
                            myIdx
                        }
                    } else fallbackPatientsAhead.coerceAtLeast(0)
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

            val isSlotInFutureRaw = slotStartTime != null && nowTime.isBefore(slotStartTime)

            val slotNotice = when {
                slotStartTime != null && totalPeopleAhead == 0 -> {
                    if (isSlotInFutureRaw) {
                        "No one ahead of you. Your slot starts at $slotStartStr. $arrivalAdvice".trim()
                    } else {
                        "No one ahead of you. You are up next!"
                    }
                }
                slotStartTime != null && totalPeopleAhead > 0 -> {
                    val personWord = if (totalPeopleAhead == 1) "person" else "people"
                    if (isSlotInFutureRaw) {
                        "$totalPeopleAhead $personWord ahead. Your slot starts at $slotStartStr. $arrivalAdvice".trim()
                    } else {
                        "$totalPeopleAhead $personWord ahead in line. Active consultation underway."
                    }
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
                val insideInstant = if (!insideEntry.insideAt.isNullOrBlank()) {
                    parseServerInstant(insideEntry.insideAt) ?: nowInstant
                } else nowInstant
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
                        val ts = entry.completedAt ?: entry.insideAt ?: entry.calledAt
                        if (!ts.isNullOrBlank()) {
                            parseServerInstant(ts)
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
                        dynamicExpectedTime = nowTime.plusMinutes(2)
                        minsWaitCalc = 2
                    } else {
                        val anchorInstant = latestActivityInstant ?: nowInstant
                        val expectedInstant = anchorInstant.plusSeconds(totalPeopleAhead * avgMins * 60L)
                        val diffSec = expectedInstant.epochSecond - nowInstant.epochSecond
                        minsWaitCalc = kotlin.math.ceil(diffSec / 60.0).toInt().coerceAtLeast(1)
                        dynamicExpectedTime = expectedInstant.atZone(zoneId).toLocalTime()
                    }
                }
            }

            // Apply Dynamic slot-aware queue time calculation
            val isFirstPosition = (totalPeopleAhead == 0)

            val effectiveExpectedTime: LocalTime
            val effectiveTimeLeftText: String
            val effectiveExactTimeText: String

            if (isFirstPosition) {
                if (isSlotInFuture && !canOfferEarly) {
                    // Future slot floor: patient booked for future slot (e.g. 9-10 AM, now is 8:30 AM).
                    // Floor at slotStartTime, but if prior queue overrun pushed dynamicExpectedTime > slotStartTime, show overrun.
                    effectiveExpectedTime = if (dynamicExpectedTime.isAfter(slotStartTime)) dynamicExpectedTime else slotStartTime!!
                    val diffSec = java.time.Duration.between(nowTime, effectiveExpectedTime).seconds
                    val diffMins = kotlin.math.ceil(diffSec / 60.0).toInt().coerceAtLeast(0)
                    effectiveTimeLeftText = when {
                        diffMins > 60 -> {
                            val hours = diffMins / 60
                            val rem = diffMins % 60
                            if (rem == 0) "~ $hours hr" else "~ ${hours}h ${rem}m"
                        }
                        diffMins > 0 -> "~ $diffMins min"
                        else -> "Starts at $slotStartStr"
                    }
                    effectiveExactTimeText = effectiveExpectedTime.format(timeFormatter)
                } else {
                    // Active or overdue slot (now >= slotStartTime), or early arrival opted-in:
                    // Doctor free: +2m preparation buffer
                    // Doctor not in clinic / away: +5m buffer
                    // Someone inside: dynamicExpectedTime (inside patient end time)
                    val minForwardTime = when {
                        insideEntry != null -> dynamicExpectedTime
                        !isDoctorInClinic -> nowTime.plusMinutes(5)
                        else -> nowTime.plusMinutes(2)
                    }
                    effectiveExpectedTime = if (dynamicExpectedTime.isAfter(minForwardTime)) dynamicExpectedTime else minForwardTime
                    val diffSec = java.time.Duration.between(nowTime, effectiveExpectedTime).seconds
                    val diffMins = kotlin.math.ceil(diffSec / 60.0).toInt().coerceAtLeast(1)
                    effectiveTimeLeftText = if (diffMins <= 2) "Up Next (~2 min)" else "~ $diffMins min"
                    effectiveExactTimeText = effectiveExpectedTime.format(timeFormatter)
                }
            } else {
                // Patient is at position 2, 3, etc. (totalPeopleAhead > 0)
                if (isSlotInFuture) {
                    // Stagger patient by (totalPeopleAhead * avgMins) so time is within slot
                    val slotStaggered = (slotStartTime ?: nowTime).plusMinutes((totalPeopleAhead * avgMins).toLong())
                    effectiveExpectedTime = if (dynamicExpectedTime.isAfter(slotStaggered)) dynamicExpectedTime else slotStaggered
                    val diffSec = java.time.Duration.between(nowTime, effectiveExpectedTime).seconds
                    val diffMins = kotlin.math.ceil(diffSec / 60.0).toInt().coerceAtLeast(1)
                    effectiveTimeLeftText = if (diffMins > 60) {
                        val hours = diffMins / 60
                        val rem = diffMins % 60
                        if (rem == 0) "~ $hours hr" else "~ ${hours}h ${rem}m"
                    } else {
                        "~ $diffMins min"
                    }
                    effectiveExactTimeText = effectiveExpectedTime.format(timeFormatter)
                } else {
                    // Overdue or active slot: strictly forward clamp >= now
                    val minForwardTime = nowTime.plusMinutes((totalPeopleAhead * avgMins).toLong().coerceAtLeast(1))
                    effectiveExpectedTime = if (dynamicExpectedTime.isAfter(minForwardTime)) dynamicExpectedTime else minForwardTime
                    val diffSec = java.time.Duration.between(nowTime, effectiveExpectedTime).seconds
                    val diffMins = kotlin.math.ceil(diffSec / 60.0).toInt().coerceAtLeast(1)
                    effectiveTimeLeftText = if (diffMins > 60) "~ ${diffMins / 60}h ${diffMins % 60}m" else "~ $diffMins min"
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
                allSlotsForDate.filter { it.doctorId == doctorId }
            } else {
                allSlotsForDate.filter { it.doctorId.isNullOrBlank() }
            }

            val sortedSlots = relevantSlots.sortedBy { SlotRepository.parseTimeToMinutes(it.startTime) ?: 0 }

            val targetDateStr = appointmentDate.trim().take(10)
            val relevantAppointments = allAppointmentsForDate.filter { appt ->
                val matchDoc = if (!doctorId.isNullOrBlank()) {
                    appt.doctorId == doctorId
                } else {
                    appt.doctorId.isNullOrBlank()
                }
                val matchDate = appt.appointmentDate.trim().take(10) == targetDateStr
                val notCancelled = appt.checkinStatus != "cancelled"
                matchDoc && matchDate && notCancelled
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

