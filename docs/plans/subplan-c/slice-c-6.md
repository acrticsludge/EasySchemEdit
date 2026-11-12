# Subspec C — Slice c-6: Recovery — Crash Restore from Journal

**Source:** `docs/specs/subs/SUBSPEC-C_PROJECT_PERSISTENCE.md` §4.6 (Recovery), §2.3.8 (Recovery)
**Constraint:** Pure TypeScript, zero framework/browser/Node/Three.js/MCP imports. Imports from `@easyschemedit/persistence` only.

## Goal

Implement crash recovery: scan for uncommitted CommitRecord entries on startup, attempt recovery from temporary keys, offer previous committed revision if recovery fails.

## Files

| File | Action | Content |
|------|--------|---------|
| `packages/persistence/src/recovery.ts` | create | `RecoveryResult`, `UncommittedCommit`, `RecoveryManager` types + functions |

## Types / APIs

```ts
export interface UncommittedCommit {
  transactionId: string;
  projectId: string;
  phase: 'pending' | 'writing' | 'verifying' | 'failed';
  tempKeys: string[];
  startedAt: number;
}

export interface RecoveryResult {
  recovered: boolean;
  projectId: string;
  revision: number;
  data?: unknown;
  error?: string;
}

export class RecoveryManager {
  constructor(db: IDBDatabase);
  scanUncommitted(): Promise<UncommittedCommit[]>;
  recover(projectId: string): Promise<RecoveryResult>;
}
```

## Acceptance criteria

1. scanUncommitted() returns all CommitRecord entries with phase != 'committed'
2. recover() attempts to restore from temp keys for a given project
3. If recovery succeeds: returns recovered data with revision
4. If recovery fails: returns error, preserves last committed revision
5. Temp keys cleaned up after successful recovery

## Tests

No test file yet — verification via typecheck. Test file `slice-c-6-recovery.test.ts` to be created with test harness.

## Verification

- `pnpm --filter @easyschemedit/persistence exec tsc --noEmit` exit code 0
