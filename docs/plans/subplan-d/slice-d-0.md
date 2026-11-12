# Subspec D — Slice d-0: Placement Management Types + CRUD

**Source:** `docs/specs/subs/SUBSPEC-D_EDITING_ENGINE.md` §2.1 (Placement management), §2.3 (Region operation targeting)
**Constraint:** Pure TypeScript, zero framework/browser/Node/Three.js/MCP imports. Imports from `@easyschemedit/domain` only.

## Goal

Create placement management types and operations: placement lock state, visibility, order, reorder operations, select/multi-select, lock/unlock, show/hide, duplicate, delete, reorder, move, rotate, mirror, edit origin.

## Files

| File | Action | Content |
|------|--------|---------|
| `packages/operations/src/placement.ts` | create | `PlacementLockState`, `PlacementVisibility`, `PlacementOrder`, `PlacementReorderOperation` types; placement management functions |

## Types / APIs

```ts
export type PlacementLockState = {
  locked: boolean;
  lockReason?: 'user' | 'import' | 'system';
};

export type PlacementVisibility = {
  visible: boolean;
  visibleInViewport: boolean;  // derived from visible + group visibility
};

export type PlacementOrder = {
  index: number;               // position in Project.placements (bottom-to-top)
  groupIndex?: number;         // position within import group, if any
};

export type PlacementReorderOperation = {
  placementId: string;
  fromIndex: number;
  toIndex: number;
};
```

Lock semantics:
- Locked placements cannot be transformed, edited by region operations, deleted, duplicated, baked, or have origins changed.
- Read-only operations and export remain allowed.
- Mixed selection mutations skip no locked items silently. Show locked placements and require user to remove them or explicitly unlock.
- Hide/show is allowed while locked (visibility is not geometry editing).

## Acceptance criteria

1. `PlacementLockState` has `locked: boolean` and optional `lockReason`
2. `PlacementVisibility` has `visible` and `visibleInViewport`
3. `PlacementOrder` has `index` (position in placements array) and optional `groupIndex`
4. `PlacementReorderOperation` has `placementId`, `fromIndex`, `toIndex`
5. Locked placements reject: transform, region operation edit, delete, duplicate, bake, origin change
6. Locked placements allow: read-only operations, export, hide/show
7. Mixed selection with locked placements requires explicit unlock or removal
8. `packages/operations` imports only from `@easyschemedit/domain` (no framework/browser/Node/Three.js/MCP)

## Tests

No test file yet — verification via typecheck. Test file `slice-d-0-placement.test.ts` to be created with test harness.

## Verification

- `pnpm --filter @easyschemedit/operations exec tsc --noEmit` exit code 0
