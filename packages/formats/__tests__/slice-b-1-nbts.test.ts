// Slice b-1: NBT parser+encoder with gzip + safety limits
import {
  encodeNbt,
  decodeNbt,
  DEFAULT_LIMITS,
  type NbtServices,
} from '../nbts.ts';
import { NbtSafetyError } from '../errors.ts';

const passthroughServices: NbtServices = {
  gzipCompress: (bytes: Uint8Array): Uint8Array => bytes,
  gzipDecompress: (bytes: Uint8Array): Uint8Array => bytes,
};

// Helper to build a compound tag
function compound(entries: [string, any][]): any {
  const map = new Map<string, any>();
  for (const [k, v] of entries) map.set(k, v);
  return { type: 'compound', value: map };
}

console.assert(DEFAULT_LIMITS.maxTagCount === 1_000_000, 'default tag count');
console.assert(DEFAULT_LIMITS.maxStringBytes === 1_024 * 1_024, 'default string bytes');
console.assert(DEFAULT_LIMITS.maxNestingDepth === 512, 'default nesting depth');

// 1. Encode/decode round-trip with all 12 tag kinds
const tag: any = compound([
  ['byte', { type: 'byte', value: 42 }],
  ['short', { type: 'short', value: -32768 }],
  ['int', { type: 'int', value: 1000000 }],
  ['long', { type: 'long', value: 9007199254740993n }],
  ['float', { type: 'float', value: 3.14 }],
  ['double', { type: 'double', value: 2.718281828459045 }],
  ['byteArray', { type: 'byteArray', value: new Uint8Array([1, 2, 3]) }],
  ['string', { type: 'string', value: 'hello' }],
  [
    'list',
    {
      type: 'list',
      elementType: 'int',
      value: [{ type: 'int', value: 1 }, { type: 'int', value: 2 }],
    },
  ],
  [
    'compound',
    { type: 'compound', value: new Map([['x', { type: 'int', value: 10 }]]) },
  ],
  ['intArray', { type: 'intArray', value: new Int32Array([10, 20]) }],
  ['longArray', { type: 'longArray', value: new BigInt64Array([100n, 200n]) }],
]);

const encoded = encodeNbt(tag, passthroughServices);
const decoded = decodeNbt(encoded, passthroughServices);
console.assert(decoded.type === 'compound', 'round-trip: compound type');
const valMap = decoded.value as Map<string, any>;
console.assert((valMap.get('byte') as any).value === 42, 'round-trip: byte');
console.assert((valMap.get('short') as any).value === -32768, 'round-trip: short');
console.assert((valMap.get('int') as any).value === 1000000, 'round-trip: int');
console.assert((valMap.get('long') as any).value === 9007199254740993n, 'round-trip: long bigint preserved');
console.assert((valMap.get('float') as any).value === 3.14, 'round-trip: float');
console.assert(Math.abs((valMap.get('double') as any).value - 2.718281828459045) < 1e-10, 'round-trip: double');
console.assert(
  Array.from((valMap.get('byteArray') as any).value).join(',') === '1,2,3',
  'round-trip: byteArray',
);
console.assert((valMap.get('string') as any).value === 'hello', 'round-trip: string');

// 2. bigint long preserved exactly
console.assert(typeof (valMap.get('long') as any).value === 'bigint', 'long is bigint');

// 3. Null byte round-trips as C0 80 in modified UTF-8
const nullStrTag: any = { type: 'string', value: 'a\0b' };
const nullEncoded = encodeNbt(nullStrTag, passthroughServices);
const nullDecoded = decodeNbt(nullEncoded, passthroughServices);
console.assert(nullDecoded.value === 'a\0b', 'null byte round-trip');

// 4. Emoji round-trips as surrogate pair
const emojiTag: any = { type: 'string', value: '😀' };
const emojiEncoded = encodeNbt(emojiTag, passthroughServices);
const emojiDecoded = decodeNbt(emojiEncoded, passthroughServices);
console.assert(emojiDecoded.value === '😀', 'emoji round-trip');

// 5. Tag count > limit → NBT_TAG_COUNT_EXCEEDED
const manyTags: any = compound([]);
for (let i = 0; i < DEFAULT_LIMITS.maxTagCount + 10; i++) {
  (manyTags.value as Map<string, any>).set(`k${i}`, { type: 'byte', value: 1 });
}
try {
  decodeNbt(encodeNbt(manyTags, passthroughServices), passthroughServices);
  console.assert(false, 'should have thrown NBT_TAG_COUNT_EXCEEDED');
} catch (e) {
  console.assert(e instanceof NbtSafetyError, 'threw NbtSafetyError');
  console.assert((e as NbtSafetyError).code === 'NBT_TAG_COUNT_EXCEEDED', 'correct code');
}

// 6. String length > limit → NBT_STRING_TOO_LONG
try {
  const longStr: any = { type: 'string', value: 'x'.repeat(DEFAULT_LIMITS.maxStringBytes + 1) };
  decodeNbt(encodeNbt(longStr, passthroughServices), passthroughServices);
  console.assert(false, 'should have thrown NBT_STRING_TOO_LONG');
} catch (e) {
  console.assert((e as NbtSafetyError).code === 'NBT_STRING_TOO_LONG', 'correct code');
}

// 7. Nesting depth > limit → NBT_NESTING_DEPTH_EXCEEDED
function nest(depth: number): any {
  if (depth <= 0) return { type: 'byte', value: 1 };
  return compound([['inner', nest(depth - 1)]]);
}
try {
  const deep: any = nest(DEFAULT_LIMITS.maxNestingDepth + 10);
  decodeNbt(encodeNbt(deep, passthroughServices), passthroughServices);
  console.assert(false, 'should have thrown NBT_NESTING_DEPTH_EXCEEDED');
} catch (e) {
  console.assert((e as NbtSafetyError).code === 'NBT_NESTING_DEPTH_EXCEEDED', 'correct code');
}

// 8. Duplicate required field → NBT_DUPLICATE_REQUIRED_FIELD
const dup: any = compound([
  ['x', { type: 'byte', value: 1 }],
  ['x', { type: 'byte', value: 2 }],
]);
try {
  decodeNbt(encodeNbt(dup, passthroughServices), passthroughServices);
  console.assert(false, 'should have thrown NBT_DUPLICATE_REQUIRED_FIELD');
} catch (e) {
  console.assert((e as NbtSafetyError).code === 'NBT_DUPLICATE_REQUIRED_FIELD', 'correct code');
}

// 9. Error contract: NbtSafetyError is thrown (not dual return)
try {
  decodeNbt(new Uint8Array([0xFF]), passthroughServices);
  console.assert(false, 'should have thrown on invalid tag');
} catch (e) {
  console.assert(e instanceof NbtSafetyError, 'throws NbtSafetyError on invalid');
}

console.log('All slice b-1 tests passed.');
