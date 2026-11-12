// packages/persistence/src/chunk-store.ts
// Save/get chunk binary blobs by chunk key.

import { openDb, STORE_CHUNKS } from './idb-store.ts';

export interface ChunkBlob {
  chunkKey: string;      // e.g. "2_-1_0"
  projectId: string;
  data: ArrayBuffer;     // binary chunk data (.bin format)
  savedAt: string;
}

// Save a chunk blob.
export async function saveChunk(chunk: ChunkBlob): Promise<void> {
  const db = await openDb();
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
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_CHUNKS, 'readonly');
    const store = tx.objectStore(STORE_CHUNKS);
    // chunkKey is the primary key; filter by projectId in JS
    const req = store.get(chunkKey);
    req.onsuccess = () => {
      const result = req.result as ChunkBlob | undefined;
      resolve(result && result.projectId === projectId ? result : null);
    };
    req.onerror = () => reject(new Error(`CHUNK_READ_FAILED: ${req.error?.message ?? 'Unknown error'}`));
  });
}

// Delete a chunk blob.
export async function deleteChunk(chunkKey: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_CHUNKS, 'readwrite');
    const store = tx.objectStore(STORE_CHUNKS);
    const req = store.delete(chunkKey);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(new Error(`CHUNK_DELETE_FAILED: ${req.error?.message ?? 'Unknown error'}`));
  });
}
