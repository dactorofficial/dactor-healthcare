package com.dactor.clinic.domain.util

import org.junit.Assert.*
import org.junit.Test
import java.io.ByteArrayOutputStream

class PdfReportBuilderTest {

    // Helper to generate a minimal valid JPEG image in bytes
    private fun createMinimalJpegBytes(width: Int = 100, height: Int = 100, isGrayscale: Boolean = false): ByteArray {
        val baos = ByteArrayOutputStream()
        // SOI marker
        baos.write(byteArrayOf(0xFF.toByte(), 0xD8.toByte()))

        // APP0 marker (JFIF)
        val app0 = byteArrayOf(
            0xFF.toByte(), 0xE0.toByte(), 0x00.toByte(), 0x10.toByte(),
            'J'.code.toByte(), 'F'.code.toByte(), 'I'.code.toByte(), 'F'.code.toByte(), 0x00.toByte(),
            0x01.toByte(), 0x01.toByte(), 0x00.toByte(), 0x00.toByte(), 0x01.toByte(), 0x00.toByte(), 0x01.toByte(),
            0x00.toByte(), 0x00.toByte()
        )
        baos.write(app0)

        // SOF0 marker (Start of Frame baseline DCT)
        val components = if (isGrayscale) 1 else 3
        val sof0 = byteArrayOf(
            0xFF.toByte(), 0xC0.toByte(),
            0x00.toByte(), (8 + components * 3).toByte(), // length
            0x08.toByte(), // precision 8 bits
            ((height shr 8) and 0xFF).toByte(), (height and 0xFF).toByte(),
            ((width shr 8) and 0xFF).toByte(), (width and 0xFF).toByte(),
            components.toByte()
        )
        baos.write(sof0)
        for (c in 1..components) {
            baos.write(byteArrayOf(c.toByte(), 0x11.toByte(), 0x00.toByte()))
        }

        // Dummy scan data
        baos.write(byteArrayOf(0xFF.toByte(), 0xDA.toByte(), 0x00.toByte(), 0x08.toByte(), 0x01.toByte(), 0x01.toByte(), 0x00.toByte(), 0x00.toByte(), 0x3F.toByte(), 0x00.toByte()))
        baos.write(ByteArray(50) { 0x42.toByte() })

        // EOI marker
        baos.write(byteArrayOf(0xFF.toByte(), 0xD9.toByte()))
        return baos.toByteArray()
    }

    @Test
    fun parseJpegInfo_extractsDimensionsAndColorSpaceCorrectly() {
        val rgbJpeg = createMinimalJpegBytes(width = 640, height = 480, isGrayscale = false)
        val rgbInfo = PdfBuilder.parseJpegInfo(rgbJpeg)
        assertNotNull(rgbInfo)
        assertEquals(640, rgbInfo?.width)
        assertEquals(480, rgbInfo?.height)
        assertFalse(rgbInfo?.isGrayscale ?: true)

        val monoJpeg = createMinimalJpegBytes(width = 800, height = 1100, isGrayscale = true)
        val monoInfo = PdfBuilder.parseJpegInfo(monoJpeg)
        assertNotNull(monoInfo)
        assertEquals(800, monoInfo?.width)
        assertEquals(1100, monoInfo?.height)
        assertTrue(monoInfo?.isGrayscale ?: false)
    }

    @Test
    fun buildPdfFromJpegs_generatesValidMultiPagePdfUnderTargetSize() {
        val page1 = JpegPageInfo(createMinimalJpegBytes(600, 800, false), 600, 800, false)
        val page2 = JpegPageInfo(createMinimalJpegBytes(600, 800, true), 600, 800, true)
        val page3 = JpegPageInfo(createMinimalJpegBytes(600, 800, true), 600, 800, true)

        val pdfBytes = PdfBuilder.buildPdfFromJpegs(listOf(page1, page2, page3))
        assertNotNull(pdfBytes)
        assertTrue("PDF should be non-empty", pdfBytes.isNotEmpty())

        val pdfString = String(pdfBytes, Charsets.US_ASCII)
        assertTrue("Must start with PDF 1.4 header", pdfString.startsWith("%PDF-1.4"))
        assertTrue("Must contain Catalog", pdfString.contains("/Type /Catalog"))
        assertTrue("Must contain Pages tree with Count 3", pdfString.contains("/Count 3"))
        assertTrue("Must contain DCTDecode filter", pdfString.contains("/Filter /DCTDecode"))
        assertTrue("Must contain Grayscale DeviceGray", pdfString.contains("/ColorSpace /DeviceGray"))
        assertTrue("Must contain RGB DeviceRGB", pdfString.contains("/ColorSpace /DeviceRGB"))
        assertTrue("Must contain xref table", pdfString.contains("xref\n0 12"))
        assertTrue("Must contain trailer and EOF", pdfString.contains("%%EOF"))

        // Overhead should be minimal (< 3 KB for 3 pages plus raw JPEG payloads)
        assertTrue("3-page minimal PDF size should easily be < 10 KB", pdfBytes.size < 10 * 1024)
    }

    @Test
    fun buildPdfFromJpegs_fourPicturesCombineLocallyIntoValidPdf() {
        val page1 = JpegPageInfo(createMinimalJpegBytes(600, 800, false), 600, 800, false)
        val page2 = JpegPageInfo(createMinimalJpegBytes(600, 800, false), 600, 800, false)
        val page3 = JpegPageInfo(createMinimalJpegBytes(600, 800, true), 600, 800, true)
        val page4 = JpegPageInfo(createMinimalJpegBytes(600, 800, true), 600, 800, true)

        val pdfBytes = PdfBuilder.buildPdfFromJpegs(listOf(page1, page2, page3, page4))
        assertNotNull(pdfBytes)
        assertTrue("PDF should be non-empty", pdfBytes.isNotEmpty())

        val pdfString = String(pdfBytes, Charsets.US_ASCII)
        assertTrue("Must start with PDF 1.4 header", pdfString.startsWith("%PDF-1.4"))
        assertTrue("Must contain Catalog", pdfString.contains("/Type /Catalog"))
        assertTrue("Must contain Pages tree with Count 4", pdfString.contains("/Count 4"))
        assertTrue("Must contain DCTDecode filter", pdfString.contains("/Filter /DCTDecode"))
        assertTrue("Must contain Page 4 image ref /Im3", pdfString.contains("/Im3"))
        assertTrue("Must contain xref table", pdfString.contains("xref\n0 15"))
        assertTrue("Must contain trailer and EOF", pdfString.contains("%%EOF"))
        assertTrue("4-page combined PDF size should be well under 100 KB ceiling", pdfBytes.size < 100 * 1024)
    }
}
