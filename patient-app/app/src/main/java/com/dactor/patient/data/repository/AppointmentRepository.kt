package com.dactor.patient.data.repository

import com.dactor.patient.data.model.Appointment
import com.dactor.patient.data.model.BillingInvoice
import com.dactor.patient.data.model.InvoiceItem
import com.dactor.patient.data.model.Profile
import com.dactor.patient.data.model.QueueEntry
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.postgrest.postgrest
import io.github.jan.supabase.postgrest.rpc
import io.github.jan.supabase.functions.functions
import io.ktor.client.call.body
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.doubleOrNull
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import java.time.Instant
import java.util.UUID
import javax.inject.Inject
import javax.inject.Singleton

const val PAY_AT_DESK_SERVICE_CHARGE_PERCENT: Double = 5.0

@Serializable
data class AppointmentInsertDto(
    @SerialName("id") val id: String,
    @SerialName("tracking_code_10_digit") val trackingCode10Digit: String,
    @SerialName("slot_id") val slotId: String? = null,
    @SerialName("clinic_id") val clinicId: String,
    @SerialName("doctor_id") val doctorId: String? = null,
    @SerialName("user_id") val userId: String? = null,
    @SerialName("patient_name") val patientName: String,
    @SerialName("patient_age") val patientAge: Int? = 30,
    @SerialName("patient_gender") val patientGender: String? = "Other",
    @SerialName("patient_mobile") val patientMobile: String,
    @SerialName("patient_email") val patientEmail: String? = null,
    @SerialName("payment_status") val paymentStatus: String = "pending",
    @SerialName("checkin_status") val checkinStatus: String = "checked_in",
    @SerialName("appointment_date") val appointmentDate: String,
    @SerialName("appointment_time") val appointmentTime: String,
    @SerialName("fee_amount") val feeAmount: Double = 0.0,
    @SerialName("service_charge_amount") val serviceChargeAmount: Double = 0.0,
    @SerialName("total_amount") val totalAmount: Double = 0.0,
    @SerialName("payment_mode") val paymentMode: String = "ONLINE",
    @SerialName("status") val status: String = "APPROVED",
    @SerialName("attempt_number") val attemptNumber: Int = 1,
    @SerialName("is_walkin") val isWalkin: Boolean = false
)

@Serializable
data class QueueEntryInsertDto(
    @SerialName("id") val id: String,
    @SerialName("appointment_id") val appointmentId: String,
    @SerialName("clinic_id") val clinicId: String,
    @SerialName("doctor_id") val doctorId: String? = null,
    @SerialName("queue_position") val queuePosition: Int,
    @SerialName("status") val status: String = "waiting",
    @SerialName("completed_at") val completedAt: String? = null
)

@Serializable
data class ProfileInsertDto(
    @SerialName("id") val id: String,
    @SerialName("email") val email: String,
    @SerialName("full_name") val fullName: String,
    @SerialName("role") val role: String = "patient",
    @SerialName("phone") val phone: String? = null,
    @SerialName("gender") val gender: String? = null,
    @SerialName("age") val age: Int? = null
)

@Serializable
data class BillingInvoiceInsertDto(
    @SerialName("id") val id: String,
    @SerialName("appointment_id") val appointmentId: String,
    @SerialName("clinic_id") val clinicId: String,
    @SerialName("total_amount") val totalAmount: Double = 0.0,
    @SerialName("paid_amount") val paidAmount: Double = 0.0,
    @SerialName("balance_due") val balanceDue: Double = 0.0,
    @SerialName("payment_status") val paymentStatus: String = "paid",
    @SerialName("paid_at") val paidAt: String? = null,
    @SerialName("remarks") val remarks: String? = null
)

@Serializable
data class OnlineCheckoutResponse(
    val attemptId: String = "",
    val gateway: String = "esewa",
    val checkoutUrl: String = "",
    val transactionUuid: String = "",
    val error: String? = null
)

@Serializable
data class OnlinePaymentStatus(
    val status: String = "pending",
    val gateway: String? = null,
    val reference: String? = null,
    val error: String? = null
)

@Serializable
data class PublicPaymentMethodsEnvelope(
    val methods: List<com.dactor.patient.data.model.PublicPaymentMethod> = emptyList()
)

typealias EsewaCheckoutResponse = OnlineCheckoutResponse
typealias EsewaPaymentStatus = OnlinePaymentStatus

@Singleton
class AppointmentRepository @Inject constructor(
    private val supabaseClient: SupabaseClient
) {
    @Volatile
    private var cachedAppointments: List<Appointment>? = null

    fun getCachedAppointments(): List<Appointment> = cachedAppointments ?: emptyList()

    fun setCachedAppointments(list: List<Appointment>) {
        cachedAppointments = list
    }

    private val lenientJson = kotlinx.serialization.json.Json {
        ignoreUnknownKeys = true
        isLenient = true
        coerceInputValues = true
    }

    suspend fun getClinicPublicPaymentMethods(clinicId: String): List<com.dactor.patient.data.model.PublicPaymentMethod> = withContext(Dispatchers.IO) {
        val payAtDeskDefault = com.dactor.patient.data.model.PublicPaymentMethod(
            id = "pay_at_desk",
            name = "Pay at Desk (+5%)",
            subtitle = "Pay cash/QR at clinic counter (+5% service charge)",
            isVerified = true,
            requiresKeys = false,
            requiresDeskApproval = true
        )
        if (clinicId.isBlank()) return@withContext listOf(payAtDeskDefault)

        try {
            val rpcResult = supabaseClient.postgrest.rpc(
                function = "get_clinic_public_payment_methods",
                parameters = buildJsonObject { put("p_clinic_id", clinicId) }
            ).decodeList<com.dactor.patient.data.model.PublicPaymentMethod>()
            if (rpcResult.isNotEmpty()) {
                val hasDesk = rpcResult.any { it.id.equals("pay_at_desk", ignoreCase = true) }
                return@withContext if (hasDesk) rpcResult else rpcResult + payAtDeskDefault
            }
        } catch (_: Exception) {
            // Fallback to Edge Function if SQL migration not yet run or transient error
        }

        try {
            val response = supabaseClient.functions.invoke("appointment-payment", body = buildJsonObject {
                put("action", "get_public_payment_methods")
                put("clinicId", clinicId)
            })
            val env = lenientJson.decodeFromString(PublicPaymentMethodsEnvelope.serializer(), response.body<String>())
            if (env.methods.isNotEmpty()) {
                val hasDesk = env.methods.any { it.id.equals("pay_at_desk", ignoreCase = true) }
                return@withContext if (hasDesk) env.methods else env.methods + payAtDeskDefault
            }
        } catch (_: Exception) {}

        emptyList()
    }

    suspend fun startOnlinePayment(
        appointmentId: String,
        gateway: String = "esewa",
        selectedTests: String? = null
    ): OnlineCheckoutResponse = withContext(Dispatchers.IO) {
        val response = supabaseClient.functions.invoke("appointment-payment", body = buildJsonObject {
            put("action", "initiate")
            put("appointmentId", appointmentId)
            put("gateway", gateway.lowercase().trim())
            if (!selectedTests.isNullOrBlank()) {
                put("selectedTests", selectedTests)
            }
        })
        val raw = response.body<String>()
        val parsed = lenientJson.decodeFromString(OnlineCheckoutResponse.serializer(), raw)
        if (!parsed.error.isNullOrBlank() || parsed.checkoutUrl.isBlank()) {
            throw IllegalStateException(parsed.error ?: "Could not start ${gateway.uppercase()} payment session")
        }
        parsed
    }

    suspend fun refreshOnlinePayment(appointmentId: String): OnlinePaymentStatus = withContext(Dispatchers.IO) {
        val response = supabaseClient.functions.invoke("appointment-payment", body = buildJsonObject {
            put("action", "refresh")
            put("appointmentId", appointmentId)
        })
        val raw = response.body<String>()
        lenientJson.decodeFromString(OnlinePaymentStatus.serializer(), raw)
    }

    suspend fun startEsewaPayment(appointmentId: String): OnlineCheckoutResponse =
        startOnlinePayment(appointmentId, "esewa")

    suspend fun refreshEsewaPayment(appointmentId: String): OnlinePaymentStatus =
        refreshOnlinePayment(appointmentId)
    suspend fun getAppointmentByTrackingCode(code: String): Appointment? = withContext(Dispatchers.IO) {
        try {
            val appts = supabaseClient.postgrest["appointments"]
                .select { filter { eq("tracking_code_10_digit", code.trim()) } }
                .decodeList<Appointment>()
            val appt = appts.maxByOrNull { it.appointmentDate } ?: appts.lastOrNull()
            if (appt != null) {
                if (appt.checkinStatus.lowercase() in listOf("done", "completed")) {
                    return@withContext appt.copy(checkinStatus = "completed")
                }
                val qList = supabaseClient.postgrest["queue_entries"]
                    .select { filter { eq("appointment_id", appt.id) } }
                    .decodeList<com.dactor.patient.data.model.QueueEntry>()
                val activeOrLatest = qList.firstOrNull { it.status == "waiting" || it.status == "inside" } ?: qList.lastOrNull()
                if (activeOrLatest != null && (activeOrLatest.status.lowercase() in listOf("done", "completed")) && qList.none { it.status.lowercase() in listOf("waiting", "inside", "in_consultation") }) {
                    return@withContext appt.copy(checkinStatus = "completed")
                }
            }
            appt
        } catch (e: Exception) {
            e.printStackTrace()
            null
        }
    }

    suspend fun getAllAppointmentsByTrackingCode(code: String): List<Appointment> = withContext(Dispatchers.IO) {
        try {
            val clean = code.trim()
            if (clean.isBlank()) return@withContext emptyList()
            supabaseClient.postgrest["appointments"]
                .select { filter { eq("tracking_code_10_digit", clean) } }
                .decodeList<Appointment>()
        } catch (e: Exception) {
            emptyList()
        }
    }

    private suspend fun reconcileSlotBookedCount(targetSlotId: String) {
        if (!isValidUuid(targetSlotId)) return
        try {
            val apptsForSlot = supabaseClient.postgrest["appointments"]
                .select { filter { eq("slot_id", targetSlotId) } }
                .decodeList<Appointment>()
            val realCount = apptsForSlot.count {
                it.checkinStatus != "cancelled" &&
                it.paymentStatus != "failed" &&
                (it.status == "APPROVED" || it.paymentStatus.equals("paid", ignoreCase = true))
            }
            supabaseClient.postgrest["slots"].update({
                set("booked_count", realCount)
            }) {
                filter { eq("id", targetSlotId) }
            }
        } catch (_: Exception) {}
    }

    /**
     * Books a follow-up appointment reusing the patient's existing demographic profile
     * (name, age, gender, mobile, email) identified by their 10-digit Appointment ID.
     * If the appointment is already completed, creates a NEW appointment row to preserve medical history.
     * If active/upcoming, reschedules the existing appointment row to the new slot.
     */
    suspend fun bookFollowUpAppointment(
        trackingCode: String,
        slotId: String?,
        clinicId: String,
        doctorId: String?,
        appointmentDate: String,
        appointmentTime: String,
        fallbackUserId: String? = null,
        fallbackEmail: String? = null
    ): Appointment? = withContext(Dispatchers.IO) {
        val cleanCode = trackingCode.trim()
        val existing = getAppointmentByTrackingCode(cleanCode) ?: return@withContext null

        val retainedEmail = existing.patientEmail?.trim()?.lowercase()?.takeIf { it.isNotBlank() }
            ?: fallbackEmail?.trim()?.lowercase()?.takeIf { it.isNotBlank() }
        val retainedUserId = existing.userId?.takeIf { isValidUuid(it) }
            ?: fallbackUserId?.takeIf { isValidUuid(it) }
        val validSlotId = slotId?.takeIf { isValidUuid(it) }
        val validDoctorId = doctorId?.takeIf { isValidUuid(it) } ?: existing.doctorId?.takeIf { isValidUuid(it) }
        val normalizedTime = normalizeTimeForPostgres(appointmentTime)

        val isToday = (appointmentDate == java.time.LocalDate.now().toString())
        val isCompleted = existing.checkinStatus.lowercase() in listOf("done", "completed")

        if (isCompleted) {
            // COMPLETED VISIT -> CREATE NEW FOLLOW-UP APPOINTMENT RECORD (Preserves past consultation history)
            val newApptId = UUID.randomUUID().toString()
            val newAppointment = existing.copy(
                id = newApptId,
                slotId = validSlotId,
                clinicId = clinicId,
                doctorId = validDoctorId,
                userId = retainedUserId,
                patientEmail = retainedEmail,
                appointmentDate = appointmentDate,
                appointmentTime = normalizedTime,
                paymentStatus = "paid",
                checkinStatus = "not_checked_in",
                status = "APPROVED",
                feeAmount = 0.0,
                totalAmount = 0.0,
                serviceChargeAmount = 0.0,
                paymentMode = "ONLINE",
                createdAt = java.time.Instant.now().toString()
            )

            val created = try {
                supabaseClient.postgrest["appointments"]
                    .insert(newAppointment) { select() }
                    .decodeSingle<Appointment>()
            } catch (e: Exception) {
                e.printStackTrace()
                try {
                    val withoutUser = newAppointment.copy(userId = null)
                    supabaseClient.postgrest["appointments"]
                        .insert(withoutUser) { select() }
                        .decodeSingle<Appointment>()
                } catch (retryEx: Exception) {
                    newAppointment
                }
            }

            if (!validSlotId.isNullOrBlank()) {
                reconcileSlotBookedCount(validSlotId)
            }

            if (isToday) {
                try {
                    val existingEntries = supabaseClient.postgrest["queue_entries"]
                        .select { filter { eq("clinic_id", clinicId) } }
                        .decodeList<com.dactor.patient.data.model.QueueEntry>()
                    val nextPos = (existingEntries
                        .filter { it.status == "waiting" || it.status == "inside" }
                        .maxOfOrNull { it.queuePosition } ?: 0) + 1
                    val queueEntryDto = QueueEntryInsertDto(
                        id = UUID.randomUUID().toString(),
                        appointmentId = created.id,
                        clinicId = clinicId,
                        doctorId = validDoctorId,
                        queuePosition = nextPos,
                        status = "waiting"
                    )
                    supabaseClient.postgrest["queue_entries"].insert(queueEntryDto)
                } catch (e: Exception) {
                    e.printStackTrace()
                }
            }

            return@withContext created
        } else {
            // ACTIVE / UPCOMING VISIT -> RESCHEDULE EXISTING APPOINTMENT
            val oldSlotId = existing.slotId
            try {
                supabaseClient.postgrest["appointments"].update({
                    set("slot_id", validSlotId)
                    set("clinic_id", clinicId)
                    if (!validDoctorId.isNullOrBlank()) set("doctor_id", validDoctorId)
                    if (!retainedUserId.isNullOrBlank()) set("user_id", retainedUserId)
                    if (!retainedEmail.isNullOrBlank()) set("patient_email", retainedEmail)
                    set("appointment_date", appointmentDate)
                    set("appointment_time", normalizedTime)
                    set("payment_status", "paid")
                    set("checkin_status", "not_checked_in")
                    set("status", "APPROVED")
                    set("fee_amount", 0.0)
                }) {
                    filter { eq("id", existing.id) }
                }
            } catch (e: Exception) {
                e.printStackTrace()
            }

            if (!oldSlotId.isNullOrBlank() && oldSlotId != validSlotId) {
                reconcileSlotBookedCount(oldSlotId)
            }
            if (!validSlotId.isNullOrBlank()) {
                reconcileSlotBookedCount(validSlotId)
            }

            // Remove any old queue entries for this appointment
            try {
                supabaseClient.postgrest["queue_entries"].delete {
                    filter { eq("appointment_id", existing.id) }
                }
            } catch (ignored: Exception) {}

            // Only insert a fresh waiting queue entry if the rescheduled appointment is for TODAY
            if (isToday) {
                try {
                    val existingEntries = supabaseClient.postgrest["queue_entries"]
                        .select { filter { eq("clinic_id", clinicId) } }
                        .decodeList<com.dactor.patient.data.model.QueueEntry>()
                    val nextPos = (existingEntries
                        .filter { it.status == "waiting" || it.status == "inside" }
                        .maxOfOrNull { it.queuePosition } ?: 0) + 1
                    val queueEntryDto = QueueEntryInsertDto(
                        id = UUID.randomUUID().toString(),
                        appointmentId = existing.id,
                        clinicId = clinicId,
                        doctorId = validDoctorId,
                        queuePosition = nextPos,
                        status = "waiting"
                    )
                    supabaseClient.postgrest["queue_entries"].insert(queueEntryDto)
                } catch (e: Exception) {
                    e.printStackTrace()
                }
            }

            return@withContext existing.copy(
                slotId = validSlotId,
                clinicId = clinicId,
                doctorId = validDoctorId,
                userId = retainedUserId,
                patientEmail = retainedEmail,
                appointmentDate = appointmentDate,
                appointmentTime = normalizedTime,
                paymentStatus = "paid",
                checkinStatus = "waiting",
                status = "APPROVED",
                feeAmount = 0.0
            )
        }
    }

    suspend fun getAppointmentById(id: String): Appointment? = withContext(Dispatchers.IO) {
        try {
            val appts = supabaseClient.postgrest["appointments"]
                .select { filter { eq("id", id) } }
                .decodeList<Appointment>()
            val appt = appts.firstOrNull()
            if (appt != null) {
                val qList = supabaseClient.postgrest["queue_entries"]
                    .select { filter { eq("appointment_id", appt.id) } }
                    .decodeList<com.dactor.patient.data.model.QueueEntry>()
                if (qList.any { it.status == "done" }) {
                    return@withContext appt.copy(checkinStatus = "completed")
                }
            }
            appt
        } catch (e: Exception) {
            e.printStackTrace()
            null
        }
    }

    suspend fun getUserAppointments(userId: String): List<Appointment> = withContext(Dispatchers.IO) {
        try {
            val appts = supabaseClient.postgrest["appointments"]
                .select { filter { eq("user_id", userId) } }
                .decodeList<Appointment>()
            if (appts.isEmpty()) return@withContext emptyList()
            val queueEntries = supabaseClient.postgrest["queue_entries"]
                .select()
                .decodeList<com.dactor.patient.data.model.QueueEntry>()
            val doneIds = queueEntries.filter { it.status == "done" }.map { it.appointmentId }.toSet()
            appts.map {
                if (doneIds.contains(it.id)) it.copy(checkinStatus = "completed") else it
            }
        } catch (e: Exception) {
            e.printStackTrace()
            emptyList()
        }
    }

    /**
     * Comprehensive lookup that finds all appointments belonging to a patient across:
     * - user_id (direct or resolved via profiles table by email)
     * - patient_email
     * - patient_mobile
     * - saved 10-digit tracking codes
     */
    suspend fun getAllPatientAppointments(
        userId: String?,
        email: String?,
        phone: String?,
        trackingCodes: List<String> = emptyList()
    ): List<Appointment> = withContext(Dispatchers.IO) {
        try {
            val collected = java.util.Collections.synchronizedList(mutableListOf<Appointment>())
            var resolvedProfileId: String? = null
            val cleanEmail = email?.trim()?.lowercase()
            val cleanPhone = phone?.trim()

            coroutineScope {
                // 1. Direct userId lookup (if valid UUID)
                val jobUserId = async {
                    if (!userId.isNullOrBlank()) {
                        try {
                            java.util.UUID.fromString(userId)
                            resolvedProfileId = userId
                        } catch (ignored: Exception) {}
                        try {
                            val byUid = supabaseClient.postgrest["appointments"]
                                .select { filter { eq("user_id", userId) } }
                                .decodeList<Appointment>()
                            collected.addAll(byUid)
                        } catch (ignored: Exception) {}
                    }
                }

                // 2. Resolve profile.id by email (case-insensitive) + match patient_email
                val jobEmail = async {
                    if (!cleanEmail.isNullOrBlank()) {
                        try {
                            val profiles = try {
                                supabaseClient.postgrest["profiles"]
                                    .select { filter { ilike("email", cleanEmail) } }
                                    .decodeList<Profile>()
                            } catch (e: Exception) {
                                supabaseClient.postgrest["profiles"]
                                    .select { filter { eq("email", cleanEmail) } }
                                    .decodeList<Profile>()
                            }
                            val profileId = profiles.firstOrNull()?.id
                            if (!profileId.isNullOrBlank()) {
                                if (resolvedProfileId == null) resolvedProfileId = profileId
                                if (profileId != userId) {
                                    val byProfileId = supabaseClient.postgrest["appointments"]
                                        .select { filter { eq("user_id", profileId) } }
                                        .decodeList<Appointment>()
                                    collected.addAll(byProfileId)
                                }
                            }
                            val profilePhone = profiles.firstOrNull()?.phone?.trim()
                            if (!profilePhone.isNullOrBlank()) {
                                val byProfilePhone = supabaseClient.postgrest["appointments"]
                                    .select { filter { eq("patient_mobile", profilePhone) } }
                                    .decodeList<Appointment>()
                                collected.addAll(byProfilePhone)
                            }
                        } catch (ignored: Exception) {}

                        try {
                            val byEmail = try {
                                supabaseClient.postgrest["appointments"]
                                    .select { filter { ilike("patient_email", cleanEmail) } }
                                    .decodeList<Appointment>()
                            } catch (e: Exception) {
                                supabaseClient.postgrest["appointments"]
                                    .select { filter { eq("patient_email", cleanEmail) } }
                                    .decodeList<Appointment>()
                            }
                            collected.addAll(byEmail)
                        } catch (ignored: Exception) {}

                        // Match by deterministic patient ID generated from this email
                        try {
                            val deterministicUid = com.dactor.patient.domain.util.PatientIdentitySync.getDeterministicPatientIdForEmail(cleanEmail)
                            val byDetUid = supabaseClient.postgrest["appointments"]
                                .select { filter { eq("user_id", deterministicUid) } }
                                .decodeList<Appointment>()
                            collected.addAll(byDetUid)
                        } catch (ignored: Exception) {}
                    }
                }

                // 3. Match by phone number
                val jobPhone = async {
                    if (!cleanPhone.isNullOrBlank()) {
                        try {
                            val byPhone = supabaseClient.postgrest["appointments"]
                                .select { filter { eq("patient_mobile", cleanPhone) } }
                                .decodeList<Appointment>()
                            collected.addAll(byPhone)
                        } catch (ignored: Exception) {}

                        // Match by deterministic patient ID generated from this phone
                        try {
                            val deterministicPhoneUid = com.dactor.patient.domain.util.PatientIdentitySync.getDeterministicPatientIdForPhone(cleanPhone)
                            val byDetPhoneUid = supabaseClient.postgrest["appointments"]
                                .select { filter { eq("user_id", deterministicPhoneUid) } }
                                .decodeList<Appointment>()
                            collected.addAll(byDetPhoneUid)
                        } catch (ignored: Exception) {}
                    }
                }

                // 4. Match by saved 10-digit tracking codes
                val jobCodes = async {
                    val cleanCodes = trackingCodes.map { it.trim() }.filter { it.isNotBlank() }.distinct()
                    if (cleanCodes.isNotEmpty()) {
                        try {
                            val byCodes = supabaseClient.postgrest["appointments"]
                                .select { filter { isIn("tracking_code_10_digit", cleanCodes) } }
                                .decodeList<Appointment>()
                            collected.addAll(byCodes)
                        } catch (ignored: Exception) {
                            for (code in cleanCodes) {
                                try {
                                    val single = supabaseClient.postgrest["appointments"]
                                        .select { filter { eq("tracking_code_10_digit", code) } }
                                        .decodeList<Appointment>()
                                    collected.addAll(single)
                                } catch (ignoredInner: Exception) {}
                            }
                        }
                    }
                }

                awaitAll(jobUserId, jobEmail, jobPhone, jobCodes)
            }

            val distinctAppts = collected.distinctBy { it.id }
            if (distinctAppts.isEmpty()) {
                cachedAppointments = emptyList()
                return@withContext emptyList()
            }

            // Retroactively link any unlinked appointments that matched by email or phone to resolvedProfileId
            val targetUserId = resolvedProfileId
            if (!targetUserId.isNullOrBlank()) {
                val unlinkedIds = distinctAppts
                    .filter { appt ->
                        appt.userId.isNullOrBlank() &&
                        ((!cleanEmail.isNullOrBlank() && appt.patientEmail?.trim()?.equals(cleanEmail, ignoreCase = true) == true) ||
                         (!cleanPhone.isNullOrBlank() && appt.patientMobile.trim() == cleanPhone))
                    }
                    .map { it.id }
                if (unlinkedIds.isNotEmpty()) {
                    try {
                        supabaseClient.postgrest["appointments"].update({
                            set("user_id", targetUserId)
                        }) {
                            filter { isIn("id", unlinkedIds) }
                        }
                    } catch (ignored: Exception) {}
                }
            }

            // Check queue_entries for "done" or "completed" status
            val doneIds = try {
                val apptIds = distinctAppts.map { it.id }
                supabaseClient.postgrest["queue_entries"]
                    .select { filter { isIn("appointment_id", apptIds) } }
                    .decodeList<com.dactor.patient.data.model.QueueEntry>()
                    .filter { it.status.lowercase() in listOf("done", "completed") }
                    .map { it.appointmentId }
                    .toSet()
            } catch (e: Exception) {
                emptySet()
            }

            val finalResult = distinctAppts.map { appt ->
                if (doneIds.contains(appt.id) || appt.checkinStatus.lowercase() in listOf("done", "completed")) {
                    appt.copy(checkinStatus = "completed")
                } else {
                    appt
                }
            }.sortedByDescending { it.appointmentDate }
            cachedAppointments = finalResult
            finalResult
        } catch (e: Exception) {
            e.printStackTrace()
            emptyList()
        }
    }

    suspend fun createAppointment(appointment: Appointment): Appointment = withContext(Dispatchers.IO) {
        val cleanEmail = appointment.patientEmail?.trim()?.lowercase()?.takeIf { it.isNotBlank() }
        var resolvedUserId = appointment.userId?.takeIf { isValidUuid(it) }

        if (cleanEmail != null) {
            try {
                val existingProfile = try {
                    supabaseClient.postgrest["profiles"]
                        .select { filter { ilike("email", cleanEmail) } }
                        .decodeList<Profile>()
                        .firstOrNull()
                } catch (e: Exception) {
                    supabaseClient.postgrest["profiles"]
                        .select { filter { eq("email", cleanEmail) } }
                        .decodeList<Profile>()
                        .firstOrNull()
                }

                if (existingProfile != null) {
                    resolvedUserId = existingProfile.id
                    try {
                        if (existingProfile.phone.isNullOrBlank() && appointment.patientMobile.isNotBlank()) {
                            supabaseClient.postgrest["profiles"].update({
                                set("phone", appointment.patientMobile.trim())
                                if (existingProfile.fullName.isNullOrBlank() && appointment.patientName.isNotBlank()) {
                                    set("full_name", appointment.patientName.trim())
                                }
                                if (existingProfile.gender.isNullOrBlank() && appointment.patientGender.isNotBlank()) {
                                    set("gender", appointment.patientGender)
                                }
                                if (existingProfile.age == null && appointment.patientAge > 0) {
                                    set("age", appointment.patientAge)
                                }
                            }) {
                                filter { eq("id", existingProfile.id) }
                            }
                        }
                    } catch (ignored: Exception) {}
                } else {
                    val newProfileId = resolvedUserId ?: java.util.UUID.randomUUID().toString()
                    try {
                        val profileDto = ProfileInsertDto(
                            id = newProfileId,
                            email = cleanEmail,
                            fullName = appointment.patientName.trim(),
                            role = "patient",
                            phone = appointment.patientMobile.trim(),
                            gender = appointment.patientGender.takeIf { it.isNotBlank() },
                            age = appointment.patientAge.takeIf { it > 0 }
                        )
                        supabaseClient.postgrest["profiles"].insert(profileDto)
                        resolvedUserId = newProfileId
                    } catch (e: Exception) {
                        resolvedUserId = null
                    }
                }
            } catch (ignored: Exception) {}
        } else if (appointment.patientMobile.isNotBlank()) {
            try {
                val byPhone = supabaseClient.postgrest["profiles"]
                    .select { filter { eq("phone", appointment.patientMobile.trim()) } }
                    .decodeList<Profile>()
                    .firstOrNull()
                if (byPhone != null) {
                    resolvedUserId = byPhone.id
                }
            } catch (ignored: Exception) {}
        }

        val apptId = if (isValidUuid(appointment.id)) appointment.id else UUID.randomUUID().toString()
        val validSlotId = appointment.slotId?.takeIf { isValidUuid(it) }
        val validDoctorId = appointment.doctorId?.takeIf { isValidUuid(it) }
        val normalizedTime = normalizeTimeForPostgres(appointment.appointmentTime)

        // ==========================================
        // IDEMPOTENCY SAFETY GUARDS
        // ==========================================
        // 1. If an appointment already exists with this ID, return it immediately
        if (isValidUuid(appointment.id)) {
            try {
                val existingById = supabaseClient.postgrest["appointments"]
                    .select { filter { eq("id", appointment.id) } }
                    .decodeList<Appointment>()
                    .firstOrNull()
                if (existingById != null) {
                    return@withContext existingById
                }
            } catch (ignored: Exception) {}
        }

        // 2. If an appointment already exists with this 10-digit tracking code, return it
        if (appointment.trackingCode10Digit.isNotBlank()) {
            try {
                val existingByCode = supabaseClient.postgrest["appointments"]
                    .select { filter { eq("tracking_code_10_digit", appointment.trackingCode10Digit.trim()) } }
                    .decodeList<Appointment>()
                    .firstOrNull()
                if (existingByCode != null) {
                    return@withContext existingByCode
                }
            } catch (ignored: Exception) {}
        }

        // 3. Deduplication guard against rapid double-taps on poor mobile network
        if (validSlotId != null && appointment.patientMobile.isNotBlank() && appointment.appointmentDate.isNotBlank()) {
            try {
                val existingList = supabaseClient.postgrest["appointments"]
                    .select {
                        filter {
                            eq("clinic_id", appointment.clinicId)
                            eq("slot_id", validSlotId)
                            eq("patient_mobile", appointment.patientMobile.trim())
                            eq("appointment_date", appointment.appointmentDate)
                        }
                    }
                    .decodeList<Appointment>()

                // 3a. If already paid for THIS EXACT PATIENT, reuse it to prevent double-charging
                val paidAppt = existingList.firstOrNull { 
                    it.paymentStatus.equals("paid", ignoreCase = true) &&
                    it.patientName.trim().equals(appointment.patientName.trim(), ignoreCase = true)
                }
                if (paidAppt != null) {
                    return@withContext paidAppt
                }

                // 3b. Genuine double-tap guard: only reuse if created within the last 30 seconds with identical payment mode & exact same patient name
                val nowMs = System.currentTimeMillis()
                val recentDoubleTap = existingList.firstOrNull { existing ->
                    val isSameMode = existing.paymentMode.equals(appointment.paymentMode, ignoreCase = true)
                    val isSamePatient = existing.patientName.trim().equals(appointment.patientName.trim(), ignoreCase = true)
                    val createdMs = existing.createdAt?.let { iso ->
                        try {
                            Instant.parse(iso).toEpochMilli()
                        } catch (_: Exception) {
                            try {
                                java.time.OffsetDateTime.parse(iso).toInstant().toEpochMilli()
                            } catch (_: Exception) {
                                null
                            }
                        }
                    }
                    val isRecent = createdMs != null && (nowMs - createdMs) < 30_000L
                    val isActive = existing.status != "CANCELLED" && existing.status != "EXPIRED" && existing.checkinStatus != "cancelled"
                    isSameMode && isSamePatient && isRecent && isActive
                }
                if (recentDoubleTap != null) {
                    return@withContext recentDoubleTap
                }

                // 3c. If user is booking fresh with ONLINE payment mode (e.g. eSewa) for THIS EXACT PATIENT,
                // and a stale/abandoned Pay-at-Desk booking exists, mark the stale desk request as CANCELLED
                if (appointment.paymentMode == "ONLINE") {
                    val staleUnapproved = existingList.filter { 
                        it.status == "WAITING_FOR_APPROVAL" && 
                        it.paymentMode == "PAY_AT_DESK" && 
                        !it.paymentStatus.equals("paid", ignoreCase = true) &&
                        it.patientName.trim().equals(appointment.patientName.trim(), ignoreCase = true)
                    }
                    for (stale in staleUnapproved) {
                        try {
                            supabaseClient.postgrest["appointments"].update({
                                set("status", "CANCELLED")
                                set("checkin_status", "cancelled")
                            }) {
                                filter { eq("id", stale.id) }
                            }
                        } catch (_: Exception) {}
                    }
                }
            } catch (ignored: Exception) {}
        }

        val isPayAtDesk = appointment.paymentMode == "PAY_AT_DESK"
        val fee = appointment.feeAmount
        val serviceCharge = if (isPayAtDesk) Math.round(fee * (PAY_AT_DESK_SERVICE_CHARGE_PERCENT / 100.0) * 100.0) / 100.0 else 0.0
        val totalAmt = if (isPayAtDesk) fee + serviceCharge else fee

        val isOnlinePaid = !isPayAtDesk && appointment.paymentStatus.equals("paid", ignoreCase = true)
        val initialPaymentStatus = if (isPayAtDesk) "pending" else if (isOnlinePaid) "paid" else "pending"
        val initialCheckinStatus = if (isPayAtDesk) "not_checked_in" else if (isOnlinePaid) "checked_in" else "not_checked_in"
        val initialStatus = if (isPayAtDesk) "WAITING_FOR_APPROVAL" else if (isOnlinePaid) "APPROVED" else "pending_payment"

        val insertDto = AppointmentInsertDto(
            id = apptId,
            trackingCode10Digit = appointment.trackingCode10Digit,
            slotId = validSlotId,
            clinicId = appointment.clinicId,
            doctorId = validDoctorId,
            userId = resolvedUserId,
            patientName = appointment.patientName.trim(),
            patientAge = appointment.patientAge.takeIf { it > 0 } ?: 30,
            patientGender = appointment.patientGender.takeIf { it.isNotBlank() } ?: "Other",
            patientMobile = appointment.patientMobile.trim(),
            patientEmail = cleanEmail,
            paymentStatus = initialPaymentStatus,
            checkinStatus = initialCheckinStatus,
            appointmentDate = appointment.appointmentDate,
            appointmentTime = normalizedTime,
            feeAmount = fee,
            serviceChargeAmount = serviceCharge,
            totalAmount = totalAmt,
            paymentMode = if (isPayAtDesk) "PAY_AT_DESK" else "ONLINE",
            status = initialStatus,
            attemptNumber = 1,
            isWalkin = appointment.isWalkin
        )

        val normalizedAppt = appointment.copy(
            id = apptId,
            slotId = validSlotId,
            doctorId = validDoctorId,
            userId = resolvedUserId,
            patientEmail = cleanEmail,
            appointmentTime = normalizedTime,
            paymentStatus = initialPaymentStatus,
            checkinStatus = initialCheckinStatus,
            paymentMode = if (isPayAtDesk) "PAY_AT_DESK" else "ONLINE",
            status = initialStatus,
            attemptNumber = 1,
            serviceChargeAmount = serviceCharge,
            totalAmount = totalAmt
        )

        // 1. Primary Path: Authoritative Server RPC create_patient_appointment (OPD & Diagnostic Labs)
        var rpcCreatedAppt: Appointment? = null
        if (isValidUuid(appointment.clinicId)) {
            try {
                val rpcResult = supabaseClient.postgrest.rpc(
                    function = "create_patient_appointment",
                    parameters = buildJsonObject {
                        put("p_clinic_id", appointment.clinicId)
                        if (isValidUuid(validDoctorId)) {
                            put("p_doctor_id", validDoctorId!!)
                        }
                        put("p_appointment_date", appointment.appointmentDate)
                        put("p_appointment_time", normalizedTime)
                        put("p_patient_name", appointment.patientName.trim())
                        put("p_patient_phone", appointment.patientMobile.trim())
                        if (!cleanEmail.isNullOrBlank()) {
                            put("p_patient_email", cleanEmail)
                        }
                        put("p_patient_age", if (appointment.patientAge > 0) appointment.patientAge else 30)
                        put("p_patient_gender", if (appointment.patientGender.isNotBlank()) appointment.patientGender else "Other")
                        val notesValue = appointment.notes ?: appointment.selectedLabTests
                        if (!notesValue.isNullOrBlank()) {
                            put("p_notes", notesValue)
                        }
                        put("p_is_pay_at_desk", isPayAtDesk)
                        if (validSlotId != null) {
                            put("p_slot_id", validSlotId)
                        }
                        put("p_payment_mode", if (isPayAtDesk) "PAY_AT_DESK" else "ONLINE")
                        if (appointment.feeAmount > 0.0) {
                            put("p_fee_amount", appointment.feeAmount)
                        }
                        if (!appointment.selectedLabTests.isNullOrBlank()) {
                            put("p_selected_lab_tests", appointment.selectedLabTests)
                        }
                    }
                )
                val rawData = rpcResult.data
                if (!rawData.isNullOrBlank()) {
                    val parsed = lenientJson.parseToJsonElement(rawData) as? JsonObject
                    val rpcApptId = parsed?.get("appointment_id")?.jsonPrimitive?.contentOrNull
                        ?: parsed?.get("id")?.jsonPrimitive?.contentOrNull
                    val rpcTrackingCode = parsed?.get("tracking_code_10_digit")?.jsonPrimitive?.contentOrNull
                        ?: parsed?.get("tracking_code")?.jsonPrimitive?.contentOrNull
                    val rpcFee = parsed?.get("fee_amount")?.jsonPrimitive?.doubleOrNull ?: fee
                    val rpcServiceCharge = parsed?.get("service_charge_amount")?.jsonPrimitive?.doubleOrNull ?: serviceCharge
                    val rpcTotal = parsed?.get("total_amount")?.jsonPrimitive?.doubleOrNull ?: totalAmt
                    val rpcStatus = parsed?.get("status")?.jsonPrimitive?.contentOrNull
                        ?: (if (isPayAtDesk) "WAITING_FOR_APPROVAL" else "pending_payment")
                    val rpcExpiresAt = parsed?.get("expires_at")?.jsonPrimitive?.contentOrNull

                    if (!rpcApptId.isNullOrBlank()) {
                        val fetched = try {
                            supabaseClient.postgrest["appointments"]
                                .select { filter { eq("id", rpcApptId) } }
                                .decodeList<Appointment>()
                                .firstOrNull()
                        } catch (_: Exception) { null }

                        val baseAppt = fetched ?: normalizedAppt.copy(
                            id = rpcApptId,
                            trackingCode10Digit = rpcTrackingCode ?: appointment.trackingCode10Digit,
                            feeAmount = rpcFee,
                            serviceChargeAmount = rpcServiceCharge,
                            totalAmount = rpcTotal,
                            paymentStatus = "pending",
                            checkinStatus = "not_checked_in",
                            paymentMode = if (isPayAtDesk) "PAY_AT_DESK" else "ONLINE",
                            status = rpcStatus,
                            expiresAt = rpcExpiresAt
                        )
                        rpcCreatedAppt = if (baseAppt.expiresAt.isNullOrBlank() && !rpcExpiresAt.isNullOrBlank()) {
                            baseAppt.copy(expiresAt = rpcExpiresAt)
                        } else {
                            baseAppt
                        }
                    }
                }
            } catch (rpcEx: Exception) {
                val msg = rpcEx.message ?: ""
                if (msg.contains("rate limit", ignoreCase = true) ||
                    msg.contains("Invalid Nepal mobile", ignoreCase = true) ||
                    msg.contains("Patient name must be", ignoreCase = true) ||
                    msg.contains("not active or verified", ignoreCase = true) ||
                    msg.contains("Doctor does not belong", ignoreCase = true) ||
                    msg.contains("past", ignoreCase = true)
                ) {
                    throw rpcEx
                }
                rpcEx.printStackTrace()
            }
        }

        val created = rpcCreatedAppt ?: try {
            supabaseClient.postgrest["appointments"]
                .insert(insertDto) { select() }
                .decodeSingle<Appointment>()
        } catch (e: Exception) {
            e.printStackTrace()
            val isStatusConstraintError = e.message?.contains("chk_appointments_status", ignoreCase = true) == true
            val effectiveDto = if (isStatusConstraintError) insertDto.copy(status = "APPROVED") else insertDto

            try {
                if (isStatusConstraintError) {
                    supabaseClient.postgrest["appointments"]
                        .insert(effectiveDto) { select() }
                        .decodeSingle<Appointment>()
                } else {
                    val withoutUser = effectiveDto.copy(userId = null)
                    supabaseClient.postgrest["appointments"]
                        .insert(withoutUser) { select() }
                        .decodeSingle<Appointment>()
                }
            } catch (retryEx: Exception) {
                try {
                    val withoutUser = effectiveDto.copy(userId = null)
                    supabaseClient.postgrest["appointments"]
                        .insert(withoutUser) { select() }
                        .decodeSingle<Appointment>()
                } catch (retryNoUserEx: Exception) {
                    try {
                        val minimalDto = effectiveDto.copy(userId = null, slotId = null)
                        supabaseClient.postgrest["appointments"]
                            .insert(minimalDto) { select() }
                            .decodeSingle<Appointment>()
                    } catch (finalEx: Exception) {
                        finalEx.printStackTrace()
                        throw finalEx
                    }
                }
            }
        }
        // Pay at Desk appointments MUST NOT increment slot booked_count or enter live queue until approved
        if (isPayAtDesk) {
            return@withContext created
        }

        if (created.slotId != null) {
            try {
                val apptsForSlot = supabaseClient.postgrest["appointments"]
                    .select { filter { eq("slot_id", created.slotId) } }
                    .decodeList<Appointment>()
                val realCount = apptsForSlot.count { 
                    it.checkinStatus != "cancelled" && (it.status == "APPROVED" || it.paymentStatus.equals("paid", ignoreCase = true))
                }
                supabaseClient.postgrest["slots"].update({
                    set("booked_count", realCount)
                }) {
                    filter { eq("id", created.slotId) }
                }
            } catch (ignored: Exception) {}
        }

        // Direct Queue Placement: Automatically place appointment into live queue_entries ONLY if payment is already confirmed or free AND appointment is for TODAY
        val todayStr = java.time.LocalDate.now().toString()
        val isAppointmentToday = created.appointmentDate.trim().take(10) == todayStr

        if (created.paymentStatus != "pending") {
            if (isAppointmentToday) {
                try {
                    val existingQ = supabaseClient.postgrest["queue_entries"]
                        .select { filter { eq("appointment_id", created.id) } }
                        .decodeList<QueueEntry>()
                        .firstOrNull()
                    if (existingQ == null) {
                        val activeQueue = supabaseClient.postgrest["queue_entries"]
                            .select {
                                filter {
                                    eq("clinic_id", created.clinicId)
                                    or {
                                        eq("status", "waiting")
                                        eq("status", "inside")
                                    }
                                }
                            }
                            .decodeList<QueueEntry>()

                        val targetSlotMinutes = parseTimeToMinutes(created.appointmentTime)
                        val activeAppts = try {
                            supabaseClient.postgrest["appointments"]
                                .select {
                                    filter {
                                        eq("clinic_id", created.clinicId)
                                    }
                                }
                                .decodeList<Appointment>()
                        } catch (e: Exception) {
                            emptyList()
                        }
                        val apptMap = activeAppts.associateBy { it.id }

                        // Preceding entries: patient inside cabin OR patients in earlier or same time slot
                        val precedingEntries = activeQueue.filter { entry ->
                            if (entry.status == "inside") return@filter true
                            val appt = apptMap[entry.appointmentId]
                            val slotMins = parseTimeToMinutes(appt?.appointmentTime)
                            slotMins <= targetSlotMinutes
                        }

                        val insertPos = (precedingEntries.maxOfOrNull { it.queuePosition } ?: precedingEntries.size) + 1

                        // Shift all entries with queuePosition >= insertPos down by 1 in descending order
                        val laterEntries = activeQueue
                            .filter { it.queuePosition >= insertPos }
                            .sortedByDescending { it.queuePosition }

                        for (later in laterEntries) {
                            val shiftedPos = later.queuePosition + 1
                            try {
                                supabaseClient.postgrest["queue_entries"]
                                    .update({ set("queue_position", shiftedPos) }) {
                                        filter { eq("id", later.id) }
                                    }
                            } catch (shiftErr: Exception) {
                                shiftErr.printStackTrace()
                            }
                        }

                        val queueEntryDto = QueueEntryInsertDto(
                            id = UUID.randomUUID().toString(),
                            appointmentId = created.id,
                            clinicId = created.clinicId,
                            doctorId = created.doctorId,
                            queuePosition = insertPos,
                            status = "waiting"
                        )
                        supabaseClient.postgrest["queue_entries"].insert(queueEntryDto)
                        supabaseClient.postgrest["appointments"]
                            .update({ set("checkin_status", "checked_in") }) {
                                filter { eq("id", created.id) }
                            }

                        reindexActiveQueueChronologically(created.clinicId)
                    }
                } catch (e: Exception) {
                    e.printStackTrace()
                }
            } else {
                // Future or Tomorrow appointment: keep checkin_status as "checked_in" without polluting today's live queue_entries
                try {
                    supabaseClient.postgrest["appointments"]
                        .update({ set("checkin_status", "checked_in") }) {
                            filter { eq("id", created.id) }
                        }
                } catch (e: Exception) {
                    e.printStackTrace()
                }
            }
            created.copy(checkinStatus = "checked_in")
        } else {
            created
        }
    }

    suspend fun rescheduleAppointment(
        id: String,
        newDate: String,
        newTime: String,
        slotId: String? = null,
        newDoctorId: String? = null
    ): Boolean = withContext(Dispatchers.IO) {
        val existing = getAppointmentById(id)
        val oldSlotId = existing?.slotId
        val normalizedTime = normalizeTimeForPostgres(newTime)
        val cleanSlotId = slotId?.trim()?.takeIf { isValidUuid(it) }
        val cleanDocId = newDoctorId?.trim()?.takeIf { isValidUuid(it) } ?: existing?.doctorId?.takeIf { isValidUuid(it) }

        // 1. Authoritative SECURITY DEFINER RPC
        try {
            val rpcParams = buildJsonObject {
                put("p_appointment_id", id)
                put("p_new_date", newDate)
                put("p_new_time", normalizedTime)
                if (cleanSlotId != null) put("p_slot_id", cleanSlotId)
                if (cleanDocId != null) put("p_doctor_id", cleanDocId)
                val trackingCode = existing?.trackingCode10Digit?.takeIf { it.isNotBlank() }
                if (trackingCode != null) put("p_tracking_code", trackingCode)
            }
            val response = supabaseClient.postgrest.rpc("reschedule_patient_appointment", rpcParams)
            val json = response.decodeSingleOrNull<JsonObject>()
            val isSuccess = json?.get("success")?.jsonPrimitive?.contentOrNull?.toBooleanStrictOrNull()
                ?: (response.body<String>().contains("\"success\":true") || response.body<String>().contains("\"success\": true"))
            if (isSuccess) {
                return@withContext true
            }
        } catch (rpcErr: Exception) {
            rpcErr.printStackTrace()
        }

        // 2. Direct database update fallback (whitelisted fields, valid checkin_status)
        try {
            supabaseClient.postgrest["appointments"]
                .update({
                    set("appointment_date", newDate)
                    set("appointment_time", normalizedTime)
                    set("checkin_status", "not_checked_in")
                    set("status", "APPROVED")
                    set("updated_at", java.time.Instant.now().toString())
                    if (cleanSlotId != null) {
                        set("slot_id", cleanSlotId)
                    }
                    if (cleanDocId != null) {
                        set("doctor_id", cleanDocId)
                    }
                }) {
                    filter { eq("id", id) }
                }

            if (!oldSlotId.isNullOrBlank() && oldSlotId != cleanSlotId) {
                reconcileSlotBookedCount(oldSlotId)
            }
            if (!cleanSlotId.isNullOrBlank()) {
                reconcileSlotBookedCount(cleanSlotId)
            }

            val todayStr = java.time.LocalDate.now().toString()
            if (newDate != todayStr) {
                try {
                    supabaseClient.postgrest["queue_entries"].delete {
                        filter { eq("appointment_id", id) }
                    }
                } catch (ignored: Exception) {}
            } else {
                try {
                    val appt = supabaseClient.postgrest["appointments"]
                        .select { filter { eq("id", id) } }
                        .decodeSingleOrNull<Appointment>()
                    if (appt != null) {
                        val existingQ = supabaseClient.postgrest["queue_entries"]
                            .select { filter { eq("appointment_id", id) } }
                            .decodeSingleOrNull<com.dactor.patient.data.model.QueueEntry>()
                        val currentEntries = supabaseClient.postgrest["queue_entries"]
                            .select { filter { eq("clinic_id", appt.clinicId) } }
                            .decodeList<com.dactor.patient.data.model.QueueEntry>()
                        val nextPos = (currentEntries
                            .filter { it.status == "waiting" || it.status == "inside" }
                            .map { it.queuePosition }
                            .maxOrNull() ?: 0) + 1

                        val resolvedDoc = cleanDocId ?: appt.doctorId

                        if (existingQ != null) {
                            supabaseClient.postgrest["queue_entries"].update({
                                set("status", "waiting")
                                set("queue_position", nextPos)
                                set("called_at", null as String?)
                                set("inside_at", null as String?)
                                set("completed_at", null as String?)
                                if (!resolvedDoc.isNullOrBlank() && isValidUuid(resolvedDoc)) {
                                    set("doctor_id", resolvedDoc)
                                }
                            }) {
                                filter { eq("id", existingQ.id) }
                            }
                        } else {
                            val queueEntryDto = QueueEntryInsertDto(
                                id = UUID.randomUUID().toString(),
                                appointmentId = id,
                                clinicId = appt.clinicId,
                                doctorId = resolvedDoc?.takeIf { isValidUuid(it) },
                                queuePosition = nextPos,
                                status = "waiting"
                            )
                            supabaseClient.postgrest["queue_entries"].insert(queueEntryDto)
                        }
                    }
                } catch (ignored: Exception) {
                    ignored.printStackTrace()
                }
            }

            // Insert in-app notification
            try {
                val appt = existing ?: getAppointmentById(id)
                if (appt != null) {
                    val notifId = UUID.randomUUID().toString()
                    val notifPayload = mapOf(
                        "id" to notifId,
                        "user_id" to appt.userId?.takeIf { isValidUuid(it) },
                        "appointment_id" to appt.id,
                        "title" to "Appointment Rescheduled • $newDate",
                        "message" to "Your appointment has been shifted to $newDate at $normalizedTime.",
                        "type" to "queue_alert",
                        "target_audience" to "specific",
                        "is_read" to false,
                        "created_at" to java.time.Instant.now().toString()
                    )
                    try {
                        supabaseClient.postgrest["notifications"].insert(notifPayload)
                    } catch (_: Exception) {
                        val fallback = notifPayload.toMutableMap()
                        fallback["user_id"] = null
                        supabaseClient.postgrest["notifications"].insert(fallback)
                    }
                }
            } catch (_: Exception) {}

            true
        } catch (e: Exception) {
            e.printStackTrace()
            false
        }
    }

    suspend fun cancelAppointment(id: String): Boolean = withContext(Dispatchers.IO) {
        if (!isValidUuid(id)) return@withContext false
        try {
            // 1. Primary: Server-authoritative cancellation RPC (bypasses RLS issues for guest tracking codes)
            try {
                val rpcResult = supabaseClient.postgrest.rpc(
                    function = "cancel_patient_appointment",
                    parameters = buildJsonObject { put("p_appointment_id", id) }
                ).data?.trim()
                if (rpcResult == "true" || rpcResult == "{\"success\":true}") {
                    return@withContext true
                }
            } catch (_: Exception) {}

            // 2. Secondary RPC: cancel_pending_pay_at_desk_appointment
            try {
                val rpcResult = supabaseClient.postgrest.rpc(
                    function = "cancel_pending_pay_at_desk_appointment",
                    parameters = buildJsonObject { put("p_appointment_id", id) }
                ).data?.trim()
                if (rpcResult == "true" || rpcResult == "{\"success\":true}") {
                    return@withContext true
                }
            } catch (_: Exception) {}

            // 3. Fallback: Direct table update for authenticated patients
            supabaseClient.postgrest["appointments"]
                .update({
                    set("status", "CANCELLED")
                    set("checkin_status", "cancelled")
                }) {
                    filter { eq("id", id) }
                }
            try {
                supabaseClient.postgrest["queue_entries"].delete {
                    filter { eq("appointment_id", id) }
                }
            } catch (ignored: Exception) {}
            true
        } catch (e: Exception) {
            e.printStackTrace()
            false
        }
    }

    suspend fun claimAppointment(appointmentId: String, userId: String): Boolean = withContext(Dispatchers.IO) {
        try {
            supabaseClient.postgrest["appointments"]
                .update({
                    set("user_id", userId)
                }) {
                    filter { eq("id", appointmentId) }
                }
            true
        } catch (e: Exception) {
            e.printStackTrace()
            false
        }
    }

    suspend fun confirmPaymentAndJoinQueue(
        appointmentId: String,
        transactionId: String = "",
        paymentGateway: String = "esewa",
        paidAmount: Double? = null
    ): Boolean = withContext(Dispatchers.IO) {
        try {
            val appt = supabaseClient.postgrest["appointments"]
                .select { filter { eq("id", appointmentId) } }
                .decodeList<Appointment>()
                .firstOrNull()

            val effectiveAmount = paidAmount ?: appt?.feeAmount ?: 0.0

            supabaseClient.postgrest["appointments"]
                .update({
                    set("payment_status", "paid")
                    set("checkin_status", "checked_in")
                    set("fee_amount", effectiveAmount)
                }) {
                    filter { eq("id", appointmentId) }
                }

            if (appt != null) {
                // Ensure slot booked count is correct
                if (appt.slotId != null) {
                    try {
                        val apptsForSlot = supabaseClient.postgrest["appointments"]
                            .select { filter { eq("slot_id", appt.slotId) } }
                            .decodeList<Appointment>()
                        val realCount = apptsForSlot.count { it.checkinStatus != "cancelled" && it.paymentStatus != "failed" }
                        supabaseClient.postgrest["slots"].update({
                            set("booked_count", realCount)
                        }) {
                            filter { eq("id", appt.slotId) }
                        }
                    } catch (ignored: Exception) {}
                }

                // Place into queue_entries ONLY if appointment is for TODAY
                val todayStr = java.time.LocalDate.now().toString()
                val isAppointmentToday = appt.appointmentDate.trim().take(10) == todayStr
                if (isAppointmentToday) {
                    try {
                        val existingQ = supabaseClient.postgrest["queue_entries"]
                            .select { filter { eq("appointment_id", appointmentId) } }
                            .decodeList<com.dactor.patient.data.model.QueueEntry>()
                            .firstOrNull()
                        if (existingQ == null) {
                            val existingEntries = supabaseClient.postgrest["queue_entries"]
                                .select { filter { eq("clinic_id", appt.clinicId) } }
                                .decodeList<com.dactor.patient.data.model.QueueEntry>()
                            val nextPos = (existingEntries
                                .filter { it.status == "waiting" || it.status == "inside" }
                                .maxOfOrNull { it.queuePosition } ?: 0) + 1
                            val queueEntryDto = QueueEntryInsertDto(
                                id = java.util.UUID.randomUUID().toString(),
                                appointmentId = appt.id,
                                clinicId = appt.clinicId,
                                doctorId = appt.doctorId,
                                queuePosition = nextPos,
                                status = "waiting"
                            )
                            supabaseClient.postgrest["queue_entries"].insert(queueEntryDto)
                        }
                    } catch (qEx: Exception) {
                        qEx.printStackTrace()
                    }
                }

                // Record paid billing invoice in billing_invoices
                try {
                    val invId = java.util.UUID.randomUUID().toString()
                    val invoiceDto = BillingInvoiceInsertDto(
                        id = invId,
                        appointmentId = appointmentId,
                        clinicId = appt.clinicId,
                        totalAmount = effectiveAmount,
                        paidAmount = effectiveAmount,
                        balanceDue = 0.0,
                        paymentStatus = "paid",
                        paidAt = Instant.now().toString(),
                        remarks = "Paid NPR ${effectiveAmount.toInt()} via ${paymentGateway.uppercase()} (Txn: $transactionId)"
                    )
                    supabaseClient.postgrest["billing_invoices"].insert(invoiceDto)
                } catch (ignored: Exception) {}
            }
            true
        } catch (e: Exception) {
            e.printStackTrace()
            false
        }
    }

    suspend fun failOrCancelPaymentTransaction(
        appointmentId: String,
        reason: String = "Transaction cancelled by patient",
        transactionId: String? = null,
        paymentGateway: String? = null
    ): Boolean = withContext(Dispatchers.IO) {
        try {
            val appt = supabaseClient.postgrest["appointments"]
                .select { filter { eq("id", appointmentId) } }
                .decodeList<Appointment>()
                .firstOrNull()

            supabaseClient.postgrest["appointments"]
                .update({
                    set("payment_status", "pending")
                    set("checkin_status", "cancelled")
                }) {
                    filter { eq("id", appointmentId) }
                }

            // Remove from queue entries if any was inserted
            try {
                supabaseClient.postgrest["queue_entries"].delete {
                    filter { eq("appointment_id", appointmentId) }
                }
            } catch (ignored: Exception) {}

            // Decrement / fix slot booked count
            if (appt?.slotId != null) {
                try {
                    val apptsForSlot = supabaseClient.postgrest["appointments"]
                        .select { filter { eq("slot_id", appt.slotId) } }
                        .decodeList<Appointment>()
                    val realCount = apptsForSlot.count { it.checkinStatus != "cancelled" && it.paymentStatus != "failed" }
                    supabaseClient.postgrest["slots"].update({
                        set("booked_count", realCount)
                    }) {
                        filter { eq("id", appt.slotId) }
                    }
                } catch (ignored: Exception) {}
            }

            // Record failed invoice in billing_invoices
            if (appt != null) {
                try {
                    val invoiceId = java.util.UUID.randomUUID().toString()
                    val failDto = BillingInvoiceInsertDto(
                        id = invoiceId,
                        appointmentId = appointmentId,
                        clinicId = appt.clinicId,
                        totalAmount = appt.feeAmount,
                        paidAmount = 0.0,
                        balanceDue = appt.feeAmount,
                        paymentStatus = "pending",
                        remarks = "Transaction failed / cancelled: $reason"
                    )
                    supabaseClient.postgrest["billing_invoices"].insert(failDto)
                } catch (ignored: Exception) {}
            }

            true
        } catch (e: Exception) {
            e.printStackTrace()
            false
        }
    }

    suspend fun getAllPatientTransactions(
        userId: String? = null,
        email: String? = null,
        phone: String? = null,
        trackingCodes: List<String> = emptyList()
    ): List<com.dactor.patient.data.model.PatientTransactionRecord> = withContext(Dispatchers.IO) {
        try {
            val appts = getAllPatientAppointments(userId, email, phone, trackingCodes)
            if (appts.isEmpty()) return@withContext emptyList()

            val apptIds = appts.map { it.id }
            val invoices = getInvoicesForAppointments(apptIds)

            // Resolve clinic names cache
            val clinicIds = appts.map { it.clinicId }.distinct()
            val clinicNames = mutableMapOf<String, String>()
            for (cid in clinicIds) {
                try {
                    val clinicRows = supabaseClient.postgrest["clinics"]
                        .select { filter { eq("id", cid) } }
                        .decodeList<com.dactor.patient.data.model.Clinic>()
                    val cName = clinicRows.firstOrNull()?.name
                    if (!cName.isNullOrBlank()) clinicNames[cid] = cName
                } catch (ignored: Exception) {}
            }

            // Resolve doctor names cache
            val doctorIds = appts.mapNotNull { it.doctorId }.distinct()
            val doctorNames = mutableMapOf<String, String>()
            for (did in doctorIds) {
                try {
                    val docRows = supabaseClient.postgrest["doctors"]
                        .select { filter { eq("id", did) } }
                        .decodeList<com.dactor.patient.data.model.Doctor>()
                    val dName = docRows.firstOrNull()?.fullName
                    if (!dName.isNullOrBlank()) doctorNames[did] = dName
                } catch (ignored: Exception) {}
            }

            appts.map { appt ->
                val inv = invoices[appt.id]
                val amt = inv?.paidAmount?.takeIf { it > 0 }
                    ?: inv?.totalAmount?.takeIf { it > 0 }
                    ?: appt.feeAmount.takeIf { it > 0 }
                    ?: 0.0

                val status = when {
                    appt.paymentStatus == "failed" || inv?.paymentStatus == "failed" -> "failed"
                    appt.paymentStatus == "not_required" -> "free"
                    appt.paymentStatus == "paid" || inv?.paymentStatus == "paid" -> "paid"
                    else -> appt.paymentStatus
                }

                val method = when {
                    inv?.remarks?.contains("bypass", ignoreCase = true) == true -> "Bypass Test"
                    inv?.remarks?.contains("khalti", ignoreCase = true) == true -> "Khalti"
                    inv?.remarks?.contains("fonepay", ignoreCase = true) == true -> "Fonepay"
                    inv?.remarks?.contains("connectips", ignoreCase = true) == true -> "ConnectIPS"
                    inv?.remarks?.contains("esewa", ignoreCase = true) == true -> "eSewa"
                    appt.paymentMode.equals("PAY_AT_DESK", ignoreCase = true) || inv?.remarks?.contains("desk", ignoreCase = true) == true -> "Pay at Desk"
                    else -> "Online Payment"
                }

                val txnId = if (inv?.remarks != null && inv.remarks!!.contains("Txn:")) {
                    inv.remarks!!.substringAfter("Txn:").substringBefore(")").trim()
                } else {
                    "TXN-${appt.trackingCode10Digit}"
                }

                com.dactor.patient.data.model.PatientTransactionRecord(
                    id = inv?.id ?: appt.id,
                    appointmentId = appt.id,
                    trackingCode = appt.trackingCode10Digit,
                    clinicName = clinicNames[appt.clinicId] ?: "Medical Clinic",
                    doctorName = doctorNames[appt.doctorId] ?: "Consulting Specialist",
                    patientName = appt.patientName,
                    appointmentDate = appt.appointmentDate,
                    appointmentTime = appt.appointmentTime,
                    amount = amt,
                    paymentStatus = status,
                    paymentMethod = method,
                    transactionId = txnId,
                    createdAt = inv?.paidAt ?: appt.appointmentDate
                )
            }.sortedByDescending { it.appointmentDate }
        } catch (e: Exception) {
            e.printStackTrace()
            emptyList()
        }
    }

    /**
     * Safely fetches the billing invoice for an appointment even if multiple rows exist
     * (e.g. one from clinical remarks and one from clinic billing), merging remarks and bill items.
     */
    suspend fun getInvoiceForAppointment(appointmentId: String): BillingInvoice? = withContext(Dispatchers.IO) {
        if (appointmentId.isBlank()) return@withContext null
        try {
            val rows = supabaseClient.postgrest["billing_invoices"]
                .select {
                    filter {
                        eq("appointment_id", appointmentId)
                    }
                }.decodeList<BillingInvoice>()
            if (rows.isEmpty()) return@withContext null
            mergeInvoicesForSameAppointment(rows)
        } catch (e: Exception) {
            e.printStackTrace()
            null
        }
    }

    suspend fun getInvoicesForAppointments(appointmentIds: List<String>): Map<String, BillingInvoice> = withContext(Dispatchers.IO) {
        val cleanIds = appointmentIds.filter { it.isNotBlank() }.distinct()
        if (cleanIds.isEmpty()) return@withContext emptyMap()
        try {
            val rows = supabaseClient.postgrest["billing_invoices"]
                .select {
                    filter {
                        isIn("appointment_id", cleanIds)
                    }
                }.decodeList<BillingInvoice>()
            rows.groupBy { it.appointmentId }
                .mapNotNull { (apptId, list) ->
                    val merged = mergeInvoicesForSameAppointment(list)
                    if (merged != null) apptId to merged else null
                }
                .toMap()
        } catch (e: Exception) {
            e.printStackTrace()
            emptyMap()
        }
    }

    private fun mergeInvoicesForSameAppointment(rows: List<BillingInvoice>): BillingInvoice? {
        if (rows.isEmpty()) return null
        val sortedRows = rows.sortedWith(
            compareByDescending<BillingInvoice> { it.updatedAt ?: it.paidAt ?: it.createdAt ?: "" }
                .thenByDescending { it.items.isNotEmpty() }
                .thenByDescending { it.totalAmount }
        )
        val primary = sortedRows.first()
        val combinedRemarks = rows.mapNotNull { it.remarks?.trim()?.takeIf { r -> r.isNotBlank() } }
            .distinct()
            .joinToString("\n")
            .ifBlank { null }
        val bestItems = sortedRows.firstOrNull { it.items.isNotEmpty() }?.items ?: primary.items
        return primary.copy(
            items = bestItems,
            remarks = combinedRemarks ?: primary.remarks
        )
    }

    suspend fun getRemarksForAppointment(appointmentId: String): String? = withContext(Dispatchers.IO) {
        try {
            val invoice = getInvoiceForAppointment(appointmentId)
            invoice?.remarks?.ifBlank { null }
        } catch (e: Exception) {
            null
        }
    }

    /**
     * Updates or creates a billing invoice record with how much the patient paid and how much is left.
     */
    suspend fun saveOrUpdateInvoicePayment(
        appointment: Appointment,
        existingInvoice: BillingInvoice?,
        totalAmount: Double,
        paidAmount: Double,
        remarks: String? = null
    ): BillingInvoice? = withContext(Dispatchers.IO) {
        try {
            val safeTotal = totalAmount.coerceAtLeast(0.0)
            val safePaid = paidAmount.coerceAtLeast(0.0)
            val balanceLeft = (safeTotal - safePaid).coerceAtLeast(0.0)
            val dbStatus = if (balanceLeft <= 0.0 && safeTotal > 0.0) "paid" else "pending"
            val nowIso = Instant.now().toString()

            val current = existingInvoice ?: getInvoiceForAppointment(appointment.id)
            if (current != null) {
                val updatedItems = if (current.items.isNotEmpty()) {
                    current.items
                } else {
                    listOf(
                        InvoiceItem(
                            itemName = "Payment Received (${appointment.appointmentDate})",
                            quantity = 1,
                            price = safeTotal,
                            total = safeTotal
                        )
                    )
                }
                val updated = current.copy(
                    items = updatedItems,
                    totalAmount = safeTotal,
                    paidAmount = safePaid,
                    balanceDue = balanceLeft,
                    paymentStatus = dbStatus,
                    paidAt = nowIso,
                    updatedAt = nowIso,
                    remarks = remarks?.ifBlank { current.remarks } ?: current.remarks
                )
                supabaseClient.postgrest["billing_invoices"]
                    .update({
                        set("items", updatedItems)
                        set("total_amount", safeTotal)
                        set("paid_amount", safePaid)
                        set("balance_due", balanceLeft)
                        set("payment_status", dbStatus)
                        set("paid_at", nowIso)
                        set("updated_at", nowIso)
                        if (!remarks.isNullOrBlank()) {
                            set("remarks", remarks)
                        }
                    }) {
                        filter { eq("appointment_id", appointment.id) }
                    }
                // Sync appointments table fee_amount and payment_status
                try {
                    supabaseClient.postgrest["appointments"].update({
                        set("fee_amount", safeTotal)
                        set("payment_status", dbStatus)
                        set("updated_at", nowIso)
                    }) {
                        filter { eq("id", appointment.id) }
                    }
                } catch (ignored: Exception) {}
                updated
            } else {
                val newInvoice = BillingInvoice(
                    id = UUID.randomUUID().toString(),
                    appointmentId = appointment.id,
                    clinicId = appointment.clinicId,
                    items = listOf(
                        InvoiceItem(
                            itemName = "Payment Received (${appointment.appointmentDate})",
                            quantity = 1,
                            price = safeTotal,
                            total = safeTotal
                        )
                    ),
                    totalAmount = safeTotal,
                    paidAmount = safePaid,
                    balanceDue = balanceLeft,
                    paymentStatus = dbStatus,
                    paidAt = nowIso,
                    createdAt = nowIso,
                    updatedAt = nowIso,
                    remarks = remarks
                )
                try {
                    supabaseClient.postgrest["billing_invoices"].insert(newInvoice)
                } catch (insEx: Exception) {
                    supabaseClient.postgrest["billing_invoices"].update({
                        set("items", newInvoice.items)
                        set("total_amount", safeTotal)
                        set("paid_amount", safePaid)
                        set("balance_due", balanceLeft)
                        set("payment_status", dbStatus)
                        set("paid_at", nowIso)
                        set("updated_at", nowIso)
                        if (!remarks.isNullOrBlank()) {
                            set("remarks", remarks)
                        }
                    }) {
                        filter { eq("appointment_id", appointment.id) }
                    }
                }
                // Sync appointments table fee_amount and payment_status
                try {
                    supabaseClient.postgrest["appointments"].update({
                        set("fee_amount", safeTotal)
                        set("payment_status", dbStatus)
                        set("updated_at", nowIso)
                    }) {
                        filter { eq("id", appointment.id) }
                    }
                } catch (ignored: Exception) {}
                newInvoice
            }
        } catch (e: Exception) {
            e.printStackTrace()
            null
        }
    }

    /**
     * Used by single-visit duplicate guard: returns all non-cancelled appointments
     * for a given clinic + patient mobile combination.
     */
    suspend fun getAppointmentsByClinicAndMobile(clinicId: String, mobile: String): List<Appointment> = withContext(Dispatchers.IO) {
        try {
            supabaseClient.postgrest["appointments"]
                .select {
                    filter {
                        eq("clinic_id", clinicId)
                        eq("patient_mobile", mobile)
                    }
                }
                .decodeList<Appointment>()
                .filter { it.checkinStatus != "cancelled" }
        } catch (e: Exception) {
            e.printStackTrace()
            emptyList()
        }
    }

    suspend fun reindexActiveQueueChronologically(clinicId: String) = withContext(Dispatchers.IO) {
        try {
            val activeEntries = supabaseClient.postgrest["queue_entries"]
                .select {
                    filter {
                        eq("clinic_id", clinicId)
                        or {
                            eq("status", "waiting")
                            eq("status", "inside")
                        }
                    }
                }
                .decodeList<QueueEntry>()

            if (activeEntries.isEmpty()) return@withContext

            val apptIds = activeEntries.map { it.appointmentId }.filter { it.isNotBlank() }
            val appointments = try {
                supabaseClient.postgrest["appointments"]
                    .select {
                        filter {
                            isIn("id", apptIds)
                        }
                    }
                    .decodeList<Appointment>()
            } catch (e: Exception) {
                emptyList()
            }
            val apptMap = appointments.associateBy { it.id }

            // Chronological slot sort:
            // 1. Patient inside consultation cabin strictly maintains position #1
            // 2. Patients in earlier time slots (e.g. 2-3 PM) precede later time slots (3-4 PM).
            // 3. Within the same time slot, preserve relative queue position.
            val sortedEntries = activeEntries.sortedWith(
                compareBy<QueueEntry> { if (it.status == "inside") 0 else 1 }
                    .thenBy { entry ->
                        val appt = apptMap[entry.appointmentId]
                        parseTimeToMinutes(appt?.appointmentTime)
                    }.thenBy { it.queuePosition }
            )

            // Safe two-pass update to eliminate duplicate key collision
            for (entry in sortedEntries) {
                try {
                    supabaseClient.postgrest["queue_entries"]
                        .update({ set("queue_position", - (entry.queuePosition + 10000)) }) {
                            filter { eq("id", entry.id) }
                        }
                } catch (ignored: Exception) {}
            }

            sortedEntries.forEachIndexed { index, entry ->
                val newPos = index + 1
                try {
                    supabaseClient.postgrest["queue_entries"]
                        .update({ set("queue_position", newPos) }) {
                            filter { eq("id", entry.id) }
                        }
                } catch (ignored: Exception) {}
            }
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    companion object {
        fun isValidUuid(str: String?): Boolean {
            if (str.isNullOrBlank()) return false
            return try {
                UUID.fromString(str.trim())
                true
            } catch (_: Exception) {
                false
            }
        }

        fun normalizeTimeForPostgres(timeStr: String?): String {
            if (timeStr.isNullOrBlank()) return "09:30:00"
            return try {
                val clean = timeStr.trim()
                val firstPart = clean.split("-").first().trim()
                val isPm = firstPart.contains("PM", ignoreCase = true) || (!firstPart.contains("AM", ignoreCase = true) && clean.contains("PM", ignoreCase = true) && !clean.substringBefore("-").contains("AM", ignoreCase = true))
                val isAm = firstPart.contains("AM", ignoreCase = true)
                val match = Regex("(\\d{1,2})(?::(\\d{2}))?").find(firstPart)
                if (match != null) {
                    var h = match.groupValues[1].toIntOrNull() ?: 9
                    val m = match.groupValues[2].takeIf { it.isNotEmpty() }?.toIntOrNull() ?: 0
                    if (isPm && h < 12) h += 12
                    if (isAm && h == 12) h = 0
                    h = h.coerceIn(0, 23)
                    val safeM = m.coerceIn(0, 59)
                    String.format(java.util.Locale.US, "%02d:%02d:00", h, safeM)
                } else {
                    "09:30:00"
                }
            } catch (_: Exception) {
                "09:30:00"
            }
        }

        /**
         * Parses arbitrary slot or appointment strings (e.g. "2-3", "2:00 - 3:00",
         * "02:00 PM - 03:00 PM", "11:00 AM - 12:00 PM", "14:00 - 15:00") into minutes from midnight
         * to enable exact chronological comparison.
         */
        fun parseTimeToMinutes(timeStr: String?): Int {
            if (timeStr.isNullOrBlank()) return 12 * 60
            return try {
                val clean = timeStr.trim().uppercase()
                val parts = clean.split("-", "\u2013", "\u2014", "TO")
                val firstPart = parts.first().trim()
                val secondPart = if (parts.size > 1) parts[1].trim() else ""

                val match = Regex("(\\d{1,2})(?::(\\d{2}))?").find(firstPart)
                if (match != null) {
                    var h = match.groupValues[1].toIntOrNull() ?: 12
                    val m = match.groupValues[2].takeIf { it.isNotEmpty() }?.toIntOrNull() ?: 0

                    val firstHasAm = firstPart.contains("AM")
                    val firstHasPm = firstPart.contains("PM")
                    val secondHasAm = secondPart.contains("AM")
                    val secondHasPm = secondPart.contains("PM")

                    val isAm = when {
                        firstHasAm -> true
                        firstHasPm -> false
                        secondHasAm -> true
                        secondHasPm && h in 7..11 -> true
                        else -> false
                    }

                    val isPm = when {
                        firstHasPm -> true
                        firstHasAm -> false
                        secondHasPm && h in 1..6 -> true
                        secondHasPm && h == 12 -> true
                        else -> false
                    }

                    if (isPm && h < 12) h += 12
                    if (isAm && h == 12) h = 0
                    if (!isPm && !isAm && h in 1..6) h += 12

                    h * 60 + m
                } else {
                    12 * 60
                }
            } catch (e: Exception) {
                12 * 60
            }
        }
    }

    suspend fun updateAppointmentPayAtDesk(
        appointmentId: String,
        feeAmount: Double,
        serviceChargeAmount: Double = 0.0,
        totalAmount: Double = 0.0
    ): Boolean = withContext(Dispatchers.IO) {
        if (!isValidUuid(appointmentId)) return@withContext false

        // 1. Primary: Server-authoritative PostgreSQL RPC
        try {
            val rpcResult = supabaseClient.postgrest.rpc(
                function = "confirm_pay_at_desk_booking",
                parameters = buildJsonObject {
                    put("p_appointment_id", appointmentId)
                    if (feeAmount > 0.0) {
                        put("p_fee_amount", feeAmount)
                    }
                }
            )
            val raw = rpcResult.data
            if (!raw.isNullOrBlank()) {
                val parsed = lenientJson.parseToJsonElement(raw) as? JsonObject
                val success = parsed?.get("success")?.toString()?.toBooleanStrictOrNull()
                val error = parsed?.get("error")?.toString()?.trim('"')
                if (success == true || (error.isNullOrBlank() || error == "null")) {
                    return@withContext true
                }
            } else {
                return@withContext true
            }
        } catch (rpcEx: Exception) {
            rpcEx.printStackTrace()
        }

        // 2. Graceful Edge Function Fallback: appointment-payment (action = "confirm_pay_at_desk")
        try {
            val response = supabaseClient.functions.invoke("appointment-payment", body = buildJsonObject {
                put("action", "confirm_pay_at_desk")
                put("appointmentId", appointmentId)
                if (feeAmount > 0.0) {
                    put("feeAmount", feeAmount)
                }
            })
            val raw = response.body<String>()
            val parsed = lenientJson.parseToJsonElement(raw) as? JsonObject
            val error = parsed?.get("error")?.toString()?.trim('"')
            val success = parsed?.get("success")?.toString()?.toBooleanStrictOrNull()
            if (success == true || (error.isNullOrBlank() || error == "null")) {
                return@withContext true
            }
        } catch (fnEx: Exception) {
            fnEx.printStackTrace()
        }

        // 3. Fallback: Direct table update for staff/admin roles
        try {
            val effectiveServiceCharge = if (serviceChargeAmount > 0.0) serviceChargeAmount else Math.round(feeAmount * (PAY_AT_DESK_SERVICE_CHARGE_PERCENT / 100.0) * 100.0) / 100.0
            val effectiveTotal = if (totalAmount > 0.0) totalAmount else feeAmount + effectiveServiceCharge

            val nowIso = java.time.Instant.now().toString()
            supabaseClient.postgrest["appointments"].update({
                set("payment_mode", "PAY_AT_DESK")
                set("status", "APPROVED")
                set("checkin_status", "checked_in")
                set("payment_status", "pending")
                set("attempt_number", 1)
                set("fee_amount", feeAmount)
                set("service_charge_amount", effectiveServiceCharge)
                set("total_amount", effectiveTotal)
                set("approved_at", nowIso)
                set("expires_at", null as String?)
                set("updated_at", nowIso)
            }) {
                filter { eq("id", appointmentId) }
            }
            try {
                val appt = supabaseClient.postgrest["appointments"].select {
                    filter { eq("id", appointmentId) }
                }.decodeSingleOrNull<Appointment>()

                if (appt != null && appt.clinicId.isNotBlank()) {
                    val maxPos = try {
                        val existing = supabaseClient.postgrest["queue_entries"].select {
                            filter {
                                eq("clinic_id", appt.clinicId)
                                isIn("status", listOf("waiting", "inside"))
                            }
                        }.decodeList<QueueEntry>()
                        (existing.maxOfOrNull { it.queuePosition } ?: 0) + 1
                    } catch (_: Exception) { 1 }

                    @kotlinx.serialization.Serializable
                    data class FallbackQueueInsert(
                        val appointment_id: String,
                        val clinic_id: String,
                        val doctor_id: String? = null,
                        val queue_position: Int,
                        val status: String = "waiting",
                        val estimated_wait_minutes: Int = 0,
                        val created_at: String,
                        val updated_at: String
                    )

                    supabaseClient.postgrest["queue_entries"].upsert(
                        FallbackQueueInsert(
                            appointment_id = appointmentId,
                            clinic_id = appt.clinicId,
                            doctor_id = appt.doctorId,
                            queue_position = maxPos,
                            status = "waiting",
                            created_at = nowIso,
                            updated_at = nowIso
                        )
                    )
                }
            } catch (_: Exception) {}
            return@withContext true
        } catch (fallbackEx: Exception) {
            fallbackEx.printStackTrace()
        }

        false
    }

    suspend fun retryPayAtDeskAppointment(appointmentId: String, patientMobile: String? = null): Result<Appointment> = withContext(Dispatchers.IO) {
        try {
            val response = supabaseClient.postgrest.rpc(
                function = "retry_pay_at_desk_appointment",
                parameters = buildJsonObject {
                    put("p_appointment_id", appointmentId)
                    if (patientMobile != null) {
                        put("p_patient_mobile", patientMobile)
                    }
                }
            ).decodeSingle<Appointment>()
            Result.success(response)
        } catch (e: Exception) {
            e.printStackTrace()
            Result.failure(e)
        }
    }

    /**
     * Checks if there is an unapproved Pay at Desk appointment for this exact patient details.
     */
    suspend fun findPendingPayAtDeskAppointment(
        clinicId: String,
        patientMobile: String,
        appointmentDate: String,
        patientName: String
    ): Appointment? = withContext(Dispatchers.IO) {
        try {
            if (clinicId.isBlank() || patientMobile.isBlank() || appointmentDate.isBlank()) return@withContext null
            val list = supabaseClient.postgrest["appointments"]
                .select {
                    filter {
                        eq("clinic_id", clinicId)
                        eq("patient_mobile", patientMobile.trim())
                        eq("appointment_date", appointmentDate)
                        eq("payment_mode", "PAY_AT_DESK")
                        eq("status", "WAITING_FOR_APPROVAL")
                    }
                }
                .decodeList<Appointment>()

            list.firstOrNull {
                it.checkinStatus != "cancelled" &&
                !it.paymentStatus.equals("paid", ignoreCase = true) &&
                it.patientName.trim().equals(patientName.trim(), ignoreCase = true)
            }
        } catch (e: Exception) {
            e.printStackTrace()
            null
        }
    }

    /**
     * Atomically cancels an unapproved Pay-at-Desk appointment, freeing any held capacity.
     */
    suspend fun cancelPendingPayAtDeskAppointment(appointmentId: String): Boolean = withContext(Dispatchers.IO) {
        if (!isValidUuid(appointmentId)) return@withContext false
        try {
            // 1. Primary: Server-authoritative atomic RPC
            try {
                val rpcResult = supabaseClient.postgrest.rpc(
                    function = "cancel_pending_pay_at_desk_appointment",
                    parameters = buildJsonObject { put("p_appointment_id", appointmentId) }
                ).data?.trim()
                if (rpcResult == "true" || rpcResult == "{\"success\":true}" || rpcResult?.toBooleanStrictOrNull() == true) {
                    return@withContext true
                }
            } catch (_: Exception) {}

            // 2. Secondary RPC: cancel_patient_appointment
            try {
                val rpcResult = supabaseClient.postgrest.rpc(
                    function = "cancel_patient_appointment",
                    parameters = buildJsonObject { put("p_appointment_id", appointmentId) }
                ).data?.trim()
                if (rpcResult == "true" || rpcResult == "{\"success\":true}" || rpcResult?.toBooleanStrictOrNull() == true) {
                    return@withContext true
                }
            } catch (_: Exception) {}

            // 3. Client-level fallback: direct status update
            supabaseClient.postgrest["appointments"].update({
                set("status", "CANCELLED")
                set("checkin_status", "cancelled")
            }) {
                filter { eq("id", appointmentId) }
            }

            // Remove any queue entry
            try {
                supabaseClient.postgrest["queue_entries"].delete {
                    filter { eq("appointment_id", appointmentId) }
                }
            } catch (_: Exception) {}

            // Reconcile slot booked_count (only count approved appointments)
            val appt = getAppointmentById(appointmentId)
            if (!appt?.slotId.isNullOrBlank()) {
                try {
                    val apptsForSlot = supabaseClient.postgrest["appointments"]
                        .select { filter { eq("slot_id", appt.slotId) } }
                        .decodeList<Appointment>()
                    val realCount = apptsForSlot.count { 
                        it.checkinStatus != "cancelled" && (it.status == "APPROVED" || it.paymentStatus.equals("paid", ignoreCase = true))
                    }
                    supabaseClient.postgrest["slots"].update({
                        set("booked_count", realCount)
                    }) {
                        filter { eq("id", appt.slotId) }
                    }
                } catch (_: Exception) {}
            }
            true
        } catch (e: Exception) {
            e.printStackTrace()
            false
        }
    }
}
