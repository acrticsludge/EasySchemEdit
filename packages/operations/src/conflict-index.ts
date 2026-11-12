// packages/operations/src/conflict-index.ts
// Conflict detection: spatial index, owner resolution, 3 categories (SUBSPEC-D §5.5, §5.6).
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

export type ConflictCategory = 'clean' | 'same-state' | 'state-conflict';

export interface ConflictEntry {
  position: Vec3i;
  category: ConflictCategory;
  owners: string[];
  winningOwner: string | null;
  currentState: BlockStateId | null;
  proposedState: BlockStateId | null;
}

export interface ConflictResult {
  category: ConflictCategory;
  entries: ConflictEntry[];
  hasConflicts: boolean;
  cleanPositions: Vec3i[];
  sameStatePositions: Vec3i[];
  stateConflictPositions: Vec3i[];
}

export interface ConflictIndexOptions {
  overlapPolicy: 'top-wins' | 'bottom-wins';
}

// World position key: "x,y,z"
type WorldPosKey = string;

// Per-position ownership record
interface PositionRecord {
  position: Vec3i;
  owners: string[];           // placement IDs in precedence order
  states: Map<string, BlockStateId>;  // placementId -> block state at this position
}

// ============================================================================
// Conflict Index
// ============================================================================

export class ConflictIndex {
  private readonly options: ConflictIndexOptions;
  private readonly positions: Map<WorldPosKey, PositionRecord> = new Map();

  constructor(options: ConflictIndexOptions) {
    this.options = options;
  }

  // Register a placement's blocks in the index.
  // Indexes all non-air blocks in the placement's volume.
  registerPlacement(placement: PlacementType): void {
    const pb = placementWorldBounds(placement);

    for (let y = pb.min[1]; y < pb.maxExclusive[1]; y++) {
      for (let z = pb.min[2]; z < pb.maxExclusive[2]; z++) {
        for (let x = pb.min[0]; x < pb.maxExclusive[0]; x++) {
          const worldBlock: Vec3i = [x, y, z];
          const localBlock = worldToLocalBlock(placement, worldBlock);
          if (!localBlock) continue;

          const state = getBlock(placement.volume, localBlock);
          if (isAirLike(state.id, VANILLA_AIR_LIKE)) continue;

          const key = `${x},${y},${z}`;
          let record = this.positions.get(key);
          if (!record) {
            record = {
              position: worldBlock,
              owners: [],
              states: new Map(),
            };
            this.positions.set(key, record);
          }

          // Add owner in precedence order (later in array = higher priority for top-wins)
          if (!record.owners.includes(placement.id)) {
            record.owners.push(placement.id);
          }
          record.states.set(placement.id, state);
        }
      }
    }
  }

  // Remove a placement from the index.
  unregisterPlacement(placementId: string): void {
    for (const [key, record] of this.positions) {
      const ownerIdx = record.owners.indexOf(placementId);
      if (ownerIdx >= 0) {
        record.owners.splice(ownerIdx, 1);
        record.states.delete(placementId);
      }

      // Clean up empty records
      if (record.owners.length === 0) {
        this.positions.delete(key);
      }
    }
  }

  // Detect conflicts for a proposed operation over bounds.
  // Returns category breakdown: clean, same-state, state-conflict.
  detectConflicts(
    project: Project,
    bounds: Bounds3i,
    proposedState: BlockStateId,
  ): ConflictResult {
    const entries: ConflictEntry[] = [];
    const cleanPositions: Vec3i[] = [];
    const sameStatePositions: Vec3i[] = [];
    const stateConflictPositions: Vec3i[] = [];

    let hasStateConflict = false;
    let hasSameState = false;

    for (let y = bounds.min[1]; y < bounds.maxExclusive[1]; y++) {
      for (let z = bounds.min[2]; z < bounds.maxExclusive[2]; z++) {
        for (let x = bounds.min[0]; x < bounds.maxExclusive[0]; x++) {
          const position: Vec3i = [x, y, z];
          const key = `${x},${y},${z}`;
          const record = this.positions.get(key);

          if (!record) {
            // No existing block at this position → clean
            const entry: ConflictEntry = {
              position,
              category: 'clean',
              owners: [],
              winningOwner: null,
              currentState: null,
              proposedState,
            };
            entries.push(entry);
            cleanPositions.push(position);
            continue;
          }

          // Resolve winning owner based on overlap policy
          const winningOwner = this.resolveWinningOwner(record);
          const currentState = record.states.get(winningOwner ?? '') ?? null;

          let category: ConflictCategory;
          if (currentState === null) {
            category = 'clean';
            cleanPositions.push(position);
          } else if (currentState.id === proposedState.id &&
            JSON.stringify(currentState.props) === JSON.stringify(proposedState.props)) {
            category = 'same-state';
            sameStatePositions.push(position);
            hasSameState = true;
          } else {
            category = 'state-conflict';
            stateConflictPositions.push(position);
            hasStateConflict = true;
          }

          const entry: ConflictEntry = {
            position,
            category,
            owners: [...record.owners],
            winningOwner,
            currentState,
            proposedState,
          };
          entries.push(entry);
        }
      }
    }

    // Overall category: state-conflict > same-state > clean
    let overallCategory: ConflictCategory = 'clean';
    if (hasStateConflict) {
      overallCategory = 'state-conflict';
    } else if (hasSameState) {
      overallCategory = 'same-state';
    }

    return {
      category: overallCategory,
      entries,
      hasConflicts: hasStateConflict || hasSameState,
      cleanPositions,
      sameStatePositions,
      stateConflictPositions,
    };
  }

  // Resolve the winning owner for a position record based on overlap policy.
  private resolveWinningOwner(record: PositionRecord): string | null {
    if (record.owners.length === 0) return null;
    if (this.options.overlapPolicy === 'top-wins') {
      // Later in array = higher priority
      return record.owners[record.owners.length - 1];
    } else {
      // bottom-wins: earlier in array = higher priority
      return record.owners[0];
    }
  }

  // Incremental invalidation: remove records for affected chunks only.
  // Does NOT do a full bounding box scan.
  invalidateChunks(chunkKeys: string[]): void {
    const chunkSet = new Set(chunkKeys);

    for (const [key, record] of this.positions) {
      const [cx, cy, cz] = key.split(',').map(Number) as [number, number, number];
      const chunkKey = `${cx >> 4},${cy >> 4},${cz >> 4}`;

      if (chunkSet.has(chunkKey)) {
        this.positions.delete(key);
      }
    }
  }

  // Get the number of indexed positions.
  size(): number {
    return this.positions.size;
  }

  // Clear the entire index.
  clear(): void {
    this.positions.clear();
  }

  // Get all positions for a placement.
  getPositionsForPlacement(placementId: string): Vec3i[] {
    const result: Vec3i[] = [];
    for (const record of this.positions.values()) {
      if (record.owners.includes(placementId)) {
        result.push([...record.position] as Vec3i);
      }
    }
    return result;
  }
}

// ============================================================================
// Convenience function
// ============================================================================

export function detectConflicts(
  project: Project,
  bounds: Bounds3i,
  proposedState: BlockStateId,
  overlapPolicy: 'top-wins' | 'bottom-wins' = 'top-wins',
): ConflictResult {
  const index = new ConflictIndex({ overlapPolicy });

  // Register all visible, unlocked placements
  for (const placement of project.placements) {
    if (!placement.locked && placement.visible) {
      index.registerPlacement(placement);
    }
  }

  return index.detectConflicts(project, bounds, proposedState);
}

// ============================================================================
// Helper functions
// ============================================================================

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
