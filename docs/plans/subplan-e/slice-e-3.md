# Subspec E — Slice e-3: Asset Loading Flow

**Source:** `docs/specs/subs/SUBSPEC-E_RENDERING_RESOURCE_PACKS.md` §3.1 (Asset loading flow), §3.5 (Texture animation)
**Constraint:** Pure TypeScript, zero Three.js/React/DOM/UI imports. Imports from `@easyschemedit/domain` and `@easyschemedit/operations` via relative paths only.

## Goal

Implement asset loading flow types: AssetLoadState, AssetLoadOptions, AssetLoadResult, AssetLoadingState, AnimationFrame. These are pure type definitions for the asset loading state machine.

## Files

| File | Action | Content |
|------|--------|---------|
| `packages/renderer/src/asset-loading.ts` | create | `AssetLoadState`, `AssetLoadOptions`, `AssetLoadResult`, `AssetLoadingState`, `AnimationFrame` types |

## Types / APIs

```ts
export type AssetLoadState = 'not-started' | 'checking-cache' | 'downloading' | 'extracting' | 'caching' | 'ready' | 'failed';

export type AssetLoadOptions = {
  autoDownload: boolean;              // try auto-download from official sources
  manualJarPath?: string;             // path to user-provided JAR
  maxDownloadSizeBytes: number;       // safety cap
  timeoutMs: number;                  // download timeout
};

export type AssetLoadResult = {
  success: boolean;
  state: AssetLoadState;
  assetHash?: string;                 // SHA-1 of extracted assets
  modelCount: number;
  textureCount: number;
  blockStateCount: number;
  warnings: string[];
  error?: string;
};

export type AssetLoadingState = {
  state: AssetLoadState;
  progress: number;                   // 0-1
  bytesDownloaded: number;
  bytesTotal: number;
  currentStep: string;
  startTime: number;
  lastUpdate: number;
};

export type AnimationFrame = {
  textureId: string;
  frameIndex: number;
  frameTime: number;                  // milliseconds per frame
  totalFrames: number;
};
```

## Acceptance criteria

1. `AssetLoadState` has: not-started, checking-cache, downloading, extracting, caching, ready, failed
2. `AssetLoadOptions` has autoDownload, manualJarPath?, maxDownloadSizeBytes, timeoutMs
3. `AssetLoadResult` has success, state, assetHash?, modelCount, textureCount, blockStateCount, warnings, error?
4. `AssetLoadingState` has state, progress (0-1), bytesDownloaded, bytesTotal, currentStep, startTime, lastUpdate
5. `AnimationFrame` has textureId, frameIndex, frameTime, totalFrames
6. Asset loading does not block schematic editing and does not increment revision
7. Until assets ready: blocks render with missing-model fallback, warning banner shown

## Tests

No test file yet — type definitions only. Verification via typecheck. Test file `slice-e-3-asset-loading.test.ts` to be created with test harness.

## Verification

- TypeScript compiles clean for `packages/renderer`
