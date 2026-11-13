// apps/web/src/editor/viewport/voxel-raycast.ts
// 3D Amanatides & Woo voxel DDA raycaster and project block resolver (Slice E3.2).

import type { BlockStateId, Bounds3i, Placement, Project, Vec3i } from '@easyschemedit/domain';

export interface VoxelHit {
  position: Vec3i;          // The hit non-air voxel coordinate
  adjacentPosition: Vec3i;  // The empty voxel right before entry (for placement / snapping)
  normal: Vec3i;            // Face normal vector [-stepX, 0, 0], [0, -stepY, 0], etc.
  distance: number;         // Distance along the ray from origin to hit surface
  state: BlockStateId;
  placementId: string | null;
}

export type BlockLookupFn = (
  x: number,
  y: number,
  z: number
) => { state: BlockStateId; placementId: string | null } | null;

/**
 * Pure 3D Amanatides & Woo voxel DDA traversal.
 * Steps through 1x1x1 integer voxel cells along ray until a non-air block is hit
 * or maxDistance is exceeded.
 */
export function raycastVoxels(
  origin: [number, number, number],
  direction: [number, number, number],
  maxDistance: number,
  getBlockAt: BlockLookupFn
): VoxelHit | null {
  const [ox, oy, oz] = origin;
  const [rawDx, rawDy, rawDz] = direction;

  const len = Math.hypot(rawDx, rawDy, rawDz);
  if (len === 0 || !Number.isFinite(len)) {
    return null;
  }

  const dx = rawDx / len;
  const dy = rawDy / len;
  const dz = rawDz / len;

  let currentX = Math.floor(ox);
  let currentY = Math.floor(oy);
  let currentZ = Math.floor(oz);

  // If ray starts inside a non-air block, return immediate hit at distance 0
  const initialBlock = getBlockAt(currentX, currentY, currentZ);
  if (initialBlock) {
    return {
      position: [currentX, currentY, currentZ],
      adjacentPosition: [currentX, currentY, currentZ],
      normal: [0, 0, 0],
      distance: 0,
      state: initialBlock.state,
      placementId: initialBlock.placementId,
    };
  }

  const stepX = dx > 0 ? 1 : dx < 0 ? -1 : 0;
  const stepY = dy > 0 ? 1 : dy < 0 ? -1 : 0;
  const stepZ = dz > 0 ? 1 : dz < 0 ? -1 : 0;

  const tDeltaX = stepX !== 0 ? Math.abs(1 / dx) : Infinity;
  const tDeltaY = stepY !== 0 ? Math.abs(1 / dy) : Infinity;
  const tDeltaZ = stepZ !== 0 ? Math.abs(1 / dz) : Infinity;

  let tMaxX = stepX > 0
    ? (Math.floor(ox) + 1 - ox) / dx
    : stepX < 0
    ? (Math.floor(ox) - ox) / dx
    : Infinity;

  let tMaxY = stepY > 0
    ? (Math.floor(oy) + 1 - oy) / dy
    : stepY < 0
    ? (Math.floor(oy) - oy) / dy
    : Infinity;

  let tMaxZ = stepZ > 0
    ? (Math.floor(oz) + 1 - oz) / dz
    : stepZ < 0
    ? (Math.floor(oz) - oz) / dz
    : Infinity;

  let prevX = currentX;
  let prevY = currentY;
  let prevZ = currentZ;
  let lastNormal: Vec3i = [0, 0, 0];
  let distance = 0;

  // Maximum step count safeguard
  const maxSteps = Math.ceil(maxDistance * 3) + 32;

  for (let i = 0; i < maxSteps; i++) {
    if (tMaxX <= tMaxY && tMaxX <= tMaxZ) {
      distance = tMaxX;
      if (distance > maxDistance) break;
      prevX = currentX;
      prevY = currentY;
      prevZ = currentZ;
      currentX += stepX;
      tMaxX += tDeltaX;
      lastNormal = [-stepX as any, 0, 0];
    } else if (tMaxY <= tMaxZ) {
      distance = tMaxY;
      if (distance > maxDistance) break;
      prevX = currentX;
      prevY = currentY;
      prevZ = currentZ;
      currentY += stepY;
      tMaxY += tDeltaY;
      lastNormal = [0, -stepY as any, 0];
    } else {
      distance = tMaxZ;
      if (distance > maxDistance) break;
      prevX = currentX;
      prevY = currentY;
      prevZ = currentZ;
      currentZ += stepZ;
      tMaxZ += tDeltaZ;
      lastNormal = [0, 0, -stepZ as any];
    }

    const block = getBlockAt(currentX, currentY, currentZ);
    if (block) {
      return {
        position: [currentX, currentY, currentZ],
        adjacentPosition: [prevX, prevY, prevZ],
        normal: lastNormal,
        distance,
        state: block.state,
        placementId: block.placementId,
      };
    }
  }

  return null;
}

const AIR_BLOCK_NAMES = new Set([
  'air',
  'minecraft:air',
  'cave_air',
  'minecraft:cave_air',
  'void_air',
  'minecraft:void_air',
]);

function isAir(name: string): boolean {
  const trimmed = name.trim().toLowerCase();
  if (trimmed === '' || AIR_BLOCK_NAMES.has(trimmed)) return true;
  const bracket = trimmed.indexOf('[');
  const base = bracket !== -1 ? trimmed.slice(0, bracket).trim() : trimmed;
  return AIR_BLOCK_NAMES.has(base);
}

/**
 * Creates a block lookup function resolving the effective visible non-air block
 * at any world (x, y, z) coordinate across a project's placements.
 */
export function createProjectBlockLookup(project: Project): BlockLookupFn {
  return (x: number, y: number, z: number) => {
    const placements = project.placements.filter((p) => p.visible !== false);
    if (placements.length === 0) return null;

    // Precedence: top-wins evaluates placements from top (end) to bottom (start)
    const overlapPolicy = project.overlapPolicy ?? 'top-wins';
    const sorted = overlapPolicy === 'top-wins' ? [...placements].reverse() : placements;

    for (const placement of sorted) {
      // Map world block to placement-local space
      // Center of world voxel is (x + 0.5, y + 0.5, z + 0.5)
      const [tx, ty, tz] = placement.transform.translation;
      const dx = x + 0.5 - tx;
      const dy = y + 0.5 - ty;
      const dz = z + 0.5 - tz;

      // Inverse rotation
      let irx = dx;
      let iry = dy;
      let irz = dz;
      switch (placement.transform.rotationY) {
        case 90:
          irx = -dz;
          irz = dx;
          break;
        case 180:
          irx = -dx;
          irz = -dz;
          break;
        case 270:
          irx = dz;
          irz = -dx;
          break;
      }

      // Inverse mirror
      if (placement.transform.mirror === 'x') irx = -irx;
      if (placement.transform.mirror === 'z') irz = -irz;

      // Local coordinate
      const lx = Math.floor(placement.origin[0] / 2 + irx);
      const ly = Math.floor(placement.origin[1] / 2 + iry);
      const lz = Math.floor(placement.origin[2] / 2 + irz);

      // Check placement bounds
      const { min, maxExclusive } = placement.volume.bounds;
      if (
        lx < min[0] ||
        lx >= maxExclusive[0] ||
        ly < min[1] ||
        ly >= maxExclusive[1] ||
        lz < min[2] ||
        lz >= maxExclusive[2]
      ) {
        continue;
      }

      // Check tombstone
      const tombstoneKey = `${lx}_${ly}_${lz}`;
      if (placement.eraseTombstones && placement.eraseTombstones.has(tombstoneKey)) {
        continue;
      }

      // Check chunk
      const cx = Math.floor(lx / 16);
      const cy = Math.floor(ly / 16);
      const cz = Math.floor(lz / 16);
      const chunkKey = `${cx}_${cy}_${cz}`;

      const chunk = placement.volume.chunks.get(chunkKey);
      if (!chunk) continue;

      const clx = ((lx % 16) + 16) % 16;
      const cly = ((ly % 16) + 16) % 16;
      const clz = ((lz % 16) + 16) % 16;
      const idx = (cly * 16 + clz) * 16 + clx;

      const palIdx = chunk.indices[idx];
      if (palIdx === undefined) continue;

      const state = chunk.palette[palIdx];
      if (!state) continue;

      const stateId = typeof state === 'string' ? state : state.id;
      if (isAir(stateId)) {
        continue;
      }

      const normalizedState: BlockStateId = typeof state === 'string'
        ? { id: state, props: {} }
        : state;

      return {
        state: normalizedState,
        placementId: placement.id,
      };
    }

    return null;
  };
}
