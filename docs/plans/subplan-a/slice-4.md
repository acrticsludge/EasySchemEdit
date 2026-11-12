# Subspec A — Slice 4: Transform Math (Center-Based)

**Goal:** Implement block-cell mapping using doubled-integer half-block coordinates. Map block CENTERS (not corners): centerHalf = 2*cell + [1,1,1] (odd triple); worldCenterHalf = T + R(centerHalf − O); worldBlock = (worldCenterHalf − [1,1,1]) / 2. Valid iff all components of worldCenterHalf are odd.

## Files to Create/Modify

| File | Purpose |
|------|---------|
| `packages/domain/coordinates.ts` | Transform functions |

## Rotation Direction

`rotationY` is clockwise degrees about the world +Y axis when looking down the +Y axis toward the origin (i.e., looking from above, +Y up).

Rotation matrix for `rotationY = θ` (θ in {0, 90, 180, 270}):
```
| cos θ   0   sin θ |
| 0       1   0     |
| -sin θ  0   cos θ |
```

For θ=90°: (x, y, z) → (z, y, -x). Facing north (0,0,-1) → west (-1,0,0). Verified against the matrix.

Mirror matrices applied in local space first, then Y rotation:
- `mirror: 'none'`: (x, y, z) → (x, y, z)
- `mirror: 'x'`: negates local X relative to origin: (x, y, z) → (-x, y, z). Mirror plane is local YZ plane at X = origin.x.
- `mirror: 'z'`: negates local Z relative to origin: (x, y, z) → (x, y, -z). Mirror plane is local XY plane at Z = origin.z.

## The Lattice-Safe Map

Represent every position in half-block units (×2):
- Block cell `[x, y, z]` → cell lower corner `C = [2x, 2y, 2z]` (even triple)
- Block center = `C + [1, 1, 1]` (odd triple — half-block center lattice)
- Origin `O = [2·ox, 2·oy, 2·oz]` (integer triple; even iff origin is integral block)
- Translation `T = [2·tx, 2·ty, 2·tz]` (even triple)

The block-cell map:
```
centerHalf = 2*cell + [1,1,1]   (odd triple)
worldCenterHalf = T + R(centerHalf − O)
worldBlock = (worldCenterHalf − [1,1,1]) / 2
```

Valid iff all components of `worldCenterHalf` are odd (then worldBlock is integral).

## Functions to Define

```ts
export type Transform = {
  translation: Vec3i;   // integer block coordinates
  rotationY: 0 | 90 | 180 | 270;
  mirror: 'none' | 'x' | 'z';
};

export function localPointToWorld(placement, localPoint: Vec3d): Vec3d;
export function worldPointToLocal(placement, worldPoint: Vec3d): Vec3d;
export function localBlockToWorld(placement, localBlock: Vec3i): Vec3i;
export function worldBlockToLocal(placement, worldBlock: Vec3i): Vec3i;
export function placementWorldBounds(placement): Bounds3i;

// Doubled-integer cell map (internal helper)
export function mapCellToWorld(
  translation: Vec3i,   // T (even)
  origin: Vec3Half,     // O (must have even components for integral origin)
  rotationY: 0 | 90 | 180 | 270,
  mirror: 'none' | 'x' | 'z',
  cell: Vec3i           // C (even)
): { worldCellHalf: number[]; valid: boolean; worldBlock?: Vec3i };

export function isLatticeSafe(translation: Vec3i, origin: Vec3Half): boolean;

// Rotate in place around a pivot point; recomputes translation so blocks don't jump
export function rotateAboutPoint(
  placement, pivot: Vec3Half, rotationY: 0 | 90 | 180 | 270, mirror: 'none' | 'x' | 'z'
): { translation: Vec3i; rotationY: 0 | 90 | 180 | 270; mirror: 'none' | 'x' | 'z' };
```

## Round-Trip Invariants

1. `localBlock → worldBlock → localBlock` returns the original block exactly
2. `localPoint → worldPoint → localPoint` returns within epsilon `1e-9`
3. `placementWorldBounds` contains every transformed occupied block
4. Rotation by 90° four times returns original orientation and coordinates
5. Mirror twice returns original orientation and coordinates
6. Origin world position fixed through rotate/mirror: `localPointToWorld(p, origin) == translation`
7. Transform composition equals sequential operations

## Counterexample (fails block round-trip, correctly classified off-grid)

`translation = [10, 64, 10]` (T = [20,128,20], even), `origin = [0.5, 0, 0.5]` (O = [1, 0, 1], x,z odd), local block `[0, 0, 0]` (C = [0, 0, 0], even):
- `C − O = [−1, 0, −1]` (x,z odd)
- `worldCenterHalf = T + R(C − O) = [19, 128, 19]` (x,z odd → not valid cell lower corner, must be even)
- `worldBlock = (worldCenterHalf − [1,1,1]) / 2 = [18,127,18] / 2 = [9, 63.5, 9]` → non-integral → off-grid

So origin [0.5, 0, 0.5] with integer translation places block centers on block corners → off-grid → rejected with `ENGINE_OFF_GRID_TRANSFORM`.

## Acceptance Criteria

- [ ] `localBlock → worldBlock → localBlock` returns the original block exactly
- [ ] `localPoint → worldPoint → localPoint` returns within epsilon `1e-9`
- [ ] Counterexample `[10,64,10] / [0.5,0,0.5] / [0,0,0]` correctly classified off-grid
- [ ] Rotation by 90° four times returns original orientation and coordinates
- [ ] Mirror twice returns original orientation and coordinates
- [ ] Origin world position fixed through rotate/mirror: `localPointToWorld(p, origin) == translation`

## Tests

**File:** `packages/domain/__tests__/slice-4-transform.test.ts`

Expected-output tests:
1. Rotate 1x1x3 bar at origin [0,0,0] by 90° → block at [0,0,0] maps to [0,0,-1] (facing north → west)
2. Rotate 1x1x3 bar at origin [0,0,0] by 180° → [0,0,-1] maps to [0,0,1] (facing south)
3. Rotate 1x1x3 bar at origin [0,0,0] by 270° → [0,0,-1] maps to [1,0,0] (facing east)
4. Mirror X of bar at origin [0,0,0] facing east → facing west
5. Mirror Z of bar at origin [0,0,0] facing east → facing east
6. 2x1x2 L-shape rotated about nonzero origin [5,0,5]

Property-based tests:
7. For all combinations of translation, rotationY, mirror: round-trip localBlock → worldBlock → localBlock is identity
8. 4×90° rotation = identity
9. mirror×2 = identity

## Verification Checklist

- [ ] Change does one thing completely (transform math with center-based mapping)
- [ ] TypeScript compiles without errors
- [ ] All new tests pass
- [ ] Change committed with descriptive message
