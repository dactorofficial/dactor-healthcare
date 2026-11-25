package com.dactor.patient.util

import com.dactor.patient.data.model.Clinic
import com.dactor.patient.data.model.Doctor
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Searching a clinic by its name must return that clinic first and must not flood the
 * results with unrelated clinics (e.g. "center" used to trigger ENT via the substring "ent").
 */
class MedicalSearchEngineClinicNameSearchTest {

    private val kantipur = Clinic(id = "kantipur", name = "Kantipur Health Center", addressText = "Baneshwor, Kathmandu", type = "multi_visit", specialties = listOf("General Medicine"), description = "Community health center")
    private val patanDental = Clinic(id = "patan", name = "Patan Dental Clinic", addressText = "Pulchowk, Lalitpur", type = "single_visit", specialties = listOf("Dental"), description = "Family dental clinic")
    private val cityCare = Clinic(id = "citycare", name = "City Care Polyclinic", addressText = "New Road, Kathmandu", type = "multi_visit", specialties = listOf("Cardiology", "ENT", "Pediatrics"), description = "Leading polyclinic and medical center in Kathmandu")
    private val sunrise = Clinic(id = "sunrise", name = "Sunrise Polyclinic", addressText = "Lakeside, Pokhara", type = "multi_visit", specialties = listOf("General Medicine"), description = "")
    private val everest = Clinic(id = "everest", name = "Everest Diagnostic Lab", addressText = "Maharajgunj, Kathmandu", type = "diagnostic_lab", specialties = listOf("Pathology"), description = "Diagnostic center")
    private val heartCare = Clinic(id = "heartcare", name = "Heart Care Hospital", addressText = "Chabahil, Kathmandu", type = "multi_visit", specialties = listOf("Cardiology"), description = "")

    private val cityCareDoctors = listOf(
        Doctor(id = "d1", fullName = "Ramesh Shrestha", specialty = "Cardiologist", specialties = listOf("Cardiologist"), clinicId = "citycare", description = "Senior consultant at City Care Polyclinic medical center", education = "MBBS, MD"),
        Doctor(id = "d2", fullName = "Sita Sharma", specialty = "ENT", specialties = listOf("ENT"), clinicId = "citycare", description = "ENT surgeon at the clinic", education = "MBBS, MS"),
        Doctor(id = "d3", fullName = "Vincent Rai", specialty = "Pediatrician", specialties = listOf("Pediatrician"), clinicId = "citycare", description = "Child specialist, polyclinic OPD", education = "MBBS, MD")
    )
    private val kantipurDoctors = listOf(
        Doctor(id = "d4", fullName = "Hari Thapa", specialty = "General Physician", specialties = listOf("General Physician"), clinicId = "kantipur", education = "MBBS")
    )

    private val allClinics = listOf(kantipur, patanDental, cityCare, sunrise, everest, heartCare)

    private fun doctorsOf(clinic: Clinic): List<Doctor> = when (clinic.id) {
        "citycare" -> cityCareDoctors
        "kantipur" -> kantipurDoctors
        else -> emptyList()
    }

    /** Matching clinic ids for [query], best match first (same ordering as PatientMainScreen). */
    private fun rank(query: String): List<String> = allClinics
        .map { it to MedicalSearchEngine.matchClinic(it, doctorsOf(it), emptyList(), query) }
        .filter { it.second.isMatch }
        .sortedByDescending { it.second.score }
        .map { it.first.id }

    @Test
    fun fullClinicNameRanksThatClinicFirst() {
        assertEquals("kantipur", rank("Kantipur Health Center").first())
        assertEquals("sunrise", rank("Sunrise Polyclinic").first())
        assertEquals("patan", rank("Patan Dental Clinic").first())
        assertEquals("heartcare", rank("Heart Care Hospital").first())
        assertEquals("citycare", rank("City Care Polyclinic").first())
    }

    @Test
    fun partialClinicNameRanksThatClinicFirst() {
        assertEquals("kantipur", rank("kantipur").first())
        assertEquals("everest", rank("everest lab").first())
        assertEquals("sunrise", rank("sunrise poly").first())
    }

    @Test
    fun clinicNameDoesNotTriggerUnrelatedSpecialtiesViaSubstrings() {
        // "center" contains "ent", "dental" contains "ent", "heart" contains "ear": none of these mean ENT.
        assertEquals(listOf("kantipur"), rank("Kantipur Health Center"))
        assertFalse(rank("Patan Dental Clinic").contains("citycare"))
        assertFalse(MedicalSearchEngine.getSuggestedSpecialties("Kantipur Health Center").contains("ENT Specialist"))
        assertFalse(MedicalSearchEngine.getSuggestedSpecialties("Heart Care Hospital").contains("ENT Specialist"))
    }

    @Test
    fun genericFacilityWordsDoNotMatchEveryClinic() {
        assertEquals(listOf("sunrise"), rank("Sunrise Polyclinic"))
        assertEquals(listOf("patan"), rank("Patan Dental Clinic"))
        // A generic word on its own is still a valid search.
        assertTrue(rank("polyclinic").containsAll(listOf("sunrise", "citycare")))
    }

    @Test
    fun symptomAndSpecialtySearchStillWork() {
        assertEquals("citycare", rank("ent").first())
        assertTrue(rank("ear pain").contains("citycare"))
        assertTrue(rank("dentist").contains("patan"))
        assertTrue(rank("chest pain").containsAll(listOf("citycare", "heartcare")))
        assertTrue(rank("child").contains("citycare"))
        assertTrue(rank("blood test").contains("everest"))
    }

    @Test
    fun doctorSearchByClinicNameIgnoresGenericWords() {
        val ramesh = cityCareDoctors.first()
        assertFalse(
            "A doctor at City Care Polyclinic must not match a search for Sunrise Polyclinic",
            MedicalSearchEngine.matchDoctor(ramesh, listOf(cityCare), "Sunrise Polyclinic").isMatch
        )
        assertTrue(MedicalSearchEngine.matchDoctor(ramesh, listOf(cityCare), "City Care Polyclinic").isMatch)
    }
}
