// apps/web/src/editor/viewport/clipboard-preview.ts
// Isometric thumbnail preview generator for clipboard entries.
// Supports both sparse ChunkedVoxelVolume and raw ClipboardBlockData lists.
// Fully safe in non-browser/Node.js test environments (returns null without throwing).

import type { Bounds3i, ChunkedVoxelVolume } from '@easyschemedit/domain';
import type { ClipboardEntry } from '@easyschemedit/operations';

export interface SampledBlock {
  x: number;
  y: number;
  z: number;
  blockId: string;
  topExposed?: boolean;
  leftExposed?: boolean;
  rightExposed?: boolean;
}

/**
 * Common vanilla Minecraft block color mapping.
 * Used for deterministic, recognizable isometric thumbnails.
 */
export const KNOWN_BLOCK_COLORS: Record<string, [number, number, number]> = {
  // Stone & Geologic
  'minecraft:stone': [125, 125, 125],
  'minecraft:granite': [150, 103, 84],
  'minecraft:polished_granite': [154, 106, 89],
  'minecraft:diorite': [185, 185, 187],
  'minecraft:polished_diorite': [194, 194, 196],
  'minecraft:andesite': [136, 136, 138],
  'minecraft:polished_andesite': [132, 134, 133],
  'minecraft:cobblestone': [122, 122, 122],
  'minecraft:mossy_cobblestone': [105, 122, 98],
  'minecraft:stone_bricks': [122, 122, 122],
  'minecraft:mossy_stone_bricks': [115, 121, 105],
  'minecraft:cracked_stone_bricks': [118, 118, 118],
  'minecraft:chiseled_stone_bricks': [120, 120, 120],
  'minecraft:bedrock': [45, 45, 45],
  'minecraft:gravel': [131, 126, 126],

  // Deepslate & Tuff & Calcite
  'minecraft:deepslate': [75, 75, 78],
  'minecraft:cobbled_deepslate': [77, 77, 80],
  'minecraft:polished_deepslate': [72, 72, 73],
  'minecraft:deepslate_bricks': [70, 70, 71],
  'minecraft:cracked_deepslate_bricks': [66, 66, 67],
  'minecraft:deepslate_tiles': [54, 54, 55],
  'minecraft:cracked_deepslate_tiles': [50, 50, 51],
  'minecraft:chiseled_deepslate': [60, 60, 62],
  'minecraft:tuff': [108, 109, 102],
  'minecraft:polished_tuff': [105, 107, 100],
  'minecraft:tuff_bricks': [102, 103, 97],
  'minecraft:chiseled_tuff': [99, 100, 94],
  'minecraft:chiseled_tuff_bricks': [96, 98, 92],
  'minecraft:calcite': [224, 225, 221],
  'minecraft:dripstone_block': [133, 106, 95],
  'minecraft:pointed_dripstone': [133, 106, 95],

  // Blackstone & Basalt
  'minecraft:blackstone': [42, 38, 46],
  'minecraft:polished_blackstone': [53, 49, 58],
  'minecraft:polished_blackstone_bricks': [49, 45, 54],
  'minecraft:cracked_polished_blackstone_bricks': [44, 40, 48],
  'minecraft:chiseled_polished_blackstone': [46, 42, 50],
  'minecraft:gilded_blackstone': [58, 48, 45],
  'minecraft:basalt': [80, 81, 86],
  'minecraft:polished_basalt': [90, 90, 94],
  'minecraft:smooth_basalt': [73, 73, 79],

  // Quartz
  'minecraft:quartz_block': [235, 229, 222],
  'minecraft:smooth_quartz': [235, 230, 224],
  'minecraft:quartz_bricks': [234, 229, 221],
  'minecraft:quartz_pillar': [236, 231, 223],
  'minecraft:chiseled_quartz_block': [232, 226, 218],

  // Dirt, Sand, Mud & Natural
  'minecraft:grass_block': [92, 142, 50],
  'minecraft:dirt': [134, 96, 67],
  'minecraft:coarse_dirt': [119, 85, 59],
  'minecraft:podzol': [90, 63, 29],
  'minecraft:rooted_dirt': [145, 105, 75],
  'minecraft:mud': [60, 57, 60],
  'minecraft:packed_mud': [142, 104, 76],
  'minecraft:mud_bricks': [137, 103, 79],
  'minecraft:sand': [219, 211, 160],
  'minecraft:sandstone': [216, 203, 155],
  'minecraft:smooth_sandstone': [216, 203, 155],
  'minecraft:cut_sandstone': [216, 203, 155],
  'minecraft:red_sand': [190, 103, 33],
  'minecraft:red_sandstone': [181, 97, 31],
  'minecraft:clay': [160, 166, 179],

  // Wood Planks
  'minecraft:oak_planks': [162, 130, 78],
  'minecraft:spruce_planks': [104, 78, 48],
  'minecraft:birch_planks': [196, 178, 122],
  'minecraft:jungle_planks': [160, 115, 80],
  'minecraft:acacia_planks': [168, 90, 50],
  'minecraft:dark_oak_planks': [66, 43, 20],
  'minecraft:mangrove_planks': [118, 54, 49],
  'minecraft:cherry_planks': [226, 178, 174],
  'minecraft:bamboo_planks': [194, 172, 82],
  'minecraft:bamboo_mosaic': [194, 172, 82],
  'minecraft:crimson_planks': [101, 48, 70],
  'minecraft:warped_planks': [43, 104, 99],

  // Wood Logs & Stems
  'minecraft:oak_log': [107, 83, 50],
  'minecraft:spruce_log': [59, 41, 24],
  'minecraft:birch_log': [215, 215, 210],
  'minecraft:jungle_log': [86, 68, 27],
  'minecraft:acacia_log': [104, 98, 89],
  'minecraft:dark_oak_log': [60, 48, 26],
  'minecraft:mangrove_log': [103, 50, 40],
  'minecraft:cherry_log': [53, 38, 46],
  'minecraft:crimson_stem': [123, 58, 83],
  'minecraft:warped_stem': [58, 118, 114],

  // Stripped Logs
  'minecraft:stripped_oak_log': [178, 145, 87],
  'minecraft:stripped_spruce_log': [116, 89, 54],
  'minecraft:stripped_birch_log': [196, 175, 119],
  'minecraft:stripped_jungle_log': [171, 132, 84],
  'minecraft:stripped_acacia_log': [175, 93, 57],
  'minecraft:stripped_dark_oak_log': [90, 68, 41],
  'minecraft:stripped_mangrove_log': [124, 60, 52],
  'minecraft:stripped_cherry_log': [225, 160, 155],
  'minecraft:stripped_crimson_stem': [141, 56, 84],
  'minecraft:stripped_warped_stem': [55, 142, 137],

  // Leaves
  'minecraft:oak_leaves': [72, 120, 36],
  'minecraft:spruce_leaves': [55, 88, 55],
  'minecraft:birch_leaves': [100, 135, 60],
  'minecraft:jungle_leaves': [78, 136, 32],
  'minecraft:acacia_leaves': [92, 130, 42],
  'minecraft:dark_oak_leaves': [62, 105, 28],
  'minecraft:mangrove_leaves': [80, 122, 45],
  'minecraft:cherry_leaves': [235, 170, 190],
  'minecraft:azalea_leaves': [94, 129, 56],
  'minecraft:flowering_azalea_leaves': [135, 115, 95],

  // Copper Family
  'minecraft:copper_block': [192, 106, 80],
  'minecraft:exposed_copper': [161, 125, 103],
  'minecraft:weathered_copper': [109, 153, 124],
  'minecraft:oxidized_copper': [82, 162, 132],
  'minecraft:cut_copper': [190, 104, 78],
  'minecraft:exposed_cut_copper': [156, 120, 99],
  'minecraft:weathered_cut_copper': [104, 148, 120],
  'minecraft:oxidized_cut_copper': [79, 158, 129],

  // Prismarine & Ocean
  'minecraft:prismarine': [99, 156, 151],
  'minecraft:prismarine_bricks': [99, 171, 158],
  'minecraft:dark_prismarine': [51, 91, 75],
  'minecraft:sea_lantern': [172, 199, 191],

  // Nether & End
  'minecraft:netherrack': [104, 40, 40],
  'minecraft:nether_bricks': [44, 21, 26],
  'minecraft:red_nether_bricks': [72, 7, 11],
  'minecraft:soul_sand': [81, 62, 50],
  'minecraft:soul_soil': [75, 56, 45],
  'minecraft:glowstone': [170, 140, 80],
  'minecraft:shroomlight': [240, 146, 71],
  'minecraft:end_stone': [222, 227, 166],
  'minecraft:end_stone_bricks': [222, 227, 166],
  'minecraft:purpur_block': [169, 125, 169],
  'minecraft:purpur_pillar': [171, 129, 171],

  // Ores & Metals
  'minecraft:gold_ore': [145, 135, 105],
  'minecraft:iron_ore': [138, 126, 120],
  'minecraft:coal_ore': [110, 110, 110],
  'minecraft:copper_ore': [135, 128, 115],
  'minecraft:gold_block': [249, 215, 60],
  'minecraft:iron_block': [216, 216, 216],
  'minecraft:diamond_block': [93, 236, 245],
  'minecraft:emerald_block': [23, 221, 98],
  'minecraft:netherite_block': [66, 61, 63],
  'minecraft:lapis_block': [30, 67, 140],
  'minecraft:redstone_block': [170, 20, 10],

  // Concrete
  'minecraft:white_concrete': [207, 213, 214],
  'minecraft:orange_concrete': [224, 97, 0],
  'minecraft:magenta_concrete': [169, 48, 159],
  'minecraft:light_blue_concrete': [36, 137, 199],
  'minecraft:yellow_concrete': [241, 175, 21],
  'minecraft:lime_concrete': [94, 169, 25],
  'minecraft:pink_concrete': [214, 101, 143],
  'minecraft:gray_concrete': [54, 57, 61],
  'minecraft:light_gray_concrete': [125, 125, 115],
  'minecraft:cyan_concrete': [21, 119, 136],
  'minecraft:purple_concrete': [100, 32, 156],
  'minecraft:blue_concrete': [45, 47, 143],
  'minecraft:brown_concrete': [96, 60, 32],
  'minecraft:green_concrete': [73, 91, 36],
  'minecraft:red_concrete': [142, 33, 33],
  'minecraft:black_concrete': [8, 10, 15],

  // Terracotta
  'minecraft:terracotta': [152, 94, 67],
  'minecraft:white_terracotta': [209, 178, 161],
  'minecraft:orange_terracotta': [161, 83, 37],
  'minecraft:magenta_terracotta': [149, 88, 109],
  'minecraft:light_blue_terracotta': [113, 109, 138],
  'minecraft:yellow_terracotta': [186, 133, 35],
  'minecraft:lime_terracotta': [103, 117, 52],
  'minecraft:pink_terracotta': [161, 78, 78],
  'minecraft:gray_terracotta': [57, 42, 35],
  'minecraft:light_gray_terracotta': [135, 106, 97],
  'minecraft:cyan_terracotta': [87, 91, 91],
  'minecraft:purple_terracotta': [118, 70, 86],
  'minecraft:blue_terracotta': [74, 60, 91],
  'minecraft:brown_terracotta': [77, 51, 36],
  'minecraft:green_terracotta': [76, 83, 42],
  'minecraft:red_terracotta': [143, 61, 46],
  'minecraft:black_terracotta': [37, 23, 16],

  // Wool
  'minecraft:wool': [220, 220, 220],
  'minecraft:white_wool': [233, 236, 236],
  'minecraft:orange_wool': [240, 118, 19],
  'minecraft:magenta_wool': [189, 68, 179],
  'minecraft:light_blue_wool': [58, 175, 217],
  'minecraft:yellow_wool': [248, 198, 39],
  'minecraft:lime_wool': [112, 185, 25],
  'minecraft:pink_wool': [237, 141, 172],
  'minecraft:gray_wool': [62, 68, 71],
  'minecraft:light_gray_wool': [142, 142, 134],
  'minecraft:cyan_wool': [21, 137, 145],
  'minecraft:purple_wool': [121, 42, 172],
  'minecraft:blue_wool': [53, 57, 157],
  'minecraft:brown_wool': [114, 71, 40],
  'minecraft:green_wool': [84, 109, 27],
  'minecraft:red_wool': [161, 39, 34],
  'minecraft:black_wool': [20, 21, 25],

  // Utility & Manufactured
  'minecraft:glass': [200, 225, 235],
  'minecraft:bricks': [150, 97, 83],
  'minecraft:tnt': [219, 58, 44],
  'minecraft:bookshelf': [162, 130, 78],
  'minecraft:obsidian': [21, 19, 34],
  'minecraft:crying_obsidian': [33, 17, 56],
  'minecraft:lantern': [105, 110, 120],
  'minecraft:soul_lantern': [70, 115, 130],
  'minecraft:water': [63, 118, 228],
  'minecraft:lava': [207, 91, 18],
};

/**
 * Checks if a block identifier represents air or air-like non-solid space.
 */
export function isAirLikeBlockId(id: string | null | undefined): boolean {
  if (!id) return true;
  const norm = id.toLowerCase().trim();
  return (
    norm === 'minecraft:air' ||
    norm === 'minecraft:cave_air' ||
    norm === 'minecraft:void_air' ||
    norm === 'air' ||
    norm === 'cave_air' ||
    norm === 'void_air'
  );
}

/**
 * Deterministic RGB resolver for any Minecraft block ID.
 * Returns known RGB values for standard blocks, or computes a stable pseudo-random HSL color.
 */
export function getBlockRgb(blockId: string): [number, number, number] {
  const norm = (blockId || 'minecraft:stone').toLowerCase().trim();
  const stripped = norm.startsWith('minecraft:') ? norm : `minecraft:${norm}`;
  const baseName = stripped.split('[')[0]; // Strip block properties

  if (KNOWN_BLOCK_COLORS[baseName]) {
    return KNOWN_BLOCK_COLORS[baseName];
  }

  // Common substring heuristics
  if (baseName.includes('wood') || baseName.includes('plank')) return [162, 130, 78];
  if (baseName.includes('log') || baseName.includes('stem')) return [107, 83, 50];
  if (baseName.includes('leaf') || baseName.includes('leaves')) return [72, 120, 36];
  if (baseName.includes('stone') || baseName.includes('rock')) return [125, 125, 125];
  if (baseName.includes('ore')) return [138, 126, 120];
  if (baseName.includes('sand')) return [219, 211, 160];
  if (baseName.includes('glass')) return [200, 225, 235];
  if (baseName.includes('wool') || baseName.includes('carpet')) return [220, 220, 220];
  if (baseName.includes('concrete')) return [150, 150, 150];
  if (baseName.includes('terracotta')) return [152, 94, 67];
  if (baseName.includes('brick')) return [150, 97, 83];
  if (baseName.includes('iron')) return [216, 216, 216];
  if (baseName.includes('gold')) return [249, 215, 60];
  if (baseName.includes('diamond')) return [93, 236, 245];
  if (baseName.includes('emerald')) return [23, 221, 98];
  if (baseName.includes('redstone')) return [190, 25, 20];
  if (baseName.includes('copper')) return [192, 106, 80];
  if (baseName.includes('water')) return [63, 118, 228];
  if (baseName.includes('lava')) return [207, 91, 18];

  // Deterministic FNV-1a hash to HSL
  let hash = 2166136261;
  for (let i = 0; i < baseName.length; i++) {
    hash ^= baseName.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }

  const h = (Math.abs(hash) % 360) / 360;
  const s = 0.55;
  const l = 0.52;
  return hslToRgb(h, s, l);
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  let r: number, g: number, b: number;
  if (s === 0) {
    r = g = b = l;
  } else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hueToRgb(p, q, h + 1 / 3);
    g = hueToRgb(p, q, h);
    b = hueToRgb(p, q, h - 1 / 3);
  }
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

function hueToRgb(p: number, q: number, t: number): number {
  let val = t;
  if (val < 0) val += 1;
  if (val > 1) val -= 1;
  if (val < 1 / 6) return p + (q - p) * 6 * val;
  if (val < 1 / 2) return q;
  if (val < 2 / 3) return p + (q - p) * (2 / 3 - val) * 6;
  return p;
}

/**
 * Calculates clipboard dimensions { width, height, depth } from bounds or blocks.
 */
export function getClipboardDimensions(entry: ClipboardEntry): { width: number; height: number; depth: number } {
  if (entry?.data?.bounds) {
    const b = entry.data.bounds;
    const w = Math.max(0, b.maxExclusive[0] - b.min[0]);
    const h = Math.max(0, b.maxExclusive[1] - b.min[1]);
    const d = Math.max(0, b.maxExclusive[2] - b.min[2]);
    if (w > 0 && h > 0 && d > 0) {
      return { width: w, height: h, depth: d };
    }
  }

  const volume = (entry?.data as { volume?: ChunkedVoxelVolume } | undefined)?.volume;
  if (volume?.bounds) {
    const b = volume.bounds;
    const w = Math.max(0, b.maxExclusive[0] - b.min[0]);
    const h = Math.max(0, b.maxExclusive[1] - b.min[1]);
    const d = Math.max(0, b.maxExclusive[2] - b.min[2]);
    if (w > 0 || h > 0 || d > 0) {
      return { width: Math.max(1, w), height: Math.max(1, h), depth: Math.max(1, d) };
    }
  }

  if (entry?.data?.blocks && entry.data.blocks.length > 0) {
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    for (const b of entry.data.blocks) {
      if (!b?.localPos) continue;
      const [x, y, z] = b.localPos;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      if (z < minZ) minZ = z;
      if (z > maxZ) maxZ = z;
    }
    if (minX !== Infinity) {
      return {
        width: maxX - minX + 1,
        height: maxY - minY + 1,
        depth: maxZ - minZ + 1,
      };
    }
  }

  return { width: 0, height: 0, depth: 0 };
}

/**
 * Returns total non-air block count in a clipboard entry.
 */
export function getClipboardBlockCount(entry: ClipboardEntry): number {
  if (!entry?.data) return 0;

  const volume = (entry.data as { volume?: ChunkedVoxelVolume } | undefined)?.volume;
  if (typeof volume?.nonAirCount === 'number' && volume.nonAirCount > 0) {
    return volume.nonAirCount;
  }

  if (Array.isArray(entry.data.blocks)) {
    let count = 0;
    for (const b of entry.data.blocks) {
      const blockId = typeof b.state === 'string' ? b.state : (b.state?.id ?? 'minecraft:stone');
      if (!isAirLikeBlockId(blockId)) {
        count++;
      }
    }
    return count;
  }

  return 0;
}

/**
 * Extracts non-air block positions from volume or blocks list.
 * Applies isometric interior culling (filtering out blocks whose +X, +Y, and +Z neighbors are all occupied)
 * and strides if necessary to stay under maxSamples.
 */
export function extractSampledBlocks(entry: ClipboardEntry, maxSamples = 12000): SampledBlock[] {
  const sampled: SampledBlock[] = [];
  if (!entry?.data) return sampled;

  const rawBlocks: SampledBlock[] = [];
  const occupied = new Set<string>();

  // 1. Check sparse ChunkedVoxelVolume
  const volume = (entry.data as { volume?: ChunkedVoxelVolume } | undefined)?.volume;
  if (volume?.chunks && volume.chunks instanceof Map && volume.chunks.size > 0) {
    for (const [key, chunk] of volume.chunks.entries()) {
      if (!chunk?.palette || chunk.palette.length <= 1) continue;
      const parts = key.split('_').map(Number);
      const cx = isNaN(parts[0]) ? 0 : parts[0];
      const cy = isNaN(parts[1]) ? 0 : parts[1];
      const cz = isNaN(parts[2]) ? 0 : parts[2];
      const originX = cx * 16;
      const originY = cy * 16;
      const originZ = cz * 16;

      const len = chunk.indices.length;
      for (let idx = 0; idx < len; idx++) {
        const palIdx = chunk.indices[idx];
        if (palIdx === 0) continue;

        const state = chunk.palette[palIdx];
        const blockId = typeof state === 'string' ? state : (state?.id ?? 'minecraft:stone');
        if (isAirLikeBlockId(blockId)) continue;

        const cxIdx = idx % 16;
        const czIdx = Math.floor(idx / 16) % 16;
        const cyIdx = Math.floor(idx / 256);

        const x = originX + cxIdx;
        const y = originY + cyIdx;
        const z = originZ + czIdx;

        rawBlocks.push({ x, y, z, blockId });
        occupied.add(`${x},${y},${z}`);
        if (rawBlocks.length >= 100000) break;
      }
      if (rawBlocks.length >= 100000) break;
    }
  }

  // 2. Check ClipboardBlockData array fallback
  if (rawBlocks.length === 0 && Array.isArray(entry.data.blocks) && entry.data.blocks.length > 0) {
    for (let i = 0; i < entry.data.blocks.length; i++) {
      const b = entry.data.blocks[i];
      if (!b?.localPos) continue;
      const blockId = typeof b.state === 'string' ? b.state : (b.state?.id ?? 'minecraft:stone');
      if (isAirLikeBlockId(blockId)) continue;
      const x = b.localPos[0];
      const y = b.localPos[1];
      const z = b.localPos[2];
      rawBlocks.push({ x, y, z, blockId });
      occupied.add(`${x},${y},${z}`);
      if (rawBlocks.length >= 100000) break;
    }
  }

  if (rawBlocks.length === 0) {
    return sampled;
  }

  // Filter out interior blocks that are 100% occluded in isometric view
  // In isometric projection viewing from +X, +Y, +Z, a block at (x, y, z) is occluded
  // if all three adjacent neighbors in the camera direction:
  // (x+1, y, z), (x, y+1, z), and (x, y, z+1) are occupied.
  const visibleBlocks: SampledBlock[] = [];
  for (const b of rawBlocks) {
    const hasTop = occupied.has(`${b.x},${b.y + 1},${b.z}`);
    const hasRight = occupied.has(`${b.x + 1},${b.y},${b.z}`);
    const hasLeft = occupied.has(`${b.x},${b.y},${b.z + 1}`);

    if (hasTop && hasRight && hasLeft) {
      // Completely occluded interior block
      continue;
    }

    b.topExposed = !hasTop;
    b.rightExposed = !hasRight;
    b.leftExposed = !hasLeft;
    visibleBlocks.push(b);
  }

  // If visible block count is within maxSamples, return all visible blocks
  if (visibleBlocks.length <= maxSamples) {
    return visibleBlocks;
  }

  // Stride evenly across visible blocks to meet maxSamples limit
  const stride = Math.ceil(visibleBlocks.length / maxSamples);
  for (let i = 0; i < visibleBlocks.length; i += stride) {
    sampled.push(visibleBlocks[i]!);
    if (sampled.length >= maxSamples) break;
  }

  return sampled;
}

/**
 * Renders an offscreen isometric 2D canvas preview for the given ClipboardEntry.
 * Returns a PNG data URL, or null in non-browser/test environments.
 */
export function renderClipboardPreviewDataUrl(
  entry: ClipboardEntry,
  size = 160,
): string | null {
  // Gracefully handle non-browser / Node.js test environment
  if (typeof document === 'undefined') {
    return null;
  }

  try {
    const sampled = extractSampledBlocks(entry, 12000);
    if (sampled.length === 0) {
      return null;
    }

    const renderSize = Math.max(size, 144);
    const canvas = document.createElement('canvas');
    canvas.width = renderSize;
    canvas.height = renderSize;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.imageSmoothingEnabled = false;

    // Find min coordinates
    let minX = Infinity;
    let minY = Infinity;
    let minZ = Infinity;
    for (const b of sampled) {
      if (b.x < minX) minX = b.x;
      if (b.y < minY) minY = b.y;
      if (b.z < minZ) minZ = b.z;
    }

    // Sort in isometric painter order:
    // 1. y ascending (lower layers drawn first, higher layers stack on top)
    // 2. (x+z) ascending (farthest back drawn first, closer drawn in front)
    // 3. x ascending (consistent tie-break)
    sampled.sort((a, b) => {
      if (a.y !== b.y) return a.y - b.y;
      const sumA = (a.x - minX) + (a.z - minZ);
      const sumB = (b.x - minX) + (b.z - minZ);
      if (sumA !== sumB) return sumA - sumB;
      return (a.x - minX) - (b.x - minX);
    });

    // Compute bounding box in unit coords
    let minUnitX = Infinity;
    let maxUnitX = -Infinity;
    let minUnitY = Infinity;
    let maxUnitY = -Infinity;

    for (const b of sampled) {
      const rx = b.x - minX;
      const ry = b.y - minY;
      const rz = b.z - minZ;
      const baseX = rx - rz;
      const baseY = (rx + rz) * 0.5 - ry;

      if (baseX - 1 < minUnitX) minUnitX = baseX - 1;
      if (baseX + 1 > maxUnitX) maxUnitX = baseX + 1;
      if (baseY - 0.5 < minUnitY) minUnitY = baseY - 0.5;
      if (baseY + 1.5 > maxUnitY) maxUnitY = baseY + 1.5;
    }

    const rangeX = Math.max(1, maxUnitX - minUnitX);
    const rangeY = Math.max(1, maxUnitY - minUnitY);

    const padding = Math.max(4, Math.round(renderSize * 0.04));
    const availW = Math.max(8, renderSize - 2 * padding);
    const availH = Math.max(8, renderSize - 2 * padding);
    const scale = Math.min(availW / rangeX, availH / rangeY);

    const offsetX = padding + (availW - rangeX * scale) / 2 - minUnitX * scale;
    const offsetY = padding + (availH - rangeY * scale) / 2 - minUnitY * scale;

    ctx.clearRect(0, 0, renderSize, renderSize);

    // Draw each block's top, left, and right faces
    for (const b of sampled) {
      const rx = b.x - minX;
      const ry = b.y - minY;
      const rz = b.z - minZ;
      const baseX = rx - rz;
      const baseY = (rx + rz) * 0.5 - ry;

      const cx = baseX * scale + offsetX;
      const cy = baseY * scale + offsetY;
      const s = scale;

      const [origR, origG, origB] = getBlockRgb(b.blockId);

      // Deterministic hash jitter (±6%) per voxel coordinate
      let h = (b.x * 73856093) ^ (b.y * 19349663) ^ (b.z * 83492791);
      h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
      h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
      h = (h ^ (h >>> 16)) >>> 0;
      const jitter = ((h % 1000) / 1000) * 0.12 - 0.06;

      const r = Math.max(0, Math.min(255, Math.round(origR * (1 + jitter))));
      const g = Math.max(0, Math.min(255, Math.round(origG * (1 + jitter))));
      const bCol = Math.max(0, Math.min(255, Math.round(origB * (1 + jitter))));

      const topColor = `rgb(${r}, ${g}, ${bCol})`;
      const leftColor = `rgb(${Math.round(r * 0.80)}, ${Math.round(g * 0.80)}, ${Math.round(bCol * 0.80)})`;
      const rightColor = `rgb(${Math.round(r * 0.62)}, ${Math.round(g * 0.62)}, ${Math.round(bCol * 0.62)})`;

      const drawTop = b.topExposed !== false;
      const drawLeft = b.leftExposed !== false;
      const drawRight = b.rightExposed !== false;

      // 1. Top Face: (cx, cy - 0.5s), (cx + s, cy), (cx, cy + 0.5s), (cx - s, cy)
      if (drawTop) {
        ctx.fillStyle = topColor;
        ctx.strokeStyle = topColor;
        ctx.lineWidth = 0.6;
        ctx.beginPath();
        ctx.moveTo(cx, cy - 0.5 * s);
        ctx.lineTo(cx + s, cy);
        ctx.lineTo(cx, cy + 0.5 * s);
        ctx.lineTo(cx - s, cy);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        if (s >= 3) {
          // Top bevel highlight on top-left edge
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
          ctx.lineWidth = Math.min(1.2, s * 0.12);
          ctx.beginPath();
          ctx.moveTo(cx, cy - 0.5 * s);
          ctx.lineTo(cx - s, cy);
          ctx.stroke();

          // Tree rings for log top
          if (b.blockId.includes('log') || b.blockId.includes('wood') || b.blockId.includes('stem')) {
            ctx.strokeStyle = 'rgba(0, 0, 0, 0.22)';
            ctx.lineWidth = 0.6;
            ctx.beginPath();
            ctx.moveTo(cx, cy - 0.25 * s);
            ctx.lineTo(cx + 0.5 * s, cy);
            ctx.lineTo(cx, cy + 0.25 * s);
            ctx.lineTo(cx - 0.5 * s, cy);
            ctx.closePath();
            ctx.stroke();
          }
        }
      }

      // 2. Left Face: (cx - s, cy), (cx, cy + 0.5s), (cx, cy + 1.5s), (cx - s, cy + s)
      if (drawLeft) {
        ctx.fillStyle = leftColor;
        ctx.strokeStyle = leftColor;
        ctx.lineWidth = 0.6;
        ctx.beginPath();
        ctx.moveTo(cx - s, cy);
        ctx.lineTo(cx, cy + 0.5 * s);
        ctx.lineTo(cx, cy + 1.5 * s);
        ctx.lineTo(cx - s, cy + s);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        if (s >= 3) {
          if (b.blockId.includes('brick') || b.blockId.includes('tile')) {
            // Mortar line
            ctx.strokeStyle = 'rgba(0, 0, 0, 0.22)';
            ctx.lineWidth = 0.6;
            ctx.beginPath();
            ctx.moveTo(cx - s, cy + 0.5 * s);
            ctx.lineTo(cx, cy + s);
            ctx.stroke();
          } else if (b.blockId.includes('plank')) {
            // Horizontal plank seam
            ctx.strokeStyle = 'rgba(0, 0, 0, 0.18)';
            ctx.lineWidth = 0.5;
            ctx.beginPath();
            ctx.moveTo(cx - s, cy + 0.5 * s);
            ctx.lineTo(cx, cy + s);
            ctx.stroke();
          } else if (b.blockId.includes('log') || b.blockId.includes('pillar') || b.blockId.includes('stem')) {
            // Vertical fluting
            ctx.strokeStyle = 'rgba(0, 0, 0, 0.2)';
            ctx.lineWidth = 0.6;
            ctx.beginPath();
            ctx.moveTo(cx - 0.5 * s, cy + 0.25 * s);
            ctx.lineTo(cx - 0.5 * s, cy + 1.25 * s);
            ctx.stroke();
          }
        }
      }

      // 3. Right Face: (cx, cy + 0.5s), (cx + s, cy), (cx + s, cy + s), (cx, cy + 1.5s)
      if (drawRight) {
        ctx.fillStyle = rightColor;
        ctx.strokeStyle = rightColor;
        ctx.lineWidth = 0.6;
        ctx.beginPath();
        ctx.moveTo(cx, cy + 0.5 * s);
        ctx.lineTo(cx + s, cy);
        ctx.lineTo(cx + s, cy + s);
        ctx.lineTo(cx, cy + 1.5 * s);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        if (s >= 3) {
          if (b.blockId.includes('brick') || b.blockId.includes('tile')) {
            // Mortar line
            ctx.strokeStyle = 'rgba(0, 0, 0, 0.25)';
            ctx.lineWidth = 0.6;
            ctx.beginPath();
            ctx.moveTo(cx, cy + s);
            ctx.lineTo(cx + s, cy + 0.5 * s);
            ctx.stroke();
          } else if (b.blockId.includes('plank')) {
            // Horizontal plank seam
            ctx.strokeStyle = 'rgba(0, 0, 0, 0.2)';
            ctx.lineWidth = 0.5;
            ctx.beginPath();
            ctx.moveTo(cx, cy + s);
            ctx.lineTo(cx + s, cy + 0.5 * s);
            ctx.stroke();
          } else if (b.blockId.includes('log') || b.blockId.includes('pillar') || b.blockId.includes('stem')) {
            // Vertical fluting
            ctx.strokeStyle = 'rgba(0, 0, 0, 0.22)';
            ctx.lineWidth = 0.6;
            ctx.beginPath();
            ctx.moveTo(cx + 0.5 * s, cy + 0.25 * s);
            ctx.lineTo(cx + 0.5 * s, cy + 1.25 * s);
            ctx.stroke();
          }
        }
      }
    }

    return canvas.toDataURL('image/png');
  } catch (_err) {
    return null;
  }
}
