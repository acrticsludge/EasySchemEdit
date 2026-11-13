# Subspec F — Slice f-6: MCP History/Export Tools

**Source:** `docs/specs/subs/SUBSPEC-F_MCP_ADAPTER.md` §2.3 (MCP tool surface: history/export tools)
**Constraint:** Pure TypeScript, zero framework/browser/Node/Three.js/MCP imports. Imports from `@easyschemedit/domain` via relative paths only.

## Goal

Implement history/export tool types: HistoryTool, HistoryToolResult, HistoryToolError, HistoryTools. These are pure type definitions for history/export MCP tools: undo, redo, export_schematic, get_operation_diff, set_color_mode.

## Files

| File | Action | Content |
|------|--------|---------|
| `apps/mcp-companion/src/tools/history.ts` | create | `HistoryTool`, `HistoryToolResult`, `HistoryToolError`, `HistoryTools` types |

## Types / APIs

```ts
export type HistoryTool =
  | 'undo'
  | 'redo'
  | 'export_schematic'
  | 'get_operation_diff'
  | 'set_color_mode';

export type HistoryToolResult<T = unknown> = {
  requestId: string;
  projectId: string;
  success: boolean;
  data: T;
  revision: number;
  changedPlacements: string[];
  warnings: string[];
  error?: HistoryToolError;
};

export type HistoryToolError = {
  code: string;
  message: string;
  placementId?: string;
  projectId?: string;
  currentRevision?: number;
};

export type UndoResult = {
  projectId: string;
  revision: number;
  changedPlacements: string[];
  changedCells: number;
};

export type RedoResult = {
  projectId: string;
  revision: number;
  changedPlacements: string[];
  changedCells: number;
};

export type ExportSchematicResult = {
  projectId: string;
  archiveId: string;
  revision: number;
  filename: string;
  format: '.vxproj' | '.litematic' | '.schematic';
  checksums: Record<string, string>;
};

export type GetOperationDiffResult = {
  projectId: string;
  fromRevision: number;
  toRevision: number;
  changedPlacements: string[];
  changedCells: number;
  blockChanges: Array<{
    position: [number, number, number];
    fromState?: { id: string; props: Record<string, string> };
    toState?: { id: string; props: Record<string, string> };
  }>;
};

export type SetColorModeResult = {
  projectId: string;
  revision: number;
  mode: 'off' | 'conflicts' | 'full';
};
```

Key rules:
- Undo: reverses last committed operation
- Redo: re-applies last undone operation
- Export schematic: exports project to .vxproj/.litematic/.schematic format
- Get operation diff: computes diff between two revisions
- Set color mode: sets conflict overlay mode ('off' | 'conflicts' | 'full')

## Acceptance criteria

1. `HistoryTool` is discriminated union of undo, redo, export_schematic, get_operation_diff, set_color_mode
2. `HistoryToolResult` has requestId, projectId, success, data, revision, changedPlacements, warnings, error?
3. `HistoryToolError` has code, message, placementId?, projectId?, currentRevision?
4. `UndoResult` has projectId, revision, changedPlacements, changedCells
5. `RedoResult` has projectId, revision, changedPlacements, changedCells
6. `ExportSchematicResult` has projectId, archiveId, revision, filename, format, checksums
7. `GetOperationDiffResult` has projectId, fromRevision, toRevision, changedPlacements, changedCells, blockChanges
8. `SetColorModeResult` has projectId, revision, mode

## Tests

No test file yet — type definitions only. Verification via typecheck. Test file `slice-f-6-history.test.ts` to be created with test harness.

## Verification

- TypeScript compiles clean for `apps/mcp-companion`
