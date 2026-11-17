package com.dactor.clinic.domain.util

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.ColorMatrix
import android.graphics.ColorMatrixColorFilter
import android.graphics.Paint
import android.graphics.pdf.PdfRenderer
import android.net.Uri
import android.os.ParcelFileDescriptor
import android.provider.OpenableColumns
import android.webkit.MimeTypeMap
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.ByteArrayOutputStream
import java.io.File
import java.util.Locale
import kotlin.math.max
import kotlin.math.roundToInt

data class CompressedFileResult(
    val bytes: ByteArray,
    val fileName: String,
    val originalSizeBytes: Int,
    val compressedSizeBytes: Int,
    val wasCompressed: Boolean,
    val targetCapBytes: Int = FileCompressor.MAX_FILE_SIZE_BYTES,
    val pageCount: Int = 1
) {
    val formattedSummary: String
        get() {
            val capLabel = "≤ ${FileCompressor.formatSize(targetCapBytes)}"
            val pagesLabel = if (pageCount > 1) " • $pageCount pages" else ""
            return if (wasCompressed && compressedSizeBytes < originalSizeBytes) {
                "${FileCompressor.formatSize(originalSizeBytes)} → ${FileCompressor.formatSize(compressedSizeBytes)} ($capLabel$pagesLabel)"
            } else {
                "${FileCompressor.formatSize(compressedSizeBytes)} ($capLabel$pagesLabel)"
            }
        }
}

/**
 * Compresses images and document files before uploading to Supabase Storage
 * to save cloud storage bandwidth and space.
 * Supports multi-picture to PDF conversion for diagnostic lab reports, X-rays,
 * and pathology panels with strict <= 100 KB optimization.
 */
object FileCompressor {

    const val MAX_FILE_SIZE_BYTES = 300 * 1024 // 300 KB strict ceiling for general documents
    const val LAB_REPORT_MAX_BYTES = 100 * 1024 // 100 KB strict ceiling for diagnostic lab & X-ray reports
    private const val PREFERRED_TARGET_BYTES = 220 * 1024 // 220 KB preferred target
    private const val MAX_INITIAL_DIMENSION = 1440

    fun formatSize(bytes: Int): String {
        return when {
            bytes >= 1024 * 1024 -> String.format(Locale.US, "%.2f MB", bytes / (1024f * 1024f))
            bytes >= 1024 -> "${(bytes / 1024.0).roundToInt().coerceAtLeast(1)} KB"
            else -> "$bytes B"
        }
    }

    /**
     * Stitches multiple selected images (or an individual photo) into a single, unified
     * multi-page PDF document, compressed aggressively to <= [targetMaxBytes] (default 100 KB).
     * Includes medical imaging optimizations (contrast enhancement, monochrome detection for X-rays).
     */
    suspend fun createOptimizedPdfFromImages(
        context: Context,
        uris: List<Uri>,
        targetMaxBytes: Int = LAB_REPORT_MAX_BYTES,
        baseFileName: String = "Lab_Report"
    ): CompressedFileResult? = withContext(Dispatchers.IO) {
        if (uris.isEmpty()) return@withContext null
        try {
            val rawImages = mutableListOf<ByteArray>()
            var totalOriginal = 0
            for (uri in uris) {
                val b = context.contentResolver.openInputStream(uri)?.use { it.readBytes() }
                if (b != null && b.isNotEmpty()) {
                    rawImages.add(b)
                    totalOriginal += b.size
                }
            }
            if (rawImages.isEmpty()) return@withContext null

            createOptimizedPdfFromImageBytes(rawImages, targetMaxBytes, baseFileName, totalOriginal)
        } catch (e: Exception) {
            e.printStackTrace()
            null
        }
    }

    /**
     * Stitches multiple raw image byte arrays into a single unified PDF <= [targetMaxBytes].
     */
    fun createOptimizedPdfFromImageBytes(
        rawImages: List<ByteArray>,
        targetMaxBytes: Int = LAB_REPORT_MAX_BYTES,
        baseFileName: String = "Lab_Report",
        totalOriginalBytes: Int = rawImages.sumOf { it.size }
    ): CompressedFileResult? {
        if (rawImages.isEmpty()) return null
        val pageCount = rawImages.size

        // Calculate overhead of PDF metadata (header, xref, catalog, page dicts)
        val pdfOverhead = (pageCount * 360 + 1200)
        val maxTotalJpegBytes = (targetMaxBytes - pdfOverhead).coerceAtLeast(12 * 1024)
        val perPageBudget = (maxTotalJpegBytes / pageCount).coerceAtLeast(8 * 1024)

        val pageInfos = mutableListOf<JpegPageInfo>()

        for (i in 0 until pageCount) {
            val raw = rawImages[i]
            val pageInfo = compressImageToJpegPage(
                rawBytes = raw,
                maxPageBytes = perPageBudget,
                pageIndex = i,
                totalPages = pageCount
            ) ?: return null
            pageInfos.add(pageInfo)
        }

        // Check if combined size exceeds maxTotalJpegBytes
        var currentTotalJpegBytes = pageInfos.sumOf { it.bytes.size }
        if (currentTotalJpegBytes > maxTotalJpegBytes) {
            // Second pass: progressively reduce the largest pages until total fits
            for (pass in 0 until 5) {
                if (currentTotalJpegBytes <= maxTotalJpegBytes) break
                val largestIndex = pageInfos.indices.maxByOrNull { pageInfos[it].bytes.size } ?: break
                val largest = pageInfos[largestIndex]
                val scaledDown = reduceJpegPage(largest, 0.78f, 32)
                if (scaledDown != null && scaledDown.bytes.size < largest.bytes.size) {
                    pageInfos[largestIndex] = scaledDown
                    currentTotalJpegBytes = pageInfos.sumOf { it.bytes.size }
                } else {
                    break
                }
            }
        }

        val pdfBytes = PdfBuilder.buildPdfFromJpegs(pageInfos)
        val finalName = ensureExtension(baseFileName, "pdf")

        return CompressedFileResult(
            bytes = pdfBytes,
            fileName = finalName,
            originalSizeBytes = totalOriginalBytes,
            compressedSizeBytes = pdfBytes.size,
            wasCompressed = true,
            targetCapBytes = targetMaxBytes,
            pageCount = pageCount
        )
    }

    private fun compressImageToJpegPage(
        rawBytes: ByteArray,
        maxPageBytes: Int,
        pageIndex: Int,
        totalPages: Int
    ): JpegPageInfo? {
        val boundsOpts = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeByteArray(rawBytes, 0, rawBytes.size, boundsOpts)
        val inWidth = boundsOpts.outWidth
        val inHeight = boundsOpts.outHeight
        if (inWidth <= 0 || inHeight <= 0) return null

        val maxDim = when {
            totalPages == 1 -> 1200
            totalPages == 2 -> 980
            totalPages == 3 -> 840
            else -> 720
        }

        val sampleSize = calculateInSampleSize(inWidth, inHeight, maxDim)
        val decodeOpts = BitmapFactory.Options().apply {
            inSampleSize = sampleSize
            inPreferredConfig = Bitmap.Config.ARGB_8888
        }
        var bitmap = BitmapFactory.decodeByteArray(rawBytes, 0, rawBytes.size, decodeOpts) ?: return null

        val isMono = isImagePredominantlyMonochrome(bitmap)

        // Scale down if dimension exceeds maxDim
        val maxSide = max(bitmap.width, bitmap.height)
        if (maxSide > maxDim) {
            val ratio = maxDim.toFloat() / maxSide.toFloat()
            val targetW = (bitmap.width * ratio).roundToInt().coerceAtLeast(1)
            val targetH = (bitmap.height * ratio).roundToInt().coerceAtLeast(1)
            val scaled = Bitmap.createScaledBitmap(bitmap, targetW, targetH, true)
            if (scaled !== bitmap) {
                bitmap.recycle()
                bitmap = scaled
            }
        }

        // Flatten onto RGB_565 canvas; if monochrome, apply contrast stretch for sharp medical text/X-ray
        val flattened = Bitmap.createBitmap(bitmap.width, bitmap.height, Bitmap.Config.RGB_565)
        val canvas = Canvas(flattened)
        canvas.drawColor(Color.WHITE)
        val paint = Paint()
        if (isMono) {
            val cm = ColorMatrix().apply {
                setSaturation(0f)
                val contrast = 1.12f
                val translate = (-0.5f * contrast + 0.5f) * 255f
                val matrix = floatArrayOf(
                    contrast, 0f, 0f, 0f, translate,
                    0f, contrast, 0f, 0f, translate,
                    0f, 0f, contrast, 0f, translate,
                    0f, 0f, 0f, 1f, 0f
                )
                postConcat(ColorMatrix(matrix))
            }
            paint.colorFilter = ColorMatrixColorFilter(cm)
        }
        canvas.drawBitmap(bitmap, 0f, 0f, paint)
        bitmap.recycle()
        var currentBitmap = flattened

        val qualities = intArrayOf(75, 62, 50, 40, 30, 22, 16)
        var bestJpeg: ByteArray? = null

        for (scalePass in 0 until 4) {
            for (q in qualities) {
                val baos = ByteArrayOutputStream()
                currentBitmap.compress(Bitmap.CompressFormat.JPEG, q, baos)
                val candidate = baos.toByteArray()
                bestJpeg = candidate
                if (candidate.size <= maxPageBytes) {
                    val parsed = PdfBuilder.parseJpegInfo(candidate)
                        ?: JpegPageInfo(candidate, currentBitmap.width, currentBitmap.height, isMono)
                    currentBitmap.recycle()
                    return parsed
                }
            }

            // Downscale dimensions by 75% and retry
            val nextW = (currentBitmap.width * 0.75f).roundToInt().coerceAtLeast(200)
            val nextH = (currentBitmap.height * 0.75f).roundToInt().coerceAtLeast(200)
            if (nextW == currentBitmap.width && nextH == currentBitmap.height) break
            val smaller = Bitmap.createScaledBitmap(currentBitmap, nextW, nextH, true)
            if (smaller !== currentBitmap) {
                currentBitmap.recycle()
                currentBitmap = smaller
            }
        }

        if (bestJpeg != null) {
            val parsed = PdfBuilder.parseJpegInfo(bestJpeg)
                ?: JpegPageInfo(bestJpeg, currentBitmap.width, currentBitmap.height, isMono)
            currentBitmap.recycle()
            return parsed
        }

        currentBitmap.recycle()
        return null
    }

    private fun reduceJpegPage(page: JpegPageInfo, scaleFactor: Float, targetQuality: Int): JpegPageInfo? {
        return try {
            val bmp = BitmapFactory.decodeByteArray(page.bytes, 0, page.bytes.size) ?: return null
            val newW = (bmp.width * scaleFactor).roundToInt().coerceAtLeast(180)
            val newH = (bmp.height * scaleFactor).roundToInt().coerceAtLeast(180)
            val scaled = Bitmap.createScaledBitmap(bmp, newW, newH, true)
            if (scaled !== bmp) bmp.recycle()
            val baos = ByteArrayOutputStream()
            scaled.compress(Bitmap.CompressFormat.JPEG, targetQuality, baos)
            scaled.recycle()
            val candidate = baos.toByteArray()
            PdfBuilder.parseJpegInfo(candidate) ?: JpegPageInfo(candidate, newW, newH, page.isGrayscale)
        } catch (_: Exception) {
            null
        }
    }

    private fun isImagePredominantlyMonochrome(bitmap: Bitmap): Boolean {
        return try {
            var totalColorDiff = 0
            val stepX = (bitmap.width / 10).coerceAtLeast(1)
            val stepY = (bitmap.height / 10).coerceAtLeast(1)
            var samples = 0
            for (y in 0 until bitmap.height step stepY) {
                for (x in 0 until bitmap.width step stepX) {
                    val pixel = bitmap.getPixel(x, y)
                    val r = (pixel shr 16) and 0xFF
                    val g = (pixel shr 8) and 0xFF
                    val b = pixel and 0xFF
                    val maxC = maxOf(r, maxOf(g, b))
                    val minC = minOf(r, minOf(g, b))
                    totalColorDiff += (maxC - minC)
                    samples++
                }
            }
            val avgDiff = if (samples > 0) totalColorDiff / samples else 0
            avgDiff < 18
        } catch (_: Exception) {
            false
        }
    }

    /**
     * Reads a [Uri] from [Context.getContentResolver] and compresses it to <= [maxBytes] (default 300 KB).
     */
    suspend fun compressUri(
        context: Context,
        uri: Uri,
        fallbackFileName: String = "upload_${System.currentTimeMillis()}",
        maxBytes: Int = MAX_FILE_SIZE_BYTES
    ): CompressedFileResult? = withContext(Dispatchers.IO) {
        try {
            val rawBytes = context.contentResolver.openInputStream(uri)?.use { it.readBytes() }
                ?: return@withContext null
            val baseFallback = if (fallbackFileName.contains('.')) fallbackFileName.substringBeforeLast('.') else fallbackFileName
            val resolvedName = resolveRealFileName(
                context = context,
                uri = uri,
                rawBytes = rawBytes,
                defaultBaseName = baseFallback.ifBlank { "upload" }
            )
            compressBytes(rawBytes, resolvedName, maxBytes)
        } catch (e: Exception) {
            e.printStackTrace()
            null
        }
    }

    /**
     * Compresses raw bytes (image or PDF document) to <= [maxBytes] (default 300 KB).
     */
    fun compressBytes(
        rawBytes: ByteArray,
        fileName: String = "file",
        maxBytes: Int = MAX_FILE_SIZE_BYTES
    ): CompressedFileResult {
        val originalSize = rawBytes.size
        if (originalSize == 0) {
            return CompressedFileResult(rawBytes, fileName, 0, 0, false, maxBytes)
        }

        val magicExt = detectExtensionFromBytes(rawBytes)
        val isPdf = magicExt == "pdf" || isPdfHeader(rawBytes) || fileName.endsWith(".pdf", ignoreCase = true)

        // 1. If it's a PDF document
        if (isPdf) {
            val normalizedPdfName = ensureExtension(fileName, "pdf")
            if (rawBytes.size > maxBytes) {
                val compressedPdf = compressPdfBytes(rawBytes, maxBytes)
                if (compressedPdf != null && compressedPdf.size < rawBytes.size) {
                    return CompressedFileResult(
                        bytes = compressedPdf,
                        fileName = normalizedPdfName,
                        originalSizeBytes = originalSize,
                        compressedSizeBytes = compressedPdf.size,
                        wasCompressed = true,
                        targetCapBytes = maxBytes
                    )
                }
            }
            return CompressedFileResult(
                bytes = rawBytes,
                fileName = normalizedPdfName,
                originalSizeBytes = originalSize,
                compressedSizeBytes = rawBytes.size,
                wasCompressed = false,
                targetCapBytes = maxBytes
            )
        }

        // 2. Check if the bytes represent a decodable Bitmap image
        val boundsOpts = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeByteArray(rawBytes, 0, rawBytes.size, boundsOpts)
        val isImage = boundsOpts.outWidth > 0 && boundsOpts.outHeight > 0

        if (isImage) {
            val compressedImage = compressImageBytes(
                rawBytes = rawBytes,
                outWidth = boundsOpts.outWidth,
                outHeight = boundsOpts.outHeight,
                maxBytes = maxBytes
            )
            if (compressedImage != null) {
                val useCompressed = compressedImage.size < rawBytes.size || rawBytes.size > maxBytes
                val chosenBytes = if (useCompressed) compressedImage else rawBytes
                val normalizedName = if (useCompressed) {
                    ensureExtension(fileName, "jpg")
                } else {
                    val realExt = magicExt ?: (if (fileName.contains('.')) fileName.substringAfterLast('.').lowercase(Locale.US) else "jpg")
                    ensureExtension(fileName, realExt)
                }
                return CompressedFileResult(
                    bytes = chosenBytes,
                    fileName = normalizedName,
                    originalSizeBytes = originalSize,
                    compressedSizeBytes = chosenBytes.size,
                    wasCompressed = chosenBytes.size < originalSize,
                    targetCapBytes = maxBytes
                )
            }
        }

        // 3. Fallback for other arbitrary files
        val finalExt = magicExt ?: (if (fileName.contains('.')) fileName.substringAfterLast('.').lowercase(Locale.US) else "bin")
        val normalizedName = ensureExtension(fileName, finalExt)
        return CompressedFileResult(
            bytes = rawBytes,
            fileName = normalizedName,
            originalSizeBytes = originalSize,
            compressedSizeBytes = rawBytes.size,
            wasCompressed = false,
            targetCapBytes = maxBytes
        )
    }

    private fun compressImageBytes(
        rawBytes: ByteArray,
        outWidth: Int,
        outHeight: Int,
        maxBytes: Int
    ): ByteArray? {
        return try {
            val sampleSize = calculateInSampleSize(outWidth, outHeight, MAX_INITIAL_DIMENSION)
            val decodeOpts = BitmapFactory.Options().apply {
                inSampleSize = sampleSize
                inPreferredConfig = Bitmap.Config.ARGB_8888
            }
            var bitmap = BitmapFactory.decodeByteArray(rawBytes, 0, rawBytes.size, decodeOpts) ?: return null

            val maxSide = max(bitmap.width, bitmap.height)
            if (maxSide > MAX_INITIAL_DIMENSION) {
                val ratio = MAX_INITIAL_DIMENSION.toFloat() / maxSide.toFloat()
                val targetW = (bitmap.width * ratio).roundToInt().coerceAtLeast(1)
                val targetH = (bitmap.height * ratio).roundToInt().coerceAtLeast(1)
                val scaled = Bitmap.createScaledBitmap(bitmap, targetW, targetH, true)
                if (scaled !== bitmap) {
                    bitmap.recycle()
                    bitmap = scaled
                }
            }

            val opaqueBitmap = Bitmap.createBitmap(bitmap.width, bitmap.height, Bitmap.Config.RGB_565)
            val canvas = Canvas(opaqueBitmap)
            canvas.drawColor(Color.WHITE)
            canvas.drawBitmap(bitmap, 0f, 0f, null)
            if (opaqueBitmap !== bitmap) {
                bitmap.recycle()
                bitmap = opaqueBitmap
            }

            val softTarget = PREFERRED_TARGET_BYTES.coerceAtMost(maxBytes)
            var currentBitmap = bitmap
            var bestBytes: ByteArray? = null

            for (scalePass in 0 until 5) {
                val qualities = intArrayOf(80, 70, 60, 50, 40, 30, 22, 15)
                for (q in qualities) {
                    val baos = ByteArrayOutputStream()
                    currentBitmap.compress(Bitmap.CompressFormat.JPEG, q, baos)
                    val candidate = baos.toByteArray()
                    bestBytes = candidate

                    if (candidate.size <= softTarget || (candidate.size <= maxBytes && q <= 60)) {
                        currentBitmap.recycle()
                        return candidate
                    }
                }

                if (bestBytes != null && bestBytes.size <= maxBytes) {
                    currentBitmap.recycle()
                    return bestBytes
                }

                val nextW = (currentBitmap.width * 0.72f).roundToInt().coerceAtLeast(200)
                val nextH = (currentBitmap.height * 0.72f).roundToInt().coerceAtLeast(200)
                if (nextW == currentBitmap.width && nextH == currentBitmap.height) break
                val smaller = Bitmap.createScaledBitmap(currentBitmap, nextW, nextH, true)
                if (smaller !== currentBitmap) {
                    currentBitmap.recycle()
                    currentBitmap = smaller
                }
            }

            currentBitmap.recycle()
            bestBytes
        } catch (e: Exception) {
            e.printStackTrace()
            null
        }
    }

    private fun compressPdfBytes(rawBytes: ByteArray, maxBytes: Int): ByteArray? {
        var tempFile: File? = null
        var pfd: ParcelFileDescriptor? = null
        var renderer: PdfRenderer? = null
        return try {
            tempFile = File.createTempFile("dactor_pdf_src_", ".pdf")
            tempFile.writeBytes(rawBytes)
            pfd = ParcelFileDescriptor.open(tempFile, ParcelFileDescriptor.MODE_READ_ONLY)
            renderer = PdfRenderer(pfd)
            val pageCount = renderer.pageCount.coerceIn(1, 10)

            val scales = if (maxBytes <= LAB_REPORT_MAX_BYTES) {
                floatArrayOf(0.9f, 0.72f, 0.55f, 0.42f)
            } else {
                floatArrayOf(1.1f, 0.85f, 0.65f)
            }

            for (scale in scales) {
                val pageInfos = mutableListOf<JpegPageInfo>()
                for (i in 0 until pageCount) {
                    val page = renderer.openPage(i)
                    val renderW = (page.width * scale).roundToInt().coerceIn(240, 1100)
                    val renderH = (page.height * scale).roundToInt().coerceIn(340, 1500)
                    val bmp = Bitmap.createBitmap(renderW, renderH, Bitmap.Config.ARGB_8888)
                    val canvas = Canvas(bmp)
                    canvas.drawColor(Color.WHITE)
                    page.render(bmp, null, null, PdfRenderer.Page.RENDER_MODE_FOR_PRINT)
                    page.close()

                    val q = if (maxBytes <= LAB_REPORT_MAX_BYTES) 45 else 55
                    val jpegBaos = ByteArrayOutputStream()
                    bmp.compress(Bitmap.CompressFormat.JPEG, q, jpegBaos)
                    bmp.recycle()
                    val compactBytes = jpegBaos.toByteArray()
                    val info = PdfBuilder.parseJpegInfo(compactBytes) ?: JpegPageInfo(compactBytes, renderW, renderH)
                    pageInfos.add(info)
                }

                val built = PdfBuilder.buildPdfFromJpegs(pageInfos)
                if (built.size <= maxBytes || scale == scales.last()) {
                    return built
                }
            }
            null
        } catch (e: Exception) {
            e.printStackTrace()
            null
        } finally {
            try { renderer?.close() } catch (_: Exception) {}
            try { pfd?.close() } catch (_: Exception) {}
            try { tempFile?.delete() } catch (_: Exception) {}
        }
    }

    private fun calculateInSampleSize(width: Int, height: Int, maxDim: Int): Int {
        var inSampleSize = 1
        val largest = max(width, height)
        if (largest > maxDim) {
            while ((largest / (inSampleSize * 2)) >= maxDim) {
                inSampleSize *= 2
            }
        }
        return inSampleSize
    }

    fun ensureExtension(fileName: String, targetExt: String): String {
        val clean = fileName.trim().ifBlank { "file" }
        val ext = targetExt.trim().lowercase(Locale.US).removePrefix(".")
        val dotIndex = clean.lastIndexOf('.')
        return if (dotIndex > 0 && (clean.length - dotIndex) <= 6 && !clean.substring(dotIndex + 1).contains(' ')) {
            val currentExt = clean.substring(dotIndex + 1).lowercase(Locale.US)
            if (currentExt == ext || (ext == "jpg" && currentExt == "jpeg")) {
                clean
            } else {
                "${clean.substring(0, dotIndex)}.$ext"
            }
        } else {
            "$clean.$ext"
        }
    }

    fun isPdfHeader(bytes: ByteArray): Boolean {
        return bytes.size >= 4 &&
            bytes[0] == '%'.code.toByte() &&
            bytes[1] == 'P'.code.toByte() &&
            bytes[2] == 'D'.code.toByte() &&
            bytes[3] == 'F'.code.toByte()
    }

    fun detectExtensionFromBytes(bytes: ByteArray): String? {
        if (bytes.size >= 4) {
            if (bytes[0] == 0x25.toByte() && bytes[1] == 0x50.toByte() && bytes[2] == 0x44.toByte() && bytes[3] == 0x46.toByte()) {
                return "pdf"
            }
            if (bytes[0] == 0x89.toByte() && bytes[1] == 0x50.toByte() && bytes[2] == 0x44.toByte() && bytes[3] == 0x46.toByte()) {
                return "png"
            }
            if (bytes.size >= 3 && bytes[0] == 0xFF.toByte() && bytes[1] == 0xD8.toByte() && bytes[2] == 0xFF.toByte()) {
                return "jpg"
            }
            if (bytes.size >= 12 &&
                bytes[0] == 'R'.code.toByte() && bytes[1] == 'I'.code.toByte() && bytes[2] == 'F'.code.toByte() && bytes[3] == 'F'.code.toByte() &&
                bytes[8] == 'W'.code.toByte() && bytes[9] == 'E'.code.toByte() && bytes[10] == 'B'.code.toByte() && bytes[11] == 'P'.code.toByte()) {
                return "webp"
            }
            if (bytes.size >= 6 &&
                bytes[0] == 'G'.code.toByte() && bytes[1] == 'I'.code.toByte() && bytes[2] == 'F'.code.toByte()) {
                return "gif"
            }
        }
        return null
    }

    fun getExtensionFromMime(context: Context, uri: Uri): String? {
        return try {
            val mime = context.contentResolver.getType(uri)
            if (!mime.isNullOrBlank()) {
                MimeTypeMap.getSingleton().getExtensionFromMimeType(mime)?.lowercase(Locale.US)
            } else null
        } catch (_: Exception) {
            null
        }
    }

    fun queryDisplayName(context: Context, uri: Uri): String? {
        return try {
            if (uri.scheme == "content") {
                context.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { cursor ->
                    val idx = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
                    if (idx >= 0 && cursor.moveToFirst()) cursor.getString(idx) else null
                }
            } else if (uri.scheme == "file") {
                uri.lastPathSegment
            } else {
                null
            }
        } catch (_: Exception) {
            null
        }
    }

    fun resolveRealFileName(
        context: Context,
        uri: Uri,
        rawBytes: ByteArray? = null,
        defaultBaseName: String = "document"
    ): String {
        val magicExt = rawBytes?.let { detectExtensionFromBytes(it) }
        val mimeExt = getExtensionFromMime(context, uri)
        val displayName = queryDisplayName(context, uri)?.trim()

        val nameExt = if (!displayName.isNullOrBlank() && displayName.contains('.')) {
            val lastDot = displayName.lastIndexOf('.')
            if ((displayName.length - lastDot) <= 6 && !displayName.substring(lastDot + 1).contains(' ')) {
                displayName.substring(lastDot + 1).lowercase(Locale.US)
            } else null
        } else null

        val validExtensions = setOf("pdf", "jpg", "jpeg", "png", "webp", "gif", "bmp", "doc", "docx", "xls", "xlsx")

        val realExt = when {
            magicExt != null -> magicExt
            !nameExt.isNullOrBlank() && validExtensions.contains(nameExt) -> nameExt
            !mimeExt.isNullOrBlank() && validExtensions.contains(mimeExt) -> mimeExt
            !mimeExt.isNullOrBlank() -> mimeExt
            !nameExt.isNullOrBlank() -> nameExt
            else -> {
                val mime = try { context.contentResolver.getType(uri)?.lowercase(Locale.US) } catch (_: Exception) { null }
                if (mime != null && mime.startsWith("image/")) "jpg" else "pdf"
            }
        }

        val rawBase = when {
            !displayName.isNullOrBlank() && displayName.contains('.') -> {
                val lastDot = displayName.lastIndexOf('.')
                if ((displayName.length - lastDot) <= 6 && !displayName.substring(lastDot + 1).contains(' ')) {
                    displayName.substring(0, lastDot)
                } else displayName
            }
            !displayName.isNullOrBlank() && !displayName.startsWith("image:") && !displayName.startsWith("raw:") && !displayName.startsWith("document:") -> displayName
            else -> {
                val lastSegment = uri.lastPathSegment?.substringAfterLast('/')?.trim()
                if (!lastSegment.isNullOrBlank() && !lastSegment.startsWith("image:") && !lastSegment.startsWith("raw:") && !lastSegment.startsWith("document:")) {
                    if (lastSegment.contains('.')) lastSegment.substringBeforeLast('.') else lastSegment
                } else {
                    defaultBaseName
                }
            }
        }

        val cleanBase = rawBase.replace("[^a-zA-Z0-9._-]".toRegex(), "_").trim('_').ifBlank { defaultBaseName }
        return "$cleanBase.$realExt"
    }

    fun resolveDisplayFileName(
        context: Context,
        uri: Uri,
        defaultBaseName: String = "document"
    ): String {
        return resolveRealFileName(context, uri, rawBytes = null, defaultBaseName = defaultBaseName)
    }
}
