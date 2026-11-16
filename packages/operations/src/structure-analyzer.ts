// packages/operations/src/structure-analyzer.ts
// Pure TypeScript 3D structure analyzer, semantic architectural classifier,
// 2D coordinate ASCII map generator, and multi-view PNG software renderer (Slice M5).
// Zero framework/browser/Node/Three.js/MCP imports.

import type {
  BlockStateId,
  Bounds3i,
  Vec3i,
} from '../../domain/types.ts';
import {
  isAirLike,
  VANILLA_AIR_LIKE,
} from '../../domain/block-state.ts';
import type {
  Placement,
  Project,
} from '../../domain/placement.ts';
import {
  localBlockToWorld,
  placementWorldBounds,
} from '../../domain/coordinates.ts';
import type { EditorSession } from './session.ts';

// ============================================================================
// Types
// ============================================================================

export type SemanticRole =
  | 'terrain'
  | 'water'
  | 'vegetation'
  | 'road'
  | 'wall'
  | 'roof'
  | 'glass'
  | 'door'
  | 'light'
  | 'interior'
  | 'redstone'
  | 'structural';

export type StructureCategory =
  | 'tree-or-vegetation'
  | 'water-feature'
  | 'bridge'
  | 'wall-or-fortification'
  | 'tower'
  | 'hall-or-keep'
  | 'house'
  | 'building'
  | 'monument-or-statue'
  | 'terrain-hill';

export type CompassZone =
  | 'NW'
  | 'N'
  | 'NE'
  | 'W'
  | 'Center'
  | 'E'
  | 'SW'
  | 'S'
  | 'SE';

export interface DominantBlockInfo {
  block: string;
  count: number;
  percentage: number;
}

export interface ArchitecturalFeatures {
  roofBlocks: string[];
  wallBlocks: string[];
  floorBlocks: string[];
  interiorBlocks: string[];
  hasWindows: boolean;
  hasDoors: boolean;
  hasLighting: boolean;
  hasRoofStairsOrSlabs: boolean;
}

export interface StructureInfo {
  id: string; // e.g. "S1", "S2"
  symbol: string; // "1".."9", "A".."Z"
  name: string;
  category: StructureCategory;
  summary: string;
  bounds: Bounds3i;
  dimensions: { width: number; height: number; depth: number };
  heightAboveGround: number;
  centroid: Vec3i;
  compassZone: CompassZone;
  voxelCount: number;
  footprintArea: number;
  hasInteriorCavity: boolean;
  estimatedFloors: number;
  dominantBlocks: DominantBlockInfo[];
  architecturalFeatures: ArchitecturalFeatures;
}

export interface EnvironmentSummary {
  hasWater: boolean;
  waterVoxelCount: number;
  hasRoads: boolean;
  roadVoxelCount: number;
  vegetationCount: number;
  groundLevelY: number;
  totalVoxelCount: number;
  bounds: Bounds3i;
}

export interface SpatialMapLegendItem {
  symbol: string;
  id: string;
  name: string;
  category: string;
  bounds: Bounds3i;
}

export interface SpatialAsciiMap {
  grid: string[];
  legend: SpatialMapLegendItem[];
  xAxis: { min: number; max: number };
  zAxis: { min: number; max: number };
}

export interface StructureAnalysisOptions {
  bounds?: Bounds3i;
  maxStructures?: number;
  minFootprint?: number;
  minVoxels?: number;
  mapWidth?: number;
  mapHeight?: number;
  placementId?: string;
}

export interface RenderGridData {
  spanX: number;
  spanZ: number;
  minY: Int32Array;
  maxY: Int32Array;
  solidCount: Uint16Array;
  topR: Uint8Array;
  topG: Uint8Array;
  topB: Uint8Array;
  wallR: Uint8Array;
  wallG: Uint8Array;
  wallB: Uint8Array;
  isForeground: Uint8Array;
  structureIndex?: Int16Array;
}

export interface SchematicVisualAnalysis {
  bounds: Bounds3i;
  groundLevelY: number;
  totalVoxels: number;
  structures: StructureInfo[];
  environment: EnvironmentSummary;
  spatialMap: SpatialAsciiMap;
  renderGrid?: RenderGridData;
  _renderGrid?: RenderGridData;
}

export interface RenderSchematicPngOptions {
  bounds?: Bounds3i;
  view?: 'composite' | 'top' | 'isometric' | 'front' | 'side';
  width?: number;
  height?: number;
  annotateStructures?: boolean;
  highlightRegions?: Array<{ name: string; bounds: Bounds3i }>;
  analysis?: SchematicVisualAnalysis;
}

export interface RenderSchematicPngResult {
  pngBytes: Uint8Array;
  base64: string;
  width: number;
  height: number;
  view: string;
}

// ============================================================================
// 1. Block Semantic Role & Color Classifier
// ============================================================================

export interface ClassifiedBlock {
  role: SemanticRole;
  color: [number, number, number];
}

const EXACT_BLOCK_TABLE: Record<string, ClassifiedBlock> = {
  // Terrain
  grass_block: { role: 'terrain', color: [100, 160, 60] },
  dirt: { role: 'terrain', color: [134, 96, 67] },
  coarse_dirt: { role: 'terrain', color: [119, 85, 59] },
  rooted_dirt: { role: 'terrain', color: [145, 103, 72] },
  podzol: { role: 'terrain', color: [90, 63, 28] },
  mycelium: { role: 'terrain', color: [111, 99, 105] },
  mud: { role: 'terrain', color: [60, 57, 60] },
  packed_mud: { role: 'terrain', color: [142, 106, 79] },
  clay: { role: 'terrain', color: [160, 166, 179] },
  sand: { role: 'terrain', color: [219, 207, 155] },
  red_sand: { role: 'terrain', color: [190, 103, 33] },
  sandstone: { role: 'wall', color: [216, 203, 150] },
  cut_sandstone: { role: 'wall', color: [216, 203, 150] },
  smooth_sandstone: { role: 'wall', color: [216, 203, 150] },
  red_sandstone: { role: 'wall', color: [185, 100, 35] },
  gravel: { role: 'terrain', color: [130, 125, 125] },
  stone: { role: 'terrain', color: [128, 128, 128] },
  cobblestone: { role: 'wall', color: [112, 112, 112] },
  mossy_cobblestone: { role: 'wall', color: [100, 120, 95] },
  deepslate: { role: 'terrain', color: [75, 75, 80] },
  cobbled_deepslate: { role: 'wall', color: [70, 70, 75] },
  tuff: { role: 'terrain', color: [108, 109, 102] },
  calcite: { role: 'terrain', color: [224, 225, 220] },
  diorite: { role: 'terrain', color: [180, 180, 180] },
  andesite: { role: 'terrain', color: [136, 136, 136] },
  granite: { role: 'terrain', color: [150, 104, 88] },
  end_stone: { role: 'terrain', color: [222, 222, 160] },
  netherrack: { role: 'terrain', color: [115, 40, 40] },
  basalt: { role: 'structural', color: [80, 80, 85] },
  smooth_basalt: { role: 'structural', color: [75, 75, 80] },
  blackstone: { role: 'wall', color: [45, 40, 45] },
  bedrock: { role: 'terrain', color: [40, 40, 40] },
  soul_sand: { role: 'terrain', color: [80, 60, 50] },
  soul_soil: { role: 'terrain', color: [75, 55, 45] },
  snow: { role: 'terrain', color: [240, 245, 250] },
  snow_block: { role: 'terrain', color: [245, 250, 255] },
  ice: { role: 'terrain', color: [160, 195, 240] },
  packed_ice: { role: 'terrain', color: [140, 180, 235] },
  blue_ice: { role: 'terrain', color: [115, 165, 240] },

  // Water
  water: { role: 'water', color: [45, 95, 175] },
  flowing_water: { role: 'water', color: [45, 95, 175] },
  bubble_column: { role: 'water', color: [50, 110, 190] },
  seagrass: { role: 'water', color: [40, 115, 60] },
  tall_seagrass: { role: 'water', color: [40, 115, 60] },
  kelp: { role: 'water', color: [45, 120, 65] },
  kelp_plant: { role: 'water', color: [45, 120, 65] },

  // Road & Paths
  dirt_path: { role: 'road', color: [170, 135, 75] },
  grass_path: { role: 'road', color: [170, 135, 75] },
  smooth_stone: { role: 'road', color: [150, 150, 150] },
  polished_andesite: { role: 'road', color: [145, 145, 145] },
  polished_diorite: { role: 'road', color: [190, 190, 190] },
  polished_granite: { role: 'road', color: [160, 115, 100] },

  // Walls & Masonry
  stone_bricks: { role: 'wall', color: [120, 120, 120] },
  mossy_stone_bricks: { role: 'wall', color: [110, 125, 105] },
  cracked_stone_bricks: { role: 'wall', color: [115, 115, 115] },
  chiseled_stone_bricks: { role: 'wall', color: [118, 118, 118] },
  deepslate_bricks: { role: 'wall', color: [65, 65, 70] },
  deepslate_tiles: { role: 'wall', color: [55, 55, 60] },
  polished_deepslate: { role: 'wall', color: [70, 70, 75] },
  bricks: { role: 'wall', color: [150, 70, 55] },
  mud_bricks: { role: 'wall', color: [140, 105, 80] },
  quartz_block: { role: 'wall', color: [235, 230, 225] },
  smooth_quartz: { role: 'wall', color: [235, 230, 225] },
  chiseled_quartz_block: { role: 'wall', color: [230, 225, 220] },
  quartz_pillar: { role: 'structural', color: [235, 230, 225] },
  prismarine: { role: 'wall', color: [90, 155, 145] },
  prismarine_bricks: { role: 'wall', color: [100, 170, 160] },
  dark_prismarine: { role: 'wall', color: [50, 95, 85] },
  purpur_block: { role: 'wall', color: [170, 125, 170] },
  purpur_pillar: { role: 'structural', color: [170, 125, 170] },
  end_stone_bricks: { role: 'wall', color: [225, 225, 170] },
  nether_bricks: { role: 'wall', color: [45, 20, 25] },
  red_nether_bricks: { role: 'wall', color: [65, 15, 20] },
  polished_blackstone_bricks: { role: 'wall', color: [40, 35, 42] },
  copper_block: { role: 'wall', color: [195, 105, 80] },
  cut_copper: { role: 'wall', color: [185, 100, 75] },
  exposed_copper: { role: 'wall', color: [165, 125, 105] },
  weathered_copper: { role: 'wall', color: [110, 145, 125] },
  oxidized_copper: { role: 'wall', color: [85, 165, 140] },
  iron_block: { role: 'structural', color: [220, 220, 220] },
  gold_block: { role: 'structural', color: [245, 215, 60] },
  diamond_block: { role: 'structural', color: [100, 230, 220] },
  emerald_block: { role: 'structural', color: [50, 210, 100] },
  lapis_block: { role: 'structural', color: [35, 70, 150] },
  coal_block: { role: 'structural', color: [25, 25, 25] },
  obsidian: { role: 'structural', color: [20, 18, 30] },
  crying_obsidian: { role: 'structural', color: [35, 15, 50] },

  // Roof & Covers
  hay_block: { role: 'roof', color: [185, 155, 30] },

  // Glass
  glass: { role: 'glass', color: [180, 210, 225] },
  tinted_glass: { role: 'glass', color: [80, 70, 85] },
  glass_pane: { role: 'glass', color: [180, 210, 225] },

  // Lighting
  torch: { role: 'light', color: [255, 215, 80] },
  wall_torch: { role: 'light', color: [255, 215, 80] },
  soul_torch: { role: 'light', color: [100, 220, 255] },
  soul_wall_torch: { role: 'light', color: [100, 220, 255] },
  lantern: { role: 'light', color: [250, 190, 60] },
  soul_lantern: { role: 'light', color: [90, 210, 245] },
  glowstone: { role: 'light', color: [240, 200, 90] },
  sea_lantern: { role: 'light', color: [180, 230, 220] },
  shroomlight: { role: 'light', color: [240, 150, 75] },
  redstone_lamp: { role: 'light', color: [210, 140, 60] },
  campfire: { role: 'light', color: [245, 150, 50] },
  soul_campfire: { role: 'light', color: [80, 200, 240] },
  end_rod: { role: 'light', color: [235, 235, 245] },
  jack_o_lantern: { role: 'light', color: [235, 145, 35] },

  // Interior & Furniture
  crafting_table: { role: 'interior', color: [140, 100, 60] },
  furnace: { role: 'interior', color: [100, 100, 100] },
  blast_furnace: { role: 'interior', color: [85, 85, 90] },
  smoker: { role: 'interior', color: [90, 80, 70] },
  chest: { role: 'interior', color: [150, 110, 50] },
  trapped_chest: { role: 'interior', color: [150, 110, 50] },
  ender_chest: { role: 'interior', color: [40, 60, 65] },
  barrel: { role: 'interior', color: [135, 95, 55] },
  bookshelf: { role: 'interior', color: [130, 95, 60] },
  chiseled_bookshelf: { role: 'interior', color: [130, 95, 60] },
  anvil: { role: 'interior', color: [70, 70, 75] },
  chipped_anvil: { role: 'interior', color: [70, 70, 75] },
  damaged_anvil: { role: 'interior', color: [70, 70, 75] },
  enchanting_table: { role: 'interior', color: [120, 40, 50] },
  brewing_stand: { role: 'interior', color: [90, 90, 95] },
  cauldron: { role: 'interior', color: [75, 75, 80] },
  bell: { role: 'interior', color: [245, 200, 50] },
  stonecutter: { role: 'interior', color: [120, 115, 110] },
  grindstone: { role: 'interior', color: [130, 125, 120] },
  smithing_table: { role: 'interior', color: [60, 65, 80] },
  cartography_table: { role: 'interior', color: [110, 90, 70] },
  fletching_table: { role: 'interior', color: [170, 150, 110] },
  loom: { role: 'interior', color: [140, 115, 85] },
  flower_pot: { role: 'interior', color: [140, 75, 50] },
  armor_stand: { role: 'interior', color: [150, 120, 80] },
  lectern: { role: 'interior', color: [160, 130, 85] },

  // Redstone
  redstone_wire: { role: 'redstone', color: [220, 40, 30] },
  redstone_block: { role: 'redstone', color: [200, 30, 20] },
  redstone_torch: { role: 'redstone', color: [210, 50, 40] },
  repeater: { role: 'redstone', color: [160, 155, 150] },
  comparator: { role: 'redstone', color: [165, 160, 155] },
  piston: { role: 'redstone', color: [130, 115, 95] },
  sticky_piston: { role: 'redstone', color: [115, 140, 85] },
  observer: { role: 'redstone', color: [110, 105, 100] },
  dispenser: { role: 'redstone', color: [120, 120, 120] },
  dropper: { role: 'redstone', color: [120, 120, 120] },
  hopper: { role: 'redstone', color: [75, 75, 80] },
  lever: { role: 'redstone', color: [140, 120, 90] },
  tripwire_hook: { role: 'redstone', color: [130, 110, 80] },
  target: { role: 'redstone', color: [225, 195, 180] },

  // Structural & Frame
  chain: { role: 'structural', color: [65, 68, 78] },
  iron_bars: { role: 'structural', color: [140, 142, 145] },
  scaffolding: { role: 'structural', color: [180, 150, 95] },
  bone_block: { role: 'structural', color: [225, 220, 195] },
};

export function classifyBlock(rawBlockId: string): ClassifiedBlock {
  const id = rawBlockId.startsWith('minecraft:')
    ? rawBlockId.slice(10)
    : rawBlockId.includes(':')
      ? rawBlockId.split(':')[1]!
      : rawBlockId;

  // Direct exact lookup
  const exact = EXACT_BLOCK_TABLE[id];
  if (exact) return exact;

  // Stairs or Slabs -> roof
  if (id.endsWith('_stairs') || id.includes('stairs')) {
    return { role: 'roof', color: [150, 120, 80] };
  }
  if (id.endsWith('_slab') || id.includes('slab')) {
    return { role: 'roof', color: [150, 120, 80] };
  }

  // Doors, Trapdoors, Gates -> door
  if (id.includes('door') || id.includes('gate') || id.includes('trapdoor')) {
    return { role: 'door', color: [160, 115, 65] };
  }

  // Glass & Panes -> glass
  if (id.includes('glass')) {
    return { role: 'glass', color: [180, 210, 225] };
  }

  // Leaves & Vegetation
  if (id.includes('leaf') || id.includes('leaves')) {
    return { role: 'vegetation', color: [60, 130, 40] };
  }
  if (id.includes('grass') || id.includes('fern') || id.includes('flower') ||
      id.includes('tulip') || id.includes('rose') || id.includes('daisy') ||
      id.includes('orchid') || id.includes('dandelion') || id.includes('poppy') ||
      id.includes('vine') || id.includes('lily') || id.includes('sprout') ||
      id.includes('moss') || id.includes('azalea') || id.includes('sapling') ||
      id.includes('bamboo') || id.includes('cactus') || id.includes('sugar_cane')) {
    return { role: 'vegetation', color: [75, 140, 50] };
  }

  // Wood & Logs
  if (id.includes('log') || id.includes('wood')) {
    if (id.includes('stripped')) {
      return { role: 'structural', color: [175, 145, 95] };
    }
    return { role: 'vegetation', color: [105, 78, 48] };
  }

  // Planks & Fences -> structural
  if (id.includes('planks') || id.includes('fence')) {
    if (id.includes('oak')) return { role: 'structural', color: [162, 130, 78] };
    if (id.includes('spruce')) return { role: 'structural', color: [114, 84, 52] };
    if (id.includes('birch')) return { role: 'structural', color: [196, 179, 123] };
    if (id.includes('jungle')) return { role: 'structural', color: [160, 115, 80] };
    if (id.includes('acacia')) return { role: 'structural', color: [168, 90, 50] };
    if (id.includes('dark_oak')) return { role: 'structural', color: [66, 43, 20] };
    if (id.includes('mangrove')) return { role: 'structural', color: [117, 53, 48] };
    if (id.includes('cherry')) return { role: 'structural', color: [226, 178, 174] };
    if (id.includes('bamboo')) return { role: 'structural', color: [198, 169, 76] };
    if (id.includes('crimson')) return { role: 'structural', color: [126, 54, 76] };
    if (id.includes('warped')) return { role: 'structural', color: [43, 104, 99] };
    return { role: 'structural', color: [160, 130, 80] };
  }

  // Lights
  if (id.includes('torch') || id.includes('lantern') || id.includes('lamp') ||
      id.includes('glow') || id.includes('light') || id.includes('fire') || id.includes('candle')) {
    return { role: 'light', color: [255, 215, 75] };
  }

  // Water / Fluids
  if (id.includes('water')) {
    return { role: 'water', color: [45, 95, 175] };
  }
  if (id.includes('lava')) {
    return { role: 'terrain', color: [230, 100, 20] };
  }

  // Interior Furniture
  if (id.includes('bed') || id.includes('table') || id.includes('furnace') ||
      id.includes('chest') || id.includes('barrel') || id.includes('stand') ||
      id.includes('shelf') || id.includes('pot') || id.includes('anvil') ||
      id.includes('station') || id.includes('head') || id.includes('skull')) {
    return { role: 'interior', color: [140, 100, 60] };
  }

  // Redstone
  if (id.includes('redstone') || id.includes('piston') || id.includes('sensor') ||
      id.includes('observer') || id.includes('button') || id.includes('pressure_plate')) {
    return { role: 'redstone', color: [210, 45, 35] };
  }

  // Wool / Terracotta / Concrete
  if (id.includes('wool') || id.includes('concrete') || id.includes('terracotta') || id.includes('carpet')) {
    return { role: 'wall', color: [160, 140, 130] };
  }

  // Wall, Masonry, Stone, Brick
  if (id.includes('wall') || id.includes('brick') || id.includes('stone') ||
      id.includes('cobble') || id.includes('deepslate') || id.includes('prismarine') ||
      id.includes('quartz') || id.includes('pillar') || id.includes('tile')) {
    return { role: 'wall', color: [125, 125, 125] };
  }

  // Roads & Paths
  if (id.includes('path') || id.includes('road')) {
    return { role: 'road', color: [170, 135, 75] };
  }

  // Terrain / Earth
  if (id.includes('dirt') || id.includes('sand') || id.includes('gravel') ||
      id.includes('clay') || id.includes('ore') || id.includes('rock')) {
    return { role: 'terrain', color: [140, 115, 85] };
  }

  // Deterministic fallback color from hash
  let h = 0;
  for (let i = 0; i < id.length; i++) {
    h = ((h << 5) - h + id.charCodeAt(i)) | 0;
  }
  const r = 100 + (Math.abs(h) % 100);
  const g = 100 + (Math.abs(h >> 4) % 100);
  const b = 100 + (Math.abs(h >> 8) % 100);
  return { role: 'structural', color: [r, g, b] };
}

export function formatMaterialName(rawBlockId: string): string {
  const id = rawBlockId.startsWith('minecraft:')
    ? rawBlockId.slice(10)
    : rawBlockId.includes(':')
      ? rawBlockId.split(':')[1]!
      : rawBlockId;

  // Exact mappings & special prefixes
  if (id === 'stone_bricks' || id.includes('stone_brick')) return 'Stone Brick';
  if (id === 'deepslate_bricks' || id.includes('deepslate')) return 'Deepslate';
  if (id === 'cobblestone' || id.includes('cobble')) return 'Cobblestone';
  if (id === 'sandstone' || id.includes('sandstone')) return id.includes('red') ? 'Red Sandstone' : 'Sandstone';
  if (id === 'quartz_block' || id.includes('quartz')) return 'Quartz';
  if (id === 'bricks' || (id.includes('brick') && !id.includes('nether') && !id.includes('end_stone') && !id.includes('stone_brick'))) return 'Brick';
  if (id.includes('nether_brick')) return 'Nether Brick';
  if (id.includes('end_stone')) return 'End Stone';
  if (id.includes('blackstone')) return 'Blackstone';
  if (id.includes('prismarine')) return 'Prismarine';

  // Wood types
  if (id.includes('spruce')) return 'Spruce';
  if (id.includes('dark_oak')) return 'Dark Oak';
  if (id.includes('oak')) return 'Oak';
  if (id.includes('birch')) return 'Birch';
  if (id.includes('jungle')) return 'Jungle';
  if (id.includes('acacia')) return 'Acacia';
  if (id.includes('mangrove')) return 'Mangrove';
  if (id.includes('cherry')) return 'Cherry';
  if (id.includes('bamboo')) return 'Bamboo';
  if (id.includes('crimson')) return 'Crimson';
  if (id.includes('warped')) return 'Warped';

  // Colored concrete / terracotta / wool
  const colors = [
    'white', 'orange', 'magenta', 'light_blue', 'yellow', 'lime', 'pink',
    'gray', 'light_gray', 'cyan', 'purple', 'blue', 'brown', 'green', 'red', 'black',
  ];
  for (const col of colors) {
    if (id.startsWith(col + '_concrete')) {
      const colTitle = col.split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
      return `${colTitle} Concrete`;
    }
    if (id.startsWith(col + '_terracotta')) {
      const colTitle = col.split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
      return `${colTitle} Terracotta`;
    }
    if (id.startsWith(col + '_wool')) {
      const colTitle = col.split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
      return `${colTitle} Wool`;
    }
  }

  if (id.includes('terracotta')) return 'Terracotta';
  if (id.includes('concrete')) return 'Concrete';
  if (id.includes('smooth_stone')) return 'Smooth Stone';
  if (id.includes('stone')) return 'Stone';
  if (id.includes('glass')) return 'Glass';
  if (id.includes('copper')) return 'Copper';
  if (id.includes('iron')) return 'Iron';

  // Fallback: title-case cleaned name
  const clean = id
    .replace(/_(block|stairs|slab|planks|log|wood|wall|fence|door|gate)$/, '')
    .replace(/_/g, ' ');
  return clean.split(' ').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

export function determineStructureName(
  category: StructureCategory,
  dominantBlocks: DominantBlockInfo[],
  footprintArea: number,
  voxelCount: number,
  heightAboveGround: number,
): string {
  // Filter out pure terrain / water / air / ground blocks from consideration for materials
  const nonBuildingBlocks = new Set([
    'grass_block', 'dirt', 'coarse_dirt', 'rooted_dirt', 'podzol', 'mycelium',
    'mud', 'clay', 'gravel', 'sand', 'water', 'flowing_water', 'lava', 'bedrock',
    'air', 'cave_air', 'void_air', 'short_grass', 'tall_grass', 'seagrass',
    'tall_seagrass', 'kelp', 'kelp_plant',
  ]);

  const isExcludedMaterial = (rawId: string): boolean => {
    if (nonBuildingBlocks.has(rawId)) return true;
    if (category !== 'tree-or-vegetation') {
      if (
        rawId.includes('grass') || rawId.includes('fern') || rawId.includes('flower') ||
        rawId.includes('tulip') || rawId.includes('rose') || rawId.includes('orchid') ||
        rawId.includes('dandelion') || rawId.includes('poppy') || rawId.includes('lily') ||
        rawId.includes('sprout') || rawId.includes('vine') || rawId.includes('sapling')
      ) {
        return true;
      }
    }
    return false;
  };

  const matCounts: Record<string, number> = {};
  for (const db of dominantBlocks) {
    const rawId = db.block.replace(/^minecraft:/, '');
    if (isExcludedMaterial(rawId)) continue;
    const mat = formatMaterialName(rawId);
    matCounts[mat] = (matCounts[mat] ?? 0) + db.count;
  }

  // If no building blocks in dominant list, fallback to dominantBlocks[0]
  if (Object.keys(matCounts).length === 0 && dominantBlocks.length > 0) {
    const rawId = dominantBlocks[0]!.block.replace(/^minecraft:/, '');
    const mat = formatMaterialName(rawId);
    matCounts[mat] = dominantBlocks[0]!.count;
  }

  const sortedMats = Object.entries(matCounts).sort((a, b) => b[1] - a[1]);
  const mat1 = sortedMats[0]?.[0];
  const mat2 = sortedMats[1]?.[0];

  let matStr = mat1 ?? 'Stone';
  if (mat1 && mat2 && sortedMats[1]![1] >= sortedMats[0]![1] * 0.20 && sortedMats[1]![1] >= 5) {
    matStr = `${mat1} & ${mat2}`;
  }

  let noun = 'Building';
  switch (category) {
    case 'tower':
      noun = heightAboveGround >= 20 ? 'Tower' : 'Watchtower';
      break;
    case 'hall-or-keep':
      noun = (footprintArea >= 500 || voxelCount > 15000) ? 'Keep' : 'Grand Hall';
      break;
    case 'house':
      noun = footprintArea <= 40 ? 'Cottage' : 'House';
      break;
    case 'building':
      noun = footprintArea >= 150 ? 'Building' : 'House';
      break;
    case 'bridge':
      noun = 'Arch Bridge';
      break;
    case 'wall-or-fortification':
      noun = 'Fortification Wall';
      break;
    case 'tree-or-vegetation':
      noun = footprintArea >= 25 ? 'Tree Cluster' : 'Tree';
      break;
    case 'monument-or-statue':
      noun = 'Monument';
      break;
    case 'water-feature':
      return 'Water Basin';
    case 'terrain-hill':
      return `${matStr} Hillcrest`;
  }

  return `${matStr} ${noun}`;
}

// ============================================================================
// 2. Chunk-Accelerated Column Scanner & Ground Baseline
// ============================================================================

interface ColumnGridData {
  spanX: number;
  spanZ: number;
  minX: number;
  minZ: number;
  solidCount: Int32Array;
  minY: Int32Array;
  maxY: Int32Array;
  topBlock: (string | null)[];
  baseBlock: (string | null)[];
  wallBlock: (string | null)[];
  wallMaxY: Int32Array;
  topR: Uint8Array;
  topG: Uint8Array;
  topB: Uint8Array;
  wallR: Uint8Array;
  wallG: Uint8Array;
  wallB: Uint8Array;
  roofCount: Uint16Array;
  wallCount: Uint16Array;
  glassCount: Uint16Array;
  doorCount: Uint16Array;
  lightCount: Uint16Array;
  interiorCount: Uint16Array;
  leafCount: Uint16Array;
  logCount: Uint16Array;
  waterCount: Uint16Array;
  terrainCount: Uint16Array;
  roadCount: Uint16Array;
  structuralCount: Uint16Array;
  redstoneCount: Uint16Array;
}

function resolveSessionProject(sessionOrProject: EditorSession | Project): Project {
  if ('peekProject' in sessionOrProject && typeof sessionOrProject.peekProject === 'function') {
    return sessionOrProject.peekProject();
  }
  return sessionOrProject as Project;
}

function computePlacementsUnionBounds(placements: Placement[]): Bounds3i {
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

  for (const p of placements) {
    if (!p.visible) continue;
    const b = placementWorldBounds(p);
    if (b.min[0] < minX) minX = b.min[0];
    if (b.min[1] < minY) minY = b.min[1];
    if (b.min[2] < minZ) minZ = b.min[2];
    if (b.maxExclusive[0] > maxX) maxX = b.maxExclusive[0];
    if (b.maxExclusive[1] > maxY) maxY = b.maxExclusive[1];
    if (b.maxExclusive[2] > maxZ) maxZ = b.maxExclusive[2];
  }

  if (minX === Infinity) {
    return { min: [0, 0, 0], maxExclusive: [0, 0, 0] };
  }
  return { min: [minX, minY, minZ], maxExclusive: [maxX, maxY, maxZ] };
}

// ============================================================================
// 3. Structure Analyzer Engine
// ============================================================================

const ROLE_CODE = {
  NONE: 0,
  ROOF: 1,
  WALL: 2,
  GLASS: 3,
  DOOR: 4,
  LIGHT: 5,
  INTERIOR: 6,
  VEG_LEAF: 7,
  VEG_LOG: 8,
  WATER: 9,
  TERRAIN: 10,
  ROAD: 11,
  STRUCTURAL: 12,
  REDSTONE: 13,
} as const;

// Precomputed circular neighborhood offsets for peak finding (radius = 6)
const PEAK_RADIUS_OFFSETS: Array<[number, number]> = [];
for (let dz = -6; dz <= 6; dz++) {
  for (let dx = -6; dx <= 6; dx++) {
    if (dx * dx + dz * dz <= 36 && (dx !== 0 || dz !== 0)) {
      PEAK_RADIUS_OFFSETS.push([dx, dz]);
    }
  }
}

export function analyzeSchematicStructures(
  sessionOrProject: EditorSession | Project,
  options?: StructureAnalysisOptions,
): SchematicVisualAnalysis {
  const project = resolveSessionProject(sessionOrProject);
  const placementId = options?.placementId;
  const targetPlacements = placementId
    ? project.placements.filter((p) => p.id === placementId && p.visible)
    : project.placements.filter((p) => p.visible);

  const targetBounds: Bounds3i = options?.bounds ?? computePlacementsUnionBounds(targetPlacements);
  const minX = targetBounds.min[0];
  const maxX = targetBounds.maxExclusive[0];
  const minY = targetBounds.min[1];
  const maxY = targetBounds.maxExclusive[1];
  const minZ = targetBounds.min[2];
  const maxZ = targetBounds.maxExclusive[2];

  const spanX = Math.max(0, maxX - minX);
  const spanZ = Math.max(0, maxZ - minZ);
  const totalColumns = spanX * spanZ;

  if (totalColumns === 0 || targetPlacements.length === 0) {
    const emptyEnv: EnvironmentSummary = {
      hasWater: false,
      waterVoxelCount: 0,
      hasRoads: false,
      roadVoxelCount: 0,
      vegetationCount: 0,
      groundLevelY: minY,
      totalVoxelCount: 0,
      bounds: targetBounds,
    };
    return {
      bounds: targetBounds,
      groundLevelY: minY,
      totalVoxels: 0,
      structures: [],
      environment: emptyEnv,
      spatialMap: {
        grid: ['(empty schematic)'],
        legend: [],
        xAxis: { min: minX, max: maxX },
        zAxis: { min: minZ, max: maxZ },
      },
    };
  }

  // Allocate 2D column grids
  const grid: ColumnGridData = {
    spanX,
    spanZ,
    minX,
    minZ,
    solidCount: new Int32Array(totalColumns),
    minY: new Int32Array(totalColumns).fill(1000000),
    maxY: new Int32Array(totalColumns).fill(-1000000),
    topBlock: new Array(totalColumns).fill(null),
    baseBlock: new Array(totalColumns).fill(null),
    wallBlock: new Array(totalColumns).fill(null),
    wallMaxY: new Int32Array(totalColumns).fill(-1000000),
    topR: new Uint8Array(totalColumns),
    topG: new Uint8Array(totalColumns),
    topB: new Uint8Array(totalColumns),
    wallR: new Uint8Array(totalColumns),
    wallG: new Uint8Array(totalColumns),
    wallB: new Uint8Array(totalColumns),
    roofCount: new Uint16Array(totalColumns),
    wallCount: new Uint16Array(totalColumns),
    glassCount: new Uint16Array(totalColumns),
    doorCount: new Uint16Array(totalColumns),
    lightCount: new Uint16Array(totalColumns),
    interiorCount: new Uint16Array(totalColumns),
    leafCount: new Uint16Array(totalColumns),
    logCount: new Uint16Array(totalColumns),
    waterCount: new Uint16Array(totalColumns),
    terrainCount: new Uint16Array(totalColumns),
    roadCount: new Uint16Array(totalColumns),
    structuralCount: new Uint16Array(totalColumns),
    redstoneCount: new Uint16Array(totalColumns),
  };

  let totalVoxels = 0;

  // Scan visible placements and chunks directly
  for (const placement of targetPlacements) {
    const isIdentity = placement.transform.rotationY === 0 && placement.transform.mirror === 'none';
    const tx = placement.transform.translation[0] - Math.floor(placement.origin[0] / 2);
    const ty = placement.transform.translation[1] - Math.floor(placement.origin[1] / 2);
    const tz = placement.transform.translation[2] - Math.floor(placement.origin[2] / 2);

    for (const [chunkKey, chunk] of placement.volume.chunks) {
      if (chunk.palette.length <= 1) continue;

      const parts = chunkKey.split('_');
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

        if (
          cWorldMaxX <= minX || cWorldMinX >= maxX ||
          cWorldMaxY <= minY || cWorldMinY >= maxY ||
          cWorldMaxZ <= minZ || cWorldMinZ >= maxZ
        ) {
          continue;
        }
      }

      // Pre-classify palette for this chunk using integer role codes and RGB colors
      const palette = chunk.palette;
      const palCode = new Uint8Array(palette.length);
      const palColorR = new Uint8Array(palette.length);
      const palColorG = new Uint8Array(palette.length);
      const palColorB = new Uint8Array(palette.length);
      for (let p = 0; p < palette.length; p++) {
        const st = palette[p];
        if (!st || isAirLike(st.id, VANILLA_AIR_LIKE)) {
          palCode[p] = ROLE_CODE.NONE;
        } else {
          const classified = classifyBlock(st.id);
          palColorR[p] = classified.color[0];
          palColorG[p] = classified.color[1];
          palColorB[p] = classified.color[2];
          const role = classified.role;
          if (role === 'vegetation') {
            palCode[p] = (st.id.includes('leaf') || st.id.includes('leaves')) ? ROLE_CODE.VEG_LEAF : ROLE_CODE.VEG_LOG;
          } else if (role === 'roof') palCode[p] = ROLE_CODE.ROOF;
          else if (role === 'wall') palCode[p] = ROLE_CODE.WALL;
          else if (role === 'glass') palCode[p] = ROLE_CODE.GLASS;
          else if (role === 'door') palCode[p] = ROLE_CODE.DOOR;
          else if (role === 'light') palCode[p] = ROLE_CODE.LIGHT;
          else if (role === 'interior') palCode[p] = ROLE_CODE.INTERIOR;
          else if (role === 'water') palCode[p] = ROLE_CODE.WATER;
          else if (role === 'terrain') palCode[p] = ROLE_CODE.TERRAIN;
          else if (role === 'road') palCode[p] = ROLE_CODE.ROAD;
          else if (role === 'structural') palCode[p] = ROLE_CODE.STRUCTURAL;
          else if (role === 'redstone') palCode[p] = ROLE_CODE.REDSTONE;
        }
      }

      const indices = chunk.indices;
      if (isIdentity) {
        const cWorldMinX = tx + chunkBaseX;
        const cWorldMinY = ty + chunkBaseY;
        const cWorldMinZ = tz + chunkBaseZ;

        for (let ly = 0; ly < 16; ly++) {
          const wy = cWorldMinY + ly;
          if (wy < minY || wy >= maxY) continue;

          for (let lz = 0; lz < 16; lz++) {
            const wz = cWorldMinZ + lz;
            if (wz < minZ || wz >= maxZ) continue;

            const colBase = (wz - minZ) * spanX + (cWorldMinX - minX);
            const rowBase = (ly * 16 + lz) * 16;

            for (let lx = 0; lx < 16; lx++) {
              const palIdx = indices[rowBase + lx]!;
              if (palIdx === 0) continue;
              const code = palCode[palIdx]!;
              if (code === ROLE_CODE.NONE) continue;

              const wx = cWorldMinX + lx;
              if (wx < minX || wx >= maxX) continue;

              const colIdx = colBase + lx;
              grid.solidCount[colIdx]++;
              totalVoxels++;

              switch (code) {
                case ROLE_CODE.ROOF: grid.roofCount[colIdx]++; break;
                case ROLE_CODE.WALL: grid.wallCount[colIdx]++; break;
                case ROLE_CODE.GLASS: grid.glassCount[colIdx]++; break;
                case ROLE_CODE.DOOR: grid.doorCount[colIdx]++; break;
                case ROLE_CODE.LIGHT: grid.lightCount[colIdx]++; break;
                case ROLE_CODE.INTERIOR: grid.interiorCount[colIdx]++; break;
                case ROLE_CODE.VEG_LEAF: grid.leafCount[colIdx]++; break;
                case ROLE_CODE.VEG_LOG: grid.logCount[colIdx]++; break;
                case ROLE_CODE.WATER: grid.waterCount[colIdx]++; break;
                case ROLE_CODE.TERRAIN: grid.terrainCount[colIdx]++; break;
                case ROLE_CODE.ROAD: grid.roadCount[colIdx]++; break;
                case ROLE_CODE.STRUCTURAL: grid.structuralCount[colIdx]++; break;
                case ROLE_CODE.REDSTONE: grid.redstoneCount[colIdx]++; break;
              }

              if (wy > grid.maxY[colIdx]!) {
                grid.maxY[colIdx] = wy;
                grid.topBlock[colIdx] = palette[palIdx]!.id;
                grid.topR[colIdx] = palColorR[palIdx]!;
                grid.topG[colIdx] = palColorG[palIdx]!;
                grid.topB[colIdx] = palColorB[palIdx]!;
              }
              if (wy < grid.minY[colIdx]!) {
                grid.minY[colIdx] = wy;
                grid.baseBlock[colIdx] = palette[palIdx]!.id;
              }
              if (
                (code === ROLE_CODE.WALL || code === ROLE_CODE.STRUCTURAL || code === ROLE_CODE.DOOR || code === ROLE_CODE.GLASS) &&
                wy > grid.wallMaxY[colIdx]!
              ) {
                grid.wallMaxY[colIdx] = wy;
                grid.wallBlock[colIdx] = palette[palIdx]!.id;
                grid.wallR[colIdx] = palColorR[palIdx]!;
                grid.wallG[colIdx] = palColorG[palIdx]!;
                grid.wallB[colIdx] = palColorB[palIdx]!;
              }
            }
          }
        }
      } else {
        for (let ly = 0; ly < 16; ly++) {
          const cyLocal = chunkBaseY + ly;
          for (let lz = 0; lz < 16; lz++) {
            const czLocal = chunkBaseZ + lz;
            const rowBase = (ly * 16 + lz) * 16;

            for (let lx = 0; lx < 16; lx++) {
              const palIdx = indices[rowBase + lx]!;
              if (palIdx === 0) continue;
              const code = palCode[palIdx]!;
              if (code === ROLE_CODE.NONE) continue;

              const wPos = localBlockToWorld(placement, [chunkBaseX + lx, cyLocal, czLocal]);
              const wx = wPos[0];
              const wy = wPos[1];
              const wz = wPos[2];

              if (wx < minX || wx >= maxX || wy < minY || wy >= maxY || wz < minZ || wz >= maxZ) {
                continue;
              }

              const colIdx = (wz - minZ) * spanX + (wx - minX);
              grid.solidCount[colIdx]++;
              totalVoxels++;

              switch (code) {
                case ROLE_CODE.ROOF: grid.roofCount[colIdx]++; break;
                case ROLE_CODE.WALL: grid.wallCount[colIdx]++; break;
                case ROLE_CODE.GLASS: grid.glassCount[colIdx]++; break;
                case ROLE_CODE.DOOR: grid.doorCount[colIdx]++; break;
                case ROLE_CODE.LIGHT: grid.lightCount[colIdx]++; break;
                case ROLE_CODE.INTERIOR: grid.interiorCount[colIdx]++; break;
                case ROLE_CODE.VEG_LEAF: grid.leafCount[colIdx]++; break;
                case ROLE_CODE.VEG_LOG: grid.logCount[colIdx]++; break;
                case ROLE_CODE.WATER: grid.waterCount[colIdx]++; break;
                case ROLE_CODE.TERRAIN: grid.terrainCount[colIdx]++; break;
                case ROLE_CODE.ROAD: grid.roadCount[colIdx]++; break;
                case ROLE_CODE.STRUCTURAL: grid.structuralCount[colIdx]++; break;
                case ROLE_CODE.REDSTONE: grid.redstoneCount[colIdx]++; break;
              }

              if (wy > grid.maxY[colIdx]!) {
                grid.maxY[colIdx] = wy;
                grid.topBlock[colIdx] = palette[palIdx]!.id;
                grid.topR[colIdx] = palColorR[palIdx]!;
                grid.topG[colIdx] = palColorG[palIdx]!;
                grid.topB[colIdx] = palColorB[palIdx]!;
              }
              if (wy < grid.minY[colIdx]!) {
                grid.minY[colIdx] = wy;
                grid.baseBlock[colIdx] = palette[palIdx]!.id;
              }
              if (
                (code === ROLE_CODE.WALL || code === ROLE_CODE.STRUCTURAL || code === ROLE_CODE.DOOR || code === ROLE_CODE.GLASS) &&
                wy > grid.wallMaxY[colIdx]!
              ) {
                grid.wallMaxY[colIdx] = wy;
                grid.wallBlock[colIdx] = palette[palIdx]!.id;
                grid.wallR[colIdx] = palColorR[palIdx]!;
                grid.wallG[colIdx] = palColorG[palIdx]!;
                grid.wallB[colIdx] = palColorB[palIdx]!;
              }
            }
          }
        }
      }
    }
  }

  // Fallback for non-empty columns without explicit wall blocks
  for (let c = 0; c < totalColumns; c++) {
    if (grid.solidCount[c]! > 0 && grid.wallMaxY[c]! === -1000000) {
      grid.wallR[c] = grid.topR[c]!;
      grid.wallG[c] = grid.topG[c]!;
      grid.wallB[c] = grid.topB[c]!;
      grid.wallBlock[c] = grid.topBlock[c]!;
    }
  }

  // Estimate global groundLevelY: 30th percentile of grid.maxY[c] across all non-empty columns
  const nonZeroMaxYs: number[] = [];
  for (let c = 0; c < totalColumns; c++) {
    if (grid.solidCount[c]! > 0) {
      nonZeroMaxYs.push(grid.maxY[c]!);
    }
  }

  let globalGroundLevelY = minY;
  if (nonZeroMaxYs.length > 0) {
    nonZeroMaxYs.sort((a, b) => a - b);
    globalGroundLevelY = nonZeroMaxYs[Math.floor(nonZeroMaxYs.length * 0.30)]!;
  }

  // Local ground baseline grid (32x32 cells): 25th percentile of grid.maxY[c]
  const cellStride = 32;
  const gridW = Math.ceil(spanX / cellStride);
  const gridD = Math.ceil(spanZ / cellStride);
  const localGroundBaseline = new Int32Array(gridW * gridD).fill(globalGroundLevelY);

  for (let gz = 0; gz < gridD; gz++) {
    for (let gx = 0; gx < gridW; gx++) {
      const cellMinX = gx * cellStride;
      const cellMaxX = Math.min(spanX, (gx + 1) * cellStride);
      const cellMinZ = gz * cellStride;
      const cellMaxZ = Math.min(spanZ, (gz + 1) * cellStride);

      const cellHeights: number[] = [];
      for (let z = cellMinZ; z < cellMaxZ; z++) {
        for (let x = cellMinX; x < cellMaxX; x++) {
          const c = z * spanX + x;
          if (grid.solidCount[c]! > 0) {
            cellHeights.push(grid.maxY[c]!);
          }
        }
      }

      if (cellHeights.length > 0) {
        cellHeights.sort((a, b) => a - b);
        localGroundBaseline[gz * gridW + gx] = cellHeights[Math.floor(cellHeights.length * 0.25)]!;
      }
    }
  }

  // Environmental counters
  let totalWaterVoxels = 0;
  let totalRoadVoxels = 0;
  let totalVegetationVoxels = 0;

  for (let c = 0; c < totalColumns; c++) {
    totalWaterVoxels += grid.waterCount[c]!;
    totalRoadVoxels += grid.roadCount[c]!;
    totalVegetationVoxels += grid.leafCount[c]! + grid.logCount[c]!;
  }

  const environment: EnvironmentSummary = {
    hasWater: totalWaterVoxels > 0,
    waterVoxelCount: totalWaterVoxels,
    hasRoads: totalRoadVoxels > 0,
    roadVoxelCount: totalRoadVoxels,
    vegetationCount: totalVegetationVoxels,
    groundLevelY: globalGroundLevelY,
    totalVoxelCount: totalVoxels,
    bounds: targetBounds,
  };

  // Mark foreground candidate columns
  const isForeground = new Uint8Array(totalColumns);
  const minHeightAboveGround = totalColumns > 2500 ? 4 : 3;

  for (let z = 0; z < spanZ; z++) {
    const gz = Math.min(gridD - 1, Math.floor(z / cellStride));
    for (let x = 0; x < spanX; x++) {
      const gx = Math.min(gridW - 1, Math.floor(x / cellStride));
      const colIdx = z * spanX + x;
      const sc = grid.solidCount[colIdx]!;
      if (sc === 0) continue;

      const localGroundY = localGroundBaseline[gz * gridW + gx]!;
      const heightAboveGround = grid.maxY[colIdx]! - localGroundY;

      if (heightAboveGround < minHeightAboveGround) continue;

      const topId = grid.topBlock[colIdx];
      if (topId) {
        const topRole = classifyBlock(topId).role;
        if (topRole === 'water' || (topRole === 'road' && heightAboveGround <= 3)) continue;
      }

      isForeground[colIdx] = 1;
    }
  }

  // 8-Connected flood fill segmentation
  const compLabels = new Int32Array(totalColumns).fill(-1);
  let nextLabel = 0;
  const rawComponents: number[][] = [];

  const queue = new Int32Array(totalColumns);

  for (let c = 0; c < totalColumns; c++) {
    if (isForeground[c] === 0 || compLabels[c] !== -1) continue;

    let head = 0;
    let tail = 0;
    queue[tail++] = c;
    compLabels[c] = nextLabel;
    const compColumns: number[] = [c];

    while (head < tail) {
      const curr = queue[head++]!;
      const cx = curr % spanX;
      const cz = Math.floor(curr / spanX);
      const curSolid = grid.solidCount[curr]!;
      const curIsVeg = (grid.leafCount[curr]! + grid.logCount[curr]!) / curSolid >= 0.70;
      const curIsArch = (grid.wallCount[curr]! + grid.roofCount[curr]! + grid.glassCount[curr]!) / curSolid >= 0.30;
      const curMaxY = grid.maxY[curr]!;

      for (let dz = -1; dz <= 1; dz++) {
        const nz = cz + dz;
        if (nz < 0 || nz >= spanZ) continue;
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dz === 0) continue;
          const nx = cx + dx;
          if (nx < 0 || nx >= spanX) continue;

          const nbr = nz * spanX + nx;
          if (isForeground[nbr] === 0 || compLabels[nbr] !== -1) continue;

          // Do not merge between pure vegetation and architectural columns
          const nbrSolid = grid.solidCount[nbr]!;
          const nbrIsVeg = (grid.leafCount[nbr]! + grid.logCount[nbr]!) / nbrSolid >= 0.70;
          const nbrIsArch = (grid.wallCount[nbr]! + grid.roofCount[nbr]! + grid.glassCount[nbr]!) / nbrSolid >= 0.30;
          if ((curIsVeg && nbrIsArch) || (curIsArch && nbrIsVeg)) continue;

          // Roof height discontinuity check
          if (Math.abs(curMaxY - grid.maxY[nbr]!) >= 8) {
            const hasWallBridge = grid.wallCount[curr]! > 0 || grid.wallCount[nbr]! > 0;
            if (!hasWallBridge) continue;
          }

          compLabels[nbr] = nextLabel;
          compColumns.push(nbr);
          queue[tail++] = nbr;
        }
      }
    }

    rawComponents.push(compColumns);
    nextLabel++;
  }

  const maxStructures = options?.maxStructures ?? 36;
  const minFootprint = options?.minFootprint ?? 10;
  const minVoxels = options?.minVoxels ?? 20;

  // Multi-scale sub-segmentation for large compounds (footprintArea > 450)
  const finalComponentColumns: number[][] = [];

  for (const comp of rawComponents) {
    if (comp.length <= 450) {
      finalComponentColumns.push(comp);
      continue;
    }

    // Find local peaks in the large compound
    const compId = compLabels[comp[0]!]!;
    const candidatePeaks: number[] = [];

    for (const c of comp) {
      const cx = c % spanX;
      const cz = Math.floor(c / spanX);
      const myY = grid.maxY[c]!;

      // Ultra-fast 4-neighbor prefilter with plateau tie-breaking (only 1 peak per flat plateau)
      if (cx > 0 && compLabels[c - 1] === compId) {
        const ny = grid.maxY[c - 1]!;
        if (ny > myY || (ny === myY && c - 1 < c)) continue;
      }
      if (cx < spanX - 1 && compLabels[c + 1] === compId) {
        const ny = grid.maxY[c + 1]!;
        if (ny > myY || (ny === myY && c + 1 < c)) continue;
      }
      if (cz > 0 && compLabels[c - spanX] === compId) {
        const ny = grid.maxY[c - spanX]!;
        if (ny > myY || (ny === myY && c - spanX < c)) continue;
      }
      if (cz < spanZ - 1 && compLabels[c + spanX] === compId) {
        const ny = grid.maxY[c + spanX]!;
        if (ny > myY || (ny === myY && c + spanX < c)) continue;
      }

      const gz = Math.min(gridD - 1, Math.floor(cz / cellStride));
      const gx = Math.min(gridW - 1, Math.floor(cx / cellStride));
      const localGroundY = localGroundBaseline[gz * gridW + gx]!;
      const hAbove = myY - localGroundY;
      if (hAbove < 6) continue;

      let isPeak = true;
      for (let o = 0; o < PEAK_RADIUS_OFFSETS.length; o++) {
        const offset = PEAK_RADIUS_OFFSETS[o]!;
        const nx = cx + offset[0];
        const nz = cz + offset[1];
        if (nx < 0 || nx >= spanX || nz < 0 || nz >= spanZ) continue;
        const nbr = nz * spanX + nx;
        if (compLabels[nbr] === compId) {
          const ny = grid.maxY[nbr]!;
          if (ny > myY || (ny === myY && nbr < c)) {
            isPeak = false;
            break;
          }
        }
      }

      if (isPeak) {
        candidatePeaks.push(c);
      }
    }

    // Cluster nearby peak seeds, keeping up to top 30 most prominent separated by at least 14 blocks
    candidatePeaks.sort((a, b) => grid.maxY[b]! - grid.maxY[a]!);
    const topCandidates = candidatePeaks.slice(0, 60);

    const filteredPeaks: number[] = [];
    const maxPeaks = Math.min(30, maxStructures);

    for (const p of topCandidates) {
      if (filteredPeaks.length >= maxPeaks) break;
      const px = p % spanX;
      const pz = Math.floor(p / spanX);
      let tooClose = false;
      for (const fp of filteredPeaks) {
        const fpx = fp % spanX;
        const fpz = Math.floor(fp / spanX);
        const distSq = (px - fpx) * (px - fpx) + (pz - fpz) * (pz - fpz);
        if (distSq < 196) { // separated by at least 14 blocks
          tooClose = true;
          break;
        }
      }
      if (!tooClose) {
        filteredPeaks.push(p);
      }
    }

    if (filteredPeaks.length >= 2) {
      // Peak-seeded Voronoi / watershed partitioning using cached coordinates
      const numPeaks = filteredPeaks.length;
      const partition: number[][] = Array.from({ length: numPeaks }, () => []);
      const peakXs = new Int32Array(numPeaks);
      const peakZs = new Int32Array(numPeaks);
      for (let i = 0; i < numPeaks; i++) {
        peakXs[i] = filteredPeaks[i]! % spanX;
        peakZs[i] = Math.floor(filteredPeaks[i]! / spanX);
      }

      for (const c of comp) {
        const cx = c % spanX;
        const cz = Math.floor(c / spanX);
        let bestDistSq = Infinity;
        let bestIdx = 0;

        for (let i = 0; i < numPeaks; i++) {
          const dx = cx - peakXs[i]!;
          const dz = cz - peakZs[i]!;
          const dSq = dx * dx + dz * dz;
          if (dSq < bestDistSq) {
            bestDistSq = dSq;
            bestIdx = i;
          }
        }
        partition[bestIdx]!.push(c);
      }

      // Filter out sub-components with footprintArea < 16 (merge them into nearest neighbor)
      const validPartitions: Array<{ peakIdx: number; cols: number[] }> = [];
      const smallPartitions: Array<{ peakIdx: number; cols: number[] }> = [];

      for (let i = 0; i < numPeaks; i++) {
        if (partition[i]!.length >= 16) {
          validPartitions.push({ peakIdx: i, cols: partition[i]! });
        } else if (partition[i]!.length > 0) {
          smallPartitions.push({ peakIdx: i, cols: partition[i]! });
        }
      }

      if (validPartitions.length > 0) {
        for (const small of smallPartitions) {
          const spx = peakXs[small.peakIdx]!;
          const spz = peakZs[small.peakIdx]!;
          let nearestIdx = 0;
          let nearestDistSq = Infinity;
          for (let j = 0; j < validPartitions.length; j++) {
            const vp = validPartitions[j]!;
            const vpx = peakXs[vp.peakIdx]!;
            const vpz = peakZs[vp.peakIdx]!;
            const dSq = (spx - vpx) * (spx - vpx) + (spz - vpz) * (spz - vpz);
            if (dSq < nearestDistSq) {
              nearestDistSq = dSq;
              nearestIdx = j;
            }
          }
          validPartitions[nearestIdx]!.cols.push(...small.cols);
        }

        for (const vp of validPartitions) {
          finalComponentColumns.push(vp.cols);
        }
      } else {
        finalComponentColumns.push(comp);
      }
    } else {
      finalComponentColumns.push(comp);
    }
  }

  // Build candidate structure info
  interface CandidateStructure {
    columns: number[];
    voxelCount: number;
    footprintArea: number;
    minColX: number;
    maxColX: number;
    minColZ: number;
    maxColZ: number;
    minY: number;
    maxY: number;
    heightAboveGround: number;
    prominence: number;
    hasInteriorCavity: boolean;
    roofCount: number;
    wallCount: number;
    glassCount: number;
    doorCount: number;
    lightCount: number;
    interiorCount: number;
    leafCount: number;
    logCount: number;
    waterCount: number;
    terrainCount: number;
    roadCount: number;
    structuralCount: number;
    redstoneCount: number;
    dominantBlocks: DominantBlockInfo[];
    features: ArchitecturalFeatures;
  }

  const candidates: CandidateStructure[] = [];

  for (const cols of finalComponentColumns) {
    if (cols.length < minFootprint) continue;

    let vCount = 0;
    let cMinX = Infinity, cMaxX = -Infinity;
    let cMinZ = Infinity, cMaxZ = -Infinity;
    let sMinY = Infinity, sMaxY = -Infinity;
    let cavityColCount = 0;

    let totRoof = 0, totWall = 0, totGlass = 0, totDoor = 0;
    let totLight = 0, totInterior = 0, totLeaf = 0, totLog = 0;
    let totWater = 0, totTerrain = 0, totRoad = 0, totStructural = 0;
    let totRedstone = 0;

    const blockHistogram: Record<string, number> = {};
    const roofBlockSet = new Set<string>();
    const wallBlockSet = new Set<string>();
    const floorBlockSet = new Set<string>();
    const interiorBlockSet = new Set<string>();

    for (const c of cols) {
      const cx = c % spanX;
      const cz = Math.floor(c / spanX);
      if (cx < cMinX) cMinX = cx;
      if (cx > cMaxX) cMaxX = cx;
      if (cz < cMinZ) cMinZ = cz;
      if (cz > cMaxZ) cMaxZ = cz;

      const sc = grid.solidCount[c]!;
      vCount += sc;

      if (grid.minY[c]! < sMinY) sMinY = grid.minY[c]!;
      if (grid.maxY[c]! > sMaxY) sMaxY = grid.maxY[c]!;

      // Interior cavity check: vertical span exceeds solid blocks by >= 2
      const span = grid.maxY[c]! - grid.minY[c]! + 1;
      if (span > sc + 1) {
        cavityColCount++;
      }

      totRoof += grid.roofCount[c]!;
      totWall += grid.wallCount[c]!;
      totGlass += grid.glassCount[c]!;
      totDoor += grid.doorCount[c]!;
      totLight += grid.lightCount[c]!;
      totInterior += grid.interiorCount[c]!;
      totLeaf += grid.leafCount[c]!;
      totLog += grid.logCount[c]!;
      totWater += grid.waterCount[c]!;
      totTerrain += grid.terrainCount[c]!;
      totRoad += grid.roadCount[c]!;
      totStructural += grid.structuralCount[c]!;
      totRedstone += grid.redstoneCount[c]!;

      const topB = grid.topBlock[c];
      if (topB) {
        blockHistogram[topB] = (blockHistogram[topB] ?? 0) + 1;
        const role = classifyBlock(topB).role;
        if (role === 'roof') roofBlockSet.add(topB);
        if (role === 'wall') wallBlockSet.add(topB);
      }
      const wallB = grid.wallBlock[c];
      if (wallB && wallB !== topB) {
        blockHistogram[wallB] = (blockHistogram[wallB] ?? 0) + 1;
        const role = classifyBlock(wallB).role;
        if (role === 'wall') wallBlockSet.add(wallB);
      }
      const baseB = grid.baseBlock[c];
      if (baseB) {
        floorBlockSet.add(baseB);
      }
    }

    if (vCount < minVoxels) continue;

    const gzMid = Math.min(gridD - 1, Math.floor((cMinZ + cMaxZ) / (2 * cellStride)));
    const gxMid = Math.min(gridW - 1, Math.floor((cMinX + cMaxX) / (2 * cellStride)));
    const localGroundY = localGroundBaseline[gzMid * gridW + gxMid]!;
    const heightAboveGround = Math.max(1, sMaxY - localGroundY);

    const prominence = vCount * (1 + heightAboveGround * 0.2);
    const hasInteriorCavity = cavityColCount >= 4 || (cavityColCount / cols.length >= 0.12) || (totDoor > 0 && totGlass > 0);

    // Dominant blocks
    const totalTracked = Object.values(blockHistogram).reduce((a, b) => a + b, 0);
    const sortedBlocks = Object.entries(blockHistogram).sort((a, b) => b[1] - a[1]);
    const dominantBlocks: DominantBlockInfo[] = sortedBlocks.slice(0, 6).map(([block, count]) => ({
      block,
      count,
      percentage: totalTracked > 0 ? Math.round((count / totalTracked) * 100) : 0,
    }));

    const features: ArchitecturalFeatures = {
      roofBlocks: Array.from(roofBlockSet),
      wallBlocks: Array.from(wallBlockSet),
      floorBlocks: Array.from(floorBlockSet),
      interiorBlocks: Array.from(interiorBlockSet),
      hasWindows: totGlass > 0,
      hasDoors: totDoor > 0,
      hasLighting: totLight > 0,
      hasRoofStairsOrSlabs: totRoof > 0,
    };

    candidates.push({
      columns: cols,
      voxelCount: vCount,
      footprintArea: cols.length,
      minColX: cMinX,
      maxColX: cMaxX,
      minColZ: cMinZ,
      maxColZ: cMaxZ,
      minY: sMinY,
      maxY: sMaxY,
      heightAboveGround,
      prominence,
      hasInteriorCavity,
      roofCount: totRoof,
      wallCount: totWall,
      glassCount: totGlass,
      doorCount: totDoor,
      lightCount: totLight,
      interiorCount: totInterior,
      leafCount: totLeaf,
      logCount: totLog,
      waterCount: totWater,
      terrainCount: totTerrain,
      roadCount: totRoad,
      structuralCount: totStructural,
      redstoneCount: totRedstone,
      dominantBlocks,
      features,
    });
  }

  // Sort by prominence descending
  candidates.sort((a, b) => b.prominence - a.prominence);
  const selected = candidates.slice(0, maxStructures);

  // Classify each structure
  const structures: StructureInfo[] = [];

  for (let i = 0; i < selected.length; i++) {
    const cand = selected[i]!;
    const id = `S${i + 1}`;
    const symbol = i < 9 ? String(i + 1) : String.fromCharCode(65 + (i - 9)); // '1'..'9', 'A'..'Z'

    const gzMid = Math.min(gridD - 1, Math.floor((cand.minColZ + cand.maxColZ) / (2 * cellStride)));
    const gxMid = Math.min(gridW - 1, Math.floor((cand.minColX + cand.maxColX) / (2 * cellStride)));
    const compLocalGroundY = localGroundBaseline[gzMid * gridW + gxMid]!;

    const worldMinX = minX + cand.minColX;
    const worldMaxX = minX + cand.maxColX + 1;
    const worldMinZ = minZ + cand.minColZ;
    const worldMaxZ = minZ + cand.maxColZ + 1;
    const worldMinY = Math.max(cand.minY, compLocalGroundY);
    const worldMaxY = cand.maxY + 1;

    const bounds: Bounds3i = {
      min: [worldMinX, worldMinY, worldMinZ],
      maxExclusive: [worldMaxX, worldMaxY, worldMaxZ],
    };

    const width = worldMaxX - worldMinX;
    const height = Math.max(1, worldMaxY - worldMinY);
    const depth = worldMaxZ - worldMinZ;
    const dimensions = { width, height, depth };

    const centroid: Vec3i = [
      Math.floor((worldMinX + worldMaxX - 1) / 2),
      Math.floor((worldMinY + worldMaxY - 1) / 2),
      Math.floor((worldMinZ + worldMaxZ - 1) / 2),
    ];

    // Compass zone
    const totalW = Math.max(1, spanX);
    const totalD = Math.max(1, spanZ);
    const relX = (centroid[0] - minX) / totalW;
    const relZ = (centroid[2] - minZ) / totalD;

    let xZone: 'W' | 'Center' | 'E';
    if (relX < 0.35) xZone = 'W';
    else if (relX > 0.65) xZone = 'E';
    else xZone = 'Center';

    let zZone: 'N' | 'Center' | 'S';
    if (relZ < 0.35) zZone = 'N';
    else if (relZ > 0.65) zZone = 'S';
    else zZone = 'Center';

    let compassZone: CompassZone;
    if (zZone === 'N') {
      compassZone = xZone === 'W' ? 'NW' : xZone === 'E' ? 'NE' : 'N';
    } else if (zZone === 'S') {
      compassZone = xZone === 'W' ? 'SW' : xZone === 'E' ? 'SE' : 'S';
    } else {
      compassZone = xZone === 'W' ? 'W' : xZone === 'E' ? 'E' : 'Center';
    }

    // Category classification
    const maxDim = Math.max(width, depth);
    const minDim = Math.max(1, Math.min(width, depth));
    const aspectRatio = maxDim / minDim;
    const vegRatio = (cand.leafCount + cand.logCount) / cand.voxelCount;
    const waterRatio = cand.waterCount / cand.voxelCount;
    const archBlocksCount = cand.wallCount + cand.roofCount + cand.glassCount + cand.doorCount;

    let category: StructureCategory;
    if (vegRatio > 0.55) {
      category = 'tree-or-vegetation';
    } else if (waterRatio > 0.5) {
      category = 'water-feature';
    } else if (
      (cand.terrainCount / cand.voxelCount > 0.6) &&
      archBlocksCount === 0
    ) {
      category = 'terrain-hill';
    } else if (
      (cand.minY > globalGroundLevelY + 1 || cand.waterCount > 0) &&
      aspectRatio >= 2.2 &&
      cand.voxelCount > 40
    ) {
      category = 'bridge';
    } else if (aspectRatio >= 3.5 && (cand.wallCount > cand.voxelCount * 0.3)) {
      category = 'wall-or-fortification';
    } else if (
      cand.heightAboveGround >= 14 &&
      cand.heightAboveGround / Math.sqrt(cand.footprintArea) >= 1.1 &&
      archBlocksCount > 0
    ) {
      category = 'tower';
    } else if (
      cand.footprintArea >= 220 &&
      cand.heightAboveGround >= 10 &&
      archBlocksCount > 0
    ) {
      category = 'hall-or-keep';
    } else if (archBlocksCount > 0) {
      category = cand.footprintArea >= 80 ? 'building' : 'house';
    } else if (cand.footprintArea <= 64 && cand.heightAboveGround >= 6 && !cand.hasInteriorCavity) {
      category = 'monument-or-statue';
    } else {
      category = cand.heightAboveGround >= 5 ? 'building' : 'monument-or-statue';
    }

    // Estimated floors
    const isBuildingType = category === 'house' || category === 'building' || category === 'hall-or-keep' || category === 'tower';
    const estimatedFloors = isBuildingType
      ? Math.max(1, Math.round(cand.heightAboveGround / 4.5))
      : 1;

    // Material-aware descriptive name
    const name = determineStructureName(
      category,
      cand.dominantBlocks,
      cand.footprintArea,
      cand.voxelCount,
      cand.heightAboveGround,
    );

    const featSummary: string[] = [];
    if (cand.features.hasDoors) featSummary.push('doors');
    if (cand.features.hasWindows) featSummary.push('windows');
    if (cand.features.hasLighting) featSummary.push('lanterns/torches');
    if (cand.features.hasRoofStairsOrSlabs) featSummary.push('pitched roof');
    if (cand.hasInteriorCavity) featSummary.push('interior cavity');

    const summary = `${name} in ${compassZone} (${width}x${height}x${depth}m, ${cand.heightAboveGround}m above ground, ~${estimatedFloors} floor${estimatedFloors > 1 ? 's' : ''}). Features: ${featSummary.length > 0 ? featSummary.join(', ') : 'solid monolithic structure'}.`;

    structures.push({
      id,
      symbol,
      name,
      category,
      summary,
      bounds,
      dimensions,
      heightAboveGround: cand.heightAboveGround,
      centroid,
      compassZone,
      voxelCount: cand.voxelCount,
      footprintArea: cand.footprintArea,
      hasInteriorCavity: cand.hasInteriorCavity,
      estimatedFloors,
      dominantBlocks: cand.dominantBlocks,
      architecturalFeatures: cand.features,
    });
  }

  // Generate 2D ASCII spatial map
  const spatialMap = generateSpatialAsciiMap(structures, environment, targetBounds, grid, options);

  const solidCountU16 = new Uint16Array(totalColumns);
  for (let i = 0; i < totalColumns; i++) {
    solidCountU16[i] = Math.min(65535, grid.solidCount[i]!);
  }

  const structureIndex = new Int16Array(totalColumns).fill(-1);
  for (let i = 0; i < selected.length; i++) {
    const cand = selected[i]!;
    for (const c of cand.columns) {
      structureIndex[c] = i;
    }
  }

  const renderGrid: RenderGridData = {
    spanX,
    spanZ,
    minY: grid.minY,
    maxY: grid.maxY,
    solidCount: solidCountU16,
    topR: grid.topR,
    topG: grid.topG,
    topB: grid.topB,
    wallR: grid.wallR,
    wallG: grid.wallG,
    wallB: grid.wallB,
    isForeground,
    structureIndex,
  };

  const analysis: SchematicVisualAnalysis = {
    bounds: targetBounds,
    groundLevelY: globalGroundLevelY,
    totalVoxels,
    structures,
    environment,
    spatialMap,
  };

  Object.defineProperty(analysis, '_renderGrid', {
    value: renderGrid,
    enumerable: false,
    writable: true,
    configurable: true,
  });

  Object.defineProperty(analysis, 'renderGrid', {
    value: renderGrid,
    enumerable: false,
    writable: true,
    configurable: true,
  });

  return analysis;
}

// ============================================================================
// 4. 2D Coordinate ASCII Map Generator
// ============================================================================

export function generateSpatialAsciiMap(
  structures: StructureInfo[],
  environment: EnvironmentSummary,
  targetBounds: Bounds3i,
  grid?: ColumnGridData,
  options?: { mapWidth?: number; mapHeight?: number },
): SpatialAsciiMap {
  const mapW = Math.max(10, Math.min(100, options?.mapWidth ?? 50));
  const mapH = Math.max(8, Math.min(60, options?.mapHeight ?? 24));

  const minX = targetBounds.min[0];
  const maxX = targetBounds.maxExclusive[0];
  const minZ = targetBounds.min[2];
  const maxZ = targetBounds.maxExclusive[2];
  const spanX = Math.max(1, maxX - minX);
  const spanZ = Math.max(1, maxZ - minZ);

  const charGrid: string[][] = Array.from({ length: mapH }, () => new Array(mapW).fill(' '));

  // Stamp environmental cues if column grid is available
  if (grid) {
    for (let gz = 0; gz < mapH; gz++) {
      const wz = minZ + Math.floor((gz + 0.5) * spanZ / mapH);
      const colZ = Math.min(grid.spanZ - 1, Math.max(0, wz - minZ));
      for (let gx = 0; gx < mapW; gx++) {
        const wx = minX + Math.floor((gx + 0.5) * spanX / mapW);
        const colX = Math.min(grid.spanX - 1, Math.max(0, wx - minX));
        const c = colZ * grid.spanX + colX;
        if (grid.solidCount[c]! > 0) {
          if (grid.waterCount[c]! > 0 && grid.waterCount[c]! >= grid.solidCount[c]! * 0.5) {
            charGrid[gz]![gx] = '~';
          } else if (grid.roadCount[c]! > 0 && grid.roadCount[c]! >= grid.solidCount[c]! * 0.5) {
            charGrid[gz]![gx] = '=';
          } else if (grid.leafCount[c]! + grid.logCount[c]! >= 2) {
            charGrid[gz]![gx] = '"';
          } else {
            charGrid[gz]![gx] = '.';
          }
        }
      }
    }
  }

  // Stamp structure footprints and symbols
  for (const st of structures) {
    const sMinX = Math.floor((st.bounds.min[0] - minX) * mapW / spanX);
    const sMaxX = Math.min(mapW - 1, Math.floor((st.bounds.maxExclusive[0] - 1 - minX) * mapW / spanX));
    const sMinZ = Math.floor((st.bounds.min[2] - minZ) * mapH / spanZ);
    const sMaxZ = Math.min(mapH - 1, Math.floor((st.bounds.maxExclusive[2] - 1 - minZ) * mapH / spanZ));

    const midGX = Math.floor((sMinX + sMaxX) / 2);
    const midGZ = Math.floor((sMinZ + sMaxZ) / 2);

    for (let gz = sMinZ; gz <= sMaxZ; gz++) {
      if (gz < 0 || gz >= mapH) continue;
      for (let gx = sMinX; gx <= sMaxX; gx++) {
        if (gx < 0 || gx >= mapW) continue;
        charGrid[gz]![gx] = '#';
      }
    }

    if (midGZ >= 0 && midGZ < mapH && midGX >= 0 && midGX < mapW) {
      charGrid[midGZ]![midGX] = st.symbol;
    }
  }

  const lines: string[] = [];
  const xHeader = `X: [${minX} .. ${maxX}]  (North = -Z, West = -X)`;
  lines.push(xHeader);
  lines.push('+' + '-'.repeat(mapW) + '+');

  for (let gz = 0; gz < mapH; gz++) {
    const zVal = minZ + Math.floor((gz + 0.5) * spanZ / mapH);
    const zPrefix = String(zVal).padStart(5, ' ');
    lines.push(`|${charGrid[gz]!.join('')}| ${zPrefix}`);
  }

  lines.push('+' + '-'.repeat(mapW) + '+');
  lines.push(`Z: [${minZ} .. ${maxZ}]`);

  const legend: SpatialMapLegendItem[] = structures.map((st) => ({
    symbol: st.symbol,
    id: st.id,
    name: st.name,
    category: st.category,
    bounds: st.bounds,
  }));

  return {
    grid: lines,
    legend,
    xAxis: { min: minX, max: maxX },
    zAxis: { min: minZ, max: maxZ },
  };
}

// ============================================================================
// 5. Pure-TS 5x7 Font & 2D Rasterizer
// ============================================================================

const FONT_5X7: Record<string, number[]> = {
  ' ': [0, 0, 0, 0, 0, 0, 0],
  'A': [0b01110, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001],
  'B': [0b11110, 0b10001, 0b10001, 0b11110, 0b10001, 0b10001, 0b11110],
  'C': [0b01110, 0b10001, 0b10000, 0b10000, 0b10000, 0b10001, 0b01110],
  'D': [0b11110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b11110],
  'E': [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b11111],
  'F': [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b10000],
  'G': [0b01110, 0b10001, 0b10000, 0b10111, 0b10001, 0b10001, 0b01110],
  'H': [0b10001, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001],
  'I': [0b01110, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110],
  'J': [0b00001, 0b00001, 0b00001, 0b00001, 0b10001, 0b10001, 0b01110],
  'K': [0b10001, 0b10010, 0b10100, 0b11000, 0b10100, 0b10010, 0b10001],
  'L': [0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b11111],
  'M': [0b10001, 0b11011, 0b10101, 0b10001, 0b10001, 0b10001, 0b10001],
  'N': [0b10001, 0b11001, 0b10101, 0b10011, 0b10001, 0b10001, 0b10001],
  'O': [0b01110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  'P': [0b11110, 0b10001, 0b10001, 0b11110, 0b10000, 0b10000, 0b10000],
  'Q': [0b01110, 0b10001, 0b10001, 0b10001, 0b10101, 0b10010, 0b01101],
  'R': [0b11110, 0b10001, 0b10001, 0b11110, 0b10100, 0b10010, 0b10001],
  'S': [0b01110, 0b10001, 0b10000, 0b01110, 0b00001, 0b10001, 0b01110],
  'T': [0b11111, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100],
  'U': [0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  'V': [0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01010, 0b00100],
  'W': [0b10001, 0b10001, 0b10001, 0b10101, 0b10101, 0b11011, 0b10001],
  'X': [0b10001, 0b10001, 0b01010, 0b00100, 0b01010, 0b10001, 0b10001],
  'Y': [0b10001, 0b10001, 0b01010, 0b00100, 0b00100, 0b00100, 0b00100],
  'Z': [0b11111, 0b00001, 0b00010, 0b00100, 0b01000, 0b10000, 0b11111],
  '0': [0b01110, 0b10011, 0b10101, 0b10101, 0b11001, 0b10001, 0b01110],
  '1': [0b00100, 0b01100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110],
  '2': [0b01110, 0b10001, 0b00001, 0b00010, 0b00100, 0b01000, 0b11111],
  '3': [0b11110, 0b00001, 0b00001, 0b01110, 0b00001, 0b00001, 0b11110],
  '4': [0b00010, 0b00110, 0b01010, 0b10010, 0b11111, 0b00010, 0b00010],
  '5': [0b11111, 0b10000, 0b11110, 0b00001, 0b00001, 0b10001, 0b01110],
  '6': [0b00110, 0b01000, 0b10000, 0b11110, 0b10001, 0b10001, 0b01110],
  '7': [0b11111, 0b00001, 0b00010, 0b00100, 0b01000, 0b01000, 0b01000],
  '8': [0b01110, 0b10001, 0b10001, 0b01110, 0b10001, 0b10001, 0b01110],
  '9': [0b01110, 0b10001, 0b10001, 0b01111, 0b00001, 0b00010, 0b01100],
  ':': [0b00000, 0b01100, 0b01100, 0b00000, 0b01100, 0b01100, 0b00000],
  '-': [0b00000, 0b00000, 0b00000, 0b11111, 0b00000, 0b00000, 0b00000],
  '+': [0b00000, 0b00100, 0b00100, 0b11111, 0b00100, 0b00100, 0b00000],
  '=': [0b00000, 0b11111, 0b00000, 0b11111, 0b00000, 0b00000, 0b00000],
  '(': [0b00010, 0b00100, 0b01000, 0b01000, 0b01000, 0b00100, 0b00010],
  ')': [0b01000, 0b00100, 0b00010, 0b00010, 0b00010, 0b00100, 0b01000],
  '[': [0b01110, 0b01000, 0b01000, 0b01000, 0b01000, 0b01000, 0b01110],
  ']': [0b01110, 0b00010, 0b00010, 0b00010, 0b00010, 0b00010, 0b01110],
  ',': [0b00000, 0b00000, 0b00000, 0b00000, 0b00110, 0b00100, 0b01000],
  '.': [0b00000, 0b00000, 0b00000, 0b00000, 0b00000, 0b01100, 0b01100],
  '/': [0b00001, 0b00010, 0b00100, 0b00100, 0b01000, 0b10000, 0b00000],
  '#': [0b01010, 0b01010, 0b11111, 0b01010, 0b11111, 0b01010, 0b01010],
  '!': [0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b00000, 0b00100],
  '?': [0b01110, 0b10001, 0b00001, 0b00010, 0b00100, 0b00000, 0b00100],
  '|': [0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100],
  '^': [0b00100, 0b01010, 0b10001, 0b00000, 0b00000, 0b00000, 0b00000],
  '&': [0b01100, 0b10010, 0b10100, 0b01000, 0b10101, 0b10010, 0b01101],
  '~': [0b00000, 0b01101, 0b10010, 0b00000, 0b00000, 0b00000, 0b00000],
  '*': [0b00000, 0b10101, 0b01110, 0b11111, 0b01110, 0b10101, 0b00000],
  '_': [0b00000, 0b00000, 0b00000, 0b00000, 0b00000, 0b00000, 0b11111],
  '%': [0b11001, 0b11010, 0b00100, 0b01000, 0b01011, 0b10011, 0b00000],
};

class PixelCanvas {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8Array;

  constructor(width: number, height: number, bg: [number, number, number, number] = [20, 24, 33, 255]) {
    this.width = width;
    this.height = height;
    this.data = new Uint8Array(width * height * 4);
    for (let i = 0; i < width * height; i++) {
      const idx = i * 4;
      this.data[idx] = bg[0];
      this.data[idx + 1] = bg[1];
      this.data[idx + 2] = bg[2];
      this.data[idx + 3] = bg[3];
    }
  }

  setPixel(x: number, y: number, r: number, g: number, b: number, a = 255): void {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) return;
    const idx = (y * this.width + x) * 4;
    if (a >= 255) {
      this.data[idx] = Math.max(0, Math.min(255, r));
      this.data[idx + 1] = Math.max(0, Math.min(255, g));
      this.data[idx + 2] = Math.max(0, Math.min(255, b));
      this.data[idx + 3] = 255;
    } else {
      const prevA = this.data[idx + 3]! / 255;
      const alpha = a / 255;
      const outA = alpha + prevA * (1 - alpha);
      if (outA > 0) {
        this.data[idx] = Math.round((r * alpha + this.data[idx]! * prevA * (1 - alpha)) / outA);
        this.data[idx + 1] = Math.round((g * alpha + this.data[idx + 1]! * prevA * (1 - alpha)) / outA);
        this.data[idx + 2] = Math.round((b * alpha + this.data[idx + 2]! * prevA * (1 - alpha)) / outA);
        this.data[idx + 3] = Math.round(outA * 255);
      }
    }
  }

  fillRect(x: number, y: number, w: number, h: number, r: number, g: number, b: number, a = 255): void {
    const startX = Math.max(0, x);
    const endX = Math.min(this.width, x + w);
    const startY = Math.max(0, y);
    const endY = Math.min(this.height, y + h);

    for (let cy = startY; cy < endY; cy++) {
      for (let cx = startX; cx < endX; cx++) {
        this.setPixel(cx, cy, r, g, b, a);
      }
    }
  }

  drawRect(x: number, y: number, w: number, h: number, r: number, g: number, b: number, a = 255): void {
    this.drawLine(x, y, x + w - 1, y, r, g, b, a);
    this.drawLine(x, y + h - 1, x + w - 1, y + h - 1, r, g, b, a);
    this.drawLine(x, y, x, y + h - 1, r, g, b, a);
    this.drawLine(x + w - 1, y, x + w - 1, y + h - 1, r, g, b, a);
  }

  drawLine(x0: number, y0: number, x1: number, y1: number, r: number, g: number, b: number, a = 255): void {
    x0 = Math.round(x0); y0 = Math.round(y0);
    x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0);
    const dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;
    let cx = x0;
    let cy = y0;
    while (true) {
      this.setPixel(cx, cy, r, g, b, a);
      if (cx === x1 && cy === y1) break;
      const e2 = 2 * err;
      if (e2 > -dy) { err -= dy; cx += sx; }
      if (e2 < dx) { err += dx; cy += sy; }
    }
  }

  drawChar(ch: string, x: number, y: number, r: number, g: number, b: number, scale = 1): void {
    const glyph = FONT_5X7[ch.toUpperCase()] || FONT_5X7['?'];
    if (!glyph) return;
    for (let row = 0; row < 7; row++) {
      const rowBits = glyph[row]!;
      for (let col = 0; col < 5; col++) {
        if ((rowBits & (1 << (4 - col))) !== 0) {
          if (scale === 1) {
            this.setPixel(x + col, y + row, r, g, b, 255);
          } else {
            this.fillRect(x + col * scale, y + row * scale, scale, scale, r, g, b, 255);
          }
        }
      }
    }
  }

  drawText(
    text: string,
    x: number,
    y: number,
    color: [number, number, number],
    outlineColor?: [number, number, number],
    scale = 1,
  ): void {
    const charW = 6 * scale;
    if (outlineColor) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          let curX = x + dx;
          for (let i = 0; i < text.length; i++) {
            this.drawChar(text[i]!, curX, y + dy, outlineColor[0], outlineColor[1], outlineColor[2], scale);
            curX += charW;
          }
        }
      }
    }
    let curX = x;
    for (let i = 0; i < text.length; i++) {
      this.drawChar(text[i]!, curX, y, color[0], color[1], color[2], scale);
      curX += charW;
    }
  }
}

// ============================================================================
// 6. Pure-TS Multi-View Software PNG Renderer
// ============================================================================

const STRUCTURE_COLORS: [number, number, number][] = [
  [0, 230, 255],   // Cyan
  [255, 220, 0],   // Yellow
  [110, 255, 110], // Lime
  [255, 130, 20],  // Orange
  [255, 70, 210],  // Magenta
  [255, 90, 90],   // Coral
  [120, 180, 255], // Sky blue
  [230, 230, 250], // Lavender
];

export function renderSchematicPng(
  sessionOrProject: EditorSession | Project,
  options?: RenderSchematicPngOptions,
): RenderSchematicPngResult {
  const analysis = options?.analysis ?? analyzeSchematicStructures(sessionOrProject, { bounds: options?.bounds });
  const view = options?.view ?? 'composite';
  const width = options?.width ?? (view === 'composite' ? 840 : 600);
  const height = options?.height ?? (view === 'composite' ? 440 : 440);

  const canvas = new PixelCanvas(width, height, [18, 22, 30, 255]);
  const highlightRegions = options?.highlightRegions ?? [];
  const annotate = options?.annotateStructures ?? true;

  if (view === 'composite') {
    renderTopDownPanel(canvas, analysis, 0, 0, Math.floor(width / 2), height, annotate, highlightRegions);
    renderIsometricPanel(canvas, analysis, Math.floor(width / 2), 0, width - Math.floor(width / 2), height, annotate, highlightRegions);

    // Separator line
    canvas.drawLine(Math.floor(width / 2), 0, Math.floor(width / 2), height - 24, 45, 55, 75, 255);

    // Bottom summary banner
    canvas.fillRect(0, height - 24, width, 24, 14, 18, 26, 255);
    canvas.drawLine(0, height - 24, width, height - 24, 50, 60, 80, 255);

    const stSummary = analysis.structures.slice(0, 4).map((s) => `${s.id}: ${s.name}`).join(' | ');
    const bannerText = `STRUCTURES: ${analysis.structures.length} (${stSummary || 'none'})  TOTAL VOXELS: ${analysis.totalVoxels}`;
    canvas.drawText(bannerText, 10, height - 16, [170, 190, 220]);
  } else if (view === 'top') {
    renderTopDownPanel(canvas, analysis, 0, 0, width, height, annotate, highlightRegions);
  } else if (view === 'isometric') {
    renderIsometricPanel(canvas, analysis, 0, 0, width, height, annotate, highlightRegions);
  } else if (view === 'front') {
    renderElevationPanel(canvas, analysis, 0, 0, width, height, 'front', annotate);
  } else if (view === 'side') {
    renderElevationPanel(canvas, analysis, 0, 0, width, height, 'side', annotate);
  }

  const pngBytes = encodeRgbaToPng(canvas.data, width, height);
  const base64 = uint8ArrayToBase64(pngBytes);

  return {
    pngBytes,
    base64,
    width,
    height,
    view,
  };
}

function renderTopDownPanel(
  canvas: PixelCanvas,
  analysis: SchematicVisualAnalysis,
  vx: number,
  vy: number,
  vw: number,
  vh: number,
  annotate: boolean,
  highlightRegions: Array<{ name: string; bounds: Bounds3i }>,
): void {
  // Title Bar
  canvas.fillRect(vx, vy, vw, 26, 24, 30, 42, 255);
  canvas.drawLine(vx, vy + 26, vx + vw, vy + 26, 50, 62, 85, 255);
  canvas.drawText('TOP-DOWN VIEW (NORTH = -Z)', vx + 10, vy + 9, [140, 220, 255]);

  const innerX = vx + 10;
  const innerY = vy + 34;
  const innerW = vw - 20;
  const innerH = vh - 60;

  const b = analysis.bounds;
  const spanX = Math.max(1, b.maxExclusive[0] - b.min[0]);
  const spanZ = Math.max(1, b.maxExclusive[2] - b.min[2]);

  const scale = Math.min(innerW / spanX, innerH / spanZ);
  const renderW = Math.round(spanX * scale);
  const renderH = Math.round(spanZ * scale);
  const offX = innerX + Math.floor((innerW - renderW) / 2);
  const offY = innerY + Math.floor((innerH - renderH) / 2);

  // Background map box
  canvas.fillRect(offX, offY, renderW, renderH, 20, 24, 34, 255);
  canvas.drawRect(offX, offY, renderW, renderH, 45, 55, 75, 255);

  const rg = analysis._renderGrid ?? analysis.renderGrid;
  const groundY = analysis.groundLevelY;

  if (rg) {
    const { spanX: rSpanX, spanZ: rSpanZ, maxY, solidCount, topR, topG, topB, structureIndex } = rg;

    for (let py = 0; py < renderH; py++) {
      const lz = Math.min(rSpanZ - 1, Math.max(0, Math.floor(py / scale)));
      const wz = b.min[2] + lz;
      const isZGrid = wz % 16 === 0;

      for (let px = 0; px < renderW; px++) {
        const lx = Math.min(rSpanX - 1, Math.max(0, Math.floor(px / scale)));
        const colIdx = lz * rSpanX + lx;
        const sc = solidCount[colIdx]!;
        if (sc === 0) continue;

        let r = topR[colIdx]!;
        let g = topG[colIdx]!;
        let bChannel = topB[colIdx]!;

        const myY = maxY[colIdx]!;
        const yW = lx > 0 && solidCount[colIdx - 1]! > 0 ? maxY[colIdx - 1]! : myY;
        const yE = lx < rSpanX - 1 && solidCount[colIdx + 1]! > 0 ? maxY[colIdx + 1]! : myY;
        const yN = lz > 0 && solidCount[colIdx - rSpanX]! > 0 ? maxY[colIdx - rSpanX]! : myY;
        const yS = lz < rSpanZ - 1 && solidCount[colIdx + rSpanX]! > 0 ? maxY[colIdx + rSpanX]! : myY;

        const dh = (yW - yE) + (yN - yS);
        const clampedDh = Math.max(-12, Math.min(12, dh));
        const shade = clampedDh * 4;
        const elevBoost = (myY - groundY) * 1.2;

        r = Math.max(0, Math.min(255, r + shade + elevBoost));
        g = Math.max(0, Math.min(255, g + shade + elevBoost));
        bChannel = Math.max(0, Math.min(255, bChannel + shade + elevBoost));

        if (Math.abs(dh) >= 4) {
          r = Math.round(r * 0.82);
          g = Math.round(g * 0.82);
          bChannel = Math.round(bChannel * 0.82);
        }

        if (structureIndex) {
          const sIdx = structureIndex[colIdx]!;
          if (sIdx >= 0) {
            const scColor = STRUCTURE_COLORS[sIdx % STRUCTURE_COLORS.length]!;
            r = Math.round(r * 0.88 + scColor[0] * 0.12);
            g = Math.round(g * 0.88 + scColor[1] * 0.12);
            bChannel = Math.round(bChannel * 0.88 + scColor[2] * 0.12);
          }
        }

        const wx = b.min[0] + lx;
        if (isZGrid || wx % 16 === 0) {
          r = Math.round(r * 0.85);
          g = Math.round(g * 0.85);
          bChannel = Math.round(bChannel * 0.85);
        }

        canvas.setPixel(offX + px, offY + py, r, g, bChannel, 255);
      }
    }
  }

  // Draw detected structure bounding boxes and labels
  if (annotate) {
    for (let i = 0; i < analysis.structures.length; i++) {
      const st = analysis.structures[i]!;
      const sx = offX + Math.round((st.bounds.min[0] - b.min[0]) * scale);
      const sy = offY + Math.round((st.bounds.min[2] - b.min[2]) * scale);
      const sw = Math.max(2, Math.round((st.bounds.maxExclusive[0] - st.bounds.min[0]) * scale));
      const sh = Math.max(2, Math.round((st.bounds.maxExclusive[2] - st.bounds.min[2]) * scale));

      const col = STRUCTURE_COLORS[i % STRUCTURE_COLORS.length]!;
      canvas.drawRect(sx, sy, sw, sh, col[0], col[1], col[2], 255);

      // Draw label S1, S2
      canvas.drawText(st.id, sx + 2, sy + 2, col, [10, 14, 20]);
    }

    // Highlight regions
    for (let i = 0; i < highlightRegions.length; i++) {
      const reg = highlightRegions[i]!;
      const rx = offX + Math.round((reg.bounds.min[0] - b.min[0]) * scale);
      const ry = offY + Math.round((reg.bounds.min[2] - b.min[2]) * scale);
      const rw = Math.max(2, Math.round((reg.bounds.maxExclusive[0] - reg.bounds.min[0]) * scale));
      const rh = Math.max(2, Math.round((reg.bounds.maxExclusive[2] - reg.bounds.min[2]) * scale));

      canvas.drawRect(rx, ry, rw, rh, 255, 240, 50, 255);
      canvas.drawText(reg.name || `R${i + 1}`, rx + 2, ry + 2, [255, 240, 50], [20, 20, 20]);
    }
  }

  // Compass indicator
  canvas.drawText('^ N (-Z)', vx + vw - 75, vy + 9, [140, 220, 255]);
}

function renderIsometricPanel(
  canvas: PixelCanvas,
  analysis: SchematicVisualAnalysis,
  vx: number,
  vy: number,
  vw: number,
  vh: number,
  annotate: boolean,
  highlightRegions: Array<{ name: string; bounds: Bounds3i }>,
): void {
  // Title Bar
  canvas.fillRect(vx, vy, vw, 26, 24, 30, 42, 255);
  canvas.drawLine(vx, vy + 26, vx + vw, vy + 26, 50, 62, 85, 255);
  canvas.drawText('3D ISOMETRIC VIEW', vx + 10, vy + 9, [255, 215, 100]);

  const innerX = vx + 10;
  const innerY = vy + 34;
  const innerW = vw - 20;
  const innerH = vh - 60;

  const b = analysis.bounds;
  const groundY = analysis.groundLevelY;

  // Axonometric projection bounds of the 8 corners:
  // isoX = (x - z)
  // isoY = (x + z) * 0.5 - (y - groundY) * 1.0
  const corners: Array<[number, number, number]> = [
    [b.min[0], b.min[1], b.min[2]],
    [b.maxExclusive[0], b.min[1], b.min[2]],
    [b.min[0], b.maxExclusive[1], b.min[2]],
    [b.maxExclusive[0], b.maxExclusive[1], b.min[2]],
    [b.min[0], b.min[1], b.maxExclusive[2]],
    [b.maxExclusive[0], b.min[1], b.maxExclusive[2]],
    [b.min[0], b.maxExclusive[1], b.maxExclusive[2]],
    [b.maxExclusive[0], b.maxExclusive[1], b.maxExclusive[2]],
  ];

  let minProjX = Infinity, maxProjX = -Infinity;
  let minProjY = Infinity, maxProjY = -Infinity;

  for (const c of corners) {
    const px = c[0] - c[2];
    const py = (c[0] + c[2]) * 0.5 - (c[1] - groundY) * 1.0;
    if (px < minProjX) minProjX = px;
    if (px > maxProjX) maxProjX = px;
    if (py < minProjY) minProjY = py;
    if (py > maxProjY) maxProjY = py;
  }

  const projW = Math.max(1, maxProjX - minProjX);
  const projH = Math.max(1, maxProjY - minProjY);

  const scale = Math.min(innerW / projW, innerH / projH);
  const offX = innerX + Math.floor((innerW - projW * scale) / 2) - minProjX * scale;
  const offY = innerY + Math.floor((innerH - projH * scale) / 2) - minProjY * scale;

  function project(x: number, y: number, z: number): [number, number] {
    const px = x - z;
    const py = (x + z) * 0.5 - (y - groundY) * 1.0;
    return [Math.round(offX + px * scale), Math.round(offY + py * scale)];
  }

  // Draw ground grid plane
  const p00 = project(b.min[0], groundY, b.min[2]);
  const p10 = project(b.maxExclusive[0], groundY, b.min[2]);
  const p11 = project(b.maxExclusive[0], groundY, b.maxExclusive[2]);
  const p01 = project(b.min[0], groundY, b.maxExclusive[2]);

  canvas.drawLine(p00[0], p00[1], p10[0], p10[1], 40, 50, 70, 255);
  canvas.drawLine(p10[0], p10[1], p11[0], p11[1], 40, 50, 70, 255);
  canvas.drawLine(p11[0], p11[1], p01[0], p01[1], 40, 50, 70, 255);
  canvas.drawLine(p01[0], p01[1], p00[0], p00[1], 40, 50, 70, 255);

  const rg = analysis._renderGrid ?? analysis.renderGrid;
  if (rg) {
    const { spanX: rSpanX, spanZ: rSpanZ, maxY, solidCount, topR, topG, topB, wallR, wallG, wallB } = rg;
    const step = Math.max(1, Math.floor(1 / Math.max(0.2, scale)));
    const colW = Math.max(1, Math.ceil(scale * step));
    const topH = Math.max(1, Math.ceil(scale * 0.6 * step));

    // Iterate back-to-front by sum = lx + lz
    const maxSum = (rSpanX - 1) + (rSpanZ - 1);
    for (let sum = 0; sum <= maxSum; sum += step) {
      const minLZ = Math.max(0, sum - (rSpanX - 1));
      const maxLZ = Math.min(rSpanZ - 1, sum);
      const startLZ = minLZ + ((step - (minLZ % step)) % step);

      for (let lz = startLZ; lz <= maxLZ; lz += step) {
        const lx = sum - lz;
        if (lx < 0 || lx >= rSpanX) continue;
        const colIdx = lz * rSpanX + lx;
        if (solidCount[colIdx]! === 0) continue;

        const topY = maxY[colIdx]!;
        const wx = b.min[0] + lx;
        const wz = b.min[2] + lz;

        // Exposed vertical drop on front-right (+X) and front-left (+Z)
        const nX = (lx + step < rSpanX && solidCount[colIdx + step]! > 0) ? maxY[colIdx + step]! : (groundY - 2);
        const nZ = (lz + step < rSpanZ && solidCount[colIdx + step * rSpanX]! > 0) ? maxY[colIdx + step * rSpanX]! : (groundY - 2);
        const minDropY = Math.max(groundY - 2, Math.min(nX, nZ));

        const pTop = project(wx, topY, wz);
        const pBot = project(wx, minDropY, wz);

        // Vertical wall strip
        if (pBot[1] > pTop[1]) {
          const wr = Math.round(wallR[colIdx]! * 0.72);
          const wg = Math.round(wallG[colIdx]! * 0.72);
          const wb = Math.round(wallB[colIdx]! * 0.72);
          canvas.fillRect(pTop[0], pTop[1], colW, pBot[1] - pTop[1], wr, wg, wb, 255);
        }

        // Top surface with hillshade
        const yW = lx > 0 && solidCount[colIdx - 1]! > 0 ? maxY[colIdx - 1]! : topY;
        const yE = lx < rSpanX - 1 && solidCount[colIdx + 1]! > 0 ? maxY[colIdx + 1]! : topY;
        const yN = lz > 0 && solidCount[colIdx - rSpanX]! > 0 ? maxY[colIdx - rSpanX]! : topY;
        const yS = lz < rSpanZ - 1 && solidCount[colIdx + rSpanX]! > 0 ? maxY[colIdx + rSpanX]! : topY;

        const dh = (yW - yE) + (yN - yS);
        const shade = Math.max(-12, Math.min(12, dh)) * 3;
        const tr = Math.max(0, Math.min(255, topR[colIdx]! + shade));
        const tg = Math.max(0, Math.min(255, topG[colIdx]! + shade));
        const tb = Math.max(0, Math.min(255, topB[colIdx]! + shade));

        canvas.fillRect(pTop[0], pTop[1] - Math.floor(topH / 2), colW, topH, tr, tg, tb, 255);
      }
    }
  }

  // Draw structure roof wireframes (for the top 15 structures) and stamp S1..S15 labels at roof centroid
  const numAnnotated = Math.min(15, analysis.structures.length);
  for (let i = 0; i < numAnnotated; i++) {
    const st = analysis.structures[i]!;
    const sb = st.bounds;
    const col = STRUCTURE_COLORS[i % STRUCTURE_COLORS.length]!;

    const b00 = project(sb.min[0], sb.min[1], sb.min[2]);
    const b10 = project(sb.maxExclusive[0], sb.min[1], sb.min[2]);
    const b11 = project(sb.maxExclusive[0], sb.min[1], sb.maxExclusive[2]);
    const b01 = project(sb.min[0], sb.min[1], sb.maxExclusive[2]);

    const t00 = project(sb.min[0], sb.maxExclusive[1], sb.min[2]);
    const t10 = project(sb.maxExclusive[0], sb.maxExclusive[1], sb.min[2]);
    const t11 = project(sb.maxExclusive[0], sb.maxExclusive[1], sb.maxExclusive[2]);
    const t01 = project(sb.min[0], sb.maxExclusive[1], sb.maxExclusive[2]);

    // Footprint
    canvas.drawLine(b00[0], b00[1], b10[0], b10[1], col[0] * 0.4, col[1] * 0.4, col[2] * 0.4, 255);
    canvas.drawLine(b10[0], b10[1], b11[0], b11[1], col[0] * 0.4, col[1] * 0.4, col[2] * 0.4, 255);
    canvas.drawLine(b11[0], b11[1], b01[0], b01[1], col[0] * 0.4, col[1] * 0.4, col[2] * 0.4, 255);
    canvas.drawLine(b01[0], b01[1], b00[0], b00[1], col[0] * 0.4, col[1] * 0.4, col[2] * 0.4, 255);

    // Vertical pillars
    canvas.drawLine(b00[0], b00[1], t00[0], t00[1], col[0] * 0.6, col[1] * 0.6, col[2] * 0.6, 255);
    canvas.drawLine(b10[0], b10[1], t10[0], t10[1], col[0] * 0.8, col[1] * 0.8, col[2] * 0.8, 255);
    canvas.drawLine(b11[0], b11[1], t11[0], t11[1], col[0], col[1], col[2], 255);
    canvas.drawLine(b01[0], b01[1], t01[0], t01[1], col[0] * 0.7, col[1] * 0.7, col[2] * 0.7, 255);

    // Roof wireframe
    canvas.drawLine(t00[0], t00[1], t10[0], t10[1], col[0], col[1], col[2], 255);
    canvas.drawLine(t10[0], t10[1], t11[0], t11[1], col[0], col[1], col[2], 255);
    canvas.drawLine(t11[0], t11[1], t01[0], t01[1], col[0], col[1], col[2], 255);
    canvas.drawLine(t01[0], t01[1], t00[0], t00[1], col[0], col[1], col[2], 255);

    // Stamp structure ID at roof centroid
    if (annotate) {
      const roofMid = project(st.centroid[0], sb.maxExclusive[1], st.centroid[2]);
      canvas.drawText(st.id, roofMid[0] - 6, roofMid[1] - 8, col, [10, 14, 20]);
    }
  }

  // Highlight regions in 3D isometric
  for (let i = 0; i < highlightRegions.length; i++) {
    const reg = highlightRegions[i]!;
    const rb = reg.bounds;
    const r00 = project(rb.min[0], rb.maxExclusive[1], rb.min[2]);
    const r10 = project(rb.maxExclusive[0], rb.maxExclusive[1], rb.min[2]);
    const r11 = project(rb.maxExclusive[0], rb.maxExclusive[1], rb.maxExclusive[2]);
    const r01 = project(rb.min[0], rb.maxExclusive[1], rb.maxExclusive[2]);

    canvas.drawLine(r00[0], r00[1], r10[0], r10[1], 255, 240, 50, 255);
    canvas.drawLine(r10[0], r10[1], r11[0], r11[1], 255, 240, 50, 255);
    canvas.drawLine(r11[0], r11[1], r01[0], r01[1], 255, 240, 50, 255);
    canvas.drawLine(r01[0], r01[1], r00[0], r00[1], 255, 240, 50, 255);

    const mid = project(
      Math.floor((rb.min[0] + rb.maxExclusive[0]) / 2),
      rb.maxExclusive[1],
      Math.floor((rb.min[2] + rb.maxExclusive[2]) / 2),
    );
    canvas.drawText(reg.name || `R${i + 1}`, mid[0] - 6, mid[1] - 8, [255, 240, 50], [20, 20, 20]);
  }
}

function renderElevationPanel(
  canvas: PixelCanvas,
  analysis: SchematicVisualAnalysis,
  vx: number,
  vy: number,
  vw: number,
  vh: number,
  elevation: 'front' | 'side',
  annotate: boolean,
): void {
  const isFront = elevation === 'front';
  const title = isFront ? 'FRONT ELEVATION (LOOKING SOUTH)' : 'SIDE ELEVATION (LOOKING WEST)';

  canvas.fillRect(vx, vy, vw, 26, 24, 30, 42, 255);
  canvas.drawLine(vx, vy + 26, vx + vw, vy + 26, 50, 62, 85, 255);
  canvas.drawText(title, vx + 10, vy + 9, [140, 220, 255]);

  const innerX = vx + 10;
  const innerY = vy + 34;
  const innerW = vw - 20;
  const innerH = vh - 60;

  const b = analysis.bounds;
  const horizSpan = isFront ? Math.max(1, b.maxExclusive[0] - b.min[0]) : Math.max(1, b.maxExclusive[2] - b.min[2]);
  const vertSpan = Math.max(1, b.maxExclusive[1] - b.min[1]);

  const scale = Math.min(innerW / horizSpan, innerH / vertSpan);
  const renderW = Math.round(horizSpan * scale);
  const renderH = Math.round(vertSpan * scale);
  const offX = innerX + Math.floor((innerW - renderW) / 2);
  const offY = innerY + Math.floor((innerH - renderH) / 2);

  // Ground line
  const groundScreenY = offY + Math.round((b.maxExclusive[1] - analysis.groundLevelY) * scale);
  canvas.drawLine(offX, groundScreenY, offX + renderW, groundScreenY, 60, 140, 70, 255);

  const rg = analysis._renderGrid ?? analysis.renderGrid;
  if (rg) {
    const { spanX: rSpanX, spanZ: rSpanZ, maxY, solidCount, topR, topG, topB, wallR, wallG, wallB } = rg;
    const groundY = analysis.groundLevelY;

    if (isFront) {
      for (let lx = 0; lx < rSpanX; lx++) {
        let rayMaxY = -1000000;
        let bestTopR = 120, bestTopG = 120, bestTopB = 120;
        let bestWallR = 100, bestWallG = 100, bestWallB = 100;

        for (let lz = 0; lz < rSpanZ; lz++) {
          const colIdx = lz * rSpanX + lx;
          if (solidCount[colIdx]! === 0) continue;
          if (maxY[colIdx]! > rayMaxY) {
            rayMaxY = maxY[colIdx]!;
            bestTopR = topR[colIdx]!;
            bestTopG = topG[colIdx]!;
            bestTopB = topB[colIdx]!;
            bestWallR = wallR[colIdx]!;
            bestWallG = wallG[colIdx]!;
            bestWallB = wallB[colIdx]!;
          }
        }

        if (rayMaxY > groundY) {
          const sx0 = offX + Math.round(lx * scale);
          const sx1 = offX + Math.round((lx + 1) * scale);
          const barW = Math.max(1, sx1 - sx0);
          const syTop = offY + Math.round((b.maxExclusive[1] - rayMaxY) * scale);
          const syBot = groundScreenY;
          if (syBot > syTop) {
            const wr = Math.round(bestWallR * 0.85);
            const wg = Math.round(bestWallG * 0.85);
            const wb = Math.round(bestWallB * 0.85);
            canvas.fillRect(sx0, syTop, barW, syBot - syTop, wr, wg, wb, 255);
            canvas.fillRect(sx0, syTop, barW, Math.max(1, Math.round(scale)), bestTopR, bestTopG, bestTopB, 255);
          }
        }
      }
    } else {
      for (let lz = 0; lz < rSpanZ; lz++) {
        let rayMaxY = -1000000;
        let bestTopR = 120, bestTopG = 120, bestTopB = 120;
        let bestWallR = 100, bestWallG = 100, bestWallB = 100;

        for (let lx = 0; lx < rSpanX; lx++) {
          const colIdx = lz * rSpanX + lx;
          if (solidCount[colIdx]! === 0) continue;
          if (maxY[colIdx]! > rayMaxY) {
            rayMaxY = maxY[colIdx]!;
            bestTopR = topR[colIdx]!;
            bestTopG = topG[colIdx]!;
            bestTopB = topB[colIdx]!;
            bestWallR = wallR[colIdx]!;
            bestWallG = wallG[colIdx]!;
            bestWallB = wallB[colIdx]!;
          }
        }

        if (rayMaxY > groundY) {
          const sz0 = offX + Math.round(lz * scale);
          const sz1 = offX + Math.round((lz + 1) * scale);
          const barW = Math.max(1, sz1 - sz0);
          const syTop = offY + Math.round((b.maxExclusive[1] - rayMaxY) * scale);
          const syBot = groundScreenY;
          if (syBot > syTop) {
            const wr = Math.round(bestWallR * 0.85);
            const wg = Math.round(bestWallG * 0.85);
            const wb = Math.round(bestWallB * 0.85);
            canvas.fillRect(sz0, syTop, barW, syBot - syTop, wr, wg, wb, 255);
            canvas.fillRect(sz0, syTop, barW, Math.max(1, Math.round(scale)), bestTopR, bestTopG, bestTopB, 255);
          }
        }
      }
    }
  }

  if (annotate) {
    for (let i = 0; i < analysis.structures.length; i++) {
      const st = analysis.structures[i]!;
      const col = STRUCTURE_COLORS[i % STRUCTURE_COLORS.length]!;

      const minH = isFront ? st.bounds.min[0] - b.min[0] : st.bounds.min[2] - b.min[2];
      const maxH = isFront ? st.bounds.maxExclusive[0] - b.min[0] : st.bounds.maxExclusive[2] - b.min[2];
      const minY = st.bounds.min[1] - b.min[1];
      const maxY = st.bounds.maxExclusive[1] - b.min[1];

      const sx = offX + Math.round(minH * scale);
      const sy = offY + Math.round((vertSpan - maxY) * scale);
      const sw = Math.max(2, Math.round((maxH - minH) * scale));
      const sh = Math.max(2, Math.round((maxY - minY) * scale));

      canvas.drawRect(sx, sy, sw, sh, col[0], col[1], col[2], 255);
      canvas.drawText(st.id, sx + 2, sy + 2, col, [10, 14, 20]);
    }
  }
}

// ============================================================================
// 7. Pure-TS PNG Encoder & Adler32 / CRC32
// ============================================================================

const CRC_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    if (c & 1) c = 0xedb88320 ^ (c >>> 1);
    else c = c >>> 1;
  }
  CRC_TABLE[n] = c >>> 0;
}

function crc32(buf: Uint8Array, offset = 0, length = buf.length): number {
  let c = 0xffffffff;
  const end = offset + length;
  for (let i = offset; i < end; i++) {
    c = CRC_TABLE[(c ^ buf[i]!) & 0xff]! ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function adler32(buf: Uint8Array): number {
  let a = 1;
  let b = 0;
  const MOD = 65521;
  const len = buf.length;
  for (let i = 0; i < len; i++) {
    a = (a + buf[i]!) % MOD;
    b = (b + a) % MOD;
  }
  return ((b << 16) | a) >>> 0;
}

export function encodeRgbaToPng(
  rgba: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
): Uint8Array {
  // Unfiltered raw scanline data: each scanline starts with filter byte 0 (None)
  const scanlineLen = 1 + width * 4;
  const rawData = new Uint8Array(height * scanlineLen);

  for (let y = 0; y < height; y++) {
    const rawOffset = y * scanlineLen;
    rawData[rawOffset] = 0; // Filter 0: None
    const srcOffset = y * width * 4;
    rawData.set(rgba.subarray(srcOffset, srcOffset + width * 4), rawOffset + 1);
  }

  // Pure-TS Deflate: uncompressed stored blocks (BTYPE=00, max 65535 bytes per block)
  const maxBlockLen = 65535;
  const rawLen = rawData.length;
  const numBlocks = Math.ceil(rawLen / maxBlockLen) || 1;
  const zlibPayloadLen = 2 + numBlocks * 5 + rawLen + 4; // CMF/FLG (2) + blocks (5*n) + data + Adler32 (4)
  const zlibBuf = new Uint8Array(zlibPayloadLen);

  // zlib header
  zlibBuf[0] = 0x78; // CMF: deflate, 32k window
  zlibBuf[1] = 0x01; // FLG: default compression, check bits valid

  let zPos = 2;
  let rPos = 0;

  for (let b = 0; b < numBlocks; b++) {
    const chunkLen = Math.min(maxBlockLen, rawLen - rPos);
    const isFinal = (b === numBlocks - 1);

    zlibBuf[zPos++] = isFinal ? 0x01 : 0x00; // BFINAL, BTYPE=00
    zlibBuf[zPos++] = chunkLen & 0xff;
    zlibBuf[zPos++] = (chunkLen >> 8) & 0xff;
    const nlen = (~chunkLen) & 0xffff;
    zlibBuf[zPos++] = nlen & 0xff;
    zlibBuf[zPos++] = (nlen >> 8) & 0xff;

    zlibBuf.set(rawData.subarray(rPos, rPos + chunkLen), zPos);
    zPos += chunkLen;
    rPos += chunkLen;
  }

  // Adler-32
  const adler = adler32(rawData);
  zlibBuf[zPos++] = (adler >> 24) & 0xff;
  zlibBuf[zPos++] = (adler >> 16) & 0xff;
  zlibBuf[zPos++] = (adler >> 8) & 0xff;
  zlibBuf[zPos++] = adler & 0xff;

  // Build PNG chunks
  // Magic: 8 bytes
  // IHDR: 4 (len=13) + 4 (type) + 13 (data) + 4 (crc) = 25 bytes
  // IDAT: 4 (len) + 4 (type) + zlibBuf.length (data) + 4 (crc) = 12 + zlibBuf.length
  // IEND: 4 (len=0) + 4 (type) + 0 + 4 (crc) = 12 bytes
  const totalPngLen = 8 + 25 + (12 + zlibBuf.length) + 12;
  const png = new Uint8Array(totalPngLen);

  let p = 0;

  // 1. Magic bytes
  png[p++] = 0x89; png[p++] = 0x50; png[p++] = 0x4e; png[p++] = 0x47;
  png[p++] = 0x0d; png[p++] = 0x0a; png[p++] = 0x1a; png[p++] = 0x0a;

  // 2. IHDR
  const ihdrLen = 13;
  png[p++] = (ihdrLen >> 24) & 0xff;
  png[p++] = (ihdrLen >> 16) & 0xff;
  png[p++] = (ihdrLen >> 8) & 0xff;
  png[p++] = ihdrLen & 0xff;

  const ihdrTypeOffset = p;
  png[p++] = 0x49; png[p++] = 0x48; png[p++] = 0x44; png[p++] = 0x52; // "IHDR"

  // Width & Height (big endian)
  png[p++] = (width >> 24) & 0xff;
  png[p++] = (width >> 16) & 0xff;
  png[p++] = (width >> 8) & 0xff;
  png[p++] = width & 0xff;

  png[p++] = (height >> 24) & 0xff;
  png[p++] = (height >> 16) & 0xff;
  png[p++] = (height >> 8) & 0xff;
  png[p++] = height & 0xff;

  png[p++] = 8; // Bit depth: 8
  png[p++] = 6; // Color type: 6 (RGBA)
  png[p++] = 0; // Compression: 0 (deflate)
  png[p++] = 0; // Filter: 0 (standard)
  png[p++] = 0; // Interlace: 0 (none)

  const ihdrCrc = crc32(png, ihdrTypeOffset, 4 + ihdrLen);
  png[p++] = (ihdrCrc >> 24) & 0xff;
  png[p++] = (ihdrCrc >> 16) & 0xff;
  png[p++] = (ihdrCrc >> 8) & 0xff;
  png[p++] = ihdrCrc & 0xff;

  // 3. IDAT
  const idatLen = zlibBuf.length;
  png[p++] = (idatLen >> 24) & 0xff;
  png[p++] = (idatLen >> 16) & 0xff;
  png[p++] = (idatLen >> 8) & 0xff;
  png[p++] = idatLen & 0xff;

  const idatTypeOffset = p;
  png[p++] = 0x49; png[p++] = 0x44; png[p++] = 0x41; png[p++] = 0x54; // "IDAT"
  png.set(zlibBuf, p);
  p += idatLen;

  const idatCrc = crc32(png, idatTypeOffset, 4 + idatLen);
  png[p++] = (idatCrc >> 24) & 0xff;
  png[p++] = (idatCrc >> 16) & 0xff;
  png[p++] = (idatCrc >> 8) & 0xff;
  png[p++] = idatCrc & 0xff;

  // 4. IEND
  png[p++] = 0; png[p++] = 0; png[p++] = 0; png[p++] = 0; // Length = 0
  png[p++] = 0x49; png[p++] = 0x45; png[p++] = 0x4e; png[p++] = 0x44; // "IEND"
  png[p++] = 0xae; png[p++] = 0x42; png[p++] = 0x60; png[p++] = 0x82; // CRC32("IEND")

  return png;
}

const B64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export function uint8ArrayToBase64(bytes: Uint8Array): string {
  let result = '';
  const len = bytes.length;
  for (let i = 0; i < len; i += 3) {
    const b0 = bytes[i]!;
    const b1 = i + 1 < len ? bytes[i + 1]! : 0;
    const b2 = i + 2 < len ? bytes[i + 2]! : 0;

    result += B64_CHARS[(b0 >> 2) & 0x3f];
    result += B64_CHARS[((b0 & 0x03) << 4) | ((b1 >> 4) & 0x0f)];
    result += i + 1 < len ? B64_CHARS[((b1 & 0x0f) << 2) | ((b2 >> 6) & 0x03)] : '=';
    result += i + 2 < len ? B64_CHARS[b2 & 0x3f] : '=';
  }
  return result;
}

// ============================================================================
// 7. Structure Query & Spatial Selection Matching
// ============================================================================

export type DetectedStructure = StructureInfo;

export function selectStructureByQuery(
  analysis: SchematicVisualAnalysis,
  query: string,
): DetectedStructure | null {
  const structures = analysis.structures;
  if (!structures || structures.length === 0) return null;

  const q = query.trim().toLowerCase();
  if (!q) return null;

  if (q === 'largest' || q === 'biggest') {
    let best = structures[0]!;
    for (let i = 1; i < structures.length; i++) {
      if (structures[i]!.voxelCount > best.voxelCount) {
        best = structures[i]!;
      }
    }
    return best;
  }

  if (q === 'tallest' || q === 'highest') {
    let best = structures[0]!;
    for (let i = 1; i < structures.length; i++) {
      if (structures[i]!.dimensions.height > best.dimensions.height) {
        best = structures[i]!;
      }
    }
    return best;
  }

  // Exact id or symbol match case-insensitively (e.g. "S1", "s1", "1", "S2")
  for (const st of structures) {
    if (st.id.toLowerCase() === q) return st;
    if (st.symbol.toLowerCase() === q) return st;
    if (st.id.toLowerCase().replace(/^s/, '') === q.replace(/^s/, '')) return st;
  }

  // Substring in name
  for (const st of structures) {
    if (st.name.toLowerCase().includes(q)) return st;
  }

  // Substring in category
  for (const st of structures) {
    if (st.category.toLowerCase().includes(q)) return st;
  }

  // Substring in summary
  for (const st of structures) {
    if (st.summary.toLowerCase().includes(q)) return st;
  }

  return null;
}

