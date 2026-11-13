# Subspec G — Slice g-12: Bottom Panels

**Source:** `docs/specs/subs/SUBSPEC-G_UI_INTERACTION.md` §6.4 (Bottom panels), §6.5
**Constraint:** Pure TypeScript, zero framework/browser/Node/Three.js/MCP imports.
**Research:** `docs/research/subplan-g.md` (G-6.1..G-6.4).
**Depends on:** slice g-0 (layout), slice g-4 (layout controller).

## Goal

Implement bottom panels as executable pure logic: tab switching (Materials, Conflicts, History, Diagnostics, Agent Log, Assets), panel content model, UX safeguards (confirm destructive ops, progress/cancellation, resource pack warnings, lock targets shown, color not only signal).

## Files

| File | Action | Content |
|------|--------|---------|
| `packages/ui/src/bottom-panels.ts` | create | `createBottomPanels`, tab switching, content model, UX safeguards |
| `packages/ui/__tests__/slice-g-12-bottom-panels.test.ts` | create | Tab switching, panel content, safeguards |
| `packages/ui/src/index.ts` | update | re-export |

## Key rules

- Six tabs: Materials, Conflicts, History, Diagnostics, Agent Log, Assets.
- Tab switching preserves each panel's state.
- UX safeguards: confirm destructive ops, progress/cancellation, resource pack warnings, lock targets shown, color not only signal (icons + text).

## Acceptance criteria

1. `createBottomPanels` accepts a list of tabs and an active tab.
2. Tab switching changes the active tab.
3. Each panel's state is preserved across switches.
4. UX safeguards: confirm dialog model, progress/cancel model, warning model.
5. Lock targets shown (not just color).
6. Color not the only signal (icon + text for severity).

## Tests

`packages/ui/__tests__/slice-g-12-bottom-panels.test.ts`

```
cd packages/ui
node --experimental-strip-types __tests__/slice-g-12-bottom-panels.test.ts
```

## Verification

- `tsc --noEmit` for `packages/ui`: exit 0
- Test command above: exit 0