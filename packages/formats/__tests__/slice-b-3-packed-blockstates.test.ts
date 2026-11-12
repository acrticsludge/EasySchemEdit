// Slice b-3: Packed BlockStates
import {
  decodePackedBlockStates,
  encodePackedBlockStates,
  type PackedBlockStatesResult,
} from '../litematic-packed.ts';
import type { BlockStateId } from '../../domain/types.ts';

let failures = 0;
function check(cond: boolean, msg: string) {
  if (!cond) {
    console.assert(cond, msg);
    failures++;
  }
  console.log(msg + ' -> ' + cond);
}

function bs(id: string, props: Record<string, string> = {}): BlockStateId {
  return { id, props } as BlockStateId;
}

// Helper: compute bitsPerEntry from palette size (mirrors internal logic)
function bpeFor(P: number): number {
  if (P <= 2) return 2;
  return Math.ceil(Math.log2(P));
}

// 1. bitsPerEntry widths verified via encoded output size (wordsNeeded * 8 bytes)
{
  const palette = [bs('minecraft:stone')];
  const indices = new Uint16Array([0]);
  const packed = encodePackedBlockStates(palette, indices, 2);
  check(packed.byteLength === 8, 'P=1 → bpe=2 → 1 word → 8 bytes');
}

// P=5 → bpe=3, 1 entry → ceil(3/64)=1 word → 8 bytes
{
  const palette = [bs('a'), bs('b'), bs('c'), bs('d'), bs('e')];
  const indices = new Uint16Array([0]);
  const packed = encodePackedBlockStates(palette, indices, 3);
  check(packed.byteLength === 8, 'P=5 → bpe=3 → 1 word → 8 bytes');
}

// P=12 → bpe=4, 17 entries → ceil(17*4/64)=ceil(68/64)=2 words → 16 bytes
{
  const palette = [bs('a'), bs('b'), bs('c'), bs('d'), bs('e'), bs('f'), bs('g'), bs('h'), bs('i'), bs('j'), bs('k'), bs('l')];
  const indices = new Uint16Array(17).fill(0);
  const packed = encodePackedBlockStates(palette, indices, 4);
  check(packed.byteLength === 16, 'P=12 → bpe=4 → 2 words → 16 bytes');
}

// P=20 → bpe=5
{
  const palette = Array.from({ length: 20 }, (_, i) => bs(`s${i}`));
  const indices = new Uint16Array([0]);
  const packed = encodePackedBlockStates(palette, indices, 5);
  check(packed.byteLength === 8, 'P=20 → bpe=5 → 1 word → 8 bytes');
}

// P=300 → bpe=9
{
  const palette = Array.from({ length: 300 }, (_, i) => bs(`s${i}`));
  const indices = new Uint16Array([0]);
  const packed = encodePackedBlockStates(palette, indices, 9);
  check(packed.byteLength === 8, 'P=300 → bpe=9 → 1 word → 8 bytes');
}

// 2. Decode entry crossing 64-bit word boundary (P=5, bpe=3, i=21 → bitStart=63, crosses 64)
{
  const palette = [bs('a'), bs('b'), bs('c'), bs('d'), bs('e')];
  // Build packed manually: entry 21 = value 3, crossing word boundary
  // bitStart = 21*3 = 63, bitOff=63, lowBits=1, highBits=2
  // word0 high bit 31 = entry bit 0 (=1)
  // word1 low bits 0-1 = entry bits 1-2 (=1, binary 01)
  const words = new Uint32Array(4); // 2 words × [low, high]
  words[0] = 0; // word0 low
  words[1] = 1 << 31; // word0 high: bit 31 = entry bit 0
  words[2] = 1; // word1 low: bits 0-1 = entry bits 1-2 = 01
  words[3] = 0; // word1 high
  const packed = new Uint8Array(words.buffer);
  const result: PackedBlockStatesResult = decodePackedBlockStates(palette, packed, 3, 22);
  check(result.indices[21] === 3, 'decode entry crossing 64-bit boundary');
}

// 3. Encode/decode round-trip preserves all entries (P=5, bpe=3, 64 entries)
{
  const palette = [bs('a'), bs('b'), bs('c'), bs('d'), bs('e')];
  const totalEntries = 64;
  const indices = new Uint16Array(totalEntries);
  for (let i = 0; i < totalEntries; i++) indices[i] = i % 5;
  const packed = encodePackedBlockStates(palette, indices, 3);
  const result: PackedBlockStatesResult = decodePackedBlockStates(palette, packed, 3, totalEntries);
  let match = true;
  for (let i = 0; i < totalEntries; i++) {
    if (result.indices[i] !== indices[i]) { match = false; break; }
  }
  check(match, 'round-trip P=5 bpe=3 64 entries');
}

// Round-trip P=300, bpe=9, 100 entries
{
  const palette = Array.from({ length: 300 }, (_, i) => bs(`s${i}`));
  const totalEntries = 100;
  const indices = new Uint16Array(totalEntries);
  for (let i = 0; i < totalEntries; i++) indices[i] = i % 300;
  const packed = encodePackedBlockStates(palette, indices, 9);
  const result: PackedBlockStatesResult = decodePackedBlockStates(palette, packed, 9, totalEntries);
  let match = true;
  for (let i = 0; i < totalEntries; i++) {
    if (result.indices[i] !== indices[i]) { match = false; break; }
  }
  check(match, 'round-trip P=300 bpe=9 100 entries');
}

// 4. Returns Uint16Array for small palettes, Uint32Array for large
{
  const smallPalette = [bs('a')];
  const smallIndices = new Uint16Array([0]);
  const smallPacked = encodePackedBlockStates(smallPalette, smallIndices, 2);
  const smallResult = decodePackedBlockStates(smallPalette, smallPacked, 2, 1);
  check(smallResult.indices instanceof Uint16Array && !(smallResult.indices instanceof Uint32Array), 'small palette → Uint16Array');

  const largePalette = Array.from({ length: 70000 }, (_, i) => bs(`s${i}`));
  const largeIndices = new Uint32Array([0]);
  const largePacked = encodePackedBlockStates(largePalette, largeIndices, 17);
  const largeResult = decodePackedBlockStates(largePalette, largePacked, 17, 1);
  check(largeResult.indices instanceof Uint32Array, 'large palette → Uint32Array');
}

// 5. Palette index >= palette.length → IMPORT_NBT_INVALID
{
  const palette = [bs('a'), bs('b')];
  const indices = new Uint16Array([5]); // index 5 >= palette length 2, fits in bpe=3
  const packed = encodePackedBlockStates(palette, indices, 3);
  let threw = false;
  try {
    decodePackedBlockStates(palette, packed, 3, 1);
  } catch (e) {
    threw = String(e).includes('IMPORT_NBT_INVALID');
  }
  check(threw, 'index >= palette length → IMPORT_NBT_INVALID');
}

// 6. Air remapped: palette index 0 NOT required (entry 0 is first non-air state)
{
  const palette = [bs('minecraft:stone'), bs('minecraft:dirt')];
  const indices = new Uint16Array([0, 1, 0, 1]);
  const packed = encodePackedBlockStates(palette, indices, 2);
  const result = decodePackedBlockStates(palette, packed, 2, 4);
  check(result.indices[0] === 0 && result.indices[1] === 1 && result.indices[2] === 0 && result.indices[3] === 1, 'air not required at index 0');
}

// 7. Palette returned unchanged
{
  const palette = [bs('minecraft:stone', { variant: 'smooth' })];
  const indices = new Uint16Array([0]);
  const packed = encodePackedBlockStates(palette, indices, 2);
  const result = decodePackedBlockStates(palette, packed, 2, 1);
  check(result.palette.length === 1 && result.palette[0].id === 'minecraft:stone', 'palette returned');
}

console.log(failures === 0 ? 'All slice b-3 packed blockstates tests passed.' : failures + ' failure(s)');
