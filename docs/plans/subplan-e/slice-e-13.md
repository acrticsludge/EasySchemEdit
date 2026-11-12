# Subspec E — Slice e-13: Validation Rules

**Source:** `docs/specs/subs/SUBSPEC-E_RENDERING_RESOURCE_PACKS.md` §4 (Validation rules: E1-E17)
**Constraint:** Pure TypeScript, zero Three.js/React/DOM/UI imports. Imports from `@easyschemedit/domain` via relative paths only.

## Goal

Implement validation rules types: ValidationRule, ValidationResult, ValidationError, ResourcePackValidator, ModelValidator, TextureValidator, DPRValidator, FaceCullingValidator, MirrorValidator, AtlasValidator. These are pure type definitions for validation rules covering resource packs, model dispatch, texture sampling, DPR cap, texture-variable resolution, weighted model selection, UV locking, face culling, chunk-boundary behavior, mirroring, local mesh coordinates, atlas-page limits, and visual fidelity limitations.

## Files

| File | Action | Content |
|------|--------|---------|
| `packages/renderer/src/validation.ts` | create | `ValidationRule`, `ValidationResult`, `ValidationError`, `ValidationSeverity`, `ResourcePackValidation`, `ModelValidation`, `TextureValidation`, `DPRValidation`, `FaceCullingValidation`, `MirrorValidation`, `AtlasValidation`, `ValidationManager` types |

## Types / APIs

```ts
export type ValidationSeverity = 'error' | 'warning' | 'info';

export type ValidationRule = {
  id: string;
  name: string;
  description: string;
  severity: ValidationSeverity;
  category: 'resource-pack' | 'model-dispatch' | 'texture-sampling' | 'dpr' | 'texture-variable' | 'weighted-model' | 'uv-lock' | 'face-culling' | 'chunk-boundary' | 'mirroring' | 'mesh-coordinates' | 'atlas-page' | 'visual-fidelity';
};

export type ValidationResult = {
  ruleId: string;
  passed: boolean;
  severity: ValidationSeverity;
  message: string;
  details?: Record<string, unknown>;
};

export type ValidationError = {
  ruleId: string;
  message: string;
  file?: string;
  line?: number;
  column?: number;
};

export type ResourcePackValidation = {
  zipPathsValid: boolean;           // no `..` traversal, no absolute paths
  fileCountValid: boolean;          // within max file count (default 100,000)
  decompressedSizeValid: boolean;   // per-file and total size limits
  jsonDepthValid: boolean;          // max 32 levels
  imageDimensionsValid: boolean;    // max 4096x4096 per texture
  textureCountValid: boolean;       // within max texture count
  errors: ValidationError[];
};

export type ModelValidation = {
  blockModelRotationsValid: boolean;   // 1.21.11 model rotation semantics
  blockStateDispatchValid: boolean;    // 1.21.11 block-state dispatch changes
  multipartStatesValid: boolean;       // each constituent evaluated independently
  modelVariantsValid: boolean;         // weighted random selection
  errors: ValidationError[];
};

export type TextureValidation = {
  magnificationValid: boolean;   // NearestFilter
  minificationValid: boolean;    // LinearMipmapLinearFilter
  atlasGuttersValid: boolean;    // sufficient gutters/padding
  colorSpaceValid: boolean;      // explicit and consistent (sRGB/linear)
  alphaValid: boolean;           // explicit (cutout threshold, translucent blending)
  errors: ValidationError[];
};

export type DPRValidation = {
  defaultDPRCap: number;         // 1.5
  maxDPRCap: number;             // 2.0
  currentDPRCap: number;         // current dynamic cap
  dynamicallyReduced: boolean;   // reduced due to performance degradation
  errors: ValidationError[];
};

export type FaceCullingValidation = {
  fullCubeCullingValid: boolean;   // cull faces adjacent to other full-cube opaque blocks
  nonCubeCullingValid: boolean;    // cull based on cullface property
  chunkBoundaryCullingValid: boolean; // do not cull at chunk edges
  crossPlacementCullingValid: boolean; // faces at placement boundaries not culled
  transparentBlockCullingValid: boolean; // never cull adjacent to transparent blocks
  errors: ValidationError[];
};

export type MirrorValidation = {
  faceWindingReversed: boolean;   // CCW → CW when mirrored
  normalsNegated: boolean;        // normals negated on mirrored axis
  uvFlippedCorrectly: boolean;    // UVs flipped depending on uvlock and mirror axis
  errors: ValidationError[];
};

export type AtlasValidation = {
  maxPageSizeValid: boolean;      // 4096x4096
  multiplePagesValid: boolean;    // split into multiple pages if exceeded
  gutterSizeValid: boolean;       // 8px minimum at mip level 0
  memoryBudgetValid: boolean;     // within GPU memory budget (default 512 MiB)
  errors: ValidationError[];
};

export type ValidationManager = {
  rules: Map<string, ValidationRule>;
  results: Map<string, ValidationResult[]>;
  validateResourcePack(pack: any): ResourcePackValidation;
  validateModel(model: any): ModelValidation;
  validateTexture(texture: any): TextureValidation;
  validateDPR(dpr: number): DPRValidation;
  validateFaceCulling(faces: any[]): FaceCullingValidation;
  validateMirroring(mirror: any): MirrorValidation;
  validateAtlas(atlas: any): AtlasValidation;
  getAllResults(): ValidationResult[];
  getErrors(): ValidationError[];
  getRule(ruleId: string): ValidationRule | undefined;
};
```

Key rules:
- Resource packs are untrusted input; validate zip paths, file count, decompressed size, JSON depth, image dimensions, texture count
- Model dispatch: handle 1.21.11 model rotation semantics, block-state dispatch changes, multipart states, model variants
- Texture sampling: NearestFilter magnification, LinearMipmapLinearFilter minification, atlas gutters, color space, alpha
- DPR cap: default 1.5, max 2.0; dynamically reduce on performance degradation
- Texture-variable resolution: #variable through parent model chain; missing texture fallback
- Weighted model selection: default weight 1, deterministic position hash seed
- UV locking: uvlock=true locks UVs to base orientation; rotation does not rotate UVs
- Face culling: full-cube blocks cull adjacent opaque faces; non-cube uses cullface property; never cull chunk boundaries or cross-placement boundaries; never cull adjacent to transparent blocks
- Chunk-boundary: faces at chunk boundaries always generated; re-evaluate when neighbor chunk loads
- Mirroring: face winding reversed (CCW→CW), normals negated on mirrored axis, UVs may be flipped
- Local mesh coordinates: origin at chunk min corner; RenderPlacement.root applies domain Transform; mesh vertices in [0,16)
- Atlas-page limits: max 4096×4096; split into multiple pages; 8px gutters at mip level 0; GPU memory budget default 512 MiB
- Visual fidelity: no dynamic lighting, baked AO per-vertex, missing-model fallback, no shader-pack parity, emissive additive pass, static water/lava

## Acceptance criteria

1. `ValidationSeverity` is 'error' | 'warning' | 'info'
2. `ValidationRule` has id, name, description, severity, category
3. `ValidationResult` has ruleId, passed, severity, message, details?
4. `ValidationError` has ruleId, message, file?, line?, column?
5. `ResourcePackValidation` has zipPathsValid, fileCountValid, decompressedSizeValid, jsonDepthValid, imageDimensionsValid, textureCountValid, errors
6. `ModelValidation` has blockModelRotationsValid, blockStateDispatchValid, multipartStatesValid, modelVariantsValid, errors
7. `TextureValidation` has magnificationValid, minificationValid, atlasGuttersValid, colorSpaceValid, alphaValid, errors
8. `DPRValidation` has defaultDPRCap (1.5), maxDPRCap (2.0), currentDPRCap, dynamicallyReduced, errors
9. `FaceCullingValidation` has fullCubeCullingValid, nonCubeCullingValid, chunkBoundaryCullingValid, crossPlacementCullingValid, transparentBlockCullingValid, errors
10. `MirrorValidation` has faceWindingReversed, normalsNegated, uvFlippedCorrectly, errors
11. `AtlasValidation` has maxPageSizeValid, multiplePagesValid, gutterSizeValid, memoryBudgetValid, errors
12. `ValidationManager` has rules, results, validateResourcePack, validateModel, validateTexture, validateDPR, validateFaceCulling, validateMirroring, validateAtlas, getAllResults, getErrors, getRule
13. DPR default cap 1.5, max 2.0
14. JSON depth max 32 levels
15. Image dimensions max 4096×4096 per texture
16. GPU memory budget default 512 MiB
17. File count max 100,000 (default)

## Tests

No test file yet — type definitions only. Verification via typecheck. Test file `slice-e-13-validation.test.ts` to be created with test harness.

## Verification

- TypeScript compiles clean for `packages/renderer`
