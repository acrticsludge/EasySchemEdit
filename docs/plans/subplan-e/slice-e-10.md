# Subspec E — Slice e-10: Chunk Borders & Block Borders Overlay

**Source:** `docs/specs/subs/SUBSPEC-E_RENDERING_RESOURCE_PACKS.md` §3.6 (Chunk borders & block borders overlay architecture)
**Constraint:** Pure TypeScript, zero Three.js/React/DOM/UI imports. Imports from `@easyschemedit/domain` via relative paths only.

## Goal

Implement chunk borders & block borders overlay types: ChunkBorderOverlay, BlockBorderOverlay, OverlayConfig, OverlayLineBuffer. These are pure type definitions for viewport debug overlays showing chunk grid alignment and occupied voxel cells.

## Files

| File | Action | Content |
|------|--------|---------|
| `packages/renderer/src/viewport-overlays.ts` | create | `OverlayConfig`, `OverlayLineBuffer`, `ChunkBorderOverlay`, `BlockBorderOverlay`, `ViewportOverlayState` types |

## Types / APIs

```ts
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

export type OverlayLineBuffer = {
  positions: Float32Array;            // XYZ position data for line segments
  colors: Float32Array;               // RGB color data for line segments
  indices: Uint16Array;               // index buffer for line segments
  vertexCount: number;                // number of vertices in buffer
  lineCount: number;                  // number of line segments
};

export type ChunkBorderOverlay = {
  enabled: boolean;
  showSections: boolean;              // horizontal section guides every 16 on Y
  worldChunkMin: Vec3i;               // min world chunk coordinate
  worldChunkMax: Vec3i;               // max world chunk coordinate
  lineBuffer: OverlayLineBuffer;
};

export type BlockBorderOverlay = {
  enabled: boolean;
  showAir: boolean;                   // always false per spec — never draw air cells
  deduplicateSharedEdges: boolean;    // deduplicate shared edges
  depthOffset: number;                // slight depth offset to avoid z-fighting
  maxBlocks: number;                  // performance cap on blocks to render
  lineBuffer: OverlayLineBuffer;
};

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
```

Key rules:
- World-aligned Minecraft chunk grid (not internal RenderChunks)
- One Minecraft chunk covers 16×16 blocks on X/Z, full world height on Y
- Chunk index uses floor division: `chunkCoord = floor(worldCoord / 16)` (correct for negatives)
- Chunk borders distinct from internal RenderChunks (placement-local keyed `placementId:localChunkKey`)
- Block borders draw voxel-cell boundary, not mesh silhouette; no air cell borders
- Deduplicate shared edges where possible
- Separate render layer from normal block mesh geometry

## Acceptance criteria

1. `OverlayConfig` has chunkBorders, chunkSectionBorders, blockBorders, placementBorders, selectionBorders, originMarkers, conflictOverlay, lineWidth, distanceFade, maxDistance
2. `OverlayLineBuffer` has positions, colors, indices, vertexCount, lineCount
3. `ChunkBorderOverlay` has enabled, showSections, worldChunkMin, worldChunkMax, lineBuffer
4. `BlockBorderOverlay` has enabled, showAir (always false), deduplicateSharedEdges, depthOffset, maxBlocks, lineBuffer
5. `ViewportOverlayState` has config, chunkBorderOverlay, blockBorderOverlay, selectionBorderOverlay, placementBorderOverlay, originMarkerOverlay, conflictOverlay, isDirty, lastUpdateTime
6. Chunk grid uses floor division for negative coordinates
7. Chunk borders distinct from internal RenderChunks
8. Block borders never draw around air cells
9. Block borders use voxel-cell boundary, not mesh silhouette

## Tests

No test file yet — type definitions only. Verification via typecheck. Test file `slice-e-10-viewport-overlays.test.ts` to be created with test harness.

## Verification

- TypeScript compiles clean for `packages/renderer`
