// packages/ui/src/layout-types.ts
// Workspace layout model: panels, G1 proportions, clamping, validation, versioned persistence.
// (SUBSPEC-G §2.1, §3.1, §4.1; research decisions G-6.1 .. G-6.4)
//
// Pure TypeScript, zero framework/browser/Node/Three.js/MCP imports. Persistence is expressed as
// serialization only: the browser (or tests) supplies the storage, so this module never touches
// localStorage, the DOM, or a window object.
//
// G-6.3: layout state is a viewport preference, never schematic document data — nothing here is
// keyed by project or written into a .vxproj.

// ============================================================================
// Types (SPEC-G §2.1)
// ============================================================================

export type PanelConfig = {
  id: string;
  position: 'left' | 'right' | 'bottom' | 'floating';
  width?: number;
  height?: number;
  collapsed: boolean;
  docked: boolean;
  order: number;
};

export type WorkspaceLayout = {
  panels: PanelConfig[];
  /** The viewport always takes the remaining space (G1). */
  viewportDominant: boolean;
  savedLayouts: Record<string, PanelConfig[]>;
  activeLayout: string;
};

export type PanelId = 'hierarchy' | 'inspector' | 'viewport' | 'bottom-dock' | 'toolbar';

/** Panel wrapped with the computed viewport geometry returned by `resolveLayout`. */
export type ResolvedLayout = WorkspaceLayout & {
  /** The viewport's computed size. Zero width means "not measured" (no window size supplied). */
  viewport: { width: number; height: number };
  /**
   * True when the window is too small for the panel floors plus the viewport floor (120+120+400).
   * SPEC-G G-4 puts the supported minimum at 1024×768, so this only happens below contract; the UI
   * must surface it as a "window too small" state rather than silently overflowing.
   */
  overflow: { horizontal: boolean; vertical: boolean };
};

export type WindowSize = { width: number; height: number };

export type LayoutValidation =
  | { ok: true }
  | { ok: false; reasons: string[] };

// ============================================================================
// Constants (G1, §4.1, G-6.1)
// ============================================================================

/** The panel id set from G1. */
export const PANEL_IDS: readonly PanelId[] = [
  'hierarchy',
  'inspector',
  'viewport',
  'bottom-dock',
  'toolbar',
];

/** G1 locked proportions. The viewport is the remainder, hence 'dominant'. */
export const DEFAULT_PANEL_PROPORTIONS = {
  hierarchy: 260,
  inspector: 320,
  'bottom-dock': 220,
  viewport: 'dominant',
} as const;

export const MIN_PANEL_WIDTH = 120;
export const MIN_PANEL_HEIGHT = 80;
export const MIN_VIEWPORT_WIDTH = 400;
export const MIN_VIEWPORT_HEIGHT = 300;

/** WCAG 2.2 SC 2.5.8 (Level AA) — applies to the controls inside panels (G-6.1). */
export const MIN_POINTER_TARGET_PX = 24;

/** Bumped when the persisted shape changes; a mismatch resets or migrates (G-6.2). */
export const LAYOUT_SCHEMA_VERSION = 1;

/** The active layout name for the G1 defaults. */
export const DEFAULT_LAYOUT_NAME = 'default';

// ============================================================================
// Default layout
// ============================================================================

const DEFAULT_PANELS: readonly PanelConfig[] = [
  { id: 'hierarchy', position: 'left', width: 260, collapsed: false, docked: true, order: 0 },
  { id: 'viewport', position: 'floating', collapsed: false, docked: true, order: 1 },
  { id: 'inspector', position: 'right', width: 320, collapsed: false, docked: true, order: 2 },
  { id: 'bottom-dock', position: 'bottom', height: 220, collapsed: false, docked: true, order: 3 },
];

/** Deep, independent copy of a panel list. */
function clonePanels(panels: readonly PanelConfig[]): PanelConfig[] {
  return panels.map((panel) => ({ ...panel }));
}

/**
 * A fresh G1 default layout. Always returns independent copies: two calls never share a panel
 * object, so mutating one layout cannot silently reflow another (a real bug when a default object
 * is returned by reference).
 */
export function createDefaultLayout(): WorkspaceLayout {
  const panels = clonePanels(DEFAULT_PANELS);
  return {
    panels,
    viewportDominant: true,
    savedLayouts: { [DEFAULT_LAYOUT_NAME]: clonePanels(panels) },
    activeLayout: DEFAULT_LAYOUT_NAME,
  };
}

/** The G1 default, exported for convenience. Treat it as read-only; call `createDefaultLayout()`. */
export const DEFAULT_LAYOUT: Readonly<WorkspaceLayout> = Object.freeze(createDefaultLayout());

// ============================================================================
// Lookup
// ============================================================================

export function panelById(layout: WorkspaceLayout, id: string): PanelConfig | undefined {
  return layout.panels.find((panel) => panel.id === id);
}

function isKnownPanelId(id: string): id is PanelId {
  return (PANEL_IDS as readonly string[]).includes(id);
}

function isPositiveInteger(value: number): boolean {
  return Number.isInteger(value) && value > 0;
}

// ============================================================================
// Clamping (G-6.4)
// ============================================================================

/**
 * Clamp a panel dimension to its floor. There is no artificial ceiling: a docked panel may be as
 * large as the window allows, and `resolveLayout` is what protects the viewport's floor.
 */
export function clampPanelSize(dimension: 'width' | 'height', value: number): number {
  const floor = dimension === 'width' ? MIN_PANEL_WIDTH : MIN_PANEL_HEIGHT;
  if (!Number.isInteger(value)) return floor;
  return Math.max(floor, value);
}

// ============================================================================
// Validation (SPEC-G §4.1)
// ============================================================================

/**
 * Validate a layout structurally. Reports every reason rather than the first, so a caller can log
 * one useful message instead of discovering problems one reload at a time.
 */
export function validateLayout(layout: WorkspaceLayout): LayoutValidation {
  const reasons: string[] = [];

  if (!Array.isArray(layout.panels)) {
    return { ok: false, reasons: ['panels is not an array'] };
  }
  if (layout.viewportDominant !== true) {
    reasons.push('the viewport must remain dominant (G1)');
  }
  if (typeof layout.activeLayout !== 'string' || layout.activeLayout.length === 0) {
    reasons.push('activeLayout must be a non-empty string');
  }
  if (layout.savedLayouts === null || typeof layout.savedLayouts !== 'object') {
    reasons.push('savedLayouts must be an object');
  }

  const seen = new Set<string>();
  for (const panel of layout.panels) {
    if (typeof panel.id !== 'string' || !isKnownPanelId(panel.id)) {
      reasons.push(`unknown panel id: ${String(panel.id)}`);
      continue;
    }
    if (seen.has(panel.id)) {
      reasons.push(`duplicate panel id: ${panel.id}`);
    }
    seen.add(panel.id);

    if (!['left', 'right', 'bottom', 'floating'].includes(panel.position)) {
      reasons.push(`${panel.id}: invalid position "${String(panel.position)}"`);
    }
    if (panel.width !== undefined) {
      if (!isPositiveInteger(panel.width)) {
        reasons.push(`${panel.id}: width must be a positive integer, got ${panel.width}`);
      } else if (panel.width < MIN_PANEL_WIDTH) {
        reasons.push(`${panel.id}: width ${panel.width} is below the ${MIN_PANEL_WIDTH}px minimum`);
      }
    }
    if (panel.height !== undefined) {
      if (!isPositiveInteger(panel.height)) {
        reasons.push(`${panel.id}: height must be a positive integer, got ${panel.height}`);
      } else if (panel.height < MIN_PANEL_HEIGHT) {
        reasons.push(`${panel.id}: height ${panel.height} is below the ${MIN_PANEL_HEIGHT}px minimum`);
      }
    }
    if (typeof panel.collapsed !== 'boolean' || typeof panel.docked !== 'boolean') {
      reasons.push(`${panel.id}: collapsed and docked must be booleans`);
    }
    if (!Number.isInteger(panel.order)) {
      reasons.push(`${panel.id}: order must be an integer`);
    }
  }

  return reasons.length === 0 ? { ok: true } : { ok: false, reasons };
}

// ============================================================================
// Resolution (G-6.4)
// ============================================================================

/**
 * Turn any layout (possibly persisted and stale) into a usable one:
 *   - structurally broken (unknown panel, duplicate, missing activeLayout) ⇒ the default layout
 *   - repairable (a panel below its floor) ⇒ that panel is clamped
 *   - a required panel is missing ⇒ restored from the default
 *   - a window size is supplied ⇒ the viewport is computed and its 400×300 floor enforced by
 *     shrinking side panels in proportion before the viewport is allowed to go under.
 */
export function resolveLayout(layout: WorkspaceLayout, window?: WindowSize): ResolvedLayout {
  const structural = validateLayout({
    ...layout,
    // A repairable size problem must not trigger a full reset, so sizes are checked separately.
    panels: Array.isArray(layout.panels)
      ? layout.panels.map((panel) => ({
          ...panel,
          width: panel.width !== undefined && isPositiveInteger(panel.width) ? Math.max(panel.width, MIN_PANEL_WIDTH) : panel.width,
          height: panel.height !== undefined && isPositiveInteger(panel.height) ? Math.max(panel.height, MIN_PANEL_HEIGHT) : panel.height,
        }))
      : layout.panels,
  });

  const unrecoverable =
    structural.ok === false &&
    structural.reasons.some(
      (reason) =>
        reason.startsWith('unknown panel id') ||
        reason.startsWith('duplicate panel id') ||
        reason.includes('panels is not an array') ||
        reason.includes('activeLayout must be'),
    );

  let working: WorkspaceLayout;
  if (unrecoverable) {
    working = createDefaultLayout();
  } else {
    working = {
      ...layout,
      panels: clonePanels(layout.panels),
      savedLayouts: { ...layout.savedLayouts },
    };
  }

  // Restore any required panel that is absent (a partial persisted layout).
  for (const defaultPanel of DEFAULT_PANELS) {
    if (!working.panels.some((panel) => panel.id === defaultPanel.id)) {
      working.panels.push({ ...defaultPanel });
    }
  }

  // Clamp every dimension to its floor.
  for (const panel of working.panels) {
    if (panel.width !== undefined) panel.width = clampPanelSize('width', panel.width);
    if (panel.height !== undefined) panel.height = clampPanelSize('height', panel.height);
  }

  working.viewportDominant = true;

  // Compute the viewport geometry when a window size is known.
  if (window === undefined) {
    return { ...working, viewport: { width: 0, height: 0 }, overflow: { horizontal: false, vertical: false } };
  }

  const left = working.panels.filter((panel) => panel.position === 'left' && !panel.collapsed);
  const right = working.panels.filter((panel) => panel.position === 'right' && !panel.collapsed);
  const bottom = working.panels.filter((panel) => panel.position === 'bottom' && !panel.collapsed);

  const sumWidths = (panels: PanelConfig[]) =>
    panels.reduce((total, panel) => total + (panel.width ?? MIN_PANEL_WIDTH), 0);

  let leftWidth = sumWidths(left);
  let rightWidth = sumWidths(right);
  const bottomHeight = bottom.reduce((total, panel) => total + (panel.height ?? MIN_PANEL_HEIGHT), 0);

  // Enforce the viewport floor by shrinking the side panels proportionally, never by hiding them.
  const availableForViewport = window.width - MIN_VIEWPORT_WIDTH;
  while (leftWidth + rightWidth > availableForViewport && (leftWidth > 0 || rightWidth > 0)) {
    const total = leftWidth + rightWidth;
    if (total <= 0) break;
    const pressure = (total - availableForViewport) / total;
    const shrinkLeft = Math.ceil(leftWidth * pressure);
    const shrinkRight = Math.ceil(rightWidth * pressure);
    leftWidth = Math.max(0, leftWidth - Math.max(1, shrinkLeft));
    rightWidth = Math.max(0, rightWidth - Math.max(1, shrinkRight));
    if (leftWidth === 0 && rightWidth === 0) break;
  }

  const viewportWidth = Math.max(MIN_VIEWPORT_WIDTH, window.width - leftWidth - rightWidth);
  const viewportHeight = Math.max(MIN_VIEWPORT_HEIGHT, window.height - bottomHeight);

  // Write the (possibly shrunk) widths back so the caller renders what was measured.
  const leftPanels = left;
  if (leftPanels.length > 0 && leftWidth > 0) {
    const per = Math.max(MIN_PANEL_WIDTH, Math.floor(leftWidth / leftPanels.length));
    for (const panel of leftPanels) panel.width = per;
  }
  const rightPanels = right;
  if (rightPanels.length > 0 && rightWidth > 0) {
    const per = Math.max(MIN_PANEL_WIDTH, Math.floor(rightWidth / rightPanels.length));
    for (const panel of rightPanels) panel.width = per;
  }

  // Sum what will actually be rendered, after the writeback above.
  const finalLeft = working.panels
    .filter((panel) => panel.position === 'left' && !panel.collapsed)
    .reduce((total, panel) => total + (panel.width ?? MIN_PANEL_WIDTH), 0);
  const finalRight = working.panels
    .filter((panel) => panel.position === 'right' && !panel.collapsed)
    .reduce((total, panel) => total + (panel.width ?? MIN_PANEL_WIDTH), 0);

  return {
    ...working,
    viewport: { width: viewportWidth, height: viewportHeight },
    overflow: {
      horizontal: finalLeft + finalRight + viewportWidth > window.width,
      vertical: bottomHeight + viewportHeight > window.height,
    },
  };
}

// ============================================================================
// Persistence (G-6.2)
// ============================================================================

export type SavedLayoutEnvelope = {
  version: number;
  serialized: string;
};

/** Persisted form. The envelope carries the schema version so a stale blob can be rejected. */
export type PersistedLayout = {
  version: number;
  /** Panels of the layout named `activeLayout`. */
  panels: PanelConfig[];
  savedLayouts: Record<string, PanelConfig[]>;
  activeLayout: string;
};

/**
 * Serialize a layout under a (possibly new) name. Returns the envelope the caller stores; this
 * module never touches storage itself (no browser/Node imports).
 */
export function saveLayout(layout: WorkspaceLayout, name: string = layout.activeLayout): SavedLayoutEnvelope {
  const panels = clonePanels(layout.panels);
  const savedLayouts: Record<string, PanelConfig[]> = {
    ...layout.savedLayouts,
    [name]: clonePanels(panels),
  };
  const persisted: PersistedLayout = {
    version: LAYOUT_SCHEMA_VERSION,
    panels,
    savedLayouts,
    activeLayout: name,
  };
  return { version: LAYOUT_SCHEMA_VERSION, serialized: JSON.stringify(persisted) };
}

/**
 * Deserialize a stored layout. Anything unusable — absent, corrupt, or from an unknown schema
 * version — yields the default layout instead of a half-applied one (G-6.2). A migration step can
 * be registered later; until one exists, the default is the only safe outcome.
 */
export function loadLayout(serialized: string | null | undefined, name?: string): WorkspaceLayout {
  if (serialized === null || serialized === undefined || serialized.length === 0) {
    return createDefaultLayout();
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized);
  } catch {
    return createDefaultLayout();
  }

  if (parsed === null || typeof parsed !== 'object') return createDefaultLayout();
  const candidate = parsed as Partial<PersistedLayout>;

  if (candidate.version !== LAYOUT_SCHEMA_VERSION) {
    // Future or legacy schema: reset rather than guess at the shape.
    return createDefaultLayout();
  }
  if (!Array.isArray(candidate.panels) || !isRecord(candidate.savedLayouts)) {
    return createDefaultLayout();
  }

  const activeLayout = name ?? (typeof candidate.activeLayout === 'string' ? candidate.activeLayout : DEFAULT_LAYOUT_NAME);
  const panels = activeLayout === DEFAULT_LAYOUT_NAME && name === undefined
    ? candidate.panels
    : candidate.savedLayouts[activeLayout] ?? candidate.panels;

  const layout: WorkspaceLayout = {
    panels: clonePanels(panels as PanelConfig[]),
    viewportDominant: true,
    savedLayouts: clonePanelsRecord(candidate.savedLayouts),
    activeLayout,
  };
  return resolveLayout(layout);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function clonePanelsRecord(
  record: Record<string, PanelConfig[] | unknown>,
): Record<string, PanelConfig[]> {
  const out: Record<string, PanelConfig[]> = {};
  for (const [key, value] of Object.entries(record)) {
    if (Array.isArray(value)) out[key] = clonePanels(value as PanelConfig[]);
  }
  return out;
}

/**
 * Reset to the G1 default proportions, leaving the input untouched. This is the "Restore default
 * layout" action (G1).
 */
export function restoreDefaultLayout(_current: WorkspaceLayout): WorkspaceLayout {
  return createDefaultLayout();
}

// ============================================================================
// Undo-availability note for the Agent Log panel
// ============================================================================

/**
 * SPEC-G §6.4 shows a one-click undo in the Agent Log panel, but SPEC-F §8.2 restricts it to the
 * latest undoable action. The rule lives in `agent-log.ts` (`isUndoAvailable`); this module only
 * exposes the panel identity. Tracked as DOUBTS D-8.
 */
export const AGENT_LOG_PANEL_UNDO_SOURCE = 'apps/mcp-companion agent-log.isUndoAvailable';