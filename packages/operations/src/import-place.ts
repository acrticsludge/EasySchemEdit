// packages/operations/src/import-place.ts
// Import-and-place flow: pending placement, ghost preview, ground snap (SUBSPEC-D §2.4, §4.6.1).
// Pure TypeScript, imports only from @easyschemedit/domain and @easyschemedit/operations via relative paths.

import type {
  Bounds3i,
  BlockStateId,
  Vec3i,
} from '../../domain/types.ts';
import type { Placement as PlacementType, Project } from '../../domain/placement.ts';
import {
  placementWorldBounds,
  worldPointToLocal,
  localBlockToWorld,
} from '../../domain/coordinates.ts';
import {
  getBlock,
  setBlock,
} from '../../domain/volume-api.ts';
import {
  isAirLike,
  CANONICAL_AIR,
  VANILLA_AIR_LIKE,
} from '../../domain/block-state.ts';
import { ClipboardEntry } from './clipboard.ts';

export interface PendingPlacement {
  id: string;
  clipboardEntryId: string;
  position: Vec3i;          // current ghost position
  rotationY: 0 | 90 | 180 | 270;
  mirror: 'none' | 'x' | 'z';
  skipAir: boolean;
  overrideAir: boolean;
  isGhost: boolean;         // true = preview only, not committed
}

export interface GhostBlock {
  worldPos: Vec3i;
  state: BlockStateId;
}

export interface GhostPreview {
  placementId: string;
  blocks: GhostBlock[];
  bounds: Bounds3i;
  conflicts: Array<{ position: Vec3i; category: 'clean' | 'same-state' | 'state-conflict' }>;
}

export interface GroundSnapResult {
  snappedPosition: Vec3i;
  groundY: number;
  snapped: boolean;
}

export class ImportPlaceEngine {
  private pendingPlacements: Map<string, PendingPlacement> = new Map();

  // Create a pending placement from a clipboard entry.
  createPendingPlacement(
    clipboardEntryId: string,
    position: Vec3i,
  ): PendingPlacement {
    const pending: PendingPlacement = {
      id: `pending-${Date.now()}`,
      clipboardEntryId,
      position: [...position] as Vec3i,
      rotationY: 0,
      mirror: 'none',
      skipAir: false,
      overrideAir: false,
      isGhost: true,
    };

    this.pendingPlacements.set(pending.id, pending);
    return pending;
  }

  // Update ghost position.
  updateGhostPosition(
    pending: PendingPlacement,
    position: Vec3i,
  ): PendingPlacement {
    return {
      ...pending,
      position: [...position] as Vec3i,
    };
  }

  // Apply rotation and mirror at paste time.
  applyRotationMirror(
    pending: PendingPlacement,
    rotationY: 0 | 90 | 180 | 270,
    mirror: 'none' | 'x' | 'z',
  ): PendingPlacement {
    return {
      ...pending,
      rotationY,
      mirror,
    };
  }

  // Snap to ground: find highest non-air block below each column, snap to it.
  snapToGround(
    pending: PendingPlacement,
    project: Project,
    clipboardEntry: ClipboardEntry,
  ): GroundSnapResult {
    const blocks = clipboardEntry.data.blocks;
    if (blocks.length === 0) {
      return {
        snappedPosition: [...pending.position] as Vec3i,
        groundY: pending.position[1],
        snapped: false,
      };
    }

    // Find the lowest block in the clipboard (relative to anchor)
    let minClipboardY = Infinity;
    for (const bd of blocks) {
      if (bd.localPos[1] < minClipboardY) {
        minClipboardY = bd.localPos[1];
      }
    }

    // For each column (x, z), find the highest non-air block in the project
    // below where the clipboard's lowest block would land
    const columns = new Map<string, number>(); // "x,z" -> highest non-air Y
    for (const bd of blocks) {
      const relX = bd.localPos[0] - clipboardEntry.data.anchor[0];
      const relZ = bd.localPos[2] - clipboardEntry.data.anchor[2];
      const worldX = pending.position[0] + relX;
      const worldZ = pending.position[2] + relZ;
      const colKey = `${worldX},${worldZ}`;

      if (columns.has(colKey)) continue;

      // Scan downward from just below the clipboard position
      let groundY = pending.position[1] - 1;
      let found = false;

      // Search down up to 256 blocks
      for (let y = pending.position[1] - 1; y >= pending.position[1] - 256; y--) {
        let blockFound = false;
        for (const placement of project.placements) {
          if (placement.locked) continue;
          const pb = placementWorldBounds(placement);
          if (worldX < pb.min[0] || worldX >= pb.maxExclusive[0] ||
              y < pb.min[1] || y >= pb.maxExclusive[1] ||
              worldZ < pb.min[2] || worldZ >= pb.maxExclusive[2]) {
            continue;
          }

          const localBlock = worldToLocalBlock(placement, [worldX, y, worldZ]);
          if (!localBlock) continue;

          const state = getBlock(placement.volume, localBlock);
          if (!isAirLike(state.id, VANILLA_AIR_LIKE)) {
            groundY = y;
            found = true;
            blockFound = true;
            break;
          }
        }
        if (blockFound) break;
      }

      if (!found) {
        groundY = pending.position[1] - 1; // Default: one below clipboard
      }

      columns.set(colKey, groundY);
    }

    // Use the maximum ground Y across all columns (snaps to highest ground)
    let maxGroundY = -Infinity;
    for (const y of columns.values()) {
      if (y > maxGroundY) maxGroundY = y;
    }

    if (maxGroundY === -Infinity) {
      maxGroundY = pending.position[1] - 1;
    }

    // Snap: align clipboard's lowest block to groundY + 1
    const snappedY = maxGroundY + 1 - minClipboardY;
    const snappedPosition: Vec3i = [
      pending.position[0],
      snappedY,
      pending.position[2],
    ];

    return {
      snappedPosition,
      groundY: maxGroundY,
      snapped: true,
    };
  }

  // Generate ghost preview: transform clipboard blocks and show where they'd land.
  generateGhostPreview(
    pending: PendingPlacement,
    project: Project,
    clipboardEntry: ClipboardEntry,
  ): GhostPreview {
    const blocks: GhostBlock[] = [];
    const conflicts: Array<{ position: Vec3i; category: 'clean' | 'same-state' | 'state-conflict' }> = [];

    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

    for (const bd of clipboardEntry.data.blocks) {
      // Transform local position relative to anchor
      const relX = bd.localPos[0] - clipboardEntry.data.anchor[0];
      const relY = bd.localPos[1] - clipboardEntry.data.anchor[1];
      const relZ = bd.localPos[2] - clipboardEntry.data.anchor[2];

      // Apply mirror first, then rotation
      const [mx, my, mz] = applyMirror(relX, relY, relZ, pending.mirror);
      const [rx, ry, rz] = applyRotation(mx, my, mz, pending.rotationY);

      const worldPos: Vec3i = [
        pending.position[0] + rx,
        pending.position[1] + ry,
        pending.position[2] + rz,
      ];

      // Skip air if skipAir is true
      if (pending.skipAir && isAirLike(bd.state.id, VANILLA_AIR_LIKE)) {
        continue;
      }

      blocks.push({ worldPos, state: bd.state });

      // Track bounds
      if (worldPos[0] < minX) minX = worldPos[0];
      if (worldPos[1] < minY) minY = worldPos[1];
      if (worldPos[2] < minZ) minZ = worldPos[2];
      if (worldPos[0] + 1 > maxX) maxX = worldPos[0] + 1;
      if (worldPos[1] + 1 > maxY) maxY = worldPos[1] + 1;
      if (worldPos[2] + 1 > maxZ) maxZ = worldPos[2] + 1;

      // Check conflicts with existing blocks
      for (const placement of project.placements) {
        if (placement.locked) continue;
        const pb = placementWorldBounds(placement);
        if (worldPos[0] < pb.min[0] || worldPos[0] >= pb.maxExclusive[0] ||
            worldPos[1] < pb.min[1] || worldPos[1] >= pb.maxExclusive[1] ||
            worldPos[2] < pb.min[2] || worldPos[2] >= pb.maxExclusive[2]) {
          continue;
        }

        const localBlock = worldToLocalBlock(placement, worldPos);
        if (!localBlock) continue;

        const existingState = getBlock(placement.volume, localBlock);
        const existingIsAir = isAirLike(existingState.id, VANILLA_AIR_LIKE);
        const newIsAir = isAirLike(bd.state.id, VANILLA_AIR_LIKE);

        let category: 'clean' | 'same-state' | 'state-conflict';
        if (existingIsAir && newIsAir) {
          category = 'clean';
        } else if (!existingIsAir && !newIsAir &&
          existingState.id === bd.state.id &&
          JSON.stringify(existingState.props) === JSON.stringify(bd.state.props)) {
          category = 'same-state';
        } else {
          category = 'state-conflict';
        }

        conflicts.push({ position: worldPos, category });
        break; // Only check first placement that contains this position
      }
    }

    const bounds: Bounds3i = {
      min: [minX === Infinity ? 0 : minX, minY === Infinity ? 0 : minY, minZ === Infinity ? 0 : minZ] as Vec3i,
      maxExclusive: [maxX === -Infinity ? 0 : maxX, maxY === -Infinity ? 0 : maxY, maxZ === -Infinity ? 0 : maxZ] as Vec3i,
    };

    return {
      placementId: pending.id,
      blocks,
      bounds,
      conflicts,
    };
  }

  // Commit pending placement: write ghost blocks to project.
  commitPendingPlacement(
    pending: PendingPlacement,
    project: Project,
    clipboardEntry: ClipboardEntry,
  ): { project: Project; changedCells: number; warnings: string[] } {
    const warnings: string[] = [];
    let changedCells = 0;

    // Work on a copy of the project (immutable update)
    const placements = [...project.placements];

    for (const bd of clipboardEntry.data.blocks) {
      // Skip air if skipAir is true
      if (pending.skipAir && isAirLike(bd.state.id, VANILLA_AIR_LIKE)) {
        continue;
      }

      // Transform local position relative to anchor
      const relX = bd.localPos[0] - clipboardEntry.data.anchor[0];
      const relY = bd.localPos[1] - clipboardEntry.data.anchor[1];
      const relZ = bd.localPos[2] - clipboardEntry.data.anchor[2];

      // Apply mirror first, then rotation
      const [mx, my, mz] = applyMirror(relX, relY, relZ, pending.mirror);
      const [rx, ry, rz] = applyRotation(mx, my, mz, pending.rotationY);

      const worldPos: Vec3i = [
        pending.position[0] + rx,
        pending.position[1] + ry,
        pending.position[2] + rz,
      ];

      // Find placement at this world position
      let targetPlacement: PlacementType | null = null;
      for (const p of placements) {
        if (p.locked) continue;
        if (!p.visible) continue;
        const pb = placementWorldBounds(p);
        if (worldPos[0] >= pb.min[0] && worldPos[0] < pb.maxExclusive[0] &&
            worldPos[1] >= pb.min[1] && worldPos[1] < pb.maxExclusive[1] &&
            worldPos[2] >= pb.min[2] && worldPos[2] < pb.maxExclusive[2]) {
          targetPlacement = p;
          break;
        }
      }

      if (!targetPlacement) {
        warnings.push(`No placement found at world position ${worldPos.join(',')}`);
        continue;
      }

      const localBlock = worldToLocalBlock(targetPlacement, worldPos);
      if (!localBlock) continue;

      const currentState = getBlock(targetPlacement.volume, localBlock);

      // Handle overrideAir
      if (!pending.overrideAir && isAirLike(bd.state.id, VANILLA_AIR_LIKE)) {
        continue; // Air is non-owning
      }

      setBlock(targetPlacement.volume, localBlock, bd.state);
      changedCells++;
    }

    return {
      project: { ...project, placements, revision: project.revision + 1 },
      changedCells,
      warnings,
    };
  }

  // Get a pending placement by ID.
  getPendingPlacement(id: string): PendingPlacement | undefined {
    return this.pendingPlacements.get(id);
  }

  // Remove a pending placement.
  removePendingPlacement(id: string): boolean {
    return this.pendingPlacements.delete(id);
  }

  // List all pending placements.
  listPendingPlacements(): PendingPlacement[] {
    return Array.from(this.pendingPlacements.values());
  }

  // Clear all pending placements.
  clearPendingPlacements(): void {
    this.pendingPlacements.clear();
  }
}

// ============================================================================
// Helper functions
// ============================================================================

function applyMirror(
  x: number, y: number, z: number, mirror: 'none' | 'x' | 'z',
): [number, number, number] {
  switch (mirror) {
    case 'none': return [x, y, z];
    case 'x': return [-x, y, z];
    case 'z': return [x, y, -z];
  }
}

function applyRotation(
  x: number, y: number, z: number, rotationY: 0 | 90 | 180 | 270,
): [number, number, number] {
  switch (rotationY) {
    case 0:  return [x, y, z];
    case 90: return [z, y, -x];
    case 180: return [-x, y, -z];
    case 270: return [-z, y, x];
  }
}

// Map a world block coordinate to a local block coordinate for the placement.
function worldToLocalBlock(
  placement: PlacementType,
  worldBlock: Vec3i,
): Vec3i | null {
  const local = worldPointToLocal(
    placement,
    [worldBlock[0] + 0.5, worldBlock[1] + 0.5, worldBlock[2] + 0.5],
  );
  const [lx, ly, lz] = [Math.floor(local[0]), Math.floor(local[1]), Math.floor(local[2])];

  try {
    const world = localBlockToWorld(placement, [lx, ly, lz]);
    if (world[0] === worldBlock[0] && world[1] === worldBlock[1] && world[2] === worldBlock[2]) {
      return [lx, ly, lz] as Vec3i;
    }
  } catch {
    // Off-grid — not part of this placement
  }
  return null;
}
