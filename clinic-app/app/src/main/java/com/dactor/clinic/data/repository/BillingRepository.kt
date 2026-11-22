package com.dactor.clinic.data.repository

import com.dactor.clinic.data.model.Appointment
import com.dactor.clinic.data.model.BillingInvoice
import com.dactor.clinic.data.model.InvoiceItem
import com.dactor.clinic.data.model.CatalogItem
import com.dactor.clinic.data.model.ClinicExpense
import com.dactor.clinic.data.model.InvoiceTransaction
import com.dactor.clinic.data.model.ClinicSubscriptionPayment
import com.dactor.clinic.data.model.PlatformCommissionSettlement
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.postgrest.postgrest
import io.github.jan.supabase.postgrest.rpc
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
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
            val effectivePaidAt = if (dbPaymentStatus == "paid") (invoice.paidAt ?: existing?.paidAt ?: nowIso) else invoice.paidAt
            val invoiceToSave = invoice.copy(
                id = invoiceId,
                paymentStatus = dbPaymentStatus,
                paidAt = effectivePaidAt,
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

            // Record transaction audit log for incoming payment on that day
            if (invoiceToSave.paidAmount > 0.0) {
                try {
                    val txId = java.util.UUID.randomUUID().toString()
                    val txTime = effectivePaidAt ?: nowIso
                    supabaseClient.postgrest["invoice_transactions"].insert(
                        InvoiceTransaction(
                            id = txId,
                            invoiceId = invoiceToSave.id,
                            clinicId = invoiceToSave.clinicId,
                            appointmentId = invoiceToSave.appointmentId,
                            amount = invoiceToSave.paidAmount,
                            paymentMethod = if (invoiceToSave.totalAmount > 0.0 && invoiceToSave.totalAmount == invoiceToSave.paidAmount) "CASH" else "PARTIAL",
                            notes = "Bill Payment Saved ($txTime)",
                            category = "CONSULTATION",
                            createdAt = txTime
                        )
                    )
                } catch (txEx: Exception) {
                    txEx.printStackTrace()
                }
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
                val apptRow = try {
                    supabaseClient.postgrest["appointments"]
                        .select { filter { eq("id", appointmentId) } }
                        .decodeSingleOrNull<Appointment>()
                } catch (_: Exception) { null }
                val initialTotal = apptRow?.effectiveTotalAmount ?: 0.0
                val initialPaid = if (apptRow?.paymentStatus.equals("paid", ignoreCase = true)) initialTotal else 0.0
                val initialBalance = (initialTotal - initialPaid).coerceAtLeast(0.0)
                val newInvoice = BillingInvoice(
                    id = java.util.UUID.randomUUID().toString(),
                    appointmentId = appointmentId,
                    clinicId = clinicId,
                    items = emptyList(),
                    totalAmount = initialTotal,
                    paidAmount = initialPaid,
                    balanceDue = initialBalance,
                    paymentStatus = apptRow?.paymentStatus ?: "pending",
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
            val list = try {
                supabaseClient.postgrest["clinic_expenses"]
                    .select {
                        filter {
                            eq("clinic_id", clinicId)
                        }
                    }.decodeList<ClinicExpense>()
            } catch (selectErr: Exception) {
                // Fallback to get_clinic_expenses RPC
                try {
                    val rpcParams = buildJsonObject {
                        put("p_clinic_id", clinicId)
                    }
                    supabaseClient.postgrest.rpc("get_clinic_expenses", rpcParams)
                        .decodeList<ClinicExpense>()
                } catch (rpcErr: Exception) {
                    emptyList()
                }
            }

            if (list.isNotEmpty()) {
                list.map { it.normalized() }
            } else {
                // Double-check RPC if table returned empty list (e.g. restrictive RLS)
                try {
                    val rpcParams = buildJsonObject {
                        put("p_clinic_id", clinicId)
                    }
                    val rpcList = supabaseClient.postgrest.rpc("get_clinic_expenses", rpcParams)
                        .decodeList<ClinicExpense>()
                    if (rpcList.isNotEmpty()) {
                        rpcList.map { it.normalized() }
                    } else {
                        emptyList()
                    }
                } catch (_: Exception) {
                    emptyList()
                }
            }
        } catch (e: Exception) {
            e.printStackTrace()
            emptyList()
        }
    }

    suspend fun addExpense(expense: ClinicExpense): ClinicExpense? = withContext(Dispatchers.IO) {
        try {
            val vNum = expense.voucherNumber ?: expense.receiptNo
            val rem = expense.remarks ?: expense.notes
            val eTime = expense.expenseTime
            val combinedNotes = if (!eTime.isNullOrBlank()) {
                "[$eTime] ${rem ?: ""}".trim()
            } else {
                rem
            }

            val targetId = expense.id.ifBlank { java.util.UUID.randomUUID().toString() }

            @Serializable
            data class ExpenseDbDto(
                @SerialName("id") val id: String,
                @SerialName("clinic_id") val clinicId: String,
                @SerialName("title") val title: String,
                @SerialName("category") val category: String,
                @SerialName("amount") val amount: Double,
                @SerialName("payment_method") val paymentMethod: String,
                @SerialName("expense_date") val expenseDate: String,
                @SerialName("receipt_no") val receiptNo: String? = null,
                @SerialName("notes") val notes: String? = null,
                @SerialName("payee_name") val payeeName: String? = null,
                @SerialName("voucher_number") val voucherNumber: String? = null,
                @SerialName("remarks") val remarks: String? = null,
                @SerialName("expense_time") val expenseTime: String? = null
            )

            val fullDto = ExpenseDbDto(
                id = targetId,
                clinicId = expense.clinicId,
                title = expense.title,
                category = expense.category,
                amount = expense.amount,
                paymentMethod = expense.paymentMethod,
                expenseDate = expense.expenseDate,
                receiptNo = vNum,
                notes = combinedNotes,
                payeeName = expense.payeeName,
                voucherNumber = vNum,
                remarks = rem,
                expenseTime = eTime
            )

            var inserted: ClinicExpense? = null
            try {
                inserted = supabaseClient.postgrest["clinic_expenses"]
                    .insert(fullDto) {
                        select()
                    }.decodeSingleOrNull<ClinicExpense>()
            } catch (directErr: Exception) {
                // 1. Try legacy minimal payload in case extra columns are not yet in PostgREST schema cache
                try {
                    @Serializable
                    data class MinimalExpenseDbDto(
                        @SerialName("id") val id: String,
                        @SerialName("clinic_id") val clinicId: String,
                        @SerialName("title") val title: String,
                        @SerialName("category") val category: String,
                        @SerialName("amount") val amount: Double,
                        @SerialName("payment_method") val paymentMethod: String,
                        @SerialName("expense_date") val expenseDate: String,
                        @SerialName("receipt_no") val receiptNo: String? = null,
                        @SerialName("notes") val notes: String? = null,
                        @SerialName("payee_name") val payeeName: String? = null
                    )
                    val minDto = MinimalExpenseDbDto(
                        id = targetId,
                        clinicId = expense.clinicId,
                        title = expense.title,
                        category = expense.category,
                        amount = expense.amount,
                        paymentMethod = expense.paymentMethod,
                        expenseDate = expense.expenseDate,
                        receiptNo = vNum,
                        notes = combinedNotes,
                        payeeName = expense.payeeName
                    )
                    inserted = supabaseClient.postgrest["clinic_expenses"]
                        .insert(minDto) {
                            select()
                        }.decodeSingleOrNull<ClinicExpense>()
                } catch (_: Exception) {
                    inserted = null
                }

                // 2. If direct table insert failed (e.g. RLS blocks anon), fall back to SECURITY DEFINER RPC
                if (inserted == null) {
                    try {
                        val rpcParams = buildJsonObject {
                            put("p_clinic_id", expense.clinicId)
                            put("p_title", expense.title)
                            put("p_amount", expense.amount)
                            put("p_category", expense.category)
                            put("p_payment_method", expense.paymentMethod)
                            put("p_expense_date", expense.expenseDate)
                            if (eTime != null) put("p_expense_time", eTime)
                            if (vNum != null) put("p_voucher_number", vNum)
                            if (rem != null) put("p_remarks", rem)
                            if (expense.payeeName != null) put("p_payee_name", expense.payeeName)
                            put("p_id", targetId)
                        }
                        inserted = supabaseClient.postgrest.rpc("add_clinic_expense", rpcParams)
                            .decodeSingleOrNull<ClinicExpense>()
                    } catch (rpcErr: Exception) {
                        rpcErr.printStackTrace()
                    }
                }
            }

            if (inserted != null) {
                inserted.normalized()
            } else {
                expense.copy(
                    id = targetId,
                    receiptNo = vNum,
                    voucherNumber = vNum,
                    notes = combinedNotes,
                    remarks = rem,
                    expenseTime = eTime
                ).normalized()
            }
        } catch (e: Exception) {
            e.printStackTrace()
            null
        }
    }

    suspend fun deleteExpense(expenseId: String): Boolean = withContext(Dispatchers.IO) {
        if (expenseId.isBlank()) return@withContext false
        try {
            var success = false
            try {
                supabaseClient.postgrest["clinic_expenses"]
                    .delete {
                        filter {
                            eq("id", expenseId)
                        }
                    }
                success = true
            } catch (delErr: Exception) {
                // Fallback to delete_clinic_expense RPC
                try {
                    val rpcParams = buildJsonObject {
                        put("p_expense_id", expenseId)
                    }
                    val res = supabaseClient.postgrest.rpc("delete_clinic_expense", rpcParams)
                        .decodeSingleOrNull<Boolean>() ?: false
                    success = res
                } catch (rpcErr: Exception) {
                    rpcErr.printStackTrace()
                    success = false
                }
            }
            success
        } catch (e: Exception) {
            e.printStackTrace()
            false
        }
    }
}
