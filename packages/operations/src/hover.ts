// packages/operations/src/hover.ts
// Hover operations: block highlight, info HUD, placement hover, same-type (SUBSPEC-D §2.4, §5.4).
// Pure TypeScript, imports only from @easyschemedit/domain via relative paths.
// Session state only — not persisted to IndexedDB.

import type {
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
} from '../../domain/volume-api.ts';
import {
  isAirLike,
  VANILLA_AIR_LIKE,
} from '../../domain/block-state.ts';

export interface HoverState {
  hoveredPosition: Vec3i | null;
  hoveredPlacementId: string | null;
  hoveredBlockState: BlockStateId | null;
  isAir: boolean;
  sameTypeHighlights: Vec3i[];
}

export interface HoverInfo {
  position: Vec3i;
  blockState: BlockStateId;
  placementId: string;
  localPosition: Vec3i;
  sameTypeCount: number;
}

export class HoverEngine {
  private hoverState: HoverState = {
    hoveredPosition: null,
    hoveredPlacementId: null,
    hoveredBlockState: null,
    isAir: true,
    sameTypeHighlights: [],
  };

  // Hover over a position: return block info or null if air/no block.
  hoverOver(project: Project, position: Vec3i): HoverInfo | null {
    // Find top non-air block at this position
    let topState: BlockStateId | null = null;
    let ownerPlacementId: string | null = null;
    let localPosition: Vec3i | null = null;

    for (const placement of project.placements) {
      if (placement.locked || !placement.visible) continue;
      const pb = placementWorldBounds(placement);
      if (position[0] < pb.min[0] || position[0] >= pb.maxExclusive[0] ||
          position[1] < pb.min[1] || position[1] >= pb.maxExclusive[1] ||
          position[2] < pb.min[2] || position[2] >= pb.maxExclusive[2]) {
        continue;
      }

      const localBlock = worldToLocalBlock(placement, position);
      if (!localBlock) continue;

      const state = getBlock(placement.volume, localBlock);
      if (isAirLike(state.id, VANILLA_AIR_LIKE)) continue;

      // Top-wins: later placement overrides
      topState = state;
      ownerPlacementId = placement.id;
      localPosition = localBlock;
    }

    if (!topState || !ownerPlacementId || !localPosition) {
      // Air or no block — clear hover
      this.hoverState = {
        hoveredPosition: position,
        hoveredPlacementId: null,
        hoveredBlockState: null,
        isAir: true,
        sameTypeHighlights: [],
      };
      return null;
    }

    // Count same-type blocks for same-type highlight
    const sameTypeCount = this.countSameTypeBlocks(project, topState);

    this.hoverState = {
      hoveredPosition: position,
      hoveredPlacementId: ownerPlacementId,
      hoveredBlockState: topState,
      isAir: false,
      sameTypeHighlights: [],
    };

    return {
      position,
      blockState: topState,
      placementId: ownerPlacementId,
      localPosition,
      sameTypeCount,
    };
  }

  // Get all positions of same-type blocks in project.
  getSameTypeHighlights(project: Project, blockState: BlockStateId): Vec3i[] {
    const highlights: Vec3i[] = [];

    for (const placement of project.placements) {
      if (placement.locked || !placement.visible) continue;
      const pb = placementWorldBounds(placement);

      for (let y = pb.min[1]; y < pb.maxExclusive[1]; y++) {
        for (let z = pb.min[2]; z < pb.maxExclusive[2]; z++) {
          for (let x = pb.min[0]; x < pb.maxExclusive[0]; x++) {
            const position: Vec3i = [x, y, z];
            const localBlock = worldToLocalBlock(placement, position);
            if (!localBlock) continue;

            const state = getBlock(placement.volume, localBlock);
            if (state.id === blockState.id &&
                JSON.stringify(state.props) === JSON.stringify(blockState.props)) {
              highlights.push([...position] as Vec3i);
            }
          }
        }
      }
    }

    return highlights;
  }

  // Clear hover state.
  clearHover(): HoverState {
    const previous = this.hoverState;
    this.hoverState = {
      hoveredPosition: null,
      hoveredPlacementId: null,
      hoveredBlockState: null,
      isAir: true,
      sameTypeHighlights: [],
    };
    return previous;
  }

  // Get current hover state.
  getHoverState(): HoverState {
    return { ...this.hoverState };
  }

  // Set same-type highlights for a position.
  setSameTypeHighlights(project: Project, position: Vec3i): Vec3i[] {
    // Find block at position
    let blockState: BlockStateId | null = null;

    for (const placement of project.placements) {
      if (placement.locked || !placement.visible) continue;
      const pb = placementWorldBounds(placement);
      if (position[0] < pb.min[0] || position[0] >= pb.maxExclusive[0] ||
          position[1] < pb.min[1] || position[1] >= pb.maxExclusive[1] ||
          position[2] < pb.min[2] || position[2] >= pb.maxExclusive[2]) {
        continue;
      }

      const localBlock = worldToLocalBlock(placement, position);
      if (!localBlock) continue;

      const state = getBlock(placement.volume, localBlock);
      if (isAirLike(state.id, VANILLA_AIR_LIKE)) continue;

      blockState = state;
      break;
    }

    if (!blockState) {
      this.hoverState.sameTypeHighlights = [];
      return [];
    }

    const highlights = this.getSameTypeHighlights(project, blockState);
    this.hoverState.sameTypeHighlights = highlights;
    return highlights;
  }

  // Count blocks of same type in project.
  private countSameTypeBlocks(project: Project, blockState: BlockStateId): number {
    let count = 0;

    for (const placement of project.placements) {
      if (placement.locked || !placement.visible) continue;
      const pb = placementWorldBounds(placement);

      for (let y = pb.min[1]; y < pb.maxExclusive[1]; y++) {
        for (let z = pb.min[2]; z < pb.maxExclusive[2]; z++) {
          for (let x = pb.min[0]; x < pb.maxExclusive[0]; x++) {
            const position: Vec3i = [x, y, z];
            const localBlock = worldToLocalBlock(placement, position);
            if (!localBlock) continue;

            const state = getBlock(placement.volume, localBlock);
            if (state.id === blockState.id &&
                JSON.stringify(state.props) === JSON.stringify(blockState.props)) {
              count++;
            }
          }
        }
      }
    }

    return count;
  }
}

// ============================================================================
// Convenience functions
// ============================================================================

export function hoverOver(
  project: Project,
  position: Vec3i,
  engine?: HoverEngine,
): HoverInfo | null {
  const eng = engine ?? new HoverEngine();
  return eng.hoverOver(project, position);
}

export function clearHover(
  engine?: HoverEngine,
): HoverState {
  const eng = engine ?? new HoverEngine();
  return eng.clearHover();
}

// ============================================================================
// Helper functions
// ============================================================================

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
