// apps/web/src/components/McpConnectModal.tsx
// Account MCP Connect & AI Build Hub Modal (Slice M4a).
// Manages API key generation, ready-to-use MCP configuration snippets (Cursor, Claude Desktop, Antigravity, Windsurf),
// on-demand procedural 3D building (structures & geometric shapes), and live AI activity feed with 50+ MCP tool reference.

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import type { AuthUser } from '../client/auth-client.ts';

// ============================================================================
// Types
// ============================================================================

export interface ApiKeyRecord {
  id: string;
  name: string;
  keyPrefix: string;
  createdAt: string | number;
  lastUsedAt?: string | number | null;
}

export interface NewlyCreatedApiKey {
  id: string;
  name: string;
  rawKey: string;
  keyPrefix: string;
}

export interface McpActivityItem {
  id?: string;
  tool: string;
  summary: string;
  changedCells?: number;
  revision?: number;
  createdAt: string | number;
}

export interface McpToolDoc {
  name: string;
  category: string;
  summary: string;
  exampleJson: string;
}

export interface McpConnectModalProps {
  isOpen: boolean;
  onClose: () => void;
  authUser: AuthUser | null;
  onRequestSignIn: () => void;
  activeProjectId: string | null;
  activeSchematicId: string | null;
  defaultPosition?: [number, number, number];
  onMcpMutationComplete?: () => Promise<void> | void;
  liveSyncEnabled?: boolean;
  onToggleLiveSync?: (enabled: boolean) => void;
  onLocalGenerateStructure?: (spec: {
    structure: string;
    style: string;
    position: [number, number, number];
    name?: string;
  }) => Promise<{ placementId?: string; blockCount?: number } | void> | { placementId?: string; blockCount?: number } | void;
  onLocalGenerateShape?: (spec: {
    shape: string;
    block: string;
    position: [number, number, number];
    radius?: number;
    height?: number;
    hollow?: boolean;
    name?: string;
  }) => Promise<{ placementId?: string; blockCount?: number } | void> | { placementId?: string; blockCount?: number } | void;
}

type MainTab = 'keys' | 'builder' | 'activity';
type SnippetTab = 'http' | 'stdio';

// ============================================================================
// Tool Reference Catalog (50+ MCP Tools)
// ============================================================================

const MCP_TOOLS_CATALOG: McpToolDoc[] = [
  // --- Account & Projects ---
  {
    name: 'list_projects',
    category: 'Account & Projects',
    summary: 'List all cloud projects and schematics in the authenticated account.',
    exampleJson: '{\n  "jsonrpc": "2.0",\n  "method": "tools/call",\n  "params": { "name": "list_projects", "arguments": {} }\n}',
  },
  {
    name: 'get_project',
    category: 'Account & Projects',
    summary: 'Get detailed metadata, timestamps, and schematic list for a project.',
    exampleJson: '{\n  "name": "get_project",\n  "arguments": { "projectId": "proj_123" }\n}',
  },
  {
    name: 'create_project',
    category: 'Account & Projects',
    summary: 'Create a new project folder with an initial schematic.',
    exampleJson: '{\n  "name": "create_project",\n  "arguments": { "projectName": "Medieval Castle", "schematicName": "main.schem" }\n}',
  },
  {
    name: 'delete_project',
    category: 'Account & Projects',
    summary: 'Permanently remove a cloud project and its associated schematics.',
    exampleJson: '{\n  "name": "delete_project",\n  "arguments": { "projectId": "proj_123" }\n}',
  },
  {
    name: 'list_schematics',
    category: 'Account & Projects',
    summary: 'List all schematics stored inside a given project.',
    exampleJson: '{\n  "name": "list_schematics",\n  "arguments": { "projectId": "proj_123" }\n}',
  },
  {
    name: 'open_schematic',
    category: 'Account & Projects',
    summary: 'Load a schematic into the active editor session.',
    exampleJson: '{\n  "name": "open_schematic",\n  "arguments": { "projectId": "proj_123", "schematicId": "schem_abc" }\n}',
  },
  {
    name: 'save_schematic',
    category: 'Account & Projects',
    summary: 'Flush pending voxel modifications and placements to cloud storage.',
    exampleJson: '{\n  "name": "save_schematic",\n  "arguments": { "projectId": "proj_123", "schematicId": "schem_abc" }\n}',
  },
  {
    name: 'export_schematic',
    category: 'Account & Projects',
    summary: 'Export schematic bytes in Sponge (.schem), Litematica (.litematic), or vanilla .nbt format.',
    exampleJson: '{\n  "name": "export_schematic",\n  "arguments": { "format": "sponge_v3" }\n}',
  },
  {
    name: 'import_schematic',
    category: 'Account & Projects',
    summary: 'Import and parse an external schematic file into the current workspace.',
    exampleJson: '{\n  "name": "import_schematic",\n  "arguments": { "projectId": "proj_123", "format": "auto" }\n}',
  },
  {
    name: 'get_schematic_metadata',
    category: 'Account & Projects',
    summary: 'Inspect dimensions, total voxel count, block palette size, and placement hierarchy.',
    exampleJson: '{\n  "name": "get_schematic_metadata",\n  "arguments": { "projectId": "proj_123", "schematicId": "schem_abc" }\n}',
  },

  // --- Selections & Regions ---
  {
    name: 'get_selection',
    category: 'Selections & Regions',
    summary: 'Read the currently selected 3D bounding box [min, max] in world space.',
    exampleJson: '{\n  "name": "get_selection",\n  "arguments": {}\n}',
  },
  {
    name: 'set_selection',
    category: 'Selections & Regions',
    summary: 'Set the active 3D selection bounding box from coordinates.',
    exampleJson: '{\n  "name": "set_selection",\n  "arguments": { "min": [0, 64, 0], "max": [16, 80, 16] }\n}',
  },
  {
    name: 'expand_selection',
    category: 'Selections & Regions',
    summary: 'Expand or contract active selection along axes (+X, -X, +Y, -Y, +Z, -Z).',
    exampleJson: '{\n  "name": "expand_selection",\n  "arguments": { "direction": "up", "amount": 5 }\n}',
  },
  {
    name: 'shift_selection',
    category: 'Selections & Regions',
    summary: 'Shift selection boundaries by offset vector without modifying voxel content.',
    exampleJson: '{\n  "name": "shift_selection",\n  "arguments": { "offset": [10, 0, 0] }\n}',
  },
  {
    name: 'select_all',
    category: 'Selections & Regions',
    summary: 'Expand selection to encompass all non-air blocks across all placements.',
    exampleJson: '{\n  "name": "select_all",\n  "arguments": {}\n}',
  },
  {
    name: 'clear_selection',
    category: 'Selections & Regions',
    summary: 'Clear the active 3D bounding box selection.',
    exampleJson: '{\n  "name": "clear_selection",\n  "arguments": {}\n}',
  },
  {
    name: 'count_selection_blocks',
    category: 'Selections & Regions',
    summary: 'Count total non-air blocks and block palette distribution inside selection.',
    exampleJson: '{\n  "name": "count_selection_blocks",\n  "arguments": {}\n}',
  },
  {
    name: 'get_region_bounds',
    category: 'Selections & Regions',
    summary: 'Compute the minimum bounding box enclosing all placed voxels.',
    exampleJson: '{\n  "name": "get_region_bounds",\n  "arguments": {}\n}',
  },

  // --- Voxel Editing ---
  {
    name: 'get_voxel',
    category: 'Voxel Editing',
    summary: 'Query the exact block state at world coordinate [x, y, z].',
    exampleJson: '{\n  "name": "get_voxel",\n  "arguments": { "position": [10, 64, 15] }\n}',
  },
  {
    name: 'set_voxel',
    category: 'Voxel Editing',
    summary: 'Place or delete a single block at coordinate [x, y, z].',
    exampleJson: '{\n  "name": "set_voxel",\n  "arguments": { "position": [10, 64, 15], "block": "minecraft:stone_bricks" }\n}',
  },
  {
    name: 'set_voxels',
    category: 'Voxel Editing',
    summary: 'Batch place multiple block coordinates simultaneously.',
    exampleJson: '{\n  "name": "set_voxels",\n  "arguments": {\n    "voxels": [\n      { "pos": [0, 64, 0], "block": "minecraft:stone" },\n      { "pos": [0, 65, 0], "block": "minecraft:torch" }\n    ]\n  }\n}',
  },
  {
    name: 'fill_region',
    category: 'Voxel Editing',
    summary: 'Fill the selected region with a block state (replaces non-air or all).',
    exampleJson: '{\n  "name": "fill_region",\n  "arguments": {\n    "min": [0, 64, 0],\n    "max": [10, 70, 10],\n    "block": "minecraft:oak_planks"\n  }\n}',
  },
  {
    name: 'replace_voxels',
    category: 'Voxel Editing',
    summary: 'Replace all occurrences of block A with block B inside a region.',
    exampleJson: '{\n  "name": "replace_voxels",\n  "arguments": {\n    "fromBlock": "minecraft:cobblestone",\n    "toBlock": "minecraft:stone_bricks"\n  }\n}',
  },
  {
    name: 'clear_region',
    category: 'Voxel Editing',
    summary: 'Clear all voxels inside the specified region to air.',
    exampleJson: '{\n  "name": "clear_region",\n  "arguments": { "min": [0, 64, 0], "max": [10, 70, 10] }\n}',
  },
  {
    name: 'hollow_region',
    category: 'Voxel Editing',
    summary: 'Hollow out a solid region, leaving only exterior boundary walls.',
    exampleJson: '{\n  "name": "hollow_region",\n  "arguments": { "wallThickness": 1 }\n}',
  },
  {
    name: 'create_walls',
    category: 'Voxel Editing',
    summary: 'Construct vertical perimeter walls around the current selection.',
    exampleJson: '{\n  "name": "create_walls",\n  "arguments": { "block": "minecraft:polished_deepslate" }\n}',
  },
  {
    name: 'create_outline',
    category: 'Voxel Editing',
    summary: 'Build a wireframe frame along the 12 edges of the bounding box.',
    exampleJson: '{\n  "name": "create_outline",\n  "arguments": { "block": "minecraft:glowstone" }\n}',
  },
  {
    name: 'stack_region',
    category: 'Voxel Editing',
    summary: 'Repeat the selected volume N times along a given vector direction.',
    exampleJson: '{\n  "name": "stack_region",\n  "arguments": { "count": 3, "direction": [0, 10, 0] }\n}',
  },
  {
    name: 'move_region',
    category: 'Voxel Editing',
    summary: 'Cut and translate all voxels inside a region by an offset.',
    exampleJson: '{\n  "name": "move_region",\n  "arguments": { "offset": [5, 0, 5] }\n}',
  },
  {
    name: 'copy_region',
    category: 'Voxel Editing',
    summary: 'Copy a region into clipboard memory for later pasting.',
    exampleJson: '{\n  "name": "copy_region",\n  "arguments": {}\n}',
  },

  // --- Procedural Builds & Blueprints ---
  {
    name: 'generate_structure',
    category: 'Procedural Builds & Blueprints',
    summary: 'Generate architectural structures (house, tower, castle, temple, pagoda, villa, bridge, tree, fountain, island, ship).',
    exampleJson: '{\n  "name": "generate_structure",\n  "arguments": {\n    "structureType": "house",\n    "style": "medieval",\n    "position": [0, 64, 0],\n    "name": "Medieval House"\n  }\n}',
  },
  {
    name: 'generate_shape',
    category: 'Procedural Builds & Blueprints',
    summary: 'Generate 3D geometric shapes (sphere, cylinder, pyramid, cone, arch, roof, torus, box, stairs).',
    exampleJson: '{\n  "name": "generate_shape",\n  "arguments": {\n    "shapeType": "sphere",\n    "block": "minecraft:smooth_quartz",\n    "radius": 8,\n    "hollow": true,\n    "position": [0, 64, 0]\n  }\n}',
  },
  {
    name: 'extrude_region',
    category: 'Procedural Builds & Blueprints',
    summary: 'Extrude a 2D planar profile along an axis by N blocks.',
    exampleJson: '{\n  "name": "extrude_region",\n  "arguments": { "axis": "Y", "length": 15 }\n}',
  },
  {
    name: 'paste_blueprint',
    category: 'Procedural Builds & Blueprints',
    summary: 'Paste pre-authored blueprint fragments at target coordinate.',
    exampleJson: '{\n  "name": "paste_blueprint",\n  "arguments": { "blueprintId": "spiral_staircase_v1", "position": [10, 64, 10] }\n}',
  },
  {
    name: 'smooth_terrain',
    category: 'Procedural Builds & Blueprints',
    summary: 'Apply 3D smoothing or erosion cellular automata to voxel surface.',
    exampleJson: '{\n  "name": "smooth_terrain",\n  "arguments": { "iterations": 2 }\n}',
  },
  {
    name: 'generate_natural_tree',
    category: 'Procedural Builds & Blueprints',
    summary: 'Generate procedural organic tree trunks with branched foliage clusters.',
    exampleJson: '{\n  "name": "generate_natural_tree",\n  "arguments": { "species": "cherry", "height": 14, "position": [0, 64, 0] }\n}',
  },
  {
    name: 'generate_terrain_noise',
    category: 'Procedural Builds & Blueprints',
    summary: 'Generate 3D Perlin/simplex voxel noise landscape with grass top layer.',
    exampleJson: '{\n  "name": "generate_terrain_noise",\n  "arguments": { "scale": 0.05, "height": 20, "bounds": [0, 50, 0, 32, 70, 32] }\n}',
  },
  {
    name: 'generate_roof',
    category: 'Procedural Builds & Blueprints',
    summary: 'Construct pitched, gabled, or hipped roof structures over selected walls.',
    exampleJson: '{\n  "name": "generate_roof",\n  "arguments": { "roofType": "pitched", "stairBlock": "minecraft:dark_oak_stairs" }\n}',
  },
  {
    name: 'create_road_network',
    category: 'Procedural Builds & Blueprints',
    summary: 'Lay down curved or orthogonal paths using gravel, cobblestone, and stone paths.',
    exampleJson: '{\n  "name": "create_road_network",\n  "arguments": { "waypoints": [[0, 64, 0], [20, 64, 30]], "width": 3 }\n}',
  },
  {
    name: 'scaffold_building',
    category: 'Procedural Builds & Blueprints',
    summary: 'Generate multi-floor structural frame with pillars, beams, and slabs.',
    exampleJson: '{\n  "name": "scaffold_building",\n  "arguments": { "floors": 3, "floorHeight": 5, "dimensions": [12, 12] }\n}',
  },

  // --- Placements & Transforms ---
  {
    name: 'list_placements',
    category: 'Placements & Transforms',
    summary: 'Enumerate all movable schematic placements in the scene.',
    exampleJson: '{\n  "name": "list_placements",\n  "arguments": {}\n}',
  },
  {
    name: 'get_placement',
    category: 'Placements & Transforms',
    summary: 'Inspect placement coordinate position, rotation, mirror state, and bounds.',
    exampleJson: '{\n  "name": "get_placement",\n  "arguments": { "placementId": "plc_1" }\n}',
  },
  {
    name: 'create_placement',
    category: 'Placements & Transforms',
    summary: 'Instantiate a new independent movable placement from a volume or template.',
    exampleJson: '{\n  "name": "create_placement",\n  "arguments": { "name": "East Tower", "origin": [25, 64, 0] }\n}',
  },
  {
    name: 'transform_placement',
    category: 'Placements & Transforms',
    summary: 'Move, rotate (90, 180, 270 deg), or flip/mirror placements.',
    exampleJson: '{\n  "name": "transform_placement",\n  "arguments": { "placementId": "plc_1", "rotationY": 90, "mirrorX": true }\n}',
  },
  {
    name: 'duplicate_placement',
    category: 'Placements & Transforms',
    summary: 'Clone an existing placement with an offset translation.',
    exampleJson: '{\n  "name": "duplicate_placement",\n  "arguments": { "placementId": "plc_1", "offset": [30, 0, 0] }\n}',
  },
  {
    name: 'delete_placement',
    category: 'Placements & Transforms',
    summary: 'Remove a placement from the project.',
    exampleJson: '{\n  "name": "delete_placement",\n  "arguments": { "placementId": "plc_1" }\n}',
  },
  {
    name: 'merge_placements',
    category: 'Placements & Transforms',
    summary: 'Bake multiple selected placements into a single unified volume.',
    exampleJson: '{\n  "name": "merge_placements",\n  "arguments": { "placementIds": ["plc_1", "plc_2"] }\n}',
  },
  {
    name: 'align_placements',
    category: 'Placements & Transforms',
    summary: 'Align multiple placements along a common edge, coordinate, or center.',
    exampleJson: '{\n  "name": "align_placements",\n  "arguments": { "placementIds": ["plc_1", "plc_2"], "alignment": "center" }\n}',
  },
  {
    name: 'toggle_placement_visibility',
    category: 'Placements & Transforms',
    summary: 'Hide or show a placement in the 3D viewport.',
    exampleJson: '{\n  "name": "toggle_placement_visibility",\n  "arguments": { "placementId": "plc_1", "visible": false }\n}',
  },
  {
    name: 'lock_placement',
    category: 'Placements & Transforms',
    summary: 'Lock a placement to prevent accidental movement or deletion.',
    exampleJson: '{\n  "name": "lock_placement",\n  "arguments": { "placementId": "plc_1", "locked": true }\n}',
  },
];

// Block preset suggestions
const POPULAR_BLOCKS = [
  'minecraft:stone_bricks',
  'minecraft:smooth_quartz',
  'minecraft:sea_lantern',
  'minecraft:glass',
  'minecraft:oak_planks',
  'minecraft:polished_blackstone_bricks',
  'minecraft:prismarine_bricks',
  'minecraft:copper_block',
];

// ============================================================================
// Component
// ============================================================================

export function McpConnectModal({
  isOpen,
  onClose,
  authUser,
  onRequestSignIn,
  activeProjectId,
  activeSchematicId,
  defaultPosition,
  onMcpMutationComplete,
  liveSyncEnabled = false,
  onToggleLiveSync,
  onLocalGenerateStructure,
  onLocalGenerateShape,
}: McpConnectModalProps): React.ReactElement | null {
  // Modal Navigation
  const [activeTab, setActiveTab] = useState<MainTab>('keys');
  const [snippetTab, setSnippetTab] = useState<SnippetTab>('http');

  // API Key Management State
  const [keyNameInput, setKeyNameInput] = useState('My AI Agent');
  const [isGeneratingKey, setIsGeneratingKey] = useState(false);
  const [newlyCreatedKey, setNewlyCreatedKey] = useState<NewlyCreatedApiKey | null>(null);
  const [apiKeys, setApiKeys] = useState<ApiKeyRecord[]>([]);
  const [isLoadingKeys, setIsLoadingKeys] = useState(false);
  const [keyError, setKeyError] = useState<string | null>(null);
  const [customKeyOverride, setCustomKeyOverride] = useState('');

  // Procedural Builder State: Structure
  const [structureType, setStructureType] = useState('house');
  const [structureStyle, setStructureStyle] = useState('medieval');
  const [structureName, setStructureName] = useState('');
  const [structPosX, setStructPosX] = useState(defaultPosition ? defaultPosition[0] : 0);
  const [structPosY, setStructPosY] = useState(defaultPosition ? defaultPosition[1] : 64);
  const [structPosZ, setStructPosZ] = useState(defaultPosition ? defaultPosition[2] : 0);
  const [isGeneratingStructure, setIsGeneratingStructure] = useState(false);
  const [structureFeedback, setStructureFeedback] = useState<{ success: boolean; message: string } | null>(null);

  // Procedural Builder State: Shape
  const [shapeType, setShapeType] = useState('sphere');
  const [shapeBlock, setShapeBlock] = useState('minecraft:stone_bricks');
  const [shapeRadius, setShapeRadius] = useState(8);
  const [shapeHeight, setShapeHeight] = useState(12);
  const [shapeHollow, setShapeHollow] = useState(false);
  const [shapeName, setShapeName] = useState('');
  const [shapePosX, setShapePosX] = useState(defaultPosition ? defaultPosition[0] : 0);
  const [shapePosY, setShapePosY] = useState(defaultPosition ? defaultPosition[1] : 64);
  const [shapePosZ, setShapePosZ] = useState(defaultPosition ? defaultPosition[2] : 0);
  const [isGeneratingShape, setIsGeneratingShape] = useState(false);
  const [shapeFeedback, setShapeFeedback] = useState<{ success: boolean; message: string } | null>(null);

  // Live Sync & Activity State
  const [activities, setActivities] = useState<McpActivityItem[]>([]);
  const [isLoadingSync, setIsLoadingSync] = useState(false);
  const [toolSearch, setToolSearch] = useState('');
  const [activeCategoryFilter, setActiveCategoryFilter] = useState<string>('all');
  const [expandedTool, setExpandedTool] = useState<string | null>(null);

  // Clipboard Copied State tracker (maps id -> boolean)
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Update positions when defaultPosition changes
  useEffect(() => {
    if (defaultPosition) {
      setStructPosX(defaultPosition[0]);
      setStructPosY(defaultPosition[1]);
      setStructPosZ(defaultPosition[2]);
      setShapePosX(defaultPosition[0]);
      setShapePosY(defaultPosition[1]);
      setShapePosZ(defaultPosition[2]);
    }
  }, [defaultPosition]);

  // Handle Escape Key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Compute Origin
  const origin = useMemo(() => {
    if (typeof window !== 'undefined' && window.location.origin) {
      return window.location.origin;
    }
    return 'http://localhost:4321';
  }, []);

  // Compute Display Key for Snippets
  const displayApiKey = useMemo(() => {
    if (customKeyOverride.trim()) {
      return customKeyOverride.trim();
    }
    if (newlyCreatedKey) {
      return newlyCreatedKey.rawKey;
    }
    if (apiKeys.length > 0) {
      return apiKeys[0].keyPrefix + '...';
    }
    return 'ese_mcp_YOUR_API_KEY_HERE';
  }, [customKeyOverride, newlyCreatedKey, apiKeys]);

  // Clipboard helper
  const copyToClipboard = useCallback((text: string, id: string) => {
    void navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => {
      setCopiedId((curr) => (curr === id ? null : curr));
    }, 2000);
  }, []);

  // Fetch API Keys
  const fetchKeys = useCallback(async () => {
    if (!authUser) return;
    setIsLoadingKeys(true);
    setKeyError(null);
    try {
      const res = await fetch('/api/mcp/keys', {
        headers: { Accept: 'application/json' },
      });
      if (res.ok) {
        const data = (await res.json()) as { keys?: ApiKeyRecord[] } | ApiKeyRecord[];
        const list = Array.isArray(data) ? data : data.keys || [];
        setApiKeys(list);
      } else if (res.status !== 404) {
        setKeyError(`Failed to load API keys (${res.status})`);
      }
    } catch (err) {
      // Non-fatal if offline or route not ready yet
      console.warn('API keys fetch skipped or failed:', err);
    } finally {
      setIsLoadingKeys(false);
    }
  }, [authUser]);

  // Fetch Live Sync Activity
  const fetchSyncActivity = useCallback(async () => {
    setIsLoadingSync(true);
    try {
      const query = activeSchematicId ? `?schematicId=${encodeURIComponent(activeSchematicId)}` : '';
      const res = await fetch(`/api/mcp/sync${query}`, {
        headers: { Accept: 'application/json' },
      });
      if (res.ok) {
        const data = (await res.json()) as {
          recentLogs?: McpActivityItem[];
          entries?: McpActivityItem[];
          activity?: McpActivityItem[];
        } | McpActivityItem[];
        const list = Array.isArray(data) ? data : data.recentLogs || data.entries || data.activity || [];
        setActivities(list);
      }
    } catch (err) {
      console.warn('Sync activity fetch failed:', err);
    } finally {
      setIsLoadingSync(false);
    }
  }, [activeSchematicId]);

  // Load keys and sync when modal opens
  useEffect(() => {
    if (isOpen) {
      if (authUser) {
        void fetchKeys();
      }
      void fetchSyncActivity();
    }
  }, [isOpen, authUser, fetchKeys, fetchSyncActivity]);

  // Create API Key handler
  const handleGenerateKey = async () => {
    if (!authUser || isGeneratingKey) return;
    setIsGeneratingKey(true);
    setKeyError(null);
    try {
      const name = keyNameInput.trim() || 'My AI Agent';
      const res = await fetch('/api/mcp/keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ name }),
      });

      if (!res.ok) {
        let msg = `Failed to create API key (${res.status})`;
        try {
          const body = (await res.json()) as { error?: string; message?: string };
          if (body.error) msg = body.error;
          else if (body.message) msg = body.message;
        } catch {
          // ignore json parse error
        }
        throw new Error(msg);
      }

      const data = (await res.json()) as {
        key?: NewlyCreatedApiKey;
        rawKey?: string;
        id?: string;
        name?: string;
        keyPrefix?: string;
      };

      const keyObj: NewlyCreatedApiKey = data.key ?? {
        id: data.id ?? `key_${Date.now()}`,
        name: data.name ?? name,
        rawKey: data.rawKey ?? '',
        keyPrefix: data.keyPrefix ?? (data.rawKey ? data.rawKey.slice(0, 16) : 'ese_mcp_...'),
      };

      if (!keyObj.rawKey && data.rawKey) {
        keyObj.rawKey = data.rawKey;
      }

      setNewlyCreatedKey(keyObj);
      setCustomKeyOverride(keyObj.rawKey);
      void fetchKeys();
    } catch (err) {
      setKeyError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsGeneratingKey(false);
    }
  };

  // Revoke API Key handler
  const handleRevokeKey = async (id: string) => {
    if (!confirm('Are you sure you want to revoke this API key? Connected AI agents using it will be disconnected.')) {
      return;
    }
    try {
      const res = await fetch(`/api/mcp/keys/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      if (!res.ok && res.status !== 404) {
        await fetch(`/api/mcp/keys?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      }
      if (newlyCreatedKey?.id === id) {
        setNewlyCreatedKey(null);
      }
      void fetchKeys();
    } catch (err) {
      alert(`Could not revoke key: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  // Generate Procedural Structure
  const handleRunStructureBuild = async () => {
    if (isGeneratingStructure) return;
    setIsGeneratingStructure(true);
    setStructureFeedback(null);

    const pos: [number, number, number] = [Number(structPosX) || 0, Number(structPosY) || 64, Number(structPosZ) || 0];
    const name = structureName.trim() || `${structureStyle} ${structureType}`;

    try {
      let createdBlockCount = 0;
      let createdPlacementId: string | undefined;

      // 1. Try MCP endpoint if signed in and project schematic exists
      let calledRemote = false;
      let remoteError: Error | null = null;
      if (authUser && activeSchematicId) {
        try {
          const res = await fetch('/api/mcp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify({
              jsonrpc: '2.0',
              id: `gen-struct-${Date.now()}`,
              method: 'tools/call',
              params: {
                name: 'generate_structure',
                arguments: {
                  projectId: activeProjectId,
                  schematicId: activeSchematicId,
                  structureType,
                  style: structureStyle,
                  position: pos,
                  name,
                },
              },
            }),
          });
          if (res.ok) {
            const data = (await res.json()) as {
              result?: {
                content?: Array<{ type: string; text?: string }>;
                isError?: boolean;
                blockCount?: number;
                placementId?: string;
              };
            };

            if (data.result?.isError) {
              let errMsg = 'MCP server returned an error while generating structure.';
              const rawText = data.result.content?.[0]?.text;
              if (rawText) {
                try {
                  const parsed = JSON.parse(rawText) as { error?: string; message?: string };
                  errMsg = parsed.error || parsed.message || rawText;
                } catch {
                  errMsg = rawText;
                }
              }
              throw new Error(errMsg);
            }

            let textPayload: { blockCount?: number; placementId?: string } | null = null;
            const rawText = data.result?.content?.[0]?.text;
            if (rawText) {
              try {
                textPayload = JSON.parse(rawText) as { blockCount?: number; placementId?: string };
              } catch {
                // Ignore text parse errors
              }
            }

            createdBlockCount = textPayload?.blockCount ?? data.result?.blockCount ?? 0;
            createdPlacementId = textPayload?.placementId ?? data.result?.placementId;
            calledRemote = true;
          } else {
            let errMsg = `MCP server error (${res.status})`;
            try {
              const errBody = (await res.json()) as { error?: { message?: string } | string; message?: string };
              if (typeof errBody.error === 'object' && errBody.error?.message) {
                errMsg = errBody.error.message;
              } else if (typeof errBody.error === 'string') {
                errMsg = errBody.error;
              } else if (errBody.message) {
                errMsg = errBody.message;
              }
            } catch {
              // ignore
            }
            throw new Error(errMsg);
          }
        } catch (err) {
          remoteError = err instanceof Error ? err : new Error(String(err));
          // Fall through to local fallback
        }
      }

      // 2. If remote was not used or failed, use local callback
      if (!calledRemote) {
        if (onLocalGenerateStructure) {
          const res = await onLocalGenerateStructure({
            structure: structureType,
            style: structureStyle,
            position: pos,
            name,
          });
          if (res) {
            createdBlockCount = res.blockCount ?? 0;
            createdPlacementId = res.placementId;
          }
        } else if (!authUser) {
          throw new Error('Local structure generator not connected or sign-in required for cloud builds.');
        } else {
          throw remoteError || new Error('MCP server returned an error while generating structure.');
        }
      }

      // 3. Notify parent EditorIsland to reload 3D viewport
      await onMcpMutationComplete?.();

      setStructureFeedback({
        success: true,
        message: `✨ Structure generated! ${createdBlockCount > 0 ? `${createdBlockCount.toLocaleString()} blocks placed.` : ''} Placement "${name}" at [${pos.join(', ')}].`,
      });
    } catch (err) {
      setStructureFeedback({
        success: false,
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setIsGeneratingStructure(false);
    }
  };

  // Generate 3D Shape
  const handleRunShapeBuild = async () => {
    if (isGeneratingShape) return;
    setIsGeneratingShape(true);
    setShapeFeedback(null);

    const pos: [number, number, number] = [Number(shapePosX) || 0, Number(shapePosY) || 64, Number(shapePosZ) || 0];
    const name = shapeName.trim() || `${shapeType} (${shapeBlock.replace('minecraft:', '')})`;

    try {
      let createdBlockCount = 0;
      let createdPlacementId: string | undefined;

      let calledRemote = false;
      let remoteError: Error | null = null;
      if (authUser && activeSchematicId) {
        try {
          const res = await fetch('/api/mcp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify({
              jsonrpc: '2.0',
              id: `gen-shape-${Date.now()}`,
              method: 'tools/call',
              params: {
                name: 'generate_shape',
                arguments: {
                  projectId: activeProjectId,
                  schematicId: activeSchematicId,
                  shapeType,
                  block: shapeBlock.trim() || 'minecraft:stone_bricks',
                  radius: Number(shapeRadius) || 8,
                  height: Number(shapeHeight) || 12,
                  hollow: Boolean(shapeHollow),
                  position: pos,
                  name,
                },
              },
            }),
          });
          if (res.ok) {
            const data = (await res.json()) as {
              result?: {
                content?: Array<{ type: string; text?: string }>;
                isError?: boolean;
                blockCount?: number;
                placementId?: string;
              };
            };

            if (data.result?.isError) {
              let errMsg = 'MCP server returned an error while generating shape.';
              const rawText = data.result.content?.[0]?.text;
              if (rawText) {
                try {
                  const parsed = JSON.parse(rawText) as { error?: string; message?: string };
                  errMsg = parsed.error || parsed.message || rawText;
                } catch {
                  errMsg = rawText;
                }
              }
              throw new Error(errMsg);
            }

            let textPayload: { blockCount?: number; placementId?: string } | null = null;
            const rawText = data.result?.content?.[0]?.text;
            if (rawText) {
              try {
                textPayload = JSON.parse(rawText) as { blockCount?: number; placementId?: string };
              } catch {
                // Ignore text parse errors
              }
            }

            createdBlockCount = textPayload?.blockCount ?? data.result?.blockCount ?? 0;
            createdPlacementId = textPayload?.placementId ?? data.result?.placementId;
            calledRemote = true;
          } else {
            let errMsg = `MCP server error (${res.status})`;
            try {
              const errBody = (await res.json()) as { error?: { message?: string } | string; message?: string };
              if (typeof errBody.error === 'object' && errBody.error?.message) {
                errMsg = errBody.error.message;
              } else if (typeof errBody.error === 'string') {
                errMsg = errBody.error;
              } else if (errBody.message) {
                errMsg = errBody.message;
              }
            } catch {
              // ignore
            }
            throw new Error(errMsg);
          }
        } catch (err) {
          remoteError = err instanceof Error ? err : new Error(String(err));
          // Fall through to local fallback
        }
      }

      if (!calledRemote) {
        if (onLocalGenerateShape) {
          const res = await onLocalGenerateShape({
            shape: shapeType,
            block: shapeBlock.trim() || 'minecraft:stone_bricks',
            position: pos,
            radius: Number(shapeRadius) || 8,
            height: Number(shapeHeight) || 12,
            hollow: Boolean(shapeHollow),
            name,
          });
          if (res) {
            createdBlockCount = res.blockCount ?? 0;
            createdPlacementId = res.placementId;
          }
        } else if (!authUser) {
          throw new Error('Local shape generator not connected or sign-in required for cloud builds.');
        } else {
          throw remoteError || new Error('MCP server returned an error while generating shape.');
        }
      }

      await onMcpMutationComplete?.();

      setShapeFeedback({
        success: true,
        message: `✨ Shape generated! ${createdBlockCount > 0 ? `${createdBlockCount.toLocaleString()} blocks placed.` : ''} Placement "${name}" at [${pos.join(', ')}].`,
      });
    } catch (err) {
      setShapeFeedback({
        success: false,
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setIsGeneratingShape(false);
    }
  };

  // Filter MCP Tools Catalog
  const filteredTools = useMemo(() => {
    return MCP_TOOLS_CATALOG.filter((t) => {
      const matchesCategory = activeCategoryFilter === 'all' || t.category === activeCategoryFilter;
      const q = toolSearch.trim().toLowerCase();
      const matchesSearch =
        !q ||
        t.name.toLowerCase().includes(q) ||
        t.category.toLowerCase().includes(q) ||
        t.summary.toLowerCase().includes(q);
      return matchesCategory && matchesSearch;
    });
  }, [activeCategoryFilter, toolSearch]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    MCP_TOOLS_CATALOG.forEach((t) => set.add(t.category));
    return Array.from(set);
  }, []);

  if (!isOpen) return null;

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  // Config snippet strings
  const directEndpointUrl = `${origin}/api/mcp?apiKey=${displayApiKey}`;

  const queryJsonConfig = JSON.stringify(
    {
      mcpServers: {
        easyschemedit: {
          url: directEndpointUrl,
        },
      },
    },
    null,
    2
  );

  const headerJsonConfig = JSON.stringify(
    {
      mcpServers: {
        easyschemedit: {
          url: `${origin}/api/mcp`,
          headers: {
            Authorization: `Bearer ${displayApiKey}`,
          },
        },
      },
    },
    null,
    2
  );

  const stdioJsonConfig = JSON.stringify(
    {
      mcpServers: {
        easyschemedit: {
          command: 'node',
          args: ['--experimental-strip-types', 'apps/mcp-companion/src/server.ts'],
          env: {
            EASYSCHEM_API_KEY: displayApiKey,
            EASYSCHEM_SERVER_URL: origin,
          },
        },
      },
    },
    null,
    2
  );

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="AI MCP Connect & Build Hub"
      onClick={handleBackdropClick}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        backgroundColor: 'rgba(0, 0, 0, 0.78)',
        backdropFilter: 'blur(5px)',
        WebkitBackdropFilter: 'blur(5px)',
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
      }}
    >
      <div
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: '820px',
          maxHeight: '90vh',
          backgroundColor: '#14161b',
          border: '1px solid #2a2f3a',
          borderRadius: '8px',
          boxShadow: '0 20px 50px rgba(0, 0, 0, 0.75)',
          color: '#eaeaea',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          boxSizing: 'border-box',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 20px',
            backgroundColor: '#181b22',
            borderBottom: '1px solid #262b36',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexShrink: 0,
            flexWrap: 'wrap',
            gap: '10px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0, flex: '1 1 280px' }}>
            <span style={{ fontSize: '20px', flexShrink: 0 }}>⚡</span>
            <div style={{ minWidth: 0 }}>
              <h2
                style={{
                  margin: 0,
                  fontSize: '17px',
                  fontWeight: 600,
                  color: '#ffffff',
                  letterSpacing: '-0.2px',
                }}
              >
                AI Agent & MCP Hub
              </h2>
              <p
                style={{
                  margin: '2px 0 0',
                  fontSize: '12px',
                  color: '#8b929e',
                  wordBreak: 'break-word',
                }}
              >
                Connect Cursor, Claude Desktop, Antigravity or test procedural Minecraft builds
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            style={{
              background: 'transparent',
              border: 'none',
              color: '#8b929e',
              fontSize: '18px',
              cursor: 'pointer',
              padding: '6px 8px',
              borderRadius: '4px',
              lineHeight: 1,
              flexShrink: 0,
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = '#ffffff')}
            onMouseLeave={(e) => (e.currentTarget.style.color = '#8b929e')}
          >
            ✕
          </button>
        </div>

        {/* Tab Navigation */}
        <div
          role="tablist"
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '4px',
            padding: '10px 20px',
            backgroundColor: '#101217',
            borderBottom: '1px solid #232731',
            flexShrink: 0,
          }}
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'keys'}
            onClick={() => setActiveTab('keys')}
            style={tabButtonStyle(activeTab === 'keys')}
          >
            🔑 Connect & API Keys
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'builder'}
            onClick={() => setActiveTab('builder')}
            style={tabButtonStyle(activeTab === 'builder')}
          >
            ✨ AI Build & Shape Generator
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'activity'}
            onClick={() => setActiveTab('activity')}
            style={tabButtonStyle(activeTab === 'activity')}
          >
            📜 Live AI Activity & Tools (50+)
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div
          style={{
            flex: '1 1 auto',
            minHeight: 0,
            overflowY: 'auto',
            overflowX: 'hidden',
            padding: '20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '18px',
            boxSizing: 'border-box',
          }}
        >
          {/* ================================================================= */}
          {/* TAB 1: CONNECT & API KEYS */}
          {/* ================================================================= */}
          {activeTab === 'keys' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '18px', minWidth: 0 }}>
              {!authUser ? (
                // Unauthenticated guest prompt
                <div
                  style={{
                    backgroundColor: '#181b22',
                    border: '1px solid #2f3542',
                    borderRadius: '8px',
                    padding: '24px',
                    textAlign: 'center',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '12px',
                    flexShrink: 0,
                    boxSizing: 'border-box',
                    minWidth: 0,
                    maxWidth: '100%',
                  }}
                >
                  <div
                    style={{
                      width: '44px',
                      height: '44px',
                      borderRadius: '50%',
                      backgroundColor: 'rgba(59, 130, 246, 0.15)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '22px',
                      flexShrink: 0,
                    }}
                  >
                    🔒
                  </div>
                  <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600, color: '#ffffff' }}>
                    Sign In to Connect External AI Agents
                  </h3>
                  <p
                    style={{
                      margin: 0,
                      maxWidth: '520px',
                      fontSize: '13px',
                      color: '#9ca3af',
                      lineHeight: 1.5,
                    }}
                  >
                    Connecting your EasySchemEdit workspace to external AI tools like{' '}
                    <strong style={{ color: '#e2e8f0' }}>Cursor, Claude Desktop, Antigravity, Windsurf, or Claude Code</strong>{' '}
                    requires an account to generate authenticated MCP API keys.
                  </p>

                  <div
                    style={{
                      marginTop: '6px',
                      padding: '10px 14px',
                      backgroundColor: 'rgba(34, 197, 94, 0.1)',
                      border: '1px solid rgba(34, 197, 94, 0.3)',
                      borderRadius: '6px',
                      fontSize: '12px',
                      color: '#86efac',
                      maxWidth: '480px',
                      boxSizing: 'border-box',
                    }}
                  >
                    💡 <strong>Guest Mode:</strong> You can still use the built-in{' '}
                    <button
                      type="button"
                      onClick={() => setActiveTab('builder')}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#60a5fa',
                        textDecoration: 'underline',
                        cursor: 'pointer',
                        padding: 0,
                        fontWeight: 600,
                      }}
                    >
                      AI Build & Shape Generator tab
                    </button>{' '}
                    right now without signing in!
                  </div>

                  <div style={{ marginTop: '10px', display: 'flex', gap: '10px', flexWrap: 'wrap', justifyContent: 'center' }}>
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        onRequestSignIn();
                      }}
                      style={{
                        ...primaryButtonStyle,
                        padding: '10px 20px',
                        fontSize: '14px',
                        flexShrink: 0,
                      }}
                    >
                      Sign In / Create Account
                    </button>
                  </div>
                </div>
              ) : (
                // Authenticated view: Key generator & snippets
                <>
                  {/* Create API Key Bar */}
                  <div style={cardStyle}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px', marginBottom: '10px' }}>
                      <div style={{ minWidth: 0 }}>
                        <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: '#f4f4f5' }}>
                          🔑 Create New MCP API Key
                        </h3>
                        <p style={{ margin: '3px 0 0', fontSize: '12px', color: '#8b929e' }}>
                          Generate an authentication token for your local or IDE AI agent.
                        </p>
                      </div>
                    </div>

                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
                      <input
                        type="text"
                        value={keyNameInput}
                        onChange={(e) => setKeyNameInput(e.target.value)}
                        placeholder="Key Name (e.g. Cursor / Claude Desktop / Antigravity)"
                        disabled={isGeneratingKey}
                        style={{ ...inputStyle, flex: '1 1 220px', minWidth: '180px' }}
                      />
                      <button
                        type="button"
                        onClick={handleGenerateKey}
                        disabled={isGeneratingKey}
                        style={{
                          ...primaryButtonStyle,
                          whiteSpace: 'nowrap',
                          minWidth: '150px',
                          flexShrink: 0,
                        }}
                      >
                        {isGeneratingKey ? 'Generating...' : '✨ Generate Key'}
                      </button>
                    </div>

                    {keyError && (
                      <div
                        style={{
                          marginTop: '10px',
                          padding: '8px 12px',
                          backgroundColor: 'rgba(239, 68, 68, 0.15)',
                          border: '1px solid rgba(239, 68, 68, 0.3)',
                          borderRadius: '4px',
                          color: '#f87171',
                          fontSize: '12px',
                          wordBreak: 'break-word',
                        }}
                      >
                        {keyError}
                      </div>
                    )}
                  </div>

                  {/* Highlighted Newly Created Key Banner */}
                  {newlyCreatedKey && (
                    <div
                      style={{
                        backgroundColor: 'rgba(16, 185, 129, 0.1)',
                        border: '1px solid rgba(16, 185, 129, 0.4)',
                        borderRadius: '6px',
                        padding: '14px 16px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '10px',
                        flexShrink: 0,
                        boxSizing: 'border-box',
                        minWidth: 0,
                        maxWidth: '100%',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '6px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                          <span style={{ fontSize: '18px', flexShrink: 0 }}>🎉</span>
                          <strong style={{ fontSize: '13px', color: '#6ee7b7', wordBreak: 'break-word' }}>
                            New API Key Created: {newlyCreatedKey.name}
                          </strong>
                        </div>
                        <span style={{ fontSize: '11px', color: '#a7f3d0', flexShrink: 0 }}>
                          ⚠️ Copy now! This full key will not be shown again.
                        </span>
                      </div>

                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
                        <code
                          style={{
                            flex: '1 1 240px',
                            minWidth: 0,
                            backgroundColor: '#0c0d10',
                            border: '1px solid #10b981',
                            borderRadius: '4px',
                            padding: '8px 12px',
                            color: '#34d399',
                            fontFamily: "'JetBrains Mono', Consolas, monospace",
                            fontSize: '13px',
                            wordBreak: 'break-all',
                            boxSizing: 'border-box',
                          }}
                        >
                          {newlyCreatedKey.rawKey}
                        </code>
                        <button
                          type="button"
                          onClick={() => copyToClipboard(newlyCreatedKey.rawKey, 'new-raw-key')}
                          style={{
                            ...primaryButtonStyle,
                            backgroundColor: copiedId === 'new-raw-key' ? '#10b981' : '#059669',
                            whiteSpace: 'nowrap',
                            flexShrink: 0,
                          }}
                        >
                          {copiedId === 'new-raw-key' ? '✓ Copied!' : 'Copy Key'}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* One-Click MCP Config Snippets */}
                  <div style={cardStyle}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px', marginBottom: '12px' }}>
                      <div style={{ minWidth: 0, flex: '1 1 240px' }}>
                        <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: '#f4f4f5' }}>
                          📋 One-Click MCP Config Snippets
                        </h3>
                        <p style={{ margin: '3px 0 0', fontSize: '12px', color: '#8b929e' }}>
                          Copy pre-filled configuration directly into your AI assistant settings.
                        </p>
                      </div>

                      {/* Optional Key selector / input for snippet generation */}
                      <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '6px', flexShrink: 0 }}>
                        <span style={{ fontSize: '11px', color: '#64748b' }}>Key in snippet:</span>
                        <input
                          type="text"
                          value={customKeyOverride}
                          onChange={(e) => setCustomKeyOverride(e.target.value)}
                          placeholder={displayApiKey}
                          title="Override API key in snippet"
                          style={{
                            ...inputStyle,
                            width: '180px',
                            minWidth: '140px',
                            padding: '4px 8px',
                            fontSize: '11px',
                          }}
                        />
                      </div>
                    </div>

                    {/* Snippet Sub-tabs */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '12px' }}>
                      <button
                        type="button"
                        onClick={() => setSnippetTab('http')}
                        style={subTabButtonStyle(snippetTab === 'http')}
                      >
                        🌐 Streamable HTTP / URL (Cursor, Antigravity, Windsurf, Claude Code)
                      </button>
                      <button
                        type="button"
                        onClick={() => setSnippetTab('stdio')}
                        style={subTabButtonStyle(snippetTab === 'stdio')}
                      >
                        💻 Local Stdio (Claude Desktop / Companion)
                      </button>
                    </div>

                    {snippetTab === 'http' ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', minWidth: 0 }}>
                        {/* URL Option 1: Direct endpoint URL */}
                        <div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '6px', marginBottom: '4px' }}>
                            <span style={{ fontSize: '12px', fontWeight: 600, color: '#cbd5e1', minWidth: 0 }}>
                              Option A: Direct MCP Endpoint URL (Cursor / Windsurf SSE)
                            </span>
                            <button
                              type="button"
                              onClick={() => copyToClipboard(directEndpointUrl, 'copy-url')}
                              style={{ ...copyButtonStyle, flexShrink: 0 }}
                            >
                              {copiedId === 'copy-url' ? '✓ Copied URL' : 'Copy URL'}
                            </button>
                          </div>
                          <div style={codeBlockStyle}>{directEndpointUrl}</div>
                        </div>

                        {/* URL Option 2: Config JSON */}
                        <div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '6px', marginBottom: '4px' }}>
                            <span style={{ fontSize: '12px', fontWeight: 600, color: '#cbd5e1', minWidth: 0 }}>
                              Option B: mcp.json / settings.json (Query Param URL)
                            </span>
                            <button
                              type="button"
                              onClick={() => copyToClipboard(queryJsonConfig, 'copy-query-json')}
                              style={{ ...copyButtonStyle, flexShrink: 0 }}
                            >
                              {copiedId === 'copy-query-json' ? '✓ Copied JSON' : 'Copy JSON'}
                            </button>
                          </div>
                          <pre style={codeBlockStyle}>{queryJsonConfig}</pre>
                        </div>

                        {/* URL Option 3: Authorization Header JSON */}
                        <div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '6px', marginBottom: '4px' }}>
                            <span style={{ fontSize: '12px', fontWeight: 600, color: '#cbd5e1', minWidth: 0 }}>
                              Option C: Bearer Header JSON (Secure headers format)
                            </span>
                            <button
                              type="button"
                              onClick={() => copyToClipboard(headerJsonConfig, 'copy-header-json')}
                              style={{ ...copyButtonStyle, flexShrink: 0 }}
                            >
                              {copiedId === 'copy-header-json' ? '✓ Copied Header JSON' : 'Copy Header JSON'}
                            </button>
                          </div>
                          <pre style={codeBlockStyle}>{headerJsonConfig}</pre>
                        </div>
                      </div>
                    ) : (
                      // Stdio Snippet
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '6px', marginBottom: '4px' }}>
                          <span style={{ fontSize: '12px', fontWeight: 600, color: '#cbd5e1', minWidth: 0 }}>
                            claude_desktop_config.json (Local stdio command)
                          </span>
                          <button
                            type="button"
                            onClick={() => copyToClipboard(stdioJsonConfig, 'copy-stdio-json')}
                            style={{ ...copyButtonStyle, flexShrink: 0 }}
                          >
                            {copiedId === 'copy-stdio-json' ? '✓ Copied Stdio JSON' : 'Copy Stdio JSON'}
                          </button>
                        </div>
                        <pre style={codeBlockStyle}>{stdioJsonConfig}</pre>
                        <p style={{ margin: '6px 0 0', fontSize: '11px', color: '#64748b' }}>
                          Locally invokes <code>apps/mcp-companion/src/server.ts</code> with the current credentials.
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Active API Keys List */}
                  <div style={cardStyle}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px', marginBottom: '12px' }}>
                      <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: '#f4f4f5' }}>
                        Active API Keys ({apiKeys.length})
                      </h3>
                      <button
                        type="button"
                        onClick={fetchKeys}
                        disabled={isLoadingKeys}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#60a5fa',
                          fontSize: '12px',
                          cursor: 'pointer',
                          flexShrink: 0,
                        }}
                      >
                        {isLoadingKeys ? 'Refreshing...' : '↻ Refresh List'}
                      </button>
                    </div>

                    {apiKeys.length === 0 ? (
                      <p style={{ margin: 0, fontSize: '12px', color: '#64748b', fontStyle: 'italic' }}>
                        No API keys active. Generate one above to connect your AI assistant.
                      </p>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {apiKeys.map((k) => (
                          <div
                            key={k.id}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              flexWrap: 'wrap',
                              gap: '10px',
                              padding: '10px 12px',
                              backgroundColor: '#101217',
                              border: '1px solid #232731',
                              borderRadius: '4px',
                              boxSizing: 'border-box',
                              minWidth: 0,
                            }}
                          >
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0, flex: '1 1 200px' }}>
                              <span style={{ fontSize: '13px', fontWeight: 600, color: '#e2e8f0', wordBreak: 'break-word' }}>{k.name}</span>
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', fontSize: '11px', color: '#64748b' }}>
                                <span>Prefix: <code>{k.keyPrefix}</code></span>
                                <span>Created: {new Date(k.createdAt).toLocaleDateString()}</span>
                                {k.lastUsedAt && <span>Last used: {new Date(k.lastUsedAt).toLocaleDateString()}</span>}
                              </div>
                            </div>

                            <button
                              type="button"
                              onClick={() => handleRevokeKey(k.id)}
                              style={{
                                padding: '5px 10px',
                                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                                border: '1px solid rgba(239, 68, 68, 0.3)',
                                borderRadius: '4px',
                                color: '#f87171',
                                fontSize: '11px',
                                cursor: 'pointer',
                                flexShrink: 0,
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.25)';
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.1)';
                              }}
                            >
                              Revoke
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          {/* ================================================================= */}
          {/* TAB 2: AI BUILD & SHAPE GENERATOR */}
          {/* ================================================================= */}
          {activeTab === 'builder' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', minWidth: 0 }}>
              <div
                style={{
                  padding: '10px 14px',
                  backgroundColor: 'rgba(59, 130, 246, 0.08)',
                  border: '1px solid rgba(59, 130, 246, 0.25)',
                  borderRadius: '6px',
                  fontSize: '12px',
                  color: '#93c5fd',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: '8px',
                  flexShrink: 0,
                  boxSizing: 'border-box',
                  minWidth: 0,
                  maxWidth: '100%',
                }}
              >
                <span style={{ minWidth: 0, flex: '1 1 300px' }}>
                  💡 <strong>On-Demand Procedural Builder:</strong> Generates complete Minecraft structures or 3D primitives directly into a new movable Placement in the active schematic!
                </span>
                {defaultPosition && (
                  <button
                    type="button"
                    onClick={() => {
                      setStructPosX(defaultPosition[0]);
                      setStructPosY(defaultPosition[1]);
                      setStructPosZ(defaultPosition[2]);
                      setShapePosX(defaultPosition[0]);
                      setShapePosY(defaultPosition[1]);
                      setShapePosZ(defaultPosition[2]);
                    }}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#60a5fa',
                      fontSize: '11px',
                      textDecoration: 'underline',
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                      flexShrink: 0,
                    }}
                  >
                    Use Cursor [{defaultPosition.join(', ')}]
                  </button>
                )}
              </div>

              {/* CARD 1: Structure Builder */}
              <div style={cardStyle}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
                  <span style={{ fontSize: '18px', flexShrink: 0 }}>🏰</span>
                  <div style={{ minWidth: 0 }}>
                    <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 600, color: '#f4f4f5' }}>
                      Procedural Structure Generator
                    </h3>
                    <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#8b929e' }}>
                      Construct multi-room architectural buildings styled to your Minecraft theme.
                    </p>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '14px', marginBottom: '14px' }}>
                  {/* Structure Type */}
                  <div style={{ minWidth: 0 }}>
                    <label style={labelStyle}>Structure Type</label>
                    <select
                      value={structureType}
                      onChange={(e) => setStructureType(e.target.value)}
                      style={selectStyle}
                    >
                      <option value="house">🏠 Medieval / Styled House</option>
                      <option value="tower">🗼 Watchtower</option>
                      <option value="castle">🏰 Fortress Castle</option>
                      <option value="temple">🏛️ Classical Temple</option>
                      <option value="pagoda">⛩️ Multi-Tier Pagoda</option>
                      <option value="modern_villa">🏢 Modern Villa</option>
                      <option value="bridge">🌉 Arched Bridge</option>
                      <option value="tree">🌳 Custom Organic Tree</option>
                      <option value="fountain">⛲ Plaza Fountain</option>
                      <option value="island">🏝️ Floating Island</option>
                      <option value="ship">⛵ Sailing Ship</option>
                    </select>
                  </div>

                  {/* Style */}
                  <div style={{ minWidth: 0 }}>
                    <label style={labelStyle}>Architectural Style / Palette</label>
                    <select
                      value={structureStyle}
                      onChange={(e) => setStructureStyle(e.target.value)}
                      style={selectStyle}
                    >
                      <option value="medieval">🪵 Medieval (Oak Wood & Cobblestone)</option>
                      <option value="modern">🔲 Modern (Concrete, Quartz & Glass)</option>
                      <option value="deepslate">🪨 Deepslate (Polished Deepslate & Grimstone)</option>
                      <option value="desert">🏜️ Desert (Sandstone & Terracotta)</option>
                      <option value="nether">🔥 Nether (Blackstone, Crimson & Gold)</option>
                      <option value="japanese">🌸 Japanese (Cherry Wood & Prismarine)</option>
                      <option value="prismarine">🌊 Ocean (Prismarine & Sea Lanterns)</option>
                    </select>
                  </div>
                </div>

                {/* Coordinates & Name */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: '10px', marginBottom: '14px' }}>
                  <div style={{ minWidth: 0 }}>
                    <label style={labelStyle}>Position X</label>
                    <input
                      type="number"
                      value={structPosX}
                      onChange={(e) => setStructPosX(parseInt(e.target.value, 10) || 0)}
                      style={inputStyle}
                    />
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <label style={labelStyle}>Position Y</label>
                    <input
                      type="number"
                      value={structPosY}
                      onChange={(e) => setStructPosY(parseInt(e.target.value, 10) || 0)}
                      style={inputStyle}
                    />
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <label style={labelStyle}>Position Z</label>
                    <input
                      type="number"
                      value={structPosZ}
                      onChange={(e) => setStructPosZ(parseInt(e.target.value, 10) || 0)}
                      style={inputStyle}
                    />
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <label style={labelStyle}>Placement Name (Optional)</label>
                    <input
                      type="text"
                      value={structureName}
                      onChange={(e) => setStructureName(e.target.value)}
                      placeholder={`${structureStyle} ${structureType}`}
                      style={inputStyle}
                    />
                  </div>
                </div>

                {/* Build Button */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
                  <button
                    type="button"
                    onClick={handleRunStructureBuild}
                    disabled={isGeneratingStructure}
                    style={{
                      ...primaryButtonStyle,
                      padding: '10px 20px',
                      fontSize: '13px',
                      flexShrink: 0,
                    }}
                  >
                    {isGeneratingStructure ? '🔨 Constructing Structure...' : '✨ Generate Build into Viewport'}
                  </button>

                  {structureFeedback && (
                    <span
                      style={{
                        fontSize: '12px',
                        color: structureFeedback.success ? '#4ade80' : '#f87171',
                        wordBreak: 'break-word',
                        minWidth: 0,
                      }}
                    >
                      {structureFeedback.message}
                    </span>
                  )}
                </div>
              </div>

              {/* CARD 2: 3D Shape Primitive Generator */}
              <div style={cardStyle}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
                  <span style={{ fontSize: '18px', flexShrink: 0 }}>📐</span>
                  <div style={{ minWidth: 0 }}>
                    <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 600, color: '#f4f4f5' }}>
                      3D Geometric Shape Generator
                    </h3>
                    <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#8b929e' }}>
                      Generate mathematically pure geometric volumes with custom radius and height.
                    </p>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '14px', marginBottom: '14px' }}>
                  {/* Shape Type */}
                  <div style={{ minWidth: 0 }}>
                    <label style={labelStyle}>Shape Primitive</label>
                    <select
                      value={shapeType}
                      onChange={(e) => setShapeType(e.target.value)}
                      style={selectStyle}
                    >
                      <option value="sphere">⚪ Sphere</option>
                      <option value="cylinder">🥫 Cylinder</option>
                      <option value="pyramid">🔺 Pyramid</option>
                      <option value="cone">🍦 Cone</option>
                      <option value="arch">🌉 Arch</option>
                      <option value="roof">🏠 Pitched Roof</option>
                      <option value="torus">🍩 Torus (Donut)</option>
                      <option value="box">📦 Hollow Box</option>
                      <option value="stairs">🪜 Spiral Stairs</option>
                    </select>
                  </div>

                  {/* Block State */}
                  <div style={{ minWidth: 0 }}>
                    <label style={labelStyle}>Block State</label>
                    <input
                      type="text"
                      value={shapeBlock}
                      onChange={(e) => setShapeBlock(e.target.value)}
                      placeholder="minecraft:stone_bricks"
                      style={inputStyle}
                    />

                    {/* Chips for popular blocks */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '6px' }}>
                      {POPULAR_BLOCKS.map((b) => (
                        <button
                          key={b}
                          type="button"
                          onClick={() => setShapeBlock(b)}
                          style={{
                            padding: '2px 6px',
                            backgroundColor: shapeBlock === b ? '#2563eb' : '#1f242d',
                            border: `1px solid ${shapeBlock === b ? '#3b82f6' : '#2a2e38'}`,
                            borderRadius: '3px',
                            color: shapeBlock === b ? '#ffffff' : '#94a3b8',
                            fontSize: '10px',
                            cursor: 'pointer',
                          }}
                        >
                          {b.replace('minecraft:', '')}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Geometry Dimensions */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '12px', marginBottom: '14px' }}>
                  <div style={{ minWidth: 0 }}>
                    <label style={labelStyle}>Radius: {shapeRadius}</label>
                    <input
                      type="range"
                      min={1}
                      max={48}
                      value={shapeRadius}
                      onChange={(e) => setShapeRadius(parseInt(e.target.value, 10))}
                      style={{ width: '100%' }}
                    />
                  </div>

                  <div style={{ minWidth: 0 }}>
                    <label style={labelStyle}>Height / Length: {shapeHeight}</label>
                    <input
                      type="range"
                      min={1}
                      max={64}
                      value={shapeHeight}
                      onChange={(e) => setShapeHeight(parseInt(e.target.value, 10))}
                      style={{ width: '100%' }}
                    />
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', paddingTop: '16px', minWidth: 0 }}>
                    <input
                      type="checkbox"
                      id="shape-hollow"
                      checked={shapeHollow}
                      onChange={(e) => setShapeHollow(e.target.checked)}
                      style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                    />
                    <label htmlFor="shape-hollow" style={{ fontSize: '13px', color: '#e2e8f0', cursor: 'pointer' }}>
                      Hollow Shell
                    </label>
                  </div>
                </div>

                {/* Shape Coordinates */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: '10px', marginBottom: '14px' }}>
                  <div style={{ minWidth: 0 }}>
                    <label style={labelStyle}>Position X</label>
                    <input
                      type="number"
                      value={shapePosX}
                      onChange={(e) => setShapePosX(parseInt(e.target.value, 10) || 0)}
                      style={inputStyle}
                    />
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <label style={labelStyle}>Position Y</label>
                    <input
                      type="number"
                      value={shapePosY}
                      onChange={(e) => setShapePosY(parseInt(e.target.value, 10) || 0)}
                      style={inputStyle}
                    />
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <label style={labelStyle}>Position Z</label>
                    <input
                      type="number"
                      value={shapePosZ}
                      onChange={(e) => setShapePosZ(parseInt(e.target.value, 10) || 0)}
                      style={inputStyle}
                    />
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <label style={labelStyle}>Placement Name (Optional)</label>
                    <input
                      type="text"
                      value={shapeName}
                      onChange={(e) => setShapeName(e.target.value)}
                      placeholder={`${shapeType} (${shapeBlock.replace('minecraft:', '')})`}
                      style={inputStyle}
                    />
                  </div>
                </div>

                {/* Generate Shape Button */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
                  <button
                    type="button"
                    onClick={handleRunShapeBuild}
                    disabled={isGeneratingShape}
                    style={{
                      ...primaryButtonStyle,
                      padding: '10px 20px',
                      fontSize: '13px',
                      flexShrink: 0,
                    }}
                  >
                    {isGeneratingShape ? '📐 Calculating Geometry...' : '✨ Generate Shape into Viewport'}
                  </button>

                  {shapeFeedback && (
                    <span
                      style={{
                        fontSize: '12px',
                        color: shapeFeedback.success ? '#4ade80' : '#f87171',
                        wordBreak: 'break-word',
                        minWidth: 0,
                      }}
                    >
                      {shapeFeedback.message}
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ================================================================= */}
          {/* TAB 3: LIVE AI ACTIVITY & TOOLS REFERENCE */}
          {/* ================================================================= */}
          {activeTab === 'activity' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '18px', minWidth: 0 }}>
              {/* Real-time Viewport Sync Control */}
              <div
                style={{
                  ...cardStyle,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: '12px',
                  backgroundColor: '#161920',
                }}
              >
                <div style={{ minWidth: 0, flex: '1 1 280px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                    <span style={{ fontSize: '16px', flexShrink: 0 }}>🔄</span>
                    <strong style={{ fontSize: '13px', color: '#ffffff' }}>
                      Real-Time Viewport Sync
                    </strong>
                    <span
                      style={{
                        padding: '2px 8px',
                        borderRadius: '999px',
                        fontSize: '11px',
                        fontWeight: 600,
                        backgroundColor: liveSyncEnabled ? 'rgba(34, 197, 94, 0.2)' : 'rgba(100, 116, 139, 0.2)',
                        color: liveSyncEnabled ? '#4ade80' : '#94a3b8',
                        flexShrink: 0,
                      }}
                    >
                      {liveSyncEnabled ? 'ACTIVE' : 'PAUSED'}
                    </span>
                  </div>
                  <p style={{ margin: '3px 0 0', fontSize: '12px', color: '#8b929e' }}>
                    Automatically re-render the 3D viewport whenever an external AI assistant executes an MCP tool.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => onToggleLiveSync?.(!liveSyncEnabled)}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '4px',
                    border: 'none',
                    fontWeight: 600,
                    fontSize: '12px',
                    cursor: 'pointer',
                    backgroundColor: liveSyncEnabled ? '#15803d' : '#2563eb',
                    color: '#ffffff',
                    transition: 'background-color 0.15s ease',
                    flexShrink: 0,
                  }}
                >
                  {liveSyncEnabled ? 'Disable Live Sync' : 'Enable Live Sync'}
                </button>
              </div>

              {/* Recent AI Executions List */}
              <div style={cardStyle}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px', marginBottom: '12px' }}>
                  <div style={{ minWidth: 0 }}>
                    <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: '#f4f4f5' }}>
                      Recent AI Tool Executions
                    </h3>
                    <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#8b929e' }}>
                      Live feed of edits initiated by connected MCP agents.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={fetchSyncActivity}
                    disabled={isLoadingSync}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#60a5fa',
                      fontSize: '12px',
                      cursor: 'pointer',
                      flexShrink: 0,
                    }}
                  >
                    {isLoadingSync ? 'Refreshing...' : '↻ Refresh Feed'}
                  </button>
                </div>

                {activities.length === 0 ? (
                  <div
                    style={{
                      padding: '24px',
                      textAlign: 'center',
                      color: '#64748b',
                      fontSize: '12px',
                      fontStyle: 'italic',
                      backgroundColor: '#101217',
                      borderRadius: '4px',
                    }}
                  >
                    No AI tool executions recorded yet. Connect Cursor, Claude Desktop, or test a build in the generator tab to see live activity here!
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {activities.map((act, index) => (
                      <div
                        key={act.id ?? index}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          flexWrap: 'wrap',
                          gap: '8px',
                          padding: '8px 12px',
                          backgroundColor: '#101217',
                          border: '1px solid #232731',
                          borderRadius: '4px',
                          minWidth: 0,
                          boxSizing: 'border-box',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '10px', minWidth: 0, flex: '1 1 200px' }}>
                          <span
                            style={{
                              padding: '2px 8px',
                              backgroundColor: 'rgba(59, 130, 246, 0.15)',
                              border: '1px solid rgba(59, 130, 246, 0.3)',
                              borderRadius: '3px',
                              color: '#60a5fa',
                              fontSize: '11px',
                              fontFamily: 'monospace',
                              flexShrink: 0,
                            }}
                          >
                            {act.tool}
                          </span>
                          <span style={{ fontSize: '13px', color: '#e2e8f0', wordBreak: 'break-word' }}>{act.summary}</span>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '12px', fontSize: '11px', color: '#64748b', flexShrink: 0 }}>
                          {act.changedCells !== undefined && (
                            <span>{act.changedCells.toLocaleString()} voxels</span>
                          )}
                          {act.revision !== undefined && <span>Rev #{act.revision}</span>}
                          <span>{new Date(act.createdAt).toLocaleTimeString()}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Categorized 50+ MCP Tools Reference */}
              <div style={cardStyle}>
                <div style={{ marginBottom: '14px' }}>
                  <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: '#f4f4f5' }}>
                    📚 Complete MCP Tools Reference (50 Tools Available)
                  </h3>
                  <p style={{ margin: '3px 0 0', fontSize: '12px', color: '#8b929e' }}>
                    Any connected LLM can call these tools via standard Model Context Protocol.
                  </p>
                </div>

                {/* Filter and Search Bar */}
                <div style={{ display: 'flex', gap: '10px', marginBottom: '12px', flexWrap: 'wrap' }}>
                  <input
                    type="text"
                    value={toolSearch}
                    onChange={(e) => setToolSearch(e.target.value)}
                    placeholder="Search tools by name or description..."
                    style={{ ...inputStyle, flex: 1, minWidth: '220px' }}
                  />

                  <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      onClick={() => setActiveCategoryFilter('all')}
                      style={categoryPillStyle(activeCategoryFilter === 'all')}
                    >
                      All (50)
                    </button>
                    {categories.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setActiveCategoryFilter(c)}
                        style={categoryPillStyle(activeCategoryFilter === c)}
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Tool Items Accordion List */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '380px', minHeight: 0, overflowY: 'auto' }}>
                  {filteredTools.map((tool) => {
                    const isExpanded = expandedTool === tool.name;
                    return (
                      <div
                        key={tool.name}
                        style={{
                          backgroundColor: '#101217',
                          border: `1px solid ${isExpanded ? '#3b82f6' : '#232731'}`,
                          borderRadius: '4px',
                          overflow: 'hidden',
                        }}
                      >
                        <div
                          onClick={() => setExpandedTool(isExpanded ? null : tool.name)}
                          style={{
                            padding: '10px 14px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            flexWrap: 'wrap',
                            gap: '8px',
                            cursor: 'pointer',
                            userSelect: 'none',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '10px', minWidth: 0, flex: '1 1 240px' }}>
                            <code
                              style={{
                                color: '#38bdf8',
                                fontSize: '12px',
                                fontWeight: 600,
                                fontFamily: "'JetBrains Mono', Consolas, monospace",
                                flexShrink: 0,
                              }}
                            >
                              {tool.name}
                            </code>
                            <span style={{ fontSize: '12px', color: '#cbd5e1', wordBreak: 'break-word', minWidth: 0 }}>{tool.summary}</span>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                            <span
                              style={{
                                fontSize: '10px',
                                padding: '2px 6px',
                                borderRadius: '3px',
                                backgroundColor: '#1e2430',
                                color: '#94a3b8',
                                flexShrink: 0,
                              }}
                            >
                              {tool.category}
                            </span>
                            <span style={{ color: '#64748b', fontSize: '12px', flexShrink: 0 }}>{isExpanded ? '▲' : '▼'}</span>
                          </div>
                        </div>

                        {/* Collapsible details & sample JSON */}
                        {isExpanded && (
                          <div
                            style={{
                              padding: '12px 14px',
                              backgroundColor: '#0a0b0e',
                              borderTop: '1px solid #1f232b',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '8px',
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '6px' }}>
                              <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 600 }}>
                                Example MCP Request Payload:
                              </span>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  copyToClipboard(tool.exampleJson, `tool-example-${tool.name}`);
                                }}
                                style={{ ...copyButtonStyle, flexShrink: 0 }}
                              >
                                {copiedId === `tool-example-${tool.name}` ? '✓ Copied' : 'Copy JSON'}
                              </button>
                            </div>
                            <pre
                              style={{
                                margin: 0,
                                padding: '8px 10px',
                                backgroundColor: '#101217',
                                border: '1px solid #232731',
                                borderRadius: '4px',
                                fontSize: '11px',
                                color: '#38bdf8',
                                fontFamily: "'JetBrains Mono', Consolas, monospace",
                                maxWidth: '100%',
                                boxSizing: 'border-box',
                                overflowX: 'auto',
                                whiteSpace: 'pre-wrap',
                                wordBreak: 'break-word',
                              }}
                            >
                              {tool.exampleJson}
                            </pre>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Styles
// ============================================================================

const cardStyle: React.CSSProperties = {
  backgroundColor: '#181b22',
  border: '1px solid #262b36',
  borderRadius: '6px',
  padding: '16px',
  flexShrink: 0,
  boxSizing: 'border-box',
  minWidth: 0,
  maxWidth: '100%',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '11px',
  fontWeight: 600,
  color: '#c2c5cc',
  marginBottom: '4px',
  textTransform: 'uppercase',
  letterSpacing: '0.4px',
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  minWidth: 0,
  maxWidth: '100%',
  padding: '8px 10px',
  backgroundColor: '#0c0d10',
  border: '1px solid #2a2e38',
  borderRadius: '4px',
  color: '#ffffff',
  fontSize: '13px',
  outline: 'none',
  boxSizing: 'border-box',
};

const selectStyle: React.CSSProperties = {
  ...inputStyle,
  cursor: 'pointer',
};

const primaryButtonStyle: React.CSSProperties = {
  backgroundColor: '#3b82f6',
  color: '#ffffff',
  border: 'none',
  borderRadius: '4px',
  padding: '8px 14px',
  fontSize: '13px',
  fontWeight: 600,
  cursor: 'pointer',
  transition: 'background-color 0.15s ease',
};

const copyButtonStyle: React.CSSProperties = {
  padding: '3px 8px',
  backgroundColor: '#1f242d',
  border: '1px solid #3d4452',
  borderRadius: '3px',
  color: '#93c5fd',
  fontSize: '11px',
  cursor: 'pointer',
};

const codeBlockStyle: React.CSSProperties = {
  margin: 0,
  padding: '10px 12px',
  backgroundColor: '#0c0d10',
  border: '1px solid #222630',
  borderRadius: '4px',
  fontFamily: "'JetBrains Mono', 'Fira Code', Consolas, monospace",
  fontSize: '12px',
  color: '#e2e8f0',
  boxSizing: 'border-box',
  maxWidth: '100%',
  overflowX: 'auto',
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
  overflowWrap: 'anywhere',
};

function tabButtonStyle(isActive: boolean): React.CSSProperties {
  return {
    padding: '8px 14px',
    backgroundColor: isActive ? '#1c1f26' : 'transparent',
    border: 'none',
    borderBottom: isActive ? '2px solid #3b82f6' : '2px solid transparent',
    color: isActive ? '#ffffff' : '#8b929e',
    fontWeight: isActive ? 600 : 400,
    fontSize: '13px',
    cursor: 'pointer',
    borderRadius: '4px 4px 0 0',
    transition: 'all 0.15s ease',
    whiteSpace: 'nowrap',
    flexShrink: 0,
  };
}

function subTabButtonStyle(isActive: boolean): React.CSSProperties {
  return {
    padding: '6px 12px',
    backgroundColor: isActive ? '#2563eb' : '#181b22',
    border: `1px solid ${isActive ? '#3b82f6' : '#2a2f3a'}`,
    borderRadius: '4px',
    color: isActive ? '#ffffff' : '#9ca3af',
    fontSize: '11px',
    fontWeight: isActive ? 600 : 400,
    cursor: 'pointer',
    boxSizing: 'border-box',
  };
}

function categoryPillStyle(isActive: boolean): React.CSSProperties {
  return {
    padding: '4px 8px',
    backgroundColor: isActive ? '#3b82f6' : '#14161b',
    border: `1px solid ${isActive ? '#3b82f6' : '#262b36'}`,
    borderRadius: '3px',
    color: isActive ? '#ffffff' : '#94a3b8',
    fontSize: '11px',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    flexShrink: 0,
  };
}
