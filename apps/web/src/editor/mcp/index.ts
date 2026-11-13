// apps/web/src/editor/mcp/index.ts
// Public exports for browser MCP pairing client and Agent Log panel (Slice E4.2).

export {
  McpBridgeClient,
  isReadTool,
  tupleToBounds,
  parseBlockState,
  parseMatcher,
  mapToolToCommands,
} from './mcp-bridge-client.ts';

export type {
  McpBridgeClientStatus,
  BrowserAgentLogEntry,
  RelayedExecutionResult,
  McpBridgeClientOptions,
  Listener,
} from './mcp-bridge-client.ts';

export {
  AgentLogPanel,
} from './AgentLogPanel.tsx';

export type {
  AgentLogPanelProps,
} from './AgentLogPanel.tsx';
