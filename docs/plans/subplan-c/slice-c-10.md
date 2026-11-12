# Subspec C — Slice c-10: Acceptance Tests

**Source:** `docs/specs/subs/SUBSPEC-C_PROJECT_PERSISTENCE.md` §5 (Acceptance criteria)
**Constraint:** Pure TypeScript, zero framework/browser/Node/Three.js/MCP imports. Tests run under tsx in Node.

## Goal

Implement acceptance tests for all subplan-c slices, verifying every acceptance criterion from SUBSPEC-C §5.

## Files

| File | Action | Content |
|------|--------|---------|
| `packages/persistence/__tests__/slice-c-10-acceptance.test.ts` | create | Acceptance test suite for all subplan-c slices |

## Acceptance Criteria to Test

| # | Criterion | Slice |
|---|-----------|-------|
| 1 | 10 IndexedDB object stores created with correct names | c-0 |
| 2 | Compound key `[placementId, chunkKey]` on chunks store | c-0 |
| 3 | Index on assets store by `[version, assetHash]` | c-0 |
| 4 | 5-phase commit protocol: pending→writing→verifying→committed→failed | c-1 |
| 5 | On success: phase='committed', tempKeys deleted | c-1 |
| 6 | On failure: phase='failed', tempKeys retained, revision unchanged | c-1 |
| 7 | saveProject stores archive with projectId as key | c-2 |
| 8 | getProject retrieves project by projectId | c-2 |
| 9 | deleteProject removes project and all associated data | c-2 |
| 10 | listProjects returns all project IDs | c-2 |
| 11 | Revision check: baseRevision must match current revision | c-2 |
| 12 | Autosave debounces 1500ms after last command | c-3 |
| 13 | Autosave triggers after every 10 committed commands | c-3 |
| 14 | Max interval 10s between saves | c-3 |
| 15 | saveInProgress prevents concurrent saves | c-3 |
| 16 | newerEditArrived triggers immediate save after current save | c-3 |
| 17 | History record() pushes to undo, clears redo | c-4 |
| 18 | History undo()/redo() with stack transfer | c-4 |
| 19 | Migration chains multiple steps (v1→v2→v3) | c-5 |
| 20 | Recovery scanUncommitted returns non-committed entries | c-6 |
| 21 | Storage budget checkBudget blocks writes exceeding threshold | c-7 |
| 22 | Idempotency check() returns cached result on hit | c-9 |
| 23 | Idempotency set() stores result with key | c-9 |

## Tests

Create `packages/persistence/__tests__/slice-c-10-acceptance.test.ts` with test cases for each criterion using tsx-compatible test runner.

## Verification

- `npx tsx packages/persistence/__tests__/slice-c-10-acceptance.test.ts` exit code 0
