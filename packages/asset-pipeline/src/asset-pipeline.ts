// packages/asset-pipeline/src/asset-pipeline.ts
// Orchestrator: auto-download path, manual JAR path, failure fallback.
// SUBSPEC-H §4.5: Phase 0 must verify both paths end-to-end.
// never a dead end — auto-download failure surfaces manual JAR zone.

export interface AssetPipelineResult {
  ok: boolean;
  version?: string;
  clientJarSha1?: string;
  assetCount?: number;
  errorCode?: string;
  errorMessage?: string;
  manualJarRequired: boolean;
}

// Auto-download path: browser downloads from official Mojang version manifest
// → client JAR URL → client JAR → verify SHA-1 → IndexedDB cache.
// Returns ASSET_DOWNLOAD_FAILED if CORS/network blocks the download.
export async function autoDownloadAssets(versionId: string = '1.21.11'): Promise<AssetPipelineResult> {
  try {
    const { resolveClientJar, verifyClientJarSha1 } = await import('./version-manifest.ts');

    // Step 1: resolve client JAR URL and SHA-1 from version manifest
    const resolved = await resolveClientJar(versionId);

    // Step 2: download the JAR (may fail with CORS in browser)
    let jarBytes: Uint8Array;
    try {
      const response = await fetch(resolved.clientJarUrl);
      if (!response.ok) {
        return {
          ok: false,
          errorCode: 'ASSET_DOWNLOAD_FAILED',
          errorMessage: `HTTP ${response.status} downloading client JAR`,
          manualJarRequired: true,
        };
      }
      const buffer = await response.arrayBuffer();
      jarBytes = new Uint8Array(buffer);
    } catch (err) {
      return {
        ok: false,
        errorCode: 'ASSET_DOWNLOAD_FAILED',
        errorMessage: `Network/CORS error: ${(err as Error).message}`,
        manualJarRequired: true,
      };
    }

    // Step 3: verify SHA-1
    const verification = await verifyClientJarSha1(jarBytes, resolved.clientJarSha1);
    if (!verification.valid) {
      return {
        ok: false,
        errorCode: 'ASSET_SHA1_MISMATCH',
        errorMessage: `JAR SHA-1 mismatch: expected ${resolved.clientJarSha1}, got ${verification.actualSha1}`,
        manualJarRequired: true,
      };
    }

    // Step 4: extract assets (blockstates, models, textures, .mcmeta, atlases, colormaps)
    const { extractZipEntries } = await import('./asset-extractor.ts');
    const extraction = await extractZipEntries(jarBytes, []);

    // Step 5: cache in IndexedDB
    const { cacheAssets } = await import('./indexeddb-cache.ts');
    await cacheAssets(resolved.version, verification.actualSha1, extraction.assets.map((a) => a.path));

    return {
      ok: true,
      version: resolved.version,
      clientJarSha1: resolved.clientJarSha1,
      assetCount: extraction.assetCount,
      manualJarRequired: false,
    };
  } catch (err) {
    return {
      ok: false,
      errorCode: 'ASSET_DOWNLOAD_FAILED',
      errorMessage: `Unexpected error: ${(err as Error).message}`,
      manualJarRequired: true,
    };
  }
}

// Manual JAR path: user-provided JAR → worker extraction → IndexedDB cache → renderer ready.
// Rejects corrupt/wrong-version JARs (SHA-1 against pinned expected SHA-1 for 1.21.11).
export async function importManualJar(
  jarBytes: Uint8Array,
  expectedSha1?: string,
): Promise<AssetPipelineResult> {
  try {
    const { verifyClientJar } = await import('./jar-verifier.ts');
    const { extractZipEntries } = await import('./asset-extractor.ts');
    const { cacheAssets } = await import('./indexeddb-cache.ts');

    // Step 1: verify SHA-1 if expected hash provided
    if (expectedSha1) {
      const verification = await verifyClientJar(jarBytes, expectedSha1);
      if (!verification.valid) {
        return {
          ok: false,
          errorCode: 'ASSET_SHA1_MISMATCH',
          errorMessage: `Manual JAR SHA-1 mismatch: expected ${expectedSha1}, got ${verification.actualSha1}`,
          manualJarRequired: true,
        };
      }
    }

    // Step 2: detect version from JAR metadata
    const { detectJarVersion } = await import('./jar-verifier.ts');
    const detected = await detectJarVersion(jarBytes);
    if (detected.error) {
      return {
        ok: false,
        errorCode: 'ASSET_JAR_READ_FAILED',
        errorMessage: detected.error,
        manualJarRequired: true,
      };
    }

    // Step 3: verify version is the pinned 1.21.11
    if (detected.version && detected.version !== '1.21.11') {
      return {
        ok: false,
        errorCode: 'ASSET_WRONG_VERSION',
        errorMessage: `Manual JAR version ${detected.version} does not match pinned 1.21.11`,
        manualJarRequired: true,
      };
    }

    // Step 4: extract assets
    const extraction = await extractZipEntries(jarBytes, []);

    // Step 5: cache in IndexedDB
    const version = detected.version ?? '1.21.11';
    const { sha1Hex } = await import('./version-manifest.ts');
    const hash = await sha1Hex(jarBytes);
    await cacheAssets(version, hash, extraction.assets.map((a) => a.path));

    return {
      ok: true,
      version,
      clientJarSha1: hash,
      assetCount: extraction.assetCount,
      manualJarRequired: false,
    };
  } catch (err) {
    return {
      ok: false,
      errorCode: 'ASSET_MANUAL_IMPORT_FAILED',
      errorMessage: `Manual JAR import failed: ${(err as Error).message}`,
      manualJarRequired: true,
    };
  }
}

// Main entry: try auto-download first; on failure, surface manual JAR zone (never a dead end).
export async function loadAssets(versionId: string = '1.21.11'): Promise<AssetPipelineResult> {
  // Check cache first
  const { isCached } = await import('./indexeddb-cache.ts');
  if (await isCached(versionId)) {
    return {
      ok: true,
      version: versionId,
      manualJarRequired: false,
    };
  }

  // Try auto-download
  const result = await autoDownloadAssets(versionId);
  if (result.ok) {
    return result;
  }

  // Auto-download failed — return failure with manualJarRequired=true
  // The UI should surface the manual JAR zone with this error code.
  return result;
}
