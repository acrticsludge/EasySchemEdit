# Subspec A — Slice 3: Negative-Coordinate Chunk Mapping

**Goal:** Implement floor division and euclidean modulo for mapping world block coordinates to chunk coordinates, supporting negative coordinates correctly.

## Files to Create/Modify

| File | Purpose |
|------|---------|
| `packages/domain/coordinates.ts` | Chunk coordinate mapping functions |

## Functions to Define

```ts
export function floorDiv(a: number, b: number): number {
  return Math.floor(a / b);
}

export function euclideanMod(a: number, b: number): number {
  return ((a % b) + b) % b;
}

export function worldToChunkCoord(worldBlock: Vec3i): ChunkCoord {
  return [floorDiv(worldBlock[0], 16), floorDiv(worldBlock[1], 16), floorDiv(worldBlock[2], 16)];
}

export function localInChunk(worldBlock: Vec3i): Vec3i {
  return [euclideanMod(worldBlock[0], 16), euclideanMod(worldBlock[1], 16), euclideanMod(worldBlock[2], 16)];
}

export function chunkKey(cx: number, cy: number, cz: number): string {
  return `${cx}_${cy}_${cz}`;
}
```

## Acceptance Criteria

- [ ] Negative-coordinate floor division: `-1` → chunk `-1`, local `15`
- [ ] `-16` → chunk `-1`, local `0`
- [ ] `-17` → chunk `-2`, local `15`
- [ ] Positive: `15` → chunk `0`, local `15`; `16` → chunk `1`, local `0`

## Tests

**File:** `packages/domain/__tests__/slice-3-chunk-mapping.test.ts`

1. `worldToChunkCoord([-1, 0, 0])` equals `[-1, 0, 0]`, local is `[15, 0, 0]`
2. `worldToChunkCoord([-16, 0, 0])` equals `[-1, 0, 0]`, local is `[0, 0, 0]`
3. `worldToChunkCoord([-17, 0, 0])` equals `[-2, 0, 0]`, local is `[15, 0, 0]`
4. `worldToChunkCoord([15, 0, 0])` equals `[0, 0, 0]`, local is `[15, 0, 0]`
5. `worldToChunkCoord([16, 0, 0])` equals `[1, 0, 0]`, local is `[0, 0, 0]`
6. `chunkKey(-1, 0, 0) === '-1_0_0'`

## Verification Checklist

- [ ] Change does one thing completely (floor division + euclidean mod)
- [ ] TypeScript compiles without errors
- [ ] All new tests pass
- [ ] Change committed with descriptive message
