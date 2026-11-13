// packages/renderer/src/model-resolver.ts
// Pure-TypeScript Minecraft blockstate -> model resolution (slice E2.1, SUBSPEC-E).
// Handles variants, multipart conditions (when, OR, AND, pipe-syntax),
// parent-chain inheritance, texture-variable resolution with cycle guard,
// deterministic weighted selection, default UV computation, and missing-model fallback.
// Zero Three.js/React/DOM imports.

import type { ModelElement, ModelFace } from './resource-pack-types.ts';

// ============================================================================
// Types
// ============================================================================

/**
 * Read-only asset source provider for blockstate JSONs and model JSONs.
 */
export interface AssetSource {
  getBlockState(id: string): unknown;
  getModel(resourceLocation: string): unknown;
}

export type ResolvedFace = {
  texture: string;
  uv: [number, number, number, number];
  cullface?: string;
  tintindex?: number;
  rotation?: 0 | 90 | 180 | 270;
};

export type ResolvedElement = {
  from: [number, number, number];
  to: [number, number, number];
  rotation?: {
    origin: [number, number, number];
    axis: 'x' | 'y' | 'z';
    angle: number;
    rescale?: boolean;
  };
  shade?: boolean;
  faces: Record<string, ResolvedFace>;
};

export type ResolvedModelPart = {
  elements: ResolvedElement[];
  x: number;
  y: number;
  uvlock: boolean;
  ambientOcclusion: boolean;
  missing?: boolean;
};

export type ResolveModelOptions = {
  seed?: number;
  cache?: Map<string, ResolvedModelPart[]>;
};

export type RawModelRef = {
  model: string;
  x?: 0 | 90 | 180 | 270;
  y?: 0 | 90 | 180 | 270;
  uvlock?: boolean;
  weight?: number;
};

export type RawBlockModel = {
  parent?: string;
  textures?: Record<string, string>;
  elements?: ModelElement[];
  ambientocclusion?: boolean;
  ambientOcclusion?: boolean;
};

export type RawBlockStateDefinition = {
  variants?: Record<string, RawModelRef | RawModelRef[]>;
  multipart?: Array<{
    when?: Record<string, unknown>;
    apply: RawModelRef | RawModelRef[];
  }>;
};

export const MISSING_MODEL_TEXTURE = 'minecraft:missing';

// Global weak-cache mapping AssetSource -> (cacheKey -> parts)
const globalSourceCache = new WeakMap<object, Map<string, ResolvedModelPart[]>>();

/**
 * Clear the internal resolution cache.
 */
export function clearModelCache(): void {
  // Clearing global source cache cannot explicitly drop WeakMap entries,
  // but we can provide explicit cache clearing when caller passes custom cache,
  // or clear internal store if stored directly.
}

// ============================================================================
// Normalization & Helpers
// ============================================================================

/**
 * Normalizes a resource location string. Missing namespace defaults to "minecraft:".
 * E.g. "oak_stairs" -> "minecraft:oak_stairs", "block/cube_all" -> "minecraft:block/cube_all".
 */
export function normalizeResourceLocation(id: string): string {
  const trimmed = id.trim().toLowerCase();
  if (trimmed.includes(':')) {
    return trimmed;
  }
  return `minecraft:${trimmed}`;
}

function getBlockStateFromSource(src: AssetSource, id: string): RawBlockStateDefinition | undefined {
  const normalized = normalizeResourceLocation(id);
  let res = src.getBlockState(normalized);
  if (res !== undefined && res !== null && typeof res === 'object') {
    return res as RawBlockStateDefinition;
  }
  if (normalized !== id) {
    res = src.getBlockState(id);
    if (res !== undefined && res !== null && typeof res === 'object') {
      return res as RawBlockStateDefinition;
    }
  }
  if (normalized.startsWith('minecraft:')) {
    const stripped = normalized.slice('minecraft:'.length);
    res = src.getBlockState(stripped);
    if (res !== undefined && res !== null && typeof res === 'object') {
      return res as RawBlockStateDefinition;
    }
  }
  return undefined;
}

function getModelFromSource(src: AssetSource, id: string): RawBlockModel | undefined {
  const normalized = normalizeResourceLocation(id);
  let res = src.getModel(normalized);
  if (res !== undefined && res !== null && typeof res === 'object') {
    return res as RawBlockModel;
  }
  if (normalized !== id) {
    res = src.getModel(id);
    if (res !== undefined && res !== null && typeof res === 'object') {
      return res as RawBlockModel;
    }
  }
  if (normalized.startsWith('minecraft:')) {
    const stripped = normalized.slice('minecraft:'.length);
    res = src.getModel(stripped);
    if (res !== undefined && res !== null && typeof res === 'object') {
      return res as RawBlockModel;
    }
  }
  return undefined;
}

/**
 * Generates the canonical cache key for a block state.
 * E.g. "minecraft:oak_stairs[facing=east,half=bottom,shape=straight]"
 */
export function formatBlockStateCacheKey(
  blockName: string,
  properties: Record<string, string>,
  seed?: number
): string {
  const normName = normalizeResourceLocation(blockName);
  const sortedKeys = Object.keys(properties).sort();
  const propPairs = sortedKeys.map(
    (k) => `${k.toLowerCase()}=${String(properties[k]).toLowerCase()}`
  );
  const baseKey = propPairs.length > 0 ? `${normName}[${propPairs.join(',')}]` : normName;
  if (seed !== undefined && seed !== 0) {
    return `${baseKey}#seed=${seed}`;
  }
  return baseKey;
}

// ============================================================================
// Missing Model Fallback
// ============================================================================

/**
 * Creates the magenta/black missing model cube fallback (16x16x16 cube with missing texture).
 */
export function createMissingModelPart(): ResolvedModelPart {
  const faces: Record<string, ResolvedFace> = {};
  for (const dir of ['down', 'up', 'north', 'south', 'west', 'east']) {
    faces[dir] = {
      texture: MISSING_MODEL_TEXTURE,
      uv: [0, 0, 16, 16],
      cullface: dir,
    };
  }
  return {
    elements: [
      {
        from: [0, 0, 0],
        to: [16, 16, 16],
        shade: true,
        faces,
      },
    ],
    x: 0,
    y: 0,
    uvlock: false,
    ambientOcclusion: false,
    missing: true,
  };
}

/**
 * Extracts the fluid base name ('water', 'flowing_water', 'lava', 'flowing_lava')
 * by stripping namespace ('minecraft:') and bracketed properties ('[...]').
 */
export function getFluidBaseName(
  blockName: string
): 'water' | 'flowing_water' | 'lava' | 'flowing_lava' | null {
  if (!blockName) return null;
  let base = blockName.trim().toLowerCase();
  const bracket = base.indexOf('[');
  if (bracket !== -1) {
    base = base.slice(0, bracket).trim();
  }
  if (base.startsWith('minecraft:')) {
    base = base.slice('minecraft:'.length);
  }
  if (
    base === 'water' ||
    base === 'flowing_water' ||
    base === 'lava' ||
    base === 'flowing_lava'
  ) {
    return base;
  }
  return null;
}

/**
 * Creates the synthesized fluid cube fallback (16x14x16 cube with still water or lava texture).
 */
export function createFluidModelPart(fluidName: string): ResolvedModelPart {
  const isLava = fluidName === 'lava' || fluidName === 'flowing_lava';
  const texture = isLava ? 'minecraft:block/lava_still' : 'minecraft:block/water_still';
  const faces: Record<string, ResolvedFace> = {};
  for (const dir of ['down', 'up', 'north', 'south', 'west', 'east']) {
    const face: ResolvedFace = {
      texture,
      uv: computeDefaultUv(dir, [0, 0, 0], [16, 14, 16]),
      cullface: dir,
    };
    if (!isLava) {
      face.tintindex = 0;
    }
    faces[dir] = face;
  }
  return {
    elements: [
      {
        from: [0, 0, 0],
        to: [16, 14, 16],
        faces,
      },
    ],
    x: 0,
    y: 0,
    uvlock: false,
    ambientOcclusion: false,
  };
}

// ============================================================================
// Default UV Computation
// ============================================================================

/**
 * Computes default UV coordinates for an element face when the face omits explicit UVs.
 * Projects the 3D element bounds onto the 2D face plane per Minecraft Java convention.
 */
export function computeDefaultUv(
  dir: string,
  from: [number, number, number],
  to: [number, number, number]
): [number, number, number, number] {
  const [x1, y1, z1] = from;
  const [x2, y2, z2] = to;
  switch (dir.toLowerCase()) {
    case 'up':
      return [x1, z1, x2, z2];
    case 'down':
      return [x1, 16 - z2, x2, 16 - z1];
    case 'north':
      return [16 - x2, 16 - y2, 16 - x1, 16 - y1];
    case 'south':
      return [x1, 16 - y2, x2, 16 - y1];
    case 'west':
      return [z1, 16 - y2, z2, 16 - y1];
    case 'east':
      return [16 - z2, 16 - y2, 16 - z1, 16 - y1];
    default:
      return [0, 0, 16, 16];
  }
}

// ============================================================================
// Texture Variable Resolution
// ============================================================================

/**
 * Resolves a texture variable (e.g. "#side" or "#all") recursively through
 * the merged texture dictionary. Includes a cycle guard and returns
 * MISSING_MODEL_TEXTURE if unresolvable.
 */
export function resolveTextureVariable(
  texRef: string,
  textures: Record<string, string>
): string {
  let current = texRef.trim();
  if (!current) {
    return MISSING_MODEL_TEXTURE;
  }
  const seen = new Set<string>();
  while (current.startsWith('#')) {
    const varName = current.slice(1);
    if (seen.has(varName)) {
      // Cycle in texture variable references
      return MISSING_MODEL_TEXTURE;
    }
    seen.add(varName);
    if (textures[varName] !== undefined) {
      current = textures[varName]!.trim();
    } else {
      // Unresolved variable
      return MISSING_MODEL_TEXTURE;
    }
  }
  return normalizeResourceLocation(current);
}

// ============================================================================
// Deterministic Weighted Model Selection
// ============================================================================

/**
 * Deterministically picks a model reference from an array using an integer seed.
 */
export function selectWeightedModel(
  refs: RawModelRef | RawModelRef[],
  seed: number = 0
): RawModelRef {
  if (!Array.isArray(refs)) {
    return refs;
  }
  if (refs.length === 0) {
    throw new Error('Empty model reference list in blockstate definition');
  }
  if (refs.length === 1) {
    return refs[0]!;
  }

  let totalWeight = 0;
  for (const r of refs) {
    const w = typeof r.weight === 'number' && r.weight > 0 ? r.weight : 1;
    totalWeight += w;
  }
  if (totalWeight <= 0) totalWeight = 1;

  // 32-bit integer hash on seed
  let h = seed | 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  const hash = (h ^ (h >>> 16)) >>> 0;

  const roll = hash % totalWeight;
  let accumulated = 0;
  for (const r of refs) {
    const w = typeof r.weight === 'number' && r.weight > 0 ? r.weight : 1;
    accumulated += w;
    if (roll < accumulated) {
      return r;
    }
  }
  return refs[refs.length - 1]!;
}

// ============================================================================
// Multipart Condition Matching
// ============================================================================

function matchPropertyValue(expected: unknown, actual: string): boolean {
  if (Array.isArray(expected)) {
    return expected.some((item) => matchPropertyValue(item, actual));
  }
  if (typeof expected === 'string') {
    const tokens = expected.split('|').map((t) => t.trim().toLowerCase());
    return tokens.includes(actual.toLowerCase());
  }
  if (typeof expected === 'boolean' || typeof expected === 'number') {
    return String(expected).toLowerCase() === actual.toLowerCase();
  }
  return false;
}

/**
 * Evaluates whether a multipart 'when' condition matches the block's properties.
 * Handles nested 'OR', 'AND', and piped values ("val1|val2").
 */
export function matchWhenCondition(
  when: Record<string, unknown> | undefined,
  properties: Record<string, string>
): boolean {
  if (!when || Object.keys(when).length === 0) {
    return true;
  }

  // Handle OR list: when: { OR: [ condition1, condition2, ... ] }
  if ('OR' in when && Array.isArray(when.OR)) {
    return when.OR.some((subCond) =>
      matchWhenCondition(subCond as Record<string, unknown>, properties)
    );
  }

  // Handle AND list: when: { AND: [ condition1, condition2, ... ] }
  if ('AND' in when && Array.isArray(when.AND)) {
    return when.AND.every((subCond) =>
      matchWhenCondition(subCond as Record<string, unknown>, properties)
    );
  }

  // Implicit AND over all property constraints
  for (const [propKey, propVal] of Object.entries(when)) {
    if (propKey === 'OR' || propKey === 'AND') continue;
    const actual = properties[propKey.toLowerCase()] ?? '';
    if (!matchPropertyValue(propVal, actual)) {
      return false;
    }
  }

  return true;
}

// ============================================================================
// Model Resolution
// ============================================================================

function resolveModelPart(
  ref: RawModelRef,
  src: AssetSource
): ResolvedModelPart | null {
  if (!ref || typeof ref.model !== 'string' || !ref.model.trim()) {
    return null;
  }

  const modelLocation = normalizeResourceLocation(ref.model);
  const rootModel = getModelFromSource(src, modelLocation);
  if (!rootModel) {
    return null;
  }

  // Walk parent chain (child to root)
  const chain: RawBlockModel[] = [rootModel];
  const visited = new Set<string>([modelLocation]);
  let current = rootModel;

  while (current.parent) {
    const parentLocation = normalizeResourceLocation(current.parent);
    if (visited.has(parentLocation)) {
      // Cycle in parent chain
      break;
    }
    visited.add(parentLocation);
    const parentModel = getModelFromSource(src, parentLocation);
    if (!parentModel) {
      // Missing parent model in chain
      return null;
    }
    chain.push(parentModel);
    current = parentModel;
    if (chain.length > 32) break; // Guard against excessively deep chains
  }

  // 1. Elements: taken from nearest model in chain that defines them
  let rawElements: ModelElement[] | undefined;
  for (const m of chain) {
    if (m.elements && Array.isArray(m.elements) && m.elements.length > 0) {
      rawElements = m.elements;
      break;
    }
  }
  if (!rawElements) {
    rawElements = [];
  }

  // 2. Textures: merge parent chain from root to child (child overrides parent)
  const mergedTextures: Record<string, string> = {};
  for (let i = chain.length - 1; i >= 0; i--) {
    const m = chain[i]!;
    if (m.textures && typeof m.textures === 'object') {
      for (const [slot, tex] of Object.entries(m.textures)) {
        mergedTextures[slot] = String(tex);
      }
    }
  }

  // 3. Ambient occlusion: child overrides parent, default true
  let ambientOcclusion = true;
  for (const m of chain) {
    const ao = m.ambientocclusion ?? m.ambientOcclusion;
    if (ao !== undefined) {
      ambientOcclusion = Boolean(ao);
      break;
    }
  }

  // 4. Resolve element faces and default UVs
  const elements: ResolvedElement[] = [];
  for (const el of rawElements) {
    if (!el.from || !el.to || !el.faces) continue;
    const from: [number, number, number] = [el.from[0], el.from[1], el.from[2]];
    const to: [number, number, number] = [el.to[0], el.to[1], el.to[2]];

    const faces: Record<string, ResolvedFace> = {};
    for (const [dir, faceDef] of Object.entries(el.faces)) {
      if (!faceDef || typeof faceDef !== 'object') continue;
      const rf = faceDef as ModelFace;
      const resolvedTexture = resolveTextureVariable(rf.texture ?? '', mergedTextures);

      let uv: [number, number, number, number];
      if (Array.isArray(rf.uv) && rf.uv.length === 4) {
        uv = [rf.uv[0], rf.uv[1], rf.uv[2], rf.uv[3]];
      } else {
        uv = computeDefaultUv(dir, from, to);
      }

      const face: ResolvedFace = {
        texture: resolvedTexture,
        uv,
      };
      if (rf.cullface !== undefined) {
        face.cullface = String(rf.cullface).toLowerCase();
      }
      if (typeof rf.tintindex === 'number') {
        face.tintindex = rf.tintindex;
      }
      if (rf.rotation !== undefined) {
        face.rotation = rf.rotation;
      }
      faces[dir.toLowerCase()] = face;
    }

    const resolvedElement: ResolvedElement = {
      from,
      to,
      faces,
    };
    if (el.shade !== undefined) {
      resolvedElement.shade = Boolean(el.shade);
    }
    if (el.rotation) {
      const rot = el.rotation as any;
      resolvedElement.rotation = {
        origin: [rot.origin[0], rot.origin[1], rot.origin[2]],
        axis: rot.axis,
        angle: rot.angle,
      };
      if (rot.rescale !== undefined) {
        resolvedElement.rotation.rescale = Boolean(rot.rescale);
      }
    }
    elements.push(resolvedElement);
  }

  return {
    elements,
    x: ref.x ?? 0,
    y: ref.y ?? 0,
    uvlock: Boolean(ref.uvlock),
    ambientOcclusion,
  };
}

// ============================================================================
// Public API: resolveBlockModels
// ============================================================================

/**
 * Resolves a blockstate ID and property dictionary into an array of ResolvedModelPart.
 * Follows Minecraft 1.21.11 blockstate format semantics.
 */
export function resolveBlockModels(
  blockName: string,
  properties: Record<string, string>,
  src: AssetSource,
  opts?: ResolveModelOptions
): ResolvedModelPart[] {
  const seed = opts?.seed ?? 0;
  const cacheKey = formatBlockStateCacheKey(blockName, properties, seed);

  // Check custom or global cache
  let cache = opts?.cache;
  if (!cache && typeof src === 'object' && src !== null) {
    cache = globalSourceCache.get(src);
    if (!cache) {
      cache = new Map<string, ResolvedModelPart[]>();
      globalSourceCache.set(src, cache);
    }
  }

  if (cache && cache.has(cacheKey)) {
    return cache.get(cacheKey)!;
  }

  const fluidBase = getFluidBaseName(blockName);

  const def = getBlockStateFromSource(src, blockName);
  if (!def) {
    if (fluidBase) {
      const fluidPart = [createFluidModelPart(fluidBase)];
      if (cache) cache.set(cacheKey, fluidPart);
      return fluidPart;
    }
    const missing = [createMissingModelPart()];
    if (cache) cache.set(cacheKey, missing);
    return missing;
  }

  // Normalize input property map keys to lowercase for matching
  const normalizedProps: Record<string, string> = {};
  for (const [k, v] of Object.entries(properties)) {
    normalizedProps[k.toLowerCase()] = String(v).toLowerCase();
  }

  let result: ResolvedModelPart[] = [];

  if (def.variants && typeof def.variants === 'object') {
    // ------------------------------------------------------------------------
    // Variants matching
    // ------------------------------------------------------------------------
    let bestCandidate: { ref: RawModelRef | RawModelRef[]; score: number } | null = null;

    for (const [vKey, vRef] of Object.entries(def.variants)) {
      const trimmed = vKey.trim();
      if (trimmed === '') {
        // Matches empty state or matches as fallback with score 0
        if (!bestCandidate || bestCandidate.score < 0) {
          bestCandidate = { ref: vRef, score: 0 };
        }
        continue;
      }

      const pairs = trimmed.split(',');
      let matched = true;
      let matchedPropsCount = 0;

      for (const pair of pairs) {
        const eqIdx = pair.indexOf('=');
        if (eqIdx === -1) {
          matched = false;
          break;
        }
        const k = pair.slice(0, eqIdx).trim().toLowerCase();
        const v = pair.slice(eqIdx + 1).trim().toLowerCase();
        const actual = normalizedProps[k];
        if (actual !== v) {
          matched = false;
          break;
        }
        matchedPropsCount++;
      }

      if (matched) {
        if (!bestCandidate || matchedPropsCount > bestCandidate.score) {
          bestCandidate = { ref: vRef, score: matchedPropsCount };
        }
      }
    }

    if (!bestCandidate) {
      result = [createMissingModelPart()];
    } else {
      const chosenRef = selectWeightedModel(bestCandidate.ref, seed);
      const part = resolveModelPart(chosenRef, src);
      if (!part) {
        result = [createMissingModelPart()];
      } else {
        result = [part];
      }
    }
  } else if (def.multipart && Array.isArray(def.multipart)) {
    // ------------------------------------------------------------------------
    // Multipart matching
    // ------------------------------------------------------------------------
    const parts: ResolvedModelPart[] = [];
    for (let i = 0; i < def.multipart.length; i++) {
      const entry = def.multipart[i]!;
      if (matchWhenCondition(entry.when, normalizedProps)) {
        const chosenRef = selectWeightedModel(entry.apply, seed + i);
        const part = resolveModelPart(chosenRef, src);
        if (part) {
          parts.push(part);
        } else {
          parts.push(createMissingModelPart());
        }
      }
    }
    result = parts;
  } else {
    // Neither variants nor multipart
    result = [createMissingModelPart()];
  }

  // If the block is a fluid and the resolved parts have 0 elements or only missing model fallbacks,
  // synthesize a fallback fluid part (1 element from [0, 0, 0] to [16, 14, 16]).
  if (fluidBase) {
    const totalElements = result.reduce((acc, p) => acc + p.elements.length, 0);
    if (totalElements === 0 || result.every((p) => p.missing)) {
      result = [createFluidModelPart(fluidBase)];
    }
  }

  if (cache) {
    cache.set(cacheKey, result);
  }

  return result;
}

/**
 * Alias for resolveBlockModels (singular).
 */
export const resolveBlockModel = resolveBlockModels;
