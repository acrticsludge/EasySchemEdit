// packages/renderer/src/index.ts
// Public API for the renderer package.

export type {
  RenderChunk,
  WorldChunkSpatialIndex,
  RenderPlacement,
  RenderScene,
  CameraState,
} from './types.ts';

export type {
  AssetProfile,
  ResourcePackSource,
  ResourcePack,
  BlockModel,
  ModelElement,
  ModelFace,
  TextureData,
  BlockStateDefinition,
  ModelReference,
  MultipartEntry,
  ModelDisplay,
} from './resource-pack-types.ts';

export type { MissingModelFallback } from './missing-model.ts';

export type {
  AssetLoadState,
  AssetLoadOptions,
  AssetLoadResult,
  AssetLoadingState,
  AnimationFrame,
} from './asset-loading.ts';

export type {
  PackLayer,
  PackResolutionResult,
  TextureVariable,
  WeightedModelSelection,
  PackMergeStrategy,
} from './pack-resolution.ts';

export type {
  MeshPass,
  ChunkMesh,
  FaceCullResult,
  RenderChunkGeometry,
} from './chunk-mesh.ts';

export type {
  TextureAtlas,
  AtlasPage,
  AtlasEntry,
  AtlasConfig,
  AtlasResult,
} from './texture-atlas.ts';

export type {
  RenderPass,
  RenderPipelineConfig,
  RenderPipelineResult,
  ChunkRenderEntry,
  RenderPassStats,
} from './render-pipeline.ts';

export type {
  CameraPreset,
  CameraControlState,
  CameraControls,
} from './camera.ts';

export type {
  HoverTarget,
  HoverOverlay,
  HoverInfoHUD,
  SameTypeHighlight,
  HoverEngine,
} from './hover.ts';

export type {
  OverlayConfig,
  OverlayLineBuffer,
  ChunkBorderOverlay,
  BlockBorderOverlay,
  ViewportOverlayState,
} from './viewport-overlays.ts';

export type {
  PlacementBorderOverlay,
  OriginMarkerOverlay,
  ConflictOverlay,
} from './overlays.ts';

export type {
  PackManagerState,
  PackEntry,
  PackCompatibility,
  PackDiagnostics,
  PackAction,
} from './pack-manager.ts';

export type {
  ValidationRule,
  ValidationResult,
  ValidationError,
  ValidationSeverity,
  ResourcePackValidation,
  ModelValidation,
  TextureValidation,
  DPRValidation,
  FaceCullingValidation,
  MirrorValidation,
  AtlasValidation,
  ValidationManager,
} from './validation.ts';

export type {
  AtlasEntryInput,
  PackAtlasOptions,
  AtlasPageRect,
  AtlasPackOutput,
  AnimationFrameDef,
  McmetaAnimation,
} from './atlas-packer.ts';

export {
  packAtlas,
  parseMcmetaAnimation,
  getFirstFrameDimensions,
  getAnimationFrameDimensions,
} from './atlas-packer.ts';

export type {
  ClassifyPassOptions,
} from './render-pass.ts';

export {
  TRANSLUCENT_BLOCKS,
  CUTOUT_BLOCKS,
  EMISSIVE_BLOCKS,
  isTranslucentBlock,
  isCutoutBlock,
  isEmissiveBlock,
  classifyPass,
} from './render-pass.ts';

export {
  hexToRgb,
  DEFAULT_PLAINS_GRASS_TINT,
  DEFAULT_PLAINS_FOLIAGE_TINT,
  BIRCH_LEAVES_TINT,
  SPRUCE_LEAVES_TINT,
  WATER_TINT,
  LILY_PAD_TINT,
  GRASS_TINTED_BLOCKS,
  FOLIAGE_TINTED_BLOCKS,
  FIXED_TINT_BLOCKS,
  getTint,
} from './tints.ts';

// Model Resolver (slice E2.1)
export type {
  AssetSource,
  ResolvedFace,
  ResolvedElement,
  ResolvedModelPart,
  ResolveModelOptions,
  RawModelRef,
  RawBlockModel,
  RawBlockStateDefinition,
} from './model-resolver.ts';

export {
  resolveBlockModels,
  normalizeResourceLocation,
  createMissingModelPart,
  computeDefaultUv,
  resolveTextureVariable,
  matchWhenCondition,
  selectWeightedModel,
  formatBlockStateCacheKey,
  clearModelCache,
  MISSING_MODEL_TEXTURE,
} from './model-resolver.ts';

// Chunk Mesher (slice E2.3)
export type {
  BlockStateData,
  BlockLookupResult,
  TextureUvInfo,
  ChunkMeshInput,
  PassGeometryBuffer,
  ChunkMeshOutput,
} from './chunk-mesher.ts';

export {
  meshChunk,
  isAirBlock,
  parseBlockData,
  rotateDirection,
  isOpaqueFullCube,
  shouldCullFace,
} from './chunk-mesher.ts';


