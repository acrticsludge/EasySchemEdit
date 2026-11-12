import {
  floorDiv,
  euclideanMod,
  worldToChunkCoord,
  localInChunk,
  chunkKey,
} from '../coordinates.ts';

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

// Test 1: worldToChunkCoord([-1, 0, 0]) equals [-1, 0, 0], local is [15, 0, 0]
const c1 = worldToChunkCoord([-1, 0, 0]);
const l1 = localInChunk([-1, 0, 0]);
assert(c1[0] === -1 && c1[1] === 0 && c1[2] === 0, 'worldToChunkCoord(-1,0,0) chunk = [-1,0,0]');
assert(l1[0] === 15 && l1[1] === 0 && l1[2] === 0, 'worldToChunkCoord(-1,0,0) local = [15,0,0]');

// Test 2: worldToChunkCoord([-16, 0, 0]) equals [-1, 0, 0], local is [0, 0, 0]
const c2 = worldToChunkCoord([-16, 0, 0]);
const l2 = localInChunk([-16, 0, 0]);
assert(c2[0] === -1 && c2[1] === 0 && c2[2] === 0, 'worldToChunkCoord(-16,0,0) chunk = [-1,0,0]');
assert(l2[0] === 0 && l2[1] === 0 && l2[2] === 0, 'worldToChunkCoord(-16,0,0) local = [0,0,0]');

// Test 3: worldToChunkCoord([-17, 0, 0]) equals [-2, 0, 0], local is [15, 0, 0]
const c3 = worldToChunkCoord([-17, 0, 0]);
const l3 = localInChunk([-17, 0, 0]);
assert(c3[0] === -2 && c3[1] === 0 && c3[2] === 0, 'worldToChunkCoord(-17,0,0) chunk = [-2,0,0]');
assert(l3[0] === 15 && l3[1] === 0 && l3[2] === 0, 'worldToChunkCoord(-17,0,0) local = [15,0,0]');

// Test 4: worldToChunkCoord([15, 0, 0]) equals [0, 0, 0], local is [15, 0, 0]
const c4 = worldToChunkCoord([15, 0, 0]);
const l4 = localInChunk([15, 0, 0]);
assert(c4[0] === 0 && c4[1] === 0 && c4[2] === 0, 'worldToChunkCoord(15,0,0) chunk = [0,0,0]');
assert(l4[0] === 15 && l4[1] === 0 && l4[2] === 0, 'worldToChunkCoord(15,0,0) local = [15,0,0]');

// Test 5: worldToChunkCoord([16, 0, 0]) equals [1, 0, 0], local is [0, 0, 0]
const c5 = worldToChunkCoord([16, 0, 0]);
const l5 = localInChunk([16, 0, 0]);
assert(c5[0] === 1 && c5[1] === 0 && c5[2] === 0, 'worldToChunkCoord(16,0,0) chunk = [1,0,0]');
assert(l5[0] === 0 && l5[1] === 0 && l5[2] === 0, 'worldToChunkCoord(16,0,0) local = [0,0,0]');

// Test 6: chunkKey(-1, 0, 0) === '-1_0_0'
assert(chunkKey(-1, 0, 0) === '-1_0_0', 'chunkKey(-1,0,0) === -1_0_0');

// Test 7: floorDiv negative numbers
assert(floorDiv(-1, 16) === -1, 'floorDiv(-1, 16) === -1');
assert(floorDiv(-16, 16) === -1, 'floorDiv(-16, 16) === -1');
assert(floorDiv(-17, 16) === -2, 'floorDiv(-17, 16) === -2');

// Test 8: euclideanMod negative numbers
assert(euclideanMod(-1, 16) === 15, 'euclideanMod(-1, 16) === 15');
assert(euclideanMod(-16, 16) === 0, 'euclideanMod(-16, 16) === 0');
assert(euclideanMod(-17, 16) === 15, 'euclideanMod(-17, 16) === 15');

console.log(`\nResults: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
}
