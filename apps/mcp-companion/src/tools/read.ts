// apps/mcp-companion/src/tools/read.ts
// MCP read tools types (SUBSPEC-F §2.3).
// Pure TypeScript, zero Three.js imports.
// Imports Vec3i from domain/types.ts via relative paths.

import type { Vec3i, BlockStateId } from '../../../../packages/domain/types.ts';

// ============================================================================
// Read Tool Types
// ============================================================================

export type ReadTool =
  | 'list_projects'
  | 'open_project'
  | 'get_project_info'
  | 'list_placements'
  | 'get_placement'
  | 'get_origin'
  | 'detect_conflicts'
  | 'get_conflict_map'
  | 'get_material_list'
  | 'get_selection'
  | 'get_color_mode'
  | 'get_history'
  | 'get_diagnostics';

// ============================================================================
// Read Tool Result
// ============================================================================

export type ReadToolResult<T = unknown> = {
  requestId: string;
  projectId: string;
  success: boolean;
  data: T;
  revision: number;
  warnings: string[];
  error?: ReadToolError;
};

export type ReadToolError = {
  code: string;
  message: string;
  projectId?: string;
  expectedRevision?: number;
  currentRevision?: number;
};

// ============================================================================
// List Projects Result
// ============================================================================

export type ListProjectsResult = {
  projects: Array<{
    projectId: string;
    name: string;
    revision: number;
    placementCount: number;
    locked: boolean;
  }>;
};

export type OpenProjectResult = {
  projectId: string;
  name: string;
  revision: number;
  createdAt: string;
  modifiedAt: string;
  placementCount: number;
  overlapPolicy: 'top-wins' | 'bottom-wins';
};

export type GetProjectInfoResult = {
  projectId: string;
  name: string;
  revision: number;
  createdAt: string;
  modifiedAt: string;
  placementCount: number;
  importGroupCount: number;
  overlapPolicy: 'top-wins' | 'bottom-wins';
  metadata: { author?: string; createdAt: string; modifiedAt: string };
};

// ============================================================================
// List Placements Result
// ============================================================================

export type ListPlacementsResult = {
  placements: Array<{
    id: string;
    name: string;
    revision: number;
    visible: boolean;
    locked: boolean;
    blockCount: number;
    ancillaryCount: number;
  }>;
};

export type GetPlacementResult = {
  placementId: string;
  name: string;
  revision: number;
  transform: {
    translation: [number, number, number];
    rotationY: 0 | 90 | 180 | 270;
    mirror: 'none' | 'x' | 'z';
  };
  origin: [number, number, number];
  volume: {
    bounds: { min: [number, number, number]; max: [number, number, number] };
    chunkCount: number;
    nonAirCount: number;
  };
  visible: boolean;
  locked: boolean;
  ancillary: {
    blockEntityCount: number;
    entityCount: number;
    biomeCount: number;
    tickCount: number;
  };
};

export type GetOriginResult = {
  placementId: string;
  origin: [number, number, number];
  revision: number;
};

export type DetectConflictsResult = {
  projectId: string;
  revision: number;
  conflicts: Array<{
    position: [number, number, number];
    category: 'clean' | 'same-state' | 'state-conflict';
    owners: string[];
    currentState?: { id: string; props: Record<string, string> };
  }>;
  conflictCount: number;
};

export type GetConflictMapResult = {
  projectId: string;
  revision: number;
  conflictMap: Array<{
    position: [number, number, number];
    owner: string;
    state: string;
  }>;
};

export type GetMaterialListResult = {
  projectId: string;
  revision: number;
  materials: Array<{
    blockId: string;
    count: number;
    percentage: number;
  }>;
};

export type GetSelectionResult = {
  projectId: string;
  type: 'placement' | 'cuboid';
  placementIds?: string[];
  bounds?: { min: [number, number, number]; max: [number, number, number] };
};

export type GetColorModeResult = {
  projectId: string;
  mode: 'off' | 'conflicts' | 'full';
};

export type GetHistoryResult = {
  projectId: string;
  revision: number;
  history: Array<{
    revision: number;
    timestamp: string;
    operation: string;
    changedBlocks: number;
  }>;
};

export type GetDiagnosticsResult = {
  projectId: string;
  revision: number;
  warnings: string[];
  errors: string[];
};

// ============================================================================
// Read Tool Result Map
// ============================================================================

export type ReadToolResultMap = {
  list_projects: ListProjectsResult;
  open_project: OpenProjectResult;
  get_project_info: GetProjectInfoResult;
  list_placements: ListPlacementsResult;
  get_placement: GetPlacementResult;
  get_origin: GetOriginResult;
  detect_conflicts: DetectConflictsResult;
  get_conflict_map: GetConflictMapResult;
  get_material_list: GetMaterialListResult;
  get_selection: GetSelectionResult;
  get_color_mode: GetColorModeResult;
  get_history: GetHistoryResult;
  get_diagnostics: GetDiagnosticsResult;
};
