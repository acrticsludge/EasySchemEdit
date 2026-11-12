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
