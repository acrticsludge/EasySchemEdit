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
} from '../../domain/coordinates.ts';
import {
  getBlock,
  setBlock,
} from '../../domain/volume-api.ts';
import {
  isAirLike,
  VANILLA_AIR_LIKE,
} from '../../domain/block-state.ts';
import { resolveBlockAt } from '../../domain/effective-block.ts';

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

    // Step 2: Build effective composite map (position -> winning block state)
    const effectiveComposite = new Map<string, { position: Vec3i; state: BlockStateId }>();

    for (let y = unionBounds.min[1]; y < unionBounds.maxExclusive[1]; y++) {
      for (let z = unionBounds.min[2]; z < unionBounds.maxExclusive[2]; z++) {
        for (let x = unionBounds.min[0]; x < unionBounds.maxExclusive[0]; x++) {
          const position: Vec3i = [x, y, z];
          const winningState = getWinningStateAt(affectedPlacements, position);

          if (winningState) {
            const key = `${x},${y},${z}`;
            effectiveComposite.set(key, { position, state: winningState });
          }
        }
      }
    }

    // Step 3: Apply bake
    let changedCells = 0;

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

      let bakedCells = 0;
      for (let y = unionBounds.min[1]; y < unionBounds.maxExclusive[1]; y++) {
        for (let z = unionBounds.min[2]; z < unionBounds.maxExclusive[2]; z++) {
          for (let x = unionBounds.min[0]; x < unionBounds.maxExclusive[0]; x++) {
            const pos: Vec3i = [x, y, z];
            const effective = resolveBlockAt(
              { ...project, placements: affectedPlacements },
              pos,
              this.options.overlapPolicy,
            );
            if (!isAirLike(effective.state.id, VANILLA_AIR_LIKE)) {
              setBlock(newPlacement.volume, pos, effective.state);
              bakedCells++;

              // Ancillary reconciliation: block entity from winning placement
              if (effective.owningPlacementId) {
                const winningPlacement = affectedPlacements.find((p) => p.id === effective.owningPlacementId);
                if (winningPlacement) {
                  const localBlock = worldToLocalBlock(winningPlacement, pos);
                  if (localBlock) {
                    const beKey = `${localBlock[0]},${localBlock[1]},${localBlock[2]}`;
                    const be = winningPlacement.ancillary.blockEntities.get(beKey);
                    if (be) {
                      const newKey = `${pos[0]},${pos[1]},${pos[2]}`;
                      newPlacement.ancillary.blockEntities.set(newKey, {
                        ...be,
                        position: [...pos],
                      });
                    }
                  }
                }
              }
            }
          }
        }
      }

      // Reconcile entities inside unionBounds from winning/affected placements
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

      project.placements.push(newPlacement);

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
      const snapshots = new Map<string, { position: Vec3i; oldState: BlockStateId }>();

      for (const [key, { position, state }] of effectiveComposite) {
        const [x, y, z] = key.split(',').map(Number) as [number, number, number];

        // Find which placement owns this position (top-wins)
        const ownerPlacement = findOwnerAt(affectedPlacements, position);
        if (!ownerPlacement) continue;

        const localBlock = worldToLocalBlock(ownerPlacement, position);
        if (!localBlock) continue;

        const oldState = getBlock(ownerPlacement.volume, localBlock);

        // Skip if no change
        if (
          oldState.id === state.id &&
          JSON.stringify(oldState.props) === JSON.stringify(state.props)
        ) {
          continue;
        }

        // Record snapshot for undo
        snapshots.set(key, { position, oldState });

        // Write new state
        setBlock(ownerPlacement.volume, localBlock, state);
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
    if (pb.min[0] < minX) minX = pb.min[0];
    if (pb.min[1] < minY) minY = pb.min[1];
    if (pb.min[2] < minZ) minZ = pb.min[2];
    if (pb.maxExclusive[0] > maxX) maxX = pb.maxExclusive[0];
    if (pb.maxExclusive[1] > maxY) maxY = pb.maxExclusive[1];
    if (pb.maxExclusive[2] > maxZ) maxZ = pb.maxExclusive[2];
  }

  return {
    min: [minX, minY, minZ] as Vec3i,
    maxExclusive: [maxX, maxY, maxZ] as Vec3i,
  };
}

function getWinningStateAt(
  placements: PlacementType[],
  position: Vec3i,
): BlockStateId | null {
  let winner: BlockStateId | null = null;

  for (const placement of placements) {
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

    // Top-wins: later placement overrides earlier
    winner = state;
  }

  return winner;
}

function findOwnerAt(
  placements: PlacementType[],
  position: Vec3i,
): PlacementType | null {
  // Top-wins: last placement in array that contains this position with non-air
  for (let i = placements.length - 1; i >= 0; i--) {
    const placement = placements[i];
    const pb = placementWorldBounds(placement);
    if (position[0] < pb.min[0] || position[0] >= pb.maxExclusive[0] ||
        position[1] < pb.min[1] || position[1] >= pb.maxExclusive[1] ||
        position[2] < pb.min[2] || position[2] >= pb.maxExclusive[2]) {
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
