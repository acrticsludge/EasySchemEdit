# Subspec E — Slice e-0: Renderer Types

**Source:** `docs/specs/subs/SUBSPEC-E_RENDERING_RESOURCE_PACKS.md` §2.2 (Renderer types)
**Constraint:** Pure TypeScript, zero Three.js/React/DOM/UI imports. Type definitions only; Three.js types referenced as `any` or abstracted behind domain types.

## Goal

Create renderer type definitions: RenderChunk, WorldChunkSpatialIndex, RenderPlacement, RenderScene, CameraState. These are pure type definitions — no Three.js imports; Three.js types (`BufferGeometry`, `Object3D`) are referenced as abstract types or `any`.

## Files

| File | Action | Content |
|------|--------|---------|
| `packages/renderer/src/types.ts` | create | `RenderChunk`, `WorldChunkSpatialIndex`, `RenderPlacement`, `RenderScene`, `CameraState` type definitions |

## Types / APIs

```ts
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
```

Key rules:
- RenderChunk.key is placement-local (`placementId:localChunkKey`), NOT world-space
- WorldChunkSpatialIndex is separate: keyed by world chunk coordinate (floor division, supports negatives), used for frustum culling, cross-placement overlap/conflict queries, pick tests
- RenderPlacement.transform is kept at root, not baked into meshes
- Moving a placement does not regenerate block meshes; only the root transform changes

## Acceptance criteria

1. `RenderChunk.key` format: `placementId:localChunkKey` (e.g. `"p-42_1_0_2"`)
2. `RenderChunk.geometry` has four passes: opaque, cutout, translucent, emissive
3. `WorldChunkSpatialIndex` keyed by world chunk coordinate with floor division (correct for negatives)
4. `RenderPlacement.transform` is `Transform` from `@easyschemedit/domain`
5. `CameraState.preset` optional: 'top', 'bottom', 'front', 'back', 'left', 'right', 'isometric'
6. `packages/renderer` imports only from `@easyschemedit/domain` (Vec3d, Vec3i, Vec3Half, Transform, Bounds3i)
7. No Three.js/React/DOM/UI imports in `packages/renderer`

## Tests

No test file yet — type definitions only. Verification via typecheck. Test file `slice-e-0-types.test.ts` to be created with test harness.

## Verification

- `pnpm --filter @easyschemedit/renderer exec tsc --noEmit` exit code 0
