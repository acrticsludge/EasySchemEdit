# Subspec A — Slice 9: Binary Chunk Codec

**Goal:** Implement the binary chunk file format: magic `VOOX`, version, chunk coords, palette entries, index array data, trailing SHA-256.

## Files to Create/Modify

| File | Purpose |
|------|---------|
| `packages/domain/chunk-codec.ts` | Binary chunk encode/decode |

## Binary Layout (little-endian)

|| Offset | Size | Field |
||--------|------|-------|
|| 0 | 4 | Magic `0x564F4F58` ("VOOX") |
|| 4 | 2 | Version (uint16, currently 1) |
|| 6 | 4 | Chunk X (int32) |
|| 10 | 4 | Chunk Y (int32) |
|| 14 | 4 | Chunk Z (int32) |
|| 18 | 4 | Palette entry count N (uint32) |
|| 22 | N × variable | Palette entries |
|| after palette | 4 | Index array type code: 1=Uint8, 2=Uint16 |
|| +4 | 4096 × typeSize | Index array data (little-endian) |
|| end | 32 | SHA-256 of preceding bytes |

## Palette Entry Encoding

| Offset | Size | Field |
|--------|------|-------|
| 0 | 2 | Block state ID string length L (uint16) |
| 2 | L | ID UTF-8 bytes |
| +L | 2 | Property count P (uint16) |
| +2 | P × variable | Property pairs |

## Property Pair

| Offset | Size | Field |
|--------|------|-------|
| 0 | 2 | Key length K (uint16) |
| 2 | K | Key UTF-8 bytes |
| +K | 2 | Value length V (uint16) |
| +2 | V | Value UTF-8 bytes |

Properties sorted canonically by key. All integers little-endian. Strings UTF-8 without BOM.

## Acceptance Criteria

- [ ] Binary chunk codec round-trips with little-endian fields
- [ ] SHA-256 checksums verified on read
- [ ] Deterministic palette serialization (sorted keys)
- [ ] Index 0 is always `CANONICAL_AIR`
- [ ] Magic bytes are `0x564F4F58` ("VOOX"), verified byte-for-byte
- [ ] Single-palette-entry chunks may omit the index array (flag in header byte)

## Tests

**File:** `packages/domain/__tests__/slice-9-chunk-codec.test.ts`

1. Encode a chunk with 3 palette entries, decode back, verify equality
2. Corrupt one byte in the index array → SHA-256 mismatch detected
3. Verify magic bytes `0x56 0x4F 0x4F 0x58` ("VOOX") after round-trip
4. Verify palette index 0 is `CANONICAL_AIR` after round-trip
5. Verify index array length is exactly 4096

## Verification Checklist

- [ ] Change does one thing completely (binary chunk codec)
- [ ] TypeScript compiles without errors
- [ ] All new tests pass
- [ ] Change committed with descriptive message
