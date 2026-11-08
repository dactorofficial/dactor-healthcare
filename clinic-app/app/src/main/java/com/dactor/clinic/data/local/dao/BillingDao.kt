package com.dactor.clinic.data.local.dao

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import com.dactor.clinic.data.local.entity.BillingInvoiceEntity
import com.dactor.clinic.data.local.entity.InvoiceTransactionEntity
import kotlinx.coroutines.flow.Flow

@Dao
interface BillingDao {

    @Query("SELECT * FROM billing_invoices WHERE clinic_id = :clinicId AND is_deleted = 0 ORDER BY created_at DESC")
    fun getInvoicesForClinic(clinicId: String): Flow<List<BillingInvoiceEntity>>

    @Query("SELECT * FROM billing_invoices WHERE clinic_id = :clinicId AND is_deleted = 0 ORDER BY created_at DESC")
    suspend fun getInvoicesForClinicList(clinicId: String): List<BillingInvoiceEntity>

    @Query("SELECT * FROM billing_invoices WHERE id = :id AND is_deleted = 0 LIMIT 1")
    suspend fun getInvoiceById(id: String): BillingInvoiceEntity?

    @Query("SELECT * FROM billing_invoices WHERE appointment_id = :appointmentId AND is_deleted = 0 LIMIT 1")
    suspend fun getInvoiceByAppointmentId(appointmentId: String): BillingInvoiceEntity?

    @Query("SELECT * FROM billing_invoices WHERE sync_status != 'synced'")
    suspend fun getPendingSyncInvoices(): List<BillingInvoiceEntity>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertInvoice(invoice: BillingInvoiceEntity)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertInvoices(invoices: List<BillingInvoiceEntity>)

    @Query("UPDATE billing_invoices SET sync_status = 'synced' WHERE id = :id")
    suspend fun markInvoiceSynced(id: String)

    @Query("UPDATE billing_invoices SET is_deleted = 1, deleted_at = :deletedAt, sync_status = 'pending_update', updated_at = :deletedAt WHERE id = :id")
    suspend fun softDeleteInvoice(id: String, deletedAt: Long = System.currentTimeMillis())

    // Append-Only Transactions
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertTransaction(transaction: InvoiceTransactionEntity)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertTransactions(transactions: List<InvoiceTransactionEntity>)

    @Query("SELECT * FROM invoice_transactions WHERE invoice_id = :invoiceId AND is_deleted = 0 ORDER BY recorded_at ASC")
    suspend fun getTransactionsForInvoice(invoiceId: String): List<InvoiceTransactionEntity>

    @Query("SELECT * FROM invoice_transactions WHERE sync_status != 'synced'")
    suspend fun getPendingSyncTransactions(): List<InvoiceTransactionEntity>

    @Query("UPDATE invoice_transactions SET sync_status = 'synced' WHERE id = :id")
    suspend fun markTransactionSynced(id: String)
}
