// Session-scoped authentication storage helper (VULN-015).
// Stores auth tokens, role flags, and user profiles strictly in sessionStorage
// rather than persistent localStorage, migrating/cleaning any legacy entries once.

const AUTH_SESSION_KEYS = [
  'dactor_google_user',
  'dactor_oauth_target_portal',
  'dactor_clinic_logged_in',
  'dactor_clinic_email',
  'dactor_doctor_logged_in',
  'dactor_doctor_session',
  'dactor_doctor_email',
  'dactor_patient_logged_in',
  'dactor_patient_session',
  'dactor_patient_email',
  'dactor_pending_verification',
  'dactor_doctor_pending_kyc',
] as const

export function getAuthStorageItem(key: string): string | null {
  try {
    const val = window.sessionStorage.getItem(key)
    if (val !== null) return val
    const legacy = window.localStorage.getItem(key)
    if (legacy !== null) {
      window.sessionStorage.setItem(key, legacy)
      window.localStorage.removeItem(key)
      return legacy
    }
  } catch {}
  return null
}

export function setAuthStorageItem(key: string, value: string): void {
  try {
    window.sessionStorage.setItem(key, value)
    window.localStorage.removeItem(key)
  } catch {}
}

export function removeAuthStorageItem(key: string): void {
  try {
    window.sessionStorage.removeItem(key)
    window.localStorage.removeItem(key)
  } catch {}
}

export function clearAllAuthStorage(): void {
  for (const key of AUTH_SESSION_KEYS) {
    removeAuthStorageItem(key)
  }
}
