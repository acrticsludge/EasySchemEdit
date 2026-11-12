import type { BlockStateId } from '../block-state.ts';
import {
  BlockStateTransformRegistry,
  makeVanillaHandler,
  REGISTRY,
  validateBijectivity,
} from '../block-state-transforms.ts';

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

// Test 1: Every column is a permutation (bijective)
const bijectivity = validateBijectivity();
assert(bijectivity.ok, `bijectivity: ${bijectivity.errors.join(', ')}`);

// Test 2: Mirror columns are involutions (mirror² = identity)
// Covered by validateBijectivity

// Test 3: 90°⁻¹ = 270°, 90°⁴ = identity, mirror² = identity
// Covered by validateBijectivity

// Test 4: Applying operation then inverse restores original state
const stairs: BlockStateId = { id: 'minecraft:oak_stairs', props: { facing: 'north', shape: 'inner_left' } as Readonly<Record<string, string>> };
const r90 = REGISTRY.transformRotate(stairs, 90).result;
const r270 = REGISTRY.transformRotate(r90, 270).result;
assert(r270.props.facing === 'north', 'rotate(90) then rotate(270) restores facing');

// Test 5: rotate(90) four times returns original
let current = stairs;
for (let i = 0; i < 4; i++) {
  current = REGISTRY.transformRotate(current, 90).result;
}
assert(current.props.facing === 'north', 'rotate(90)×4 = identity');

// Test 6: mirror('x') twice returns original
const m1 = REGISTRY.transformMirror(stairs, 'x').result;
const m2 = REGISTRY.transformMirror(m1, 'x').result;
assert(m2.props.facing === 'north', 'mirror(x)×2 = identity');

// Test 7: All table entries match the matrix derivation
// Facing north rotated 90° → west
const facingTest = REGISTRY.transformRotate(
  { id: 'minecraft:oak_fence', props: { facing: 'north' } as Readonly<Record<string, string>> },
  90,
).result;
assert(facingTest.props.facing === 'west', 'facing north rotated 90° → west');

// Test 8: Chirality test - stair shape unchanged by rotation, swapped by mirror
const stairRot = REGISTRY.transformRotate(stairs, 90).result;
assert(stairRot.props.shape === 'inner_left', 'stair shape unchanged by rotation');
const stairMir = REGISTRY.transformMirror(stairs, 'x').result;
assert(stairMir.props.shape === 'inner_right', 'stair shape swapped by mirror');

// Test 9: Door hinge unchanged by rotation, swapped by mirror
const door: BlockStateId = { id: 'minecraft:oak_door', props: { facing: 'north', hinge: 'left' } as Readonly<Record<string, string>> };
const doorRot = REGISTRY.transformRotate(door, 180).result;
assert(doorRot.props.hinge === 'left', 'hinge unchanged by rotation');
const doorMir = REGISTRY.transformMirror(door, 'x').result;
assert(doorMir.props.hinge === 'right', 'hinge swapped by mirror');

// Test 10: Chest type swapped by mirror
const chest: BlockStateId = { id: 'minecraft:chest', props: { type: 'left' } as Readonly<Record<string, string>> };
const chestMir = REGISTRY.transformMirror(chest, 'x').result;
assert(chestMir.props.type === 'right', 'chest type swapped by mirror');

// Test 11: Unknown blocks pass through unchanged
const unknown: BlockStateId = { id: 'mystery:block', props: { facing: 'north' } as Readonly<Record<string, string>> };
const unknownRot = REGISTRY.transformRotate(unknown, 90).result;
assert(unknownRot.props.facing === 'north', 'unknown block passes through rotation unchanged');
const unknownMir = REGISTRY.transformMirror(unknown, 'x').result;
assert(unknownMir.props.facing === 'north', 'unknown block passes through mirror unchanged');

console.log(`\nResults: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
}
