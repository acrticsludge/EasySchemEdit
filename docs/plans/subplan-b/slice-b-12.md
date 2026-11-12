# Subspec B — Slice b-12: Full Acceptance Criteria

**Goal:** Write the complete test suite validating all acceptance criteria from SUBSPEC-B §15.3.

## Files to Create/Modify

| File | Purpose |
|------|---------|
| `packages/formats/__tests__/index.test.ts` | Test runner aggregating all slice tests |
| `packages/formats/__tests__/acceptance.test.ts` | Acceptance criteria validation |

## Acceptance Criteria Tests (from SUBSPEC-B §15.3)

1. Format detection decompresses gzip before NBT inspection; misleading extension produces `FORMAT_EXTENSION_MISMATCH` warning but import proceeds using detected format
2. Litematic packed BlockStates decode/encode documented exactly: bits per entry by palette size, entries per word, cross-word behavior, signed long handling via unsigned shift, palette validation, packed-array length validation
3. Negative Litematic Size normalized via signed-axis mapping; block entities, entities, and ticks transformed consistently with axis reversal
4. Sponge v3 `Offset` export is exact integer arithmetic (`Offset = -origin_world`), no rounding, no block position change; half-integer domain origins handled via block cell export
5. Litematica origin metadata (`Position`) preserved per region on import/export when grouping retained
6. Multi-region export eligibility checker is deterministic; preserves grouping only when relative transforms intact, shared rotation/mirror, no baking; otherwise single region + `EXPORT_REGION_GROUPING_LOST`
7. NBT safety limits enforced: tag count, string/array lengths, decompression ratio, parse duration, nesting depth, integer overflow, duplicate required fields
8. Streaming/incremental NBT parsing and encoding for files above 1 MiB compressed
9. `ImportReport.volume` is `bigint`; `normalizedImport` field present; `ExportValidationResult` defined; `sameStateOverlaps` and `stateConflicts` counted separately
10. Outer-air trimming configurable; defaults to `true`, `false` allowed with Offset/origin metadata adjusted; oversized axis auto-split; strict vs permissive export unambiguous
11. Diagnostics for unsupported entities, biomes, and ticks in export reports
12. Asset extraction pipeline obtains client JAR from official metadata, extracts blockstates/models/textures in worker, caches in IndexedDB, identical pipeline for manual JAR import
13. Phase 0 verifies browser CORS/download feasibility for official Mojang asset endpoints; manual JAR fallback works end-to-end
14. Export semantics: placement bakes transform; import group preserves or flattens per eligibility; composite bakes transforms and applies overlap policy; hidden placements excluded by default, includable via option
15. Format adapters receive immutable `ProjectSnapshot`; no multiple giant intermediate buffers; streaming writer used for large exports
16. All source metadata, unknown tags, and supported ancillary data preserved or reported; fixture matrix includes malformed, empty, all-air, large, multi-region, metadata-heavy files
17. External validation passes: WorldEdit placement/count check, Litematica open check with pinned versions
18. Format code has zero imports of Three.js, React, DOM, or UI state
19. All diagnostics use central registry codes (B7 namespaces); no per-adapter arbitrary codes
20. Sponge v2 imports with warning and `normalizedImport: true`; no export. Legacy `.schematic` imports with warning and `normalizedImport: true`; no export

## Verification Checklist

- [ ] All 20 acceptance criteria items covered by tests
- [ ] Format detection test covers gzip + extension mismatch
- [ ] Litematic packed BlockStates test covers all palette sizes (1, 5, 12, 20, 300) and cross-word boundaries
- [ ] Negative size test covers axis reversal and local index/world position separation
- [ ] NBT safety test covers all 9 limit types
- [ ] Asset pipeline test covers SHA-1 verification and version mismatch
- [ ] Export semantics test covers strict/permissive and trimOuterAir
- [ ] TypeScript compiles without errors
- [ ] All tests pass
- [ ] Change committed with descriptive message

## Completion

After Slice b-12, SUBSPEC-B (File Formats) is complete and ready for review. All type definitions, formulas, and acceptance tests from SUBSPEC-B §15.3 are implemented and verified.
