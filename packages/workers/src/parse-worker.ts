// packages/workers/src/parse-worker.ts
// NBT parsing worker — receives bytes (transferable), returns parsed structure.
// SUBSPEC-H §5: All heavy computation off main thread; typed messages only.

import type {
  WorkerMessage,
  WorkerMessageToMain,
  WorkerCancelResult,
  ImportWorkerPayload,
} from './worker-protocol.ts';
import { importSchematic } from '../../formats/index.ts';

/**
 * Core handler for schematic import requests.
 * Runs in worker thread or directly in tests / Node environments.
 */
export async function handleImportRequest(
  requestId: string,
  payload: ImportWorkerPayload,
  isCancelled?: () => boolean,
): Promise<WorkerMessageToMain> {
  if (isCancelled?.()) {
    return { requestId, type: 'cancelled' };
  }

  try {
    const rawBytes = payload.bytes;
    const bytes = rawBytes instanceof Uint8Array ? rawBytes : new Uint8Array(rawBytes);
    const fileName = payload.fileName ?? payload.filename ?? 'schematic.schem';

    const res = await importSchematic(bytes, fileName);

    if (isCancelled?.()) {
      return { requestId, type: 'cancelled' };
    }

    return {
      requestId,
      type: 'result',
      payload: {
        placements: res.placements,
        importGroups: res.importGroups,
        group: res.group,
        report: res.report,
        baseRevision: payload.baseRevision,
      },
    };
  } catch (err) {
    return {
      requestId,
      type: 'error',
      code: (err as any)?.code ?? 'WORKER_PARSE_FAILED',
      message: err instanceof Error ? err.message : String(err),
    };
  }
}

// Transferable support: postMessage with transfers
export function postTransferable(message: WorkerMessageToMain, transfers?: ArrayBufferLike[]): void {
  if (typeof self !== 'undefined' && typeof (self as any).postMessage === 'function') {
    if (transfers && transfers.length > 0) {
      (self as any).postMessage(message, transfers);
    } else {
      (self as any).postMessage(message);
    }
  }
}

// Guarded browser worker event listener
if (typeof self !== 'undefined' && typeof (self as any).addEventListener === 'function') {
  let cancelled = false;

  self.addEventListener('message', async (event: MessageEvent<WorkerMessage<any>>) => {
    const { requestId, type, payload } = event.data;

    if (type === 'cancel') {
      cancelled = true;
      const cancelResult: WorkerCancelResult = { requestId, type: 'cancelled' };
      self.postMessage(cancelResult);
      return;
    }

    cancelled = false;

    if (type !== 'import') {
      self.postMessage({
        requestId,
        type: 'error',
        code: 'WORKER_UNKNOWN_MESSAGE',
        message: `Unknown message type: ${type}`,
      });
      return;
    }

    const result = await handleImportRequest(requestId, payload as ImportWorkerPayload, () => cancelled);
    self.postMessage(result);
  });
}
