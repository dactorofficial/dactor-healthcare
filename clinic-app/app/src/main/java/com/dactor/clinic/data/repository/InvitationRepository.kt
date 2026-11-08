package com.dactor.clinic.data.repository

import com.dactor.clinic.data.model.ClinicInvitation
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.postgrest.postgrest
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.util.UUID
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class InvitationRepository @Inject constructor(
    private val supabaseClient: SupabaseClient
) {
    suspend fun getInvitations(clinicId: String): List<ClinicInvitation> = withContext(Dispatchers.IO) {
        try {
            supabaseClient.postgrest["clinic_invitations"]
                .select {
                    filter {
                        eq("clinic_id", clinicId)
                    }
                }.decodeList<ClinicInvitation>()
        } catch (e: Exception) {
            e.printStackTrace()
            emptyList()
        }
    }

    suspend fun sendInvitation(clinicId: String, email: String, role: String = "doctor"): ClinicInvitation? = withContext(Dispatchers.IO) {
        try {
            val trimmedEmail = email.trim().lowercase()
            // Check if invitation already exists for this clinic and recipient
            val existing = supabaseClient.postgrest["clinic_invitations"]
                .select {
                    filter {
                        eq("clinic_id", clinicId)
                        eq("email", trimmedEmail)
                    }
                }.decodeSingleOrNull<ClinicInvitation>()

            if (existing != null) {
                // If previously rejected, re-activate as pending
                if (existing.status == "rejected") {
                    supabaseClient.postgrest["clinic_invitations"]
                        .update({
                            set("status", "pending")
                            set("role", role)
                        }) {
                            filter {
                                eq("id", existing.id)
                            }
                        }
                    return@withContext existing.copy(status = "pending", role = role)
                }
                return@withContext existing
            }

            val invitation = ClinicInvitation(
                id = UUID.randomUUID().toString(),
                clinicId = clinicId,
                email = trimmedEmail,
                role = role,
                status = "pending",
                createdAt = java.time.Instant.now().toString()
            )

            supabaseClient.postgrest["clinic_invitations"]
                .insert(invitation) {
                    select()
                }.decodeSingleOrNull<ClinicInvitation>() ?: invitation
        } catch (e: Exception) {
            e.printStackTrace()
            null
        }
    }

    suspend fun getInvitationsForDoctor(email: String): List<ClinicInvitation> = withContext(Dispatchers.IO) {
        try {
            supabaseClient.postgrest["clinic_invitations"]
                .select {
                    filter {
                        eq("email", email.trim().lowercase())
                    }
                }.decodeList<ClinicInvitation>()
        } catch (e: Exception) {
            e.printStackTrace()
            emptyList()
        }
    }

    suspend fun isDoctorEmailRegistered(email: String): Boolean = withContext(Dispatchers.IO) {
        try {
            val doc = supabaseClient.postgrest["doctors"]
                .select {
                    filter {
                        eq("email", email.trim().lowercase())
                    }
                }.decodeSingleOrNull<com.dactor.clinic.data.model.Doctor>()
            doc != null
        } catch (e: Exception) {
            e.printStackTrace()
            false
        }
    }

    suspend fun respondToInvitation(id: String, accept: Boolean): Boolean = withContext(Dispatchers.IO) {
        try {
            val newStatus = if (accept) "accepted" else "rejected"
            supabaseClient.postgrest["clinic_invitations"]
                .update({
                    set("status", newStatus)
                }) {
                    filter {
                        eq("id", id)
                    }
                }
            true
        } catch (e: Exception) {
            e.printStackTrace()
            false
        }
    }

    suspend fun acceptDoctorInvitation(invitationId: String, doctorId: String, clinicId: String): Boolean = withContext(Dispatchers.IO) {
        try {
            // 1. Update invitation status to accepted
            supabaseClient.postgrest["clinic_invitations"]
                .update({
                    set("status", "accepted")
                }) {
                    filter {
                        eq("id", invitationId)
                    }
                }
            // 2. If doctor does not have an active clinic set yet, set this clinic as their initial active clinic
            val doc = supabaseClient.postgrest["doctors"]
                .select { filter { eq("id", doctorId) } }
                .decodeSingleOrNull<com.dactor.clinic.data.model.Doctor>()
            if (doc?.clinicId.isNullOrBlank()) {
                supabaseClient.postgrest["doctors"]
                    .update({
                        set("clinic_id", clinicId)
                    }) {
                        filter {
                            eq("id", doctorId)
                        }
                    }
            }
            true
        } catch (e: Exception) {
            e.printStackTrace()
            false
        }
    }

    suspend fun cancelInvitation(id: String): Boolean = withContext(Dispatchers.IO) {
        try {
            supabaseClient.postgrest["clinic_invitations"]
                .delete {
                    filter {
                        eq("id", id)
                    }
                }
            true
        } catch (e: Exception) {
            e.printStackTrace()
            false
        }
    }

    suspend fun getLabTechnicianProfiles(): List<com.dactor.clinic.data.model.Profile> = withContext(Dispatchers.IO) {
        try {
            supabaseClient.postgrest["profiles"]
                .select {
                    filter {
                        eq("role", "lab_technician")
                    }
                }.decodeList<com.dactor.clinic.data.model.Profile>()
        } catch (e: Exception) {
            e.printStackTrace()
            emptyList()
        }
    }
}
