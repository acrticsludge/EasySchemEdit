# Subspec F — Slice f-1: Mutation Envelope + Dry-run Result + Confirmation Token

**Source:** `docs/specs/subs/SUBSPEC-F_MCP_ADAPTER.md` §2.2 (Mutation envelope), §2.2.1 (Confirmation token), §2.2.2 (Dry-run result)
**Constraint:** Pure TypeScript, zero framework/browser/Node/Three.js/MCP imports. Imports from `@easyschemedit/domain` via relative paths only.

## Goal

Implement mutation envelope, confirmation token, and dry-run result types for MCP adapter mutation operations.

## Files

| File | Action | Content |
|------|--------|---------|
| `apps/mcp-companion/src/mutation-envelope.ts` | create | `MutationEnvelope`, `ConfirmationToken`, `DryRunResult`, `MutationResult`, `MutationProtocol` types |

## Types / APIs

```ts
export type MutationEnvelope = {
  requestId: string;              // unique request id for idempotency
  projectId: string;              // target project
  expectedRevision: number;       // revision this mutation expects
  operation: string;              // operation type (fill, replace, delete, paste, etc.)
  args: Record<string, unknown>;  // operation-specific arguments
  timestamp: number;              // epoch ms
  dryRun: boolean;                // if true, only preview - don't apply
  confirmationToken?: string;     // required for destructive operations
};

export type ConfirmationToken = {
  token: string;                  // 256-bit random token
  projectId: string;              // bound to project
  revision: number;               // bound to revision
  operation: string;              // bound to operation type
  argsHash: string;               // hash of operation args
  createdAt: number;              // epoch ms
  ttlMs: number;                  // 60000 (60 seconds)
  used: boolean;                  // one-time use
};

export type DryRunResult = {
  requestId: string;
  projectId: string;
  expectedRevision: number;
  wouldChange: number;            // number of cells that would change
  affectedBounds: { min: [number, number, number]; max: [number, number, number] } | null;
  warnings: string[];
  requiresConfirmation: boolean;  // true if destructive
  confirmationToken?: string;     // confirmation token if confirmation required
};

export type MutationResult = {
  requestId: string;
  projectId: string;
  revision: number;               // new revision after mutation
  changedCells: number;           // number of cells actually changed
  applied: boolean;               // true if applied (not dry-run)
  warnings: string[];
};

export type MutationProtocol = {
  createEnvelope(projectId: string, operation: string, args: Record<string, unknown>, expectedRevision: number, dryRun?: boolean): MutationEnvelope;
  createConfirmationToken(projectId: string, revision: number, operation: string, args: Record<string, unknown>): ConfirmationToken;
  validateConfirmationToken(token: string, projectId: string, revision: number, operation: string, args: Record<string, unknown>): boolean;
  isDestructive(operation: string): boolean;
};
```

Key rules:
- Confirmation token: 256-bit random, 60s TTL, one-time use, bound to project + revision + operation + args
- Duplicate requestId returns original result without reapplying (idempotency)
- Idempotency results persisted atomically with successful document commits
- Destructive operations default to dry-run with confirmation token

## Acceptance criteria

1. `MutationEnvelope` has requestId, projectId, expectedRevision, operation, args, timestamp, dryRun, confirmationToken?
2. `ConfirmationToken` has token, projectId, revision, operation, argsHash, createdAt, ttlMs (60000), used
3. `DryRunResult` has requestId, projectId, expectedRevision, wouldChange, affectedBounds?, warnings, requiresConfirmation, confirmationToken?
4. `MutationResult` has requestId, projectId, revision, changedCells, applied, warnings
5. `MutationProtocol` has createEnvelope, createConfirmationToken, validateConfirmationToken, isDestructive
6. Confirmation token TTL is 60000ms (60 seconds)
7. Duplicate requestId returns original result without reapplying
8. Destructive operations require confirmation token

## Tests

No test file yet — type definitions only. Verification via typecheck. Test file `slice-f-1-mutation-envelope.test.ts` to be created with test harness.

## Verification

- TypeScript compiles clean for `apps/mcp-companion`
