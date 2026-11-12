# Subspec H — Slice h-0: pnpm Workspaces + Monorepo Layout

**Source:** `docs/specs/subs/SUBSPEC-H_ARCH_PHASES_RELEASE.md` §2.1 (Package layout), §1 H2 (pnpm workspaces locked)
**Constraint:** Zero-cost deployment, no mandatory hosted services.

## Goal

Convert the flat npm project to a pnpm workspaces monorepo matching SUBSPEC-H §2.1 layout. The root `package.json` becomes a workspace root; `packages/` contains shared TS packages; `apps/` contains deployable apps.

## Files to create/modify

| File | Action | Content |
|------|--------|---------|
| `pnpm-workspace.yaml` | create | Workspace globs for `packages/*` and `apps/*` |
| `package.json` | modify | Add `"workspaces"` field, `pnpm` scripts, remove `"type": "commonjs"` if needed |
| `packages/domain/package.json` | modify | Add `"name": "@easyschemedit/domain"`, `"private": true` |
| `packages/formats/package.json` | modify | Add `"name": "@easyschemedit/formats"`, `"private": true` |

## Types / APIs

No new runtime types. Package names become importable workspace references:
- `@easyschemedit/domain` → `packages/domain/`
- `@easyschemedit/formats` → `packages/formats/`

## Acceptance criteria

1. `pnpm install` succeeds and creates `node_modules/.pnpm` workspace symlinks
2. `packages/domain` and `packages/formats` resolve as `@easyschemedit/domain` and `@easyschemedit/formats`
3. `tsc --noEmit` passes for both packages (no regressions)
4. All existing tests pass (21 domain + 14 format tests)
5. `packages/domain` has zero imports of framework, browser, Node, Three.js, or MCP packages
6. Root `package.json` has `"private": true` and `"workspaces"` field

## Tests

No new test file. Verification is via `pnpm install`, `tsc`, and the existing test suites.

## Verification

- `pnpm install` exit code 0
- `cd packages/domain && pnpm exec tsc --noEmit` exit code 0
- `cd packages/formats && pnpm exec tsc --noEmit` exit code 0
- All 35 existing test files pass
