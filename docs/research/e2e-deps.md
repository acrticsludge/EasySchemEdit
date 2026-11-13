# E2E Rebuild Dependencies Research (`docs/research/e2e-deps.md`)

Date: 2026-11-13
Reference: `docs/plans/e2e-rebuild/index.md` §2 & §4 (AD-2, AD-4, AD-6)

| Package | Version (Pinned) | License | Consumers | Purpose & Primary Source |
|---|---|---|---|---|
| `fflate` | `0.8.2` | MIT | `@easyschemedit/formats`, `@easyschemedit/persistence`, `@easyschemedit/asset-pipeline` | Pure JS/TS streaming and synchronous gzip/zlib/ZIP compression and decompression in Node, Browser, and Web Workers. Registry: `https://registry.npmjs.org/fflate/0.8.2` |
| `fake-indexeddb` | `6.0.0` | Apache-2.0 | `@easyschemedit/persistence` (devDependency) | Pure JS in-memory W3C IndexedDB implementation for deterministic Node unit testing of `packages/persistence`. Registry: `https://registry.npmjs.org/fake-indexeddb/6.0.0` |
| `@playwright/test` | `1.48.2` | Apache-2.0 | Root / `@easyschemedit/web` (devDependency, W3/W5) | Headless browser E2E smoke testing for Astro + React + Three.js editor island. Registry: `https://registry.npmjs.org/@playwright/test/1.48.2` |

## Rejected Options
- `pako` / `jszip`: `jszip` is significantly heavier, slower, and lacks synchronous streaming chunk decompression bounds; `fflate` provides both streaming `Decompress`/`Gunzip` (for bounded decompression limits per GOAL Phase 1 #6) and `zipSync`/`unzipSync`.
- Native browser `CompressionStream`/`DecompressionStream` alone: Does not parse ZIP central directories/local headers by itself, and streaming byte-budget enforcement before allocation is simpler and synchronous/deterministic with `fflate`.
