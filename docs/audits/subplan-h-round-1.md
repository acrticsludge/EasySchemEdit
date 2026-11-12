# Phase 3 Audit Round 1 — Subplan-H (Architecture, Phases & Release)

**Source:** `docs/plans/subplan-h/index.md`, `docs/specs/subs/SUBSPEC-H_ARCH_PHASES_RELEASE.md`
**Method:** Fresh-context audit per GOAL.md §PHASE 3. Severity-ranked findings with evidence.

## Findings

### High

**MH-1: No test files exist for any subplan-h slice**

- Evidence: The traceability table maps 16 acceptance items to test files, but no test files exist for any subplan-h package. `packages/asset-pipeline/__tests__/`, `packages/persistence/__tests__/`, `packages/workers/__tests__/` do not exist. `apps/web/__tests__/` and `apps/mcp-companion/__tests__/` do not exist.
- Impact: Zero test coverage for the H foundation infrastructure. All 16 traceability-mapped acceptance items are unverified.
- Fix: Create test files for slices h-0 through h-7, or mark as "to verify" per GOAL.md rules.

### Medium

**MH-2: Slice count mismatch — verification checklist says 7 slices but lists 8**

- Evidence: subplan-h/index.md verification checklist says "One consistent slice list (7 slices, no duplicates)" but the slice table lists h-0 through h-7, which is 8 slices.
- Impact: Inconsistent slice count could cause confusion about plan completeness.
- Fix: Update verification checklist to say "8 slices".

**MH-3: Slice h-5 has ambiguous package location**

- Evidence: subplan-h/index.md slice h-5 deliverable says "`packages/persistence/` or in `packages/domain/`". The IndexedDB persistence layer could live in either package, but no decision is recorded.
- Impact: Unclear where persistence code should live; creates package boundary ambiguity.
- Fix: Decide whether persistence lives in packages/persistence (new package) or packages/domain (existing package), update the plan accordingly.

**MH-4: Slice h-4 overlaps with subplan-b slice b-13 (Asset pipeline)**

- Evidence: subplan-h/index.md slice h-4 covers "Asset pipeline package: version manifest → client JAR → IndexedDB cache". subplan-b/index.md slice b-13 covers "Asset Pipeline (packages/assets): client JAR from official metadata, extracts blockstates/models/textures in worker, caches in IndexedDB". Both cover asset pipeline implementation.
- Impact: Unclear which subplan owns asset pipeline implementation; risk of duplicate implementation.
- Fix: Clarify ownership — subplan-b defines the asset pipeline specification and contracts, subplan-h implements the runtime package (packages/asset-pipeline).

**MH-5: Acceptance item 12 mapped to h-4 but .schem/.litematic import belongs to subplan-b**

- Evidence: subplan-h/index.md row 12 maps acceptance item 12 ("Release acceptance item 1: imports .schem v3 and .litematic fixtures") to h-4 (asset pipeline). However, importing .schem v3 and .litematic files is format adapter functionality that belongs to subplan-b (File Formats), not the asset pipeline.
- Impact: Acceptance item mapped to wrong subplan — the asset pipeline handles asset downloads, not schematic format parsing.
- Fix: Re-map acceptance item 12 to subplan-b (format adapters), or clarify that h-4 only handles the asset download portion while b-4/b-8 handle the format parsing.

**MH-6: Acceptance item 16 mapped to h-4 but CORS/download feasibility belongs to subplan-b**

- Evidence: subplan-h/index.md row 16 maps acceptance item 16 ("Phase 0 asset gate: browser CORS/download feasibility for official Mojang endpoints") to h-4 (asset pipeline). While h-4 implements the asset pipeline, the CORS/download feasibility verification is a subplan-b acceptance gate concern.
- Impact: Acceptance item mapped to wrong subplan — the feasibility verification is a planning/audit concern, not purely an implementation concern.
- Fix: Re-map acceptance item 16 to subplan-b (asset pipeline feasibility) or clarify that h-4 implements while b-13 verifies feasibility.

### Low

**MH-7: No test files exist — verification checklist item cannot be satisfied**

- Evidence: subplan-h/index.md verification checklist says "No claims of verification without running tests" but no tests exist.
- Impact: The plan's own verification requirement is unmet.
- Fix: Create test files or mark all as "to verify".

## Traceability: SUBSPEC-H §10 Acceptance → Slice → Test File (with gaps flagged)

| # | Acceptance Item | Slice | Test File | Status |
|---|-----------------|-------|-----------|--------|
| 1 | Zero-cost deployment: Cloudflare Workers Static Assets, free workers.dev | h-2 | (deploy dry-run) | NOT CREATED (MH-1) |
| 2 | No mandatory hosted DB, login, cloud storage, paid API or GPU | h-0, h-2 | (config audit) | NOT CREATED (MH-1) |
| 3 | All editing, rendering, imports, exports client-side | h-5, h-6 | (client-side only) | NOT CREATED (MH-1) |
| 4 | IndexedDB for project storage; Web Workers for heavy processing | h-5, h-6 | (unit tests) | NOT CREATED (MH-1) |
| 5 | MCP as locally installed Node companion via GitHub Releases/npm | h-3 | (install test) | NOT CREATED (MH-1) |
| 6 | Offline functionality after initial assets and app shell cached | h-1, h-4 | (service worker) | NOT CREATED (MH-1) |
| 7 | Astro static output + React editor island | h-1 | (astro build) | NOT CREATED (MH-1) |
| 8 | Wrangler config: assets.directory = "dist", assets.binding = "ASSETS" | h-2 | (wrangler.toml) | NOT CREATED (MH-1) |
| 9 | Worker entry point apps/web/src/worker.ts | h-2 | (worker.ts) | NOT CREATED (MH-1) |
| 10 | Version pinning in lockfile; no unpinned latest CDN assets | h-0 | (lockfile audit) | NOT CREATED (MH-1) |
| 11 | No Three.js/React/DOM/UI imports in packages/domain | h-0 | (dependency lint) | NOT CREATED (MH-1) |
| 12 | Release acceptance item 1: imports .schem v3 and .litematic fixtures | h-4 | (asset pipeline) | NOT CREATED (MH-1, MH-5) |
| 13 | Release acceptance item 3: default asset profile pinned to 1.21.11 | h-4 | (version manifest) | NOT CREATED (MH-1) |
| 14 | Release acceptance item 11: vanilla 1.21.11 assets through default pipeline | h-4 | (asset pipeline) | NOT CREATED (MH-1) |
| 15 | Release acceptance item 12: custom resource packs override vanilla | h-4 | (asset pipeline) | NOT CREATED (MH-1) |
| 16 | Phase 0 asset gate: browser CORS/download feasibility | h-4 | slice-h-4-asset-pipeline.test.ts | NOT CREATED (MH-1, MH-6) |

## Verdict

Subplan-H is **Red** — no test files exist for any slice, and there are cross-subspec boundary ambiguities (MH-4, MH-5, MH-6) plus a slice count mismatch (MH-2) and ambiguous package location (MH-3).

## Recommended Fixes

1. Fix MH-1: Create test files for all h-slices, or mark as "to verify" pending test harness
2. Fix MH-2: Update verification checklist to "8 slices"
3. Fix MH-3: Decide persistence package location (packages/persistence or packages/domain)
4. Fix MH-4: Clarify asset pipeline ownership — subplan-b (spec/contracts) vs subplan-h (runtime package)
5. Fix MH-5: Re-map acceptance item 12 to subplan-b (format adapters) or clarify h-4 scope
6. Fix MH-6: Re-map acceptance item 16 to subplan-b (feasibility verification) or clarify h-4 scope
7. Fix MH-7: Create test files or mark all as "to verify"
