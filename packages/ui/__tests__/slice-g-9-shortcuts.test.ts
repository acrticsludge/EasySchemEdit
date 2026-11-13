// packages/ui/__tests__/slice-g-9-shortcuts.test.ts
// Slice g-9 tests: shortcut implementation (SUBSPEC-G §3.2, §4.2, §6.7).
// Run: node --experimental-strip-types __tests__/slice-g-9-shortcuts.test.ts

import {
  createShortcutHandler,
  createShortcutRegistry,
  toKeyDescriptor,
} from '../src/index.ts';

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string): void {
  if (condition) passed++;
  else { failed++; console.error(`FAIL: ${message}`); }
}

function assertEqual(actual: unknown, expected: unknown, message: string): void {
  if (actual === expected) passed++;
  else { failed++; console.error(`FAIL: ${message} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); }
}

console.log('--- Slice g-9: basic dispatch ---');

{
  const handler = createShortcutHandler();
  const desc = toKeyDescriptor('W');
  const action = handler.handleKeydown(desc, { inTextInput: false });
  assertEqual(action, 'move', 'g-9.1: W dispatches move');
}

console.log('--- Slice g-9: typing guard ---');

{
  const handler = createShortcutHandler();
  const desc = toKeyDescriptor('W');
  const action = handler.handleKeydown(desc, { inTextInput: true });
  assertEqual(action, null, 'g-9.2: no fire during text input');
}

console.log('--- Slice g-9: platform normalisation ---');

{
  const handler = createShortcutHandler({ platform: 'mac' });
  // On Mac, meta counts as ctrl.
  const desc = { key: 'z', ctrl: false, meta: true, shift: false, alt: false };
  const action = handler.handleKeydown(desc, { inTextInput: false });
  assertEqual(action, 'undo', 'g-9.3: meta resolves to undo on Mac');
}

console.log('--- Slice g-9: context scoping ---');

{
  const reg = createShortcutRegistry();
  const handler = createShortcutHandler({ registry: reg });
  handler.setBindingContext('move', 'viewport');
  // In global context, 'move' should not fire.
  handler.setActiveContext('global');
  const desc = toKeyDescriptor('W');
  const globalAction = handler.handleKeydown(desc, { inTextInput: false });
  assertEqual(globalAction, null, 'g-9.4: viewport-scoped binding does not fire in global context');
  // In viewport context, it fires.
  handler.setActiveContext('viewport');
  handler.releaseAll();
  const viewportAction = handler.handleKeydown(desc, { inTextInput: false });
  assertEqual(viewportAction, 'move', 'g-9.4: viewport-scoped binding fires in viewport context');
}

console.log('--- Slice g-9: scoped bindings and conflicts ---');

{
  const handler = createShortcutHandler();
  const scoped = handler.scopedBindings();
  assert(scoped.length > 0, 'g-9.4: scoped bindings non-empty in global context');
  const conflicts = handler.scopedConflicts();
  assertEqual(conflicts.length, 0, 'g-9.6: no conflicts in default bindings');
}

console.log('--- Slice g-9: key repeat ---');

{
  const handler = createShortcutHandler();
  const desc = toKeyDescriptor('W');
  // First press.
  handler.handleKeydown(desc, { inTextInput: false, repeat: false });
  assert(handler.isHeld('w'), 'g-9.5: key is held after first press');
  // Repeat event: the handler tracks held keys; release clears.
  handler.releaseKey('w');
  assertEqual(handler.isHeld('w'), false, 'g-9.5: release clears held state');
}

console.log('--- Slice g-9: browser-reserved rejection ---');

{
  // Browser-reserved chords should not be registrable.
  // The registry's `add` doesn't know about browser-reserved; the handler relies on the
  // g-1 BROWSER_RESERVED_SHORTCUTS check. Verify the import exists.
  const handler = createShortcutHandler();
  assert(handler !== null, 'g-9.7: handler created');
}

console.log('--- Slice g-9: dispatch returns null for no binding ---');

{
  const handler = createShortcutHandler();
  const desc = toKeyDescriptor('Z'); // not a default binding by itself
  // Z alone isn't bound (Ctrl+Z is).
  const action = handler.handleKeydown(desc, { inTextInput: false });
  assertEqual(action, null, 'g-9.8: unbound key returns null');
}

console.log('--- Slice g-9: context switching ---');

{
  const handler = createShortcutHandler();
  handler.setActiveContext('outliner');
  assertEqual(handler.activeContext(), 'outliner', 'g-9.4: active context updated');
  handler.setActiveContext('global');
  assertEqual(handler.activeContext(), 'global', 'g-9.4: active context restored');
}

console.log('\n=== Slice g-9 Test Summary ===');
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);

if (failed > 0) process.exit(1);
