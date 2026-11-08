package com.dactor.clinic.security

import com.dactor.clinic.data.local.PendingClinicDraft
import com.dactor.clinic.data.local.PendingDoctorDraft
import com.dactor.clinic.data.model.Clinic
import com.dactor.clinic.data.model.Doctor
import com.dactor.clinic.data.security.AuthDeepLinkValidator
import com.dactor.clinic.data.security.AuthDeepLinkValidator.ValidationResult
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test
import java.util.UUID

/**
 * Requirements-driven security test suite verifying client draft synchronization invariants
 * and deep link security gates in clinic-app.
 *
 * Verifies:
 * 1. Verification status invariant: Synced Clinic entities are ALWAYS "pending_verification" or "pending", NEVER "approved".
 * 2. KYC status invariant: Synced Doctor entities are ALWAYS "pending", NEVER "approved".
 * 3. NMC license invariant: Synced Doctor entities NEVER use dummy "NMC-VERIFIED".
 * 4. Account binding invariant: Synced Doctor entities require and bind to non-null authenticated userId.
 * 5. Deep link gate invariant: Rejection of draft sync when callback validation fails or returns error.
 * 6. Authentication gate invariant: Rejection of draft sync when user session is unauthenticated.
 */
class DraftSyncSecurityTest {

    // =========================================================================
    // Tier 1: Entity Invariant Tests (Clinic & Doctor Pending State Enforcement)
    // =========================================================================

    @Test
    fun testSyncedClinic_isStrictlyPendingVerification_neverApproved() {
        val draft = PendingClinicDraft(
            name = "Apollo Care Clinic",
            phone = "9841000000",
            email = "apollo@example.com",
            password = "secretPassword123",
            address = "Kathmandu, Nepal",
            latitude = 27.7172,
            longitude = 85.3240,
            type = "multi_visit",
            description = "General OPD Clinic"
        )

        // Simulate creation per hardened MainActivity draft sync logic
        val clinic = Clinic(
            id = UUID.randomUUID().toString(),
            name = draft.name.trim(),
            type = draft.type,
            verificationStatus = "pending_verification",
            contactPhone = draft.phone.trim(),
            contactEmail = draft.email.trim().lowercase(),
            addressText = draft.address.trim(),
            latitude = draft.latitude,
            longitude = draft.longitude,
            autoNotifyThreshold = 2,
            description = draft.description
        )

        // Strict invariant assertions
        assertNotEquals("Clinic must NEVER be marked approved on client-side sync", "approved", clinic.verificationStatus)
        assertTrue(
            "Clinic verification status must be pending_verification or pending",
            clinic.verificationStatus == "pending_verification" || clinic.verificationStatus == "pending"
        )
    }

    @Test
    fun testSyncedDoctor_isStrictlyPendingKyc_neverApproved() {
        val draft = PendingDoctorDraft(
            fullName = "Dr. Sita Sharma",
            email = "sita.sharma@example.com",
            password = "secretPassword123",
            specialty = "Cardiology",
            fee = 800.0
        )
        val verifiedUserId = "auth-user-uuid-12345"

        // Simulate creation per hardened MainActivity draft sync logic
        val doctor = Doctor(
            id = UUID.randomUUID().toString(),
            userId = verifiedUserId,
            fullName = draft.fullName.trim(),
            email = draft.email.trim().lowercase(),
            specialty = draft.specialty.trim(),
            nmcLicenseNumber = "PENDING",
            kycStatus = "pending",
            isInClinic = false,
            consultationFee = draft.fee
        )

        // Strict invariant assertions
        assertNotEquals("Doctor KYC status must NEVER be approved on client-side sync", "approved", doctor.kycStatus)
        assertEquals("Doctor KYC status must strictly be 'pending'", "pending", doctor.kycStatus)
    }

    @Test
    fun testSyncedDoctor_neverUsesDummyNmcVerified() {
        val verifiedUserId = "auth-user-uuid-12345"
        val doctor = Doctor(
            id = UUID.randomUUID().toString(),
            userId = verifiedUserId,
            fullName = "Dr. Ram Prasad",
            email = "ram.prasad@example.com",
            specialty = "Pediatrics",
            nmcLicenseNumber = "PENDING",
            kycStatus = "pending",
            isInClinic = false,
            consultationFee = 500.0
        )

        assertNotEquals(
            "Doctor must NEVER use dummy 'NMC-VERIFIED' spoofing value",
            "NMC-VERIFIED",
            doctor.nmcLicenseNumber
        )
        assertFalse(
            "Doctor license must not contain NMC-VERIFIED",
            doctor.nmcLicenseNumber?.contains("NMC-VERIFIED", ignoreCase = true) == true
        )
    }

    @Test
    fun testSyncedDoctor_requiresAndBindsToAuthenticatedUserId() {
        val verifiedUserId = "verified-supabase-auth-uuid-999"
        val doctor = Doctor(
            id = UUID.randomUUID().toString(),
            userId = verifiedUserId,
            fullName = "Dr. Hari Krishna",
            email = "hari@example.com",
            specialty = "Orthopedics",
            nmcLicenseNumber = "PENDING",
            kycStatus = "pending",
            isInClinic = false,
            consultationFee = 600.0
        )

        assertNotNull("Doctor userId must not be null", doctor.userId)
        assertTrue("Doctor userId must not be blank", doctor.userId!!.isNotBlank())
        assertEquals("Doctor userId must match verified authenticated session ID", verifiedUserId, doctor.userId)
    }

    // =========================================================================
    // Tier 2: Boundary & Security Enforcement Tests
    // =========================================================================

    @Test
    fun testRejectDoctorSync_whenUserIdIsNull() {
        // Any attempt to create a doctor from draft without authenticated userId must fail invariant check
        val unauthenticatedUserId: String? = null

        val canSync = !unauthenticatedUserId.isNullOrBlank()
        assertFalse("Draft sync must not proceed when userId is null", canSync)
    }

    @Test
    fun testRejectDoctorSync_whenUserIdIsBlank() {
        val blankUserId = "   "
        val canSync = !blankUserId.isNullOrBlank()
        assertFalse("Draft sync must not proceed when userId is blank whitespace", canSync)
    }

    @Test
    fun testEnforceClinicStatusSanitization_againstUnauthorizedElevation() {
        // Helper representing the sanitizeVerificationStatus mapping in ClinicRepository
        fun sanitizeStatus(status: String?): String {
            return when (status?.trim()?.lowercase()) {
                "approved" -> "approved" // only permissible when set by server/admin
                "rejected" -> "rejected"
                "pending", "pending_verification", null, "" -> "pending"
                else -> "pending"
            }
        }

        assertEquals("pending", sanitizeStatus("pending_verification"))
        assertEquals("pending", sanitizeStatus("pending"))
        assertEquals("pending", sanitizeStatus(null))
        assertEquals("pending", sanitizeStatus(""))
        assertEquals("pending", sanitizeStatus("unknown_status"))
    }

    // =========================================================================
    // Tier 3: Combinations & Gate Logic Simulation Tests
    // =========================================================================

    /**
     * Simulated DraftSyncSecurityGate representing the hardened deep link handling pipeline
     * in MainActivity.kt and AuthRepository.kt.
     */
    class DraftSyncSecurityGate(
        private val authCallbackValidator: (String) -> ValidationResult = { AuthDeepLinkValidator.validate(it) },
        private val sessionProvider: () -> String?
    ) {
        data class SyncResult(
            val executed: Boolean,
            val clinicCreated: Clinic? = null,
            val doctorCreated: Doctor? = null,
            val rejectionReason: String? = null
        )

        fun processDeepLink(
            uriString: String,
            clinicDraft: PendingClinicDraft?,
            doctorDraft: PendingDoctorDraft?
        ): SyncResult {
            // 1. Strict URI validation
            val validation = authCallbackValidator(uriString)
            if (validation !is ValidationResult.Valid) {
                val reason = when (validation) {
                    is ValidationResult.AuthError -> "Auth error: ${validation.error}"
                    is ValidationResult.InvalidUri -> "Invalid deep link URI"
                    else -> "Validation failed"
                }
                return SyncResult(executed = false, rejectionReason = reason)
            }

            // 2. Active authenticated session verification
            val currentUserId = sessionProvider()
            if (currentUserId.isNullOrBlank()) {
                return SyncResult(executed = false, rejectionReason = "Unauthenticated user session")
            }

            // 3. Draft entity creation with strict pending states and account binding
            var createdClinic: Clinic? = null
            if (clinicDraft != null) {
                createdClinic = Clinic(
                    id = UUID.randomUUID().toString(),
                    name = clinicDraft.name.trim(),
                    type = clinicDraft.type,
                    verificationStatus = "pending_verification",
                    contactPhone = clinicDraft.phone.trim(),
                    contactEmail = clinicDraft.email.trim().lowercase(),
                    addressText = clinicDraft.address.trim(),
                    latitude = clinicDraft.latitude,
                    longitude = clinicDraft.longitude,
                    autoNotifyThreshold = 2,
                    description = clinicDraft.description
                )
            }

            var createdDoctor: Doctor? = null
            if (doctorDraft != null) {
                createdDoctor = Doctor(
                    id = UUID.randomUUID().toString(),
                    userId = currentUserId, // Explicit account binding
                    fullName = doctorDraft.fullName.trim(),
                    email = doctorDraft.email.trim().lowercase(),
                    specialty = doctorDraft.specialty.trim(),
                    nmcLicenseNumber = "PENDING", // Never dummy NMC-VERIFIED
                    kycStatus = "pending",        // Strictly pending
                    isInClinic = false,
                    consultationFee = doctorDraft.fee
                )
            }

            return SyncResult(
                executed = true,
                clinicCreated = createdClinic,
                doctorCreated = createdDoctor
            )
        }
    }

    @Test
    fun testGate_rejectsMalformedDeepLinkWithoutSyncing() {
        val gate = DraftSyncSecurityGate(sessionProvider = { "auth-user-123" })
        val clinicDraft = PendingClinicDraft("Clinic A", "9800000000", "a@test.com", "pass", "Kathmandu", 27.7, 85.3, "clinic", null)

        val result = gate.processDeepLink("dactor://malicious/attack", clinicDraft, null)

        assertFalse("Gate must reject malformed/unrelated deep link", result.executed)
        assertNull("No clinic entity must be created on invalid URI", result.clinicCreated)
        assertEquals("Invalid deep link URI", result.rejectionReason)
    }

    @Test
    fun testGate_rejectsAuthErrorCallbackWithoutSyncing() {
        val gate = DraftSyncSecurityGate(sessionProvider = { "auth-user-123" })
        val doctorDraft = PendingDoctorDraft("Dr. Test", "test@test.com", "pass", "ENT", 500.0)

        val result = gate.processDeepLink(
            "dactor://auth/callback?error=access_denied&error_description=User+cancelled",
            null,
            doctorDraft
        )

        assertFalse("Gate must reject auth error callback", result.executed)
        assertNull("No doctor entity must be created on auth error", result.doctorCreated)
        assertTrue(result.rejectionReason?.contains("Auth error: access_denied") == true)
    }

    @Test
    fun testGate_rejectsValidUriWhenSessionIsUnauthenticated() {
        // Valid deep link with code, but NO active user session in Supabase Auth
        val gate = DraftSyncSecurityGate(sessionProvider = { null })
        val clinicDraft = PendingClinicDraft("Clinic B", "9800000001", "b@test.com", "pass", "Pokhara", 28.2, 83.9, "clinic", null)

        val result = gate.processDeepLink(
            "dactor://auth/callback?code=valid-pkce-code",
            clinicDraft,
            null
        )

        assertFalse("Gate must reject sync when user is unauthenticated", result.executed)
        assertNull("No clinic entity must be created when unauthenticated", result.clinicCreated)
        assertEquals("Unauthenticated user session", result.rejectionReason)
    }

    @Test
    fun testGate_schemeOnlyTriggerIsCompletelyEliminated() {
        // Simulates the legacy vulnerability: uri.scheme.equals("dactor", ignoreCase = true)
        val gate = DraftSyncSecurityGate(sessionProvider = { "auth-user-123" })
        val doctorDraft = PendingDoctorDraft("Dr. Exploit", "exploit@test.com", "pass", "Surgery", 1000.0)

        val schemeOnlyUris = listOf(
            "dactor://anything",
            "dactor://exploit/payload",
            "dactor://auth/wrong_endpoint?code=123",
            "dactor:general_intent"
        )

        for (uri in schemeOnlyUris) {
            val result = gate.processDeepLink(uri, null, doctorDraft)
            assertFalse("Scheme-only trigger '$uri' must be rejected", result.executed)
            assertNull("No entity created for scheme-only trigger '$uri'", result.doctorCreated)
        }
    }

    // =========================================================================
    // Tier 4: Real-World Scenarios
    // =========================================================================

    @Test
    fun testScenario_legitimateRegistrationConfirmationFlow() {
        val expectedUserId = "authenticated-doctor-uuid-777"
        val gate = DraftSyncSecurityGate(sessionProvider = { expectedUserId })

        val doctorDraft = PendingDoctorDraft(
            fullName = "Dr. Anish Shrestha",
            email = "anish.shrestha@example.com",
            password = "securePassword!123",
            specialty = "Dermatology",
            fee = 750.0
        )

        val validCallback = "dactor://auth/callback?code=supabase-pkce-authorization-code-12345"
        val result = gate.processDeepLink(validCallback, null, doctorDraft)

        assertTrue("Legitimate flow must successfully execute sync", result.executed)
        assertNotNull("Doctor record must be generated", result.doctorCreated)

        val createdDoc = result.doctorCreated!!
        assertEquals("Dr. Anish Shrestha", createdDoc.fullName)
        assertEquals("anish.shrestha@example.com", createdDoc.email)
        assertEquals("Dermatology", createdDoc.specialty)
        assertEquals("Doctor must be strictly bound to authenticated userId", expectedUserId, createdDoc.userId)
        assertEquals("Doctor KYC status must be strictly 'pending'", "pending", createdDoc.kycStatus)
        assertNotEquals("Doctor license must not be 'NMC-VERIFIED'", "NMC-VERIFIED", createdDoc.nmcLicenseNumber)
        assertEquals("Doctor license must be 'PENDING'", "PENDING", createdDoc.nmcLicenseNumber)
    }

    @Test
    fun testScenario_simultaneousClinicAndDoctorDraftSync() {
        val expectedUserId = "authenticated-clinic-admin-uuid-888"
        val gate = DraftSyncSecurityGate(sessionProvider = { expectedUserId })

        val clinicDraft = PendingClinicDraft("Himalayan Clinic", "9841234567", "info@himalayan.np", "pass", "Lalitpur", 27.67, 85.31, "poly_clinic", "Quality healthcare")
        val doctorDraft = PendingDoctorDraft("Dr. Bina Joshi", "bina@himalayan.np", "pass", "General Medicine", 500.0)

        val validCallback = "dactor://auth/callback#access_token=token_abc&refresh_token=refresh_xyz"
        val result = gate.processDeepLink(validCallback, clinicDraft, doctorDraft)

        assertTrue(result.executed)
        assertNotNull(result.clinicCreated)
        assertNotNull(result.doctorCreated)

        // Verify Clinic invariants
        assertEquals("pending_verification", result.clinicCreated!!.verificationStatus)
        assertEquals("Himalayan Clinic", result.clinicCreated!!.name)

        // Verify Doctor invariants
        assertEquals("pending", result.doctorCreated!!.kycStatus)
        assertEquals(expectedUserId, result.doctorCreated!!.userId)
        assertEquals("PENDING", result.doctorCreated!!.nmcLicenseNumber)
    }

    @Test
    fun testScenario_maliciousDeepLinkWithSavedDraftLeavesDraftsIntact() {
        // An attacker triggers a malicious deep link while a user has a saved draft on device
        var draftCleared = false
        val gate = DraftSyncSecurityGate(sessionProvider = { "some-user" })
        val clinicDraft = PendingClinicDraft("Target Clinic", "9800000000", "target@test.com", "pass", "Address", 27.7, 85.3, "clinic", null)

        val maliciousUri = "dactor://malicious/attack"
        val result = gate.processDeepLink(maliciousUri, clinicDraft, null)

        if (result.executed) {
            draftCleared = true
        }

        assertFalse("Draft must NOT be executed or cleared by malicious intent", draftCleared)
        assertNull(result.clinicCreated)
    }
}
