// packages/operations/src/index.ts
// Public API for the operations package.

export type {
  PlacementLockState,
  PlacementVisibility,
  PlacementOrder,
  PlacementReorderOperation,
} from './placement.ts';

export type {
  SelectionType,
  CuboidBounds,
  SelectionAnchor,
  PlacementSelection,
  CuboidSelection,
  Selection,
  SelectionState,
} from './selection.ts';

export type {
  BlockStateMatcher,
  FillOperation,
  ReplaceOperation,
  DeleteOperation,
  HollowOperation,
  WallsOperation,
  RegionOperation,
  RegionOperationOptions,
  RegionOperationResult,
  PerPlacementChange,
} from './region-ops.ts';

export {
  lockPlacement,
  unlockPlacement,
  isLocked,
  showPlacement,
  hidePlacement,
  isVisible,
  reorderPlacements,
  duplicatePlacement,
  deletePlacement,
  movePlacement,
  rotatePlacement,
  mirrorPlacement,
  getPlacementOrder,
  getLockedPlacements,
  getUnlockedPlacements,
  validateNotLocked,
  validateLockedOperations,
  validateVisibilityAllowed,
} from './placement.ts';

export {
  createPlacementSelection,
  createCuboidSelection,
  createSelectionState,
  getSelectionVolume,
  isEmptySelection,
  getSelectedPlacementIds,
  switchToPlacementSelection,
  switchToCuboidSelection,
  updateAnchor,
  updateSelectionBounds,
  repairAfterDelete,
  boundsContainsPoint,
  boundsUnion,
  boundsIntersect,
  boundsVolume,
} from './selection.ts';

export {
  RegionOperationEngine,
  applyRegionOperation,
} from './region-ops.ts';

export type {
  ClipboardEntry,
  ClipboardData,
  ClipboardBlockData,
  CutOptions,
  PasteOptions,
  PasteResult,
} from './clipboard.ts';

export {
  ClipboardManager,
} from './clipboard.ts';

export type {
  ConflictCategory,
  ConflictEntry,
  ConflictResult,
  ConflictIndexOptions,
} from './conflict-index.ts';

export {
  ConflictIndex,
  detectConflicts,
} from './conflict-index.ts';

export type {
  BakeOptions,
  BakeResult,
} from './bake.ts';

export {
  BakeEngine,
  bakeProject,
} from './bake.ts';

export type { LockedOperationError } from './placement.ts';
