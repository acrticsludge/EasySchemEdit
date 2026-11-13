# Subspec G — Slice g-7: Status Bar

**Source:** `docs/specs/subs/SUBSPEC-G_UI_INTERACTION.md` §6.5 (Status bar, G6)
**Constraint:** Pure TypeScript, zero framework/browser/Node/Three.js/MCP imports.
**Research:** `docs/research/subplan-g.md` (G-6.1..G-6.4).
**Depends on:** slice g-0 (layout), slice g-4 (layout controller).

## Goal

Implement the status bar as executable pure logic: coordinate display (X/Y/Z of the hovered block), tool mode indicator, snap/grid indicator, save status, performance indicator (FPS/triangle count), and notification slot. All values are pushed in by the renderer/worker layer; the model only formats and clamps them.

## Files

| File | Action | Content |
|------|--------|---------|
| `packages/ui/src/statusbar.ts` | create | `createStatusBar`, coordinate display, tool mode, snap/grid, save status, perf, notifications |
| `packages/ui/__tests__/slice-g-7-statusbar.test.ts` | create | Coordinate formatting, tool mode, snap/grid, save status, perf, notifications |
| `packages/ui/src/index.ts` | update | re-export |

## Key rules

- Coordinate display shows X/Y/Z of the hovered block (integer).
- Tool mode indicator reflects the active tool.
- Snap/grid indicator shows the current snap step and grid visibility.
- Save status: idle / saving / saved / error.
- Performance indicator: FPS and triangle count, with a "degraded" flag below a threshold.
- Notification slot: push/dismiss, capped at N, oldest dismissed first.
- All values pushed in; the model formats and clamps, never reads the DOM or the renderer.

## Acceptance criteria

1. `createStatusBar` accepts initial values and exposes setters.
2. Coordinate display formats X/Y/Z as integers.
3. Tool mode indicator reflects the active tool.
4. Snap/grid indicator exposes step and visibility.
5. Save status cycles through idle/saving/saved/error.
6. Performance indicator exposes FPS and triangle count; degraded flag set below threshold.
7. Notifications push/dismiss with a cap.
8. All values are clamped/formatted, never raw renderer state.

## Tests

`packages/ui/__tests__/slice-g-7-statusbar.test.ts`

```
cd packages/ui
node --experimental-strip-types __tests__/slice-g-7-statusbar.test.ts
```

## Verification

- `tsc --noEmit` for `packages/ui`: exit 0
- Test command above: exit 0