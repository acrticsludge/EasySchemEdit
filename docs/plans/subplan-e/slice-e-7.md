# Subspec E — Slice e-7: Render Pipeline

**Source:** `docs/specs/subs/SUBSPEC-E_RENDERING_RESOURCE_PACKS.md` §3.4 (Cross-placement rendering), §2.2 (RenderChunk geometry passes), §4 (Transparency sorting)
**Constraint:** Pure TypeScript, zero Three.js/React/DOM/UI imports. Three.js types abstracted as `any`. Imports from `@easyschemedit/domain` via relative paths only.

## Goal

Implement render pipeline types: RenderPass, RenderPipelineConfig, RenderPipelineResult, ChunkRenderEntry. These are pure type definitions for the four-pass render pipeline (opaque, cutout, translucent, emissive) with transparency sorting.

## Files

| File | Action | Content |
|------|--------|---------|
| `packages/renderer/src/render-pipeline.ts` | create | `RenderPass`, `RenderPipelineConfig`, `RenderPipelineResult`, `ChunkRenderEntry`, `RenderPassStats` types |

## Types / APIs

```ts
export type RenderPass = 'opaque' | 'cutout' | 'translucent' | 'emissive';

export type RenderPipelineConfig = {
  enableDepthPrepass: boolean;           // depth pre-pass for opaque geometry
  alphaTestThreshold: number;            // cutout alpha threshold (0-1)
  translucentSortThreshold: number;      // distance threshold for translucent sort
  emissiveBlending: 'additive' | 'none'; // emissive blending mode
  perPlacementTranslucentSort: boolean;  // sort each placement independently
};

export type ChunkRenderEntry = {
  chunkKey: string;
  placementId: string;
  pass: RenderPass;
  geometry: any;               // THREE.BufferGeometry (abstracted)
  centroidDistance: number;    // distance from camera centroid (for translucent sort)
  isVisible: boolean;          // frustum cull result
};

export type RenderPipelineResult = {
  passes: Map<RenderPass, ChunkRenderEntry[]>;  // entries grouped by pass
  totalDrawCalls: number;
  totalVertices: number;
  translucentSorted: boolean;        // whether translucent entries were sorted
  frameTimeMs: number;               // estimated frame time
};

export type RenderPassStats = {
  pass: RenderPass;
  drawCalls: number;
  vertices: number;
  chunks: number;
};
```

Key rules:
- Opaque pass: all placements, front-to-back (depth pre-pass)
- Cutout pass: all placements, alpha test
- Translucent pass: per-placement back-to-front sort, re-sort on camera move (throttled)
- Emissive pass: additive blending, no depth write
- Cross-placement: each placement's translucent chunks sorted independently; no global sort across placements

## Acceptance criteria

1. `RenderPass` is 'opaque' | 'cutout' | 'translucent' | 'emissive'
2. `RenderPipelineConfig` has enableDepthPrepass, alphaTestThreshold, translucentSortThreshold, emissiveBlending, perPlacementTranslucentSort
3. `ChunkRenderEntry` has chunkKey, placementId, pass, geometry, centroidDistance, isVisible
4. `RenderPipelineResult` has passes, totalDrawCalls, totalVertices, translucentSorted, frameTimeMs
5. `RenderPassStats` has pass, drawCalls, vertices, chunks
6. Opaque pass: front-to-back depth pre-pass
7. Translucent pass: per-placement back-to-front sort, independent per placement
8. Emissive pass: additive blending, no depth write
9. Frustum culling: isVisible flag on entries

## Tests

No test file yet — type definitions only. Verification via typecheck. Test file `slice-e-7-render-pipeline.test.ts` to be created with test harness.

## Verification

- TypeScript compiles clean for `packages/renderer`
