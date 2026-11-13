// packages/renderer/src/tints.ts
// Pure TypeScript biome and hardcoded tint color resolver (SUBSPEC-E §2.1, §2.2).
// Maps block names and model `tintindex` to normalized RGB [r, g, b] in range [0, 1].
//
// Primary Sources:
// - Grass colors: https://minecraft.wiki/w/Color#Grass_colors (Plains default: 0x91BD59)
// - Foliage colors: https://minecraft.wiki/w/Color#Foliage_colors (Plains default: 0x77AB2F)
// - Birch leaves: https://minecraft.wiki/w/Birch_Leaves (Hardcoded 0x80A755)
// - Spruce leaves: https://minecraft.wiki/w/Spruce_Leaves (Hardcoded 0x619961)
// - Water: https://minecraft.wiki/w/Water#Color (Plains default: 0x3F76E4)
// - Lily Pad: https://minecraft.wiki/w/Lily_Pad (Hardcoded 0x208030)
//
// Zero Three.js / DOM imports.

/**
 * Convert a 24-bit RGB integer (e.g. 0x91BD59) to normalized [r, g, b] in range [0, 1].
 */
export function hexToRgb(hex: number): [number, number, number] {
  const r = ((hex >> 16) & 0xff) / 255;
  const g = ((hex >> 8) & 0xff) / 255;
  const b = (hex & 0xff) / 255;
  return [r, g, b];
}

/**
 * Default grass tint in Plains biome: #91BD59
 * Source: https://minecraft.wiki/w/Color#Grass_colors
 */
export const DEFAULT_PLAINS_GRASS_TINT: [number, number, number] = hexToRgb(0x91bd59);

/**
 * Default foliage tint in Plains biome: #77AB2F
 * Source: https://minecraft.wiki/w/Color#Foliage_colors
 */
export const DEFAULT_PLAINS_FOLIAGE_TINT: [number, number, number] = hexToRgb(0x77ab2f);

/**
 * Hardcoded birch leaves tint in Java Edition: #80A755
 * Source: https://minecraft.wiki/w/Birch_Leaves
 */
export const BIRCH_LEAVES_TINT: [number, number, number] = hexToRgb(0x80a755);

/**
 * Hardcoded spruce leaves tint in Java Edition: #619961
 * Source: https://minecraft.wiki/w/Spruce_Leaves
 */
export const SPRUCE_LEAVES_TINT: [number, number, number] = hexToRgb(0x619961);

/**
 * Default water tint in Plains biome: #3F76E4
 * Source: https://minecraft.wiki/w/Water#Color
 */
export const WATER_TINT: [number, number, number] = hexToRgb(0x3f76e4);

/**
 * Hardcoded lily pad tint in Java Edition: #208030
 * Source: https://minecraft.wiki/w/Lily_Pad
 */
export const LILY_PAD_TINT: [number, number, number] = hexToRgb(0x208030);

/**
 * Blocks that use grass biome colormap tinting for face tintindex 0.
 */
export const GRASS_TINTED_BLOCKS: ReadonlySet<string> = new Set([
  'grass_block',
  'short_grass',
  'grass', // legacy alias for short_grass
  'tall_grass',
  'fern',
  'large_fern',
  'sugar_cane',
  'potted_fern',
]);

/**
 * Blocks that use foliage biome colormap tinting for face tintindex 0.
 * Note: birch and spruce leaves have hardcoded tints instead of colormap tints.
 * Cherry, azalea, and flowering azalea leaves do not use tinting (pre-colored textures).
 */
export const FOLIAGE_TINTED_BLOCKS: ReadonlySet<string> = new Set([
  'oak_leaves',
  'jungle_leaves',
  'acacia_leaves',
  'dark_oak_leaves',
  'mangrove_leaves',
  'vine',
]);

/**
 * Blocks that have fixed, biome-independent tint colors in Java Edition.
 */
export const FIXED_TINT_BLOCKS: ReadonlyMap<string, [number, number, number]> = new Map([
  ['birch_leaves', BIRCH_LEAVES_TINT],
  ['spruce_leaves', SPRUCE_LEAVES_TINT],
  ['water', WATER_TINT],
  ['flowing_water', WATER_TINT],
  ['water_cauldron', WATER_TINT],
  ['bubble_column', WATER_TINT],
  ['lily_pad', LILY_PAD_TINT],
]);

/**
 * Strip namespace and block state properties from block identifier.
 * e.g. "minecraft:grass_block[snowy=false]" -> "grass_block"
 */
function cleanBlockName(blockName: string): string {
  let s = blockName.trim();
  if (s.startsWith('minecraft:')) {
    s = s.slice(10);
  }
  const bracketIndex = s.indexOf('[');
  if (bracketIndex !== -1) {
    s = s.slice(0, bracketIndex);
  }
  return s;
}

/**
 * Resolve the tint color for a block and face tintindex.
 *
 * @param blockName The Minecraft block identifier (e.g. "grass_block", "minecraft:birch_leaves")
 * @param tintindex The model face tintindex (typically 0 for tinted faces, or omitted/undefined; negative values indicate untinted)
 * @returns Normalized [r, g, b] color in range [0, 1], or null if the face is not tinted
 */
export function getTint(
  blockName: string,
  tintindex?: number
): [number, number, number] | null {
  // Negative tintindex explicitly means untinted face (e.g. dirt side of grass block)
  if (tintindex !== undefined && tintindex < 0) {
    return null;
  }

  // Vanilla blocks only define tint for tintindex 0
  if (tintindex !== undefined && tintindex > 0) {
    return null;
  }

  const name = cleanBlockName(blockName);

  // 1. Fixed hardcoded tints (birch, spruce, water, lily pad)
  const fixedTint = FIXED_TINT_BLOCKS.get(name);
  if (fixedTint) {
    return fixedTint;
  }

  // 2. Grass tinting (default plains 0x91BD59)
  if (GRASS_TINTED_BLOCKS.has(name)) {
    return DEFAULT_PLAINS_GRASS_TINT;
  }

  // 3. Foliage tinting (default plains 0x77AB2F)
  if (FOLIAGE_TINTED_BLOCKS.has(name)) {
    return DEFAULT_PLAINS_FOLIAGE_TINT;
  }

  // Untinted block
  return null;
}
