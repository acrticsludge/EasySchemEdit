// Subspec B — Slice b-0.5: Import/export report types
import type { Diagnostic } from '../domain/shared-types.ts';
import type { FormatDetectionResult } from './types.ts';

export type ImportReport = {
  format: DetectedFormat;
  minecraftDataVersion?: number;
  litematicRootVersion?: { major: number; minor: number; revision: number };
  dimensions: { width: number; height: number; length: number };
  volume: bigint;
  nonAirBlockCount: number;
  paletteSize: number;
  regionCount: number;
  fileSizeBytes: number;
  compressedSizeBytes: number;
  decompressedSizeBytes: number;
  preserved: {
    blockEntities: number;
    entities: number;
    biomes: boolean;
    ticks: number;
  };
  unsupported: {
    tags: Diagnostic[];
    blockStates: Diagnostic[];
  };
  sameStateOverlaps: number;
  stateConflicts: number;
  normalized: Diagnostic[];
  dropped: Diagnostic[];
  warnings: Diagnostic[];
  errors: Diagnostic[];
};

export type ExportReport = {
  format: 'schem-v3' | 'litematic';
  target: 'composite' | 'placement' | 'selection' | 'importGroup';
  minecraftDataVersion?: number;
  dimensions: { width: number; height: number; length: number };
  nonAirBlockCount: number;
  paletteSizeEstimate: number;
  regionCount: number;
  estimatedOutputSizeBytes: number;
  conflictsResolvedByPrecedence: number;
  ancillaryData: {
    blockEntities: number;
    entities: number;
    biomes: boolean;
  };
  warnings: Diagnostic[];
  errors: Diagnostic[];
  validation: ExportValidationResult;
};

export type ExportValidationResult = {
  passed: boolean;
  reimportComparison: { matches: boolean; differences: Diagnostic[] };
};

type DetectedFormat = FormatDetectionResult['format'];
