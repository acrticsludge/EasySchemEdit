// packages/operations/src/selection.ts
// Selection types: placement + cuboid, half-open bounds, anchor (SUBSPEC-D §3.1, §3.2).
// Pure TypeScript, imports only from @easyschemedit/domain via relative paths.

import type { Placement } from '../../domain/placement.ts';

export type SelectionType = 'placement' | 'cuboid';

// Half-open bounds: min inclusive, max exclusive.
// Volume = (maxX - minX) × (maxY - minY) × (maxZ - minZ).
export interface CuboidBounds {
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
}

export interface SelectionAnchor {
  x: number;
  y: number;
  z: number;
}

export interface PlacementSelection {
  kind: 'placement';
  placementIds: string[];
}

export interface CuboidSelection {
  kind: 'cuboid';
  bounds: CuboidBounds;
}

export type Selection = PlacementSelection | CuboidSelection;

export interface SelectionState {
  type: SelectionType;
  selection: Selection;
  anchor: SelectionAnchor;
  modifiedAt: number;
}

// ============================================================================
// Selection construction
// ============================================================================

export function createPlacementSelection(
  placementIds: string[],
  anchor: SelectionAnchor
): PlacementSelection {
  return {
    kind: 'placement',
    placementIds: [...placementIds],
  };
}

export function createCuboidSelection(
  bounds: CuboidBounds,
  anchor: SelectionAnchor
): CuboidSelection {
  return {
    kind: 'cuboid',
    bounds: { ...bounds },
  };
}

export function createSelectionState(
  type: SelectionType,
  selection: Selection,
  anchor: SelectionAnchor
): SelectionState {
  return {
    type,
    selection,
    anchor,
    modifiedAt: Date.now(),
  };
}

// ============================================================================
// Selection queries
// ============================================================================

export function getSelectionVolume(selection: Selection): number {
  if (selection.kind === 'cuboid') {
    const b = selection.bounds;
    return (b.maxX - b.minX) * (b.maxY - b.minY) * (b.maxZ - b.minZ);
  }
  // Placement selection volume is undefined (depends on placements)
  return 0;
}

export function isEmptySelection(selection: Selection): boolean {
  if (selection.kind === 'placement') {
    return selection.placementIds.length === 0;
  }
  const b = selection.bounds;
  return b.maxX <= b.minX || b.maxY <= b.minY || b.maxZ <= b.minZ;
}

export function getSelectedPlacementIds(selection: Selection): string[] {
  if (selection.kind === 'placement') {
    return [...selection.placementIds];
  }
  return [];
}

// ============================================================================
// Selection mutations
// ============================================================================

export function switchToPlacementSelection(
  state: SelectionState,
  placementIds: string[]
): SelectionState {
  return createSelectionState('placement', createPlacementSelection(placementIds, state.anchor), state.anchor);
}

export function switchToCuboidSelection(
  state: SelectionState,
  bounds: CuboidBounds
): SelectionState {
  return createSelectionState('cuboid', createCuboidSelection(bounds, state.anchor), state.anchor);
}

export function updateAnchor(state: SelectionState, anchor: SelectionAnchor): SelectionState {
  return createSelectionState(state.type, state.selection, anchor);
}

export function updateSelectionBounds(
  state: SelectionState,
  bounds: CuboidBounds
): SelectionState {
  if (state.selection.kind !== 'cuboid') {
    throw new Error('Cannot update bounds on a placement selection');
  }
  return createSelectionState('cuboid', createCuboidSelection(bounds, state.anchor), state.anchor);
}

// ============================================================================
// Deletion repair
// ============================================================================

// Remove deleted placement IDs from a placement selection.
// Returns the repaired selection state and the list of removed IDs.
export function repairAfterDelete(
  state: SelectionState,
  deletedPlacementIds: string[]
): { state: SelectionState; removedIds: string[] } {
  const deletedSet = new Set(deletedPlacementIds);

  if (state.selection.kind === 'placement') {
    const beforeCount = state.selection.placementIds.length;
    const remainingIds = state.selection.placementIds.filter((id) => !deletedSet.has(id));
    const removedIds = state.selection.placementIds.filter((id) => deletedSet.has(id));

    if (remainingIds.length === beforeCount) {
      // No change needed
      return { state, removedIds: [] };
    }

    if (remainingIds.length === 0) {
      // All placements deleted — clear selection
      return {
        state: createSelectionState('placement', createPlacementSelection([], state.anchor), state.anchor),
        removedIds,
      };
    }

    return {
      state: createSelectionState('placement', createPlacementSelection(remainingIds, state.anchor), state.anchor),
      removedIds,
    };
  }

  // Cuboid selection — no repair needed (bounds don't reference specific placements)
  return { state, removedIds: [] };
}

// ============================================================================
// Bounds helpers
// ============================================================================

export function boundsContainsPoint(bounds: CuboidBounds, x: number, y: number, z: number): boolean {
  return x >= bounds.minX && x < bounds.maxX && y >= bounds.minY && y < bounds.maxY && z >= bounds.minZ && z < bounds.maxZ;
}

export function boundsUnion(a: CuboidBounds, b: CuboidBounds): CuboidBounds {
  return {
    minX: Math.min(a.minX, b.minX),
    minY: Math.min(a.minY, b.minY),
    minZ: Math.min(a.minZ, b.minZ),
    maxX: Math.max(a.maxX, b.maxX),
    maxY: Math.max(a.maxY, b.maxY),
    maxZ: Math.max(a.maxZ, b.maxZ),
  };
}

export function boundsIntersect(a: CuboidBounds, b: CuboidBounds): CuboidBounds | null {
  const minX = Math.max(a.minX, b.minX);
  const minY = Math.max(a.minY, b.minY);
  const minZ = Math.max(a.minZ, b.minZ);
  const maxX = Math.min(a.maxX, b.maxX);
  const maxY = Math.min(a.maxY, b.maxY);
  const maxZ = Math.min(a.maxZ, b.maxZ);

  if (minX >= maxX || minY >= maxY || minZ >= maxZ) {
    return null;
  }

  return { minX, minY, minZ, maxX, maxY, maxZ };
}

export function boundsVolume(bounds: CuboidBounds): number {
  return (bounds.maxX - bounds.minX) * (bounds.maxY - bounds.minY) * (bounds.maxZ - bounds.minZ);
}
