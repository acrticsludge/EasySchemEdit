# Subspec F — Slice f-4: MCP Placement Tools

**Source:** `docs/specs/subs/SUBSPEC-F_MCP_ADAPTER.md` §2.3 (MCP tool surface: placement tools)
**Constraint:** Pure TypeScript, zero framework/browser/Node/Three.js/MCP imports. Imports from `@easyschemedit/domain` via relative paths only.

## Goal

Implement placement tool types: PlacementTool, PlacementToolResult, PlacementToolError, PlacementTools. These are pure type definitions for placement operations: load_schematic, transform_placement, transform_placements, set_placement_visibility, set_placement_lock, rename_placement, delete_placement, duplicate_placement, set_origin, bake_placements.

## Files

| File | Action | Content |
|------|--------|---------|
| `apps/mcp-companion/src/tools/placement.ts` | create | `PlacementTool`, `PlacementToolResult`, `PlacementToolError`, `PlacementTools` types |

## Types / APIs

```ts
export type PlacementTool =
  | 'load_schematic'
  | 'transform_placement'
  | 'transform_placements'
  | 'set_placement_visibility'
  | 'set_placement_lock'
  | 'rename_placement'
  | 'delete_placement'
  | 'duplicate_placement'
  | 'set_origin'
  | 'bake_placements';

export type PlacementToolResult<T = unknown> = {
  requestId: string;
  projectId: string;
  success: boolean;
  data: T;
  revision: number;
  changedPlacements: string[];
  warnings: string[];
  error?: PlacementToolError;
};

export type PlacementToolError = {
  code: string;
  message: string;
  placementId?: string;
  projectId?: string;
};

export type LoadSchematicResult = {
  projectId: string;
  placementId: string;
  name: string;
  revision: number;
  blockCount: number;
};

export type TransformPlacementResult = {
  placementId: string;
  revision: number;
  transform: {
    translation: [number, number, number];
    rotationY: 0 | 90 | 180 | 270;
    mirror: 'none' | 'x' | 'z';
  };
};

export type TransformPlacementsResult = {
  projectId: string;
  transform: {
    translation: [number, number, number];
    rotationY: 0 | 90 | 180 | 270;
    mirror: 'none' | 'x' | 'z';
  };
  changedPlacements: string[];
};

export type SetPlacementVisibilityResult = {
  placementId: string;
  revision: number;
  visible: boolean;
};

export type SetPlacementLockResult = {
  placementId: string;
  revision: number;
  locked: boolean;
};

export type RenamePlacementResult = {
  placementId: string;
  revision: number;
  oldName: string;
  newName: string;
};

export type DeletePlacementResult = {
  placementId: string;
  revision: number;
};

export type DuplicatePlacementResult = {
  projectId: string;
  placementId: string;
  newPlacementId: string;
  revision: number;
};

export type SetOriginResult = {
  placementId: string;
  revision: number;
  origin: [number, number, number];
};

export type BakePlacementsResult = {
  projectId: string;
  newPlacementId: string;
  revision: number;
  changedCells: number;
};
```

Key rules:
- Load schematic creates a new placement from imported .schematic/.litematic/.vxproj
- Transform placement applies rotation/mirror/translation around pivot
- Transform placements applies same transform to multiple placements
- Set visibility toggles visible flag
- Set lock toggles locked flag
- Rename changes placement name
- Delete removes placement from project
- Duplicate creates copy with new ID
- Set origin changes placement origin
- Bake merges overlapping placements into effective composite

## Acceptance criteria

1. `PlacementTool` is discriminated union of 9 tool names
2. `PlacementToolResult` has requestId, projectId, success, data, revision, changedPlacements, warnings, error?
3. `PlacementToolError` has code, message, placementId?, projectId?
4. `LoadSchematicResult` has projectId, placementId, name, revision, blockCount
5. `TransformPlacementResult` has placementId, revision, transform
6. `TransformPlacementsResult` has projectId, transform, changedPlacements
7. `SetPlacementVisibilityResult` has placementId, revision, visible
8. `SetPlacementLockResult` has placementId, revision, locked
9. `RenamePlacementResult` has placementId, revision, oldName, newName
10. `DeletePlacementResult` has placementId, revision
11. `DuplicatePlacementResult` has projectId, placementId, newPlacementId, revision
12. `SetOriginResult` has placementId, revision, origin
13. `BakePlacementsResult` has projectId, newPlacementId, revision, changedCells

## Tests

No test file yet — type definitions only. Verification via typecheck. Test file `slice-f-4-placement.test.ts` to be created with test harness.

## Verification

- TypeScript compiles clean for `apps/mcp-companion`
