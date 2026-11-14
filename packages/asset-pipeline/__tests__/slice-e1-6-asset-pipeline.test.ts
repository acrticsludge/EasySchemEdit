// packages/asset-pipeline/__tests__/slice-e1-6-asset-pipeline.test.ts
// Unit tests for asset-pipeline upgrades (slice E1.6, AD-4).
// Uses purely in-memory synthetic ZIP buffers built in-test with fflate.zipSync
// (EXPLICITLY SYNTHETIC FIXTURES - NO COMMITTED OR REAL ASSETS INVOLVED).
// Pure TypeScript, runs with: node --experimental-strip-types packages/asset-pipeline/__tests__/slice-e1-6-asset-pipeline.test.ts

import { zipSync, strToU8, strFromU8 } from 'fflate';
import {
  PINNED_1_21_11_CLIENT_JAR_SHA1,
  PINNED_1_21_11_CLIENT_JAR_SIZE,
  TARGET_MINECRAFT_VERSION,
  autoDownloadAssets,
  importManualJar,
  loadAssets,
  composeAssetPacks,
  extractAllAssetsSync,
  detectJarVersionSync,
  MemoryAssetCacheStore,
  createAssetCacheKey,
  type AssetProgressEvent,
} from '../src/index.ts';

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
    console.error(`FAIL: ${msg} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

// ============================================================================
// Synthetic Test Fixtures (in-memory synthetic ZIP buffers built with fflate)
// ============================================================================

// Synthetic valid 1.21.11 client JAR structure
const SYNTHETIC_VALID_JAR_FILES: Record<string, Uint8Array> = {
  'version.json': strToU8(JSON.stringify({ id: '1.21.11', name: '1.21.11' })),
  'pack.mcmeta': strToU8(JSON.stringify({ pack: { description: 'Synthetic Test Pack', pack_format: 75 } })),
  'assets/minecraft/blockstates/stone.json': strToU8(JSON.stringify({ variants: { '': { model: 'block/stone' } } })),
  'assets/minecraft/models/block/stone.json': strToU8(JSON.stringify({ parent: 'block/cube_all', textures: { all: 'block/stone' } })),
  'assets/minecraft/textures/block/stone.png': new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x01, 0x02, 0x03, 0x04]),
  'assets/minecraft/textures/block/stone.png.mcmeta': strToU8(JSON.stringify({ animation: { frametime: 2 } })),
  // Unrelated files to test extraction filter:
  'net/minecraft/client/Main.class': new Uint8Array([0xca, 0xfe, 0xba, 0xbe, 0x00, 0x01]),
  'assets/minecraft/sounds/ambient/cave.ogg': strToU8('OggS-synthetic-sound-bytes'),
  'assets/minecraft/lang/en_us.json': strToU8(JSON.stringify({ 'gui.done': 'Done' })),
};

const syntheticJarBytes: Uint8Array = zipSync(SYNTHETIC_VALID_JAR_FILES);
const SYNTHETIC_EXPECTED_SHA1 = '11223344556677889900aabbccddeeff11223344';

// Synthetic JAR with older version.json ("1.20.4")
const SYNTHETIC_1_20_4_JAR_FILES: Record<string, Uint8Array> = {
  'version.json': strToU8(JSON.stringify({ id: '1.20.4', name: '1.20.4' })),
  'assets/minecraft/blockstates/stone.json': strToU8(JSON.stringify({ variants: { '': { model: 'block/stone' } } })),
};
const syntheticJar1204Bytes: Uint8Array = zipSync(SYNTHETIC_1_20_4_JAR_FILES);

// ============================================================================
// Test 1: autoDownloadAssets with mock fetchFn & sha1Fn
// ============================================================================
async function test1_autoDownloadSuccess(): Promise<void> {
  console.log('--- Test 1: autoDownloadAssets happy path ---');

  const manifestUrl = 'https://synthetic-meta.mojang.com/version_manifest_v2.json';
  const versionPackageUrl = 'https://synthetic-meta.mojang.com/1.21.11.json';
  const clientJarUrl = 'https://synthetic-data.mojang.com/client.jar';

  const mockManifest = {
    latest: { release: '1.21.11', snapshot: '1.21.11' },
    versions: [
      { id: '1.21.11', type: 'release', url: versionPackageUrl, time: '2026-01-01', releaseTime: '2026-01-01' },
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

  const mockFetch: typeof globalThis.fetch = async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url === manifestUrl) {
      return new Response(JSON.stringify(mockManifest), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (url === versionPackageUrl) {
      return new Response(JSON.stringify(mockVersionJson), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (url === clientJarUrl) {
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
  const store = new MemoryAssetCacheStore();
  const progressEvents: AssetProgressEvent[] = [];

  const result = await autoDownloadAssets({
    versionId: '1.21.11',
    manifestUrl,
    fetchFn: mockFetch,
    sha1Fn: mockSha1Fn,
    store,
    onProgress: (ev) => progressEvents.push(ev),
  });

  assert(result.ok === true, 'autoDownloadAssets result.ok should be true');
  assertEqual(result.version, '1.21.11', 'result.version should be 1.21.11');
  assertEqual(result.clientJarSha1, SYNTHETIC_EXPECTED_SHA1, 'result.clientJarSha1 should match synthetic SHA-1');
  assertEqual(result.manualJarRequired, false, 'manualJarRequired should be false');
  assert(typeof result.assetCount === 'number' && result.assetCount > 0, 'assetCount should be positive');

  // Verify caching under key "1.21.11:<sha1>"
  const cacheKey = createAssetCacheKey('1.21.11', SYNTHETIC_EXPECTED_SHA1);
  const isPresentInStore = await store.has(cacheKey);
  assert(isPresentInStore, `Store should contain entry under key "${cacheKey}"`);

  const cachedEntry = (await store.get(cacheKey)) as any;
  assert(cachedEntry !== undefined, 'Cached entry should be defined');
  assertEqual(cachedEntry.version, '1.21.11', 'Cached entry version should match');
  assertEqual(cachedEntry.hash, SYNTHETIC_EXPECTED_SHA1, 'Cached entry hash should match');
  assert(cachedEntry.assetPaths.includes('assets/minecraft/blockstates/stone.json'), 'Cache should include stone blockstate');
  assert(cachedEntry.assetPaths.includes('assets/minecraft/models/block/stone.json'), 'Cache should include stone model');
  assert(cachedEntry.assetPaths.includes('assets/minecraft/textures/block/stone.png'), 'Cache should include stone texture');
  assert(cachedEntry.assetPaths.includes('version.json'), 'Cache should include version.json');

  // Verify progress callbacks
  const stages = progressEvents.map((e) => e.stage);
  assert(stages.includes('manifest'), 'Progress should include manifest stage');
  assert(stages.includes('downloading'), 'Progress should include downloading stage');
  assert(stages.includes('verifying'), 'Progress should include verifying stage');
  assert(stages.includes('extracting'), 'Progress should include extracting stage');
  assert(stages.includes('caching'), 'Progress should include caching stage');
  assert(stages.includes('done'), 'Progress should include done stage');

  const dlEvents = progressEvents.filter((e) => e.stage === 'downloading');
  assert(dlEvents.length > 0, 'Progress should record downloading events');
  assert(
    dlEvents.some((e) => (e.bytesLoaded ?? 0) > 0),
    'Downloading events should report bytesLoaded > 0',
  );

  const extractEvent = progressEvents.find((e) => e.stage === 'extracting' && e.entriesExtracted !== undefined);
  assert(extractEvent !== undefined && (extractEvent.entriesExtracted ?? 0) > 0, 'Extracting event should report entriesExtracted');
}

// ============================================================================
// Test 2: Wrong SHA-1 is rejected with SHA1_MISMATCH error
// ============================================================================
async function test2_wrongSha1Rejected(): Promise<void> {
  console.log('--- Test 2: Wrong SHA-1 rejection ---');

  const mockManifest = {
    latest: { release: '1.21.11', snapshot: '1.21.11' },
    versions: [{ id: '1.21.11', type: 'release', url: 'https://synthetic/1.21.11.json', time: '', releaseTime: '' }],
  };

  const mockVersionJson = {
    id: '1.21.11',
    downloads: {
      client: {
        sha1: 'expected-correct-sha1-hash',
        size: syntheticJarBytes.length,
        url: 'https://synthetic/client.jar',
      },
    },
  };

  const mockFetch: typeof globalThis.fetch = async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith('manifest.json')) return new Response(JSON.stringify(mockManifest), { status: 200 });
    if (url.endsWith('1.21.11.json')) return new Response(JSON.stringify(mockVersionJson), { status: 200 });
    return new Response(syntheticJarBytes.buffer as ArrayBuffer, { status: 200 });
  };

  // Mock sha1Fn returning an actual hash that DOES NOT match expected
  const mockSha1Fn = async (_data: Uint8Array) => 'actual-corrupt-or-wrong-sha1';

  const result = await autoDownloadAssets({
    versionId: '1.21.11',
    manifestUrl: 'https://synthetic/manifest.json',
    fetchFn: mockFetch,
    sha1Fn: mockSha1Fn,
  });

  assert(result.ok === false, 'result.ok should be false on SHA-1 mismatch');
  assertEqual(result.errorCode, 'SHA1_MISMATCH', 'errorCode should be SHA1_MISMATCH');
  assertEqual(result.manualJarRequired, true, 'manualJarRequired should be true');
}

// ============================================================================
// Test 3: Wrong Minecraft version in version.json is rejected on importManualJar
// ============================================================================
async function test3_wrongMinecraftVersionRejected(): Promise<void> {
  console.log('--- Test 3: Wrong Minecraft version in version.json rejected ---');

  // Synthetic JAR has id: "1.20.4"
  const result = await importManualJar(syntheticJar1204Bytes, {
    targetVersion: '1.21.11',
    // Do not pass expectedSha1 so SHA-1 check does not fail before version check
  });

  assert(result.ok === false, 'importManualJar should fail on wrong version');
  assertEqual(result.errorCode, 'ASSET_WRONG_VERSION', 'errorCode should be ASSET_WRONG_VERSION');
  assertEqual(result.manualJarRequired, true, 'manualJarRequired should be true');
  assert(
    result.errorMessage !== undefined && result.errorMessage.includes('1.20.4') && result.errorMessage.includes('1.21.11'),
    `errorMessage should mention both 1.20.4 and 1.21.11 (got: ${result.errorMessage})`,
  );
}

// ============================================================================
// Test 4: Network failure in autoDownloadAssets surfaces ASSET_DOWNLOAD_FAILED
// ============================================================================
async function test4_networkFailureSurfacesAssetDownloadFailed(): Promise<void> {
  console.log('--- Test 4: Network failure surfaces ASSET_DOWNLOAD_FAILED ---');

  const failingFetch: typeof globalThis.fetch = async () => {
    throw new Error('TypeError: Failed to fetch (CORS block / offline)');
  };

  const result = await autoDownloadAssets({
    versionId: '1.21.11',
    manifestUrl: 'https://blocked-cors.mojang.com/manifest.json',
    fetchFn: failingFetch,
  });

  assert(result.ok === false, 'result.ok should be false on network failure');
  assertEqual(result.errorCode, 'ASSET_DOWNLOAD_FAILED', 'errorCode should be ASSET_DOWNLOAD_FAILED');
  assertEqual(result.manualJarRequired, true, 'manualJarRequired should be true');
  assert(
    result.errorMessage !== undefined && result.errorMessage.includes('Failed to fetch'),
    'errorMessage should describe the network error',
  );
}

// ============================================================================
// Test 5: Extraction filter ignores unrelated files in the JAR
// ============================================================================
async function test5_extractionFilterIgnoresUnrelatedFiles(): Promise<void> {
  console.log('--- Test 5: Extraction filter ignores unrelated files ---');

  const extraction = extractAllAssetsSync(syntheticJarBytes);

  const paths = extraction.assets.map((a) => a.path);

  // Must include editor assets
  assert(paths.includes('assets/minecraft/blockstates/stone.json'), 'Should extract stone blockstate');
  assert(paths.includes('assets/minecraft/models/block/stone.json'), 'Should extract stone model');
  assert(paths.includes('assets/minecraft/textures/block/stone.png'), 'Should extract stone texture');
  assert(paths.includes('assets/minecraft/textures/block/stone.png.mcmeta'), 'Should extract stone texture mcmeta');
  assert(paths.includes('version.json'), 'Should extract version.json');
  assert(paths.includes('pack.mcmeta'), 'Should extract pack.mcmeta');

  // Must ignore unrelated files
  assert(!paths.includes('net/minecraft/client/Main.class'), 'Must ignore Main.class');
  assert(!paths.includes('assets/minecraft/sounds/ambient/cave.ogg'), 'Must ignore sounds');
  assert(!paths.includes('assets/minecraft/lang/en_us.json'), 'Must ignore language json');

  assertEqual(extraction.errors.length, 0, 'Extraction errors should be empty');
}

// ============================================================================
// Test 6: composeAssetPacks override precedence
// ============================================================================
async function test6_composeAssetPacksPrecedence(): Promise<void> {
  console.log('--- Test 6: composeAssetPacks override precedence ---');

  // Vanilla base pack
  const vanillaBlockstateStone = { variants: { '': { model: 'block/stone' } } };
  const vanillaModelStone = { parent: 'block/cube_all', textures: { all: 'block/stone' } };
  const vanillaTextureStone = new Uint8Array([1, 1, 1, 1]);

  const vanillaBlockstateOak = { variants: { '': { model: 'block/oak_planks' } } };
  const vanillaModelOak = { parent: 'block/cube_all', textures: { all: 'vanilla_oak_texture' } };
  const vanillaTextureOak = new Uint8Array([2, 2, 2, 2]);
  const vanillaMcmetaOak = { animation: { frametime: 4 } };

  const baseFiles = new Map<string, Uint8Array>();
  baseFiles.set('assets/minecraft/blockstates/stone.json', strToU8(JSON.stringify(vanillaBlockstateStone)));
  baseFiles.set('assets/minecraft/models/block/stone.json', strToU8(JSON.stringify(vanillaModelStone)));
  baseFiles.set('assets/minecraft/textures/block/stone.png', vanillaTextureStone);

  baseFiles.set('assets/minecraft/blockstates/oak_planks.json', strToU8(JSON.stringify(vanillaBlockstateOak)));
  baseFiles.set('assets/minecraft/models/block/oak_planks.json', strToU8(JSON.stringify(vanillaModelOak)));
  baseFiles.set('assets/minecraft/textures/block/oak_planks.png', vanillaTextureOak);
  baseFiles.set('assets/minecraft/textures/block/oak_planks.png.mcmeta', strToU8(JSON.stringify(vanillaMcmetaOak)));

  const basePack = { files: baseFiles, version: '1.21.11' };

  // Custom override resource pack overriding oak_planks model and texture
  const customModelOak = { parent: 'block/cube_all', textures: { all: 'custom_high_res_oak' } };
  const customTextureOak = new Uint8Array([99, 99, 99, 99]);

  const overrideFiles = new Map<string, Uint8Array>();
  overrideFiles.set('assets/minecraft/models/block/oak_planks.json', strToU8(JSON.stringify(customModelOak)));
  overrideFiles.set('assets/minecraft/textures/block/oak_planks.png', customTextureOak);

  const customPack = { files: overrideFiles, description: 'Custom Oak Pack' };

  // Compose with override pack on top of base pack
  const bundle = composeAssetPacks(basePack, [customPack]);

  // 1. Oak planks model should be OVERRIDDEN
  const resolvedOakModel1 = bundle.getModel('oak_planks') as any;
  assert(resolvedOakModel1 !== undefined, 'bundle.getModel("oak_planks") should resolve');
  assertEqual(resolvedOakModel1?.textures?.all, 'custom_high_res_oak', 'Oak planks model texture should come from custom pack');

  const resolvedOakModel2 = bundle.getModel('oak_planks.json') as any;
  assertEqual(resolvedOakModel2?.textures?.all, 'custom_high_res_oak', 'bundle.getModel("oak_planks.json") should resolve custom model');

  const resolvedOakModel3 = bundle.getModel('minecraft:block/oak_planks') as any;
  assertEqual(resolvedOakModel3?.textures?.all, 'custom_high_res_oak', 'bundle.getModel("minecraft:block/oak_planks") should resolve custom model');

  // 2. Oak planks texture should be OVERRIDDEN
  const resolvedOakTexture = bundle.getTexture('oak_planks');
  assert(resolvedOakTexture !== undefined, 'bundle.getTexture("oak_planks") should resolve');
  assertEqual(resolvedOakTexture?.[0], 99, 'Oak planks texture byte 0 should be 99 from custom pack');

  const resolvedOakTextureByFilename = bundle.getTexture('oak_planks.png');
  assertEqual(resolvedOakTextureByFilename?.[0], 99, 'bundle.getTexture("oak_planks.png") should resolve custom texture');

  // 3. Stone assets should be INHERITED from base pack (non-overridden)
  const resolvedStoneBlockState = bundle.getBlockState('stone') as any;
  assert(resolvedStoneBlockState !== undefined, 'bundle.getBlockState("stone") should resolve');
  assertEqual(resolvedStoneBlockState?.variants?.['']?.model, 'block/stone', 'Stone blockstate should be inherited from base');

  const resolvedStoneBlockStateByJson = bundle.getBlockState('stone.json') as any;
  assertEqual(resolvedStoneBlockStateByJson?.variants?.['']?.model, 'block/stone', 'bundle.getBlockState("stone.json") should resolve');

  const resolvedStoneModel = bundle.getModel('stone') as any;
  assert(resolvedStoneModel !== undefined, 'bundle.getModel("stone") should resolve');
  assertEqual(resolvedStoneModel?.textures?.all, 'block/stone', 'Stone model should be inherited from base');

  const resolvedStoneTexture = bundle.getTexture('stone');
  assert(resolvedStoneTexture !== undefined, 'bundle.getTexture("stone") should resolve');
  assertEqual(resolvedStoneTexture?.[0], 1, 'Stone texture byte 0 should be 1 from base pack');

  // 4. Oak planks blockstate was NOT in custom pack -> inherited from base pack
  const resolvedOakBlockState = bundle.getBlockState('oak_planks') as any;
  assert(resolvedOakBlockState !== undefined, 'Oak blockstate should be inherited from base pack');
  assertEqual(resolvedOakBlockState?.variants?.['']?.model, 'block/oak_planks', 'Oak blockstate should match base');

  // 5. Oak planks mcmeta was NOT in custom pack -> inherited from base pack
  const resolvedOakMcmeta = bundle.getTextureMcmeta('oak_planks') as any;
  assert(resolvedOakMcmeta !== undefined, 'Oak texture mcmeta should be inherited from base pack');
  assertEqual(resolvedOakMcmeta?.animation?.frametime, 4, 'Oak frametime should match base');

  // 6. Non-existent asset returns undefined
  assert(bundle.getModel('non_existent_model') === undefined, 'Non-existent model returns undefined');
  assert(bundle.getBlockState('non_existent_state') === undefined, 'Non-existent blockstate returns undefined');
  assert(bundle.getTexture('non_existent_tex') === undefined, 'Non-existent texture returns undefined');
}

// ============================================================================
// Test 7: Pinned constants verification
// ============================================================================
function test7_pinnedConstants(): void {
  console.log('--- Test 7: Pinned constants ---');
  assertEqual(PINNED_1_21_11_CLIENT_JAR_SHA1, 'ba2df812c2d12e0219c489c4cd9a5e1f0760f5bd', 'Pinned SHA-1 constant');
  assertEqual(PINNED_1_21_11_CLIENT_JAR_SIZE, 31152600, 'Pinned size constant');
  assertEqual(TARGET_MINECRAFT_VERSION, '1.21.11', 'Target Minecraft version constant');
}

// ============================================================================
// Test 8: Custom resource pack extraction with wrapper folder and subfolders
// ============================================================================
async function test8_topLevelWrapperAndSubfolderCustomPack(): Promise<void> {
  console.log('--- Test 8: Top-level wrapper and subfolder custom pack extraction ---');

  // Synthetic custom resource pack zip with top-level wrapper directory "MyPack/"
  // and nested texture subfolder "textures/block/custom/"
  const customStonePng = new Uint8Array([0x50, 0x41, 0x43, 0x4b, 1]);
  const customTilePng = new Uint8Array([0x50, 0x41, 0x43, 0x4b, 2]);

  const customPackFiles: Record<string, Uint8Array> = {
    'MyPack/pack.mcmeta': strToU8(JSON.stringify({ pack: { description: 'Wrapped Custom Pack', pack_format: 34 } })),
    'MyPack/assets/minecraft/textures/block/stone.png': customStonePng,
    'MyPack/assets/minecraft/textures/block/custom/tile.png': customTilePng,
    // Unrelated file inside wrapper should still be filtered out
    'MyPack/assets/minecraft/sounds/custom.ogg': strToU8('OggS-synthetic-sound'),
  };

  const customZipBytes = zipSync(customPackFiles);
  const extraction = extractAllAssetsSync(customZipBytes);

  assertEqual(extraction.errors.length, 0, 'Extraction errors should be empty');
  assertEqual(extraction.textureCount, 2, 'Should extract 2 textures');

  const paths = extraction.assets.map((a) => a.path);

  // Assert paths are normalized without "MyPack/" prefix
  assert(
    paths.includes('assets/minecraft/textures/block/stone.png'),
    'Should extract stone texture normalized to assets/minecraft/textures/block/stone.png',
  );
  assert(
    paths.includes('assets/minecraft/textures/block/custom/tile.png'),
    'Should extract custom subfolder texture normalized to assets/minecraft/textures/block/custom/tile.png',
  );
  assert(
    paths.includes('pack.mcmeta'),
    'Should extract pack.mcmeta normalized to root pack.mcmeta',
  );
  assert(
    !paths.some((p) => p.startsWith('MyPack/')),
    'No extracted asset path should retain the wrapper prefix MyPack/',
  );
  assert(
    !paths.includes('assets/minecraft/sounds/custom.ogg'),
    'Unrelated sounds in wrapped pack should still be filtered out',
  );

  // Now verify composition over vanilla base pack
  const vanillaStoneTexture = new Uint8Array([1, 1, 1, 1]);
  const vanillaOakTexture = new Uint8Array([2, 2, 2, 2]);

  const baseFiles = new Map<string, Uint8Array>();
  baseFiles.set('assets/minecraft/textures/block/stone.png', vanillaStoneTexture);
  baseFiles.set('assets/minecraft/textures/block/oak_planks.png', vanillaOakTexture);
  const basePack = { files: baseFiles, version: '1.21.11' };

  const bundle = composeAssetPacks(basePack, [extraction]);

  // 1. Stone texture should be OVERRIDDEN by custom pack
  const resolvedStone = bundle.getTexture('stone');
  assert(resolvedStone !== undefined, 'bundle.getTexture("stone") should resolve');
  assertEqual(resolvedStone?.[0], 0x50, 'Stone texture should come from custom pack');
  assertEqual(resolvedStone?.[4], 1, 'Stone texture byte 4 should be 1 from custom pack');

  // 2. Custom subfolder texture should be resolvable
  const resolvedCustomTile = bundle.getTexture('custom/tile');
  assert(resolvedCustomTile !== undefined, 'bundle.getTexture("custom/tile") should resolve');
  assertEqual(resolvedCustomTile?.[4], 2, 'Custom tile texture byte 4 should be 2');

  const resolvedCustomTileByBlock = bundle.getTexture('block/custom/tile');
  assert(resolvedCustomTileByBlock !== undefined, 'bundle.getTexture("block/custom/tile") should resolve');
  assertEqual(resolvedCustomTileByBlock?.[4], 2, 'Custom tile by block/custom/tile should match');

  // 3. Vanilla oak_planks should still be intact (inherited)
  const resolvedOak = bundle.getTexture('oak_planks');
  assert(resolvedOak !== undefined, 'bundle.getTexture("oak_planks") should resolve from base pack');
  assertEqual(resolvedOak?.[0], 2, 'Oak texture byte 0 should be 2 from base pack');
}

// ============================================================================
// Runner
// ============================================================================
async function runAll(): Promise<void> {
  console.log('Running slice E1.6 asset-pipeline test suite...\n');

  test7_pinnedConstants();
  await test1_autoDownloadSuccess();
  await test2_wrongSha1Rejected();
  await test3_wrongMinecraftVersionRejected();
  await test4_networkFailureSurfacesAssetDownloadFailed();
  await test5_extractionFilterIgnoresUnrelatedFiles();
  await test6_composeAssetPacksPrecedence();
  await test8_topLevelWrapperAndSubfolderCustomPack();

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    process.exit(1);
  }
}

runAll().catch((err) => {
  console.error('Unhandled test failure:', err);
  process.exit(1);
});
