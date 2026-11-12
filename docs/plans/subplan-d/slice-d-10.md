# Subspec D — Slice d-10: Hover Operations

**Source:** `docs/specs/subs/SUBSPEC-D_EDITING_ENGINE.md` §2.4 (Hover operations), §5.4 (Hover info HUD)
**Constraint:** Pure TypeScript, zero framework/browser/Node/Three.js/MCP imports. Imports from `@easyschemedit/domain` and `@easyschemedit/operations` only.

## Goal

Implement hover operations: block highlight, info HUD, placement hover, same-type highlight. Air not highlighted. Session state only (not persisted).

## Files

| File | Action | Content |
|------|--------|---------|
| `packages/operations/src/hover.ts` | create | `HoverState`, `HoverInfo`, `HoverEngine` class with hover methods |

## Types / APIs

```ts
export interface HoverState {
  hoveredPosition: Vec3i | null;
  hoveredPlacementId: string | null;
  hoveredBlockState: BlockStateId | null;
  isAir: boolean;
  sameTypeHighlights: Vec3i[];  // positions of same-type blocks
}

export interface HoverInfo {
  position: Vec3i;
  blockState: BlockStateId;
  placementId: string;
  localPosition: Vec3i;
  sameTypeCount: number;
}

export class HoverEngine {
  hoverOver(project: Project, position: Vec3i): HoverInfo | null;
  getSameTypeHighlights(project: Project, position: Vec3i, blockState: BlockStateId): Vec3i[];
  clearHover(): HoverState;
  setSameTypeHighlight(position: Vec3i, enabled: boolean): void;
}
```

## Acceptance criteria

1. Hover returns block info at position (block state, placement, local position)
2. Air positions return null (air not highlighted)
3. Same-type highlight finds all blocks of same type in project
4. Hover state is session-only (not persisted to IndexedDB)
5. Clear hover resets state

## Tests

No test file yet — verification via typecheck. Test file `slice-d-10-hover.test.ts` to be created with test harness.

## Verification

- `pnpm --filter @easyschemedit/operations exec tsc --noEmit` exit code 0
