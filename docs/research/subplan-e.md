# Research Gate: Subplan-E (Rendering & Resource Packs)

**Source:** `docs/specs/subs/SUBSPEC-E_RENDERING_RESOURCE_PACKS.md` (locked decisions E1–E18)
**Goal:** Three.js renderer, resource pack pipeline, asset extraction, chunk meshing, camera controls, overlays, hover readouts.

## Research questions

| # | Question | Primary source | Status |
|---|----------|----------------|--------|
| E-1 | Three.js version: which version supports OrbitControls, BufferGeometry, InstancedMesh | Three.js docs | Pending |
| E-2 | Texture atlas generation: canvas-based packing vs GPU texture arrays | Three.js docs, GPU specs | Pending |
| E-3 | Chunk mesh generation in worker: transferable BufferGeometry data | Three.js worker patterns | Pending |
| E-4 | Minecraft 1.21.11 model JSON format: block model rotations, multipart, weighted selection | Minecraft model spec | Pending |
| E-5 | DPR cap and high-DPI rendering performance | Three.js renderer docs | Pending |
| E-6 | WebGL context loss recovery: dispose/rebuild textures and geometries | WebGL spec | Pending |

## Decisions (to fill after research)

| # | Decision | Evidence | Rejected options |
|---|----------|----------|------------------|
| E-1 | Three.js baseline renderer | SUBSPEC-E E1 | Lodestone (rejected: candidate, not required) |
| E-2 | RenderChunk key: `placementId:localChunkKey` (placement-local, not world-space) | SUBSPEC-E E8 | World-space key (rejected: separate from spatial index) |
| E-3 | Worker returns transferable raw mesh buffers; Three.js objects owned by main thread | SUBSPEC-E E9 | Worker creates Three.js objects (rejected: main thread ownership) |
| E-4 | Missing model fallback: magenta-and-black checkerboard cube with thin outline | SUBSPEC-E E3 | Plain magenta (rejected: checkerboard + outline specified) |
| E-5 | DPR cap: 1.5 default, 2.0 maximum | SUBSPEC-E E6 | Unlimited DPR (rejected: performance risk) |
| E-6 | Overlay controls OFF by default, persisted as viewport preferences | SUBSPEC-E §3.6 | On by default (rejected: E §3.6 persistence section) |

## Open questions → DOUBTS.md

None yet.
