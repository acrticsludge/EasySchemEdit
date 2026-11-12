# Subspec H — Architecture, Phases & Release: Slice Plan

**Source:** `docs/specs/subs/SUBSPEC-H_ARCH_PHASES_RELEASE.md` (locked decisions H1–H16)
**Constraint:** Zero mandatory hosted services, zero-cost deployment, all editing client-side.

## Method

Build in thin vertical slices per the incremental-implementation skill:
- Implement → Test → Verify → Commit → Next slice
- Each slice changes one logical thing
- Project must build and existing tests pass after each increment

## Slices (one consistent list)

| Slice | Focus | Deliverable | Tests |
|-------|-------|-------------|-------|
| `slice-h-0.md` | pnpm workspaces + monorepo layout | `pnpm-workspace.yaml`, `apps/`, `packages/` dirs, root `package.json` workspace | Workspace resolves; all packages install |
| `slice-h-1.md` | Astro static app shell + React editor island | `apps/web/astro.config.mjs`, React island entry, `client:load` mount | Astro build succeeds; island mounts |
| `slice-h-2.md` | Cloudflare Workers deployment | `apps/web/wrangler.toml`, `apps/web/src/worker.ts`, static assets binding | `wrangler deploy` dry-run valid |
| `slice-h-3.md` | MCP companion package | `apps/mcp-companion/package.json`, stdio server, localhost bridge | MCP server starts; health endpoint |
| `slice-h-4.md` | Asset pipeline package | `packages/asset-pipeline/`, version manifest → client JAR → IndexedDB cache | JAR SHA-1 verification; mock extraction |
| `slice-h-5.md` | IndexedDB persistence layer | `packages/persistence/` or in `packages/domain/`, project storage + binary chunks | IndexedDB CRUD; quota failure visible |
| `slice-h-6.md` | Web Workers setup | Worker entry points, typed messages, transferable buffers | Worker spawns; message round-trip |
| `slice-h-7.md` | Build/test/CI scripts | Root `package.json` scripts, GitHub Actions workflow | `pnpm test` runs all package tests |

## Acceptance Criteria (from SUBSPEC-H §4 validation + §10 release acceptance)

| # | Acceptance Item (SUBSPEC-H) | Slice(s) | Test File |
|---|-----------------------------|----------|-----------|
| 1 | Zero-cost deployment: Cloudflare Workers Static Assets, free `workers.dev`, no purchased domain | h-2 | (deploy dry-run) |
| 2 | No mandatory hosted DB, login, cloud storage, R2, D1, KV, Durable Objects, paid API or GPU | h-0, h-2 | (config audit) |
| 3 | All editing, rendering, imports, exports, material calculations, conflict detection, persistence client-side | h-5, h-6 | (client-side only) |
| 4 | IndexedDB for project storage; Web Workers for heavy processing | h-5, h-6 | (unit tests) |
| 5 | MCP as locally installed Node companion via free GitHub Releases or public npm | h-3 | (install test) |
| 6 | Offline functionality after initial assets and app shell cached | h-1, h-4 | (service worker) |
| 7 | Astro static output + React editor island (not separate Vite app) | h-1 | (astro build) |
| 8 | Wrangler config: `assets.directory = "dist"`, `assets.binding = "ASSETS"` | h-2 | (wrangler.toml) |
| 9 | Worker entry point `apps/web/src/worker.ts`, serves static build + SPA fallback | h-2 | (worker.ts) |
| 10 | Version pinning in lockfile; no runtime unpinned `latest` CDN assets | h-0 | (lockfile audit) |
| 11 | No Three.js/React/DOM/UI imports in `packages/domain` | h-0 | (dependency lint) |
| 12 | Release acceptance item 1: imports `.schem` v3 and `.litematic` fixtures | b-4, b-8 | slice-b-4-litematic.test.ts, slice-b-8-sponge-v3.test.ts |
| 13 | Release acceptance item 3: default asset profile pinned to Minecraft 1.21.11 | h-4 | (version manifest) |
| 14 | Release acceptance item 11: vanilla 1.21.11 assets available through default asset pipeline | h-4 | (asset pipeline) |
| 15 | Release acceptance item 12: custom resource packs can override vanilla assets | h-4 | (asset pipeline) |
| 16 | Phase 0 asset gate: browser CORS/download feasibility | b-13 | slice-b-13-asset-pipeline.test.ts |

## Research gate → docs/research/subplan-h.md

Research questions H-1 through H-8 documented there. Decisions to be filled in as each slice is implemented.

## Traceability: SUBSPEC-H §10 Release Acceptance (28 items)

The 16 original items + 12 additional requirements map primarily to later phases (domain, formats, rendering, operations). H foundation slices cover the infrastructure items above. Items requiring runtime behavior (import, render, transforms, conflicts, bake, export, MCP safety) are covered by subplan-a through subplan-g slice plans.

## Documentation (separate from slices)

This `index.md` is documentation, not an implementation slice.

## Verification checklist

- [ ] One consistent slice list (8 slices, no duplicates)
- [ ] Traceability table maps H foundation acceptance items
- [ ] No claims of verification without running tests
- [ ] Change committed with descriptive message
