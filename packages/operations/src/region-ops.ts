// packages/operations/src/region-ops.ts
// Region operations core: fill, replace, delete, hollow, walls (SUBSPEC-D §2.4, §4.2).
// Pure TypeScript, imports only from @easyschemedit/domain via relative paths.

import type {
  Bounds3i,
  BlockStateId,
  Vec3i,
  Vec3Half,
} from '../../domain/types.ts';
import type { Project, Placement } from '../../domain/placement.ts';
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

export type BlockStateMatcher = {
  mode: 'exact' | 'block-id-only' | 'block-id-and-properties';
  blockId?: string;
  properties?: Record<string, string>;
};

export type FillOperation = {
  kind: 'fill';
  state: BlockStateId;
};

export type ReplaceOperation = {
  kind: 'replace';
  matcher: BlockStateMatcher;
  replacement: BlockStateId;
  preserveProperties: boolean;
};

export type DeleteOperation = {
  kind: 'delete';
  removeBlockEntities?: boolean;
  removeEntities?: boolean;
};

export type HollowOperation = {
  kind: 'hollow';
  shellThickness?: number;
};

export type WallsOperation = {
  kind: 'walls';
  includeTop: boolean;
  includeBottom: boolean;
  wallBlock: BlockStateId;
  fillInterior: BlockStateId | null;
};

export type RegionOperation =
  | FillOperation
  | ReplaceOperation
  | DeleteOperation
  | HollowOperation
  | WallsOperation;

export interface RegionOperationOptions {
  includeHidden?: boolean;    // default false
  overrideAir?: boolean;      // default false (for new result placement mode)
}

export interface PerPlacementChange {
  placementId: string;
  changedCells: number;
  nonAirCount: number;
}

export interface RegionOperationResult {
  candidateCells: number;
  changedCells: number;
  resultingNonAirCount: number;
  runtimeEstimateMs: number;
  memoryEstimateBytes: number;
  warnings: string[];
  blockedByLock: boolean;
  perPlacementChanges: PerPlacementChange[];
}

// ============================================================================
// Block state matching
// ============================================================================

function matchesBlockState(
  state: BlockStateId,
  matcher: BlockStateMatcher,
): boolean {
  switch (matcher.mode) {
    case 'exact':
      return state.id === matcher.blockId &&
        matchProperties(state.props, matcher.properties ?? {});
    case 'block-id-only':
      return state.id === matcher.blockId;
    case 'block-id-and-properties':
      if (state.id !== matcher.blockId) return false;
      return matchProperties(state.props, matcher.properties ?? {});
    default:
      return false;
  }
}

function matchProperties(
  actual: Readonly<Record<string, string>>,
  expected: Record<string, string>,
): boolean {
  const actualKeys = Object.keys(actual);
  const expectedKeys = Object.keys(expected);
  if (actualKeys.length !== expectedKeys.length) return false;
  for (const k of expectedKeys) {
    if (actual[k] !== expected[k]) return false;
  }
  return true;
}

function mergeProperties(
  original: Readonly<Record<string, string>>,
  replacementProps: Readonly<Record<string, string>>,
  preserveProperties: boolean,
): Record<string, string> {
  if (!preserveProperties) {
    return { ...replacementProps };
  }
  // Keep compatible properties from original, override with replacement's
  const merged: Record<string, string> = { ...original };
  for (const [k, v] of Object.entries(replacementProps)) {
    merged[k] = v;
  }
  return merged;
}

// ============================================================================
// World bounds intersection helper
// ============================================================================

function boundsIntersect(a: Bounds3i, b: Bounds3i): boolean {
  return (
    a.min[0] < b.maxExclusive[0] && a.maxExclusive[0] > b.min[0] &&
    a.min[1] < b.maxExclusive[1] && a.maxExclusive[1] > b.min[1] &&
    a.min[2] < b.maxExclusive[2] && a.maxExclusive[2] > b.min[2]
  );
}

function boundsClampToPlacement(
  target: Bounds3i,
  placement: Placement,
): Bounds3i | null {
  const worldBounds = placementWorldBounds(placement);
  if (!boundsIntersect(target, worldBounds)) return null;

  const clamped: Bounds3i = {
    min: [
      Math.max(target.min[0], worldBounds.min[0]),
      Math.max(target.min[1], worldBounds.min[1]),
      Math.max(target.min[2], worldBounds.min[2]),
    ] as Vec3i,
    maxExclusive: [
      Math.min(target.maxExclusive[0], worldBounds.maxExclusive[0]),
      Math.min(target.maxExclusive[1], worldBounds.maxExclusive[1]),
      Math.min(target.maxExclusive[2], worldBounds.maxExclusive[2]),
    ] as Vec3i,
  };
  return clamped;
}

// ============================================================================
// World-to-local mapping for a placement
// ============================================================================

// Map a world block coordinate to a local block coordinate for the placement.
// Returns null if the world block is not part of this placement's volume.
function worldToLocalBlock(
  placement: Placement,
  worldBlock: Vec3i,
): Vec3i | null {
  const local = worldPointToLocal(
    placement,
    [worldBlock[0] + 0.5, worldBlock[1] + 0.5, worldBlock[2] + 0.5],
  );
  const [lx, ly, lz] = [Math.floor(local[0]), Math.floor(local[1]), Math.floor(local[2])];

  // Verify this local block maps back to the same world block (round-trip check)
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
// Ancillary data helpers
// ============================================================================

function removeBlockEntitiesForBounds(
  placement: Placement,
  bounds: Bounds3i,
): { removedCount: number; warnings: string[] } {
  const { blockEntities } = placement.ancillary;
  const removed: string[] = [];
  const warnings: string[] = [];

  for (const [key, entity] of blockEntities) {
    const [ex, ey, ez] = key.split(',').map(Number) as [number, number, number];
    if (ex >= bounds.min[0] && ex < bounds.maxExclusive[0] &&
        ey >= bounds.min[1] && ey < bounds.maxExclusive[1] &&
        ez >= bounds.min[2] && ez < bounds.maxExclusive[2]) {
      removed.push(key);
      warnings.push(`Removed block entity at ${key} during region operation`);
    }
  }

  for (const key of removed) {
    blockEntities.delete(key);
  }

  return { removedCount: removed.length, warnings };
}

// ============================================================================
// Region operation engine
// ============================================================================

export class RegionOperationEngine {
  private readonly includeHidden: boolean;
  private readonly overrideAir: boolean;

  constructor(options: RegionOperationOptions = {}) {
    this.includeHidden = options.includeHidden ?? false;
    this.overrideAir = options.overrideAir ?? false;
  }

  // Apply a region operation to all editable placements intersecting the target bounds.
  // Source placements mode (default per SUBSPEC-D §4.2).
  apply(
    project: Project,
    operation: RegionOperation,
    targetBounds: Bounds3i,
  ): RegionOperationResult {
    const startTime = Date.now();
    const warnings: string[] = [];
    const perPlacementChanges: PerPlacementChange[] = [];
    let blockedByLock = false;
    let totalChangedCells = 0;
    let totalCandidateCells = 0;

    // Determine which placements are editable targets
    const editablePlacements = project.placements.filter((p) => {
      if (p.locked) {
        blockedByLock = true;
        return false;
      }
      if (!p.visible && !this.includeHidden) return false;
      const pb = placementWorldBounds(p);
      return boundsIntersect(targetBounds, pb);
    });

    for (const placement of editablePlacements) {
      const clamped = boundsClampToPlacement(targetBounds, placement);
      if (!clamped) continue;

      const result = this.applyToPlacement(placement, operation, clamped, warnings);
      totalChangedCells += result.changedCells;
      totalCandidateCells += result.candidateCells;

      perPlacementChanges.push({
        placementId: placement.id,
        changedCells: result.changedCells,
        nonAirCount: placement.volume.nonAirCount,
      });
    }

    // Compute resulting non-air count across all placements
    let resultingNonAirCount = 0;
    for (const p of project.placements) {
      resultingNonAirCount += p.volume.nonAirCount;
    }

    const runtimeEstimateMs = Math.max(1, totalCandidateCells * 0.05);
    const memoryEstimateBytes = totalCandidateCells * 24;

    return {
      candidateCells: totalCandidateCells,
      changedCells: totalChangedCells,
      resultingNonAirCount,
      runtimeEstimateMs,
      memoryEstimateBytes,
      warnings,
      blockedByLock,
      perPlacementChanges,
    };
  }

  private applyToPlacement(
    placement: Placement,
    operation: RegionOperation,
    bounds: Bounds3i,
    warnings: string[],
  ): { changedCells: number; candidateCells: number } {
    let changedCells = 0;
    let candidateCells = 0;

    // Handle ancillary data for delete/hollow operations
    if (operation.kind === 'delete' && operation.removeBlockEntities !== false) {
      const ancResult = removeBlockEntitiesForBounds(placement, bounds);
      warnings.push(...ancResult.warnings);
    }

    // Iterate over all cells in the clamped bounds
    for (let y = bounds.min[1]; y < bounds.maxExclusive[1]; y++) {
      for (let z = bounds.min[2]; z < bounds.maxExclusive[2]; z++) {
        for (let x = bounds.min[0]; x < bounds.maxExclusive[0]; x++) {
          const worldBlock: Vec3i = [x, y, z];
          const localBlock = worldToLocalBlock(placement, worldBlock);
          if (!localBlock) continue;

          candidateCells++;

          const currentState = getBlock(placement.volume, localBlock);
          let newState: BlockStateId | null = null;
          let shouldWrite = false;

          switch (operation.kind) {
            case 'fill':
              newState = operation.state;
              shouldWrite = true;
              break;

            case 'replace':
              if (matchesBlockState(currentState, operation.matcher)) {
                const mergedProps = mergeProperties(
                  currentState.props,
                  operation.replacement.props,
                  operation.preserveProperties,
                );
                newState = {
                  id: operation.replacement.id,
                  props: mergedProps,
                };
                shouldWrite = true;
              }
              break;

            case 'delete':
              newState = CANONICAL_AIR;
              shouldWrite = true;
              break;

            case 'hollow': {
              const thickness = operation.shellThickness ?? 1;
              const relX = x - bounds.min[0];
              const relY = y - bounds.min[1];
              const relZ = z - bounds.min[2];
              const sx = bounds.maxExclusive[0] - bounds.min[0];
              const sy = bounds.maxExclusive[1] - bounds.min[1];
              const sz = bounds.maxExclusive[2] - bounds.min[2];
              const isShell =
                relX < thickness || relX >= sx - thickness ||
                relY < thickness || relY >= sy - thickness ||
                relZ < thickness || relZ >= sz - thickness;

              if (!isShell) {
                // Interior → air
                newState = CANONICAL_AIR;
                shouldWrite = true;
              } else {
                // Shell → keep current state
                shouldWrite = false;
              }
              break;
            }

            case 'walls': {
              const relX = x - bounds.min[0];
              const relY = y - bounds.min[1];
              const relZ = z - bounds.min[2];
              const sx = bounds.maxExclusive[0] - bounds.min[0];
              const sy = bounds.maxExclusive[1] - bounds.min[1];
              const sz = bounds.maxExclusive[2] - bounds.min[2];
              const isTop = relY === sy - 1;
              const isBottom = relY === 0;
              const isWallX = relX === 0 || relX === sx - 1;
              const isWallZ = relZ === 0 || relZ === sz - 1;
              const isBoundary = isTop || isBottom || isWallX || isWallZ;

              if (isBoundary) {
                if (isTop && !operation.includeTop) {
                  shouldWrite = false;
                } else if (isBottom && !operation.includeBottom) {
                  shouldWrite = false;
                } else {
                  newState = operation.wallBlock;
                  shouldWrite = true;
                }
              } else {
                // Interior
                if (operation.fillInterior !== null) {
                  newState = operation.fillInterior;
                  shouldWrite = true;
                }
                // null = air (delete)
                else {
                  newState = CANONICAL_AIR;
                  shouldWrite = true;
                }
              }
              break;
            }
          }

          if (shouldWrite && newState) {
            // Check if state actually changed
            const currentIsAir = isAirLike(currentState.id, VANILLA_AIR_LIKE);
            const newIsAir = isAirLike(newState.id, VANILLA_AIR_LIKE);
            const stateChanged =
              currentState.id !== newState.id ||
              JSON.stringify(currentState.props) !== JSON.stringify(newState.props);

            if (stateChanged || currentIsAir !== newIsAir) {
              setBlock(placement.volume, localBlock, newState);
              changedCells++;
            }
          }
        }
      }
    }

    return { changedCells, candidateCells };
  }
}

// ============================================================================
// Convenience functions
// ============================================================================

export function applyRegionOperation(
  project: Project,
  operation: RegionOperation,
  bounds: Bounds3i,
  options?: RegionOperationOptions,
): RegionOperationResult {
  const engine = new RegionOperationEngine(options);
  return engine.apply(project, operation, bounds);
}
