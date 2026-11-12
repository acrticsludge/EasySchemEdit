import {
  validateTranslation,
  validateVolumeBounds,
  validatePaletteSize,
  validateNbtTagList,
  validateZeroSize,
  ValidationError,
} from '../validation.ts';

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

// Test 1: Fractional translation rejected
try {
  validateTranslation([1.5, 0, 0]);
  assert(false, 'should throw ENGINE_OFF_GRID_TRANSFORM');
} catch (e) {
  assert(e instanceof ValidationError && (e as ValidationError).code === 'ENGINE_OFF_GRID_TRANSFORM', 'fractional translation throws ENGINE_OFF_GRID_TRANSFORM');
}

// Test 2: Integer translation OK
try {
  validateTranslation([1, 0, 0]);
  assert(true, 'integer translation OK');
} catch {
  assert(false, 'integer translation should not throw');
}

// Test 3: Zero-size dimension → INTEGER_OVERFLOW
try {
  validateVolumeBounds([0, 0, 0], [0, 16, 16]);
  assert(false, 'should throw INTEGER_OVERFLOW');
} catch (e) {
  assert(e instanceof ValidationError && (e as ValidationError).code === 'INTEGER_OVERFLOW', 'zero dimension throws INTEGER_OVERFLOW');
}

// Test 4: Zero-size placement → EMPTY_VOLUME
const zeroSize = validateZeroSize([0, 0, 0], [0, 16, 16]);
assert(zeroSize === 'EMPTY_VOLUME', 'zero-size placement returns EMPTY_VOLUME');

// Test 5: Palette size thresholds
assert(validatePaletteSize(200) === 'Uint8Array', 'palette 200 → Uint8Array');
assert(validatePaletteSize(300) === 'Uint16Array', 'palette 300 → Uint16Array');

// Test 6: Mixed-type list rejected
try {
  validateNbtTagList([
    { type: 'byte', value: 1 },
    { type: 'int', value: 2 },
  ]);
  assert(false, 'should throw NBT_MIXED_TYPE_LIST');
} catch (e) {
  assert(e instanceof ValidationError && (e as ValidationError).code === 'NBT_MIXED_TYPE_LIST', 'mixed-type list throws NBT_MIXED_TYPE_LIST');
}

// Test 7: Same-type list OK
try {
  validateNbtTagList([
    { type: 'byte', value: 1 },
    { type: 'byte', value: 2 },
  ]);
  assert(true, 'same-type list OK');
} catch {
  assert(false, 'same-type list should not throw');
}

console.log(`\nResults: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
}
