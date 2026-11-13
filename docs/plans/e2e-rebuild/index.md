# E2E Rebuild Plan — EasySchemEdit v1

Author: orchestrator (Claude Opus 5.5) · Date: 2026-11-13 · Branch: `e2e-rebuild`
Scope (user decision 2026-11-13): **everything in the specs** — asset pipeline, resource packs, conflicts UI, library, MCP, deploy.
Assets: **auto-download Minecraft 1.21.11 client JAR from Mojang on first run** (manual JAR = fallback).
Git: **commit per slice**, on branch `e2e-rebuild`, no push.

## 1. GOAL
Turn the repo into a working end-to-end v1 editor: import `.schem`/`.litematic` → render real 1.21.11 textures → compose/transform placements → select & edit regions → resolve conflicts/bake → undo/redo → autosave/project files/library → export → AI agent edits via MCP → deployable static build.

## 2. CONSTRAINTS / NON-GOALS
- Follow `AGENTS.md` (model policy, Prompt Pyramid, no-hallucination, stage-by-path) and `docs/goal/GOAL.md` rules.
- Specs in `docs/specs/**` are the contract. Don't change locked decisions. If a spec is ambiguous, log `docs/agent/DOUBTS.md` and pick the documented recommended default.
- Packages stay pure TS (no DOM/React/Three). Browser APIs (IndexedDB, fetch, Worker, crypto.subtle, CompressionStream) go behind injected interfaces in packages and are implemented in `apps/web`.
- `apps/web` must consume packages via `@easyschemedit/*` imports; delete the prototype logic in `EditorIsland.tsx` and `apps/web/src/workers/parse-worker.ts`.
- Non-goals (spec §1.2 / H §11): brush, sphere/cylinder selections, multiplayer, `.mca`, redstone sim, legacy `.schematic` export, shader packs.
- New deps must be pinned exact versions with a permissive license, recorded in `docs/research/e2e-deps.md`. Pre-approved: `fflate` (zip/gzip, MIT), `fake-indexeddb` (tests only, Apache-2.0), `@playwright/test` (smoke test, Apache-2.0). Anything else → ask orchestrator.
- No synthetic fixtures labelled real. Real fixtures live in `fixtures/real/` (user-provided); tests depending on them print `BLOCKED (awaiting fixture)` and exit 0 when files are absent.

## 3. INPUTS (verified facts)
- Audit summary: `AGENTS.md` §7. Implementation-depth survey: `docs/agent/e2e-survey.md` (written by cheap survey agent; spot-check before trusting).
- Mojang endpoints (checked 2026-11-13 with curl, `Origin` header):
  - `https://piston-meta.mojang.com/mc/game/version_manifest_v2.json` → `Access-Control-Allow-Origin: *`
  - 1.21.11 version JSON: `https://piston-meta.mojang.com/v1/packages/812ee7fdfdf648bb872f7a1dca33718de4e786b4/1.21.11.json`
  - client JAR: `https://piston-data.mojang.com/v1/objects/ba2df812c2d12e0219c489c4cd9a5e1f0760f5bd/client.jar`, sha1 `ba2df812c2d12e0219c489c4cd9a5e1f0760f5bd`, size 31152600, `Access-Control-Allow-Origin: *`
- Known hollow areas: `packages/renderer` is types-only (no mesher/atlas/model resolution); `packages/workers` are stubs; MCP stdio handlers are stubs; web app is a prototype.

## 4. ARCHITECTURE DECISIONS (orchestrator, binding)
- **AD-1 Single document API.** `packages/operations` exposes `EditorSession` = document state + `execute(command)` + `query(q)` + history (`packages/persistence/src/history.ts` deltas) + change events with monotonically increasing `revision`. UI, workers and MCP all go through it. React state only mirrors UI-only state (panels, tool mode, camera).
- **AD-2 Codecs.** gzip/zip via `fflate` in `packages/formats` (pure JS, runs in browser, worker and Node). Decompression is streamed with an absolute byte cap (GOAL Phase 1 #6).
- **AD-3 Rendering.** Pure mesher in `packages/renderer` emits typed arrays (`positions/normals/uvs/colors/indices` per pass) per 16³ storage chunk per placement; `apps/web` turns them into `THREE.BufferGeometry`, one mesh per (placement, chunk, pass). Meshing runs in a Web Worker. Picking uses voxel DDA raycast against the document, not mesh raycasts.
- **AD-4 Assets.** `packages/asset-pipeline` (pure, injected `fetch`/`sha1`/`kv` interfaces) downloads → verifies SHA-1 → unzips only `assets/minecraft/{blockstates,models,textures/block}` + `pack.mcmeta`/version.json → caches in IndexedDB keyed `1.21.11:<sha1>`. Resource-pack zips layered on top (highest priority first). Mojang assets are never committed or redistributed.
- **AD-5 MCP authority.** When a browser is paired, the browser `EditorSession` is the document authority; companion validates (Zod), applies dry-run/token protocol, and relays the command over WS; the browser executes through the same `EditorSession` and returns the result. Without a browser, companion runs its own Node `EditorSession` on a `.vxproj` file (local-file mode). Same package code both ways (release item 16).
- **AD-6 Tests.** Keep plain `node --experimental-strip-types` test files. Root `scripts/run-tests.mjs` discovers every `**/__tests__/*.test.ts` (excl. node_modules) and runs each, non-zero exit on any failure. Web E2E smoke via Playwright against `astro preview`.

## 5. SLICES
Each slice = one cheap implementation subagent + one commit `feat(<pkg>): <deliverable> [slice <id>]`. "Review" column: **O** = full Opus review of diff; **T** = orchestrator runs tests/typecheck + 30% spot-check only.

### W0 — Foundation (serial, first)
| ID | Deliverable | Files | Acceptance | Review |
|---|---|---|---|---|
| E0.1 | Build hygiene | `.gitignore` (+`.astro`,`.wrangler`,`test-results`), `git rm -r --cached apps/web/.astro`, `apps/web/astro.config.mjs` (remove aliases; use workspace deps), root `package.json` (`type: module`, `test`, `typecheck` over all 10 pkgs), `scripts/run-tests.mjs`, every package `package.json` `exports`/`main` → real entry, move `@easyschemedit/domain` to `dependencies`, `@types/*` to devDeps, delete `packages/domain/package-lock.json`, `.github/workflows/ci.yml` | `pnpm typecheck` exits 0 for all 10 packages; `pnpm test` runs all 62 existing tests, exit 0; `pnpm --filter @easyschemedit/web build` exits 0 | T |
| E0.2 | Baseline + evidence docs | `docs/agent/baseline.md` (update), `docs/fixtures/manifest.md`, `fixtures/real/README.md`, `docs/phase-0/assets-tests.md` (Mojang facts in §3) | files exist, numbers match §3 | T |

### W1 — Core packages (parallel after W0)
| ID | Deliverable | Files | Acceptance | Review |
|---|---|---|---|---|
| E1.1 | Formats public API + real gzip | `packages/formats/index.ts`, new `codec.ts` (fflate, bounded), `import.ts` `importSchematic(bytes, fileName, opts) → {group, placements, report}`, `export.ts` `exportSchematic(target: 'schem-v3'|'litematic', input, opts) → {bytes, report}` using existing adapters | new test `slice-e1-1-api.test.ts`: round-trip sponge v3 & litematic (multi-region, negative size) built in-test via domain APIs; oversized decompression rejected; legacy `.schematic` → unsupported error code | **O** |
| E1.2 | Real-fixture format tests | `packages/formats/__tests__/slice-e1-2-fixtures.test.ts`, `docs/phase-0/format-tests.md` | each file in `fixtures/real/` imports, re-exports, re-imports semantically equal; absent → BLOCKED | **O** |
| E1.3 | `EditorSession` command/query API | `packages/operations/src/session.ts` + index export; wires existing selection, region ops, transforms, clipboard, conflicts, bake, material list, history | test `slice-e1-3-session.test.ts`: every command type executes, undo/redo restores exact multi-placement state, revision increments, events fire, locked placement rejected | **O** |
| E1.4 | Gap-fill operations to spec | whatever `e2e-survey.md` marks STUB/PARTIAL in `packages/operations` vs SUBSPEC-D | per-op tests vs hand-computed expectations from SUBSPEC-D §§ (fill/replace/delete/hollow/walls/copy/cut/paste/move/bake, conflict categories, material list) | **O** |
| E1.5 | Persistence real IndexedDB + `.vxproj` + library | `packages/persistence/src/*` (inject `IDBFactory`), `.vxproj` via fflate zip, build-library store, autosave/recovery | tests with `fake-indexeddb`: save→load semantic equality, quota error surfaced without corrupting prior save, recovery snapshot, library CRUD | T |
| E1.6 | Asset pipeline real | `packages/asset-pipeline/src/*` (inject fetch/sha1/kv), zip extraction via fflate, resource-pack layering, version detect from JAR `version.json` | tests with in-memory zip built in test (synthetic, labelled as such): wrong SHA-1 rejected, progress events, extraction filters, pack override precedence | T |

### W2 — Renderer core (parallel with W1; pure TS)
| ID | Deliverable | Files | Acceptance | Review |
|---|---|---|---|---|
| E2.1 | Blockstate→model resolution | `packages/renderer/src/model-resolver.ts` (variants, multipart `when`/OR/AND, weighted pick deterministic, parent chain, texture `#var` resolution, x/y rotation, uvlock, missing-model fallback) | tests from SUBSPEC-E with hand-written JSON (stairs, fence multipart, log axis) | **O** |
| E2.2 | Texture atlas layout + pass classification | `texture-atlas.ts` (pure packing of sizes → UV rects, animated = first frame from `.mcmeta`), `render-pass.ts` (opaque/cutout/translucent/emissive per SUBSPEC-E rules), tints (grass/foliage/water defaults) | packing has no overlaps; known blocks classify correctly | T |
| E2.3 | Chunk mesher | `chunk-mesher.ts`: input = palette+indices of one 16³ chunk + neighbor accessor + resolved models; output typed arrays per pass; cullface vs opaque full-cube neighbors; element rotation; transparent same-block culling (glass) | tests: single cube 6 faces/24 verts; two adjacent cubes 10 faces; cross-chunk culling; stairs element count; 16³ full chunk < 50 ms | **O** |

### W3 — Web app (after E0.1; E3.2+ after E1.1/E1.3/E2.x)
| ID | Deliverable | Files | Acceptance | Review |
|---|---|---|---|---|
| E3.1 | App skeleton on packages | delete prototype logic; `apps/web/src/editor/` (`session-store.ts` wraps `EditorSession`, `workers/` parse/mesh/export workers using `packages/workers` protocol), design tokens CSS from `packages/ui` | `astro build` ok; Playwright: app loads, no console errors | T |
| E3.2 | Viewport | `apps/web/src/editor/viewport/` Three.js scene, chunk meshes from mesh worker, orbit+fly camera (SUBSPEC-E §camera), placement borders, origin markers, selection box, chunk/section/block overlays (off by default, viewport prefs), DDA hover + HUD, WebGL context-loss recovery | Playwright: import test fixture → canvas renders non-empty; mesh count ≈ chunk count not block count | T |
| E3.3 | Asset load panel | first-run auto download with progress → SHA-1 → worker extraction → IDB cache; `ASSET_DOWNLOAD_FAILED` → manual JAR drop zone; resource-pack manager | manual run against real Mojang (bypass) once, evidence in `docs/phase-0/assets-tests.md` | T |
| E3.4 | Layout + panels | S&box layout via `packages/ui` controllers: toolbar, outliner, inspector, bottom panels (Assets/Materials/Conflicts/History/Agent Log), status bar, shortcuts, tooltips, resizable/persisted | Playwright: panels render, resize persists across reload, shortcut opens panel | T |
| E3.5 | Import-and-place | drag/drop + picker, import report dialog, ghost preview at cursor, ground snap, R/M rotate/mirror, Esc cancel, undoable, multi-region → import group | Playwright with fixture | T |
| E3.6 | Placement ops + gizmo | move/rotate/mirror/hide/lock/rename/duplicate/delete, origin editing, group transforms, inspector fields | Playwright: transform + undo | T |
| E3.7 | Selection + region tools + block picker | cuboid select (world/placement scope), fill/replace/delete/hollow/walls/copy/cut/paste/move, block picker from asset block list | Playwright: fill then undo restores counts | T |
| E3.8 | Conflicts, bake, materials | conflict overlay modes + per-conflict navigation/resolution (only documented commands), bake dialog, material list (effective vs per-placement) | Playwright + unit for view-models | T |
| E3.9 | Projects, autosave, library, export | project list, autosave/recovery prompt, `.vxproj` open/save, build library (save/browse/search/place/delete), export dialog (schem v3/litematic, scope, strict/permissive report) | Playwright: export → re-import equal counts; reload restores project | T |

### W4 — MCP (after E1.3)
| ID | Deliverable | Files | Acceptance | Review |
|---|---|---|---|---|
| E4.1 | Companion wired | `apps/mcp-companion/src/server.ts` registers all SPEC-F §5 tools with Zod schemas → destructive protocol → session (relay to paired browser or local-file `EditorSession`) | tests: stdio client lists tools; dry-run→token→execute; stale revision / bad token / locked / over-limit rejected; path sandbox | **O** |
| E4.2 | Browser pairing + Agent Log | web pairing UI, WS client executing relayed commands through `EditorSession`, Agent Log panel with undo rule (D-8) | integration test: companion + headless browser session, agent fill shows in UI revision | T |

### W5 — Release (last)
| ID | Deliverable | Files | Acceptance | Review |
|---|---|---|---|---|
| E5.1 | Offline + deploy | service worker (app shell + no Mojang caching beyond IDB), `wrangler.toml` per SUBSPEC-H §4.3, CI: typecheck + tests + build + Playwright smoke | `pnpm build` + `wrangler deploy --dry-run` ok | T |
| E5.2 | Docs + final audit | root `README.md`, update `AGENTS.md` §7, `docs/agent/progress.md`, traceability H §10 (green/red/BLOCKED) | Opus final audit `docs/audits/e2e-final.md` | **O** |

## 6. EXECUTION ORDER
```
E0.1 → E0.2
      → [E1.1, E1.3(+E1.4), E1.5, E1.6, E2.1, E2.2] parallel
      → E2.3, E1.2(when fixtures), E3.1
      → E3.2, E3.3, E3.4 → E3.5..E3.9
      → E4.1 → E4.2 → E5.1 → E5.2
```
Parallel agents share the workspace but own disjoint files (listed per slice). Only the orchestrator commits (after review), staging the slice's files by path.

## 7. SUBAGENT BRIEF TEMPLATE (cheap model)
```
GOAL: <slice deliverable in one sentence>
CONSTRAINTS: AGENTS.md rules; touch only <files>; pure TS in packages; pinned deps from plan §2 only; no commits.
INPUTS: docs/plans/e2e-rebuild/index.md slice <id>; <spec sections>; <existing files>.
STEPS: read inputs → write failing test → implement → run acceptance commands → fix until green (max 3 honest attempts, else report BLOCKED with evidence).
OUTPUT: list of changed files, commands run with pasted results, open doubts (also appended to docs/agent/DOUBTS.md).
```

## 8. OPUS BUDGET RULES (user: ~35% Opus quota left)
- All exploration/research/verification runs on cheap subagents.
- Opus only: this plan, briefs, **O**-reviews (diff read of format/math/security code), final audit.
- **T**-reviews: a cheap verifier subagent runs commands and reports; orchestrator reads the report and spot-checks.

## 9. USER INPUTS NEEDED
- Drop real fixtures in `fixtures/real/`: Sponge v3 `.schem`, multi-region `.litematic` (ideally with a negative-size region), legacy `.schematic`, vanilla structure `.nbt`, plus one large (≥1M blocks) build if available.
- Approve sandbox-bypass prompts for `pnpm install`, `git commit`, the Mojang download test, and `wrangler`.
