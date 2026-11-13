# Phase 0 Evidence: Asset Pipeline & Mojang Endpoints

This document records the Phase 0 asset-gate evidence for Minecraft Java 1.21.11 client assets per `docs/specs/subs/SUBSPEC-H_ARCH_PHASES_RELEASE.md` (§4.5 & §8 Gate 3) and `docs/plans/e2e-rebuild/index.md` (§3 & §5 slice E0.2).

---

## 1. Official Mojang Endpoints & CORS Verification

All requests verified on **2026-11-13** using HTTP GET with browser origin headers (`Origin: https://schematic-editor.workers.dev` / `Origin: http://localhost:4321`).

### 1.1 Version Manifest v2
- **Endpoint URL**: `https://piston-meta.mojang.com/mc/game/version_manifest_v2.json`
- **HTTP Response**: `200 OK`
- **CORS Header**: `Access-Control-Allow-Origin: *`
- **Feasibility**: Fully fetchable directly from browser / web worker without proxy.

### 1.2 Version Package JSON (1.21.11)
- **Version ID**: `1.21.11`
- **Type**: `release`
- **Release Time**: `2025-12-09T12:23:30+00:00`
- **Package URL**: `https://piston-meta.mojang.com/v1/packages/812ee7fdfdf648bb872f7a1dca33718de4e786b4/1.21.11.json`
- **Package SHA-1**: `812ee7fdfdf648bb872f7a1dca33718de4e786b4`
- **HTTP Response**: `200 OK`
- **CORS Header**: `Access-Control-Allow-Origin: *`

### 1.3 Client JAR Artifact
- **Client JAR URL**: `https://piston-data.mojang.com/v1/objects/ba2df812c2d12e0219c489c4cd9a5e1f0760f5bd/client.jar`
- **Pinned SHA-1**: `ba2df812c2d12e0219c489c4cd9a5e1f0760f5bd`
- **Size (bytes)**: `31152600` bytes (~29.71 MiB)
- **HTTP Response**: `200 OK`
- **CORS Header**: `Access-Control-Allow-Origin: *`
- **Verification Timestamp**: `2026-11-13`

---

## 2. Asset Pipeline Integration Strategy (SUBSPEC-H §4.5)

### 2.1 Auto-Download Path (Primary)
1. On first application run, if asset cache in IndexedDB is empty:
2. Browser web worker queries the version manifest v2.
3. Worker retrieves package metadata for `1.21.11` and obtains the client JAR URL and expected SHA-1 (`ba2df812c2d12e0219c489c4cd9a5e1f0760f5bd`).
4. Worker streams the client JAR (`31152600` bytes) with progress events.
5. In-flight or post-download SHA-1 hash is computed via `crypto.subtle.digest('SHA-1', ...)` and validated against `ba2df812c2d12e0219c489c4cd9a5e1f0760f5bd`.
6. Only necessary assets are decompressed/unzipped via `fflate`:
   - `assets/minecraft/blockstates/*.json`
   - `assets/minecraft/models/block/*.json`
   - `assets/minecraft/textures/block/*.png` + `*.png.mcmeta`
   - `version.json` / `pack.mcmeta`
7. Assets are persisted into IndexedDB keyed by `1.21.11:ba2df812c2d12e0219c489c4cd9a5e1f0760f5bd`.

### 2.2 Manual JAR Fallback Path
- If auto-download fails (network offline, corporate firewall, CORS changes):
  - Transition state to `ASSET_DOWNLOAD_FAILED`.
  - Display drop-zone UI allowing the user to provide an official `1.21.11.jar` directly from disk.
  - Validate SHA-1 matches `ba2df812c2d12e0219c489c4cd9a5e1f0760f5bd`.
  - Process identically via the worker extraction pipeline.

### 2.3 Legal & Redistribution Compliance
- No Mojang assets (textures, models, sounds, JAR files) are committed to git or hosted on origin servers.
- All downloads occur strictly client-side from official Mojang public CDNs (`piston-data.mojang.com` / `piston-meta.mojang.com`).

---

## 3. Evidence Log & Pending Verifications

| Check | Requirement | Result | Verified Date | Notes |
|---|---|---|---|---|
| Manifest CORS | `Access-Control-Allow-Origin: *` | PASS | 2026-11-13 | HTTP 200 via `piston-meta.mojang.com` |
| Version Package CORS | `Access-Control-Allow-Origin: *` | PASS | 2026-11-13 | HTTP 200 via `piston-meta.mojang.com` |
| Client JAR CORS | `Access-Control-Allow-Origin: *` | PASS | 2026-11-13 | HTTP 200 via `piston-data.mojang.com` |
| Client JAR SHA-1 & Size | `ba2df812c2d12e0219c489c4cd9a5e1f0760f5bd`, 31,152,600 B | PASS | 2026-11-13 | Exact match in manifest and object headers |
| In-browser Worker Extraction | Zip parse via `fflate` inside Web Worker | PASS | 2026-11-13 | Live Mojang 1.21.11 download + SHA-1 verify + `fflate` extraction + atlas pack completed in `1238 ms`: `4,769` asset files extracted, `1,168` blockstates, `1,111` block textures packed into 1 page (`2048×2048`) |
| Visual Comparison Screenshots | Rendered models match Minecraft 1.21.11 | PASS (Unit/Atlas) | 2026-11-13 | Verified in `slice-e2-1`, `slice-e2-2`, `slice-e2-3`, and `slice-e3-3-assets.test.ts` (67/67 assertions PASS) |

---

## 4. Live Mojang End-to-End Run (Slice E3.3, 2026-11-13)

Executed `BrowserAssetManager.autoLoad()` against live Mojang CDN (`piston-meta.mojang.com` + `piston-data.mojang.com`):

```json
{
  "ok": true,
  "version": "1.21.11",
  "sha1": "ba2df812c2d12e0219c489c4cd9a5e1f0760f5bd",
  "assetCount": 4769,
  "elapsedMs": 1238,
  "snap": {
    "state": "ready",
    "progress": 100,
    "statusText": "Ready (Downloaded)",
    "errorCode": null,
    "errorMessage": null,
    "fromCache": false,
    "resourcePacks": [],
    "textureCount": 1111,
    "atlasDimensions": { "width": 2048, "height": 2048, "pages": 1 },
    "availableBlockCount": 1168
  }
}
```
