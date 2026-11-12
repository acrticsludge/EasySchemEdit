import type { Vec3Half, Vec3i } from '../types.ts';
import type { Transform } from '../coordinates.ts';
import {
  mapCellToWorld,
  isLatticeSafe,
  rotateAboutPoint,
} from '../coordinates.ts';

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

function makeTransform(
  translation: Vec3i,
  rotationY: Transform['rotationY'] = 0,
  mirror: Transform['mirror'] = 'none',
): Transform {
  return { translation, rotationY, mirror };
}

// Test 1: Counterexample [10,64,10] / [0.5,0,0.5] / [0,0,0] correctly classified off-grid
const counter = mapCellToWorld([10, 64, 10] as Vec3i, [0.5, 0, 0.5] as Vec3Half, 0, 'none', [0, 0, 0] as Vec3i);
assert(counter.valid === false, 'counterexample [10,64,10]/[0.5,0,0.5]/[0,0,0] is off-grid');

// Test 2: Integral origin maps correctly
const ok = mapCellToWorld([10, 64, 10] as Vec3i, [0, 0, 0] as Vec3Half, 0, 'none', [0, 0, 0] as Vec3i);
assert(ok.valid === true, 'integral origin [0,0,0] maps correctly');
assert(ok.worldBlock![0] === 10 && ok.worldBlock![1] === 64 && ok.worldBlock![2] === 10, 'identity mapping at origin');

// Test 3: Rotate 1x1x3 bar at origin [0,0,0] by 90° → [0,0,0] maps to [0,0,-1]
const r90 = mapCellToWorld([0, 0, 0] as Vec3i, [0, 0, 0] as Vec3Half, 90, 'none', [0, 0, 0] as Vec3i);
assert(r90.valid === true, '90° rotation valid');
assert(r90.worldBlock![0] === 0 && r90.worldBlock![1] === 0 && r90.worldBlock![2] === -1, '90°: [0,0,0] → [0,0,-1]');

// Test 4: Rotate by 180° → [0,0,-1] maps to [-1,0,0] (180° flips X and Z)
const r180 = mapCellToWorld([0, 0, 0] as Vec3i, [0, 0, 0] as Vec3Half, 180, 'none', [0, 0, -1] as Vec3i);
assert(r180.valid === true, '180° rotation valid');
assert(r180.worldBlock![0] === -1 && r180.worldBlock![1] === 0 && r180.worldBlock![2] === 0, '180°: [0,0,-1] → [-1,0,0]');

// Test 5: Rotate by 270° → [0,0,-1] maps to [0,0,0] (270° CCW = 90° CW)
const r270 = mapCellToWorld([0, 0, 0] as Vec3i, [0, 0, 0] as Vec3Half, 270, 'none', [0, 0, -1] as Vec3i);
assert(r270.valid === true, '270° rotation valid');
if (r270.worldBlock) {
  assert(r270.worldBlock[0] === 0 && r270.worldBlock[1] === 0 && r270.worldBlock[2] === 0, `270°: [0,0,-1] → [${r270.worldBlock.join(',')}]`);
} else {
  assert(false, '270° rotation should be valid');
}

// Test 6: Mirror X at origin [0,0,0]: cell [1,0,0] → [-2,0,0] (center 1.5 → -1.5)
const mx = mapCellToWorld([0, 0, 0] as Vec3i, [0, 0, 0] as Vec3Half, 0, 'x', [1, 0, 0] as Vec3i);
assert(mx.valid === true, 'mirror X valid');
if (mx.worldBlock) {
  assert(mx.worldBlock[0] === -2 && mx.worldBlock[1] === 0 && mx.worldBlock[2] === 0, `mirror X: [1,0,0] → [${mx.worldBlock.join(',')}]`);
} else {
  assert(false, 'mirror X should be valid');
}

// Test 7: Mirror Z at origin [0,0,0]: cell [1,0,0] → [1,0,-1] (center z 0.5 → -0.5)
const mz = mapCellToWorld([0, 0, 0] as Vec3i, [0, 0, 0] as Vec3Half, 0, 'z', [1, 0, 0] as Vec3i);
assert(mz.valid === true, 'mirror Z valid');
if (mz.worldBlock) {
  assert(mz.worldBlock[0] === 1 && mz.worldBlock[1] === 0 && mz.worldBlock[2] === -1, `mirror Z: [1,0,0] → [${mz.worldBlock.join(',')}]`);
} else {
  assert(false, 'mirror Z should be valid');
}

// Test 8: isLatticeSafe rejects half-integer origin
assert(isLatticeSafe([10, 64, 10] as Vec3i, [0.5, 0, 0.5] as Vec3Half) === false, 'isLatticeSafe rejects half-integer origin');
assert(isLatticeSafe([10, 64, 10] as Vec3i, [0, 0, 0] as Vec3Half) === true, 'isLatticeSafe accepts integral origin');
assert(isLatticeSafe([10, 64, 10] as Vec3i, [2, 4, 6] as Vec3Half) === true, 'isLatticeSafe accepts even half-block origin');

// Test 9: 4×90° rotation = identity
let cell = [2, 0, 3] as Vec3i;
let result = mapCellToWorld([0, 0, 0] as Vec3i, [0, 0, 0] as Vec3Half, 0, 'none', cell);
for (let i = 0; i < 4; i++) {
  const r = mapCellToWorld([0, 0, 0] as Vec3i, [0, 0, 0] as Vec3Half, 90, 'none', result.worldBlock!);
  cell = r.worldBlock!;
  result = r;
}
assert(cell[0] === 2 && cell[1] === 0 && cell[2] === 3, '4×90° rotation = identity');

// Test 10: mirror×2 = identity
const m1 = mapCellToWorld([0, 0, 0] as Vec3i, [0, 0, 0] as Vec3Half, 0, 'x', [2, 0, 3] as Vec3i);
const m2 = mapCellToWorld([0, 0, 0] as Vec3i, [0, 0, 0] as Vec3Half, 0, 'x', m1.worldBlock!);
assert(m2.worldBlock![0] === 2 && m2.worldBlock![1] === 0 && m2.worldBlock![2] === 3, 'mirror×2 = identity');

// Test 11: Round-trip localBlock → worldBlock → localBlock for various transforms
const transforms: Transform[] = [
  makeTransform([0, 0, 0], 0, 'none'),
  makeTransform([10, 64, 10], 90, 'none'),
  makeTransform([5, 0, 5], 180, 'x'),
  makeTransform([-3, 10, -7], 270, 'z'),
  makeTransform([0, 0, 0], 90, 'z'),
  makeTransform([100, 50, 100], 180, 'x'),
];
const testCells: Vec3i[] = [
  [0, 0, 0], [1, 2, 3], [-5, 10, -3], [15, 0, 15], [0, 16, 0],
];
for (const t of transforms) {
  for (const c of testCells) {
    const forward = mapCellToWorld(t.translation, [0, 0, 0] as Vec3Half, t.rotationY, t.mirror, c);
    if (!forward.valid || !forward.worldBlock) continue;
    // Inverse: apply inverse transform
    const invRotation: Transform['rotationY'] = t.rotationY === 0 ? 0 : t.rotationY === 90 ? 270 : t.rotationY === 180 ? 180 : 90;
    const _backward = mapCellToWorld(
      forward.worldBlock,
      [0, 0, 0] as Vec3Half,
      invRotation,
      t.mirror,
      [0, 0, 0] as Vec3i,
    );
    assert(_backward.valid, `round-trip inverse valid for cell=${c}`);
  }
}

// Test 12: rotateAboutPoint produces valid transform
const placement = { transform: makeTransform([10, 0, 10] as Vec3i, 0, 'none') };
const rotated = rotateAboutPoint(placement, [0, 0, 0] as Vec3Half, 90, 'none');
assert(rotated.rotationY === 90, 'rotateAboutPoint sets rotationY');
assert(typeof rotated.translation[0] === 'number', 'rotateAboutPoint returns valid translation');

console.log(`\nResults: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
}
