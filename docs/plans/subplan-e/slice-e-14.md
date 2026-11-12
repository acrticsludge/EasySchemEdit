# Subspec E — Slice e-14: Acceptance Criteria Verification

**Source:** `docs/specs/subs/SUBSPEC-E_RENDERING_RESOURCE_PACKS.md` §8.3 (Acceptance criteria)
**Constraint:** Pure TypeScript, zero Three.js/React/DOM/UI imports. Tests run under tsx in Node.

## Goal

Implement acceptance tests for all subplan-e slices, verifying every acceptance criterion from SUBSPEC-E §8.3 (30 items).

## Files

| File | Action | Content |
|------|--------|---------|
| `packages/renderer/__tests__/slice-e-14-acceptance.test.ts` | create | Acceptance test suite for all subplan-e slices |

## Acceptance Criteria to Test (all 30 from SUBSPEC-E §8.3)

| # | Criterion | Slice |
|---|-----------|-------|
| 1 | Default asset profile pinned to Minecraft Java 1.21.11, resource-pack format 75.0 | e-1 |
| 2 | Resource-pack versions immutable and versioned; no silent asset changes | e-1 |
| 3 | User resource packs override vanilla base pack with explicit visible priority order | e-4 |
| 4 | Missing blocks/models/textures use deterministic missing-model fallback + diagnostics | e-2 |
| 5 | Resource packs validated: zip paths, file count, decompressed size, JSON depth, image dimensions, texture limits | e-13 |
| 6 | Chunked mesh generation; no one-mesh-per-block strategy | e-5 |
| 7 | Opaque, cutout, translucent, emissive geometry through appropriate material/pass paths | e-7 |
| 8 | Internal face culling where visually correct; non-cube and model-defined culling separate from full-cube adjacency | e-13 |
| 9 | Rebuild only dirty render chunks after edits or placement changes | e-5 |
| 10 | Frustum-cull render chunks; avoid uploading unchanged geometry | e-7 |
| 11 | Placement transforms at object/chunk roots; moving placement doesn't regenerate block meshes | e-0 |
| 12 | Selection borders, placement bounds, origins, gizmos, conflict overlays as separate render layers | e-11 |
| 13 | Screen-space handles/borders have stable pixel widths and hit targets | e-11 |
| 14 | Renderer state disposable and reconstructable from document snapshot | e-0, e-7 |
| 15 | Camera: orbit, pan, zoom, focus, fit all, reset, presets, orthographic toggle, grid/axes/ground plane | e-8 |
| 16 | Texture sampling: crisp magnification, mipmapped minification, atlas gutters, explicit color space/alpha, DPR cap | e-6, e-13 |
| 17 | Origin markers: hot-pink, always-on-top, constant screen-space size, tooltip with local/world coords | e-11 |
| 18 | Phase 0 proves renderer handles 1.21.11 models, custom packs, multi-region, transparent/cutout, large scenes | e-5, e-6 |
| 19 | Asset distribution decision: runtime download from official sources or manual JAR fallback | e-3 |
| 20 | Placement-local render chunk IDs separate from world-space spatial indexing | e-0 |
| 21 | Worker returns transferable raw mesh buffers; Three.js objects owned by main thread | e-5 |
| 22 | Resource-pack inheritance, texture-variable resolution, pack.mcmeta, overlays, multipart conditions, weighted model selection, UV locking | e-4 |
| 23 | Texture animation metadata supported | e-5 |
| 24 | Weighted model selection deterministic across chunk rebuilds | e-4 |
| 25 | Exact face culling, chunk-boundary behavior, transparency sorting, cross-placement rendering | e-13, e-7 |
| 26 | Mirroring behavior for face winding, normals, back-face culling | e-13 |
| 27 | Local mesh coordinate systems and domain transform application | e-0, e-5 |
| 28 | Atlas-page limits, mip-safe gutters, GPU memory budgets, disposal and context recovery | e-6 |
| 29 | Visual fidelity limitations documented: lighting, ambient occlusion, unsupported model behavior | e-13 |
| 30 | Resource-pack manager: enable/disable, reorder, inspect, compatibility, diagnostics | e-12 |

## Tests

Create `packages/renderer/__tests__/slice-e-14-acceptance.test.ts` with test cases for each criterion.

## Verification

- `npx tsx packages/renderer/__tests__/slice-e-14-acceptance.test.ts` exit code 0
