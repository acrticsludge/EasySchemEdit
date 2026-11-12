# Phase 3 Audit Round 1 — Subplan-D (Editing Engine)

**Source:** `docs/plans/subplan-d/index.md`, `docs/specs/subs/SUBSPEC-D_EDITING_ENGINE.md`
**Method:** Fresh-context audit per GOAL.md §PHASE 3. Severity-ranked findings with evidence.

## Findings

### High

**MD-1: No test files exist for any subplan-d slice**

- Evidence: The traceability table maps all 33 acceptance items to test files (slice-d-0 through slice-d-13 tests), but `packages/operations/__tests__/` does not exist. No test files have been created.
- Impact: Zero test coverage for the entire editing engine. All 33 SUBSPEC-D acceptance criteria are unverified.
- Fix: Create test files for slices d-0 through d-13, or mark as "to verify" per GOAL.md rules.

### Medium

**MD-2: Slice count mismatch — plan says 13 slices but lists 14**

- Evidence: subplan-d/index.md verification checklist says "One consistent slice list (13 slices, no duplicates)" but the slice table lists d-0 through d-13, which is 14 slices (d-0, d-1, d-2, d-3, d-4, d-5, d-6, d-7, d-8, d-9, d-10, d-11, d-12, d-13).
- Impact: Inconsistent slice count could cause confusion about plan completeness.
- Fix: Update verification checklist to say "14 slices".

**MD-3: Acceptance item 4 says "Region operation source/result modes visible" — "visible" implies UI, but subplan-d is engine-only**

- Evidence: subplan-d/index.md row 4 maps acceptance item 4 ("Region operation source/result modes visible and behave exactly as specified") to slice d-2. However, "visible" is a UI concern that belongs to SUBSPEC-G (UI & Interaction), not subplan-d (Editing Engine, pure TypeScript, zero UI imports).
- Impact: Cross-subspec boundary ambiguity — the plan places UI-responsible acceptance criteria in an engine-only slice.
- Fix: Re-map acceptance item 4 to subplan-g, or clarify that subplan-d handles the data model while subplan-g handles the UI visibility.

**MD-4: Slice d-7 (Import-and-place flow) overlaps with subplan-g**

- Evidence: subplan-d/index.md slice d-7 covers "Import-and-place flow: drag-drop, ghost preview, ground preview at cursor". SUBSPEC-G §6.6.4 also covers "Import & Place flow" including drag-drop import, ghost preview, ground snap, confirm/cancel. The two subplans overlap on the same feature.
- Impact: Unclear which subplan owns import-and-place implementation; risk of duplicate or conflicting implementation.
- Fix: Clarify ownership — subplan-d handles the data model (pending placement state, import report), subplan-g handles the UI (drag-drop UI, ghost preview rendering, ground snap visualization).

**MD-5: Slice d-10 (Hover operations) overlaps with subplan-e (hover rendering)**

- Evidence: subplan-d/index.md slice d-10 covers "Hover operations: block highlight, info HUD, placement hover, same-type". SUBSPEC-E §3.7 covers "Hover rendering (overlay layer)" including hover block highlight, hover info HUD data, same-type highlight. Overlap on hover functionality.
- Impact: Unclear which subplan owns hover implementation; risk of duplicate implementation.
- Fix: Clarify ownership — subplan-d handles hover data resolution (block state, properties, coordinates via conflict spatial index), subplan-e handles hover rendering (wireframe outline, info HUD display, same-type highlight line buffer).

### Low

**MD-6: No test files exist — verification checklist item "No claims of verification without running tests" cannot be satisfied**

- Evidence: subplan-d/index.md verification checklist says "No claims of verification without running tests" but no tests exist.
- Impact: The plan's own verification requirement is unmet.
- Fix: Create test files or mark all as "to verify".

## Traceability: SUBSPEC-D §9.2 Acceptance → Slice → Test File (with gaps flagged)

| # | Acceptance Item | Slice | Test File | Status |
|---|-----------------|-------|-----------|--------|
| 1 | Placement management | d-0 | slice-d-0-placement.test.ts | NOT CREATED (MD-1) |
| 2 | Lock semantics | d-0 | slice-d-0-placement.test.ts | NOT CREATED (MD-1) |
| 3 | Selection types | d-1 | slice-d-1-selection.test.ts | NOT CREATED (MD-1) |
| 4 | Region operation source/result modes "visible" | d-2 | slice-d-2-region-ops.test.ts | NOT CREATED (MD-1, MD-3) |
| 5 | Fill/replace/delete/copy/cut/paste/hollow/walls/move/bake/stack | d-2, d-3, d-4 | slice-d-2-region-ops.test.ts, slice-d-3-clipboard.test.ts, slice-d-4-move-stack.test.ts | NOT CREATED (MD-1) |
| 6 | Conflict categories: clean, same-state, state-conflict | d-5 | slice-d-5-conflict-index.test.ts | NOT CREATED (MD-1) |
| 7 | Overlap precedence: top-wins, bottom-wins | d-5 | slice-d-5-conflict-index.test.ts | NOT CREATED (MD-1) |
| 8 | Bake: union bounds, effective block, state transform | d-6 | slice-d-6-bake.test.ts | NOT CREATED (MD-1) |
| 9 | Bake limits enforced | d-6 | slice-d-6-bake.test.ts | NOT CREATED (MD-1) |
| 10 | Conflict spatial index incremental | d-5 | slice-d-5-conflict-index.test.ts | NOT CREATED (MD-1) |
| 11 | Worker offload at 25,000 cells or 8ms | d-11 | slice-d-11-budgets.test.ts | NOT CREATED (MD-1) |
| 12 | Move region snapshot before mutation | d-4 | slice-d-4-move-stack.test.ts | NOT CREATED (MD-1) |
| 13 | New result placement: overrideAir flag | d-3 | slice-d-3-clipboard.test.ts | NOT CREATED (MD-1) |
| 14 | Effective-composite copy default | d-3 | slice-d-3-clipboard.test.ts | NOT CREATED (MD-1) |
| 15 | Cut: lower placements become visible | d-3 | slice-d-3-clipboard.test.ts | NOT CREATED (MD-1) |
| 16 | Clipboard: serialization, anchor alignment | d-3 | slice-d-3-clipboard.test.ts | NOT CREATED (MD-1) |
| 17 | BlockStateMatcher: property matching | d-2 | slice-d-2-region-ops.test.ts | NOT CREATED (MD-1) |
| 18 | WallsOperation: explicit wall block | d-2 | slice-d-2-region-ops.test.ts | NOT CREATED (MD-1) |
| 19 | Ancillary data per operation | d-2, d-3 | slice-d-2-region-ops.test.ts, slice-d-3-clipboard.test.ts | NOT CREATED (MD-1) |
| 20 | Replace: incompatible block entities | d-2 | slice-d-2-region-ops.test.ts | NOT CREATED (MD-1) |
| 21 | Operation budgets: candidate cells, runtime, memory | d-11 | slice-d-11-budgets.test.ts | NOT CREATED (MD-1) |
| 22 | Group transforms: pivot, rotation/mirror | d-12 | slice-d-12-group-transforms.test.ts | NOT CREATED (MD-1) |
| 23 | Conflict index: deterministic storage, incremental | d-5 | slice-d-5-conflict-index.test.ts | NOT CREATED (MD-1) |
| 24 | Bake merge: competing entities/biomes/ticks | d-6 | slice-d-6-bake.test.ts | NOT CREATED (MD-1) |
| 25 | No ambiguous sparse-export promise | d-6 | slice-d-6-bake.test.ts | NOT CREATED (MD-1) |
| 26 | Preview and commit use same immutable snapshot | d-2, d-3 | slice-d-2-region-ops.test.ts, slice-d-3-clipboard.test.ts | NOT CREATED (MD-1) |
| 27 | Paste refinements: original position, skip air | d-3 | slice-d-3-clipboard.test.ts | NOT CREATED (MD-1) |
| 28 | Stack: N times with offset, ignoreAir | d-4 | slice-d-4-move-stack.test.ts | NOT CREATED (MD-1) |
| 29 | Selection operations: expand/contract/shift/select by type | d-1 | slice-d-1-selection.test.ts | NOT CREATED (MD-1) |
| 30 | Replace: preserveProperties | d-2 | slice-d-2-region-ops.test.ts | NOT CREATED (MD-1) |
| 31 | Verify: missing/extra/wrong-state blocks | d-9 | slice-d-9-verify-material.test.ts | NOT CREATED (MD-1) |
| 32 | Material report: per-type counts, CSV export | d-9 | slice-d-9-verify-material.test.ts | NOT CREATED (MD-1) |
| 33 | Hover: block highlight, info HUD | d-10 | slice-d-10-hover.test.ts | NOT CREATED (MD-1, MD-5) |

## Verdict

Subplan-D is **Red** — no test files exist for any slice, and there are cross-subspec boundary ambiguities (MD-3, MD-4, MD-5) plus a slice count mismatch (MD-2).

## Recommended Fixes

1. Fix MD-1: Create test files for all d-slices, or mark as "to verify" pending test harness
2. Fix MD-2: Update verification checklist to "14 slices"
3. Fix MD-3: Re-map acceptance item 4 to subplan-g (UI visibility) or clarify data-model vs UI split
4. Fix MD-4: Clarify import-and-place ownership — d-7 (data model) vs subplan-g (UI)
5. Fix MD-5: Clarify hover ownership — d-10 (data resolution) vs subplan-e (rendering)
