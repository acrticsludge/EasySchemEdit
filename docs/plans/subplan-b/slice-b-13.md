# Subspec B — Slice b-13: Asset Pipeline (packages/assets)

**Goal:** Write the asset pipeline and first-run flow as a separate slice set under `packages/assets` (not `packages/formats`). Remove zip-validation from `packages/formats`.

## Files to Create

| File | Purpose |
|------|---------|
| `packages/assets/asset-pipeline.ts` | Manifest → version JSON → client JAR |
| `packages/assets/asset-extraction.ts` | Recursive extraction of blockstates/models/textures |
| `packages/assets/asset-cache.ts` | IndexedDB cache with integrity check |
| `packages/assets/first-run.ts` | First-run panel behavior |
| `packages/assets/phase0.ts` | Phase 0 CORS gate |

## Asset Pipeline

1. Manifest → version JSON (id/name fields; wrong-version check)
2. Download client JAR from official metadata
3. SHA-1 vs `downloads.client.sha1` verification
4. Manual JAR vs pinned SHA-1 (user-supplied JAR)
5. Recursive extraction: blockstates/, models/, textures/ (+ `.mcmeta`, atlases, colormaps)
6. IndexedDB cache with integrity check (SHA-1)
7. `ASSET_*` diagnostic codes

## First-Run Panel Behavior

- Auto-download client JAR
- Manual JAR fallback
- Never a dead end (always an option)
- Phase 0 CORS gate: verifies browser CORS/download feasibility for official Mojang asset endpoints

## Removal from formats

- Zip validation removed from `packages/formats` (moved to `packages/assets`)
- Hash checks removed from `packages/formats` (moved to `packages/assets`)

## Acceptance Criteria

- [ ] Asset pipeline under `packages/assets` (not `packages/formats`)
- [ ] Manifest → version JSON → client JAR flow
- [ ] SHA-1 vs `downloads.client.sha1` verification
- [ ] Manual JAR vs pinned SHA-1
- [ ] Recursive extraction: blockstates/models/textures + .mcmeta/atlases/colormaps
- [ ] IndexedDB cache with integrity check
- [ ] `ASSET_*` diagnostic codes
- [ ] First-run panel: auto-download, manual JAR fallback, never dead end
- [ ] Phase 0 CORS gate
- [ ] Zip validation removed from `packages/formats`

## Tests

**File:** `packages/assets/__tests__/slice-b-13-asset-pipeline.test.ts`

1. Manifest → version JSON → client JAR flow
2. SHA-1 verification against `downloads.client.sha1`
3. Manual JAR vs pinned SHA-1
4. Recursive extraction of blockstates/models/textures
5. IndexedDB cache integrity check
6. First-run panel behavior (auto-download, fallback, never dead end)
7. Phase 0 CORS gate
8. No zip-validation code in `packages/formats`

## Verification Checklist

- [ ] Change does one thing completely (asset pipeline under packages/assets)
- [ ] TypeScript compiles without errors
- [ ] All new tests pass
- [ ] Change committed with descriptive message
