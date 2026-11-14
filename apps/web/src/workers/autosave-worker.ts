// apps/web/src/workers/autosave-worker.ts
// Web Worker for offloading .vxproj archive compression and Base64 encoding.

import { packVxprojArchive } from '@easyschemedit/persistence';
import type { Project } from '@easyschemedit/domain';

export interface AutosaveWorkerRequest {
  id: number;
  project: Project;
}

export type AutosaveWorkerResponse =
  | { id: number; ok: true; base64: string }
  | { id: number; ok: false; error: string };

/**
 * Encodes Uint8Array into a base64 string in chunks to avoid stack overflow.
 */
function bytesToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64');
  }
  const CHUNK_SIZE = 8192;
  const chunks: string[] = [];
  const len = bytes.byteLength;
  for (let i = 0; i < len; i += CHUNK_SIZE) {
    chunks.push(String.fromCharCode(...bytes.subarray(i, i + CHUNK_SIZE)));
  }
  return btoa(chunks.join(''));
}

self.addEventListener('message', (event: MessageEvent<AutosaveWorkerRequest>) => {
  const data = event.data;
  if (!data || typeof data.id !== 'number' || !data.project) {
    return;
  }
  const { id, project } = data;
  try {
    const zipBytes = packVxprojArchive(project);
    const base64 = bytesToBase64(zipBytes);
    const response: AutosaveWorkerResponse = { id, ok: true, base64 };
    self.postMessage(response);
  } catch (err: any) {
    const response: AutosaveWorkerResponse = {
      id,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
    self.postMessage(response);
  }
});
