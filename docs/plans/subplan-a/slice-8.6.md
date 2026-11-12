# Subspec A — Slice 8.6: Ancillary Transforms

**Goal:** Define transforms for ancillary data: block entity positions, entity positions/rotations, biome volume, pending ticks. Unknown tags preserved; warnings via Diagnostic.

## Files to Create/Modify

| File | Purpose |
|------|---------|
| `packages/domain/ancillary-transforms.ts` | Ancillary data transforms |

## Functions to Define

```ts
export type AncillaryTransformResult<T> = {
  result: T;
  warnings: Diagnostic[];
};

export function rotateMirrorBlockEntityPositions(
  records: BlockEntityRecord[],
  transform: Transform,
  origin: Vec3Half
): AncillaryTransformResult<BlockEntityRecord[]>;

export function rotateMirrorEntityPositions(
  records: EntityRecord[],
  transform: Transform,
  origin: Vec3Half
): AncillaryTransformResult<EntityRecord[]>;

export function rotateMirrorBiomeVolume(
  biome: BiomeVolume | undefined,
  transform: Transform
): AncillaryTransformResult<BiomeVolume | undefined>;

export function rotateMirrorPendingTicks(
  ticks: PendingTickRecord[],
  transform: Transform,
  origin: Vec3Half
): AncillaryTransformResult<PendingTickRecord[]>;
```

## Rules

- Block entity positions transformed using center-based block-cell map
- Entity positions/rotations transformed using same math (fractional allowed)
- Biome volume indices remapped to new bounds
- Pending tick positions transformed using center-based map
- `unknownTags` preserved unchanged (no transform possible)
- Warnings emitted via Diagnostic for any data that can't be cleanly transformed

## Acceptance Criteria

- [ ] Block entity positions transformed correctly
- [ ] Entity positions/rotations transformed correctly
- [ ] Biome volume remapped to new bounds
- [ ] Pending tick positions transformed correctly
- [ ] Unknown tags preserved unchanged
- [ ] Warnings emitted for untransformable data

## Tests

**File:** `packages/domain/__tests__/slice-8.6-ancillary-transforms.test.ts`

1. Block entity at [1,2,3] rotated 90° about origin [0,0,0] → correct new position
2. Entity rotation updated when block rotated
3. Biome volume indices remapped after transform
4. Pending tick position transformed correctly
5. Unknown tags preserved unchanged

## Verification Checklist

- [ ] Change does one thing completely (ancillary transforms)
- [ ] TypeScript compiles without errors
- [ ] All new tests pass
- [ ] Change committed with descriptive message
