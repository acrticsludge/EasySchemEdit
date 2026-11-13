# Baseline — Phase 0 (GOAL.md §PHASE 0 step 2)

Generated: 2026-11-12

## Git state
- Branch: `master`
- Commit: `32ab14a` — Fix all packages/formats type errors and test issues
- Working tree: clean (`git status --short` empty)

## Package baseline results

### packages/domain
- `tsc --noEmit`: exit 0 (zero errors)
- Tests: 21 files, all PASS
  - slice-0-types, slice-0.5-shared-types, slice-1-nbt-ast, slice-2-volume, slice-2.5-volume-api, slice-3-chunk-mapping, slice-4-transform, slice-5-block-state, slice-5.5-block-state-string, slice-6-block-state-transforms, slice-7, slice-8-invariants, slice-8.5-effective-block, slice-8.6-ancillary-transforms, slice-8.7-bounds, slice-9-chunk-codec, slice-10-nbt-codec, slice-11-validation, slice-12-worker-protocol, slice-13-archive, slice-14-acceptance

### packages/formats
- `tsc --noEmit -p tsconfig.json`: exit 0 (zero errors)
- Tests: 14 files, all PASS
  - slice-b-0-types, slice-b-0.5-adapter, slice-b-1-nbts, slice-b-1.5-format-detection, slice-b-2-size, slice-b-3-packed-blockstates, slice-b-4-litematic, slice-b-5-export, slice-b-6-region-eligibility, slice-b-7-sponge-v2, slice-b-8-sponge-v3, slice-b-9-inspect, slice-b-10-legacy-id, slice-b-11-vanilla-nbt

### packages/assets
- Does not exist yet (planned for slice b-13)

## Uncommitted pre-existing changes
None. All staged/committed changes are author's own work.

---

# 2026-11-13 E2E Rebuild Baseline (Slice E0.2)

Recorded: 2026-11-13  
Reference Plan: `docs/plans/e2e-rebuild/index.md`

## Git state
- **Branch**: `e2e-rebuild`
- **Base commit**: `1ee816b` (`fix(web): TypeScript errors - types, paths, worker types`)
- **Untracked files prior to rebuild work**:
  - `AGENTS.md` (agent policy and instructions)
  - `CLAUDE.md` (agent pointer import)
  - `docs/plans/e2e-rebuild/index.md` (full E2E rebuild plan)
  - `docs/agent/e2e-survey.md` (implementation-depth survey)
  - `fixtures/real/README.md` (instructions for user-provided real fixtures)

## Pre-rebuild test and build status
- **Standalone test scripts**: 62 test files pass individually using `node --experimental-strip-types` across packages (`packages/domain`, `packages/formats`, `packages/operations`, `packages/persistence`, `packages/renderer`, `apps/mcp-companion`).
- **Root `pnpm test`**: Broken prior to slice E0.1 due to missing `tsx` dependency in root and Windows shell glob expansion failure in `package.json` (`node --import tsx --test packages/**/__tests__/*.test.ts`). Fixed in slice E0.1 via custom ESM test runner script `scripts/run-tests.mjs`.
- **`apps/web` build (`pnpm --filter @easyschemedit/web build`)**: Broken prior to slice E0.1 due to non-existent module alias `packages/domain/src/index.ts` in `astro.config.mjs`, committed `.astro/` generated files causing Windows file lock / EPERM errors, and unlinked package imports. Fixed in slice E0.1.
- **Root `pnpm typecheck`**: Incomplete prior to slice E0.1; skipped `operations`, `renderer`, `mcp-companion`, and `web`. Fixed in slice E0.1 to cover all 10 monorepo packages.

