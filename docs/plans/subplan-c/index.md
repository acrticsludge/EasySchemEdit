# Subspec C — Project & Persistence: Slice Plan

**Source:** `docs/specs/subs/SUBSPEC-C_PROJECT_PERSISTENCE.md` (locked decisions C1–C8)
**Constraint:** Pure TypeScript, zero framework/browser/Node/Three.js/MCP imports in `packages/persistence`. IndexedDB is a browser global accessed via feature detection.

## Method

Build in thin vertical slices per the incremental-implementation skill:
- Implement → Test → Verify → Commit → Next slice
- Each slice changes one logical thing
- Project must build and existing tests pass after each increment

## Slices (one consistent list)

| Slice | Focus | Deliverable | Tests |
|-------|-------|-------------|-------|
| `slice-c-0.md` | IndexedDB schema: 10 object stores, compound keys, indexes | `packages/persistence/src/idb-store.ts` | Store creation, key paths, indexes |
| `slice-c-1.md` | Crash-safe commit protocol | `packages/persistence/src/commit-protocol.ts` | CommitRecord phases, temp keys, checksum verification, atomic commit |
| `slice-c-2.md` | Project lifecycle: create/open/duplicate/rename/delete | `packages/persistence/src/project-store.ts` | CRUD operations, revision tracking |
| `slice-c-3.md` | Autosave with race resolution | `packages/persistence/src/autosave.ts` | Debounce, command threshold, saveInProgress flag, newerEditArrived |
| `slice-c-4.md` | History: undo/redo, delta records, pruning | `packages/persistence/src/history.ts` | Undo/redo, 200 entries / 256 MiB pruning, cursor management |
| `slice-c-5.md` | Migration system: type-safe, deterministic | `packages/persistence/src/migration.ts` | Pure transform, input/output validation, rollback |
| `slice-c-6.md` | Recovery snapshots: 3 versions, 7-day retention | `packages/persistence/src/recovery.ts` | Snapshot creation, restoration, expiration cleanup |
| `slice-c-7.md` | Storage budget: quota estimation, warning/reject thresholds | `packages/persistence/src/storage-budget.ts` | 512 MiB/70% warning, 1.5 GiB/85% hard reject, headroom |
| `slice-c-8.md` | .vxproj archive: ZIP64, DEFLATE level 6, manifest.checksums | `packages/formats/src/vxproj.ts` | Archive round-trip, checksum verification, path traversal rejection |
| `slice-c-9.md` | Idempotency records: same DB, atomic commit | `packages/persistence/src/idempotency.ts` | requestId caching, args mismatch, 15-minute expiry |
| `slice-c-10.md` | Acceptance criteria verification | `packages/persistence/__tests__/` | All 20 SUBSPEC-C acceptance items |

## Acceptance Criteria (from SUBSPEC-C §8.2, revised)

| # | Acceptance Item | Slice | Test File |
|---|-----------------|-------|-----------|
| 1 | Browser autosave uses IndexedDB object stores for project metadata, chunk binaries, ancillary NBT, history | c-0, c-2 | slice-c-2-project-store.test.ts |
| 2 | No localStorage for schematic data | c-0 | slice-c-0-idb-store.test.ts |
| 3 | Autosave debounce 1500ms, command threshold 10, max interval 10s | c-3 | slice-c-3-autosave.test.ts |
| 4 | Autosave flushes on visibility change and beforeunload (warning only) | c-3 | slice-c-3-autosave.test.ts |
| 5 | Dirty/saving/saved/error state visible | c-3 | slice-c-3-autosave.test.ts |
| 6 | Storage quota failure visible; never silently drops previous save | c-7 | slice-c-7-storage-budget.test.ts |
| 7 | .vxproj archive ZIP64 DEFLATE level 6; manifest, project.json, placements, chunks, assets, checksums | c-8 | slice-c-8-vxproj.test.ts |
| 8 | Project archive: schemaVersion, app version, asset profile, source metadata, checksums | c-8 | slice-c-8-vxproj.test.ts |
| 9 | Migrations deterministic, type-safe, tested; recovery snapshot before migration; rollback on failure | c-5, c-6 | slice-c-5-migration.test.ts, slice-c-6-recovery.test.ts |
| 10 | Recovery: last 3 versions, 7-day retention, open without overwriting, export as .vxproj | c-6 | slice-c-6-recovery.test.ts |
| 11 | History bounded by 200 entries or 256 MiB; pruning warns before evicting large-edit recovery | c-4 | slice-c-4-history.test.ts |
| 12 | Command concurrency: baseRevision check; stale results rejected | c-1 | slice-c-1-commit-protocol.test.ts |
| 13 | Undo restores placements, chunks, ancillary, origins, z-order, overlap policy, selection | c-4 | slice-c-4-history.test.ts |
| 14 | No partial commit; cancellation before commit leaves document unchanged | c-1 | slice-c-1-commit-protocol.test.ts |
| 15 | Revisions monotonically increasing; undo/redo create new revision; cursor separate | c-2, c-4 | slice-c-2-project-store.test.ts, slice-c-4-history.test.ts |
| 16 | Chunk reference counting on duplication (copy-on-write) and deletion | c-2 | slice-c-2-project-store.test.ts |
| 17 | Persistent storage request with denial handling; quota headroom maintained | c-7 | slice-c-7-storage-budget.test.ts |
| 18 | No automatic cloud sync; .vxproj is cross-device transfer | c-8 | slice-c-8-vxproj.test.ts |
| 19 | Crash-safe commit protocol: temp writes, checksum verification, atomic committed-revision | c-1 | slice-c-1-commit-protocol.test.ts |
| 20 | IndexedDB schema: 10 object stores, compound keys, indexes, chunk ref counting | c-0 | slice-c-0-idb-store.test.ts |

## Research gate → docs/research/subplan-c.md

Research questions C-1 through C-6 documented there.

## Traceability

All 20 SUBSPEC-C §8.2 acceptance items mapped to slices and test files above. Unmapped criteria = plan bug.

## Verification checklist

- [ ] One consistent slice list (11 slices, no duplicates)
- [ ] Traceability table maps all 20 SUBSPEC-C §8.2 items
- [ ] No claims of verification without running tests
- [ ] Change committed with descriptive message
