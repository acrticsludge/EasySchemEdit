# Subspec B — Slice b-1: NBT Parser+Encoder with Gzip + Safety Limits

**Goal:** Implement NBT binary encode/decode using `DataView` big-endian reads/writes, gzip compression/decompression via injected service, streaming input option, and all safety limits enforced incrementally inside the parser. Decide one error contract: `NbtSafetyError` is thrown. Gzip service enforces `maxDecompressedBytes` while inflating.

## Files to Create

| File | Purpose |
|------|---------|
| `packages/formats/nbts.ts` | NBT binary encode/decode with gzip, streaming, safety limits |

## Tag type IDs

| Tag type | ID |
|--------|----|
| End | 0 |
| Byte | 1 |
| Short | 2 |
| Int | 3 |
| Long | 4 |
| Float | 5 |
| Double | 6 |
| Byte Array | 7 |
| String | 8 |
| List | 9 |
| Compound | 10 |
| Int Array | 11 |
| Long Array | 12 |

## Safety Limits (enforced incrementally inside parser)

| Limit | Default | Exceeded → |
|-------|---------|------------|
| Total NBT tags | 1,000,000 | `NBT_TAG_COUNT_EXCEEDED` |
| String length (UTF-8 bytes) | 1 MiB | `NBT_STRING_TOO_LONG` |
| List element count | 1,000,000 | `NBT_TAG_COUNT_EXCEEDED` |
| Array length | scales with maxDecompressedBytes | `NBT_ARRAY_TOO_LONG` |
| Nesting depth | 512 | `NBT_NESTING_DEPTH_EXCEEDED` |
| Integer overflow | per-type range | `NBT_INTEGER_OVERFLOW` |
| Duplicate required fields | any duplicate | `NBT_DUPLICATE_REQUIRED_FIELD` |

## Key Behaviors

- Error contract: throw `NbtSafetyError` (no dual throw/return pattern)
- Streaming: accept chunked/stream input OR drop the streaming claim — choose one, document it
- Modified UTF-8: null byte as C0 80; supplementary chars as surrogate pairs
- `DataView` for all big-endian reads/writes — never `BigInt64Array`/`Int32Array` on raw buffers
- `gzipDecompress` service enforces `maxDecompressedBytes` while inflating (no unbounded buffer)
- `bigint` for NBT `long` and `longArray` to preserve 64-bit integers exactly

## Functions to Define

```ts
export type NbtServices = {
  gzipCompress(bytes: Uint8Array): Uint8Array;
  gzipDecompress(bytes: Uint8Array, maxDecompressedBytes: number): Uint8Array;
};

export function encodeNbt(tag: NbtTag, services: NbtServices): Uint8Array;
export function decodeNbt(bytes: Uint8Array, services: NbtServices, limits?: Partial<NbtSafetyLimits>): NbtTag;
```

## Acceptance Criteria

- [ ] All 12 tag kinds round-trip through binary format using `DataView` big-endian reads/writes
- [ ] Modified UTF-8: null byte as C0 80; emoji as surrogate pairs
- [ ] Gzip via injected service; `gzipDecompress` enforces `maxDecompressedBytes` while inflating
- [ ] Single error contract: `NbtSafetyError` thrown (documented choice on streaming)
- [ ] All 7 safety limits enforced incrementally inside parser
- [ ] Array length cap scales with `maxDecompressedBytes`

## Tests

**File:** `packages/formats/__tests__/slice-b-1-nbts.test.ts`

1. Encode/decode round-trip with all 12 tag kinds
2. `bigint` long value `9007199254740993n` preserved exactly
3. Null byte round-trips as C0 80 in modified UTF-8
4. Emoji round-trips as surrogate pair
5. Tag count > limit → `NBT_TAG_COUNT_EXCEEDED`
6. String length > limit → `NBT_STRING_TOO_LONG`
7. Nesting depth > limit → `NBT_NESTING_DEPTH_EXCEEDED`
8. Duplicate required field → `NBT_DUPLICATE_REQUIRED_FIELD`

## Verification Checklist

- [ ] Change does one thing completely (NBT parser+encoder with gzip + safety limits)
- [ ] TypeScript compiles without errors
- [ ] All new tests pass
- [ ] Change committed with descriptive message
