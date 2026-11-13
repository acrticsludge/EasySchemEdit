// packages/ui/__tests__/slice-g-8-conflict-nav.test.ts
// Slice g-8 tests: conflict navigation (SUBSPEC-G §6.2/§6.4).
// Run: node --experimental-strip-types __tests__/slice-g-8-conflict-nav.test.ts

import {
  createConflictNavigator,
  type Conflict,
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

const conflicts: Conflict[] = [
  { id: 'c1', region: 'A', owner: 'import1', severity: 'yellow', target: { x: 1, y: 2, z: 3 } },
  { id: 'c2', region: 'B', owner: 'import2', severity: 'red', target: { x: 10, y: 20, z: 30 } },
  { id: 'c3', region: 'C', owner: 'import3', severity: 'red', target: { x: 5, y: 5, z: 5 } },
];

console.log('--- Slice g-8: list and sorting ---');

{
  const nav = createConflictNavigator({ conflicts });
  assertEqual(nav.conflicts().length, 3, 'g-8.1: all conflicts loaded');
  const sorted = nav.sortedConflicts();
  assertEqual(sorted[0].severity, 'red', 'g-8.6: red conflicts first');
  assertEqual(sorted[0].region, 'B', 'g-8.6: red sorted by region (B before C)');
  assertEqual(sorted[2].severity, 'yellow', 'g-8.6: yellow last');
}

console.log('--- Slice g-8: hover does not move camera ---');

{
  const nav = createConflictNavigator({ conflicts, initialCamera: { x: 0, y: 0, z: 0 } });
  const before = nav.camera();
  nav.setHovered('c2');
  assertEqual(nav.hoveredId(), 'c2', 'g-8.2: hoveredId set');
  const after = nav.camera();
  assertEqual(after.x, before.x, 'g-8.2: hover does not move camera X');
  assertEqual(after.y, before.y, 'g-8.2: hover does not move camera Y');
  assertEqual(after.z, before.z, 'g-8.2: hover does not move camera Z');
  nav.setHovered(null);
  assertEqual(nav.hoveredId(), null, 'g-8.2: hover cleared');
}

console.log('--- Slice g-8: fly-to ---');

{
  const nav = createConflictNavigator({ conflicts, initialCamera: { x: 0, y: 0, z: 0 }, flyDuration: 1 });
  assertEqual(nav.navigateTo('nope'), false, 'g-8.3: unknown conflict returns false');
  assertEqual(nav.navigateTo('c2'), true, 'g-8.3: navigateTo starts a fly');
  assertEqual(nav.flyState(), 'flying', 'g-8.3: state becomes flying');
  assertEqual(nav.flyProgress(), 0, 'g-8.4: progress starts at 0');
  assert(nav.targetCamera() !== null, 'g-8.4: target camera set');

  // Advance partway.
  nav.advanceFly(0.5);
  assertEqual(nav.flyProgress(), 0.5, 'g-8.4: progress advances');
  assert(nav.flyState() === 'flying', 'g-8.4: still flying mid-flight');

  // Advance to arrival.
  nav.advanceFly(0.6);
  assertEqual(nav.flyProgress(), 1, 'g-8.4: progress clamps to 1');
  assertEqual(nav.flyState(), 'arrived', 'g-8.4: state becomes arrived on completion');
  const cam = nav.camera();
  assertEqual(cam.x, 10, 'g-8.4: camera X set to target');
  assertEqual(cam.y, 20, 'g-8.4: camera Y set to target');
  assertEqual(cam.z, 30, 'g-8.4: camera Z set to target');
}

console.log('--- Slice g-8: cancel mid-flight ---');

{
  const nav = createConflictNavigator({ conflicts, initialCamera: { x: 0, y: 0, z: 0 }, flyDuration: 1 });
  nav.navigateTo('c2');
  nav.advanceFly(0.3);
  const midCam = nav.camera();
  nav.cancelFly();
  assertEqual(nav.flyState(), 'idle', 'g-8.5: cancel returns to idle');
  assertEqual(nav.flyProgress(), 0, 'g-8.5: progress reset');
  const afterCancel = nav.camera();
  assertEqual(afterCancel.x, midCam.x, 'g-8.5: cancel does not jump the camera');
}

console.log('--- Slice g-8: navigate while flying is rejected ---');

{
  const nav = createConflictNavigator({ conflicts, flyDuration: 1 });
  nav.navigateTo('c2');
  assertEqual(nav.navigateTo('c3'), false, 'g-8.3: cannot start a second fly while flying');
}

console.log('--- Slice g-8: resolve conflict ---');

{
  const nav = createConflictNavigator({ conflicts });
  assertEqual(nav.resolveConflict('c1'), true, 'g-8.7: resolve removes the conflict');
  assertEqual(nav.conflicts().length, 2, 'g-8.7: list shrinks');
  assertEqual(nav.resolveConflict('nope'), false, 'g-8.7: resolving unknown returns false');
  // Resolving the hovered conflict clears hover.
  nav.setHovered('c2');
  nav.resolveConflict('c2');
  assertEqual(nav.hoveredId(), null, 'g-8.7: resolving hovered clears hover');
}

console.log('--- Slice g-8: empty list ---');

{
  const nav = createConflictNavigator({ conflicts: [] });
  assertEqual(nav.conflicts().length, 0, 'g-8.8: empty list');
  assertEqual(nav.navigateTo('anything'), false, 'g-8.8: no fly possible with empty list');
  assertEqual(nav.sortedConflicts().length, 0, 'g-8.8: sorted empty');
}

console.log('\n=== Slice g-8 Test Summary ===');
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);

if (failed > 0) process.exit(1);
