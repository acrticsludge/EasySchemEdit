// packages/renderer/__tests__/slice-e2-1-model-resolver.test.ts
// Unit tests for Minecraft blockstate -> model resolution (slice E2.1).
// Pure TypeScript, zero external test framework dependencies.
// All test fixtures are synthetic hand-written mock definitions labelled as such.

import {
  resolveBlockModels,
  resolveBlockModel,
  normalizeResourceLocation,
  createMissingModelPart,
  createFluidModelPart,
  getFluidBaseName,
  computeDefaultUv,
  resolveTextureVariable,
  matchWhenCondition,
  selectWeightedModel,
  formatBlockStateCacheKey,
  MISSING_MODEL_TEXTURE,
  type AssetSource,
  type RawBlockStateDefinition,
  type RawBlockModel,
} from '../src/model-resolver.ts';

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

function assertDeepEqual(actual: unknown, expected: unknown, message: string): void {
  const actualStr = JSON.stringify(actual);
  const expectedStr = JSON.stringify(expected);
  if (actualStr === expectedStr) {
    passed++;
  } else {
    failed++;
    console.error(`FAIL: ${message} — expected ${expectedStr}, got ${actualStr}`);
  }
}

// In-memory test AssetSource helper
class MockAssetSource implements AssetSource {
  public blockStates = new Map<string, RawBlockStateDefinition>();
  public models = new Map<string, RawBlockModel>();
  public blockStateCallCount = 0;
  public modelCallCount = 0;

  getBlockState(id: string): RawBlockStateDefinition | undefined {
    this.blockStateCallCount++;
    return this.blockStates.get(id);
  }

  getModel(resourceLocation: string): RawBlockModel | undefined {
    this.modelCallCount++;
    return this.models.get(resourceLocation);
  }
}

console.log('=== Slice E2.1: Model Resolver Tests ===');

// ============================================================================
// 1. Normalization & Cache Key Generation
// ============================================================================
console.log('--- 1. Normalization & Cache Key Generation ---');
{
  assertEqual(normalizeResourceLocation('oak_stairs'), 'minecraft:oak_stairs', 'normalizes un-namespaced id');
  assertEqual(normalizeResourceLocation('minecraft:oak_stairs'), 'minecraft:oak_stairs', 'preserves existing namespace');
  assertEqual(normalizeResourceLocation('block/cube_all'), 'minecraft:block/cube_all', 'normalizes model path');
  assertEqual(normalizeResourceLocation('custom:block/model'), 'custom:block/model', 'preserves custom namespace');

  // Cache key sorts properties alphabetically
  const key1 = formatBlockStateCacheKey('oak_stairs', { shape: 'straight', half: 'bottom', facing: 'east' });
  const key2 = formatBlockStateCacheKey('minecraft:oak_stairs', { facing: 'east', shape: 'straight', half: 'bottom' });
  assertEqual(key1, 'minecraft:oak_stairs[facing=east,half=bottom,shape=straight]', 'cache key sorts properties');
  assertEqual(key1, key2, 'cache keys match regardless of property insertion order');

  const emptyKey = formatBlockStateCacheKey('stone', {});
  assertEqual(emptyKey, 'minecraft:stone', 'cache key without properties');
}

// ============================================================================
// 2. Oak Log Axis Variants (x/y rotation)
// ============================================================================
console.log('--- 2. Oak Log Axis Variants ---');
{
  // SYNTHETIC FIXTURE: oak_log blockstate with axis=y, axis=z, axis=x variants
  const src = new MockAssetSource();
  src.blockStates.set('minecraft:oak_log', {
    variants: {
      'axis=y': { model: 'minecraft:block/oak_log' },
      'axis=z': { model: 'minecraft:block/oak_log_horizontal', x: 90 },
      'axis=x': { model: 'minecraft:block/oak_log_horizontal', x: 90, y: 90 },
    },
  });

  // SYNTHETIC FIXTURE: oak_log vertical model
  src.models.set('minecraft:block/oak_log', {
    textures: {
      end: 'minecraft:block/oak_log_top',
      side: 'minecraft:block/oak_log',
    },
    elements: [
      {
        from: [0, 0, 0],
        to: [16, 16, 16],
        faces: {
          down: { texture: '#end', cullface: 'down' },
          up: { texture: '#end', cullface: 'up' },
          north: { texture: '#side', cullface: 'north' },
          south: { texture: '#side', cullface: 'south' },
          west: { texture: '#side', cullface: 'west' },
          east: { texture: '#side', cullface: 'east' },
        },
      },
    ],
  });

  // SYNTHETIC FIXTURE: oak_log horizontal model
  src.models.set('minecraft:block/oak_log_horizontal', {
    textures: {
      end: 'minecraft:block/oak_log_top',
      side: 'minecraft:block/oak_log',
    },
    elements: [
      {
        from: [0, 0, 0],
        to: [16, 16, 16],
        faces: {
          down: { texture: '#side', cullface: 'down' },
          up: { texture: '#side', cullface: 'up' },
          north: { texture: '#side', cullface: 'north' },
          south: { texture: '#side', cullface: 'south' },
          west: { texture: '#end', cullface: 'west' },
          east: { texture: '#end', cullface: 'east' },
        },
      },
    ],
  });

  // Test axis=y
  const partsY = resolveBlockModels('minecraft:oak_log', { axis: 'y' }, src);
  assertEqual(partsY.length, 1, 'axis=y returns 1 part');
  assertEqual(partsY[0]!.x, 0, 'axis=y rotation x is 0');
  assertEqual(partsY[0]!.y, 0, 'axis=y rotation y is 0');
  assertEqual(partsY[0]!.elements.length, 1, 'axis=y has 1 element');
  assertEqual(partsY[0]!.elements[0]!.faces['up']?.texture, 'minecraft:block/oak_log_top', 'up face has end texture');
  assertEqual(partsY[0]!.elements[0]!.faces['north']?.texture, 'minecraft:block/oak_log', 'north face has side texture');

  // Test axis=z (x: 90, y: 0)
  const partsZ = resolveBlockModels('minecraft:oak_log', { axis: 'z' }, src);
  assertEqual(partsZ.length, 1, 'axis=z returns 1 part');
  assertEqual(partsZ[0]!.x, 90, 'axis=z rotation x is 90');
  assertEqual(partsZ[0]!.y, 0, 'axis=z rotation y is 0');

  // Test axis=x (x: 90, y: 90)
  const partsX = resolveBlockModels('minecraft:oak_log', { axis: 'x' }, src);
  assertEqual(partsX.length, 1, 'axis=x returns 1 part');
  assertEqual(partsX[0]!.x, 90, 'axis=x rotation x is 90');
  assertEqual(partsX[0]!.y, 90, 'axis=x rotation y is 90');
}

// ============================================================================
// 3. Stairs Facing / Half / Shape Selection
// ============================================================================
console.log('--- 3. Stairs Facing / Half / Shape ---');
{
  // SYNTHETIC FIXTURE: stairs blockstate with multi-property variants
  const src = new MockAssetSource();
  src.blockStates.set('minecraft:oak_stairs', {
    variants: {
      'facing=east,half=bottom,shape=straight': {
        model: 'minecraft:block/oak_stairs',
        y: 0,
        uvlock: true,
      },
      'facing=west,half=bottom,shape=straight': {
        model: 'minecraft:block/oak_stairs',
        y: 180,
        uvlock: true,
      },
      'facing=south,half=top,shape=straight': {
        model: 'minecraft:block/oak_stairs',
        x: 180,
        y: 90,
        uvlock: true,
      },
      'facing=east,half=bottom,shape=inner_left': {
        model: 'minecraft:block/oak_stairs_inner',
        y: 270,
        uvlock: true,
      },
    },
  });

  src.models.set('minecraft:block/oak_stairs', {
    elements: [
      { from: [0, 0, 0], to: [16, 8, 16], faces: { down: { texture: 'minecraft:block/oak_planks' } } },
      { from: [0, 8, 0], to: [8, 16, 16], faces: { up: { texture: 'minecraft:block/oak_planks' } } },
    ],
  });

  src.models.set('minecraft:block/oak_stairs_inner', {
    elements: [
      { from: [0, 0, 0], to: [16, 8, 16], faces: { down: { texture: 'minecraft:block/oak_planks' } } },
    ],
  });

  // Variant matching with unordered properties: { shape, half, facing }
  const westParts = resolveBlockModels('oak_stairs', {
    shape: 'straight',
    half: 'bottom',
    facing: 'west',
  }, src);
  assertEqual(westParts.length, 1, 'stairs west returns 1 part');
  assertEqual(westParts[0]!.x, 0, 'stairs west x is 0');
  assertEqual(westParts[0]!.y, 180, 'stairs west y is 180');
  assertEqual(westParts[0]!.uvlock, true, 'stairs west uvlock is true');
  assertEqual(westParts[0]!.elements.length, 2, 'stairs straight has 2 elements');

  // Upside-down stairs: facing=south, half=top, shape=straight (x: 180, y: 90)
  const topParts = resolveBlockModels('oak_stairs', {
    facing: 'south',
    half: 'top',
    shape: 'straight',
  }, src);
  assertEqual(topParts[0]!.x, 180, 'stairs top south x is 180');
  assertEqual(topParts[0]!.y, 90, 'stairs top south y is 90');
  assertEqual(topParts[0]!.uvlock, true, 'stairs top south uvlock is true');

  // Inner stairs model selection
  const innerParts = resolveBlockModels('oak_stairs', {
    facing: 'east',
    half: 'bottom',
    shape: 'inner_left',
  }, src);
  assertEqual(innerParts[0]!.y, 270, 'stairs inner y is 270');
  assertEqual(innerParts[0]!.elements.length, 1, 'inner stairs model selected');
}

// ============================================================================
// 4. Fence Multipart (post + conditional sides)
// ============================================================================
console.log('--- 4. Fence Multipart ---');
{
  // SYNTHETIC FIXTURE: fence multipart blockstate
  const src = new MockAssetSource();
  src.blockStates.set('minecraft:oak_fence', {
    multipart: [
      {
        apply: { model: 'minecraft:block/oak_fence_post' },
      },
      {
        when: { north: 'true' },
        apply: { model: 'minecraft:block/oak_fence_side', uvlock: true },
      },
      {
        when: { east: 'true' },
        apply: { model: 'minecraft:block/oak_fence_side', y: 90, uvlock: true },
      },
      {
        when: { south: 'true' },
        apply: { model: 'minecraft:block/oak_fence_side', y: 180, uvlock: true },
      },
      {
        when: { west: 'true' },
        apply: { model: 'minecraft:block/oak_fence_side', y: 270, uvlock: true },
      },
    ],
  });

  src.models.set('minecraft:block/oak_fence_post', {
    elements: [{ from: [6, 0, 6], to: [10, 16, 10], faces: { up: { texture: 'minecraft:block/oak_planks' } } }],
  });
  src.models.set('minecraft:block/oak_fence_side', {
    elements: [{ from: [7, 6, 0], to: [9, 9, 6], faces: { north: { texture: 'minecraft:block/oak_planks' } } }],
  });

  // Isolated fence (all false) -> post only
  const isolated = resolveBlockModels('oak_fence', {
    north: 'false',
    east: 'false',
    south: 'false',
    west: 'false',
  }, src);
  assertEqual(isolated.length, 1, 'isolated fence has 1 part (post)');
  assertEqual(isolated[0]!.elements[0]!.from[0], 6, 'post element from[0] is 6');

  // Corner fence (north=true, east=true) -> post + north side + east side
  const corner = resolveBlockModels('oak_fence', {
    north: 'true',
    east: 'true',
    south: 'false',
    west: 'false',
  }, src);
  assertEqual(corner.length, 3, 'corner fence has 3 parts (post + 2 sides)');
  assertEqual(corner[0]!.y, 0, 'part 0 (post) y is 0');
  assertEqual(corner[1]!.y, 0, 'part 1 (north side) y is 0');
  assertEqual(corner[2]!.y, 90, 'part 2 (east side) y is 90');
  assertEqual(corner[1]!.uvlock, true, 'side uvlock is true');
  assertEqual(corner[2]!.uvlock, true, 'side uvlock is true');
}

// ============================================================================
// 5. Multipart Conditions: OR and AND
// ============================================================================
console.log('--- 5. Multipart Conditions: OR and AND ---');
{
  assert(
    matchWhenCondition({ OR: [{ north: 'true' }, { east: 'true' }] }, { north: 'true', east: 'false' }),
    'OR condition matches when first is true'
  );
  assert(
    matchWhenCondition({ OR: [{ north: 'true' }, { east: 'true' }] }, { north: 'false', east: 'true' }),
    'OR condition matches when second is true'
  );
  assert(
    !matchWhenCondition({ OR: [{ north: 'true' }, { east: 'true' }] }, { north: 'false', east: 'false' }),
    'OR condition fails when neither is true'
  );

  // AND condition
  assert(
    matchWhenCondition({ AND: [{ north: 'true' }, { east: 'true' }] }, { north: 'true', east: 'true' }),
    'AND condition matches when both true'
  );
  assert(
    !matchWhenCondition({ AND: [{ north: 'true' }, { east: 'true' }] }, { north: 'true', east: 'false' }),
    'AND condition fails when one is false'
  );
}

// ============================================================================
// 6. Multipart Conditions: Pipe "a|b" syntax
// ============================================================================
console.log('--- 6. Multipart Conditions: Pipe "a|b" Syntax ---');
{
  assert(
    matchWhenCondition({ facing: 'north|south' }, { facing: 'north' }),
    'pipe condition matches first alternative'
  );
  assert(
    matchWhenCondition({ facing: 'north|south' }, { facing: 'south' }),
    'pipe condition matches second alternative'
  );
  assert(
    !matchWhenCondition({ facing: 'north|south' }, { facing: 'east' }),
    'pipe condition rejects unlisted value'
  );

  // Multiple property constraints (implicit AND) with pipe
  assert(
    matchWhenCondition({ facing: 'north|south', half: 'bottom' }, { facing: 'north', half: 'bottom' }),
    'combined implicit AND matches'
  );
  assert(
    !matchWhenCondition({ facing: 'north|south', half: 'bottom' }, { facing: 'north', half: 'top' }),
    'combined implicit AND fails when second prop differs'
  );
}

// ============================================================================
// 7. Parent Chain Texture Resolution (cube_all -> cube -> block)
// ============================================================================
console.log('--- 7. Parent Chain Texture Resolution ---');
{
  // SYNTHETIC FIXTURE: standard vanilla model hierarchy
  const src = new MockAssetSource();

  // Root model: block/block
  src.models.set('minecraft:block/block', {});

  // Model: block/cube (inherits block/block, defines 6 faces referencing texture variables)
  src.models.set('minecraft:block/cube', {
    parent: 'minecraft:block/block',
    elements: [
      {
        from: [0, 0, 0],
        to: [16, 16, 16],
        faces: {
          down: { texture: '#down', cullface: 'down' },
          up: { texture: '#up', cullface: 'up' },
          north: { texture: '#north', cullface: 'north' },
          south: { texture: '#south', cullface: 'south' },
          west: { texture: '#west', cullface: 'west' },
          east: { texture: '#east', cullface: 'east' },
        },
      },
    ],
  });

  // Model: block/cube_all (inherits block/cube, maps all 6 face slots to #all)
  src.models.set('minecraft:block/cube_all', {
    parent: 'minecraft:block/cube',
    textures: {
      particle: '#all',
      down: '#all',
      up: '#all',
      north: '#all',
      south: '#all',
      west: '#all',
      east: '#all',
    },
  });

  // Child model: block/oak_planks (inherits block/cube_all, defines slot "all")
  src.models.set('minecraft:block/oak_planks', {
    parent: 'minecraft:block/cube_all',
    textures: {
      all: 'minecraft:block/oak_planks',
    },
  });

  src.blockStates.set('minecraft:oak_planks', {
    variants: {
      '': { model: 'minecraft:block/oak_planks' },
    },
  });

  const parts = resolveBlockModels('oak_planks', {}, src);
  assertEqual(parts.length, 1, 'oak_planks returns 1 part');
  assertEqual(parts[0]!.elements.length, 1, 'oak_planks inherited 1 element from grandparent');
  const faces = parts[0]!.elements[0]!.faces;
  for (const dir of ['down', 'up', 'north', 'south', 'west', 'east']) {
    assertEqual(
      faces[dir]?.texture,
      'minecraft:block/oak_planks',
      `face ${dir} resolved #var recursively to minecraft:block/oak_planks`
    );
  }

  // Texture variable cycle guard
  const cyclicTextures = { a: '#b', b: '#a' };
  const fallback = resolveTextureVariable('#a', cyclicTextures);
  assertEqual(fallback, MISSING_MODEL_TEXTURE, 'cyclic texture variable returns missing texture');

  const unresolvable = resolveTextureVariable('#nonexistent', {});
  assertEqual(unresolvable, MISSING_MODEL_TEXTURE, 'unresolvable texture variable returns missing texture');
}

// ============================================================================
// 8. Default UV Computation
// ============================================================================
console.log('--- 8. Default UV Computation ---');
{
  // Full cube [0, 0, 0] to [16, 16, 16]
  assertDeepEqual(computeDefaultUv('up', [0, 0, 0], [16, 16, 16]), [0, 0, 16, 16], 'full cube up UV is [0, 0, 16, 16]');
  assertDeepEqual(computeDefaultUv('down', [0, 0, 0], [16, 16, 16]), [0, 0, 16, 16], 'full cube down UV is [0, 0, 16, 16]');
  assertDeepEqual(computeDefaultUv('north', [0, 0, 0], [16, 16, 16]), [0, 0, 16, 16], 'full cube north UV is [0, 0, 16, 16]');
  assertDeepEqual(computeDefaultUv('south', [0, 0, 0], [16, 16, 16]), [0, 0, 16, 16], 'full cube south UV is [0, 0, 16, 16]');
  assertDeepEqual(computeDefaultUv('west', [0, 0, 0], [16, 16, 16]), [0, 0, 16, 16], 'full cube west UV is [0, 0, 16, 16]');
  assertDeepEqual(computeDefaultUv('east', [0, 0, 0], [16, 16, 16]), [0, 0, 16, 16], 'full cube east UV is [0, 0, 16, 16]');

  // Bottom slab [0, 0, 0] to [16, 8, 16]
  assertDeepEqual(computeDefaultUv('up', [0, 0, 0], [16, 8, 16]), [0, 0, 16, 16], 'slab up UV is [0, 0, 16, 16]');
  assertDeepEqual(computeDefaultUv('north', [0, 0, 0], [16, 8, 16]), [0, 8, 16, 16], 'slab north UV is [0, 8, 16, 16]');
  assertDeepEqual(computeDefaultUv('south', [0, 0, 0], [16, 8, 16]), [0, 8, 16, 16], 'slab south UV is [0, 8, 16, 16]');
  assertDeepEqual(computeDefaultUv('west', [0, 0, 0], [16, 8, 16]), [0, 8, 16, 16], 'slab west UV is [0, 8, 16, 16]');

  // In-resolver test: model element without explicit UV receives default UVs
  const src = new MockAssetSource();
  src.blockStates.set('minecraft:slab_test', {
    variants: { '': { model: 'minecraft:block/slab_test' } },
  });
  src.models.set('minecraft:block/slab_test', {
    elements: [
      {
        from: [0, 0, 0],
        to: [16, 8, 16],
        faces: {
          north: { texture: 'minecraft:block/stone' },
          up: { texture: 'minecraft:block/stone' },
        },
      },
    ],
  });

  const res = resolveBlockModels('slab_test', {}, src);
  assertDeepEqual(res[0]!.elements[0]!.faces['north']?.uv, [0, 8, 16, 16], 'model without uv receives computed default uv for north');
  assertDeepEqual(res[0]!.elements[0]!.faces['up']?.uv, [0, 0, 16, 16], 'model without uv receives computed default uv for up');
}

// ============================================================================
// 9. Missing Model Fallback
// ============================================================================
console.log('--- 9. Missing Model Fallback ---');
{
  const src = new MockAssetSource();

  // 1. Missing blockstate
  const missingState = resolveBlockModels('minecraft:totally_unknown_block', {}, src);
  assertEqual(missingState.length, 1, 'missing blockstate returns 1 part');
  assertEqual(missingState[0]!.missing, true, 'missing blockstate part has missing: true');
  assertEqual(missingState[0]!.elements.length, 1, 'missing model has fallback cube element');
  assertEqual(missingState[0]!.elements[0]!.faces['up']?.texture, MISSING_MODEL_TEXTURE, 'missing texture is minecraft:missing');

  // 2. Blockstate exists but model is missing
  src.blockStates.set('minecraft:broken_block', {
    variants: { '': { model: 'minecraft:block/nonexistent_model' } },
  });
  const missingModel = resolveBlockModels('minecraft:broken_block', {}, src);
  assertEqual(missingModel.length, 1, 'broken block returns 1 part');
  assertEqual(missingModel[0]!.missing, true, 'broken model part has missing: true');

  // 3. Model exists but parent is missing
  src.blockStates.set('minecraft:broken_parent_block', {
    variants: { '': { model: 'minecraft:block/broken_parent' } },
  });
  src.models.set('minecraft:block/broken_parent', {
    parent: 'minecraft:block/missing_parent_model',
  });
  const missingParent = resolveBlockModels('minecraft:broken_parent_block', {}, src);
  assertEqual(missingParent[0]!.missing, true, 'missing parent returns missing: true fallback');

  // 4. Cycle in parent chain
  src.blockStates.set('minecraft:cyclic_block', {
    variants: { '': { model: 'minecraft:block/cyclic_a' } },
  });
  src.models.set('minecraft:block/cyclic_a', {
    parent: 'minecraft:block/cyclic_b',
  });
  src.models.set('minecraft:block/cyclic_b', {
    parent: 'minecraft:block/cyclic_a',
  });
  const cyclic = resolveBlockModels('minecraft:cyclic_block', {}, src);
  assertEqual(cyclic[0]!.elements.length, 0, 'cyclic chain terminated safely');
}

// ============================================================================
// 10. Deterministic Weighted Model Selection
// ============================================================================
console.log('--- 10. Deterministic Weighted Model Selection ---');
{
  const weightedRefs = [
    { model: 'minecraft:block/stone_common', weight: 3 },
    { model: 'minecraft:block/stone_rare', weight: 1 },
  ];

  // Identical seed returns identical result
  const pick1 = selectWeightedModel(weightedRefs, 12345);
  const pick2 = selectWeightedModel(weightedRefs, 12345);
  assertEqual(pick1.model, pick2.model, 'identical seed produces identical selection');

  // Run across 1000 seeds to verify distribution roughly matches 3:1 (75% / 25%)
  let countCommon = 0;
  let countRare = 0;
  const iterations = 1000;
  for (let s = 0; s < iterations; s++) {
    const chosen = selectWeightedModel(weightedRefs, s);
    if (chosen.model === 'minecraft:block/stone_common') {
      countCommon++;
    } else {
      countRare++;
    }
  }

  const commonRatio = countCommon / iterations;
  assert(
    commonRatio >= 0.65 && commonRatio <= 0.85,
    `weight 3 selection ratio (${commonRatio.toFixed(2)}) is approximately 0.75`
  );
}

// ============================================================================
// 11. Caching Behavior
// ============================================================================
console.log('--- 11. Caching Behavior ---');
{
  const src = new MockAssetSource();
  src.blockStates.set('minecraft:cached_block', {
    variants: { 'axis=y': { model: 'minecraft:block/cached_model' } },
  });
  src.models.set('minecraft:block/cached_model', {
    elements: [{ from: [0, 0, 0], to: [16, 16, 16], faces: {} }],
  });

  const firstCount = src.blockStateCallCount;
  const res1 = resolveBlockModels('cached_block', { axis: 'y' }, src);
  assertEqual(src.blockStateCallCount, firstCount + 1, 'first call reads from AssetSource');

  const res2 = resolveBlockModels('minecraft:cached_block', { axis: 'y' }, src);
  assertEqual(src.blockStateCallCount, firstCount + 1, 'second call hits cache without calling getBlockState');
  assert(res1 === res2, 'second call returns identical cached array reference');
}

// ============================================================================
// 12. Fluid Model Synthesis (Water & Lava Fallback)
// ============================================================================
console.log('--- 12. Fluid Model Synthesis ---');
{
  // 12.1 minecraft:water when water.json has elements: []
  const srcEmpty = new MockAssetSource();
  srcEmpty.blockStates.set('minecraft:water', {
    variants: { '': { model: 'minecraft:block/water' } },
  });
  srcEmpty.models.set('minecraft:block/water', {
    elements: [],
  });
  const partsEmpty = resolveBlockModels('minecraft:water', {}, srcEmpty);
  assertEqual(partsEmpty.length, 1, 'resolves 1 part for water with empty elements');
  assertEqual(partsEmpty[0]!.elements.length, 1, 'synthesizes 1 fluid cube element');
  assertDeepEqual(partsEmpty[0]!.elements[0]!.from, [0, 0, 0], 'fluid element from is [0, 0, 0]');
  assertDeepEqual(partsEmpty[0]!.elements[0]!.to, [16, 14, 16], 'fluid element to is [16, 14, 16]');
  assertEqual(partsEmpty[0]!.elements[0]!.faces.up?.texture, 'minecraft:block/water_still', 'water texture is water_still');
  assertEqual(partsEmpty[0]!.elements[0]!.faces.up?.tintindex, 0, 'water face has tintindex 0');
  assertEqual(partsEmpty[0]!.elements[0]!.faces.up?.cullface, 'up', 'water face has cullface up');
  assertEqual(partsEmpty[0]!.elements[0]!.faces.down?.cullface, 'down', 'water face has cullface down');
  assertEqual(partsEmpty[0]!.elements[0]!.faces.north?.cullface, 'north', 'water face has cullface north');
  assertEqual(partsEmpty[0]!.elements[0]!.faces.south?.cullface, 'south', 'water face has cullface south');
  assertEqual(partsEmpty[0]!.elements[0]!.faces.west?.cullface, 'west', 'water face has cullface west');
  assertEqual(partsEmpty[0]!.elements[0]!.faces.east?.cullface, 'east', 'water face has cullface east');

  // 12.2 minecraft:water when blockstate / model is completely missing
  const srcMissing = new MockAssetSource();
  const partsMissing = resolveBlockModels('minecraft:water', {}, srcMissing);
  assertEqual(partsMissing.length, 1, 'resolves 1 part for water when missing from assets');
  assertEqual(partsMissing[0]!.elements.length, 1, 'synthesizes 1 fluid cube element when missing');
  assert(!partsMissing[0]!.missing, 'not marked as missing model fallback');
  assertEqual(partsMissing[0]!.elements[0]!.faces.up?.texture, 'minecraft:block/water_still', 'texture is water_still');

  // 12.3 flowing_water, lava, flowing_lava
  const flowingWaterParts = resolveBlockModels('minecraft:flowing_water', {}, srcMissing);
  assertEqual(flowingWaterParts[0]!.elements[0]!.faces.up?.texture, 'minecraft:block/water_still', 'flowing_water texture is water_still');
  assertEqual(flowingWaterParts[0]!.elements[0]!.faces.up?.tintindex, 0, 'flowing_water has tintindex 0');

  const lavaParts = resolveBlockModels('minecraft:lava', {}, srcMissing);
  assertEqual(lavaParts[0]!.elements[0]!.faces.up?.texture, 'minecraft:block/lava_still', 'lava texture is lava_still');
  assertEqual(lavaParts[0]!.elements[0]!.faces.up?.tintindex, undefined, 'lava face has no tintindex');

  const flowingLavaParts = resolveBlockModels('minecraft:flowing_lava', {}, srcMissing);
  assertEqual(flowingLavaParts[0]!.elements[0]!.faces.up?.texture, 'minecraft:block/lava_still', 'flowing_lava texture is lava_still');

  // 12.4 resolveBlockModel singular alias
  const aliasParts = resolveBlockModel('minecraft:water', {}, srcMissing);
  assertEqual(aliasParts.length, 1, 'resolveBlockModel alias works');
}

// ============================================================================
// Summary
// ============================================================================
console.log('\n=== Slice E2.1 Model Resolver Test Summary ===');
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);

if (failed > 0) {
  throw new Error(`Model resolver tests failed: ${failed} tests did not pass`);
}
