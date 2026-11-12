package com.dactor.clinic.domain.util

import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Typeface
import android.graphics.pdf.PdfDocument
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import android.widget.Toast
import com.dactor.clinic.data.model.Appointment
import com.dactor.clinic.data.model.BillingInvoice
import com.dactor.clinic.data.model.InvoiceItem
import java.io.File
import java.io.FileOutputStream

/**
 * Generates an official PDF medical bill / receipt ONLY when explicitly requested by a user.
 */
object BillPdfDownloader {

    fun downloadBillPdf(
        context: Context,
        appointment: Appointment,
        invoice: BillingInvoice?,
        clinicName: String = "Dactor Partner Clinic",
        clinicAddress: String = "Kathmandu, Nepal",
        doctorName: String = "Attending Physician",
        clinicalRemarks: String? = null
    ) {
        try {
            val pdfDocument = PdfDocument()
            val pageInfo = PdfDocument.PageInfo.Builder(595, 842, 1).create() // A4 Portrait
            val page = pdfDocument.startPage(pageInfo)
            val canvas: Canvas = page.canvas

            val headerPaint = Paint().apply {
                color = Color.rgb(0, 121, 107)
                style = Paint.Style.FILL
            }
            val titlePaint = Paint().apply {
                color = Color.WHITE
                textSize = 20f
                typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
                isAntiAlias = true
            }
            val subHeaderPaint = Paint().apply {
                color = Color.rgb(224, 242, 241)
                textSize = 11f
                typeface = Typeface.create(Typeface.DEFAULT, Typeface.NORMAL)
                isAntiAlias = true
            }
            val sectionPaint = Paint().apply {
                color = Color.rgb(0, 121, 107)
                textSize = 13f
                typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
                isAntiAlias = true
            }
            val labelPaint = Paint().apply {
                color = Color.rgb(100, 116, 139)
                textSize = 11f
                typeface = Typeface.create(Typeface.DEFAULT, Typeface.NORMAL)
                isAntiAlias = true
            }
            val valuePaint = Paint().apply {
                color = Color.rgb(15, 23, 42)
                textSize = 11.5f
                typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
                isAntiAlias = true
            }
            val regularPaint = Paint().apply {
                color = Color.rgb(51, 65, 85)
                textSize = 11f
                typeface = Typeface.create(Typeface.DEFAULT, Typeface.NORMAL)
                isAntiAlias = true
            }
            val linePaint = Paint().apply {
                color = Color.rgb(226, 232, 240)
                strokeWidth = 1f
            }

            // 1. Top Banner
            canvas.drawRect(0f, 0f, 595f, 92f, headerPaint)
            canvas.drawText(clinicName.ifBlank { "Dactor Medical Clinic" }, 36f, 38f, titlePaint)
            canvas.drawText(clinicAddress.ifBlank { "Nepal" }, 36f, 56f, subHeaderPaint)
            canvas.drawText(
                "OFFICIAL MEDICAL BILL & PAYMENT LEDGER \u2022 CODE #${appointment.trackingCode10Digit}",
                36f,
                74f,
                subHeaderPaint
            )

            var y = 122f

            // 2. Patient & Consultation Details
            canvas.drawText("PATIENT & VISIT DETAILS", 36f, y, sectionPaint)
            y += 18f
            canvas.drawLine(36f, y - 10f, 559f, y - 10f, linePaint)

            canvas.drawText("Patient Name:", 36f, y, labelPaint)
            canvas.drawText(appointment.patientName, 130f, y, valuePaint)
            canvas.drawText("10-Digit Code:", 340f, y, labelPaint)
            canvas.drawText("#${appointment.trackingCode10Digit}", 430f, y, valuePaint)
            y += 18f

            val ageGender = listOfNotNull(
                appointment.patientAge?.let { "$it Yrs" },
                appointment.patientGender?.takeIf { it.isNotBlank() }
            ).joinToString(" / ").ifBlank { "N/A" }

            canvas.drawText("Age / Gender:", 36f, y, labelPaint)
            canvas.drawText(ageGender, 130f, y, valuePaint)
            canvas.drawText("Visit Date:", 340f, y, labelPaint)
            canvas.drawText("${appointment.appointmentDate} (${appointment.appointmentTime})", 430f, y, valuePaint)
            y += 18f

            canvas.drawText("Mobile:", 36f, y, labelPaint)
            canvas.drawText(appointment.patientMobile.ifBlank { "N/A" }, 130f, y, valuePaint)
            canvas.drawText("Doctor:", 340f, y, labelPaint)
            canvas.drawText(doctorName, 430f, y, valuePaint)
            y += 28f

            val effectivePaid = when {
                invoice != null && (invoice.paidAmount != null || invoice.totalAmount > 0.0) -> invoice.effectivePaidAmount
                appointment.paymentStatus.equals("paid", ignoreCase = true) -> appointment.effectiveTotalAmount
                else -> 0.0
            }
            val effectiveTotal = when {
                invoice != null && invoice.totalAmount > 0.0 -> maxOf(invoice.totalAmount, appointment.effectiveTotalAmount)
                effectivePaid > 0.0 -> effectivePaid
                appointment.effectiveTotalAmount > 0.0 -> appointment.effectiveTotalAmount
                else -> 0.0
            }

            val logSource = when {
                invoice?.remarks?.contains("<!--PAYMENT_LOG_START-->") == true -> invoice.remarks
                clinicalRemarks?.contains("<!--PAYMENT_LOG_START-->") == true -> clinicalRemarks
                !invoice?.remarks.isNullOrBlank() -> invoice.remarks
                else -> clinicalRemarks
            }
            val paymentLogs = PaymentLedgerHelper.parsePaymentRecords(logSource, effectivePaid, invoice?.paidAt)
            val cleanRemarks = PaymentLedgerHelper.extractCleanClinicalRemarks(
                if (!clinicalRemarks.isNullOrBlank() && !clinicalRemarks.contains("<!--PAYMENT_LOG_START-->")) clinicalRemarks else logSource
            )

            // 3. Itemized Services & Procedures Table
            canvas.drawText("SERVICES & PROCEDURES", 36f, y, sectionPaint)
            y += 14f

            val tableHeaderBg = Paint().apply {
                color = Color.rgb(241, 245, 249)
                style = Paint.Style.FILL
            }
            canvas.drawRect(36f, y, 559f, y + 22f, tableHeaderBg)
            canvas.drawText("Description / Service", 46f, y + 15f, valuePaint)
            canvas.drawText("Qty", 360f, y + 15f, valuePaint)
            canvas.drawText("Rate (NPR)", 415f, y + 15f, valuePaint)
            canvas.drawText("Amount (NPR)", 490f, y + 15f, valuePaint)
            y += 34f

            val cleanItems = invoice?.items?.filterNot { it.itemName.startsWith("Payment Received", ignoreCase = true) } ?: emptyList()
            val opdFee = appointment.feeAmount.takeIf { it > 0.0 } ?: 0.0
            val deskCharge = appointment.effectiveServiceCharge

            val items: List<InvoiceItem> = when {
                cleanItems.isNotEmpty() -> cleanItems
                opdFee > 0.0 && appointment.isPayAtDesk && deskCharge > 0.0 -> listOf(
                    InvoiceItem(itemName = "OPD Doctor Consultation (${appointment.appointmentDate})", quantity = 1, price = opdFee, total = opdFee),
                    InvoiceItem(itemName = "Pay at Desk Service Charge (5%)", quantity = 1, price = deskCharge, total = deskCharge)
                )
                opdFee > 0.0 -> listOf(InvoiceItem(itemName = "OPD Doctor Consultation (${appointment.appointmentDate})", quantity = 1, price = opdFee, total = opdFee))
                invoice != null && invoice.items.isNotEmpty() -> invoice.items
                else -> listOf(
                    InvoiceItem(
                        itemName = "OPD Doctor Consultation (${appointment.appointmentDate})",
                        quantity = 1,
                        price = effectiveTotal,
                        total = effectiveTotal
                    )
                )
            }

            val calculatedItemsTotal = items.sumOf { if (it.total > 0) it.total else (it.price * it.quantity) }
            val finalTotal = calculatedItemsTotal.takeIf { it > 0.0 } ?: effectiveTotal
            val balanceLeft = (finalTotal - effectivePaid).coerceAtLeast(0.0)

            for (item in items) {
                val rowTotal = if (item.total > 0) item.total else (item.price * item.quantity)
                val unitRate = if (item.price > 0) item.price else if (rowTotal > 0 && item.quantity > 0) rowTotal / item.quantity else 0.0
                canvas.drawText(item.itemName.take(48), 46f, y, regularPaint)
                canvas.drawText(item.quantity.toString(), 365f, y, regularPaint)
                canvas.drawText("Rs. ${unitRate.toInt()}", 415f, y, regularPaint)
                canvas.drawText("Rs. ${rowTotal.toInt()}", 490f, y, valuePaint)
                y += 16f
                canvas.drawLine(36f, y - 8f, 559f, y - 8f, linePaint)
            }

            y += 12f

            // 4. Payment Receipts & Time Log Table
            if (paymentLogs.isNotEmpty()) {
                canvas.drawText("PAYMENT RECEIPTS & TIME LOG", 36f, y, sectionPaint)
                y += 14f
                val logHeaderBg = Paint().apply {
                    color = Color.rgb(220, 252, 231)
                    style = Paint.Style.FILL
                }
                canvas.drawRect(36f, y, 559f, y + 22f, logHeaderBg)
                canvas.drawText("Date & Time Log", 46f, y + 15f, valuePaint)
                canvas.drawText("Note / Payment Mode", 260f, y + 15f, valuePaint)
                canvas.drawText("Paid (NPR)", 490f, y + 15f, valuePaint)
                y += 34f

                for (p in paymentLogs) {
                    val formattedDateTime = PaymentLedgerHelper.formatDisplayDateTime(p.dateTime)
                    canvas.drawText(formattedDateTime, 46f, y, regularPaint)
                    canvas.drawText((p.note ?: "Payment Received").take(32), 260f, y, regularPaint)
                    val paidTextPaint = Paint(valuePaint).apply { color = Color.rgb(21, 128, 61) }
                    canvas.drawText("Rs. ${p.amount.toInt()}", 490f, y, paidTextPaint)
                    y += 16f
                    canvas.drawLine(36f, y - 8f, 559f, y - 8f, linePaint)
                }
                y += 12f
            }

            // 5. Financial Summary Box (Total Bill, Paid, Remaining Balance)
            val summaryBoxPaint = Paint().apply {
                color = Color.rgb(240, 253, 250)
                style = Paint.Style.FILL
            }
            canvas.drawRect(310f, y, 559f, y + 76f, summaryBoxPaint)

            canvas.drawText("Total Bill Amount:", 324f, y + 20f, labelPaint)
            canvas.drawText("Rs. ${finalTotal.toInt()}", 475f, y + 20f, valuePaint)

            val paidPaint = Paint(valuePaint).apply { color = Color.rgb(21, 128, 61) }
            canvas.drawText("Total Paid by Patient:", 324f, y + 42f, labelPaint)
            canvas.drawText("Rs. ${effectivePaid.toInt()}", 475f, y + 42f, paidPaint)

            val leftPaint = Paint(valuePaint).apply {
                color = if (balanceLeft > 0.0) Color.rgb(185, 28, 28) else Color.rgb(21, 128, 61)
            }
            canvas.drawText("Remaining Balance:", 324f, y + 64f, labelPaint)
            canvas.drawText("Rs. ${balanceLeft.toInt()}", 475f, y + 64f, leftPaint)

            y += 92f

            // 6. Clinical Remarks (clean)
            if (cleanRemarks.isNotBlank()) {
                canvas.drawText("CLINICAL REMARKS & NOTES", 36f, y, sectionPaint)
                y += 16f
                val words = cleanRemarks.split(" ")
                var currentLine = ""
                for (w in words) {
                    val testLine = if (currentLine.isEmpty()) w else "$currentLine $w"
                    if (regularPaint.measureText(testLine) > 495f) {
                        canvas.drawText(currentLine, 44f, y, regularPaint)
                        y += 15f
                        currentLine = w
                    } else {
                        currentLine = testLine
                    }
                }
                if (currentLine.isNotEmpty()) {
                    canvas.drawText(currentLine, 44f, y, regularPaint)
                }
            }

            // Footer
            canvas.drawLine(36f, 790f, 559f, 790f, linePaint)
            canvas.drawText(
                "Generated on request via Dactor Nepal \u2022 Computer Generated Official Receipt",
                36f,
                810f,
                labelPaint
            )

            pdfDocument.finishPage(page)

            val cleanCode = appointment.trackingCode10Digit.ifBlank { appointment.id.take(8) }
            val fileName = "Dactor_Bill_${cleanCode}_${System.currentTimeMillis() % 100000}.pdf"

            // Save to app external files dir first (for guaranteed FileProvider sharing)
            val appDownloadDir = context.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS)
                ?: File(context.filesDir, "downloads").apply { mkdirs() }
            val appFile = File(appDownloadDir, fileName)
            FileOutputStream(appFile).use { out ->
                pdfDocument.writeTo(out)
            }

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
                } catch (e: Exception) {
                    e.printStackTrace()
                }
            }

            pdfDocument.close()

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
            } catch (e: Exception) {
                // PDF reader not found; file is safely in Downloads
            }
        } catch (e: Exception) {
            e.printStackTrace()
            Toast.makeText(context, "Unable to generate PDF bill: ${e.message}", Toast.LENGTH_SHORT).show()
        }
    }

    fun downloadPaymentStatementPdf(
        context: Context,
        clinicName: String,
        clinicAddress: String,
        periodLabel: String,
        logs: List<com.dactor.clinic.data.model.UnifiedPaymentLogEntry>
    ) {
        try {
            val gross = logs.sumOf { it.amount }
            val followups = logs.count { !it.isNewPatientForDoctor }
            val newPatients = logs.count { it.isNewPatientForDoctor }
            val platformCut = kotlin.math.round(gross * 0.05)
            val netPayout = gross - platformCut

            val pdfDocument = PdfDocument()
            val pageInfo = PdfDocument.PageInfo.Builder(595, 842, 1).create() // A4 Portrait
            val page = pdfDocument.startPage(pageInfo)
            val canvas: Canvas = page.canvas

            val headerPaint = Paint().apply {
                color = Color.rgb(13, 148, 136) // Medical Teal #0D9488
                style = Paint.Style.FILL
            }
            val titlePaint = Paint().apply {
                color = Color.WHITE
                textSize = 18f
                typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
                isAntiAlias = true
            }
            val subHeaderPaint = Paint().apply {
                color = Color.rgb(204, 251, 241)
                textSize = 10.5f
                typeface = Typeface.create(Typeface.DEFAULT, Typeface.NORMAL)
                isAntiAlias = true
            }
            val cardBgPaint = Paint().apply {
                color = Color.rgb(248, 250, 252)
                style = Paint.Style.FILL
            }
            val cardBorderPaint = Paint().apply {
                color = Color.rgb(226, 232, 240)
                style = Paint.Style.STROKE
                strokeWidth = 1f
            }
            val labelPaint = Paint().apply {
                color = Color.rgb(100, 116, 139)
                textSize = 9.5f
                typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
                isAntiAlias = true
            }
            val valuePaint = Paint().apply {
                color = Color.rgb(15, 23, 42)
                textSize = 12f
                typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
                isAntiAlias = true
            }
            val boldValuePaint = Paint().apply {
                color = Color.rgb(13, 148, 136)
                textSize = 13f
                typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
                isAntiAlias = true
            }
            val textPaint = Paint().apply {
                color = Color.rgb(51, 65, 85)
                textSize = 9.5f
                typeface = Typeface.create(Typeface.DEFAULT, Typeface.NORMAL)
                isAntiAlias = true
            }
            val linePaint = Paint().apply {
                color = Color.rgb(226, 232, 240)
                strokeWidth = 1f
            }

            // Top Header
            canvas.drawRect(0f, 0f, 595f, 85f, headerPaint)
            canvas.drawText(clinicName.ifBlank { "Dactor Medical Clinic" }, 36f, 32f, titlePaint)
            canvas.drawText(clinicAddress.ifBlank { "Kathmandu, Nepal" }, 36f, 48f, subHeaderPaint)
            canvas.drawText("OFFICIAL FINANCIAL AUDIT STATEMENT \u2022 $periodLabel", 36f, 66f, subHeaderPaint)

            var y = 108f

            // Summary 4-Box Metric Row
            val boxW = 122f
            val boxH = 48f
            val startX = 36f
            val gap = 12f

            // Box 1: Gross Collections
            var curX = startX
            canvas.drawRoundRect(curX, y, curX + boxW, y + boxH, 8f, 8f, cardBgPaint)
            canvas.drawRoundRect(curX, y, curX + boxW, y + boxH, 8f, 8f, cardBorderPaint)
            canvas.drawText("GROSS COLLECTIONS", curX + 8f, y + 16f, labelPaint)
            canvas.drawText("Rs. ${gross.toInt()}", curX + 8f, y + 36f, boldValuePaint)

            // Box 2: Free Follow-ups
            curX += boxW + gap
            canvas.drawRoundRect(curX, y, curX + boxW, y + boxH, 8f, 8f, cardBgPaint)
            canvas.drawRoundRect(curX, y, curX + boxW, y + boxH, 8f, 8f, cardBorderPaint)
            canvas.drawText("FREE FOLLOW-UPS", curX + 8f, y + 16f, labelPaint)
            canvas.drawText("$followups (Rs. 0)", curX + 8f, y + 36f, valuePaint)

            // Box 3: New Patients
            curX += boxW + gap
            canvas.drawRoundRect(curX, y, curX + boxW, y + boxH, 8f, 8f, cardBgPaint)
            canvas.drawRoundRect(curX, y, curX + boxW, y + boxH, 8f, 8f, cardBorderPaint)
            canvas.drawText("NEW PATIENTS", curX + 8f, y + 16f, labelPaint)
            canvas.drawText("+$newPatients Seen", curX + 8f, y + 36f, valuePaint)

            // Box 4: Net Payout
            curX += boxW + gap
            canvas.drawRoundRect(curX, y, curX + boxW, y + boxH, 8f, 8f, cardBgPaint)
            canvas.drawRoundRect(curX, y, curX + boxW, y + boxH, 8f, 8f, cardBorderPaint)
            canvas.drawText("NET CLINIC (95%)", curX + 8f, y + 16f, labelPaint)
            canvas.drawText("Rs. ${netPayout.toInt()}", curX + 8f, y + 36f, valuePaint)

            y += boxH + 24f

            // Section: Table Header
            val tableHdrPaint = Paint().apply {
                color = Color.rgb(241, 245, 249)
                style = Paint.Style.FILL
            }
            canvas.drawRect(36f, y, 559f, y + 22f, tableHdrPaint)
            canvas.drawLine(36f, y, 559f, y, linePaint)
            canvas.drawLine(36f, y + 22f, 559f, y + 22f, linePaint)

            val colToken = 38f
            val colDate = 100f
            val colPatient = 180f
            val colDoctor = 295f
            val colVisitType = 390f
            val colMethod = 465f
            val colAmount = 555f

            canvas.drawText("TOKEN", colToken, y + 15f, labelPaint)
            canvas.drawText("DATE & TIME", colDate, y + 15f, labelPaint)
            canvas.drawText("PATIENT NAME", colPatient, y + 15f, labelPaint)
            canvas.drawText("ATTENDING DOCTOR", colDoctor, y + 15f, labelPaint)
            canvas.drawText("VISIT TYPE", colVisitType, y + 15f, labelPaint)
            canvas.drawText("MODE", colMethod, y + 15f, labelPaint)

            val amountHdrPaint = Paint(labelPaint).apply { textAlign = Paint.Align.RIGHT }
            canvas.drawText("AMOUNT (NPR)", colAmount, y + 15f, amountHdrPaint)

            y += 24f

            // Table Rows
            val maxRowsOnPage = 26
            val displayedLogs = logs.take(maxRowsOnPage)
            val amountValPaint = Paint(textPaint).apply {
                textAlign = Paint.Align.RIGHT
                typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
            }

            for (log in displayedLogs) {
                val rowY = y + 14f
                val token = log.trackingCode10Digit ?: "\u2013"
                val dateStr = log.dateTime.take(16).replace("T", " ")
                val pName = if (log.patientName.length > 18) log.patientName.take(16) + ".." else log.patientName
                val dName = if (log.doctorName.length > 15) log.doctorName.take(13) + ".." else log.doctorName
                val vType = if (log.isNewPatientForDoctor) "NEW" else "FOLLOW-UP (FREE)"
                val method = log.paymentMethod

                canvas.drawText("#$token", colToken, rowY, textPaint)
                canvas.drawText(dateStr, colDate, rowY, textPaint)
                canvas.drawText(pName, colPatient, rowY, textPaint)
                canvas.drawText(dName, colDoctor, rowY, textPaint)
                canvas.drawText(vType, colVisitType, rowY, textPaint)
                canvas.drawText(method, colMethod, rowY, textPaint)

                val amtText = if (log.amount == 0.0) "Rs. 0 (Free)" else "Rs. ${log.amount.toInt()}"
                canvas.drawText(amtText, colAmount, rowY, amountValPaint)

                canvas.drawLine(36f, y + 20f, 559f, y + 20f, linePaint)
                y += 20f
            }

            if (logs.size > maxRowsOnPage) {
                y += 10f
                canvas.drawText("+ ${logs.size - maxRowsOnPage} more transactions included in full CSV export file.", 36f, y, labelPaint)
            }

            // Footer
            val footerY = 820f
            canvas.drawLine(36f, footerY - 14f, 559f, footerY - 14f, linePaint)
            canvas.drawText(
                "Generated by Dactor Platform \u2022 System Verified Audit Copy \u2022 Follow-up consultations verified at 0 NPR",
                36f,
                footerY,
                Paint().apply {
                    color = Color.rgb(148, 163, 184)
                    textSize = 8.5f
                    isAntiAlias = true
                }
            )

            pdfDocument.finishPage(page)

            // Save PDF to Downloads
            val cleanPeriod = periodLabel.replace(Regex("[^a-zA-Z0-9_-]"), "_")
            val fileName = "Dactor_Financial_Statement_${cleanPeriod}_${System.currentTimeMillis()}.pdf"
            val appFile = File(context.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS), fileName)
            FileOutputStream(appFile).use { out ->
                pdfDocument.writeTo(out)
            }
            pdfDocument.close()

            // Copy to Public Downloads
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                val contentValues = ContentValues().apply {
                    put(MediaStore.MediaColumns.DISPLAY_NAME, fileName)
                    put(MediaStore.MediaColumns.MIME_TYPE, "application/pdf")
                    put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS)
                }
                val uri = context.contentResolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, contentValues)
                if (uri != null) {
                    context.contentResolver.openOutputStream(uri)?.use { out ->
                        appFile.inputStream().copyTo(out)
                    }
                }
            }

            Toast.makeText(context, "✓ Financial Statement PDF saved to Downloads", Toast.LENGTH_SHORT).show()

            // Open Viewer
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
            } catch (_: Exception) {}
        } catch (e: Exception) {
            e.printStackTrace()
            Toast.makeText(context, "Failed to generate statement PDF: ${e.message}", Toast.LENGTH_SHORT).show()
        }
    }
}
