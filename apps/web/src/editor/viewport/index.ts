// apps/web/src/editor/viewport/index.ts
// Public API for the Three.js chunked viewport module (Slice E3.2).

export {
  buildBufferGeometryFromPass,
  ChunkSceneManager,
  type ChunkSceneStats,
  type RebuildPlacementOptions,
  type SyncProjectOptions,
} from './chunk-mesh-builder.ts';

export {
  raycastVoxels,
  createProjectBlockLookup,
  type VoxelHit,
  type BlockLookupFn,
} from './voxel-raycast.ts';

export {
  ViewportCameraController,
  type CameraMode,
  type CameraPreset,
  type CameraStateSnapshot,
} from './camera-controller.ts';

export {
  buildPlacementBoundsGroup,
  buildOriginMarkersGroup,
  buildSelectionBoxMesh,
  buildGridBordersGroup,
  buildConflictOverlayGroup,
  type GridBordersPrefs,
} from './overlays-builder.ts';

export {
  ViewportCanvas,
  type ViewportCanvasProps,
  type GhostPreviewSpec,
} from './ViewportCanvas.tsx';
