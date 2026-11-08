/**
 * Client-side Image Compressor for Dactor Web Portal
 * Automatically compresses images (bills, receipts, prescriptions, lab reports)
 * to <= 300 KB (target 100 KB - 250 KB) before uploading to Supabase Storage,
 * saving storage while preserving clear readability of medical text and figures.
 */

export interface CompressionResult {
  file: File
  originalSizeKB: number
  compressedSizeKB: number
  compressionRatio: number
}

export async function compressImage(
  file: File,
  maxSizeBytes: number = 300 * 1024, // 300 KB max limit
  targetMaxDim: number = 1600
): Promise<File> {
  // If not an image (e.g. PDF), return original file
  if (!file.type.startsWith('image/')) {
    return file
  }

  // If already significantly small (e.g. <= 120 KB), return original
  if (file.size <= 120 * 1024) {
    return file
  }

  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const img = new Image()
      img.onload = () => {
        let width = img.width
        let height = img.height

        // Downscale large dimensions while preserving aspect ratio
        if (width > targetMaxDim || height > targetMaxDim) {
          if (width > height) {
            height = Math.round((height * targetMaxDim) / width)
            width = targetMaxDim
          } else {
            width = Math.round((width * targetMaxDim) / height)
            height = targetMaxDim
          }
        }

        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height

        const ctx = canvas.getContext('2d')
        if (!ctx) {
          resolve(file)
          return
        }

        // Draw image onto canvas
        ctx.fillStyle = '#FFFFFF'
        ctx.fillRect(0, 0, width, height)
        ctx.drawImage(img, 0, 0, width, height)

        // Iterative compression starting at 0.8 quality down to 0.5 to satisfy maxSizeBytes
        let quality = 0.82
        const mimeType = 'image/jpeg'

        const attemptCompression = (q: number) => {
          canvas.toBlob(
            (blob) => {
              if (!blob) {
                resolve(file)
                return
              }

              if (blob.size <= maxSizeBytes || q <= 0.45) {
                const compressedFile = new File(
                  [blob],
                  file.name.replace(/\.[^/.]+$/, '') + '.jpg',
                  { type: mimeType, lastModified: Date.now() }
                )
                resolve(compressedFile)
              } else {
                // Reduce quality and retry
                attemptCompression(q - 0.12)
              }
            },
            mimeType,
            q
          )
        }

        attemptCompression(quality)
      }

      img.onerror = () => resolve(file)
      img.src = e.target?.result as string
    }

    reader.onerror = () => resolve(file)
    reader.readAsDataURL(file)
  })
}
