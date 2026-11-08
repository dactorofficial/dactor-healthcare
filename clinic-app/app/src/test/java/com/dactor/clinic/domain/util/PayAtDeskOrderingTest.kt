package com.dactor.clinic.domain.util

import com.dactor.clinic.data.model.Appointment
import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * Unit tests verifying FIFO chronological ordering for Pay-at-Desk approval requests.
 *
 * Ensures:
 * 1. Oldest requests (earliest createdAt) appear at index 0 (top of the list).
 * 2. Scheduled slot times (appointmentDate + appointmentTime) do not invert the request arrival order.
 * 3. Ties or missing createdAt fall back gracefully and deterministically.
 */
class PayAtDeskOrderingTest {

    private fun sortPayAtDeskRequests(requests: List<Appointment>): List<Appointment> {
        return requests.sortedWith(
            compareBy<Appointment> { it.createdAt ?: "9999" }
                .thenBy { it.appointmentDate + " " + it.appointmentTime }
        )
    }

    @Test
    fun testPayAtDeskRequests_sortedOldestFirst() {
        // Patient C booked earliest (09:00 AM), but for an afternoon slot (14:00)
        val apptC = Appointment(
            id = "appt-C",
            trackingCode10Digit = "1000000003",
            patientName = "Patient C (Oldest Request)",
            appointmentDate = "2026-10-30",
            appointmentTime = "14:00",
            createdAt = "2026-10-28T09:00:00Z"
        )

        // Patient B booked next (09:30 AM), for an evening slot (17:00)
        val apptB = Appointment(
            id = "appt-B",
            trackingCode10Digit = "1000000002",
            patientName = "Patient B (Middle Request)",
            appointmentDate = "2026-10-30",
            appointmentTime = "17:00",
            createdAt = "2026-10-28T09:30:00Z"
        )

        // Patient A booked latest (10:00 AM), but for an early morning slot (08:00)
        val apptA = Appointment(
            id = "appt-A",
            trackingCode10Digit = "1000000001",
            patientName = "Patient A (Newest Request)",
            appointmentDate = "2026-10-30",
            appointmentTime = "08:00",
            createdAt = "2026-10-28T10:00:00Z"
        )

        val unsorted = listOf(apptA, apptB, apptC)
        val sorted = sortPayAtDeskRequests(unsorted)

        // Oldest request (apptC) must be at index 0
        assertEquals("Top item must be the oldest request (apptC)", "appt-C", sorted[0].id)
        assertEquals("Second item must be apptB", "appt-B", sorted[1].id)
        assertEquals("Last item must be newest request (apptA)", "appt-A", sorted[2].id)
    }

    @Test
    fun testPayAtDeskRequests_sameCreatedAt_tiesBrokenBySlotTime() {
        val appt1 = Appointment(
            id = "appt-1",
            trackingCode10Digit = "1000000011",
            patientName = "Patient 1",
            appointmentDate = "2026-10-30",
            appointmentTime = "11:00",
            createdAt = "2026-10-28T10:00:00Z"
        )

        val appt2 = Appointment(
            id = "appt-2",
            trackingCode10Digit = "1000000012",
            patientName = "Patient 2",
            appointmentDate = "2026-10-30",
            appointmentTime = "09:00",
            createdAt = "2026-10-28T10:00:00Z"
        )

        val sorted = sortPayAtDeskRequests(listOf(appt1, appt2))

        // Same createdAt -> broken by slot time (09:00 comes before 11:00)
        assertEquals("Tie broken by slot time: 09:00 slot first", "appt-2", sorted[0].id)
        assertEquals("Tie broken by slot time: 11:00 slot second", "appt-1", sorted[1].id)
    }

    @Test
    fun testPayAtDeskRequests_nullCreatedAt_placedAtEnd() {
        val apptWithCreated = Appointment(
            id = "appt-with-created",
            createdAt = "2026-10-28T10:00:00Z",
            appointmentDate = "2026-10-30",
            appointmentTime = "10:00"
        )
        val apptNullCreated = Appointment(
            id = "appt-null-created",
            createdAt = null,
            appointmentDate = "2026-10-30",
            appointmentTime = "08:00"
        )

        val sorted = sortPayAtDeskRequests(listOf(apptNullCreated, apptWithCreated))

        assertEquals("Valid createdAt should appear first", "appt-with-created", sorted[0].id)
        assertEquals("Null createdAt should be placed at end", "appt-null-created", sorted[1].id)
    }
}
