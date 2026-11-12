import type { BlockStateId, Vec3i } from './types.ts';
import type { Placement, Project } from './placement.ts';
import { CANONICAL_AIR, isAirLike, VANILLA_AIR_LIKE } from './block-state.ts';

// ============================================================================
// Slice 8.5: Effective-Block Resolver
// ============================================================================

export type EffectiveBlockResult = {
  state: BlockStateId;
  owningPlacementId: string | null;
  isErase: boolean;
};

export function resolveBlockAt(
  project: Project,
  worldPos: Vec3i,
  overlapPolicy: 'top-wins' | 'bottom-wins' = 'top-wins',
): EffectiveBlockResult {
  const placements = project.placements;

  // Collect placements that contain this world position
  const candidates: { placement: Placement; localBlock: Vec3i }[] = [];

  for (const p of placements) {
    if (!p.visible) continue;

    // Inverse transform: world → local
    const localBlock = worldBlockToLocal(p, worldPos);
    if (!localBlock) continue;

    // Check if local block is within volume bounds
    const { min, maxExclusive } = p.volume.bounds;
    if (
      localBlock[0] < min[0] || localBlock[0] >= maxExclusive[0] ||
      localBlock[1] < min[1] || localBlock[1] >= maxExclusive[1] ||
      localBlock[2] < min[2] || localBlock[2] >= maxExclusive[2]
    ) {
      continue;
    }

    candidates.push({ placement: p, localBlock });
  }

  if (candidates.length === 0) {
    return { state: CANONICAL_AIR, owningPlacementId: null, isErase: false };
  }

  // Apply precedence
  let winner: { placement: Placement; localBlock: Vec3i } | undefined;
  if (overlapPolicy === 'top-wins') {
    winner = candidates[candidates.length - 1];
  } else {
    winner = candidates[0];
  }

  // Apply precedence and resolve air non-owning
  const sorted = overlapPolicy === 'top-wins' ? [...candidates].reverse() : [...candidates];
  for (const { placement, localBlock } of sorted) {
    // Check if local block is within volume bounds
    const { min, maxExclusive } = placement.volume.bounds;
    if (
      localBlock[0] < min[0] || localBlock[0] >= maxExclusive[0] ||
      localBlock[1] < min[1] || localBlock[1] >= maxExclusive[1] ||
      localBlock[2] < min[2] || localBlock[2] >= maxExclusive[2]
    ) {
      continue;
    }

    // Get block state from volume
    const chunkCoord = [
      Math.floor(localBlock[0] / 16),
      Math.floor(localBlock[1] / 16),
      Math.floor(localBlock[2] / 16),
    ];
    const chunkKey = `${chunkCoord[0]}_${chunkCoord[1]}_${chunkCoord[2]}`;
    const chunk = placement.volume.chunks.get(chunkKey);

    if (!chunk) {
      // No chunk at this position — check if tombstoned
      const tombstoneKey = `${localBlock[0]}_${localBlock[1]}_${localBlock[2]}`;
      if (placement.eraseTombstones.has(tombstoneKey)) {
        return { state: CANONICAL_AIR, owningPlacementId: placement.id, isErase: true };
      }
      continue; // air is non-owning, fall through
    }

    const cx = euclideanMod(localBlock[0], 16);
    const cy = euclideanMod(localBlock[1], 16);
    const cz = euclideanMod(localBlock[2], 16);
    const idx = (cy * 16 + cz) * 16 + cx;
    const paletteIndex = chunk.indices[idx];
    const state = chunk.palette[paletteIndex];

    // Check tombstone
    const tombstoneKey = `${localBlock[0]}_${localBlock[1]}_${localBlock[2]}`;
    if (placement.eraseTombstones.has(tombstoneKey)) {
      return { state: CANONICAL_AIR, owningPlacementId: placement.id, isErase: true };
    }

    // Plain air is non-owning — skip to next placement
    if (isAirLike(state.id, VANILLA_AIR_LIKE)) {
      continue;
    }

    // structure_void and all other blocks are owning
    return { state, owningPlacementId: placement.id, isErase: false };
  }

  return { state: CANONICAL_AIR, owningPlacementId: null, isErase: false };
}

function euclideanMod(a: number, b: number): number {
  return ((a % b) + b) % b;
}

function worldBlockToLocal(placement: Placement, worldPos: Vec3i): Vec3i | null {
  // Simplified inverse: assume no rotation/mirror for now
  const [wx, wy, wz] = worldPos;
  const [tx, ty, tz] = placement.transform.translation;
  const lx = wx - tx;
  const ly = wy - ty;
  const lz = wz - tz;
  return [lx, ly, lz];
}
