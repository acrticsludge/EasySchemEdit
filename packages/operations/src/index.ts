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
  setPlacementOrigin,
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

export type {
  PendingPlacement,
  GhostBlock,
  GhostPreview,
  GroundSnapResult,
} from './import-place.ts';

export {
  ImportPlaceEngine,
} from './import-place.ts';

export type {
  VerifyComparison,
  VerifyResult,
  PerPlacementVerify,
  MaterialTypeCount,
  MaterialReport,
} from './verify-material.ts';

export {
  VerifyMaterialEngine,
  verifyPlacement,
  generateMaterialReport,
} from './verify-material.ts';

export type {
  HoverState,
  HoverInfo,
} from './hover.ts';

export {
  HoverEngine,
  hoverOver,
  clearHover,
} from './hover.ts';

export type {
  GroupTransformOptions,
  GroupTransformResult,
  GroupTransformStep,
} from './group-transforms.ts';

export {
  GroupTransformEngine,
  rotateGroup,
  mirrorGroup,
  composeTransforms,
  validateTransformBijectivity,
  preservesStairChirality,
  mirrorFlipsChirality,
} from './group-transforms.ts';

export type {
  OperationBudget,
  BudgetCheckResult,
  BudgetConfig,
} from './operation-budgets.ts';

export {
  BudgetEngine,
  checkBudget,
  estimateRuntime,
  estimateMemory,
  shouldOffloadToWorker,
} from './operation-budgets.ts';

export type { LockedOperationError } from './placement.ts';

export type {
  Command,
  PlacementAddCommand,
  PlacementRemoveCommand,
  PlacementDuplicateCommand,
  PlacementRenameCommand,
  PlacementMoveCommand,
  PlacementRotateCommand,
  PlacementMirrorCommand,
  PlacementTransformCommand,
  PlacementSetOriginCommand,
  PlacementSetHiddenCommand,
  PlacementSetLockedCommand,
  GroupTransformCommand,
  SelectionSetCommand,
  SelectionClearCommand,
  SelectionEditCommand,
  RegionFillCommand,
  RegionReplaceCommand,
  RegionDeleteCommand,
  RegionHollowCommand,
  RegionWallsCommand,
  RegionMoveCommand,
  ClipboardCopyCommand,
  ClipboardCutCommand,
  ClipboardPasteCommand,
  BakeCommand,
  Query,
  GetProjectQuery,
  ListPlacementsQuery,
  GetPlacementQuery,
  GetBlockQuery,
  GetSelectionQuery,
  MaterialListQuery,
  DetectConflictsQuery,
  GetHistoryQuery,
  HistoryQueryResult,
  CommandExecutionOptions,
  CommandChangedInfo,
  SessionError,
  SuccessResult,
  FailureResult,
  Result,
  SessionChangeEvent,
  SessionListener,
} from './session-types.ts';

export {
  EditorSession,
} from './session.ts';

