# Subspec A — Slice 8.7: Bounds/Vector Helpers

**Goal:** Define vector and bounds utility functions: union, intersect, contains, size, translate, chunk key iteration, Vec3i/Vec3Half arithmetic.

## Files to Create/Modify

| File | Purpose |
|------|---------|
| `packages/domain/bounds.ts` | Bounds and vector helpers |

## Functions to Define

```ts
export type Vec3i = readonly [number, number, number];
export type Bounds3i = { min: Vec3i; maxExclusive: Vec3i };

export function add(a: Vec3i, b: Vec3i): Vec3i;
export function sub(a: Vec3i, b: Vec3i): Vec3i;
export function equals(a: Vec3i, b: Vec3i): boolean;

export function union(a: Bounds3i, b: Bounds3i): Bounds3i;
export function intersect(a: Bounds3i, b: Bounds3i): Bounds3i | null; // null if no intersection
export function contains(bounds: Bounds3i, point: Vec3i): boolean;
export function size(bounds: Bounds3i): Vec3i;
export function translate(bounds: Bounds3i, offset: Vec3i): Bounds3i;

// Iterate chunk keys intersecting bounds
export function chunkKeysInBounds(bounds: Bounds3i): string[];

// Half-block variants
export function addHalf(a: Vec3Half, b: Vec3Half): Vec3Half;
export function subHalf(a: Vec3Half, b: Vec3Half): Vec3Half;
export function equalsHalf(a: Vec3Half, b: Vec3Half): boolean;
export function isIntegral(half: Vec3Half): boolean; // all components even
```

## Acceptance Criteria

- [ ] Union returns minimal bounds containing both
- [ ] Intersect returns null for disjoint bounds
- [ ] Contains checks inclusive min, exclusive max
- [ ] Size computes maxExclusive - min per axis
- [ ] Chunk key iteration covers all chunks intersecting bounds
- [ ] `isIntegral` returns true iff all half-block components are even

## Tests

**File:** `packages/domain/__tests__/slice-8.7-bounds.test.ts`

1. `union([0,0,0]-[16,16,16], [8,8,8]-[24,24,24])` = `[0,0,0]-[24,24,24]`
2. `intersect([0,0,0]-[16,16,16], [16,0,0]-[32,16,16])` = null
3. `contains([0,0,0]-[16,16,16], [15,15,15])` = true
4. `size([0,0,0]-[16,16,16])` = `[16,16,16]`
5. `isIntegral([0,0,0])` = true
6. `isIntegral([1,0,1])` = false (odd components)

## Verification Checklist

- [ ] Change does one thing completely (bounds/vector helpers)
- [ ] TypeScript compiles without errors
- [ ] All new tests pass
- [ ] Change committed with descriptive message
