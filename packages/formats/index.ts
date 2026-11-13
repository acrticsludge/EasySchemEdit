// packages/formats/index.ts
// Public API for the formats package.

export { SpongeV3Adapter } from './sponge-v3.ts';
export { SpongeV2Adapter } from './sponge-v2.ts';
export { LitematicAdapter } from './litematic.ts';
export { VanillaNbtAdapter } from './vanilla-nbt.ts';

export { importSchematic } from './import.ts';
export { exportSchematic, type ExportSchematicOptions } from './export.ts';

export {
  gzipCompress,
  gzipDecompressBounded,
  defaultCodecServices,
  isGzip,
  isZlib,
} from './codec.ts';

export { inspect, type InspectResult } from './inspect.ts';
export { detectFormat } from './format-detection.ts';

export {
  encodePackedBlockStates,
  decodePackedBlockStates,
  type PackedBlockStatesResult,
} from './litematic-packed.ts';

export {
  normalizeRegionSize,
  rawToNormalizedCoord,
  normalizedToWorld,
  linearIndex,
  type RegionSize,
} from './litematic-size.ts';

export {
  decodeNbtFromBytes,
  decodeNbt,
  encodeNbt,
  type NbtServices,
  type NbtSafetyLimits,
  DEFAULT_LIMITS,
} from './nbts.ts';

export { ExportError, NbtSafetyError } from './errors.ts';

export {
  checkRegionEligibility,
  EXPORT_REGION_GROUPING_LOST,
  type RegionGroupMetadata,
  type RegionEligibilityResult,
} from './region-eligibility.ts';

export {
  validateExportDimensions,
  validateTotalVolume,
  checkLossyConfirmation,
  filterHiddenPlacements,
  computeTrimmedBounds,
  validateExport,
  MAX_DIMENSION,
  DEFAULT_MAX_TOTAL_VOLUME,
} from './export-semantics.ts';

export type {
  FormatAdapter,
  ImportResult,
  ExportResult,
  ImportOptions,
  ExportOptions,
  ExportTarget,
  ProjectSnapshot,
} from './adapter.ts';

export type { DetectedFormat, FormatDetectionResult } from './types.ts';
export type { ImportReport, ExportReport, ExportValidationResult as ReportValidationResult } from './reports.ts';
