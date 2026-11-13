// apps/mcp-companion/src/failure-handling.ts
// Centralized failure handling: one error-code registry, one mapping for every SUBSPEC-F §9
// condition, and the §4.3 budget arithmetic in one place (SUBSPEC-F §4.3, §9, §10.2 items 8/12/19).
// Pure TypeScript, zero framework/browser/Node/Three.js/MCP imports.
//
// Why a registry: §9 lists the failure conditions an agent will actually hit. Keeping them in one
// closed taxonomy stops each tool from inventing its own code and message for the same condition.
//
// Budget note: `MCP_LIMITS` is re-declared here as a type-only view of the slice f-7 constant.
// The VALUES come from destructive-protocol's MCP_LIMITS via a literal duplication that the test
// asserts in lockstep, because a value import of './destructive-protocol.ts' inside `src/` fails
// TS5097 under this package's tsconfig (allowImportingTsExtensions is unset, so only type-only
// `.ts` specifiers are elided). See slice f-10 for the same constraint.

// ============================================================================
// ErrorCode registry (SPEC-F §9 + the f-7/f-8 code vocabulary)
// ============================================================================

export const MCP_ERROR_CODES = {
  INVALID_PAIRING_TOKEN: 'INVALID_PAIRING_TOKEN',
  STALE_REVISION: 'STALE_REVISION',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  TOKEN_INVALID: 'TOKEN_INVALID',
  TOKEN_ALREADY_USED: 'TOKEN_ALREADY_USED',
  TOKEN_REVISION_MISMATCH: 'TOKEN_REVISION_MISMATCH',
  PROJECT_MISMATCH: 'PROJECT_MISMATCH',
  DRY_RUN_REQUIRED: 'DRY_RUN_REQUIRED',
  IDEMPOTENCY_ARGS_MISMATCH: 'IDEMPOTENCY_ARGS_MISMATCH',
  OVER_LIMIT: 'OVER_LIMIT',
  LOCKED_PLACEMENT: 'LOCKED_PLACEMENT',
  PATH_TRAVERSAL: 'PATH_TRAVERSAL',
  DNS_REBINDING: 'DNS_REBINDING',
  DOCUMENT_UNAVAILABLE: 'DOCUMENT_UNAVAILABLE',
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  EXECUTION_FAILED: 'EXECUTION_FAILED',
  WORKER_CRASH: 'WORKER_CRASH',
  BROWSER_DISCONNECTED: 'BROWSER_DISCONNECTED',
  CANCELLED: 'CANCELLED',
} as const;

export type McpErrorCode = (typeof MCP_ERROR_CODES)[keyof typeof MCP_ERROR_CODES];

export type McpError = {
  code: string;
  message: string;
  currentRevision?: number;
  suggestedAction?: string;
  details?: Record<string, unknown>;
};

/** SPEC-F §4.3 block-count limits, mirroring slice f-7 `MCP_LIMITS` (asserted in lockstep). */
export const LIMITS = {
  maxCandidateCells: 1_000_000,
  maxChangedCells: 250_000,
  maxRuntimeMs: 5_000,
  maxMemoryBytes: 256 * 1024 * 1024,
  configurableChangedLimit: 1_000_000,
  absoluteSafetyLimit: 5_000_000,
} as const;

/** Undo record size: position (3 ints) + previous and next block states. */
export const BYTES_PER_CHANGED_CELL = 32;

// ============================================================================
// Error construction
// ============================================================================

export function makeMcpError(
  code: string,
  message: string,
  extra?: Partial<McpError>,
): McpError {
  return { code, message, ...extra };
}

// ============================================================================
// §9 condition → error mapping
// ============================================================================

export type FailureCondition =
  | 'invalid_pairing_token'
  | 'invalid_confirmation_token'
  | 'confirmation_token_already_used'
  | 'confirmation_token_revision_mismatch'
  | 'project_mismatch'
  | 'dry_run_required'
  | 'execution_failed'
  | 'stale_revision'
  | 'expired_confirmation_token'
  | 'duplicate_request_id_args_mismatch'
  | 'over_limit'
  | 'locked_placement'
  | 'path_traversal'
  | 'dns_rebinding'
  | 'worker_crash'
  | 'browser_disconnect'
  | 'document_unavailable'
  | 'cancelled'
  | 'malformed_input';

export type FailureContext = {
  currentRevision?: number;
  lockedPlacements?: string[];
  budget?: { exceeded: string; limit: number; actual: number };
  message?: string;
};

/**
 * Map a §9 failure condition to a stable code, message and suggested action.
 * An unrecognised condition returns VALIDATION_FAILED rather than inventing a code.
 */
export function classifyFailure(condition: FailureCondition, context: FailureContext = {}): McpError {
  switch (condition) {
    case 'invalid_pairing_token':
      return makeMcpError(
        MCP_ERROR_CODES.INVALID_PAIRING_TOKEN,
        'the pairing token is invalid, expired or already used',
        {
          currentRevision: context.currentRevision,
          suggestedAction: 'generate a new pairing token in the companion and reconnect',
        },
      );

    case 'stale_revision':
      return makeMcpError(
        MCP_ERROR_CODES.STALE_REVISION,
        context.currentRevision !== undefined
          ? `the project is at revision ${context.currentRevision}, which does not match expectedRevision`
          : 'expectedRevision does not match the current project revision',
        {
          currentRevision: context.currentRevision,
          suggestedAction: 're-read the project, then retry at the current revision',
        },
      );

    case 'expired_confirmation_token':
      return makeMcpError(
        MCP_ERROR_CODES.TOKEN_EXPIRED,
        'the confirmation token has expired (60s TTL, SPEC-F F5)',
        { suggestedAction: 're-run the dry-run to obtain a fresh confirmation token' },
      );

    case 'invalid_confirmation_token':
      return makeMcpError(
        MCP_ERROR_CODES.TOKEN_INVALID,
        'the confirmation token does not match the token issued by dry-run',
        { suggestedAction: 're-run the dry-run to obtain a fresh confirmation token' },
      );

    case 'confirmation_token_already_used':
      return makeMcpError(
        MCP_ERROR_CODES.TOKEN_ALREADY_USED,
        'the confirmation token has already been used (one-time use, SPEC-F F5)',
        { suggestedAction: 're-run the dry-run to obtain a fresh confirmation token' },
      );

    case 'confirmation_token_revision_mismatch':
      return makeMcpError(
        MCP_ERROR_CODES.TOKEN_REVISION_MISMATCH,
        'the confirmation token is bound to a different revision than the one supplied',
        {
          currentRevision: context.currentRevision,
          suggestedAction: 're-run the dry-run at the current revision',
        },
      );

    case 'project_mismatch':
      return makeMcpError(
        MCP_ERROR_CODES.PROJECT_MISMATCH,
        'the request targets a different project than the one it was issued for',
        { suggestedAction: 're-issue the request against this project' },
      );

    case 'dry_run_required':
      return makeMcpError(
        MCP_ERROR_CODES.DRY_RUN_REQUIRED,
        'no dry-run is bound to this requestId, so the operation cannot be applied',
        { suggestedAction: 'call dry-run first and pass the confirmation token it returns' },
      );

    case 'execution_failed':
      return makeMcpError(
        MCP_ERROR_CODES.EXECUTION_FAILED,
        context.message ?? 'the shared command bus rejected the operation',
        {
          currentRevision: context.currentRevision,
          suggestedAction: 'check the reported condition (locks, budgets) and retry',
        },
      );

    case 'duplicate_request_id_args_mismatch':
      return makeMcpError(
        MCP_ERROR_CODES.IDEMPOTENCY_ARGS_MISMATCH,
        'this requestId was already used with a different operation or arguments',
        { suggestedAction: 'use a new requestId for a different operation' },
      );

    case 'over_limit': {
      const budget = context.budget;
      const message =
        budget !== undefined
          ? `changed/estimated work of ${budget.actual} exceeds ${budget.exceeded} (${budget.limit})`
          : 'the operation exceeds the configured MCP budget';
      return makeMcpError(MCP_ERROR_CODES.OVER_LIMIT, message, {
        suggestedAction:
          budget?.exceeded === 'maxChangedCells' || budget?.exceeded === 'configurableChangedLimit'
            ? 're-run the dry-run with an explicit limit increase, or split the operation'
            : 'split the operation into smaller calls',
        details: budget !== undefined ? { ...budget } : undefined,
      });
    }

    case 'locked_placement': {
      const locked = context.lockedPlacements ?? [];
      return makeMcpError(
        MCP_ERROR_CODES.LOCKED_PLACEMENT,
        locked.length > 0
          ? `${locked.length} locked placement(s) fall inside the operation target`
          : 'a locked placement falls inside the operation target',
        {
          suggestedAction: 'unlock the listed placements, or exclude them from the operation',
          details: { lockedPlacements: [...locked], lockedCount: locked.length },
        },
      );
    }

    case 'path_traversal':
      return makeMcpError(
        MCP_ERROR_CODES.PATH_TRAVERSAL,
        'the path escapes the approved directory (security refusal)',
        {
          suggestedAction: 'use a path inside an approved directory without ".." segments',
          details: { security: true },
        },
      );

    case 'dns_rebinding':
      return makeMcpError(
        MCP_ERROR_CODES.DNS_REBINDING,
        'the request Host/Origin indicates a DNS rebinding attempt (security refusal)',
        {
          suggestedAction: 'connect to 127.0.0.1 using an allowed origin',
          details: { security: true },
        },
      );

    case 'worker_crash':
      return makeMcpError(
        MCP_ERROR_CODES.WORKER_CRASH,
        'the worker crashed during the operation; the partial result was discarded and the main thread is unchanged',
        { suggestedAction: 'retry the operation; if it recurs, reduce the operation size' },
      );

    case 'browser_disconnect':
      return makeMcpError(
        MCP_ERROR_CODES.BROWSER_DISCONNECTED,
        'the browser disconnected while the operation was in flight',
        {
          suggestedAction:
            'already-committed work is kept; reconnect the browser and retry anything that did not commit',
        },
      );

    case 'document_unavailable':
      return makeMcpError(
        MCP_ERROR_CODES.DOCUMENT_UNAVAILABLE,
        'no document is available to this session (no browser attached and the companion holds none)',
        { suggestedAction: 'open a project in the editor and reconnect, or load a document headlessly' },
      );

    case 'cancelled':
      return makeMcpError(MCP_ERROR_CODES.CANCELLED, 'the operation was cancelled', {
        suggestedAction: 're-issue the operation when ready',
      });

    case 'malformed_input':
      return makeMcpError(
        MCP_ERROR_CODES.VALIDATION_FAILED,
        context.message ?? 'the tool input failed schema validation',
        { suggestedAction: 'correct the argument types and retry' },
      );

    default:
      return makeMcpError(
        MCP_ERROR_CODES.VALIDATION_FAILED,
        context.message ?? `unrecognised failure condition: ${String(condition)}`,
        { suggestedAction: 'report this condition; no specific recovery is defined' },
      );
  }
}

// ============================================================================
// §4.3 budgets
// ============================================================================

export type BudgetInput = {
  candidateCells: number;
  changedCells: number;
  estimatedRuntimeMs: number;
  estimatedMemoryBytes: number;
};

export type ExceededBudget =
  | 'maxCandidateCells'
  | 'maxChangedCells'
  | 'configurableChangedLimit'
  | 'absoluteSafetyLimit'
  | 'maxRuntimeMs'
  | 'maxMemoryBytes';

export type BudgetDecision = {
  ok: boolean;
  error?: McpError;
  exceeded?: ExceededBudget;
  /** True when an explicit limit increase would legitimately unblock the operation. */
  overridable: boolean;
};

/**
 * Check the four §4.3 budgets in severity order so the most fundamental refusal is reported first:
 * candidate cells → absolute cell limit → default cell limit → configurable cell limit → runtime →
 * memory. Only the two "budget" cell limits respond to an explicit limit increase; the absolute
 * safety limit, the candidate limit, runtime and memory never do.
 */
export function checkBudgets(
  input: BudgetInput,
  options: { allowLimitIncrease?: boolean } = {},
): BudgetDecision {
  const allowIncrease = options.allowLimitIncrease === true;

  const fail = (exceeded: ExceededBudget, limit: number, actual: number, overridable: boolean): BudgetDecision => ({
    ok: false,
    exceeded,
    overridable,
    error: classifyFailure('over_limit', { budget: { exceeded, limit, actual } }),
  });

  if (input.candidateCells > LIMITS.maxCandidateCells) {
    return fail('maxCandidateCells', LIMITS.maxCandidateCells, input.candidateCells, false);
  }
  if (input.changedCells > LIMITS.absoluteSafetyLimit) {
    return fail('absoluteSafetyLimit', LIMITS.absoluteSafetyLimit, input.changedCells, false);
  }
  if (input.changedCells > LIMITS.maxChangedCells && !allowIncrease) {
    return fail('maxChangedCells', LIMITS.maxChangedCells, input.changedCells, true);
  }
  if (input.changedCells > LIMITS.configurableChangedLimit) {
    return fail('configurableChangedLimit', LIMITS.configurableChangedLimit, input.changedCells, false);
  }
  if (input.estimatedRuntimeMs > LIMITS.maxRuntimeMs) {
    return fail('maxRuntimeMs', LIMITS.maxRuntimeMs, input.estimatedRuntimeMs, false);
  }
  if (input.estimatedMemoryBytes > LIMITS.maxMemoryBytes) {
    return fail('maxMemoryBytes', LIMITS.maxMemoryBytes, input.estimatedMemoryBytes, false);
  }

  return { ok: true, overridable: false };
}

/** SPEC-F §2.3 `estimatedUndoBytes`: deterministic, monotonic in changed cell count. */
export function estimateUndoBytes(
  changedCells: number,
  bytesPerCell: number = BYTES_PER_CHANGED_CELL,
): number {
  if (changedCells <= 0) return 0;
  return changedCells * bytesPerCell;
}

/** Convenience: build the budget input from a preview plus a memory estimate. */
export function budgetInputFromPreview(
  preview: { candidateCells: number; changedCells: number },
  estimates: { runtimeMs: number; memoryBytes: number },
): BudgetInput {
  return {
    candidateCells: preview.candidateCells,
    changedCells: preview.changedCells,
    estimatedRuntimeMs: estimates.runtimeMs,
    estimatedMemoryBytes: estimates.memoryBytes,
  };
}
