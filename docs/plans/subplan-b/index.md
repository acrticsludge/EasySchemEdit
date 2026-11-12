# Subspec B — File Formats Slice Plan

Slice order (one consistent list):

1. b-0: Project Init + Core Types
2. b-0.5: Shared Types + Adapter Interface + Merged Snapshot + Reports
3. b-1: NBT Parser+Encoder with Gzip + Safety Limits
4. b-1.5: Format Detection
5. b-2: Signed-Size Normalization (Litematic)
6. b-3: Packed BlockStates
7. b-4: Litematic Adapter
8. b-5: Export Semantics
9. b-6: Multi-Region Export Eligibility
10. b-7: Sponge v2 Reader
11. b-8: Sponge v3 Adapter
12. b-9: inspect() Header-Only Import Preview
13. b-10: Legacy ID Table
14. b-11: Vanilla .nbt Convert-on-Import
15. b-12: Snapshot Types
16. b-13: Asset Pipeline (packages/assets)
17. b-14: Fixtures and Tests

## Traceability: SUBSPEC-B §15.3 Acceptance Items → Slice(s) → Test File(s)

| # | Acceptance Item (SUBSPEC-B §15.3) | Slice(s) | Test File |
|---|---|---|---|
| 1 | Format detection decompresses gzip before NBT inspection; misleading extension → `FORMAT_EXTENSION_MISMATCH` warning, import proceeds using detected format | b-1.5 | `slice-b-1.5-format-detection.test.ts` |
| 2 | Litematic packed BlockStates decode/encode: `bitsPerEntry = max(2, ceil(log2(P)))`, entries per word, cross-word behavior, signed long via unsigned shift, palette validation (air remapped, index 0 not required), packed-array length validation | b-3 | `slice-b-3-packed-blockstates.test.ts` |
| 3 | Negative Litematic Size normalized via signed-axis mapping; axis reversal uses that axis's dimension; block entities/entities/ticks transformed consistently; non-cubic region tests | b-2, b-4 | `slice-b-2-size.test.ts`, `slice-b-4-litematic.test.ts` |
| 4 | Sponge v3 `Offset` export is exact integer arithmetic (`Offset = -origin_world` relative to build min corner), no rounding, no block position change; half-integer domain origins via block cell export | b-8 | `slice-b-8-sponge-v3.test.ts` |
| 5 | Litematica origin metadata (`Position`) preserved per region on import/export when grouping retained | b-4 | `slice-b-4-litematic.test.ts` |
| 6 | Multi-region export eligibility deterministic; preserves grouping only when relative transforms intact, shared rotation/mirror, no baking; else single region + `EXPORT_REGION_GROUPING_LOST`; no auto-split — refuse dimension >65,535 with `EXPORT_DIMENSION_LIMIT` | b-5, b-6 | `slice-b-5-export.test.ts`, `slice-b-6-region-eligibility.test.ts` |
| 7 | NBT safety limits enforced: tag count, string/array lengths, absolute decompression caps (derived from maxDecompressedBytes) plus ratio check only above size floor, parse duration, nesting depth, integer overflow, duplicate required fields; enforced incrementally inside parser | b-1 | `slice-b-1-nbts.test.ts` |
| 8 | Streaming/incremental NBT parsing and encoding for files above 1 MiB compressed | b-1 | `slice-b-1-nbts.test.ts` |
| 9 | `ImportReport.volume` is `bigint`; `normalizedImport` field present; `ExportValidationResult` defined; `sameStateOverlaps` and `stateConflicts` counted separately | b-0.5 | `slice-b-0.5-adapter.test.ts` |
| 10 | Outer-air trimming configurable; defaults `true`; `false` allowed with Offset/origin metadata adjusted; no auto-split — refuse dimension >65,535 with `EXPORT_DIMENSION_LIMIT`; strict vs permissive export unambiguous | b-5 | `slice-b-5-export.test.ts` |
| 11 | Diagnostics for unsupported entities, biomes, and ticks in export reports | b-4, b-5, b-8 | `slice-b-4-litematic.test.ts`, `slice-b-8-sponge-v3.test.ts` |
| 12 | Asset extraction pipeline: client JAR from official metadata, extracts blockstates/models/textures in worker, caches in IndexedDB, identical pipeline for manual JAR import (logic in packages/assets; IO in packages/assets) | b-13 | `slice-b-13-asset-pipeline.test.ts` |
| 13 | Phase 0 verifies browser CORS/download feasibility for official Mojang asset endpoints; manual JAR fallback works end-to-end | b-13 | `slice-b-13-asset-pipeline.test.ts` |
| 14 | Export semantics: placement bakes transform; import group preserves or flattens per eligibility; composite bakes transforms and applies overlap policy; hidden placements excluded by default, includable via option | b-5 | `slice-b-5-export.test.ts` |
| 15 | Format adapters receive immutable `ProjectSnapshot`; no multiple giant intermediate buffers; streaming writer for large exports; chunkViews keyed by placementId+chunkKey; copy-then-transfer | b-0.5, b-12 | `slice-b-0.5-adapter.test.ts`, `slice-b-12-snapshot.test.ts` |
| 16 | All source metadata, unknown tags, supported ancillary data preserved or reported; fixture matrix includes malformed, empty, all-air, large, multi-region, metadata-heavy files | b-4, b-8, b-14 | `slice-b-4-litematic.test.ts`, `slice-b-8-sponge-v3.test.ts`, `fuzz-golden.test.ts` |
| 17 | External validation passes: WorldEdit placement/count check, Litematica open check with pinned versions | b-4, b-8, b-14 | `slice-b-4-litematic.test.ts`, `slice-b-8-sponge-v3.test.ts`, `fuzz-golden.test.ts` |
| 18 | Format code has zero imports of Three.js, React, DOM, or UI state | all | (all test files) |
| 19 | All diagnostics use central registry codes (B7 namespaces); no per-adapter arbitrary codes | b-0.5 | `slice-b-0.5-adapter.test.ts` |
| 20 | Sponge v2 imports lossless: no warning, `normalizedImport: false`; no export (supersedes original item 20 text). Legacy `.schematic` imports with warning and `normalizedImport: true`; no export. | b-7, b-4 | `slice-b-7-sponge-v2.test.ts`, `slice-b-4-litematic.test.ts` |

## Bug Fixes Applied (vs. previous revision)

- Slice names describe deliverables (never "fix X")
- Every original slice's content restored unless explicitly superseded
- No meta slices (acceptance/index/final review are docs, not slices)
- Removed `splitAxes`, `ExportEligibility`, `import-group` kebab-case
- Removed decompression-ratio check; absolute caps from `maxDecompressedBytes`
- Removed zip-validation from `packages/formats` (moved to `packages/assets`)
- Sponge v2: lossless read, no warning, `normalizedImport: false`
- Sponge v3: Offset int[3] relative to paste point (to verify with fixture)
- `chunkViews`: nested Map (placementId + chunkKey), not colon string
- `targetDataVersion: number`, not string/optional
- `vanilla-nbt` added to `DetectedFormat`
- `nbt: NbtTag`, not `unknown`
- Ancillary data per placement
- Legacy ID table: keyed by `(id, data)`, MIT source preferred
- Vanilla .nbt: own convert-on-import slice
- `inspect()`: async, takes services, `nonAirBlockCount` optional
- One combined fuzz/golden test file (not two)
- Fixture-based checks marked "to verify" (not claimed verified)

## Documentation (separate from slices)

This `index.md` and `slice-b-14.md` (fixtures README) are documentation, not implementation slices.

## Verification Checklist

- [ ] One consistent slice list (17 slices, no duplicates)
- [ ] Traceability table maps all 20 SUBSPEC-B §15.3 items
- [ ] Fixture-based checks marked "to verify"
- [ ] No claims of verification without running tests
- [ ] Change committed with descriptive message
