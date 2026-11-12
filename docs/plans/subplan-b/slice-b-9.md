# Subspec B — Slice b-9: First-Run Asset Load Flow

**Goal:** Implement the first-run "Load Minecraft assets" panel per SUBSPEC-B §9.1: auto-download button, manual JAR drag-drop/file-picker, how-to with no third-party links, auto-download failure surfaces manual JAR zone.

## Files to Create/Modify

| File | Purpose |
|------|---------|
| `packages/formats/asset-flow.ts` | First-run asset load flow types |

## Types to Define

```ts
export type AssetLoadState = {
  loaded: boolean;
  version: string;           // '1.21.11' or ''
  source: 'auto-download' | 'manual-jar' | 'none';
  cachedSizeBytes: number;
  lastVerified: string | null;
};

export type AssetLoadPanelState = {
  showPanel: boolean;
  downloadInProgress: boolean;
  downloadProgress: number;  // 0..100
  downloadError: string | null;
  manualJarAvailable: boolean;
};

export type AssetLoadAction =
  | { type: 'OPEN_PANEL' }
  | { type: 'CLOSE_PANEL' }
  | { type: 'START_AUTO_DOWNLOAD' }
  | { type: 'DOWNLOAD_PROGRESS'; progress: number }
  | { type: 'DOWNLOAD_COMPLETE'; version: string }
  | { type: 'DOWNLOAD_FAILED'; error: string }
  | { type: 'START_MANUAL_IMPORT' }
  | { type: 'MANUAL_IMPORT_COMPLETE'; version: string }
  | { type: 'MANUAL_IMPORT_FAILED'; error: string }
  | { type: 'CANCEL_DOWNLOAD' };
```

## Panel Contents

- **Auto-download button**: resolve official Mojang version manifest → client JAR → worker extraction → IndexedDB cache
- **Drag-drop / file-picker zone**: accept a user-supplied `1.21.11.jar`
- **How-to** (no third-party asset site links):
  1. Official route: version manifest → version JSON → `downloads.client.url` → client JAR
  2. Local route: `.minecraft/versions/1.21.11/1.21.11.jar`
- **Auto-download failure**: panel automatically surfaces manual JAR zone with clear message (`ASSET_DOWNLOAD_FAILED`). Never a dead end.

## Acceptance Criteria

- [ ] Auto-download button resolves manifest → client JAR → worker extraction → cache
- [ ] Drag-drop/file-picker zone for manual `1.21.11.jar`
- [ ] How-to shows official manifest route and local route, no third-party links
- [ ] Auto-download failure surfaces manual JAR zone (never a dead end)
- [ ] Asset load status shown in status bar: version, source, cached size, last verified
- [ ] Persistent warning banner with "Load assets" action until assets load
- [ ] Failures never corrupt the cache: cancelled downloads discard partial data; corrupt cache replaced on re-download

## Tests

**File:** `packages/formats/__tests__/slice-b-9-asset-flow.test.ts`

1. Auto-download flow transitions: START → PROGRESS → COMPLETE or FAILED
2. Auto-download failure → manual JAR zone shown
3. Manual import flow transitions: START → COMPLETE or FAILED
4. Cancel download → partial data discarded
5. Asset load state tracks version, source, cached size

## Verification Checklist

- [ ] Change does one thing completely (first-run asset load flow)
- [ ] TypeScript compiles without errors
- [ ] All new tests pass
- [ ] Change committed with descriptive message
