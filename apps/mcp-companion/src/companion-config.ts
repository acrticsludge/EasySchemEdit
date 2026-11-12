// apps/mcp-companion/src/companion-config.ts
// MCP companion configuration, session types, and authority modes (SUBSPEC-F §2.1, §2.1.1).
// Pure TypeScript, zero framework/browser/Node/Three.js/MCP imports.
// Type definitions only; MCP SDK imported in implementation.

// ============================================================================
// Companion Configuration
// ============================================================================

export type McpCompanionConfig = {
  id: string;                           // unique companion instance id
  port: number;                         // default 43127
  host: string;                         // '127.0.0.1' (loopback only)
  pairingTokenTtlMs: number;            // 300000 (5 minutes)
  confirmationTokenTtlMs: number;       // 60000 (60 seconds)
  maxBlocksPerCall: number;             // 250000
  configurableLimit: number;            // 1000000
  absoluteSafetyLimit: number;          // 5000000
  idempotencyRetentionMs: number;       // 900000 (15 minutes)
  idempotencyMaxEntries: number;        // 1000
  idempotencyMaxBytes: number;          // 50 * 1024 * 1024 (50 MiB)
  approvedDirectories: string[];        // canonicalized absolute paths
  projectRestrictions: Record<string, string[]>; // projectId → allowed dirs
};

// ============================================================================
// Document Authority Modes
// ============================================================================

export type DocumentAuthority = 'browser' | 'companion';

// Authority modes (SUBSPEC-F §2.1.1):
// - 'browser': browser owns document in memory; companion is forwarding proxy only
// - 'companion': companion owns document loaded from .vxproj (headless local-file mode)
// - Handover: explicit, atomic, one at a time; browser→companion or companion→browser;
//   both sides acknowledge same target revision

export type AuthorityHandover = {
  from: DocumentAuthority;
  to: DocumentAuthority;
  targetRevision: number;
  acknowledgedBy: DocumentAuthority[]; // both sides must acknowledge
  completedAt: string | null;          // null until both sides acknowledge
};

// ============================================================================
// MCP Session
// ============================================================================

export type McpSession = {
  id: string;
  projectId: string;
  expectedRevision: number;
  connectedAt: string;        // ISO timestamp
  lastActivityAt: string;     // ISO timestamp
  browserConnected: boolean;
  authority: DocumentAuthority; // who owns the document in this session
  handoverInProgress: AuthorityHandover | null;
};

// ============================================================================
// Companion Status
// ============================================================================

export type CompanionStatus = {
  id: string;
  version: string;
  mode: DocumentAuthority;
  activeSessions: number;
  uptimeMs: number;
  lastActivityAt: string | null;
};
