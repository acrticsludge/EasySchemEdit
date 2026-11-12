# Subspec H — Slice h-4: Asset Pipeline Package

**Source:** `docs/specs/subs/SUBSPEC-H_ARCH_PHASES_RELEASE.md` §4.5 (Browser asset download validation), §10.2 Release acceptance items 3, 11, 12
**Constraint:** Zero-cost deployment, no paid services, CORS feasibility for Mojang endpoints, manual JAR fallback, SHA-1 verification, IndexedDB cache.

## Goal

Create the `packages/asset-pipeline/` package: version manifest → client JAR download → SHA-1 verification → IndexedDB cache → renderer-ready assets. Supports both auto-download and manual JAR import paths with `ASSET_DOWNLOAD_FAILED` fallback.

## Files to create/modify

| File | Action | Content |
|------|--------|---------|
| `packages/asset-pipeline/package.json` | create | No runtime deps (pure TS), devDeps for TS |
| `packages/asset-pipeline/tsconfig.json` | create | TypeScript config |
| `packages/asset-pipeline/src/version-manifest.ts` | create | Fetch Mojang version manifest, resolve 1.21.11 client JAR URL + SHA-1 |
| `packages/asset-pipeline/src/jar-verifier.ts` | create | SHA-1 verification against `downloads.client.sha1` from version JSON |
| `packages/asset-pipeline/src/asset-extractor.ts` | create | Zip open, extract blockstates/models/textures (+ .mcmeta, atlases, colormaps) |
| `packages/asset-pipeline/src/indexeddb-cache.ts` | create | IndexedDB cache keyed by version + hash, integrity check |
| `packages/asset-pipeline/src/asset-pipeline.ts` | create | Orchestrator: auto-download path, manual JAR path, failure fallback |

## Types / APIs

No runtime domain imports (packages/asset-pipeline must not import domain/formats — it's a lower-level package).

Key types:
- `AssetProfile`: `{ version: string; clientJarUrl: string; clientJarSha1: string; }`
- `AssetPipelineResult`: success with cached asset paths, or failure with `ASSET_DOWNLOAD_FAILED` code
- `ExtractionResult`: extracted file paths + integrity check results

## Acceptance criteria

1. `pnpm exec tsc --noEmit` passes for `packages/asset-pipeline`
2. Version manifest fetch resolves 1.21.11 client JAR URL and SHA-1
3. SHA-1 verification accepts correct JAR, rejects corrupt/wrong-version JAR
4. Manual JAR path: worker extraction → IndexedDB cache → renderer ready
5. Auto-download failure (CORS/network) → `ASSET_DOWNLOAD_FAILED`, surfaces manual JAR zone (never a dead end)
6. IndexedDB cache keyed by version + hash, integrity check on read
7. `packages/domain` and `packages/formats` still compile clean (no regressions)

## Tests

No new test file. Verification is via tsc and manual logic review. Fixture-based checks (real JAR download, CORS test) marked "to verify" per GOAL.md RULE #12.

## Verification

- `pnpm install` (from root, now includes `packages/asset-pipeline`)
- `cd packages/asset-pipeline && pnpm exec tsc --noEmit` exit code 0
- All 35 existing domain/format tests pass
