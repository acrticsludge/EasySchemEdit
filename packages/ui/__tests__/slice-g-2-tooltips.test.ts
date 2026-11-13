// packages/ui/__tests__/slice-g-2-tooltips.test.ts
// Slice g-2 tests: tooltip timing + onboarding state (SUBSPEC-G §2.3, §4.3, §6.6, §6.6.1).
// Run: node --experimental-strip-types __tests__/slice-g-2-tooltips.test.ts

import {
  DEFAULT_TOOLTIP_CONFIG,
  MIN_TOOLTIP_DELAY_MS,
  MAX_TOOLTIP_DELAY_MS,
  BROWSER_RESERVED_SHORTCUTS,
  createOnboardingState,
  createTooltipState,
  isBrowserReservedShortcut,
  validateTooltipConfig,
  type TooltipConfig,
} from '../src/tooltip-types.ts';

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

const config = (over: Partial<TooltipConfig> = {}): TooltipConfig => ({
  ...DEFAULT_TOOLTIP_CONFIG,
  ...over,
});

console.log('--- Slice g-2: tooltip config (§4.3) ---');

{
  assertEqual(DEFAULT_TOOLTIP_CONFIG.delayMs, 500, 'g-2.1: the default delay is 500ms (G7)');
  assertEqual(DEFAULT_TOOLTIP_CONFIG.maxWidthPx, 300, 'g-2.1: max width is 300px');
  assertEqual(DEFAULT_TOOLTIP_CONFIG.position, 'auto', 'g-2.1: default position is auto');
  assertEqual(DEFAULT_TOOLTIP_CONFIG.showShortcut, true, 'g-2.1: shortcuts are shown by default');
  assertEqual(MIN_TOOLTIP_DELAY_MS, 200, 'g-2.2: minimum delay is 200ms');
  assertEqual(MAX_TOOLTIP_DELAY_MS, 1000, 'g-2.2: maximum delay is 1000ms');

  assertEqual(validateTooltipConfig(config()).ok, true, 'g-2.2: the default config is valid');
  assertEqual(validateTooltipConfig(config({ delayMs: 200 })).ok, true, 'g-2.2: 200ms is valid');
  assertEqual(validateTooltipConfig(config({ delayMs: 1000 })).ok, true, 'g-2.2: 1000ms is valid');

  const tooFast = validateTooltipConfig(config({ delayMs: 150 }));
  assertEqual(tooFast.ok, false, 'g-2.2: 150ms is invalid');
  assert(
    tooFast.ok === false && tooFast.reasons.some((r) => r.includes('200') && r.includes('1000')),
    'g-2.2: the reason names the valid range',
  );
  const tooSlow = validateTooltipConfig(config({ delayMs: 1200 }));
  assertEqual(tooSlow.ok, false, 'g-2.2: 1200ms is invalid');

  const badWidth = validateTooltipConfig(config({ maxWidthPx: 0 }));
  assertEqual(badWidth.ok, false, 'g-2: a zero max width is invalid');
  const badPosition = validateTooltipConfig(config({ position: 'middle' as never }));
  assertEqual(badPosition.ok, false, 'g-2: an unknown position is invalid');
}

console.log('--- Slice g-2: hover delay (§6.6) ---');

{
  const tips = createTooltipState();
  const start = 1000;

  // Not visible before the delay elapses.
  assertEqual(tips.hover('btn-save', start), false, 'g-2.3: the tooltip is not shown immediately');
  assertEqual(tips.visibleTarget(), null, 'g-2.3: no target is visible yet');

  // Visible once the delay has elapsed.
  assertEqual(tips.hover('btn-save', start + 499), false, 'g-2.3: 499ms is not enough');
  assertEqual(tips.hover('btn-save', start + 500), true, 'g-2.3: 500ms shows the tooltip');
  assertEqual(tips.visibleTarget(), 'btn-save', 'g-2.3: the hovered target is visible');

  // Leaving hides it at once.
  tips.leave('btn-save');
  assertEqual(tips.visibleTarget(), null, 'g-2.4: leaving hides the tooltip');
}

console.log('--- Slice g-2: leaving before the delay ---');

{
  const tips = createTooltipState();
  const start = 5000;
  assertEqual(tips.hover('btn-export', start), false, 'g-2.4: hover starts the delay');
  tips.leave('btn-export');
  // Even well past the delay, a target that was left must not appear.
  assertEqual(tips.hover('btn-export', start + 5000), false, 'g-2.4: a left target does not appear later');
  assertEqual(tips.visibleTarget(), null, 'g-2.4: nothing is visible');
}

console.log('--- Slice g-2: moving between targets ---');

{
  const tips = createTooltipState();
  const start = 9000;
  assertEqual(tips.hover('a', start), false, 'g-2.5: hovering A starts the delay');
  assertEqual(tips.moveTo('b', start + 600), false, 'g-2.5: moving to B restarts the delay');
  assertEqual(tips.moveTo('b', start + 600 + 500), true, 'g-2.5: B shows after its own delay');
  assertEqual(tips.visibleTarget(), 'b', 'g-2.5: B is the visible target');
  // The old target never becomes visible again.
  assertEqual(tips.moveTo('a', start + 600 + 600), false, 'g-2.5: A restarts the delay too');
}

console.log('--- Slice g-2: shortcut reference and display (§6.6, §4.3) ---');

{
  const tips = createTooltipState({
    bindings: new Map([
      ['undo', { action: 'undo', keys: 'Ctrl+Z', editable: true, category: 'editing', enabled: true }],
      ['save-project', { action: 'save-project', keys: 'Ctrl+S', editable: true, category: 'file', enabled: true }],
    ]),
  });

  assertEqual(tips.isShortcutReferenceRequest('?'), true, 'g-2.6: "?" opens the shortcut reference');
  assertEqual(tips.isShortcutReferenceRequest('/'), false, 'g-2.6: "/" is not the reference key');
  assertEqual(tips.isShortcutReferenceRequest('a'), false, 'g-2.6: a letter is not the reference key');

  assertEqual(tips.shortcutFor('undo'), 'Ctrl+Z', 'g-2.7: a bound action shows its shortcut');
  assertEqual(tips.shortcutFor('bake'), null, 'g-2.7: an unbound action shows no shortcut');
}

console.log('--- Slice g-2: onboarding (§6.6, §4.3) ---');

{
  const onboarding = createOnboardingState();
  assertEqual(onboarding.state().firstLaunch, true, 'g-2.8: first launch is flagged');
  assertEqual(onboarding.isVisible(), true, 'g-2.8: onboarding is visible on first launch');
  assertEqual(onboarding.state().dismissed, false, 'g-2.8: a fresh state is not dismissed');

  onboarding.completeStep('import-schematic');
  onboarding.completeStep('place-preview');
  assertEqual(onboarding.state().completedSteps.length, 2, 'g-2.9: completed steps are recorded');

  onboarding.dismiss();
  assertEqual(onboarding.isVisible(), false, 'g-2.8: dismissing hides onboarding');
  assertEqual(onboarding.state().dismissed, true, 'g-2.8: the dismissed flag is set');
  assertEqual(onboarding.state().completedSteps.length, 2, 'g-2.8: dismissing preserves completed steps');
  assertEqual(onboarding.state().firstLaunch, false, 'g-2.8: firstLaunch is cleared after dismissal');

  // A duplicate step is not recorded twice.
  onboarding.completeStep('import-schematic');
  assertEqual(onboarding.state().completedSteps.length, 2, 'g-2.9: a step is never recorded twice');

  // Replay from settings.
  onboarding.replay();
  assertEqual(onboarding.isVisible(), true, 'g-2.8: replay makes onboarding visible again');
  assertEqual(onboarding.state().dismissed, false, 'g-2.8: replay clears the dismissed flag');
  assertEqual(onboarding.state().completedSteps.length, 2, 'g-2.8: replay preserves completed steps');
  assertEqual(onboarding.state().replayable, true, 'g-2.8: onboarding stays replayable');

  // A state that was never dismissed but has completed steps is still visible.
  const partial = createOnboardingState({ completedSteps: ['x'] });
  assertEqual(partial.isVisible(), true, 'g-2.8: an undismissed onboarding is visible');
}

console.log('--- Slice g-2: browser-reserved shortcuts (§6.6.1) ---');

{
  // Browser-reserved chords cannot be overridden.
  const reserved = ['Ctrl+T', 'Ctrl+W', 'Ctrl+N', 'Ctrl+Shift+T', 'Ctrl+Shift+W', 'Ctrl+Shift+N', 'Ctrl+Q', 'F5', 'F11', 'F12'];
  for (const chord of reserved) {
    assert(isBrowserReservedShortcut(chord), `g-2.10: ${chord} is reserved`);
  }
  assertEqual(BROWSER_RESERVED_SHORTCUTS.length, reserved.length, 'g-2.10: every reserved chord is listed');

  // Case and order do not matter.
  assert(isBrowserReservedShortcut('ctrl+t'), 'g-2.10: the check is case-insensitive');
  assert(isBrowserReservedShortcut('Ctrl+Shift+T'), 'g-2.10: a shifted reserved chord is reserved');

  // Normal chords are allowed.
  for (const chord of ['Ctrl+Z', 'Ctrl+S', 'W', 'Delete', 'Ctrl+Shift+K']) {
    assert(!isBrowserReservedShortcut(chord), `g-2.10: ${chord} is not reserved`);
  }
}

console.log('\n=== Slice g-2 Test Summary ===');
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);

if (failed > 0) {
  process.exit(1);
}