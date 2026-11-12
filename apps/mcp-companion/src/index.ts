// apps/mcp-companion/src/index.ts
// Public API for the mcp-companion package.

export type {
  McpCompanionConfig,
  DocumentAuthority,
  AuthorityHandover,
  McpSession,
  CompanionStatus,
} from './companion-config.ts';

export type {
  MutationEnvelope,
  ConfirmationToken,
  DryRunResult,
  MutationResult,
  MutationProtocol,
} from './mutation-envelope.ts';

export type {
  PackManagerState,
  PackEntry,
  PackCompatibility,
  PackDiagnostics,
  PackAction,
} from './pack-manager.ts';

export type {
  PairingToken,
  PairingTokenState,
  SecurityConfig,
  ConnectionSecurity,
  PairingProtocol,
} from './pairing-token.ts';

export type {
  DEFAULT_PAIRING_TOKEN_TTL_MS,
  DEFAULT_MAX_CONNECTION_ATTEMPTS,
  DEFAULT_BLOCK_DURATION_MS,
  LOOPBACK_ADDRESSES,
} from './pairing-token.ts';

export type {
  ClipboardTool,
  ClipboardToolResult,
  ClipboardToolError,
  ClipboardTools,
} from './clipboard.ts';

export type {
  CopyResult,
  CutResult,
  PasteResult,
} from './clipboard.ts';

export type {
  ClipboardToolResultMap,
} from './clipboard.ts';
