# Subspec D — Slice d-4: Move Region + Stack Operations

**Source:** `docs/specs/subs/SUBSPEC-D_EDITING_ENGINE.md` §2.4 (MoveRegionOperation, StackOperation), §4.6.2 (Stack operation)
**Constraint:** Pure TypeScript, zero framework/browser/Node/Three.js/MCP imports. Imports from `@easyschemedit/domain` and `@easyschemedit/operations` only.

## Goal

Implement move region (single undo transaction with source/destination snapshots) and stack operation (repeat N times with offset, ignoreAir, shiftSelection).

## Files

| File | Action | Content |
|------|--------|---------|
| `packages/operations/src/move-stack.ts` | create | `MoveRegionResult`, `StackResult`, `MoveStackEngine` class with moveRegion() and stack() methods |

## Types / APIs

```ts
export interface MoveRegionOptions {
  overlapPolicy: 'top-wins' | 'bottom-wins';
  affectedPlacements: string[];
}

export interface MoveRegionResult {
  success: boolean;
  sourceBounds: Bounds3i;
  destinationOffset: Vec3i;
  changedPlacements: string[];
  changedCells: number;
  warnings: string[];
}

export interface StackOptions {
  count: number;
  offset: Vec3i;
  shiftSelection: boolean;
  ignoreAir: boolean;
}

export interface StackResult {
  success: boolean;
  copies: number;
  totalChangedCells: number;
  affectedBounds: Bounds3i;
  lastCopyBounds: Bounds3i | null;
  warnings: string[];
}

export class MoveStackEngine {
  moveRegion(project: Project, sourceBounds: Bounds3i, destinationOffset: Vec3i, options: MoveRegionOptions): MoveRegionResult;
  stack(project: Project, sourceBounds: Bounds3i, options: StackOptions): StackResult;
}
```

## Acceptance criteria

1. Move region snapshots source and destination before mutation (single undo transaction)
2. Move region applies overlapPolicy (top-wins or bottom-wins) at overlapping positions
3. Move region only affects placements in affectedPlacements list
4. Stack repeats N times with per-copy offset
5. Stack ignoreAir skips air cells when counting stack content
6. Stack shiftSelection moves selection to last stacked copy
7. Stack operates on uploaded content only (no new shape generation)
8. Move region and stack are single undo transactions (revision incremented once)

## Tests

No test file yet — verification via typecheck. Test file `slice-d-4-move-stack.test.ts` to be created with test harness.

## Verification

- `pnpm --filter @easyschemedit/operations exec tsc --noEmit` exit code 0
