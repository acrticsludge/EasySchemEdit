# Subspec D — Slice d-7: Import-and-Place Flow

**Source:** `docs/specs/subs/SUBSPEC-D_EDITING_ENGINE.md` §2.4 (Import-and-place flow), §4.6.1 (Paste refinements)
**Constraint:** Pure TypeScript, zero framework/browser/Node/Three.js/MCP imports. Imports from `@easyschemedit/domain` and `@easyschemedit/operations` only.

## Goal

Implement import-and-place flow: drag-drop, ghost preview, ground snap. Pending placement concept — clipboard content placed as ghost preview before committing.

## Files

| File | Action | Content |
|------|--------|---------|
| `packages/operations/src/import-place.ts` | create | `PendingPlacement`, `GhostPreview`, `GroundSnapResult`, `ImportPlaceEngine` class |

## Types / APIs

```ts
export interface PendingPlacement {
  id: string;
  clipboardEntryId: string;
  position: Vec3i;          // current ghost position
  rotationY: 0 | 90 | 180 | 270;
  mirror: 'none' | 'x' | 'z';
  skipAir: boolean;
  overrideAir: boolean;
  isGhost: boolean;         // true = preview only, not committed
}

export interface GhostPreview {
  placementId: string;
  blocks: Array<{ worldPos: Vec3i; state: BlockStateId }>;
  bounds: Bounds3i;
  conflicts: ConflictEntry[]; // from conflict index
}

export interface GroundSnapResult {
  snappedPosition: Vec3i;
  groundY: number;
  snapped: boolean;
}

export class ImportPlaceEngine {
  createPendingPlacement(clipboardEntryId: string, position: Vec3i): PendingPlacement;
  updateGhostPosition(pending: PendingPlacement, position: Vec3i): PendingPlacement;
  applyRotationMirror(pending: PendingPlacement, rotationY: 0 | 90 | 180 | 270, mirror: 'none' | 'x' | 'z'): PendingPlacement;
  snapToGround(pending: PendingPlacement, project: Project): GroundSnapResult;
  generateGhostPreview(pending: PendingPlacement, project: Project): GhostPreview;
  commitPendingPlacement(pending: PendingPlacement, project: Project): Project;
}
```

## Acceptance criteria

1. Pending placement created from clipboard entry with ghost state
2. Ghost preview updates as position/rotation/mirror changes
3. Ground snap finds highest non-air block below each column and snaps to it
4. Commit converts ghost preview to real blocks in project
5. Pending placement is not committed until explicitly committed
6. Rotation/mirror applied at paste time before placement

## Tests

No test file yet — verification via typecheck. Test file `slice-d-7-import-place.test.ts` to be created with test harness.

## Verification

- `pnpm --filter @easyschemedit/operations exec tsc --noEmit` exit code 0
