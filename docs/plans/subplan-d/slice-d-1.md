# Subspec D — Slice d-1: Selection Types

**Source:** `docs/specs/subs/SUBSPEC-D_EDITING_ENGINE.md` §3.1 (Selection types), §3.2 (Selection bounds)
**Constraint:** Pure TypeScript, zero framework/browser/Node/Three.js/MCP imports. Imports from `@easyschemedit/domain` and `@easyschemedit/operations` only.

## Goal

Implement selection types: placement selection and cuboid selection, half-open bounds, anchor point, selection state management.

## Files

| File | Action | Content |
|------|--------|---------|
| `packages/operations/src/selection.ts` | create | `SelectionType`, `CuboidBounds`, `SelectionAnchor`, `PlacementSelection`, `CuboidSelection`, `SelectionState` types; selection management functions |

## Types / APIs

```ts
export type SelectionType = 'placement' | 'cuboid';

export interface CuboidBounds {
  minX: number;  // inclusive
  minY: number;  // inclusive
  minZ: number;  // inclusive
  maxX: number;  // exclusive
  maxY: number;  // exclusive
  maxZ: number;  // exclusive
}

export interface SelectionAnchor {
  x: number;
  y: number;
  z: number;
}

export interface PlacementSelection {
  kind: 'placement';
  placementIds: string[];
}

export interface CuboidSelection {
  kind: 'cuboid';
  bounds: CuboidBounds;
}

export type Selection = PlacementSelection | CuboidSelection;

export interface SelectionState {
  type: SelectionType;
  selection: Selection;
  anchor: SelectionAnchor;
  modifiedAt: number;
}
```

## Acceptance criteria

1. `SelectionType` is 'placement' or 'cuboid'
2. `CuboidBounds` has half-open bounds (min inclusive, max exclusive)
3. `SelectionAnchor` has x, y, z coordinates
4. `PlacementSelection` has kind 'placement' and placementIds array
5. `CuboidSelection` has kind 'cuboid' and bounds
6. Selection can switch between placement and cuboid types
7. Half-open bounds: volume = (maxX-minX) × (maxY-minY) × (maxZ-minZ)
8. Deletion repair: when a selected placement is deleted, it's removed from selection
9. Selection survives tool changes (type and data preserved)

## Tests

No test file yet — verification via typecheck. Test file `slice-d-1-selection.test.ts` to be created with test harness.

## Verification

- `pnpm --filter @easyschemedit/operations exec tsc --noEmit` exit code 0
