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
  mapCellToWorld,
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
    // 1. Check visible placements whose world AABB intersects bounds
    const visiblePlacements: Array<{ placement: PlacementType; aabb: Bounds3i }> = [];
    for (const p of project.placements) {
      if (!p.visible) continue;
      const aabb = fastPlacementWorldBounds(p);
      if (boundsIntersect(aabb, bounds)) {
        visiblePlacements.push({ placement: p, aabb });
      }
    }

    // 0 visible intersecting placements -> return empty report
    if (visiblePlacements.length === 0) {
      return {
        totalBlocks: 0,
        totalTypes: 0,
        typeCounts: [],
        csv: 'blockId,count,percentage',
      };
    }

    // Check if visible placements are pairwise disjoint
    let pairwiseDisjoint = true;
    if (visiblePlacements.length > 1) {
      for (let i = 0; i < visiblePlacements.length; i++) {
        for (let j = i + 1; j < visiblePlacements.length; j++) {
          if (boundsIntersect(visiblePlacements[i]!.aabb, visiblePlacements[j]!.aabb)) {
            pairwiseDisjoint = false;
            break;
          }
        }
        if (!pairwiseDisjoint) break;
      }
    }

    const typeCounts = new Map<string, number>();
    let totalBlocks = 0;

    // Fast path: 1 visible placement or multiple visible placements whose world AABBs are pairwise disjoint
    if (
      pairwiseDisjoint &&
      !visiblePlacements.some((vp) => vp.placement.eraseTombstones && vp.placement.eraseTombstones.size > 0)
    ) {
      for (const { placement } of visiblePlacements) {
        for (const chunk of placement.volume.chunks.values()) {
          const parts = chunk.key.split(/[,_]/).map(Number);
          if (parts.length !== 3 || parts.some(isNaN)) continue;
          const [cx, cy, cz] = parts as [number, number, number];

          const lx0 = cx * 16;
          const lx1 = lx0 + 15;
          const ly0 = cy * 16;
          const ly1 = ly0 + 15;
          const lz0 = cz * 16;
          const lz1 = lz0 + 15;

          const chunkCorners: Vec3i[] = [
            [lx0, ly0, lz0],
            [lx1, ly0, lz0],
            [lx0, ly1, lz0],
            [lx1, ly1, lz0],
            [lx0, ly0, lz1],
            [lx1, ly0, lz1],
            [lx0, ly1, lz1],
            [lx1, ly1, lz1],
          ];

          let cMinX = Infinity, cMinY = Infinity, cMinZ = Infinity;
          let cMaxX = -Infinity, cMaxY = -Infinity, cMaxZ = -Infinity;

          for (const c of chunkCorners) {
            const res = mapCellToWorld(
              placement.transform.translation,
              placement.origin,
              placement.transform.rotationY,
              placement.transform.mirror,
              c,
            );
            if (res.valid && res.worldBlock) {
              const [wx, wy, wz] = res.worldBlock;
              if (wx < cMinX) cMinX = wx;
              if (wy < cMinY) cMinY = wy;
              if (wz < cMinZ) cMinZ = wz;
              if (wx > cMaxX) cMaxX = wx;
              if (wy > cMaxY) cMaxY = wy;
              if (wz > cMaxZ) cMaxZ = wz;
            }
          }

          if (cMinX === Infinity) continue;

          const chunkAabb: Bounds3i = {
            min: [cMinX, cMinY, cMinZ],
            maxExclusive: [cMaxX + 1, cMaxY + 1, cMaxZ + 1],
          };

          if (!boundsIntersect(chunkAabb, bounds)) continue;

          const isAir = chunk.palette.map((s) => isAirLike(s.id, VANILLA_AIR_LIKE));

          const fullyInside =
            chunkAabb.min[0] >= bounds.min[0] &&
            chunkAabb.maxExclusive[0] <= bounds.maxExclusive[0] &&
            chunkAabb.min[1] >= bounds.min[1] &&
            chunkAabb.maxExclusive[1] <= bounds.maxExclusive[1] &&
            chunkAabb.min[2] >= bounds.min[2] &&
            chunkAabb.maxExclusive[2] <= bounds.maxExclusive[2];

          if (fullyInside) {
            const freq = new Int32Array(chunk.palette.length);
            const indices = chunk.indices;
            for (let i = 0; i < indices.length; i++) {
              freq[indices[i]!]!++;
            }
            for (let pIdx = 0; pIdx < chunk.palette.length; pIdx++) {
              const count = freq[pIdx]!;
              if (count > 0 && !isAir[pIdx]) {
                const blockId = chunk.palette[pIdx]!.id;
                typeCounts.set(blockId, (typeCounts.get(blockId) ?? 0) + count);
                totalBlocks += count;
              }
            }
          } else {
            const indices = chunk.indices;
            for (let cyInChunk = 0; cyInChunk < 16; cyInChunk++) {
              const ly = ly0 + cyInChunk;
              for (let czInChunk = 0; czInChunk < 16; czInChunk++) {
                const lz = lz0 + czInChunk;
                const rowOffset = (cyInChunk * 16 + czInChunk) * 16;
                for (let cxInChunk = 0; cxInChunk < 16; cxInChunk++) {
                  const pIdx = indices[rowOffset + cxInChunk]!;
                  if (isAir[pIdx]) continue;

                  const lx = lx0 + cxInChunk;
                  const res = mapCellToWorld(
                    placement.transform.translation,
                    placement.origin,
                    placement.transform.rotationY,
                    placement.transform.mirror,
                    [lx, ly, lz],
                  );
                  if (res.valid && res.worldBlock) {
                    const [wx, wy, wz] = res.worldBlock;
                    if (
                      wx >= bounds.min[0] && wx < bounds.maxExclusive[0] &&
                      wy >= bounds.min[1] && wy < bounds.maxExclusive[1] &&
                      wz >= bounds.min[2] && wz < bounds.maxExclusive[2]
                    ) {
                      const blockId = chunk.palette[pIdx]!.id;
                      typeCounts.set(blockId, (typeCounts.get(blockId) ?? 0) + 1);
                      totalBlocks++;
                    }
                  }
                }
              }
            }
          }
        }
      }
    } else {
      // Overlapping placements or tombstones: fallback with precomputed AABBs
      for (let y = bounds.min[1]; y < bounds.maxExclusive[1]; y++) {
        for (let z = bounds.min[2]; z < bounds.maxExclusive[2]; z++) {
          for (let x = bounds.min[0]; x < bounds.maxExclusive[0]; x++) {
            const position: Vec3i = [x, y, z];
            let topState: BlockStateId | null = null;

            for (const { placement, aabb } of visiblePlacements) {
              if (
                x < aabb.min[0] || x >= aabb.maxExclusive[0] ||
                y < aabb.min[1] || y >= aabb.maxExclusive[1] ||
                z < aabb.min[2] || z >= aabb.maxExclusive[2]
              ) {
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

function boundsIntersect(a: Bounds3i, b: Bounds3i): boolean {
  return (
    a.min[0] < b.maxExclusive[0] &&
    a.maxExclusive[0] > b.min[0] &&
    a.min[1] < b.maxExclusive[1] &&
    a.maxExclusive[1] > b.min[1] &&
    a.min[2] < b.maxExclusive[2] &&
    a.maxExclusive[2] > b.min[2]
  );
}

function fastPlacementWorldBounds(
  placement: PlacementType,
): Bounds3i {
  const { transform, volume, origin } = placement;
  const { min, maxExclusive } = volume.bounds;
  if (min[0] >= maxExclusive[0] || min[1] >= maxExclusive[1] || min[2] >= maxExclusive[2]) {
    return { min: [0, 0, 0], maxExclusive: [0, 0, 0] };
  }

  const corners: Vec3i[] = [
    [min[0], min[1], min[2]],
    [maxExclusive[0] - 1, min[1], min[2]],
    [min[0], maxExclusive[1] - 1, min[2]],
    [maxExclusive[0] - 1, maxExclusive[1] - 1, min[2]],
    [min[0], min[1], maxExclusive[2] - 1],
    [maxExclusive[0] - 1, min[1], maxExclusive[2] - 1],
    [min[0], maxExclusive[1] - 1, maxExclusive[2] - 1],
    [maxExclusive[0] - 1, maxExclusive[1] - 1, maxExclusive[2] - 1],
  ];

  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

  for (const c of corners) {
    const res = mapCellToWorld(transform.translation, origin, transform.rotationY, transform.mirror, c);
    if (res.valid && res.worldBlock) {
      const [wx, wy, wz] = res.worldBlock;
      if (wx < minX) minX = wx;
      if (wy < minY) minY = wy;
      if (wz < minZ) minZ = wz;
      if (wx > maxX) maxX = wx;
      if (wy > maxY) maxY = wy;
      if (wz > maxZ) maxZ = wz;
    }
  }

  if (minX === Infinity) {
    return placementWorldBounds(placement);
  }

  return {
    min: [minX, minY, minZ] as Vec3i,
    maxExclusive: [maxX + 1, maxY + 1, maxZ + 1] as Vec3i,
  };
}

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
