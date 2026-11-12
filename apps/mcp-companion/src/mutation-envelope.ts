// apps/mcp-companion/src/mutation-envelope.ts
// Mutation envelope, confirmation token, and dry-run result types (SUBSPEC-F §2.2, §2.2.1, §2.2.2).
// Pure TypeScript, zero framework/browser/Node/Three.js/MCP imports.
// Type definitions only; MCP SDK imported in implementation.

import type { Vec3i } from '../../../packages/domain/types.ts';

// ============================================================================
// Mutation Envelope
// ============================================================================

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

// ============================================================================
// Confirmation Token
// ============================================================================

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

// ============================================================================
// Dry-run Result
// ============================================================================

export type DryRunResult = {
  requestId: string;
  projectId: string;
  expectedRevision: number;
  wouldChange: number;            // number of cells that would change
  affectedBounds: {
    min: Vec3i;
    max: Vec3i;
  } | null;                       // bounds of affected region, null if no changes
  warnings: string[];
  requiresConfirmation: boolean;  // true if destructive
  confirmationToken?: string;     // confirmation token if confirmation required
};

// ============================================================================
// Mutation Result
// ============================================================================

export type MutationResult = {
  requestId: string;
  projectId: string;
  revision: number;               // new revision after mutation
  changedCells: number;           // number of cells actually changed
  applied: boolean;               // true if applied (not dry-run)
  warnings: string[];
};

// ============================================================================
// Mutation Protocol
// ============================================================================

export type MutationProtocol = {
  createEnvelope(
    projectId: string,
    operation: string,
    args: Record<string, unknown>,
    expectedRevision: number,
    dryRun?: boolean,
  ): MutationEnvelope;

  createConfirmationToken(
    projectId: string,
    revision: number,
    operation: string,
    args: Record<string, unknown>,
  ): ConfirmationToken;

  validateConfirmationToken(
    token: string,
    projectId: string,
    revision: number,
    operation: string,
    args: Record<string, unknown>,
  ): boolean;

  isDestructive(operation: string): boolean;
};

// Destructive operations that require confirmation token
export const DESTRUCTIVE_OPERATIONS: ReadonlySet<string> = new Set([
  'delete',
  'replace',
  'paste',
  'cut',
  'fill',
  'hollow',
  'walls',
  'bake',
  'stack',
  'move',
  'transform',
]);

// Default confirmation token TTL: 60 seconds
export const DEFAULT_CONFIRMATION_TOKEN_TTL_MS = 60000;

// Default command budget: 250,000 cells
export const DEFAULT_MAX_BLOCKS_PER_CALL = 250000;

// Configurable limit: 1,000,000 cells
export const DEFAULT_CONFIGURABLE_LIMIT = 1_000_000;

// Absolute safety limit: 5,000,000 cells
export const DEFAULT_ABSOLUTE_SAFETY_LIMIT = 5_000_000;
