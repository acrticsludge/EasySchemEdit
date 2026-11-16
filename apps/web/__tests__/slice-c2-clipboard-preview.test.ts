// apps/web/__tests__/slice-c2-clipboard-preview.test.ts
// Unit tests for Isometric Thumbnail Preview Generator and Clipboard Drawer helpers (Slice C2).

import type { Bounds3i, ChunkedVoxelVolume, VoxelChunk } from '@easyschemedit/domain';
import type { ClipboardEntry } from '@easyschemedit/operations';
import {
  renderClipboardPreviewDataUrl,
  getBlockRgb,
  getClipboardDimensions,
  getClipboardBlockCount,
  extractSampledBlocks,
  isAirLikeBlockId,
  KNOWN_BLOCK_COLORS,
} from '../src/editor/viewport/clipboard-preview.ts';

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`Assertion failed: ${message}. Expected ${expected}, got ${actual}`);
  }
}

console.log('=== Running Slice C2: Clipboard Preview & Helpers Tests ===\n');

// ----------------------------------------------------------------------------
// Test 1: renderClipboardPreviewDataUrl returns null safely in Node (no document)
// ----------------------------------------------------------------------------
console.log('--- Test 1: Safe non-browser execution (Node.js) ---');

const dummyEntry: ClipboardEntry = {
  id: 'clip-1',
  createdAt: Date.now(),
  sourceProjectId: 'proj-1',
  scope: 'effective-composite',
  data: {
    blocks: [
      { localPos: [0, 0, 0], state: { id: 'minecraft:stone', props: {} } },
      { localPos: [1, 0, 0], state: { id: 'minecraft:dirt', props: {} } },
      { localPos: [0, 1, 0], state: { id: 'minecraft:grass_block', props: {} } },
    ],
    blockEntities: new Map(),
    entities: [],
    biomes: undefined,
    anchor: [0, 0, 0],
    bounds: { min: [0, 0, 0], maxExclusive: [2, 2, 1] },
  },
};

const resultNode = renderClipboardPreviewDataUrl(dummyEntry, 64);
assertEqual(resultNode, null, 'renderClipboardPreviewDataUrl returns null in Node without throwing');

// Edge cases
assertEqual(renderClipboardPreviewDataUrl(null as any), null, 'null entry returns null');
assertEqual(renderClipboardPreviewDataUrl({} as any), null, 'empty object returns null');

console.log('  ✓ Node.js environment safety verified (returned null without throwing)\n');

// ----------------------------------------------------------------------------
// Test 2: isAirLikeBlockId
// ----------------------------------------------------------------------------
console.log('--- Test 2: isAirLikeBlockId ---');

assertEqual(isAirLikeBlockId('minecraft:air'), true, 'minecraft:air is air');
assertEqual(isAirLikeBlockId('minecraft:cave_air'), true, 'cave_air is air');
assertEqual(isAirLikeBlockId('minecraft:void_air'), true, 'void_air is air');
assertEqual(isAirLikeBlockId('air'), true, 'short air is air');
assertEqual(isAirLikeBlockId(''), true, 'empty string treated as air');
assertEqual(isAirLikeBlockId(null), true, 'null is treated as air');
assertEqual(isAirLikeBlockId(undefined), true, 'undefined is treated as air');
assertEqual(isAirLikeBlockId('minecraft:stone'), false, 'minecraft:stone is not air');
assertEqual(isAirLikeBlockId('minecraft:dirt'), false, 'minecraft:dirt is not air');

console.log('  ✓ isAirLikeBlockId checks passed\n');

// ----------------------------------------------------------------------------
// Test 3: getBlockRgb - deterministic colors & fallbacks
// ----------------------------------------------------------------------------
console.log('--- Test 3: getBlockRgb Color Resolver ---');

// Known blocks
const stoneColor = getBlockRgb('minecraft:stone');
assertEqual(stoneColor[0], KNOWN_BLOCK_COLORS['minecraft:stone']![0], 'stone red');
assertEqual(stoneColor[1], KNOWN_BLOCK_COLORS['minecraft:stone']![1], 'stone green');
assertEqual(stoneColor[2], KNOWN_BLOCK_COLORS['minecraft:stone']![2], 'stone blue');

// Strip block properties
const logWithProps = getBlockRgb('minecraft:oak_log[axis=y]');
const logWithoutProps = getBlockRgb('minecraft:oak_log');
assertEqual(logWithProps[0], logWithoutProps[0], 'properties stripped - red');
assertEqual(logWithProps[1], logWithoutProps[1], 'properties stripped - green');
assertEqual(logWithProps[2], logWithoutProps[2], 'properties stripped - blue');

// Short name without namespace
const diamondShort = getBlockRgb('diamond_block');
const diamondFull = getBlockRgb('minecraft:diamond_block');
assertEqual(diamondShort[0], diamondFull[0], 'short name resolves same color - red');

// Deterministic hash fallback for custom or modded blocks
const modBlock1 = getBlockRgb('mod:magic_crystal');
const modBlock2 = getBlockRgb('mod:magic_crystal');
assertEqual(modBlock1[0], modBlock2[0], 'hash fallback is deterministic - red');
assertEqual(modBlock1[1], modBlock2[1], 'hash fallback is deterministic - green');
assertEqual(modBlock1[2], modBlock2[2], 'hash fallback is deterministic - blue');

// Verify valid RGB bounds [0, 255]
for (const comp of modBlock1) {
  assert(comp >= 0 && comp <= 255, `RGB component in valid range: ${comp}`);
}

console.log('  ✓ getBlockRgb deterministic colors passed\n');

// ----------------------------------------------------------------------------
// Test 4: getClipboardDimensions
// ----------------------------------------------------------------------------
console.log('--- Test 4: getClipboardDimensions ---');

// Case A: From bounds
const entryWithBounds: ClipboardEntry = {
  id: 'clip-bounds',
  createdAt: 1000,
  sourceProjectId: 'p',
  scope: 'effective-composite',
  data: {
    blocks: [],
    blockEntities: new Map(),
    entities: [],
    biomes: undefined,
    anchor: [10, 20, 30],
    bounds: { min: [10, 20, 30], maxExclusive: [25, 30, 45] },
  },
};
const dimsA = getClipboardDimensions(entryWithBounds);
assertEqual(dimsA.width, 15, 'width: 25 - 10 = 15');
assertEqual(dimsA.height, 10, 'height: 30 - 20 = 10');
assertEqual(dimsA.depth, 15, 'depth: 45 - 30 = 15');

// Case B: Inferred from blocks when bounds are 0
const entryWithInferredBlocks: ClipboardEntry = {
  id: 'clip-inferred',
  createdAt: 2000,
  sourceProjectId: 'p',
  scope: 'source-placement',
  data: {
    blocks: [
      { localPos: [5, 10, 2], state: { id: 'minecraft:stone', props: {} } },
      { localPos: [8, 12, 6], state: { id: 'minecraft:dirt', props: {} } },
    ],
    blockEntities: new Map(),
    entities: [],
    biomes: undefined,
    anchor: [0, 0, 0],
    bounds: { min: [0, 0, 0], maxExclusive: [0, 0, 0] },
  },
};
const dimsB = getClipboardDimensions(entryWithInferredBlocks);
assertEqual(dimsB.width, 4, 'width: 8 - 5 + 1 = 4');
assertEqual(dimsB.height, 3, 'height: 12 - 10 + 1 = 3');
assertEqual(dimsB.depth, 5, 'depth: 6 - 2 + 1 = 5');

console.log('  ✓ getClipboardDimensions calculations passed\n');

// ----------------------------------------------------------------------------
// Test 5: getClipboardBlockCount
// ----------------------------------------------------------------------------
console.log('--- Test 5: getClipboardBlockCount ---');

const entryWithAirAndSolid: ClipboardEntry = {
  id: 'clip-count',
  createdAt: 3000,
  sourceProjectId: 'p',
  scope: 'effective-composite',
  data: {
    blocks: [
      { localPos: [0, 0, 0], state: { id: 'minecraft:stone', props: {} } },
      { localPos: [1, 0, 0], state: { id: 'minecraft:air', props: {} } }, // air
      { localPos: [2, 0, 0], state: { id: 'minecraft:dirt', props: {} } },
      { localPos: [3, 0, 0], state: { id: 'minecraft:cave_air', props: {} } }, // air
      { localPos: [4, 0, 0], state: { id: 'minecraft:oak_planks', props: {} } },
    ],
    blockEntities: new Map(),
    entities: [],
    biomes: undefined,
    anchor: [0, 0, 0],
    bounds: { min: [0, 0, 0], maxExclusive: [5, 1, 1] },
  },
};
const solidCount = getClipboardBlockCount(entryWithAirAndSolid);
assertEqual(solidCount, 3, 'Air blocks excluded, 3 solid blocks counted');

// With volume nonAirCount
const volumeWithCount: ChunkedVoxelVolume = {
  bounds: { min: [0, 0, 0], maxExclusive: [16, 16, 16] },
  chunkSize: 16,
  chunks: new Map(),
  nonAirCount: 42,
  paletteCardinality: 2,
};
const entryWithVolume: ClipboardEntry = {
  ...dummyEntry,
  data: {
    ...dummyEntry.data,
    volume: volumeWithCount,
  } as any,
};
assertEqual(getClipboardBlockCount(entryWithVolume), 42, 'Reads nonAirCount from volume');

console.log('  ✓ getClipboardBlockCount calculations passed\n');

// ----------------------------------------------------------------------------
// Test 6: extractSampledBlocks & Striding for large data
// ----------------------------------------------------------------------------
console.log('--- Test 6: extractSampledBlocks & Performance Striding ---');

// Large blocks dataset: 5,000 blocks
const largeBlocks = [];
for (let i = 0; i < 5000; i++) {
  largeBlocks.push({
    localPos: [i % 50, Math.floor(i / 50) % 20, Math.floor(i / 1000)] as [number, number, number],
    state: { id: i % 2 === 0 ? 'minecraft:stone' : 'minecraft:dirt', props: {} },
  });
}

const largeEntry: ClipboardEntry = {
  id: 'clip-large',
  createdAt: 4000,
  sourceProjectId: 'p',
  scope: 'effective-composite',
  data: {
    blocks: largeBlocks,
    blockEntities: new Map(),
    entities: [],
    biomes: undefined,
    anchor: [0, 0, 0],
    bounds: { min: [0, 0, 0], maxExclusive: [50, 20, 5] },
  },
};

const startTime = performance.now();
const sampledLarge = extractSampledBlocks(largeEntry, 1000);
const duration = performance.now() - startTime;

assert(sampledLarge.length > 0, 'Extracted sampled blocks');
assert(sampledLarge.length <= 1000, `Strided samples stay under limit: ${sampledLarge.length} <= 1000`);
assert(duration < 20, `Striding extraction was fast: ${duration.toFixed(2)}ms < 20ms`);

// Test volume chunk sampling
const chunkIndices = new Uint8Array(4096);
chunkIndices[0] = 1; // [0, 0, 0] = stone
chunkIndices[1] = 2; // [1, 0, 0] = dirt
const sampleChunk: VoxelChunk = {
  key: '0_0_0',
  palette: [{ id: 'minecraft:air', props: {} }, { id: 'minecraft:stone', props: {} }, { id: 'minecraft:dirt', props: {} }],
  indices: chunkIndices,
  revision: 1,
};
const chunkVolume: ChunkedVoxelVolume = {
  bounds: { min: [0, 0, 0], maxExclusive: [16, 16, 16] },
  chunkSize: 16,
  chunks: new Map([['0_0_0', sampleChunk]]),
  nonAirCount: 2,
  paletteCardinality: 3,
};
const volumeEntry: ClipboardEntry = {
  id: 'clip-vol',
  createdAt: 5000,
  sourceProjectId: 'p',
  scope: 'effective-composite',
  data: {
    blocks: [],
    blockEntities: new Map(),
    entities: [],
    biomes: undefined,
    anchor: [0, 0, 0],
    bounds: { min: [0, 0, 0], maxExclusive: [16, 16, 16] },
    volume: chunkVolume,
  } as any,
};

const sampledFromVol = extractSampledBlocks(volumeEntry);
assertEqual(sampledFromVol.length, 2, '2 non-air voxels sampled from volume chunk');
assertEqual(sampledFromVol[0]?.blockId, 'minecraft:stone', 'First voxel stone');
assertEqual(sampledFromVol[1]?.blockId, 'minecraft:dirt', 'Second voxel dirt');

console.log('  ✓ extractSampledBlocks & performance striding passed\n');

// ----------------------------------------------------------------------------
// Test 7: Isometric interior culling and exposed face flags
// ----------------------------------------------------------------------------
console.log('--- Test 7: Isometric interior culling and exposed faces ---');

// Build a 3x3x3 solid cube (27 blocks)
const cubeBlocks = [];
for (let x = 0; x < 3; x++) {
  for (let y = 0; y < 3; y++) {
    for (let z = 0; z < 3; z++) {
      cubeBlocks.push({
        localPos: [x, y, z] as [number, number, number],
        state: { id: 'minecraft:stone', props: {} },
      });
    }
  }
}

const cubeEntry: ClipboardEntry = {
  id: 'clip-cube',
  createdAt: 6000,
  sourceProjectId: 'p',
  scope: 'effective-composite',
  data: {
    blocks: cubeBlocks,
    blockEntities: new Map(),
    entities: [],
    biomes: undefined,
    anchor: [0, 0, 0],
    bounds: { min: [0, 0, 0], maxExclusive: [3, 3, 3] },
  },
};

const sampledCube = extractSampledBlocks(cubeEntry);
// In a 3x3x3 cube, blocks with (+X, +Y, +Z) occupied are culled:
// Center block (1, 1, 1) has (2,1,1), (1,2,1), (1,1,2) occupied -> MUST be culled.
const centerBlock = sampledCube.find((b) => b.x === 1 && b.y === 1 && b.z === 1);
assertEqual(centerBlock, undefined, 'Interior center block (1,1,1) is culled');

// Corner block (2, 2, 2) has exposed +X, +Y, +Z faces -> MUST be present with all exposed
const frontCorner = sampledCube.find((b) => b.x === 2 && b.y === 2 && b.z === 2);
assert(frontCorner !== undefined, 'Corner block (2,2,2) is preserved');
assertEqual(frontCorner?.topExposed, true, 'Corner top face exposed');
assertEqual(frontCorner?.rightExposed, true, 'Corner right face exposed');
assertEqual(frontCorner?.leftExposed, true, 'Corner left face exposed');

// Total visible blocks in 3x3x3 is less than 27 due to culling
assert(sampledCube.length < 27, `Interior blocks culled (${sampledCube.length} < 27)`);

console.log('  ✓ Isometric interior culling verified\n');

console.log('All Slice C2 Clipboard Preview and Helper tests passed successfully!');
