// apps/mcp-companion/src/tools/history.ts
// MCP history/export tool types (SUBSPEC-F §2.3).
// Pure TypeScript, zero Three.js imports.
// Imports Vec3i from domain/types.ts via relative paths.

import type { Vec3i, BlockStateId } from '../../../../packages/domain/types.ts';

// ============================================================================
// History Tool Types
// ============================================================================

export type HistoryTool =
  | 'undo'
  | 'redo'
  | 'export_schematic'
  | 'get_operation_diff'
  | 'set_color_mode';

// ============================================================================
// History Tool Result
// ============================================================================

export type HistoryToolResult<T = unknown> = {
  requestId: string;
  projectId: string;
  success: boolean;
  data: T;
  revision: number;
  changedPlacements: string[];
  warnings: string[];
  error?: HistoryToolError;
};

export type HistoryToolError = {
  code: string;
  message: string;
  placementId?: string;
  projectId?: string;
  currentRevision?: number;
};

// ============================================================================
// Undo Result
// ============================================================================

export type UndoResult = {
  projectId: string;
  revision: number;
  changedPlacements: string[];
  changedCells: number;
};

// ============================================================================
// Redo Result
// ============================================================================

export type RedoResult = {
  projectId: string;
  revision: number;
  changedPlacements: string[];
  changedCells: number;
};

// ============================================================================
// Export Schematic Result
// ============================================================================

export type ExportSchematicResult = {
  projectId: string;
  archiveId: string;
  revision: number;
  filename: string;
  format: '.vxproj' | '.litematic' | '.schematic';
  checksums: Record<string, string>;
};

// ============================================================================
// Get Operation Diff Result
// ============================================================================

export type GetOperationDiffResult = {
  projectId: string;
  fromRevision: number;
  toRevision: number;
  changedPlacements: string[];
  changedCells: number;
  blockChanges: Array<{
    position: [number, number, number];
    fromState?: { id: string; props: Record<string, string> };
    toState?: { id: string; props: Record<string, string> };
  }>;
};

// ============================================================================
// Set Color Mode Result
// ============================================================================

export type SetColorModeResult = {
  projectId: string;
  revision: number;
  mode: 'off' | 'conflicts' | 'full';
};

// ============================================================================
// History Tool Result Map
// ============================================================================

export type HistoryToolResultMap = {
  undo: UndoResult;
  redo: RedoResult;
  export_schematic: ExportSchematicResult;
  get_operation_diff: GetOperationDiffResult;
  set_color_mode: SetColorModeResult;
};
