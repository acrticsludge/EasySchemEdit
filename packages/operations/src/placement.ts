// packages/operations/src/placement.ts
// Placement management types + CRUD operations (SUBSPEC-D §2.1, §2.3).
// Pure TypeScript, imports only from @easyschemedit/domain via relative paths.

import type {
  Placement,
  Project,
} from '../../domain/placement.ts';
import type {
  Transform,
} from '../../domain/coordinates.ts';
import type {
  Vec3Half,
} from '../../domain/types.ts';

export type PlacementLockState = {
  locked: boolean;
  lockReason?: 'user' | 'import' | 'system';
};

export type PlacementVisibility = {
  visible: boolean;
  visibleInViewport: boolean;  // derived from visible + group visibility
};

export type PlacementOrder = {
  index: number;               // position in Project.placements (bottom-to-top)
  groupIndex?: number;         // position within import group, if any
};

export type PlacementReorderOperation = {
  placementId: string;
  fromIndex: number;
  toIndex: number;
};

// ============================================================================
// Lock state management
// ============================================================================

export function lockPlacement(placement: Placement, reason: 'user' | 'import' | 'system' = 'user'): Placement {
  return { ...placement, locked: true, lockReason: reason };
}

export function unlockPlacement(placement: Placement): Placement {
  return { ...placement, locked: false };
}

export function isLocked(placement: Placement): boolean {
  return placement.locked === true;
}

// ============================================================================
// Visibility management
// ============================================================================

export function showPlacement(placement: Placement): Placement {
  return { ...placement, visible: true };
}

export function hidePlacement(placement: Placement): Placement {
  return { ...placement, visible: false };
}

export function isVisible(placement: Placement): boolean {
  return placement.visible === true;
}

// ============================================================================
// Reorder operations
// ============================================================================

export function reorderPlacements(
  project: Project,
  operation: PlacementReorderOperation
): Project {
  const { placementId, fromIndex, toIndex } = operation;
  const placements = [...project.placements];

  // Validate indices
  if (fromIndex < 0 || fromIndex >= placements.length) {
    throw new Error(`Reorder: fromIndex ${fromIndex} out of range [0, ${placements.length})`);
  }
  if (toIndex < 0 || toIndex >= placements.length) {
    throw new Error(`Reorder: toIndex ${toIndex} out of range [0, ${placements.length})`);
  }

  // Find the placement at fromIndex
  const placement = placements[fromIndex];
  if (placement.id !== placementId) {
    throw new Error(`Reorder: placement at fromIndex ${fromIndex} is ${placement.id}, expected ${placementId}`);
  }

  // Remove from fromIndex, insert at toIndex
  placements.splice(fromIndex, 1);
  placements.splice(toIndex, 0, placement);

  return {
    ...project,
    placements,
    revision: project.revision + 1,
  };
}

// ============================================================================
// Duplicate / delete
// ============================================================================

export function duplicatePlacement(project: Project, placementId: string): Project {
  const index = project.placements.findIndex((p) => p.id === placementId);
  if (index === -1) {
    throw new Error(`Duplicate: placement ${placementId} not found`);
  }

  const source = project.placements[index];
  if (source.locked) {
    throw new Error(`Duplicate: placement ${placementId} is locked`);
  }

  const duplicate: Placement = {
    ...source,
    id: `${source.id}-copy-${Date.now()}`,
    name: `${source.name} (Copy)`,
    createdAt: new Date().toISOString(),
  };

  const placements = [...project.placements];
  placements.splice(index + 1, 0, duplicate);

  return {
    ...project,
    placements,
    revision: project.revision + 1,
  };
}

export function deletePlacement(project: Project, placementId: string): Project {
  const index = project.placements.findIndex((p) => p.id === placementId);
  if (index === -1) {
    throw new Error(`Delete: placement ${placementId} not found`);
  }

  const placement = project.placements[index];
  if (placement.locked) {
    throw new Error(`Delete: placement ${placementId} is locked`);
  }

  const placements = [...project.placements];
  placements.splice(index, 1);

  return {
    ...project,
    placements,
    revision: project.revision + 1,
  };
}

// ============================================================================
// Move (edit origin) / transform
// ============================================================================

export function movePlacement(project: Project, placementId: string, newOrigin: Vec3Half): Project {
  const index = project.placements.findIndex((p) => p.id === placementId);
  if (index === -1) {
    throw new Error(`Move: placement ${placementId} not found`);
  }

  const placement = project.placements[index];
  if (placement.locked) {
    throw new Error(`Move: placement ${placementId} is locked`);
  }

  // Origin must be integral (even half-block components)
  if (newOrigin[0] % 2 !== 0 || newOrigin[1] % 2 !== 0 || newOrigin[2] % 2 !== 0) {
    throw new Error(`Move: origin ${newOrigin} is not integral`);
  }

  const updated: Placement = {
    ...placement,
    origin: newOrigin,
  };

  const placements = [...project.placements];
  placements[index] = updated;

  return {
    ...project,
    placements,
    revision: project.revision + 1,
  };
}

export function rotatePlacement(project: Project, placementId: string, transform: Transform): Project {
  const index = project.placements.findIndex((p) => p.id === placementId);
  if (index === -1) {
    throw new Error(`Rotate: placement ${placementId} not found`);
  }

  const placement = project.placements[index];
  if (placement.locked) {
    throw new Error(`Rotate: placement ${placementId} is locked`);
  }

  const updated: Placement = {
    ...placement,
    transform,
  };

  const placements = [...project.placements];
  placements[index] = updated;

  return {
    ...project,
    placements,
    revision: project.revision + 1,
  };
}

export function mirrorPlacement(project: Project, placementId: string, transform: Transform): Project {
  const index = project.placements.findIndex((p) => p.id === placementId);
  if (index === -1) {
    throw new Error(`Mirror: placement ${placementId} not found`);
  }

  const placement = project.placements[index];
  if (placement.locked) {
    throw new Error(`Mirror: placement ${placementId} is locked`);
  }

  const updated: Placement = {
    ...placement,
    transform,
  };

  const placements = [...project.placements];
  placements[index] = updated;

  return {
    ...project,
    placements,
    revision: project.revision + 1,
  };
}

// ============================================================================
// Selection helpers
// ============================================================================

export function getPlacementOrder(project: Project, placementId: string): PlacementOrder | null {
  const index = project.placements.findIndex((p) => p.id === placementId);
  if (index === -1) {
    return null;
  }

  return {
    index,
  };
}

export function getLockedPlacements(project: Project): Placement[] {
  return project.placements.filter((p) => p.locked);
}

export function getUnlockedPlacements(project: Project): Placement[] {
  return project.placements.filter((p) => !p.locked);
}

// ============================================================================
// Lock semantics validation
// ============================================================================

export type LockedOperationError = {
  operation: string;
  placementId: string;
  reason: 'locked';
};

export function validateNotLocked(placement: Placement, operation: string): void {
  if (placement.locked) {
    throw new Error(
      `Operation "${operation}" rejected: placement ${placement.id} is locked`
    );
  }
}

export function validateLockedOperations(placements: Placement[], operation: string): void {
  const locked = placements.filter((p) => p.locked);
  if (locked.length > 0) {
    const ids = locked.map((p) => p.id).join(', ');
    throw new Error(
      `Operation "${operation}" rejected: locked placements cannot be modified: ${ids}`
    );
  }
}

// Visibility is allowed while locked
export function validateVisibilityAllowed(placement: Placement): void {
  // Hide/show is always allowed, even when locked
  // No-op: visibility is not geometry editing
}
