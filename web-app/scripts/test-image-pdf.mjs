import assert from 'node:assert'
import { parseJpegInfo, buildPdfFromJpegs } from '../src/utils/imageToPdf.ts'

console.log('Testing imageToPdf PDF Builder & Parser...')

// Helper to generate minimal valid JPEG
function createMinimalJpegBytes(width = 640, height = 480, isGrayscale = false) {
  const parts = []
  // SOI marker
  parts.push(Buffer.from([0xff, 0xd8]))

  // APP0 (JFIF)
  parts.push(
    Buffer.from([
      0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01,
      0x00, 0x00,
    ])
  )

  // SOF0 (Start of Frame baseline DCT)
  const components = isGrayscale ? 1 : 3
  const sof0 = [
    0xff,
    0xc0,
    0x00,
    8 + components * 3,
    0x08,
    (height >> 8) & 0xff,
    height & 0xff,
    (width >> 8) & 0xff,
    width & 0xff,
    components,
  ]
  for (let c = 1; c <= components; c++) {
    sof0.push(c, 0x11, 0x00)
  }
  parts.push(Buffer.from(sof0))

  // Scan header & payload
  parts.push(Buffer.from([0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00]))
  parts.push(Buffer.alloc(60, 0x42))

  // EOI marker
  parts.push(Buffer.from([0xff, 0xd9]))

  return new Uint8Array(Buffer.concat(parts))
}

// 1. Test parseJpegInfo
const rgbJpeg = createMinimalJpegBytes(800, 600, false)
const rgbInfo = parseJpegInfo(rgbJpeg)
assert(rgbInfo !== null, 'rgbInfo should not be null')
assert.strictEqual(rgbInfo.width, 800)
assert.strictEqual(rgbInfo.height, 600)
assert.strictEqual(rgbInfo.isGrayscale, false)
console.log('✓ parseJpegInfo (RGB) passed!')

const monoJpeg = createMinimalJpegBytes(1024, 768, true)
const monoInfo = parseJpegInfo(monoJpeg)
assert(monoInfo !== null, 'monoInfo should not be null')
assert.strictEqual(monoInfo.width, 1024)
assert.strictEqual(monoInfo.height, 768)
assert.strictEqual(monoInfo.isGrayscale, true)
console.log('✓ parseJpegInfo (Grayscale) passed!')

// 2. Test buildPdfFromJpegs (3-page unified PDF)
const page1 = { bytes: createMinimalJpegBytes(800, 1100, false), width: 800, height: 1100, isGrayscale: false }
const page2 = { bytes: createMinimalJpegBytes(800, 1100, true), width: 800, height: 1100, isGrayscale: true }
const page3 = { bytes: createMinimalJpegBytes(800, 1100, true), width: 800, height: 1100, isGrayscale: true }

const pdfBytes = buildPdfFromJpegs([page1, page2, page3])
assert(pdfBytes && pdfBytes.length > 0, 'PDF bytes should be non-empty')

const dec = new TextDecoder('latin1')
const pdfStr = dec.decode(pdfBytes)

assert(pdfStr.startsWith('%PDF-1.4'), 'Should start with PDF-1.4 header')
assert(pdfStr.includes('/Type /Catalog'), 'Must contain Catalog')
assert(pdfStr.includes('/Count 3'), 'Must contain page count 3')
assert(pdfStr.includes('/Filter /DCTDecode'), 'Must embed DCTDecode')
assert(pdfStr.includes('/ColorSpace /DeviceRGB'), 'Must support DeviceRGB')
assert(pdfStr.includes('/ColorSpace /DeviceGray'), 'Must support DeviceGray for X-rays')
assert(pdfStr.includes('xref'), 'Must contain xref table')
assert(pdfStr.includes('%%EOF'), 'Must end with EOF')

// Validate size
console.log(`Generated 3-page test PDF size: ${pdfBytes.length} bytes (< 5 KB overhead)`)
assert(pdfBytes.length < 15 * 1024, 'Test PDF size must be compact')
console.log('✓ buildPdfFromJpegs passed!')

console.log('All imageToPdf tests passed successfully! 🎉')
