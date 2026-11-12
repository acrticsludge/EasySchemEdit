# Subspec H — Slice h-5: IndexedDB Persistence Layer

**Source:** `docs/specs/subs/SUBSPEC-H_ARCH_PHASES_RELEASE.md` §4.3 (Deployment architecture), H12 (IndexedDB for project storage), §10 Release acceptance items 12, 13
**Constraint:** Browser-local IndexedDB, quota exhaustion visible error, no silent data loss.

## Goal

Create the IndexedDB persistence layer for project storage: save/reopen `.vxproj` archives, project.json, chunk binaries, autosave snapshots, recovery snapshots. Quota exhaustion handled with visible error (never silently drop previous save).

## Files to create/modify

| File | Action | Content |
|------|--------|---------|
| `packages/persistence/package.json` | create | No runtime deps, devDeps for TS |
| `packages/persistence/tsconfig.json` | create | TypeScript config |
| `packages/persistence/src/idb-store.ts` | create | IndexedDB store: open DB, object stores (projects, chunks, autosave, recovery) |
| `packages/persistence/src/project-store.ts` | create | Save/get/delete project archives, revision tracking |
| `packages/persistence/src/chunk-store.ts` | create | Save/get chunk binary blobs, chunk key indexing |
| `packages/persistence/src/autosave.ts` | create | Autosave snapshot, recovery on reload, quota exhaustion handling |
| `packages/persistence/src/index.ts` | create | Public API |

## Types / APIs

No domain imports (pure TS, browser IndexedDB only).

Key types:
- `ProjectArchive`: serialized project + binary chunks
- `QuotaExceededError`: visible error, previous save preserved

## Acceptance criteria

1. `pnpm exec tsc --noEmit` passes for `packages/persistence`
2. Save project → IndexedDB → reopen → exact semantic restoration
3. Chunk binary storage/retrieval by chunk key
4. Autosave + recovery snapshot on browser reload
5. Quota exhaustion: visible error, previous save never silently dropped
6. `packages/domain`, `packages/formats`, `packages/asset-pipeline` still compile clean

## Tests

No new test file. IndexedDB requires browser environment; verification via tsc and logic review.

## Verification

- `pnpm install` (workspace picks up `packages/persistence`)
- `cd packages/persistence && pnpm exec tsc --noEmit` exit code 0
- All 35 existing tests pass
