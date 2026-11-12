# Subspec A — Slice 10: NBT Binary Codec

**Goal:** Implement the big-endian tagged NBT binary format for `NbtTag` round-trip.

## Files to Create/Modify

| File | Purpose |
|------|---------|
| `packages/domain/nbt-codec.ts` | NBT binary encode/decode |

## Format (Big-Endian Tagged Values with DataView)

All big-endian reads/writes use `DataView` on `ArrayBuffer` — never `BigInt64Array`/`Int32Array` on raw buffers, which use platform endianness.

| Tag type | ID | Payload |
|----------|----|---------|
| End | 0 | none |
| Byte | 1 | int8 |
| Short | 2 | int16 BE |
| Int | 3 | int32 BE |
| Long | 4 | int64 BE |
| Float | 5 | IEEE 754 binary32 BE |
| Double | 6 | IEEE 754 binary64 BE |
| Byte Array | 7 | int32 BE length + bytes |
| String | 8 | int16 BE length + UTF-8 bytes |
| List | 9 | int16 BE element type + int32 BE count + elements |
| Compound | 10 | named entries terminated by End |
| Int Array | 11 | int32 BE length + int32 BE values |
| Long Array | 12 | int32 BE length + int64 BE values |

## Strings: Modified UTF-8

NBT strings use Java modified UTF-8:
- Null byte encoded as `C0 80` (2-byte), not `00`
- Supplementary characters (U+10000+) encoded as surrogate pairs (4 bytes each)
- All other characters: standard UTF-8

## Acceptance Criteria

- [ ] `bigint` values for `long` and `longArray` preserve 64-bit integers exactly
- [ ] Serialization is deterministic: compound entries in source insertion order
- [ ] All tag types round-trip through binary format using `DataView` big-endian reads/writes
- [ ] Modified UTF-8: null byte encoded as `C0 80`; emoji/supplementary chars as surrogate pairs
- [ ] Mixed-type lists rejected (handled at validation)

## Tests

**File:** `packages/domain/__tests__/slice-10-nbt-codec.test.ts`

1. Encode a compound with all tag types, decode back, verify equality
2. Verify `bigint` long value `9007199254740993n` preserved exactly (beyond safe integer)
3. Verify compound insertion order preserved after round-trip
4. Verify null byte round-trips as `C0 80` in modified UTF-8
5. Verify emoji/supplementary character round-trips as surrogate pair in modified UTF-8
6. Verify `DataView` big-endian reads match expected byte order

## Verification Checklist

- [ ] Change does one thing completely (NBT binary codec)
- [ ] TypeScript compiles without errors
- [ ] All new tests pass
- [ ] Change committed with descriptive message
