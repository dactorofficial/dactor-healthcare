package com.dactor.clinic.data.local

import com.dactor.clinic.data.local.entity.AppointmentEntity
import com.dactor.clinic.data.local.entity.BillingInvoiceEntity
import com.dactor.clinic.data.local.entity.InvoiceTransactionEntity
import com.dactor.clinic.data.local.entity.QueueEntryEntity
import com.dactor.clinic.data.local.entity.SyncMetadataEntity
import com.dactor.clinic.data.model.Appointment
import com.dactor.clinic.data.model.BillingInvoice
import com.dactor.clinic.data.model.InvoiceItem
import com.dactor.clinic.data.model.QueueEntry
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.util.UUID

class OfflineSyncEntityTest {

    @Test
    fun testAppointmentEntityMappingAndTombstones() {
        val apptId = UUID.randomUUID().toString()
        val originalAppt = Appointment(
            id = apptId,
            trackingCode10Digit = "1010420015",
            clinicId = "clinic-uuid-001",
            patientName = "Sita Sharma",
            patientMobile = "9800000001",
            appointmentDate = "2026-10-23",
            appointmentTime = "10:30",
            feeAmount = 500.0,
            isWalkin = true
        )

        val entity = AppointmentEntity.fromDomainModel(
            model = originalAppt,
            syncStatus = "pending_insert",
            isDeleted = false
        )

        assertEquals(apptId, entity.id)
        assertEquals("1010420015", entity.trackingCode10Digit)
        assertEquals("pending_insert", entity.syncStatus)
        assertFalse(entity.isDeleted)

        // Convert back to domain model
        val domain = entity.toDomainModel()
        assertEquals(originalAppt.id, domain.id)
        assertEquals(originalAppt.trackingCode10Digit, domain.trackingCode10Digit)
        assertEquals(originalAppt.patientName, domain.patientName)
        assertEquals(originalAppt.feeAmount, domain.feeAmount, 0.001)

        // Test tombstone deletion
        val deletedEntity = entity.copy(
            isDeleted = true,
            deletedAt = 1761234567000L,
            syncStatus = "pending_update"
        )
        assertTrue(deletedEntity.isDeleted)
        assertNotNull(deletedEntity.deletedAt)
        assertEquals("pending_update", deletedEntity.syncStatus)
    }

    @Test
    fun testBillingInvoiceEntityMappingAndItemsJson() {
        val invoiceId = UUID.randomUUID().toString()
        val apptId = UUID.randomUUID().toString()
        val items = listOf(
            InvoiceItem(itemName = "General Consultation", quantity = 1, price = 500.0, total = 500.0),
            InvoiceItem(itemName = "Blood Sugar Test", quantity = 1, price = 250.0, total = 250.0)
        )
        val originalInvoice = BillingInvoice(
            id = invoiceId,
            appointmentId = apptId,
            clinicId = "clinic-uuid-001",
            items = items,
            totalAmount = 750.0,
            paidAmount = 500.0,
            balanceDue = 250.0,
            paymentStatus = "pending"
        )

        val entity = BillingInvoiceEntity.fromDomainModel(
            model = originalInvoice,
            billNumber = "B-T01-20261023-0001",
            syncStatus = "pending_insert"
        )

        assertEquals(invoiceId, entity.id)
        assertEquals("B-T01-20261023-0001", entity.billNumber)
        assertEquals(750.0, entity.totalAmount, 0.001)
        assertEquals(250.0, entity.balanceDue, 0.001)
        assertTrue(entity.itemsJson.contains("General Consultation"))
        assertTrue(entity.itemsJson.contains("Blood Sugar Test"))

        // Convert back to domain
        val domain = entity.toDomainModel()
        assertEquals(2, domain.items.size)
        assertEquals("General Consultation", domain.items[0].itemName)
        assertEquals(250.0, domain.items[1].price, 0.001)
        assertEquals(750.0, domain.totalAmount, 0.001)
    }

    @Test
    fun testInvoiceAppendOnlyTransactionsLedger() {
        val invoiceId = UUID.randomUUID().toString()
        val clinicId = "clinic-uuid-001"

        val initialCharge = InvoiceTransactionEntity(
            id = UUID.randomUUID().toString(),
            invoiceId = invoiceId,
            clinicId = clinicId,
            type = "charge",
            amount = 1000.0,
            paymentMethod = "desk",
            recordedByTerminalId = "T01",
            recordedAt = 1000L,
            syncStatus = "synced"
        )

        val partialPayment1 = InvoiceTransactionEntity(
            id = UUID.randomUUID().toString(),
            invoiceId = invoiceId,
            clinicId = clinicId,
            type = "payment",
            amount = 400.0,
            paymentMethod = "cash",
            recordedByTerminalId = "T01",
            recordedAt = 2000L,
            syncStatus = "pending_insert"
        )

        val partialPayment2 = InvoiceTransactionEntity(
            id = UUID.randomUUID().toString(),
            invoiceId = invoiceId,
            clinicId = clinicId,
            type = "payment",
            amount = 600.0,
            paymentMethod = "esewa",
            referenceId = "ESEWA_TX_998811",
            recordedByTerminalId = "T02",
            recordedAt = 3000L,
            syncStatus = "pending_insert"
        )

        val ledger = listOf(initialCharge, partialPayment1, partialPayment2)

        // Calculate dynamic ledger balance
        var totalCharged = 0.0
        var totalPaid = 0.0
        for (tx in ledger) {
            when (tx.type) {
                "charge" -> totalCharged += tx.amount
                "payment" -> totalPaid += tx.amount
                "refund" -> totalPaid -= tx.amount
            }
        }

        val balanceDue = totalCharged - totalPaid
        assertEquals(1000.0, totalCharged, 0.001)
        assertEquals(1000.0, totalPaid, 0.001)
        assertEquals(0.0, balanceDue, 0.001)
    }

    @Test
    fun testQueueEntryEntityMapping() {
        val entryId = UUID.randomUUID().toString()
        val apptId = UUID.randomUUID().toString()
        val originalQueue = QueueEntry(
            id = entryId,
            appointmentId = apptId,
            clinicId = "clinic-uuid-001",
            doctorId = "doctor-uuid-001",
            queuePosition = 3,
            status = "waiting",
            consultationDurationSeconds = null,
            createdAt = "2026-10-23T10:00:00Z"
        )

        val entity = QueueEntryEntity.fromDomainModel(
            model = originalQueue,
            tokenNumber = "T-T01-003",
            syncStatus = "pending_insert"
        )

        assertEquals("T-T01-003", entity.tokenNumber)
        assertEquals(3, entity.queuePosition)
        assertEquals("pending_insert", entity.syncStatus)

        val domain = entity.toDomainModel()
        assertEquals(originalQueue.id, domain.id)
        assertEquals(originalQueue.queuePosition, domain.queuePosition)
        assertEquals("waiting", domain.status)
    }

    @Test
    fun testSyncMetadataTracking() {
        val metadata = SyncMetadataEntity(
            tableName = "appointments",
            lastSyncTimestamp = 1761234500000L,
            lastSyncStatus = "SUCCESS",
            lastError = null
        )

        assertEquals("appointments", metadata.tableName)
        assertEquals(1761234500000L, metadata.lastSyncTimestamp)
        assertEquals("SUCCESS", metadata.lastSyncStatus)
    }
}
