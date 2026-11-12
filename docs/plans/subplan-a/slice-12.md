# Subspec A — Slice 12: Worker Ownership / Immutable Snapshots

**Goal:** Define the worker protocol and copy-on-write rules. Workers never hold live `Project`/`Placement` references; buffers transferred explicitly; stale revision results discarded.

## Files to Create/Modify

| File | Purpose |
|------|---------|
| `packages/domain/worker-protocol.ts` | Worker message types + ownership rules |

## Worker Protocol

```ts
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
```

## Ownership Rules

1. Main thread owns the live project. Workers never receive references to live `Project`, `Placement`, or `Map` objects.
2. Workers receive serialized snapshots: JSON-compatible metadata plus `ArrayBuffer` views of chunk data. Chunk `indices` buffers may be transferred only when the worker takes full ownership.
3. If a worker transfers a buffer and operation cancelled before commit, buffer is lost (acceptable: main thread retains its own copy via copy-on-write).
4. Worker results are new buffers/objects. Main thread applies them atomically at commit only if `project.revision` still matches `baseRevision`.
5. Stale worker results (revision mismatch) discarded; buffers released.
6. Cancellation: explicit `{ type: 'cancel', requestId }` message (cannot use `AbortController` across `postMessage`). Worker checks before each chunk batch.
7. Progress results: `{ type: 'progress', requestId, done, total }` emitted incrementally; main thread may surface progress UI.

## Acceptance Criteria

- [ ] Workers never hold the only reference to a live chunk buffer
- [ ] Stale revision results discarded
- [ ] Partial results never committed
- [ ] Main thread unchanged until commit
- [ ] Cancellation via explicit `{ type: 'cancel', requestId }` message (not `AbortController`)
- [ ] Progress result type `{ requestId, done, total }` available

## Tests

**File:** `packages/domain/__tests__/slice-12-worker-protocol.test.ts`

1. Worker message types serialize/deserialize correctly
2. Stale revision result (baseRevision ≠ current revision) is rejected
3. Copy-on-write: shared chunk buffer cloned before modification
4. Cancel message `{ type: 'cancel', requestId }` is a valid WorkerMessage type
5. Progress result `{ type: 'progress', requestId, done, total }` is a valid WorkerResult type

## Verification Checklist

- [ ] Change does one thing completely (worker protocol + copy-on-write)
- [ ] TypeScript compiles without errors
- [ ] All new tests pass
- [ ] Change committed with descriptive message
