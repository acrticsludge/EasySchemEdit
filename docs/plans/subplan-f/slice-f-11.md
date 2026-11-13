# Subspec F — Slice f-11: Failure Handling

**Source:** `docs/specs/subs/SUBSPEC-F_MCP_ADAPTER.md` §4.3 (Block-count limits), §9 (Failure handling table), §10.2 items 8, 12, 19
**Constraint:** Pure TypeScript, zero framework/browser/Node/Three.js/MCP imports.
**Depends on:** slice f-7 (`MCP_LIMITS`, error-code vocabulary), slice f-8 (path error codes).

## Goal

Centralize rejection behaviour so every tool fails the same way: one error-code registry, one mapping from each §9 condition to a machine-readable code plus a suggested action, and the §4.3 budget arithmetic (candidate cells, changed cells, runtime, memory) in one place instead of at each call site.

## Files

| File | Action | Content |
|------|------|---------|
| `apps/mcp-companion/src/failure-handling.ts` | create | `makeMcpError`, `classifyFailure`, `checkBudgets`, `estimateUndoBytes`, code registry constants |
| `apps/mcp-companion/__tests__/slice-f-11-failure-handling.test.ts` | create | One assertion group per SPEC-F §9 row + §4.3 budget arithmetic |
| `apps/mcp-companion/src/index.ts` | update | re-export the failure surface |

## Types / APIs

```ts
export const MCP_ERROR_CODES = {
  STALE_REVISION, IDEMPOTENCY_ARGS_MISMATCH, TOKEN_EXPIRED, TOKEN_INVALID,
  TOKEN_ALREADY_USED, TOKEN_REVISION_MISMATCH, PROJECT_MISMATCH, DRY_RUN_REQUIRED,
  OVER_LIMIT, LOCKED_PLACEMENT, PATH_TRAVERSAL, DNS_REBINDING, DOCUMENT_UNAVAILABLE,
  INVALID_PAIRING_TOKEN, VALIDATION_FAILED, EXECUTION_FAILED, WORKER_CRASH,
  BROWSER_DISCONNECTED, CANCELLED,
} as const;

export type McpError = {
  code: string;                 // stable, from the registry
  message: string;
  currentRevision?: number;
  suggestedAction?: string;
  details?: Record<string, unknown>;
};

export type BudgetInput = {
  candidateCells: number;
  changedCells: number;
  estimatedRuntimeMs: number;
  estimatedMemoryBytes: number;
};

export type BudgetDecision = {
  ok: boolean;
  error?: McpError;
  /** Which budget tripped, when one did. */
  exceeded?: 'maxCandidateCells' | 'maxChangedCells' | 'configurableChangedLimit'
           | 'absoluteSafetyLimit' | 'maxRuntimeMs' | 'maxMemoryBytes';
  /** True when an explicit limit increase would legitimately unblock the operation. */
  overridable: boolean;
};

export function checkBudgets(input: BudgetInput, options?: { allowLimitIncrease?: boolean }): BudgetDecision;
export function estimateUndoBytes(changedCells: number, bytesPerCell?: number): number;
export function classifyFailure(condition: FailureCondition): McpError;
export function makeMcpError(code: string, message: string, extra?: Partial<McpError>): McpError;

export type FailureCondition =
  | 'invalid_pairing_token' | 'stale_revision' | 'expired_confirmation_token'
  | 'duplicate_request_id_args_mismatch' | 'over_limit' | 'locked_placement'
  | 'path_traversal' | 'dns_rebinding' | 'worker_crash' | 'browser_disconnect'
  | 'document_unavailable' | 'cancelled' | 'malformed_input';
```

Key rules:

- One code per §9 row; the taxonomy is closed, so a new condition needs a deliberate registry edit.
- Budgets are checked in severity order (candidate → absolute → default → configurable → runtime → memory) so the most fundamental refusal is reported first, and the exception names the budget.
- `overridable` is false for the absolute safety limit, the candidate limit, runtime and memory; an explicit limit increase only lifts the default and configurable changed-cell limits (§4.3).
- `locked_placement` lists the offending placements in `details.lockedPlacements` and `details.lockedCount`.
- A worker crash discards the partial result and leaves the main thread unchanged — represented as an error that carries no revision change.
- `estimateUndoBytes` gives the §2.3 `estimatedUndoBytes` field a single definition (default 32 bytes per changed cell: position + before/after state).

## Acceptance criteria

1. §9 rows map 1:1 to a stable error code; an unknown condition falls back to `VALIDATION_FAILED`.
2. Stale revision error carries `currentRevision` and a suggested action.
3. Duplicate `requestId` with different args ⇒ `IDEMPOTENCY_ARGS_MISMATCH`.
4. Over-limit ⇒ `OVER_LIMIT` naming the exceeded budget, with `MCP_LIMITS` values quoted in the message.
5. Locked placement ⇒ `LOCKED_PLACEMENT` plus the locked placement ids and a count.
6. Path traversal and DNS rebinding ⇒ their own codes, both described as security refusals.
7. §4.3 limits: 250,000 default changed, 1,000,000 configurable, 5,000,000 absolute, 1,000,000 candidate, 5,000 ms, 256 MiB.
8. An explicit limit increase lifts only the default/configurable changed-cell budgets; the absolute limit, candidate limit, runtime and memory stay binding.
9. `estimateUndoBytes` is deterministic and monotonic in changed cell count.
10. Malformed input ⇒ `VALIDATION_FAILED`; a worker crash ⇒ `WORKER_CRASH` with no revision change.

## Tests

`apps/mcp-companion/__tests__/slice-f-11-failure-handling.test.ts`

```
cd apps/mcp-companion
node --experimental-strip-types __tests__/slice-f-11-failure-handling.test.ts
```

## Verification

- `node <typescript@5.9.3>/bin/tsc --noEmit` for `apps/mcp-companion`: exit 0
- Test command above: exit 0
