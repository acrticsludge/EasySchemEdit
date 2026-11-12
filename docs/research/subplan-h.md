# Research Gate: Subplan-H Foundation (GOAL.md §PHASE 2)

**Source:** `docs/specs/subs/SUBSPEC-H_ARCH_PHASES_RELEASE.md` (locked decisions H1–H16)
**Goal:** Architecture/build-system foundation: pnpm workspaces, Astro static app, Cloudflare Workers deployment, MCP companion, asset pipeline package, IndexedDB persistence, Web Workers.

## Research questions

| # | Question | Primary source | Status |
|---|----------|----------------|--------|
| H-1 | pnpm workspaces + Astro: package layout and build scripts | pnpm docs, Astro docs | Pending |
| H-2 | Cloudflare Workers Static Assets: wrangler.toml config, `workers.dev` free address, SPA fallback routing | Cloudflare docs | Pending |
| H-3 | React editor island in Astro: `client:load` mounting, Three.js renderer isolation | Astro docs | Pending |
| H-4 | MCP companion: `@modelcontextprotocol/sdk` v2, stdio + localhost HTTP/WebSocket bridge | MCP SDK docs | Pending |
| H-5 | IndexedDB persistence for binary project chunks: library choice, schema, quota handling | MDN IndexedDB | Pending |
| H-6 | Web Workers for parsing/meshing/export: transferable buffers, typed messages | MDN Web Workers | Pending |
| H-7 | Asset pipeline: Mojang version manifest → client JAR SHA-1 → IndexedDB cache | Mojang version manifest API | Pending |
| H-8 | Version pinning: lockfile strategy, no unpinned `latest` CDN | npm/pnpm docs | Pending |

## Decisions (to fill after research)

| # | Decision | Evidence (URL/commit/section, access date) | Rejected options |
|---|----------|--------------------------------------------|------------------|
| H-1 | Package manager: pnpm workspaces (locked H2) | SUBSPEC-H §1 H2 | npm workspaces (rejected: H2 locks pnpm) |
| H-2 | Deployment: Cloudflare Workers Static Assets, free `workers.dev` (locked H8) | SUBSPEC-H §4.3 H3 | Vercel (rejected: H8 requires CF Workers free tier) |
| H-3 | No mandatory hosted DB/login/storage (locked H5, H10) | SUBSPEC-H §4.3 H5 | Supabase, Firebase (rejected) |
| H-4 | All editing client-side; IndexedDB + Web Workers (locked H11, H12) | SUBSPEC-H §4.3 H6 | Server-side computation (rejected) |
| H-5 | MCP as local Node companion via GitHub Releases/npm (locked H13) | SUBSPEC-H §1 H13 | Hosted MCP (rejected) |
| H-6 | Astro static output + React island, not separate Vite app (locked H1) | SUBSPEC-H §4.3 H2 | Vite standalone app (rejected) |

## Open questions → DOUBTS.md

None yet.
