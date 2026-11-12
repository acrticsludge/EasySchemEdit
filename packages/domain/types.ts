// Integer block coordinate (cell index).
export type Vec3i = readonly [number, number, number];

// Fractional world/local point.
export type Vec3d = readonly [number, number, number];

// Half-block grid unit. Actual coordinate = stored value / 2.
// Origin must be integral for placement transforms (even half-block components).
// Half-integer origins are off-grid under integer translation and rejected with
// ENGINE_OFF_GRID_TRANSFORM.
export type Vec3Half = readonly [number, number, number];

// Chunk coordinate (integer, may be negative).
export type ChunkCoord = readonly [number, number, number];

export type Bounds3i = {
  min: Vec3i;
  maxExclusive: Vec3i;
};

export type BlockStateId = {
  id: string;           // normalized namespaced resource location, lowercase
  props: Readonly<Record<string, string>>; // canonical sorted keys
};

export const CHUNK_SIZE = 16; // A1 — fixed globally for v1

// Half-block grid unit. Actual coordinate = stored value / 2.
// Origin must be integral for placement transforms (even half-block components).
// Half-integer origins are off-grid under integer translation and rejected with
// ENGINE_OFF_GRID_TRANSFORM. Use rotateAboutPoint() to pivot around a point.
export function halfToCoord(stored: number): number {
  return stored / 2;
}

export function coordToHalf(coord: number): number {
  return coord * 2;
}

export function isIntegralOrigin(half: Vec3Half): boolean {
  return half[0] % 2 === 0 && half[1] % 2 === 0 && half[2] % 2 === 0;
}
