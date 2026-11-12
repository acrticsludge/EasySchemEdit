# Subspec D — Slice d-5: Conflict Detection

**Source:** `docs/specs/subs/SUBSPEC-D_EDITING_ENGINE.md` §5.5 (Conflict detection), §5.6 (Owner resolution), §2.4 (Region operation targeting)
**Constraint:** Pure TypeScript, zero framework/browser/Node/Three.js/MCP imports. Imports from `@easyschemedit/domain` and `@easyschemedit/operations` only.

## Goal

Implement conflict detection: spatial index for tracking block ownership per position, owner resolution, 3 conflict categories (clean, same-state, state-conflict), no fourth status.

## Files

| File | Action | Content |
|------|--------|---------|
| `packages/operations/src/conflict-index.ts` | create | `ConflictCategory`, `ConflictEntry`, `ConflictResult`, `ConflictIndex` class |

## Types / APIs

```ts
export type ConflictCategory = 'clean' | 'same-state' | 'state-conflict';

export interface ConflictEntry {
  position: Vec3i;           // world block coordinate
  category: ConflictCategory;
  owners: string[];          // placement IDs claiming this position
  winningOwner: string | null;
  currentState: BlockStateId | null;
  proposedState: BlockStateId | null;
}

export interface ConflictResult {
  category: ConflictCategory;
  entries: ConflictEntry[];
  hasConflicts: boolean;
  cleanPositions: Vec3i[];
  sameStatePositions: Vec3i[];
  stateConflictPositions: Vec3i[];
}

export class ConflictIndex {
  // Register a placement's blocks in the index
  registerPlacement(placement: Placement): void;
  // Remove a placement from the index
  unregisterPlacement(placementId: string): void;
  // Check conflicts for a proposed operation
  detectConflicts(project: Project, bounds: Bounds3i, proposedState: BlockStateId): ConflictResult;
  // Incremental invalidation for affected chunks
  invalidateChunks(chunkKeys: string[]): void;
}
```

## Acceptance criteria

1. `ConflictCategory` is exactly 'clean' | 'same-state' | 'state-conflict' (no fourth status)
2. ConflictEntry has position, category, owners, winningOwner, currentState, proposedState
3. `clean`: no existing block at position or proposed state matches current state
4. `same-state`: existing block exists and proposed state equals current state
5. `state-conflict`: existing block exists and proposed state differs from current state
6. Owner resolution: top-wins precedence determines winningOwner
7. Incremental invalidation: only affected chunks re-indexed, not full bounding box scan
8. Negative-coordinate indexing supported

## Tests

No test file yet — verification via typecheck. Test file `slice-d-5-conflict-index.test.ts` to be created with test harness.

## Verification

- `pnpm --filter @easyschemedit/operations exec tsc --noEmit` exit code 0
