# Subspec A — Slice 5.5: Block-State Strings

**Goal:** Implement parse/format for block-state strings like `minecraft:oak_stairs[facing=north,half=bottom]` with canonical ordering and error cases.

## Files to Create/Modify

| File | Purpose |
|------|---------|
| `packages/domain/block-state-string.ts` | Block-state string parse/format |

## Functions to Define

```ts
import { BlockStateId } from './block-state';

export function parseBlockStateString(s: string): BlockStateId;
export function formatBlockStateString(id: BlockStateId): string;
```

## Parsing Rules

1. Split on `[` to separate ID from properties
2. Normalize ID to lowercase `namespace:id`
3. Parse properties: `key=value` pairs separated by `,`
4. Sort property keys canonically
5. Validate: keys must be non-empty lowercase alphanumeric + `_`
6. Validate: values must be non-empty lowercase alphanumeric + `_`

## Error Cases

- `parseBlockStateString('minecraft:oak_stairs[facing=north,half=bottom]')` → OK
- `parseBlockStateString('MINECRAFT:AIR')` → OK, normalizes to `minecraft:air`
- `parseBlockStateString('minecraft:stone[facing=]')` → throws (empty value)
- `parseBlockStateString('minecraft:stone[Facing=north]')` → throws (uppercase key)
- `parseBlockStateString('minecraft:stone[facing=north]extra')` → throws (trailing content)
- `parseBlockStateString('minecraft:stone[]')` → OK, empty properties

## Acceptance Criteria

- [ ] `parse`/`format` round-trip: `format(parse(s)) === s` for canonical strings
- [ ] Property keys sorted canonically in output
- [ ] ID normalized to lowercase
- [ ] Empty properties → `{}` → no brackets in output
- [ ] Invalid strings throw descriptive errors

## Tests

**File:** `packages/domain/__tests__/slice-5.5-block-state-string.test.ts`

1. `format(parse('minecraft:oak_stairs[facing=north,half=bottom]'))` === `'minecraft:oak_stairs[facing=north,half=bottom]'`
2. `format(parse('minecraft:oak_stairs[half=bottom,facing=north]'))` === `'minecraft:oak_stairs[facing=north,half=bottom]'` (sorted)
3. `parse('MINECRAFT:AIR')` normalizes to `id: 'minecraft:air'`
4. `format({ id: 'minecraft:air', props: {} })` === `'minecraft:air'` (no brackets)
5. `parse('minecraft:stone[facing=]')` throws
6. `parse('minecraft:stone[Facing=north]')` throws

## Verification Checklist

- [ ] Change does one thing completely (block-state string parse/format)
- [ ] TypeScript compiles without errors
- [ ] All new tests pass
- [ ] Change committed with descriptive message
