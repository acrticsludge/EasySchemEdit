// packages/asset-pipeline/src/index.ts
// Public API for the asset pipeline package (slice E1.6, AD-4).

export {
  PINNED_1_21_11_CLIENT_JAR_SHA1,
  PINNED_1_21_11_CLIENT_JAR_SIZE,
  TARGET_MINECRAFT_VERSION,
  MINECRAFT_VERSION_MANIFEST_URL,
  fetchVersionManifest,
  fetchVersionJson,
  resolveClientJar,
  sha1Hex,
  defaultSha1Hex,
  verifyClientJarSha1,
  type VersionManifest,
  type VersionJson,
  type FetchFn,
  type Sha1Fn,
} from './version-manifest.ts';

export {
  verifyClientJar,
  detectJarVersion,
  detectJarVersionSync,
  type JarVerificationResult,
  type JarVersionInfo,
} from './jar-verifier.ts';

export {
  extractZipEntries,
  extractZipEntriesSync,
  extractAllAssets,
  extractAllAssetsSync,
  findZipEntry,
  findZipEntrySync,
  isExtractableAssetPath,
  type ExtractedAsset,
  type ExtractionResult,
} from './asset-extractor.ts';

export {
  composeAssetPacks,
  normalizeExtractedAssets,
  type ExtractedAssets,
  type ExtractedAssetsInput,
  type MergedAssetBundle,
} from './pack-layering.ts';

export {
  loadAssets,
  autoDownloadAssets,
  importManualJar,
  AssetPipelineError,
  type AssetPipelineResult,
  type AssetPipelineStage,
  type AssetProgressEvent,
  type AssetProgressCallback,
  type AutoDownloadOptions,
  type ImportManualJarOptions,
  type LoadAssetsOptions,
} from './asset-pipeline.ts';

export {
  cacheAssets,
  getCachedAssets,
  isCached,
  clearCache,
  createAssetCacheKey,
  MemoryAssetCacheStore,
  IndexedDbAssetCacheStore,
  type CachedAssetEntry,
  type AssetCacheStore,
} from './indexeddb-cache.ts';
