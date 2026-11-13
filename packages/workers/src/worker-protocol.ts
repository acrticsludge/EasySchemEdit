// packages/workers/src/worker-protocol.ts
// Typed worker message protocol (SUBSPEC-H §4.3, §5).
// Workers never receive live Project/Placement/Map objects — only serialized snapshots
// and transferable ArrayBuffer views.
// Cancellation: explicit {type: 'cancel', requestId} message (AbortController cannot cross postMessage).

export type WorkerRequestType =
  | 'import'
  | 'export'
  | 'region_op'
  | 'conflict_index'
  | 'bake'
  | 'mesh'
  | 'cancel';

export type WorkerResultType = 'result' | 'progress' | 'cancelled' | 'error';

export interface WorkerMessage<T = unknown> {
  requestId: string;
  type: WorkerRequestType;
  payload: T;
  transfers?: ArrayBufferLike[]; // explicitly declared transfers
}

export interface WorkerProgressResult {
  requestId: string;
  type: 'progress';
  done: number;
  total: number;
}

export interface WorkerCancelResult {
  requestId: string;
  type: 'cancelled';
}

export interface WorkerErrorResult {
  requestId: string;
  type: 'error';
  code: string;
  message: string;
}

export interface WorkerResult<T = unknown> {
  requestId: string;
  type: WorkerResultType;
  payload?: T;
}

export type WorkerMessageToWorker = WorkerMessage<unknown>;
export type WorkerMessageToMain = WorkerProgressResult | WorkerCancelResult | WorkerErrorResult | WorkerResult<unknown>;

// Stale-revision discard rule: main thread applies worker results only if
// project.revision still matches baseRevision; otherwise discard.
// Copy-then-transfer: main thread keeps live data, copies, transfers the copy;
// worker returns new buffers (never the original).
export interface TransferablePayload {
  buffer: ArrayBufferLike;
  byteOffset: number;
  byteLength: number;
}

// ============================================================================
// Worker Request Payloads (Slice E3.1)
// ============================================================================

export interface ImportWorkerPayload {
  bytes: Uint8Array | ArrayBuffer;
  fileName?: string;
  filename?: string;
  baseRevision?: number;
}

export interface ExportWorkerPayload {
  targetFormat: 'schem-v3' | 'litematic';
  snapshot: any;
  options?: any;
  baseRevision?: number;
}

export interface ChunkData {
  key: string;
  origin?: [number, number, number];
  palette?: (string | { name: string; properties?: Record<string, string> })[];
  indices?: Uint8Array | Uint16Array | Uint32Array | number[];
  getBlock?: (lx: number, ly: number, lz: number) => any;
}

export type ResolvedModel = any;
export type AtlasLayout = Record<string, { u0: number; v0: number; u1: number; v1: number; hasAlpha?: 'none' | 'binary' | 'partial' }> | any;

export interface MeshWorkerPayload {
  chunk: ChunkData;
  neighborChunks?: Record<string, ChunkData>;
  models?: Record<string, ResolvedModel>;
  atlas?: AtlasLayout;
  baseRevision?: number;
  placementId?: string;
}

/**
 * Stale-revision discard rule helper:
 * Main thread applies worker results only if resultBaseRevision is undefined or matches currentProjectRevision.
 */
export function shouldApplyWorkerResult(
  resultBaseRevision: number | undefined,
  currentProjectRevision: number,
): boolean {
  return resultBaseRevision === undefined || resultBaseRevision === currentProjectRevision;
}
