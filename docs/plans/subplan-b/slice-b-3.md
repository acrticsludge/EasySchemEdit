# Subspec B — Slice b-3: Packed BlockStates

**Goal:** Implement packed BlockStates decode/encode. Palette input is `BlockStateId[]` ({Name, Properties}), not `string[]`. Remove BigInt steps from encode — use 32-bit halves both ways. `bitsPerEntry = max(2, ceil(log2(P)))`. Do NOT require air at palette index 0 on import; remap.

## Files to Create

| File | Purpose |
|------|---------|
| `packages/formats/litematic-packed.ts` | Packed BlockStates decode/encode |

## Algorithm

### bitsPerEntry
`P <= 2 → 2` (minimum 2 bits); else `ceil(log2(P))`.
Test widths: P=1→2, P=2→2, P=3→2, P=4→2, P=5→3, P=12→4, P=20→5, P=300→9.

### Decode
1. `totalEntries = |regionWidth| * |regionHeight| * |regionLength|`
2. `totalBits = totalEntries * bitsPerEntry`
3. `wordsNeeded = ceil(totalBits / 64)`
4. If `packed.length < wordsNeeded` → `IMPORT_TRUNCATED_DATA`
5. Entry at linear index `i`: `bitStart = i * bitsPerEntry`; `wordStart = floor(bitStart / 64)`; `bitOff = bitStart % 64`
   - If `bitOff + bitsPerEntry <= 64`: entry inside one word
   - Else: crosses 64-bit boundary; combine low bits from `wordStart` and high bits from `wordStart + 1`
6. `entry = palette[entry]`; `entry >= palette.length` → `IMPORT_NBT_INVALID` (air remapped, index 0 not required)

### Encode (32-bit halves both ways, no BigInt steps)
1. `wordsNeeded = ceil(totalEntries * bitsPerEntry / 64)`; allocate `packed = new Uint32Array(wordsNeeded * 2)` (low/high 32-bit halves)
2. For each linear index `i`: compute bitStart, wordStart, bitOff
3. If fits in one word: set bits in the appropriate 32-bit half
4. Else: split across word boundary using 32-bit shifts
5. Pack halves into Uint8Array output (little-endian 64-bit words)

## Return Types

```ts
export function decodePackedBlockStates(
  palette: BlockStateId[],        // {Name, Properties}, not string[]
  packed: Uint8Array,
  bitsPerEntry: number,
  totalEntries: number,
): { indices: Uint16Array | Uint32Array; palette: BlockStateId[] };

export function encodePackedBlockStates(
  palette: BlockStateId[],
  indices: Uint16Array | Uint32Array,
  bitsPerEntry: number,
): Uint8Array;  // 32-bit halves both ways, no BigInt
```

- Indices returned as `Uint16Array` (palette <= 65536) or `Uint32Array` (larger)
- Air remapped on import; palette index 0 NOT required

## Acceptance Criteria

- [ ] Palette input is `BlockStateId[]` ({Name, Properties}), not `string[]`
- [ ] `bitsPerEntry = max(2, ceil(log2(P)))`: P=1→2, P=2→2, P=3→2, P=4→2, P=5→3, P=12→4, P=20→5, P=300→9
- [ ] Entries crossing 64-bit boundaries decoded/encoded correctly
- [ ] Encode uses 32-bit halves both ways (no BigInt steps)
- [ ] Returns `Uint16Array`/`Uint32Array` indices (not `BlockStateId[]`)
- [ ] Air remapped on import; palette index 0 NOT required
- [ ] `entry >= palette.length` → `IMPORT_NBT_INVALID`

## Tests

**File:** `packages/formats/__tests__/slice-b-3-packed-blockstates.test.ts`

1. bitsPerEntry for P=1, 2, 3, 4, 5, 12, 20, 300
2. Decode entry crossing 64-bit word boundary
3. Encode/decode round-trip preserves all entries
4. Returns `Uint16Array` for small palettes, `Uint32Array` for large
5. Encode uses 32-bit halves (no BigInt)
6. Palette index >= palette.length → `IMPORT_NBT_INVALID`

## Verification Checklist

- [ ] Change does one thing completely (packed BlockStates)
- [ ] TypeScript compiles without errors
- [ ] All new tests pass
- [ ] Change committed with descriptive message
