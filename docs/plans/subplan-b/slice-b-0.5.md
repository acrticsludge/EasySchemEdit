# Subspec B — Slice b-0.5: Shared Types + Adapter Interface + Merged Snapshot + Reports

**Goal:** Define the `FormatAdapter` interface, result types, merged snapshot type, and report types. No implementation logic.

## Files to Create

| File | Purpose |
|------|---------|
| `packages/formats/adapter.ts` | Adapter interface + result types |
| `packages/formats/reports.ts` | Import/export report types |
| `packages/formats/errors.ts` | ExportError + NbtSafetyError + diagnostic codes |

## Types to Define

### Adapter interface

```ts
import type {
  BlockStateId,
  Bounds3i,
  Diagnostic,
  Placement,
  ImportGroup,
  Transform,
  Vec3Half,
  Vec3i,
} from '../domain/types.ts';
import type { NbtTag } from './nbts.ts';

export interface FormatAdapter {
  readonly formatId: 'schem-v2' | 'schem-v3' | 'litematic' | 'schematic-legacy' | 'vanilla-nbt';
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
  targetDataVersion: number;
  onProgress?: (done: number, total: number) => void;
  signal?: AbortSignal;
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
    ancillary: {
      blockEntities: Map<string, { position: Vec3i; nbt: NbtTag }>;
      entities: Array<{ id: string; position: Vec3i; rotation: Vec3i; nbt: NbtTag }>;
      biomes?: { palette: string[]; indices: Uint8Array | Uint16Array | Uint32Array; bounds: Bounds3i };
      pendingTicks: Array<{ position: Vec3i; blockState: BlockStateId; tickDelay: number }>;
      tombstones: Set<string>;
    };
  }>;
  importGroups: ReadonlyArray<ImportGroup>;
  overlapPolicy: 'top-wins' | 'bottom-wins';
  revision: number;
  chunkViews: Map<string, Map<string, { indices: Uint8Array | Uint16Array | Uint32Array; palette: BlockStateId[] }>>;
};
```

### Errors

```ts
export class ExportError extends Error {
  readonly code: string;
  constructor(code: string, message: string, public readonly context?: Record<string, unknown>) {
    super(message);
    this.code = code;
    this.name = 'ExportError';
  }
}

export class NbtSafetyError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = 'NbtSafetyError';
  }
}
```

## Acceptance Criteria

- [ ] `FormatAdapter` interface has `formatId`, `detect`, `import`, `export`
- [ ] `ImportResult` includes `placements`, `importGroups`, `report`, `normalizedImport`
- [ ] `ExportResult` includes `bytes`, `filename`, `report`
- [ ] `ExportTarget` union discriminates on `kind` field; uses `importGroup`
- [ ] `ProjectSnapshot` has ancillary data per placement, `chunkViews` nested Map keyed by placementId + chunkKey
- [ ] `ExportOptions` includes `targetDataVersion` (number), `onProgress`, `signal`
- [ ] `ExportError` and `NbtSafetyError` are exported error classes with `code`

## Tests

**File:** `packages/formats/__tests__/slice-b-0.5-adapter.test.ts`

1. `FormatAdapter` interface is exported and structurally typed
2. `ExportTarget` union discriminates on `kind` field
3. `ProjectSnapshot.chunkViews` is a nested `Map<string, Map<string, ...>>`
4. `ExportOptions` has `targetDataVersion`, `onProgress`, `signal`

## Verification Checklist

- [ ] Change does one thing completely (adapter interface + result types + merged snapshot + reports + errors)
- [ ] TypeScript compiles without errors
- [ ] All new tests pass
- [ ] Change committed with descriptive message
