// packages/renderer/__tests__/grass-block-overlay.test.ts
// Regression tests for grass_block multi-element side & overlay rendering passes and tinting.
// Verifies:
// 1. grass_block_side (base) goes to opaque pass with untinted [1, 1, 1] vertex color.
// 2. grass_block_side_overlay goes to cutout pass with grass green tint (< 1, 1, 1).
// 3. grass_block_top goes to opaque pass with grass green tint (< 1, 1, 1).
// 4. Works correctly whether getTextureUv is omitted, returns hasAlpha: 'none', or returns hasAlpha: 'binary'.
// 5. isOpaqueFullCube recognizes grass_block with overlay elements as an opaque full cube.

import {
  meshChunk,
  isOpaqueFullCube,
  type ChunkMeshInput,
  type TextureUvInfo,
} from '../src/chunk-mesher.ts';
import type {
  AssetSource,
  RawBlockStateDefinition,
  RawBlockModel,
} from '../src/model-resolver.ts';
import { DEFAULT_PLAINS_GRASS_TINT } from '../src/tints.ts';

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

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual === expected) {
    passed++;
  } else {
    failed++;
    console.error(`FAIL: ${message} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function assertApprox(actual: number, expected: number, message: string, epsilon = 0.005): void {
  if (Math.abs(actual - expected) <= epsilon) {
    passed++;
  } else {
    failed++;
    console.error(`FAIL: ${message} — expected ~${expected}, got ${actual}`);
  }
}

class MockAssetSource implements AssetSource {
  public blockStates = new Map<string, RawBlockStateDefinition>();
  public models = new Map<string, RawBlockModel>();

  getBlockState(id: string): RawBlockStateDefinition | undefined {
    return this.blockStates.get(id);
  }

  getModel(resourceLocation: string): RawBlockModel | undefined {
    return this.models.get(resourceLocation);
  }
}

console.log('=== Grass Block Overlay & Pass Separation Tests ===');

const assets = new MockAssetSource();

// Vanilla 1.21-style grass_block: 2 elements (base cube + 4-face side overlay)
assets.blockStates.set('minecraft:grass_block', {
  variants: {
    'snowy=false': { model: 'minecraft:block/grass_block' },
  },
});

assets.models.set('minecraft:block/grass_block', {
  elements: [
    {
      from: [0, 0, 0],
      to: [16, 16, 16],
      faces: {
        down: { texture: 'minecraft:block/dirt', cullface: 'down' },
        up: { texture: 'minecraft:block/grass_block_top', cullface: 'up', tintindex: 0 },
        north: { texture: 'minecraft:block/grass_block_side', cullface: 'north' },
        south: { texture: 'minecraft:block/grass_block_side', cullface: 'south' },
        west: { texture: 'minecraft:block/grass_block_side', cullface: 'west' },
        east: { texture: 'minecraft:block/grass_block_side', cullface: 'east' },
      },
    },
    {
      from: [0, 0, 0],
      to: [16, 16, 16],
      faces: {
        north: { texture: 'minecraft:block/grass_block_side_overlay', cullface: 'north', tintindex: 0 },
        south: { texture: 'minecraft:block/grass_block_side_overlay', cullface: 'south', tintindex: 0 },
        west: { texture: 'minecraft:block/grass_block_side_overlay', cullface: 'west', tintindex: 0 },
        east: { texture: 'minecraft:block/grass_block_side_overlay', cullface: 'east', tintindex: 0 },
      },
    },
  ],
});

// Stone model for face culling test
assets.blockStates.set('minecraft:stone', {
  variants: { '': { model: 'minecraft:block/stone' } },
});
assets.models.set('minecraft:block/stone', {
  elements: [
    {
      from: [0, 0, 0],
      to: [16, 16, 16],
      faces: {
        down: { texture: 'minecraft:block/stone', cullface: 'down' },
        up: { texture: 'minecraft:block/stone', cullface: 'up' },
        north: { texture: 'minecraft:block/stone', cullface: 'north' },
        south: { texture: 'minecraft:block/stone', cullface: 'south' },
        west: { texture: 'minecraft:block/stone', cullface: 'west' },
        east: { texture: 'minecraft:block/stone', cullface: 'east' },
      },
    },
  ],
});

// Test 1: Full cube detection for 2-element grass_block
console.log('--- Test 1: isOpaqueFullCube with Overlay Element ---');
{
  const isFull = isOpaqueFullCube('minecraft:grass_block[snowy=false]', assets);
  assert(isFull, 'grass_block with overlay elements is recognized as an opaque full cube');
}

// Test 2: Pass separation & vertex colors with fallback UV lookup (hasAlpha: 'none')
console.log('--- Test 2: Fallback UV Lookup (hasAlpha: "none") ---');
{
  const output = meshChunk({
    chunkKey: '0_0_0',
    assets,
    getBlock: (lx, ly, lz) => {
      if (lx === 0 && ly === 0 && lz === 0) {
        return { name: 'minecraft:grass_block', properties: { snowy: 'false' } };
      }
      return null;
    },
    getTextureUv: () => ({
      u0: 0,
      v0: 0,
      u1: 1,
      v1: 1,
      hasAlpha: 'none',
    }),
  });

  const opaqueBuf = output.passes.opaque;
  const cutoutBuf = output.passes.cutout;

  assert(opaqueBuf != null && opaqueBuf.faceCount === 6, 'opaque pass contains 6 faces (down, up, 4x side)');
  assert(cutoutBuf != null && cutoutBuf.faceCount === 4, 'cutout pass contains 4 overlay faces');

  // Verify opaque pass faces:
  let topFaceTinted = false;
  let sideFacesUntinted = 0;
  let bottomFaceUntinted = false;

  for (let f = 0; f < opaqueBuf!.faceCount; f++) {
    const nBase = f * 4 * 3;
    const cBase = f * 4 * 3;
    const ny = Math.round(opaqueBuf!.normals[nBase + 1]!);
    const r = opaqueBuf!.colors[cBase]!;
    const g = opaqueBuf!.colors[cBase + 1]!;
    const b = opaqueBuf!.colors[cBase + 2]!;

    if (ny === 1) {
      // Top face: grass green tint (< 1, 1, 1)
      assertApprox(r, DEFAULT_PLAINS_GRASS_TINT[0], 'top face red matches grass tint');
      assertApprox(g, DEFAULT_PLAINS_GRASS_TINT[1], 'top face green matches grass tint');
      assertApprox(b, DEFAULT_PLAINS_GRASS_TINT[2], 'top face blue matches grass tint');
      assert(r < 1.0 && g < 1.0 && b < 1.0, 'top face has tint < 1, 1, 1');
      topFaceTinted = true;
    } else if (ny === -1) {
      // Bottom face: untinted dirt [1, 1, 1]
      assertEqual(r, 1.0, 'bottom face red is untinted');
      assertEqual(g, 1.0, 'bottom face green is untinted');
      assertEqual(b, 1.0, 'bottom face blue is untinted');
      bottomFaceUntinted = true;
    } else {
      // Side faces: untinted grass_block_side [1, 1, 1]
      if (r === 1.0 && g === 1.0 && b === 1.0) {
        sideFacesUntinted++;
      }
    }
  }

  assert(topFaceTinted, 'opaque top face was inspected and tinted');
  assert(bottomFaceUntinted, 'opaque bottom face was inspected and untinted');
  assertEqual(sideFacesUntinted, 4, 'all 4 opaque side faces are untinted [1, 1, 1]');

  // Verify cutout pass faces: all 4 must be grass green tinted overlay faces (< 1, 1, 1)
  let cutoutTintedCount = 0;
  for (let f = 0; f < cutoutBuf!.faceCount; f++) {
    const cBase = f * 4 * 3;
    const r = cutoutBuf!.colors[cBase]!;
    const g = cutoutBuf!.colors[cBase + 1]!;
    const b = cutoutBuf!.colors[cBase + 2]!;

    assertApprox(r, DEFAULT_PLAINS_GRASS_TINT[0], `cutout face ${f} red matches grass tint`);
    assertApprox(g, DEFAULT_PLAINS_GRASS_TINT[1], `cutout face ${f} green matches grass tint`);
    assertApprox(b, DEFAULT_PLAINS_GRASS_TINT[2], `cutout face ${f} blue matches grass tint`);
    if (r < 1.0 && g < 1.0 && b < 1.0) {
      cutoutTintedCount++;
    }
  }
  assertEqual(cutoutTintedCount, 4, 'all 4 cutout overlay faces have grass green tint (< 1, 1, 1)');
}

// Test 3: Without getTextureUv provided at all
console.log('--- Test 3: Without getTextureUv ---');
{
  const output = meshChunk({
    chunkKey: '0_0_0',
    assets,
    getBlock: (lx, ly, lz) => {
      if (lx === 0 && ly === 0 && lz === 0) {
        return { name: 'minecraft:grass_block', properties: { snowy: 'false' } };
      }
      return null;
    },
  });

  const opaqueBuf = output.passes.opaque;
  const cutoutBuf = output.passes.cutout;

  assert(opaqueBuf != null && opaqueBuf.faceCount === 6, 'opaque pass has 6 faces without getTextureUv');
  assert(cutoutBuf != null && cutoutBuf.faceCount === 4, 'cutout pass has 4 overlay faces without getTextureUv');
}

// Test 4: Face culling against neighbor opaque block (stone at north neighbor)
console.log('--- Test 4: Face Culling of Both Base & Overlay Against Opaque Neighbor ---');
{
  const output = meshChunk({
    chunkKey: '0_0_0',
    assets,
    getBlock: (lx, ly, lz) => {
      if (lx === 0 && ly === 0 && lz === 0) {
        return { name: 'minecraft:grass_block', properties: { snowy: 'false' } };
      }
      if (lx === 0 && ly === 0 && lz === -1) {
        // North neighbor is stone (z = -1)
        return 'minecraft:stone';
      }
      return null;
    },
  });

  const opaqueBuf = output.passes.opaque;
  const cutoutBuf = output.passes.cutout;

  // North face of grass_block should be culled in both opaque and cutout passes
  assertEqual(opaqueBuf?.faceCount, 5, 'opaque pass culls north face against stone (5 faces remain)');
  assertEqual(cutoutBuf?.faceCount, 3, 'cutout pass culls north overlay against stone (3 faces remain)');
}

console.log(`\nTests finished: ${passed} passed, ${failed} failed.`);
if (failed > 0) {
  throw new Error(`grass-block-overlay tests failed: ${failed} tests did not pass`);
}
