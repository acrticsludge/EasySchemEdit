// packages/renderer/src/texture-atlas.ts
// Texture atlas generation types (SUBSPEC-E §2.2, §4).
// Pure TypeScript, zero Three.js imports.
// Imports Diagnostic from domain/shared-types.ts via relative paths.

import type { Diagnostic } from '../../domain/shared-types.ts';

// ============================================================================
// Atlas Configuration
// ============================================================================

export type AtlasConfig = {
  maxPageSize: number;        // 4096 (default) — GPU-dependent, configurable
  gutterPx: number;           // 8 (minimum gutter between textures)
  mipSafeGutter: boolean;     // scale gutters for higher mip levels
  paddingPx: number;          // internal padding within each texture
  powerOfTwo: boolean;        // force POT dimensions
};

// ============================================================================
// Atlas Entry
// ============================================================================

export type AtlasEntry = {
  textureId: string;
  x: number;                  // page-relative X
  y: number;                  // page-relative Y
  width: number;
  height: number;
  uvs: { u1: number; v1: number; u2: number; v2: number }; // normalized UV coords
  mipLevels: number;          // number of mip levels generated
};

// ============================================================================
// Atlas Page
// ============================================================================

export type AtlasPage = {
  id: string;
  width: number;              // page width in pixels (max 4096)
  height: number;             // page height in pixels (max 4096)
  entries: Map<string, AtlasEntry>;
  usedRects: { x: number; y: number; w: number; h: number }[];
  remainingSpace: number;     // bytes of unused space
};

// ============================================================================
// Texture Atlas
// ============================================================================

export type TextureAtlas = {
  id: string;
  pages: AtlasPage[];
  config: AtlasConfig;
  totalPages: number;
};

// ============================================================================
// Atlas Result
// ============================================================================

export type AtlasResult = {
  atlas: TextureAtlas;
  packedTextures: number;     // count of textures successfully packed
  unpackedTextures: string[]; // texture IDs that didn't fit
  diagnostics: Diagnostic[];  // warnings/errors from atlas generation
  memoryBytes: number;        // total GPU memory used
};
