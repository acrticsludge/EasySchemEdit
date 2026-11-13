# Subspec G — Slice g-2: Tooltip + Onboarding

**Source:** `docs/specs/subs/SUBSPEC-G_UI_INTERACTION.md` §2.3 (Tooltip types), §4.3 (tooltip validation), §6.6 (tooltips, G7), §6.6.1 (shortcut conflict detection)
**Constraint:** Pure TypeScript, zero framework/browser/Node/Three.js/MCP imports. Timing is expressed as delay values and an injected clock; hover intent is a state machine.
**Research:** `docs/research/subplan-g.md` G-4, G-6.1.

## Goal

Implement tooltip and onboarding behaviour: the 500ms hover delay with a 200–1000ms valid range, the shortcut shown only when a binding exists, the `?` shortcut reference, dismissal/replay of first-launch onboarding, and the browser-reserved-shortcut guard from §6.6.1 that slice g-1 does not cover.

## Files

| File | Action | Content |
|------|--------|---------|
| `packages/ui/src/tooltip-types.ts` | create | `TooltipConfig`, `OnboardingState`, tooltip intent state machine, onboarding state machine, `BROWSER_RESERVED_SHORTCUTS` |
| `packages/ui/__tests__/slice-g-2-tooltips.test.ts` | create | Delay validation, shortcut display, `?` reference, dismissal/replay, reserved-key guard |
| `packages/ui/src/index.ts` | update | re-export |

## Types / APIs

```ts
export type TooltipConfig = {
  delayMs: number;              // 500 (G7)
  showShortcut: boolean;
  position: 'top' | 'bottom' | 'left' | 'right' | 'auto';
  maxWidthPx: number;           // 300
};

export type OnboardingState = {
  firstLaunch: boolean;
  dismissed: boolean;
  replayable: boolean;
  completedSteps: string[];
};

export const DEFAULT_TOOLTIP_CONFIG: TooltipConfig;
export const MIN_TOOLTIP_DELAY_MS = 200;
export const MAX_TOOLTIP_DELAY_MS = 1000;

/** §6.6.1: browser-reserved chords cannot be overridden. */
export const BROWSER_RESERVED_SHORTCUTS: readonly string[];

export function validateTooltipConfig(config: TooltipConfig): { ok: boolean; reasons: string[] };
export function createTooltipState(config?: Partial<TooltipConfig>): TooltipStateApi;

export type TooltipStateApi = {
  config(): TooltipConfig;
  /** Record a hover intent; returns whether the tooltip should now be visible. */
  hover(targetId: string, now: number): boolean;
  /** Record a leave; the tooltip hides immediately. */
  leave(targetId: string): void;
  /** Move between targets without the delay restarting (the pointer is still over the surface). */
  moveTo(targetId: string, now: number): boolean;
  visibleTarget(): string | null;
  reset(): void;
  /** §6.6: `?` opens the keyboard shortcut reference. */
  isShortcutReferenceRequest(key: string): boolean;
  /** §4.3: shortcuts are shown only when a binding exists. */
  shortcutFor(action: string): string | null;
};

export function createOnboardingState(initial?: Partial<OnboardingState>): OnboardingStateApi;

export type OnboardingStateApi = {
  state(): OnboardingState;
  dismiss(): void;
  completeStep(stepId: string): void;
  replay(): void;
  isVisible(): boolean;
};
```

Key rules:

- Delay default 500ms; the accepted range is 200–1000ms (§4.3), and a config outside it is invalid.
- The tooltip appears only after the delay has elapsed **and** the pointer has not left; leaving hides it at once.
- Moving to a different target restarts the delay (a new element needs its own hover time).
- `?` opens the shortcut reference (§6.6).
- A tooltip shows an action's shortcut only when that action has a binding (§4.3).
- Onboarding is optional, dismissible on first launch, and replayable from settings (§6.6, §4.3); dismissing does not destroy the completed-step record.
- Browser-reserved chords (`Ctrl+T`, `Ctrl+W`, `Ctrl+N`, `Ctrl+Shift+T`, `Ctrl+Shift+W`, `Ctrl+Shift+N`, `Ctrl+Q`, `F5`, `F11`, `F12`) cannot be bound (§6.6.1).

## Acceptance criteria

1. `DEFAULT_TOOLTIP_CONFIG` has delayMs 500, maxWidthPx 300, position 'auto', showShortcut true.
2. A delay of 150ms or 1200ms is invalid; 200 and 1000 are valid; the reason names the range.
3. A tooltip is not visible before the delay elapses and is visible after it, with the same target.
4. Leaving before the delay elapses means the tooltip never appears; leaving after it hides the tooltip immediately.
5. Moving to another target restarts the delay for the new target.
6. `?` is recognised as the shortcut-reference request; other keys are not.
7. A shortcut is returned only for an action that has a binding; an unbound action yields null.
8. Onboarding is visible on first launch, hidden after `dismiss()`, and `replay()` makes it visible again while preserving `completedSteps`.
9. `completeStep` records a step once and never duplicates it.
10. Every browser-reserved chord is refused by the binding guard, and a normal chord is allowed.

## Tests

`packages/ui/__tests__/slice-g-2-tooltips.test.ts`

```
cd packages/ui
node --experimental-strip-types __tests__/slice-g-2-tooltips.test.ts
```

## Verification

- `tsc --noEmit` for `packages/ui`: exit 0
- Test command above: exit 0