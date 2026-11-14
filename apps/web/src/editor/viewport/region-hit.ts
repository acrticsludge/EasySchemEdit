// apps/web/src/editor/viewport/region-hit.ts
// Region hit detection, ray-AABB intersection, and block ID normalization for region operations.

import type { Bounds3i, Vec3i, BlockStateId } from '@easyschemedit/domain';
import { parseBlockStateString } from '@easyschemedit/domain';

/**
 * Determines whether an integer block coordinate is inside the given bounding box.
 * Note that Bounds3i uses half-open interval: [min, maxExclusive).
 */
export function isPointInBounds3i(pos: Vec3i, bounds: Bounds3i): boolean {
  return (
    pos[0] >= bounds.min[0] &&
    pos[0] < bounds.maxExclusive[0] &&
    pos[1] >= bounds.min[1] &&
    pos[1] < bounds.maxExclusive[1] &&
    pos[2] >= bounds.min[2] &&
    pos[2] < bounds.maxExclusive[2]
  );
}

/**
 * Standard slab-method Ray-AABB intersection test.
 * Returns { minT, maxT } where minT is clamped to >= 0, or null if no intersection.
 */
export function intersectRayAABB(
  orig: [number, number, number],
  dir: [number, number, number],
  bounds: Bounds3i
): { minT: number; maxT: number } | null {
  if (
    bounds.min[0] >= bounds.maxExclusive[0] ||
    bounds.min[1] >= bounds.maxExclusive[1] ||
    bounds.min[2] >= bounds.maxExclusive[2]
  ) {
    return null;
  }

  let tMin = -Infinity;
  let tMax = Infinity;

  for (let i = 0; i < 3; i++) {
    const o = orig[i];
    const d = dir[i];
    const minVal = bounds.min[i];
    const maxVal = bounds.maxExclusive[i];

    if (Math.abs(d) < 1e-8) {
      if (o < minVal || o > maxVal) return null;
    } else {
      const invD = 1 / d;
      let t1 = (minVal - o) * invD;
      let t2 = (maxVal - o) * invD;
      if (t1 > t2) {
        const tmp = t1;
        t1 = t2;
        t2 = tmp;
      }
      tMin = Math.max(tMin, t1);
      tMax = Math.min(tMax, t2);
      if (tMin > tMax) return null;
    }
  }

  if (tMax < 0) return null;
  return { minT: Math.max(0, tMin), maxT: tMax };
}

/**
 * Checks whether a ray from the cursor intersects/hovers the selected region bounds:
 * 1. If solidHitPos is provided and inside bounds, the cursor is directly pointing at a solid voxel in the region.
 * 2. Otherwise, if the ray intersects the region's bounding box and no closer solid voxel blocks it, the region is hovered.
 */
export function isRayHoveringRegion(
  rayOrigin: [number, number, number],
  rayDir: [number, number, number],
  bounds: Bounds3i,
  solidHitDistance: number | null,
  solidHitPos: Vec3i | null
): boolean {
  if (solidHitPos && isPointInBounds3i(solidHitPos, bounds)) {
    return true;
  }
  const hit = intersectRayAABB(rayOrigin, rayDir, bounds);
  if (!hit) {
    return false;
  }
  // If an external solid voxel hit is strictly closer than the region entry point, it occludes the region
  if (solidHitDistance !== null && solidHitDistance + 1e-4 < hit.minT) {
    return false;
  }
  return true;
}

/**
 * Normalizes a Minecraft block identifier:
 * If the user inputs a name without namespace (e.g. "stone" or "oak_stairs[facing=north]"),
 * prefixes "minecraft:" automatically.
 */
export function normalizeBlockId(raw: string): string {
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed) return 'minecraft:air';
  if (trimmed.startsWith('[')) return `minecraft:stone${trimmed}`;
  const bracketIdx = trimmed.indexOf('[');
  if (bracketIdx === -1) {
    return trimmed.includes(':') ? trimmed : `minecraft:${trimmed}`;
  }
  const idPart = trimmed.slice(0, bracketIdx);
  const propsPart = trimmed.slice(bracketIdx);
  const normalizedId = idPart.includes(':') ? idPart : `minecraft:${idPart}`;
  return `${normalizedId}${propsPart}`;
}

/**
 * Converts a string into a BlockStateId, parsing optional bracketed properties if present.
 */
export function toBlockStateId(raw: string): BlockStateId {
  const normalized = normalizeBlockId(raw);
  try {
    return parseBlockStateString(normalized);
  } catch {
    const id = normalized.split('[')[0];
    return { id, props: {} };
  }
}
