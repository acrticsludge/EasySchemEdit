# Phase 3 Audit Round 1 — Subplan-A (Domain Model)

**Source:** `docs/plans/subplan-a/index.md`, `docs/specs/subs/SUBSPEC-A_DOMAIN_MODEL.md`
**Method:** Fresh-context audit per GOAL.md §PHASE 3. Severity-ranked findings with evidence.

## Findings

### High

None — all acceptance criteria mapped to slices and test files, implementation verified by passing tests.

### Medium

**MA-1: Slice 14 duplicates acceptance criteria already covered by earlier slices**

- Evidence: subplan-a/index.md §Acceptance Criteria lists 17 items, but items 1-16 are already tested in slices 0-13 (e.g., item 1 in slice-0, item 2 in slice-0, item 3 in slice-2, etc.). Slice 14's "Full acceptance criteria" test file would redundantly re-test already-covered behavior.
- Impact: Test duplication, maintenance burden. Not a correctness bug.
- Fix: Slice 14 should focus on cross-cutting acceptance (items 14, 16, 17 — zero-size placements, deterministic archive bytes, worker revision check) that span multiple slices, not re-test single-slice behavior.

**MA-2: No explicit dependency-order statement**

- Evidence: subplan-a/index.md lists slices in dependency order but doesn't explicitly state "slice N must be implemented before slice N+1". The Method section says "Implement → Test → Verify → Commit → Next slice" implying order, but no explicit dependency declaration.
- Impact: Low risk since numbering implies order, but new contributors might not realize slice 4 (transform math) depends on slice 3 (chunk mapping) which depends on slice 2 (volume storage).
- Fix: Add a one-line dependency note to each slice (e.g., "Depends on: slice 3").

### Low

**MA-3: Acceptance item 5 says "per-chunk palette max 4096 entries" — incorrect**

- Evidence: subplan-a/index.md item 5 states "per-chunk palette max 4096 entries". SUBSPEC-A §A6 says palette thresholds are 1-256 Uint8Array, 257-65,536 Uint16Array, 65,537+ Uint32Array. The per-chunk palette limit is not 4096 — that's the index array length (CHUNK_SIZE³), not palette entries.
- Impact: Documentation error only; implementation (packages/domain/types.ts `paletteIndexTypeForSize`) correctly implements A6 thresholds.
- Fix: Change "per-chunk palette max 4096 entries" to "palette size follows A6 thresholds (1-256/257-65536/65537+)".

**MA-4: Slice 13 references "absolute caps" but acceptance item 16 (deterministic archive bytes) not tied to slice 13**

- Evidence: subplan-a/index.md item 16 "Deterministic archive bytes: same project twice = identical bytes" is listed but slice 13 (archive serialization) is the only slice covering serialization. No test file explicitly named for item 16.
- Impact: Acceptance item 16 lacks an explicit test file mapping.
- Fix: Add test file mapping for item 16 to slice 13's tests (slice-13-archive.test.ts should include determinism check).

## Traceability: SUBSPEC-A §13.2 Acceptance → Slice → Test File

| # | Acceptance Item | Slice | Test File | Status |
|---|-----------------|-------|-----------|--------|
| 1 | Vec3Half exact inverses | slice-0 | slice-0-types.test.ts | Mapped |
| 2 | CHUNK_SIZE = 16 | slice-0 | slice-0-types.test.ts | Mapped |
| 3 | Voxel index formula, length 4096 | slice-2 | slice-2-volume.test.ts | Mapped |
| 4 | Negative floor division | slice-3 | slice-3-chunk-mapping.test.ts | Mapped |
| 5 | Palette type thresholds, index 0 = air, all-air omitted | slice-2 | slice-2-volume.test.ts | Mapped |
| 6 | cave_air/void_air preserved, structure_void owning | slice-2 | slice-2-volume.test.ts | Mapped |
| 7 | BlockStateId value-based equality | slice-5 | slice-5-block-state.test.ts | Mapped |
| 8 | Transform integer translation, integer origin, mirror-before-rotation | slice-4, slice-7 | slice-4-transform.test.ts | Mapped |
| 9 | Seven round-trip invariants | slice-4 | slice-4-transform.test.ts | Mapped |
| 10 | Rotation/mirror table (facing, axis, stair, rail, hinge) | slice-6 | slice-6-block-state-transforms.test.ts | Mapped |
| 11 | Unknown modded blocks preserved | slice-6 | slice-6-block-state-transforms.test.ts | Mapped |
| 12 | NBT AST all tag kinds, bigint, compound order, mixed-type rejection | slice-1 | slice-1-nbt-ast.test.ts | Mapped |
| 13 | Palette unique, index < length, nonAirCount, tombstones, origin even | slice-8 | slice-8-invariants.test.ts | Mapped |
| 14 | Zero-size/empty placements | slice-8 | slice-8-invariants.test.ts | Mapped |
| 15 | Block-state string round-trip | slice-5.5 | slice-5.5-block-state-string.test.ts | Mapped |
| 16 | Deterministic archive bytes | slice-13 | slice-13-archive.test.ts | NOT EXPLICITLY MAPPED |
| 17 | Worker revision check | slice-12 | slice-12-worker-protocol.test.ts | Mapped |

## Verdict

Subplan-A is **Green** with Medium findings MA-1 and MA-2. All implementation verified by passing tests (21 test files, tsc clean). Acceptance item 16 needs explicit test mapping.

## Recommended Fixes

1. Fix MA-3: Correct palette max in acceptance item 5
2. Fix MA-4: Add explicit test mapping for acceptance item 16
3. Fix MA-1: Clarify slice 14 scope to cross-cutting criteria only
4. Fix MA-2: Add per-slice dependency declarations
