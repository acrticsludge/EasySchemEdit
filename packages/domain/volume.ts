import type { BlockStateId } from './block-state.ts';
import type { Bounds3i } from './types.ts';
import { CHUNK_SIZE } from './types.ts';

export type VoxelChunk = {
  key: string;                               // signed chunk coordinate key, e.g. "2_-1_0"
  palette: BlockStateId[];                   // index 0 is canonical air; max 4096 entries per chunk
  indices: Uint8Array | Uint16Array;         // fixed CHUNK_SIZE^3 entries (Uint32 not used for chunks)
  revision: number;                          // chunk-level revision for invalidation
};

export type ChunkedVoxelVolume = {
  bounds: Bounds3i;                          // local normalized bounds, min inclusive, maxExclusive exclusive
  chunkSize: typeof CHUNK_SIZE;
  chunks: Map<string, VoxelChunk>;           // all-air chunks omitted
  nonAirCount: number;                       // non-owning air-like blocks excluded
  paletteCardinality: number;                // total unique block states across chunks
};

// Voxel indexing formula: index = (cy * CHUNK_SIZE + cz) * CHUNK_SIZE + cx
export function voxelIndex(cx: number, cy: number, cz: number): number {
  return (cy * CHUNK_SIZE + cz) * CHUNK_SIZE + cx;
}

export function paletteIndexTypeForSize(paletteSize: number): 'Uint8Array' | 'Uint16Array' {
  if (paletteSize <= 256) return 'Uint8Array';
  return 'Uint16Array'; // per-chunk max is 4096 entries; Uint32 not used for chunks
}

export { CHUNK_SIZE } from './types.ts';
