// packages/asset-pipeline/src/asset-pipeline.ts
// Orchestrator: auto-download path, manual JAR path, failure fallback (SUBSPEC-H §4.5, AD-4).
// Injected fetch/sha1/kv services for browser and Node compatibility.

import {
  TARGET_MINECRAFT_VERSION,
  PINNED_1_21_11_CLIENT_JAR_SHA1,
  defaultSha1Hex,
  resolveClientJar,
  type FetchFn,
  type Sha1Fn,
} from './version-manifest.ts';
import { extractAllAssetsSync } from './asset-extractor.ts';
import { verifyClientJar, detectJarVersionSync } from './jar-verifier.ts';
import {
  type AssetCacheStore,
  type CachedAssetEntry,
  MemoryAssetCacheStore,
  IndexedDbAssetCacheStore,
  createAssetCacheKey,
} from './indexeddb-cache.ts';
import type { ExtractedAssets } from './pack-layering.ts';

export type AssetPipelineStage =
  | 'manifest'
  | 'downloading'
  | 'verifying'
  | 'extracting'
  | 'caching'
  | 'done';

export interface AssetProgressEvent {
  stage: AssetPipelineStage;
  bytesLoaded?: number;
  bytesTotal?: number;
  entriesExtracted?: number;
  message?: string;
}

export type AssetProgressCallback = (event: AssetProgressEvent) => void;

export interface AssetPipelineResult {
  ok: boolean;
  version?: string;
  clientJarSha1?: string;
  assetCount?: number;
  assets?: ExtractedAssets;
  errorCode?: string;
  errorMessage?: string;
  manualJarRequired: boolean;
}

export interface AutoDownloadOptions {
  versionId?: string;
  expectedSha1?: string;
  fetchFn?: FetchFn;
  sha1Fn?: Sha1Fn;
  store?: AssetCacheStore;
  idbFactory?: IDBFactory;
  onProgress?: AssetProgressCallback;
  manifestUrl?: string;
  throwOnError?: boolean;
}

export interface ImportManualJarOptions {
  expectedSha1?: string;
  targetVersion?: string;
  sha1Fn?: Sha1Fn;
  store?: AssetCacheStore;
  idbFactory?: IDBFactory;
  onProgress?: AssetProgressCallback;
  throwOnError?: boolean;
}

export interface LoadAssetsOptions extends AutoDownloadOptions {
  forceDownload?: boolean;
}

export class AssetPipelineError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'AssetPipelineError';
    this.code = code;
  }
}

function resolveStoreInstance(
  store?: AssetCacheStore,
  idbFactory?: IDBFactory,
): AssetCacheStore<CachedAssetEntry> {
  if (store) return store as AssetCacheStore<CachedAssetEntry>;
  if (idbFactory) return new IndexedDbAssetCacheStore({ idbFactory });
  if (typeof indexedDB !== 'undefined') return new IndexedDbAssetCacheStore();
  return new MemoryAssetCacheStore<CachedAssetEntry>();
}

/**
 * Auto-download path: downloads client JAR from Mojang CDN, verifies SHA-1,
 * extracts block assets via fflate, and caches into AssetCacheStore keyed `<version>:<sha1>`.
 *
 * If CORS or network blocks download, returns errorCode = 'ASSET_DOWNLOAD_FAILED'
 * with manualJarRequired = true so UI transitions to manual JAR fallback.
 */
export async function autoDownloadAssets(
  versionIdOrOptions: string | AutoDownloadOptions = TARGET_MINECRAFT_VERSION,
  legacyOptions?: AutoDownloadOptions,
): Promise<AssetPipelineResult> {
  const options: AutoDownloadOptions =
    typeof versionIdOrOptions === 'string'
      ? { versionId: versionIdOrOptions, ...legacyOptions }
      : versionIdOrOptions;

  const versionId = options.versionId ?? TARGET_MINECRAFT_VERSION;
  const onProgress = options.onProgress;
  const fetchFn = options.fetchFn ?? globalThis.fetch;
  const sha1Fn = options.sha1Fn ?? defaultSha1Hex;
  const store = resolveStoreInstance(options.store, options.idbFactory);

  try {
    // 1. Resolve client JAR info from version manifest
    onProgress?.({ stage: 'manifest', message: `Resolving version ${versionId} manifest` });

    let resolved: { version: string; clientJarUrl: string; clientJarSha1: string; size: number };
    try {
      resolved = await resolveClientJar(versionId, {
        fetchFn,
        manifestUrl: options.manifestUrl,
      });
    } catch (err) {
      return {
        ok: false,
        errorCode: 'ASSET_DOWNLOAD_FAILED',
        errorMessage: `Failed to resolve version manifest: ${(err as Error).message}`,
        manualJarRequired: true,
      };
    }

    const expectedSha1 = options.expectedSha1 ?? resolved.clientJarSha1;
    const expectedSize = resolved.size;

    // 2. Download the client JAR
    onProgress?.({
      stage: 'downloading',
      bytesLoaded: 0,
      bytesTotal: expectedSize,
      message: `Downloading client.jar (${expectedSize} bytes)`,
    });

    let jarBytes: Uint8Array;
    try {
      const response = await fetchFn(resolved.clientJarUrl);
      if (!response.ok) {
        return {
          ok: false,
          errorCode: 'ASSET_DOWNLOAD_FAILED',
          errorMessage: `HTTP ${response.status} downloading client JAR from ${resolved.clientJarUrl}`,
          manualJarRequired: true,
        };
      }

      const contentLengthHeader = response.headers?.get?.('content-length');
      const bytesTotal = contentLengthHeader
        ? parseInt(contentLengthHeader, 10)
        : expectedSize;

      // Stream with live progress if getReader is available
      if (response.body && typeof response.body.getReader === 'function') {
        const reader = response.body.getReader();
        const chunks: Uint8Array[] = [];
        let bytesLoaded = 0;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) {
            chunks.push(value);
            bytesLoaded += value.length;
            onProgress?.({
              stage: 'downloading',
              bytesLoaded,
              bytesTotal,
            });
          }
        }

        jarBytes = new Uint8Array(bytesLoaded);
        let pos = 0;
        for (const c of chunks) {
          jarBytes.set(c, pos);
          pos += c.length;
        }
      } else {
        const buffer = await response.arrayBuffer();
        jarBytes = new Uint8Array(buffer);
        onProgress?.({
          stage: 'downloading',
          bytesLoaded: jarBytes.length,
          bytesTotal: jarBytes.length,
        });
      }
    } catch (err) {
      return {
        ok: false,
        errorCode: 'ASSET_DOWNLOAD_FAILED',
        errorMessage: `Network error downloading client JAR: ${(err as Error).message}`,
        manualJarRequired: true,
      };
    }

    // 3. Verify SHA-1
    onProgress?.({
      stage: 'verifying',
      bytesLoaded: jarBytes.length,
      bytesTotal: jarBytes.length,
      message: 'Verifying SHA-1 checksum',
    });

    const verification = await verifyClientJar(jarBytes, expectedSha1, sha1Fn);
    if (!verification.valid) {
      return {
        ok: false,
        errorCode: 'SHA1_MISMATCH',
        errorMessage: `JAR SHA-1 mismatch: expected ${expectedSha1}, got ${verification.actualSha1}`,
        manualJarRequired: true,
      };
    }

    // 4. Extract assets synchronously using fflate
    onProgress?.({
      stage: 'extracting',
      message: 'Extracting blockstates, models, and textures',
    });

    const extraction = extractAllAssetsSync(jarBytes);
    if (extraction.errors.length > 0) {
      return {
        ok: false,
        errorCode: 'ASSET_EXTRACTION_FAILED',
        errorMessage: extraction.errors.join('; '),
        manualJarRequired: true,
      };
    }

    onProgress?.({
      stage: 'extracting',
      entriesExtracted: extraction.assetCount,
    });

    // 5. Cache in store keyed `<version>:<sha1>`
    onProgress?.({
      stage: 'caching',
      entriesExtracted: extraction.assetCount,
      message: 'Persisting extracted assets in cache store',
    });

    const cacheKey = createAssetCacheKey(resolved.version, verification.actualSha1);
    const filesMap = new Map<string, Uint8Array>();
    for (const a of extraction.assets) {
      filesMap.set(a.path, a.data);
    }

    const cacheEntry: CachedAssetEntry = {
      version: resolved.version,
      hash: verification.actualSha1,
      cachedAt: new Date().toISOString(),
      assetPaths: extraction.assets.map((a) => a.path),
      files: filesMap,
    };
    await store.set(cacheKey, cacheEntry);

    onProgress?.({
      stage: 'done',
      bytesLoaded: jarBytes.length,
      bytesTotal: jarBytes.length,
      entriesExtracted: extraction.assetCount,
      message: 'Asset pipeline complete',
    });

    return {
      ok: true,
      version: resolved.version,
      clientJarSha1: verification.actualSha1,
      assetCount: extraction.assetCount,
      assets: {
        files: filesMap,
        version: resolved.version,
      },
      manualJarRequired: false,
    };
  } catch (err) {
    if (options.throwOnError) {
      throw err;
    }
    return {
      ok: false,
      errorCode: 'ASSET_DOWNLOAD_FAILED',
      errorMessage: `Unexpected error in asset auto-download: ${(err as Error).message}`,
      manualJarRequired: true,
    };
  }
}

/**
 * Manual JAR path: user-provided JAR buffer → verify SHA-1 (if expected hash specified)
 * → verify version.json / pack.mcmeta → worker extraction → cache store.
 */
export async function importManualJar(
  jarBytes: Uint8Array,
  optionsOrSha1?: string | ImportManualJarOptions,
): Promise<AssetPipelineResult> {
  const options: ImportManualJarOptions =
    typeof optionsOrSha1 === 'string'
      ? { expectedSha1: optionsOrSha1 }
      : optionsOrSha1 ?? {};

  const targetVersion = options.targetVersion ?? TARGET_MINECRAFT_VERSION;
  const onProgress = options.onProgress;
  const sha1Fn = options.sha1Fn ?? defaultSha1Hex;
  const store = resolveStoreInstance(options.store, options.idbFactory);

  try {
    // 1. Verify SHA-1 if caller specified an expected SHA-1
    if (options.expectedSha1) {
      onProgress?.({ stage: 'verifying', message: 'Verifying SHA-1 checksum of manual JAR' });
      const verification = await verifyClientJar(jarBytes, options.expectedSha1, sha1Fn);
      if (!verification.valid) {
        return {
          ok: false,
          errorCode: 'SHA1_MISMATCH',
          errorMessage: `Manual JAR SHA-1 mismatch: expected ${options.expectedSha1}, got ${verification.actualSha1}`,
          manualJarRequired: true,
        };
      }
    }

    // 2. Inspect version from JAR metadata (version.json and pack.mcmeta)
    onProgress?.({ stage: 'verifying', message: 'Inspecting version metadata inside JAR' });
    const detected = detectJarVersionSync(jarBytes);
    if (detected.error) {
      return {
        ok: false,
        errorCode: 'ASSET_JAR_READ_FAILED',
        errorMessage: detected.error,
        manualJarRequired: true,
      };
    }

    if (detected.version && detected.version !== targetVersion) {
      return {
        ok: false,
        errorCode: 'ASSET_WRONG_VERSION',
        errorMessage: `Manual JAR version "${detected.version}" does not match target version "${targetVersion}"`,
        manualJarRequired: true,
      };
    }

    // 3. Extract assets
    onProgress?.({ stage: 'extracting', message: 'Extracting assets from manual JAR' });
    const extraction = extractAllAssetsSync(jarBytes);
    if (extraction.errors.length > 0) {
      return {
        ok: false,
        errorCode: 'ASSET_EXTRACTION_FAILED',
        errorMessage: extraction.errors.join('; '),
        manualJarRequired: true,
      };
    }

    // 4. Cache in store
    onProgress?.({ stage: 'caching', entriesExtracted: extraction.assetCount });
    const actualHash = await sha1Fn(jarBytes);
    const version = detected.version ?? targetVersion;
    const cacheKey = createAssetCacheKey(version, actualHash);

    const filesMap = new Map<string, Uint8Array>();
    for (const a of extraction.assets) {
      filesMap.set(a.path, a.data);
    }

    const cacheEntry: CachedAssetEntry = {
      version,
      hash: actualHash,
      cachedAt: new Date().toISOString(),
      assetPaths: extraction.assets.map((a) => a.path),
      files: filesMap,
    };
    await store.set(cacheKey, cacheEntry);

    onProgress?.({
      stage: 'done',
      bytesLoaded: jarBytes.length,
      bytesTotal: jarBytes.length,
      entriesExtracted: extraction.assetCount,
    });

    return {
      ok: true,
      version,
      clientJarSha1: actualHash,
      assetCount: extraction.assetCount,
      assets: {
        files: filesMap,
        version,
      },
      manualJarRequired: false,
    };
  } catch (err) {
    if (options.throwOnError) {
      throw err;
    }
    return {
      ok: false,
      errorCode: 'ASSET_MANUAL_IMPORT_FAILED',
      errorMessage: `Manual JAR import failed: ${(err as Error).message}`,
      manualJarRequired: true,
    };
  }
}

/**
 * Main entry point: checks cache first, then attempts autoDownloadAssets.
 * On auto-download failure, surfaces manual JAR fallback state.
 */
export async function loadAssets(
  versionIdOrOptions: string | LoadAssetsOptions = TARGET_MINECRAFT_VERSION,
  legacyOptions?: LoadAssetsOptions,
): Promise<AssetPipelineResult> {
  const options: LoadAssetsOptions =
    typeof versionIdOrOptions === 'string'
      ? { versionId: versionIdOrOptions, ...legacyOptions }
      : versionIdOrOptions;

  const versionId = options.versionId ?? TARGET_MINECRAFT_VERSION;
  const store = resolveStoreInstance(options.store, options.idbFactory);

  if (!options.forceDownload) {
    const pinnedHashKey = createAssetCacheKey(versionId, PINNED_1_21_11_CLIENT_JAR_SHA1);
    const customHashKey = options.expectedSha1
      ? createAssetCacheKey(versionId, options.expectedSha1)
      : null;

    if (customHashKey && (await store.has(customHashKey))) {
      const cached = await store.get(customHashKey);
      return {
        ok: true,
        version: versionId,
        clientJarSha1: cached?.hash,
        assetCount: cached?.assetPaths.length,
        assets: cached?.files ? { files: cached.files, version: versionId } : undefined,
        manualJarRequired: false,
      };
    }

    if (await store.has(pinnedHashKey)) {
      const cached = await store.get(pinnedHashKey);
      return {
        ok: true,
        version: versionId,
        clientJarSha1: cached?.hash,
        assetCount: cached?.assetPaths.length,
        assets: cached?.files ? { files: cached.files, version: versionId } : undefined,
        manualJarRequired: false,
      };
    }
  }

  // Fall through to auto-download
  return autoDownloadAssets(options);
}
