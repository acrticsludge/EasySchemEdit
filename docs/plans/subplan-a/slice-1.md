# Subspec A — Slice 1: NBT AST

**Goal:** Define the typed NBT Abstract Syntax Tree (`NbtTag`, `NbtElementType`) covering all 12 tag kinds (11 payload types + End handled in codec).

## Files to Create/Modify

| File | Purpose |
|------|---------|
| `packages/domain/nbt.ts` | NBT AST type definitions |

## Types to Define

```ts
export type NbtTag =
  | { type: 'byte'; value: number }
  | { type: 'short'; value: number }
  | { type: 'int'; value: number }
  | { type: 'long'; value: bigint }
  | { type: 'float'; value: number }
  | { type: 'double'; value: number }
  | { type: 'byteArray'; value: Uint8Array }
  | { type: 'string'; value: string }
  | { type: 'list'; elementType: NbtElementType; value: NbtTag[] }
  | { type: 'compound'; value: ReadonlyMap<string, NbtTag> }
  | { type: 'intArray'; value: Int32Array }
  | { type: 'longArray'; value: BigInt64Array };

export type NbtElementType =
  | 'byte' | 'short' | 'int' | 'long' | 'float' | 'double'
  | 'byteArray' | 'string' | 'list' | 'compound' | 'intArray' | 'longArray';
```

## Acceptance Criteria

- [ ] All 12 tag kinds are represented (11 payload types + End handled in codec)
- [ ] `bigint` values for `long` and `longArray` preserve 64-bit integers exactly
- [ ] Compound insertion order is preserved (ReadonlyMap)
- [ ] Mixed-type lists are rejected (handled at parse time in slice 10)

## Tests

**File:** `packages/domain/__tests__/slice-1-nbt-ast.test.ts`

1. Construct each of the 12 tag kinds without TypeScript errors
2. Verify `bigint` values are preserved exactly (e.g., `1n << 40n`)
3. Verify compound entries maintain insertion order via Map

## Verification Checklist

- [ ] Change does one thing completely (NBT type definitions only)
- [ ] TypeScript compiles without errors
- [ ] All new tests pass
- [ ] Change committed with descriptive message
