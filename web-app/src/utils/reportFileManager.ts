/**
 * Utility for combined Clinic & Patient report file naming and client-side local caching.
 * Ensures downloaded reports are saved with `{ClinicName}_{PatientName}_{TestName}_{TrackingCode}.{ext}`
 * and can be viewed locally without re-downloading from server.
 */

const STORAGE_PREFIX = 'dactor_report_cached_'
const DOWNLOADED_SET_KEY = 'dactor_downloaded_report_ids'

export function sanitizeFileName(input?: string | null): string {
  if (!input) return ''
  return input
    .trim()
    .replace(/[^a-zA-Z0-9]/g, '_')
    .replace(/_{2,}/g, '_')
    .replace(/^_+|_+$/g, '')
}

export function buildReportFileName(
  clinicName?: string | null,
  patientName?: string | null,
  testName?: string | null,
  trackingCodeOrId?: string | null,
  extension: string = 'pdf'
): string {
  const cleanClinic = sanitizeFileName(clinicName).slice(0, 25) || 'Dactor_Clinic'
  const cleanPatient = sanitizeFileName(patientName).slice(0, 25) || 'Patient'
  const cleanTest = sanitizeFileName(testName).slice(0, 25) || 'Report'
  const cleanRef = sanitizeFileName(trackingCodeOrId).slice(0, 10) || ''
  const ext = extension.replace(/^\./, '').toLowerCase() || 'pdf'

  const base = cleanRef
    ? `${cleanClinic}_${cleanPatient}_${cleanTest}_${cleanRef}`
    : `${cleanClinic}_${cleanPatient}_${cleanTest}`
  return `${base}.${ext}`
}

function getDownloadedSet(): Set<string> {
  try {
    const raw = localStorage.getItem(DOWNLOADED_SET_KEY)
    if (raw) {
      return new Set(JSON.parse(raw))
    }
  } catch (_) {}
  return new Set()
}

function saveDownloadedSet(set: Set<string>): void {
  try {
    localStorage.setItem(DOWNLOADED_SET_KEY, JSON.stringify(Array.from(set)))
  } catch (_) {}
}

export function markReportDownloaded(idOrCode: string): void {
  if (!idOrCode) return
  const set = getDownloadedSet()
  set.add(idOrCode.trim())
  saveDownloadedSet(set)
}

export function isReportDownloadedLocally(idOrCode?: string | null): boolean {
  if (!idOrCode) return false
  const set = getDownloadedSet()
  return set.has(idOrCode.trim())
}

// In-memory / blob URL cache for the current session to avoid re-fetching
const memoryBlobUrls = new Map<string, string>()

export function setCachedBlobUrl(idOrCode: string, url: string): void {
  if (!idOrCode || !url) return
  memoryBlobUrls.set(idOrCode.trim(), url)
  markReportDownloaded(idOrCode)
}

export function getCachedBlobUrl(idOrCode?: string | null): string | null {
  if (!idOrCode) return null
  return memoryBlobUrls.get(idOrCode.trim()) || null
}

/**
 * Downloads file from a remote URL, caches it as a local Blob, and triggers browser file download.
 */
export async function downloadAndCacheReport(
  fileUrl: string,
  fileName: string,
  idOrCode: string
): Promise<string> {
  try {
    const response = await fetch(fileUrl)
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const blob = await response.blob()
    const blobUrl = URL.createObjectURL(blob)

    // Save in memory cache
    setCachedBlobUrl(idOrCode, blobUrl)

    // Trigger browser file download with the combined clinic + patient filename
    const link = document.createElement('a')
    link.href = blobUrl
    link.download = fileName
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)

    return blobUrl
  } catch (err) {
    // Fallback: direct window.open or link click
    const link = document.createElement('a')
    link.href = fileUrl
    link.download = fileName
    link.target = '_blank'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    markReportDownloaded(idOrCode)
    return fileUrl
  }
}
