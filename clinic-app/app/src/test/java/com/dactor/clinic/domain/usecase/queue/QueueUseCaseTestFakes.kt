package com.dactor.clinic.domain.usecase.queue

import com.dactor.clinic.data.model.Appointment
import com.dactor.clinic.data.model.Clinic
import com.dactor.clinic.data.model.LabReport
import com.dactor.clinic.data.model.QueueEntry
import com.dactor.clinic.data.model.TransitionQueueEntryStatusResult
import com.dactor.clinic.data.repository.AppointmentRepository
import com.dactor.clinic.data.repository.ClinicRepository
import com.dactor.clinic.data.repository.LabReportRepository
import com.dactor.clinic.data.repository.QueueRepository
import com.dactor.clinic.domain.model.QueueConflictException
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.createSupabaseClient
import io.github.jan.supabase.postgrest.Postgrest
import io.github.jan.supabase.serializer.KotlinXSerializer
import kotlinx.serialization.json.Json

private val testSupabaseClient: SupabaseClient by lazy {
    createSupabaseClient(
        supabaseUrl = "https://ojfoofojcpabqegxmsab.supabase.co",
        supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9qZm9vZm9qY3BhYnFlZ3htc2FiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAzNTM1MTgsImV4cCI6MjEwNTkyOTUxOH0.pH1yOGykaaQTzlQxeCvcQ78HQwxhTSi4yA8JmvT-Y9Y"
    ) {
        defaultSerializer = KotlinXSerializer(
            Json {
                ignoreUnknownKeys = true
                isLenient = true
                coerceInputValues = true
            }
        )
        install(Postgrest)
    }
}

open class FakeQueueRepository(
    clinicRepo: ClinicRepository
) : QueueRepository(
    supabaseClient = testSupabaseClient,
    clinicRepository = clinicRepo
) {
    var shouldFailConflict: Boolean = false
    var conflictMessage: String = "This entry was just updated"
    var conflictCurrentStatus: String = "done"
    var shouldThrowOtherError: Boolean = false

    var lastTransitionEntryId: String? = null
    var lastExpectedStatus: String? = null
    var lastNewStatus: String? = null
    var lastActorType: String? = null
    var lastActorId: String? = null

    var notifyCallInsideCalls = mutableListOf<String>()
    var manualNotificationCalls = mutableListOf<String>()
    var reorderedEntriesList: List<QueueEntry>? = null
    var breakNotificationCalls = mutableListOf<Pair<String, String>>()
    var cacheCleared: Boolean = false

    override suspend fun transitionQueueEntryStatus(
        entryId: String,
        expectedStatus: String,
        newStatus: String,
        actorType: String,
        actorId: String
    ): TransitionQueueEntryStatusResult {
        lastTransitionEntryId = entryId
        lastExpectedStatus = expectedStatus
        lastNewStatus = newStatus
        lastActorType = actorType
        lastActorId = actorId

        if (shouldFailConflict) {
            throw QueueConflictException(
                message = conflictMessage,
                currentStatus = conflictCurrentStatus
            )
        }
        if (shouldThrowOtherError) {
            throw IllegalStateException("Simulated network failure")
        }

        return TransitionQueueEntryStatusResult(
            success = true,
            entryId = entryId,
            status = newStatus,
            updatedByActorType = actorType,
            updatedByActorId = actorId
        )
    }

    override suspend fun notifyCallInside(
        appointmentId: String,
        patientName: String,
        doctorName: String,
        trackingCode: String?,
        roomNumber: String?
    ): Boolean {
        notifyCallInsideCalls.add(appointmentId)
        return true
    }

    override suspend fun sendManualNotification(
        appointmentId: String,
        title: String,
        message: String,
        trackingCode: String?,
        estimatedTimeLeft: String?,
        expectedTime: String?,
        leftLabel: String,
        rightLabel: String,
        type: String
    ): Boolean {
        manualNotificationCalls.add(appointmentId)
        return true
    }

    override suspend fun reorderQueue(orderedEntries: List<QueueEntry>): Boolean {
        reorderedEntriesList = orderedEntries
        return true
    }

    override suspend fun sendClinicBreakNotificationsToActiveAppointments(
        clinicId: String,
        clinicName: String,
        breakWindowText: String?
    ): Int {
        breakNotificationCalls.add(Pair(clinicId, clinicName))
        return 3
    }

    override fun clearCache() {
        cacheCleared = true
    }
}

open class FakeAppointmentRepository : AppointmentRepository(
    supabaseClient = testSupabaseClient
) {
    val checkinStatusUpdates = mutableMapOf<String, String>()
    var walkinCreationResult: Appointment? = null
    var shouldFailWalkinCreation: Boolean = false

    override suspend fun updateCheckinStatus(id: String, status: String): Boolean {
        checkinStatusUpdates[id] = status
        return true
    }

    override suspend fun createWalkinAppointment(
        appointment: Appointment,
        allowOverbooking: Boolean
    ): Appointment? {
        if (shouldFailWalkinCreation) return null
        return walkinCreationResult ?: appointment.copy(
            id = if (appointment.id.isNotBlank()) appointment.id else java.util.UUID.randomUUID().toString(),
            isWalkin = true,
            checkinStatus = "checked_in"
        )
    }
}

open class FakeLabReportRepository : LabReportRepository(
    supabaseClient = testSupabaseClient
) {
    val upsertedLabReports = mutableListOf<String>()

    override suspend fun upsertLabReportForAppointment(
        appointmentId: String,
        clinicId: String,
        patientName: String,
        testName: String,
        stage: String,
        fileUrl: String?,
        fileName: String?
    ): LabReport? {
        upsertedLabReports.add(appointmentId)
        return LabReport(
            id = java.util.UUID.randomUUID().toString(),
            appointmentId = appointmentId,
            clinicId = clinicId,
            patientNameVerification = patientName,
            testName = testName,
            stage = stage
        )
    }
}

open class FakeClinicRepository : ClinicRepository(
    supabaseClient = testSupabaseClient
) {
    var breakStatusMap = mutableMapOf<String, Boolean>()
    var clinicToReturn: Clinic? = null

    override suspend fun toggleClinicBreak(clinicId: String, isOnBreak: Boolean): Clinic? {
        breakStatusMap[clinicId] = isOnBreak
        return clinicToReturn ?: Clinic(
            id = clinicId,
            name = "Test Medical Clinic",
            isOnBreak = isOnBreak
        )
    }
}
