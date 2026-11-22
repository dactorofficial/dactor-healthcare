package com.dactor.patient.service

import com.dactor.patient.data.model.Appointment
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.LocalDateTime

class AppointmentAlarmPlannerTest {

    private val today = "2026-11-16"
    private val at10am = LocalDateTime.of(2026, 11, 16, 10, 0)
    private val nowMs = 1_000_000_000L

    private fun appt(id: String, date: String, time: String, checkin: String = "checked_in") =
        Appointment(id = id, trackingCode10Digit = "12345678$id".takeLast(10), appointmentDate = date, appointmentTime = time, checkinStatus = checkin)

    private fun decide(
        now: LocalDateTime,
        vararg appts: Appointment,
        statuses: Map<String, String?> = emptyMap(),
        completedSeen: Map<String, Long> = emptyMap()
    ) = AppointmentAlarmPlanner.decide(now, nowMs, appts.toList(), statuses) { completedSeen[it] }

    @Test fun `no appointments schedules nothing`() {
        val d = decide(at10am)
        assertNull(d.loopDelayMs)
        assertNull(d.backgroundCheckHours)
        assertTrue(d.reminders.isEmpty())
    }

    @Test fun `tomorrow - loop starts 2h before slot, hourly check, two reminders`() {
        val d = decide(at10am, appt("1", "2026-11-17", "10:00:00"))
        assertEquals(22 * 3_600_000L, d.loopDelayMs) // tomorrow 08:00
        assertEquals(1L, d.backgroundCheckHours)
        assertEquals(LocalDateTime.of(2026, 11, 17, 7, 0), d.reminders["1:day"]?.first)
        assertEquals(LocalDateTime.of(2026, 11, 17, 9, 0), d.reminders["1:hour"]?.first)
    }

    @Test fun `inside the 2h window - 90 second loop`() {
        val d = decide(at10am, appt("1", today, "11:30:00"))
        assertEquals(90_000L, d.loopDelayMs)
        assertEquals(LocalDateTime.of(2026, 11, 16, 10, 30), d.reminders["1:hour"]?.first)
        assertNull(d.reminders["1:day"]) // 7 AM already passed
    }

    @Test fun `slot long passed but not completed - loop keeps running until midnight`() {
        val d = decide(LocalDateTime.of(2026, 11, 16, 23, 0), appt("1", today, "11:00:00"))
        assertEquals(90_000L, d.loopDelayMs)
    }

    @Test fun `unresolved after midnight - loop stops, 6 hour check for 2 days`() {
        val d = decide(at10am, appt("1", "2026-11-15", "11:00:00"))
        assertNull(d.loopDelayMs)
        assertEquals(6L, d.backgroundCheckHours)

        val old = decide(at10am, appt("1", "2026-11-13", "11:00:00"))
        assertNull(old.loopDelayMs)
        assertNull(old.backgroundCheckHours)
    }

    @Test fun `completed - keeps checking 5 minutes then stops`() {
        val first = decide(at10am, appt("1", today, "09:00:00"), statuses = mapOf("1" to "done"))
        assertEquals(5 * 60_000L, first.loopDelayMs)
        assertEquals(nowMs, first.completedSeenUpdates["1"])

        val later = decide(at10am, appt("1", today, "09:00:00"), statuses = mapOf("1" to "done"),
            completedSeen = mapOf("1" to nowMs - 6 * 60_000L))
        assertNull(later.loopDelayMs)
        assertNull(later.backgroundCheckHours)
    }

    @Test fun `cancelled appointment schedules nothing`() {
        val d = decide(at10am, appt("1", "2026-11-17", "10:00:00", checkin = "cancelled"))
        assertNull(d.loopDelayMs)
        assertNull(d.backgroundCheckHours)
        assertTrue(d.reminders.isEmpty())
    }

    @Test fun `lab report pending - 5 minute loop in daytime, paused at night, 6h after 3 days`() {
        val day = decide(at10am, appt("1", today, "08:00:00"), statuses = mapOf("1" to "processing"))
        assertEquals(5 * 60_000L, day.loopDelayMs)
        assertEquals(1L, day.backgroundCheckHours)

        val night = decide(LocalDateTime.of(2026, 11, 16, 21, 0), appt("1", today, "08:00:00"), statuses = mapOf("1" to "processing"))
        assertEquals(10 * 3_600_000L, night.loopDelayMs) // resumes 7 AM

        val stale = decide(at10am, appt("1", "2026-11-12", "08:00:00"), statuses = mapOf("1" to "sample_collected"))
        assertNull(stale.loopDelayMs)
        assertEquals(6L, stale.backgroundCheckHours)
    }

    @Test fun `report prepared counts as finished with 5 minute grace`() {
        val d = decide(at10am, appt("1", today, "08:00:00"), statuses = mapOf("1" to "report_prepared"))
        assertEquals(5 * 60_000L, d.loopDelayMs)
    }

    @Test fun `earliest need wins across appointments`() {
        val d = decide(at10am, appt("1", "2026-11-20", "10:00:00"), appt("2", today, "11:00:00"))
        assertEquals(90_000L, d.loopDelayMs)
        assertEquals(1L, d.backgroundCheckHours)
    }
}
