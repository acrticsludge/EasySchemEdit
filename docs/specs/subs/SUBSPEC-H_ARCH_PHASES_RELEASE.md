# SUBSPEC-H — Architecture, Phases & Release (v1 implementation contract)

Source decisions: H1–H7 (locked planning baseline).  
Cross-checked against SUBSPEC-A through SUBSPEC-G.

Every decision below is translated into implementation details: type definitions, data flow, validation rules, worker responsibilities, frontend interactions, backend/companion responsibilities, failure handling, and tests.

---

## 1. Locked decisions

| ID | Decision | Status |
|---|---|---|
| H1 | Stack: Astro shell + React editor island + TypeScript engine + Three.js renderer + FastAPI auxiliary backend. | Locked |
| H2 | Package manager: pnpm workspaces. | Locked |
| H3 | Reference hardware: ASUS ROG Strix G16 (Intel Ultra 9 275HX, RTX 5060 Laptop, 16GB, Win 11, Chrome). | Locked |
| H4 | Performance testing: correctness in CI; large GPU benchmarks on release hardware. | Locked |
| H5 | Phase 0 ownership: core implementer owns spike; user approves gates. | Locked |
| H6 | Keep all 16 release acceptance items; add 12 explicit requirements. | Locked |
|| H7 | No sphere/cylinder/brush in initial v1. | Locked |
|| H8 | Zero-cost deployment: Cloudflare Workers Static Assets, free workers.dev address, no purchased domain. | Locked |
|| H9 | No mandatory production FastAPI; existing Python as optional auxiliary local tooling only. | Locked |
|| H10 | No mandatory hosted database, login, cloud storage, R2, D1, KV, Durable Objects, paid API or GPU. | Locked |
|| H11 | All editing, rendering, imports, exports, material calculations, conflict detection, persistence client-side. | Locked |
|| H12 | IndexedDB for project storage; Web Workers for heavy processing. | Locked |
|| H13 | MCP as locally installed Node companion via free GitHub Releases or public npm. | Locked |
|| H14 | Offline functionality after initial assets and app shell cached. | Locked |
|| H15 | Phase 0 gates are reproducible feasibility demonstrations, not whole-product prerequisites. | Locked |
|| H16 | Phase 8 stretch work renamed to post-v1/v1.1. | Locked |

---

## 2. Type definitions

### 2.1 Package layout

```
schematic-editor/
├── apps/
│   ├── web/                    # Astro application shell
│   │   ├── src/
│   │   │   ├── components/     # Astro components (non-editor)
│   │   │   ├── islands/        # React editor island
│   │   │   └── pages/          # Astro routes
│   │   └── astro.config.mjs
│   └── mcp-companion/          # Node stdio MCP server + local bridge
│       ├── src/
│       │   ├── server.ts       # MCP stdio server
│       │   ├── bridge.ts       # localhost HTTP + WebSocket
│       │   └── health.ts       # /healthz, /readyz, /metrics
│       └── package.json
├── packages/
│   ├── core/                   # shared domain + commands (pure TS)
│   ├── domain/                 # types, invariants, coordinate math, selectors
│   ├── formats/                # NBT, Sponge, Litematica adapters
│   ├── renderer/               # Three.js renderer adapter
│   ├── operations/             # transactional commands, patches, history
│   ├── project-schema/         # migrations, schema versions
│   ├── asset-pipeline/         # resource pack loading, asset extraction
│   └── shared/                 # shared utilities, worker protocol
├── fixtures/                   # real and generated schematic fixtures
├── docs/
│   ├── specs/                  # this document set
│   └── phase-0/                # Phase 0 gate evidence
├── pnpm-workspace.yaml
└── pnpm-lock.yaml
```

### 2.2 Technology baseline

- Language: TypeScript with strict type checking.
- Build: Astro static app with React editor island.
- Rendering: Three.js through renderer adapter. Lodestone is candidate, not required.
- State: single document store/command bus. UI state library must not become second document model.
- Persistence: IndexedDB for browser project data and binary chunks.
- Background work: Web Workers for parsing, meshing, conflict indexing, operations, export.
- MCP: `@modelcontextprotocol/sdk` (v2 stable) with Zod input schemas in local Node companion.
- WASM: not a v1 assumption. Add Rust/WASM only when profiling shows measured bottleneck TypeScript workers cannot meet.

Pin versions in lockfile. No runtime use of unpinned `latest` CDN assets or dependencies.

### 2.3 Dependency direction

```
editor UI (React island) ──┐
MCP adapter ────────────────┼──> command/query API ──> domain model
file adapters (formats) ────┘                           ↑
renderer adapter <── render snapshots ─────────────────┘
project store ──────> serialized domain records / binary chunks
asset pipeline ────> versioned resource packs
```

Rules:
- `domain` must not import framework, browser, Node, Three.js, or MCP packages.
- `commands` may depend on `domain`, never on UI or renderer packages.
- `formats` may depend on `domain`, never on renderer objects.
- `renderer` reads immutable snapshots and renderer deltas; never mutates Project directly.
- UI and MCP call same commands/queries. No reimplementing transform, overlap, selection, or material-list logic.
- Worker code imports same pure domain/command modules. Worker boundaries carry typed messages and transferable buffers, not arbitrary class instances.
- FastAPI/Python retained for existing auxiliary backend functionality, not as second schematic editing implementation.

---

## 3. Data flow

### 3.1 Astro + React island

```
Astro page (static HTML) → React editor island (client:load)
  → island mounts document store + command bus
  → island renders viewport (Three.js), outliner, inspector, bottom panels
  → Astro handles routing, deployment, non-editor pages
  → Cloudflare Workers Static Assets serves the `apps/web/dist` static build (zero-cost `workers.dev` address)
```

### 3.2 MCP companion flow

```
Agent (stdio) → MCP server (Node) → command bus (in-process)
  → browser connects via localhost HTTP + WebSocket (pairing token)
  → document-change events → browser refreshes renderer + Agent Log
  → local-file mode: open/save .vxproj directly without browser
```

---

## 4. Validation rules

### 4.1 Performance budgets (H4, provisional)

All targets measured on declared reference hardware (H3) and browser versions. First benchmark report records CPU, RAM, GPU, browser, OS, viewport, file compressed/decompressed size, non-air count, palette count, placement count.

Benchmark metrics (H15):
- P50 and P95 frame time (ms).
- Peak memory (MiB).
- Main-thread blocking time (ms per frame, long tasks > 50ms).
- Time to first visible geometry (ms).
- Worker execution time per operation (ms).
- FPS (median, P5, P95).

| Scenario | Provisional target | Release interpretation |
|---|---|---|
| Empty editor first paint | < 2 s on reference machine | Hard target after Phase 0 baseline. |
| 100k non-air blocks | Interactive editing and orbit, no long main-thread task | Required. |
| 1M non-air blocks | Progressive load; stable orbit; 30 FPS median on reference dedicated GPU | Required initial large-scene target. |
| 5M non-air blocks | Progressive load; 30 FPS median target, 60 FPS stretch | Hardware-dependent, not universal guarantee. |
| 10M+ blocks | Best-effort progressive load subject to memory budget | No fixed guarantee. Must fail safely with actionable limits. |
| Fill 100k cells | < 250 ms worker execution target | Measure P50/P95; UI remains responsive. |
| Localized conflict update | Only touched/neighbor chunks recomputed | Correctness and incremental behavior are release gates; timing benchmarked. |
| Export 1M blocks | Progress reporting and cancellable worker execution | No UI freeze; byte/time budget set after benchmark. |

### 4.2 Memory safety limits

- Validate dimension multiplication and byte estimates before allocation.
- Configure maximum import compressed bytes, decompressed NBT bytes, total volume, non-air block count, palette count, NBT nesting depth, image dimensions.
- Reject NBT/gzip bombs, malformed lengths, negative/overflowing dimensions where invalid, duplicate invalid IDs, truncated buffers, allocation-overflow inputs.
- Conservative configurable default memory budget; show estimate before import/bake.
- Handle WebGL context loss and worker failures without corrupting project.

### 4.3 Deployment architecture (zero-cost, H8-H12)

**Astro/Vite resolution (H1):** Use Astro static output with React editor island. NOT a separate Vite application. Astro handles routing, deployment, non-editor pages. React island mounts the document store + command bus + Three.js viewport.

**Zero-cost requirement (H2):** No purchased domain. No paid services. All v1 functionality works at zero monthly cost.

**Cloudflare Workers Static Assets (H3):**
- Deploy via `wrangler deploy` with static assets configuration.
- Free `workers.dev` address (e.g., `schematic-editor.workers.dev`).
- No custom domain required.
- Wrangler config: `assets.directory = "dist"`, `assets.binding = "ASSETS"`.

**No mandatory hosted services (H5):**
- No hosted database (no D1, no Postgres, no Supabase).
- No login/auth service.
- No cloud storage (no R2, no S3).
- No KV, no Durable Objects.
- No paid API or GPU service.
- All editing, rendering, imports, exports, material calculations, conflict detection, persistence client-side.

**Client-side everything (H6, H7, H11):**
- IndexedDB for project storage (browser-local).
- Web Workers for heavy processing (browser-local).
- MCP companion is locally installed Node process (user's machine).
- Asset pipeline downloads from official Mojang sources (free, public endpoints).
- No server-side computation for any core feature.

**MCP companion distribution (H8, H13):**
- Distributed via free GitHub Releases (executables for Win/Mac/Linux).
- Or published as free npm package (`npx schematic-editor-mcp`).
- No paid distribution channel.

**Offline functionality (H14):**
- After initial assets and app shell cached: full offline operation.
- Service worker caches app shell and extracted assets.
- No network required for editing, rendering, persistence, export.
- Asset download requires network (first launch only).

**No mandatory telemetry (H12):**
- No analytics, no telemetry, no external font/CDN service.
- All assets self-hosted or from official Mojang endpoints.

**Astro build config:**
```js
// astro.config.mjs
export default defineConfig({
  output: 'static',
  integrations: [react()],
  build: { assets: '_astro' },
});
```

**Wrangler config:** lives at `apps/web/wrangler.toml` (monorepo package `apps/web` is the Astro static app). The worker entry point is `apps/web/src/worker.ts`, which serves the static build and falls back to `index.html` for SPA routes.

```toml
# apps/web/wrangler.toml
name = "schematic-editor"
main = "src/worker.ts"
compatibility_date = "2026-01-01"
compatibility_flags = ["nodejs_compat"]
[node_compat]
[assets]
directory = "./dist"
binding = "ASSETS"
```

`apps/web/package.json` builds the Astro static output to `apps/web/dist` (`astro build`), and `wrangler deploy` is run from `apps/web`. The free `workers.dev` address (e.g. `schematic-editor.workers.dev`) is used with no custom domain.

**CI/CD:**
- GitHub Actions: build on push, deploy to Cloudflare Workers on main branch.
- Preview deployments for PRs (Cloudflare Workers preview).
- Smoke tests: load app, import fixture, export, verify no console errors.
- Rollback: Cloudflare Workers version history (instant rollback).

### 4.4 Local MCP companion

- Distributed separately from static editor (npm package or executable).
- Must support Windows, macOS, Linux in test matrix.
- Local session bridge binds to loopback only.
- Companion logs errors and provides clear startup/connection status.
- Browser editor may be hosted publicly but must request pairing before attaching to local project.

### 4.5 Browser asset download validation (H10)

Phase 0 must verify both asset paths end-to-end:

- **Auto-download path:** browser can download from official Mojang version manifest → client JAR URL → client JAR (CORS feasibility). Verify CORS headers, download completes, JAR SHA-1 verified against `downloads.client.sha1` from version JSON.
- **Manual JAR path:** user-provided `1.21.11.jar` → worker extraction → IndexedDB cache → renderer ready. Verify corrupt/wrong-version rejection (SHA-1 against pinned expected SHA-1 for 1.21.11; version detected from JAR's own metadata).
- **Failure fallback:** auto-download failure (CORS/network) automatically surfaces the manual JAR zone with `ASSET_DOWNLOAD_FAILED`; never a dead end.
- **Phase 0 asset-gate evidence:** record the official 1.21.11 client JAR SHA-1 (source: `downloads.client.sha1` from the version JSON) in a repo constants file used by the manual-JAR check. Store Phase 0 evidence in `docs/phase-0/assets-tests.md`, including the SHA-1 value, download timestamp, and verification result.
- Asset extraction in worker (zip open, file extraction, checksum verification).
- Cached assets in IndexedDB keyed by version + hash.

### 4.6 Service distinction (H16)

| Service | Location | Cost | Required? |
|---|---|---|---|
| Editor UI + rendering | Browser (client-side) | $0 | Yes |
| Project storage | Browser IndexedDB (client-side) | $0 | Yes |
| Heavy computation | Browser Web Workers (client-side) | $0 | Yes |
| Asset download | Official Mojang endpoints (public) | $0 | First launch only |
| Static hosting | Cloudflare Workers Static Assets (free tier) | $0 | Yes |
| MCP companion | User's local machine (Node.js) | $0 | Optional (for AI agent) |
| FastAPI auxiliary | User's local machine (optional) | $0 | No (optional) |

No service requires payment, hosting, or cloud infrastructure.

---

## 5. Worker responsibilities

- All heavy computation off main thread: parsing, meshing, conflict indexing, operations, export.
- Worker code imports same pure domain/command modules.
- Typed messages and transferable buffers only; no arbitrary class instances.
- Cancellation via `AbortController`.
- Stale revision results discarded.
- See SUBSPEC-A section 6 for buffer ownership rules.

---

## 6. Frontend interactions

### 6.1 S&box-inspired layout

- Dark graphite/charcoal base theme.
- Central 3D viewport gets priority (dominant workspace).
- Left hierarchy/outliner.
- Right inspector.
- Bottom dockable workspace (assets, materials, conflicts, history, agent log).
- Compact top toolbar with tool modes and viewport controls.
- Thin separators, subtle hover states, restrained selection highlights.
- Resizable and collapsible panels.
- Remember panel positions and sizes.
- No generic SaaS dashboard design inside editor.
- No excessive rounded cards, giant buttons, or unnecessary gradients.
- Visually excellent even when project is empty.

### 6.2 Color system

- Consistent design-token system.
- Ability to modify accent color and semantic colors.
- Colors adjustable; not hardcoded.

---

## 7. Failure handling

| Condition | Handling |
|---|---|
| Phase 0 gate failure | Revise architecture or dependency choice before Phase 1. Do not paper over with UI work. |
| WebGL context loss | Handle gracefully; reconstruct renderer state from document snapshot. |
| Worker crash | Discard partial result; main thread unchanged; surface error. |
| Browser reload during autosave | Recovery snapshot available on next open. |
| Quota exhaustion | Visible error; never silently drop previous save. |
| Export cancellation | Discard partial output; main thread unchanged. |
| Migration failure | Restore from pre-migration recovery snapshot. |

---

## 8. Phases and gates (H5)

| Phase | Deliverable | Exit gate |
|---|---|---|
| 0 — Feasibility spike | Format fixtures, coordinate prototype, rendering/library evaluation, asset distribution decision, performance baseline | All five gates in section 0 pass or architecture revised before proceeding. |
| 1 — Domain and format foundation | Canonical types, sparse chunk store, bounded NBT reader/writer, Sponge v3 and Litematic adapters | Multi-region/negative-size imports and supported semantic round-trips pass. |
| 2 — Read-only viewer | Resource-pack pipeline, 1.21.11 model rendering, chunked meshes, camera controls, placement borders/origins | Representative 1M-block scene loads progressively and remains interactive on reference hardware. |
| 3 — Headless command core | Selection, region ops, placement transforms, conflict index, material queries, transactional history | Core operations and transform property tests pass without UI. |
| 4 — Single-placement editor | Outliner, inspector, region selection, block picker, fill/replace/delete/copy/paste, undo/redo | User can edit one placement and recover exact prior state. |
| 5 — Composition | Multi-placement transforms, group import, overlap policy, conflict overlay, cross-placement selection, bake | Two or more real schematics compose, diagnose conflicts, bake, undo, and export correctly. |
| 6 — Persistence and export | IndexedDB autosave, .vxproj archive, export previews, validation, recovery | Close/reopen restores exact semantic project state; exports pass external compatibility checks. |
| 7 — MCP local companion | stdio MCP server, local pairing bridge, shared command bus, dry-run confirmation, Agent Log | Agent performs multi-step task while UI shows same revision/state; safety tests pass. |
| 8 — Post-v1 / v1.1 | Brush, thumbnails, advanced LOD, more selection shapes, extra material/inventory integrations | Only after correctness, stability, and core performance goals met. |

Do not start Phase 4 UI polish while Phase 1 format correctness or Phase 2 renderer compatibility is failing.

### Phase 0 gates (five, reproducible feasibility demonstrations)

Phase 0 gates are reproducible feasibility demonstrations, not whole-product prerequisites. Each gate must have documented evidence in `docs/phase-0/`.

1. Correct parsing and writing of `.schem` v3 and representative `.litematic` files, including multi-region and negative-size regions. Evidence: `format-tests.md` with fixture list and pass/fail results.
2. Correct transform round-trips for all 90-degree rotations and mirrors, including origin mapping and common directional block states. Evidence: `transform-tests.md` with property-based test results.
3. Renderer can display Minecraft 1.21.11 block models/textures with correct opaque, cutout, translucent, and emissive behavior. Evidence: `assets-tests.md` with visual comparison screenshots.
4. Sparse 1M+ non-air-block fixture can be loaded, viewed, selected, and edited without materializing entire scene as individual meshes or giant dense union volume. Evidence: `memory-benchmarks.md` with memory/time measurements.
5. Undo/redo, persistence, and MCP can call the same document command API without maintaining separate state models. Evidence: `renderer-comparison.md` with API usage audit.

If any gate fails, revise architecture or dependency choice before Phase 1.

### Phase 0 evidence

Store evidence in `docs/phase-0/`:
- `format-tests.md`
- `transform-tests.md`
- `assets-tests.md`
- `memory-benchmarks.md`
- `renderer-comparison.md`

Core implementer owns the technical spike. User approves the five gates. No beginning Phase 1 based on assumptions.

---

## 9. Testing strategy (H4)

### 9.1 Test levels

| Test | Where | Requirement |
|---|---|---|
| Parser correctness | Every PR | Pass/fail |
| Transform correctness | Every PR | Pass/fail |
| Operation benchmarks (small/medium fixtures) | Every PR | Pass/fail against regression threshold |
| Memory regression | Every PR | Pass/fail |
| 1M-block parsing/rendering | Nightly | Performance report |
| 5M-block rendering | Release benchmark | Target: 30 FPS |
| 10M-block import/export | Release benchmark | Duration and peak memory reported |

### 9.2 Domain/core tests

- Coordinate conversion and inverse properties.
- Bounds and integer overflow validation.
- Rotation/mirror composition.
- Block-state canonicalization and equality.
- Owner resolution, conflict categories, overlap precedence.
- Fill/replace/delete/copy/cut/paste/hollow/walls/move/bake.
- Lock/visibility semantics.
- Ancillary data movement and cleanup.
- History atomicity and memory pruning.
- Deterministic project serialization and migrations.
- Property-based tests for transforms and operation bounds.

### 9.3 Format tests

- Checked-in fixtures produced by real supported tools (SUBSPEC-B section 15).
- Round-trip checks compare semantic block states and supported ancillary data.
- Byte equality not required.
- External compatibility: WorldEdit import, Litematica open.

### 9.4 Rendering tests

- Visual regression on 1.21.11 vanilla fixture scenes.
- Correct model dispatch, texture UVs, transparency, emissive behavior, borders, overlays, selection, origins, transformed placements.
- Missing model/texture fallback.
- User resource-pack override precedence.
- Multiple device pixel ratios and zoom levels.

### 9.5 MCP tests

- End-to-end local companion sessions.
- Same command produces same result through UI and MCP.
- Stale revision, duplicate request ID, expired confirmation token, invalid token, locked placement, over-limit operation, cancellation, malformed input.
- Agent Log sanitization and undo action validity.
- Path sandboxing and loopback/origin restrictions.

### 9.6 Performance and reliability tests

- Fixtures at 100k, 1M, 5M, 10M+ non-air blocks, plus highly sparse huge bounding boxes.
- Record load, parse, decompression, chunk mesh, conflict index, material counts, operation, undo, autosave, export separately.
- Track memory peak and main-thread long tasks, not only FPS.
- Simulate WebGL context loss, worker crash, browser reload during autosave, quota exhaustion, export cancellation.
- Benchmarks in CI where deterministic; hardware-sensitive performance runs are release reports, not flaky pass/fail unit tests.

---

## 10. Release acceptance (H6)

### 10.1 Original 16 items (all required)

1. Imports `.schem` v3 and `.litematic` fixtures, including multi-region and negative-size Litematic regions.
2. Shows complete import report; no unknown source data silently discarded.
3. Default asset profile pinned to Minecraft 1.21.11, or UI clearly explains approved asset-loading step.
4. Common 1.21.11 blocks render correctly with cutout/translucent/emissive behavior.
5. Placement transforms, origin editing, group transforms, coordinate inversion pass property tests.
6. Directional block states transformed correctly for supported vanilla states; unsupported states reported.
7. World and placement selections have deterministic half-open bounds.
8. Region operation source/result modes visible and behave exactly as specified.
9. Conflict categories and top/bottom precedence deterministic.
10. Bake, export, undo, redo atomic and reconcile ancillary data.
11. Effective and per-placement material lists match independent test calculations.
12. Project autosave/recovery works; quota failure visible.
13. Generated exports re-open in supported external tools and pass semantic comparisons.
14. Large files do not block main thread or require dense scene-wide array.
15. MCP dry-run, confirmation tokens, expected revisions, idempotency, limits, path security pass tests.
16. Browser and MCP use same command/query implementation.

### 10.2 Additional 12 requirements

1. No silent loss of supported schematic data.
2. Import warnings identify exactly what could not be preserved.
3. Transforms preserve block positions and supported orientations.
4. Exports open correctly in WorldEdit and Litematica.
5. Large-file operations do not freeze the UI.
6. Storage-limit failures cannot corrupt the current project.
7. Recovery works after forcibly closing the browser.
8. Undo restores complete multi-placement state.
9. MCP destructive operations have enforced safety checks.
10. S&box-inspired UI layout works at supported screen sizes.
11. Vanilla 1.21.11 assets available through default asset pipeline.
12. Custom resource packs can override vanilla assets without corrupting underlying block data.

---

## 11. Deferred features (H7)

| Feature | Decision |
|---|---|
| Brush paint/erase | v1.1 |
| Sphere selection | v1.1 or later |
| Cylinder selection | v1.1 or later |
| Advanced selection masks | Later |
| Inventory availability mode | Later |
| Selective/branching undo | Later |
| Multiplayer | Later |
| World .mca editing | Out of scope |
| Full entity visual editing | Later |
| Full block-entity editor | Later |
| Schematic diff tool | v1.1 candidate |

Do not sacrifice format correctness, viewport, or large-file performance to squeeze brushes and extra selection shapes into v1.

---

## 12. Decisions removed from v0.1

| v0.1 item | v0.2 decision | Reason |
|---|---|---|
| Dense `Uint16Array` per placement | Sparse chunked volume with adaptive palette indices | Dense storage wastes memory for sparse/large schematics; 16-bit palette cap was arbitrary. |
| One placement per uploaded file | One placement per source region; Litematic import group | Litematic files can contain multiple independent regions. |
| Origin/volume-center rotation ambiguity | Placement origin is the transform pivot | One unambiguous transform contract. |
| `newest-wins` / `oldest-wins` | Removed from v1 | Outliner order is explicit and predictable. |
| Orange for 3+ same-state overlaps | Yellow for every same-state overlap; count shown separately | A fourth color contradicted the three-state legend. |
| Green tint on all clean blocks by default | Conflicts-only default; optional full classification | Keeps normal Minecraft textures legible. |
| "Pixel-perfect at any zoom" | Crisp magnification + stable minification, tested at defined zoom levels | "Any zoom" is not measurable. |
| 10M blocks in <3 s | Progressive loading with declared benchmark targets | Runtime depends on compression, browser, CPU, GPU, data density, memory. |
| Lodestone as implicit resource/format solution | Phase 0 renderer candidate behind adapter | Multi-region convenience loader defaults to first region; 1.21.11 compatibility needs proof. |
| MCP stdio + HTTP described as shared state | Local companion/session bridge | Separate processes do not share browser memory automatically. |
| Undefined `Patch[]` history | Typed chunk/object delta with byte budget | Required for scalable, atomic undo. |
| JSON base64 as project save | IndexedDB binary stores + `.vxproj` archive | Avoids enormous JSON/base64 duplication. |
| "Lossless round-trip" without caveats | Fidelity levels F0–F3 and strict export | Defines what can actually be guaranteed. |

---

**End of SUBSPEC-H. All eight sub-specs complete.**