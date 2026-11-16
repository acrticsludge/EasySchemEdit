// packages/operations/src/build-generator.ts
// Procedural build, 3D shape, and block-level voxel editing engine (Slice M1).
// Pure TypeScript, zero framework/browser/Node/Three.js/MCP imports.

import type {
  BlockStateId,
  Bounds3i,
  Vec3i,
} from '../../domain/types.ts';
import {
  blockStateId,
  CANONICAL_AIR,
  isAirLike,
  VANILLA_AIR_LIKE,
} from '../../domain/block-state.ts';
import { formatBlockStateString } from '../../domain/block-state-string.ts';
import type {
  ChunkedVoxelVolume,
} from '../../domain/volume.ts';
import type {
  Placement,
  Project,
} from '../../domain/placement.ts';
import { setBlock, getBlock } from '../../domain/volume-api.ts';
import { resolveBlockAt } from '../../domain/effective-block.ts';
import { localBlockToWorld, worldBlockToLocal } from '../../domain/coordinates.ts';
import { EditorSession } from './session.ts';

// ============================================================================
// Types
// ============================================================================

export type ShapeKind =
  | 'box'
  | 'sphere'
  | 'ellipsoid'
  | 'cylinder'
  | 'pyramid'
  | 'cone'
  | 'arch'
  | 'line'
  | 'roof'
  | 'stairs'
  | 'torus';

export interface ShapeGenerationSpec {
  kind: ShapeKind;
  block: string;
  secondaryBlock?: string;
  center?: Vec3i;
  bounds?: Bounds3i;
  from?: Vec3i;
  to?: Vec3i;
  radius?: number;
  radiusX?: number;
  radiusY?: number;
  radiusZ?: number;
  innerRadius?: number;
  height?: number;
  width?: number;
  depth?: number;
  hollow?: boolean;
  thickness?: number;
  axis?: 'x' | 'y' | 'z';
  createNewPlacement?: boolean;
  placementId?: string;
  placementName?: string;
}

export type StructureKind =
  | 'house'
  | 'tower'
  | 'castle'
  | 'temple'
  | 'bridge'
  | 'tree'
  | 'fountain'
  | 'island'
  | 'modern_villa'
  | 'pagoda'
  | 'ship';

export type StructureStyle =
  | 'medieval'
  | 'modern'
  | 'deepslate'
  | 'desert'
  | 'nether'
  | 'japanese'
  | 'prismarine';

export interface StructurePalette {
  primary: string;
  secondary: string;
  roof: string;
  floor: string;
  accent: string;
  glass: string;
  light: string;
  foliage: string;
  trunk: string;
}

export interface StructureGenerationSpec {
  kind: StructureKind;
  position?: Vec3i;
  style?: StructureStyle;
  size?: { width?: number; height?: number; depth?: number };
  palette?: Partial<StructurePalette>;
  seed?: number;
  createNewPlacement?: boolean;
  placementId?: string;
  placementName?: string;
}

export type BlueprintStep =
  | { kind: 'box'; bounds?: Bounds3i; center?: Vec3i; size?: Vec3i; block: string; hollow?: boolean; thickness?: number }
  | { kind: 'walls'; bounds: Bounds3i; block: string; includeTop?: boolean; includeBottom?: boolean }
  | { kind: 'hollow'; bounds: Bounds3i; thickness?: number }
  | { kind: 'sphere'; center: Vec3i; radius: number; block: string; hollow?: boolean; thickness?: number }
  | { kind: 'cylinder'; center: Vec3i; radius: number; height: number; axis?: 'x' | 'y' | 'z'; block: string; hollow?: boolean }
  | { kind: 'pyramid'; center: Vec3i; height: number; width?: number; block: string; hollow?: boolean }
  | { kind: 'cone'; center: Vec3i; radius: number; height: number; axis?: 'x' | 'y' | 'z'; block: string; hollow?: boolean }
  | { kind: 'arch'; center?: Vec3i; from?: Vec3i; to?: Vec3i; width?: number; height?: number; depth?: number; block: string; thickness?: number }
  | { kind: 'line'; from: Vec3i; to: Vec3i; block: string; thickness?: number }
  | { kind: 'roof'; center: Vec3i; width: number; depth: number; height?: number; block: string; secondaryBlock?: string }
  | { kind: 'stairs'; from: Vec3i; to: Vec3i; width?: number; block: string }
  | { kind: 'set_blocks'; voxels: Array<{ pos: Vec3i; block: string }> }
  | { kind: 'clear'; bounds: Bounds3i }
  | { kind: 'replace'; bounds: Bounds3i; from: string; to: string };

export interface BlueprintSpec {
  name?: string;
  origin?: Vec3i;
  steps: BlueprintStep[];
  createNewPlacement?: boolean;
  placementId?: string;
  placementName?: string;
}

export interface BuildGeneratorResult {
  ok: boolean;
  revision: number;
  changedCells: number;
  placementId: string;
  bounds: Bounds3i;
  error?: string;
}

// ============================================================================
// Palette Presets
// ============================================================================

export const DEFAULT_STYLE_PALETTES: Record<StructureStyle, StructurePalette> = {
  medieval: {
    primary: 'minecraft:oak_planks',
    secondary: 'minecraft:cobblestone',
    roof: 'minecraft:dark_oak_stairs',
    floor: 'minecraft:spruce_planks',
    accent: 'minecraft:oak_log',
    glass: 'minecraft:glass_pane',
    light: 'minecraft:lantern',
    foliage: 'minecraft:oak_leaves',
    trunk: 'minecraft:oak_log',
  },
  modern: {
    primary: 'minecraft:white_concrete',
    secondary: 'minecraft:gray_concrete',
    roof: 'minecraft:smooth_stone_slab',
    floor: 'minecraft:polished_andesite',
    accent: 'minecraft:dark_oak_planks',
    glass: 'minecraft:tinted_glass',
    light: 'minecraft:sea_lantern',
    foliage: 'minecraft:azalea_leaves',
    trunk: 'minecraft:stripped_spruce_log',
  },
  deepslate: {
    primary: 'minecraft:deepslate_bricks',
    secondary: 'minecraft:polished_deepslate',
    roof: 'minecraft:cobbled_deepslate',
    floor: 'minecraft:chiseled_deepslate',
    accent: 'minecraft:cracked_deepslate_bricks',
    glass: 'minecraft:glass_pane',
    light: 'minecraft:soul_lantern',
    foliage: 'minecraft:mangrove_leaves',
    trunk: 'minecraft:polished_basalt',
  },
  desert: {
    primary: 'minecraft:sandstone',
    secondary: 'minecraft:cut_sandstone',
    roof: 'minecraft:smooth_sandstone',
    floor: 'minecraft:chiseled_sandstone',
    accent: 'minecraft:terracotta',
    glass: 'minecraft:orange_stained_glass_pane',
    light: 'minecraft:torch',
    foliage: 'minecraft:jungle_leaves',
    trunk: 'minecraft:acacia_log',
  },
  nether: {
    primary: 'minecraft:nether_bricks',
    secondary: 'minecraft:red_nether_bricks',
    roof: 'minecraft:crimson_planks',
    floor: 'minecraft:polished_blackstone_bricks',
    accent: 'minecraft:chiseled_nether_bricks',
    glass: 'minecraft:red_stained_glass_pane',
    light: 'minecraft:shroomlight',
    foliage: 'minecraft:nether_wart_block',
    trunk: 'minecraft:crimson_stem',
  },
  japanese: {
    primary: 'minecraft:white_terracotta',
    secondary: 'minecraft:stripped_dark_oak_log',
    roof: 'minecraft:dark_prismarine_stairs',
    floor: 'minecraft:spruce_planks',
    accent: 'minecraft:crimson_planks',
    glass: 'minecraft:white_stained_glass_pane',
    light: 'minecraft:lantern',
    foliage: 'minecraft:cherry_leaves',
    trunk: 'minecraft:cherry_log',
  },
  prismarine: {
    primary: 'minecraft:prismarine_bricks',
    secondary: 'minecraft:dark_prismarine',
    roof: 'minecraft:prismarine',
    floor: 'minecraft:sea_lantern',
    accent: 'minecraft:cyan_terracotta',
    glass: 'minecraft:light_blue_stained_glass',
    light: 'minecraft:sea_lantern',
    foliage: 'minecraft:flowering_azalea_leaves',
    trunk: 'minecraft:warped_stem',
  },
};

// ============================================================================
// Block State Parser
// ============================================================================

/**
 * Parses block state strings like 'stone', 'minecraft:oak_Planks',
 * 'minecraft:oak_stairs[facing=north,half=bottom]' into canonical BlockStateId.
 */
export function parseVoxelBlockState(input?: string): BlockStateId {
  if (!input || input.trim() === '') {
    return blockStateId('minecraft:stone');
  }
  const trimmed = input.trim();
  let idPart = trimmed;
  let propsPart: string | undefined;

  const bracketIdx = trimmed.indexOf('[');
  if (bracketIdx !== -1) {
    idPart = trimmed.slice(0, bracketIdx);
    const endBracket = trimmed.lastIndexOf(']');
    if (endBracket !== -1 && endBracket > bracketIdx) {
      propsPart = trimmed.slice(bracketIdx + 1, endBracket);
    }
  }

  let id = idPart.trim().toLowerCase();
  if (!id.includes(':')) {
    id = `minecraft:${id}`;
  }

  const props: Record<string, string> = {};
  if (propsPart && propsPart.trim() !== '') {
    const pairs = propsPart.split(',');
    for (const pair of pairs) {
      const eqIdx = pair.indexOf('=');
      if (eqIdx !== -1) {
        const k = pair.slice(0, eqIdx).trim().toLowerCase();
        const v = pair.slice(eqIdx + 1).trim().toLowerCase();
        if (k && v) {
          props[k] = v;
        }
      }
    }
  }

  return blockStateId(id, props);
}

// ============================================================================
// Deterministic Random Number Generator
// ============================================================================

function createRng(seed = 1337): () => number {
  let s = (seed === 0 ? 1 : seed) >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ============================================================================
// Internal Voxel Commit Engine
// ============================================================================

function commitVoxelsToSession(
  session: EditorSession,
  voxels: Array<{ pos: Vec3i; state: BlockStateId }>,
  options?: {
    createNewPlacement?: boolean;
    placementId?: string;
    placementName?: string;
  },
): BuildGeneratorResult {
  const currentPlacements = session.snapshot().placements;
  const createNew = options?.createNewPlacement ?? (currentPlacements.length === 0);

  if (voxels.length === 0) {
    const emptyBounds: Bounds3i = { min: [0, 0, 0], maxExclusive: [0, 0, 0] };
    return {
      ok: true,
      revision: session.revision,
      changedCells: 0,
      placementId: '',
      bounds: emptyBounds,
    };
  }

  // 1. Calculate bounding box of all voxels in world coordinates
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

  for (const v of voxels) {
    const [x, y, z] = v.pos;
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (z < minZ) minZ = z;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
    if (z > maxZ) maxZ = z;
  }

  const worldBounds: Bounds3i = {
    min: [minX, minY, minZ],
    maxExclusive: [maxX + 1, maxY + 1, maxZ + 1],
  };

  // 2. Mode: Create New Placement (Invariant-compliant & single atomic undo)
  if (createNew) {
    const spanX = maxX - minX + 1;
    const spanY = maxY - minY + 1;
    const spanZ = maxZ - minZ + 1;

    // Volume bounds: min is [0, 0, 0], maxExclusive is a multiple of 16 (at least 16)
    const maxExclusiveX = Math.max(16, Math.ceil(spanX / 16) * 16);
    const maxExclusiveY = Math.max(16, Math.ceil(spanY / 16) * 16);
    const maxExclusiveZ = Math.max(16, Math.ceil(spanZ / 16) * 16);

    const volume: ChunkedVoxelVolume = {
      bounds: {
        min: [0, 0, 0],
        maxExclusive: [maxExclusiveX, maxExclusiveY, maxExclusiveZ],
      },
      chunkSize: 16,
      chunks: new Map(),
      nonAirCount: 0,
      paletteCardinality: 1,
    };

    // Populate the volume using setBlock with local coordinates
    for (const v of voxels) {
      const lx = v.pos[0] - minX;
      const ly = v.pos[1] - minY;
      const lz = v.pos[2] - minZ;
      setBlock(volume, [lx, ly, lz], v.state);
    }

    const placementId = options?.placementId ?? `placement-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const placementName = options?.placementName ?? 'Procedural Build';

    const placement: Placement = {
      id: placementId,
      name: placementName,
      volume,
      transform: {
        translation: [minX, minY, minZ],
        rotationY: 0,
        mirror: 'none',
      },
      origin: [0, 0, 0],
      ancillary: {
        blockEntities: new Map(),
        entities: [],
        pendingBlockTicks: [],
        pendingFluidTicks: [],
        unknownTags: new Map(),
      },
      visible: true,
      locked: false,
      createdAt: new Date().toISOString(),
      source: {
        format: 'generated',
        diagnostics: [],
      },
      eraseTombstones: new Set(),
    };

    const cmdResult = session.execute({ type: 'placement:add', placement });
    if (!cmdResult.ok) {
      return {
        ok: false,
        revision: session.revision,
        changedCells: 0,
        placementId,
        bounds: worldBounds,
        error: cmdResult.error?.message ?? 'Failed to add placement',
      };
    }

    return {
      ok: true,
      revision: session.revision,
      changedCells: voxels.length,
      placementId,
      bounds: worldBounds,
    };
  }

  // 3. Mode: Write into existing placement
  const targetPlacement = options?.placementId
    ? currentPlacements.find((p) => p.id === options.placementId)
    : currentPlacements[0];

  if (!targetPlacement) {
    // If no existing placement found, fallback to creating a new one
    return commitVoxelsToSession(session, voxels, { ...options, placementId: undefined, createNewPlacement: true });
  }

  // Check if writing outside target translation would cause negative local coords or off-grid transform
  let hasOutOfBounds = false;
  let maxLx = 0;
  let maxLy = 0;
  let maxLz = 0;

  for (const v of voxels) {
    try {
      const [lx, ly, lz] = worldBlockToLocal(targetPlacement, v.pos);
      if (lx < 0 || ly < 0 || lz < 0) {
        hasOutOfBounds = true;
        break;
      }
      if (lx > maxLx) maxLx = lx;
      if (ly > maxLy) maxLy = ly;
      if (lz > maxLz) maxLz = lz;
    } catch {
      hasOutOfBounds = true;
      break;
    }
  }

  if (hasOutOfBounds) {
    // Local coordinates would be negative or off-grid, which violates volume.bounds.min = [0,0,0] invariant.
    // Create new placement for safe invariant preservation.
    return commitVoxelsToSession(session, voxels, { ...options, placementId: undefined, createNewPlacement: true });
  }

  // Expand target placement volume bounds if needed
  const peeked = session.peekProject().placements.find((p) => p.id === targetPlacement.id);
  if (peeked) {
    const reqLx = maxLx + 1;
    const reqLy = maxLy + 1;
    const reqLz = maxLz + 1;
    const newMaxX = Math.max(peeked.volume.bounds.maxExclusive[0], Math.ceil(reqLx / 16) * 16);
    const newMaxY = Math.max(peeked.volume.bounds.maxExclusive[1], Math.ceil(reqLy / 16) * 16);
    const newMaxZ = Math.max(peeked.volume.bounds.maxExclusive[2], Math.ceil(reqLz / 16) * 16);
    peeked.volume.bounds = {
      min: peeked.volume.bounds.min,
      maxExclusive: [newMaxX, newMaxY, newMaxZ],
    };
    targetPlacement.volume.bounds = peeked.volume.bounds;
  }

  let totalChanged = 0;
  for (const v of voxels) {
    const res = session.execute({
      type: 'region:fill',
      bounds: {
        min: v.pos,
        maxExclusive: [v.pos[0] + 1, v.pos[1] + 1, v.pos[2] + 1],
      },
      block: v.state,
      placementId: targetPlacement.id,
    });
    if (res.ok) {
      totalChanged += res.changed?.cells ?? 1;
    }
  }

  return {
    ok: true,
    revision: session.revision,
    changedCells: totalChanged,
    placementId: targetPlacement.id,
    bounds: worldBounds,
  };
}

// ============================================================================
// Single & Batch Voxel Inspection and Editing
// ============================================================================

/**
 * Returns the effective block state at a world coordinate.
 */
export function getVoxelBlockAt(
  session: EditorSession,
  pos: Vec3i,
  placementId?: string,
): { pos: Vec3i; block: string; state: BlockStateId; placementId: string | null } {
  const project = session.snapshot();
  if (placementId) {
    const placement = project.placements.find((p) => p.id === placementId);
    if (!placement) {
      return { pos, block: 'minecraft:air', state: CANONICAL_AIR, placementId: null };
    }
    const singleProj: Project = { ...project, placements: [placement] };
    const res = resolveBlockAt(singleProj, pos, project.overlapPolicy);
    return {
      pos,
      block: formatBlockStateString(res.state),
      state: res.state,
      placementId: res.owningPlacementId,
    };
  }

  const res = resolveBlockAt(project, pos, project.overlapPolicy);
  return {
    pos,
    block: formatBlockStateString(res.state),
    state: res.state,
    placementId: res.owningPlacementId,
  };
}

/**
 * Scans a 3D bounding box in world space, counts blocks by canonical state string,
 * and returns up to maxBlocks voxel entries.
 */
export function inspectRegionVoxels(
  session: EditorSession,
  bounds: Bounds3i,
  options?: { maxBlocks?: number; includeAir?: boolean; placementId?: string },
): {
  bounds: Bounds3i;
  nonAirCount: number;
  countsByBlock: Record<string, number>;
  blocks: Array<{ pos: Vec3i; block: string }>;
  truncated: boolean;
} {
  const maxBlocks = options?.maxBlocks ?? 512;
  const includeAir = options?.includeAir ?? false;
  const placementId = options?.placementId;

  // Use peekProject() to avoid deep-cloning all chunk Maps and Uint8Arrays for a read-only inspection
  const project = session.peekProject();
  const targetProject: Project = placementId
    ? {
        ...project,
        placements: project.placements.filter((p) => p.id === placementId),
      }
    : project;

  let nonAirCount = 0;
  const countsByBlock: Record<string, number> = {};
  const blocks: Array<{ pos: Vec3i; block: string }> = [];
  let truncated = false;

  const bMinX = bounds.min[0];
  const bMaxX = bounds.maxExclusive[0];
  const bMinY = bounds.min[1];
  const bMaxY = bounds.maxExclusive[1];
  const bMinZ = bounds.min[2];
  const bMaxZ = bounds.maxExclusive[2];
  const regionVolume = (bMaxX - bMinX) * (bMaxY - bMinY) * (bMaxZ - bMinZ);

  // Fast-path: when includeAir is false and region volume is large (>32,768),
  // scan intersecting non-empty chunks directly instead of querying millions of empty air cells.
  if (!includeAir && regionVolume > 32768) {
    if (targetProject.placements.length === 1) {
      const p = targetProject.placements[0]!;
      if (p.visible) {
        const isIdentity = p.transform.rotationY === 0 && p.transform.mirror === 'none';
        const tx = p.transform.translation[0] - Math.floor(p.origin[0] / 2);
        const ty = p.transform.translation[1] - Math.floor(p.origin[1] / 2);
        const tz = p.transform.translation[2] - Math.floor(p.origin[2] / 2);

        for (const [key, chunk] of p.volume.chunks) {
          if (chunk.palette.length <= 1) continue;

          const parts = key.split('_');
          const cx = parseInt(parts[0]!, 10);
          const cy = parseInt(parts[1]!, 10);
          const cz = parseInt(parts[2]!, 10);

          const chunkBaseX = cx * 16;
          const chunkBaseY = cy * 16;
          const chunkBaseZ = cz * 16;

          if (isIdentity) {
            const cWorldMinX = tx + chunkBaseX;
            const cWorldMaxX = cWorldMinX + 16;
            const cWorldMinY = ty + chunkBaseY;
            const cWorldMaxY = cWorldMinY + 16;
            const cWorldMinZ = tz + chunkBaseZ;
            const cWorldMaxZ = cWorldMinZ + 16;

            const intMinX = Math.max(bMinX, cWorldMinX);
            const intMaxX = Math.min(bMaxX, cWorldMaxX);
            const intMinY = Math.max(bMinY, cWorldMinY);
            const intMaxY = Math.min(bMaxY, cWorldMaxY);
            const intMinZ = Math.max(bMinZ, cWorldMinZ);
            const intMaxZ = Math.min(bMaxZ, cWorldMaxZ);

            if (intMinX >= intMaxX || intMinY >= intMaxY || intMinZ >= intMaxZ) {
              continue;
            }

            const indices = chunk.indices;
            const palette = chunk.palette;

            for (let wy = intMinY; wy < intMaxY; wy++) {
              const ly = wy - cWorldMinY;
              for (let wz = intMinZ; wz < intMaxZ; wz++) {
                const lz = wz - cWorldMinZ;
                const row = (ly * 16 + lz) * 16;
                for (let wx = intMinX; wx < intMaxX; wx++) {
                  const lx = wx - cWorldMinX;
                  const palIdx = indices[row + lx]!;
                  if (palIdx === 0) continue;
                  const st = palette[palIdx]!;
                  if (isAirLike(st.id, VANILLA_AIR_LIKE)) continue;

                  nonAirCount++;
                  const stateStr = formatBlockStateString(st);
                  countsByBlock[stateStr] = (countsByBlock[stateStr] ?? 0) + 1;
                  if (blocks.length < maxBlocks) {
                    blocks.push({ pos: [wx, wy, wz], block: stateStr });
                  } else {
                    truncated = true;
                  }
                }
              }
            }
          } else {
            const indices = chunk.indices;
            const palette = chunk.palette;

            for (let ly = 0; ly < 16; ly++) {
              const cyLocal = chunkBaseY + ly;
              for (let lz = 0; lz < 16; lz++) {
                const czLocal = chunkBaseZ + lz;
                const row = (ly * 16 + lz) * 16;
                for (let lx = 0; lx < 16; lx++) {
                  const palIdx = indices[row + lx]!;
                  if (palIdx === 0) continue;
                  const st = palette[palIdx]!;
                  if (isAirLike(st.id, VANILLA_AIR_LIKE)) continue;

                  const wPos = localBlockToWorld(p, [chunkBaseX + lx, cyLocal, czLocal]);
                  if (
                    wPos[0] >= bMinX && wPos[0] < bMaxX &&
                    wPos[1] >= bMinY && wPos[1] < bMaxY &&
                    wPos[2] >= bMinZ && wPos[2] < bMaxZ
                  ) {
                    nonAirCount++;
                    const stateStr = formatBlockStateString(st);
                    countsByBlock[stateStr] = (countsByBlock[stateStr] ?? 0) + 1;
                    if (blocks.length < maxBlocks) {
                      blocks.push({ pos: wPos, block: stateStr });
                    } else {
                      truncated = true;
                    }
                  }
                }
              }
            }
          }
        }
      }

      return {
        bounds,
        nonAirCount,
        countsByBlock,
        blocks,
        truncated,
      };
    }

    const candidatePositions: Vec3i[] = [];
    const seenPos = new Set<string>();

    for (const p of targetProject.placements) {
      if (!p.visible) continue;
      const isIdentity = p.transform.rotationY === 0 && p.transform.mirror === 'none';
      const tx = p.transform.translation[0] - Math.floor(p.origin[0] / 2);
      const ty = p.transform.translation[1] - Math.floor(p.origin[1] / 2);
      const tz = p.transform.translation[2] - Math.floor(p.origin[2] / 2);

      for (const [key, chunk] of p.volume.chunks) {
        if (chunk.palette.length <= 1) continue;

        const parts = key.split('_');
        const cx = parseInt(parts[0]!, 10);
        const cy = parseInt(parts[1]!, 10);
        const cz = parseInt(parts[2]!, 10);

        const chunkBaseX = cx * 16;
        const chunkBaseY = cy * 16;
        const chunkBaseZ = cz * 16;

        if (isIdentity) {
          const cWorldMinX = tx + chunkBaseX;
          const cWorldMaxX = cWorldMinX + 16;
          const cWorldMinY = ty + chunkBaseY;
          const cWorldMaxY = cWorldMinY + 16;
          const cWorldMinZ = tz + chunkBaseZ;
          const cWorldMaxZ = cWorldMinZ + 16;

          const intMinX = Math.max(bMinX, cWorldMinX);
          const intMaxX = Math.min(bMaxX, cWorldMaxX);
          const intMinY = Math.max(bMinY, cWorldMinY);
          const intMaxY = Math.min(bMaxY, cWorldMaxY);
          const intMinZ = Math.max(bMinZ, cWorldMinZ);
          const intMaxZ = Math.min(bMaxZ, cWorldMaxZ);

          if (intMinX >= intMaxX || intMinY >= intMaxY || intMinZ >= intMaxZ) {
            continue;
          }

          const indices = chunk.indices;
          for (let wy = intMinY; wy < intMaxY; wy++) {
            const ly = wy - cWorldMinY;
            for (let wz = intMinZ; wz < intMaxZ; wz++) {
              const lz = wz - cWorldMinZ;
              const row = (ly * 16 + lz) * 16;
              for (let wx = intMinX; wx < intMaxX; wx++) {
                const lx = wx - cWorldMinX;
                const palIdx = indices[row + lx]!;
                if (palIdx === 0) continue;
                const posKey = `${wx},${wy},${wz}`;
                if (!seenPos.has(posKey)) {
                  seenPos.add(posKey);
                  candidatePositions.push([wx, wy, wz]);
                }
              }
            }
          }
        } else {
          const indices = chunk.indices;
          for (let ly = 0; ly < 16; ly++) {
            const cyLocal = chunkBaseY + ly;
            for (let lz = 0; lz < 16; lz++) {
              const czLocal = chunkBaseZ + lz;
              const row = (ly * 16 + lz) * 16;
              for (let lx = 0; lx < 16; lx++) {
                const palIdx = indices[row + lx]!;
                if (palIdx === 0) continue;
                const wPos = localBlockToWorld(p, [chunkBaseX + lx, cyLocal, czLocal]);
                if (
                  wPos[0] >= bMinX && wPos[0] < bMaxX &&
                  wPos[1] >= bMinY && wPos[1] < bMaxY &&
                  wPos[2] >= bMinZ && wPos[2] < bMaxZ
                ) {
                  const posKey = `${wPos[0]},${wPos[1]},${wPos[2]}`;
                  if (!seenPos.has(posKey)) {
                    seenPos.add(posKey);
                    candidatePositions.push(wPos);
                  }
                }
              }
            }
          }
        }
      }
    }

    // Sort candidate positions in standard scan order (Y, then Z, then X)
    candidatePositions.sort((a, b) =>
      a[1] !== b[1] ? a[1] - b[1] : a[2] !== b[2] ? a[2] - b[2] : a[0] - b[0]
    );

    for (const pos of candidatePositions) {
      const res = resolveBlockAt(targetProject, pos, project.overlapPolicy);
      const isAir = isAirLike(res.state.id, VANILLA_AIR_LIKE);
      if (!isAir) {
        const stateStr = formatBlockStateString(res.state);
        nonAirCount++;
        countsByBlock[stateStr] = (countsByBlock[stateStr] ?? 0) + 1;
        if (blocks.length < maxBlocks) {
          blocks.push({ pos, block: stateStr });
        } else {
          truncated = true;
        }
      }
    }

    return {
      bounds,
      nonAirCount,
      countsByBlock,
      blocks,
      truncated,
    };
  }

  // Standard path for small regions or when includeAir is requested
  for (let y = bMinY; y < bMaxY; y++) {
    for (let z = bMinZ; z < bMaxZ; z++) {
      for (let x = bMinX; x < bMaxX; x++) {
        const pos: Vec3i = [x, y, z];
        const res = resolveBlockAt(targetProject, pos, project.overlapPolicy);
        const stateStr = formatBlockStateString(res.state);
        const isAir = isAirLike(res.state.id, VANILLA_AIR_LIKE);

        if (!isAir) {
          nonAirCount++;
        }

        if (includeAir || !isAir) {
          countsByBlock[stateStr] = (countsByBlock[stateStr] ?? 0) + 1;
          if (blocks.length < maxBlocks) {
            blocks.push({ pos, block: stateStr });
          } else {
            truncated = true;
          }
        }
      }
    }
  }

  return {
    bounds,
    nonAirCount,
    countsByBlock,
    blocks,
    truncated,
  };
}

/**
 * Sets a single block at a world position.
 */
export function setVoxelBlockAt(
  session: EditorSession,
  pos: Vec3i,
  block: string,
  options?: { placementId?: string; placementName?: string; createNewPlacement?: boolean },
): BuildGeneratorResult {
  const state = parseVoxelBlockState(block);
  return commitVoxelsToSession(session, [{ pos, state }], options);
}

/**
 * Sets a batch of blocks at world positions in one atomic operation.
 */
export function setVoxelBlocksBatch(
  session: EditorSession,
  voxels: Array<{ pos: Vec3i; block: string }>,
  options?: { placementId?: string; placementName?: string; createNewPlacement?: boolean },
): BuildGeneratorResult {
  const parsed = voxels.map((v) => ({
    pos: v.pos,
    state: parseVoxelBlockState(v.block),
  }));
  return commitVoxelsToSession(session, parsed, options);
}

// ============================================================================
// 3D Geometric Shape Generator
// ============================================================================

/**
 * Generates geometric 3D shapes (box, sphere, ellipsoid, cylinder, pyramid,
 * cone, arch, line, roof, stairs, torus) and places them into the EditorSession.
 */
export function generateShape(
  session: EditorSession,
  spec: ShapeGenerationSpec,
): BuildGeneratorResult {
  const primaryState = parseVoxelBlockState(spec.block ?? 'minecraft:stone_bricks');
  const secondaryState = spec.secondaryBlock
    ? parseVoxelBlockState(spec.secondaryBlock)
    : primaryState;

  const voxelMap = new Map<string, { pos: Vec3i; state: BlockStateId }>();

  const setVoxel = (x: number, y: number, z: number, state = primaryState) => {
    const key = `${x},${y},${z}`;
    voxelMap.set(key, { pos: [x, y, z], state });
  };

  const center: Vec3i = spec.center ?? [0, 0, 0];
  const [cx, cy, cz] = center;

  switch (spec.kind) {
    case 'box': {
      let minX: number, minY: number, minZ: number;
      let maxX: number, maxY: number, maxZ: number;

      if (spec.bounds) {
        minX = spec.bounds.min[0];
        minY = spec.bounds.min[1];
        minZ = spec.bounds.min[2];
        maxX = spec.bounds.maxExclusive[0];
        maxY = spec.bounds.maxExclusive[1];
        maxZ = spec.bounds.maxExclusive[2];
      } else if (spec.from && spec.to) {
        minX = Math.min(spec.from[0], spec.to[0]);
        minY = Math.min(spec.from[1], spec.to[1]);
        minZ = Math.min(spec.from[2], spec.to[2]);
        maxX = Math.max(spec.from[0], spec.to[0]) + 1;
        maxY = Math.max(spec.from[1], spec.to[1]) + 1;
        maxZ = Math.max(spec.from[2], spec.to[2]) + 1;
      } else {
        const w = spec.width ?? 8;
        const h = spec.height ?? 8;
        const d = spec.depth ?? 8;
        minX = cx - Math.floor(w / 2);
        minY = cy;
        minZ = cz - Math.floor(d / 2);
        maxX = minX + w;
        maxY = minY + h;
        maxZ = minZ + d;
      }

      const hollow = spec.hollow ?? false;
      const t = spec.thickness ?? 1;

      for (let y = minY; y < maxY; y++) {
        for (let z = minZ; z < maxZ; z++) {
          for (let x = minX; x < maxX; x++) {
            if (hollow) {
              const onBorder =
                x - minX < t || maxX - 1 - x < t ||
                y - minY < t || maxY - 1 - y < t ||
                z - minZ < t || maxZ - 1 - z < t;
              if (onBorder) setVoxel(x, y, z);
            } else {
              setVoxel(x, y, z);
            }
          }
        }
      }
      break;
    }

    case 'sphere': {
      const r = spec.radius ?? 5;
      const rSq = (r + 0.5) * (r + 0.5);
      const hollow = spec.hollow ?? false;
      const t = spec.thickness ?? 1;
      const rInSq = hollow ? Math.max(0, r - t + 0.5) * Math.max(0, r - t + 0.5) : 0;

      const ceilR = Math.ceil(r);
      for (let dy = -ceilR; dy <= ceilR; dy++) {
        for (let dz = -ceilR; dz <= ceilR; dz++) {
          for (let dx = -ceilR; dx <= ceilR; dx++) {
            const dSq = dx * dx + dy * dy + dz * dz;
            if (dSq <= rSq) {
              if (!hollow || dSq >= rInSq) {
                setVoxel(cx + dx, cy + dy, cz + dz);
              }
            }
          }
        }
      }
      break;
    }

    case 'ellipsoid': {
      const rx = spec.radiusX ?? spec.radius ?? 6;
      const ry = spec.radiusY ?? spec.radius ?? 4;
      const rz = spec.radiusZ ?? spec.radius ?? 6;
      const hollow = spec.hollow ?? false;
      const t = spec.thickness ?? 1;

      const ceilRx = Math.ceil(rx);
      const ceilRy = Math.ceil(ry);
      const ceilRz = Math.ceil(rz);

      const rxIn = Math.max(0.5, rx - t);
      const ryIn = Math.max(0.5, ry - t);
      const rzIn = Math.max(0.5, rz - t);

      for (let dy = -ceilRy; dy <= ceilRy; dy++) {
        for (let dz = -ceilRz; dz <= ceilRz; dz++) {
          for (let dx = -ceilRx; dx <= ceilRx; dx++) {
            const norm = (dx * dx) / (rx * rx) + (dy * dy) / (ry * ry) + (dz * dz) / (rz * rz);
            if (norm <= 1.05) {
              if (hollow) {
                const innerNorm = (dx * dx) / (rxIn * rxIn) + (dy * dy) / (ryIn * ryIn) + (dz * dz) / (rzIn * rzIn);
                if (innerNorm >= 0.95) {
                  setVoxel(cx + dx, cy + dy, cz + dz);
                }
              } else {
                setVoxel(cx + dx, cy + dy, cz + dz);
              }
            }
          }
        }
      }
      break;
    }

    case 'cylinder': {
      const r = spec.radius ?? 4;
      const h = spec.height ?? 8;
      const axis = spec.axis ?? 'y';
      const hollow = spec.hollow ?? false;
      const t = spec.thickness ?? 1;
      const rSq = (r + 0.5) * (r + 0.5);
      const rInSq = hollow ? Math.max(0, r - t + 0.5) * Math.max(0, r - t + 0.5) : 0;
      const ceilR = Math.ceil(r);

      if (axis === 'y') {
        const minY = cy;
        const maxY = cy + h;
        for (let y = minY; y < maxY; y++) {
          const isCap = y - minY < t || maxY - 1 - y < t;
          for (let dz = -ceilR; dz <= ceilR; dz++) {
            for (let dx = -ceilR; dx <= ceilR; dx++) {
              const dSq = dx * dx + dz * dz;
              if (dSq <= rSq) {
                if (!hollow || isCap || dSq >= rInSq) {
                  setVoxel(cx + dx, y, cz + dz);
                }
              }
            }
          }
        }
      } else if (axis === 'x') {
        const minX = cx;
        const maxX = cx + h;
        for (let x = minX; x < maxX; x++) {
          const isCap = x - minX < t || maxX - 1 - x < t;
          for (let dz = -ceilR; dz <= ceilR; dz++) {
            for (let dy = -ceilR; dy <= ceilR; dy++) {
              const dSq = dy * dy + dz * dz;
              if (dSq <= rSq) {
                if (!hollow || isCap || dSq >= rInSq) {
                  setVoxel(x, cy + dy, cz + dz);
                }
              }
            }
          }
        }
      } else {
        const minZ = cz;
        const maxZ = cz + h;
        for (let z = minZ; z < maxZ; z++) {
          const isCap = z - minZ < t || maxZ - 1 - z < t;
          for (let dy = -ceilR; dy <= ceilR; dy++) {
            for (let dx = -ceilR; dx <= ceilR; dx++) {
              const dSq = dx * dx + dy * dy;
              if (dSq <= rSq) {
                if (!hollow || isCap || dSq >= rInSq) {
                  setVoxel(cx + dx, cy + dy, z);
                }
              }
            }
          }
        }
      }
      break;
    }

    case 'pyramid': {
      const h = spec.height ?? 8;
      const baseW = spec.width ?? (h * 2 - 1);
      const hollow = spec.hollow ?? false;

      for (let dy = 0; dy < h; dy++) {
        const y = cy + dy;
        const halfW = Math.max(0, Math.floor(((baseW - 1) * (1 - dy / h)) / 2));
        for (let dz = -halfW; dz <= halfW; dz++) {
          for (let dx = -halfW; dx <= halfW; dx++) {
            if (hollow && dy > 0 && dy < h - 1) {
              const onBorder = Math.abs(dx) === halfW || Math.abs(dz) === halfW;
              if (onBorder) setVoxel(cx + dx, y, cz + dz);
            } else {
              setVoxel(cx + dx, y, cz + dz);
            }
          }
        }
      }
      break;
    }

    case 'cone': {
      const r = spec.radius ?? 6;
      const h = spec.height ?? 8;
      const hollow = spec.hollow ?? false;
      const t = spec.thickness ?? 1;

      for (let dy = 0; dy < h; dy++) {
        const y = cy + dy;
        const rLayer = r * (1 - dy / h);
        const rLayerSq = (rLayer + 0.5) * (rLayer + 0.5);
        const rInSq = hollow ? Math.max(0, rLayer - t + 0.5) * Math.max(0, rLayer - t + 0.5) : 0;
        const ceilR = Math.ceil(rLayer);

        for (let dz = -ceilR; dz <= ceilR; dz++) {
          for (let dx = -ceilR; dx <= ceilR; dx++) {
            const dSq = dx * dx + dz * dz;
            if (dSq <= rLayerSq) {
              if (!hollow || dy === 0 || dSq >= rInSq) {
                setVoxel(cx + dx, y, cz + dz);
              }
            }
          }
        }
      }
      break;
    }

    case 'arch': {
      const w = spec.width ?? 9;
      const h = spec.height ?? 7;
      const d = spec.depth ?? 3;
      const t = spec.thickness ?? 1;

      const halfW = Math.floor(w / 2);
      const halfD = Math.floor(d / 2);

      for (let dz = -halfD; dz <= halfD; dz++) {
        const z = cz + dz;
        for (let dy = 0; dy < h; dy++) {
          const y = cy + dy;
          for (let dx = -halfW; dx <= halfW; dx++) {
            const x = cx + dx;
            // Arch curve: outer ellipse vs inner ellipse
            const normOuter = (dx * dx) / (halfW * halfW) + (dy * dy) / (h * h);
            const inW = Math.max(1, halfW - t);
            const inH = Math.max(1, h - t);
            const normInner = (dx * dx) / (inW * inW) + (dy * dy) / (inH * inH);

            // Side piers
            const isPillar = (Math.abs(dx) >= halfW - t) && dy < h / 2;
            const isArchRing = normOuter <= 1.25 && normInner >= 0.85 && dy >= h / 3;

            if (isPillar || isArchRing) {
              const isKeystone = Math.abs(dx) === 0 && dy >= h - 1;
              setVoxel(x, y, z, isKeystone ? secondaryState : primaryState);
            }
          }
        }
      }
      break;
    }

    case 'line': {
      const from: Vec3i = spec.from ?? [cx, cy, cz];
      const to: Vec3i = spec.to ?? [cx + 10, cy + 10, cz + 10];
      const t = spec.thickness ?? 1;

      // 3D Bresenham algorithm
      let x0 = from[0], y0 = from[1], z0 = from[2];
      const x1 = to[0], y1 = to[1], z1 = to[2];

      const dx = Math.abs(x1 - x0);
      const dy = Math.abs(y1 - y0);
      const dz = Math.abs(z1 - z0);

      const sx = x0 < x1 ? 1 : -1;
      const sy = y0 < y1 ? 1 : -1;
      const sz = z0 < z1 ? 1 : -1;

      const dm = Math.max(dx, dy, dz);
      let i = dm;
      let x = x0, y = y0, z = z0;
      let xErr = dm / 2, yErr = dm / 2, zErr = dm / 2;

      while (i >= 0) {
        if (t <= 1) {
          setVoxel(x, y, z);
        } else {
          const ht = Math.floor(t / 2);
          for (let oz = -ht; oz <= ht; oz++) {
            for (let oy = -ht; oy <= ht; oy++) {
              for (let ox = -ht; ox <= ht; ox++) {
                setVoxel(x + ox, y + oy, z + oz);
              }
            }
          }
        }
        xErr -= dx;
        if (xErr < 0) { xErr += dm; x += sx; }
        yErr -= dy;
        if (yErr < 0) { yErr += dm; y += sy; }
        zErr -= dz;
        if (zErr < 0) { zErr += dm; z += sz; }
        i--;
      }
      break;
    }

    case 'roof': {
      const w = spec.width ?? 10;
      const d = spec.depth ?? 10;
      const halfW = Math.floor(w / 2);
      const halfD = Math.floor(d / 2);
      const h = spec.height ?? halfW + 1;

      for (let dy = 0; dy < h; dy++) {
        const y = cy + dy;
        const curW = halfW - dy;
        if (curW < 0) break;
        for (let dz = -halfD; dz <= halfD; dz++) {
          const z = cz + dz;
          // Pitched gable along Z axis
          setVoxel(cx - curW, y, z, secondaryState);
          setVoxel(cx + curW, y, z, secondaryState);
          // Fill interior of roof
          for (let ix = -curW + 1; ix < curW; ix++) {
            setVoxel(cx + ix, y, z, primaryState);
          }
        }
      }
      break;
    }

    case 'stairs': {
      const from = spec.from ?? [cx, cy, cz];
      const to = spec.to ?? [cx + 8, cy + 8, cz];
      const w = spec.width ?? 3;
      const halfW = Math.floor(w / 2);

      const totalSteps = Math.max(1, Math.abs(to[1] - from[1]));
      const dx = (to[0] - from[0]) / totalSteps;
      const dz = (to[2] - from[2]) / totalSteps;

      for (let s = 0; s <= totalSteps; s++) {
        const sx = Math.round(from[0] + s * dx);
        const sy = from[1] + s;
        const sz = Math.round(from[2] + s * dz);

        for (let ow = -halfW; ow <= halfW; ow++) {
          const px = Math.abs(dx) > Math.abs(dz) ? sx : sx + ow;
          const pz = Math.abs(dx) > Math.abs(dz) ? sz + ow : sz;
          // Step riser and tread
          setVoxel(px, sy, pz, primaryState);
          // Solid foundation underneath stairs
          for (let fillY = from[1]; fillY < sy; fillY++) {
            setVoxel(px, fillY, pz, secondaryState);
          }
        }
      }
      break;
    }

    case 'torus': {
      const R = spec.radius ?? 8;
      const r = spec.innerRadius ?? spec.thickness ?? 2;
      const hollow = spec.hollow ?? false;
      const t = 1;

      const maxRadius = Math.ceil(R + r);
      const maxH = Math.ceil(r);
      const rSq = (r + 0.5) * (r + 0.5);
      const rInSq = hollow ? Math.max(0, r - t + 0.5) * Math.max(0, r - t + 0.5) : 0;

      for (let dy = -maxH; dy <= maxH; dy++) {
        for (let dz = -maxRadius; dz <= maxRadius; dz++) {
          for (let dx = -maxRadius; dx <= maxRadius; dx++) {
            const rho = Math.sqrt(dx * dx + dz * dz);
            const distSq = (rho - R) * (rho - R) + dy * dy;
            if (distSq <= rSq) {
              if (!hollow || distSq >= rInSq) {
                setVoxel(cx + dx, cy + dy, cz + dz);
              }
            }
          }
        }
      }
      break;
    }
  }

  const voxels = Array.from(voxelMap.values());
  return commitVoxelsToSession(session, voxels, {
    createNewPlacement: spec.createNewPlacement,
    placementId: spec.placementId,
    placementName: spec.placementName ?? `Shape: ${spec.kind}`,
  });
}

// ============================================================================
// Procedural Structure Generator
// ============================================================================

/**
 * Generates architectural procedural structures (house, tower, castle, temple,
 * bridge, tree, fountain, island, modern_villa, pagoda, ship) across 7 styles.
 */
export function generateStructure(
  session: EditorSession,
  spec: StructureGenerationSpec,
): BuildGeneratorResult {
  const style = spec.style ?? 'medieval';
  const basePalette = DEFAULT_STYLE_PALETTES[style] ?? DEFAULT_STYLE_PALETTES.medieval;
  const palette: StructurePalette = {
    ...basePalette,
    ...spec.palette,
  };

  const primary = parseVoxelBlockState(palette.primary);
  const secondary = parseVoxelBlockState(palette.secondary);
  const roof = parseVoxelBlockState(palette.roof);
  const floor = parseVoxelBlockState(palette.floor);
  const accent = parseVoxelBlockState(palette.accent);
  const glass = parseVoxelBlockState(palette.glass);
  const light = parseVoxelBlockState(palette.light);
  const foliage = parseVoxelBlockState(palette.foliage);
  const trunk = parseVoxelBlockState(palette.trunk);

  const pos = spec.position ?? [0, 0, 0];
  const [x0, y0, z0] = pos;
  const rng = createRng(spec.seed ?? 1337);

  const voxelMap = new Map<string, { pos: Vec3i; state: BlockStateId }>();

  const setVoxel = (x: number, y: number, z: number, state: BlockStateId) => {
    const key = `${x},${y},${z}`;
    voxelMap.set(key, { pos: [x, y, z], state });
  };

  switch (spec.kind) {
    case 'house': {
      const w = spec.size?.width ?? 9;
      const h = spec.size?.height ?? 7;
      const d = spec.size?.depth ?? 9;

      // Foundation & Floor
      for (let x = 0; x < w; x++) {
        for (let z = 0; z < d; z++) {
          setVoxel(x0 + x, y0, z0 + z, secondary);
          if (x > 0 && x < w - 1 && z > 0 && z < d - 1) {
            setVoxel(x0 + x, y0, z0 + z, floor);
          }
        }
      }

      // Walls & Corner Posts
      for (let y = 1; y < h; y++) {
        for (let x = 0; x < w; x++) {
          for (let z = 0; z < d; z++) {
            const isCorner = (x === 0 || x === w - 1) && (z === 0 || z === d - 1);
            const isWall = x === 0 || x === w - 1 || z === 0 || z === d - 1;

            if (isCorner) {
              setVoxel(x0 + x, y0 + y, z0 + z, trunk);
            } else if (isWall) {
              // Front door opening
              const isDoor = z === 0 && (x === Math.floor(w / 2)) && y <= 2;
              // Windows
              const isWindow = y === 2 && (
                ((x === 0 || x === w - 1) && (z === 2 || z === d - 3)) ||
                (z === d - 1 && (x === 2 || x === w - 3))
              );

              if (isDoor) {
                // Keep open/air
              } else if (isWindow) {
                setVoxel(x0 + x, y0 + y, z0 + z, glass);
              } else {
                setVoxel(x0 + x, y0 + y, z0 + z, primary);
              }
            }
          }
        }
      }

      // Front porch step
      const doorX = x0 + Math.floor(w / 2);
      setVoxel(doorX, y0, z0 - 1, secondary);

      // Pitched Gable Roof
      const halfW = Math.floor(w / 2);
      for (let ry = 0; ry <= halfW + 1; ry++) {
        const span = halfW + 1 - ry;
        for (let z = -1; z <= d; z++) {
          if (span >= 0) {
            setVoxel(x0 + halfW - span, y0 + h + ry, z0 + z, roof);
            setVoxel(x0 + halfW + span, y0 + h + ry, z0 + z, roof);
            // Triangular wall gable fill
            if (z === 0 || z === d - 1) {
              for (let fillX = x0 + halfW - span + 1; fillX < x0 + halfW + span; fillX++) {
                setVoxel(fillX, y0 + h + ry, z0 + z, primary);
              }
            }
          }
        }
      }

      // Interior lanterns
      setVoxel(x0 + 1, y0 + h - 1, z0 + 1, light);
      setVoxel(x0 + w - 2, y0 + h - 1, z0 + d - 2, light);
      break;
    }

    case 'tower': {
      const diam = spec.size?.width ?? 7;
      const h = spec.size?.height ?? 18;
      const r = Math.floor(diam / 2);

      // Octagonal watchtower shaft
      for (let y = 0; y < h; y++) {
        const isBase = y < 2;
        const isBattlementFloor = y === h - 3;
        const isBattlement = y >= h - 2;

        for (let dz = -r - 1; dz <= r + 1; dz++) {
          for (let dx = -r - 1; dx <= r + 1; dx++) {
            const distSq = dx * dx + dz * dz;

            if (isBase) {
              if (distSq <= (r + 1) * (r + 1)) {
                setVoxel(x0 + dx, y0 + y, z0 + dz, secondary);
              }
            } else if (isBattlementFloor) {
              // Overhanging machicolation parapet
              if (distSq <= (r + 1.5) * (r + 1.5)) {
                setVoxel(x0 + dx, y0 + y, z0 + dz, secondary);
              }
            } else if (isBattlement) {
              // Crenellations
              if (distSq >= (r) * (r) && distSq <= (r + 1.5) * (r + 1.5)) {
                const angle = Math.atan2(dz, dx);
                const merlon = Math.sin(angle * 4) > 0;
                if (merlon) {
                  setVoxel(x0 + dx, y0 + y, z0 + dz, secondary);
                }
              }
            } else {
              // Main wall shaft
              if (distSq <= r * r && distSq >= (r - 1) * (r - 1)) {
                const isWindow = (y % 4 === 2) && (dx === 0 || dz === 0);
                setVoxel(x0 + dx, y0 + y, z0 + dz, isWindow ? glass : primary);
              } else if (y % 5 === 0 && distSq < (r - 1) * (r - 1)) {
                // Internal landings
                setVoxel(x0 + dx, y0 + y, z0 + dz, floor);
              }
            }
          }
        }
      }

      // Beacon lantern at top
      setVoxel(x0, y0 + h - 2, z0, light);
      break;
    }

    case 'castle': {
      const size = spec.size?.width ?? 21;
      const wallH = spec.size?.height ?? 7;
      const half = Math.floor(size / 2);

      // Paved Courtyard
      for (let dz = -half; dz <= half; dz++) {
        for (let dx = -half; dx <= half; dx++) {
          setVoxel(x0 + dx, y0, z0 + dz, secondary);
        }
      }

      // Curtain Walls
      for (let y = 1; y <= wallH; y++) {
        for (let i = -half; i <= half; i++) {
          const merlon = (i % 2 === 0);
          const isTop = y === wallH;

          // Front, Back, Left, Right walls
          const walls = [
            [i, -half],
            [i, half],
            [-half, i],
            [half, i],
          ];

          for (const [wx, wz] of walls) {
            // Front gate opening
            const isGate = wz === -half && Math.abs(wx) <= 2 && y <= 4;
            if (!isGate) {
              if (isTop) {
                if (merlon) setVoxel(x0 + wx, y0 + y, z0 + wz, secondary);
              } else {
                setVoxel(x0 + wx, y0 + y, z0 + wz, primary);
              }
            }
          }
        }
      }

      // 4 Corner Towers (5x5 towers rising to wallH + 4)
      const towerCorners = [
        [-half, -half],
        [half, -half],
        [-half, half],
        [half, half],
      ];

      for (const [tcx, tcz] of towerCorners) {
        for (let ty = 1; ty <= wallH + 4; ty++) {
          for (let odz = -2; odz <= 2; odz++) {
            for (let odx = -2; odx <= 2; odx++) {
              const border = Math.abs(odx) === 2 || Math.abs(odz) === 2;
              if (ty === wallH + 4) {
                // Battlement merlons
                if (border && ((odx + odz) % 2 === 0)) {
                  setVoxel(x0 + tcx + odx, y0 + ty, z0 + tcz + odz, secondary);
                }
              } else if (ty === wallH + 3) {
                // Parapet floor
                setVoxel(x0 + tcx + odx, y0 + ty, z0 + tcz + odz, secondary);
              } else if (border) {
                setVoxel(x0 + tcx + odx, y0 + ty, z0 + tcz + odz, secondary);
              }
            }
          }
        }
        setVoxel(x0 + tcx, y0 + wallH + 4, z0 + tcz, light);
      }

      // Central Keep / Fountain
      setVoxel(x0, y0 + 1, z0, light);
      break;
    }

    case 'temple': {
      const w = spec.size?.width ?? 13;
      const d = spec.size?.depth ?? 19;
      const h = spec.size?.height ?? 8;

      // 3-tier stepped stylobate base
      for (let tier = 0; tier < 3; tier++) {
        const minX = -Math.floor(w / 2) - 2 + tier;
        const maxX = Math.floor(w / 2) + 2 - tier;
        const minZ = -Math.floor(d / 2) - 2 + tier;
        const maxZ = Math.floor(d / 2) + 2 - tier;

        for (let z = minZ; z <= maxZ; z++) {
          for (let x = minX; x <= maxX; x++) {
            setVoxel(x0 + x, y0 + tier, z0 + z, secondary);
          }
        }
      }

      // Peristyle Colonnade (pillars every 2 blocks along perimeter)
      const halfW = Math.floor(w / 2);
      const halfD = Math.floor(d / 2);

      for (let y = 3; y < 3 + h; y++) {
        // Colonnade along X edges
        for (let x = -halfW; x <= halfW; x += 2) {
          setVoxel(x0 + x, y0 + y, z0 - halfD, accent);
          setVoxel(x0 + x, y0 + y, z0 + halfD, accent);
        }
        // Colonnade along Z edges
        for (let z = -halfD; z <= halfD; z += 2) {
          setVoxel(x0 - halfW, y0 + y, z0 + z, accent);
          setVoxel(x0 + halfW, y0 + y, z0 + z, accent);
        }

        // Inner Cella (Sanctum) walls
        if (y < 3 + h - 1) {
          for (let cz = -halfD + 4; cz <= halfD - 4; cz++) {
            for (let cx = -halfW + 3; cx <= halfW - 3; cx++) {
              const cellaWall = cx === -halfW + 3 || cx === halfW - 3 || cz === halfD - 4;
              if (cellaWall) {
                setVoxel(x0 + cx, y0 + y, z0 + cz, primary);
              }
            }
          }
        }
      }

      // Entablature Architrave beam
      const entY = y0 + 3 + h;
      for (let z = -halfD; z <= halfD; z++) {
        for (let x = -halfW; x <= halfW; x++) {
          setVoxel(x0 + x, entY, z0 + z, secondary);
        }
      }

      // Pitched Pediment Roof
      for (let ry = 1; ry <= halfW + 1; ry++) {
        const curW = halfW + 1 - ry;
        for (let z = -halfD - 1; z <= halfD + 1; z++) {
          if (curW >= 0) {
            setVoxel(x0 - curW, entY + ry, z0 + z, roof);
            setVoxel(x0 + curW, entY + ry, z0 + z, roof);
            // Solid front/rear pediment tympanum
            if (z === -halfD || z === halfD) {
              for (let fillX = -curW + 1; fillX < curW; fillX++) {
                setVoxel(x0 + fillX, entY + ry, z0 + z, primary);
              }
            }
          }
        }
      }

      // Central Sanctum Altar
      setVoxel(x0, y0 + 3, z0, secondary);
      setVoxel(x0, y0 + 4, z0, light);
      break;
    }

    case 'bridge': {
      const length = spec.size?.depth ?? 21;
      const width = spec.size?.width ?? 5;
      const halfW = Math.floor(width / 2);
      const halfL = Math.floor(length / 2);
      const archH = 5;

      for (let dz = -halfL; dz <= halfL; dz++) {
        const z = z0 + dz;
        // Parabolic arch profile
        const curve = Math.round(archH * (1 - (dz * dz) / (halfL * halfL)));
        const roadY = y0 + curve + 1;

        // Arch underside support
        for (let dx = -halfW; dx <= halfW; dx++) {
          const x = x0 + dx;
          setVoxel(x, roadY - 1, z, secondary);
          setVoxel(x, roadY, z, floor);

          // Bridge Abutments/Pillars at ends
          if (Math.abs(dz) >= halfL - 2) {
            for (let py = y0; py < roadY; py++) {
              setVoxel(x, py, z, secondary);
            }
          }
        }

        // Side railings & Lamp posts
        setVoxel(x0 - halfW, roadY + 1, z, secondary);
        setVoxel(x0 + halfW, roadY + 1, z, secondary);

        if (dz % 5 === 0) {
          setVoxel(x0 - halfW, roadY + 2, z, light);
          setVoxel(x0 + halfW, roadY + 2, z, light);
        }
      }
      break;
    }

    case 'tree': {
      const h = spec.size?.height ?? 15;
      const canopyR = Math.floor((spec.size?.width ?? 9) / 2);

      // Flared buttress roots
      for (let dy = 0; dy <= 2; dy++) {
        const rootSpread = 2 - dy;
        for (let rz = -rootSpread; rz <= rootSpread; rz++) {
          for (let rx = -rootSpread; rx <= rootSpread; rx++) {
            if (Math.abs(rx) === rootSpread || Math.abs(rz) === rootSpread) {
              setVoxel(x0 + rx, y0 + dy, z0 + rz, trunk);
            }
          }
        }
      }

      // Central Trunk
      for (let y = 0; y < h; y++) {
        setVoxel(x0, y0 + y, z0, trunk);
        if (y < Math.floor(h * 0.6)) {
          setVoxel(x0 + 1, y0 + y, z0, trunk);
          setVoxel(x0, y0 + y, z0 + 1, trunk);
          setVoxel(x0 - 1, y0 + y, z0, trunk);
          setVoxel(x0, y0 + y, z0 - 1, trunk);
        }
      }

      // Branching limbs
      const branches = [
        { startY: Math.floor(h * 0.6), dir: [2, 1, 2] },
        { startY: Math.floor(h * 0.7), dir: [-2, 1, 2] },
        { startY: Math.floor(h * 0.75), dir: [2, 1, -2] },
        { startY: Math.floor(h * 0.8), dir: [-2, 1, -2] },
      ];

      for (const b of branches) {
        for (let step = 1; step <= 3; step++) {
          setVoxel(
            x0 + Math.round(b.dir[0] * (step / 3)),
            y0 + b.startY + Math.round(b.dir[1] * (step / 3)),
            z0 + Math.round(b.dir[2] * (step / 3)),
            trunk,
          );
        }
      }

      // Foliage Clusters
      const leafClusters = [
        { center: [0, h, 0], r: canopyR },
        { center: [2, Math.floor(h * 0.75), 2], r: canopyR - 1 },
        { center: [-2, Math.floor(h * 0.85), 2], r: canopyR - 1 },
        { center: [2, Math.floor(h * 0.9), -2], r: canopyR - 1 },
        { center: [-2, Math.floor(h * 0.95), -2], r: canopyR - 1 },
      ];

      for (const cluster of leafClusters) {
        const [cx, cy, cz] = cluster.center;
        const cr = cluster.r;
        for (let dy = -cr; dy <= cr; dy++) {
          for (let dz = -cr; dz <= cr; dz++) {
            for (let dx = -cr; dx <= cr; dx++) {
              const distSq = dx * dx + dy * dy + dz * dz;
              if (distSq <= cr * cr + (rng() * 1.5)) {
                setVoxel(x0 + cx + dx, y0 + cy + dy, z0 + cz + dz, foliage);
              }
            }
          }
        }
      }
      break;
    }

    case 'fountain': {
      const diam = spec.size?.width ?? 11;
      const r = Math.floor(diam / 2);
      const waterBlock = parseVoxelBlockState('minecraft:water');

      // Paved Plaza & Sunken Basin
      for (let dz = -r - 1; dz <= r + 1; dz++) {
        for (let dx = -r - 1; dx <= r + 1; dx++) {
          const distSq = dx * dx + dz * dz;

          if (distSq <= (r + 1) * (r + 1) && distSq > r * r) {
            // Octagonal stone border rim
            setVoxel(x0 + dx, y0 + 1, z0 + dz, secondary);
            setVoxel(x0 + dx, y0, z0 + dz, secondary);
          } else if (distSq <= r * r) {
            // Basin floor and water
            setVoxel(x0 + dx, y0, z0 + dz, floor);
            setVoxel(x0 + dx, y0 + 1, z0 + dz, waterBlock);
          }
        }
      }

      // Tiered Central Pedestal
      setVoxel(x0, y0 + 1, z0, secondary);
      setVoxel(x0, y0 + 2, z0, secondary);

      // Lower bowl (3x3)
      for (let bz = -1; bz <= 1; bz++) {
        for (let bx = -1; bx <= 1; bx++) {
          setVoxel(x0 + bx, y0 + 3, z0 + bz, secondary);
        }
      }

      // Top Spout Column
      setVoxel(x0, y0 + 4, z0, secondary);
      setVoxel(x0, y0 + 5, z0, waterBlock);

      // 4 Corner Lamp posts
      const lamps = [
        [-r, -r],
        [r, -r],
        [-r, r],
        [r, r],
      ];
      for (const [lx, lz] of lamps) {
        setVoxel(x0 + lx, y0 + 1, z0 + lz, secondary);
        setVoxel(x0 + lx, y0 + 2, z0 + lz, light);
      }
      break;
    }

    case 'island': {
      const r = Math.floor((spec.size?.width ?? 19) / 2);
      const depth = spec.size?.height ?? 12;
      const grassBlock = parseVoxelBlockState('minecraft:grass_block');
      const dirtBlock = parseVoxelBlockState('minecraft:dirt');

      // Inverted rocky stalactite underside
      for (let dy = -depth; dy <= 0; dy++) {
        const progress = (dy + depth) / depth;
        const layerR = r * Math.pow(progress, 0.85);

        for (let dz = -r; dz <= r; dz++) {
          for (let dx = -r; dx <= r; dx++) {
            const distSq = dx * dx + dz * dz;
            const jitter = (Math.sin(dx * 1.5) * Math.cos(dz * 1.5)) * 1.2;

            if (distSq <= (layerR + jitter) * (layerR + jitter)) {
              if (dy >= -2) {
                setVoxel(x0 + dx, y0 + dy, z0 + dz, dirtBlock);
              } else {
                setVoxel(x0 + dx, y0 + dy, z0 + dz, rng() > 0.3 ? secondary : primary);
              }
            }
          }
        }
      }

      // Lush Grass Top Surface
      for (let dz = -r; dz <= r; dz++) {
        for (let dx = -r; dx <= r; dx++) {
          const distSq = dx * dx + dz * dz;
          if (distSq <= r * r) {
            setVoxel(x0 + dx, y0 + 1, z0 + dz, grassBlock);
          }
        }
      }

      // Mini top hill with tree/pond
      setVoxel(x0, y0 + 2, z0, trunk);
      setVoxel(x0, y0 + 3, z0, trunk);
      setVoxel(x0, y0 + 4, z0, foliage);
      setVoxel(x0 + 1, y0 + 4, z0, foliage);
      setVoxel(x0 - 1, y0 + 4, z0, foliage);
      setVoxel(x0, y0 + 4, z0 + 1, foliage);
      setVoxel(x0, y0 + 4, z0 - 1, foliage);
      setVoxel(x0, y0 + 5, z0, foliage);
      break;
    }

    case 'modern_villa': {
      const w = spec.size?.width ?? 14;
      const d = spec.size?.depth ?? 16;
      const h = spec.size?.height ?? 8;
      const waterBlock = parseVoxelBlockState('minecraft:water');

      // Ground floor terrace & outdoor pool
      for (let z = 0; z < d; z++) {
        for (let x = 0; x < w; x++) {
          // Pool on right side (x from 9 to 13, z from 2 to 8)
          if (x >= 9 && x <= 13 && z >= 2 && z <= 8) {
            setVoxel(x0 + x, y0, z0 + z, secondary);
            setVoxel(x0 + x, y0 + 1, z0 + z, waterBlock);
          } else {
            setVoxel(x0 + x, y0, z0 + z, floor);
          }
        }
      }

      // Ground Floor: Open Living Room
      for (let y = 1; y <= 3; y++) {
        for (let z = 0; z < d - 4; z++) {
          for (let x = 0; x < 9; x++) {
            const isBorder = x === 0 || z === 0 || x === 8 || z === d - 5;
            if (isBorder) {
              const isPanoramicGlass = (x === 0 || z === 0) && y >= 2;
              setVoxel(x0 + x, y0 + y, z0 + z, isPanoramicGlass ? glass : primary);
            }
          }
        }
      }

      // Upper Floor Cantilever (Offset white box overhanging the pool)
      const cantilevY = y0 + 4;
      for (let y = 0; y <= 3; y++) {
        for (let z = 2; z < d; z++) {
          for (let x = 3; x < w; x++) {
            const isBorder = x === 3 || z === 2 || x === w - 1 || z === d - 1;
            if (y === 0) {
              setVoxel(x0 + x, cantilevY + y, z0 + z, primary);
            } else if (y === 3) {
              // Flat roof
              setVoxel(x0 + x, cantilevY + y, z0 + z, primary);
            } else if (isBorder) {
              const isGlass = (z === d - 1 || x === w - 1);
              setVoxel(x0 + x, cantilevY + y, z0 + z, isGlass ? glass : primary);
            }
          }
        }
      }

      // Accent lighting
      setVoxel(x0 + 4, cantilevY + 2, z0 + 4, light);
      setVoxel(x0 + 4, y0 + 3, z0 + 4, light);
      break;
    }

    case 'pagoda': {
      const tiers = 3;
      const baseW = spec.size?.width ?? 11;
      const tierH = 5;

      // Base stone plinth
      const halfB = Math.floor(baseW / 2);
      for (let z = -halfB - 1; z <= halfB + 1; z++) {
        for (let dx = -halfB - 1; dx <= halfB + 1; dx++) {
          setVoxel(x0 + dx, y0, z0 + z, secondary);
        }
      }

      for (let t = 0; t < tiers; t++) {
        const curTierW = baseW - t * 2;
        const halfT = Math.floor(curTierW / 2);
        const curY = y0 + 1 + t * tierH;

        // Tier body & pillars
        for (let y = 0; y < tierH - 1; y++) {
          for (let z = -halfT; z <= halfT; z++) {
            for (let dx = -halfT; dx <= halfT; dx++) {
              const isCorner = Math.abs(dx) === halfT && Math.abs(z) === halfT;
              const isWall = Math.abs(dx) === halfT || Math.abs(z) === halfT;
              if (isCorner) {
                setVoxel(x0 + dx, curY + y, z0 + z, trunk);
              } else if (isWall) {
                setVoxel(x0 + dx, curY + y, z0 + z, y === 1 ? glass : primary);
              }
            }
          }
        }

        // Upturned Flared Roof Eaves
        const roofY = curY + tierH - 1;
        const eaveSpread = halfT + 2;

        for (let dz = -eaveSpread; dz <= eaveSpread; dz++) {
          for (let dx = -eaveSpread; dx <= eaveSpread; dx++) {
            const isEaveEdge = Math.abs(dx) === eaveSpread || Math.abs(dz) === eaveSpread;
            const isCornerFlare = Math.abs(dx) === eaveSpread && Math.abs(dz) === eaveSpread;

            if (isCornerFlare) {
              setVoxel(x0 + dx, roofY + 1, z0 + dz, roof);
            } else if (isEaveEdge) {
              setVoxel(x0 + dx, roofY, z0 + dz, roof);
            } else if (Math.abs(dx) <= halfT && Math.abs(dz) <= halfT) {
              setVoxel(x0 + dx, roofY, z0 + dz, roof);
            }
          }
        }
      }

      // Spire Finial at top
      const topY = y0 + 1 + tiers * tierH;
      for (let sy = 0; sy < 4; sy++) {
        setVoxel(x0, topY + sy, z0, secondary);
      }
      setVoxel(x0, topY + 4, z0, light);
      break;
    }

    case 'ship': {
      const length = spec.size?.depth ?? 23;
      const width = spec.size?.width ?? 7;
      const halfL = Math.floor(length / 2);
      const halfW = Math.floor(width / 2);
      const sailBlock = parseVoxelBlockState('minecraft:white_wool');

      for (let dz = -halfL; dz <= halfL; dz++) {
        const z = z0 + dz;
        const progress = Math.abs(dz) / halfL;
        const curW = Math.max(1, Math.round(halfW * (1 - progress * progress * 0.7)));

        // Keel & Curved Hull
        for (let dy = 0; dy <= 4; dy++) {
          const hullY = y0 + dy;
          for (let dx = -curW; dx <= curW; dx++) {
            const x = x0 + dx;
            const isOuterHull = Math.abs(dx) === curW || dy === 0;
            if (isOuterHull) {
              setVoxel(x, hullY, z, primary);
            } else if (dy === 3) {
              // Main Deck
              setVoxel(x, hullY, z, floor);
            }
          }
        }

        // Stern Poop Deck & Captain's Cabin (at rear dz > halfL - 5)
        if (dz > halfL - 5) {
          for (let cy = 4; cy <= 6; cy++) {
            setVoxel(x0 - curW, y0 + cy, z, primary);
            setVoxel(x0 + curW, y0 + cy, z, primary);
            if (dz === halfL) {
              for (let cx = -curW + 1; cx < curW; cx++) {
                setVoxel(x0 + cx, y0 + cy, z, glass);
              }
            }
          }
        }
      }

      // Pointed Bowsprit spar at front (dz < -halfL)
      for (let spar = 1; spar <= 4; spar++) {
        setVoxel(x0, y0 + 4 + Math.floor(spar / 2), z0 - halfL - spar, trunk);
      }

      // Mainmast with Sails
      const mastZ = z0 - 2;
      const mastH = 14;
      for (let my = 3; my < 3 + mastH; my++) {
        setVoxel(x0, y0 + my, mastZ, trunk);
      }

      // Yardarm & Sail
      const yardY = y0 + 10;
      for (let yx = -4; yx <= 4; yx++) {
        setVoxel(x0 + yx, yardY, mastZ, trunk);
        for (let sy = 1; sy <= 5; sy++) {
          setVoxel(x0 + yx, yardY - sy, mastZ, sailBlock);
        }
      }

      // Stern lantern
      setVoxel(x0, y0 + 7, z0 + halfL, light);
      break;
    }
  }

  const voxels = Array.from(voxelMap.values());
  return commitVoxelsToSession(session, voxels, {
    createNewPlacement: spec.createNewPlacement,
    placementId: spec.placementId,
    placementName: spec.placementName ?? `Structure: ${spec.kind} (${style})`,
  });
}

// ============================================================================
// Composite Multi-Step Blueprint Builder
// ============================================================================

/**
 * Executes a declarative multi-step blueprint containing shapes, region ops,
 * and individual blocks, committing them in a single atomic transaction.
 */
export function executeBlueprint(
  session: EditorSession,
  spec: BlueprintSpec,
): BuildGeneratorResult {
  const origin: Vec3i = spec.origin ?? [0, 0, 0];
  const [ox, oy, oz] = origin;

  const voxelMap = new Map<string, { pos: Vec3i; state: BlockStateId }>();

  const setV = (x: number, y: number, z: number, state: BlockStateId) => {
    const key = `${x},${y},${z}`;
    voxelMap.set(key, { pos: [x, y, z], state });
  };

  const removeV = (x: number, y: number, z: number) => {
    const key = `${x},${y},${z}`;
    voxelMap.delete(key);
  };

  for (const step of spec.steps) {
    switch (step.kind) {
      case 'box': {
        const state = parseVoxelBlockState(step.block);
        let minX: number, minY: number, minZ: number;
        let maxX: number, maxY: number, maxZ: number;

        if (step.bounds) {
          minX = ox + step.bounds.min[0];
          minY = oy + step.bounds.min[1];
          minZ = oz + step.bounds.min[2];
          maxX = ox + step.bounds.maxExclusive[0];
          maxY = oy + step.bounds.maxExclusive[1];
          maxZ = oz + step.bounds.maxExclusive[2];
        } else if (step.center && step.size) {
          const cx = ox + step.center[0];
          const cy = oy + step.center[1];
          const cz = oz + step.center[2];
          const hw = Math.floor(step.size[0] / 2);
          const hh = Math.floor(step.size[1] / 2);
          const hd = Math.floor(step.size[2] / 2);
          minX = cx - hw;
          minY = cy - hh;
          minZ = cz - hd;
          maxX = minX + step.size[0];
          maxY = minY + step.size[1];
          maxZ = minZ + step.size[2];
        } else {
          continue;
        }

        const hollow = step.hollow ?? false;
        const t = step.thickness ?? 1;

        for (let y = minY; y < maxY; y++) {
          for (let z = minZ; z < maxZ; z++) {
            for (let x = minX; x < maxX; x++) {
              if (hollow) {
                const border =
                  x - minX < t || maxX - 1 - x < t ||
                  y - minY < t || maxY - 1 - y < t ||
                  z - minZ < t || maxZ - 1 - z < t;
                if (border) setV(x, y, z, state);
              } else {
                setV(x, y, z, state);
              }
            }
          }
        }
        break;
      }

      case 'walls': {
        const state = parseVoxelBlockState(step.block);
        const minX = ox + step.bounds.min[0];
        const minY = oy + step.bounds.min[1];
        const minZ = oz + step.bounds.min[2];
        const maxX = ox + step.bounds.maxExclusive[0];
        const maxY = oy + step.bounds.maxExclusive[1];
        const maxZ = oz + step.bounds.maxExclusive[2];
        const incTop = step.includeTop ?? true;
        const incBottom = step.includeBottom ?? true;

        for (let y = minY; y < maxY; y++) {
          for (let z = minZ; z < maxZ; z++) {
            for (let x = minX; x < maxX; x++) {
              const isSide = x === minX || x === maxX - 1 || z === minZ || z === maxZ - 1;
              const isTop = y === maxY - 1 && incTop;
              const isBottom = y === minY && incBottom;
              if (isSide || isTop || isBottom) {
                setV(x, y, z, state);
              }
            }
          }
        }
        break;
      }

      case 'hollow': {
        const minX = ox + step.bounds.min[0];
        const minY = oy + step.bounds.min[1];
        const minZ = oz + step.bounds.min[2];
        const maxX = ox + step.bounds.maxExclusive[0];
        const maxY = oy + step.bounds.maxExclusive[1];
        const maxZ = oz + step.bounds.maxExclusive[2];
        const t = step.thickness ?? 1;

        for (let y = minY + t; y < maxY - t; y++) {
          for (let z = minZ + t; z < maxZ - t; z++) {
            for (let x = minX + t; x < maxX - t; x++) {
              removeV(x, y, z);
            }
          }
        }
        break;
      }

      case 'sphere': {
        const state = parseVoxelBlockState(step.block);
        const cx = ox + step.center[0];
        const cy = oy + step.center[1];
        const cz = oz + step.center[2];
        const r = step.radius;
        const rSq = (r + 0.5) * (r + 0.5);
        const hollow = step.hollow ?? false;
        const t = step.thickness ?? 1;
        const rInSq = hollow ? Math.max(0, r - t + 0.5) * Math.max(0, r - t + 0.5) : 0;
        const ceilR = Math.ceil(r);

        for (let dy = -ceilR; dy <= ceilR; dy++) {
          for (let dz = -ceilR; dz <= ceilR; dz++) {
            for (let dx = -ceilR; dx <= ceilR; dx++) {
              const dSq = dx * dx + dy * dy + dz * dz;
              if (dSq <= rSq) {
                if (!hollow || dSq >= rInSq) {
                  setV(cx + dx, cy + dy, cz + dz, state);
                }
              }
            }
          }
        }
        break;
      }

      case 'cylinder': {
        const state = parseVoxelBlockState(step.block);
        const cx = ox + step.center[0];
        const cy = oy + step.center[1];
        const cz = oz + step.center[2];
        const r = step.radius;
        const h = step.height;
        const rSq = (r + 0.5) * (r + 0.5);
        const hollow = step.hollow ?? false;
        const ceilR = Math.ceil(r);

        for (let y = cy; y < cy + h; y++) {
          for (let dz = -ceilR; dz <= ceilR; dz++) {
            for (let dx = -ceilR; dx <= ceilR; dx++) {
              const dSq = dx * dx + dz * dz;
              if (dSq <= rSq) {
                if (!hollow || dSq >= (r - 0.5) * (r - 0.5)) {
                  setV(cx + dx, y, cz + dz, state);
                }
              }
            }
          }
        }
        break;
      }

      case 'pyramid': {
        const state = parseVoxelBlockState(step.block);
        const cx = ox + step.center[0];
        const cy = oy + step.center[1];
        const cz = oz + step.center[2];
        const h = step.height;
        const baseW = step.width ?? (h * 2 - 1);

        for (let dy = 0; dy < h; dy++) {
          const hw = Math.max(0, Math.floor(((baseW - 1) * (1 - dy / h)) / 2));
          for (let dz = -hw; dz <= hw; dz++) {
            for (let dx = -hw; dx <= hw; dx++) {
              setV(cx + dx, cy + dy, cz + dz, state);
            }
          }
        }
        break;
      }

      case 'cone': {
        const state = parseVoxelBlockState(step.block);
        const cx = ox + step.center[0];
        const cy = oy + step.center[1];
        const cz = oz + step.center[2];
        const r = step.radius;
        const h = step.height;

        for (let dy = 0; dy < h; dy++) {
          const rLayer = r * (1 - dy / h);
          const rSq = (rLayer + 0.5) * (rLayer + 0.5);
          const ceilR = Math.ceil(rLayer);
          for (let dz = -ceilR; dz <= ceilR; dz++) {
            for (let dx = -ceilR; dx <= ceilR; dx++) {
              if (dx * dx + dz * dz <= rSq) {
                setV(cx + dx, cy + dy, cz + dz, state);
              }
            }
          }
        }
        break;
      }

      case 'arch': {
        const state = parseVoxelBlockState(step.block);
        const cx = ox + (step.center ? step.center[0] : 0);
        const cy = oy + (step.center ? step.center[1] : 0);
        const cz = oz + (step.center ? step.center[2] : 0);
        const w = step.width ?? 9;
        const h = step.height ?? 7;
        const d = step.depth ?? 3;
        const t = step.thickness ?? 1;
        const halfW = Math.floor(w / 2);
        const halfD = Math.floor(d / 2);

        for (let dz = -halfD; dz <= halfD; dz++) {
          for (let dy = 0; dy < h; dy++) {
            for (let dx = -halfW; dx <= halfW; dx++) {
              const normOuter = (dx * dx) / (halfW * halfW) + (dy * dy) / (h * h);
              const inW = Math.max(1, halfW - t);
              const inH = Math.max(1, h - t);
              const normInner = (dx * dx) / (inW * inW) + (dy * dy) / (inH * inH);
              const isPillar = (Math.abs(dx) >= halfW - t) && dy < h / 2;
              const isArchRing = normOuter <= 1.25 && normInner >= 0.85 && dy >= h / 3;
              if (isPillar || isArchRing) {
                setV(cx + dx, cy + dy, cz + dz, state);
              }
            }
          }
        }
        break;
      }

      case 'line': {
        const state = parseVoxelBlockState(step.block);
        const fx = ox + step.from[0], fy = oy + step.from[1], fz = oz + step.from[2];
        const tx = ox + step.to[0], ty = oy + step.to[1], tz = oz + step.to[2];

        const dx = Math.abs(tx - fx), dy = Math.abs(ty - fy), dz = Math.abs(tz - fz);
        const sx = fx < tx ? 1 : -1, sy = fy < ty ? 1 : -1, sz = fz < tz ? 1 : -1;
        const dm = Math.max(dx, dy, dz);
        let i = dm;
        let cx = fx, cy = fy, cz = fz;
        let xErr = dm / 2, yErr = dm / 2, zErr = dm / 2;

        while (i >= 0) {
          setV(cx, cy, cz, state);
          xErr -= dx; if (xErr < 0) { xErr += dm; cx += sx; }
          yErr -= dy; if (yErr < 0) { yErr += dm; cy += sy; }
          zErr -= dz; if (zErr < 0) { zErr += dm; cz += sz; }
          i--;
        }
        break;
      }

      case 'roof': {
        const state = parseVoxelBlockState(step.block);
        const secState = step.secondaryBlock ? parseVoxelBlockState(step.secondaryBlock) : state;
        const cx = ox + step.center[0], cy = oy + step.center[1], cz = oz + step.center[2];
        const halfW = Math.floor(step.width / 2);
        const halfD = Math.floor(step.depth / 2);
        const h = step.height ?? (halfW + 1);

        for (let dy = 0; dy < h; dy++) {
          const curW = halfW - dy;
          if (curW < 0) break;
          for (let dz = -halfD; dz <= halfD; dz++) {
            setV(cx - curW, cy + dy, cz + dz, secState);
            setV(cx + curW, cy + dy, cz + dz, secState);
            for (let fillX = -curW + 1; fillX < curW; fillX++) {
              setV(cx + fillX, cy + dy, cz + dz, state);
            }
          }
        }
        break;
      }

      case 'stairs': {
        const state = parseVoxelBlockState(step.block);
        const fx = ox + step.from[0], fy = oy + step.from[1], fz = oz + step.from[2];
        const tx = ox + step.to[0], ty = oy + step.to[1], tz = oz + step.to[2];
        const w = step.width ?? 3;
        const halfW = Math.floor(w / 2);
        const steps = Math.max(1, Math.abs(ty - fy));
        const dx = (tx - fx) / steps;
        const dz = (tz - fz) / steps;

        for (let s = 0; s <= steps; s++) {
          const sx = Math.round(fx + s * dx);
          const sy = fy + s;
          const sz = Math.round(fz + s * dz);
          for (let ow = -halfW; ow <= halfW; ow++) {
            const px = Math.abs(dx) > Math.abs(dz) ? sx : sx + ow;
            const pz = Math.abs(dx) > Math.abs(dz) ? sz + ow : sz;
            setV(px, sy, pz, state);
          }
        }
        break;
      }

      case 'set_blocks': {
        for (const vb of step.voxels) {
          const st = parseVoxelBlockState(vb.block);
          setV(ox + vb.pos[0], oy + vb.pos[1], oz + vb.pos[2], st);
        }
        break;
      }

      case 'clear': {
        const minX = ox + step.bounds.min[0];
        const minY = oy + step.bounds.min[1];
        const minZ = oz + step.bounds.min[2];
        const maxX = ox + step.bounds.maxExclusive[0];
        const maxY = oy + step.bounds.maxExclusive[1];
        const maxZ = oz + step.bounds.maxExclusive[2];
        for (let y = minY; y < maxY; y++) {
          for (let z = minZ; z < maxZ; z++) {
            for (let x = minX; x < maxX; x++) {
              removeV(x, y, z);
            }
          }
        }
        break;
      }

      case 'replace': {
        const fromState = parseVoxelBlockState(step.from);
        const toState = parseVoxelBlockState(step.to);
        const minX = ox + step.bounds.min[0];
        const minY = oy + step.bounds.min[1];
        const minZ = oz + step.bounds.min[2];
        const maxX = ox + step.bounds.maxExclusive[0];
        const maxY = oy + step.bounds.maxExclusive[1];
        const maxZ = oz + step.bounds.maxExclusive[2];

        for (const [key, v] of voxelMap) {
          const [vx, vy, vz] = v.pos;
          if (vx >= minX && vx < maxX && vy >= minY && vy < maxY && vz >= minZ && vz < maxZ) {
            if (v.state.id === fromState.id) {
              voxelMap.set(key, { pos: v.pos, state: toState });
            }
          }
        }
        break;
      }
    }
  }

  const voxels = Array.from(voxelMap.values());
  return commitVoxelsToSession(session, voxels, {
    createNewPlacement: spec.createNewPlacement,
    placementId: spec.placementId,
    placementName: spec.placementName ?? spec.name ?? 'Blueprint Build',
  });
}
