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

export type { LockedOperationError } from './placement.ts';
