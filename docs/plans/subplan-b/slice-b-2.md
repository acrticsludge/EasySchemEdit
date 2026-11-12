# Subspec B — Slice b-2: Signed-Size Normalization (Litematic)

**Goal:** Restore signed-Size normalization as its own slice. Reversal is for negative Size (not mirroring). Linear index = x + z*ax + y*ax*az (strides x=1, z=ax, y=ax*az). Reverse each axis with that axis's own dimension.

## Files to Create

| File | Purpose |
|------|---------|
| `packages/formats/litematic-size.ts` | Signed-Size normalization + coordinate mapping |

## Signed-Size Normalization

```ts
export type RegionSize = { ax: number; ay: number; az: number };

export function normalizeRegionSize(size: RegionSize): RegionSize {
  return { ax: Math.abs(size.ax), ay: Math.abs(size.ay), az: Math.abs(size.az) };
}

export function rawToNormalizedCoord(x: number, y: number, z: number, size: RegionSize): { x: number; y: number; z: number } {
  return {
    x: size.ax < 0 ? size.ax - 1 - x : x,
    y: size.ay < 0 ? size.ay - 1 - y : y,
    z: size.az < 0 ? size.az - 1 - z : z,
  };
}

export function normalizedToWorld(nx: number, ny: number, nz: number, position: Vec3i, size: RegionSize): Vec3i {
  return {
    x: position.x + (size.ax < 0 ? size.ax - 1 - nx : nx),
    y: position.y + (size.ay < 0 ? size.ay - 1 - ny : ny),
    z: position.z + (size.az < 0 ? size.az - 1 - nz : nz),
  };
}
```

## Linear Index

`index = x + z * ax + y * ax * az` (strides x=1, z=ax, y=ax*az). Negative Size reverses along that axis using that axis's own dimension.

## Reversal (for negative Size, not mirroring)

```ts
export function reverseAxis(indices: Uint32Array, axis: 'x' | 'y' | 'z', dim: number, ax: number, az: number): void {
  const stride = axis === 'x' ? 1 : axis === 'z' ? ax : ax * az;
  const half = Math.floor(dim / 2);
  for (let i = 0; i < half; i++) {
    const j = dim - 1 - i;
    // swap entries at positions i*stride and j*stride
  }
}
```

## Acceptance Criteria

- [ ] `normalizeRegionSize` returns absolute dimensions
- [ ] `rawToNormalizedCoord` maps negative-Size raw coords to normalized
- [ ] `normalizedToWorld` maps normalized coords to world position
- [ ] Linear index = x + z*ax + y*ax*az
- [ ] Reversal uses each axis's own dimension (ax for X, ay for Y, az for Z)
- [ ] Reversal is for negative Size, not mirroring

## Tests

**File:** `packages/formats/__tests__/slice-b-2-size.test.ts`

1. `normalizeRegionSize({ax:-5, ay:3, az:-2})` → `{ax:5, ay:3, az:2}`
2. `rawToNormalizedCoord` with negative ax reverses X using ax
3. `rawToNormalizedCoord` with negative az reverses Z using az
4. `normalizedToWorld` with negative ay reverses Y using ay
5. Non-cubic region 3x5x2: hand-computed expected coordinates after reversal
6. Block entities/entities/ticks consistent with reversal (positions transformed)

## Verification Checklist

- [ ] Change does one thing completely (signed-Size normalization)
- [ ] TypeScript compiles without errors
- [ ] All new tests pass
- [ ] Change committed with descriptive message
