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
  SecurityPolicy,
  ConnectionSecurity,
  PairingProtocol,
  PairingTokenRecord,
  PairingAuthority,
  PairingAuthorityOptions,
  PairingAuthorityServices,
  ConnectResult,
  ConnectFailure,
  HostCheck,
  OriginCheck,
  CorsPolicy,
  CorsDecision,
} from './pairing-token.ts';

export {
  createPairingAuthority,
  checkHost,
  checkOrigin,
  corsPreflightResponse,
  classifyAddressSpace,
  checkLoopback,
  checkPNA,
  constantTimeEquals,
  DEFAULT_SESSION_IDLE_TIMEOUT_MS,
  COMPANION_PORT,
  ALLOWED_HOSTNAMES,
  PAIRING_TOKEN_BYTES,
} from './pairing-token';

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

export {
  classifyFailure,
  checkBudgets,
  estimateUndoBytes,
  makeMcpError,
  budgetInputFromPreview,
  MCP_ERROR_CODES,
  LIMITS,
  BYTES_PER_CHANGED_CELL,
} from './failure-handling';

export type {
  McpError,
  McpErrorCode,
  FailureCondition,
  FailureContext,
  BudgetInput,
  BudgetDecision,
  ExceededBudget,
} from './failure-handling';
