import {
  encodeNbt,
  decodeNbt,
} from '../nbt-codec.ts';
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

// Test 1: Round-trip with all tag types
async function testRoundTrip() {
  const compound: NbtTag = {
    type: 'compound',
    value: new Map([
      ['byteTag', { type: 'byte', value: 42 }],
      ['shortTag', { type: 'short', value: -32768 }],
      ['intTag', { type: 'int', value: 1000000 }],
      ['longTag', { type: 'long', value: 9007199254740993n }],
      ['floatTag', { type: 'float', value: 1.5 }],
      ['doubleTag', { type: 'double', value: 3.14159 }],
      ['stringTag', { type: 'string', value: 'hello world' }],
      ['byteArrayTag', { type: 'byteArray', value: new Uint8Array([1, 2, 3, 4]) }],
      ['intArrayTag', { type: 'intArray', value: new Int32Array([10, 20, 30]) }],
      ['longArrayTag', { type: 'longArray', value: new BigInt64Array([9007199254740993n]) }],
    ]),
  };

  const encoded = encodeNbt(compound);
  const decoded = decodeNbt(encoded);
  assert(decoded.valid, 'NBT decode valid');

  const decCompound = decoded.tag as NbtTag;
  assert(decCompound.type === 'compound', 'compound type preserved');

  const map = decCompound.value as Map<string, NbtTag>;
  assert((map.get('longTag') as NbtTag).value === 9007199254740993n, 'bigint long preserved');
  const longArr = (map.get('longArrayTag') as NbtTag).value as unknown as bigint[];
assert(longArr[0] === 9007199254740993n, 'bigint longArray preserved');
}

// Test 2: Modified UTF-8 null byte
async function testModifiedUtf8() {
  const tag: NbtTag = {
    type: 'string',
    value: 'hello\u0000world',
  };
  const encoded = encodeNbt(tag);
  const decoded = decodeNbt(encoded);
  assert(decoded.valid, 'null byte NBT decode valid');
  const strTag = decoded.tag as NbtTag;
  assert(strTag.type === 'string' && strTag.value === 'hello\u0000world', 'null byte preserved');
}

// Test 3: Emoji/supplementary character
async function testEmoji() {
  const tag: NbtTag = {
    type: 'string',
    value: '🎉', // U+1F389
  };
  const encoded = encodeNbt(tag);
  const decoded = decodeNbt(encoded);
  assert(decoded.valid, 'emoji NBT decode valid');
  const strTag = decoded.tag as NbtTag;
  assert(strTag.type === 'string' && strTag.value === '🎉', 'emoji preserved');
}

// Test 4: DataView big-endian reads
async function testEndianness() {
  const tag: NbtTag = {
    type: 'int',
    value: 0x12345678,
  };
  const encoded = encodeNbt(tag);
  // Big-endian: 12 34 56 78
  assert(encoded[1] === 0x12, 'byte 1 is 0x12 (big-endian)');
  assert(encoded[2] === 0x34, 'byte 2 is 0x34');
  assert(encoded[3] === 0x56, 'byte 3 is 0x56');
  assert(encoded[4] === 0x78, 'byte 4 is 0x78');
}


async function main() {
  await testRoundTrip();
  await testModifiedUtf8();
  await testEmoji();
  await testEndianness();

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    process.exit(1);
  }
}

main();
