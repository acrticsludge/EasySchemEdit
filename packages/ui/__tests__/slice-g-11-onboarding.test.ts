// packages/ui/__tests__/slice-g-11-onboarding.test.ts
// Slice g-11 tests: onboarding implementation (SUBSPEC-G §6.6).
// Run: node --experimental-strip-types __tests__/slice-g-11-onboarding.test.ts

import {
  createOnboarding,
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

console.log('--- Slice g-11: visibility ---');

{
  const ob = createOnboarding({ initial: { firstLaunch: true } });
  assertEqual(ob.isVisible(), true, 'g-11.6: visible on first launch');
  ob.dismiss();
  assertEqual(ob.isVisible(), false, 'g-11.2: dismissed hides');
  ob.replay();
  assertEqual(ob.isVisible(), true, 'g-11.3: replay shows again');
}

console.log('--- Slice g-11: dismiss clears firstLaunch ---');

{
  const ob = createOnboarding({ initial: { firstLaunch: true } });
  ob.dismiss();
  assertEqual(ob.state().firstLaunch, false, 'g-11.2: firstLaunch cleared on dismiss');
  assertEqual(ob.state().dismissed, true, 'g-11.2: dismissed set');
}

console.log('--- Slice g-11: step tracking ---');

{
  const ob = createOnboarding();
  ob.completeStep('step1');
  ob.completeStep('step1'); // duplicate
  assertEqual(ob.completedSteps().length, 1, 'g-11.4: no duplicate steps');
  assertEqual(ob.isStepCompleted('step1'), true, 'g-11.4: step marked completed');
  assertEqual(ob.isStepCompleted('step2'), false, 'g-11.4: uncompleted step false');
  ob.completeStep('step2');
  assertEqual(ob.completedSteps().length, 2, 'g-11.4: second step added');
}

console.log('--- Slice g-11: replay preserves completedSteps ---');

{
  const ob = createOnboarding();
  ob.completeStep('step1');
  ob.dismiss();
  ob.replay();
  assertEqual(ob.isStepCompleted('step1'), true, 'g-11.3: replay preserves completed steps');
  assertEqual(ob.isVisible(), true, 'g-11.3: replay shows flow');
}

console.log('--- Slice g-11: persistence round-trip ---');

{
  const ob = createOnboarding();
  ob.completeStep('step1');
  ob.dismiss();
  const exported = ob.exportState();
  const ob2 = createOnboarding();
  ob2.importState(exported);
  assertEqual(ob2.isStepCompleted('step1'), true, 'g-11.5: imported step preserved');
  assertEqual(ob2.isVisible(), false, 'g-11.5: imported dismissed state');
  assertEqual(ob2.state().firstLaunch, exported.firstLaunch, 'g-11.5: imported firstLaunch');
}

console.log('--- Slice g-11: reset ---');

{
  const ob = createOnboarding();
  ob.completeStep('step1');
  ob.dismiss();
  ob.reset();
  assertEqual(ob.isVisible(), true, 'g-11.6: reset restores visibility');
  assertEqual(ob.completedSteps().length, 0, 'g-11.6: reset clears completed steps');
}

console.log('\n=== Slice g-11 Test Summary ===');
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);

if (failed > 0) process.exit(1);
