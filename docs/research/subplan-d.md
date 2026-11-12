# Research Gate: Subplan-D (Editing Engine)

**Source:** `docs/specs/subs/SUBSPEC-D_EDITING_ENGINE.md` (locked decisions D1–D16)
**Goal:** Region operations, conflict detection, bake, clipboard, import-and-place, snap & align, verify/material report, hover operations, operation budgets.

## Research questions

| # | Question | Primary source | Status |
|---|----------|----------------|--------|
| D-1 | Worker offload threshold: 25,000 cells or 8ms estimated — how to estimate cell count before parsing | SUBSPEC-D D4 | Pending |
| D-2 | Clipboard serialization: SUBSPEC-A binary chunk codec for blocks, SUBSPEC-B NBT codec for ancillary | SUBSPEC-D §2.7 | Pending |
| D-3 | Conflict spatial index: incremental invalidation, not full bounding box scan | SUBSPEC-D §4.7 | Pending |
| D-4 | Bake merge rules: competing block entities, entities, biomes, pending ticks | SUBSPEC-D D16 | Pending |
| D-5 | eraseTombstones: canonical placement data, preserved through save/reopen/export | SUBSPEC-A §2.4, SUBSPEC-D D9 | Pending |
| D-6 | Operation budgets: candidate cells, runtime, memory in addition to changed cells | SUBSPEC-D D13 | Pending |

## Decisions (to fill after research)

| # | Decision | Evidence | Rejected options |
|---|----------|----------|------------------|
| D-1 | Worker offload at 25,000 cells or 8ms estimated | SUBSPEC-D D4 | All ops on main thread (rejected: performance) |
| D-2 | Clipboard session-scoped, not persisted to IndexedDB | SUBSPEC-D §2.7 | IndexedDB persistence (rejected: session scope) |
| D-3 | Conflict categories: clean, same-state, state-conflict (no fourth status) | SUBSPEC-D §5.5 | Four-color scheme (rejected: D15 orange removed in v0.12) |
| D-4 | Overlap precedence: top-wins (default), bottom-wins only | SUBSPEC-A §9.3 | Newest-wins/oldest-wins (rejected: removed in v0.12) |
| D-5 | Bake limits: maxAabbCells 16,777,216; maxAxis 4096; maxNonAirBlocks 10,000,000 | SUBSPEC-D D6 | No limits (rejected: memory protection) |
| D-6 | eraseTombstones: recorded when overrideAir=true, preserved through save/reopen/export | SUBSPEC-D §4.3 | Air always erasing (rejected: default non-erasing) |

## Open questions → DOUBTS.md

None yet.
