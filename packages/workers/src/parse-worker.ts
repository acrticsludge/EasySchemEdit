// packages/workers/src/parse-worker.ts
// NBT parsing worker — receives bytes (transferable), returns parsed structure.
// SUBSPEC-H §5: All heavy computation off main thread; typed messages only.

import type {
  WorkerMessageToWorker,
  WorkerMessageToMain,
  WorkerResult,
  WorkerCancelResult,
} from './worker-protocol.ts';

let cancelled = false;

self.addEventListener('message', (event: MessageEvent<WorkerMessageToWorker>) => {
  const { requestId, type, payload, transfers } = event.data;

  if (type === 'cancel') {
    cancelled = true;
    const cancelResult: WorkerCancelResult = { requestId, type: 'cancelled' };
    self.postMessage(cancelResult);
    return;
  }

  cancelled = false;

  if (type !== 'import') {
    const errorResult: WorkerMessageToMain = {
      requestId,
      type: 'error',
      code: 'WORKER_UNKNOWN_MESSAGE',
      message: `Unknown message type: ${type}`,
    };
    self.postMessage(errorResult);
    return;
  }

  // payload is expected to be { bytes: ArrayBuffer, filename: string }
  const { bytes, filename } = payload as { bytes: ArrayBuffer; filename: string };
  const byteArray = new Uint8Array(bytes);

  // Parse NBT incrementally (placeholder — actual parsing delegates to domain nbts.ts)
  // In h-5+, this imports the shared domain NBT decoder.
  let parsed: { type: string; size: number };
  try {
    parsed = parseNbtHeader(byteArray);
  } catch (err) {
    const errorResult: WorkerMessageToMain = {
      requestId,
      type: 'error',
      code: 'WORKER_PARSE_FAILED',
      message: (err as Error).message,
    };
    self.postMessage(errorResult);
    return;
  }

  if (cancelled) {
    const cancelResult: WorkerCancelResult = { requestId, type: 'cancelled' };
    self.postMessage(cancelResult);
    return;
  }

  const result: WorkerResult<{ format: string; size: number }> = {
    requestId,
    type: 'result',
    payload: { format: parsed.type, size: parsed.size },
  };
  self.postMessage(result);
});

// Minimal NBT header parse for worker demonstration.
function parseNbtHeader(bytes: Uint8Array): { type: string; size: number } {
  if (bytes.length < 2) {
    throw new Error('NBT_PARSE_TOO_SHORT');
  }
  // Check gzip magic
  if (bytes[0] === 0x1f && bytes[1] === 0x8b) {
    return { type: 'gzip-nbt', size: bytes.length };
  }
  // Check for raw NBT compound (tag type 10)
  if (bytes[0] === 0x0a) {
    return { type: 'nbt-compound', size: bytes.length };
  }
  return { type: 'unknown', size: bytes.length };
}

// Transferable support: postMessage with transfers
export function postTransferable(message: WorkerMessageToMain, transfers: ArrayBufferLike[]): void {
  (self as any).postMessage(message, transfers);
}
