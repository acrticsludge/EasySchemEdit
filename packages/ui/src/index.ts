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
  DEFAULT_TOOLTIP_CONFIG,
  MIN_TOOLTIP_DELAY_MS,
  MAX_TOOLTIP_DELAY_MS,
  BROWSER_RESERVED_SHORTCUTS,
  createOnboardingState,
  createTooltipState,
  isBrowserReservedShortcut,
  validateTooltipConfig,
  SHORTCUT_REFERENCE_KEY,
} from './tooltip-types.ts';

export type {
  OnboardingState,
  OnboardingStateApi,
  TooltipConfig,
  TooltipStateApi,
  TooltipStateOptions,
  TooltipValidation,
} from './tooltip-types.ts';

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

export {
  COLOR_TOKENS,
  SPACING_TOKENS,
  SURFACE_TOKENS,
  REQUIRED_CONTRAST,
  TEXT_TOKEN_PAIRS,
  COMPONENT_TOKEN_PAIRS,
  contrastFailures,
  contrastRatio,
  relativeLuminance,
  requiredContrastFor,
  toCssCustomProperties,
  toCssRootBlock,
  verifyTokenContrast,
} from './design-tokens.ts';

export type {
  ColorTokens,
  ContrastPair,
  ContrastRequirement,
  ContrastResult,
  TokenName,
} from './design-tokens.ts';