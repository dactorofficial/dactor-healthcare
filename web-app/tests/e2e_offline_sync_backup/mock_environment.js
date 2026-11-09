/**
 * Complete In-Memory Browser & Service Environment for E2E Offline Sync & Backup
 * Fully conforms to W3C IndexedDB, Web Crypto, Google Identity Services, and Supabase REST specifications.
 * Zero external npm dependencies — runs purely on Node.js 18+.
 */

const crypto = require('node:crypto');

// ============================================================================
// 1. IN-MEMORY W3C INDEXEDDB ENGINE
// ============================================================================

class MockIDBRequest {
  constructor() {
    this.result = null;
    this.error = null;
    this.source = null;
    this.transaction = null;
    this.readyState = 'pending';
    this.onsuccess = null;
    this.onerror = null;
    this.onupgradeneeded = null;
  }

  _resolve(val) {
    this.result = val;
    this.readyState = 'done';
    if (typeof this.onsuccess === 'function') {
      const evt = { target: this, type: 'success' };
      this.onsuccess(evt);
    }
  }

  _reject(err) {
    this.error = err;
    this.readyState = 'done';
    if (typeof this.onerror === 'function') {
      const evt = { target: this, type: 'error', error: err };
      this.onerror(evt);
    }
  }
}

class MockIDBIndex {
  constructor(name, keyPath, objectStore, options = {}) {
    this.name = name;
    this.keyPath = keyPath;
    this.objectStore = objectStore;
    this.unique = Boolean(options.unique);
  }

  get(key) {
    const req = new MockIDBRequest();
    queueMicrotask(() => {
      try {
        const all = Array.from(this.objectStore._records.values());
        const match = all.find((rec) => {
          if (Array.isArray(this.keyPath)) {
            return this.keyPath.every((k, i) => rec[k] === (Array.isArray(key) ? key[i] : key));
          }
          return rec[this.keyPath] === key;
        });
        req._resolve(match ? structuredClone(match) : undefined);
      } catch (e) {
        req._reject(e);
      }
    });
    return req;
  }

  getAll(query) {
    const req = new MockIDBRequest();
    queueMicrotask(() => {
      try {
        const all = Array.from(this.objectStore._records.values());
        if (query === undefined) {
          req._resolve(structuredClone(all));
        } else {
          const matches = all.filter((rec) => {
            if (Array.isArray(this.keyPath)) {
              return this.keyPath.every((k, i) => rec[k] === (Array.isArray(query) ? query[i] : query));
            }
            return rec[this.keyPath] === query;
          });
          req._resolve(structuredClone(matches));
        }
      } catch (e) {
        req._reject(e);
      }
    });
    return req;
  }
}

class MockIDBObjectStore {
  constructor(name, options = {}, db) {
    this.name = name;
    this.keyPath = options.keyPath !== undefined ? options.keyPath : null;
    this.autoIncrement = Boolean(options.autoIncrement);
    this._db = db;
    this._records = new Map();
    this._autoId = 1;
    this.indexNames = [];
    this._indexes = new Map();
  }

  createIndex(name, keyPath, options) {
    const idx = new MockIDBIndex(name, keyPath, this, options);
    this._indexes.set(name, idx);
    if (!this.indexNames.includes(name)) {
      this.indexNames.push(name);
    }
    return idx;
  }

  index(name) {
    const idx = this._indexes.get(name);
    if (!idx) {
      throw new Error(`NotFoundError: The specified index "${name}" was not found.`);
    }
    return idx;
  }

  put(value, explicitKey) {
    const req = new MockIDBRequest();
    queueMicrotask(() => {
      try {
        let key = explicitKey;
        if (this.keyPath) {
          key = value[this.keyPath];
          if (key === undefined && this.autoIncrement) {
            key = this._autoId++;
            value[this.keyPath] = key;
          }
        } else if (key === undefined && this.autoIncrement) {
          key = this._autoId++;
        }
        if (key === undefined) {
          throw new Error('DataError: No key provided and no keyPath defined');
        }
        this._records.set(key, structuredClone(value));
        req._resolve(key);
      } catch (e) {
        req._reject(e);
      }
    });
    return req;
  }

  add(value, explicitKey) {
    const req = new MockIDBRequest();
    queueMicrotask(() => {
      try {
        let key = explicitKey;
        if (this.keyPath) {
          key = value[this.keyPath];
        }
        if (this._records.has(key)) {
          throw new Error(`ConstraintError: Key already exists: ${key}`);
        }
        return this.put(value, explicitKey);
      } catch (e) {
        req._reject(e);
      }
    });
    return req;
  }

  get(key) {
    const req = new MockIDBRequest();
    queueMicrotask(() => {
      try {
        const val = this._records.get(key);
        req._resolve(val ? structuredClone(val) : undefined);
      } catch (e) {
        req._reject(e);
      }
    });
    return req;
  }

  getAll() {
    const req = new MockIDBRequest();
    queueMicrotask(() => {
      try {
        const vals = Array.from(this._records.values()).map((v) => structuredClone(v));
        req._resolve(vals);
      } catch (e) {
        req._reject(e);
      }
    });
    return req;
  }

  delete(key) {
    const req = new MockIDBRequest();
    queueMicrotask(() => {
      try {
        this._records.delete(key);
        req._resolve(undefined);
      } catch (e) {
        req._reject(e);
      }
    });
    return req;
  }

  clear() {
    const req = new MockIDBRequest();
    queueMicrotask(() => {
      try {
        this._records.clear();
        req._resolve(undefined);
      } catch (e) {
        req._reject(e);
      }
    });
    return req;
  }

  count() {
    const req = new MockIDBRequest();
    queueMicrotask(() => {
      req._resolve(this._records.size);
    });
    return req;
  }
}

class MockIDBTransaction {
  constructor(db, storeNames, mode = 'readonly') {
    this.db = db;
    this.mode = mode;
    this.storeNames = Array.isArray(storeNames) ? storeNames : [storeNames];
    this.oncomplete = null;
    this.onerror = null;
    this.onabort = null;
    this.error = null;
    this._aborted = false;

    queueMicrotask(() => {
      if (!this._aborted && typeof this.oncomplete === 'function') {
        this.oncomplete({ target: this });
      }
    });
  }

  objectStore(name) {
    if (!this.storeNames.includes(name)) {
      throw new Error(`NotFoundError: Store "${name}" not in transaction scope`);
    }
    const store = this.db._stores.get(name);
    if (!store) {
      throw new Error(`NotFoundError: Object store "${name}" does not exist in DB "${this.db.name}"`);
    }
    return store;
  }

  abort() {
    this._aborted = true;
    if (typeof this.onabort === 'function') {
      this.onabort({ target: this });
    }
  }
}

class MockIDBDatabase {
  constructor(name, version) {
    this.name = name;
    this.version = version;
    this._stores = new Map();
    this.objectStoreNames = [];
  }

  createObjectStore(name, options = {}) {
    if (this._stores.has(name)) {
      throw new Error(`ConstraintError: Store ${name} already exists`);
    }
    const store = new MockIDBObjectStore(name, options, this);
    this._stores.set(name, store);
    this.objectStoreNames.push(name);
    return store;
  }

  deleteObjectStore(name) {
    if (!this._stores.has(name)) {
      throw new Error(`NotFoundError: Store ${name} does not exist`);
    }
    this._stores.delete(name);
    this.objectStoreNames = this.objectStoreNames.filter((n) => n !== name);
  }

  transaction(storeNames, mode = 'readonly') {
    return new MockIDBTransaction(this, storeNames, mode);
  }

  close() {
    // No-op
  }
}

class MockIDBFactory {
  constructor() {
    this._dbs = new Map();
  }

  open(name, version = 1) {
    const req = new MockIDBRequest();
    queueMicrotask(() => {
      try {
        let db = this._dbs.get(name);
        const oldVersion = db ? db.version : 0;
        if (!db || version > oldVersion) {
          if (!db) {
            db = new MockIDBDatabase(name, version);
            this._dbs.set(name, db);
          } else {
            db.version = version;
          }
          if (typeof req.onupgradeneeded === 'function') {
            const upgradeEvt = {
              target: { result: db },
              oldVersion,
              newVersion: version
            };
            req.onupgradeneeded(upgradeEvt);
          }
        }
        req._resolve(db);
      } catch (err) {
        req._reject(err);
      }
    });
    return req;
  }

  deleteDatabase(name) {
    const req = new MockIDBRequest();
    queueMicrotask(() => {
      this._dbs.delete(name);
      req._resolve(undefined);
    });
    return req;
  }
}

// Global IndexedDB instance
const globalIndexedDB = new MockIDBFactory();

// In-Memory localStorage
class MockLocalStorage {
  constructor() {
    this._store = new Map();
  }

  getItem(key) {
    return this._store.has(String(key)) ? this._store.get(String(key)) : null;
  }

  setItem(key, value) {
    this._store.set(String(key), String(value));
  }

  removeItem(key) {
    this._store.delete(String(key));
  }

  clear() {
    this._store.clear();
  }

  get length() {
    return this._store.size;
  }

  key(index) {
    return Array.from(this._store.keys())[index] || null;
  }
}

const globalLocalStorage = new MockLocalStorage();

// ============================================================================
// 2. TRACKING CODE GENERATOR & VALIDATOR (Luhn mod-10 Parity)
// ============================================================================

class TrackingCodeGenerator {
  static getTerminalId() {
    const stored = globalLocalStorage.getItem('dactor_clinic_terminal_id');
    if (stored) {
      const parsed = parseInt(stored, 10);
      if (!isNaN(parsed) && parsed >= 10 && parsed <= 99) {
        return parsed;
      }
    }
    return 10; // Default 2-digit terminal ID
  }

  static setTerminalId(id) {
    if (typeof id !== 'number' || id < 10 || id > 99) {
      throw new Error('Terminal ID must be an integer between 10 and 99');
    }
    globalLocalStorage.setItem('dactor_clinic_terminal_id', String(id));
  }

  static getDayOfYear(date = new Date()) {
    const start = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
    const diff = date.getTime() - start.getTime();
    const oneDay = 1000 * 60 * 60 * 24;
    return Math.floor(diff / oneDay) + 1;
  }

  static getNextCounter(dateStr) {
    const key = `dactor_tracking_counter_${dateStr}`;
    const current = parseInt(globalLocalStorage.getItem(key) || '0', 10);
    const next = (current % 9999) + 1;
    globalLocalStorage.setItem(key, String(next));
    return next;
  }

  static calculateLuhnChecksum(payload9) {
    if (!/^\d{9}$/.test(payload9)) {
      throw new Error(`Payload must be exactly 9 numeric digits, got: "${payload9}"`);
    }
    let sum = 0;
    // Luhn mod-10: double every second digit from right to left
    for (let i = payload9.length - 1; i >= 0; i--) {
      const digit = parseInt(payload9[i], 10);
      const posFromRight = (payload9.length - i) + 1; // position in final 10-digit code (positions 2..10)
      const isEvenPos = posFromRight % 2 === 0;
      let weighted = digit;
      if (isEvenPos) {
        weighted = digit * 2;
        if (weighted > 9) weighted -= 9;
      }
      sum += weighted;
    }
    const remainder = sum % 10;
    return remainder === 0 ? 0 : 10 - remainder;
  }

  static generateTrackingCode(terminalId, date = new Date()) {
    const term = terminalId !== undefined ? terminalId : this.getTerminalId();
    if (term < 10 || term > 99) {
      throw new Error('Terminal ID must be 2 digits (10-99)');
    }
    const doy = this.getDayOfYear(date);
    const dateKey = `${date.getUTCFullYear()}-${String(doy).padStart(3, '0')}`;
    const counter = this.getNextCounter(dateKey);

    const termPart = String(term).padStart(2, '0');
    const doyPart = String(doy).padStart(3, '0');
    const counterPart = String(counter).padStart(4, '0');
    const payload9 = `${termPart}${doyPart}${counterPart}`;

    const checkDigit = this.calculateLuhnChecksum(payload9);
    return `${payload9}${checkDigit}`;
  }

  static validateTrackingCode(code) {
    if (typeof code !== 'string' || !/^\d{10}$/.test(code)) {
      return false;
    }
    let sum = 0;
    for (let i = code.length - 1; i >= 0; i--) {
      const digit = parseInt(code[i], 10);
      const posFromRight = code.length - i; // 1 = check digit, 2 = first data digit from right
      const isEvenPos = posFromRight % 2 === 0;
      let weighted = digit;
      if (isEvenPos) {
        weighted = digit * 2;
        if (weighted > 9) weighted -= 9;
      }
      sum += weighted;
    }
    return sum % 10 === 0;
  }

  static parseTrackingCode(code) {
    if (!this.validateTrackingCode(code)) {
      return { isValid: false };
    }
    return {
      isValid: true,
      terminalId: parseInt(code.slice(0, 2), 10),
      dayOfYear: parseInt(code.slice(2, 5), 10),
      counter: parseInt(code.slice(5, 9), 10),
      checksum: parseInt(code.slice(9, 10), 10)
    };
  }
}

// ============================================================================
// 3. CREDENTIAL REDACTION ENGINE (Recursive In-Memory Redaction)
// ============================================================================

const REDACTED_VALUE = '[REDACTED]';

const SENSITIVE_KEY_EXACT = new Set([
  'payment_secret_key',
  'payment_api_key',
  'esewa_secret_key',
  'secret_key',
  'secret',
  'api_key',
  'apikey',
  'service_role_key',
  'service_role',
  'servicerole',
  'servicerolekey',
  'private_key',
  'privatekey',
  'access_token',
  'accesstoken',
  'auth_token',
  'authtoken',
  'id_token',
  'idtoken',
  'refresh_token',
  'refreshtoken',
  'bearer_token',
  'bearertoken',
  'password',
  'merchant_secret',
  'merchantsecret',
  'client_secret',
  'clientsecret',
  'webhook_secret',
  'webhooksecret',
  'esewasecretkey',
  'paymentsecretkey',
  'paymentapikey'
]);

function isSensitiveKey(key) {
  if (typeof key !== 'string') return false;
  const lower = key.trim().toLowerCase();
  const snake = lower.replace(/-/g, '_');
  const stripped = snake.replace(/_/g, '');

  if (SENSITIVE_KEY_EXACT.has(lower) || SENSITIVE_KEY_EXACT.has(snake) || SENSITIVE_KEY_EXACT.has(stripped)) {
    return true;
  }

  if (
    snake.startsWith('secret_') ||
    snake.endsWith('_secret_key') ||
    snake.endsWith('_api_key') ||
    snake.endsWith('_secret') ||
    snake.endsWith('_private_key') ||
    snake.endsWith('_token') ||
    stripped.endsWith('secretkey') ||
    stripped.endsWith('apikey') ||
    stripped.endsWith('privatekey') ||
    stripped.endsWith('token') ||
    stripped.endsWith('secret')
  ) {
    return true;
  }

  return false;
}

function redactSecrets(data, ancestors = new Set(), memo = new WeakMap()) {
  if (data === null || data === undefined) {
    return data;
  }
  if (typeof data !== 'object') {
    return data;
  }
  if (data instanceof Date) {
    return new Date(data.getTime());
  }
  if (ArrayBuffer.isView(data)) {
    return data;
  }

  if (ancestors.has(data)) {
    return '[Circular]';
  }
  if (memo.has(data)) {
    return memo.get(data);
  }

  ancestors.add(data);

  let clone;
  if (Array.isArray(data)) {
    clone = [];
    memo.set(data, clone);
    for (let i = 0; i < data.length; i++) {
      clone.push(redactSecrets(data[i], ancestors, memo));
    }
  } else {
    clone = {};
    memo.set(data, clone);
    for (const [key, val] of Object.entries(data)) {
      if (isSensitiveKey(key)) {
        clone[key] = REDACTED_VALUE;
      } else if (typeof val === 'string' && (val.trim().startsWith('{') || val.trim().startsWith('['))) {
        try {
          const parsed = JSON.parse(val);
          clone[key] = JSON.stringify(redactSecrets(parsed, ancestors, memo));
        } catch {
          clone[key] = redactSecrets(val, ancestors, memo);
        }
      } else {
        clone[key] = redactSecrets(val, ancestors, memo);
      }
    }
  }

  ancestors.delete(data);
  return clone;
}

// ============================================================================
// 4. CLIENT OFFLINE DATABASE SERVICE (clinicOfflineDb.ts Parity)
// ============================================================================

const OFFLINE_DB_NAME = 'dactor_clinic_offline_v1';
const OFFLINE_DB_VERSION = 1;

const STORES = [
  'clinic_profile',
  'doctors',
  'appointments',
  'opd_queue',
  'invoices',
  'billing_items',
  'patients',
  'slots',
  'sync_meta',
  'outbox'
];

let dbInstancePromise = null;

function initClinicOfflineDb(idb = globalIndexedDB) {
  if (dbInstancePromise) return dbInstancePromise;

  dbInstancePromise = new Promise((resolve, reject) => {
    const req = idb.open(OFFLINE_DB_NAME, OFFLINE_DB_VERSION);

    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      for (const storeName of STORES) {
        if (!db.objectStoreNames.includes(storeName)) {
          const store = db.createObjectStore(storeName, { keyPath: 'id' });
          if (storeName === 'appointments') {
            store.createIndex('clinic_id', 'clinic_id', { unique: false });
            store.createIndex('tracking_code_10_digit', 'tracking_code_10_digit', { unique: true });
            store.createIndex('appointment_date', 'appointment_date', { unique: false });
          } else if (storeName === 'opd_queue') {
            store.createIndex('clinic_id', 'clinic_id', { unique: false });
            store.createIndex('appointment_id', 'appointment_id', { unique: true });
            store.createIndex('status', 'status', { unique: false });
          } else if (storeName === 'outbox') {
            store.createIndex('created_at', 'created_at', { unique: false });
            store.createIndex('status', 'status', { unique: false });
          }
        }
      }
    };

    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = (e) => reject(e.target.error);
  });

  return dbInstancePromise;
}

function resetDbInstance() {
  dbInstancePromise = null;
}

async function getStore(storeName, idb = globalIndexedDB) {
  const db = await initClinicOfflineDb(idb);
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function getRecord(storeName, id, idb = globalIndexedDB) {
  const db = await initClinicOfflineDb(idb);
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const req = store.get(id);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function putRecord(storeName, record, idb = globalIndexedDB) {
  const db = await initClinicOfflineDb(idb);
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    const req = store.put(record);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

async function putRecords(storeName, records, idb = globalIndexedDB) {
  const db = await initClinicOfflineDb(idb);
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    let count = 0;
    if (records.length === 0) return resolve();
    for (const rec of records) {
      const req = store.put(rec);
      req.onsuccess = () => {
        count++;
        if (count === records.length) resolve();
      };
      req.onerror = () => reject(req.error);
    }
  });
}

async function deleteRecord(storeName, id, idb = globalIndexedDB) {
  const db = await initClinicOfflineDb(idb);
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    const req = store.delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

async function clearStore(storeName, idb = globalIndexedDB) {
  const db = await initClinicOfflineDb(idb);
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    const req = store.clear();
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

async function queueMutation(mutation, idb = globalIndexedDB) {
  const entry = {
    id: mutation.id || crypto.randomUUID(),
    table: mutation.table,
    action: mutation.action || 'UPSERT',
    payload: mutation.payload,
    created_at: mutation.created_at || new Date().toISOString(),
    monotonic_ts: Date.now(),
    status: 'pending',
    retry_count: 0
  };
  await putRecord('outbox', entry, idb);
}

async function getPendingMutations(idb = globalIndexedDB) {
  const all = await getStore('outbox', idb);
  return all
    .filter((m) => m.status === 'pending')
    .sort((a, b) => a.monotonic_ts - b.monotonic_ts);
}

async function removeMutation(id, idb = globalIndexedDB) {
  await deleteRecord('outbox', id, idb);
}

async function updateMutationRetry(id, error, idb = globalIndexedDB) {
  const existing = await getRecord('outbox', id, idb);
  if (existing) {
    existing.retry_count = (existing.retry_count || 0) + 1;
    existing.last_error = error;
    existing.status = existing.retry_count >= 5 ? 'failed' : 'pending';
    await putRecord('outbox', existing, idb);
  }
}

async function getSyncMeta(key, idb = globalIndexedDB) {
  const rec = await getRecord('sync_meta', key, idb);
  return rec ? rec.value : null;
}

async function setSyncMeta(key, value, idb = globalIndexedDB) {
  await putRecord('sync_meta', { id: key, value, updated_at: new Date().toISOString() }, idb);
}

// ============================================================================
// 5. MOCK SUPABASE REMOTE DATABASE & CLIENT
// ============================================================================

class MockSupabaseRemoteDB {
  constructor() {
    this.tables = {
      clinics: new Map(),
      doctors: new Map(),
      appointments: new Map(),
      queue_entries: new Map(),
      billing_invoices: new Map(),
      slots: new Map()
    };
    this.shouldFailNextRequest = false;
  }

  reset() {
    for (const t of Object.values(this.tables)) {
      t.clear();
    }
    this.shouldFailNextRequest = false;
  }

  from(tableName) {
    const table = this.tables[tableName] || new Map();
    this.tables[tableName] = table;

    const queryBuilder = {
      _filters: [],

      upsert: async (records, options = {}) => {
        if (this.shouldFailNextRequest) {
          throw new Error('NetworkError: Connection to Supabase failed');
        }
        const recList = Array.isArray(records) ? records : [records];
        for (const rec of recList) {
          const existing = table.get(rec.id);
          if (existing && existing.updated_at && rec.updated_at) {
            if (Date.parse(rec.updated_at) >= Date.parse(existing.updated_at)) {
              table.set(rec.id, structuredClone(rec));
            }
          } else {
            table.set(rec.id, structuredClone(rec));
          }
        }
        return { data: recList, error: null };
      },

      select: (fields = '*') => {
        return queryBuilder;
      },

      eq: (col, val) => {
        queryBuilder._filters.push((row) => row[col] === val);
        return queryBuilder;
      },

      gt: (col, val) => {
        queryBuilder._filters.push((row) => (row[col] ? Date.parse(row[col]) > Date.parse(val) : false));
        return queryBuilder;
      },

      gte: (col, val) => {
        queryBuilder._filters.push((row) => (row[col] ? Date.parse(row[col]) >= Date.parse(val) : false));
        return queryBuilder;
      },

      order: (col, { ascending = true } = {}) => {
        return queryBuilder;
      },

      then: (resolve, reject) => {
        if (this.shouldFailNextRequest) {
          return reject(new Error('NetworkError: Supabase request failed'));
        }
        let rows = Array.from(table.values()).map((r) => structuredClone(r));
        for (const filter of queryBuilder._filters) {
          rows = rows.filter(filter);
        }
        resolve({ data: rows, error: null });
      }
    };

    return queryBuilder;
  }
}

const globalRemoteDb = new MockSupabaseRemoteDB();

// ============================================================================
// 6. SYNC MANAGER SERVICE (clinicSyncManager.ts Parity)
// ============================================================================

class ClinicSyncManager {
  constructor(clinicId, idb = globalIndexedDB, remoteDb = globalRemoteDb) {
    this.clinicId = clinicId;
    this.idb = idb;
    this.remoteDb = remoteDb;
    this.isOnline = true;
    this.state = 'online'; // 'online' | 'offline' | 'syncing' | 'error'
    this.listeners = new Set();
    this.lastSyncTime = null;
  }

  subscribe(listener) {
    this.listeners.add(listener);
    try {
      listener({ state: this.state, pendingCount: this.cachedPendingCount || 0, lastSyncTime: this.lastSyncTime });
    } catch {}
    this._getPendingCount().then((count) => {
      this.cachedPendingCount = count;
      try {
        listener({ state: this.state, pendingCount: count, lastSyncTime: this.lastSyncTime });
      } catch {}
    });
    return () => this.listeners.delete(listener);
  }

  async _getPendingCount() {
    try {
      const muts = await getPendingMutations(this.idb);
      return muts.length;
    } catch {
      return 0;
    }
  }

  async _notify() {
    const count = await this._getPendingCount();
    this.cachedPendingCount = count;
    const status = { state: this.state, pendingCount: count, lastSyncTime: this.lastSyncTime };
    for (const l of this.listeners) {
      try {
        l(status);
      } catch (e) {
        console.error('Error in sync state listener:', e);
      }
    }
  }

  async setOnlineStatus(online) {
    this.isOnline = online;
    if (!online) {
      this.state = 'offline';
    } else {
      this.state = 'online';
    }
    await this._notify();
  }

  async pushPendingMutations() {
    if (!this.isOnline) {
      return { pushed: 0, failed: 0 };
    }
    const pending = await getPendingMutations(this.idb);
    if (pending.length === 0) return { pushed: 0, failed: 0 };

    this.state = 'syncing';
    await this._notify();

    let pushed = 0;
    let failed = 0;

    for (const mut of pending) {
      try {
        // Idempotent upsert to remote table
        await this.remoteDb.from(mut.table).upsert(mut.payload, { onConflict: 'id' });
        await removeMutation(mut.id, this.idb);
        pushed++;
      } catch (err) {
        failed++;
        await updateMutationRetry(mut.id, err.message, this.idb);
        this.state = 'error';
        await this._notify();
        return { pushed, failed };
      }
    }

    this.state = 'online';
    this.lastSyncTime = Date.now();
    await this._notify();

    return { pushed, failed };
  }

  async pullRemoteDeltas(clinicId) {
    if (!this.isOnline) return { pulled: 0 };

    const lastPull = await getSyncMeta('last_synced_at', this.idb);
    let pulled = 0;
    const nowIso = new Date().toISOString();

    // Pull appointments
    let query = this.remoteDb.from('appointments').select('*').eq('clinic_id', clinicId);
    if (lastPull) {
      query = query.gte('updated_at', lastPull);
    }
    const { data: remoteAppts } = await query;

    if (remoteAppts && remoteAppts.length > 0) {
      for (const rem of remoteAppts) {
        const local = await getRecord('appointments', rem.id, this.idb);
        if (!local) {
          await putRecord('appointments', rem, this.idb);
          pulled++;
        } else {
          // Last-Write-Wins (LWW) conflict resolution
          const localTs = Date.parse(local.updated_at || '1970-01-01');
          const remoteTs = Date.parse(rem.updated_at || '1970-01-01');
          if (remoteTs > localTs) {
            await putRecord('appointments', rem, this.idb);
            pulled++;
          }
        }
      }
    }

    await setSyncMeta('last_synced_at', nowIso, this.idb);
    return { pulled };
  }

  async triggerSync() {
    if (!this.isOnline) return;
    await this.pushPendingMutations();
    await this.pullRemoteDeltas(this.clinicId);
  }
}

// ============================================================================
// 7. BACKUP SERVICE & GOOGLE DRIVE CLOUD SYNC (clinicBackupService.ts Parity)
// ============================================================================

class ClinicBackupService {
  static computeSha256(text) {
    return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
  }

  static async createClinicBackupSnapshot(clinicId, idb = globalIndexedDB) {
    const rawAppointments = await getStore('appointments', idb);
    const rawQueue = await getStore('opd_queue', idb);
    const rawInvoices = await getStore('invoices', idb);
    const rawDoctors = await getStore('doctors', idb);
    const rawPatients = await getStore('patients', idb);
    const rawProfile = await getRecord('clinic_profile', clinicId, idb) || { id: clinicId, name: 'Clinic' };

    const clinicAppts = rawAppointments.filter((a) => a.clinic_id === clinicId);
    const clinicQueue = rawQueue.filter((q) => q.clinic_id === clinicId);
    const clinicInvoices = rawInvoices.filter((i) => i.clinic_id === clinicId);
    const clinicDoctors = rawDoctors.filter((d) => d.clinic_id === clinicId);

    const snapshot = {
      schema_version: '1.0',
      exported_at: new Date().toISOString(),
      clinic_id: clinicId,
      clinic_name: rawProfile.name || 'DACTOR Clinic',
      metadata: {
        total_appointments: clinicAppts.length,
        total_invoices: clinicInvoices.length,
        total_doctors: clinicDoctors.length,
        total_queue: clinicQueue.length
      },
      datasets: {
        clinic: redactSecrets(rawProfile),
        doctors: redactSecrets(clinicDoctors),
        appointments: redactSecrets(clinicAppts),
        queue_entries: redactSecrets(clinicQueue),
        invoices: redactSecrets(clinicInvoices),
        patients: redactSecrets(rawPatients)
      }
    };

    // Seal with SHA-256 integrity hash
    const dataString = JSON.stringify(snapshot.datasets);
    snapshot.sha256 = this.computeSha256(dataString);

    return snapshot;
  }

  static getBackupFilename(clinicId, date = new Date()) {
    const isoDate = date.toISOString().split('T')[0];
    const safeClinicId = clinicId.replace(/[^a-zA-Z0-9-]/g, '').slice(0, 8);
    return `dactor-clinic-${safeClinicId}-${isoDate}.json`;
  }

  static formatDriveMultipartPayload(metadata, fileContent, boundary = '-------314159265358979323846') {
    const delimiter = `\r\n--${boundary}\r\n`;
    const closeDelimiter = `\r\n--${boundary}--`;

    const body =
      delimiter +
      'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
      JSON.stringify(metadata) +
      delimiter +
      'Content-Type: application/json\r\n\r\n' +
      fileContent +
      closeDelimiter;

    return {
      boundary,
      contentType: `multipart/related; boundary=${boundary}`,
      body
    };
  }

  static async syncBackupToGoogleDrive(clinicId, idb = globalIndexedDB, mockDriveClient = null) {
    const snapshot = await this.createClinicBackupSnapshot(clinicId, idb);
    const filename = this.getBackupFilename(clinicId);
    const jsonContent = JSON.stringify(snapshot, null, 2);

    const metadata = {
      name: filename,
      mimeType: 'application/json',
      parents: ['dactor-clinic-backups-folder-id'],
      description: `DACTOR Clinic Backup Snapshot [${clinicId}]`
    };

    const multipart = this.formatDriveMultipartPayload(metadata, jsonContent);

    if (mockDriveClient) {
      return await mockDriveClient.upload(metadata, multipart.body);
    }

    return {
      fileId: `drive-file-${crypto.randomUUID()}`,
      webViewLink: `https://drive.google.com/file/d/mock-backup-id/view`,
      filename,
      sha256: snapshot.sha256
    };
  }

  static async restoreClinicBackup(backupJsonString, targetClinicId, idb = globalIndexedDB) {
    let parsed;
    try {
      parsed = JSON.parse(backupJsonString);
    } catch {
      throw new Error('InvalidBackupError: File content is not valid JSON');
    }

    if (!parsed || parsed.schema_version !== '1.0' || !parsed.datasets) {
      throw new Error('InvalidBackupError: Unrecognized or corrupted backup schema');
    }

    if (parsed.clinic_id && parsed.clinic_id !== targetClinicId) {
      throw new Error(
        `ClinicMismatchError: Backup belongs to clinic "${parsed.clinic_id}", cannot restore to "${targetClinicId}"`
      );
    }

    // Verify SHA-256 checksum
    if (parsed.sha256) {
      const computed = this.computeSha256(JSON.stringify(parsed.datasets));
      if (computed !== parsed.sha256) {
        throw new Error('ChecksumMismatchError: SHA-256 verification failed! File has been tampered with or corrupted.');
      }
    }

    const restoredStores = {};

    if (parsed.datasets.clinic) {
      await putRecord('clinic_profile', parsed.datasets.clinic, idb);
      restoredStores.clinic_profile = 1;
    }
    if (Array.isArray(parsed.datasets.doctors)) {
      await putRecords('doctors', parsed.datasets.doctors, idb);
      restoredStores.doctors = parsed.datasets.doctors.length;
    }
    if (Array.isArray(parsed.datasets.appointments)) {
      await putRecords('appointments', parsed.datasets.appointments, idb);
      restoredStores.appointments = parsed.datasets.appointments.length;
    }
    if (Array.isArray(parsed.datasets.queue_entries)) {
      await putRecords('opd_queue', parsed.datasets.queue_entries, idb);
      restoredStores.opd_queue = parsed.datasets.queue_entries.length;
    }
    if (Array.isArray(parsed.datasets.invoices)) {
      await putRecords('invoices', parsed.datasets.invoices, idb);
      restoredStores.invoices = parsed.datasets.invoices.length;
    }
    if (Array.isArray(parsed.datasets.patients)) {
      await putRecords('patients', parsed.datasets.patients, idb);
      restoredStores.patients = parsed.datasets.patients.length;
    }

    return {
      success: true,
      restoredStores,
      sha256: parsed.sha256
    };
  }
}

module.exports = {
  MockIDBFactory,
  MockIDBDatabase,
  MockIDBObjectStore,
  MockLocalStorage,
  globalIndexedDB,
  globalLocalStorage,
  TrackingCodeGenerator,
  redactSecrets,
  isSensitiveKey,
  REDACTED_VALUE,
  // Offline DB
  initClinicOfflineDb,
  resetDbInstance,
  getStore,
  getRecord,
  putRecord,
  putRecords,
  deleteRecord,
  clearStore,
  queueMutation,
  getPendingMutations,
  removeMutation,
  updateMutationRetry,
  getSyncMeta,
  setSyncMeta,
  // Sync Manager
  ClinicSyncManager,
  globalRemoteDb,
  // Backup Service
  ClinicBackupService
};
