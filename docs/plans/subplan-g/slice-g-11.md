# Subspec G — Slice g-11: Onboarding Implementation

**Source:** `docs/specs/subs/SUBSPEC-G_UI_INTERACTION.md` §6.6 (onboarding)
**Constraint:** Pure TypeScript, zero framework/browser/Node/Three.js/MCP imports.
**Research:** `docs/research/subplan-g.md` (G-6.1..G-6.4).
**Depends on:** slice g-2 (onboarding state types).

## Goal

Implement onboarding as executable pure logic: dismissible, replayable, step tracking, persistence hooks. Wraps the g-2 state machine with a controller that manages step progression, completion, and a replay-from-settings flow.

## Files

| File | Action | Content |
|------|--------|---------|
| `packages/ui/src/onboarding.ts` | create | `createOnboarding`, step tracking, replay, persistence |
| `packages/ui/__tests__/slice-g-11-onboarding.test.ts` | create | Dismiss, replay, step tracking, persistence |
| `packages/ui/src/index.ts` | update | re-export |

## Key rules

- Dismissible: user can dismiss at any time.
- Replayable: replay from settings shows the flow again without discarding completed steps.
- Step tracking: completeStep adds to completedSteps (no duplicates).
- firstLaunch is cleared on first dismiss.
- Persistence: export/import state as a serialisable object.

## Acceptance criteria

1. `createOnboarding` wraps the g-2 state machine.
2. Dismiss clears firstLaunch and sets dismissed.
3. Replay makes it visible again, preserving completedSteps.
4. Step completion is idempotent (no duplicates).
5. Export/import round-trips the state.
6. isVisible reflects dismissed state.

## Tests

`packages/ui/__tests__/slice-g-11-onboarding.test.ts`

```
cd packages/ui
node --experimental-strip-types __tests__/slice-g-11-onboarding.test.ts
```

## Verification

- `tsc --noEmit` for `packages/ui`: exit 0
- Test command above: exit 0