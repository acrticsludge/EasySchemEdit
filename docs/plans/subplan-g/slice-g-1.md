# Subspec G — Slice g-1: Shortcut Registry

**Source:** `docs/specs/subs/SUBSPEC-G_UI_INTERACTION.md` §2.2 (Shortcut types), §3.2 (shortcut flow), §4.2 (shortcut validation), §6.7 (keyboard shortcuts, G5)
**Constraint:** Pure TypeScript, zero framework/browser/Node/Three.js/MCP imports. Keyboard events arrive as normalised key descriptors.
**Research:** `docs/research/subplan-g.md` G-3.

## Goal

Implement the shortcut registry as executable logic: the G5 default bindings, canonical key matching across `Ctrl`/`Cmd`, conflict detection, the typing guard, remapping without deleting defaults, and the resolve step that turns a keydown into an action.

## Files

| File | Action | Content |
|------|--------|---------|
| `packages/ui/src/shortcut-types.ts` | create | Types, `DEFAULT_BINDINGS`, `createShortcutRegistry`, `normalizeKeys`, `findConflicts`, `toKeyDescriptor` |
| `packages/ui/__tests__/slice-g-1-shortcuts.test.ts` | create | Bindings, normalisation, conflicts, typing guard, remap |
| `packages/ui/src/index.ts` | update | re-export |

## Types / APIs

```ts
export type ShortcutBinding = {
  action: string;
  keys: string;               // e.g. "Ctrl+Z", "1", "Delete"
  editable: boolean;
  category: 'tools' | 'editing' | 'view' | 'file';
  enabled: boolean;
};

export type ShortcutRegistry = {
  bindings: Map<string, ShortcutBinding>;
  typingGuard: boolean;
  editorSurfaceFocused: boolean;
};

export type KeyDescriptor = {
  key: string;                // normalised: lowercase single chars, "escape", "delete", "arrowleft"…
  ctrl: boolean;
  meta: boolean;
  shift: boolean;
  alt: boolean;
};

export type ShortcutResolution =
  | { fired: true; action: string; preventDefault: true }
  | { fired: false; reason: 'typing-guard' | 'surface-not-focused' | 'no-binding' | 'disabled' };

export const DEFAULT_BINDINGS: readonly ShortcutBinding[];
export function normalizeKeys(keys: string): string;
export function toKeyDescriptor(binding: string): KeyDescriptor;
export function findConflicts(bindings: ShortcutBinding[]): Array<{ keys: string; actions: string[] }>;
export function createShortcutRegistry(initial?: ShortcutBinding[]): ShortcutRegistryApi;
```

Key rules:

- G5 bindings exactly as tabulated, including the removed `Ctrl+Shift+B` for Bake.
- `Ctrl` and `Cmd` are the same modifier: `Ctrl+Z` fires for both, and the canonical form is `Ctrl+Z`.
- A keydown while typing in a text/number input never fires (§4.2, §3.2 typing guard).
- A keydown when the editor surface is not focused never fires.
- A key with no binding passes through to the browser (no `preventDefault`).
- Default shortcuts cannot be deleted, only remapped; remapping to a key already in use is refused.
- No two enabled bindings may share a canonical key set.

## Acceptance criteria

1. `DEFAULT_BINDINGS` contains all 17 G5 actions with the exact keys tabulated.
2. Bake is not bound to `Ctrl+Shift+B` (G5 removal) and has no default binding at all.
3. `normalizeKeys` is order-insensitive and modifier-case-insensitive: `ctrl+shift+z`, `Shift+Ctrl+Z` and `Ctrl+Shift+Z` are one canonical form.
4. `Cmd` normalises to `Ctrl`, so a Mac and a Windows binding collide in conflict detection.
5. `findConflicts` reports each duplicated key set with all actions sharing it; a clean table reports none.
6. The typing guard blocks every action while focus is in a text or number input.
7. An unfocused editor surface blocks every action.
8. An unbound key resolves `no-binding` and does not prevent default.
9. A disabled binding resolves `disabled`.
10. `remap` changes the keys of an action, refuses a conflicting target, and refuses to delete a default binding.

## Tests

`packages/ui/__tests__/slice-g-1-shortcuts.test.ts` — 142 assertions, 0 failures.

```
cd packages/ui
node --experimental-strip-types __tests__/slice-g-1-shortcuts.test.ts
```

Covers: all 17 G5 rows bound with exact keys and categories; the removed Bake chord absent; normalisation (order/case/alias/Cmd↔Ctrl); descriptor round-trip; conflict detection including the cross-platform Cmd/Ctrl collision and disabled-binding exclusion; the typing guard and surface-focus gate reported as distinct reasons; unbound keys passing through without preventDefault; the removed Bake chord passing through; disable/enable; remap success, conflict refusal, no-op remap; default bindings undeletable; custom action addition and its conflict refusal.

## Verification

- `tsc --noEmit` for `packages/ui`: exit 0
- `node --experimental-strip-types __tests__/slice-g-1-shortcuts.test.ts`: exit 0 (142 passed, 0 failed)