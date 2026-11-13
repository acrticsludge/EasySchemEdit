// apps/web/__tests__/slice-e3-3-assets.test.ts
// Unit tests for Browser Asset Manager & GPU Texture Atlas Builder (Slice E3.3, AD-4).
// Uses purely in-memory synthetic ZIP buffers built in-test via fflate.zipSync
// (EXPLICITLY SYNTHETIC FIXTURES - NO COMMITTED OR REAL ASSETS INVOLVED).
// Run with: node --experimental-strip-types apps/web/__tests__/slice-e3-3-assets.test.ts

import { zipSync, strToU8, strFromU8 } from '../../../packages/asset-pipeline/node_modules/fflate/esm/index.mjs';
import {
  BrowserAssetManager,
  defaultPngDimensionReader,
  type BrowserAssetManagerSnapshot,
} from '../src/editor/assets/asset-manager.ts';
import {
  MemoryAssetCacheStore,
  createAssetCacheKey,
  TARGET_MINECRAFT_VERSION,
  type CachedAssetEntry,
  type AssetProgressEvent,
} from '@easyschemedit/asset-pipeline';

let passed = 0;
let failed = 0;

function assert(cond: boolean, msg: string): void {
  if (cond) {
    passed++;
  } else {
    failed++;
    console.error(`FAIL: ${msg}`);
  }
}

function assertEqual<T>(actual: T, expected: T, msg: string): void {
  if (actual === expected) {
    passed++;
  } else {
    failed++;
    console.error(
      `FAIL: ${msg} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
  }
}

// ============================================================================
// Synthetic Test Fixtures (in-memory synthetic ZIP and PNG buffers)
// ============================================================================

function createSyntheticPng(width = 16, height = 16): Uint8Array {
  // 8-byte signature + 4-byte len + 4-byte IHDR + 4-byte width + 4-byte height + 5 bytes + 4 bytes CRC = 33 bytes
  const png = new Uint8Array(33);
  // PNG signature: \x89PNG\r\n\x1a\n
  png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  // IHDR length = 13 (0x0000000d)
  png.set([0x00, 0x00, 0x00, 0x0d], 8);
  // Chunk type 'IHDR'
  png.set([0x49, 0x48, 0x44, 0x52], 12);
  // Width and height in big-endian
  const view = new DataView(png.buffer);
  view.setUint32(16, width, false);
  view.setUint32(20, height, false);
  // Bit depth 8, ColorType 6 (RGBA), Compression 0, Filter 0, Interlace 0
  png.set([0x08, 0x06, 0x00, 0x00, 0x00], 24);
  return png;
}

const SYNTHETIC_EXPECTED_SHA1 = '11223344556677889900aabbccddeeff11223344';

// Synthetic valid 1.21.11 client JAR structure
const SYNTHETIC_VALID_JAR_FILES: Record<string, Uint8Array> = {
  'version.json': strToU8(JSON.stringify({ id: '1.21.11', name: '1.21.11' })),
  'pack.mcmeta': strToU8(
    JSON.stringify({ pack: { description: 'Synthetic Test Pack', pack_format: 75 } }),
  ),
  'assets/minecraft/blockstates/stone.json': strToU8(
    JSON.stringify({ variants: { '': { model: 'block/stone' } } }),
  ),
  'assets/minecraft/models/block/stone.json': strToU8(
    JSON.stringify({ parent: 'block/cube_all', textures: { all: 'block/stone' } }),
  ),
  'assets/minecraft/textures/block/stone.png': createSyntheticPng(16, 16),
  'assets/minecraft/textures/block/stone.png.mcmeta': strToU8(
    JSON.stringify({ animation: { frametime: 2 } }),
  ),
};

const syntheticJarBytes: Uint8Array = zipSync(SYNTHETIC_VALID_JAR_FILES);

// ============================================================================
// Test Suite
// ============================================================================

async function runTests(): Promise<void> {
  console.log('=== Slice E3.3: Browser Asset Manager & Atlas Builder Tests ===\n');

  // Test 0: PNG Dimension Reader Verification
  console.log('--- Test 0: PNG Dimension Reader ---');
  {
    const png16 = createSyntheticPng(16, 16);
    const dim16 = defaultPngDimensionReader(png16);
    assertEqual(dim16.width, 16, 'PNG 16 width');
    assertEqual(dim16.height, 16, 'PNG 16 height');

    const png32 = createSyntheticPng(32, 64);
    const dim32 = defaultPngDimensionReader(png32);
    assertEqual(dim32.width, 32, 'PNG 32 width');
    assertEqual(dim32.height, 64, 'PNG 64 height');

    const invalid = new Uint8Array([1, 2, 3, 4]);
    const fallbackDim = defaultPngDimensionReader(invalid);
    assertEqual(fallbackDim.width, 16, 'Invalid PNG falls back to width 16');
    assertEqual(fallbackDim.height, 16, 'Invalid PNG falls back to height 16');
  }

  // Common Mock Fetch URLs
  const manifestUrl = 'https://synthetic-meta.mojang.com/version_manifest_v2.json';
  const versionPackageUrl = 'https://synthetic-meta.mojang.com/1.21.11.json';
  const clientJarUrl = 'https://synthetic-data.mojang.com/client.jar';

  const mockManifest = {
    latest: { release: '1.21.11', snapshot: '1.21.11' },
    versions: [
      {
        id: '1.21.11',
        type: 'release',
        url: versionPackageUrl,
        time: '2026-01-01',
        releaseTime: '2026-01-01',
      },
    ],
  };

  const mockVersionJson = {
    id: '1.21.11',
    downloads: {
      client: {
        sha1: SYNTHETIC_EXPECTED_SHA1,
        size: syntheticJarBytes.length,
        url: clientJarUrl,
      },
    },
  };

  let fetchJarCount = 0;
  const mockFetch: typeof globalThis.fetch = async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url === manifestUrl) {
      return new Response(JSON.stringify(mockManifest), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (url === versionPackageUrl) {
      return new Response(JSON.stringify(mockVersionJson), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (url === clientJarUrl) {
      fetchJarCount++;
      return new Response(syntheticJarBytes.buffer as ArrayBuffer, {
        status: 200,
        headers: {
          'Content-Type': 'application/java-archive',
          'Content-Length': String(syntheticJarBytes.length),
        },
      });
    }
    return new Response('Not Found', { status: 404 });
  };

  const mockSha1Fn = async (_data: Uint8Array) => SYNTHETIC_EXPECTED_SHA1;
  const sharedStore = new MemoryAssetCacheStore<CachedAssetEntry>();

  // ==========================================================================
  // Test 1: autoLoad() Happy Path
  // ==========================================================================
  console.log('\n--- Test 1: BrowserAssetManager.autoLoad() happy path ---');
  let manager = new BrowserAssetManager({
    fetchFn: mockFetch,
    sha1Fn: mockSha1Fn,
    cacheStore: sharedStore,
    manifestUrl,
    expectedSha1: SYNTHETIC_EXPECTED_SHA1,
  });

  // Verify initial state
  assertEqual(manager.state, 'idle', 'Initial state is idle');
  assertEqual(manager.progress, 0, 'Initial progress is 0');
  assert(manager.getAvailableBlockIds().length > 0, 'Fallback block IDs present initially');

  const progressEvents: AssetProgressEvent[] = [];
  let listenerCallCount = 0;
  manager.subscribe(() => {
    listenerCallCount++;
  });

  const res1 = await manager.autoLoad((evt) => progressEvents.push(evt));

  assert(res1.ok === true, 'autoLoad result.ok must be true');
  assertEqual(manager.state, 'ready', 'manager.state must be ready');
  assertEqual(manager.fromCache, false, 'First run fromCache must be false');
  assertEqual(manager.errorCode, null, 'errorCode must be null');
  assertEqual(manager.statusText, 'Ready (Downloaded)', 'statusText is Ready (Downloaded)');
  assertEqual(fetchJarCount, 1, 'client.jar was fetched exactly once');
  assert(listenerCallCount > 0, 'Subscribed listeners were notified');
  assert(progressEvents.length > 0, 'Progress events were emitted');

  // Verify AssetSource resolution
  const assetSource = manager.getAssetSource();
  const stoneState = assetSource.getBlockState('minecraft:stone');
  assert(stoneState !== undefined, 'AssetSource resolves stone blockstate');
  const stoneModel = assetSource.getModel('block/stone');
  assert(stoneModel !== undefined, 'AssetSource resolves stone model');

  // Verify UV lookup
  const uv = manager.getTextureUv('block/stone');
  assert(uv !== undefined, 'UV lookup resolves block/stone');
  assert(uv!.u0 >= 0 && uv!.u1 <= 1, 'u coordinates normalized between 0 and 1');
  assert(uv!.v0 >= 0 && uv!.v1 <= 1, 'v coordinates normalized between 0 and 1');

  // Verify direct path lookup as well
  const uvDirect = manager.getTextureUv('assets/minecraft/textures/block/stone.png');
  assert(uvDirect !== undefined, 'UV lookup resolves canonical archive path');

  // Verify available block IDs
  const blockIds = manager.getAvailableBlockIds();
  assert(blockIds.includes('minecraft:stone'), 'Available block IDs contains minecraft:stone');

  // Verify snapshot
  const snap1: BrowserAssetManagerSnapshot = manager.getStateSnapshot();
  assertEqual(snap1.state, 'ready', 'Snapshot state matches');
  assertEqual(snap1.textureCount, 1, 'Snapshot texture count matches atlas');
  assert(snap1.atlasDimensions.width > 0, 'Atlas has valid width');

  // Verify persistence in sharedStore
  const expectedCacheKey = createAssetCacheKey('1.21.11', SYNTHETIC_EXPECTED_SHA1);
  assert(await sharedStore.has(expectedCacheKey), 'Extracted assets cached in store');

  // ==========================================================================
  // Test 2: Second autoLoad() Hits Cache (fromCache === true)
  // ==========================================================================
  console.log('\n--- Test 2: Second autoLoad() hits MemoryAssetCacheStore ---');
  {
    let fetchCalled = false;
    const noFetch: typeof globalThis.fetch = async () => {
      fetchCalled = true;
      throw new Error('fetch should not be called on cache hit');
    };

    const manager2 = new BrowserAssetManager({
      fetchFn: noFetch,
      sha1Fn: mockSha1Fn,
      cacheStore: sharedStore,
      manifestUrl,
      expectedSha1: SYNTHETIC_EXPECTED_SHA1,
    });

    const res2 = await manager2.autoLoad();

    assert(res2.ok === true, 'Cached autoLoad must succeed');
    assertEqual(manager2.state, 'ready', 'Cached manager state must be ready');
    assertEqual(manager2.fromCache, true, 'fromCache must be true on second run');
    assertEqual(manager2.statusText, 'Ready (Cached)', 'statusText must be Ready (Cached)');
    assertEqual(fetchCalled, false, 'Network fetch was NOT called for JAR again');

    const uv2 = manager2.getTextureUv('block/stone');
    assert(uv2 !== undefined, 'UV lookup works identically from cache');
  }

  // ==========================================================================
  // Test 3: Network Failure & Manual JAR Drop-Zone Recovery
  // ==========================================================================
  console.log('\n--- Test 3: Network failure and manual JAR recovery ---');
  {
    const freshStore = new MemoryAssetCacheStore<CachedAssetEntry>();
    const failingFetch: typeof globalThis.fetch = async () => {
      throw new Error('CORS / Network Error downloading from Mojang CDN');
    };

    const manager3 = new BrowserAssetManager({
      fetchFn: failingFetch,
      sha1Fn: mockSha1Fn,
      cacheStore: freshStore,
      manifestUrl,
      expectedSha1: SYNTHETIC_EXPECTED_SHA1,
    });

    const failResult = await manager3.autoLoad();

    assert(failResult.ok === false, 'autoLoad returns ok: false on network error');
    assertEqual(manager3.state, 'error', 'manager3 state must be error');
    assertEqual(manager3.errorCode, 'ASSET_DOWNLOAD_FAILED', 'errorCode is ASSET_DOWNLOAD_FAILED');
    assertEqual(
      manager3.statusText,
      'Fallback Mode — Manual JAR Needed',
      'statusText is Fallback Mode — Manual JAR Needed',
    );

    // Procedural fallback AssetSource & uvLookup are preserved
    const fallbackSource = manager3.getAssetSource();
    assert(fallbackSource !== null, 'Fallback AssetSource is non-null');
    const fallbackBs = fallbackSource.getBlockState('minecraft:stone');
    assert(fallbackBs !== undefined, 'Fallback blockstate resolves without throwing');
    const fallbackUv = manager3.getTextureUv('block/stone');
    assert(fallbackUv !== undefined, 'Fallback UV lookup returns valid default UV');

    // Recovery via manual JAR import
    console.log('Testing manual JAR recovery...');
    const recResult = await manager3.loadManualJar(syntheticJarBytes, 'client.jar');

    assert(recResult.ok === true, 'loadManualJar succeeds');
    assertEqual(manager3.state, 'ready', 'manager3 state transitions to ready after manual JAR');
    assertEqual(manager3.errorCode, null, 'errorCode cleared on recovery');
    assertEqual(manager3.statusText, 'Ready (client.jar)', 'statusText reflects manual JAR file');

    const recoveredUv = manager3.getTextureUv('block/stone');
    assert(recoveredUv !== undefined, 'Recovered UV lookup resolves correctly');
  }

  // ==========================================================================
  // Test 4: Resource Pack Layering, Precedence, and Management
  // ==========================================================================
  console.log('\n--- Test 4: Resource Pack Layering & Override ---');
  {
    // Custom pack #1 with overridden stone.png (32x32) and new custom_block
    const customStonePng = createSyntheticPng(32, 32);
    const CUSTOM_PACK_1_FILES: Record<string, Uint8Array> = {
      'pack.mcmeta': strToU8(
        JSON.stringify({ pack: { description: 'Custom Synthetic Pack', pack_format: 75 } }),
      ),
      'assets/minecraft/textures/block/stone.png': customStonePng,
      'assets/minecraft/textures/block/custom_block.png': createSyntheticPng(16, 16),
      'assets/minecraft/blockstates/custom_block.json': strToU8(
        JSON.stringify({ variants: { '': { model: 'block/custom_block' } } }),
      ),
      'assets/minecraft/models/block/custom_block.json': strToU8(
        JSON.stringify({ parent: 'block/cube_all', textures: { all: 'block/custom_block' } }),
      ),
    };
    const customPack1Bytes = zipSync(CUSTOM_PACK_1_FILES);

    // Add Pack 1
    manager.addResourcePack(customPack1Bytes, 'custom-pack.zip');

    assertEqual(manager.resourcePacks.length, 1, 'One resource pack added');
    assertEqual(manager.resourcePacks[0]!.name, 'custom-pack.zip', 'Pack 1 name matches');
    assertEqual(manager.resourcePacks[0]!.enabled, true, 'Pack 1 enabled by default');

    // Stone texture should now be overridden by Pack 1 (32x32 bytes)
    const bundle1 = manager.getBundle();
    assert(bundle1 !== null, 'Bundle is defined');
    const stoneTex = bundle1!.getTexture('block/stone');
    assert(stoneTex !== undefined, 'Stone texture found');
    assertEqual(stoneTex!.length, customStonePng.length, 'Pack 1 stone.png overrides vanilla stone');

    // Available block IDs should now include custom_block
    assert(
      manager.getAvailableBlockIds().includes('minecraft:custom_block'),
      'Block picker includes custom_block from resource pack',
    );

    // Add Pack 2 (which overrides stone again with 64x64)
    const pack2StoneBytes = strToU8('pack-2-unique-stone-content');
    const PACK_2_FILES: Record<string, Uint8Array> = {
      'pack.mcmeta': strToU8(
        JSON.stringify({ pack: { description: 'Pack 2', pack_format: 75 } }),
      ),
      'assets/minecraft/textures/block/stone.png': pack2StoneBytes,
    };
    manager.addResourcePack(zipSync(PACK_2_FILES), 'pack-2.zip');

    assertEqual(manager.resourcePacks.length, 2, 'Two resource packs installed');
    assertEqual(manager.resourcePacks[0]!.name, 'pack-2.zip', 'Newest pack placed at index 0');

    // Pack 2 is at index 0, so its stone.png takes top precedence
    const stoneTex2 = manager.getBundle()!.getTexture('block/stone');
    assertEqual(strFromU8(stoneTex2!), 'pack-2-unique-stone-content', 'Pack 2 takes precedence at index 0');

    // Move Pack 2 down (index 0 -> index 1)
    const pack2Id = manager.resourcePacks[0]!.id;
    manager.moveResourcePack(pack2Id, 'down');
    assertEqual(manager.resourcePacks[0]!.name, 'custom-pack.zip', 'custom-pack is now at index 0');
    assertEqual(manager.resourcePacks[1]!.name, 'pack-2.zip', 'pack-2 is now at index 1');

    // After move, custom-pack.zip takes precedence again
    const stoneTexAfterMove = manager.getBundle()!.getTexture('block/stone');
    assertEqual(
      stoneTexAfterMove!.length,
      customStonePng.length,
      'custom-pack.zip stone overrides after moving pack-2 down',
    );

    // Toggle custom-pack disabled
    const customPackId = manager.resourcePacks[0]!.id;
    manager.toggleResourcePack(customPackId, false);
    assertEqual(manager.resourcePacks[0]!.enabled, false, 'custom-pack disabled');

    // Pack 2 is enabled and active at index 1, so it should take precedence
    const stoneTexAfterToggle = manager.getBundle()!.getTexture('block/stone');
    assertEqual(
      strFromU8(stoneTexAfterToggle!),
      'pack-2-unique-stone-content',
      'Pack 2 is active when top pack is disabled',
    );

    // Toggle Pack 2 disabled as well -> fallback to base vanilla stone
    manager.toggleResourcePack(pack2Id, false);
    const stoneTexVanilla = manager.getBundle()!.getTexture('block/stone');
    assertEqual(
      stoneTexVanilla!.length,
      33,
      'Vanilla stone restored when all override packs are disabled',
    );

    // Remove Pack 1
    manager.removeResourcePack(customPackId);
    assertEqual(manager.resourcePacks.length, 1, 'Pack 1 removed');
    assertEqual(manager.resourcePacks[0]!.name, 'pack-2.zip', 'Remaining pack is pack-2');

    // Clear cache and reset
    await manager.clearCacheAndReload();
    assertEqual(manager.state, 'idle', 'State is idle after clearCacheAndReload');
    assertEqual(manager.progress, 0, 'Progress reset to 0');
    assert(manager.getAvailableBlockIds().length > 0, 'Fallback block IDs active after clear');
  }

  // Summary
  console.log(`\n========================================`);
  console.log(`Tests finished: ${passed} passed, ${failed} failed`);
  console.log(`========================================`);

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Unhandled test failure:', err);
  process.exit(1);
});
