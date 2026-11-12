// packages/operations/src/move-stack.ts
// Move region + stack operations (SUBSPEC-D §2.4, §4.6.2).
// Pure TypeScript, imports only from @easyschemedit/domain via relative paths.

import type {
  Bounds3i,
  BlockStateId,
  Vec3i,
} from '../../domain/types.ts';
import type { Placement as PlacementType, Project } from '../../domain/placement.ts';
import {
  localBlockToWorld,
  placementWorldBounds,
  worldPointToLocal,
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

export interface MoveRegionOptions {
  overlapPolicy: 'top-wins' | 'bottom-wins';
  affectedPlacements: string[];
}

export interface MoveRegionResult {
  success: boolean;
  sourceBounds: Bounds3i;
  destinationOffset: Vec3i;
  changedPlacements: string[];
  changedCells: number;
  warnings: string[];
}

export interface StackOptions {
  count: number;
  offset: Vec3i;
  shiftSelection: boolean;
  ignoreAir: boolean;
}

export interface StackResult {
  success: boolean;
  copies: number;
  totalChangedCells: number;
  affectedBounds: Bounds3i;
  lastCopyBounds: Bounds3i | null;
  warnings: string[];
}

export class MoveStackEngine {
  // Move region: copy blocks from source bounds, apply at destination offset.
  // Single undo transaction (revision incremented once by caller).
  moveRegion(
    project: Project,
    sourceBounds: Bounds3i,
    destinationOffset: Vec3i,
    options: MoveRegionOptions,
  ): MoveRegionResult {
    const warnings: string[] = [];
    const changedPlacements: string[] = [];
    let changedCells = 0;

    // Determine affected placements
    const affectedSet = new Set(options.affectedPlacements);
    const placementsToModify = project.placements.filter(
      (p: PlacementType) => !p.locked && p.visible && affectedSet.has(p.id),
    );

    if (placementsToModify.length === 0) {
      return {
        success: true,
        sourceBounds,
        destinationOffset,
        changedPlacements: [],
        changedCells: 0,
        warnings: ['No editable placements in affected list'],
      };
    }

    // Step 1: Snapshot source blocks (read all blocks in source bounds from all placements)
    const sourceBlocks = new Map<string, { placementId: string; localBlock: Vec3i; state: BlockStateId }>();
    // key: "x,y,z" world position

    for (const placement of placementsToModify) {
      const pb = placementWorldBounds(placement);
      if (!boundsIntersect(sourceBounds, pb)) continue;

      const clamped: Bounds3i = {
        min: [
          Math.max(sourceBounds.min[0], pb.min[0]),
          Math.max(sourceBounds.min[1], pb.min[1]),
          Math.max(sourceBounds.min[2], pb.min[2]),
        ] as Vec3i,
        maxExclusive: [
          Math.min(sourceBounds.maxExclusive[0], pb.maxExclusive[0]),
          Math.min(sourceBounds.maxExclusive[1], pb.maxExclusive[1]),
          Math.min(sourceBounds.maxExclusive[2], pb.maxExclusive[2]),
        ] as Vec3i,
      };

      for (let y = clamped.min[1]; y < clamped.maxExclusive[1]; y++) {
        for (let z = clamped.min[2]; z < clamped.maxExclusive[2]; z++) {
          for (let x = clamped.min[0]; x < clamped.maxExclusive[0]; x++) {
            const worldBlock: Vec3i = [x, y, z];
            const localBlock = worldToLocalBlock(placement, worldBlock);
            if (!localBlock) continue;

            const state = getBlock(placement.volume, localBlock);
            const key = `${x},${y},${z}`;
            sourceBlocks.set(key, { placementId: placement.id, localBlock, state });
          }
        }
      }
    }

    // Step 2: Clear source blocks (set to air) - this is the "move" part
    for (const [key, { localBlock }] of sourceBlocks) {
      const [x, y, z] = key.split(',').map(Number) as [number, number, number];
      // Find the placement and clear the block
      const placement = project.placements.find((p: PlacementType) => p.id === sourceBlocks.get(key)!.placementId);
      if (placement) {
        const currentState = getBlock(placement.volume, localBlock);
        if (!isAirLike(currentState.id, VANILLA_AIR_LIKE)) {
          setBlock(placement.volume, localBlock, CANONICAL_AIR);
          changedCells++;
          if (!changedPlacements.includes(placement.id)) {
            changedPlacements.push(placement.id);
          }
        }
      }
    }

    // Step 3: Write blocks at destination
    const destBounds: Bounds3i = {
      min: [
        sourceBounds.min[0] + destinationOffset[0],
        sourceBounds.min[1] + destinationOffset[1],
        sourceBounds.min[2] + destinationOffset[2],
      ] as Vec3i,
      maxExclusive: [
        sourceBounds.maxExclusive[0] + destinationOffset[0],
        sourceBounds.maxExclusive[1] + destinationOffset[1],
        sourceBounds.maxExclusive[2] + destinationOffset[2],
      ] as Vec3i,
    };

    for (const [key, { state }] of sourceBlocks) {
      const [sx, sy, sz] = key.split(',').map(Number) as [number, number, number];
      const destWorld: Vec3i = [
        sx + destinationOffset[0],
        sy + destinationOffset[1],
        sz + destinationOffset[2],
      ];

      // Find placement at destination
      for (const placement of placementsToModify) {
        const pb = placementWorldBounds(placement);
        if (destWorld[0] < pb.min[0] || destWorld[0] >= pb.maxExclusive[0] ||
            destWorld[1] < pb.min[1] || destWorld[1] >= pb.maxExclusive[1] ||
            destWorld[2] < pb.min[2] || destWorld[2] >= pb.maxExclusive[2]) {
          continue;
        }

        const localBlock = worldToLocalBlock(placement, destWorld);
        if (!localBlock) continue;

        // Apply overlap policy
        const existingState = getBlock(placement.volume, localBlock);
        const existingIsAir = isAirLike(existingState.id, VANILLA_AIR_LIKE);
        const newIsAir = isAirLike(state.id, VANILLA_AIR_LIKE);

        let shouldWrite = false;
        if (options.overlapPolicy === 'top-wins') {
          // Later placement in array wins; if we're writing, we win
          shouldWrite = true;
        } else if (options.overlapPolicy === 'bottom-wins') {
          // Earlier placement wins; only write if destination is air
          shouldWrite = existingIsAir;
        }

        if (shouldWrite && (!existingIsAir || !newIsAir || state.id !== existingState.id)) {
          setBlock(placement.volume, localBlock, state);
          changedCells++;
          if (!changedPlacements.includes(placement.id)) {
            changedPlacements.push(placement.id);
          }
        }
        break; // Only write to one placement per position
      }
    }

    return {
      success: true,
      sourceBounds,
      destinationOffset,
      changedPlacements,
      changedCells,
      warnings,
    };
  }

  // Stack: repeat source bounds N times with per-copy offset.
  stack(
    project: Project,
    sourceBounds: Bounds3i,
    options: StackOptions,
  ): StackResult {
    const warnings: string[] = [];
    let totalChangedCells = 0;
    let lastCopyBounds: Bounds3i | null = null;

    const {
      count,
      offset,
      shiftSelection,
      ignoreAir,
    } = options;

    if (count < 1) {
      return {
        success: false,
        copies: 0,
        totalChangedCells: 0,
        affectedBounds: sourceBounds,
        lastCopyBounds: null,
        warnings: ['Stack count must be >= 1'],
      };
    }

    // Use moveRegion engine internally for each copy
    const engine = new MoveStackEngine();

    for (let i = 0; i < count; i++) {
      const copyOffset: Vec3i = [
        offset[0] * i,
        offset[1] * i,
        offset[2] * i,
      ] as Vec3i;

      // Collect blocks from source bounds
      const blocksToCopy: Array<{ worldPos: Vec3i; state: BlockStateId }> = [];

      for (const placement of project.placements) {
        if (placement.locked) continue;
        if (!placement.visible) continue;

        const pb = placementWorldBounds(placement);
        if (!boundsIntersect(sourceBounds, pb)) continue;

        const clamped: Bounds3i = {
          min: [
            Math.max(sourceBounds.min[0], pb.min[0]),
            Math.max(sourceBounds.min[1], pb.min[1]),
            Math.max(sourceBounds.min[2], pb.min[2]),
          ] as Vec3i,
          maxExclusive: [
            Math.min(sourceBounds.maxExclusive[0], pb.maxExclusive[0]),
            Math.min(sourceBounds.maxExclusive[1], pb.maxExclusive[1]),
            Math.min(sourceBounds.maxExclusive[2], pb.maxExclusive[2]),
          ] as Vec3i,
        };

        for (let y = clamped.min[1]; y < clamped.maxExclusive[1]; y++) {
          for (let z = clamped.min[2]; z < clamped.maxExclusive[2]; z++) {
            for (let x = clamped.min[0]; x < clamped.maxExclusive[0]; x++) {
              const worldBlock: Vec3i = [x, y, z];
              const localBlock = worldToLocalBlock(placement, worldBlock);
              if (!localBlock) continue;

              const state = getBlock(placement.volume, localBlock);

              // ignoreAir: skip air cells
              if (ignoreAir && isAirLike(state.id, VANILLA_AIR_LIKE)) {
                continue;
              }

              blocksToCopy.push({ worldPos: worldBlock, state });
            }
          }
        }
      }

      // Write blocks at destination (offset applied)
      for (const { worldPos, state } of blocksToCopy) {
        const destWorld: Vec3i = [
          worldPos[0] + copyOffset[0],
          worldPos[1] + copyOffset[1],
          worldPos[2] + copyOffset[2],
        ];

        for (const placement of project.placements) {
          if (placement.locked) continue;
          if (!placement.visible) continue;

          const pb = placementWorldBounds(placement);
          if (destWorld[0] < pb.min[0] || destWorld[0] >= pb.maxExclusive[0] ||
              destWorld[1] < pb.min[1] || destWorld[1] >= pb.maxExclusive[1] ||
              destWorld[2] < pb.min[2] || destWorld[2] >= pb.maxExclusive[2]) {
            continue;
          }

          const localBlock = worldToLocalBlock(placement, destWorld);
          if (!localBlock) continue;

          setBlock(placement.volume, localBlock, state);
          totalChangedCells++;
          break;
        }
      }

      // Track last copy bounds
      const copyBounds: Bounds3i = {
        min: [
          sourceBounds.min[0] + copyOffset[0],
          sourceBounds.min[1] + copyOffset[1],
          sourceBounds.min[2] + copyOffset[2],
        ] as Vec3i,
        maxExclusive: [
          sourceBounds.maxExclusive[0] + copyOffset[0],
          sourceBounds.maxExclusive[1] + copyOffset[1],
          sourceBounds.maxExclusive[2] + copyOffset[2],
        ] as Vec3i,
      };
      lastCopyBounds = copyBounds;
    }

    // Compute affected bounds (union of all copy bounds)
    const affectedMin: number[] = [...sourceBounds.min];
    const affectedMax: number[] = [...sourceBounds.maxExclusive];

    if (lastCopyBounds) {
      affectedMin[0] = Math.min(affectedMin[0], lastCopyBounds.min[0]);
      affectedMin[1] = Math.min(affectedMin[1], lastCopyBounds.min[1]);
      affectedMin[2] = Math.min(affectedMin[2], lastCopyBounds.min[2]);
      affectedMax[0] = Math.max(affectedMax[0], lastCopyBounds.maxExclusive[0]);
      affectedMax[1] = Math.max(affectedMax[1], lastCopyBounds.maxExclusive[1]);
      affectedMax[2] = Math.max(affectedMax[2], lastCopyBounds.maxExclusive[2]);
    }

    const affectedBounds: Bounds3i = {
      min: affectedMin as unknown as Vec3i,
      maxExclusive: affectedMax as unknown as Vec3i,
    };

    return {
      success: true,
      copies: count,
      totalChangedCells,
      affectedBounds,
      lastCopyBounds,
      warnings,
    };
  }
}

// ============================================================================
// Helper functions
// ============================================================================

function boundsIntersect(a: Bounds3i, b: Bounds3i): boolean {
  return (
    a.min[0] < b.maxExclusive[0] && a.maxExclusive[0] > b.min[0] &&
    a.min[1] < b.maxExclusive[1] && a.maxExclusive[1] > b.min[1] &&
    a.min[2] < b.maxExclusive[2] && a.maxExclusive[2] > b.min[2]
  );
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
