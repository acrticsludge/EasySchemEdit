# Subspec G — Slice g-13: Asset Load Panel

**Source:** `docs/specs/subs/SUBSPEC-G_UI_INTERACTION.md` §6.4 (Assets tab), §8.2 item 20
**Constraint:** Pure TypeScript, zero framework/browser/Node/Three.js/MCP imports.
**Research:** `docs/research/subplan-g.md` (G-6.1..G-6.4).
**Depends on:** slice g-7 (status bar), slice g-12 (bottom panels).

## Goal

Implement the asset load panel as executable pure logic: first-run auto-download, manual JAR import, progress bar, cancel, checksum verification, auto-download failure surfaces manual JAR zone (never a dead end).

## Files

| File | Action | Content |
|------|--------|---------|
| `packages/ui/src/asset-load-panel.ts` | create | `createAssetLoadPanel`, auto-download, manual JAR, progress, cancel, checksum |
| `packages/ui/__tests__/slice-g-13-asset-load-panel.test.ts` | create | Auto-download, manual JAR, failure fallback |
| `packages/ui/src/index.ts` | update | re-export |

## Key rules

- States: idle, downloading, verifying, ready, failed, manual-import.
- Auto-download on first run; on failure, surface manual JAR zone (never a dead end).
- Progress: 0..100 percent, cancellable.
- Checksum verification: sha256 match/mismatch.
- Manual JAR import: file path + checksum.

## Acceptance criteria

1. `createAssetLoadPanel` starts in idle.
2. `startAutoDownload` transitions to downloading.
3. `updateProgress` updates percent.
4. `finishDownload` with matching checksum → ready.
5. `finishDownload` with mismatched checksum → failed + manual import zone.
6. `failDownload` → failed + manual import zone (never a dead end).
7. `cancelDownload` aborts mid-download.
8. `importManualJar` with valid checksum → ready.
9. `importManualJar` with invalid checksum → failed.
10. Status bar integration: asset load status exposed.

## Tests

`packages/ui/__tests__/slice-g-13-asset-load-panel.test.ts`

```
cd packages/ui
node --experimental-strip-types __tests__/slice-g-13-asset-load-panel.test.ts
```

## Verification

- `tsc --noEmit` for `packages/ui`: exit 0
- Test command above: exit 0