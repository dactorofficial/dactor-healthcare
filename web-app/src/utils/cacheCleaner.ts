/**
 * Unified Cache Cleaner for Dactor Web Portal
 * Completely purges all browser CacheStorage, IndexedDB offline database,
 * sessionStorage, and application localStorage cache upon logout.
 */
import { deleteClinicOfflineDb } from '../services/clinicOfflineDb'
import { signOutFirebase, firebaseSignOut } from '../lib/firebase'

export async function clearAllAppCache(): Promise<void> {
  // 1. Browser CacheStorage API (caches)
  if (typeof window !== 'undefined' && 'caches' in window) {
    try {
      const cacheKeys = await window.caches.keys()
      await Promise.all(cacheKeys.map((name) => window.caches.delete(name)))
    } catch (err) {
      console.warn('[CacheCleaner] CacheStorage wipe warning:', err)
    }
  }

  // 2. IndexedDB Offline Database (dactor_clinic_offline_v1)
  try {
    await deleteClinicOfflineDb()
  } catch (err) {
    console.warn('[CacheCleaner] IndexedDB wipe warning:', err)
  }

  // 3. Browser SessionStorage
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      window.sessionStorage.clear()
    }
  } catch (err) {
    console.warn('[CacheCleaner] SessionStorage wipe warning:', err)
  }

  // 4. Browser LocalStorage: Purge all application cache & session keys
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const keysToRemove: string[] = []
      for (let i = 0; i < window.localStorage.length; i++) {
        const key = window.localStorage.key(i)
        if (key && (key.startsWith('dactor_') || key.startsWith('dismiss_'))) {
          keysToRemove.push(key)
        }
      }
      keysToRemove.forEach((key) => window.localStorage.removeItem(key))
    }
  } catch (err) {
    console.warn('[CacheCleaner] LocalStorage wipe warning:', err)
  }

  // 5. Auth SignOut
  try {
    await signOutFirebase().catch(() => {})
    firebaseSignOut()
  } catch {}

  // 6. Broadcast storage event to notify all tabs/components
  try {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('storage'))
    }
  } catch {}
}
