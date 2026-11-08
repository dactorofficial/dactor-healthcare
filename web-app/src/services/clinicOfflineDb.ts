/**
 * Browser-Native Offline Database (IndexedDB) for DACTOR Web Clinic Portal
 *
 * Database: dactor_clinic_offline_v1 (Version 1)
 *
 * Manages 10 object stores with indexed lookups:
 * 1. clinic_profile
 * 2. doctors
 * 3. appointments
 * 4. opd_queue
 * 5. invoices
 * 6. billing_items
 * 7. patients
 * 8. slots
 * 9. sync_meta
 * 10. outbox
 *
 * Zero external npm dependencies — built on standard Web IndexedDB API.
 */

export const DB_NAME = 'dactor_clinic_offline_v1';
export const DB_VERSION = 1;

export const CLINIC_OFFLINE_STORES = [
  'clinic_profile',
  'doctors',
  'appointments',
  'opd_queue',
  'invoices',
  'billing_items',
  'patients',
  'slots',
  'sync_meta',
  'outbox',
] as const;

export type ClinicOfflineStoreName = (typeof CLINIC_OFFLINE_STORES)[number];

export interface OutboxMutation {
  id: string; // UUIDv4
  table: string;
  action: 'INSERT' | 'UPDATE' | 'DELETE' | 'UPSERT';
  payload: any;
  timestamp: number; // Monotonic UTC timestamp
  retryCount: number;
  status: 'pending' | 'processing' | 'failed';
  lastError?: string;
  clinicId?: string;
  entityId?: string;
}

export interface SyncMetaRecord {
  key: string;
  value: any;
  updated_at?: number;
}

// In-memory or custom IDBFactory hook (supports testing & mock environments)
let customIndexedDB: IDBFactory | null = null;
let cachedDb: IDBDatabase | null = null;
let initPromise: Promise<IDBDatabase> | null = null;

export function setIndexedDBFactory(factory: IDBFactory | null): void {
  customIndexedDB = factory;
  closeClinicOfflineDb();
}

function getIDBFactory(): IDBFactory {
  if (customIndexedDB) return customIndexedDB;
  if (typeof indexedDB !== 'undefined' && indexedDB !== null) return indexedDB;
  if (typeof window !== 'undefined' && window.indexedDB) return window.indexedDB;
  if (typeof globalThis !== 'undefined' && (globalThis as any).indexedDB) {
    return (globalThis as any).indexedDB;
  }
  throw new Error('IndexedDB is not available in the current environment.');
}

function generateUUID(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function setupStore(
  db: IDBDatabase,
  transaction: IDBTransaction | null,
  name: string,
  keyPath: string,
  indexes: Array<{ name: string; keyPath: string | string[]; unique?: boolean }>
) {
  let store: IDBObjectStore;
  if (!db.objectStoreNames.contains(name)) {
    store = db.createObjectStore(name, { keyPath });
  } else if (transaction) {
    store = transaction.objectStore(name);
  } else {
    return;
  }

  for (const idx of indexes) {
    if (!store.indexNames.contains(idx.name)) {
      store.createIndex(idx.name, idx.keyPath, { unique: !!idx.unique });
    }
  }
}

function createStoresAndIndexes(db: IDBDatabase, transaction: IDBTransaction | null): void {
  // 1. clinic_profile (indexes: id)
  setupStore(db, transaction, 'clinic_profile', 'id', [
    { name: 'id', keyPath: 'id', unique: false },
    { name: 'contact_email', keyPath: 'contact_email', unique: false },
    { name: 'updated_at', keyPath: 'updated_at', unique: false },
  ]);

  // 2. doctors (indexes: id, clinic_id, is_in_clinic)
  setupStore(db, transaction, 'doctors', 'id', [
    { name: 'id', keyPath: 'id', unique: false },
    { name: 'clinic_id', keyPath: 'clinic_id', unique: false },
    { name: 'is_in_clinic', keyPath: 'is_in_clinic', unique: false },
    { name: 'updated_at', keyPath: 'updated_at', unique: false },
  ]);

  // 3. appointments (indexes: id, clinic_id, date, checkin_status, tracking_code, patient_phone)
  setupStore(db, transaction, 'appointments', 'id', [
    { name: 'id', keyPath: 'id', unique: false },
    { name: 'clinic_id', keyPath: 'clinic_id', unique: false },
    { name: 'date', keyPath: 'date', unique: false },
    { name: 'appointment_date', keyPath: 'appointment_date', unique: false },
    { name: 'checkin_status', keyPath: 'checkin_status', unique: false },
    { name: 'tracking_code', keyPath: 'tracking_code', unique: false },
    { name: 'tracking_code_10_digit', keyPath: 'tracking_code_10_digit', unique: false },
    { name: 'patient_phone', keyPath: 'patient_phone', unique: false },
    { name: 'patient_mobile', keyPath: 'patient_mobile', unique: false },
    { name: 'updated_at', keyPath: 'updated_at', unique: false },
  ]);

  // 4. opd_queue (indexes: id, clinic_id, appointment_id, status, token_number)
  setupStore(db, transaction, 'opd_queue', 'id', [
    { name: 'id', keyPath: 'id', unique: false },
    { name: 'clinic_id', keyPath: 'clinic_id', unique: false },
    { name: 'appointment_id', keyPath: 'appointment_id', unique: false },
    { name: 'status', keyPath: 'status', unique: false },
    { name: 'token_number', keyPath: 'token_number', unique: false },
    { name: 'queue_position', keyPath: 'queue_position', unique: false },
    { name: 'updated_at', keyPath: 'updated_at', unique: false },
  ]);

  // 5. invoices (indexes: id, clinic_id, appointment_id, patient_phone, created_at)
  setupStore(db, transaction, 'invoices', 'id', [
    { name: 'id', keyPath: 'id', unique: false },
    { name: 'clinic_id', keyPath: 'clinic_id', unique: false },
    { name: 'appointment_id', keyPath: 'appointment_id', unique: false },
    { name: 'patient_phone', keyPath: 'patient_phone', unique: false },
    { name: 'created_at', keyPath: 'created_at', unique: false },
    { name: 'payment_status', keyPath: 'payment_status', unique: false },
    { name: 'updated_at', keyPath: 'updated_at', unique: false },
  ]);

  // 6. billing_items (indexes: id, invoice_id, clinic_id)
  setupStore(db, transaction, 'billing_items', 'id', [
    { name: 'id', keyPath: 'id', unique: false },
    { name: 'invoice_id', keyPath: 'invoice_id', unique: false },
    { name: 'clinic_id', keyPath: 'clinic_id', unique: false },
    { name: 'category', keyPath: 'category', unique: false },
    { name: 'updated_at', keyPath: 'updated_at', unique: false },
  ]);

  // 7. patients (indexes: id, phone, full_name)
  setupStore(db, transaction, 'patients', 'id', [
    { name: 'id', keyPath: 'id', unique: false },
    { name: 'phone', keyPath: 'phone', unique: false },
    { name: 'full_name', keyPath: 'full_name', unique: false },
    { name: 'clinic_id', keyPath: 'clinic_id', unique: false },
    { name: 'updated_at', keyPath: 'updated_at', unique: false },
  ]);

  // 8. slots (indexes: id, doctor_id, clinic_id, date)
  setupStore(db, transaction, 'slots', 'id', [
    { name: 'id', keyPath: 'id', unique: false },
    { name: 'doctor_id', keyPath: 'doctor_id', unique: false },
    { name: 'clinic_id', keyPath: 'clinic_id', unique: false },
    { name: 'date', keyPath: 'date', unique: false },
    { name: 'slot_date', keyPath: 'slot_date', unique: false },
    { name: 'updated_at', keyPath: 'updated_at', unique: false },
  ]);

  // 9. sync_meta (keyPath: key)
  setupStore(db, transaction, 'sync_meta', 'key', []);

  // 10. outbox (indexes: id, timestamp, table, status)
  setupStore(db, transaction, 'outbox', 'id', [
    { name: 'id', keyPath: 'id', unique: false },
    { name: 'timestamp', keyPath: 'timestamp', unique: false },
    { name: 'table', keyPath: 'table', unique: false },
    { name: 'status', keyPath: 'status', unique: false },
    { name: 'retryCount', keyPath: 'retryCount', unique: false },
  ]);
}

/**
 * Initializes and opens the IndexedDB database dactor_clinic_offline_v1.
 * Creates all 10 object stores and secondary indexes if they do not exist.
 */
export async function initClinicOfflineDb(): Promise<IDBDatabase> {
  if (cachedDb) {
    try {
      if (cachedDb.objectStoreNames.length > 0) {
        return cachedDb;
      }
    } catch (_) {
      cachedDb = null;
    }
  }

  if (initPromise) {
    return initPromise;
  }

  const factory = getIDBFactory();

  initPromise = new Promise<IDBDatabase>((resolve, reject) => {
    let request: IDBOpenDBRequest;
    try {
      request = factory.open(DB_NAME, DB_VERSION);
    } catch (err) {
      initPromise = null;
      return reject(err);
    }

    request.onupgradeneeded = (event: IDBVersionChangeEvent) => {
      const db = request.result;
      const tx = request.transaction;
      createStoresAndIndexes(db, tx);
    };

    request.onsuccess = () => {
      const db = request.result;
      cachedDb = db;
      initPromise = null;

      db.onclose = () => {
        if (cachedDb === db) cachedDb = null;
      };
      db.onversionchange = () => {
        try {
          db.close();
        } catch (_) {}
        if (cachedDb === db) cachedDb = null;
      };

      resolve(db);
    };

    request.onerror = () => {
      initPromise = null;
      reject(request.error || new Error('Failed to open clinic offline IndexedDB database'));
    };

    request.onblocked = () => {
      console.warn(`[clinicOfflineDb] Database upgrade blocked on version ${DB_VERSION}`);
    };
  });

  return initPromise;
}

/**
 * Closes the active IndexedDB connection and resets cache.
 */
export function closeClinicOfflineDb(): void {
  if (cachedDb) {
    try {
      cachedDb.close();
    } catch (_) {}
    cachedDb = null;
  }
  initPromise = null;
}

/**
 * Deletes the IndexedDB database. Useful for resets and unit testing.
 */
export async function deleteClinicOfflineDb(): Promise<void> {
  closeClinicOfflineDb();
  const factory = getIDBFactory();
  return new Promise<void>((resolve, reject) => {
    const req = factory.deleteDatabase(DB_NAME);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error || new Error('Failed to delete clinic offline database'));
    req.onblocked = () => {
      console.warn('[clinicOfflineDb] Database deletion blocked by another connection');
    };
  });
}

/**
 * Retrieves a single record by primary key from the specified object store.
 */
export async function getRecord<T>(
  storeName: ClinicOfflineStoreName | string,
  id: string
): Promise<T | undefined> {
  const db = await initClinicOfflineDb();
  return new Promise<T | undefined>((resolve, reject) => {
    try {
      const tx = db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const req = store.get(id);

      req.onsuccess = () => resolve(req.result ?? undefined);
      req.onerror = () => reject(req.error || new Error(`Failed to get record from ${storeName}`));
      tx.onerror = () => reject(tx.error || new Error(`Transaction error on ${storeName}`));
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Retrieves all records from the specified object store.
 */
export async function getStore<T>(
  storeName: ClinicOfflineStoreName | string
): Promise<T[]> {
  const db = await initClinicOfflineDb();
  return new Promise<T[]>((resolve, reject) => {
    try {
      const tx = db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const req = store.getAll();

      req.onsuccess = () => resolve((req.result as T[]) || []);
      req.onerror = () => reject(req.error || new Error(`Failed to read store ${storeName}`));
      tx.onerror = () => reject(tx.error || new Error(`Transaction error on ${storeName}`));
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Upserts a single record into the specified object store.
 */
export async function putRecord<T>(
  storeName: ClinicOfflineStoreName | string,
  record: T
): Promise<void> {
  const db = await initClinicOfflineDb();
  return new Promise<void>((resolve, reject) => {
    try {
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      store.put(record);

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error(`Failed to put record into ${storeName}`));
      tx.onabort = () => reject(tx.error || new Error(`Transaction aborted on ${storeName}`));
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Upserts multiple records into the specified object store within a single transaction.
 */
export async function putRecords<T>(
  storeName: ClinicOfflineStoreName | string,
  records: T[]
): Promise<void> {
  if (!records || records.length === 0) return;
  const db = await initClinicOfflineDb();
  return new Promise<void>((resolve, reject) => {
    try {
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);

      for (const rec of records) {
        store.put(rec);
      }

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error(`Failed to batch put records into ${storeName}`));
      tx.onabort = () => reject(tx.error || new Error(`Batch transaction aborted on ${storeName}`));
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Deletes a single record by primary key from the specified object store.
 */
export async function deleteRecord(
  storeName: ClinicOfflineStoreName | string,
  id: string
): Promise<void> {
  const db = await initClinicOfflineDb();
  return new Promise<void>((resolve, reject) => {
    try {
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      store.delete(id);

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error(`Failed to delete record ${id} from ${storeName}`));
      tx.onabort = () => reject(tx.error || new Error(`Transaction aborted on ${storeName}`));
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Clears all records from the specified object store.
 */
export async function clearStore(
  storeName: ClinicOfflineStoreName | string
): Promise<void> {
  const db = await initClinicOfflineDb();
  return new Promise<void>((resolve, reject) => {
    try {
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      store.clear();

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error(`Failed to clear store ${storeName}`));
      tx.onabort = () => reject(tx.error || new Error(`Transaction aborted on ${storeName}`));
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Queries records from an object store matching a specific secondary index value.
 */
export async function getRecordsByIndex<T>(
  storeName: ClinicOfflineStoreName | string,
  indexName: string,
  value: IDBValidKey
): Promise<T[]> {
  const db = await initClinicOfflineDb();
  return new Promise<T[]>((resolve, reject) => {
    try {
      const tx = db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const index = store.index(indexName);
      const req = index.getAll(value);

      req.onsuccess = () => resolve((req.result as T[]) || []);
      req.onerror = () => reject(req.error || new Error(`Failed to query index ${indexName} on ${storeName}`));
      tx.onerror = () => reject(tx.error || new Error(`Transaction error on ${storeName}`));
    } catch (err) {
      reject(err);
    }
  });
}

// ============================================================================
// MUTATION OUTBOX QUEUE MANAGEMENT
// ============================================================================

/**
 * Enqueues a mutation into the outbox store.
 * Normalizes ID with UUIDv4, defaults status to 'pending', and ensures monotonic timestamp.
 */
export async function queueMutation(mutation: OutboxMutation): Promise<void> {
  const normalized: OutboxMutation = {
    ...mutation,
    id: mutation.id || generateUUID(),
    table: mutation.table,
    action: mutation.action || 'INSERT',
    payload: mutation.payload !== undefined ? mutation.payload : {},
    timestamp: typeof mutation.timestamp === 'number' && !isNaN(mutation.timestamp)
      ? mutation.timestamp
      : Date.now(),
    retryCount: typeof mutation.retryCount === 'number' && !isNaN(mutation.retryCount)
      ? mutation.retryCount
      : 0,
    status: mutation.status || 'pending',
    lastError: mutation.lastError,
  };

  await putRecord<OutboxMutation>('outbox', normalized);
}

/**
 * Retrieves pending outbox mutations sorted chronologically ascending (FIFO).
 * By default returns mutations with status === 'pending'.
 * Pass statusFilter === 'all' to include failed mutations requiring review.
 */
export async function getPendingMutations(
  statusFilter: 'pending' | 'all' = 'pending'
): Promise<OutboxMutation[]> {
  const all = await getStore<OutboxMutation>('outbox');
  const filtered = statusFilter === 'all'
    ? all.filter((m) => m && (m.status === 'pending' || m.status === 'failed'))
    : all.filter((m) => m && m.status === 'pending');

  return filtered.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
}

/**
 * Removes a mutation from the outbox queue once successfully synced or discarded.
 */
export async function removeMutation(id: string): Promise<void> {
  await deleteRecord('outbox', id);
}

/**
 * Updates a mutation's retry count, records the last error message, and sets its status.
 *
 * @param id The mutation UUID
 * @param error Error description or stack trace
 * @param nextStatus Status to set: defaults to 'failed'.
 */
export async function updateMutationRetry(
  id: string,
  error: string,
  nextStatus: 'pending' | 'failed' = 'failed'
): Promise<void> {
  const mutation = await getRecord<OutboxMutation>('outbox', id);
  if (!mutation) return;

  const updated: OutboxMutation = {
    ...mutation,
    retryCount: (mutation.retryCount || 0) + 1,
    lastError: error,
    status: nextStatus,
  };

  await putRecord<OutboxMutation>('outbox', updated);
}

// ============================================================================
// SYNC METADATA HELPERS
// ============================================================================

/**
 * Retrieves a metadata value from the sync_meta store by key.
 */
export async function getSyncMeta<T = any>(key: string): Promise<T | undefined> {
  const record = await getRecord<SyncMetaRecord>('sync_meta', key);
  if (!record) return undefined;
  if (record && typeof record === 'object' && 'value' in record) {
    return record.value as T;
  }
  return record as unknown as T;
}

/**
 * Sets a metadata key-value pair in the sync_meta store.
 */
export async function setSyncMeta(key: string, value: any): Promise<void> {
  const record: SyncMetaRecord = {
    key,
    value,
    updated_at: Date.now(),
  };
  await putRecord<SyncMetaRecord>('sync_meta', record);
}
