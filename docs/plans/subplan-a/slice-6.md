# Subspec A — Slice 6: BlockStateTransformRegistry

**Goal:** Implement the bijective rotation/mirror table for vanilla directional properties (facing, axis, stair shape, rail shape, hinge). Every column must be a permutation; mirror columns are involutions.

## Files to Create/Modify

| File | Purpose |
|------|---------|
| `packages/domain/block-state-transforms.ts` | Transform registry + vanilla rules |

## Types to Define

```ts
export type BlockStateTransformHandler = {
  canHandle(blockId: string): boolean;
  rotate(blockState: BlockStateId, degrees: 90 | 180 | 270):
    | { kind: 'ok'; result: BlockStateId }
    | { kind: 'unsupported'; reason: string };
  mirror(blockState: BlockStateId, plane: 'x' | 'z'):
    | { kind: 'ok'; result: BlockStateId }
    | { kind: 'unsupported'; reason: string };
};

export class BlockStateTransformRegistry {
  private handlers = new Map<string, BlockStateTransformHandler>();
  register(pattern: string, handler: BlockStateTransformHandler): void;
  get(blockId: string): BlockStateTransformHandler | undefined;
  transformRotate(blockState, degrees): { result: BlockStateId; warnings: Diagnostic[] };
  transformMirror(blockState, plane): { result: BlockStateId; warnings: Diagnostic[] };
}
```

## Bijective Vanilla Table

Directional properties transformed by applying rotation/mirror matrix `R` to direction vectors:

| Property | 90° | 180° | 270° | Mirror X | Mirror Z |
|----------|-----|------|------|----------|----------|
| facing=north | west | south | east | north | south |
| facing=east | north | west | south | west | east |
| facing=south | east | north | west | south | north |
| facing=west | south | east | north | east | west |
| facing=up | up | up | up | up | up |
| facing=down | down | down | down | down | down |
| axis=x | z | x | z | x | x |
| axis=y | y | y | y | y | y |
| axis=z | x | z | x | z | z |
| stair shape=inner_left | inner_left | inner_left | inner_left | inner_right | inner_right |
| stair shape=inner_right | inner_right | inner_right | inner_right | inner_left | inner_left |
| stair shape=outer_left | outer_left | outer_left | outer_left | outer_right | outer_right |
| stair shape=outer_right | outer_right | outer_right | outer_right | outer_left | outer_left |
| rail shape=north_south | north_south | north_south | north_south | north_south | north_south |
| rail shape=east_west | east_west | east_west | east_west | east_west | east_west |
| door hinge=left | left | left | left | right | right |
| door hinge=right | right | right | right | left | left |

## Acceptance Criteria

- [ ] Every column is a permutation (bijective)
- [ ] Mirror columns are involutions (self-inverse)
- [ ] `90°⁻¹ = 270°`, `90°⁴ = identity`, `mirror² = identity`
- [ ] Applying operation then inverse restores original state
- [ ] `axis` is undirected: mirror flips do not change axis line
- [ ] `rail` follows its run axis; mirrors do not change rail run axis
- [ ] Rotation does NOT change stair shape or door hinge; only mirror swaps left/right

## Tests

**File:** `packages/domain/__tests__/slice-6-block-state-transforms.test.ts`

Property-based tests:

1. For every directional property and every operation, applying the operation then its inverse returns the original value
2. `rotate(90)` then `rotate(270)` returns original
3. `rotate(90)` four times returns original
4. `mirror('x')` twice returns original
5. All table entries match the matrix derivation
6. **Chirality test:** stair shape/hinge unchanged by any rotation (0/90/180/270), swapped by any mirror (x/z), mirror twice = identity
7. **Facing derivation test:** compute expected facing from the R matrix, not hand-copied table values

## Verification Checklist

- [ ] Change does one thing completely (transform registry + table)
- [ ] TypeScript compiles without errors
- [ ] All new tests pass
- [ ] Change committed with descriptive message
