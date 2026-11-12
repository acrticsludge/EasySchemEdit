# Subspec B — Slice b-11: Immutable Snapshots + Memory Management

**Goal:** Implement immutable project snapshots for format adapters per SUBSPEC-B §11. Adapters consume immutable snapshots, never live mutable project state.

## Files to Create/Modify

| File | Purpose |
|------|---------|
| `packages/formats/snapshot.ts` | Snapshot creation + memory management |

## Functions to Define

```ts
export type FormatSnapshot = {
  schemaVersion: number;
  id: string;
  name: string;
  placements: ReadonlyArray<{
    id: string;
    name: string;
    transform: Transform;
    origin: Vec3Half;
    visible: boolean;
    locked: boolean;
    source: { format: string; diagnostics: Diagnostic[] };
    volumeRef: { bounds: Bounds3i; chunkKeys: string[]; nonAirCount: number };
  }>;
  importGroups: ReadonlyArray<ImportGroup>;
  overlapPolicy: 'top-wins' | 'bottom-wins';
  revision: number;
  chunkViews: Map<string, { indices: Uint8Array | Uint16Array | Uint32Array; palette: BlockStateId[] }>;
};

export function createProjectSnapshot(
  project: Project,
  chunkViews: Map<string, { indices: Uint8Array | Uint16Array | Uint32Array; palette: BlockStateId[] }>,
): FormatSnapshot;

export function validateSnapshotCommit(
  snapshot: FormatSnapshot,
  currentRevision: number,
): { valid: boolean; reason?: string };
```

## Snapshot Creation Rules

1. Freeze project metadata (placements array, importGroups, overlapPolicy, revision)
2. For each chunk referenced by export target, transfer ownership of `indices` ArrayBuffer view to worker snapshot
3. Unreferenced chunks are not included
4. Snapshot = `{ projectMetadata, chunkViews }`

## Worker Responsibilities

1. Receives snapshot + typed export message
2. Reads chunk views (no writes to live project)
3. Produces output bytes as a new ArrayBuffer
4. Returns result; main thread applies only if `project.revision` still matches `baseRevision`

## Memory Rules

- No multiple giant intermediate buffers: streaming writer emits format bytes incrementally
- Chunk index arrays are transferred (not copied) where possible; main thread retains its own copy until commit
- Stale worker results (revision mismatch) discarded; buffers released
- Cancellation via explicit `{ type: 'cancel', requestId }` message; partial results never committed

## Acceptance Criteria

- [ ] Format adapters receive immutable `ProjectSnapshot`, never live `Project`
- [ ] No multiple giant intermediate buffers
- [ ] Streaming writer used for large exports
- [ ] Chunk index arrays transferred (not copied) where possible
- [ ] Stale worker results discarded; buffers released
- [ ] Cancellation via explicit cancel message
- [ ] Main thread unchanged until commit

## Tests

**File:** `packages/formats/__tests__/slice-b-11-snapshot.test.ts`

1. Snapshot freezes project metadata
2. Only referenced chunks included in snapshot
3. Revision mismatch → commit rejected
4. Chunk views transferred, not copied
5. Cancellation via explicit cancel message

## Verification Checklist

- [ ] Change does one thing completely (immutable snapshots + memory management)
- [ ] TypeScript compiles without errors
- [ ] All new tests pass
- [ ] Change committed with descriptive message
