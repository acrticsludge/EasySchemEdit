// packages/renderer/src/pack-resolution.ts
// Resource-pack inheritance + texture-variable resolution + weighted model selection (SUBSPEC-E §3.2, §2.1).
// Pure TypeScript, zero Three.js/React/DOM/UI imports.
// Imports Diagnostic and resource-pack types from domain/renderer via relative paths.

import type { Diagnostic } from '../../domain/shared-types.ts';
import type {
  ResourcePackSource,
  BlockModel,
  TextureData,
  BlockStateDefinition,
} from './resource-pack-types.ts';

// ============================================================================
// Pack Layer
// ============================================================================

export type PackLayer = {
  id: string;                        // unique layer identifier
  priority: number;                  // 0 = vanilla base, higher = overrides
  source: ResourcePackSource;
  models: Map<string, BlockModel>;
  textures: Map<string, TextureData>;
  blockStates: Map<string, BlockStateDefinition>;
  active: boolean;                   // whether this layer is active in resolution
};

// ============================================================================
// Pack Resolution Result
// ============================================================================

export type PackResolutionResult = {
  resolvedModels: Map<string, BlockModel>;      // merged models from all active layers
  resolvedTextures: Map<string, TextureData>;   // merged textures from all active layers
  resolvedBlockStates: Map<string, BlockStateDefinition>; // merged block state definitions
  layerPriorities: string[];                     // layer IDs in priority order (low to high)
  diagnostics: Diagnostic[];                     // warnings/errors from resolution
};

// ============================================================================
// Texture Variable
// ============================================================================

export type TextureVariable = {
  name: string;              // e.g. "#side", "#top"
  source: string;            // texture slot name or variable reference
  resolved?: string;         // resolved texture ID after inheritance chain
};

// ============================================================================
// Weighted Model Selection
// ============================================================================

export type WeightedModelSelection = {
  modelId: string;           // selected model ID
  weight: number;            // relative weight (default 1)
  cumulativeWeight: number;  // precomputed cumulative weight for deterministic selection
};

// ============================================================================
// Pack Merge Strategy
// ============================================================================

export type PackMergeStrategy = 'override' | 'merge' | 'deep-merge';
