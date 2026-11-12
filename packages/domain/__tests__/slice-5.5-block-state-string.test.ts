import {
  parseBlockStateString,
  formatBlockStateString,
} from '../block-state-string.ts';

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

// Test 1: format(parse(s)) === s for canonical strings
const s1 = 'minecraft:oak_stairs[facing=north,half=bottom]';
assert(formatBlockStateString(parseBlockStateString(s1)) === s1, 'round-trip canonical string');

// Test 2: Property keys sorted canonically in output
const s2 = 'minecraft:oak_stairs[half=bottom,facing=north]';
assert(formatBlockStateString(parseBlockStateString(s2)) === 'minecraft:oak_stairs[facing=north,half=bottom]', 'props sorted canonically');

// Test 3: parse('MINECRAFT:AIR') normalizes to id: 'minecraft:air'
const air = parseBlockStateString('MINECRAFT:AIR');
assert(air.id === 'minecraft:air', 'ID normalized to lowercase');

// Test 4: format({ id: 'minecraft:air', props: {} }) === 'minecraft:air' (no brackets)
assert(formatBlockStateString({ id: 'minecraft:air', props: {} }) === 'minecraft:air', 'empty props → no brackets');

// Test 5: parse('minecraft:stone[facing=]') throws
try {
  parseBlockStateString('minecraft:stone[facing=]');
  assert(false, 'empty value should throw');
} catch {
  assert(true, 'empty value throws');
}

// Test 6: parse('minecraft:stone[Facing=north]') throws
try {
  parseBlockStateString('minecraft:stone[Facing=north]');
  assert(false, 'uppercase key should throw');
} catch {
  assert(true, 'uppercase key throws');
}

// Test 7: parse('minecraft:stone[facing=north]extra') throws
try {
  parseBlockStateString('minecraft:stone[facing=north]extra');
  assert(false, 'trailing content should throw');
} catch {
  assert(true, 'trailing content throws');
}

// Test 8: parse('minecraft:stone[]') → OK, empty properties
const stone = parseBlockStateString('minecraft:stone[]');
assert(Object.keys(stone.props).length === 0 && stone.id === 'minecraft:stone', 'empty brackets OK');

console.log(`\nResults: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
}
