// apps/web/src/workers/export-worker.ts
// Web Worker entry point for schematic export.
// Delegates to @easyschemedit/workers handleExportRequest.

import {
  handleExportRequest,
  type WorkerMessage,
  type WorkerCancelResult,
  type ExportWorkerPayload,
} from '@easyschemedit/workers';

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
