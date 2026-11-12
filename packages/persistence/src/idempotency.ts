// packages/persistence/src/idempotency.ts
// Idempotency keys: dedupe repeated saves (SUBSPEC-C §4.9, §2.3.11).
// Key format: {projectId}-{revision}-{operation}, TTL-based expiration.

import { openDB, STORE_IDEMPOTENCY } from './idb-store.ts';

export interface IdempotencyRecord {
  key: string;
  projectId: string;
  revision: number;
  operation: string;
  result: unknown;
  createdAt: number;
  expiresAt: number;
}

export interface IdempotencyConfig {
  defaultTTLMs: number;  // default 300000 (5 minutes)
}

const DEFAULT_CONFIG: IdempotencyConfig = {
  defaultTTLMs: 300000, // 5 minutes
};

export class IdempotencyManager {
  private readonly db: IDBDatabase;
  private readonly config: IdempotencyConfig;

  constructor(db: IDBDatabase, config: Partial<IdempotencyConfig> = {}) {
    this.db = db;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // Check if an idempotency key exists and is not expired.
  // Returns cached result if hit, miss otherwise.
  async check(key: string): Promise<{ hit: true; result: unknown } | { hit: false }> {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(STORE_IDEMPOTENCY, 'readonly');
      const store = tx.objectStore(STORE_IDEMPOTENCY);
      const req = store.get(key);
      req.onsuccess = () => {
        const record = req.result as IdempotencyRecord | undefined;
        if (!record) {
          resolve({ hit: false });
          return;
        }
        if (Date.now() > record.expiresAt) {
          // Expired — delete and return miss
          store.delete(key);
          resolve({ hit: false });
          return;
        }
        resolve({ hit: true, result: record.result });
      };
      req.onerror = () => reject(req.error);
    });
  }

  // Store an idempotency record with the given key.
  async set(
    key: string,
    projectId: string,
    revision: number,
    operation: string,
    result: unknown
  ): Promise<void> {
    const now = Date.now();
    const record: IdempotencyRecord = {
      key,
      projectId,
      revision,
      operation,
      result,
      createdAt: now,
      expiresAt: now + this.config.defaultTTLMs,
    };

    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(STORE_IDEMPOTENCY, 'readwrite');
      const store = tx.objectStore(STORE_IDEMPOTENCY);
      const req = store.put(record, key);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  // Clean up expired records. Returns count of records removed.
  async cleanup(): Promise<number> {
    const now = Date.now();
    const toDelete: string[] = [];

    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(STORE_IDEMPOTENCY, 'readonly');
      const store = tx.objectStore(STORE_IDEMPOTENCY);
      const req = store.openCursor();
      req.onsuccess = () => {
        const cursor = req.result as IDBCursorWithValue | null;
        if (!cursor) {
          // Delete all expired
          const delTx = this.db.transaction(STORE_IDEMPOTENCY, 'readwrite');
          const delStore = delTx.objectStore(STORE_IDEMPOTENCY);
          for (const key of toDelete) {
            delStore.delete(key);
          }
          resolve(toDelete.length);
          return;
        }
        const record = cursor.value as IdempotencyRecord;
        if (now > record.expiresAt) {
          toDelete.push(cursor.primaryKey as string);
        }
        cursor.continue();
      };
      req.onerror = () => reject(req.error);
    });
  }
}
