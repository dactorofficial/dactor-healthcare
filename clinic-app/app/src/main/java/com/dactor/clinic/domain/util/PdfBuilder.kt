package com.dactor.clinic.domain.util

import java.io.ByteArrayOutputStream
import java.nio.charset.StandardCharsets
import java.util.Locale

/**
 * Lightweight, zero-dependency PDF 1.4 document builder.
 * Directly embeds JPEG images using /Filter /DCTDecode for 100% predictable
 * file size, optimal compression (<= 100 KB), and universal cross-platform rendering.
 */
data class JpegPageInfo(
    val bytes: ByteArray,
    val width: Int,
    val height: Int,
    val isGrayscale: Boolean = false
)

object PdfBuilder {

    /**
     * Inspects raw JPEG bytes to extract width, height, and whether it has 1 component (grayscale).
     */
    fun parseJpegInfo(jpegBytes: ByteArray): JpegPageInfo? {
        if (jpegBytes.size < 4 || (jpegBytes[0].toInt() and 0xFF) != 0xFF || (jpegBytes[1].toInt() and 0xFF) != 0xD8) {
            return null
        }
        var offset = 2
        while (offset + 4 < jpegBytes.size) {
            if ((jpegBytes[offset].toInt() and 0xFF) != 0xFF) {
                offset++
                continue
            }
            val marker = jpegBytes[offset + 1].toInt() and 0xFF
            offset += 2
            // Standalone markers with no length
            if (marker == 0xD8 || marker == 0xD9 || (marker in 0xD0..0xD7)) {
                continue
            }
            if (offset + 2 > jpegBytes.size) break
            val length = ((jpegBytes[offset].toInt() and 0xFF) shl 8) or (jpegBytes[offset + 1].toInt() and 0xFF)
            if (length < 2) break

            // SOF0 (0xC0), SOF1 (0xC1), SOF2 (0xC2)
            if (marker == 0xC0 || marker == 0xC1 || marker == 0xC2) {
                if (offset + 8 <= jpegBytes.size) {
                    val height = ((jpegBytes[offset + 3].toInt() and 0xFF) shl 8) or (jpegBytes[offset + 4].toInt() and 0xFF)
                    val width = ((jpegBytes[offset + 5].toInt() and 0xFF) shl 8) or (jpegBytes[offset + 6].toInt() and 0xFF)
                    val components = jpegBytes[offset + 7].toInt() and 0xFF
                    return JpegPageInfo(
                        bytes = jpegBytes,
                        width = width,
                        height = height,
                        isGrayscale = components == 1
                    )
                }
                break
            }
            offset += length
        }
        return null
    }

    /**
     * Builds a valid PDF 1.4 document containing the given JPEG pages.
     */
    fun buildPdfFromJpegs(pages: List<JpegPageInfo>): ByteArray {
        require(pages.isNotEmpty()) { "At least one page is required to build a PDF" }

        val baos = ByteArrayOutputStream()
        val offsets = mutableListOf<Long>()

        fun writeAscii(str: String) {
            baos.write(str.toByteArray(StandardCharsets.US_ASCII))
        }

        fun writeObject(content: (ByteArrayOutputStream) -> Unit): Int {
            offsets.add(baos.size().toLong())
            val objNum = offsets.size // 1-based index
            writeAscii("$objNum 0 obj\n")
            content(baos)
            writeAscii("\nendobj\n")
            return objNum
        }

        // 1. Header
        writeAscii("%PDF-1.4\n")
        // Binary comment to ensure binary mode transfer
        baos.write(byteArrayOf('%'.code.toByte(), 0xE2.toByte(), 0xE3.toByte(), 0xCF.toByte(), 0xD3.toByte(), '\n'.code.toByte()))

        val pageCount = pages.size
        // Object IDs:
        // Obj 1: Catalog
        // Obj 2: Pages tree
        // For each page i (0 until pageCount):
        //   Page object:     3 + 3*i
        //   Image XObject:   4 + 3*i
        //   Contents stream: 5 + 3*i

        // Obj 1: Catalog
        writeObject {
            it.write("<< /Type /Catalog /Pages 2 0 R >>".toByteArray(StandardCharsets.US_ASCII))
        }

        // Obj 2: Pages Tree
        writeObject {
            val kids = (0 until pageCount).joinToString(" ") { i -> "${3 + 3 * i} 0 R" }
            val pagesDict = "<< /Type /Pages /Kids [ $kids ] /Count $pageCount >>"
            it.write(pagesDict.toByteArray(StandardCharsets.US_ASCII))
        }

        // Write page objects
        for (i in 0 until pageCount) {
            val page = pages[i]
            val pageObjNum = 3 + 3 * i
            val imageObjNum = 4 + 3 * i
            val contentsObjNum = 5 + 3 * i

            // Standardize width to 595.28 pt (A4 width) and compute proportional height
            val safeWidth = if (page.width > 0) page.width else 595
            val safeHeight = if (page.height > 0) page.height else 842
            val mediaWidthPt = 595.28
            val mediaHeightPt = String.format(Locale.US, "%.2f", mediaWidthPt * safeHeight.toDouble() / safeWidth.toDouble()).toDouble()

            // Page Object
            writeObject {
                val pageStr = "<< /Type /Page /Parent 2 0 R /MediaBox [ 0 0 $mediaWidthPt $mediaHeightPt ] " +
                        "/Resources << /XObject << /Im$i $imageObjNum 0 R >> >> " +
                        "/Contents $contentsObjNum 0 R >>"
                it.write(pageStr.toByteArray(StandardCharsets.US_ASCII))
            }

            // Image XObject with direct DCTDecode
            val colorSpace = if (page.isGrayscale) "/DeviceGray" else "/DeviceRGB"
            writeObject {
                val header = "<< /Type /XObject /Subtype /Image /Width ${page.width} /Height ${page.height} " +
                        "/ColorSpace $colorSpace /BitsPerComponent 8 /Filter /DCTDecode /Length ${page.bytes.size} >>\nstream\n"
                it.write(header.toByteArray(StandardCharsets.US_ASCII))
                it.write(page.bytes)
                it.write("\nendstream".toByteArray(StandardCharsets.US_ASCII))
            }

            // Content Stream (places image filling the media box)
            val streamContent = String.format(Locale.US, "q %.2f 0 0 %.2f 0 0 cm /Im%d Do Q\n", mediaWidthPt, mediaHeightPt, i)
            val streamBytes = streamContent.toByteArray(StandardCharsets.US_ASCII)
            writeObject {
                val header = "<< /Length ${streamBytes.size} >>\nstream\n"
                it.write(header.toByteArray(StandardCharsets.US_ASCII))
                it.write(streamBytes)
                it.write("endstream".toByteArray(StandardCharsets.US_ASCII))
            }
        }

        // Cross-reference table (xref)
        val startXref = baos.size().toLong()
        val totalObjects = offsets.size
        writeAscii("xref\n0 ${totalObjects + 1}\n")
        writeAscii("0000000000 65535 f \n")
        for (offset in offsets) {
            writeAscii(String.format(Locale.US, "%010d 00000 n \n", offset))
        }

        // Trailer
        writeAscii("trailer\n<< /Size ${totalObjects + 1} /Root 1 0 R >>\n")
        writeAscii("startxref\n$startXref\n%%EOF\n")

        return baos.toByteArray()
    }
}
