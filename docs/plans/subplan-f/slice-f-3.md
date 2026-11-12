# Subspec F — Slice f-3: MCP Read Tools

**Source:** `docs/specs/subs/SUBSPEC-F_MCP_ADAPTER.md` §2.3 (MCP tool surface: read tools)
**Constraint:** Pure TypeScript, zero framework/browser/Node/Three.js/MCP imports. Imports from `@easyschemedit/domain` via relative paths only.

## Goal

Implement MCP read tool types: ReadTool, ReadToolResult, ReadToolError, ReadTools. These are pure type definitions for read-only MCP tools: list_projects, open_project, get_project_info, list_placements, get_placement, get_origin, detect_conflicts, get_conflict_map, get_material_list, get_selection, get_color_mode, get_history, get_diagnostics.

## Files

| File | Action | Content |
|------|--------|---------|
| `apps/mcp-companion/src/tools/read.ts` | create | `ReadTool`, `ReadToolResult`, `ReadToolError`, `ReadTools` types |

## Types / APIs

```ts
export type ReadTool =
  | 'list_projects'
  | 'open_project'
  | 'get_project_info'
  | 'list_placements'
  | 'get_placement'
  | 'get_origin'
  | 'detect_conflicts'
  | 'get_conflict_map'
  | 'get_material_list'
  | 'get_selection'
  | 'get_color_mode'
  | 'get_history'
  | 'get_diagnostics';

export type ReadToolResult<T = unknown> = {
  requestId: string;
  projectId: string;
  success: boolean;
  data: T;
  revision: number;
  warnings: string[];
  error?: ReadToolError;
};

export type ReadToolError = {
  code: string;
  message: string;
  projectId?: string;
  expectedRevision?: number;
  currentRevision?: number;
};

export type ListProjectsResult = {
  projects: Array<{
    projectId: string;
    name: string;
    revision: number;
    placementCount: number;
    locked: boolean;
  }>;
};

export type OpenProjectResult = {
  projectId: string;
  name: string;
  revision: number;
  createdAt: string;
  modifiedAt: string;
  placementCount: number;
  overlapPolicy: 'top-wins' | 'bottom-wins';
};

export type GetProjectInfoResult = {
  projectId: string;
  name: string;
  revision: number;
  createdAt: string;
  modifiedAt: string;
  placementCount: number;
  importGroupCount: number;
  overlapPolicy: 'top-wins' | 'bottom-wins';
  metadata: { author?: string; createdAt: string; modifiedAt: string };
};

export type ListPlacementsResult = {
  placements: Array<{
    id: string;
    name: string;
    revision: number;
    visible: boolean;
    locked: boolean;
    blockCount: number;
    ancillaryCount: number;
  }>;
};

export type GetPlacementResult = {
  placementId: string;
  name: string;
  revision: number;
  transform: {
    translation: [number, number, number];
    rotationY: 0 | 90 | 180 | 270;
    mirror: 'none' | 'x' | 'z';
  };
  origin: [number, number, number];
  volume: {
    bounds: { min: [number, number, number]; max: [number, number, number] };
    chunkCount: number;
    nonAirCount: number;
  };
  visible: boolean;
  locked: boolean;
  ancillary: {
    blockEntityCount: number;
    entityCount: number;
    biomeCount: number;
    tickCount: number;
  };
};

export type GetOriginResult = {
  placementId: string;
  origin: [number, number, number];
  revision: number;
};

export type DetectConflictsResult = {
  projectId: string;
  revision: number;
  conflicts: Array<{
    position: [number, number, number];
    category: 'clean' | 'same-state' | 'state-conflict';
    owners: string[];
    currentState?: { id: string; props: Record<string, string> };
  }>;
  conflictCount: number;
};

export type GetConflictMapResult = {
  projectId: string;
  revision: number;
  conflictMap: Array<{
    position: [number, number, number];
    owner: string;
    state: string;
  }>;
};

export type GetMaterialListResult = {
  projectId: string;
  revision: number;
  materials: Array<{
    blockId: string;
    count: number;
    percentage: number;
  }>;
};

export type GetSelectionResult = {
  projectId: string;
  type: 'placement' | 'cuboid';
  placementIds?: string[];
  bounds?: { min: [number, number, number]; max: [number, number, number] };
};

export type GetColorModeResult = {
  projectId: string;
  mode: 'off' | 'conflicts' | 'full';
};

export type GetHistoryResult = {
  projectId: string;
  revision: number;
  history: Array<{
    revision: number;
    timestamp: string;
    operation: string;
    changedBlocks: number;
  }>;
};

export type GetDiagnosticsResult = {
  projectId: string;
  revision: number;
  warnings: string[];
  errors: string[];
};
```

## Acceptance criteria

1. `ReadTool` is a discriminated union of all read tool names
2. `ReadToolResult` has requestId, projectId, success, data, revision, warnings, error?
3. `ReadToolError` has code, message, projectId?, expectedRevision?, currentRevision?
4. `ListProjectsResult` returns projects with id, name, revision, placementCount, locked
5. `OpenProjectResult` returns project details including overlapPolicy
6. `GetProjectInfoResult` returns project metadata including importGroupCount
7. `ListPlacementsResult` returns placements with id, name, revision, visible, locked, blockCount, ancillaryCount
8. `GetPlacementResult` returns full placement details including transform, origin, volume, ancillary
9. `GetOriginResult` returns placementId, origin, revision
10. `DetectConflictsResult` returns conflicts with position, category, owners, currentState
11. `GetConflictMapResult` returns conflict map with position, owner, state
12. `GetMaterialListResult` returns materials with blockId, count, percentage
13. `GetSelectionResult` returns selection type, placementIds or bounds
14. `GetColorModeResult` returns mode ('off' | 'conflicts' | 'full')
15. `GetHistoryResult` returns history entries with revision, timestamp, operation, changedBlocks
16. `GetDiagnosticsResult` returns projectId, revision, warnings, errors

## Tests

No test file yet — type definitions only. Verification via typecheck. Test file `slice-f-3-read.test.ts` to be created with test harness.

## Verification

- TypeScript compiles clean for `apps/mcp-companion`
