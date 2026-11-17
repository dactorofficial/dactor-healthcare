package com.dactor.patient.data.repository

import com.dactor.patient.data.model.QueueEntry
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.OffsetDateTime
import java.time.ZoneOffset

class QueueTimingEstimateTest {

    private fun entry(id: String, pos: Int, status: String, insideMinutesAgo: Long? = null) = QueueEntry(
        id = id, appointmentId = "a$id", clinicId = "c", doctorId = "d", queuePosition = pos, status = status,
        insideAt = insideMinutesAgo?.let { OffsetDateTime.now(ZoneOffset.UTC).minusMinutes(it).toString().replace("Z", "+00:00") }
    )

    /** Minutes in texts like "~ 21 min" or "~ 1h 5m". */
    private fun minutesIn(text: String): Int {
        Regex("(\\d+)h\\s*(\\d+)m").find(text)?.let { return it.groupValues[1].toInt() * 60 + it.groupValues[2].toInt() }
        Regex("(\\d+)\\s*hr").find(text)?.let { return it.groupValues[1].toInt() * 60 }
        return Regex("(\\d+)").find(text)!!.groupValues[1].toInt()
    }

    private fun waitFor(insideMinutesAgo: Long, avg: Int): Int {
        val entries = listOf(
            entry("1", 1, "inside", insideMinutesAgo),
            entry("2", 2, "waiting"),
            entry("3", 3, "waiting"),
        )
        val est = QueueRepository.calculateLiveQueueTimingEstimate(
            clinic = null, isDoctorInClinic = true, allClinicQueueEntries = entries,
            targetEntry = entries[2], avgMinutesOverride = avg
        )
        return minutesIn(est.estimatedTimeLeftText)
    }

    @Test fun `on time - current patient's remaining time plus one more`() {
        // inside 4 min of a 10 min average: ~6 left + 1 waiting ahead x 10 = ~16
        assertTrue(waitFor(insideMinutesAgo = 4, avg = 10) in 15..17)
    }

    @Test fun `overrun - running long pushes the estimate later, never into the past`() {
        // inside 25 min with a 10 min average: treat as ending ~now (+1 min) then 1 x 10 = ~11
        // (previously this showed ~1 min)
        assertTrue(waitFor(insideMinutesAgo = 25, avg = 10) in 10..12)
    }

    @Test fun `uses the doctor's running average when given`() {
        // inside 2 min of a 20 min average: ~18 left + 1 x 20 = ~38
        assertTrue(waitFor(insideMinutesAgo = 2, avg = 20) in 37..39)
    }
}
