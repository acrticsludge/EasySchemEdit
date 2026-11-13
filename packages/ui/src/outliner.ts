// packages/ui/src/outliner.ts
// Outliner model: import groups, placement rows, reorder, multi-select, context menu.
// Pure TypeScript, zero framework/browser/Node/Three.js/MCP imports.
// SUBSPEC-G §6.2 (Outliner, G2).

// ============================================================================
// Types
// ============================================================================

export type ConflictIndicator = 'none' | 'clean' | 'same-state' | 'state';

export type PlacementRow = {
  id: string;
  groupId: string;
  name: string;
  width: number;
  height: number;
  depth: number;
  visible: boolean;
  locked: boolean;
  conflict: ConflictIndicator;
};

export type ImportGroup = {
  id: string;
  label: string;
  expanded: boolean;
  placementIds: string[];
};

export type OutlinerState = {
  groups: ImportGroup[];
  placements: Record<string, PlacementRow>;
  /** Precedence order, highest first. Index 0 = top wins. */
  precedence: string[];
  selected: string[];
};

export type Outliner = {
  state(): OutlinerState;
  groups(): ImportGroup[];
  placements(): PlacementRow[];
  flatList(): PlacementRow[];
  toggleGroup(id: string): void;
  setGroupExpanded(id: string, expanded: boolean): void;
  toggleVisibility(id: string): void;
  toggleLock(id: string): void;
  bulkVisibility(ids: string[], visible: boolean): void;
  bulkLock(ids: string[], locked: boolean): void;
  bulkDelete(ids: string[]): void;
  movePlacement(id: string, toIndex: number): void;
  moveSelectionUp(): void;
  moveSelectionDown(): void;
  select(id: string, mode: 'replace' | 'toggle' | 'range'): void;
  clearSelection(): void;
  selectedIds(): string[];
  precedenceOrder(): string[];
  contextMenuActions(id: string): { action: string; enabled: boolean }[];
  isLocked(id: string): boolean;
  conflictOf(id: string): ConflictIndicator;
};

export type OutlinerOptions = {
  groups?: ImportGroup[];
  placements?: PlacementRow[];
  precedence?: string[];
};

// ============================================================================
// Context menu actions (SUBSPEC-G §6.2)
// ============================================================================

const CONTEXT_MENU_ACTIONS = [
  'duplicate',
  'delete',
  'bake',
  'export',
  'set-origin',
  'focus',
  'group',
  'ungroup',
  'hide',
  'show',
  'lock',
  'unlock',
] as const;

// Actions that are blocked when the placement is locked.
const LOCKED_BLOCKED = new Set([
  'duplicate',
  'delete',
  'bake',
  'set-origin',
  'group',
  'ungroup',
  'lock', // already locked; toggle handled separately but the explicit action is blocked
]);

// ============================================================================
// Factory
// ============================================================================

export function createOutliner(options?: OutlinerOptions): Outliner {
  const groups: ImportGroup[] = (options?.groups ?? []).map((g) => ({
    ...g,
    placementIds: [...g.placementIds],
  }));
  const placements: Record<string, PlacementRow> = {};
  for (const p of options?.placements ?? []) {
    placements[p.id] = { ...p };
  }
  let precedence: string[] = [...(options?.precedence ?? Object.keys(placements))];
  let selected: string[] = [];

  // Ensure precedence contains every placement exactly once.
  const allIds = Object.keys(placements);
  for (const id of allIds) {
    if (!precedence.includes(id)) precedence.push(id);
  }
  precedence = precedence.filter((id) => allIds.includes(id));

  function state(): OutlinerState {
    return {
      groups: groups.map((g) => ({ ...g, placementIds: [...g.placementIds] })),
      placements: Object.fromEntries(
        Object.entries(placements).map(([k, v]) => [k, { ...v }]),
      ),
      precedence: [...precedence],
      selected: [...selected],
    };
  }

  function groupsFn(): ImportGroup[] {
    return groups.map((g) => ({ ...g, placementIds: [...g.placementIds] }));
  }

  function placementsFn(): PlacementRow[] {
    return Object.values(placements).map((p) => ({ ...p }));
  }

  function flatList(): PlacementRow[] {
    const result: PlacementRow[] = [];
    for (const group of groups) {
      if (!group.expanded) continue;
      for (const pid of group.placementIds) {
        if (placements[pid]) result.push({ ...placements[pid] });
      }
    }
    // Placements not in any group are shown at the end.
    const grouped = new Set(groups.flatMap((g) => g.placementIds));
    for (const id of Object.keys(placements)) {
      if (!grouped.has(id)) result.push({ ...placements[id] });
    }
    return result;
  }

  function toggleGroup(id: string): void {
    const group = groups.find((g) => g.id === id);
    if (group) group.expanded = !group.expanded;
  }

  function setGroupExpanded(id: string, expanded: boolean): void {
    const group = groups.find((g) => g.id === id);
    if (group) group.expanded = expanded;
  }

  function toggleVisibility(id: string): void {
    if (placements[id]) placements[id].visible = !placements[id].visible;
  }

  function toggleLock(id: string): void {
    if (placements[id]) placements[id].locked = !placements[id].locked;
  }

  function bulkVisibility(ids: string[], visible: boolean): void {
    for (const id of ids) {
      if (placements[id]) placements[id].visible = visible;
    }
  }

  function bulkLock(ids: string[], locked: boolean): void {
    for (const id of ids) {
      if (placements[id]) placements[id].locked = locked;
    }
  }

  function bulkDelete(ids: string[]): void {
    for (const id of ids) {
      if (placements[id]?.locked) continue;
      delete placements[id];
      precedence = precedence.filter((p) => p !== id);
      selected = selected.filter((s) => s !== id);
      for (const group of groups) {
        group.placementIds = group.placementIds.filter((pid) => pid !== id);
      }
    }
  }

  function movePlacement(id: string, toIndex: number): void {
    const from = precedence.indexOf(id);
    if (from === -1) return;
    const clamped = Math.max(0, Math.min(precedence.length - 1, toIndex));
    const next = [...precedence];
    next.splice(from, 1);
    next.splice(clamped, 0, id);
    precedence = next;
  }

  function moveSelectionUp(): void {
    if (selected.length === 0) return;
    for (const id of selected) {
      const idx = precedence.indexOf(id);
      if (idx > 0) movePlacement(id, idx - 1);
    }
  }

  function moveSelectionDown(): void {
    if (selected.length === 0) return;
    // Move in reverse so multi-select doesn't collide.
    for (const id of [...selected].reverse()) {
      const idx = precedence.indexOf(id);
      if (idx !== -1 && idx < precedence.length - 1) movePlacement(id, idx + 1);
    }
  }

  function select(id: string, mode: 'replace' | 'toggle' | 'range'): void {
    if (mode === 'replace') {
      selected = [id];
    } else if (mode === 'toggle') {
      if (selected.includes(id)) {
        selected = selected.filter((s) => s !== id);
      } else {
        selected = [...selected, id];
      }
    } else if (mode === 'range') {
      if (selected.length === 0) {
        selected = [id];
        return;
      }
      const anchor = selected[0];
      const a = precedence.indexOf(anchor);
      const b = precedence.indexOf(id);
      if (a === -1 || b === -1) {
        selected = [id];
        return;
      }
      const [lo, hi] = a < b ? [a, b] : [b, a];
      selected = precedence.slice(lo, hi + 1);
    }
  }

  function clearSelection(): void {
    selected = [];
  }

  function selectedIds(): string[] {
    return [...selected];
  }

  function precedenceOrder(): string[] {
    return [...precedence];
  }

  function contextMenuActions(id: string): { action: string; enabled: boolean }[] {
    const placement = placements[id];
    const locked = placement?.locked ?? false;
    return CONTEXT_MENU_ACTIONS.map((action) => {
      if (action === 'hide') return { action, enabled: true };
      if (action === 'show') return { action, enabled: true };
      if (action === 'unlock') return { action, enabled: locked };
      if (action === 'lock') return { action, enabled: !locked };
      if (locked && LOCKED_BLOCKED.has(action)) {
        return { action, enabled: false };
      }
      return { action, enabled: true };
    });
  }

  function isLocked(id: string): boolean {
    return placements[id]?.locked ?? false;
  }

  function conflictOf(id: string): ConflictIndicator {
    return placements[id]?.conflict ?? 'none';
  }

  return {
    state,
    groups: groupsFn,
    placements: placementsFn,
    flatList,
    toggleGroup,
    setGroupExpanded,
    toggleVisibility,
    toggleLock,
    bulkVisibility,
    bulkLock,
    bulkDelete,
    movePlacement,
    moveSelectionUp,
    moveSelectionDown,
    select,
    clearSelection,
    selectedIds,
    precedenceOrder,
    contextMenuActions,
    isLocked,
    conflictOf,
  };
}
