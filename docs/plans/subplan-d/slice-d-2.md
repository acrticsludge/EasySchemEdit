# Subspec D — Slice d-2: Region Operations Core

**Source:** `docs/specs/subs/SUBSPEC-D_EDITING_ENGINE.md` §2.4 (Region operations), §4.2 (Source placements mode), §4.3 (New result placement mode), §5.8 (Ancillary data behavior per region operation)
**Constraint:** Pure TypeScript, zero framework/browser/Node/Three.js/MCP imports. Imports from `@easyschemedit/domain` and `@easyschemedit/operations` only.

## Goal

Implement region operations core: fill, replace, delete, hollow, walls. Each operation takes a target cuboid and applies it to editable placements intersecting that cuboid (source placements mode). Returns a RegionOperationResult with candidate/changed cells, non-air count, runtime/memory estimates, warnings, and blockedByLock flag.

## Files

| File | Action | Content |
|------|--------|---------|
| `packages/operations/src/region-ops.ts` | create | `RegionOperation` type union, `RegionOperationResult`, `BlockStateMatcher`, `RegionOperationEngine` class with apply() method |

## Types / APIs

```ts
export type BlockStateMatcher = {
  mode: 'exact' | 'block-id-only' | 'block-id-and-properties';
  blockId?: string;
  properties?: Record<string, string>;
};

export type FillOperation = { kind: 'fill'; state: BlockStateId };
export type ReplaceOperation = { kind: 'replace'; matcher: BlockStateMatcher; replacement: BlockStateId; preserveProperties: boolean };
export type DeleteOperation = { kind: 'delete'; removeBlockEntities?: boolean; removeEntities?: boolean };
export type HollowOperation = { kind: 'hollow'; shellThickness?: number };
export type WallsOperation = { kind: 'walls'; includeTop: boolean; includeBottom: boolean; wallBlock: BlockStateId; fillInterior: BlockStateId | null };

export type RegionOperation = FillOperation | ReplaceOperation | DeleteOperation | HollowOperation | WallsOperation;

export interface RegionOperationResult {
  candidateCells: number;
  changedCells: number;
  resultingNonAirCount: number;
  runtimeEstimateMs: number;
  memoryEstimateBytes: number;
  warnings: string[];
  blockedByLock: boolean;
  perPlacementChanges: Record<string, { changedCells: number; nonAirCount: number }>;
}

export class RegionOperationEngine {
  apply(project: Project, operation: RegionOperation, bounds: Bounds3i, options?: RegionOperationOptions): RegionOperationResult;
}
```

## Acceptance criteria

1. `RegionOperation` union type covers fill, replace, delete, hollow, walls
2. `BlockStateMatcher` supports exact / block-id-only / block-id-and-properties modes
3. `preserveProperties` keeps compatible properties when swapping block ID in replace
4. Fill sets target state in all editable placements intersecting bounds
5. Delete removes blocks (and optionally block entities/entities)
6. Hollow keeps only shell cells (interior set to air)
7. Walls sets wall blocks on boundary planes, optionally fills interior
8. Locked placements are not modified; blockedByLock = true if any locked placement in target
9. Result includes candidateCells, changedCells, resultingNonAirCount, runtimeEstimateMs, memoryEstimateBytes, warnings, blockedByLock, perPlacementChanges
10. Source placements mode: operation applied independently to each intersecting placement
11. Positions outside every placement's bounds remain untouched

## Tests

No test file yet — verification via typecheck. Test file `slice-d-2-region-ops.test.ts` to be created with test harness.

## Verification

- `pnpm --filter @easyschemedit/operations exec tsc --noEmit` exit code 0
