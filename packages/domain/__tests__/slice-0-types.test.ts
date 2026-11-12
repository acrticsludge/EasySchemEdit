import type { Vec3Half } from '../types.ts';
import {
  halfToCoord,
  coordToHalf,
  CHUNK_SIZE,
  isIntegralOrigin,
} from '../types.ts';

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

// Test 1: coordToHalf(halfToCoord(x)) === x for a range of integer and half-integer values
const testValues = [0, 1, 2, -1, -2, 0.5, 1.5, -0.5, 100, 100.5];
for (const v of testValues) {
  assert(coordToHalf(halfToCoord(v)) === v, `coordToHalf(halfToCoord(${v})) === ${v}`);
}

// Test 2: halfToCoord(coordToHalf(x)) === x for integer x
const intValues = [0, 1, 2, -1, -2, 100, -100];
for (const v of intValues) {
  assert(halfToCoord(coordToHalf(v)) === v, `halfToCoord(coordToHalf(${v})) === ${v}`);
}

// Test 3: CHUNK_SIZE === 16
assert(CHUNK_SIZE === 16, 'CHUNK_SIZE === 16');

// Test 4: Vec3Half values like [1, 0, 1] represent [0.5, 0, 0.5] when passed through halfToCoord
const half: Vec3Half = [1, 0, 1];
assert(halfToCoord(half[0]) === 0.5, 'halfToCoord(1) === 0.5');
assert(halfToCoord(half[1]) === 0, 'halfToCoord(0) === 0');
assert(halfToCoord(half[2]) === 0.5, 'halfToCoord(1) === 0.5');

// Test 5: Origin [0.5, 0, 0.5] (stored as [1, 0, 1]) is flagged as non-integral
assert(!isIntegralOrigin([1, 0, 1]), '[1,0,1] is not an integral origin');
assert(isIntegralOrigin([0, 0, 0]), '[0,0,0] is an integral origin');
assert(isIntegralOrigin([2, 4, 6]), '[2,4,6] is an integral origin');
assert(!isIntegralOrigin([1, 2, 3]), '[1,2,3] is not an integral origin');

console.log(`\nResults: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
}
