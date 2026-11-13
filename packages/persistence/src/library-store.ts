// packages/persistence/src/library-store.ts
// Build library storage: reusable saved builds, search, tags, thumbnails, stats.

import { openDB, STORE_LIBRARY } from './idb-store.ts';

export interface LibraryEntry {
  id: string;
  name: string;
  description?: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  format: 'schem-v3' | 'litematic' | 'vxproj';
  dimensions: { width: number; height: number; length: number };
  nonAirCount: number;
  sizeBytes: number;
  thumbnailPng?: Uint8Array;
  data: Uint8Array;
}

export async function saveLibraryEntry(entry: LibraryEntry): Promise<void> {
  const db = await openDB();
  const normalized: LibraryEntry = {
    ...entry,
    sizeBytes: entry.sizeBytes || entry.data.byteLength,
    tags: Array.isArray(entry.tags) ? [...entry.tags] : [],
  };

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_LIBRARY, 'readwrite');
    const store = tx.objectStore(STORE_LIBRARY);
    const req = store.put(normalized);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(new Error(`LIBRARY_SAVE_FAILED: ${req.error?.message ?? 'Unknown error'}`));
  });
}

export async function getLibraryEntry(id: string): Promise<LibraryEntry | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_LIBRARY, 'readonly');
    const store = tx.objectStore(STORE_LIBRARY);
    const req = store.get(id);
    req.onsuccess = () => {
      const entry = req.result as LibraryEntry | undefined;
      if (!entry) {
        resolve(null);
        return;
      }
      resolve({
        ...entry,
        data: entry.data instanceof Uint8Array ? entry.data : new Uint8Array(entry.data),
        thumbnailPng: entry.thumbnailPng
          ? entry.thumbnailPng instanceof Uint8Array
            ? entry.thumbnailPng
            : new Uint8Array(entry.thumbnailPng)
          : undefined,
      });
    };
    req.onerror = () => reject(new Error(`LIBRARY_READ_FAILED: ${req.error?.message ?? 'Unknown error'}`));
  });
}

export async function listLibraryEntries(query?: {
  search?: string;
  tag?: string;
}): Promise<Omit<LibraryEntry, 'data'>[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_LIBRARY, 'readonly');
    const store = tx.objectStore(STORE_LIBRARY);
    const req = store.getAll();
    req.onsuccess = () => {
      const entries = (req.result as LibraryEntry[]) || [];
      const searchLower = query?.search?.trim().toLowerCase();
      const targetTag = query?.tag?.trim().toLowerCase();

      const filtered = entries.filter((entry) => {
        if (targetTag) {
          const hasTag = entry.tags?.some((t) => t.toLowerCase() === targetTag);
          if (!hasTag) return false;
        }
        if (searchLower) {
          const matchName = entry.name.toLowerCase().includes(searchLower);
          const matchDesc = entry.description?.toLowerCase().includes(searchLower) ?? false;
          if (!matchName && !matchDesc) return false;
        }
        return true;
      });

      const summaries = filtered.map((entry) => {
        const { data: _, ...rest } = entry;
        return {
          ...rest,
          thumbnailPng: rest.thumbnailPng
            ? rest.thumbnailPng instanceof Uint8Array
              ? rest.thumbnailPng
              : new Uint8Array(rest.thumbnailPng)
            : undefined,
        };
      });

      resolve(summaries);
    };
    req.onerror = () => reject(new Error(`LIBRARY_LIST_FAILED: ${req.error?.message ?? 'Unknown error'}`));
  });
}

export async function deleteLibraryEntry(id: string): Promise<boolean> {
  const db = await openDB();
  const existing = await getLibraryEntry(id);
  if (!existing) {
    return false;
  }

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_LIBRARY, 'readwrite');
    const store = tx.objectStore(STORE_LIBRARY);
    const req = store.delete(id);
    req.onsuccess = () => resolve(true);
    req.onerror = () => reject(new Error(`LIBRARY_DELETE_FAILED: ${req.error?.message ?? 'Unknown error'}`));
  });
}

export async function getLibraryStorageStats(): Promise<{ entryCount: number; totalBytes: number }> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_LIBRARY, 'readonly');
    const store = tx.objectStore(STORE_LIBRARY);
    const req = store.getAll();
    req.onsuccess = () => {
      const entries = (req.result as LibraryEntry[]) || [];
      let totalBytes = 0;
      for (const entry of entries) {
        totalBytes += entry.sizeBytes || entry.data?.byteLength || 0;
      }
      resolve({
        entryCount: entries.length,
        totalBytes,
      });
    };
    req.onerror = () => reject(new Error(`LIBRARY_STATS_FAILED: ${req.error?.message ?? 'Unknown error'}`));
  });
}
