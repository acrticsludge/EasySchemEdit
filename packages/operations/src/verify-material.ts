// packages/operations/src/verify-material.ts
// Verify and material report (SUBSPEC-D §2.4, §5.7).
// Pure TypeScript, imports only from @easyschemedit/domain via relative paths.

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
} from '../../domain/volume-api.ts';
import {
  isAirLike,
  VANILLA_AIR_LIKE,
} from '../../domain/block-state.ts';

export interface VerifyComparison {
  position: Vec3i;
  sourceState: BlockStateId | null;
  placedState: BlockStateId | null;
  status: 'match' | 'missing' | 'extra' | 'wrong-state';
}

export interface PerPlacementVerify {
  missing: number;
  extra: number;
  wrongState: number;
  match: number;
}

export interface VerifyResult {
  success: boolean;
  comparisons: VerifyComparison[];
  missingCount: number;
  extraCount: number;
  wrongStateCount: number;
  matchCount: number;
  perPlacement: Record<string, PerPlacementVerify>;
}

export interface MaterialTypeCount {
  blockId: string;
  count: number;
  percentage: number;
}

export interface MaterialReport {
  totalBlocks: number;
  totalTypes: number;
  typeCounts: MaterialTypeCount[];
  csv: string;
}

export class VerifyMaterialEngine {
  // Verify placed blocks against source blocks within bounds.
  verify(
    project: Project,
    sourceBlocks: Map<string, BlockStateId>,  // keyed by "x,y,z" world position
    bounds: Bounds3i,
  ): VerifyResult {
    const comparisons: VerifyComparison[] = [];
    let missingCount = 0;
    let extraCount = 0;
    let wrongStateCount = 0;
    let matchCount = 0;
    const perPlacement: Record<string, PerPlacementVerify> = {};

    // Initialize per-placement counters for all visible unlocked placements
    for (const placement of project.placements) {
      if (!placement.locked && placement.visible) {
        perPlacement[placement.id] = { missing: 0, extra: 0, wrongState: 0, match: 0 };
      }
    }

    // Iterate over all positions in bounds
    for (let y = bounds.min[1]; y < bounds.maxExclusive[1]; y++) {
      for (let z = bounds.min[2]; z < bounds.maxExclusive[2]; z++) {
        for (let x = bounds.min[0]; x < bounds.maxExclusive[0]; x++) {
          const position: Vec3i = [x, y, z];
          const key = `${x},${y},${z}`;
          const sourceState = sourceBlocks.get(key) ?? null;

          // Find the top placement at this position
          let placedState: BlockStateId | null = null;
          let ownerPlacementId: string | null = null;

          for (const placement of project.placements) {
            if (placement.locked || !placement.visible) continue;
            const pb = placementWorldBounds(placement);
            if (x < pb.min[0] || x >= pb.maxExclusive[0] ||
                y < pb.min[1] || y >= pb.maxExclusive[1] ||
                z < pb.min[2] || z >= pb.maxExclusive[2]) {
              continue;
            }

            const localBlock = worldToLocalBlock(placement, position);
            if (!localBlock) continue;

            const state = getBlock(placement.volume, localBlock);
            if (isAirLike(state.id, VANILLA_AIR_LIKE)) continue;

            // Top-wins: later placement overrides
            placedState = state;
            ownerPlacementId = placement.id;
          }

          // Determine status
          let status: VerifyComparison['status'];
          if (sourceState === null && placedState === null) {
            // Both air — no comparison needed, skip
            continue;
          } else if (sourceState !== null && placedState === null) {
            status = 'missing';
            missingCount++;
          } else if (sourceState === null && placedState !== null) {
            status = 'extra';
            extraCount++;
          } else if (
            sourceState !== null &&
            placedState !== null &&
            sourceState.id === placedState.id &&
            JSON.stringify(sourceState.props) === JSON.stringify(placedState.props)
          ) {
            status = 'match';
            matchCount++;
          } else {
            status = 'wrong-state';
            wrongStateCount++;
          }

          const comparison: VerifyComparison = {
            position,
            sourceState,
            placedState,
            status,
          };
          comparisons.push(comparison);

          // Update per-placement counters
          if (ownerPlacementId && perPlacement[ownerPlacementId]) {
            switch (status) {
              case 'missing': perPlacement[ownerPlacementId].missing++; break;
              case 'extra': perPlacement[ownerPlacementId].extra++; break;
              case 'wrong-state': perPlacement[ownerPlacementId].wrongState++; break;
              case 'match': perPlacement[ownerPlacementId].match++; break;
            }
          }
        }
      }
    }

    return {
      success: true,
      comparisons,
      missingCount,
      extraCount,
      wrongStateCount,
      matchCount,
      perPlacement,
    };
  }

  // Generate material report: per-type block counts within bounds.
  materialReport(
    project: Project,
    bounds: Bounds3i,
  ): MaterialReport {
    const typeCounts = new Map<string, number>();
    let totalBlocks = 0;

    // Iterate over all positions in bounds
    for (let y = bounds.min[1]; y < bounds.maxExclusive[1]; y++) {
      for (let z = bounds.min[2]; z < bounds.maxExclusive[2]; z++) {
        for (let x = bounds.min[0]; x < bounds.maxExclusive[0]; x++) {
          const position: Vec3i = [x, y, z];

          // Find top non-air block at this position
          let topState: BlockStateId | null = null;

          for (const placement of project.placements) {
            if (placement.locked || !placement.visible) continue;
            const pb = placementWorldBounds(placement);
            if (x < pb.min[0] || x >= pb.maxExclusive[0] ||
                y < pb.min[1] || y >= pb.maxExclusive[1] ||
                z < pb.min[2] || z >= pb.maxExclusive[2]) {
              continue;
            }

            const localBlock = worldToLocalBlock(placement, position);
            if (!localBlock) continue;

            const state = getBlock(placement.volume, localBlock);
            if (isAirLike(state.id, VANILLA_AIR_LIKE)) continue;

            topState = state; // Top-wins
          }

          if (topState) {
            const count = typeCounts.get(topState.id) ?? 0;
            typeCounts.set(topState.id, count + 1);
            totalBlocks++;
          }
        }
      }
    }

    // Build type counts array sorted by count descending
    const typeCountsArray: MaterialTypeCount[] = Array.from(typeCounts.entries())
      .map(([blockId, count]) => ({
        blockId,
        count,
        percentage: totalBlocks > 0 ? (count / totalBlocks) * 100 : 0,
      }))
      .sort((a, b) => b.count - a.count);

    // Generate CSV
    const csvLines = ['blockId,count,percentage'];
    for (const tc of typeCountsArray) {
      csvLines.push(`${tc.blockId},${tc.count},${tc.percentage.toFixed(2)}`);
    }
    const csv = csvLines.join('\n');

    return {
      totalBlocks,
      totalTypes: typeCountsArray.length,
      typeCounts: typeCountsArray,
      csv,
    };
  }
}

// ============================================================================
// Convenience functions
// ============================================================================

export function verifyPlacement(
  project: Project,
  sourceBlocks: Map<string, BlockStateId>,
  bounds: Bounds3i,
): VerifyResult {
  const engine = new VerifyMaterialEngine();
  return engine.verify(project, sourceBlocks, bounds);
}

export function generateMaterialReport(
  project: Project,
  bounds: Bounds3i,
): MaterialReport {
  const engine = new VerifyMaterialEngine();
  return engine.materialReport(project, bounds);
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
