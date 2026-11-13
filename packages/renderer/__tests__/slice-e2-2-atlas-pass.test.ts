// packages/renderer/__tests__/slice-e2-2-atlas-pass.test.ts
// Slice E2.2 tests: Texture atlas packing, render-pass classification, and default tints.
// Pure TypeScript, zero external test framework imports.

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

function assertClose(actual: number, expected: number, tolerance = 0.001, message = ''): void {
  if (Math.abs(actual - expected) <= tolerance) {
    passed++;
  } else {
    failed++;
    console.error(`FAIL: ${message} — expected ~${expected}, got ${actual} (diff: ${Math.abs(actual - expected)})`);
  }
}

// Imports from packages/renderer/src/index.ts
import {
  packAtlas,
  parseMcmetaAnimation,
  getFirstFrameDimensions,
  classifyPass,
  isTranslucentBlock,
  isCutoutBlock,
  isEmissiveBlock,
  TRANSLUCENT_BLOCKS,
  CUTOUT_BLOCKS,
  EMISSIVE_BLOCKS,
  getTint,
  hexToRgb,
  DEFAULT_PLAINS_GRASS_TINT,
  DEFAULT_PLAINS_FOLIAGE_TINT,
  BIRCH_LEAVES_TINT,
  SPRUCE_LEAVES_TINT,
  WATER_TINT,
  LILY_PAD_TINT,
} from '../src/index.ts';

import type { AtlasEntryInput, AtlasPageRect } from '../src/index.ts';

// ============================================================================
// 1. Texture Atlas Packing Tests
// ============================================================================
console.log('--- 1. Atlas Packer: Layout, Determinism, Bounds, Overlaps, Multi-page ---');

{
  // Test: Empty entries
  const emptyResult = packAtlas([], { maxSize: 512, padding: 0 });
  assertEqual(emptyResult.pages.length, 0, 'Empty input produces 0 pages');
  assertEqual(emptyResult.rects.size, 0, 'Empty input produces 0 rects');
}

{
  // Test: Standard packing with multiple textures
  const entries: AtlasEntryInput[] = [
    { id: 'stone', width: 16, height: 16 },
    { id: 'dirt', width: 16, height: 16 },
    { id: 'cobblestone', width: 16, height: 16 },
    { id: 'chest_front', width: 32, height: 32 },
    { id: 'tall_banner', width: 16, height: 32 },
    { id: 'wide_painting', width: 64, height: 32 },
    { id: 'bed', width: 32, height: 16 },
  ];

  const result = packAtlas(entries, { maxSize: 256, padding: 2 });
  assert(result.pages.length >= 1, 'Packed into at least 1 page');
  assertEqual(result.rects.size, entries.length, 'All entries packed');

  const page = result.pages[0];
  assert(page.width === 256 && page.height === 256, 'Page size is power-of-two 256x256');

  // Verify all within page bounds
  const rectsList = Array.from(result.rects.values());
  for (const r of rectsList) {
    const p = result.pages[r.page];
    assert(r.x >= 0, `Rect ${r.x} >= 0`);
    assert(r.y >= 0, `Rect ${r.y} >= 0`);
    assert(r.x + r.w <= p.width, `Rect right edge (${r.x + r.w}) <= page width (${p.width})`);
    assert(r.y + r.h <= p.height, `Rect bottom edge (${r.y + r.h}) <= page height (${p.height})`);

    // Verify UV calculations
    assertClose(r.u0, r.x / p.width, 1e-6, 'u0 is x / width');
    assertClose(r.v0, r.y / p.height, 1e-6, 'v0 is y / height');
    assertClose(r.u1, (r.x + r.w) / p.width, 1e-6, 'u1 is (x + w) / width');
    assertClose(r.v1, (r.y + r.h) / p.height, 1e-6, 'v1 is (y + h) / height');
  }

  // Verify NO overlapping rects (pairwise check on same page)
  let overlapCount = 0;
  for (let i = 0; i < rectsList.length; i++) {
    for (let j = i + 1; j < rectsList.length; j++) {
      const a = rectsList[i];
      const b = rectsList[j];
      if (a.page !== b.page) continue;

      const separatesX = a.x + a.w <= b.x || b.x + b.w <= a.x;
      const separatesY = a.y + a.h <= b.y || b.y + b.h <= a.y;
      if (!separatesX && !separatesY) {
        overlapCount++;
        console.error(`Overlap between rect ${i} and rect ${j}`);
      }
    }
  }
  assertEqual(overlapCount, 0, 'No overlapping rects on same page');
}

{
  // Test: Padding gutter between rects
  const padding = 4;
  const entries: AtlasEntryInput[] = [
    { id: 'tex_a', width: 32, height: 32 },
    { id: 'tex_b', width: 32, height: 32 },
  ];
  const result = packAtlas(entries, { maxSize: 256, padding });
  const a = result.rects.get('tex_a')!;
  const b = result.rects.get('tex_b')!;

  assert(a !== undefined && b !== undefined, 'Both textures packed');
  // Both on shelf 0: spacing between a and b must be >= 2 * padding
  const horizontalGap = Math.abs(b.x - a.x) - 32;
  assert(horizontalGap >= 2 * padding, `Gutter between textures is at least ${2 * padding}px (got ${horizontalGap}px)`);
}

{
  // Test: Determinism (scrambled input produces exact same layout)
  const entriesA: AtlasEntryInput[] = [
    { id: 'apple', width: 16, height: 16 },
    { id: 'banner', width: 32, height: 64 },
    { id: 'cobble', width: 16, height: 16 },
    { id: 'door', width: 16, height: 32 },
    { id: 'emerald', width: 16, height: 16 },
  ];

  const entriesB = [...entriesA].reverse();

  const resA = packAtlas(entriesA, { maxSize: 128, padding: 1 });
  const resB = packAtlas(entriesB, { maxSize: 128, padding: 1 });

  assertEqual(resA.pages.length, resB.pages.length, 'Same page count regardless of input order');
  for (const entry of entriesA) {
    const rA = resA.rects.get(entry.id)!;
    const rB = resB.rects.get(entry.id)!;
    assert(rA.page === rB.page, `Entry ${entry.id} placed on same page`);
    assert(rA.x === rB.x, `Entry ${entry.id} has same X (${rA.x} vs ${rB.x})`);
    assert(rA.y === rB.y, `Entry ${entry.id} has same Y (${rA.y} vs ${rB.y})`);
  }
}

{
  // Test: Overflow to second page
  // A 64x64 page can hold at most four 32x32 textures (area 4096 = 4 * 1024).
  // Five 32x32 textures MUST spill to page 1.
  const entries: AtlasEntryInput[] = [
    { id: 't1', width: 32, height: 32 },
    { id: 't2', width: 32, height: 32 },
    { id: 't3', width: 32, height: 32 },
    { id: 't4', width: 32, height: 32 },
    { id: 't5', width: 32, height: 32 },
  ];

  const result = packAtlas(entries, { maxSize: 64, padding: 0 });
  assert(result.pages.length >= 2, `Overflow created multiple pages (got ${result.pages.length})`);

  let page0Count = 0;
  let page1Count = 0;
  for (const r of result.rects.values()) {
    if (r.page === 0) page0Count++;
    if (r.page === 1) page1Count++;
  }
  assertEqual(page0Count, 4, 'Page 0 holds exactly 4 textures');
  assertEqual(page1Count, 1, 'Page 1 holds the overflowing 5th texture');
}

{
  // Test: Texture exceeding maxSize throws
  let threw = false;
  try {
    packAtlas([{ id: 'giant', width: 512, height: 512 }], { maxSize: 256, padding: 0 });
  } catch (err) {
    threw = true;
  }
  assert(threw, 'Packing texture larger than maxSize throws an error');
}

// ============================================================================
// 2. Mcmeta Animation Metadata Tests
// ============================================================================
console.log('--- 2. Mcmeta Animation Parser & First Frame Helper ---');

{
  // Wrapped format with frames and interpolate
  const json = {
    animation: {
      frametime: 3,
      interpolate: true,
      height: 16,
      frames: [0, 1, 2, { index: 3, time: 6 }],
    },
  };
  const anim = parseMcmetaAnimation(json);
  assert(anim !== null, 'Parsed animation successfully');
  assertEqual(anim?.frametime, 3, 'frametime is 3');
  assertEqual(anim?.interpolate, true, 'interpolate is true');
  assertEqual(anim?.frameHeight, 16, 'frameHeight is 16');
  assertEqual(anim?.frames?.length, 4, 'frames array has 4 elements');

  // Unwrapped format
  const unwrapped = {
    frametime: 2,
    frames: [0, 1],
  };
  const anim2 = parseMcmetaAnimation(unwrapped);
  assert(anim2 !== null, 'Parsed unwrapped animation');
  assertEqual(anim2?.frametime, 2, 'unwrapped frametime is 2');

  // Empty animation section defaults frametime to 1
  const emptyAnim = parseMcmetaAnimation({ animation: {} });
  assert(emptyAnim !== null, 'Parsed empty animation');
  assertEqual(emptyAnim?.frametime, 1, 'default frametime is 1');

  // Non-animation JSON returns null
  const packMeta = parseMcmetaAnimation({ pack: { pack_format: 15, description: 'Test' } });
  assertEqual(packMeta, null, 'Non-animation JSON returns null');
  assertEqual(parseMcmetaAnimation(null), null, 'null input returns null');
  assertEqual(parseMcmetaAnimation('not-an-object'), null, 'string input returns null');
}

{
  // Helper getFirstFrameDimensions
  // Vertical strip of 16x64 (4 frames) without mcmeta -> 16x16
  const dims1 = getFirstFrameDimensions(16, 64, null);
  assertEqual(dims1.width, 16, 'First frame width is image width (16)');
  assertEqual(dims1.height, 16, 'First frame height defaults to image width (16)');

  // Custom height in mcmeta
  const dims2 = getFirstFrameDimensions(32, 128, { animation: { height: 64 } });
  assertEqual(dims2.width, 32, 'First frame width is 32');
  assertEqual(dims2.height, 64, 'First frame height matches mcmeta height (64)');

  // Static square texture
  const dims3 = getFirstFrameDimensions(16, 16);
  assertEqual(dims3.width, 16, 'Static texture width is 16');
  assertEqual(dims3.height, 16, 'Static texture height is 16');
}

// ============================================================================
// 3. Render Pass Classification Tests (10+ known blocks)
// ============================================================================
console.log('--- 3. Render Pass Classification ---');

{
  // Test sets are exported and non-empty
  assert(TRANSLUCENT_BLOCKS.size > 0, 'TRANSLUCENT_BLOCKS exported');
  assert(CUTOUT_BLOCKS.size > 0, 'CUTOUT_BLOCKS exported');
  assert(EMISSIVE_BLOCKS.size > 0, 'EMISSIVE_BLOCKS exported');

  // 10+ known blocks across all passes
  assertEqual(classifyPass('minecraft:stone'), 'opaque', '1. stone is opaque');
  assertEqual(classifyPass('minecraft:oak_planks'), 'opaque', '2. oak_planks is opaque');
  assertEqual(classifyPass('minecraft:dirt'), 'opaque', '3. dirt is opaque');

  assertEqual(classifyPass('minecraft:water'), 'translucent', '4. water is translucent');
  assertEqual(classifyPass('minecraft:ice'), 'translucent', '5. ice is translucent');
  assertEqual(classifyPass('minecraft:tinted_glass'), 'translucent', '6. tinted_glass is translucent');
  assertEqual(classifyPass('minecraft:slime_block'), 'translucent', '7. slime_block is translucent');
  assertEqual(classifyPass('minecraft:honey_block'), 'translucent', '8. honey_block is translucent');
  assertEqual(classifyPass('minecraft:nether_portal'), 'translucent', '9. nether_portal is translucent');
  assertEqual(classifyPass('minecraft:cyan_stained_glass'), 'translucent', '10. cyan_stained_glass is translucent');

  assertEqual(classifyPass('minecraft:glass'), 'cutout', '11. glass is cutout');
  assertEqual(classifyPass('minecraft:oak_leaves'), 'cutout', '12. oak_leaves is cutout');
  assertEqual(classifyPass('minecraft:dandelion'), 'cutout', '13. dandelion is cutout');
  assertEqual(classifyPass('minecraft:rail'), 'cutout', '14. rail is cutout');
  assertEqual(classifyPass('minecraft:iron_bars'), 'cutout', '15. iron_bars is cutout');

  assertEqual(classifyPass('minecraft:glowstone'), 'emissive', '16. glowstone is emissive');
  assertEqual(classifyPass('minecraft:sea_lantern'), 'emissive', '17. sea_lantern is emissive');
  assertEqual(classifyPass('minecraft:shroomlight'), 'emissive', '18. shroomlight is emissive');
  assertEqual(classifyPass('minecraft:lava'), 'emissive', '19. lava is emissive');
  assertEqual(classifyPass('minecraft:magma_block'), 'emissive', '20. magma_block is emissive');
  assertEqual(classifyPass('minecraft:ochre_froglight'), 'emissive', '21. ochre_froglight is emissive');
  assertEqual(classifyPass('minecraft:jack_o_lantern'), 'emissive', '22. jack_o_lantern is emissive');

  // Redstone lamp lit vs unlit
  assertEqual(classifyPass('minecraft:redstone_lamp[lit=true]'), 'emissive', '23. lit redstone lamp is emissive');
  assertEqual(classifyPass('minecraft:redstone_lamp[lit=false]'), 'opaque', '24. unlit redstone lamp is opaque');
  assertEqual(classifyPass('redstone_lamp', 'none', { properties: { lit: 'true' } }), 'emissive', '25. lit redstone lamp via opts');

  // Texture alpha classification overrides
  assertEqual(classifyPass('custom_block', 'binary'), 'cutout', 'textureHasAlpha binary -> cutout');
  assertEqual(classifyPass('custom_block', 'partial'), 'translucent', 'textureHasAlpha partial -> translucent');
  assertEqual(classifyPass('custom_block', 'none'), 'opaque', 'textureHasAlpha none -> opaque');

  // Force pass override
  assertEqual(classifyPass('stone', 'none', { forcePass: 'emissive' }), 'emissive', 'forcePass overrides classification');

  // Predicate helpers
  assert(isTranslucentBlock('white_stained_glass_pane'), 'isTranslucentBlock matches stained glass pane');
  assert(isCutoutBlock('spruce_leaves'), 'isCutoutBlock matches spruce leaves');
  assert(isEmissiveBlock('verdant_froglight'), 'isEmissiveBlock matches verdant froglight');
}

// ============================================================================
// 4. Default Tints Tests (grass, foliage, fixed birch/spruce/water/lily)
// ============================================================================
console.log('--- 4. Tint Colors ---');

{
  // Hex to RGB verification
  const [gr, gg, gb] = hexToRgb(0x91bd59);
  assertClose(gr, 145 / 255, 1e-4, 'Plains grass red');
  assertClose(gg, 189 / 255, 1e-4, 'Plains grass green');
  assertClose(gb, 89 / 255, 1e-4, 'Plains grass blue');

  // Grass-tinted blocks
  const grassTint = getTint('grass_block', 0);
  assert(grassTint !== null, 'grass_block has tint');
  assertClose(grassTint![0], DEFAULT_PLAINS_GRASS_TINT[0], 1e-5, 'grass_block red matches 0x91BD59');
  assertClose(grassTint![1], DEFAULT_PLAINS_GRASS_TINT[1], 1e-5, 'grass_block green matches 0x91BD59');
  assertClose(grassTint![2], DEFAULT_PLAINS_GRASS_TINT[2], 1e-5, 'grass_block blue matches 0x91BD59');

  const shortGrassTint = getTint('minecraft:short_grass');
  assert(shortGrassTint !== null, 'short_grass has grass tint');
  assertClose(shortGrassTint![0], DEFAULT_PLAINS_GRASS_TINT[0], 1e-5, 'short_grass red matches grass tint');

  const fernTint = getTint('fern');
  assert(fernTint !== null, 'fern has grass tint');
  assertClose(fernTint![0], DEFAULT_PLAINS_GRASS_TINT[0], 1e-5, 'fern red matches grass tint');

  const sugarCaneTint = getTint('sugar_cane');
  assert(sugarCaneTint !== null, 'sugar_cane has grass tint');
  assertClose(sugarCaneTint![0], DEFAULT_PLAINS_GRASS_TINT[0], 1e-5, 'sugar_cane red matches grass tint');

  // Foliage-tinted blocks
  const oakTint = getTint('oak_leaves', 0);
  assert(oakTint !== null, 'oak_leaves has foliage tint');
  assertClose(oakTint![0], DEFAULT_PLAINS_FOLIAGE_TINT[0], 1e-5, 'oak_leaves red matches 0x77AB2F');
  assertClose(oakTint![1], DEFAULT_PLAINS_FOLIAGE_TINT[1], 1e-5, 'oak_leaves green matches 0x77AB2F');
  assertClose(oakTint![2], DEFAULT_PLAINS_FOLIAGE_TINT[2], 1e-5, 'oak_leaves blue matches 0x77AB2F');

  const vineTint = getTint('vine', 0);
  assert(vineTint !== null, 'vine has foliage tint');
  assertClose(vineTint![0], DEFAULT_PLAINS_FOLIAGE_TINT[0], 1e-5, 'vine red matches foliage tint');

  // Fixed birch leaves (0x80A755)
  const birchTint = getTint('birch_leaves', 0);
  assert(birchTint !== null, 'birch_leaves has fixed tint');
  assertClose(birchTint![0], BIRCH_LEAVES_TINT[0], 1e-5, 'birch_leaves red matches 0x80A755');
  assertClose(birchTint![1], BIRCH_LEAVES_TINT[1], 1e-5, 'birch_leaves green matches 0x80A755');
  assertClose(birchTint![2], BIRCH_LEAVES_TINT[2], 1e-5, 'birch_leaves blue matches 0x80A755');

  // Fixed spruce leaves (0x619961)
  const spruceTint = getTint('spruce_leaves', 0);
  assert(spruceTint !== null, 'spruce_leaves has fixed tint');
  assertClose(spruceTint![0], SPRUCE_LEAVES_TINT[0], 1e-5, 'spruce_leaves red matches 0x619961');

  // Water (0x3F76E4)
  const waterTint = getTint('water', 0);
  assert(waterTint !== null, 'water has tint');
  assertClose(waterTint![0], WATER_TINT[0], 1e-5, 'water red matches 0x3F76E4');
  assertClose(waterTint![1], WATER_TINT[1], 1e-5, 'water green matches 0x3F76E4');
  assertClose(waterTint![2], WATER_TINT[2], 1e-5, 'water blue matches 0x3F76E4');

  // Lily pad (0x208030)
  const lilyTint = getTint('lily_pad', 0);
  assert(lilyTint !== null, 'lily_pad has fixed tint');
  assertClose(lilyTint![0], LILY_PAD_TINT[0], 1e-5, 'lily_pad red matches 0x208030');

  // Untinted blocks return null
  assertEqual(getTint('stone', 0), null, 'stone has no tint (null)');
  assertEqual(getTint('glass', 0), null, 'glass has no tint (null)');
  assertEqual(getTint('diamond_block', 0), null, 'diamond_block has no tint (null)');

  // Negative tintindex returns null (untinted face, e.g. grass block side dirt)
  assertEqual(getTint('grass_block', -1), null, 'negative tintindex returns null');
  assertEqual(getTint('grass_block', 1), null, 'tintindex > 0 returns null for grass');
}

// ============================================================================
// Summary
// ============================================================================
console.log(`\n=== Slice E2.2 Test Summary ===`);
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);

if (failed > 0) {
  throw new Error(`Slice E2.2 tests failed: ${failed} failures`);
}
