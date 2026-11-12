# Subspec A — Slice 0.5: Shared Types + Error-Code Registry

**Goal:** Define types that are shared across multiple slices (used by slice 8 and later) plus a central error-code registry. No implementation logic, just type definitions and constants.

## Files to Create

| File | Purpose |
|------|---------|
| `packages/domain/shared-types.ts` | Shared type definitions |
| `packages/domain/error-codes.ts` | Central diagnostic/error code registry |

## Types to Define (shared-types.ts)

```ts
export type BlockEntityRecord = {
  position: Vec3i;          // local integer block coordinate
  nbt: NbtTag;              // compound, must contain 'id' string
};

export type EntityRecord = {
  id: string;
  position: Vec3d;          // fractional local position
  rotation: Vec3d;          // [pitch, yaw, roll] in degrees, fractional allowed
  nbt: NbtTag;              // opaque compound payload
};

export type BiomeVolume = {
  bounds: Bounds3i;         // local bounds matching the placement volume
  palette: string[];        // biome IDs (namespaced)
  indices: Uint8Array | Uint16Array | Uint32Array; // fixed volume entries
};

export type PendingTickRecord = {
  position: Vec3i;          // local integer block coordinate
  blockState: BlockStateId;
  tickDelay: number;        // ticks remaining, non-negative integer
  nbt: NbtTag;              // format-specific payload, preserved opaquely
};

export type PlacementSource = {
  format: 'schem-v2' | 'schem-v3' | 'litematic' | 'generated';
  filename?: string;
  regionName?: string;
  dataVersion?: number;
  formatVersion?: number;
  sourceGroupId?: string;
  rawMetadata?: NbtTag;
  diagnostics: Diagnostic[];
};

export type ImportGroup = {
  id: string;
  name: string;
  sourceFilename: string;
  placementIds: string[];
  sourceFormat: 'schem-v2' | 'schem-v3' | 'litematic';
  sourceMetadata?: NbtTag;
};

export type Diagnostic = {
  code: string; // stable code from central registry
  severity: 'error' | 'warning' | 'info';
  message: string;
  details?: Record<string, unknown>;
  remediation?: string;
};
```

## Error Code Registry (error-codes.ts)

Central registry of stable diagnostic codes. Each code has: code, severity, message, details, remediation.

| Namespace | Codes |
|-----------|-------|
| `ENGINE` | `ENGINE_OFF_GRID_TRANSFORM`, `ENGINE_INVARIANT_VIOLATION`, `ENGINE_OPERATION_TOO_LARGE`, `ENGINE_STORAGE_LIMIT` |
| `NBT` | `NBT_TAG_COUNT_EXCEEDED`, `NBT_STRING_TOO_LONG`, `NBT_ARRAY_TOO_LONG`, `NBT_DECOMPRESSION_RATIO_EXCEEDED`, `NBT_PARSE_DURATION_EXCEEDED`, `NBT_NESTING_DEPTH_EXCEEDED`, `NBT_INTEGER_OVERFLOW`, `NBT_DUPLICATE_REQUIRED_FIELD`, `NBT_MIXED_TYPE_LIST` |
| `CORRUPT` | `CORRUPT_ARCHIVE`, `CORRUPT_CHUNK`, `CORRUPT_CACHE` |
| `ASSET` | `ASSET_DOWNLOAD_FAILED`, `ASSET_CORRUPT_JAR`, `ASSET_WRONG_VERSION`, `ASSET_DOWNLOAD_CANCELLED`, `ASSET_CACHE_CORRUPT` |
| `FORMAT` | `FORMAT_EXTENSION_MISMATCH`, `FORMAT_UNKNOWN_SIGNATURE`, `FORMAT_AMBIGUOUS_STRUCTURE` |
| `EXPORT` | `EXPORT_DIMENSION_LIMIT`, `EXPORT_UNSUPPORTED_BLOCK_ENTITY`, `EXPORT_INVALID_ORIGIN`, `EXPORT_REGION_GROUPING_LOST` |
| `IMPORT` | `IMPORT_NBT_INVALID`, `IMPORT_REGION_INVALID`, `IMPORT_TRUNCATED_DATA`, `IMPORT_UNSUPPORTED_FORMAT`, `IMPORT_UNKNOWN_BLOCK` |

Each entry: `{ code, severity, message, details, remediation }`.

## Acceptance Criteria

- [ ] All shared types are defined in one place (no duplication across slices)
- [ ] Every error code has a unique string, severity, message, details shape, remediation
- [ ] `packages/domain` has zero imports of framework/browser/Node/Three.js/MCP

## Tests

**File:** `packages/domain/__tests__/slice-0.5-shared-types.test.ts`

1. `BlockEntityRecord`, `EntityRecord`, `BiomeVolume`, `PendingTickRecord` types are exported and usable
2. `PlacementSource`, `ImportGroup`, `Diagnostic` types are exported
3. Error code `ENGINE_OFF_GRID_TRANSFORM` exists with severity `'error'`
4. Error code `CORRUPT_ARCHIVE` exists with severity `'error'`

## Verification Checklist

- [ ] Change does one thing completely (shared types + error codes)
- [ ] TypeScript compiles without errors
- [ ] All new tests pass
- [ ] Change committed with descriptive message
