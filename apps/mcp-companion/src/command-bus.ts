// apps/mcp-companion/src/command-bus.ts
// Shared command bus: the single authority for document mutations.
// Replaces the revision-counter stub in listener.ts (audit PF-2).
//
// Pure TypeScript, zero framework/browser/Node imports. The host adapter
// (listener.ts) wires the bus to the actual document authority (browser-live
// via the bridge, or headless local-file) and to the persistence layer.

import type { PreviewResult, ExecutionResult } from './destructive-protocol.ts';

// ============================================================================
// Types
// ============================================================================

export type CommandOperation = string;

export type CommandArgs = Record<string, unknown>;

export type CommandBusState = {
  projectId: string;
  revision: number;
  documentLoaded: boolean;
};

export type CommandBus = {
  state(): CommandBusState;
  setProjectId(id: string): void;
  setDocumentLoaded(loaded: boolean): void;
  /** Dry-run: estimate impact without mutating. */
  preview(operation: CommandOperation, args: CommandArgs): PreviewResult;
  /** Execute: mutate the document and bump revision. Returns the result. */
  execute(operation: CommandOperation, args: CommandArgs): ExecutionResult;
  /** Idempotency: replay a previous result by requestId. */
  getCachedResult(requestId: string): ExecutionResult | null;
  /** Cache a result for idempotency replay. */
  cacheResult(requestId: string, result: ExecutionResult): void;
  /** Reset the bus (e.g. on document unload). */
  reset(): void;
};

export type CommandBusOptions = {
  projectId?: string;
  previewEstimator?: (operation: CommandOperation, args: CommandArgs) => PreviewResult;
  executor?: (operation: CommandOperation, args: CommandArgs, currentRevision: number) => ExecutionResult;
};

// ============================================================================
// Limits (from f-11)
// ============================================================================

export const COMMAND_LIMITS = {
  maxCandidateCells: 1_000_000,
  maxChangedCells: 250_000,
  configurableChangedLimit: 1_000_000,
  absoluteSafetyLimit: 5_000_000,
  maxRuntimeMs: 5_000,
  maxMemoryBytes: 256 * 1024 * 1024,
} as const;

// ============================================================================
// Default implementations
// ============================================================================

function defaultPreview(operation: CommandOperation, args: CommandArgs): PreviewResult {
  // Provisional estimate until the operations package is wired.
  const candidateCells = 64 * 64;
  return {
    operation,
    affectedPlacementIds: [],
    affectedBounds: [],
    candidateCells,
    changedCells: 0,
    resultingNonAirCount: 0,
    conflictImpact: { sameStateOverlapsResolved: 0, stateConflictsResolved: 0 },
    estimatedUndoBytes: 0,
    warnings: [
      {
        code: 'PREVIEW_PROVISIONAL',
        severity: 'warning',
        message: `preview for ${operation} is provisional: the operations package is not yet wired`,
        details: { args, limits: COMMAND_LIMITS },
      },
    ],
  };
}

function defaultExecute(operation: CommandOperation, args: CommandArgs, currentRevision: number): ExecutionResult {
  return {
    success: true,
    revision: currentRevision + 1,
    changedCells: 0,
    changedPlacements: [],
    warnings: [
      {
        code: 'EXECUTE_PROVISIONAL',
        severity: 'warning',
        message: `execute for ${operation} is provisional: the operations package is not yet wired`,
        details: { args },
      },
    ],
  };
}

// ============================================================================
// Factory
// ============================================================================

export function createCommandBus(options?: CommandBusOptions): CommandBus {
  let projectId = options?.projectId ?? 'default';
  let revision = 0;
  let documentLoaded = false;
  const cache = new Map<string, ExecutionResult>();
  const previewEstimator = options?.previewEstimator ?? defaultPreview;
  const executor = options?.executor ?? defaultExecute;

  function state(): CommandBusState {
    return { projectId, revision, documentLoaded };
  }

  function setProjectId(id: string): void {
    projectId = id;
  }

  function setDocumentLoaded(loaded: boolean): void {
    documentLoaded = loaded;
  }

  function preview(operation: CommandOperation, args: CommandArgs): PreviewResult {
    return previewEstimator(operation, args);
  }

  function execute(operation: CommandOperation, args: CommandArgs): ExecutionResult {
    const result = executor(operation, args, revision);
    if (result.success) {
      revision = result.revision;
    }
    return result;
  }

  function getCachedResult(requestId: string): ExecutionResult | null {
    return cache.get(requestId) ?? null;
  }

  function cacheResult(requestId: string, result: ExecutionResult): void {
    cache.set(requestId, result);
  }

  function reset(): void {
    projectId = 'default';
    revision = 0;
    documentLoaded = false;
    cache.clear();
  }

  return {
    state,
    setProjectId,
    setDocumentLoaded,
    preview,
    execute,
    getCachedResult,
    cacheResult,
    reset,
  };
}
