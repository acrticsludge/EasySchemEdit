// apps/web/src/editor/tools/region-tools.ts
// RegionToolsController: executes region operations (fill, replace, delete, hollow, walls, move)
// and clipboard commands (copy, cut, paste) against EditorSessionStore (SUBSPEC-D §2.4, §4, §5).

import type { BlockStateId, Bounds3i, Vec3i } from '@easyschemedit/domain';
import { blockStateId } from '../../../../../packages/domain/block-state.ts';
import type {
  BlockStateMatcher,
  ClipboardCopyCommand,
  ClipboardCutCommand,
  ClipboardPasteCommand,
  RegionDeleteCommand,
  RegionFillCommand,
  RegionHollowCommand,
  RegionMoveCommand,
  RegionReplaceCommand,
  RegionWallsCommand,
  Result,
} from '@easyschemedit/operations';
import type { EditorSessionStore } from '../session-store.ts';
import type { SelectionToolController } from './selection-tool.ts';

// ============================================================================
// 1.21.11 Fallback Curated Block Registry
// ============================================================================

export const DEFAULT_1_21_11_BLOCKS: string[] = [
  'minecraft:air',
  'minecraft:stone',
  'minecraft:granite',
  'minecraft:polished_granite',
  'minecraft:diorite',
  'minecraft:polished_diorite',
  'minecraft:andesite',
  'minecraft:polished_andesite',
  'minecraft:deepslate',
  'minecraft:cobbled_deepslate',
  'minecraft:polished_deepslate',
  'minecraft:calcite',
  'minecraft:tuff',
  'minecraft:dripstone_block',
  'minecraft:dirt',
  'minecraft:coarse_dirt',
  'minecraft:rooted_dirt',
  'minecraft:mud',
  'minecraft:grass_block',
  'minecraft:sand',
  'minecraft:red_sand',
  'minecraft:gravel',
  'minecraft:cobblestone',
  'minecraft:mossy_cobblestone',
  'minecraft:smooth_stone',
  'minecraft:stone_bricks',
  'minecraft:mossy_stone_bricks',
  'minecraft:cracked_stone_bricks',
  'minecraft:chiseled_stone_bricks',
  'minecraft:obsidian',
  'minecraft:crying_obsidian',
  'minecraft:bedrock',
  // Woods
  'minecraft:oak_planks',
  'minecraft:spruce_planks',
  'minecraft:birch_planks',
  'minecraft:jungle_planks',
  'minecraft:acacia_planks',
  'minecraft:dark_oak_planks',
  'minecraft:mangrove_planks',
  'minecraft:cherry_planks',
  'minecraft:bamboo_planks',
  'minecraft:bamboo_mosaic',
  'minecraft:crimson_planks',
  'minecraft:warped_planks',
  'minecraft:oak_log',
  'minecraft:spruce_log',
  'minecraft:birch_log',
  'minecraft:jungle_log',
  'minecraft:acacia_log',
  'minecraft:dark_oak_log',
  'minecraft:mangrove_log',
  'minecraft:cherry_log',
  'minecraft:oak_leaves',
  'minecraft:spruce_leaves',
  'minecraft:birch_leaves',
  'minecraft:jungle_leaves',
  'minecraft:acacia_leaves',
  'minecraft:dark_oak_leaves',
  'minecraft:mangrove_leaves',
  'minecraft:cherry_leaves',
  'minecraft:azalea_leaves',
  // Ores & Metals
  'minecraft:coal_block',
  'minecraft:iron_block',
  'minecraft:gold_block',
  'minecraft:diamond_block',
  'minecraft:netherite_block',
  'minecraft:copper_block',
  'minecraft:raw_iron_block',
  'minecraft:raw_gold_block',
  'minecraft:raw_copper_block',
  'minecraft:amethyst_block',
  'minecraft:redstone_block',
  'minecraft:lapis_block',
  'minecraft:emerald_block',
  // 1.21 Tricky Trials additions
  'minecraft:chiseled_copper',
  'minecraft:copper_grate',
  'minecraft:cut_copper',
  'minecraft:copper_bulb',
  'minecraft:tuff_bricks',
  'minecraft:chiseled_tuff',
  'minecraft:polished_tuff',
  'minecraft:chiseled_tuff_bricks',
  'minecraft:crafter',
  'minecraft:vault',
  'minecraft:heavy_core',
  // Glass & Utility
  'minecraft:glass',
  'minecraft:white_stained_glass',
  'minecraft:tinted_glass',
  'minecraft:glowstone',
  'minecraft:sea_lantern',
  'minecraft:shroomlight',
  'minecraft:ochre_froglight',
  'minecraft:verdant_froglight',
  'minecraft:pearlescent_froglight',
  'minecraft:bookshelf',
  'minecraft:chiseled_bookshelf',
  'minecraft:crafting_table',
  'minecraft:furnace',
  'minecraft:chest',
  'minecraft:barrel',
  'minecraft:anvil',
  'minecraft:bell',
  'minecraft:beacon',
  'minecraft:conduit',
  // Color blocks
  'minecraft:white_wool',
  'minecraft:orange_wool',
  'minecraft:magenta_wool',
  'minecraft:light_blue_wool',
  'minecraft:yellow_wool',
  'minecraft:lime_wool',
  'minecraft:pink_wool',
  'minecraft:gray_wool',
  'minecraft:light_gray_wool',
  'minecraft:cyan_wool',
  'minecraft:purple_wool',
  'minecraft:blue_wool',
  'minecraft:brown_wool',
  'minecraft:green_wool',
  'minecraft:red_wool',
  'minecraft:black_wool',
  'minecraft:white_concrete',
  'minecraft:terracotta',
  'minecraft:bricks',
  'minecraft:mud_bricks',
  'minecraft:prismarine',
  'minecraft:prismarine_bricks',
  'minecraft:dark_prismarine',
  'minecraft:nether_bricks',
  'minecraft:red_nether_bricks',
  'minecraft:end_stone',
  'minecraft:end_stone_bricks',
  'minecraft:purpur_block',
  'minecraft:quartz_block',
  // Redstone & Functional
  'minecraft:redstone_wire',
  'minecraft:repeater',
  'minecraft:comparator',
  'minecraft:piston',
  'minecraft:sticky_piston',
  'minecraft:observer',
  'minecraft:dropper',
  'minecraft:dispenser',
  'minecraft:hopper',
  'minecraft:target',
  'minecraft:lever',
  'minecraft:stone_button',
  'minecraft:oak_button',
  // Stairs, Slabs, Walls, Doors
  'minecraft:stone_stairs',
  'minecraft:oak_stairs',
  'minecraft:stone_slab',
  'minecraft:oak_slab',
  'minecraft:cobblestone_wall',
  'minecraft:oak_fence',
  'minecraft:oak_door',
  'minecraft:iron_door',
  'minecraft:oak_trapdoor',
  'minecraft:iron_trapdoor',
];

// ============================================================================
// Block State String Formatting & Parsing Helpers
// ============================================================================

export interface ParsedBlockState {
  baseId: string;
  properties: Record<string, string>;
  id: string; // for BlockStateId compatibility
  props: Readonly<Record<string, string>>; // for BlockStateId compatibility
}

/**
 * Formats a base block ID and property dictionary into a canonical Minecraft block state string:
 * `minecraft:name[k1=v1,k2=v2]` with keys sorted alphabetically.
 */
export function formatBlockStateString(
  baseIdOrState: string | BlockStateId,
  properties?: Record<string, string>
): string {
  if (typeof baseIdOrState === 'object' && baseIdOrState !== null && 'id' in baseIdOrState) {
    const rawId = baseIdOrState.id.includes(':') ? baseIdOrState.id.toLowerCase() : `minecraft:${baseIdOrState.id.toLowerCase()}`;
    const props = { ...baseIdOrState.props, ...(properties ?? {}) };
    const keys = Object.keys(props).sort();
    if (keys.length === 0) return rawId;
    return `${rawId}[${keys.map((k) => `${k.toLowerCase()}=${String(props[k]).toLowerCase()}`).join(',')}]`;
  }

  let id = String(baseIdOrState ?? '').trim().toLowerCase();
  let props: Record<string, string> = {};

  if (id.includes('[')) {
    const parsed = parseBlockStateString(id);
    id = parsed.baseId;
    props = { ...parsed.properties, ...(properties ?? {}) };
  } else {
    props = properties ? { ...properties } : {};
  }

  if (!id.includes(':')) {
    id = `minecraft:${id}`;
  }

  const keys = Object.keys(props).sort();
  if (keys.length === 0) return id;
  return `${id}[${keys.map((k) => `${k.toLowerCase()}=${String(props[k]).toLowerCase()}`).join(',')}]`;
}

/**
 * Parses a block state string (or BlockStateId) into normalized base ID and key/value property map.
 */
export function parseBlockStateString(state: string | BlockStateId): ParsedBlockState {
  if (typeof state === 'object' && state !== null && 'id' in state) {
    const baseId = state.id.includes(':') ? state.id.toLowerCase() : `minecraft:${state.id.toLowerCase()}`;
    const properties: Record<string, string> = {};
    if (state.props) {
      for (const k of Object.keys(state.props).sort()) {
        properties[k.toLowerCase()] = String(state.props[k]).toLowerCase();
      }
    }
    return {
      baseId,
      properties,
      id: baseId,
      props: properties,
    };
  }

  const str = String(state ?? '').trim();
  let idPart = str;
  let propsPart: string | undefined;

  const bracketIdx = str.indexOf('[');
  if (bracketIdx !== -1 && str.endsWith(']')) {
    idPart = str.slice(0, bracketIdx);
    propsPart = str.slice(bracketIdx + 1, -1);
  }

  let baseId = idPart.toLowerCase();
  if (!baseId.includes(':')) {
    baseId = `minecraft:${baseId}`;
  }

  const properties: Record<string, string> = {};
  if (propsPart && propsPart.trim() !== '') {
    const pairs = propsPart.split(',');
    for (const pair of pairs) {
      const eqIdx = pair.indexOf('=');
      if (eqIdx !== -1) {
        const k = pair.slice(0, eqIdx).trim().toLowerCase();
        const v = pair.slice(eqIdx + 1).trim().toLowerCase();
        if (k && v) {
          properties[k] = v;
        }
      }
    }
  }

  return {
    baseId,
    properties,
    id: baseId,
    props: properties,
  };
}

/**
 * Converts a string or BlockStateId into a canonical domain BlockStateId.
 */
export function toBlockStateId(input: string | BlockStateId): BlockStateId {
  if (typeof input === 'object' && input !== null && 'id' in input && 'props' in input) {
    return input;
  }
  const parsed = parseBlockStateString(input);
  return blockStateId(parsed.baseId, parsed.properties);
}

/**
 * Parses a string matcher (e.g. 'minecraft:stone' or 'minecraft:oak_stairs[facing=north]') into BlockStateMatcher.
 */
export function parseMatcher(input: string | BlockStateMatcher): BlockStateMatcher {
  if (typeof input === 'object' && input !== null && 'mode' in input) {
    return input;
  }
  const str = String(input ?? '').trim();
  if (str.includes('[')) {
    const parsed = parseBlockStateString(str);
    return {
      mode: 'block-id-and-properties',
      blockId: parsed.baseId,
      properties: parsed.properties,
    };
  }
  const parsed = parseBlockStateString(str);
  return {
    mode: 'block-id-only',
    blockId: parsed.baseId,
  };
}

// ============================================================================
// RegionToolsController
// ============================================================================

export interface RegionFillOptions {
  bounds?: Bounds3i;
  placementId?: string;
  skipAir?: boolean;
}

export interface RegionReplaceOptions {
  bounds?: Bounds3i;
  placementId?: string;
  preserveProperties?: boolean;
}

export interface RegionDeleteOptions {
  bounds?: Bounds3i;
  placementId?: string;
}

export interface RegionHollowOptions {
  bounds?: Bounds3i;
  placementId?: string;
  shellThickness?: number;
}

export interface RegionWallsOptions {
  bounds?: Bounds3i;
  placementId?: string;
  includeTop?: boolean;
  includeBottom?: boolean;
  fillInterior?: BlockStateId | string | null;
}

export interface RegionMoveOptions {
  sourceBounds?: Bounds3i;
  affectedPlacements?: string[];
  overlapPolicy?: 'top-wins' | 'bottom-wins';
}

export interface ClipboardCopyOptions {
  bounds?: Bounds3i;
  scope?: 'effective-composite' | 'source-placement';
}

export interface ClipboardCutOptions {
  bounds?: Bounds3i;
  scope?: 'effective-composite' | 'source-placement';
}

export interface ClipboardPasteOptions {
  intoPlacementId?: string;
  skipAir?: boolean;
  rotationY?: 0 | 90 | 180 | 270;
  mirror?: 'none' | 'x' | 'z';
}

export class RegionToolsController {
  private store: EditorSessionStore;
  private selectionTool?: SelectionToolController;

  constructor(store: EditorSessionStore, selectionTool?: SelectionToolController) {
    this.store = store;
    this.selectionTool = selectionTool;
  }

  /**
   * Resolves explicit bounds or reads from selection controller / store.
   */
  public resolveBounds(explicitBounds?: Bounds3i): Bounds3i {
    if (explicitBounds) {
      return {
        min: [...explicitBounds.min] as Vec3i,
        maxExclusive: [...explicitBounds.maxExclusive] as Vec3i,
      };
    }
    if (this.selectionTool) {
      const active = this.selectionTool.getActiveBounds();
      if (active) return active;
    }
    const sel = (this.store.session as any).selection;
    if (sel && sel.type === 'cuboid' && sel.selection.kind === 'cuboid') {
      const b = sel.selection.bounds;
      if (b.maxX > b.minX && b.maxY > b.minY && b.maxZ > b.minZ) {
        return {
          min: [b.minX, b.minY, b.minZ],
          maxExclusive: [b.maxX, b.maxY, b.maxZ],
        };
      }
    }
    throw new Error('No active cuboid selection and no bounds provided');
  }

  /**
   * Fills region with block state.
   */
  public async fill(block: BlockStateId | string, opts?: RegionFillOptions): Promise<Result<any>> {
    let bounds: Bounds3i;
    try {
      bounds = this.resolveBounds(opts?.bounds);
    } catch (err: any) {
      return { ok: false, success: false, error: { code: 'NO_SELECTION', message: err.message } };
    }

    const cmd: RegionFillCommand = {
      type: 'region:fill',
      bounds,
      block: toBlockStateId(block),
      placementId: opts?.placementId,
      options: {
        overrideAir: opts?.skipAir !== undefined ? !opts.skipAir : undefined,
      },
    };

    return this.store.execute(cmd);
  }

  /**
   * Replaces blocks matching matcher with replacement block state.
   */
  public async replace(
    matcher: string | BlockStateMatcher,
    replacement: BlockStateId | string,
    opts?: RegionReplaceOptions
  ): Promise<Result<any>> {
    let bounds: Bounds3i;
    try {
      bounds = this.resolveBounds(opts?.bounds);
    } catch (err: any) {
      return { ok: false, success: false, error: { code: 'NO_SELECTION', message: err.message } };
    }

    const cmd: RegionReplaceCommand = {
      type: 'region:replace',
      bounds,
      matcher: parseMatcher(matcher),
      replacement: toBlockStateId(replacement),
      preserveProperties: opts?.preserveProperties,
      placementId: opts?.placementId,
    };

    return this.store.execute(cmd);
  }

  /**
   * Deletes region (replaces with air).
   */
  public async deleteRegion(opts?: RegionDeleteOptions): Promise<Result<any>> {
    let bounds: Bounds3i;
    try {
      bounds = this.resolveBounds(opts?.bounds);
    } catch (err: any) {
      return { ok: false, success: false, error: { code: 'NO_SELECTION', message: err.message } };
    }

    const cmd: RegionDeleteCommand = {
      type: 'region:delete',
      bounds,
      placementId: opts?.placementId,
    };

    return this.store.execute(cmd);
  }

  /**
   * Hollows out the interior of the selected region leaving shell of specified thickness.
   */
  public async hollow(opts?: RegionHollowOptions): Promise<Result<any>> {
    let bounds: Bounds3i;
    try {
      bounds = this.resolveBounds(opts?.bounds);
    } catch (err: any) {
      return { ok: false, success: false, error: { code: 'NO_SELECTION', message: err.message } };
    }

    const cmd: RegionHollowCommand = {
      type: 'region:hollow',
      bounds,
      shellThickness: opts?.shellThickness,
      placementId: opts?.placementId,
    };

    return this.store.execute(cmd);
  }

  /**
   * Creates walls around the perimeter of the selected region.
   */
  public async walls(wallBlock: BlockStateId | string, opts?: RegionWallsOptions): Promise<Result<any>> {
    let bounds: Bounds3i;
    try {
      bounds = this.resolveBounds(opts?.bounds);
    } catch (err: any) {
      return { ok: false, success: false, error: { code: 'NO_SELECTION', message: err.message } };
    }

    const cmd: RegionWallsCommand = {
      type: 'region:walls',
      bounds,
      wallBlock: toBlockStateId(wallBlock),
      includeTop: opts?.includeTop ?? true,
      includeBottom: opts?.includeBottom ?? true,
      fillInterior: opts?.fillInterior ? toBlockStateId(opts.fillInterior) : null,
      placementId: opts?.placementId,
    };

    return this.store.execute(cmd);
  }

  /**
   * Moves blocks in the selected region by a translation offset.
   */
  public async moveRegion(offset: Vec3i, opts?: RegionMoveOptions): Promise<Result<any>> {
    let sourceBounds: Bounds3i;
    try {
      sourceBounds = this.resolveBounds(opts?.sourceBounds);
    } catch (err: any) {
      return { ok: false, success: false, error: { code: 'NO_SELECTION', message: err.message } };
    }

    const cmd: RegionMoveCommand = {
      type: 'region:move',
      sourceBounds,
      offset,
      affectedPlacements: opts?.affectedPlacements,
      overlapPolicy: opts?.overlapPolicy,
    };

    return this.store.execute(cmd);
  }

  /**
   * Copies the selected region into clipboard.
   */
  public async copy(opts?: ClipboardCopyOptions): Promise<Result<any>> {
    let bounds: Bounds3i;
    try {
      bounds = this.resolveBounds(opts?.bounds);
    } catch (err: any) {
      return { ok: false, success: false, error: { code: 'NO_SELECTION', message: err.message } };
    }

    const cmd: ClipboardCopyCommand = {
      type: 'clipboard:copy',
      selection: {
        kind: 'cuboid',
        bounds,
      },
      scope: opts?.scope ?? 'effective-composite',
    };

    return this.store.execute(cmd);
  }

  /**
   * Cuts the selected region into clipboard.
   */
  public async cut(opts?: ClipboardCutOptions): Promise<Result<any>> {
    let bounds: Bounds3i;
    try {
      bounds = this.resolveBounds(opts?.bounds);
    } catch (err: any) {
      return { ok: false, success: false, error: { code: 'NO_SELECTION', message: err.message } };
    }

    const cmd: ClipboardCutCommand = {
      type: 'clipboard:cut',
      selection: {
        kind: 'cuboid',
        bounds,
      },
      scope: opts?.scope ?? 'effective-composite',
    };

    return this.store.execute(cmd);
  }

  /**
   * Pastes clipboard content at target position.
   */
  public async paste(targetPosition: Vec3i, opts?: ClipboardPasteOptions): Promise<Result<any>> {
    const cmd: ClipboardPasteCommand = {
      type: 'clipboard:paste',
      targetPosition,
      intoPlacementId: opts?.intoPlacementId,
      skipAir: opts?.skipAir,
      rotationY: opts?.rotationY,
      mirror: opts?.mirror,
    };

    return this.store.execute(cmd);
  }
}
