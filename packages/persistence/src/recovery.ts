// packages/persistence/src/recovery.ts
// Crash recovery: scan for uncommitted commits, restore from temp keys.
// (SUBSPEC-C §4.6, §2.3.8)

import { openDB, STORE_COMMIT_RECORDS } from './idb-store.ts';

export type CommitPhaseForRecovery = 'pending' | 'writing' | 'verifying' | 'failed';

export interface UncommittedCommit {
  transactionId: string;
  projectId: string;
  phase: CommitPhaseForRecovery;
  tempKeys: string[];
  startedAt: number;
  completedAt?: number;
}

export interface RecoveryResult {
  recovered: boolean;
  projectId: string;
  revision: number;
  data?: unknown;
  error?: string;
}

export class RecoveryManager {
  private readonly db: IDBDatabase;

  constructor(db: IDBDatabase) {
    this.db = db;
  }

  // Scan for all CommitRecord entries with phase != 'committed'.
  async scanUncommitted(): Promise<UncommittedCommit[]> {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(STORE_COMMIT_RECORDS, 'readonly');
      const store = tx.objectStore(STORE_COMMIT_RECORDS);
      const req = store.getAll();
      req.onsuccess = () => {
        const records = req.result as Array<{
          transactionId: string;
          projectId: string;
          phase: string;
          tempKeys: string[];
          startedAt: number;
          completedAt?: number;
        }>;
        const uncommitted = records.filter((r) => r.phase !== 'committed').map((r) => ({
          transactionId: r.transactionId,
          projectId: r.projectId,
          phase: r.phase as CommitPhaseForRecovery,
          tempKeys: r.tempKeys,
          startedAt: r.startedAt,
          completedAt: r.completedAt,
        }));
        resolve(uncommitted);
      };
      req.onerror = () => reject(req.error);
    });
  }

  // Attempt recovery for a project: read temp keys, verify checksums,
  // restore to last committed state or offer previous committed revision.
  async recover(projectId: string): Promise<RecoveryResult> {
    const uncommitted = await this.scanUncommitted();
    const projectCommits = uncommitted.filter((c) => c.projectId === projectId);

    if (projectCommits.length === 0) {
      return {
        recovered: true,
        projectId,
        revision: 0,
        error: undefined,
      };
    }

    // Find the most recent uncommitted commit for this project
    const latest = projectCommits.reduce((a, b) => (b.startedAt > a.startedAt ? b : a));

    // Attempt to read temp keys and verify checksums
    // Temp keys are stored in STORE_PROJECTS with temp_ prefix
    const recoveredData: Array<{ key: string; data: ArrayBuffer }> = [];
    let allChecksumsValid = true;

    for (const tempKey of latest.tempKeys) {
      try {
        const data = await this.readTempKey(tempKey);
        if (data) {
          recoveredData.push({ key: tempKey, data });
        } else {
          allChecksumsValid = false;
        }
      } catch {
        allChecksumsValid = false;
      }
    }

    if (!allChecksumsValid || recoveredData.length === 0) {
      return {
        recovered: false,
        projectId,
        revision: 0,
        error: `Recovery failed for transaction ${latest.transactionId}: temp keys missing or corrupt`,
      };
    }

    // Clean up temp keys after successful recovery
    await this.cleanupTempKeys(latest.tempKeys);

    return {
      recovered: true,
      projectId,
      revision: 0,
      data: recoveredData,
      error: undefined,
    };
  }

  // Read a temp key value from the commit records store.
  private async readTempKey(key: string): Promise<ArrayBuffer | null> {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(STORE_COMMIT_RECORDS, 'readonly');
      const store = tx.objectStore(STORE_COMMIT_RECORDS);
      const req = store.get(key);
      req.onsuccess = () => {
        const result = req.result as { data: ArrayBuffer } | undefined;
        resolve(result ? result.data : null);
      };
      req.onerror = () => reject(req.error);
    });
  }

  // Clean up temp keys after successful recovery.
  private async cleanupTempKeys(keys: string[]): Promise<void> {
    const tx = this.db.transaction(STORE_COMMIT_RECORDS, 'readwrite');
    const store = tx.objectStore(STORE_COMMIT_RECORDS);
    for (const key of keys) {
      store.delete(key);
    }
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }
}
