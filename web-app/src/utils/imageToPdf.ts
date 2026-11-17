/**
 * Client-side Multi-Image to PDF Converter & Compressor for Dactor Web Portal.
 * Automatically stitches multiple diagnostic images (X-rays, blood reports, urine panels, scans)
 * into a single unified multi-page PDF document, aggressively compressed to <= 100 KB.
 * Zero external dependencies: uses native HTML5 Canvas + raw DCTDecode PDF 1.4 stream encoding.
 */

export interface JpegPageData {
  bytes: Uint8Array
  width: number
  height: number
  isGrayscale: boolean
}

export interface ConvertedPdfResult {
  file: File
  originalSizeBytes: number
  compressedSizeBytes: number
  pageCount: number
  summary: string
}

const LAB_REPORT_MAX_BYTES = 100 * 1024 // 100 KB strict ceiling

export function formatByteSize(bytes: number): string {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
  }
  if (bytes >= 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`
  }
  return `${bytes} B`
}

/**
 * Parses raw JPEG bytes to extract width, height, and whether it has 1 component (grayscale).
 */
export function parseJpegInfo(bytes: Uint8Array): { width: number; height: number; isGrayscale: boolean } | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    return null
  }
  let offset = 2
  while (offset + 4 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset++
      continue
    }
    const marker = bytes[offset + 1]
    offset += 2
    if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) {
      continue
    }
    if (offset + 2 > bytes.length) break
    const length = (bytes[offset] << 8) | bytes[offset + 1]
    if (length < 2) break

    // SOF0 (0xC0), SOF1 (0xC1), SOF2 (0xC2)
    if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2) {
      if (offset + 8 <= bytes.length) {
        const height = (bytes[offset + 3] << 8) | bytes[offset + 4]
        const width = (bytes[offset + 5] << 8) | bytes[offset + 6]
        const components = bytes[offset + 7]
        return {
          width,
          height,
          isGrayscale: components === 1,
        }
      }
      break
    }
    offset += length
  }
  return null
}

/**
 * Builds a valid PDF 1.4 document embedding the JPEG pages via /Filter /DCTDecode.
 */
export function buildPdfFromJpegs(pages: JpegPageData[]): Uint8Array {
  if (pages.length === 0) {
    throw new Error('At least one page is required to build a PDF')
  }

  const chunks: Uint8Array[] = []
  const offsets: number[] = []
  let currentOffset = 0

  function writeAscii(str: string) {
    const enc = new TextEncoder()
    const bytes = enc.encode(str)
    chunks.push(bytes)
    currentOffset += bytes.length
  }

  function writeRaw(bytes: Uint8Array) {
    chunks.push(bytes)
    currentOffset += bytes.length
  }

  function writeObject(contentFn: () => void): number {
    offsets.push(currentOffset)
    const objNum = offsets.length
    writeAscii(`${objNum} 0 obj\n`)
    contentFn()
    writeAscii('\nendobj\n')
    return objNum
  }

  // 1. Header
  writeAscii('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n')

  const pageCount = pages.length

  // Obj 1: Catalog
  writeObject(() => {
    writeAscii('<< /Type /Catalog /Pages 2 0 R >>')
  })

  // Obj 2: Pages Tree
  writeObject(() => {
    const kids = Array.from({ length: pageCount }, (_, i) => `${3 + 3 * i} 0 R`).join(' ')
    writeAscii(`<< /Type /Pages /Kids [ ${kids} ] /Count ${pageCount} >>`)
  })

  // Write pages
  for (let i = 0; i < pageCount; i++) {
    const page = pages[i]
    const imageObjNum = 4 + 3 * i
    const contentsObjNum = 5 + 3 * i

    const safeW = page.width > 0 ? page.width : 595
    const safeH = page.height > 0 ? page.height : 842
    const mediaWPt = 595.28
    const mediaHPt = Number(((mediaWPt * safeH) / safeW).toFixed(2))

    // Page object
    writeObject(() => {
      writeAscii(
        `<< /Type /Page /Parent 2 0 R /MediaBox [ 0 0 ${mediaWPt} ${mediaHPt} ] ` +
          `/Resources << /XObject << /Im${i} ${imageObjNum} 0 R >> >> ` +
          `/Contents ${contentsObjNum} 0 R >>`
      )
    })

    // Image XObject with direct DCTDecode
    const colorSpace = page.isGrayscale ? '/DeviceGray' : '/DeviceRGB'
    writeObject(() => {
      writeAscii(
        `<< /Type /XObject /Subtype /Image /Width ${page.width} /Height ${page.height} ` +
          `/ColorSpace ${colorSpace} /BitsPerComponent 8 /Filter /DCTDecode /Length ${page.bytes.length} >>\nstream\n`
      )
      writeRaw(page.bytes)
      writeAscii('\nendstream')
    })

    // Content Stream
    const streamContent = `q ${mediaWPt} 0 0 ${mediaHPt} 0 0 cm /Im${i} Do Q\n`
    const enc = new TextEncoder()
    const streamBytes = enc.encode(streamContent)
    writeObject(() => {
      writeAscii(`<< /Length ${streamBytes.length} >>\nstream\n`)
      writeRaw(streamBytes)
      writeAscii('endstream')
    })
  }

  // Cross-reference table
  const startXref = currentOffset
  const totalObjects = offsets.length
  writeAscii(`xref\n0 ${totalObjects + 1}\n`)
  writeAscii('0000000000 65535 f \n')
  for (const offset of offsets) {
    writeAscii(`${String(offset).padStart(10, '0')} 00000 n \n`)
  }

  // Trailer
  writeAscii(`trailer\n<< /Size ${totalObjects + 1} /Root 1 0 R >>\n`)
  writeAscii(`startxref\n${startXref}\n%%EOF\n`)

  // Concatenate chunks
  const totalLength = chunks.reduce((acc, c) => acc + c.length, 0)
  const result = new Uint8Array(totalLength)
  let pos = 0
  for (const c of chunks) {
    result.set(c, pos)
    pos += c.length
  }
  return result
}

/**
 * Checks if a canvas context is predominantly monochrome (e.g. X-rays, black & white printed reports).
 */
function isCanvasMonochrome(ctx: CanvasRenderingContext2D, width: number, height: number): boolean {
  try {
    const stepX = Math.max(1, Math.floor(width / 10))
    const stepY = Math.max(1, Math.floor(height / 10))
    let totalDiff = 0
    let samples = 0

    // Sample pixels across image
    const imgData = ctx.getImageData(0, 0, width, height)
    const data = imgData.data

    for (let y = 0; y < height; y += stepY) {
      for (let x = 0; x < width; x += stepX) {
        const idx = (y * width + x) * 4
        const r = data[idx]
        const g = data[idx + 1]
        const b = data[idx + 2]
        const maxC = Math.max(r, g, b)
        const minC = Math.min(r, g, b)
        totalDiff += maxC - minC
        samples++
      }
    }
    const avgDiff = samples > 0 ? totalDiff / samples : 0
    return avgDiff < 18
  } catch {
    return false
  }
}

/**
 * Loads a File or Blob into an HTMLImageElement.
 */
function loadImage(file: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = (err) => {
      URL.revokeObjectURL(url)
      reject(err)
    }
    img.src = url
  })
}

/**
 * Compresses an image onto a canvas and extracts a JPEG buffer <= maxBytes.
 */
async function compressImageToJpeg(
  img: HTMLImageElement,
  maxBytes: number,
  maxDim: number
): Promise<JpegPageData> {
  let width = img.naturalWidth || img.width
  let height = img.naturalHeight || img.height

  if (width > maxDim || height > maxDim) {
    if (width > height) {
      height = Math.round((height * maxDim) / width)
      width = maxDim
    } else {
      width = Math.round((width * maxDim) / height)
      height = maxDim
    }
  }

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not get 2D canvas context')

  // Draw white background
  ctx.fillStyle = '#FFFFFF'
  ctx.fillRect(0, 0, width, height)
  ctx.drawImage(img, 0, 0, width, height)

  const isMono = isCanvasMonochrome(ctx, width, height)
  if (isMono) {
    // Apply grayscale + slight contrast boost for medical report text & X-ray bone visibility
    const imgData = ctx.getImageData(0, 0, width, height)
    const data = imgData.data
    const contrast = 1.12
    const factor = (259 * (contrast * 100 + 255)) / (255 * (259 - contrast * 100))
    for (let i = 0; i < data.length; i += 4) {
      const gray = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2])
      const adjusted = Math.min(255, Math.max(0, Math.round(factor * (gray - 128) + 128)))
      data[i] = adjusted
      data[i + 1] = adjusted
      data[i + 2] = adjusted
    }
    ctx.putImageData(imgData, 0, 0)
  }

  const qualities = [0.75, 0.62, 0.50, 0.40, 0.30, 0.22, 0.16]

  for (let pass = 0; pass < 4; pass++) {
    for (const q of qualities) {
      const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/jpeg', q))
      if (!blob) continue
      if (blob.size <= maxBytes) {
        const buf = new Uint8Array(await blob.arrayBuffer())
        const parsed = parseJpegInfo(buf) || { width: canvas.width, height: canvas.height, isGrayscale: isMono }
        return {
          bytes: buf,
          width: parsed.width,
          height: parsed.height,
          isGrayscale: parsed.isGrayscale,
        }
      }
    }

    // Downscale by 75%
    const nextW = Math.max(180, Math.round(canvas.width * 0.75))
    const nextH = Math.max(180, Math.round(canvas.height * 0.75))
    if (nextW === canvas.width && nextH === canvas.height) break

    const tempCanvas = document.createElement('canvas')
    tempCanvas.width = nextW
    tempCanvas.height = nextH
    const tempCtx = tempCanvas.getContext('2d')
    if (tempCtx) {
      tempCtx.fillStyle = '#FFFFFF'
      tempCtx.fillRect(0, 0, nextW, nextH)
      tempCtx.drawImage(canvas, 0, 0, nextW, nextH)
      canvas.width = nextW
      canvas.height = nextH
      ctx.drawImage(tempCanvas, 0, 0)
    }
  }

  // Fallback at lowest quality
  const fallbackBlob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/jpeg', 0.18))
  const buf = new Uint8Array(await (fallbackBlob || new Blob()).arrayBuffer())
  return {
    bytes: buf,
    width: canvas.width,
    height: canvas.height,
    isGrayscale: isMono,
  }
}

/**
 * Main export: Converts multiple image files into a single unified PDF <= targetMaxBytes (default 100 KB).
 */
export async function convertImagesToPdf(
  files: (File | Blob)[],
  targetMaxBytes: number = LAB_REPORT_MAX_BYTES,
  baseFileName: string = 'Lab_Report'
): Promise<ConvertedPdfResult> {
  if (files.length === 0) {
    throw new Error('No files provided')
  }

  const pageCount = files.length
  const totalOriginalBytes = files.reduce((acc, f) => acc + f.size, 0)

  const pdfOverhead = pageCount * 360 + 1200
  const maxTotalJpegBytes = Math.max(12 * 1024, targetMaxBytes - pdfOverhead)
  const perPageBudget = Math.max(8 * 1024, Math.floor(maxTotalJpegBytes / pageCount))

  const maxDim =
    pageCount === 1 ? 1200 : pageCount === 2 ? 980 : pageCount === 3 ? 840 : 720

  const pages: JpegPageData[] = []

  for (let i = 0; i < files.length; i++) {
    const file = files[i]
    const img = await loadImage(file)
    const pageData = await compressImageToJpeg(img, perPageBudget, maxDim)
    pages.push(pageData)
  }

  const pdfBytes = buildPdfFromJpegs(pages)
  const pdfBlob = new Blob([pdfBytes.buffer as ArrayBuffer], { type: 'application/pdf' })
  const cleanBase = baseFileName.replace(/\.[^/.]+$/, '').trim() || 'Lab_Report'
  const finalFile = new File([pdfBlob], `${cleanBase}.pdf`, {
    type: 'application/pdf',
    lastModified: Date.now(),
  })

  const origFormatted = formatByteSize(totalOriginalBytes)
  const compFormatted = formatByteSize(pdfBytes.length)
  const capFormatted = formatByteSize(targetMaxBytes)
  const pagesLabel = pageCount > 1 ? ` • ${pageCount} pages` : ''

  const summary = `${origFormatted} → ${compFormatted} (≤ ${capFormatted}${pagesLabel})`

  return {
    file: finalFile,
    originalSizeBytes: totalOriginalBytes,
    compressedSizeBytes: pdfBytes.length,
    pageCount,
    summary,
  }
}
