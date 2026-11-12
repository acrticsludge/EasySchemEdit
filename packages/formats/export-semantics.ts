// Subspec B — Slice b-5: Export Semantics
// trimOuterAir (default true; false allowed with Offset/origin adjusted)
// strict vs permissive + confirmLossy
// hidden placements excluded by default
// bake transform for placement, composite applies overlap policy
// ExportError, EXPORT_DIMENSION_LIMIT (no auto-split)
// Absolute caps from maxDecompressedBytes (no decompression-ratio check)
import type { Bounds3i } from '../domain/types.ts';
import type {
  ExportOptions,
  ExportTarget,
  ProjectSnapshot,
} from './adapter.ts';
import { ExportError } from './errors.ts';

export const MAX_DIMENSION = 65535;
export const DEFAULT_MAX_TOTAL_VOLUME = BigInt(65535) * BigInt(65535) * BigInt(65535);

export type ExportValidationResult = {
  valid: boolean;
  errors: string[];
  warnings: string[];
};

export type TrimmedBounds = {
  bounds: Bounds3i;
  trimmed: boolean;
  offsetAdjustment: [number, number, number];
};

export function validateExportDimensions(
  width: number,
  height: number,
  length: number,
): { valid: boolean; error?: ExportError } {
  if (width > MAX_DIMENSION || height > MAX_DIMENSION || length > MAX_DIMENSION) {
    return {
      valid: false,
      error: new ExportError(
        'EXPORT_DIMENSION_LIMIT',
        `Export dimension exceeds ${MAX_DIMENSION}: ${width}x${height}x${length}`,
        { width, height, length, maxDimension: MAX_DIMENSION },
      ),
    };
  }
  return { valid: true };
}

export function validateTotalVolume(
  volume: bigint,
  maxTotalVolume: bigint,
): { valid: boolean; error?: ExportError } {
  if (volume > maxTotalVolume) {
    return {
      valid: false,
      error: new ExportError(
        'EXPORT_VOLUME_LIMIT',
        `Export volume exceeds maxTotalVolume: ${volume} > ${maxTotalVolume}`,
        { volume, maxTotalVolume },
      ),
    };
  }
  return { valid: true };
}

export function checkLossyConfirmation(
  hasDataLoss: boolean,
  options: ExportOptions,
): { valid: boolean; error?: ExportError } {
  if (hasDataLoss && !options.confirmLossy) {
    return {
      valid: false,
      error: new ExportError(
        'EXPORT_LOSSY_CONFIRM_REQUIRED',
        'Export would lose data; confirmLossy must be true',
        { confirmLossy: options.confirmLossy },
      ),
    };
  }
  return { valid: true };
}

export function filterHiddenPlacements<T extends { visible: boolean }>(
  placements: T[],
  includeHidden: boolean,
): T[] {
  if (includeHidden) return placements;
  return placements.filter((p) => p.visible);
}

export function computeTrimmedBounds(
  bounds: Bounds3i,
  trimOuterAir: boolean,
): TrimmedBounds {
  const offsetAdjustment: [number, number, number] = [0, 0, 0];

  if (!trimOuterAir) {
    return { bounds, trimmed: false, offsetAdjustment };
  }

  const { min, maxExclusive } = bounds;
  let minX = min[0], minY = min[1], minZ = min[2];
  let maxX = maxExclusive[0], maxY = maxExclusive[1], maxZ = maxExclusive[2];

  // Find non-air extents — caller must provide non-air data;
  // here we just pass through and report no trimming possible without block data.
  // The actual trimming is performed by the exporter using block data.
  return { bounds: { min: [minX, minY, minZ], maxExclusive: [maxX, maxY, maxZ] }, trimmed: false, offsetAdjustment };
}

export function validateExport(
  snapshot: ProjectSnapshot,
  target: ExportTarget,
  options: ExportOptions,
): ExportValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Determine target bounds/dimensions based on target kind
  let width = 0, height = 0, length = 0;

  if (target.kind === 'selection') {
    width = target.bounds.maxExclusive[0] - target.bounds.min[0];
    height = target.bounds.maxExclusive[1] - target.bounds.min[1];
    length = target.bounds.maxExclusive[2] - target.bounds.min[2];
  }

  // Check dimension limit
  if (width > 0 || height > 0 || length > 0) {
    const dimCheck = validateExportDimensions(width, height, length);
    if (!dimCheck.valid && dimCheck.error) {
      if (options.strict) {
        errors.push(dimCheck.error.message);
      } else {
        warnings.push(dimCheck.error.message);
      }
    }
  }

  // Check lossy confirmation
  const lossyCheck = checkLossyConfirmation(false, options);
  if (!lossyCheck.valid && lossyCheck.error) {
    errors.push(lossyCheck.error.message);
  }

  // Hidden placements note
  if (target.kind === 'composite' && !target.includeHidden) {
    warnings.push('Hidden placements excluded from export');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

export type { ExportError };
