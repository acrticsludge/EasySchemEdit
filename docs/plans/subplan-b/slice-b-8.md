# Subspec B — Slice b-8: Asset Extraction Pipeline

**Goal:** Implement asset extraction: obtain client JAR from official Mojang metadata, extract blockstates/models/textures in worker, cache in IndexedDB, identical pipeline for manual JAR import.

## Files to Create/Modify

| File | Purpose |
|------|---------|
| `packages/formats/asset-pipeline.ts` | Asset extraction pipeline |

## Pipeline Steps

1. **Resolve pinned Minecraft version manifest** (official Mojang launchmeta)
   - Auto-download: fetch manifest from Mojang, parse version JSON for `downloads.client.url`
   - Manual JAR: skip manifest; accept user-provided JAR file directly

2. **Download client JAR** (auto-download) or **accept user-provided JAR** (manual)
   - Show progress bar, percentage, estimated time, cancel button
   - Enforce size/zip-safety limits before extraction

3. **In a worker:**
   a. Open JAR as zip (validate zip paths, file count, decompressed size)
   b. Accept only a client JAR for the base profile. Resource-pack zips are override-only; if no base assets exist, warn that overrides have nothing to fall back on.
   c. Extract `assets/minecraft/blockstates/*.json`, `assets/minecraft/models/*.json`, `assets/minecraft/textures/*.png`
   d. Verify client JAR integrity:
      - Auto-download: verify SHA-1 of downloaded JAR against `downloads.client.sha1` from version JSON
      - Manual JAR: verify SHA-1 against pinned expected SHA-1 for 1.21.11 bundled in the app
      - Detect `ASSET_WRONG_VERSION` by reading `version.json` at JAR root and comparing its embedded `version` field against `1.21.11`
   e. On integrity failure: `ASSET_CORRUPT_JAR` or `ASSET_WRONG_VERSION`; partial cache not retained

4. **Cache extracted assets** in IndexedDB keyed by version + asset hash
   - Cache once, then fully offline
   - On read, verify cache integrity; on failure: `ASSET_CACHE_CORRUPT`, re-download required

5. **Resource packs** override vanilla base pack; priority order explicit and visible

6. **Missing blocks/models/textures** → missing-model fallback + diagnostic

## Acceptance Criteria

- [ ] Client JAR obtained from official metadata (version manifest → downloads.client.url)
- [ ] Extract blockstates/models/textures in worker
- [ ] Cache in IndexedDB keyed by version + asset hash
- [ ] Identical pipeline for manual JAR import
- [ ] SHA-1 verification: auto-download uses `downloads.client.sha1`; manual JAR uses pinned expected SHA-1
- [ ] `ASSET_WRONG_VERSION` detected from JAR's `version.json`
- [ ] Cache verified on read; `ASSET_CACHE_CORRUPT` on failure
- [ ] Resource-pack zips are override-only; warn if no base assets exist

## Tests

**File:** `packages/formats/__tests__/slice-b-8-asset-pipeline.test.ts`

1. Version manifest resolved → `downloads.client.url` extracted
2. SHA-1 verification against `downloads.client.sha1`
3. Manual JAR SHA-1 verification against pinned expected SHA-1
4. `version.json` read → `ASSET_WRONG_VERSION` if version mismatch
5. Assets extracted to correct paths (`assets/minecraft/blockstates/`, etc.)
6. IndexedDB cache keyed by version + asset hash
7. Cache integrity check on read → `ASSET_CACHE_CORRUPT` on failure

## Verification Checklist

- [ ] Change does one thing completely (asset extraction pipeline)
- [ ] TypeScript compiles without errors
- [ ] All new tests pass
- [ ] Change committed with descriptive message
