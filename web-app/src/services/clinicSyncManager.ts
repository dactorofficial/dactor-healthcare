/**
 * Idempotent Bidirectional Cloud Sync Manager for DACTOR Web Clinic Portal
 *
 * Provides:
 * 1. Network transition detection (online/offline events, navigator.onLine)
 * 2. Monotonic FIFO outbox drain with idempotent Supabase PostgreSQL upserts
 * 3. Delta remote updates pull with Last-Write-Wins (LWW) conflict resolution
 * 4. Reactive connectivity state broadcaster for Clinic Portal UI header pills
 * 5. Lifecycle management (init, background interval timer, stop, manual trigger)
 *
 * Zero external npm dependencies outside existing Supabase client.
 */

import { supabase as defaultSupabase } from '../lib/supabase.ts';
import {
  getPendingMutations,
  removeMutation,
  updateMutationRetry,
  getRecord,
  putRecord,
  getSyncMeta,
  setSyncMeta,
  setIndexedDBFactory,
} from './clinicOfflineDb.ts';
import type { OutboxMutation } from './clinicOfflineDb.ts';

export type SyncState = 'online' | 'offline' | 'syncing' | 'error';

export interface SyncStatus {
  state: SyncState;
  pendingCount: number;
  lastSyncTime?: number;
  error?: string;
}

export type SyncStateListener = (status: SyncStatus) => void;

export interface SyncPushResult {
  pushed: number;
  failed: number;
}

export interface SyncPullResult {
  pulled: number;
}

export interface SyncManagerOptions {
  supabaseClient?: any;
  syncIntervalMs?: number;
  autoStart?: boolean;
  onStateChange?: SyncStateListener;
}

/**
 * Normalizes an unknown timestamp representation into epoch milliseconds.
 */
function parseTimestamp(val: any): number {
  if (typeof val === 'number' && !isNaN(val)) return val;
  if (typeof val === 'string') {
    const parsed = Date.parse(val);
    if (!isNaN(parsed)) return parsed;
  }
  return 0;
}

export class ClinicSyncManager {
  public clinicId: string;
  public remoteDb: any;
  public idb: any;
  public isOnline: boolean;
  public state: SyncState;
  public lastSyncTime: number | null = null;
  public lastError: string | null = null;
  public cachedPendingCount: number = 0;

  private listeners: Set<SyncStateListener> = new Set();
  private syncTimer: any = null;
  private syncIntervalMs: number = 30000;
  private isSyncing: boolean = false;
  private onlineHandler: (() => void) | null = null;
  private offlineHandler: (() => void) | null = null;

  constructor(
    clinicId: string,
    idbOrOptions?: any,
    remoteDb?: any,
    options?: SyncManagerOptions
  ) {
    this.clinicId = clinicId;

    // Detect options vs IDB mock injection
    let effectiveOptions: SyncManagerOptions | undefined = options;
    if (idbOrOptions && typeof idbOrOptions === 'object' && !('deleteDatabase' in idbOrOptions) && !('open' in idbOrOptions)) {
      if ('supabaseClient' in idbOrOptions || 'syncIntervalMs' in idbOrOptions || 'autoStart' in idbOrOptions) {
        effectiveOptions = idbOrOptions;
      }
    }

    // Configure remote Supabase client
    if (remoteDb) {
      this.remoteDb = remoteDb;
    } else if (effectiveOptions?.supabaseClient) {
      this.remoteDb = effectiveOptions.supabaseClient;
    } else if (idbOrOptions && typeof idbOrOptions.from === 'function') {
      this.remoteDb = idbOrOptions;
    } else {
      this.remoteDb = defaultSupabase;
    }

    // Configure IndexedDB instance/factory if passed
    if (idbOrOptions && (typeof idbOrOptions.open === 'function' || typeof idbOrOptions.deleteDatabase === 'function')) {
      this.idb = idbOrOptions;
      try {
        setIndexedDBFactory(idbOrOptions);
      } catch (_) {}
    }

    if (effectiveOptions?.syncIntervalMs) {
      this.syncIntervalMs = effectiveOptions.syncIntervalMs;
    }

    // Detect initial online state
    if (typeof navigator !== 'undefined' && typeof navigator.onLine === 'boolean') {
      this.isOnline = navigator.onLine;
    } else {
      this.isOnline = true;
    }
    this.state = this.isOnline ? 'online' : 'offline';

    // Register browser network listeners if in browser environment
    this._attachWindowListeners();

    if (effectiveOptions?.onStateChange) {
      this.subscribe(effectiveOptions.onStateChange);
    }

    if (effectiveOptions?.autoStart) {
      this.start();
    }
  }

  private _attachWindowListeners(): void {
    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      this.onlineHandler = () => {
        this.setOnlineStatus(true);
        this.triggerSync().catch((err) => {
          console.warn('[clinicSyncManager] Auto-sync on reconnection failed:', err);
        });
      };

      this.offlineHandler = () => {
        this.setOnlineStatus(false);
      };

      window.addEventListener('online', this.onlineHandler);
      window.addEventListener('offline', this.offlineHandler);
    }
  }

  private _detachWindowListeners(): void {
    if (typeof window !== 'undefined' && typeof window.removeEventListener === 'function') {
      if (this.onlineHandler) {
        window.removeEventListener('online', this.onlineHandler);
        this.onlineHandler = null;
      }
      if (this.offlineHandler) {
        window.removeEventListener('offline', this.offlineHandler);
        this.offlineHandler = null;
      }
    }
  }

  /**
   * Retrieves count of pending outbox mutations.
   */
  public async _getPendingCount(): Promise<number> {
    try {
      const muts = await getPendingMutations();
      return muts.length;
    } catch {
      return 0;
    }
  }

  /**
   * Broadcasts current state and pending count to all active listeners.
   */
  public async _notify(): Promise<void> {
    const count = await this._getPendingCount();
    this.cachedPendingCount = count;
    const status: SyncStatus = {
      state: this.state,
      pendingCount: count,
      lastSyncTime: this.lastSyncTime ?? undefined,
      error: this.lastError ?? undefined,
    };

    for (const listener of this.listeners) {
      try {
        listener(status);
      } catch (err) {
        console.error('[clinicSyncManager] Error in sync state listener:', err);
      }
    }
  }

  /**
   * Explicitly updates online connectivity status and emits state change.
   */
  public async setOnlineStatus(online: boolean): Promise<void> {
    this.isOnline = online;
    if (!online) {
      this.state = 'offline';
    } else {
      if (this.state === 'offline' || this.state === 'error') {
        this.state = 'online';
      }
    }
    await this._notify();
  }

  /**
   * Subscribes to sync state changes. Returns an idempotent unsubscribe function.
   */
  public subscribe(listener: SyncStateListener): () => void {
    this.listeners.add(listener);

    // Initial synchronous emission with cached/default values
    try {
      listener({
        state: this.state,
        pendingCount: this.cachedPendingCount,
        lastSyncTime: this.lastSyncTime ?? undefined,
        error: this.lastError ?? undefined,
      });
    } catch (err) {
      console.error('[clinicSyncManager] Error in initial listener invocation:', err);
    }

    // Asynchronously resolve fresh pending count and emit update
    this._getPendingCount().then((count) => {
      this.cachedPendingCount = count;
      try {
        listener({
          state: this.state,
          pendingCount: count,
          lastSyncTime: this.lastSyncTime ?? undefined,
          error: this.lastError ?? undefined,
        });
      } catch (err) {
        console.error('[clinicSyncManager] Error in updated listener invocation:', err);
      }
    });

    let unsubscribed = false;
    return () => {
      if (!unsubscribed) {
        unsubscribed = true;
        this.listeners.delete(listener);
      }
    };
  }

  /**
   * Pushes pending outbox mutations sequentially to Supabase PostgreSQL in strict FIFO order.
   */
  public async pushPendingMutations(): Promise<SyncPushResult> {
    if (!this.isOnline) {
      return { pushed: 0, failed: 0 };
    }

    const pending = await getPendingMutations();
    if (pending.length === 0) {
      this.cachedPendingCount = 0;
      return { pushed: 0, failed: 0 };
    }

    // Ensure FIFO ordering by timestamp / monotonic timestamp ascending
    const sorted = [...pending].sort((a, b) => {
      const tsA = (a.timestamp || (a as any).monotonic_ts || 0);
      const tsB = (b.timestamp || (b as any).monotonic_ts || 0);
      return tsA - tsB;
    });

    this.state = 'syncing';
    await this._notify();

    let pushed = 0;
    let failed = 0;

    for (const mut of sorted) {
      try {
        const table = mut.table;
        const payload = mut.payload || {};

        if (mut.action === 'DELETE') {
          const entityId = mut.entityId || payload.id;
          if (entityId) {
            const res = await this.remoteDb.from(table).delete().eq('id', entityId);
            if (res && res.error) {
              throw res.error;
            }
          }
        } else {
          // INSERT, UPDATE, UPSERT: Idempotent upsert on primary key
          const res = await this.remoteDb.from(table).upsert(payload, { onConflict: 'id' });
          if (res && res.error) {
            throw res.error;
          }
        }

        // Successfully pushed: prune from outbox
        await removeMutation(mut.id);
        pushed++;
      } catch (err: any) {
        failed++;
        const errorMessage = err?.message || String(err) || 'Sync upload error';
        this.lastError = errorMessage;
        await updateMutationRetry(mut.id, errorMessage);
        this.state = 'error';
        await this._notify();
        // Halt batch processing immediately to preserve FIFO causal ordering
        return { pushed, failed };
      }
    }

    this.state = 'online';
    this.lastSyncTime = Date.now();
    this.lastError = null;
    await this._notify();

    return { pushed, failed };
  }

  /**
   * Pulls remote delta updates from Supabase tables where updated_at >= last_synced_at,
   * resolving collisions with local IndexedDB via Last-Write-Wins (LWW).
   */
  public async pullRemoteDeltas(clinicId?: string): Promise<SyncPullResult> {
    const targetClinicId = clinicId || this.clinicId;
    if (!this.isOnline) {
      return { pulled: 0 };
    }

    const lastPull =
      (await getSyncMeta<string>('last_synced_at')) ||
      (await getSyncMeta<string>('last_pull_timestamp'));

    let pulled = 0;
    const nowIso = new Date().toISOString();

    // Fetch all pending mutations to protect newer unpushed local modifications
    let pendingMutations: OutboxMutation[] = [];
    try {
      pendingMutations = await getPendingMutations('all');
    } catch (_) {}

    // Pull appointments
    let query = this.remoteDb.from('appointments').select('*').eq('clinic_id', targetClinicId);
    if (lastPull) {
      query = query.gte('updated_at', lastPull);
    }

    try {
      const res = await query;
      const remoteAppts = res?.data || [];

      if (Array.isArray(remoteAppts) && remoteAppts.length > 0) {
        for (const rem of remoteAppts) {
          if (!rem || !rem.id) continue;

          // 1. Check if a local mutation for that record is pending in outbox
          const localPendingMut = pendingMutations.find(
            (m) => m && (m.entityId === rem.id || (m.payload && m.payload.id === rem.id))
          );

          if (localPendingMut) {
            const localMutTs = parseTimestamp(
              localPendingMut.timestamp || (localPendingMut as any).monotonic_ts
            );
            const remoteTs = parseTimestamp(rem.updated_at);

            // Last-Write-Wins: Remote only wins if strictly newer than local outbox mutation
            if (remoteTs > localMutTs) {
              await putRecord('appointments', rem);
              pulled++;
            }
          } else {
            // 2. Check existing record in local IndexedDB
            const local = await getRecord<any>('appointments', rem.id);
            if (!local) {
              await putRecord('appointments', rem);
              pulled++;
            } else {
              const localTs = parseTimestamp(local.updated_at);
              const remoteTs = parseTimestamp(rem.updated_at);

              // Remote overwrites only if strictly greater
              if (remoteTs > localTs) {
                await putRecord('appointments', rem);
                pulled++;
              }
            }
          }
        }
      }
    } catch (err) {
      console.warn('[clinicSyncManager] Appointments delta pull error:', err);
    }

    // Update synchronization metadata markers
    await setSyncMeta('last_synced_at', nowIso);
    await setSyncMeta('last_pull_timestamp', nowIso);

    return { pulled };
  }

  /**
   * Executes a complete bidirectional synchronization cycle (push outbox, then pull deltas).
   */
  public async triggerSync(): Promise<void> {
    if (!this.isOnline) return;
    if (this.isSyncing) return;

    this.isSyncing = true;
    try {
      await this.pushPendingMutations();
      await this.pullRemoteDeltas(this.clinicId);
    } finally {
      this.isSyncing = false;
    }
  }

  /**
   * Starts periodic background synchronization timer.
   */
  public start(intervalMs?: number): void {
    if (intervalMs) {
      this.syncIntervalMs = intervalMs;
    }
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
    }

    this.syncTimer = setInterval(() => {
      if (this.isOnline && !this.isSyncing) {
        this.triggerSync().catch((err) => {
          console.warn('[clinicSyncManager] Background sync error:', err);
        });
      }
    }, this.syncIntervalMs);

    // Initial non-blocking trigger
    this.triggerSync().catch(() => {});
  }

  /**
   * Stops background synchronization timer and unbinds event listeners.
   */
  public stop(): void {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
    }
    this._detachWindowListeners();
  }

  /**
   * Returns current sync status.
   */
  public getStatus(): SyncStatus {
    return {
      state: this.state,
      pendingCount: this.cachedPendingCount,
      lastSyncTime: this.lastSyncTime ?? undefined,
      error: this.lastError ?? undefined,
    };
  }
}

// ============================================================================
// SINGLETON LIFECYCLE MANAGEMENT & FUNCTIONAL API
// ============================================================================

let activeSyncManager: ClinicSyncManager | null = null;

/**
 * Initializes and starts the background sync engine for a specific clinic.
 */
export function initSyncManager(
  clinicId: string,
  options?: SyncManagerOptions
): ClinicSyncManager {
  if (activeSyncManager) {
    activeSyncManager.stop();
  }

  activeSyncManager = new ClinicSyncManager(clinicId, options);
  activeSyncManager.start(options?.syncIntervalMs);
  return activeSyncManager;
}

/**
 * Stops and cleans up the active sync manager singleton.
 */
export function stopSyncManager(): void {
  if (activeSyncManager) {
    activeSyncManager.stop();
    activeSyncManager = null;
  }
}

/**
 * Triggers an immediate push and pull sync cycle on the active sync manager.
 */
export async function triggerSync(): Promise<void> {
  if (activeSyncManager) {
    await activeSyncManager.triggerSync();
  }
}

/**
 * Subscribes to sync state changes on the active sync manager.
 */
export function subscribeSyncState(listener: SyncStateListener): () => void {
  if (activeSyncManager) {
    return activeSyncManager.subscribe(listener);
  }

  // Fallback if not initialized yet
  try {
    listener({ state: 'online', pendingCount: 0 });
  } catch {}
  return () => {};
}

/**
 * Pushes pending outbox mutations on the active sync manager.
 */
export async function pushPendingMutations(): Promise<SyncPushResult> {
  if (activeSyncManager) {
    return activeSyncManager.pushPendingMutations();
  }
  const fallback = new ClinicSyncManager('default');
  return fallback.pushPendingMutations();
}

/**
 * Pulls remote delta updates on the active sync manager.
 */
export async function pullRemoteDeltas(clinicId?: string): Promise<SyncPullResult> {
  if (activeSyncManager) {
    return activeSyncManager.pullRemoteDeltas(clinicId);
  }
  const fallback = new ClinicSyncManager(clinicId || 'default');
  return fallback.pullRemoteDeltas(clinicId);
}

/**
 * Returns the current sync status.
 */
export function getSyncState(): SyncStatus {
  if (activeSyncManager) {
    return activeSyncManager.getStatus();
  }
  return { state: 'online', pendingCount: 0 };
}

/**
 * Manually updates online status for testing or offline simulation.
 */
export async function setOnlineStatus(online: boolean): Promise<void> {
  if (activeSyncManager) {
    await activeSyncManager.setOnlineStatus(online);
  }
}
