import {
  getCurrentLoggedInUserEmail,
  isUserMatchingPatientEmail,
  verifyAppointmentOwnership,
  OwnershipVerificationResult,
} from '../services/db'

// In-memory verification cache strictly keyed by tracking code
const verifiedGuestCodes = new Map<string, string>()

export function maskPatientName(rawName?: string | null): string {
  const clean = (rawName || '').trim()
  if (!clean || /^confidential patient$/i.test(clean) || /^patient$/i.test(clean)) {
    return 'Confidential Patient'
  }
  return clean
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => {
      if (word.length <= 1) return '*'
      if (word.length === 2) return `${word[0]}*`
      const stars = '*'.repeat(Math.min(4, word.length - 2))
      return `${word[0]}${stars}${word[word.length - 1]}`
    })
    .join(' ')
}

export function maskMobileNumber(rawPhone?: string | null): string {
  const digits = String(rawPhone || '').replace(/\D/g, '')
  if (digits.length < 4) return '**********'
  return `******${digits.slice(-4)}`
}

export function isTrackingCodeVerifiedInSession(
  trackingCode?: string | null,
  patientEmail?: string | null
): boolean {
  const codeKey = String(trackingCode || '').trim().toUpperCase()
  const loggedEmail = getCurrentLoggedInUserEmail()
  if (loggedEmail && patientEmail && isUserMatchingPatientEmail(patientEmail)) {
    return true
  }
  if (!codeKey) return false
  return verifiedGuestCodes.has(codeKey)
}

export function markTrackingCodeVerified(trackingCode: string, phone: string = 'verified'): void {
  const codeKey = String(trackingCode || '').trim().toUpperCase()
  if (codeKey) {
    verifiedGuestCodes.set(codeKey, phone)
  }
}

export async function checkTrackingCodeAccess(
  trackingCode: string,
  patientEmail?: string | null
): Promise<OwnershipVerificationResult> {
  const codeKey = String(trackingCode || '').trim().toUpperCase()
  if (!codeKey) {
    return { allowed: false, reason: 'invalid_code', message: 'Tracking code is required.' }
  }

  const loggedEmail = getCurrentLoggedInUserEmail()
  if (loggedEmail) {
    const cleanPat = (patientEmail || '').trim().toLowerCase()
    if (cleanPat) {
      if (cleanPat === loggedEmail) {
        markTrackingCodeVerified(codeKey, 'gmail')
        return { allowed: true, reason: 'gmail_matched', message: '' }
      }
      return {
        allowed: false,
        reason: 'gmail_mismatch',
        message: `Tracking code #${codeKey} belongs to a different Gmail account. Please sign in with the registered Gmail.`,
      }
    }
    const res = await verifyAppointmentOwnership(codeKey, loggedEmail, null, true)
    if (res.allowed) markTrackingCodeVerified(codeKey, 'gmail')
    return res
  }

  if (verifiedGuestCodes.has(codeKey)) {
    return { allowed: true, reason: 'phone_matched', message: '' }
  }

  return {
    allowed: false,
    reason: 'requires_phone',
    message: 'Please enter the 10-digit mobile number associated with this tracking code.',
  }
}
