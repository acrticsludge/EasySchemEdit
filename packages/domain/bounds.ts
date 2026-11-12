import type { Bounds3i, Vec3Half, Vec3i } from './types.ts';

// ============================================================================
// Slice 8.7: Bounds/Vector Helpers
// ============================================================================

export function add(a: Vec3i, b: Vec3i): Vec3i {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]] as Vec3i;
}

export function sub(a: Vec3i, b: Vec3i): Vec3i {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]] as Vec3i;
}

export function equals(a: Vec3i, b: Vec3i): boolean {
  return a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
}

export function union(a: Bounds3i, b: Bounds3i): Bounds3i {
  return {
    min: [Math.min(a.min[0], b.min[0]), Math.min(a.min[1], b.min[1]), Math.min(a.min[2], b.min[2])] as Vec3i,
    maxExclusive: [
      Math.max(a.maxExclusive[0], b.maxExclusive[0]),
      Math.max(a.maxExclusive[1], b.maxExclusive[1]),
      Math.max(a.maxExclusive[2], b.maxExclusive[2]),
    ] as Vec3i,
  };
}

export function intersect(a: Bounds3i, b: Bounds3i): Bounds3i | null {
  const min = [
    Math.max(a.min[0], b.min[0]),
    Math.max(a.min[1], b.min[1]),
    Math.max(a.min[2], b.min[2]),
  ] as Vec3i;
  const maxExclusive = [
    Math.min(a.maxExclusive[0], b.maxExclusive[0]),
    Math.min(a.maxExclusive[1], b.maxExclusive[1]),
    Math.min(a.maxExclusive[2], b.maxExclusive[2]),
  ] as Vec3i;
  if (min[0] >= maxExclusive[0] || min[1] >= maxExclusive[1] || min[2] >= maxExclusive[2]) {
    return null;
  }
  return { min, maxExclusive };
}

export function contains(bounds: Bounds3i, point: Vec3i): boolean {
  return (
    point[0] >= bounds.min[0] && point[0] < bounds.maxExclusive[0] &&
    point[1] >= bounds.min[1] && point[1] < bounds.maxExclusive[1] &&
    point[2] >= bounds.min[2] && point[2] < bounds.maxExclusive[2]
  );
}

export function size(bounds: Bounds3i): Vec3i {
  return [
    bounds.maxExclusive[0] - bounds.min[0],
    bounds.maxExclusive[1] - bounds.min[1],
    bounds.maxExclusive[2] - bounds.min[2],
  ] as Vec3i;
}

export function translate(bounds: Bounds3i, offset: Vec3i): Bounds3i {
  return {
    min: [bounds.min[0] + offset[0], bounds.min[1] + offset[1], bounds.min[2] + offset[2]] as Vec3i,
    maxExclusive: [
      bounds.maxExclusive[0] + offset[0],
      bounds.maxExclusive[1] + offset[1],
      bounds.maxExclusive[2] + offset[2],
    ] as Vec3i,
  };
}

export function chunkKeysInBounds(bounds: Bounds3i): string[] {
  const keys: string[] = [];
  const minCX = Math.floor(bounds.min[0] / 16);
  const maxCX = Math.floor((bounds.maxExclusive[0] - 1) / 16);
  const minCY = Math.floor(bounds.min[1] / 16);
  const maxCY = Math.floor((bounds.maxExclusive[1] - 1) / 16);
  const minCZ = Math.floor(bounds.min[2] / 16);
  const maxCZ = Math.floor((bounds.maxExclusive[2] - 1) / 16);
  for (let y = minCY; y <= maxCY; y++) {
    for (let z = minCZ; z <= maxCZ; z++) {
      for (let x = minCX; x <= maxCX; x++) {
        keys.push(`${x}_${y}_${z}`);
      }
    }
  }
  return keys;
}

export function addHalf(a: Vec3Half, b: Vec3Half): Vec3Half {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]] as Vec3Half;
}

export function subHalf(a: Vec3Half, b: Vec3Half): Vec3Half {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]] as Vec3Half;
}

export function equalsHalf(a: Vec3Half, b: Vec3Half): boolean {
  return a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
}

export function isIntegral(half: Vec3Half): boolean {
  return half[0] % 2 === 0 && half[1] % 2 === 0 && half[2] % 2 === 0;
}
