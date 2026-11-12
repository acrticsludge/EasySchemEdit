// packages/renderer/src/types.ts
// Renderer types (SUBSPEC-E §2.2).
// Pure TypeScript, zero Three.js/React/DOM/UI imports.
// Three.js types (BufferGeometry, Object3D) are abstracted as `any`.

import type {
  Vec3d,
  Vec3i,
  Vec3Half,
  Bounds3i,
} from '../../domain/types.ts';
import type { Transform } from '../../domain/coordinates.ts';

export type RenderChunk = {
  key: string;                        // placement-local chunk identity: "placementId:localChunkKey"
  placementId: string;                // owning placement; chunk belongs to exactly one placement
  geometry: {
    opaque: any | null;               // THREE.BufferGeometry | null (abstracted)
    cutout: any | null;
    translucent: any | null;
    emissive: any | null;
  };
  revision: number;
  dirty: boolean;
};

export type WorldChunkSpatialIndex = {
  chunks: Map<string, { placementId: string; localChunkKey: string; worldChunkKey: string }>;
  lastRevision: number;
};

export type RenderPlacement = {
  placementId: string;
  root: any;                          // THREE.Object3D (abstracted)
  chunkKeys: string[];
  transform: Transform;               // kept at root, not baked into meshes
  visible: boolean;
  locked: boolean;
};

export type RenderScene = {
  placements: Map<string, RenderPlacement>;
  chunks: Map<string, RenderChunk>;
  overlays: {
    selectionBorders: any[];
    placementBorders: any[];
    originMarkers: any[];
    conflictOverlay: any[];
  };
  camera: CameraState;
};

export type CameraState = {
  position: Vec3d;
  target: Vec3d;
  fov: number;
  orthographic: boolean;
  zoom: number;
  preset?: 'top' | 'bottom' | 'front' | 'back' | 'left' | 'right' | 'isometric';
};
