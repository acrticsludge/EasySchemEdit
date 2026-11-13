// apps/web/src/workers/parse-worker.ts
// Web Worker entry point for schematic parsing and import.
// Delegates to @easyschemedit/workers handleImportRequest.

import {
  handleImportRequest,
  type WorkerMessage,
  type WorkerCancelResult,
  type ImportWorkerPayload,
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
