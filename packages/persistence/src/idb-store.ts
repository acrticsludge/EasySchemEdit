// packages/persistence/src/idb-store.ts
// IndexedDB store for project persistence (SUBSPEC-H §4.3 H12).
// Object stores: projects, chunks, autosave, recovery.

const DB_NAME = 'EasySchemEditProjects';
const DB_VERSION = 1;

const STORE_PROJECTS = 'projects';
const STORE_CHUNKS = 'chunks';
const STORE_AUTOSAVE = 'autosave';
const STORE_RECOVERY = 'recovery';

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_PROJECTS)) {
        db.createObjectStore(STORE_PROJECTS, { keyPath: 'projectId' });
      }
      if (!db.objectStoreNames.contains(STORE_CHUNKS)) {
        db.createObjectStore(STORE_CHUNKS, { keyPath: 'chunkKey' });
      }
      if (!db.objectStoreNames.contains(STORE_AUTOSAVE)) {
        db.createObjectStore(STORE_AUTOSAVE, { keyPath: 'projectId' });
      }
      if (!db.objectStoreNames.contains(STORE_RECOVERY)) {
        db.createObjectStore(STORE_RECOVERY, { keyPath: 'projectId' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => {
      // eslint-disable-next-line no-console
      console.warn('[persistence] IndexedDB open blocked — close other tabs');
    };
  });
  return dbPromise;
}

export { openDb, STORE_PROJECTS, STORE_CHUNKS, STORE_AUTOSAVE, STORE_RECOVERY };
