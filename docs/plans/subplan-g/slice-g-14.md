# Subspec G — Slice g-14: Viewport Overlays

**Source:** `docs/specs/subs/SUBSPEC-G_UI_INTERACTION.md` §6.1 (viewport), §3.x
**Constraint:** Pure TypeScript, zero framework/browser/Node/Three.js/MCP imports.
**Research:** `docs/research/subplan-g.md` (G-6.1..G-6.4).
**Depends on:** slice g-0 (layout).

## Goal

Implement viewport overlays as executable pure logic: chunk borders, section borders, block borders — toggleable, persisted, no data change. Overlays are visual-only; toggling them never mutates the schematic.

## Files

| File | Action | Content |
|------|--------|---------|
| `packages/ui/src/viewport-overlays.ts` | create | `createViewportOverlays`, toggle, persist, no data change |
| `packages/ui/__tests__/slice-g-14-viewport-overlays.test.ts` | create | Overlay toggle, persistence, no data change |
| `packages/ui/src/index.ts` | update | re-export |

## Key rules

- Three overlay types: chunk borders, section borders, block borders.
- Each independently toggleable.
- Persisted as part of the layout/workspace state.
- Toggling never changes schematic data.
- Default: chunk borders on, section borders off, block borders off.

## Acceptance criteria

1. `createViewportOverlays` accepts initial state.
2. Toggle changes visibility.
3. State persists (export/import).
4. Toggling never touches schematic data (no callback to data layer).
5. All three overlay types independently controllable.

## Tests

`packages/ui/__tests__/slice-g-14-viewport-overlays.test.ts`

```
cd packages/ui
node --experimental-strip-types __tests__/slice-g-14-viewport-overlays.test.ts
```

## Verification

- `tsc --noEmit` for `packages/ui`: exit 0
- Test command above: exit 0