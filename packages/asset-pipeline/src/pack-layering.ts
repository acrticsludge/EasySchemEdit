// packages/asset-pipeline/src/pack-layering.ts
// Resource pack layering on top of vanilla extracted assets (slice E1.6, AD-4).
// Pure TypeScript, zero DOM/UI imports. Compatible with AssetSource in @easyschemedit/renderer.

import { strFromU8 } from 'fflate';
import type { ExtractedAsset, ExtractionResult } from './asset-extractor.ts';

export interface ExtractedAssets {
  /** Map of normalized archive-relative path -> file bytes */
  files: Map<string, Uint8Array>;
  version?: string;
  packFormat?: number;
  description?: string;
}

export type ExtractedAssetsInput =
  | ExtractedAssets
  | ExtractionResult
  | Map<string, Uint8Array>
  | Record<string, Uint8Array>
  | ExtractedAsset[];

/**
 * Normalized representation of merged asset layers offering O(1) lookup
 * and caching of parsed JSON definitions.
 */
export interface MergedAssetBundle {
  /**
   * Returns parsed blockstate definition (JSON object) or undefined if not found.
   * Compatible with AssetSource.getBlockState(id) in @easyschemedit/renderer.
   */
  getBlockState(id: string): unknown;

  /**
   * Returns parsed block model definition (JSON object) or undefined if not found.
   * Compatible with AssetSource.getModel(id) in @easyschemedit/renderer.
   */
  getModel(id: string): unknown;

  /**
   * Returns raw PNG bytes for a texture, or undefined if not found.
   */
  getTexture(id: string): Uint8Array | undefined;

  /**
   * Returns parsed texture .png.mcmeta JSON object, or undefined if not found.
   */
  getTextureMcmeta(id: string): unknown;

  /**
   * Retrieve any raw file bytes by normalized archive path.
   */
  getFile(path: string): Uint8Array | undefined;

  /**
   * Check whether a raw file exists in the merged bundle.
   */
  hasFile(path: string): boolean;

  /**
   * List all unique archive paths present in the merged bundle.
   */
  listFiles(): string[];

  /**
   * Total number of asset pack layers composed in this bundle.
   */
  readonly layerCount: number;
}

function normalizeArchivePath(path: string): string {
  return path.replace(/\\/g, '/').replace(/^\//, '');
}

/**
 * Coerce any supported asset container into standard ExtractedAssets.
 */
export function normalizeExtractedAssets(input: ExtractedAssetsInput): ExtractedAssets {
  if ('files' in input && input.files instanceof Map) {
    return input as ExtractedAssets;
  }

  const files = new Map<string, Uint8Array>();

  if (input instanceof Map) {
    for (const [k, v] of input.entries()) {
      files.set(normalizeArchivePath(k), v);
    }
    return { files };
  }

  if (Array.isArray(input)) {
    for (const item of input) {
      files.set(normalizeArchivePath(item.path), item.data);
    }
    return { files };
  }

  if ('assets' in input && Array.isArray((input as ExtractionResult).assets)) {
    for (const item of (input as ExtractionResult).assets) {
      files.set(normalizeArchivePath(item.path), item.data);
    }
    return { files };
  }

  // Plain Record<string, Uint8Array>
  for (const [k, v] of Object.entries(input)) {
    if (v instanceof Uint8Array) {
      files.set(normalizeArchivePath(k), v);
    }
  }

  return { files };
}

/**
 * Generate candidate archive paths for a blockstate query.
 */
function candidateBlockStatePaths(id: string): string[] {
  const norm = normalizeArchivePath(id.trim());
  const candidates: string[] = [norm];

  if (norm.startsWith('assets/')) {
    if (!norm.endsWith('.json')) candidates.unshift(`${norm}.json`);
    return [...new Set(candidates)];
  }

  let namespace = 'minecraft';
  let path = norm;
  if (norm.includes(':')) {
    const parts = norm.split(':');
    namespace = parts[0] || 'minecraft';
    path = parts.slice(1).join(':');
  }

  if (path.startsWith('blockstates/')) {
    path = path.slice('blockstates/'.length);
  }

  const baseWithJson = path.endsWith('.json') ? path : `${path}.json`;
  candidates.unshift(`assets/${namespace}/blockstates/${baseWithJson}`);
  if (!norm.endsWith('.json')) {
    candidates.push(`${norm}.json`);
  }
  return [...new Set(candidates)];
}

/**
 * Generate candidate archive paths for a model query.
 */
function candidateModelPaths(id: string): string[] {
  const norm = normalizeArchivePath(id.trim());
  const candidates: string[] = [norm];

  if (norm.startsWith('assets/')) {
    if (!norm.endsWith('.json')) candidates.unshift(`${norm}.json`);
    return [...new Set(candidates)];
  }

  let namespace = 'minecraft';
  let path = norm;
  if (norm.includes(':')) {
    const parts = norm.split(':');
    namespace = parts[0] || 'minecraft';
    path = parts.slice(1).join(':');
  }

  if (path.startsWith('models/')) {
    path = path.slice('models/'.length);
  }

  const baseWithJson = path.endsWith('.json') ? path : `${path}.json`;
  candidates.unshift(`assets/${namespace}/models/${baseWithJson}`);
  if (!path.startsWith('block/') && !path.startsWith('item/')) {
    candidates.unshift(`assets/${namespace}/models/block/${baseWithJson}`);
  }
  if (!norm.endsWith('.json')) {
    candidates.push(`${norm}.json`);
  }
  return [...new Set(candidates)];
}

/**
 * Generate candidate archive paths for a texture query.
 */
function candidateTexturePaths(id: string): string[] {
  let norm = normalizeArchivePath(id.trim());
  if (norm.endsWith('.json')) {
    norm = norm.slice(0, -'.json'.length);
  }
  const candidates: string[] = [norm];

  if (norm.startsWith('assets/')) {
    if (!norm.endsWith('.png')) candidates.unshift(`${norm}.png`);
    return [...new Set(candidates)];
  }

  let namespace = 'minecraft';
  let path = norm;
  if (norm.includes(':')) {
    const parts = norm.split(':');
    namespace = parts[0] || 'minecraft';
    path = parts.slice(1).join(':');
  }

  if (path.startsWith('textures/')) {
    path = path.slice('textures/'.length);
  }

  const baseWithPng = path.endsWith('.png') ? path : `${path}.png`;
  candidates.unshift(`assets/${namespace}/textures/${baseWithPng}`);
  if (!path.startsWith('block/') && !path.startsWith('item/')) {
    candidates.unshift(`assets/${namespace}/textures/block/${baseWithPng}`);
  }
  if (!norm.endsWith('.png')) {
    candidates.push(`${norm}.png`);
  }
  return [...new Set(candidates)];
}

/**
 * Generate candidate archive paths for a texture mcmeta query.
 */
function candidateMcmetaPaths(id: string): string[] {
  let norm = normalizeArchivePath(id.trim());
  if (norm.endsWith('.png.mcmeta')) {
    norm = norm.slice(0, -'.png.mcmeta'.length);
  } else if (norm.endsWith('.mcmeta')) {
    norm = norm.slice(0, -'.mcmeta'.length);
  } else if (norm.endsWith('.png')) {
    norm = norm.slice(0, -'.png'.length);
  } else if (norm.endsWith('.json')) {
    norm = norm.slice(0, -'.json'.length);
  }

  let namespace = 'minecraft';
  let path = norm;
  if (norm.includes(':')) {
    const parts = norm.split(':');
    namespace = parts[0] || 'minecraft';
    path = parts.slice(1).join(':');
  }

  if (path.startsWith('textures/')) {
    path = path.slice('textures/'.length);
  }

  const candidates: string[] = [
    `assets/${namespace}/textures/block/${path}.png.mcmeta`,
    `assets/${namespace}/textures/${path}.png.mcmeta`,
    `${norm}.png.mcmeta`,
    `${norm}.mcmeta`,
  ];
  return [...new Set(candidates)];
}

/**
 * Composes a base asset pack (vanilla) with zero or more override resource packs.
 *
 * PRECEDENCE SPECIFICATION:
 * - By default, `overridePacks` are ordered **highest-priority-first** (index 0 is highest priority).
 * - All override packs take precedence over `basePack`.
 * - When resolving an asset, packs are searched in order:
 *     overridePacks[0] -> overridePacks[1] -> ... -> overridePacks[N-1] -> basePack
 * - If an asset is defined in an override pack, it shadows the underlying pack's asset.
 * - Non-overridden assets are inherited cleanly from `basePack`.
 */
export function composeAssetPacks(
  basePack: ExtractedAssetsInput,
  overridePacks: ExtractedAssetsInput[] = [],
  options?: {
    order?: 'highest-priority-first' | 'lowest-to-highest';
  },
): MergedAssetBundle {
  const normalizedBase = normalizeExtractedAssets(basePack);
  let normalizedOverrides = overridePacks.map((p) => normalizeExtractedAssets(p));

  // If provided in ascending order, reverse so index 0 is highest priority
  if (options?.order === 'lowest-to-highest') {
    normalizedOverrides = [...normalizedOverrides].reverse();
  }

  // Compose search order: highest priority override packs first, then base pack
  const packsInPrecedenceOrder = [...normalizedOverrides, normalizedBase];

  // Precompute merged files map (lowest priority applied first so higher priority overwrites)
  const mergedFiles = new Map<string, Uint8Array>();
  const packsAscending = [...packsInPrecedenceOrder].reverse();

  for (const pack of packsAscending) {
    for (const [path, data] of pack.files.entries()) {
      mergedFiles.set(path, data);
    }
  }

  // In-memory cache for parsed JSON objects to avoid repeated TextDecoder + JSON.parse
  const jsonCache = new Map<string, unknown>();

  function parseJsonFromBytes(bytes: Uint8Array, cacheKey: string): unknown {
    if (jsonCache.has(cacheKey)) {
      return jsonCache.get(cacheKey);
    }
    try {
      const parsed = JSON.parse(strFromU8(bytes)) as unknown;
      jsonCache.set(cacheKey, parsed);
      return parsed;
    } catch {
      return undefined;
    }
  }

  return {
    layerCount: packsInPrecedenceOrder.length,

    getBlockState(id: string): unknown {
      const candidates = candidateBlockStatePaths(id);
      for (const candidate of candidates) {
        const bytes = mergedFiles.get(candidate);
        if (bytes) {
          return parseJsonFromBytes(bytes, candidate);
        }
      }
      return undefined;
    },

    getModel(id: string): unknown {
      const candidates = candidateModelPaths(id);
      for (const candidate of candidates) {
        const bytes = mergedFiles.get(candidate);
        if (bytes) {
          return parseJsonFromBytes(bytes, candidate);
        }
      }
      return undefined;
    },

    getTexture(id: string): Uint8Array | undefined {
      const candidates = candidateTexturePaths(id);
      for (const candidate of candidates) {
        const bytes = mergedFiles.get(candidate);
        if (bytes) {
          return bytes;
        }
      }
      return undefined;
    },

    getTextureMcmeta(id: string): unknown {
      const candidates = candidateMcmetaPaths(id);
      for (const candidate of candidates) {
        const bytes = mergedFiles.get(candidate);
        if (bytes) {
          return parseJsonFromBytes(bytes, candidate);
        }
      }
      return undefined;
    },

    getFile(path: string): Uint8Array | undefined {
      return mergedFiles.get(normalizeArchivePath(path));
    },

    hasFile(path: string): boolean {
      return mergedFiles.has(normalizeArchivePath(path));
    },

    listFiles(): string[] {
      return Array.from(mergedFiles.keys());
    },
  };
}
