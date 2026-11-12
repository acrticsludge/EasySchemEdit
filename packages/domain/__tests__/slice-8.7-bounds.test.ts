import type { Bounds3i, Vec3Half, Vec3i } from '../types.ts';
import {
  add, sub, equals, union, intersect, contains, size, translate,
  chunkKeysInBounds, addHalf, subHalf, equalsHalf, isIntegral,
} from '../bounds.ts';

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

// Test 1: union
const u = union(
  { min: [0, 0, 0], maxExclusive: [16, 16, 16] },
  { min: [8, 8, 8], maxExclusive: [24, 24, 24] },
);
assert(u.min[0] === 0 && u.min[1] === 0 && u.min[2] === 0, 'union min');
assert(u.maxExclusive[0] === 24 && u.maxExclusive[1] === 24 && u.maxExclusive[2] === 24, 'union maxExclusive');

// Test 2: intersect null for disjoint
const i1 = intersect(
  { min: [0, 0, 0], maxExclusive: [16, 16, 16] },
  { min: [16, 0, 0], maxExclusive: [32, 16, 16] },
);
assert(i1 === null, 'disjoint bounds → null');

// Test 3: contains
assert(contains({ min: [0, 0, 0], maxExclusive: [16, 16, 16] }, [15, 15, 15]), 'contains [15,15,15]');
assert(!contains({ min: [0, 0, 0], maxExclusive: [16, 16, 16] }, [16, 0, 0]), 'excludes maxExclusive');

// Test 4: size
const s = size({ min: [0, 0, 0], maxExclusive: [16, 16, 16] });
assert(s[0] === 16 && s[1] === 16 && s[2] === 16, 'size of 16x16x16');

// Test 5: isIntegral
assert(isIntegral([0, 0, 0]), '[0,0,0] is integral');
assert(!isIntegral([1, 0, 1]), '[1,0,1] is not integral (odd components)');
assert(isIntegral([2, 4, 6]), '[2,4,6] is integral');

// Test 6: add/sub/equals
assert(equals(add([1, 2, 3], [4, 5, 6]), [5, 7, 9]), 'add');
assert(equals(sub([5, 7, 9], [1, 2, 3]), [4, 5, 6]), 'sub');

// Test 7: translate
const t = translate({ min: [0, 0, 0], maxExclusive: [16, 16, 16] }, [5, 5, 5]);
assert(t.min[0] === 5 && t.maxExclusive[0] === 21, 'translate');

// Test 8: chunkKeysInBounds
const keys = chunkKeysInBounds({ min: [0, 0, 0], maxExclusive: [32, 16, 16] });
assert(keys.length === 2, 'chunkKeysInBounds: 2 chunks for 32x16x16');
assert(keys.includes('0_0_0') && keys.includes('1_0_0'), 'chunk keys include 0_0_0 and 1_0_0');

// Test 9: half-block variants
assert(equalsHalf(addHalf([1, 0, 1], [1, 0, 1]), [2, 0, 2]), 'addHalf');
assert(equalsHalf(subHalf([2, 0, 2], [1, 0, 1]), [1, 0, 1]), 'subHalf');

console.log(`\nResults: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
}
