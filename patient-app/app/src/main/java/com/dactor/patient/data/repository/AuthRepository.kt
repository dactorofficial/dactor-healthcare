package com.dactor.patient.data.repository

import com.dactor.patient.data.model.Clinic
import com.dactor.patient.data.model.Doctor
import com.dactor.patient.data.model.Profile
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.gotrue.auth
import io.github.jan.supabase.gotrue.providers.builtin.Email
import io.github.jan.supabase.postgrest.postgrest
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.time.Instant
import java.time.temporal.ChronoUnit
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class AuthRepository @Inject constructor(
    private val supabaseClient: SupabaseClient
) {
    data class PortalAssociation(
        val portal: String, // "patient", "clinic", "doctor"
        val portalLabel: String, // "Patient Portal", "Clinic Portal", "Doctor / Specialist Portal"
        val entityName: String,
        val email: String
    )

    sealed class SignUpResult {
        data class NeedsEmailConfirmation(val email: String) : SignUpResult()
        data class AlreadyConfirmed(val userId: String) : SignUpResult()
        data class Failure(val exception: Throwable) : SignUpResult()
    }

    sealed class EmailConfirmationResult {
        data class Confirmed(val userId: String) : EmailConfirmationResult()
        object NotConfirmed : EmailConfirmationResult()
        data class Error(val message: String) : EmailConfirmationResult()
    }

    suspend fun signUp(
        email: String,
        password: String,
        redirectUrl: String = "dactor://auth/callback"
    ): SignUpResult = withContext(Dispatchers.IO) {
        val trimmedEmail = email.trim()
        val trimmedPassword = password.trim()
        try {
            supabaseClient.auth.signUpWith(Email, redirectUrl = redirectUrl) {
                this.email = trimmedEmail
                this.password = trimmedPassword
            }

            try {
                supabaseClient.auth.resendEmail(
                    type = io.github.jan.supabase.gotrue.OtpType.Email.SIGNUP,
                    email = trimmedEmail
                )
            } catch (ignored: Exception) {}

            SignUpResult.NeedsEmailConfirmation(trimmedEmail)
        } catch (e: Exception) {
            e.printStackTrace()
            val msg = e.message ?: ""
            if (msg.contains("already registered", ignoreCase = true) || msg.contains("User already exists", ignoreCase = true)) {
                try {
                    supabaseClient.auth.resendEmail(
                        type = io.github.jan.supabase.gotrue.OtpType.Email.SIGNUP,
                        email = trimmedEmail
                    )
                } catch (ignored: Exception) {}
                SignUpResult.NeedsEmailConfirmation(trimmedEmail)
            } else {
                SignUpResult.Failure(e)
            }
        }
    }

    suspend fun checkEmailConfirmed(email: String, password: String): EmailConfirmationResult = withContext(Dispatchers.IO) {
        try {
            val signInResult = signIn(email.trim(), password.trim())
            if (signInResult.isSuccess) {
                EmailConfirmationResult.Confirmed(signInResult.getOrNull() ?: "")
            } else {
                val ex = signInResult.exceptionOrNull()
                val msg = ex?.message ?: ""
                if (msg.contains("not confirmed", ignoreCase = true) ||
                    msg.contains("email_not_confirmed", ignoreCase = true) ||
                    msg.contains("confirmation", ignoreCase = true)) {
                    EmailConfirmationResult.NotConfirmed
                } else {
                    EmailConfirmationResult.Error(msg)
                }
            }
        } catch (e: Exception) {
            val msg = e.message ?: ""
            if (msg.contains("not confirmed", ignoreCase = true) ||
                msg.contains("email_not_confirmed", ignoreCase = true) ||
                msg.contains("confirmation", ignoreCase = true)) {
                EmailConfirmationResult.NotConfirmed
            } else {
                EmailConfirmationResult.Error(msg)
            }
        }
    }

    suspend fun resendConfirmationLink(email: String): Result<Boolean> = withContext(Dispatchers.IO) {
        try {
            supabaseClient.auth.resendEmail(
                type = io.github.jan.supabase.gotrue.OtpType.Email.SIGNUP,
                email = email.trim()
            )
            Result.success(true)
        } catch (e: Exception) {
            e.printStackTrace()
            Result.failure(e)
        }
    }

    suspend fun syncPatientProfile(
        userId: String,
        email: String,
        fullName: String,
        phone: String = "",
        gender: String? = null,
        age: Int? = null
    ): Result<Boolean> = withContext(Dispatchers.IO) {
        try {
            val trimmedEmail = email.trim().lowercase()
            val existing = try {
                supabaseClient.postgrest["profiles"].select {
                    filter {
                        ilike("email", trimmedEmail)
                    }
                }.decodeList<Profile>().firstOrNull()
            } catch (e: Exception) {
                supabaseClient.postgrest["profiles"].select {
                    filter {
                        eq("email", trimmedEmail)
                    }
                }.decodeList<Profile>().firstOrNull()
            }

            // Check if there are any pre-existing appointments saved with this email before sign-in
            val emailAppts = if (trimmedEmail.isNotBlank()) {
                try {
                    supabaseClient.postgrest["appointments"].select {
                        filter {
                            ilike("patient_email", trimmedEmail)
                        }
                    }.decodeList<com.dactor.patient.data.model.Appointment>()
                } catch (e: Exception) {
                    emptyList()
                }
            } else emptyList()

            val latestEmailAppt = emailAppts.maxByOrNull { it.appointmentDate }
            val effectiveName = fullName.trim().ifBlank {
                existing?.fullName?.trim().orEmpty().ifBlank { latestEmailAppt?.patientName?.trim().orEmpty() }
            }
            val effectivePhone = phone.trim().ifBlank {
                existing?.phone?.trim().orEmpty().ifBlank { latestEmailAppt?.patientMobile?.trim().orEmpty() }
            }
            val effectiveGender = gender?.trim()?.ifBlank { null }
                ?: existing?.gender?.ifBlank { null }
                ?: latestEmailAppt?.patientGender
            val effectiveAge = age?.takeIf { it > 0 }
                ?: existing?.age
                ?: latestEmailAppt?.patientAge

            val profileId = existing?.id
                ?: emailAppts.firstNotNullOfOrNull { it.userId?.takeIf { uid -> uid.isNotBlank() } }
                ?: userId.takeIf { it.isNotBlank() }
                ?: java.util.UUID.randomUUID().toString()

            if (existing != null) {
                val updateJson = kotlinx.serialization.json.buildJsonObject {
                    if (existing.role.isBlank()) put("role", kotlinx.serialization.json.JsonPrimitive("patient"))
                    put("email", kotlinx.serialization.json.JsonPrimitive(trimmedEmail))
                    if (effectiveName.isNotBlank()) put("full_name", kotlinx.serialization.json.JsonPrimitive(effectiveName))
                    if (effectivePhone.isNotBlank()) put("phone", kotlinx.serialization.json.JsonPrimitive(effectivePhone))
                    if (!effectiveGender.isNullOrBlank()) put("gender", kotlinx.serialization.json.JsonPrimitive(effectiveGender))
                    if (effectiveAge != null && effectiveAge > 0) put("age", kotlinx.serialization.json.JsonPrimitive(effectiveAge))
                }
                supabaseClient.postgrest["profiles"].update(updateJson) {
                    filter {
                        eq("id", existing.id)
                    }
                }
            } else {
                val insertJson = kotlinx.serialization.json.buildJsonObject {
                    put("id", kotlinx.serialization.json.JsonPrimitive(profileId))
                    put("email", kotlinx.serialization.json.JsonPrimitive(trimmedEmail))
                    put("full_name", kotlinx.serialization.json.JsonPrimitive(effectiveName))
                    put("role", kotlinx.serialization.json.JsonPrimitive("patient"))
                    put("phone", kotlinx.serialization.json.JsonPrimitive(effectivePhone))
                    if (!effectiveGender.isNullOrBlank()) put("gender", kotlinx.serialization.json.JsonPrimitive(effectiveGender))
                    if (effectiveAge != null && effectiveAge > 0) put("age", kotlinx.serialization.json.JsonPrimitive(effectiveAge))
                }
                try {
                    supabaseClient.postgrest["profiles"].insert(insertJson)
                } catch (e: Exception) {
                    val fallbackJson = kotlinx.serialization.json.buildJsonObject {
                        put("id", kotlinx.serialization.json.JsonPrimitive(profileId))
                        put("email", kotlinx.serialization.json.JsonPrimitive(trimmedEmail))
                        put("full_name", kotlinx.serialization.json.JsonPrimitive(effectiveName))
                        put("role", kotlinx.serialization.json.JsonPrimitive("patient"))
                        put("phone", kotlinx.serialization.json.JsonPrimitive(effectivePhone))
                    }
                    supabaseClient.postgrest["profiles"].insert(fallbackJson)
                }
            }

            // Retroactively sync any past or live walk-in/guest appointments matching email or phone
            try {
                if (effectivePhone.isNotBlank()) {
                    val phoneLinkJson = kotlinx.serialization.json.buildJsonObject {
                        put("user_id", kotlinx.serialization.json.JsonPrimitive(profileId))
                    }
                    supabaseClient.postgrest["appointments"].update(phoneLinkJson) {
                        filter {
                            eq("patient_mobile", effectivePhone)
                        }
                    }
                }
                if (trimmedEmail.isNotBlank()) {
                    val emailLinkJson = kotlinx.serialization.json.buildJsonObject {
                        put("user_id", kotlinx.serialization.json.JsonPrimitive(profileId))
                        put("patient_email", kotlinx.serialization.json.JsonPrimitive(trimmedEmail))
                    }
                    supabaseClient.postgrest["appointments"].update(emailLinkJson) {
                        filter {
                            ilike("patient_email", trimmedEmail)
                        }
                    }
                }
            } catch (re: Exception) {
                re.printStackTrace()
            }

            Result.success(true)
        } catch (e: Exception) {
            e.printStackTrace()
            // Always return success so patient navigation proceeds
            Result.success(true)
        }
    }

    suspend fun createPatientProfile(
        userId: String,
        email: String,
        fullName: String,
        phone: String,
        gender: String? = null,
        age: Int? = null
    ): Result<Boolean> = syncPatientProfile(userId, email, fullName, phone, gender, age)

    suspend fun handleAuthCallback(uri: android.net.Uri): Boolean = withContext(Dispatchers.IO) {
        try {
            val fragment = uri.fragment
            val code = uri.getQueryParameter("code")
            if (!code.isNullOrBlank()) {
                supabaseClient.auth.exchangeCodeForSession(code = code, saveSession = true)
                return@withContext true
            } else if (!fragment.isNullOrBlank()) {
                val params = fragment.split("&").associate {
                    val parts = it.split("=")
                    if (parts.size == 2) parts[0] to parts[1] else parts[0] to ""
                }
                val accessToken = params["access_token"]
                val refreshToken = params["refresh_token"]
                if (!accessToken.isNullOrBlank() && !refreshToken.isNullOrBlank()) {
                    supabaseClient.auth.importAuthToken(accessToken = accessToken, refreshToken = refreshToken, autoRefresh = true)
                    return@withContext true
                }
            }
            false
        } catch (e: Exception) {
            e.printStackTrace()
            false
        }
    }

    suspend fun signIn(email: String, password: String): Result<String> = withContext(Dispatchers.IO) {
        try {
            supabaseClient.auth.signInWith(Email) {
                this.email = email.trim()
                this.password = password.trim()
            }
            val userId = supabaseClient.auth.currentUserOrNull()?.id ?: ""
            Result.success(userId)
        } catch (e: Exception) {
            e.printStackTrace()
            Result.failure(e)
        }
    }

    suspend fun signOut() = withContext(Dispatchers.IO) {
        try {
            supabaseClient.auth.signOut()
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    fun getCurrentUser(): String? {
        val firebaseUid = try { com.google.firebase.auth.FirebaseAuth.getInstance().currentUser?.uid } catch (e: Exception) { null }
        if (!firebaseUid.isNullOrBlank()) return firebaseUid
        return supabaseClient.auth.currentUserOrNull()?.id
    }

    fun getCurrentUserEmail(): String? {
        val firebaseEmail = try { com.google.firebase.auth.FirebaseAuth.getInstance().currentUser?.email } catch (e: Exception) { null }
        if (!firebaseEmail.isNullOrBlank()) return firebaseEmail
        return supabaseClient.auth.currentUserOrNull()?.email
    }

    fun isLoggedIn(): Boolean {
        val firebaseUser = try { com.google.firebase.auth.FirebaseAuth.getInstance().currentUser } catch (e: Exception) { null }
        if (firebaseUser != null) return true
        return getCurrentUser() != null
    }

    suspend fun getCurrentProfile(): Profile? = withContext(Dispatchers.IO) {
        val email = getCurrentUserEmail() ?: return@withContext null
        getProfileByEmail(email)
    }

    suspend fun checkPortalAssociation(email: String): PortalAssociation? = withContext(Dispatchers.IO) {
        val cleanEmail = email.trim().lowercase()
        if (cleanEmail.isBlank()) return@withContext null

        // 1. Check if associated with a Clinic (clinics.contact_email)
        val existingClinic = try {
            supabaseClient.postgrest["clinics"]
                .select {
                    filter {
                        ilike("contact_email", cleanEmail)
                    }
                }.decodeList<Clinic>().firstOrNull()
        } catch (e: Exception) {
            try {
                supabaseClient.postgrest["clinics"]
                    .select {
                        filter {
                            eq("contact_email", cleanEmail)
                        }
                    }.decodeList<Clinic>().firstOrNull()
            } catch (e2: Exception) {
                null
            }
        }
        if (existingClinic != null) {
            return@withContext PortalAssociation(
                portal = "clinic",
                portalLabel = "Clinic Portal",
                entityName = existingClinic.name,
                email = cleanEmail
            )
        }

        // 2. Check if associated with a Doctor / Specialist (doctors.email)
        val existingDoctor = try {
            supabaseClient.postgrest["doctors"]
                .select {
                    filter {
                        ilike("email", cleanEmail)
                    }
                }.decodeList<Doctor>().firstOrNull()
        } catch (e: Exception) {
            try {
                supabaseClient.postgrest["doctors"]
                    .select {
                        filter {
                            eq("email", cleanEmail)
                        }
                    }.decodeList<Doctor>().firstOrNull()
            } catch (e2: Exception) {
                null
            }
        }
        if (existingDoctor != null) {
            return@withContext PortalAssociation(
                portal = "doctor",
                portalLabel = "Doctor / Specialist Portal",
                entityName = existingDoctor.fullName,
                email = cleanEmail
            )
        }

        // 3. Check profiles table for role association
        val existingProfile = getProfileByEmail(cleanEmail)
        if (existingProfile != null) {
            val role = existingProfile.role.trim().lowercase()
            when {
                role == "clinic_admin" || role == "clinic" -> {
                    return@withContext PortalAssociation(
                        portal = "clinic",
                        portalLabel = "Clinic Portal",
                        entityName = existingProfile.fullName.orEmpty(),
                        email = cleanEmail
                    )
                }
                role == "doctor" || role == "lab_technician" -> {
                    return@withContext PortalAssociation(
                        portal = "doctor",
                        portalLabel = "Doctor / Specialist Portal",
                        entityName = existingProfile.fullName.orEmpty(),
                        email = cleanEmail
                    )
                }
                role == "patient" && (!existingProfile.fullName.isNullOrBlank() || !existingProfile.phone.isNullOrBlank()) -> {
                    return@withContext PortalAssociation(
                        portal = "patient",
                        portalLabel = "Patient Portal",
                        entityName = existingProfile.fullName.orEmpty(),
                        email = cleanEmail
                    )
                }
            }
        }

        null
    }

    suspend fun getProfileByEmail(email: String): Profile? = withContext(Dispatchers.IO) {
        val cleanEmail = email.trim().lowercase()
        if (cleanEmail.isBlank()) return@withContext null
        try {
            supabaseClient.postgrest["profiles"]
                .select {
                    filter {
                        ilike("email", cleanEmail)
                    }
                }.decodeList<Profile>().firstOrNull()
        } catch (e: Exception) {
            try {
                supabaseClient.postgrest["profiles"]
                    .select {
                        filter {
                            eq("email", cleanEmail)
                        }
                    }.decodeList<Profile>().firstOrNull()
            } catch (e2: Exception) {
                e2.printStackTrace()
                null
            }
        }
    }

    suspend fun getProfileById(userId: String): Profile? = withContext(Dispatchers.IO) {
        try {
            supabaseClient.postgrest["profiles"]
                .select {
                    filter {
                        or {
                            eq("id", userId)
                            eq("auth_uid", userId)
                        }
                    }
                }.decodeSingleOrNull<Profile>()
        } catch (e: Exception) {
            e.printStackTrace()
            null
        }
    }

    suspend fun updatePatientProfileDetails(
        userId: String,
        fullName: String,
        phone: String,
        gender: String?,
        age: Int?
    ): Result<Boolean> = withContext(Dispatchers.IO) {
        try {
            val updateJson = kotlinx.serialization.json.buildJsonObject {
                put("full_name", kotlinx.serialization.json.JsonPrimitive(fullName.trim()))
                put("phone", kotlinx.serialization.json.JsonPrimitive(phone.trim()))
                put("updated_at", kotlinx.serialization.json.JsonPrimitive(Instant.now().toString()))
                if (!gender.isNullOrBlank()) put("gender", kotlinx.serialization.json.JsonPrimitive(gender))
                if (age != null && age > 0) put("age", kotlinx.serialization.json.JsonPrimitive(age))
            }

            supabaseClient.postgrest["profiles"].update(updateJson) {
                filter {
                    or {
                        eq("id", userId)
                        eq("auth_uid", userId)
                    }
                }
            }
            Result.success(true)
        } catch (e: Exception) {
            e.printStackTrace()
            Result.failure(e)
        }
    }

    suspend fun scheduleAccountDeletion(
        userId: String
    ): Result<String> = withContext(Dispatchers.IO) {
        try {
            val nowInstant = Instant.now()
            val scheduledInstant = nowInstant.plus(30, ChronoUnit.DAYS)
            val deletionScheduledAt = scheduledInstant.toString()
            val archivedAt = nowInstant.toString()

            val updateJson = kotlinx.serialization.json.buildJsonObject {
                put("is_archived", kotlinx.serialization.json.JsonPrimitive(true))
                put("archived_at", kotlinx.serialization.json.JsonPrimitive(archivedAt))
                put("deletion_scheduled_at", kotlinx.serialization.json.JsonPrimitive(deletionScheduledAt))
                put("updated_at", kotlinx.serialization.json.JsonPrimitive(archivedAt))
            }

            // CRITICAL: We DO NOT delete any appointments, clinic records, invoices, or lab reports in Supabase.
            // All historical appointments and clinic data remain securely preserved.
            supabaseClient.postgrest["profiles"].update(updateJson) {
                filter {
                    or {
                        eq("id", userId)
                        eq("auth_uid", userId)
                    }
                }
            }
            Result.success(deletionScheduledAt)
        } catch (e: Exception) {
            e.printStackTrace()
            Result.failure(e)
        }
    }

    suspend fun cancelAccountDeletion(
        userId: String
    ): Result<Boolean> = withContext(Dispatchers.IO) {
        try {
            supabaseClient.postgrest["profiles"].update({
                set("is_archived", false)
                set<String?>("archived_at", null)
                set<String?>("deletion_scheduled_at", null)
                set("updated_at", Instant.now().toString())
            }) {
                filter {
                    or {
                        eq("id", userId)
                        eq("auth_uid", userId)
                    }
                }
            }
            Result.success(true)
        } catch (e: Exception) {
            e.printStackTrace()
            Result.failure(e)
        }
    }
}
