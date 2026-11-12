# Subspec B — Slice b-4: Negative Size Normalization

**Goal:** Implement negative Litematic region Size normalization via signed-axis mapping per SUBSPEC-B §5.3. Keep normalized local indices separate from original region world positions.

## Files to Create/Modify

| File | Purpose |
|------|---------|
| `packages/formats/litematic-negative-size.ts` | Negative Size normalization |

## Functions to Define

```ts
export type RegionBounds = {
  min: Vec3i;        // local normalized bounds, min inclusive
  maxExclusive: Vec3i; // local normalized bounds, maxExclusive exclusive
  size: Vec3i;       // absolute dimensions [ax, ay, az]
};

export function normalizeRegionSize(
  position: Vec3i,     // region Position P = [px, py, pz]
  size: Vec3i,         // signed Size S = [sx, sy, sz]
): RegionBounds;

export function rawToNormalizedCoord(
  rawCoord: Vec3i,     // coordinates in raw storage frame
  size: Vec3i,         // signed Size S
): Vec3i;              // normalized local coordinate in [0, dimension)

export function normalizedToWorld(
  normalizedCoord: Vec3i,
  boundsMin: Vec3i,    // bounds.min = world-space min corner
): Vec3i;              // world-space position = bounds.min + coord
```

## Normalization Steps

**Step 1 — Absolute dimensions:**
`ax = |sx|, ay = |sy|, az = |sz|`. If any axis is 0 → `IMPORT_REGION_INVALID` (zero-volume region).

**Step 2 — Normalized min corner (signed-axis mapping):**
For each axis `a`:
- If `S[a] >= 0`: `min[a] = P[a]`
- If `S[a] < 0`: `min[a] = P[a] + S[a] + 1` (e.g. P=5, S=-3 → min = 3)

**Step 3 — Normalized bounds:**
`bounds.min = [min.x, min.y, min.z]`, `bounds.maxExclusive = [min.x + ax, min.y + ay, min.z + az]`

**Step 4 — Raw → normalized local coordinate:**
`linearIndex = x' + z' * ax + y' * ax * az` (raw storage order).
For each axis `a`:
- If `S[a] >= 0`: `coord[a] = raw[a]`
- If `S[a] < 0`: `coord[a] = ax - 1 - raw[a]` (index reversal)

**Critical:** `coord` is already a local index in `[0, dimension)`. **Do NOT subtract `bounds.min` from `coord`** — `bounds.min` is a world-space position, `coord` is already a local index. Subtracting mixes frames and corrupts local coordinates.

**Step 5 — Block entity/entity/tick transforms:**
Same axis reversal applied to each component. Block entity position → normalized local position. Entity position (fractional) → normalized local fractional position. Tick position → normalized local position. Do not subtract bounds.min.

**Step 6 — Relative position within Import Group:**
Placement `transform.translation = bounds.min` (world position of normalized min corner). Relative region positions preserved as world offsets. Placement local volume stays normalized: `volume.bounds.min = [0,0,0]`, `volume.bounds.maxExclusive = [ax, ay, az]`.

## Acceptance Criteria

- [ ] Zero-size region (any axis 0) → `IMPORT_REGION_INVALID`
- [ ] Negative size normalized via signed-axis mapping
- [ ] Axis reversal applied correctly for negative size components
- [ ] Normalized local indices kept separate from world-space bounds.min
- [ ] Block entity/entity/tick positions transformed consistently with axis reversal
- [ ] Placement translation = bounds.min (world position of normalized min corner)

## Tests

**File:** `packages/formats/__tests__/slice-b-4-negative-size.test.ts`

1. Zero-size region → `IMPORT_REGION_INVALID`
2. Negative sx: P=5, S=-3 → min=3, ax=3, bounds [3,6)
3. Negative sy: axis reversal applied
4. Negative sz: axis reversal applied
5. Raw → normalized coordinate mapping correct for negative axis
6. Normalized coord NOT subtracted by bounds.min
7. Block entity position transformed consistently
8. Placement translation = bounds.min

## Verification Checklist

- [ ] Change does one thing completely (negative size normalization)
- [ ] TypeScript compiles without errors
- [ ] All new tests pass
- [ ] Change committed with descriptive message
