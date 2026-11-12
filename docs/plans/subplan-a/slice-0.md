# Subspec A — Slice 0: Project Init + Core Types

**Goal:** Set up the `packages/domain` package with core type definitions. Pure TypeScript, zero framework/browser/Node/Three.js/MCP imports.

## Files to Create/Modify

| File | Purpose |
|------|---------|
| `packages/domain/package.json` | Package manifest, no dependencies |
| `packages/domain/tsconfig.json` | Strict TypeScript config |
| `packages/domain/types.ts` | Core type definitions |

## Types to Define

```ts
// Integer block coordinate (cell index).
export type Vec3i = readonly [number, number, number];

// Fractional world/local point.
export type Vec3d = readonly [number, number, number];

// Half-block grid unit. Actual coordinate = stored value / 2.
// Origin must be integral for placement transforms (even half-block components).
// Half-integer origins are off-grid under integer translation and rejected with
// ENGINE_OFF_GRID_TRANSFORM.
export type Vec3Half = readonly [number, number, number];

// Chunk coordinate (integer, may be negative).
export type ChunkCoord = readonly [number, number, number];

export type Bounds3i = {
  min: Vec3i;
  maxExclusive: Vec3i;
};

export type BlockStateId = {
  id: string;           // normalized namespaced resource location, lowercase
  props: Readonly<Record<string, string>>; // canonical sorted keys
};

export const CHUNK_SIZE = 16; // A1 — fixed globally for v1
```

## Helper Functions

```ts
export function halfToCoord(stored: number): number {
  return stored / 2;
}

export function coordToHalf(coord: number): number {
  return coord * 2;
}
```

## Acceptance Criteria

- [ ] `Vec3Half` stores origin as integer half-block units
- [ ] `halfToCoord`/`coordToHalf` are exact inverses with no floating-point drift
- [ ] `CHUNK_SIZE` is exported as `16` and is not user-overridable in v1
- [ ] Origin for placement transforms must have even half-block components (integer origin); half-integer origins are off-grid and rejected

## Tests

**File:** `packages/domain/__tests__/slice-0-types.test.ts`

1. `coordToHalf(halfToCoord(x)) === x` for a range of integer and half-integer values
2. `halfToCoord(coordToHalf(x)) === x` for integer x
3. `CHUNK_SIZE === 16`
4. `Vec3Half` values like `[1, 0, 1]` represent `[0.5, 0, 0.5]` when passed through `halfToCoord`
5. Origin `[0.5, 0, 0.5]` (stored as `[1, 0, 1]`) is flagged as non-integral for placement transforms

## Verification Checklist

- [ ] Change does one thing completely (types only)
- [ ] TypeScript compiles without errors
- [ ] All new tests pass
- [ ] Change committed with descriptive message
