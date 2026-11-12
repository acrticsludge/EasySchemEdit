// packages/renderer/src/chunk-mesh.ts
// Chunk mesh generation types (SUBSPEC-E §2.2, §4).
// Pure TypeScript, zero Three.js imports. Three.js types abstracted as `any`.

// ============================================================================
// Mesh Pass
// ============================================================================

export type MeshPass = 'opaque' | 'cutout' | 'translucent' | 'emissive';

// ============================================================================
// Chunk Mesh
// ============================================================================

export type ChunkMesh = {
  chunkKey: string;                       // placementId:localChunkKey
  pass: MeshPass;
  geometry: any;                          // THREE.BufferGeometry (abstracted)
  vertexCount: number;
  faceCount: number;
  dirty: boolean;
  revision: number;
};

// ============================================================================
// Face Cull Result
// ============================================================================

export type FaceCullResult = {
  culled: boolean;                        // face is hidden by neighbor
  reason: 'opaque-neighbor' | 'cullface' | 'none';
};

// ============================================================================
// Render Chunk Geometry (four pass geometry)
// ============================================================================

export type RenderChunkGeometry = {
  opaque: ChunkMesh | null;
  cutout: ChunkMesh | null;
  translucent: ChunkMesh | null;
  emissive: ChunkMesh | null;
};
