// apps/mcp-companion/src/destructive-protocol.ts
// Destructive operation protocol — two-phase dry-run → apply (SUBSPEC-F §2.3, §2.4, §4.3, §4.4, §6).
// Pure TypeScript, zero framework/browser/Node/Three.js/MCP imports.
// Clock, token minting and execution are injected via DestructiveProtocolServices so this module
// stays dependency-free and unit-testable without a document, IndexedDB or crypto.
//
// Classification authority: SUBSPEC-F §6 (tool names). The verb vocabulary inherited from the
// slice f-7 draft is retained for compatibility but is NOT the confirmation authority — see
// docs/research/subplan-f.md decision F-6.1 and DOUBTS.md D-1.
//
// Token storage follows SPEC-F §2.4, whose ConfirmationToken carries the plaintext `token` field
// (unlike §2.6 PairingToken, which stores only a hash). Confirmation tokens are therefore held in
// memory for their 60s TTL so that a duplicate requestId can return the original result
// (§6 step 4). They must never be logged, put in URLs, or echoed in Agent Log entries —
// sanitization is slice f-9's responsibility (SPEC-F §4.6, §8.2, F14).

import type { Bounds3i } from '../../../packages/domain/types.ts';
import type { Diagnostic } from '../../../packages/domain/shared-types.ts';

// ============================================================================
// Destructive Operation — verb vocabulary (slice f-7 draft, retained for compat)
// ============================================================================

export type DestructiveOperation =
  | 'delete'
  | 'replace'
  | 'paste'
  | 'cut'
  | 'fill'
  | 'hollow'
  | 'walls'
  | 'bake'
  | 'stack'
  | 'move'
  | 'transform';

// ============================================================================
// Operation classification (SPEC-F §6)
// ============================================================================

/**
 * Tools requiring confirmation (two-phase dry-run + apply) — SPEC-F §6.
 * `export_schematic` is qualified there as "(large exports)"; it is gated by size via
 * CONDITIONAL_CONFIRMATION_TOOLS.
 */
export const CONFIRMATION_REQUIRED_TOOLS: ReadonlySet<string> = new Set([
  'delete_placement',
  'bake_placements',
  'fill_selection',
  'replace_selection',
  'delete_selection',
  'cut_selection',
  'hollow_selection',
  'walls_selection',
  'move_selection',
  'export_schematic',
]);

/** Tools that execute immediately, no confirmation — SPEC-F §6 second list. */
export const IMMEDIATE_TOOLS: ReadonlySet<string> = new Set([
  'transform_placement',
  'transform_placements',
  'set_placement_visibility',
  'set_placement_lock',
  'rename_placement',
  'duplicate_placement',
  'set_origin',
  'create_selection',
  'clear_selection',
  'select_placements',
  'copy_selection',
  'paste_clipboard',
  'undo',
  'redo',
  'set_color_mode',
]);

/**
 * Confirmation-required only above a size threshold (SPEC-F §6 "large exports").
 * Threshold: MCP_LIMITS.maxChangedCells — unresolved point DOUBTS.md D-3.
 */
export const CONDITIONAL_CONFIRMATION_TOOLS: ReadonlySet<string> = new Set([
  'export_schematic',
]);

/** Read tools (SPEC-F §5.1) — never mutate, never confirmation-gated. */
export const READ_TOOLS: ReadonlySet<string> = new Set([
  'list_projects',
  'open_project',
  'get_project_info',
  'list_placements',
  'get_placement',
  'get_origin',
  'detect_conflicts',
  'get_conflict_map',
  'get_material_list',
  'get_selection',
  'get_color_mode',
  'get_history',
  'get_diagnostics',
]);

// ============================================================================
// Limits and TTLs (SPEC-F §4.3, §4.4, F4, F5, F6, F15)
// ============================================================================

export const MCP_LIMITS = {
  /** Total cells examined, including air. */
  maxCandidateCells: 1_000_000,
  /** Actually modified cells — default budget. */
  maxChangedCells: 250_000,
  /** Estimated execution time. */
  maxRuntimeMs: 5_000,
  /** Estimated peak memory (256 MiB). */
  maxMemoryBytes: 256 * 1024 * 1024,
  /** Changed-cell budget after an explicit limit increase. */
  configurableChangedLimit: 1_000_000,
  /** Never overridable. */
  absoluteSafetyLimit: 5_000_000,
} as const;

/** Confirmation token TTL — SPEC-F F5 / §4.4. */
export const DEFAULT_CONFIRMATION_TOKEN_TTL_MS = 60_000;

/** Idempotency retention — SPEC-F F6. */
export const DEFAULT_IDEMPOTENCY_RETENTION_MS = 900_000;

// ============================================================================
// Argument normalization (SPEC-F §4.4 "normalized args")
// ============================================================================

/**
 * Deterministic canonical encoding of operation arguments: object keys sorted at every depth,
 * `undefined` dropped, arrays order-preserving. Two spellings of the same arguments must map to
 * one binding, otherwise a token could silently authorize a "similar" operation (§4.4).
 */
export function normalizeArgs(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    const encoded = JSON.stringify(value);
    return encoded === undefined ? 'null' : encoded;
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => normalizeArgs(item)).join(',')}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${normalizeArgs(v)}`).join(',')}}`;
}

// ============================================================================
// Results
// ============================================================================

export type ProtocolError = {
  /** Stable machine-readable code (SPEC-F §9). */
  code: string;
  message: string;
  currentRevision?: number;
  suggestedAction?: string;
};

/** Cell-level preview payload — SPEC-F §2.3 (DryRunResult). */
export type PreviewResult = {
  operation: string;
  affectedPlacementIds: string[];
  affectedBounds: Bounds3i[];
  candidateCells: number;
  changedCells: number;
  resultingNonAirCount: number;
  conflictImpact: {
    sameStateOverlapsResolved: number;
    stateConflictsResolved: number;
  };
  estimatedUndoBytes: number;
  warnings: Diagnostic[];
};

/**
 * Dry-run result (plan name from docs/plans/subplan-f/slice-f-7.md): the §2.3 preview plus the
 * request/revision binding, the confirmation token and the `wouldChange` cell count.
 */
export type DryRunConfirmResult = PreviewResult & {
  requestId: string;
  projectId: string;
  /** Revision the caller declared. */
  expectedRevision: number;
  /** Revision the companion observed at dry-run time. */
  revision: number;
  /** Cells the operation would change (alias of `changedCells`). */
  wouldChange: number;
  requiresConfirmation: boolean;
  /** Plaintext token — returned by the first dry-run for a requestId (§2.4, §6 step 1). */
  confirmationToken?: string;
  issuedAt: number;
  expiresAt: string;
  error?: ProtocolError;
};

/** Apply result (plan name from slice-f-7.md). */
export type ApplyResult = {
  requestId: string;
  projectId: string;
  success: boolean;
  applied: boolean;
  revision: number;
  changedCells: number;
  changedPlacements: string[];
  warnings: Diagnostic[];
  error?: ProtocolError;
};

// ============================================================================
// Injected services
// ============================================================================

export type ExecutionResult = {
  success: boolean;
  /** Revision after a successful commit. */
  revision: number;
  changedCells: number;
  changedPlacements: string[];
  warnings: Diagnostic[];
  errorCode?: string;
  errorMessage?: string;
};

export type DestructiveProtocolServices = {
  /** Current committed revision of the project. */
  getRevision(projectId: string): number;
  /** Compute the §2.3 preview without mutating anything. */
  preview(
    projectId: string,
    operation: string,
    args: Record<string, unknown>,
    expectedRevision: number,
  ): PreviewResult;
  /** Execute through the shared command bus (SPEC-F §5.5: no MCP-only implementations). */
  execute(projectId: string, operation: string, args: Record<string, unknown>): ExecutionResult;
};

export type DestructiveProtocolOptions = {
  services: DestructiveProtocolServices;
  /** Clock injection; defaults to `Date.now`. */
  now?: () => number;
  /** Token minting; production wiring injects a 256-bit CSPRNG token (SPEC-F §2.4). */
  generateToken?: () => string;
  /** Confirmation token TTL in ms; default `DEFAULT_CONFIRMATION_TOKEN_TTL_MS`. */
  confirmationTokenTtlMs?: number;
  /** Idempotency retention in ms; default `DEFAULT_IDEMPOTENCY_RETENTION_MS`. */
  idempotencyRetentionMs?: number;
};

export type DryRunOptions = {
  /** SPEC-F §4.3: explicit limit increase for over-default operations. */
  allowLimitIncrease?: boolean;
};

export type ApplyOptions = {
  /** Must match the dry-run's explicit limit increase. */
  allowLimitIncrease?: boolean;
};

export type DestructiveProtocol = {
  /** Classify a tool name against SPEC-F §6. */
  isDestructive(operation: string): boolean;
  /** True when this operation at this size requires a confirmation token. */
  requiresConfirmation(
    operation: string,
    args: Record<string, unknown>,
    changedCells: number,
  ): boolean;
  /**
   * Phase 1 — never mutates. Computes the §2.3 preview and, when confirmation is required, binds a
   * one-time 60s token to project + revision + operation + normalized args (§4.4). Passing the same
   * `requestId` with an identical operation and args replays the original result (§6 step 4).
   */
  dryRun(
    projectId: string,
    operation: string,
    args: Record<string, unknown>,
    expectedRevision: number,
    options?: DryRunOptions,
    requestId?: string,
  ): DryRunConfirmResult;
  /**
   * Phase 2 — requires the confirmation token + expectedRevision. Operation and arguments are the
   * ones bound at dry-run time (SPEC-F §6 step 2).
   */
  apply(
    projectId: string,
    requestId: string,
    confirmationToken: string,
    expectedRevision: number,
    options?: ApplyOptions,
  ): ApplyResult;
  /**
   * Execute an immediate (non-destructive) operation — SPEC-F §6 rule 3: "Non-destructive mutations
   * still require `expectedRevision` and `requestId`." No confirmation token and no dry-run are
   * involved, so this is a separate entry point rather than a special case of `apply()`.
   */
  executeImmediate(
    projectId: string,
    operation: string,
    args: Record<string, unknown>,
    expectedRevision: number,
    requestId?: string,
    options?: DryRunOptions,
  ): ApplyResult;
  /** Outstanding (unused, unexpired) confirmation bindings. */
  outstandingTokenCount(): number;
  /** Revoke every outstanding confirmation token (authority handover — DOUBTS.md D-2). */
  revokeAll(): void;
};

// ============================================================================
// Internal state
// ============================================================================

type DryRunBinding = {
  requestId: string;
  projectId: string;
  operation: string;
  revision: number;
  normalizedArgs: string;
  args: Record<string, unknown>;
  /** Plaintext token per §2.4. Never logged or echoed outside the dry-run response. */
  token: string;
  createdAt: number;
  expiresAt: number;
  used: boolean;
  preview: PreviewResult;
};

type CachedApply = {
  result: ApplyResult;
  normalizedArgs: string;
  expiresAt: number;
};

function warning(code: string, message: string): Diagnostic {
  return { code, severity: 'warning', message };
}

function defaultGenerateToken(): string {
  // Non-cryptographic fallback. Production wiring injects a 256-bit CSPRNG token (§2.4);
  // this keeps the module free of Node/crypto imports.
  return `ct-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

// ============================================================================
// Factory
// ============================================================================

export function createDestructiveProtocol(
  options: DestructiveProtocolOptions,
): DestructiveProtocol {
  const { services } = options;
  const now = options.now ?? (() => Date.now());
  const generateToken = options.generateToken ?? defaultGenerateToken;
  const ttlMs = options.confirmationTokenTtlMs ?? DEFAULT_CONFIRMATION_TOKEN_TTL_MS;
  const retentionMs = options.idempotencyRetentionMs ?? DEFAULT_IDEMPOTENCY_RETENTION_MS;

  const bindings = new Map<string, DryRunBinding>();
  const appliedCache = new Map<string, CachedApply>();
  /** Tokens already consumed — implements one-time use independently of requestId (SPEC-F F5). */
  const usedTokens = new Map<string, number>();

  function isDestructive(operation: string): boolean {
    return CONFIRMATION_REQUIRED_TOOLS.has(operation);
  }

  function requiresConfirmation(
    operation: string,
    args: Record<string, unknown>,
    changedCells: number,
  ): boolean {
    void args;
    if (CONDITIONAL_CONFIRMATION_TOOLS.has(operation)) {
      return changedCells > MCP_LIMITS.maxChangedCells;
    }
    return isDestructive(operation);
  }

  /**
   * Evicts applied-cache entries past their retention, and bindings past `expiresAt + ttlMs`.
   * Recently expired bindings are kept so an apply after expiry reports `TOKEN_EXPIRED`
   * (actionable) rather than `DRY_RUN_REQUIRED` (misleading).
   */
  function prune(nowMs: number): void {
    for (const [key, entry] of appliedCache) {
      if (nowMs > entry.expiresAt) appliedCache.delete(key);
    }
    for (const [key, binding] of bindings) {
      if (nowMs > binding.expiresAt + ttlMs) bindings.delete(key);
    }
    for (const [token, expiresAt] of usedTokens) {
      if (nowMs > expiresAt) usedTokens.delete(token);
    }
  }

  /** SPEC-F §4.3 budget gate: candidate cells, then default / configurable / absolute cell budgets. */
  function budgetError(preview: PreviewResult, allowIncrease: boolean): ProtocolError | null {
    if (preview.candidateCells > MCP_LIMITS.maxCandidateCells) {
      return {
        code: 'OVER_LIMIT',
        message: `candidate cells ${preview.candidateCells} exceed the candidate limit ${MCP_LIMITS.maxCandidateCells}`,
        suggestedAction: 'narrow the operation or raise maxCandidateCells',
      };
    }
    if (preview.changedCells > MCP_LIMITS.absoluteSafetyLimit) {
      return {
        code: 'OVER_LIMIT',
        message: `changed cells ${preview.changedCells} exceed the absolute limit ${MCP_LIMITS.absoluteSafetyLimit}`,
        suggestedAction: 'split the operation into smaller calls',
      };
    }
    if (preview.changedCells > MCP_LIMITS.maxChangedCells && !allowIncrease) {
      return {
        code: 'OVER_LIMIT',
        message: `changed cells ${preview.changedCells} exceed the default limit ${MCP_LIMITS.maxChangedCells}`,
        suggestedAction: 're-run the dry-run with an explicit limit increase',
      };
    }
    if (preview.changedCells > MCP_LIMITS.configurableChangedLimit) {
      return {
        code: 'OVER_LIMIT',
        message: `changed cells ${preview.changedCells} exceed the configurable limit ${MCP_LIMITS.configurableChangedLimit}`,
        suggestedAction: 'split the operation into smaller calls',
      };
    }
    return null;
  }

  function emptyPreview(operation: string): PreviewResult {
    return {
      operation,
      affectedPlacementIds: [],
      affectedBounds: [],
      candidateCells: 0,
      changedCells: 0,
      resultingNonAirCount: 0,
      conflictImpact: { sameStateOverlapsResolved: 0, stateConflictsResolved: 0 },
      estimatedUndoBytes: 0,
      warnings: [],
    };
  }

  function errorDryRun(
    requestId: string,
    projectId: string,
    operation: string,
    expectedRevision: number,
    revision: number,
    error: ProtocolError,
    extraWarnings: Diagnostic[] = [],
  ): DryRunConfirmResult {
    const nowMs = now();
    return {
      ...emptyPreview(operation),
      warnings: [...extraWarnings, warning(error.code, error.message)],
      requestId,
      projectId,
      expectedRevision,
      revision,
      wouldChange: 0,
      requiresConfirmation: false,
      issuedAt: nowMs,
      expiresAt: new Date(nowMs + ttlMs).toISOString(),
      error,
    };
  }

  function errorApply(
    requestId: string,
    projectId: string,
    error: ProtocolError,
    warnings: Diagnostic[] = [],
  ): ApplyResult {
    return {
      requestId,
      projectId,
      success: false,
      applied: false,
      revision: services.getRevision(projectId),
      changedCells: 0,
      changedPlacements: [],
      warnings,
      error,
    };
  }

  function dryRun(
    projectId: string,
    operation: string,
    args: Record<string, unknown>,
    expectedRevision: number,
    dryRunOptions: DryRunOptions = {},
    requestId?: string,
  ): DryRunConfirmResult {
    const nowMs = now();
    prune(nowMs);

    const currentRevision = services.getRevision(projectId);
    const normalized = normalizeArgs(args);
    const id = requestId ?? generateToken();
    const allowIncrease = dryRunOptions.allowLimitIncrease === true;

    // F10 ordering for the dry-run step: the identity/binding check precedes the revision check.
    const existing = bindings.get(id);
    if (existing) {
      if (
        existing.projectId !== projectId ||
        existing.operation !== operation ||
        existing.normalizedArgs !== normalized
      ) {
        return errorDryRun(id, projectId, operation, expectedRevision, currentRevision, {
          code: 'IDEMPOTENCY_ARGS_MISMATCH',
          message: `requestId ${id} was already used with a different operation or arguments`,
          currentRevision,
          suggestedAction: 'use a new requestId',
        });
      }
      // Identical requestId + operation + args: return the original result (§6 step 4).
      return {
        ...existing.preview,
        requestId: id,
        projectId,
        expectedRevision,
        revision: existing.revision,
        wouldChange: existing.preview.changedCells,
        requiresConfirmation: true,
        confirmationToken: existing.token,
        issuedAt: existing.createdAt,
        expiresAt: new Date(existing.expiresAt).toISOString(),
        error:
          nowMs > existing.expiresAt
            ? {
                code: 'TOKEN_EXPIRED',
                message: `confirmation token expired at ${new Date(existing.expiresAt).toISOString()}`,
                suggestedAction: 'use a new requestId to obtain a fresh token',
              }
            : undefined,
      };
    }

    if (currentRevision !== expectedRevision) {
      return errorDryRun(id, projectId, operation, expectedRevision, currentRevision, {
        code: 'STALE_REVISION',
        message: `expected revision ${expectedRevision} but the project is at ${currentRevision}`,
        currentRevision,
        suggestedAction: 're-read the project and retry at the current revision',
      });
    }

    const preview = services.preview(projectId, operation, args, expectedRevision);
    const bound = budgetError(preview, allowIncrease);
    if (bound) {
      return errorDryRun(id, projectId, operation, expectedRevision, currentRevision, bound, [
        ...preview.warnings,
      ]);
    }

    const warnings = [...preview.warnings];
    if (allowIncrease && preview.changedCells > MCP_LIMITS.maxChangedCells) {
      warnings.push(
        warning(
          'MCP_LIMIT_INCREASED',
          `changed-cell limit raised above the default ${MCP_LIMITS.maxChangedCells} for this operation`,
        ),
      );
    }

    if (!requiresConfirmation(operation, args, preview.changedCells)) {
      return {
        ...preview,
        warnings,
        requestId: id,
        projectId,
        expectedRevision,
        revision: currentRevision,
        wouldChange: preview.changedCells,
        requiresConfirmation: false,
        issuedAt: nowMs,
        expiresAt: new Date(nowMs + ttlMs).toISOString(),
      };
    }

    const token = generateToken();
    const expiresAt = nowMs + ttlMs;
    const boundPreview: PreviewResult = { ...preview, warnings };
    bindings.set(id, {
      requestId: id,
      projectId,
      operation,
      revision: currentRevision,
      normalizedArgs: normalized,
      args,
      token,
      createdAt: nowMs,
      expiresAt,
      used: false,
      preview: boundPreview,
    });

    return {
      ...boundPreview,
      requestId: id,
      projectId,
      expectedRevision,
      revision: currentRevision,
      wouldChange: preview.changedCells,
      requiresConfirmation: true,
      confirmationToken: token,
      issuedAt: nowMs,
      expiresAt: new Date(expiresAt).toISOString(),
    };
  }

  function apply(
    projectId: string,
    requestId: string,
    confirmationToken: string,
    expectedRevision: number,
    applyOptions: ApplyOptions = {},
  ): ApplyResult {
    const nowMs = now();
    prune(nowMs);

    // F10: the completed-request cache is consulted before any revision check.
    const cached = appliedCache.get(requestId);
    if (cached) {
      const bound = bindings.get(requestId);
      if (bound && bound.normalizedArgs !== cached.normalizedArgs) {
        return errorApply(requestId, projectId, {
          code: 'IDEMPOTENCY_ARGS_MISMATCH',
          message: `requestId ${requestId} was already used with different arguments`,
        });
      }
      return { ...cached.result };
    }

    // Idempotency identity for the dry-run step (F10): an outstanding binding for this requestId
    // carries its own token (ownership allows replay) or no token (consumed → already applied).
    const binding = bindings.get(requestId);

    // One-time use (F5) is checked on the token itself, before the requestId binding lookup, so a
    // token replayed under a different requestId is refused rather than reported as an orphan apply.
    if (usedTokens.has(confirmationToken)) {
      return errorApply(requestId, projectId, {
        code: 'TOKEN_ALREADY_USED',
        message: 'confirmation token has already been used (one-time use, SPEC-F F5)',
        suggestedAction: 're-run the dry-run to obtain a fresh token',
      });
    }

    if (!binding) {
      return errorApply(requestId, projectId, {
        code: 'DRY_RUN_REQUIRED',
        message: `no dry-run is bound to requestId ${requestId}`,
        suggestedAction: 'call dry-run first and pass the confirmation token it returns',
      });
    }

    if (binding.projectId !== projectId) {
      return errorApply(requestId, projectId, {
        code: 'PROJECT_MISMATCH',
        message: `confirmation token is bound to project ${binding.projectId}, not ${projectId}`,
        suggestedAction: 're-run the dry-run against this project',
      });
    }

    if (confirmationToken !== binding.token) {
      return errorApply(requestId, projectId, {
        code: 'TOKEN_INVALID',
        message: 'confirmation token does not match the token issued by dry-run',
        suggestedAction: 're-run the dry-run to obtain a fresh token',
      });
    }

    if (binding.used) {
      return errorApply(requestId, projectId, {
        code: 'TOKEN_ALREADY_USED',
        message: 'confirmation token has already been used (one-time use, SPEC-F F5)',
        suggestedAction: 're-run the dry-run to obtain a fresh token',
      });
    }

    if (nowMs > binding.expiresAt) {
      return errorApply(requestId, projectId, {
        code: 'TOKEN_EXPIRED',
        message: `confirmation token expired at ${new Date(binding.expiresAt).toISOString()}`,
        suggestedAction: 're-run the dry-run to obtain a fresh token',
      });
    }

    if (expectedRevision !== binding.revision) {
      return errorApply(requestId, projectId, {
        code: 'TOKEN_REVISION_MISMATCH',
        message: `confirmation token is bound to revision ${binding.revision}, not ${expectedRevision}`,
        currentRevision: services.getRevision(projectId),
        suggestedAction: 're-run the dry-run at the current revision',
      });
    }

    const currentRevision = services.getRevision(projectId);
    if (currentRevision !== expectedRevision) {
      return errorApply(requestId, projectId, {
        code: 'STALE_REVISION',
        message: `expected revision ${expectedRevision} but the project is at ${currentRevision}`,
        currentRevision,
        suggestedAction: 're-read the project and re-run the dry-run',
      });
    }

    const bound = budgetError(binding.preview, applyOptions.allowLimitIncrease === true);
    if (bound) return errorApply(requestId, projectId, bound, [...binding.preview.warnings]);

    const execution = services.execute(projectId, binding.operation, binding.args);
    if (!execution.success) {
      // A rejected command leaves the revision untouched and the token unused, so the caller may
      // retry once the blocking condition (e.g. a lock) is cleared.
      return errorApply(
        requestId,
        projectId,
        {
          code: execution.errorCode ?? 'EXECUTION_FAILED',
          message: execution.errorMessage ?? 'command bus rejected the operation',
          currentRevision,
        },
        execution.warnings,
      );
    }

    binding.used = true;
    usedTokens.set(confirmationToken, binding.expiresAt + ttlMs);
    const result: ApplyResult = {
      requestId,
      projectId,
      success: true,
      applied: true,
      revision: execution.revision,
      changedCells: execution.changedCells,
      changedPlacements: execution.changedPlacements,
      warnings: [...binding.preview.warnings, ...execution.warnings],
    };
    appliedCache.set(requestId, {
      result,
      normalizedArgs: binding.normalizedArgs,
      expiresAt: nowMs + retentionMs,
    });
    return result;
  }

  /**
   * Immediate (non-destructive) execution — SPEC-F §6 rule 3. Still guards the revision and the
   * §4.3 budgets, and still records the result for idempotent replay, but needs no confirmation
   * token and no prior dry-run.
   */
  function executeImmediate(
    projectId: string,
    operation: string,
    args: Record<string, unknown>,
    expectedRevision: number,
    requestId?: string,
    executeOptions: DryRunOptions = {},
  ): ApplyResult {
    const nowMs = now();
    prune(nowMs);

    const normalized = normalizeArgs(args);
    const id = requestId ?? generateToken();

    // F10: completed-request cache first, exactly as in apply().
    const cached = appliedCache.get(id);
    if (cached) {
      if (cached.normalizedArgs !== normalized) {
        return errorApply(id, projectId, {
          code: 'IDEMPOTENCY_ARGS_MISMATCH',
          message: `requestId ${id} was already used with different arguments`,
        });
      }
      return { ...cached.result };
    }

    if (isDestructive(operation)) {
      return errorApply(id, projectId, {
        code: 'DRY_RUN_REQUIRED',
        message: `${operation} is confirmation-required and cannot run through executeImmediate`,
        suggestedAction: 'call dry-run first and apply with its confirmation token',
      });
    }

    const currentRevision = services.getRevision(projectId);
    if (currentRevision !== expectedRevision) {
      return errorApply(id, projectId, {
        code: 'STALE_REVISION',
        message: `expected revision ${expectedRevision} but the project is at ${currentRevision}`,
        currentRevision,
        suggestedAction: 're-read the project and retry at the current revision',
      });
    }

    const preview = services.preview(projectId, operation, args, expectedRevision);
    const bound = budgetError(preview, executeOptions.allowLimitIncrease === true);
    if (bound) return errorApply(id, projectId, bound, [...preview.warnings]);

    const execution = services.execute(projectId, operation, args);
    if (!execution.success) {
      return errorApply(
        id,
        projectId,
        {
          code: execution.errorCode ?? 'EXECUTION_FAILED',
          message: execution.errorMessage ?? 'command bus rejected the operation',
          currentRevision,
        },
        execution.warnings,
      );
    }

    const result: ApplyResult = {
      requestId: id,
      projectId,
      success: true,
      applied: true,
      revision: execution.revision,
      changedCells: execution.changedCells,
      changedPlacements: execution.changedPlacements,
      warnings: [...preview.warnings, ...execution.warnings],
    };
    appliedCache.set(id, {
      result,
      normalizedArgs: normalized,
      expiresAt: nowMs + retentionMs,
    });
    return result;
  }

  function outstandingTokenCount(): number {
    const nowMs = now();
    prune(nowMs);
    let count = 0;
    for (const binding of bindings.values()) {
      if (!binding.used && nowMs <= binding.expiresAt) count++;
    }
    return count;
  }

  function revokeAll(): void {
    bindings.clear();
  }

  return {
    isDestructive,
    requiresConfirmation,
    dryRun,
    apply,
    executeImmediate,
    outstandingTokenCount,
    revokeAll,
  };
}

// ============================================================================
// Diagnostics
// ============================================================================

/** Classification counts for health/diagnostic output (SPEC-F §4.7). */
export function classificationSummary(): {
  confirmationRequired: number;
  immediate: number;
  conditional: number;
  read: number;
} {
  return {
    confirmationRequired: CONFIRMATION_REQUIRED_TOOLS.size,
    immediate: IMMEDIATE_TOOLS.size,
    conditional: CONDITIONAL_CONFIRMATION_TOOLS.size,
    read: READ_TOOLS.size,
  };
}
