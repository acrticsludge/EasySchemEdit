# Subspec H — Slice h-7: Build/Test/CI Scripts

**Source:** `docs/specs/subs/SUBSPEC-H_ARCH_PHASES_RELEASE.md` §4.3 (CI/CD), §9 (Testing strategy)
**Constraint:** GitHub Actions: build on push, deploy to Cloudflare Workers on main, preview deployments for PRs.

## Goal

Create CI/CD pipeline: GitHub Actions workflow that builds all packages, runs tests on every push, deploys to Cloudflare Workers on main branch, and creates preview deployments for PRs.

## Files to create/modify

| File | Action | Content |
|------|--------|---------|
| `.github/workflows/ci.yml` | create | Build, test, lint on every push/PR; deploy on main |
| `.github/workflows/preview.yml` | create | Preview deployments for PRs (Cloudflare Workers preview) |
| `package.json` | modify | Add `test` script that runs all package tests |

## Acceptance criteria

1. CI workflow builds all packages (domain, formats, asset-pipeline, persistence, workers)
2. CI workflow runs all tests (35 test files)
3. CI workflow typechecks all packages (tsc --noEmit)
4. Deploy workflow deploys `apps/web` to Cloudflare Workers on main branch
5. Preview workflow creates preview deployments for PRs
6. All packages compile clean and all tests pass before commit

## Verification

- All package `tsc --noEmit` passes
- All 35 test files pass
- `.github/workflows/ci.yml` and `.github/workflows/preview.yml` are valid YAML
