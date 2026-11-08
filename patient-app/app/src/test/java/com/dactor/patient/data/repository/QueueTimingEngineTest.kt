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
}
