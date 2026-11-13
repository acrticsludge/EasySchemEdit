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

export {
  createDestructiveProtocol,
  normalizeArgs,
  classificationSummary,
  CONFIRMATION_REQUIRED_TOOLS,
  IMMEDIATE_TOOLS,
  CONDITIONAL_CONFIRMATION_TOOLS,
  READ_TOOLS,
  MCP_LIMITS,
  DEFAULT_CONFIRMATION_TOKEN_TTL_MS,
  DEFAULT_IDEMPOTENCY_RETENTION_MS,
} from './destructive-protocol';

export type {
  DestructiveProtocol,
  DestructiveProtocolOptions,
  DestructiveProtocolServices,
  ExecutionResult,
  DryRunOptions,
  ApplyOptions,
  DryRunConfirmResult,
  PreviewResult,
  ApplyResult,
  ProtocolError,
} from './destructive-protocol';

export {
  createMcpExporter,
  effectiveRoots,
  isContained,
  normalizePathSegments,
} from './mcp-export';

export type {
  McpExporter,
  McpExporterOptions,
  ExportServices,
  ExportRequest,
  ExportArtifact,
  ExportResult,
  ExportRefusal,
  ExportErrorCode,
  ExportPathErrorCode,
  ResolvedPath,
} from './mcp-export';

export {
  createAgentLog,
  sanitizeText,
  sanitizeValue,
  sanitizeInputs,
  serializeEntry,
  warningTexts,
  DEFAULT_MAX_LOG_ENTRIES,
  DEFAULT_MAX_LOG_BYTES,
  DEFAULT_MAX_LOG_STRING_BYTES,
  REDACTION,
  TRUNCATION_MARKER,
} from './agent-log';

export type {
  AgentLog,
  AgentLogEntry,
  AgentLogAppendInput,
  AgentLogOptions,
  AgentLogSize,
  SanitizeOptions,
} from './agent-log';

export {
  createHealthReporter,
  isLocalAddress,
  healthSummary,
  HEALTH_PATHS,
} from './health-report';

export type {
  HealthReporter,
  HealthReporterDeps,
  HealthStatus,
  HealthRequest,
  HealthResponse,
  HealthRefusal,
  CompanionState,
  ReadyStatus,
  MetricsReport,
} from './health-report';
