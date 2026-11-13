// packages/persistence/src/chunk-store.ts
// Save/get chunk binary blobs by chunk key.

import { openDB, STORE_CHUNKS } from './idb-store.ts';

export interface ChunkBlob {
  chunkKey: string;      // e.g. "2_-1_0"
  projectId: string;
  placementId?: string;
  data: ArrayBuffer;     // binary chunk data (.bin format)
  savedAt: string;
}

// Save a chunk blob.
export async function saveChunk(chunk: ChunkBlob): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_CHUNKS, 'readwrite');
    const store = tx.objectStore(STORE_CHUNKS);
    const req = store.put(chunk);
    req.onsuccess = () => resolve();
    req.onerror = () => {
      if (req.error?.name === 'QuotaExceededError') {
        reject(new Error('QUOTA_EXCEEDED'));
      } else {
        reject(new Error(`CHUNK_SAVE_FAILED: ${req.error?.message ?? 'Unknown error'}`));
      }
    };
  });
}

// Get a chunk blob by key.
export async function getChunk(chunkKey: string, projectId: string): Promise<ChunkBlob | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_CHUNKS, 'readonly');
    const store = tx.objectStore(STORE_CHUNKS);
    const req = store.get([projectId, chunkKey]);
    req.onsuccess = () => {
      const result = req.result as ChunkBlob | undefined;
      resolve(result ?? null);
    };
    req.onerror = () => reject(new Error(`CHUNK_READ_FAILED: ${req.error?.message ?? 'Unknown error'}`));
  });
}

// Delete a chunk blob.
export async function deleteChunk(chunkKey: string, projectId?: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_CHUNKS, 'readwrite');
    const store = tx.objectStore(STORE_CHUNKS);
    const req = projectId ? store.delete([projectId, chunkKey]) : store.delete(chunkKey as any);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(new Error(`CHUNK_DELETE_FAILED: ${req.error?.message ?? 'Unknown error'}`));
  });
}
