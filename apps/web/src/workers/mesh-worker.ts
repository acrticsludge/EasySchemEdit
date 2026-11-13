// apps/web/src/workers/mesh-worker.ts
// Web Worker entry point for chunk meshing.
// Delegates to @easyschemedit/workers handleMeshRequest.

import {
  handleMeshRequest,
  getMeshTransfers,
  type WorkerMessage,
  type WorkerCancelResult,
  type MeshWorkerPayload,
} from '@easyschemedit/workers';

let cancelled = false;

self.addEventListener('message', (event: MessageEvent<WorkerMessage<any>>) => {
  const { requestId, type, payload } = event.data;

  if (type === 'cancel') {
    cancelled = true;
    const cancelResult: WorkerCancelResult = { requestId, type: 'cancelled' };
    self.postMessage(cancelResult);
    return;
  }

  cancelled = false;

  if (type !== 'mesh') {
    self.postMessage({
      requestId,
      type: 'error',
      code: 'WORKER_UNKNOWN_MESSAGE',
      message: `Unknown message type: ${type}`,
    });
    return;
  }

  const result = handleMeshRequest(requestId, payload as MeshWorkerPayload, () => cancelled);

  if (result.type === 'result' && (result as any).payload?.mesh) {
    const transfers = getMeshTransfers((result as any).payload.mesh);
    if (transfers.length > 0) {
      (self as any).postMessage(result, transfers);
      return;
    }
  }

  self.postMessage(result);
});
