// packages/ui/src/index.ts
// Public API for the UI state model. Pure TypeScript — no framework, DOM, or Node imports.

export {
  DEFAULT_LAYOUT,
  DEFAULT_LAYOUT_NAME,
  DEFAULT_PANEL_PROPORTIONS,
  LAYOUT_SCHEMA_VERSION,
  MIN_PANEL_HEIGHT,
  MIN_PANEL_WIDTH,
  MIN_POINTER_TARGET_PX,
  MIN_VIEWPORT_HEIGHT,
  MIN_VIEWPORT_WIDTH,
  PANEL_IDS,
  AGENT_LOG_PANEL_UNDO_SOURCE,
  clampPanelSize,
  createDefaultLayout,
  loadLayout,
  panelById,
  resolveLayout,
  restoreDefaultLayout,
  saveLayout,
  validateLayout,
} from './layout-types.ts';

export type {
  LayoutValidation,
  PanelConfig,
  PanelId,
  PersistedLayout,
  ResolvedLayout,
  SavedLayoutEnvelope,
  WindowSize,
  WorkspaceLayout,
} from './layout-types.ts';

export {
  DEFAULT_BINDINGS,
  G5_SHORTCUT_TABLE,
  createShortcutRegistry,
  displayKeys,
  findConflicts,
  normalizeKeys,
  toKeyDescriptor,
} from './shortcut-types.ts';

export type {
  KeyDescriptor,
  ShortcutBinding,
  ShortcutConflict,
  ShortcutFailureReason,
  ShortcutRegistry,
  ShortcutRegistryApi,
  ShortcutResolution,
} from './shortcut-types.ts';