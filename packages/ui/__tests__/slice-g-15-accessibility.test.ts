// packages/ui/__tests__/slice-g-15-accessibility.test.ts
// Slice g-15 tests: accessibility (SUBSPEC-G §6.7, §8.2).
// Run: node --experimental-strip-types __tests__/slice-g-15-accessibility.test.ts

import {
  createAccessibility,
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

console.log('--- Slice g-15: reduced motion ---');

{
  const a = createAccessibility({ reducedMotion: true });
  assertEqual(a.prefersReducedMotion(), true, 'g-15.3: reduced motion enabled');
  a.setReducedMotion(false);
  assertEqual(a.prefersReducedMotion(), false, 'g-15.3: reduced motion toggled');
  const a2 = createAccessibility();
  assertEqual(a2.prefersReducedMotion(), false, 'g-15.3: default off');
}

console.log('--- Slice g-15: focus management ---');

{
  const a = createAccessibility();
  a.pushFocus('btn1');
  a.pushFocus('input1');
  assertEqual(a.currentFocus(), 'input1', 'g-15.2: current focus is top of stack');
  assertEqual(a.popFocus(), 'input1', 'g-15.2: pop returns top');
  assertEqual(a.currentFocus(), 'btn1', 'g-15.2: previous focus restored');
  assertEqual(a.popFocus(), 'btn1', 'g-15.2: pop next');
  assertEqual(a.popFocus(), null, 'g-15.2: empty stack returns null');
}

console.log('--- Slice g-15: focus trap ---');

{
  const a = createAccessibility();
  assertEqual(a.isFocusTrapped(), false, 'g-15.2: not trapped initially');
  a.trapFocus('dialog1');
  assertEqual(a.isFocusTrapped(), true, 'g-15.2: trapped after trapFocus');
  assertEqual(a.state().focusTrap.containerId, 'dialog1', 'g-15.2: container id stored');
  a.releaseFocusTrap();
  assertEqual(a.isFocusTrapped(), false, 'g-15.2: released');
}

console.log('--- Slice g-15: contrast check ---');

{
  const a = createAccessibility();
  // White on black: high contrast.
  const r1 = a.checkContrast('#ffffff', '#000000');
  assert(r1.pass, 'g-15.4: white on black passes AA');
  assert(r1.ratio > 20, 'g-15.4: ratio > 20');
  assertEqual(r1.level, 'AAA', 'g-15.4: AAA level');
  // Low contrast: fail.
  const r2 = a.checkContrast('#888888', '#999999');
  assert(!r2.pass, 'g-15.4: low contrast fails');
  assertEqual(r2.level, 'fail', 'g-15.4: fail level');
  // Large text threshold (3:1).
  const r3 = a.checkContrast('#777777', '#ffffff', true);
  assert(r3.pass, 'g-15.4: large text lower threshold');
}

console.log('--- Slice g-15: touch target ---');

{
  const a = createAccessibility();
  assert(a.checkTouchTarget(24, 24), 'g-15.5: 24x24 passes');
  assert(a.checkTouchTarget(48, 48), 'g-15.5: 48x48 passes');
  assert(!a.checkTouchTarget(20, 24), 'g-15.5: 20 wide fails');
  assert(!a.checkTouchTarget(24, 20), 'g-15.5: 20 tall fails');
}

console.log('--- Slice g-15: non-color indicator ---');

{
  const a = createAccessibility();
  assert(a.hasNonColorIndicator(true, false), 'g-15.6: icon alone suffices');
  assert(a.hasNonColorIndicator(false, true), 'g-15.6: text alone suffices');
  assert(a.hasNonColorIndicator(true, true), 'g-15.6: both suffices');
  assert(!a.hasNonColorIndicator(false, false), 'g-15.6: neither fails');
}

console.log('--- Slice g-15: high contrast ---');

{
  const a = createAccessibility();
  a.setHighContrast(true);
  assertEqual(a.state().highContrast, true, 'g-15.4: high contrast enabled');
}

console.log('\n=== Slice g-15 Test Summary ===');
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);

if (failed > 0) process.exit(1);
