# Subspec B — Slice b-11: Vanilla .nbt Convert-on-Import

**Goal:** Vanilla .nbt convert-on-import gets its own slice. Structure: `size`, `palette`/`palettes` {Name,Properties}, `blocks[].pos/state/nbt`, `entities`, `DataVersion`.

## Files to Create

| File | Purpose |
|------|---------|
| `packages/formats/vanilla-nbt.ts` | Vanilla .nbt convert-on-import adapter |

## Vanilla .nbt Structure

```
Root compound:
  size: Int[3]              // [width, height, length]
  palette: List<Compound { Name: String, Properties: Compound }>
  palettes?: List<List<Compound>>  // multiple palettes supported
  blocks: List<Compound { pos: Int[3], state: Int, nbt?: Compound }>
  entities: List<Compound>
  DataVersion: Int
```

## Convert-on-Import

- Map palette indices to BlockStateId
- Support multiple palettes
- Blocks have pos/state/nbt
- Entities preserved
- DataVersion read
- Produces `normalizedImport: true` (palette remapping)

## Acceptance Criteria

- [ ] Vanilla .nbt detected via `size`/`palette`/`blocks`/`DataVersion`
- [ ] Palette entries {Name, Properties} → BlockStateId
- [ ] Multiple palettes supported
- [ ] Blocks: pos/state/nbt preserved
- [ ] Entities preserved
- [ ] DataVersion read
- [ ] `normalizedImport: true` (palette remapping)

## Tests

**File:** `packages/formats/__tests__/slice-b-11-vanilla-nbt.test.ts`

1. Vanilla .nbt format detected
2. Palette entries {Name, Properties} mapped to BlockStateId
3. Multiple palettes supported
4. Blocks pos/state/nbt preserved
5. Entities preserved
6. DataVersion read
7. `normalizedImport: true`

## Verification Checklist

- [ ] Change does one thing completely (vanilla .nbt convert-on-import)
- [ ] TypeScript compiles without errors
- [ ] All new tests pass
- [ ] Change committed with descriptive message
