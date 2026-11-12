// packages/renderer/src/viewport-overlays.ts
// Chunk borders & block borders overlay types (SUBSPEC-E §3.6).
// Pure TypeScript, zero Three.js imports.
// Imports Vec3i from domain/types.ts via relative paths.

import type { Vec3i } from '../../domain/types.ts';

// ============================================================================
// Overlay Configuration
// ============================================================================

export type OverlayConfig = {
  chunkBorders: boolean;              // show world-aligned chunk column boundaries
  chunkSectionBorders: boolean;       // show horizontal section guides every 16 on Y
  blockBorders: boolean;              // show wireframe around occupied voxel cells
  placementBorders: boolean;          // show placement extent borders
  selectionBorders: boolean;          // show selection cuboid borders
  originMarkers: boolean;             // show origin markers
  conflictOverlay: boolean;           // show conflict overlay
  lineWidth: number;                  // screen-space line width in pixels
  distanceFade: boolean;              // fade borders at distance
  maxDistance: number;                // max distance for overlay rendering
};

// ============================================================================
// Overlay Line Buffer
// ============================================================================

export type OverlayLineBuffer = {
  positions: Float32Array;            // XYZ position data for line segments
  colors: Float32Array;               // RGB color data for line segments
  indices: Uint16Array;               // index buffer for line segments
  vertexCount: number;                // number of vertices in buffer
  lineCount: number;                  // number of line segments
};

// ============================================================================
// Chunk Border Overlay
// ============================================================================

export type ChunkBorderOverlay = {
  enabled: boolean;
  showSections: boolean;              // horizontal section guides every 16 on Y
  worldChunkMin: Vec3i;               // min world chunk coordinate
  worldChunkMax: Vec3i;               // max world chunk coordinate
  lineBuffer: OverlayLineBuffer;
};

// ============================================================================
// Block Border Overlay
// ============================================================================

export type BlockBorderOverlay = {
  enabled: boolean;
  showAir: boolean;                   // always false per spec — never draw air cells
  deduplicateSharedEdges: boolean;    // deduplicate shared edges
  depthOffset: number;                // slight depth offset to avoid z-fighting
  maxBlocks: number;                  // performance cap on blocks to render
  lineBuffer: OverlayLineBuffer;
};

// ============================================================================
// Viewport Overlay State
// ============================================================================

export type ViewportOverlayState = {
  config: OverlayConfig;
  chunkBorderOverlay: ChunkBorderOverlay;
  blockBorderOverlay: BlockBorderOverlay;
  selectionBorderOverlay: OverlayLineBuffer | null;
  placementBorderOverlay: OverlayLineBuffer | null;
  originMarkerOverlay: OverlayLineBuffer | null;
  conflictOverlay: OverlayLineBuffer | null;
  isDirty: boolean;                   // needs regeneration
  lastUpdateTime: number;             // last regeneration timestamp
};
