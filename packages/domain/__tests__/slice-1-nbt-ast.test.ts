import type { NbtTag } from '../nbt.ts';

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

// Test 1: Construct each of the 12 tag kinds without TypeScript errors
const byteTag: NbtTag = { type: 'byte', value: 1 };
const shortTag: NbtTag = { type: 'short', value: 2 };
const intTag: NbtTag = { type: 'int', value: 3 };
const longTag: NbtTag = { type: 'long', value: 9007199254740993n };
const floatTag: NbtTag = { type: 'float', value: 1.5 };
const doubleTag: NbtTag = { type: 'double', value: 2.5 };
const byteArrayTag: NbtTag = { type: 'byteArray', value: new Uint8Array([1, 2, 3]) };
const stringTag: NbtTag = { type: 'string', value: 'hello' };
const listTag: NbtTag = { type: 'list', elementType: 'int', value: [{ type: 'int', value: 1 }, { type: 'int', value: 2 }] };
const compoundTag: NbtTag = { type: 'compound', value: new Map([['key', { type: 'int', value: 42 }]]) };
const intArrayTag: NbtTag = { type: 'intArray', value: new Int32Array([1, 2, 3]) };
const longArrayTag: NbtTag = { type: 'longArray', value: new BigInt64Array([9007199254740993n]) };

// Verify construction succeeded
assert(byteTag.type === 'byte', 'byte tag constructible');
assert(shortTag.type === 'short', 'short tag constructible');
assert(intTag.type === 'int', 'int tag constructible');
assert(longTag.type === 'long', 'long tag constructible');
assert(floatTag.type === 'float', 'float tag constructible');
assert(doubleTag.type === 'double', 'double tag constructible');
assert(byteArrayTag.type === 'byteArray', 'byteArray tag constructible');
assert(stringTag.type === 'string', 'string tag constructible');
assert(listTag.type === 'list', 'list tag constructible');
assert(compoundTag.type === 'compound', 'compound tag constructible');
assert(intArrayTag.type === 'intArray', 'intArray tag constructible');
assert(longArrayTag.type === 'longArray', 'longArray tag constructible');

// Test 2: Verify bigint values are preserved exactly
assert(longTag.value === 9007199254740993n, 'bigint long preserved exactly');
assert(longArrayTag.value[0] === 9007199254740993n, 'bigint longArray preserved exactly');

// Test 3: Verify compound entries maintain insertion order via Map
const compound2: NbtTag = {
  type: 'compound',
  value: new Map([
    ['first', { type: 'int', value: 1 }],
    ['second', { type: 'int', value: 2 }],
    ['third', { type: 'int', value: 3 }],
  ]),
};
const keys = Array.from(compound2.value.keys());
assert(keys[0] === 'first' && keys[1] === 'second' && keys[2] === 'third', 'compound insertion order preserved');

console.log(`\nResults: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
}
