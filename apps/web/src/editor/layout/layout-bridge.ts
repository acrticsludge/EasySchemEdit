// apps/web/src/editor/layout/layout-bridge.ts
// Pure TS bridge connecting @easyschemedit/ui controllers with EditorSessionStore and StorageLike persistence.
// Runs in browser and in Node unit tests without DOM (Slice E3.4, SUBSPEC-G §§1–8).

import type {
  LayoutController,
  Outliner,
  Inspector,
  BottomPanels,
  StatusBar,
  ShortcutHandler,
  WorkspaceLayout,
  WindowSize,
  PlacementRow,
  ImportGroup,
  Transform as UiTransform,
  Rotation,
  MirrorAxis,
  BottomTabId,
  KeyDescriptor,
  ConflictIndicator,
} from '@easyschemedit/ui';
import {
  createLayoutController,
  createOutliner,
  createInspector,
  createBottomPanels,
  createStatusBar,
  createShortcutHandler,
  createDefaultLayout,
  loadLayout,
  saveLayout,
  DEFAULT_LAYOUT_NAME,
} from '@easyschemedit/ui';
import type { EditorSessionStore } from '../session-store.ts';
import type { Vec3i, Vec3Half, Placement } from '@easyschemedit/domain';

// ============================================================================
// Types & Storage Interface
// ============================================================================

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
}

export const DEFAULT_LAYOUT_STORAGE_KEY = 'easyschemedit:workspace-layout:v1';

export type AnyEditorSessionStore = {
  readonly session?: any;
  getSnapshot: () => any;
  subscribe: (listener: () => void) => () => void;
  setSelectedTool: (tool: string) => void;
  setActiveBottomTab: (tab: string | null) => void;
  setImportReport?: (report: any | null) => void;
  setStatusMessage?: (message: string | null) => void;
  execute: (cmd: any, opts?: any) => Promise<any>;
  query: <T>(q: any) => Promise<T>;
  undo: () => Promise<any>;
  redo: () => Promise<any>;
  canUndo: () => boolean;
  canRedo: () => boolean;
  dispose: () => void;
};

export interface WorkspaceBridgeOptions {
  storage?: StorageLike;
  storageKey?: string;
  initialWindow?: WindowSize;
  onNotification?: (message: string, level?: 'info' | 'warning' | 'error') => void;
}

export interface WorkspaceControllers {
  readonly layout: LayoutController;
  readonly outliner: Outliner;
  readonly inspector: Inspector;
  readonly bottomPanels: BottomPanels;
  readonly statusBar: StatusBar;
  readonly shortcuts: ShortcutHandler;

  // Direct bridge actions
  togglePlacementVisibility: (placementId: string) => Promise<boolean>;
  togglePlacementLock: (placementId: string) => Promise<boolean>;
  selectPlacement: (placementId: string | null) => void;
  movePlacement: (placementId: string, translation: Vec3i) => Promise<boolean>;
  rotatePlacement: (placementId: string, rotation: 0 | 90 | 180 | 270) => Promise<boolean>;
  mirrorPlacement: (placementId: string, mirror: 'none' | 'x' | 'z') => Promise<boolean>;
  renamePlacement: (placementId: string, name: string) => Promise<boolean>;
  setPlacementOrigin: (placementId: string, origin: Vec3Half, keepBlocksInPlace?: boolean) => Promise<boolean>;

  persistLayout: () => void;
  sync: () => void;
  dispose: () => void;
}

// ============================================================================
// In-Memory Storage Helper (useful for testing or SSR)
// ============================================================================

export class MemoryStorage implements StorageLike {
  private map = new Map<string, string>();

  public getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }

  public setItem(key: string, value: string): void {
    this.map.set(key, value);
  }

  public removeItem(key: string): void {
    this.map.delete(key);
  }

  public clear(): void {
    this.map.clear();
  }
}

// ============================================================================
// Factory
// ============================================================================

export function createWorkspaceControllers(
  store: EditorSessionStore | AnyEditorSessionStore,
  storageOrOptions?: StorageLike | WorkspaceBridgeOptions,
  maybeOptions?: WorkspaceBridgeOptions,
): WorkspaceControllers {
  let storage: StorageLike | undefined;
  let options: WorkspaceBridgeOptions = {};

  if (storageOrOptions && typeof (storageOrOptions as StorageLike).getItem === 'function') {
    storage = storageOrOptions as StorageLike;
    options = maybeOptions ?? {};
  } else if (storageOrOptions) {
    options = storageOrOptions as WorkspaceBridgeOptions;
    storage = options.storage;
  }

  const storageKey = options.storageKey ?? DEFAULT_LAYOUT_STORAGE_KEY;
  const initialWindow = options.initialWindow ?? { width: 1280, height: 720 };

  // --------------------------------------------------------------------------
  // 1. Layout Controller with Auto-Persistence
  // --------------------------------------------------------------------------
  let initialLayout: WorkspaceLayout;
  if (storage) {
    try {
      const raw = storage.getItem(storageKey);
      initialLayout = loadLayout(raw);
    } catch {
      initialLayout = createDefaultLayout();
    }
  } else {
    initialLayout = createDefaultLayout();
  }

  const rawLayoutController = createLayoutController(initialLayout, initialWindow);

  function persistLayout(): void {
    if (storage) {
      try {
        const envelope = saveLayout(rawLayoutController.state());
        storage.setItem(storageKey, envelope.serialized);
      } catch (err) {
        console.error('Failed to persist layout to storage:', err);
      }
    }
  }

  const layout: LayoutController = {
    state: () => rawLayoutController.state(),
    resizePanel: (id, delta, win) => {
      rawLayoutController.resizePanel(id, delta, win);
      persistLayout();
    },
    collapsePanel: (id, win) => {
      rawLayoutController.collapsePanel(id, win);
      persistLayout();
    },
    expandPanel: (id, win) => {
      rawLayoutController.expandPanel(id, win);
      persistLayout();
    },
    toggleCollapse: (id, win) => {
      rawLayoutController.toggleCollapse(id, win);
      persistLayout();
    },
    dockPanel: (id, win) => {
      rawLayoutController.dockPanel(id, win);
      persistLayout();
    },
    undockPanel: (id, win) => {
      rawLayoutController.undockPanel(id, win);
      persistLayout();
    },
    reorderTabs: (order) => {
      rawLayoutController.reorderTabs(order);
      persistLayout();
    },
    saveNamedLayout: (name) => {
      const res = rawLayoutController.saveNamedLayout(name);
      persistLayout();
      return res;
    },
    loadNamedLayout: (name) => {
      const res = rawLayoutController.loadNamedLayout(name);
      persistLayout();
      return res;
    },
    deleteNamedLayout: (name) => {
      const res = rawLayoutController.deleteNamedLayout(name);
      persistLayout();
      return res;
    },
    renameLayout: (from, to) => {
      const res = rawLayoutController.renameLayout(from, to);
      persistLayout();
      return res;
    },
    resetLayout: () => {
      rawLayoutController.resetLayout();
      persistLayout();
    },
    isCollapsed: (id) => rawLayoutController.isCollapsed(id),
    visiblePanelIds: () => rawLayoutController.visiblePanelIds(),
    bottomTabs: () => rawLayoutController.bottomTabs(),
  };

  // --------------------------------------------------------------------------
  // 2. Outliner & Placement Synchronization
  // --------------------------------------------------------------------------
  let selectedPlacementIds: string[] = [];
  let expandedGroupIds = new Set<string>();

  function computePlacementRows(): PlacementRow[] {
    const snap = store.getSnapshot();
    const placements: Placement[] = snap.project?.placements ?? [];
    const importGroups: ImportGroup[] = snap.project?.importGroups ?? [];

    return placements.map((p: Placement) => {
      const min = p.volume?.bounds?.min ?? [0, 0, 0];
      const max = p.volume?.bounds?.maxExclusive ?? [0, 0, 0];
      const group = importGroups.find((g: ImportGroup) => g.placementIds.includes(p.id));

      return {
        id: p.id,
        groupId: group ? group.id : '',
        name: p.name,
        width: Math.max(0, max[0] - min[0]),
        height: Math.max(0, max[1] - min[1]),
        depth: Math.max(0, max[2] - min[2]),
        visible: p.visible,
        locked: p.locked,
        conflict: 'none' as ConflictIndicator,
      };
    });
  }

  function computeImportGroups(): ImportGroup[] {
    const snap = store.getSnapshot();
    const groups: ImportGroup[] = snap.project?.importGroups ?? [];
    return groups.map((g: ImportGroup) => ({
      id: g.id,
      label: (g as any).label ?? (g as any).name ?? g.id,
      expanded: expandedGroupIds.has(g.id),
      placementIds: [...g.placementIds],
    }));
  }

  const outliner: Outliner = {
    state: () => {
      const rows = computePlacementRows();
      const groups = computeImportGroups();
      const placementsMap: Record<string, PlacementRow> = {};
      for (const r of rows) placementsMap[r.id] = r;

      return {
        groups,
        placements: placementsMap,
        precedence: rows.map((r) => r.id),
        selected: [...selectedPlacementIds],
      };
    },
    groups: () => computeImportGroups(),
    placements: () => computePlacementRows(),
    flatList: () => {
      const rows = computePlacementRows();
      const groups = computeImportGroups();
      const byId = new Map(rows.map((r) => [r.id, r]));
      const result: PlacementRow[] = [];

      for (const group of groups) {
        if (!group.expanded) continue;
        for (const pid of group.placementIds) {
          const row = byId.get(pid);
          if (row) result.push(row);
        }
      }

      const grouped = new Set(groups.flatMap((g) => g.placementIds));
      for (const row of rows) {
        if (!grouped.has(row.id)) result.push(row);
      }
      return result;
    },
    toggleGroup: (id) => {
      if (expandedGroupIds.has(id)) {
        expandedGroupIds.delete(id);
      } else {
        expandedGroupIds.add(id);
      }
    },
    setGroupExpanded: (id, expanded) => {
      if (expanded) expandedGroupIds.add(id);
      else expandedGroupIds.delete(id);
    },
    toggleVisibility: (id) => {
      void togglePlacementVisibility(id);
    },
    toggleLock: (id) => {
      void togglePlacementLock(id);
    },
    bulkVisibility: (ids, visible) => {
      for (const id of ids) {
        void store.execute({
          type: 'placement:setHidden',
          placementId: id,
          hidden: !visible,
          visible,
        });
      }
    },
    bulkLock: (ids, locked) => {
      for (const id of ids) {
        void store.execute({
          type: 'placement:setLocked',
          placementId: id,
          locked,
        });
      }
    },
    bulkDelete: (ids) => {
      for (const id of ids) {
        void store.execute({
          type: 'placement:delete',
          placementId: id,
        });
      }
    },
    movePlacement: (_id, _toIndex) => {
      // In-memory precedence reordering placeholder
    },
    moveSelectionUp: () => {},
    moveSelectionDown: () => {},
    select: (id, mode) => {
      if (mode === 'replace') {
        selectedPlacementIds = [id];
      } else if (mode === 'toggle') {
        if (selectedPlacementIds.includes(id)) {
          selectedPlacementIds = selectedPlacementIds.filter((x) => x !== id);
        } else {
          selectedPlacementIds.push(id);
        }
      } else if (mode === 'range') {
        if (!selectedPlacementIds.includes(id)) {
          selectedPlacementIds.push(id);
        }
      }
      selectPlacement(selectedPlacementIds[0] ?? null);
    },
    clearSelection: () => {
      selectedPlacementIds = [];
      selectPlacement(null);
    },
    selectedIds: () => [...selectedPlacementIds],
    precedenceOrder: () => computePlacementRows().map((r) => r.id),
    contextMenuActions: (id) => {
      const p = (store.getSnapshot().project.placements as Placement[]).find((x: Placement) => x.id === id);
      const isLocked = p?.locked ?? false;
      return [
        { action: 'duplicate', enabled: !isLocked },
        { action: 'delete', enabled: !isLocked },
        { action: 'bake', enabled: !isLocked },
        { action: 'export', enabled: true },
        { action: 'set-origin', enabled: !isLocked },
        { action: 'focus', enabled: true },
        { action: p?.visible ? 'hide' : 'show', enabled: true },
        { action: isLocked ? 'unlock' : 'lock', enabled: true },
      ];
    },
    isLocked: (id) => {
      const p = (store.getSnapshot().project.placements as Placement[]).find((x: Placement) => x.id === id);
      return p?.locked ?? false;
    },
    conflictOf: (_id) => 'none',
  };

  // --------------------------------------------------------------------------
  // 3. Inspector Controller
  // --------------------------------------------------------------------------
  const rawInspector = createInspector({
    activeTool: store.getSnapshot().selectedTool,
    selectedPlacementId: null,
  });

  function updateInspectorForPlacement(p: Placement | null | undefined): void {
    if (!p) {
      rawInspector.setSelection(null);
      return;
    }
    rawInspector.setSelection(p.id);

    const tx = p.transform.translation[0];
    const ty = p.transform.translation[1];
    const tz = p.transform.translation[2];
    const ox = p.origin[0] / 2;
    const oy = p.origin[1] / 2;
    const oz = p.origin[2] / 2;
    const rot = (p.transform.rotationY ?? 0) as Rotation;
    const mirror = (p.transform.mirror ?? 'none') as MirrorAxis;

    rawInspector.setPlacementTransform({
      x: tx,
      y: ty,
      z: tz,
      originX: ox,
      originY: oy,
      originZ: oz,
      rotation: rot,
      mirror,
    });
  }

  const inspector: Inspector = {
    context: () => rawInspector.context(),
    setContext: (ctx) => rawInspector.setContext(ctx),
    setActiveTool: (tool) => {
      rawInspector.setActiveTool(tool);
      if (tool) store.setSelectedTool(tool);
    },
    setSelection: (id) => {
      rawInspector.setSelection(id);
      const p = (store.getSnapshot().project.placements as Placement[]).find((candidate: Placement) => candidate.id === id);
      updateInspectorForPlacement(p);
    },
    setPlacementTransform: (t: UiTransform) => {
      rawInspector.setPlacementTransform(t);
      const selId = rawInspector.context().selectedPlacementId;
      if (!selId) return;

      const p = (store.getSnapshot().project.placements as Placement[]).find((x: Placement) => x.id === selId);
      if (!p) return;

      const tx = p.transform.translation[0];
      const ty = p.transform.translation[1];
      const tz = p.transform.translation[2];
      const ox = p.origin[0] / 2;
      const oy = p.origin[1] / 2;
      const oz = p.origin[2] / 2;

      if (t.x !== tx || t.y !== ty || t.z !== tz) {
        void store.execute({
          type: 'placement:move',
          placementId: selId,
          translation: [t.x, t.y, t.z],
        });
      }

      if (t.rotation !== p.transform.rotationY) {
        void store.execute({
          type: 'placement:rotate',
          placementId: selId,
          rotationY: t.rotation as 0 | 90 | 180 | 270,
        });
      }

      if (t.mirror !== p.transform.mirror) {
        void store.execute({
          type: 'placement:mirror',
          placementId: selId,
          mirror: t.mirror,
        });
      }

      if (t.originX !== ox || t.originY !== oy || t.originZ !== oz) {
        const halfX = Math.round(t.originX * 2);
        const halfY = Math.round(t.originY * 2);
        const halfZ = Math.round(t.originZ * 2);
        void store.execute({
          type: 'placement:setOrigin',
          placementId: selId,
          origin: [halfX, halfY, halfZ],
        });
      }
    },
    setBlockId: (id) => rawInspector.setBlockId(id),
    setBlockState: (s) => rawInspector.setBlockState(s),
    setBlockMetadata: (m) => rawInspector.setBlockMetadata(m),
    setFidelityWarnings: (w) => rawInspector.setFidelityWarnings(w),
    view: () => rawInspector.view(),
    validatePosition: (v) => rawInspector.validatePosition(v),
    validateOrigin: (v) => rawInspector.validateOrigin(v),
    setRotation: (r) => rawInspector.setRotation(r),
    setMirror: (m) => rawInspector.setMirror(m),
    searchBlocks: (q, all) => rawInspector.searchBlocks(q, all),
    markBlockUsed: (id) => rawInspector.markBlockUsed(id),
    addToPalette: (id) => rawInspector.addToPalette(id),
    removeFromPalette: (id) => rawInspector.removeFromPalette(id),
    stepUp: (input) => rawInspector.stepUp(input),
    stepDown: (input) => rawInspector.stepDown(input),
    directType: (input, raw) => rawInspector.directType(input, raw),
  };

  // --------------------------------------------------------------------------
  // 4. Bottom Panels Controller
  // --------------------------------------------------------------------------
  const validTabs: BottomTabId[] = ['assets', 'materials', 'conflicts', 'history', 'agent-log'];
  const rawBottomPanels = createBottomPanels({
    tabs: validTabs,
    activeTab: (store.getSnapshot().activeBottomTab as BottomTabId) || 'assets',
  });

  const bottomPanels: BottomPanels = {
    state: () => rawBottomPanels.state(),
    activeTab: () => rawBottomPanels.activeTab(),
    setActiveTab: (tab: BottomTabId) => {
      rawBottomPanels.setActiveTab(tab);
      store.setActiveBottomTab(tab);
    },
    getTabState: (tab) => rawBottomPanels.getTabState(tab),
    setTabState: (tab, s) => rawBottomPanels.setTabState(tab, s),
    requestConfirm: (dialog) => rawBottomPanels.requestConfirm(dialog),
    resolveConfirm: (confirmed) => rawBottomPanels.resolveConfirm(confirmed),
    cancelConfirm: () => rawBottomPanels.cancelConfirm(),
    startProgress: (lbl, can) => rawBottomPanels.startProgress(lbl, can),
    updateProgress: (p) => rawBottomPanels.updateProgress(p),
    finishProgress: () => rawBottomPanels.finishProgress(),
    cancelProgress: () => rawBottomPanels.cancelProgress(),
    pushWarning: (w) => rawBottomPanels.pushWarning(w),
    dismissWarning: (id) => rawBottomPanels.dismissWarning(id),
    clearWarnings: () => rawBottomPanels.clearWarnings(),
    lockedTargets: () => rawBottomPanels.lockedTargets(),
    setLockedTargets: (t) => rawBottomPanels.setLockedTargets(t),
  };

  // --------------------------------------------------------------------------
  // 5. Status Bar Controller
  // --------------------------------------------------------------------------
  const statusBar = createStatusBar({
    snapStep: 1,
    gridVisible: true,
  });
  statusBar.setToolMode(store.getSnapshot().selectedTool);

  // --------------------------------------------------------------------------
  // 6. Shortcut Handler Controller
  // --------------------------------------------------------------------------
  const shortcuts = createShortcutHandler({
    platform: typeof navigator !== 'undefined' && /Mac|iPhone|iPad/i.test(navigator.userAgent) ? 'mac' : 'other',
  });

  // Ensure extended custom bindings exist in shortcut registry
  const registry = shortcuts.registry();
  if (!registry.get('toggle-hierarchy')) {
    registry.add({
      action: 'toggle-hierarchy',
      keys: 'Alt+1',
      category: 'view',
      editable: true,
      enabled: true,
    });
  }
  if (!registry.get('toggle-inspector')) {
    registry.add({
      action: 'toggle-inspector',
      keys: 'Alt+2',
      category: 'view',
      editable: true,
      enabled: true,
    });
  }
  if (!registry.get('toggle-bottom-dock')) {
    registry.add({
      action: 'toggle-bottom-dock',
      keys: 'Alt+3',
      category: 'view',
      editable: true,
      enabled: true,
    });
  }

  const rawHandleKeydown = shortcuts.handleKeydown;
  shortcuts.handleKeydown = (descriptor: KeyDescriptor, opts?: { repeat?: boolean; inTextInput?: boolean }) => {
    // Check aliases first (Ctrl+Y for redo, R for rotate, M for mirror)
    if (!opts?.inTextInput) {
      if (descriptor.ctrl && !descriptor.shift && !descriptor.alt && descriptor.key === 'y') {
        void store.redo();
        return 'redo';
      }
      if (!descriptor.ctrl && !descriptor.shift && !descriptor.alt && descriptor.key === 'r') {
        store.setSelectedTool('rotate');
        return 'rotate';
      }
      if (!descriptor.ctrl && !descriptor.shift && !descriptor.alt && descriptor.key === 'm') {
        const selId = rawInspector.context().selectedPlacementId;
        if (selId) void mirrorPlacement(selId, 'x');
        return 'mirror';
      }
    }

    const action = rawHandleKeydown(descriptor, opts);
    if (!action) return null;

    // Dispatch action to store / layout
    switch (action) {
      case 'undo':
        void store.undo();
        break;
      case 'redo':
        void store.redo();
        break;
      case 'cancel':
        void store.execute({ type: 'selection:clear' });
        break;
      case 'toggle-hierarchy':
      case 'toggle-outliner':
        layout.toggleCollapse('hierarchy');
        break;
      case 'toggle-inspector':
        layout.toggleCollapse('inspector');
        break;
      case 'toggle-bottom-dock':
      case 'toggle-dock':
        layout.toggleCollapse('bottom-dock');
        break;
      case 'move':
        store.setSelectedTool('move');
        break;
      case 'rotate':
        store.setSelectedTool('rotate');
        break;
      case 'placement-mode':
        store.setSelectedTool('select');
        break;
      case 'region-mode':
        store.setSelectedTool('cuboid');
        break;
      default:
        break;
    }

    return action;
  };

  // --------------------------------------------------------------------------
  // 7. Direct Bridge Actions
  // --------------------------------------------------------------------------

  async function togglePlacementVisibility(placementId: string): Promise<boolean> {
    const p = (store.getSnapshot().project.placements as Placement[]).find((x: Placement) => x.id === placementId);
    if (!p) return false;
    const nextHidden = p.visible; // if currently visible, next hidden is true
    const res = await store.execute({
      type: 'placement:setHidden',
      placementId,
      hidden: nextHidden,
      visible: !nextHidden,
    });
    return res.ok;
  }

  async function togglePlacementLock(placementId: string): Promise<boolean> {
    const p = (store.getSnapshot().project.placements as Placement[]).find((x: Placement) => x.id === placementId);
    if (!p) return false;
    const nextLocked = !p.locked;
    const res = await store.execute({
      type: 'placement:setLocked',
      placementId,
      locked: nextLocked,
    });
    return res.ok;
  }

  function selectPlacement(placementId: string | null): void {
    if (placementId) {
      selectedPlacementIds = [placementId];
      const p = (store.getSnapshot().project.placements as Placement[]).find((x: Placement) => x.id === placementId);
      updateInspectorForPlacement(p);
    } else {
      selectedPlacementIds = [];
      updateInspectorForPlacement(null);
    }
  }

  async function movePlacement(placementId: string, translation: Vec3i): Promise<boolean> {
    const res = await store.execute({
      type: 'placement:move',
      placementId,
      translation,
    });
    return res.ok;
  }

  async function rotatePlacement(placementId: string, rotation: 0 | 90 | 180 | 270): Promise<boolean> {
    const res = await store.execute({
      type: 'placement:rotate',
      placementId,
      rotationY: rotation,
    });
    return res.ok;
  }

  async function mirrorPlacement(placementId: string, mirror: 'none' | 'x' | 'z'): Promise<boolean> {
    const res = await store.execute({
      type: 'placement:mirror',
      placementId,
      mirror,
    });
    return res.ok;
  }

  async function renamePlacement(placementId: string, name: string): Promise<boolean> {
    const res = await store.execute({
      type: 'placement:rename',
      placementId,
      name,
    });
    return res.ok;
  }

  async function setPlacementOrigin(
    placementId: string,
    origin: Vec3Half,
    keepBlocksInPlace?: boolean,
  ): Promise<boolean> {
    const res = await store.execute({
      type: 'placement:setOrigin',
      placementId,
      origin,
      keepBlocksInPlace,
    });
    return res.ok;
  }

  // --------------------------------------------------------------------------
  // 8. Reactive Store Sync
  // --------------------------------------------------------------------------

  function sync(): void {
    const snap = store.getSnapshot();

    // 1. Tool synchronization
    if (snap.selectedTool && snap.selectedTool !== rawInspector.context().activeTool) {
      rawInspector.setActiveTool(snap.selectedTool);
      statusBar.setToolMode(snap.selectedTool);
    }

    // 2. Selected placement refresh
    const selId = rawInspector.context().selectedPlacementId;
    if (selId) {
      const p = (snap.project.placements as Placement[]).find((x: Placement) => x.id === selId);
      if (p) {
        updateInspectorForPlacement(p);
      } else {
        selectPlacement(null);
      }
    }

    // 3. Bottom tab synchronization
    if (snap.activeBottomTab && snap.activeBottomTab !== rawBottomPanels.activeTab()) {
      if (validTabs.includes(snap.activeBottomTab as BottomTabId)) {
        rawBottomPanels.setActiveTab(snap.activeBottomTab as BottomTabId);
      }
    }
  }

  const unsubscribeStore = store.subscribe(sync);

  function dispose(): void {
    unsubscribeStore();
  }

  return {
    layout,
    outliner,
    inspector,
    bottomPanels,
    statusBar,
    shortcuts,
    togglePlacementVisibility,
    togglePlacementLock,
    selectPlacement,
    movePlacement,
    rotatePlacement,
    mirrorPlacement,
    renamePlacement,
    setPlacementOrigin,
    persistLayout,
    sync,
    dispose,
  };
}
