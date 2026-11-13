// packages/asset-pipeline/src/indexeddb-cache.ts
// IndexedDB and in-memory cache keyed by version + hash (AD-4).
// Allows injecting custom AssetCacheStore or IDBFactory for Node/unit-test environments.

export interface CachedAssetEntry {
  version: string;
  hash: string;         // SHA-1 of the client JAR
  cachedAt: string;     // ISO timestamp
  assetPaths: string[]; // archive-relative paths extracted
  files?: Map<string, Uint8Array>;
}

export interface AssetCacheStore<T = unknown> {
  get(key: string): Promise<T | undefined> | T | undefined;
  set(key: string, value: T): Promise<void> | void;
  has(key: string): Promise<boolean> | boolean;
  clear(): Promise<void> | void;
}

const DB_NAME = 'EasySchemEditAssets';
const DB_VERSION = 2;
const STORE_NAME = 'assetCache';

/**
 * Format the standard cache key: `<version>:<sha1>`.
 */
export function createAssetCacheKey(version: string, hash: string): string {
  return `${version}:${hash}`;
}

/**
 * In-memory cache store implementation suitable for tests and headless environments.
 */
export class MemoryAssetCacheStore<T = unknown> implements AssetCacheStore<T> {
  private map = new Map<string, T>();

  async get(key: string): Promise<T | undefined> {
    return this.map.get(key);
  }

  async set(key: string, value: T): Promise<void> {
    this.map.set(key, value);
  }

  async has(key: string): Promise<boolean> {
    return this.map.has(key);
  }

  async clear(): Promise<void> {
    this.map.clear();
  }

  get size(): number {
    return this.map.size;
  }
}

/**
 * IndexedDB-backed asset cache store.
 */
export class IndexedDbAssetCacheStore implements AssetCacheStore<CachedAssetEntry> {
  private idbFactory: IDBFactory | undefined;
  private dbPromise: Promise<IDBDatabase> | null = null;
  private dbName: string;

  constructor(options?: { idbFactory?: IDBFactory; dbName?: string }) {
    this.idbFactory =
      options?.idbFactory ?? (typeof indexedDB !== 'undefined' ? indexedDB : undefined);
    this.dbName = options?.dbName ?? DB_NAME;
  }

  private openDb(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise;
    if (!this.idbFactory) {
      throw new Error('IndexedDB is not available in this environment');
    }
    this.dbPromise = new Promise((resolve, reject) => {
      const req = this.idbFactory!.open(this.dbName, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'key' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return this.dbPromise;
  }

  async get(key: string): Promise<CachedAssetEntry | undefined> {
    const db = await this.openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(key);
      req.onsuccess = () => {
        const res = req.result;
        if (!res) {
          resolve(undefined);
          return;
        }
        resolve(res.entry ?? res);
      };
      req.onerror = () => reject(req.error);
    });
  }

  async set(key: string, value: CachedAssetEntry): Promise<void> {
    const db = await this.openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.put({ key, entry: value });
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  async has(key: string): Promise<boolean> {
    const entry = await this.get(key);
    return entry !== undefined;
  }

  async clear(): Promise<void> {
    const db = await this.openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.clear();
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }
}

let defaultStoreInstance: AssetCacheStore<CachedAssetEntry> | null = null;

function resolveStore(options?: {
  store?: AssetCacheStore;
  idbFactory?: IDBFactory;
}): AssetCacheStore<CachedAssetEntry> {
  if (options?.store) {
    return options.store as AssetCacheStore<CachedAssetEntry>;
  }
  if (options?.idbFactory) {
    return new IndexedDbAssetCacheStore({ idbFactory: options.idbFactory });
  }
  if (!defaultStoreInstance) {
    if (typeof indexedDB !== 'undefined') {
      defaultStoreInstance = new IndexedDbAssetCacheStore();
    } else {
      defaultStoreInstance = new MemoryAssetCacheStore<CachedAssetEntry>();
    }
  }
  return defaultStoreInstance;
}

/**
 * Store extracted asset metadata after successful download + verification.
 */
export async function cacheAssets(
  version: string,
  hash: string,
  assetPaths: string[],
  options?: {
    store?: AssetCacheStore;
    idbFactory?: IDBFactory;
    files?: Map<string, Uint8Array>;
  },
): Promise<void> {
  const store = resolveStore(options);
  const key = createAssetCacheKey(version, hash);
  const entry: CachedAssetEntry = {
    version,
    hash,
    cachedAt: new Date().toISOString(),
    assetPaths,
    files: options?.files,
  };
  await store.set(key, entry);
}

/**
 * Retrieve cached asset metadata for a version and optional hash.
 */
export async function getCachedAssets(
  version: string,
  hash?: string,
  options?: {
    store?: AssetCacheStore;
    idbFactory?: IDBFactory;
  },
): Promise<CachedAssetEntry | null> {
  const store = resolveStore(options);
  if (hash) {
    const key = createAssetCacheKey(version, hash);
    const entry = await store.get(key);
    return (entry as CachedAssetEntry) ?? null;
  }
  // If hash is not specified, check if version itself was keyed
  const entry = await store.get(version);
  return (entry as CachedAssetEntry) ?? null;
}

/**
 * Check whether assets for a version (and optional hash) are cached.
 */
export async function isCached(
  version: string,
  hash?: string,
  options?: {
    store?: AssetCacheStore;
    idbFactory?: IDBFactory;
  },
): Promise<boolean> {
  try {
    const store = resolveStore(options);
    if (hash) {
      return await store.has(createAssetCacheKey(version, hash));
    }
    return (await getCachedAssets(version, undefined, options)) !== null;
  } catch {
    return false;
  }
}

/**
 * Clear all cached assets.
 */
export async function clearCache(options?: {
  store?: AssetCacheStore;
  idbFactory?: IDBFactory;
}): Promise<void> {
  const store = resolveStore(options);
  await store.clear();
}
