# Subspec A — Slice 2: Chunk/Volume Storage

**Goal:** Define `VoxelChunk`, `ChunkedVoxelVolume`, the voxel indexing formula, and palette index array selection.

## Files to Create/Modify

| File | Purpose |
|------|---------|
| `packages/domain/volume.ts` | Chunk and volume storage types |

## Types to Define

```ts
export type VoxelChunk = {
  key: string;                               // signed chunk coordinate key, e.g. "2_-1_0"
  palette: BlockStateId[];                   // index 0 is canonical air; max 4096 entries per chunk
  indices: Uint8Array | Uint16Array;         // fixed CHUNK_SIZE^3 entries (Uint32 not used for chunks)
  revision: number;                          // chunk-level revision for invalidation
};

export type ChunkedVoxelVolume = {
  bounds: Bounds3i;
  chunkSize: typeof CHUNK_SIZE;
  chunks: Map<string, VoxelChunk>;
  nonAirCount: number;
  paletteCardinality: number;
};

export const CHUNK_SIZE = 16;

// Voxel indexing formula: index = (cy * CHUNK_SIZE + cz) * CHUNK_SIZE + cx
export function voxelIndex(cx: number, cy: number, cz: number): number {
  return (cy * CHUNK_SIZE + cz) * CHUNK_SIZE + cx;
}

export function paletteIndexTypeForSize(paletteSize: number): 'Uint8Array' | 'Uint16Array' {
  if (paletteSize <= 256) return 'Uint8Array';
  return 'Uint16Array'; // per-chunk max is 4096 entries; Uint32 not used for chunks
}
```

## Acceptance Criteria

- [ ] Voxel index formula: `index = (cy * 16 + cz) * 16 + cx`
- [ ] Index array length exactly 4096 per chunk
- [ ] Palette index array type follows A6 thresholds (1–256 Uint8, 257–4096 Uint16)
- [ ] Index 0 reserved for `CANONICAL_AIR`
- [ ] All-air chunks omitted from `Map` (enforced in slice 8)

## Tests

**File:** `packages/domain/__tests__/slice-2-volume.test.ts`

1. `voxelIndex(0, 0, 0) === 0`
2. `voxelIndex(15, 15, 15) === 4095`
3. `voxelIndex(1, 2, 3) === (2 * 16 + 3) * 16 + 1`
4. `paletteIndexTypeForSize(1) === 'Uint8Array'`
5. `paletteIndexTypeForSize(256) === 'Uint8Array'`
6. `paletteIndexTypeForSize(257) === 'Uint16Array'`
7. `paletteIndexTypeForSize(4096) === 'Uint16Array'`

## Verification Checklist

- [ ] Change does one thing completely (chunk/volume types + indexing formula)
- [ ] TypeScript compiles without errors
- [ ] All new tests pass
- [ ] Change committed with descriptive message
