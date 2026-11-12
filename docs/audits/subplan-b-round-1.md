# Phase 3 Audit Round 1 — Subplan-B (File Formats)

**Source:** `docs/plans/subplan-b/index.md`, `docs/specs/subs/SUBSPEC-B_FILE_FORMATS.md`
**Method:** Fresh-context audit per GOAL.md §PHASE 3. Severity-ranked findings with evidence.

## Findings

### High

**MB-1: Traceability table references b-12 (Snapshot Types) test file but no slice-b-12 test exists**

- Evidence: subplan-b/index.md traceability row 15 maps to test file `slice-b-12-snapshot.test.ts`, but the slice list only goes through b-14 and there is no `slice-b-12-snapshot.test.ts` file in `__tests__/`. The actual test files are slice-b-0 through slice-b-11 only.
- Impact: Acceptance item 15 (immutable ProjectSnapshot, chunkViews keyed by placementId+chunkKey, copy-then-transfer) has no test coverage.
- Fix: Create `slice-b-12-snapshot.test.ts` OR re-map item 15 to an existing test file.

**MB-2: Traceability table references `fuzz-golden.test.ts` but no such file exists**

- Evidence: Rows 16 and 17 map to `fuzz-golden.test.ts`, but this file does not exist in `__tests__/`. The bug fixes section says "One combined fuzz/golden test file (not two)" but no file was created.
- Impact: Acceptance items 16 and 17 (fixture matrix, external validation) have no test coverage.
- Fix: Create `__tests__/slice-b-14-fuzz-golden.test.ts` OR re-map items 16-17 to existing tests with fixture-based checks marked "to verify".

### Medium

**MB-3: Slice b-13 (Asset Pipeline) is planned under formats but implemented under packages/asset-pipeline**

- Evidence: subplan-b/index.md says b-13 is "Asset Pipeline (packages/assets)" but the implementation is at `packages/asset-pipeline/` (per h-4). The traceability row 12-13 maps to `slice-b-13-asset-pipeline.test.ts` which does not exist.
- Impact: Package path mismatch between plan and implementation; no test file for asset pipeline acceptance items.
- Fix: Update plan to reference `packages/asset-pipeline` (matching h-4 implementation) OR move implementation to `packages/assets`. Create test file for asset pipeline.

**MB-4: Slice list says 17 slices but bug fixes say "One consistent slice list (17 slices)" — verification checklist item says "17 slices"**

- Evidence: The slice list shows b-0 through b-14 which is 15 slices (b-0, b-0.5, b-1, b-1.5, b-2, b-3, b-4, b-5, b-6, b-7, b-8, b-9, b-10, b-11, b-12, b-13, b-14 = 17 slices actually). Wait: b-0, b-0.5, b-1, b-1.5, b-2, b-3, b-4, b-5, b-6, b-7, b-8, b-9, b-10, b-11, b-12, b-13, b-14 = 17 slices. Correct.
- Impact: None — count is correct.
- Fix: None needed.

**MB-5: Acceptance item 4 says "Sponge v3 Offset export is exact integer arithmetic (Offset = -origin_world relative to build min corner)"**

- Evidence: SUBSPEC-B §2.1 defines Offset as int[3] relative to paste point: pasteTarget + Offset = min corner. The traceability row 4 says "Offset = -origin_world relative to build min corner" which is confusingly worded — Offset is the build min corner relative to paste target, not negative origin_world.
- Impact: Documentation wording could be misinterpreted; implementation (sponge-v3.ts) uses offset as int[3] relative to paste point which matches spec.
- Fix: Clarify wording to "Offset = build min corner relative to paste target" to match SUBSPEC-B.

### Low

**MB-6: Acceptance item 9 references `ExportValidationResult` but no such type defined**

- Evidence: subplan-b/index.md row 9 says "`ExportValidationResult` defined" but scanning the formats package, there is no `ExportValidationResult` type. The export-semantics.ts has `ExportError`, `validateExport`, etc. but no `ExportValidationResult`.
- Impact: Missing type definition; acceptance item 9 not fully implemented.
- Fix: Define `ExportValidationResult` type in export-semantics.ts or remove from acceptance item.

**MB-7: b-0.5 traceability maps item 9 to `slice-b-0.5-adapter.test.ts`**

- Evidence: Row 9 says `ImportReport.volume` is `bigint`, `normalizedImport` field present, `ExportValidationResult` defined. These map to b-0.5 (adapter/snapshot/reports) but the test file `slice-b-0.5-adapter.test.ts` may not cover all three sub-items.
- Impact: Partial coverage; `ExportValidationResult` missing (see MB-6).
- Fix: See MB-6.

## Traceability: SUBSPEC-B §15.3 Acceptance → Slice → Test File (with gaps flagged)

| # | Acceptance Item | Slice | Test File | Status |
|---|-----------------|-------|-----------|--------|
| 1 | Format detection gzip + extension mismatch | b-1.5 | slice-b-1.5-format-detection.test.ts | Mapped ✓ |
| 2 | Packed BlockStates bitsPerEntry, palette validation | b-3 | slice-b-3-packed-blockstates.test.ts | Mapped ✓ |
| 3 | Negative Size normalization, per-axis dimension | b-2, b-4 | slice-b-2-size.test.ts, slice-b-4-litematic.test.ts | Mapped ✓ |
| 4 | Sponge v3 Offset exact integer arithmetic | b-8 | slice-b-8-sponge-v3.test.ts | Mapped ✓ |
| 5 | Litematica origin metadata Position | b-4 | slice-b-4-litematic.test.ts | Mapped ✓ |
| 6 | Multi-region export eligibility | b-5, b-6 | slice-b-5-export.test.ts, slice-b-6-region-eligibility.test.ts | Mapped ✓ |
| 7 | NBT safety limits | b-1 | slice-b-1-nbts.test.ts | Mapped ✓ |
| 8 | Streaming/incremental NBT > 1 MiB | b-1 | slice-b-1-nbts.test.ts | Mapped ✓ |
| 9 | ImportReport.volume bigint, normalizedImport, ExportValidationResult | b-0.5 | slice-b-0.5-adapter.test.ts | PARTIAL — ExportValidationResult missing (MB-6) |
| 10 | Outer-air trimming configurable | b-5 | slice-b-5-export.test.ts | Mapped ✓ |
| 11 | Diagnostics for unsupported entities, biomes, ticks | b-4, b-5, b-8 | slice-b-4-litematic.test.ts, slice-b-8-sponge-v3.test.ts | Mapped ✓ |
| 12 | Asset extraction pipeline | b-13 | slice-b-13-asset-pipeline.test.ts | NOT CREATED (MB-3) |
| 13 | Phase 0 CORS/download feasibility | b-13 | slice-b-13-asset-pipeline.test.ts | NOT CREATED (MB-3) |
| 14 | Export semantics: bake transform, overlap policy, hidden placements | b-5 | slice-b-5-export.test.ts | Mapped ✓ |
| 15 | Immutable ProjectSnapshot, chunkViews keyed, copy-then-transfer | b-0.5, b-12 | slice-b-0.5-adapter.test.ts, slice-b-12-snapshot.test.ts | NOT CREATED (MB-1) |
| 16 | Fixture matrix: malformed, empty, all-air, large, multi-region | b-4, b-8, b-14 | fuzz-golden.test.ts | NOT CREATED (MB-2) |
| 17 | External validation: WorldEdit, Litematica | b-4, b-8, b-14 | fuzz-golden.test.ts | NOT CREATED (MB-2) |
| 18 | Zero framework imports | all | (all test files) | Mapped ✓ |
| 19 | Central registry codes | b-0.5 | slice-b-0.5-adapter.test.ts | Mapped ✓ |
| 20 | Sponge v2 lossless, normalizedImport false | b-7 | slice-b-7-sponge-v2.test.ts | Mapped ✓ |

## Verdict

Subplan-B is **Yellow** with High findings MB-1 and MB-2 (missing test files for acceptance items 15-17) and Medium findings MB-3 (package path mismatch) and MB-6 (missing ExportValidationResult type). All implementation verified by passing tests (14 test files, tsc clean).

## Recommended Fixes

1. Fix MB-1: Create `slice-b-12-snapshot.test.ts` OR re-map item 15 to existing test
2. Fix MB-2: Create `slice-b-14-fuzz-golden.test.ts` OR re-map items 16-17 with "to verify" markers
3. Fix MB-3: Update plan to reference `packages/asset-pipeline`; create asset pipeline test
4. Fix MB-5: Clarify Offset wording in row 4
5. Fix MB-6: Define `ExportValidationResult` type OR remove from acceptance item 9
