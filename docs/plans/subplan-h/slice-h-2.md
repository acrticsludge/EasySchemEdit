# Subspec H — Slice h-2: Cloudflare Workers Deployment

**Source:** `docs/specs/subs/SUBSPEC-H_ARCH_PHASES_RELEASE.md` §4.3 (Deployment architecture), H8 (Cloudflare Workers Static Assets locked), H2 (zero-cost deployment)
**Constraint:** Zero-cost deployment, free `workers.dev` address, no purchased domain, no custom domain required.

## Goal

Configure Wrangler for Cloudflare Workers Static Assets deployment of the Astro static build (`apps/web/dist`). The worker serves the static build and falls back to `index.html` for SPA routes.

## Files to create/modify

| File | Action | Content |
|------|--------|---------|
| `apps/web/wrangler.toml` | create | Wrangler config: name, main, compatibility_date, node_compat, assets directory + binding |
| `apps/web/src/worker.ts` | create | Worker entry point: serve static assets, SPA fallback to index.html |

## Types / APIs

No runtime domain types. The worker is a standard Cloudflare Workers static assets handler.

## Acceptance criteria

1. `wrangler deploy --dry-run` succeeds (validates config without deploying)
2. `apps/web/wrangler.toml` has `assets.directory = "./dist"`, `assets.binding = "ASSETS"`
3. Worker entry point is `apps/web/src/worker.ts`
4. `compatibility_date` set, `compatibility_flags` includes `nodejs_compat`
5. `packages/domain` and `packages/formats` still compile clean (no regressions)

## Tests

No new test file. Verification is via `wrangler deploy --dry-run`.

## Verification

- `cd apps/web && pnpm exec wrangler deploy --dry-run` exit code 0
- `apps/web/wrangler.toml` exists with correct fields
- `apps/web/src/worker.ts` exists
