# Subspec D — Slice d-6: Bake Operation

**Source:** `docs/specs/subs/SUBSPEC-D_EDITING_ENGINE.md` §2.4 (BakeOperation), §4.7 (Bake operation)
**Constraint:** Pure TypeScript, zero framework/browser/Node/Three.js/MCP imports. Imports from `@easyschemedit/domain` and `@easyschemedit/operations` only.

## Goal

Implement bake operation: union bounds, effective block resolution, merge rules, atomic commit, undo restores all. No automatic multi-region export, no ambiguous sparse-export promise.

## Files

| File | Action | Content |
|------|--------|---------|
| `packages/operations/src/bake.ts` | create | `BakeOperation`, `BakeResult`, `BakeEngine` class with bake() method |

## Types / APIs

```ts
export interface BakeOptions {
  overlapPolicy: 'top-wins' | 'bottom-wins';
  affectedPlacements: string[];
  createNewPlacement: boolean;    // if true, bake into new placement; false = modify in place
  newPlacementName?: string;
}

export interface BakeResult {
  success: boolean;
  unionBounds: Bounds3i;
  changedPlacements: string[];
  newPlacementId?: string;
  changedCells: number;
  warnings: string[];
  atomic: boolean;              // true if all-or-nothing commit
}

export class BakeEngine {
  bake(project: Project, options: BakeOptions): BakeResult;
}
```

## Acceptance criteria

1. Bake computes union bounds of all affected placements
2. Effective block resolution: top-wins (default) or bottom-wins precedence
3. Atomic commit: all-or-nothing, no partial state on failure
4. Undo restores all placements to pre-bake state
5. No silent block discard — all changes tracked in warnings
6. createNewPlacement=true: bakes into new placement, existing placements unchanged
7. createNewPlacement=false: modifies placements in place
8. Bake limits enforced (dimension limits from SUBSPEC-B)

## Tests

No test file yet — verification via typecheck. Test file `slice-d-6-bake.test.ts` to be created with test harness.

## Verification

- `pnpm --filter @easyschemedit/operations exec tsc --noEmit` exit code 0
