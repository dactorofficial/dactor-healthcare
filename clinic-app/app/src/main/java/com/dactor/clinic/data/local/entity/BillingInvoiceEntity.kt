package com.dactor.clinic.data.local.entity

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.PrimaryKey
import com.dactor.clinic.data.model.BillingInvoice
import com.dactor.clinic.data.model.InvoiceItem
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

@Entity(tableName = "billing_invoices")
data class BillingInvoiceEntity(
    @PrimaryKey
    @ColumnInfo(name = "id")
    val id: String,

    @ColumnInfo(name = "appointment_id")
    val appointmentId: String,

    @ColumnInfo(name = "clinic_id")
    val clinicId: String,

    @ColumnInfo(name = "bill_number")
    val billNumber: String = "",

    @ColumnInfo(name = "items_json")
    val itemsJson: String = "[]",

    @ColumnInfo(name = "total_amount")
    val totalAmount: Double = 0.0,

    @ColumnInfo(name = "paid_amount")
    val paidAmount: Double = 0.0,

    @ColumnInfo(name = "balance_due")
    val balanceDue: Double = 0.0,

    @ColumnInfo(name = "payment_status")
    val paymentStatus: String = "pending",

    @ColumnInfo(name = "paid_at")
    val paidAt: String? = null,

    @ColumnInfo(name = "remarks")
    val remarks: String? = null,

    @ColumnInfo(name = "created_at")
    val createdAt: String? = null,

    @ColumnInfo(name = "updated_at_str")
    val updatedAtStr: String? = null,

    // Offline sync metadata
    @ColumnInfo(name = "sync_status")
    val syncStatus: String = "synced", // "synced", "pending_insert", "pending_update"

    @ColumnInfo(name = "is_deleted")
    val isDeleted: Boolean = false,

    @ColumnInfo(name = "deleted_at")
    val deletedAt: Long? = null,

    @ColumnInfo(name = "updated_at")
    val updatedAt: Long = System.currentTimeMillis()
) {
    fun toDomainModel(json: Json = Json { ignoreUnknownKeys = true }): BillingInvoice {
        val itemsList: List<InvoiceItem> = try {
            json.decodeFromString(itemsJson)
        } catch (_: Exception) {
            emptyList()
        }
        return BillingInvoice(
            id = id,
            appointmentId = appointmentId,
            clinicId = clinicId,
            items = itemsList,
            totalAmount = totalAmount,
            paidAmount = paidAmount,
            balanceDue = balanceDue,
            paymentStatus = paymentStatus,
            paidAt = paidAt,
            remarks = remarks,
            createdAt = createdAt,
            updatedAt = updatedAtStr
        )
    }

    companion object {
        fun fromDomainModel(
            model: BillingInvoice,
            billNumber: String = "",
            syncStatus: String = "synced",
            isDeleted: Boolean = false,
            deletedAt: Long? = null,
            updatedAt: Long = System.currentTimeMillis(),
            json: Json = Json { ignoreUnknownKeys = true }
        ): BillingInvoiceEntity {
            val encodedItems = try {
                json.encodeToString(model.items)
            } catch (_: Exception) {
                "[]"
            }
            return BillingInvoiceEntity(
                id = model.id,
                appointmentId = model.appointmentId,
                clinicId = model.clinicId,
                billNumber = billNumber,
                itemsJson = encodedItems,
                totalAmount = model.totalAmount,
                paidAmount = model.paidAmount,
                balanceDue = model.balanceDue,
                paymentStatus = model.paymentStatus,
                paidAt = model.paidAt,
                remarks = model.remarks,
                createdAt = model.createdAt,
                updatedAtStr = model.updatedAt,
                syncStatus = syncStatus,
                isDeleted = isDeleted,
                deletedAt = deletedAt,
                updatedAt = updatedAt
            )
        }
    }
}
