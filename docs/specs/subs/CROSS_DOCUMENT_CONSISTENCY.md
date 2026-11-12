# Cross-Document Consistency, Change Log & Risk Register

## 1. Cross-Document Dependency Matrix

| Responsibility | Owning Package | Defining Subspec | Consuming Subspecs |
|---|---|---|---|
| Coordinate math (center-based, doubled-integer) | `packages/domain` | A (slice 4, slice 7) | B, C, D, E, F, G |
| Block-state identity (BlockStateId, canonicalization, block-state strings) | `packages/domain` | A (slice 5, slice 5.5) | B, D, E |
| Shared types + error-code registry | `packages/domain` | A (slice 0.5) | B, C, D, E, F, G |
| NBT AST (12 tag kinds, bigint for longs) | `packages/domain` | A (slice 1) | B, C, D |
| Chunk storage (ChunkedVoxelVolume, VoxelChunk, CHUNK_SIZE=16, max 4096 palette/chunk) | `packages/domain` | A (slice 2) | B, C, D, E |
| Volume API (getBlock/setBlock/fill/iterateNonAir) | `packages/domain` | A (slice 2.5) | D |
| Negative-coordinate chunk mapping | `packages/domain` | A (slice 3) | D, E |
| Transform (Transform, rotationY, mirror, origin integer-only, rotateAboutPoint) | `packages/domain` | A (slice 4) | B, D, E |
| Block-state transform registry (bijective table, chirality) | `packages/domain` | A (slice 6, slice 6.5) | B, D |
| Air-like classification | `packages/domain` | A | B, D |
| Project model (Project, Placement, ImportGroup, Selection) | `packages/domain` | A (slice 8) | B, C, D, E, F, G |
| Effective-block resolver | `packages/domain` | A (slice 8.5) | D |
| Ancillary transforms | `packages/domain` | A (slice 8.6) | D |
| Bounds/vector helpers | `packages/domain` | A (slice 8.7) | D |
| Conflict spatial index | `packages/domain` + `packages/commands` | D | E, G |
| Format detection | `packages/formats` | B | C, D |
| Sponge v3 adapter | `packages/formats` | B | C, D |
| Litematica adapter | `packages/formats` | B | C, D |
| Binary chunk codec (VOOX magic, single-palette omission) | `packages/domain` | A (slice 9) | B, C |
| NBT binary codec (DataView big-endian, modified UTF-8) | `packages/formats` | B | A, C, D |
| .vxproj archive | `packages/project-store` | C | B, F |
| IndexedDB schema | `packages/project-store` | C | A, B, D, E, F |
| Migration framework | `packages/project-schema` | C | A, B |
| History/undo (CommandRecord, DocumentDelta) | `packages/commands` | C | D, F |
| Region operations | `packages/commands` | D | F, G |
| Bake/composite | `packages/commands` | D | F, G |
| Conflict detection | `packages/commands` | D | E, G |
|| Renderer adapter | `packages/renderer` | E | G |
|| Viewport chunk & block border overlays | `packages/renderer` | E | G |
|| Hover block highlight & info HUD rendering | `packages/renderer` | E | G |
|| Region operations (incl. stack, paste refinements) | `packages/commands` | D | F, G |
|| Verify & material report | `packages/commands` | D | G |
|| Conflict detection | `packages/commands` | D | E, G |
| Asset extraction pipeline | `packages/asset-pipeline` | B, E | G |
| MCP companion | `apps/mcp-companion` | F | G |
| Pairing token / security | `apps/mcp-companion` | F | G |
| UI layout | `apps/web` (React island) | G | E, F |
| Keyboard shortcuts | `apps/web` | G | D, F |
| Deployment config | `apps/web` + CI | H | — |
| Performance benchmarks | `packages/` + CI | H | A, B, C, D, E |

---

## 2. Cross-Document Consistency Audit

| Consistency Requirement | Status | Notes |
|---|---|---|
| One coordinate and transform implementation | ✅ | SUBSPEC-A slice 4/7 is authoritative (center-based doubled-integer mapping: centerHalf = 2*cell + [1,1,1]; worldCenterHalf = T + R(centerHalf − O); worldBlock = (worldCenterHalf − [1,1,1]) / 2; valid iff all worldCenterHalf components odd). Rotation matrix defined explicitly (90°: (x,y,z)→(z,y,-x)); mirror applied before rotation. Counterexample translation [10,64,10] / origin [0.5,0,0.5] / local block [0,0,0] correctly classified off-grid. Origin must be integer-only (even half-block components) for placement transforms; rotateAboutPoint() recomputes integer translation for in-place rotation. D, E, F reference A, do not duplicate formulas. |
| One canonical block-state identity system | ✅ | SUBSPEC-A slices 5/5.5; B, D, E consume BlockStateId. Rotation/mirror table (slice 6) verified bijective against the slice 4 R matrix; 90°⁻¹=270°, mirror²=identity. Stair shape/hinge unchanged by rotation; only mirror swaps left/right. Block-state strings parse/format with canonical ordering (slice 5.5). |
| One NBT AST and binary codec | ✅ | SUBSPEC-A slice 1 (AST, 12 tag kinds), SUBSPEC-A slice 10 (binary codec: DataView big-endian, modified UTF-8 with null as C0 80, supplementary chars as surrogate pairs). |
| One voxel chunk serialization contract | ✅ | SUBSPEC-A slice 9 (binary chunk format: VOOX magic 0x564F4F58, single-palette-entry index omission flag); B, C consume. |
| One project revision and transaction model | ✅ | SUBSPEC-A slice 8 (13 invariants), SUBSPEC-C 2.1 (history cursor, crash-safe commits). |
| One command/query API for UI and MCP | ✅ | SUBSPEC-D defines commands; F specifies MCP tools call the same API (no MCP-only implementations). |
| One definitive conflict classification | ✅ | SUBSPEC-D 2.5 (clean, same-state, state-conflict); no fourth status. |
| One overlap precedence policy | ✅ | Top-wins (default) and bottom-wins only; newest/oldest removed. |
| One erase / tombstone semantics for New Result Placement | ✅ | SUBSPEC-A slice 8 adds `Placement.eraseTombstones`; SUBSPEC-A slice 8.5 resolver treats tombstones as erase contributions; SUBSPEC-D 4.3 records tombstones on `overrideAir` and preserves them through save/reopen/export. |
| One ancillary-data transformation policy | ✅ | SUBSPEC-A 4.4 (block entity/entity/biome/tick transforms); D 5.8 (per-operation behavior). |
| One project archive structure | ✅ | SUBSPEC-A slice 13 (deterministic ordering: sorted paths, zero timestamps, fixed compression level; preserve unknown entries; verify manifest.checksums both directions; absolute caps replacing 100:1 ratio; ratio check only when compressed > 64 KiB). SUBSPEC-C 2.5 agrees: `manifest.checksums` is the single checksum source; no separate `checksums.json`. |
| One asset-versioning system | ✅ | SUBSPEC-B 9 (1.21.11 pinned; resource path corrected to `assets/minecraft/blockstates`; client JAR SHA-1 verified against `downloads.client.sha1` / pinned expected SHA-1); E 2.1 (AssetProfile). |
| One idempotency record location and atomic commit | ✅ | SUBSPEC-C 2.3.8 (idempotency records in the same IndexedDB database as the document, browser-live and headless, committed atomically with the revision); SUBSPEC-F F11 + section 3.3. |
|| One render identity vs world spatial index | ✅ | SUBSPEC-E 2.2: `RenderChunk.key` is placement-local (`placementId:localChunkKey`); `WorldChunkSpatialIndex` is the separate world-space index (floor division, negatives). |
|| Minecraft chunks vs internal RenderChunks | ✅ | SUBSPEC-E 3.6: Minecraft chunks are world-aligned 16×16 on X/Z with floor-division (block -1 → chunk -1); internal RenderChunks are placement-local (`placementId:localChunkKey`). Border overlays use the world-aligned Minecraft grid, never RenderChunk boundaries. |
| One deployment architecture | ✅ | SUBSPEC-H 4.3 (Astro static + Cloudflare Workers Static Assets, zero-cost); no Cloudflare Pages reference; Wrangler config at `apps/web/wrangler.toml`, entry `apps/web/src/worker.ts`. |

---

## 3. Change Log

### SUBSPEC-A (Domain Model)
- Redesigned Transform: integer translation, Vec3Half origin, mirror-before-rotation.
- Added NBT AST (all 11 tag types, bigint for longs).
- Added typed ancillary data (BlockEntityRecord, EntityRecord, BiomeVolume, PendingTickRecord).
- Added chunk architecture (indexing formula, floor division, palette validation, air vs air-like).
- Added worker ownership (immutable snapshots, copy-on-write, buffer ownership).
- Added serialization (binary chunk codec, NBT binary codec, checksums, compression, deterministic archive).
- Added safe-integer validation, project invariants (10), resource-pack vs registry responsibilities.
- Revised slice plan (22 slices): center-based rotation math (slice 4/7), integer-only origin with `rotateAboutPoint` helper, stair/hinge chirality fix (rotation unchanged, mirror swaps), `VOOX` magic bytes, DataView big-endian + modified UTF-8 codec, absolute decompression caps replacing 100:1 ratio, explicit cancel message + progress result type, mixed-type list rejection, zero-size placement support, deterministic archive bytes, 13 invariants, 17 acceptance criteria.
- New slices: 0.5 (shared types + error-code registry), 2.5 (Volume API), 5.5 (block-state strings), 6.5 (more orientation handlers), 8.5 (effective-block resolver), 8.6 (ancillary transforms), 8.7 (bounds/vector helpers).

### SUBSPEC-B (File Formats)
- Fixed format detection: decompress before NBT inspect; misleading extension = warning not rejection.
- Added exact Litematic packed BlockStates algorithm (bits per entry, cross-word, signed long, palette validation).
- Added negative Size normalization (signed-axis mapping, index reversal, block entity/entity/tick transforms).
- Resolved origin conflict: Sponge Offset = -origin_world exact integer; no rounding.
- Added multi-region export eligibility checker (deterministic, 5 rules).
- Strengthened NBT safety: 9 limits + streaming/incremental parsing.
- Fixed schema inconsistencies: volume BigInt, normalizedImport, ExportValidationResult, separate overlap counts.
- Made outer-air trimming configurable (`trimOuterAir` defaults true; `false` is not an error); added oversized axis auto-split; lossy export confirmation names exact data lost.
- Added diagnostics for unsupported entities/biomes/ticks.
- Completed asset extraction pipeline (JAR from official metadata, worker extraction, cache, manual fallback, Phase 0 CORS).
- Defined export semantics (placement bakes, import group preserves/flattens, composite bakes, hidden inclusion).
- Added immutable snapshots and memory management.
- Expanded fixtures (16-column matrix).
- Added cross-document dependency check.
- Added first-run asset load flow (§9.1): auto-download from Mojang manifest or manual `1.21.11.jar` import; drag-drop/file-picker zone; how-to with no third-party links; auto-download failure surfaces manual JAR zone (`ASSET_DOWNLOAD_FAILED`).
- Expanded asset pipeline (§9.2): progress bar, cancel, SHA-1 verification (`downloads.client.sha1` auto-download / pinned expected SHA-1 manual JAR), size/zip-safety limits; client JAR only for base profile; resource-pack zips override-only; corrupt/wrong-version rejection (`ASSET_CORRUPT_JAR`, `ASSET_WRONG_VERSION`); cache verified on read (`ASSET_CACHE_CORRUPT`).
- Made outer-air trimming configurable (`trimOuterAir` defaults true; `false` is not an error); added oversized axis auto-split; lossy export confirmation names exact data lost.
- Added diagnostic codes: `ASSET_DOWNLOAD_FAILED`, `ASSET_CORRUPT_JAR`, `ASSET_WRONG_VERSION`, `ASSET_DOWNLOAD_CANCELLED`, `ASSET_CACHE_CORRUPT`.

### SUBSPEC-C (Project & Persistence)
- Fixed undo/redo: monotonically increasing revisions, separate history cursor.
- Defined complete IndexedDB schema (8 stores, compound keys, indexes, chunk reference counting).
- Added crash-safe commit protocol (temp writes, verify, atomic update).
- Aligned .vxproj with SUBSPEC-A binary chunk codec and SUBSPEC-B NBT codec.
- Defined endianness, checksums, compression, ZIP64 streaming, archive validation, deterministic serialization.
- Removed redundant checksums; added path traversal, duplicate entry, decompression bomb protection.
- Made migrations type-safe (version-specific schemas, deterministic chains, validation, rollback, pre-migration backups).
- Resolved autosave races (concurrent saves, newer edits during save).
- Defined recovery snapshot triggers, retention, cleanup, journal replay.
- Distinguished project storage estimates from browser-origin quota estimates.
- Added persistent storage requests, denial handling, quota headroom.
- Implemented chunk sharing/copy-on-write for project duplication.
- Documented no automatic cloud sync; .vxproj is cross-device transfer.

### SUBSPEC-D (Editing Engine)
- Resolved New Result Placement deletion: air non-owning but can erase via overrideAir flag.
- Aligned all transforms with SUBSPEC-A coordinate contract (no duplicate formulas).
- Defined effective-composite vs source-placement copy behavior.
- Defined cut semantics (lower overlapping placements become visible).
- Added clipboard shared lifecycle and serialization contract.
- Fixed BlockStateMatcher: property matching includes expected values.
- Completed WallsOperation with explicit block pattern/state and boundary semantics.
- Defined block entity/entity/biome/tick/unknown-data behavior for every region operation.
- Defined replace behavior for incompatible block entities.
- Defined MoveRegion overlap semantics for multi-placement selections.
- Added candidate-cell, runtime, memory budgets.
- Specified group transforms, pivots, ancillary-data transformations.
- Defined deterministic conflict-index storage, incremental invalidation, negative-coordinate indexing.
- Specified bake merge rules for competing block entities, entities, biomes, pending ticks.
- Added paste refinements: pasteAtOriginalPosition, skipAir, previewOnly, rotationY/mirror at paste time (independent of overrideAir).
- Added StackOperation: repeat selected content N times with offset, ignoreAir, shiftSelection; single undo transaction.
- Added selection operations: expand/contract/shift selection bounds, select by type, magic/connected select; locked placements block selection.
- Added ReplaceOperation.preserveProperties: keep compatible block properties when swapping block ID.
- Added VerifyOperation & MaterialReport: compare placed blocks against source (missing/extra/wrong-state), per-type counts with exportable CSV.
- Added hover operations: block hover highlight, block info HUD (name, state, coordinates, contributors), placement hover, same-type highlight; edge cases (air, chunk boundaries, overlaps, transparent blocks, large selections, WebGL context loss); session state only.
- Removed ambiguous sparse-export promise.
- Ensured preview and commit use same immutable snapshot.

### SUBSPEC-E (Rendering & Resource Packs)
- Separated placement-local render chunk IDs from world-space spatial indexing.
- Worker returns transferable raw mesh buffers; Three.js objects owned by main thread.
- Specified resource-pack inheritance, texture-variable resolution, pack.mcmeta, overlays, multipart conditions, weighted model selection, UV locking.
- Added texture animation metadata.
- Made weighted model selection deterministic across chunk rebuilds.
- Specified exact face culling, chunk-boundary behavior, transparency sorting, cross-placement rendering.
- Defined mirroring behavior for face winding, normals, back-face culling.
- Defined local mesh coordinate systems and domain transform application.
- Added atlas-page limits, mip-safe gutters, GPU memory budgets, disposal, context recovery.
- Defined visual fidelity limitations (lighting, ambient occlusion, unsupported model behavior).
- Completed resource-pack manager (enable/disable, reorder, inspect, compatibility, diagnostics).
- Expanded fixtures (animated textures, redstone, multipart, non-cube, transformed directional states).
- Added viewport chunk borders & block borders overlay (View → Overlays): world-aligned Minecraft 16×16 grid on X/Z with floor-division for negative coordinates, block voxel-cell borders (not mesh silhouettes, not air), batched line geometry, worker generation, frustum culling + distance-based detail, independent toggles persisted as viewport preferences (no document/revision/export change).
- Added hover rendering overlay layer: single-block wireframe highlight resolved through placement inverse transform, batched line buffer, 30Hz throttle, no render-through-opaque; hover info HUD data (coordinates, state, properties, placement ID, contributors); optional same-type highlight buffer.
- Added missing-asset behavior (§2.3, §3.1, §7): until base assets load, blocks render with missing-model fallback + persistent warning banner with "Load assets" action; schematics still import/edit; asset load status in Assets tab and status bar.

### SUBSPEC-F (MCP Adapter)
- Defined single document authority per live session (browser-live vs headless local-file modes).
- Fixed idempotency ordering: auth → identity → cache check → revision check.
- Persist idempotency results atomically with successful commits.
- No plaintext pairing tokens; revocation, expiry, idle timeout, permission controls.
- Chrome PNA, CORS, preflight, WebSocket, production-origin validation in Phase 0.
- Never expose pairing tokens in URLs or logs.
- Strengthened filesystem security: symlink races, path traversal, unintended overwrites.
- Added candidate-cell, runtime, memory limits alongside changed-block limits.
- Complete Zod schemas for every MCP tool.
- Clarified operation diff vs revision diff.
- Defined confirmation-required vs immediate operations.
- One-click undo only when associated operation is latest undoable.
- Bounded Agent Log serialization and malicious metadata protection.

### SUBSPEC-G (UI & Interaction)
- Turned S&box-inspired aesthetic into formal design contract (typography, spacing, borders, panel states, menus, tooltips, dialogs, empty states, error states).
- Added reference screenshots and visual acceptance criteria.
- Added Assets bottom-dock tab.
- Defined desktop-first responsive behavior and panel collapsing.
- Specified complete touch camera and gizmo behavior separately from outliner touch.
- Fixed shortcut conflict detection across different actions.
- Defined platform-aware shortcuts, browser-reserved, key-repeat, context scoping.
- Resolved W/E transform shortcuts alongside viewport camera navigation.
- Added WCAG 2.2 AA accessibility targets.
- Versioned and validated persisted workspace layouts.
- Defined all loading, confirmation, progress, cancellation, hover, selection, context-menu interactions.
- Added View → Overlays controls for chunk borders, chunk section borders, and block borders (independent, OFF by default), persisted as viewport preferences, with toolbar indicators, tooltips, and keyboard/mouse accessibility.
- Added hover info HUD: block name, state properties, world coordinates, contributing placements for overlaps, lock indicators; hover resolution throttled to 30Hz, conflict spatial index lookup; session state only (no revision/export/undo impact).
- Added placement selection & operations: placement click selects, context menu with duplicate/delete/move/rotate/mirror/bake/export/set origin/set visibility/lock; magic/connected select; select by type; expand/contract/shift selection.
- Added asset load panel (6.10): first-run auto-download and manual JAR import; progress bar, cancel, checksum verification; auto-download failure surfaces manual JAR zone (never a dead end).
- Added asset load status in status bar and Assets tab; persistent warning banner with "Load assets" action until assets load; missing-model fallback until ready.

### SUBSPEC-H (Architecture & Deployment)
- Resolved Astro/Vite contradiction: Astro static output with React editor island.
- Made zero-cost deployment a hard v1 requirement.
- Cloudflare Workers Static Assets, free workers.dev address, no purchased domain.
- Removed mandatory production FastAPI; kept as optional auxiliary local tooling.
- No mandatory hosted database, login, cloud storage, R2, D1, KV, Durable Objects, paid API/GPU.
- All editing/rendering/imports/exports/materials/conflicts/persistence client-side.
- IndexedDB for storage, Web Workers for heavy processing.
- MCP as locally installed Node companion via free GitHub Releases or npm.
- Complete deployment config, Astro build, Wrangler config, CI/CD, previews, production, smoke tests, rollback.
- Validated browser downloading/CORS for Mojang assets; manual JAR fallback.
- Added offline functionality after initial assets cached.
- No mandatory analytics, telemetry, external font/CDN.
- Phase 0 gates as reproducible feasibility demonstrations.
- Renamed Phase 8 stretch work as post-v1/v1.1.
- Expanded performance benchmarking (P50/P95 frame time, peak memory, main-thread blocking, time to first visible geometry, worker execution time).
- Distinguished public hosting, browser-local processing, browser-local storage, locally executed companion services.
- Phase 0 gate verifies both asset paths end-to-end (auto-download CORS/download + manual JAR import, cache persistence, failure fallback).

---

## 4. Unresolved-Risk Register

Only issues requiring genuine technical feasibility tests:

| ID | Risk | Affected Subspec | Feasibility Test Required |
|---|---|---|---|
| R1 | Browser CORS for official Mojang asset endpoints may block runtime download. | B, E, H | Phase 0: attempt download from official endpoints in Chrome; verify CORS headers. Fallback: manual JAR import. |
| R2 | Litematic packed BlockStates decoding may differ across Litematica versions (1.20.1 vs 1.21.1 vs 1.21.11). | B | Phase 0: parse real .litematic files from each version; verify block positions match. |
| R3 | Lodestone 1.21.11 model compatibility (new model rotations, Z-axis dispatch). | E | Phase 0: render representative 1.21.11 blocks with Lodestone; compare to expected output. |
| R4 | WebGL context loss recovery may not reconstruct all renderer state. | E | Phase 0: simulate context loss; verify renderer rebuilds from document snapshot. |
| R5 | IndexedDB quota may be lower than expected on some browsers/devices. | C | Phase 0: test storage.estimate() across Chrome/Firefox/Safari; document minimum. |
| R6 | Chrome Private Network Access (PNA) may block companion bridge in some configurations. | F | Phase 0: test PNA preflight in Chrome stable; verify companion responds correctly. |
| R7 | Worker transfer of large ArrayBuffers may cause memory spikes on low-end devices. | A, C, D | Phase 0: benchmark memory during 1M-block import on 16GB RAM machine. |
| R8 | Cloudflare Workers Static Assets may have size limits for large asset bundles. | H | Phase 0: deploy test build; verify all assets serve correctly. |
| R9 | Three.js OrbitControls may not support all required camera presets out of the box. | E, G | Phase 0: implement and test all 7 preset views + orthographic toggle. |
| R10 | Block-state transform handlers may not cover all vanilla directional properties. | A, D | Phase 0: enumerate all directional properties in 1.21.11 blockstates; verify handler coverage. |

---

## 5. Deliverables Summary

1. **SUBSPEC-C** (revised): `docs/specs/subs/SUBSPEC-C_PROJECT_PERSISTENCE.md` — 715 lines, 28,714 bytes. Revisions: monotonic revisions, IndexedDB schema (8 stores), crash-safe commits, .vxproj alignment, NBT safety, type-safe migrations, autosave races, recovery, storage estimation, chunk copy-on-write, no cloud sync.
2. **SUBSPEC-D** (revised): `docs/specs/subs/SUBSPEC-D_EDITING_ENGINE.md` — 519 lines, 21,179 bytes. Revisions: overrideAir semantics, BlockStateMatcher expected values, WallsOperation explicit block, clipboard lifecycle, operation budgets, ancillary data behavior table, replace incompatible block entities, bake merge rules, conflict index details.
3. **SUBSPEC-E** (revised): `docs/specs/subs/SUBSPEC-E_RENDERING_RESOURCE_PACKS.md` — 362 lines, 13,456 bytes. Revisions: E8-E18 locked decisions, resource-pack inheritance, texture-variable resolution, weighted model selection, UV locking, face culling, chunk-boundary, mirroring, local mesh coords, atlas limits, visual fidelity, resource-pack manager, texture animation.
4. **SUBSPEC-F** (revised): `docs/specs/subs/SUBSPEC-F_MCP_ADAPTER.md` — 458 lines, 15,450 bytes. Revisions: F9-F15 locked decisions, document authority modes, idempotency ordering, atomic idempotency persistence, pairing token security, Chrome PNA, filesystem security, candidate/runtime/memory limits, Zod schemas, operation vs revision diff, confirmation classification, one-click undo rule, bounded Agent Log.
5. **SUBSPEC-G** (revised): `docs/specs/subs/SUBSPEC-G_UI_INTERACTION.md` — 371 lines, 14,708 bytes. Revisions: formal design contract (typography, spacing, borders, panel states, menus, tooltips, dialogs, empty/error states), reference screenshots, Assets tab, desktop-first responsive, touch camera/gizmo, shortcut conflict detection, platform-aware shortcuts, WCAG 2.2 AA, layout versioning, interaction definitions.
6. **SUBSPEC-H** (revised): `docs/specs/subs/SUBSPEC-H_ARCH_PHASES_RELEASE.md` — 491 lines, 25,553 bytes. Revisions: H8-H16 locked decisions, Astro/Vite resolution, zero-cost deployment, Cloudflare Workers Static Assets, no mandatory FastAPI/hosted DB, client-side everything, MCP distribution, deployment config/CI/CD/smoke tests/rollback, browser asset validation, offline functionality, no telemetry, Phase 0 as feasibility demos, Phase 8 renamed post-v1, expanded performance benchmarking, service distinction table.
### Final targeted correction pass (this round)
- **SUBSPEC-A:** Doubled-integer lattice-safe block mapping with lattice theorem and round-trip proof; counterexample translation [10,64,10] / origin [0.5,0,0.5] / local block [0,0,0] shown to fail center-floor and correctly classified off-grid. Corrected bijective vanilla rotation/mirror table (facing, axis, rail, stair, hinge) verified against the section 3.1 matrices (90°⁻¹=270°, mirror²=identity). Added `Placement.eraseTombstones` and effective-block resolver erase semantics. `manifest.checksums` is the single checksum source; no separate `checksums.json`.
- **SUBSPEC-B:** Litematic packed BlockStates rewritten: minimum palette width (BPE=ceil(log2(P)), P=1→0, 5→3, 12→4, 20→5, 300→9), continuous LSB-first packing, entries crossing 64-bit boundaries, exact `wordsNeeded = ceil(totalBits/64)`, BigInt/64-bit extraction and encoding. Negative-size normalization no longer subtracts `bounds.min` from already-normalized local indices; local indices kept separate from world positions. Vanilla resource path corrected to `assets/minecraft/blockstates`.
- **SUBSPEC-C:** Added `commitRecords` and `autosaveJournal` IndexedDB stores. Idempotency records live in the same IndexedDB database as the document (browser-live and headless) and commit atomically with the document revision.
- **SUBSPEC-D:** Cut semantics resolved for visible/hidden and lower-priority overlapping placements. Removed duplicated sections 4.4–4.6 and the duplicate bake step (bake flow is now 4.8). `overrideAir` records erase tombstones preserved through save/reopen/export.
- **SUBSPEC-E:** `RenderChunk.key` is placement-local (`placementId:localChunkKey`); separate `WorldChunkSpatialIndex` is the world-space index (floor division, negatives).
- **SUBSPEC-F:** Removed plaintext `pairingToken` from `McpSession` (added `authority` field). Resolved browser-live/companion authority contradiction with explicit disconnect, reconnect, and atomic handover; only one authority at a time.
- **SUBSPEC-G:** Minimum viewport 1024×768 (1280×720 baseline); touch-support contradiction resolved; contrast-verified design tokens with verification table (all text/components meet WCAG 2.2 AA against `#0d0d0d` background).
- **SUBSPEC-H:** Cloudflare Pages reference removed. Wrangler config at `apps/web/wrangler.toml` with worker entry `apps/web/src/worker.ts`, matching the `apps/web` + `apps/mcp-companion` monorepo structure.

7. **Cross-document dependency matrix**: Section 1 of this document.
8. **Change log**: Section 3 of this document.
9. **Unresolved-risk register**: Section 4 of this document.

All six documents must be internally consistent, testable, and compatible with the zero-cost deployment architecture. Cross-document consistency verified against SUBSPEC-A and SUBSPEC-B.

---

## 6. Visual Reference Mapping

The reference images live under `specs/subs/refrences/` (note: the directory is named `refrences`, and files use the `refrence-` prefix with `.png` extensions). Each image is linked from its intended subspec in a `Visual References` subsection; all are non-normative and must not override the technical requirements in the specifications.

| Image filename | Linked from | Purpose |
|---|---|---|
| `refrence-editor-sbox.png` | SUBSPEC-G | Primary editor layout and visual direction |
| `refrence-editor-unreal.png` | SUBSPEC-G | Secondary reference for viewport, outliner, inspector and asset panels |
| `refrence-transform-gizmo-origin.png` | SUBSPEC-A | Transform gizmo versus object origin/pivot |
| `refrence-transform-local-global.png` | SUBSPEC-A | Axis handles and local/global transform modes |
| `refrence-chunk-loaded-unloaded.png` | SUBSPEC-E | Loaded versus unloaded spatial chunks |
| `refrence-chunk-boundaries.png` | SUBSPEC-E | Chunk spatial boundaries and neighbouring regions |
| `refrence-greedy-meshing.png` | SUBSPEC-E | Greedy meshing and merging adjacent voxel faces |
| `refrence-voxel-mesh-topology'.png` | SUBSPEC-E | Voxel surface and exposed-face mesh structure |
| `refrence-selection-bounds.png` | SUBSPEC-D | Selection volume and region boundaries |
| `refrence-copy-paste-workflow.png` | SUBSPEC-D | Copy and paste workflow |
| `refrence-litematica-overlay.png` | SUBSPEC-D | In-world schematic preview and overlay appearance |