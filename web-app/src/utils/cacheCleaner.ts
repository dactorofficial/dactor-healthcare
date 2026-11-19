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
