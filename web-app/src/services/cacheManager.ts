/**
 * Dactor Healthcare Platform: Smart Client-Side Cache Manager
 *
 * Designed to preserve Supabase Free Tier resources (5 GB monthly egress limit)
 * by caching static and slow-moving catalog data (cities, clinics, specialties, services)
 * in memory and localStorage with configurable TTL.
 */

interface CacheEntry<T> {
  data: T
  timestamp: number
  ttlMs: number
}

class CacheManager {
  private memoryCache = new Map<string, CacheEntry<any>>()
  private readonly storagePrefix = 'dactor_cache_'

  /**
   * Retrieves data from cache if valid, otherwise executes the fetcher function,
   * stores the result, and returns it.
   *
   * @param key Unique cache key
   * @param fetcher Async function retrieving data from Supabase
   * @param ttlMinutes Time to live in minutes (default: 10 minutes)
   */
  async getOrFetch<T>(
    key: string,
    fetcher: () => Promise<T>,
    ttlMinutes = 10
  ): Promise<T> {
    const ttlMs = ttlMinutes * 60 * 1000
    const now = Date.now()

    // 1. Check in-memory cache first (fastest)
    const memEntry = this.memoryCache.get(key)
    if (memEntry && now - memEntry.timestamp < memEntry.ttlMs) {
      return memEntry.data as T
    }

    // 2. Check localStorage cache
    try {
      const stored = localStorage.getItem(this.storagePrefix + key)
      if (stored) {
        const parsed: CacheEntry<T> = JSON.parse(stored)
        if (now - parsed.timestamp < parsed.ttlMs) {
          // Re-populate in-memory cache
          this.memoryCache.set(key, parsed)
          return parsed.data
        } else {
          localStorage.removeItem(this.storagePrefix + key)
        }
      }
    } catch {
      // localStorage may fail or be restricted, continue gracefully
    }

    // 3. Cache miss: fetch fresh data from network
    const freshData = await fetcher()

    // 4. Update memory and storage caches
    const entry: CacheEntry<T> = {
      data: freshData,
      timestamp: now,
      ttlMs,
    }

    this.memoryCache.set(key, entry)

    try {
      localStorage.setItem(this.storagePrefix + key, JSON.stringify(entry))
    } catch {
      // Ignore quota exceeded errors gracefully
    }

    return freshData
  }

  /**
   * Invalidates a specific cache key or all keys matching a prefix.
   */
  invalidate(keyOrPrefix?: string) {
    if (!keyOrPrefix) {
      this.memoryCache.clear()
      try {
        const keysToRemove: string[] = []
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i)
          if (k && k.startsWith(this.storagePrefix)) {
            keysToRemove.push(k)
          }
        }
        keysToRemove.forEach((k) => localStorage.removeItem(k))
      } catch {}
      return
    }

    for (const k of this.memoryCache.keys()) {
      if (k.startsWith(keyOrPrefix)) {
        this.memoryCache.delete(k)
      }
    }

    try {
      const keysToRemove: string[] = []
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i)
        if (k && k.startsWith(this.storagePrefix + keyOrPrefix)) {
          keysToRemove.push(k)
        }
      }
      keysToRemove.forEach((k) => localStorage.removeItem(k))
    } catch {}
  }
}

export const cacheManager = new CacheManager()
