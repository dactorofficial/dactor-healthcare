package com.dactor.patient.data.repository

import com.dactor.patient.data.model.Appointment
import com.dactor.patient.data.model.Clinic
import com.dactor.patient.data.model.Doctor
import com.dactor.patient.data.model.Slot
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.LocalDate

class QueueTimingEngineTest {

    @Test
    fun testFirstPatientInSecondSlotHasCumulativePositionElevenAndTenAhead() {
        // Slot 1: 9:00 AM - 10:00 AM with 10 booked patients
        val slot1 = Slot(
            id = "slot-1",
            clinicId = "clinic-1",
            doctorId = "doc-1",
            slotDate = "2026-10-18",
            startTime = "09:00 AM",
            endTime = "10:00 AM",
            maxCapacity = 20,
            bookedCount = 10,
            isPublished = true
        )

        // Slot 2: 10:00 AM - 11:00 AM with our target patient as the 1st patient
        val slot2 = Slot(
            id = "slot-2",
            clinicId = "clinic-1",
            doctorId = "doc-1",
            slotDate = "2026-10-18",
            startTime = "10:00 AM",
            endTime = "11:00 AM",
            maxCapacity = 20,
            bookedCount = 1,
            isPublished = true
        )

        // 10 appointments in slot 1
        val priorAppointments = (1..10).map { i ->
            Appointment(
                id = "appt-slot1-$i",
                trackingCode10Digit = "111111111$i",
                slotId = "slot-1",
                clinicId = "clinic-1",
                doctorId = "doc-1",
                appointmentDate = "2026-10-18",
                appointmentTime = "09:00 AM",
                patientName = "Patient $i"
            )
        }

        // Target patient: 1st in slot 2
        val myAppointment = Appointment(
            id = "my-target-appt",
            trackingCode10Digit = "5888368144",
            slotId = "slot-2",
            clinicId = "clinic-1",
            doctorId = "doc-1",
            appointmentDate = "2026-10-18",
            appointmentTime = "10:00 AM",
            patientName = "Nishan"
        )

        val allAppointments = priorAppointments + listOf(myAppointment)
        val allSlots = listOf(slot1, slot2)

        val result = QueueRepository.computeMultiSlotDailyPosition(
            targetAppointmentId = myAppointment.id,
            targetSlotId = myAppointment.slotId,
            targetAppointmentTime = myAppointment.appointmentTime,
            appointmentDate = "2026-10-18",
            allSlotsForDate = allSlots,
            allAppointmentsForDate = allAppointments,
            doctorId = "doc-1",
            avgConsultationMinutes = 10,
            nowDate = LocalDate.parse("2026-10-17") // Tomorrow is 2026-10-18
        )

        // Verify multi-slot cumulative line position
        assertEquals(11, result.cumulativePosition)
        assertEquals(10, result.patientsAheadInDay)
        assertEquals(1, result.positionInSlot)
        assertEquals("10:00 AM", result.slotStartTimeText)
        assertEquals("10:00 AM (±15 min)", result.approxAppointmentTimeText)
        assertEquals("9:45 AM – 10:15 AM", result.timeWindowText)
        assertTrue(result.isTomorrow)
        assertEquals("Tomorrow", result.dateLabel)
    }

    @Test
    fun testSecondPatientInSecondSlotStaggeredByAverageConsultationTime() {
        val slot1 = Slot(
            id = "slot-1",
            clinicId = "clinic-1",
            doctorId = "doc-1",
            slotDate = "2026-10-18",
            startTime = "09:00 AM",
            endTime = "10:00 AM",
            isPublished = true
        )
        val slot2 = Slot(
            id = "slot-2",
            clinicId = "clinic-1",
            doctorId = "doc-1",
            slotDate = "2026-10-18",
            startTime = "10:00 AM",
            endTime = "11:00 AM",
            isPublished = true
        )

        val prior10 = (1..10).map { i ->
            Appointment(
                id = "appt-slot1-$i",
                slotId = "slot-1",
                clinicId = "clinic-1",
                doctorId = "doc-1",
                appointmentDate = "2026-10-18",
                appointmentTime = "09:00 AM"
            )
        }

        // First patient in slot 2
        val firstInSlot2 = Appointment(
            id = "appt-slot2-1",
            slotId = "slot-2",
            clinicId = "clinic-1",
            doctorId = "doc-1",
            appointmentDate = "2026-10-18",
            appointmentTime = "10:00 AM"
        )

        // Target patient: Second patient in slot 2
        val secondInSlot2 = Appointment(
            id = "appt-slot2-2",
            slotId = "slot-2",
            clinicId = "clinic-1",
            doctorId = "doc-1",
            appointmentDate = "2026-10-18",
            appointmentTime = "10:00 AM"
        )

        val allAppointments = prior10 + listOf(firstInSlot2, secondInSlot2)
        val allSlots = listOf(slot1, slot2)

        val result = QueueRepository.computeMultiSlotDailyPosition(
            targetAppointmentId = secondInSlot2.id,
            targetSlotId = secondInSlot2.slotId,
            targetAppointmentTime = secondInSlot2.appointmentTime,
            appointmentDate = "2026-10-18",
            allSlotsForDate = allSlots,
            allAppointmentsForDate = allAppointments,
            doctorId = "doc-1",
            avgConsultationMinutes = 10,
            nowDate = LocalDate.parse("2026-10-17")
        )

        assertEquals(12, result.cumulativePosition)
        assertEquals(11, result.patientsAheadInDay)
        assertEquals(2, result.positionInSlot)
        assertEquals("10:00 AM", result.slotStartTimeText)
        // Position 2: 10:00 AM + (2 - 1) * 10 mins = 10:10 AM
        assertEquals("10:10 AM (±15 min)", result.approxAppointmentTimeText)
        assertEquals("9:55 AM – 10:25 AM", result.timeWindowText)
    }

    @Test
    fun testFirstPatientInFirstSlotHasZeroPatientsAhead() {
        val slot1 = Slot(
            id = "slot-1",
            clinicId = "clinic-1",
            doctorId = "doc-1",
            slotDate = "2026-10-18",
            startTime = "09:00 AM",
            endTime = "10:00 AM",
            isPublished = true
        )

        val myAppointment = Appointment(
            id = "first-appt",
            slotId = "slot-1",
            clinicId = "clinic-1",
            doctorId = "doc-1",
            appointmentDate = "2026-10-18",
            appointmentTime = "09:00 AM"
        )

        val result = QueueRepository.computeMultiSlotDailyPosition(
            targetAppointmentId = myAppointment.id,
            targetSlotId = myAppointment.slotId,
            targetAppointmentTime = myAppointment.appointmentTime,
            appointmentDate = "2026-10-18",
            allSlotsForDate = listOf(slot1),
            allAppointmentsForDate = listOf(myAppointment),
            doctorId = "doc-1",
            avgConsultationMinutes = 10,
            nowDate = LocalDate.parse("2026-10-18") // Today is 2026-10-18
        )

        assertEquals(1, result.cumulativePosition)
        assertEquals(0, result.patientsAheadInDay)
        assertEquals(1, result.positionInSlot)
        assertEquals("9:00 AM", result.slotStartTimeText)
        assertEquals("9:00 AM (±15 min)", result.approxAppointmentTimeText)
        assertEquals("8:45 AM – 9:15 AM", result.timeWindowText)
        assertTrue(result.isToday)
        assertFalse(result.isTomorrow)
        assertFalse(result.isFutureDate)
        assertEquals("Today", result.dateLabel)
    }

    @Test
    fun testFutureDateBeyondTomorrow() {
        val slot = Slot(
            id = "slot-future",
            clinicId = "clinic-1",
            doctorId = "doc-1",
            slotDate = "2026-10-25",
            startTime = "09:00 AM",
            endTime = "10:00 AM",
            isPublished = true
        )

        val appt = Appointment(
            id = "appt-future",
            slotId = "slot-future",
            clinicId = "clinic-1",
            doctorId = "doc-1",
            appointmentDate = "2026-10-25",
            appointmentTime = "09:00 AM"
        )

        val result = QueueRepository.computeMultiSlotDailyPosition(
            targetAppointmentId = appt.id,
            targetSlotId = appt.slotId,
            targetAppointmentTime = appt.appointmentTime,
            appointmentDate = "2026-10-25",
            allSlotsForDate = listOf(slot),
            allAppointmentsForDate = listOf(appt),
            doctorId = "doc-1",
            avgConsultationMinutes = 10,
            nowDate = LocalDate.parse("2026-10-17")
        )

        assertTrue(result.isFutureDate)
        assertFalse(result.isTomorrow)
        assertFalse(result.isToday)
        assertEquals("25 Oct", result.dateLabel)
    }

    @Test
    fun testClinicPhotoUrlResolution() {
        val relativeClinic = Clinic(
            id = "c1",
            name = "Test Clinic",
            logoUrl = "clinic_logos/logo1.png",
            pictures = listOf("clinic_pictures/photo1.jpg")
        )
        assertEquals(
            "https://ojfoofojcpabqegxmsab.supabase.co/storage/v1/object/public/clinic_logos/logo1.png",
            relativeClinic.resolvedLogoUrl
        )
        assertEquals(
            "https://ojfoofojcpabqegxmsab.supabase.co/storage/v1/object/public/clinic_pictures/photo1.jpg",
            relativeClinic.resolvedCoverPictureUrl
        )

        val absoluteClinic = Clinic(
            id = "c2",
            name = "External Clinic",
            logoUrl = "https://external.com/logo.png"
        )
        assertEquals("https://external.com/logo.png", absoluteClinic.resolvedLogoUrl)
    }

    @Test
    fun testDoctorPhotoUrlResolution() {
        val relativeDoc = Doctor(
            id = "d1",
            fullName = "Dr. Test",
            profilePictureUrl = "doctor_photos/avatar.png"
        )
        assertEquals(
            "https://ojfoofojcpabqegxmsab.supabase.co/storage/v1/object/public/doctor_photos/avatar.png",
            relativeDoc.resolvedProfilePictureUrl
        )

        val bareDoc = Doctor(
            id = "d2",
            fullName = "Dr. Bare",
            profilePictureUrl = "avatar.png"
        )
        assertEquals(
            "https://ojfoofojcpabqegxmsab.supabase.co/storage/v1/object/public/doctor_photos/avatar.png",
            bareDoc.resolvedProfilePictureUrl
        )
    }

    @Test
    fun testLiveQueueTimingDuringBreak_FirstPatientAnchoredToBreakEnd() {
        val clinic = Clinic(
            id = "c1",
            name = "Sunrise Health Clinic",
            isOnBreak = true,
            avgConsultationTimeMinutes = 10
        )
        val q1 = com.dactor.patient.data.model.QueueEntry(
            id = "q-1",
            appointmentId = "appt-1",
            clinicId = "c1",
            queuePosition = 1,
            status = "waiting"
        )
        val q2 = com.dactor.patient.data.model.QueueEntry(
            id = "q-2",
            appointmentId = "appt-2",
            clinicId = "c1",
            queuePosition = 2,
            status = "waiting"
        )

        val estimate = QueueRepository.calculateLiveQueueTimingEstimate(
            clinic = clinic,
            isDoctorInClinic = true,
            allClinicQueueEntries = listOf(q1, q2),
            targetEntry = q1,
            fallbackPatientsAhead = 0,
            appointmentTime = "01:00 PM - 02:00 PM"
        )

        assertTrue(estimate.isClinicOnBreak)
        assertNotNull(estimate.expectedExactTimeText)
        assertNotNull(estimate.estimatedTimeLeftText)
        assertTrue(estimate.doctorStatusBanner?.contains("break", ignoreCase = true) == true)
        assertTrue(estimate.slotNoticeText.contains("#1 in queue", ignoreCase = true))
    }

    @Test
    fun testLiveQueueTimingDuringBreak_SecondPatientStaggeredByAvgMins() {
        val clinic = Clinic(
            id = "c1",
            name = "Sunrise Health Clinic",
            isOnBreak = true,
            avgConsultationTimeMinutes = 10
        )
        val q1 = com.dactor.patient.data.model.QueueEntry(
            id = "q-1",
            appointmentId = "appt-1",
            clinicId = "c1",
            queuePosition = 1,
            status = "waiting"
        )
        val q2 = com.dactor.patient.data.model.QueueEntry(
            id = "q-2",
            appointmentId = "appt-2",
            clinicId = "c1",
            queuePosition = 2,
            status = "waiting"
        )

        val estimateFirst = QueueRepository.calculateLiveQueueTimingEstimate(
            clinic = clinic,
            isDoctorInClinic = true,
            allClinicQueueEntries = listOf(q1, q2),
            targetEntry = q1,
            fallbackPatientsAhead = 0,
            appointmentTime = "01:00 PM - 02:00 PM"
        )

        val estimateSecond = QueueRepository.calculateLiveQueueTimingEstimate(
            clinic = clinic,
            isDoctorInClinic = true,
            allClinicQueueEntries = listOf(q1, q2),
            targetEntry = q2,
            fallbackPatientsAhead = 1,
            appointmentTime = "01:00 PM - 02:00 PM"
        )

        assertTrue(estimateFirst.isClinicOnBreak)
        assertTrue(estimateSecond.isClinicOnBreak)
        assertTrue(estimateSecond.slotNoticeText.contains("1 person ahead", ignoreCase = true))

        // Compare exact times: second patient must be after first patient by 10 minutes
        val timeFormat = java.time.format.DateTimeFormatter.ofPattern("h:mm a", java.util.Locale.US)
        val timeFirst = java.time.LocalTime.parse(estimateFirst.expectedExactTimeText, timeFormat)
        val timeSecond = java.time.LocalTime.parse(estimateSecond.expectedExactTimeText, timeFormat)
        val diffMins = java.time.Duration.between(timeFirst, timeSecond).toMinutes()
        assertEquals(10L, diffMins)
    }

    @Test
    fun testQueueIsolatedToSpecificDoctorAndSpecificDateOnly() {
        val targetDate = "2026-11-20"
        val anotherDate = "2026-11-21"

        val slotDocA = Slot(
            id = "slot-doc-a",
            clinicId = "clinic-1",
            doctorId = "doc-A",
            slotDate = targetDate,
            startTime = "09:00 AM",
            endTime = "10:00 AM",
            isPublished = true
        )
        val slotDocB = Slot(
            id = "slot-doc-b",
            clinicId = "clinic-1",
            doctorId = "doc-B",
            slotDate = targetDate,
            startTime = "09:00 AM",
            endTime = "10:00 AM",
            isPublished = true
        )

        // 5 appointments for Doctor B on targetDate
        val docBAppts = (1..5).map { i ->
            Appointment(
                id = "doc-b-appt-$i",
                slotId = "slot-doc-b",
                clinicId = "clinic-1",
                doctorId = "doc-B",
                appointmentDate = targetDate,
                appointmentTime = "09:00 AM"
            )
        }

        // 3 appointments for Doctor A on targetDate
        val docAAppts = (1..3).map { i ->
            Appointment(
                id = "doc-a-appt-$i",
                slotId = "slot-doc-a",
                clinicId = "clinic-1",
                doctorId = "doc-A",
                appointmentDate = targetDate,
                appointmentTime = "09:00 AM"
            )
        }

        // Appointments for Doctor A on another date
        val docAAnotherDateAppts = (1..4).map { i ->
            Appointment(
                id = "doc-a-other-date-$i",
                slotId = "slot-doc-a",
                clinicId = "clinic-1",
                doctorId = "doc-A",
                appointmentDate = anotherDate,
                appointmentTime = "09:00 AM"
            )
        }

        // Target patient is the 1st patient for Doctor A on targetDate
        val targetAppt = docAAppts[0]

        val allAppointments = docBAppts + docAAppts + docAAnotherDateAppts
        val allSlots = listOf(slotDocA, slotDocB)

        val result = QueueRepository.computeMultiSlotDailyPosition(
            targetAppointmentId = targetAppt.id,
            targetSlotId = targetAppt.slotId,
            targetAppointmentTime = targetAppt.appointmentTime,
            appointmentDate = targetDate,
            allSlotsForDate = allSlots,
            allAppointmentsForDate = allAppointments,
            doctorId = "doc-A",
            avgConsultationMinutes = 10,
            nowDate = LocalDate.parse("2026-11-20")
        )

        // Must ONLY consider Doctor A on targetDate: target is first, so 0 ahead!
        assertEquals(1, result.cumulativePosition)
        assertEquals(0, result.patientsAheadInDay)

        // 3rd patient for Doctor A should have exactly 2 ahead
        val targetAppt3 = docAAppts[2]
        val result3 = QueueRepository.computeMultiSlotDailyPosition(
            targetAppointmentId = targetAppt3.id,
            targetSlotId = targetAppt3.slotId,
            targetAppointmentTime = targetAppt3.appointmentTime,
            appointmentDate = targetDate,
            allSlotsForDate = allSlots,
            allAppointmentsForDate = allAppointments,
            doctorId = "doc-A",
            avgConsultationMinutes = 10,
            nowDate = LocalDate.parse("2026-11-20")
        )
        assertEquals(3, result3.cumulativePosition)
        assertEquals(2, result3.patientsAheadInDay)
    }

    @Test
    fun testDifferentDayAdvanceLabAppointmentCalculatesAdvancePosition() {
        val today = LocalDate.parse("2026-11-20")
        val futureDate = "2026-11-24"

        val labSlot = Slot(
            id = "slot-lab-1",
            clinicId = "clinic-lab-1",
            doctorId = null,
            slotDate = futureDate,
            startTime = "09:00 AM",
            endTime = "10:00 AM",
            isPublished = true
        )

        val appt1 = Appointment(
            id = "lab-appt-1",
            slotId = "slot-lab-1",
            clinicId = "clinic-lab-1",
            doctorId = null,
            appointmentDate = futureDate,
            appointmentTime = "09:00 AM"
        )

        val result = QueueRepository.computeMultiSlotDailyPosition(
            targetAppointmentId = appt1.id,
            targetSlotId = appt1.slotId,
            targetAppointmentTime = appt1.appointmentTime,
            appointmentDate = futureDate,
            allSlotsForDate = listOf(labSlot),
            allAppointmentsForDate = listOf(appt1),
            doctorId = null,
            avgConsultationMinutes = 5,
            nowDate = today
        )

        // Advance date must correctly identify as future date and position #1 in day
        assertTrue(result.isFutureDate)
        assertEquals("24 Nov", result.dateLabel)
        assertEquals(1, result.cumulativePosition)
        assertEquals(0, result.patientsAheadInDay)
    }
}
