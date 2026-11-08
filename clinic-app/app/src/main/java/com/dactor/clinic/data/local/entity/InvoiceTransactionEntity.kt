package com.dactor.clinic.data.local.entity

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "invoice_transactions")
data class InvoiceTransactionEntity(
    @PrimaryKey
    @ColumnInfo(name = "id")
    val id: String,

    @ColumnInfo(name = "invoice_id")
    val invoiceId: String,

    @ColumnInfo(name = "clinic_id")
    val clinicId: String,

    @ColumnInfo(name = "type")
    val type: String, // "charge", "payment", "discount", "refund"

    @ColumnInfo(name = "amount")
    val amount: Double,

    @ColumnInfo(name = "payment_method")
    val paymentMethod: String = "cash", // "cash", "esewa", "card", "desk"

    @ColumnInfo(name = "reference_id")
    val referenceId: String? = null,

    @ColumnInfo(name = "note")
    val note: String? = null,

    @ColumnInfo(name = "recorded_by_terminal_id")
    val recordedByTerminalId: String = "",

    @ColumnInfo(name = "recorded_at")
    val recordedAt: Long = System.currentTimeMillis(),

    // Offline sync metadata
    @ColumnInfo(name = "sync_status")
    val syncStatus: String = "synced", // "synced", "pending_insert"

    @ColumnInfo(name = "is_deleted")
    val isDeleted: Boolean = false,

    @ColumnInfo(name = "deleted_at")
    val deletedAt: Long? = null
)
