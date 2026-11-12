// packages/renderer/src/asset-loading.ts
// Asset loading flow types (SUBSPEC-E §3.1, §3.5).
// Pure TypeScript, zero Three.js/React/DOM/UI imports.

// ============================================================================
// Asset Load State
// ============================================================================

export type AssetLoadState =
  | 'not-started'
  | 'checking-cache'
  | 'downloading'
  | 'extracting'
  | 'caching'
  | 'ready'
  | 'failed';

// ============================================================================
// Asset Load Options
// ============================================================================

export type AssetLoadOptions = {
  autoDownload: boolean;            // try auto-download from official sources
  manualJarPath?: string;           // path to user-provided JAR
  maxDownloadSizeBytes: number;     // safety cap
  timeoutMs: number;                // download timeout
};

// ============================================================================
// Asset Load Result
// ============================================================================

export type AssetLoadResult = {
  success: boolean;
  state: AssetLoadState;
  assetHash?: string;               // SHA-1 of extracted assets
  modelCount: number;
  textureCount: number;
  blockStateCount: number;
  warnings: string[];
  error?: string;
};

// ============================================================================
// Asset Loading State (runtime progress tracking)
// ============================================================================

export type AssetLoadingState = {
  state: AssetLoadState;
  progress: number;                 // 0-1
  bytesDownloaded: number;
  bytesTotal: number;
  currentStep: string;
  startTime: number;
  lastUpdate: number;
};

// ============================================================================
// Animation Frame (texture animation)
// ============================================================================

export type AnimationFrame = {
  textureId: string;
  frameIndex: number;
  frameTime: number;                // milliseconds per frame
  totalFrames: number;
};
