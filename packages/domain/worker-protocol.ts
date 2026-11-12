// ============================================================================
// Slice 12: Worker Ownership / Immutable Snapshots
// ============================================================================

export type WorkerMessage<T> = {
  requestId: string;
  type: 'import' | 'export' | 'region_op' | 'conflict_index' | 'bake' | 'mesh' | 'cancel';
  payload: T;
  transfers?: ArrayBufferLike[];
};

export type WorkerResult<T> =
  | { requestId: string; type: 'result'; payload: T; revision: number; baseRevision: number }
  | { requestId: string; type: 'cancelled'; baseRevision: number }
  | { requestId: string; type: 'error'; message: string; baseRevision: number }
  | { requestId: string; type: 'progress'; done: number; total: number; baseRevision: number };

export function isValidWorkerMessage(msg: unknown): msg is WorkerMessage<unknown> {
  if (typeof msg !== 'object' || msg === null) return false;
  const m = msg as Record<string, unknown>;
  return (
    typeof m.requestId === 'string' &&
    ['import', 'export', 'region_op', 'conflict_index', 'bake', 'mesh', 'cancel'].includes(m.type as string)
  );
}

export function isValidWorkerResult(result: unknown): result is WorkerResult<unknown> {
  if (typeof result !== 'object' || result === null) return false;
  const r = result as Record<string, unknown>;
  return ['result', 'cancelled', 'error', 'progress'].includes(r.type as string);
}

export function checkRevision(
  currentRevision: number,
  baseRevision: number,
): { stale: boolean } {
  return { stale: currentRevision !== baseRevision };
}
