import type { ChunkedVoxelVolume, VoxelChunk } from '../volume.ts';
import { voxelIndex, paletteIndexTypeForSize, CHUNK_SIZE } from '../volume.ts';
import { CANONICAL_AIR } from '../block-state.ts';

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string): void {
  if (condition) {
    passed++;
  } else {
    failed++;
    console.error(`FAIL: ${message}`);
  }
}

// Test 1: voxelIndex(0, 0, 0) === 0
assert(voxelIndex(0, 0, 0) === 0, 'voxelIndex(0,0,0) === 0');

// Test 2: voxelIndex(15, 15, 15) === 4095
assert(voxelIndex(15, 15, 15) === 4095, 'voxelIndex(15,15,15) === 4095');

// Test 3: voxelIndex(1, 2, 3) === (2 * 16 + 3) * 16 + 1
assert(voxelIndex(1, 2, 3) === (2 * 16 + 3) * 16 + 1, 'voxelIndex(1,2,3) formula');

// Test 4: paletteIndexTypeForSize(1) === 'Uint8Array'
assert(paletteIndexTypeForSize(1) === 'Uint8Array', 'paletteIndexTypeForSize(1) === Uint8Array');

// Test 5: paletteIndexTypeForSize(256) === 'Uint8Array'
assert(paletteIndexTypeForSize(256) === 'Uint8Array', 'paletteIndexTypeForSize(256) === Uint8Array');

// Test 6: paletteIndexTypeForSize(257) === 'Uint16Array'
assert(paletteIndexTypeForSize(257) === 'Uint16Array', 'paletteIndexTypeForSize(257) === Uint16Array');

// Test 7: paletteIndexTypeForSize(4096) === 'Uint16Array'
assert(paletteIndexTypeForSize(4096) === 'Uint16Array', 'paletteIndexTypeForSize(4096) === Uint16Array');

// Test 8: CHUNK_SIZE === 16
assert(CHUNK_SIZE === 16, 'CHUNK_SIZE === 16');

// Test 9: VoxelChunk type structure
const chunk: VoxelChunk = {
  key: '0_0_0',
  palette: [CANONICAL_AIR],
  indices: new Uint8Array(4096),
  revision: 0,
};
assert(chunk.indices.length === 4096, 'chunk indices length is 4096');
assert(chunk.palette[0] === CANONICAL_AIR, 'chunk palette[0] is CANONICAL_AIR');

// Test 10: ChunkedVoxelVolume type structure
const volume: ChunkedVoxelVolume = {
  bounds: { min: [0, 0, 0], maxExclusive: [16, 16, 16] },
  chunkSize: CHUNK_SIZE,
  chunks: new Map(),
  nonAirCount: 0,
  paletteCardinality: 0,
};
assert(volume.nonAirCount === 0, 'volume nonAirCount starts at 0');
assert(volume.chunks.size === 0, 'volume chunks starts empty');

console.log(`\nResults: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
}
