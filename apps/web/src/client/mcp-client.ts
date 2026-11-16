// apps/web/src/client/mcp-client.ts
// Typed browser client SDK for EasySchemEdit MCP API Keys, Live Sync State, and Cloud MCP Tools.

import type { ClipboardEntry } from '@easyschemedit/operations';

// ============================================================================
// Types
// ============================================================================

export interface McpApiKeySummary {
  id: string;
  name: string;
  keyPrefix: string;
  lastUsedAt: string | null;
  createdAt: string;
}

export interface McpActivityLogItem {
  id: string;
  projectId: string | null;
  schematicId: string | null;
  tool: string;
  revision: number;
  changedCells: number;
  summary: string;
  args?: Record<string, unknown>;
  createdAt: string;
}

export interface McpSelectionSyncState {
  schematicId: string | null;
  savedRegions: Array<{
    id: string;
    name: string;
    pos1: [number, number, number];
    pos2: [number, number, number];
    bounds: {
      min: [number, number, number];
      maxExclusive: [number, number, number];
    };
  }>;
  activeRegionId: string | null;
  bounds: {
    min: [number, number, number];
    maxExclusive: [number, number, number];
  } | null;
  pos1: [number, number, number] | null;
  pos2: [number, number, number] | null;
  updatedAt: string;
}

export interface SerializedClipboardBlockData {
  localPos: readonly [number, number, number];
  state: {
    id: string;
    props?: Readonly<Record<string, string>>;
    properties?: Record<string, string>;
  };
}

export interface SerializedClipboardData {
  blocks: SerializedClipboardBlockData[];
  blockEntities: Array<[string, unknown]>;
  entities: unknown[];
  biomes: unknown;
  anchor: readonly [number, number, number];
  bounds: {
    min: readonly [number, number, number];
    maxExclusive: readonly [number, number, number];
  };
}

export interface SerializedClipboardEntry {
  id: string;
  data: SerializedClipboardData;
  createdAt: number;
  sourceProjectId: string;
  scope: 'effective-composite' | 'source-placement';
}

export interface McpClipboardSyncState {
  entries: SerializedClipboardEntry[];
  updatedAt: string;
}

export interface McpSyncSnapshot {
  activeProjectId: string | null;
  activeSchematicId: string | null;
  schematicRevision: number | null;
  schematicUpdatedAt: string | null;
  selectionState: McpSelectionSyncState | null;
  clipboardState?: McpClipboardSyncState | null;
  recentLogs: McpActivityLogItem[];
}

export interface UserMcpStateDto {
  user_id: string;
  active_project_id: string | null;
  active_schematic_id: string | null;
  selection_state: McpSelectionSyncState | null;
  clipboard_state?: McpClipboardSyncState | null;
  updated_at: string;
}

export function serializeClipboardEntries(entries: ClipboardEntry[]): SerializedClipboardEntry[] {
  return (entries || []).map((e) => ({
    id: e.id,
    data: {
      blocks: (e.data.blocks || []).map((b) => ({
        localPos: [b.localPos[0], b.localPos[1], b.localPos[2]] as const,
        state: {
          id: b.state.id,
          props: b.state.props ?? {},
        },
      })),
      blockEntities: e.data.blockEntities instanceof Map
        ? Array.from(e.data.blockEntities.entries())
        : Array.isArray(e.data.blockEntities)
        ? (e.data.blockEntities as Array<[string, unknown]>)
        : [],
      entities: e.data.entities ?? [],
      biomes: e.data.biomes,
      anchor: [e.data.anchor[0], e.data.anchor[1], e.data.anchor[2]] as const,
      bounds: {
        min: [e.data.bounds.min[0], e.data.bounds.min[1], e.data.bounds.min[2]] as const,
        maxExclusive: [e.data.bounds.maxExclusive[0], e.data.bounds.maxExclusive[1], e.data.bounds.maxExclusive[2]] as const,
      },
    },
    createdAt: e.createdAt,
    sourceProjectId: e.sourceProjectId,
    scope: e.scope,
  }));
}

// ============================================================================
// Internal Helpers
// ============================================================================

async function extractErrorMessage(res: Response, fallback: string): Promise<string> {
  try {
    const data = (await res.json()) as { error?: string; message?: string };
    if (data.error) return data.error;
    if (data.message) return data.message;
  } catch {
    // Non-JSON response
  }
  return `${fallback} (${res.status} ${res.statusText})`;
}

// ============================================================================
// Client Functions
// ============================================================================

/**
 * Lists all Account MCP API Keys for the current user.
 */
export async function listMcpApiKeys(apiKey?: string): Promise<McpApiKeySummary[]> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
  };
  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }

  const res = await fetch('/api/mcp/keys', {
    method: 'GET',
    headers,
  });

  if (!res.ok) {
    const msg = await extractErrorMessage(res, 'Failed to list MCP API keys');
    throw new Error(msg);
  }

  const data = (await res.json()) as { keys?: McpApiKeySummary[] };
  return data.keys ?? [];
}

/**
 * Creates a new Account MCP API Key.
 * Returns the created key summary and the raw plaintext key (shown only once).
 */
export async function createMcpApiKey(
  name = 'AI MCP Key',
  apiKey?: string
): Promise<{ key: McpApiKeySummary; rawKey: string }> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };
  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }

  const res = await fetch('/api/mcp/keys', {
    method: 'POST',
    headers,
    body: JSON.stringify({ name }),
  });

  if (!res.ok) {
    const msg = await extractErrorMessage(res, 'Failed to create MCP API key');
    throw new Error(msg);
  }

  const data = (await res.json()) as { key: McpApiKeySummary; rawKey: string };
  return { key: data.key, rawKey: data.rawKey };
}

/**
 * Revokes and deletes an Account MCP API Key by ID.
 */
export async function revokeMcpApiKey(
  id: string,
  apiKey?: string
): Promise<{ ok: boolean; id: string }> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
  };
  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }

  const res = await fetch(`/api/mcp/keys/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers,
  });

  if (!res.ok) {
    const msg = await extractErrorMessage(res, 'Failed to revoke MCP API key');
    throw new Error(msg);
  }

  const data = (await res.json()) as { ok?: boolean; id?: string };
  return { ok: data.ok ?? true, id: data.id ?? id };
}

/**
 * Retrieves the current MCP sync snapshot for the user:
 * active project, active schematic, revision, selection state, and recent activity logs.
 */
export async function getMcpSyncState(
  schematicId?: string | null,
  apiKey?: string
): Promise<McpSyncSnapshot> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
  };
  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }

  const url = schematicId
    ? `/api/mcp/sync?schematicId=${encodeURIComponent(schematicId)}`
    : '/api/mcp/sync';

  const res = await fetch(url, {
    method: 'GET',
    headers,
  });

  if (!res.ok) {
    const msg = await extractErrorMessage(res, 'Failed to get MCP sync state');
    throw new Error(msg);
  }

  return (await res.json()) as McpSyncSnapshot;
}

/**
 * Updates the user's active project, active schematic, or selection state in cloud sync.
 */
export async function updateMcpSyncState(
  patch: {
    activeProjectId?: string | null;
    activeSchematicId?: string | null;
    selectionState?: McpSelectionSyncState | null;
    clipboardState?: McpClipboardSyncState | null;
  },
  apiKey?: string
): Promise<{ ok: boolean; state: UserMcpStateDto }> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };
  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }

  const res = await fetch('/api/mcp/sync', {
    method: 'PUT',
    headers,
    body: JSON.stringify(patch),
  });

  if (!res.ok) {
    const msg = await extractErrorMessage(res, 'Failed to update MCP sync state');
    throw new Error(msg);
  }

  return (await res.json()) as { ok: boolean; state: UserMcpStateDto };
}

/**
 * Calls a Cloud MCP Tool via JSON-RPC 2.0 tools/call against /api/mcp.
 * Returns the parsed tool result.
 */
export async function callCloudMcpTool(
  toolName: string,
  args: Record<string, unknown>,
  apiKey?: string
): Promise<any> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };
  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }

  const reqId =
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `mcp-${Date.now()}-${Math.floor(Math.random() * 100000)}`;

  const res = await fetch('/api/mcp', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: reqId,
      method: 'tools/call',
      params: {
        name: toolName,
        arguments: args,
      },
    }),
  });

  if (!res.ok) {
    const msg = await extractErrorMessage(res, `Failed to call tool '${toolName}'`);
    throw new Error(msg);
  }

  const jsonRpcResponse = (await res.json()) as {
    jsonrpc: string;
    id: string | number;
    result?: any;
    error?: { code?: number; message?: string; data?: unknown };
  };

  if (jsonRpcResponse.error) {
    const errMsg = jsonRpcResponse.error.message || JSON.stringify(jsonRpcResponse.error);
    throw new Error(`MCP tool error [${toolName}]: ${errMsg}`);
  }

  if (
    jsonRpcResponse.result &&
    typeof jsonRpcResponse.result === 'object' &&
    jsonRpcResponse.result.isError
  ) {
    const text = Array.isArray(jsonRpcResponse.result.content)
      ? jsonRpcResponse.result.content
          .map((c: any) => (typeof c === 'object' && c && 'text' in c ? String(c.text) : ''))
          .join('\n')
      : 'Tool execution failed';
    throw new Error(text || `Tool '${toolName}' returned an error`);
  }

  return jsonRpcResponse.result;
}
