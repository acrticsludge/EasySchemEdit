# Subspec D — Slice d-8: Snap & Align Tools

**Source:** `docs/specs/subs/SUBSPEC-D_EDITING_ENGINE.md` §2.4 (Snap & align tools), §4.2 (Transform math)
**Constraint:** Pure TypeScript, zero framework/browser/Node/Three.js/MCP imports. Imports from `@easyschemedit/domain` and `@easyschemedit/operations` only.

## Goal

Implement snap & align tools: snap to origin, align edges, snap to placement. Grid alignment, integer coordinates, single undo transaction.

## Files

| File | Action | Content |
|------|--------|---------|
| `packages/operations/src/snap-align.ts` | create | `SnapOptions`, `AlignOptions`, `SnapResult`, `AlignResult`, `SnapAlignEngine` class |

## Types / APIs

```ts
export interface SnapOptions {
  snapToGrid: boolean;       // snap to integer grid
  snapToOrigin: boolean;     // snap to placement origin
  snapToPlacementId?: string; // snap to another placement
}

export interface SnapResult {
  success: boolean;
  newPosition: Vec3i;
  snapped: boolean;
  warnings: string[];
}

export interface AlignOptions {
  alignTo: 'min' | 'max' | 'center';
  axis: 'x' | 'y' | 'z';
  targetPlacementId: string;
  targetPlacementIndex?: number; // which placement in group
}

export interface AlignResult {
  success: boolean;
  newPosition: Vec3i;
  aligned: boolean;
  warnings: string[];
}

export class SnapAlignEngine {
  snapToOrigin(project: Project, placementId: string): SnapResult;
  snapToGrid(project: Project, placementId: string): SnapResult;
  snapToPlacement(project: Project, placementId: string, targetPlacementId: string, offset: Vec3i): SnapResult;
  alignEdges(project: Project, placementId: string, options: AlignOptions): AlignResult;
}
```

## Acceptance criteria

1. Snap to origin: placement translation set so origin aligns to grid origin
2. Snap to grid: all translation components rounded to nearest integer
3. Snap to placement: placement positioned relative to target with offset
4. Align edges: align min/max/center along specified axis
5. Grid alignment: integer coordinates only (no fractional translation)
6. Single undo transaction: revision incremented once per operation

## Tests

No test file yet — verification via typecheck. Test file `slice-d-8-snap-align.test.ts` to be created with test harness.

## Verification

- `pnpm --filter @easyschemedit/operations exec tsc --noEmit` exit code 0
