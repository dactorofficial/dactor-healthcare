// Clinic and doctor details for an appointment do not change while a patient tracks it, so the
// live tracker keeps a saved copy instead of re-querying them on every load or refresh.
// Changing values (doctor in clinic, queue position) come from get_live_queue_status instead.

const TTL_MS = 12 * 60 * 60 * 1000

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { savedAt: number; value: T }
    if (!parsed || Date.now() - parsed.savedAt > TTL_MS) return null
    return parsed.value
  } catch {
    return null
  }
}

function write<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify({ savedAt: Date.now(), value }))
  } catch {}
}

/** Saved copy if fresh, else fetch once and save. */
export async function getStaticOnce<T extends { id: string }>(
  kind: 'clinic' | 'doctor',
  id: string,
  fetcher: (id: string) => Promise<T | null>
): Promise<T | null> {
  const key = `dactor_static_${kind}_${id}`
  const saved = read<T>(key)
  if (saved) return saved
  const fresh = await fetcher(id)
  if (fresh) write(key, fresh)
  return fresh
}

/** Store a freshly fetched copy (e.g. after a periodic clinic refresh). */
export function saveStatic<T extends { id: string }>(kind: 'clinic' | 'doctor', value: T | null): void {
  if (value?.id) write(`dactor_static_${kind}_${value.id}`, value)
}
