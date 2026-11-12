# Subspec B — Slice b-5.5: Import Report + Export Report Types

**Goal:** Define `ImportReport`, `ExportReport`, and `ExportValidationResult` types with `bigint` volume, `normalizedImport` field, and separate `sameStateOverlaps`/`stateConflicts` counts.

## Files to Create/Modify

| File | Purpose |
|------|---------|
| `packages/formats/reports.ts` | Import/export report types |

## Types to Define

```ts
export type ImportReport = {
  format: DetectedFormat;
  minecraftDataVersion?: number;
  litematicRootVersion?: { major: number; minor: number; revision: number };
  dimensions: { width: number; height: number; length: number };
  volume: bigint;                  // BigInt-safe: width * height * length
  nonAirBlockCount: number;
  paletteSize: number;
  regionCount: number;
  fileSizeBytes: number;
  compressedSizeBytes: number;
  decompressedSizeBytes: number;
  preserved: {
    blockEntities: number;
    entities: number;
    biomes: boolean;
    ticks: number;
  };
  unsupported: {
    tags: Diagnostic[];
    blockStates: Diagnostic[];
  };
  sameStateOverlaps: number;         // positions with >= 2 owners, all same state
  stateConflicts: number;            // positions with >= 2 owners, differing states
  normalized: Diagnostic[];          // data that was normalized (not dropped)
  dropped: Diagnostic[];             // data that could not be retained
  warnings: Diagnostic[];
  errors: Diagnostic[];
};

export type ExportReport = {
  format: 'schem-v3' | 'litematic';
  target: 'composite' | 'placement' | 'selection' | 'import-group';
  minecraftDataVersion?: number;
  dimensions: { width: number; height: number; length: number };
  nonAirBlockCount: number;
  paletteSizeEstimate: number;
  regionCount: number;
  estimatedOutputSizeBytes: number;
  conflictsResolvedByPrecedence: number;
  ancillaryData: {
    blockEntities: number;
    entities: number;
    biomes: boolean;
  };
  warnings: Diagnostic[];
  errors: Diagnostic[];
  validation: ExportValidationResult;
};

export type ExportValidationResult = {
  passed: boolean;
  reimportComparison: { matches: boolean; differences: Diagnostic[] };
};
```

## Acceptance Criteria

- [ ] `ImportReport.volume` is `bigint`
- [ ] `ImportReport.normalizedImport` field present (in ImportResult, not ImportReport)
- [ ] `ExportValidationResult` defined with `passed` and `reimportComparison`
- [ ] `sameStateOverlaps` and `stateConflicts` counted separately
- [ ] `preserved` includes blockEntities, entities, biomes, ticks
- [ ] `unsupported` includes tags and blockStates diagnostics

## Tests

**File:** `packages/formats/__tests__/slice-b-5.5-reports.test.ts`

1. `ImportReport.volume` is `bigint` type
2. `ImportReport` has `sameStateOverlaps` and `stateConflicts` as separate counts
3. `ExportValidationResult` has `passed` and `reimportComparison`
4. `ImportReport.preserved` includes blockEntities, entities, biomes, ticks

## Verification Checklist

- [ ] Change does one thing completely (report types)
- [ ] TypeScript compiles without errors
- [ ] All new tests pass
- [ ] Change committed with descriptive message
