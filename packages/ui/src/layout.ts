// packages/ui/src/layout.ts
// Layout behaviour: resize, collapse, dock, reorder, persist — all routed through resolveLayout
// (SUBSPEC-G §3.1, §4.1, §6.1; research decisions G-6.1..G-6.4).
//
// Pure TypeScript, zero framework/browser/Node/Three.js/MCP imports. Pointer events arrive as
// normalised descriptors; the controller never touches the DOM, the window, or storage. Storage
// is the caller's job (saveLayout/loadLayout serialise to a string).

import {
  createDefaultLayout,
  panelById,
  resolveLayout,
  saveLayout,
  loadLayout,
  validateLayout,
  type WorkspaceLayout,
  type WindowSize,
  type PanelConfig,
} from './layout-types.ts';

// ============================================================================
// Types
// ============================================================================

export type LayoutController = {
  state(): WorkspaceLayout;
  /** Relative resize: `delta.width` is added to the panel's current width. */
  resizePanel(id: string, delta: { width?: number; height?: number }, window: WindowSize): void;
  collapsePanel(id: string, window?: WindowSize): void;
  expandPanel(id: string, window?: WindowSize): void;
  toggleCollapse(id: string, window?: WindowSize): void;
  dockPanel(id: string, window?: WindowSize): void;
  undockPanel(id: string, window?: WindowSize): void;
  /** Reorder the bottom-dock panels. Unknown ids are dropped; existing ids keep their relative order. */
  reorderTabs(order: string[]): void;
  saveNamedLayout(name: string): ReturnType<typeof saveLayout>;
  loadNamedLayout(name: string): boolean;
  deleteNamedLayout(name: string): boolean;
  renameLayout(from: string, to: string): boolean;
  resetLayout(): void;
  isCollapsed(id: string): boolean;
  visiblePanelIds(): string[];
  bottomTabs(): string[];
};

export type LayoutControllerOptions = {
  initial?: WorkspaceLayout;
  window?: WindowSize;
};

// ============================================================================
// Factory
// ============================================================================

export function createLayoutController(
  initial?: WorkspaceLayout,
  window?: WindowSize,
): LayoutController {
  // Clone the input so the controller never mutates its caller's state.
  let layout: WorkspaceLayout = initial === undefined
    ? createDefaultLayout()
    : {
        ...initial,
        panels: initial.panels.map((panel) => ({ ...panel })),
        savedLayouts: { ...initial.savedLayouts },
      };

  // A supplied window size is remembered so mutations without one stay size-neutral.
  let lastWindow: WindowSize | undefined = window;

  function state(): WorkspaceLayout {
    return {
      ...layout,
      panels: layout.panels.map((panel) => ({ ...panel })),
      savedLayouts: { ...layout.savedLayouts },
    };
  }

  function applyResolved(next: WorkspaceLayout, window: WindowSize | undefined): void {
    layout = window === undefined
      ? { ...next, viewportDominant: true }
      : resolveLayout(next, window);
    layout.viewportDominant = true;
  }

  function resizePanel(id: string, delta: { width?: number; height?: number }, window: WindowSize): void {
    const panel = layout.panels.find((candidate) => candidate.id === id);
    if (panel === undefined) return;
    if (panel.collapsed) return; // a collapsed panel cannot be resized until expanded

    const next = {
      ...layout,
      panels: layout.panels.map((candidate) =>
        candidate.id === id
          ? {
              ...candidate,
              width: delta.width !== undefined && candidate.width !== undefined
                ? candidate.width + delta.width
                : candidate.width,
              height: delta.height !== undefined && candidate.height !== undefined
                ? candidate.height + delta.height
                : candidate.height,
            }
          : { ...candidate },
      ),
      savedLayouts: { ...layout.savedLayouts },
    };
    lastWindow = window;
    applyResolved(next, window);
  }

  function collapsePanel(id: string, window?: WindowSize): void {
    const panel = layout.panels.find((candidate) => candidate.id === id);
    if (panel === undefined) return;
    if (panel.collapsed) return;

    const next = {
      ...layout,
      panels: layout.panels.map((candidate) =>
        candidate.id === id ? { ...candidate, collapsed: true } : { ...candidate },
      ),
      savedLayouts: { ...layout.savedLayouts },
    };
    if (window !== undefined) lastWindow = window;
    applyResolved(next, window ?? lastWindow);
  }

  function expandPanel(id: string, window?: WindowSize): void {
    const panel = layout.panels.find((candidate) => candidate.id === id);
    if (panel === undefined) return;
    if (!panel.collapsed) return;

    const next = {
      ...layout,
      panels: layout.panels.map((candidate) =>
        candidate.id === id ? { ...candidate, collapsed: false } : { ...candidate },
      ),
      savedLayouts: { ...layout.savedLayouts },
    };
    if (window !== undefined) lastWindow = window;
    applyResolved(next, window ?? lastWindow);
  }

  function toggleCollapse(id: string, window?: WindowSize): void {
    const panel = layout.panels.find((candidate) => candidate.id === id);
    if (panel === undefined) return;
    if (panel.collapsed) expandPanel(id, window);
    else collapsePanel(id, window);
  }

  function dockPanel(id: string, window?: WindowSize): void {
    const panel = layout.panels.find((candidate) => candidate.id === id);
    if (panel === undefined) return;
    if (panel.docked) return;

    const next = {
      ...layout,
      panels: layout.panels.map((candidate) =>
        candidate.id === id ? { ...candidate, docked: true } : { ...candidate },
      ),
      savedLayouts: { ...layout.savedLayouts },
    };
    if (window !== undefined) lastWindow = window;
    applyResolved(next, window ?? lastWindow);
  }

  function undockPanel(id: string, window?: WindowSize): void {
    const panel = layout.panels.find((candidate) => candidate.id === id);
    if (panel === undefined) return;
    if (!panel.docked) return;

    const next = {
      ...layout,
      panels: layout.panels.map((candidate) =>
        candidate.id === id ? { ...candidate, docked: false } : { ...candidate },
      ),
      savedLayouts: { ...layout.savedLayouts },
    };
    if (window !== undefined) lastWindow = window;
    applyResolved(next, window ?? lastWindow);
  }

  function reorderTabs(order: string[]): void {
    const existing = new Set(layout.panels.map((panel) => panel.id));
    const ordered = order.filter((id) => existing.has(id));
    // Only panels that are actually in the bottom dock can be reordered.
    const bottomDockIds = layout.panels
      .filter((panel) => panel.position === 'bottom')
      .map((panel) => panel.id);
    const reorderable = ordered.filter((id) => bottomDockIds.includes(id));
    if (reorderable.length === 0) return;

    const next = {
      ...layout,
      panels: layout.panels.map((panel) => {
        const index = reorderable.indexOf(panel.id);
        if (index === -1) return { ...panel };
        return { ...panel, order: index };
      }),
      savedLayouts: { ...layout.savedLayouts },
    };
    applyResolved(next, lastWindow);
  }

  function saveNamedLayout(name: string): ReturnType<typeof saveLayout> {
    const envelope = saveLayout(layout, name);
    layout = {
      ...layout,
      activeLayout: name,
      savedLayouts: {
        ...layout.savedLayouts,
        [name]: layout.panels.map((panel) => ({ ...panel })),
      },
    };
    return envelope;
  }

  function loadNamedLayout(name: string): boolean {
    if (layout.savedLayouts[name] === undefined) return false;
    const panels = layout.savedLayouts[name];
    const next: WorkspaceLayout = {
      ...layout,
      panels: panels.map((panel) => ({ ...panel })),
      activeLayout: name,
      savedLayouts: { ...layout.savedLayouts },
    };
    applyResolved(next, lastWindow);
    return true;
  }

  function deleteNamedLayout(name: string): boolean {
    if (name === 'default') return false;
    if (name === layout.activeLayout) return false;
    if (layout.savedLayouts[name] === undefined) return false;
    const savedLayouts = { ...layout.savedLayouts };
    delete savedLayouts[name];
    layout = { ...layout, savedLayouts };
    return true;
  }

  function renameLayout(from: string, to: string): boolean {
    if (from === 'default' || to === 'default') return false;
    if (layout.savedLayouts[from] === undefined) return false;
    if (layout.savedLayouts[to] !== undefined) return false;
    const savedLayouts = { ...layout.savedLayouts };
    savedLayouts[to] = savedLayouts[from].map((panel) => ({ ...panel }));
    delete savedLayouts[from];
    layout = { ...layout, savedLayouts };
    if (layout.activeLayout === from) layout = { ...layout, activeLayout: to };
    return true;
  }

  function resetLayout(): void {
    const next = createDefaultLayout();
    next.savedLayouts = { ...layout.savedLayouts };
    applyResolved(next, lastWindow);
  }

  function isCollapsed(id: string): boolean {
    return layout.panels.find((panel) => panel.id === id)?.collapsed ?? false;
  }

  function visiblePanelIds(): string[] {
    return layout.panels.filter((panel) => !panel.collapsed).map((panel) => panel.id);
  }

  function bottomTabs(): string[] {
    return layout.panels
      .filter((panel) => panel.position === 'bottom')
      .sort((a, b) => a.order - b.order)
      .map((panel) => panel.id);
  }

  return {
    state,
    resizePanel,
    collapsePanel,
    expandPanel,
    toggleCollapse,
    dockPanel,
    undockPanel,
    reorderTabs,
    saveNamedLayout,
    loadNamedLayout,
    deleteNamedLayout,
    renameLayout,
    resetLayout,
    isCollapsed,
    visiblePanelIds,
    bottomTabs,
  };
}
