// apps/web/src/editor/panels/index.ts
// Public exports for Editor Panels: Conflicts, Bake, and Material List (Slice E3.8).

export {
  ConflictsPanelController,
  BakeController,
  MaterialListController,
  type OverlayMode,
  type OverlapPolicy,
  type MaterialListMode,
  type SortOrder,
  type ConflictStats,
  type MaterialItem,
  type BakeControllerOptions,
} from './panels-controller.ts';

export {
  ConflictsPanel,
  type ConflictsPanelProps,
} from './ConflictsPanel.tsx';

export {
  BakeDialog,
  type BakeDialogProps,
} from './BakeDialog.tsx';

export {
  MaterialListPanel,
  type MaterialListPanelProps,
} from './MaterialListPanel.tsx';
