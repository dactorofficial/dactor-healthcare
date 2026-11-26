/**
 * Client-side Multi-Image to PDF Converter & Compressor for Dactor Web Portal.
 * Automatically stitches multiple diagnostic images (X-rays, blood reports, urine panels, scans)
 * into a single unified multi-page PDF document, dynamically scaled to <= n * 100 KB.
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

const LAB_REPORT_MAX_BYTES = 100 * 1024 // 100 KB base budget per picture
const MAX_UPLOAD_CAP_BYTES = 10 * 1024 * 1024 // 10 MB hard upload ceiling

export function calculateLabReportBudgetBytes(pageCount: number): number {
  const safePages = Math.max(1, Math.floor(pageCount))
  return Math.min(MAX_UPLOAD_CAP_BYTES, safePages * LAB_REPORT_MAX_BYTES)
}

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
    // Apply grayscale + subtle linear contrast boost (matching Android ColorMatrix 1.12f)
    const imgData = ctx.getImageData(0, 0, width, height)
    const data = imgData.data
    const contrast = 1.12
    for (let i = 0; i < data.length; i += 4) {
      const gray = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2])
      const adjusted = Math.min(255, Math.max(0, Math.round(contrast * (gray - 128) + 128)))
      data[i] = adjusted
      data[i + 1] = adjusted
      data[i + 2] = adjusted
    }
    ctx.putImageData(imgData, 0, 0)
  }

  const encodeBlob = (q: number) =>
    new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/jpeg', q))

  const toPageData = async (blob: Blob): Promise<JpegPageData> => {
    const buf = new Uint8Array(await blob.arrayBuffer())
    const parsed = parseJpegInfo(buf) || {
      width: canvas.width,
      height: canvas.height,
      isGrayscale: isMono,
    }
    return {
      bytes: buf,
      width: parsed.width,
      height: parsed.height,
      isGrayscale: parsed.isGrayscale,
    }
  }

  for (let pass = 0; pass < 4; pass++) {
    // 1. Check highest quality first (0.90)
    const highBlob = await encodeBlob(0.9)
    if (highBlob && highBlob.size <= maxBytes) {
      return toPageData(highBlob)
    }

    // 2. Check lower bound of sharp clinical range (0.42); binary search [0.42..0.90] if it fits
    const lowSharpBlob = await encodeBlob(0.42)
    if (lowSharpBlob && lowSharpBlob.size <= maxBytes) {
      let low = 0.42
      let high = 0.9
      let bestBlob: Blob = lowSharpBlob
      for (let step = 0; step < 4; step++) {
        const mid = Number(((low + high) / 2).toFixed(2))
        const midBlob = await encodeBlob(mid)
        if (midBlob && midBlob.size <= maxBytes) {
          bestBlob = midBlob
          low = mid
        } else {
          high = mid
        }
      }
      return toPageData(bestBlob)
    }

    // 3. Fallback low qualities before downscaling dimensions
    for (const q of [0.34, 0.26, 0.18]) {
      const blob = await encodeBlob(q)
      if (blob && blob.size <= maxBytes) {
        return toPageData(blob)
      }
    }

    // Downscale by 75%
    const nextW = Math.max(200, Math.round(canvas.width * 0.75))
    const nextH = Math.max(200, Math.round(canvas.height * 0.75))
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
  const fallbackBlob = await encodeBlob(0.18)
  const buf = new Uint8Array(await (fallbackBlob || new Blob()).arrayBuffer())
  return {
    bytes: buf,
    width: canvas.width,
    height: canvas.height,
    isGrayscale: isMono,
  }
}

async function reduceJpegPageData(
  page: JpegPageData,
  scaleFactor: number,
  quality: number
): Promise<JpegPageData | null> {
  try {
    const img = await loadImage(new Blob([page.bytes.buffer as ArrayBuffer], { type: 'image/jpeg' }))
    const newW = Math.max(180, Math.round(img.width * scaleFactor))
    const newH = Math.max(180, Math.round(img.height * scaleFactor))
    const canvas = document.createElement('canvas')
    canvas.width = newW
    canvas.height = newH
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.fillStyle = '#FFFFFF'
    ctx.fillRect(0, 0, newW, newH)
    ctx.drawImage(img, 0, 0, newW, newH)
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/jpeg', quality))
    if (!blob) return null
    const buf = new Uint8Array(await blob.arrayBuffer())
    const parsed = parseJpegInfo(buf) || { width: newW, height: newH, isGrayscale: page.isGrayscale }
    return {
      bytes: buf,
      width: parsed.width,
      height: parsed.height,
      isGrayscale: parsed.isGrayscale,
    }
  } catch {
    return null
  }
}

/**
 * Main export: Converts multiple image files into a single unified PDF <= targetMaxBytes (default n * 100 KB).
 */
export async function convertImagesToPdf(
  files: (File | Blob)[],
  targetMaxBytes?: number,
  baseFileName: string = 'Lab_Report'
): Promise<ConvertedPdfResult> {
  if (files.length === 0) {
    throw new Error('No files provided')
  }

  const pageCount = files.length
  const effectiveTargetBytes =
    targetMaxBytes && targetMaxBytes > 0
      ? targetMaxBytes
      : calculateLabReportBudgetBytes(pageCount)
  const totalOriginalBytes = files.reduce((acc, f) => acc + f.size, 0)

  const pdfOverhead = pageCount * 360 + 1200
  const maxTotalJpegBytes = Math.max(12 * 1024, effectiveTargetBytes - pdfOverhead)

  // Keep 1440px max dimension across all page counts since budget scales dynamically at n * 100 KB
  const maxDim = 1440

  let remainingJpegBudget = maxTotalJpegBytes
  const pages: JpegPageData[] = []

  for (let i = 0; i < files.length; i++) {
    const remainingPages = files.length - i
    const perPageBudget = Math.max(8 * 1024, Math.floor(remainingJpegBudget / remainingPages))
    const file = files[i]
    const img = await loadImage(file)
    const pageData = await compressImageToJpeg(img, perPageBudget, maxDim)
    pages.push(pageData)
    remainingJpegBudget = Math.max(8 * 1024, remainingJpegBudget - pageData.bytes.length)
  }

  let currentTotalJpegBytes = pages.reduce((acc, p) => acc + p.bytes.length, 0)
  if (currentTotalJpegBytes > maxTotalJpegBytes) {
    for (let pass = 0; pass < 5; pass++) {
      if (currentTotalJpegBytes <= maxTotalJpegBytes) break
      let largestIdx = 0
      for (let idx = 1; idx < pages.length; idx++) {
        if (pages[idx].bytes.length > pages[largestIdx].bytes.length) {
          largestIdx = idx
        }
      }
      const largest = pages[largestIdx]
      const reduced = await reduceJpegPageData(largest, 0.78, 0.32)
      if (reduced && reduced.bytes.length < largest.bytes.length) {
        pages[largestIdx] = reduced
        currentTotalJpegBytes = pages.reduce((acc, p) => acc + p.bytes.length, 0)
      } else {
        break
      }
    }
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
  const capFormatted = formatByteSize(effectiveTargetBytes)
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
