// apps/web/src/editor/layout/index.ts
// Public exports for the S&box workspace layout and panel suite (Slice E3.4).

export {
  WorkspaceShell,
  type WorkspaceShellProps,
} from './WorkspaceShell.tsx';

export {
  Toolbar,
  type ToolbarProps,
} from './Toolbar.tsx';

export {
  OutlinerPanel,
  type OutlinerPanelProps,
} from './OutlinerPanel.tsx';

export {
  InspectorPanel,
  type InspectorPanelProps,
} from './InspectorPanel.tsx';

export {
  BottomDock,
  type BottomDockProps,
} from './BottomDock.tsx';

export {
  StatusBar,
  type StatusBarProps,
} from './StatusBar.tsx';

export {
  createWorkspaceControllers,
  MemoryStorage,
  DEFAULT_LAYOUT_STORAGE_KEY,
  type StorageLike,
  type WorkspaceBridgeOptions,
  type WorkspaceControllers,
} from './layout-bridge.ts';
