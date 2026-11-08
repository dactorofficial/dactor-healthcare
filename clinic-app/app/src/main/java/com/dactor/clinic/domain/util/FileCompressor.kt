package com.dactor.clinic.domain.util

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.pdf.PdfDocument
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
    val wasCompressed: Boolean
) {
    val formattedSummary: String
        get() = if (wasCompressed && compressedSizeBytes < originalSizeBytes) {
            "${FileCompressor.formatSize(originalSizeBytes)} → ${FileCompressor.formatSize(compressedSizeBytes)} (≤ 300 KB)"
        } else {
            "${FileCompressor.formatSize(compressedSizeBytes)} (≤ 300 KB)"
        }
}

/**
 * Compresses images and document files before uploading to Supabase Storage
 * to save cloud storage bandwidth and space.
 * Guarantees images are compressed to <= 300 KB (targeting ~150-250 KB when possible).
 */
object FileCompressor {

    const val MAX_FILE_SIZE_BYTES = 300 * 1024 // 300 KB strict ceiling
    private const val PREFERRED_TARGET_BYTES = 220 * 1024 // 220 KB preferred target ("if its less its even better")
    private const val MAX_INITIAL_DIMENSION = 1440

    fun formatSize(bytes: Int): String {
        return when {
            bytes >= 1024 * 1024 -> String.format(Locale.US, "%.2f MB", bytes / (1024f * 1024f))
            bytes >= 1024 -> "${(bytes / 1024.0).roundToInt().coerceAtLeast(1)} KB"
            else -> "$bytes B"
        }
    }

    /**
     * Reads a [Uri] from [Context.getContentResolver] and compresses it to <= 300 KB,
     * strictly preserving the file's authentic extension (.pdf, .jpg, .png, etc.).
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
     * Compresses raw bytes (image or PDF document) to <= [maxBytes] (default 300 KB),
     * strictly preserving or setting the real file extension based on magic numbers.
     */
    fun compressBytes(
        rawBytes: ByteArray,
        fileName: String = "file",
        maxBytes: Int = MAX_FILE_SIZE_BYTES
    ): CompressedFileResult {
        val originalSize = rawBytes.size
        if (originalSize == 0) {
            return CompressedFileResult(rawBytes, fileName, 0, 0, false)
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
                        wasCompressed = true
                    )
                }
            }
            return CompressedFileResult(
                bytes = rawBytes,
                fileName = normalizedPdfName,
                originalSizeBytes = originalSize,
                compressedSizeBytes = rawBytes.size,
                wasCompressed = false
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
                // Keep whichever is smaller while strictly enforcing <= maxBytes
                val useCompressed = compressedImage.size < rawBytes.size || rawBytes.size > maxBytes
                val chosenBytes = if (useCompressed) compressedImage else rawBytes
                // If re-compressed via JPEG format, final bytes are JPEG (.jpg).
                // If original bytes are kept uncompressed, strictly retain the real original extension (e.g. .png, .jpg, .webp).
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
                    wasCompressed = chosenBytes.size < originalSize
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
            wasCompressed = false
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

            // Scale down if max side still exceeds MAX_INITIAL_DIMENSION
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

            // Flatten onto white canvas in case of transparent PNG
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

            // Up to 5 dimension-scaling passes if needed to guarantee <= maxBytes
            for (scalePass in 0 until 5) {
                val qualities = intArrayOf(80, 70, 60, 50, 40, 30, 22, 15)
                for (q in qualities) {
                    val baos = ByteArrayOutputStream()
                    currentBitmap.compress(Bitmap.CompressFormat.JPEG, q, baos)
                    val candidate = baos.toByteArray()
                    bestBytes = candidate

                    // If we are under softTarget (~220 KB) or at reasonable quality under maxBytes (300 KB)
                    if (candidate.size <= softTarget || (candidate.size <= maxBytes && q <= 60)) {
                        currentBitmap.recycle()
                        return candidate
                    }
                }

                if (bestBytes != null && bestBytes.size <= maxBytes) {
                    currentBitmap.recycle()
                    return bestBytes
                }

                // Still > maxBytes: scale dimensions down by 72% and try again
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
            val pageCount = renderer.pageCount.coerceIn(1, 8) // Cap pages to prevent OOM

            for (scale in floatArrayOf(1.1f, 0.85f, 0.65f)) {
                val outPdf = PdfDocument()
                try {
                    for (i in 0 until pageCount) {
                        val page = renderer.openPage(i)
                        val renderW = (page.width * scale).roundToInt().coerceIn(300, 1100)
                        val renderH = (page.height * scale).roundToInt().coerceIn(400, 1500)
                        val bmp = Bitmap.createBitmap(renderW, renderH, Bitmap.Config.ARGB_8888)
                        val canvas = Canvas(bmp)
                        canvas.drawColor(Color.WHITE)
                        page.render(bmp, null, null, PdfRenderer.Page.RENDER_MODE_FOR_PRINT)
                        page.close()

                        // Compress the rendered bitmap through JPEG so embedded bitmap is compact
                        val jpegBaos = ByteArrayOutputStream()
                        bmp.compress(Bitmap.CompressFormat.JPEG, 55, jpegBaos)
                        bmp.recycle()
                        val compactBytes = jpegBaos.toByteArray()
                        val compactBmp = BitmapFactory.decodeByteArray(compactBytes, 0, compactBytes.size)

                        if (compactBmp != null) {
                            val pageInfo = PdfDocument.PageInfo.Builder(renderW, renderH, i + 1).create()
                            val destPage = outPdf.startPage(pageInfo)
                            destPage.canvas.drawBitmap(compactBmp, 0f, 0f, null)
                            outPdf.finishPage(destPage)
                            compactBmp.recycle()
                        }
                    }
                    val pdfOut = ByteArrayOutputStream()
                    outPdf.writeTo(pdfOut)
                    val candidate = pdfOut.toByteArray()
                    if (candidate.size <= maxBytes || scale == 0.65f) {
                        return candidate
                    }
                } finally {
                    outPdf.close()
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

    private fun ensureJpgExtension(fileName: String): String {
        return ensureExtension(fileName, "jpg")
    }

    fun isPdfHeader(bytes: ByteArray): Boolean {
        return bytes.size >= 4 &&
            bytes[0] == '%'.code.toByte() &&
            bytes[1] == 'P'.code.toByte() &&
            bytes[2] == 'D'.code.toByte() &&
            bytes[3] == 'F'.code.toByte()
    }

    /**
     * Inspects magic header bytes of raw data to determine the 100% true format.
     */
    fun detectExtensionFromBytes(bytes: ByteArray): String? {
        if (bytes.size >= 4) {
            // PDF: %PDF (0x25, 0x50, 0x44, 0x46)
            if (bytes[0] == 0x25.toByte() && bytes[1] == 0x50.toByte() && bytes[2] == 0x44.toByte() && bytes[3] == 0x46.toByte()) {
                return "pdf"
            }
            // PNG: 89 50 4E 47
            if (bytes[0] == 0x89.toByte() && bytes[1] == 0x50.toByte() && bytes[2] == 0x4E.toByte() && bytes[3] == 0x47.toByte()) {
                return "png"
            }
            // JPEG: FF D8 FF
            if (bytes.size >= 3 && bytes[0] == 0xFF.toByte() && bytes[1] == 0xD8.toByte() && bytes[2] == 0xFF.toByte()) {
                return "jpg"
            }
            // WEBP: RIFF....WEBP
            if (bytes.size >= 12 &&
                bytes[0] == 'R'.code.toByte() && bytes[1] == 'I'.code.toByte() && bytes[2] == 'F'.code.toByte() && bytes[3] == 'F'.code.toByte() &&
                bytes[8] == 'W'.code.toByte() && bytes[9] == 'E'.code.toByte() && bytes[10] == 'B'.code.toByte() && bytes[11] == 'P'.code.toByte()) {
                return "webp"
            }
            // GIF: GIF87a or GIF89a
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

    /**
     * Resolves the real original filename with its authentic extension (.pdf, .jpg, .png, etc.),
     * verifying Android OpenableColumns, MIME type, and binary magic bytes.
     */
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

    /**
     * Resolves the human-readable display name and extension for UI presentation right after selection.
     */
    fun resolveDisplayFileName(
        context: Context,
        uri: Uri,
        defaultBaseName: String = "document"
    ): String {
        return resolveRealFileName(context, uri, rawBytes = null, defaultBaseName = defaultBaseName)
    }
}
