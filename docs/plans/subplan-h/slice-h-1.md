# Subspec H — Slice h-1: Astro Static App Shell + React Editor Island

**Source:** `docs/specs/subs/SUBSPEC-H_ARCH_PHASES_RELEASE.md` §4.3 (Deployment architecture), H1 (Astro shell + React editor island locked), §2.2 (Technology baseline)
**Constraint:** Zero-cost deployment, no mandatory hosted services, Astro static output (not separate Vite app).

## Goal

Create the `apps/web/` Astro application shell with a React editor island that mounts via `client:load`. This is the deployable static frontend. No editor UI code yet — just the shell infrastructure.

## Files to create/modify

| File | Action | Content |
|------|--------|---------|
| `apps/web/package.json` | create | Astro + React dependencies, `astro build` script |
| `apps/web/astro.config.mjs` | create | `output: 'static'`, `integrations: [react()]`, `build: { assets: '_astro' }` |
| `apps/web/src/pages/index.astro` | create | Static page with React editor island placeholder |
| `apps/web/src/layouts/BaseLayout.astro` | create | Base layout shell |
| `apps/web/src/islands/EditorIsland.tsx` | create | React island that mounts document store + command bus + Three.js viewport (stub) |
| `apps/web/tsconfig.json` | create | TypeScript config for Astro app |

## Types / APIs

No runtime domain types. The EditorIsland is a stub that:
- Mounts on `client:load`
- Renders a placeholder viewport
- Imports nothing from `@easyschemedit/domain` yet (that's h-5+)

## Acceptance criteria

1. `pnpm --filter @easyschemedit/web astro build` succeeds and produces `apps/web/dist/`
2. `apps/web/dist/` contains `index.html` and `_astro/` assets
3. `apps/web` resolves as `@easyschemedit/web` workspace package
4. Astro config matches SUBSPEC-H §4.3: `output: 'static'`, `integrations: [react()]`
5. `packages/domain` and `packages/formats` still have zero framework imports (no regressions)

## Tests

No new test file. Verification is via `astro build` and inspecting `apps/web/dist/`.

## Verification

- `pnpm install` (from root, now includes `apps/web`)
- `cd apps/web && pnpm exec astro build` exit code 0
- `apps/web/dist/index.html` exists
- `apps/web/dist/_astro/` exists
