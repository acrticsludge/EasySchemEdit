// packages/ui/__tests__/slice-g-12-bottom-panels.test.ts
// Slice g-12 tests: bottom panels (SUBSPEC-G §6.4).
// Run: node --experimental-strip-types __tests__/slice-g-12-bottom-panels.test.ts

import {
  createBottomPanels,
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

console.log('--- Slice g-12: tab switching ---');

{
  const bp = createBottomPanels();
  assertEqual(bp.activeTab(), 'materials', 'g-12.1: starts on materials');
  bp.setActiveTab('conflicts');
  assertEqual(bp.activeTab(), 'conflicts', 'g-12.2: tab switched');
  bp.setActiveTab('nope' as any);
  assertEqual(bp.activeTab(), 'conflicts', 'g-12.2: unknown tab ignored');
}

console.log('--- Slice g-12: state preservation ---');

{
  const bp = createBottomPanels();
  bp.setTabState('materials', { filter: 'stone' });
  bp.setActiveTab('conflicts');
  bp.setActiveTab('materials');
  assertEqual(bp.getTabState('materials').filter, 'stone', 'g-12.3: tab state preserved');
}

console.log('--- Slice g-12: confirm dialog ---');

{
  const bp = createBottomPanels();
  bp.requestConfirm({ title: 'Delete?', message: 'Are you sure?', confirmLabel: 'Delete', cancelLabel: 'Cancel', destructive: true });
  assertEqual(bp.state().confirmDialog?.destructive, true, 'g-12.4: confirm dialog shown');
  const result = bp.resolveConfirm(true);
  assertEqual(result, true, 'g-12.4: confirm resolved true');
  assertEqual(bp.state().confirmDialog, null, 'g-12.4: dialog cleared');
  // Cancel.
  bp.requestConfirm({ title: 'X', message: 'Y', confirmLabel: 'OK', cancelLabel: 'Cancel', destructive: false });
  bp.cancelConfirm();
  assertEqual(bp.state().confirmDialog, null, 'g-12.4: cancel clears dialog');
}

console.log('--- Slice g-12: progress ---');

{
  const bp = createBottomPanels();
  bp.startProgress('Exporting', true);
  assertEqual(bp.state().progress?.active, true, 'g-12.4: progress started');
  assertEqual(bp.state().progress?.cancellable, true, 'g-12.4: cancellable');
  bp.updateProgress(50);
  assertEqual(bp.state().progress?.percent, 50, 'g-12.4: progress updated');
  bp.updateProgress(150);
  assertEqual(bp.state().progress?.percent, 100, 'g-12.4: progress clamped to 100');
  assertEqual(bp.cancelProgress(), true, 'g-12.4: cancel succeeds when cancellable');
  assertEqual(bp.state().progress, null, 'g-12.4: progress cleared');
  // Non-cancellable.
  bp.startProgress('Saving', false);
  assertEqual(bp.cancelProgress(), false, 'g-12.4: cancel fails when not cancellable');
  bp.finishProgress();
  assertEqual(bp.state().progress?.active, false, 'g-12.4: finish deactivates');
}

console.log('--- Slice g-12: warnings ---');

{
  const bp = createBottomPanels();
  bp.pushWarning({ id: 'w1', message: 'Low FPS', severity: 'warning', icon: '⚠' });
  bp.pushWarning({ id: 'w1', message: 'Low FPS', severity: 'warning', icon: '⚠' }); // dedupe
  assertEqual(bp.state().warnings.length, 1, 'g-12.4: warnings deduped');
  bp.dismissWarning('w1');
  assertEqual(bp.state().warnings.length, 0, 'g-12.4: warning dismissed');
  bp.pushWarning({ id: 'w2', message: 'Error', severity: 'error', icon: '✕' });
  bp.clearWarnings();
  assertEqual(bp.state().warnings.length, 0, 'g-12.4: clear all warnings');
}

console.log('--- Slice g-12: lock targets ---');

{
  const bp = createBottomPanels();
  bp.setLockedTargets(['p1', 'p2']);
  assertEqual(bp.lockedTargets().length, 2, 'g-12.5: locked targets tracked');
  assertEqual(bp.lockedTargets()[0], 'p1', 'g-12.5: lock targets shown (not just color)');
}

console.log('--- Slice g-12: color not only signal ---');

{
  const bp = createBottomPanels();
  bp.pushWarning({ id: 'w3', message: 'Conflict', severity: 'error', icon: '✕' });
  const w = bp.state().warnings[0];
  assert(w.icon.length > 0, 'g-12.6: warning has icon (non-color signal)');
  assert(w.message.length > 0, 'g-12.6: warning has text (non-color signal)');
}

console.log('\n=== Slice g-12 Test Summary ===');
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);

if (failed > 0) process.exit(1);
