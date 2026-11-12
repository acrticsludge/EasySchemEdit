import type { BlockEntityRecord, EntityRecord, BiomeVolume, PendingTickRecord } from './shared-types.ts';
import type { Vec3Half, Vec3i } from './types.ts';
import type { Transform } from './coordinates.ts';
import { applyMirror, applyRotation } from './coordinates.ts';

// ============================================================================
// Slice 8.6: Ancillary Transforms
// ============================================================================

export type AncillaryTransformResult<T> = {
  result: T;
  warnings: { code: string; message: string }[];
};

export function rotateMirrorBlockEntityPositions(
  records: BlockEntityRecord[],
  transform: Transform,
  origin: Vec3Half,
): AncillaryTransformResult<BlockEntityRecord[]> {
  const warnings: { code: string; message: string }[] = [];
  const result: BlockEntityRecord[] = [];

  for (const rec of records) {
    const [lx, ly, lz] = rec.position;
    const [cx, cy, cz] = [lx * 2 + 1, ly * 2 + 1, lz * 2 + 1]; // center half
    const [ox, oy, oz] = origin;
    const dx = cx - ox;
    const dy = cy - oy;
    const dz = cz - oz;

    const [mx, my, mz] = applyMirror(dx, dy, dz, transform.mirror);
    const [rx, ry, rz] = applyRotation(mx, my, mz, transform.rotationY);

    const worldCenterHalfX = transform.translation[0] * 2 + rx;
    const worldCenterHalfY = transform.translation[1] * 2 + ry;
    const worldCenterHalfZ = transform.translation[2] * 2 + rz;

    const newLx = (worldCenterHalfX - 1) / 2;
    const newLy = (worldCenterHalfY - 1) / 2;
    const newLz = (worldCenterHalfZ - 1) / 2;

    if (!Number.isInteger(newLx) || !Number.isInteger(newLy) || !Number.isInteger(newLz)) {
      warnings.push({ code: 'ENGINE_OFF_GRID_TRANSFORM', message: `Block entity at [${lx},${ly},${lz}] maps off-grid` });
      continue;
    }

    result.push({
      position: [newLx, newLy, newLz] as Vec3i,
      nbt: rec.nbt,
    });
  }

  return { result, warnings };
}

export function rotateMirrorEntityPositions(
  records: EntityRecord[],
  transform: Transform,
  origin: Vec3Half,
): AncillaryTransformResult<EntityRecord[]> {
  const warnings: { code: string; message: string }[] = [];
  const result: EntityRecord[] = [];

  for (const rec of records) {
    const [lx, ly, lz] = rec.position;
    const [px, py, pz] = rec.rotation;

    const [mx, my, mz] = applyMirror(lx, ly, lz, transform.mirror);
    const [rx, ry, rz] = applyRotation(mx, my, mz, transform.rotationY);

    result.push({
      id: rec.id,
      position: [rx + transform.translation[0], ry + transform.translation[1], rz + transform.translation[2]],
      rotation: [px, py, pz],
      nbt: rec.nbt,
    });
  }

  return { result, warnings };
}

export function rotateMirrorBiomeVolume(
  biome: BiomeVolume | undefined,
  transform: Transform,
): AncillaryTransformResult<BiomeVolume | undefined> {
  const warnings: { code: string; message: string }[] = [];
  if (!biome) return { result: undefined, warnings };
  // Biome volume indices remapped to new bounds — placeholder: return as-is with warning
  warnings.push({ code: 'ENGINE_INVARIANT_VIOLATION', message: 'Biome volume remapping not yet implemented' });
  return { result: biome, warnings };
}

export function rotateMirrorPendingTicks(
  ticks: PendingTickRecord[],
  transform: Transform,
  origin: Vec3Half,
): AncillaryTransformResult<PendingTickRecord[]> {
  const warnings: { code: string; message: string }[] = [];
  const result: PendingTickRecord[] = [];

  for (const tick of ticks) {
    const [lx, ly, lz] = tick.position;
    const [cx, cy, cz] = [lx * 2 + 1, ly * 2 + 1, lz * 2 + 1];
    const [ox, oy, oz] = origin;
    const dx = cx - ox;
    const dy = cy - oy;
    const dz = cz - oz;

    const [mx, my, mz] = applyMirror(dx, dy, dz, transform.mirror);
    const [rx, ry, rz] = applyRotation(mx, my, mz, transform.rotationY);

    const worldCenterHalfX = transform.translation[0] * 2 + rx;
    const worldCenterHalfY = transform.translation[1] * 2 + ry;
    const worldCenterHalfZ = transform.translation[2] * 2 + rz;

    const newLx = (worldCenterHalfX - 1) / 2;
    const newLy = (worldCenterHalfY - 1) / 2;
    const newLz = (worldCenterHalfZ - 1) / 2;

    if (!Number.isInteger(newLx) || !Number.isInteger(newLy) || !Number.isInteger(newLz)) {
      warnings.push({ code: 'ENGINE_OFF_GRID_TRANSFORM', message: `Pending tick at [${lx},${ly},${lz}] maps off-grid` });
      continue;
    }

    result.push({
      position: [newLx, newLy, newLz] as Vec3i,
      blockState: tick.blockState,
      tickDelay: tick.tickDelay,
      nbt: tick.nbt,
    });
  }

  return { result, warnings };
}
