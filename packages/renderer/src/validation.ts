// packages/renderer/src/validation.ts
// Validation rules (SUBSPEC-E §4, E1-E17).
// Pure TypeScript, zero Three.js imports.
// Imports Diagnostic from domain/shared-types.ts via relative paths.

import type { Diagnostic } from '../../domain/shared-types.ts';

// ============================================================================
// Validation Severity
// ============================================================================

export type ValidationSeverity = 'error' | 'warning' | 'info';

// ============================================================================
// Validation Rule
// ============================================================================

export type ValidationRule = {
  id: string;
  name: string;
  description: string;
  severity: ValidationSeverity;
  category:
    | 'resource-pack'
    | 'model-dispatch'
    | 'texture-sampling'
    | 'dpr'
    | 'texture-variable'
    | 'weighted-model'
    | 'uv-lock'
    | 'face-culling'
    | 'chunk-boundary'
    | 'mirroring'
    | 'mesh-coordinates'
    | 'atlas-page'
    | 'visual-fidelity';
};

// ============================================================================
// Validation Result
// ============================================================================

export type ValidationResult = {
  ruleId: string;
  passed: boolean;
  severity: ValidationSeverity;
  message: string;
  details?: Record<string, unknown>;
};

// ============================================================================
// Validation Error
// ============================================================================

export type ValidationError = {
  ruleId: string;
  message: string;
  file?: string;
  line?: number;
  column?: number;
};

// ============================================================================
// Resource Pack Validation
// ============================================================================

export type ResourcePackValidation = {
  zipPathsValid: boolean;           // no `..` traversal, no absolute paths
  fileCountValid: boolean;          // within max file count (default 100,000)
  decompressedSizeValid: boolean;   // per-file and total size limits
  jsonDepthValid: boolean;          // max 32 levels
  imageDimensionsValid: boolean;    // max 4096x4096 per texture
  textureCountValid: boolean;       // within max texture count
  errors: ValidationError[];
};

// ============================================================================
// Model Validation
// ============================================================================

export type ModelValidation = {
  blockModelRotationsValid: boolean;   // 1.21.11 model rotation semantics
  blockStateDispatchValid: boolean;    // 1.21.11 block-state dispatch changes
  multipartStatesValid: boolean;       // each constituent evaluated independently
  modelVariantsValid: boolean;         // weighted random selection
  errors: ValidationError[];
};

// ============================================================================
// Texture Validation
// ============================================================================

export type TextureValidation = {
  magnificationValid: boolean;   // NearestFilter
  minificationValid: boolean;    // LinearMipmapLinearFilter
  atlasGuttersValid: boolean;    // sufficient gutters/padding
  colorSpaceValid: boolean;      // explicit and consistent (sRGB/linear)
  alphaValid: boolean;           // explicit (cutout threshold, translucent blending)
  errors: ValidationError[];
};

// ============================================================================
// DPR Validation
// ============================================================================

export type DPRValidation = {
  defaultDPRCap: number;         // 1.5
  maxDPRCap: number;             // 2.0
  currentDPRCap: number;         // current dynamic cap
  dynamicallyReduced: boolean;   // reduced due to performance degradation
  errors: ValidationError[];
};

// ============================================================================
// Face Culling Validation
// ============================================================================

export type FaceCullingValidation = {
  fullCubeCullingValid: boolean;   // cull faces adjacent to other full-cube opaque blocks
  nonCubeCullingValid: boolean;    // cull based on cullface property
  chunkBoundaryCullingValid: boolean; // do not cull at chunk edges
  crossPlacementCullingValid: boolean; // faces at placement boundaries not culled
  transparentBlockCullingValid: boolean; // never cull adjacent to transparent blocks
  errors: ValidationError[];
};

// ============================================================================
// Mirroring Validation
// ============================================================================

export type MirrorValidation = {
  faceWindingReversed: boolean;   // CCW → CW when mirrored
  normalsNegated: boolean;        // normals negated on mirrored axis
  uvFlippedCorrectly: boolean;    // UVs flipped depending on uvlock and mirror axis
  errors: ValidationError[];
};

// ============================================================================
// Atlas Validation
// ============================================================================

export type AtlasValidation = {
  maxPageSizeValid: boolean;      // 4096x4096
  multiplePagesValid: boolean;    // split into multiple pages if exceeded
  gutterSizeValid: boolean;       // 8px minimum at mip level 0
  memoryBudgetValid: boolean;     // within GPU memory budget (default 512 MiB)
  errors: ValidationError[];
};

// ============================================================================
// Validation Manager
// ============================================================================

export type ValidationManager = {
  rules: Map<string, ValidationRule>;
  results: Map<string, ValidationResult[]>;
  validateResourcePack: (pack: unknown) => ResourcePackValidation;
  validateModel: (model: unknown) => ModelValidation;
  validateTexture: (texture: unknown) => TextureValidation;
  validateDPR: (dpr: number) => DPRValidation;
  validateFaceCulling: (faces: unknown[]) => FaceCullingValidation;
  validateMirroring: (mirror: unknown) => MirrorValidation;
  validateAtlas: (atlas: unknown) => AtlasValidation;
  getAllResults: () => ValidationResult[];
  getErrors: () => ValidationError[];
  getRule: (ruleId: string) => ValidationRule | undefined;
};
