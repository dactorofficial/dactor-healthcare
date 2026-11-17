/**
 * Unified Cache Cleaner for Dactor Admin Panel
 * Completely purges browser CacheStorage, sessionStorage, and application localStorage cache upon logout.
 */
import { supabase } from '../lib/supabase'

export async function clearAllAdminCache(): Promise<void> {
  // 1. Browser CacheStorage API (caches)
  if (typeof window !== 'undefined' && 'caches' in window) {
    try {
      const cacheKeys = await window.caches.keys()
      await Promise.all(cacheKeys.map((name) => window.caches.delete(name)))
    } catch (err) {
      console.warn('[CacheCleaner] Admin CacheStorage wipe warning:', err)
    }
  }

  // 2. Browser SessionStorage
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      window.sessionStorage.clear()
    }
  } catch (err) {
    console.warn('[CacheCleaner] Admin SessionStorage wipe warning:', err)
  }

  // 3. Browser LocalStorage: Purge all admin and application cache keys
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const keysToRemove: string[] = []
      for (let i = 0; i < window.localStorage.length; i++) {
        const key = window.localStorage.key(i)
        if (key && (key.startsWith('dactor_') || key.startsWith('sb-') || key.startsWith('supabase.'))) {
          keysToRemove.push(key)
        }
      }
      keysToRemove.forEach((key) => window.localStorage.removeItem(key))
    }
  } catch (err) {
    console.warn('[CacheCleaner] Admin LocalStorage wipe warning:', err)
  }

  // 4. Supabase SignOut
  try {
    await supabase.auth.signOut()
  } catch {}

  // 5. Broadcast storage event
  try {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('storage'))
    }
  } catch {}
}
