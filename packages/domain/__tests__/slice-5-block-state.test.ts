import {
  blockStateId,
  blockStateEquals,
  CANONICAL_AIR,
  VANILLA_AIR_LIKE,
  isAirLike,
} from '../block-state.ts';

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

// Test 1: blockStateId('minecraft:stone') equals by value, not reference
const stone1 = blockStateId('minecraft:stone');
const stone2 = blockStateId('minecraft:stone');
assert(stone1 !== stone2, 'different object references');
assert(blockStateEquals(stone1, stone2), 'equal by value');

// Test 2: props sorted canonically regardless of input order
const stairs1 = blockStateId('minecraft:oak_stairs', { facing: 'north', half: 'bottom' });
const stairs2 = blockStateId('minecraft:oak_stairs', { half: 'bottom', facing: 'north' });
assert(blockStateEquals(stairs1, stairs2), 'props order-independent equality');

// Test 3: MINECRAFT:AIR normalizes to lowercase
const air = blockStateId('MINECRAFT:AIR');
assert(air.id === 'minecraft:air', 'ID normalized to lowercase');

// Test 4: CANONICAL_AIR equals blockStateId('minecraft:air')
assert(blockStateEquals(CANONICAL_AIR, blockStateId('minecraft:air')), 'CANONICAL_AIR equals minecraft:air');

// Test 5: cave_air is air-like
assert(isAirLike('minecraft:cave_air', VANILLA_AIR_LIKE), 'cave_air is air-like');

// Test 6: structure_void is NOT air-like
assert(!isAirLike('minecraft:structure_void', VANILLA_AIR_LIKE), 'structure_void is not air-like');

// Test 7: Empty properties become {}
const empty = blockStateId('minecraft:stone');
assert(Object.keys(empty.props).length === 0, 'empty props become {}');

// Test 8: Props values normalized to lowercase
const mixed = blockStateId('minecraft:oak_stairs', { Facing: 'NORTH', Half: 'BOTTOM' });
assert(mixed.props.facing === 'north', 'prop key normalized to lowercase');
assert(mixed.props.facing === 'north' && mixed.props.half === 'bottom', 'prop value normalized to lowercase');

console.log(`\nResults: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
}
