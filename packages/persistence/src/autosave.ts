// packages/persistence/src/autosave.ts
// Autosave snapshot + recovery snapshot on browser reload.
// Quota exhaustion: visible error, previous save never silently dropped.

import { openDb, STORE_AUTOSAVE, STORE_RECOVERY } from './idb-store.ts';

export interface AutosaveEntry {
  projectId: string;
  revision: number;
  archive: string;       // serialized project JSON
  savedAt: string;
}

export interface RecoveryEntry {
  projectId: string;
  revision: number;
  archive: string;
  savedAt: string;
  reason: 'autosave' | 'manual' | 'crash';
}

// Save an autosave snapshot (overwrites previous autosave for projectId).
export async function saveAutosave(entry: AutosaveEntry): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_AUTOSAVE, 'readwrite');
    const store = tx.objectStore(STORE_AUTOSAVE);
    const req = store.put(entry);
    req.onsuccess = () => resolve();
    req.onerror = () => {
      if (req.error?.name === 'QuotaExceededError') {
        reject(new Error('QUOTA_EXCEEDED_AUTOSAVE'));
      } else {
        reject(new Error(`AUTOSAVE_FAILED: ${req.error?.message ?? 'Unknown error'}`));
      }
    };
  });
}

// Get the latest autosave for a project.
export async function getAutosave(projectId: string): Promise<AutosaveEntry | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_AUTOSAVE, 'readonly');
    const store = tx.objectStore(STORE_AUTOSAVE);
    const req = store.get(projectId);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => reject(new Error(`AUTOSAVE_READ_FAILED: ${req.error?.message ?? 'Unknown error'}`));
  });
}

// Save a recovery snapshot (before destructive operations).
export async function saveRecovery(entry: RecoveryEntry): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_RECOVERY, 'readwrite');
    const store = tx.objectStore(STORE_RECOVERY);
    const req = store.put(entry);
    req.onsuccess = () => resolve();
    req.onerror = () => {
      if (req.error?.name === 'QuotaExceededError') {
        reject(new Error('QUOTA_EXCEEDED_RECOVERY'));
      } else {
        reject(new Error(`RECOVERY_SAVE_FAILED: ${req.error?.message ?? 'Unknown error'}`));
      }
    };
  });
}

// Get the latest recovery snapshot for a project.
export async function getRecovery(projectId: string): Promise<RecoveryEntry | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_RECOVERY, 'readonly');
    const store = tx.objectStore(STORE_RECOVERY);
    const req = store.get(projectId);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => reject(new Error(`RECOVERY_READ_FAILED: ${req.error?.message ?? 'Unknown error'}`));
  });
}

// Clear recovery snapshot after successful commit.
export async function clearRecovery(projectId: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_RECOVERY, 'readwrite');
    const store = tx.objectStore(STORE_RECOVERY);
    const req = store.delete(projectId);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(new Error(`RECOVERY_CLEAR_FAILED: ${req.error?.message ?? 'Unknown error'}`));
  });
}
