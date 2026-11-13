# Subspec G — Slice g-10: Tooltip Implementation

**Source:** `docs/specs/subs/SUBSPEC-G_UI_INTERACTION.md` §6.6 (tooltips), §4.3
**Constraint:** Pure TypeScript, zero framework/browser/Node/Three.js/MCP imports.
**Research:** `docs/research/subplan-g.md` (G-6.1..G-6.4).
**Depends on:** slice g-2 (tooltip types), slice g-1 (shortcuts for shortcut display).

## Goal

Implement tooltip behaviour: 500ms hover delay, shortcut display in tooltip, "?" opens reference, dismissible onboarding. Wraps the g-2 state machine with a controller that manages hover targets, timers (injected clock), and the "?" reference panel.

## Files

| File | Action | Content |
|------|--------|---------|
| `packages/ui/src/tooltips.ts` | create | `createTooltipController`, hover delay, shortcut display, reference panel |
| `packages/ui/__tests__/slice-g-10-tooltips.test.ts` | create | Tooltip timing, shortcut display, reference panel |
| `packages/ui/src/index.ts` | update | re-export |

## Key rules

- 500ms delay before tooltip appears (from g-2 DEFAULT_TOOLTIP_CONFIG).
- Shortcut displayed in tooltip when showShortcut is on and the binding is enabled.
- "?" key opens the shortcut reference panel.
- Onboarding is dismissible and replayable (from g-2).
- All timers use injected clock.

## Acceptance criteria

1. `createTooltipController` wraps the g-2 state machine.
2. Hovering a target for 500ms shows the tooltip.
3. Leaving hides immediately.
4. Shortcut displayed when available.
5. "?" opens the reference panel.
6. Onboarding dismiss/replay works.

## Tests

`packages/ui/__tests__/slice-g-10-tooltips.test.ts`

```
cd packages/ui
node --experimental-strip-types __tests__/slice-g-10-tooltips.test.ts
```

## Verification

- `tsc --noEmit` for `packages/ui`: exit 0
- Test command above: exit 0