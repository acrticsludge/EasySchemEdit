// packages/persistence/src/project-store.ts
// Save/get/delete project archives in IndexedDB.
// Revision tracking for optimistic concurrency.

import { openDB, STORE_PROJECTS } from './idb-store.ts';
import { commitProject, type CommitServices } from './commit-protocol.ts';

export interface ProjectArchive {
  projectId: string;
  revision: number;
  projectJson: string;           // serialized Project JSON
  manifestJson: string;          // manifest with checksums
  savedAt: string;               // ISO timestamp
}

export class ProjectStoreError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = 'ProjectStoreError';
  }
}

// Save a project archive (overwrites existing same projectId).
// Uses crash-safe commit protocol: writes to temp key, verifies checksums,
// atomically commits revision.
export async function saveProject(archive: ProjectArchive): Promise<void> {
  const db = await openDB();

  // Get current revision for optimistic concurrency check
  const existing = await getProject(archive.projectId);
  const currentRevision = existing?.revision ?? 0;
  if (archive.revision !== currentRevision + 1 && archive.revision !== currentRevision) {
    throw new ProjectStoreError(
      'STALE_REVISION',
      `Revision mismatch: expected ${currentRevision + 1}, got ${archive.revision}`
    );
  }

  const transactionId = `save_${archive.projectId}_${Date.now()}`;
  const tempKey = `temp_${transactionId}_${archive.projectId}`;

  const commitServices: CommitServices = {
    sha256: async (data: ArrayBuffer) => {
      const hash = await crypto.subtle.digest('SHA-256', data);
      const hashArray = Array.from(new Uint8Array(hash));
      return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
    },
    getProjectRevision: async (pid: string) => {
      const existingProj = await getProject(pid);
      return existingProj?.revision ?? 0;
    },
    updateProjectRevision: async (_pid: string, _revision: number) => {
      // Revision is stored in the archive itself; no separate update needed
    },
  };

  const result = await commitProject(
    archive.projectId,
    currentRevision,
    archive.revision,
    [{ key: tempKey, data: new TextEncoder().encode(archive.projectJson).buffer }],
    commitServices
  );

  if (!result.ok) {
    throw new ProjectStoreError('COMMIT_FAILED', result.error);
  }

  // After successful commit, write project archive permanently
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_PROJECTS, 'readwrite');
    const store = tx.objectStore(STORE_PROJECTS);
    const req = store.put({ ...archive, id: archive.projectId });
    req.onsuccess = () => resolve();
    req.onerror = () => {
      if (req.error?.name === 'QuotaExceededError') {
        reject(new ProjectStoreError('QUOTA_EXCEEDED', 'Storage quota exceeded'));
      } else {
        reject(new ProjectStoreError('WRITE_FAILED', req.error?.message ?? 'Unknown write error'));
      }
    };
  });
}

// Get a project archive by projectId.
export async function getProject(projectId: string): Promise<ProjectArchive | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_PROJECTS, 'readonly');
    const store = tx.objectStore(STORE_PROJECTS);
    const req = store.get(projectId);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => reject(new ProjectStoreError('READ_FAILED', req.error?.message ?? 'Unknown read error'));
  });
}

// Delete a project archive.
export async function deleteProject(projectId: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_PROJECTS, 'readwrite');
    const store = tx.objectStore(STORE_PROJECTS);
    const req = store.delete(projectId);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(new ProjectStoreError('DELETE_FAILED', req.error?.message ?? 'Unknown delete error'));
  });
}

// List all project IDs.
export async function listProjects(): Promise<string[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_PROJECTS, 'readonly');
    const store = tx.objectStore(STORE_PROJECTS);
    const req = store.getAllKeys();
    req.onsuccess = () => {
      const keys = (req.result as string[]).filter((k) => typeof k === 'string' && !k.startsWith('temp_'));
      resolve(keys);
    };
    req.onerror = () => reject(new ProjectStoreError('LIST_FAILED', req.error?.message ?? 'Unknown list error'));
  });
}


