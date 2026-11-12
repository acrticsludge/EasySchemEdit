// packages/renderer/src/overlays.ts
// Placement borders, origin markers, conflict overlay types (SUBSPEC-E §6.2, §6.3, §3.6).
// Pure TypeScript, zero Three.js imports.
// Imports Vec3i from domain/types.ts via relative paths.

import type { Vec3i, BlockStateId } from '../../domain/types.ts';
import type { OverlayLineBuffer } from './viewport-overlays.ts';

// ============================================================================
// Overlay Style
// ============================================================================

export type OverlayStyle = {
  lineWidth: number;                 // screen-space line width in pixels
  color: [number, number, number];   // RGB color (0-1)
  dashed: boolean;                   // dashed line style
  dashPattern: [number, number];     // dash/gap pattern
  depthOffset: number;               // depth offset to avoid z-fighting
};

// ============================================================================
// Placement Border Overlay
// ============================================================================

export type PlacementBorderOverlay = {
  placementId: string;
  enabled: boolean;                  // show border for this placement
  selected: boolean;                 // selected placement: stronger border
  locked: boolean;                   // locked placement: dashed border
  hidden: boolean;                   // hidden placement: no border
  worldBounds: Vec3i[];              // [min, max] world block corners
  style: OverlayStyle;
  lineBuffer: OverlayLineBuffer | null;
};

// ============================================================================
// Origin Marker Overlay
// ============================================================================

export type OriginMarkerOverlay = {
  placementId: string;
  enabled: boolean;
  position: Vec3i;                 // origin point in world coordinates
  alwaysOnTop: boolean;            // marker not hidden inside model
  screenSpaceSize: number;         // constant screen-space size in pixels
  hotPink: boolean;                // hot-pink color (not conflict colors)
  tooltip: boolean;                // show tooltip with local/world coordinates
  draggable: boolean;              // locked origin visible but not draggable
  lineBuffer: OverlayLineBuffer | null;
};

// ============================================================================
// Conflict Overlay
// ============================================================================

export type ConflictOverlay = {
  placementId: string;
  enabled: boolean;
  conflictPositions: Vec3i[];      // positions with conflicts
  conflictStates: Map<string, 'clean' | 'same-state' | 'state-conflict'>; // position key -> conflict state
  lineBuffer: OverlayLineBuffer | null;
};

// ============================================================================
// Viewport Overlay Types (re-exported from viewport-overlays.ts)
// ============================================================================

export type {
  OverlayConfig,
  OverlayLineBuffer,
  ChunkBorderOverlay,
  BlockBorderOverlay,
  ViewportOverlayState,
} from './viewport-overlays.ts';
