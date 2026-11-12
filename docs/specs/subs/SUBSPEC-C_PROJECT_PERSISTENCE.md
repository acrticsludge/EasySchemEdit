# SUBSPEC-C — Project & Persistence (v1 implementation contract)

Source decisions: C1–C6 (locked planning baseline).  
Cross-checked against SUBSPEC-A (domain model, immutable snapshots, NBT AST, chunk storage) and SUBSPEC-B (format adapters, import/export reports, .vxproj serialization).

Every decision below is translated into implementation details: type definitions, data flow, validation rules, worker responsibilities, frontend interactions, backend/companion responsibilities, failure handling, and tests.

---

## 1. Locked decisions

| ID | Decision | Status |
|---|---|---|
| C1 | Storage budget: warn at 512 MiB or 70% quota; hard stop at 1.5 GiB or 85% quota. | Locked |
| C2 | .vxproj archive: ZIP64 with DEFLATE compression level 6. | Locked |
| C3 | Autosave: 1,500ms debounce, 10 commands or 10 seconds max interval. | Locked |
| C4 | History: 200 entries or 256 MiB retained history data. | Locked |
| C5 | Migrations: source-controlled, deterministic, pure transformations. | Locked |
|| C6 | Recovery: snapshots in IndexedDB, with .vxproj download; last 3 versions, 7-day retention. | Locked |
|| C7 | Revisions monotonically increasing; undo/redo each create a new committed revision; history cursor separate. | Locked |
|| C8 | No automatic cloud synchronization; .vxproj is the cross-device transfer mechanism. | Locked |

---

## 2. Type definitions

### 2.1 Project lifecycle

```ts
export type ProjectRevision = number;  // monotonically increasing, never reused

export type HistoryCursor = {
  index: number;        // position in history array (-1 = no undo available)
  maxIndex: number;     // highest committed index
};

export type ProjectMetadata = {
  author?: string;
  createdAt: string;   // ISO 8601 UTC
  modifiedAt: string;  // ISO 8601 UTC
};

export type Project = {
  schemaVersion: number;
  id: string;
  name: string;
  placements: Placement[];
  importGroups: ImportGroup[];
  overlapPolicy: 'top-wins' | 'bottom-wins';
  conflictOverlay: 'off' | 'conflicts' | 'full';
  metadata: { author?: string; createdAt: string; modifiedAt: string };
  revision: ProjectRevision;     // monotonically increasing
  historyCursor: HistoryCursor;   // separate from revision
};

export type ProjectStorageState = {
  dirty: boolean;
  saving: boolean;
  lastSavedAt?: string;
  lastError?: Diagnostic;
  storageUsageBytes: number;
  storageQuotaBytes: number;
  quotaUsagePercent: number;
};

export type ProjectOperation =
  | { kind: 'create'; name: string }
  | { kind: 'open'; projectId: string }
  | { kind: 'duplicate'; sourceProjectId: string; newName: string }
  | { kind: 'rename'; projectId: string; newName: string }
  | { kind: 'delete'; projectId: string }
  | { kind: 'importFiles'; files: File[]; options: ImportOptions }
  | { kind: 'exportProject'; projectId: string; options: ExportOptions };
```

### 2.2 Autosave state

```ts
export type AutosaveConfig = {
  debounceMs: number;          // 1500
  commandThreshold: number;     // 10
  maxIntervalMs: number;        // 10000
  flushOnVisibilityChange: boolean;
  flushOnBeforeUnload: boolean; // last-resort warning only
};

export type AutosaveState = {
  config: AutosaveConfig;
  lastCommandAt: number;       // epoch ms
  commandsSinceSave: number;
  lastSaveAt: number;          // epoch ms
  state: 'saved' | 'saving' | 'unsaved' | 'save-failed';
  pendingSave: boolean;
};
```

### 2.3 History command record

```ts
export type CommandRecord = {
  id: string;
  label: string;
  baseRevision: number;          // revision before this command
  committedRevision: number;    // revision after this command (baseRevision + 1)
  timestamp: number;
  affectedPlacementIds: string[];
  affectedBounds?: Bounds3i[];
  changedBlockCount: number;
  forward: DocumentDelta;
  inverse: DocumentDelta;
  estimatedBytes: number;
  historyCursorBefore: number;   // cursor position before this command
  historyCursorAfter: number;    // cursor position after this command
};

export type DocumentDelta = {
  placementChanges: Array<{
    placementId: string;
    before: PlacementSnapshot | null;   // null = placement didn't exist
    after: PlacementSnapshot | null;
  }>;
  chunkDeltas: Array<{
    placementId: string;
    chunkKey: string;
    before: ChunkDelta | null;
    after: ChunkDelta | null;
  }>;
  metadataChanges?: {
    overlapPolicy?: { before: 'top-wins' | 'bottom-wins'; after: 'top-wins' | 'bottom-wins' };
    conflictOverlay?: { before: string; after: string };
  };
};

export type PlacementSnapshot = {
  name: string;
  transform: Transform;
  origin: Vec3Half;
  visible: boolean;
  locked: boolean;
  color?: string;
  volumeRef: { bounds: Bounds3i; chunkKeys: string[]; nonAirCount: number };
  ancillaryRef: string;  // IndexedDB key for ancillary NBT
};

export type ChunkDelta = {
  palette: BlockStateId[];
  indices: Uint8Array | Uint16Array | Uint32Array;
  revision: number;
};

### 2.3.1 IndexedDB schema

Database name: `schematic-editor-db`, version 1.

Object stores:

| Store name | Key | Indexes | Description |
|---|---|---|---|
| `projects` | `id` (string) | `name` (string), `modifiedAt` (string) | Project metadata (no chunk data) |
| `chunks` | `[placementId, chunkKey]` (compound) | `placementId` (string), `chunkKey` (string) | Chunk index arrays + palette |
| `ancillary` | `[placementId, ancillaryType]` (compound) | `placementId` (string) | Block entities, entities, biomes, ticks, unknown tags |
| `history` | `[projectId, commandId]` (compound) | `projectId` (string), `committedRevision` (number) | Command records with forward/inverse deltas |
| `recovery` | `id` (string) | `projectId` (string), `createdAt` (string), `expiresAt` (string) | Recovery snapshots |
| `assets` | `[version, assetHash]` (compound) | `version` (string) | Cached extracted vanilla assets |
| `settings` | `key` (string) | — | User preferences, approved directories, workspace layouts |
| `idempotency` | `requestId` (string) | `projectId` (string), `expiresAt` (number) | Idempotency cache entries |
| `commitRecords` | `transactionId` (string) | `projectId` (string), `phase` (string), `targetRevision` (number) | Crash-safe commit records (section 2.3.2) |
| `autosaveJournal` | `journalId` (string) | `projectId` (string), `committedRevision` (number) | Autosave journal of committed command deltas awaiting checkpoint |

Chunk reference counting:
- Each chunk record stores `refCount: number` (number of placements referencing it).
- On project duplication: increment `refCount` for shared chunks (copy-on-write).
- On placement deletion: decrement `refCount`; if zero, delete chunk record.
- On project deletion: decrement all chunk refCounts; delete orphaned chunks.

### 2.3.2 Crash-safe commit protocol

```ts
export type CommitPhase = 'pending' | 'writing' | 'verifying' | 'committed' | 'failed';

export type CommitRecord = {
  transactionId: string;
  projectId: string;
  baseRevision: number;
  targetRevision: number;
  phase: CommitPhase;
  tempKeys: string[];           // temporary IndexedDB keys written
  checksums: Record<string, string>;  // key → SHA-256
  startedAt: number;
  completedAt?: number;
};
```

Commit protocol:
1. **Pending**: Create `CommitRecord` with `phase = 'pending'`, `targetRevision = baseRevision + 1`.
2. **Writing**: Write all changed data (project metadata, chunk deltas, ancillary, history) to temporary keys (prefixed `temp_`).
3. **Verifying**: Read back all temporary keys, verify SHA-256 checksums match.
4. **Committed**: Atomically update `CommitRecord.phase = 'committed'`, update project's `committedRevision`, delete temporary keys, delete old `CommitRecord`.
5. **Failed**: If any step fails, set `phase = 'failed'`, log diagnostic, retain temporary keys for recovery, do not update `committedRevision`.

On application startup: scan for `CommitRecord` entries with `phase != 'committed'`. If found, attempt recovery from temporary keys. If recovery fails, offer previous committed revision.

### 2.3.3 .vxproj archive (revised)

```ts
export type VxprojManifest = {
  schemaVersion: number;
  appVersion: string;
  assetProfile: string;       // e.g. "1.21.11"
  createdAt: string;
  modifiedAt: string;
  checksums: Record<string, string>;  // path → SHA-256 (single source of truth)
};

// No redundant per-file checksums; manifest.checksums is authoritative.
```

Archive structure (ZIP64):

```
project.vxproj
├── manifest.json            // schemaVersion, app version, asset profile, createdAt, modifiedAt, checksums
├── project.json             // canonical JSON: placements, importGroups, metadata, revision, historyCursor
├── placements/
│   └── <placement-id>/
│       ├── volume.json      // bounds, chunk keys, nonAirCount
│       ├── transform.json
│       ├── origin.json
│       ├── ancillary.json   // serialized NBT AST as JSON (typed)
│       └── chunks/
│           └── <cx>_<cy>_<cz>.bin   // SUBSPEC-A binary chunk codec (little-endian, SHA-256 trailing)
├── assets/
│   └── custom-resource-pack-references.json
└── (no separate checksums.json — manifest.checksums is the single source)
```

Serialization rules:
- Chunk `.bin` files use SUBSPEC-A binary codec: magic `0x564F4F43`, version uint16, chunk coords int32, palette entries, index array (Uint8/16/32), trailing SHA-256.
- NBT ancillary data serialized via SUBSPEC-B NBT binary codec (big-endian tagged values) or typed JSON for archive portability.
- `project.json` serialized with deterministic key order (insertion order for compound NBT, sorted keys for block-state props). No `undefined`, `NaN`, `Infinity`. `bigint` values as decimal strings with type marker.
- ZIP64 with DEFLATE compression level 6 for metadata and chunk payloads. Already-compressed assets stored uncompressed.
- Streaming ZIP writer: emit entries incrementally, no full-archive intermediate buffer.
- Archive validation on read: verify ZIP structure, check all paths against traversal rules, verify manifest checksums, verify chunk checksums, reject duplicate entries, reject decompression bombs (ratio > 100:1).

Path traversal prevention:
- Reject any entry path containing `..`, absolute paths, or backslashes.
- Normalize all paths to forward-slash relative paths.
- Reject duplicate entry names.
- Maximum decompression ratio: 100:1 per entry.

### 2.3.4 Migration (type-safe)

```ts
export type VersionedSchema<T> = {
  version: number;
  schema: T;
  validate: (data: unknown) => data is T;
};

export type MigrationStep = {
  fromVersion: number;
  toVersion: number;
  description: string;
  transform: (input: unknown) => unknown;
  validateInput: (data: unknown) => boolean;
  validateOutput: (data: unknown) => boolean;
};

export type MigrationChain = {
  steps: MigrationStep[];
  apply: (data: unknown, fromVersion: number, toVersion: number) => MigrationResult;
  rollback: (snapshot: RecoverySnapshot) => void;
};

export type MigrationResult = {
  data: unknown;
  fromVersion: number;
  toVersion: number;
  stepsApplied: number[];
  success: boolean;
  error?: Diagnostic;
};
```

Migration rules:
- Each migration is a pure function: `(input: unknown) => unknown`.
- Input validated against source version schema before transform.
- Output validated against target version schema after transform.
- Deterministic: same input always produces same output.
- Pre-migration recovery snapshot created before any migration runs.
- If migration fails: restore from snapshot, log diagnostic, refuse to open project.
- No silent downgrades: if project version > supported version, refuse to open with clear message.
- Migration chain is linear: v1→v2→v3→...→latest. No skipping.

### 2.3.5 Autosave (revised)

```ts
export type AutosaveState = {
  config: AutosaveConfig;
  lastCommandAt: number;
  commandsSinceSave: number;
  lastSaveAt: number;
  state: 'saved' | 'saving' | 'unsaved' | 'save-failed';
  pendingSave: boolean;
  saveInProgress: boolean;       // prevents concurrent saves
  newerEditArrived: boolean;     // true if edit arrived during save
};

export type AutosaveConfig = {
  debounceMs: number;            // 1500
  commandThreshold: number;       // 10
  maxIntervalMs: number;         // 10000
  flushOnVisibilityChange: boolean;
  flushOnBeforeUnload: boolean;
};
```

Autosave race resolution:
- `saveInProgress` flag prevents concurrent save operations.
- If a new edit arrives during save (`newerEditArrived = true`), the save completes with the state at save-start, then a new save is scheduled immediately after.
- Save captures a snapshot of the project at save-start time (revision captured). If revision changed during save, the save is marked stale and retried.
- `beforeunload` is only a last-resort warning; never the persistence mechanism.

### 2.3.6 Storage estimation

```ts
export type ProjectStorageEstimate = {
  projectMetadataBytes: number;
  chunkDataBytes: number;
  ancillaryDataBytes: number;
  historyBytes: number;
  recoveryBytes: number;
  totalBytes: number;
};

export type BrowserQuotaEstimate = {
  usage: number;                  // bytes used by origin
  quota: number;                  // bytes available to origin
  usagePercent: number;
};

export type StorageBudgetCheck = {
  projectEstimate: ProjectStorageEstimate;
  browserQuota: BrowserQuotaEstimate;
  warning: boolean;               // projected > 512 MiB or > 70% quota
  hardReject: boolean;            // projected > 1.5 GiB or > 85% quota
  headroomBytes: number;          // quota - usage - projectEstimate
};
```

- Project storage estimates measure only this project's data.
- Browser-origin quota estimates measure all data stored by this origin (all projects, caches, etc.).
- These are distinct measurements; do not conflate.
- Use `navigator.storage.estimate()` for browser quota; do not assume available disk space.

### 2.3.7 Persistent storage

```ts
export type StoragePersistence = {
  requestPersistent: () => Promise<boolean>;
  isPersistent: boolean;
  denialHandling: 'warn' | 'block-large-imports' | 'allow-with-warning';
};
```

- Request persistent storage on first large import or on user opt-in.
- If denied: warn user, allow small operations, block large imports with clear message.
- Quota headroom: keep at least 10% of quota free for autosave and recovery data.

### 2.3.8 Idempotency records: location and atomic commit

Idempotency records (SUBSPEC-F `IdempotencyEntry`, keyed by `requestId`) live in the **same IndexedDB database as the document they protect**, so that an idempotency result can be committed atomically with the document.

| Deployment mode | Document location | Idempotency record location | Atomic commit mechanism |
|---|---|---|---|
| Browser-live | Browser IndexedDB (`schematic-editor-db`, `autosaveJournal`/`history` stores + project data) | Same browser IndexedDB, `idempotency` store | The idempotency result entry is written in the same IndexedDB transaction that commits the document revision (project metadata + chunk deltas + history). Either both commit or neither; a companion restart or crash leaves either a complete committed pair or nothing. |
| Headless local-file | Companion's local IndexedDB (`schematic-editor-db`) | Same companion IndexedDB, `idempotency` store | Identical: idempotency result persisted atomically with the successful document commit (SUBSPEC-F F11). |

Rules:
- An idempotency entry is created only on a **successful** document commit, keyed by `requestId`, storing the `MutationResult`, `operation`, `normalizedArgs`, `createdAt`, `expiresAt` (15-minute retention), and `sizeBytes`.
- On a duplicate `requestId` with matching args, the cached result is returned without re-applying the operation; with differing args, `IDEMPOTENCY_ARGS_MISMATCH`.
- Idempotency records are scoped to a `projectId`; they are evicted when the project is deleted and expire after 15 minutes (oldest-first when over 1,000 entries / 50 MiB).
- Because idempotency records share the document's IndexedDB database and commit transaction, there is no split-brain between "document committed but idempotency result lost" or vice versa.

### 2.4 Storage budget

```ts
export type StorageBudget = {
  warningThresholdBytes: number;    // 512 * 1024 * 1024 (512 MiB)
  hardRejectThresholdBytes: number; // 1.5 * 1024 * 1024 * 1024 (1.5 GiB)
  warningQuotaPercent: number;      // 70
  hardRejectQuotaPercent: number;   // 85
};

export type StorageEstimate = {
  projectMetadataBytes: number;
  chunkDataBytes: number;
  ancillaryDataBytes: number;
  historyBytes: number;
  recoveryBytes: number;
  totalBytes: number;
  quotaUsagePercent: number;
};
```

### 2.5 Recovery snapshot

```ts
export type RecoverySnapshot = {
  id: string;
  projectId: string;
  projectName: string;
  schemaVersion: number;
  createdAt: string;          // ISO 8601
  expiresAt: string;          // ISO 8601, 7 days
  snapshotType: 'autosave' | 'pre-migration' | 'manual';
  storageKey: string;         // IndexedDB object store key
  sizeBytes: number;
};

export type RecoveryConfig = {
  maxVersions: number;        // 3
  retentionDays: number;       // 7
  allowOpenWithoutOverwrite: boolean;
  allowExportAsVxproj: boolean;
};
```

### 2.6 Migration

```ts
export type Migration = {
  fromVersion: number;
  toVersion: number;
  description: string;
  transform: (project: unknown) => unknown;  // pure, deterministic
  validate: (project: unknown) => boolean;
};

export type MigrationRegistry = {
  migrations: Migration[];
  latestVersion: number;
  apply: (project: unknown, fromVersion: number) => { project: unknown; migrationsApplied: number[] };
  createRecoverySnapshot: (project: unknown) => RecoverySnapshot;
};
```

### 2.7 .vxproj archive structure

```ts
export type VxprojManifest = {
  schemaVersion: number;
  appVersion: string;
  assetProfile: string;       // e.g. "1.21.11"
  createdAt: string;
  modifiedAt: string;
  checksums: Record<string, string>;  // path → SHA-256
};

export type VxprojEntry = {
  path: string;
  type: 'json' | 'binary' | 'compressed';
  size: number;
  sha256: string;
};
```

---

## 3. Data flow

### 3.1 Project lifecycle (revised)

```
Create blank → Project with empty placements/importGroups, revision 0, historyCursor -1
Open → Load from IndexedDB → validate schemaVersion → migrate if needed → Project
  → scan for incomplete CommitRecords → recover if possible
Duplicate → Deep-copy Project (new id/name) → increment chunk refCounts (copy-on-write) → save
Rename → Update metadata.name → save
Delete → Mark deleted in IndexedDB → decrement chunk refCounts → delete orphaned chunks
Import files → Format adapter → Placement[]/ImportGroup[] → append to Project → increment revision
Export project → ProjectSnapshot → format adapter → .vxproj or .schem/.litematic
```

### 3.2 Autosave flow (revised, race-safe)

```
Command committed → increment command count, set newerEditArrived if saveInProgress
  → if saveInProgress:
      set newerEditArrived = true
      schedule new save after current completes
  → else if command count >= 10: flush immediately
  → else: schedule debounce timer (1500ms)
  → if timer elapsed (max 10s): flush immediately
  → if visibility change: flush pending
  → if beforeunload: show warning (never rely on this)

Flush (race-safe):
  1. Set saveInProgress = true, capture revision at save-start
  2. Serialize project metadata + chunk deltas to temporary IndexedDB keys
  3. Verify checksums of temporary writes
  4. If revision changed during save (newerEditArrived):
       → mark save stale, complete current save, schedule immediate retry
  5. Atomically update committed revision pointer
  6. Delete temporary keys
  7. Set saveInProgress = false
  8. If newerEditArrived: trigger new save immediately
```

### 3.3 History flow (revised)

```
Command committed:
  1. Validate baseRevision matches current revision
  2. Compute forward and inverse DocumentDelta
  3. Estimate delta bytes
  4. If estimatedBytes + currentHistoryBytes > 256 MiB:
       → prune oldest entries until under budget
       → warn if pruning removes the only recovery point for a large edit
  5. If entry count > 200: prune oldest
  6. Append CommandRecord (with historyCursorBefore/After)
  7. Increment project revision (monotonically)
  8. Update historyCursor

Undo:
  1. If historyCursor < 0: no-op (nothing to undo)
  2. Pop CommandRecord at historyCursor
  3. Apply inverse delta
  4. Restore affected placements, chunks, ancillary data, origins, z-order, overlap policy, session selection
  5. Increment project revision (new committed revision)
  6. Decrement historyCursor

Redo:
  1. If historyCursor >= maxIndex: no-op (nothing to redo)
  2. Apply forward delta from CommandRecord at historyCursor + 1
  3. Increment project revision (new committed revision)
  4. Increment historyCursor

New commit after undo:
  1. Truncate history after cursor
  2. Append new CommandRecord
  3. Increment revision
  4. Update cursor
```

### 3.4 Recovery flow (revised)

```
On project open:
  1. Check for incomplete CommitRecords (phase != 'committed')
  2. If found: attempt recovery from temporary keys
  3. If recovery fails: offer previous committed revision
  4. Check for recovery snapshots in IndexedDB
  5. If found: show "Open recovered version" / "Download backup" options
  6. User can open recovered copy without overwriting the current project
  7. User can export any recovery version as .vxproj
  8. Recovery snapshots never depend on filesystem access
```

Recovery snapshot triggers:
- Before migration (automatic).
- On tab crash (detected on next open via missing clean shutdown flag).
- On quota warning (proactive).
- On user request (manual).
- Before destructive operations (bake, delete all).

Retention: last 3 versions, 7-day expiry. Cleanup: delete expired snapshots on startup.

Journal replay: if autosave journal has uncommitted entries newer than last committed revision, replay them in order. If replay fails, offer recovery snapshot.

---

## 4. Validation rules

### 4.1 Storage budget (C1)

- Warning: projected project storage exceeds 512 MiB, or available quota usage passes 70%.
- Hard reject: projected usage exceeds 1.5 GiB, or passes 85% of browser-reported quota, whichever happens first.
- Keep enough headroom for autosaves and recovery data (at least 10% of quota).
- UI warns before an import or bake is attempted if its projected result would cross the limit.
- Use browser quota estimation (`navigator.storage.estimate()`), not assumptions about available disk.
- Project storage estimates measure only this project's data; browser-origin quota estimates measure all data stored by this origin. These are distinct measurements; do not conflate.

### 4.2 .vxproj archive (C2)

- ZIP64 format (supports files > 4 GiB).
- DEFLATE compression level 6 for metadata and chunk payloads.
- Already-compressed assets stored uncompressed within the ZIP.
- Streaming ZIP writer: emit entries incrementally, no full-archive intermediate buffer.
- Single checksum source: `manifest.checksums` maps every entry path to SHA-256. No redundant per-file checksums.
- Path traversal prevention: reject `..`, absolute paths, backslashes. Normalize to forward-slash relative paths.
- Reject duplicate entry names.
- Maximum decompression ratio: 100:1 per entry.
- Archive validation on read: verify ZIP structure, check paths, verify manifest checksums, verify chunk checksums (trailing SHA-256 per SUBSPEC-A 7.1).

### 4.3 Autosave (C3)

- Debounce: 1,500ms after the last command.
- Trigger after every 10 committed commands if the debounce hasn't already fired.
- Maximum interval: 10 seconds.
- Explicit save always flushes pending changes.
- Persist committed command deltas in the IndexedDB journal.
- `beforeunload` is only a last-resort warning, never the persistence mechanism.
- Show clear states: Saving, Saved, Unsaved, Save failed.
- Storage quota failure must be visible and must never silently drop the previous save.
- Autosave race resolution: `saveInProgress` flag prevents concurrent saves. If a new edit arrives during save, the save completes with save-start state, then a new save is scheduled immediately.

### 4.4 History (C4)

- Default limits: 200 entries, 256 MiB of retained history data.
- Whichever limit is reached first triggers pruning of the oldest undoable entries.
- The current project must never be deleted just because old history was pruned.
- Do not silently evict the only recovery point for a large edit; warn before an operation whose undo delta would exceed the budget.
- History can be persisted in IndexedDB. Project archive export may optionally include history; not required for ordinary schematic export.
- Revisions monotonically increasing; undo/redo each create a new committed revision; history cursor separate from revision.

### 4.5 Migrations (C5)

- Source-controlled in `packages/project-schema/migrations/`.
- One migration per version transition.
- Pure and deterministic transformations.
- Version-specific schema validation (input and output).
- Fixture for every supported previous schema.
- Never mutate the original file.
- Create a recovery snapshot before migration.
- Do not silently downgrade projects (refuse if project version > supported version).
- Migration chain is linear: v1→v2→v3→...→latest. No skipping.
- If migration fails: restore from snapshot, log diagnostic, refuse to open project.

### 4.6 Recovery (C6)

- Recovery snapshots in dedicated IndexedDB stores.
- Defaults: last 3 recoverable versions, 7-day retention.
- User can open a recovered copy without overwriting the current project.
- User can export any recovery version as `.vxproj`.
- Browser cannot dictate the user's download directory, so recovery must not depend on filesystem access.
- Cleanup: delete expired snapshots on startup.
- Journal replay: if autosave journal has uncommitted entries newer than last committed revision, replay them in order. If replay fails, offer recovery snapshot.

---

## 5. Worker responsibilities

- IndexedDB read/write in worker for large project data.
- Serialization/deserialization of .vxproj archives in worker.
- Checksum computation in worker.
- History delta computation in worker.
- Storage quota estimation in worker.
- Transferable `ArrayBuffer` for chunk data; main thread retains copy until commit.
- Cancellation via `AbortController`; partial results never committed.
- Stale revision results discarded.

---

## 6. Frontend interactions

### 6.1 Project management UI

- Create blank project: name input, author optional.
- Open project: list with name, modified date, size estimate.
- Import: drag/drop or file picker; show import queue with per-file/per-region progress, cancellation, diagnostics.
- Save: explicit save flushes pending changes; show dirty/saving/saved/error state.
- Export: format selector, preview dimensions/blocks/warnings, progress indicator, cancel, download only after validation.
- Recovery: "Download backup" and "Open recovered version" after crash/reload.

### 6.2 Storage budget UI

- Show storage usage estimate in project settings.
- Warn before import/bake if projected result crosses 512 MiB or 70% quota.
- Hard reject with clear message if projected usage exceeds 1.5 GiB or 85% quota.
- Allow user to clear old history entries without deleting project data.

### 6.3 History UI

- Undo/redo buttons with keyboard shortcuts (Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z).
- History panel: list of committed commands with label, timestamp, changed block count.
- Show memory usage and pruning state.
- Show "older undo steps no longer available" when pruning occurs.

---

## 7. Failure handling

| Condition | Handling |
|---|---|
| Storage quota exceeded | `ENGINE_STORAGE_LIMIT`; show error, retain previous save, never silently drop. |
| IndexedDB write failure | Retry with exponential backoff; if persistent, show save-failed state. |
| Migration failure | Create recovery snapshot before migration; if migration fails, restore from snapshot. |
| Corrupt archive on open | `CORRUPT_ARCHIVE`; offer recovery version or re-import. |
| Autosave interruption (tab crash) | Recovery snapshot available on next open; show "Open recovered version". |
| History pruning removes large-edit recovery | Warn before operation whose undo delta exceeds budget. |
|| Beforeunload not completed | Show warning; do not rely on beforeunload for persistence. |
|| Incomplete commit on startup | Scan for `CommitRecord` with `phase != 'committed'`; attempt recovery from temp keys. |
|| Path traversal in archive | Reject entry; log security warning; refuse entire archive. |
|| Decompression bomb | Reject entry; show estimated size; refuse archive. |
|| Duplicate entry in archive | Reject archive; show duplicate path. |

---

## 8. Tests and acceptance criteria

### 8.1 Domain/core tests

- Project create/open/duplicate/rename/delete.
- Autosave debounce and command-count threshold.
- History undo/redo with delta-based records.
- History pruning at entry count and byte budget.
- Migration deterministic and tested against fixtures.
- Recovery snapshot creation and restoration.
- Storage quota estimation and warning/reject thresholds.
- .vxproj archive round-trip with checksums.

### 8.2 Acceptance criteria for SUBSPEC-C (revised)

1. Browser autosave uses IndexedDB object stores for project metadata, chunk binaries, ancillary NBT, and history records.
2. No localStorage for schematic data.
3. Autosave runs after committed commands using debounce (1500ms) and command-count threshold (10); max interval 10s.
4. Autosave flushes on page visibility change and before unload (warning only).
5. Dirty/saving/saved/error state visible.
6. Storage quota failure visible; never silently drops previous save.
7. .vxproj archive uses ZIP64 with DEFLATE level 6; includes manifest, project.json, placements, chunks, assets, checksums (single source in manifest).
8. Every project archive contains schemaVersion, app version, asset profile reference, source metadata, checksums.
9. Migrations deterministic, type-safe, tested, never overwrite only copy of older project; recovery snapshot before migration; rollback on failure.
10. Recovery: last 3 versions, 7-day retention, open without overwriting, export as .vxproj.
11. History bounded by 200 entries or 256 MiB; pruning warns before evicting large-edit recovery.
12. Command concurrency: baseRevision check on every command; stale results rejected.
13. Undo restores affected placements, chunk contents, ancillary data, origins, z-order, overlap policy, session selection.
14. No partial commit; cancellation before commit leaves document unchanged.
15. Revisions monotonically increasing; undo/redo each create new committed revision; history cursor separate.
16. Chunk reference counting on duplication (copy-on-write) and deletion (orphan cleanup).
17. Persistent storage request with denial handling; quota headroom maintained.
18. No automatic cloud sync; .vxproj is cross-device transfer mechanism.
19. Crash-safe commit protocol: temp writes, checksum verification, atomic committed-revision update.
20. IndexedDB schema with 8 object stores, compound keys, indexes, and chunk reference counting.

---

**Next:** SUBSPEC-D (Editing Engine) will follow once Subspec C is accepted.