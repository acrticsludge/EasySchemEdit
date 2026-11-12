# Phase 3 Audit Round 1 — Subplan-E (Rendering & Resource Packs)

**Source:** `docs/plans/subplan-e/index.md`, `docs/specs/subs/SUBSPEC-E_RENDERING_RESOURCE_PACKS.md`
**Method:** Fresh-context audit per GOAL.md §PHASE 3. Severity-ranked findings with evidence.

## Findings

### High

**ME-1: No test files exist for any subplan-e slice**

- Evidence: The traceability table maps all 30 acceptance items to test files (slice-e-0 through slice-e-14 tests), but `packages/renderer/__tests__/` does not exist. No test files have been created.
- Impact: Zero test coverage for the entire rendering layer. All 30 SUBSPEC-E acceptance criteria are unverified.
- Fix: Create test files for slices e-0 through e-14, or mark as "to verify" per GOAL.md rules.

### Medium

**ME-2: Slice e-3 (Asset loading flow) overlaps with subplan-b slice b-13 (Asset pipeline)**

- Evidence: subplan-e/index.md slice e-3 covers "Asset loading flow + IndexedDB cache integration". subplan-b/index.md slice b-13 covers "Asset Pipeline (packages/assets): client JAR from official metadata, extracts blockstates/models/textures in worker, caches in IndexedDB". Both cover asset loading from Mojang version manifest → client JAR → IndexedDB cache.
- Impact: Unclear which subplan owns asset pipeline implementation; risk of duplicate implementation.
- Fix: Clarify ownership — subplan-b handles the data pipeline (version manifest, JAR download, SHA-1 verification, extraction), subplan-e handles the renderer-side consumption (cached asset loading into renderer, texture atlas generation from cached assets).

**ME-3: Slice e-11 (Hover rendering overlay) overlaps with subplan-d slice d-10 (Hover operations)**

- Evidence: subplan-e/index.md slice e-11 covers "Hover rendering overlay: block highlight, info HUD, same-type highlight". subplan-d/index.md slice d-10 covers "Hover operations: block highlight, info HUD, placement hover, same-type". Both cover hover functionality.
- Impact: Unclear which subplan owns hover implementation; risk of duplicate implementation.
- Fix: Clarify ownership — subplan-d handles hover data resolution (block state, properties, coordinates via conflict spatial index), subplan-e handles hover rendering (wireframe outline, info HUD display, same-type highlight line buffer).

**ME-4: Slice e-12 (Resource-pack manager UI) may belong to subplan-g**

- Evidence: subplan-e/index.md slice e-12 covers "Resource-pack manager UI: enable/disable, reorder, inspect, compatibility, diagnostics". SUBSPEC-G §6.5 covers "Resource-pack manager: enable/disable, reorder, inspect, compatibility, diagnostics". The plan places UI implementation in subplan-e (renderer package), but the spec describes UI interactions that belong to subplan-g.
- Impact: Cross-subspec boundary ambiguity — UI implementation in a renderer package that should be pure type definitions per the constraint ("No Three.js/React/DOM/UI imports in pure type definitions").
- Fix: Clarify whether e-12 is type definitions only (renderer package) or UI implementation (belongs to subplan-g). If UI, move to subplan-g.

### Low

**ME-5: No test files exist — verification checklist item cannot be satisfied**

- Evidence: subplan-e/index.md verification checklist says "No claims of verification without running tests" but no tests exist.
- Impact: The plan's own verification requirement is unmet.
- Fix: Create test files or mark all as "to verify".

## Traceability: SUBSPEC-E §8.3 Acceptance → Slice → Test File (with gaps flagged)

| # | Acceptance Item | Slice | Test File | Status |
|---|-----------------|-------|-----------|--------|
| 1 | Default asset profile pinned to 1.21.11, format 75.0 | e-1 | slice-e-1-resource-pack.test.ts | NOT CREATED (ME-1) |
| 2 | Resource-pack versions immutable | e-1 | slice-e-1-resource-pack.test.ts | NOT CREATED (ME-1) |
| 3 | User resource packs override vanilla with priority order | e-4 | slice-e-4-pack-resolution.test.ts | NOT CREATED (ME-1) |
| 4 | Missing blocks/models/textures use missing-model fallback | e-2 | slice-e-2-missing-model.test.ts | NOT CREATED (ME-1) |
| 5 | Resource packs validated: zip paths, file count, decompressed size | e-13 | slice-e-13-validation.test.ts | NOT CREATED (ME-1) |
| 6 | Chunked mesh generation; no one-mesh-per-block | e-5 | slice-e-5-chunk-mesh.test.ts | NOT CREATED (ME-1) |
| 7 | Opaque, cutout, translucent, emissive geometry | e-7 | slice-e-7-render-pipeline.test.ts | NOT CREATED (ME-1) |
| 8 | Internal face culling | e-13 | slice-e-13-validation.test.ts | NOT CREATED (ME-1) |
| 9 | Rebuild only dirty render chunks | e-5, e-7 | slice-e-5-chunk-mesh.test.ts, slice-e-7-render-pipeline.test.ts | NOT CREATED (ME-1) |
| 10 | Frustum-cull render chunks | e-7 | slice-e-7-render-pipeline.test.ts | NOT CREATED (ME-1) |
| 11 | Placement transforms at object roots | e-0 | slice-e-0-types.test.ts | NOT CREATED (ME-1) |
| 12 | Selection borders, placement bounds, origins as separate render layers | e-9 | slice-e-9-overlays.test.ts | NOT CREATED (ME-1) |
| 13 | Screen-space handles/borders stable pixel widths | e-9 | slice-e-9-overlays.test.ts | NOT CREATED (ME-1) |
| 14 | Renderer state disposable and reconstructable | e-0, e-7 | slice-e-0-types.test.ts, slice-e-7-render-pipeline.test.ts | NOT CREATED (ME-1) |
| 15 | Camera: orbit, pan, zoom, presets, orthographic | e-8 | slice-e-8-camera.test.ts | NOT CREATED (ME-1) |
| 16 | Texture sampling: crisp magnification, mipmapped minification | e-6, e-13 | slice-e-6-texture-atlas.test.ts, slice-e-13-validation.test.ts | NOT CREATED (ME-1) |
| 17 | Origin markers: hot-pink, always-on-top, constant size | e-9 | slice-e-9-overlays.test.ts | NOT CREATED (ME-1) |
| 18 | Phase 0 proves renderer handles 1.21.11 models | e-5, e-6, e-7 | slice-e-5-chunk-mesh.test.ts, slice-e-6-texture-atlas.test.ts | NOT CREATED (ME-1) |
| 19 | Asset distribution decision: runtime download or manual JAR | e-3 | slice-e-3-asset-loading.test.ts | NOT CREATED (ME-1, ME-2) |
| 20 | Placement-local render chunk IDs separate from world-space | e-0 | slice-e-0-types.test.ts | NOT CREATED (ME-1) |
| 21 | Worker returns transferable raw mesh buffers | e-5 | slice-e-5-chunk-mesh.test.ts | NOT CREATED (ME-1) |
| 22 | Resource-pack inheritance, texture-variable resolution, weighted model selection | e-4 | slice-e-4-pack-resolution.test.ts | NOT CREATED (ME-1) |
| 23 | Texture animation metadata supported | e-5 | slice-e-5-chunk-mesh.test.ts | NOT CREATED (ME-1) |
| 24 | Weighted model selection deterministic | e-4 | slice-e-4-pack-resolution.test.ts | NOT CREATED (ME-1) |
| 25 | Exact face culling, chunk-boundary, transparency sorting | e-13, e-7 | slice-e-13-validation.test.ts, slice-e-7-render-pipeline.test.ts | NOT CREATED (ME-1) |
| 26 | Mirroring behavior for face winding, normals | e-13 | slice-e-13-validation.test.ts | NOT CREATED (ME-1) |
| 27 | Local mesh coordinate systems | e-0, e-5 | slice-e-0-types.test.ts, slice-e-5-chunk-mesh.test.ts | NOT CREATED (ME-1) |
| 28 | Atlas-page limits, mip-safe gutters | e-6 | slice-e-6-texture-atlas.test.ts | NOT CREATED (ME-1) |
| 29 | Visual fidelity limitations documented | e-13 | slice-e-13-validation.test.ts | NOT CREATED (ME-1) |
| 30 | Resource-pack manager: enable/disable, reorder, inspect | e-12 | slice-e-12-pack-manager.test.ts | NOT CREATED (ME-1, ME-4) |

## Verdict

Subplan-E is **Red** — no test files exist for any slice, and there are cross-subspec boundary ambiguities (ME-2, ME-3, ME-4) plus slice count/verification issues (ME-5).

## Recommended Fixes

1. Fix ME-1: Create test files for all e-slices, or mark as "to verify" pending test harness
2. Fix ME-2: Clarify asset pipeline ownership — subplan-b (data pipeline) vs subplan-e (renderer consumption)
3. Fix ME-3: Clarify hover ownership — subplan-d (data resolution) vs subplan-e (rendering)
4. Fix ME-4: Clarify resource-pack manager ownership — subplan-e (renderer types) vs subplan-g (UI implementation)
5. Fix ME-5: Create test files or mark all as "to verify"
