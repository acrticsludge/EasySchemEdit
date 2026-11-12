// packages/renderer/src/render-pipeline.ts
// Render pipeline types (SUBSPEC-E §3.4, §2.2, §4).
// Pure TypeScript, zero Three.js imports. Three.js types abstracted as `any`.

// ============================================================================
// Render Pass
// ============================================================================

export type RenderPass = 'opaque' | 'cutout' | 'translucent' | 'emissive';

// ============================================================================
// Render Pipeline Config
// ============================================================================

export type RenderPipelineConfig = {
  enableDepthPrepass: boolean;           // depth pre-pass for opaque geometry
  alphaTestThreshold: number;            // cutout alpha threshold (0-1)
  translucentSortThreshold: number;      // distance threshold for translucent sort
  emissiveBlending: 'additive' | 'none'; // emissive blending mode
  perPlacementTranslucentSort: boolean;  // sort each placement independently
};

// ============================================================================
// Chunk Render Entry
// ============================================================================

export type ChunkRenderEntry = {
  chunkKey: string;                       // placementId:localChunkKey
  placementId: string;                    // owning placement
  pass: RenderPass;
  geometry: any;                          // THREE.BufferGeometry (abstracted)
  centroidDistance: number;               // distance from camera centroid (for translucent sort)
  isVisible: boolean;                     // frustum cull result
};

// ============================================================================
// Render Pass Stats
// ============================================================================

export type RenderPassStats = {
  pass: RenderPass;
  drawCalls: number;
  vertices: number;
  chunks: number;
};

// ============================================================================
// Render Pipeline Result
// ============================================================================

export type RenderPipelineResult = {
  passes: Map<RenderPass, ChunkRenderEntry[]>;  // entries grouped by pass
  totalDrawCalls: number;
  totalVertices: number;
  translucentSorted: boolean;           // whether translucent entries were sorted
  frameTimeMs: number;                  // estimated frame time
};
