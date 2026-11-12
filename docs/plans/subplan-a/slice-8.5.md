# Subspec A — Slice 8.5: Effective-Block Resolver

**Goal:** Define the effective-block resolver that computes the visible block state at any world position by combining placements with top-wins/bottom-wins precedence, respecting visibility and erase tombstones.

## Files to Create/Modify

| File | Purpose |
|------|---------|
| `packages/domain/effective-block.ts` | Effective-block resolution |

## Precedence Modes

- `top-wins`: later placements in array override earlier ones
- `bottom-wins`: earlier placements in array override later ones

## Resolution Rules

1. Collect all placements whose volume contains the world position (after inverse transform)
2. Apply precedence: top-wins or bottom-wins
3. Skip invisible placements (`visible: false`)
4. Erase tombstones act as erase contributions: a tombstoned block position is treated as air if no other placement owns it
5. `structure_void` is owning: it overwrites air and other blocks
6. Air is non-owning unless tombstoned: plain air doesn't overwrite existing blocks

## Functions to Define

```ts
export type EffectiveBlockResult = {
  state: BlockStateId;
  owningPlacementId: string | null;
  isErase: boolean; // true if result is air due to tombstone
};

export function resolveBlockAt(
  project: Project,
  worldPos: Vec3i,
  overlapPolicy: 'top-wins' | 'bottom-wins'
): EffectiveBlockResult;
```

## Acceptance Criteria

- [ ] Top-wins: last placement in array wins for overlapping blocks
- [ ] Bottom-wins: first placement in array wins for overlapping blocks
- [ ] Invisible placements do not contribute
- [ ] Erase tombstones override block state to air
- [ ] `structure_void` is owning (overwrites air and other blocks)
- [ ] Plain air is non-owning (does not overwrite)
- [ ] Result reports owning placement ID

## Tests

**File:** `packages/domain/__tests__/slice-8.5-effective-block.test.ts`

1. Two overlapping placements, top-wins → top placement's block wins
2. Two overlapping placements, bottom-wins → bottom placement's block wins
3. Invisible placement does not contribute to effective block
4. Tombstoned block position resolves to air
5. `structure_void` overwrites air block from another placement
6. Plain air does not overwrite stone block from another placement

## Verification Checklist

- [ ] Change does one thing completely (effective-block resolver)
- [ ] TypeScript compiles without errors
- [ ] All new tests pass
- [ ] Change committed with descriptive message
