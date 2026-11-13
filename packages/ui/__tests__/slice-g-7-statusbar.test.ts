// packages/ui/__tests__/slice-g-7-statusbar.test.ts
// Slice g-7 tests: status bar (SUBSPEC-G §6.5).
// Run: node --experimental-strip-types __tests__/slice-g-7-statusbar.test.ts

import {
  createStatusBar,
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

console.log('--- Slice g-7: coordinates ---');

{
  const sb = createStatusBar();
  sb.setCoordinates(1.7, 2.3, -3.9);
  const s = sb.state();
  assertEqual(s.coordinates?.x, 1, 'g-7.2: X truncated to integer');
  assertEqual(s.coordinates?.y, 2, 'g-7.2: Y truncated to integer');
  assertEqual(s.coordinates?.z, -3, 'g-7.2: Z truncated to integer');
  assertEqual(sb.coordinateLabel(), 'X: 1  Y: 2  Z: -3', 'g-7.2: coordinate label formatted');
  sb.clearCoordinates();
  assertEqual(sb.state().coordinates, null, 'g-7.2: clearCoordinates nulls the value');
  assertEqual(sb.coordinateLabel(), '', 'g-7.2: empty label when no coordinates');
}

console.log('--- Slice g-7: tool mode ---');

{
  const sb = createStatusBar();
  sb.setToolMode('move');
  assertEqual(sb.state().toolMode, 'move', 'g-7.3: tool mode reflects the active tool');
  sb.setToolMode(null);
  assertEqual(sb.state().toolMode, null, 'g-7.3: tool mode can be cleared');
}

console.log('--- Slice g-7: snap/grid ---');

{
  const sb = createStatusBar({ snapStep: 0.5, gridVisible: true });
  assertEqual(sb.state().snapStep, 0.5, 'g-7.4: snap step initial value');
  assertEqual(sb.state().gridVisible, true, 'g-7.4: grid visible initial value');
  sb.setSnapStep(2);
  assertEqual(sb.state().snapStep, 2, 'g-7.4: snap step updated');
  sb.setSnapStep(0);
  assertEqual(sb.state().snapStep, 0.0625, 'g-7.4: snap step clamped to minimum');
  sb.setGridVisible(false);
  assertEqual(sb.state().gridVisible, false, 'g-7.4: grid visibility toggled');
}

console.log('--- Slice g-7: save status ---');

{
  const sb = createStatusBar();
  assertEqual(sb.state().saveStatus, 'idle', 'g-7.5: starts idle');
  for (const status of ['saving', 'saved', 'error', 'idle'] as const) {
    sb.setSaveStatus(status);
    assertEqual(sb.state().saveStatus, status, `g-7.5: save status ${status}`);
  }
}

console.log('--- Slice g-7: performance ---');

{
  const sb = createStatusBar({ perfThresholdFps: 30 });
  sb.setPerf(60, 12345);
  const s = sb.state();
  assertEqual(s.perf.fps, 60, 'g-7.6: FPS stored');
  assertEqual(s.perf.triangles, 12345, 'g-7.6: triangle count stored');
  assertEqual(s.perf.degraded, false, 'g-7.6: not degraded above threshold');
  sb.setPerf(15.7, 99999.4);
  const s2 = sb.state();
  assertEqual(s2.perf.fps, 16, 'g-7.6: FPS rounded');
  assertEqual(s2.perf.triangles, 99999, 'g-7.6: triangles truncated');
  assertEqual(s2.perf.degraded, true, 'g-7.6: degraded below threshold');
  sb.setPerf(-5, -1);
  assertEqual(sb.state().perf.fps, 0, 'g-7.6: FPS clamped at 0');
  assertEqual(sb.state().perf.triangles, 0, 'g-7.6: triangles clamped at 0');
}

console.log('--- Slice g-7: notifications ---');

{
  const sb = createStatusBar({ maxNotifications: 2 });
  const id1 = sb.pushNotification('hello', 'info');
  const id2 = sb.pushNotification('warn', 'warning');
  assertEqual(sb.state().notifications.length, 2, 'g-7.7: two notifications');
  // Cap drops the oldest.
  sb.pushNotification('third', 'error');
  assertEqual(sb.state().notifications.length, 2, 'g-7.7: cap enforced');
  assertEqual(sb.state().notifications[0].message, 'warn', 'g-7.7: oldest dropped on overflow');
  // Dismiss.
  sb.dismissNotification(id2);
  assertEqual(sb.state().notifications.length, 1, 'g-7.7: dismiss removes one');
  // Dismiss unknown is a no-op.
  sb.dismissNotification('nope');
  assertEqual(sb.state().notifications.length, 1, 'g-7.7: dismissing unknown is a no-op');
  sb.clearNotifications();
  assertEqual(sb.state().notifications.length, 0, 'g-7.7: clear empties');
  // Returned id is usable.
  assert(id1.startsWith('n'), 'g-7.7: push returns an id');
}

console.log('--- Slice g-7: state immutability ---');

{
  const sb = createStatusBar();
  sb.pushNotification('a');
  const snap = JSON.stringify(sb.state());
  sb.setCoordinates(1, 2, 3);
  // The earlier snapshot is unaffected.
  assertEqual(JSON.parse(snap).notifications.length, 1, 'g-7.8: state() returns a copy');
}

console.log('\n=== Slice g-7 Test Summary ===');
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);

if (failed > 0) process.exit(1);
