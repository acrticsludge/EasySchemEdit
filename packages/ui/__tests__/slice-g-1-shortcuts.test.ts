// packages/ui/__tests__/slice-g-1-shortcuts.test.ts
// Slice g-1 tests: shortcut registry (SUBSPEC-G §2.2, §3.2, §4.2, §6.7 / G5).
// Run: node --experimental-strip-types __tests__/slice-g-1-shortcuts.test.ts

import {
  DEFAULT_BINDINGS,
  G5_SHORTCUT_TABLE,
  createShortcutRegistry,
  findConflicts,
  normalizeKeys,
  toKeyDescriptor,
  type ShortcutBinding,
} from '../src/shortcut-types.ts';

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string): void {
  if (condition) {
    passed++;
  } else {
    failed++;
    console.error(`FAIL: ${message}`);
  }
}

function assertEqual(actual: unknown, expected: unknown, message: string): void {
  if (actual === expected) {
    passed++;
  } else {
    failed++;
    console.error(
      `FAIL: ${message} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
  }
}

const key = (over: Partial<Parameters<ReturnType<typeof createShortcutRegistry>['resolve']>[0]> = {}) => ({
  key: 'z', ctrl: false, meta: false, shift: false, alt: false,
  ...over,
});

console.log('--- Slice g-1: G5 table (G5) ---');

{
  // Every action in the spec's §6.7 table must be present with its exact key.
  const expected: Array<[string, string, string]> = [
    ['placement-mode', '1', 'tools'],
    ['region-mode', '2', 'tools'],
    ['move', 'W', 'tools'],
    ['rotate', 'E', 'tools'],
    ['picker', 'P', 'tools'],
    ['focus-selection', 'F', 'tools'],
    ['select-all-placements', 'Ctrl+A', 'editing'],
    ['cancel', 'Esc', 'editing'],
    ['undo', 'Ctrl+Z', 'editing'],
    ['redo', 'Ctrl+Shift+Z', 'editing'],
    ['duplicate-selection', 'Ctrl+D', 'editing'],
    ['delete-selection', 'Delete', 'editing'],
    ['toggle-conflict-overlay', 'C', 'view'],
    ['toggle-borders', 'B', 'view'],
    ['focus-origin-editor', 'O', 'view'],
    ['save-project', 'Ctrl+S', 'file'],
    ['export', 'Ctrl+E', 'file'],
  ];

  assertEqual(DEFAULT_BINDINGS.length, expected.length, 'g-1.1: all 17 G5 actions are bound');
  for (const [action, keys, category] of expected) {
    const binding = DEFAULT_BINDINGS.find((b) => b.action === action);
    assert(binding !== undefined, `g-1.1: "${action}" is bound`);
    assertEqual(binding?.keys, keys, `g-1.1: "${action}" is ${keys}`);
    assertEqual(binding?.category, category, `g-1.1: "${action}" is in the ${category} category`);
    assertEqual(binding?.editable, true, `g-1.1: "${action}" is remappable`);
    assertEqual(binding?.enabled, true, `g-1.1: "${action}" is enabled by default`);
  }

  // G5 explicitly removed Ctrl+Shift+B for Bake.
  assertEqual(
    DEFAULT_BINDINGS.some((b) => normalizeKeys(b.keys) === normalizeKeys('Ctrl+Shift+B')),
    false,
    'g-1.2: no default binding uses Ctrl+Shift+B (G5 removal)',
  );
  assertEqual(
    DEFAULT_BINDINGS.some((b) => b.action === 'bake'),
    false,
    'g-1.2: Bake has no default binding (G5)',
  );

  // The spec table itself is the source of truth for the count.
  assertEqual(G5_SHORTCUT_TABLE.length, 17, 'g-1.1: the spec table has 17 rows');
}

console.log('--- Slice g-1: key normalisation (§4.2) ---');

{
  assertEqual(normalizeKeys('Ctrl+Z'), 'Ctrl+Z', 'g-1.3: a canonical form is stable');
  assertEqual(normalizeKeys('ctrl+z'), 'Ctrl+Z', 'g-1.3: lowercase input normalises');
  assertEqual(normalizeKeys('Shift+Ctrl+Z'), 'Ctrl+Shift+Z', 'g-1.3: modifier order does not matter');
  assertEqual(normalizeKeys('ctrl+shift+z'), 'Ctrl+Shift+Z', 'g-1.3: case and order together');
  assertEqual(normalizeKeys('Cmd+Z'), 'Ctrl+Z', 'g-1.4: Cmd collapses onto Ctrl');
  assertEqual(normalizeKeys('Meta+Z'), 'Ctrl+Z', 'g-1.4: Meta collapses onto Ctrl');
  assertEqual(normalizeKeys('W'), 'W', 'g-1.3: a bare letter keeps its shape');
  assertEqual(normalizeKeys('w'), 'W', 'g-1.3: a bare lowercase letter normalises to the key');
  assertEqual(normalizeKeys('Esc'), 'Esc', 'g-1.3: Esc is the spec spelling');
  assertEqual(normalizeKeys('escape'), 'Esc', 'g-1.3: "escape" normalises to Esc');
  assertEqual(normalizeKeys('Delete'), 'Delete', 'g-1.3: Delete keeps its name');
  assertEqual(normalizeKeys('del'), 'Delete', 'g-1.3: "del" normalises to Delete');

  const desc = toKeyDescriptor('Ctrl+Shift+Z');
  assertEqual(desc.key, 'z', 'g-1.3: the descriptor lowercases the key');
  assertEqual(desc.ctrl, true, 'g-1.3: the descriptor records ctrl');
  assertEqual(desc.shift, true, 'g-1.3: the descriptor records shift');
  assertEqual(desc.alt, false, 'g-1.3: the descriptor records the absence of alt');

  const cmd = toKeyDescriptor('Cmd+Z');
  assertEqual(cmd.ctrl || cmd.meta, true, 'g-1.4: Cmd is expressed as a modifier the matcher understands');
}

console.log('--- Slice g-1: conflict detection (§4.2) ---');

{
  assertEqual(findConflicts([...DEFAULT_BINDINGS]).length, 0, 'g-1.5: the G5 default table has no conflicts');

  const duped: ShortcutBinding[] = [
    { action: 'a', keys: 'Ctrl+Z', editable: true, category: 'editing', enabled: true },
    { action: 'b', keys: 'ctrl+z', editable: true, category: 'editing', enabled: true },
  ];
  const conflicts = findConflicts(duped);
  assertEqual(conflicts.length, 1, 'g-1.5: a duplicated key set is reported once');
  assertEqual(conflicts[0].keys, 'Ctrl+Z', 'g-1.5: the conflict reports the canonical key set');
  assertEqual(conflicts[0].actions.length, 2, 'g-1.5: the conflict names both actions');

  // Cmd and Ctrl collide (they are the same modifier).
  const crossPlatform: ShortcutBinding[] = [
    { action: 'a', keys: 'Cmd+S', editable: true, category: 'file', enabled: true },
    { action: 'b', keys: 'Ctrl+S', editable: true, category: 'file', enabled: true },
  ];
  assertEqual(findConflicts(crossPlatform).length, 1, 'g-1.4: Cmd and Ctrl collide in conflict detection');

  // A disabled binding does not participate.
  const withDisabled: ShortcutBinding[] = [
    { action: 'a', keys: 'Ctrl+Z', editable: true, category: 'editing', enabled: true },
    { action: 'b', keys: 'Ctrl+Z', editable: true, category: 'editing', enabled: false },
  ];
  assertEqual(findConflicts(withDisabled).length, 0, 'g-1.5: a disabled binding causes no conflict');
}

console.log('--- Slice g-1: typing guard and focus (§3.2, §4.2) ---');

{
  const reg = createShortcutRegistry();

  // Typing in a text field blocks every action.
  reg.setTypingGuard(true);
  reg.setEditorSurfaceFocused(true);
  for (const keys of ['Ctrl+Z', 'W', '1', 'Delete']) {
    const r = reg.resolve(toKeyDescriptor(keys));
    assert(r.fired === false, `g-1.6: "${keys}" does not fire while typing`);
    assert(r.fired === false && r.reason === 'typing-guard', `g-1.6: "${keys}" reports typing-guard`);
  }

  // Unfocused surface blocks every action.
  reg.setTypingGuard(false);
  reg.setEditorSurfaceFocused(false);
  const unfocused = reg.resolve(toKeyDescriptor('Ctrl+Z'));
  assert(unfocused.fired === false && unfocused.reason === 'surface-not-focused', 'g-1.7: an unfocused surface blocks the shortcut');

  // Focused, not typing: it fires.
  reg.setEditorSurfaceFocused(true);
  const fired = reg.resolve(toKeyDescriptor('Ctrl+Z'));
  assertEqual(fired.fired, true, 'g-1.8: a focused surface with no typing fires');
  assert(fired.fired === true && fired.action === 'undo', 'g-1.8: Ctrl+Z resolves to undo');
  assert(fired.fired === true && fired.preventDefault === true, 'g-1.8: a fired shortcut prevents default');
}

console.log('--- Slice g-1: unbound keys pass through ---');

{
  const reg = createShortcutRegistry();
  reg.setEditorSurfaceFocused(true);

  const unbound = reg.resolve(key({ key: 'q', ctrl: true }));
  assertEqual(unbound.fired, false, 'g-1.9: an unbound key does not fire');
  assert(unbound.fired === false && unbound.reason === 'no-binding', 'g-1.9: an unbound key reports no-binding');

  // Bake has no default binding, so its (removed) chord passes through.
  const bakeChord = reg.resolve({ key: 'b', ctrl: true, meta: false, shift: true, alt: false });
  assertEqual(bakeChord.fired, false, 'g-1.2: the removed Bake chord passes through to the browser');

  // A disabled action resolves 'disabled'.
  reg.disable('undo');
  const disabled = reg.resolve(toKeyDescriptor('Ctrl+Z'));
  assert(disabled.fired === false && disabled.reason === 'disabled', 'g-1.10: a disabled binding reports disabled');
  reg.enable('undo');
  assertEqual(reg.resolve(toKeyDescriptor('Ctrl+Z')).fired, true, 'g-1.10: re-enabling restores the binding');
}

console.log('--- Slice g-1: remap, no delete (§4.2) ---');

{
  const reg = createShortcutRegistry();

  assertEqual(reg.remap('undo', 'Ctrl+U'), true, 'g-1.11: remapping to a free key succeeds');
  const undo = reg.get('undo');
  assertEqual(undo?.keys, 'Ctrl+U', 'g-1.11: the binding carries the new keys');
  assertEqual(reg.resolve(toKeyDescriptor('Ctrl+U')).fired, true, 'g-1.11: the new chord fires');
  assertEqual(reg.resolve(toKeyDescriptor('Ctrl+Z')).fired, false, 'g-1.11: the old chord no longer fires');

  // A conflicting target is refused and leaves the binding unchanged.
  assertEqual(reg.remap('undo', 'Ctrl+S'), false, 'g-1.11: remapping onto an in-use chord is refused');
  assertEqual(reg.get('undo')?.keys, 'Ctrl+U', 'g-1.11: a refused remap leaves the binding intact');

  // Default bindings cannot be deleted.
  assertEqual(reg.remove('undo'), false, 'g-1.11: a default binding cannot be deleted');
  assert(reg.get('undo') !== undefined, 'g-1.11: the default binding survives a delete attempt');

  // Adding a custom action is allowed, and it conflicts like any other.
  assertEqual(
    reg.add({ action: 'bake', keys: 'Ctrl+Shift+K', editable: true, category: 'editing', enabled: true }),
    true,
    'g-1.2: a custom Bake shortcut can be assigned by the user',
  );
  assertEqual(reg.get('bake')?.keys, 'Ctrl+Shift+K', 'g-1.2: the custom Bake binding is stored');
  assertEqual(
    reg.add({ action: 'bake2', keys: 'Ctrl+Shift+K', editable: true, category: 'editing', enabled: true }),
    false,
    'g-1.5: adding a conflicting binding is refused',
  );

  // Remapping to an unchanged key is a no-op success.
  assertEqual(reg.remap('undo', 'Ctrl+U'), true, 'g-1.11: remapping to the same chord is a no-op success');

  // The registry exposes its conflicts for a settings panel.
  assertEqual(reg.conflicts().length, 0, 'g-1.5: a well-formed registry reports no conflicts');
}

console.log('\n=== Slice g-1 Test Summary ===');
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);

if (failed > 0) {
  process.exit(1);
}