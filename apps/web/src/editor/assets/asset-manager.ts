// apps/web/src/editor/assets/asset-manager.ts
// Browser Asset Manager & GPU Texture Atlas Builder (Slice E3.3, AD-4).
// Pure TypeScript orchestrator connecting @easyschemedit/asset-pipeline and @easyschemedit/renderer.

import {
  TARGET_MINECRAFT_VERSION,
  PINNED_1_21_11_CLIENT_JAR_SHA1,
  autoDownloadAssets,
  importManualJar,
  composeAssetPacks,
  extractAllAssetsSync,
  detectJarVersionSync,
  createAssetCacheKey,
  MemoryAssetCacheStore,
  IndexedDbAssetCacheStore,
  type ExtractedAssets,
  type MergedAssetBundle,
  type AssetCacheStore,
  type CachedAssetEntry,
  type AssetPipelineResult,
  type AssetProgressEvent,
  type AssetProgressCallback,
  type Sha1Fn,
  type FetchFn,
} from '@easyschemedit/asset-pipeline';

import {
  packAtlas,
  getFirstFrameDimensions,
  normalizeResourceLocation,
  type AssetSource,
  type TextureUvInfo,
  type AtlasPackOutput,
  type AtlasEntryInput,
} from '@easyschemedit/renderer';

export type BrowserAssetManagerState =
  | 'idle'
  | 'downloading'
  | 'verifying'
  | 'extracting'
  | 'ready'
  | 'error';

export interface ResourcePackEntry {
  id: string;
  name: string;
  enabled: boolean;
  assets: ExtractedAssets;
  sizeBytes: number;
}

export interface BrowserAssetManagerOptions {
  fetchFn?: FetchFn;
  sha1Fn?: Sha1Fn;
  cacheStore?: AssetCacheStore<CachedAssetEntry>;
  pngDimensionReader?: (data: Uint8Array) => { width: number; height: number };
  expectedSha1?: string;
  manifestUrl?: string;
  targetVersion?: string;
}

export interface BrowserAssetManagerSnapshot {
  state: BrowserAssetManagerState;
  progress: number;
  statusText: string;
  errorCode: string | null;
  errorMessage: string | null;
  fromCache: boolean;
  resourcePacks: ResourcePackEntry[];
  textureCount: number;
  atlasDimensions: { width: number; height: number; pages: number };
  availableBlockCount: number;
  atlasRevision: number;
}

export type AssetManagerSnapshot = BrowserAssetManagerSnapshot;

export const FALLBACK_BLOCK_IDS: readonly string[] = [
  'minecraft:air',
  'minecraft:andesite',
  'minecraft:bedrock',
  'minecraft:birch_log',
  'minecraft:birch_planks',
  'minecraft:black_wool',
  'minecraft:blue_wool',
  'minecraft:bricks',
  'minecraft:clay',
  'minecraft:coal_block',
  'minecraft:cobblestone',
  'minecraft:copper_block',
  'minecraft:cyan_wool',
  'minecraft:deepslate',
  'minecraft:diamond_block',
  'minecraft:diorite',
  'minecraft:dirt',
  'minecraft:emerald_block',
  'minecraft:glass',
  'minecraft:glowstone',
  'minecraft:gold_block',
  'minecraft:granite',
  'minecraft:grass_block',
  'minecraft:gravel',
  'minecraft:gray_wool',
  'minecraft:green_wool',
  'minecraft:iron_block',
  'minecraft:lapis_block',
  'minecraft:light_blue_wool',
  'minecraft:light_gray_wool',
  'minecraft:lime_wool',
  'minecraft:magenta_wool',
  'minecraft:netherrack',
  'minecraft:oak_log',
  'minecraft:oak_planks',
  'minecraft:obsidian',
  'minecraft:orange_wool',
  'minecraft:pink_wool',
  'minecraft:purple_wool',
  'minecraft:red_wool',
  'minecraft:redstone_block',
  'minecraft:sand',
  'minecraft:sandstone',
  'minecraft:smooth_stone',
  'minecraft:spruce_log',
  'minecraft:spruce_planks',
  'minecraft:stone',
  'minecraft:stone_bricks',
  'minecraft:terracotta',
  'minecraft:white_wool',
  'minecraft:yellow_wool',
];

/**
 * Reads PNG width and height directly from PNG IHDR chunk bytes 16..24 in pure TS.
 * Falls back to 16x16 if not a valid PNG header.
 */
export function defaultPngDimensionReader(data: Uint8Array): { width: number; height: number } {
  if (!data || data.byteLength < 24) {
    return { width: 16, height: 16 };
  }

  // Check PNG signature: 0x89 0x50 0x4E 0x47 0x0D 0x0A 0x1A 0x0A
  const isPng =
    data[0] === 0x89 &&
    data[1] === 0x50 &&
    data[2] === 0x4e &&
    data[3] === 0x47 &&
    data[4] === 0x0d &&
    data[5] === 0x0a &&
    data[6] === 0x1a &&
    data[7] === 0x0a;

  if (!isPng) {
    return { width: 16, height: 16 };
  }

  try {
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    const width = view.getUint32(16, false);
    const height = view.getUint32(20, false);
    if (width > 0 && height > 0 && width <= 65536 && height <= 65536) {
      return { width, height };
    }
  } catch {
    // Fall back to 16x16
  }

  return { width: 16, height: 16 };
}

function createFallbackAssetSource(): AssetSource {
  return {
    getBlockState(_id: string) {
      return {
        variants: {
          '': { model: 'minecraft:block/cube_all' },
        },
      };
    },
    getModel(_id: string) {
      return {
        parent: 'block/cube_all',
        textures: {
          all: 'block/stone',
        },
        elements: [
          {
            from: [0, 0, 0],
            to: [16, 16, 16],
            faces: {
              down: { texture: '#all', cullface: 'down' },
              up: { texture: '#all', cullface: 'up' },
              north: { texture: '#all', cullface: 'north' },
              south: { texture: '#all', cullface: 'south' },
              west: { texture: '#all', cullface: 'west' },
              east: { texture: '#all', cullface: 'east' },
            },
          },
        ],
      };
    },
  };
}

function createFallbackUvLookup(): (textureLocation: string) => TextureUvInfo {
  return () => ({
    u0: 0,
    v0: 0,
    u1: 1,
    v1: 1,
    hasAlpha: 'none',
  });
}

/**
 * BrowserAssetManager coordinates asset acquisition, caching, resource-pack layering,
 * and GPU texture atlas packing.
 */
export class BrowserAssetManager {
  public state: BrowserAssetManagerState = 'idle';
  public progress = 0;
  public statusText = 'Assets not loaded';
  public errorCode: string | null = null;
  public errorMessage: string | null = null;
  public fromCache = false;
  public resourcePacks: ResourcePackEntry[] = [];

  private fetchFn?: FetchFn;
  private sha1Fn?: Sha1Fn;
  private cacheStore: AssetCacheStore<CachedAssetEntry>;
  private pngDimensionReader: (data: Uint8Array) => { width: number; height: number };
  private expectedSha1?: string;
  private manifestUrl?: string;
  private targetVersion: string;

  private vanillaAssets: ExtractedAssets | null = null;
  private clientJarSha1: string | null = null;
  private bundle: MergedAssetBundle | null = null;
  private assetSource: AssetSource = createFallbackAssetSource();
  private uvLookup: (textureLocation: string) => TextureUvInfo | undefined = createFallbackUvLookup();
  private atlas: AtlasPackOutput | null = null;
  private availableBlockIds: string[] = [...FALLBACK_BLOCK_IDS];
  private atlasRevision = 0;
  private listeners: Set<() => void> = new Set();

  constructor(options?: BrowserAssetManagerOptions) {
    this.fetchFn = options?.fetchFn;
    this.sha1Fn = options?.sha1Fn;
    this.expectedSha1 = options?.expectedSha1;
    this.manifestUrl = options?.manifestUrl;
    this.targetVersion = options?.targetVersion ?? TARGET_MINECRAFT_VERSION;
    this.pngDimensionReader = options?.pngDimensionReader ?? defaultPngDimensionReader;

    if (options?.cacheStore) {
      this.cacheStore = options.cacheStore;
    } else if (typeof indexedDB !== 'undefined') {
      this.cacheStore = new IndexedDbAssetCacheStore();
    } else {
      this.cacheStore = new MemoryAssetCacheStore<CachedAssetEntry>();
    }
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notifyListeners(): void {
    for (const listener of this.listeners) {
      try {
        listener();
      } catch (err) {
        console.error('BrowserAssetManager listener error:', err);
      }
    }
  }

  public getStateSnapshot(): BrowserAssetManagerSnapshot {
    const atlasDim =
      this.atlas && this.atlas.pages.length > 0
        ? {
            width: this.atlas.pages[0].width,
            height: this.atlas.pages[0].height,
            pages: this.atlas.pages.length,
          }
        : { width: 0, height: 0, pages: 0 };

    return {
      state: this.state,
      progress: this.progress,
      statusText: this.statusText,
      errorCode: this.errorCode,
      errorMessage: this.errorMessage,
      fromCache: this.fromCache,
      resourcePacks: [...this.resourcePacks],
      textureCount: this.atlas?.rects.size ?? 0,
      atlasDimensions: atlasDim,
      availableBlockCount: this.availableBlockIds.length,
      atlasRevision: this.atlasRevision,
    };
  }

  public getSnapshot(): BrowserAssetManagerSnapshot {
    return this.getStateSnapshot();
  }

  public getAtlasRevision(): number {
    return this.atlasRevision;
  }

  public getAssetSource(): AssetSource {
    return this.assetSource;
  }

  public getUvLookup(): (textureLocation: string) => TextureUvInfo | undefined {
    return this.uvLookup;
  }

  public getTextureUv(textureLocation: string): TextureUvInfo | undefined {
    return this.uvLookup(textureLocation);
  }

  public getBundle(): MergedAssetBundle | null {
    return this.bundle;
  }

  public getAtlas(): AtlasPackOutput | null {
    return this.atlas;
  }

  public getAvailableBlockIds(): string[] {
    return this.availableBlockIds;
  }

  public getTextureCount(): number {
    return this.atlas?.rects.size ?? 0;
  }

  public getAtlasDimensions(): { width: number; height: number; pages: number } {
    if (this.atlas && this.atlas.pages.length > 0) {
      return {
        width: this.atlas.pages[0].width,
        height: this.atlas.pages[0].height,
        pages: this.atlas.pages.length,
      };
    }
    return { width: 0, height: 0, pages: 0 };
  }

  /**
   * First-run auto-download path with cache lookup.
   */
  public async autoLoad(onProgress?: AssetProgressCallback): Promise<AssetPipelineResult> {
    // 1. Check cache first
    const pinnedKey = createAssetCacheKey(this.targetVersion, PINNED_1_21_11_CLIENT_JAR_SHA1);
    const customKey = this.expectedSha1
      ? createAssetCacheKey(this.targetVersion, this.expectedSha1)
      : null;
    const lastKey = this.clientJarSha1
      ? createAssetCacheKey(this.targetVersion, this.clientJarSha1)
      : null;

    let cachedEntry: CachedAssetEntry | undefined;

    if (customKey && (await this.cacheStore.has(customKey))) {
      cachedEntry = await this.cacheStore.get(customKey);
    } else if (await this.cacheStore.has(pinnedKey)) {
      cachedEntry = await this.cacheStore.get(pinnedKey);
    } else if (lastKey && (await this.cacheStore.has(lastKey))) {
      cachedEntry = await this.cacheStore.get(lastKey);
    } else if (this.cacheStore instanceof MemoryAssetCacheStore) {
      // Memory store fallback inspect: look for any entry matching this version
      const storeMap = (this.cacheStore as unknown as { map: Map<string, CachedAssetEntry> }).map;
      if (storeMap) {
        for (const [k, v] of storeMap.entries()) {
          if (k.startsWith(`${this.targetVersion}:`)) {
            cachedEntry = v;
            break;
          }
        }
      }
    }

    if (cachedEntry?.files) {
      this.fromCache = true;
      this.clientJarSha1 = cachedEntry.hash;
      this.vanillaAssets = {
        files: cachedEntry.files,
        version: cachedEntry.version,
      };
      this.rebuildBundleAndAtlas();
      this.state = 'ready';
      this.statusText = 'Ready (Cached)';
      this.progress = 100;
      this.errorCode = null;
      this.errorMessage = null;
      this.notifyListeners();

      const result: AssetPipelineResult = {
        ok: true,
        version: cachedEntry.version,
        clientJarSha1: cachedEntry.hash,
        assetCount: cachedEntry.assetPaths.length,
        assets: this.vanillaAssets,
        manualJarRequired: false,
      };
      return result;
    }

    // 2. Cache miss -> auto-download
    this.fromCache = false;
    this.state = 'downloading';
    this.progress = 0;
    this.statusText = 'Downloading assets...';
    this.errorCode = null;
    this.errorMessage = null;
    this.notifyListeners();

    const forwardProgress: AssetProgressCallback = (evt: AssetProgressEvent) => {
      if (evt.stage === 'manifest' || evt.stage === 'downloading') {
        this.state = 'downloading';
        if (evt.bytesTotal && evt.bytesLoaded !== undefined) {
          this.progress = Math.min(99, Math.round((evt.bytesLoaded / evt.bytesTotal) * 100));
        }
        this.statusText = evt.message ?? `Downloading client.jar (${this.progress}%)`;
      } else if (evt.stage === 'verifying') {
        this.state = 'verifying';
        this.progress = 90;
        this.statusText = evt.message ?? 'Verifying checksum...';
      } else if (evt.stage === 'extracting' || evt.stage === 'caching') {
        this.state = 'extracting';
        this.progress = 95;
        this.statusText = evt.message ?? 'Extracting block assets...';
      } else if (evt.stage === 'done') {
        this.progress = 100;
        this.statusText = 'Ready (Downloaded)';
      }
      this.notifyListeners();
      onProgress?.(evt);
    };

    try {
      const result = await autoDownloadAssets({
        versionId: this.targetVersion,
        expectedSha1: this.expectedSha1,
        fetchFn: this.fetchFn,
        sha1Fn: this.sha1Fn,
        store: this.cacheStore,
        manifestUrl: this.manifestUrl,
        onProgress: forwardProgress,
      });

      if (result.ok && result.assets) {
        this.vanillaAssets = result.assets;
        this.clientJarSha1 = result.clientJarSha1 ?? null;
        this.rebuildBundleAndAtlas();
        this.state = 'ready';
        this.statusText = 'Ready (Downloaded)';
        this.progress = 100;
        this.errorCode = null;
        this.errorMessage = null;
        this.notifyListeners();
        return result;
      }

      // Download returned error
      this.state = 'error';
      this.errorCode = result.errorCode ?? 'ASSET_DOWNLOAD_FAILED';
      this.errorMessage = result.errorMessage ?? 'Failed to download assets';
      this.statusText = 'Fallback Mode — Manual JAR Needed';
      // Procedural fallback AssetSource & uvLookup are preserved
      this.notifyListeners();
      return result;
    } catch (err) {
      this.state = 'error';
      const code = (err as { code?: string }).code ?? 'ASSET_DOWNLOAD_FAILED';
      this.errorCode = code;
      this.errorMessage = (err as Error).message;
      this.statusText = 'Fallback Mode — Manual JAR Needed';
      // Procedural fallback AssetSource & uvLookup are preserved
      this.notifyListeners();
      return {
        ok: false,
        errorCode: this.errorCode,
        errorMessage: this.errorMessage,
        manualJarRequired: true,
      };
    }
  }

  /**
   * Imports a user-provided client.jar buffer.
   */
  public async loadManualJar(
    jarBytes: Uint8Array,
    fileName?: string,
  ): Promise<AssetPipelineResult> {
    this.state = 'verifying';
    this.progress = 10;
    this.statusText = 'Verifying manual JAR...';
    this.errorCode = null;
    this.errorMessage = null;
    this.notifyListeners();

    const detected = detectJarVersionSync(jarBytes);
    const targetVersion = detected.version ?? this.targetVersion;

    try {
      const result = await importManualJar(jarBytes, {
        targetVersion,
        sha1Fn: this.sha1Fn,
        store: this.cacheStore,
        onProgress: (evt) => {
          if (evt.stage === 'extracting') {
            this.state = 'extracting';
            this.progress = 60;
            this.statusText = evt.message ?? 'Extracting assets...';
            this.notifyListeners();
          }
        },
      });

      if (result.ok && result.assets) {
        this.vanillaAssets = result.assets;
        this.clientJarSha1 = result.clientJarSha1 ?? null;
        this.fromCache = false;
        this.rebuildBundleAndAtlas();
        this.state = 'ready';
        this.statusText = fileName ? `Ready (${fileName})` : 'Ready (Manual JAR)';
        this.progress = 100;
        this.errorCode = null;
        this.errorMessage = null;
        this.notifyListeners();
        return result;
      }

      this.state = 'error';
      this.errorCode = result.errorCode ?? 'ASSET_MANUAL_IMPORT_FAILED';
      this.errorMessage = result.errorMessage ?? 'Manual JAR import failed';
      this.statusText = 'Manual JAR import failed';
      this.notifyListeners();
      return result;
    } catch (err) {
      this.state = 'error';
      this.errorCode = (err as { code?: string }).code ?? 'ASSET_MANUAL_IMPORT_FAILED';
      this.errorMessage = (err as Error).message;
      this.statusText = 'Manual JAR import failed';
      this.notifyListeners();
      return {
        ok: false,
        errorCode: this.errorCode,
        errorMessage: this.errorMessage,
        manualJarRequired: true,
      };
    }
  }

  /**
   * Adds a resource pack ZIP buffer to the pack layer stack (highest priority first).
   */
  public addResourcePack(zipBytes: Uint8Array, name: string): void {
    const extracted = extractAllAssetsSync(zipBytes);
    const files = new Map<string, Uint8Array>();
    for (const a of extracted.assets) {
      const assetsIdx = a.path.indexOf('assets/');
      const normalizedPath = assetsIdx > 0 ? a.path.slice(assetsIdx) : a.path;
      files.set(normalizedPath, a.data);
    }

    const id = `pack_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const packEntry: ResourcePackEntry = {
      id,
      name,
      enabled: true,
      assets: {
        files,
        version: this.targetVersion,
      },
      sizeBytes: zipBytes.byteLength,
    };

    // Unshift: newest/topmost pack has highest precedence
    this.resourcePacks.unshift(packEntry);
    this.rebuildBundleAndAtlas();
    this.notifyListeners();
  }

  public toggleResourcePack(id: string, enabled: boolean): void {
    const pack = this.resourcePacks.find((p) => p.id === id);
    if (pack) {
      pack.enabled = enabled;
      this.rebuildBundleAndAtlas();
      this.notifyListeners();
    }
  }

  public moveResourcePack(id: string, direction: 'up' | 'down'): void {
    const idx = this.resourcePacks.findIndex((p) => p.id === id);
    if (idx < 0) return;
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= this.resourcePacks.length) return;

    const temp = this.resourcePacks[idx]!;
    this.resourcePacks[idx] = this.resourcePacks[targetIdx]!;
    this.resourcePacks[targetIdx] = temp;

    this.rebuildBundleAndAtlas();
    this.notifyListeners();
  }

  public removeResourcePack(id: string): void {
    const prevLen = this.resourcePacks.length;
    this.resourcePacks = this.resourcePacks.filter((p) => p.id !== id);
    if (this.resourcePacks.length !== prevLen) {
      this.rebuildBundleAndAtlas();
      this.notifyListeners();
    }
  }

  public async clearCacheAndReload(autoReload = false): Promise<void> {
    await this.cacheStore.clear();
    this.vanillaAssets = null;
    this.clientJarSha1 = null;
    this.fromCache = false;

    if (autoReload) {
      await this.autoLoad();
    } else {
      this.state = 'idle';
      this.progress = 0;
      this.statusText = 'Cache cleared';
      this.errorCode = null;
      this.errorMessage = null;
      this.rebuildBundleAndAtlas();
      this.notifyListeners();
    }
  }

  /**
   * Recomposes asset layers, rebuilds AssetSource, packs the texture atlas,
   * and creates UV lookup map.
   */
  private rebuildBundleAndAtlas(): void {
    this.atlasRevision++;
    const base: ExtractedAssets = this.vanillaAssets ?? { files: new Map() };
    const enabledPacks = this.resourcePacks.filter((p) => p.enabled).map((p) => p.assets);

    this.bundle = composeAssetPacks(base, enabledPacks, { order: 'highest-priority-first' });

    // Update AssetSource
    const activeBundle = this.bundle;
    this.assetSource = {
      getBlockState: (id: string) => activeBundle.getBlockState(id),
      getModel: (id: string) => activeBundle.getModel(id),
    };

    // Pack textures from the bundle
    const entries: AtlasEntryInput[] = [];
    for (const path of activeBundle.listFiles()) {
      if (path.endsWith('.png') && !path.endsWith('.png.mcmeta') && path.includes('/textures/')) {
        const data = activeBundle.getFile(path);
        if (data) {
          const dim = this.pngDimensionReader(data);
          const mcmeta = activeBundle.getTextureMcmeta(path);
          const frameDim = getFirstFrameDimensions(dim.width, dim.height, mcmeta);
          entries.push({
            id: path,
            width: frameDim.width,
            height: frameDim.height,
          });
        }
      }
    }

    if (entries.length > 0) {
      this.atlas = packAtlas(entries, {
        maxSize: 4096,
        padding: 16,
        powerOfTwo: true,
      });
    } else {
      this.atlas = { pages: [], rects: new Map() };
    }

    // Build uvLookup map
    const uvMap = new Map<string, TextureUvInfo>();
    if (this.atlas) {
      for (const [path, rect] of this.atlas.rects.entries()) {
        const info: TextureUvInfo = {
          u0: rect.u0,
          v0: rect.v0,
          u1: rect.u1,
          v1: rect.v1,
          hasAlpha: 'none',
        };

        // 1. Direct path lookup
        uvMap.set(path, info);

        // 2. Resource location variants: assets/<namespace>/textures/<subpath>.png
        const match = path.match(/^assets\/([^/]+)\/textures\/(.+)\.png$/);
        if (match) {
          const ns = match[1]!;
          const subpath = match[2]!;
          const namespaced = `${ns}:${subpath}`;
          uvMap.set(namespaced, info);

          if (ns === 'minecraft') {
            uvMap.set(subpath, info);
            if (subpath.startsWith('block/')) {
              const stripped = subpath.slice('block/'.length);
              uvMap.set(stripped, info);
              uvMap.set(`minecraft:${stripped}`, info);
            }
          }
        }
      }
    }

    this.uvLookup = (textureLocation: string): TextureUvInfo | undefined => {
      if (!textureLocation) return undefined;
      const direct = uvMap.get(textureLocation);
      if (direct) return direct;

      const norm = normalizeResourceLocation(textureLocation);
      const fromNorm = uvMap.get(norm);
      if (fromNorm) return fromNorm;

      if (norm.startsWith('minecraft:')) {
        const raw = norm.slice('minecraft:'.length);
        return uvMap.get(raw) ?? uvMap.get(`block/${raw}`) ?? uvMap.get(`minecraft:block/${raw}`);
      }
      return undefined;
    };

    // Rebuild available block IDs
    const ids = new Set<string>();
    for (const path of activeBundle.listFiles()) {
      const match = path.match(/^assets\/([^/]+)\/blockstates\/(.+)\.json$/);
      if (match) {
        ids.add(`${match[1]}:${match[2]}`);
      }
    }

    this.availableBlockIds = ids.size > 0 ? Array.from(ids).sort() : [...FALLBACK_BLOCK_IDS].sort();
  }
}

export { BrowserAssetManager as AssetManager };
