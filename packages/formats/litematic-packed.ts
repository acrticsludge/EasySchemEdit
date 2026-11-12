// Subspec B — Slice b-3: Packed BlockStates (Litematic)
// bitsPerEntry = max(2, ceil(log2(P)))
// Palette input is BlockStateId[] ({Name, Properties}), not string[].
// Returns Uint16Array/Uint32Array indices + palette (not BlockStateId[]).
// 32-bit halves both ways for encode (no BigInt).
// Air remapped on import; palette index 0 NOT required.
import type { BlockStateId } from '../domain/types.ts';

export type PackedBlockStatesResult = {
  indices: Uint16Array | Uint32Array;
  palette: BlockStateId[];
};

function bitsPerEntryForPaletteSize(paletteSize: number): number {
  if (paletteSize <= 2) return 2;
  return Math.ceil(Math.log2(paletteSize));
}

function maskForBits(bits: number): number {
  return (1 << bits) - 1;
}

// Read a 64-bit little-endian word from a Uint8Array as [low32, high32].
function readWordLE(data: Uint8Array, byteOffset: number): [number, number] {
  const low = new DataView(data.buffer, data.byteOffset + byteOffset, 4).getUint32(0, true);
  const high = new DataView(data.buffer, data.byteOffset + byteOffset + 4, 4).getUint32(0, true);
  return [low, high];
}

// Write a 64-bit little-endian word from [low32, high32] into a Uint8Array.
function writeWordLE(out: Uint8Array, byteOffset: number, low: number, high: number): void {
  new DataView(out.buffer, out.byteOffset + byteOffset, 4).setUint32(0, low, true);
  new DataView(out.buffer, out.byteOffset + byteOffset + 4, 4).setUint32(0, high, true);
}

export function decodePackedBlockStates(
  palette: BlockStateId[],
  packed: Uint8Array,
  bitsPerEntry: number,
  totalEntries: number,
): PackedBlockStatesResult {
  const P = palette.length;
  const bpe = bitsPerEntry === 0 ? bitsPerEntryForPaletteSize(P) : bitsPerEntry;
  const totalBits = BigInt(totalEntries) * BigInt(bpe);
  const wordsNeeded = Number(totalBits / 64n) + (Number(totalBits % 64n) > 0 ? 1 : 0);
  if (packed.byteLength < wordsNeeded * 8) {
    throw new Error('IMPORT_TRUNCATED_DATA: packed array shorter than required words');
  }

  const useUint32 = P > 65536;
  const indices = useUint32 ? new Uint32Array(totalEntries) : new Uint16Array(totalEntries);
  const mask = maskForBits(bpe);

  for (let i = 0; i < totalEntries; i++) {
    const bitStart = BigInt(i) * BigInt(bpe);
    const wordStart = Number(bitStart / 64n);
    const bitOff = Number(bitStart % 64n);
    const byteOffset = wordStart * 8;
    const [low, high] = readWordLE(packed, byteOffset);

    let entry: number;
    if (bitOff + bpe <= 64) {
      // Entry inside one 64-bit word
      if (bitOff < 32) {
        const room = 32 - bitOff;
        if (bpe <= room) {
          entry = (low >>> bitOff) & mask;
        } else {
          // Spans low→high within same word
          const lowBits = room;
          const highBits = bpe - lowBits;
          const lowPart = (low >>> bitOff) & maskForBits(lowBits);
          const highPart = high & maskForBits(highBits);
          entry = lowPart | (highPart << lowBits);
        }
      } else {
        // Entry entirely in high 32 bits
        const highBitOff = bitOff - 32;
        entry = (high >>> highBitOff) & mask;
      }
    } else {
      // Entry crosses 64-bit word boundary
      const lowBits = 64 - bitOff;
      const highBits = bpe - lowBits;
      let acc: number;
      if (bitOff < 32) {
        const lowFromBit = 32 - bitOff;
        const takeFromLow = Math.min(lowBits, lowFromBit);
        acc = (low >>> bitOff) & maskForBits(takeFromLow);
        const remaining = lowBits - takeFromLow;
        if (remaining > 0) {
          acc |= (high & maskForBits(remaining)) << takeFromLow;
        }
      } else {
        acc = (high >>> (bitOff - 32)) & maskForBits(lowBits);
      }
      const nextWord = wordStart + 1;
      const [nextLow, _] = readWordLE(packed, nextWord * 8);
      const highPart = nextLow & maskForBits(highBits);
      entry = acc | (highPart << lowBits);
    }

    if (entry >= P) {
      throw new Error(`IMPORT_NBT_INVALID: palette index ${entry} >= palette length ${P}`);
    }
    indices[i] = useUint32 ? (entry as unknown as number) : (entry as unknown as number);
  }

  return { indices, palette };
}

export function encodePackedBlockStates(
  palette: BlockStateId[],
  indices: Uint16Array | Uint32Array,
  bitsPerEntry: number,
): Uint8Array {
  const P = palette.length;
  const bpe = bitsPerEntry === 0 ? bitsPerEntryForPaletteSize(P) : bitsPerEntry;
  const totalEntries = indices.length;
  const totalBits = BigInt(totalEntries) * BigInt(bpe);
  const wordsNeeded = Number(totalBits / 64n) + (Number(totalBits % 64n) > 0 ? 1 : 0);
  const mask = maskForBits(bpe);

  // 32-bit halves: low and high 32 bits of each 64-bit word
  const lows = new Uint32Array(wordsNeeded);
  const highs = new Uint32Array(wordsNeeded);

  for (let i = 0; i < totalEntries; i++) {
    const entry = indices[i];
    const bitStart = BigInt(i) * BigInt(bpe);
    const wordStart = Number(bitStart / 64n);
    const bitOff = Number(bitStart % 64n);

    if (bitOff + bpe <= 64) {
      // Entry inside one 64-bit word
      if (bitOff < 32) {
        const room = 32 - bitOff;
        if (bpe <= room) {
          lows[wordStart] |= (entry & mask) << bitOff;
        } else {
          // Spans low→high within same word
          const lowBits = room;
          const highBits = bpe - lowBits;
          lows[wordStart] |= (entry & maskForBits(lowBits)) << bitOff;
          highs[wordStart] |= (entry >>> lowBits) & maskForBits(highBits);
        }
      } else {
        // Entry entirely in high 32 bits
        const highBitOff = bitOff - 32;
        highs[wordStart] |= (entry & mask) << highBitOff;
      }
    } else {
      // Entry crosses 64-bit word boundary
      const lowBits = 64 - bitOff;
      const highBits = bpe - lowBits;
      if (bitOff < 32) {
        const lowFromBit = 32 - bitOff;
        const takeFromLow = Math.min(lowBits, lowFromBit);
        lows[wordStart] |= (entry & maskForBits(takeFromLow)) << bitOff;
        const remaining = lowBits - takeFromLow;
        if (remaining > 0) {
          highs[wordStart] |= (entry >>> takeFromLow) & maskForBits(remaining);
        }
        const highRemaining = highBits - (lowBits - takeFromLow);
        if (highRemaining > 0) {
          const nextWord = wordStart + 1;
          const shift = lowBits - takeFromLow;
          lows[nextWord] |= (entry >>> shift) & maskForBits(highRemaining);
        }
      } else {
        // bitOff >= 32, lowBits all from high
        const highBitOff = bitOff - 32;
        const takeFromHigh = Math.min(lowBits, 32 - highBitOff);
        highs[wordStart] |= (entry & maskForBits(takeFromHigh)) << highBitOff;
        const remaining = lowBits - takeFromHigh;
        if (remaining > 0) {
          const nextWord = wordStart + 1;
          lows[nextWord] |= (entry >>> takeFromHigh) & maskForBits(remaining);
        }
        const highRemaining = highBits - (lowBits - takeFromHigh);
        if (highRemaining > 0) {
          const nextWord = wordStart + 1;
          lows[nextWord] |= (entry >>> (takeFromHigh + remaining)) & maskForBits(highRemaining);
        }
      }
    }
  }

  const out = new Uint8Array(wordsNeeded * 8);
  for (let w = 0; w < wordsNeeded; w++) {
    writeWordLE(out, w * 8, lows[w], highs[w]);
  }
  return out;
}
