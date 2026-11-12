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
  DESTRUCTIVE_OPERATIONS,
  DEFAULT_CONFIRMATION_TOKEN_TTL_MS,
  DEFAULT_MAX_BLOCKS_PER_CALL,
  DEFAULT_CONFIGURABLE_LIMIT,
  DEFAULT_ABSOLUTE_SAFETY_LIMIT,
} from './mutation-envelope.ts';

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
