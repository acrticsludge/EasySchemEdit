// packages/ui/__tests__/slice-g-14-viewport-overlays.test.ts
// Slice g-14 tests: viewport overlays (SUBSPEC-G §6.1).
// Run: node --experimental-strip-types __tests__/slice-g-14-viewport-overlays.test.ts

import {
  createViewportOverlays,
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

console.log('--- Slice g-14: defaults ---');

{
  const o = createViewportOverlays();
  assertEqual(o.isVisible('chunk-borders'), true, 'g-14: chunk borders on by default');
  assertEqual(o.isVisible('section-borders'), false, 'g-14: section borders off by default');
  assertEqual(o.isVisible('block-borders'), false, 'g-14: block borders off by default');
}

console.log('--- Slice g-14: toggle ---');

{
  const o = createViewportOverlays();
  o.toggle('section-borders');
  assertEqual(o.isVisible('section-borders'), true, 'g-14: toggle turns on');
  o.toggle('section-borders');
  assertEqual(o.isVisible('section-borders'), false, 'g-14: toggle turns off');
  // Independent: toggling one doesn't affect others.
  o.toggle('chunk-borders');
  assertEqual(o.isVisible('chunk-borders'), false, 'g-14: chunk toggled independently');
  assertEqual(o.isVisible('section-borders'), false, 'g-14: section unaffected');
}

console.log('--- Slice g-14: set ---');

{
  const o = createViewportOverlays();
  o.set('block-borders', true);
  assertEqual(o.isVisible('block-borders'), true, 'g-14: set works');
}

console.log('--- Slice g-14: show/hide all ---');

{
  const o = createViewportOverlays();
  o.showAll();
  assertEqual(o.isVisible('chunk-borders'), true, 'g-14: showAll chunk');
  assertEqual(o.isVisible('section-borders'), true, 'g-14: showAll section');
  assertEqual(o.isVisible('block-borders'), true, 'g-14: showAll block');
  o.hideAll();
  assertEqual(o.isVisible('chunk-borders'), false, 'g-14: hideAll chunk');
}

console.log('--- Slice g-14: persistence ---');

{
  const o = createViewportOverlays();
  o.toggle('section-borders');
  o.toggle('block-borders');
  const exported = o.exportState();
  const o2 = createViewportOverlays();
  o2.importState(exported);
  assertEqual(o2.isVisible('section-borders'), true, 'g-14: imported section state');
  assertEqual(o2.isVisible('block-borders'), true, 'g-14: imported block state');
  assertEqual(o2.isVisible('chunk-borders'), true, 'g-14: imported chunk state');
}

console.log('--- Slice g-14: reset ---');

{
  const o = createViewportOverlays();
  o.showAll();
  o.reset();
  assertEqual(o.isVisible('chunk-borders'), true, 'g-14: reset restores chunk default');
  assertEqual(o.isVisible('section-borders'), false, 'g-14: reset restores section default');
  assertEqual(o.isVisible('block-borders'), false, 'g-14: reset restores block default');
}

console.log('--- Slice g-14: initial override ---');

{
  const o = createViewportOverlays({ initial: { 'block-borders': true, 'chunk-borders': false } });
  assertEqual(o.isVisible('block-borders'), true, 'g-14: initial override block');
  assertEqual(o.isVisible('chunk-borders'), false, 'g-14: initial override chunk');
}

console.log('\n=== Slice g-14 Test Summary ===');
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);

if (failed > 0) process.exit(1);
