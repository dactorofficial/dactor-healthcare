package com.dactor.patient.util

import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.RectF
import android.graphics.Typeface
import android.graphics.pdf.PdfDocument
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import android.widget.Toast
import com.dactor.patient.data.model.Appointment
import com.dactor.patient.data.model.BillingInvoice
import com.dactor.patient.data.model.InvoiceItem
import java.io.File
import java.io.FileOutputStream
import java.io.OutputStream
import java.time.LocalDateTime
import java.time.format.DateTimeFormatter

object BillPdfDownloader {

    /**
     * Generates a professional A4 PDF invoice/receipt for a patient's appointment and saves it
     * directly to the device's Downloads directory.
     */
    fun downloadBillPdf(
        context: Context,
        appointment: Appointment,
        invoice: BillingInvoice?,
        clinicName: String,
        clinicAddress: String? = null,
        doctorName: String,
        doctorSpecialty: String? = null,
        clinicalRemarks: String? = null
    ): Uri? {
        val pdfDocument = PdfDocument()
        try {
            val pageWidth = 595 // Standard A4 width in points (72 dpi)
            val pageHeight = 842 // Standard A4 height in points
            val pageInfo = PdfDocument.PageInfo.Builder(pageWidth, pageHeight, 1).create()
            val page = pdfDocument.startPage(pageInfo)
            val canvas: Canvas = page.canvas

            val tealPrimary = Color.parseColor("#00796B")
            val tealDark = Color.parseColor("#004D40")
            val tealLight = Color.parseColor("#E0F2F1")
            val slateDark = Color.parseColor("#0F172A")
            val slateMuted = Color.parseColor("#64748B")
            val borderGray = Color.parseColor("#CBD5E1")
            val rowBg = Color.parseColor("#F8FAFC")
            val greenPaid = Color.parseColor("#059669")
            val redDue = Color.parseColor("#DC2626")

            val paint = Paint(Paint.ANTI_ALIAS_FLAG)
            val textPaint = Paint(Paint.ANTI_ALIAS_FLAG)

            // ── 1. TOP HEADER BANNER ──────────────────────────────────────────
            paint.color = tealPrimary
            canvas.drawRect(0f, 0f, pageWidth.toFloat(), 108f, paint)

            textPaint.color = Color.WHITE
            textPaint.typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
            textPaint.textSize = 20f
            canvas.drawText(clinicName.ifBlank { "Dactor Medical Clinic" }, 36f, 42f, textPaint)

            textPaint.typeface = Typeface.create(Typeface.DEFAULT, Typeface.NORMAL)
            textPaint.textSize = 11f
            val docLine = buildString {
                val cleanDoc = if (doctorName.startsWith("Dr.", ignoreCase = true)) doctorName else "Dr. $doctorName"
                append("Attending Doctor: $cleanDoc")
                if (!doctorSpecialty.isNullOrBlank()) {
                    append(" ($doctorSpecialty)")
                }
            }
            canvas.drawText(docLine, 36f, 64f, textPaint)

            textPaint.textSize = 10f
            val nowStr = try {
                LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm"))
            } catch (e: Exception) {
                appointment.appointmentDate
            }
            canvas.drawText("Official Medical Billing Receipt \u2022 Generated: $nowStr", 36f, 84f, textPaint)

            // Right badge in header
            textPaint.textAlign = Paint.Align.RIGHT
            textPaint.typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
            textPaint.textSize = 14f
            canvas.drawText("INVOICE / RECEIPT", (pageWidth - 36).toFloat(), 42f, textPaint)
            textPaint.textSize = 11f
            canvas.drawText("ID: #${appointment.trackingCode10Digit}", (pageWidth - 36).toFloat(), 64f, textPaint)
            textPaint.textAlign = Paint.Align.LEFT

            // ── 2. PATIENT & APPOINTMENT SUMMARY BOX ──────────────────────────
            var currentY = 128f
            paint.color = rowBg
            val infoRect = RectF(36f, currentY, (pageWidth - 36).toFloat(), currentY + 86f)
            canvas.drawRoundRect(infoRect, 10f, 10f, paint)

            paint.style = Paint.Style.STROKE
            paint.strokeWidth = 1f
            paint.color = borderGray
            canvas.drawRoundRect(infoRect, 10f, 10f, paint)
            paint.style = Paint.Style.FILL

            textPaint.color = slateMuted
            textPaint.typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
            textPaint.textSize = 9.5f
            canvas.drawText("PATIENT DETAILS", 50f, currentY + 20f, textPaint)
            canvas.drawText("APPOINTMENT DETAILS", 320f, currentY + 20f, textPaint)

            textPaint.color = slateDark
            textPaint.typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
            textPaint.textSize = 12f
            canvas.drawText(appointment.patientName, 50f, currentY + 40f, textPaint)

            textPaint.typeface = Typeface.create(Typeface.DEFAULT, Typeface.NORMAL)
            textPaint.textSize = 10.5f
            canvas.drawText("Age / Gender: ${appointment.patientAge} yrs \u2022 ${appointment.patientGender}", 50f, currentY + 57f, textPaint)
            canvas.drawText("Mobile: ${appointment.patientMobile}", 50f, currentY + 73f, textPaint)

            textPaint.typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
            textPaint.textSize = 11f
            canvas.drawText("Date: ${appointment.appointmentDate}", 320f, currentY + 40f, textPaint)
            textPaint.typeface = Typeface.create(Typeface.DEFAULT, Typeface.NORMAL)
            textPaint.textSize = 10.5f
            canvas.drawText("Time: ${appointment.appointmentTime}", 320f, currentY + 57f, textPaint)
            canvas.drawText("10-Digit Code: ${appointment.trackingCode10Digit}", 320f, currentY + 73f, textPaint)

            currentY += 108f

            val logSource = when {
                invoice?.remarks?.contains("<!--PAYMENT_LOG_START-->") == true -> invoice.remarks
                clinicalRemarks?.contains("<!--PAYMENT_LOG_START-->") == true -> clinicalRemarks
                !invoice?.remarks.isNullOrBlank() -> invoice.remarks
                else -> clinicalRemarks
            }
            val cleanRemarks = PaymentLedgerHelper.extractCleanClinicalRemarks(
                if (!clinicalRemarks.isNullOrBlank() && !clinicalRemarks.contains("<!--PAYMENT_LOG_START-->")) clinicalRemarks else logSource
            )

            // ── 3. ITEMIZED BILL TABLE ────────────────────────────────────────
            val cleanItems = invoice?.items?.filterNot { it.itemName.startsWith("Payment Received", ignoreCase = true) } ?: emptyList()
            val opdFee = appointment.feeAmount.takeIf { it > 0.0 } ?: 0.0
            val deskCharge = appointment.effectiveServiceCharge

            val effectiveItems: List<InvoiceItem> = when {
                cleanItems.isNotEmpty() -> {
                    val hasServiceCharge = cleanItems.any {
                        val lower = it.itemName.lowercase()
                        lower.contains("service charge") || lower.contains("5%") || lower.contains("+5%")
                    }
                    if (appointment.isPayAtDesk && deskCharge > 0.0 && !hasServiceCharge) {
                        cleanItems + InvoiceItem(
                            itemName = "Pay at Desk Service Charge (5%)",
                            quantity = 1,
                            price = deskCharge,
                            total = deskCharge
                        )
                    } else {
                        cleanItems
                    }
                }
                opdFee > 0.0 && appointment.isPayAtDesk && deskCharge > 0.0 -> listOf(
                    InvoiceItem(itemName = "OPD Doctor Consultation (${appointment.appointmentDate})", quantity = 1, price = opdFee, total = opdFee),
                    InvoiceItem(itemName = "Pay at Desk Service Charge (5%)", quantity = 1, price = deskCharge, total = deskCharge)
                )
                opdFee > 0.0 -> listOf(InvoiceItem(itemName = "OPD Doctor Consultation (${appointment.appointmentDate})", quantity = 1, price = opdFee, total = opdFee))
                !invoice?.items.isNullOrEmpty() -> appointment.effectiveItemsForInvoice(invoice)
                else -> {
                    val fallbackTotal = appointment.effectiveTotalForInvoice(invoice)
                    if (fallbackTotal > 0.0) {
                        appointment.effectiveItemsForInvoice(invoice, appointment.appointmentDate, fallbackTotal)
                    } else {
                        emptyList()
                    }
                }
            }

            // Table Header
            paint.color = tealLight
            val headerRect = RectF(36f, currentY, (pageWidth - 36).toFloat(), currentY + 26f)
            canvas.drawRoundRect(headerRect, 6f, 6f, paint)

            textPaint.color = tealDark
            textPaint.typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
            textPaint.textSize = 10f
            canvas.drawText("#", 48f, currentY + 17f, textPaint)
            canvas.drawText("SERVICES & PROCEDURES", 74f, currentY + 17f, textPaint)
            canvas.drawText("QTY", 360f, currentY + 17f, textPaint)
            canvas.drawText("UNIT PRICE", 415f, currentY + 17f, textPaint)
            textPaint.textAlign = Paint.Align.RIGHT
            canvas.drawText("AMOUNT (NPR)", (pageWidth - 48).toFloat(), currentY + 17f, textPaint)
            textPaint.textAlign = Paint.Align.LEFT

            currentY += 30f

            effectiveItems.forEachIndexed { idx, item ->
                if (idx % 2 == 1) {
                    paint.color = rowBg
                    canvas.drawRect(36f, currentY, (pageWidth - 36).toFloat(), currentY + 22f, paint)
                }

                textPaint.color = slateDark
                textPaint.typeface = Typeface.create(Typeface.DEFAULT, Typeface.NORMAL)
                textPaint.textSize = 10f
                canvas.drawText("${idx + 1}", 48f, currentY + 15f, textPaint)
                canvas.drawText(item.itemName.take(44), 74f, currentY + 15f, textPaint)
                canvas.drawText("${item.quantity}", 365f, currentY + 15f, textPaint)
                canvas.drawText("Rs. ${PaymentLedgerHelper.formatRsAmount(item.price)}", 415f, currentY + 15f, textPaint)

                textPaint.typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
                textPaint.textAlign = Paint.Align.RIGHT
                val rowTotal = if (item.total > 0) item.total else (item.price * item.quantity)
                canvas.drawText("Rs. ${PaymentLedgerHelper.formatRsAmount(rowTotal)}", (pageWidth - 48).toFloat(), currentY + 15f, textPaint)
                textPaint.textAlign = Paint.Align.LEFT

                currentY += 22f
                paint.color = borderGray
                canvas.drawLine(36f, currentY, (pageWidth - 36).toFloat(), currentY, paint)
            }

            currentY += 14f

            // ── 4. PAYMENT RECEIPTS & TIME LOG TABLE ─────────────────────────
            val calculatedItemsTotal = effectiveItems.sumOf { if (it.total > 0) it.total else (it.price * it.quantity) }
            val totalBill = maxOf(
                calculatedItemsTotal,
                appointment.effectiveTotalForInvoice(invoice)
            )
            val paidAmt = appointment.effectivePaidForInvoice(invoice, totalBill)
            val leftAmt = (totalBill - paidAmt).coerceAtLeast(0.0)

            val paymentLogs = PaymentLedgerHelper.reconcilePaymentRecordsForAppointment(
                appointment, invoice, logSource, paidAmt, invoice?.paidAt
            )
            if (paymentLogs.isNotEmpty()) {
                paint.color = Color.parseColor("#DCFCE7") // Light green header for payment receipts
                val payHeaderRect = RectF(36f, currentY, (pageWidth - 36).toFloat(), currentY + 24f)
                canvas.drawRoundRect(payHeaderRect, 6f, 6f, paint)

                textPaint.color = Color.parseColor("#166534")
                textPaint.typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
                textPaint.textSize = 9.5f
                canvas.drawText("#", 48f, currentY + 16f, textPaint)
                canvas.drawText("PAYMENT RECEIPTS & TIME LOG", 74f, currentY + 16f, textPaint)
                canvas.drawText("NOTE / MODE", 300f, currentY + 16f, textPaint)
                textPaint.textAlign = Paint.Align.RIGHT
                canvas.drawText("PAID (NPR)", (pageWidth - 48).toFloat(), currentY + 16f, textPaint)
                textPaint.textAlign = Paint.Align.LEFT

                currentY += 28f

                paymentLogs.forEachIndexed { pIdx, p ->
                    if (pIdx % 2 == 1) {
                        paint.color = rowBg
                        canvas.drawRect(36f, currentY, (pageWidth - 36).toFloat(), currentY + 22f, paint)
                    }

                    textPaint.color = slateDark
                    textPaint.typeface = Typeface.create(Typeface.DEFAULT, Typeface.NORMAL)
                    textPaint.textSize = 9.5f
                    canvas.drawText("${pIdx + 1}", 48f, currentY + 15f, textPaint)
                    val formattedDateTime = PaymentLedgerHelper.formatDisplayDateTime(p.dateTime)
                    canvas.drawText(formattedDateTime, 74f, currentY + 15f, textPaint)
                    canvas.drawText((p.note ?: "Payment Received").take(28), 300f, currentY + 15f, textPaint)

                    textPaint.color = greenPaid
                    textPaint.typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
                    textPaint.textAlign = Paint.Align.RIGHT
                    canvas.drawText("Rs. ${PaymentLedgerHelper.formatRsAmount(p.amount)}", (pageWidth - 48).toFloat(), currentY + 15f, textPaint)
                    textPaint.textAlign = Paint.Align.LEFT

                    currentY += 22f
                    paint.color = borderGray
                    canvas.drawLine(36f, currentY, (pageWidth - 36).toFloat(), currentY, paint)
                }

                currentY += 14f
            }

            // ── 5. FINANCIAL TOTALS (TOTAL, PAID, LEFT/DUE) ───────────────────
            val summaryBoxLeft = 290f
            val summaryBoxRight = (pageWidth - 36).toFloat()
            paint.color = rowBg
            val totalsRect = RectF(summaryBoxLeft, currentY, summaryBoxRight, currentY + 92f)
            canvas.drawRoundRect(totalsRect, 8f, 8f, paint)

            paint.style = Paint.Style.STROKE
            paint.strokeWidth = 1.2f
            paint.color = tealPrimary
            canvas.drawRoundRect(totalsRect, 8f, 8f, paint)
            paint.style = Paint.Style.FILL

            // Row A: Total Bill Amount
            textPaint.color = slateMuted
            textPaint.typeface = Typeface.create(Typeface.DEFAULT, Typeface.NORMAL)
            textPaint.textSize = 10.5f
            canvas.drawText("Total Bill Amount:", summaryBoxLeft + 16f, currentY + 24f, textPaint)
            textPaint.color = slateDark
            textPaint.typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
            textPaint.textAlign = Paint.Align.RIGHT
            canvas.drawText("Rs. ${PaymentLedgerHelper.formatRsAmount(totalBill)}", summaryBoxRight - 16f, currentY + 24f, textPaint)
            textPaint.textAlign = Paint.Align.LEFT

            // Row B: Total Amount Paid
            textPaint.color = slateMuted
            textPaint.typeface = Typeface.create(Typeface.DEFAULT, Typeface.NORMAL)
            canvas.drawText("Total Amount Paid:", summaryBoxLeft + 16f, currentY + 48f, textPaint)
            textPaint.color = greenPaid
            textPaint.typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
            textPaint.textAlign = Paint.Align.RIGHT
            canvas.drawText("Rs. ${PaymentLedgerHelper.formatRsAmount(paidAmt)}", summaryBoxRight - 16f, currentY + 48f, textPaint)
            textPaint.textAlign = Paint.Align.LEFT

            // Divider inside summary box
            paint.color = borderGray
            canvas.drawLine(summaryBoxLeft + 14f, currentY + 58f, summaryBoxRight - 14f, currentY + 58f, paint)

            // Row C: Remaining / Left Amount
            textPaint.color = slateDark
            textPaint.typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
            textPaint.textSize = 11.5f
            canvas.drawText("Remaining Left / Due:", summaryBoxLeft + 16f, currentY + 78f, textPaint)
            textPaint.color = if (leftAmt > 0.0) redDue else greenPaid
            textPaint.textAlign = Paint.Align.RIGHT
            val leftLabel = if (leftAmt > 0.0) "Rs. ${PaymentLedgerHelper.formatRsAmount(leftAmt)} (DUE)" else "Rs. 0 (PAID)"
            canvas.drawText(leftLabel, summaryBoxRight - 16f, currentY + 78f, textPaint)
            textPaint.textAlign = Paint.Align.LEFT

            currentY += 108f

            // ── 6. CLINICAL REMARKS / PRESCRIPTION NOTES ──────────────────────
            if (cleanRemarks.isNotBlank()) {
                paint.color = Color.parseColor("#F0FDF4")
                val remRect = RectF(36f, currentY, (pageWidth - 36).toFloat(), currentY + 68f)
                canvas.drawRoundRect(remRect, 8f, 8f, paint)

                textPaint.color = tealDark
                textPaint.typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
                textPaint.textSize = 10f
                canvas.drawText("DOCTOR'S CLINICAL REMARKS & PRESCRIPTION:", 48f, currentY + 20f, textPaint)

                textPaint.color = slateDark
                textPaint.typeface = Typeface.create(Typeface.DEFAULT, Typeface.NORMAL)
                textPaint.textSize = 9.5f
                val lines = cleanRemarks.chunked(85).take(3)
                lines.forEachIndexed { i, line ->
                    canvas.drawText(line, 48f, currentY + 38f + (i * 14f), textPaint)
                }
                currentY += 82f
            }

            // ── 6. FOOTER ─────────────────────────────────────────────────────
            textPaint.color = slateMuted
            textPaint.typeface = Typeface.create(Typeface.DEFAULT, Typeface.NORMAL)
            textPaint.textSize = 9.5f
            textPaint.textAlign = Paint.Align.CENTER
            canvas.drawText(
                "Thank you for choosing $clinicName \u2022 Powered by Dactor Healthcare Nepal",
                (pageWidth / 2).toFloat(),
                (pageHeight - 36).toFloat(),
                textPaint
            )

            pdfDocument.finishPage(page)

            // ── SAVE TO DOWNLOADS ─────────────────────────────────────────────
            val cleanCode = appointment.trackingCode10Digit.ifBlank { appointment.id.take(8) }
            val fileName = "Dactor_Bill_${cleanCode}_${System.currentTimeMillis() % 100000}.pdf"

            // Save to app external files dir first (for guaranteed FileProvider sharing)
            val appDownloadDir = context.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS)
                ?: File(context.filesDir, "downloads").apply { mkdirs() }
            val appFile = File(appDownloadDir, fileName)
            FileOutputStream(appFile).use { out ->
                pdfDocument.writeTo(out)
            }

            var savedUri: Uri? = null

            // Also copy to public Downloads if on Android Q+
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                try {
                    val resolver = context.contentResolver
                    val contentValues = ContentValues().apply {
                        put(MediaStore.MediaColumns.DISPLAY_NAME, fileName)
                        put(MediaStore.MediaColumns.MIME_TYPE, "application/pdf")
                        put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS)
                        put(MediaStore.MediaColumns.IS_PENDING, 1)
                    }
                    val pubUri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, contentValues)
                    if (pubUri != null) {
                        resolver.openOutputStream(pubUri)?.use { out ->
                            appFile.inputStream().use { inp -> inp.copyTo(out) }
                        }
                        contentValues.clear()
                        contentValues.put(MediaStore.MediaColumns.IS_PENDING, 0)
                        resolver.update(pubUri, contentValues, null, null)
                        savedUri = pubUri
                    }
                } catch (e: Exception) {
                    e.printStackTrace()
                }
            } else {
                try {
                    val publicDir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS)
                    if (!publicDir.exists()) publicDir.mkdirs()
                    val pubFile = File(publicDir, fileName)
                    FileOutputStream(pubFile).use { out ->
                        appFile.inputStream().use { inp -> inp.copyTo(out) }
                    }
                    savedUri = Uri.fromFile(pubFile)
                } catch (e: Exception) {
                    e.printStackTrace()
                }
            }

            Toast.makeText(
                context,
                "✓ Bill downloaded: Downloads/$fileName",
                Toast.LENGTH_LONG
            ).show()

            // Open with FileProvider for 100% reliable viewing across all Android versions
            try {
                val contentUri = androidx.core.content.FileProvider.getUriForFile(
                    context,
                    "${context.packageName}.fileprovider",
                    appFile
                )
                val viewIntent = Intent(Intent.ACTION_VIEW).apply {
                    setDataAndType(contentUri, "application/pdf")
                    addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
                }
                context.startActivity(viewIntent)
                return contentUri
            } catch (e: Exception) {
                // PDF reader not found; file is safely in Downloads
                return savedUri ?: Uri.fromFile(appFile)
            }
        } catch (e: Exception) {
            e.printStackTrace()
            Toast.makeText(
                context,
                "Failed to download bill: ${e.message ?: "Storage error"}",
                Toast.LENGTH_SHORT
            ).show()
            return null
        } finally {
            pdfDocument.close()
        }
    }
}
