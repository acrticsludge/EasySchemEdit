// packages/operations/src/index.ts
// Public API for the operations package.

export type {
  PlacementLockState,
  PlacementVisibility,
  PlacementOrder,
  PlacementReorderOperation,
} from './placement.ts';

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

export type { LockedOperationError } from './placement.ts';
