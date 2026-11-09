/**
 * Lightweight, Standards-Compliant In-Memory IndexedDB Mock for Unit Testing
 *
 * Implements:
 * - IDBFactory (open, deleteDatabase)
 * - IDBOpenDBRequest / IDBRequest
 * - IDBDatabase (createObjectStore, transaction, close, versionchange)
 * - IDBTransaction (objectStore, oncomplete, onerror, onabort)
 * - IDBObjectStore (createIndex, index, get, getAll, put, delete, clear)
 * - IDBIndex (getAll, get)
 */

export class MockIDBIndex {
  name: string;
  keyPath: string | string[];
  unique: boolean;
  store: MockIDBObjectStore;

  constructor(store: MockIDBObjectStore, name: string, keyPath: string | string[], unique: boolean = false) {
    this.store = store;
    this.name = name;
    this.keyPath = keyPath;
    this.unique = unique;
  }

  getAll(value?: any): MockIDBRequest {
    const req = new MockIDBRequest();
    queueMicrotask(() => {
      const records: any[] = [];
      for (const rec of this.store.data.values()) {
        const val = this.extractKey(rec, this.keyPath);
        if (value === undefined || val === value) {
          records.push(JSON.parse(JSON.stringify(rec)));
        }
      }
      req.result = records;
      req.onsuccess?.({ target: req } as any);
    });
    return req;
  }

  get(value: any): MockIDBRequest {
    const req = new MockIDBRequest();
    queueMicrotask(() => {
      let found: any = undefined;
      for (const rec of this.store.data.values()) {
        const val = this.extractKey(rec, this.keyPath);
        if (val === value) {
          found = JSON.parse(JSON.stringify(rec));
          break;
        }
      }
      req.result = found;
      req.onsuccess?.({ target: req } as any);
    });
    return req;
  }

  private extractKey(obj: any, keyPath: string | string[]): any {
    if (!obj) return undefined;
    if (Array.isArray(keyPath)) {
      return keyPath.map((k) => obj[k]);
    }
    return obj[keyPath];
  }
}

export class MockIDBRequest {
  result: any = null;
  error: Error | null = null;
  onsuccess: ((ev: any) => void) | null = null;
  onerror: ((ev: any) => void) | null = null;
  transaction: any = null;
}

export class MockIDBOpenDBRequest extends MockIDBRequest {
  onupgradeneeded: ((ev: any) => void) | null = null;
  onblocked: ((ev: any) => void) | null = null;
}

export class MockDOMStringList {
  private items: string[] = [];

  constructor(items: string[] = []) {
    this.items = [...items];
  }

  get length(): number {
    return this.items.length;
  }

  contains(val: string): boolean {
    return this.items.includes(val);
  }

  item(index: number): string | null {
    return this.items[index] ?? null;
  }

  [index: number]: string;

  _add(val: string): void {
    if (!this.items.includes(val)) {
      this.items.push(val);
    }
  }

  _remove(val: string): void {
    this.items = this.items.filter((i) => i !== val);
  }
}

export class MockIDBObjectStore {
  name: string;
  keyPath: string;
  data: Map<any, any> = new Map();
  indexes: Map<string, MockIDBIndex> = new Map();
  indexNames: MockDOMStringList = new MockDOMStringList();
  transaction: MockIDBTransaction | null = null;

  constructor(name: string, keyPath: string, transaction: MockIDBTransaction | null = null) {
    this.name = name;
    this.keyPath = keyPath;
    this.transaction = transaction;
  }

  createIndex(name: string, keyPath: string | string[], options?: { unique?: boolean }): MockIDBIndex {
    const idx = new MockIDBIndex(this, name, keyPath, options?.unique ?? false);
    this.indexes.set(name, idx);
    this.indexNames._add(name);
    return idx;
  }

  index(name: string): MockIDBIndex {
    const idx = this.indexes.get(name);
    if (!idx) {
      throw new Error(`NotFoundError: Index "${name}" does not exist on store "${this.name}"`);
    }
    return idx;
  }

  get(key: any): MockIDBRequest {
    const req = new MockIDBRequest();
    queueMicrotask(() => {
      const val = this.data.get(key);
      req.result = val !== undefined ? JSON.parse(JSON.stringify(val)) : undefined;
      req.onsuccess?.({ target: req } as any);
    });
    return req;
  }

  getAll(): MockIDBRequest {
    const req = new MockIDBRequest();
    queueMicrotask(() => {
      req.result = Array.from(this.data.values()).map((v) => JSON.parse(JSON.stringify(v)));
      req.onsuccess?.({ target: req } as any);
    });
    return req;
  }

  put(record: any): MockIDBRequest {
    const req = new MockIDBRequest();
    const key = record ? record[this.keyPath] : undefined;
    if (key === undefined || key === null) {
      const err = new Error(`DataError: Record does not contain keyPath "${this.keyPath}"`);
      queueMicrotask(() => {
        req.error = err;
        req.onerror?.({ target: req } as any);
        if (this.transaction) {
          this.transaction.error = err;
          this.transaction.onerror?.({ target: this.transaction } as any);
        }
      });
      return req;
    }

    this.data.set(key, JSON.parse(JSON.stringify(record)));
    queueMicrotask(() => {
      req.result = key;
      req.onsuccess?.({ target: req } as any);
    });
    return req;
  }

  delete(key: any): MockIDBRequest {
    const req = new MockIDBRequest();
    this.data.delete(key);
    queueMicrotask(() => {
      req.result = undefined;
      req.onsuccess?.({ target: req } as any);
    });
    return req;
  }

  clear(): MockIDBRequest {
    const req = new MockIDBRequest();
    this.data.clear();
    queueMicrotask(() => {
      req.result = undefined;
      req.onsuccess?.({ target: req } as any);
    });
    return req;
  }
}

export class MockIDBTransaction {
  db: MockIDBDatabase;
  mode: 'readonly' | 'readwrite' | 'versionchange';
  storeNames: string[];
  error: Error | null = null;
  oncomplete: ((ev: any) => void) | null = null;
  onerror: ((ev: any) => void) | null = null;
  onabort: ((ev: any) => void) | null = null;

  constructor(db: MockIDBDatabase, storeNames: string[], mode: 'readonly' | 'readwrite' | 'versionchange') {
    this.db = db;
    this.storeNames = storeNames;
    this.mode = mode;

    queueMicrotask(() => {
      if (!this.error) {
        this.oncomplete?.({ target: this } as any);
      }
    });
  }

  objectStore(name: string): MockIDBObjectStore {
    const store = this.db._stores.get(name);
    if (!store) {
      throw new Error(`NotFoundError: Store "${name}" not found in transaction`);
    }
    const storeCopy = Object.create(store);
    storeCopy.transaction = this;
    return storeCopy;
  }
}

export class MockIDBDatabase {
  name: string;
  version: number;
  _stores: Map<string, MockIDBObjectStore> = new Map();
  objectStoreNames: MockDOMStringList = new MockDOMStringList();
  onclose: (() => void) | null = null;
  onversionchange: (() => void) | null = null;

  constructor(name: string, version: number) {
    this.name = name;
    this.version = version;
  }

  createObjectStore(name: string, options: { keyPath: string }): MockIDBObjectStore {
    if (this._stores.has(name)) {
      throw new Error(`ConstraintError: Object store "${name}" already exists.`);
    }
    const store = new MockIDBObjectStore(name, options.keyPath);
    this._stores.set(name, store);
    this.objectStoreNames._add(name);
    return store;
  }

  transaction(storeNames: string | string[], mode: 'readonly' | 'readwrite' = 'readonly'): MockIDBTransaction {
    const names = Array.isArray(storeNames) ? storeNames : [storeNames];
    for (const name of names) {
      if (!this._stores.has(name)) {
        throw new Error(`NotFoundError: The specified store "${name}" was not found.`);
      }
    }
    return new MockIDBTransaction(this, names, mode);
  }

  close(): void {
    this.onclose?.();
  }
}

export class MockIDBFactory implements IDBFactory {
  private _dbMap: Map<string, { version: number; db: MockIDBDatabase }> = new Map();

  open(name: string, version?: number): IDBOpenDBRequest {
    const req = new MockIDBOpenDBRequest() as any;
    const targetVersion = version || 1;

    queueMicrotask(() => {
      let entry = this._dbMap.get(name);
      const isNew = !entry;
      const oldVersion = entry ? entry.version : 0;

      if (!entry) {
        const db = new MockIDBDatabase(name, targetVersion);
        entry = { version: targetVersion, db };
        this._dbMap.set(name, entry);
      }

      if (targetVersion > oldVersion || isNew) {
        entry.version = targetVersion;
        entry.db.version = targetVersion;
        req.result = entry.db;
        const upgradeTx = new MockIDBTransaction(entry.db, Array.from(entry.db._stores.keys()), 'versionchange');
        req.transaction = upgradeTx;
        req.onupgradeneeded?.({
          oldVersion,
          newVersion: targetVersion,
          target: req,
        });
      }

      req.result = entry.db;
      req.onsuccess?.({ target: req });
    });

    return req;
  }

  deleteDatabase(name: string): IDBOpenDBRequest {
    const req = new MockIDBOpenDBRequest() as any;
    queueMicrotask(() => {
      this._dbMap.delete(name);
      req.result = undefined;
      req.onsuccess?.({ target: req });
    });
    return req;
  }

  cmp(a: any, b: any): number {
    if (a === b) return 0;
    return a > b ? 1 : -1;
  }

  databases(): Promise<IDBDatabaseInfo[]> {
    return Promise.resolve(
      Array.from(this._dbMap.entries()).map(([name, entry]) => ({
        name,
        version: entry.version,
      }))
    );
  }
}
