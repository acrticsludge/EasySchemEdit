// packages/persistence/src/project-store.ts
// Save/get/delete project archives in IndexedDB.
// Revision tracking for optimistic concurrency.

import { openDB, STORE_PROJECTS } from './idb-store.ts';

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
export async function saveProject(archive: ProjectArchive): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_PROJECTS, 'readwrite');
    const store = tx.objectStore(STORE_PROJECTS);
    const req = store.put(archive);
    req.onsuccess = () => resolve();
    req.onerror = () => {
      if (req.error?.name === 'QuotaExceededError') {
        reject(new ProjectStoreError('QUOTA_EXCEEDED', 'IndexedDB quota exhausted — previous save preserved'));
      } else {
        reject(new ProjectStoreError('SAVE_FAILED', req.error?.message ?? 'Unknown save error'));
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
    req.onsuccess = () => resolve(req.result as string[]);
    req.onerror = () => reject(new ProjectStoreError('LIST_FAILED', req.error?.message ?? 'Unknown list error'));
  });
}


