// apps/mcp-companion/src/tools/placement.ts
// MCP placement tool types (SUBSPEC-F §2.3).
// Pure TypeScript, zero Three.js imports.
// Imports Vec3i from domain/types.ts via relative paths.

import type { Vec3i } from '../../../../packages/domain/types.ts';

// ============================================================================
// Placement Tool Types
// ============================================================================

export type PlacementTool =
  | 'load_schematic'
  | 'transform_placement'
  | 'transform_placements'
  | 'set_placement_visibility'
  | 'set_placement_lock'
  | 'rename_placement'
  | 'delete_placement'
  | 'duplicate_placement'
  | 'set_origin'
  | 'bake_placements';

// ============================================================================
// Placement Tool Result
// ============================================================================

export type PlacementToolResult<T = unknown> = {
  requestId: string;
  projectId: string;
  success: boolean;
  data: T;
  revision: number;
  changedPlacements: string[];
  warnings: string[];
  error?: PlacementToolError;
};

export type PlacementToolError = {
  code: string;
  message: string;
  placementId?: string;
  projectId?: string;
};

// ============================================================================
// Load Schematic Result
// ============================================================================

export type LoadSchematicResult = {
  projectId: string;
  placementId: string;
  name: string;
  revision: number;
  blockCount: number;
};

// ============================================================================
// Transform Placement Result
// ============================================================================

export type TransformPlacementResult = {
  placementId: string;
  revision: number;
  transform: {
    translation: [number, number, number];
    rotationY: 0 | 90 | 180 | 270;
    mirror: 'none' | 'x' | 'z';
  };
};

export type TransformPlacementsResult = {
  projectId: string;
  transform: {
    translation: [number, number, number];
    rotationY: 0 | 90 | 180 | 270;
    mirror: 'none' | 'x' | 'z';
  };
  changedPlacements: string[];
};

// ============================================================================
// Set Placement Visibility Result
// ============================================================================

export type SetPlacementVisibilityResult = {
  placementId: string;
  revision: number;
  visible: boolean;
};

// ============================================================================
// Set Placement Lock Result
// ============================================================================

export type SetPlacementLockResult = {
  placementId: string;
  revision: number;
  locked: boolean;
};

// ============================================================================
// Rename Placement Result
// ============================================================================

export type RenamePlacementResult = {
  placementId: string;
  revision: number;
  oldName: string;
  newName: string;
};

// ============================================================================
// Delete Placement Result
// ============================================================================

export type DeletePlacementResult = {
  placementId: string;
  revision: number;
};

// ============================================================================
// Duplicate Placement Result
// ============================================================================

export type DuplicatePlacementResult = {
  projectId: string;
  placementId: string;
  newPlacementId: string;
  revision: number;
};

// ============================================================================
// Set Origin Result
// ============================================================================

export type SetOriginResult = {
  placementId: string;
  revision: number;
  origin: [number, number, number];
};

// ============================================================================
// Bake Placements Result
// ============================================================================

export type BakePlacementsResult = {
  projectId: string;
  newPlacementId: string;
  revision: number;
  changedCells: number;
};

// ============================================================================
// Placement Tool Result Map
// ============================================================================

export type PlacementToolResultMap = {
  load_schematic: LoadSchematicResult;
  transform_placement: TransformPlacementResult;
  transform_placements: TransformPlacementsResult;
  set_placement_visibility: SetPlacementVisibilityResult;
  set_placement_lock: SetPlacementLockResult;
  rename_placement: RenamePlacementResult;
  delete_placement: DeletePlacementResult;
  duplicate_placement: DuplicatePlacementResult;
  set_origin: SetOriginResult;
  bake_placements: BakePlacementsResult;
};
