# Subspec A — Slice 2.5: Volume API

**Goal:** Define the volume read/write API: `getBlock`, `setBlock`, `fill`, `iterateNonAir`, palette add/compact, `nonAirCount` maintenance, auto-omit all-air chunks, auto-create chunks on write, canonical palette key.

## Files to Create/Modify

| File | Purpose |
|------|---------|
| `packages/domain/volume-api.ts` | Volume read/write API |

## Functions to Define

```ts
export type BlockAccess = {
  // Read a block state at a local block coordinate
  getBlock(volume: ChunkedVoxelVolume, localBlock: Vec3i): BlockStateId;
  // Write a block state at a local block coordinate (auto-creates chunk if needed)
  setBlock(volume: ChunkedVoxelVolume, localBlock: Vec3i, state: BlockStateId): void;
  // Fill a cuboid region with a block state
  fill(volume: ChunkedVoxelVolume, bounds: Bounds3i, state: BlockStateId): void;
  // Iterate over all non-air blocks in the volume
  iterateNonAir(volume: ChunkedVoxelVolume, fn: (localBlock: Vec3i, state: BlockStateId) => void): void;
  // Add a block state to a chunk's palette, return its index
  addToPalette(volume: ChunkedVoxelVolume, chunkKey: string, state: BlockStateId): number;
  // Compact palette (remove unused entries, reindex)
  compactPalette(volume: ChunkedVoxelVolume, chunkKey: string): void;
};
```

## Key Behaviors

- **Auto-create chunks on write:** `setBlock` auto-creates a chunk if the target chunk doesn't exist
- **Auto-omit all-air chunks:** When a chunk becomes all air (all indices = 0), it is removed from `chunks`
- **Canonical palette key:** Each `BlockStateId` has a canonical string key for palette lookup (id + sorted props)
- **`nonAirCount` maintenance:** Incremented/decremented as blocks are set/cleared; excludes air-like blocks per registry

## Acceptance Criteria

- [ ] `getBlock` returns `CANONICAL_AIR` for missing chunks
- [ ] `setBlock` auto-creates chunks as needed
- [ ] `fill` writes all cells in bounds, including air cells within bounds
- [ ] `iterateNonAir` skips air cells
- [ ] `nonAirCount` is accurate after any sequence of set/fill operations
- [ ] Per-chunk palette max 4096 entries (enforced here or in slice 9)

## Tests

**File:** `packages/domain/__tests__/slice-2.5-volume-api.test.ts`

1. `getBlock` on empty volume returns `CANONICAL_AIR`
2. `setBlock` then `getBlock` returns the same state
3. `fill` then `iterateNonAir` visits all filled blocks
4. `nonAirCount` is correct after fill and clear operations
5. Chunk is omitted from `chunks` map when all air

## Verification Checklist

- [ ] Change does one thing completely (volume API)
- [ ] TypeScript compiles without errors
- [ ] All new tests pass
- [ ] Change committed with descriptive message
