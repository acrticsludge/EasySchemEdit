// packages/ui/__tests__/slice-g-3-design-tokens.test.ts
// Slice g-3 tests: design tokens + WCAG 2.2 contrast verification (SUBSPEC-G §1.5).
// Run: node --experimental-strip-types __tests__/slice-g-3-design-tokens.test.ts

import {
  COLOR_TOKENS,
  SPACING_TOKENS,
  REQUIRED_CONTRAST,
  TEXT_TOKEN_PAIRS,
  COMPONENT_TOKEN_PAIRS,
  SURFACE_TOKENS,
  contrastRatio,
  relativeLuminance,
  requiredContrastFor,
  toCssCustomProperties,
  verifyTokenContrast,
  type ColorTokens,
} from '../src/design-tokens.ts';

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

function assertClose(actual: number, expected: number, tolerance: number, message: string): void {
  if (Math.abs(actual - expected) <= tolerance) {
    passed++;
  } else {
    failed++;
    console.error(`FAIL: ${message} — expected ~${expected}, got ${actual}`);
  }
}

console.log('--- Slice g-3: token table (§1.5) ---');

{
  // Exact spec values, verbatim from §1.5 of SUBSPEC-G.
  const expected: Array<[string, string]> = [
    ['--color-bg-primary', '#0d0d0d'],
    ['--color-bg-secondary', '#1a1a1a'],
    ['--color-bg-tertiary', '#252525'],
    ['--color-border', '#999999'],
    ['--color-border-hover', '#b3b3b3'],
    ['--color-text-primary', '#eaeaea'],
    ['--color-text-secondary', '#a8a8a8'],
    ['--color-text-muted', '#b3b3b3'],
    ['--color-accent', '#4a9eff'],
    ['--color-accent-hover', '#6ab0ff'],
    ['--color-error', '#ef4444'],
    ['--color-warning', '#eab308'],
    ['--color-success', '#22c55e'],
    ['--color-conflict-clean', '#22c55e'],
    ['--color-conflict-same-state', '#eab308'],
    ['--color-conflict-state', '#ef4444'],
  ];
  for (const [name, value] of expected) {
    assertEqual(COLOR_TOKENS[name], value, `g-3.1: ${name} is ${value}`);
  }

  // The added token, documented in the slice plan and DOUBTS D-9.
  assertEqual(COLOR_TOKENS['--color-error-text'], '#f94e4e', 'g-3.7: --color-error-text is the added text-safe error');

  // Conflict tokens alias the status colours (the spec maps them 1:1).
  assertEqual(COLOR_TOKENS['--color-conflict-clean'], COLOR_TOKENS['--color-success'], 'g-3.1: conflict-clean aliases success');
  assertEqual(COLOR_TOKENS['--color-conflict-same-state'], COLOR_TOKENS['--color-warning'], 'g-3.1: conflict-same-state aliases warning');
  assertEqual(COLOR_TOKENS['--color-conflict-state'], COLOR_TOKENS['--color-error'], 'g-3.1: conflict-state aliases error');

  // Spacing scale.
  assertEqual(SPACING_TOKENS['--spacing-xs'], '4px', 'g-3.1: spacing xs is 4px');
  assertEqual(SPACING_TOKENS['--spacing-sm'], '8px', 'g-3.1: spacing sm is 8px');
  assertEqual(SPACING_TOKENS['--spacing-md'], '12px', 'g-3.1: spacing md is 12px');
  assertEqual(SPACING_TOKENS['--spacing-lg'], '16px', 'g-3.1: spacing lg is 16px');
  assertEqual(SPACING_TOKENS['--spacing-xl'], '24px', 'g-3.1: spacing xl is 24px');
  assertEqual(SPACING_TOKENS['--spacing-xxl'], '32px', 'g-3.1: spacing xxl is 32px');
  assertEqual(Object.keys(SPACING_TOKENS).length, 6, 'g-3.1: six spacing steps');
}

console.log('--- Slice g-3: WCAG relative luminance ---');

{
  assertClose(relativeLuminance('#000000'), 0, 1e-9, 'g-3.2: black has luminance 0');
  assertClose(relativeLuminance('#ffffff'), 1, 1e-9, 'g-3.2: white has luminance 1');
  // sRGB mid-grey with no gamma would be 0.5; the linearised value is ~0.2159.
  assertClose(relativeLuminance('#808080'), 0.2159, 0.001, 'g-3.2: mid-grey linearises to ~0.216');
  // The spec's claimed luminance for bg-primary is ~0.018; the real value is ~0.004.
  assertClose(relativeLuminance('#0d0d0d'), 0.004, 0.001, 'g-3.2: bg-primary luminance measures ~0.004, not the spec\'s 0.018');
  // Accepts both "#rrggbb" and "rrggbb".
  assertClose(relativeLuminance('0d0d0d'), relativeLuminance('#0d0d0d'), 1e-12, 'g-3.2: the hash is optional');
}

console.log('--- Slice g-3: contrast ratio maths ---');

{
  assertClose(contrastRatio('#000000', '#ffffff'), 21, 1e-9, 'g-3.3: black on white is exactly 21:1');
  assertClose(contrastRatio('#ffffff', '#000000'), 21, 1e-9, 'g-3.4: the ratio is symmetric');
  assertClose(contrastRatio('#4a9eff', '#4a9eff'), 1, 1e-9, 'g-3.4: a colour against itself is 1:1');
  assert(contrastRatio('#eaeaea', '#0d0d0d') > 1, 'g-3.4: a ratio is never below 1');
  // Symmetry across a real pair.
  assertClose(
    contrastRatio('#ef4444', '#252525'),
    contrastRatio('#252525', '#ef4444'),
    1e-12,
    'g-3.4: symmetry holds for a real token pair',
  );
}

console.log('--- Slice g-3: requirement thresholds ---');

{
  assertEqual(requiredContrastFor('normal-text'), 4.5, 'g-3: normal text needs 4.5:1');
  assertEqual(requiredContrastFor('large-text'), 3, 'g-3: large text needs 3:1');
  assertEqual(requiredContrastFor('component'), 3, 'g-3: UI components need 3:1');
  assertEqual(REQUIRED_CONTRAST['normal-text'], 4.5, 'g-3: the threshold table matches the function');
  assertEqual(SURFACE_TOKENS.length, 3, 'g-3: three surfaces are verified');
}

console.log('--- Slice g-3: computed ratios match the recorded findings ---');

{
  const bg = COLOR_TOKENS['--color-bg-primary'];
  const findings: Array<[string, string, number]> = [
    ['--color-text-primary', '#eaeaea', 16.16],
    ['--color-text-secondary', '#a8a8a8', 8.17],
    ['--color-text-muted', '#b3b3b3', 9.27],
    ['--color-border', '#999999', 6.82],
    ['--color-border-hover', '#b3b3b3', 9.27],
    ['--color-accent', '#4a9eff', 7.06],
    ['--color-error', '#ef4444', 5.16],
    ['--color-warning', '#eab308', 10.13],
    ['--color-success', '#22c55e', 8.53],
  ];
  for (const [name, hex, expectedRatio] of findings) {
    assertEqual(COLOR_TOKENS[name], hex, `g-3.5: ${name} retains its spec hex`);
    assertClose(contrastRatio(hex, bg), expectedRatio, 0.02, `g-3.5: ${name} on bg-primary measures ${expectedRatio}:1`);
  }

  // The spec's claimed text-primary ratio (~14) does not match the measurement (16.16).
  const claimed = 14;
  assert(
    Math.abs(contrastRatio('#eaeaea', bg) - claimed) > 1,
    'g-3.5: the spec\'s "~14:1" claim for text-primary does not match the computed value',
  );
}

console.log('--- Slice g-3: the known AA failure is reported, not hidden ---');

{
  const results = verifyTokenContrast(TEXT_TOKEN_PAIRS);
  assertEqual(results.length, TEXT_TOKEN_PAIRS.length, 'g-3.9: one result per pair');

  const failing = results.filter((r) => !r.pass);
  assertEqual(failing.length, 1, 'g-3.9: exactly one text pair fails');
  assertEqual(failing[0].foreground, '--color-error', 'g-3.6: the failure is --color-error');
  assertEqual(failing[0].background, '--color-bg-tertiary', 'g-3.6: the failure is on the hovered surface');
  assertClose(failing[0].ratio, 4.07, 0.02, 'g-3.6: the failing ratio is 4.07:1, below 4.5:1');
  assertEqual(failing[0].required, 4.5, 'g-3.6: the requirement is 4.5:1 normal text');

  // Every other text pair passes.
  const passing = results.filter((r) => r.pass);
  assertEqual(passing.length, results.length - 1, 'g-3.6: every other text token passes');
  for (const result of passing) {
    assert(
      result.ratio >= result.required,
      `g-3.6: ${result.foreground} on ${result.background} meets ${result.required}:1`,
    );
  }
}

console.log('--- Slice g-3: the text-safe error token closes the gap ---');

{
  // --color-error-text must clear 4.5:1 on every surface, which is exactly what --color-error cannot.
  for (const surface of SURFACE_TOKENS) {
    const ratio = contrastRatio(COLOR_TOKENS['--color-error-text'], COLOR_TOKENS[surface]);
    assert(
      ratio >= 4.5,
      `g-3.7: --color-error-text on ${surface} meets 4.5:1 (measured ${ratio.toFixed(2)})`,
    );
  }
  assertClose(
    contrastRatio(COLOR_TOKENS['--color-error-text'], COLOR_TOKENS['--color-bg-tertiary']),
    4.55,
    0.02,
    'g-3.7: the added token measures 4.55:1 on the tertiary surface',
  );

  // It stays in the same hue family (red: r >> g == b) so it reads as an error colour.
  const h = COLOR_TOKENS['--color-error-text'].slice(1);
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  assert(r > g && r > b && g === b, 'g-3.7: the added token is a pure-hue red like #ef4444');
}

console.log('--- Slice g-3: component contrast (3:1) ---');

{
  const results = verifyTokenContrast(COMPONENT_TOKEN_PAIRS);
  for (const result of results) {
    if (!result.pass) {
      console.error(
        `  detail: ${result.foreground} on ${result.background} = ${result.ratio.toFixed(2)} < ${result.required}`,
      );
    }
    assert(
      result.pass,
      `g-3.8: ${result.foreground} on ${result.background} meets ${result.required}:1`,
    );
  }
  assert(results.length > 0, 'g-3.8: component pairs are actually verified');
}

console.log('--- Slice g-3: custom property emission ---');

{
  const css = toCssCustomProperties();
  assert(css.includes('--color-bg-primary: #0d0d0d;'), 'g-3.10: bg-primary is emitted');
  assert(css.includes('--spacing-md: 12px;'), 'g-3.10: spacing is emitted');
  assertEqual(css.split('\n').length, Object.keys(COLOR_TOKENS).length + Object.keys(SPACING_TOKENS).length, 'g-3.10: one line per token');

  // Round-trip: parse the emission back into a token map and compare.
  const parsed: Record<string, string> = {};
  for (const line of css.split('\n')) {
    const match = /^(--[\w-]+):\s*(.+);$/.exec(line.trim());
    if (match) parsed[match[1]] = match[2];
  }
  assertEqual(parsed['--color-text-primary'], '#eaeaea', 'g-3.10: the emission round-trips');
  assertEqual(Object.keys(parsed).length, Object.keys(COLOR_TOKENS).length + Object.keys(SPACING_TOKENS).length, 'g-3.10: the round-trip keeps every token');

  // A custom palette can be verified against the same rules.
  // #404040 on #0d0d0d is 1.87:1 — far below 4.5:1, so it must fail. (A mid-grey like #808080 would
  // pass at 4.92:1, which is why this test picks a colour that genuinely fails.)
  const alt: ColorTokens = { ...COLOR_TOKENS, '--color-text-primary': '#404040' };
  const altResults = verifyTokenContrast(
    [{ fg: '--color-text-primary', bg: '--color-bg-primary', kind: 'normal-text' }],
    alt,
  );
  assertEqual(altResults[0].pass, false, 'g-3.9: an injected low-contrast palette fails verification');
  assertEqual(altResults[0].ratio < 4.5, true, 'g-3.9: the injected palette reports its real ratio');
  assertClose(altResults[0].ratio, 1.87, 0.02, 'g-3.9: the injected palette ratio is 1.87:1');
}

console.log('\n=== Slice g-3 Test Summary ===');
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);

if (failed > 0) {
  process.exit(1);
}