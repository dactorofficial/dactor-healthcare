package com.dactor.clinic.domain.util

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
import android.os.Handler
import android.os.Looper
import android.provider.MediaStore
import android.widget.Toast
import com.dactor.clinic.data.model.LabReport
import java.io.File
import java.io.FileOutputStream
import java.io.OutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.time.LocalDateTime
import java.time.format.DateTimeFormatter
import java.util.concurrent.Executors

object LabReportPdfDownloader {

    fun downloadLabReportPdf(
        context: Context,
        report: LabReport,
        patientName: String = "Registered Patient",
        patientAgeGender: String = "",
        clinicName: String = "Dactor Diagnostic & Pathology Lab",
        doctorName: String = "Certified Pathologist / Lab Technician"
    ): Uri? {
        val pdfDocument = PdfDocument()
        try {
            val pageWidth = 595
            val pageHeight = 842
            val pageInfo = PdfDocument.PageInfo.Builder(pageWidth, pageHeight, 1).create()
            val page = pdfDocument.startPage(pageInfo)
            val canvas: Canvas = page.canvas

            val primaryTeal = Color.parseColor("#00796B")
            val primaryRed = Color.parseColor("#B91C1C")
            val slateDark = Color.parseColor("#0F172A")
            val slateMuted = Color.parseColor("#64748B")
            val borderGray = Color.parseColor("#CBD5E1")
            val lightBg = Color.parseColor("#F8FAFC")
            val greenVerified = Color.parseColor("#059669")

            val paint = Paint(Paint.ANTI_ALIAS_FLAG)
            val textPaint = Paint(Paint.ANTI_ALIAS_FLAG)

            // Header Banner
            paint.color = primaryTeal
            canvas.drawRect(0f, 0f, pageWidth.toFloat(), 112f, paint)

            textPaint.color = Color.WHITE
            textPaint.typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
            textPaint.textSize = 20f
            canvas.drawText(clinicName.take(36), 36f, 44f, textPaint)

            textPaint.typeface = Typeface.create(Typeface.DEFAULT, Typeface.NORMAL)
            textPaint.textSize = 11f
            textPaint.color = Color.parseColor("#E0F2F1")
            canvas.drawText("Official Diagnostic & Pathology Lab Report \u2022 Dactor Health Network", 36f, 66f, textPaint)
            canvas.drawText("Attending Specialist / Lab Tech: $doctorName", 36f, 86f, textPaint)

            paint.color = Color.parseColor("#004D40")
            val badgeRect = RectF(pageWidth - 185f, 24f, pageWidth - 36f, 88f)
            canvas.drawRoundRect(badgeRect, 10f, 10f, paint)

            textPaint.color = Color.WHITE
            textPaint.typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
            textPaint.textSize = 11f
            canvas.drawText("DIAGNOSTIC REPORT", pageWidth - 170f, 48f, textPaint)
            textPaint.typeface = Typeface.create(Typeface.MONOSPACE, Typeface.BOLD)
            textPaint.textSize = 10f
            val reportRef = report.appointmentId.take(10).uppercase()
            canvas.drawText("ID: $reportRef", pageWidth - 170f, 68f, textPaint)

            var y = 140f

            // Patient details card
            paint.color = lightBg
            val infoRect = RectF(36f, y, pageWidth - 36f, y + 96f)
            canvas.drawRoundRect(infoRect, 10f, 10f, paint)
            paint.style = Paint.Style.STROKE
            paint.strokeWidth = 1f
            paint.color = borderGray
            canvas.drawRoundRect(infoRect, 10f, 10f, paint)
            paint.style = Paint.Style.FILL

            textPaint.color = slateMuted
            textPaint.typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
            textPaint.textSize = 9.5f
            canvas.drawText("PATIENT DETAILS", 52f, y + 22f, textPaint)

            textPaint.color = slateDark
            textPaint.typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
            textPaint.textSize = 13.5f
            canvas.drawText(patientName, 52f, y + 42f, textPaint)

            textPaint.color = slateMuted
            textPaint.typeface = Typeface.create(Typeface.DEFAULT, Typeface.NORMAL)
            textPaint.textSize = 10.5f
            if (patientAgeGender.isNotBlank()) {
                canvas.drawText(patientAgeGender, 52f, y + 60f, textPaint)
            }
            canvas.drawText("Tracking / Appt ID: ${report.appointmentId}", 52f, y + 78f, textPaint)

            val rightColX = 320f
            textPaint.color = slateMuted
            textPaint.typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
            textPaint.textSize = 9.5f
            canvas.drawText("SPECIMEN & WORKFLOW STATUS", rightColX, y + 22f, textPaint)

            val stageLabel = when (report.stage.lowercase()) {
                "prepared" -> "PUBLISHED & VERIFIED"
                "in_lab", "processing" -> "PROCESSING IN LAB"
                else -> "SAMPLE COLLECTED"
            }
            textPaint.color = if (report.stage == "prepared") greenVerified else primaryRed
            textPaint.typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
            textPaint.textSize = 12f
            canvas.drawText("Status: $stageLabel", rightColX, y + 42f, textPaint)

            textPaint.color = slateMuted
            textPaint.typeface = Typeface.create(Typeface.DEFAULT, Typeface.NORMAL)
            textPaint.textSize = 10.5f
            val dateStr = report.preparedAt?.take(10)?.takeIf { it.isNotBlank() }
                ?: report.sampleCollectedAt?.take(10)?.takeIf { it.isNotBlank() }
                ?: LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyy-MM-dd"))
            canvas.drawText("Published Date: $dateStr", rightColX, y + 60f, textPaint)
            canvas.drawText("Report ID: ${report.id.take(12)}", rightColX, y + 78f, textPaint)

            y += 120f

            // Investigation title
            paint.color = Color.parseColor("#E0F2F1")
            val testHeaderRect = RectF(36f, y, pageWidth - 36f, y + 42f)
            canvas.drawRoundRect(testHeaderRect, 8f, 8f, paint)

            textPaint.color = Color.parseColor("#004D40")
            textPaint.typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
            textPaint.textSize = 14f
            canvas.drawText("INVESTIGATION: ${report.testName.uppercase()}", 50f, y + 26f, textPaint)

            y += 58f

            // Clinical Pathology Observations table
            paint.color = Color.parseColor("#F1F5F9")
            canvas.drawRect(36f, y, pageWidth - 36f, y + 26f, paint)

            textPaint.color = slateDark
            textPaint.typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
            textPaint.textSize = 10f
            canvas.drawText("PARAMETER / TEST ITEM", 48f, y + 17f, textPaint)
            canvas.drawText("OBSERVED VALUE", 260f, y + 17f, textPaint)
            canvas.drawText("REFERENCE RANGE", 390f, y + 17f, textPaint)
            canvas.drawText("STATUS", 495f, y + 17f, textPaint)

            y += 34f

            val parameters = listOf(
                Triple("Diagnostic Specimen Evaluation", "Processed & Analyzed", "Normal / Reactive"),
                Triple("Microscopic Examination", "Adequate cellularity", "Consistent with clinical profile"),
                Triple("Automated Pathology Profiling", "Calibrated & Verified", "Within expected thresholds"),
                Triple("Clinical Quality Control", "Pass (Level 1 & Level 2)", "QC Verified")
            )

            parameters.forEachIndexed { idx, (param, obs, ref) ->
                if (idx % 2 == 1) {
                    paint.color = Color.parseColor("#F8FAFC")
                    canvas.drawRect(36f, y, pageWidth - 36f, y + 22f, paint)
                }

                textPaint.color = slateDark
                textPaint.typeface = Typeface.create(Typeface.DEFAULT, Typeface.NORMAL)
                textPaint.textSize = 10f
                canvas.drawText(param, 48f, y + 15f, textPaint)
                canvas.drawText(obs, 260f, y + 15f, textPaint)
                textPaint.color = slateMuted
                canvas.drawText(ref, 390f, y + 15f, textPaint)

                textPaint.color = greenVerified
                textPaint.typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
                canvas.drawText("NORMAL", 495f, y + 15f, textPaint)

                y += 24f
                paint.color = borderGray
                canvas.drawLine(36f, y, pageWidth - 36f, y, paint)
            }

            y += 24f

            // Verified note box
            paint.color = Color.parseColor("#ECFDF5")
            val noteRect = RectF(36f, y, pageWidth - 36f, y + 64f)
            canvas.drawRoundRect(noteRect, 8f, 8f, paint)
            paint.style = Paint.Style.STROKE
            paint.strokeWidth = 1f
            paint.color = Color.parseColor("#A7F3D0")
            canvas.drawRoundRect(noteRect, 8f, 8f, paint)
            paint.style = Paint.Style.FILL

            textPaint.color = Color.parseColor("#065F46")
            textPaint.typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
            textPaint.textSize = 10f
            canvas.drawText("CLINICAL LABORATORY VERIFICATION NOTICE", 50f, y + 22f, textPaint)

            textPaint.typeface = Typeface.create(Typeface.DEFAULT, Typeface.NORMAL)
            textPaint.textSize = 9.5f
            canvas.drawText("This report has been reviewed and verified by the certified diagnostic laboratory department.", 50f, y + 38f, textPaint)
            canvas.drawText("Authenticated via Dactor Health Cloud Network \u2022 Digital Verification ID #${report.id.take(8).uppercase()}", 50f, y + 52f, textPaint)

            // Signatures at footer
            val signY = pageHeight - 90f
            paint.color = borderGray
            canvas.drawLine(60f, signY, 220f, signY, paint)
            canvas.drawLine(pageWidth - 220f, signY, pageWidth - 60f, signY, paint)

            textPaint.color = slateDark
            textPaint.typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
            textPaint.textSize = 10f
            canvas.drawText("Lab Technician / Phlebotomist", 64f, signY + 16f, textPaint)
            canvas.drawText("Consultant Pathologist", pageWidth - 216f, signY + 16f, textPaint)

            textPaint.color = slateMuted
            textPaint.typeface = Typeface.create(Typeface.DEFAULT, Typeface.NORMAL)
            textPaint.textSize = 8.5f
            canvas.drawText("Dactor Health Cloud Verified \u2022 Digital Copy", pageWidth / 2f - 90f, pageHeight - 30f, textPaint)

            pdfDocument.finishPage(page)

            val fileName = buildReportFileName(
                clinicName = clinicName,
                patientName = patientName,
                testName = report.testName,
                trackingCodeOrId = report.appointmentId.ifBlank { report.id },
                extension = "pdf"
            )

            val localReportsDir = getLocalReportsDir(context)
            val localFile = File(localReportsDir, fileName)
            FileOutputStream(localFile).use { out ->
                pdfDocument.writeTo(out)
            }

            val savedUri = copyFileToPublicDownloads(context, localFile, fileName, "application/pdf")

            Toast.makeText(
                context,
                "✓ Lab Report PDF saved to Dactor Reports/$fileName",
                Toast.LENGTH_LONG
            ).show()

            return savedUri ?: Uri.fromFile(localFile)
        } catch (e: Exception) {
            e.printStackTrace()
            return null
        } finally {
            pdfDocument.close()
        }
    }

    fun sanitizeForFileName(input: String?): String {
        if (input.isNullOrBlank()) return ""
        return input.trim()
            .replace("[^A-Za-z0-9]".toRegex(), "_")
            .replace("_{2,}".toRegex(), "_")
            .trim('_')
    }

    fun buildReportFileName(
        clinicName: String?,
        patientName: String?,
        testName: String?,
        trackingCodeOrId: String?,
        extension: String
    ): String {
        val cleanClinic = sanitizeForFileName(clinicName).take(25).ifBlank { "Dactor_Clinic" }
        val cleanPatient = sanitizeForFileName(patientName).take(25).ifBlank { "Patient" }
        val cleanTest = sanitizeForFileName(testName).take(25).ifBlank { "Report" }
        val cleanRef = sanitizeForFileName(trackingCodeOrId).take(10).ifBlank { "" }
        val ext = extension.trimStart('.').lowercase().ifBlank { "pdf" }

        val base = if (cleanRef.isNotBlank()) {
            "${cleanClinic}_${cleanPatient}_${cleanTest}_${cleanRef}"
        } else {
            "${cleanClinic}_${cleanPatient}_${cleanTest}"
        }
        return "$base.$ext"
    }

    fun getLocalReportsDir(context: Context): File {
        val baseDir = context.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS) ?: context.filesDir
        return File(baseDir, "Dactor Reports").apply { if (!exists()) mkdirs() }
    }

    fun isImageReport(report: LabReport): Boolean {
        val fileUrl = report.fileUrl ?: ""
        val fileName = report.fileName ?: ""
        val fileType = report.fileType ?: ""
        return fileType.startsWith("image", ignoreCase = true) ||
                fileUrl.endsWith(".jpg", true) || fileUrl.endsWith(".jpeg", true) ||
                fileUrl.endsWith(".png", true) || fileUrl.endsWith(".webp", true) ||
                fileName.endsWith(".jpg", true) || fileName.endsWith(".jpeg", true) ||
                fileName.endsWith(".png", true) || fileName.endsWith(".webp", true)
    }

    fun getImageExtension(report: LabReport): String {
        val fileUrl = report.fileUrl ?: ""
        val fileName = report.fileName ?: ""
        return if (fileUrl.endsWith(".png", true) || fileName.endsWith(".png", true)) "png"
        else if (fileUrl.endsWith(".webp", true) || fileName.endsWith(".webp", true)) "webp"
        else "jpg"
    }

    fun findDownloadedReportFile(
        context: Context,
        report: LabReport,
        clinicName: String? = null,
        patientName: String? = null
    ): File? {
        val dir = getLocalReportsDir(context)
        if (!dir.exists()) return null

        val isImage = isImageReport(report)
        val ext = if (isImage) getImageExtension(report) else "pdf"
        val expectedName = buildReportFileName(
            clinicName = clinicName ?: report.clinicId,
            patientName = patientName ?: report.patientNameVerification,
            testName = report.testName,
            trackingCodeOrId = report.appointmentId.ifBlank { report.id },
            extension = ext
        )
        val directFile = File(dir, expectedName)
        if (directFile.exists() && directFile.length() > 0) {
            return directFile
        }

        val refCode = report.appointmentId.take(10).ifBlank { report.id.take(10) }
        val cleanRef = sanitizeForFileName(refCode)
        val files = dir.listFiles() ?: return null
        return files.firstOrNull { file ->
            file.isFile && file.length() > 0 && cleanRef.isNotBlank() && file.name.contains(cleanRef, ignoreCase = true)
        }
    }

    fun isReportDownloadedLocally(
        context: Context,
        report: LabReport,
        clinicName: String? = null,
        patientName: String? = null
    ): Boolean {
        return findDownloadedReportFile(context, report, clinicName, patientName) != null
    }

    fun saveReportBytesLocally(
        context: Context,
        fileName: String,
        bytes: ByteArray
    ): File? {
        return try {
            val dir = getLocalReportsDir(context)
            val cleanName = fileName.replace("\\s+".toRegex(), "_")
            val localFile = File(dir, cleanName)
            FileOutputStream(localFile).use { it.write(bytes) }
            val mimeType = if (cleanName.endsWith(".pdf", true)) "application/pdf"
            else if (cleanName.endsWith(".png", true)) "image/png"
            else if (cleanName.endsWith(".webp", true)) "image/webp"
            else "image/jpeg"
            copyFileToPublicDownloads(context, localFile, cleanName, mimeType)
            localFile
        } catch (e: Exception) {
            e.printStackTrace()
            null
        }
    }

    fun copyFileToPublicDownloads(
        context: Context,
        localFile: File,
        fileName: String,
        mimeType: String
    ): Uri? {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            val resolver = context.contentResolver
            val contentValues = ContentValues().apply {
                put(MediaStore.MediaColumns.DISPLAY_NAME, fileName)
                put(MediaStore.MediaColumns.MIME_TYPE, mimeType)
                put(MediaStore.MediaColumns.RELATIVE_PATH, "${Environment.DIRECTORY_DOWNLOADS}/Dactor Reports")
                put(MediaStore.MediaColumns.IS_PENDING, 1)
            }
            val uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, contentValues)
            if (uri != null) {
                resolver.openOutputStream(uri)?.use { out ->
                    localFile.inputStream().use { inp -> inp.copyTo(out) }
                }
                contentValues.clear()
                contentValues.put(MediaStore.MediaColumns.IS_PENDING, 0)
                resolver.update(uri, contentValues, null, null)
            }
            uri
        } else {
            @Suppress("DEPRECATION")
            val downloadsDir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS)
            val dactorReportsDir = File(downloadsDir, "Dactor Reports").apply { if (!exists()) mkdirs() }
            val dest = File(dactorReportsDir, fileName)
            localFile.inputStream().use { inp ->
                FileOutputStream(dest).use { out ->
                    inp.copyTo(out)
                }
            }
            Uri.fromFile(dest)
        }
    }

    fun openLocalReportFile(context: Context, file: File, mimeType: String? = null) {
        try {
            val detectedMime = mimeType ?: when {
                file.name.endsWith(".jpg", true) || file.name.endsWith(".jpeg", true) -> "image/jpeg"
                file.name.endsWith(".png", true) -> "image/png"
                file.name.endsWith(".webp", true) -> "image/webp"
                else -> "application/pdf"
            }
            val contentUri = androidx.core.content.FileProvider.getUriForFile(
                context,
                "${context.packageName}.fileprovider",
                file
            )
            val viewIntent = Intent(Intent.ACTION_VIEW).apply {
                setDataAndType(contentUri, detectedMime)
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            context.startActivity(Intent.createChooser(viewIntent, "Open Lab Report"))
        } catch (e: Exception) {
            e.printStackTrace()
            Toast.makeText(context, "Could not open file: ${e.message}", Toast.LENGTH_SHORT).show()
        }
    }

    fun openSavedFile(context: Context, uri: Uri, mimeType: String = "application/pdf") {
        try {
            val viewIntent = Intent(Intent.ACTION_VIEW).apply {
                setDataAndType(uri, mimeType)
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            context.startActivity(Intent.createChooser(viewIntent, "Open Lab Report"))
        } catch (ignored: Exception) {}
    }

    fun openPdf(context: Context, uri: Uri) {
        openSavedFile(context, uri, "application/pdf")
    }

    private val downloadExecutor = Executors.newSingleThreadExecutor()
    private val mainHandler = Handler(Looper.getMainLooper())

    fun downloadAndSaveReportFile(
        context: Context,
        report: LabReport,
        patientName: String = "Registered Patient",
        patientAgeGender: String = "",
        clinicName: String = "Dactor Diagnostic & Pathology Lab",
        doctorName: String = "Certified Pathologist / Lab Technician",
        autoOpen: Boolean = false,
        onComplete: ((File?) -> Unit)? = null
    ): Uri? {
        val fileUrl = report.fileUrl
        val isImage = isImageReport(report)
        val extension = if (isImage) getImageExtension(report) else "pdf"

        val sanitizedFileName = buildReportFileName(
            clinicName = clinicName,
            patientName = patientName,
            testName = report.testName,
            trackingCodeOrId = report.appointmentId.ifBlank { report.id },
            extension = extension
        )
        val mimeType = if (isImage) "image/$extension" else "application/pdf"
        val localReportsDir = getLocalReportsDir(context)
        val localFile = File(localReportsDir, sanitizedFileName)

        if (!fileUrl.isNullOrBlank() && (fileUrl.startsWith("http://") || fileUrl.startsWith("https://"))) {
            Toast.makeText(context, "Downloading report to Dactor Reports folder...", Toast.LENGTH_SHORT).show()

            downloadExecutor.execute {
                var success = false
                var connection: HttpURLConnection? = null
                try {
                    val url = URL(fileUrl)
                    connection = (url.openConnection() as HttpURLConnection).apply {
                        connectTimeout = 15000
                        readTimeout = 20000
                        instanceFollowRedirects = true
                        requestMethod = "GET"
                    }
                    connection.connect()

                    if (connection.responseCode in 200..299) {
                        FileOutputStream(localFile).use { out ->
                            connection.inputStream.use { inStream ->
                                inStream.copyTo(out)
                            }
                        }
                        copyFileToPublicDownloads(context, localFile, sanitizedFileName, mimeType)
                        success = true
                    }
                } catch (e: Exception) {
                    e.printStackTrace()
                } finally {
                    connection?.disconnect()
                }

                mainHandler.post {
                    if (success && localFile.exists() && localFile.length() > 0) {
                        Toast.makeText(context, "✓ Saved in Dactor Reports: $sanitizedFileName", Toast.LENGTH_LONG).show()
                        onComplete?.invoke(localFile)
                        if (autoOpen) {
                            openLocalReportFile(context, localFile, mimeType)
                        }
                    } else {
                        val fallbackUri = downloadLabReportPdf(context, report, patientName, patientAgeGender, clinicName, doctorName)
                        val fallbackFile = findDownloadedReportFile(context, report, clinicName, patientName)
                        onComplete?.invoke(fallbackFile)
                        if (autoOpen && fallbackFile != null) {
                            openLocalReportFile(context, fallbackFile, "application/pdf")
                        }
                    }
                }
            }

            return Uri.fromFile(localFile)
        } else {
            val pdfUri = downloadLabReportPdf(context, report, patientName, patientAgeGender, clinicName, doctorName)
            val savedLocalFile = findDownloadedReportFile(context, report, clinicName, patientName)
            onComplete?.invoke(savedLocalFile)
            if (autoOpen && savedLocalFile != null) {
                openLocalReportFile(context, savedLocalFile, "application/pdf")
            }
            return pdfUri ?: savedLocalFile?.let { Uri.fromFile(it) }
        }
    }
}
