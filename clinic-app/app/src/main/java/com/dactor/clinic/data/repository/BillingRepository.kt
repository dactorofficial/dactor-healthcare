package com.dactor.clinic.data.repository

import com.dactor.clinic.data.model.BillingInvoice
import com.dactor.clinic.data.model.InvoiceItem
import com.dactor.clinic.data.model.CatalogItem
import com.dactor.clinic.data.model.ClinicExpense
import com.dactor.clinic.data.model.InvoiceTransaction
import com.dactor.clinic.data.model.ClinicSubscriptionPayment
import com.dactor.clinic.data.model.PlatformCommissionSettlement
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.postgrest.postgrest
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class BillingRepository @Inject constructor(
    private val supabaseClient: SupabaseClient,
    private val billingDao: com.dactor.clinic.data.local.dao.BillingDao? = null,
    private val devicePrefixManager: com.dactor.clinic.data.local.DevicePrefixManager? = null
) {
    suspend fun getInvoiceByAppointment(appointmentId: String): BillingInvoice? = withContext(Dispatchers.IO) {
        if (appointmentId.isBlank()) return@withContext null
        try {
            val list = supabaseClient.postgrest["billing_invoices"]
                .select {
                    filter {
                        eq("appointment_id", appointmentId)
                    }
                }.decodeList<BillingInvoice>()
            if (list.isEmpty()) return@withContext null
            list.sortedWith(
                compareByDescending<BillingInvoice> { it.updatedAt ?: it.paidAt ?: it.createdAt ?: "" }
                    .thenByDescending { it.items.isNotEmpty() }
                    .thenByDescending { it.totalAmount }
            ).first().also { best ->
                try {
                    billingDao?.upsertInvoice(com.dactor.clinic.data.local.entity.BillingInvoiceEntity.fromDomainModel(best, syncStatus = "synced"))
                } catch (_: Exception) {}
            }
        } catch (e: Exception) {
            e.printStackTrace()
            try {
                billingDao?.getInvoiceByAppointmentId(appointmentId)?.toDomainModel()
            } catch (_: Exception) {
                null
            }
        }
    }

    suspend fun saveInvoice(invoice: BillingInvoice): BillingInvoice? = withContext(Dispatchers.IO) {
        try {
            val existing = getInvoiceByAppointment(invoice.appointmentId)
            // Sanitize payment status for DB: PostgreSQL payment_status_enum only accepts 'paid' or 'pending'
            val dbPaymentStatus = if (invoice.balanceDue <= 0.0 && invoice.totalAmount > 0.0) "paid" else "pending"
            val invoiceId = existing?.id?.takeIf { it.isNotBlank() } ?: invoice.id.takeIf { it.isNotBlank() } ?: java.util.UUID.randomUUID().toString()
            val nowIso = java.time.Instant.now().toString()
            val invoiceToSave = invoice.copy(
                id = invoiceId,
                paymentStatus = dbPaymentStatus,
                remarks = invoice.remarks?.takeIf { it.isNotBlank() } ?: existing?.remarks,
                createdAt = existing?.createdAt ?: invoice.createdAt ?: nowIso,
                updatedAt = nowIso
            )

            val saved = try {
                if (existing != null) {
                    supabaseClient.postgrest["billing_invoices"]
                        .update({
                            set("items", invoiceToSave.items)
                            set("total_amount", invoiceToSave.totalAmount)
                            set("paid_amount", invoiceToSave.paidAmount)
                            set("balance_due", invoiceToSave.balanceDue)
                            set("payment_status", dbPaymentStatus)
                            set("updated_at", nowIso)
                            if (invoiceToSave.paidAt != null) {
                                set("paid_at", invoiceToSave.paidAt)
                            }
                            if (invoiceToSave.remarks != null) {
                                set("remarks", invoiceToSave.remarks)
                            }
                        }) {
                            filter { eq("id", existing.id) }
                        }
                    invoiceToSave
                } else {
                    try {
                        supabaseClient.postgrest["billing_invoices"]
                            .insert(invoiceToSave) {
                                select()
                            }.decodeSingleOrNull<BillingInvoice>() ?: invoiceToSave
                    } catch (insertEx: Exception) {
                        insertEx.printStackTrace()
                        // Fallback: update if row for this appointment_id already exists in Supabase
                        supabaseClient.postgrest["billing_invoices"]
                            .update({
                                set("items", invoiceToSave.items)
                                set("total_amount", invoiceToSave.totalAmount)
                                set("paid_amount", invoiceToSave.paidAmount)
                                set("balance_due", invoiceToSave.balanceDue)
                                set("payment_status", dbPaymentStatus)
                                set("updated_at", nowIso)
                                if (invoiceToSave.paidAt != null) {
                                    set("paid_at", invoiceToSave.paidAt)
                                }
                                if (invoiceToSave.remarks != null) {
                                    set("remarks", invoiceToSave.remarks)
                                }
                            }) {
                                filter { eq("appointment_id", invoiceToSave.appointmentId) }
                            }
                        invoiceToSave
                    }
                }
            } catch (saveEx: Exception) {
                saveEx.printStackTrace()
                try {
                    supabaseClient.postgrest["billing_invoices"]
                        .update({
                            set("items", invoiceToSave.items)
                            set("total_amount", invoiceToSave.totalAmount)
                            set("paid_amount", invoiceToSave.paidAmount)
                            set("balance_due", invoiceToSave.balanceDue)
                            set("payment_status", dbPaymentStatus)
                            set("updated_at", nowIso)
                            if (invoiceToSave.paidAt != null) {
                                set("paid_at", invoiceToSave.paidAt)
                            }
                            if (invoiceToSave.remarks != null) {
                                set("remarks", invoiceToSave.remarks)
                            }
                        }) {
                            filter { eq("appointment_id", invoiceToSave.appointmentId) }
                        }
                    invoiceToSave
                } catch (fallbackEx: Exception) {
                    fallbackEx.printStackTrace()
                    null
                }
            }

            // Also sync fee_amount and payment_status on the appointments table so patient profile & directory always see the bill
            try {
                supabaseClient.postgrest["appointments"].update({
                    set("fee_amount", invoiceToSave.totalAmount)
                    set("payment_status", dbPaymentStatus)
                    set("updated_at", nowIso)
                }) {
                    filter { eq("id", invoiceToSave.appointmentId) }
                }
            } catch (ignored: Exception) {
                ignored.printStackTrace()
            }

            val effectiveInvoice = saved ?: invoiceToSave
            try {
                val billNumber = devicePrefixManager?.generateBillNumber() ?: ""
                val syncStatus = if (saved != null) "synced" else "pending_insert"
                billingDao?.upsertInvoice(
                    com.dactor.clinic.data.local.entity.BillingInvoiceEntity.fromDomainModel(
                        effectiveInvoice,
                        billNumber = billNumber,
                        syncStatus = syncStatus
                    )
                )
            } catch (_: Exception) {}

            effectiveInvoice
        } catch (e: Exception) {
            e.printStackTrace()
            null
        }
    }

    suspend fun getInvoicesForClinic(clinicId: String): List<BillingInvoice> = withContext(Dispatchers.IO) {
        if (clinicId.isBlank()) return@withContext emptyList()
        try {
            val list = supabaseClient.postgrest["billing_invoices"]
                .select {
                    filter {
                        eq("clinic_id", clinicId)
                    }
                }.decodeList<BillingInvoice>()
            // Sort and prioritize the latest and most complete invoice per appointment
            val deduplicated = list.groupBy { it.appointmentId }
                .values
                .map { rows ->
                    rows.sortedWith(
                        compareByDescending<BillingInvoice> { it.updatedAt ?: it.paidAt ?: it.createdAt ?: "" }
                            .thenByDescending { it.items.isNotEmpty() }
                            .thenByDescending { it.totalAmount }
                    ).first()
                }

            try {
                billingDao?.upsertInvoices(
                    deduplicated.map { com.dactor.clinic.data.local.entity.BillingInvoiceEntity.fromDomainModel(it, syncStatus = "synced") }
                )
            } catch (_: Exception) {}

            deduplicated
        } catch (e: Exception) {
            e.printStackTrace()
            val cached = try {
                billingDao?.getInvoicesForClinicList(clinicId)?.map { it.toDomainModel() }
            } catch (_: Exception) { null }
            cached ?: emptyList()
        }
    }

    /**
     * Combines previous items with new items, logs the new payment with date/time,
     * recalculates total bill, total paid, and balance due.
     */
    suspend fun saveFollowUpBill(
        appointment: com.dactor.clinic.data.model.Appointment,
        items: List<InvoiceItem>,
        newPaymentAmount: Double,
        paymentDateTime: String,
        paymentNote: String? = null,
        clinicalRemarks: String = ""
    ): BillingInvoice? = withContext(Dispatchers.IO) {
        try {
            val existing = getInvoiceByAppointment(appointment.id)
            val nowIso = java.time.Instant.now().toString()

            val existingPayments = com.dactor.clinic.domain.util.PaymentLedgerHelper.parsePaymentRecords(
                rawRemarks = existing?.remarks,
                fallbackPaidAmount = existing?.effectivePaidAmount ?: 0.0,
                fallbackDate = existing?.paidAt
            )

            val safeNewPayment = newPaymentAmount.coerceAtLeast(0.0)
            val updatedPayments = if (safeNewPayment > 0.0) {
                val cleanTime = paymentDateTime.trim().ifBlank {
                    java.time.LocalDateTime.now().format(java.time.format.DateTimeFormatter.ofPattern("yyyy-MM-dd hh:mm a"))
                }
                existingPayments + com.dactor.clinic.data.model.PaymentRecord(
                    amount = safeNewPayment,
                    dateTime = cleanTime,
                    note = paymentNote?.trim()?.ifBlank { "Payment Received" } ?: "Payment Received"
                )
            } else {
                existingPayments
            }

            val totalPaidAmount = updatedPayments.sumOf { it.amount }
            val itemsTotal = items.sumOf { it.total }
            // If items list is empty, bill total is at least the total paid
            val calculatedTotal = if (itemsTotal > 0.0) itemsTotal else totalPaidAmount
            val balanceDue = (calculatedTotal - totalPaidAmount).coerceAtLeast(0.0)
            val paymentStatus = when {
                balanceDue <= 0.0 && calculatedTotal > 0.0 -> "paid"
                totalPaidAmount > 0.0 -> "partial"
                else -> "pending"
            }

            val combinedRemarks = com.dactor.clinic.domain.util.PaymentLedgerHelper.buildCombinedRemarks(
                cleanRemarks = clinicalRemarks,
                paymentRecords = updatedPayments
            )

            val invoiceToSave = BillingInvoice(
                id = existing?.id ?: java.util.UUID.randomUUID().toString(),
                appointmentId = appointment.id,
                clinicId = appointment.clinicId,
                items = items,
                totalAmount = calculatedTotal,
                paidAmount = totalPaidAmount,
                balanceDue = balanceDue,
                paymentStatus = paymentStatus,
                paidAt = if (safeNewPayment > 0.0) nowIso else (existing?.paidAt ?: nowIso),
                remarks = combinedRemarks
            )

            saveInvoice(invoiceToSave)
        } catch (e: Exception) {
            e.printStackTrace()
            null
        }
    }

    /**
     * Pushes a quick payment entry with date and time log (e.g. Paid 1000 with no other detail required).
     * Automatically logs into the patient's payment ledger with timestamp and updates total bill and paid amounts.
     */
    suspend fun pushQuickPayment(
        appointment: com.dactor.clinic.data.model.Appointment,
        paymentDate: String,
        paidAmount: Double,
        note: String? = null
    ): BillingInvoice? = withContext(Dispatchers.IO) {
        try {
            val safePaid = paidAmount.coerceAtLeast(0.0)
            val cleanDate = paymentDate.trim().ifBlank { java.time.LocalDate.now().toString() }
            val currentTime = java.time.LocalTime.now().format(java.time.format.DateTimeFormatter.ofPattern("hh:mm a"))
            val timeFormatted = "$cleanDate $currentTime"
            val existing = getInvoiceByAppointment(appointment.id)
            val cleanRemarks = com.dactor.clinic.domain.util.PaymentLedgerHelper.extractCleanClinicalRemarks(existing?.remarks)
            val currentItems = existing?.items?.filterNot { it.itemName.startsWith("Payment Received", ignoreCase = true) } ?: emptyList()

            saveFollowUpBill(
                appointment = appointment,
                items = currentItems,
                newPaymentAmount = safePaid,
                paymentDateTime = timeFormatted,
                paymentNote = note?.takeIf { it.isNotBlank() } ?: "Quick Payment",
                clinicalRemarks = cleanRemarks
            )
        } catch (e: Exception) {
            e.printStackTrace()
            null
        }
    }

    suspend fun getRemarkForAppointment(appointmentId: String): String? = withContext(Dispatchers.IO) {
        try {
            val invoice = getInvoiceByAppointment(appointmentId)
            invoice?.remarks?.let { com.dactor.clinic.domain.util.PaymentLedgerHelper.extractCleanClinicalRemarks(it) }?.trim()?.ifBlank { null }
        } catch (e: Exception) {
            null
        }
    }

    suspend fun getRemarksForAppointments(appointmentIds: List<String>): Map<String, String> = withContext(Dispatchers.IO) {
        if (appointmentIds.isEmpty()) return@withContext emptyMap()
        try {
            val invoices = supabaseClient.postgrest["billing_invoices"]
                .select {
                    filter {
                        isIn("appointment_id", appointmentIds)
                    }
                }.decodeList<BillingInvoice>()
            invoices.mapNotNull { inv ->
                val r = com.dactor.clinic.domain.util.PaymentLedgerHelper.extractCleanClinicalRemarks(inv.remarks).trim()
                if (r.isNotBlank()) inv.appointmentId to r else null
            }.toMap()
        } catch (e: Exception) {
            e.printStackTrace()
            emptyMap()
        }
    }

    suspend fun saveRemarkForAppointment(appointmentId: String, clinicId: String, remarks: String): Boolean = withContext(Dispatchers.IO) {
        try {
            val existing = getInvoiceByAppointment(appointmentId)
            val nowIso = java.time.Instant.now().toString()
            val cleanRemark = com.dactor.clinic.domain.util.PaymentLedgerHelper.extractCleanClinicalRemarks(remarks).trim()
            if (existing != null) {
                val existingPayments = com.dactor.clinic.domain.util.PaymentLedgerHelper.parsePaymentRecords(
                    rawRemarks = existing.remarks,
                    fallbackPaidAmount = existing.effectivePaidAmount,
                    fallbackDate = existing.paidAt
                )
                val combinedRemarks = com.dactor.clinic.domain.util.PaymentLedgerHelper.buildCombinedRemarks(cleanRemark, existingPayments)
                supabaseClient.postgrest["billing_invoices"]
                    .update({
                        set("remarks", combinedRemarks)
                        set("updated_at", nowIso)
                    }) {
                        filter { eq("id", existing.id) }
                    }
            } else {
                val newInvoice = BillingInvoice(
                    id = java.util.UUID.randomUUID().toString(),
                    appointmentId = appointmentId,
                    clinicId = clinicId,
                    items = emptyList(),
                    totalAmount = 0.0,
                    paidAmount = 0.0,
                    balanceDue = 0.0,
                    paymentStatus = "pending",
                    remarks = cleanRemark,
                    createdAt = nowIso,
                    updatedAt = nowIso
                )
                try {
                    supabaseClient.postgrest["billing_invoices"].insert(newInvoice)
                } catch (insEx: Exception) {
                    supabaseClient.postgrest["billing_invoices"]
                        .update({
                            set("remarks", cleanRemark)
                            set("updated_at", nowIso)
                        }) {
                            filter { eq("appointment_id", appointmentId) }
                        }
                }
            }
            true
        } catch (e: Exception) {
            e.printStackTrace()
            false
        }
    }

    suspend fun getCatalog(clinicId: String): List<CatalogItem> = withContext(Dispatchers.IO) {
        try {
            supabaseClient.postgrest["clinic_catalog"]
                .select {
                    filter {
                        eq("clinic_id", clinicId)
                    }
                }.decodeList<CatalogItem>()
        } catch (e: Exception) {
            e.printStackTrace()
            emptyList()
        }
    }

    suspend fun addCatalogItem(item: CatalogItem): CatalogItem? = withContext(Dispatchers.IO) {
        try {
            supabaseClient.postgrest["clinic_catalog"]
                .insert(item) {
                    select()
                }.decodeSingleOrNull<CatalogItem>() ?: item
        } catch (e: Exception) {
            e.printStackTrace()
            null
        }
    }

    suspend fun deleteCatalogItem(id: String): Boolean = withContext(Dispatchers.IO) {
        try {
            supabaseClient.postgrest["clinic_catalog"]
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

    suspend fun getTransactionsForClinic(clinicId: String): List<InvoiceTransaction> = withContext(Dispatchers.IO) {
        if (clinicId.isBlank()) return@withContext emptyList()
        try {
            supabaseClient.postgrest["invoice_transactions"]
                .select {
                    filter {
                        eq("clinic_id", clinicId)
                    }
                }.decodeList<InvoiceTransaction>()
        } catch (e: Exception) {
            e.printStackTrace()
            emptyList()
        }
    }

    suspend fun recordInvoiceTransaction(transaction: InvoiceTransaction): InvoiceTransaction? = withContext(Dispatchers.IO) {
        try {
            supabaseClient.postgrest["invoice_transactions"]
                .insert(transaction) {
                    select()
                }.decodeSingleOrNull<InvoiceTransaction>() ?: transaction
        } catch (e: Exception) {
            e.printStackTrace()
            null
        }
    }

    suspend fun getSubscriptionPaymentsForClinic(clinicId: String): List<ClinicSubscriptionPayment> = withContext(Dispatchers.IO) {
        if (clinicId.isBlank()) return@withContext emptyList()
        try {
            supabaseClient.postgrest["clinic_subscription_payments"]
                .select {
                    filter {
                        eq("clinic_id", clinicId)
                    }
                }.decodeList<ClinicSubscriptionPayment>()
        } catch (e: Exception) {
            e.printStackTrace()
            emptyList()
        }
    }

    suspend fun getCommissionSettlementsForClinic(clinicId: String): List<PlatformCommissionSettlement> = withContext(Dispatchers.IO) {
        if (clinicId.isBlank()) return@withContext emptyList()
        try {
            supabaseClient.postgrest["platform_commission_settlements"]
                .select {
                    filter {
                        eq("clinic_id", clinicId)
                    }
                }.decodeList<PlatformCommissionSettlement>()
        } catch (e: Exception) {
            e.printStackTrace()
            emptyList()
        }
    }

    suspend fun getExpensesForClinic(clinicId: String): List<ClinicExpense> = withContext(Dispatchers.IO) {
        if (clinicId.isBlank()) return@withContext emptyList()
        try {
            supabaseClient.postgrest["clinic_expenses"]
                .select {
                    filter {
                        eq("clinic_id", clinicId)
                    }
                }.decodeList<ClinicExpense>()
        } catch (e: Exception) {
            e.printStackTrace()
            emptyList()
        }
    }

    suspend fun addExpense(expense: ClinicExpense): ClinicExpense? = withContext(Dispatchers.IO) {
        try {
            supabaseClient.postgrest["clinic_expenses"]
                .insert(expense) {
                    select()
                }.decodeSingleOrNull<ClinicExpense>() ?: expense
        } catch (e: Exception) {
            e.printStackTrace()
            null
        }
    }

    suspend fun deleteExpense(expenseId: String): Boolean = withContext(Dispatchers.IO) {
        if (expenseId.isBlank()) return@withContext false
        try {
            supabaseClient.postgrest["clinic_expenses"]
                .delete {
                    filter {
                        eq("id", expenseId)
                    }
                }
            true
        } catch (e: Exception) {
            e.printStackTrace()
            false
        }
    }
}
