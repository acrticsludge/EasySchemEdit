// packages/operations/src/conflict-index.ts
// Conflict detection: spatial index, owner resolution, 3 categories (SUBSPEC-D §5.5, §5.6).
// Pure TypeScript, imports only from @easyschemedit/domain via relative paths.

import type {
  Bounds3i,
  BlockStateId,
  Vec3i,
} from '../../domain/types.ts';
import type { Placement as PlacementType, Project } from '../../domain/placement.ts';
import type { VoxelChunk } from '../../domain/volume.ts';
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
  hasSameState?: boolean;
  hasStateConflict?: boolean;
  cleanPositions: Vec3i[];
  sameStatePositions: Vec3i[];
  stateConflictPositions: Vec3i[];
  truncated?: boolean;
  totalSameState?: number;
  totalStateConflict?: number;
}

export interface DetectConflictsOptions {
  includeClean?: boolean;
  maxEntries?: number;
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
  // Indexes all non-air blocks in the placement's volume (or restricted to filterBoundsList).
  registerPlacement(placement: PlacementType, filterBoundsList?: Bounds3i[]): void {
    const hasFilter = filterBoundsList !== undefined && filterBoundsList.length > 0;

    for (const chunk of placement.volume.chunks.values()) {
      const parts = chunk.key.split(/[,_]/).map(Number);
      if (parts.length !== 3 || parts.some(isNaN)) continue;
      const [cx, cy, cz] = parts as [number, number, number];

      if (hasFilter) {
        const chunkAABB = chunkWorldBounds(placement, cx, cy, cz);
        if (!boundsIntersectsAny(chunkAABB, filterBoundsList)) {
          continue;
        }
      }

      const isAir = chunk.palette.map((s) => isAirLike(s.id, VANILLA_AIR_LIKE));

      const lx0 = cx * 16;
      const ly0 = cy * 16;
      const lz0 = cz * 16;
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
            const state = chunk.palette[pIdx]!;
            try {
              const worldBlock = localBlockToWorld(placement, [lx, ly, lz]);
              if (hasFilter && !pointInAnyBounds(worldBlock, filterBoundsList)) {
                continue;
              }
              const key = `${worldBlock[0]},${worldBlock[1]},${worldBlock[2]}`;
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
            } catch {
              // Off-grid block
            }
          }
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

  // Detect conflicts for a proposed operation or scene-wide multi-placement overlaps.
  // Returns category breakdown: clean, same-state, state-conflict.
  detectConflicts(
    project: Project,
    bounds?: Bounds3i,
    proposedState?: BlockStateId,
    options?: DetectConflictsOptions,
  ): ConflictResult {
    const entries: ConflictEntry[] = [];
    const cleanPositions: Vec3i[] = [];
    const sameStatePositions: Vec3i[] = [];
    const stateConflictPositions: Vec3i[] = [];

    const includeClean = options?.includeClean ?? true;
    const maxEntries = options?.maxEntries;
    let maxReached = false;
    let truncated = false;
    let totalSameState = 0;
    let totalStateConflict = 0;

    let hasStateConflict = false;
    let hasSameState = false;

    // 1. Proposed state mode: compare cells in bounds against proposedState
    if (proposedState !== undefined && bounds !== undefined) {
      for (let y = bounds.min[1]; y < bounds.maxExclusive[1]; y++) {
        for (let z = bounds.min[2]; z < bounds.maxExclusive[2]; z++) {
          for (let x = bounds.min[0]; x < bounds.maxExclusive[0]; x++) {
            const position: Vec3i = [x, y, z];
            const key = `${x},${y},${z}`;
            const record = this.positions.get(key);

            if (!record) {
              // No existing block at this position → clean
              if (includeClean) {
                if (!maxReached) {
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
                  if (maxEntries !== undefined && entries.length >= maxEntries) {
                    maxReached = true;
                    truncated = true;
                  }
                }
              }
              continue;
            }

            // Resolve winning owner based on overlap policy
            const winningOwner = this.resolveWinningOwner(record);
            const currentState = record.states.get(winningOwner ?? '') ?? null;

            let category: ConflictCategory;
            if (currentState === null) {
              category = 'clean';
              if (includeClean && !maxReached) {
                cleanPositions.push(position);
              }
            } else if (
              currentState.id === proposedState.id &&
              JSON.stringify(currentState.props) === JSON.stringify(proposedState.props)
            ) {
              category = 'same-state';
              hasSameState = true;
              totalSameState++;
              if (!maxReached) {
                sameStatePositions.push(position);
              }
            } else {
              category = 'state-conflict';
              hasStateConflict = true;
              totalStateConflict++;
              if (!maxReached) {
                stateConflictPositions.push(position);
              }
            }

            if (category !== 'clean' || includeClean) {
              if (!maxReached) {
                const entry: ConflictEntry = {
                  position,
                  category,
                  owners: [...record.owners],
                  winningOwner,
                  currentState,
                  proposedState,
                };
                entries.push(entry);
                if (maxEntries !== undefined && entries.length >= maxEntries) {
                  maxReached = true;
                  truncated = true;
                }
              }
            }
          }
        }
      }
    } else {
      // 2. Scene-wide mode: scan indexed records across visible placements for overlaps (owners >= 2)
      const inBounds = (pos: Vec3i): boolean => {
        if (!bounds) return true;
        return (
          pos[0] >= bounds.min[0] &&
          pos[0] < bounds.maxExclusive[0] &&
          pos[1] >= bounds.min[1] &&
          pos[1] < bounds.maxExclusive[1] &&
          pos[2] >= bounds.min[2] &&
          pos[2] < bounds.maxExclusive[2]
        );
      };

      for (const record of this.positions.values()) {
        if (!inBounds(record.position)) continue;

        const pos = [...record.position] as Vec3i;
        const winningOwner = this.resolveWinningOwner(record);
        const currentState = record.states.get(winningOwner ?? '') ?? null;

        if (record.owners.length >= 2) {
          // Overlap: compare states across all owners
          const firstOwner = record.owners[0];
          const firstState = record.states.get(firstOwner)!;
          let allSame = true;
          for (let i = 1; i < record.owners.length; i++) {
            const st = record.states.get(record.owners[i])!;
            if (
              st.id !== firstState.id ||
              JSON.stringify(st.props) !== JSON.stringify(firstState.props)
            ) {
              allSame = false;
              break;
            }
          }

          const category: ConflictCategory = allSame ? 'same-state' : 'state-conflict';
          if (category === 'same-state') {
            hasSameState = true;
            totalSameState++;
            if (!maxReached) {
              sameStatePositions.push(pos);
            }
          } else {
            hasStateConflict = true;
            totalStateConflict++;
            if (!maxReached) {
              stateConflictPositions.push(pos);
            }
          }

          if (!maxReached) {
            entries.push({
              position: pos,
              category,
              owners: [...record.owners],
              winningOwner,
              currentState,
              proposedState: null,
            });
            if (maxEntries !== undefined && entries.length >= maxEntries) {
              maxReached = true;
              truncated = true;
            }
          }
        } else {
          if (includeClean) {
            if (!maxReached) {
              cleanPositions.push(pos);
              entries.push({
                position: pos,
                category: 'clean',
                owners: [...record.owners],
                winningOwner,
                currentState,
                proposedState: null,
              });
              if (maxEntries !== undefined && entries.length >= maxEntries) {
                maxReached = true;
                truncated = true;
              }
            }
          }
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
      hasSameState: hasSameState || sameStatePositions.length > 0,
      hasStateConflict: hasStateConflict || stateConflictPositions.length > 0,
      cleanPositions,
      sameStatePositions,
      stateConflictPositions,
      truncated,
      totalSameState,
      totalStateConflict,
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
  bounds?: Bounds3i,
  proposedState?: BlockStateId,
  overlapPolicy: 'top-wins' | 'bottom-wins' = 'top-wins',
  options?: DetectConflictsOptions,
): ConflictResult {
  // Fast path: scene-wide detection without proposedState when clean positions are not requested.
  // Avoids building large ConflictIndex maps and scales to multi-million block volumes in < 50ms.
  if (!proposedState && options?.includeClean === false) {
    const visiblePlacements: Array<{ placement: PlacementType; aabb: Bounds3i; index: number }> = [];
    for (let idx = 0; idx < project.placements.length; idx++) {
      const p = project.placements[idx]!;
      if (!p.visible) continue;
      const aabb = fastPlacementWorldBounds(p);
      if (!bounds || boundsIntersect(aabb, bounds)) {
        visiblePlacements.push({ placement: p, aabb, index: idx });
      }
    }
    return detectSceneConflictsFast(project, visiblePlacements, bounds, overlapPolicy, options);
  }

  // Collect visible placements (and if bounds is provided, filter to those intersecting bounds)
  const visiblePlacements: Array<{ placement: PlacementType; aabb: Bounds3i }> = [];
  for (const p of project.placements) {
    if (!p.visible) continue;
    const aabb = fastPlacementWorldBounds(p);
    if (!bounds || boundsIntersect(aabb, bounds)) {
      visiblePlacements.push({ placement: p, aabb });
    }
  }

  // If !proposedState: check if any pair of visible placements have intersecting world AABBs
  if (!proposedState) {
    if (visiblePlacements.length < 2) {
      return {
        category: 'clean',
        entries: [],
        hasConflicts: false,
        hasSameState: false,
        hasStateConflict: false,
        cleanPositions: [],
        sameStatePositions: [],
        stateConflictPositions: [],
      };
    }

    const intersectingPlacements = new Set<PlacementType>();
    const intersectionAABBs: Bounds3i[] = [];

    for (let i = 0; i < visiblePlacements.length; i++) {
      for (let j = i + 1; j < visiblePlacements.length; j++) {
        if (boundsIntersect(visiblePlacements[i]!.aabb, visiblePlacements[j]!.aabb)) {
          intersectingPlacements.add(visiblePlacements[i]!.placement);
          intersectingPlacements.add(visiblePlacements[j]!.placement);
          let inter = intersectBounds(visiblePlacements[i]!.aabb, visiblePlacements[j]!.aabb);
          if (bounds) {
            if (boundsIntersect(inter, bounds)) {
              inter = intersectBounds(inter, bounds);
              intersectionAABBs.push(inter);
            }
          } else {
            intersectionAABBs.push(inter);
          }
        }
      }
    }

    if (intersectingPlacements.size === 0 || (bounds && intersectionAABBs.length === 0)) {
      return {
        category: 'clean',
        entries: [],
        hasConflicts: false,
        hasSameState: false,
        hasStateConflict: false,
        cleanPositions: [],
        sameStatePositions: [],
        stateConflictPositions: [],
      };
    }

    const index = new ConflictIndex({ overlapPolicy });
    const filterBounds = options?.includeClean === false ? intersectionAABBs : undefined;
    for (const { placement } of visiblePlacements) {
      if (intersectingPlacements.has(placement)) {
        index.registerPlacement(placement, filterBounds);
      }
    }

    const res = index.detectConflicts(project, bounds, proposedState, options);
    return {
      ...res,
      hasSameState: res.hasSameState ?? res.sameStatePositions.length > 0,
      hasStateConflict: res.hasStateConflict ?? res.stateConflictPositions.length > 0,
    };
  }

  // proposedState is provided: register all visible placements
  const index = new ConflictIndex({ overlapPolicy });
  for (const { placement } of visiblePlacements) {
    index.registerPlacement(placement);
  }

  const res = index.detectConflicts(project, bounds, proposedState, options);
  return {
    ...res,
    hasSameState: res.hasSameState ?? res.sameStatePositions.length > 0,
    hasStateConflict: res.hasStateConflict ?? res.stateConflictPositions.length > 0,
  };
}

// ============================================================================
// Helper functions
// ============================================================================

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

function boundsIntersectsAny(bounds: Bounds3i, list: Bounds3i[]): boolean {
  for (let i = 0; i < list.length; i++) {
    if (boundsIntersect(bounds, list[i]!)) return true;
  }
  return false;
}

function pointInAnyBounds(pos: Vec3i, list: Bounds3i[]): boolean {
  for (let i = 0; i < list.length; i++) {
    const b = list[i]!;
    if (
      pos[0] >= b.min[0] &&
      pos[0] < b.maxExclusive[0] &&
      pos[1] >= b.min[1] &&
      pos[1] < b.maxExclusive[1] &&
      pos[2] >= b.min[2] &&
      pos[2] < b.maxExclusive[2]
    ) {
      return true;
    }
  }
  return false;
}

function chunkWorldBounds(
  placement: PlacementType,
  cx: number,
  cy: number,
  cz: number,
): Bounds3i {
  const minLX = cx * 16;
  const minLY = cy * 16;
  const minLZ = cz * 16;
  const maxLX = minLX + 15;
  const maxLY = minLY + 15;
  const maxLZ = minLZ + 15;

  const corners: Vec3i[] = [
    [minLX, minLY, minLZ],
    [maxLX, minLY, minLZ],
    [minLX, maxLY, minLZ],
    [maxLX, maxLY, minLZ],
    [minLX, minLY, maxLZ],
    [maxLX, minLY, maxLZ],
    [minLX, maxLY, maxLZ],
    [maxLX, maxLY, maxLZ],
  ];

  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

  for (const c of corners) {
    const res = mapCellToWorld(
      placement.transform.translation,
      placement.origin,
      placement.transform.rotationY,
      placement.transform.mirror,
      c,
    );
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
    return { min: [0, 0, 0], maxExclusive: [0, 0, 0] };
  }

  return {
    min: [minX, minY, minZ] as Vec3i,
    maxExclusive: [maxX + 1, maxY + 1, maxZ + 1] as Vec3i,
  };
}

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

function statesEqual(a: BlockStateId, b: BlockStateId): boolean {
  if (a === b) return true;
  if (a.id !== b.id) return false;
  const aProps = a.props;
  const bProps = b.props;
  if (aProps === bProps) return true;
  if (!aProps || !bProps) return false;
  const aKeys = Object.keys(aProps);
  const bKeys = Object.keys(bProps);
  if (aKeys.length !== bKeys.length) return false;
  for (let i = 0; i < aKeys.length; i++) {
    const k = aKeys[i]!;
    if (aProps[k] !== bProps[k]) return false;
  }
  return true;
}

function chunkIntersectsBounds(
  placement: PlacementType,
  cx: number,
  cy: number,
  cz: number,
  targetBounds: Bounds3i,
  isFast: boolean,
  offX: number,
  offY: number,
  offZ: number,
): boolean {
  if (isFast) {
    const cMinX = cx * 16 + offX;
    const cMaxX = cMinX + 16;
    if (cMinX >= targetBounds.maxExclusive[0] || cMaxX <= targetBounds.min[0]) return false;

    const cMinY = cy * 16 + offY;
    const cMaxY = cMinY + 16;
    if (cMinY >= targetBounds.maxExclusive[1] || cMaxY <= targetBounds.min[1]) return false;

    const cMinZ = cz * 16 + offZ;
    const cMaxZ = cMinZ + 16;
    if (cMinZ >= targetBounds.maxExclusive[2] || cMaxZ <= targetBounds.min[2]) return false;

    return true;
  }
  const cb = chunkWorldBounds(placement, cx, cy, cz);
  return boundsIntersect(cb, targetBounds);
}

function detectSceneConflictsFast(
  project: Project,
  visiblePlacements: Array<{ placement: PlacementType; aabb: Bounds3i; index: number }>,
  bounds?: Bounds3i,
  overlapPolicy: 'top-wins' | 'bottom-wins' = 'top-wins',
  options?: DetectConflictsOptions,
): ConflictResult {
  if (visiblePlacements.length < 2) {
    return {
      category: 'clean',
      entries: [],
      hasConflicts: false,
      hasSameState: false,
      hasStateConflict: false,
      cleanPositions: [],
      sameStatePositions: [],
      stateConflictPositions: [],
      truncated: false,
      totalSameState: 0,
      totalStateConflict: 0,
    };
  }

  interface IntersectingPair {
    pA: PlacementType;
    pB: PlacementType;
    idxA: number;
    idxB: number;
    isect: Bounds3i;
  }

  const pairs: IntersectingPair[] = [];
  for (let i = 0; i < visiblePlacements.length; i++) {
    for (let j = i + 1; j < visiblePlacements.length; j++) {
      const vA = visiblePlacements[i]!;
      const vB = visiblePlacements[j]!;
      if (boundsIntersect(vA.aabb, vB.aabb)) {
        let isect = intersectBounds(vA.aabb, vB.aabb);
        if (bounds) {
          if (!boundsIntersect(isect, bounds)) continue;
          isect = intersectBounds(isect, bounds);
        }
        if (
          isect.min[0] >= isect.maxExclusive[0] ||
          isect.min[1] >= isect.maxExclusive[1] ||
          isect.min[2] >= isect.maxExclusive[2]
        ) {
          continue;
        }

        if (vA.placement.volume.chunks.size <= vB.placement.volume.chunks.size) {
          pairs.push({
            pA: vA.placement,
            pB: vB.placement,
            idxA: vA.index,
            idxB: vB.index,
            isect,
          });
        } else {
          pairs.push({
            pA: vB.placement,
            pB: vA.placement,
            idxA: vB.index,
            idxB: vA.index,
            isect,
          });
        }
      }
    }
  }

  if (pairs.length === 0) {
    return {
      category: 'clean',
      entries: [],
      hasConflicts: false,
      hasSameState: false,
      hasStateConflict: false,
      cleanPositions: [],
      sameStatePositions: [],
      stateConflictPositions: [],
      truncated: false,
      totalSameState: 0,
      totalStateConflict: 0,
    };
  }

  const entries: ConflictEntry[] = [];
  const sameStatePositions: Vec3i[] = [];
  const stateConflictPositions: Vec3i[] = [];
  let hasStateConflict = false;
  let hasSameState = false;
  let totalSameState = 0;
  let totalStateConflict = 0;
  let truncated = false;

  const maxEntries = options?.maxEntries;
  const hasMax = typeof maxEntries === 'number' && Number.isFinite(maxEntries) && maxEntries >= 0;
  const needsDeduplication = visiblePlacements.length > 2 || pairs.length > 1;
  const visitedPositions = needsDeduplication ? new Set<string>() : null;
  const topWins = overlapPolicy === 'top-wins';

  outerPairs: for (let pIdx = 0; pIdx < pairs.length; pIdx++) {
    const pair = pairs[pIdx]!;
    const { pA, pB, idxA, idxB, isect } = pair;

    const aFirst = idxA < idxB;
    const firstOwner = aFirst ? pA : pB;
    const secondOwner = aFirst ? pB : pA;
    const owners: [string, string] = [firstOwner.id, secondOwner.id];
    const winningOwnerId = topWins ? secondOwner.id : firstOwner.id;

    const isFastA =
      pA.transform.rotationY === 0 &&
      pA.transform.mirror === 'none' &&
      (pA.origin[0] & 1) === 0 &&
      (pA.origin[1] & 1) === 0 &&
      (pA.origin[2] & 1) === 0;

    const offAX = isFastA ? pA.transform.translation[0] - (pA.origin[0] >> 1) : 0;
    const offAY = isFastA ? pA.transform.translation[1] - (pA.origin[1] >> 1) : 0;
    const offAZ = isFastA ? pA.transform.translation[2] - (pA.origin[2] >> 1) : 0;

    const isFastB =
      pB.transform.rotationY === 0 &&
      pB.transform.mirror === 'none' &&
      (pB.origin[0] & 1) === 0 &&
      (pB.origin[1] & 1) === 0 &&
      (pB.origin[2] & 1) === 0;

    const offBX = isFastB ? pB.transform.translation[0] - (pB.origin[0] >> 1) : 0;
    const offBY = isFastB ? pB.transform.translation[1] - (pB.origin[1] >> 1) : 0;
    const offBZ = isFastB ? pB.transform.translation[2] - (pB.origin[2] >> 1) : 0;

    let cachedChunkB: VoxelChunk | null = null;
    let cachedBcx = NaN;
    let cachedBcy = NaN;
    let cachedBcz = NaN;
    let cachedIsAirB: boolean[] | null = null;

    for (const chunkA of pA.volume.chunks.values()) {
      const parts = chunkA.key.split(/[,_]/);
      if (parts.length !== 3) continue;
      const cx = Number(parts[0]);
      const cy = Number(parts[1]);
      const cz = Number(parts[2]);
      if (Number.isNaN(cx) || Number.isNaN(cy) || Number.isNaN(cz)) continue;

      if (!chunkIntersectsBounds(pA, cx, cy, cz, isect, isFastA, offAX, offAY, offAZ)) {
        continue;
      }

      const isAirA = chunkA.palette.map((s) => isAirLike(s.id, VANILLA_AIR_LIKE));
      let hasNonAirA = false;
      for (let i = 0; i < isAirA.length; i++) {
        if (!isAirA[i]) {
          hasNonAirA = true;
          break;
        }
      }
      if (!hasNonAirA) continue;

      const lx0 = cx * 16;
      const ly0 = cy * 16;
      const lz0 = cz * 16;
      const indicesA = chunkA.indices;

      for (let cyInChunk = 0; cyInChunk < 16; cyInChunk++) {
        const ly = ly0 + cyInChunk;
        let wy = 0;
        if (isFastA) {
          wy = ly + offAY;
          if (wy < isect.min[1] || wy >= isect.maxExclusive[1]) continue;
        }

        for (let czInChunk = 0; czInChunk < 16; czInChunk++) {
          const lz = lz0 + czInChunk;
          let wz = 0;
          if (isFastA) {
            wz = lz + offAZ;
            if (wz < isect.min[2] || wz >= isect.maxExclusive[2]) continue;
          }

          const rowOffset = (cyInChunk * 16 + czInChunk) * 16;
          for (let cxInChunk = 0; cxInChunk < 16; cxInChunk++) {
            const pIdxA = indicesA[rowOffset + cxInChunk]!;
            if (isAirA[pIdxA]) continue;

            const lx = lx0 + cxInChunk;
            let wx = 0;
            if (isFastA) {
              wx = lx + offAX;
              if (wx < isect.min[0] || wx >= isect.maxExclusive[0]) continue;
            } else {
              let wb: Vec3i;
              try {
                wb = localBlockToWorld(pA, [lx, ly, lz]);
              } catch {
                continue;
              }
              wx = wb[0];
              wy = wb[1];
              wz = wb[2];
              if (
                wx < isect.min[0] || wx >= isect.maxExclusive[0] ||
                wy < isect.min[1] || wy >= isect.maxExclusive[1] ||
                wz < isect.min[2] || wz >= isect.maxExclusive[2]
              ) {
                continue;
              }
            }

            let lbx = 0;
            let lby = 0;
            let lbz = 0;

            if (isFastB) {
              lbx = wx - offBX;
              lby = wy - offBY;
              lbz = wz - offBZ;
            } else {
              const localB = worldToLocalBlock(pB, [wx, wy, wz]);
              if (!localB) continue;
              lbx = localB[0];
              lby = localB[1];
              lbz = localB[2];
            }

            const bcx = lbx >> 4;
            const bcy = lby >> 4;
            const bcz = lbz >> 4;

            if (bcx !== cachedBcx || bcy !== cachedBcy || bcz !== cachedBcz) {
              cachedBcx = bcx;
              cachedBcy = bcy;
              cachedBcz = bcz;
              const keyU = `${bcx}_${bcy}_${bcz}`;
              cachedChunkB = pB.volume.chunks.get(keyU) ?? pB.volume.chunks.get(`${bcx},${bcy},${bcz}`) ?? null;
              cachedIsAirB = cachedChunkB ? cachedChunkB.palette.map((s) => isAirLike(s.id, VANILLA_AIR_LIKE)) : null;
            }

            if (!cachedChunkB || !cachedIsAirB) continue;

            const inChunkIdxB = ((lby & 15) << 8) | ((lbz & 15) << 4) | (lbx & 15);
            const pIdxB = cachedChunkB.indices[inChunkIdxB]!;
            if (cachedIsAirB[pIdxB]) continue;

            if (visitedPositions) {
              const key = `${wx},${wy},${wz}`;
              if (visitedPositions.has(key)) continue;
              visitedPositions.add(key);
            }

            const stateA = chunkA.palette[pIdxA]!;
            const stateB = cachedChunkB.palette[pIdxB]!;

            const same = statesEqual(stateA, stateB);
            const category: ConflictCategory = same ? 'same-state' : 'state-conflict';
            const worldPos: Vec3i = [wx, wy, wz];

            if (same) {
              hasSameState = true;
              totalSameState++;
              sameStatePositions.push(worldPos);
            } else {
              hasStateConflict = true;
              totalStateConflict++;
              stateConflictPositions.push(worldPos);
            }

            const currentState = topWins
              ? (aFirst ? stateB : stateA)
              : (aFirst ? stateA : stateB);

            entries.push({
              position: worldPos,
              category,
              owners: [owners[0], owners[1]],
              winningOwner: winningOwnerId,
              currentState,
              proposedState: null,
            });

            if (hasMax && entries.length >= maxEntries!) {
              truncated = true;
              break outerPairs;
            }
          }
        }
      }
    }
  }

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
    hasSameState: hasSameState || sameStatePositions.length > 0,
    hasStateConflict: hasStateConflict || stateConflictPositions.length > 0,
    cleanPositions: [],
    sameStatePositions,
    stateConflictPositions,
    truncated,
    totalSameState,
    totalStateConflict,
  };
}
