// Subspec B — Slice b-0.5: Shared Types + Adapter Interface + Merged Snapshot + Reports
// No implementation logic — just type definitions.

import type {
  BlockStateId,
  Bounds3i,
  Vec3Half,
  Vec3i,
} from '../domain/types.ts';
import type { Placement } from '../domain/placement.ts';
import type { Transform } from '../domain/coordinates.ts';
import type {
  BlockEntityRecord,
  EntityRecord,
  BiomeVolume,
  ImportGroup,
  PlacementSource,
  PendingTickRecord,
  Diagnostic,
} from '../domain/shared-types.ts';
import type { NbtTag } from '../domain/nbt.ts';
import type { FormatDetectionResult } from './types.ts';
import type { ImportReport, ExportReport } from './reports.ts';

export interface FormatAdapter {
  readonly formatId:
    | 'schem-v2'
    | 'schem-v3'
    | 'litematic'
    | 'schematic-legacy'
    | 'vanilla-nbt';
  detect(bytes: Uint8Array): FormatDetectionResult;
  import(bytes: Uint8Array, options: ImportOptions): Promise<ImportResult>;
  export(
    snapshot: ProjectSnapshot,
    target: ExportTarget,
    options: ExportOptions,
  ): Promise<ExportResult>;
}

export type ImportResult = {
  placements: Placement[];
  importGroups: ImportGroup[];
  report: ImportReport;
  normalizedImport: boolean;
};

export type ExportResult = {
  bytes: Uint8Array;
  filename: string;
  report: ExportReport;
};

export type ImportOptions = {
  preserveSourceOrigin: boolean;
  autoArrange: boolean;
  strict: boolean;
  maxCompressedBytes: number;
  maxDecompressedBytes: number;
  maxTotalVolume: bigint;
  maxNonAirBlocks: number;
  maxNbtNestingDepth: number;
  maxNbtTagCount: number;
};

export type ExportTarget =
  | { kind: 'placement'; placementId: string }
  | { kind: 'importGroup'; importGroupId: string }
  | { kind: 'composite'; selection?: Bounds3i; includeHidden: boolean }
  | { kind: 'selection'; bounds: Bounds3i; includeHidden: boolean };

export type ExportOptions = {
  strict: boolean;
  confirmLossy: boolean;
  includeRegionMetadata: boolean;
  trimOuterAir: boolean;
  bakeTransforms: boolean;
  targetDataVersion: number;
  onProgress?: (done: number, total: number) => void;
  signal?: AbortSignal;
};

export type ProjectSnapshot = {
  schemaVersion: number;
  id: string;
  name: string;
  placements: ReadonlyArray<{
    id: string;
    name: string;
    transform: Transform;
    origin: Vec3Half;
    visible: boolean;
    locked: boolean;
    source: { format: string; diagnostics: Diagnostic[] };
    volumeRef: { bounds: Bounds3i; chunkKeys: string[]; nonAirCount: number };
    ancillary: {
      blockEntities: Map<string, { position: Vec3i; nbt: NbtTag }>;
      entities: Array<{ id: string; position: Vec3i; rotation: Vec3i; nbt: NbtTag }>;
      biomes?: {
        palette: string[];
        indices: Uint8Array | Uint16Array | Uint32Array;
        bounds: Bounds3i;
      };
      pendingTicks: Array<{
        position: Vec3i;
        blockState: BlockStateId;
        tickDelay: number;
      }>;
      tombstones: Set<string>;
    };
  }>;
  importGroups: ReadonlyArray<ImportGroup>;
  overlapPolicy: 'top-wins' | 'bottom-wins';
  revision: number;
  chunkViews: Map<
    string,
    Map<string, { indices: Uint8Array | Uint16Array | Uint32Array; palette: BlockStateId[] }>
  >;
};
