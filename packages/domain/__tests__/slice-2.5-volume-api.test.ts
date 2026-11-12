import type { ChunkedVoxelVolume } from '../volume.ts';
import {
  getBlock,
  setBlock,
  fill,
  iterateNonAir,
  addToPalette,
  compactPalette,
} from '../volume-api.ts';
import { CHUNK_SIZE } from '../volume.ts';
import { blockStateId, CANONICAL_AIR } from '../block-state.ts';

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

function makeVolume(): ChunkedVoxelVolume {
  return {
    bounds: { min: [0, 0, 0], maxExclusive: [16, 16, 16] },
    chunkSize: CHUNK_SIZE,
    chunks: new Map(),
    nonAirCount: 0,
    paletteCardinality: 0,
  };
}

// Test 1: getBlock on empty volume returns CANONICAL_AIR
const vol1 = makeVolume();
assert(
  blockStateId(CANONICAL_AIR.id).id === getBlock(vol1, [0, 0, 0]).id,
  'getBlock on empty volume returns CANONICAL_AIR',
);

// Test 2: setBlock then getBlock returns the same state
const vol2 = makeVolume();
const stone = blockStateId('minecraft:stone');
setBlock(vol2, [5, 5, 5], stone);
const retrieved = getBlock(vol2, [5, 5, 5]);
assert(retrieved.id === stone.id, 'setBlock then getBlock returns same state');

// Test 3: fill then iterateNonAir visits all filled blocks
const vol3 = makeVolume();
const dirt = blockStateId('minecraft:dirt');
fill(vol3, { min: [0, 0, 0], maxExclusive: [2, 2, 2] }, dirt);
let count = 0;
iterateNonAir(vol3, () => {
  count++;
});
assert(count === 8, 'fill then iterateNonAir visits 8 blocks (2x2x2)');

// Test 4: nonAirCount is correct after fill
const vol4 = makeVolume();
fill(vol4, { min: [0, 0, 0], maxExclusive: [3, 3, 3] }, dirt);
assert(vol4.nonAirCount === 27, 'nonAirCount is 27 after filling 3x3x3');

// Test 5: nonAirCount correct after clearing with air
const vol5 = makeVolume();
fill(vol5, { min: [0, 0, 0], maxExclusive: [2, 2, 2] }, dirt);
assert(vol5.nonAirCount === 8, 'nonAirCount is 8 after fill');
fill(vol5, { min: [0, 0, 0], maxExclusive: [2, 2, 2] }, CANONICAL_AIR);
assert(vol5.nonAirCount === 0, 'nonAirCount is 0 after filling with air');

// Test 6: Chunk is omitted from chunks map when all air
const vol6 = makeVolume();
setBlock(vol6, [0, 0, 0], dirt);
assert(vol6.chunks.size === 1, 'chunk created after setBlock');
setBlock(vol6, [0, 0, 0], CANONICAL_AIR);
assert(vol6.chunks.size === 0, 'chunk removed when all air');

// Test 7: addToPalette adds block state to palette
const vol7 = makeVolume();
const chunkCoord = [0, 0, 0];
const chunkKey = `${chunkCoord[0]}_${chunkCoord[1]}_${chunkCoord[2]}`;
setBlock(vol7, [0, 0, 0], stone);
const idx = addToPalette(vol7, chunkKey, blockStateId('minecraft:oak_log'));
assert(idx === 2, 'addToPalette returns index 2 for oak_log (after air at 0, stone at 1)');

// Test 8: compactPalette removes unused entries
const vol8 = makeVolume();
setBlock(vol8, [0, 0, 0], stone);
setBlock(vol8, [1, 0, 0], dirt);
const chunkKey8 = '0_0_0';
// Add an unused state
const unusedIdx = addToPalette(vol8, chunkKey8, blockStateId('minecraft:oak_log'));
assert(unusedIdx === 3, 'unused state added at index 3');
compactPalette(vol8, chunkKey8);
const chunk8 = vol8.chunks.get(chunkKey8);
assert(chunk8!.palette.length === 3, 'compactPalette removes unused entries (3 remain: air, stone, dirt)');

console.log(`\nResults: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
}
