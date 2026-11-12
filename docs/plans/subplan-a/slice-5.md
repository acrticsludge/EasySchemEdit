# Subspec A — Slice 5: BlockStateId Canonicalization

**Goal:** Define canonical block-state identity: namespaced ID normalization, sorted property keys, value-based equality (never reference equality).

## Files to Create/Modify

| File | Purpose |
|------|---------|
| `packages/domain/block-state.ts` | BlockStateId type + canonicalization |

## Types to Define

```ts
export type BlockStateId = {
  id: string;           // normalized namespaced resource location, lowercase
  props: Readonly<Record<string, string>>; // canonical sorted keys
};

export function blockStateId(id: string, props?: Record<string, string>): BlockStateId;

export function blockStateEquals(a: BlockStateId, b: BlockStateId): boolean;

export const CANONICAL_AIR: BlockStateId = blockStateId('minecraft:air');

export type AirLikeId = 'minecraft:air' | 'minecraft:cave_air' | 'minecraft:void_air';
export type AirLikeRegistry = Set<string>;

export const VANILLA_AIR_LIKE: AirLikeRegistry = new Set([
  'minecraft:air', 'minecraft:cave_air', 'minecraft:void_air',
]);

export function isAirLike(blockId: string, registry: AirLikeRegistry): boolean {
  return registry.has(blockId);
}
```

## Acceptance Criteria

- [ ] Namespaced IDs normalized to lowercase `namespace:id`
- [ ] Empty properties become `{}`
- [ ] Sort property keys canonically
- [ ] Equality is value-based: compare `id` string and deep-equal sorted `props`
- [ ] Never use object reference equality
- [ ] `minecraft:structure_void` is NOT air-like

## Tests

**File:** `packages/domain/__tests__/slice-5-block-state.test.ts`

1. `blockStateId('minecraft:stone')` equals `blockStateId('minecraft:stone')` by value, not reference
2. `blockStateId('minecraft:oak_stairs', { facing: 'north', half: 'bottom' })` equals same with props in different order
3. `blockStateId('MINECRAFT:AIR')` normalizes to `id: 'minecraft:air'`
4. `blockStateEquals(CANONICAL_AIR, blockStateId('minecraft:air'))` is `true`
5. `isAirLike('minecraft:cave_air', VANILLA_AIR_LIKE)` is `true`
6. `isAirLike('minecraft:structure_void', VANILLA_AIR_LIKE)` is `false`

## Verification Checklist

- [ ] Change does one thing completely (BlockStateId + air-like classification)
- [ ] TypeScript compiles without errors
- [ ] All new tests pass
- [ ] Change committed with descriptive message
