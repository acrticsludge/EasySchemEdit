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
}

/**
 * Common vanilla Minecraft block color mapping.
 * Used for deterministic, recognizable isometric thumbnails.
 */
export const KNOWN_BLOCK_COLORS: Record<string, [number, number, number]> = {
  'minecraft:stone': [125, 125, 125],
  'minecraft:granite': [150, 103, 84],
  'minecraft:polished_granite': [154, 106, 89],
  'minecraft:diorite': [185, 185, 187],
  'minecraft:polished_diorite': [194, 194, 196],
  'minecraft:andesite': [136, 136, 138],
  'minecraft:polished_andesite': [132, 134, 133],
  'minecraft:grass_block': [92, 142, 50],
  'minecraft:dirt': [134, 96, 67],
  'minecraft:coarse_dirt': [119, 85, 59],
  'minecraft:podzol': [90, 63, 29],
  'minecraft:cobblestone': [122, 122, 122],
  'minecraft:mossy_cobblestone': [105, 122, 98],
  'minecraft:oak_planks': [162, 130, 78],
  'minecraft:spruce_planks': [104, 78, 48],
  'minecraft:birch_planks': [196, 178, 122],
  'minecraft:jungle_planks': [160, 115, 80],
  'minecraft:acacia_planks': [168, 90, 50],
  'minecraft:dark_oak_planks': [66, 43, 20],
  'minecraft:mangrove_planks': [118, 54, 49],
  'minecraft:cherry_planks': [226, 178, 174],
  'minecraft:bamboo_planks': [194, 172, 82],
  'minecraft:oak_log': [107, 83, 50],
  'minecraft:spruce_log': [59, 41, 24],
  'minecraft:birch_log': [215, 215, 210],
  'minecraft:oak_leaves': [72, 120, 36],
  'minecraft:spruce_leaves': [55, 88, 55],
  'minecraft:birch_leaves': [100, 135, 60],
  'minecraft:bedrock': [45, 45, 45],
  'minecraft:sand': [219, 211, 160],
  'minecraft:red_sand': [190, 103, 33],
  'minecraft:gravel': [131, 126, 126],
  'minecraft:gold_ore': [145, 135, 105],
  'minecraft:iron_ore': [138, 126, 120],
  'minecraft:coal_ore': [110, 110, 110],
  'minecraft:glass': [200, 225, 235],
  'minecraft:sandstone': [216, 203, 155],
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
  'minecraft:gold_block': [249, 215, 60],
  'minecraft:iron_block': [216, 216, 216],
  'minecraft:bricks': [150, 97, 83],
  'minecraft:tnt': [219, 58, 44],
  'minecraft:bookshelf': [162, 130, 78],
  'minecraft:obsidian': [21, 19, 34],
  'minecraft:diamond_block': [93, 236, 245],
  'minecraft:netherrack': [104, 40, 40],
  'minecraft:glowstone': [170, 140, 80],
  'minecraft:stone_bricks': [122, 122, 122],
  'minecraft:deepslate': [75, 75, 78],
  'minecraft:copper_block': [192, 106, 80],
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
 * Extracts non-air block positions from volume or blocks list, striding if large to stay <15ms.
 */
export function extractSampledBlocks(entry: ClipboardEntry, maxSamples = 1800): SampledBlock[] {
  const sampled: SampledBlock[] = [];
  if (!entry?.data) return sampled;

  // 1. Check sparse ChunkedVoxelVolume
  const volume = (entry.data as { volume?: ChunkedVoxelVolume } | undefined)?.volume;
  if (volume?.chunks && volume.chunks instanceof Map && volume.chunks.size > 0) {
    const totalNonAir = volume.nonAirCount || (volume.chunks.size * 50);
    const stride = Math.max(1, Math.ceil(totalNonAir / maxSamples));
    let stepCount = 0;

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
        stepCount++;
        if (stepCount % stride !== 0) continue;

        const state = chunk.palette[palIdx];
        const blockId = typeof state === 'string' ? state : (state?.id ?? 'minecraft:stone');
        if (isAirLikeBlockId(blockId)) continue;

        const cxIdx = idx % 16;
        const czIdx = Math.floor(idx / 16) % 16;
        const cyIdx = Math.floor(idx / 256);

        sampled.push({
          x: originX + cxIdx,
          y: originY + cyIdx,
          z: originZ + czIdx,
          blockId,
        });
        if (sampled.length >= maxSamples) break;
      }
      if (sampled.length >= maxSamples) break;
    }
  }

  // 2. Check ClipboardBlockData array fallback
  if (sampled.length === 0 && Array.isArray(entry.data.blocks) && entry.data.blocks.length > 0) {
    const blocks = entry.data.blocks;
    const stride = Math.max(1, Math.ceil(blocks.length / maxSamples));
    for (let i = 0; i < blocks.length; i += stride) {
      const b = blocks[i];
      if (!b?.localPos) continue;
      const blockId = typeof b.state === 'string' ? b.state : (b.state?.id ?? 'minecraft:stone');
      if (isAirLikeBlockId(blockId)) continue;
      sampled.push({
        x: b.localPos[0],
        y: b.localPos[1],
        z: b.localPos[2],
        blockId,
      });
      if (sampled.length >= maxSamples) break;
    }
  }

  return sampled;
}

/**
 * Renders an offscreen isometric 2D canvas preview for the given ClipboardEntry.
 * Returns a PNG data URL, or null in non-browser/test environments.
 */
export function renderClipboardPreviewDataUrl(
  entry: ClipboardEntry,
  size = 64,
): string | null {
  // Gracefully handle non-browser / Node.js test environment
  if (typeof document === 'undefined') {
    return null;
  }

  try {
    const sampled = extractSampledBlocks(entry, 1800);
    if (sampled.length === 0) {
      return null;
    }

    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

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

    const padding = 4;
    const availW = Math.max(8, size - 2 * padding);
    const availH = Math.max(8, size - 2 * padding);
    const scale = Math.min(availW / rangeX, availH / rangeY);

    const offsetX = padding + (availW - rangeX * scale) / 2 - minUnitX * scale;
    const offsetY = padding + (availH - rangeY * scale) / 2 - minUnitY * scale;

    ctx.clearRect(0, 0, size, size);

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

      const [r, g, bCol] = getBlockRgb(b.blockId);
      const topColor = `rgb(${r}, ${g}, ${bCol})`;
      const leftColor = `rgb(${Math.round(r * 0.78)}, ${Math.round(g * 0.78)}, ${Math.round(bCol * 0.78)})`;
      const rightColor = `rgb(${Math.round(r * 0.58)}, ${Math.round(g * 0.58)}, ${Math.round(bCol * 0.58)})`;

      // 1. Top Face: (cx, cy - 0.5s), (cx + s, cy), (cx, cy + 0.5s), (cx - s, cy)
      ctx.fillStyle = topColor;
      ctx.beginPath();
      ctx.moveTo(cx, cy - 0.5 * s);
      ctx.lineTo(cx + s, cy);
      ctx.lineTo(cx, cy + 0.5 * s);
      ctx.lineTo(cx - s, cy);
      ctx.closePath();
      ctx.fill();

      // 2. Left Face: (cx - s, cy), (cx, cy + 0.5s), (cx, cy + 1.5s), (cx - s, cy + s)
      ctx.fillStyle = leftColor;
      ctx.beginPath();
      ctx.moveTo(cx - s, cy);
      ctx.lineTo(cx, cy + 0.5 * s);
      ctx.lineTo(cx, cy + 1.5 * s);
      ctx.lineTo(cx - s, cy + s);
      ctx.closePath();
      ctx.fill();

      // 3. Right Face: (cx, cy + 0.5s), (cx + s, cy), (cx + s, cy + s), (cx, cy + 1.5s)
      ctx.fillStyle = rightColor;
      ctx.beginPath();
      ctx.moveTo(cx, cy + 0.5 * s);
      ctx.lineTo(cx + s, cy);
      ctx.lineTo(cx + s, cy + s);
      ctx.lineTo(cx, cy + 1.5 * s);
      ctx.closePath();
      ctx.fill();
    }

    return canvas.toDataURL('image/png');
  } catch (_err) {
    return null;
  }
}
