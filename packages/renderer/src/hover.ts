// packages/renderer/src/hover.ts
// Hover rendering overlay types (SUBSPEC-E §3.7).
// Pure TypeScript, zero Three.js imports.
// Imports BlockStateId, Vec3i from domain/types.ts via relative paths.

import type { Vec3i, BlockStateId } from '../../domain/types.ts';

// ============================================================================
// Hover Target
// ============================================================================

export type HoverTarget = {
  position: Vec3i;            // world block coordinate
  placementId: string;        // owning placement
  localPosition: Vec3i;       // local block coordinate within placement
  blockState: BlockStateId;   // block state at hover position
  isAir: boolean;             // true if air (no hover target)
};

// ============================================================================
// Hover Overlay
// ============================================================================

export type HoverOverlay = {
  highlightedPosition: Vec3i | null;  // single hovered block cell
  lineBuffer: any[];              // wireframe line buffer (one cell = 12 lines)
  isDirty: boolean;               // needs regeneration when hover target changes
  renderPriority: number;         // lower priority than selection borders
};

// ============================================================================
// Hover Info HUD
// ============================================================================

export type HoverInfoHUD = {
  worldPosition: Vec3i;
  blockStateId: string;
  properties: Record<string, string>;
  owningPlacementId: string;
  contributors: Array<{ placementId: string; blockState: BlockStateId }>; // for overlapping placements
};

// ============================================================================
// Same-Type Highlight
// ============================================================================

export type SameTypeHighlight = {
  enabled: boolean;
  targetState: BlockStateId | null;
  highlightedPositions: Vec3i[];  // all blocks matching target state
  dimmed: boolean;                // dimmer line buffer than primary hover
};

// ============================================================================
// Hover Engine
// ============================================================================

export type HoverEngine = {
  hoverTarget: HoverTarget | null;
  overlay: HoverOverlay;
  infoHUD: HoverInfoHUD | null;
  sameTypeHighlight: SameTypeHighlight;
  setHoverTarget: (target: HoverTarget | null) => void;
  updateOverlay: (target: HoverTarget | null) => void;
  updateInfoHUD: (target: HoverTarget | null) => void;
  toggleSameTypeHighlight: (enabled: boolean) => void;
  clear: () => void;
};
