# Subspec D — Slice d-12: Group Transforms

**Source:** `docs/specs/subs/SUBSPEC-D_EDITING_ENGINE.md` §2.4 (Group transforms), §4.2 (Transform composition)
**Constraint:** Pure TypeScript, zero framework/browser/Node/Three.js/MCP imports. Imports from `@easyschemedit/domain` and `@easyschemedit/operations` only.

## Goal

Implement group transforms: pivot around point, rotation/mirror composition, ancillary data transformation. Group pivot allows rotating/mirroring multiple placements around a shared pivot point.

## Files

| File | Action | Content |
|------|--------|---------|
| `packages/operations/src/group-transforms.ts` | create | `GroupTransformOptions`, `GroupTransformResult`, `GroupTransformEngine` class |

## Types / APIs

```ts
export interface GroupTransformOptions {
  placementIds: string[];       // placements in the group
  pivot: Vec3Half;              // pivot point in world coordinates (doubled units)
  rotationY: 0 | 90 | 180 | 270;
  mirror: 'none' | 'x' | 'z';
  transformAncillary: boolean;  // whether to transform block entities/entities/biomes/ticks
}

export interface GroupTransformResult {
  success: boolean;
  changedPlacements: string[];
  pivot: Vec3Half;
  rotationY: 0 | 90 | 180 | 270;
  mirror: 'none' | 'x' | 'z';
  warnings: string[];
}

export class GroupTransformEngine {
  rotateGroup(project: Project, options: GroupTransformOptions): GroupTransformResult;
  mirrorGroup(project: Project, options: GroupTransformOptions): GroupTransformResult;
  composeTransforms(t1: Transform, t2: Transform): Transform;  // rotation/mirror composition
}
```

## Acceptance criteria

1. Group transform applies rotation/mirror around pivot to all placements in group
2. Pivot point is shared across all placements
3. Rotation/mirror composition is bijective (applying transform twice returns original for 180°)
4. Stair/hinge chirality: mirror swaps left/right, rotation does not change stair shape
5. Ancillary data (block entities, entities, biomes, ticks) transformed when enabled
6. Locked placements in group are skipped with warning

## Tests

No test file yet — verification via typecheck. Test file `slice-d-12-group-transforms.test.ts` to be created with test harness.

## Verification

- `pnpm --filter @easyschemedit/operations exec tsc --noEmit` exit code 0
