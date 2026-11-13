// packages/operations/src/session-types.ts
// Discriminated union types for Command, Query, Result, and Session events.
// Single command/query contract for UI, workers, and MCP companion (SUBSPEC-D, AD-1).

import type {
  BlockStateId,
  Bounds3i,
  Vec3Half,
  Vec3i,
} from '../../domain/types.ts';
import type { Placement, Project } from '../../domain/placement.ts';
import type { Transform } from '../../domain/coordinates.ts';
import type {
  CuboidBounds,
  Selection,
  SelectionAnchor,
  SelectionState,
} from './selection.ts';
import type {
  BlockStateMatcher,
  RegionOperationOptions,
} from './region-ops.ts';
import type {
  ClipboardEntry,
  CutOptions,
} from './clipboard.ts';
import type {
  ConflictResult,
} from './conflict-index.ts';
import type {
  MaterialReport,
} from './verify-material.ts';
import type { HistoryEntry } from '../../persistence/src/history.ts';

// ============================================================================
// Execution Options & Results
// ============================================================================

export interface CommandExecutionOptions {
  expectedRevision?: number;
  requestId?: string;
}

export interface CommandChangedInfo {
  cells: number;
  placementIds: string[];
  chunkKeys: string[];
  bounds?: Bounds3i;
}

export interface SessionError {
  code: string;
  message: string;
  placementId?: string;
  details?: Record<string, unknown>;
}

export type SuccessResult<T> = {
  ok: true;
  success: true;
  value: T;
  error?: undefined;
} & T;

export type FailureResult = {
  ok: false;
  success: false;
  error: SessionError;
  value?: undefined;
  revision?: number;
  changed?: undefined;
};

export type Result<T> = SuccessResult<T> | FailureResult;

export interface SessionChangeEvent {
  revision: number;
  kind: string;
  placementIds: string[];
  chunkKeys: string[];
}

export type SessionListener = (event: SessionChangeEvent) => void;

// ============================================================================
// Placement Commands
// ============================================================================

export type PlacementAddCommand = {
  type: 'placement:add' | 'placement.add' | 'placement_add';
  placement: Placement;
};

export type PlacementRemoveCommand = {
  type:
    | 'placement:remove'
    | 'placement.remove'
    | 'placement_remove'
    | 'placement:delete'
    | 'placement.delete'
    | 'placement_delete';
  placementId: string;
};

export type PlacementDuplicateCommand = {
  type: 'placement:duplicate' | 'placement.duplicate' | 'placement_duplicate';
  placementId: string;
  offset?: Vec3i;
};

export type PlacementRenameCommand = {
  type: 'placement:rename' | 'placement.rename' | 'placement_rename';
  placementId: string;
  name: string;
};

export type PlacementMoveCommand = {
  type: 'placement:move' | 'placement.move' | 'placement_move';
  placementId: string;
  translation?: Vec3i;
  offset?: Vec3i;
};

export type PlacementRotateCommand = {
  type: 'placement:rotate' | 'placement.rotate' | 'placement_rotate';
  placementId: string;
  rotationY: 0 | 90 | 180 | 270;
};

export type PlacementMirrorCommand = {
  type: 'placement:mirror' | 'placement.mirror' | 'placement_mirror';
  placementId: string;
  mirror: 'none' | 'x' | 'z';
};

export type PlacementSetOriginCommand = {
  type:
    | 'placement:setOrigin'
    | 'placement.setOrigin'
    | 'placement:set_origin'
    | 'placement.set_origin'
    | 'placement_set_origin';
  placementId: string;
  origin: Vec3Half;
  keepBlocksInPlace?: boolean;
};

export type PlacementSetHiddenCommand = {
  type:
    | 'placement:setHidden'
    | 'placement.setHidden'
    | 'placement:set_hidden'
    | 'placement.set_hidden'
    | 'placement_set_hidden'
    | 'placement:setVisibility'
    | 'placement.setVisibility'
    | 'placement:set_visibility'
    | 'placement.set_visibility'
    | 'placement_set_visibility';
  placementId: string;
  hidden?: boolean;
  visible?: boolean;
};

export type PlacementSetLockedCommand = {
  type:
    | 'placement:setLocked'
    | 'placement.setLocked'
    | 'placement:set_locked'
    | 'placement.set_locked'
    | 'placement_set_locked';
  placementId: string;
  locked: boolean;
  lockReason?: 'user' | 'import' | 'system';
};

// ============================================================================
// Group Transform Commands
// ============================================================================

export type GroupTransformCommand = {
  type:
    | 'group:transform'
    | 'group.transform'
    | 'group_transform'
    | 'group:rotate'
    | 'group.rotate'
    | 'group_rotate'
    | 'group:mirror'
    | 'group.mirror'
    | 'group_mirror';
  placementIds: string[];
  pivot?: Vec3Half;
  rotationY?: 0 | 90 | 180 | 270;
  mirror?: 'none' | 'x' | 'z';
  translation?: Vec3i;
};

// ============================================================================
// Selection Commands
// ============================================================================

export type SelectionSetCommand = {
  type: 'selection:set' | 'selection.set' | 'selection_set';
  selection: Selection;
};

export type SelectionClearCommand = {
  type: 'selection:clear' | 'selection.clear' | 'selection_clear';
};

export type SelectionEditCommand = {
  type: 'selection:edit' | 'selection.edit' | 'selection_edit';
  bounds?: CuboidBounds;
  anchor?: SelectionAnchor;
  placementIds?: string[];
};

// ============================================================================
// Region Commands
// ============================================================================

export type RegionFillCommand = {
  type: 'region:fill' | 'region.fill' | 'region_fill' | 'fill';
  bounds: Bounds3i;
  block: BlockStateId;
  placementId?: string;
  options?: RegionOperationOptions;
};

export type RegionReplaceCommand = {
  type: 'region:replace' | 'region.replace' | 'region_replace' | 'replace';
  bounds: Bounds3i;
  matcher: BlockStateMatcher;
  replacement: BlockStateId;
  preserveProperties?: boolean;
  placementId?: string;
  options?: RegionOperationOptions;
};

export type RegionDeleteCommand = {
  type: 'region:delete' | 'region.delete' | 'region_delete' | 'delete';
  bounds: Bounds3i;
  placementId?: string;
  removeBlockEntities?: boolean;
  removeEntities?: boolean;
  options?: RegionOperationOptions;
};

export type RegionHollowCommand = {
  type: 'region:hollow' | 'region.hollow' | 'region_hollow' | 'hollow';
  bounds: Bounds3i;
  shellThickness?: number;
  placementId?: string;
  options?: RegionOperationOptions;
};

export type RegionWallsCommand = {
  type: 'region:walls' | 'region.walls' | 'region_walls' | 'walls';
  bounds: Bounds3i;
  wallBlock: BlockStateId;
  fillInterior?: BlockStateId | null;
  includeTop?: boolean;
  includeBottom?: boolean;
  placementId?: string;
  options?: RegionOperationOptions;
};

export type RegionMoveCommand = {
  type: 'region:move' | 'region.move' | 'region_move' | 'move';
  sourceBounds: Bounds3i;
  offset: Vec3i;
  affectedPlacements?: string[];
  overlapPolicy?: 'top-wins' | 'bottom-wins';
};

// ============================================================================
// Clipboard Commands
// ============================================================================

export type ClipboardCopyCommand = {
  type: 'clipboard:copy' | 'clipboard.copy' | 'clipboard_copy' | 'copy';
  selection?: Selection | { kind: 'cuboid'; bounds: Bounds3i } | { kind: 'placement'; placementIds: string[] };
  scope?: 'effective-composite' | 'source-placement';
};

export type ClipboardCutCommand = {
  type: 'clipboard:cut' | 'clipboard.cut' | 'clipboard_cut' | 'cut';
  selection?: Selection | { kind: 'cuboid'; bounds: Bounds3i };
  scope?: 'effective-composite' | 'source-placement';
  options?: CutOptions;
};

export type ClipboardPasteCommand = {
  type: 'clipboard:paste' | 'clipboard.paste' | 'clipboard_paste' | 'paste';
  targetPosition: Vec3i;
  entry?: ClipboardEntry;
  entryId?: string;
  intoPlacementId?: string;
  overrideAir?: boolean;
  skipAir?: boolean;
  rotationY?: 0 | 90 | 180 | 270;
  mirror?: 'none' | 'x' | 'z';
  pasteAtOriginalPosition?: boolean;
};

// ============================================================================
// Bake Command
// ============================================================================

export type BakeCommand = {
  type: 'bake' | 'bake_placements' | 'bake:placements';
  placementIds?: string[];
  createNewPlacement?: boolean;
  newPlacementName?: string;
  overlapPolicy?: 'top-wins' | 'bottom-wins';
};

// ============================================================================
// Command Union
// ============================================================================

export type Command =
  | PlacementAddCommand
  | PlacementRemoveCommand
  | PlacementDuplicateCommand
  | PlacementRenameCommand
  | PlacementMoveCommand
  | PlacementRotateCommand
  | PlacementMirrorCommand
  | PlacementSetOriginCommand
  | PlacementSetHiddenCommand
  | PlacementSetLockedCommand
  | GroupTransformCommand
  | SelectionSetCommand
  | SelectionClearCommand
  | SelectionEditCommand
  | RegionFillCommand
  | RegionReplaceCommand
  | RegionDeleteCommand
  | RegionHollowCommand
  | RegionWallsCommand
  | RegionMoveCommand
  | ClipboardCopyCommand
  | ClipboardCutCommand
  | ClipboardPasteCommand
  | BakeCommand;

// ============================================================================
// Queries
// ============================================================================

export type GetProjectQuery = {
  type: 'getProject' | 'project' | 'get_project';
};

export type ListPlacementsQuery = {
  type: 'listPlacements' | 'list_placements';
  filter?: string;
  limit?: number;
  offset?: number;
};

export type GetPlacementQuery = {
  type: 'getPlacement' | 'get_placement';
  placementId: string;
};

export type GetBlockQuery = {
  type: 'getBlock' | 'get_block';
  worldPos: Vec3i;
};

export type GetSelectionQuery = {
  type: 'getSelection' | 'get_selection';
};

export type MaterialListQuery = {
  type: 'materialList' | 'get_material_list' | 'material_list';
  mode?: 'effective' | 'perPlacement';
  placementId?: string;
  bounds?: Bounds3i;
};

export type DetectConflictsQuery = {
  type: 'detectConflicts' | 'detect_conflicts';
  bounds?: Bounds3i;
  overlapPolicy?: 'top-wins' | 'bottom-wins';
};

export type GetHistoryQuery = {
  type: 'getHistory' | 'get_history';
  limit?: number;
  offset?: number;
};

export type Query =
  | GetProjectQuery
  | ListPlacementsQuery
  | GetPlacementQuery
  | GetBlockQuery
  | GetSelectionQuery
  | MaterialListQuery
  | DetectConflictsQuery
  | GetHistoryQuery;

export interface HistoryQueryResult {
  undoStack: HistoryEntry[];
  redoStack: HistoryEntry[];
  canUndo: boolean;
  canRedo: boolean;
  undoCount: number;
  redoCount: number;
}
