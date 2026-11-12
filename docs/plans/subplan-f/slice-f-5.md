# Subspec F — Slice f-5: MCP Clipboard Operations

**Source:** `docs/specs/subs/SUBSPEC-F_MCP_ADAPTER.md` §2.3 (MCP tool surface: clipboard operations)
**Constraint:** Pure TypeScript, zero framework/browser/Node/Three.js/MCP imports. Imports from `@easyschemedit/domain` via relative paths only.

## Goal

Implement clipboard operation types: ClipboardTool, ClipboardToolResult, ClipboardToolError, ClipboardTools. These are pure type definitions for clipboard operations: copy, cut, paste.

## Files

| File | Action | Content |
|------|--------|---------|
| `apps/mcp-companion/src/tools/clipboard.ts` | create | `ClipboardTool`, `ClipboardToolResult`, `ClipboardToolError`, `ClipboardTools` types |

## Types / APIs

```ts
export type ClipboardTool =
  | 'copy'
  | 'cut'
  | 'paste';

export type ClipboardToolResult<T = unknown> = {
  requestId: string;
  projectId: string;
  success: boolean;
  data: T;
  revision: number;
  changedCells: number;
  affectedBounds: { min: [number, number, number]; max: [number, number, number] };
  warnings: string[];
  error?: ClipboardToolError;
};

export type ClipboardToolError = {
  code: string;
  message: string;
  placementId?: string;
  projectId?: string;
};

export type CopyResult = {
  projectId: string;
  clipboardId: string;
  blockCount: number;
  bounds: { min: [number, number, number]; max: [number, number, number] };
};

export type CutResult = {
  projectId: string;
  clipboardId: string;
  blockCount: number;
  bounds: { min: [number, number, number]; max: [number, number, number] };
  removedBlocks: number;
};

export type PasteResult = {
  projectId: string;
  clipboardId: string;
  targetPosition: [number, number, number];
  changedCells: number;
  affectedBounds: { min: [number, number, number]; max: [number, number, number] };
};
```

Key rules:
- Copy: copies effective composite blocks from selection to clipboard
- Cut: copies and removes source blocks from placements
- Paste: pastes clipboard content at target position with paste refinements

## Acceptance criteria

1. `ClipboardTool` is discriminated union of copy, cut, paste
2. `ClipboardToolResult` has requestId, projectId, success, data, revision, changedCells, affectedBounds, warnings, error?
3. `ClipboardToolError` has code, message, placementId?, projectId?
4. `CopyResult` has projectId, clipboardId, blockCount, bounds
5. `CutResult` has projectId, clipboardId, blockCount, bounds, removedBlocks
6. `PasteResult` has projectId, clipboardId, targetPosition, changedCells, affectedBounds

## Tests

No test file yet — type definitions only. Verification via typecheck. Test file `slice-f-5-clipboard.test.ts` to be created with test harness.

## Verification

- TypeScript compiles clean for `apps/mcp-companion`
