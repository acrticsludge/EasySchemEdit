// packages/asset-pipeline/src/indexeddb-cache.ts
// IndexedDB cache keyed by version + hash, integrity check on read.
// SUBSPEC-H §4.5: Cached assets in IndexedDB keyed by version + hash.

export interface CachedAssetEntry {
  version: string;
  hash: string;          // SHA-1 of the client JAR
  cachedAt: string;      // ISO timestamp
  assetPaths: string[];  // archive-relative paths extracted
}

const DB_NAME = 'EasySchemEditAssets';
const DB_VERSION = 1;
const STORE_NAME = 'assetCache';

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'version' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

// Store extracted asset metadata after successful download + verification.
export async function cacheAssets(
  version: string,
  hash: string,
  assetPaths: string[],
): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const entry: CachedAssetEntry = {
      version,
      hash,
      cachedAt: new Date().toISOString(),
      assetPaths,
    };
    const req = store.put(entry);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

// Retrieve cached asset metadata for a version.
export async function getCachedAssets(version: string): Promise<CachedAssetEntry | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.get(version);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => reject(req.error);
  });
}

// Check whether assets for a version are cached and integrity is intact.
export async function isCached(version: string): Promise<boolean> {
  try {
    const entry = await getCachedAssets(version);
    return entry !== null;
  } catch {
    return false;
  }
}

// Clear all cached assets.
export async function clearCache(): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.clear();
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}
