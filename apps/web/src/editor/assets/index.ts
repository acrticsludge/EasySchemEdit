// apps/web/src/editor/assets/index.ts
// Public exports for browser asset management (Slice E3.3, AD-4).

export {
  BrowserAssetManager,
  defaultPngDimensionReader,
  FALLBACK_BLOCK_IDS,
  type BrowserAssetManagerState,
  type BrowserAssetManagerOptions,
  type BrowserAssetManagerSnapshot,
  type ResourcePackEntry,
} from './asset-manager.ts';

export {
  AssetLoadPanel,
  type AssetLoadPanelProps,
} from './AssetLoadPanel.tsx';
