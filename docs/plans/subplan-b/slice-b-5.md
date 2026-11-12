# Subspec B — Slice b-5: Legacy .schematic + Vanilla .nbt Convert-on-Import

**Goal:** Implement convert-on-import for legacy `.schematic` and vanilla `.nbt` structure files. Both are import-only with warning, no export support in v1.

## Files to Create/Modify

| File | Purpose |
|------|---------|
| `packages/formats/convert-on-import.ts` | Legacy .schematic + vanilla .nbt adapters |

## Legacy .schematic (import only)

- Read legacy `.schematic` NBT, normalize into canonical domain model
- Import warning displayed; result marked `normalizedImport: true`
- No byte-level round-trip guarantee; no lossless claim
- Block positions and states preserved where mappable to 1.21.11 registry
- Unmappable states reported in `unsupported.blockStates`
- Export: not supported in v1; clear message
- `IMPORT_UNSUPPORTED_FORMAT` reserved for genuinely unknown signatures, NOT for legacy `.schematic`

## Vanilla .nbt structure files (import only)

- Parse `size` (int array `[x, y, z]`), `palette` (list of block state names), `blocks` (list of `{ pos: [x, y, z], state: int }` referencing palette indices), `entities` (list of entity NBT compounds)
- Block positions resolved relative to structure's origin offset
- Block states mapped to 1.21.11 registry where possible
- Unmappable states reported in `unsupported.blockStates`
- Export: not supported in v1; clear message

## Acceptance Criteria

- [ ] Legacy `.schematic` imports with warning and `normalizedImport: true`
- [ ] Legacy `.schematic` has no export support in v1
- [ ] Vanilla `.nbt` imports with warning and `normalizedImport: true`
- [ ] Vanilla `.nbt` has no export support in v1
- [ ] Unmappable block states reported in `unsupported.blockStates`
- [ ] `IMPORT_UNSUPPORTED_FORMAT` NOT used for legacy `.schematic` (only genuinely unknown signatures)
- [ ] Block positions resolved relative to structure origin

## Tests

**File:** `packages/formats/__tests__/slice-b-5-convert-on-import.test.ts`

1. Legacy `.schematic` import produces warning + `normalizedImport: true`
2. Legacy `.schematic` import creates valid placement
3. Vanilla `.nbt` import produces warning + `normalizedImport: true`
4. Vanilla `.nbt` `size`/`palette`/`blocks` parsed correctly
5. Unmappable block state reported in `unsupported.blockStates`
6. No export support for either format in v1

## Verification Checklist

- [ ] Change does one thing completely (convert-on-import for .schematic + .nbt)
- [ ] TypeScript compiles without errors
- [ ] All new tests pass
- [ ] Change committed with descriptive message
