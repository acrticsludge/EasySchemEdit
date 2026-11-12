# Subspec D — Slice d-13: Acceptance Criteria Verification

**Source:** `docs/specs/subs/SUBSPEC-D_EDITING_ENGINE.md` §9.2 (Acceptance criteria)
**Constraint:** Pure TypeScript, zero framework/browser/Node/Three.js/MCP imports. Tests run under tsx in Node.

## Goal

Implement acceptance tests for all subplan-d slices, verifying every acceptance criterion from SUBSPEC-D §9.2 (33 items).

## Files

| File | Action | Content |
|------|--------|---------|
| `packages/operations/__tests__/slice-d-13-acceptance.test.ts` | create | Acceptance test suite for all subplan-d slices |

## Acceptance Criteria to Test (all 33 from SUBSPEC-D §9.2)

| # | Criterion | Slice |
|---|-----------|-------|
| 1 | Placement management: select, multi-select, rename, show/hide, lock/unlock, duplicate, delete, reorder, move, rotate, mirror, edit origin | d-0 |
| 2 | Lock semantics: locked placements cannot be transformed/edited/deleted/duplicated/baked/origin-changed | d-0 |
| 3 | Selection: placement and cuboid kinds; half-open bounds; survives tool changes; deletion clears/repairs | d-1 |
| 4 | Region operation source/result modes visible and behave as specified | d-2 |
| 5 | Fill/replace/delete/copy/cut/paste/hollow/walls/move/bake/stack with bounds clipping | d-2, d-3, d-4 |
| 6 | Conflict categories: clean, same-state, state-conflict; no fourth status | d-5 |
| 7 | Overlap precedence: top-wins (default), bottom-wins only | d-5 |
| 8 | Bake: union bounds, effective block, state transform, origin choice, ancillary reconciliation, atomic commit | d-6 |
| 9 | Bake limits enforced; no silent block discard | d-6 |
| 10 | Conflict spatial index incremental (not full bounding box scan) | d-5 |
| 11 | Worker offload at 25,000 cells or 8ms | d-11 |
| 12 | Move region: source/destination snapshotted before mutation | d-4 |
| 13 | New result placement: air erase via overrideAir flag; default non-erasing | d-3 |
| 14 | Effective-composite copy default; source-placement copy via modifier | d-3 |
| 15 | Cut: lower overlapping placements become visible after cut | d-3 |
| 16 | Clipboard: shared lifecycle, serialization, anchor alignment, ghost preview | d-3 |
| 17 | BlockStateMatcher: property matching includes expected values | d-2 |
| 18 | WallsOperation: explicit wall block, top/bottom checkboxes, boundary semantics | d-2 |
| 19 | Ancillary data behavior per operation | d-2, d-3 |
| 20 | Replace: incompatible block entities removed with warning | d-2 |
| 21 | Operation budgets: candidate cells, runtime, memory | d-11 |
| 22 | Group transforms: pivot, rotation/mirror composition, ancillary data transformation | d-12 |
| 23 | Conflict index: deterministic storage, incremental invalidation, negative-coordinate indexing | d-5 |
| 24 | Bake merge: competing entities resolved by effective owner | d-6 |
| 25 | No ambiguous sparse-export promise; no automatic multi-region export | d-6 |
| 26 | Preview and commit use same immutable snapshot | d-2, d-3 |
| 27 | Paste refinements: paste at original position, skip air, preview-only, rotation/mirror at paste time | d-3 |
| 28 | Stack: repeats N times with offset; ignoreAir skips air; shiftSelection moves to last copy | d-4 |
| 29 | Selection operations: expand/contract/shift; select by type; magic/connected select | d-1 |
| 30 | Replace: preserveProperties keeps compatible properties when swapping block ID | d-2 |
| 31 | Verify: compare placed blocks against source; report missing/extra/wrong-state | d-9 |
| 32 | Material report: per-type block counts; exportable CSV; hovering row highlights blocks | d-9 |
| 33 | Hover: block highlight, info HUD, placement hover, same-type highlight; air not highlighted | d-10 |

## Tests

Create `packages/operations/__tests__/slice-d-13-acceptance.test.ts` with test cases for each criterion.

## Verification

- `npx tsx packages/operations/__tests__/slice-d-13-acceptance.test.ts` exit code 0
