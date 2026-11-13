// packages/operations/src/bake.ts
// Bake operation: union bounds, effective block, merge rules, atomic commit (SUBSPEC-D §2.4, §4.7).
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
  setBlock,
} from '../../domain/volume-api.ts';
import {
  isAirLike,
  VANILLA_AIR_LIKE,
  CANONICAL_AIR,
} from '../../domain/block-state.ts';

export interface BakeOptions {
  overlapPolicy: 'top-wins' | 'bottom-wins';
  affectedPlacements: string[];
  createNewPlacement: boolean;
  newPlacementName?: string;
}

export interface BakeResult {
  success: boolean;
  unionBounds: Bounds3i;
  changedPlacements: string[];
  newPlacementId?: string;
  changedCells: number;
  warnings: string[];
  atomic: boolean;
}

export class BakeEngine {
  private readonly options: BakeOptions;

  constructor(options: BakeOptions) {
    this.options = options;
  }

  // Bake: merge overlapping placements into effective composite.
  // Atomic: all-or-nothing commit.
  bake(project: Project): BakeResult {
    const warnings: string[] = [];
    const changedPlacements: string[] = [];

    // Step 1: Compute union bounds of all affected placements
    const affectedPlacements = project.placements.filter(
      (p) => this.options.affectedPlacements.includes(p.id) && !p.locked,
    );

    if (affectedPlacements.length === 0) {
      return {
        success: true,
        unionBounds: { min: [0, 0, 0], maxExclusive: [0, 0, 0] },
        changedPlacements: [],
        changedCells: 0,
        warnings: ['No affected placements to bake'],
        atomic: true,
      };
    }

    const unionBounds = computeUnionBounds(affectedPlacements);

    if (this.options.createNewPlacement) {
      // Bake into new placement — existing placements unchanged
      const newPlacementId = `baked-${Date.now()}`;
      const newPlacementName = this.options.newPlacementName || 'Baked Result';

      const newPlacement: PlacementType = {
        id: newPlacementId,
        name: newPlacementName,
        volume: {
          bounds: {
            min: [...unionBounds.min] as Vec3i,
            maxExclusive: [...unionBounds.maxExclusive] as Vec3i,
          },
          chunkSize: 16,
          chunks: new Map(),
          nonAirCount: 0,
          paletteCardinality: 1,
        },
        transform: { translation: [0, 0, 0], rotationY: 0, mirror: 'none' },
        origin: [0, 0, 0],
        ancillary: {
          blockEntities: new Map(),
          entities: [],
          pendingBlockTicks: [],
          pendingFluidTicks: [],
          unknownTags: new Map(),
        },
        visible: true,
        locked: false,
        createdAt: new Date().toISOString(),
        source: { format: 'generated', filename: `${newPlacementId}.schem`, diagnostics: [] },
        eraseTombstones: new Set(),
      };

      // Order affected placements by priority:
      // top-wins: forward order so higher-index overwrites lower-index.
      // bottom-wins: reverse order so lower-index wins last (overwrites higher-index).
      const orderedPlacements = this.options.overlapPolicy === 'bottom-wins'
        ? [...affectedPlacements].reverse()
        : [...affectedPlacements];

      for (const p of orderedPlacements) {
        const isIdentity =
          p.transform.rotationY === 0 &&
          p.transform.mirror === 'none' &&
          p.origin[0] === 0 &&
          p.origin[1] === 0 &&
          p.origin[2] === 0;

        const [tx, ty, tz] = p.transform.translation;
        const hasTombstones = p.eraseTombstones && p.eraseTombstones.size > 0;
        const hasBlockEntities = p.ancillary.blockEntities && p.ancillary.blockEntities.size > 0;

        // Iterate sparse chunks directly
        for (const chunk of p.volume.chunks.values()) {
          // Pre-check if chunk has any non-air blocks
          const nonAirPalette = new Uint8Array(chunk.palette.length);
          let chunkHasNonAir = false;
          for (let pi = 0; pi < chunk.palette.length; pi++) {
            if (!isAirLike(chunk.palette[pi]!.id, VANILLA_AIR_LIKE)) {
              nonAirPalette[pi] = 1;
              chunkHasNonAir = true;
            }
          }
          if (!chunkHasNonAir) continue;

          const [cxCoord, cyCoord, czCoord] = chunk.key.split('_').map(Number);
          const chunkBaseX = cxCoord * 16;
          const chunkBaseY = cyCoord * 16;
          const chunkBaseZ = czCoord * 16;

          for (let i = 0; i < chunk.indices.length; i++) {
            const pIdx = chunk.indices[i]!;
            if (!nonAirPalette[pIdx]) continue;
            const state = chunk.palette[pIdx]!;

            const cy = Math.floor(i / 256);
            const cz = Math.floor((i % 256) / 16);
            const cx = i % 16;
            const lx = chunkBaseX + cx;
            const ly = chunkBaseY + cy;
            const lz = chunkBaseZ + cz;

            if (hasTombstones) {
              if (
                p.eraseTombstones.has(`${lx}_${ly}_${lz}`) ||
                p.eraseTombstones.has(`${lx},${ly},${lz}`)
              ) {
                continue;
              }
            }

            let worldPos: Vec3i;
            if (isIdentity) {
              worldPos = [tx + lx, ty + ly, tz + lz];
            } else {
              const mapped = mapCellToWorld(
                p.transform.translation,
                p.origin,
                p.transform.rotationY,
                p.transform.mirror,
                [lx, ly, lz],
              );
              if (!mapped.valid || !mapped.worldBlock) continue;
              worldPos = mapped.worldBlock;
            }

            setBlock(newPlacement.volume, worldPos, state);

            // Ancillary reconciliation: block entity from winning placement
            const newKey = `${worldPos[0]},${worldPos[1]},${worldPos[2]}`;
            if (hasBlockEntities) {
              const beKey1 = `${lx}_${ly}_${lz}`;
              const beKey2 = `${lx},${ly},${lz}`;
              const be = p.ancillary.blockEntities.get(beKey1) ?? p.ancillary.blockEntities.get(beKey2);
              if (be) {
                newPlacement.ancillary.blockEntities.set(newKey, {
                  ...be,
                  position: [...worldPos],
                });
              } else if (newPlacement.ancillary.blockEntities.size > 0) {
                newPlacement.ancillary.blockEntities.delete(newKey);
              }
            } else if (newPlacement.ancillary.blockEntities.size > 0) {
              newPlacement.ancillary.blockEntities.delete(newKey);
            }
          }
        }

        // Apply erase tombstones from this placement
        if (hasTombstones) {
          for (const tombKey of p.eraseTombstones) {
            const parts = tombKey.includes('_') ? tombKey.split('_') : tombKey.split(',');
            if (parts.length === 3) {
              const lx = Number(parts[0]);
              const ly = Number(parts[1]);
              const lz = Number(parts[2]);
              if (!Number.isNaN(lx) && !Number.isNaN(ly) && !Number.isNaN(lz)) {
                let worldPos: Vec3i;
                if (isIdentity) {
                  worldPos = [tx + lx, ty + ly, tz + lz];
                } else {
                  const mapped = mapCellToWorld(
                    p.transform.translation,
                    p.origin,
                    p.transform.rotationY,
                    p.transform.mirror,
                    [lx, ly, lz],
                  );
                  if (!mapped.valid || !mapped.worldBlock) continue;
                  worldPos = mapped.worldBlock;
                }
                setBlock(newPlacement.volume, worldPos, CANONICAL_AIR);
                const newKey = `${worldPos[0]},${worldPos[1]},${worldPos[2]}`;
                newPlacement.ancillary.blockEntities.delete(newKey);
              }
            }
          }
        }
      }

      // Reconcile entities inside unionBounds from affected placements
      for (const p of affectedPlacements) {
        for (const ent of p.ancillary.entities) {
          const [ex, ey, ez] = ent.position;
          if (
            ex >= unionBounds.min[0] &&
            ex < unionBounds.maxExclusive[0] &&
            ey >= unionBounds.min[1] &&
            ey < unionBounds.maxExclusive[1] &&
            ez >= unionBounds.min[2] &&
            ez < unionBounds.maxExclusive[2]
          ) {
            newPlacement.ancillary.entities.push({
              ...ent,
              position: [...ent.position],
            });
          }
        }
      }

      // Compute palette cardinality
      const uniqueStates = new Set<string>();
      for (const chunk of newPlacement.volume.chunks.values()) {
        for (const s of chunk.palette) {
          uniqueStates.add(s.id);
        }
      }
      newPlacement.volume.paletteCardinality = Math.max(1, uniqueStates.size);

      project.placements.push(newPlacement);

      const bakedCells = newPlacement.volume.nonAirCount;

      return {
        success: true,
        unionBounds,
        changedPlacements: [newPlacementId],
        newPlacementId,
        changedCells: bakedCells,
        warnings,
        atomic: true,
      };
    } else {
      // Bake in place — modify affected placements
      // Only scan/resolve positions where two or more affected placements' world AABBs intersect
      const boundsMap = new Map<string, Bounds3i>();
      for (const p of affectedPlacements) {
        boundsMap.set(p.id, placementWorldBounds(p));
      }

      const candidatePositions = new Set<string>();
      for (let i = 0; i < affectedPlacements.length; i++) {
        const pA = affectedPlacements[i]!;
        const bA = boundsMap.get(pA.id)!;
        for (let j = i + 1; j < affectedPlacements.length; j++) {
          const pB = affectedPlacements[j]!;
          const bB = boundsMap.get(pB.id)!;
          if (aabbIntersects(bA, bB)) {
            const inter = intersectBounds(bA, bB);
            collectNonAirPositionsInBounds(pA, inter, candidatePositions);
            collectNonAirPositionsInBounds(pB, inter, candidatePositions);
          }
        }
      }

      let changedCells = 0;
      for (const posKey of candidatePositions) {
        const [x, y, z] = posKey.split(',').map(Number) as [number, number, number];
        const position: Vec3i = [x, y, z];

        const winningState = getWinningStateAt(affectedPlacements, position, this.options.overlapPolicy);
        if (!winningState) continue;

        const ownerPlacement = findOwnerAt(affectedPlacements, position, this.options.overlapPolicy);
        if (!ownerPlacement) continue;

        const localBlock = worldToLocalBlock(ownerPlacement, position);
        if (!localBlock) continue;

        const oldState = getBlock(ownerPlacement.volume, localBlock);
        if (
          oldState.id === winningState.id &&
          JSON.stringify(oldState.props) === JSON.stringify(winningState.props)
        ) {
          continue;
        }

        setBlock(ownerPlacement.volume, localBlock, winningState);
        changedCells++;

        if (!changedPlacements.includes(ownerPlacement.id)) {
          changedPlacements.push(ownerPlacement.id);
        }
      }

      return {
        success: true,
        unionBounds,
        changedPlacements,
        changedCells,
        warnings,
        atomic: true,
      };
    }
  }
}

// ============================================================================
// Helper functions
// ============================================================================

function computeUnionBounds(placements: PlacementType[]): Bounds3i {
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

  for (const placement of placements) {
    const pb = placementWorldBounds(placement);
    if (pb.min[0] >= pb.maxExclusive[0] || pb.min[1] >= pb.maxExclusive[1] || pb.min[2] >= pb.maxExclusive[2]) {
      continue;
    }
    if (pb.min[0] < minX) minX = pb.min[0];
    if (pb.min[1] < minY) minY = pb.min[1];
    if (pb.min[2] < minZ) minZ = pb.min[2];
    if (pb.maxExclusive[0] > maxX) maxX = pb.maxExclusive[0];
    if (pb.maxExclusive[1] > maxY) maxY = pb.maxExclusive[1];
    if (pb.maxExclusive[2] > maxZ) maxZ = pb.maxExclusive[2];
  }

  if (minX === Infinity) {
    return { min: [0, 0, 0], maxExclusive: [0, 0, 0] };
  }

  return {
    min: [minX, minY, minZ] as Vec3i,
    maxExclusive: [maxX, maxY, maxZ] as Vec3i,
  };
}

function aabbIntersects(a: Bounds3i, b: Bounds3i): boolean {
  return (
    a.min[0] < b.maxExclusive[0] &&
    a.maxExclusive[0] > b.min[0] &&
    a.min[1] < b.maxExclusive[1] &&
    a.maxExclusive[1] > b.min[1] &&
    a.min[2] < b.maxExclusive[2] &&
    a.maxExclusive[2] > b.min[2]
  );
}

function intersectBounds(a: Bounds3i, b: Bounds3i): Bounds3i {
  return {
    min: [
      Math.max(a.min[0], b.min[0]),
      Math.max(a.min[1], b.min[1]),
      Math.max(a.min[2], b.min[2]),
    ] as Vec3i,
    maxExclusive: [
      Math.min(a.maxExclusive[0], b.maxExclusive[0]),
      Math.min(a.maxExclusive[1], b.maxExclusive[1]),
      Math.min(a.maxExclusive[2], b.maxExclusive[2]),
    ] as Vec3i,
  };
}

function collectNonAirPositionsInBounds(
  placement: PlacementType,
  bounds: Bounds3i,
  out: Set<string>,
): void {
  const isIdentity =
    placement.transform.rotationY === 0 &&
    placement.transform.mirror === 'none' &&
    placement.origin[0] === 0 &&
    placement.origin[1] === 0 &&
    placement.origin[2] === 0;

  const [tx, ty, tz] = placement.transform.translation;

  for (const chunk of placement.volume.chunks.values()) {
    let hasNonAir = false;
    for (let pi = 0; pi < chunk.palette.length; pi++) {
      if (!isAirLike(chunk.palette[pi]!.id, VANILLA_AIR_LIKE)) {
        hasNonAir = true;
        break;
      }
    }
    if (!hasNonAir) continue;

    const [cxCoord, cyCoord, czCoord] = chunk.key.split('_').map(Number);
    const chunkBaseX = cxCoord * 16;
    const chunkBaseY = cyCoord * 16;
    const chunkBaseZ = czCoord * 16;

    if (isIdentity) {
      const cMinX = tx + chunkBaseX;
      const cMinY = ty + chunkBaseY;
      const cMinZ = tz + chunkBaseZ;
      const cMaxX = cMinX + 16;
      const cMaxY = cMinY + 16;
      const cMaxZ = cMinZ + 16;

      if (
        cMinX >= bounds.maxExclusive[0] || cMaxX <= bounds.min[0] ||
        cMinY >= bounds.maxExclusive[1] || cMaxY <= bounds.min[1] ||
        cMinZ >= bounds.maxExclusive[2] || cMaxZ <= bounds.min[2]
      ) {
        continue;
      }
    }

    for (let i = 0; i < chunk.indices.length; i++) {
      const pIdx = chunk.indices[i]!;
      const state = chunk.palette[pIdx]!;
      if (isAirLike(state.id, VANILLA_AIR_LIKE)) continue;

      const cy = Math.floor(i / 256);
      const cz = Math.floor((i % 256) / 16);
      const cx = i % 16;
      const lx = chunkBaseX + cx;
      const ly = chunkBaseY + cy;
      const lz = chunkBaseZ + cz;

      let wx: number, wy: number, wz: number;
      if (isIdentity) {
        wx = tx + lx;
        wy = ty + ly;
        wz = tz + lz;
      } else {
        const mapped = mapCellToWorld(
          placement.transform.translation,
          placement.origin,
          placement.transform.rotationY,
          placement.transform.mirror,
          [lx, ly, lz],
        );
        if (!mapped.valid || !mapped.worldBlock) continue;
        [wx, wy, wz] = mapped.worldBlock;
      }

      if (
        wx >= bounds.min[0] && wx < bounds.maxExclusive[0] &&
        wy >= bounds.min[1] && wy < bounds.maxExclusive[1] &&
        wz >= bounds.min[2] && wz < bounds.maxExclusive[2]
      ) {
        out.add(`${wx},${wy},${wz}`);
      }
    }
  }
}

function getWinningStateAt(
  placements: PlacementType[],
  position: Vec3i,
  overlapPolicy: 'top-wins' | 'bottom-wins' = 'top-wins',
): BlockStateId | null {
  const order = overlapPolicy === 'bottom-wins'
    ? placements
    : [...placements].reverse();

  for (const placement of order) {
    const pb = placementWorldBounds(placement);
    if (
      position[0] < pb.min[0] || position[0] >= pb.maxExclusive[0] ||
      position[1] < pb.min[1] || position[1] >= pb.maxExclusive[1] ||
      position[2] < pb.min[2] || position[2] >= pb.maxExclusive[2]
    ) {
      continue;
    }

    const localBlock = worldToLocalBlock(placement, position);
    if (!localBlock) continue;

    const state = getBlock(placement.volume, localBlock);
    if (isAirLike(state.id, VANILLA_AIR_LIKE)) continue;

    return state;
  }

  return null;
}

function findOwnerAt(
  placements: PlacementType[],
  position: Vec3i,
  overlapPolicy: 'top-wins' | 'bottom-wins' = 'top-wins',
): PlacementType | null {
  const order = overlapPolicy === 'bottom-wins'
    ? placements
    : [...placements].reverse();

  for (const placement of order) {
    const pb = placementWorldBounds(placement);
    if (
      position[0] < pb.min[0] || position[0] >= pb.maxExclusive[0] ||
      position[1] < pb.min[1] || position[1] >= pb.maxExclusive[1] ||
      position[2] < pb.min[2] || position[2] >= pb.maxExclusive[2]
    ) {
      continue;
    }

    const localBlock = worldToLocalBlock(placement, position);
    if (!localBlock) continue;

    const state = getBlock(placement.volume, localBlock);
    if (!isAirLike(state.id, VANILLA_AIR_LIKE)) {
      return placement;
    }
  }

  return null;
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

// ============================================================================
// Convenience function
// ============================================================================

export function bakeProject(
  project: Project,
  options: BakeOptions,
): BakeResult {
  const engine = new BakeEngine(options);
  return engine.bake(project);
}
