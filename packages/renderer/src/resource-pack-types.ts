// packages/renderer/src/resource-pack-types.ts
// Resource pack types (SUBSPEC-E §2.1).
// Pure TypeScript, zero Three.js/React/DOM/UI imports.
// Imports Diagnostic from @easyschemedit/domain via relative paths.

import type { Diagnostic } from '../../domain/shared-types.ts';

// ============================================================================
// Asset Profile
// ============================================================================

export type AssetProfile = {
  id: string;
  minecraftVersion: string;  // e.g. "1.21.11"
  packFormat: number;        // 75.0 for 1.21.11
  displayName: string;
  pinned: boolean;           // true for default 1.21.11 profile
};

// ============================================================================
// Resource Pack Source
// ============================================================================

export type ResourcePackSource =
  | { kind: 'vanilla-runtime'; version: string; assetHash: string }
  | { kind: 'manual-jar'; filename: string; jarHash: string }
  | { kind: 'user-pack'; path: string; priority: number };

// ============================================================================
// Model Display (transforms for different render contexts)
// ============================================================================

export type ModelDisplay = {
  rotation?: [number, number, number];
  translation?: [number, number, number];
  scale?: [number, number, number];
};

// ============================================================================
// Resource Pack
// ============================================================================

export type ResourcePack = {
  source: ResourcePackSource;
  models: Map<string, BlockModel>;
  textures: Map<string, TextureData>;
  blockStates: Map<string, BlockStateDefinition>;
  priority: number;
  loaded: boolean;
  diagnostics: Diagnostic[];
};

// ============================================================================
// Block Model
// ============================================================================

export type BlockModel = {
  id: string;                      // namespaced model ID
  elements?: ModelElement[];
  parent?: string;
  textures: Record<string, string>; // texture slot → texture ID
  ambientOcclusion?: boolean;
  guiLight?: 'front' | 'side';
  display?: Record<string, ModelDisplay>;
};

// ============================================================================
// Model Element
// ============================================================================

export type ModelElement = {
  from: [number, number, number];
  to: [number, number, number];
  rotation?: {
    angle: number;
    axis: 'x' | 'y' | 'z';
    origin: [number, number, number];
  };
  shade?: boolean;
  faces: Record<string, ModelFace>;
};

// ============================================================================
// Model Face
// ============================================================================

export type ModelFace = {
  texture: string;
  uv?: [number, number, number, number];
  cullface?: string;
  rotation?: 0 | 90 | 180 | 270;
  tintindex?: number;
};

// ============================================================================
// Texture Data
// ============================================================================

export type TextureData = {
  id: string;
  width: number;
  height: number;
  pixels: Uint8ClampedArray;      // RGBA
  mipLevels: Uint8ClampedArray[]; // precomputed mips if filtering preference requires
};

// ============================================================================
// Block State Definition
// ============================================================================

export type BlockStateDefinition = {
  variants?: Record<string, ModelReference | ModelReference[]>;
  multipart?: MultipartEntry[];
};

// ============================================================================
// Model Reference
// ============================================================================

export type ModelReference = {
  model: string;
  x?: 0 | 90 | 180 | 270;
  y?: 0 | 90 | 180 | 270;
  uvlock?: boolean;
  weight?: number;
};

// ============================================================================
// Multipart Entry
// ============================================================================

export type MultipartEntry = {
  apply: ModelReference | ModelReference[];
  when?: Record<string, string | string[]>;
};
