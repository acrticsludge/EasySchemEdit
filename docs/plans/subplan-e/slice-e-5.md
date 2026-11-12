# Subspec E — Slice e-5: Chunk Mesh Generation

**Source:** `docs/specs/subs/SUBSPEC-E_RENDERING_RESOURCE_PACKS.md` §2.2 (RenderChunk geometry passes), §4 (Face culling rules), §3.4 (Cross-placement rendering)
**Constraint:** Pure TypeScript, zero Three.js/React/DOM/UI imports. Three.js types abstracted as `any`. Imports from `@easyschemedit/domain` via relative paths only.

## Goal

Implement chunk mesh generation types: ChunkMesh, FaceCullResult, MeshPass, RenderChunkGeometry. These are pure type definitions for per-pass geometry generation with face culling.

## Files

| File | Action | Content |
|------|--------|---------|
| `packages/renderer/src/chunk-mesh.ts` | create | `ChunkMesh`, `FaceCullResult`, `MeshPass`, `RenderChunkGeometry` types |

## Types / APIs

```ts
export type MeshPass = 'opaque' | 'cutout' | 'translucent' | 'emissive';

export type ChunkMesh = {
  chunkKey: string;                       // placementId:localChunkKey
  pass: MeshPass;
  geometry: any;                          // THREE.BufferGeometry (abstracted)
  vertexCount: number;
  faceCount: number;
  dirty: boolean;
  revision: number;
};

export type FaceCullResult = {
  culled: boolean;                        // face is hidden by neighbor
  reason: 'opaque-neighbor' | 'cullface' | 'none';
};

export type RenderChunkGeometry = {
  opaque: ChunkMesh | null;
  cutout: ChunkMesh | null;
  translucent: ChunkMesh | null;
  emissive: ChunkMesh | null;
};
```

Key rules:
- Full-cube blocks: cull faces adjacent to other full-cube opaque blocks
- `cullface: "up"` → cull if block above is opaque and full-cube
- Non-cube and model-defined culling separate from full-cube adjacency
- Mirrored faces: winding reversed (CCW → CW) for correct back-face culling

## Acceptance criteria

1. `MeshPass` is 'opaque' | 'cutout' | 'translucent' | 'emissive'
2. `ChunkMesh` has chunkKey, pass, geometry, vertexCount, faceCount, dirty, revision
3. `FaceCullResult` has culled, reason ('opaque-neighbor' | 'cullface' | 'none')
4. `RenderChunkGeometry` has four passes (opaque/cutout/translucent/emissive), each nullable
5. Face culling: full-cube blocks cull faces adjacent to other full-cube opaque blocks
6. `cullface: "up"` culls if block above is opaque and full-cube
7. Mirrored faces reverse winding for correct back-face culling

## Tests

No test file yet — type definitions only. Verification via typecheck. Test file `slice-e-5-chunk-mesh.test.ts` to be created with test harness.

## Verification

- TypeScript compiles clean for `packages/renderer`
