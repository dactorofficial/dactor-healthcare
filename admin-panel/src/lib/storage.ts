import { supabase } from './supabase'

/**
 * Resolves an image URL:
 * - If already a full http/https or data URI, returns as is.
 * - If an invalid Android content URI (content://), returns empty string.
 * - If a relative storage path, resolves via Supabase Storage public URL.
 */
export function resolveImageUrl(url?: string | null, bucket: string = 'clinic_photos'): string {
  if (!url) return ''
  const trimmed = url.trim()
  if (!trimmed) return ''
  if (trimmed.startsWith('content://')) return ''
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('data:')) {
    return trimmed
  }

  // Remove leading bucket name if present (e.g., 'clinic_photos/xyz.jpg' -> 'xyz.jpg')
  const clean = trimmed.replace(new RegExp(`^${bucket}/`), '').replace(/^\//, '')
  const { data } = supabase.storage.from(bucket).getPublicUrl(clean)
  return data?.publicUrl || trimmed
}

/**
 * Uploads an image file to Supabase storage.
 * Tries the primary bucket first, then falls back to other known buckets.
 * If all buckets fail (e.g. permissions or bucket missing), falls back to a base64 Data URL.
 */
export async function uploadImageFile(
  file: File,
  folder: 'clinic_photos' | 'doctor_photos' | 'clinic_logos'
): Promise<string> {
  const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg'
  const sanitizedName = file.name
    .replace(/\.[^/.]+$/, '')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .slice(0, 30)
  const path = `${folder}/${Date.now()}_${sanitizedName}.${ext}`

  const candidateBuckets = folder === 'doctor_photos'
    ? ['doctor_photos', 'clinic_photos']
    : ['clinic_photos', 'doctor_photos']

  const uniqueBuckets = Array.from(new Set(candidateBuckets))

  for (const bucket of uniqueBuckets) {
    try {
      const { error } = await supabase.storage.from(bucket).upload(path, file, {
        upsert: true,
        contentType: file.type || 'image/jpeg',
      })
      if (!error) {
        const { data: publicData } = supabase.storage.from(bucket).getPublicUrl(path)
        if (publicData?.publicUrl) {
          return publicData.publicUrl
        }
      } else {
        console.warn(`Upload to bucket "${bucket}" failed:`, error.message)
      }
    } catch (err) {
      console.warn(`Exception uploading to bucket "${bucket}":`, err)
    }
  }

  // Fallback to base64 Data URL if storage buckets are not configured or fail
  console.warn('Supabase storage upload failed across all buckets. Falling back to inline Data URL.')
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result)
      } else {
        reject(new Error('Failed to convert image to Data URL'))
      }
    }
    reader.onerror = () => reject(new Error('Error reading image file'))
    reader.readAsDataURL(file)
  })
}
