# Subspec B — Slice b-2: Sponge schem v3 Adapter

**Goal:** Implement Sponge schematic v3 read/write adapter. Read gzip-compressed NBT, parse `Width`/`Height`/`Length`/palette/`BlockStates`/`Offset`, write with exact `Offset = -origin_world` integer arithmetic.

## Files to Create/Modify

| File | Purpose |
|------|---------|
| `packages/formats/schem-v3.ts` | Sponge schem v3 adapter |

## Functions to Define

```ts
import type { FormatAdapter } from './adapter.ts';
import type { ImportResult, ExportResult } from './adapter.ts';

export class SchemV3Adapter implements FormatAdapter {
  readonly formatId = 'schem-v3';
  detect(bytes: Uint8Array): FormatDetectionResult;
  import(bytes: Uint8Array, options: ImportOptions): Promise<ImportResult>;
  export(snapshot: ProjectSnapshot, target: ExportTarget, options: ExportOptions): Promise<ExportResult>;
}
```

## Read Contract

- Parse official Sponge Schematic v3 NBT structure (gzip-compressed NBT)
- Read `Width`, `Height`, `Length` (unsigned 16-bit)
- Read VarInt-encoded block palette data with index order `x + z * Width + y * Width * Length`
- Preserve `DataVersion`, metadata, `Offset`, block entities, entities, biome palette/data when present
- `Offset` is a paste offset from paste target to first block; not a generic world transform matrix

## Origin Handling (exact, no rounding)

```ts
// Given placement P with origin O (Vec3Half) and translation T (Vec3i):
// Export local volume with bounds.min = [0,0,0].
// The block at local coordinate [0,0,0] occupies world cell [tx, ty, tz] where
//   [tx, ty, tz] = localBlockToWorld(P, [0,0,0])
// Sponge Offset = [-tx, -ty, -tz]   // integer triple, exact
```

Because `translation` is integer and `localBlockToWorld` maps block centers to integer world cells, `tx`, `ty`, `tz` are always integers. `Offset = -origin_world` is exact integer arithmetic; no rounding occurs.

## Write Contract

- Gzip compression is required by the v3 format contract
- Trim outer air by default (`trimOuterAir` configurable, defaults `true`); auto-split oversized axes
- Individual dimension > 65,535 after air trim → `EXPORT_DIMENSION_LIMIT`, refuse export
- Trim outer air while adjusting `Offset` so world-space positions remain unchanged
- One region only (schem v3 is single-region)
- Preserve supported block entities, entities, biomes, metadata

## Acceptance Criteria

- [ ] Sponge v3 `Offset` export is exact integer arithmetic (`Offset = -origin_world`)
- [ ] No rounding, no block position change
- [ ] Half-integer domain origins handled via block cell export
- [ ] Gzip compression applied on write
- [ ] Dimension > 65,535 after air trim → `EXPORT_DIMENSION_LIMIT`

## Tests

**File:** `packages/formats/__tests__/slice-b-2-schem-v3.test.ts`

1. Offset computed as `-origin_world` exact integer
2. Half-integer origin handled correctly via block cell export
3. Dimension > 65,535 after trim → `EXPORT_DIMENSION_LIMIT`
4. Gzip compression applied on write

## Verification Checklist

- [ ] Change does one thing completely (Sponge schem v3 adapter)
- [ ] TypeScript compiles without errors
- [ ] All new tests pass
- [ ] Change committed with descriptive message
