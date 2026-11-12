# Subspec C — Slice c-1: Crash-safe Commit Protocol

**Source:** `docs/specs/subs/SUBSPEC-C_PROJECT_PERSISTENCE.md` §2.3.2 (Crash-safe commit protocol)
**Constraint:** Pure TypeScript, zero framework/browser/Node/Three.js/MCP imports. Imports from `@easyschemedit/domain` and `@easyschemedit/persistence` (idb-store) only.

## Goal

Implement the crash-safe commit protocol for IndexedDB persistence. The protocol ensures atomic commits with five phases: pending → writing → verifying → committed → failed. Workers never see live data; all writes go through temporary keys that are only promoted to live on successful commit.

## Files

| File | Action | Content |
|------|--------|---------|
| `packages/persistence/src/commit-protocol.ts` | create | `CommitPhase`, `CommitRecord` types; `commitProject()` function implementing the 5-phase protocol |

## Types / APIs

```ts
export type CommitPhase = 'pending' | 'writing' | 'verifying' | 'committed' | 'failed';

export type CommitRecord = {
  transactionId: string;
  projectId: string;
  baseRevision: number;
  targetRevision: number;
  phase: CommitPhase;
  tempKeys: string[];           // temporary IndexedDB keys written
  checksums: Record<string, string>;  // key → SHA-256
  startedAt: number;
  completedAt?: number;
};

export async function commitProject(
  projectId: string,
  baseRevision: number,
  targetRevision: number,
  writes: { key: string; data: ArrayBuffer }[],
  services: { sha256: (data: ArrayBuffer) => Promise<string> }
): Promise<{ ok: true; revision: number } | { ok: false; error: string }>
```

## Protocol

1. **Pending**: Create CommitRecord with phase = 'pending', targetRevision = baseRevision + 1
2. **Writing**: Write all changed data to temporary keys (prefixed `temp_`)
3. **Verifying**: Read back all temporary keys, verify SHA-256 checksums match
4. **Committed**: Atomically update CommitRecord.phase = 'committed', update project's committedRevision, delete temporary keys
5. **Failed**: Set phase = 'failed', retain temporary keys for recovery

## Acceptance criteria

1. CommitRecord has all required fields (transactionId, projectId, baseRevision, targetRevision, phase, tempKeys, checksums, startedAt, completedAt)
2. Five-phase protocol follows correct order: pending → writing → verifying → committed → failed
3. On success: phase = 'committed', project revision = targetRevision, tempKeys deleted
4. On failure: phase = 'failed', tempKeys retained, project revision unchanged
5. No worker sees live data; all writes use temp keys

## Tests

No test file yet — verification via typecheck. Test file `slice-c-1-commit-protocol.test.ts` to be created with test harness.

## Verification

- `pnpm --filter @easyschemedit/persistence exec tsc --noEmit` exit code 0
