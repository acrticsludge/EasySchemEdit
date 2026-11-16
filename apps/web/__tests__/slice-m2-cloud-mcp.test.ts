import worker from '../src/worker.ts';
import { sha256Hex } from '../src/server/crypto.ts';
import type { Env } from '../src/server/env.ts';
import type { SqlClient } from '../src/server/db.ts';
import { CLOUD_MCP_TOOLS } from '../src/server/mcp-server.ts';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

console.log('Running Slice M2 Cloud Streamable HTTP & JSON-RPC MCP Server tests...');

// ============================================================================
// Mock DB & R2 Bucket
// ============================================================================

interface MockUser {
  id: string;
  username: string;
}

interface MockSession {
  id: string;
  user_id: string;
  username: string;
  token_hash: string;
  expires_at: Date;
}

interface MockApiKey {
  id: string;
  user_id: string;
  name: string;
  key_prefix: string;
  key_hash: string;
  last_used_at: Date | null;
  created_at: Date;
}

interface MockProject {
  id: string;
  user_id: string;
  name: string;
  revision: number;
  placement_count: number;
  r2_key: string;
  size_bytes: number;
  created_at: Date;
  updated_at: Date;
}

interface MockSchematic {
  id: string;
  project_id: string;
  user_id: string;
  name: string;
  revision: number;
  placement_count: number;
  r2_key: string;
  size_bytes: number;
  created_at: Date;
  updated_at: Date;
}

interface MockUserState {
  user_id: string;
  active_project_id: string | null;
  active_schematic_id: string | null;
  selection_state: any;
  clipboard_state?: any;
  updated_at: Date;
}

interface MockActivityLog {
  id: string;
  user_id: string;
  project_id: string | null;
  schematic_id: string | null;
  tool: string;
  revision: number;
  changed_cells: number;
  summary: string;
  args_json: string | null;
  created_at: Date;
}

class TestMockDb {
  users: MockUser[] = [{ id: 'user-mcp-1', username: 'architect_alex' }];
  sessions: MockSession[] = [];
  apiKeys: MockApiKey[] = [];
  projects: MockProject[] = [];
  schematics: MockSchematic[] = [];
  userStates: MockUserState[] = [];
  activityLogs: MockActivityLog[] = [];

  createSqlClient(): SqlClient {
    const self = this;
    const client = (async (strings: TemplateStringsArray, ...values: any[]) => {
      let query = '';
      for (let i = 0; i < strings.length; i++) {
        query += strings[i];
        if (i < values.length) {
          query += `$${i + 1}`;
        }
      }
      const q = query.replace(/\s+/g, ' ').trim();

      // 1. SELECT FROM sessions
      if (q.includes('FROM sessions s') && q.includes('token_hash = $1')) {
        const tokenHash = values[0];
        const now = new Date();
        const found = self.sessions.find(
          (s) => s.token_hash === tokenHash && s.expires_at > now
        );
        if (!found) return [];
        return [{ session_id: found.id, user_id: found.user_id, username: found.username }];
      }

      // 2. SELECT FROM api_keys (for requireMcpAuth)
      if (q.includes('FROM api_keys k') && q.includes('k.key_hash = $1')) {
        const keyHash = values[0];
        const found = self.apiKeys.find((k) => k.key_hash === keyHash);
        if (!found) return [];
        const u = self.users.find((user) => user.id === found.user_id);
        return [{ key_id: found.id, user_id: found.user_id, username: u?.username ?? 'user' }];
      }

      // 3. UPDATE api_keys SET last_used_at
      if (q.startsWith('UPDATE api_keys SET last_used_at = now() WHERE id = $1')) {
        const keyId = values[0];
        const found = self.apiKeys.find((k) => k.id === keyId);
        if (found) found.last_used_at = new Date();
        return [];
      }

      // 4. SELECT FROM api_keys WHERE user_id = $1
      if (q.startsWith('SELECT id, user_id, name, key_prefix, last_used_at, created_at FROM api_keys WHERE user_id = $1')) {
        const userId = values[0];
        return self.apiKeys.filter((k) => k.user_id === userId).sort((a, b) => b.created_at.getTime() - a.created_at.getTime());
      }

      // 5. INSERT INTO api_keys
      if (q.startsWith('INSERT INTO api_keys')) {
        const [id, userId, name, keyPrefix, keyHash] = values;
        const now = new Date();
        const newKey: MockApiKey = {
          id,
          user_id: userId,
          name,
          key_prefix: keyPrefix,
          key_hash: keyHash,
          last_used_at: null,
          created_at: now,
        };
        self.apiKeys.push(newKey);
        return [{ ...newKey }];
      }

      // 6. DELETE FROM api_keys WHERE id = $1 AND user_id = $2
      if (q.startsWith('DELETE FROM api_keys WHERE id = $1 AND user_id = $2')) {
        const [id, userId] = values;
        const idx = self.apiKeys.findIndex((k) => k.id === id && k.user_id === userId);
        if (idx === -1) return [];
        const [deleted] = self.apiKeys.splice(idx, 1);
        return [{ id: deleted.id }];
      }

      // 7. SELECT count(*) FROM projects / schematics
      if (q.includes('SELECT count(*)::int AS cnt FROM projects WHERE user_id = $1')) {
        const userId = values[0];
        const cnt = self.projects.filter((p) => p.user_id === userId).length;
        return [{ cnt }];
      }
      if (q.includes('SELECT count(*)::int AS cnt FROM schematics WHERE user_id = $1')) {
        const userId = values[0];
        const cnt = self.schematics.filter((s) => s.user_id === userId).length;
        return [{ cnt }];
      }

      // 8. SELECT FROM projects WHERE user_id = $1 ORDER BY updated_at DESC
      if (q.startsWith('SELECT id, user_id, name, revision, placement_count, r2_key, size_bytes, created_at, updated_at FROM projects WHERE user_id = $1 ORDER BY updated_at DESC')) {
        const userId = values[0];
        return self.projects
          .filter((p) => p.user_id === userId)
          .sort((a, b) => b.updated_at.getTime() - a.updated_at.getTime())
          .map((p) => ({ ...p }));
      }

      // 9. SELECT id FROM projects WHERE user_id = $1 ORDER BY updated_at DESC LIMIT 1
      if (q.startsWith('SELECT id FROM projects WHERE user_id = $1 ORDER BY updated_at DESC LIMIT 1')) {
        const userId = values[0];
        const found = self.projects
          .filter((p) => p.user_id === userId)
          .sort((a, b) => b.updated_at.getTime() - a.updated_at.getTime());
        if (found.length === 0) return [];
        return [{ id: found[0].id }];
      }

      // 10. SELECT FROM projects WHERE id = $1 AND user_id = $2
      if (q.startsWith('SELECT') && q.includes('FROM projects') && q.includes('WHERE id = $1 AND user_id = $2')) {
        const [id, userId] = values;
        const found = self.projects.find((p) => p.id === id && p.user_id === userId);
        if (!found) return [];
        return [{ ...found }];
      }

      // 11. INSERT INTO projects
      if (q.startsWith('INSERT INTO projects')) {
        let id: string = values[0];
        let userId: string = values[1];
        let name: string = values[2];
        let revision = 1;
        let placementCount = 0;
        let r2Key = '';
        let sizeBytes = 0;
        if (values.length === 4) {
          r2Key = values[3];
        } else if (values.length >= 7) {
          revision = Number(values[3]);
          placementCount = Number(values[4]);
          r2Key = values[5];
          sizeBytes = Number(values[6]);
        }
        const now = new Date();
        const newProj: MockProject = {
          id,
          user_id: userId,
          name,
          revision,
          placement_count: placementCount,
          r2_key: r2Key,
          size_bytes: sizeBytes,
          created_at: now,
          updated_at: now,
        };
        self.projects.push(newProj);
        return [{ ...newProj }];
      }

      // 12. UPDATE projects
      if (q.startsWith('UPDATE projects')) {
        if (q.includes('SET name = $1') && q.includes('WHERE id = $2 AND user_id = $3')) {
          const [name, id, userId] = values;
          const found = self.projects.find((p) => p.id === id && p.user_id === userId);
          if (!found) return [];
          found.name = name;
          found.updated_at = new Date();
          return [{ ...found }];
        }
        if (q.includes('SET updated_at = now() WHERE id = $1 AND user_id = $2')) {
          const [id, userId] = values;
          const found = self.projects.find((p) => p.id === id && p.user_id === userId);
          if (found) found.updated_at = new Date();
          return [];
        }
      }

      // 13. DELETE FROM projects WHERE id = $1 AND user_id = $2
      if (q.startsWith('DELETE FROM projects WHERE id = $1 AND user_id = $2')) {
        const [id, userId] = values;
        const idx = self.projects.findIndex((p) => p.id === id && p.user_id === userId);
        if (idx === -1) return [];
        const [deleted] = self.projects.splice(idx, 1);
        self.schematics = self.schematics.filter((s) => s.project_id !== id);
        return [{ r2_key: deleted.r2_key }];
      }

      // 14. SELECT FROM schematics WHERE project_id = $1 AND user_id = $2 (child lookup during delete or list)
      if (q.startsWith('SELECT') && q.includes('FROM schematics') && q.includes('WHERE project_id = $1 AND user_id = $2')) {
        const [projectId, userId] = values;
        const list = self.schematics.filter((s) => s.project_id === projectId && s.user_id === userId);
        if (q.includes('r2_key')) {
          return list.map((s) => ({ r2_key: s.r2_key }));
        }
        return list.sort((a, b) => b.updated_at.getTime() - a.updated_at.getTime()).map((s) => ({ ...s }));
      }

      // 15. SELECT FROM schematics WHERE user_id = $1 ORDER BY updated_at DESC
      if (q.startsWith('SELECT') && q.includes('FROM schematics') && q.includes('WHERE user_id = $1') && q.includes('ORDER BY updated_at DESC')) {
        const userId = values[0];
        let list = self.schematics
          .filter((s) => s.user_id === userId)
          .sort((a, b) => b.updated_at.getTime() - a.updated_at.getTime());
        if (q.includes('LIMIT 1')) {
          list = list.slice(0, 1);
        } else if (q.includes('LIMIT 50')) {
          list = list.slice(0, 50);
        }
        return list.map((s) => ({ ...s }));
      }

      // 16. SELECT FROM schematics WHERE id = $1 AND user_id = $2
      if (q.startsWith('SELECT') && q.includes('FROM schematics') && q.includes('WHERE id = $1 AND user_id = $2')) {
        const [id, userId] = values;
        const found = self.schematics.find((s) => s.id === id && s.user_id === userId);
        if (!found) return [];
        return [{ ...found }];
      }

      // 17. INSERT INTO schematics
      if (q.startsWith('INSERT INTO schematics')) {
        let id: string = values[0];
        let projectId: string = values[1];
        let userId: string = values[2];
        let name: string = values[3];
        let revision = 1;
        let placementCount = 0;
        let r2Key = '';
        let sizeBytes = 0;
        if (values.length === 6) {
          r2Key = values[4];
          sizeBytes = Number(values[5]);
        } else if (values.length >= 8) {
          revision = Number(values[4]);
          placementCount = Number(values[5]);
          r2Key = values[6];
          sizeBytes = Number(values[7]);
        }
        const now = new Date();
        const newSchem: MockSchematic = {
          id,
          project_id: projectId,
          user_id: userId,
          name,
          revision,
          placement_count: placementCount,
          r2_key: r2Key,
          size_bytes: sizeBytes,
          created_at: now,
          updated_at: now,
        };
        self.schematics.push(newSchem);
        return [{ ...newSchem }];
      }

      // 18. UPDATE schematics
      if (q.startsWith('UPDATE schematics')) {
        if (q.includes('SET name = $1')) {
          const [name, id, userId] = values;
          const found = self.schematics.find((s) => s.id === id && s.user_id === userId);
          if (!found) return [];
          found.name = name;
          found.updated_at = new Date();
          return [{ ...found }];
        }
        if (q.includes('SET revision = $1')) {
          const [rev, pCount, size, id, userId] = values;
          const found = self.schematics.find((s) => s.id === id && s.user_id === userId);
          if (!found) return [];
          found.revision = Number(rev);
          found.placement_count = Number(pCount);
          found.size_bytes = Number(size);
          found.updated_at = new Date();
          return [{ ...found }];
        }
      }

      // 19. DELETE FROM schematics WHERE id = $1 AND user_id = $2
      if (q.startsWith('DELETE FROM schematics WHERE id = $1 AND user_id = $2')) {
        const [id, userId] = values;
        const idx = self.schematics.findIndex((s) => s.id === id && s.user_id === userId);
        if (idx === -1) return [];
        const [deleted] = self.schematics.splice(idx, 1);
        return [{ project_id: deleted.project_id, r2_key: deleted.r2_key }];
      }

      // 20. MCP User State
      if (q.includes('FROM mcp_user_state WHERE user_id = $1')) {
        const userId = values[0];
        const found = self.userStates.find((u) => u.user_id === userId);
        if (!found) return [];
        return [{
          user_id: found.user_id,
          active_project_id: found.active_project_id,
          active_schematic_id: found.active_schematic_id,
          selection_state: found.selection_state,
          clipboard_state: found.clipboard_state ?? null,
          updated_at: found.updated_at,
        }];
      }
      if (q.startsWith('INSERT INTO mcp_user_state')) {
        const userId = values[0];
        const projId = values[1];
        const schemId = values[2];
        const selJson = values[3];
        const clipJson = values.length >= 5 ? values[4] : null;
        const now = new Date();
        const newState: MockUserState = {
          user_id: userId,
          active_project_id: projId,
          active_schematic_id: schemId,
          selection_state: selJson ? (typeof selJson === 'string' ? JSON.parse(selJson) : selJson) : null,
          clipboard_state: clipJson ? (typeof clipJson === 'string' ? JSON.parse(clipJson) : clipJson) : null,
          updated_at: now,
        };
        self.userStates = self.userStates.filter((u) => u.user_id !== userId);
        self.userStates.push(newState);
        return [{ ...newState }];
      }
      if (q.startsWith('UPDATE mcp_user_state')) {
        const projId = values[0];
        const schemId = values[1];
        const selJson = values[2];
        let clipJson: any = null;
        let userId: string;
        if (values.length >= 5) {
          clipJson = values[3];
          userId = values[4];
        } else {
          userId = values[3];
        }
        let found = self.userStates.find((u) => u.user_id === userId);
        const now = new Date();
        if (found) {
          found.active_project_id = projId;
          found.active_schematic_id = schemId;
          found.selection_state = selJson ? (typeof selJson === 'string' ? JSON.parse(selJson) : selJson) : null;
          if (values.length >= 5) {
            found.clipboard_state = clipJson ? (typeof clipJson === 'string' ? JSON.parse(clipJson) : clipJson) : null;
          }
          found.updated_at = now;
        } else {
          found = {
            user_id: userId,
            active_project_id: projId,
            active_schematic_id: schemId,
            selection_state: selJson ? (typeof selJson === 'string' ? JSON.parse(selJson) : selJson) : null,
            clipboard_state: clipJson ? (typeof clipJson === 'string' ? JSON.parse(clipJson) : clipJson) : null,
            updated_at: now,
          };
          self.userStates.push(found);
        }
        return [{ ...found }];
      }

      // 21. MCP Activity Log
      if (q.startsWith('INSERT INTO mcp_activity_log')) {
        const [id, userId, projId, schemId, tool, rev, cells, sum, argsJson] = values;
        const now = new Date();
        const logItem: MockActivityLog = {
          id,
          user_id: userId,
          project_id: projId,
          schematic_id: schemId,
          tool,
          revision: Number(rev),
          changed_cells: Number(cells),
          summary: sum,
          args_json: argsJson,
          created_at: now,
        };
        self.activityLogs.push(logItem);
        return [{ ...logItem }];
      }
      if (q.includes('FROM mcp_activity_log WHERE user_id = $1')) {
        const userId = values[0];
        return self.activityLogs
          .filter((l) => l.user_id === userId)
          .sort((a, b) => b.created_at.getTime() - a.created_at.getTime())
          .slice(0, 25)
          .map((l) => ({ ...l }));
      }

      return [];
    }) as unknown as SqlClient;

    return client;
  }
}

class TestMockR2Bucket {
  objects = new Map<string, { body: Uint8Array; metadata?: any }>();

  async get(key: string) {
    const item = this.objects.get(key);
    if (!item) return null;
    return {
      body: item.body,
      arrayBuffer: async () => item.body.buffer.slice(item.body.byteOffset, item.body.byteOffset + item.body.byteLength),
    };
  }

  async put(key: string, value: any, options?: any) {
    let bytes: Uint8Array;
    if (value instanceof Uint8Array) {
      bytes = value;
    } else if (value instanceof ArrayBuffer) {
      bytes = new Uint8Array(value);
    } else if (ArrayBuffer.isView(value)) {
      bytes = new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    } else {
      bytes = new Uint8Array();
    }
    this.objects.set(key, { body: bytes, metadata: options?.httpMetadata });
    return { key, size: bytes.byteLength };
  }

  async delete(key: string) {
    this.objects.delete(key);
  }
}

// ============================================================================
// Test Suite Setup
// ============================================================================

const mockDb = new TestMockDb();
const mockR2 = new TestMockR2Bucket();
const sql = mockDb.createSqlClient();

const testEnv: Env & { sqlOverride?: SqlClient } = {
  ASSETS: {
    fetch: async () => new Response('Not Found', { status: 404 }),
  } as any,
  PROJECTS_BUCKET: mockR2 as any,
  NEON_DATABASE_URL: 'postgres://mock:mock@localhost/easyschemedit',
  SESSION_SECRET: 'test-cloud-mcp-secret',
  sqlOverride: sql,
};

// Seed initial session for user-mcp-1
const sessionToken = 'sess_token_alex_12345';
const sessionTokenHash = await sha256Hex(sessionToken);
mockDb.sessions.push({
  id: 'sess-alex-1',
  user_id: 'user-mcp-1',
  username: 'architect_alex',
  token_hash: sessionTokenHash,
  expires_at: new Date(Date.now() + 24 * 3600 * 1000),
});

let apiKeyRaw = '';
let apiKeyId = '';

// ============================================================================
// 1. MCP API Keys CRUD & Authentication tests
// ============================================================================
console.log('Testing 1: MCP API Keys CRUD & Multi-Transport Authentication...');

// 1a. Create API Key
{
  const req = new Request('http://localhost/api/mcp/keys', {
    method: 'POST',
    headers: {
      Cookie: `ese_session=${sessionToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ name: 'Cursor Claude Key' }),
  });
  const res = await worker.fetch(req, testEnv, {} as any);
  assert(res.status === 201, 'POST /api/mcp/keys should return 201');
  const data = await res.json() as any;
  assert(data.key && data.rawKey, 'Response should contain key object and rawKey');
  assert(data.rawKey.startsWith('ese_mcp_'), 'Raw key must start with ese_mcp_');
  assert(data.key.name === 'Cursor Claude Key', 'Key name should match');
  apiKeyRaw = data.rawKey;
  apiKeyId = data.key.id;
}

// 1b. List API Keys
{
  const req = new Request('http://localhost/api/mcp/keys', {
    method: 'GET',
    headers: { Cookie: `ese_session=${sessionToken}` },
  });
  const res = await worker.fetch(req, testEnv, {} as any);
  assert(res.status === 200, 'GET /api/mcp/keys should return 200');
  const data = await res.json() as any;
  assert(Array.isArray(data.keys) && data.keys.length === 1, 'Should list 1 active API key');
  assert(data.keys[0].id === apiKeyId, 'Key ID should match created key');
}

// 1c. Method guard on /api/mcp/keys (PUT should return 405)
{
  const req = new Request('http://localhost/api/mcp/keys', {
    method: 'PUT',
    headers: { Cookie: `ese_session=${sessionToken}` },
  });
  const res = await worker.fetch(req, testEnv, {} as any);
  assert(res.status === 405, 'PUT /api/mcp/keys should return 405 Method Not Allowed');
}

// 1d. Auth via Authorization: Bearer ese_mcp_... on /api/mcp
{
  const req = new Request('http://localhost/api/mcp', {
    method: 'GET',
    headers: { Authorization: `Bearer ${apiKeyRaw}` },
  });
  const res = await worker.fetch(req, testEnv, {} as any);
  assert(res.status === 200, 'GET /api/mcp with Bearer token should return 200');
  const data = await res.json() as any;
  assert(data.ok === true, 'Response should have ok: true');
  assert(data.user?.id === 'user-mcp-1', 'User ID should match');
  assert(data.serverInfo?.name === 'easyschemedit-cloud-mcp', 'Server name should match');
}

// 1e. Auth via X-API-Key header
{
  const req = new Request('http://localhost/mcp', {
    method: 'GET',
    headers: { 'X-API-Key': apiKeyRaw },
  });
  const res = await worker.fetch(req, testEnv, {} as any);
  assert(res.status === 200, 'GET /mcp with X-API-Key header should return 200');
}

// 1f. Auth via ?apiKey= query parameter
{
  const req = new Request(`http://localhost/api/mcp?apiKey=${apiKeyRaw}`, {
    method: 'GET',
  });
  const res = await worker.fetch(req, testEnv, {} as any);
  assert(res.status === 200, 'GET /api/mcp with ?apiKey= query param should return 200');
}

// 1g. Unauthorized request (missing token) returns 401
{
  const req = new Request('http://localhost/api/mcp', { method: 'GET' });
  const res = await worker.fetch(req, testEnv, {} as any);
  assert(res.status === 401, 'Unauthenticated GET /api/mcp should return 401');

  const postReq = new Request('http://localhost/api/mcp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping' }),
  });
  const postRes = await worker.fetch(postReq, testEnv, {} as any);
  assert(postRes.status === 401, 'Unauthenticated POST /api/mcp should return 401');
  const postErr = await postRes.json() as any;
  assert(postErr.error?.code === -32001, 'Should return JSON-RPC 401 error code -32001');
}

// ============================================================================
// 2. CORS Preflight & Streamable SSE Transport tests
// ============================================================================
console.log('Testing 2: CORS Preflight & Streamable SSE Transport...');

// 2a. OPTIONS /api/mcp preflight
{
  const req = new Request('http://localhost/api/mcp', { method: 'OPTIONS' });
  const res = await worker.fetch(req, testEnv, {} as any);
  assert(res.status === 204, 'OPTIONS /api/mcp should return 204');
  assert(res.headers.get('Access-Control-Allow-Origin') === '*', 'CORS Allow-Origin should be *');
  assert(res.headers.get('Access-Control-Allow-Methods')?.includes('POST') === true, 'CORS Allow-Methods should include POST');
}

// 2b. Streamable SSE GET /api/mcp returns 405 & info GET returns 200
{
  const req = new Request('http://localhost/api/mcp?apiKey=' + apiKeyRaw, {
    method: 'GET',
    headers: { Accept: 'text/event-stream' },
  });
  const res = await worker.fetch(req, testEnv, {} as any);
  assert(res.status === 405, 'SSE GET /api/mcp should return 405');
  assert(res.headers.get('Allow')?.includes('POST') === true, 'Allow header should include POST');
  const body = (await res.json()) as any;
  assert(body.error?.code === -32000, 'SSE GET /api/mcp error code should be -32000');

  const infoReq = new Request('http://localhost/api/mcp?apiKey=' + apiKeyRaw, {
    method: 'GET',
  });
  const infoRes = await worker.fetch(infoReq, testEnv, {} as any);
  assert(infoRes.status === 200, 'Standard GET /api/mcp should return 200');
  const infoBody = (await infoRes.json()) as any;
  assert(infoBody.ok === true, 'Standard GET /api/mcp should return ok === true');
}

// ============================================================================
// 3. JSON-RPC Protocol Core: initialize, ping, notifications, tools/list
// ============================================================================
console.log('Testing 3: JSON-RPC Protocol Core...');

// 3a. initialize
{
  const req = new Request('http://localhost/api/mcp', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKeyRaw}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 'init-1',
      method: 'initialize',
      params: { protocolVersion: '2024-11-05' },
    }),
  });
  const res = await worker.fetch(req, testEnv, {} as any);
  assert(res.status === 200, 'POST initialize should return 200');
  const data = await res.json() as any;
  assert(data.id === 'init-1', 'JSON-RPC id should match init-1');
  assert(data.result?.serverInfo?.name === 'easyschemedit-mcp', 'serverInfo name should match');
  assert(data.result?.capabilities?.tools?.listChanged === true, 'capabilities should declare tools support');
}

// 3b. ping
{
  const req = new Request('http://localhost/api/mcp', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKeyRaw}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 2,
      method: 'ping',
    }),
  });
  const res = await worker.fetch(req, testEnv, {} as any);
  const data = await res.json() as any;
  assert(data.id === 2 && data.result, 'Ping should return empty result object');
}

// 3c. Notification (notifications/initialized)
{
  const req = new Request('http://localhost/api/mcp', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKeyRaw}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'notifications/initialized',
    }),
  });
  const res = await worker.fetch(req, testEnv, {} as any);
  assert(res.status === 202, 'Notification without ID should return 202 Accepted');
}

// 3d. tools/list
{
  const req = new Request('http://localhost/api/mcp', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKeyRaw}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/list',
    }),
  });
  const res = await worker.fetch(req, testEnv, {} as any);
  const data = await res.json() as any;
  assert(Array.isArray(data.result?.tools), 'tools/list should return tools array');
  assert(data.result.tools.length >= 50, `Tool catalog should contain >= 50 tools (found ${data.result.tools.length})`);

  // Verify key tool presence
  const names = new Set(data.result.tools.map((t: any) => t.name));
  assert(names.has('generate_structure'), 'Catalog must include generate_structure');
  assert(names.has('generate_shape'), 'Catalog must include generate_shape');
  assert(names.has('build_blueprint'), 'Catalog must include build_blueprint');
  assert(names.has('fill_selection'), 'Catalog must include fill_selection');
  assert(names.has('create_selection'), 'Catalog must include create_selection');
  assert(names.has('transform_placement'), 'Catalog must include transform_placement');
}

// ============================================================================
// 4. Account & Workspace Tools
// ============================================================================
console.log('Testing 4: Account & Workspace Tools...');

let testProjectId = '';
let testSchematicId = '';

// 4a. get_account_info
{
  const req = new Request('http://localhost/api/mcp', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKeyRaw}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 10,
      method: 'tools/call',
      params: { name: 'get_account_info', arguments: {} },
    }),
  });
  const res = await worker.fetch(req, testEnv, {} as any);
  const body = await res.json() as any;
  const toolResult = JSON.parse(body.result.content[0].text);
  assert(toolResult.ok === true, 'get_account_info should succeed');
  assert(toolResult.projectCount === 0, 'Initial project count should be 0');
}

// 4b. create_project
{
  const req = new Request('http://localhost/api/mcp', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKeyRaw}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 11,
      method: 'tools/call',
      params: {
        name: 'create_project',
        arguments: { name: 'Highlands Fortress', initialSchematicName: 'Keep Core' },
      },
    }),
  });
  const res = await worker.fetch(req, testEnv, {} as any);
  const body = await res.json() as any;
  const toolResult = JSON.parse(body.result.content[0].text);
  assert(toolResult.ok === true, 'create_project should succeed');
  assert(toolResult.project?.name === 'Highlands Fortress', 'Project name should match');
  assert(toolResult.schematic?.name === 'Keep Core', 'Initial schematic name should match');
  testProjectId = toolResult.project.id;
  testSchematicId = toolResult.schematic.id;
}

// 4c. list_workspace
{
  const req = new Request('http://localhost/api/mcp', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKeyRaw}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 12,
      method: 'tools/call',
      params: { name: 'list_workspace', arguments: {} },
    }),
  });
  const res = await worker.fetch(req, testEnv, {} as any);
  const body = await res.json() as any;
  const toolResult = JSON.parse(body.result.content[0].text);
  assert(toolResult.ok === true, 'list_workspace should succeed');
  assert(toolResult.projects.length === 1, 'Should contain 1 project');
  assert(toolResult.projects[0].schematics.length === 1, 'Project should contain 1 schematic');
}

// 4d. create_schematic
{
  const req = new Request('http://localhost/api/mcp', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKeyRaw}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 13,
      method: 'tools/call',
      params: {
        name: 'create_schematic',
        arguments: { projectId: testProjectId, name: 'North Watchtower' },
      },
    }),
  });
  const res = await worker.fetch(req, testEnv, {} as any);
  const body = await res.json() as any;
  const toolResult = JSON.parse(body.result.content[0].text);
  assert(toolResult.ok === true, 'create_schematic should succeed');
  assert(toolResult.schematic?.name === 'North Watchtower', 'Schematic name should match');
  testSchematicId = toolResult.schematic.id; // active schematic is now North Watchtower
}

// ============================================================================
// 5. Procedural Build Generation Tools: house, tower, sphere, blueprint
// ============================================================================
console.log('Testing 5: Procedural Build Generation Engine...');

let towerPlacementId = '';

// 5a. generate_structure: medieval house
{
  const req = new Request('http://localhost/api/mcp', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKeyRaw}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 20,
      method: 'tools/call',
      params: {
        name: 'generate_structure',
        arguments: {
          kind: 'house',
          style: 'medieval',
          position: [0, 64, 0],
          placementName: 'Village Manor',
        },
      },
    }),
  });
  const res = await worker.fetch(req, testEnv, {} as any);
  const body = await res.json() as any;
  const toolResult = JSON.parse(body.result.content[0].text);
  assert(toolResult.ok === true, 'generate_structure house should succeed');
  assert(toolResult.changedCells > 100, `House should generate non-trivial voxels (got ${toolResult.changedCells})`);
  assert(toolResult.revision > 1, 'Schematic revision should increment');
}

// 5b. generate_structure: deepslate tower
{
  const req = new Request('http://localhost/api/mcp', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKeyRaw}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 21,
      method: 'tools/call',
      params: {
        name: 'generate_structure',
        arguments: {
          kind: 'tower',
          style: 'deepslate',
          position: [30, 64, 0],
          placementName: 'Spire of Midnight',
        },
      },
    }),
  });
  const res = await worker.fetch(req, testEnv, {} as any);
  const body = await res.json() as any;
  const toolResult = JSON.parse(body.result.content[0].text);
  assert(toolResult.ok === true, 'generate_structure tower should succeed');
  assert(toolResult.placementId, 'Should return placementId');
  towerPlacementId = toolResult.placementId;
}

// 5c. generate_shape: hollow glass sphere
{
  const req = new Request('http://localhost/api/mcp', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKeyRaw}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 22,
      method: 'tools/call',
      params: {
        name: 'generate_shape',
        arguments: {
          kind: 'sphere',
          block: 'minecraft:glass',
          radius: 5,
          center: [0, 80, 0],
          hollow: true,
          placementName: 'Observatory Dome',
        },
      },
    }),
  });
  const res = await worker.fetch(req, testEnv, {} as any);
  const body = await res.json() as any;
  const toolResult = JSON.parse(body.result.content[0].text);
  assert(toolResult.ok === true, 'generate_shape sphere should succeed');
  assert(toolResult.changedCells > 50, 'Sphere should generate blocks');
}

// 5d. build_blueprint: multi-step blueprint
{
  const req = new Request('http://localhost/api/mcp', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKeyRaw}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 23,
      method: 'tools/call',
      params: {
        name: 'build_blueprint',
        arguments: {
          name: 'Arch Gate',
          steps: [
            {
              kind: 'box',
              center: [10, 64, 10],
              size: [6, 1, 6],
              block: 'minecraft:smooth_stone',
            },
            {
              kind: 'arch',
              center: [10, 65, 10],
              width: 5,
              height: 5,
              depth: 2,
              block: 'minecraft:stone_bricks',
            },
          ],
        },
      },
    }),
  });
  const res = await worker.fetch(req, testEnv, {} as any);
  const body = await res.json() as any;
  const toolResult = JSON.parse(body.result.content[0].text);
  assert(toolResult.ok === true, 'build_blueprint should succeed');
  assert(toolResult.changedCells > 10, 'Blueprint should generate blocks');
}

// ============================================================================
// 6. Placement Composition & Movement
// ============================================================================
console.log('Testing 6: Placement Composition & Transforms...');

// 6a. list_placements
{
  const req = new Request('http://localhost/api/mcp', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKeyRaw}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 30,
      method: 'tools/call',
      params: { name: 'list_placements', arguments: {} },
    }),
  });
  const res = await worker.fetch(req, testEnv, {} as any);
  const body = await res.json() as any;
  const toolResult = JSON.parse(body.result.content[0].text);
  assert(toolResult.ok === true, 'list_placements should succeed');
  assert(toolResult.placements.length >= 4, `Should list all created placements (got ${toolResult.placements.length})`);
}

// 6b. transform_placement (relative offset + 90 deg rotation)
{
  const req = new Request('http://localhost/api/mcp', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKeyRaw}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 31,
      method: 'tools/call',
      params: {
        name: 'transform_placement',
        arguments: {
          placementId: towerPlacementId,
          offset: [15, 0, 10],
          rotation: '90',
        },
      },
    }),
  });
  const res = await worker.fetch(req, testEnv, {} as any);
  const body = await res.json() as any;
  const toolResult = JSON.parse(body.result.content[0].text);
  assert(toolResult.ok === true, 'transform_placement should succeed');
  assert(toolResult.transform?.rotationY === 90, 'Rotation should be 90');
}

// 6c. duplicate_placement (clone tower)
{
  const req = new Request('http://localhost/api/mcp', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKeyRaw}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 32,
      method: 'tools/call',
      params: {
        name: 'duplicate_placement',
        arguments: {
          placementId: towerPlacementId,
          offset: [40, 0, 0],
          name: 'South Watchtower',
        },
      },
    }),
  });
  const res = await worker.fetch(req, testEnv, {} as any);
  const body = await res.json() as any;
  const toolResult = JSON.parse(body.result.content[0].text);
  assert(toolResult.ok === true, 'duplicate_placement should succeed');
  assert(toolResult.newPlacementId, 'Should return newPlacementId');
}

// ============================================================================
// 7. Multi-Region Selections & Sync with 3D Viewport
// ============================================================================
console.log('Testing 7: Multi-Region Selections & Real-Time Sync State...');

let region1Id = '';

// 7a. create_selection (6-tuple bounds [x1,y1,z1,x2,y2,z2])
{
  const req = new Request('http://localhost/api/mcp', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKeyRaw}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 40,
      method: 'tools/call',
      params: {
        name: 'create_selection',
        arguments: {
          bounds: [0, 64, 0, 16, 80, 16],
          name: 'CourtyardArea',
        },
      },
    }),
  });
  const res = await worker.fetch(req, testEnv, {} as any);
  const body = await res.json() as any;
  const toolResult = JSON.parse(body.result.content[0].text);
  assert(toolResult.ok === true, 'create_selection should succeed');
  assert(toolResult.region?.name === 'CourtyardArea', 'Region name should be CourtyardArea');
  assert(toolResult.savedRegions?.length === 1, 'Should have 1 saved region');
  region1Id = toolResult.region.id;
}

// 7b. create_selection (pos1 + pos2)
{
  const req = new Request('http://localhost/api/mcp', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKeyRaw}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 41,
      method: 'tools/call',
      params: {
        name: 'create_selection',
        arguments: {
          pos1: [20, 64, 20],
          pos2: [30, 75, 30],
          name: 'BarracksZone',
        },
      },
    }),
  });
  const res = await worker.fetch(req, testEnv, {} as any);
  const body = await res.json() as any;
  const toolResult = JSON.parse(body.result.content[0].text);
  assert(toolResult.ok === true, 'create_selection with pos1/pos2 should succeed');
  assert(toolResult.savedRegions?.length === 2, 'Should have 2 saved regions');
  assert(toolResult.activeRegionId === toolResult.region.id, 'Active region should switch to newly added');
}

// 7c. get_selection
{
  const req = new Request('http://localhost/api/mcp', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKeyRaw}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 42,
      method: 'tools/call',
      params: { name: 'get_selection', arguments: {} },
    }),
  });
  const res = await worker.fetch(req, testEnv, {} as any);
  const body = await res.json() as any;
  const toolResult = JSON.parse(body.result.content[0].text);
  assert(toolResult.ok === true, 'get_selection should succeed');
  assert(toolResult.savedRegions.length === 2, 'Should return 2 saved regions');
}

// 7d. select_region (switch active selection back to CourtyardArea)
{
  const req = new Request('http://localhost/api/mcp', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKeyRaw}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 43,
      method: 'tools/call',
      params: { name: 'select_region', arguments: { regionId: region1Id } },
    }),
  });
  const res = await worker.fetch(req, testEnv, {} as any);
  const body = await res.json() as any;
  const toolResult = JSON.parse(body.result.content[0].text);
  assert(toolResult.ok === true, 'select_region should succeed');
  assert(toolResult.activeRegionId === region1Id, 'Active region should match CourtyardArea ID');
}

// 7e. Verify GET /api/mcp/sync snapshot returns updated revision and activity logs
{
  const req = new Request('http://localhost/api/mcp/sync', {
    method: 'GET',
    headers: { Authorization: `Bearer ${apiKeyRaw}` },
  });
  const res = await worker.fetch(req, testEnv, {} as any);
  assert(res.status === 200, 'GET /api/mcp/sync should return 200');
  const syncSnap = await res.json() as any;
  assert(syncSnap.activeProjectId === testProjectId, 'activeProjectId should match');
  assert(syncSnap.activeSchematicId === testSchematicId, 'activeSchematicId should match');
  assert(syncSnap.selectionState?.savedRegions?.length === 2, 'Sync selectionState should contain 2 saved regions');
  assert(Array.isArray(syncSnap.recentLogs) && syncSnap.recentLogs.length > 0, 'recentLogs should have entries');
}

// 7f. fill_selection using active selection fallback
{
  const req = new Request('http://localhost/api/mcp', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKeyRaw}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 44,
      method: 'tools/call',
      params: {
        name: 'fill_selection',
        arguments: { blockType: 'minecraft:cobblestone' },
      },
    }),
  });
  const res = await worker.fetch(req, testEnv, {} as any);
  const body = await res.json() as any;
  const toolResult = JSON.parse(body.result.content[0].text);
  assert(toolResult.ok === true, 'fill_selection should succeed using active selection fallback');
  assert(toolResult.changedCells > 0, 'Should fill blocks in active selection');
}

// 7g. remove_region (remove CourtyardArea)
{
  const req = new Request('http://localhost/api/mcp', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKeyRaw}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 45,
      method: 'tools/call',
      params: { name: 'remove_region', arguments: { regionId: region1Id } },
    }),
  });
  const res = await worker.fetch(req, testEnv, {} as any);
  const body = await res.json() as any;
  const toolResult = JSON.parse(body.result.content[0].text);
  assert(toolResult.ok === true, 'remove_region should succeed');
  assert(toolResult.remainingCount === 1, 'Should have 1 remaining saved region');
}

// 7h. create_selection preserves previously saved regions by default and updates in place when matching existing name
{
  // 1 remaining region from 7g (BarracksZone)
  // Add a 2nd region without replaceExisting
  const req = new Request('http://localhost/api/mcp', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKeyRaw}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 46,
      method: 'tools/call',
      params: {
        name: 'create_selection',
        arguments: {
          bounds: [40, 64, 40, 50, 75, 50],
          name: 'WatchtowerZone',
        },
      },
    }),
  });
  const res = await worker.fetch(req, testEnv, {} as any);
  const body = (await res.json()) as any;
  const toolResult = JSON.parse(body.result.content[0].text);
  assert(toolResult.ok === true, 'create_selection should succeed');
  assert(toolResult.savedRegions?.length === 2, 'Should preserve previous regions and now have 2 saved regions');
  const names = toolResult.savedRegions.map((r: any) => r.name);
  assert(names.includes('BarracksZone'), 'Should still include BarracksZone');
  assert(names.includes('WatchtowerZone'), 'Should include WatchtowerZone');

  // Updating existing region by exact name updates it in-place without duplicating
  const reqUpdate = new Request('http://localhost/api/mcp', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKeyRaw}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 47,
      method: 'tools/call',
      params: {
        name: 'create_selection',
        arguments: {
          pos1: [40, 64, 40],
          pos2: [55, 80, 55],
          name: 'WatchtowerZone',
        },
      },
    }),
  });
  const resUpdate = await worker.fetch(reqUpdate, testEnv, {} as any);
  const bodyUpdate = (await resUpdate.json()) as any;
  const toolResultUpdate = JSON.parse(bodyUpdate.result.content[0].text);
  assert(toolResultUpdate.ok === true, 'update existing selection should succeed');
  assert(toolResultUpdate.savedRegions?.length === 2, 'Updating existing region name should preserve count at 2');
}

// 7i. transform_placement automatically translates/transforms selection state and saved regions
{
  const req = new Request('http://localhost/api/mcp', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKeyRaw}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 48,
      method: 'tools/call',
      params: {
        name: 'transform_placement',
        arguments: {
          placementId: towerPlacementId,
          offset: [10, 5, -10],
        },
      },
    }),
  });
  const res = await worker.fetch(req, testEnv, {} as any);
  const body = (await res.json()) as any;
  const toolResult = JSON.parse(body.result.content[0].text);
  assert(toolResult.ok === true, 'transform_placement should succeed');
  assert(toolResult.selectionState, 'transform_placement should return transformed selectionState');
  assert(Array.isArray(toolResult.selectionState.savedRegions), 'selectionState should have savedRegions');
  assert(toolResult.selectionState.savedRegions.length === 2, 'Should preserve 2 saved regions');

  // Verify that the saved regions were shifted by the placement transform
  const watchtower = toolResult.selectionState.savedRegions.find((r: any) => r.name === 'WatchtowerZone');
  assert(watchtower !== undefined, 'WatchtowerZone region should exist');
  // Originally pos1: [40, 64, 40], pos2: [55, 80, 55], offset: [10, 5, -10]
  assert(watchtower.pos1[0] === 50, `pos1.x shifted by 10: expected 50, got ${watchtower.pos1[0]}`);
  assert(watchtower.pos1[1] === 69, `pos1.y shifted by 5: expected 69, got ${watchtower.pos1[1]}`);
  assert(watchtower.pos1[2] === 30, `pos1.z shifted by -10: expected 30, got ${watchtower.pos1[2]}`);
}

// ============================================================================
// 8. Direct REST-style Tool Call Support
// ============================================================================
console.log('Testing 8: Direct REST-style Tool Calls & API Key Revocation...');

// 8a. Direct REST call: { tool: 'get_account_info' }
{
  const req = new Request('http://localhost/api/mcp', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKeyRaw}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      tool: 'get_account_info',
      args: {},
    }),
  });
  const res = await worker.fetch(req, testEnv, {} as any);
  assert(res.status === 200, 'Direct REST tool call should return 200');
  const data = await res.json() as any;
  assert(data.ok === true, 'Direct tool result should have ok: true');
  assert(data.projectCount >= 1, 'Project count should be >= 1');
}

// ============================================================================
// 9. Cloud MCP Clipboard Persistence & Live Sync Round-Trip
// ============================================================================
console.log('Testing 9: Cloud MCP Clipboard Persistence & Live Sync...');

// 9a. cut_selection cuts voxels and persists clipboardState
{
  const req = new Request('http://localhost/api/mcp', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKeyRaw}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 50,
      method: 'tools/call',
      params: {
        name: 'cut_selection',
        arguments: { bounds: [0, 64, 0, 5, 68, 5] },
      },
    }),
  });
  const res = await worker.fetch(req, testEnv, {} as any);
  const body = await res.json() as any;
  const toolResult = JSON.parse(body.result.content[0].text);
  assert(toolResult.ok === true, 'cut_selection should succeed');
  assert(toolResult.cut === true, 'cut_selection cut flag should be true');
  assert(toolResult.revision > 1, 'Schematic revision should increment on cut');
}

// 9b. GET /api/mcp/sync returns persisted clipboardState
{
  const req = new Request('http://localhost/api/mcp/sync', {
    method: 'GET',
    headers: { Authorization: `Bearer ${apiKeyRaw}` },
  });
  const res = await worker.fetch(req, testEnv, {} as any);
  assert(res.status === 200, 'GET /api/mcp/sync should return 200');
  const syncSnap = await res.json() as any;
  assert(syncSnap.clipboardState, 'Snapshot should include clipboardState');
  assert(Array.isArray(syncSnap.clipboardState.entries), 'clipboardState should have entries array');
  assert(syncSnap.clipboardState.entries.length > 0, 'clipboardState entries should not be empty');
  assert(typeof syncSnap.clipboardState.updatedAt === 'string', 'clipboardState should have updatedAt ISO string');
}

// 9c. paste_clipboard pastes from persisted clipboard state at targetOrigin
{
  const req = new Request('http://localhost/api/mcp', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKeyRaw}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 51,
      method: 'tools/call',
      params: {
        name: 'paste_clipboard',
        arguments: { targetOrigin: [0, 64, 0] },
      },
    }),
  });
  const res = await worker.fetch(req, testEnv, {} as any);
  const body = await res.json() as any;
  const toolResult = JSON.parse(body.result.content[0].text);
  assert(toolResult.ok === true, 'paste_clipboard should succeed');
  assert(toolResult.pasted === true, 'paste_clipboard pasted flag should be true');
  assert(toolResult.changedCells > 0, 'paste_clipboard should change cells');
  assert(toolResult.revision > 1, 'Schematic revision should increment on paste');
}

// 9d. copy_selection updates clipboardState without mutating schematic volume
{
  const req = new Request('http://localhost/api/mcp', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKeyRaw}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 52,
      method: 'tools/call',
      params: {
        name: 'copy_selection',
        arguments: { bounds: [0, 64, 0, 5, 68, 5] },
      },
    }),
  });
  const res = await worker.fetch(req, testEnv, {} as any);
  const body = await res.json() as any;
  const toolResult = JSON.parse(body.result.content[0].text);
  assert(toolResult.ok === true, 'copy_selection should succeed');
  assert(toolResult.copied === true, 'copy_selection copied flag should be true');

  // Verify GET /api/mcp/sync returns newly updated clipboardState
  const syncReq = new Request('http://localhost/api/mcp/sync', {
    method: 'GET',
    headers: { Authorization: `Bearer ${apiKeyRaw}` },
  });
  const syncRes = await worker.fetch(syncReq, testEnv, {} as any);
  const syncSnap = await syncRes.json() as any;
  assert(syncSnap.clipboardState?.entries?.length >= 2, 'clipboardState should have accumulated entries from cut_selection and copy_selection');
}

// 9e. multiple copy_selection calls across separate requests preserve and accumulate entries
{
  const req = new Request('http://localhost/api/mcp', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKeyRaw}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 53,
      method: 'tools/call',
      params: {
        name: 'copy_selection',
        arguments: { bounds: [10, 64, 10, 15, 68, 15] },
      },
    }),
  });
  const res = await worker.fetch(req, testEnv, {} as any);
  const body = (await res.json()) as any;
  const toolResult = JSON.parse(body.result.content[0].text);
  assert(toolResult.ok === true, 'second copy_selection should succeed');

  const syncReq = new Request('http://localhost/api/mcp/sync', {
    method: 'GET',
    headers: { Authorization: `Bearer ${apiKeyRaw}` },
  });
  const syncRes = await worker.fetch(syncReq, testEnv, {} as any);
  const syncSnap = (await syncRes.json()) as any;
  assert(
    syncSnap.clipboardState?.entries?.length >= 3,
    `clipboardState should accumulate previous clipboard entries across requests, got ${syncSnap.clipboardState?.entries?.length}`
  );
}

// ============================================================================
// 10. Visual & Structural Intelligence Engine & Multimodal MCP Tests
// ============================================================================
console.log('Testing 10: Visual & Structural Intelligence Engine & Multimodal MCP...');

// 10a. Catalog includes analyze_structures, render_schematic_view, select_structure
{
  const req = new Request('http://localhost/api/mcp', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKeyRaw}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 60,
      method: 'tools/list',
    }),
  });
  const res = await worker.fetch(req, testEnv, {} as any);
  const body = (await res.json()) as any;
  const toolNames = new Set(body.result.tools.map((t: any) => t.name));
  assert(toolNames.has('analyze_structures'), 'tools/list must include analyze_structures');
  assert(toolNames.has('render_schematic_view'), 'tools/list must include render_schematic_view');
  assert(toolNames.has('select_structure'), 'tools/list must include select_structure');
}

// 10b. get_schematic_info returns visual/structural intelligence fields
{
  const req = new Request('http://localhost/api/mcp', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKeyRaw}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 61,
      method: 'tools/call',
      params: {
        name: 'get_schematic_info',
        arguments: {},
      },
    }),
  });
  const res = await worker.fetch(req, testEnv, {} as any);
  const body = (await res.json()) as any;
  const toolResult = JSON.parse(body.result.content[0].text);
  assert(toolResult.ok === true, 'get_schematic_info should succeed');
  assert(typeof toolResult.groundLevelY === 'number', 'Should include groundLevelY');
  assert(typeof toolResult.structureCount === 'number', 'Should include structureCount');
  assert(Array.isArray(toolResult.structures), 'Should include structures array');
  assert(toolResult.environment && typeof toolResult.environment === 'object', 'Should include environment summary');
  assert(toolResult.spatialMap && Array.isArray(toolResult.spatialMap.grid), 'Should include spatialMap grid');
  assert(toolResult.placements && toolResult.placements.length > 0, 'Should preserve placements');
}

// 10c. inspect_region returns structures, spatialMap, and multimodal MCP ImageContent
{
  const req = new Request('http://localhost/api/mcp', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKeyRaw}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 62,
      method: 'tools/call',
      params: {
        name: 'inspect_region',
        arguments: { bounds: [0, 60, 0, 40, 95, 40], view: 'composite' },
      },
    }),
  });
  const res = await worker.fetch(req, testEnv, {} as any);
  const body = (await res.json()) as any;
  assert(Array.isArray(body.result.content), 'Content should be array');
  assert(body.result.content.length >= 2, 'Content should include text + image elements');

  const textElem = body.result.content.find((c: any) => c.type === 'text');
  assert(textElem, 'Content must have text element');
  const toolResult = JSON.parse(textElem.text);
  assert(toolResult.ok === true, 'inspect_region should succeed');
  assert(typeof toolResult.nonAirCount === 'number', 'Should preserve nonAirCount');
  assert(typeof toolResult.groundLevelY === 'number', 'Should include groundLevelY');
  assert(toolResult.renderView && toolResult.renderView.view === 'composite', 'Should include renderView');

  const imageElem = body.result.content.find((c: any) => c.type === 'image');
  assert(imageElem, 'Content must have image element');
  assert(imageElem.mimeType === 'image/png', 'Image mimeType should be image/png');
  assert(typeof imageElem.data === 'string' && imageElem.data.startsWith('iVBORw0KGgo'), 'Image data should be valid PNG base64');
}

// 10c-2. Oversized work-size args are clamped to the Cloudflare Worker budget
{
  const req = new Request('http://localhost/api/mcp', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKeyRaw}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 68,
      method: 'tools/call',
      params: {
        name: 'inspect_region',
        arguments: {
          bounds: [0, 60, 0, 40, 95, 40],
          maxBlocks: 200000,
          maxStructures: 200000,
          width: 200000,
          height: 200000,
        },
      },
    }),
  });
  const res = await worker.fetch(req, testEnv, {} as any);
  const body = (await res.json()) as any;
  const textElem = body.result.content.find((c: any) => c.type === 'text');
  const toolResult = JSON.parse(textElem.text);
  assert(toolResult.ok === true, 'inspect_region with oversized args should succeed');
  assert(Array.isArray(toolResult.blocks) && toolResult.blocks.length <= 4096, 'blocks must be capped at 4096');
  assert(typeof toolResult.structureCount === 'number' && toolResult.structureCount <= 100, 'structureCount must be capped at 100');
  assert(toolResult.renderView && toolResult.renderView.width <= 1280 && toolResult.renderView.height <= 1280, 'render dimensions must be capped at 1280');
  assert(toolResult.renderView.width * toolResult.renderView.height <= 1280 * 720, 'render pixel budget must be respected');
  assert(toolResult.countsByBlock && typeof toolResult.countsByBlock === 'object', 'countsByBlock must be preserved');
  assert(toolResult.environment && typeof toolResult.environment === 'object', 'environment must be preserved');
  assert(Array.isArray(toolResult.structures), 'structures must be preserved');
}

// 10d. analyze_structures segments structures, renders PNG, and saves regions
{
  const req = new Request('http://localhost/api/mcp', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKeyRaw}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 63,
      method: 'tools/call',
      params: {
        name: 'analyze_structures',
        arguments: { saveRegions: true, includeRender: true, view: 'composite' },
      },
    }),
  });
  const res = await worker.fetch(req, testEnv, {} as any);
  const body = (await res.json()) as any;
  const textElem = body.result.content.find((c: any) => c.type === 'text');
  const toolResult = JSON.parse(textElem.text);
  assert(toolResult.ok === true, 'analyze_structures should succeed');
  assert(toolResult.structureCount > 0, 'Should detect at least 1 structure');
  assert(Array.isArray(toolResult.structures), 'Should return structures');
  assert(toolResult.renderView?.view === 'composite', 'renderView should be composite');

  const imageElem = body.result.content.find((c: any) => c.type === 'image');
  assert(imageElem && imageElem.data.startsWith('iVBORw0KGgo'), 'analyze_structures should return PNG image content');

  // Verify regions were saved to user sync state
  const syncReq = new Request('http://localhost/api/mcp/sync', {
    method: 'GET',
    headers: { Authorization: `Bearer ${apiKeyRaw}` },
  });
  const syncRes = await worker.fetch(syncReq, testEnv, {} as any);
  const syncSnap = (await syncRes.json()) as any;
  assert(Array.isArray(syncSnap.selectionState?.savedRegions), 'Should have savedRegions in sync state');
  assert(syncSnap.selectionState.savedRegions.length > 0, 'savedRegions should contain detected structures');
}

// 10e. render_schematic_view renders perspective view zoomed to matched structure
{
  const req = new Request('http://localhost/api/mcp', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKeyRaw}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 64,
      method: 'tools/call',
      params: {
        name: 'render_schematic_view',
        arguments: { structureId: 'S1', view: 'isometric', width: 600, height: 400 },
      },
    }),
  });
  const res = await worker.fetch(req, testEnv, {} as any);
  const body = (await res.json()) as any;
  const textElem = body.result.content.find((c: any) => c.type === 'text');
  const toolResult = JSON.parse(textElem.text);
  assert(toolResult.ok === true, 'render_schematic_view should succeed');
  assert(toolResult.view === 'isometric', 'View should be isometric');
  assert(toolResult.width === 600 && toolResult.height === 400, 'Dimensions should match requested');

  const imageElem = body.result.content.find((c: any) => c.type === 'image');
  assert(imageElem && imageElem.data.startsWith('iVBORw0KGgo'), 'render_schematic_view should return PNG base64');
}

// 10f. select_structure selects structure by ID, name, or query
{
  const req = new Request('http://localhost/api/mcp', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKeyRaw}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 65,
      method: 'tools/call',
      params: {
        name: 'select_structure',
        arguments: { query: 'S1' },
      },
    }),
  });
  const res = await worker.fetch(req, testEnv, {} as any);
  const body = (await res.json()) as any;
  const toolResult = JSON.parse(body.result.content[0].text);
  assert(toolResult.ok === true, 'select_structure with S1 should succeed');
  assert(toolResult.structure?.id === 'S1', 'Should match structure S1');
  assert(toolResult.selectionState?.activeRegionId === 'S1', 'activeRegionId should be S1');
  assert(
    toolResult.selectionState?.savedRegions && toolResult.selectionState.savedRegions.length > 1,
    'select_structure should preserve existing user regions in savedRegions by default'
  );
  assert(
    toolResult.selectionState.savedRegions.some((r: any) => r.id === 'S1'),
    'select_structure should include newly selected structure S1 in savedRegions'
  );

  // Query "largest"
  const reqLargest = new Request('http://localhost/api/mcp', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKeyRaw}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 66,
      method: 'tools/call',
      params: {
        name: 'select_structure',
        arguments: { query: 'largest' },
      },
    }),
  });
  const resLargest = await worker.fetch(reqLargest, testEnv, {} as any);
  const bodyLargest = (await resLargest.json()) as any;
  const resultLargest = JSON.parse(bodyLargest.result.content[0].text);
  assert(resultLargest.ok === true, 'select_structure largest should succeed');
  assert(resultLargest.structure && resultLargest.structure.voxelCount > 0, 'Largest structure should have voxels');

  // Query non-existent structure
  const reqMissing = new Request('http://localhost/api/mcp', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKeyRaw}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 67,
      method: 'tools/call',
      params: {
        name: 'select_structure',
        arguments: { query: 'non_existent_fortress_xyz' },
      },
    }),
  });
  const resMissing = await worker.fetch(reqMissing, testEnv, {} as any);
  const bodyMissing = (await resMissing.json()) as any;
  const resultMissing = JSON.parse(bodyMissing.result.content[0].text);
  assert(resultMissing.ok === false, 'Non-existent structure should return ok: false');
}

// 10g. GET /api/mcp/render returns raw PNG image with Content-Type: image/png
{
  const req = new Request('http://localhost/api/mcp/render?view=composite', {
    method: 'GET',
    headers: { Authorization: `Bearer ${apiKeyRaw}` },
  });
  const res = await worker.fetch(req, testEnv, {} as any);
  assert(res.status === 200, 'GET /api/mcp/render should return 200');
  assert(res.headers.get('content-type') === 'image/png', 'Content-Type must be image/png');
  const buffer = await res.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  assert(bytes.length > 50, 'PNG response should be non-empty');
  // Check PNG magic header: 137, 80, 78, 71, 13, 10, 26, 10
  assert(bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71, 'Valid PNG header');

  // Test with structureId and top view
  const reqSt = new Request('http://localhost/api/mcp/render?view=top&structureId=S1', {
    method: 'GET',
    headers: { Authorization: `Bearer ${apiKeyRaw}` },
  });
  const resSt = await worker.fetch(reqSt, testEnv, {} as any);
  assert(resSt.status === 200, 'GET /api/mcp/render with structureId should return 200');
  assert(resSt.headers.get('content-type') === 'image/png', 'Content-Type must be image/png');
}

// 8b. Revoke API Key: DELETE /api/mcp/keys/:id
{
  const req = new Request(`http://localhost/api/mcp/keys/${apiKeyId}`, {
    method: 'DELETE',
    headers: { Cookie: `ese_session=${sessionToken}` },
  });
  const res = await worker.fetch(req, testEnv, {} as any);
  assert(res.status === 200, 'DELETE /api/mcp/keys/:id should return 200');

  // Verify calling /api/mcp with revoked key now returns 401
  const reqRevoked = new Request('http://localhost/api/mcp', {
    method: 'GET',
    headers: { Authorization: `Bearer ${apiKeyRaw}` },
  });
  const resRevoked = await worker.fetch(reqRevoked, testEnv, {} as any);
  assert(resRevoked.status === 401, 'Revoked API key should be rejected with 401');
}

console.log('✓ All Slice M2 Cloud MCP Server tests passed successfully!');
