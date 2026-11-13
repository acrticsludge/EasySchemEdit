// packages/workers/src/index.ts
// Public API for the workers package.

export type {
  WorkerRequestType,
  WorkerResultType,
  WorkerMessage,
  WorkerProgressResult,
  WorkerCancelResult,
  WorkerErrorResult,
  WorkerResult,
  WorkerMessageToWorker,
  WorkerMessageToMain,
  TransferablePayload,
  ImportWorkerPayload,
  ExportWorkerPayload,
  ChunkData,
  ResolvedModel,
  AtlasLayout,
  MeshWorkerPayload,
} from './worker-protocol.ts';

export { shouldApplyWorkerResult } from './worker-protocol.ts';

export { handleImportRequest, postTransferable } from './parse-worker.ts';
export { handleExportRequest } from './export-worker.ts';
export { handleMeshRequest, getMeshTransfers } from './mesh-worker.ts';
