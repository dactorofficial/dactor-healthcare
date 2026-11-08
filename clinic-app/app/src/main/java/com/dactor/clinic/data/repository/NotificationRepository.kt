package com.dactor.clinic.data.repository

import com.dactor.clinic.data.model.DactorNotification
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.postgrest.postgrest
import io.github.jan.supabase.postgrest.query.Order
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class NotificationRepository @Inject constructor(
    private val supabaseClient: SupabaseClient
) {
    suspend fun getNotifications(userId: String? = null): List<DactorNotification> = withContext(Dispatchers.IO) {
        try {
            val list = supabaseClient.postgrest["notifications"]
                .select {
                    order("created_at", Order.DESCENDING)
                    limit(50)
                }
                .decodeList<DactorNotification>()

            list.filter { notif ->
                val audience = notif.targetAudience?.lowercase()
                val isBroadcastForStaff = audience == "all_clinics" || audience == "all_doctors" || audience == "all_users" || notif.type == "broadcast"
                val isUserSpecific = (userId != null && notif.userId == userId)
                isBroadcastForStaff || isUserSpecific
            }
        } catch (e: Exception) {
            e.printStackTrace()
            emptyList()
        }
    }

    suspend fun markAsRead(id: String): Boolean = withContext(Dispatchers.IO) {
        try {
            supabaseClient.postgrest["notifications"]
                .update({
                    set("is_read", true)
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
}
