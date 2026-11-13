// packages/renderer/__tests__/slice-e2-3-chunk-mesher.test.ts
// Unit tests for the pure-TS 16³ chunk mesher (slice E2.3, SUBSPEC-E).
// Pure TypeScript, zero external test framework dependencies.
// All test fixtures are synthetic mock definitions labelled as such.

import {
  meshChunk,
  isAirBlock,
  parseBlockData,
  rotateDirection,
  isOpaqueFullCube,
  shouldCullFace,
  type ChunkMeshInput,
  type BlockStateData,
} from '../src/chunk-mesher.ts';
import type {
  AssetSource,
  RawBlockStateDefinition,
  RawBlockModel,
} from '../src/model-resolver.ts';
import { hexToRgb, DEFAULT_PLAINS_GRASS_TINT } from '../src/tints.ts';

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

function assertApprox(actual: number, expected: number, message: string, epsilon = 0.001): void {
  if (Math.abs(actual - expected) <= epsilon) {
    passed++;
  } else {
    failed++;
    console.error(`FAIL: ${message} — expected ~${expected}, got ${actual}`);
  }
}

// In-memory test AssetSource helper
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

// Standard full-cube model helper
function createFullCubeModel(texture: string): RawBlockModel {
  return {
    elements: [
      {
        from: [0, 0, 0],
        to: [16, 16, 16],
        faces: {
          down: { texture, cullface: 'down' },
          up: { texture, cullface: 'up' },
          north: { texture, cullface: 'north' },
          south: { texture, cullface: 'south' },
          west: { texture, cullface: 'west' },
          east: { texture, cullface: 'east' },
        },
      },
    ],
  };
}

console.log('=== Slice E2.3: Chunk Mesher Tests ===');

// Setup mock assets for common blocks
const assets = new MockAssetSource();

// 1. Stone (opaque full cube)
assets.blockStates.set('minecraft:stone', {
  variants: { '': { model: 'minecraft:block/stone' } },
});
assets.models.set('minecraft:block/stone', createFullCubeModel('minecraft:block/stone'));

// 2. Glass (cutout full cube)
assets.blockStates.set('minecraft:glass', {
  variants: { '': { model: 'minecraft:block/glass' } },
});
assets.models.set('minecraft:block/glass', createFullCubeModel('minecraft:block/glass'));

// 3. Water (translucent full cube)
assets.blockStates.set('minecraft:water', {
  variants: { '': { model: 'minecraft:block/water' } },
});
assets.models.set('minecraft:block/water', createFullCubeModel('minecraft:block/water'));

// 4. Oak Stairs (2 elements)
assets.blockStates.set('minecraft:oak_stairs', {
  variants: {
    'facing=east,half=bottom,shape=straight': {
      model: 'minecraft:block/oak_stairs',
      y: 0,
      uvlock: true,
    },
    'facing=south,half=bottom,shape=straight': {
      model: 'minecraft:block/oak_stairs',
      y: 90,
      uvlock: true,
    },
  },
});
assets.models.set('minecraft:block/oak_stairs', {
  elements: [
    {
      from: [0, 0, 0],
      to: [16, 8, 16],
      faces: {
        down: { texture: 'minecraft:block/oak_planks', cullface: 'down' },
        up: { texture: 'minecraft:block/oak_planks' },
        north: { texture: 'minecraft:block/oak_planks', cullface: 'north' },
        south: { texture: 'minecraft:block/oak_planks', cullface: 'south' },
        west: { texture: 'minecraft:block/oak_planks', cullface: 'west' },
        east: { texture: 'minecraft:block/oak_planks', cullface: 'east' },
      },
    },
    {
      from: [0, 8, 0],
      to: [16, 16, 8],
      faces: {
        down: { texture: 'minecraft:block/oak_planks' },
        up: { texture: 'minecraft:block/oak_planks', cullface: 'up' },
        north: { texture: 'minecraft:block/oak_planks', cullface: 'north' },
        south: { texture: 'minecraft:block/oak_planks' },
        west: { texture: 'minecraft:block/oak_planks', cullface: 'west' },
        east: { texture: 'minecraft:block/oak_planks', cullface: 'east' },
      },
    },
  ],
});

// 5. Grass block (tinted top face, untinted side and bottom)
assets.blockStates.set('minecraft:grass_block', {
  variants: { 'snowy=false': { model: 'minecraft:block/grass_block' } },
});
assets.models.set('minecraft:block/grass_block', {
  elements: [
    {
      from: [0, 0, 0],
      to: [16, 16, 16],
      faces: {
        down: { texture: 'minecraft:block/dirt', cullface: 'down' }, // no tintindex
        up: { texture: 'minecraft:block/grass_block_top', cullface: 'up', tintindex: 0 },
        north: { texture: 'minecraft:block/grass_block_side', cullface: 'north' },
        south: { texture: 'minecraft:block/grass_block_side', cullface: 'south' },
        west: { texture: 'minecraft:block/grass_block_side', cullface: 'west' },
        east: { texture: 'minecraft:block/grass_block_side', cullface: 'east' },
      },
    },
  ],
});

// ============================================================================
// 1. Helper Function Tests
// ============================================================================
console.log('--- 1. Helper Functions ---');
{
  assert(isAirBlock(null), 'null is air');
  assert(isAirBlock(undefined), 'undefined is air');
  assert(isAirBlock(''), 'empty string is air');
  assert(isAirBlock('minecraft:air'), 'minecraft:air is air');
  assert(isAirBlock('air'), 'air is air');
  assert(isAirBlock('minecraft:cave_air'), 'cave_air is air');
  assert(isAirBlock('minecraft:void_air'), 'void_air is air');
  assert(!isAirBlock('minecraft:stone'), 'stone is not air');
  assert(!isAirBlock({ name: 'stone' }), 'object stone is not air');
  assert(isAirBlock({ name: 'minecraft:air' }), 'object air is air');

  const parsed1 = parseBlockData('minecraft:oak_stairs[facing=south,half=bottom]');
  assertEqual(parsed1?.name, 'minecraft:oak_stairs', 'parsed block name');
  assertEqual(parsed1?.properties?.['facing'], 'south', 'parsed facing property');
  assertEqual(parsed1?.properties?.['half'], 'bottom', 'parsed half property');

  assertEqual(rotateDirection('north', 0, 90), 'east', 'rotateDirection north y=90 -> east');
  assertEqual(rotateDirection('south', 0, 90), 'west', 'rotateDirection south y=90 -> west');
  assertEqual(rotateDirection('west', 0, 90), 'north', 'rotateDirection west y=90 -> north');
  assertEqual(rotateDirection('east', 0, 90), 'south', 'rotateDirection east y=90 -> south');
  assertEqual(rotateDirection('up', 90, 0), 'south', 'rotateDirection up x=90 -> south');
  assertEqual(rotateDirection('down', 90, 0), 'north', 'rotateDirection down x=90 -> north');

  assert(isOpaqueFullCube('minecraft:stone', assets), 'stone is opaque full cube');
  assert(!isOpaqueFullCube('minecraft:glass', assets), 'glass is not opaque full cube');
  assert(!isOpaqueFullCube('minecraft:water', assets), 'water is not opaque full cube');
  assert(!isOpaqueFullCube('minecraft:oak_stairs[facing=east,half=bottom,shape=straight]', assets), 'stairs is not opaque full cube');
}

// ============================================================================
// 2. Single Opaque Cube
// ============================================================================
console.log('--- 2. Single Opaque Cube ---');
{
  const output = meshChunk({
    chunkKey: 'test:0,0,0',
    assets,
    getBlock: (lx, ly, lz) => {
      if (lx === 0 && ly === 0 && lz === 0) return 'minecraft:stone';
      return null;
    },
  });

  assertEqual(output.chunkKey, 'test:0,0,0', 'correct chunk key');
  assert(output.passes.opaque !== null, 'opaque pass is populated');
  assertEqual(output.passes.cutout, null, 'cutout pass is null');
  assertEqual(output.passes.translucent, null, 'translucent pass is null');
  assertEqual(output.passes.emissive, null, 'emissive pass is null');

  const buf = output.passes.opaque!;
  assertEqual(buf.faceCount, 6, 'single cube has 6 faces');
  assertEqual(buf.vertexCount, 24, 'single cube has 24 vertices');
  assertEqual(buf.positions.length, 72, 'positions has 72 floats (24*3)');
  assertEqual(buf.normals.length, 72, 'normals has 72 floats (24*3)');
  assertEqual(buf.uvs.length, 48, 'uvs has 48 floats (24*2)');
  assertEqual(buf.colors.length, 72, 'colors has 72 floats (24*3)');
  assertEqual(buf.indices.length, 36, 'single cube has 36 indices (6*6)');
  assertEqual(output.totalFaceCount, 6, 'total face count is 6');
  assertEqual(output.totalVertexCount, 24, 'total vertex count is 24');

  // Check bounds of positions: within [0, 1]
  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;
  let minZ = Infinity, maxZ = -Infinity;
  for (let i = 0; i < buf.vertexCount; i++) {
    const x = buf.positions[i * 3];
    const y = buf.positions[i * 3 + 1];
    const z = buf.positions[i * 3 + 2];
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
  }
  assertApprox(minX, 0, 'minX is 0');
  assertApprox(maxX, 1, 'maxX is 1');
  assertApprox(minY, 0, 'minY is 0');
  assertApprox(maxY, 1, 'maxY is 1');
  assertApprox(minZ, 0, 'minZ is 0');
  assertApprox(maxZ, 1, 'maxZ is 1');
}

// ============================================================================
// 3. Two Adjacent Opaque Cubes (Internal Face Culling)
// ============================================================================
console.log('--- 3. Two Adjacent Opaque Cubes ---');
{
  const output = meshChunk({
    chunkKey: 'test:0,0,0',
    assets,
    getBlock: (lx, ly, lz) => {
      if ((lx === 0 || lx === 1) && ly === 0 && lz === 0) return 'minecraft:stone';
      return null;
    },
  });

  const buf = output.passes.opaque!;
  // 6 faces each, minus shared face between (0,0,0) east and (1,0,0) west = 12 - 2 = 10 faces
  assertEqual(buf.faceCount, 10, 'two adjacent cubes produce 10 faces');
  assertEqual(buf.vertexCount, 40, 'two adjacent cubes produce 40 vertices');
  assertEqual(buf.indices.length, 60, 'two adjacent cubes produce 60 indices (10*6)');

  // Verify that neither face has an internal east face at x=1 or west face at x=1
  let hasInternalEastFace = false;
  let hasInternalWestFace = false;
  for (let f = 0; f < buf.faceCount; f++) {
    const base = f * 4 * 3;
    const nx = buf.normals[base];
    const ny = buf.normals[base + 1];
    const nz = buf.normals[base + 2];
    const px = buf.positions[base];
    if (nx === 1 && ny === 0 && nz === 0 && Math.abs(px - 1) < 0.001) {
      hasInternalEastFace = true;
    }
    if (nx === -1 && ny === 0 && nz === 0 && Math.abs(px - 1) < 0.001) {
      hasInternalWestFace = true;
    }
  }
  assert(!hasInternalEastFace, 'internal east face between adjacent blocks was culled');
  assert(!hasInternalWestFace, 'internal west face between adjacent blocks was culled');
}

// ============================================================================
// 4. Cross-Chunk Neighbor Culling
// ============================================================================
console.log('--- 4. Cross-Chunk Neighbor Culling ---');
{
  // Block at lx=15, neighbor at lx=16 outside chunk
  const output = meshChunk({
    chunkKey: 'chunk:0,0,0',
    assets,
    getBlock: (lx, ly, lz) => {
      if (lx === 15 && ly === 0 && lz === 0) return 'minecraft:stone';
      if (lx === 16 && ly === 0 && lz === 0) return 'minecraft:stone'; // neighbor in adjacent chunk
      return null;
    },
  });

  const buf = output.passes.opaque!;
  // East face culled by neighbor at (16,0,0) -> 5 faces remain
  assertEqual(buf.faceCount, 5, 'cross-chunk opaque neighbor culls east face (5 faces remain)');
  assertEqual(buf.vertexCount, 20, '20 vertices for 5 faces');

  // Verify east face (nx = 1) is absent
  let hasEastFace = false;
  for (let f = 0; f < buf.faceCount; f++) {
    const nx = buf.normals[f * 4 * 3];
    if (nx === 1) hasEastFace = true;
  }
  assert(!hasEastFace, 'east face is culled by cross-chunk neighbor');
}

// ============================================================================
// 5. Same-Block Transparent Culling (Glass vs Glass and Glass vs Water)
// ============================================================================
console.log('--- 5. Same-Block Transparent Culling ---');
{
  // Case A: Two adjacent glass blocks (cutout pass)
  const glassOutput = meshChunk({
    chunkKey: 'test:glass',
    assets,
    getBlock: (lx, ly, lz) => {
      if ((lx === 0 || lx === 1) && ly === 0 && lz === 0) return 'minecraft:glass';
      return null;
    },
  });

  assertEqual(glassOutput.passes.opaque, null, 'no opaque pass for glass');
  assert(glassOutput.passes.cutout !== null, 'glass is in cutout pass');
  assertEqual(glassOutput.passes.cutout!.faceCount, 10, 'two adjacent glass blocks cull shared face (10 faces)');

  // Case B: Glass adjacent to Water (cutout next to translucent)
  // Shared face must NOT be culled!
  const mixedOutput = meshChunk({
    chunkKey: 'test:glass-water',
    assets,
    getBlock: (lx, ly, lz) => {
      if (lx === 0 && ly === 0 && lz === 0) return 'minecraft:glass';
      if (lx === 1 && ly === 0 && lz === 0) return 'minecraft:water';
      return null;
    },
  });

  assert(mixedOutput.passes.cutout !== null, 'cutout pass exists for glass');
  assert(mixedOutput.passes.translucent !== null, 'translucent pass exists for water');
  assertEqual(mixedOutput.passes.cutout!.faceCount, 6, 'glass face adjacent to water is NOT culled (6 faces)');
  assertEqual(mixedOutput.passes.translucent!.faceCount, 6, 'water face adjacent to glass is NOT culled (6 faces)');
}

// ============================================================================
// 6. Stairs Model (2 elements, rotated y=90)
// ============================================================================
console.log('--- 6. Stairs Model (y=90) ---');
{
  const output = meshChunk({
    chunkKey: 'test:stairs',
    assets,
    getBlock: (lx, ly, lz) => {
      if (lx === 0 && ly === 0 && lz === 0) {
        return {
          name: 'minecraft:oak_stairs',
          properties: { facing: 'south', half: 'bottom', shape: 'straight' },
        };
      }
      return null;
    },
  });

  assert(output.passes.opaque !== null, 'stairs in opaque pass');
  const buf = output.passes.opaque!;
  // Bottom slab (6 faces) + top step (6 faces) = 12 faces
  assertEqual(buf.faceCount, 12, 'stairs has 12 faces');
  assertEqual(buf.vertexCount, 48, 'stairs has 48 vertices');
  assertEqual(buf.indices.length, 72, 'stairs has 72 indices');

  // Verify rotated geometry of top step under y=90:
  // Top step originally: [0, 8, 0] to [16, 16, 8] (north half Z: 0..0.5)
  // After y=90 rotation around center [0.5, 0.5, 0.5]:
  // North face (normal [0, 0, -1]) rotated y=90 becomes East face (normal [1, 0, 0])
  // South face of step (normal [0, 0, 1]) rotated y=90 becomes West face (normal [-1, 0, 0])
  let eastFaceFound = false;
  let westFaceFound = false;
  for (let f = 0; f < buf.faceCount; f++) {
    const base = f * 4 * 3;
    const nx = Math.round(buf.normals[base]);
    const ny = Math.round(buf.normals[base + 1]);
    const nz = Math.round(buf.normals[base + 2]);
    const py = buf.positions[base + 1];
    // Check top step faces (py > 0.5)
    if (py > 0.5) {
      if (nx === 1 && ny === 0 && nz === 0) eastFaceFound = true;
      if (nx === -1 && ny === 0 && nz === 0) westFaceFound = true;
    }
  }
  assert(eastFaceFound, 'rotated top step has east face (from north face)');
  assert(westFaceFound, 'rotated top step has west face (from south face)');
}

// ============================================================================
// 7. Grass Block Tinting & Directional Shading
// ============================================================================
console.log('--- 7. Grass Block Tinting & Directional Shading ---');
{
  const output = meshChunk({
    chunkKey: 'test:grass',
    assets,
    getBlock: (lx, ly, lz) => {
      if (lx === 0 && ly === 0 && lz === 0) {
        return { name: 'minecraft:grass_block', properties: { snowy: 'false' } };
      }
      return null;
    },
  });

  const buf = output.passes.opaque!;
  assertEqual(buf.faceCount, 6, 'grass block has 6 faces');

  let upFaceColor: [number, number, number] | null = null;
  let downFaceColor: [number, number, number] | null = null;
  let northFaceColor: [number, number, number] | null = null;

  for (let f = 0; f < buf.faceCount; f++) {
    const nBase = f * 4 * 3;
    const cBase = f * 4 * 3;
    const nx = Math.round(buf.normals[nBase]);
    const ny = Math.round(buf.normals[nBase + 1]);
    const nz = Math.round(buf.normals[nBase + 2]);

    const r = buf.colors[cBase];
    const g = buf.colors[cBase + 1];
    const b = buf.colors[cBase + 2];

    if (ny === 1) upFaceColor = [r, g, b];
    if (ny === -1) downFaceColor = [r, g, b];
    if (nz === -1) northFaceColor = [r, g, b];
  }

  assert(upFaceColor !== null, 'up face color found');
  assert(downFaceColor !== null, 'down face color found');
  assert(northFaceColor !== null, 'north face color found');

  if (upFaceColor) {
    // Top face is tinted with plains grass tint (0x91BD59) and shade=1.0
    // DEFAULT_PLAINS_GRASS_TINT: R ~0.5686, G ~0.7412, B ~0.3490
    assert(upFaceColor[0] < 1.0, 'top face R < 1.0 (tinted)');
    assert(upFaceColor[2] < 1.0, 'top face B < 1.0 (tinted)');
    assert(upFaceColor[1] > upFaceColor[0], 'top face is predominantly green');
    assertApprox(upFaceColor[0], DEFAULT_PLAINS_GRASS_TINT[0], 'top face matches grass tint R');
    assertApprox(upFaceColor[1], DEFAULT_PLAINS_GRASS_TINT[1], 'top face matches grass tint G');
    assertApprox(upFaceColor[2], DEFAULT_PLAINS_GRASS_TINT[2], 'top face matches grass tint B');
  }

  if (downFaceColor) {
    // Dirt bottom face has tintindex: undefined -> base is [1, 1, 1]
    // Directional shade for down (-Y) is 0.5
    // So final color is [0.5, 0.5, 0.5]
    assertApprox(downFaceColor[0], 0.5, 'bottom face R is 0.5');
    assertApprox(downFaceColor[1], 0.5, 'bottom face G is 0.5');
    assertApprox(downFaceColor[2], 0.5, 'bottom face B is 0.5');
    assert(
      Math.abs(downFaceColor[0] - downFaceColor[1]) < 0.001 &&
      Math.abs(downFaceColor[1] - downFaceColor[2]) < 0.001,
      'bottom face is untinted with R === G === B'
    );
  }

  if (northFaceColor) {
    // North face has shade = 0.8 and untinted base [1, 1, 1]
    assertApprox(northFaceColor[0], 0.8, 'north face shade is 0.8');
    assertApprox(northFaceColor[1], 0.8, 'north face shade is 0.8');
    assertApprox(northFaceColor[2], 0.8, 'north face shade is 0.8');
  }
}

// ============================================================================
// 8. Palette + Indices Input & chunkOrigin Offset
// ============================================================================
console.log('--- 8. Palette + Indices & chunkOrigin ---');
{
  const palette = ['minecraft:air', 'minecraft:stone'];
  const indices = new Uint16Array(4096); // all air
  indices[0] = 1; // stone at (0, 0, 0)
  indices[1] = 1; // stone at (1, 0, 0)

  const output = meshChunk({
    chunkKey: 'chunk:1,0,2',
    chunkOrigin: [16, 0, 32],
    palette,
    indices,
    assets,
  });

  const buf = output.passes.opaque!;
  assertEqual(buf.faceCount, 10, 'palette+indices two cubes produce 10 faces');

  // Verify chunkOrigin is added to vertex positions
  let minX = Infinity, maxX = -Infinity;
  let minZ = Infinity, maxZ = -Infinity;
  for (let i = 0; i < buf.vertexCount; i++) {
    const x = buf.positions[i * 3];
    const z = buf.positions[i * 3 + 2];
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
  }
  assertApprox(minX, 16, 'chunkOrigin X offset (16) applied');
  assertApprox(maxX, 18, 'chunkOrigin X span (16..18) applied');
  assertApprox(minZ, 32, 'chunkOrigin Z offset (32) applied');
  assertApprox(maxZ, 33, 'chunkOrigin Z span (32..33) applied');
}

// ============================================================================
// 9. Texture Atlas UV Mapping
// ============================================================================
console.log('--- 9. Texture Atlas UV Mapping ---');
{
  const output = meshChunk({
    chunkKey: 'test:uv',
    assets,
    getBlock: (lx, ly, lz) => (lx === 0 && ly === 0 && lz === 0 ? 'minecraft:stone' : null),
    getTextureUv: (texId) => {
      if (texId === 'minecraft:block/stone') {
        return { u0: 0.25, v0: 0.5, u1: 0.5, v1: 0.75 };
      }
      return undefined;
    },
  });

  const buf = output.passes.opaque!;
  let minU = Infinity, maxU = -Infinity;
  let minV = Infinity, maxV = -Infinity;
  for (let i = 0; i < buf.vertexCount; i++) {
    const u = buf.uvs[i * 2];
    const v = buf.uvs[i * 2 + 1];
    minU = Math.min(minU, u); maxU = Math.max(maxU, u);
    minV = Math.min(minV, v); maxV = Math.max(maxV, v);
  }
  assertApprox(minU, 0.25, 'atlas u0 mapped correctly');
  assertApprox(maxU, 0.5, 'atlas u1 mapped correctly');
  assertApprox(minV, 0.5, 'atlas v0 mapped correctly');
  assertApprox(maxV, 0.75, 'atlas v1 mapped correctly');
}

// ============================================================================
// 10. Performance Benchmark: Full 16³ Chunk (4096 blocks) < 50ms
// ============================================================================
console.log('--- 10. Performance Benchmark: 16³ Chunk (4096 blocks) ---');
{
  const palette = ['minecraft:stone'];
  const indices = new Uint8Array(4096); // all 4096 blocks are stone

  // Warmup run
  meshChunk({
    chunkKey: 'bench:warmup',
    palette,
    indices,
    assets,
  });

  // Benchmark run
  const startTime = performance.now();
  const output = meshChunk({
    chunkKey: 'bench:4096-stone',
    palette,
    indices,
    assets,
  });
  const elapsed = performance.now() - startTime;

  console.log(`Meshed 4096 solid stone blocks in ${elapsed.toFixed(2)} ms`);

  // Solid 16³ cube in air: 6 outer faces of 16×16 each = 6 * 256 = 1536 faces
  assertEqual(output.passes.opaque!.faceCount, 1536, 'solid 16³ chunk has exactly 1536 unculled boundary faces');
  assertEqual(output.passes.opaque!.vertexCount, 6144, '6144 vertices for 1536 faces');
  assert(elapsed < 50, `16³ chunk meshing finished in ${elapsed.toFixed(2)} ms (< 50 ms budget)`);

  // Checkerboard benchmark (2048 stone + 2048 air, high surface area)
  const checkerboardIndices = new Uint8Array(4096);
  for (let i = 0; i < 4096; i++) {
    const lx = i % 16;
    const lz = Math.floor(i / 16) % 16;
    const ly = Math.floor(i / 256);
    checkerboardIndices[i] = (lx + ly + lz) % 2 === 0 ? 1 : 0;
  }
  const cbPalette = ['minecraft:air', 'minecraft:stone'];

  const cbStart = performance.now();
  const cbOutput = meshChunk({
    chunkKey: 'bench:checkerboard',
    palette: cbPalette,
    indices: checkerboardIndices,
    assets,
  });
  const cbElapsed = performance.now() - cbStart;

  console.log(`Meshed checkerboard chunk (2048 stone, high surface) in ${cbElapsed.toFixed(2)} ms`);
  assert(cbElapsed < 50, `checkerboard meshing finished in ${cbElapsed.toFixed(2)} ms (< 50 ms budget)`);
  assert(cbOutput.passes.opaque!.faceCount > 0, 'checkerboard produced geometry');
}

// ============================================================================
// Summary
// ============================================================================
console.log(`\nTests passed: ${passed}, failed: ${failed}`);
if (failed > 0) {
  throw new Error(`Chunk mesher tests failed: ${failed} tests did not pass`);
}
