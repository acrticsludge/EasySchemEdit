# Subspec E — Slice e-11: Placement Borders + Origin Markers + Conflict Overlay

**Source:** `docs/specs/subs/SUBSPEC-E_RENDERING_RESOURCE_PACKS.md` §6.2 (Placement borders), §6.3 (Origin markers), §3.6 (Conflict overlay)
**Constraint:** Pure TypeScript, zero Three.js/React/DOM/UI imports. Imports from `@easyschemedit/domain` via relative paths only.

## Goal

Implement placement borders, origin markers, and conflict overlay types: PlacementBorderOverlay, OriginMarkerOverlay, ConflictOverlay. These are pure type definitions for viewport overlays showing placement extent, origin points, and conflict regions.

## Files

| File | Action | Content |
|------|--------|---------|
| `packages/renderer/src/overlays.ts` | create | `PlacementBorderOverlay`, `OriginMarkerOverlay`, `ConflictOverlay`, `OverlayStyle`, `ViewportOverlayTypes` types |

## Types / APIs

```ts
export type OverlayStyle = {
  lineWidth: number;           // screen-space line width in pixels
  color: [number, number, number];  // RGB color (0-1)
  dashed: boolean;             // dashed line style
  dashPattern: [number, number]; // dash/gap pattern
  depthOffset: number;         // depth offset to avoid z-fighting
};

export type PlacementBorderOverlay = {
  placementId: string;
  enabled: boolean;
  selected: boolean;           // selected placement: stronger border
  locked: boolean;             // locked placement: dashed border
  hidden: boolean;             // hidden placement: no border
  worldBounds: Vec3i[];        // [min, max] world block corners
  style: OverlayStyle;
  lineBuffer: OverlayLineBuffer | null;
};

export type OriginMarkerOverlay = {
  placementId: string;
  enabled: boolean;
  position: Vec3i;             // origin point in world coordinates
  alwaysOnTop: boolean;        // marker not hidden inside model
  screenSpaceSize: number;     // constant screen-space size in pixels
  hotPink: boolean;            // hot-pink color (not conflict colors)
  tooltip: boolean;            // show tooltip with local/world coordinates
  draggable: boolean;          // locked origin visible but not draggable
  lineBuffer: OverlayLineBuffer | null;
};

export type ConflictOverlay = {
  placementId: string;
  enabled: boolean;
  conflictPositions: Vec3i[];  // positions with conflicts
  conflictStates: Map<string, 'clean' | 'same-state' | 'state-conflict'>; // position key -> conflict state
  lineBuffer: OverlayLineBuffer | null;
};
```

Key rules:
- Placement borders: thin screen-space white border for all visible placements
- Selected placement: stronger border; Locked placement: dashed border; Hidden placement: no border
- Origin markers: hot-pink, always-on-top, constant screen-space size, tooltip with coordinates
- Conflict overlay: separate render layer from normal block mesh geometry

## Acceptance criteria

1. `PlacementBorderOverlay` has placementId, enabled, selected, locked, hidden, worldBounds, style, lineBuffer
2. `OriginMarkerOverlay` has placementId, enabled, position, alwaysOnTop, screenSpaceSize, hotPink, tooltip, draggable, lineBuffer
3. `ConflictOverlay` has placementId, enabled, conflictPositions, conflictStates, lineBuffer
4. OverlayStyle has lineWidth, color, dashed, dashPattern, depthOffset
5. Selected placement borders are stronger than default
6. Locked placement borders are dashed
7. Hidden placements have no border
8. Origin markers are always-on-top with constant screen-space size
9. Origin markers use hot-pink color (not conflict colors)
10. Conflict overlay positions tracked per-placement

## Tests

No test file yet — type definitions only. Verification via typecheck. Test file `slice-e-11-overlays.test.ts` to be created with test harness.

## Verification

- TypeScript compiles clean for `packages/renderer`
