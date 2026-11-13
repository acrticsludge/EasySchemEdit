// packages/workers/src/export-worker.ts
// Schematic export worker — receives snapshot, returns serialized bytes (transferable).
// SUBSPEC-H §5: All heavy computation off main thread; typed messages only.

import type {
  WorkerMessage,
  WorkerMessageToMain,
  WorkerCancelResult,
  ExportWorkerPayload,
} from './worker-protocol.ts';
import { exportSchematic } from '../../formats/index.ts';

/**
 * Core handler for schematic export requests.
 * Runs in worker thread or directly in tests / Node environments.
 */
export async function handleExportRequest(
  requestId: string,
  payload: ExportWorkerPayload,
  isCancelled?: () => boolean,
): Promise<WorkerMessageToMain> {
  if (isCancelled?.()) {
    return { requestId, type: 'cancelled' };
  }

  try {
    const res = await exportSchematic(payload.targetFormat, payload.snapshot, payload.options);

    if (isCancelled?.()) {
      return { requestId, type: 'cancelled' };
    }

    return {
      requestId,
      type: 'result',
      payload: {
        bytes: res.bytes,
        filename: res.filename,
        report: res.report,
        baseRevision: payload.baseRevision,
      },
    };
  } catch (err) {
    return {
      requestId,
      type: 'error',
      code: (err as any)?.code ?? 'WORKER_EXPORT_FAILED',
      message: err instanceof Error ? err.message : String(err),
    };
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

    if (type !== 'export') {
      self.postMessage({
        requestId,
        type: 'error',
        code: 'WORKER_UNKNOWN_MESSAGE',
        message: `Unknown message type: ${type}`,
      });
      return;
    }

    const result = await handleExportRequest(requestId, payload as ExportWorkerPayload, () => cancelled);

    if (result.type === 'result' && (result as any).payload?.bytes?.buffer) {
      const buffer = (result as any).payload.bytes.buffer;
      (self as any).postMessage(result, [buffer]);
    } else {
      self.postMessage(result);
    }
  });
}
