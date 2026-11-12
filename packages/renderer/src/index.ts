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
