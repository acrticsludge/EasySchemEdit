# Subspec A — Slice 7: Lattice-Safe Block Mapping

**Goal:** Add the doubled-integer lattice-safe block mapping with lattice theorem, round-trip proof, and the counterexample showing translation [10,64,10] / origin [0.5,0,0.5] / local block [0,0,0] is correctly classified off-grid.

## Files to Create/Modify

| File | Purpose |
|------|---------|
| `packages/domain/coordinates.ts` | Lattice-safe mapping + proof |

## Lattice Theorem

With integral translation (T even) and integral origin (O even):
1. `C − O` is even − even = even
2. `R` permutes/negates components; even stays even
3. `T + R(C − O)` is even + even = even → valid cell
4. World center = `worldCellHalf + [1,1,1]` (all-odd → half-integer center, always on lattice)
5. `floor` of half-integer center is exact and unique; no corner/edge ambiguity

## Counterexample (origin off-grid, correctly classified)

`translation = [10, 64, 10]` (T = [20,128,20], even), `origin = [0.5, 0, 0.5]` (O = [1, 0, 1], x,z odd), local block `[0, 0, 0]` (C = [0, 0, 0], even):
- `C − O = [−1, 0, −1]` (x,z odd)
- `worldCenterHalf = T + R(C − O) = [19, 128, 19]` (x,z odd)
- `worldBlock = (worldCenterHalf − [1,1,1]) / 2 = [18,127,18] / 2 = [9, 63.5, 9]` → non-integral → off-grid

Origin [0.5, 0, 0.5] is NOT integral (O has odd components 1, 0, 1 — x and z are odd). Under integer translation, half-integer origins place block centers on block corners, not cell lower corners. This is rejected with `ENGINE_OFF_GRID_TRANSFORM`.

## Functions to Add

```ts
// Doubled-integer map: cell lower corner → cell lower corner
export function mapCellToWorld(
  translation: Vec3i,   // T (even)
  origin: Vec3Half,     // O (must have even components for integral origin)
  rotationY: 0 | 90 | 180 | 270,
  mirror: 'none' | 'x' | 'z',
  cell: Vec3i           // C (even)
): { worldCellHalf: number[]; valid: boolean; worldBlock?: Vec3i };

export function isLatticeSafe(translation: Vec3i, origin: Vec3Half): boolean;
```

## Acceptance Criteria

- [ ] Counterexample: `[10,64,10] / [0.5,0,0.5] / [0,0,0]` correctly classified off-grid
- [ ] Integral translation + integral origin: every block maps to valid integer world cell
- [ ] Half-integer origin with integral translation: rejected as off-grid
- [ ] No silently-accepted invalid block; no ambiguous floor
- [ ] Every accepted transform keeps block centers on half-block center lattice
- [ ] Origin even components validated before transform applied

## Tests

**File:** `packages/domain/__tests__/slice-7-lattice.test.ts`

1. `mapCellToWorld([10,64,10], [0.5,0,0.5], 0, 'none', [0,0,0]).valid === false`
2. `mapCellToWorld([10,64,10], [0,0,0], 0, 'none', [0,0,0]).valid === true`
3. `mapCellToWorld([10,64,10], [0,0,0], 90, 'none', [2,0,3]).valid === true`
4. `isLatticeSafe([10,64,10], [0.5,0,0.5]) === false`
5. `isLatticeSafe([10,64,10], [0,0,0]) === true`

## Verification Checklist

- [ ] Change does one thing completely (lattice-safe mapping + counterexample)
- [ ] TypeScript compiles without errors
- [ ] All new tests pass
- [ ] Change committed with descriptive message
