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
  placement: { transform: Transform; origin: Vec3Half },
  localBlock: Vec3i,
): Vec3i {
  const result = mapCellToWorld(
    placement.transform.translation,
    placement.origin,
    placement.transform.rotationY,
    placement.transform.mirror,
    localBlock,
  );
  if (!result.valid || !result.worldBlock) {
    throw new Error(`Block ${localBlock} is off-grid under transform`);
  }
  return result.worldBlock;
}

export function worldBlockToLocal(
  placement: { transform: Transform; origin: Vec3Half },
  worldBlock: Vec3i,
): Vec3i {
  const [tx, ty, tz] = [
    placement.transform.translation[0] * 2,
    placement.transform.translation[1] * 2,
    placement.transform.translation[2] * 2,
  ];
  const [ox, oy, oz] = placement.origin;
  const worldCenterHalf = [
    2 * worldBlock[0] + 1,
    2 * worldBlock[1] + 1,
    2 * worldBlock[2] + 1,
  ];

  const dx = worldCenterHalf[0] - tx;
  const dy = worldCenterHalf[1] - ty;
  const dz = worldCenterHalf[2] - tz;

  const invRot = ((360 - placement.transform.rotationY) % 360) as 0 | 90 | 180 | 270;
  const [rx, ry, rz] = applyRotation(dx, dy, dz, invRot);
  const [mx, my, mz] = applyMirror(rx, ry, rz, placement.transform.mirror);

  const localCenterHalf = [mx + ox, my + oy, mz + oz];

  const valid =
    Number.isInteger(localCenterHalf[0]) && localCenterHalf[0] % 2 !== 0 &&
    Number.isInteger(localCenterHalf[1]) && localCenterHalf[1] % 2 !== 0 &&
    Number.isInteger(localCenterHalf[2]) && localCenterHalf[2] % 2 !== 0;

  if (!valid) {
    throw new Error(`Block ${worldBlock} is off-grid under inverse transform`);
  }

  return [
    (localCenterHalf[0] - 1) / 2,
    (localCenterHalf[1] - 1) / 2,
    (localCenterHalf[2] - 1) / 2,
  ] as Vec3i;
}

export function placementWorldBounds(
  placement: { transform: Transform; origin: Vec3Half; volume: { bounds: Bounds3i } },
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
    const result = mapCellToWorld(
      transform.translation,
      origin,
      transform.rotationY,
      transform.mirror,
      c,
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

  if (minX === Infinity) {
    return { min: [0, 0, 0], maxExclusive: [0, 0, 0] };
  }

  return {
    min: [minX, minY, minZ] as Vec3i,
    maxExclusive: [maxX + 1, maxY + 1, maxZ + 1] as Vec3i,
  };
}

export function rotateAboutPoint(
  placement: { transform: Transform; origin: Vec3Half },
  pivot: Vec3Half,
  rotationY: 0 | 90 | 180 | 270,
  mirror: 'none' | 'x' | 'z',
): Transform {
  const { transform, origin } = placement;

  // Work in doubled half-block units.
  // pivot (Vec3Half) and origin (Vec3Half) are already stored as doubled units.
  // translation (Vec3i) must be doubled: T2 = translation * 2.
  const [p2x, p2y, p2z] = pivot;
  const [t2x, t2y, t2z] = [transform.translation[0] * 2, transform.translation[1] * 2, transform.translation[2] * 2];
  const [o2x, o2y, o2z] = origin;

  // Step 1: Local coordinate of the world pivot under the current transform.
  // L2 = O + M_cur(R_cur⁻¹(P2 - T2))
  const [dx, dy, dz] = [p2x - t2x, p2y - t2y, p2z - t2z];
  const [irx, iry, irz] = applyRotationInverse(dx, dy, dz, transform.rotationY);
  const [umx, umy, umz] = applyMirror(irx, iry, irz, transform.mirror);
  const l2x = o2x + umx;
  const l2y = o2y + umy;
  const l2z = o2z + umz;

  // Step 2: New translation so that L2 maps to P2 under the new transform.
  // P2 = T2_new + R_new(M_new(L2 - O2))  →  T2_new = P2 - R_new(M_new(L2 - O2))
  const [d2x, d2y, d2z] = [l2x - o2x, l2y - o2y, l2z - o2z];
  const [mx2, my2, mz2] = applyMirror(d2x, d2y, d2z, mirror);
  const [nr2x, nr2y, nr2z] = applyRotation(mx2, my2, mz2, rotationY);

  const t2newx = p2x - nr2x;
  const t2newy = p2y - nr2y;
  const t2newz = p2z - nr2z;

  return {
    translation: [Math.round(t2newx / 2), Math.round(t2newy / 2), Math.round(t2newz / 2)] as Vec3i,
    rotationY,
    mirror,
  };
}

export function localPointToWorld(
  placement: { transform: Transform; origin: Vec3Half },
  localPoint: Vec3d,
): Vec3d {
  const cell = [Math.floor(localPoint[0]), Math.floor(localPoint[1]), Math.floor(localPoint[2])] as Vec3i;
  const result = mapCellToWorld(
    placement.transform.translation,
    placement.origin,
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
  placement: { transform: Transform; origin: Vec3Half },
  worldPoint: Vec3d,
): Vec3d {
  const { transform, origin } = placement;
  const worldCell = [Math.floor(worldPoint[0]), Math.floor(worldPoint[1]), Math.floor(worldPoint[2])] as Vec3i;
  const worldCenter = [worldCell[0] + 0.5, worldCell[1] + 0.5, worldCell[2] + 0.5];

  // d = worldCenter - translation (offset from translation in world space)
  const dx = worldCenter[0] - transform.translation[0];
  const dy = worldCenter[1] - transform.translation[1];
  const dz = worldCenter[2] - transform.translation[2];

  // Inverse rotation: R⁻¹
  let [rx, ry, rz] = applyRotationInverse(dx, dy, dz, transform.rotationY);
  // Inverse mirror: M is self-inverse
  const [mx, my, mz] = applyMirror(rx, ry, rz, transform.mirror);

  // localCenter = origin + d_unmirrored
  const localCenterX = origin[0] / 2 + mx;
  const localCenterY = origin[1] / 2 + my;
  const localCenterZ = origin[2] / 2 + mz;

  // Convert center back to block coordinate: subtract [0.5, 0.5, 0.5]
  return [localCenterX - 0.5, localCenterY - 0.5, localCenterZ - 0.5] as Vec3d;
}

// Inverse rotation: R₀⁻¹=R₀, R₉₀⁻¹=R₂₇₀, R₁₈₀⁻¹=R₁₈₀, R₂₇₀⁻¹=R₉₀
function applyRotationInverse(
  x: number, y: number, z: number, rotationY: 0 | 90 | 180 | 270,
): [number, number, number] {
  switch (rotationY) {
    case 0:  return [x, y, z];
    case 90: return applyRotation(x, y, z, 270);  // R₉₀⁻¹ = R₂₇₀
    case 180: return applyRotation(x, y, z, 180); // R₁₈₀⁻¹ = R₁₈₀
    case 270: return applyRotation(x, y, z, 90);  // R₂₇₀⁻¹ = R₉₀
  }
}
