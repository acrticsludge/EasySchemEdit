# Subspec C — Slice c-4: History with Undo/Redo Stack

**Source:** `docs/specs/subs/SUBSPEC-C_PROJECT_PERSISTENCE.md` §4.4 (History), §2.3.6 (History)
**Constraint:** Pure TypeScript, zero framework/browser/Node/Three.js/MCP imports. Imports from `@easyschemedit/domain` and `@easyschemedit/persistence` only.

## Goal

Implement undo/redo history stack with entry recording, undo/redo operations, stack limits, and redo-clearing on new edit.

## Files

| File | Action | Content |
|------|--------|---------|
| `packages/persistence/src/history.ts` | create | `HistoryEntry`, `HistoryStack` types; `HistoryManager` class with record/undo/redo/clear |

## Types / APIs

```ts
export type HistoryEntryType = 'edit' | 'paste' | 'delete' | 'move' | 'transform';

export interface HistoryEntry {
  id: string;
  type: HistoryEntryType;
  projectId: string;
  timestamp: number;
  beforeRevision: number;
  afterRevision: number;
  data: unknown;           // serialized before/after state or delta
}

export class HistoryManager {
  constructor(projectId: string, maxEntries: number);
  record(entry: HistoryEntry): void;        // push to undo, clear redo
  undo(): HistoryEntry | null;              // pop undo, push redo
  redo(): HistoryEntry | null;              // pop redo, push undo
  canUndo(): boolean;
  canRedo(): boolean;
  clear(): void;                            // clear both stacks
  getStack(): HistoryEntry[];               // current undo stack (most recent last)
}
```

## Acceptance criteria

1. record() pushes entry to undo stack, clears redo stack
2. undo() pops from undo stack, pushes to redo stack, returns entry
3. redo() pops from redo stack, pushes to undo stack, returns entry
4. canUndo() returns true when undo stack non-empty
5. canRedo() returns true when redo stack non-empty
6. Stack limit enforced: when exceeding maxEntries, oldest entries dropped
7. clear() empties both stacks

## Tests

No test file yet — verification via typecheck. Test file `slice-c-4-history.test.ts` to be created with test harness.

## Verification

- `pnpm --filter @easyschemedit/persistence exec tsc --noEmit` exit code 0
