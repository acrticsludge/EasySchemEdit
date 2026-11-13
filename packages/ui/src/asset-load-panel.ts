// packages/ui/src/asset-load-panel.ts
// Asset load panel: auto-download, manual JAR, progress, cancel, checksum.
// Pure TypeScript. SUBSPEC-G §6.4 (Assets tab), §8.2 item 20.

// ============================================================================
// Types
// ============================================================================

export type AssetLoadState = 'idle' | 'downloading' | 'verifying' | 'ready' | 'failed' | 'manual-import';

export type AssetLoadPanel = {
  state(): AssetLoadState;
  progress(): number; // 0..100
  checksum(): string | null;
  errorMessage(): string | null;
  manualImportAvailable(): boolean;
  startAutoDownload(): void;
  updateProgress(percent: number): void;
  finishDownload(actualChecksum: string): void;
  failDownload(reason: string): void;
  cancelDownload(): boolean;
  importManualJar(path: string, checksum: string): boolean;
  reset(): void;
  statusLabel(): string;
};

export type AssetLoadPanelOptions = {
  expectedChecksum?: string;
};

// ============================================================================
// Factory
// ============================================================================

export function createAssetLoadPanel(options?: AssetLoadPanelOptions): AssetLoadPanel {
  const expectedChecksum = options?.expectedChecksum ?? null;

  let state: AssetLoadState = 'idle';
  let progress = 0;
  let checksum: string | null = null;
  let errorMessage: string | null = null;
  let manualImportAvailable = false;
  let cancelled = false;

  function stateFn(): AssetLoadState {
    return state;
  }

  function progressFn(): number {
    return progress;
  }

  function checksumFn(): string | null {
    return checksum;
  }

  function errorMessageFn(): string | null {
    return errorMessage;
  }

  function manualImportAvailableFn(): boolean {
    return manualImportAvailable;
  }

  function startAutoDownload(): void {
    state = 'downloading';
    progress = 0;
    errorMessage = null;
    manualImportAvailable = false;
    cancelled = false;
  }

  function updateProgress(percent: number): void {
    if (state === 'downloading') {
      progress = Math.max(0, Math.min(100, percent));
    }
  }

  function finishDownload(actualChecksum: string): void {
    if (state !== 'downloading') return;
    state = 'verifying';
    progress = 100;
    if (expectedChecksum !== null && actualChecksum !== expectedChecksum) {
      state = 'failed';
      errorMessage = 'Checksum mismatch';
      manualImportAvailable = true; // never a dead end
      return;
    }
    checksum = actualChecksum;
    state = 'ready';
    manualImportAvailable = false;
  }

  function failDownload(reason: string): void {
    state = 'failed';
    errorMessage = reason;
    manualImportAvailable = true; // never a dead end
  }

  function cancelDownload(): boolean {
    if (state === 'downloading') {
      state = 'idle';
      progress = 0;
      cancelled = true;
      return true;
    }
    return false;
  }

  function importManualJar(path: string, cs: string): boolean {
    if (path.length === 0) return false;
    if (expectedChecksum !== null && cs !== expectedChecksum) {
      state = 'failed';
      errorMessage = 'Manual JAR checksum mismatch';
      manualImportAvailable = true;
      return false;
    }
    checksum = cs;
    state = 'ready';
    errorMessage = null;
    manualImportAvailable = false;
    return true;
  }

  function reset(): void {
    state = 'idle';
    progress = 0;
    checksum = null;
    errorMessage = null;
    manualImportAvailable = false;
    cancelled = false;
  }

  function statusLabel(): string {
    switch (state) {
      case 'idle': return 'Assets not loaded';
      case 'downloading': return `Downloading… ${progress}%`;
      case 'verifying': return 'Verifying…';
      case 'ready': return 'Assets ready';
      case 'failed': return errorMessage ?? 'Failed';
      case 'manual-import': return 'Import JAR manually';
    }
  }

  return {
    state: stateFn,
    progress: progressFn,
    checksum: checksumFn,
    errorMessage: errorMessageFn,
    manualImportAvailable: manualImportAvailableFn,
    startAutoDownload,
    updateProgress,
    finishDownload,
    failDownload,
    cancelDownload,
    importManualJar,
    reset,
    statusLabel,
  };
}
