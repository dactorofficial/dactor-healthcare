package com.dactor.patient.data.model

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test

class NotificationTemplateTest {

    @Test
    fun testDoctorNotArrivedTemplateWithMeta() {
        val title = NotificationTemplate.DoctorNotArrived.buildTitle("Dr. Aarav Sharma")
        assertEquals("Dr. Aarav Sharma Has Not Arrived Yet", title)

        val msg = NotificationTemplate.DoctorNotArrived.buildMessage(
            patientName = "Rajesh",
            doctorName = "Dr. Aarav Sharma",
            expectedArrival = "10:30 AM",
            clinicName = "City Polyclinic",
            code = "DOC-882"
        )

        val parsed = NotificationTemplateData.fromNotification(title, msg, NotificationType.DOCTOR_NOT_ARRIVED.key)
        assertEquals("Dr. Aarav Sharma Has Not Arrived Yet", parsed.title)
        assertTrue(parsed.cleanMessage.contains("Dr. Aarav Sharma has not arrived yet at City Polyclinic"))
        assertEquals("Doctor Status", parsed.leftLabel)
        assertEquals("Not Arrived / Delayed", parsed.leftValue)
        assertEquals("Est. Arrival", parsed.rightLabel)
        assertEquals("10:30 AM", parsed.rightValue)
        assertEquals("DOC-882", parsed.trackingCode)
        assertTrue(parsed.isQueueReminder)
    }

    @Test
    fun testWaitForFewMinutesTemplateWithMeta() {
        val title = NotificationTemplate.WaitForFewMinutes.buildTitle("Emergency Case")
        assertEquals("Brief Pause (Emergency Case) • Please Wait", title)

        val msg = NotificationTemplate.WaitForFewMinutes.buildMessage(
            patientName = "Sita",
            waitMins = "10 mins",
            reason = "Emergency Case",
            code = "DOC-991"
        )

        val parsed = NotificationTemplateData.fromNotification(title, msg, NotificationType.WAIT_FEW_MINUTES.key)
        assertEquals("Brief Pause (Emergency Case) • Please Wait", parsed.title)
        assertTrue(parsed.cleanMessage.contains("please wait for a few minutes (Emergency Case)"))
        assertEquals("Queue Status", parsed.leftLabel)
        assertEquals("Brief Pause", parsed.leftValue)
        assertEquals("Estimated Wait", parsed.rightLabel)
        assertEquals("~ 10 mins", parsed.rightValue)
        assertEquals("DOC-991", parsed.trackingCode)
        assertTrue(parsed.isQueueReminder)
    }

    @Test
    fun testArriveSoonTemplateWithMeta() {
        val title = NotificationTemplate.ArriveSoon.buildTitle(3)
        assertEquals("Arrive Soon • Turn Approaching (#3)", title)

        val msg = NotificationTemplate.ArriveSoon.buildMessage(
            patientName = "Rohan",
            code = "DOC-554",
            queuePosition = 3,
            estTime = "~ 15 mins"
        )

        val parsed = NotificationTemplateData.fromNotification(title, msg, NotificationType.ARRIVE_SOON.key)
        assertEquals("Arrive Soon • Turn Approaching (#3)", parsed.title)
        assertTrue(parsed.cleanMessage.contains("Only 2 patients are ahead of you"))
        assertEquals("Turn Status", parsed.leftLabel)
        assertEquals("Arrive Soon", parsed.leftValue)
        assertEquals("Queue Position", parsed.rightLabel)
        assertEquals("Position #3", parsed.rightValue)
        assertEquals("DOC-554", parsed.trackingCode)
        assertTrue(parsed.isQueueReminder)
    }

    @Test
    fun testFallbackParsingWithoutMeta() {
        // Fallback for Doctor Not Arrived
        val rawDocNotArrived = "Dr. Sharma has not arrived yet at the clinic. Please be patient."
        val parsedDoc = NotificationTemplateData.fromNotification("Doctor Delayed", rawDocNotArrived, "doctor_not_arrived")
        assertEquals("Doctor Delayed", parsedDoc.title)
        assertEquals("Doctor Status", parsedDoc.leftLabel)
        assertEquals("Not Arrived / Delayed", parsedDoc.leftValue)
        assertTrue(parsedDoc.isQueueReminder)

        // Fallback for Wait Few Minutes
        val rawWait = "The doctor is attending an emergency. Please wait for few minutes (~ 10 mins)."
        val parsedWait = NotificationTemplateData.fromNotification("Please Wait", rawWait, "wait_few_minutes")
        assertEquals("Queue Status", parsedWait.leftLabel)
        assertEquals("Brief Pause", parsedWait.leftValue)
        assertEquals("Estimated Wait", parsedWait.rightLabel)
        assertTrue(parsedWait.isQueueReminder)

        // Fallback for Arrive Soon
        val rawArrive = "You are near the front of the line. Please arrive soon (~ 15 mins)."
        val parsedArrive = NotificationTemplateData.fromNotification("Arrive Soon", rawArrive, "arrive_soon")
        assertEquals("Turn Status", parsedArrive.leftLabel)
        assertEquals("Arrive Soon", parsedArrive.leftValue)
        assertTrue(parsedArrive.isQueueReminder)
    }

    @Test
    fun testNotificationTypeResolution() {
        assertEquals(NotificationType.DOCTOR_NOT_ARRIVED, NotificationType.from("doctor_not_arrived"))
        assertEquals(NotificationType.DOCTOR_DELAYED, NotificationType.from("doctor_delayed"))
        assertEquals(NotificationType.DOCTOR_DELAYED, NotificationType.from("doctor_delay"))
        assertEquals(NotificationType.DOCTOR_NOT_ARRIVED, NotificationType.from("no_doctor"))
        assertEquals(NotificationType.WAIT_FEW_MINUTES, NotificationType.from("wait_few_minutes"))
        assertEquals(NotificationType.WAIT_FEW_MINS, NotificationType.from("wait_few_mins"))
        assertEquals(NotificationType.WAIT_FEW_MINUTES, NotificationType.from("brief_pause"))
        assertEquals(NotificationType.ARRIVE_SOON, NotificationType.from("arrive_soon"))
        assertEquals(NotificationType.ARRIVE_SOON, NotificationType.from("turn_approaching"))
        assertEquals(NotificationType.DOCTOR_DELAYED, NotificationType.valueOf("DOCTOR_DELAYED"))
        assertEquals(NotificationType.WAIT_FEW_MINS, NotificationType.valueOf("WAIT_FEW_MINS"))
    }

    @Test
    fun testFormatSlotWindow() {
        assertEquals("10:20 - 10:40 AM", NotificationTemplateData.formatSlotWindow("10:30 AM", 10))
        assertEquals("10:20 - 10:40 AM", NotificationTemplateData.formatSlotWindow("10:30", 10))
        assertEquals("10:20 - 10:40 AM", NotificationTemplateData.formatSlotWindow("10:30:00", 10))
        assertEquals("11:45 AM - 12:05 PM", NotificationTemplateData.formatSlotWindow("11:55 AM", 10))
        assertEquals("10:20 - 10:40 AM", NotificationTemplateData.formatSlotWindow("10:20 - 10:40 AM", 10))
        assertEquals("Today", NotificationTemplateData.formatSlotWindow("Today", 10))
        assertEquals("", NotificationTemplateData.formatSlotWindow(null, 10))
    }

    @Test
    fun testAppointmentReminderSlotWindowFormatting() {
        val msg = NotificationTemplate.AppointmentReminder.buildMessage(
            patientName = "Rajesh",
            code = "DOC-882",
            slotTime = "10:30 AM",
            estWait = "~ 15 mins",
            avgMinutes = 10
        )
        val parsed = NotificationTemplateData.fromNotification("Appointment Reminder • #DOC-882", msg, "queue_alert")
        assertEquals("10:20 - 10:40 AM", parsed.rightValue)
        assertEquals("Appointment Window", parsed.rightLabel)
        assertTrue(parsed.cleanMessage.contains("10:20 - 10:40 AM"))
    }

    @Test
    fun testDoctorNotArrivedWithSlotWindow() {
        val msg = NotificationTemplate.DoctorNotArrived.buildMessage(
            patientName = "Rajesh",
            doctorName = "Dr. Aarav",
            expectedArrival = "10:45 AM",
            clinicName = "City Clinic",
            code = "DOC-100",
            slotTime = "10:30 AM",
            avgMinutes = 10
        )
        val parsed = NotificationTemplateData.fromNotification("Doctor Delayed", msg, "doctor_not_arrived")
        assertEquals("10:45 AM (Slot: 10:20 - 10:40 AM)", parsed.rightValue)
        assertEquals("Doctor Status", parsed.leftLabel)
        assertEquals("Not Arrived / Delayed", parsed.leftValue)
        assertEquals("DOCTOR DELAYED", parsed.statusBadge)
    }

    @Test
    fun testCalculateApproximateSlotWindow() {
        assertEquals("10:20 AM - 10:40 AM (±10m)", calculateApproximateSlotWindow("10:30 AM", 10))
        assertEquals("10:20 AM - 10:40 AM", calculateApproximateSlotWindow("10:30 AM", 10, includeTolerance = false))
        assertEquals("11:45 AM - 12:05 PM (±10m)", calculateApproximateSlotWindow("11:55 AM", 10))
        assertEquals("11:45 PM - 12:05 AM (±10m)", calculateApproximateSlotWindow("11:55 PM", 10))
        assertEquals("11:55 PM - 12:15 AM (±10m)", calculateApproximateSlotWindow("12:05 AM", 10))
        assertEquals("2:20 PM - 2:40 PM (±10m)", calculateApproximateSlotWindow("14:30", 10))
        assertEquals("10:20 AM - 10:40 AM (±10m)", calculateApproximateSlotWindow("10:20 AM - 10:40 AM", 10))
        assertEquals("10:20 AM - 10:40 AM (±10m)", calculateApproximateSlotWindow("10:20 AM - 10:40 AM (±10m)", 10))
        assertEquals("Afternoon", calculateApproximateSlotWindow("Afternoon", 10))
        assertEquals("", calculateApproximateSlotWindow(null, 10))
    }

    @Test
    fun testDoctorDelayedTemplate() {
        val title = NotificationTemplate.DoctorDelayed.buildTitle("Dr. Aarav Sharma")
        assertEquals("Dr. Aarav Sharma Has Not Arrived Yet • Delay Notice", title)

        val defaultTitle = NotificationTemplate.DoctorDelayed.buildTitle()
        assertEquals("Doctor Not Arrived Yet / Delay Notice", defaultTitle)

        val msg = NotificationTemplate.DoctorDelayed.buildMessage(
            patientName = "Rajesh",
            doctorName = "Dr. Aarav Sharma",
            expectedDelay = "~ 15-20 mins",
            clinicName = "City Clinic",
            code = "DOC-777",
            slotTime = "10:30 AM",
            avgMinutes = 10
        )

        val parsed = NotificationTemplateData.fromNotification(title, msg, NotificationType.DOCTOR_DELAYED.key)
        assertEquals(title, parsed.title)
        assertTrue(parsed.cleanMessage.contains("delayed by ~ 15-20 mins"))
        assertTrue(parsed.cleanMessage.contains("Slot: 10:20 AM - 10:40 AM (±10m)"))
        assertEquals("Doctor Status", parsed.leftLabel)
        assertEquals("Not Arrived / Delayed", parsed.leftValue)
        assertEquals("Est. Delay", parsed.rightLabel)
        assertEquals("~ 15-20 mins", parsed.rightValue)
        assertEquals("DOC-777", parsed.trackingCode)
        assertEquals("DOCTOR DELAYED", parsed.statusBadge)
        assertTrue(parsed.isQueueReminder)
    }

    @Test
    fun testWaitFewMinsTemplate() {
        val title = NotificationTemplate.WaitFewMins.buildTitle("brief procedure")
        assertEquals("Please Wait a Few Minutes (brief procedure)", title)

        val defaultTitle = NotificationTemplate.WaitFewMins.buildTitle()
        assertEquals("Please Wait a Few Minutes", defaultTitle)

        val msg = NotificationTemplate.WaitFewMins.buildMessage(
            patientName = "Sita",
            reason = "reviewing records / brief procedure",
            resumeWait = "5-10 mins",
            code = "DOC-991"
        )

        val parsed = NotificationTemplateData.fromNotification(title, msg, NotificationType.WAIT_FEW_MINS.key)
        assertEquals(title, parsed.title)
        assertTrue(parsed.cleanMessage.contains("reviewing records / brief procedure"))
        assertTrue(parsed.cleanMessage.contains("resume in ~ 5-10 mins"))
        assertEquals("Queue Status", parsed.leftLabel)
        assertEquals("Brief Pause", parsed.leftValue)
        assertEquals("Estimated Wait", parsed.rightLabel)
        assertEquals("~ 5-10 mins", parsed.rightValue)
        assertEquals("DOC-991", parsed.trackingCode)
        assertEquals("WAIT A FEW MINS", parsed.statusBadge)
        assertTrue(parsed.isQueueReminder)
    }

    @Test
    fun testArriveSoonPosition2() {
        val defaultTitle = NotificationTemplate.ArriveSoon.buildTitle()
        assertEquals("Arrive Soon! Turn Approaching", defaultTitle)

        val title = NotificationTemplate.ArriveSoon.buildTitle(2)
        assertEquals("Arrive Soon • Turn Approaching (#2)", title)

        val msg = NotificationTemplate.ArriveSoon.buildMessage(
            patientName = "Rohan",
            code = "DOC-554",
            queuePosition = 2,
            estTime = "~ 10-15 mins"
        )

        val parsed = NotificationTemplateData.fromNotification(title, msg, NotificationType.ARRIVE_SOON.key)
        assertEquals("Arrive Soon • Turn Approaching (#2)", parsed.title)
        assertTrue(parsed.cleanMessage.contains("Only 1 patient is ahead of you"))
        assertTrue(parsed.cleanMessage.contains("avoid missing your turn"))
        assertEquals("Turn Status", parsed.leftLabel)
        assertEquals("Arrive Soon", parsed.leftValue)
        assertEquals("Queue Position", parsed.rightLabel)
        assertEquals("Position #2", parsed.rightValue)
        assertEquals("DOC-554", parsed.trackingCode)
        assertEquals("ARRIVE SOON • #2", parsed.statusBadge)
        assertTrue(parsed.isQueueReminder)
    }
}
