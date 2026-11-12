# Subspec B — Slice b-7: Sponge v2 Reader

**Goal:** Implement Sponge schematic v2 reader. Palette is a compound (state string → int). BlockData is VarInt bytes. Offset is int[3]. Don't redeclare `FormatAdapter`. Lossless read: no warning, `normalizedImport` false.

## Files to Create

| File | Purpose |
|------|---------|
| `packages/formats/sponge-v2.ts` | Sponge v2 adapter |

## Sponge v2 Structure

```
Root compound:
  Palette: Compound { <stateString>: Int }   // state string -> int index
  BlockData: Byte[]                          // VarInt-encoded block state indices
  Offset: Int[3]                             // [x, y, z]
  Width: Int
  Height: Int
  Length: Int
```

## Read Contract

- Palette entries: state string → int index (compound, not list)
- BlockData: VarInt bytes (each entry is a VarInt palette index)
- Offset: int[3]
- Lossless read: no warning, `normalizedImport: false`
- Block positions from BlockData array indices mapped to x/y/z using Width/Height/Length

## Acceptance Criteria

- [ ] Sponge v2 detected via root `Palette` compound + `BlockData` VarInt bytes
- [ ] Palette is compound (state string → int), not list
- [ ] BlockData is VarInt bytes
- [ ] Offset is int[3]
- [ ] Lossless read: no warning, `normalizedImport: false`
- [ ] Does not redeclare `FormatAdapter` (uses shared interface from b-0.5)

## Tests

**File:** `packages/formats/__tests__/slice-b-7-sponge-v2.test.ts`

1. Sponge v2 format detected (Palette compound + BlockData VarInt)
2. Palette entries read as state string → int
3. BlockData VarInt bytes decoded to palette indices
4. Offset read as int[3]
5. Import produces no warning, `normalizedImport: false`
6. Block positions mapped correctly from Width/Height/Length

## Verification Checklist

- [ ] Change does one thing completely (Sponge v2 reader)
- [ ] TypeScript compiles without errors
- [ ] All new tests pass
- [ ] Change committed with descriptive message
