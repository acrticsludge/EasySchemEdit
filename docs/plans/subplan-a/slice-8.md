# Subspec A — Slice 8: Placement + Project Types + Invariants

**Goal:** Define `Placement`, `Project`, `Transform`, `PlacementAncillaryData`, and the 10 project invariants checked after every commit.

## Files to Create/Modify

| File | Purpose |
|------|---------|
| `packages/domain/placement.ts` | Placement + Project types |
| `packages/domain/invariants.ts` | Invariant validation |

## Types to Define

```ts
export type Transform = {
  translation: Vec3i;
  rotationY: 0 | 90 | 180 | 270;
  mirror: 'none' | 'x' | 'z';
};

export type PlacementAncillaryData = {
  blockEntities: Map<string, BlockEntityRecord>;
  entities: EntityRecord[];
  biomes?: BiomeVolume;
  pendingBlockTicks: PendingTickRecord[];
  pendingFluidTicks: PendingTickRecord[];
  unknownTags: Map<string, NbtTag>;
};

export type Placement = {
  id: string;
  name: string;
  volume: ChunkedVoxelVolume;
  transform: Transform;
  origin: Vec3Half;
  ancillary: PlacementAncillaryData;
  visible: boolean;
  locked: boolean;
  color?: string;
  createdAt: string;
  source: PlacementSource;
  eraseTombstones: Set<string>;
};

export type Project = {
  schemaVersion: number;
  id: string;
  name: string;
  placements: Placement[];
  importGroups: ImportGroup[];
  overlapPolicy: 'top-wins' | 'bottom-wins';
  conflictOverlay: 'off' | 'conflicts' | 'full';
  metadata: { author?: string; createdAt: string; modifiedAt: string };
  revision: number;
};
```

## Invariants (13)

1. `Project.placements` is an array; no duplicate `placement.id`
2. Every `Placement.id` referenced by `ImportGroup.placementIds` exists
3. Every `Placement.volume.bounds.min` = `[0, 0, 0]`
4. Every `Placement.transform.translation` is `Vec3i` (integer components)
5. Every `Placement.origin` has **even** half-block components (integral origin only)
6. Every chunk `key` maps to `chunkCoord` within `volume.bounds`
7. Every chunk `palette[0]` is `CANONICAL_AIR`
8. Every chunk `indices` length equals `CHUNK_SIZE^3` (4096)
9. Every chunk palette entries are unique
10. Every chunk palette index < palette.length
11. Every chunk `nonAirCount` matches actual count of non-air blocks
12. Every tombstone position is inside `volume.bounds`
13. All-air chunks omitted from `chunks` map

`project.revision` is non-negative integer, incremented by exactly 1 per transaction.
`BlockStateId` equality is value-based throughout.

Violation → `ENGINE_INVARIANT_VIOLATION`, halts commit.

## Acceptance Criteria

- [ ] All 13 invariants checked after every committed transaction
- [ ] Violations halt the commit with `ENGINE_INVARIANT_VIOLATION`
- [ ] `Placement.eraseTombstones` is a `Set<string>` of local block position keys `"x_y_z"`
- [ ] Zero-size/empty placements allowed (all-air volumes); EMPTY_VOLUME/DIMENSION code, not INTEGER_OVERFLOW

## Tests

**File:** `packages/domain/__tests__/slice-8-invariants.test.ts`

1. Create valid Project → all invariants pass
2. Modify placement to have duplicate id → invariant violation
3. Modify placement with fractional translation → invariant violation
4. Verify revision increments by exactly 1 per transaction
5. Create zero-size placement → uses EMPTY_VOLUME code, not INTEGER_OVERFLOW
6. Set origin with odd half-block component → invariant violation (origin must be integral)

## Verification Checklist

- [ ] Change does one thing completely (placement/project types + invariants)
- [ ] TypeScript compiles without errors
- [ ] All new tests pass
- [ ] Change committed with descriptive message
