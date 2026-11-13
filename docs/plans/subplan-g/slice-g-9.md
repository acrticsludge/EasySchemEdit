# Subspec G — Slice g-9: Shortcut Implementation

**Source:** `docs/specs/subs/SUBSPEC-G_UI_INTERACTION.md` §6.1/§6.2 (shortcut table G5), §3.x
**Constraint:** Pure TypeScript, zero framework/browser/Node/Three.js/MCP imports.
**Research:** `docs/research/subplan-g.md` (G-6.1..G-6.4).
**Depends on:** slice g-1 (shortcut registry types).

## Goal

Implement keyboard handling for the shortcut registry: keydown dispatch, typing guard (no fire during text input), platform-aware modifier normalisation (Cmd on macOS, Ctrl elsewhere), context scoping (global / viewport / outliner / inspector), key-repeat handling, conflict detection across different actions, and browser-reserved chord rejection.

## Files

| File | Action | Content |
|------|--------|---------|
| `packages/ui/src/shortcuts.ts` | create | `createShortcutHandler`, dispatch, typing guard, conflict detection |
| `packages/ui/__tests__/slice-g-9-shortcuts.test.ts` | create | Keydown handling, no fire during text input, conflicts, platform |
| `packages/ui/src/index.ts` | update | re-export |

## Key rules

- Typing guard: when focus is in an input/textarea/contenteditable, shortcuts do not fire (except explicitly global ones marked `allowInInputs`).
- Platform-aware: `mod` resolves to Cmd on macOS, Ctrl elsewhere.
- Context scoping: a binding fires only when its context matches the active context.
- Key repeat: a held key fires once unless `repeat: true`.
- Conflict detection: two bindings with the same chord in the same context are a conflict.
- Browser-reserved chords are rejected at registration.

## Acceptance criteria

1. `createShortcutHandler` accepts a registry and dispatches keydown events.
2. Typing guard prevents firing during text input.
3. Platform modifier normalisation works (mod → Cmd/Ctrl).
4. Context scoping filters bindings by active context.
5. Key repeat handled (once unless repeat:true).
6. Conflict detection flags duplicate chords in the same context.
7. Browser-reserved chords rejected at registration.
8. Dispatch returns the action id that fired (or null).

## Tests

`packages/ui/__tests__/slice-g-9-shortcuts.test.ts`

```
cd packages/ui
node --experimental-strip-types __tests__/slice-g-9-shortcuts.test.ts
```

## Verification

- `tsc --noEmit` for `packages/ui`: exit 0
- Test command above: exit 0