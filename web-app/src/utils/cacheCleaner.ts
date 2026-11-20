/**
 * Unified Cache Cleaner for Dactor Web Portal
 * Completely purges all browser CacheStorage, IndexedDB offline database,
 * sessionStorage, and application localStorage cache upon logout.
 */
import { deleteClinicOfflineDb } from '../services/clinicOfflineDb'
import { signOutFirebase, firebaseSignOut } from '../lib/firebase'
import { supabase } from '../lib/supabase'

export async function clearAllAppCache(): Promise<void> {
  // 1. SYNCHRONOUS PURGE FIRST: Immediately clear application storage and tokens
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const keysToRemove: string[] = []
      for (let i = 0; i < window.localStorage.length; i++) {
        const key = window.localStorage.key(i)
        if (key && (key.startsWith('dactor_') || key.startsWith('dismiss_') || key.startsWith('sb-'))) {
          keysToRemove.push(key)
        }
      }
      keysToRemove.forEach((key) => window.localStorage.removeItem(key))
    }
  } catch (err) {
    console.warn('[CacheCleaner] LocalStorage wipe warning:', err)
  }

  // Purge sessionStorage
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      window.sessionStorage.clear()
    }
  } catch (err) {
    console.warn('[CacheCleaner] SessionStorage wipe warning:', err)
  }

  // 2. IMMEDIATE AUTH SIGN-OUT (Both Firebase & Supabase)
  try {
    firebaseSignOut()
    await signOutFirebase().catch(() => {})
  } catch {}
  try {
    await supabase.auth.signOut().catch(() => {})
  } catch {}

  // 3. Broadcast storage event so all mounted components immediately reset
  try {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('storage'))
    }
  } catch {}

  // 4. SECONDARY ASYNC CLEANUP with strict timeout protection (never hang logout)
  const secondaryCleanup = async () => {
    // Browser CacheStorage API (caches)
    if (typeof window !== 'undefined' && 'caches' in window) {
      try {
        const cacheKeys = await window.caches.keys()
        await Promise.all(cacheKeys.map((name) => window.caches.delete(name)))
      } catch (err) {
        console.warn('[CacheCleaner] CacheStorage wipe warning:', err)
      }
    }

    // IndexedDB Offline Database (dactor_clinic_offline_v1)
    try {
      await deleteClinicOfflineDb()
    } catch (err) {
      console.warn('[CacheCleaner] IndexedDB wipe warning:', err)
    }
  }

  await Promise.race([
    secondaryCleanup(),
    new Promise((resolve) => setTimeout(resolve, 800))
  ])
}

// ---------------------------------------------------------------------------
// Sign-out that hides each account's data instead of deleting it.
// Each account's own localStorage keys are moved into a vault entry named after
// the account's email; they come back when that email signs in again. Shared data
// (browser caches, clinic offline DB, clinic-scoped cached appointments) is kept.
// ---------------------------------------------------------------------------

type AccountRole = 'patient' | 'doctor' | 'clinic'

const PATIENT_EXTRA_KEYS = new Set([
  'dactor_google_user',
  'dactor_pending_booking_redirect',
  'dactor_booking_login_notice',
  'dactor_pending_verification',
  'dactor_pending_online_payment',
  'dactor_pending_esewa_payment',
  'dactor_read_notifications',
])

const ACCOUNT_GROUPS: Record<AccountRole, { emailKey: string; owns: (key: string) => boolean }> = {
  patient: {
    emailKey: 'dactor_patient_email',
    owns: (k) => k.startsWith('dactor_patient_') || PATIENT_EXTRA_KEYS.has(k),
  },
  doctor: {
    emailKey: 'dactor_doctor_email',
    owns: (k) => k.startsWith('dactor_doctor_'),
  },
  clinic: {
    emailKey: 'dactor_clinic_email',
    // Cached appointments are keyed by clinic id, so other clinics never read them
    owns: (k) => k.startsWith('dactor_clinic_') && !k.startsWith('dactor_clinic_cached_appts_'),
  },
}

const vaultKey = (role: AccountRole, email: string) =>
  `dactor_vault__${role}__${email.trim().toLowerCase()}`

/** Move each signed-in account's own keys into its vault (no-op for roles without an email). */
export function hideAccountData(): void {
  if (typeof window === 'undefined' || !window.localStorage) return
  const ls = window.localStorage
  const allKeys: string[] = []
  for (let i = 0; i < ls.length; i++) {
    const k = ls.key(i)
    if (k && !k.startsWith('dactor_vault__')) allKeys.push(k)
  }
  for (const role of Object.keys(ACCOUNT_GROUPS) as AccountRole[]) {
    const group = ACCOUNT_GROUPS[role]
    const email = ls.getItem(group.emailKey)
    if (!email) continue
    const owned = allKeys.filter(group.owns)
    const data: Record<string, string> = {}
    owned.forEach((k) => {
      const v = ls.getItem(k)
      if (v !== null) data[k] = v
    })
    ls.setItem(vaultKey(role, email), JSON.stringify(data))
    owned.forEach((k) => ls.removeItem(k))
  }
}

let restoring = false

/** Bring back an account's hidden keys without overwriting anything the new sign-in just saved. */
export function restoreAccountData(role: AccountRole, email: string): void {
  if (restoring || typeof window === 'undefined' || !window.localStorage || !email) return
  const ls = window.localStorage
  const key = vaultKey(role, email)
  const raw = ls.getItem(key)
  if (!raw) return
  restoring = true
  try {
    const data = JSON.parse(raw) as Record<string, string>
    Object.entries(data).forEach(([k, v]) => {
      if (ls.getItem(k) === null) ls.setItem(k, v)
    })
    ls.removeItem(key)
  } catch {
    // Corrupt vault entry: leave it in place rather than lose it
  } finally {
    restoring = false
  }
}

/**
 * Restore an account's hidden data whenever any sign-in flow saves that account's email.
 * Installed once at startup so the many existing login paths need no changes.
 */
export function installAccountRestoreHook(): void {
  if (typeof window === 'undefined' || !window.localStorage) return
  const proto = Object.getPrototypeOf(window.localStorage) as Storage
  const marker = '__dactorAccountRestoreHook'
  if ((proto as any)[marker]) return
  const originalSetItem = proto.setItem
  proto.setItem = function (this: Storage, key: string, value: string) {
    if (this === window.localStorage && !restoring && value) {
      for (const role of Object.keys(ACCOUNT_GROUPS) as AccountRole[]) {
        if (ACCOUNT_GROUPS[role].emailKey === key) restoreAccountData(role, value)
      }
    }
    return originalSetItem.call(this, key, value)
  }
  ;(proto as any)[marker] = true
}

/** Sign out, keeping everything in this browser: the account's own data is hidden, not deleted. */
export async function signOutKeepingData(): Promise<void> {
  // Per-tab temporary state only
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) window.sessionStorage.clear()
  } catch {}

  try {
    hideAccountData()
  } catch (err) {
    console.warn('[CacheCleaner] Hide account data warning:', err)
  }

  try {
    await signOutFirebase().catch(() => {})
    firebaseSignOut()
  } catch {}

  try {
    if (typeof window !== 'undefined') window.dispatchEvent(new Event('storage'))
  } catch {}
}
