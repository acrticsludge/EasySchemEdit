// packages/asset-pipeline/src/index.ts
// Public API for the asset pipeline package.
export {
  loadAssets,
  autoDownloadAssets,
  importManualJar,
  type AssetPipelineResult,
} from './asset-pipeline.ts';

export {
  resolveClientJar,
  fetchVersionManifest,
  fetchVersionJson,
  type VersionManifest,
  type VersionJson,
} from './version-manifest.ts';

export {
  verifyClientJar,
  detectJarVersion,
  type JarVerificationResult,
} from './jar-verifier.ts';

export {
  extractZipEntries,
  extractAllAssets,
  type ExtractedAsset,
  type ExtractionResult,
} from './asset-extractor.ts';

export {
  cacheAssets,
  getCachedAssets,
  isCached,
  clearCache,
  type CachedAssetEntry,
} from './indexeddb-cache.ts';
