// packages/operations/src/clipboard.ts
// Clipboard operations: copy, cut, paste with paste refinements (SUBSPEC-D §2.4, §4.4-4.6).
// Pure TypeScript, imports only from @easyschemedit/domain and @easyschemedit/operations via relative paths.

import type {
  Bounds3i,
  BlockStateId,
  Vec3i,
  Vec3Half,
} from '../../domain/types.ts';
import type { Project, Placement as PlacementType } from '../../domain/placement.ts';
import {
  localBlockToWorld,
  placementWorldBounds,
  worldPointToLocal,
  applyRotation,
  applyMirror,
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

// ============================================================================
// Clipboard types
// ============================================================================

export interface ClipboardBlockData {
  localPos: Vec3i;
  state: BlockStateId;
}

export interface ClipboardData {
  blocks: ClipboardBlockData[];
  blockEntities: Map<string, unknown>;
  entities: unknown[];
  biomes: unknown;
  anchor: Vec3i;       // minimum corner of copied selection
  bounds: Bounds3i;    // copied region bounds
}

export interface ClipboardEntry {
  id: string;
  data: ClipboardData;
  createdAt: number;
  sourceProjectId: string;
  scope: 'effective-composite' | 'source-placement';
}

export interface CutOptions {
  includeHidden?: boolean;
  removeBlockEntities?: boolean;
  removeEntities?: boolean;
}

export interface PasteOptions {
  targetPosition: Vec3i;
  intoPlacementId?: string;
  overrideAir?: boolean;
  pasteAtOriginalPosition?: boolean;
  skipAir?: boolean;
  previewOnly?: boolean;
  rotationY?: 0 | 90 | 180 | 270;
  mirror?: 'none' | 'x' | 'z';
}

export interface PasteResult {
  success: boolean;
  placementId?: string;
  changedCells: number;
  affectedBounds: Bounds3i;
  warnings: string[];
  previewOnly: boolean;
}

// ============================================================================
// Clipboard manager
// ============================================================================

let clipboardCounter = 0;

export class ClipboardManager {
  private clipboard: Map<string, ClipboardEntry> = new Map();

  // Copy blocks from selection to clipboard.
  // Scope: effective-composite (winning block per position) or source-placement.
  copy(
    project: Project,
    selection: { kind: 'cuboid'; bounds: Bounds3i } | { kind: 'placement'; placementIds: string[] },
    scope: 'effective-composite' | 'source-placement' = 'effective-composite',
  ): ClipboardEntry {
    const id = `clipboard-${++clipboardCounter}`;
    const now = Date.now();

    let blocks: ClipboardBlockData[] = [];
    let anchor: Vec3i = [0, 0, 0];
    let bounds: Bounds3i = { min: [0, 0, 0], maxExclusive: [0, 0, 0] };
    let sourceProjectId = project.id;

    if (selection.kind === 'cuboid') {
      bounds = { ...selection.bounds };
      anchor = [bounds.min[0], bounds.min[1], bounds.min[2]];

      // Collect blocks from all placements intersecting the bounds
      const blockMap = new Map<string, ClipboardBlockData>(); // keyed by world position

      for (const placement of project.placements) {
        if (placement.locked) continue;
        if (!placement.visible) continue;

        const pb = placementWorldBounds(placement);
        if (!boundsIntersect(bounds, pb)) continue;

        // Iterate over the intersection
        const clamped: Bounds3i = {
          min: [
            Math.max(bounds.min[0], pb.min[0]),
            Math.max(bounds.min[1], pb.min[1]),
            Math.max(bounds.min[2], pb.min[2]),
          ] as Vec3i,
          maxExclusive: [
            Math.min(bounds.maxExclusive[0], pb.maxExclusive[0]),
            Math.min(bounds.maxExclusive[1], pb.maxExclusive[1]),
            Math.min(bounds.maxExclusive[2], pb.maxExclusive[2]),
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

              if (scope === 'effective-composite') {
                // Effective composite: later placements (higher in array) win
                blockMap.set(key, { localPos: worldBlock, state });
              } else if (scope === 'source-placement') {
                // Source-placement: only from this placement
                blockMap.set(key, { localPos: worldBlock, state });
                break; // Only use first placement for source-placement scope
              }
            }
          }
        }
      }

      blocks = Array.from(blockMap.values());
    }

    const entry: ClipboardEntry = {
      id,
      data: {
        blocks,
        blockEntities: new Map(),
        entities: [],
        biomes: undefined,
        anchor,
        bounds,
      },
      createdAt: now,
      sourceProjectId,
      scope,
    };

    this.clipboard.set(id, entry);
    return entry;
  }

  // Cut: copy then remove source blocks from placements.
  cut(
    project: Project,
    selection: { kind: 'cuboid'; bounds: Bounds3i },
    options: CutOptions = {},
  ): { entry: ClipboardEntry; modifiedProject: Project } {
    const entry = this.copy(project, selection, 'effective-composite');

    // Remove copied blocks from source placements
    let modifiedProject = project;
    const bounds = selection.bounds;

    for (const placement of project.placements) {
      if (placement.locked) continue;
      if (!placement.visible && !(options.includeHidden ?? false)) continue;

      const pb = placementWorldBounds(placement);
      if (!boundsIntersect(bounds, pb)) continue;

      const clamped: Bounds3i = {
        min: [
          Math.max(bounds.min[0], pb.min[0]),
          Math.max(bounds.min[1], pb.min[1]),
          Math.max(bounds.min[2], pb.min[2]),
        ] as Vec3i,
        maxExclusive: [
          Math.min(bounds.maxExclusive[0], pb.maxExclusive[0]),
          Math.min(bounds.maxExclusive[1], pb.maxExclusive[1]),
          Math.min(bounds.maxExclusive[2], pb.maxExclusive[2]),
        ] as Vec3i,
      };

      // Set all blocks in clamped bounds to air
      for (let y = clamped.min[1]; y < clamped.maxExclusive[1]; y++) {
        for (let z = clamped.min[2]; z < clamped.maxExclusive[2]; z++) {
          for (let x = clamped.min[0]; x < clamped.maxExclusive[0]; x++) {
            const worldBlock: Vec3i = [x, y, z];
            const localBlock = worldToLocalBlock(placement, worldBlock);
            if (!localBlock) continue;

            setBlock(placement.volume, localBlock, CANONICAL_AIR);
          }
        }
      }

      // Remove block entities in bounds if requested
      if (options.removeBlockEntities !== false) {
        for (const [key] of placement.ancillary.blockEntities) {
          const [ex, ey, ez] = key.split(',').map(Number) as [number, number, number];
          if (ex >= clamped.min[0] && ex < clamped.maxExclusive[0] &&
              ey >= clamped.min[1] && ey < clamped.maxExclusive[1] &&
              ez >= clamped.min[2] && ez < clamped.maxExclusive[2]) {
            placement.ancillary.blockEntities.delete(key);
          }
        }
      }
    }

    return { entry, modifiedProject };
  }

  // Paste clipboard content into project.
  paste(
    project: Project,
    entry: ClipboardEntry,
    options: PasteOptions,
  ): PasteResult {
    const warnings: string[] = [];
    const {
      targetPosition,
      intoPlacementId,
      overrideAir = false,
      pasteAtOriginalPosition = false,
      skipAir = false,
      previewOnly = false,
      rotationY = 0,
      mirror = 'none',
    } = options;

    // Determine target position
    let finalTargetPosition: Vec3i = [...targetPosition] as Vec3i;
    if (pasteAtOriginalPosition) {
      // Paste at original copy location — anchor maps to entry.data.bounds.min
      finalTargetPosition = [...entry.data.bounds.min] as Vec3i;
    }

    // Determine target placement
    let targetPlacement: PlacementType | null = null;
    if (intoPlacementId) {
      targetPlacement = project.placements.find((p) => p.id === intoPlacementId) ?? null;
      if (!targetPlacement) {
        return {
          success: false,
          changedCells: 0,
          affectedBounds: entry.data.bounds,
          warnings: [`Placement ${intoPlacementId} not found`],
          previewOnly,
        };
      }
    }

    // Apply rotation and mirror to clipboard blocks
    const transformedBlocks = entry.data.blocks.map((bd) => {
      // Transform local position relative to anchor
      const relX = bd.localPos[0] - entry.data.anchor[0];
      const relY = bd.localPos[1] - entry.data.anchor[1];
      const relZ = bd.localPos[2] - entry.data.anchor[2];

      // Apply mirror first, then rotation (matching transform order)
      const [mx, my, mz] = applyMirror(relX, relY, relZ, mirror);
      const [rx, ry, rz] = applyRotation(mx, my, mz, rotationY);

      // World position = target + transformed relative position
      const worldPos: Vec3i = [
        finalTargetPosition[0] + rx,
        finalTargetPosition[1] + ry,
        finalTargetPosition[2] + rz,
      ];

      return { worldPos, state: bd.state };
    });

    // Compute affected bounds
    const affectedMin: number[] = [...finalTargetPosition];
    const affectedMax: number[] = [...finalTargetPosition];
    for (const tb of transformedBlocks) {
      if (tb.worldPos[0] < affectedMin[0]) affectedMin[0] = tb.worldPos[0];
      if (tb.worldPos[1] < affectedMin[1]) affectedMin[1] = tb.worldPos[1];
      if (tb.worldPos[2] < affectedMin[2]) affectedMin[2] = tb.worldPos[2];
      if (tb.worldPos[0] + 1 > affectedMax[0]) affectedMax[0] = tb.worldPos[0] + 1;
      if (tb.worldPos[1] + 1 > affectedMax[1]) affectedMax[1] = tb.worldPos[1] + 1;
      if (tb.worldPos[2] + 1 > affectedMax[2]) affectedMax[2] = tb.worldPos[2] + 1;
    }

    const affectedBounds: Bounds3i = {
      min: affectedMin as unknown as Vec3i,
      maxExclusive: affectedMax as unknown as Vec3i,
    };

    if (previewOnly) {
      return {
        success: true,
        placementId: targetPlacement?.id,
        changedCells: transformedBlocks.length,
        affectedBounds,
        warnings,
        previewOnly: true,
      };
    }

    // Apply blocks to target placement
    let changedCells = 0;
    const targetPlacements = targetPlacement ? [targetPlacement] : project.placements.filter((p) => !p.locked && p.visible);

    for (const placement of targetPlacements) {
      if (placement.locked) {
        warnings.push(`Skipped locked placement ${placement.id}`);
        continue;
      }

      const pb = placementWorldBounds(placement);
      if (!boundsIntersect(affectedBounds, pb)) continue;

      for (const tb of transformedBlocks) {
        // Check if this block is within the placement's world bounds
        if (tb.worldPos[0] < pb.min[0] || tb.worldPos[0] >= pb.maxExclusive[0] ||
            tb.worldPos[1] < pb.min[1] || tb.worldPos[1] >= pb.maxExclusive[1] ||
            tb.worldPos[2] < pb.min[2] || tb.worldPos[2] >= pb.maxExclusive[2]) {
          continue;
        }

        const localBlock = worldToLocalBlock(placement, tb.worldPos);
        if (!localBlock) continue;

        // Handle skipAir
        if (skipAir && isAirLike(tb.state.id, VANILLA_AIR_LIKE)) {
          continue;
        }

        const currentState = getBlock(placement.volume, localBlock);

        // Handle overrideAir / erase tombstones
        if (!overrideAir && isAirLike(tb.state.id, VANILLA_AIR_LIKE)) {
          // Air is non-owning, don't write
          continue;
        }

        if (overrideAir && isAirLike(tb.state.id, VANILLA_AIR_LIKE)) {
          // Air erases: record erase tombstone
          placement.eraseTombstones.add(`${tb.worldPos[0]},${tb.worldPos[1]},${tb.worldPos[2]}`);
        }

        setBlock(placement.volume, localBlock, tb.state);
        changedCells++;
      }
    }

    return {
      success: true,
      placementId: targetPlacement?.id,
      changedCells,
      affectedBounds,
      warnings,
      previewOnly: false,
    };
  }

  // Serialize clipboard entry to Uint8Array for MCP transfer.
  serialize(entry: ClipboardEntry): Uint8Array {
    const encoder = new TextEncoder();
    const json = JSON.stringify(entry);
    return encoder.encode(json);
  }

  // Deserialize Uint8Array back to clipboard entry.
  deserialize(data: Uint8Array): ClipboardEntry {
    const decoder = new TextDecoder();
    const json = decoder.decode(data);
    return JSON.parse(json) as ClipboardEntry;
  }

  // Get clipboard entry by ID.
  getEntry(id: string): ClipboardEntry | undefined {
    return this.clipboard.get(id);
  }

  // List all clipboard entries.
  listEntries(): ClipboardEntry[] {
    return Array.from(this.clipboard.values());
  }

  // Remove clipboard entry.
  removeEntry(id: string): boolean {
    return this.clipboard.delete(id);
  }

  // Clear all clipboard entries.
  clear(): void {
    this.clipboard.clear();
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
