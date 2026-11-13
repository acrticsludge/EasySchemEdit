// packages/persistence/src/idb-store.ts
// IndexedDB store for project persistence (SUBSPEC-C §2.3.1).
// Object stores: projects, chunks, ancillary, history, recovery, assets, settings, idempotency, commitRecords, autosaveJournal, library

const DB_NAME = 'schematic-editor-db';
const DB_VERSION = 2;

const STORE_PROJECTS = 'projects';
const STORE_CHUNKS = 'chunks';
const STORE_ANCILLARY = 'ancillary';
const STORE_HISTORY = 'history';
const STORE_RECOVERY = 'recovery';
const STORE_ASSETS = 'assets';
const STORE_SETTINGS = 'settings';
const STORE_IDEMPOTENCY = 'idempotency';
const STORE_COMMIT_RECORDS = 'commitRecords';
const STORE_AUTOSAVE_JOURNAL = 'autosaveJournal';
const STORE_LIBRARY = 'library';

let customIDBFactory: IDBFactory | undefined = undefined;
let dbPromise: Promise<IDBDatabase> | null = null;

export function setIDBFactory(factory: IDBFactory | undefined): void {
  customIDBFactory = factory;
  closeDB();
}

export function getIDBFactory(): IDBFactory {
  if (customIDBFactory) return customIDBFactory;
  if (typeof indexedDB !== 'undefined') return indexedDB;
  if (typeof globalThis !== 'undefined' && (globalThis as any).indexedDB) {
    return (globalThis as any).indexedDB;
  }
  throw new Error('IndexedDB is not available in this environment');
}

export function isIDBAvailable(): boolean {
  return customIDBFactory !== undefined ||
    typeof indexedDB !== 'undefined' ||
    (typeof globalThis !== 'undefined' && !!(globalThis as any).indexedDB);
}

export function closeDB(): void {
  if (dbPromise) {
    dbPromise.then((db) => {
      try {
        db.close();
      } catch {}
    }).catch(() => {});
    dbPromise = null;
  }
}

export function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  const factory = getIDBFactory();
  dbPromise = new Promise((resolve, reject) => {
    const req = factory.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;

      if (!db.objectStoreNames.contains(STORE_PROJECTS)) {
        const store = db.createObjectStore(STORE_PROJECTS, { keyPath: 'projectId' });
        store.createIndex('name', 'name', { unique: false });
        store.createIndex('modifiedAt', 'modifiedAt', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORE_CHUNKS)) {
        const store = db.createObjectStore(STORE_CHUNKS, { keyPath: ['projectId', 'chunkKey'] });
        store.createIndex('projectId', 'projectId', { unique: false });
        store.createIndex('chunkKey', 'chunkKey', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORE_ANCILLARY)) {
        const store = db.createObjectStore(STORE_ANCILLARY, { keyPath: ['placementId', 'ancillaryType'] });
        store.createIndex('placementId', 'placementId', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORE_HISTORY)) {
        const store = db.createObjectStore(STORE_HISTORY, { keyPath: ['projectId', 'commandId'] });
        store.createIndex('projectId', 'projectId', { unique: false });
        store.createIndex('committedRevision', 'committedRevision', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORE_RECOVERY)) {
        const store = db.createObjectStore(STORE_RECOVERY, { keyPath: 'projectId' });
        store.createIndex('projectId', 'projectId', { unique: false });
        store.createIndex('createdAt', 'createdAt', { unique: false });
        store.createIndex('expiresAt', 'expiresAt', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORE_ASSETS)) {
        const store = db.createObjectStore(STORE_ASSETS, { keyPath: ['version', 'assetHash'] });
        store.createIndex('version', 'version', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORE_SETTINGS)) {
        db.createObjectStore(STORE_SETTINGS, { keyPath: 'key' });
      }
      if (!db.objectStoreNames.contains(STORE_IDEMPOTENCY)) {
        const store = db.createObjectStore(STORE_IDEMPOTENCY, { keyPath: 'requestId' });
        store.createIndex('projectId', 'projectId', { unique: false });
        store.createIndex('expiresAt', 'expiresAt', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORE_COMMIT_RECORDS)) {
        const store = db.createObjectStore(STORE_COMMIT_RECORDS, { keyPath: 'transactionId' });
        store.createIndex('projectId', 'projectId', { unique: false });
        store.createIndex('phase', 'phase', { unique: false });
        store.createIndex('targetRevision', 'targetRevision', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORE_AUTOSAVE_JOURNAL)) {
        const store = db.createObjectStore(STORE_AUTOSAVE_JOURNAL, { keyPath: 'projectId' });
        store.createIndex('projectId', 'projectId', { unique: false });
        store.createIndex('committedRevision', 'committedRevision', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORE_LIBRARY)) {
        const store = db.createObjectStore(STORE_LIBRARY, { keyPath: 'id' });
        store.createIndex('name', 'name', { unique: false });
        store.createIndex('createdAt', 'createdAt', { unique: false });
        store.createIndex('updatedAt', 'updatedAt', { unique: false });
        store.createIndex('tags', 'tags', { unique: false, multiEntry: true });
        store.createIndex('format', 'format', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => {
      dbPromise = null;
      reject(req.error);
    };
    req.onblocked = () => {
      // eslint-disable-next-line no-console
      console.warn('[persistence] IndexedDB open blocked — close other tabs using this app');
    };
  });
  return dbPromise;
}

export {
  STORE_PROJECTS,
  STORE_CHUNKS,
  STORE_ANCILLARY,
  STORE_HISTORY,
  STORE_RECOVERY,
  STORE_ASSETS,
  STORE_SETTINGS,
  STORE_IDEMPOTENCY,
  STORE_COMMIT_RECORDS,
  STORE_AUTOSAVE_JOURNAL,
  STORE_LIBRARY,
};
