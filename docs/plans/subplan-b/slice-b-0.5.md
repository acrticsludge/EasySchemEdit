# Subspec B — Slice b-0.5: Shared Types + Adapter Interface

**Goal:** Define the `FormatAdapter` interface and result types shared across all format adapters. No implementation logic, just type definitions.

## Files to Create

| File | Purpose |
|------|---------|
| `packages/formats/adapter.ts` | Adapter interface + result types |

## Types to Define

```ts
import type {
  BlockStateId,
  Bounds3i,
  Placement,
  ImportGroup,
  Transform,
  Vec3Half,
} from '../domain/types.ts';

export interface FormatAdapter {
  readonly formatId: 'schem-v2' | 'schem-v3' | 'litematic';
  detect(bytes: Uint8Array): FormatDetectionResult;
  import(bytes: Uint8Array, options: ImportOptions): Promise<ImportResult>;
  export(snapshot: ProjectSnapshot, target: ExportTarget, options: ExportOptions): Promise<ExportResult>;
}

export type ImportResult = {
  placements: Placement[];
  importGroups: ImportGroup[];
  report: ImportReport;
  normalizedImport: boolean;
};

export type ExportResult = {
  bytes: Uint8Array;
  filename: string;
  report: ExportReport;
};

export type ImportOptions = {
  preserveSourceOrigin: boolean;
  autoArrange: boolean;
  strict: boolean;
  maxCompressedBytes: number;
  maxDecompressedBytes: number;
  maxTotalVolume: bigint;
  maxNonAirBlocks: number;
  maxNbtNestingDepth: number;
  maxNbtTagCount: number;
};

export type ExportTarget =
  | { kind: 'placement'; placementId: string }
  | { kind: 'importGroup'; importGroupId: string }
  | { kind: 'composite'; selection?: Bounds3i; includeHidden: boolean }
  | { kind: 'selection'; bounds: Bounds3i; includeHidden: boolean };

export type ExportOptions = {
  strict: boolean;
  confirmLossy: boolean;
  includeRegionMetadata: boolean;
  trimOuterAir: boolean;
  bakeTransforms: boolean;
};

export type ProjectSnapshot = {
  schemaVersion: number;
  id: string;
  name: string;
  placements: ReadonlyArray<{
    id: string;
    name: string;
    transform: Transform;
    origin: Vec3Half;
    visible: boolean;
    locked: boolean;
    source: { format: string; diagnostics: Diagnostic[] };
    volumeRef: { bounds: Bounds3i; chunkKeys: string[]; nonAirCount: number };
  }>;
  importGroups: ReadonlyArray<ImportGroup>;
  overlapPolicy: 'top-wins' | 'bottom-wins';
  revision: number;
  chunkViews: Map<string, { indices: Uint8Array | Uint16Array | Uint32Array; palette: BlockStateId[] }>;
};
```

## Acceptance Criteria

- [ ] `FormatAdapter` interface has `formatId`, `detect`, `import`, `export`
- [ ] `ImportResult` includes `placements`, `importGroups`, `report`, `normalizedImport`
- [ ] `ExportResult` includes `bytes`, `filename`, `report`
- [ ] `ExportTarget` union covers placement, importGroup, composite, selection
- [ ] `ProjectSnapshot` has immutable placements array and chunkViews map
- [ ] `packages/formats` has zero imports of Three.js/React/DOM/UI

## Tests

**File:** `packages/formats/__tests__/slice-b-0.5-adapter.test.ts`

1. `FormatAdapter` interface is exported and structurally typed
2. `ExportTarget` union discriminates on `kind` field
3. `ProjectSnapshot.chunkViews` is a `Map<string, ...>`

## Verification Checklist

- [ ] Change does one thing completely (adapter interface + result types)
- [ ] TypeScript compiles without errors
- [ ] All new tests pass
- [ ] Change committed with descriptive message
