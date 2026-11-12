# Subspec D — Editing Engine: Slice Plan

**Source:** `docs/specs/subs/SUBSPEC-D_EDITING_ENGINE.md` (locked decisions D1–D16)
**Constraint:** Zero framework/browser/Node/Three.js/MCP imports in `packages/operations`. Pure TypeScript only; domain/commands imported from `@easyschemedit/domain`.

## Method

Build in thin vertical slices per the incremental-implementation skill:
- Implement → Test → Verify → Commit → Next slice
- Each slice changes one logical thing
- Project must build and existing tests pass after each increment

## Slices (one consistent list)

| Slice | Focus | Deliverable | Tests |
|-------|-------|-------------|-------|
| `slice-d-0.md` | Placement management types + CRUD | `packages/operations/src/placement.ts` | Select, multi-select, lock, visibility, duplicate, delete, reorder |
| `slice-d-1.md` | Selection types: placement + cuboid, bounds, anchor | `packages/operations/src/selection.ts` | Half-open bounds, survives tool changes, deletion repair |
| `slice-d-2.md` | Region operations core: fill, replace, delete, hollow, walls | `packages/operations/src/region-ops.ts` | Bounds clipping (source mode), full cuboid (result mode) |
| `slice-d-3.md` | Clipboard operations: copy, cut, paste, paste refinements | `packages/operations/src/clipboard.ts` | Serialization round-trip, anchor alignment, overrideAir |
| `slice-d-4.md` | Move region + stack operations | `packages/operations/src/move-stack.ts` | Source/destination snapshot, single undo transaction |
| `slice-d-5.md` | Conflict detection: spatial index, owner resolution, 3 categories | `packages/operations/src/conflict-index.ts` | Incremental invalidation, negative-coordinate indexing |
| `slice-d-6.md` | Bake operation: union bounds, effective block, merge rules | `packages/operations/src/bake.ts` | Bake limits enforced, undo restores all, ancillary merge |
| `slice-d-7.md` | Import-and-place flow: drag-drop, ghost preview, ground snap | `packages/operations/src/import-place.ts` | Pending placement, ghost preview, snap to ground |
| `slice-d-8.md` | Snap & align tools: snap to origin, align edges, snap to placement | `packages/operations/src/snap-align.ts` | Grid alignment, integer coordinates, single undo transaction |
| `slice-d-9.md` | Verify and material report | `packages/operations/src/verify-material.ts` | Missing/extra/wrong-state blocks, CSV export, hover highlight |
| `slice-d-10.md` | Hover operations: block highlight, info HUD, placement hover, same-type | `packages/operations/src/hover.ts` | Transform-resolved hover, air not highlighted, session state |
| `slice-d-11.md` | Operation budgets + worker offload | `packages/operations/src/operation-budgets.ts` | Candidate cells, runtime, memory, 25k cells/8ms threshold |
| `slice-d-12.md` | Group transforms: pivot, rotation/mirror composition | `packages/operations/src/group-transforms.ts` | Group pivot, compose rotation/mirror, ancillary transforms |
| `slice-d-13.md` | Acceptance criteria verification | `packages/operations/__tests__/` | All 33 SUBSPEC-D acceptance items |

## Acceptance Criteria (from SUBSPEC-D §9.2, revised)

| # | Acceptance Item | Slice | Test File |
|---|-----------------|-------|-----------|
| 1 | Placement management: select, multi-select, rename, show/hide, lock/unlock, duplicate, delete, reorder, move, rotate, mirror, edit origin, focus, export | d-0 | slice-d-0-placement.test.ts |
| 2 | Lock semantics: locked placements cannot be transformed/edited/deleted/duplicated/baked/origin-changed; read/export allowed; hide/show allowed | d-0 | slice-d-0-placement.test.ts |
| 3 | Selection: placement and cuboid kinds; half-open bounds; survives tool changes; deletion clears/repairs | d-1 | slice-d-1-selection.test.ts |
| 4 | Region operation source/result modes visible and behave exactly as specified | d-2 | slice-d-2-region-ops.test.ts |
| 5 | Fill/replace/delete/copy/cut/paste/hollow/walls/move/bake/stack with bounds clipping | d-2, d-3, d-4 | slice-d-2-region-ops.test.ts, slice-d-3-clipboard.test.ts, slice-d-4-move-stack.test.ts |
| 6 | Conflict categories: clean, same-state, state-conflict; no fourth status | d-5 | slice-d-5-conflict-index.test.ts |
| 7 | Overlap precedence: top-wins (default), bottom-wins only | d-5 | slice-d-5-conflict-index.test.ts |
| 8 | Bake: union bounds, effective block, state transform, origin choice, ancillary reconciliation, atomic commit, undo restores all | d-6 | slice-d-6-bake.test.ts |
| 9 | Bake limits enforced; no silent block discard | d-6 | slice-d-6-bake.test.ts |
| 10 | Conflict spatial index incremental (not full bounding box scan) | d-5 | slice-d-5-conflict-index.test.ts |
| 11 | Worker offload at 25,000 cells or 8ms | d-11 | slice-d-11-budgets.test.ts |
| 12 | Move region: source/destination snapshotted before mutation | d-4 | slice-d-4-move-stack.test.ts |
| 13 | New result placement: air erase via overrideAir flag; default non-erasing | d-3 | slice-d-3-clipboard.test.ts |
| 14 | Effective-composite copy default; source-placement copy via modifier | d-3 | slice-d-3-clipboard.test.ts |
| 15 | Cut: lower overlapping placements become visible after cut; hidden excluded by default | d-3 | slice-d-3-clipboard.test.ts |
| 16 | Clipboard: shared lifecycle, serialization for browser/MCP, anchor alignment, ghost preview | d-3 | slice-d-3-clipboard.test.ts |
| 17 | BlockStateMatcher: property matching includes expected values | d-2 | slice-d-2-region-ops.test.ts |
| 18 | WallsOperation: explicit wall block, top/bottom checkboxes, boundary semantics | d-2 | slice-d-2-region-ops.test.ts |
| 19 | Ancillary data: block entity/entity/biome/tick/unknown-data behavior per operation | d-2, d-3 | slice-d-2-region-ops.test.ts, slice-d-3-clipboard.test.ts |
| 20 | Replace: incompatible block entities removed with warning | d-2 | slice-d-2-region-ops.test.ts |
| 21 | Operation budgets: candidate cells, runtime, memory in addition to changed cells | d-11 | slice-d-11-budgets.test.ts |
| 22 | Group transforms: pivot, rotation/mirror composition, ancillary data transformation | d-12 | slice-d-12-group-transforms.test.ts |
| 23 | Conflict index: deterministic storage, incremental invalidation, negative-coordinate indexing | d-5 | slice-d-5-conflict-index.test.ts |
| 24 | Bake merge: competing block entities/entities/biomes/ticks resolved by effective owner | d-6 | slice-d-6-bake.test.ts |
| 25 | No ambiguous sparse-export promise; no automatic multi-region export | d-6 | slice-d-6-bake.test.ts |
| 26 | Preview and commit use same immutable snapshot; identical results | d-2, d-3 | slice-d-2-region-ops.test.ts |
| 27 | Paste refinements: paste at original position, skip air, preview-only, rotation/mirror at paste time | d-3 | slice-d-3-clipboard.test.ts |
| 28 | Stack: repeats N times with offset; ignoreAir skips air; shiftSelection moves to last copy; single undo transaction | d-4 | slice-d-4-move-stack.test.ts |
| 29 | Selection operations: expand/contract/shift selection bounds; select by type; magic/connected select | d-1 | slice-d-1-selection.test.ts |
| 30 | Replace: preserveProperties keeps compatible properties when swapping block ID | d-2 | slice-d-2-region-ops.test.ts |
| 31 | Verify: compare placed blocks against source; report missing/extra/wrong-state per-placement/per-region | d-9 | slice-d-9-verify-material.test.ts |
| 32 | Material report: per-type block counts; exportable CSV; hovering row highlights blocks | d-9 | slice-d-9-verify-material.test.ts |
| 33 | Hover: block highlight, info HUD, placement hover, same-type highlight; air not highlighted; session state only | d-10 | slice-d-10-hover.test.ts |

## Research gate → docs/research/subplan-d.md

Research questions D-1 through D-6 documented there.

## Traceability

All 33 SUBSPEC-D §9.2 acceptance items mapped to slices and test files above. Unmapped criteria = plan bug.

## Verification checklist

- [ ] One consistent slice list (14 slices, no duplicates)
- [ ] Traceability table maps all 33 SUBSPEC-D §9.2 items
- [ ] No claims of verification without running tests
- [ ] Change committed with descriptive message
