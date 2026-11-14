// packages/asset-pipeline/src/asset-extractor.ts
// Synchronous and streaming zip extraction via fflate.
// SUBSPEC-B b-13: extraction of blockstates, models, textures, mcmeta, version.json, pack.mcmeta.

import { unzipSync } from 'fflate';

export interface ExtractedAsset {
  path: string;     // archive-relative path, e.g. "assets/minecraft/blockstates/stone.json"
  data: Uint8Array; // file bytes
}

export interface ExtractionResult {
  assets: ExtractedAsset[];
  assetCount: number;
  blockstateCount: number;
  modelCount: number;
  textureCount: number;
  otherCount: number;
  errors: string[];
}

/**
 * Filter predicate determining if a zip entry path is an asset required by the editor.
 * Extracts:
 * - assets/<namespace>/blockstates/[nested/]*.json
 * - assets/<namespace>/models/[nested/]*.json
 * - assets/<namespace>/textures/(block|blocks)/[nested/]*.png
 * - assets/<namespace>/textures/(block|blocks)/[nested/]*.png.mcmeta
 * - version.json
 * - pack.mcmeta
 * Also supports ZIPs with a top-level wrapper folder prefix (e.g. MyPack/assets/...).
 * Ignores all other files (classes, sounds, lang, non-block textures, etc.).
 */
export function isExtractableAssetPath(rawPath: string): boolean {
  const norm = rawPath.replace(/\\/g, '/').replace(/^\//, '');

  if (
    norm === 'version.json' ||
    norm === 'pack.mcmeta' ||
    norm.endsWith('/pack.mcmeta') ||
    norm.endsWith('/version.json')
  ) {
    return true;
  }

  // Strip any wrapper folder prefix before assets/
  const assetsIdx = norm.indexOf('assets/');
  const sub = assetsIdx >= 0 ? norm.slice(assetsIdx) : norm;

  // Blockstates: assets/<namespace>/blockstates/**/*.json
  if (/^assets\/[^/]+\/blockstates\/.+\.json$/i.test(sub)) {
    return true;
  }

  // Models: assets/<namespace>/models/**/*.json
  if (/^assets\/[^/]+\/models\/.+\.json$/i.test(sub)) {
    return true;
  }

  // Textures: assets/<namespace>/textures/(block|blocks)/**/*.png(.mcmeta)
  if (/^assets\/[^/]+\/textures\/(?:block|blocks)\/.+\.png(?:\.mcmeta)?$/i.test(sub)) {
    return true;
  }

  return false;
}

/**
 * Find and extract a single entry by name from a zip buffer synchronously.
 */
export function findZipEntrySync(
  jarBytes: Uint8Array,
  entryName: string,
): Uint8Array | null {
  const normTarget = entryName.replace(/\\/g, '/').replace(/^\//, '');
  const unzipped = unzipSync(jarBytes, {
    filter: (file) => {
      const n = file.name.replace(/\\/g, '/').replace(/^\//, '');
      return n === normTarget || n.endsWith('/' + normTarget);
    },
  });
  return unzipped[normTarget] ?? Object.values(unzipped)[0] ?? null;
}

/**
 * Find and extract a single entry by name (async wrapper for compatibility).
 */
export async function findZipEntry(
  jarBytes: Uint8Array,
  entryName: string,
): Promise<Uint8Array | null> {
  return findZipEntrySync(jarBytes, entryName);
}

/**
 * Extract specific named entries (or all matching assets if empty) synchronously.
 */
export function extractZipEntriesSync(
  jarBytes: Uint8Array,
  entryNames: string[] = [],
): ExtractionResult {
  const assets: ExtractedAsset[] = [];
  const errors: string[] = [];

  let filter: (file: { name: string }) => boolean;
  if (entryNames.length > 0) {
    const wanted = new Set(entryNames.map((p) => p.replace(/\\/g, '/').replace(/^\//, '')));
    filter = (file) => wanted.has(file.name.replace(/\\/g, '/').replace(/^\//, ''));
  } else {
    filter = (file) => isExtractableAssetPath(file.name);
  }

  let unzipped: Record<string, Uint8Array>;
  try {
    unzipped = unzipSync(jarBytes, { filter });
  } catch (err) {
    errors.push(`ASSET_EXTRACTION_FAILED: ${(err as Error).message}`);
    return {
      assets: [],
      assetCount: 0,
      blockstateCount: 0,
      modelCount: 0,
      textureCount: 0,
      otherCount: 0,
      errors,
    };
  }

  let blockstateCount = 0;
  let modelCount = 0;
  let textureCount = 0;
  let otherCount = 0;

  for (const [rawPath, data] of Object.entries(unzipped)) {
    let path = rawPath.replace(/\\/g, '/').replace(/^\//, '');
    if (entryNames.length === 0) {
      const assetsIdx = path.indexOf('assets/');
      if (assetsIdx > 0) {
        path = path.slice(assetsIdx);
      } else if (path.endsWith('/pack.mcmeta')) {
        path = 'pack.mcmeta';
      } else if (path.endsWith('/version.json')) {
        path = 'version.json';
      }
    }
    assets.push({ path, data });

    if (path.includes('/blockstates/')) blockstateCount++;
    else if (path.includes('/models/')) modelCount++;
    else if (path.includes('/textures/')) textureCount++;
    else otherCount++;
  }

  return {
    assets,
    assetCount: assets.length,
    blockstateCount,
    modelCount,
    textureCount,
    otherCount,
    errors,
  };
}

/**
 * Extract specific entries from a zip/JAR buffer (async wrapper for compatibility).
 */
export async function extractZipEntries(
  jarBytes: Uint8Array,
  entryNames: string[] = [],
): Promise<ExtractionResult> {
  return extractZipEntriesSync(jarBytes, entryNames);
}

/**
 * Extract all supported asset categories from client JAR / pack synchronously.
 */
export function extractAllAssetsSync(jarBytes: Uint8Array): ExtractionResult {
  return extractZipEntriesSync(jarBytes, []);
}

/**
 * Extract all supported asset categories (async wrapper).
 */
export async function extractAllAssets(jarBytes: Uint8Array): Promise<ExtractionResult> {
  return extractAllAssetsSync(jarBytes);
}
