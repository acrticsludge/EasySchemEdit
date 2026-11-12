# Subspec B — Slice b-7: NBT Safety Limits

**Goal:** Implement NBT safety limits enforced at parse and encode time per SUBSPEC-B §12: tag count, string/array length, decompression ratio, parse duration, nesting depth, integer overflow, duplicate required fields.

## Files to Create/Modify

| File | Purpose |
|------|---------|
| `packages/formats/nbtsafety.ts` | NBT safety limits + typed errors |

## Limits to Enforce

| Limit | Default | Exceeded → |
|-------|---------|------------|
| Total NBT tags | 1,000,000 | `NBT_TAG_COUNT_EXCEEDED` |
| String length (UTF-8 bytes) | 1 MiB | `NBT_STRING_TOO_LONG` |
| List element count | 1,000,000 | `NBT_TAG_COUNT_EXCEEDED` (counted per element) |
| Byte/int/long array length | 16 MiB elements | `NBT_ARRAY_TOO_LONG` |
| Decompression ratio | 100:1 | `NBT_DECOMPRESSION_RATIO_EXCEEDED` |
| Parsing duration | 30 seconds | `NBT_PARSE_DURATION_EXCEEDED` |
| NBT nesting depth | 512 | `NBT_NESTING_DEPTH_EXCEEDED` |
| Integer overflow | per-type range | `NBT_INTEGER_OVERFLOW` |
| Duplicate required fields | any duplicate | `NBT_DUPLICATE_REQUIRED_FIELD` |

## Functions to Define

```ts
export type NbtSafetyLimits = {
  maxTotalTags: number;
  maxStringLengthBytes: number;
  maxListElementCount: number;
  maxArrayLengthElements: number;
  maxDecompressionRatio: number;
  maxParseDurationMs: number;
  maxNestingDepth: number;
};

export class NbtSafetyError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = 'NbtSafetyError';
  }
}

export function checkNbtSafety(
  stats: NbtParseStats,
  limits: NbtSafetyLimits,
): void;

export type NbtParseStats = {
  totalTags: number;
  maxStringLengthBytes: number;
  totalListElements: number;
  maxArrayLength: number;
  compressionRatio: number;
  parseDurationMs: number;
  nestingDepth: number;
  hasDuplicateRequiredField: boolean;
};
```

## Acceptance Criteria

- [ ] Tag count limit enforced: > 1,000,000 → `NBT_TAG_COUNT_EXCEEDED`
- [ ] String length limit: > 1 MiB UTF-8 bytes → `NBT_STRING_TOO_LONG`
- [ ] List element count limit: > 1,000,000 → `NBT_TAG_COUNT_EXCEEDED`
- [ ] Array length limit: > 16 MiB elements → `NBT_ARRAY_TOO_LONG`
- [ ] Decompression ratio limit: > 100:1 → `NBT_DECOMPRESSION_RATIO_EXCEEDED`
- [ ] Parse duration limit: > 30 seconds → `NBT_PARSE_DURATION_EXCEEDED`
- [ ] Nesting depth limit: > 512 → `NBT_NESTING_DEPTH_EXCEEDED`
- [ ] Integer overflow → `NBT_INTEGER_OVERFLOW`
- [ ] Duplicate required fields → `NBT_DUPLICATE_REQUIRED_FIELD`
- [ ] Duplicate required field parse fails rather than taking first/last

## Tests

**File:** `packages/formats/__tests__/slice-b-7-nbt-safety.test.ts`

1. Tag count > 1,000,000 → `NBT_TAG_COUNT_EXCEEDED`
2. String length > 1 MiB → `NBT_STRING_TOO_LONG`
3. Decompression ratio > 100:1 → `NBT_DECOMPRESSION_RATIO_EXCEEDED`
4. Nesting depth > 512 → `NBT_NESTING_DEPTH_EXCEEDED`
5. Duplicate required field → `NBT_DUPLICATE_REQUIRED_FIELD`
6. All limits within bounds → no error

## Verification Checklist

- [ ] Change does one thing completely (NBT safety limits)
- [ ] TypeScript compiles without errors
- [ ] All new tests pass
- [ ] Change committed with descriptive message
