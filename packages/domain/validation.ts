// ============================================================================
// Slice 11: Validation Rules
// ============================================================================

import type { Vec3i, Bounds3i } from './types.ts';
import type { NbtTag } from './nbt.ts';
import { ERROR_CODES, makeDiagnostic } from './error-codes.ts';

export class ValidationError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = 'ValidationError';
  }
}

export function validateTranslation(translation: Vec3i): void {
  for (const c of translation) {
    if (!Number.isInteger(c) || !Number.isSafeInteger(c)) {
      throw new ValidationError('ENGINE_OFF_GRID_TRANSFORM', `Fractional translation component: ${c}`);
    }
  }
}

export function validateVolumeBounds(min: Vec3i, maxExclusive: Vec3i): void {
  for (let i = 0; i < 3; i++) {
    const size = maxExclusive[i] - min[i];
    if (size <= 0 || !Number.isSafeInteger(size)) {
      throw new ValidationError('INTEGER_OVERFLOW', `Invalid dimension on axis ${i}: ${size}`);
    }
  }
  const totalCells = BigInt(maxExclusive[0] - min[0]) *
    BigInt(maxExclusive[1] - min[1]) *
    BigInt(maxExclusive[2] - min[2]);
  if (totalCells > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new ValidationError('INTEGER_OVERFLOW', `Total cells exceeds MAX_SAFE_INTEGER`);
  }
}

export function validatePaletteSize(paletteSize: number): 'Uint8Array' | 'Uint16Array' {
  if (paletteSize <= 256) return 'Uint8Array';
  return 'Uint16Array'; // per-chunk max is 4096 entries; Uint32 not used for chunks
}

export function validateNbtTagList(tags: NbtTag[]): void {
  // Reject mixed-type lists (acceptance item 12)
  if (tags.length === 0) return;
  const firstType = tags[0].type;
  for (const tag of tags) {
    if (tag.type !== firstType) {
      throw new ValidationError('NBT_MIXED_TYPE_LIST', `List contains mixed tag types: ${firstType} and ${tag.type}`);
    }
  }
}

export function validateZeroSize(min: Vec3i, maxExclusive: Vec3i): 'ok' | 'EMPTY_VOLUME' {
  const sizeX = maxExclusive[0] - min[0];
  const sizeY = maxExclusive[1] - min[1];
  const sizeZ = maxExclusive[2] - min[2];
  if (sizeX === 0 || sizeY === 0 || sizeZ === 0) {
    return 'EMPTY_VOLUME';
  }
  return 'ok';
}

export function makeValidationDiagnostic(
  code: string,
  message?: string,
): ReturnType<typeof makeDiagnostic> {
  return makeDiagnostic(code, message);
}
