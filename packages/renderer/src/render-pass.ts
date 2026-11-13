// packages/renderer/src/render-pass.ts
// Pure TypeScript render-pass classification (SUBSPEC-E §2.2, §3.4, §4.13).
// Maps block states and alpha metadata to one of four GPU mesh passes:
//   - 'opaque': solid geometry with depth prepass
//   - 'cutout': alpha-test geometry (1-bit transparency)
//   - 'translucent': back-to-front sorted alpha blending
//   - 'emissive': self-illuminating additive geometry (no depth write)
// Zero Three.js / DOM imports.

import type { MeshPass } from './chunk-mesh.ts';

/**
 * Known blocks classified into the translucent pass in Minecraft Java Edition.
 * Translucent blocks require blended alpha rendering and back-to-front sorting.
 */
export const TRANSLUCENT_BLOCKS: ReadonlySet<string> = new Set([
  'water',
  'flowing_water',
  'bubble_column',
  'ice',
  'frosted_ice',
  'slime_block',
  'honey_block',
  'nether_portal',
  'tinted_glass',
  'stained_glass',
  'white_stained_glass',
  'orange_stained_glass',
  'magenta_stained_glass',
  'light_blue_stained_glass',
  'yellow_stained_glass',
  'lime_stained_glass',
  'pink_stained_glass',
  'gray_stained_glass',
  'light_gray_stained_glass',
  'cyan_stained_glass',
  'purple_stained_glass',
  'blue_stained_glass',
  'brown_stained_glass',
  'green_stained_glass',
  'red_stained_glass',
  'black_stained_glass',
  'stained_glass_pane',
  'white_stained_glass_pane',
  'orange_stained_glass_pane',
  'magenta_stained_glass_pane',
  'light_blue_stained_glass_pane',
  'yellow_stained_glass_pane',
  'lime_stained_glass_pane',
  'pink_stained_glass_pane',
  'gray_stained_glass_pane',
  'light_gray_stained_glass_pane',
  'cyan_stained_glass_pane',
  'purple_stained_glass_pane',
  'blue_stained_glass_pane',
  'brown_stained_glass_pane',
  'green_stained_glass_pane',
  'red_stained_glass_pane',
  'black_stained_glass_pane',
]);

/**
 * Known blocks classified into the cutout pass in Minecraft Java Edition.
 * Cutout blocks use binary alpha testing (pixels are either fully opaque or discarded).
 */
export const CUTOUT_BLOCKS: ReadonlySet<string> = new Set([
  'glass',
  'glass_pane',
  // Leaves
  'oak_leaves',
  'spruce_leaves',
  'birch_leaves',
  'jungle_leaves',
  'acacia_leaves',
  'dark_oak_leaves',
  'mangrove_leaves',
  'cherry_leaves',
  'azalea_leaves',
  'flowering_azalea_leaves',
  // Flowers & vegetation
  'short_grass',
  'tall_grass',
  'fern',
  'large_fern',
  'dandelion',
  'poppy',
  'blue_orchid',
  'allium',
  'azure_bluet',
  'red_tulip',
  'orange_tulip',
  'white_tulip',
  'pink_tulip',
  'oxeye_daisy',
  'cornflower',
  'lily_of_the_valley',
  'wither_rose',
  'sunflower',
  'lilac',
  'rose_bush',
  'peony',
  'torchflower',
  'pitcher_plant',
  'dead_bush',
  'sugar_cane',
  'bamboo',
  'bamboo_sapling',
  'sweet_berry_bush',
  'cave_vines',
  'cave_vines_plant',
  'twisting_vines',
  'twisting_vines_plant',
  'weeping_vines',
  'weeping_vines_plant',
  'vine',
  'kelp',
  'kelp_plant',
  'seagrass',
  'tall_seagrass',
  'lily_pad',
  // Saplings
  'oak_sapling',
  'spruce_sapling',
  'birch_sapling',
  'jungle_sapling',
  'acacia_sapling',
  'dark_oak_sapling',
  'cherry_sapling',
  'mangrove_propagule',
  // Mushrooms & nether vegetation
  'red_mushroom',
  'brown_mushroom',
  'crimson_fungus',
  'warped_fungus',
  'crimson_roots',
  'warped_roots',
  'nether_sprouts',
  // Rails
  'rail',
  'powered_rail',
  'detector_rail',
  'activator_rail',
  // Structural cutout
  'iron_bars',
  'chain',
  'cobweb',
  'ladder',
  'scaffolding',
  'tripwire',
  'tripwire_hook',
  'redstone_wire',
  'repeater',
  'comparator',
  'lever',
  'stone_button',
  'oak_button',
  // Doors & trapdoors
  'iron_door',
  'iron_trapdoor',
  'oak_door',
  'oak_trapdoor',
  'spruce_door',
  'spruce_trapdoor',
  'birch_door',
  'birch_trapdoor',
  'jungle_door',
  'jungle_trapdoor',
  'acacia_door',
  'acacia_trapdoor',
  'dark_oak_door',
  'dark_oak_trapdoor',
  'mangrove_door',
  'mangrove_trapdoor',
  'cherry_door',
  'cherry_trapdoor',
  'bamboo_door',
  'bamboo_trapdoor',
  'copper_door',
  'copper_trapdoor',
]);

/**
 * Light-emitting blocks rendered in the emissive pass (SUBSPEC-E §4.13).
 * Note: Logged as UNVERIFIED in docs/agent/DOUBTS.md (D-10) since SUBSPEC-E
 * describes the emissive pass behavior but does not exhaustively list block IDs.
 */
export const EMISSIVE_BLOCKS: ReadonlySet<string> = new Set([
  'glowstone',
  'sea_lantern',
  'shroomlight',
  'lava',
  'flowing_lava',
  'magma_block',
  'ochre_froglight',
  'pearlescent_froglight',
  'verdant_froglight',
  'jack_o_lantern',
  'crying_obsidian',
  'respawn_anchor',
  'beacon',
  'end_rod',
  'fire',
  'soul_fire',
  'campfire',
  'soul_campfire',
  'torch',
  'wall_torch',
  'soul_torch',
  'soul_wall_torch',
  'redstone_torch',
  'redstone_wall_torch',
  'lantern',
  'soul_lantern',
  'lit_redstone_lamp',
]);

/**
 * Options for fine-grained pass classification.
 */
export interface ClassifyPassOptions {
  properties?: Record<string, string>;
  isEmissive?: boolean;
  isTranslucent?: boolean;
  forcePass?: MeshPass;
}

/**
 * Parse a block state string into base name and property dictionary.
 * e.g. "minecraft:redstone_lamp[lit=true]" -> { name: "redstone_lamp", properties: { lit: "true" } }
 */
function parseBlockStateString(blockState: string): { name: string; properties: Record<string, string> } {
  let s = blockState.trim();
  if (s.startsWith('minecraft:')) {
    s = s.slice(10);
  }

  const bracketIndex = s.indexOf('[');
  if (bracketIndex === -1) {
    return { name: s, properties: {} };
  }

  const name = s.slice(0, bracketIndex);
  const closingIndex = s.lastIndexOf(']');
  const propStr = closingIndex !== -1 ? s.slice(bracketIndex + 1, closingIndex) : s.slice(bracketIndex + 1);
  const properties: Record<string, string> = {};

  for (const pair of propStr.split(',')) {
    const eq = pair.indexOf('=');
    if (eq !== -1) {
      const k = pair.slice(0, eq).trim();
      const v = pair.slice(eq + 1).trim();
      if (k) properties[k] = v;
    }
  }

  return { name, properties };
}

/**
 * Check if a block name matches translucent classification rules.
 */
export function isTranslucentBlock(blockName: string): boolean {
  const { name } = parseBlockStateString(blockName);
  if (TRANSLUCENT_BLOCKS.has(name)) {
    return true;
  }
  return name.endsWith('_stained_glass') || name.endsWith('_stained_glass_pane');
}

/**
 * Check if a block name matches cutout classification rules.
 */
export function isCutoutBlock(blockName: string): boolean {
  const { name } = parseBlockStateString(blockName);
  if (CUTOUT_BLOCKS.has(name)) {
    return true;
  }
  return (
    name.endsWith('_leaves') ||
    name.endsWith('_sapling') ||
    name.endsWith('_door') ||
    name.endsWith('_trapdoor') ||
    name.endsWith('_tulip') ||
    (name.endsWith('_pane') && !name.includes('stained'))
  );
}

/**
 * Check if a block name and properties match emissive classification rules.
 */
export function isEmissiveBlock(
  blockName: string,
  properties?: Record<string, string>
): boolean {
  const parsed = parseBlockStateString(blockName);
  const name = parsed.name;
  const mergedProps = { ...parsed.properties, ...properties };

  // Explicit emissive blocks
  if (EMISSIVE_BLOCKS.has(name)) {
    return true;
  }

  // Froglights
  if (name.endsWith('_froglight')) {
    return true;
  }

  // Lit redstone lamp
  if (name === 'redstone_lamp' && mergedProps.lit === 'true') {
    return true;
  }

  return false;
}

/**
 * Classify a block state into its appropriate MeshPass.
 *
 * Rules (SUBSPEC-E):
 * 1. If opts.forcePass is provided, uses that pass.
 * 2. Emissive pass: self-illuminating / light-emitting blocks or when opts.isEmissive is true.
 * 3. Translucent pass: partial alpha texture or known translucent block (water, stained glass, ice, slime, etc.).
 * 4. Cutout pass: binary alpha texture or known cutout block (leaves, glass, flowers, rails, etc.).
 * 5. Opaque pass: all other solid geometry.
 */
export function classifyPass(
  blockName: string,
  textureHasAlpha: 'none' | 'binary' | 'partial' = 'none',
  opts?: ClassifyPassOptions
): MeshPass {
  if (opts?.forcePass) {
    return opts.forcePass;
  }

  const parsed = parseBlockStateString(blockName);
  const name = parsed.name;
  const mergedProps = { ...parsed.properties, ...opts?.properties };

  // 1. Emissive pass check
  if (opts?.isEmissive === true || isEmissiveBlock(name, mergedProps)) {
    return 'emissive';
  }

  // 2. Translucent pass check
  if (opts?.isTranslucent === true || textureHasAlpha === 'partial' || isTranslucentBlock(name)) {
    return 'translucent';
  }

  // 3. Cutout pass check
  if (textureHasAlpha === 'binary' || isCutoutBlock(name)) {
    return 'cutout';
  }

  // 4. Default to opaque
  return 'opaque';
}
