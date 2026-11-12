# Subspec B — File Formats: Slice Plan

**Source:** `docs/specs/subs/SUBSPEC-B_FILE_FORMATS.md`
**Constraint:** `packages/formats` may import `packages/domain`, but must have **zero** imports of Three.js, React, DOM APIs, or UI state. Pure TypeScript only.

## Method

Build in thin vertical slices per the incremental-implementation skill:
- Implement → Test → Verify → Commit → Next slice
- Each slice changes one logical thing
- Project must build and existing tests pass after each increment

## Slices (in dependency order)

| Slice | Focus | Deliverable | Tests |
|-------|-------|-------------|-------|
| `slice-b-0.md` | Project init + core types | `packages/formats/package.json`, `packages/formats/tsconfig.json`, `packages/formats/types.ts` | FormatSignature, DetectedFormat, FormatDetectionResult shape |
| `slice-b-0.5.md` | Shared types + adapter interface | `packages/formats/adapter.ts` | FormatAdapter, ImportResult, ExportResult, ImportOptions, ExportOptions |
| `slice-b-1.md` | Format detection | `packages/formats/format-detection.ts` | Gzip magic, NBT structure inspection, extension mismatch |
| `slice-b-2.md` | Sponge schem v3 adapter | `packages/formats/schem-v3.ts` | Read/write v3, Offset exact integer, gzip compression |
| `slice-b-3.md` | Litematica packed BlockStates | `packages/formats/litematic-packed.ts` | bitsPerEntry, cross-word decode/encode, exact packed-array length |
| `slice-b-4.md` | Negative Size normalization | `packages/formats/litematic-negative-size.ts` | Signed-axis mapping, axis reversal, bounds.min vs local index separation |
| `slice-b-5.md` | Legacy .schematic + vanilla .nbt convert-on-import | `packages/formats/convert-on-import.ts` | normalizedImport: true, warning, no export support |
| `slice-b-5.5.md` | Import report + Export report types | `packages/formats/reports.ts` | ImportReport, ExportReport, ExportValidationResult |
| `slice-b-6.md` | Multi-region export eligibility checker | `packages/formats/region-eligibility.ts` | Deterministic eligibility, relative positions, common group transform |
| `slice-b-7.md` | NBT safety limits | `packages/formats/nbtsafety.ts` | Tag count, string/array length, decompression ratio, duration, depth, overflow, duplicates |
| `slice-b-8.md` | Asset extraction pipeline | `packages/formats/asset-pipeline.ts` | Worker extraction, IndexedDB cache, SHA-1 verification |
| `slice-b-9.md` | First-run asset load flow | `packages/formats/asset-flow.ts` | Auto-download, manual JAR, progress, cancel, fallback |
| `slice-b-10.md` | Export semantics | `packages/formats/export-semantics.ts` | trimOuterAir, oversized axis auto-split, strict vs permissive |
| `slice-b-11.md` | Immutable snapshots + memory management | `packages/formats/snapshot.ts` | ProjectSnapshot, chunkViews transfer, revision check |
| `slice-b-12.md` | Full acceptance criteria | `packages/formats/__tests__/` | All criteria from SUBSPEC-B §15.3 |

## Acceptance Criteria (from SUBSPEC-B §15.3)

1. Format detection decompresses gzip before NBT inspection; misleading extension produces `FORMAT_EXTENSION_MISMATCH` warning but import proceeds using detected format.
2. Litematic packed BlockStates decode/encode documented exactly: bits per entry by palette size, entries per word, cross-word behavior, signed long handling via unsigned shift, palette validation, packed-array length validation.
3. Negative Litematic Size normalized via signed-axis mapping; block entities, entities, and ticks transformed consistently with axis reversal.
4. Sponge v3 `Offset` export is exact integer arithmetic (`Offset = -origin_world`), no rounding, no block position change; half-integer domain origins handled via block cell export.
5. Litematica origin metadata (`Position`) preserved per region on import/export when grouping retained.
6. Multi-region export eligibility checker is deterministic; preserves grouping only when relative transforms intact, shared rotation/mirror, no baking; otherwise single region + `EXPORT_REGION_GROUPING_LOST`.
7. NBT safety limits enforced: tag count, string/array lengths, decompression ratio, parse duration, nesting depth, integer overflow, duplicate required fields.
8. Streaming/incremental NBT parsing and encoding for files above 1 MiB compressed.
9. `ImportReport.volume` is `bigint`; `normalizedImport` field present; `ExportValidationResult` defined; `sameStateOverlaps` and `stateConflicts` counted separately.
10. Outer-air trimming configurable; defaults to `true`, `false` allowed with Offset/origin metadata adjusted; oversized axis auto-split; strict vs permissive export unambiguous.
11. Diagnostics for unsupported entities, biomes, and ticks in export reports.
12. Asset extraction pipeline obtains client JAR from official metadata, extracts blockstates/models/textures in worker, caches in IndexedDB, identical pipeline for manual JAR import.
13. Phase 0 verifies browser CORS/download feasibility for official Mojang asset endpoints; manual JAR fallback works end-to-end.
14. Export semantics: placement bakes transform; import group preserves or flattens per eligibility; composite bakes transforms and applies overlap policy; hidden placements excluded by default, includable via option.
15. Format adapters receive immutable `ProjectSnapshot`; no multiple giant intermediate buffers; streaming writer used for large exports.
16. All source metadata, unknown tags, and supported ancillary data preserved or reported; fixture matrix includes malformed, empty, all-air, large, multi-region, metadata-heavy files.
17. External validation passes: WorldEdit placement/count check, Litematica open check with pinned versions.
18. Format code has zero imports of Three.js, React, DOM, or UI state.
19. All diagnostics use central registry codes (B7 namespaces); no per-adapter arbitrary codes.
20. Sponge v2 imports with warning and `normalizedImport: true`; no export. Legacy `.schematic` imports with warning and `normalizedImport: true`; no export.

## Removed/Changed Spec Text

The following SUBSPEC-B statements are superseded by the slices:
- "Trim outer air mandatory; anything over 65,535 fails" → Trim outer air configurable, defaults true; auto-split oversized axes; fail if dimension still exceeds 65,535 after trim
- "Legacy .schematic is rejected outright" → Legacy .schematic supported via convert-on-import with warning
- "Max decompression ratio: 100:1 per entry" → Absolute size caps replace blanket 100:1 ratio (aligned with SUBSPEC-A slice-13)
