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
} from './tools/clipboard.ts';

export type {
  CopyResult,
  CutResult,
  PasteResult,
} from './tools/clipboard.ts';

export type {
  ClipboardToolResultMap,
} from './tools/clipboard.ts';

export type {
  HistoryTool,
  HistoryToolResult,
  HistoryToolError,
} from './tools/history.ts';

export type {
  UndoResult,
  RedoResult,
  ExportSchematicResult,
  GetOperationDiffResult,
  SetColorModeResult,
} from './tools/history.ts';

export type {
  HistoryToolResultMap,
} from './tools/history.ts';
