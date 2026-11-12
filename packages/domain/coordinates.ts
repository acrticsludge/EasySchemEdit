import type { Bounds3i, ChunkCoord, Vec3d, Vec3Half, Vec3i } from './types.ts';

export const CHUNK_SIZE = 16;

export function floorDiv(a: number, b: number): number {
  return Math.floor(a / b);
}

export function euclideanMod(a: number, b: number): number {
  return ((a % b) + b) % b;
}

export function worldToChunkCoord(worldBlock: Vec3i): ChunkCoord {
  return [floorDiv(worldBlock[0], 16), floorDiv(worldBlock[1], 16), floorDiv(worldBlock[2], 16)];
}

export function localInChunk(worldBlock: Vec3i): Vec3i {
  return [euclideanMod(worldBlock[0], 16), euclideanMod(worldBlock[1], 16), euclideanMod(worldBlock[2], 16)];
}

export function chunkKey(cx: number, cy: number, cz: number): string {
  return `${cx}_${cy}_${cz}`;
}

// ============================================================================
// Slice 4: Center-based transform math
// ============================================================================

export type Transform = {
  translation: Vec3i;   // integer block coordinates
  rotationY: 0 | 90 | 180 | 270;
  mirror: 'none' | 'x' | 'z';
};

// Rotation matrix for rotationY = θ (θ in {0, 90, 180, 270}):
// | cos θ   0   sin θ |
// | 0       1   0     |
// | -sin θ  0   cos θ |
// For θ=90°: (x, y, z) → (z, y, -x). Facing north (0,0,-1) → west (-1,0,0).
export function applyRotation(
  x: number, y: number, z: number, rotationY: 0 | 90 | 180 | 270,
): [number, number, number] {
  switch (rotationY) {
    case 0:  return [x, y, z];
    case 90: return [z, y, -x];
    case 180: return [-x, y, -z];
    case 270: return [-z, y, x];
  }
}

// Mirror applied in local space before rotation
export function applyMirror(
  x: number, y: number, z: number, mirror: 'none' | 'x' | 'z',
): [number, number, number] {
  switch (mirror) {
    case 'none': return [x, y, z];
    case 'x': return [-x, y, z];
    case 'z': return [x, y, -z];
  }
}

// Doubled-integer cell map: cell lower corner → cell lower corner
// centerHalf = 2*cell + [1,1,1] (odd triple)
// worldCenterHalf = T + R(centerHalf − O)
// worldBlock = (worldCenterHalf − [1,1,1]) / 2
// Valid iff all components of worldCenterHalf are odd
export function mapCellToWorld(
  translation: Vec3i,   // T (even triple)
  origin: Vec3Half,     // O (even components iff integral origin)
  rotationY: 0 | 90 | 180 | 270,
  mirror: 'none' | 'x' | 'z',
  cell: Vec3i           // C (even triple)
): { worldCellHalf: number[]; valid: boolean; worldBlock?: Vec3i } {
  const [tx, ty, tz] = [translation[0] * 2, translation[1] * 2, translation[2] * 2];
  const [ox, oy, oz] = origin;
  const [cx, cy, cz] = cell;

  const centerHalfX = 2 * cx + 1;
  const centerHalfY = 2 * cy + 1;
  const centerHalfZ = 2 * cz + 1;

  const dx = centerHalfX - ox;
  const dy = centerHalfY - oy;
  const dz = centerHalfZ - oz;

  const [mx, my, mz] = applyMirror(dx, dy, dz, mirror);
  const [rx, ry, rz] = applyRotation(mx, my, mz, rotationY);

  const worldCenterHalfX = tx + rx;
  const worldCenterHalfY = ty + ry;
  const worldCenterHalfZ = tz + rz;

  const worldCellHalf = [worldCenterHalfX, worldCenterHalfY, worldCenterHalfZ];

  const valid =
    Number.isInteger(worldCenterHalfX) && worldCenterHalfX % 2 !== 0 &&
    Number.isInteger(worldCenterHalfY) && worldCenterHalfY % 2 !== 0 &&
    Number.isInteger(worldCenterHalfZ) && worldCenterHalfZ % 2 !== 0;

  let worldBlock: Vec3i | undefined;
  if (valid) {
    worldBlock = [
      (worldCenterHalfX - 1) / 2,
      (worldCenterHalfY - 1) / 2,
      (worldCenterHalfZ - 1) / 2,
    ] as Vec3i;
  }

  return { worldCellHalf, valid, worldBlock };
}

export function isLatticeSafe(_translation: Vec3i, origin: Vec3Half): boolean {
  if (origin[0] % 2 !== 0 || origin[1] % 2 !== 0 || origin[2] % 2 !== 0) {
    return false;
  }
  return true;
}

export function localBlockToWorld(
  placement: { transform: Transform },
  localBlock: Vec3i,
): Vec3i {
  const result = mapCellToWorld(
    placement.transform.translation,
    [0, 0, 0] as Vec3Half,
    placement.transform.rotationY,
    placement.transform.mirror,
    localBlock,
  );
  if (!result.valid || !result.worldBlock) {
    throw new Error(`Block ${localBlock} is off-grid under transform`);
  }
  return result.worldBlock;
}

export function placementWorldBounds(
  placement: { transform: Transform; volume: { bounds: Bounds3i } },
): Bounds3i {
  const { transform, volume } = placement;
  const { min, maxExclusive } = volume.bounds;

  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

  for (let y = min[1]; y < maxExclusive[1]; y++) {
    for (let z = min[2]; z < maxExclusive[2]; z++) {
      for (let x = min[0]; x < maxExclusive[0]; x++) {
        const result = mapCellToWorld(
          transform.translation,
          [0, 0, 0] as Vec3Half,
          transform.rotationY,
          transform.mirror,
          [x, y, z],
        );
        if (result.valid && result.worldBlock) {
          const [wx, wy, wz] = result.worldBlock;
          if (wx < minX) minX = wx;
          if (wy < minY) minY = wy;
          if (wz < minZ) minZ = wz;
          if (wx > maxX) maxX = wx;
          if (wy > maxY) maxY = wy;
          if (wz > maxZ) maxZ = wz;
        }
      }
    }
  }

  return {
    min: [minX, minY, minZ] as Vec3i,
    maxExclusive: [maxX + 1, maxY + 1, maxZ + 1] as Vec3i,
  };
}

export function rotateAboutPoint(
  placement: { transform: Transform },
  pivot: Vec3Half,
  rotationY: 0 | 90 | 180 | 270,
  mirror: 'none' | 'x' | 'z',
): Transform {
  const { transform } = placement;
  const [px, py, pz] = pivot;

  const [mx, my, mz] = applyMirror(px, py, pz, mirror);
  const [rx, ry, rz] = applyRotation(mx, my, mz, rotationY);

  return {
    translation: [
      transform.translation[0] + Math.round(px - rx),
      transform.translation[1] + Math.round(py - ry),
      transform.translation[2] + Math.round(pz - rz),
    ] as Vec3i,
    rotationY,
    mirror,
  };
}

export function localPointToWorld(
  placement: { transform: Transform },
  localPoint: Vec3d,
): Vec3d {
  const cell = [Math.floor(localPoint[0]), Math.floor(localPoint[1]), Math.floor(localPoint[2])] as Vec3i;
  const result = mapCellToWorld(
    placement.transform.translation,
    [0, 0, 0] as Vec3Half,
    placement.transform.rotationY,
    placement.transform.mirror,
    cell,
  );
  if (!result.valid) {
    return localPoint;
  }
  return [result.worldBlock![0] + 0.5, result.worldBlock![1] + 0.5, result.worldBlock![2] + 0.5] as Vec3d;
}

export function worldPointToLocal(
  _placement: { transform: Transform },
  worldPoint: Vec3d,
): Vec3d {
  const worldCell = [Math.floor(worldPoint[0]), Math.floor(worldPoint[1]), Math.floor(worldPoint[2])] as Vec3i;
  return [worldCell[0] + 0.5, worldCell[1] + 0.5, worldCell[2] + 0.5] as Vec3d;
}
