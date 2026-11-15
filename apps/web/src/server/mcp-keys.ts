/// <reference types="@cloudflare/workers-types" />
import type { Env } from './env.ts';
import { getDb, type SqlClient } from './db.ts';
import { json, errorJson } from './http.ts';
import { requireSession, type SessionUser } from './auth.ts';
import { generateSessionToken, sha256Hex } from './crypto.ts';

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

export interface McpSyncSnapshot {
  activeProjectId: string | null;
  activeSchematicId: string | null;
  schematicRevision: number | null;
  schematicUpdatedAt: string | null;
  selectionState: McpSelectionSyncState | null;
  recentLogs: McpActivityLogItem[];
}

export interface UserMcpStateRecord {
  user_id: string;
  active_project_id: string | null;
  active_schematic_id: string | null;
  selection_state: McpSelectionSyncState | null;
  updated_at: string;
}

// ============================================================================
// Formatters
// ============================================================================

export function formatApiKey(row: Record<string, any>): McpApiKeySummary {
  return {
    id: String(row.id),
    name: String(row.name),
    keyPrefix: String(row.key_prefix),
    lastUsedAt: row.last_used_at
      ? row.last_used_at instanceof Date
        ? row.last_used_at.toISOString()
        : String(row.last_used_at)
      : null,
    createdAt:
      row.created_at instanceof Date
        ? row.created_at.toISOString()
        : String(row.created_at ?? new Date().toISOString()),
  };
}

export function formatActivityLogItem(row: Record<string, any>): McpActivityLogItem {
  let args: Record<string, unknown> | undefined = undefined;
  if (row.args_json !== undefined && row.args_json !== null) {
    if (typeof row.args_json === 'object') {
      args = row.args_json;
    } else if (typeof row.args_json === 'string') {
      try {
        args = JSON.parse(row.args_json);
      } catch {
        // ignore parse error
      }
    }
  }
  return {
    id: String(row.id),
    projectId: row.project_id ? String(row.project_id) : null,
    schematicId: row.schematic_id ? String(row.schematic_id) : null,
    tool: String(row.tool ?? ''),
    revision: Number(row.revision ?? 0),
    changedCells: Number(row.changed_cells ?? 0),
    summary: String(row.summary ?? ''),
    ...(args !== undefined ? { args } : {}),
    createdAt:
      row.created_at instanceof Date
        ? row.created_at.toISOString()
        : String(row.created_at ?? new Date().toISOString()),
  };
}

// ============================================================================
// Authentication
// ============================================================================

export function extractApiKeyFromRequest(request: Request): string | null {
  // 1. Authorization: Bearer <token>
  const authHeader = request.headers.get('Authorization') ?? request.headers.get('authorization');
  if (authHeader) {
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    if (match && match[1].trim()) {
      return match[1].trim();
    }
  }

  // 2. X-API-Key: <token>
  const apiKeyHeader = request.headers.get('X-API-Key') ?? request.headers.get('x-api-key');
  if (apiKeyHeader && apiKeyHeader.trim()) {
    return apiKeyHeader.trim();
  }

  // 3. URL query param apiKey or key
  try {
    const url = new URL(request.url);
    const keyParam = url.searchParams.get('apiKey') || url.searchParams.get('key');
    if (keyParam && keyParam.trim()) {
      return keyParam.trim();
    }
  } catch {
    // Non-standard request URL
  }

  return null;
}

/**
 * Authenticates an incoming request via an Account MCP API Key or session cookie fallback.
 * Checks Bearer token, X-API-Key header, or apiKey / key URL query parameter.
 * If found, validates key_hash against api_keys table, touches last_used_at, and returns SessionUser.
 * Falls back to cookie session authentication (requireSession) if no API key is provided or key not found.
 */
export async function requireMcpAuth(
  request: Request,
  env: Env,
  sqlOverride?: SqlClient
): Promise<SessionUser | null> {
  const token = extractApiKeyFromRequest(request);
  const sql = sqlOverride ?? getDb(env);

  if (token) {
    const keyHash = await sha256Hex(token.trim());
    try {
      const rows = (await sql`
        SELECT k.id AS key_id, k.user_id, u.username
        FROM api_keys k
        JOIN users u ON u.id = k.user_id
        WHERE k.key_hash = ${keyHash}
        LIMIT 1
      `) as Array<{ key_id: string; user_id: string; username: string }>;

      if (rows && rows.length > 0) {
        const row = rows[0];
        try {
          await sql`UPDATE api_keys SET last_used_at = now() WHERE id = ${row.key_id}`;
        } catch {
          // Best-effort touch, ignore errors for mock / read-only test databases
        }

        return {
          userId: String(row.user_id),
          username: String(row.username),
          sessionId: `apikey:${row.key_id}`,
        };
      }
    } catch {
      // Query failed or table not found; fall back to session
    }
  }

  return requireSession(request, env, sql);
}

// ============================================================================
// API Key CRUD Handlers
// ============================================================================

/**
 * GET /api/mcp/keys
 * Lists all MCP API keys owned by the authenticated user.
 */
export async function handleListApiKeys(
  request: Request,
  env: Env,
  sqlOverride?: SqlClient
): Promise<Response> {
  const sql = sqlOverride ?? getDb(env);
  const session = await requireMcpAuth(request, env, sql);
  if (!session) {
    return errorJson('Unauthorized', 401);
  }

  const rows = (await sql`
    SELECT id, user_id, name, key_prefix, last_used_at, created_at
    FROM api_keys
    WHERE user_id = ${session.userId}
    ORDER BY created_at DESC
  `) as Record<string, any>[];

  const keys: McpApiKeySummary[] = (rows ?? []).map(formatApiKey);
  return json({ keys }, 200);
}

/**
 * POST /api/mcp/keys
 * Creates a new Account MCP API Key for the authenticated user.
 * Generates an 'ese_mcp_...' token, stores its SHA-256 hash, and returns the raw key once.
 */
export async function handleCreateApiKey(
  request: Request,
  env: Env,
  sqlOverride?: SqlClient
): Promise<Response> {
  const sql = sqlOverride ?? getDb(env);
  const session = await requireMcpAuth(request, env, sql);
  if (!session) {
    return errorJson('Unauthorized', 401);
  }

  let name = 'AI MCP Key';
  try {
    const body = (await request.json()) as Record<string, any>;
    if (body && typeof body.name === 'string' && body.name.trim().length > 0) {
      name = body.name.trim();
    }
  } catch {
    // Body is optional or empty
  }

  const rawKey = 'ese_mcp_' + generateSessionToken().slice(0, 48);
  const keyPrefix = rawKey.slice(0, 14) + '...';
  const keyHash = await sha256Hex(rawKey);
  const id = crypto.randomUUID();

  const rows = (await sql`
    INSERT INTO api_keys (id, user_id, name, key_prefix, key_hash, created_at)
    VALUES (${id}, ${session.userId}, ${name}, ${keyPrefix}, ${keyHash}, now())
    RETURNING id, user_id, name, key_prefix, last_used_at, created_at
  `) as Record<string, any>[];

  return json({ key: formatApiKey(rows[0]), rawKey }, 201);
}

/**
 * DELETE /api/mcp/keys/:id
 * Revokes and deletes an MCP API key owned by the authenticated user.
 */
export async function handleRevokeApiKey(
  request: Request,
  env: Env,
  keyId: string,
  sqlOverride?: SqlClient
): Promise<Response> {
  const sql = sqlOverride ?? getDb(env);
  const session = await requireMcpAuth(request, env, sql);
  if (!session) {
    return errorJson('Unauthorized', 401);
  }

  const rows = (await sql`
    DELETE FROM api_keys
    WHERE id = ${keyId} AND user_id = ${session.userId}
    RETURNING id
  `) as Array<{ id: string }>;

  if (!rows || rows.length === 0) {
    return errorJson('API key not found', 404);
  }

  return json({ ok: true, id: keyId }, 200);
}

// ============================================================================
// MCP State & Activity Log Helpers
// ============================================================================

/**
 * Retrieves the MCP user state record for a given user.
 */
export async function getUserMcpState(
  sql: SqlClient,
  userId: string
): Promise<UserMcpStateRecord | null> {
  try {
    const rows = (await sql`
      SELECT user_id, active_project_id, active_schematic_id, selection_state, updated_at
      FROM mcp_user_state
      WHERE user_id = ${userId}
      LIMIT 1
    `) as Record<string, any>[];

    if (!rows || rows.length === 0) {
      return null;
    }

    const row = rows[0];
    let selectionState: McpSelectionSyncState | null = null;
    if (row.selection_state) {
      if (typeof row.selection_state === 'object') {
        selectionState = row.selection_state as McpSelectionSyncState;
      } else if (typeof row.selection_state === 'string') {
        try {
          selectionState = JSON.parse(row.selection_state);
        } catch {
          // ignore invalid json
        }
      }
    }

    return {
      user_id: String(row.user_id),
      active_project_id: row.active_project_id ? String(row.active_project_id) : null,
      active_schematic_id: row.active_schematic_id ? String(row.active_schematic_id) : null,
      selection_state: selectionState,
      updated_at:
        row.updated_at instanceof Date
          ? row.updated_at.toISOString()
          : String(row.updated_at ?? new Date().toISOString()),
    };
  } catch {
    return null;
  }
}

/**
 * Inserts or updates MCP user state (active project, active schematic, and selection state).
 */
export async function upsertUserMcpState(
  sql: SqlClient,
  userId: string,
  patch: {
    activeProjectId?: string | null;
    activeSchematicId?: string | null;
    selectionState?: McpSelectionSyncState | null;
  }
): Promise<UserMcpStateRecord> {
  const existing = await getUserMcpState(sql, userId);

  const nextProjectId =
    patch.activeProjectId !== undefined
      ? patch.activeProjectId
      : existing?.active_project_id ?? null;

  const nextSchemId =
    patch.activeSchematicId !== undefined
      ? patch.activeSchematicId
      : existing?.active_schematic_id ?? null;

  const nextSelectionState =
    patch.selectionState !== undefined
      ? patch.selectionState
      : existing?.selection_state ?? null;

  const selectionStateJson = nextSelectionState ? JSON.stringify(nextSelectionState) : null;

  if (existing) {
    const rows = (await sql`
      UPDATE mcp_user_state
      SET active_project_id = ${nextProjectId},
          active_schematic_id = ${nextSchemId},
          selection_state = ${selectionStateJson},
          updated_at = now()
      WHERE user_id = ${userId}
      RETURNING user_id, active_project_id, active_schematic_id, selection_state, updated_at
    `) as Record<string, any>[];

    const row = rows?.[0];
    return {
      user_id: userId,
      active_project_id: nextProjectId,
      active_schematic_id: nextSchemId,
      selection_state: nextSelectionState,
      updated_at:
        row?.updated_at instanceof Date
          ? row.updated_at.toISOString()
          : String(row?.updated_at ?? new Date().toISOString()),
    };
  } else {
    const rows = (await sql`
      INSERT INTO mcp_user_state (user_id, active_project_id, active_schematic_id, selection_state, updated_at)
      VALUES (${userId}, ${nextProjectId}, ${nextSchemId}, ${selectionStateJson}, now())
      RETURNING user_id, active_project_id, active_schematic_id, selection_state, updated_at
    `) as Record<string, any>[];

    const row = rows?.[0];
    return {
      user_id: userId,
      active_project_id: nextProjectId,
      active_schematic_id: nextSchemId,
      selection_state: nextSelectionState,
      updated_at:
        row?.updated_at instanceof Date
          ? row.updated_at.toISOString()
          : String(row?.updated_at ?? new Date().toISOString()),
    };
  }
}

/**
 * Appends an entry to the user's MCP activity log.
 */
export async function appendMcpActivityLog(
  sql: SqlClient,
  entry: {
    userId: string;
    projectId?: string | null;
    schematicId?: string | null;
    tool: string;
    revision: number;
    changedCells: number;
    summary: string;
    args?: Record<string, unknown>;
  }
): Promise<McpActivityLogItem> {
  const id = crypto.randomUUID();
  const projectId = entry.projectId ?? null;
  const schematicId = entry.schematicId ?? null;
  const tool = entry.tool;
  const revision = entry.revision ?? 0;
  const changedCells = entry.changedCells ?? 0;
  const summary = entry.summary ?? '';
  const argsJson = entry.args ? JSON.stringify(entry.args) : null;

  try {
    const rows = (await sql`
      INSERT INTO mcp_activity_log (id, user_id, project_id, schematic_id, tool, revision, changed_cells, summary, args_json, created_at)
      VALUES (${id}, ${entry.userId}, ${projectId}, ${schematicId}, ${tool}, ${revision}, ${changedCells}, ${summary}, ${argsJson}, now())
      RETURNING id, project_id, schematic_id, tool, revision, changed_cells, summary, args_json, created_at
    `) as Record<string, any>[];

    if (rows && rows.length > 0) {
      return formatActivityLogItem(rows[0]);
    }
  } catch {
    // Fall back to returned local item if table/insert fails in mock
  }

  return {
    id,
    projectId,
    schematicId,
    tool,
    revision,
    changedCells,
    summary,
    ...(entry.args ? { args: entry.args } : {}),
    createdAt: new Date().toISOString(),
  };
}

/**
 * GET /api/mcp/sync
 * Retrieves current MCP synchronization snapshot for the user:
 * active project, active schematic, revision, selection state, and recent activity logs.
 */
export async function handleGetMcpSyncState(
  request: Request,
  env: Env,
  sqlOverride?: SqlClient
): Promise<Response> {
  const sql = sqlOverride ?? getDb(env);
  const session = await requireMcpAuth(request, env, sql);
  if (!session) {
    return errorJson('Unauthorized', 401);
  }

  let querySchematicId: string | null = null;
  try {
    const url = new URL(request.url);
    querySchematicId = url.searchParams.get('schematicId') || null;
  } catch {
    // ignore
  }

  const userState = await getUserMcpState(sql, session.userId);
  const targetSchemId = querySchematicId || userState?.active_schematic_id || null;

  let activeProjectId: string | null = userState?.active_project_id || null;
  let activeSchematicId: string | null = userState?.active_schematic_id || null;
  let schematicRevision: number | null = null;
  let schematicUpdatedAt: string | null = null;

  if (targetSchemId) {
    activeSchematicId = targetSchemId;
    try {
      const schemRows = (await sql`
        SELECT id, project_id, name, revision, placement_count, updated_at
        FROM schematics
        WHERE id = ${targetSchemId} AND user_id = ${session.userId}
        LIMIT 1
      `) as Record<string, any>[];

      if (schemRows && schemRows.length > 0) {
        const row = schemRows[0];
        if (row.project_id) {
          activeProjectId = String(row.project_id);
        }
        schematicRevision = Number(row.revision ?? 1);
        schematicUpdatedAt =
          row.updated_at instanceof Date
            ? row.updated_at.toISOString()
            : String(row.updated_at ?? new Date().toISOString());
      }
    } catch {
      // ignore
    }
  }

  let recentLogs: McpActivityLogItem[] = [];
  try {
    const logRows = (await sql`
      SELECT id, project_id, schematic_id, tool, revision, changed_cells, summary, args_json, created_at
      FROM mcp_activity_log
      WHERE user_id = ${session.userId}
      ORDER BY created_at DESC
      LIMIT 25
    `) as Record<string, any>[];

    recentLogs = (logRows ?? []).map(formatActivityLogItem);
  } catch {
    // ignore
  }

  const snapshot: McpSyncSnapshot = {
    activeProjectId,
    activeSchematicId,
    schematicRevision,
    schematicUpdatedAt,
    selectionState: userState?.selection_state ?? null,
    recentLogs,
  };

  return json(snapshot, 200);
}

/**
 * PUT /api/mcp/sync
 * Updates the MCP synchronization state for the authenticated user.
 */
export async function handleUpdateMcpSyncState(
  request: Request,
  env: Env,
  sqlOverride?: SqlClient
): Promise<Response> {
  const sql = sqlOverride ?? getDb(env);
  const session = await requireMcpAuth(request, env, sql);
  if (!session) {
    return errorJson('Unauthorized', 401);
  }

  let body: Record<string, any> = {};
  try {
    body = (await request.json()) as Record<string, any>;
  } catch {
    return errorJson('Invalid JSON payload', 400);
  }

  const patch: {
    activeProjectId?: string | null;
    activeSchematicId?: string | null;
    selectionState?: McpSelectionSyncState | null;
  } = {};

  if ('activeProjectId' in body) {
    patch.activeProjectId = body.activeProjectId ? String(body.activeProjectId) : null;
  }
  if ('activeSchematicId' in body) {
    patch.activeSchematicId = body.activeSchematicId ? String(body.activeSchematicId) : null;
  }
  if ('selectionState' in body) {
    patch.selectionState = body.selectionState ?? null;
  }

  const state = await upsertUserMcpState(sql, session.userId, patch);
  return json({ ok: true, state }, 200);
}
