package com.dactor.patient.util

import com.dactor.patient.data.model.Clinic
import com.dactor.patient.data.model.ClinicService
import com.dactor.patient.data.model.Doctor
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test

class MedicalSearchEngineAffiliationTest {

    private val sampleClinic1 = Clinic(
        id = "clinic-1",
        name = "Norvic International Hospital",
        addressText = "Thapathali, Kathmandu",
        specialties = listOf("Cardiology", "Neurology", "General OPD")
    )

    private val sampleClinic2 = Clinic(
        id = "clinic-2",
        name = "Dactor Skin & Laser Care",
        addressText = "Pulchowk, Lalitpur",
        specialties = listOf("Dermatology", "Cosmetology")
    )

    private val sampleDoctor1 = Doctor(
        id = "doc-1",
        fullName = "Ramesh Shrestha",
        specialty = "Cardiologist",
        clinicId = "clinic-1"
    )

    private val sampleDoctor2 = Doctor(
        id = "doc-2",
        fullName = "Sita Sharma",
        specialty = "Dermatologist",
        clinicId = "clinic-2"
    )

    @Test
    fun testSearchClinicNameMatchesAffiliatedDoctorDirectly() {
        // Querying "Norvic" should match Dr. Ramesh Shrestha because he practices at Norvic
        val result = MedicalSearchEngine.matchDoctor(
            doctor = sampleDoctor1,
            clinics = listOf(sampleClinic1),
            query = "Norvic"
        )

        assertTrue("Doctor should be matched when searching their practicing clinic name", result.isMatch)
        assertTrue("Match score should be significant for affiliated clinic match", result.score >= 100)
        assertNotNull(result.matchHighlightReason)
        assertTrue(
            "Highlight reason should indicate practicing clinic",
            result.matchHighlightReason!!.contains("Practices at Norvic International Hospital")
        )
    }

    @Test
    fun testSearchDoctorNameMatchesAffiliatedClinicDirectly() {
        // Querying "Dr. Ramesh" or "Doctor Ramesh" should match Norvic International Hospital
        val result1 = MedicalSearchEngine.matchClinic(
            clinic = sampleClinic1,
            doctors = listOf(sampleDoctor1),
            services = emptyList(),
            query = "Dr. Ramesh"
        )

        assertTrue("Clinic should match when searching for its affiliated doctor with 'Dr.'", result1.isMatch)
        assertTrue("Affiliated doctor should be captured in matchedDoctors", result1.matchedDoctors.any { it.id == "doc-1" })
        assertNotNull(result1.matchHighlightReason)
        assertTrue(
            "Highlight should indicate affiliated doctor",
            result1.matchHighlightReason!!.contains("Dr. Ramesh Shrestha")
        )

        val result2 = MedicalSearchEngine.matchClinic(
            clinic = sampleClinic1,
            doctors = listOf(sampleDoctor1),
            services = emptyList(),
            query = "Doctor Ramesh"
        )
        assertTrue("Clinic should match when searching for doctor with 'Doctor' prefix", result2.isMatch)
    }

    @Test
    fun testSearchMultiWordClinicTokensMatchesDoctor() {
        // Querying "Dactor Care" should match Dr. Sita Sharma who practices at "Dactor Skin & Laser Care"
        val result = MedicalSearchEngine.matchDoctor(
            doctor = sampleDoctor2,
            clinics = listOf(sampleClinic2),
            query = "Dactor Care"
        )

        assertTrue("Doctor should match multi-word clinic token queries", result.isMatch)
        assertNotNull(result.matchHighlightReason)
        assertTrue(result.matchHighlightReason!!.contains("Practices at Dactor Skin & Laser Care"))
    }

    @Test
    fun testDoctorCorpusReindexesWhenClinicsSuppliedLater() {
        // Ensure OpenRouteSpatialEngine does not get stuck with empty clinic cache
        val bareCorpus = OpenRouteSpatialEngine.getDoctorCorpus(sampleDoctor1, emptyList())
        assertFalse(bareCorpus.clinicsJoinedLower.contains("norvic"))

        val enrichedCorpus = OpenRouteSpatialEngine.getDoctorCorpus(sampleDoctor1, listOf(sampleClinic1))
        assertTrue(
            "Enriched corpus should contain clinic name even if previously queried with empty clinics",
            enrichedCorpus.clinicsJoinedLower.contains("norvic")
        )
    }
}
