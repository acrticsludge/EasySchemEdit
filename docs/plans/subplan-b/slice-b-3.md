# Subspec B — Slice b-3: Litematica packed BlockStates

**Goal:** Implement the exact Litematica packed BlockStates decode/encode algorithm per SUBSPEC-B §5.2: minimum palette width, continuous LSB-first packing, entries crossing 64-bit boundaries, exact packed-array length, correct BigInt/64-bit extraction and encoding.

## Files to Create/Modify

| File | Purpose |
|------|---------|
| `packages/formats/litematic-packed.ts` | Packed BlockStates decode/encode |

## Algorithm

```ts
export function decodePackedBlockStates(
  palette: BlockStateId[],
  packed: bigint[],       // unsigned 64-bit values from NBT longs
  bitsPerEntry: number,
  totalEntries: bigint,
): BlockStateId[];

export function encodePackedBlockStates(
  palette: BlockStateId[],
  entries: number[],       // palette indices per linear index
  bitsPerEntry: number,
): bigint[];
```

### Decode steps

1. **bitsPerEntry:** `P <= 1 → 0`; else `ceil(log2(P))`. Test widths: P=1→0, P=5→3, P=12→4, P=20→5, P=300→9.
2. **totalEntries:** `|regionWidth| * |regionHeight| * |regionLength|` (BigInt).
3. **wordsNeeded:** `bitsPerEntry == 0 → 0`; else `ceil(totalBits / 64)` where `totalBits = totalEntries * bitsPerEntry`.
4. **Entry at index i:** `bitStart = i * bitsPerEntry`; `wordStart = floor(bitStart / 64)`; `bitOff = bitStart % 64`. If `bitOff + bitsPerEntry <= 64`: entry inside one word. Else: entry crosses 64-bit boundary, combine low bits from `wordStart` and high bits from `wordStart + 1`.
5. **Palette lookup:** `palette[entry]`; `entry >= palette.length` → `IMPORT_NBT_INVALID`.

### Encode steps (reverse)

1. `wordsNeeded = ceil(totalEntries * bitsPerEntry / 64)`; allocate `packed = [0n, ...]` (wordsNeeded unsigned 64-bit BigInts).
2. For each linear index `i`: `bitStart = i * bitsPerEntry`; `wordStart = floor(bitStart / 64)`; `bitOff = bitStart % 64`.
3. If `bitOff + bitsPerEntry <= 64`: `packed[wordStart] |= (entry & MASK(bitsPerEntry)) << bitOff`.
4. Else: `lowBits = 64 - bitOff`; `highBits = bitsPerEntry - lowBits`; `packed[wordStart] |= (entry & MASK(lowBits)) << bitOff`; `packed[wordStart + 1] |= (entry >> BigInt(lowBits)) & MASK(highBits)`.
5. Mask each word to 64 bits: `packed[w] &= ((1n << 64n) - 1n)`.
6. Write packed as signed 64-bit longs (two's complement).

## Acceptance Criteria

- [ ] bits per entry by palette size: P=1→0, P=5→3, P=12→4, P=20→5, P=300→9
- [ ] Entries crossing 64-bit boundaries decoded/encoded correctly
- [ ] Exact packed-array length: `ceil(totalBits / 64)` words
- [ ] BigInt/64-bit extraction and encoding correct (unsigned shift, no sign extension)
- [ ] Palette validation: index 0 = air, duplicates rejected, index >= palette.length → `IMPORT_NBT_INVALID`

## Tests

**File:** `packages/formats/__tests__/slice-b-3-packed-blockstates.test.ts`

1. bitsPerEntry for P=1, 5, 12, 20, 300
2. Decode entry crossing 64-bit word boundary (e.g. P=5, BPE=3, entry i=21)
3. Encode/decode round-trip preserves all entries
4. Palette index >= palette.length → `IMPORT_NBT_INVALID`
5. Exact packed-array length matches `ceil(totalBits / 64)`

## Verification Checklist

- [ ] Change does one thing completely (packed BlockStates algorithm)
- [ ] TypeScript compiles without errors
- [ ] All new tests pass
- [ ] Change committed with descriptive message
