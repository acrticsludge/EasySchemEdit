# Subspec E — Rendering & Resource Packs: Slice Plan

**Source:** `docs/specs/subs/SUBSPEC-E_RENDERING_RESOURCE_PACKS.md` (locked decisions E1–E18)
**Constraint:** `packages/renderer` imports from `@easyschemedit/domain` only. No Three.js/React/DOM/UI imports in pure type definitions; Three.js only in renderer implementation package.

## Method

Build in thin vertical slices per the incremental-implementation skill:
- Implement → Test → Verify → Commit → Next slice
- Each slice changes one logical thing
- Project must build and existing tests pass after each increment

## Slices (one consistent list)

| Slice | Focus | Deliverable | Tests |
|-------|-------|-------------|-------|
| `slice-e-0.md` | Renderer types: RenderChunk, WorldChunkSpatialIndex, RenderPlacement, RenderScene, CameraState | `packages/renderer/src/types.ts` | Type definitions, key formats |
| `slice-e-1.md` | Resource pack types: AssetProfile, ResourcePack, BlockModel, ModelElement, ModelFace, TextureData, BlockStateDefinition, ModelReference, MultipartEntry | `packages/renderer/src/resource-pack-types.ts` | Type definitions, model dispatch |
| `slice-e-2.md` | Missing model fallback: magenta checkerboard cube + outline | `packages/renderer/src/missing-model.ts` | Fallback geometry, material, outline |
| `slice-e-3.md` | Asset loading flow + IndexedDB cache integration | `packages/renderer/src/asset-loading.ts` | Cache hit/miss, manual JAR, warning banner |
| `slice-e-4.md` | Resource-pack inheritance + texture-variable resolution + weighted model selection | `packages/renderer/src/pack-resolution.ts` | Priority merging, variable resolution, deterministic selection |
| `slice-e-5.md` | Chunk mesh generation: face culling, geometry per render pass | `packages/renderer/src/chunk-mesh.ts` | Opaque/cutout/translucent/emissive, internal face culling |
| `slice-e-6.md` | Texture atlas generation: packing, gutters, mip computation | `packages/renderer/src/texture-atlas.ts` | Atlas pages, mip-safe gutters, GPU memory budget |
| `slice-e-7.md` | Render pipeline: opaque/cutout/translucent/emissive passes, transparency sorting | `packages/renderer/src/render-pipeline.ts` | Pass ordering, translucent back-to-front sort |
| `slice-e-8.md` | Camera controls: OrbitControls wrapper, presets, orthographic toggle | `packages/renderer/src/camera.ts` | Orbit, pan, zoom, presets, perspective/orthographic |
| `slice-e-9.md` | Placement borders + origin markers + conflict overlay | `packages/renderer/src/overlays.ts` | Border styling, origin marker, conflict tint |
| `slice-e-10.md` | Chunk borders & block borders overlay | `packages/renderer/src/viewport-overlays.ts` | Chunk borders, section borders, block borders |
| `slice-e-11.md` | Hover rendering overlay: block highlight, info HUD, same-type highlight | `packages/renderer/src/hover-render.ts` | Hover target resolution, line buffer, 30Hz throttle |
| `slice-e-12.md` | Resource-pack manager UI: enable/disable, reorder, inspect, compatibility, diagnostics | `packages/renderer/src/pack-manager.ts` | Pack enable/disable, reorder, diagnostics |
| `slice-e-13.md` | Validation rules: resource pack validation, DPR cap, face culling, chunk-boundary, mirroring, local mesh coords, atlas limits | `packages/renderer/src/validation.ts` | Zip path validation, image dimension limits, culling rules |
| `slice-e-14.md` | Acceptance criteria verification | `packages/renderer/__tests__/` | All 30 SUBSPEC-E acceptance items |

## Acceptance Criteria (from SUBSPEC-E §8.3, revised)

| # | Acceptance Item | Slice | Test File |
|---|-----------------|-------|-----------|
| 1 | Default asset profile pinned to Minecraft Java 1.21.11, resource-pack format 75.0 | e-1 | slice-e-1-resource-pack.test.ts |
| 2 | Resource-pack versions immutable and versioned; no silent asset changes | e-1 | slice-e-1-resource-pack.test.ts |
| 3 | User resource packs override vanilla base pack with explicit visible priority order | e-4 | slice-e-4-pack-resolution.test.ts |
| 4 | Missing blocks/models/textures use deterministic missing-model fallback + diagnostics | e-2 | slice-e-2-missing-model.test.ts |
| 5 | Resource packs validated: zip paths, file count, decompressed size, JSON depth, image dimensions, texture limits | e-13 | slice-e-13-validation.test.ts |
| 6 | Chunked mesh generation; no one-mesh-per-block strategy | e-5 | slice-e-5-chunk-mesh.test.ts |
| 7 | Opaque, cutout, translucent, emissive geometry through appropriate material/pass paths | e-7 | slice-e-7-render-pipeline.test.ts |
| 8 | Internal face culling where visually correct; non-cube and model-defined culling separate | e-13 | slice-e-13-validation.test.ts |
| 9 | Rebuild only dirty render chunks after edits or placement changes | e-5, e-7 | slice-e-5-chunk-mesh.test.ts, slice-e-7-render-pipeline.test.ts |
| 10 | Frustum-cull render chunks; avoid uploading unchanged geometry | e-7 | slice-e-7-render-pipeline.test.ts |
| 11 | Placement transforms at object/chunk roots; moving placement doesn't regenerate block meshes | e-0 | slice-e-0-types.test.ts |
| 12 | Selection borders, placement bounds, origins, gizmos, conflict overlays as separate render layers | e-9 | slice-e-9-overlays.test.ts |
| 13 | Screen-space handles/borders have stable pixel widths and hit targets | e-9 | slice-e-9-overlays.test.ts |
| 14 | Renderer state disposable and reconstructable from document snapshot | e-0, e-7 | slice-e-0-types.test.ts, slice-e-7-render-pipeline.test.ts |
| 15 | Camera: orbit, pan, zoom, focus, fit all, reset, presets, orthographic toggle | e-8 | slice-e-8-camera.test.ts |
| 16 | Texture sampling: crisp magnification, mipmapped minification, atlas gutters, explicit color space/alpha, DPR cap | e-6, e-13 | slice-e-6-texture-atlas.test.ts, slice-e-13-validation.test.ts |
| 17 | Origin markers: hot-pink, always-on-top, constant screen-space size, tooltip with local/world coords | e-9 | slice-e-9-overlays.test.ts |
| 18 | Phase 0 proves renderer handles 1.21.11 models, custom packs, multi-region, transparent/cutout, large scenes | e-5, e-6, e-7 | slice-e-5-chunk-mesh.test.ts, slice-e-6-texture-atlas.test.ts |
| 19 | Asset distribution decision: runtime download from official sources or manual JAR fallback | e-3 | slice-e-3-asset-loading.test.ts |
| 20 | Placement-local render chunk IDs separate from world-space spatial indexing | e-0 | slice-e-0-types.test.ts |
| 21 | Worker returns transferable raw mesh buffers; Three.js objects owned by main thread | e-5 | slice-e-5-chunk-mesh.test.ts |
| 22 | Resource-pack inheritance, texture-variable resolution, pack.mcmeta, overlays, multipart conditions, weighted model selection, UV locking | e-4 | slice-e-4-pack-resolution.test.ts |
| 23 | Texture animation metadata supported | e-5 | slice-e-5-chunk-mesh.test.ts |
| 24 | Weighted model selection deterministic across chunk rebuilds | e-4 | slice-e-4-pack-resolution.test.ts |
| 25 | Exact face culling, chunk-boundary behavior, transparency sorting, cross-placement rendering | e-13, e-7 | slice-e-13-validation.test.ts, slice-e-7-render-pipeline.test.ts |
| 26 | Mirroring behavior for face winding, normals, back-face culling | e-13 | slice-e-13-validation.test.ts |
| 27 | Local mesh coordinate systems and domain transform application | e-0, e-5 | slice-e-0-types.test.ts, slice-e-5-chunk-mesh.test.ts |
| 28 | Atlas-page limits, mip-safe gutters, GPU memory budgets, disposal and context recovery | e-6 | slice-e-6-texture-atlas.test.ts |
| 29 | Visual fidelity limitations documented: lighting, ambient occlusion, unsupported model behavior | e-13 | slice-e-13-validation.test.ts |
| 30 | Resource-pack manager: enable/disable, reorder, inspect, compatibility, diagnostics | e-12 | slice-e-12-pack-manager.test.ts |

## Research gate → docs/research/subplan-e.md

Research questions E-1 through E-6 documented there.

## Traceability

All 30 SUBSPEC-E §8.3 acceptance items mapped to slices and test files above. Unmapped criteria = plan bug.

## Verification checklist

- [ ] One consistent slice list (15 slices, no duplicates)
- [ ] Traceability table maps all 30 SUBSPEC-E §8.3 items
- [ ] No claims of verification without running tests
- [ ] Change committed with descriptive message
