// packages/ui/__tests__/slice-g-10-tooltips.test.ts
// Slice g-10 tests: tooltip implementation (SUBSPEC-G §4.3, §6.6).
// Run: node --experimental-strip-types __tests__/slice-g-10-tooltips.test.ts

import {
  createTooltipController,
  DEFAULT_TOOLTIP_CONFIG,
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

console.log('--- Slice g-10: hover delay ---');

{
  const ctrl = createTooltipController();
  assertEqual(ctrl.hover('btn', 0), false, 'g-10.2: not visible immediately');
  assertEqual(ctrl.hover('btn', 500), true, 'g-10.2: visible after 500ms');
  assertEqual(ctrl.currentTooltip(), 'btn', 'g-10.2: currentTooltip reflects visibility');
  ctrl.leave('btn');
  assertEqual(ctrl.currentTooltip(), null, 'g-10.3: leave hides immediately');
}

console.log('--- Slice g-10: shortcut display ---');

{
  const bindings = new Map([['move', { action: 'move', keys: 'W', editable: true, category: 'tools' as const, enabled: true }]]);
  const ctrl = createTooltipController({ bindings });
  assertEqual(ctrl.shortcutFor('move'), 'W', 'g-10.4: shortcut displayed when binding exists');
  assertEqual(ctrl.shortcutFor('nope'), null, 'g-10.4: no shortcut for unbound action');
}

console.log('--- Slice g-10: reference panel via ? ---');

{
  const ctrl = createTooltipController();
  assertEqual(ctrl.referenceOpen(), false, 'g-10.5: reference closed by default');
  assertEqual(ctrl.handleKey('?'), true, 'g-10.5: ? opens reference');
  assertEqual(ctrl.referenceOpen(), true, 'g-10.5: reference now open');
  assertEqual(ctrl.handleKey('?'), true, 'g-10.5: ? toggles reference');
  assertEqual(ctrl.referenceOpen(), false, 'g-10.5: reference closed again');
  ctrl.openReference();
  assertEqual(ctrl.referenceOpen(), true, 'g-10.5: openReference works');
  ctrl.closeReference();
  assertEqual(ctrl.referenceOpen(), false, 'g-10.5: closeReference works');
  ctrl.openReference();
  assertEqual(ctrl.handleKey('Escape'), true, 'g-10.5: Escape closes reference');
  assertEqual(ctrl.referenceOpen(), false, 'g-10.5: reference closed by Escape');
}

console.log('--- Slice g-10: onboarding ---');

{
  const ctrl = createTooltipController({ onboardingInitial: { firstLaunch: true } });
  assertEqual(ctrl.onboarding().isVisible(), true, 'g-10.6: onboarding visible on first launch');
  ctrl.onboarding().dismiss();
  assertEqual(ctrl.onboarding().isVisible(), false, 'g-10.6: dismissed');
  ctrl.onboarding().replay();
  assertEqual(ctrl.onboarding().isVisible(), true, 'g-10.6: replay shows again');
}

console.log('--- Slice g-10: default config ---');

{
  const ctrl = createTooltipController();
  assertEqual(ctrl.tooltip().config().delayMs, DEFAULT_TOOLTIP_CONFIG.delayMs, 'g-10.1: default delay 500ms');
  assertEqual(ctrl.tooltip().config().maxWidthPx, DEFAULT_TOOLTIP_CONFIG.maxWidthPx, 'g-10.1: default max width 300px');
}

console.log('\n=== Slice g-10 Test Summary ===');
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);

if (failed > 0) process.exit(1);
