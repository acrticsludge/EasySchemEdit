# Subspec C — Slice c-0: IndexedDB Schema

**Source:** `docs/specs/subs/SUBSPEC-C_PROJECT_PERSISTENCE.md` §2.3.1 (IndexedDB schema table)
**Constraint:** Pure TypeScript, zero framework/browser/Node/Three.js/MCP imports. IndexedDB accessed via browser global with feature detection.

## Goal

Create the IndexedDB database schema with 10 object stores, compound keys, and indexes as defined in SUBSPEC-C §2.3.1. The database name is `schematic-editor-db`, version 1.

## Object stores

| Store name | Key path | Indexes | Description |
|------------|----------|---------|-------------|
| `projects` | `id` (string) | `name` (string), `modifiedAt` (string) | Project metadata (no chunk data) |
| `chunks` | `[placementId, chunkKey]` (compound) | `placementId` (string), `chunkKey` (string) | Chunk index arrays + palette, refCount |
| `ancillary` | `[placementId, ancillaryType]` (compound) | `placementId` (string) | Block entities, entities, biomes, ticks, unknown tags |
| `history` | `[projectId, commandId]` (compound) | `projectId` (string), `committedRevision` (number) | Command records with forward/inverse deltas |
| `recovery` | `id` (string) | `projectId` (string), `createdAt` (string), `expiresAt` (string) | Recovery snapshots |
| `assets` | `[version, assetHash]` (compound) | `version` (string) | Cached extracted vanilla assets |
| `settings` | `key` (string) | — | User preferences, approved directories, workspace layouts |
| `idempotency` | `requestId` (string) | `projectId` (string), `expiresAt` (number) | Idempotency cache entries |
| `commitRecords` | `transactionId` (string) | `projectId` (string), `phase` (string), `targetRevision` (number) | Crash-safe commit records |
| `autosaveJournal` | `journalId` (string) | `projectId` (string), `committedRevision` (number) | Autosave journal entries |

## Files

| File | Action | Content |
|------|--------|---------|
| `packages/persistence/src/idb-store.ts` | create | `openDB()` factory, store/index constants, `isIDBAvailable()` feature check |

## Types / APIs

```ts
const DB_NAME = 'schematic-editor-db';
const DB_VERSION = 1;

const STORE_PROJECTS = 'projects';
const STORE_CHUNKS = 'chunks';
const STORE_ANCILLARY = 'ancillary';
const STORE_HISTORY = 'history';
const STORE_RECOVERY = 'recovery';
const STORE_ASSETS = 'assets';
const STORE_SETTINGS = 'settings';
const STORE_IDEMPOTENCY = 'idempotency';
const STORE_COMMIT_RECORDS = 'commitRecords';
const STORE_AUTOSAVE_JOURNAL = 'autosaveJournal';

function isIDBAvailable(): boolean;
function openDB(): Promise<IDBDatabase>;
```

## Acceptance criteria

1. `openDB()` returns a Promise that resolves to an `IDBDatabase` with version 1
2. All 10 object stores created with correct key paths
3. All indexes created on the specified fields
4. `isIDBAvailable()` returns `true` in browser environments with IndexedDB support
5. `packages/persistence` has zero imports of framework, browser (beyond IndexedDB global), Node, Three.js, or MCP packages
6. `isIDBAvailable()` returns `false` gracefully when IndexedDB is not available (no throw)

## Tests

No test file yet — IndexedDB requires browser environment. Verification via typecheck and logic review. Test file `slice-c-0-idb-store.test.ts` to be created when browser test harness is available.

## Verification

- `pnpm --filter @easyschemedit/persistence exec tsc --noEmit` exit code 0
