import type {
  BlockStateId,
  Vec3i,
  Vec3d,
  Bounds3i,
} from './types.ts';
import type { NbtTag } from './nbt.ts';

export type BlockEntityRecord = {
  position: Vec3i;          // local integer block coordinate
  nbt: NbtTag;              // compound, must contain 'id' string
};

export type EntityRecord = {
  id: string;
  position: Vec3d;          // fractional local position
  rotation: Vec3d;          // [pitch, yaw, roll] in degrees, fractional allowed
  nbt: NbtTag;              // opaque compound payload
};

export type BiomeVolume = {
  bounds: Bounds3i;         // local bounds matching the placement volume
  palette: string[];        // biome IDs (namespaced)
  indices: Uint8Array | Uint16Array | Uint32Array; // fixed volume entries
};

export type PendingTickRecord = {
  position: Vec3i;          // local integer block coordinate
  blockState: BlockStateId;
  tickDelay: number;        // ticks remaining, non-negative integer
  nbt: NbtTag;              // format-specific payload, preserved opaquely
};

export type PlacementSource = {
  format: 'schem-v2' | 'schem-v3' | 'litematic' | 'vanilla-nbt' | 'generated';
  filename?: string;
  regionName?: string;
  dataVersion?: number;
  formatVersion?: number;
  sourceGroupId?: string;
  rawMetadata?: NbtTag;
  diagnostics: Diagnostic[];
};

export type ImportGroup = {
  id: string;
  name: string;
  sourceFilename: string;
  placementIds: string[];
  sourceFormat: 'schem-v2' | 'schem-v3' | 'litematic';
  sourceMetadata?: NbtTag;
};

export type Diagnostic = {
  code: string; // stable code from central registry
  severity: 'error' | 'warning' | 'info';
  message: string;
  details?: Record<string, unknown>;
  remediation?: string;
};
